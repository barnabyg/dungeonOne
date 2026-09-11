import assert from "node:assert/strict";
import test from "node:test";

import { createSession } from "../dist/session.js";
import { createSeededRandom } from "../dist/random.js";
import {
  dispatchGameTool,
  getGameToolDefinitions,
  projectCharacterStatus,
  projectDmScene,
} from "../dist/game-tools.js";

test("scene projection exposes only the visible entrance context", () => {
  const initial = createSession();

  const scene = projectDmScene(initial);
  assert.deepEqual(scene, {
    title: "The Stolen Signet",
    objective:
      "Retrieve the stolen signet and leave through the reliquary's far exit.",
    outcome: "playing",
    room: {
      id: "entrance",
      name: "Entrance",
      description:
        "You stand at the entrance to a ruined watchtower. Rain beads on the old stone.",
      features: [
        {
          id: "ruined-archway",
          name: "ruined archway",
          description:
            "The cracked archway still bears the worn crest of the old watch.",
        },
      ],
      items: [],
      opponents: [],
      exits: [
        {
          destinationId: "guardroom",
          name: "Guardroom",
          doorway: {
            doorId: "entrance-door",
            name: "wooden door",
            open: false,
          },
        },
      ],
    },
  });
  const serialized = JSON.stringify(scene);
  assert.equal(serialized.includes("A vaulted reliquary"), false);
  assert.equal(serialized.includes("silver signet"), false);
  assert.equal(serialized.includes("wiry goblin"), false);
  assert.equal(serialized.includes("initiative"), false);
  assert.equal(serialized.includes("seed"), false);
});

test("all eight tools complete the canonical victory without leaking carried details", () => {
  const random = createSeededRandom(0);
  let state = createSession();
  const execute = (name, argumentsJson = "{}") => {
    const result = dispatchGameTool(state, { name, argumentsJson }, random);
    state = result.state;
    return result;
  };

  const look = execute("look");
  const status = execute("get_character_status");
  const feature = execute(
    "inspect",
    '{"target":{"type":"feature","feature_id":"ruined-archway"}}',
  );
  execute("open", '{"door_id":"entrance-door"}');
  const entered = execute("move", '{"destination_id":"guardroom"}');
  const firstAttack = execute("attack", '{"opponent_id":"goblin"}');
  execute("attack", '{"opponent_id":"goblin"}');
  const corpse = execute(
    "inspect",
    '{"target":{"type":"opponent","opponent_id":"goblin"}}',
  );
  execute("move", '{"destination_id":"reliquary"}');
  execute("take", '{"item_id":"signet"}');
  const sceneAfterTake = projectDmScene(state);
  const carried = execute(
    "inspect",
    '{"target":{"type":"item","item_id":"signet"}}',
  );
  const victory = execute("leave");

  assert.deepEqual(look.state, createSession());
  assert.equal(status.modelOutput.status.hp, 20);
  assert.equal(feature.modelOutput.inspection.id, "ruined-archway");
  assert.equal(entered.state.locationId, "guardroom");
  assert.deepEqual(
    firstAttack.engineResult.events
      .filter((event) => event.type === "attack-resolved")
      .map(({ attackerId, attackRoll }) => ({ attackerId, attackRoll })),
    [
      { attackerId: "fighter", attackRoll: 5 },
      { attackerId: "goblin", attackRoll: 3 },
    ],
  );
  assert.equal(corpse.modelOutput.inspection.condition, "defeated");
  assert.deepEqual(sceneAfterTake.room.items, []);
  assert.equal("collectedItems" in sceneAfterTake, false);
  assert.deepEqual(carried.modelOutput.inspection, {
    type: "item",
    id: "signet",
    name: "signet",
    description:
      "A silver signet engraved with the fighter's family crest, stolen but unharmed.",
  });
  assert.equal(victory.state.status, "victory");
  assert.equal(victory.modelOutput.scene.outcome, "victory");
});

test("read and rejected dispatcher calls preserve the later seeded combat rolls", () => {
  const random = createSeededRandom(0);
  let state = createSession();
  const call = (name, argumentsJson = "{}") => {
    const result = dispatchGameTool(state, { name, argumentsJson }, random);
    state = result.state;
    return result;
  };

  call("look");
  call("get_character_status");
  call("move", '{"destination_id":"reliquary"}');
  const closed = call("move", '{"destination_id":"guardroom"}');
  call(
    "inspect",
    '{"target":{"type":"feature","feature_id":"ruined-archway"}}',
  );
  call("open", '{"door_id":"entrance-door"}');
  const entered = call("move", '{"destination_id":"guardroom"}');

  assert.deepEqual(closed.engineResult, {
    rejection: {
      reason: "closed-door",
      doorId: "entrance-door",
      destinationId: "guardroom",
    },
  });
  assert.deepEqual(
    entered.engineResult.events
      .filter((event) => event.type === "initiative-rolled")
      .map(({ combatantId, roll }) => ({ combatantId, roll })),
    [
      { combatantId: "fighter", roll: 6 },
      { combatantId: "goblin", roll: 1 },
    ],
  );
});

test("dispatcher rejects untrusted names, JSON, shapes, and references without effects", () => {
  const initial = createSession();
  let draws = 0;
  const random = {
    roll() {
      draws += 1;
      return 1;
    },
  };
  const cases = [
    [{ name: "teleport", argumentsJson: "{}" }, "unknown-tool"],
    [{ name: "look", argumentsJson: "{" }, "malformed-json"],
    [{ name: "look", argumentsJson: "null" }, "invalid-arguments"],
    [{ name: "look", argumentsJson: 42 }, "invalid-arguments"],
    [{ name: "look", argumentsJson: '{"extra":true}' }, "invalid-arguments"],
    [
      { name: "move", argumentsJson: '{"destination_id":7}' },
      "invalid-arguments",
    ],
    [
      {
        name: "inspect",
        argumentsJson:
          '{"target":{"type":"feature","feature_id":"ruined-archway","extra":"secret"}}',
      },
      "invalid-arguments",
    ],
    [
      { name: "move", argumentsJson: '{"destination_id":"reliquary"}' },
      "unavailable-reference",
    ],
    [
      { name: "move", argumentsJson: '{"destination_id":"cellar"}' },
      "unavailable-reference",
    ],
    [
      { name: "take", argumentsJson: '{"item_id":"signet"}' },
      "unavailable-reference",
    ],
    [
      {
        name: "inspect",
        argumentsJson: '{"target":{"type":"opponent","opponent_id":"goblin"}}',
      },
      "unavailable-reference",
    ],
  ];

  for (const [call, code] of cases) {
    const result = dispatchGameTool(initial, call, random);
    assert.equal(result.state, initial);
    assert.deepEqual(result.modelOutput, {
      ok: false,
      error: { code },
    });
    assert.equal(result.engineResult, undefined);
  }
  assert.equal(draws, 0);
});

test("dispatcher inspects every visible reference kind through public data", () => {
  const initial = createSession();
  const calls = [
    {
      argumentsJson:
        '{"target":{"type":"feature","feature_id":"ruined-archway"}}',
      type: "feature",
    },
    {
      argumentsJson: '{"target":{"type":"door","door_id":"entrance-door"}}',
      type: "door",
    },
    {
      argumentsJson:
        '{"target":{"type":"named_exit","destination_id":"guardroom"}}',
      type: "named_exit",
    },
  ];

  for (const { argumentsJson, type } of calls) {
    const result = dispatchGameTool(initial, {
      name: "inspect",
      argumentsJson,
    });
    assert.equal(result.state, initial);
    assert.equal(result.modelOutput.ok, true);
    assert.equal(result.modelOutput.inspection.type, type);
  }
});

function assertStrictObjectSchemas(value) {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (value.type === "object") {
    assert.equal(value.additionalProperties, false);
    assert.deepEqual(
      [...value.required].sort(),
      Object.keys(value.properties).sort(),
    );
  }
  for (const nested of Object.values(value)) {
    assertStrictObjectSchemas(nested);
  }
}

test("tool definitions are strict and expose only currently relevant references", () => {
  const initial = createSession();
  const definitions = getGameToolDefinitions(initial);
  const byName = Object.fromEntries(
    definitions.map((definition) => [definition.name, definition]),
  );

  assert.deepEqual(Object.keys(byName), [
    "look",
    "move",
    "inspect",
    "open",
    "leave",
    "get_character_status",
  ]);
  assert.equal(
    definitions.every((definition) => definition.strict),
    true,
  );
  assert.equal(
    definitions.every((definition) => definition.type === "function"),
    true,
  );
  assertStrictObjectSchemas(definitions);

  const serialized = JSON.stringify(definitions);
  assert.equal(serialized.includes("guardroom"), true);
  assert.equal(serialized.includes("ruined-archway"), true);
  assert.equal(serialized.includes("entrance-door"), true);
  assert.equal(serialized.includes("reliquary"), false);
  assert.equal(serialized.includes("stone-pedestal"), false);
  assert.equal(serialized.includes("signet"), false);
  assert.equal(serialized.includes("goblin"), false);
  assert.equal(serialized.includes('"enum":[]'), false);

  const guardroom = {
    ...initial,
    locationId: "guardroom",
    doorStates: { "entrance-door": { open: true } },
  };
  const guardroomNames = getGameToolDefinitions(guardroom).map(
    ({ name }) => name,
  );
  assert.equal(guardroomNames.includes("attack"), true);
  assert.equal(guardroomNames.includes("take"), false);

  const reliquary = {
    ...initial,
    locationId: "reliquary",
    opponents: { goblin: { hp: 0, maxHp: 7 } },
  };
  const reliquaryNames = getGameToolDefinitions(reliquary).map(
    ({ name }) => name,
  );
  assert.equal(reliquaryNames.includes("take"), true);
  assert.equal(reliquaryNames.includes("open"), false);
  assert.equal(reliquaryNames.includes("attack"), false);

  const terminalNames = getGameToolDefinitions({
    ...guardroom,
    status: "defeat",
    fighter: { ...guardroom.fighter, hp: 0 },
  }).map(({ name }) => name);
  assert.deepEqual(terminalNames, ["look", "inspect", "get_character_status"]);
});

test("ended combat exposes the opponent condition without a stale combat turn", () => {
  const initial = createSession();
  const defeated = {
    ...initial,
    locationId: "guardroom",
    status: "defeat",
    fighter: { ...initial.fighter, hp: 0 },
    combat: {
      opponentId: "goblin",
      initiative: {
        fighter: { combatantId: "fighter", roll: 1, bonus: 1, total: 2 },
        goblin: { combatantId: "goblin", roll: 20, bonus: 2, total: 22 },
      },
      turnOrder: ["goblin", "fighter"],
      currentTurn: "goblin",
    },
  };

  assert.equal(projectDmScene(defeated).combat, undefined);
  assert.equal(projectCharacterStatus(defeated).combatTurn, undefined);
  assert.equal(projectDmScene(defeated).outcome, "defeat");

  let draws = 0;
  const rejected = dispatchGameTool(
    {
      ...defeated,
      status: "playing",
      fighter: { ...defeated.fighter, hp: 20 },
      opponents: { goblin: { hp: 0, maxHp: 7 } },
    },
    { name: "attack", argumentsJson: '{"opponent_id":"goblin"}' },
    {
      roll() {
        draws += 1;
        return 1;
      },
    },
  );
  assert.deepEqual(rejected.modelOutput, {
    ok: false,
    error: { code: "unavailable-reference" },
  });
  assert.equal(rejected.engineResult, undefined);
  assert.equal(draws, 0);
});

test("scene and status projections cover rooms, combat, outcomes, and inventory", () => {
  const initial = createSession();
  const guardroom = {
    ...initial,
    locationId: "guardroom",
    doorStates: { "entrance-door": { open: true } },
    combat: {
      opponentId: "goblin",
      initiative: {
        fighter: { combatantId: "fighter", roll: 10, bonus: 1, total: 11 },
        goblin: { combatantId: "goblin", roll: 5, bonus: 2, total: 7 },
      },
      turnOrder: ["fighter", "goblin"],
      currentTurn: "fighter",
    },
  };
  const reliquary = {
    ...initial,
    locationId: "reliquary",
    status: "victory",
    itemPlacements: { signet: { type: "inventory" } },
    opponents: { goblin: { hp: 0, maxHp: 7 } },
  };

  const combatScene = projectDmScene(guardroom);
  assert.deepEqual(combatScene.room.opponents, [
    { id: "goblin", name: "goblin", condition: "living" },
  ]);
  assert.deepEqual(combatScene.combat, {
    opponentId: "goblin",
    currentTurn: "fighter",
  });
  assert.equal(combatScene.room.exits.length, 2);
  assert.equal(combatScene.room.exits[0].doorway.open, true);

  const finalScene = projectDmScene(reliquary);
  assert.equal(finalScene.outcome, "victory");
  assert.deepEqual(finalScene.room.items, []);
  assert.equal(JSON.stringify(finalScene).includes("guardroom"), true);
  assert.equal(JSON.stringify(finalScene).includes("goblin"), false);

  assert.deepEqual(projectCharacterStatus(reliquary), {
    hp: 20,
    maxHp: 20,
    equipment: [{ id: "longsword", name: "longsword" }],
    collectedItems: [{ id: "signet", name: "signet" }],
    outcome: "victory",
  });

  assert.deepEqual(projectCharacterStatus(guardroom), {
    hp: 20,
    maxHp: 20,
    equipment: [{ id: "longsword", name: "longsword" }],
    collectedItems: [],
    outcome: "playing",
    combatTurn: "fighter",
  });
});
