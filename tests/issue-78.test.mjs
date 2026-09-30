import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";

const fixture = fileURLToPath(
  new URL("../adventures/day-raider-crossroads.json", import.meta.url),
);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const content = JSON.parse(readFileSync(fixture, "utf8"));

function runtime(snapshot = content) {
  const loaded = loadAdventure(JSON.stringify(snapshot));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

function act(game, state, command) {
  return game.handleAction(state, game.parseCommand(command), {
    roll: () => 20,
  });
}

function cellarAtDayTwo(game) {
  let state = game.createSession();
  state = act(game, state, "move square").state;
  return act(game, state, "move cellar").state;
}

test("witnessed departure offers one adjacent follow at move cost", () => {
  const game = runtime();
  const witnessed = act(game, cellarAtDayTwo(game), "wait days 1");
  assert.match(game.renderResult(witnessed), /guard leaves the cellar/);
  assert.equal(witnessed.state.npcLocations.guard, "square");
  assert.match(
    game.renderResult(act(game, witnessed.state, "look")),
    /follow guard/,
  );
  assert.ok(
    game
      .getGameToolDefinitions(witnessed.state)
      .some(({ name }) => name === "follow"),
  );

  const followed = act(game, witnessed.state, "follow guard");
  assert.equal(followed.rejection, undefined);
  assert.equal(followed.state.locationId, "square");
  assert.equal(followed.state.clocks["raider-plan"], 4);
  assert.equal(followed.state.npcLocations.guard, "square");
  assert.match(
    game.renderResult(followed),
    /follow Cellar Guard through the adjacent route/,
  );
  assert.deepEqual(followed.state.witnessedDepartures, {});
  const repeated = act(game, followed.state, "follow guard");
  assert.notEqual(repeated.rejection, undefined);
  assert.deepEqual(repeated.state, followed.state);
});

test("expired and off-screen departures cannot be followed", () => {
  const game = runtime();
  const witnessed = act(game, cellarAtDayTwo(game), "wait days 1").state;
  const expired = act(game, witnessed, "wait days 1").state;
  assert.doesNotMatch(
    game.renderResult(act(game, expired, "look")),
    /follow guard/,
  );
  assert.deepEqual(act(game, expired, "follow guard").state, expired);
  assert.match(
    game.renderResult(act(game, expired, "follow guard")),
    /no fresh witnessed trail/i,
  );

  const offscreen = act(game, game.createSession(), "wait days 3").state;
  assert.equal(offscreen.npcLocations.guard, "square");
  assert.deepEqual(offscreen.witnessedDepartures, {});
  assert.doesNotMatch(
    game.projectDmScene(offscreen).room.description,
    /follow guard/,
  );
  assert.equal(
    game
      .getGameToolDefinitions(offscreen)
      .some(({ name }) => name === "follow"),
    false,
  );

  let arriving = act(game, game.createSession(), "move square").state;
  arriving = act(game, arriving, "wait days 1").state;
  const arrival = act(game, arriving, "move cellar");
  assert.equal(arrival.state.clocks["raider-plan"], 3);
  assert.equal(arrival.state.npcLocations.guard, "square");
  assert.deepEqual(arrival.state.witnessedDepartures, {});
  assert.doesNotMatch(game.renderResult(arrival), /guard leaves the cellar/);
  assert.doesNotMatch(
    game.renderResult(act(game, arrival.state, "look")),
    /follow guard/,
  );
});

test("a trail at the maximum day expires after another time-bearing action", () => {
  const snapshot = structuredClone(content);
  const thresholds = snapshot.clocks[0].thresholds;
  thresholds.find(({ at }) => at === 3).at = 8;
  thresholds.sort((left, right) => left.at - right.at);
  const game = runtime(snapshot);
  let state = cellarAtDayTwo(game);
  state = act(game, state, "wait days 5").state;
  state = act(game, state, "wait days 1").state;
  assert.equal(state.clocks["raider-plan"], 8);
  assert.match(game.renderResult(act(game, state, "look")), /follow guard/);
  const later = act(game, state, "search route-register").state;
  assert.equal(later.clocks["raider-plan"], 8);
  assert.doesNotMatch(
    game.renderResult(act(game, later, "look")),
    /follow guard/,
  );
  assert.deepEqual(act(game, later, "follow guard").state, later);
});

test("blocked route and dead witness give a truthful reason without time cost", () => {
  const game = runtime();
  const witnessed = act(game, cellarAtDayTwo(game), "wait days 1").state;
  const dead = {
    ...witnessed,
    npcHealth: {
      ...witnessed.npcHealth,
      guard: { ...witnessed.npcHealth.guard, hp: 0 },
    },
    npcDeathLocations: { ...witnessed.npcDeathLocations, guard: "square" },
  };
  assert.match(game.renderResult(act(game, dead, "follow guard")), /dead/);
  assert.deepEqual(act(game, dead, "follow guard").state, dead);

  const blocked = structuredClone(content);
  blocked.npcs.find(({ id }) => id === "guard").locationId = "hall";
  const departure = blocked.clocks[0].thresholds.find(({ at }) => at === 3)
    .effects[0];
  departure.fromLocationId = "hall";
  departure.toLocationId = "square";
  blocked.clocks[0].thresholds
    .find(({ at }) => at === 3)
    .visibleFrom.push("hall");
  const blockedGame = runtime(blocked);
  const trail = act(
    blockedGame,
    blockedGame.createSession(),
    "wait days 3",
  ).state;
  const barricaded = { ...trail, barricades: ["cart-short-passage"] };
  assert.match(
    blockedGame.renderResult(act(blockedGame, barricaded, "follow guard")),
    /route toward Square is blocked/,
  );
  assert.deepEqual(
    act(blockedGame, barricaded, "follow guard").state,
    barricaded,
  );
});

test("AI follow matches command behavior and requires explicit intent", () => {
  const game = runtime();
  const witnessed = act(game, cellarAtDayTwo(game), "wait days 1").state;
  const call = { name: "follow", argumentsJson: '{"npcId":"guard"}' };
  const unrelated = game.dispatchGameTool(
    witnessed,
    call,
    undefined,
    "Wait for the guard.",
  );
  assert.equal(unrelated.modelOutput.ok, false);
  assert.deepEqual(unrelated.state, witnessed);
  const followed = game.dispatchGameTool(
    witnessed,
    call,
    undefined,
    "Follow guard.",
  );
  assert.equal(followed.modelOutput.ok, true);
  assert.deepEqual(followed.state, act(game, witnessed, "follow guard").state);
});

test("a lost trail leaves the late reporting route playable", () => {
  const game = runtime();
  let state = act(game, game.createSession(), "wait days 7").state;
  const failed = act(game, state, "follow guard");
  assert.notEqual(failed.rejection, undefined);
  assert.deepEqual(failed.state, state);
  for (const command of [
    "move back lane",
    "move square",
    "talk guard request-passage persuade",
    "move cellar",
    "search route-register",
    "move square",
    "move back lane",
    "move hall",
    "resolve file-register",
  ]) {
    const result = act(game, state, command);
    assert.equal(
      result.rejection,
      undefined,
      `${command}: ${game.renderResult(result)}`,
    );
    state = result.state;
  }
  assert.equal(state.ending.id, "file-register");
  assert.ok(state.ending.consequences.includes("deadline-missed"));
});

test("follow survives restart and replay", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-78-"));
  try {
    const save = join(directory, "save.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const run = (input, args) => {
      const result = spawnSync(process.execPath, [cli, ...args], {
        input,
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, OPENAI_API_KEY: "" },
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    run("move square\nmove cellar\nwait days 1\n", [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--save",
      save,
      "--trace",
      first,
    ]);
    assert.equal(
      JSON.parse(readFileSync(save, "utf8")).checkpoint.state
        .witnessedDepartures.guard.to,
      "square",
    );
    run("follow guard\n", [
      "--resume",
      save,
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    const saved = JSON.parse(readFileSync(save, "utf8"));
    assert.equal(saved.checkpoint.state.locationId, "square");
    assert.equal(saved.checkpoint.state.clocks["raider-plan"], 4);
    assert.equal(
      saved.transitions.filter(({ action }) => action.type === "follow").length,
      1,
    );
    assert.equal(
      saved.transitions
        .flatMap(({ domainEvents }) => domainEvents)
        .filter(
          ({ type, actorId }) =>
            type === "actor-relocated" && actorId === "player",
        ).length,
      3,
    );
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/,
    );

    const lostSave = join(directory, "lost-save.json");
    const lostFirst = join(directory, "lost-first.json");
    const lostSecond = join(directory, "lost-second.json");
    run("move square\nmove cellar\nwait days 1\nwait days 1\n", [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--save",
      lostSave,
      "--trace",
      lostFirst,
    ]);
    const beforeFailure = JSON.parse(readFileSync(lostSave, "utf8")).checkpoint
      .state;
    const failureOutput = run("follow guard\n", [
      "--resume",
      lostSave,
      "--trace",
      lostSecond,
      "--previous-trace",
      lostFirst,
    ]);
    assert.match(failureOutput, /no fresh witnessed trail/i);
    const afterFailure = JSON.parse(readFileSync(lostSave, "utf8"));
    assert.deepEqual(afterFailure.checkpoint.state, beforeFailure);
    assert.equal(
      afterFailure.transitions.some(({ action }) => action.type === "follow"),
      false,
    );
    assert.match(
      run("", ["--replay", lostFirst, lostSecond]),
      /Trace verified successfully/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
