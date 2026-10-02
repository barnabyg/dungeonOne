import { CONFRONTATION_SCHEMA } from "./confrontation-schema.js";

/** Finale content retains the released confrontation schema contract. */
export const FINALE_SCHEMA = {
  ...CONFRONTATION_SCHEMA,
  title: "Dungeon One finale adventure v16",
  properties: {
    ...CONFRONTATION_SCHEMA.properties,
    schemaVersion: { type: "integer", const: 16 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v17" },
  },
} as const;
