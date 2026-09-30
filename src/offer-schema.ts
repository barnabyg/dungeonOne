import type { Schema } from "./adventure-schema.js";
import { DECEPTION_SCHEMA } from "./deception-schema.js";

const base = DECEPTION_SCHEMA as unknown as Schema;
const id = base.properties!.locations!.items!.properties!.id!;
const prose = base.properties!.title!;

/** Executable schema is exported verbatim as schema/adventure-v9.schema.json. */
export const OFFER_SCHEMA = {
  ...base,
  title: "Dungeon One item offer adventure v9",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 9 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v10" },
    offerProfiles: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "npcId",
          "itemId",
          "outcome",
          "itemCost",
          "timeCost",
          "when",
          "responseText",
        ],
        properties: {
          id,
          npcId: id,
          itemId: id,
          outcome: { type: "string", enum: ["accepted", "refused"] },
          itemCost: { type: "string", enum: ["consumed", "retained"] },
          timeCost: { type: "integer", minimum: 0, maximum: 7 },
          when: base.properties!.npcs!.items!.properties!.when!,
          responseText: prose,
          relationship: {
            type: "object",
            additionalProperties: false,
            required: ["tier", "reason"],
            properties: {
              tier: { type: "string", enum: ["hostile", "neutral", "trusted"] },
              reason: prose,
            },
          },
        },
      },
    },
  },
} as const;
