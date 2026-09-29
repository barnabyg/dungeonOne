import type { Schema } from "./adventure-schema.js";
import { RELATIONSHIP_SCHEMA } from "./relationship-schema.js";

function extendConditions(schema: Schema): Schema {
  const properties = schema.properties;
  const vocabulary = properties?.type?.enum;
  const condition = vocabulary?.includes("relationship-tier") === true;
  return {
    ...schema,
    ...(schema.items === undefined
      ? {}
      : { items: extendConditions(schema.items) }),
    ...(properties === undefined
      ? {}
      : {
          properties: {
            ...Object.fromEntries(
              Object.entries(properties).map(([key, value]) => [
                key,
                extendConditions(value),
              ]),
            ),
            ...(condition
              ? {
                  at: { type: "integer", minimum: 1, maximum: 100 } as Schema,
                  type: {
                    ...properties.type!,
                    enum: [...vocabulary!, "clock-before"],
                  },
                }
              : {}),
          },
        }),
  };
}
const base = extendConditions(RELATIONSHIP_SCHEMA as unknown as Schema);
const id = base.properties!.locations!.items!.properties!.id!;
const prose = base.properties!.title!;
const cost: Schema = { type: "integer", minimum: 0, maximum: 5 };
const costs = ["move", "search", "talk", "take", "use", "attack"];

/** Executable schema is exported verbatim as schema/adventure-v5.schema.json. */
export const CLOCK_SCHEMA = {
  ...base,
  title: "Dungeon One deadline adventure v5",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 5 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v6" },
    timeCosts: {
      type: "object",
      additionalProperties: false,
      required: costs,
      properties: Object.fromEntries(costs.map((name) => [name, cost])),
    },
    clocks: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "initial", "maximum", "thresholds"],
        properties: {
          id,
          name: prose,
          initial: { type: "integer", minimum: 0, maximum: 100 },
          maximum: { type: "integer", minimum: 1, maximum: 100 },
          thresholds: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["at", "text", "effects"],
              properties: {
                at: { type: "integer", minimum: 1, maximum: 100 },
                text: prose,
                effects: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "id"],
                    properties: {
                      type: {
                        type: "string",
                        enum: ["record-milestone", "grant-discovery"],
                      },
                      id,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  required: [...base.required!, "timeCosts", "clocks"],
} as const;
