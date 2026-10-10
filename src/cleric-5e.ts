/**
 * The SRD 5.2 Cleric at levels 1–3, as class data (#339, #341). The
 * character module (`character-5e.ts`) derives a Cleric's hit points,
 * saves, skills, training, spellcasting, Divine Order, Channel Divinity and
 * Life Domain from this definition alone. Its spell tables follow SRD 5.2
 * at every level, but a Cleric stays at level 3 (`maxLevel`) until its
 * level 4–5 features come (#342); XP above level 3's is kept.
 * `docs/character-rules.md` records the numbers and the abstractions.
 */
import {
  type Ability,
  type ClassDefinition,
  type DefaultChoices,
  type DivineOrderDefinition,
  type DivineOrderId,
  type SkillId,
  type SpellcastingDefinition,
  type SubclassDefinition,
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
    // 2nd level (#341, owner-approved).
    "aid",
    "lesser-restoration",
    "spiritual-weapon",
    "hold-person",
    "protection-from-poison",
    "prayer-of-healing",
  ],
};

/**
 * The Life Domain (SRD 5.2), the Cleric's subclass at level 3 (#341): its
 * always-prepared spells, Disciple of Life and Preserve Life. Its later
 * spells and features wait for their levels (#342).
 */
export const LIFE_DOMAIN: SubclassDefinition = {
  id: "life-domain",
  name: "Life Domain",
  features: [
    {
      id: "life-domain-spells",
      level: 3,
      name: "Life Domain Spells",
      text: "Aid, Bless, Cure Wounds and Lesser Restoration are always prepared, and don't count against the spells you prepare.",
      effect: {
        kind: "always-prepared",
        spells: ["aid", "bless", "cure-wounds", "lesser-restoration"],
      },
    },
    {
      id: "disciple-of-life",
      level: 3,
      name: "Disciple of Life",
      text: "When a spell you cast with a spell slot restores hit points, the creature regains 2 + the slot's level more.",
      effect: { kind: "disciple-of-life" },
    },
    {
      id: "preserve-life",
      level: 3,
      name: "Preserve Life",
      text: ({ level }) =>
        `As a Magic action, spend a use of Channel Divinity to restore up to ${5 * level} hit points (five times your Cleric level) to yourself while you are Bloodied, at half your hit points or fewer; it can't take you above half. Without companions it heals only you.`,
      effect: { kind: "preserve-life", perLevel: 5 },
    },
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
    {
      id: "channel-divinity",
      level: 2,
      name: "Channel Divinity",
      text: ({ uses, modifiers }) =>
        `${uses} uses; a short rest restores one, a long rest all. Each is a Magic action against your spell save DC. Divine Spark: roll 1d8 ${modifiers.wisdom >= 0 ? "+" : "−"} ${Math.abs(modifiers.wisdom)} (Wisdom) and heal another creature on your side by the total, or make an opponent save on Constitution or take that much radiant or necrotic damage, half on a success. Turn Undead: each undead opponent saves on Wisdom or is Frightened and Incapacitated for the fight's minute; damage, an attack on it, or your being Incapacitated ends it. Every undead foe is within range: there are no positions.`,
      uses: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
      recovery: { shortRest: 1, longRest: "all" },
      effect: {
        kind: "channel-divinity",
        divineSpark: { dice: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, sides: 8 },
      },
    },
  ],
  subclasses: [LIFE_DOMAIN],
  defaults: CLERIC_DEFAULT_CHOICES,
  kits: ["mace-and-daggers", "club-and-shield"],
  spellcasting: CLERIC_SPELLCASTING,
  divineOrders: DIVINE_ORDERS,
  maxLevel: 3,
};
