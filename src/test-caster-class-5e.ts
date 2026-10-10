/**
 * A test-only spellcasting class (#336), as class data: it exercises the
 * class-agnostic casting engine until the Cleric and the Wizard join. Its
 * spell slots follow the SRD 5.2 full-caster table; it casts with Wisdom.
 * Creation never offers it (`testOnly`) and the gate never plays it.
 */
import type {
  Ability,
  ClassDefinition,
  DefaultChoices,
  SpellcastingDefinition,
} from "./class-5e.js";

/** The order a fresh creation fills the abilities: Wisdom casts its spells. */
const TEST_CASTER_ABILITY_PRIORITY = [
  "wisdom",
  "constitution",
  "dexterity",
  "strength",
  "charisma",
  "intelligence",
] as const satisfies readonly Ability[];

/**
 * Its spellcasting: two cantrips known and three spells prepared from a
 * short list, and the full-caster slots (SRD 5.2).
 */
export const TEST_CASTER_SPELLCASTING: SpellcastingDefinition = {
  ability: "wisdom",
  cantrips: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
  prepared: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
  slots: { 1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2] },
  list: [
    "fire-bolt",
    "sacred-flame",
    "shocking-grasp",
    "magic-missile",
    "inflict-wounds",
    "cure-wounds",
    "healing-word",
  ],
};

/**
 * Its default choices: Fire Bolt and Sacred Flame, with Magic Missile, Cure
 * Wounds and Healing Word prepared; the mace and leather kit.
 */
export const TEST_CASTER_DEFAULT_CHOICES = {
  increase: { wisdom: 2, constitution: 1 },
  skills: ["insight", "perception"],
  spells: {
    cantrips: ["fire-bolt", "sacred-flame"],
    prepared: ["magic-missile", "cure-wounds", "healing-word"],
  },
  kit: "mace",
  masteries: [],
} as const satisfies DefaultChoices;

export const TEST_CASTER_CLASS: ClassDefinition = {
  id: "test-caster",
  name: "Test Caster",
  hitDie: 8,
  primaryAbilities: ["wisdom"],
  abilityPriority: TEST_CASTER_ABILITY_PRIORITY,
  savingThrows: ["wisdom", "charisma"],
  skillChoices: {
    options: ["history", "insight", "perception", "persuasion"],
    count: 2,
  },
  armourTraining: ["light"],
  weaponProficiencies: ["simple"],
  toolProficiencies: [],
  weaponMasteries: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  features: [
    {
      id: "spellcasting",
      level: 1,
      name: "Spellcasting",
      text: "You cast the cantrips you know at will and your prepared spells with spell slots, one slot a turn. A long rest restores every spent slot.",
    },
  ],
  subclasses: [],
  defaults: TEST_CASTER_DEFAULT_CHOICES,
  kits: ["mace"],
  spellcasting: TEST_CASTER_SPELLCASTING,
  testOnly: true,
};
