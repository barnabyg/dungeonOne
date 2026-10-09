/**
 * The fixed Rogue the increment 15 release run and player handoff play
 * (#311): Vex, created with a new Rogue's default choices, raised to a level
 * and alone in a library, as `test-fighter-5e.ts` does for Ada.
 */
import {
  FIFTH_LIBRARY_FORMAT,
  type FifthLibraryData,
} from "./character-library-5e.js";
import {
  buildCharacter,
  characterProfile,
  defaultPlacement,
  nextLevelXp,
  validateCharacter,
  type CharacterSheet,
  type RolledDice,
} from "./character-5e.js";
import { type Level } from "./class-5e.js";
import { ROGUE } from "./rogue-5e.js";

/** Vex's dice: 16, 12, 12, 9, 9 and 9 kept. */
const TEST_ROGUE_DICE: RolledDice = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];

/**
 * Vex: Dex 18 (+4), Con 13 (+1), Wis 12 (+1), Cha 9 (−1); Expertise in
 * Perception and Stealth; the shortsword, dagger and leather kit with
 * thieves' tools.
 */
export const TEST_ROGUE: CharacterSheet = buildCharacter(
  "b".repeat(32),
  "Vex",
  TEST_ROGUE_DICE,
  { ...ROGUE.defaults, placement: defaultPlacement(TEST_ROGUE_DICE, ROGUE) },
  "rogue",
);

/**
 * Vex raised to `level` (1–3, which owe no level choice) with the least XP
 * it needs, at full health, carrying `purse` copper.
 */
export function testRogueAt(level: 1 | 2 | 3, purse = 0): CharacterSheet {
  const xp = level === 1 ? 0 : nextLevelXp((level - 1) as Level)!;
  const raised = { ...TEST_ROGUE, level, xp, purse };
  return validateCharacter({ ...raised, hp: characterProfile(raised).maxHp });
}

/**
 * A character library holding only Vex at level 3 with 20 gp, about what a
 * career brings out of the level-1 and level-2 modules (#311): The
 * Counting-House on Mallow Quay's release run and player handoff
 * (docs/acceptance/inputs/increment-15/level-3-vex.json) start from it, and
 * the gold pays Snikk's toll.
 */
export function rogueLibrary(): FifthLibraryData {
  return {
    kind: "dungeon-one-characters",
    formatVersion: FIFTH_LIBRARY_FORMAT,
    revision: "0".repeat(32),
    creationsStarted: 1,
    sessionsStarted: 0,
    characters: [{ sheet: testRogueAt(3, 2000), revision: 1 }],
  };
}
