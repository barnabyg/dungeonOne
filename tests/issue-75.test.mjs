import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { DAY_SCHEMA } from "../dist/day-schema.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { projectDmHistory } from "../dist/dm-history.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("../adventures/distracted-crossroads.json", import.meta.url),
);
const content = JSON.parse(readFileSync(fixture, "utf8"));

function runtime(source = content) {
  const loaded = loadAdventure(JSON.stringify(source));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

function cellar(game) {
  const result = game.handleAction(game.createSession(), {
    type: "move",
    destination: "cellar",
  });
  assert.equal(result.rejection, undefined);
  return result.state;
}

function dice(value) {
  return {
    calls: 0,
    roll(sides) {
      assert.equal(sides, 20);
      this.calls += 1;
      return value;
    },
  };
}

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

function temporary(body) {
  const path = mkdtempSync(join(tmpdir(), "dungeon-issue-75-"));
  try {
    body(path);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}

test("day schema retains old content and validates finite distraction references", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v7.schema.json", "utf8")),
    DAY_SCHEMA,
  );
  assert.equal(
    loadAdventure(readFileSync("adventures/day-raider-crossroads.json", "utf8"))
      .ok,
    true,
  );
  for (const mutate of [
    (copy) => {
      copy.distractionProfiles[0].guardId = "nobody";
    },
    (copy) => {
      copy.distractionProfiles[0].resourceId = "route-register";
    },
    (copy) => {
      copy.distractionProfiles[0].connectionId = "square-hall";
    },
    (copy) => {
      copy.distractionProfiles[0].clockId = "missing";
    },
    (copy) => {
      copy.distractionProfiles[0].expiresAt = 1;
    },
    (copy) => {
      copy.distractionProfiles[0].dc = 500;
    },
    (copy) => {
      copy.distractionProfiles[0].timeCost = -1;
    },
    (copy) => {
      copy.distractionProfiles[0].arbitraryEffect = "open everything";
    },
  ]) {
    const copy = structuredClone(content);
    mutate(copy);
    assert.equal(loadAdventure(JSON.stringify(copy)).ok, false);
  }
});

test("command and AI phrasing use one authored profile and identical d20 result", () => {
  const game = runtime();
  const start = cellar(game);
  assert.deepEqual(
    game.getGameToolDefinitions(start).find(({ name }) => name === "distract")
      .parameters.properties.profileId.enum,
    ["crate-guard-door"],
  );
  const commandDice = dice(13);
  const command = game.handleAction(
    start,
    game.parseCommand("attempt distract guard with heavy crate"),
    commandDice,
  );
  const aiDice = dice(13);
  const ai = game.dispatchGameTool(
    start,
    { name: "distract", argumentsJson: '{"profileId":"crate-guard-door"}' },
    aiDice,
    "Rattle the heavy crate to draw the guard away",
  );
  assert.equal(ai.modelOutput.ok, true);
  assert.deepEqual(ai.state, command.state);
  assert.deepEqual(ai.engineResult.events, command.events);
  const nounPhrase = game.dispatchGameTool(
    start,
    { name: "distract", argumentsJson: '{"profileId":"crate-guard-door"}' },
    dice(13),
    "I create a distraction with the heavy crate to slip past the guard",
  );
  assert.equal(nounPhrase.modelOutput.ok, true);
  assert.deepEqual(nounPhrase.state, command.state);
  assert.equal(commandDice.calls, 1);
  assert.equal(aiDice.calls, 1);
  assert.match(
    game.renderResult(command),
    /d20 13 \+ modifier 2 = 15 vs DC 12 — success/,
  );
  assert.match(game.renderResult(command), /Time cost: 1 day/);
  assert.match(game.renderResult(command), /until Day 5/);
  assert.equal(command.state.clocks["raider-plan"], 2);
  assert.ok(
    game
      .projectDmScene(command.state)
      .room.exits.some(({ destinationId }) => destinationId === "hall"),
  );
  assert.equal(command.events[0].distraction.result, "success");
});

test("success opens the guarded route until Day 5 and revisit reflects expiry", () => {
  const game = runtime();
  const start = cellar(game);
  const success = game.handleAction(
    start,
    game.parseCommand("attempt distract guard with crate"),
    dice(13),
  );
  const hall = game.handleAction(success.state, {
    type: "move",
    destination: "hall",
  });
  assert.equal(hall.rejection, undefined);
  const revisit = game.handleAction(hall.state, {
    type: "move",
    destination: "cellar",
  });
  assert.equal(revisit.rejection, undefined);
  assert.equal(revisit.state.clocks["raider-plan"], 4);
  assert.match(
    game.renderResult(game.handleAction(revisit.state, { type: "look" })),
    /side door to the hall is open/,
  );
  const waited = game.handleAction(
    revisit.state,
    game.parseCommand("wait days 1"),
  );
  assert.equal(waited.state.clocks["raider-plan"], 5);
  assert.match(
    game.renderResult(game.handleAction(waited.state, { type: "look" })),
    /brief distraction has ended/,
  );
  assert.deepEqual(
    game
      .projectDmScene(waited.state)
      .room.exits.map(({ destinationId }) => destinationId),
    ["square"],
  );
  const blocked = game.handleAction(waited.state, {
    type: "move",
    destination: "hall",
  });
  assert.equal(blocked.rejection.reason, "guarded-passage");
  assert.deepEqual(blocked.state, waited.state);
  assert.match(game.renderResult(blocked), /Available exits: Square/);
});

test("failure locks the attempt and invalid scenes consume no d20", () => {
  const game = runtime();
  const start = cellar(game);
  const rng = dice(1);
  const action = game.parseCommand("attempt distract guard with heavy crate");
  const failure = game.handleAction(start, action, rng);
  assert.equal(failure.events[0].distraction.result, "failure");
  assert.equal(failure.state.clocks["raider-plan"], 2);
  assert.match(game.renderResult(failure), /Available exits: Square/);
  const retry = game.handleAction(
    failure.state,
    game.parseCommand("attempt distract cellar guard with crate"),
    rng,
  );
  assert.equal(retry.rejection.reason, "invalid-adjudication");
  assert.deepEqual(retry.state, failure.state);
  assert.equal(rng.calls, 1);
  const invalid = [
    { ...start, npcHealth: { ...start.npcHealth, guard: { hp: 0, maxHp: 1 } } },
    { ...start, npcLocations: { ...start.npcLocations, guard: "square" } },
    {
      ...start,
      combat: {
        opponentId: "scout",
        initiative: {},
        turnOrder: ["fighter", "scout"],
        currentTurn: "fighter",
      },
    },
  ];
  for (const state of invalid) {
    const rejected = game.handleAction(state, action, rng);
    assert.notEqual(rejected.rejection, undefined);
    assert.deepEqual(rejected.state, state);
  }
  assert.equal(
    game.handleAction(
      start,
      game.parseCommand("attempt distract guard with cellar exit"),
      rng,
    ).rejection.reason,
    "invalid-adjudication",
  );
  const hidden = structuredClone(content);
  hidden.features.find(({ id }) => id === "heavy-crate").when = [
    { type: "clock-before", id: "raider-plan", at: 1 },
  ];
  const hiddenGame = runtime(hidden);
  const hiddenState = cellar(hiddenGame);
  assert.equal(
    hiddenGame.handleAction(
      hiddenState,
      hiddenGame.parseCommand("attempt distract guard with crate"),
      rng,
    ).rejection.reason,
    "invalid-adjudication",
  );
  assert.equal(rng.calls, 1);
  const ai = game.dispatchGameTool(
    start,
    { name: "distract", argumentsJson: '{"profileId":"crate-guard-door"}' },
    rng,
    "Should I distract the guard with the crate?",
  );
  assert.equal(ai.modelOutput.ok, false);
  assert.deepEqual(ai.state, start);
  assert.equal(rng.calls, 1);
});

test("a distraction is not offered when every alternate exit is currently closed", () => {
  const closed = structuredClone(content);
  closed.connections.find(({ id }) => id === "cellar-square").when = [
    { type: "clock-before", id: "raider-plan", at: 1 },
  ];
  const game = runtime(closed);
  const state = cellar(game);
  const rng = dice(1);
  assert.deepEqual(game.projectDmScene(state).room.exits, []);
  assert.equal(
    game.getGameToolDefinitions(state).some(({ name }) => name === "distract"),
    false,
  );
  const rejected = game.handleAction(
    state,
    game.parseCommand("attempt distract guard with heavy crate"),
    rng,
  );
  assert.equal(rejected.rejection.reason, "invalid-adjudication");
  assert.deepEqual(rejected.state, state);
  assert.equal(rng.calls, 0);
});

test("both outcomes survive save/resume, replay, and provider failure after commit once", () =>
  temporary((path) => {
    for (const [seed, outcome] of [
      [0, "failure"],
      [1, "success"],
    ]) {
      const save = join(path, `${seed}-save.json`);
      const first = join(path, `${seed}-first.json`);
      const second = join(path, `${seed}-second.json`);
      const script = join(path, `${seed}-script.json`);
      writeFileSync(
        script,
        JSON.stringify([
          {
            toolCalls: [
              {
                id: "move",
                name: "move",
                argumentsJson: '{"destinationId":"cellar"}',
              },
            ],
          },
          { text: "You enter the cellar." },
          {
            toolCalls: [
              {
                id: "distract",
                name: "distract",
                argumentsJson: '{"profileId":"crate-guard-door"}',
              },
            ],
          },
        ]),
      );
      const played = run(
        "Go to the cellar\nRattle the heavy crate to draw the guard away\n",
        [
          "--adventure-file",
          fixture,
          "--ai",
          "--seed",
          String(seed),
          "--save",
          save,
          "--trace",
          first,
        ],
        script,
      );
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, new RegExp(`Distraction check:.*${outcome}`));
      const saved = JSON.parse(readFileSync(save, "utf8"));
      assert.equal(
        saved.checkpoint.state.distractionChecks["crate-guard-door"].result,
        outcome,
      );
      assert.equal(saved.checkpoint.state.clocks["raider-plan"], 2);
      assert.equal(
        saved.transitions
          .flatMap(({ domainEvents }) => domainEvents)
          .filter(({ type }) => type === "guard-distracted").length,
        1,
      );
      const game = runtime();
      const history = projectDmHistory(
        game,
        saved.checkpoint.state,
        saved.transitions,
      );
      assert.equal(
        history.facts.find(({ type }) => type === "guard-distracted")?.detail,
        outcome === "success" ? "active until day 5" : "failure",
      );
      if (outcome === "success") {
        const expired = game.handleAction(
          saved.checkpoint.state,
          game.parseCommand("wait days 3"),
        );
        assert.equal(
          projectDmHistory(game, expired.state, saved.transitions).facts.find(
            ({ type }) => type === "guard-distracted",
          )?.detail,
          "expired",
        );
      }
      const resumed = run(
        "status\n",
        [
          "--resume",
          save,
          "--ai",
          "--trace",
          second,
          "--previous-trace",
          first,
        ],
        script,
      );
      assert.equal(resumed.status, 0, resumed.stderr);
      const replay = run("", ["--replay", first, second]);
      assert.equal(replay.status, 0, replay.stderr);
    }
  }));
