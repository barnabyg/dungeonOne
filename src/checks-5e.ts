/**
 * Ability checks and saving throws (SRD 5.2) for the 5e Fighter.
 *
 * Pure rules: one d20 (two with advantage) from the `RandomSource` passed in,
 * plus the ability modifier, plus the proficiency bonus when the character is
 * proficient in the skill or the save. A check or save succeeds when its total
 * meets the DC; a natural 20 or 1 has no special effect. The only source of
 * advantage so far is the Champion's Remarkable Athlete, on Athletics checks.
 *
 * An authored check grades its outcome into bands (#281): failure by 5 or
 * more, failure, success, and success by 5 or more.
 */
import { rollD20, type RollMode } from "./encounter-5e.js";
import {
  FIGHTER_SKILLS,
  fighterProfile,
  type Ability,
  type FighterSheet,
  type FighterSkill,
} from "./fighter-5e.js";
import type { RandomSource } from "./random.js";

/** An authored check: a skill's, or a plain ability's, against a DC. */
export type CheckSpec = Readonly<
  | { skill: FighterSkill; ability?: never; dc: number }
  | { ability: Ability; skill?: never; dc: number }
>;

/** One check or saving throw as rolled. */
export type CheckRoll = Readonly<{
  kind: "check" | "save";
  ability: Ability;
  skill?: FighterSkill;
  /** Such as "Athletics check" or "Dexterity saving throw". */
  label: string;
  /** The d20 kept. */
  d20: number;
  /** Present when advantage or disadvantage applied. */
  mode?: RollMode;
  modifier: number;
  /** The proficiency bonus added, or 0. */
  proficiency: number;
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

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

function rolled(
  kind: CheckRoll["kind"],
  ability: Ability,
  skill: FighterSkill | undefined,
  label: string,
  modifier: number,
  proficiency: number,
  dc: number,
  advantage: readonly string[],
  random: Pick<RandomSource, "roll">,
): CheckRoll {
  const { d20, mode } = rollD20(random, advantage, []);
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
  spec.skill === undefined
    ? titleCase(spec.ability)
    : FIGHTER_SKILLS[spec.skill].name;

/** Rolls an ability check, with the skill's proficiency where the sheet has it. */
export function abilityCheck(
  sheet: FighterSheet,
  spec: CheckSpec,
  random: Pick<RandomSource, "roll">,
): CheckRoll {
  const profile = fighterProfile(sheet);
  if (spec.skill === undefined) {
    return rolled(
      "check",
      spec.ability,
      undefined,
      `${titleCase(spec.ability)} check`,
      profile.modifiers[spec.ability],
      0,
      spec.dc,
      [],
      random,
    );
  }
  const { name, ability } = FIGHTER_SKILLS[spec.skill];
  const proficient = sheet.skills.includes(spec.skill);
  return rolled(
    "check",
    ability,
    spec.skill,
    `${name} check`,
    profile.modifiers[ability],
    proficient ? profile.proficiencyBonus : 0,
    spec.dc,
    spec.skill === "athletics" &&
      profile.features.some(({ id }) => id === "remarkable-athlete")
      ? ["Remarkable Athlete"]
      : [],
    random,
  );
}

/** Rolls a saving throw, with proficiency in the Fighter's saves. */
export function savingThrow(
  sheet: FighterSheet,
  ability: Ability,
  dc: number,
  random: Pick<RandomSource, "roll">,
): CheckRoll {
  const profile = fighterProfile(sheet);
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
  );
}
