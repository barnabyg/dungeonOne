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
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  nextLevelXp,
  validateCharacter,
  type CreationChoices,
  type CharacterSheet,
  type LevelChoice,
} from "./character-5e.js";
import { type Level } from "./class-5e.js";

/** Ada's choices, also for creating her from rolled dice over the browser API. */
export const TEST_FIGHTER_CHOICES: CreationChoices = {
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
export const TEST_FIGHTER: CharacterSheet = buildCharacter(
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

/**
 * Ada's level-4 choice (#287): +1 Strength and +1 Constitution (Str 18, Con
 * 16), and the longsword's mastery.
 */
export const TEST_FIGHTER_LEVEL_CHOICE: LevelChoice = {
  increase: { strength: 1, constitution: 1 },
  mastery: "longsword",
};

/**
 * Ada raised to `level` with the least XP it needs, at full health (#241).
 * Level 3 is the highest whose sheet owes no level choice; at level 5 she has
 * made `TEST_FIGHTER_LEVEL_CHOICE`, while a level-4 Ada still owes hers.
 */
export function testFighterAt(level: Level): CharacterSheet {
  const xp = level === 1 ? 0 : nextLevelXp((level - 1) as Level)!;
  const raised = { ...TEST_FIGHTER, level, xp };
  const sheet = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  return level < 5 ? sheet : applyLevelChoice(sheet, TEST_FIGHTER_LEVEL_CHOICE);
}

/**
 * A character library holding only Ada at `level` (#275), as
 * `testFighterAt` raises her: the player handoffs for modules above level 1
 * start from it (docs/acceptance/inputs/issue-275/level-2-ada.json).
 */
export function libraryAt(level: Level): FifthLibraryData {
  return {
    kind: "dungeon-one-characters",
    formatVersion: FIFTH_LIBRARY_FORMAT,
    revision: "0".repeat(32),
    creationsStarted: 1,
    sessionsStarted: 0,
    characters: [{ sheet: testFighterAt(level), revision: 1 }],
  };
}

/**
 * A character library holding only Ada at level 3 (#241). The Silvervein
 * Mine is for levels 2–3, so its release runs and its player handoff
 * (docs/acceptance/inputs/increment-13/level-3-ada.json) start from it.
 */
export function levelThreeLibrary(): FifthLibraryData {
  return libraryAt(3);
}

/**
 * A character library holding only Ada at level 4 with 4,100 XP, her
 * level-4 choices made (#291): about what a career holds after the modules
 * below level 4, so the Thornwood Lodge takes her to level 5. Its release
 * runs and its player handoff
 * (docs/acceptance/inputs/increment-14/level-4-ada-4100-xp.json) start from it.
 */
export function levelFourCareerLibrary(): FifthLibraryData {
  const library = libraryAt(4);
  const sheet = testFighterAt(4);
  return {
    ...library,
    characters: [
      {
        sheet: validateCharacter(
          applyLevelChoice({ ...sheet, xp: 4100 }, TEST_FIGHTER_LEVEL_CHOICE),
        ),
        revision: 1,
      },
    ],
  };
}
