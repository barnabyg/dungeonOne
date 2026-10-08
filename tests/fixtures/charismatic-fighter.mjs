// Bea, a charismatic Fighter for the reaction-roll tests (#304): Ada's dice,
// with her best roll on Charisma and +2 to it (Charisma 16, +3), so a
// reaction roll can land friendly, which Ada's Charisma −1 never reaches.
import { buildCharacter } from "../../dist/character-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../../dist/character-library-5e.js";
import { TEST_FIGHTER_CHOICES } from "../../dist/test-fighter-5e.js";

export const BEA = buildCharacter(
  "b".repeat(32),
  "Bea",
  [
    [5, 5, 5, 1],
    [5, 5, 4, 1],
    [5, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 4, 1],
    [3, 3, 3, 1],
  ],
  {
    ...TEST_FIGHTER_CHOICES,
    placement: {
      strength: 0,
      charisma: 1,
      dexterity: 2,
      constitution: 3,
      intelligence: 4,
      wisdom: 5,
    },
    increase: { charisma: 2, strength: 1 },
  },
);

/** A character library holding only Bea. */
export const beaLibrary = () => ({
  kind: "dungeon-one-characters",
  formatVersion: FIFTH_LIBRARY_FORMAT,
  revision: "0".repeat(32),
  creationsStarted: 1,
  sessionsStarted: 0,
  characters: [{ sheet: BEA, revision: 1 }],
});
