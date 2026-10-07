/**
 * The fixed level-1 Fighter the command-line adapter and the 5e DM evaluation
 * play, so their runs are reproducible from a seed alone, and the same Fighter
 * raised to a higher level, alone in a library, for release runs of modules
 * above level 1 (#241).
 */
import {
  FIFTH_LIBRARY_FORMAT,
  type FifthLibraryData,
} from "./character-library-5e.js";
import {
  buildFighter,
  fighterProfile,
  nextLevelXp,
  validateFighter,
  type FighterChoices,
  type FighterSheet,
  type Level,
} from "./fighter-5e.js";

/** Ada's choices, also for creating her from rolled dice over the browser API. */
export const TEST_FIGHTER_CHOICES: FighterChoices = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

/**
 * Ada: Str 17 (+3), Dex 14 (+2), Con 15 (+2); Athletics and Perception; the
 * mace and leather kit (AC 14 with Defense).
 */
export const TEST_FIGHTER: FighterSheet = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [5, 5, 5, 1],
    [5, 5, 4, 1],
    [5, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 4, 1],
    [3, 3, 3, 1],
  ],
  TEST_FIGHTER_CHOICES,
);

/** Ada raised to `level` with the least XP it needs, at full health (#241). */
export function testFighterAt(level: Level): FighterSheet {
  const xp = level === 1 ? 0 : nextLevelXp((level - 1) as Level)!;
  const raised = { ...TEST_FIGHTER, level, xp };
  return validateFighter({ ...raised, hp: fighterProfile(raised).maxHp });
}

/**
 * A character library holding only Ada at level 3 (#241). The Silvervein
 * Mine is for levels 2–3, so its release runs and its player handoff
 * (docs/acceptance/inputs/increment-13/level-3-ada.json) start from it.
 */
export function levelThreeLibrary(): FifthLibraryData {
  return {
    kind: "dungeon-one-characters",
    formatVersion: FIFTH_LIBRARY_FORMAT,
    revision: "0".repeat(32),
    creationsStarted: 1,
    sessionsStarted: 0,
    characters: [{ sheet: testFighterAt(3), revision: 1 }],
  };
}
