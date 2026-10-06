/**
 * The fixed level-1 Fighter the command-line adapter and the 5e DM evaluation
 * play, so their runs are reproducible from a seed alone.
 */
import {
  buildFighter,
  type FighterChoices,
  type FighterSheet,
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
