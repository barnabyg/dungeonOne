import type { Schema } from "./adventure-schema.js";
import { CLOCK_SCHEMA } from "./clock-schema.js";

const base = CLOCK_SCHEMA as unknown as Schema;
const id = base.properties!.locations!.items!.properties!.id!;
const prose = base.properties!.title!;
const capability = (value: string): Schema => ({
  type: "string",
  const: value,
});
const extendEntity = (
  name: "connections" | "features",
  value: string,
): Schema => {
  const collection = base.properties![name]!;
  const item = collection.items!;
  return {
    ...collection,
    items: {
      ...item,
      properties: {
        ...item.properties,
        capability: capability(value),
      },
    },
  };
};

/** Executable schema is exported verbatim as schema/adventure-v6.schema.json. */
export const ADJUDICATION_SCHEMA = {
  ...base,
  title: "Dungeon One adjudication adventure v6",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 6 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v7" },
    connections: extendEntity("connections", "passage"),
    features: extendEntity("features", "brace"),
    adjudicationProfiles: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "family",
          "targetId",
          "resourceId",
          "approach",
          "effect",
          "successText",
          "blockedText",
        ],
        properties: {
          id,
          family: { type: "string", const: "barricade" },
          targetId: id,
          targetAliases: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 64 },
          },
          resourceId: id,
          approach: { type: "string", const: "brace" },
          effect: {
            type: "object",
            additionalProperties: false,
            required: ["type", "connectionIds"],
            properties: {
              type: { type: "string", const: "block-connections" },
              connectionIds: {
                type: "array",
                minItems: 1,
                maxItems: 4,
                items: id,
              },
            },
          },
          successText: prose,
          blockedText: prose,
        },
      },
    },
  },
  required: [...base.required!, "adjudicationProfiles"],
} as const;
