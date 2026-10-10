// #340: the Wizard's spells and Arcane Recovery in the engine and the
// runtime. Sleep: a Wisdom save or Incapacitated until the end of the
// target's next turn, then a second save or Unconscious while the caster
// concentrates; damage wakes it, losing concentration ends it, and a
// creature immune to exhaustion succeeds without a roll. Shocking Grasp and
// Chill Touch are melee spell attacks; Ray of Frost and Chromatic Orb (its
// damage type chosen at casting) ranged ones; Thunderwave's 15-foot cube
// catches two. Arcane Recovery regains a spent slot on a short rest, once
// per long rest, up to half the Wizard level in slot levels.
import assert from "node:assert/strict";
import test from "node:test";

import {
  arcaneRecovery,
  buildCharacter,
  characterProfile,
  defaultPlacement,
} from "../dist/character-5e.js";
import {
  act,
  concentrationOf,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { maxTargets, SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { fightRoom, ratTunnels } from "./fixtures/modules.mjs";

/** Vela as a combatant built by hand: AC 12, Intelligence-cast spells. */
const vela = (
  spells = [
    "sleep",
    "shocking-grasp",
    "fire-bolt",
    "ray-of-frost",
    "chill-touch",
    "chromatic-orb",
    "thunderwave",
  ],
) => ({
  id: "pc",
  name: "Vela",
  side: "party",
  armorClass: 12,
  // A scratch and a potion keep her turn open after she acts, so each test
  // ends it itself.
  hp: 9,
  maxHp: 10,
  potions: [
    {
      id: "potion",
      name: "Potion of Healing",
      healing: { dice: 2, sides: 4, modifier: 2 },
    },
  ],
  dexterity: 14,
  initiativeBonus: 2,
  saves: {
    strength: -2,
    dexterity: 2,
    constitution: 1,
    intelligence: 5,
    wisdom: 1,
    charisma: -2,
  },
  attack: {
    name: "Dagger",
    bonus: 4,
    damage: { dice: 1, sides: 4, modifier: 2, type: "piercing" },
    criticalRange: 20,
  },
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: spells.map((id) => spellAtLevel(SPELLS[id], 1)),
    slots: [{ uses: 2, max: 2 }],
  },
});

const goblin = (id = "goblin", extra = {}) => ({
  id,
  name: id === "goblin" ? "Goblin Warrior" : "Goblin Boss",
  side: "opponents",
  armorClass: 13,
  hp: 30,
  maxHp: 30,
  dexterity: 15,
  initiativeBonus: 2,
  saves: {
    strength: -1,
    dexterity: 2,
    constitution: 0,
    intelligence: 0,
    wisdom: -1,
    charisma: -1,
  },
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
  ...extra,
});

/** A fight Vela opens: her initiative 15, then each foe's 3, 2, …. */
function opening(foes = [goblin()]) {
  const { state } = startEncounter(
    [vela(), ...foes],
    dice([20, 13], ...foes.map((_, index) => [20, 3 - index])),
  );
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

function accepted(state, action, random = dice()) {
  const result = act(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const cast = (spellId, targetIds, extra = {}) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetIds].flat(),
  ...extra,
});
const endTurn = { type: "end-turn", actorId: "pc" };
const types = (events) => events.map(({ type }) => type);
const conditionsOn = (state, id) =>
  state.conditions
    .filter(({ targetId }) => targetId === id)
    .map(({ kind }) => kind);

test("Sleep: a failed save incapacitates, a second failed save makes the target unconscious", () => {
  // The goblin's Wisdom save: 5 - 1 = 4 against DC 13.
  const slept = accepted(
    opening(),
    cast("sleep", "goblin", { slotLevel: 1 }),
    dice([20, 5]),
  );
  assert.deepEqual(types(slept.events), [
    "cast",
    "spell-condition",
    "effect",
    "condition",
  ]);
  assert.equal(slept.events[1].success, false);
  assert.equal(slept.events[3].kind, "incapacitated");
  assert.deepEqual(conditionsOn(slept.state, "goblin"), ["incapacitated"]);
  assert.equal(concentrationOf(slept.state.combatants, "pc").spell, "Sleep");
  // Incapacitated, the goblin can't act; at its turn's end it saves again:
  // 3 - 1 = 2 against 13, a failure, and it falls unconscious.
  const asleep = accepted(slept.state, endTurn, dice([20, 3]));
  assert.ok(!asleep.events.some(({ type }) => type === "attack"));
  assert.deepEqual(conditionsOn(asleep.state, "goblin"), ["unconscious"]);
  assert.equal(currentCombatant(asleep.state).id, "pc");
  assert.equal(asleep.state.round, 2);
});

test("Sleep: damage wakes the target; an attack on it has advantage and crits", () => {
  const slept = accepted(
    opening(),
    cast("sleep", "goblin", { slotLevel: 1 }),
    dice([20, 5]),
  );
  const asleep = accepted(slept.state, endTurn, dice([20, 3])).state;
  // Shocking Grasp: advantage (12 and 8, keep 12) + 5 = 17, a hit, and a
  // critical one: 2d8, 3 + 4 = 7 lightning.
  const woken = accepted(
    asleep,
    cast("shocking-grasp", "goblin"),
    dice([20, 8], [20, 12], [8, 3], [8, 4]),
  );
  const [, attack] = woken.events;
  assert.equal(attack.type, "attack");
  assert.deepEqual(attack.mode.advantage, ["target unconscious"]);
  assert.equal(attack.critical, true);
  assert.equal(attack.criticalCondition, "unconscious");
  assert.equal(attack.damage, 7);
  assert.deepEqual(
    woken.events
      .filter(
        ({ type }) => type === "effect-ended" || type === "condition-ended",
      )
      .map(({ type, reason }) => `${type}:${reason}`),
    ["effect-ended:woke", "condition-ended:spell-ended"],
  );
  assert.deepEqual(conditionsOn(woken.state, "goblin"), []);
  assert.equal(concentrationOf(woken.state.combatants, "pc"), undefined);
  assert.match(
    renderFifthResult({
      state: { encounter: woken.state },
      events: woken.events,
    }),
    /Critical hit: Goblin Warrior is unconscious!/u,
  );
});

test("Sleep: a save shakes it off; a first success leaves nothing to concentrate on", () => {
  const slept = accepted(
    opening(),
    cast("sleep", "goblin", { slotLevel: 1 }),
    dice([20, 5]),
  );
  // At its turn's end, 18 - 1 = 17: it shakes the spell off.
  const awake = accepted(slept.state, endTurn, dice([20, 18]));
  assert.deepEqual(conditionsOn(awake.state, "goblin"), []);
  assert.ok(
    awake.events.some(
      ({ type, reason }) => type === "effect-ended" && reason === "saved",
    ),
  );
  assert.equal(concentrationOf(awake.state.combatants, "pc"), undefined);
  // A first save of 15 - 1 = 14 resists it outright.
  const resisted = accepted(
    opening(),
    cast("sleep", "goblin", { slotLevel: 1 }),
    dice([20, 15]),
  );
  assert.deepEqual(types(resisted.events), ["cast", "spell-condition"]);
  assert.equal(resisted.events[1].success, true);
  assert.equal(concentrationOf(resisted.state.combatants, "pc"), undefined);
});

test("Sleep: a creature immune to exhaustion succeeds without a roll", () => {
  const zombie = goblin("goblin", {
    name: "Zombie",
    conditionImmunities: ["exhaustion", "poisoned"],
  });
  const result = accepted(
    opening([zombie]),
    cast("sleep", "goblin", { slotLevel: 1 }),
    dice(),
  );
  assert.deepEqual(types(result.events), ["cast", "spell-condition"]);
  assert.equal(result.events[1].immune, "exhaustion");
  assert.equal(result.events[1].success, true);
  assert.equal(result.state.conditions.length, 0);
  assert.equal(result.state.combatants[0].spellcasting.slots[0].uses, 1);
});

test("Sleep: losing concentration wakes the target", () => {
  const foes = [goblin(), goblin("boss")];
  const slept = accepted(
    opening(foes),
    cast("sleep", "goblin", { slotLevel: 1 }),
    dice([20, 5]),
  );
  // The goblin fails its second save (2) and falls unconscious; the boss
  // hits Vela (15 + 4 = 19) for 4 + 2 = 6, and her concentration save
  // (2 + 1 = 3 against DC 10) fails.
  const broken = accepted(
    slept.state,
    endTurn,
    dice([20, 3], [20, 15], [6, 4], [20, 2]),
  );
  assert.deepEqual(conditionsOn(broken.state, "goblin"), []);
  assert.deepEqual(
    broken.events
      .filter(
        ({ type }) => type === "effect-ended" || type === "condition-ended",
      )
      .map(({ type, reason }) => `${type}:${reason}`),
    [
      "condition-ended:expired",
      "effect-ended:concentration-broken",
      "condition-ended:spell-ended",
    ],
  );
});

test("Shocking Grasp is a melee spell attack: no close-combat disadvantage in round 2", () => {
  // The goblin misses Vela (1) on its turn.
  const round2 = accepted(opening(), endTurn, dice([20, 1])).state;
  assert.equal(round2.round, 2);
  const grasp = accepted(
    round2,
    cast("shocking-grasp", "goblin"),
    dice([20, 10], [8, 6]),
  );
  const attack = grasp.events.find(({ type }) => type === "attack");
  assert.equal(attack.mode, undefined);
  assert.equal(attack.total, 15);
  assert.equal(attack.damage, 6);
  assert.equal(attack.damageType, "lightning");
  // Fire Bolt, a ranged spell attack, has it then.
  const bolt = accepted(
    round2,
    cast("fire-bolt", "goblin"),
    dice([20, 10], [20, 14], [10, 5]),
  );
  assert.deepEqual(
    bolt.events.find(({ type }) => type === "attack").mode.disadvantage,
    ["Close combat"],
  );
});

test("Ray of Frost and Chill Touch: ranged cold and melee necrotic spell attacks", () => {
  assert.deepEqual(SPELLS["ray-of-frost"].effect, {
    kind: "attack",
    range: "ranged",
    damage: { dice: 1, sides: 8, type: "cold" },
  });
  assert.deepEqual(SPELLS["chill-touch"].effect, {
    kind: "attack",
    range: "melee",
    damage: { dice: 1, sides: 10, type: "necrotic" },
  });
  const ray = accepted(
    opening(),
    cast("ray-of-frost", "goblin"),
    dice([20, 12], [8, 5]),
  );
  assert.equal(ray.events[1].damage, 5);
  assert.equal(ray.events[1].damageType, "cold");
  const touch = accepted(
    opening(),
    cast("chill-touch", "goblin"),
    dice([20, 12], [10, 7]),
  );
  assert.equal(touch.events[1].damage, 7);
  assert.equal(touch.events[1].damageType, "necrotic");
});

test("Chromatic Orb deals the damage type chosen at casting", () => {
  const orb = accepted(
    opening(),
    cast("chromatic-orb", "goblin", { slotLevel: 1, damageType: "fire" }),
    dice([20, 12], [8, 1], [8, 2], [8, 3]),
  );
  assert.equal(orb.events[1].damageType, "fire");
  assert.equal(orb.events[1].damage, 6);
  for (const damageType of [undefined, "slashing"]) {
    const refused = act(
      opening(),
      cast("chromatic-orb", "goblin", {
        slotLevel: 1,
        ...(damageType === undefined ? {} : { damageType }),
      }),
      dice(),
    );
    assert.equal(refused.rejection?.code, "damage-type");
    assert.match(
      refused.rejection.reason,
      /Choose the damage type Chromatic Orb deals: acid, cold, fire, lightning, poison, thunder\./u,
    );
  }
  // Another spell takes none.
  assert.equal(
    act(opening(), cast("fire-bolt", "goblin", { damageType: "fire" }), dice())
      .rejection?.code,
    "damage-type",
  );
});

test("Thunderwave's 15-foot cube catches two: a Constitution save, half on a success", () => {
  assert.equal(maxTargets(SPELLS.thunderwave), 2);
  assert.equal(maxTargets(SPELLS.sleep), 1);
  const foes = [goblin(), goblin("boss")];
  // 2d8: 4 + 5 = 9; the goblin fails (5), the boss succeeds (15): 4.
  const wave = accepted(
    opening(foes),
    cast("thunderwave", ["goblin", "boss"], { slotLevel: 1 }),
    dice([8, 4], [8, 5], [20, 5], [20, 15]),
  );
  const saves = wave.events.filter(({ type }) => type === "spell-save");
  assert.deepEqual(
    saves.map(({ targetId, damage, damageType }) => [
      targetId,
      damage,
      damageType,
    ]),
    [
      ["goblin", 9, "thunder"],
      ["boss", 4, "thunder"],
    ],
  );
});

// Kept totals 15, 14, 13, 12, 10, 8.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const VELA = buildCharacter(
  "e".repeat(32),
  "Vela",
  DICE,
  { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
  "wizard",
);

test("Arcane Recovery: only on a short rest, once per long rest, the slot total capped", () => {
  const profile = characterProfile(VELA);
  assert.deepEqual(profile.arcaneRecovery, { slotLevels: 1 });
  assert.deepEqual(profile.featureUses["arcane-recovery"], {
    max: 1,
    recovery: { shortRest: 0, longRest: "all" },
  });
  const spent = { "arcane-recovery": 1, "spell-slots-1": 0 };
  // Both slots spent: a level-1 Wizard regains one (half of 1, rounded up).
  assert.deepEqual(arcaneRecovery(profile, spent, "short"), {
    regained: [
      { featureId: "spell-slots-1", level: 1, count: 1, uses: 1, max: 2 },
    ],
  });
  const refusal = (uses, rest) =>
    arcaneRecovery(profile, uses, rest).rejection?.code;
  assert.equal(refusal(spent, "long"), "not-short-rest");
  assert.equal(
    refusal({ ...spent, "arcane-recovery": 0 }, "short"),
    "arcane-recovery-used",
  );
  assert.equal(
    refusal({ "arcane-recovery": 1, "spell-slots-1": 2 }, "short"),
    "no-slot-spent",
  );
  // A higher Wizard regains up to its total, highest slots first, none of
  // 6th level or higher.
  const higher = {
    arcaneRecovery: { slotLevels: 3 },
    featureUses: {
      "arcane-recovery": { max: 1 },
      "spell-slots-1": { max: 4 },
      "spell-slots-2": { max: 3 },
      "spell-slots-6": { max: 1 },
    },
  };
  assert.deepEqual(
    arcaneRecovery(
      higher,
      {
        "arcane-recovery": 1,
        "spell-slots-1": 2,
        "spell-slots-2": 2,
        "spell-slots-6": 0,
      },
      "short",
    ).regained.map(({ level, count }) => [level, count]),
    [
      [2, 1],
      [1, 1],
    ],
  );
  // A class without it has none.
  assert.equal(
    arcaneRecovery({ featureUses: {} }, {}, "short").rejection.code,
    "no-arcane-recovery",
  );
});

test("a short rest applies Arcane Recovery once; it isn't spent while no slot is", () => {
  const runtime = createFifthRuntime(ratTunnels, VELA);
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(),
  ).state;
  const drained = (state, slots) => ({
    ...state,
    character: {
      ...state.character,
      featureUses: { ...state.character.featureUses, "spell-slots-1": slots },
    },
  });
  // At full HP and slots there is nothing to rest for.
  assert.equal(
    runtime.projectActions(begun).some(({ action }) => action === "rest"),
    false,
  );
  const first = runtime.handleAction(
    drained(begun, 0),
    { type: "rest", hitDice: 0 },
    dice(),
  );
  assert.equal(first.rejection, undefined, first.rejection?.reason);
  const recovery = first.events.find(({ type }) => type === "arcane-recovery");
  assert.deepEqual(recovery, {
    type: "arcane-recovery",
    slots: [{ level: 1, count: 1, uses: 1, max: 2 }],
    usesLeft: 0,
  });
  assert.equal(first.state.character.featureUses["spell-slots-1"], 1);
  assert.equal(first.state.character.featureUses["arcane-recovery"], 0);
  assert.match(
    renderFifthResult(first),
    /Arcane Recovery: you regain a 1st-level spell slot \(1 of 2 left\)\./u,
  );
  // Spent, it regains nothing more before a long rest, so a second rest at
  // full HP with a slot spent isn't offered.
  const again = drained(first.state, 0);
  assert.equal(
    runtime.projectActions(again).some(({ action }) => action === "rest"),
    false,
  );
});

test("the bar offers Sleep at each foe; a zombie is immune to it", () => {
  const crypt = fightRoom("sleepy-crypt", "The Sleepy Crypt", [
    { id: "goblin", monster: "goblin-warrior" },
    { id: "zombie", monster: "zombie" },
  ]);
  const runtime = createFifthRuntime(crypt, VELA);
  const random = createSeededRandom(1);
  let { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  );
  assert.equal(currentCombatant(state.encounter).id, "pc");
  const sleeps = runtime
    .projectActions(state)
    .filter(({ action, spell }) => action === "cast" && spell?.id === "sleep");
  assert.deepEqual(
    sleeps
      .map(({ target, targets, spell, available }) => [
        target?.id,
        targets,
        spell.maxTargets,
        available,
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
    [
      ["goblin", undefined, undefined, true],
      ["zombie", undefined, undefined, true],
    ],
  );
  const zombie = sleeps.find(({ target }) => target.id === "zombie");
  const result = runtime.handleAction(state, runtime.actionOf(zombie), random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.match(
    renderFifthResult(result),
    /Zombie succeeds on its saving throw against Sleep without a roll: it is immune to exhaustion\./u,
  );
  state = result.state;
  assert.equal(
    state.encounter.conditions.some(({ targetId }) => targetId === "zombie"),
    false,
  );
});
