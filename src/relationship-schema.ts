import type { Schema } from "./adventure-schema.js";
import { CHAPEL_CLUES_SCHEMA } from "./chapel-clues-schema.js";

const id = CHAPEL_CLUES_SCHEMA.properties!.locations!.items!.properties!
  .id as Schema;
const prose = CHAPEL_CLUES_SCHEMA.properties!.title as Schema;
const tier: Schema = {
  type: "string",
  enum: ["hostile", "neutral", "trusted"],
};

function extend(schema: Schema): Schema {
  const properties = schema.properties;
  const vocabulary = properties?.type?.enum;
  const condition = vocabulary?.includes("actor-alive") === true;
  const effect = vocabulary?.includes("relocate-npc") === true;
  return {
    ...schema,
    ...(schema.items === undefined ? {} : { items: extend(schema.items) }),
    ...(properties === undefined
      ? {}
      : {
          properties: {
            ...Object.fromEntries(
              Object.entries(properties).map(([key, value]) => [
                key,
                extend(value),
              ]),
            ),
            ...(condition || effect ? { tier } : {}),
            ...(effect ? { reason: prose } : {}),
            ...(condition || effect
              ? {
                  type: {
                    ...properties.type!,
                    enum: [
                      ...vocabulary!,
                      condition ? "relationship-tier" : "set-relationship",
                    ],
                  },
                }
              : {}),
          },
        }),
  };
}

const base = extend(CHAPEL_CLUES_SCHEMA as unknown as Schema);
export const RELATIONSHIP_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Dungeon One relationship adventure v4",
  ...base,
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 4 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v5" },
    relationships: {
      type: "array",
      maxItems: 256,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["targetId", "tier", "reason"],
        properties: { targetId: id, tier, reason: prose },
      },
    },
  },
} as const;
