/**
 * The 5e bestiary (format version 8): the shared monsters adventure modules
 * fight, each an SRD 5.2 stat block (or a house one derived from it) under an
 * id, with the character levels it suits. A module's opponent names a
 * bestiary monster by id, or authors a one-off stat block inline. A stat
 * block may list traits (Pack Tactics, Undead Fortitude, Nimble Escape,
 * Rampage), make several attacks a turn (Multiattack), list saving throw
 * proficiencies, damage resistances,
 * vulnerabilities and immunities (SRD 5.2 damage types) and condition
 * immunities, and give an attack a rider: extra damage on a hit and a
 * condition, after a saving throw if it names one. Every stat block gives a
 * morale DC (#237, a house rule) or `"never"` for one that never checks
 * morale; an Undead never does. Every stat block gives its passive
 * Perception (#301): SRD 5.2's, or 10 + its Wisdom modifier for a house one,
 * which a character sneaking up on it must meet. Every monster has a treasure type
 * (`treasure-5e.ts`, #240): what it carries for an authoring-time roll to
 * turn into loot.
 *
 * Validation names the first problem it finds. A bestiary in any other format
 * version is refused with a message naming the file.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoundedJson } from "./bounded-json.js";
import {
  DAMAGE_TYPES,
  type AttackRider,
  type ConditionKind,
  type DamageType,
} from "./encounter-5e.js";
import { ABILITIES, type Abilities, type Ability } from "./class-5e.js";
import {
  isTreasureTypeId,
  TREASURE_TYPES,
  type TreasureTypeId,
} from "./treasure-5e.js";
import {
  distinct,
  exactKeys,
  knownKeys,
  integer,
  id,
  isRecord,
  list,
  ShapeError,
  text,
  unique,
  fail,
} from "./json-shape.js";

export const FIFTH_BESTIARY_FORMAT = 8;

/** The monster traits the engine applies. */
export const MONSTER_TRAITS = [
  "Pack Tactics",
  "Undead Fortitude",
  "Nimble Escape",
  "Rampage",
] as const;
export type MonsterTrait = (typeof MONSTER_TRAITS)[number];

const CONDITION_KINDS: readonly ConditionKind[] = [
  "poisoned",
  "prone",
  "paralysed",
];

/** The most turns a rider's condition lasts: 10 turns is 1 minute. */
const MAX_CONDITION_TURNS = 10;

export type StatBlockAttack = Readonly<{
  name: string;
  bonus: number;
  damage: Readonly<{
    dice: number;
    sides: number;
    modifier: number;
    type: DamageType;
  }>;
  /** What a hit does besides its damage. */
  rider?: AttackRider;
}>;

/** The parts of an SRD 5.2 stat block the engine uses. */
export type StatBlock = Readonly<{
  name: string;
  size: string;
  type: string;
  armorClass: number;
  hitPoints: Readonly<{ average: number; formula: string }>;
  abilities: Abilities;
  challengeRating: string;
  xp: number;
  /**
   * Its passive Perception (#301): the Stealth total a character sneaking up
   * on it must meet.
   */
  passivePerception: number;
  /** Melee attacks only: ranged weapons are deferred. */
  attacks: readonly StatBlockAttack[];
  /**
   * Multiattack: the attacks it makes each turn, each one of `attacks`
   * chosen by a die. Without it, it makes one attack, its first.
   */
  multiattack?: number;
  traits?: readonly MonsterTrait[];
  /** The abilities it adds its proficiency bonus to when it saves. */
  saveProficiencies?: readonly Ability[];
  /** Damage types it takes half, double or no damage from. */
  damageResistances?: readonly DamageType[];
  damageVulnerabilities?: readonly DamageType[];
  damageImmunities?: readonly DamageType[];
  /** Conditions it cannot be given. */
  conditionImmunities?: readonly ConditionKind[];
  /**
   * Its morale DC, a house rule (#237): the Wisdom saving throw it makes when its
   * side's first combatant falls and at half strength, fleeing on a failure.
   * Undead and mindless monsters never check.
   */
  morale: number | "never";
}>;

/**
 * A bestiary monster. An opponent that names it is called by its stat
 * block's name and described by its description, unless the module gives
 * its own. Its level band is the character levels it is meant for.
 */
export type FifthMonster = Readonly<{
  id: string;
  description: string;
  levelBand: Readonly<{ min: number; max: number }>;
  /** What it carries: an authoring-time roll turns it into loot (#240). */
  treasureType: TreasureTypeId;
  statBlock: StatBlock;
}>;

export type FifthBestiary = Readonly<{
  kind: "dungeon-one-5e-bestiary";
  formatVersion: typeof FIFTH_BESTIARY_FORMAT;
  monsters: readonly FifthMonster[];
}>;

function damage(value: unknown, where: string): StatBlockAttack["damage"] {
  const raw = exactKeys(value, ["dice", "sides", "modifier", "type"], where);
  return {
    dice: integer(raw.dice, `${where} dice`, 1, 10),
    sides: integer(raw.sides, `${where} sides`, 2, 12),
    modifier: integer(raw.modifier, `${where} modifier`, -5, 20),
    type: damageType(raw.type, `${where} type`),
  };
}

/** One of the SRD 5.2 damage types; a problem throws a `ShapeError`. */
export function damageType(value: unknown, where: string): DamageType {
  if (!DAMAGE_TYPES.includes(value as DamageType)) {
    fail(`${where} must be one of ${DAMAGE_TYPES.join(", ")}.`);
  }
  return value as DamageType;
}

/**
 * A stat block's list of distinct values drawn from `allowed`, such as its
 * traits, or undefined if left out. `field` names the list and `entry` one
 * of its values in a problem.
 */
function chosen<T extends string>(
  value: unknown,
  allowed: readonly T[],
  where: string,
  field: string,
  entry: string,
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const values = list(value, `${where} ${field}`, allowed.length).map(
    (item, index) => {
      if (!allowed.includes(item as T)) {
        fail(
          `${where} ${entry} ${index + 1} must be one of ${allowed.join(", ")}.`,
        );
      }
      return item as T;
    },
  );
  distinct(
    values,
    (item) => item,
    (item) => `${where} ${field} lists ${item} twice.`,
  );
  return values;
}

function rider(value: unknown, where: string): AttackRider {
  const raw = knownKeys(value, [], ["damage", "condition"], where);
  if (raw.damage === undefined && raw.condition === undefined) {
    fail(`${where} must give damage, a condition or both.`);
  }
  const extra =
    raw.damage === undefined
      ? {}
      : { damage: damage(raw.damage, `${where} damage`) };
  if (raw.condition === undefined) {
    return extra;
  }
  const at = `${where} condition`;
  const condition = knownKeys(
    raw.condition,
    ["kind"],
    ["save", "turns", "repeatSave"],
    at,
  );
  if (!CONDITION_KINDS.includes(condition.kind as ConditionKind)) {
    fail(`${at} kind must be one of ${CONDITION_KINDS.join(", ")}.`);
  }
  const kind = condition.kind as ConditionKind;
  const save =
    condition.save === undefined
      ? undefined
      : exactKeys(condition.save, ["ability", "dc"], `${at} save`);
  if (save !== undefined && !ABILITIES.includes(save.ability as Ability)) {
    fail(`${at} save ability must be one of ${ABILITIES.join(", ")}.`);
  }
  if (condition.repeatSave !== undefined && condition.repeatSave !== true) {
    fail(`${at} repeatSave must be true, or left out.`);
  }
  if (condition.repeatSave === true && save === undefined) {
    fail(`${at} repeats a save, so it must name one.`);
  }
  if (
    kind === "prone" &&
    (condition.turns !== undefined || condition.repeatSave !== undefined)
  ) {
    fail(
      `${at} is prone, which ends when the target gets up on its next turn; give it no turns or repeatSave.`,
    );
  }
  if (kind !== "prone" && condition.turns === undefined) {
    fail(`${at} must say how many of the target's turns it lasts.`);
  }
  return {
    ...extra,
    condition: {
      kind,
      ...(save === undefined
        ? {}
        : {
            save: {
              ability: save.ability as Ability,
              dc: integer(save.dc, `${at} save dc`, 5, 30),
            },
          }),
      ...(condition.turns === undefined
        ? {}
        : {
            turns: integer(
              condition.turns,
              `${at} turns`,
              1,
              MAX_CONDITION_TURNS,
            ),
          }),
      ...(condition.repeatSave === true ? { repeatSave: true as const } : {}),
    },
  };
}

/** Checks a stat block's shape; a problem throws a `ShapeError`. */
export function statBlock(value: unknown, where: string): StatBlock {
  const block = knownKeys(
    value,
    [
      "name",
      "size",
      "type",
      "armorClass",
      "hitPoints",
      "abilities",
      "challengeRating",
      "xp",
      "passivePerception",
      "attacks",
      "morale",
    ],
    [
      "multiattack",
      "traits",
      "saveProficiencies",
      "damageResistances",
      "damageVulnerabilities",
      "damageImmunities",
      "conditionImmunities",
    ],
    where,
  );
  const hitPoints = exactKeys(
    block.hitPoints,
    ["average", "formula"],
    `${where} hitPoints`,
  );
  const abilities = exactKeys(block.abilities, ABILITIES, `${where} abilities`);
  for (const ability of ABILITIES) {
    integer(abilities[ability], `${where} ${ability}`, 1, 30);
  }
  const attacks = list(block.attacks, `${where} attacks`, 4).map(
    (entry, index) => {
      const at = `${where} attack ${index + 1}`;
      const attack = knownKeys(
        entry,
        ["name", "bonus", "damage"],
        ["rider"],
        at,
      );
      return {
        name: text(attack.name, `${at} name`, 60),
        bonus: integer(attack.bonus, `${at} bonus`, -5, 20),
        damage: damage(attack.damage, `${at} damage`),
        ...(attack.rider === undefined
          ? {}
          : { rider: rider(attack.rider, `${at} rider`) }),
      };
    },
  );
  const traits = chosen(block.traits, MONSTER_TRAITS, where, "traits", "trait");
  const saveProficiencies = chosen(
    block.saveProficiencies,
    ABILITIES,
    where,
    "saveProficiencies",
    "save proficiency",
  );
  const defenses = {
    damageResistances: chosen(
      block.damageResistances,
      DAMAGE_TYPES,
      where,
      "damageResistances",
      "damage resistance",
    ),
    damageVulnerabilities: chosen(
      block.damageVulnerabilities,
      DAMAGE_TYPES,
      where,
      "damageVulnerabilities",
      "damage vulnerability",
    ),
    damageImmunities: chosen(
      block.damageImmunities,
      DAMAGE_TYPES,
      where,
      "damageImmunities",
      "damage immunity",
    ),
  };
  distinct(
    Object.values(defenses).flatMap((types) => types ?? []),
    (type) => type,
    (type) =>
      `${where} gives ${type} damage more than one of resistance, vulnerability and immunity.`,
  );
  const conditionImmunities = chosen(
    block.conditionImmunities,
    CONDITION_KINDS,
    where,
    "conditionImmunities",
    "condition immunity",
  );
  const type = text(block.type, `${where} type`, 60);
  const morale =
    block.morale === "never"
      ? "never"
      : typeof block.morale === "number"
        ? integer(block.morale, `${where} morale`, 1, 30)
        : fail(`${where} morale must be a DC from 1 to 30, or "never".`);
  if (/^undead\b/i.test(type) && morale !== "never") {
    fail(`${where} is Undead, so its morale must be "never".`);
  }
  if (
    typeof block.challengeRating !== "string" ||
    !/^(0|1\/8|1\/4|1\/2|[1-9]|[12][0-9]|30)$/.test(block.challengeRating)
  ) {
    fail(`${where} challengeRating must be an SRD challenge rating.`);
  }
  return {
    name: text(block.name, `${where} name`, 60),
    size: text(block.size, `${where} size`, 20),
    type,
    armorClass: integer(block.armorClass, `${where} armorClass`, 1, 30),
    hitPoints: {
      average: integer(hitPoints.average, `${where} hitPoints average`, 1, 999),
      formula: text(hitPoints.formula, `${where} hitPoints formula`, 30),
    },
    abilities: abilities as Abilities,
    challengeRating: block.challengeRating,
    xp: integer(block.xp, `${where} xp`, 0, 155000),
    passivePerception: integer(
      block.passivePerception,
      `${where} passivePerception`,
      1,
      30,
    ),
    attacks,
    ...(block.multiattack === undefined
      ? {}
      : {
          multiattack: integer(block.multiattack, `${where} multiattack`, 2, 4),
        }),
    ...(traits === undefined ? {} : { traits }),
    ...(saveProficiencies === undefined ? {} : { saveProficiencies }),
    ...Object.fromEntries(
      Object.entries(defenses).filter(([, types]) => types !== undefined),
    ),
    ...(conditionImmunities === undefined ? {} : { conditionImmunities }),
    morale,
  };
}

function validateBestiary(value: unknown): FifthBestiary {
  if (!isRecord(value) || value.kind !== "dungeon-one-5e-bestiary") {
    fail("not a 5e bestiary.");
  }
  if (value.formatVersion !== FIFTH_BESTIARY_FORMAT) {
    fail(
      `format version ${String(value.formatVersion)} is not ${FIFTH_BESTIARY_FORMAT}.`,
    );
  }
  const bestiary = exactKeys(
    value,
    ["kind", "formatVersion", "monsters"],
    "the bestiary",
  );
  const monsters = list(bestiary.monsters, "monsters", 200).map(
    (entry, index) => {
      const where = `monster ${index + 1}`;
      const monster = exactKeys(
        entry,
        ["id", "description", "levelBand", "treasureType", "statBlock"],
        where,
      );
      if (!isTreasureTypeId(monster.treasureType)) {
        fail(
          `${where} treasureType must be one of ${Object.keys(TREASURE_TYPES).join(", ")}.`,
        );
      }
      const band = exactKeys(
        monster.levelBand,
        ["min", "max"],
        `${where} levelBand`,
      );
      const min = integer(band.min, `${where} levelBand min`, 1, 20);
      const max = integer(band.max, `${where} levelBand max`, min, 20);
      return {
        id: id(monster.id, `${where} id`),
        description: text(monster.description, `${where} description`),
        levelBand: { min, max },
        treasureType: monster.treasureType,
        statBlock: statBlock(monster.statBlock, `${where} statBlock`),
      };
    },
  );
  unique(monsters, "monster");
  return {
    kind: "dungeon-one-5e-bestiary",
    formatVersion: FIFTH_BESTIARY_FORMAT,
    monsters,
  };
}

/** Validates a decoded bestiary, naming the first problem. */
export function validateFifthBestiary(value: unknown): FifthBestiary {
  try {
    return validateBestiary(value);
  } catch (error) {
    if (error instanceof ShapeError) {
      throw new Error(`Invalid bestiary: ${error.message}`);
    }
    throw error;
  }
}

/** Reads and validates a bestiary file; problems name the file. */
export async function loadFifthBestiary(path: string): Promise<FifthBestiary> {
  let decoded: unknown;
  try {
    decoded = parseBoundedJson(await readFile(path), 1024 * 1024, 32);
  } catch {
    throw new Error(`${path} is not a readable bestiary.`);
  }
  if (
    isRecord(decoded) &&
    decoded.kind === "dungeon-one-5e-bestiary" &&
    decoded.formatVersion !== FIFTH_BESTIARY_FORMAT
  ) {
    throw new Error(
      `${path} is a 5e bestiary in format version ${String(decoded.formatVersion)}, not ${FIFTH_BESTIARY_FORMAT}. Move it aside; the file has not been changed.`,
    );
  }
  try {
    return validateFifthBestiary(decoded);
  } catch (error) {
    throw new Error(`${path}: ${(error as Error).message}`);
  }
}

/** The built-in bestiary file, beside the built-in modules. */
export const FIFTH_BESTIARY_FILE = "bestiary.json";

export function loadBuiltInFifthBestiary(): Promise<FifthBestiary> {
  return loadFifthBestiary(
    fileURLToPath(
      new URL(`../adventures/5e/${FIFTH_BESTIARY_FILE}`, import.meta.url),
    ),
  );
}
