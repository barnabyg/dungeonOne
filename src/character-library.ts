import { randomBytes } from "node:crypto";
import { acquireFileLock } from "./file-lock.js";
import { mkdir, readFile } from "node:fs/promises";
import { writeFileAtomically } from "./atomic-file.js";
import { dirname } from "node:path";
import {
  createCharacter,
  createRolledCharacter,
  validateCharacter,
  TREASURE_CHARACTER_RULES,
  type AbilityRolls,
  type CharacterSheet,
} from "./character-rules.js";
import { parseBoundedJson } from "./bounded-json.js";
import type { SaveSession } from "./save.js";
import type { AdventureDefinition } from "./adventure-loader.js";

export type CharacterRecord = {
  sheet: CharacterSheet;
  revision: number;
  availability: "ready" | "rest-needed" | "defeated" | "active";
  activeSessionId?: string;
  earnedRewards: string[];
  acceptedReceipts: string[];
};
export type LibraryData = {
  kind: "dungeon-one-characters";
  formatVersion: 1;
  revision: string;
  characters: CharacterRecord[];
  sessions: CareerSession[];
  selectedSessionId?: string;
};
export type CareerSession = {
  id: string;
  characterId: string;
  characterRevision: number;
  startingCharacter: CharacterSheet;
  seed: number;
  content: AdventureDefinition;
  status: "starting" | "playing" | "victory" | "defeat" | "abandoned";
  generation?: string;
  progress?: SaveSession["progress"];
  receipt?: Readonly<{
    id: string;
    stateDigest: string;
    outcome: string;
    characterResult: CharacterSheet;
  }>;
};
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
const MAX_LIBRARY_BYTES = 16 * 1024 * 1024;
function validProgress(progress: SaveSession["progress"] | undefined): boolean {
  return (
    progress !== undefined &&
    Number.isSafeInteger(progress.sequence) &&
    progress.sequence >= 0 &&
    Number.isSafeInteger(progress.randomPosition) &&
    progress.randomPosition >= 0 &&
    /^sha256:[a-f0-9]{64}$/.test(progress.stateDigest)
  );
}

/** A single atomic library publication owns all career revisions, protected by
 * OS-owned exclusion which automatically releases after a crashed process. */
export class CharacterLibrary {
  constructor(readonly path: string) {}

  async read(): Promise<LibraryData> {
    let data: unknown;
    try {
      data = parseBoundedJson(await readFile(this.path), MAX_LIBRARY_BYTES, 48);
    } catch (error) {
      if (!missing(error)) {
        throw error;
      }
      return {
        kind: "dungeon-one-characters",
        formatVersion: 1,
        revision: "0".repeat(32),
        characters: [],
        sessions: [],
      };
    }
    if (data === null || typeof data !== "object") {
      throw new Error("Invalid character library.");
    }
    const library = data as LibraryData;
    if (
      library.kind !== "dungeon-one-characters" ||
      library.formatVersion !== 1 ||
      !/^[a-f0-9]{32}$/.test(library.revision) ||
      !Array.isArray(library.characters) ||
      library.characters.length > 1000 ||
      !Array.isArray(library.sessions) ||
      library.sessions.length > 10000
    ) {
      throw new Error("Invalid character library format.");
    }
    const ids = new Set<string>();
    for (const record of library.characters) {
      record.sheet = validateCharacter(record.sheet);
      if (
        ids.has(record.sheet.id) ||
        !Number.isSafeInteger(record.revision) ||
        record.revision < 1 ||
        !["ready", "rest-needed", "defeated", "active"].includes(
          record.availability,
        ) ||
        !Array.isArray(record.earnedRewards) ||
        !Array.isArray(record.acceptedReceipts) ||
        [...record.earnedRewards, ...record.acceptedReceipts].some(
          (id) => typeof id !== "string" || id.length > 128,
        ) ||
        new Set(record.earnedRewards).size !== record.earnedRewards.length ||
        new Set(record.acceptedReceipts).size !==
          record.acceptedReceipts.length ||
        JSON.stringify(record.earnedRewards) !==
          JSON.stringify(record.sheet.earnedRewards) ||
        record.acceptedReceipts.some((id) => !/^[a-f0-9]{64}$/.test(id)) ||
        (record.availability === "defeated") !== (record.sheet.hp === 0)
      ) {
        throw new Error("Invalid character record.");
      }
      ids.add(record.sheet.id);
    }
    const sessions = new Set<string>();
    for (const session of library.sessions) {
      validateCharacter(session.startingCharacter);
      if (
        !/^[a-f0-9]{32}$/.test(session.id) ||
        sessions.has(session.id) ||
        !ids.has(session.characterId) ||
        session.characterId !== session.startingCharacter.id ||
        !Number.isSafeInteger(session.characterRevision) ||
        session.characterRevision < 1 ||
        !Number.isInteger(session.seed) ||
        session.seed < 0 ||
        session.seed > 0xffffffff ||
        !["starting", "playing", "victory", "defeat", "abandoned"].includes(
          session.status,
        ) ||
        (session.generation !== undefined &&
          !/^[a-f0-9]{32}$/.test(session.generation)) ||
        (session.status !== "starting" &&
          (session.generation === undefined ||
            !validProgress(session.progress)))
      ) {
        throw new Error("Invalid career session.");
      }
      if (!["starting", "playing"].includes(session.status)) {
        const receipt = session.receipt;
        const owner = library.characters.find(
          ({ sheet }) => sheet.id === session.characterId,
        )!;
        if (
          receipt === undefined ||
          !/^[a-f0-9]{64}$/.test(receipt.id) ||
          receipt.stateDigest !== session.progress!.stateDigest ||
          receipt.outcome !== session.status ||
          !owner.acceptedReceipts.includes(receipt.id) ||
          validateCharacter(receipt.characterResult).id !== session.characterId
        ) {
          throw new Error("Invalid character completion receipt.");
        }
      } else if (session.receipt !== undefined) {
        throw new Error("Active adventure has a completion receipt.");
      }
      sessions.add(session.id);
    }
    if (
      library.selectedSessionId !== undefined &&
      !sessions.has(library.selectedSessionId)
    ) {
      throw new Error("Selected session is missing.");
    }
    for (const record of library.characters) {
      const active = library.sessions.find(
        (session) => session.id === record.activeSessionId,
      );
      if (
        (record.availability === "active") !== (active !== undefined) ||
        (active !== undefined &&
          (active.characterId !== record.sheet.id ||
            !["starting", "playing"].includes(active.status)))
      ) {
        throw new Error("Character active-session association is invalid.");
      }
    }
    if (
      library.sessions.some(
        (session) =>
          ["starting", "playing"].includes(session.status) &&
          !library.characters.some(
            (record) =>
              record.activeSessionId === session.id &&
              record.revision === session.characterRevision,
          ),
      )
    ) {
      throw new Error("Active adventure has no current character association.");
    }
    return library;
  }

  async update(
    revision: string,
    change: (data: LibraryData) => void | Promise<void>,
  ): Promise<LibraryData> {
    await mkdir(dirname(this.path), { recursive: true });
    const release = await acquireFileLock(this.path);
    try {
      const data = await this.read();
      if (data.revision !== revision) {
        throw new Error(
          "Character library request is stale; refresh before retrying.",
        );
      }
      await change(data);
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

  /** Saves a preset character; new characters carry treasure (#119). */
  async create(
    name: string,
    preset: string,
    revision: string,
  ): Promise<LibraryData> {
    return this.add(
      createCharacter(name, preset, undefined, TREASURE_CHARACTER_RULES),
      revision,
    );
  }

  /** Saves a character from engine-rolled abilities, recording the dice. */
  async createRolled(
    name: string,
    rolls: AbilityRolls,
    revision: string,
  ): Promise<LibraryData> {
    return this.add(
      createRolledCharacter(name, rolls, undefined, TREASURE_CHARACTER_RULES),
      revision,
    );
  }

  private add(sheet: CharacterSheet, revision: string): Promise<LibraryData> {
    return this.update(revision, (data) => {
      if (data.characters.length >= 1000) {
        throw new Error("Character library is full.");
      }
      data.characters.push({
        sheet,
        revision: 1,
        availability: "ready",
        earnedRewards: [],
        acceptedReceipts: [],
      });
    });
  }
}
