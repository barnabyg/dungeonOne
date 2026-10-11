// A level-5 Evoker for the #344 tests: Vela, built level by level with the
// harness's choices, then the 3rd-level spells a test names written into her
// spellbook and prepared.
import {
  addToSpellbook,
  applyLevelChoice,
  buildCharacter,
  defaultPlacement,
  prepareSpells,
  settleCharacter,
  withOwedChoices,
} from "../../dist/character-5e.js";
import { WIZARD } from "../../dist/wizard-5e.js";

// Kept totals 15, 14, 13, 12, 10, 8: Intelligence 17, Dexterity 14.
export const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];

/** `sheet` after an adventure that earned `xp`, keeping what it holds. */
export const earn = (sheet, xp, id) =>
  settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: sheet.stowed,
      ammunition: sheet.ammunition,
      treasure: [],
      purse: 0,
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });

/** The seven spells Vela prepares at level 5 besides those she writes. */
export const KEPT = [
  "mage-armor",
  "magic-missile",
  "shield",
  "sleep",
  "burning-hands",
  "chromatic-orb",
  "thunderwave",
];

/** Vela at level 1, from the Wizard's defaults. */
export const freshVela = () =>
  buildCharacter(
    "e".repeat(32),
    "Vela",
    DICE,
    { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
    "wizard",
  );

/**
 * Vela at level 4 with +1 Intelligence and +1 Constitution (Intelligence
 * 18: spell attack +6, DC 14; 26 HP), her choices made.
 */
export const velaAt4 = () => {
  let sheet = withOwedChoices(earn(freshVela(), 300, "cellar"));
  sheet = withOwedChoices(earn(sheet, 600, "barrow"));
  return withOwedChoices(
    applyLevelChoice(earn(sheet, 1800, "crypt"), {
      increase: { intelligence: 1, constitution: 1 },
    }),
  );
};

/**
 * Vela, a level-5 Evoker (spell attack +7, DC 15; 32 HP) who wrote the
 * 3rd-level spells `written` into her spellbook at level 5 and prepared
 * them.
 */
export const vela = (written) => {
  const sheet = addToSpellbook(earn(velaAt4(), 3800, "tomb"), written);
  return prepareSpells(sheet, [...KEPT, ...written]);
};
