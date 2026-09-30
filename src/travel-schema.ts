import type { Schema } from "./adventure-schema.js";
import { OFFER_SCHEMA } from "./offer-schema.js";

const base = OFFER_SCHEMA as unknown as Schema;
const connections = base.properties!.connections!;
const connection = connections.items!;

/** Executable schema is exported verbatim as schema/adventure-v10.schema.json. */
export const TRAVEL_SCHEMA = {
  ...base,
  title: "Dungeon One route travel adventure v10",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 10 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v11" },
    adjudicationProfiles: {
      ...base.properties!.adjudicationProfiles!,
      minItems: 0,
    },
    connections: {
      ...connections,
      items: {
        ...connection,
        required: [...connection.required!, "travelDays"],
        properties: {
          ...connection.properties,
          travelDays: { type: "integer", minimum: 0, maximum: 7 },
        },
      },
    },
    timeCosts: {
      ...base.properties!.timeCosts!,
      properties: Object.fromEntries(
        Object.keys(base.properties!.timeCosts!.properties!).map((key) => [
          key,
          { type: "integer" as const, const: 0 },
        ]),
      ),
    },
  },
} as const;
