/**
 * A 5e session trace (format version 18) and its exact replay.
 *
 * The command-line adapter records every turn of a run: each clicked action
 * with the dice it drew and its card, and each typed message with the AI DM's
 * responses, the tool calls it made, their dice, the cards and the reply. A
 * trace also holds the character as it started, the adventure module's digest
 * and the seed.
 *
 * Replay begins a fresh in-memory session from the trace and plays every turn
 * again, feeding message turns the recorded responses instead of a live
 * model. It checks each turn's state, dice-stream position, dice, cards
 * (every line and its grouped rolls) and reply against the file, and names
 * the first turn that differs.
 *
 * A trace in any other format version is refused with a message naming the
 * file, and left untouched.
 */
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { adventureDigest, type FifthAdventure } from "./adventure-5e.js";
import { writeFileAtomically } from "./atomic-file.js";
import { JsonInputError, parseBoundedJson } from "./bounded-json.js";
import type {
  DmDiagnostic,
  DmModel,
  DmModelResponse,
  DmTurnResult,
} from "./dm-turn.js";
import { validateFighter, type FighterSheet } from "./fighter-5e.js";
import { RANDOM_ALGORITHM } from "./random.js";
import type { FifthAction, FifthResult, FifthState } from "./runtime-5e.js";
import {
  FifthSession,
  type HistoryCard,
  type HistoryEntry,
  type RollRecord,
} from "./session-5e.js";

export const FIFTH_TRACE_FORMAT = 18;
const MAX_TRACE_BYTES = 16 * 1024 * 1024;
const MAX_TURNS = 5000;

/** One model response as the AI DM turn received it, or the model's failure. */
export type RecordedResponse =
  Readonly<{ response: DmModelResponse }> | Readonly<{ failed: true }>;

export type ClickTurn = Readonly<{
  sequence: number;
  kind: "click";
  action: FifthAction;
  rolls: readonly RollRecord[];
  card: HistoryCard;
  stateAfter: FifthState;
  position: number;
}>;

export type MessageTurn = Readonly<{
  sequence: number;
  kind: "message";
  message: string;
  responses: readonly RecordedResponse[];
  calls: readonly Readonly<{
    name: string;
    argumentsJson: string;
    rolls: readonly RollRecord[];
  }>[];
  diagnostics: readonly DmDiagnostic[];
  entry: HistoryEntry;
  stateAfter: FifthState;
  position: number;
}>;

export type TraceTurn = ClickTurn | MessageTurn;

export type FifthTrace = Readonly<{
  kind: "dungeon-one-5e-trace";
  formatVersion: typeof FIFTH_TRACE_FORMAT;
  character: FighterSheet;
  adventure: Readonly<{ id: string; digest: string }>;
  random: Readonly<{ algorithm: string; seed: number }>;
  opening: Readonly<{ rolls: readonly RollRecord[]; entry: HistoryEntry }>;
  turns: readonly TraceTurn[];
}>;

/**
 * A session being played and traced. Clicks and messages go through it, so
 * the trace records exactly what the session did.
 */
export class FifthTraceRun {
  private readonly turns: TraceTurn[] = [];
  private readonly header: Omit<FifthTrace, "turns">;

  constructor(readonly session: FifthSession) {
    if (session.transitions.length !== 1 || session.history.length !== 1) {
      throw new Error("A trace begins with a session that has just begun.");
    }
    this.header = {
      kind: "dungeon-one-5e-trace",
      formatVersion: FIFTH_TRACE_FORMAT,
      character: session.character,
      adventure: {
        id: session.adventure.id,
        digest: adventureDigest(session.adventure),
      },
      random: { algorithm: RANDOM_ALGORITHM, seed: session.seed },
      opening: {
        rolls: session.transitions[0]!.rolls,
        entry: session.history[0]!,
      },
    };
  }

  get trace(): FifthTrace {
    return { ...this.header, turns: [...this.turns] };
  }

  /**
   * Resolves a clicked action as the browser does: an accepted action adds
   * its card to the history; a refusal changes, draws and records nothing in
   * the session. Either way the trace records the card.
   */
  click(
    action: FifthAction,
  ): Readonly<{ result: FifthResult; card: HistoryCard }> {
    const { result, rolls } = this.session.act(action, "click");
    const card = this.session.card(result, rolls);
    if (result.rejection === undefined) {
      this.session.history.push({ reply: "", cards: [card] });
    }
    this.turns.push({
      sequence: this.turns.length + 1,
      kind: "click",
      action,
      rolls,
      card,
      stateAfter: this.session.state,
      position: this.session.randomPosition,
    });
    return { result, card };
  }

  /** Hands a typed message to the AI DM, recording what `model` answered. */
  async message(
    message: string,
    model: DmModel,
  ): Promise<Readonly<{ entry: HistoryEntry; turn: DmTurnResult }>> {
    const responses: RecordedResponse[] = [];
    const recording: DmModel = {
      ...(model.identity === undefined ? {} : { identity: model.identity }),
      async respond(request) {
        try {
          const response = await model.respond(request);
          responses.push({ response });
          return response;
        } catch (error) {
          responses.push({ failed: true });
          throw error;
        }
      },
    };
    const { entry, turn } = await this.session.converse(message, recording);
    this.turns.push({
      sequence: this.turns.length + 1,
      kind: "message",
      message,
      responses,
      calls: callsOf(turn),
      diagnostics: turn.diagnostics,
      entry,
      stateAfter: this.session.state,
      position: this.session.randomPosition,
    });
    return { entry, turn };
  }
}

function callsOf(turn: DmTurnResult): MessageTurn["calls"] {
  return turn.toolAttempts.map(({ call, rolls }) => ({
    name: call.name,
    argumentsJson: call.argumentsJson,
    rolls,
  }));
}

export function serializeFifthTrace(trace: FifthTrace): string {
  return `${JSON.stringify(trace, undefined, 2)}\n`;
}

/** Writes the trace through a temporary file, so it is never left partial. */
export async function writeFifthTrace(
  path: string,
  trace: FifthTrace,
): Promise<void> {
  await writeFileAtomically(path, serializeFifthTrace(trace));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A model that gives back a message turn's recorded responses, in order. */
function replayModel(responses: readonly RecordedResponse[]) {
  let next = 0;
  return {
    model: {
      async respond(): Promise<DmModelResponse> {
        await Promise.resolve();
        const recorded = responses[next];
        next += 1;
        if (recorded === undefined) {
          throw new ReplayDivergence("asked the AI DM for more responses");
        }
        if ("failed" in recorded) {
          throw new Error("The recorded model call failed.");
        }
        return recorded.response;
      },
    } satisfies DmModel,
    used: () => next,
  };
}

class ReplayDivergence extends Error {}

/**
 * Replays a decoded trace against `adventures`, throwing at the first turn
 * whose state, dice-stream position, dice, cards or reply differ from the
 * file.
 */
export async function replayFifthTrace(
  trace: unknown,
  adventures: readonly FifthAdventure[],
  path = "The trace",
): Promise<Readonly<{ turns: number; state: FifthState }>> {
  const invalid = () => new Error(`${path} is not a valid 5e trace.`);
  if (!isRecord(trace) || trace.kind !== "dungeon-one-5e-trace") {
    throw invalid();
  }
  if (trace.formatVersion !== FIFTH_TRACE_FORMAT) {
    throw new Error(
      `${path} is a trace in format version ${String(trace.formatVersion)}, not ${FIFTH_TRACE_FORMAT}. This build cannot replay it. Move it aside; the file has not been changed.`,
    );
  }
  const random = trace.random;
  const adventureRef = trace.adventure;
  const opening = trace.opening;
  if (
    Object.keys(trace).sort().join(",") !==
      "adventure,character,formatVersion,kind,opening,random,turns" ||
    !isRecord(random) ||
    random.algorithm !== RANDOM_ALGORITHM ||
    !Number.isInteger(random.seed) ||
    (random.seed as number) < 0 ||
    (random.seed as number) > 0xffffffff ||
    !isRecord(adventureRef) ||
    !isRecord(opening) ||
    !Array.isArray(trace.turns) ||
    trace.turns.length > MAX_TURNS
  ) {
    throw invalid();
  }
  const adventure = adventures.find(({ id }) => id === adventureRef.id);
  if (adventure === undefined) {
    throw new Error(
      `${path} was recorded in ${String(adventureRef.id)}, which this build does not have.`,
    );
  }
  if (adventureDigest(adventure) !== adventureRef.digest) {
    throw new Error(
      `${path} was recorded in a different version of ${adventure.title}, so this build cannot replay it.`,
    );
  }
  let character: FighterSheet;
  try {
    character = validateFighter(trace.character);
  } catch {
    throw invalid();
  }

  const session = FifthSession.begin(
    random.seed as number,
    adventure,
    character,
  );
  const run = new FifthTraceRun(session);
  const differs = (where: string, what: string) =>
    new Error(`${path} diverged ${where}: ${what} differs from the replay.`);
  if (!isDeepStrictEqual(session.transitions[0]!.rolls, opening.rolls)) {
    throw differs("at the opening", "the dice");
  }
  if (
    !isDeepStrictEqual(
      JSON.parse(JSON.stringify(session.history[0])),
      opening.entry,
    )
  ) {
    throw differs("at the opening", "the opening reply or card");
  }

  for (const [index, value] of trace.turns.entries()) {
    const where = `at turn ${index + 1}`;
    if (!isRecord(value) || value.sequence !== index + 1) {
      throw invalid();
    }
    const recorded = value as TraceTurn;
    let replayed: TraceTurn;
    try {
      if (recorded.kind === "click") {
        run.click(recorded.action);
      } else if (
        recorded.kind === "message" &&
        typeof recorded.message === "string" &&
        Array.isArray(recorded.responses)
      ) {
        const { model, used } = replayModel(recorded.responses);
        await run.message(recorded.message, model);
        if (used() !== recorded.responses.length) {
          throw differs(where, "the number of AI DM responses");
        }
      } else {
        throw invalid();
      }
      // Compared as the file holds it: JSON drops undefined fields.
      replayed = JSON.parse(
        JSON.stringify(run.trace.turns.at(-1)),
      ) as TraceTurn;
    } catch (error) {
      if (error instanceof ReplayDivergence) {
        throw differs(where, "the number of AI DM responses");
      }
      if (error instanceof Error && error.message.startsWith(path)) {
        throw error;
      }
      throw differs(where, "the action's resolution");
    }
    const checks: readonly (readonly [
      string,
      keyof ClickTurn | keyof MessageTurn,
    ])[] = [
      ["the action", "action"],
      ["the dice", "rolls"],
      ["the card", "card"],
      ["the AI DM's tool calls or their dice", "calls"],
      ["the diagnostics", "diagnostics"],
      ["the reply or cards", "entry"],
      ["the state", "stateAfter"],
      ["the dice-stream position", "position"],
    ];
    for (const [what, key] of checks) {
      if (
        !isDeepStrictEqual(
          (replayed as Record<string, unknown>)[key],
          (recorded as Record<string, unknown>)[key],
        )
      ) {
        throw differs(where, what);
      }
    }
    if (!isDeepStrictEqual(replayed, recorded)) {
      throw differs(where, "the turn");
    }
  }
  return { turns: trace.turns.length, state: session.state };
}

/** Reads and replays the trace at `path`. */
export async function verifyFifthTraceFile(
  path: string,
  adventures: readonly FifthAdventure[],
): Promise<Readonly<{ turns: number; state: FifthState }>> {
  let decoded: unknown;
  try {
    decoded = parseBoundedJson(await readFile(path), MAX_TRACE_BYTES, 64);
  } catch (error) {
    if (error instanceof JsonInputError) {
      throw new Error(`${path} is not a valid 5e trace.`);
    }
    throw error;
  }
  return replayFifthTrace(decoded, adventures, path);
}
