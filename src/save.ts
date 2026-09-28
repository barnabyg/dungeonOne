import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadAdventure, type AdventureDefinition } from "./adventure-loader.js";
import { parseBoundedJson } from "./bounded-json.js";
import { createDataRuntime } from "./data-runtime.js";
import { createSeededRandom, RANDOM_ALGORITHM } from "./random.js";
import type { AdventureRuntime, RuntimeState } from "./runtime-contract.js";
import type { Action } from "./session.js";
import type { RollRecord } from "./trace.js";

const SAVE_BYTE_LIMIT = 16 * 1024 * 1024;
const TRANSITION_LIMIT = 10000;

type Transition = Readonly<{
  sequence: number;
  actionId: string;
  rawInput: string;
  action: Action;
  rolls: readonly RollRecord[];
  domainEvent: Readonly<{
    type: "actor-relocated" | "action-committed";
    actionId: string;
    locationId?: string;
    actionType: string;
  }>;
  stateDigest: string;
  randomPosition: number;
}>;

type SaveEnvelope = Readonly<{
  kind: "dungeon-one-save";
  formatVersion: 1;
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
    status: string;
  }>;
}>;

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function requireSaveRuntime(runtime: AdventureRuntime): void {
  if (
    runtime.content?.snapshot.schemaVersion !== 3 ||
    runtime.engineVersion === undefined
  ) {
    throw new Error("Saves require a schema-3 adventure.");
  }
}

function eventFor(
  action: Action,
  actionId: string,
  state: RuntimeState,
): Transition["domainEvent"] {
  return action.type === "move" && "locationId" in state
    ? {
        type: "actor-relocated",
        actionId,
        actionType: action.type,
        locationId: state.locationId,
      }
    : { type: "action-committed", actionId, actionType: action.type };
}

export class SaveSession {
  readonly runtime: AdventureRuntime;
  readonly seed: number;
  readonly path: string;
  readonly random: ReturnType<typeof createSeededRandom>;
  state: RuntimeState;
  private transitions: Transition[];
  private randomPosition = 0;

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
    const seeded = createSeededRandom(seed);
    this.random = {
      nextUint32: () => {
        this.randomPosition++;
        return seeded.nextUint32();
      },
      roll: (sides: number) => {
        this.randomPosition++;
        return seeded.roll(sides);
      },
    };
  }

  static async start(
    path: string,
    runtime: AdventureRuntime,
    seed: number,
  ): Promise<SaveSession> {
    const session = new SaveSession(
      path,
      runtime,
      seed,
      [],
      runtime.createSession(),
    );
    await session.persist();
    return session;
  }

  static async load(path: string): Promise<SaveSession> {
    const info = await stat(path);
    if (!info.isFile() || info.size > SAVE_BYTE_LIMIT) {
      throw new Error("Save must be a regular file within the size limit.");
    }
    const parsed: unknown = parseBoundedJson(
      await readFile(path),
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
    if (save.kind !== "dungeon-one-save" || save.formatVersion !== 1) {
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
    const runtime = createDataRuntime(loaded.adventure);
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
    for (const [index, transition] of save.transitions.entries()) {
      if (
        !transition ||
        transition.sequence !== index + 1 ||
        transition.actionId !== `action-${index + 1}` ||
        !isDeepStrictEqual(
          runtime.parseCommand(transition.rawInput),
          transition.action,
        )
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
        isDeepStrictEqual(before, result.state) ||
        !isDeepStrictEqual(rolls, transition.rolls) ||
        !isDeepStrictEqual(
          eventFor(transition.action, transition.actionId, result.state),
          transition.domainEvent,
        ) ||
        digest(result.state) !== transition.stateDigest ||
        session.randomPosition !== transition.randomPosition
      ) {
        throw new Error(`Save diverges at transition ${index + 1}.`);
      }
      session.state = result.state;
      session.transitions.push(transition);
    }
    if (
      save.checkpoint.sequence !== session.transitions.length ||
      save.checkpoint.randomPosition !== session.randomPosition ||
      save.checkpoint.stateDigest !== digest(session.state) ||
      save.checkpoint.status !== session.state.status ||
      !isDeepStrictEqual(save.checkpoint.state, session.state)
    ) {
      throw new Error("Save checkpoint differs from replayed transitions.");
    }
    if (session.state.status !== "playing") {
      throw new Error("Completed sessions cannot resume gameplay.");
    }
    return session;
  }

  async commit(
    rawInput: string,
    action: Action,
  ): Promise<ReturnType<AdventureRuntime["handleAction"]>> {
    if (this.transitions.length >= TRANSITION_LIMIT) {
      throw new Error("Save transition limit reached.");
    }
    const before = this.state;
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
      isDeepStrictEqual(before, result.state)
    ) {
      return result;
    }
    const sequence = this.transitions.length + 1;
    const actionId = `action-${sequence}`;
    this.state = result.state;
    this.transitions.push({
      sequence,
      actionId,
      rawInput,
      action,
      rolls,
      domainEvent: eventFor(action, actionId, result.state),
      stateDigest: digest(result.state),
      randomPosition: this.randomPosition,
    });
    try {
      await this.persist();
    } catch (error) {
      throw new Error(
        `Action was applied but NOT SAVED to ${this.path}; stop playing and resume the previous save. ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    return result;
  }

  private async persist(): Promise<void> {
    const content = this.runtime.content!;
    const save: SaveEnvelope = {
      kind: "dungeon-one-save",
      formatVersion: 1,
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
      await rename(temporary, this.path);
    } catch (error) {
      await file.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
