/**
 * The SRD 5.2 Cleric at level 1, as class data (#339). The character module
 * (`character-5e.ts`) derives a Cleric's hit points, saves, skills,
 * training, spellcasting and Divine Order from this definition alone. Its
 * spell tables follow SRD 5.2 at every level, but a Cleric stays at level 1
 * (`maxLevel`) until its level 2–5 features come (#341); XP above level 1's
 * is kept. `docs/character-rules.md` records the numbers and the
 * abstractions.
 */
import {
  type Ability,
  type ClassDefinition,
  type DefaultChoices,
  type DivineOrderDefinition,
  type DivineOrderId,
  type SkillId,
  type SpellcastingDefinition,
} from "./class-5e.js";

/** The skills a Cleric chooses its proficiencies from. */
export const CLERIC_SKILLS: readonly SkillId[] = [
  "history",
  "insight",
  "medicine",
  "persuasion",
  "religion",
];

/**
 * The order a fresh creation fills the abilities, highest roll first:
 * Wisdom for its spells, Constitution for hit points and concentration,
 * Strength for its mace or club, Dexterity for AC in light armour, then
 * Charisma and Intelligence. `docs/character-rules.md` records it.
 */
export const CLERIC_ABILITY_PRIORITY = [
  "wisdom",
  "constitution",
  "strength",
  "dexterity",
  "charisma",
  "intelligence",
] as const satisfies readonly Ability[];

/**
 * The Cleric's spellcasting (SRD 5.2): Wisdom; cantrips known and spells
 * prepared by level; the full-caster slots; and the owner's curated list
 * (D3).
 */
export const CLERIC_SPELLCASTING: SpellcastingDefinition = {
  ability: "wisdom",
  cantrips: { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4 },
  prepared: { 1: 4, 2: 5, 3: 6, 4: 7, 5: 9 },
  slots: { 1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2] },
  list: [
    "sacred-flame",
    "guidance",
    "resistance",
    "thaumaturgy",
    "bless",
    "cure-wounds",
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
    "shield-of-faith",
  ],
};

/** The Divine Orders (SRD 5.2), chosen at creation. */
export const DIVINE_ORDERS: Readonly<
  Record<DivineOrderId, DivineOrderDefinition>
> = {
  protector: {
    name: "Protector",
    text: "Trained for battle, you gain training with heavy armour and martial weapons.",
    armourTraining: ["heavy"],
    weaponProficiencies: ["martial"],
  },
  thaumaturge: {
    name: "Thaumaturge",
    text: "You know one extra cantrip, and you add your Wisdom modifier (at least +1) to your Intelligence (Arcana) and Intelligence (Religion) checks.",
    extraCantrips: 1,
    checkBonus: {
      ability: "wisdom",
      minimum: 1,
      skills: ["arcana", "religion"],
    },
  },
};

/**
 * The choices other than placement that a fresh creation starts with: +2
 * Wisdom and +1 Constitution; Insight and Persuasion; the Protector order;
 * Sacred Flame, Guidance and Resistance, with Bless, Cure Wounds, Guiding
 * Bolt and Healing Word prepared; the mace kit; no weapon mastery. The
 * creation page and the balance harness both start from these.
 */
export const CLERIC_DEFAULT_CHOICES = {
  increase: { wisdom: 2, constitution: 1 },
  skills: ["insight", "persuasion"],
  divineOrder: "protector",
  spells: {
    cantrips: ["sacred-flame", "guidance", "resistance"],
    prepared: ["bless", "cure-wounds", "guiding-bolt", "healing-word"],
  },
  kit: "mace-and-daggers",
  masteries: [],
} as const satisfies DefaultChoices;

export const CLERIC: ClassDefinition = {
  id: "cleric",
  name: "Cleric",
  hitDie: 8,
  primaryAbilities: ["wisdom"],
  abilityPriority: CLERIC_ABILITY_PRIORITY,
  savingThrows: ["wisdom", "charisma"],
  skillChoices: { options: CLERIC_SKILLS, count: 2 },
  armourTraining: ["light", "medium", "shield"],
  weaponProficiencies: ["simple"],
  toolProficiencies: [],
  weaponMasteries: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  features: [
    {
      id: "spellcasting",
      level: 1,
      name: "Spellcasting",
      text: "You cast the cantrips you know at will and your prepared spells with spell slots, one slot a turn, using Wisdom. A long rest restores every spent slot. You change your prepared spells only between adventures, in the library.",
    },
    {
      id: "divine-order",
      level: 1,
      name: ({ divineOrder }) =>
        `Divine Order: ${DIVINE_ORDERS[divineOrder!].name}`,
      text: ({ divineOrder }) => DIVINE_ORDERS[divineOrder!].text,
    },
  ],
  subclasses: [],
  defaults: CLERIC_DEFAULT_CHOICES,
  kits: ["mace-and-daggers", "club-and-shield"],
  spellcasting: CLERIC_SPELLCASTING,
  divineOrders: DIVINE_ORDERS,
  maxLevel: 1,
};
