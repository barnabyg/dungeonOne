import type { Schema } from "./adventure-schema.js";
import { BRACE_SCHEMA } from "./brace-schema.js";

const base = BRACE_SCHEMA as unknown as Schema;

/** Recovery is a fixed, once-per-session resource at a visible feature. */
export const RECOVERY_SCHEMA = {
  ...base,
  title: "Dungeon One bounded recovery adventure v13",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 13 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v14" },
    recovery: {
      type: "object",
      additionalProperties: false,
      required: ["featureId", "milestoneId", "hp", "timeCost"],
      properties: {
        featureId: { type: "string", minLength: 1 },
        milestoneId: { type: "string", minLength: 1 },
        hp: { type: "integer", minimum: 1, maximum: 20 },
        timeCost: { type: "integer", const: 0 },
      },
    },
  },
} as const;
