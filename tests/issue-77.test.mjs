import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { projectDmHistory } from "../dist/dm-history.js";
import { OFFER_SCHEMA } from "../dist/offer-schema.js";

const fixture = fileURLToPath(
  new URL("../adventures/bribed-crossroads.json", import.meta.url),
);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const content = JSON.parse(readFileSync(fixture, "utf8"));

function runtime(source = content) {
  const loaded = loadAdventure(JSON.stringify(source));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

function act(game, state, command) {
  return game.handleAction(state, game.parseCommand(command));
}

function cellarWithTonic(game) {
  const cellar = act(game, game.createSession(), "move cellar").state;
  return act(game, cellar, "take tonic").state;
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

test("schema v9 validates bounded offer profiles and preserves v8", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v9.schema.json", "utf8")),
    OFFER_SCHEMA,
  );
  assert.equal(
    loadAdventure(readFileSync("adventures/deceptive-crossroads.json")).ok,
    true,
  );
  for (const mutate of [
    (copy) => {
      copy.offerProfiles[0].npcId = "missing";
    },
    (copy) => {
      copy.offerProfiles[0].itemId = "missing";
    },
    (copy) => {
      copy.offerProfiles[0].itemCost = "vanished";
    },
    (copy) => {
      copy.offerProfiles[0].timeCost = 99;
    },
    (copy) => {
      copy.offerProfiles[0].relationship.tier = "neutral";
    },
    (copy) => {
      copy.offerProfiles[1].relationship = { tier: "trusted", reason: "No" };
    },
  ]) {
    const copy = structuredClone(content);
    mutate(copy);
    assert.equal(loadAdventure(JSON.stringify(copy)).ok, false);
  }
});

test("accepted offer spends one carried tonic without healing and changes the guard response", () => {
  const game = runtime();
  const start = cellarWithTonic(game);
  assert.deepEqual(
    game.getGameToolDefinitions(start).find(({ name }) => name === "offer")
      .parameters.properties.profileId.enum,
    ["guard-tonic"],
  );
  const action = game.parseCommand("offer tonic to guard");
  assert.deepEqual(action, {
    type: "offer",
    profileId: "guard-tonic",
    npcId: "guard",
    itemId: "restorative-tonic",
  });
  const rng = {
    calls: 0,
    roll() {
      this.calls++;
      return 1;
    },
  };
  const result = game.handleAction(start, action, rng);
  assert.equal(result.rejection, undefined);
  assert.equal(rng.calls, 0);
  assert.equal(result.state.fighter.hp, start.fighter.hp);
  assert.equal(result.state.items["restorative-tonic"], "consumed");
  assert.equal(result.state.relationships.guard.tier, "trusted");
  assert.equal(result.state.offers["guard-tonic"], "accepted");
  assert.equal(
    result.state.clocks["raider-plan"],
    start.clocks["raider-plan"] + 1,
  );
  assert.match(
    game.renderResult(result),
    /Offer accepted.*restorative tonic is spent.*neutral → trusted.*No healing occurs/s,
  );
  assert.match(
    game.renderResult(act(game, result.state, "talk guard return ask")),
    /Welcome back/,
  );
  assert.match(
    game.renderResult(act(game, result.state, "look")),
    /accepted the restorative tonic; it was spent/,
  );
  assert.match(
    game.renderResult(act(game, result.state, "inventory")),
    /Inventory: empty/,
  );
  assert.match(
    game.renderResult(act(game, result.state, "use tonic")),
    /not visible|cannot|unavailable/i,
  );
  const tool = game.dispatchGameTool(
    start,
    {
      name: "offer",
      argumentsJson: JSON.stringify({ profileId: "guard-tonic" }),
    },
    rng,
    "Offer the tonic to the guard",
  );
  assert.equal(tool.modelOutput.ok, true);
  assert.deepEqual(tool.state, result.state);
});

test("an already trusted guard remains eligible for the authored offer", () => {
  const game = runtime();
  const carried = cellarWithTonic(game);
  const trusted = act(game, carried, "talk guard help ask").state;
  assert.equal(trusted.relationships.guard.tier, "trusted");
  assert.deepEqual(
    game.getGameToolDefinitions(trusted).find(({ name }) => name === "offer")
      .parameters.properties.profileId.enum,
    ["guard-tonic"],
  );
  const offered = act(game, trusted, "offer tonic to guard");
  assert.equal(offered.rejection, undefined);
  assert.equal(offered.state.relationships.guard.tier, "trusted");
  assert.notEqual(
    offered.state.relationships.guard.reason,
    trusted.relationships.guard.reason,
  );
  assert.equal(offered.state.items["restorative-tonic"], "consumed");
});

test("refused offer follows retained-item policy and keeps healing available", () => {
  const game = runtime();
  const cellar = cellarWithTonic(game);
  const square = act(game, cellar, "move square").state;
  const hall = act(game, square, "move hall").state;
  const result = act(game, hall, "offer restorative tonic to lysa");
  assert.equal(result.rejection, undefined);
  assert.equal(result.state.items["restorative-tonic"], "inventory");
  assert.equal(
    result.state.relationships.lysa.tier,
    hall.relationships.lysa.tier,
  );
  assert.equal(result.state.offers["lysa-tonic"], "refused");
  assert.equal(
    result.state.clocks["raider-plan"],
    hall.clocks["raider-plan"] + 1,
  );
  assert.match(
    game.renderResult(result),
    /Offer refused.*kept in your inventory.*Relationship unchanged/s,
  );
  assert.match(
    game.renderResult(act(game, result.state, "inventory")),
    /restorative tonic/,
  );
  const wounded = { ...result.state, fighter: { hp: 10, maxHp: 20 } };
  const used = game.handleAction(wounded, game.parseCommand("use tonic"), {
    roll: () => 2,
  });
  assert.equal(used.state.fighter.hp, 13);
  assert.equal(used.state.items["restorative-tonic"], "consumed");
});

test("an authored refusal may spend the item, but says so without healing", () => {
  const copy = structuredClone(content);
  copy.offerProfiles[1].itemCost = "consumed";
  const game = runtime(copy);
  const cellar = cellarWithTonic(game);
  const hall = act(
    game,
    act(game, cellar, "move square").state,
    "move hall",
  ).state;
  const result = act(game, hall, "offer tonic to lysa");
  assert.equal(result.rejection, undefined);
  assert.equal(result.state.items["restorative-tonic"], "consumed");
  assert.equal(result.state.fighter.hp, hall.fighter.hp);
  assert.match(
    game.renderResult(result),
    /Offer refused.*restorative tonic is spent.*No healing occurs/s,
  );
});

test("stale, absent, dead, uncarried and unoffered attempts preserve state, time and RNG", () => {
  const game = runtime();
  const carried = cellarWithTonic(game);
  const action = game.parseCommand("offer tonic to guard");
  const spent = act(game, carried, "offer tonic to guard").state;
  const candidates = [
    [game.createSession(), action],
    [carried, { ...action, profileId: "missing" }],
    [carried, { ...action, itemId: "missing" }],
    [{ ...carried, locationId: "hall" }, action],
    [
      {
        ...carried,
        npcHealth: { ...carried.npcHealth, guard: { hp: 0, maxHp: 1 } },
      },
      action,
    ],
    [
      {
        ...carried,
        npcLocations: { ...carried.npcLocations, guard: "square" },
      },
      action,
    ],
    [spent, action],
  ];
  for (const [state, proposal] of candidates) {
    const rng = {
      calls: 0,
      roll() {
        this.calls++;
        return 1;
      },
    };
    const result = game.handleAction(state, proposal, rng);
    assert.equal(result.rejection.reason, "invalid-adjudication");
    assert.deepEqual(result.state, state);
    assert.equal(rng.calls, 0);
  }
  const stale = game.dispatchGameTool(
    spent,
    {
      name: "offer",
      argumentsJson: JSON.stringify({ profileId: "guard-tonic" }),
    },
    undefined,
    "Offer the tonic to the guard",
  );
  assert.equal(stale.modelOutput.ok, false);
  assert.deepEqual(stale.state, spent);
});

test("command and scripted AI save one exchange, resume it, and keep the ending consistent", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-77-"));
  try {
    for (const ai of [false, true]) {
      const save = join(directory, ai ? "ai.json" : "command.json");
      const script = join(directory, "script.json");
      writeFileSync(
        script,
        JSON.stringify([
          {
            toolCalls: [
              {
                id: "offer",
                name: "offer",
                argumentsJson: JSON.stringify({ profileId: "guard-tonic" }),
              },
            ],
          },
        ]),
      );
      const setup = run("move cellar\ntake tonic\n", [
        "--adventure-file",
        fixture,
        "--seed",
        "0",
        "--save",
        save,
      ]);
      assert.equal(setup.status, 0, setup.stderr);
      const played = run(
        ai ? "Offer the tonic to the guard\n" : "offer tonic to guard\n",
        ["--resume", save, ...(ai ? ["--ai"] : [])],
        ai ? script : undefined,
      );
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, /Offer accepted/);
      const saved = JSON.parse(readFileSync(save, "utf8"));
      const events = saved.transitions.flatMap(
        ({ domainEvents }) => domainEvents,
      );
      assert.equal(
        events.filter(({ type }) => type === "item-offered").length,
        1,
      );
      assert.equal(
        events.filter(({ type }) => type === "item-consumed").length,
        1,
      );
      assert.equal(
        events.filter(({ type }) => type === "healing-item-used").length,
        0,
      );
      assert.equal(saved.checkpoint.state.offers["guard-tonic"], "accepted");
      assert.equal(
        saved.checkpoint.state.items["restorative-tonic"],
        "consumed",
      );
      const resumed = run("look\ninventory\n", ["--resume", save]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.match(
        resumed.stdout,
        /accepted the restorative tonic; it was spent/,
      );
      assert.match(resumed.stdout, /Inventory: empty/);
      const history = projectDmHistory(
        runtime(),
        saved.checkpoint.state,
        saved.transitions,
        "guard",
      );
      assert.equal(
        history.facts.filter(({ type }) => type === "item-offered").length,
        1,
      );
      const ending = run("resolve refuse errand\n", ["--resume", save]);
      assert.equal(ending.status, 0, ending.stderr);
      assert.match(
        ending.stdout,
        /accepted the restorative tonic; it was spent/,
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
