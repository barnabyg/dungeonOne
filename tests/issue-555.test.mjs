// #555: Protection from Evil and Good replaces the party-only Mass Healing
// Word and Beacon of Hope on the Cleric's list, and Protection from Energy
// leaves both caster lists. Its attacks-with-disadvantage ward works only
// against the types it names; charm, fright and possession are omitted.
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import { CLERIC_SPELLCASTING, LIFE_DOMAIN } from "../dist/cleric-5e.js";
import {
  act,
  castOutsideFight,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { statBlockCombatant } from "../dist/runtime-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { WIZARD_SPELLCASTING } from "../dist/wizard-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const bestiary = await loadBuiltInFifthBestiary();
/** A bestiary monster that never checks morale, as a combatant. */
const monster = (id) => {
  const { statBlock } = bestiary.monsters.find(
    (candidate) => candidate.id === id,
  );
  const { morale: _morale, ...rest } = statBlockCombatant(
    id,
    statBlock.name,
    statBlock,
  );
  void _morale;
  return rest;
};

/** Ilse, a level-1 Cleric built by hand: AC 16, 10 HP, one spell. */
const ilse = (extra = {}) => ({
  id: "pc",
  name: "Ilse",
  side: "party",
  creatureType: "humanoid",
  armorClass: 16,
  hp: 10,
  maxHp: 10,
  dexterity: 10,
  initiativeBonus: 0,
  saves: {
    strength: 0,
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
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: [spellAtLevel(SPELLS["protection-from-evil-and-good"], 1)],
    slots: [{ uses: 2, max: 2 }],
  },
  ...extra,
});

const ward = {
  type: "cast",
  actorId: "pc",
  spellId: "protection-from-evil-and-good",
  targetIds: ["pc"],
  slotLevel: 1,
};
const endTurn = { type: "end-turn", actorId: "pc" };

/** Ilse warded outside a fight, then a fight she opens against `foe`. */
function wardedFight(foe) {
  const warded = castOutsideFight(ilse(), ward, dice());
  assert.equal(warded.rejection, undefined, warded.rejection?.reason);
  const { state } = startEncounter(
    [warded.caster, foe],
    dice([20, 20], [20, 1]),
  );
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

/** The first attack of the foe's turn after Ilse ends hers. */
function foeAttack(state, rolls) {
  const result = act(state, endTurn, dice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.events.find(({ type }) => type === "attack");
}

test("the Cleric's list swaps Mass Healing Word and Beacon of Hope for Protection from Evil and Good; Protection from Energy leaves both lists", () => {
  for (const id of [
    "mass-healing-word",
    "beacon-of-hope",
    "protection-from-energy",
  ]) {
    assert.equal(SPELLS[id], undefined, id);
    assert.ok(!CLERIC_SPELLCASTING.list.includes(id), id);
    assert.ok(!WIZARD_SPELLCASTING.list.includes(id), id);
  }
  assert.ok(CLERIC_SPELLCASTING.list.includes("protection-from-evil-and-good"));
  assert.ok(
    !WIZARD_SPELLCASTING.list.includes("protection-from-evil-and-good"),
  );
  // The Life Domain grants no level-5 spell (#555).
  assert.deepEqual(
    LIFE_DOMAIN.features.map(({ level }) => level),
    [3, 3, 3],
  );
});

test("Protection from Evil and Good is SRD 5.2's: 1st-level abjuration, an action, concentration to the next rest", () => {
  const spell = SPELLS["protection-from-evil-and-good"];
  assert.equal(spell.level, 1);
  assert.equal(spell.school, "abjuration");
  assert.equal(spell.castingTime, "action");
  assert.equal(spell.effect.concentration, true);
  assert.deepEqual(spell.effect.buff.types, [
    "aberration",
    "celestial",
    "elemental",
    "fey",
    "fiend",
    "undead",
  ]);
  const warded = castOutsideFight(ilse(), ward, dice());
  const effect = warded.caster.effects.find(
    ({ spellId }) => spellId === "protection-from-evil-and-good",
  );
  assert.deepEqual(
    [effect.buff.kind, effect.concentration, effect.ends],
    ["type-ward", true, "rest"],
  );
  assert.equal(warded.caster.spellcasting.slots[0].uses, 1);
});

test("an undead or a fey attacks a warded Cleric with disadvantage", () => {
  for (const id of ["zombie", "goblin-warrior"]) {
    // 20 and 2 with disadvantage: the 2 misses AC 16.
    const attack = foeAttack(wardedFight(monster(id)), [
      [20, 20],
      [20, 2],
    ]);
    assert.deepEqual(
      attack.mode.disadvantage,
      ["Protection from Evil and Good"],
      id,
    );
    assert.equal(attack.d20, 2, id);
    assert.equal(attack.hit, false, id);
  }
});

test("a humanoid or a beast attacks a warded Cleric as usual", () => {
  for (const id of ["bandit", "wolf"]) {
    // One d20, a 2, and a miss.
    const attack = foeAttack(wardedFight(monster(id)), [[20, 2]]);
    assert.equal(attack.mode, undefined, id);
    assert.equal(attack.d20, 2, id);
  }
});
