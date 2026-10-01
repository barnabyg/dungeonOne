import type { Schema } from "./adventure-schema.js";
import { CLAIM_SCHEMA } from "./claim-schema.js";

const base = CLAIM_SCHEMA as unknown as Schema;

/** A one-use combat action; released claim/travel schemas remain unchanged. */
export const BRACE_SCHEMA = {
  ...base,
  title: "Dungeon One combat cover adventure v12",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 12 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v13" },
    combatBrace: {
      type: "object",
      additionalProperties: false,
      required: ["featureId", "monsterId", "armorClassBonus"],
      properties: {
        featureId: { type: "string", minLength: 1 },
        monsterId: { type: "string", minLength: 1 },
        armorClassBonus: { type: "integer", const: 4 },
      },
    },
  },
} as const;
