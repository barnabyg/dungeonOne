import { randomBytes } from "node:crypto";
import { openSync, writeFileSync, closeSync } from "node:fs";
import { mkdir, readFile, rename, unlink, open } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createCharacter,
  validateCharacter,
  type CharacterSheet,
} from "./character-rules.js";
import { parseBoundedJson } from "./bounded-json.js";
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
};
function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** A single atomic library publication owns all career revisions. The lock is
 * process-owned; a crashed owner's lock is recoverable without guessing expiry. */
export class CharacterLibrary {
  constructor(readonly path: string) {}

  async read(): Promise<LibraryData> {
    let data: unknown;
    try {
      data = parseBoundedJson(await readFile(this.path), 16 * 1024 * 1024, 48);
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
        new Set(record.acceptedReceipts).size !== record.acceptedReceipts.length
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
          !/^[a-f0-9]{32}$/.test(session.generation))
      ) {
        throw new Error("Invalid career session.");
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
    return library;
  }

  async update(
    revision: string,
    change: (data: LibraryData) => void | Promise<void>,
  ): Promise<LibraryData> {
    await mkdir(dirname(this.path), { recursive: true });
    const lockPath = `${this.path}.lock`;
    const lock = JSON.stringify({
      pid: process.pid,
      token: randomBytes(16).toString("hex"),
    });
    for (let attempt = 0; ; attempt++) {
      try {
        const descriptor = openSync(lockPath, "wx");
        try {
          writeFileSync(descriptor, lock);
        } finally {
          closeSync(descriptor);
        }
        break;
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "EEXIST"
          ) ||
          attempt > 1
        ) {
          throw new Error(
            "Character library is busy; refresh before retrying.",
            { cause: error },
          );
        }
        const owner: unknown = JSON.parse(await readFile(lockPath, "utf8"));
        if (
          owner === null ||
          typeof owner !== "object" ||
          !("pid" in owner) ||
          typeof owner.pid !== "number" ||
          !Number.isInteger(owner.pid) ||
          owner.pid <= 0
        ) {
          throw new Error("Character library lock needs local recovery.");
        }
        try {
          process.kill(owner.pid, 0);
          throw new Error(
            "Character library is busy; refresh before retrying.",
          );
        } catch (alive) {
          if (!(
            alive instanceof Error &&
            "code" in alive &&
            alive.code === "ESRCH"
          )) {
            throw alive;
          }
          await unlink(lockPath);
        }
      }
    }
    try {
      const data = await this.read();
      if (data.revision !== revision) {
        throw new Error(
          "Character library request is stale; refresh before retrying.",
        );
      }
      await change(data);
      data.revision = randomBytes(16).toString("hex");
      const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
      const file = await open(temporary, "wx");
      try {
        await file.writeFile(`${JSON.stringify(data)}\n`);
        await file.sync();
        await file.close();
        await rename(temporary, this.path);
      } finally {
        await file.close().catch(() => undefined);
        await unlink(temporary).catch(() => undefined);
      }
      return data;
    } finally {
      if ((await readFile(lockPath, "utf8")) === lock) {
        await unlink(lockPath);
      }
    }
  }

  create(name: string, preset: string, revision: string): Promise<LibraryData> {
    const sheet = createCharacter(name, preset);
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
