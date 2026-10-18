/**
 * The OpenAI models the AI DM may use (#510): a fixed list, offered by the
 * Settings page and checked wherever a model is chosen. The default is the
 * one the DM evaluations and every tool use unless asked otherwise. It has no
 * imports, so the game's settings can name the models without loading the
 * OpenAI client.
 */
export const OPENAI_DM_DEFAULT_MODEL = "gpt-6-luna";

export const OPENAI_DM_MODELS = [OPENAI_DM_DEFAULT_MODEL] as const;

export type OpenAiDmModelId = (typeof OPENAI_DM_MODELS)[number];
