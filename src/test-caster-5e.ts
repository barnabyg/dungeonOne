/**
 * The fixed test-only caster (#336): Sage, created with the test caster
 * class's default choices, as `test-fighter-5e.ts` makes Ada. Tests, the
 * scripted DM cases and trace replay cast with Sage until a playable class
 * casts; creation never offers the class.
 */
import {
  buildCharacter,
  characterProfile,
  defaultPlacement,
  nextLevelXp,
  validateCharacter,
  type CharacterSheet,
  type CreationChoices,
  type RolledDice,
} from "./character-5e.js";
import { type Level } from "./class-5e.js";
import { TEST_CASTER_CLASS } from "./test-caster-class-5e.js";

/** Sage's dice: 15, 14, 13, 12, 10 and 9 kept, as Ada's. */
const TEST_CASTER_DICE: RolledDice = [
  [5, 5, 5, 1],
  [5, 5, 4, 1],
  [5, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 4, 1],
  [3, 3, 3, 1],
];

/** Sage's choices: the class's defaults, with `spells` in place of its spells. */
export function testCasterChoices(
  spells: CreationChoices["spells"] = TEST_CASTER_CLASS.defaults.spells,
): CreationChoices {
  return {
    ...TEST_CASTER_CLASS.defaults,
    ...(spells === undefined ? {} : { spells }),
    placement: defaultPlacement(TEST_CASTER_DICE, TEST_CASTER_CLASS),
  };
}

/**
 * Sage: Wis 17 (+3), Con 15 (+2), Dex 13 (+1); spell attack +5 and save DC
 * 13 at level 1; Fire Bolt and Sacred Flame, with Magic Missile, Cure Wounds
 * and Healing Word prepared; the mace and leather kit (AC 12).
 */
export const TEST_CASTER: CharacterSheet = buildCharacter(
  "c".repeat(32),
  "Sage",
  TEST_CASTER_DICE,
  testCasterChoices(),
  "test-caster",
);

/**
 * Sage raised to `level` with the least XP it needs, at full health; with
 * `spells`, knowing and preparing those instead.
 */
export function testCasterAt(
  level: Level,
  spells?: CreationChoices["spells"],
): CharacterSheet {
  const xp = level === 1 ? 0 : nextLevelXp((level - 1) as Level)!;
  const raised = {
    ...TEST_CASTER,
    level,
    xp,
    ...(spells === undefined ? {} : { spells }),
  };
  return validateCharacter({ ...raised, hp: characterProfile(raised).maxHp });
}
