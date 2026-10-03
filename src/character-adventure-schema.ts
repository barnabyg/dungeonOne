import { FINALE_SCHEMA } from "./finale-schema.js";

const id = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[a-z][a-z0-9-]*$",
} as const;
const ability = {
  type: "string",
  enum: [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ],
} as const;
const trigger = {
  type: "string",
  enum: [
    "completion",
    "milestone",
    "discovery",
    "actor-defeated",
    "check-success",
  ],
} as const;
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const CHARACTER_ADVENTURE_SCHEMA = {
  ...FINALE_SCHEMA,
  title: "Dungeon One character adventure v17",
  required: [...FINALE_SCHEMA.required, "characterAdventure"],
  properties: {
    ...FINALE_SCHEMA.properties,
    schemaVersion: { type: "integer", const: 17 },
    rulesVersion: {
      type: "string",
      enum: ["character-adventure-rules-v1", "character-adventure-rules-v2"],
    },
    characterAdventure: object({
      rulesVersion: { type: "string", const: "fighter-rules-v1" },
      classes: {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: { type: "string", const: "Fighter" },
      },
      playerCount: { type: "integer", const: 1 },
      recommendedLevels: object({
        minimum: { type: "integer", minimum: 1, maximum: 3 },
        maximum: { type: "integer", minimum: 1, maximum: 3 },
      }),
      socialAbilities: {
        type: "array",
        maxItems: 256,
        items: object({ challengeId: id, ability }),
      },
      checks: {
        type: "array",
        maxItems: 256,
        items: object({
          id,
          featureId: id,
          ability,
          dc: { type: "integer", minimum: 2, maximum: 25 },
          successText: { type: "string", minLength: 1, maxLength: 4096 },
          failureText: { type: "string", minLength: 1, maxLength: 4096 },
        }),
      },
      rewards: {
        type: "array",
        minItems: 1,
        maxItems: 256,
        items: object({
          id,
          xp: { type: "integer", minimum: 1, maximum: 100000 },
          trigger,
          targetId: { type: "string", maxLength: 128 },
        }),
      },
    }),
  },
} as const;
/**
 * Schema 18 (character adventure rules v3, #119) adds treasure: silver and
 * carried items the engine awards on the same triggers as XP rewards.
 */
export const CHARACTER_TREASURE_SCHEMA = {
  ...CHARACTER_ADVENTURE_SCHEMA,
  title: "Dungeon One character adventure v18",
  properties: {
    ...CHARACTER_ADVENTURE_SCHEMA.properties,
    schemaVersion: { type: "integer", const: 18 },
    rulesVersion: { type: "string", enum: ["character-adventure-rules-v3"] },
    characterAdventure: object({
      ...CHARACTER_ADVENTURE_SCHEMA.properties.characterAdventure.properties,
      treasure: {
        type: "array",
        maxItems: 256,
        items: object({
          id,
          trigger,
          targetId: { type: "string", maxLength: 128 },
          silver: { type: "integer", minimum: 0, maximum: 10000 },
          items: {
            type: "array",
            maxItems: 4,
            items: { type: "string", enum: ["healing-draught"] },
          },
        }),
      },
    }),
  },
} as const;
