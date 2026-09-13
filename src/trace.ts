import { writeFile } from "node:fs/promises";

import { resolveAdventure, type AdventureRuntime } from "./runtime.js";
export {
  ADVENTURE_VERSION,
  RULES_VERSION,
  LEGACY_ADVENTURE_VERSION,
  LEGACY_RULES_VERSION,
} from "./runtime.js";

import {
  type DmDiagnostic,
  type DmModel,
  type DmTurnResult,
} from "./dm-turn.js";
import { RANDOM_ALGORITHM } from "./random.js";
import type { Action } from "./session.js";

import type {
  RuntimeState as SessionState,
  RuntimeResult as ActionResult,
  RuntimeEvent as Event,
  RuntimeRejection as Rejection,
} from "./runtime-contract.js";
export const TRACE_FORMAT_VERSION = 1;
export const DM_TRACE_FORMAT_VERSION = 2;
export const CHAPEL_TRACE_FORMAT_VERSION = 3;

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

type EncodedToolArguments = Readonly<
  | { encoding: "json"; raw: string; value: unknown }
  | { encoding: "invalid-json"; raw: string }
>;

type DmTraceCall = Readonly<{
  sequence: number;
  id: string;
  name: string;
  arguments: EncodedToolArguments;
  disposition: DmTurnResult["toolAttempts"][number]["disposition"];
  rolls: readonly RollRecord[];
  result?: Readonly<{
    engineResult?: NonNullable<
      DmTurnResult["toolAttempts"][number]["result"]
    >["engineResult"];
    modelOutput: NonNullable<
      DmTurnResult["toolAttempts"][number]["result"]
    >["modelOutput"];
  }>;
  failure?: DmDiagnostic;
  stateAfter: SessionState;
}>;

type DmTraceTurn = Readonly<{
  sequence: number;
  kind: "dm";
  rawPlayerInput: string;
  calls: readonly DmTraceCall[];
  narration: string;
  diagnostics: readonly DmDiagnostic[];
  stateAfter: SessionState;
}>;

type LocalTraceTurn = Readonly<{
  sequence: number;
  kind: "local-help" | "local-quit";
  rawPlayerInput: string;
  calls: readonly [];
  narration: null;
  diagnostics: readonly [];
  stateAfter: SessionState;
}>;

export type SessionTrace = {
  readonly formatVersion:
    typeof TRACE_FORMAT_VERSION | typeof CHAPEL_TRACE_FORMAT_VERSION;
  readonly rulesVersion: string;
  readonly adventure: Readonly<{
    id: string;
    version: string;
  }>;
  readonly random: Readonly<{
    algorithm: typeof RANDOM_ALGORITHM;
    initialSeed: number;
  }>;
  readonly initialState: SessionState;
  readonly actions: TraceAction[];
  completion?: TraceCompletion;
};

export type DmSessionTrace = {
  readonly formatVersion:
    typeof DM_TRACE_FORMAT_VERSION | typeof CHAPEL_TRACE_FORMAT_VERSION;
  readonly rulesVersion: string;
  readonly adventure: Readonly<{
    id: string;
    version: string;
  }>;
  readonly random: Readonly<{
    algorithm: typeof RANDOM_ALGORITHM;
    initialSeed: number;
  }>;
  readonly dm: Readonly<{
    promptVersion: string;
    toolSchemaVersion: string;
    provider: string;
    model: string;
  }>;
  readonly initialState: SessionState;
  readonly turns: Array<DmTraceTurn | LocalTraceTurn>;
  completion?: TraceCompletion;
};

export type AnySessionTrace = SessionTrace | DmSessionTrace;

export function createSessionTrace(
  initialSeed: number,
  initialState: SessionState,
  runtime: AdventureRuntime = resolveAdventure(),
): SessionTrace {
  return {
    formatVersion: runtime.commandTraceFormatVersion,
    rulesVersion: runtime.rulesVersion,
    adventure: { id: runtime.id, version: runtime.version },
    random: { algorithm: RANDOM_ALGORITHM, initialSeed },
    initialState,
    actions: [],
  };
}

export function createDmSessionTrace(
  initialSeed: number,
  initialState: SessionState,
  identity: NonNullable<DmModel["identity"]>,
  runtime: AdventureRuntime = resolveAdventure(),
): DmSessionTrace {
  return {
    formatVersion: runtime.dmTraceFormatVersion,
    rulesVersion: runtime.rulesVersion,
    adventure: { id: runtime.id, version: runtime.version },
    random: { algorithm: RANDOM_ALGORITHM, initialSeed },
    dm: {
      promptVersion: runtime.promptVersion,
      toolSchemaVersion: runtime.toolSchemaVersion,
      provider: identity.provider,
      model: identity.model,
    },
    initialState,
    turns: [],
  };
}

function encodeToolArguments(argumentsJson: string): EncodedToolArguments {
  try {
    return {
      encoding: "json",
      raw: argumentsJson,
      value: JSON.parse(argumentsJson) as unknown,
    };
  } catch {
    return { encoding: "invalid-json", raw: argumentsJson };
  }
}

export function recordDmTraceTurn(
  trace: DmSessionTrace,
  rawPlayerInput: string,
  turn: DmTurnResult,
): void {
  let callState = trace.turns.at(-1)?.stateAfter ?? trace.initialState;
  const terminalFailure = turn.diagnostics.at(-1);
  const calls = turn.toolAttempts.map((attempt, index): DmTraceCall => {
    if (attempt.result !== undefined) {
      callState = attempt.result.state;
    }
    return {
      sequence: index + 1,
      id: attempt.call.id,
      name: attempt.call.name,
      arguments: encodeToolArguments(attempt.call.argumentsJson),
      disposition: attempt.disposition,
      rolls: attempt.rolls,
      ...(attempt.result === undefined
        ? terminalFailure === undefined
          ? {}
          : { failure: terminalFailure }
        : {
            result: {
              ...(attempt.result.engineResult === undefined
                ? {}
                : { engineResult: attempt.result.engineResult }),
              modelOutput: attempt.result.modelOutput,
            },
          }),
      stateAfter: callState,
    };
  });
  trace.turns.push({
    sequence: trace.turns.length + 1,
    kind: "dm",
    rawPlayerInput,
    calls,
    narration: turn.narration,
    diagnostics: turn.diagnostics,
    stateAfter: turn.state,
  });
}

export function recordLocalTraceTurn(
  trace: DmSessionTrace,
  kind: LocalTraceTurn["kind"],
  rawPlayerInput: string,
  stateAfter: SessionState,
): void {
  trace.turns.push({
    sequence: trace.turns.length + 1,
    kind,
    rawPlayerInput,
    calls: [],
    narration: null,
    diagnostics: [],
    stateAfter,
  });
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
  trace: AnySessionTrace,
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

export function serializeSessionTrace(trace: AnySessionTrace): string {
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
  trace: AnySessionTrace,
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
