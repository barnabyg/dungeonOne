/**
 * The 5e bestiary (format version 1): the shared monsters adventure modules
 * fight, each an SRD 5.2 stat block (or a house one derived from it) under an
 * id. A module's opponent names a bestiary monster by id, or authors a
 * one-off stat block inline. Later tickets extend the bestiary with traits,
 * resistances, morale and treasure types.
 *
 * Validation names the first problem it finds. A bestiary in any other format
 * version is refused with a message naming the file.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoundedJson } from "./bounded-json.js";
import { ABILITIES, type Abilities } from "./fighter-5e.js";
import {
  exactKeys,
  integer,
  id,
  isRecord,
  list,
  ShapeError,
  text,
  unique,
  fail,
} from "./json-shape.js";

export const FIFTH_BESTIARY_FORMAT = 1;

export type StatBlockAttack = Readonly<{
  name: string;
  bonus: number;
  damage: Readonly<{
    dice: number;
    sides: number;
    modifier: number;
    type: string;
  }>;
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
  /** Melee attacks only: ranged weapons are deferred. */
  attacks: readonly StatBlockAttack[];
}>;

/**
 * A bestiary monster. An opponent that names it is called by its stat
 * block's name and described by its description, unless the module gives
 * its own.
 */
export type FifthMonster = Readonly<{
  id: string;
  description: string;
  statBlock: StatBlock;
}>;

export type FifthBestiary = Readonly<{
  kind: "dungeon-one-5e-bestiary";
  formatVersion: typeof FIFTH_BESTIARY_FORMAT;
  monsters: readonly FifthMonster[];
}>;

/** Checks a stat block's shape; a problem throws a `ShapeError`. */
export function statBlock(value: unknown, where: string): StatBlock {
  const block = exactKeys(
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
      "attacks",
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
      const attack = exactKeys(entry, ["name", "bonus", "damage"], at);
      const damage = exactKeys(
        attack.damage,
        ["dice", "sides", "modifier", "type"],
        `${at} damage`,
      );
      return {
        name: text(attack.name, `${at} name`, 60),
        bonus: integer(attack.bonus, `${at} bonus`, -5, 20),
        damage: {
          dice: integer(damage.dice, `${at} damage dice`, 1, 10),
          sides: integer(damage.sides, `${at} damage sides`, 2, 12),
          modifier: integer(damage.modifier, `${at} damage modifier`, -5, 20),
          type: text(damage.type, `${at} damage type`, 30),
        },
      };
    },
  );
  if (
    typeof block.challengeRating !== "string" ||
    !/^(0|1\/8|1\/4|1\/2|[1-9]|[12][0-9]|30)$/.test(block.challengeRating)
  ) {
    fail(`${where} challengeRating must be an SRD challenge rating.`);
  }
  return {
    name: text(block.name, `${where} name`, 60),
    size: text(block.size, `${where} size`, 20),
    type: text(block.type, `${where} type`, 60),
    armorClass: integer(block.armorClass, `${where} armorClass`, 1, 30),
    hitPoints: {
      average: integer(hitPoints.average, `${where} hitPoints average`, 1, 999),
      formula: text(hitPoints.formula, `${where} hitPoints formula`, 30),
    },
    abilities: abilities as Abilities,
    challengeRating: block.challengeRating,
    xp: integer(block.xp, `${where} xp`, 0, 155000),
    attacks,
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
        ["id", "description", "statBlock"],
        where,
      );
      return {
        id: id(monster.id, `${where} id`),
        description: text(monster.description, `${where} description`),
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
