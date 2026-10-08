/**
 * The 5e Fighter (SRD 5.2) at levels 1–5, created from 4d6-drop-lowest.
 *
 * Pure rules: dice come only from the `RandomSource` passed in, and every
 * derived number (HP, AC, attack, saves, skills, features) is computed from a
 * validated sheet. `docs/character-rules.md` records these numbers.
 *
 * A sheet keeps what the character holds (its equipment, stowed gear,
 * ammunition, treasure and purse) apart from its ledger of what it has
 * earned: each treasure, coin or gear found and each XP award credited,
 * once. Settling a surviving adventure (`settleFighter`) replaces the
 * possessions with what the character holds at the end and adds to the
 * ledger, so a find stays earned after the item is gone.
 */
import {
  AMMUNITION,
  carryingCapacity,
  equipmentProfile,
  FIGHTER_MASTERY_COUNT,
  formatCoins,
  isItemId,
  isKitId,
  itemName,
  KIT_IDS,
  kitPrice,
  loadWeight,
  MASTERIES,
  MASTERY_WEAPONS,
  readLoadout,
  STARTING_KITS,
  TREASURE_WEIGHT,
  WEAPONS,
  type Ammunition,
  type AmmunitionId,
  type AttackProfile,
  type EquipmentProfile,
  type FightingStyleId,
  type ItemId,
  type KitId,
  type WeaponId,
} from "./equipment-5e.js";
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
export type Level = 1 | 2 | 3 | 4 | 5;

/** The highest level a character reaches; XP above its threshold is kept. */
export const MAX_LEVEL: Level = 5;

/** The SRD 5.2 XP a character needs to reach each supported level. */
export const LEVEL_XP: Readonly<Record<Level, number>> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
};

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

/** The SRD 5.2 Fighting Style feats. */
export const FIGHTING_STYLES = {
  archery: {
    name: "Archery",
    text: "+2 to attack rolls with ranged weapons.",
  },
  defense: {
    name: "Defense",
    text: "+1 AC while wearing armour.",
  },
  "great-weapon-fighting": {
    name: "Great Weapon Fighting",
    text: "Treat 1s and 2s on damage dice as 3s with a two-handed weapon, or a versatile one held in two hands.",
  },
  "two-weapon-fighting": {
    name: "Two-Weapon Fighting",
    text: "Add your ability modifier to the damage of the extra attack from two light weapons.",
  },
} as const satisfies Record<FightingStyleId, { name: string; text: string }>;
export type FightingStyle = keyof typeof FIGHTING_STYLES;

/** Whether a Fighting Style does anything with the gear held, and why. */
export type FightingStyleUse = Readonly<{
  id: FightingStyle;
  name: string;
  applies: boolean;
  /** Such as "Applies: you wear armour." */
  note: string;
}>;

/** Whether `style` applies with the equipment `gear` was derived from. */
export function fightingStyleUse(
  style: FightingStyle,
  gear: EquipmentProfile,
): FightingStyleUse {
  const weapon = gear.attack.weapon.toLowerCase();
  const use = (applies: boolean, note: string): FightingStyleUse => ({
    id: style,
    name: FIGHTING_STYLES[style].name,
    applies,
    note,
  });
  switch (style) {
    case "archery":
      return gear.attack.ammunition === undefined
        ? use(false, `No effect with the ${weapon}: it needs a ranged weapon.`)
        : use(true, `Applies: the ${weapon} is a ranged weapon.`);
    case "defense":
      return gear.loadout.armour === undefined
        ? use(false, "No effect without armour.")
        : use(true, "Applies: you wear armour.");
    case "great-weapon-fighting": {
      if (gear.attack.greatWeaponFighting === true) {
        return use(true, `Applies: the ${weapon} is held in two hands.`);
      }
      const versatile = (
        WEAPONS[gear.loadout.mainHand].properties as readonly string[]
      ).includes("versatile");
      return use(
        false,
        `No effect with the ${weapon}${versatile ? " in one hand" : ""}: it needs a two-handed weapon, or a versatile one held in two hands.`,
      );
    }
    case "two-weapon-fighting":
      return gear.lightAttack === undefined
        ? use(
            false,
            `No effect with the ${weapon}: it needs two light weapons.`,
          )
        : use(
            true,
            `Applies: the extra attack with the second ${gear.lightAttack.weapon.toLowerCase()} adds your ability modifier.`,
          );
  }
}

/**
 * How Second Wind and Action Surge uses recover until in-adventure rests
 * arrive. The sheet, the creation preview and the fight all show these words.
 */
export const FEATURE_USES_RULE =
  "Spent uses stay spent for the rest of the adventure; a rest between adventures restores them and every hit point.";

/** No ability score can exceed this (4d6 keeps at most 18, +2 reaches 20). */
export const ABILITY_SCORE_CAP = 20;
/** How many Fighter skill proficiencies a creation chooses. */
export const FIGHTER_SKILL_COUNT = 2;

export type BackgroundIncrease = Readonly<Partial<Record<Ability, 1 | 2>>>;
/**
 * One Ability Score Improvement (#286): +2 to one ability, or +1 to two. No
 * score can rise above ABILITY_SCORE_CAP. Other feats are not used.
 */
export type AbilityScoreImprovement = Readonly<Partial<Record<Ability, 1 | 2>>>;

/** The choices a level-4 Fighter makes after settling (#286). */
export type LevelChoice = Readonly<{
  increase: AbilityScoreImprovement;
  /** The fourth kind of weapon mastered, from `MASTERY_WEAPONS`. */
  mastery: WeaponId;
}>;
export type Placement = Readonly<Record<Ability, number>>;

export type FighterChoices = Readonly<{
  /** For each ability, the index of the roll placed on it. */
  placement: Placement;
  increase: BackgroundIncrease;
  skills: readonly FighterSkill[];
  fightingStyle: FightingStyle;
  /** The starting kit, from `STARTING_KITS`. */
  kit: KitId;
  /** The kinds of weapon mastered, from `MASTERY_WEAPONS`. */
  masteries: readonly WeaponId[];
}>;

/**
 * A treasure found in an adventure. `id` is the adventure's id and the item's,
 * as `adventure/item`, so each is found once. `value` is what it is worth in
 * copper, and what a merchant pays for it (#239).
 */
export type TreasureRecord = Readonly<{
  id: string;
  name: string;
  description: string;
  value: number;
}>;

/**
 * One XP award: winning an encounter (`adventure/encounter/id`) or reaching
 * an ending (`adventure/ending/id`). Each is credited once per character.
 */
export type XpAward = Readonly<{ id: string; name: string; xp: number }>;

/**
 * What a character holds: its equipment, its stowed gear, its ammunition, its
 * treasure and its purse.
 */
export type Possessions = Readonly<{
  /** What it has equipped: armour, then the weapon it attacks with, then any second weapon. */
  equipment: readonly ItemId[];
  /** Catalogue gear it carries but has not equipped. */
  stowed: readonly ItemId[];
  /** The arrows and bolts it carries, by count (#230). */
  ammunition: Ammunition;
  treasure: readonly TreasureRecord[];
  /** Its coin, in copper. */
  purse: number;
}>;

/**
 * Coin found in an adventure. `id` is `adventure/item`, like a treasure's,
 * so each is found once.
 */
export type CoinFind = Readonly<{ id: string; copper: number }>;

/** How a surviving adventure settles the character. */
export type Settlement = Readonly<{
  /** What the character holds at the end; it replaces its possessions. */
  possessions: Possessions;
  /** The XP awards not credited before. */
  xp: readonly XpAward[];
  /** The treasure found in this adventure and carried out, not found before. */
  finds: readonly TreasureRecord[];
  /**
   * The ids (`adventure/item`) of the treasure found in this adventure and
   * sold there (#239): each is still found once.
   */
  sold: readonly string[];
  /** The coin found in this adventure and carried out in the purse. */
  coin: readonly CoinFind[];
  /**
   * The ids (`adventure/item`) of the gear found in this adventure, kept or
   * not: each is found once.
   */
  gear: readonly string[];
}>;

const TREASURE_ID = /^[a-z][a-z0-9-]{0,47}\/[a-z][a-z0-9-]{0,47}$/;
const AWARD_ID =
  /^[a-z][a-z0-9-]{0,47}\/(encounter|ending)\/[a-z][a-z0-9-]{0,47}$/;
const MAX_EARNED = 1000;
/** The most one treasure may be worth, in copper: 100,000 gp. */
const MAX_TREASURE_VALUE = 10_000_000;
/** The most arrows or bolts of one kind a sheet may hold. */
const MAX_AMMUNITION = 10_000;

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
  /**
   * The Ability Score Improvements chosen, in level order (#286). A level-4
   * sheet without one owes its level choice (`pendingLevelChoice`).
   */
  abilityScoreImprovements: readonly AbilityScoreImprovement[];
  /**
   * Each score is its kept three dice plus its background increase and its
   * Ability Score Improvements.
   */
  abilities: Abilities;
  skills: readonly FighterSkill[];
  fightingStyle: FightingStyle;
  /** The kinds of weapon whose mastery it can use. */
  weaponMasteries: readonly WeaponId[];
  /** What it has equipped; see `Possessions`. */
  equipment: readonly ItemId[];
  /** The catalogue gear it carries but has not equipped. */
  stowed: readonly ItemId[];
  /** The arrows and bolts it carries, by count (#230). */
  ammunition: Ammunition;
  /** The treasure the character holds. */
  treasure: readonly TreasureRecord[];
  /** The coin the character holds, in copper. */
  purse: number;
  /** The ids of the treasure, coin and gear found, so none is found twice. */
  finds: readonly string[];
  /** The ids of the XP awards credited, so none is credited twice. */
  xpAwards: readonly string[];
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
  "abilityScoreImprovements",
  "abilities",
  "skills",
  "fightingStyle",
  "weaponMasteries",
  "equipment",
  "stowed",
  "ammunition",
  "treasure",
  "purse",
  "finds",
  "xpAwards",
];

export function abilityModifier(score: number): number {
  if (!Number.isInteger(score) || score < 3 || score > ABILITY_SCORE_CAP) {
    throw new Error(`Invalid ability score (3–${ABILITY_SCORE_CAP}).`);
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
  let level: Level = 1;
  for (const next of [2, 3, 4, 5] as const) {
    if (xp >= LEVEL_XP[next]) {
      level = next;
    }
  }
  return level;
}

/** XP needed for the next level, or undefined at the highest level. */
export function nextLevelXp(level: Level): number | undefined {
  return level === MAX_LEVEL ? undefined : LEVEL_XP[(level + 1) as Level];
}

/** The levels that bring an Ability Score Improvement (the 2024 Fighter table). */
export const ABILITY_SCORE_IMPROVEMENT_LEVELS: readonly Level[] = [4];

/** How many Ability Score Improvements a Fighter of `level` has. */
export function abilityScoreImprovementCount(level: Level): number {
  return ABILITY_SCORE_IMPROVEMENT_LEVELS.filter((at) => at <= level).length;
}

/**
 * How many kinds of weapon a Fighter of `level` masters (the 2024 Fighter
 * table): three from level 1, four from level 4.
 */
export function weaponMasteryCount(level: Level): number {
  return level >= 4 ? FIGHTER_MASTERY_COUNT + 1 : FIGHTER_MASTERY_COUNT;
}

/** Second Wind's uses at `level` (the 2024 Fighter table): 2, then 3 from level 4. */
export function secondWindUses(level: Level): number {
  return level >= 4 ? 3 : 2;
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
} as const satisfies Omit<FighterChoices, "placement">;

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

const INVALID_INCREASE =
  "Invalid background increase: choose +2 and +1 for two abilities, or +1 for three.";

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
  const amounts = Object.values(value);
  const twos = amounts.filter((amount) => amount === 2).length;
  const ones = amounts.filter((amount) => amount === 1).length;
  // +2 and +1 is complete; +1s alone may still be being ticked, up to three.
  const missing =
    twos === 1 && ones === 1 ? 0 : twos === 0 && ones <= 3 ? 3 - ones : -1;
  if (twos + ones !== amounts.length || missing < 0) {
    throw new Error(INVALID_INCREASE);
  }
  return { increase: { ...(value as BackgroundIncrease) }, missing };
}

function validateIncrease(value: unknown): BackgroundIncrease {
  const { increase, missing } = validatePartialIncrease(value);
  if (missing > 0) {
    throw new Error(INVALID_INCREASE);
  }
  return increase;
}

const ASI_SHAPE =
  "An Ability Score Improvement is +2 to one ability or +1 to two different abilities.";

/**
 * An Ability Score Improvement being chosen: +2 to one ability (complete),
 * or +1s to up to two, and how many +1s it still lacks.
 */
function validatePartialImprovement(value: unknown): {
  increase: AbilityScoreImprovement;
  missing: number;
} {
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) =>
      (ABILITIES as readonly string[]).includes(key),
    )
  ) {
    throw new Error(ASI_SHAPE);
  }
  const amounts = Object.values(value);
  const twos = amounts.filter((amount) => amount === 2).length;
  const ones = amounts.filter((amount) => amount === 1).length;
  const missing =
    twos === 1 && ones === 0 ? 0 : twos === 0 && ones <= 2 ? 2 - ones : -1;
  if (twos + ones !== amounts.length || missing < 0) {
    throw new Error(ASI_SHAPE);
  }
  return { increase: { ...(value as AbilityScoreImprovement) }, missing };
}

function validateImprovement(value: unknown): AbilityScoreImprovement {
  const { increase, missing } = validatePartialImprovement(value);
  if (missing > 0) {
    throw new Error(ASI_SHAPE);
  }
  return increase;
}

function validateImprovements(
  value: unknown,
): readonly AbilityScoreImprovement[] {
  if (!Array.isArray(value) || value.length > MAX_LEVEL) {
    throw new Error("Invalid Ability Score Improvements.");
  }
  return value.map(validateImprovement);
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
    throw new Error(
      `Choose ${FIGHTER_SKILL_COUNT} different Fighter skill proficiencies.`,
    );
  }
  return [...(value as FighterSkill[])];
}

function validateSkills(value: unknown): readonly FighterSkill[] {
  const skills = validatePartialSkills(value);
  if (skills.length !== FIGHTER_SKILL_COUNT) {
    throw new Error(
      `Choose ${FIGHTER_SKILL_COUNT} different Fighter skill proficiencies.`,
    );
  }
  return skills;
}

function validateFightingStyle(value: unknown): FightingStyle {
  if (typeof value !== "string" || !Object.hasOwn(FIGHTING_STYLES, value)) {
    throw new Error("Choose a supported Fighting Style.");
  }
  return value as FightingStyle;
}

function validateKit(value: unknown): KitId {
  if (!isKitId(value)) {
    throw new Error("Choose one of the starting kits.");
  }
  return value;
}

const MASTERY_CHOICE = `Choose ${FIGHTER_MASTERY_COUNT} different kinds of weapon to master.`;

/** Different weapons whose mastery is used, however many are ticked so far. */
function validatePartialMasteries(value: unknown): readonly WeaponId[] {
  if (
    !Array.isArray(value) ||
    value.length > FIGHTER_MASTERY_COUNT ||
    new Set(value).size !== value.length ||
    !value.every(
      (id) =>
        typeof id === "string" &&
        (MASTERY_WEAPONS as readonly string[]).includes(id),
    )
  ) {
    throw new Error(MASTERY_CHOICE);
  }
  return [...(value as WeaponId[])];
}

function validateMasteries(value: unknown): readonly WeaponId[] {
  const masteries = validatePartialMasteries(value);
  if (masteries.length !== FIGHTER_MASTERY_COUNT) {
    throw new Error(MASTERY_CHOICE);
  }
  return masteries;
}

/** A sheet's masteries: `count` different weapons whose mastery is used. */
function validateSheetMasteries(
  value: unknown,
  count: number,
): readonly WeaponId[] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    new Set(value).size !== value.length ||
    !value.every(
      (id) =>
        typeof id === "string" &&
        (MASTERY_WEAPONS as readonly string[]).includes(id),
    )
  ) {
    throw new Error("Unsupported weapon mastery.");
  }
  return value as WeaponId[];
}

function plainText(value: unknown, max: number): boolean {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= 1 &&
    value.length <= max &&
    !/[\p{Cc}\p{Cs}]/u.test(value)
  );
}

function validateTreasure(value: unknown): readonly TreasureRecord[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_EARNED ||
    !value.every(
      (entry) =>
        isRecord(entry) &&
        Object.keys(entry).sort().join(",") === "description,id,name,value" &&
        typeof entry.id === "string" &&
        TREASURE_ID.test(entry.id) &&
        Number.isSafeInteger(entry.value) &&
        (entry.value as number) >= 0 &&
        (entry.value as number) <= MAX_TREASURE_VALUE &&
        plainText(entry.name, 60) &&
        plainText(entry.description, 2000),
    ) ||
    new Set(value.map(({ id }: TreasureRecord) => id)).size !== value.length
  ) {
    throw new Error("Invalid treasure.");
  }
  return value as TreasureRecord[];
}

/** A list of distinct ids, each matching `pattern`. */
function validateIds(
  value: unknown,
  pattern: RegExp,
  message: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_EARNED ||
    !value.every((id) => typeof id === "string" && pattern.test(id)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(message);
  }
  return value as string[];
}

/** A count of each kind of ammunition, and no other key. */
function validateAmmunition(value: unknown): Ammunition {
  const kinds = Object.keys(AMMUNITION) as AmmunitionId[];
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== [...kinds].sort().join(",") ||
    !kinds.every(
      (kind) =>
        Number.isSafeInteger(value[kind]) &&
        (value[kind] as number) >= 0 &&
        (value[kind] as number) <= MAX_AMMUNITION,
    )
  ) {
    throw new Error("Invalid ammunition.");
  }
  return value as Ammunition;
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
    abilityScoreImprovements: [],
    abilities: Object.fromEntries(
      ABILITIES.map((ability) => [
        ability,
        keptTotal(abilityRolls[ability]) + (increase[ability] ?? 0),
      ]),
    ) as Abilities,
    skills: validateSkills(choices.skills),
    fightingStyle: validateFightingStyle(choices.fightingStyle),
    weaponMasteries: validateMasteries(choices.masteries),
    equipment: STARTING_KITS[validateKit(choices.kit)].equipment,
    stowed: [],
    ammunition: { arrows: 0, bolts: 0 },
    treasure: [],
    purse: 0,
    finds: [],
    xpAwards: [],
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

/** One starting kit as the creation screen offers it, with the numbers it gives. */
export type KitPreview = Readonly<{
  id: KitId;
  name: string;
  /** In copper pieces. */
  price: number;
  /** The price in mixed coins, such as "12 gp 1 sp". */
  value: string;
  /** The items, by name, in the kit's order. */
  items: readonly string[];
  armorClass: number;
  attack: AttackProfile;
  lightAttack?: AttackProfile;
}>;

/** What the creation screen shows for the choices made so far. */
export type CreationProjection = Readonly<{
  /** One row per ability, in ABILITIES order. */
  rows: readonly CreationRow[];
  /** Skills ticked, the limit, and whether no more can be ticked. */
  skills: Readonly<{ chosen: number; limit: number; full: boolean }>;
  /** Masteries ticked, the limit, and whether no more can be ticked. */
  masteries: Readonly<{ chosen: number; limit: number; full: boolean }>;
  /**
   * Every starting kit with the AC and attacks it gives these scores, Fighting
   * Style and the masteries ticked so far.
   */
  kits: readonly KitPreview[];
  /** Every Fighting Style, and whether it applies with the kit chosen. */
  fightingStyles: readonly FightingStyleUse[];
  /** Why a choice is not finished yet, keyed by the choice; empty when saving can go ahead. */
  unfinished: Readonly<{
    increase?: string;
    skills?: string;
    masteries?: string;
  }>;
  /**
   * The sheet's scores, profile and the weight its kit makes it carry,
   * present only when nothing is unfinished.
   */
  sheet?: Readonly<{
    abilities: Abilities;
    profile: FighterProfile;
    carrying: Carrying;
  }>;
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
  const fightingStyle = validateFightingStyle(choices.fightingStyle);
  const kitChosen = validateKit(choices.kit);
  const masteries = validatePartialMasteries(choices.masteries);
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
      : {
          skills: `Choose ${FIGHTER_SKILL_COUNT} skills; ${skills.length} chosen.`,
        }),
    ...(masteries.length === FIGHTER_MASTERY_COUNT
      ? {}
      : {
          masteries: `Choose ${FIGHTER_MASTERY_COUNT} weapon masteries; ${masteries.length} chosen.`,
        }),
  };
  const score = (ability: Ability) =>
    rows.find((row) => row.ability === ability)!.score;
  const derive = (id: KitId, style: FightingStyle) =>
    equipmentProfile(STARTING_KITS[id].equipment, {
      modifiers: {
        strength: abilityModifier(score("strength")),
        dexterity: abilityModifier(score("dexterity")),
      },
      strengthScore: score("strength"),
      dexterityScore: score("dexterity"),
      proficiency: proficiencyBonus(1),
      masteries,
      fightingStyle: style,
      criticalRange: 20,
    });
  const kits = KIT_IDS.map((id) => {
    const kit = STARTING_KITS[id];
    const derived = derive(id, fightingStyle);
    return {
      id,
      name: kit.name,
      price: kitPrice(id),
      value: formatCoins(kitPrice(id)),
      items: kit.equipment.map(itemName),
      armorClass: derived.armorClass,
      attack: derived.attack,
      ...(derived.lightAttack === undefined
        ? {}
        : { lightAttack: derived.lightAttack }),
    };
  });
  const projection = {
    rows,
    skills: {
      chosen: skills.length,
      limit: FIGHTER_SKILL_COUNT,
      full: skills.length >= FIGHTER_SKILL_COUNT,
    },
    masteries: {
      chosen: masteries.length,
      limit: FIGHTER_MASTERY_COUNT,
      full: masteries.length >= FIGHTER_MASTERY_COUNT,
    },
    kits,
    fightingStyles: (Object.keys(FIGHTING_STYLES) as FightingStyle[]).map(
      (style) => fightingStyleUse(style, derive(kitChosen, style)),
    ),
    unfinished,
  };
  if (Object.keys(unfinished).length > 0) {
    return projection;
  }
  const sheet = buildFighter("0".repeat(32), "Preview", rolled, choices);
  return {
    ...projection,
    sheet: {
      abilities: sheet.abilities,
      profile: fighterProfile(sheet),
      carrying: fighterCarrying(sheet),
    },
  };
}

/** What a sheet's Ability Score Improvements add to `ability`. */
function improvementTo(
  improvements: readonly AbilityScoreImprovement[],
  ability: Ability,
): number {
  return improvements.reduce((sum, entry) => sum + (entry[ability] ?? 0), 0);
}

/** "+2 Strength" or "+1 Strength, +1 Constitution", in ABILITIES order. */
export function improvementText(increase: AbilityScoreImprovement): string {
  return ABILITIES.filter((ability) => increase[ability] !== undefined)
    .map((ability) => `+${increase[ability]} ${titleCase(ability)}`)
    .join(", ");
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  const improvements = validateImprovements(sheet.abilityScoreImprovements);
  if (
    !isRecord(sheet.abilities) ||
    Object.keys(sheet.abilities).length !== 6 ||
    !ABILITIES.every(
      (ability) =>
        sheet.abilities[ability] ===
        keptTotal(sheet.abilityRolls[ability]) +
          (increase[ability] ?? 0) +
          improvementTo(improvements, ability),
    )
  ) {
    throw new Error(
      "Ability scores must equal their kept dice plus the background increase and any Ability Score Improvements.",
    );
  }
  for (const ability of ABILITIES) {
    abilityModifier(sheet.abilities[ability]);
  }
  validateSkills(sheet.skills);
  validateFightingStyle(sheet.fightingStyle);
  try {
    readLoadout(sheet.equipment);
  } catch {
    throw new Error("Unsupported character equipment.");
  }
  if (!Array.isArray(sheet.stowed) || !sheet.stowed.every(isItemId)) {
    throw new Error("Invalid stowed gear.");
  }
  validateAmmunition(sheet.ammunition);
  validateTreasure(sheet.treasure);
  if (!Number.isSafeInteger(sheet.purse) || sheet.purse < 0) {
    throw new Error("Invalid purse.");
  }
  validateIds(sheet.finds, TREASURE_ID, "Invalid finds.");
  validateIds(sheet.xpAwards, AWARD_ID, "Invalid XP awards.");
  if (sheet.level !== levelForXp(sheet.xp)) {
    throw new Error("Character level differs from experience points.");
  }
  // Each level choice (#286) is an Ability Score Improvement and one more
  // mastery, made together; a sheet may still owe its latest one.
  if (improvements.length > abilityScoreImprovementCount(sheet.level)) {
    throw new Error("Too many Ability Score Improvements for the level.");
  }
  validateSheetMasteries(
    sheet.weaponMasteries,
    FIGHTER_MASTERY_COUNT + improvements.length,
  );
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
  /** What it has equipped, by name, in the sheet's order. */
  equipment: readonly Readonly<{ id: ItemId; name: string }>[];
  /** The attack with the weapon it holds first. */
  attack: AttackProfile;
  /** The Light property's extra attack with a second light weapon. */
  lightAttack?: AttackProfile;
  /** Whether the Fighting Style applies with what it has equipped. */
  fightingStyle: FightingStyleUse;
  /** Armour worn below its Strength requirement (speed -10 ft, not used without positions). */
  strengthShortfall?: Readonly<{ armour: string; strength: number }>;
  secondWind: Readonly<{
    uses: number;
    healing: Readonly<{ dice: 1; sides: 10; modifier: number }>;
  }>;
  actionSurgeUses: number;
  /** Attacks per Attack action: 2 with Extra Attack from level 5 (#287). */
  attacksPerAction: number;
  features: readonly FighterFeature[];
  nextLevelXp: number | undefined;
}>;

const SAVE_PROFICIENCIES: readonly Ability[] = ["strength", "constitution"];

/** Every number derived from a sheet's scores, level, equipment and choices. */
export function fighterProfile(
  sheet: Pick<
    FighterSheet,
    | "abilities"
    | "abilityScoreImprovements"
    | "level"
    | "skills"
    | "fightingStyle"
    | "equipment"
    | "weaponMasteries"
  >,
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
  const gear = equipmentProfile(sheet.equipment, {
    modifiers,
    strengthScore: sheet.abilities.strength,
    dexterityScore: sheet.abilities.dexterity,
    proficiency,
    masteries: sheet.weaponMasteries,
    fightingStyle: sheet.fightingStyle,
    criticalRange: level >= 3 ? 19 : 20,
  });
  const styleUse = fightingStyleUse(sheet.fightingStyle, gear);
  const features: FighterFeature[] = [
    {
      id: "fighting-style",
      name: `Fighting Style: ${style.name}`,
      text: `${style.text} ${styleUse.note}`,
    },
    {
      id: "second-wind",
      name: "Second Wind",
      text: `Bonus action: regain 1d10 + ${level} HP. ${secondWindUses(level)} uses. ${FEATURE_USES_RULE}`,
    },
    {
      id: "weapon-mastery",
      name: `Weapon Mastery: ${sheet.weaponMasteries
        .map((id) => WEAPONS[id].name)
        .join(", ")}`,
      text: `${sheet.weaponMasteries
        .map((id) => {
          const mastery = WEAPONS[id].mastery;
          return `${WEAPONS[id].name} (${mastery}): ${MASTERIES[mastery].text}`;
        })
        .join(" ")} A mastery applies only while you wield that weapon.`,
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
  if (level >= 4) {
    const [chosen] = sheet.abilityScoreImprovements;
    features.push({
      id: "ability-score-improvement",
      name: "Ability Score Improvement",
      text:
        chosen === undefined
          ? `Not chosen yet: +2 to one ability score or +1 to two, to a maximum of ${ABILITY_SCORE_CAP}. Choose it, with a fourth weapon mastery, before the next adventure.`
          : `${improvementText(chosen)}, to a maximum of ${ABILITY_SCORE_CAP}.`,
    });
  }
  if (level >= 5) {
    // Tactical Shift is omitted: it moves the character, and there are no
    // positions (#287).
    features.push({
      id: "extra-attack",
      name: "Extra Attack",
      text: "Attack twice, instead of once, whenever you take the Attack action. Each attack may be at a different opponent.",
    });
  }
  return {
    level,
    proficiencyBonus: proficiency,
    maxHp:
      10 + modifiers.constitution + (level - 1) * (6 + modifiers.constitution),
    armorClass: gear.armorClass,
    equipment: sheet.equipment.map((id) => ({ id, name: itemName(id) })),
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
    attack: gear.attack,
    ...(gear.lightAttack === undefined
      ? {}
      : { lightAttack: gear.lightAttack }),
    fightingStyle: styleUse,
    ...(gear.strengthShortfall === undefined
      ? {}
      : { strengthShortfall: gear.strengthShortfall }),
    secondWind: {
      uses: secondWindUses(level),
      healing: { dice: 1, sides: 10, modifier: level },
    },
    actionSurgeUses: level >= 2 ? 1 : 0,
    attacksPerAction: level >= 5 ? 2 : 1,
    features,
    nextLevelXp: nextLevelXp(level),
  };
}

/** What the character holds, as an adventure starts with it. */
export function possessionsOf(sheet: FighterSheet): Possessions {
  return {
    equipment: sheet.equipment,
    stowed: sheet.stowed,
    ammunition: sheet.ammunition,
    treasure: sheet.treasure,
    purse: sheet.purse,
  };
}

/** The weight a character carries and the most it can, in pounds. */
export type Carrying = Readonly<{ weight: number; capacity: number }>;

/**
 * What a sheet carries between adventures: its gear, its ammunition, its
 * treasure and its purse, against its Strength score × 15 lb (#224).
 */
export function fighterCarrying(
  sheet: Pick<
    FighterSheet,
    "abilities" | "equipment" | "stowed" | "ammunition" | "treasure" | "purse"
  >,
): Carrying {
  return {
    weight: loadWeight({
      equipment: sheet.equipment,
      stowed: sheet.stowed,
      ammunition: sheet.ammunition,
      purse: sheet.purse,
      other: sheet.treasure.length * TREASURE_WEIGHT,
    }),
    capacity: carryingCapacity(sheet.abilities.strength),
  };
}

/**
 * The sheet after a surviving adventure: its possessions are replaced with
 * what it held at the end, each find and XP award not earned before is added
 * to the ledger, the level follows the XP, and the rest between adventures
 * restores every hit point. Settling the same adventure again changes
 * nothing.
 */
export function settleFighter(
  sheet: FighterSheet,
  settlement: Settlement,
): FighterSheet {
  const awards = settlement.xp.filter(({ id }) => !sheet.xpAwards.includes(id));
  const finds = [
    ...[...settlement.finds, ...settlement.coin].map(({ id }) => id),
    ...settlement.sold,
    ...settlement.gear,
  ].filter(
    (id, index, all) => !sheet.finds.includes(id) && all.indexOf(id) === index,
  );
  const xp = sheet.xp + awards.reduce((sum, award) => sum + award.xp, 0);
  const raised = { ...sheet, xp, level: levelForXp(xp) };
  return validateFighter({
    ...raised,
    hp: fighterProfile(raised).maxHp,
    equipment: settlement.possessions.equipment,
    stowed: settlement.possessions.stowed,
    ammunition: settlement.possessions.ammunition,
    treasure: settlement.possessions.treasure.map(
      ({ id, name, description, value }) => ({ id, name, description, value }),
    ),
    purse: settlement.possessions.purse,
    finds: [...sheet.finds, ...finds],
    xpAwards: [...sheet.xpAwards, ...awards.map(({ id }) => id)],
  });
}

/** A choice a new level asks for, made on the sheet (#286). */
export type LevelUpChoice = "ability-score-improvement" | "weapon-mastery";

/** What changed when a character went up a level, for the level-up card. */
export type LevelUpChanges = Readonly<{
  from: Level;
  to: Level;
  maxHp: Readonly<{ before: number; after: number }>;
  proficiencyBonus: Readonly<{ before: number; after: number }>;
  /** Second Wind's uses and healing modifier (1d10 + level). */
  secondWind: Readonly<{
    before: Readonly<{ uses: number; modifier: number }>;
    after: Readonly<{ uses: number; modifier: number }>;
  }>;
  /** How many kinds of weapon the character masters. */
  weaponMasteries: Readonly<{ before: number; after: number }>;
  /** The class features gained, in the sheet's order. */
  features: readonly FighterFeature[];
  /**
   * The choices still to make before the next adventure: an Ability Score
   * Improvement and one more weapon mastery at level 4.
   */
  choices: readonly LevelUpChoice[];
}>;

/** The fields a profile and a pending level choice are read from. */
type ProfiledSheet = Parameters<typeof fighterProfile>[0];

/** The changes from `before` to `after`, or undefined if the level held. */
export function levelUpChanges(
  before: ProfiledSheet,
  after: ProfiledSheet,
): LevelUpChanges | undefined {
  if (after.level === before.level) {
    return undefined;
  }
  const was = fighterProfile(before);
  const now = fighterProfile(after);
  const known = new Set(was.features.map(({ id }) => id));
  const wind = (profile: FighterProfile) => ({
    uses: profile.secondWind.uses,
    modifier: profile.secondWind.healing.modifier,
  });
  return {
    from: before.level,
    to: after.level,
    maxHp: { before: was.maxHp, after: now.maxHp },
    proficiencyBonus: {
      before: was.proficiencyBonus,
      after: now.proficiencyBonus,
    },
    secondWind: { before: wind(was), after: wind(now) },
    weaponMasteries: {
      before: weaponMasteryCount(before.level),
      after: weaponMasteryCount(after.level),
    },
    features: now.features.filter(({ id }) => !known.has(id)),
    choices:
      pendingLevelChoice(after) === undefined
        ? []
        : ["ability-score-improvement", "weapon-mastery"],
  };
}

/**
 * The level whose choice (an Ability Score Improvement and one more weapon
 * mastery, #286) the sheet still owes, or undefined. A character that owes
 * one cannot start another adventure.
 */
export function pendingLevelChoice(
  sheet: Pick<FighterSheet, "level" | "abilityScoreImprovements">,
): Level | undefined {
  const next =
    ABILITY_SCORE_IMPROVEMENT_LEVELS[sheet.abilityScoreImprovements.length];
  return next !== undefined && next <= sheet.level ? next : undefined;
}

/**
 * The level-up card's view of the level a pending choice belongs to: from
 * the level below it to that level.
 */
export function pendingLevelUp(
  sheet: FighterSheet,
): LevelUpChanges | undefined {
  const level = pendingLevelChoice(sheet);
  if (level === undefined) {
    return undefined;
  }
  return levelUpChanges(
    { ...sheet, level: (level - 1) as Level },
    { ...sheet, level },
  );
}

const capMessage = (ability: Ability, score: number) =>
  `${titleCase(ability)} is ${score}: an Ability Score Improvement can't raise a score above ${ABILITY_SCORE_CAP}.`;

/** The weapons whose mastery `sheet` could add: every used one not yet mastered. */
export function masteryOptions(
  sheet: Pick<FighterSheet, "weaponMasteries">,
): readonly WeaponId[] {
  return MASTERY_WEAPONS.filter((id) => !sheet.weaponMasteries.includes(id));
}

function validateNewMastery(sheet: FighterSheet, value: unknown): WeaponId {
  if (
    typeof value !== "string" ||
    !(MASTERY_WEAPONS as readonly string[]).includes(value)
  ) {
    throw new Error("Choose a kind of weapon to master.");
  }
  const id = value as WeaponId;
  if (sheet.weaponMasteries.includes(id)) {
    throw new Error(
      `${sheet.name} already masters the ${WEAPONS[id].name.toLowerCase()}; choose another kind of weapon.`,
    );
  }
  return id;
}

/** The scores after `increase`, refusing any above ABILITY_SCORE_CAP. */
function improvedAbilities(
  abilities: Abilities,
  increase: AbilityScoreImprovement,
): Abilities {
  for (const ability of ABILITIES) {
    if (abilities[ability] + (increase[ability] ?? 0) > ABILITY_SCORE_CAP) {
      throw new Error(capMessage(ability, abilities[ability]));
    }
  }
  return Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      abilities[ability] + (increase[ability] ?? 0),
    ]),
  ) as Abilities;
}

/**
 * The sheet with its pending level choice made: the Ability Score
 * Improvement raises its scores (none above ABILITY_SCORE_CAP) and the new
 * mastery is added. Every number is derived again from the new scores, so a
 * Constitution increase raises the maximum hit points for every level, and
 * current hit points rise with them. Refused unless a choice is pending and
 * `choice` is complete and legal.
 */
export function applyLevelChoice(
  sheet: FighterSheet,
  choice: unknown,
): FighterSheet {
  if (pendingLevelChoice(sheet) === undefined) {
    throw new Error(`${sheet.name} has no level choice to make.`);
  }
  if (
    !isRecord(choice) ||
    Object.keys(choice).sort().join(",") !== "increase,mastery"
  ) {
    throw new Error("Invalid level choice.");
  }
  const increase = validateImprovement(choice.increase);
  const mastery = validateNewMastery(sheet, choice.mastery);
  const improved = {
    ...sheet,
    abilityScoreImprovements: [...sheet.abilityScoreImprovements, increase],
    abilities: improvedAbilities(sheet.abilities, increase),
    weaponMasteries: [...sheet.weaponMasteries, mastery],
  };
  const maxHp = fighterProfile(improved).maxHp;
  const gained = maxHp - fighterProfile(sheet).maxHp;
  return validateFighter({
    ...improved,
    hp: Math.min(maxHp, Math.max(0, sheet.hp + gained)),
  });
}

/** One ability's row in the level choice: its score before and after. */
export type LevelChoiceRow = Readonly<{
  ability: Ability;
  before: number;
  score: number;
  modifier: number;
  /** How far the score can still rise before ABILITY_SCORE_CAP. */
  room: number;
}>;

/** What the sheet's level-up card shows for the level choice made so far. */
export type LevelChoiceProjection = Readonly<{
  level: Level;
  rows: readonly LevelChoiceRow[];
  /** The weapons whose mastery can be added. */
  masteries: readonly WeaponId[];
  /** Why the choice is not finished yet; empty when it can be confirmed. */
  unfinished: Readonly<{ increase?: string; mastery?: string }>;
  /** Every number the finished choice changes, in words, once finished. */
  changes?: readonly string[];
}>;

/**
 * Projects a pending level choice for the sheet: each score and modifier for
 * the improvement chosen so far, the masteries offered, what is unfinished
 * (including an improvement past ABILITY_SCORE_CAP) and, once it is
 * finished, every change it makes. `mastery` is null until chosen.
 */
export function projectLevelChoice(
  sheet: FighterSheet,
  choice: Readonly<{ increase: unknown; mastery: unknown }>,
): LevelChoiceProjection {
  const level = pendingLevelChoice(sheet);
  if (level === undefined) {
    throw new Error(`${sheet.name} has no level choice to make.`);
  }
  const { increase, missing } = validatePartialImprovement(choice.increase);
  if (choice.mastery !== null) {
    validateNewMastery(sheet, choice.mastery);
  }
  const rows = ABILITIES.map((ability) => {
    const before = sheet.abilities[ability];
    const score = before + (increase[ability] ?? 0);
    return {
      ability,
      before,
      score,
      modifier: abilityModifier(Math.min(score, ABILITY_SCORE_CAP)),
      room: ABILITY_SCORE_CAP - before,
    };
  });
  const over = rows.find(({ score }) => score > ABILITY_SCORE_CAP);
  const unfinished = {
    ...(over !== undefined
      ? { increase: capMessage(over.ability, over.before) }
      : missing === 0
        ? {}
        : {
            increase:
              missing === 2
                ? "Choose the ability score to improve."
                : "Choose one more ability for +1.",
          }),
    ...(choice.mastery === null
      ? { mastery: "Choose a fourth kind of weapon to master." }
      : {}),
  };
  const projection = {
    level,
    rows,
    masteries: masteryOptions(sheet),
    unfinished,
  };
  if (Object.keys(unfinished).length > 0) {
    return projection;
  }
  return {
    ...projection,
    changes: levelChoiceChanges(
      sheet,
      applyLevelChoice(sheet, { increase, mastery: choice.mastery }),
    ),
  };
}

const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

function damageWords(damage: AttackProfile["damage"]): string {
  const { dice, sides, modifier } = damage;
  const added =
    modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` − ${-modifier}`;
  return `${dice}d${sides}${added}`;
}

function attackChange(
  label: string,
  was: AttackProfile | undefined,
  now: AttackProfile | undefined,
): readonly string[] {
  if (
    was === undefined ||
    now === undefined ||
    (was.bonus === now.bonus &&
      was.damage.modifier === now.damage.modifier &&
      was.mastery === now.mastery)
  ) {
    return [];
  }
  const mastery =
    now.mastery === was.mastery
      ? ""
      : `, now with ${now.mastery ?? "no mastery"}`;
  return [
    `${label}: ${signed(was.bonus)} → ${signed(now.bonus)} to hit, ${damageWords(was.damage)} → ${damageWords(now.damage)} ${now.damage.type}${mastery}.`,
  ];
}

/**
 * Every number that differs from `before` to `after` once a level choice is
 * made, in words: scores and modifiers, hit points, AC, initiative, attacks,
 * saving throws, skills, carrying capacity and the mastery added.
 */
export function levelChoiceChanges(
  before: FighterSheet,
  after: FighterSheet,
): readonly string[] {
  const was = fighterProfile(before);
  const now = fighterProfile(after);
  const lines: string[] = [];
  for (const ability of ABILITIES) {
    if (before.abilities[ability] !== after.abilities[ability]) {
      lines.push(
        `${titleCase(ability)} ${before.abilities[ability]} → ${after.abilities[ability]} (modifier ${signed(was.modifiers[ability])} → ${signed(now.modifiers[ability])}).`,
      );
    }
  }
  if (was.maxHp !== now.maxHp) {
    lines.push(
      `Hit points ${was.maxHp} → ${now.maxHp}: the Constitution modifier counts at every level.`,
    );
  }
  if (was.armorClass !== now.armorClass) {
    lines.push(`AC ${was.armorClass} → ${now.armorClass}.`);
  }
  if (was.initiative !== now.initiative) {
    lines.push(
      `Initiative ${signed(was.initiative)} → ${signed(now.initiative)}.`,
    );
  }
  lines.push(
    ...attackChange(now.attack.weapon, was.attack, now.attack),
    ...attackChange(
      `${now.lightAttack?.weapon ?? ""} (extra attack)`,
      was.lightAttack,
      now.lightAttack,
    ),
  );
  for (const ability of ABILITIES) {
    const from = was.savingThrows[ability].bonus;
    const to = now.savingThrows[ability].bonus;
    if (from !== to) {
      lines.push(
        `${titleCase(ability)} saving throw ${signed(from)} → ${signed(to)}.`,
      );
    }
  }
  for (const skill of now.skills) {
    const from = was.skills.find(({ id }) => id === skill.id)!.bonus;
    if (from !== skill.bonus) {
      lines.push(`${skill.name} ${signed(from)} → ${signed(skill.bonus)}.`);
    }
  }
  const carried = fighterCarrying(before).capacity;
  const carries = fighterCarrying(after).capacity;
  if (carried !== carries) {
    lines.push(`Carrying capacity ${carried} → ${carries} lb.`);
  }
  for (const id of after.weaponMasteries) {
    if (!before.weaponMasteries.includes(id)) {
      const mastery = WEAPONS[id].mastery;
      lines.push(
        `Weapon Mastery: ${WEAPONS[id].name} (${mastery}): ${MASTERIES[mastery].text} It applies only while you wield it.`,
      );
    }
  }
  return lines;
}
