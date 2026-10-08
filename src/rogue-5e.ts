/**
 * The SRD 5.2 Rogue at levels 1–3, as class data (#306, #307). The character
 * module (`character-5e.ts`) derives a Rogue's hit points, saves, skills,
 * Expertise, masteries, Sneak Attack, bonus actions and attacks from this
 * definition alone. Level 2 brings Cunning Action (Hide only), level 3 Steady
 * Aim and the Thief subclass. Its level 4–5 features come later (#308): until
 * then a Rogue that reaches a higher level gains its hit points, proficiency
 * bonus and Sneak Attack dice, and nothing else. `docs/character-rules.md`
 * records the numbers and the abstractions.
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
    {
      // Dash and Disengage need positions: only Hide is offered (#307).
      id: "cunning-action",
      level: 2,
      name: "Cunning Action",
      text: "Bonus action: Hide. The engine rolls your Stealth against the best passive Perception among your opponents; on a success your next attack roll has advantage, which sets up Sneak Attack. Hiding lasts until you attack; it doesn't stop your foes attacking you. Dash and Disengage need positions, so they are not offered.",
      effect: { kind: "cunning-action" },
    },
    {
      // With no positions the character never moves, so the "haven't moved
      // this turn" condition always holds (owner decision, #307).
      id: "steady-aim",
      level: 3,
      name: "Steady Aim",
      text: "Bonus action, while you still have an attack to make this turn: advantage on your next attack roll this turn. There are no positions, so you have always not moved and can use it every turn.",
      effect: { kind: "steady-aim" },
    },
  ],
  subclasses: [
    {
      id: "thief",
      name: "Thief",
      features: [
        {
          // Sleight of Hand checks and thieves' tools are used outside
          // fights, where nothing is timed by actions (#307).
          id: "fast-hands",
          level: 3,
          name: "Fast Hands",
          text: "Your bonus action can use an object: in a fight, once you have drawn, stowed or swapped a weapon this turn, you can do it again with your bonus action. Sleight of Hand checks and thieves' tools are used outside fights, where they take no action.",
          effect: { kind: "fast-hands" },
        },
        {
          // Its climb speed and jump distance need positions: a module marks
          // the checks that climb or jump instead (#307).
          id: "second-story-work",
          level: 3,
          name: "Second-Story Work",
          text: "On a check the adventure marks as climbing or jumping, you use Dexterity in place of Strength.",
          effect: { kind: "second-story-work" },
        },
      ],
    },
  ],
  defaults: ROGUE_DEFAULT_CHOICES,
  kits: ["shortsword-and-dagger", "shortsword"],
};
