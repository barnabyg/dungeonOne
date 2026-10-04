import { validateCharacter, type CharacterSheet } from "./character-rules.js";
import { createHash, randomBytes } from "node:crypto";
import { link, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  isCharacterSchema,
  loadAdventure,
  type AdventureDefinition,
  type ValidatedAdventure,
} from "./adventure-loader.js";
import { parseBoundedJson } from "./bounded-json.js";
import { createDataRuntime } from "./data-runtime.js";
import {
  createSeededRandom,
  randomStateAt,
  RANDOM_ALGORITHM,
} from "./random.js";
import type {
  AdventureRuntime,
  DmHistory,
  GameToolCall,
  RuntimeAction,
  RuntimeDomainEvent,
  RuntimeEvent,
  RuntimeState,
  RuntimeToolResult,
} from "./runtime-contract.js";
import type { RollRecord } from "./trace.js";
import { projectDmHistory } from "./dm-history.js";
import {
  historyDigest,
  validateBrowserHistory,
  type BrowserHistory,
} from "./browser-history.js";

const SAVE_BYTE_LIMIT = 16 * 1024 * 1024;
const TRANSITION_LIMIT = 10000;

type Transition = Readonly<{
  sequence: number;
  actionId: string;
  rawInput: string;
  action: RuntimeAction;
  source?: "ai-tool";
  rolls: readonly RollRecord[];
  domainEvent: Readonly<{
    type: "actor-relocated" | "action-committed";
    actionId: string;
    locationId?: string;
    actionType: string;
  }>;
  domainEvents?: readonly RuntimeDomainEvent[];
  stateDigest: string;
  randomPosition: number;
  randomState?: number;
}>;

type SaveEnvelope = Readonly<{
  generation?: string;
  browserHistory?: BrowserHistory;
  browserHints?: unknown;
  browserStrongerHints?: unknown;
  browserHistoryDigest?: string;
  kind: "dungeon-one-save";
  formatVersion: 1 | 2 | 3 | 4;
  startingCharacter?: CharacterSheet;
  runtime: Readonly<{
    engineVersion: string;
    rulesVersion: string;
    adventureId: string;
    contentVersion: string;
  }>;
  content: Readonly<{ digest: string; snapshot: AdventureDefinition }>;
  random: Readonly<{ algorithm: typeof RANDOM_ALGORITHM; initialSeed: number }>;
  transitions: readonly Transition[];
  checkpoint: Readonly<{
    sequence: number;
    state: RuntimeState;
    stateDigest: string;
    randomPosition: number;
    randomState?: number;
    status: string;
  }>;
}>;

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

// A runtime is saveable when it records domain events for its transitions.
function requireSaveRuntime(runtime: AdventureRuntime): void {
  if (
    runtime.recordDomainEvents === undefined ||
    runtime.content === undefined ||
    runtime.engineVersion === undefined
  ) {
    throw new Error(
      "Saves require a runtime that records domain events (schema-3 through schema-18 adventures).",
    );
  }
}

function eventFor(
  action: RuntimeAction,
  actionId: string,
  state: RuntimeState,
): Transition["domainEvent"] {
  return action.type === "move" &&
    "locationId" in state &&
    typeof state.locationId === "string"
    ? {
        type: "actor-relocated",
        actionId,
        actionType: action.type,
        locationId: state.locationId,
      }
    : { type: "action-committed", actionId, actionType: action.type };
}

function eventsFor(
  runtime: AdventureRuntime,
  action: RuntimeAction,
  actionId: string,
  before: RuntimeState,
  after: RuntimeState,
  resultEvents: readonly RuntimeEvent[],
  includeSettledEvents = true,
): readonly RuntimeDomainEvent[] {
  return runtime.recordDomainEvents!(
    action,
    actionId,
    before,
    after,
    resultEvents,
    includeSettledEvents,
  );
}

export class SaveSession {
  generation = randomBytes(16).toString("hex");
  browserHistory: BrowserHistory | undefined;
  // Optional derived browser guidance; older save envelopes remain readable.
  browserHints: unknown;
  browserStrongerHints: unknown;

  async saveBrowserStrongerHints(hints: unknown): Promise<void> {
    this.browserStrongerHints = hints;
    await this.persist();
  }

  async saveBrowserHints(hints: unknown): Promise<void> {
    this.browserHints = hints;
    await this.persist();
  }

  get progress(): BrowserHistory["progress"] {
    return {
      sequence: this.transitions.length,
      stateDigest: digest(this.state),
      randomPosition: this.randomPosition,
    };
  }

  async saveBrowserHistory(history: BrowserHistory): Promise<void> {
    this.browserHistory = validateBrowserHistory(
      history,
      historyDigest(history),
      this.progress,
    );
    await this.persist();
  }
  readonly runtime: AdventureRuntime;
  readonly seed: number;
  readonly path: string;
  readonly random: ReturnType<typeof createSeededRandom>;
  state: RuntimeState;
  private transitions: Transition[];
  private randomPosition = 0;
  private seeded: ReturnType<typeof createSeededRandom>;

  dmHistory(state: RuntimeState, speakerId?: string): DmHistory | undefined {
    return projectDmHistory(this.runtime, state, this.transitions, speakerId);
  }

  private constructor(
    path: string,
    runtime: AdventureRuntime,
    seed: number,
    transitions: Transition[],
    state: RuntimeState,
  ) {
    requireSaveRuntime(runtime);
    this.path = path;
    this.runtime = runtime;
    this.seed = seed;
    this.state = state;
    this.transitions = transitions;
    this.seeded = createSeededRandom(seed);
    this.random = {
      nextUint32: () => {
        this.randomPosition++;
        return this.seeded.nextUint32();
      },
      roll: (sides: number) => {
        this.randomPosition++;
        return this.seeded.roll(sides);
      },
    };
  }

  static async start(
    path: string,
    runtime: AdventureRuntime,
    seed: number,
    options: Readonly<{ exclusive?: boolean }> = {},
  ): Promise<SaveSession> {
    const session = new SaveSession(
      path,
      runtime,
      seed,
      [],
      runtime.createSession(),
    );
    await session.persist(options.exclusive ?? false);
    return session;
  }

  /**
   * Loads and replay-verifies a save. `createRuntime` selects the runtime for
   * the embedded content; it defaults to the runtime registry.
   */
  static async load(
    path: string,
    createRuntime: (
      content: ValidatedAdventure,
      character?: CharacterSheet,
    ) => AdventureRuntime = createDataRuntime,
  ): Promise<SaveSession> {
    const recoveryPath = `${path}.recovery`;
    const recovering = await stat(recoveryPath).then(
      () => true,
      (error: unknown) => {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return false;
        }
        throw error;
      },
    );
    const sourcePath = recovering ? recoveryPath : path;
    const info = await stat(sourcePath);
    if (!info.isFile() || info.size > SAVE_BYTE_LIMIT) {
      throw new Error("Save must be a regular file within the size limit.");
    }
    const parsed: unknown = parseBoundedJson(
      await readFile(sourcePath),
      SAVE_BYTE_LIMIT,
      48,
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid save envelope.");
    }
    const save = parsed as SaveEnvelope;
    if (
      save.kind !== "dungeon-one-save" ||
      (save.formatVersion !== 1 &&
        save.formatVersion !== 2 &&
        save.formatVersion !== 3 &&
        save.formatVersion !== 4)
    ) {
      throw new Error(
        "Unsupported save format (diagnostic traces cannot be resumed).",
      );
    }
    if (
      !save.content ||
      !save.runtime ||
      !save.random ||
      !save.checkpoint ||
      !Array.isArray(save.transitions) ||
      save.transitions.length > TRANSITION_LIMIT
    ) {
      throw new Error("Invalid save envelope.");
    }
    const loaded = loadAdventure(JSON.stringify(save.content.snapshot));
    if (!loaded.ok || loaded.adventure.digest !== save.content.digest) {
      throw new Error("Save adventure snapshot is invalid or changed.");
    }
    if (
      (save.formatVersion === 4) !==
      isCharacterSchema(loaded.adventure.snapshot.schemaVersion)
    ) {
      throw new Error("Character save format does not match content.");
    }
    if (save.formatVersion !== 4 && save.startingCharacter !== undefined) {
      throw new Error("Legacy save contains an unsupported character.");
    }
    const runtime = createRuntime(
      loaded.adventure,
      save.formatVersion === 4
        ? validateCharacter(save.startingCharacter)
        : undefined,
    );
    requireSaveRuntime(runtime);
    if (
      save.runtime.engineVersion !== runtime.engineVersion ||
      save.runtime.rulesVersion !== runtime.rulesVersion ||
      save.runtime.adventureId !== runtime.id ||
      save.runtime.contentVersion !== runtime.version ||
      save.random.algorithm !== RANDOM_ALGORITHM
    ) {
      throw new Error("Save runtime tuple is unsupported.");
    }
    const session = new SaveSession(
      path,
      runtime,
      save.random.initialSeed,
      [],
      runtime.createSession(),
    );
    if (
      save.generation !== undefined &&
      (typeof save.generation !== "string" ||
        !/^[a-f0-9]{32}$/.test(save.generation))
    ) {
      throw new Error("Invalid save generation.");
    }
    // Legacy slots retain a stable identity without changing their format.
    session.generation = save.generation ?? digest(save.content).slice(-32);
    for (const [index, transition] of save.transitions.entries()) {
      if (
        !transition ||
        transition.sequence !== index + 1 ||
        transition.actionId !== `action-${index + 1}` ||
        (save.formatVersion === 1 && transition.domainEvents !== undefined) ||
        (transition.source === undefined
          ? !isDeepStrictEqual(
              runtime.parseCommand(transition.rawInput),
              transition.action,
            )
          : transition.source !== "ai-tool" ||
            transition.rawInput !== JSON.stringify(transition.action))
      ) {
        throw new Error(
          `Save transition ${index + 1} has invalid action identity.`,
        );
      }
      const before = session.state;
      const rolls: RollRecord[] = [];
      const result = runtime.handleAction(before, transition.action, {
        roll(sides) {
          const value = session.random.roll(sides);
          rolls.push({ sides, value });
          return value;
        },
      });
      if (
        result.rejection !== undefined ||
        (isDeepStrictEqual(before, result.state) && rolls.length === 0) ||
        !isDeepStrictEqual(rolls, transition.rolls) ||
        !isDeepStrictEqual(
          eventFor(transition.action, transition.actionId, result.state),
          transition.domainEvent,
        ) ||
        (save.formatVersion >= 2 &&
          !isDeepStrictEqual(
            eventsFor(
              runtime,
              transition.action,
              transition.actionId,
              before,
              result.state,
              result.events,
              save.formatVersion >= 3,
            ),
            transition.domainEvents,
          )) ||
        digest(result.state) !== transition.stateDigest ||
        session.randomPosition !== transition.randomPosition ||
        (save.formatVersion >= 3 &&
          transition.randomState !==
            randomStateAt(session.seed, session.randomPosition))
      ) {
        throw new Error(`Save diverges at transition ${index + 1}.`);
      }
      session.state = result.state;
      session.transitions.push(
        save.formatVersion < 3
          ? {
              ...transition,
              domainEvents: eventsFor(
                runtime,
                transition.action,
                transition.actionId,
                before,
                result.state,
                result.events,
              ),
              randomState: randomStateAt(session.seed, session.randomPosition),
            }
          : transition,
      );
    }
    if (
      save.checkpoint.sequence !== session.transitions.length ||
      save.checkpoint.randomPosition !== session.randomPosition ||
      (save.formatVersion >= 3 &&
        save.checkpoint.randomState !==
          randomStateAt(session.seed, session.randomPosition)) ||
      save.checkpoint.stateDigest !== digest(session.state) ||
      save.checkpoint.status !== session.state.status ||
      !isDeepStrictEqual(save.checkpoint.state, session.state)
    ) {
      throw new Error("Save checkpoint differs from replayed transitions.");
    }
    if (
      session.state.status === "quit" &&
      !isCharacterSchema(loaded.adventure.snapshot.schemaVersion)
    ) {
      throw new Error("Quit sessions cannot resume gameplay.");
    }
    if (
      save.browserHistory !== undefined ||
      save.browserHistoryDigest !== undefined
    ) {
      session.browserHistory = validateBrowserHistory(
        save.browserHistory,
        save.browserHistoryDigest,
        session.progress,
      );
    }
    session.browserHints = save.browserHints;
    session.browserStrongerHints = save.browserStrongerHints;
    return session;
  }

  async executeTool(
    state: RuntimeState,
    call: GameToolCall,
    playerInput: string,
    beforeCommit?: (result: RuntimeToolResult) => void,
  ): Promise<
    Readonly<{ result: RuntimeToolResult; rolls: readonly RollRecord[] }>
  > {
    if (!isDeepStrictEqual(state, this.state)) {
      throw new Error("Saved AI state differs from the current turn.");
    }
    const rolls: RollRecord[] = [];
    const result = this.runtime.dispatchGameTool(
      state,
      call,
      {
        roll: (sides) => {
          const value = this.random.roll(sides);
          rolls.push({ sides, value });
          return value;
        },
      },
      playerInput,
    );
    if (!isDeepStrictEqual(state, result.state) || rolls.length > 0) {
      if (
        !result.modelOutput.ok ||
        result.engineResult === undefined ||
        !("events" in result.engineResult)
      ) {
        throw new Error("Rejected AI action changed saved state or dice.");
      }
      if (result.action === undefined) {
        throw new Error("Committed AI tool has no validated action.");
      }
      beforeCommit?.(result);
      await this.record(
        JSON.stringify(result.action),
        result.action,
        result.state,
        result.engineResult.events,
        rolls,
        "ai-tool",
      );
    }
    return { result, rolls };
  }

  async commit(
    rawInput: string,
    action: RuntimeAction,
    onRolls?: (rolls: readonly RollRecord[]) => void,
  ): Promise<ReturnType<AdventureRuntime["handleAction"]>> {
    if (this.transitions.length >= TRANSITION_LIMIT) {
      throw new Error("Save transition limit reached.");
    }
    const before = this.state;
    const randomPositionBefore = this.randomPosition;
    const rolls: RollRecord[] = [];
    const result = this.runtime.handleAction(before, action, {
      roll: (sides) => {
        const value = this.random.roll(sides);
        rolls.push({ sides, value });
        return value;
      },
    });
    if (
      result.rejection !== undefined ||
      (isDeepStrictEqual(before, result.state) && rolls.length === 0)
    ) {
      if (this.randomPosition !== randomPositionBefore) {
        this.seeded = createSeededRandom(this.seed);
        for (let index = 0; index < randomPositionBefore; index++) {
          this.seeded.nextUint32();
        }
        this.randomPosition = randomPositionBefore;
      }
      onRolls?.([]);
      return result;
    }
    await this.record(rawInput, action, result.state, result.events, rolls);
    onRolls?.(rolls);
    return result;
  }

  private async record(
    rawInput: string,
    action: RuntimeAction,
    afterState: RuntimeState,
    events: readonly RuntimeEvent[],
    rolls: readonly RollRecord[],
    source?: "ai-tool",
  ): Promise<void> {
    if (this.transitions.length >= TRANSITION_LIMIT) {
      throw new Error("Save transition limit reached.");
    }
    const before = this.state;
    const sequence = this.transitions.length + 1;
    const actionId = `action-${sequence}`;
    this.state = afterState;
    this.transitions.push({
      sequence,
      actionId,
      rawInput,
      action,
      ...(source === undefined ? {} : { source }),
      rolls,
      domainEvent: eventFor(action, actionId, afterState),
      domainEvents: eventsFor(
        this.runtime,
        action,
        actionId,
        before,
        afterState,
        events,
      ),
      stateDigest: digest(afterState),
      randomPosition: this.randomPosition,
      randomState: randomStateAt(this.seed, this.randomPosition),
    });
    if (this.browserHistory !== undefined) {
      this.browserHistory = { ...this.browserHistory, progress: this.progress };
    }
    try {
      await this.persist();
    } catch (error) {
      throw new Error(
        `Action was applied but NOT SAVED to ${this.path}; stop playing and resume the previous save. ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  private async persist(exclusive = false): Promise<void> {
    const content = this.runtime.content!;
    const save: SaveEnvelope = {
      generation: this.generation,
      ...(this.browserHints === undefined
        ? {}
        : { browserHints: this.browserHints }),
      ...(this.browserStrongerHints === undefined
        ? {}
        : { browserStrongerHints: this.browserStrongerHints }),
      ...(this.browserHistory === undefined
        ? {}
        : {
            browserHistory: this.browserHistory,
            browserHistoryDigest: historyDigest(this.browserHistory),
          }),
      kind: "dungeon-one-save",
      formatVersion: this.runtime.startingCharacter === undefined ? 3 : 4,
      ...(this.runtime.startingCharacter === undefined
        ? {}
        : { startingCharacter: this.runtime.startingCharacter }),
      runtime: {
        engineVersion: this.runtime.engineVersion!,
        rulesVersion: this.runtime.rulesVersion,
        adventureId: this.runtime.id,
        contentVersion: this.runtime.version,
      },
      content: { digest: content.digest, snapshot: content.snapshot },
      random: { algorithm: RANDOM_ALGORITHM, initialSeed: this.seed },
      transitions: this.transitions,
      checkpoint: {
        sequence: this.transitions.length,
        state: this.state,
        stateDigest: digest(this.state),
        randomPosition: this.randomPosition,
        randomState: randomStateAt(this.seed, this.randomPosition),
        status: this.state.status,
      },
    };
    const bytes = Buffer.from(`${JSON.stringify(save)}\n`);
    if (bytes.length > SAVE_BYTE_LIMIT) {
      throw new Error("Save exceeds the size limit.");
    }
    const temporary = join(
      dirname(this.path),
      `.${basename(this.path)}.${randomBytes(8).toString("hex")}.tmp`,
    );
    const file = await open(temporary, "wx");
    try {
      await file.writeFile(bytes);
      await file.sync();
      await file.close();
      if (exclusive) {
        // Publish the complete, synced save only if the slot is still empty.
        // A hard link is atomic and never replaces an occupied destination.
        await link(temporary, this.path);
        await unlink(temporary);
      } else if (this.browserHistory === undefined) {
        // Keep the released command-save failure contract: failed publication
        // resumes the prior primary. Browser turns opt into retained recovery.
        await rename(temporary, this.path);
      } else {
        // A synced recovery journal survives interruption or failure while
        // publishing the main slot. Loading verifies it by the same replay.
        await rename(temporary, `${this.path}.recovery`);
        await rename(`${this.path}.recovery`, this.path);
      }
    } catch (error) {
      await file.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
