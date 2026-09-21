export type Schema = Readonly<{
  type: "object" | "array" | "string" | "integer";
  const?: string | number;
  properties?: Readonly<Record<string, Schema>>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}>;
const id: Schema = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
};
const prose: Schema = { type: "string", minLength: 1, maxLength: 4096 };
const aliases: Schema = {
  type: "array",
  minItems: 1,
  maxItems: 256,
  items: {
    type: "string",
    minLength: 1,
    maxLength: 128,
    pattern:
      "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?: [a-z][a-z0-9]*(?:-[a-z0-9]+)*){0,7}$",
  },
};
const hp: Schema = { type: "integer", minimum: 0, maximum: 10000 };
const object = (properties: Readonly<Record<string, Schema>>): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const entities = (items: Schema, minItems = 0): Schema => ({
  type: "array",
  minItems,
  maxItems: 256,
  items,
});
const named = { id, name: prose, description: prose, aliases };

/** This executable schema is also exported verbatim as schema/adventure-v1.schema.json. */
export const ADVENTURE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "Dungeon One exploration adventure v1",
  ...object({
    schemaVersion: { type: "integer", const: 1 },
    id,
    contentVersion: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9][a-z0-9.-]*$",
    },
    rulesVersion: { type: "string", const: "exploration-rules-v1" },
    title: prose,
    introduction: prose,
    objective: prose,
    player: object({ locationId: id, hp, maxHp: { ...hp, minimum: 1 } }),
    locations: entities(object(named), 1),
    connections: entities(object({ id, from: id, to: id })),
    features: entities(object({ ...named, locationId: id })),
  }),
} as const;
