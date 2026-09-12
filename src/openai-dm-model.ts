import OpenAI from "openai";

import type {
  DmModel,
  DmModelRequest,
  DmModelResponse,
  DmProviderResponse,
  DmToolCall,
} from "./dm-turn.js";

export const OPENAI_DM_DEFAULT_TIMEOUT_MS = 30_000;
export const OPENAI_DM_DEFAULT_MODEL = "gpt-5.6-luna";

export const OPENAI_DM_ERROR_CODES = [
  "authentication",
  "rate-limit",
  "timeout",
  "unavailable",
  "malformed-response",
  "unknown",
] as const;

export type OpenAiDmErrorCode = (typeof OPENAI_DM_ERROR_CODES)[number];

export type OpenAiDmErrorEvidence = Readonly<{
  responseId?: string;
  model?: string;
  status?: string;
}>;

const ERROR_MESSAGES: Readonly<Record<OpenAiDmErrorCode, string>> = {
  authentication: "OpenAI authentication failed.",
  "rate-limit": "OpenAI rate limit exceeded.",
  timeout: "OpenAI request timed out.",
  unavailable: "OpenAI service is unavailable.",
  "malformed-response": "OpenAI returned a malformed response.",
  unknown: "OpenAI request failed.",
};

export class OpenAiDmError extends Error {
  readonly code: OpenAiDmErrorCode;
  readonly evidence?: OpenAiDmErrorEvidence;

  constructor(code: OpenAiDmErrorCode, evidence?: OpenAiDmErrorEvidence) {
    super(ERROR_MESSAGES[code]);
    this.name = "OpenAiDmError";
    this.code = code;
    if (evidence !== undefined) {
      this.evidence = evidence;
    }
  }
}

type ResponsesClient = Readonly<{
  responses: Readonly<{
    create(
      body: Record<string, unknown>,
      options: Readonly<{ signal: AbortSignal; timeout: number }>,
    ): Promise<unknown>;
  }>;
}>;

export type OpenAiDmModelConfig = Readonly<{
  apiKey: string;
  model: string;
  timeoutMs?: number;
  client?: ResponsesClient;
}>;

type ProviderOutputItem = Readonly<Record<string, unknown>>;

const TIMEOUT = Symbol("openai-timeout");

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerErrorEvidence(
  value: unknown,
): OpenAiDmErrorEvidence | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const responseId =
    typeof value.id === "string" && value.id.length > 0
      ? value.id
      : typeof value.request_id === "string" && value.request_id.length > 0
        ? value.request_id
        : undefined;
  const model =
    typeof value.model === "string" && value.model.length > 0
      ? value.model
      : undefined;
  const status =
    typeof value.status === "string" && value.status.length > 0
      ? value.status
      : undefined;
  if (responseId === undefined && model === undefined && status === undefined) {
    return undefined;
  }
  return {
    ...(responseId === undefined ? {} : { responseId }),
    ...(model === undefined ? {} : { model }),
    ...(status === undefined ? {} : { status }),
  };
}

function classifyProviderError(error: unknown): OpenAiDmError {
  const evidence = providerErrorEvidence(error);
  if (error === TIMEOUT) {
    return new OpenAiDmError("timeout");
  }
  if (isRecord(error)) {
    if (error.status === 401 || error.status === 403) {
      return new OpenAiDmError("authentication", evidence);
    }
    if (error.status === 429) {
      return new OpenAiDmError("rate-limit", evidence);
    }
    if (
      error.name === "APIConnectionTimeoutError" ||
      error.name === "AbortError" ||
      error.code === "ETIMEDOUT"
    ) {
      return new OpenAiDmError("timeout", evidence);
    }
    if (
      error.name === "APIConnectionError" ||
      (typeof error.status === "number" &&
        error.status >= 500 &&
        error.status <= 599)
    ) {
      return new OpenAiDmError("unavailable", evidence);
    }
  }
  return new OpenAiDmError("unknown", evidence);
}

function providerMetadata(
  response: Record<string, unknown>,
): DmProviderResponse {
  if (
    typeof response.id !== "string" ||
    response.id.length === 0 ||
    typeof response.model !== "string" ||
    response.model.length === 0 ||
    typeof response.status !== "string"
  ) {
    throw new OpenAiDmError("malformed-response");
  }
  const usage = response.usage;
  if (usage === undefined || usage === null) {
    return {
      responseId: response.id,
      model: response.model,
      status: response.status,
    };
  }
  if (
    !isRecord(usage) ||
    typeof usage.input_tokens !== "number" ||
    typeof usage.output_tokens !== "number" ||
    typeof usage.total_tokens !== "number"
  ) {
    throw new OpenAiDmError("malformed-response");
  }
  return {
    responseId: response.id,
    model: response.model,
    status: response.status,
    usage: {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
    },
  };
}

function visibleText(item: ProviderOutputItem): string | undefined {
  if (item.type !== "message" || !Array.isArray(item.content)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const content of item.content) {
    if (!isRecord(content)) {
      throw new OpenAiDmError("malformed-response");
    }
    if (content.type === "output_text" && typeof content.text === "string") {
      parts.push(content.text);
    } else if (
      content.type === "refusal" &&
      typeof content.refusal === "string"
    ) {
      parts.push(content.refusal);
    } else {
      throw new OpenAiDmError("malformed-response");
    }
  }
  return parts.length === 0 ? undefined : parts.join("\n");
}

function functionCall(item: ProviderOutputItem): DmToolCall | undefined {
  if (
    item.type !== "function_call" ||
    typeof item.call_id !== "string" ||
    item.call_id.length === 0 ||
    typeof item.name !== "string" ||
    typeof item.arguments !== "string"
  ) {
    return undefined;
  }
  return {
    id: item.call_id,
    name: item.name,
    argumentsJson: item.arguments,
  };
}

function normalizeResponse(response: unknown): Readonly<{
  result: DmModelResponse;
  output: readonly ProviderOutputItem[];
}> {
  if (
    !isRecord(response) ||
    !Array.isArray(response.output) ||
    (response.error !== undefined && response.error !== null)
  ) {
    throw new OpenAiDmError("malformed-response");
  }
  const metadata = providerMetadata(response);
  if (metadata.status !== "completed") {
    throw new OpenAiDmError("malformed-response");
  }
  const output = response.output.filter(isRecord);
  if (output.length !== response.output.length) {
    throw new OpenAiDmError("malformed-response");
  }
  if (
    output.some(
      (item) =>
        item.type !== "message" &&
        item.type !== "function_call" &&
        item.type !== "reasoning",
    )
  ) {
    throw new OpenAiDmError("malformed-response");
  }
  const textParts = output
    .map((item) => visibleText(item))
    .filter((part): part is string => part !== undefined);
  const toolCalls = output
    .map((item) => functionCall(item))
    .filter((call): call is DmToolCall => call !== undefined);
  if (textParts.length > 0 === toolCalls.length > 0) {
    throw new OpenAiDmError("malformed-response");
  }
  return {
    result:
      toolCalls.length > 0
        ? { toolCalls, provider: metadata }
        : { text: textParts.join("\n"), provider: metadata },
    output,
  };
}

function baseInput(
  request: DmModelRequest,
): readonly Record<string, unknown>[] {
  return [
    ...request.transcript.map((entry) => ({
      role: entry.role === "player" ? "user" : "assistant",
      content: entry.text,
    })),
    { role: "user", content: request.playerInput },
  ];
}

function instructions(request: DmModelRequest): string {
  return [
    request.systemPrompt,
    "Current authoritative context (JSON):",
    JSON.stringify({
      promptVersion: request.promptVersion,
      scene: request.scene,
      characterStatus: request.characterStatus,
    }),
  ].join("\n\n");
}

function functionOutput(
  request: DmModelRequest,
): Record<string, unknown> | undefined {
  const latest = request.toolResults.at(-1);
  if (latest === undefined) {
    return undefined;
  }
  return {
    type: "function_call_output",
    call_id: latest.call.id,
    output: JSON.stringify({
      result: latest.output,
      scene: request.scene,
      characterStatus: request.characterStatus,
    }),
  };
}

function createSdkClient(apiKey: string, timeoutMs: number): ResponsesClient {
  const sdk = new OpenAI({ apiKey, maxRetries: 0, timeout: timeoutMs });
  return sdk as unknown as ResponsesClient;
}

export function createOpenAiDmModel(config: OpenAiDmModelConfig): DmModel {
  const timeoutMs = config.timeoutMs ?? OPENAI_DM_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("OpenAI timeout must be a positive finite number.");
  }
  const client = config.client ?? createSdkClient(config.apiKey, timeoutMs);
  let continuation: ProviderOutputItem[] = [];
  let continuationInput: readonly Record<string, unknown>[] = [];
  let returnedToolResultCount = 0;

  return {
    identity: { provider: "openai", model: config.model },
    async respond(request): Promise<DmModelResponse> {
      if (request.toolResults.length === 0) {
        continuation = [];
        continuationInput = baseInput(request);
        returnedToolResultCount = 0;
      }
      const output = functionOutput(request);
      const newToolResult =
        request.toolResults.length > returnedToolResultCount;
      if (request.toolResults.length < returnedToolResultCount) {
        throw new OpenAiDmError("malformed-response");
      }
      if (newToolResult) {
        returnedToolResultCount = request.toolResults.length;
        if (output !== undefined) {
          continuation.push(output);
        }
      }
      const input = [...continuationInput, ...continuation];
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(TIMEOUT);
        }, timeoutMs);
      });
      let rawResponse: unknown;
      try {
        rawResponse = await Promise.race([
          client.responses.create(
            {
              model: config.model,
              instructions: instructions(request),
              input,
              tools: request.tools,
              parallel_tool_calls: false,
              store: false,
            },
            { signal: controller.signal, timeout: timeoutMs },
          ),
          timedOut,
        ]);
      } catch (error) {
        throw error instanceof OpenAiDmError
          ? error
          : classifyProviderError(error);
      } finally {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
      }
      let normalized: ReturnType<typeof normalizeResponse>;
      try {
        normalized = normalizeResponse(rawResponse);
      } catch (error) {
        if (error instanceof OpenAiDmError) {
          throw new OpenAiDmError(
            error.code,
            providerErrorEvidence(rawResponse) ?? error.evidence,
          );
        }
        throw error;
      }
      continuation.push(...normalized.output);
      return normalized.result;
    },
  };
}
