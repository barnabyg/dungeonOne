/**
 * The OpenAI models the AI DM may use: the default the DM evaluations and
 * every tool use unless asked otherwise, how a model id must look, which of
 * OpenAI's listed models the Settings page offers (#587), and the reasoning
 * efforts it offers. It has no imports, so the game's settings can name the
 * models without loading the OpenAI client.
 */
export const OPENAI_DM_DEFAULT_MODEL = "gpt-6-luna";

/** The reasoning efforts the Settings page offers, lowest first (#587). */
export const OPENAI_DM_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type OpenAiReasoningEffort =
  (typeof OPENAI_DM_REASONING_EFFORTS)[number];

/** Whether `value` looks like an OpenAI model id (#587). */
export function isOpenAiModelId(value: unknown): value is string {
  return (
    typeof value === "string" && /^[a-z0-9][a-z0-9._:-]{0,99}$/u.test(value)
  );
}

// Name parts that mark a model the DM can't use or shouldn't offer: not text
// chat, a specialist (search, code), very slow (pro) or an alias.
const EXCLUDED_PARTS = new Set([
  "audio",
  "chat",
  "codex",
  "computer",
  "embedding",
  "image",
  "instruct",
  "latest",
  "live",
  "moderation",
  "preview",
  "pro",
  "realtime",
  "research",
  "search",
  "transcribe",
  "translate",
  "tts",
  "whisper",
]);

/**
 * The family version a DM model's id names, or undefined when the DM
 * doesn't offer it: GPT 5 and later and the o series take a reasoning
 * effort, so every offered model has a thinking level.
 */
function dmModelVersion(id: string): number | undefined {
  const parts = id.split("-");
  if (parts.some((part) => EXCLUDED_PARTS.has(part))) {
    return undefined;
  }
  // A dated snapshot (gpt-5-2025-08-07) repeats its alias.
  if (/-\d{4}-\d{2}-\d{2}$/u.test(id)) {
    return undefined;
  }
  const gpt = /^gpt-(\d+(?:\.\d+)?)(?:-[a-z0-9.]+)*$/u.exec(id);
  if (gpt !== null) {
    const version = Number(gpt[1]);
    return version >= 5 ? version : undefined;
  }
  // The o series sorts after every GPT family.
  return /^o\d+(?:-mini)?$/u.test(id) ? 0 : undefined;
}

/**
 * The models from OpenAI's model list the Settings page offers the DM
 * (#587): newest family first, then by name.
 */
export function dmModelChoices(ids: readonly string[]): string[] {
  const offered = new Map<string, number>();
  for (const id of ids) {
    const version = isOpenAiModelId(id) ? dmModelVersion(id) : undefined;
    if (version !== undefined) {
      offered.set(id, version);
    }
  }
  return [...offered.keys()].sort(
    (a, b) =>
      (offered.get(b) ?? 0) - (offered.get(a) ?? 0) ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
}
