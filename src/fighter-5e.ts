/**
 * The SRD 5.2 Fighter at levels 1–5, as class data (#300). The character
 * module (`character-5e.ts`) derives a Fighter's hit points, saves, skills,
 * masteries, features, uses, critical range and attacks from this
 * definition alone. `docs/character-rules.md` records the numbers.
 */
import {
  FEATURE_USES_RULE,
  FIGHTING_STYLES,
  abilityScoreImprovementText,
  WEAPON_MASTERY_FEATURE,
  type Ability,
  type ClassDefinition,
  type DefaultChoices,
  type SkillId,
} from "./class-5e.js";

/** The skills a Fighter chooses its proficiencies from. */
export const FIGHTER_SKILLS: readonly SkillId[] = [
  "acrobatics",
  "animal-handling",
  "athletics",
  "history",
  "insight",
  "intimidation",
  "perception",
  "persuasion",
  "survival",
];

/**
 * The order a fresh creation fills the abilities, highest roll first:
 * Strength for the weapon, Constitution for hit points, Dexterity for AC
 * (leather counts all of it) and initiative, Wisdom for Perception and
 * Wisdom saves, then Charisma and Intelligence. `docs/character-rules.md`
 * records it.
 */
export const FIGHTER_ABILITY_PRIORITY = [
  "strength",
  "constitution",
  "dexterity",
  "wisdom",
  "charisma",
  "intelligence",
] as const satisfies readonly Ability[];

/**
 * The choices other than placement that a fresh creation starts with: +2
 * Strength and +1 Constitution, Athletics and Perception, Defense, the mace
 * kit, and mastery of the dagger, mace and shortsword (every kit weapon whose
 * mastery is used). The creation page and the balance harness both start
 * from these.
 */
export const FIGHTER_DEFAULT_CHOICES = {
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
} as const satisfies DefaultChoices;

export const FIGHTER: ClassDefinition = {
  id: "fighter",
  name: "Fighter",
  hitDie: 10,
  primaryAbilities: ["strength", "dexterity"],
  abilityPriority: FIGHTER_ABILITY_PRIORITY,
  savingThrows: ["strength", "constitution"],
  skillChoices: { options: FIGHTER_SKILLS, count: 2 },
  armourTraining: ["light", "medium", "heavy", "shield"],
  weaponProficiencies: ["simple", "martial"],
  toolProficiencies: [],
  weaponMasteries: { 1: 3, 2: 3, 3: 3, 4: 4, 5: 4 },
  features: [
    {
      id: "fighting-style",
      level: 1,
      // A Fighter's sheet always has a Fighting Style, and its use with the
      // gear held.
      name: ({ fightingStyle }) =>
        `Fighting Style: ${FIGHTING_STYLES[fightingStyle!].name}`,
      text: ({ fightingStyle, fightingStyleUse }) =>
        `${FIGHTING_STYLES[fightingStyle!].text} ${fightingStyleUse!.note}`,
      effect: { kind: "fighting-style" },
    },
    {
      id: "second-wind",
      level: 1,
      name: "Second Wind",
      text: ({ level, uses }) =>
        `Bonus action: regain 1d10 + ${level} HP. ${uses} uses. ${FEATURE_USES_RULE}`,
      uses: { 1: 2, 2: 2, 3: 2, 4: 3, 5: 3 },
      recovery: "rest-between-adventures",
      effect: { kind: "second-wind", healing: { dice: 1, sides: 10 } },
    },
    WEAPON_MASTERY_FEATURE,
    {
      id: "action-surge",
      level: 2,
      name: "Action Surge",
      text: ({ uses }) =>
        `Take one additional action on your turn, except Magic. ${uses} use. ${FEATURE_USES_RULE}`,
      uses: { 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 },
      recovery: "rest-between-adventures",
      effect: { kind: "action-surge" },
    },
    {
      // Described only: the engine does not yet offer it on a failed check.
      id: "tactical-mind",
      level: 2,
      name: "Tactical Mind",
      text: "When you fail an ability check, spend a use of Second Wind to add 1d10 to it instead of healing; the use is kept if the check still fails.",
    },
    {
      id: "ability-score-improvement",
      level: 4,
      name: "Ability Score Improvement",
      text: ({ abilityScoreImprovements: [chosen] }) =>
        abilityScoreImprovementText(chosen, "a fourth weapon mastery"),
      effect: { kind: "ability-score-improvement" },
    },
    {
      // Tactical Shift is omitted: it moves the character, and there are no
      // positions (#287).
      id: "extra-attack",
      level: 5,
      name: "Extra Attack",
      text: "Attack twice, instead of once, whenever you take the Attack action. Each attack may be at a different opponent.",
      effect: { kind: "extra-attack", attacks: 2 },
    },
  ],
  subclasses: [
    {
      id: "champion",
      name: "Champion",
      features: [
        {
          id: "improved-critical",
          level: 3,
          name: "Improved Critical",
          text: "Your attack rolls score a critical hit on a roll of 19 or 20.",
          effect: { kind: "critical-range", range: 19 },
        },
        {
          // Its initiative advantage and its movement after a critical hit
          // are not applied.
          id: "remarkable-athlete",
          level: 3,
          name: "Remarkable Athlete",
          text: "Advantage on initiative rolls and Strength (Athletics) checks.",
          effect: { kind: "check-advantage", skills: ["athletics"] },
        },
      ],
    },
  ],
  defaults: FIGHTER_DEFAULT_CHOICES,
  kits: ["mace", "two-daggers", "club-and-dagger"],
};
