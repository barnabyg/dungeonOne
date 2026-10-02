import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CharacterLibrary } from "./character-library.js";
import { createDataRuntime } from "./data-runtime.js";
import {
  loadAdventure,
  type ChapelCluesDefinition,
} from "./adventure-loader.js";
import { characterAdventures } from "./adventure-registry.js";
import { SaveSession } from "./save.js";

export class CharacterCareer {
  readonly library: CharacterLibrary;
  constructor(path: string) {
    this.library = new CharacterLibrary(path);
  }

  sessionPath(id: string): string {
    if (!/^[a-f0-9]{32}$/.test(id)) {
      throw new Error("Invalid session identity.");
    }
    return join(
      dirname(this.library.path),
      "character-adventures",
      `${id}.json`,
    );
  }

  async start(
    characterId: string,
    adventureId: string,
    revision: string,
    seed: number,
    confirmed: boolean,
  ): Promise<string> {
    const content = (await characterAdventures()).find(
      ({ snapshot }) => snapshot.id === adventureId,
    );
    if (content === undefined) {
      throw new Error("Choose a supported adventure.");
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error("Invalid adventure seed.");
    }
    const id = randomBytes(16).toString("hex");
    await this.library.update(revision, (data) => {
      const record = data.characters.find(
        ({ sheet }) => sheet.id === characterId,
      );
      if (record === undefined || record.availability !== "ready") {
        throw new Error(
          "Choose an available character; continue its active adventure or rest first.",
        );
      }
      const range = (content.snapshot as ChapelCluesDefinition)
        .characterAdventure!.recommendedLevels;
      if (!confirmed) {
        throw new Error(
          `Confirm the character and adventure pair (recommended levels ${range.minimum}–${range.maximum}).`,
        );
      }
      if (data.sessions.length >= 10000) {
        throw new Error("Adventure record limit reached.");
      }
      createDataRuntime(content, record.sheet);
      record.activeSessionId = id;
      record.availability = "active";
      data.sessions.push({
        id,
        characterId,
        characterRevision: record.revision,
        startingCharacter: record.sheet,
        seed,
        content: content.snapshot,
        status: "starting",
      });
      data.selectedSessionId = id;
    });
    await this.recoverStarts();
    return this.sessionPath(id);
  }

  async recoverStarts(): Promise<void> {
    const data = await this.library.read();
    if (!data.sessions.some(({ status }) => status === "starting")) {
      return;
    }
    await this.library.update(data.revision, async (current) => {
      for (const entry of current.sessions.filter(
        ({ status }) => status === "starting",
      )) {
        const content = loadAdventure(JSON.stringify(entry.content));
        if (!content.ok) {
          throw new Error("Interrupted start has invalid content.");
        }
        const path = this.sessionPath(entry.id);
        await mkdir(dirname(path), { recursive: true });
        let session: SaveSession;
        try {
          session = await SaveSession.load(path);
        } catch (error) {
          if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )) {
            throw error;
          }
          session = await SaveSession.start(
            path,
            createDataRuntime(content.adventure, entry.startingCharacter),
            entry.seed,
            { exclusive: true },
          );
        }
        if (
          session.runtime.content?.digest !== content.adventure.digest ||
          !isDeepStrictEqual(
            session.runtime.startingCharacter,
            entry.startingCharacter,
          ) ||
          session.seed !== entry.seed
        ) {
          throw new Error("Interrupted start differs from its reservation.");
        }
        entry.generation = session.generation;
        entry.status = "playing";
      }
    });
  }

  async select(sessionId: string, revision: string): Promise<string> {
    await this.library.update(revision, async (data) => {
      const entry = data.sessions.find(({ id }) => id === sessionId);
      if (entry === undefined || entry.status === "abandoned") {
        throw new Error("Choose a retained adventure.");
      }
      await SaveSession.load(this.sessionPath(sessionId));
      data.selectedSessionId = sessionId;
    });
    return this.sessionPath(sessionId);
  }
}
