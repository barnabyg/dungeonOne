import { QUEST_ITEM_SCHEMA } from "./quest-item-schema.js";

/** Public stakes may describe ordinary confrontation subjects as well as claims. */
export const CONFRONTATION_SCHEMA = {
  ...QUEST_ITEM_SCHEMA,
  title: "Dungeon One confrontation adventure v15",
  properties: {
    ...QUEST_ITEM_SCHEMA.properties,
    schemaVersion: { type: "integer", const: 15 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v16" },
  },
} as const;
