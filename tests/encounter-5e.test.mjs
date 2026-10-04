import assert from "node:assert/strict";
import test from "node:test";
import {
  attack,
  currentCombatant,
  legalTargets,
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
  let result = attack(
    start.state,
    { actorId: "pc", targetId: "goblin" },
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
  const missed = attack(
    start.state,
    { actorId: "pc", targetId: "goblin" },
    random,
  );
  assert.equal(missed.events[0].hit, false);
  assert.deepEqual(missed.events[0].damageRolls, []);
  const crit = missed.events.find((e) => e.actorId === "goblin");
  assert.equal(crit.critical, true);
  assert.deepEqual(crit.damageRolls, [1, 2]);
  assert.equal(crit.damage, 5);

  // 9 + 5 = 14 misses AC 15.
  result = attack(
    start.state,
    { actorId: "pc", targetId: "goblin" },
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
  const result = attack(
    start.state,
    { actorId: "pc", targetId: "goblin" },
    dice([20, 19], [6, 6], [6, 6]),
  );
  assert.equal(result.events[0].critical, true);
  assert.equal(result.events[0].damage, 15);
  assert.equal(result.state.outcome, "victory");
});

test("an opponent at 0 HP is defeated and the encounter ends in victory", () => {
  const start = startEncounter([fighter, goblin()], dice([20, 20], [20, 1]));
  const random = dice([20, 15], [6, 6], [20, 15], [6, 1]);
  let result = attack(
    start.state,
    { actorId: "pc", targetId: "goblin" },
    random,
  );
  // 9 damage leaves 1; the goblin then hits with 15 + 4 for 1 + 2.
  assert.equal(result.state.combatants[1].hp, 1);
  result = attack(
    result.state,
    { actorId: "pc", targetId: "goblin" },
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
  const after = attack(state, { actorId: "pc", targetId: "goblin" }, dice());
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
    const result = attack(start.state, action, none);
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
    attack(downed, { actorId: "pc", targetId: "second" }, none).rejection
      .reason,
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
  const result = attack(
    state,
    { actorId: "pc", targetId: "boss" },
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
  const result = attack(
    opening(),
    { actorId: "pc", targetId: "goblin-2" },
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
    attack(result.state, { actorId: "pc", targetId: "goblin-2" }, dice())
      .rejection.reason,
    /^Goblin Warrior 2 is already defeated\.$/,
  );
});

test("1v3: the fight ends in victory only when the last opponent falls", () => {
  let state = opening();
  const kill = (targetId) => {
    // A critical hit for 15 fells a goblin; a second one fells the boss.
    const result = attack(
      state,
      { actorId: "pc", targetId },
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
