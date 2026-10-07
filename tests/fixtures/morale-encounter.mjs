// The encounter-engine fights of the morale (#237) and surrender (#238)
// tests: Ada, who wins initiative and has Action Surge, against 1-HP goblins
// with morale DC 8, on scripted dice.
import assert from "node:assert/strict";
import { act, startEncounter } from "../../dist/encounter-5e.js";
import { dice } from "./engine-dice.mjs";

/** Saving throw bonuses with the given Wisdom bonus. */
export const saves = (wisdom) => ({
  strength: 0,
  dexterity: 2,
  constitution: 0,
  intelligence: 0,
  wisdom,
  charisma: -1,
});

/**
 * Ada wins initiative and has Action Surge, so she can attack twice, or her
 * turn waits for her.
 */
export const ada = {
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 12,
  maxHp: 12,
  dexterity: 12,
  initiativeBonus: 1,
  saves: saves(0),
  actionSurge: { uses: 1, max: 1 },
  attack: {
    name: "Longsword",
    bonus: 5,
    damage: { dice: 1, sides: 8, modifier: 3, type: "slashing" },
    criticalRange: 20,
  },
};

/** A goblin with 1 HP, which any hit drops, and morale DC 8. */
export const goblin = (id, extra = {}) => ({
  id,
  name: `Goblin ${id.slice(1)}`,
  side: "opponents",
  armorClass: 15,
  hp: 1,
  maxHp: 1,
  dexterity: 14,
  initiativeBonus: 2,
  saves: saves(-1),
  morale: 8,
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
  ...extra,
});

/** Initiative: Ada 15 + 1, then each goblin lower in the order given. */
export const initiative = (count) => [
  [20, 15],
  ...Array.from({ length: count }, (_, index) => [20, 5 - index]),
];

/** A hit for 1d8 + 3 that drops a 1-HP goblin. */
export const KILL = [
  [20, 15],
  [8, 4],
];

/**
 * Starts a fight between `combatants`, Ada first, on initiative dice and then
 * `rest`; with the dice, to play on.
 */
export function begin(combatants, ...rest) {
  const random = dice(...initiative(combatants.length - 1), ...rest);
  const { state } = startEncounter(combatants, random);
  return { state, random };
}

/** Ada attacks `targetId`, which the engine must accept. */
export function attack(state, random, targetId) {
  const result = act(
    state,
    { type: "attack", actorId: "pc", targetId },
    random,
  );
  assert.equal(result.rejection, undefined);
  return result;
}
