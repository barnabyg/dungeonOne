/**
 * A 5e adventure session and its save file (format version 20).
 *
 * The save holds the character as it started, the adventure module's digest,
 * the session's seed, every committed action with the dice it drew, the
 * resulting state and the conversation history. Loading replays every action
 * from the seed and checks each die, the final state and the draw count
 * against the file, so a resumed session continues exactly: same state, same
 * position in the dice stream, same recorded rolls.
 *
 * A save in any other format version is refused with a message naming the
 * file, and left untouched.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { adventureDigest, type FifthAdventure } from "./adventure-5e.js";
import { writeFileAtomically } from "./atomic-file.js";
import { parseBoundedJson } from "./bounded-json.js";
import type {
  FifthCharacterLibrary,
  FifthLibraryData,
} from "./character-library-5e.js";
import { runDmTurn, type DmModel, type DmTurnResult } from "./dm-turn.js";
import { acquireFileLock } from "./file-lock.js";
import { validateFighter, type FighterSheet } from "./fighter-5e.js";
import { createSeededRandom, RANDOM_ALGORITHM } from "./random.js";
import type { GameToolCall } from "./runtime-contract.js";
import {
  createFifthRuntime,
  describeFifthResult,
  type FifthAction,
  type FifthEvent,
  type FifthRejection,
  type FifthResult,
  type FifthRuntime,
  type FifthState,
  type ResultLine,
} from "./runtime-5e.js";

export const FIFTH_SESSION_FORMAT = 20;
const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const MAX_TRANSITIONS = 5000;
const MAX_HISTORY = 5000;

export type RollRecord = Readonly<{ sides: number; value: number }>;

export type Transition = Readonly<{
  sequence: number;
  /** How the player asked: the opening, a click, or a message to the AI DM. */
  source: "start" | "click" | "message";
  action: FifthAction;
  rolls: readonly RollRecord[];
}>;

/**
 * An engine-authored result the browser shows as a card: `narration` for an
 * action that only entered a room, `result` for any other resolved action,
 * `rejection` for a refusal. `lines` split `text` line by line, each with
 * the rolls behind it grouped by purpose.
 */
export type HistoryCard = Readonly<{
  kind: "narration" | "result" | "rejection";
  text: string;
  lines: readonly ResultLine[];
}>;

/** One exchange: the player's message (if typed), the reply and its cards. */
export type HistoryEntry = Readonly<{
  player?: string;
  reply: string;
  cards: readonly HistoryCard[];
}>;

type SessionFile = Readonly<{
  kind: "dungeon-one-5e-session";
  formatVersion: typeof FIFTH_SESSION_FORMAT;
  id: string;
  character: FighterSheet;
  adventure: Readonly<{ id: string; digest: string }>;
  random: Readonly<{ algorithm: string; seed: number; position: number }>;
  transitions: readonly Transition[];
  state: FifthState;
  history: readonly HistoryEntry[];
}>;

/** The dice stream for the library's session `number` under `seed`. */
export function sessionSeed(seed: number, number: number): number {
  return createHash("sha256")
    .update(`5e-session:${seed}:${number}`)
    .digest()
    .readUInt32LE(0);
}

function invalid(path: string): Error {
  return new Error(`Invalid adventure session ${path}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validRolls(value: unknown): value is RollRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (roll) =>
        isRecord(roll) &&
        Object.keys(roll).sort().join(",") === "sides,value" &&
        Number.isSafeInteger(roll.sides) &&
        Number.isSafeInteger(roll.value),
    )
  );
}

function validHistory(value: unknown): value is HistoryEntry[] {
  const text = (entry: unknown) =>
    typeof entry === "string" && entry.length <= 20000;
  return (
    Array.isArray(value) &&
    value.length <= MAX_HISTORY &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        Object.keys(entry).every((key) =>
          ["player", "reply", "cards"].includes(key),
        ) &&
        (entry.player === undefined || text(entry.player)) &&
        text(entry.reply) &&
        Array.isArray(entry.cards) &&
        entry.cards.every(
          (card) =>
            isRecord(card) &&
            Object.keys(card).sort().join(",") === "kind,lines,text" &&
            ["narration", "result", "rejection"].includes(String(card.kind)) &&
            text(card.text) &&
            Array.isArray(card.lines) &&
            card.lines.every(
              (line) =>
                isRecord(line) &&
                Object.keys(line).sort().join(",") === "rolls,text" &&
                text(line.text) &&
                Array.isArray(line.rolls) &&
                line.rolls.every(validRollGroup),
            ) &&
            card.lines.map((line) => (line as ResultLine).text).join("\n") ===
              card.text,
        ),
    )
  );
}

const ROLL_PURPOSES = [
  "initiative",
  "target",
  "weapon",
  "attack",
  "damage",
  "healing",
  "check",
  "save",
];
const OPTIONAL_GROUP_KEYS = [
  "target",
  "rollOff",
  "mode",
  "armorClass",
  "label",
  "proficiency",
  "dc",
  "outcome",
  "halved",
  "adjustment",
  "damageType",
  "hpAfter",
  "maxHp",
];

function validRollGroup(value: unknown): boolean {
  const integer = (field: unknown) => Number.isSafeInteger(field);
  const optional = (field: unknown, check: (field: unknown) => boolean) =>
    field === undefined || check(field);
  const label = (field: unknown) =>
    typeof field === "string" && field.length <= 200;
  return (
    isRecord(value) &&
    Object.keys(value).every(
      (key) =>
        ["purpose", "roller", "dice", "modifier", "total"].includes(key) ||
        OPTIONAL_GROUP_KEYS.includes(key),
    ) &&
    ROLL_PURPOSES.includes(String(value.purpose)) &&
    label(value.roller) &&
    optional(value.target, label) &&
    Array.isArray(value.dice) &&
    value.dice.every(
      (die) =>
        isRecord(die) &&
        integer(die.sides) &&
        integer(die.value) &&
        optional(die.dropped, (dropped) => dropped === true) &&
        Object.keys(die).every((key) =>
          ["sides", "value", "dropped"].includes(key),
        ),
    ) &&
    integer(value.modifier) &&
    integer(value.total) &&
    optional(
      value.rollOff,
      (rollOff) => Array.isArray(rollOff) && rollOff.every(integer),
    ) &&
    optional(value.mode, label) &&
    optional(value.armorClass, integer) &&
    optional(value.outcome, (outcome) =>
      ["hit", "critical", "miss", "success", "failure"].includes(
        String(outcome),
      ),
    ) &&
    optional(value.label, label) &&
    optional(value.proficiency, integer) &&
    optional(value.dc, integer) &&
    optional(value.halved, (halved) => halved === true) &&
    optional(value.adjustment, (adjustment) =>
      ["resistance", "vulnerability", "immunity"].includes(String(adjustment)),
    ) &&
    optional(value.damageType, label) &&
    optional(value.hpAfter, integer) &&
    optional(value.maxHp, integer)
  );
}

export class FifthSession {
  readonly runtime: FifthRuntime;
  private readonly random: ReturnType<typeof createSeededRandom>;
  private position = 0;
  private drawn: RollRecord[] = [];
  private constructor(
    /** The save file; undefined for a session kept only in memory. */
    readonly path: string | undefined,
    readonly id: string,
    readonly seed: number,
    adventure: FifthAdventure,
    readonly character: FighterSheet,
    public state: FifthState,
    readonly transitions: Transition[],
    readonly history: HistoryEntry[],
  ) {
    this.runtime = createFifthRuntime(adventure, character);
    this.random = createSeededRandom(seed);
  }

  get adventure(): FifthAdventure {
    return this.runtime.adventure;
  }

  get randomPosition(): number {
    return this.position;
  }

  /** Draws from the session's stream, recording each die. */
  private readonly roller = {
    roll: (sides: number): number => {
      const value = this.random.roll(sides);
      this.position += 1;
      this.drawn.push({ sides, value });
      return value;
    },
  };

  private resolve(
    run: () => FifthResult | ReturnType<FifthRuntime["dispatchGameTool"]>,
  ) {
    this.drawn = [];
    const result = run();
    const rolls = this.drawn;
    this.drawn = [];
    return { result, rolls };
  }

  /** Records a committed action and its dice, and moves to its state. */
  private commit(
    action: FifthAction,
    source: Transition["source"],
    state: FifthState,
    rolls: readonly RollRecord[],
  ): void {
    this.transitions.push({
      sequence: this.transitions.length + 1,
      source,
      action,
      rolls,
    });
    this.state = state;
  }

  /**
   * Resolves one action. A rejection draws no dice and changes nothing; an
   * accepted action is recorded but not yet saved (see `persist`).
   */
  act(
    action: FifthAction,
    source: Transition["source"],
  ): Readonly<{ result: FifthResult; rolls: readonly RollRecord[] }> {
    const { result, rolls } = this.resolve(() =>
      this.runtime.handleAction(this.state, action, this.roller),
    );
    const resolved = result as FifthResult;
    if (resolved.rejection !== undefined) {
      if (rolls.length > 0) {
        throw new Error("A rejected action drew dice.");
      }
    } else {
      this.commit(action, source, resolved.state, rolls);
    }
    return { result: resolved, rolls };
  }

  /**
   * Resolves one AI DM tool call, recording any action it commits. `card` is
   * the engine's result or refusal when the call reached the engine.
   */
  dispatch(call: GameToolCall) {
    const before = this.state;
    const { result, rolls } = this.resolve(() =>
      this.runtime.dispatchGameTool(before, call, this.roller),
    );
    const dispatched = result as ReturnType<FifthRuntime["dispatchGameTool"]>;
    const engine = dispatched.engineResult;
    if (engine === undefined || !("events" in engine)) {
      if (rolls.length > 0) {
        throw new Error("A rejected tool call drew dice.");
      }
      return {
        result: dispatched,
        rolls,
        ...(engine === undefined
          ? {}
          : {
              card: this.card(
                {
                  state: before,
                  rejection: engine.rejection as FifthRejection,
                },
                rolls,
              ),
            }),
      };
    }
    const state = dispatched.state as FifthState;
    this.commit(dispatched.action as FifthAction, "message", state, rolls);
    return {
      result: dispatched,
      rolls,
      card: this.card(
        { state, events: engine.events as readonly FifthEvent[] },
        rolls,
      ),
    };
  }

  /**
   * Hands the player's typed `message` to the AI DM for one turn, as the
   * browser does: the DM sees the last four exchanges, acts only through
   * offered tools and draws dice only through them. The exchange is recorded
   * in the history as it goes, each engine card as it resolves, and
   * `onCommit` runs after each committed action, before the reply is
   * written, so a caller can save it.
   */
  async converse(
    message: string,
    model: DmModel,
    onCommit: () => Promise<void> = async () => undefined,
  ): Promise<Readonly<{ entry: HistoryEntry; turn: DmTurnResult }>> {
    const cards: HistoryCard[] = [];
    const index = this.history.length;
    const record = (reply: string): HistoryEntry => {
      const entry: HistoryEntry = { player: message, reply, cards: [...cards] };
      this.history[index] = entry;
      return entry;
    };
    const turn = await runDmTurn({
      state: this.state,
      playerInput: message,
      transcript: this.history.slice(-4).flatMap((entry) => [
        ...(entry.player === undefined
          ? []
          : [{ role: "player" as const, text: entry.player }]),
        {
          role: "dungeon-master" as const,
          text: entry.reply || entry.cards.map(({ text }) => text).join("\n"),
        },
      ]),
      random: {
        roll() {
          throw new Error("An AI DM turn draws dice only through tools.");
        },
      },
      model,
      runtime: this.runtime,
      resultSurface: "browser-cards",
      executeTool: async (_state, call) => {
        const dispatched = this.dispatch(call);
        if (dispatched.card !== undefined) {
          cards.push(dispatched.card);
          if (dispatched.card.kind !== "rejection") {
            record("The reply was interrupted; the result is shown below.");
            await onCommit();
          }
        }
        return { result: dispatched.result, rolls: dispatched.rolls };
      },
    });
    return { entry: record(turn.narration), turn };
  }

  /** The engine-authored card for a resolved action and the dice it drew. */
  card(result: FifthResult, rolls: readonly RollRecord[]): HistoryCard {
    const lines = describeFifthResult(result, rolls, this.character.name);
    return {
      kind:
        result.rejection !== undefined
          ? "rejection"
          : result.events.every(({ type }) => type === "entered")
            ? "narration"
            : "result",
      text: lines.map(({ text }) => text).join("\n"),
      lines,
    };
  }

  /** Saves the session atomically under its file lock. */
  async persist(): Promise<void> {
    if (this.path === undefined) {
      throw new Error("This adventure session is kept only in memory.");
    }
    const file: SessionFile = {
      kind: "dungeon-one-5e-session",
      formatVersion: FIFTH_SESSION_FORMAT,
      id: this.id,
      character: this.character,
      adventure: {
        id: this.adventure.id,
        digest: adventureDigest(this.adventure),
      },
      random: {
        algorithm: RANDOM_ALGORITHM,
        seed: this.seed,
        position: this.position,
      },
      transitions: this.transitions,
      state: this.state,
      history: this.history,
    };
    const bytes = `${JSON.stringify(file)}\n`;
    if (Buffer.byteLength(bytes) > MAX_SESSION_BYTES) {
      throw new Error(
        "Adventure session byte limit reached; the last change was not saved.",
      );
    }
    await mkdir(dirname(this.path), { recursive: true });
    const release = await acquireFileLock(this.path);
    try {
      await writeFileAtomically(this.path, bytes);
    } finally {
      await release();
    }
  }

  /**
   * Creates a session at `path` and begins it (starting the start room's
   * fight, if it has one), saving it before it is returned. The opening reply
   * introduces the start room.
   */
  static async create(
    path: string,
    id: string,
    seed: number,
    adventure: FifthAdventure,
    character: FighterSheet,
  ): Promise<FifthSession> {
    const session = FifthSession.start(path, id, seed, adventure, character);
    await session.persist();
    return session;
  }

  /**
   * Begins a session kept only in memory, exactly as `create` begins a saved
   * one: for the command-line adapter and trace replay.
   */
  static begin(
    seed: number,
    adventure: FifthAdventure,
    character: FighterSheet,
  ): FifthSession {
    return FifthSession.start(
      undefined,
      randomBytes(16).toString("hex"),
      seed,
      adventure,
      character,
    );
  }

  private static start(
    path: string | undefined,
    id: string,
    seed: number,
    adventure: FifthAdventure,
    character: FighterSheet,
  ): FifthSession {
    const session = new FifthSession(
      path,
      id,
      seed,
      adventure,
      validateFighter(character),
      createFifthRuntime(adventure, character).createSession(),
      [],
      [],
    );
    const { result, rolls } = session.act({ type: "begin" }, "start");
    if (result.rejection !== undefined) {
      throw new Error(result.rejection.reason);
    }
    const room = adventure.rooms.find(
      ({ id: roomId }) => roomId === adventure.startRoomId,
    )!;
    const opponents =
      adventure.encounters
        .find(({ id: encounterId }) => encounterId === room.encounterId)
        ?.opponents.map(({ description }) => description) ?? [];
    session.history.push({
      reply: [`${room.name}.`, room.description, ...opponents].join(" "),
      // A quiet start room begins with nothing to show.
      cards: result.events.length === 0 ? [] : [session.card(result, rolls)],
    });
    return session;
  }

  /**
   * Loads and verifies a session. `adventures` are the modules this build
   * offers; a session whose module changed since it started is refused.
   */
  static async load(
    path: string,
    adventures: readonly FifthAdventure[],
  ): Promise<FifthSession> {
    let decoded: unknown;
    try {
      decoded = parseBoundedJson(await readFile(path), MAX_SESSION_BYTES, 64);
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        throw error;
      }
      throw invalid(path);
    }
    if (!isRecord(decoded) || decoded.kind !== "dungeon-one-5e-session") {
      throw invalid(path);
    }
    if (decoded.formatVersion !== FIFTH_SESSION_FORMAT) {
      throw new Error(
        `${path} is an adventure session in format version ${String(decoded.formatVersion)}, not ${FIFTH_SESSION_FORMAT}. This build cannot continue it. Move it aside; the file has not been changed.`,
      );
    }
    const file = decoded as SessionFile;
    if (
      Object.keys(file).sort().join(",") !==
        "adventure,character,formatVersion,history,id,kind,random,state,transitions" ||
      typeof file.id !== "string" ||
      !/^[a-f0-9]{32}$/.test(file.id) ||
      !isRecord(file.adventure) ||
      !isRecord(file.random) ||
      file.random.algorithm !== RANDOM_ALGORITHM ||
      !Number.isInteger(file.random.seed) ||
      file.random.seed < 0 ||
      file.random.seed > 0xffffffff ||
      !Array.isArray(file.transitions) ||
      file.transitions.length > MAX_TRANSITIONS ||
      !validHistory(file.history)
    ) {
      throw invalid(path);
    }
    const adventure = adventures.find(({ id }) => id === file.adventure.id);
    if (adventure === undefined) {
      throw new Error(
        `${path} is an adventure in ${String(file.adventure.id)}, which this build does not have. Move it aside; the file has not been changed.`,
      );
    }
    if (adventureDigest(adventure) !== file.adventure.digest) {
      throw new Error(
        `${path} was started in a different version of ${adventure.title}, so this build cannot continue it. Move it aside; the file has not been changed.`,
      );
    }
    let character: FighterSheet;
    try {
      character = validateFighter(file.character);
    } catch {
      throw invalid(path);
    }
    const session = new FifthSession(
      path,
      file.id,
      file.random.seed,
      adventure,
      character,
      createFifthRuntime(adventure, character).createSession(),
      [],
      [...file.history],
    );
    // Replay: every action must be accepted and draw exactly its dice.
    for (const [index, transition] of file.transitions.entries()) {
      if (
        !isRecord(transition) ||
        Object.keys(transition).sort().join(",") !==
          "action,rolls,sequence,source" ||
        transition.sequence !== index + 1 ||
        !["start", "click", "message"].includes(String(transition.source)) ||
        !validRolls(transition.rolls)
      ) {
        throw invalid(path);
      }
      const { result, rolls } = session.act(
        transition.action as FifthAction,
        transition.source as Transition["source"],
      );
      if (
        result.rejection !== undefined ||
        !isDeepStrictEqual(rolls, transition.rolls)
      ) {
        throw invalid(path);
      }
    }
    if (
      !isDeepStrictEqual(session.state, file.state) ||
      session.position !== file.random.position ||
      !isDeepStrictEqual(session.transitions, file.transitions)
    ) {
      throw invalid(path);
    }
    return session;
  }
}

/**
 * Starts `characterId` on `adventure`: saves a new session with its fight
 * begun, then records it in the library. A stale `revision`, or a character
 * that is defeated or already adventuring, starts nothing.
 */
export async function startFifthAdventure(
  library: FifthCharacterLibrary,
  browserSeed: number,
  characterId: string,
  adventure: FifthAdventure,
  revision: string,
): Promise<FifthSession> {
  const data = await library.read();
  if (data.revision !== revision) {
    throw new Error(
      "Character library request is stale; refresh before retrying.",
    );
  }
  const record = data.characters[library.startable(data, characterId)]!;
  const number = data.sessionsStarted + 1;
  const id = randomBytes(16).toString("hex");
  const session = await FifthSession.create(
    library.sessionPath(id),
    id,
    sessionSeed(browserSeed, number),
    adventure,
    record.sheet,
  );
  // A crash before this line leaves an unreferenced session file and no
  // change to the library, so the player can simply start again.
  await library.attachSession(
    characterId,
    { id, adventureId: adventure.id },
    number,
    revision,
  );
  await settleFifthSession(library, session);
  return session;
}

/**
 * Settles an ended session's character in the library: after a victory or an
 * escape the character holds what the session held at the end and is
 * credited what it earned; after a defeat it is recorded defeated. Call it
 * after the session is saved. It changes nothing while the session is under
 * way, or once the library no longer names the session (already settled or
 * abandoned), so a retry after an interruption never settles twice.
 */
export async function settleFifthSession(
  library: FifthCharacterLibrary,
  session: FifthSession,
): Promise<FifthLibraryData> {
  const { status } = session.state;
  if (status === "playing") {
    return library.read();
  }
  if (status === "quit") {
    throw new Error("A 5e adventure cannot be quit.");
  }
  return library.settleSession(
    session.character.id,
    session.id,
    status,
    session.runtime.projectSettlement(session.state),
  );
}
