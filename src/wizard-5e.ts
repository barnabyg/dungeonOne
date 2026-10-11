/**
 * The SRD 5.2 Wizard at levels 1–5, as class data (#340, #343, #344). The
 * character module (`character-5e.ts`) derives a Wizard's hit points,
 * saves, skills, spellcasting, spellbook, Arcane Recovery, Scholar, the
 * Evoker, its Ability Score Improvement and Memorize Spell from this
 * definition alone. `docs/character-rules.md` records the numbers and the
 * abstractions.
 */
import {
  abilityScoreImprovementText,
  SKILLS,
  type Ability,
  type ClassDefinition,
  type DefaultChoices,
  type SkillId,
  type SpellcastingDefinition,
  type SubclassDefinition,
} from "./class-5e.js";

/** The skills a Wizard chooses its proficiencies from (SRD 5.2). */
export const WIZARD_SKILLS: readonly SkillId[] = [
  "arcana",
  "history",
  "insight",
  "investigation",
  "medicine",
  "nature",
  "religion",
];

/** The skills Scholar may give Expertise in (SRD 5.2, #343). */
export const SCHOLAR_SKILLS: readonly SkillId[] = [
  "arcana",
  "history",
  "investigation",
  "medicine",
  "nature",
  "religion",
];

/**
 * The order a fresh creation fills the abilities, highest roll first:
 * Intelligence for its spells, Dexterity for AC (with Mage Armor) and its
 * daggers, Constitution for hit points and concentration, then Wisdom,
 * Charisma and Strength. `docs/character-rules.md` records it.
 */
export const WIZARD_ABILITY_PRIORITY = [
  "intelligence",
  "dexterity",
  "constitution",
  "wisdom",
  "charisma",
  "strength",
] as const satisfies readonly Ability[];

/**
 * The Wizard's spellcasting (SRD 5.2): Intelligence; cantrips known and
 * spells prepared by level; the full-caster slots; six 1st-level spells in
 * its spellbook at creation and two more at each level after; and the
 * owner's curated list (D3).
 */
export const WIZARD_SPELLCASTING: SpellcastingDefinition = {
  ability: "intelligence",
  cantrips: { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4 },
  prepared: { 1: 4, 2: 5, 3: 6, 4: 7, 5: 9 },
  slots: { 1: [2], 2: [3], 3: [4, 2], 4: [4, 3], 5: [4, 3, 2] },
  list: [
    "fire-bolt",
    "ray-of-frost",
    "shocking-grasp",
    "chill-touch",
    "magic-missile",
    "shield",
    "mage-armor",
    // Sleep left the list in #348 ("too easy by control"; #369 brings it
    // back).
    "burning-hands",
    "chromatic-orb",
    "thunderwave",
    // Two more 1st-level spells (#343, owner-approved), so level 2 has two
    // to write into the spellbook.
    "ray-of-sickness",
    "ice-knife",
    // 2nd level (#343, owner-approved).
    "scorching-ray",
    "shatter",
    // Hold Person left the list in #348, as Sleep did.
    "acid-arrow",
    "mind-spike",
    "blur",
    "mirror-image",
    // 3rd level (#344, owner-approved).
    "fireball",
    "lightning-bolt",
    "bestow-curse",
    "protection-from-energy",
    "vampiric-touch",
    "haste",
    "slow",
  ],
  spellbook: 6,
  spellbookPerLevel: 2,
};

/**
 * The Evoker (SRD 5.2), the Wizard's subclass at level 3 (#343):
 * Evocation Savant is flavour only (owner's choice), and Potent Cantrip
 * halves a damaging cantrip's miss or saved damage.
 */
export const EVOKER: SubclassDefinition = {
  id: "evoker",
  name: "Evoker",
  features: [
    {
      id: "evocation-savant",
      level: 3,
      name: "Evocation Savant",
      text: "Flavour only: you have made evocation your study. The free Evocation spells it would write into your spellbook are omitted.",
    },
    {
      id: "potent-cantrip",
      level: 3,
      name: "Potent Cantrip",
      text: "When a damaging cantrip of yours misses with its attack roll, or its target succeeds on its saving throw, the target still takes half the cantrip's damage, rounded down, and nothing else.",
      effect: { kind: "potent-cantrip" },
    },
  ],
};

/**
 * The choices other than placement that a fresh creation starts with: +2
 * Intelligence and +1 Constitution; Arcana and Investigation; Fire Bolt,
 * Ray of Frost and Shocking Grasp; six of the 1st-level spells in the
 * spellbook, with Mage Armor, Magic Missile, Shield and Burning Hands
 * prepared (Sleep until #348); the quarterstaff kit; no weapon mastery.
 * The creation page and the balance harness both start from these.
 */
export const WIZARD_DEFAULT_CHOICES = {
  increase: { intelligence: 2, constitution: 1 },
  skills: ["arcana", "investigation"],
  spellbook: [
    "magic-missile",
    "shield",
    "mage-armor",
    "burning-hands",
    "chromatic-orb",
    "thunderwave",
  ],
  spells: {
    cantrips: ["fire-bolt", "ray-of-frost", "shocking-grasp"],
    prepared: ["mage-armor", "magic-missile", "shield", "burning-hands"],
  },
  kit: "quarterstaff-and-dagger",
  masteries: [],
} as const satisfies DefaultChoices;

export const WIZARD: ClassDefinition = {
  id: "wizard",
  name: "Wizard",
  hitDie: 6,
  primaryAbilities: ["intelligence"],
  abilityPriority: WIZARD_ABILITY_PRIORITY,
  savingThrows: ["intelligence", "wisdom"],
  skillChoices: { options: WIZARD_SKILLS, count: 2 },
  armourTraining: [],
  weaponProficiencies: ["simple"],
  toolProficiencies: [],
  weaponMasteries: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  features: [
    {
      id: "spellcasting",
      level: 1,
      name: "Spellcasting",
      text: "You cast the cantrips you know at will and your prepared spells with spell slots, one slot a turn, using Intelligence. Your spellbook holds the six 1st-level spells you chose at creation, and two more Wizard spells you write in at each level after 1st, of a level you have slots for; you prepare spells only from it. A long rest restores every spent slot. You change your prepared spells only between adventures, in the library.",
    },
    {
      id: "ritual-adept",
      level: 1,
      name: "Ritual Adept",
      text: "Omitted: casting a spell as a ritual takes ten minutes more, and with no clock there is no time for it.",
    },
    {
      id: "arcane-recovery",
      level: 1,
      name: "Arcane Recovery",
      text: "Once per long rest, a short rest also regains spent spell slots totalling up to half your Wizard level, rounded up (none of 6th level or higher). It happens by itself on the first short rest that has a slot to regain.",
      uses: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
      recovery: { shortRest: 0, longRest: "all" },
      effect: { kind: "arcane-recovery" },
    },
    {
      id: "scholar",
      level: 2,
      name: "Scholar",
      text: ({ expertise: [chosen] }) =>
        chosen === undefined
          ? "Not chosen yet: Expertise in one skill you are proficient in among Arcana, History, Investigation, Medicine, Nature and Religion, doubling your proficiency bonus with it. Choose it on the sheet before the next adventure."
          : `Expertise in ${SKILLS[chosen].name}: your proficiency bonus is doubled for checks with it.`,
      effect: { kind: "expertise", count: 1, skills: SCHOLAR_SKILLS },
    },
    {
      // The Wizard's level 4 brings no weapon mastery: the choice is the
      // improvement alone (#344).
      id: "ability-score-improvement",
      level: 4,
      name: "Ability Score Improvement",
      text: ({ abilityScoreImprovements: [chosen] }) =>
        abilityScoreImprovementText(chosen),
      effect: { kind: "ability-score-improvement" },
    },
    {
      id: "memorize-spell",
      level: 5,
      name: "Memorize Spell",
      text: "When you finish a short rest, you may swap one of your prepared 1st-level or higher spells for another in your spellbook. The swap lasts until the adventure ends; your prepared spells in the library are unchanged (D8).",
      effect: { kind: "memorize-spell" },
    },
  ],
  subclasses: [EVOKER],
  defaults: WIZARD_DEFAULT_CHOICES,
  kits: ["quarterstaff-and-dagger", "daggers"],
  spellcasting: WIZARD_SPELLCASTING,
};
