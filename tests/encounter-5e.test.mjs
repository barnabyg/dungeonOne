import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  availableActions,
  currentCombatant,
  legalTargets,
  rollD20,
  startEncounter,
} from "../dist/encounter-5e.js";

/** Returns the queued values in order, checking each die's sides. */
function dice(...queue) {
  const drawn = [];
  return {
    drawn,
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      drawn.push({ sides, value });
      return value;
    },
  };
}

const fighter = {
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 12,
  maxHp: 12,
  dexterity: 12,
  initiativeBonus: 1,
  attack: {
    name: "Mace",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    criticalRange: 20,
  },
};
const goblin = (id = "goblin", name = "Goblin Warrior") => ({
  id,
  name,
  side: "opponents",
  armorClass: 15,
  hp: 10,
  maxHp: 10,
  dexterity: 15,
  initiativeBonus: 2,
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
});

test("each combatant rolls d20 + its bonus; higher totals act first", () => {
  const random = dice([20, 15], [20, 3]);
  const { state, events } = startEncounter([fighter, goblin()], random);
  assert.deepEqual(
    state.order.map(({ combatantId, d20, bonus, total }) => [
      combatantId,
      d20,
      bonus,
      total,
    ]),
    [
      ["pc", 15, 1, 16],
      ["goblin", 3, 2, 5],
    ],
  );
  assert.equal(currentCombatant(state).id, "pc");
  assert.deepEqual(events.at(-1), {
    type: "turn",
    combatantId: "pc",
    round: 1,
  });
  assert.equal(random.remaining(), 0);
});

test("ties go to the higher Dexterity, then to a seeded roll-off", () => {
  // Equal totals: the goblin's Dexterity 15 beats 12 without a roll-off.
  let random = dice([20, 11], [20, 10], [20, 1]);
  let { state } = startEncounter([fighter, goblin()], random);
  assert.deepEqual(
    state.order.map(({ combatantId }) => combatantId),
    ["goblin", "pc"],
  );
  assert.deepEqual(state.order[0].tieBreaks, []);

  // Equal totals and Dexterity: roll off, again while still tied.
  const twin = {
    ...goblin("twin", "Twin"),
    side: "party",
    attack: fighter.attack,
  };
  random = dice([20, 8], [20, 8], [20, 4], [20, 4], [20, 2], [20, 9], [20, 1]);
  ({ state } = startEncounter([twin, goblin()], random));
  assert.deepEqual(
    state.order.map(({ combatantId, tieBreaks }) => [combatantId, tieBreaks]),
    [
      ["goblin", [4, 9]],
      ["twin", [4, 2]],
    ],
  );
  assert.equal(currentCombatant(state).id, "twin");
});

test("an opponent that wins initiative attacks before the player's first turn", () => {
  // Goblin first: hits AC 16 with 12 + 4, for 1d6 + 2.
  const random = dice([20, 2], [20, 18], [20, 12], [6, 3]);
  const { state, events } = startEncounter([fighter, goblin()], random);
  const swing = events.find(({ type }) => type === "attack");
  assert.deepEqual(swing, {
    type: "attack",
    actorId: "goblin",
    targetId: "pc",
    weapon: "Scimitar",
    d20: 12,
    bonus: 4,
    total: 16,
    armorClass: 16,
    hit: true,
    critical: false,
    damageRolls: [3],
    damageModifier: 2,
    damage: 5,
    damageType: "slashing",
    hpAfter: 7,
  });
  assert.equal(currentCombatant(state).id, "pc");
  assert.equal(state.combatants[0].hp, 7);
  assert.equal(state.round, 1);
});

test("attacks hit on meeting AC, crit on 20 with doubled dice, always miss on 1", () => {
  const start = startEncounter([fighter, goblin()], dice([20, 20], [20, 1]));
  // 10 + 5 = 15 meets AC 15: hit for 4 + 3. Goblin misses (natural 1).
  let random = dice([20, 10], [6, 4], [20, 1]);
  let result = act(
    start.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    random,
  );
  assert.equal(result.events[0].hit, true);
  assert.equal(result.events[0].damage, 7);
  assert.equal(result.state.combatants[1].hp, 3);
  assert.equal(result.events.find((e) => e.actorId === "goblin").hit, false);
  assert.equal(result.state.round, 2);
  assert.equal(currentCombatant(result.state).id, "pc");

  // A natural 1 misses even though 1 + 5 is irrelevant; goblin 20 crits for
  // 2d6 + 2 even though its total 24 would hit anyway.
  random = dice([20, 1], [20, 20], [6, 1], [6, 2]);
  const missed = act(
    start.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    random,
  );
  assert.equal(missed.events[0].hit, false);
  assert.deepEqual(missed.events[0].damageRolls, []);
  const crit = missed.events.find((e) => e.actorId === "goblin");
  assert.equal(crit.critical, true);
  assert.deepEqual(crit.damageRolls, [1, 2]);
  assert.equal(crit.damage, 5);

  // 9 + 5 = 14 misses AC 15.
  result = act(
    start.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 9], [20, 1]),
  );
  assert.equal(result.events[0].hit, false);
});

test("a 19 crits only with a 19–20 critical range", () => {
  const champion = {
    ...fighter,
    attack: { ...fighter.attack, criticalRange: 19 },
  };
  const start = startEncounter([champion, goblin()], dice([20, 20], [20, 1]));
  const result = act(
    start.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 19], [6, 6], [6, 6]),
  );
  assert.equal(result.events[0].critical, true);
  assert.equal(result.events[0].damage, 15);
  assert.equal(result.state.outcome, "victory");
});

test("an opponent at 0 HP is defeated and the encounter ends in victory", () => {
  const start = startEncounter([fighter, goblin()], dice([20, 20], [20, 1]));
  const random = dice([20, 15], [6, 6], [20, 15], [6, 1]);
  let result = act(
    start.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    random,
  );
  // 9 damage leaves 1; the goblin then hits with 15 + 4 for 1 + 2.
  assert.equal(result.state.combatants[1].hp, 1);
  result = act(
    result.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 12], [6, 1]),
  );
  assert.deepEqual(result.events.slice(-2), [
    { type: "defeated", combatantId: "goblin" },
    { type: "ended", outcome: "victory" },
  ]);
  assert.equal(result.state.outcome, "victory");
  assert.equal(currentCombatant(result.state), undefined);
  assert.equal(random.remaining(), 0);
});

test("the player character at 0 HP is defeated at once, with no death saves", () => {
  const weak = { ...fighter, hp: 3, maxHp: 3 };
  const random = dice([20, 1], [20, 20], [20, 12], [6, 1]);
  const { state, events } = startEncounter([weak, goblin()], random);
  assert.equal(state.outcome, "defeat");
  assert.deepEqual(events.slice(-2), [
    { type: "defeated", combatantId: "pc" },
    { type: "ended", outcome: "defeat" },
  ]);
  assert.equal(random.remaining(), 0);
  const after = act(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice(),
  );
  assert.deepEqual(after, {
    state,
    rejection: { reason: "The fight is over." },
  });
});

test("out-of-turn, absent, friendly and defeated targets are rejected without dice", () => {
  const ally = { ...fighter, id: "ally", name: "Bram" };
  const start = startEncounter(
    [fighter, ally, goblin(), goblin("second", "Second Goblin")],
    dice([20, 20], [20, 19], [20, 2], [20, 1]),
  );
  assert.equal(currentCombatant(start.state).id, "pc");
  const none = dice();
  for (const [action, reason] of [
    [{ actorId: "ally", targetId: "goblin" }, /Ada's turn, not Bram's/],
    [{ actorId: "goblin", targetId: "pc" }, /Ada's turn, not Goblin Warrior's/],
    [{ actorId: "nobody", targetId: "goblin" }, /no such combatant/],
    [{ actorId: "pc", targetId: "dragon" }, /no such opponent/],
    [{ actorId: "pc", targetId: "ally" }, /on your side/],
  ]) {
    const result = act(start.state, { type: "attack", ...action }, none);
    assert.match(result.rejection.reason, reason);
    assert.equal(result.state, start.state);
  }
  const downed = {
    ...start.state,
    combatants: start.state.combatants.map((c) =>
      c.id === "second" ? { ...c, hp: 0 } : c,
    ),
  };
  assert.match(
    act(downed, { type: "attack", actorId: "pc", targetId: "second" }, none)
      .rejection.reason,
    /already defeated/,
  );
  assert.deepEqual(
    legalTargets(downed, "pc").map(({ id }) => id),
    ["goblin"],
  );
  assert.deepEqual(none.drawn, []);
});

test("sides may hold several combatants; opponents pick a target with a seeded die", () => {
  const ally = { ...fighter, id: "ally", name: "Bram" };
  // Goblin first; two living party targets, so a d2 picks Bram.
  const random = dice([20, 2], [20, 3], [20, 18], [2, 1], [20, 5]);
  const { state, events } = startEncounter([fighter, ally, goblin()], random);
  const swing = events.find(({ type }) => type === "attack");
  assert.equal(swing.targetId, "ally");
  assert.equal(swing.targetRoll, 1);
  assert.equal(currentCombatant(state).id, "ally");
  assert.deepEqual(
    legalTargets(state, "goblin").map(({ id }) => id),
    ["ally", "pc"],
  );
});

// One Fighter against two Goblin Warriors and a Goblin Boss.
const boss = {
  ...goblin("boss", "Goblin Boss"),
  armorClass: 17,
  hp: 21,
  maxHp: 21,
};
const band = () => [
  fighter,
  goblin("goblin-1", "Goblin Warrior 1"),
  goblin("goblin-2", "Goblin Warrior 2"),
  boss,
];

test("1v3: initiative orders four combatants, rolling off only among exact ties", () => {
  // pc 14 + 1 = 15; goblin-1 13 + 2 = 15 (Dex 15 beats 12); goblin-2 and the
  // boss both 9 + 2 = 11 with Dex 15, so they roll off: boss 6 beats 3.
  const random = dice(
    [20, 14],
    [20, 13],
    [20, 9],
    [20, 9],
    [20, 3],
    [20, 6],
    [20, 1],
  );
  const { state, events } = startEncounter(band(), random);
  assert.deepEqual(
    state.order.map(({ combatantId, total, tieBreaks }) => [
      combatantId,
      total,
      tieBreaks,
    ]),
    [
      ["goblin-1", 15, []],
      ["pc", 15, []],
      ["boss", 11, [6]],
      ["goblin-2", 11, [3]],
    ],
  );
  assert.equal(events[0].type, "initiative");
  // Goblin 1 acts first against the only party combatant, so no die picks
  // its target; it misses on a natural 1.
  const swing = events.find(({ type }) => type === "attack");
  assert.equal(swing.actorId, "goblin-1");
  assert.equal(swing.targetRoll, undefined);
  assert.equal(currentCombatant(state).id, "pc");
  assert.equal(random.remaining(), 0);
});

/** pc first, then goblin-1, goblin-2, boss; no dice left over. */
const opening = () =>
  startEncounter(band(), dice([20, 20], [20, 15], [20, 10], [20, 5])).state;

test("1v3: the player may target any living opponent, listed in initiative order", () => {
  const state = opening();
  assert.deepEqual(
    legalTargets(state, "pc").map(({ id }) => id),
    ["goblin-1", "goblin-2", "boss"],
  );
  // The player hits the boss: 15 + 5 meets AC 17 for 4 + 3. Then each
  // opponent swings in initiative order, all missing on a natural 1.
  const result = act(
    state,
    { type: "attack", actorId: "pc", targetId: "boss" },
    dice([20, 15], [6, 4], [20, 1], [20, 1], [20, 1]),
  );
  assert.deepEqual(
    result.events
      .filter(({ type }) => type === "attack")
      .map(({ actorId, targetId }) => [actorId, targetId]),
    [
      ["pc", "boss"],
      ["goblin-1", "pc"],
      ["goblin-2", "pc"],
      ["boss", "pc"],
    ],
  );
  const hp = Object.fromEntries(
    result.state.combatants.map(({ id, hp: left }) => [id, left]),
  );
  assert.deepEqual(hp, { pc: 12, "goblin-1": 10, "goblin-2": 10, boss: 14 });
  assert.equal(result.state.round, 2);
  assert.equal(currentCombatant(result.state).id, "pc");
});

test("1v3: one opponent falls, skips its turns, and the fight goes on", () => {
  // A critical hit fells Goblin 2 (2d6 6 + 6 + 3 = 15).
  const result = act(
    opening(),
    { type: "attack", actorId: "pc", targetId: "goblin-2" },
    dice([20, 20], [6, 6], [6, 6], [20, 1], [20, 1]),
  );
  assert.deepEqual(
    result.events.map(({ type, combatantId, actorId }) => [
      type,
      combatantId ?? actorId,
    ]),
    [
      ["attack", "pc"],
      ["defeated", "goblin-2"],
      ["turn", "goblin-1"],
      ["attack", "goblin-1"],
      ["turn", "boss"],
      ["attack", "boss"],
      ["turn", "pc"],
    ],
  );
  assert.equal(result.state.outcome, "ongoing");
  assert.deepEqual(
    legalTargets(result.state, "pc").map(({ id }) => id),
    ["goblin-1", "boss"],
  );
  assert.match(
    act(
      result.state,
      { type: "attack", actorId: "pc", targetId: "goblin-2" },
      dice(),
    ).rejection.reason,
    /^Goblin Warrior 2 is already defeated\.$/,
  );
});

test("1v3: the fight ends in victory only when the last opponent falls", () => {
  let state = opening();
  const kill = (targetId) => {
    // A critical hit for 15 fells a goblin; a second one fells the boss.
    const result = act(
      state,
      { type: "attack", actorId: "pc", targetId },
      // Every opponent left misses on a natural 1.
      dice([20, 20], [6, 6], [6, 6], [20, 1], [20, 1]),
    );
    state = result.state;
    return result;
  };
  // Each kill leaves fewer opponents to swing (and miss) afterwards.
  kill("goblin-1");
  assert.equal(state.outcome, "ongoing");
  kill("goblin-2");
  assert.equal(state.outcome, "ongoing");
  let result = kill("boss");
  assert.equal(state.outcome, "ongoing");
  assert.equal(state.combatants.find(({ id }) => id === "boss").hp, 6);
  result = kill("boss");
  assert.deepEqual(result.events.slice(-2), [
    { type: "defeated", combatantId: "boss" },
    { type: "ended", outcome: "victory" },
  ]);
  assert.equal(state.outcome, "victory");
  assert.equal(currentCombatant(state), undefined);
});

// Fighter features, turn economy, Sap and advantage (#130).

const sap = { ...fighter.attack, mastery: "Sap" };
/** A hurt level 2 Fighter with Second Wind (1d10 + 2), Action Surge and Sap. */
const veteran = (overrides = {}) => ({
  ...fighter,
  hp: 5,
  attack: sap,
  secondWind: {
    uses: 2,
    max: 2,
    healing: { dice: 1, sides: 10, modifier: 2 },
  },
  actionSurge: { uses: 1, max: 1 },
  ...overrides,
});
/** The veteran acts first against one goblin; no dice left over. */
const veteranFirst = (overrides) =>
  startEncounter([veteran(overrides), goblin()], dice([20, 20], [20, 1])).state;

test("rollD20: advantage keeps the higher die, disadvantage the lower, both cancel", () => {
  assert.deepEqual(rollD20(dice([20, 4], [20, 15]), ["Sap"], []), {
    d20: 15,
    mode: { d20s: [4, 15], advantage: ["Sap"], disadvantage: [] },
  });
  assert.deepEqual(rollD20(dice([20, 4], [20, 15]), [], ["Sap"]), {
    d20: 4,
    mode: { d20s: [4, 15], advantage: [], disadvantage: ["Sap"] },
  });
  // One of each: a single die, with both sources recorded.
  assert.deepEqual(rollD20(dice([20, 9]), ["A"], ["B"]), {
    d20: 9,
    mode: { d20s: [9], advantage: ["A"], disadvantage: ["B"] },
  });
  assert.deepEqual(rollD20(dice([20, 9]), [], []), { d20: 9 });
});

test("turn economy: an attack spends the action; the turn stays open while options remain", () => {
  const state = veteranFirst();
  assert.deepEqual(state.economy, {
    actions: 1,
    maxActions: 1,
    bonusAction: true,
    reaction: true,
  });
  assert.deepEqual(availableActions(state, "pc"), [
    "attack",
    "second-wind",
    "action-surge",
    "end-turn",
  ]);
  // 2 + 5 misses AC 15: no damage dice, and the turn goes on.
  const missed = act(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 2]),
  );
  assert.equal(currentCombatant(missed.state).id, "pc");
  assert.equal(missed.state.economy.actions, 0);
  assert.deepEqual(availableActions(missed.state, "pc"), [
    "second-wind",
    "action-surge",
    "end-turn",
  ]);
  const none = dice();
  assert.deepEqual(
    act(
      missed.state,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      none,
    ),
    {
      state: missed.state,
      rejection: { reason: "You have already used your action this turn." },
    },
  );
  // Ending the turn hands over to the goblin, which misses on a 1.
  const ended = act(
    missed.state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 1]),
  );
  assert.deepEqual(
    ended.events.map(({ type }) => type),
    ["turn-ended", "turn", "attack", "turn"],
  );
  assert.equal(ended.state.round, 2);
  assert.deepEqual(ended.state.economy, {
    actions: 1,
    maxActions: 1,
    bonusAction: true,
    reaction: true,
  });
  assert.match(
    act(ended.state, { type: "end-turn", actorId: "goblin" }, none).rejection
      .reason,
    /Ada's turn, not Goblin Warrior's/,
  );
  assert.deepEqual(none.drawn, []);
});

test("Second Wind: a bonus action heals 1d10 + level, up to the maximum, and spends a use", () => {
  const state = veteranFirst();
  const healed = act(
    state,
    { type: "second-wind", actorId: "pc" },
    dice([10, 4]),
  );
  assert.deepEqual(healed.events, [
    {
      type: "second-wind",
      combatantId: "pc",
      roll: 4,
      modifier: 2,
      healing: 6,
      hpAfter: 11,
      usesLeft: 1,
    },
  ]);
  const self = healed.state.combatants[0];
  assert.equal(self.hp, 11);
  assert.equal(self.secondWind.uses, 1);
  assert.equal(healed.state.economy.bonusAction, false);
  // The bonus action is spent, so a second use this turn is refused.
  const none = dice();
  assert.equal(
    act(healed.state, { type: "second-wind", actorId: "pc" }, none).rejection
      .reason,
    "You have already used your bonus action this turn.",
  );
  // A 10 heals 12, but only up to 12 HP.
  const capped = act(
    state,
    { type: "second-wind", actorId: "pc" },
    dice([10, 10]),
  );
  assert.equal(capped.events[0].healing, 7);
  assert.equal(capped.events[0].hpAfter, 12);
  assert.deepEqual(none.drawn, []);
});

test("Second Wind is refused without uses, at full health, or without the feature", () => {
  const none = dice();
  for (const [overrides, reason] of [
    [
      {
        secondWind: {
          uses: 0,
          max: 2,
          healing: { dice: 1, sides: 10, modifier: 2 },
        },
      },
      "You have no uses of Second Wind left.",
    ],
    [{ hp: 12 }, "You are unhurt, so Second Wind would heal nothing."],
    [{ secondWind: undefined }, "You don't have Second Wind."],
  ]) {
    const state = veteranFirst(overrides);
    assert.deepEqual(act(state, { type: "second-wind", actorId: "pc" }, none), {
      state,
      rejection: { reason },
    });
    assert.ok(!availableActions(state, "pc").includes("second-wind"));
  }
  assert.deepEqual(none.drawn, []);
});

test("the turn ends by itself once nothing is left to do", () => {
  // Second Wind, then an attack: no action, bonus action or Action Surge
  // use remains, so the goblin acts at once and misses on a 1.
  const state = veteranFirst({ actionSurge: undefined });
  const healed = act(
    state,
    { type: "second-wind", actorId: "pc" },
    dice([10, 1]),
  ).state;
  assert.equal(currentCombatant(healed).id, "pc");
  const swung = act(
    healed,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 2], [20, 1]),
  );
  assert.deepEqual(
    swung.events.map(({ type }) => type),
    ["attack", "turn", "attack", "turn"],
  );
  assert.equal(swung.state.round, 2);
});

test("Action Surge: one more action this turn, once per rest", () => {
  const state = veteranFirst({ hp: 12 });
  const missed = act(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 2]),
  ).state;
  const surged = act(missed, { type: "action-surge", actorId: "pc" }, dice());
  assert.deepEqual(surged.events, [
    { type: "action-surge", combatantId: "pc", usesLeft: 0 },
  ]);
  assert.equal(surged.state.economy.actions, 1);
  assert.equal(surged.state.economy.maxActions, 2);
  assert.equal(surged.state.combatants[0].actionSurge.uses, 0);
  // The second attack ends the turn: at full HP there is nothing else.
  const second = act(
    surged.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 3], [20, 1]),
  );
  assert.deepEqual(
    second.events.map(({ type, actorId }) => [type, actorId]),
    [
      ["attack", "pc"],
      ["turn", undefined],
      ["attack", "goblin"],
      ["turn", undefined],
    ],
  );
  const none = dice();
  assert.equal(
    act(second.state, { type: "action-surge", actorId: "pc" }, none).rejection
      .reason,
    "You have no uses of Action Surge left.",
  );
  assert.equal(
    act(
      veteranFirst({ actionSurge: undefined }),
      { type: "action-surge", actorId: "pc" },
      none,
    ).rejection.reason,
    "You don't have Action Surge.",
  );
  assert.deepEqual(none.drawn, []);
});

test("Sap: a hit gives the target disadvantage on its next attack, with both dice", () => {
  const state = veteranFirst({ hp: 12, actionSurge: undefined });
  // 12 + 5 hits AC 15 for 2 + 3; the goblin is sapped and rolls 18 and 6,
  // keeping the 6: 6 + 4 misses AC 16.
  const result = act(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 12], [6, 2], [20, 18], [20, 6]),
  );
  assert.deepEqual(result.events[1], {
    type: "sapped",
    targetId: "goblin",
    sourceId: "pc",
  });
  const swing = result.events.find((event) => event.actorId === "goblin");
  assert.equal(swing.d20, 6);
  assert.equal(swing.total, 10);
  assert.equal(swing.hit, false);
  assert.deepEqual(swing.mode, {
    d20s: [18, 6],
    advantage: [],
    disadvantage: ["Sap"],
  });
  // The disadvantage is spent on that attack.
  assert.deepEqual(result.state.sapped, []);
  // The player's own attack had no roll mode.
  assert.equal(result.events[0].mode, undefined);
});

test("Sap: a natural 20 on the discarded die is not a critical hit, and a miss saps nothing", () => {
  const state = veteranFirst({ hp: 12, actionSurge: undefined });
  const result = act(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 12], [6, 2], [20, 20], [20, 11]),
  );
  const swing = result.events.find((event) => event.actorId === "goblin");
  assert.equal(swing.d20, 11);
  assert.equal(swing.critical, false);
  assert.equal(swing.hit, false);

  const missed = act(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 2], [20, 20], [6, 1], [6, 1]),
  );
  assert.ok(!missed.events.some(({ type }) => type === "sapped"));
  assert.equal(
    missed.events.find((event) => event.actorId === "goblin").mode,
    undefined,
  );
});

test("Sap ends at the start of the sapper's next turn", () => {
  const ally = { ...fighter, id: "ally", name: "Bram" };
  // Order: Bram, Ada, goblin. On Bram's turn the goblin is still sapped by
  // Ada (as if from her last turn); the start of Ada's turn ends it.
  const start = startEncounter(
    [veteran({ hp: 12, actionSurge: undefined }), ally, goblin()],
    dice([20, 15], [20, 20], [20, 1]),
  ).state;
  assert.equal(currentCombatant(start).id, "ally");
  const sapped = { ...start, sapped: [{ targetId: "goblin", sourceId: "pc" }] };
  const adaTurn = act(sapped, { type: "end-turn", actorId: "ally" }, dice());
  assert.equal(currentCombatant(adaTurn.state).id, "pc");
  assert.deepEqual(adaTurn.state.sapped, []);
  // So the goblin then attacks with one die (a d2 picks its target).
  const ended = act(
    adaTurn.state,
    { type: "end-turn", actorId: "pc" },
    dice([2, 1], [20, 1]),
  );
  assert.equal(
    ended.events.find((event) => event.actorId === "goblin").mode,
    undefined,
  );
});

const potion = (id = "potion") => ({
  id,
  name: "Potion of Healing",
  healing: { dice: 2, sides: 4, modifier: 2 },
});

/** Ada, hurt to `hp` and carrying potions, on her first turn. */
function hurtWithPotions(hp, potions = [potion()]) {
  return startEncounter(
    [{ ...fighter, hp, potions }, goblin()],
    dice([20, 15], [20, 3]),
  ).state;
}

test("drinking a potion takes the bonus action and heals 2d4 + 2, up to the maximum", () => {
  const state = hurtWithPotions(3);
  assert.deepEqual(availableActions(state, "pc"), [
    "attack",
    "drink-potion",
    "end-turn",
  ]);
  const random = dice([4, 1], [4, 3]);
  const drunk = act(
    state,
    { type: "drink-potion", actorId: "pc", itemId: "potion" },
    random,
  );
  assert.deepEqual(drunk.events, [
    {
      type: "potion",
      combatantId: "pc",
      itemId: "potion",
      name: "Potion of Healing",
      rolls: [1, 3],
      modifier: 2,
      healing: 6,
      hpAfter: 9,
      maxHp: 12,
    },
  ]);
  const pc = drunk.state.combatants.find(({ id }) => id === "pc");
  assert.equal(pc.hp, 9);
  assert.deepEqual(pc.potions, []);
  assert.equal(drunk.state.economy.bonusAction, false);
  // The action is still there, so the turn goes on.
  assert.equal(currentCombatant(drunk.state).id, "pc");

  const capped = act(
    hurtWithPotions(10),
    { type: "drink-potion", actorId: "pc", itemId: "potion" },
    dice([4, 4], [4, 4]),
  );
  assert.equal(capped.events[0].healing, 2);
  assert.equal(capped.events[0].hpAfter, 12);
});

test("a potion is refused at full health, without the potion, or with the bonus action spent", () => {
  const drink = { type: "drink-potion", actorId: "pc", itemId: "potion" };
  const full = hurtWithPotions(12);
  assert.ok(!availableActions(full, "pc").includes("drink-potion"));
  assert.match(act(full, drink, dice()).rejection.reason, /unhurt/);
  assert.match(
    act(hurtWithPotions(3, []), drink, dice()).rejection.reason,
    /don't have that potion/,
  );
  const twice = act(
    hurtWithPotions(3, [potion("a"), potion("b")]),
    { ...drink, itemId: "a" },
    dice([4, 1], [4, 1]),
  ).state;
  assert.ok(!availableActions(twice, "pc").includes("drink-potion"));
  assert.match(
    act(twice, { ...drink, itemId: "b" }, dice()).rejection.reason,
    /already used your bonus action/,
  );
});

test("after attacking, a carried potion keeps the turn open until it is drunk", () => {
  const attacked = act(
    hurtWithPotions(3),
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 2]),
  ).state;
  assert.equal(currentCombatant(attacked).id, "pc");
  assert.deepEqual(availableActions(attacked, "pc"), [
    "drink-potion",
    "end-turn",
  ]);
  // Drinking leaves nothing to do, so the goblin acts: 2 misses.
  const random = dice([4, 2], [4, 2], [20, 2]);
  const drunk = act(
    attacked,
    { type: "drink-potion", actorId: "pc", itemId: "potion" },
    random,
  );
  assert.equal(random.remaining(), 0);
  assert.equal(currentCombatant(drunk.state).id, "pc");
  assert.equal(drunk.state.round, 2);
});
