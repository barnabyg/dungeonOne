import { ADVENTURE_SCHEMA, type Schema } from "./adventure-schema.js";

const base = ADVENTURE_SCHEMA.properties!;
const id = base.locations!.items!.properties!.id as Schema;
const prose = base.title as Schema;
const aliases = base.locations!.items!.properties!.aliases as Schema;
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
const reply = object({
  when: list(condition),
  outcome: {
    type: "string",
    enum: ["any", "unattempted", "success", "failure"],
  },
  approach: {
    type: "string",
    enum: ["any", "ask", "persuade", "deceive", "intimidate"],
  },
  text: prose,
  attitude: prose,
  approvedFactIds: list(id),
  effects: list(effect),
});
const discovery = object({
  id,
  title: prose,
  classification: {
    type: "string",
    enum: ["observation", "testimony", "belief"],
  },
  sourceFeatureId: id,
  sourceNpcId: id,
  summary: prose,
  lead: prose,
});
const optionalSourceDiscovery: Schema = {
  ...discovery,
  required: ["id", "title", "classification", "summary", "lead"],
};
const combatStats = object({
  armorClass: { type: "integer", minimum: 1, maximum: 40 },
  attackBonus: { type: "integer", minimum: -20, maximum: 20 },
  initiativeBonus: { type: "integer", minimum: -20, maximum: 20 },
  damage: object({
    dice: { type: "integer", minimum: 1, maximum: 20 },
    sides: { type: "integer", minimum: 2, maximum: 100 },
    modifier: { type: "integer", minimum: -20, maximum: 20 },
  }),
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
    discoveries: list(optionalSourceDiscovery),
    searches: list(
      object({
        id,
        targetId: id,
        when: list(condition),
        effects: list(effect),
        text: prose,
      }),
    ),
    facts: list(object({ id, statement: prose })),
    npcs: list({
      ...object({
        id,
        name: prose,
        aliases,
        locationId: id,
        when: list(condition),
        voice: prose,
        knows: list(id),
        believes: list(id),
        wants: list(prose),
        knowledgeLimits: list(prose),
        topics: list(
          object({
            id,
            name: prose,
            aliases,
            when: list(condition),
            challengeId: id,
            replies: list(reply),
          }),
        ),
      }),
      required: [
        "id",
        "name",
        "aliases",
        "locationId",
        "voice",
        "knows",
        "believes",
        "wants",
        "knowledgeLimits",
        "topics",
      ],
    }),
    socialChallenges: list(
      object({
        id,
        modifier: { type: "integer", minimum: -20, maximum: 20 },
        dc: { type: "integer", minimum: 1, maximum: 40 },
        guardedFactIds: list(id),
        guardedDiscoveryIds: list(id),
        guardedMilestoneIds: list(id),
        evidenceWhen: list(condition),
      }),
    ),
    combatProfile: combatStats,
    monsterDefinitions: list(
      object({
        ...base.locations!.items!.properties!,
        maxHp: { type: "integer", minimum: 1, maximum: 10000 },
        stats: combatStats,
      }),
    ),
    monsters: list(
      object({
        id,
        definitionId: id,
        locationId: id,
        hp: { type: "integer", minimum: 1, maximum: 10000 },
      }),
    ),
    encounters: list(
      object({
        id,
        monsterId: id,
        when: list(condition),
        effects: list(effect),
      }),
    ),
  }),
  required: Object.keys(base).concat(["quest", "discoveries", "searches"]),
} as const;
