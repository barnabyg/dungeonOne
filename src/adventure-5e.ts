/**
 * The 5e adventure module format (format version 4) and its validator.
 *
 * A module declares its recommended levels and difficulty, its rooms and the
 * passages between them, the features to examine, items to take and creatures
 * to talk to in each room, the encounters with inline SRD 5.2 stat blocks, and
 * its endings. A passage may have a door, stuck (forced open by a check) or
 * locked (opened by its key, or picked or broken open by a check), and a trap,
 * found and disarmed by checks or sprung by going through, with a saving
 * throw against its damage. A creature's topics may need a check. Each
 * opponent in an encounter has its own name, so the player can target it.
 * Treasure is an item hidden in a feature or carried by an opponent, so it
 * is only ever found by examining: the feature, or the opponent's body once
 * its fight is won. A room may be an exit, where the player can choose to leave: the
 * adventure then ends in its escape-with-loot ending when the character
 * carries treasure, and its escape-without-loot ending otherwise. A victory
 * or escape ending may award XP, on top of each won encounter's stat-block XP.
 *
 * Validation names the first problem it finds. A module in any other format
 * version is refused with a message naming the file.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoundedJson } from "./bounded-json.js";
import type { CheckSpec } from "./checks-5e.js";
import {
  ABILITIES,
  FIGHTER_SKILLS,
  type Abilities,
  type Ability,
  type FighterSkill,
} from "./fighter-5e.js";

export const FIFTH_ADVENTURE_FORMAT = 4;
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
  /** Winning ends the adventure here; without one, exploring goes on. */
  victoryEndingId?: string;
  defeatEndingId: string;
}>;

/** Something in a room to examine; examining it makes its discovery. */
export type FifthFeature = Readonly<{
  id: string;
  name: string;
  description: string;
  discovery?: string;
}>;

/**
 * What each kind of item does: the SRD 5.2 Potion of Healing heals, a key
 * opens the locked doors that name it, and treasure is kept on surviving.
 */
export const ITEM_KINDS = {
  "potion-of-healing": { healing: { dice: 2, sides: 4, modifier: 2 } },
  key: {},
  treasure: {},
} as const;
export type ItemKind = keyof typeof ITEM_KINDS;

/**
 * An item placed in a room. One hidden in a feature is found by examining it;
 * one carried by an opponent, by searching its body once the fight is won.
 */
export type FifthItem = Readonly<{
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  /** The feature it is hidden in, or the opponent carrying it. */
  hiddenIn?: string;
}>;

/** Something to ask a creature about; a check, if any, decides its answer. */
export type FifthTopic = Readonly<{
  id: string;
  name: string;
  /** What the creature says, after a passed check when there is one. */
  reply: string;
  check?: CheckSpec;
  /** What it says after a failed check; present exactly with `check`. */
  failure?: string;
}>;

/** A creature the character can talk to, about its authored topics only. */
export type FifthCreature = Readonly<{
  id: string;
  name: string;
  description: string;
  topics: readonly FifthTopic[];
}>;

export type FifthRoom = Readonly<{
  id: string;
  name: string;
  description: string;
  /** The fight that begins when the character enters. */
  encounterId?: string;
  /** The character may leave the adventure from here. */
  exit?: true;
  features: readonly FifthFeature[];
  items: readonly FifthItem[];
  creatures: readonly FifthCreature[];
}>;

/**
 * A shut door in a passage. A stuck door is forced open; a locked one opens
 * with its key, or is picked or broken open. Each check is tried once.
 */
export type FifthDoor = Readonly<{
  id: string;
  name: string;
  description: string;
  state: "stuck" | "locked";
  force?: CheckSpec;
  pick?: CheckSpec;
  break?: CheckSpec;
  keyItemId?: string;
}>;

/**
 * A hidden trap in a passage: found by a check (searching either room),
 * disarmed by a check once found, or sprung by going through while armed,
 * with a saving throw for half damage.
 */
export type FifthTrap = Readonly<{
  id: string;
  name: string;
  description: string;
  find: CheckSpec;
  disarm: CheckSpec;
  trigger: string;
  save: Readonly<{ ability: Ability; dc: number }>;
  damage: Readonly<{
    dice: number;
    sides: number;
    modifier: number;
    type: string;
  }>;
  /** Where the adventure ends if the trap's damage drops the character. */
  defeatEndingId: string;
}>;

/** A two-way way between two rooms. */
export type FifthPassage = Readonly<{
  id: string;
  between: readonly [string, string];
  description: string;
  door?: FifthDoor;
  trap?: FifthTrap;
}>;

export const ENDING_KINDS = [
  "victory",
  "escape-with-loot",
  "escape-without-loot",
  "defeat",
] as const;
export type EndingKind = (typeof ENDING_KINDS)[number];

export type FifthEnding = Readonly<{
  id: string;
  kind: EndingKind;
  title: string;
  text: string;
  /** XP for reaching this ending; never on a defeat. */
  xp?: number;
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
  passages: readonly FifthPassage[];
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

function list(value: unknown, where: string, max: number, min = 1): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${where} must list ${min}–${max} entries.`);
  }
  return value;
}

/** Like `exactKeys`, but the `optional` keys may be left out. */
function knownKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  where: string,
): Record<string, unknown> {
  if (
    !isRecord(value) ||
    !required.every((key) => key in value) ||
    !Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  ) {
    fail(
      `${where} must have ${required.join(", ")}${optional.length === 0 ? "" : ` and may have ${optional.join(", ")}`}, and nothing else.`,
    );
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

function ability(value: unknown, where: string): Ability {
  if (!(ABILITIES as readonly unknown[]).includes(value)) {
    fail(`${where} must be an ability.`);
  }
  return value as Ability;
}

/** An authored check: `{ skill, dc }` or `{ ability, dc }`. */
function check(value: unknown, where: string): CheckSpec {
  const raw =
    isRecord(value) && "skill" in value
      ? exactKeys(value, ["skill", "dc"], where)
      : exactKeys(value, ["ability", "dc"], where);
  const dc = integer(raw.dc, `${where} dc`, 5, 30);
  if ("skill" in raw) {
    if (
      typeof raw.skill !== "string" ||
      !Object.hasOwn(FIGHTER_SKILLS, raw.skill)
    ) {
      fail(
        `${where} skill must be one of ${Object.keys(FIGHTER_SKILLS).join(", ")}.`,
      );
    }
    return { skill: raw.skill as FighterSkill, dc };
  }
  return { ability: ability(raw.ability, `${where} ability`), dc };
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
      "passages",
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
    const where = `ending ${index + 1}`;
    const ending = knownKeys(
      entry,
      ["id", "kind", "title", "text"],
      ["xp"],
      where,
    );
    if (!(ENDING_KINDS as readonly unknown[]).includes(ending.kind)) {
      fail(`${where} kind must be ${ENDING_KINDS.join(", ")}.`);
    }
    if (ending.kind === "defeat" && ending.xp !== undefined) {
      fail(`${where}: a defeat ending awards no XP.`);
    }
    return {
      id: id(ending.id, `${where} id`),
      kind: ending.kind as EndingKind,
      title: text(ending.title, `${where} title`, 80),
      text: text(ending.text, `${where} text`),
      ...(ending.xp === undefined
        ? {}
        : { xp: integer(ending.xp, `${where} xp`, 1, 10000) }),
    };
  });
  unique(endings, "ending");
  if (!endings.some(({ kind }) => kind !== "defeat")) {
    fail("missing a victory or escape ending.");
  }
  for (const kind of ["escape-with-loot", "escape-without-loot"] as const) {
    if (endings.filter((ending) => ending.kind === kind).length > 1) {
      fail(`more than one ${kind} ending.`);
    }
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
      const encounter = knownKeys(
        entry,
        ["id", "opponents", "defeatEndingId"],
        ["victoryEndingId"],
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
        ...(encounter.victoryEndingId === undefined
          ? {}
          : {
              victoryEndingId: ending(
                encounter.victoryEndingId,
                "victory",
                where,
              ),
            }),
        defeatEndingId: ending(encounter.defeatEndingId, "defeat", where),
      };
    },
  );
  const encounterIds = unique(encounters, "encounter");
  const rooms = list(module.rooms, "rooms", 50).map((entry, index) => {
    const where = `room ${index + 1}`;
    const room = knownKeys(
      entry,
      ["id", "name", "description", "features", "items"],
      ["encounterId", "creatures", "exit"],
      where,
    );
    if (room.exit !== undefined && room.exit !== true) {
      fail(`${where} exit must be true, or left out.`);
    }
    if (
      room.encounterId !== undefined &&
      !encounterIds.has(room.encounterId as string)
    ) {
      fail(`${where} names unknown encounter ${String(room.encounterId)}.`);
    }
    const features = list(room.features, `${where} features`, 12, 0).map(
      (raw, number) => {
        const at = `${where} feature ${number + 1}`;
        const feature = knownKeys(
          raw,
          ["id", "name", "description"],
          ["discovery"],
          at,
        );
        return {
          id: id(feature.id, `${at} id`),
          name: text(feature.name, `${at} name`, 60),
          description: text(feature.description, `${at} description`),
          ...(feature.discovery === undefined
            ? {}
            : { discovery: text(feature.discovery, `${at} discovery`) }),
        };
      },
    );
    // The player examines features by name, in any case.
    distinct(
      features,
      ({ name }) => name.toLowerCase(),
      ({ name }) => `${where} has two features named ${name}.`,
    );
    const items = list(room.items, `${where} items`, 12, 0).map(
      (raw, number) => {
        const at = `${where} item ${number + 1}`;
        const item = knownKeys(
          raw,
          ["id", "name", "description", "kind"],
          ["hiddenIn"],
          at,
        );
        if (!Object.hasOwn(ITEM_KINDS, item.kind as string)) {
          fail(
            `${at} kind must be one of ${Object.keys(ITEM_KINDS).join(", ")}.`,
          );
        }
        if (item.kind === "treasure" && item.hiddenIn === undefined) {
          fail(
            `${at} is treasure, so it must be hidden in a feature or carried by an opponent.`,
          );
        }
        // An opponent of this room's fight may carry it: searching its body
        // once the fight is won finds it.
        const fight = encounters.find(
          ({ id: encounterId }) => encounterId === room.encounterId,
        );
        const carrier = fight?.opponents.find(
          ({ id: opponentId }) => opponentId === item.hiddenIn,
        );
        if (carrier !== undefined && fight!.victoryEndingId !== undefined) {
          fail(
            `${at} is carried by ${carrier.id}, whose fight ends the adventure, so its body can never be searched.`,
          );
        }
        if (item.hiddenIn !== undefined && carrier === undefined) {
          const holder = features.find(
            ({ id: featureId }) => featureId === item.hiddenIn,
          );
          if (holder === undefined) {
            fail(
              `${at} is hidden in unknown feature ${String(item.hiddenIn)}.`,
            );
          }
          if (holder.discovery === undefined) {
            fail(
              `${at} is hidden in ${holder.id}, which has no discovery to reveal it.`,
            );
          }
        }
        return {
          id: id(item.id, `${at} id`),
          name: text(item.name, `${at} name`, 60),
          description: text(item.description, `${at} description`),
          kind: item.kind as ItemKind,
          ...(item.hiddenIn === undefined
            ? {}
            : { hiddenIn: item.hiddenIn as string }),
        };
      },
    );
    const creatures = (
      room.creatures === undefined
        ? []
        : list(room.creatures, `${where} creatures`, 6, 0)
    ).map((raw, number) => {
      const at = `${where} creature ${number + 1}`;
      const creature = exactKeys(
        raw,
        ["id", "name", "description", "topics"],
        at,
      );
      const topics = list(creature.topics, `${at} topics`, 12).map(
        (rawTopic, index) => {
          const on = `${at} topic ${index + 1}`;
          const topic = knownKeys(
            rawTopic,
            ["id", "name", "reply"],
            ["check", "failure"],
            on,
          );
          const topicId = id(topic.id, `${on} id`);
          if ((topic.check === undefined) !== (topic.failure === undefined)) {
            fail(
              topic.check === undefined
                ? `topic ${topicId} has a failure but no check.`
                : `topic ${topicId} has a check but no failure.`,
            );
          }
          return {
            id: topicId,
            name: text(topic.name, `${on} name`, 60),
            reply: text(topic.reply, `${on} reply`),
            ...(topic.check === undefined
              ? {}
              : {
                  check: check(topic.check, `${on} check`),
                  failure: text(topic.failure, `${on} failure`),
                }),
          };
        },
      );
      // The player asks about topics by name, in any case.
      distinct(
        topics,
        ({ name }) => name.toLowerCase(),
        ({ name }) => `${at} has two topics named ${name}.`,
      );
      return {
        id: id(creature.id, `${at} id`),
        name: text(creature.name, `${at} name`, 60),
        description: text(creature.description, `${at} description`),
        topics,
      };
    });
    return {
      id: id(room.id, `${where} id`),
      name: text(room.name, `${where} name`, 80),
      description: text(room.description, `${where} description`),
      ...(room.encounterId === undefined
        ? {}
        : { encounterId: room.encounterId as string }),
      ...(room.exit === true ? { exit: true as const } : {}),
      features,
      items,
      creatures,
    };
  });
  const roomIds = unique(rooms, "room");
  if (!roomIds.has(module.startRoomId as string)) {
    fail(`startRoomId names unknown room ${String(module.startRoomId)}.`);
  }
  const placed = rooms.flatMap(({ encounterId }) =>
    encounterId === undefined ? [] : [encounterId],
  );
  distinct(
    placed,
    (encounterId) => encounterId,
    (encounterId) => `encounter ${encounterId} is in more than one room.`,
  );
  for (const { id: encounterId } of encounters) {
    if (!placed.includes(encounterId)) {
      fail(`encounter ${encounterId} is in no room.`);
    }
  }
  const door = (value: unknown, where: string): FifthDoor => {
    const raw = knownKeys(
      value,
      ["id", "name", "description", "state"],
      ["force", "pick", "break", "keyItemId"],
      where,
    );
    const doorId = id(raw.id, `${where} id`);
    const checks = {
      ...(raw.force === undefined
        ? {}
        : { force: check(raw.force, `${where} force`) }),
      ...(raw.pick === undefined
        ? {}
        : { pick: check(raw.pick, `${where} pick`) }),
      ...(raw.break === undefined
        ? {}
        : { break: check(raw.break, `${where} break`) }),
    };
    if (raw.state === "stuck") {
      if (
        checks.pick !== undefined ||
        checks.break !== undefined ||
        raw.keyItemId !== undefined
      ) {
        fail(`door ${doorId}: a stuck door is opened only by force.`);
      }
      if (checks.force === undefined) {
        fail(`door ${doorId}: a stuck door needs force.`);
      }
    } else if (raw.state === "locked") {
      if (checks.force !== undefined) {
        fail(`door ${doorId}: a locked door is not forced; pick or break it.`);
      }
      if (
        checks.pick === undefined &&
        checks.break === undefined &&
        raw.keyItemId === undefined
      ) {
        fail(`door ${doorId}: a locked door needs a key, pick or break.`);
      }
    } else {
      fail(`${where} state must be stuck or locked.`);
    }
    return {
      id: doorId,
      name: text(raw.name, `${where} name`, 60),
      description: text(raw.description, `${where} description`),
      state: raw.state,
      ...checks,
      ...(raw.keyItemId === undefined
        ? {}
        : { keyItemId: id(raw.keyItemId, `${where} keyItemId`) }),
    };
  };
  const trap = (value: unknown, where: string): FifthTrap => {
    const raw = exactKeys(
      value,
      [
        "id",
        "name",
        "description",
        "find",
        "disarm",
        "trigger",
        "save",
        "damage",
        "defeatEndingId",
      ],
      where,
    );
    const save = exactKeys(raw.save, ["ability", "dc"], `${where} save`);
    const damage = exactKeys(
      raw.damage,
      ["dice", "sides", "modifier", "type"],
      `${where} damage`,
    );
    return {
      id: id(raw.id, `${where} id`),
      name: text(raw.name, `${where} name`, 60),
      description: text(raw.description, `${where} description`),
      find: check(raw.find, `${where} find`),
      disarm: check(raw.disarm, `${where} disarm`),
      trigger: text(raw.trigger, `${where} trigger`),
      save: {
        ability: ability(save.ability, `${where} save ability`),
        dc: integer(save.dc, `${where} save dc`, 5, 30),
      },
      damage: {
        dice: integer(damage.dice, `${where} damage dice`, 1, 10),
        sides: integer(damage.sides, `${where} damage sides`, 2, 12),
        modifier: integer(damage.modifier, `${where} damage modifier`, -5, 20),
        type: text(damage.type, `${where} damage type`, 30),
      },
      defeatEndingId: ending(raw.defeatEndingId, "defeat", where),
    };
  };
  const passages = list(module.passages, "passages", 100, 0).map(
    (entry, index) => {
      const where = `passage ${index + 1}`;
      const passage = knownKeys(
        entry,
        ["id", "between", "description"],
        ["door", "trap"],
        where,
      );
      if (!Array.isArray(passage.between) || passage.between.length !== 2) {
        fail(`${where} between must name two rooms.`);
      }
      const [from, to] = passage.between as unknown[];
      for (const end of [from, to]) {
        if (!roomIds.has(end as string)) {
          fail(`${where} names unknown room ${String(end)}.`);
        }
      }
      if (from === to) {
        fail(`${where} leads from ${String(from)} to itself.`);
      }
      return {
        id: id(passage.id, `${where} id`),
        between: [from as string, to as string] as const,
        description: text(passage.description, `${where} description`, 200),
        ...(passage.door === undefined
          ? {}
          : { door: door(passage.door, `${where} door`) }),
        ...(passage.trap === undefined
          ? {}
          : { trap: trap(passage.trap, `${where} trap`) }),
      };
    },
  );
  unique(passages, "passage");
  // Features, items, doors, traps, creatures, topics and the opponents whose
  // bodies can be searched share one namespace: each is an action's target.
  distinct(
    [
      ...encounters.flatMap(({ opponents }) => opponents),
      ...rooms.flatMap(({ features, items, creatures }) => [
        ...features,
        ...items,
        ...creatures,
        ...creatures.flatMap(({ topics }) => topics),
      ]),
      ...passages.flatMap(({ door: shut, trap: armed }) => [
        ...(shut === undefined ? [] : [shut]),
        ...(armed === undefined ? [] : [armed]),
      ]),
    ],
    ({ id: thingId }) => thingId,
    ({ id: thingId }) => `duplicate id ${thingId}.`,
  );
  // The player names doors, in any case.
  distinct(
    passages.flatMap(({ door: shut }) => (shut === undefined ? [] : [shut])),
    ({ name }) => name.toLowerCase(),
    ({ name }) => `two doors named ${name}.`,
  );
  const itemRooms = new Map(
    rooms.flatMap(({ id: roomId, items }) =>
      items.map((item) => [item.id, { item, roomId }] as const),
    ),
  );
  for (const { door: shut } of passages) {
    if (shut?.keyItemId !== undefined) {
      const key = itemRooms.get(shut.keyItemId)?.item;
      if (key === undefined) {
        fail(`door ${shut.id} names unknown key ${shut.keyItemId}.`);
      }
      if (key.kind !== "key") {
        fail(`door ${shut.id}'s key ${key.id} is not a key.`);
      }
    }
  }
  distinct(
    passages,
    ({ between }) => [...between].sort().join(" "),
    ({ between: [from, to] }) =>
      `two passages join ${from} and ${to}; one is enough.`,
  );
  // Every room must be reachable from the start.
  const reached = new Set([module.startRoomId as string]);
  for (let grew = true; grew;) {
    grew = false;
    for (const { between } of passages) {
      const [from, to] = between;
      if (reached.has(from) !== reached.has(to)) {
        reached.add(from).add(to);
        grew = true;
      }
    }
  }
  for (const { id: roomId } of rooms) {
    if (!reached.has(roomId)) {
      fail(
        `room ${roomId} cannot be reached from ${String(module.startRoomId)}.`,
      );
    }
  }
  // An essential room (one whose fight wins the adventure) must be reachable
  // without a check or a trap. A locked door counts as open when its key can
  // be reached that way.
  const free = new Set([module.startRoomId as string]);
  const passable = ({ door: shut, trap: armed }: FifthPassage) =>
    armed === undefined &&
    (shut === undefined ||
      (shut.keyItemId !== undefined &&
        free.has(itemRooms.get(shut.keyItemId)!.roomId)));
  for (let grew = true; grew;) {
    grew = false;
    for (const entry of passages) {
      const [from, to] = entry.between;
      if (free.has(from) !== free.has(to) && passable(entry)) {
        free.add(from).add(to);
        grew = true;
      }
    }
  }
  const winning = new Set(
    encounters.flatMap(({ id: encounterId, victoryEndingId }) =>
      victoryEndingId === undefined ? [] : [encounterId],
    ),
  );
  for (const { id: roomId, encounterId } of rooms) {
    if (
      encounterId !== undefined &&
      winning.has(encounterId) &&
      !free.has(roomId)
    ) {
      // The rooms the essential one joins without passing the free rooms;
      // the guards are on the passages from the free rooms into them.
      const beyond = new Set([roomId]);
      for (let grew = true; grew;) {
        grew = false;
        for (const { between } of passages) {
          const [from, to] = between;
          if (
            !free.has(from) &&
            !free.has(to) &&
            beyond.has(from) !== beyond.has(to)
          ) {
            beyond.add(from).add(to);
            grew = true;
          }
        }
      }
      const guards = passages.flatMap((entry) => {
        const [from, to] = entry.between;
        return (free.has(from) && beyond.has(to)) ||
          (free.has(to) && beyond.has(from))
          ? [entry.door?.id, entry.trap?.id].filter(
              (guard): guard is string => guard !== undefined,
            )
          : [];
      });
      fail(
        `room ${roomId} is essential, but every route to it needs a check or passes a trap (${guards.join(", ")}).`,
      );
    }
  }
  // Leaving from an exit reaches the escape endings: with loot only when
  // there is treasure to carry out. Like an essential room, some exit must
  // be reachable without a check or a trap.
  const hasExit = rooms.some(({ exit }) => exit === true);
  if (
    hasExit &&
    !rooms.some(({ id: roomId, exit }) => exit && free.has(roomId))
  ) {
    fail(
      "every exit needs a check or passes a trap; one must be free to reach.",
    );
  }
  const hasTreasure = rooms.some(({ items }) =>
    items.some(({ kind }) => kind === "treasure"),
  );
  const escapes = new Set(endings.map(({ kind }) => kind));
  if (hasExit && !escapes.has("escape-without-loot")) {
    fail("an exit needs an escape-without-loot ending.");
  }
  if (hasExit && hasTreasure && !escapes.has("escape-with-loot")) {
    fail("an exit with treasure to find needs an escape-with-loot ending.");
  }
  for (const { id: endingId, kind } of endings) {
    if (kind === "escape-with-loot" || kind === "escape-without-loot") {
      if (!hasExit) {
        fail(
          `escape ending ${endingId} cannot be reached: no room is an exit.`,
        );
      }
      if (kind === "escape-with-loot" && !hasTreasure) {
        fail(
          `escape-with-loot ending ${endingId} cannot be reached: there is no treasure.`,
        );
      }
    }
  }
  // Every other ending must be reachable: an encounter or a trap names it.
  for (const { id: endingId, kind } of endings) {
    if (
      kind !== "escape-with-loot" &&
      kind !== "escape-without-loot" &&
      !encounters.some(
        ({ victoryEndingId, defeatEndingId }) =>
          victoryEndingId === endingId || defeatEndingId === endingId,
      ) &&
      !passages.some(({ trap: armed }) => armed?.defeatEndingId === endingId)
    ) {
      fail(
        `ending ${endingId} cannot be reached: no encounter or trap names it.`,
      );
    }
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
    passages,
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

/**
 * The order the browser offers modules in: by recommended level range, lowest
 * first, then by difficulty, easy to hard, then by id. Returns a new array.
 */
export function orderFifthAdventures<
  T extends Pick<FifthAdventure, "id" | "recommendedLevels" | "difficulty">,
>(adventures: readonly T[]): T[] {
  return [...adventures].sort(
    (a, b) =>
      a.recommendedLevels.min - b.recommendedLevels.min ||
      a.recommendedLevels.max - b.recommendedLevels.max ||
      DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The built-in 5e modules, by id. The browser offers them in
 * `orderFifthAdventures` order.
 */
export const FIFTH_ADVENTURE_FILES = {
  "cellar-goblin": "cellar-goblin.json",
  "goblin-storeroom": "goblin-storeroom.json",
  "robbers-barrow": "robbers-barrow.json",
  "smugglers-cellar": "smugglers-cellar.json",
  "warden-crypt": "warden-crypt.json",
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
