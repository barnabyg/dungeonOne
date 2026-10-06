import { stripVTControlCharacters } from "node:util";

import type { RandomSource } from "./random.js";
import type {
  AdventureRuntime,
  CharacterStatus,
  DmScene,
  GameToolCall,
  GameToolDefinition,
  RuntimeState as SessionState,
  RuntimeToolResult as GameToolDispatchResult,
} from "./runtime-contract.js";

export const DM_TURN_LIMITS = Object.freeze({
  maxReadCalls: 3,
  maxModelResponses: 4,
  maxPlayerInputCharacters: 1_000,
  maxNarrationCharacters: 1_200,
  maxTranscriptEntries: 8,
  maxTranscriptCharacters: 4_000,
});

export type DmTranscriptEntry = Readonly<{
  role: "player" | "dungeon-master";
  text: string;
}>;

export type DmToolCall = Readonly<GameToolCall & { id: string }>;

export type DmProviderResponse = Readonly<{
  responseId: string;
  model: string;
  status: string;
  usage?: Readonly<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}>;

export type DmModelResponse =
  | Readonly<{ text: string; provider?: DmProviderResponse }>
  | Readonly<{
      toolCalls: readonly DmToolCall[];
      provider?: DmProviderResponse;
    }>;

export type DmModelRequest = Readonly<{
  promptVersion: string;
  systemPrompt: string;
  playerInput: string;
  transcript: readonly DmTranscriptEntry[];
  scene: DmScene;
  characterStatus: CharacterStatus;
  tools: readonly GameToolDefinition[];
  toolResults: readonly Readonly<{
    call: DmToolCall;
    output: GameToolDispatchResult["modelOutput"];
  }>[];
}>;

export type DmModel = Readonly<{
  identity?: Readonly<{
    provider: string;
    model: string;
  }>;
  respond(request: DmModelRequest): Promise<DmModelResponse>;
}>;

/**
 * A provider call budget shared by every model it limits: once `maxCalls`
 * responses have been asked for, a limited model throws instead of calling,
 * which a DM turn reports as a model failure.
 */
export function createDmCallBudget(maxCalls: number) {
  let calls = 0;
  return {
    calls: () => calls,
    spent: () => calls >= maxCalls,
    limit(model: DmModel): DmModel {
      return {
        ...(model.identity === undefined ? {} : { identity: model.identity }),
        async respond(request) {
          if (calls >= maxCalls) {
            throw new Error("The AI call budget is spent.");
          }
          calls += 1;
          return model.respond(request);
        },
      };
    },
  };
}

export const DM_INPUT_DIAGNOSTIC_CODES = [
  "empty-player-input",
  "overlong-player-input",
] as const;
export const DM_RESPONSE_DIAGNOSTIC_CODES = [
  "model-failure",
  "model-response-limit",
  "malformed-response",
  "empty-narration",
  "overlong-narration",
  "multi-call-response",
] as const;
export const DM_CALL_DIAGNOSTIC_CODES = [
  "duplicate-call-id",
  "unsupported-tool",
  "read-call-limit",
  "mutation-call-limit",
] as const;
export const DM_DIAGNOSTIC_CODES = [
  ...DM_INPUT_DIAGNOSTIC_CODES,
  ...DM_RESPONSE_DIAGNOSTIC_CODES,
  ...DM_CALL_DIAGNOSTIC_CODES,
] as const;

export type DmDiagnosticCode = (typeof DM_DIAGNOSTIC_CODES)[number];

export type DmDiagnostic = Readonly<{
  code: DmDiagnosticCode;
  responseNumber?: number;
  callId?: string;
}>;

export type DmTurnResult = Readonly<{
  state: SessionState;
  toolResults: readonly Readonly<{
    call: DmToolCall;
    result: GameToolDispatchResult;
    disposition: DmToolDisposition;
    rolls: readonly DmRoll[];
  }>[];
  toolAttempts: readonly DmToolAttempt[];
  mechanics: readonly string[];
  narration: string;
  transcript: readonly DmTranscriptEntry[];
  diagnostics: readonly DmDiagnostic[];
}>;

export type DmToolDisposition = Readonly<{
  attempted: true;
  validated: boolean;
  executed: boolean;
}>;

export type DmRoll = Readonly<{ sides: number; value: number }>;

export type DmToolAttempt = Readonly<{
  call: DmToolCall;
  disposition: DmToolDisposition;
  rolls: readonly DmRoll[];
  result?: GameToolDispatchResult;
}>;

function unexecutedAttempt(call: DmToolCall): DmToolAttempt {
  return {
    call,
    disposition: { attempted: true, validated: false, executed: false },
    rolls: [],
  };
}

const SAFE_FALLBACK =
  "I couldn't complete that request safely. Please try one specific action, or ask one specific question about what you can see or your character's status.";
const COMMITTED_ACTION_FALLBACK =
  "The attempted action's authoritative result is shown in Mechanics. No further action was executed.";
/** Browser replies after a post-action AI failure name the visible card (#112). */
export const BROWSER_RESOLVED_ACTION_FALLBACK =
  "The action resolved and was saved; its authoritative result is shown in the Resolved action card below. Do not repeat it. No further action was executed.";
export const BROWSER_REJECTED_ACTION_FALLBACK =
  "The action was refused; the Action rejected card below gives the reason. No action was committed and nothing changed.";
const EMPTY_INPUT_FALLBACK =
  "Please enter a question about what you can see or your character's status.";

export function normalizeDmText(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/gu, "")
    .trim();
}

function boundTranscript(
  entries: readonly DmTranscriptEntry[],
): readonly DmTranscriptEntry[] {
  const sanitized = entries.map((entry) => ({
    role: entry.role,
    text: normalizeDmText(entry.text),
  }));
  const bounded = sanitized.slice(-DM_TURN_LIMITS.maxTranscriptEntries);
  let characters = bounded.reduce(
    (total, entry) => total + entry.text.length,
    0,
  );
  while (
    characters > DM_TURN_LIMITS.maxTranscriptCharacters &&
    bounded.length > 0
  ) {
    const first = bounded[0];
    if (first === undefined) {
      break;
    }
    const overflow = characters - DM_TURN_LIMITS.maxTranscriptCharacters;
    if (overflow < first.text.length) {
      bounded[0] = { ...first, text: first.text.slice(overflow) };
      characters -= overflow;
    } else {
      bounded.shift();
      characters -= first.text.length;
    }
  }
  return bounded;
}

function parseSingleToolCall(value: unknown): DmToolCall | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    record.id === undefined ||
    record.name === undefined ||
    record.argumentsJson === undefined ||
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    typeof record.name !== "string" ||
    typeof record.argumentsJson !== "string"
  ) {
    return undefined;
  }
  return {
    id: record.id,
    name: record.name,
    argumentsJson: record.argumentsJson,
  };
}

function renderMechanics(
  result: GameToolDispatchResult,
  runtime: AdventureRuntime,
): string {
  if (result.engineResult !== undefined && "events" in result.engineResult) {
    return runtime.renderResult({
      state: result.state,
      events: result.engineResult.events,
    });
  }
  if (result.engineResult !== undefined && "rejection" in result.engineResult) {
    return runtime.renderResult({
      state: result.state,
      rejection: result.engineResult.rejection,
    });
  }
  if (result.modelOutput.ok && result.modelOutput.status !== undefined) {
    const status = result.modelOutput.status;
    return [
      `Fighter HP: ${status.hp}/${status.maxHp}`,
      `Session: ${status.outcome}.`,
      `Equipped: ${status.equipment.map(({ name }) => name).join(", ") || "nothing"}.`,
      `Collectibles: ${status.collectedItems.map(({ name }) => name).join(", ") || "empty"}.`,
    ].join("\n");
  }
  if (!result.modelOutput.ok) {
    return `Tool rejected: ${result.modelOutput.error.code}.`;
  }
  return "No authoritative information was returned.";
}

function offeredTools(
  state: SessionState,
  mutationAttempted: boolean,
  runtime: AdventureRuntime,
): readonly GameToolDefinition[] {
  const tools = runtime.getGameToolDefinitions(state);
  const readToolNames = new Set(runtime.readToolNames);
  return mutationAttempted
    ? tools.filter(({ name }) => readToolNames.has(name))
    : tools;
}

export async function runDmTurn(
  input: Readonly<{
    state: SessionState;
    playerInput: string;
    transcript: readonly DmTranscriptEntry[];
    random: Pick<RandomSource, "roll">;
    model: DmModel;
    runtime: AdventureRuntime;
    executeTool?: (
      state: SessionState,
      call: DmToolCall,
      playerInput: string,
    ) => Promise<
      Readonly<{ result: GameToolDispatchResult; rolls: readonly DmRoll[] }>
    >;
    /**
     * Where the player sees authoritative results: the terminal's Mechanics
     * block (default) or the browser's result cards. Only the wording of the
     * reply after an AI failure that follows an action depends on it.
     */
    resultSurface?: "mechanics" | "browser-cards";
  }>,
): Promise<DmTurnResult> {
  const runtime = input.runtime;
  const playerInput = normalizeDmText(input.playerInput);
  const transcript = boundTranscript(input.transcript);
  const diagnostics: DmDiagnostic[] = [];
  const toolResults: Array<DmTurnResult["toolResults"][number]> = [];
  const toolAttempts: DmToolAttempt[] = [];
  const mechanics: string[] = [];
  let state = input.state;
  const setState = (next: SessionState): void => {
    state = next;
  };
  const budget = { readCalls: 0, mutationAttempts: 0 };
  const readToolNames = new Set(runtime.readToolNames);
  const mutationToolNames = new Set(runtime.mutationToolNames);
  const supportedToolNames = new Set([...readToolNames, ...mutationToolNames]);

  const complete = (
    narration: string,
    transcriptPlayerInput = playerInput,
  ): DmTurnResult => ({
    state,
    toolResults,
    toolAttempts,
    mechanics,
    narration,
    transcript: boundTranscript([
      ...transcript,
      { role: "player", text: transcriptPlayerInput },
      { role: "dungeon-master", text: narration },
    ]),
    diagnostics,
  });
  const attemptedActionFallback = (): string => {
    if (input.resultSurface === "browser-cards") {
      const last = toolResults.findLast(({ call }) =>
        mutationToolNames.has(call.name),
      );
      return last?.result.engineResult !== undefined &&
        "events" in last.result.engineResult
        ? BROWSER_RESOLVED_ACTION_FALLBACK
        : BROWSER_REJECTED_ACTION_FALLBACK;
    }
    return COMMITTED_ACTION_FALLBACK;
  };
  const fail = (
    diagnostic: DmDiagnostic,
    narration = budget.mutationAttempts > 0
      ? attemptedActionFallback()
      : SAFE_FALLBACK,
    transcriptPlayerInput = playerInput,
  ): DmTurnResult => {
    diagnostics.push(diagnostic);
    return complete(narration, transcriptPlayerInput);
  };

  if (playerInput.length === 0) {
    return fail({ code: "empty-player-input" }, EMPTY_INPUT_FALLBACK);
  }
  if (playerInput.length > DM_TURN_LIMITS.maxPlayerInputCharacters) {
    return fail(
      { code: "overlong-player-input" },
      SAFE_FALLBACK,
      playerInput.slice(0, DM_TURN_LIMITS.maxPlayerInputCharacters),
    );
  }

  const callIds = new Set<string>();
  for (
    let responseNumber = 1;
    responseNumber <= DM_TURN_LIMITS.maxModelResponses;
    responseNumber += 1
  ) {
    let response: unknown;
    try {
      response = await input.model.respond({
        promptVersion: runtime.promptVersion,
        systemPrompt: runtime.systemPrompt,
        playerInput,
        transcript,
        scene: runtime.projectDmScene(state),
        characterStatus: runtime.projectCharacterStatus(state),
        tools: offeredTools(state, budget.mutationAttempts > 0, runtime),
        toolResults: toolResults.map(({ call, result }) => ({
          call,
          output: result.modelOutput,
        })),
      });
    } catch {
      return fail({ code: "model-failure", responseNumber });
    }

    if (
      response === null ||
      typeof response !== "object" ||
      Array.isArray(response)
    ) {
      return fail({ code: "malformed-response", responseNumber });
    }
    const record = response as Record<string, unknown>;
    const hasText = record.text !== undefined;
    const hasToolCalls = record.toolCalls !== undefined;
    if (hasText === hasToolCalls) {
      return fail({ code: "malformed-response", responseNumber });
    }

    if (hasText) {
      if (typeof record.text !== "string") {
        return fail({ code: "malformed-response", responseNumber });
      }
      const narration = normalizeDmText(record.text);
      if (narration.length === 0) {
        return fail({ code: "empty-narration", responseNumber });
      }
      if (narration.length > DM_TURN_LIMITS.maxNarrationCharacters) {
        return fail({ code: "overlong-narration", responseNumber });
      }
      return complete(narration);
    }

    if (!Array.isArray(record.toolCalls)) {
      return fail({ code: "malformed-response", responseNumber });
    }
    if (record.toolCalls.length !== 1) {
      for (const value of record.toolCalls) {
        const attemptedCall = parseSingleToolCall(value);
        if (attemptedCall !== undefined) {
          toolAttempts.push(unexecutedAttempt(attemptedCall));
        }
      }
      return fail({
        code:
          record.toolCalls.length > 1
            ? "multi-call-response"
            : "malformed-response",
        responseNumber,
      });
    }
    const call = parseSingleToolCall(record.toolCalls[0]);
    if (call === undefined) {
      return fail({ code: "malformed-response", responseNumber });
    }
    if (callIds.has(call.id)) {
      toolAttempts.push(unexecutedAttempt(call));
      return fail({
        code: "duplicate-call-id",
        responseNumber,
        callId: call.id,
      });
    }
    if (!supportedToolNames.has(call.name)) {
      toolAttempts.push(unexecutedAttempt(call));
      return fail({
        code: "unsupported-tool",
        responseNumber,
        callId: call.id,
      });
    }
    const isMutation = mutationToolNames.has(call.name);
    if (isMutation && budget.mutationAttempts > 0) {
      toolAttempts.push(unexecutedAttempt(call));
      return fail({
        code: "mutation-call-limit",
        responseNumber,
        callId: call.id,
      });
    }
    if (!isMutation && budget.readCalls >= DM_TURN_LIMITS.maxReadCalls) {
      toolAttempts.push(unexecutedAttempt(call));
      return fail({
        code: "read-call-limit",
        responseNumber,
        callId: call.id,
      });
    }

    callIds.add(call.id);
    if (isMutation) {
      budget.mutationAttempts += 1;
    } else {
      budget.readCalls += 1;
    }
    const rolls: DmRoll[] = [];
    const recordingRandom = {
      roll(sides: number): number {
        const value = input.random.roll(sides);
        rolls.push({ sides, value });
        return value;
      },
    };
    const executed =
      input.executeTool === undefined
        ? {
            result: runtime.dispatchGameTool(
              state,
              call,
              recordingRandom,
              input.playerInput,
            ),
            rolls,
          }
        : await input.executeTool(state, call, input.playerInput);
    const result = executed.result;
    const validated =
      result.engineResult !== undefined || result.modelOutput.ok;
    const disposition = {
      attempted: true,
      validated,
      executed: validated,
    } as const;
    setState(result.state);
    const toolResult = { call, result, disposition, rolls: executed.rolls };
    toolResults.push(toolResult);
    toolAttempts.push(toolResult);
    mechanics.push(renderMechanics(result, runtime));

    const authoredNarration = runtime.renderDmNarration?.(call, result);
    if (authoredNarration !== undefined) {
      return complete(authoredNarration);
    }
  }

  return fail({
    code: "model-response-limit",
    responseNumber: DM_TURN_LIMITS.maxModelResponses,
  });
}
