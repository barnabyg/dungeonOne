import type { Schema } from "./adventure-schema.js";
import { ADJUDICATION_SCHEMA } from "./adjudication-schema.js";

const base = ADJUDICATION_SCHEMA as unknown as Schema;
const id = base.properties!.locations!.items!.properties!.id!;
const clockCollection = base.properties!.clocks!;
const clock = clockCollection.items!;
const thresholdCollection = clock.properties!.thresholds!;
const threshold = thresholdCollection.items!;
const effectCollection = threshold.properties!.effects!;
const effect = effectCollection.items!;

/** Executable schema is exported verbatim as schema/adventure-v7.schema.json. */
export const DAY_SCHEMA = {
  ...base,
  title: "Dungeon One day-clock adventure v7",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 7 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v8" },
    features: {
      ...base.properties!.features!,
      items: {
        ...base.properties!.features!.items!,
        properties: {
          ...base.properties!.features!.items!.properties,
          capability: { type: "string", enum: ["brace", "noise"] },
        },
      },
    },
    distractionProfiles: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "guardId",
          "resourceId",
          "connectionId",
          "clockId",
          "expiresAt",
          "timeCost",
          "modifier",
          "dc",
          "successText",
          "failureText",
          "activeText",
          "expiredText",
        ],
        properties: {
          id,
          guardId: id,
          resourceId: id,
          connectionId: id,
          clockId: id,
          expiresAt: { type: "integer", minimum: 1, maximum: 100 },
          timeCost: { type: "integer", minimum: 0, maximum: 7 },
          modifier: { type: "integer", minimum: -10, maximum: 10 },
          dc: { type: "integer", minimum: 1, maximum: 30 },
          successText: base.properties!.title!,
          failureText: base.properties!.title!,
          activeText: base.properties!.title!,
          expiredText: base.properties!.title!,
        },
      },
    },
    clocks: {
      ...clockCollection,
      minItems: 1,
      maxItems: 1,
      items: {
        ...clock,
        required: [...clock.required!, "unit"],
        properties: {
          ...clock.properties,
          unit: { type: "string", const: "day" },
          thresholds: {
            ...thresholdCollection,
            items: {
              ...threshold,
              required: [...threshold.required!, "visibleFrom"],
              properties: {
                ...threshold.properties,
                visibleFrom: {
                  type: "array",
                  minItems: 1,
                  maxItems: 16,
                  items: id,
                },
                effects: {
                  ...effectCollection,
                  items: {
                    ...effect,
                    properties: {
                      ...effect.properties,
                      type: {
                        type: "string",
                        enum: ["record-milestone", "relocate-npc"],
                      },
                      fromLocationId: id,
                      toLocationId: id,
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
} as const;
