// A small, strict subset of schema 3 for the first generation slice. The
// adventure loader remains the authority for references and game rules.
const string = { type: "string" };
const id = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
};
const alias = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern:
    "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?: [a-z][a-z0-9]*(?:-[a-z0-9]+)*){0,7}$",
};
const integer = { type: "integer" };
const list = (items: unknown, minItems = 0) => ({
  type: "array",
  items,
  minItems,
});
const emptyList = (items: unknown) => ({ type: "array", items, maxItems: 0 });
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const condition = object({
  type: { type: "string", enum: ["discovery-known", "milestone-recorded"] },
  id,
});
const effect = object({
  type: { type: "string", enum: ["grant-discovery", "record-milestone"] },
  id,
});
const located = {
  id,
  name: string,
  description: string,
  aliases: list(alias, 1),
};
const conditionalText = object({ when: list(condition), text: string });

export const GENERATION_OUTPUT_FORMAT = {
  type: "json_schema",
  name: "tiny_adventure",
  strict: true,
  schema: object({
    schemaVersion: { type: "integer", enum: [3] },
    id,
    contentVersion: string,
    rulesVersion: { type: "string", enum: ["chapel-clues-rules-v4"] },
    title: string,
    introduction: string,
    objective: string,
    player: object({ locationId: id, hp: integer, maxHp: integer }),
    initialDiscoveries: list(id, 1),
    locations: list(object(located), 3),
    connections: list(
      object({ id, from: id, to: id, when: list(condition) }),
      2,
    ),
    features: list(
      object({ ...located, locationId: id, when: list(condition) }),
      2,
    ),
    quest: object({ id, title: string, milestones: list(id, 1) }),
    discoveries: list(
      object({
        id,
        title: string,
        classification: { type: "string", enum: ["observation"] },
        sourceFeatureId: id,
        summary: string,
        lead: string,
      }),
      2,
    ),
    searches: list(
      object({
        id,
        targetId: id,
        when: list(condition),
        effects: list(effect, 1),
        text: string,
      }),
      2,
    ),
    facts: list(object({ id, statement: string }), 1),
    socialChallenges: list(
      object({
        id,
        modifier: integer,
        dc: integer,
        guardedFactIds: list(id, 1),
        guardedDiscoveryIds: list(id),
        guardedMilestoneIds: list(id),
        evidenceWhen: list(condition, 1),
      }),
      1,
    ),
    npcs: list(
      object({
        id,
        name: string,
        aliases: list(alias, 1),
        locationId: id,
        voice: string,
        knows: list(id),
        believes: emptyList(id),
        wants: list(string),
        knowledgeLimits: list(string),
        topics: list(
          object({
            id,
            name: string,
            aliases: list(alias, 1),
            when: list(condition),
            challengeId: id,
            replies: list(
              object({
                when: list(condition),
                outcome: {
                  type: "string",
                  enum: ["any", "unattempted", "success", "failure"],
                },
                approach: { type: "string", enum: ["any", "ask"] },
                text: string,
                attitude: string,
                approvedFactIds: list(id),
                effects: emptyList(effect),
              }),
            ),
          }),
        ),
      }),
      3,
    ),
    combatProfile: object({
      armorClass: integer,
      attackBonus: integer,
      initiativeBonus: integer,
      damage: object({ dice: integer, sides: integer, modifier: integer }),
    }),
    monsterDefinitions: list(
      object({
        ...located,
        maxHp: integer,
        stats: object({
          armorClass: integer,
          attackBonus: integer,
          initiativeBonus: integer,
          damage: object({ dice: integer, sides: integer, modifier: integer }),
        }),
      }),
      1,
    ),
    monsters: list(
      object({
        id,
        definitionId: id,
        locationId: id,
        hp: integer,
      }),
      1,
    ),
    encounters: list(
      object({
        id,
        monsterId: id,
        when: list(condition),
        effects: emptyList(effect),
      }),
      1,
    ),
    endings: object({
      locationId: id,
      when: list(condition),
      any: list(list(condition, 1), 1),
      fates: list(object({ id, when: list(condition), text: string }), 1),
      choices: list(
        object({
          id,
          label: string,
          aliases: list(alias, 1),
          when: list(condition),
          consequences: list(
            object({ id, when: list(condition), text: string }),
            1,
          ),
          narration: list(conditionalText, 1),
        }),
        2,
      ),
    }),
  }),
} as const;
