/**
 * The SRD 5.2 Cleric at levels 1–5, as class data (#339, #341, #342). The
 * character module (`character-5e.ts`) derives a Cleric's hit points,
 * saves, skills, training, spellcasting, Divine Order, Channel Divinity,
 * Ability Score Improvement, Sear Undead and Life Domain from this
 * definition alone. `docs/character-rules.md` records the numbers and the
 * abstractions.
 */
import {
  abilityScoreImprovementText,
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
    // 3rd level (#342, owner-approved), with Light, a flavour cantrip.
    "mass-healing-word",
    "spirit-guardians",
    "beacon-of-hope",
    "bestow-curse",
    "protection-from-energy",
    "light",
  ],
};

/**
 * The Life Domain (SRD 5.2), the Cleric's subclass at level 3 (#341): its
 * always-prepared spells, Disciple of Life and Preserve Life; at level 5
 * (#342), Mass Healing Word always prepared too. Revivify, its other
 * level-5 spell, is omitted: without companions there is no one to revive.
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
    {
      // Revivify needs a creature that died within the minute, and the
      // character has no companions (#342).
      id: "life-domain-spells-5",
      level: 5,
      name: "Life Domain Spells: Mass Healing Word",
      text: "Mass Healing Word is always prepared too, and doesn't count against the spells you prepare. Revivify, the domain's other level-5 spell, is omitted: without companions there is no one to revive.",
      effect: { kind: "always-prepared", spells: ["mass-healing-word"] },
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
    {
      // The Cleric's level 4 brings no weapon mastery: the choice is the
      // improvement alone (#342).
      id: "ability-score-improvement",
      level: 4,
      name: "Ability Score Improvement",
      text: ({ abilityScoreImprovements: [chosen] }) =>
        abilityScoreImprovementText(chosen),
      effect: { kind: "ability-score-improvement" },
    },
    {
      id: "sear-undead",
      level: 5,
      name: "Sear Undead",
      text: ({ modifiers }) =>
        `When you use Turn Undead, roll ${Math.max(1, modifiers.wisdom)}d8 (your Wisdom modifier, at least one) once; each undead that fails its save takes that much radiant damage. The damage doesn't end its turning.`,
      effect: { kind: "sear-undead", sides: 8 },
    },
  ],
  subclasses: [LIFE_DOMAIN],
  defaults: CLERIC_DEFAULT_CHOICES,
  kits: ["mace-and-daggers", "club-and-shield"],
  spellcasting: CLERIC_SPELLCASTING,
  divineOrders: DIVINE_ORDERS,
};
