/**
 * Ability checks and saving throws (SRD 5.2) for a 5e character.
 *
 * Pure rules: one d20 (two with advantage) from the `RandomSource` passed in,
 * plus the ability modifier, plus the proficiency bonus when the character is
 * proficient in the skill or the save, twice over with Expertise in the skill
 * (#306). A check or save succeeds when its total
 * meets the DC; a natural 20 or 1 has no special effect. A class feature may
 * give advantage on a skill's checks (the Champion's Remarkable Athlete on
 * Athletics, #300), and a module's
 * circumstances (#284) may give advantage or disadvantage on any check: the
 * caller names them, and they combine as SRD 5.2 says (any advantage and any
 * disadvantage cancel). Body armour worn without training gives disadvantage
 * on Strength and Dexterity checks and saves (SRD 5.2, `abilityDisadvantages`).
 * A module may mark a Strength check as climbing or jumping (#307): a
 * character with Second-Story Work (the Thief) makes it with Dexterity.
 *
 * An authored check grades its outcome into bands (#281): failure by 5 or
 * more, failure, success, and success by 5 or more.
 */
import { rollD20, type RollMode } from "./encounter-5e.js";
import {
  abilityDisadvantages,
  characterProfile,
  checkAdvantages,
  hasExpertise,
  skillProficiency,
  type CharacterSheet,
} from "./character-5e.js";
import { SKILLS, titleCase, type Ability, type SkillId } from "./class-5e.js";
import type { RandomSource } from "./random.js";

/**
 * An authored check: a skill's, or a plain ability's, against a DC. A
 * Strength check may be marked as climbing or jumping (#307).
 */
export type CheckSpec = Readonly<
  (
    | { skill: SkillId; ability?: never; dc: number }
    | { ability: Ability; skill?: never; dc: number }
  ) & { movement?: Movement }
>;

/** What a Strength check marked for Second-Story Work does (#307). */
export const MOVEMENTS = ["climb", "jump"] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** The feature that lets a marked climb or jump use Dexterity (#307). */
export const SECOND_STORY_WORK = "Second-Story Work";

/** The ability a check uses before any feature changes it. */
export const specAbility = (spec: CheckSpec): Ability =>
  spec.skill === undefined ? spec.ability : SKILLS[spec.skill].ability;

/** One check or saving throw as rolled. */
export type CheckRoll = Readonly<{
  kind: "check" | "save";
  ability: Ability;
  skill?: SkillId;
  /** Such as "Athletics check" or "Dexterity saving throw". */
  label: string;
  /** The d20 kept. */
  d20: number;
  /** Present when advantage or disadvantage applied. */
  mode?: RollMode;
  modifier: number;
  /** The proficiency bonus added, or 0. */
  proficiency: number;
  /** Expertise doubled `proficiency` (#306). */
  expertise?: true;
  /**
   * The feature that made it with another ability: Second-Story Work, for a
   * marked climb or jump with Dexterity in place of Strength (#307).
   */
  substitute?: typeof SECOND_STORY_WORK;
  total: number;
  dc: number;
  success: boolean;
}>;

/** A check's outcome bands, worst first (#281). */
export const BANDS = [
  "failure-by-5",
  "failure",
  "success",
  "success-by-5",
] as const;
export type Band = (typeof BANDS)[number];

/** Each band as a card and the AI DM name it. */
export const BAND_NAMES: Readonly<Record<Band, string>> = {
  "failure-by-5": "Failure by 5 or more",
  failure: "Failure",
  success: "Success",
  "success-by-5": "Success by 5 or more",
};

/** Whether a band is a success. */
export const isSuccess = (band: Band): boolean =>
  band === "success" || band === "success-by-5";

/**
 * The band a total falls in against its DC: failure by 5 or more at DC − 5
 * or less, success by 5 or more at DC + 5 or more.
 */
export function bandOf(roll: Pick<CheckRoll, "total" | "dc">): Band {
  if (roll.total >= roll.dc) {
    return roll.total >= roll.dc + 5 ? "success-by-5" : "success";
  }
  return roll.total <= roll.dc - 5 ? "failure-by-5" : "failure";
}

function rolled(
  kind: CheckRoll["kind"],
  ability: Ability,
  skill: SkillId | undefined,
  label: string,
  modifier: number,
  proficiency: number,
  dc: number,
  advantage: readonly string[],
  random: Pick<RandomSource, "roll">,
  disadvantage: readonly string[] = [],
): CheckRoll {
  const { d20, mode } = rollD20(random, advantage, disadvantage);
  const total = d20 + modifier + proficiency;
  return {
    kind,
    ability,
    ...(skill === undefined ? {} : { skill }),
    label,
    d20,
    ...(mode === undefined ? {} : { mode }),
    modifier,
    proficiency,
    total,
    dc,
    success: total >= dc,
  };
}

/** How an approach is named in an action (#283): its skill's or ability's id. */
export const approachId = (spec: CheckSpec): string =>
  spec.skill ?? spec.ability;

/** How an approach is shown: "Athletics", or "Strength" for a plain ability. */
export const approachName = (spec: CheckSpec): string =>
  spec.skill === undefined ? titleCase(spec.ability) : SKILLS[spec.skill].name;

/** Named sources of advantage and disadvantage on one roll (#284). */
export type Circumstances = Readonly<{
  advantage: readonly string[];
  disadvantage: readonly string[];
}>;

const NO_CIRCUMSTANCES: Circumstances = { advantage: [], disadvantage: [] };

/**
 * Rolls an ability check, with the skill's proficiency where the sheet has
 * it (doubled with Expertise, #306), and the advantage and disadvantage `circumstances` name (#284) beside
 * any its class's features and its armour give.
 */
export function abilityCheck(
  sheet: CharacterSheet,
  spec: CheckSpec,
  random: Pick<RandomSource, "roll">,
  circumstances: Circumstances = NO_CIRCUMSTANCES,
): CheckRoll {
  const profile = characterProfile(sheet);
  // Second-Story Work: a marked climb or jump with Dexterity (#307).
  const substitute =
    spec.movement !== undefined &&
    profile.secondStoryWork === true &&
    specAbility(spec) === "strength";
  const ability = substitute ? "dexterity" : specAbility(spec);
  const using = substitute ? ` (Dexterity, ${SECOND_STORY_WORK})` : "";
  const made = (roll: CheckRoll): CheckRoll =>
    substitute ? { ...roll, substitute: SECOND_STORY_WORK } : roll;
  if (spec.skill === undefined) {
    return made(
      rolled(
        "check",
        ability,
        undefined,
        `${titleCase(spec.ability)} check${using}`,
        profile.modifiers[ability],
        0,
        spec.dc,
        circumstances.advantage,
        random,
        [
          ...abilityDisadvantages(sheet, ability),
          ...circumstances.disadvantage,
        ],
      ),
    );
  }
  const roll = made(
    rolled(
      "check",
      ability,
      spec.skill,
      `${SKILLS[spec.skill].name} check${using}`,
      profile.modifiers[ability],
      skillProficiency(sheet, spec.skill),
      spec.dc,
      [...checkAdvantages(sheet, spec.skill), ...circumstances.advantage],
      random,
      [...abilityDisadvantages(sheet, ability), ...circumstances.disadvantage],
    ),
  );
  return hasExpertise(sheet, spec.skill) ? { ...roll, expertise: true } : roll;
}

/**
 * Rolls a saving throw, with proficiency in the class's saves and
 * disadvantage from untrained armour on Strength and Dexterity.
 */
export function savingThrow(
  sheet: CharacterSheet,
  ability: Ability,
  dc: number,
  random: Pick<RandomSource, "roll">,
): CheckRoll {
  const profile = characterProfile(sheet);
  const save = profile.savingThrows[ability];
  return rolled(
    "save",
    ability,
    undefined,
    `${titleCase(ability)} saving throw`,
    profile.modifiers[ability],
    save.proficient ? profile.proficiencyBonus : 0,
    dc,
    [],
    random,
    abilityDisadvantages(sheet, ability),
  );
}

/**
 * A character's passive Perception (#303): 10 + its Wisdom modifier, + its
 * proficiency bonus if it is proficient in Perception (twice with Expertise,
 * #306), + 5 with advantage
 * on Perception checks and − 5 with disadvantage (SRD 5.2). Advantage comes
 * from its class's features or the `circumstances` the caller names,
 * disadvantage from the circumstances; any of each cancel, as on a roll.
 */
export type PassivePerception = Readonly<{
  total: number;
  wisdom: number;
  /** The proficiency bonus added, or 0; doubled with Expertise. */
  proficiency: number;
  /** Expertise in Perception doubled `proficiency` (#306). */
  expertise?: true;
  /** +5 for advantage, −5 for disadvantage, or 0. */
  adjustment: number;
  /** What gives the advantage or disadvantage applied, by name; none when they cancel. */
  sources: readonly string[];
}>;

export function passivePerception(
  sheet: CharacterSheet,
  circumstances: Circumstances = NO_CIRCUMSTANCES,
): PassivePerception {
  const profile = characterProfile(sheet);
  const wisdom = profile.modifiers.wisdom;
  const proficiency = skillProficiency(sheet, "perception");
  const advantage = [
    ...checkAdvantages(sheet, "perception"),
    ...circumstances.advantage,
  ];
  const { disadvantage } = circumstances;
  const [adjustment, sources] =
    advantage.length > 0 === disadvantage.length > 0
      ? [0, []]
      : advantage.length > 0
        ? [5, advantage]
        : [-5, disadvantage];
  return {
    total: 10 + wisdom + proficiency + adjustment,
    wisdom,
    proficiency,
    ...(hasExpertise(sheet, "perception") ? { expertise: true as const } : {}),
    adjustment,
    sources,
  };
}

/**
 * A monster's skill check (#303): d20 + its bonus for the skill, which
 * already counts any proficiency, against `dc`.
 */
export function creatureCheck(
  skill: SkillId,
  bonus: number,
  dc: number,
  random: Pick<RandomSource, "roll">,
): CheckRoll {
  const { name, ability } = SKILLS[skill];
  return rolled(
    "check",
    ability,
    skill,
    `${name} check`,
    bonus,
    0,
    dc,
    [],
    random,
  );
}
