// A small, strict subset of schema 3 for the first generation slice. The
// adventure loader remains the authority for references and game rules.
const string = { type: "string" };
const integer = { type: "integer" };
const list = (items: unknown, minItems = 0) => ({
  type: "array",
  items,
  minItems,
});
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const condition = object({
  type: { type: "string", enum: ["discovery-known", "milestone-recorded"] },
  id: string,
});
const effect = object({
  type: { type: "string", enum: ["grant-discovery", "record-milestone"] },
  id: string,
});
const located = {
  id: string,
  name: string,
  description: string,
  aliases: list(string, 1),
};
const conditionalText = object({ when: list(condition), text: string });

export const GENERATION_OUTPUT_FORMAT = {
  type: "json_schema",
  name: "tiny_adventure",
  strict: true,
  schema: object({
    schemaVersion: { type: "integer", enum: [3] },
    id: string,
    contentVersion: string,
    rulesVersion: { type: "string", enum: ["chapel-clues-rules-v4"] },
    title: string,
    introduction: string,
    objective: string,
    player: object({ locationId: string, hp: integer, maxHp: integer }),
    locations: list(object(located), 2),
    connections: list(
      object({ id: string, from: string, to: string, when: list(condition) }),
      2,
    ),
    features: list(
      object({ ...located, locationId: string, when: list(condition) }),
      2,
    ),
    quest: object({ id: string, title: string, milestones: list(string, 1) }),
    discoveries: list(
      object({
        id: string,
        title: string,
        classification: { type: "string", enum: ["observation"] },
        sourceFeatureId: string,
        summary: string,
        lead: string,
      }),
      2,
    ),
    searches: list(
      object({
        id: string,
        targetId: string,
        when: list(condition),
        effects: list(effect, 1),
        text: string,
      }),
      2,
    ),
    endings: object({
      locationId: string,
      when: list(condition),
      any: list(list(condition, 1), 1),
      fates: list(
        object({ id: string, when: list(condition), text: string }),
        1,
      ),
      choices: list(
        object({
          id: string,
          label: string,
          aliases: list(string, 1),
          when: list(condition),
          consequences: list(
            object({ id: string, when: list(condition), text: string }),
            1,
          ),
          narration: list(conditionalText, 1),
        }),
        2,
      ),
    }),
  }),
} as const;
