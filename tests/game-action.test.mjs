import assert from "node:assert/strict";
import test from "node:test";

import {
  createSession,
  handleAction,
  handleGameAction,
} from "../dist/session.js";
import { createSeededRandom } from "../dist/random.js";

test("canonical look uses the same authoritative result as command look", () => {
  const initial = createSession();

  assert.deepEqual(
    handleGameAction(initial, { type: "look" }),
    handleAction(initial, { type: "look" }),
  );
});

test("canonical inspection resolves discriminated stable references authoritatively", () => {
  const initial = createSession();
  const cases = [
    {
      target: { type: "feature", featureId: "ruined-archway" },
      expected: {
        events: [
          {
            type: "target-inspected",
            target: { type: "feature", id: "ruined-archway" },
          },
        ],
      },
    },
    {
      target: { type: "door", doorId: "entrance-door" },
      expected: {
        events: [
          {
            type: "target-inspected",
            target: { type: "door", id: "entrance-door", open: false },
          },
        ],
      },
    },
    {
      target: { type: "item", itemId: "signet" },
      expected: {
        rejection: { reason: "invisible-target", target: "signet" },
      },
    },
    {
      target: { type: "opponent", opponentId: "goblin" },
      expected: {
        rejection: { reason: "invisible-target", target: "goblin" },
      },
    },
    {
      target: { type: "named-exit", destinationId: "guardroom" },
      expected: {
        events: [
          {
            type: "target-inspected",
            target: {
              type: "exit",
              id: "guardroom",
              doorway: { doorId: "entrance-door", open: false },
            },
          },
        ],
      },
    },
  ];

  for (const { target, expected } of cases) {
    const result = handleGameAction(initial, { type: "inspect", target });
    assert.deepEqual(result.state, initial);
    if (expected.events !== undefined) {
      assert.deepEqual(result.events, expected.events);
    } else {
      assert.deepEqual(result.rejection, expected.rejection);
    }
  }
});

test("canonical opponent inspection reports living and defeated conditions without effects", () => {
  const initial = createSession();
  const livingState = {
    ...initial,
    locationId: "guardroom",
  };
  const defeatedState = {
    ...livingState,
    opponents: { goblin: { ...initial.opponents.goblin, hp: 0 } },
  };
  const random = {
    roll() {
      assert.fail("inspection must not consume randomness");
    },
  };

  for (const [state, condition] of [
    [livingState, "living"],
    [defeatedState, "defeated"],
  ]) {
    const result = handleGameAction(
      state,
      {
        type: "inspect",
        target: { type: "opponent", opponentId: "goblin" },
      },
      random,
    );

    assert.equal(result.state, state);
    assert.deepEqual(result.events, [
      {
        type: "target-inspected",
        target: {
          type: "opponent",
          id: "goblin",
          description:
            "A wiry goblin in battered leather grips a nicked scimitar.",
          condition,
        },
      },
    ]);
  }
});

test("canonical stable-ID actions complete the seeded victory path", () => {
  const random = createSeededRandom(0);
  let state = createSession();
  const actions = [
    { type: "open", doorId: "entrance-door" },
    { type: "move", destinationId: "guardroom" },
    { type: "attack", opponentId: "goblin" },
    { type: "attack", opponentId: "goblin" },
    { type: "move", destinationId: "reliquary" },
    { type: "take", itemId: "signet" },
    { type: "leave" },
  ];
  const results = [];

  for (const action of actions) {
    const result = handleGameAction(state, action, random);
    results.push(result);
    state = result.state;
  }

  const events = results.flatMap((result) => result.events ?? []);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "door-opened",
      "room-entered",
      "room-described",
      "combat-started",
      "initiative-rolled",
      "initiative-rolled",
      "turn-started",
      "attack-resolved",
      "turn-started",
      "attack-resolved",
      "turn-started",
      "attack-resolved",
      "combat-ended",
      "room-entered",
      "room-described",
      "item-taken",
      "victory",
    ],
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === "initiative-rolled")
      .map(({ combatantId, roll, total }) => ({ combatantId, roll, total })),
    [
      { combatantId: "fighter", roll: 6, total: 7 },
      { combatantId: "goblin", roll: 1, total: 3 },
    ],
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === "attack-resolved")
      .map(({ attackerId, attackRoll, outcome, damage, targetHp }) => ({
        attackerId,
        attackRoll,
        outcome,
        damage: damage ?? 0,
        targetHp,
      })),
    [
      {
        attackerId: "fighter",
        attackRoll: 5,
        outcome: "miss",
        damage: 0,
        targetHp: 7,
      },
      {
        attackerId: "goblin",
        attackRoll: 3,
        outcome: "miss",
        damage: 0,
        targetHp: 20,
      },
      {
        attackerId: "fighter",
        attackRoll: 10,
        outcome: "hit",
        damage: 8,
        targetHp: 0,
      },
    ],
  );
  assert.equal(state.status, "victory");
  assert.equal(state.locationId, "reliquary");
  assert.deepEqual(state.itemPlacements.signet, { type: "inventory" });
  assert.equal(state.opponents.goblin.hp, 0);
  assert.equal(state.fighter.hp, 20);
});

test("canonical actions enforce world restrictions without draws or state changes", () => {
  const initial = createSession();
  let draws = 0;
  const random = {
    roll() {
      draws += 1;
      return 1;
    },
  };
  const remoteDoor = handleGameAction(
    { ...initial, locationId: "reliquary" },
    { type: "open", doorId: "entrance-door" },
    random,
  );
  const cases = [
    [
      handleGameAction(
        initial,
        { type: "move", destinationId: "reliquary" },
        random,
      ),
      { reason: "nonadjacent-destination", destinationId: "reliquary" },
    ],
    [
      handleGameAction(
        initial,
        { type: "move", destinationId: "guardroom" },
        random,
      ),
      {
        reason: "closed-door",
        doorId: "entrance-door",
        destinationId: "guardroom",
      },
    ],
    [remoteDoor, { reason: "invisible-target", target: "wooden door" }],
    [
      handleGameAction(initial, { type: "take", itemId: "signet" }, random),
      { reason: "invisible-target", target: "signet" },
    ],
    [
      handleGameAction(
        initial,
        { type: "attack", opponentId: "goblin" },
        random,
      ),
      { reason: "invalid-attack-target", target: "goblin" },
    ],
    [
      handleGameAction(initial, { type: "leave" }, random),
      { reason: "leave-requirement", requirement: "reliquary" },
    ],
  ];

  for (const [result, rejection] of cases) {
    assert.deepEqual(result.rejection, rejection);
    assert.equal("events" in result, false);
  }
  assert.equal(draws, 0);
});

test("canonical actions enforce ownership, combat, life-state, and terminal restrictions", () => {
  const initial = createSession();
  const inventoryState = {
    ...initial,
    itemPlacements: { signet: { type: "inventory" } },
  };
  const deadGoblinState = {
    ...initial,
    locationId: "guardroom",
    opponents: { goblin: { ...initial.opponents.goblin, hp: 0 } },
  };
  const deadEscapeState = {
    ...inventoryState,
    locationId: "reliquary",
    fighter: { ...initial.fighter, hp: 0 },
  };
  const combatState = {
    ...initial,
    locationId: "guardroom",
    doorStates: { "entrance-door": { open: true } },
  };

  assert.deepEqual(
    handleGameAction(inventoryState, { type: "take", itemId: "signet" })
      .rejection,
    { reason: "already-carried", itemId: "signet" },
  );
  assert.deepEqual(
    handleGameAction(deadGoblinState, {
      type: "attack",
      opponentId: "goblin",
    }).rejection,
    { reason: "dead-target", targetId: "goblin" },
  );
  assert.deepEqual(
    handleGameAction(deadEscapeState, { type: "leave" }).rejection,
    { reason: "leave-requirement", requirement: "living-fighter" },
  );
  assert.deepEqual(
    handleGameAction(combatState, {
      type: "open",
      doorId: "entrance-door",
    }).rejection,
    { reason: "combat-restriction" },
  );
  assert.deepEqual(
    handleGameAction(
      { ...initial, status: "victory" },
      { type: "move", destinationId: "guardroom" },
    ).rejection,
    { reason: "terminal-state", status: "victory" },
  );
});

test("the command adapter matches canonical accepted and rejected results", () => {
  const initial = createSession();
  const pairs = [
    [{ type: "look" }, { type: "look" }],
    [
      { type: "inspect", target: "ruined archway" },
      {
        type: "inspect",
        target: { type: "feature", featureId: "ruined-archway" },
      },
    ],
    [
      { type: "inspect", target: "guardroom" },
      {
        type: "inspect",
        target: { type: "named-exit", destinationId: "guardroom" },
      },
    ],
    [
      { type: "move", destination: "guardroom" },
      { type: "move", destinationId: "guardroom" },
    ],
    [
      { type: "open", target: "wooden door" },
      { type: "open", doorId: "entrance-door" },
    ],
    [
      { type: "take", target: "signet" },
      { type: "take", itemId: "signet" },
    ],
    [
      { type: "attack", target: "goblin" },
      { type: "attack", opponentId: "goblin" },
    ],
    [{ type: "leave" }, { type: "leave" }],
  ];

  for (const [commandAction, gameAction] of pairs) {
    assert.deepEqual(
      handleAction(initial, commandAction),
      handleGameAction(initial, gameAction),
    );
  }
});

test("the command adapter delegates hidden and remote inspections by stable ID", () => {
  const initial = createSession();
  const cases = [
    {
      state: initial,
      commandAction: { type: "inspect", target: "cold hearth" },
      gameAction: {
        type: "inspect",
        target: { type: "feature", featureId: "cold-hearth" },
      },
    },
    {
      state: initial,
      commandAction: { type: "inspect", target: "signet" },
      gameAction: {
        type: "inspect",
        target: { type: "item", itemId: "signet" },
      },
    },
    {
      state: initial,
      commandAction: { type: "inspect", target: "goblin" },
      gameAction: {
        type: "inspect",
        target: { type: "opponent", opponentId: "goblin" },
      },
    },
    {
      state: initial,
      commandAction: { type: "inspect", target: "reliquary" },
      gameAction: {
        type: "inspect",
        target: { type: "named-exit", destinationId: "reliquary" },
      },
    },
    {
      state: { ...initial, locationId: "reliquary" },
      commandAction: { type: "inspect", target: "wooden door" },
      gameAction: {
        type: "inspect",
        target: { type: "door", doorId: "entrance-door" },
      },
    },
  ];

  for (const { state, commandAction, gameAction } of cases) {
    assert.deepEqual(
      handleAction(state, commandAction),
      handleGameAction(state, gameAction),
    );
  }
});
