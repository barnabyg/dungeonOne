// #341: the Cleric's levels 2–3 in the encounter engine. Channel Divinity:
// Turn Undead (Frightened and Incapacitated for the fight's minute, ended
// by damage, an attack on the creature (D13) or the turner's
// incapacitation), Divine Spark and Preserve Life. Disciple of Life adds 2
// + the slot level to slot healing. The 2nd-level spells: Aid, Lesser
// Restoration, Spiritual Weapon, Hold Person, Protection from Poison and
// Prayer of Healing.
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import {
  act,
  availableActions,
  castOutsideFight,
  combatant,
  CONDITION_RULES,
  currentCombatant,
  everyFoeTurned,
  startEncounter,
} from "../dist/encounter-5e.js";
import { statBlockCombatant } from "../dist/runtime-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const bestiary = await loadBuiltInFifthBestiary();
/** A bestiary monster as the runtime makes it a combatant. */
const monster = (id, extra = {}) => {
  const { statBlock } = bestiary.monsters.find(
    (candidate) => candidate.id === id,
  );
  return { ...statBlockCombatant(id, statBlock.name, statBlock), ...extra };
};

/**
 * Ilse, a level-3 Life Cleric built by hand: AC 16, 20 of 30 HP, spell
 * save DC 13, two uses of Channel Divinity. A scratch and a potion keep her
 * turn open after she acts, so each test ends it itself.
 */
const ilse = (extra = {}) => ({
  id: "pc",
  name: "Ilse",
  side: "party",
  creatureType: "humanoid",
  armorClass: 16,
  hp: 20,
  maxHp: 30,
  potions: [
    {
      id: "potion",
      name: "Potion of Healing",
      healing: { dice: 2, sides: 4, modifier: 2 },
    },
  ],
  dexterity: 10,
  initiativeBonus: 0,
  saves: {
    strength: 1,
    dexterity: 0,
    constitution: 2,
    intelligence: 0,
    wisdom: 5,
    charisma: 3,
  },
  attack: {
    name: "Mace",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "bludgeoning" },
    criticalRange: 20,
  },
  channelDivinity: {
    uses: 2,
    max: 2,
    saveDc: 13,
    divineSpark: { dice: 1, sides: 8, modifier: 3 },
    preserveLife: 15,
  },
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: [
      "bless",
      "cure-wounds",
      "aid",
      "lesser-restoration",
      "spiritual-weapon",
      "hold-person",
      "protection-from-poison",
      "prayer-of-healing",
    ].map((id) => spellAtLevel(SPELLS[id], 3)),
    slots: [
      { uses: 4, max: 4 },
      { uses: 2, max: 2 },
    ],
    discipleOfLife: true,
  },
  ...extra,
});

/** A fight Ilse opens: her initiative 20, then each foe's d20 in turn. */
function opening(foes, rolls, pc = ilse()) {
  const { state } = startEncounter(
    [pc, ...foes],
    dice([20, 20], ...rolls.map((roll) => [20, roll])),
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

function refused(state, action, code) {
  const result = act(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  return result.rejection;
}

const turnUndead = { type: "turn-undead", actorId: "pc" };
const endTurn = { type: "end-turn", actorId: "pc" };
const attack = (targetId) => ({ type: "attack", actorId: "pc", targetId });
const cast = (spellId, targetIds, slotLevel) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetIds].flat(),
  ...(slotLevel === undefined ? {} : { slotLevel }),
});
const spark = (targetId, mode) => ({
  type: "divine-spark",
  actorId: "pc",
  targetId,
  mode,
});
const types = (events) => events.map(({ type }) => type);
const conditionsOn = (state, id) =>
  state.conditions
    .filter(({ targetId }) => targetId === id)
    .map(({ kind }) => kind)
    .sort();
const ended = (events, reason) =>
  events.filter(
    (event) => event.type === "effect-ended" && event.reason === reason,
  );

test("the bestiary's undead are undead combatants, its bandit a humanoid", () => {
  assert.equal(monster("zombie").creatureType, "undead");
  assert.equal(monster("skeleton").creatureType, "undead");
  assert.equal(monster("ghoul").creatureType, "undead");
  assert.equal(monster("bandit").creatureType, "humanoid");
  assert.equal(monster("goblin-warrior").creatureType, "fey");
});

test("Frightened gives disadvantage on attack rolls and ability checks", () => {
  assert.deepEqual(CONDITION_RULES.frightened, {
    name: "Frightened",
    attacks: "disadvantage",
    checks: "disadvantage",
  });
});

test("Turn Undead: the Zombie and Ghoul fail and are turned, the Skeleton saves", () => {
  // Initiative: Ilse 20, Zombie 15 − 2, Skeleton 9 + 3, Ghoul 4 + 2.
  const state = opening(
    [monster("zombie"), monster("skeleton"), monster("ghoul")],
    [15, 9, 4],
  );
  assert.ok(availableActions(state, "pc").includes("turn-undead"));
  // Wisdom saves against DC 13: Zombie 10 + 0 (proficient), Skeleton
  // 15 − 1, Ghoul 12.
  const turned = accepted(
    state,
    turnUndead,
    dice([20, 10], [20, 15], [20, 12]),
  );
  const turn = turned.events.find(({ type }) => type === "turn-undead");
  assert.deepEqual(turn.targetIds, ["zombie", "skeleton", "ghoul"]);
  assert.equal(turn.usesLeft, 1);
  assert.deepEqual(
    turned.events
      .filter(({ type }) => type === "spell-condition")
      .map(({ targetId, success, save }) => [targetId, success, save.total]),
    [
      ["zombie", false, 10],
      ["skeleton", true, 14],
      ["ghoul", false, 12],
    ],
  );
  assert.deepEqual(conditionsOn(turned.state, "zombie"), [
    "frightened",
    "incapacitated",
  ]);
  assert.deepEqual(conditionsOn(turned.state, "ghoul"), [
    "frightened",
    "incapacitated",
  ]);
  assert.deepEqual(conditionsOn(turned.state, "skeleton"), []);
  assert.equal(
    combatant(turned.state, "pc").channelDivinity.uses,
    1,
    "a use is spent",
  );
  assert.equal(turned.state.economy.actions, 0, "it takes the action");
  // Turned, the Zombie and the Ghoul can't act; the Skeleton attacks (a
  // natural 1 misses), and both are still turned when Ilse's turn returns.
  const round = accepted(turned.state, endTurn, dice([20, 1]));
  const attackers = round.events
    .filter(({ type }) => type === "attack")
    .map(({ actorId }) => actorId);
  assert.deepEqual(attackers, ["skeleton"]);
  assert.equal(round.state.round, 2);
  assert.deepEqual(conditionsOn(round.state, "zombie"), [
    "frightened",
    "incapacitated",
  ]);
  assert.deepEqual(conditionsOn(round.state, "ghoul"), [
    "frightened",
    "incapacitated",
  ]);
});

test("Turn Undead needs an undead opponent not yet turned, and a use", () => {
  const bandits = opening([monster("bandit")], [10]);
  refused(bandits, turnUndead, "no-undead");
  assert.ok(!availableActions(bandits, "pc").includes("turn-undead"));
  const spent = opening(
    [monster("zombie")],
    [15],
    ilse({
      channelDivinity: { ...ilse().channelDivinity, uses: 0 },
    }),
  );
  refused(spent, turnUndead, "no-uses-left");
});

test("D13: with every foe turned Ilse may attack; an attack, even a miss, ends that one's turning", () => {
  const state = opening([monster("zombie"), monster("ghoul")], [15, 4]);
  const turned = accepted(state, turnUndead, dice([20, 1], [20, 1]));
  assert.equal(everyFoeTurned(turned.state, "pc"), true);
  // Waiting changes nothing: turned undead never act, and stay turned.
  const waited = accepted(turned.state, endTurn);
  assert.equal(waited.state.round, 2);
  assert.equal(everyFoeTurned(waited.state, "pc"), true);
  // The mace misses the Zombie (2 + 4 against AC 8), and still ends its
  // turning first; the Ghoul stays turned.
  const swung = accepted(waited.state, attack("zombie"), dice([20, 2]));
  assert.deepEqual(types(swung.events).slice(0, 4), [
    "effect-ended",
    "condition-ended",
    "condition-ended",
    "attack",
  ]);
  assert.deepEqual(
    ended(swung.events, "attacked").map(({ targetId }) => targetId),
    ["zombie"],
  );
  assert.deepEqual(conditionsOn(swung.state, "zombie"), []);
  assert.deepEqual(conditionsOn(swung.state, "ghoul"), [
    "frightened",
    "incapacitated",
  ]);
  assert.equal(everyFoeTurned(swung.state, "pc"), false);
  // Freed, the Zombie acts on its turn again.
  const round = accepted(swung.state, endTurn, dice([20, 1]));
  assert.deepEqual(
    round.events
      .filter(({ type }) => type === "attack")
      .map(({ actorId }) => actorId),
    ["zombie"],
  );
});

test("Turn Undead ends on damage, and when the turner is incapacitated", () => {
  // Damage from a spell aimed at it: Divine Spark's attack ends the
  // turning before its damage lands.
  const state = opening([monster("zombie"), monster("ghoul")], [15, 4]);
  // The Zombie fails its save, the Ghoul succeeds.
  const turned = accepted(state, turnUndead, dice([20, 1], [20, 20]));
  assert.deepEqual(conditionsOn(turned.state, "zombie"), [
    "frightened",
    "incapacitated",
  ]);
  // The Ghoul's claw hits Ilse (15 + 4 against AC 16) for 2 + 2, and she
  // fails its DC 10 Constitution save (2 + 2): paralysed, she can't keep
  // the Zombie turned.
  const clawed = accepted(
    turned.state,
    endTurn,
    dice([20, 15], [4, 2], [20, 2]),
  );
  assert.deepEqual(conditionsOn(clawed.state, "pc"), ["paralysed"]);
  assert.deepEqual(
    ended(clawed.events, "incapacitated").map(({ targetId }) => targetId),
    ["zombie"],
  );
  assert.deepEqual(conditionsOn(clawed.state, "zombie"), []);
});

test("Divine Spark: radiant damage after a Constitution save bypasses Undead Fortitude", () => {
  const state = opening([monster("zombie", { hp: 10 })], [15]);
  assert.ok(availableActions(state, "pc").includes("divine-spark"));
  // The Zombie saves 5 + 3 against DC 13 and fails; 1d8 8 + 3 = 11 radiant.
  const sparked = accepted(
    state,
    spark("zombie", "radiant"),
    dice([20, 5], [8, 8]),
  );
  const event = sparked.events.find(({ type }) => type === "divine-spark");
  assert.equal(event.mode, "radiant");
  assert.equal(event.save.total, 8);
  assert.equal(event.total, 11);
  assert.equal(event.damage, 11);
  assert.equal(event.hpAfter, 0);
  assert.equal(event.usesLeft, 1);
  assert.ok(!types(sparked.events).includes("undead-fortitude"));
  assert.equal(sparked.state.outcome, "victory");
});

test("Divine Spark: a successful save halves necrotic damage; necrotic meets Undead Fortitude", () => {
  const state = opening([monster("zombie", { hp: 10 })], [15]);
  // 15 + 3 succeeds: 1d8 8 + 3 = 11, halved to 5.
  const halved = accepted(
    state,
    spark("zombie", "necrotic"),
    dice([20, 15], [8, 8]),
  );
  assert.equal(
    halved.events.find(({ type }) => type === "divine-spark").damage,
    5,
  );
  // A failed save drops it to 0, and Undead Fortitude (DC 5 + 11) holds it
  // at 1 on 20 + 3.
  const fortified = accepted(
    state,
    spark("zombie", "necrotic"),
    dice([20, 5], [8, 8], [20, 20]),
  );
  assert.ok(types(fortified.events).includes("undead-fortitude"));
  assert.equal(combatant(fortified.state, "zombie").hp, 1);
});

test("Divine Spark heals another creature on Ilse's side, never Ilse herself", () => {
  const bram = {
    ...ilse(),
    id: "bram",
    name: "Bram",
    hp: 5,
    maxHp: 12,
    channelDivinity: undefined,
    spellcasting: undefined,
    potions: undefined,
  };
  delete bram.channelDivinity;
  delete bram.spellcasting;
  delete bram.potions;
  // Initiative: Ilse 20, Bram 10, Zombie 5 − 2.
  const state = opening([bram, monster("zombie")], [10, 5]);
  assert.equal(
    refused(state, spark("pc", "heal"), "not-self").reason,
    "Divine Spark points at another creature, never at you.",
  );
  refused(state, spark("zombie", "heal"), "healing-target");
  refused(state, spark("bram", "radiant"), "same-side");
  const healed = accepted(state, spark("bram", "heal"), dice([8, 4]));
  const event = healed.events.find(({ type }) => type === "divine-spark");
  assert.equal(event.mode, "heal");
  assert.equal(event.healing, 7);
  assert.equal(combatant(healed.state, "bram").hp, 12);
});

test("Preserve Life heals the Bloodied Ilse up to half her hit points", () => {
  const preserve = { type: "preserve-life", actorId: "pc" };
  // Above half (20 of 30) she isn't Bloodied.
  const unbloodied = opening([monster("bandit")], [10]);
  refused(unbloodied, preserve, "not-bloodied");
  assert.ok(!availableActions(unbloodied, "pc").includes("preserve-life"));
  // At 10 of 30 she regains 5 of the 15 it could give: no higher than 15.
  const bloodied = opening([monster("bandit")], [10], ilse({ hp: 10 }));
  assert.ok(availableActions(bloodied, "pc").includes("preserve-life"));
  const preserved = accepted(bloodied, preserve);
  const event = preserved.events.find(({ type }) => type === "preserve-life");
  assert.deepEqual(
    {
      healing: event.healing,
      hpAfter: event.hpAfter,
      usesLeft: event.usesLeft,
    },
    { healing: 5, hpAfter: 15, usesLeft: 1 },
  );
  // At exactly half there is nothing to restore.
  refused(preserved.state, preserve, "action-used");
  const half = opening([monster("bandit")], [10], ilse({ hp: 15 }));
  refused(half, preserve, "not-bloodied");
  // Without the Life Domain there is no Preserve Life.
  const plain = opening(
    [monster("bandit")],
    [10],
    ilse({
      hp: 10,
      channelDivinity: {
        uses: 2,
        max: 2,
        saveDc: 13,
        divineSpark: { dice: 1, sides: 8, modifier: 3 },
      },
    }),
  );
  refused(plain, preserve, "no-channel-divinity");
});

test("Disciple of Life: a healing spell cast with a slot heals 2 + the slot level more", () => {
  const state = opening([monster("bandit")], [10], ilse({ hp: 10 }));
  // Cure Wounds with a 1st-level slot: 2d8 (3 + 4) + 3 + 3.
  const first = accepted(
    state,
    cast("cure-wounds", "pc", 1),
    dice([8, 3], [8, 4]),
  );
  const healing = first.events.find(({ type }) => type === "spell-healing");
  assert.equal(healing.disciple, 3);
  assert.equal(healing.healing, 13);
  assert.equal(combatant(first.state, "pc").hp, 23);
  // With a 2nd-level slot: 4d8 (1 each) + 3 + 4.
  const second = accepted(
    state,
    cast("cure-wounds", "pc", 2),
    dice([8, 1], [8, 1], [8, 1], [8, 1]),
  );
  assert.equal(
    second.events.find(({ type }) => type === "spell-healing").healing,
    11,
  );
  // Without the feature, no extra.
  const plain = opening(
    [monster("bandit")],
    [10],
    ilse({
      hp: 10,
      spellcasting: { ...ilse().spellcasting, discipleOfLife: undefined },
    }),
  );
  const unblessed = accepted(
    plain,
    cast("cure-wounds", "pc", 1),
    dice([8, 3], [8, 4]),
  );
  const event = unblessed.events.find(({ type }) => type === "spell-healing");
  assert.equal(event.disciple, undefined);
  assert.equal(event.healing, 10);
});

test("Spiritual Weapon attacks as it is cast, then with a bonus action on later turns", () => {
  const state = opening([monster("zombie")], [15]);
  // 15 + 5 hits AC 8: 1d8 5 + 3 force.
  const cast2 = accepted(
    state,
    cast("spiritual-weapon", "zombie", 2),
    dice([20, 15], [8, 5]),
  );
  const hit = cast2.events.find(({ type }) => type === "attack");
  assert.equal(hit.weapon, "Spiritual Weapon");
  assert.equal(hit.spell, true);
  assert.equal(hit.damage, 8);
  assert.equal(hit.damageType, "force");
  assert.equal(combatant(cast2.state, "zombie").hp, 7);
  const weapon = combatant(cast2.state, "pc").effects.find(
    ({ spellId }) => spellId === "spiritual-weapon",
  );
  assert.equal(weapon.concentration, true);
  // The cast took the bonus action, so no second attack this turn.
  refused(
    cast2.state,
    { type: "spectral-attack", actorId: "pc", targetId: "zombie" },
    "bonus-action-used",
  );
  // Next turn: 10 + 5 hits for 6 + 3; the Zombie's Undead Fortitude holds
  // it at 1 (20 + 3 against DC 14).
  const round = accepted(cast2.state, endTurn, dice([20, 1]));
  assert.ok(availableActions(round.state, "pc").includes("spectral-attack"));
  const swung = accepted(
    round.state,
    { type: "spectral-attack", actorId: "pc", targetId: "zombie" },
    dice([20, 10], [8, 6], [20, 20]),
  );
  assert.equal(swung.events.find(({ type }) => type === "attack").damage, 9);
  assert.equal(combatant(swung.state, "zombie").hp, 1);
  assert.equal(swung.state.economy.bonusAction, false);
  // Concentrating on Bless ends the weapon; with nothing left to do, her
  // turn ends and the Zombie misses.
  const blessed = accepted(swung.state, cast("bless", "pc", 1), dice([20, 1]));
  assert.deepEqual(
    ended(blessed.events, "new-concentration").map(({ spellId }) => spellId),
    ["spiritual-weapon"],
  );
  assert.ok(!availableActions(blessed.state, "pc").includes("spectral-attack"));
});

test("Hold Person holds only a humanoid; a failed repeat save keeps it, damage doesn't end it", () => {
  const undead = opening([monster("zombie")], [15]);
  assert.equal(
    refused(undead, cast("hold-person", "zombie", 2), "creature-type").reason,
    "Hold Person works only on a humanoid, and Zombie is an undead.",
  );
  // Initiative: Ilse 20, Bandit 10 + 1. The Bandit saves 5 against DC 13.
  const state = opening([monster("bandit")], [10]);
  const held = accepted(state, cast("hold-person", "bandit", 2), dice([20, 5]));
  assert.deepEqual(conditionsOn(held.state, "bandit"), ["paralysed"]);
  const effect = combatant(held.state, "bandit").effects[0];
  assert.deepEqual(effect.buff, { kind: "control", by: "hold" });
  // Held, it can't act; it fails its repeat save (3) and stays paralysed.
  const round = accepted(held.state, endTurn, dice([20, 3]));
  assert.ok(!types(round.events).includes("attack"));
  assert.deepEqual(conditionsOn(round.state, "bandit"), ["paralysed"]);
  // The mace has advantage and crits (15 + 4): 2d6 1 + 1 + 2 = 4, and the
  // hold stays.
  const struck = accepted(
    round.state,
    attack("bandit"),
    dice([20, 15], [20, 12], [6, 1], [6, 1]),
  );
  const blow = struck.events.find(({ type }) => type === "attack");
  assert.equal(blow.critical, true);
  assert.equal(combatant(struck.state, "bandit").hp, 7);
  assert.deepEqual(conditionsOn(struck.state, "bandit"), ["paralysed"]);
  // Its next repeat save (15) succeeds and ends the spell on it.
  const freed = accepted(struck.state, endTurn, dice([20, 15]));
  assert.deepEqual(conditionsOn(freed.state, "bandit"), []);
  assert.deepEqual(
    ended(freed.events, "saved").map(({ spellId }) => spellId),
    ["hold-person"],
  );
});

test("Lesser Restoration ends Ilse's poisoned condition with her bonus action", () => {
  const state = opening([monster("bandit")], [10]);
  refused(state, cast("lesser-restoration", "pc", 2), "no-condition");
  const poisoned = {
    ...state,
    conditions: [
      {
        kind: "poisoned",
        targetId: "pc",
        sourceId: "bandit",
        source: "Bite",
        turnsLeft: 10,
      },
    ],
  };
  const cured = accepted(poisoned, cast("lesser-restoration", "pc", 2));
  assert.deepEqual(conditionsOn(cured.state, "pc"), []);
  assert.ok(
    cured.events.some(
      (event) => event.type === "condition-ended" && event.reason === "cured",
    ),
  );
  assert.equal(cured.state.economy.bonusAction, false);
  assert.equal(cured.state.economy.actions, 1);
});

test("Protection from Poison ends poisoned, resists poison damage and gives advantage against it", () => {
  // Initiative: Ilse 20, Giant Spider 5 + 3.
  const start = opening([monster("giant-spider")], [5]);
  const state = {
    ...start,
    conditions: [
      {
        kind: "poisoned",
        targetId: "pc",
        sourceId: "giant-spider",
        source: "Bite",
        turnsLeft: 10,
      },
    ],
  };
  const warded = accepted(state, cast("protection-from-poison", "pc", 2));
  assert.deepEqual(conditionsOn(warded.state, "pc"), []);
  // The bite hits (18 + 5): 1d8 4 + 3 piercing, then 1d6 6 poison halved
  // to 3; its Constitution save has advantage (3 and 15, 15 + 2 against
  // DC 11).
  const bitten = accepted(
    warded.state,
    endTurn,
    dice([20, 18], [8, 4], [6, 6], [20, 3], [20, 15]),
  );
  const bite = bitten.events.find(({ type }) => type === "attack");
  assert.equal(bite.rider.damage, 3);
  assert.equal(bite.rider.damageAdjustment.by, "resistance");
  const save = bitten.events.find(({ type }) => type === "save");
  assert.deepEqual(save.mode.advantage, ["Protection from Poison"]);
  assert.equal(save.success, true);
  assert.equal(combatant(bitten.state, "pc").hp, 10);
  assert.deepEqual(conditionsOn(bitten.state, "pc"), []);
});

test("Aid raises maximum and current hit points by 5, 5 more from a higher slot", () => {
  const state = opening([monster("bandit")], [10]);
  const aided = accepted(state, cast("aid", "pc", 2));
  const raised = aided.events.find(({ type }) => type === "hit-points-raised");
  assert.deepEqual(
    { bonus: raised.bonus, hpAfter: raised.hpAfter, maxHp: raised.maxHp },
    { bonus: 5, hpAfter: 25, maxHp: 35 },
  );
  const pc = combatant(aided.state, "pc");
  assert.deepEqual([pc.hp, pc.maxHp], [25, 35]);
  // It can't be cast on her again while it lasts.
  const again = castOutsideFight(pc, cast("aid", "pc", 2), dice());
  assert.equal(again.rejection.code, "effect-active");
  // Cast outside a fight with a 3rd-level slot, it gives 10.
  const higher = castOutsideFight(
    ilse({
      spellcasting: {
        ...ilse().spellcasting,
        slots: [...ilse().spellcasting.slots, { uses: 1, max: 1 }],
      },
    }),
    cast("aid", "pc", 3),
    dice(),
  );
  assert.equal(higher.caster.maxHp, 40);
  assert.equal(higher.caster.hp, 30);
});

test("Prayer of Healing: only outside a fight, 2d8 with no modifier, once until a long rest", () => {
  const state = opening([monster("bandit")], [10], ilse({ hp: 10 }));
  assert.equal(
    refused(state, cast("prayer-of-healing", "pc", 2), "not-in-fight").reason,
    "Prayer of Healing takes ten minutes to cast: only outside a fight.",
  );
  // 2d8 5 + 6, no modifier, + 4 (Disciple of Life).
  const prayed = castOutsideFight(
    ilse({ hp: 10 }),
    cast("prayer-of-healing", "pc", 2),
    dice([8, 5], [8, 6]),
  );
  const healing = prayed.events.find(({ type }) => type === "spell-healing");
  assert.deepEqual(
    { modifier: healing.modifier, disciple: healing.disciple },
    { modifier: 0, disciple: 4 },
  );
  assert.equal(prayed.caster.hp, 25);
  const lockout = prayed.caster.effects.find(
    ({ spellId }) => spellId === "prayer-of-healing",
  );
  assert.deepEqual(lockout.buff, { kind: "lockout" });
  assert.equal(lockout.ends, "long-rest");
  const again = castOutsideFight(
    prayed.caster,
    cast("prayer-of-healing", "pc", 2),
    dice(),
  );
  assert.equal(
    again.rejection.reason,
    "You can't benefit from Prayer of Healing again until a long rest.",
  );
});
