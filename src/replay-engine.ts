// The generic trace replay engine: decoding helpers and the command and AI DM
// replay loops. It drives runtimes only through the runtime contract, so the
// historical trace formats (legacy-replay.ts) and current ones share it.
import { parseBoundedJson } from "./bounded-json.js";
import {
  DM_CALL_DIAGNOSTIC_CODES,
  DM_DIAGNOSTIC_CODES,
  DM_INPUT_DIAGNOSTIC_CODES,
  DM_SUPPORTED_PROMPT_VERSIONS,
  DM_TURN_LIMITS,
  normalizeDmText,
  type DmDiagnosticCode,
} from "./dm-turn.js";
import { RANDOM_ALGORITHM, createSeededRandom } from "./random.js";
import type { AdventureRuntime, RuntimeResult } from "./runtime-contract.js";
import {
  requireArray,
  requireBoolean,
  requireFields,
  requireInteger,
  requireMatch,
  requireObject,
  requireOneOf,
  requireOnlyKeys,
  requireString,
  requireSupported,
  validateRoll,
  validateCompletion,
  type JsonObject,
} from "./replay-decode.js";
import { DM_TRACE_FORMAT_VERSION } from "./trace-file.js";
import type { RollRecord } from "./trace.js";

export type { JsonObject } from "./replay-decode.js";

export type ReplayRuntime = Pick<
  AdventureRuntime,
  | "createSession"
  | "parseCommand"
  | "handleAction"
  | "dispatchGameTool"
  | "readToolNames"
  | "mutationToolNames"
>;

/**
 * Replay knowledge about the trace formats and versions a runtime family
 * wrote. The registry supplies it; replay.ts never imports a runtime.
 */
export type TraceReplaySupport = Readonly<{
  /**
   * Verifies a whole trace in a format the family owns; false otherwise. The
   * engine is passed in so runtime families never import this module.
   */
  verifyTrace(trace: JsonObject, engine: TraceReplayEngine): boolean;
  /** Engine versions whose format-4 and format-6 traces can replay. */
  engineVersions: readonly string[];
  /** Earlier DM prompt versions a runtime's traces may still carry. */
  previousPromptVersions(promptVersion: string): readonly string[];
  /** Earlier tool schema versions a runtime's traces may still carry. */
  previousToolSchemaVersions(toolSchemaVersion: string): readonly string[];
  /** The player input a recorded tool call saw. */
  replayedPlayerInput(
    promptVersion: string,
    toolName: string,
    rawPlayerInput: string,
  ): string | undefined;
}>;

export type ReplayAction = Readonly<{
  sequence: number;
  rawInput: string;
  action: JsonObject;
  rolls: readonly RollRecord[];
  result: JsonObject;
  stateAfter: JsonObject;
}>;

export type ReplayTrace = Readonly<{
  runtime: ReplayRuntime;
  rulesVersion: string;
  initialSeed: number;
  initialState: JsonObject;
  actions: readonly ReplayAction[];
  completion: Readonly<{
    reason: "quit" | "eof";
    outcome: "victory" | "defeat" | "incomplete";
  }>;
}>;

export type ReplayDmCall = Readonly<{
  sequence: number;
  id: string;
  name: string;
  argumentsJson: string;
  disposition: JsonObject;
  rolls: readonly RollRecord[];
  result?: JsonObject;
  failure?: ReplayDmDiagnostic;
  stateAfter: JsonObject;
}>;

export type ReplayDmDiagnostic = Readonly<{
  code: DmDiagnosticCode;
  responseNumber?: number;
  callId?: string;
}>;

export type ReplayDmTurn = Readonly<{
  sequence: number;
  kind:
    | "dm"
    | "local-help"
    | "local-journal"
    | "local-status"
    | "local-inventory"
    | "local-quit";
  rawPlayerInput: string;
  calls: readonly ReplayDmCall[];
  diagnostics: readonly ReplayDmDiagnostic[];
  stateAfter: JsonObject;
  result?: JsonObject;
}>;

export type ReplayDmTrace = Readonly<{
  runtime: ReplayRuntime;
  promptVersion: string;
  initialSeed: number;
  initialState: JsonObject;
  turns: readonly ReplayDmTurn[];
  completion: Readonly<{
    reason: "quit" | "eof";
    outcome: "victory" | "defeat" | "incomplete";
  }>;
}>;

export function validateDmArguments(
  value: unknown,
  path: string,
  bounded = false,
): string {
  const encoded = requireObject(value, path);
  const raw = requireString(encoded.raw, `${path}.raw`);
  if (bounded && encoded.encoding === "raw") {
    requireFields(encoded, ["encoding", "raw"], path);
    try {
      parseBoundedJson(raw, 16384);
    } catch {
      return raw;
    }
    throw new Error(`${path}.raw encoding requires invalid bounded JSON.`);
  }
  if (encoded.encoding === "json") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`${path}.raw must contain valid JSON.`);
    }
    requireMatch(`${path} decoded value`, encoded.value, decoded);
  } else if (encoded.encoding === "invalid-json") {
    try {
      JSON.parse(raw);
    } catch {
      return raw;
    }
    throw new Error(`${path}.raw must contain invalid JSON.`);
  } else {
    throw new Error(`${path}.encoding must be "json" or "invalid-json".`);
  }
  return raw;
}

export function validateDisposition(value: unknown, path: string): JsonObject {
  const disposition = requireObject(value, path);
  if (disposition.attempted !== true) {
    throw new Error(`${path}.attempted must be true.`);
  }
  requireBoolean(disposition.validated, `${path}.validated`);
  requireBoolean(disposition.executed, `${path}.executed`);
  return disposition;
}

export const INPUT_DIAGNOSTIC_CODE_SET = new Set<DmDiagnosticCode>(
  DM_INPUT_DIAGNOSTIC_CODES,
);
export const CALL_DIAGNOSTIC_CODE_SET = new Set<DmDiagnosticCode>(
  DM_CALL_DIAGNOSTIC_CODES,
);

export function validateDmDiagnostic(
  value: unknown,
  path: string,
): ReplayDmDiagnostic {
  const diagnostic = requireObject(value, path);
  requireOnlyKeys(diagnostic, ["code", "responseNumber", "callId"], path);
  const code = requireOneOf(
    diagnostic.code,
    DM_DIAGNOSTIC_CODES,
    `${path}.code`,
  ) as DmDiagnosticCode;
  const responseNumber =
    diagnostic.responseNumber === undefined
      ? undefined
      : requireInteger(diagnostic.responseNumber, `${path}.responseNumber`);
  const callId =
    diagnostic.callId === undefined
      ? undefined
      : requireString(diagnostic.callId, `${path}.callId`);

  if (INPUT_DIAGNOSTIC_CODE_SET.has(code)) {
    if (responseNumber !== undefined || callId !== undefined) {
      throw new Error(`${path} must not identify a response or call.`);
    }
  } else {
    if (
      responseNumber === undefined ||
      responseNumber < 1 ||
      responseNumber > DM_TURN_LIMITS.maxModelResponses
    ) {
      throw new Error(
        `${path}.responseNumber must be from 1 through ${DM_TURN_LIMITS.maxModelResponses}.`,
      );
    }
    const requiresCallId = CALL_DIAGNOSTIC_CODE_SET.has(code);
    if (requiresCallId !== (callId !== undefined)) {
      throw new Error(
        requiresCallId
          ? `${path}.callId is required for ${code}.`
          : `${path}.callId is not allowed for ${code}.`,
      );
    }
  }

  return {
    code,
    ...(responseNumber === undefined ? {} : { responseNumber }),
    ...(callId === undefined ? {} : { callId }),
  };
}

export function validateDmTrace(
  value: unknown,
  options: Readonly<{
    formatVersion?: number;
    adventureId: string;
    adventureVersion: string;
    rulesVersion: string;
    promptVersions?: readonly string[];
    toolSchemaVersions: readonly string[];
    validateRuntimeState: (value: unknown, path: string) => JsonObject;
    localKinds?: readonly ReplayDmTurn["kind"][];
    /** Runs last, after the whole trace has been validated. */
    resolveRuntime: (trace: JsonObject, adventure: JsonObject) => ReplayRuntime;
  }>,
): ReplayDmTrace {
  const trace = requireObject(value, "Trace");
  requireSupported(
    trace.formatVersion,
    options.formatVersion ?? DM_TRACE_FORMAT_VERSION,
    "trace format version",
  );
  requireSupported(trace.rulesVersion, options.rulesVersion, "rules version");
  const adventure = requireObject(trace.adventure, "adventure");
  if (adventure.id !== undefined) {
    requireSupported(adventure.id, options.adventureId, "adventure id");
  }
  requireSupported(
    adventure.version,
    options.adventureVersion,
    "adventure version",
  );
  const random = requireObject(trace.random, "random");
  requireSupported(random.algorithm, RANDOM_ALGORITHM, "random algorithm");
  if (
    !Number.isInteger(random.initialSeed) ||
    Number(random.initialSeed) < 0 ||
    Number(random.initialSeed) > 0xffff_ffff
  ) {
    throw new Error("random.initialSeed must be an unsigned 32-bit integer.");
  }
  const dm = requireObject(trace.dm, "dm");
  if (
    !(options.promptVersions ?? DM_SUPPORTED_PROMPT_VERSIONS).some(
      (version) => version === dm.promptVersion,
    )
  ) {
    throw new Error(
      `Unsupported DM prompt version ${JSON.stringify(dm.promptVersion)}.`,
    );
  }
  if (
    !options.toolSchemaVersions.some(
      (version) => version === dm.toolSchemaVersion,
    )
  ) {
    throw new Error(
      `Unsupported tool schema version ${JSON.stringify(dm.toolSchemaVersion)}.`,
    );
  }
  requireString(dm.provider, "dm.provider");
  requireString(dm.model, "dm.model");
  const runtimeState = options.validateRuntimeState;
  const initialState = runtimeState(trace.initialState, "initialState");
  const turns = requireArray(trace.turns, "turns").map(
    (value, turnIndex): ReplayDmTurn => {
      const path = `turns[${turnIndex}]`;
      const turn = requireObject(value, path);
      if (turn.sequence !== turnIndex + 1) {
        throw new Error(`${path}.sequence must be ${turnIndex + 1}.`);
      }
      const kind = requireOneOf(
        turn.kind,
        options.localKinds ?? ["dm", "local-help", "local-quit"],
        `${path}.kind`,
      ) as ReplayDmTurn["kind"];
      const rawPlayerInput = requireString(
        turn.rawPlayerInput,
        `${path}.rawPlayerInput`,
      );
      const localResult =
        turn.result === undefined
          ? undefined
          : requireObject(turn.result, `${path}.result`);
      const localRead = [
        "local-journal",
        "local-status",
        "local-inventory",
      ].includes(kind);
      if (localRead !== (localResult !== undefined)) {
        throw new Error(
          localRead
            ? `${path}.result is required for ${kind}.`
            : `${path}.result is not allowed for ${kind}.`,
        );
      }
      const calls = requireArray(turn.calls, `${path}.calls`).map(
        (callValue, callIndex): ReplayDmCall => {
          const callPath = `${path}.calls[${callIndex}]`;
          const call = requireObject(callValue, callPath);
          if (call.sequence !== callIndex + 1) {
            throw new Error(`${callPath}.sequence must be ${callIndex + 1}.`);
          }
          const result =
            call.result === undefined
              ? undefined
              : requireObject(call.result, `${callPath}.result`);
          const disposition = validateDisposition(
            call.disposition,
            `${callPath}.disposition`,
          );
          const rolls = requireArray(call.rolls, `${callPath}.rolls`).map(
            (roll, rollIndex) =>
              validateRoll(roll, `${callPath}.rolls[${rollIndex}]`),
          );
          if (result !== undefined) {
            requireObject(result.modelOutput, `${callPath}.result.modelOutput`);
            if (result.engineResult !== undefined) {
              requireObject(
                result.engineResult,
                `${callPath}.result.engineResult`,
              );
            }
          }
          const failure =
            call.failure === undefined
              ? undefined
              : validateDmDiagnostic(call.failure, `${callPath}.failure`);
          if (result === undefined) {
            if (disposition.validated || disposition.executed) {
              throw new Error(
                `${callPath}.result is required for a validated or executed call.`,
              );
            }
            if (failure === undefined) {
              throw new Error(
                `${callPath}.failure is required for an unexecuted call.`,
              );
            }
            if (rolls.length !== 0) {
              throw new Error(
                `${callPath}.rolls must be empty for an unexecuted call.`,
              );
            }
          } else if (failure !== undefined) {
            throw new Error(
              `${callPath}.failure is not allowed when a result is recorded.`,
            );
          }
          if (disposition.validated !== disposition.executed) {
            throw new Error(
              `${callPath}.validated and executed must be equal for this tool schema version.`,
            );
          }
          return {
            sequence: call.sequence as number,
            id: requireString(call.id, `${callPath}.id`),
            name: requireString(call.name, `${callPath}.name`),
            argumentsJson: validateDmArguments(
              call.arguments,
              `${callPath}.arguments`,
              (options.formatVersion ?? 0) >= 4,
            ),
            disposition,
            rolls,
            ...(result === undefined ? {} : { result }),
            ...(failure === undefined ? {} : { failure }),
            stateAfter: runtimeState(call.stateAfter, `${callPath}.stateAfter`),
          };
        },
      );
      if (kind !== "dm" && calls.length !== 0) {
        throw new Error(`${path}.calls must be empty for ${kind}.`);
      }
      if (kind === "dm") {
        requireString(turn.narration, `${path}.narration`);
      } else if (turn.narration !== null) {
        throw new Error(`${path}.narration must be null for ${kind}.`);
      }
      const diagnostics = requireArray(
        turn.diagnostics,
        `${path}.diagnostics`,
      ).map((diagnostic, diagnosticIndex) =>
        validateDmDiagnostic(
          diagnostic,
          `${path}.diagnostics[${diagnosticIndex}]`,
        ),
      );
      if (kind !== "dm" && diagnostics.length !== 0) {
        throw new Error(`${path}.diagnostics must be empty for ${kind}.`);
      }
      if (kind === "dm" && diagnostics.length > 1) {
        throw new Error(
          `${path}.diagnostics must contain at most one failure.`,
        );
      }
      return {
        sequence: turn.sequence as number,
        kind,
        rawPlayerInput,
        calls,
        diagnostics,
        stateAfter: runtimeState(turn.stateAfter, `${path}.stateAfter`),
        ...(localResult === undefined ? {} : { result: localResult }),
      };
    },
  );
  return {
    runtime: options.resolveRuntime(trace, adventure),
    promptVersion: requireString(dm.promptVersion, "dm.promptVersion"),
    initialSeed: Number(random.initialSeed),
    initialState,
    turns,
    completion: validateCompletion(trace.completion),
  };
}

export function traceResult(result: RuntimeResult): JsonObject {
  return result.rejection === undefined
    ? { type: "accepted", events: result.events }
    : { type: "rejected", rejection: result.rejection };
}

export function replayCommandTrace(trace: ReplayTrace): void {
  let state = trace.runtime.createSession();
  requireMatch("initial state", trace.initialState, state);
  const random = createSeededRandom(trace.initialSeed);
  let reason: "quit" | "eof" = "eof";

  for (const [index, expected] of trace.actions.entries()) {
    const actionNumber = index + 1;
    const action = trace.runtime.parseCommand(expected.rawInput);
    requireMatch(
      `action ${actionNumber} parsed action`,
      expected.action,
      action,
    );
    const rolls: RollRecord[] = [];
    const result = trace.runtime.handleAction(state, action, {
      roll(sides: number): number {
        const value = random.roll(sides);
        rolls.push({ sides, value });
        return value;
      },
    });
    requireMatch(`action ${actionNumber} rolls`, expected.rolls, rolls);
    requireMatch(
      `action ${actionNumber} result`,
      expected.result,
      traceResult(result),
    );
    requireMatch(
      `action ${actionNumber} state`,
      expected.stateAfter,
      result.state,
    );
    state = result.state;
    if (
      result.events?.some((event) => event.type === "session-quit") === true
    ) {
      reason = "quit";
      if (index !== trace.actions.length - 1) {
        requireMatch(
          `action ${actionNumber + 1} presence`,
          trace.actions[actionNumber],
          "session ended",
        );
      }
    }
  }
  const outcome =
    state.status === "victory" || state.status === "defeat"
      ? state.status
      : "incomplete";
  requireMatch("completion", trace.completion, { reason, outcome });
}

export function expectedBlockedCallFailure(
  call: ReplayDmCall,
  readToolNames: ReadonlySet<string>,
  mutationToolNames: ReadonlySet<string>,
  callIds: ReadonlySet<string>,
  readCalls: number,
  mutationAttempts: number,
  responseNumber: number,
): ReplayDmDiagnostic | undefined {
  if (callIds.has(call.id)) {
    return { code: "duplicate-call-id", responseNumber, callId: call.id };
  }
  if (!readToolNames.has(call.name) && !mutationToolNames.has(call.name)) {
    return { code: "unsupported-tool", responseNumber, callId: call.id };
  }
  if (mutationToolNames.has(call.name) && mutationAttempts > 0) {
    return { code: "mutation-call-limit", responseNumber, callId: call.id };
  }
  if (
    readToolNames.has(call.name) &&
    readCalls >= DM_TURN_LIMITS.maxReadCalls
  ) {
    return { code: "read-call-limit", responseNumber, callId: call.id };
  }
  return undefined;
}

export function expectedPlayerInputFailure(
  rawPlayerInput: string,
): ReplayDmDiagnostic | undefined {
  const playerInput = normalizeDmText(rawPlayerInput);
  return playerInput.length === 0
    ? { code: "empty-player-input" }
    : playerInput.length > DM_TURN_LIMITS.maxPlayerInputCharacters
      ? { code: "overlong-player-input" }
      : undefined;
}

export function expectedTerminalDiagnostic(
  diagnostic: ReplayDmDiagnostic,
  callCount: number,
  responseNumber: number,
): ReplayDmDiagnostic | undefined {
  if (INPUT_DIAGNOSTIC_CODE_SET.has(diagnostic.code)) {
    return undefined;
  }
  if (diagnostic.code === "model-response-limit") {
    return responseNumber === DM_TURN_LIMITS.maxModelResponses + 1
      ? {
          code: "model-response-limit",
          responseNumber: DM_TURN_LIMITS.maxModelResponses,
        }
      : undefined;
  }
  if (
    diagnostic.code === "multi-call-response" &&
    callCount === 0 &&
    responseNumber <= DM_TURN_LIMITS.maxModelResponses
  ) {
    return { code: "multi-call-response", responseNumber };
  }
  if (
    [
      "model-failure",
      "malformed-response",
      "empty-narration",
      "overlong-narration",
      "unsafe-npc-reply",
    ].includes(diagnostic.code) &&
    responseNumber <= DM_TURN_LIMITS.maxModelResponses
  ) {
    return { code: diagnostic.code, responseNumber };
  }
  return undefined;
}

/**
 * Replays an AI DM trace. `playerInputFor` gives the player input a recorded
 * tool call saw, which some historical runtimes withheld.
 */
export function replayDmTrace(
  trace: ReplayDmTrace,
  playerInputFor: TraceReplaySupport["replayedPlayerInput"],
): void {
  let state = trace.runtime.createSession();
  requireMatch("initial state", trace.initialState, state);
  const random = createSeededRandom(trace.initialSeed);
  let reason: "quit" | "eof" = "eof";
  const readToolNames = new Set(trace.runtime.readToolNames);
  const mutationToolNames = new Set(trace.runtime.mutationToolNames);

  for (const [turnIndex, turn] of trace.turns.entries()) {
    const turnNumber = turnIndex + 1;
    if (reason === "quit") {
      requireMatch(`turn ${turnNumber} presence`, turn, "session ended");
    }
    if (turn.kind === "local-help") {
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
      continue;
    }
    if (
      turn.kind === "local-journal" ||
      turn.kind === "local-status" ||
      turn.kind === "local-inventory"
    ) {
      const command = turn.kind.slice("local-".length);
      requireMatch(
        `turn ${turnNumber} ${turn.kind} input`,
        turn.rawPlayerInput.trim().toLowerCase(),
        command,
      );
      const read = trace.runtime.handleAction(state, { type: command });
      if (read.rejection !== undefined) {
        throw new Error(
          `Replay divergence at turn ${turnNumber} ${turn.kind} action.`,
        );
      }
      requireMatch(
        `turn ${turnNumber} ${turn.kind} result`,
        turn.result,
        traceResult(read),
      );
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, read.state);
      state = read.state;
      continue;
    }
    if (turn.kind === "local-quit") {
      const quit = trace.runtime.handleAction(state, { type: "quit" }, random);
      state = quit.state;
      reason = "quit";
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
      continue;
    }

    const inputFailure = expectedPlayerInputFailure(turn.rawPlayerInput);
    if (inputFailure !== undefined) {
      requireMatch(`turn ${turnNumber} calls`, turn.calls, []);
      requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
        inputFailure,
      ]);
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
      continue;
    }

    const callIds = new Set<string>();
    let readCalls = 0;
    let mutationAttempts = 0;
    let responseNumber = 1;
    let orchestrationEnded = false;

    for (const [callIndex, expected] of turn.calls.entries()) {
      const location = `turn ${turnNumber} call ${callIndex + 1}`;
      if (expected.result === undefined) {
        if (expected.failure?.code === "multi-call-response") {
          const failure = {
            code: "multi-call-response",
            responseNumber,
          };
          for (const [remainingIndex, blocked] of turn.calls
            .slice(callIndex)
            .entries()) {
            const blockedLocation = `turn ${turnNumber} call ${
              callIndex + remainingIndex + 1
            }`;
            requireMatch(
              `${blockedLocation} result presence`,
              blocked.result,
              undefined,
            );
            requireMatch(
              `${blockedLocation} disposition`,
              blocked.disposition,
              { attempted: true, validated: false, executed: false },
            );
            requireMatch(
              `${blockedLocation} failure`,
              blocked.failure,
              failure,
            );
            requireMatch(`${blockedLocation} state`, blocked.stateAfter, state);
          }
          requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
            failure,
          ]);
          orchestrationEnded = true;
          break;
        }

        const failure = expectedBlockedCallFailure(
          expected,
          readToolNames,
          mutationToolNames,
          callIds,
          readCalls,
          mutationAttempts,
          responseNumber,
        );
        requireMatch(`${location} failure`, expected.failure, failure);
        requireMatch(`${location} disposition`, expected.disposition, {
          attempted: true,
          validated: false,
          executed: false,
        });
        requireMatch(`${location} state`, expected.stateAfter, state);
        if (callIndex !== turn.calls.length - 1) {
          requireMatch(
            `turn ${turnNumber} call ${callIndex + 2} presence`,
            turn.calls[callIndex + 1],
            "turn ended",
          );
        }
        requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
          failure,
        ]);
        orchestrationEnded = true;
        break;
      }

      const blockedFailure = expectedBlockedCallFailure(
        expected,
        readToolNames,
        mutationToolNames,
        callIds,
        readCalls,
        mutationAttempts,
        responseNumber,
      );
      requireMatch(`${location} failure`, undefined, blockedFailure);
      callIds.add(expected.id);
      if (mutationToolNames.has(expected.name)) {
        mutationAttempts += 1;
      } else {
        readCalls += 1;
      }
      const rolls: RollRecord[] = [];
      const result = trace.runtime.dispatchGameTool(
        state,
        {
          name: expected.name,
          argumentsJson: expected.argumentsJson,
        },
        {
          roll(sides: number): number {
            const value = random.roll(sides);
            rolls.push({ sides, value });
            return value;
          },
        },
        playerInputFor(trace.promptVersion, expected.name, turn.rawPlayerInput),
      );
      const validated =
        result.engineResult !== undefined || result.modelOutput.ok;
      requireMatch(`${location} disposition`, expected.disposition, {
        attempted: true,
        validated,
        executed: validated,
      });
      requireMatch(`${location} rolls`, expected.rolls, rolls);
      requireMatch(`${location} result`, expected.result, {
        ...(result.engineResult === undefined
          ? {}
          : { engineResult: result.engineResult }),
        modelOutput: result.modelOutput,
      });
      requireMatch(`${location} state`, expected.stateAfter, result.state);
      state = result.state;
      responseNumber += 1;
    }

    if (!orchestrationEnded) {
      const diagnostic = turn.diagnostics[0];
      if (diagnostic === undefined) {
        requireMatch(
          `turn ${turnNumber} diagnostics`,
          turn.diagnostics,
          responseNumber <= DM_TURN_LIMITS.maxModelResponses
            ? []
            : [
                {
                  code: "model-response-limit",
                  responseNumber: DM_TURN_LIMITS.maxModelResponses,
                },
              ],
        );
      } else {
        requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
          expectedTerminalDiagnostic(
            diagnostic,
            turn.calls.length,
            responseNumber,
          ),
        ]);
      }
    }
    requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
  }

  const outcome =
    state.status === "victory" || state.status === "defeat"
      ? state.status
      : "incomplete";
  requireMatch("completion", trace.completion, { reason, outcome });
}

/** The replay loops a runtime family's trace verifier drives. */
export type TraceReplayEngine = Readonly<{
  validateDmTrace: typeof validateDmTrace;
  replayDmTrace: typeof replayDmTrace;
  replayCommandTrace: typeof replayCommandTrace;
}>;

export const TRACE_REPLAY_ENGINE: TraceReplayEngine = Object.freeze({
  validateDmTrace,
  replayDmTrace,
  replayCommandTrace,
});
