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
  const directory = mkdtempSync(join(tmpdir(), "issue-44-"));
  try {
    const result = work(directory);
    if (result instanceof Promise) {
      return result.finally(() =>
        rmSync(directory, { recursive: true, force: true }),
      );
    }
    rmSync(directory, { recursive: true, force: true });
    return result;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
};

test("guardian visibility and combat consequences are authoritative and idempotent", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  for (const destination of ["chapel-path", "ruined-chapel", "crypt"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      random,
    ).state;
  }
  assert.equal(state.combat.opponentId, "skeleton-guardian");
  assert.deepEqual(runtime.projectDmScene(state).room.features, []);
  assert.deepEqual(runtime.projectDmScene(state).room.npcs, []);
  for (const [name, args] of [
    ["search", { target: "diversion-ledger" }],
    ["talk", { speakerId: "tavi", topicId: "crypt", approach: "ask" }],
  ]) {
    const response = runtime.dispatchGameTool(
      state,
      { name, argumentsJson: JSON.stringify(args) },
      {
        roll: () => {
          throw Error("Unexpected draw");
        },
      },
    );
    assert.equal(response.modelOutput.error.code, "unavailable-reference");
    assert.equal(response.state, state);
  }
  let attackCount = 0;
  while (state.monsters["skeleton-guardian"].hp > 0 && attackCount++ < 10) {
    state = runtime.handleAction(
      state,
      { type: "attack", target: "skeleton" },
      random,
    ).state;
  }
  assert.equal(attackCount, 3);
  assert.deepEqual(state.milestones, ["guardian-cleared"]);
  assert.deepEqual(state.discoveries, []);
  assert.equal(state.combat, undefined);
  assert.deepEqual(
    runtime.projectDmScene(state).room.features.map(({ id }) => id),
    ["diversion-ledger"],
  );
  assert.deepEqual(
    runtime.projectDmScene(state).room.npcs.map(({ id }) => id),
    ["tavi"],
  );
  const rejected = runtime.handleAction(
    state,
    { type: "attack", target: "skeleton" },
    random,
  );
  assert.equal(rejected.rejection.reason, "invalid-attack-target");
  assert.equal(rejected.state, state);
  state = runtime.handleAction(state, {
    type: "search",
    target: "ledger",
  }).state;
  assert.deepEqual(state.discoveries, ["ledger-evidence"]);
  state = runtime.handleAction(state, {
    type: "search",
    target: "ledger",
  }).state;
  assert.deepEqual(state.discoveries, ["ledger-evidence"]);
  state = runtime.handleAction(state, {
    type: "talk",
    target: "tavi",
    topic: "crypt",
    approach: "ask",
  }).state;
  assert.deepEqual(state.discoveries, [
    "ledger-evidence",
    "tavi-crypt-testimony",
  ]);
});

test("validation rejects missing monsters and overlapping encounter locations", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const mutate = (change) => {
    const value = structuredClone(document);
    change(value);
    return loadAdventure(JSON.stringify(value)).diagnostics;
  };
  assert.ok(
    mutate((value) => {
      value.encounters[0].monsterId = "missing";
    }).some(
      ({ code, path }) =>
        code === "unknown-reference" && path === "/encounters/0/monsterId",
    ),
  );
  assert.ok(
    mutate((value) => {
      value.monsters.push({
        id: "second-guardian",
        definitionId: "skeleton",
        locationId: "crypt",
        hp: 13,
      });
      value.encounters.push({
        id: "second-encounter",
        monsterId: "second-guardian",
        when: [],
        effects: [],
      });
    }).some(({ code }) => code === "overlapping-encounters"),
  );
  assert.ok(
    mutate((value) => {
      value.monsters[0].definitionId = "missing";
    }).some(({ code }) => code === "unknown-reference"),
  );
});

test("an authored condition can activate an encounter after a local discovery", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const variant = structuredClone(document);
  variant.monsters[0].locationId = "inn";
  variant.encounters[0].when = [
    { type: "milestone-recorded", id: "chapel-route-known" },
  ];
  const loaded = loadAdventure(JSON.stringify(variant));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const runtime = createChapelCluesRuntime(loaded.adventure);
  const state = runtime.createSession();
  assert.deepEqual(runtime.projectDmScene(state).room.opponents, []);
  assert.ok(
    !runtime
      .getGameToolDefinitions(state)
      .find(({ name }) => name === "attack"),
  );
  const result = runtime.handleAction(
    state,
    { type: "search", target: "notice" },
    createSeededRandom(0),
  );
  assert.equal(result.rejection, undefined);
  assert.equal(result.events[0].operation, "search");
  assert.equal(result.events[1].operation, "combat-started");
  assert.equal(result.state.combat.opponentId, "skeleton-guardian");
  assert.deepEqual(
    runtime.projectDmScene(result.state).room.opponents.map(({ id }) => id),
    ["skeleton-guardian"],
  );
});

test("seeded command victories and terminal defeat replay from format 4", () =>
  temporary((directory) => {
    for (const [seed, expected] of [
      [0, "victory"],
      [74, "defeat"],
    ]) {
      const tracePath = join(directory, `command-${seed}.json`);
      const input = `move chapel path\nmove ruined chapel\nmove crypt\nsearch ledger\ntalk tavi crypt ask\n${"attack skeleton\n".repeat(12)}search ledger\ntalk tavi crypt ask\nquit\n`;
      const played = run(input, [
        "--adventure-file",
        source,
        "--seed",
        String(seed),
        "--trace",
        tracePath,
      ]);
      assert.equal(played.status, 0, played.stderr);
      assert.match(
        played.stdout,
        /Combat begins against the skeleton guardian/,
      );
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.formatVersion, 4);
      assert.ok(trace.actions[2].rolls.length >= 2);
      const last = trace.actions.at(-1).stateAfter;
      if (expected === "victory") {
        assert.equal(last.monsters["skeleton-guardian"].hp, 0);
        assert.ok(last.milestones.includes("guardian-cleared"));
        assert.deepEqual(last.discoveries, [
          "ledger-evidence",
          "tavi-crypt-testimony",
        ]);
      } else {
        assert.equal(last.status, "defeat");
        assert.ok(!last.milestones.includes("guardian-cleared"));
        assert.deepEqual(last.discoveries, []);
      }
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));

test("scripted AI victory uses offered attack, reveals sources, and replays", () =>
  temporary((directory) => {
    const calls = [
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "crypt" }],
      ...Array.from({ length: 3 }, () => [
        "attack",
        { opponent_id: "skeleton-guardian" },
      ]),
      ["search", { target: "diversion-ledger" }],
      ["talk", { speakerId: "tavi", topicId: "crypt", approach: "ask" }],
    ];
    const script = join(directory, "script.json"),
      tracePath = join(directory, "ai.json");
    writeFileSync(
      script,
      JSON.stringify(
        calls.flatMap(([name, args], index) => [
          {
            toolCalls: [
              {
                id: `call-${index}`,
                name,
                argumentsJson: JSON.stringify(args),
              },
            ],
          },
          { text: "Continue." },
        ]),
      ),
    );
    const played = run(
      `${calls.map(([name]) => `Do ${name}`).join("\n")}\nquit\n`,
      ["--adventure-file", source, "--ai", "--seed", "0", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.formatVersion, 4);
    assert.deepEqual(trace.turns.at(-1).stateAfter.discoveries, [
      "ledger-evidence",
      "tavi-crypt-testimony",
    ]);
    assert.equal(trace.turns[3].calls[0].result.modelOutput.ok, true);
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("scripted AI defeat is terminal and replays without a provider", () =>
  temporary((directory) => {
    const calls = [
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "crypt" }],
      ["attack", { opponent_id: "skeleton-guardian" }],
      ["attack", { opponent_id: "skeleton-guardian" }],
    ];
    const script = join(directory, "script.json"),
      tracePath = join(directory, "defeat.json");
    writeFileSync(
      script,
      JSON.stringify(
        calls.flatMap(([name, args], index) => [
          {
            toolCalls: [
              {
                id: `call-${index}`,
                name,
                argumentsJson: JSON.stringify(args),
              },
            ],
          },
          { text: "Continue." },
        ]),
      ),
    );
    const played = run(
      `${calls.map(([name]) => `Do ${name}`).join("\n")}\nquit\n`,
      [
        "--adventure-file",
        source,
        "--ai",
        "--seed",
        "74",
        "--trace",
        tracePath,
      ],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns.at(-1).stateAfter.status, "defeat");
    assert.ok(
      !trace.turns.at(-1).stateAfter.milestones.includes("guardian-cleared"),
    );
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("pre-guardian external chapel format-4 traces retain their v2 runtime", () =>
  temporary(async (directory) => {
    const { loadAdventure } = await import("../dist/adventure-loader.js");
    const { createChapelCluesRuntime } =
      await import("../dist/chapel-clues-runtime.js");
    const {
      createSessionTrace,
      recordTraceAction,
      completeSessionTrace,
      serializeSessionTrace,
    } = await import("../dist/trace.js");
    const previous = readFileSync(
      "tests/fixtures/external-chapel-v2.json",
      "utf8",
    );
    const runtime = createChapelCluesRuntime(loadAdventure(previous).adventure);
    assert.equal(runtime.engineVersion, "chapel-clues-engine-v2");
    assert.equal(runtime.promptVersion, "chapel-clues-dm-v2");
    assert.equal(runtime.toolSchemaVersion, "chapel-clues-tools-v2");
    let state = runtime.createSession();
    assert.ok(!Object.hasOwn(state, "monsters"));
    assert.ok(
      !runtime
        .renderResult(runtime.handleAction(state, { type: "look" }))
        .includes("Opponents:"),
    );
    const trace = createSessionTrace(0, state, runtime);
    for (const rawInput of [
      "search notice",
      "move chapel path",
      "move ruined chapel",
      "search record",
      "quit",
    ]) {
      const action = runtime.parseCommand(rawInput);
      const result = runtime.handleAction(state, action);
      recordTraceAction(trace, rawInput, action, [], result);
      state = result.state;
    }
    completeSessionTrace(trace, "quit", state);
    const tracePath = join(directory, "legacy-v2.json");
    writeFileSync(tracePath, serializeSessionTrace(trace));
    assert.equal(run("", ["--replay", tracePath]).status, 0);
    const scriptPath = join(directory, "legacy-ai-script.json");
    const aiTracePath = join(directory, "legacy-v2-ai.json");
    writeFileSync(
      scriptPath,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "talk-mara",
              name: "talk",
              argumentsJson:
                '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
            },
          ],
        },
        { text: "Continue." },
      ]),
    );
    const played = run(
      "Ask Mara about Tavi\nquit\n",
      [
        "--adventure-file",
        "tests/fixtures/external-chapel-v2.json",
        "--ai",
        "--seed",
        "0",
        "--trace",
        aiTracePath,
      ],
      { DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.equal(
      JSON.parse(readFileSync(aiTracePath, "utf8")).engineVersion,
      "chapel-clues-engine-v2",
    );
    assert.equal(run("", ["--replay", aiTracePath]).status, 0);
  }));
