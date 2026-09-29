import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { DAY_SCHEMA } from "../dist/day-schema.js";

const content = JSON.parse(
  readFileSync("adventures/day-raider-crossroads.json", "utf8"),
);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("../adventures/day-raider-crossroads.json", import.meta.url),
);

function run(input, args, script) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ...(script === undefined ? {} : { DUNGEON_ONE_TEST_DM_SCRIPT: script }),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function inDirectory(body) {
  const path = mkdtempSync(join(tmpdir(), "dungeon-issue-74-"));
  try {
    body(path);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

function runtime() {
  const loaded = loadAdventure(JSON.stringify(content));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

test("day schema validates observers and adjacent scheduled movement", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v7.schema.json", "utf8")),
    DAY_SCHEMA,
  );
  const changes = [
    (copy) => delete copy.clocks[0].unit,
    (copy) => (copy.clocks[0].thresholds[1].visibleFrom = ["nowhere"]),
    (copy) => (copy.clocks[0].thresholds[1].visibleFrom = ["square", "square"]),
    (copy) => (copy.clocks[0].thresholds[1].effects[1].id = "absent-guard"),
    (copy) => (copy.clocks[0].thresholds[1].effects[1].toLocationId = "hall"),
  ];
  for (const change of changes) {
    const copy = structuredClone(content);
    change(copy);
    assert.equal(loadAdventure(JSON.stringify(copy)).ok, false);
  }
});

test("one wait applies ordered thresholds while hiding off-screen movement", () => {
  const game = runtime();
  const start = game.createSession();
  const waited = game.handleAction(start, game.parseCommand("wait days 7"));
  assert.equal(waited.rejection, undefined);
  assert.equal(waited.state.clocks["raider-plan"], 7);
  assert.equal(waited.state.npcLocations.guard, "square");
  assert.deepEqual(
    waited.events
      .filter(({ operation }) => operation === "clock-threshold")
      .map(({ clock }) => clock.threshold),
    [2, 3, 7],
  );
  const output = game.renderResult(waited);
  assert.match(output, /wait 7 days\. Day 0 → Day 7/);
  assert.match(output, /A horn sounds/);
  assert.match(output, /Day 3 passes/);
  assert.doesNotMatch(output, /guard leaves the cellar/);
  assert.match(output, /raiders close the short passage/);
  assert.deepEqual(waited.state.observedThresholds, [
    "raider-plan:2",
    "raider-plan:7",
  ]);
  const journal = game.renderResult(
    game.handleAction(waited.state, { type: "journal" }),
  );
  assert.doesNotMatch(journal, /guard-post-changed/);
  assert.match(journal, /deadline-missed/);
});

test("a cellar wait does not reveal the off-screen closure until the square", () => {
  const game = runtime();
  const move = (state, destination) =>
    game.handleAction(state, { type: "move", destination }).state;
  const cellar = move(move(game.createSession(), "square"), "cellar");
  assert.equal(cellar.clocks["raider-plan"], 2);
  const waited = game.handleAction(cellar, game.parseCommand("wait days 5"));
  assert.equal(waited.state.clocks["raider-plan"], 7);
  assert.match(game.renderResult(waited), /guard leaves the cellar/);
  assert.match(game.renderResult(waited), /Day 7 passes/);
  assert.doesNotMatch(
    game.renderResult(waited),
    /raiders close the short passage/,
  );
  assert.doesNotMatch(
    game.renderResult(game.handleAction(waited.state, { type: "journal" })),
    /deadline-missed/,
  );
  const square = move(waited.state, "square");
  assert.match(
    game.renderResult(game.handleAction(square, { type: "look" })),
    /raiders hold the short passage/,
  );
  assert.match(
    game.renderResult(game.handleAction(square, { type: "journal" })),
    /deadline-missed/,
  );
});

test("invalid and unavailable waits and reads consume no day or random draw", () => {
  const game = runtime();
  const start = game.createSession();
  const random = {
    calls: 0,
    roll() {
      this.calls++;
      return 1;
    },
  };
  for (const command of [
    "wait days",
    "wait days 0",
    "wait days 8",
    "wait 3",
    "wait days 2 or 3",
  ]) {
    const result = game.handleAction(start, game.parseCommand(command), random);
    assert.notEqual(result.rejection, undefined, command);
    assert.deepEqual(result.state, start);
  }
  for (const type of ["look", "journal", "status", "inventory"]) {
    const result = game.handleAction(start, { type }, random);
    assert.equal(result.rejection, undefined);
    assert.deepEqual(result.state, start);
  }
  const nearEnd = game.handleAction(
    start,
    game.parseCommand("wait days 7"),
  ).state;
  assert.deepEqual(
    game.handleAction(nearEnd, game.parseCommand("wait days 2"), random).state,
    nearEnd,
  );
  const combat = {
    ...start,
    combat: {
      opponentId: "scout",
      initiative: {},
      turnOrder: ["fighter", "scout"],
      currentTurn: "fighter",
    },
  };
  assert.equal(
    game.handleAction(combat, game.parseCommand("wait days 1"), random)
      .rejection.reason,
    "combat-restriction",
  );
  const terminal = { ...start, status: "victory" };
  assert.notEqual(
    game.handleAction(terminal, game.parseCommand("wait days 1"), random)
      .rejection,
    undefined,
  );
  assert.equal(random.calls, 0);
});

test("AI wait offers only valid remaining days and requires matching player intent", () => {
  const game = runtime();
  const start = game.createSession();
  const offered = game
    .getGameToolDefinitions(start)
    .find(({ name }) => name === "wait");
  assert.deepEqual(offered.parameters.properties.amount.enum, [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
  ]);
  const call = { name: "wait", argumentsJson: JSON.stringify({ amount: "3" }) };
  for (const intent of [
    "wait days",
    "wait days 2",
    "wait days 3 and move square",
  ]) {
    const rejected = game.dispatchGameTool(start, call, undefined, intent);
    assert.equal(rejected.modelOutput.ok, false);
    assert.deepEqual(rejected.state, start);
  }
  const accepted = game.dispatchGameTool(start, call, undefined, "wait days 3");
  assert.equal(accepted.modelOutput.ok, true);
  assert.equal(accepted.state.clocks["raider-plan"], 3);
  assert.equal(accepted.state.npcLocations.guard, "square");
  assert.equal(
    game.dispatchGameTool(start, call, undefined, "I want to wait three days.")
      .modelOutput.ok,
    true,
  );
  const next = game
    .getGameToolDefinitions(accepted.state)
    .find(({ name }) => name === "wait");
  assert.deepEqual(next.parameters.properties.amount.enum, [
    "1",
    "2",
    "3",
    "4",
    "5",
  ]);
});

test("split waits before and after a threshold replay and finish the late route", () =>
  inDirectory((path) => {
    const commands = [
      "wait days 2",
      "wait days 1",
      "wait days 4",
      "move back lane",
      "move square",
      "talk guard request-passage persuade",
      "move cellar",
      "search route-register",
      "move square",
      "move back lane",
      "move hall",
      "resolve file-register",
    ];
    const wholeSave = join(path, "whole-save.json");
    run(`${commands.join("\n")}\n`, [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--save",
      wholeSave,
    ]);
    const whole = JSON.parse(readFileSync(wholeSave, "utf8"));
    assert.equal(whole.checkpoint.state.ending.id, "file-register");
    assert.ok(
      whole.checkpoint.state.ending.consequences.includes("deadline-missed"),
    );
    for (const splitAt of [1, 2]) {
      const save = join(path, `split-${splitAt}.json`);
      const first = join(path, `first-${splitAt}.json`);
      const second = join(path, `second-${splitAt}.json`);
      run(`${commands.slice(0, splitAt).join("\n")}\n`, [
        "--adventure-file",
        fixture,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        first,
      ]);
      const before = JSON.parse(readFileSync(save, "utf8")).checkpoint;
      assert.equal(before.state.clocks["raider-plan"], splitAt === 1 ? 2 : 3);
      const resumed = run(`${commands.slice(splitAt).join("\n")}\n`, [
        "--resume",
        save,
        "--trace",
        second,
        "--previous-trace",
        first,
      ]);
      assert.match(resumed, /report arrives after the deadline/);
      const split = JSON.parse(readFileSync(save, "utf8"));
      assert.deepEqual(split.checkpoint.state, whole.checkpoint.state);
      assert.deepEqual(
        split.transitions.flatMap(({ domainEvents }) => domainEvents),
        whole.transitions.flatMap(({ domainEvents }) => domainEvents),
      );
      assert.equal(
        split.checkpoint.randomPosition,
        whole.checkpoint.randomPosition,
      );
      assert.equal(split.checkpoint.randomState, whole.checkpoint.randomState);
      assert.equal(split.checkpoint.randomPosition, 1);
      assert.match(
        run("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
      assert.equal(
        split.transitions.filter(({ action }) => action.type === "wait").length,
        3,
      );
    }
  }));

test("the new day adventure also has an on-time ending", () =>
  inDirectory((path) => {
    const save = join(path, "on-time.json");
    const output = run(
      "move square\nmove cellar\nsearch route-register\nmove square\nmove hall\nresolve file-register\n",
      ["--adventure-file", fixture, "--seed", "0", "--save", save],
    );
    assert.match(output, /before the raiders close the safe passage/);
    const state = JSON.parse(readFileSync(save, "utf8")).checkpoint.state;
    assert.equal(state.clocks["raider-plan"], 5);
    assert.deepEqual(state.ending.consequences, [
      "register-filed",
      "deadline-met",
    ]);
  }));

test("scripted AI can retry after a rejected wait without extra days", () =>
  inDirectory((path) => {
    const save = join(path, "save.json");
    const first = join(path, "first.json");
    const second = join(path, "second.json");
    const script = join(path, "script.json");
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "wrong",
              name: "wait",
              argumentsJson: JSON.stringify({ amount: "2" }),
            },
          ],
        },
        { text: "Please specify the number of days to wait." },
      ]),
    );
    run(
      "I want to wait three days.\n",
      [
        "--adventure-file",
        fixture,
        "--seed",
        "0",
        "--ai",
        "--save",
        save,
        "--trace",
        first,
      ],
      script,
    );
    let saved = JSON.parse(readFileSync(save, "utf8"));
    assert.equal(saved.checkpoint.state.clocks["raider-plan"], 0);
    assert.equal(saved.checkpoint.randomPosition, 0);
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "right",
              name: "wait",
              argumentsJson: JSON.stringify({ amount: "3" }),
            },
          ],
        },
        { text: "Three days pass." },
      ]),
    );
    run(
      "I want to wait three days.\n",
      ["--resume", save, "--ai", "--trace", second, "--previous-trace", first],
      script,
    );
    saved = JSON.parse(readFileSync(save, "utf8"));
    assert.equal(saved.checkpoint.state.clocks["raider-plan"], 3);
    assert.equal(saved.transitions.length, 1);
    assert.equal(saved.checkpoint.randomPosition, 0);
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/,
    );
  }));
