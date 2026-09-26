import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/chapel-clues.json";
const document = JSON.parse(readFileSync(source, "utf8"));
const run = (input, args, env = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
const temporary = (work) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-42-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("chapel leads are independent, sourced, and granted once through command play and replay", () =>
  temporary((directory) => {
    const tracePath = join(directory, "command.json");
    const played = run(
      "journal\ninspect notice\njournal\nsearch notice\nsearch notice\nmove chapel path\nmove ruined chapel\nsearch record\nsearch record\njournal\nmove crypt\nquit\n",
      ["--adventure-file", source, "--seed", "7", "--trace", tracePath],
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /No discoveries yet/);
    assert.match(
      played.stdout,
      /The chapel route \[observation; missing-person notice, Village Inn\]/,
    );
    assert.match(
      played.stdout,
      /Unsafe chapel repairs \[observation; damaged repair record, Ruined Chapel\]/,
    );
    assert.match(played.stdout, /find nothing new/);
    assert.match(played.stdout, /Action unavailable: invisible-target/);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.formatVersion, 4);
    assert.deepEqual(trace.actions.at(-2).rolls, []);
    assert.equal(trace.actions.at(-2).result.type, "rejected");
    assert.deepEqual(trace.actions.at(-3).stateAfter.discoveries, [
      "chapel-route",
      "unsafe-repairs",
    ]);
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("validation rejects unknown references, duplicate effects, and unreachable prerequisite cycles", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const copy = (change) => {
    const value = structuredClone(document);
    change(value);
    return loadAdventure(JSON.stringify(value));
  };
  assert.equal(loadAdventure(JSON.stringify(document)).ok, true);
  assert.ok(
    copy((value) => {
      value.searches[0].effects[0].id = "secret";
    }).diagnostics.some(({ code }) => code === "unknown-reference"),
  );
  assert.ok(
    copy((value) => {
      value.searches[0].effects.push(value.searches[0].effects[0]);
    }).diagnostics.some(({ code }) => code === "conflicting-effects"),
  );
  assert.ok(
    copy((value) => {
      value.searches[0].effects[0].dispatch = "search";
    }).diagnostics.some(({ code }) => code === "unknown-field"),
  );
  assert.ok(
    copy((value) => {
      value.searches[0].effects[0].id = "unsafe-repairs";
    }).diagnostics.some(({ code }) => code === "invalid-source"),
  );
  assert.ok(
    copy((value) => {
      value.searches[0].when = [
        { type: "discovery-known", id: "chapel-route" },
      ];
    }).diagnostics.some(({ code }) => code === "unreachable-search"),
  );
  const { CHAPEL_CLUES_SCHEMA } =
    await import("../dist/chapel-clues-schema.js");
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v3.schema.json", "utf8")),
    CHAPEL_CLUES_SCHEMA,
  );
});

test("forged hidden tools cannot mutate a session or draw randomness; sessions are isolated", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true);
  const runtime = createChapelCluesRuntime(loaded.adventure);
  const first = runtime.createSession();
  const second = runtime.createSession();
  let draws = 0;
  const random = {
    roll() {
      draws++;
      return 1;
    },
  };
  const hidden = runtime.dispatchGameTool(
    first,
    { name: "search", argumentsJson: '{"target":"damaged-repair-record"}' },
    random,
  );
  assert.equal(hidden.modelOutput.ok, false);
  assert.deepEqual(hidden.state, first);
  assert.equal(draws, 0);
  const found = runtime.handleAction(first, {
    type: "search",
    target: "notice",
  });
  assert.deepEqual(second.discoveries, []);
  assert.deepEqual(found.state.discoveries, ["chapel-route"]);
  const initialScene = runtime.projectDmScene(first);
  assert.ok(initialScene.suggestions.includes("search missing-person-notice"));
  assert.ok(
    !initialScene.suggestions.some((entry) => entry.includes("repair-record")),
  );
  let direct = runtime.handleAction(second, {
    type: "move",
    destination: "chapel path",
  }).state;
  direct = runtime.handleAction(direct, {
    type: "move",
    destination: "ruined chapel",
  }).state;
  direct = runtime.handleAction(direct, {
    type: "search",
    target: "repair record",
  }).state;
  assert.deepEqual(direct.discoveries, ["unsafe-repairs"]);
  assert.equal(
    runtime
      .projectDmScene(first)
      .room.features.some(({ id }) => id === "waymarker"),
    false,
  );
});

test("the first eligible search branch wins even after its effects are exhausted", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const branched = structuredClone(document);
  branched.discoveries.push({
    id: "second-notice-fact",
    title: "Second notice fact",
    classification: "observation",
    sourceFeatureId: "missing-person-notice",
    summary: "A separate notice detail.",
    lead: "Check again.",
  });
  branched.searches.push({
    id: "second-notice-search",
    targetId: "missing-person-notice",
    when: [],
    effects: [{ type: "grant-discovery", id: "second-notice-fact" }],
    text: "A second fact.",
  });
  const loaded = loadAdventure(JSON.stringify(branched));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const runtime = createChapelCluesRuntime(loaded.adventure);
  const first = runtime.handleAction(runtime.createSession(), {
    type: "search",
    target: "notice",
  });
  const repeated = runtime.handleAction(first.state, {
    type: "search",
    target: "notice",
  });
  assert.deepEqual(repeated.state.discoveries, ["chapel-route"]);
  assert.deepEqual(
    runtime
      .getGameToolDefinitions(repeated.state)
      .filter(({ name }) => name === "search"),
    [],
  );
});

test("known discoveries are projected to the DM after old transcript entries are evicted", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { runDmTurn } = await import("../dist/dm-turn.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  const state = runtime.handleAction(runtime.createSession(), {
    type: "search",
    target: "notice",
  }).state;
  let request;
  const result = await runDmTurn({
    state,
    playerInput: "What have I learned?",
    transcript: Array.from({ length: 20 }, (_, index) => ({
      role: "player",
      text: `Old turn ${index}`,
    })),
    random: {
      roll() {
        throw new Error("No draw expected");
      },
    },
    runtime,
    model: {
      async respond(input) {
        request = input;
        return { text: "The journal has the route." };
      },
    },
  });
  assert.ok(request.transcript.length <= 8);
  assert.deepEqual(
    request.scene.journal.discoveries.map(({ id }) => id),
    ["chapel-route"],
  );
  assert.deepEqual(result.state.discoveries, ["chapel-route"]);
});

test("scripted AI discovers a lead; local journal, status, and inventory work after provider failure", () =>
  temporary((directory) => {
    const script = join(directory, "script.json"),
      tracePath = join(directory, "ai.json");
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "search-notice",
              name: "search",
              argumentsJson: '{"target":"missing-person-notice"}',
            },
          ],
        },
        { text: "Recorded." },
      ]),
    );
    const played = run(
      "Search the notice\nAsk a question\njournal\nstatus\ninventory\nhelp\nquit\n",
      ["--adventure-file", source, "--ai", "--seed", "3", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /The chapel route \[observation/);
    assert.match(played.stdout, /Inventory: empty/);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns[1].diagnostics[0].code, "model-failure");
    assert.deepEqual(
      trace.turns.slice(2, 6).map(({ kind }) => kind),
      ["local-journal", "local-status", "local-inventory", "local-help"],
    );
    const replayed = run("", ["--replay", tracePath]);
    assert.equal(replayed.status, 0, replayed.stderr);
  }));
