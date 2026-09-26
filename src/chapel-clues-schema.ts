import { ADVENTURE_SCHEMA, type Schema } from "./adventure-schema.js";

const base = ADVENTURE_SCHEMA.properties!;
const id = base.locations!.items!.properties!.id as Schema;
const prose = base.title as Schema;
const condition: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id"],
  properties: {
    type: { type: "string", enum: ["discovery-known", "milestone-recorded"] },
    id,
  },
};
const effect: Schema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "id"],
  properties: {
    type: { type: "string", enum: ["grant-discovery", "record-milestone"] },
    id,
  },
};
const list = (items: Schema): Schema => ({
  type: "array",
  items,
  maxItems: 256,
});
const object = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const CHAPEL_CLUES_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Dungeon One chapel clues adventure v3",
  ...object({
    ...base,
    schemaVersion: { type: "integer", const: 3 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v1" },
    connections: list(object({ id, from: id, to: id, when: list(condition) })),
    features: list(
      object({ ...base.features!.items!.properties!, when: list(condition) }),
    ),
    quest: object({ id, title: prose, milestones: list(id) }),
    discoveries: list(
      object({
        id,
        title: prose,
        classification: {
          type: "string",
          enum: ["observation", "testimony", "belief"],
        },
        sourceFeatureId: id,
        summary: prose,
        lead: prose,
      }),
    ),
    searches: list(
      object({
        id,
        targetId: id,
        when: list(condition),
        effects: list(effect),
        text: prose,
      }),
    ),
  }),
} as const;
