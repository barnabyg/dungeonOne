import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { CLOCK_SCHEMA } from "../dist/clock-schema.js";
import { createDataRuntime } from "../dist/data-runtime.js";

const adventure = fileURLToPath(
  new URL("../adventures/deadline-rescue.json", import.meta.url),
);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const source = JSON.parse(readFileSync(adventure, "utf8"));
const load = (value) => loadAdventure(JSON.stringify(value));

function run(commands, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input: `${commands.join("\n")}\n`,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("clock schema is published and loader rejects malformed clocks and references", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v5.schema.json", "utf8")),
    CLOCK_SCHEMA,
  );
  assert.equal(load(source).ok, true);
  const cases = [
    (value) => {
      value.clocks[0].id = "Bad ID";
    },
    (value) => {
      value.clocks.push(structuredClone(value.clocks[0]));
    },
    (value) => {
      value.clocks[0].initial = value.clocks[0].maximum;
    },
    (value) => {
      value.clocks[0].thresholds[1].at = 1;
    },
    (value) => {
      value.clocks[0].thresholds[1].at = 7;
    },
    (value) => {
      value.clocks[0].thresholds[0].effects[0].id = "unknown";
    },
    (value) => {
      value.clocks[0].thresholds[0].effects[0].type = "run-script";
    },
    (value) => {
      value.endings.choices[0].consequences.at(-2).when[0].id = "unknown";
    },
  ];
  for (const mutate of cases) {
    const value = structuredClone(source);
    mutate(value);
    assert.equal(load(value).ok, false, JSON.stringify(value.clocks));
  }
});

test("one wait crosses multiple thresholds once; reads, invalid requests and retries cost zero", () => {
  const value = structuredClone(source);
  value.clocks[0].thresholds[0].at = 1;
  value.clocks[0].thresholds[1].at = 3;
  const loaded = load(value);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const runtime = createDataRuntime(loaded.adventure);
  let state = runtime.createSession();
  for (const command of [
    "look",
    "status",
    "journal",
    "inspect route-register",
    "wait 0",
    "move nowhere",
  ]) {
    state = runtime.handleAction(state, runtime.parseCommand(command)).state;
    assert.equal(state.clocks["raider-plan"], 0, command);
  }
  const invalidTool = runtime.dispatchGameTool(state, {
    name: "wait",
    argumentsJson: "{",
  });
  assert.equal(invalidTool.state.clocks["raider-plan"], 0);
  const validTool = runtime.dispatchGameTool(state, {
    name: "wait",
    argumentsJson: '{"amount":"1"}',
  });
  assert.equal(validTool.state.clocks["raider-plan"], 1);
  const taken = runtime.handleAction(
    state,
    runtime.parseCommand("take restorative-tonic"),
  );
  assert.equal(taken.state.clocks["raider-plan"], 1);
  const spoken = runtime.handleAction(
    state,
    runtime.parseCommand("talk neri rescue ask"),
  );
  assert.equal(spoken.state.clocks["raider-plan"], 1);
  const crossed = runtime.handleAction(state, runtime.parseCommand("wait 3"));
  assert.equal(crossed.rejection, undefined);
  assert.equal(crossed.state.clocks["raider-plan"], 3);
  assert.deepEqual(
    crossed.events
      .filter((event) => event.operation === "clock-threshold")
      .map((event) => event.clock.threshold),
    [1, 3],
  );
  assert.deepEqual(
    crossed.state.milestones.filter(
      (id) => id === "raiders-near" || id === "deadline-missed",
    ),
    ["raiders-near", "deadline-missed"],
  );
  const later = runtime.handleAction(
    crossed.state,
    runtime.parseCommand("wait 3"),
  );
  assert.equal(later.state.clocks["raider-plan"], 6);
  assert.equal(
    later.events.filter((event) => event.operation === "clock-threshold")
      .length,
    0,
  );
  const inCombat = {
    ...state,
    combat: {
      opponentId: "neri",
      initiative: {},
      turnOrder: ["fighter", "neri"],
      currentTurn: "fighter",
    },
  };
  const rejected = runtime.handleAction(
    inCombat,
    runtime.parseCommand("wait 1"),
  );
  assert.equal(rejected.rejection.reason, "combat-restriction");
  assert.equal(rejected.state.clocks["raider-plan"], 0);
});

test("met and missed routes have different scenes and endings across resume", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-68-"));
  try {
    const onTimePath = join(directory, "on-time.json");
    const tracePath = join(directory, "on-time-trace.json");
    const onTime = run(
      [
        "search route-register",
        "move square",
        "move hall",
        "resolve file-register",
        "wait 1",
      ],
      ["--adventure-file", adventure, "--seed", "0", "--save", onTimePath],
    );
    assert.match(onTime, /before the raiders close the safe passage/);
    assert.match(onTime, /Action unavailable/);
    const onTimeSave = JSON.parse(readFileSync(onTimePath, "utf8"));
    assert.deepEqual(onTimeSave.checkpoint.state.ending.consequences, [
      "register-filed",
      "deadline-met",
    ]);
    assert.equal(onTimeSave.checkpoint.state.clocks["raider-plan"], 3);
    run(
      [
        "search route-register",
        "move square",
        "move hall",
        "resolve file-register",
      ],
      ["--adventure-file", adventure, "--seed", "0", "--trace", tracePath],
    );
    assert.match(run([], ["--replay", tracePath]), /verified|replay/i);

    const latePath = join(directory, "late.json");
    run(
      ["wait 3"],
      ["--adventure-file", adventure, "--seed", "0", "--save", latePath],
    );
    const resumed = run(
      [
        "wait 2",
        "search route-register",
        "move square",
        "move hall",
        "move back-lane",
        "move hall",
        "look",
        "resolve file-register",
      ],
      ["--resume", latePath],
    );
    assert.match(resumed, /raiders hold the short passage/);
    assert.match(resumed, /Action unavailable/);
    assert.match(resumed, /report arrives after the deadline/);
    const lateSave = JSON.parse(readFileSync(latePath, "utf8"));
    assert.equal(lateSave.checkpoint.state.clocks["raider-plan"], 6);
    assert.deepEqual(lateSave.checkpoint.state.ending.consequences, [
      "register-filed",
      "deadline-missed",
    ]);
    const clockEvents = lateSave.transitions
      .flatMap((transition) => transition.domainEvents)
      .filter((event) => event.type === "clock-threshold-crossed");
    assert.deepEqual(
      clockEvents.map((event) => event.at),
      [2, 5],
    );

    const earlyArrivalPath = join(directory, "early-arrival.json");
    run(
      ["search route-register", "move square", "move hall"],
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        earlyArrivalPath,
      ],
    );
    const waitedAtHall = run(
      ["wait 2", "resolve file-register"],
      ["--resume", earlyArrivalPath],
    );
    assert.match(waitedAtHall, /report arrives after the deadline/);
    assert.doesNotMatch(waitedAtHall, /by the long route|before you arrived/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
