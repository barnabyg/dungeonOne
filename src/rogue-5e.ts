/**
 * The SRD 5.2 Rogue at level 1, as class data (#306). The character module
 * (`character-5e.ts`) derives a Rogue's hit points, saves, skills,
 * Expertise, masteries, Sneak Attack and attacks from this definition alone.
 * Its level 2–5 features come later (#307, #308): until then a Rogue that
 * reaches a higher level gains its hit points, proficiency bonus and Sneak
 * Attack dice, and nothing else. `docs/character-rules.md` records the
 * numbers.
 */
import {
  WEAPON_MASTERY_FEATURE,
  SKILLS,
  type Ability,
  type ClassDefinition,
  type DefaultChoices,
  type LevelTable,
  type SkillId,
} from "./class-5e.js";

/** The skills a Rogue chooses its proficiencies from. */
export const ROGUE_SKILLS: readonly SkillId[] = [
  "acrobatics",
  "athletics",
  "deception",
  "insight",
  "intimidation",
  "investigation",
  "perception",
  "persuasion",
  "sleight-of-hand",
  "stealth",
];

/**
 * The order a fresh creation fills the abilities, highest roll first:
 * Dexterity for its Finesse attacks, AC, initiative and Stealth,
 * Constitution for hit points, Wisdom for Perception, Charisma for reaction
 * rolls and talking, then Intelligence and Strength.
 * `docs/character-rules.md` records it.
 */
export const ROGUE_ABILITY_PRIORITY = [
  "dexterity",
  "constitution",
  "wisdom",
  "charisma",
  "intelligence",
  "strength",
] as const satisfies readonly Ability[];

/**
 * The choices other than placement that a fresh creation starts with: +2
 * Dexterity and +1 Constitution; Athletics, Perception, Persuasion and
 * Stealth, with Expertise in Perception and Stealth; the shortsword and
 * dagger kit; and mastery of the shortsword (Vex, whose advantage sets up
 * Sneak Attack) and the dagger (Nick). The creation page and the balance
 * harness both start from these.
 */
export const ROGUE_DEFAULT_CHOICES = {
  increase: { dexterity: 2, constitution: 1 },
  skills: ["athletics", "perception", "persuasion", "stealth"],
  expertise: ["perception", "stealth"],
  kit: "shortsword-and-dagger",
  masteries: ["shortsword", "dagger"],
} as const satisfies DefaultChoices;

/** Sneak Attack's d6s by level (SRD 5.2). */
const SNEAK_ATTACK_DICE: LevelTable = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };

/** "Perception and Stealth": the skills chosen for Expertise. */
const skillNames = (skills: readonly SkillId[]) =>
  skills.map((id) => SKILLS[id].name).join(" and ");

export const ROGUE: ClassDefinition = {
  id: "rogue",
  name: "Rogue",
  hitDie: 8,
  primaryAbilities: ["dexterity"],
  abilityPriority: ROGUE_ABILITY_PRIORITY,
  savingThrows: ["dexterity", "intelligence"],
  skillChoices: { options: ROGUE_SKILLS, count: 4 },
  armourTraining: ["light"],
  weaponProficiencies: [
    "simple",
    { category: "martial", properties: ["finesse", "light"] },
  ],
  toolProficiencies: ["thieves-tools"],
  weaponMasteries: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
  features: [
    {
      id: "expertise",
      level: 1,
      name: ({ expertise }) => `Expertise: ${skillNames(expertise)}`,
      text: ({ expertise }) =>
        `Your proficiency bonus is doubled for ability checks with ${skillNames(expertise)}.`,
      effect: { kind: "expertise", count: 2 },
    },
    {
      // The ally-adjacent clause is omitted until companions: there are no
      // positions, and no allies yet (#306).
      id: "sneak-attack",
      level: 1,
      name: "Sneak Attack",
      text: ({ level }) =>
        `Once per turn, when you hit with an attack roll that uses a Finesse or ranged weapon and you have advantage on the roll, you deal an extra ${SNEAK_ATTACK_DICE[level]}d6 damage of the weapon's type. The engine adds it; you never need to ask.`,
      effect: {
        kind: "sneak-attack",
        dice: SNEAK_ATTACK_DICE,
        sides: 6,
      },
    },
    {
      // Flavour only: it has no effect in play.
      id: "thieves-cant",
      level: 1,
      name: "Thieves' Cant",
      text: "You know Thieves' Cant, the secret mix of jargon, signs and symbols rogues use. It is flavour only and changes nothing in play.",
    },
    WEAPON_MASTERY_FEATURE,
  ],
  subclasses: [],
  defaults: ROGUE_DEFAULT_CHOICES,
  kits: ["shortsword-and-dagger", "shortsword"],
};
