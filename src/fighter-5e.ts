/**
 * The 5e Fighter (SRD 5.2) at levels 1–3, created from 4d6-drop-lowest.
 *
 * Pure rules: dice come only from the `RandomSource` passed in, and every
 * derived number (HP, AC, attack, saves, skills, features) is computed from a
 * validated sheet. `docs/character-rules.md` records these numbers.
 */
import type { RandomSource } from "./random.js";

export const ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;
export type Ability = (typeof ABILITIES)[number];
export type Abilities = Readonly<Record<Ability, number>>;
/** Four d6 in the order rolled; the lowest one is dropped. */
export type AbilityRoll = readonly [number, number, number, number];
/** The six rolls of one creation, in the order rolled. */
export type RolledDice = readonly AbilityRoll[];
export type Level = 1 | 2 | 3;

export const FIGHTER_SKILLS = {
  acrobatics: { name: "Acrobatics", ability: "dexterity" },
  "animal-handling": { name: "Animal Handling", ability: "wisdom" },
  athletics: { name: "Athletics", ability: "strength" },
  history: { name: "History", ability: "intelligence" },
  insight: { name: "Insight", ability: "wisdom" },
  intimidation: { name: "Intimidation", ability: "charisma" },
  perception: { name: "Perception", ability: "wisdom" },
  persuasion: { name: "Persuasion", ability: "charisma" },
  survival: { name: "Survival", ability: "wisdom" },
} as const satisfies Record<string, { name: string; ability: Ability }>;
export type FighterSkill = keyof typeof FIGHTER_SKILLS;

/** SRD 5.2 Fighting Style feats, without Archery (ranged weapons are deferred). */
export const FIGHTING_STYLES = {
  defense: {
    name: "Defense",
    text: "+1 AC while wearing armour.",
  },
  "great-weapon-fighting": {
    name: "Great Weapon Fighting",
    text: "Treat 1s and 2s on damage dice as 3s with a two-handed or versatile weapon held in two hands. No effect with a mace and shield.",
  },
  "two-weapon-fighting": {
    name: "Two-Weapon Fighting",
    text: "Add your ability modifier to the damage of the extra attack from two light weapons. No effect with a mace and shield.",
  },
} as const;
export type FightingStyle = keyof typeof FIGHTING_STYLES;

/** The fixed common-tier kit: chain shirt, shield and mace. */
export const FIGHTER_EQUIPMENT = ["chain-shirt", "shield", "mace"] as const;
/**
 * The mace is the only weapon, so Sap is the only mastery for now. Graze,
 * Nick, Topple and Vex also work without positions; Cleave, Push and Slow do
 * not and are omitted.
 */
export const FIGHTER_WEAPON_MASTERIES = ["mace"] as const;
/**
 * How Second Wind and Action Surge uses recover until in-adventure rests
 * arrive. The sheet, the creation preview and the fight all show these words.
 */
export const FEATURE_USES_RULE =
  "Spent uses stay spent for the rest of the adventure; each adventure starts with all of them.";

/** No ability score can exceed this (4d6 keeps at most 18, +2 reaches 20). */
export const ABILITY_SCORE_CAP = 20;
/** How many Fighter skill proficiencies a creation chooses. */
export const FIGHTER_SKILL_COUNT = 2;

export type BackgroundIncrease = Readonly<Partial<Record<Ability, 1 | 2>>>;
export type Placement = Readonly<Record<Ability, number>>;

export type FighterChoices = Readonly<{
  /** For each ability, the index of the roll placed on it. */
  placement: Placement;
  increase: BackgroundIncrease;
  skills: readonly FighterSkill[];
  fightingStyle: FightingStyle;
}>;

export type FighterSheet = Readonly<{
  id: string;
  name: string;
  class: "Fighter";
  level: Level;
  xp: number;
  hp: number;
  /** The four dice placed on each ability. */
  abilityRolls: Readonly<Record<Ability, AbilityRoll>>;
  backgroundIncrease: BackgroundIncrease;
  /** Each score is its kept three dice plus its background increase. */
  abilities: Abilities;
  skills: readonly FighterSkill[];
  fightingStyle: FightingStyle;
  weaponMasteries: typeof FIGHTER_WEAPON_MASTERIES;
  equipment: typeof FIGHTER_EQUIPMENT;
}>;

const SHEET_KEYS = [
  "id",
  "name",
  "class",
  "level",
  "xp",
  "hp",
  "abilityRolls",
  "backgroundIncrease",
  "abilities",
  "skills",
  "fightingStyle",
  "weaponMasteries",
  "equipment",
];

export function abilityModifier(score: number): number {
  if (!Number.isInteger(score) || score < 3 || score > ABILITY_SCORE_CAP) {
    throw new Error("Invalid ability score (3–20).");
  }
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: Level): number {
  return Math.ceil(level / 4) + 1;
}

export function levelForXp(xp: number): Level {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new Error("Invalid experience points.");
  }
  return xp >= 900 ? 3 : xp >= 300 ? 2 : 1;
}

/** XP needed for the next level, or undefined at the highest level. */
export function nextLevelXp(level: Level): number | undefined {
  return level === 1 ? 300 : level === 2 ? 900 : undefined;
}

export function rollAbilitySet(random: Pick<RandomSource, "roll">): RolledDice {
  return ABILITIES.map(
    () =>
      [random.roll(6), random.roll(6), random.roll(6), random.roll(6)] as const,
  );
}

/** The index of the dropped die: the first of the lowest. */
export function droppedDie(roll: AbilityRoll): number {
  return roll.indexOf(Math.min(...roll));
}

export function keptTotal(roll: AbilityRoll): number {
  return roll.reduce((sum, die) => sum + die, 0) - Math.min(...roll);
}

/**
 * The order a fresh creation fills the abilities, highest roll first:
 * Strength for the mace, Constitution for hit points, Dexterity for AC (the
 * chain shirt counts up to +2) and initiative, Wisdom for Perception and
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
 * The placement a fresh creation starts with: rolls sorted by kept total,
 * highest first, go down `FIGHTER_ABILITY_PRIORITY`. Tied totals keep their
 * roll order, so the earlier roll takes the higher-priority ability.
 */
export function defaultPlacement(dice: RolledDice): Placement {
  const order = validateDice(dice)
    .map((roll, index) => ({ total: keptTotal(roll), index }))
    .sort((a, b) => b.total - a.total || a.index - b.index);
  return Object.fromEntries(
    FIGHTER_ABILITY_PRIORITY.map((ability, rank) => [
      ability,
      order[rank]!.index,
    ]),
  ) as Placement;
}

function isRoll(value: unknown): value is AbilityRoll {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((die) => Number.isInteger(die) && die >= 1 && die <= 6)
  );
}

export function validateDice(value: unknown): RolledDice {
  if (!Array.isArray(value) || value.length !== 6 || !value.every(isRoll)) {
    throw new Error("Invalid ability dice: six rolls of four d6 are needed.");
  }
  return value.map((roll) => [...roll] as unknown as AbilityRoll);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * How many more +1s an increase needs, by its amounts sorted highest first:
 * none for a complete +2 and +1 or +1 to three, more for a +1 to three still
 * being ticked.
 */
const INCREASE_MISSING: Readonly<Record<string, number>> = {
  "2,1": 0,
  "1,1,1": 0,
  "1,1": 1,
  "1": 2,
  "": 3,
};

/** An increase that is complete or a +1 to three being ticked, and how many +1s it lacks. */
function validatePartialIncrease(value: unknown): {
  increase: BackgroundIncrease;
  missing: number;
} {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) =>
      (ABILITIES as readonly string[]).includes(key),
    )
  ) {
    throw new Error("Invalid background increase.");
  }
  const amounts = Object.values(value)
    .map(Number)
    .sort((a, b) => b - a)
    .join(",");
  const missing = INCREASE_MISSING[amounts];
  if (
    !Object.values(value).every((amount) => amount === 1 || amount === 2) ||
    missing === undefined
  ) {
    throw new Error(
      "Invalid background increase: choose +2 and +1 for two abilities, or +1 for three.",
    );
  }
  return { increase: { ...(value as BackgroundIncrease) }, missing };
}

function validateIncrease(value: unknown): BackgroundIncrease {
  const { increase, missing } = validatePartialIncrease(value);
  if (missing > 0) {
    throw new Error(
      "Invalid background increase: choose +2 and +1 for two abilities, or +1 for three.",
    );
  }
  return increase;
}

function validatePlacement(value: unknown): Placement {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    !ABILITIES.every(
      (ability) =>
        Number.isInteger(value[ability]) &&
        (value[ability] as number) >= 0 &&
        (value[ability] as number) <= 5,
    ) ||
    new Set(ABILITIES.map((ability) => value[ability])).size !== 6
  ) {
    throw new Error("Invalid placement: put each roll on exactly one ability.");
  }
  return value as Placement;
}

/** Different Fighter skills, however many are ticked so far. */
function validatePartialSkills(value: unknown): readonly FighterSkill[] {
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    !value.every(
      (skill) =>
        typeof skill === "string" && Object.hasOwn(FIGHTER_SKILLS, skill),
    )
  ) {
    throw new Error("Choose two different Fighter skill proficiencies.");
  }
  return [...(value as FighterSkill[])];
}

function validateSkills(value: unknown): readonly FighterSkill[] {
  const skills = validatePartialSkills(value);
  if (skills.length !== FIGHTER_SKILL_COUNT) {
    throw new Error("Choose two different Fighter skill proficiencies.");
  }
  return skills;
}

function validateFightingStyle(value: unknown): FightingStyle {
  if (typeof value !== "string" || !Object.hasOwn(FIGHTING_STYLES, value)) {
    throw new Error("Choose a supported Fighting Style.");
  }
  return value as FightingStyle;
}

function validateName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > 40 ||
    /[\p{Cc}\p{Cs}]/u.test(value)
  ) {
    throw new Error("Invalid character name (1–40 characters).");
  }
  return value;
}

/** A level 1 Fighter with 0 XP at full health from one creation's dice. */
export function buildFighter(
  id: string,
  name: string,
  dice: RolledDice,
  choices: FighterChoices,
): FighterSheet {
  const rolled = validateDice(dice);
  const placement = validatePlacement(choices.placement);
  const increase = validateIncrease(choices.increase);
  const abilityRolls = Object.fromEntries(
    ABILITIES.map((ability) => [ability, rolled[placement[ability]]!]),
  ) as Record<Ability, AbilityRoll>;
  const base = {
    id,
    name: name.trim(),
    class: "Fighter" as const,
    level: 1 as const,
    xp: 0,
    hp: 0,
    abilityRolls,
    backgroundIncrease: increase,
    abilities: Object.fromEntries(
      ABILITIES.map((ability) => [
        ability,
        keptTotal(abilityRolls[ability]) + (increase[ability] ?? 0),
      ]),
    ) as Abilities,
    skills: validateSkills(choices.skills),
    fightingStyle: validateFightingStyle(choices.fightingStyle),
    weaponMasteries: FIGHTER_WEAPON_MASTERIES,
    equipment: FIGHTER_EQUIPMENT,
  };
  return validateFighter({ ...base, hp: fighterProfile(base).maxHp });
}

export type CreationRow = Readonly<{
  ability: Ability;
  score: number;
  modifier: number;
  /** Whether the score has reached ABILITY_SCORE_CAP. */
  atCap: boolean;
}>;

/** What the creation screen shows for the choices made so far. */
export type CreationProjection = Readonly<{
  /** One row per ability, in ABILITIES order. */
  rows: readonly CreationRow[];
  /** Skills ticked, the limit, and whether no more can be ticked. */
  skills: Readonly<{ chosen: number; limit: number; full: boolean }>;
  /** Why a choice is not finished yet, keyed by the choice; empty when saving can go ahead. */
  unfinished: Readonly<{ increase?: string; skills?: string }>;
  /** The sheet's scores and profile, present only when nothing is unfinished. */
  sheet?: Readonly<{ abilities: Abilities; profile: FighterProfile }>;
}>;

/**
 * Projects a creation's choices for the page: every row's score, modifier
 * and cap, and the skill limit, even while the +1 to three or the skills are
 * still being ticked. Choices no page could send are refused as by
 * `buildFighter`, whose sheet is included once every choice is complete.
 */
export function projectCreation(
  dice: RolledDice,
  choices: FighterChoices,
): CreationProjection {
  const rolled = validateDice(dice);
  const placement = validatePlacement(choices.placement);
  const { increase, missing } = validatePartialIncrease(choices.increase);
  const skills = validatePartialSkills(choices.skills);
  validateFightingStyle(choices.fightingStyle);
  const rows = ABILITIES.map((ability) => {
    const score =
      keptTotal(rolled[placement[ability]]!) + (increase[ability] ?? 0);
    return {
      ability,
      score,
      modifier: abilityModifier(score),
      atCap: score >= ABILITY_SCORE_CAP,
    };
  });
  const unfinished = {
    ...(missing === 0
      ? {}
      : {
          increase: `Choose ${missing} more ${missing === 1 ? "ability" : "abilities"} for +1.`,
        }),
    ...(skills.length === FIGHTER_SKILL_COUNT
      ? {}
      : { skills: `Choose two skills; ${skills.length} chosen.` }),
  };
  const projection = {
    rows,
    skills: {
      chosen: skills.length,
      limit: FIGHTER_SKILL_COUNT,
      full: skills.length >= FIGHTER_SKILL_COUNT,
    },
    unfinished,
  };
  if (Object.keys(unfinished).length > 0) {
    return projection;
  }
  const sheet = buildFighter("0".repeat(32), "Preview", rolled, choices);
  return {
    ...projection,
    sheet: { abilities: sheet.abilities, profile: fighterProfile(sheet) },
  };
}

export function validateFighter(value: unknown): FighterSheet {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== SHEET_KEYS.length ||
    !SHEET_KEYS.every((key) => Object.hasOwn(value, key))
  ) {
    throw new Error("Invalid character sheet.");
  }
  const sheet = value as FighterSheet;
  if (typeof sheet.id !== "string" || !/^[a-f0-9]{32}$/.test(sheet.id)) {
    throw new Error("Invalid character identity.");
  }
  validateName(sheet.name);
  if (sheet.class !== "Fighter") {
    throw new Error("Unsupported character class.");
  }
  const rolls = sheet.abilityRolls as unknown;
  if (
    !isRecord(rolls) ||
    Object.keys(rolls).length !== 6 ||
    !ABILITIES.every((ability) => isRoll(rolls[ability]))
  ) {
    throw new Error("Invalid ability dice.");
  }
  const increase = validateIncrease(sheet.backgroundIncrease);
  if (
    !isRecord(sheet.abilities) ||
    Object.keys(sheet.abilities).length !== 6 ||
    !ABILITIES.every(
      (ability) =>
        sheet.abilities[ability] ===
        keptTotal(sheet.abilityRolls[ability]) + (increase[ability] ?? 0),
    )
  ) {
    throw new Error(
      "Ability scores must equal their kept dice plus the background increase.",
    );
  }
  for (const ability of ABILITIES) {
    abilityModifier(sheet.abilities[ability]);
  }
  validateSkills(sheet.skills);
  validateFightingStyle(sheet.fightingStyle);
  if (
    JSON.stringify(sheet.weaponMasteries) !==
    JSON.stringify(FIGHTER_WEAPON_MASTERIES)
  ) {
    throw new Error("Unsupported weapon mastery.");
  }
  if (JSON.stringify(sheet.equipment) !== JSON.stringify(FIGHTER_EQUIPMENT)) {
    throw new Error("Unsupported character equipment.");
  }
  if (sheet.level !== levelForXp(sheet.xp)) {
    throw new Error("Character level differs from experience points.");
  }
  if (
    !Number.isInteger(sheet.hp) ||
    sheet.hp < 0 ||
    sheet.hp > fighterProfile(sheet).maxHp
  ) {
    throw new Error("Invalid character health.");
  }
  return structuredClone(sheet);
}

export type FighterFeature = Readonly<{
  id: string;
  name: string;
  text: string;
}>;

export type FighterProfile = Readonly<{
  level: Level;
  proficiencyBonus: number;
  maxHp: number;
  armorClass: number;
  initiative: number;
  modifiers: Readonly<Record<Ability, number>>;
  savingThrows: Readonly<
    Record<Ability, Readonly<{ bonus: number; proficient: boolean }>>
  >;
  skills: readonly Readonly<{
    id: FighterSkill;
    name: string;
    ability: Ability;
    bonus: number;
    proficient: boolean;
  }>[];
  attack: Readonly<{
    weapon: "Mace";
    bonus: number;
    damage: Readonly<{
      dice: 1;
      sides: 6;
      modifier: number;
      type: "bludgeoning";
    }>;
    mastery: "Sap";
    criticalRange: 19 | 20;
  }>;
  secondWind: Readonly<{
    uses: number;
    healing: Readonly<{ dice: 1; sides: 10; modifier: number }>;
  }>;
  actionSurgeUses: number;
  features: readonly FighterFeature[];
  nextLevelXp: number | undefined;
}>;

const SAVE_PROFICIENCIES: readonly Ability[] = ["strength", "constitution"];

/** Every number derived from a sheet's scores, level, kit and choices. */
export function fighterProfile(
  sheet: Pick<FighterSheet, "abilities" | "level" | "skills" | "fightingStyle">,
): FighterProfile {
  const level = sheet.level;
  const proficiency = proficiencyBonus(level);
  const modifiers = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      abilityModifier(sheet.abilities[ability]),
    ]),
  ) as Record<Ability, number>;
  const style = FIGHTING_STYLES[sheet.fightingStyle];
  const features: FighterFeature[] = [
    {
      id: "fighting-style",
      name: `Fighting Style: ${style.name}`,
      text: style.text,
    },
    {
      id: "second-wind",
      name: "Second Wind",
      text: `Bonus action: regain 1d10 + ${level} HP. 2 uses. ${FEATURE_USES_RULE}`,
    },
    {
      id: "weapon-mastery",
      name: "Weapon Mastery: Sap",
      text: "A creature hit by your mace has disadvantage on its next attack roll before the start of your next turn.",
    },
  ];
  if (level >= 2) {
    features.push(
      {
        id: "action-surge",
        name: "Action Surge",
        text: `Take one additional action on your turn, except Magic. 1 use. ${FEATURE_USES_RULE}`,
      },
      {
        id: "tactical-mind",
        name: "Tactical Mind",
        text: "When you fail an ability check, spend a use of Second Wind to add 1d10 to it instead of healing; the use is kept if the check still fails.",
      },
    );
  }
  if (level >= 3) {
    features.push(
      {
        id: "improved-critical",
        name: "Champion: Improved Critical",
        text: "Your attack rolls score a critical hit on a roll of 19 or 20.",
      },
      {
        id: "remarkable-athlete",
        name: "Champion: Remarkable Athlete",
        text: "Advantage on initiative rolls and Strength (Athletics) checks.",
      },
    );
  }
  return {
    level,
    proficiencyBonus: proficiency,
    maxHp:
      10 + modifiers.constitution + (level - 1) * (6 + modifiers.constitution),
    // Chain shirt 13 + Dex (max 2), shield +2, Defense +1 in armour.
    armorClass:
      13 +
      Math.min(2, modifiers.dexterity) +
      2 +
      (sheet.fightingStyle === "defense" ? 1 : 0),
    initiative: modifiers.dexterity,
    modifiers,
    savingThrows: Object.fromEntries(
      ABILITIES.map((ability) => {
        const proficient = SAVE_PROFICIENCIES.includes(ability);
        return [
          ability,
          {
            bonus: modifiers[ability] + (proficient ? proficiency : 0),
            proficient,
          },
        ];
      }),
    ) as Record<Ability, { bonus: number; proficient: boolean }>,
    skills: (Object.keys(FIGHTER_SKILLS) as FighterSkill[]).map((id) => {
      const { name, ability } = FIGHTER_SKILLS[id];
      const proficient = sheet.skills.includes(id);
      return {
        id,
        name,
        ability,
        bonus: modifiers[ability] + (proficient ? proficiency : 0),
        proficient,
      };
    }),
    attack: {
      weapon: "Mace",
      bonus: modifiers.strength + proficiency,
      damage: {
        dice: 1,
        sides: 6,
        modifier: modifiers.strength,
        type: "bludgeoning",
      },
      mastery: "Sap",
      criticalRange: level >= 3 ? 19 : 20,
    },
    secondWind: { uses: 2, healing: { dice: 1, sides: 10, modifier: level } },
    actionSurgeUses: level >= 2 ? 1 : 0,
    features,
    nextLevelXp: nextLevelXp(level),
  };
}
