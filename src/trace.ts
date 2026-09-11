import { writeFile } from "node:fs/promises";

import { ADVENTURE } from "./adventure.js";
import { RANDOM_ALGORITHM } from "./random.js";
import type {
  Action,
  ActionResult,
  Event,
  Rejection,
  SessionState,
} from "./session.js";

export const TRACE_FORMAT_VERSION = 1;
export const LEGACY_RULES_VERSION = "stolen-signet-rules-v1";
export const LEGACY_ADVENTURE_VERSION = "1";
export const RULES_VERSION = "stolen-signet-rules-v2";
export const ADVENTURE_VERSION = "2";

export type RollRecord = Readonly<{ sides: number; value: number }>;

type TraceResult = Readonly<
  | { type: "accepted"; events: readonly Event[] }
  | { type: "rejected"; rejection: Rejection }
>;

type TraceAction = Readonly<{
  sequence: number;
  rawInput: string;
  action: Action;
  rolls: readonly RollRecord[];
  result: TraceResult;
  stateAfter: SessionState;
}>;

type TraceCompletion = Readonly<{
  reason: "quit" | "eof";
  outcome: "victory" | "defeat" | "incomplete";
}>;

export type SessionTrace = {
  readonly formatVersion: typeof TRACE_FORMAT_VERSION;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly adventure: Readonly<{
    id: typeof ADVENTURE.id;
    version: typeof ADVENTURE_VERSION;
  }>;
  readonly random: Readonly<{
    algorithm: typeof RANDOM_ALGORITHM;
    initialSeed: number;
  }>;
  readonly initialState: SessionState;
  readonly actions: TraceAction[];
  completion?: TraceCompletion;
};

export function createSessionTrace(
  initialSeed: number,
  initialState: SessionState,
): SessionTrace {
  return {
    formatVersion: TRACE_FORMAT_VERSION,
    rulesVersion: RULES_VERSION,
    adventure: { id: ADVENTURE.id, version: ADVENTURE_VERSION },
    random: { algorithm: RANDOM_ALGORITHM, initialSeed },
    initialState,
    actions: [],
  };
}

export function recordTraceAction(
  trace: SessionTrace,
  rawInput: string,
  action: Action,
  rolls: readonly RollRecord[],
  result: ActionResult,
): void {
  trace.actions.push({
    sequence: trace.actions.length + 1,
    rawInput,
    action,
    rolls: [...rolls],
    result:
      result.rejection === undefined
        ? { type: "accepted", events: result.events }
        : { type: "rejected", rejection: result.rejection },
    stateAfter: result.state,
  });
}

export function completeSessionTrace(
  trace: SessionTrace,
  reason: TraceCompletion["reason"],
  finalState: SessionState,
): void {
  trace.completion = {
    reason,
    outcome:
      finalState.status === "victory" || finalState.status === "defeat"
        ? finalState.status
        : "incomplete",
  };
}

export function serializeSessionTrace(trace: SessionTrace): string {
  try {
    return `${JSON.stringify(trace, undefined, 2)}\n`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to serialize session trace: ${message}`, {
      cause: error,
    });
  }
}

export async function writeSessionTrace(
  path: string,
  trace: SessionTrace,
): Promise<void> {
  const contents = serializeSessionTrace(trace);
  try {
    await writeFile(path, contents, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to write session trace to "${path}": ${message}`, {
      cause: error,
    });
  }
}
