/**
 * A 5e character (SRD 5.2) at levels 1–5, created from 4d6-drop-lowest.
 *
 * Pure rules: dice come only from the `RandomSource` passed in, and every
 * derived number (HP, AC, attack, saves, skills, features) is computed from a
 * validated sheet and its class's definition (#300). A sheet names its class
 * by id; nothing here asks which class it is. `docs/character-rules.md`
 * records these numbers.
 *
 * A sheet keeps what the character holds (its equipment, stowed gear,
 * ammunition, treasure and purse) apart from its ledger of what it has
 * earned: each treasure, coin or gear found and each XP award credited,
 * once. Settling a surviving adventure (`settleCharacter`) replaces the
 * possessions with what the character holds at the end and adds to the
 * ledger, so a find stays earned after the item is gone.
 */
import {
  ABILITIES,
  ABILITY_SCORE_CAP,
  fightingStyleUse,
  FIGHTING_STYLES,
  SKILLS,
  titleCase,
  type Abilities,
  type Ability,
  type AbilityScoreImprovement,
  type ClassDefinition,
  type ClassId,
  type DivineOrderDefinition,
  type DivineOrderId,
  type FeatureDefinition,
  type FeatureEffect,
  type FeatureRecovery,
  type FightingStyle,
  type FightingStyleUse,
  type Level,
  type SkillId,
  type SpellChoices,
  SPELL_SLOT_RECOVERY,
} from "./class-5e.js";
import {
  AMMUNITION,
  carryingCapacity,
  equipmentProfile,
  formatCoins,
  isItemId,
  itemName,
  kitItems,
  kitPrice,
  loadWeight,
  MASTERIES,
  MASTERY_WEAPONS,
  proficientWith,
  readLoadout,
  STARTING_KITS,
  TOOL_ITEMS,
  TREASURE_WEIGHT,
  untrainedArmour,
  untrainedSource,
  WEAPONS,
  type Ammunition,
  type AmmunitionId,
  type ArmourCategory,
  type AttackProfile,
  type ItemId,
  type KitData,
  type KitId,
  type ToolId,
  type WeaponId,
  type WeaponProficiency,
} from "./equipment-5e.js";
import { CLERIC } from "./cleric-5e.js";
import { FIGHTER } from "./fighter-5e.js";
import type { RandomSource } from "./random.js";
import { ROGUE } from "./rogue-5e.js";
import {
  isSpellId,
  ordinal,
  slotLevelOf,
  slotUsesId,
  SPELLS,
  type SpellId,
} from "./spells-5e.js";
import { TEST_CASTER_CLASS } from "./test-caster-class-5e.js";
import { WIZARD } from "./wizard-5e.js";

/**
 * Every class a sheet can name, by id, in the order creation offers them.
 * Creation never offers a test-only class (#336): see `OFFERED_CLASS_IDS`.
 */
export const CLASSES: Readonly<Record<ClassId, ClassDefinition>> = {
  fighter: FIGHTER,
  rogue: ROGUE,
  cleric: CLERIC,
  wizard: WIZARD,
  "test-caster": TEST_CASTER_CLASS,
};

/** The classes creation offers, in order: every class but test-only ones. */
export const OFFERED_CLASS_IDS: readonly ClassId[] = (
  Object.keys(CLASSES) as ClassId[]
).filter((id) => CLASSES[id].testOnly !== true);

/**
 * The class creation starts with, and the balance harness, the gate and the
 * career simulation play unless told otherwise.
 */
export const DEFAULT_CLASS: ClassId = "fighter";

/** The definition of the class a sheet names. */
export function classOf(sheet: Pick<CharacterSheet, "class">): ClassDefinition {
  return CLASSES[sheet.class];
}

export function isClassId(value: unknown): value is ClassId {
  return typeof value === "string" && Object.hasOwn(CLASSES, value);
}

/** Four d6 in the order rolled; the lowest one is dropped. */
export type AbilityRoll = readonly [number, number, number, number];
/** The six rolls of one creation, in the order rolled. */
export type RolledDice = readonly AbilityRoll[];

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

export type BackgroundIncrease = Readonly<Partial<Record<Ability, 1 | 2>>>;
/**
 * The choices a level with an Ability Score Improvement asks for after
 * settling (#286): the improvement and, when the level brings one (the
 * Fighter's level 4, not the Rogue's, #308), its new weapon mastery.
 */
export type LevelChoice = Readonly<{
  increase: AbilityScoreImprovement;
  /**
   * The new kind of weapon mastered, from `MASTERY_WEAPONS`: exactly when
   * the level brings one.
   */
  mastery?: WeaponId;
}>;
export type Placement = Readonly<Record<Ability, number>>;

export type CreationChoices = Readonly<{
  /** For each ability, the index of the roll placed on it. */
  placement: Placement;
  increase: BackgroundIncrease;
  skills: readonly SkillId[];
  /** Exactly for a class with a Fighting Style. */
  fightingStyle?: FightingStyle;
  /** The skills chosen for Expertise, exactly for a class with it (#306). */
  expertise?: readonly SkillId[];
  /** Cantrips and prepared spells, exactly for a class that casts (#336). */
  spells?: SpellChoices;
  /** The Divine Order, exactly for a class with one (#339). */
  divineOrder?: DivineOrderId;
  /** The spellbook's spells, exactly for a class with one (#340). */
  spellbook?: readonly SpellId[];
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
 * One XP award: winning an encounter, or slipping past one whose module
 * awards XP for it (#302), under the encounter's id (`adventure/encounter/id`),
 * or reaching an ending (`adventure/ending/id`). Each is credited once per
 * character.
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

export type CharacterSheet = Readonly<{
  id: string;
  name: string;
  /** Its class, whose definition (`CLASSES`) every derived number comes from. */
  class: ClassId;
  level: Level;
  xp: number;
  hp: number;
  /** The four dice placed on each ability. */
  abilityRolls: Readonly<Record<Ability, AbilityRoll>>;
  backgroundIncrease: BackgroundIncrease;
  /**
   * The Ability Score Improvements chosen, in level order (#286). A sheet
   * that has reached a level with one but not chosen it owes its level choice
   * (`pendingLevelChoice`).
   */
  abilityScoreImprovements: readonly AbilityScoreImprovement[];
  /**
   * Each score is its kept three dice plus its background increase and its
   * Ability Score Improvements.
   */
  abilities: Abilities;
  skills: readonly SkillId[];
  /** Its Fighting Style, present exactly when its class has one. */
  fightingStyle?: FightingStyle;
  /**
   * Its proficient skills whose proficiency bonus is doubled, present
   * exactly when its class has Expertise (#306).
   */
  expertise?: readonly SkillId[];
  /**
   * The cantrips it knows and the spells it has prepared, present exactly
   * when its class casts spells (#336).
   */
  spells?: SpellChoices;
  /** Its Divine Order, present exactly when its class has one (#339). */
  divineOrder?: DivineOrderId;
  /**
   * The levelled spells in its spellbook (#340), present exactly when its
   * class has one: it prepares only these.
   */
  spellbook?: readonly SpellId[];
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
  "weaponMasteries",
  "equipment",
  "stowed",
  "ammunition",
  "treasure",
  "purse",
  "finds",
  "xpAwards",
];
/** The keys a sheet has exactly when its class makes the choice (#306). */
export const CLASS_CHOICE_KEYS: readonly string[] = [
  "fightingStyle",
  "expertise",
  "spells",
  "divineOrder",
  "spellbook",
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

/**
 * The level `xp` reaches, up to `cap`: `MAX_LEVEL`, or a class's own
 * `maxLevel` (#339).
 */
export function levelForXp(xp: number, cap: Level = MAX_LEVEL): Level {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new Error("Invalid experience points.");
  }
  let level: Level = 1;
  for (const next of [2, 3, 4, 5] as const) {
    if (next <= cap && xp >= LEVEL_XP[next]) {
      level = next;
    }
  }
  return level;
}

/**
 * XP needed for the next level, or undefined at the highest level: `cap`,
 * `MAX_LEVEL` or a class's own `maxLevel` (#339).
 */
export function nextLevelXp(
  level: Level,
  cap: Level = MAX_LEVEL,
): number | undefined {
  return level >= cap ? undefined : LEVEL_XP[(level + 1) as Level];
}

/** The highest level `definition` reaches yet (#339). */
export function classMaxLevel(definition: ClassDefinition): Level {
  return definition.maxLevel ?? MAX_LEVEL;
}

/** The levels at which `definition` brings an Ability Score Improvement. */
function improvementLevels(definition: ClassDefinition): readonly Level[] {
  return effects(definition, MAX_LEVEL, "ability-score-improvement").map(
    ({ feature }) => feature.level,
  );
}

/** How many Ability Score Improvements a character of `level` has. */
function abilityScoreImprovementCount(
  definition: ClassDefinition,
  level: Level,
): number {
  return improvementLevels(definition).filter((at) => at <= level).length;
}

/**
 * How many kinds of weapon a sheet masters: its class's count at the level
 * of its latest level choice made, or at level 1. A sheet that owes a level
 * choice has not yet chosen that level's new mastery (#286).
 */
function masteriesHeld(
  definition: ClassDefinition,
  improvements: number,
): number {
  const level =
    improvements === 0 ? 1 : improvementLevels(definition)[improvements - 1]!;
  return definition.weaponMasteries[level];
}

/** A feature a character has, and the subclass it comes from, if any. */
type HeldFeature = FeatureDefinition & Readonly<{ subclass?: string }>;

/**
 * Each definition's features by level, worked out once: a profile is
 * derived many times a step while the runtime dry-runs actions.
 */
const featuresByLevel = new WeakMap<
  ClassDefinition,
  Map<Level, readonly HeldFeature[]>
>();

/**
 * The class's features and its subclass's, gained by `level`: by level,
 * the class's before the subclass's at the same level, each in the order
 * the definition lists them. The first subclass is taken until there is a
 * choice of one.
 */
function classFeatures(
  definition: ClassDefinition,
  level: Level,
): readonly HeldFeature[] {
  let byLevel = featuresByLevel.get(definition);
  if (byLevel === undefined) {
    byLevel = new Map();
    featuresByLevel.set(definition, byLevel);
  }
  let held = byLevel.get(level);
  if (held === undefined) {
    const subclass = definition.subclasses[0];
    held = [
      ...definition.features,
      ...(subclass?.features.map((feature) => ({
        ...feature,
        subclass: subclass.name,
      })) ?? []),
    ]
      .filter((feature) => feature.level <= level)
      .sort((a, b) => a.level - b.level);
    byLevel.set(level, held);
  }
  return held;
}

/** The effects of the features a character of `level` has, of one kind. */
function effects<K extends FeatureEffect["kind"]>(
  definition: ClassDefinition,
  level: Level,
  kind: K,
): readonly Readonly<{
  feature: HeldFeature;
  effect: Extract<FeatureEffect, { kind: K }>;
}>[] {
  return classFeatures(definition, level).flatMap((feature) =>
    ([] as readonly FeatureEffect[])
      .concat(feature.effect ?? [])
      .filter(
        (effect): effect is Extract<FeatureEffect, { kind: K }> =>
          effect.kind === kind,
      )
      .map((effect) => ({ feature, effect })),
  );
}

/** Whether `definition` chooses a Fighting Style at level 1. */
function hasFightingStyle(definition: ClassDefinition): boolean {
  return effects(definition, 1, "fighting-style").length > 0;
}

/** How many skills a character of `level` has Expertise in (#306). */
function expertiseCount(definition: ClassDefinition, level: Level): number {
  return effects(definition, level, "expertise").reduce(
    (sum, { effect }) => sum + effect.count,
    0,
  );
}

/** The Divine Order (#339) `divineOrder` names in `definition`, if any. */
function divineOrderOf(
  definition: ClassDefinition,
  divineOrder: DivineOrderId | undefined,
): DivineOrderDefinition | undefined {
  return divineOrder === undefined
    ? undefined
    : definition.divineOrders?.[divineOrder];
}

/**
 * The armour training and weapon proficiencies of a character of
 * `definition`: its class's, and its Divine Order's (#339).
 */
export function trainingOf(
  definition: ClassDefinition,
  divineOrder: DivineOrderId | undefined,
): Readonly<{
  armourTraining: readonly ArmourCategory[];
  weaponProficiencies: readonly WeaponProficiency[];
}> {
  const order = divineOrderOf(definition, divineOrder);
  return {
    armourTraining: [
      ...definition.armourTraining,
      ...(order?.armourTraining ?? []),
    ],
    weaponProficiencies: [
      ...definition.weaponProficiencies,
      ...(order?.weaponProficiencies ?? []),
    ],
  };
}

/**
 * What a sheet's Divine Order adds to a check with `skill` (#339): the
 * Thaumaturge's Wisdom modifier, at least +1, to Arcana and Religion, named
 * after the order; undefined when it adds nothing.
 */
export function orderCheckBonus(
  sheet: Pick<CharacterSheet, "class" | "divineOrder" | "abilities">,
  skill: SkillId,
): Readonly<{ source: string; value: number }> | undefined {
  const order = divineOrderOf(classOf(sheet), sheet.divineOrder);
  const bonus = order?.checkBonus;
  if (order === undefined || bonus === undefined) {
    return undefined;
  }
  return bonus.skills.includes(skill)
    ? {
        source: order.name,
        value: Math.max(
          bonus.minimum,
          abilityModifier(sheet.abilities[bonus.ability]),
        ),
      }
    : undefined;
}

/**
 * The weapons whose mastery `definition` can choose: every catalogue weapon
 * whose mastery is used and that the class is proficient with (#306).
 */
export function classMasteryWeapons(
  definition: ClassDefinition,
): readonly WeaponId[] {
  return MASTERY_WEAPONS.filter((id) =>
    proficientWith(definition.weaponProficiencies, id),
  );
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
 * The placement a fresh creation starts with: rolls sorted by kept total,
 * highest first, go down the class's ability priority. Tied totals keep their
 * roll order, so the earlier roll takes the higher-priority ability.
 */
export function defaultPlacement(
  dice: RolledDice,
  definition: ClassDefinition = CLASSES[DEFAULT_CLASS],
): Placement {
  const order = validateDice(dice)
    .map((roll, index) => ({ total: keptTotal(roll), index }))
    .sort((a, b) => b.total - a.total || a.index - b.index);
  return Object.fromEntries(
    definition.abilityPriority.map((ability, rank) => [
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

const skillChoice = ({ name, skillChoices }: ClassDefinition) =>
  `Choose ${skillChoices.count} different ${name} skill proficiencies.`;

/** Different skills of the class's options, however many are ticked so far. */
function validatePartialSkills(
  definition: ClassDefinition,
  value: unknown,
): readonly SkillId[] {
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    !value.every(
      (skill) =>
        typeof skill === "string" &&
        (definition.skillChoices.options as readonly string[]).includes(skill),
    )
  ) {
    throw new Error(skillChoice(definition));
  }
  return [...(value as SkillId[])];
}

function validateSkills(
  definition: ClassDefinition,
  value: unknown,
): readonly SkillId[] {
  const skills = validatePartialSkills(definition, value);
  if (skills.length !== definition.skillChoices.count) {
    throw new Error(skillChoice(definition));
  }
  return skills;
}

function validateFightingStyle(value: unknown): FightingStyle {
  if (typeof value !== "string" || !Object.hasOwn(FIGHTING_STYLES, value)) {
    throw new Error("Choose a supported Fighting Style.");
  }
  return value as FightingStyle;
}

/**
 * A Divine Order for a class with one (#339); none for any other.
 */
function validateDivineOrder(
  definition: ClassDefinition,
  value: unknown,
): DivineOrderId | undefined {
  const orders = definition.divineOrders;
  if (orders === undefined) {
    if (value !== undefined) {
      throw new Error(`A ${definition.name} has no Divine Order.`);
    }
    return undefined;
  }
  if (typeof value !== "string" || !Object.hasOwn(orders, value)) {
    throw new Error("Choose a Divine Order.");
  }
  return value as DivineOrderId;
}

/**
 * A spellbook for a class with one (#340), none for any other: as many
 * different levelled spells from the class's list as its spellbook holds
 * (up to that many when `partial`), each of a level it has slots for at
 * `level`.
 */
function validateSpellbook(
  definition: ClassDefinition,
  level: Level,
  value: unknown,
  partial = false,
): readonly SpellId[] | undefined {
  const casting = definition.spellcasting;
  const count = casting?.spellbook;
  if (casting === undefined || count === undefined) {
    if (value !== undefined) {
      throw new Error(`A ${definition.name} has no spellbook.`);
    }
    return undefined;
  }
  const highest = casting.slots[level].length;
  if (
    !Array.isArray(value) ||
    (partial ? value.length > count : value.length !== count) ||
    new Set(value).size !== value.length ||
    !value.every(
      (id) =>
        isSpellId(id) &&
        casting.list.includes(id) &&
        SPELLS[id].level >= 1 &&
        SPELLS[id].level <= highest,
    )
  ) {
    throw new Error(
      `A level ${level} ${definition.name}'s spellbook holds ${count} different levelled spells from its list that it has slots for.`,
    );
  }
  return [...(value as SpellId[])];
}

/**
 * How many cantrips and prepared spells a caster of `level` has (#336):
 * its class's counts, with its Divine Order's extra cantrips (#339).
 */
export function spellCounts(
  definition: ClassDefinition,
  level: Level,
  divineOrder?: DivineOrderId,
): Readonly<{ cantrips: number; prepared: number }> {
  const casting = definition.spellcasting;
  if (casting === undefined) {
    return { cantrips: 0, prepared: 0 };
  }
  const order = divineOrderOf(definition, divineOrder);
  return {
    cantrips: casting.cantrips[level] + (order?.extraCantrips ?? 0),
    prepared: casting.prepared[level],
  };
}

/**
 * A caster's spell choices at `level` (#336), however many are ticked so
 * far when `partial`: up to (exactly, unless partial) its count of
 * distinct cantrips and of distinct levelled spells it has slots for, each
 * on the class's list, and in its `spellbook` for a class with one (#340).
 * A class that casts nothing has none.
 */
function validateSpellChoices(
  definition: ClassDefinition,
  level: Level,
  value: unknown,
  {
    divineOrder,
    partial = false,
    spellbook,
  }: Readonly<{
    divineOrder?: DivineOrderId | undefined;
    partial?: boolean;
    spellbook?: readonly SpellId[] | undefined;
  }> = {},
): SpellChoices | undefined {
  const casting = definition.spellcasting;
  if (casting === undefined) {
    if (value !== undefined) {
      throw new Error(`A ${definition.name} casts no spells.`);
    }
    return undefined;
  }
  const choices = value as SpellChoices;
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== "cantrips,prepared" ||
    !Array.isArray(choices.cantrips) ||
    !Array.isArray(choices.prepared)
  ) {
    throw new Error("Invalid spell choices.");
  }
  const highest = casting.slots[level].length;
  const counts = spellCounts(definition, level, divineOrder);
  const pick = (
    ids: readonly unknown[],
    count: number,
    fits: (id: SpellId) => boolean,
    what: string,
  ): SpellId[] => {
    if (
      (partial ? ids.length > count : ids.length !== count) ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => isSpellId(id) && casting.list.includes(id) && fits(id))
    ) {
      throw new Error(
        `A level ${level} ${definition.name} ${what} ${count} different spells from its list.`,
      );
    }
    return [...(ids as SpellId[])];
  };
  const cantrips = pick(
    choices.cantrips,
    counts.cantrips,
    (id) => SPELLS[id].level === 0,
    "knows cantrips:",
  );
  const prepared = pick(
    choices.prepared,
    counts.prepared,
    (id) => SPELLS[id].level >= 1 && SPELLS[id].level <= highest,
    "prepares levelled spells it has slots for:",
  );
  // A Wizard prepares only spells in its spellbook (#340).
  if (
    spellbook !== undefined &&
    !prepared.every((id) => spellbook.includes(id))
  ) {
    throw new Error(
      `A ${definition.name} prepares only spells in its spellbook.`,
    );
  }
  return { cantrips, prepared };
}

/** A Fighting Style for a class with one; none for any other. */
function validateClassStyle(
  definition: ClassDefinition,
  value: unknown,
): FightingStyle | undefined {
  if (hasFightingStyle(definition)) {
    return validateFightingStyle(value);
  }
  if (value !== undefined) {
    throw new Error(`A ${definition.name} has no Fighting Style.`);
  }
  return undefined;
}

const expertiseChoice = (count: number) =>
  `Choose ${count} of your skill proficiencies for Expertise.`;

/**
 * Different skills of `skills` chosen for Expertise, however many of
 * `count` are ticked so far; none for a class without it (#306).
 */
function validatePartialExpertise(
  definition: ClassDefinition,
  count: number,
  skills: readonly SkillId[],
  value: unknown,
): readonly SkillId[] | undefined {
  if (count === 0) {
    if (value !== undefined) {
      throw new Error(`A ${definition.name} has no Expertise.`);
    }
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length > count ||
    new Set(value).size !== value.length ||
    !value.every(
      (skill) =>
        typeof skill === "string" &&
        (skills as readonly string[]).includes(skill),
    )
  ) {
    throw new Error(expertiseChoice(count));
  }
  return [...(value as SkillId[])];
}

function validateExpertise(
  definition: ClassDefinition,
  count: number,
  skills: readonly SkillId[],
  value: unknown,
): readonly SkillId[] | undefined {
  const expertise = validatePartialExpertise(definition, count, skills, value);
  if (expertise !== undefined && expertise.length !== count) {
    throw new Error(expertiseChoice(count));
  }
  return expertise;
}

function validateKit(definition: ClassDefinition, value: unknown): KitId {
  if (!(definition.kits as readonly unknown[]).includes(value)) {
    throw new Error("Choose one of the starting kits.");
  }
  return value as KitId;
}

const masteryChoice = (count: number) =>
  `Choose ${count} different kinds of weapon to master.`;

/**
 * Different weapons whose mastery is used, however many of the class's
 * level-1 count are ticked so far.
 */
function validatePartialMasteries(
  definition: ClassDefinition,
  value: unknown,
): readonly WeaponId[] {
  const count = definition.weaponMasteries[1];
  const options: readonly string[] = classMasteryWeapons(definition);
  if (
    !Array.isArray(value) ||
    value.length > count ||
    new Set(value).size !== value.length ||
    !value.every((id) => typeof id === "string" && options.includes(id))
  ) {
    throw new Error(masteryChoice(count));
  }
  return [...(value as WeaponId[])];
}

function validateMasteries(
  definition: ClassDefinition,
  value: unknown,
): readonly WeaponId[] {
  const masteries = validatePartialMasteries(definition, value);
  if (masteries.length !== definition.weaponMasteries[1]) {
    throw new Error(masteryChoice(definition.weaponMasteries[1]));
  }
  return masteries;
}

/**
 * A sheet's masteries: `count` different weapons whose mastery is used and
 * that its class is proficient with.
 */
function validateSheetMasteries(
  definition: ClassDefinition,
  value: unknown,
  count: number,
): readonly WeaponId[] {
  const options: readonly string[] = classMasteryWeapons(definition);
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    new Set(value).size !== value.length ||
    !value.every((id) => typeof id === "string" && options.includes(id))
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

/**
 * A level 1 character of class `classId` with 0 XP at full health from one
 * creation's dice.
 */
export function buildCharacter(
  id: string,
  name: string,
  dice: RolledDice,
  choices: CreationChoices,
  classId: ClassId = DEFAULT_CLASS,
): CharacterSheet {
  const definition = CLASSES[classId];
  const rolled = validateDice(dice);
  const placement = validatePlacement(choices.placement);
  const increase = validateIncrease(choices.increase);
  const abilityRolls = Object.fromEntries(
    ABILITIES.map((ability) => [ability, rolled[placement[ability]]!]),
  ) as Record<Ability, AbilityRoll>;
  const skills = validateSkills(definition, choices.skills);
  const fightingStyle = validateClassStyle(definition, choices.fightingStyle);
  const expertise = validateExpertise(
    definition,
    expertiseCount(definition, 1),
    skills,
    choices.expertise,
  );
  const divineOrder = validateDivineOrder(definition, choices.divineOrder);
  const spellbook = validateSpellbook(definition, 1, choices.spellbook);
  const spells = validateSpellChoices(definition, 1, choices.spells, {
    divineOrder,
    spellbook,
  });
  const base = {
    id,
    name: name.trim(),
    class: classId,
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
    skills,
    ...(fightingStyle === undefined ? {} : { fightingStyle }),
    ...(expertise === undefined ? {} : { expertise }),
    ...(spells === undefined ? {} : { spells }),
    ...(divineOrder === undefined ? {} : { divineOrder }),
    ...(spellbook === undefined ? {} : { spellbook }),
    weaponMasteries: validateMasteries(definition, choices.masteries),
    ...(() => {
      const kit: KitData = STARTING_KITS[validateKit(definition, choices.kit)];
      return { equipment: kit.equipment, stowed: kit.stowed ?? [] };
    })(),
    ammunition: { arrows: 0, bolts: 0 },
    treasure: [],
    purse: 0,
    finds: [],
    xpAwards: [],
  };
  return validateCharacter({ ...base, hp: characterProfile(base).maxHp });
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
   * Expertise ticked, the limit, and whether no more can be ticked, for a
   * class with Expertise (#306).
   */
  expertise?: Readonly<{ chosen: number; limit: number; full: boolean }>;
  /**
   * Cantrips and prepared spells ticked, the limits, and whether no more
   * can be ticked, for a class that casts (#339).
   */
  spells?: Readonly<{
    cantrips: Readonly<{ chosen: number; limit: number; full: boolean }>;
    prepared: Readonly<{ chosen: number; limit: number; full: boolean }>;
    /** The spellbook's spells, for a class with one (#340). */
    spellbook?: Readonly<{ chosen: number; limit: number; full: boolean }>;
  }>;
  /**
   * Every starting kit of the class with the AC and attacks it gives these
   * scores, Fighting Style and the masteries ticked so far.
   */
  kits: readonly KitPreview[];
  /**
   * Every Fighting Style, and whether it applies with the kit chosen; none
   * for a class without one.
   */
  fightingStyles: readonly FightingStyleUse[];
  /** Why a choice is not finished yet, keyed by the choice; empty when saving can go ahead. */
  unfinished: Readonly<{
    increase?: string;
    skills?: string;
    expertise?: string;
    spells?: string;
    masteries?: string;
  }>;
  /**
   * The sheet's scores, profile and the weight its kit makes it carry,
   * present only when nothing is unfinished.
   */
  sheet?: Readonly<{
    abilities: Abilities;
    profile: CharacterProfile;
    carrying: Carrying;
  }>;
}>;

/**
 * Projects a creation's choices for the page: every row's score, modifier
 * and cap, and the skill limit, even while the +1 to three or the skills are
 * still being ticked. Choices no page could send are refused as by
 * `buildCharacter`, whose sheet is included once every choice is complete.
 */
export function projectCreation(
  dice: RolledDice,
  choices: CreationChoices,
  classId: ClassId = DEFAULT_CLASS,
): CreationProjection {
  const definition = CLASSES[classId];
  const skillCount = definition.skillChoices.count;
  const masteryCount = definition.weaponMasteries[1];
  const rolled = validateDice(dice);
  const placement = validatePlacement(choices.placement);
  const { increase, missing } = validatePartialIncrease(choices.increase);
  const skills = validatePartialSkills(definition, choices.skills);
  const fightingStyle = validateClassStyle(definition, choices.fightingStyle);
  const expertiseLimit = expertiseCount(definition, 1);
  // Expertise is among the skills ticked so far; untick a skill and its
  // Expertise must go too.
  const expertise = validatePartialExpertise(
    definition,
    expertiseLimit,
    skills,
    choices.expertise,
  );
  const kitChosen = validateKit(definition, choices.kit);
  const masteries = validatePartialMasteries(definition, choices.masteries);
  const divineOrder = validateDivineOrder(definition, choices.divineOrder);
  const training = trainingOf(definition, divineOrder);
  // Spells ticked so far (#339); the Divine Order may add a cantrip. A
  // Wizard prepares from the spells ticked for its spellbook (#340).
  const spellbook = validateSpellbook(definition, 1, choices.spellbook, true);
  const spells = validateSpellChoices(definition, 1, choices.spells, {
    divineOrder,
    partial: true,
    spellbook,
  });
  const spellLimits = spellCounts(definition, 1, divineOrder);
  const spellbookLimit = definition.spellcasting?.spellbook ?? 0;
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
    ...(skills.length === skillCount
      ? {}
      : {
          skills: `Choose ${skillCount} skills; ${skills.length} chosen.`,
        }),
    ...(expertise === undefined || expertise.length === expertiseLimit
      ? {}
      : {
          expertise: `Choose ${expertiseLimit} skills for Expertise; ${expertise.length} chosen.`,
        }),
    ...(spells === undefined ||
    (spells.cantrips.length === spellLimits.cantrips &&
      spells.prepared.length === spellLimits.prepared &&
      (spellbook?.length ?? 0) === spellbookLimit)
      ? {}
      : {
          // A Wizard's spellbook first (#340).
          spells:
            spellbook === undefined
              ? `Choose ${spellLimits.cantrips} cantrips and ${spellLimits.prepared} spells to prepare; ${spells.cantrips.length} and ${spells.prepared.length} chosen.`
              : `Choose ${spellLimits.cantrips} cantrips, ${spellbookLimit} spells for your spellbook and ${spellLimits.prepared} of them to prepare; ${spells.cantrips.length}, ${spellbook.length} and ${spells.prepared.length} chosen.`,
        }),
    ...(masteries.length === masteryCount
      ? {}
      : {
          masteries: `Choose ${masteryCount} weapon masteries; ${masteries.length} chosen.`,
        }),
  };
  const score = (ability: Ability) =>
    rows.find((row) => row.ability === ability)!.score;
  const derive = (id: KitId, style: FightingStyle | undefined) =>
    equipmentProfile(STARTING_KITS[id].equipment, {
      modifiers: {
        strength: abilityModifier(score("strength")),
        dexterity: abilityModifier(score("dexterity")),
      },
      strengthScore: score("strength"),
      dexterityScore: score("dexterity"),
      proficiency: proficiencyBonus(1),
      ...training,
      masteries,
      ...(style === undefined ? {} : { fightingStyle: style }),
      criticalRange: criticalRange(definition, 1),
    });
  const kits = definition.kits.map((id) => {
    const kit = STARTING_KITS[id];
    const derived = derive(id, fightingStyle);
    return {
      id,
      name: kit.name,
      price: kitPrice(id),
      value: formatCoins(kitPrice(id)),
      items: kitItems(id).map(itemName),
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
      limit: skillCount,
      full: skills.length >= skillCount,
    },
    masteries: {
      chosen: masteries.length,
      limit: masteryCount,
      full: masteries.length >= masteryCount,
    },
    ...(expertise === undefined
      ? {}
      : {
          expertise: {
            chosen: expertise.length,
            limit: expertiseLimit,
            full: expertise.length >= expertiseLimit,
          },
        }),
    ...(spells === undefined
      ? {}
      : {
          spells: {
            cantrips: {
              chosen: spells.cantrips.length,
              limit: spellLimits.cantrips,
              full: spells.cantrips.length >= spellLimits.cantrips,
            },
            prepared: {
              chosen: spells.prepared.length,
              limit: spellLimits.prepared,
              full: spells.prepared.length >= spellLimits.prepared,
            },
            ...(spellbook === undefined
              ? {}
              : {
                  spellbook: {
                    chosen: spellbook.length,
                    limit: spellbookLimit,
                    full: spellbook.length >= spellbookLimit,
                  },
                }),
          },
        }),
    kits,
    fightingStyles:
      fightingStyle === undefined
        ? []
        : (Object.keys(FIGHTING_STYLES) as FightingStyle[]).map((style) =>
            fightingStyleUse(style, derive(kitChosen, style)),
          ),
    unfinished,
  };
  if (Object.keys(unfinished).length > 0) {
    return projection;
  }
  const sheet = buildCharacter(
    "0".repeat(32),
    "Preview",
    rolled,
    choices,
    classId,
  );
  return {
    ...projection,
    sheet: {
      abilities: sheet.abilities,
      profile: characterProfile(sheet),
      carrying: characterCarrying(sheet),
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

export function validateCharacter(value: unknown): CharacterSheet {
  if (
    !isRecord(value) ||
    !SHEET_KEYS.every((key) => Object.hasOwn(value, key)) ||
    !Object.keys(value).every(
      (key) => SHEET_KEYS.includes(key) || CLASS_CHOICE_KEYS.includes(key),
    )
  ) {
    throw new Error("Invalid character sheet.");
  }
  const sheet = value as CharacterSheet;
  if (typeof sheet.id !== "string" || !/^[a-f0-9]{32}$/.test(sheet.id)) {
    throw new Error("Invalid character identity.");
  }
  validateName(sheet.name);
  if (!isClassId(sheet.class)) {
    throw new Error("Unsupported character class.");
  }
  const definition = CLASSES[sheet.class];
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
  const skills = validateSkills(definition, sheet.skills);
  validateClassStyle(definition, sheet.fightingStyle);
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
  if (sheet.level !== levelForXp(sheet.xp, classMaxLevel(definition))) {
    throw new Error("Character level differs from experience points.");
  }
  validateExpertise(
    definition,
    expertiseCount(definition, sheet.level),
    skills,
    sheet.expertise,
  );
  validateSpellChoices(definition, sheet.level, sheet.spells, {
    divineOrder: validateDivineOrder(definition, sheet.divineOrder),
    spellbook: validateSpellbook(definition, sheet.level, sheet.spellbook),
  });
  // Each level choice (#286) is an Ability Score Improvement and its level's
  // new masteries, made together; a sheet may still owe its latest one.
  if (
    improvements.length > abilityScoreImprovementCount(definition, sheet.level)
  ) {
    throw new Error("Too many Ability Score Improvements for the level.");
  }
  validateSheetMasteries(
    definition,
    sheet.weaponMasteries,
    masteriesHeld(definition, improvements.length),
  );
  if (
    !Number.isInteger(sheet.hp) ||
    sheet.hp < 0 ||
    sheet.hp > characterProfile(sheet).maxHp
  ) {
    throw new Error("Invalid character health.");
  }
  return structuredClone(sheet);
}

/** A feature as the sheet shows it. */
export type Feature = Readonly<{
  id: string;
  name: string;
  text: string;
}>;

export type CharacterProfile = Readonly<{
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
    id: SkillId;
    name: string;
    ability: Ability;
    bonus: number;
    proficient: boolean;
    /** Expertise doubles the proficiency bonus in `bonus` (#306). */
    expertise?: true;
  }>[];
  /** The tools it is proficient with, by name (#306); absent with none. */
  tools?: readonly string[];
  /** What it has equipped, by name, in the sheet's order. */
  equipment: readonly Readonly<{ id: ItemId; name: string }>[];
  /** The attack with the weapon it holds first. */
  attack: AttackProfile;
  /** The Light property's extra attack with a second light weapon. */
  lightAttack?: AttackProfile;
  /**
   * Whether the Fighting Style applies with what it has equipped, for a
   * class with one.
   */
  fightingStyle?: FightingStyleUse;
  /** Sneak Attack's extra damage dice, for a class with it (#306). */
  sneakAttack?: Readonly<{ dice: number; sides: number }>;
  /** Armour worn below its Strength requirement (speed -10 ft, not used without positions). */
  strengthShortfall?: Readonly<{ armour: string; strength: number }>;
  /**
   * Body armour worn without the class's training, by name: disadvantage on
   * Strength and Dexterity rolls (see `abilityDisadvantages`).
   */
  untrainedArmour?: string;
  /** A shield carried without the class's training: it adds no AC. */
  untrainedShield?: true;
  /** Second Wind's healing (dice + level), for a class that has it. */
  secondWind?: Readonly<{
    healing: Readonly<{ dice: number; sides: number; modifier: number }>;
  }>;
  /**
   * Each feature with uses at this level, by feature id (#333): how many,
   * and what a short and a long rest restore.
   */
  featureUses: Readonly<Record<string, FeatureUsesProfile>>;
  /** The hit-dice pool (#333): one die of the class's hit die per level. */
  hitDice: Readonly<{ count: number; sides: number }>;
  /** Its spellcasting (#336), for a class that casts spells. */
  spellcasting?: SpellcastingProfile;
  /**
   * Arcane Recovery (#340): once per long rest, a short rest regains spent
   * spell slots totalling up to `slotLevels` levels.
   */
  arcaneRecovery?: Readonly<{ slotLevels: number }>;
  /** Cunning Action (#307): it can Hide as a bonus action. */
  cunningAction?: true;
  /** Steady Aim (#307): a bonus action for advantage on its next attack. */
  steadyAim?: true;
  /** Fast Hands (#307): a second object interaction takes the bonus action. */
  fastHands?: true;
  /** Second-Story Work (#307): Dexterity for Strength to climb and jump. */
  secondStoryWork?: true;
  /**
   * Cunning Strike (#308): Sneak Attack dice can be given up for an effect,
   * whose saving throw is against `dc` (8 + Dexterity modifier + proficiency).
   */
  cunningStrike?: Readonly<{ dc: number }>;
  /** Uncanny Dodge (#308): its reaction halves a hit's damage. */
  uncannyDodge?: true;
  /** Attacks per Attack action: 2 with Extra Attack from level 5 (#287). */
  attacksPerAction: number;
  features: readonly Feature[];
  nextLevelXp: number | undefined;
}>;

/** The lowest d20 roll that is a critical hit at `level`: 20 unless a feature lowers it. */
function criticalRange(definition: ClassDefinition, level: Level): 19 | 20 {
  return effects(definition, level, "critical-range").reduce<19 | 20>(
    (range, { effect }) => (effect.range < range ? effect.range : range),
    20,
  );
}

/**
 * The features that give a character advantage on checks with `skill`, by
 * name, such as the Champion's Remarkable Athlete on Athletics.
 */
export function checkAdvantages(
  sheet: Pick<CharacterSheet, "class" | "level">,
  skill: SkillId,
): readonly string[] {
  return effects(classOf(sheet), sheet.level, "check-advantage")
    .filter(({ effect }) => effect.skills.includes(skill))
    .map(({ feature }) =>
      typeof feature.name === "string" ? feature.name : feature.id,
    );
}

/**
 * The sides of Tactical Mind's die (#315), for a character with it: a use of
 * Second Wind adds one such die to a check it has just failed.
 */
export function tacticalMindDie(
  sheet: Pick<CharacterSheet, "class" | "level">,
): number | undefined {
  return effects(classOf(sheet), sheet.level, "tactical-mind")[0]?.effect.sides;
}

/**
 * The features that give a character advantage on its initiative rolls
 * (#315), by name, such as the Champion's Remarkable Athlete.
 */
export function initiativeAdvantages(
  sheet: Pick<CharacterSheet, "class" | "level">,
): readonly string[] {
  return effects(classOf(sheet), sheet.level, "initiative-advantage").map(
    ({ feature }) =>
      typeof feature.name === "string" ? feature.name : feature.id,
  );
}

/**
 * The named sources of disadvantage on every D20 Test `sheet` makes with
 * `ability`: its checks, its saving throws and, for Dexterity, its
 * initiative. Body armour worn without the class's training gives it on
 * Strength and Dexterity (SRD 5.2), as "Chain mail (untrained)". Attack rolls
 * get the same source from the equipment profile.
 */
export function abilityDisadvantages(
  sheet: Pick<CharacterSheet, "class" | "equipment" | "divineOrder">,
  ability: Ability,
): readonly string[] {
  if (ability !== "strength" && ability !== "dexterity") {
    return [];
  }
  const armour = untrainedArmour(
    sheet.equipment,
    trainingOf(classOf(sheet), sheet.divineOrder).armourTraining,
  );
  return armour === undefined ? [] : [untrainedSource(armour)];
}

/** The fields a profile is derived from. */
type ProfiledSheet = Pick<
  CharacterSheet,
  | "class"
  | "abilities"
  | "abilityScoreImprovements"
  | "level"
  | "skills"
  | "fightingStyle"
  | "expertise"
  | "spells"
  | "divineOrder"
  | "spellbook"
  | "equipment"
  | "weaponMasteries"
>;

/** Whether `sheet` has Expertise in `skill` (#306). */
export function hasExpertise(
  sheet: Pick<CharacterSheet, "expertise">,
  skill: SkillId,
): boolean {
  return sheet.expertise?.includes(skill) === true;
}

/**
 * The proficiency bonus a check with `skill` adds: none without the skill,
 * the bonus with it, and twice the bonus with Expertise in it (#306).
 */
export function skillProficiency(
  sheet: Pick<CharacterSheet, "level" | "skills" | "expertise">,
  skill: SkillId,
): number {
  const proficiency = proficiencyBonus(sheet.level);
  return hasExpertise(sheet, skill)
    ? proficiency * 2
    : sheet.skills.includes(skill)
      ? proficiency
      : 0;
}

/**
 * The proficiency bonus a check with `tool` adds (#309): the bonus when the
 * sheet's class is proficient with it, none otherwise.
 */
export function toolProficiency(
  sheet: Pick<CharacterSheet, "class" | "level">,
  tool: ToolId,
): number {
  return classOf(sheet).toolProficiencies.includes(tool)
    ? proficiencyBonus(sheet.level)
    : 0;
}

/**
 * The fields `characterProfile` reads, in a fixed order. A field missing
 * here fails to compile, so the cache below never ignores one.
 */
const PROFILED_FIELDS = Object.keys({
  class: true,
  abilities: true,
  abilityScoreImprovements: true,
  level: true,
  skills: true,
  fightingStyle: true,
  expertise: true,
  spells: true,
  divineOrder: true,
  spellbook: true,
  equipment: true,
  weaponMasteries: true,
} satisfies Record<keyof ProfiledSheet, true>) as (keyof ProfiledSheet)[];

/**
 * The last profile made for each equipment list, with the fields it was made
 * from (#321). The engine builds a fresh sheet for each look at the
 * character, but from the same field objects, and sheets are never mutated,
 * so the same objects mean the same profile.
 */
const profiles = new WeakMap<
  ProfiledSheet["equipment"],
  Readonly<{ fields: readonly unknown[]; profile: CharacterProfile }>
>();

/**
 * Every number derived from a sheet's class, scores, level, equipment and
 * choices.
 */
export function characterProfile(sheet: ProfiledSheet): CharacterProfile {
  const fields = PROFILED_FIELDS.map((field) => sheet[field]);
  const cached = profiles.get(sheet.equipment);
  if (cached?.fields.every((value, i) => value === fields[i]) === true) {
    return cached.profile;
  }
  const profile = profileOf(sheet);
  profiles.set(sheet.equipment, { fields, profile });
  return profile;
}

function profileOf(sheet: ProfiledSheet): CharacterProfile {
  const definition = classOf(sheet);
  const level = sheet.level;
  const proficiency = proficiencyBonus(level);
  const modifiers = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      abilityModifier(sheet.abilities[ability]),
    ]),
  ) as Record<Ability, number>;
  const gear = equipmentProfile(sheet.equipment, {
    modifiers,
    strengthScore: sheet.abilities.strength,
    dexterityScore: sheet.abilities.dexterity,
    proficiency,
    ...trainingOf(definition, sheet.divineOrder),
    masteries: sheet.weaponMasteries,
    ...(sheet.fightingStyle === undefined
      ? {}
      : { fightingStyle: sheet.fightingStyle }),
    criticalRange: criticalRange(definition, level),
  });
  const styleUse =
    sheet.fightingStyle === undefined
      ? undefined
      : fightingStyleUse(sheet.fightingStyle, gear);
  // The DC of a save against the character's Dexterity-based features,
  // such as Cunning Strike (#308): 8 + Dexterity modifier + proficiency.
  const dexterityDc = 8 + modifiers.dexterity + proficiency;
  const features = classFeatures(definition, level).map((feature) => {
    const context = {
      level,
      uses: feature.uses?.[level] ?? 0,
      weaponMasteries: sheet.weaponMasteries,
      ...(sheet.fightingStyle === undefined || styleUse === undefined
        ? {}
        : { fightingStyle: sheet.fightingStyle, fightingStyleUse: styleUse }),
      expertise: sheet.expertise ?? [],
      ...(sheet.divineOrder === undefined
        ? {}
        : { divineOrder: sheet.divineOrder }),
      abilityScoreImprovements: sheet.abilityScoreImprovements,
      dexterityDc,
    };
    const name =
      typeof feature.name === "string" ? feature.name : feature.name(context);
    return {
      id: feature.id,
      // A subclass feature is named after its subclass: "Champion: …".
      name:
        feature.subclass === undefined ? name : `${feature.subclass}: ${name}`,
      text:
        typeof feature.text === "string" ? feature.text : feature.text(context),
    };
  });
  const [wind] = effects(definition, level, "second-wind");
  const [sneak] = effects(definition, level, "sneak-attack");
  const casting = definition.spellcasting;
  const has = (kind: FeatureEffect["kind"]) =>
    effects(definition, level, kind).length > 0;
  const hitDie = definition.hitDie;
  return {
    level,
    proficiencyBonus: proficiency,
    maxHp:
      hitDie +
      modifiers.constitution +
      (level - 1) * (hitDie / 2 + 1 + modifiers.constitution),
    armorClass: gear.armorClass,
    equipment: sheet.equipment.map((id) => ({ id, name: itemName(id) })),
    initiative: modifiers.dexterity,
    modifiers,
    savingThrows: Object.fromEntries(
      ABILITIES.map((ability) => {
        const proficient = definition.savingThrows.includes(ability);
        return [
          ability,
          {
            bonus: modifiers[ability] + (proficient ? proficiency : 0),
            proficient,
          },
        ];
      }),
    ) as Record<Ability, { bonus: number; proficient: boolean }>,
    skills: (Object.keys(SKILLS) as SkillId[]).map((id) => {
      const { name, ability } = SKILLS[id];
      return {
        id,
        name,
        ability,
        // A Divine Order may add to some skills (#339).
        bonus:
          modifiers[ability] +
          skillProficiency(sheet, id) +
          (orderCheckBonus(sheet, id)?.value ?? 0),
        proficient: sheet.skills.includes(id),
        ...(sheet.expertise?.includes(id) === true
          ? { expertise: true as const }
          : {}),
      };
    }),
    ...(definition.toolProficiencies.length === 0
      ? {}
      : {
          tools: definition.toolProficiencies.map((id) => TOOL_ITEMS[id].name),
        }),
    attack: gear.attack,
    ...(gear.lightAttack === undefined
      ? {}
      : { lightAttack: gear.lightAttack }),
    ...(styleUse === undefined ? {} : { fightingStyle: styleUse }),
    ...(sneak === undefined
      ? {}
      : {
          sneakAttack: {
            dice: sneak.effect.dice[level],
            sides: sneak.effect.sides,
          },
        }),
    ...(gear.strengthShortfall === undefined
      ? {}
      : { strengthShortfall: gear.strengthShortfall }),
    ...(gear.untrainedArmour === undefined
      ? {}
      : { untrainedArmour: gear.untrainedArmour }),
    ...(gear.untrainedShield === true
      ? { untrainedShield: true as const }
      : {}),
    ...(wind === undefined
      ? {}
      : {
          secondWind: { healing: { ...wind.effect.healing, modifier: level } },
        }),
    featureUses: Object.fromEntries([
      ...classFeatures(definition, level).flatMap(({ id, uses, recovery }) =>
        uses === undefined || uses[level] === 0
          ? []
          : [[id, { max: uses[level], recovery }]],
      ),
      // Spell slots (#336) recover as feature uses do.
      ...(casting?.slots[level] ?? []).map((max, index) => [
        slotUsesId(index + 1),
        { max, recovery: SPELL_SLOT_RECOVERY },
      ]),
    ]),
    hitDice: { count: level, sides: hitDie },
    ...(casting === undefined || sheet.spells === undefined
      ? {}
      : {
          spellcasting: {
            ability: casting.ability,
            modifier: modifiers[casting.ability],
            attackBonus: proficiency + modifiers[casting.ability],
            saveDc: 8 + proficiency + modifiers[casting.ability],
            cantrips: sheet.spells.cantrips,
            prepared: sheet.spells.prepared,
            slots: casting.slots[level],
            // A Wizard's spellbook (#340).
            ...(sheet.spellbook === undefined
              ? {}
              : { spellbook: sheet.spellbook }),
          },
        }),
    // Arcane Recovery (#340): spell slot levels a short rest regains.
    ...(has("arcane-recovery")
      ? { arcaneRecovery: { slotLevels: Math.ceil(level / 2) } }
      : {}),
    ...(has("cunning-action") ? { cunningAction: true as const } : {}),
    ...(has("steady-aim") ? { steadyAim: true as const } : {}),
    ...(has("fast-hands") ? { fastHands: true as const } : {}),
    ...(has("second-story-work") ? { secondStoryWork: true as const } : {}),
    ...(has("cunning-strike") ? { cunningStrike: { dc: dexterityDc } } : {}),
    ...(has("uncanny-dodge") ? { uncannyDodge: true as const } : {}),
    attacksPerAction: effects(definition, level, "extra-attack").reduce(
      (most, { effect }) => Math.max(most, effect.attacks),
      1,
    ),
    features,
    nextLevelXp: nextLevelXp(level, classMaxLevel(definition)),
  };
}

/** What the character holds, as an adventure starts with it. */
export function possessionsOf(sheet: CharacterSheet): Possessions {
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
export function characterCarrying(
  sheet: Pick<
    CharacterSheet,
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
export function settleCharacter(
  sheet: CharacterSheet,
  settlement: Settlement,
): CharacterSheet {
  const awards = settlement.xp.filter(({ id }) => !sheet.xpAwards.includes(id));
  const finds = [
    ...[...settlement.finds, ...settlement.coin].map(({ id }) => id),
    ...settlement.sold,
    ...settlement.gear,
  ].filter(
    (id, index, all) => !sheet.finds.includes(id) && all.indexOf(id) === index,
  );
  const xp = sheet.xp + awards.reduce((sum, award) => sum + award.xp, 0);
  const raised = {
    ...sheet,
    xp,
    level: levelForXp(xp, classMaxLevel(classOf(sheet))),
  };
  return validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
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

/**
 * A caster's numbers (#336): its spellcasting ability and modifier, spell
 * attack bonus (proficiency + modifier), spell save DC (8 + proficiency +
 * modifier), cantrips known, spells prepared and spell slots by level, 1st
 * first. Its slots are also feature uses, `spell-slots-1` and on, so rests
 * restore them as they restore features.
 */
export type SpellcastingProfile = Readonly<{
  ability: Ability;
  modifier: number;
  attackBonus: number;
  saveDc: number;
  cantrips: readonly SpellId[];
  prepared: readonly SpellId[];
  slots: readonly number[];
  /** The spells in its spellbook (#340), for a class with one. */
  spellbook?: readonly SpellId[];
}>;

/**
 * The name of the feature, or the spell slots (#336), whose uses
 * `featureId` tracks: "Second Wind", "1st-level spell slots".
 */
export function featureUsesName(
  profile: Pick<CharacterProfile, "features">,
  featureId: string,
): string {
  const slotLevel = slotLevelOf(featureId);
  if (slotLevel !== undefined) {
    return `${ordinal(slotLevel)}-level spell slots`;
  }
  return profile.features.find(({ id }) => id === featureId)?.name ?? featureId;
}

/** The feature-uses id Arcane Recovery's use is tracked under (#340). */
export const ARCANE_RECOVERY = "arcane-recovery";

/** The lowest spell slot level Arcane Recovery can't regain (SRD 5.2). */
const ARCANE_RECOVERY_SLOT_LIMIT = 6;

/** Why Arcane Recovery (#340) regains nothing now. */
export type ArcaneRecoveryRefusal = Readonly<{
  code:
    | "no-arcane-recovery"
    | "not-short-rest"
    | "arcane-recovery-used"
    | "no-slot-spent";
  reason: string;
}>;

/**
 * Arcane Recovery (#340, SRD 5.2) on a rest of kind `rest`, for a
 * character with `profile` and `uses` left of each feature: once per long
 * rest, on a short rest only, it regains spent spell slots totalling up to
 * its `slotLevels`, highest slots first, none of 6th level or higher. The
 * slots regained by level, each with its uses after; or why none are.
 */
export function arcaneRecovery(
  profile: Pick<CharacterProfile, "arcaneRecovery" | "featureUses">,
  uses: Readonly<Record<string, number>>,
  rest: "short" | "long",
):
  | Readonly<{
      regained: readonly Readonly<{
        featureId: string;
        level: number;
        count: number;
        uses: number;
        max: number;
      }>[];
    }>
  | Readonly<{ rejection: ArcaneRecoveryRefusal }> {
  const refuse = (
    code: ArcaneRecoveryRefusal["code"],
    reason: string,
  ): Readonly<{ rejection: ArcaneRecoveryRefusal }> => ({
    rejection: { code, reason },
  });
  if (profile.arcaneRecovery === undefined) {
    return refuse("no-arcane-recovery", "You don't have Arcane Recovery.");
  }
  if (rest !== "short") {
    return refuse(
      "not-short-rest",
      "Arcane Recovery works only on a short rest.",
    );
  }
  const max = profile.featureUses[ARCANE_RECOVERY]?.max ?? 0;
  if ((uses[ARCANE_RECOVERY] ?? max) === 0) {
    return refuse(
      "arcane-recovery-used",
      "You have used Arcane Recovery since your last long rest.",
    );
  }
  let budget = profile.arcaneRecovery.slotLevels;
  const regained = Object.entries(profile.featureUses)
    .flatMap(([featureId, { max: most }]) => {
      const level = slotLevelOf(featureId);
      return level === undefined || level >= ARCANE_RECOVERY_SLOT_LIMIT
        ? []
        : [{ featureId, level, max: most, left: uses[featureId] ?? most }];
    })
    .sort((a, b) => b.level - a.level)
    .flatMap(({ featureId, level, max: most, left }) => {
      const count = Math.min(most - left, Math.floor(budget / level));
      budget -= count * level;
      return count === 0
        ? []
        : [{ featureId, level, count, uses: left + count, max: most }];
    });
  return regained.length === 0
    ? refuse("no-slot-spent", "You have no spent spell slot to regain.")
    : { regained };
}

/** A feature's uses at a level and how they come back (#333). */
export type FeatureUsesProfile = Readonly<{
  max: number;
  recovery: FeatureRecovery;
}>;

/** A choice a new level asks for, made on the sheet (#286). */
export type LevelUpChoice = "ability-score-improvement" | "weapon-mastery";

/** What changed when a character went up a level, for the level-up card. */
export type LevelUpChanges = Readonly<{
  from: Level;
  to: Level;
  maxHp: Readonly<{ before: number; after: number }>;
  proficiencyBonus: Readonly<{ before: number; after: number }>;
  /** Second Wind's uses and healing modifier (1d10 + level), for a class with it. */
  secondWind?: Readonly<{
    before: Readonly<{ uses: number; modifier: number }>;
    after: Readonly<{ uses: number; modifier: number }>;
  }>;
  /** Sneak Attack's dice, for a class with it, when they grow (#307). */
  sneakAttack?: Readonly<{ before: number; after: number }>;
  /** How many kinds of weapon the character masters. */
  weaponMasteries: Readonly<{ before: number; after: number }>;
  /** The class features gained, in the sheet's order. */
  features: readonly Feature[];
  /**
   * The choices still to make before the next adventure: an Ability Score
   * Improvement and its level's new weapon mastery.
   */
  choices: readonly LevelUpChoice[];
}>;

/** The changes from `before` to `after`, or undefined if the level held. */
export function levelUpChanges(
  before: ProfiledSheet,
  after: ProfiledSheet,
): LevelUpChanges | undefined {
  if (after.level === before.level) {
    return undefined;
  }
  const definition = classOf(after);
  const was = characterProfile(before);
  const now = characterProfile(after);
  const known = new Set(was.features.map(({ id }) => id));
  const wind = ({ secondWind, featureUses }: CharacterProfile) =>
    secondWind === undefined
      ? { uses: 0, modifier: 0 }
      : {
          uses: featureUses["second-wind"]?.max ?? 0,
          modifier: secondWind.healing.modifier,
        };
  return {
    from: before.level,
    to: after.level,
    maxHp: { before: was.maxHp, after: now.maxHp },
    proficiencyBonus: {
      before: was.proficiencyBonus,
      after: now.proficiencyBonus,
    },
    ...(now.secondWind === undefined
      ? {}
      : { secondWind: { before: wind(was), after: wind(now) } }),
    ...(now.sneakAttack === undefined ||
    now.sneakAttack.dice === was.sneakAttack?.dice
      ? {}
      : {
          sneakAttack: {
            before: was.sneakAttack?.dice ?? 0,
            after: now.sneakAttack.dice,
          },
        }),
    weaponMasteries: {
      before: definition.weaponMasteries[before.level],
      after: definition.weaponMasteries[after.level],
    },
    features: now.features.filter(({ id }) => !known.has(id)),
    choices: levelChoicesOwed(after),
  };
}

/**
 * The choices the sheet's pending level choice asks for: an Ability Score
 * Improvement and, when that level brings one, a new weapon mastery (#308:
 * the Rogue's level 4 brings none). Empty when no choice is owed.
 */
export function levelChoicesOwed(
  sheet: Pick<CharacterSheet, "class" | "level" | "abilityScoreImprovements">,
): readonly LevelUpChoice[] {
  if (pendingLevelChoice(sheet) === undefined) {
    return [];
  }
  const definition = classOf(sheet);
  const made = sheet.abilityScoreImprovements.length;
  return masteriesHeld(definition, made + 1) > masteriesHeld(definition, made)
    ? ["ability-score-improvement", "weapon-mastery"]
    : ["ability-score-improvement"];
}

/** "Ability Score Improvement and weapon mastery", or the improvement alone. */
export function levelChoiceWords(
  sheet: Pick<CharacterSheet, "class" | "level" | "abilityScoreImprovements">,
): string {
  return levelChoicesOwed(sheet).includes("weapon-mastery")
    ? "Ability Score Improvement and weapon mastery"
    : "Ability Score Improvement";
}

/**
 * The level whose choice (an Ability Score Improvement and its new weapon
 * mastery, #286) the sheet still owes, or undefined. A character that owes
 * one cannot start another adventure.
 */
export function pendingLevelChoice(
  sheet: Pick<CharacterSheet, "class" | "level" | "abilityScoreImprovements">,
): Level | undefined {
  const next = improvementLevels(classOf(sheet))[
    sheet.abilityScoreImprovements.length
  ];
  return next !== undefined && next <= sheet.level ? next : undefined;
}

/**
 * The level-up card's view of the level a pending choice belongs to: from
 * the level below it to that level.
 */
export function pendingLevelUp(
  sheet: CharacterSheet,
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

/**
 * The weapons whose mastery `sheet` could add: every used one its class is
 * proficient with and that it has not mastered yet.
 */
export function masteryOptions(
  sheet: Pick<CharacterSheet, "class" | "weaponMasteries">,
): readonly WeaponId[] {
  return classMasteryWeapons(classOf(sheet)).filter(
    (id) => !sheet.weaponMasteries.includes(id),
  );
}

function validateNewMastery(sheet: CharacterSheet, value: unknown): WeaponId {
  if (
    typeof value !== "string" ||
    !(classMasteryWeapons(classOf(sheet)) as readonly string[]).includes(value)
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
  sheet: CharacterSheet,
  choice: unknown,
): CharacterSheet {
  if (pendingLevelChoice(sheet) === undefined) {
    throw new Error(`${sheet.name} has no level choice to make.`);
  }
  // A level that brings no new mastery (#308) takes the improvement alone.
  const mastering = levelChoicesOwed(sheet).includes("weapon-mastery");
  if (
    !isRecord(choice) ||
    Object.keys(choice).sort().join(",") !==
      (mastering ? "increase,mastery" : "increase")
  ) {
    throw new Error("Invalid level choice.");
  }
  const increase = validateImprovement(choice.increase);
  const improved = {
    ...sheet,
    abilityScoreImprovements: [...sheet.abilityScoreImprovements, increase],
    abilities: improvedAbilities(sheet.abilities, increase),
    weaponMasteries: mastering
      ? [...sheet.weaponMasteries, validateNewMastery(sheet, choice.mastery)]
      : sheet.weaponMasteries,
  };
  const maxHp = characterProfile(improved).maxHp;
  const gained = maxHp - characterProfile(sheet).maxHp;
  return validateCharacter({
    ...improved,
    hp: Math.min(maxHp, Math.max(0, sheet.hp + gained)),
  });
}

/**
 * `sheet` with `prepared` as its prepared spells (#339, D8): its class's
 * count of different levelled spells from its list that it has slots for,
 * and from its spellbook for a class with one (#340). Its cantrips stay.
 * The library allows it only between adventures.
 */
export function prepareSpells(
  sheet: CharacterSheet,
  prepared: unknown,
): CharacterSheet {
  if (sheet.spells === undefined) {
    throw new Error(`${sheet.name} casts no spells.`);
  }
  if (!Array.isArray(prepared)) {
    throw new Error("Invalid prepared spells.");
  }
  return validateCharacter({
    ...sheet,
    spells: { cantrips: sheet.spells.cantrips, prepared: [...prepared] },
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
  sheet: CharacterSheet,
  choice: Readonly<{ increase: unknown; mastery: unknown }>,
): LevelChoiceProjection {
  const level = pendingLevelChoice(sheet);
  if (level === undefined) {
    throw new Error(`${sheet.name} has no level choice to make.`);
  }
  const { increase, missing } = validatePartialImprovement(choice.increase);
  const mastering = levelChoicesOwed(sheet).includes("weapon-mastery");
  if (choice.mastery !== null) {
    if (!mastering) {
      throw new Error("Invalid level choice.");
    }
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
    ...(mastering && choice.mastery === null
      ? { mastery: "Choose a fourth kind of weapon to master." }
      : {}),
  };
  const projection = {
    level,
    rows,
    masteries: mastering ? masteryOptions(sheet) : [],
    unfinished,
  };
  if (Object.keys(unfinished).length > 0) {
    return projection;
  }
  return {
    ...projection,
    changes: levelChoiceChanges(
      sheet,
      applyLevelChoice(sheet, {
        increase,
        ...(mastering ? { mastery: choice.mastery } : {}),
      }),
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
  before: CharacterSheet,
  after: CharacterSheet,
): readonly string[] {
  const was = characterProfile(before);
  const now = characterProfile(after);
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
  const carried = characterCarrying(before).capacity;
  const carries = characterCarrying(after).capacity;
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
