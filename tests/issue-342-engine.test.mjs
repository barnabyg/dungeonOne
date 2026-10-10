// #342: the Cleric's levels 4–5 in the encounter engine. Sear Undead adds
// radiant damage to Turn Undead without ending the turning. The 3rd-level
// spells: Spirit Guardians (an area that strikes again at the end of each
// caught foe's turn), Mass Healing Word, Beacon of Hope (advantage on
// Wisdom saves, healing at its most), Bestow Curse (two curses) and
// Protection from Energy (resistance to a chosen type). Light is flavour,
// and cantrips grow at level 5.
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import {
  act,
  castOutsideFight,
  combatant,
  currentCombatant,
  savingThrow,
  startEncounter,
} from "../dist/encounter-5e.js";
import { statBlockCombatant } from "../dist/runtime-5e.js";
import { maxTargets, SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const bestiary = await loadBuiltInFifthBestiary();
/** A bestiary monster as the runtime makes it a combatant. */
const monster = (id, extra = {}) => {
  const { statBlock } = bestiary.monsters.find(
    (candidate) => candidate.id === id,
  );
  return { ...statBlockCombatant(id, statBlock.name, statBlock), ...extra };
};
/** A bandit that never checks morale, so no morale dice are drawn. */
const bandit = (extra = {}) => {
  const { morale: _morale, ...rest } = monster("bandit");
  void _morale;
  return { ...rest, ...extra };
};

/**
 * Ilse, a level-5 Life Cleric built by hand: AC 16, 20 of 30 HP, spell
 * save DC 13 and +3 Wisdom, so Sear Undead rolls 3d8. A potion keeps her
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
    wisdom: 6,
    charisma: 4,
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
    preserveLife: 25,
    searUndead: { dice: 3, sides: 8 },
  },
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: [
      "sacred-flame",
      "light",
      "bless",
      "mass-healing-word",
      "spirit-guardians",
      "beacon-of-hope",
      "bestow-curse",
      "protection-from-energy",
    ].map((id) => spellAtLevel(SPELLS[id], 5)),
    slots: [
      { uses: 4, max: 4 },
      { uses: 3, max: 3 },
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
const cast = (spellId, targetIds, slotLevel, extra = {}) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetIds].flat(),
  ...(slotLevel === undefined ? {} : { slotLevel }),
  ...extra,
});
const ofType = (events, type) => events.filter((event) => event.type === type);
const conditionsOn = (state, id) =>
  state.conditions
    .filter(({ targetId }) => targetId === id)
    .map(({ kind }) => kind)
    .sort();
const effectOn = (state, id, spellId) =>
  combatant(state, id).effects?.find((effect) => effect.spellId === spellId);

test("Sear Undead: one roll of 3d8 radiant burns each undead that fails, and its turning stays", () => {
  // Initiative: Ilse 20, Zombie 15, Skeleton 9, Ghoul 4.
  const state = opening(
    [monster("zombie"), monster("skeleton"), monster("ghoul")],
    [15, 9, 4],
  );
  // Sear Undead's 3d8 (4 + 5 + 6 = 15) first, then the Wisdom saves: the
  // Zombie fails (1), the Skeleton succeeds (20 − 1), the Ghoul fails (1).
  const turned = accepted(
    state,
    turnUndead,
    dice([8, 4], [8, 5], [8, 6], [20, 1], [20, 20], [20, 1]),
  );
  const [turn] = ofType(turned.events, "turn-undead");
  assert.deepEqual(turn.sear, { rolls: [4, 5, 6], total: 15 });
  assert.deepEqual(
    ofType(turned.events, "sear-undead").map(
      ({ targetId, damage, hpAfter }) => [targetId, damage, hpAfter],
    ),
    [
      ["zombie", 15, 0],
      ["ghoul", 15, 7],
    ],
  );
  // Radiant damage bypasses the Zombie's Undead Fortitude: no save.
  assert.equal(ofType(turned.events, "undead-fortitude").length, 0);
  assert.equal(combatant(turned.state, "zombie").hp, 0);
  // The damage doesn't end the Ghoul's turning.
  assert.ok(
    !turned.events.some(
      (event) => event.type === "effect-ended" && event.reason === "damaged",
    ),
  );
  assert.deepEqual(conditionsOn(turned.state, "ghoul"), [
    "frightened",
    "incapacitated",
  ]);
  assert.equal(combatant(turned.state, "skeleton").hp, 13);
  assert.equal(turned.state.outcome, "ongoing");
});

test("Sear Undead can destroy the last undead and win the fight", () => {
  const state = opening([monster("zombie", { hp: 9 })], [15]);
  const turned = accepted(
    state,
    turnUndead,
    dice([8, 3], [8, 3], [8, 3], [20, 1]),
  );
  assert.equal(combatant(turned.state, "zombie").hp, 0);
  assert.equal(turned.state.outcome, "victory");
});

test("Spirit Guardians catch up to three, strike as cast and at the end of each caught foe's turn", () => {
  assert.equal(maxTargets(SPELLS["spirit-guardians"]), 3);
  const state = opening(
    [
      bandit({ id: "b1", name: "First Bandit", hp: 40, maxHp: 40 }),
      bandit({ id: "b2", name: "Second Bandit", hp: 40, maxHp: 40 }),
    ],
    [15, 10],
  );
  // One roll for the cast, 4 + 4 + 4 = 12 radiant; the First Bandit fails
  // (5 against DC 13), the Second succeeds (15) and takes half, 6.
  const cast3 = accepted(
    state,
    cast("spirit-guardians", ["b1", "b2"], 3),
    dice([8, 4], [8, 4], [8, 4], [20, 5], [20, 15]),
  );
  assert.equal(combatant(cast3.state, "b1").hp, 28);
  assert.equal(combatant(cast3.state, "b2").hp, 34);
  const guardians = effectOn(cast3.state, "pc", "spirit-guardians");
  assert.deepEqual(guardians.caught, ["b1", "b2"]);
  assert.equal(guardians.concentration, true);
  assert.equal(guardians.ends, "fight");
  // Each bandit misses (a natural 1), then ends its turn among the
  // guardians: the First fails (24 radiant), the Second succeeds (6, half
  // is 3). Each roll is fresh.
  const round = accepted(
    cast3.state,
    endTurn,
    dice(
      [20, 1],
      [20, 1],
      [8, 8],
      [8, 8],
      [8, 8],
      [20, 1],
      [20, 20],
      [8, 2],
      [8, 2],
      [8, 2],
    ),
  );
  const struck = ofType(round.events, "spell-save").map(
    ({ targetId, damage, spell }) => [spell, targetId, damage],
  );
  assert.deepEqual(struck, [
    ["Spirit Guardians", "b1", 24],
    ["Spirit Guardians", "b2", 3],
  ]);
  assert.equal(combatant(round.state, "b1").hp, 4);
  assert.equal(combatant(round.state, "b2").hp, 31);
  assert.equal(round.state.round, 2);
  // Concentrating on Bless ends the guardians: the bandits' turns end
  // without a save.
  const blessed = accepted(round.state, cast("bless", "pc", 1));
  assert.equal(effectOn(blessed.state, "pc", "spirit-guardians"), undefined);
  const quiet = accepted(blessed.state, endTurn, dice([20, 1], [20, 1]));
  assert.equal(ofType(quiet.events, "spell-save").length, 0);
});

test("Spirit Guardians' damage at a turn's end can win the fight", () => {
  const state = opening([bandit({ hp: 20, maxHp: 20 })], [15]);
  const cast3 = accepted(
    state,
    cast("spirit-guardians", "bandit", 3),
    dice([8, 4], [8, 4], [8, 4], [20, 5]),
  );
  assert.equal(combatant(cast3.state, "bandit").hp, 8);
  const round = accepted(
    cast3.state,
    endTurn,
    dice([20, 1], [20, 1], [8, 3], [8, 3], [8, 3]),
  );
  assert.equal(combatant(round.state, "bandit").hp, 0);
  assert.equal(round.state.outcome, "victory");
});

test("Bestow Curse names one of its curses, and only it names one", () => {
  const state = opening([bandit({ hp: 40, maxHp: 40 })], [15]);
  refused(state, cast("bestow-curse", "bandit", 3), "curse");
  refused(
    state,
    cast("bestow-curse", "bandit", 3, { curse: "deafness" }),
    "curse",
  );
  refused(state, cast("bless", "pc", 1, { curse: "necrotic" }), "curse");
});

test("Bestow Curse's necrotic curse adds 1d8 to Ilse's hits and damaging spells", () => {
  const state = opening([bandit({ hp: 40, maxHp: 40 })], [15]);
  // The bandit fails its Wisdom save (5 against DC 13): cursed while Ilse
  // concentrates.
  const cursed = accepted(
    state,
    cast("bestow-curse", "bandit", 3, { curse: "necrotic" }),
    dice([20, 5]),
  );
  const [curseEvent] = ofType(cursed.events, "spell-curse");
  assert.equal(curseEvent.success, false);
  assert.equal(curseEvent.curse, "necrotic");
  const curse = effectOn(cursed.state, "bandit", "bestow-curse");
  assert.deepEqual(curse.buff, {
    kind: "curse",
    curse: "necrotic",
    damage: { dice: 1, sides: 8, type: "necrotic" },
  });
  assert.equal(curse.concentration, true);
  assert.equal(curse.ends, "fight");
  // The bandit misses; Ilse's mace hits (15 + 4) for 4 + 2, and the curse
  // adds 5 necrotic.
  const round = accepted(cursed.state, endTurn, dice([20, 1]));
  const swung = accepted(
    round.state,
    attack("bandit"),
    dice([20, 15], [6, 4], [8, 5]),
  );
  const [hit] = ofType(swung.events, "attack");
  assert.equal(hit.damage, 6);
  assert.deepEqual(
    [hit.rider.damage, hit.rider.damageType, hit.rider.curse],
    [5, "necrotic", "Bestow Curse"],
  );
  assert.equal(combatant(swung.state, "bandit").hp, 29);
  // Next turn, Sacred Flame (2d8 at level 5) after a failed save: 3 + 3
  // radiant, and 2 necrotic more.
  const again = accepted(swung.state, endTurn, dice([20, 1]));
  const flamed = accepted(
    again.state,
    cast("sacred-flame", "bandit"),
    dice([20, 1], [8, 3], [8, 3], [8, 2]),
  );
  const [burn] = ofType(flamed.events, "spell-save");
  assert.equal(burn.damage, 6);
  assert.equal(burn.curse.damage, 2);
  assert.equal(burn.hpAfter, 21);
  assert.equal(combatant(flamed.state, "bandit").hp, 21);
});

test("Bestow Curse's other curse gives the bandit disadvantage on attacks against Ilse", () => {
  const state = opening([bandit({ hp: 40, maxHp: 40 })], [15]);
  const cursed = accepted(
    state,
    cast("bestow-curse", "bandit", 3, { curse: "attacks" }),
    dice([20, 5]),
  );
  // 15 would hit (15 + 3 against AC 16); the lower 3 misses.
  const round = accepted(cursed.state, endTurn, dice([20, 15], [20, 3]));
  const [swing] = ofType(round.events, "attack");
  assert.deepEqual(swing.mode.disadvantage, ["Bestow Curse"]);
  assert.equal(swing.d20, 3);
  assert.equal(swing.hit, false);
});

test("a bandit that saves against Bestow Curse isn't cursed", () => {
  const state = opening([bandit()], [15]);
  const saved = accepted(
    state,
    cast("bestow-curse", "bandit", 3, { curse: "attacks" }),
    dice([20, 13]),
  );
  assert.equal(ofType(saved.events, "spell-curse")[0].success, true);
  assert.equal(effectOn(saved.state, "bandit", "bestow-curse"), undefined);
});

test("Beacon of Hope: advantage on Wisdom saves, and potions and healing spells heal their most", () => {
  const state = opening([bandit()], [15], ilse({ hp: 10, maxHp: 40 }));
  const lit = accepted(state, cast("beacon-of-hope", "pc", 3));
  const beacon = effectOn(lit.state, "pc", "beacon-of-hope");
  assert.equal(beacon.concentration, true);
  assert.equal(beacon.ends, "fight");
  const pc = combatant(lit.state, "pc");
  const save = savingThrow(
    lit.state,
    pc,
    { ability: "wisdom", dc: 15 },
    dice([20, 3], [20, 18]),
  );
  assert.deepEqual(save.mode.advantage, ["Beacon of Hope"]);
  assert.equal(save.d20, 18);
  // A Constitution save has no advantage.
  const con = savingThrow(
    lit.state,
    pc,
    { ability: "constitution", dc: 15 },
    dice([20, 3]),
  );
  assert.equal(con.mode, undefined);
  // The potion's 2d4 + 2 is 10 without a roll. With nothing left to do,
  // Ilse's turn ends and the bandit misses.
  const drunk = accepted(
    lit.state,
    { type: "drink-potion", actorId: "pc", itemId: "potion" },
    dice([20, 1]),
  );
  const [potion] = ofType(drunk.events, "potion");
  assert.deepEqual(potion.rolls, [4, 4]);
  assert.equal(potion.maximised, "Beacon of Hope");
  assert.equal(potion.hpAfter, 20);
  assert.equal(combatant(drunk.state, "pc").hp, 20);
  // Mass Healing Word, a bonus action: 2d4 at most (8) + 3 + Disciple of
  // Life's 5 = 16.
  assert.equal(drunk.state.round, 2);
  const healed = accepted(drunk.state, cast("mass-healing-word", "pc", 3));
  const [heal] = ofType(healed.events, "spell-healing");
  assert.deepEqual(heal.rolls, [4, 4]);
  assert.equal(heal.maximised, "Beacon of Hope");
  assert.equal(heal.disciple, 5);
  assert.equal(heal.hpAfter, 36);
  assert.equal(healed.state.economy.bonusAction, false);
  assert.equal(healed.state.economy.actions, 1);
});

test("Beacon of Hope lasts no longer than a fight: never cast outside one", () => {
  const result = castOutsideFight(
    ilse(),
    cast("beacon-of-hope", "pc", 3),
    dice(),
  );
  assert.equal(result.rejection?.code, "fight-only");
});

test("Mass Healing Word heals 2d4 + Wisdom + Disciple of Life with a bonus action", () => {
  const state = opening([bandit()], [15], ilse({ hp: 10 }));
  const healed = accepted(
    state,
    cast("mass-healing-word", "pc", 3),
    dice([4, 2], [4, 3]),
  );
  const [heal] = ofType(healed.events, "spell-healing");
  assert.equal(heal.healing, 13);
  assert.equal(heal.maximised, undefined);
  assert.equal(healed.state.economy.actions, 1);
});

test("Protection from Energy: a chosen type, cast outside a fight, resists that damage", () => {
  const unchosen = castOutsideFight(
    ilse(),
    cast("protection-from-energy", "pc", 3),
    dice(),
  );
  assert.equal(unchosen.rejection?.code, "damage-type");
  const poison = castOutsideFight(
    ilse(),
    cast("protection-from-energy", "pc", 3, { damageType: "poison" }),
    dice(),
  );
  assert.equal(poison.rejection?.code, "damage-type");
  const warded = castOutsideFight(
    ilse(),
    cast("protection-from-energy", "pc", 3, { damageType: "fire" }),
    dice(),
  );
  assert.equal(warded.rejection, undefined, warded.rejection?.reason);
  const ward = effectOn(
    { combatants: [warded.caster] },
    "pc",
    "protection-from-energy",
  );
  assert.deepEqual(
    [ward.buff.kind, ward.damageType, ward.concentration, ward.ends],
    ["energy-ward", "fire", true, "rest"],
  );
  assert.equal(warded.caster.spellcasting.slots[2].uses, 1);
  // A fire-wielding bandit hits (15 + 3) for 6 + 1 = 7 fire, halved to 3;
  // Ilse keeps concentrating (15 + 2 against DC 10).
  const foe = bandit();
  const state = opening(
    [
      {
        ...foe,
        attack: {
          ...foe.attack,
          damage: { ...foe.attack.damage, type: "fire" },
        },
      },
    ],
    [15],
    warded.caster,
  );
  const round = accepted(state, endTurn, dice([20, 15], [6, 6], [20, 15]));
  const [hit] = ofType(round.events, "attack");
  assert.equal(hit.damage, 3);
  assert.equal(hit.damageAdjustment.by, "resistance");
  assert.equal(combatant(round.state, "pc").hp, 17);
});

test("Light is flavour only, and cantrips grow at level 5", () => {
  const state = opening([bandit()], [15]);
  refused(state, cast("light", "bandit"), "no-effect");
  assert.equal(spellAtLevel(SPELLS["sacred-flame"], 4).effect.damage.dice, 1);
  assert.equal(spellAtLevel(SPELLS["sacred-flame"], 5).effect.damage.dice, 2);
});
