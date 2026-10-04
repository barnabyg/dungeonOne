// The generic runtime interface (#126), exercised through shared
// infrastructure with a minimal fake runtime. Nothing here loads a pre-5e
// runtime: the bundled adventure file is only the content snapshot a save
// embeds.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ESLint } from "eslint";

import { loadAdventure } from "../dist/adventure-loader.js";
import { projectDmHistory } from "../dist/dm-history.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { SaveSession } from "../dist/save.js";

const loaded = loadAdventure(readFileSync("adventures/chapel-clues.json"));
assert.equal(loaded.ok, true);
const content = loaded.adventure;

/** A counter game: "advance" rolls a d6 and adds it; "finish" wins. */
function fakeRuntime(overrides = {}) {
  const scene = (state) => ({
    title: "Counter",
    objective: "Reach the end.",
    outcome: state.status,
    room: {
      id: "hall",
      name: "Hall",
      description: `The counter reads ${state.count}.`,
      features: [],
      items: [],
      opponents: [],
      exits: [],
    },
  });
  const handleAction = (state, action, random) => {
    if (state.status !== "playing") {
      return { state, rejection: { reason: "session-ended" } };
    }
    if (action.type === "advance") {
      const roll = random.roll(6);
      return {
        state: { ...state, count: state.count + roll },
        events: [{ type: "advanced", by: roll }],
      };
    }
    if (action.type === "finish") {
      return {
        state: { ...state, status: "victory" },
        events: [{ type: "finished" }],
      };
    }
    return { state, rejection: { reason: "unknown-command" } };
  };
  return Object.freeze({
    id: "counter",
    version: "1",
    rulesVersion: "counter-rules-v1",
    promptVersion: "counter-dm-v1",
    toolSchemaVersion: "counter-tools-v1",
    engineVersion: "counter-engine-v1",
    readToolNames: ["look"],
    mutationToolNames: ["attack"],
    commandTraceFormatVersion: 4,
    dmTraceFormatVersion: 4,
    content,
    createSession: () => ({ status: "playing", count: 0 }),
    handleAction,
    parseCommand: (input) =>
      ["advance", "finish"].includes(input.trim())
        ? { type: input.trim() }
        : { type: "unknown" },
    renderIntroduction: () => "A counter.",
    renderResult: (result) =>
      result.rejection === undefined
        ? result.events.map(({ type }) => type).join(", ")
        : `Rejected: ${result.rejection.reason}`,
    dispatchGameTool(state, call, random) {
      if (call.name === "look") {
        return { state, modelOutput: { ok: true, scene: scene(state) } };
      }
      if (call.name !== "attack") {
        return {
          state,
          modelOutput: { ok: false, error: { code: "unknown-tool" } },
        };
      }
      const action = { type: "advance" };
      const result = handleAction(state, action, random);
      return {
        state: result.state,
        action,
        engineResult: { events: result.events },
        modelOutput: { ok: true, events: result.events },
      };
    },
    getGameToolDefinitions: () =>
      ["look", "attack"].map((name) => ({
        type: "function",
        name,
        description: name,
        strict: true,
        parameters: {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
      })),
    projectCharacterStatus: (state) => ({
      hp: 1,
      maxHp: 1,
      equipment: [],
      collectedItems: [],
      outcome: state.status,
    }),
    projectDmScene: scene,
    recordDomainEvents: (action, actionId, before, after) => [
      {
        type: "counter-changed",
        actionId,
        from: before.count,
        to: after.count,
        status: after.status,
      },
    ],
    projectDmHistory: (state, transitions, speakerId) => ({
      locationId: "hall",
      ...(speakerId === undefined ? {} : { speakerId }),
      facts: transitions.flatMap(({ sequence, domainEvents = [] }) =>
        domainEvents.map((event) => ({
          sequence,
          type: event.type,
          subjectId: "counter",
          detail: `${event.from} -> ${event.to}`,
        })),
      ),
    }),
    ...overrides,
  });
}

async function temporary(run) {
  const directory = mkdtempSync(join(tmpdir(), "runtime-contract-"));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("a save records the runtime's domain events and replays them through the runtime on load", () =>
  temporary(async (directory) => {
    const path = join(directory, "counter.json");
    const runtime = fakeRuntime();
    const session = await SaveSession.start(path, runtime, 7);
    await session.commit("advance", { type: "advance" });
    await session.commit("advance", { type: "advance" });
    const rejected = await session.commit("dance", { type: "unknown" });
    assert.deepEqual(rejected.rejection, { reason: "unknown-command" });
    await session.commit("finish", { type: "finish" });

    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(saved.runtime, {
      engineVersion: "counter-engine-v1",
      rulesVersion: "counter-rules-v1",
      adventureId: "counter",
      contentVersion: "1",
    });
    assert.deepEqual(
      saved.transitions.map(({ action, domainEvents }) => [
        action.type,
        domainEvents.map(({ type, actionId }) => [type, actionId]),
      ]),
      [
        ["advance", [["counter-changed", "action-1"]]],
        ["advance", [["counter-changed", "action-2"]]],
        ["finish", [["counter-changed", "action-3"]]],
      ],
    );
    assert.equal(saved.checkpoint.status, "victory");

    const resumed = await SaveSession.load(path, () => fakeRuntime());
    assert.deepEqual(resumed.state, session.state);
    assert.deepEqual(resumed.progress, session.progress);
    assert.deepEqual(
      resumed.dmHistory(resumed.state, "keeper"),
      runtime.projectDmHistory(resumed.state, saved.transitions, "keeper"),
    );
    assert.equal(resumed.dmHistory(resumed.state).facts.length, 3);
  }));

test("a save diverging from what the runtime now resolves is refused", () =>
  temporary(async (directory) => {
    const path = join(directory, "counter.json");
    const session = await SaveSession.start(path, fakeRuntime(), 7);
    await session.commit("advance", { type: "advance" });
    const changed = fakeRuntime({
      recordDomainEvents: (action, actionId) => [
        { type: "counter-reworded", actionId },
      ],
    });
    await assert.rejects(
      SaveSession.load(path, () => changed),
      /Save diverges at transition 1\./,
    );
  }));

test("a runtime without domain events cannot be saved", () =>
  temporary(async (directory) => {
    await assert.rejects(
      SaveSession.start(
        join(directory, "counter.json"),
        fakeRuntime({ recordDomainEvents: undefined }),
        7,
      ),
      /Saves require/,
    );
  }));

test("DM history is the runtime's projection, and absent without one", () => {
  const runtime = fakeRuntime();
  const state = { status: "playing", count: 2 };
  const transitions = [
    {
      sequence: 1,
      action: { type: "advance" },
      domainEvents: [
        { type: "counter-changed", actionId: "action-1", from: 0, to: 2 },
      ],
    },
  ];
  assert.deepEqual(projectDmHistory(runtime, state, transitions), {
    locationId: "hall",
    facts: [
      {
        sequence: 1,
        type: "counter-changed",
        subjectId: "counter",
        detail: "0 -> 2",
      },
    ],
  });
  assert.equal(
    projectDmHistory(
      fakeRuntime({ projectDmHistory: undefined }),
      state,
      transitions,
    ),
    undefined,
  );
});

test("the AI DM turn offers the runtime's tools and resolves its mutation with engine dice", async () => {
  const runtime = fakeRuntime();
  const requests = [];
  const responses = [
    { toolCalls: [{ id: "call-1", name: "attack", argumentsJson: "{}" }] },
    { text: "The counter clicks forward." },
  ];
  const result = await runDmTurn({
    state: runtime.createSession(),
    playerInput: "Push the counter.",
    transcript: [],
    random: { roll: (sides) => (sides === 6 ? 4 : 1) },
    runtime,
    model: {
      async respond(request) {
        requests.push(request);
        return responses.shift();
      },
    },
  });
  assert.deepEqual(
    requests[0].tools.map(({ name }) => name),
    ["look", "attack"],
  );
  assert.equal(requests[0].promptVersion, "counter-dm-v1");
  assert.equal(requests[0].scene.room.description, "The counter reads 0.");
  assert.deepEqual(result.state, { status: "playing", count: 4 });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.narration, "The counter clicks forward.");
  assert.deepEqual(
    result.toolResults.map(({ call, rolls }) => [call.name, rolls]),
    [["attack", [{ sides: 6, value: 4 }]]],
  );
});

test("the lint boundary rejects shared imports of pre-5e modules but allows the registry", async () => {
  const eslint = new ESLint({ overrideConfigFile: "eslint.style.config.mjs" });
  const code =
    'import type { ClueState } from "./chapel-clues-runtime.js";\n' +
    'export { ADVENTURE } from "./adventure.js";\n' +
    "export type Shared = ClueState;\n";
  const [shared] = await eslint.lintText(code, { filePath: "src/save.ts" });
  assert.deepEqual(
    shared.messages.map(({ ruleId, line }) => [ruleId, line]),
    [
      ["no-restricted-imports", 1],
      ["no-restricted-imports", 2],
    ],
  );
  const [registry] = await eslint.lintText(code, {
    filePath: "src/data-runtime.ts",
  });
  assert.deepEqual(registry.messages, []);
});
