// The level-3 casters the increment 16 release handoff plays (#350): Mira,
// a Life Domain Cleric, and Vela, an Evoker, each created from the same dice
// with her class's default choices and kit, raised to level 3 as the gate
// raises a character, and alone in a library
// (docs/acceptance/inputs/increment-16/).
import { characterAtLevel } from "../../dist/balance-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../../dist/character-library-5e.js";
import { validateCharacter } from "../../dist/character-5e.js";

// Kept totals 15, 14, 13, 12, 10, 8, as Vela's at level 5
// (level-5-wizard.mjs).
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];

/** A level-3 `classId` from the dice, with its own id and name. */
const casterAt3 = (classId, id, name) =>
  validateCharacter({
    ...characterAtLevel(DICE, 3, undefined, false, undefined, classId),
    id: id.repeat(32),
    name,
  });

/** Mira, a level-3 Life Domain Cleric with the default kit. */
export const mira = () => casterAt3("cleric", "c", "Mira");

/** Vela, a level-3 Evoker with the default kit. */
export const vela = () => casterAt3("wizard", "e", "Vela");

/** A character library holding only `sheet`, as the handoff gives it. */
export const libraryOf = (sheet) => ({
  kind: "dungeon-one-characters",
  formatVersion: FIFTH_LIBRARY_FORMAT,
  revision: "0".repeat(32),
  creationsStarted: 1,
  sessionsStarted: 0,
  characters: [{ sheet, revision: 1 }],
});
