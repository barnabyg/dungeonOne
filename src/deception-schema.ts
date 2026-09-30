import type { Schema } from "./adventure-schema.js";
import { DAY_SCHEMA } from "./day-schema.js";

const base = DAY_SCHEMA as unknown as Schema;
const id = base.properties!.locations!.items!.properties!.id!;
const prose = base.properties!.title!;

/** Executable schema is exported verbatim as schema/adventure-v8.schema.json. */
export const DECEPTION_SCHEMA = {
  ...base,
  title: "Dungeon One opposed deception adventure v8",
  properties: {
    ...base.properties,
    schemaVersion: { type: "integer", const: 8 },
    rulesVersion: { type: "string", const: "chapel-clues-rules-v9" },
    deceptionProfiles: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "allyId",
          "claimId",
          "claimText",
          "responseTopicId",
          "playerModifier",
          "defenderModifier",
          "timeCost",
          "when",
          "successText",
          "failureText",
          "acceptedReply",
          "rejectedReply",
        ],
        properties: {
          id,
          allyId: id,
          claimId: id,
          claimAliases: base.properties!.locations!.items!.properties!.aliases!,
          claimText: prose,
          responseTopicId: id,
          playerModifier: { type: "integer", minimum: -10, maximum: 10 },
          defenderModifier: { type: "integer", minimum: -10, maximum: 10 },
          timeCost: { type: "integer", minimum: 0, maximum: 7 },
          when: base.properties!.npcs!.items!.properties!.when!,
          successText: prose,
          failureText: prose,
          acceptedReply: prose,
          rejectedReply: prose,
        },
      },
    },
  },
} as const;
