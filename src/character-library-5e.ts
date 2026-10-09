/**
 * The 5e character library (format version 14: a sheet may be a Rogue, with
 * Expertise and no Fighting Style, #306).
 *
 * It holds saved 5e characters and at most one pending creation: the dice of
 * a character being created. Each character record names its adventure session
 * while one is in progress. Settling an ended session frees the character in
 * the same write that settles it (a victory or an escape: its possessions
 * become what it held at the end, and what it earned is credited) or marks it
 * defeated (a defeat), so a session is settled exactly once; a
 * defeated character cannot start another adventure. Abandoning a session
 * frees the character with nothing credited. Sessions are saved in the
 * `<library>-adventures` directory beside the library. The dice are written
 * before anyone sees them and are
 * returned unchanged until a character is saved from them, so reloading,
 * restarting, backing out of creation or deleting a character never rolls
 * again (ADR 0005). A level-4 character's Ability Score Improvement and new
 * weapon mastery are chosen after settling (#286); until they are, its sheet
 * owes the choice and it cannot start another adventure, so the pending
 * choice is saved with it and survives a reload.
 *
 * A library in any other format version is refused with a message naming the
 * file, and left untouched.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { writeFileAtomically } from "./atomic-file.js";
import { parseBoundedJson } from "./bounded-json.js";
import { acquireFileLock } from "./file-lock.js";
import {
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  DEFAULT_CLASS,
  levelChoiceWords,
  pendingLevelChoice,
  rollAbilitySet,
  settleCharacter,
  validateDice,
  validateCharacter,
  type CreationChoices,
  type CharacterSheet,
  type RolledDice,
  type Settlement,
} from "./character-5e.js";
import { ABILITIES, type ClassId } from "./class-5e.js";
import { createSeededRandom } from "./random.js";

export const FIFTH_LIBRARY_FORMAT = 14;
const MAX_LIBRARY_BYTES = 16 * 1024 * 1024;
const MAX_CHARACTERS = 1000;

export type PendingCreation = Readonly<{
  /** Which creation this is in the library, counting from 1. */
  number: number;
  dice: RolledDice;
}>;

export type ActiveSession = Readonly<{ id: string; adventureId: string }>;

export type FifthCharacterRecord = Readonly<{
  sheet: CharacterSheet;
  revision: number;
  /** The adventure session in progress, if any. */
  session?: ActiveSession;
  /** Set when a session ends in defeat (0 HP is instant defeat). */
  defeated?: true;
}>;

export type FifthLibraryData = {
  kind: "dungeon-one-characters";
  formatVersion: typeof FIFTH_LIBRARY_FORMAT;
  revision: string;
  creationsStarted: number;
  /** Adventure sessions started; numbers each session's dice stream. */
  sessionsStarted: number;
  pendingCreation?: PendingCreation;
  characters: FifthCharacterRecord[];
};

const SESSION_ID = /^[a-f0-9]{32}$/;

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function moveAside(path: string, found: string): Error {
  return new Error(
    `${path} is ${found}. This build creates 5e characters and cannot read it. Move it aside, or choose another --characters path; the file has not been changed.`,
  );
}

/** The multiset of rolls, so placement order does not matter. */
function rollKey(dice: RolledDice): string {
  return JSON.stringify(dice.map((roll) => roll.join(",")).sort());
}

export class FifthCharacterLibrary {
  /**
   * @param seed The browser's startup seed. Each creation's dice come from
   *   their own stream of it, numbered by the library's creation count.
   */
  constructor(
    readonly path: string,
    readonly seed: number,
  ) {}

  async read(): Promise<FifthLibraryData> {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.path);
    } catch (error) {
      if (missing(error)) {
        return {
          kind: "dungeon-one-characters",
          formatVersion: FIFTH_LIBRARY_FORMAT,
          revision: "0".repeat(32),
          creationsStarted: 0,
          sessionsStarted: 0,
          characters: [],
        };
      }
      throw error;
    }
    let data: unknown;
    try {
      data = parseBoundedJson(bytes, MAX_LIBRARY_BYTES, 48);
    } catch {
      throw new Error(`Invalid character library ${this.path}.`);
    }
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !("kind" in data) ||
      data.kind !== "dungeon-one-characters"
    ) {
      throw new Error(`Invalid character library ${this.path}.`);
    }
    const library = data as FifthLibraryData;
    const version = library.formatVersion as unknown;
    if (version === 1) {
      throw moveAside(
        this.path,
        "a pre-5e character library (format version 1)",
      );
    }
    if (
      version === 2 ||
      version === 3 ||
      version === 4 ||
      version === 5 ||
      version === 6 ||
      version === 7 ||
      version === 8 ||
      version === 9 ||
      version === 10 ||
      version === 11 ||
      version === 12 ||
      version === 13
    ) {
      throw moveAside(
        this.path,
        `a 5e character library from an earlier build (format version ${version})`,
      );
    }
    if (version !== FIFTH_LIBRARY_FORMAT) {
      throw moveAside(
        this.path,
        `a character library in format version ${String(version)}, not ${FIFTH_LIBRARY_FORMAT}`,
      );
    }
    const keys = Object.keys(library).sort().join(",");
    if (
      (keys !==
        "characters,creationsStarted,formatVersion,kind,revision,sessionsStarted" &&
        keys !==
          "characters,creationsStarted,formatVersion,kind,pendingCreation,revision,sessionsStarted") ||
      !/^[a-f0-9]{32}$/.test(library.revision) ||
      !Number.isSafeInteger(library.creationsStarted) ||
      library.creationsStarted < 0 ||
      !Number.isSafeInteger(library.sessionsStarted) ||
      library.sessionsStarted < 0 ||
      !Array.isArray(library.characters) ||
      library.characters.length > MAX_CHARACTERS
    ) {
      throw new Error(`Invalid character library ${this.path}.`);
    }
    const pending = library.pendingCreation;
    if (pending !== undefined) {
      if (
        pending === null ||
        typeof pending !== "object" ||
        Object.keys(pending).sort().join(",") !== "dice,number" ||
        pending.number !== library.creationsStarted
      ) {
        throw new Error("Invalid pending character creation.");
      }
      validateDice(pending.dice);
    }
    const ids = new Set<string>();
    const sessions = new Set<string>();
    library.characters = library.characters.map((record) => {
      const session = record?.session as unknown;
      if (
        record === null ||
        typeof record !== "object" ||
        !Object.keys(record).every((key) =>
          ["revision", "sheet", "session", "defeated"].includes(key),
        ) ||
        !Number.isSafeInteger(record.revision) ||
        record.revision < 1 ||
        ("defeated" in record && record.defeated !== true) ||
        ("session" in record &&
          (record.defeated === true ||
            session === null ||
            typeof session !== "object" ||
            Object.keys(session).sort().join(",") !== "adventureId,id" ||
            !SESSION_ID.test(record.session!.id) ||
            typeof record.session!.adventureId !== "string" ||
            sessions.has(record.session!.id)))
      ) {
        throw new Error("Invalid character record.");
      }
      const sheet = validateCharacter(record.sheet);
      if (ids.has(sheet.id)) {
        throw new Error("Invalid character record: duplicate identity.");
      }
      ids.add(sheet.id);
      if (record.session !== undefined) {
        sessions.add(record.session.id);
      }
      return {
        sheet,
        revision: record.revision,
        ...(record.session === undefined
          ? {}
          : {
              session: {
                id: record.session.id,
                adventureId: record.session.adventureId,
              },
            }),
        ...(record.defeated === true ? { defeated: true as const } : {}),
      };
    });
    return library;
  }

  /**
   * Applies `change` under the library's file lock and publishes it. With a
   * `revision`, the change fails unless the library is still at it. A change
   * returning false writes nothing.
   */
  private async update(
    revision: string | undefined,
    change: (data: FifthLibraryData) => boolean | void,
  ): Promise<FifthLibraryData> {
    await mkdir(dirname(this.path), { recursive: true });
    const release = await acquireFileLock(this.path);
    try {
      const data = await this.read();
      if (revision !== undefined && data.revision !== revision) {
        throw new Error(
          "Character library request is stale; refresh before retrying.",
        );
      }
      if (change(data) === false) {
        return data;
      }
      data.revision = randomBytes(16).toString("hex");
      const bytes = `${JSON.stringify(data)}\n`;
      if (Buffer.byteLength(bytes) > MAX_LIBRARY_BYTES) {
        throw new Error(
          "Character library byte limit reached; no change was saved.",
        );
      }
      await writeFileAtomically(this.path, bytes);
      return data;
    } finally {
      await release();
    }
  }

  /**
   * Returns the pending creation, rolling and saving one first if there is
   * none. While a creation is pending, every call returns the same dice.
   */
  async startCreation(): Promise<
    FifthLibraryData & { pendingCreation: PendingCreation }
  > {
    const data = await this.update(undefined, (library) => {
      if (library.pendingCreation !== undefined) {
        return false;
      }
      const number = library.creationsStarted + 1;
      const stream = createHash("sha256")
        .update(`5e-ability-rolls:${this.seed}:${number}`)
        .digest()
        .readUInt32LE(0);
      library.creationsStarted = number;
      library.pendingCreation = {
        number,
        dice: rollAbilitySet(createSeededRandom(stream)),
      };
      return true;
    });
    return data as FifthLibraryData & { pendingCreation: PendingCreation };
  }

  /**
   * Saves a level 1 character of `classId` (#306) from the pending dice and
   * the player's choices.
   */
  async create(
    name: string,
    choices: CreationChoices,
    revision: string,
    classId: ClassId = DEFAULT_CLASS,
  ): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const pending = this.pending(data);
      this.add(
        data,
        buildCharacter(
          randomBytes(16).toString("hex"),
          name,
          pending.dice,
          choices,
          classId,
        ),
      );
    });
  }

  /**
   * Saves a complete new sheet. It must be level 1 with 0 XP at full health,
   * made from exactly the pending creation's dice.
   */
  async save(sheet: unknown, revision: string): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      this.add(data, sheet);
    });
  }

  /** Where the adventure session `id` is saved. */
  sessionPath(id: string): string {
    if (!SESSION_ID.test(id)) {
      throw new Error("Invalid adventure session id.");
    }
    const name = basename(this.path, extname(this.path));
    return join(dirname(this.path), `${name}-adventures`, `${id}.json`);
  }

  /**
   * The index of the character record that may start an adventure. Throws
   * the player-facing reason when it cannot.
   */
  startable(data: FifthLibraryData, characterId: string): number {
    const index = data.characters.findIndex(
      ({ sheet }) => sheet.id === characterId,
    );
    const record = data.characters[index];
    if (record === undefined) {
      throw new Error("There is no such character in the library.");
    }
    if (record.defeated === true) {
      throw new Error(
        `${record.sheet.name} was defeated and cannot start another adventure.`,
      );
    }
    if (record.session !== undefined) {
      throw new Error(`${record.sheet.name} is already on an adventure.`);
    }
    const level = pendingLevelChoice(record.sheet);
    if (level !== undefined) {
      throw new Error(
        `${record.sheet.name} must choose the level ${level} ${levelChoiceWords(record.sheet)} on the character sheet before starting another adventure.`,
      );
    }
    return index;
  }

  /**
   * Makes `characterId`'s pending level choice (#286): its Ability Score
   * Improvement and new weapon mastery. Refused for a character that owes
   * none, is on an adventure or was defeated, and for an illegal choice,
   * such as one raising a score above 20; nothing is written then.
   */
  async chooseLevel(
    characterId: string,
    choice: unknown,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const index = data.characters.findIndex(
        ({ sheet }) => sheet.id === characterId,
      );
      const record = data.characters[index];
      if (record === undefined) {
        throw new Error("There is no such character in the library.");
      }
      if (record.defeated === true) {
        throw new Error(`${record.sheet.name} was defeated.`);
      }
      if (record.session !== undefined) {
        throw new Error(`${record.sheet.name} is on an adventure.`);
      }
      data.characters[index] = {
        sheet: applyLevelChoice(record.sheet, choice),
        revision: record.revision + 1,
      };
    });
  }

  /**
   * Records that `characterId` is playing `session`, the library's session
   * `number` (always the next one). Fails unless the library is still at
   * `revision` and the character may start an adventure.
   */
  async attachSession(
    characterId: string,
    session: ActiveSession,
    number: number,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const index = this.startable(data, characterId);
      if (number !== data.sessionsStarted + 1 || !SESSION_ID.test(session.id)) {
        throw new Error("Invalid adventure session.");
      }
      data.sessionsStarted = number;
      const record = data.characters[index]!;
      data.characters[index] = {
        ...record,
        revision: record.revision + 1,
        session: { id: session.id, adventureId: session.adventureId },
      };
    });
  }

  /**
   * Ends `characterId`'s session `sessionId`. After a victory or an escape the
   * character is settled by `settlement` (its possessions replaced with what
   * it held at the end, each find and award credited once), rests to full
   * health and is free again; after a defeat it is defeated at 0 HP and keeps
   * nothing new. Writes nothing when the record no longer names that session,
   * so repeating it is safe.
   */
  async settleSession(
    characterId: string,
    sessionId: string,
    outcome: "victory" | "escaped" | "defeat",
    settlement?: Settlement,
  ): Promise<FifthLibraryData> {
    if (outcome !== "defeat" && settlement === undefined) {
      throw new Error(
        "Settling a victory or an escape needs what the character holds at the end.",
      );
    }
    return this.update(undefined, (data) => {
      const index = data.characters.findIndex(
        ({ sheet, session }) =>
          sheet.id === characterId && session?.id === sessionId,
      );
      const record = data.characters[index];
      if (record === undefined) {
        return false;
      }
      data.characters[index] = {
        sheet:
          outcome === "defeat"
            ? { ...record.sheet, hp: 0 }
            : settleCharacter(record.sheet, settlement!),
        revision: record.revision + 1,
        ...(outcome === "defeat" ? { defeated: true as const } : {}),
      };
      return true;
    });
  }

  /**
   * Gives up `characterId`'s adventure in progress: the character is free
   * again, with its sheet (possessions, finds, XP and health) as it was at
   * the start.
   * Its session file is left as it is, and nothing can settle it any more.
   */
  async abandonSession(
    characterId: string,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const index = data.characters.findIndex(
        ({ sheet }) => sheet.id === characterId,
      );
      const record = data.characters[index];
      if (record === undefined) {
        throw new Error("There is no such character in the library.");
      }
      if (record.session === undefined) {
        throw new Error(`${record.sheet.name} is not on an adventure.`);
      }
      data.characters[index] = {
        sheet: record.sheet,
        revision: record.revision + 1,
      };
    });
  }

  /**
   * Permanently removes one character. `confirmName` must equal the stored
   * name exactly, case and spaces included. Every other character and the
   * pending creation are left as they are, so deleting is never a reroll.
   */
  async delete(
    characterId: string,
    confirmName: string,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const record = data.characters.find(
        ({ sheet }) => sheet.id === characterId,
      );
      if (record === undefined) {
        throw new Error("There is no such character in the library.");
      }
      if (record.sheet.name !== confirmName) {
        throw new Error(
          "Type the character's name exactly to delete it; nothing was deleted.",
        );
      }
      if (record.session !== undefined) {
        throw new Error(
          `${record.sheet.name} is on an adventure. Finish it before deleting the character; nothing was deleted.`,
        );
      }
      data.characters.splice(data.characters.indexOf(record), 1);
    });
  }

  private pending(data: FifthLibraryData): PendingCreation {
    if (data.pendingCreation === undefined) {
      throw new Error(
        "There is no pending creation; start creating a character first.",
      );
    }
    return data.pendingCreation;
  }

  private add(data: FifthLibraryData, value: unknown): void {
    const sheet = validateCharacter(value);
    if (sheet.level !== 1 || sheet.xp !== 0 || sheet.xpAwards.length > 0) {
      throw new Error("New characters start at level 1 with 0 XP.");
    }
    if (
      sheet.treasure.length > 0 ||
      sheet.finds.length > 0 ||
      sheet.purse > 0
    ) {
      throw new Error("New characters start with no treasure or coin.");
    }
    if (sheet.hp !== characterProfile(sheet).maxHp) {
      throw new Error("New characters start at full health.");
    }
    const dice = ABILITIES.map((ability) => sheet.abilityRolls[ability]);
    if (rollKey(dice) !== rollKey(this.pending(data).dice)) {
      throw new Error(
        "A new character must use exactly the pending creation's dice.",
      );
    }
    if (data.characters.length >= MAX_CHARACTERS) {
      throw new Error("Character library is full.");
    }
    if (data.characters.some((record) => record.sheet.id === sheet.id)) {
      throw new Error("A character with this identity already exists.");
    }
    data.characters.push({ sheet, revision: 1 });
    delete data.pendingCreation;
  }
}
