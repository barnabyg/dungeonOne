/**
 * A model asked one question that must be answered with one JSON object of a
 * given shape. The question is put as a single strict function tool the model
 * has to call, so the provider holds the answer to the schema.
 *
 * It knows nothing of the game: the blind player (blind-play-5e.ts) builds
 * its questions and reads the answers.
 */
import OpenAI from "openai";

export const OPENAI_STRUCTURED_DEFAULT_TIMEOUT_MS = 120_000;

export type StructuredRequest = Readonly<{
  /** What the model is and how it should answer. */
  instructions: string;
  /** What it is shown this time. */
  input: string;
  /** The answer's name and purpose, as the model's one tool. */
  name: string;
  description: string;
  /** The answer's JSON schema: an object, every property required. */
  schema: Readonly<Record<string, unknown>>;
}>;

export type StructuredUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
}>;

export type StructuredAnswer = Readonly<{
  /** The parsed JSON object, not yet checked against the schema. */
  value: unknown;
  usage?: StructuredUsage;
}>;

export type StructuredModel = Readonly<{
  identity?: Readonly<{ provider: string; model: string }>;
  ask(request: StructuredRequest): Promise<StructuredAnswer>;
}>;

type ResponsesClient = Readonly<{
  responses: Readonly<{
    create(body: Record<string, unknown>): Promise<unknown>;
  }>;
}>;

export type OpenAiStructuredModelConfig = Readonly<{
  apiKey: string;
  model: string;
  /** Sent as `reasoning.effort`; left out, the model uses its own. */
  reasoningEffort?: string;
  timeoutMs?: number;
  client?: ResponsesClient;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function usageOf(
  response: Record<string, unknown>,
): StructuredUsage | undefined {
  const usage = response.usage;
  return isRecord(usage) &&
    typeof usage.input_tokens === "number" &&
    typeof usage.output_tokens === "number"
    ? { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens }
    : undefined;
}

export function createOpenAiStructuredModel(
  config: OpenAiStructuredModelConfig,
): StructuredModel {
  const timeoutMs = config.timeoutMs ?? OPENAI_STRUCTURED_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("OpenAI timeout must be a positive finite number.");
  }
  const client =
    config.client ??
    (new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 2,
      timeout: timeoutMs,
    }) as unknown as ResponsesClient);
  return {
    identity: { provider: "openai", model: config.model },
    async ask(request): Promise<StructuredAnswer> {
      const response = await client.responses.create({
        model: config.model,
        ...(config.reasoningEffort === undefined
          ? {}
          : { reasoning: { effort: config.reasoningEffort } }),
        instructions: request.instructions,
        input: [{ role: "user", content: request.input }],
        tools: [
          {
            type: "function",
            name: request.name,
            description: request.description,
            strict: true,
            parameters: request.schema,
          },
        ],
        tool_choice: { type: "function", name: request.name },
        parallel_tool_calls: false,
        store: false,
      });
      if (!isRecord(response) || !Array.isArray(response.output)) {
        throw new Error("The model's response had no output.");
      }
      const call = response.output.find(
        (item): item is Record<string, unknown> =>
          isRecord(item) &&
          item.type === "function_call" &&
          item.name === request.name &&
          typeof item.arguments === "string",
      );
      if (call === undefined) {
        throw new Error(`The model did not answer with ${request.name}.`);
      }
      let value: unknown;
      try {
        value = JSON.parse(call.arguments as string);
      } catch {
        throw new Error(`The model's ${request.name} was not JSON.`);
      }
      const usage = usageOf(response);
      return { value, ...(usage === undefined ? {} : { usage }) };
    },
  };
}
