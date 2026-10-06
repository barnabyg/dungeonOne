/**
 * The 5e Fighter (SRD 5.2) at levels 1–3, created from 4d6-drop-lowest.
 *
 * Pure rules: dice come only from the `RandomSource` passed in, and every
 * derived number (HP, AC, attack, saves, skills, features) is computed from a
 * validated sheet. `docs/character-rules.md` records these numbers.
 *
 * A sheet keeps what the character holds (its equipment, stowed gear,
 * treasure and purse) apart from its ledger of what it has earned: each
 * treasure, coin or gear found and each XP award credited, once. Settling a
 * surviving adventure (`settleFighter`) replaces the possessions with what
 * the character holds at the end and adds to the ledger, so a find stays
 * earned after the item is gone.
 */
import {
  equipmentProfile,
  FIGHTER_MASTERY_COUNT,
  formatCoins,
  isItemId,
  isKitId,
  MAX_STOWED,
  itemName,
  KIT_IDS,
  kitPrice,
  MASTERIES,
  MASTERY_WEAPONS,
  readLoadout,
  STARTING_KITS,
  WEAPONS,
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

/** SRD 5.2 Fighting Style feats, without Archery: it needs ranged weapons (#225). */
export const FIGHTING_STYLES = {
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
 * as `adventure/item`, so each is found once.
 */
export type TreasureRecord = Readonly<{
  id: string;
  name: string;
  description: string;
}>;

/**
 * One XP award: winning an encounter (`adventure/encounter/id`) or reaching
 * an ending (`adventure/ending/id`). Each is credited once per character.
 */
export type XpAward = Readonly<{ id: string; name: string; xp: number }>;

/** What a character holds: its equipment, its stowed gear, its treasure and its purse. */
export type Possessions = Readonly<{
  /** What it has equipped: armour, then the weapon it attacks with, then any second weapon. */
  equipment: readonly ItemId[];
  /** Catalogue gear it carries but has not equipped. */
  stowed: readonly ItemId[];
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
  /** The kinds of weapon whose mastery it can use. */
  weaponMasteries: readonly WeaponId[];
  /** What it has equipped; see `Possessions`. */
  equipment: readonly ItemId[];
  /** The catalogue gear it carries but has not equipped. */
  stowed: readonly ItemId[];
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
  "abilities",
  "skills",
  "fightingStyle",
  "weaponMasteries",
  "equipment",
  "stowed",
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
        Object.keys(entry).sort().join(",") === "description,id,name" &&
        typeof entry.id === "string" &&
        TREASURE_ID.test(entry.id) &&
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
    weaponMasteries: validateMasteries(choices.masteries),
    equipment: STARTING_KITS[validateKit(choices.kit)].equipment,
    stowed: [],
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
  try {
    validateMasteries(sheet.weaponMasteries);
  } catch {
    throw new Error("Unsupported weapon mastery.");
  }
  try {
    readLoadout(sheet.equipment);
  } catch {
    throw new Error("Unsupported character equipment.");
  }
  if (
    !Array.isArray(sheet.stowed) ||
    sheet.stowed.length > MAX_STOWED ||
    !sheet.stowed.every(isItemId)
  ) {
    throw new Error("Invalid stowed gear.");
  }
  validateTreasure(sheet.treasure);
  if (!Number.isSafeInteger(sheet.purse) || sheet.purse < 0) {
    throw new Error("Invalid purse.");
  }
  validateIds(sheet.finds, TREASURE_ID, "Invalid finds.");
  validateIds(sheet.xpAwards, AWARD_ID, "Invalid XP awards.");
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
  features: readonly FighterFeature[];
  nextLevelXp: number | undefined;
}>;

const SAVE_PROFICIENCIES: readonly Ability[] = ["strength", "constitution"];

/** Every number derived from a sheet's scores, level, equipment and choices. */
export function fighterProfile(
  sheet: Pick<
    FighterSheet,
    | "abilities"
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
      text: `Bonus action: regain 1d10 + ${level} HP. 2 uses. ${FEATURE_USES_RULE}`,
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
    secondWind: { uses: 2, healing: { dice: 1, sides: 10, modifier: level } },
    actionSurgeUses: level >= 2 ? 1 : 0,
    features,
    nextLevelXp: nextLevelXp(level),
  };
}

/** What the character holds, as an adventure starts with it. */
export function possessionsOf(sheet: FighterSheet): Possessions {
  return {
    equipment: sheet.equipment,
    stowed: sheet.stowed,
    treasure: sheet.treasure,
    purse: sheet.purse,
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
    treasure: settlement.possessions.treasure.map(
      ({ id, name, description }) => ({ id, name, description }),
    ),
    purse: settlement.possessions.purse,
    finds: [...sheet.finds, ...finds],
    xpAwards: [...sheet.xpAwards, ...awards.map(({ id }) => id)],
  });
}

/** What changed when a character went up a level, for the level-up card. */
export type LevelUpChanges = Readonly<{
  from: Level;
  to: Level;
  maxHp: Readonly<{ before: number; after: number }>;
  /** The class features gained, in the sheet's order. */
  features: readonly FighterFeature[];
}>;

/** The changes from `before` to `after`, or undefined if the level held. */
export function levelUpChanges(
  before: FighterSheet,
  after: FighterSheet,
): LevelUpChanges | undefined {
  if (after.level === before.level) {
    return undefined;
  }
  const was = fighterProfile(before);
  const now = fighterProfile(after);
  const known = new Set(was.features.map(({ id }) => id));
  return {
    from: before.level,
    to: after.level,
    maxHp: { before: was.maxHp, after: now.maxHp },
    features: now.features.filter(({ id }) => !known.has(id)),
  };
}
