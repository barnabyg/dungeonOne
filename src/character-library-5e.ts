/**
 * The 5e character library (format version 27: a pending creation records how
 * its ability scores are made, #509).
 *
 * It holds saved 5e characters and at most one pending creation: the
 * ability-score method of a character being created, as the settings had it
 * when the creation started, and its dice when it rolls (#509). Each
 * character record names its adventure session while one is in progress.
 * Settling an ended session frees the character in
 * the same write that settles it (a victory or an escape: its possessions
 * become what it held at the end, and what it earned is credited) or marks it
 * defeated (a defeat), so a session is settled exactly once; a
 * defeated character cannot start another adventure. Abandoning a session
 * frees the character with nothing credited. Sessions are saved in the
 * `<library>-adventures` directory beside the library. The method and dice
 * are written before anyone sees them and are returned unchanged until a
 * character is saved from them, so reloading, restarting, backing out of
 * creation, changing the setting or deleting a character never rolls again
 * (ADR 0005); only the one reroll a method may offer does (#509). A level-4 character's Ability Score Improvement and new
 * weapon mastery are chosen after settling (#286); until they are, its sheet
 * owes the choice and it cannot start another adventure, so the pending
 * choice is saved with it and survives a reload. A caster's prepared spells
 * change only between adventures, here (#339, D8).
 *
 * A held gem or art object keeps the value it was found with, as the
 * treasure found setting scaled it (format 27, #507). A new character starts
 * with the starting coin setting's purse when it is saved.
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
  prepareSpells,
  learnCantrips,
  addToSpellbook,
  copyScroll,
  chooseExpertise,
  expertiseOwed,
  characterProfile,
  DEFAULT_CLASS,
  levelChoiceWords,
  pendingLevelChoice,
  spellsOwedWords,
  rollAbilitySet,
  settleCharacter,
  validateDice,
  validateCharacter,
  STANDARD_ARRAY,
  type CreationBase,
  type CreationChoices,
  type CharacterSheet,
  type RolledDice,
  type Settlement,
} from "./character-5e.js";
import { ABILITIES, type ClassId } from "./class-5e.js";
import { COIN_VALUES } from "./equipment-5e.js";
import { createSeededRandom } from "./random.js";
import {
  ABILITY_METHODS,
  DEFAULT_SETTINGS,
  type AbilityMethod,
  type GameSettings,
} from "./settings-5e.js";

export const FIFTH_LIBRARY_FORMAT = 28;
const MAX_LIBRARY_BYTES = 16 * 1024 * 1024;
const MAX_CHARACTERS = 1000;

export type PendingCreation = Readonly<{
  /** Which creation this is in the library, counting from 1. */
  number: number;
  /**
   * How its ability scores are made (#509): the setting when it started,
   * kept until a character is saved from it.
   */
  method: AbilityMethod;
  /** Its dice, exactly for a method that rolls. */
  dice?: RolledDice;
  /** For "roll-reroll", exactly: whether its one reroll is used (#509). */
  rerolled?: boolean;
}>;

/** The keys a pending creation of each method has (#509). */
const PENDING_KEYS: Readonly<Record<AbilityMethod, string>> = {
  roll: "dice,method,number",
  "roll-reroll": "dice,method,number,rerolled",
  "standard-array": "method,number",
  "point-buy": "method,number",
};

/** What a pending creation's scores come from (#509). */
export function pendingBase(pending: PendingCreation): CreationBase {
  return pending.method === "standard-array" || pending.method === "point-buy"
    ? pending.method
    : pending.dice!;
}

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

/** The multiset of scores, so placement order does not matter (#509). */
function scoreKey(scores: readonly number[]): string {
  return JSON.stringify([...scores].sort((a, b) => a - b));
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
        !ABILITY_METHODS.includes(pending.method) ||
        Object.keys(pending).sort().join(",") !==
          PENDING_KEYS[pending.method] ||
        pending.number !== library.creationsStarted ||
        ("rerolled" in pending && typeof pending.rerolled !== "boolean")
      ) {
        throw new Error("Invalid pending character creation.");
      }
      if (pending.dice !== undefined) {
        validateDice(pending.dice);
      }
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
   * Returns the pending creation, starting and saving one first by `method`
   * (#509: the settings' ability-score method) if there is none, rolling its
   * dice when the method rolls. While a creation is pending, every call
   * returns it unchanged, its method and dice included, whatever `method`.
   */
  async startCreation(
    method: AbilityMethod = DEFAULT_SETTINGS.abilityScores,
  ): Promise<FifthLibraryData & { pendingCreation: PendingCreation }> {
    if (!ABILITY_METHODS.includes(method)) {
      throw new Error("There is no such ability-score method.");
    }
    const data = await this.update(undefined, (library) => {
      if (library.pendingCreation !== undefined) {
        return false;
      }
      const number = library.creationsStarted + 1;
      library.creationsStarted = number;
      library.pendingCreation =
        method === "standard-array" || method === "point-buy"
          ? { number, method }
          : {
              number,
              method,
              dice: this.roll(`5e-ability-rolls:${this.seed}:${number}`),
              ...(method === "roll-reroll" ? { rerolled: false } : {}),
            };
      return true;
    });
    return data as FifthLibraryData & { pendingCreation: PendingCreation };
  }

  /**
   * Rolls the pending creation's whole set again (#509), once, for the
   * "roll-reroll" method: the new set replaces the old and must be kept. Its
   * dice come from a stream of their own, so the reroll is the same however
   * often the server restarts first.
   */
  async reroll(revision: string): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const pending = this.pending(data);
      if (pending.method !== "roll-reroll") {
        throw new Error("This creation's ability scores have no reroll.");
      }
      if (pending.rerolled === true) {
        throw new Error("The reroll is used; keep these dice.");
      }
      data.pendingCreation = {
        number: pending.number,
        method: pending.method,
        dice: this.roll(
          `5e-ability-rolls:${this.seed}:${pending.number}:reroll`,
        ),
        rerolled: true,
      };
    });
  }

  /** Six rolls of 4d6 from the stream `name` names. */
  private roll(name: string): RolledDice {
    const stream = createHash("sha256").update(name).digest().readUInt32LE(0);
    return rollAbilitySet(createSeededRandom(stream));
  }

  /**
   * Saves a level 1 character of `classId` (#306) from the pending creation
   * (its dice, the standard array or point buy, #509) and the player's
   * choices, with the starting coin `settings` give (#507): the settings of
   * the moment, which change no character saved before.
   */
  async create(
    name: string,
    choices: CreationChoices,
    revision: string,
    classId: ClassId = DEFAULT_CLASS,
    settings: GameSettings = DEFAULT_SETTINGS,
  ): Promise<FifthLibraryData> {
    return this.update(revision, (data) => {
      const pending = this.pending(data);
      this.add(
        data,
        buildCharacter(
          randomBytes(16).toString("hex"),
          name,
          pendingBase(pending),
          choices,
          classId,
        ),
        settings.startingCoin * COIN_VALUES.gp,
      );
    });
  }

  /**
   * Saves a complete new sheet. It must be level 1 with 0 XP at full health,
   * made from exactly the pending creation's dice, or by its method (#509).
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
    // A new level's spells are chosen first (#341).
    const owed = spellsOwedWords(record.sheet);
    if (owed !== undefined) {
      throw new Error(
        `${record.sheet.name} has ${owed} on the character sheet before starting another adventure.`,
      );
    }
    // And Scholar's Expertise (#343).
    if (expertiseOwed(record.sheet) > 0) {
      throw new Error(
        `${record.sheet.name} must choose Scholar's Expertise on the character sheet before starting another adventure.`,
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
   * Prepares `prepared` as `characterId`'s spells (#339, D8): only between
   * adventures. Refused for a character on an adventure, defeated, casting
   * no spells, or with a choice its class doesn't allow; nothing is
   * written then.
   */
  async prepareSpells(
    characterId: string,
    prepared: unknown,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.changeBetweenAdventures(
      characterId,
      revision,
      "prepared spells change only between adventures",
      (sheet) => prepareSpells(sheet, prepared),
    );
  }

  /**
   * Adds `learned` to `characterId`'s cantrips (#342): the ones a new level
   * lets it learn, only between adventures. Refused for a character on an
   * adventure, defeated, owing no cantrip, or with a choice its class
   * doesn't allow; nothing is written then.
   */
  async learnCantrips(
    characterId: string,
    learned: unknown,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.changeBetweenAdventures(
      characterId,
      revision,
      "cantrips are learned only between adventures",
      (sheet) => learnCantrips(sheet, learned),
    );
  }

  /**
   * Writes `written` into `characterId`'s spellbook (#343): the spells a new
   * level adds, only between adventures. Refused for a character on an
   * adventure, defeated, owing none, or with a choice its class doesn't
   * allow; nothing is written then.
   */
  async addToSpellbook(
    characterId: string,
    written: unknown,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.changeBetweenAdventures(
      characterId,
      revision,
      "spells are written into the spellbook only between adventures",
      (sheet) => addToSpellbook(sheet, written),
    );
  }

  /**
   * Copies the spell of the scroll `characterId` holds as `scrollId` into
   * its spellbook (#346), only between adventures: 50 gp a spell level, and
   * the scroll is used up. Refused for a character on an adventure,
   * defeated, without a spellbook, or that can't copy it; nothing is
   * written then.
   */
  async copyScroll(
    characterId: string,
    scrollId: string,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.changeBetweenAdventures(
      characterId,
      revision,
      "spells are copied into the spellbook only between adventures",
      (sheet) => copyScroll(sheet, scrollId),
    );
  }

  /**
   * Chooses `characterId`'s Expertise a new level gives (#343, Scholar),
   * only between adventures. Refused for a character on an adventure,
   * defeated, owing none, or with a skill it may not choose; nothing is
   * written then.
   */
  async chooseExpertise(
    characterId: string,
    chosen: unknown,
    revision: string,
  ): Promise<FifthLibraryData> {
    return this.changeBetweenAdventures(
      characterId,
      revision,
      "Expertise is chosen only between adventures",
      (sheet) => chooseExpertise(sheet, chosen),
    );
  }

  /**
   * Changes `characterId`'s sheet by `change` (#339, #342, #343) when it is neither
   * defeated nor on an adventure (`onAdventure` says why not).
   */
  private async changeBetweenAdventures(
    characterId: string,
    revision: string,
    onAdventure: string,
    change: (sheet: CharacterSheet) => CharacterSheet,
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
        throw new Error(
          `${record.sheet.name} is on an adventure: ${onAdventure}.`,
        );
      }
      data.characters[index] = {
        sheet: change(record.sheet),
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

  /** Adds a new sheet, its purse holding `purse` copper (#507). */
  private add(data: FifthLibraryData, value: unknown, purse = 0): void {
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
    // Its scores come from the pending creation's method (#509): exactly
    // its dice, the standard array, or point buy (the sheet checks the cost).
    const base = pendingBase(this.pending(data));
    if (Array.isArray(base)) {
      const rolls = sheet.abilityRolls;
      if (
        rolls === undefined ||
        rollKey(ABILITIES.map((ability) => rolls[ability])) !== rollKey(base)
      ) {
        throw new Error(
          "A new character must use exactly the pending creation's dice.",
        );
      }
    } else {
      const scores = sheet.baseScores;
      if (
        scores === undefined ||
        (base === "standard-array" &&
          scoreKey(ABILITIES.map((ability) => scores[ability])) !==
            scoreKey(STANDARD_ARRAY))
      ) {
        throw new Error(
          base === "standard-array"
            ? "A new character must use exactly the standard array."
            : "A new character must use point buy.",
        );
      }
    }
    if (data.characters.length >= MAX_CHARACTERS) {
      throw new Error("Character library is full.");
    }
    if (data.characters.some((record) => record.sheet.id === sheet.id)) {
      throw new Error("A character with this identity already exists.");
    }
    data.characters.push({
      sheet: purse === 0 ? sheet : { ...sheet, purse },
      revision: 1,
    });
    delete data.pendingCreation;
  }
}
