import assert from "node:assert/strict";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import {
  OPENAI_DM_DEFAULT_TIMEOUT_MS,
  OpenAiDmError,
  createOpenAiDmModel,
  probeReasoningEfforts,
} from "../dist/openai-dm-model.js";
import { supportedEffortsFrom } from "../dist/openai-dm-models.js";
import { counterRuntime } from "./fixtures/counter-runtime.mjs";

const runtime = counterRuntime();

function request(overrides = {}) {
  const state = runtime.createSession();
  return {
    promptVersion: runtime.promptVersion,
    systemPrompt: "Dungeon master instructions",
    playerInput: "Advance the counter",
    transcript: [],
    scene: runtime.projectDmScene(state),
    characterStatus: runtime.projectCharacterStatus(state),
    tools: runtime.getGameToolDefinitions(state),
    toolResults: [],
    ...overrides,
  };
}

function completedResponse(output, overrides = {}) {
  return {
    id: "resp_1",
    model: "test-model",
    status: "completed",
    output,
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    ...overrides,
  };
}

test("Responses adapter sends stateless strict calls and normalizes provider output", async () => {
  const requests = [];
  const reasoning = {
    id: "reasoning_1",
    type: "reasoning",
    encrypted_content: "opaque-provider-state",
    summary: [],
  };
  const functionCall = {
    id: "item_1",
    type: "function_call",
    call_id: "call_1",
    name: "advance",
    arguments: "{}",
    status: "completed",
  };
  const responses = [
    completedResponse([reasoning, functionCall]),
    completedResponse(
      [
        {
          id: "message_1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "The counter clicks forward.",
              annotations: [],
            },
          ],
        },
      ],
      { id: "resp_2" },
    ),
  ];
  const client = {
    responses: {
      async create(body, options) {
        requests.push({ body, options });
        return responses.shift();
      },
    },
  };
  const model = createOpenAiDmModel({
    apiKey: "not-forwarded-to-injected-client",
    model: "test-model",
    client,
  });

  const first = await model.respond(request());
  assert.deepEqual(first, {
    toolCalls: [
      {
        id: "call_1",
        name: "advance",
        argumentsJson: "{}",
      },
    ],
    provider: {
      responseId: "resp_1",
      model: "test-model",
      status: "completed",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    },
  });
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.parallel_tool_calls, false);
  assert.equal(requests[0].body.previous_response_id, undefined);
  assert.equal(requests[0].body.conversation, undefined);
  assert.ok(requests[0].body.tools.every((tool) => tool.strict === true));
  assert.ok(requests[0].options.signal instanceof AbortSignal);

  const second = await model.respond(
    request({
      toolResults: [
        {
          call: {
            id: "call_1",
            name: "advance",
            argumentsJson: "{}",
          },
          output: { ok: true, events: [{ type: "advanced", by: 4 }] },
        },
      ],
    }),
  );
  assert.equal(second.text, "The counter clicks forward.");
  assert.equal(second.provider.responseId, "resp_2");
  assert.ok(requests[1].body.input.includes(reasoning));
  assert.ok(requests[1].body.input.includes(functionCall));
  const outputs = requests[1].body.input.filter(
    (item) => item.type === "function_call_output",
  );
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].call_id, "call_1");
  assert.match(outputs[0].output, /advanced/);
  assert.doesNotMatch(JSON.stringify(second), /opaque-provider-state/);

  responses.push(
    completedResponse([
      {
        id: "message_2",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: "A new turn.", annotations: [] },
        ],
      },
    ]),
  );
  await model.respond(request({ playerInput: "Look around" }));
  assert.equal(
    requests[2].body.input.some(
      (item) =>
        item.type === "function_call" ||
        item.type === "function_call_output" ||
        item.type === "reasoning",
    ),
    false,
  );
});

test("Responses adapter rejects malformed responses without exposing raw data", async () => {
  const client = {
    responses: {
      async create() {
        return completedResponse([
          { type: "hosted_tool_call", secret: "provider-secret" },
        ]);
      },
    },
  };
  const model = createOpenAiDmModel({
    apiKey: "secret-key",
    model: "test-model",
    client,
  });

  await assert.rejects(model.respond(request()), (error) => {
    assert.ok(error instanceof OpenAiDmError);
    assert.equal(error.code, "malformed-response");
    assert.equal(error.message, "OpenAI returned a malformed response.");
    assert.doesNotMatch(JSON.stringify(error), /secret/);
    return true;
  });
});

test("Responses adapter preserves allowlisted diagnostics from malformed responses", async () => {
  const model = createOpenAiDmModel({
    apiKey: "secret-key",
    model: "requested-model",
    client: {
      responses: {
        async create() {
          return completedResponse([], {
            id: "resp_failed",
            model: "actual-model",
            status: "incomplete",
            secret: "provider-secret",
          });
        },
      },
    },
  });

  await assert.rejects(model.respond(request()), (error) => {
    assert.ok(error instanceof OpenAiDmError);
    assert.deepEqual(error.evidence, {
      responseId: "resp_failed",
      model: "actual-model",
      status: "incomplete",
    });
    assert.doesNotMatch(JSON.stringify(error), /provider-secret/u);
    return true;
  });
});

test("Responses adapter classifies provider failures and bounds request time", async () => {
  const cases = [
    [{ status: 401, message: "secret auth header" }, "authentication"],
    [{ status: 429, message: "secret limit data" }, "rate-limit"],
    [{ status: 503, message: "secret upstream body" }, "unavailable"],
    [{ name: "APIConnectionError", message: "secret url" }, "unavailable"],
    [{ name: "APIConnectionTimeoutError", message: "secret url" }, "timeout"],
    [new Error("secret unknown provider data"), "unknown"],
  ];

  for (const [providerError, expectedCode] of cases) {
    const model = createOpenAiDmModel({
      apiKey: "secret-key",
      model: "test-model",
      client: {
        responses: {
          async create() {
            throw providerError;
          },
        },
      },
    });
    await assert.rejects(model.respond(request()), (error) => {
      assert.ok(error instanceof OpenAiDmError);
      assert.equal(error.code, expectedCode);
      assert.doesNotMatch(error.message, /secret/i);
      assert.equal("cause" in error, false);
      return true;
    });
  }

  assert.ok(Number.isFinite(OPENAI_DM_DEFAULT_TIMEOUT_MS));
  const timedOut = createOpenAiDmModel({
    apiKey: "secret-key",
    model: "test-model",
    timeoutMs: 5,
    client: { responses: { create: () => new Promise(() => {}) } },
  });
  await assert.rejects(timedOut.respond(request()), {
    code: "timeout",
    message: "OpenAI request timed out.",
  });
});

test("a DM turn recovers after adapter failures before and after one committed action", async () => {
  const providerSecret = "provider-secret-should-not-escape";
  const responses = [
    { status: 401, message: providerSecret },
    completedResponse([
      {
        id: "item_advance",
        type: "function_call",
        call_id: "call_advance",
        name: "advance",
        arguments: "{}",
        status: "completed",
      },
    ]),
    { status: 503, message: providerSecret },
    completedResponse([
      {
        id: "message_recovered",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "You can continue after the interruption.",
            annotations: [],
          },
        ],
      },
    ]),
  ];
  const model = createOpenAiDmModel({
    apiKey: "secret-key",
    model: "test-model",
    client: {
      responses: {
        async create() {
          const response = responses.shift();
          if (response?.status === 401 || response?.status === 503) {
            throw response;
          }
          return response;
        },
      },
    },
  });
  const turn = (state, playerInput) =>
    runDmTurn({
      runtime,
      state,
      playerInput,
      transcript: [],
      random: { roll: () => 4 },
      model,
    });

  const before = await turn(runtime.createSession(), "Try once");
  assert.deepEqual(before.state, runtime.createSession());
  assert.match(before.narration, /couldn't complete that request safely/i);

  const after = await turn(before.state, "Advance the counter");
  assert.deepEqual(after.state, { status: "playing", count: 4 });
  assert.deepEqual(after.mechanics, ["Advanced by 4; the counter reads 4."]);
  assert.match(after.narration, /No further action was executed/i);

  const recovered = await turn(after.state, "Can I continue?");
  assert.equal(recovered.narration, "You can continue after the interruption.");
  assert.doesNotMatch(
    JSON.stringify([before, after, recovered]),
    new RegExp(providerSecret),
  );
});

test("Responses adapter sends the chosen reasoning effort, and waits longer for more thinking (#587)", async () => {
  const sent = [];
  const client = {
    responses: {
      async create(body, options) {
        sent.push({ body, options });
        return completedResponse([
          {
            type: "message",
            content: [{ type: "output_text", text: "Ok." }],
          },
        ]);
      },
    },
  };
  for (const reasoningEffort of [
    undefined,
    "none",
    "medium",
    "high",
    "xhigh",
    "max",
  ]) {
    await createOpenAiDmModel({
      apiKey: "unused",
      model: "test-model",
      client,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    }).respond(request());
  }
  assert.deepEqual(
    sent.map(({ body }) => body.reasoning),
    [
      undefined,
      { effort: "none" },
      { effort: "medium" },
      { effort: "high" },
      { effort: "xhigh" },
      { effort: "max" },
    ],
  );
  assert.ok(!("reasoning" in sent[0].body));
  assert.deepEqual(
    sent.map(({ options }) => options.timeout),
    [OPENAI_DM_DEFAULT_TIMEOUT_MS, 30_000, 30_000, 60_000, 120_000, 120_000],
  );
});

// OpenAI's rejections of an effort, recorded 2026-11-20 (#589).
const rejected = (model, effort, supported) => ({
  status: 400,
  code: "unsupported_value",
  param: "reasoning.effort",
  message: `400 Unsupported value: '${effort}' is not supported with the '${model}' model. Supported values are: ${supported}.`,
});

test("the supported efforts are read from OpenAI's rejection, keeping only offered ones (#589)", () => {
  assert.deepEqual(
    supportedEffortsFrom(
      rejected(
        "gpt-6.2-astra",
        "none",
        "'low', 'medium', 'high', 'xhigh', and 'max'",
      ).message,
    ),
    ["low", "medium", "high", "xhigh", "max"],
  );
  assert.deepEqual(
    supportedEffortsFrom(
      rejected("gpt-5", "none", "'minimal', 'low', 'medium', and 'high'")
        .message,
    ),
    ["low", "medium", "high"],
  );
  assert.equal(
    supportedEffortsFrom("400 Something else went wrong."),
    undefined,
  );
});

test("probing a model's efforts stops at the first rejection, and learns nothing from other failures (#589)", async () => {
  const probe = async (model, answer) => {
    const tried = [];
    const efforts = await probeReasoningEfforts("unused", model, {
      responses: {
        async create(body) {
          tried.push(body.reasoning.effort);
          assert.equal(body.model, model);
          assert.equal(body.store, false);
          return answer(body.reasoning.effort);
        },
      },
    });
    return { efforts, tried };
  };
  assert.deepEqual(
    await probe("gpt-6.2-astra", (effort) => {
      throw rejected(
        "gpt-6.2-astra",
        effort,
        "'low', 'medium', 'high', 'xhigh', and 'max'",
      );
    }),
    { efforts: ["low", "medium", "high", "xhigh", "max"], tried: ["minimal"] },
  );
  // gpt-5 takes minimal, so the probe goes on to none.
  assert.deepEqual(
    await probe("gpt-5", (effort) => {
      if (effort === "minimal") {
        return { status: "incomplete" };
      }
      throw rejected("gpt-5", effort, "'minimal', 'low', 'medium', and 'high'");
    }),
    { efforts: ["low", "medium", "high"], tried: ["minimal", "none"] },
  );
  assert.deepEqual(await probe("gpt-9", () => ({ status: "completed" })), {
    efforts: ["none", "low", "medium", "high", "xhigh", "max"],
    tried: ["minimal", "none", "max"],
  });
  // A value OpenAI doesn't know lists every effort, not the model's.
  for (const failure of [
    {
      status: 400,
      code: "invalid_value",
      param: "reasoning.effort",
      message:
        "400 Invalid value: 'minimal'. Supported values are: 'none', 'low'.",
    },
    { status: 429, message: "Rate limited" },
    new Error("offline"),
  ]) {
    assert.deepEqual(
      await probe("gpt-6-luna", () => {
        throw failure;
      }),
      { efforts: undefined, tried: ["minimal"] },
    );
  }
});

test("a model that rejects the chosen effort tells the player to choose another on Settings (#589)", async () => {
  const model = createOpenAiDmModel({
    apiKey: "unused",
    model: "gpt-6.2-astra",
    reasoningEffort: "none",
    client: {
      responses: {
        async create() {
          throw rejected(
            "gpt-6.2-astra",
            "none",
            "'low', 'medium', 'high', 'xhigh', and 'max'",
          );
        },
      },
    },
  });
  const message =
    "The Dungeon Master's model, gpt-6.2-astra, doesn't take the thinking level None. Choose another on the Settings page.";
  await assert.rejects(model.respond(request()), {
    code: "unsupported-setting",
    playerMessage: message,
  });
  const turn = await runDmTurn({
    runtime,
    state: runtime.createSession(),
    playerInput: "Look around",
    transcript: [],
    random: { roll: () => 4 },
    model,
  });
  assert.equal(turn.narration, message);
  assert.deepEqual(turn.diagnostics, [
    { code: "model-failure", responseNumber: 1 },
  ]);
});
