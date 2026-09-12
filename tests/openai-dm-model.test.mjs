import assert from "node:assert/strict";
import test from "node:test";

import { getGameToolDefinitions } from "../dist/game-tools.js";
import {
  OPENAI_DM_DEFAULT_TIMEOUT_MS,
  OpenAiDmError,
  createOpenAiDmModel,
} from "../dist/openai-dm-model.js";
import { playGame } from "../dist/play.js";
import { createSession } from "../dist/session.js";

function request(overrides = {}) {
  const state = createSession();
  return {
    promptVersion: "stolen-signet-dm-v3",
    systemPrompt: "Dungeon master instructions",
    playerInput: "Open the door",
    transcript: [],
    scene: {
      adventure: {
        title: "The Stolen Signet",
        objective: "Recover the signet.",
      },
      location: {
        id: "entrance",
        name: "Entrance",
        description: "A ruined entrance.",
      },
      features: [],
      items: [],
      opponents: [],
      exits: [],
      outcome: "playing",
    },
    characterStatus: {
      hp: 20,
      maxHp: 20,
      equipment: [],
      collectedItems: [],
      outcome: "playing",
    },
    tools: getGameToolDefinitions(state),
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
    name: "open",
    arguments: '{"door_id":"entrance-door"}',
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
              text: "The door opens.",
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
        name: "open",
        argumentsJson: '{"door_id":"entrance-door"}',
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
            name: "open",
            argumentsJson: '{"door_id":"entrance-door"}',
          },
          output: { ok: true, events: [{ type: "door-opened" }] },
        },
      ],
    }),
  );
  assert.equal(second.text, "The door opens.");
  assert.equal(second.provider.responseId, "resp_2");
  assert.ok(requests[1].body.input.includes(reasoning));
  assert.ok(requests[1].body.input.includes(functionCall));
  const outputs = requests[1].body.input.filter(
    (item) => item.type === "function_call_output",
  );
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].call_id, "call_1");
  assert.match(outputs[0].output, /door-opened/);
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

test("terminal recovers after adapter failures before and after one committed action", async () => {
  const providerSecret = "provider-secret-should-not-escape";
  const responses = [
    { status: 401, message: providerSecret },
    completedResponse([
      {
        id: "item_open",
        type: "function_call",
        call_id: "call_open",
        name: "open",
        arguments: '{"door_id":"entrance-door"}',
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
          if (
            response instanceof Error ||
            response?.status === 401 ||
            response?.status === 503
          ) {
            throw response;
          }
          return response;
        },
      },
    },
  });
  let output = "";
  let closed = false;
  const lines = {
    close() {
      closed = true;
    },
    prompt() {},
    async *[Symbol.asyncIterator]() {
      for (const line of [
        "Try once",
        "Open the door",
        "Can I continue?",
        "quit",
      ]) {
        if (closed) {
          return;
        }
        yield line;
      }
    },
  };

  await playGame(
    { seed: 0, dmModel: model },
    {
      lines,
      terminal: true,
      write(text) {
        output += text;
      },
    },
  );

  assert.equal(
    (output.match(/couldn't complete that request safely/gi) ?? []).length,
    1,
  );
  assert.match(output, /You open the wooden door/i);
  assert.match(output, /No further action was executed/i);
  assert.match(output, /You can continue after the interruption/i);
  assert.doesNotMatch(output, new RegExp(providerSecret));
});
