/**
 * The 5e adventure module format (format version 1) and its validator.
 *
 * A module declares its recommended levels and difficulty, its rooms, the
 * encounters in them with inline SRD 5.2 stat blocks, and its endings. Each
 * opponent in an encounter has its own name, so the player can target it. This
 * first version holds what a one-room fight needs; later tickets add
 * exploration, checks, treasure and XP, each bumping the format version.
 *
 * Validation names the first problem it finds. A module in any other format
 * version is refused with a message naming the file.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoundedJson } from "./bounded-json.js";
import { ABILITIES, type Abilities } from "./fighter-5e.js";

export const FIFTH_ADVENTURE_FORMAT = 1;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

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

export type FifthOpponent = Readonly<{
  id: string;
  name: string;
  description: string;
  statBlock: StatBlock;
}>;

export type FifthEncounter = Readonly<{
  id: string;
  opponents: readonly FifthOpponent[];
  victoryEndingId: string;
  defeatEndingId: string;
}>;

export type FifthRoom = Readonly<{
  id: string;
  name: string;
  description: string;
  encounterId: string;
}>;

export type FifthEnding = Readonly<{
  id: string;
  kind: "victory" | "defeat";
  title: string;
  text: string;
}>;

export type FifthAdventure = Readonly<{
  kind: "dungeon-one-5e-adventure";
  formatVersion: typeof FIFTH_ADVENTURE_FORMAT;
  id: string;
  title: string;
  objective: string;
  recommendedLevels: Readonly<{ min: number; max: number }>;
  difficulty: Difficulty;
  startRoomId: string;
  rooms: readonly FifthRoom[];
  encounters: readonly FifthEncounter[];
  endings: readonly FifthEnding[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`Invalid adventure module: ${message}`);
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  where: string,
): Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  ) {
    fail(`${where} must have exactly ${keys.join(", ")}.`);
  }
  return value;
}

function text(value: unknown, where: string, max = 2000): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > max ||
    /[\p{Cc}\p{Cs}]/u.test(value)
  ) {
    fail(`${where} must be text of 1–${max} characters.`);
  }
  return value;
}

function id(value: unknown, where: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) {
    fail(`${where} must be a lowercase id.`);
  }
  return value;
}

function integer(value: unknown, where: string, min: number, max: number) {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    fail(`${where} must be an integer from ${min} to ${max}.`);
  }
  return value as number;
}

function list(value: unknown, where: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    fail(`${where} must list 1–${max} entries.`);
  }
  return value;
}

/** The entries' keys; fails with `message` on the first repeated key. */
function distinct<T>(
  entries: readonly T[],
  key: (entry: T) => string,
  message: (entry: T) => string,
): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(key(entry))) {
      fail(message(entry));
    }
    keys.add(key(entry));
  }
  return keys;
}

function unique<T extends { id: string }>(
  entries: readonly T[],
  where: string,
) {
  return distinct(
    entries,
    ({ id: entryId }) => entryId,
    ({ id: entryId }) => `duplicate ${where} id ${entryId}.`,
  );
}

function statBlock(value: unknown, where: string): StatBlock {
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

/** Validates a decoded module, rejecting unknown references and missing endings. */
export function validateFifthAdventure(value: unknown): FifthAdventure {
  if (!isRecord(value) || value.kind !== "dungeon-one-5e-adventure") {
    fail("not a 5e adventure module.");
  }
  if (value.formatVersion !== FIFTH_ADVENTURE_FORMAT) {
    fail(
      `format version ${String(value.formatVersion)} is not ${FIFTH_ADVENTURE_FORMAT}.`,
    );
  }
  const module = exactKeys(
    value,
    [
      "kind",
      "formatVersion",
      "id",
      "title",
      "objective",
      "recommendedLevels",
      "difficulty",
      "startRoomId",
      "rooms",
      "encounters",
      "endings",
    ],
    "the module",
  );
  const levels = exactKeys(
    module.recommendedLevels,
    ["min", "max"],
    "recommendedLevels",
  );
  const min = integer(levels.min, "recommendedLevels min", 1, 3);
  const max = integer(levels.max, "recommendedLevels max", min, 3);
  if (!DIFFICULTIES.includes(module.difficulty as Difficulty)) {
    fail("difficulty must be easy, medium or hard.");
  }
  const endings = list(module.endings, "endings", 20).map((entry, index) => {
    const ending = exactKeys(
      entry,
      ["id", "kind", "title", "text"],
      `ending ${index + 1}`,
    );
    if (ending.kind !== "victory" && ending.kind !== "defeat") {
      fail(`ending ${index + 1} kind must be victory or defeat.`);
    }
    return {
      id: id(ending.id, `ending ${index + 1} id`),
      kind: ending.kind,
      title: text(ending.title, `ending ${index + 1} title`, 80),
      text: text(ending.text, `ending ${index + 1} text`),
    } as FifthEnding;
  });
  unique(endings, "ending");
  if (!endings.some(({ kind }) => kind === "victory")) {
    fail("missing a victory ending.");
  }
  const ending = (
    endingId: unknown,
    kind: FifthEnding["kind"],
    where: string,
  ) => {
    const found = endings.find(({ id: candidate }) => candidate === endingId);
    if (found === undefined) {
      fail(`${where} names unknown ending ${String(endingId)}.`);
    }
    if (found.kind !== kind) {
      fail(`${where} names ${found.id}, which is not a ${kind} ending.`);
    }
    return found.id;
  };
  const encounters = list(module.encounters, "encounters", 20).map(
    (entry, index) => {
      const where = `encounter ${index + 1}`;
      const encounter = exactKeys(
        entry,
        ["id", "opponents", "victoryEndingId", "defeatEndingId"],
        where,
      );
      const opponents = list(encounter.opponents, `${where} opponents`, 8).map(
        (raw, number) => {
          const at = `${where} opponent ${number + 1}`;
          const opponent = exactKeys(
            raw,
            ["id", "name", "description", "statBlock"],
            at,
          );
          return {
            id: id(opponent.id, `${at} id`),
            name: text(opponent.name, `${at} name`, 60),
            description: text(opponent.description, `${at} description`),
            statBlock: statBlock(opponent.statBlock, `${at} statBlock`),
          };
        },
      );
      unique(opponents, `${where} opponent`);
      // The player targets opponents by name, in any case.
      distinct(
        opponents,
        ({ name }) => name.toLowerCase(),
        ({ name }) =>
          `${where} has two opponents named ${name}; give each a name the player can target.`,
      );
      if (opponents.some(({ id: opponentId }) => opponentId === "pc")) {
        fail(`${where} opponent id pc is reserved for the player character.`);
      }
      return {
        id: id(encounter.id, `${where} id`),
        opponents,
        victoryEndingId: ending(encounter.victoryEndingId, "victory", where),
        defeatEndingId: ending(encounter.defeatEndingId, "defeat", where),
      };
    },
  );
  const encounterIds = unique(encounters, "encounter");
  const rooms = list(module.rooms, "rooms", 50).map((entry, index) => {
    const where = `room ${index + 1}`;
    const room = exactKeys(
      entry,
      ["id", "name", "description", "encounterId"],
      where,
    );
    if (!encounterIds.has(room.encounterId as string)) {
      fail(`${where} names unknown encounter ${String(room.encounterId)}.`);
    }
    return {
      id: id(room.id, `${where} id`),
      name: text(room.name, `${where} name`, 80),
      description: text(room.description, `${where} description`),
      encounterId: room.encounterId as string,
    };
  });
  const roomIds = unique(rooms, "room");
  if (!roomIds.has(module.startRoomId as string)) {
    fail(`startRoomId names unknown room ${String(module.startRoomId)}.`);
  }
  return {
    kind: "dungeon-one-5e-adventure",
    formatVersion: FIFTH_ADVENTURE_FORMAT,
    id: id(module.id, "id"),
    title: text(module.title, "title", 80),
    objective: text(module.objective, "objective", 400),
    recommendedLevels: { min, max },
    difficulty: module.difficulty as Difficulty,
    startRoomId: module.startRoomId as string,
    rooms,
    encounters,
    endings,
  };
}

/** A digest of the validated module, so a session can tell if it changed. */
export function adventureDigest(adventure: FifthAdventure): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(adventure)).digest("hex")}`;
}

export function statBlockInitiative(block: StatBlock): number {
  return Math.floor((block.abilities.dexterity - 10) / 2);
}

/** Reads and validates a module file; problems name the file. */
export async function loadFifthAdventure(
  path: string,
): Promise<FifthAdventure> {
  let decoded: unknown;
  try {
    decoded = parseBoundedJson(await readFile(path), 1024 * 1024, 32);
  } catch {
    throw new Error(`${path} is not a readable adventure module.`);
  }
  if (
    isRecord(decoded) &&
    decoded.kind === "dungeon-one-5e-adventure" &&
    decoded.formatVersion !== FIFTH_ADVENTURE_FORMAT
  ) {
    throw new Error(
      `${path} is a 5e adventure module in format version ${String(decoded.formatVersion)}, not ${FIFTH_ADVENTURE_FORMAT}. Move it aside; the file has not been changed.`,
    );
  }
  try {
    return validateFifthAdventure(decoded);
  } catch (error) {
    throw new Error(`${path}: ${(error as Error).message}`);
  }
}

/** The built-in 5e modules, by id, in the order the browser offers them. */
export const FIFTH_ADVENTURE_FILES = {
  "cellar-goblin": "cellar-goblin.json",
  "goblin-storeroom": "goblin-storeroom.json",
} as const;
export type FifthAdventureId = keyof typeof FIFTH_ADVENTURE_FILES;

export async function loadBuiltInFifthAdventures(): Promise<
  readonly FifthAdventure[]
> {
  return Promise.all(
    Object.entries(FIFTH_ADVENTURE_FILES).map(async ([expected, file]) => {
      const adventure = await loadFifthAdventure(
        fileURLToPath(new URL(`../adventures/5e/${file}`, import.meta.url)),
      );
      if (adventure.id !== expected) {
        throw new Error(`adventures/5e/${file} must have id ${expected}.`);
      }
      return adventure;
    }),
  );
}
