import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { ADJUDICATION_SCHEMA } from "../dist/adjudication-schema.js";
import { createDataRuntime } from "../dist/data-runtime.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("../adventures/barricaded-crossroads.json", import.meta.url),
);
const content = JSON.parse(readFileSync(fixture, "utf8"));

function run(input, args, script) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ...(script === undefined ? {} : { DUNGEON_ONE_TEST_DM_SCRIPT: script }),
    },
  });
}

function directory(body) {
  const path = mkdtempSync(join(tmpdir(), "dungeon-issue-73-"));
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

function square(game) {
  const moved = game.handleAction(game.createSession(), {
    type: "move",
    destination: "square",
  });
  assert.equal(moved.rejection, undefined);
  return moved.state;
}

test("schema-6 profile validates finite capabilities, references, and route safety", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v6.schema.json", "utf8")),
    ADJUDICATION_SCHEMA,
  );
  const cases = [
    (copy) => {
      copy.adjudicationProfiles[0].resourceId = "hall-masonry";
    },
    (copy) => {
      copy.adjudicationProfiles[0].targetId = "hall-back-lane";
    },
    (copy) => {
      copy.adjudicationProfiles[0].effect.connectionIds = [
        "square-hall",
        "square-cellar",
      ];
    },
    (copy) => {
      copy.adjudicationProfiles[0].effect.type = "invent-route";
    },
    (copy) => {
      copy.adjudicationProfiles[0].effect.connectionIds = [
        "square-hall",
        "square-hall",
      ];
    },
    (copy) => {
      copy.adjudicationProfiles.push({
        ...structuredClone(copy.adjudicationProfiles[0]),
        id: "duplicate-barricade",
        effect: { type: "block-connections", connectionIds: ["square-hall"] },
      });
    },
  ];
  for (const mutate of cases) {
    const copy = structuredClone(content);
    mutate(copy);
    assert.equal(loadAdventure(JSON.stringify(copy)).ok, false);
  }
});

test("invalid, ambiguous, combat, terminal, and stale proposals cost no state, time, or RNG", () => {
  const game = runtime();
  const start = square(game);
  const rng = {
    calls: 0,
    roll() {
      this.calls += 1;
      return 1;
    },
  };
  const rejected = [
    "attempt barricade",
    "attempt barricade cellar with market cart",
    "attempt barricade short passage with stone short passage",
    "attempt barricade short passage with wooden shutter",
  ];
  for (const input of rejected) {
    const result = game.handleAction(start, game.parseCommand(input), rng);
    assert.equal(result.rejection?.reason, "invalid-adjudication", input);
    assert.deepEqual(result.state, start);
  }
  assert.equal(rng.calls, 0);
  const action = game.parseCommand(
    "attempt barricade short passage with market cart",
  );
  assert.equal(action.type, "adjudicate");
  const committed = game.handleAction(start, action, rng);
  assert.equal(committed.rejection, undefined);
  assert.deepEqual(committed.state.barricades, ["cart-short-passage"]);
  assert.equal(
    committed.state.clocks["raider-plan"],
    start.clocks["raider-plan"],
  );
  assert.equal(rng.calls, 0);
  assert.deepEqual(committed.events[0].adjudication.blockedConnectionIds, [
    "square-hall",
    "hall-square",
  ]);
  const stale = game.handleAction(committed.state, action, rng);
  assert.equal(stale.rejection?.reason, "invalid-adjudication");
  assert.deepEqual(stale.state, committed.state);
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
    game.handleAction(combat, action, rng).rejection?.reason,
    "combat-restriction",
  );
  const terminal = { ...start, status: "victory" };
  assert.notEqual(
    game.handleAction(terminal, action, rng).rejection,
    undefined,
  );
  assert.equal(rng.calls, 0);
});

test("AI can submit only the offered profile tuple without authoring effects", () => {
  const game = runtime();
  const start = square(game);
  const rng = {
    calls: 0,
    roll() {
      this.calls += 1;
      return 1;
    },
  };
  const offered = game
    .getGameToolDefinitions(start)
    .find(({ name }) => name === "adjudicate");
  assert.deepEqual(offered.parameters.properties.profileId.enum, [
    "cart-short-passage",
  ]);
  assert.deepEqual(offered.parameters.properties.targetId.enum, [
    "square-hall",
  ]);
  assert.deepEqual(offered.parameters.properties.resourceId.enum, [
    "market-cart",
  ]);
  assert.deepEqual(Object.keys(offered.parameters.properties).sort(), [
    "approach",
    "profileId",
    "resourceId",
    "targetId",
  ]);
  const args = {
    profileId: "cart-short-passage",
    targetId: "square-hall",
    resourceId: "market-cart",
    approach: "brace",
  };
  const attempt = (state, record, input) =>
    game.dispatchGameTool(
      state,
      { name: "adjudicate", argumentsJson: JSON.stringify(record) },
      rng,
      input,
    );
  for (const [record, input] of [
    [{ ...args, dc: 1 }, "Barricade the short passage with the market cart"],
    [
      { ...args, targetId: "cellar-square" },
      "Barricade the short passage with the market cart",
    ],
    [args, "Barricade the passage"],
    [args, "Do not barricade the short passage with the market cart"],
    [args, "Don't barricade the short passage with the market cart"],
    [args, "Should I barricade the short passage with the market cart?"],
    [args, "Barricade the cellar or the short passage with the market cart"],
    [args, "Barricade the short passage / cellar with the market cart"],
    [args, "Barricade the short passage, the cellar, with the market cart"],
    [
      args,
      "Barricade the short passage with the market cart and move to the hall",
    ],
  ]) {
    const result = attempt(start, record, input);
    assert.equal(result.modelOutput.ok, false);
    assert.deepEqual(result.state, start);
  }
  const committed = attempt(
    start,
    args,
    "Barricade the short passage with the market cart",
  );
  assert.equal(committed.modelOutput.ok, true);
  assert.deepEqual(committed.state.barricades, ["cart-short-passage"]);
  const stale = attempt(
    committed.state,
    args,
    "Barricade the short passage with the market cart",
  );
  assert.equal(stale.modelOutput.ok, false);
  assert.match(
    stale.modelOutput.error.rejection.detail,
    /stale or unavailable/,
  );
  assert.deepEqual(stale.state, committed.state);
  assert.equal(rng.calls, 0);
});

test("the barricaded route still reaches an honest late ending", () =>
  directory((path) => {
    const save = join(path, "save.json");
    const journey =
      [
        "move square",
        "attempt barricade short passage with market cart",
        "move cellar",
        "search route-register",
        "move square",
        "wait 3",
        "move back-lane",
        "move hall",
        "resolve file-register",
      ].join("\n") + "\n";
    const played = run(journey, [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--save",
      save,
    ]);
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /report arrives after the deadline/);
    const state = JSON.parse(readFileSync(save, "utf8")).checkpoint.state;
    assert.equal(state.ending.id, "file-register");
    assert.ok(state.ending.consequences.includes("deadline-missed"));
    assert.deepEqual(state.barricades, ["cart-short-passage"]);
  }));

test("command barricade survives departure and resume with identical save and replay", () =>
  directory((path) => {
    const wholeSave = join(path, "whole-save.json");
    const splitSave = join(path, "split-save.json");
    const wholeTrace = join(path, "whole-trace.json");
    const first = join(path, "first.json");
    const second = join(path, "second.json");
    const prefix =
      "move square\nattempt barricade short passage with market cart\n";
    const suffix = "move hall\nmove cellar\nmove square\nlook\n";
    for (const [input, args] of [
      [
        prefix + suffix,
        [
          "--adventure-file",
          fixture,
          "--seed",
          "0",
          "--save",
          wholeSave,
          "--trace",
          wholeTrace,
        ],
      ],
      [
        prefix,
        [
          "--adventure-file",
          fixture,
          "--seed",
          "0",
          "--save",
          splitSave,
          "--trace",
          first,
        ],
      ],
    ]) {
      const result = run(input, args);
      assert.equal(result.status, 0, result.stderr);
    }
    const resumed = run(suffix, [
      "--resume",
      splitSave,
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /market cart blocks the short passage/);
    assert.match(resumed.stdout, /Exits: Cellar\./);
    const whole = JSON.parse(readFileSync(wholeSave, "utf8"));
    const split = JSON.parse(readFileSync(splitSave, "utf8"));
    assert.deepEqual(split.checkpoint.state, whole.checkpoint.state);
    assert.equal(split.checkpoint.randomState, whole.checkpoint.randomState);
    assert.equal(
      split.checkpoint.randomPosition,
      whole.checkpoint.randomPosition,
    );
    assert.equal(split.checkpoint.state.clocks["raider-plan"], 3);
    assert.equal(
      split.transitions
        .flatMap(({ domainEvents }) => domainEvents)
        .filter(({ type }) => type === "passage-barricaded").length,
      1,
    );
    const replay = run("", ["--replay", first, second]);
    assert.equal(replay.status, 0, replay.stderr);
  }));

test("scripted AI selects the same bounded profile and replays after restart", () =>
  directory((path) => {
    const wholeSave = join(path, "whole-save.json");
    const splitSave = join(path, "split-save.json");
    const wholeTrace = join(path, "whole-trace.json");
    const first = join(path, "first.json");
    const second = join(path, "second.json");
    const script = join(path, "script.json");
    const call = (id, name, args) => [
      { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
      { text: "The mechanics above are authoritative." },
    ];
    const steps = [
      {
        input: "Go to the square",
        responses: call("move-1", "move", { destinationId: "square" }),
      },
      {
        input: "Barricade the short passage with the market cart",
        responses: call("brace", "adjudicate", {
          profileId: "cart-short-passage",
          targetId: "square-hall",
          resourceId: "market-cart",
          approach: "brace",
        }),
      },
      {
        input: "Go to the cellar",
        responses: call("move-2", "move", { destinationId: "cellar" }),
      },
      {
        input: "Return to the square",
        responses: call("move-3", "move", { destinationId: "square" }),
      },
    ];
    const play = (part, args) => {
      writeFileSync(
        script,
        JSON.stringify(part.flatMap(({ responses }) => responses)),
      );
      const result = run(
        part.map(({ input }) => input).join("\n") + "\n",
        args,
        script,
      );
      assert.equal(result.status, 0, result.stderr);
      return result;
    };
    play(steps, [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--ai",
      "--save",
      wholeSave,
      "--trace",
      wholeTrace,
    ]);
    const started = play(steps.slice(0, 2), [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--ai",
      "--save",
      splitSave,
      "--trace",
      first,
    ]);
    assert.match(started.stdout, /passage-barricaded|Barricade:/);
    const resumed = play(steps.slice(2), [
      "--resume",
      splitSave,
      "--ai",
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    assert.match(resumed.stdout, /market cart blocks the short passage/);
    const whole = JSON.parse(readFileSync(wholeSave, "utf8"));
    const split = JSON.parse(readFileSync(splitSave, "utf8"));
    assert.deepEqual(split.checkpoint.state, whole.checkpoint.state);
    assert.equal(split.checkpoint.randomState, whole.checkpoint.randomState);
    assert.equal(
      split.checkpoint.randomPosition,
      whole.checkpoint.randomPosition,
    );
    assert.equal(
      JSON.parse(readFileSync(first, "utf8")).turns[1].calls[0].name,
      "adjudicate",
    );
    const replay = run("", ["--replay", first, second]);
    assert.equal(replay.status, 0, replay.stderr);
  }));
