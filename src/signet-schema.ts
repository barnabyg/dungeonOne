import type { Schema } from "./adventure-schema.js";

const id: Schema = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
};
const prose: Schema = { type: "string", minLength: 1, maxLength: 4096 };
const alias: Schema = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern:
    "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?: [a-z][a-z0-9]*(?:-[a-z0-9]+)*){0,7}$",
};
const aliases: Schema = {
  type: "array",
  minItems: 1,
  maxItems: 32,
  items: alias,
};
const integer = (minimum: number, maximum: number): Schema => ({
  type: "integer",
  minimum,
  maximum,
});
const object = (properties: Record<string, Schema>): Schema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items: Schema, minItems = 0): Schema => ({
  type: "array",
  items,
  minItems,
  maxItems: 256,
});
const named = { id, name: prose, description: prose, aliases };
const damage = object({
  dice: integer(1, 20),
  sides: integer(2, 100),
  modifier: integer(-20, 100),
});

export const SIGNET_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Dungeon One combat adventure v2",
  ...object({
    schemaVersion: { type: "integer", const: 2 },
    id,
    contentVersion: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9][a-z0-9.-]*$",
    },
    rulesVersion: { type: "string", const: "signet-rules-v1" },
    title: prose,
    introduction: prose,
    objective: prose,
    player: object({
      locationId: id,
      hp: integer(1, 10000),
      maxHp: integer(1, 10000),
      armorClass: integer(1, 100),
      attackBonus: integer(-20, 100),
      initiativeBonus: integer(-20, 100),
      weaponId: id,
    }),
    locations: array(object(named), 1),
    connections: array(object({ id, from: id, to: id })),
    features: array(object({ ...named, locationId: id })),
    doors: array(
      object({
        ...named,
        from: id,
        to: id,
        open: { type: "integer", minimum: 0, maximum: 1 },
      }),
    ),
    equipment: array(object({ ...named, damage }), 1),
    monsterDefinitions: array(
      object({
        ...named,
        maxHp: integer(1, 10000),
        armorClass: integer(1, 100),
        attackBonus: integer(-20, 100),
        initiativeBonus: integer(-20, 100),
        attackName: prose,
        damage,
      }),
    ),
    monsters: array(
      object({ id, definitionId: id, locationId: id, hp: integer(0, 10000) }),
    ),
    items: array(object({ ...named, locationId: id, featureId: id })),
    exit: object({ locationId: id, requiredItemId: id, name: prose, aliases }),
  }),
} as const;
