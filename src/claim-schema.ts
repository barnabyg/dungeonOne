import type { Schema } from "./adventure-schema.js";
import { TRAVEL_SCHEMA } from "./travel-schema.js";

const base = TRAVEL_SCHEMA as unknown as Schema;
const npcs = base.properties!.npcs!;
const npc = npcs.items!;
const topics = npc.properties!.topics!;
const topic = topics.items!;

/** Versioned public social intents; earlier schemas retain their talk contract. */
export const CLAIM_SCHEMA = {
  ...base,
  title: "Dungeon One ally claim adventure v11",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 11 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v12" },
    npcs: {
      ...npcs,
      items: {
        ...npc,
        properties: {
          ...npc.properties,
          topics: {
            ...topics,
            items: {
              ...topic,
              properties: {
                ...topic.properties,
                intent: { type: "string", enum: ["claim", "correction"] },
                stakes: base.properties!.title!,
              },
            },
          },
        },
      },
    },
  },
} as const;
