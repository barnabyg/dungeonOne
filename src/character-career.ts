import { randomBytes, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  CharacterLibrary,
  type CareerSession,
  type CharacterRecord,
} from "./character-library.js";
import { createDataRuntime } from "./data-runtime.js";
import {
  loadAdventure,
  type ChapelCluesDefinition,
} from "./adventure-loader.js";
import { startableCharacterAdventures } from "./browser-releases.js";
import { SaveSession } from "./save.js";
import { acquireFileLock } from "./file-lock.js";
import { characterProfile, validateCharacter } from "./character-rules.js";

export function matchesCareerSession(
  entry: CareerSession,
  session: SaveSession,
): boolean {
  return (
    entry.generation === session.generation &&
    entry.seed === session.seed &&
    isDeepStrictEqual(entry.content, session.runtime.content?.snapshot) &&
    isDeepStrictEqual(
      entry.startingCharacter,
      session.runtime.startingCharacter,
    ) &&
    entry.progress !== undefined &&
    session.progress.sequence >= entry.progress.sequence &&
    session.progress.randomPosition >= entry.progress.randomPosition &&
    (session.progress.sequence !== entry.progress.sequence ||
      (session.progress.stateDigest === entry.progress.stateDigest &&
        session.progress.randomPosition === entry.progress.randomPosition))
  );
}

export function hasActiveCharacter(
  entry: CareerSession,
  record: CharacterRecord,
): boolean {
  return (
    entry.status === "playing" &&
    record.availability === "active" &&
    record.sheet.id === entry.characterId &&
    record.activeSessionId === entry.id &&
    record.revision === entry.characterRevision
  );
}

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
    const content = (await startableCharacterAdventures()).find(
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
        entry.progress = session.progress;
        entry.status = "playing";
      }
    });
  }

  async select(sessionId: string, revision: string): Promise<string> {
    await this.library.update(revision, async (data) => {
      const entry = data.sessions.find(({ id }) => id === sessionId);
      if (entry === undefined) {
        throw new Error("Choose a retained adventure.");
      }
      data.selectedSessionId = sessionId;
      // The library publishes this selection only if the retained save verifies.
      await SaveSession.load(this.sessionPath(sessionId));
    });
    return this.sessionPath(sessionId);
  }

  async beginTurn(session: SaveSession): Promise<() => Promise<void>> {
    const release = await acquireFileLock(session.path);
    try {
      const data = await this.library.read();
      const entry = data.sessions.find(
        (candidate) => this.sessionPath(candidate.id) === session.path,
      );
      const record = data.characters.find(
        ({ sheet }) => sheet.id === entry?.characterId,
      );
      const durable = await SaveSession.load(session.path);
      if (
        entry === undefined ||
        record === undefined ||
        !hasActiveCharacter(entry, record) ||
        !matchesCareerSession(entry, session) ||
        !isDeepStrictEqual(session.progress, durable.progress)
      ) {
        throw new Error(
          "This character adventure is stale or has no active library association. Restore the current records to continue; this copy remains available for review.",
        );
      }
      return release;
    } catch (error) {
      await release();
      throw error;
    }
  }

  async synchronize(): Promise<void> {
    const data = await this.library.read();
    for (const entry of data.sessions.filter(
      ({ status }) => status === "playing",
    )) {
      await this.acceptSession(this.sessionPath(entry.id));
    }
  }

  async acceptSession(path: string): Promise<void> {
    const session = await SaveSession.load(path);
    if (session.runtime.startingCharacter === undefined) {
      return;
    }
    const data = await this.library.read();
    const existing = data.sessions.find(
      (entry) => this.sessionPath(entry.id) === path,
    );
    if (existing === undefined) {
      throw new Error(
        "Character library association is missing. Restore the original library before career continuation.",
      );
    }
    const state = session.state;
    if (existing.status !== "playing") {
      return;
    }
    if (
      isDeepStrictEqual(existing.progress, session.progress) &&
      state.status === "playing"
    ) {
      return;
    }
    await this.library.update(data.revision, (current) => {
      const entry = current.sessions.find(({ id }) => id === existing.id)!;
      const record = current.characters.find(
        ({ sheet }) => sheet.id === entry.characterId,
      )!;
      if (
        !hasActiveCharacter(entry, record) ||
        !matchesCareerSession(entry, session)
      ) {
        throw new Error(
          "Character result is stale or conflicts with the active career.",
        );
      }
      entry.progress = session.progress;
      if (state.status === "playing") {
        return;
      }
      const outcome = state.status === "quit" ? "abandoned" : state.status;
      if (session.runtime.projectCharacterResult === undefined) {
        throw new Error("Career sessions require a character runtime.");
      }
      const result = validateCharacter(
        session.runtime.projectCharacterResult(state, record.sheet),
      );
      const receiptId = createHash("sha256")
        .update(
          `${entry.id}:${session.generation}:${session.progress.stateDigest}`,
        )
        .digest("hex");
      if (record.acceptedReceipts.includes(receiptId)) {
        throw new Error("Character receipt was already accepted.");
      }
      // Verified session, receipt, reward ledger and character revision become
      // visible in the same atomic library publication. A terminal save written
      // before a crash remains the recoverable source for this publication.
      entry.receipt = {
        id: receiptId,
        stateDigest: session.progress.stateDigest,
        outcome,
        characterResult: result,
      };
      entry.status = outcome;
      record.sheet = result;
      record.earnedRewards = [...result.earnedRewards];
      record.acceptedReceipts.push(receiptId);
      record.revision++;
      record.availability = result.hp === 0 ? "defeated" : "rest-needed";
      delete record.activeSessionId;
    });
  }

  async rest(characterId: string, revision: string): Promise<void> {
    await this.library.update(revision, (data) => {
      const record = data.characters.find(
        ({ sheet }) => sheet.id === characterId,
      );
      if (
        record === undefined ||
        record.availability !== "rest-needed" ||
        record.sheet.hp === 0
      ) {
        throw new Error(
          "Only a surviving character between adventures may rest.",
        );
      }
      record.sheet = {
        ...record.sheet,
        hp: characterProfile(record.sheet).maxHp,
      };
      record.revision++;
      record.availability = "ready";
    });
  }

  async abandon(
    characterId: string,
    revision: string,
    confirmed: boolean,
  ): Promise<void> {
    const data = await this.library.read();
    const record = data.characters.find(
      ({ sheet }) => sheet.id === characterId,
    );
    if (
      data.revision !== revision ||
      record?.activeSessionId === undefined ||
      !confirmed
    ) {
      throw new Error(
        "Confirm abandonment against the current character library. Pending XP and treasure found in the adventure will be discarded.",
      );
    }
    const session = await SaveSession.load(
      this.sessionPath(record.activeSessionId),
    );
    const release = await this.beginTurn(session);
    try {
      await session.commit("quit", session.runtime.parseCommand("quit"));
      await this.acceptSession(session.path);
    } finally {
      await release();
    }
  }
}
