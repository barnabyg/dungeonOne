// Opt-in provider evidence through the shipped HTTP/save boundary. Never logs credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { startBrowserServer } from "../dist/browser-server.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "../dist/openai-dm-model.js";
import { SaveSession } from "../dist/save.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required.");
}
const output = resolve(
  process.argv[2] ?? ".verify-artifacts/issue-106-live.json",
);
const watchRoute = process.argv[3] === "--watch";
const root = resolve(".verify-artifacts");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "issue-106-live-"));
const savePath = join(directory, "slot.json");
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const provider = createOpenAiDmModel({
  apiKey: process.env.OPENAI_API_KEY,
  model: OPENAI_DM_DEFAULT_MODEL,
});
const report = {
  issue: 106,
  mode: "live",
  requestedModel: OPENAI_DM_DEFAULT_MODEL,
  startedAt: new Date().toISOString(),
  seed: 0,
  maxProviderCalls: watchRoute ? 15 : 32,
  calls: [],
  turns: [],
  hints: [],
};
const model = {
  identity: provider.identity,
  async respond(request) {
    if (report.calls.length >= report.maxProviderCalls) {
      throw new Error("Qualification provider budget exhausted");
    }
    const call = {
      input: request.playerInput,
      phase:
        "reply" in request
          ? "npc-reply"
          : request.toolResults.length
            ? "narration"
            : "interpretation",
      promptVersion: request.promptVersion,
      promptDigest: digest(request.systemPrompt),
      toolSchemaDigest: digest(request.tools),
    };
    report.calls.push(call);
    const start = performance.now();
    try {
      const response = await provider.respond(request);
      call.provider = response.provider;
      call.toolCalls = "toolCalls" in response ? response.toolCalls : [];
      return response;
    } catch (error) {
      call.error = error.message;
      throw error;
    } finally {
      call.latencyMs = Math.round(performance.now() - start);
    }
  },
};
const options = {
  savePath,
  seed: 0,
  apiKey: process.env.OPENAI_API_KEY,
  dmModel: model,
};
let server;
const state = async () => (await fetch(server.url + "/api/state")).json();
async function post(path, body) {
  const response = await fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
async function turn(message, expected, args, click = false) {
  const before = await state();
  const action = click
    ? before.actions.find(
        ({ call }) =>
          call.name === expected &&
          JSON.stringify(JSON.parse(call.argumentsJson)) ===
            JSON.stringify(args),
      )
    : undefined;
  if (click) {
    assert.ok(action, message);
  }
  const start = performance.now();
  const result = await post("/api/turn", {
    revision: before.revision,
    ...(click ? { optionId: action.id } : { message }),
  });
  const after = await state();
  report.turns.push({
    message: action?.message ?? message,
    clicked: click,
    expectedTool: expected ?? null,
    expectedArguments: args ?? null,
    committed: result.committed,
    positionBefore: before.position,
    positionAfter: after.position,
    location: after.scene.room.name,
    clocks: after.clocks,
    outcome: after.scene.outcome,
    reply: result.reply,
    cards: result.cards,
    notice: result.notice,
    latencyMs: Math.round(performance.now() - start),
  });
  assert.equal(result.committed, expected !== undefined, result.notice);
  if (expected !== undefined) {
    assert.equal(after.position, before.position + 1);
    const selected = report.calls
      .filter((call) => call.input === (action?.message ?? message))
      .flatMap((call) => call.toolCalls ?? []);
    assert.ok(
      selected.some(
        (call) =>
          call.name === expected &&
          JSON.stringify(JSON.parse(call.argumentsJson)) ===
            JSON.stringify(args),
      ),
      "Expected tool selection",
    );
  }
  console.log(
    JSON.stringify({
      step: report.turns.length,
      committed: result.committed,
      location: after.scene.room.name,
      latencyMs: report.turns.at(-1).latencyMs,
    }),
  );
}
async function hints() {
  const before = await state();
  const calls = report.calls.length;
  await post("/api/hints/stronger", { revision: before.hints.revision });
  let after;
  for (let attempt = 0; attempt < 100; attempt++) {
    after = await state();
    if (after.strongerHints?.status !== "preparing") {
      break;
    }
    await new Promise((done) => {
      setTimeout(done, 20);
    });
  }
  report.hints.push({
    baseline: after.hints,
    stronger: after.strongerHints,
    providerCalls: report.calls.length - calls,
    positionBefore: before.position,
    positionAfter: after.position,
  });
  assert.equal(after.position, before.position);
  assert.equal(report.calls.length, calls);
  assert.equal(after.strongerHints?.status, "ready");
}
try {
  server = await startBrowserServer(options);
  await post("/api/start", {});
  const session = await SaveSession.load(savePath);
  report.identity = {
    provider: provider.identity,
    adventure: session.runtime.id,
    contentVersion: session.runtime.version,
    contentDigest: session.runtime.content.digest,
    rulesVersion: session.runtime.rulesVersion,
    promptVersion: session.runtime.promptVersion,
    toolSchemaVersion: session.runtime.toolSchemaVersion,
    systemPromptDigest: digest(session.runtime.systemPrompt),
  };
  await hints();
  if (watchRoute) {
    await turn(
      "Travel to Watch Loft",
      "move",
      { destinationId: "watch-loft" },
      true,
    );
    await turn(
      "Ask Pell about the last signal shift",
      "talk",
      { speakerId: "pell", topicId: "shift", approach: "persuade" },
      true,
    );
    await turn("Travel to Signal Records Room", "move", {
      destinationId: "signal-records",
    });
    await turn(
      "Search beacon setting plate",
      "search",
      { target: "setting-plate" },
      true,
    );
    await hints();
    await turn(
      "Which person do you mean by the watch? I am only asking for clarification.",
    );
    assert.ok(
      (await state()).scene.journal.discoveries.some(({ title }) =>
        /Altered beacon setting/i.test(title),
      ),
    );
  } else {
    await turn(
      "Ask Captain Iona about the beacon and watch leads",
      "talk",
      { speakerId: "iona", topicId: "brief", approach: "ask" },
      true,
    );
    await turn("Travel to Keeper Path", "move", {
      destinationId: "keeper-path",
    });
    await turn(
      "Search damaged shutter latch",
      "search",
      { target: "shutter-latch" },
      true,
    );
    await hints();
    const before = await state();
    const bytes = await readFile(savePath, "utf8");
    const calls = report.calls.length;
    await server.close();
    server = await startBrowserServer(options);
    assert.deepEqual(await state(), before);
    assert.equal(await readFile(savePath, "utf8"), bytes);
    assert.equal(report.calls.length, calls);
    report.restoration = {
      exactHistoryAndState: true,
      exactSaveBytes: true,
      providerCalls: 0,
      position: before.position,
    };
    await turn("Travel to Watch Yard", "move", { destinationId: "watch-yard" });
    await turn(
      "Travel to Ridge Trail",
      "move",
      { destinationId: "ridge-trail" },
      true,
    );
    await turn("Search broken marker post", "search", {
      target: "broken-marker",
    });
    await turn(
      "Travel to Beacon Tower",
      "move",
      { destinationId: "beacon-tower" },
      true,
    );
    await turn(
      "What are my ending choices? Please explain without choosing one.",
    );
    await turn(
      "Resolve Hold the beacon",
      "resolve_quest",
      { resolutionId: "hold-beacon" },
      true,
    );
    assert.equal(
      (await SaveSession.load(savePath)).state.ending.id,
      "hold-beacon",
    );
  }
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  await server?.close();
  report.finishedAt = new Date().toISOString();
  report.tokens = report.calls.reduce(
    (sum, call) => ({
      input: sum.input + (call.provider?.usage?.inputTokens ?? 0),
      output: sum.output + (call.provider?.usage?.outputTokens ?? 0),
    }),
    { input: 0, output: 0 },
  );
  report.cost = {
    usd: null,
    reason:
      "Responses reports tokens, not billed dollars. No unsupported rate or invoice estimate is substituted.",
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      output,
      calls: report.calls.length,
      tokens: report.tokens,
      error: report.error ?? null,
    }),
  );
}
