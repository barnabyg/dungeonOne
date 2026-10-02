import { createHash } from "node:crypto";
import { JsonInputError, parseBoundedJson, pointer } from "./bounded-json.js";
import { ADVENTURE_SCHEMA, type Schema } from "./adventure-schema.js";
import { SIGNET_SCHEMA } from "./signet-schema.js";
import { CHAPEL_CLUES_SCHEMA } from "./chapel-clues-schema.js";
import { RELATIONSHIP_SCHEMA } from "./relationship-schema.js";
import { CLOCK_SCHEMA } from "./clock-schema.js";
import { ADJUDICATION_SCHEMA } from "./adjudication-schema.js";
import { DAY_SCHEMA } from "./day-schema.js";
import { DECEPTION_SCHEMA } from "./deception-schema.js";
import { OFFER_SCHEMA } from "./offer-schema.js";
import { CONFRONTATION_SCHEMA } from "./confrontation-schema.js";
import { QUEST_ITEM_SCHEMA } from "./quest-item-schema.js";
import { RECOVERY_SCHEMA } from "./recovery-schema.js";
import { BRACE_SCHEMA } from "./brace-schema.js";
import { CLAIM_SCHEMA } from "./claim-schema.js";
import { TRAVEL_SCHEMA } from "./travel-schema.js";
import { analyzeProgression } from "./progression-analysis.js";

export const EXPLORATION_RULES_VERSION = "exploration-rules-v1";
export const ADVENTURE_BYTE_LIMIT = 1024 * 1024;

export type LocationDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  aliases: readonly string[];
}>;
export type FeatureDefinition = LocationDefinition &
  Readonly<{ locationId: string }>;
export type ConnectionDefinition = Readonly<{
  id: string;
  from: string;
  to: string;
}>;
export type SignetDefinition = Readonly<{
  schemaVersion: 2;
  id: string;
  contentVersion: string;
  rulesVersion: "signet-rules-v1";
  title: string;
  introduction: string;
  objective: string;
  player: Readonly<{
    locationId: string;
    hp: number;
    maxHp: number;
    armorClass: number;
    attackBonus: number;
    initiativeBonus: number;
    weaponId: string;
  }>;
  locations: readonly LocationDefinition[];
  connections: readonly ConnectionDefinition[];
  features: readonly FeatureDefinition[];
  doors: readonly (LocationDefinition &
    Readonly<{ from: string; to: string; open: 0 | 1 }>)[];
  equipment: readonly (LocationDefinition &
    Readonly<{
      damage: Readonly<{ dice: number; sides: number; modifier: number }>;
    }>)[];
  monsterDefinitions: readonly (LocationDefinition &
    Readonly<{
      maxHp: number;
      armorClass: number;
      attackBonus: number;
      initiativeBonus: number;
      attackName: string;
      damage: Readonly<{ dice: number; sides: number; modifier: number }>;
    }>)[];
  monsters: readonly Readonly<{
    id: string;
    definitionId: string;
    locationId: string;
    hp: number;
  }>[];
  items: readonly (LocationDefinition &
    Readonly<{ locationId: string; featureId: string }>)[];
  exit: Readonly<{
    locationId: string;
    requiredItemId: string;
    name: string;
    aliases: readonly string[];
  }>;
}>;
export type ExplorationDefinition = Readonly<{
  schemaVersion: 1;
  id: string;
  contentVersion: string;
  rulesVersion: typeof EXPLORATION_RULES_VERSION;
  title: string;
  introduction: string;
  objective: string;
  player: Readonly<{ locationId: string; hp: number; maxHp: number }>;
  locations: readonly LocationDefinition[];
  connections: readonly ConnectionDefinition[];
  features: readonly FeatureDefinition[];
}>;
export type ClueCondition = Readonly<{
  type:
    | "discovery-known"
    | "milestone-recorded"
    | "actor-dead"
    | "actor-alive"
    | "actor-dead-at"
    | "clock-before"
    | "relationship-tier";
  id: string;
  locationId?: string;
  tier?: RelationshipTier;
  at?: number;
}>;
export type RelationshipTier = "hostile" | "neutral" | "trusted";
export type Relationship = Readonly<{ tier: RelationshipTier; reason: string }>;
export type ClueEffect = Readonly<{
  type:
    | "grant-discovery"
    | "record-milestone"
    | "relocate-npc"
    | "set-relationship";
  id: string;
  toLocationId?: string;
  tier?: RelationshipTier;
  reason?: string;
}>;
export type ConditionalClueText = Readonly<{
  when: readonly ClueCondition[];
  text: string;
}>;
export type DialogueFact = Readonly<{
  id: string;
  statement: string;
}>;
export type DialogueReply = Readonly<{
  when: readonly ClueCondition[];
  outcome: "any" | "unattempted" | "success" | "failure";
  approach: "any" | "ask" | "persuade" | "deceive" | "intimidate";
  text: string;
  attitude: string;
  approvedFactIds: readonly string[];
  effects: readonly ClueEffect[];
}>;
export type DialogueTopic = Readonly<{
  id: string;
  name: string;
  aliases: readonly string[];
  when: readonly ClueCondition[];
  challengeId: string;
  intent?: "claim" | "correction";
  stakes?: string;
  replies: readonly DialogueReply[];
}>;
export type DialogueNpc = Readonly<{
  id: string;
  name: string;
  aliases: readonly string[];
  locationId: string;
  when?: readonly ClueCondition[];
  voice: string;
  knows: readonly string[];
  believes: readonly string[];
  wants: readonly string[];
  knowledgeLimits: readonly string[];
  topics: readonly DialogueTopic[];
  combat?: Readonly<{ hp: number; maxHp: number; stats: CombatStats }>;
  remains?: Readonly<{
    description: string;
    search?: Readonly<{ text: string; effects: readonly ClueEffect[] }>;
  }>;
}>;
export type ChapelCluesDefinition = Readonly<{
  schemaVersion: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
  id: string;
  contentVersion: string;
  rulesVersion:
    | "chapel-clues-rules-v1"
    | "chapel-clues-rules-v2"
    | "chapel-clues-rules-v3"
    | "chapel-clues-rules-v4"
    | "chapel-clues-rules-v5"
    | "chapel-clues-rules-v6"
    | "chapel-clues-rules-v7"
    | "chapel-clues-rules-v8"
    | "chapel-clues-rules-v9"
    | "chapel-clues-rules-v10"
    | "chapel-clues-rules-v11"
    | "chapel-clues-rules-v12"
    | "chapel-clues-rules-v13"
    | "chapel-clues-rules-v14"
    | "chapel-clues-rules-v15"
    | "chapel-clues-rules-v16";
  title: string;
  introduction: string;
  objective: string;
  player: Readonly<{ locationId: string; hp: number; maxHp: number }>;
  initialDiscoveries?: readonly string[];
  initialMilestones?: readonly string[];
  relationships?: readonly Readonly<{
    targetId: string;
    tier: RelationshipTier;
    reason: string;
  }>[];
  clocks?: readonly Readonly<{
    id: string;
    name: string;
    unit?: "day";
    initial: number;
    maximum: number;
    thresholds: readonly Readonly<{
      at: number;
      text: string;
      visibleFrom?: readonly string[];
      effects: readonly Readonly<{
        type: "record-milestone" | "grant-discovery" | "relocate-npc";
        id: string;
        fromLocationId?: string;
        toLocationId?: string;
      }>[];
    }>[];
  }>[];
  timeCosts?: Readonly<{
    move: number;
    search: number;
    talk: number;
    take: number;
    use: number;
    attack: number;
  }>;
  adjudicationProfiles?: readonly Readonly<{
    id: string;
    family: "barricade";
    targetId: string;
    targetAliases?: readonly string[];
    resourceId: string;
    approach: "brace";
    effect: Readonly<{
      type: "block-connections";
      connectionIds: readonly string[];
    }>;
    successText: string;
    blockedText: string;
  }>[];
  distractionProfiles?: readonly Readonly<{
    id: string;
    guardId: string;
    resourceId: string;
    connectionId: string;
    clockId: string;
    expiresAt: number;
    timeCost: number;
    modifier: number;
    dc: number;
    successText: string;
    failureText: string;
    activeText: string;
    expiredText: string;
  }>[];
  deceptionProfiles?: readonly Readonly<{
    id: string;
    allyId: string;
    claimId: string;
    claimAliases?: readonly string[];
    claimText: string;
    responseTopicId: string;
    playerModifier: number;
    defenderModifier: number;
    timeCost: number;
    when: readonly ClueCondition[];
    successText: string;
    failureText: string;
    acceptedReply: string;
    rejectedReply: string;
  }>[];
  offerProfiles?: readonly Readonly<{
    id: string;
    npcId: string;
    itemId: string;
    outcome: "accepted" | "refused";
    itemCost: "consumed" | "retained";
    timeCost: number;
    when: readonly ClueCondition[];
    responseText: string;
    costText?: string;
    relationship?: Readonly<{ tier: Relationship["tier"]; reason: string }>;
  }>[];
  locations: readonly (LocationDefinition &
    Readonly<{ descriptions?: readonly ConditionalClueText[] }>)[];
  connections: readonly (ConnectionDefinition &
    Readonly<{
      when: readonly ClueCondition[];
      capability?: "passage";
      travelDays?: number;
    }>)[];
  features: readonly (FeatureDefinition &
    Readonly<{
      when: readonly ClueCondition[];
      capability?: "brace" | "noise";
      descriptions?: readonly ConditionalClueText[];
    }>)[];
  quest: Readonly<{ id: string; title: string; milestones: readonly string[] }>;
  endings?: Readonly<{
    locationId: string;
    when: readonly ClueCondition[];
    any: readonly (readonly ClueCondition[])[];
    fates: readonly Readonly<{
      id: string;
      when: readonly ClueCondition[];
      text: string;
    }>[];
    choices: readonly Readonly<{
      id: string;
      label: string;
      aliases: readonly string[];
      when: readonly ClueCondition[];
      consequences: readonly Readonly<{
        id: string;
        when: readonly ClueCondition[];
        text: string;
      }>[];
      narration: readonly ConditionalClueText[];
    }>[];
  }>;
  discoveries: readonly Readonly<{
    id: string;
    title: string;
    classification: "observation" | "testimony" | "belief";
    sourceFeatureId?: string;
    sourceNpcId?: string;
    summary: string;
    lead: string;
    leads?: readonly ConditionalClueText[];
  }>[];
  searches: readonly Readonly<{
    id: string;
    targetId: string;
    when: readonly ClueCondition[];
    effects: readonly ClueEffect[];
    text: string;
  }>[];
  facts?: readonly DialogueFact[];
  npcs?: readonly DialogueNpc[];
  socialChallenges?: readonly Readonly<{
    id: string;
    modifier: number;
    dc: number;
    guardedFactIds: readonly string[];
    guardedDiscoveryIds: readonly string[];
    guardedMilestoneIds: readonly string[];
    evidenceWhen: readonly ClueCondition[];
    evidenceAlternatives?: readonly (readonly ClueCondition[])[];
  }>[];
  questItem?: Readonly<{
    itemId: string;
    featureId: string;
    milestoneId: string;
    discoveryId: string;
    timeCost: 0;
  }>;
  recovery?: Readonly<{
    featureId: string;
    milestoneId: string;
    hp: number;
    timeCost: 0;
  }>;
  combatBrace?: Readonly<{
    featureId: string;
    monsterId: string;
    armorClassBonus: number;
  }>;
  combatProfile?: CombatStats;
  monsterDefinitions?: readonly (LocationDefinition &
    Readonly<{ maxHp: number; stats: CombatStats }>)[];
  monsters?: readonly Readonly<{
    id: string;
    definitionId: string;
    locationId: string;
    hp: number;
  }>[];
  encounters?: readonly Readonly<{
    id: string;
    monsterId: string;
    when: readonly ClueCondition[];
    effects: readonly ClueEffect[];
  }>[];
  items?: readonly (LocationDefinition &
    Readonly<{
      locationId: string;
      featureId: string;
      healing?: Readonly<{
        dice: number;
        sides: number;
        modifier: number;
        target: "fighter";
      }>;
    }>)[];
}>;
export type CombatStats = Readonly<{
  armorClass: number;
  attackBonus: number;
  initiativeBonus: number;
  damage: Readonly<{ dice: number; sides: number; modifier: number }>;
}>;
export type AdventureDefinition =
  ExplorationDefinition | SignetDefinition | ChapelCluesDefinition;
export type AdventureDiagnostic = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  entity: string | null;
  message: string;
}>;
const compareDiagnostics = (a: AdventureDiagnostic, b: AdventureDiagnostic) =>
  a.path < b.path
    ? -1
    : a.path > b.path
      ? 1
      : a.code < b.code
        ? -1
        : a.code > b.code
          ? 1
          : 0;
export type ValidatedAdventure = Readonly<{
  snapshot: AdventureDefinition;
  canonicalJson: string;
  digest: string;
  indexes: Readonly<{
    locations: Readonly<Record<string, LocationDefinition>>;
    features: Readonly<Record<string, FeatureDefinition>>;
    connections: Readonly<Record<string, ConnectionDefinition>>;
    doors?: Readonly<Record<string, SignetDefinition["doors"][number]>>;
    equipment?: Readonly<Record<string, SignetDefinition["equipment"][number]>>;
    monsterDefinitions?: Readonly<
      Record<string, SignetDefinition["monsterDefinitions"][number]>
    >;
    monsters?: Readonly<Record<string, SignetDefinition["monsters"][number]>>;
    items?: Readonly<Record<string, SignetDefinition["items"][number]>>;
  }>;
}>;

export function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", " ").replace(/\s+/g, " ");
}

function validateStructure(
  value: unknown,
  schema: Schema,
  path: string,
  diagnostics: AdventureDiagnostic[],
  entity: string | null = null,
): void {
  const error = (code: string, message: string, at = path) =>
    diagnostics.push({ severity: "error", code, path: at, entity, message });
  if (schema.const !== undefined && value !== schema.const) {
    error("unsupported-version", "Unsupported version.");
    return;
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      error("invalid-type", "Expected an object.");
      return;
    }
    const record = value as Record<string, unknown>;
    entity =
      typeof record.id === "string"
        ? record.id
        : path === "/player"
          ? "player"
          : entity;
    for (const key of Object.keys(record).sort()) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) {
        error("unknown-field", "Unknown field.", pointer(path, key));
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (!Object.hasOwn(record, key)) {
        if (!schema.required?.includes(key)) {
          continue;
        }
        error(
          "missing-field",
          "Required field is missing.",
          pointer(path, key),
        );
      } else {
        validateStructure(
          record[key],
          child,
          pointer(path, key),
          diagnostics,
          entity,
        );
      }
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) {
      error("invalid-type", "Expected an array.");
      return;
    }
    if (
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? 256)
    ) {
      error("collection-limit", "Collection is outside supported limits.");
      return;
    }
    if (schema.items !== undefined) {
      value.forEach((child, index) =>
        validateStructure(
          child,
          schema.items as Schema,
          pointer(path, index),
          diagnostics,
          entity,
        ),
      );
    }
  } else if (schema.type === "integer") {
    if (!Number.isSafeInteger(value)) {
      error("invalid-integer", "Expected a safe integer.");
    } else if (
      Number(value) < (schema.minimum ?? -Number.MAX_SAFE_INTEGER) ||
      Number(value) > (schema.maximum ?? Number.MAX_SAFE_INTEGER)
    ) {
      error("numeric-limit", "Number is outside supported limits.");
    }
  } else {
    if (typeof value !== "string") {
      error("invalid-type", "Expected a string.");
      return;
    }
    if (
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? 4096)
    ) {
      error("string-limit", "String is outside supported limits.");
    }
    if (
      schema.pattern !== undefined &&
      !new RegExp(schema.pattern).test(value)
    ) {
      error(
        path.includes("/aliases/") ? "invalid-alias" : "invalid-id",
        "String does not match the supported grammar.",
      );
    }
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      error("unsupported-value", "Value is outside the supported vocabulary.");
    }
    if (/[{}]/.test(value)) {
      error(
        "unsupported-placeholder",
        "Exploration prose is literal; placeholders are not supported.",
      );
    }
    if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(value)) {
      error("invalid-string", "Control characters are not supported.");
    }
  }
}

type DiagnosticError = (
  code: string,
  path: string,
  entity: string,
  message: string,
) => void;

function validateUniqueIds(
  groups: readonly Readonly<{
    namespace: string;
    entries: readonly Readonly<{ id: string }>[];
  }>[],
  error: DiagnosticError,
  message: string,
): void {
  for (const { namespace, entries } of groups) {
    const seen = new Set<string>();
    entries.forEach(({ id }, index) => {
      if (seen.has(id)) {
        error("duplicate-id", `/${namespace}/${index}/id`, id, message);
      }
      seen.add(id);
    });
  }
}

type GraphDefinition = Readonly<{
  locations: readonly LocationDefinition[];
  connections: readonly ConnectionDefinition[];
  features: readonly FeatureDefinition[];
  player: Readonly<{ locationId: string }>;
}>;

function validateLocationGraph(
  snapshot: GraphDefinition,
  error: DiagnosticError,
  messages: Readonly<{
    reference: (id: string) => string;
    connection: string;
    unreachable: string;
  }>,
): Set<string> {
  const locations = new Set(snapshot.locations.map(({ id }) => id));
  const reference = (id: string, path: string, entity: string) => {
    if (!locations.has(id)) {
      error("unknown-reference", path, entity, messages.reference(id));
    }
  };
  reference(snapshot.player.locationId, "/player/locationId", "player");
  snapshot.features.forEach((feature, index) =>
    reference(feature.locationId, `/features/${index}/locationId`, feature.id),
  );
  const routes = new Set<string>();
  snapshot.connections.forEach((connection, index) => {
    reference(connection.from, `/connections/${index}/from`, connection.id);
    reference(connection.to, `/connections/${index}/to`, connection.id);
    const route = `${connection.from}/${connection.to}`;
    if (routes.has(route) || connection.from === connection.to) {
      error(
        "invalid-connection",
        `/connections/${index}`,
        connection.id,
        messages.connection,
      );
    }
    routes.add(route);
  });
  const reachable = new Set([snapshot.player.locationId]);
  for (let pass = 0; pass < snapshot.locations.length; pass++) {
    for (const connection of snapshot.connections) {
      if (reachable.has(connection.from)) {
        reachable.add(connection.to);
      }
    }
  }
  snapshot.locations.forEach((location, index) => {
    if (!reachable.has(location.id)) {
      error(
        "unreachable-location",
        `/locations/${index}`,
        location.id,
        messages.unreachable,
      );
    }
  });
  return routes;
}

function validateVisibleAliases(
  visible: readonly Readonly<{
    entry: Readonly<{ id: string; aliases: readonly string[] }>;
    identity: string;
    path: string;
  }>[],
  error: DiagnosticError,
  message: (alias: string) => string,
  precisePath: boolean,
): void {
  const aliases = new Map<string, string>();
  for (const { entry, identity, path } of visible) {
    [entry.id, ...entry.aliases].forEach((alias, index) => {
      const normalized = normalizeAlias(alias);
      if (aliases.has(normalized) && aliases.get(normalized) !== identity) {
        error(
          "ambiguous-alias",
          precisePath
            ? index === 0
              ? `${path}/id`
              : `${path}/aliases/${index - 1}`
            : path,
          entry.id,
          message(alias),
        );
      }
      aliases.set(normalized, identity);
    });
  }
}

function validateReferences(
  snapshot: ExplorationDefinition,
  diagnostics: AdventureDiagnostic[],
): void {
  const error = (code: string, path: string, entity: string, message: string) =>
    diagnostics.push({ severity: "error", code, path, entity, message });
  validateUniqueIds(
    [
      { namespace: "locations", entries: snapshot.locations },
      { namespace: "connections", entries: snapshot.connections },
      { namespace: "features", entries: snapshot.features },
    ],
    error,
    "Duplicate entity ID in namespace.",
  );
  if (snapshot.player.hp === 0 || snapshot.player.hp > snapshot.player.maxHp) {
    error(
      "invalid-placement",
      "/player/hp",
      "player",
      "The initial player must be alive and HP cannot exceed maxHp.",
    );
  }
  const routes = validateLocationGraph(snapshot, error, {
    reference: () => "Expected a location reference.",
    connection:
      "Connections must be distinct directed routes to another location.",
    unreachable: "Location is not reachable from the initial placement.",
  });
  // Inspection sees local features and outgoing destinations in the same namespace.
  // IDs are implicit aliases, too; two aliases of one entity are harmless.
  for (const location of snapshot.locations) {
    const visible = [
      ...snapshot.locations.flatMap((entry, index) =>
        routes.has(`${location.id}/${entry.id}`)
          ? [
              {
                entry,
                path: `/locations/${index}`,
                identity: `location/${entry.id}`,
              },
            ]
          : [],
      ),
      ...snapshot.features.flatMap((entry, index) =>
        entry.locationId === location.id
          ? [
              {
                entry,
                path: `/features/${index}`,
                identity: `feature/${entry.id}`,
              },
            ]
          : [],
      ),
    ];
    validateVisibleAliases(
      visible,
      error,
      () => "Alias overlaps another visible reference.",
      true,
    );
  }
}

function validateSignetReferences(
  snapshot: SignetDefinition,
  diagnostics: AdventureDiagnostic[],
): void {
  const error = (code: string, path: string, entity: string, message: string) =>
    diagnostics.push({ severity: "error", code, path, entity, message });
  const namespaces = [
    "locations",
    "connections",
    "features",
    "doors",
    "equipment",
    "monsterDefinitions",
    "monsters",
    "items",
  ] as const;
  validateUniqueIds(
    namespaces.map((namespace) => ({
      namespace,
      entries: snapshot[namespace],
    })),
    error,
    "Duplicate entity ID.",
  );
  const ids = (namespace: (typeof namespaces)[number]) =>
    new Set(snapshot[namespace].map(({ id }) => id));
  const features = ids("features"),
    equipment = ids("equipment"),
    definitions = ids("monsterDefinitions"),
    items = ids("items");
  const ref = (
    set: Set<string>,
    value: string,
    path: string,
    entity: string,
  ) => {
    if (!set.has(value)) {
      error("unknown-reference", path, entity, `Unknown reference: ${value}.`);
    }
  };
  ref(equipment, snapshot.player.weaponId, "/player/weaponId", "player");
  if (snapshot.player.hp > snapshot.player.maxHp) {
    error(
      "invalid-placement",
      "/player/hp",
      "player",
      "HP exceeds maximum HP.",
    );
  }
  const routes = validateLocationGraph(snapshot, error, {
    reference: (id) => `Unknown reference: ${id}.`,
    connection: "Duplicate or self connection.",
    unreachable: "Location is unreachable.",
  });
  const locations = ids("locations");
  snapshot.doors.forEach((entry, i) => {
    ref(locations, entry.from, `/doors/${i}/from`, entry.id);
    ref(locations, entry.to, `/doors/${i}/to`, entry.id);
    if (
      !routes.has(`${entry.from}/${entry.to}`) ||
      !routes.has(`${entry.to}/${entry.from}`)
    ) {
      error(
        "invalid-door",
        `/doors/${i}`,
        entry.id,
        "A door requires connections in both directions.",
      );
    }
    if (
      snapshot.doors.findIndex(
        (other) =>
          other !== entry &&
          ((other.from === entry.from && other.to === entry.to) ||
            (other.from === entry.to && other.to === entry.from)),
      ) >= 0
    ) {
      error(
        "invalid-door",
        `/doors/${i}`,
        entry.id,
        "Only one door may control a location pair.",
      );
    }
  });
  snapshot.monsters.forEach((entry, i) => {
    ref(
      definitions,
      entry.definitionId,
      `/monsters/${i}/definitionId`,
      entry.id,
    );
    ref(locations, entry.locationId, `/monsters/${i}/locationId`, entry.id);
    const maximum = snapshot.monsterDefinitions.find(
      (definition) => definition.id === entry.definitionId,
    )?.maxHp;
    if (maximum !== undefined && entry.hp > maximum) {
      error(
        "invalid-placement",
        `/monsters/${i}/hp`,
        entry.id,
        "HP exceeds maximum HP.",
      );
    }
    if (
      entry.hp > 0 &&
      snapshot.monsters.some(
        (other) =>
          other !== entry &&
          other.locationId === entry.locationId &&
          other.hp > 0,
      )
    ) {
      error(
        "unsupported-encounter",
        `/monsters/${i}`,
        entry.id,
        "Only one living monster may occupy a location.",
      );
    }
  });
  snapshot.items.forEach((entry, i) => {
    ref(locations, entry.locationId, `/items/${i}/locationId`, entry.id);
    ref(features, entry.featureId, `/items/${i}/featureId`, entry.id);
    if (
      snapshot.features.find((feature) => feature.id === entry.featureId)
        ?.locationId !== entry.locationId
    ) {
      error(
        "invalid-placement",
        `/items/${i}/featureId`,
        entry.id,
        "The feature must be in the item's location.",
      );
    }
  });
  ref(locations, snapshot.exit.locationId, "/exit/locationId", "exit");
  ref(items, snapshot.exit.requiredItemId, "/exit/requiredItemId", "exit");
  const visible = (locationId: string, path: string) => [
    ...snapshot.features
      .filter((entry) => entry.locationId === locationId)
      .map((entry) => ({
        entry,
        identity: `feature/${entry.id}`,
        path,
      })),
    ...snapshot.items
      .filter((entry) => entry.locationId === locationId)
      .map((entry) => ({
        entry,
        identity: `item/${entry.id}`,
        path,
      })),
    ...snapshot.doors
      .filter((entry) => entry.from === locationId || entry.to === locationId)
      .map((entry) => ({
        entry,
        identity: `door/${entry.id}`,
        path,
      })),
    ...snapshot.monsters
      .filter((entry) => entry.locationId === locationId)
      .flatMap((instance) => {
        const entry = snapshot.monsterDefinitions.find(
          (definition) => definition.id === instance.definitionId,
        );
        return entry === undefined
          ? []
          : [
              {
                entry: {
                  id: instance.id,
                  aliases: [entry.id, ...entry.aliases],
                },
                identity: `monster/${instance.id}`,
                path,
              },
            ];
      }),
    ...snapshot.locations
      .filter((entry) => routes.has(`${locationId}/${entry.id}`))
      .map((entry) => ({
        entry,
        identity: `location/${entry.id}`,
        path,
      })),
  ];
  snapshot.locations.forEach((location, index) => {
    validateVisibleAliases(
      visible(location.id, `/locations/${index}`),
      error,
      (alias) => `Ambiguous visible alias: ${alias}.`,
      false,
    );
  });
}

function validateClueReferences(
  snapshot: ChapelCluesDefinition,
  diagnostics: AdventureDiagnostic[],
): void {
  const error: DiagnosticError = (code, path, entity, message) =>
    diagnostics.push({ severity: "error", code, path, entity, message });
  if (
    ![
      "chapel-clues-rules-v3",
      "chapel-clues-rules-v4",
      "chapel-clues-rules-v5",
      "chapel-clues-rules-v6",
      "chapel-clues-rules-v7",
      "chapel-clues-rules-v8",
      "chapel-clues-rules-v9",
      "chapel-clues-rules-v10",
      "chapel-clues-rules-v11",
      "chapel-clues-rules-v12",
      "chapel-clues-rules-v13",
      "chapel-clues-rules-v14",
      "chapel-clues-rules-v15",
      "chapel-clues-rules-v16",
    ].includes(snapshot.rulesVersion) &&
    (snapshot.npcs ?? []).some(
      (npc) => npc.combat !== undefined || npc.remains !== undefined,
    )
  ) {
    error(
      "unsupported-rules",
      "/rulesVersion",
      snapshot.id,
      "Actor casualties require chapel-clues-rules-v3.",
    );
  }
  if (
    snapshot.endings !== undefined &&
    ![
      "chapel-clues-rules-v4",
      "chapel-clues-rules-v5",
      "chapel-clues-rules-v6",
      "chapel-clues-rules-v7",
      "chapel-clues-rules-v8",
      "chapel-clues-rules-v9",
      "chapel-clues-rules-v10",
      "chapel-clues-rules-v11",
      "chapel-clues-rules-v12",
      "chapel-clues-rules-v13",
      "chapel-clues-rules-v14",
      "chapel-clues-rules-v15",
      "chapel-clues-rules-v16",
    ].includes(snapshot.rulesVersion)
  ) {
    error(
      "unsupported-rules",
      "/endings",
      snapshot.id,
      "Data-authored endings require chapel-clues-rules-v4.",
    );
  }
  if (
    snapshot.rulesVersion === "chapel-clues-rules-v4" &&
    snapshot.endings === undefined
  ) {
    error(
      "missing-endings",
      "/endings",
      snapshot.id,
      "Rules v4 require endings.",
    );
  }
  if (
    snapshot.rulesVersion === "chapel-clues-rules-v1" &&
    (snapshot.locations.some((entry) => entry.descriptions !== undefined) ||
      snapshot.features.some((entry) => entry.descriptions !== undefined) ||
      snapshot.discoveries.some((entry) => entry.leads !== undefined) ||
      (snapshot.socialChallenges ?? []).some(
        (entry) => entry.evidenceAlternatives !== undefined,
      ) ||
      (snapshot.npcs ?? []).some((npc) =>
        npc.topics.some((topic) =>
          topic.replies.some((reply) =>
            reply.effects.some((effect) => effect.type === "relocate-npc"),
          ),
        ),
      ))
  ) {
    error(
      "unsupported-rules",
      "/rulesVersion",
      snapshot.id,
      "State-conditioned guidance and relocation require chapel-clues-rules-v2.",
    );
  }
  validateUniqueIds(
    [
      { namespace: "locations", entries: snapshot.locations },
      { namespace: "connections", entries: snapshot.connections },
      {
        namespace: "adjudicationProfiles",
        entries: snapshot.adjudicationProfiles ?? [],
      },
      {
        namespace: "distractionProfiles",
        entries: snapshot.distractionProfiles ?? [],
      },
      {
        namespace: "deceptionProfiles",
        entries: snapshot.deceptionProfiles ?? [],
      },
      { namespace: "offerProfiles", entries: snapshot.offerProfiles ?? [] },
      { namespace: "features", entries: snapshot.features },
      { namespace: "discoveries", entries: snapshot.discoveries },
      { namespace: "searches", entries: snapshot.searches },
      { namespace: "facts", entries: snapshot.facts ?? [] },
      { namespace: "npcs", entries: snapshot.npcs ?? [] },
      {
        namespace: "socialChallenges",
        entries: snapshot.socialChallenges ?? [],
      },
      {
        namespace: "monsterDefinitions",
        entries: snapshot.monsterDefinitions ?? [],
      },
      { namespace: "monsters", entries: snapshot.monsters ?? [] },
      { namespace: "encounters", entries: snapshot.encounters ?? [] },
      { namespace: "items", entries: snapshot.items ?? [] },
    ],
    error,
    "Duplicate entity ID.",
  );
  const features = new Set(snapshot.features.map(({ id }) => id));
  const locations = new Set(snapshot.locations.map(({ id }) => id));
  const discoveries = new Set(snapshot.discoveries.map(({ id }) => id));
  const milestones = new Set(snapshot.quest.milestones);
  const facts = new Set((snapshot.facts ?? []).map(({ id }) => id));
  const npcs = new Set((snapshot.npcs ?? []).map(({ id }) => id));
  const relationshipTargets = new Set<string>();
  (snapshot.relationships ?? []).forEach((entry, i) => {
    if (!npcs.has(entry.targetId)) {
      error(
        "unknown-reference",
        `/relationships/${i}/targetId`,
        entry.targetId,
        "Unknown relationship target.",
      );
    }
    if (relationshipTargets.has(entry.targetId)) {
      error(
        "duplicate-id",
        `/relationships/${i}/targetId`,
        entry.targetId,
        "Duplicate relationship target.",
      );
    }
    relationshipTargets.add(entry.targetId);
  });
  if (
    snapshot.rulesVersion === "chapel-clues-rules-v3" ||
    snapshot.rulesVersion === "chapel-clues-rules-v4" ||
    snapshot.rulesVersion === "chapel-clues-rules-v5" ||
    snapshot.rulesVersion === "chapel-clues-rules-v6" ||
    snapshot.rulesVersion === "chapel-clues-rules-v7" ||
    snapshot.rulesVersion === "chapel-clues-rules-v8" ||
    snapshot.rulesVersion === "chapel-clues-rules-v9" ||
    snapshot.rulesVersion === "chapel-clues-rules-v10" ||
    snapshot.rulesVersion === "chapel-clues-rules-v11" ||
    snapshot.rulesVersion === "chapel-clues-rules-v12" ||
    snapshot.rulesVersion === "chapel-clues-rules-v13" ||
    snapshot.rulesVersion === "chapel-clues-rules-v14" ||
    snapshot.rulesVersion === "chapel-clues-rules-v15" ||
    snapshot.rulesVersion === "chapel-clues-rules-v16"
  ) {
    (snapshot.monsters ?? []).forEach((monster, i) => {
      if (npcs.has(monster.id)) {
        error(
          "duplicate-id",
          `/monsters/${i}/id`,
          monster.id,
          "NPC and monster combatant IDs must differ.",
        );
      }
    });
  }
  const challenges = new Set(
    (snapshot.socialChallenges ?? []).map(({ id }) => id),
  );
  const ref = (set: Set<string>, id: string, path: string, entity: string) => {
    if (!set.has(id)) {
      error("unknown-reference", path, entity, `Unknown reference: ${id}.`);
    }
  };
  const clockIds = new Set<string>();
  (snapshot.clocks ?? []).forEach((clock, i) => {
    const path = `/clocks/${i}`;
    if (clockIds.has(clock.id)) {
      error("duplicate-id", `${path}/id`, clock.id, "Duplicate clock ID.");
    }
    clockIds.add(clock.id);
    if (clock.initial >= clock.maximum) {
      error(
        "invalid-clock",
        `${path}/initial`,
        clock.id,
        "Clock initial value must be below its maximum.",
      );
    }
    let previous = clock.initial;
    clock.thresholds.forEach((threshold, j) => {
      const thresholdPath = `${path}/thresholds/${j}`;
      if (threshold.at <= previous || threshold.at > clock.maximum) {
        error(
          "invalid-clock",
          `${thresholdPath}/at`,
          clock.id,
          "Thresholds must increase strictly from initial value through the maximum.",
        );
      }
      previous = threshold.at;
      if (snapshot.schemaVersion >= 7) {
        const visibleFrom = new Set<string>();
        for (const [index, locationId] of (
          threshold.visibleFrom ?? []
        ).entries()) {
          ref(
            locations,
            locationId,
            `${thresholdPath}/visibleFrom/${index}`,
            clock.id,
          );
          if (visibleFrom.has(locationId)) {
            error(
              "duplicate-id",
              `${thresholdPath}/visibleFrom/${index}`,
              clock.id,
              "Duplicate observer location.",
            );
          }
          visibleFrom.add(locationId);
        }
      }
      threshold.effects.forEach((effect, k) => {
        const effectPath = `${thresholdPath}/effects/${k}`;
        if (effect.type === "relocate-npc") {
          if (snapshot.schemaVersion < 7) {
            error(
              "unsupported-rules",
              effectPath,
              effect.id,
              "Scheduled relocation requires day rules.",
            );
          }
          ref(npcs, effect.id, `${effectPath}/id`, clock.id);
          if (
            effect.fromLocationId === undefined ||
            effect.toLocationId === undefined
          ) {
            error(
              "invalid-clock",
              effectPath,
              effect.id,
              "Scheduled relocation needs both locations.",
            );
          } else {
            ref(
              locations,
              effect.fromLocationId,
              `${effectPath}/fromLocationId`,
              effect.id,
            );
            ref(
              locations,
              effect.toLocationId,
              `${effectPath}/toLocationId`,
              effect.id,
            );
            if (
              !snapshot.connections.some(
                ({ from, to }) =>
                  from === effect.fromLocationId && to === effect.toLocationId,
              )
            ) {
              error(
                "invalid-clock",
                effectPath,
                effect.id,
                "Scheduled relocation must use an authored connection.",
              );
            }
          }
        } else {
          if (
            effect.fromLocationId !== undefined ||
            effect.toLocationId !== undefined
          ) {
            error(
              "invalid-clock",
              effectPath,
              effect.id,
              "Only relocation accepts locations.",
            );
          }
          ref(
            effect.type === "record-milestone" ? milestones : discoveries,
            effect.id,
            `${effectPath}/id`,
            clock.id,
          );
        }
      });
    });
  });
  (snapshot.items ?? []).forEach((item, i) => {
    ref(locations, item.locationId, `/items/${i}/locationId`, item.id);
    ref(features, item.featureId, `/items/${i}/featureId`, item.id);
    const feature = snapshot.features.find(
      (entry) => entry.id === item.featureId,
    );
    if (feature !== undefined && feature.locationId !== item.locationId) {
      error(
        "invalid-placement",
        `/items/${i}/featureId`,
        item.id,
        "Item and feature must share a location.",
      );
    }
  });
  const conditions = (
    list: readonly ClueCondition[],
    path: string,
    entity: string,
  ) => {
    list.forEach((entry, i) => {
      if (entry.type === "clock-before") {
        if (
          entry.at === undefined ||
          entry.at >
            (snapshot.clocks?.find((clock) => clock.id === entry.id)?.maximum ??
              0)
        ) {
          error(
            "invalid-condition",
            `${path}/${i}/at`,
            entity,
            "Clock condition needs a threshold within the clock bounds.",
          );
        }
      } else if (entry.at !== undefined) {
        error(
          "invalid-condition",
          `${path}/${i}/at`,
          entity,
          "Only clock-before accepts a threshold.",
        );
      }
      if (entry.type === "relationship-tier") {
        if (entry.tier === undefined) {
          error(
            "invalid-condition",
            `${path}/${i}/tier`,
            entity,
            "Relationship condition requires a tier.",
          );
        }
      } else if (entry.tier !== undefined) {
        error(
          "invalid-condition",
          `${path}/${i}/tier`,
          entity,
          "Only relationship conditions accept a tier.",
        );
      }
      ref(
        entry.type === "discovery-known"
          ? discoveries
          : entry.type === "clock-before"
            ? clockIds
            : entry.type === "relationship-tier"
              ? relationshipTargets
              : entry.type.startsWith("actor-")
                ? npcs
                : milestones,
        entry.id,
        `${path}/${i}/id`,
        entity,
      );
      if (entry.type.startsWith("actor-")) {
        if (
          snapshot.rulesVersion !== "chapel-clues-rules-v3" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v4" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v5" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v6" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v7" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v8" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v9" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v10" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v11" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v12" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v13" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v14" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v15" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v16"
        ) {
          error(
            "unsupported-rules",
            `${path}/${i}/type`,
            entity,
            "Actor death conditions require chapel-clues-rules-v3.",
          );
        }
        if (
          entry.type !== "actor-dead" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v4" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v5" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v6" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v7" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v8" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v9" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v10" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v11" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v12" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v13" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v14" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v15" &&
          snapshot.rulesVersion !== "chapel-clues-rules-v16"
        ) {
          error(
            "unsupported-rules",
            `${path}/${i}/type`,
            entity,
            "Actor alive/location conditions require rules v4.",
          );
        }
        if (
          (entry.type === "actor-dead-at") !==
          (entry.locationId !== undefined)
        ) {
          error(
            "invalid-condition",
            `${path}/${i}/locationId`,
            entity,
            "Only actor-dead-at requires a location.",
          );
        }
        if (entry.locationId !== undefined) {
          ref(locations, entry.locationId, `${path}/${i}/locationId`, entity);
        }
        if (
          npcs.has(entry.id) &&
          !snapshot.npcs?.find((npc) => npc.id === entry.id)?.combat
        ) {
          error(
            "invalid-condition",
            `${path}/${i}/id`,
            entity,
            "Actor death condition requires a combat profile.",
          );
        }
      }
    });
  };
  const deceptionTargets = new Set<string>();
  const deceptionResponses = new Set<string>();
  (snapshot.deceptionProfiles ?? []).forEach((profile, i) => {
    const path = `/deceptionProfiles/${i}`;
    const ally = snapshot.npcs?.find(({ id }) => id === profile.allyId);
    const topic = ally?.topics.find(({ id }) => id === profile.responseTopicId);
    if (ally === undefined) {
      error(
        "invalid-adjudication",
        `${path}/allyId`,
        profile.id,
        "Unknown ally.",
      );
    }
    if (topic === undefined || topic.challengeId !== "none") {
      error(
        "invalid-adjudication",
        `${path}/responseTopicId`,
        profile.id,
        "Response must name an unchallenged topic on the ally.",
      );
    }
    const key = `${profile.allyId}/${profile.claimId}`;
    if (deceptionTargets.has(key)) {
      error(
        "duplicate-id",
        `${path}/claimId`,
        profile.id,
        "Only one tactic may make this claim to this ally.",
      );
    }
    deceptionTargets.add(key);
    const responseKey = `${profile.allyId}/${profile.responseTopicId}`;
    if (deceptionResponses.has(responseKey)) {
      error(
        "duplicate-id",
        `${path}/responseTopicId`,
        profile.id,
        "Only one tactic may control this ally response.",
      );
    }
    deceptionResponses.add(responseKey);
    conditions(profile.when, `${path}/when`, profile.id);
  });
  const offerTargets = new Set<string>();
  (snapshot.offerProfiles ?? []).forEach((profile, i) => {
    const path = `/offerProfiles/${i}`;
    ref(npcs, profile.npcId, `${path}/npcId`, profile.id);
    ref(
      new Set((snapshot.items ?? []).map(({ id }) => id)),
      profile.itemId,
      `${path}/itemId`,
      profile.id,
    );
    conditions(profile.when, `${path}/when`, profile.id);
    const key = `${profile.npcId}/${profile.itemId}`;
    if (offerTargets.has(key)) {
      error(
        "duplicate-id",
        `${path}/itemId`,
        profile.id,
        "Only one offer profile may pair this NPC and item.",
      );
    }
    offerTargets.add(key);
    if (
      profile.outcome === "accepted" &&
      (profile.relationship === undefined ||
        !relationshipTargets.has(profile.npcId))
    ) {
      error(
        "invalid-adjudication",
        `${path}/relationship`,
        profile.id,
        "An accepted offer must change a defined relationship.",
      );
    }
    if (
      profile.outcome === "accepted" &&
      profile.relationship?.tier ===
        snapshot.relationships?.find(
          ({ targetId }) => targetId === profile.npcId,
        )?.tier
    ) {
      error(
        "invalid-adjudication",
        `${path}/relationship/tier`,
        profile.id,
        "An accepted offer must change the initial relationship tier.",
      );
    }
    if (profile.outcome === "refused" && profile.relationship !== undefined) {
      error(
        "invalid-adjudication",
        `${path}/relationship`,
        profile.id,
        "A refused offer cannot change a relationship.",
      );
    }
    if (
      profile.outcome === "refused" &&
      profile.itemCost === "consumed" &&
      profile.costText === undefined
    ) {
      error(
        "invalid-adjudication",
        `${path}/costText`,
        profile.id,
        "A consumed refused offer requires an authored explanation of the item loss.",
      );
    }
    if (
      profile.costText !== undefined &&
      (profile.outcome !== "refused" || profile.itemCost !== "consumed")
    ) {
      error(
        "invalid-adjudication",
        `${path}/costText`,
        profile.id,
        "Cost text is only used when a refused offer consumes an item.",
      );
    }
  });
  if (snapshot.endings !== undefined) {
    const endings = snapshot.endings;
    ref(locations, endings.locationId, "/endings/locationId", snapshot.id);
    conditions(endings.when, "/endings/when", snapshot.id);
    if (
      endings.any.length === 0 ||
      endings.any.some((route) => route.length === 0)
    ) {
      error(
        "invalid-ending",
        "/endings/any",
        snapshot.id,
        "At least one nonempty fate prerequisite is required.",
      );
    }
    endings.any.forEach((route, i) =>
      conditions(route, `/endings/any/${i}`, snapshot.id),
    );
    if (endings.fates.length === 0 || endings.choices.length < 2) {
      error(
        "invalid-ending",
        "/endings",
        snapshot.id,
        "Endings require a fate and at least two choices.",
      );
    }
    const unique = (values: readonly string[], path: string) => {
      const seen = new Set<string>();
      values.forEach((value, i) => {
        const normalized = normalizeAlias(value);
        if (seen.has(normalized)) {
          error(
            "ambiguous-alias",
            `${path}/${i}`,
            value,
            "Ending labels and aliases must be unique.",
          );
        }
        seen.add(normalized);
      });
    };
    const choiceNames = new Map<string, number>();
    endings.choices.forEach((choice, i) => {
      for (const name of [choice.id, choice.label, ...choice.aliases]) {
        const normalized = normalizeAlias(name);
        const owner = choiceNames.get(normalized);
        if (owner !== undefined && owner !== i) {
          error(
            "ambiguous-alias",
            `/endings/choices/${i}`,
            choice.id,
            "Ending choice IDs, labels and aliases must distinguish choices.",
          );
        }
        choiceNames.set(normalized, i);
      }
      if (endings.choices.findIndex((entry) => entry.id === choice.id) !== i) {
        error(
          "duplicate-id",
          `/endings/choices/${i}/id`,
          choice.id,
          "Duplicate ending choice ID.",
        );
      }
    });
    unique(
      endings.fates.map((fate) => fate.id),
      "/endings/fates",
    );
    endings.fates.forEach((fate, i) =>
      conditions(fate.when, `/endings/fates/${i}/when`, fate.id),
    );
    endings.choices.forEach((choice, i) => {
      conditions(choice.when, `/endings/choices/${i}/when`, choice.id);
      unique(
        choice.consequences.map((entry) => entry.id),
        `/endings/choices/${i}/consequences`,
      );
      choice.consequences.forEach((entry, j) =>
        conditions(
          entry.when,
          `/endings/choices/${i}/consequences/${j}/when`,
          choice.id,
        ),
      );
      if (choice.narration.length === 0) {
        error(
          "invalid-ending",
          `/endings/choices/${i}/narration`,
          choice.id,
          "A choice needs narration.",
        );
      }
      choice.narration.forEach((entry, j) =>
        conditions(
          entry.when,
          `/endings/choices/${i}/narration/${j}/when`,
          choice.id,
        ),
      );
    });
  }
  const effectReference = (
    effect: ClueEffect,
    path: string,
    entity: string,
    allowRelocation: boolean,
  ) => {
    if (effect.type === "set-relationship") {
      if (
        !allowRelocation ||
        effect.tier === undefined ||
        effect.reason === undefined
      ) {
        error(
          "unsupported-effect",
          path,
          entity,
          "Relationship changes require a dialogue tier and reason.",
        );
      }
    } else if (effect.tier !== undefined || effect.reason !== undefined) {
      error(
        "unsupported-effect",
        path,
        entity,
        "Only relationship changes accept a tier and reason.",
      );
    }
    ref(
      effect.type === "grant-discovery"
        ? discoveries
        : effect.type === "record-milestone"
          ? milestones
          : effect.type === "set-relationship"
            ? relationshipTargets
            : npcs,
      effect.id,
      `${path}/id`,
      entity,
    );
    if (effect.type === "relocate-npc") {
      if (!allowRelocation || effect.toLocationId === undefined) {
        error(
          "unsupported-effect",
          path,
          entity,
          "NPC relocation requires a dialogue destination.",
        );
      } else {
        ref(locations, effect.toLocationId, `${path}/toLocationId`, entity);
      }
    } else if (effect.toLocationId !== undefined) {
      error(
        "unsupported-effect",
        path,
        entity,
        "Only NPC relocation accepts a destination.",
      );
    }
  };
  const monsterDefinitions = new Map(
    (snapshot.monsterDefinitions ?? []).map((entry) => [entry.id, entry]),
  );
  const monsters = new Map(
    (snapshot.monsters ?? []).map((entry) => [entry.id, entry]),
  );
  const encounterLocations = new Set<string>();
  if (
    (snapshot.monsters?.length ?? 0) > 0 &&
    snapshot.combatProfile === undefined
  ) {
    error(
      "missing-combat-profile",
      "/combatProfile",
      snapshot.id,
      "Combat encounters require a player combat profile.",
    );
  }
  (snapshot.monsters ?? []).forEach((monster, i) => {
    ref(
      new Set(snapshot.locations.map(({ id }) => id)),
      monster.locationId,
      `/monsters/${i}/locationId`,
      monster.id,
    );
    ref(
      new Set(monsterDefinitions.keys()),
      monster.definitionId,
      `/monsters/${i}/definitionId`,
      monster.id,
    );
    const definition = monsterDefinitions.get(monster.definitionId);
    if (definition !== undefined && monster.hp > definition.maxHp) {
      error(
        "invalid-placement",
        `/monsters/${i}/hp`,
        monster.id,
        "Monster HP exceeds its maximum.",
      );
    }
    if (
      !(snapshot.encounters ?? []).some(
        (entry) => entry.monsterId === monster.id,
      )
    ) {
      error(
        "missing-encounter",
        `/monsters/${i}`,
        monster.id,
        "Placed monster needs an encounter definition.",
      );
    }
  });
  (snapshot.encounters ?? []).forEach((encounter, i) => {
    ref(
      new Set(monsters.keys()),
      encounter.monsterId,
      `/encounters/${i}/monsterId`,
      encounter.id,
    );
    const monster = monsters.get(encounter.monsterId);
    if (monster !== undefined) {
      if (encounterLocations.has(monster.locationId)) {
        error(
          "overlapping-encounters",
          `/encounters/${i}`,
          encounter.id,
          "Only one encounter may occupy a location.",
        );
      }
      encounterLocations.add(monster.locationId);
      if (
        monster.locationId === snapshot.player.locationId &&
        encounter.when.length === 0
      ) {
        error(
          "invalid-placement",
          `/encounters/${i}`,
          encounter.id,
          "An encounter cannot start at the initial player location.",
        );
      }
    }
    conditions(encounter.when, `/encounters/${i}/when`, encounter.id);
    const seen = new Set<string>();
    encounter.effects.forEach((effect, j) => {
      effectReference(
        effect,
        `/encounters/${i}/effects/${j}`,
        encounter.id,
        false,
      );
      const key = `${effect.type}/${effect.id}`;
      if (seen.has(key)) {
        error(
          "conflicting-effects",
          `/encounters/${i}/effects/${j}`,
          encounter.id,
          "Duplicate encounter effect.",
        );
      }
      seen.add(key);
      if (effect.type === "grant-discovery") {
        error(
          "unsupported-effect",
          `/encounters/${i}/effects/${j}`,
          encounter.id,
          "Encounter clearance cannot grant a discovery.",
        );
      }
    });
  });
  snapshot.quest.milestones.forEach((id, i) => {
    if (snapshot.quest.milestones.indexOf(id) !== i) {
      error(
        "duplicate-id",
        `/quest/milestones/${i}`,
        id,
        "Duplicate quest milestone.",
      );
    }
  });
  if (snapshot.player.hp === 0 || snapshot.player.hp > snapshot.player.maxHp) {
    error(
      "invalid-placement",
      "/player/hp",
      "player",
      "Initial HP must be positive and at most maxHp.",
    );
  }
  validateLocationGraph(snapshot, error, {
    reference: (id) => `Unknown location: ${id}.`,
    connection: "Duplicate or self connection.",
    unreachable: "Location is unreachable.",
  });
  (snapshot.socialChallenges ?? []).forEach((challenge, i) => {
    challenge.guardedFactIds.forEach((id, j) =>
      ref(
        facts,
        id,
        `/socialChallenges/${i}/guardedFactIds/${j}`,
        challenge.id,
      ),
    );
    challenge.guardedDiscoveryIds.forEach((id, j) =>
      ref(
        discoveries,
        id,
        `/socialChallenges/${i}/guardedDiscoveryIds/${j}`,
        challenge.id,
      ),
    );
    challenge.guardedMilestoneIds.forEach((id, j) =>
      ref(
        milestones,
        id,
        `/socialChallenges/${i}/guardedMilestoneIds/${j}`,
        challenge.id,
      ),
    );
    conditions(
      challenge.evidenceWhen,
      `/socialChallenges/${i}/evidenceWhen`,
      challenge.id,
    );
    challenge.evidenceAlternatives?.forEach((route, j) => {
      if (route.length === 0) {
        error(
          "invalid-evidence",
          `/socialChallenges/${i}/evidenceAlternatives/${j}`,
          challenge.id,
          "Evidence alternative must have a prerequisite.",
        );
      }
      conditions(
        route,
        `/socialChallenges/${i}/evidenceAlternatives/${j}`,
        challenge.id,
      );
    });
  });
  const routePairs = new Set<string>();
  snapshot.connections.forEach((entry, i) => {
    conditions(entry.when, `/connections/${i}/when`, entry.id);
    if (snapshot.schemaVersion >= 10) {
      const pair = `${entry.from}/${entry.to}`;
      if (routePairs.has(pair)) {
        error(
          "invalid-route",
          `/connections/${i}/to`,
          entry.id,
          "Travel routes must have distinct destinations from one location.",
        );
      }
      routePairs.add(pair);
    }
  });
  if (snapshot.schemaVersion >= 10) {
    for (const [kind, profiles] of [
      ["distractionProfiles", snapshot.distractionProfiles],
      ["deceptionProfiles", snapshot.deceptionProfiles],
      ["offerProfiles", snapshot.offerProfiles],
    ] as const) {
      profiles?.forEach((profile, i) => {
        if (profile.timeCost !== 0) {
          error(
            "invalid-route-cost",
            `/${kind}/${i}/timeCost`,
            profile.id,
            "Local actions must cost zero days under travel rules.",
          );
        }
      });
    }
  }
  snapshot.locations.forEach((entry, i) =>
    entry.descriptions?.forEach((variant, j) =>
      conditions(
        variant.when,
        `/locations/${i}/descriptions/${j}/when`,
        entry.id,
      ),
    ),
  );
  snapshot.features.forEach((entry, i) => {
    conditions(entry.when, `/features/${i}/when`, entry.id);
    entry.descriptions?.forEach((variant, j) =>
      conditions(
        variant.when,
        `/features/${i}/descriptions/${j}/when`,
        entry.id,
      ),
    );
  });
  snapshot.discoveries.forEach((entry, i) => {
    entry.leads?.forEach((variant, j) =>
      conditions(variant.when, `/discoveries/${i}/leads/${j}/when`, entry.id),
    );
    if (
      (entry.sourceFeatureId === undefined) ===
      (entry.sourceNpcId === undefined)
    ) {
      error(
        "invalid-source",
        `/discoveries/${i}`,
        entry.id,
        "Specify exactly one source.",
      );
    }
    if (entry.sourceFeatureId !== undefined) {
      ref(
        features,
        entry.sourceFeatureId,
        `/discoveries/${i}/sourceFeatureId`,
        entry.id,
      );
    }
    if (entry.sourceNpcId !== undefined) {
      ref(npcs, entry.sourceNpcId, `/discoveries/${i}/sourceNpcId`, entry.id);
    }
  });
  for (const [field, ids, allowed] of [
    ["initialDiscoveries", snapshot.initialDiscoveries ?? [], discoveries],
    ["initialMilestones", snapshot.initialMilestones ?? [], milestones],
  ] as const) {
    ids.forEach((id, i) => {
      ref(allowed, id, `/${field}/${i}`, id);
      if (ids.indexOf(id) !== i) {
        error("duplicate-id", `/${field}/${i}`, id, "Duplicate initial fact.");
      }
    });
  }
  snapshot.searches.forEach((entry, i) => {
    ref(features, entry.targetId, `/searches/${i}/targetId`, entry.id);
    conditions(entry.when, `/searches/${i}/when`, entry.id);
    const seen = new Set<string>();
    entry.effects.forEach((effect, j) => {
      effectReference(effect, `/searches/${i}/effects/${j}`, entry.id, false);
      const key = `${effect.type}/${effect.id}`;
      if (seen.has(key)) {
        error(
          "conflicting-effects",
          `/searches/${i}/effects/${j}`,
          entry.id,
          "Duplicate effect in one atomic action.",
        );
      }
      seen.add(key);
      if (effect.type === "grant-discovery") {
        const source = snapshot.discoveries.find(
          (discovery) => discovery.id === effect.id,
        );
        if (source !== undefined && source.sourceFeatureId !== entry.targetId) {
          error(
            "invalid-source",
            `/searches/${i}/effects/${j}`,
            entry.id,
            "A physical search may only grant a discovery sourced to its target.",
          );
        }
      }
    });
    if (entry.effects.length === 0) {
      error(
        "invalid-search",
        `/searches/${i}/effects`,
        entry.id,
        "A search must have an effect.",
      );
    }
  });
  (snapshot.npcs ?? []).forEach((npc, i) => {
    if (npc.combat !== undefined && snapshot.combatProfile === undefined) {
      error(
        "missing-combat-profile",
        `/npcs/${i}/combat`,
        npc.id,
        "Actor combat requires a player combat profile.",
      );
    }
    if (npc.combat !== undefined && npc.combat.hp > npc.combat.maxHp) {
      error(
        "invalid-placement",
        `/npcs/${i}/combat/hp`,
        npc.id,
        "Actor HP exceeds its maximum.",
      );
    }
    if (npc.remains !== undefined && npc.combat === undefined) {
      error(
        "invalid-placement",
        `/npcs/${i}/remains`,
        npc.id,
        "Remains require an actor combat profile.",
      );
    }
    npc.remains?.search?.effects.forEach((effect, n) => {
      effectReference(
        effect,
        `/npcs/${i}/remains/search/effects/${n}`,
        npc.id,
        false,
      );
      if (
        effect.type === "grant-discovery" &&
        snapshot.discoveries.find((entry) => entry.id === effect.id)
          ?.sourceNpcId !== npc.id
      ) {
        error(
          "invalid-source",
          `/npcs/${i}/remains/search/effects/${n}`,
          npc.id,
          "Remains discovery must be sourced to this actor.",
        );
      }
    });
    conditions(npc.when ?? [], `/npcs/${i}/when`, npc.id);
    ref(
      new Set(snapshot.locations.map(({ id }) => id)),
      npc.locationId,
      `/npcs/${i}/locationId`,
      npc.id,
    );
    for (const [field, ids] of [
      ["knows", npc.knows],
      ["believes", npc.believes],
    ] as const) {
      ids.forEach((id, j) =>
        ref(facts, id, `/npcs/${i}/${field}/${j}`, npc.id),
      );
    }
    const topicIds = new Set<string>();
    npc.topics.forEach((topic, j) => {
      if (topicIds.has(topic.id)) {
        error(
          "duplicate-id",
          `/npcs/${i}/topics/${j}/id`,
          topic.id,
          "Duplicate topic ID for speaker.",
        );
      }
      topicIds.add(topic.id);
      if (
        (topic.intent !== undefined && topic.stakes === undefined) ||
        (snapshot.schemaVersion < 15 &&
          topic.intent === undefined &&
          topic.stakes !== undefined) ||
        (topic.intent === "claim" && topic.challengeId === "none") ||
        (topic.intent === "correction" &&
          (topic.challengeId !== "none" ||
            !topic.when.some(
              (condition) => condition.type === "discovery-known",
            )))
      ) {
        error(
          "invalid-social-intent",
          `/npcs/${i}/topics/${j}`,
          topic.id,
          "Social intents require public stakes; claims require a remembered challenge and corrections require discovered evidence without a check.",
        );
      }
      conditions(topic.when, `/npcs/${i}/topics/${j}/when`, topic.id);
      if (topic.challengeId !== "none") {
        ref(
          challenges,
          topic.challengeId,
          `/npcs/${i}/topics/${j}/challengeId`,
          topic.id,
        );
      }
      const fallback = topic.replies.at(-1);
      if (
        fallback === undefined ||
        fallback.when.length !== 0 ||
        fallback.outcome !== "any" ||
        fallback.approach !== "any" ||
        topic.replies
          .slice(0, -1)
          .some(
            (reply) =>
              reply.when.length === 0 &&
              reply.outcome === "any" &&
              reply.approach === "any",
          )
      ) {
        error(
          "missing-fallback",
          `/npcs/${i}/topics/${j}/replies`,
          topic.id,
          "A topic needs an unconditional final fallback.",
        );
      }
      topic.replies.forEach((reply, k) => {
        for (const guarded of (snapshot.socialChallenges ?? []).filter(
          (challenge) =>
            npc.topics.some((subject) => subject.challengeId === challenge.id),
        )) {
          const evidenceAuthorized = [
            guarded.evidenceWhen,
            ...(guarded.evidenceAlternatives ?? []),
          ].some(
            (route) =>
              route.length > 0 &&
              route.every((needed) =>
                reply.when.some(
                  (actual) =>
                    actual.type === needed.type &&
                    actual.id === needed.id &&
                    actual.tier === needed.tier &&
                    actual.locationId === needed.locationId,
                ),
              ),
          );
          const authorized =
            (reply.outcome === "success" && topic.challengeId === guarded.id) ||
            evidenceAuthorized;
          const revealsGuarded =
            reply.approvedFactIds.some((id) =>
              guarded.guardedFactIds.includes(id),
            ) ||
            reply.effects.some((effect) =>
              effect.type === "grant-discovery"
                ? guarded.guardedDiscoveryIds.includes(effect.id)
                : effect.type === "record-milestone" &&
                  guarded.guardedMilestoneIds.includes(effect.id),
            );
          if (revealsGuarded && !authorized) {
            error(
              "guarded-disclosure",
              `/npcs/${i}/topics/${j}/replies/${k}`,
              topic.id,
              "Guarded content requires success or explicit evidence conditions.",
            );
          }
        }
        conditions(
          reply.when,
          `/npcs/${i}/topics/${j}/replies/${k}/when`,
          topic.id,
        );
        reply.approvedFactIds.forEach((id, n) => {
          ref(
            facts,
            id,
            `/npcs/${i}/topics/${j}/replies/${k}/approvedFactIds/${n}`,
            topic.id,
          );
          if (!npc.knows.includes(id) && !npc.believes.includes(id)) {
            error(
              "unapproved-knowledge",
              `/npcs/${i}/topics/${j}/replies/${k}/approvedFactIds/${n}`,
              topic.id,
              "Speaker does not know this fact.",
            );
          }
        });
        const seen = new Set<string>();
        reply.effects.forEach((effect, n) => {
          effectReference(
            effect,
            `/npcs/${i}/topics/${j}/replies/${k}/effects/${n}`,
            topic.id,
            true,
          );
          if (effect.type === "relocate-npc" && effect.id !== npc.id) {
            error(
              "invalid-relocation",
              `/npcs/${i}/topics/${j}/replies/${k}/effects/${n}`,
              topic.id,
              "A speaker may relocate only themselves.",
            );
          }
          if (effect.type === "set-relationship" && effect.id !== npc.id) {
            error(
              "invalid-effect",
              `/npcs/${i}/topics/${j}/replies/${k}/effects/${n}`,
              topic.id,
              "A speaker may change only their own relationship.",
            );
          }
          const key = `${effect.type}/${effect.id}`;
          if (seen.has(key)) {
            error(
              "conflicting-effects",
              `/npcs/${i}/topics/${j}/replies/${k}/effects/${n}`,
              topic.id,
              "Duplicate effect.",
            );
          }
          seen.add(key);
          if (
            effect.type === "grant-discovery" &&
            snapshot.discoveries.find((entry) => entry.id === effect.id)
              ?.sourceNpcId !== npc.id
          ) {
            error(
              "invalid-source",
              `/npcs/${i}/topics/${j}/replies/${k}/effects/${n}`,
              topic.id,
              "Conversation discovery must be sourced to this speaker.",
            );
          }
        });
      });
    });
    validateVisibleAliases(
      npc.topics.map((entry, index) => ({
        entry,
        identity: entry.id,
        path: `/npcs/${i}/topics/${index}`,
      })),
      error,
      (alias) => `Ambiguous topic alias: ${alias}.`,
      true,
    );
  });
  for (const location of snapshot.locations) {
    validateVisibleAliases(
      (snapshot.npcs ?? [])
        .filter((entry) => entry.locationId === location.id)
        .map((entry) => ({
          entry,
          identity: entry.id,
          path: `/npcs/${(snapshot.npcs ?? []).indexOf(entry)}`,
        })),
      error,
      (alias) => `Ambiguous speaker alias: ${alias}.`,
      true,
    );
    validateVisibleAliases(
      [
        ...snapshot.features
          .filter((entry) => entry.locationId === location.id)
          .map((entry) => ({
            entry,
            identity: entry.id,
            path: `/features/${snapshot.features.indexOf(entry)}`,
          })),
        ...snapshot.connections
          .filter((entry) => entry.from === location.id)
          .flatMap((entry) => {
            const target = snapshot.locations.find(
              (room) => room.id === entry.to,
            );
            return target === undefined
              ? []
              : [
                  {
                    entry: target,
                    identity: `location/${target.id}`,
                    path: `/locations/${snapshot.locations.indexOf(target)}`,
                  },
                ];
          }),
        ...(snapshot.monsters ?? [])
          .filter((entry) => entry.locationId === location.id)
          .flatMap((entry) => {
            const definition = monsterDefinitions.get(entry.definitionId);
            return definition === undefined
              ? []
              : [
                  {
                    entry: {
                      id: entry.id,
                      aliases: [definition.id, ...definition.aliases],
                    },
                    identity: `monster/${entry.id}`,
                    path: `/monsters/${(snapshot.monsters ?? []).indexOf(entry)}`,
                  },
                ];
          }),
        ...(snapshot.items ?? [])
          .filter((entry) => entry.locationId === location.id)
          .map((entry) => ({
            entry,
            identity: `item/${entry.id}`,
            path: `/items/${(snapshot.items ?? []).indexOf(entry)}`,
          })),
      ],
      error,
      (alias) => `Ambiguous visible alias: ${alias}.`,
      true,
    );
  }
}

function validateAdjudicationProfiles(
  snapshot: ChapelCluesDefinition,
  diagnostics: AdventureDiagnostic[],
): void {
  const profiles = snapshot.adjudicationProfiles ?? [];
  const seen = new Set<string>();
  const tuples = new Set<string>();
  const passageAliases = new Map<string, string>();
  for (const [index, profile] of profiles.entries()) {
    const path = `/adjudicationProfiles/${index}`;
    const error = (suffix: string, message: string) =>
      diagnostics.push({
        severity: "error",
        code: "invalid-adjudication",
        path: `${path}${suffix}`,
        entity: profile.id,
        message,
      });
    if (seen.has(profile.id)) {
      error("/id", "Duplicate adjudication profile ID.");
    }
    seen.add(profile.id);
    if (
      profile.targetAliases?.some((alias, i) =>
        profile
          .targetAliases!.slice(0, i)
          .some((prior) => normalizeAlias(prior) === normalizeAlias(alias)),
      )
    ) {
      error("/targetAliases", "Duplicate target alias.");
    }
    const target = snapshot.connections.find(
      ({ id }) => id === profile.targetId,
    );
    const resource = snapshot.features.find(
      ({ id }) => id === profile.resourceId,
    );
    const tuple = `${profile.targetId}/${profile.resourceId}`;
    if (tuples.has(tuple)) {
      error(
        "/resourceId",
        "More than one profile matches this passage and object.",
      );
    }
    tuples.add(tuple);
    if (target !== undefined) {
      const destination = snapshot.locations.find(({ id }) => id === target.to);
      for (const alias of [
        target.id,
        destination?.id,
        destination?.name,
        ...(destination?.aliases ?? []),
        ...(profile.targetAliases ?? []),
      ]) {
        if (alias === undefined) {
          continue;
        }
        const key = `${target.from}/${normalizeAlias(alias)}`;
        const previous = passageAliases.get(key);
        if (previous !== undefined && previous !== target.id) {
          error("/targetAliases", `Ambiguous passage name: ${alias}.`);
        }
        passageAliases.set(key, target.id);
      }
    }
    if (target?.capability !== "passage") {
      error("/targetId", "Target must reference a passage-capable connection.");
    }
    if (resource?.capability !== "brace") {
      error("/resourceId", "Resource must reference a brace-capable feature.");
    }
    if (
      target !== undefined &&
      resource !== undefined &&
      target.from !== resource.locationId
    ) {
      error(
        "/resourceId",
        "The brace and passage must be in the same visible scene.",
      );
    }
    if (!profile.effect.connectionIds.includes(profile.targetId)) {
      error(
        "/effect/connectionIds",
        "The effect must block its selected passage.",
      );
    }
    if (
      new Set(profile.effect.connectionIds).size !==
      profile.effect.connectionIds.length
    ) {
      error("/effect/connectionIds", "Effect connection IDs must be unique.");
    }
    for (const [effectIndex, id] of profile.effect.connectionIds.entries()) {
      const connection = snapshot.connections.find((entry) => entry.id === id);
      if (
        connection === undefined ||
        target === undefined ||
        !(
          [connection.from, connection.to].includes(target.from) &&
          [connection.from, connection.to].includes(target.to)
        )
      ) {
        error(
          `/effect/connectionIds/${effectIndex}`,
          "Effect may block only this passage's directed connections.",
        );
      }
    }
    for (const location of snapshot.locations) {
      const exits = snapshot.connections.filter(
        ({ from }) => from === location.id,
      );
      if (
        exits.length > 0 &&
        exits.every(({ id }) => profile.effect.connectionIds.includes(id))
      ) {
        error(
          "/effect/connectionIds",
          `Barricade would remove every exit from ${location.id}.`,
        );
      }
    }
  }
}

function validateDistractionProfiles(
  snapshot: ChapelCluesDefinition,
  diagnostics: AdventureDiagnostic[],
): void {
  const guarded = new Set<string>();
  for (const [index, profile] of (
    snapshot.distractionProfiles ?? []
  ).entries()) {
    const path = `/distractionProfiles/${index}`;
    const error = (field: string, message: string) =>
      diagnostics.push({
        severity: "error",
        code: "invalid-adjudication",
        path: `${path}/${field}`,
        entity: profile.id,
        message,
      });
    const guard = snapshot.npcs?.find(({ id }) => id === profile.guardId);
    const resource = snapshot.features.find(
      ({ id }) => id === profile.resourceId,
    );
    const connection = snapshot.connections.find(
      ({ id }) => id === profile.connectionId,
    );
    const clock = snapshot.clocks?.find(({ id }) => id === profile.clockId);
    if (guard?.combat === undefined) {
      error("guardId", "Guard must be a living, combat-capable NPC.");
    }
    if (resource?.capability !== "noise") {
      error("resourceId", "Distraction requires a noise-capable feature.");
    }
    if (connection === undefined) {
      error("connectionId", "Unknown guarded connection.");
    } else {
      if (
        guard !== undefined &&
        resource !== undefined &&
        (connection.from !== guard.locationId ||
          connection.from !== resource.locationId)
      ) {
        error("connectionId", "Guard, feature, and route must share a scene.");
      }
      if (connection.when.length > 0) {
        error("connectionId", "Guarded route cannot have another condition.");
      }
      if (guarded.has(connection.id)) {
        error("connectionId", "Only one profile may control a guarded route.");
      }
      guarded.add(connection.id);
      if (
        snapshot.connections.filter(
          ({ from, id }) => from === connection.from && id !== connection.id,
        ).length === 0
      ) {
        error("connectionId", "A failed check needs an alternate exit.");
      }
    }
    if (clock?.unit !== "day") {
      error("clockId", "Distraction requires a day clock.");
    } else if (
      profile.expiresAt <= clock.initial + profile.timeCost ||
      profile.expiresAt > clock.maximum
    ) {
      error("expiresAt", "Expiry must leave a usable success interval.");
    }
  }
}

export function freezeDefinition<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      freezeDefinition(child);
    }
    Object.freeze(value);
  }
  return value;
}

// Inputs here have already passed the bounded JSON and schema validators.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function loadAdventure(input: string | Uint8Array):
  | Readonly<{
      ok: true;
      adventure: ValidatedAdventure;
      diagnostics: readonly AdventureDiagnostic[];
    }>
  | Readonly<{ ok: false; diagnostics: readonly AdventureDiagnostic[] }> {
  const diagnostics: AdventureDiagnostic[] = [];
  let parsed: unknown;
  try {
    parsed = parseBoundedJson(input, ADVENTURE_BYTE_LIMIT);
  } catch (error) {
    if (!(error instanceof JsonInputError)) {
      throw error;
    }
    return freezeDefinition({
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: error.code,
          path: error.path,
          entity: null,
          message: error.message,
        },
      ],
    });
  }
  validateStructure(
    parsed,
    (parsed as { schemaVersion?: number; rulesVersion?: string } | null)
      ?.schemaVersion === 2 &&
      (parsed as { rulesVersion?: string } | null)?.rulesVersion ===
        "signet-rules-v1"
      ? SIGNET_SCHEMA
      : (parsed as { schemaVersion?: number } | null)?.schemaVersion === 15
        ? CONFRONTATION_SCHEMA
        : (parsed as { schemaVersion?: number } | null)?.schemaVersion === 14
          ? QUEST_ITEM_SCHEMA
          : (parsed as { schemaVersion?: number } | null)?.schemaVersion === 13
            ? RECOVERY_SCHEMA
            : (parsed as { schemaVersion?: number } | null)?.schemaVersion ===
                12
              ? BRACE_SCHEMA
              : (parsed as { schemaVersion?: number } | null)?.schemaVersion ===
                  11
                ? CLAIM_SCHEMA
                : (parsed as { schemaVersion?: number } | null)
                      ?.schemaVersion === 10
                  ? TRAVEL_SCHEMA
                  : (parsed as { schemaVersion?: number } | null)
                        ?.schemaVersion === 9
                    ? OFFER_SCHEMA
                    : (parsed as { schemaVersion?: number } | null)
                          ?.schemaVersion === 8
                      ? DECEPTION_SCHEMA
                      : (parsed as { schemaVersion?: number } | null)
                            ?.schemaVersion === 7
                        ? DAY_SCHEMA
                        : (parsed as { schemaVersion?: number } | null)
                              ?.schemaVersion === 6
                          ? ADJUDICATION_SCHEMA
                          : (parsed as { schemaVersion?: number } | null)
                                ?.schemaVersion === 5
                            ? CLOCK_SCHEMA
                            : (parsed as { schemaVersion?: number } | null)
                                  ?.schemaVersion === 4
                              ? RELATIONSHIP_SCHEMA
                              : (parsed as { schemaVersion?: number } | null)
                                    ?.schemaVersion === 3
                                ? CHAPEL_CLUES_SCHEMA
                                : ADVENTURE_SCHEMA,
    "",
    diagnostics,
  );
  if (diagnostics.length > 0) {
    return freezeDefinition({
      ok: false,
      diagnostics: diagnostics.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : 1,
      ),
    });
  }
  const snapshot = parsed as AdventureDefinition;
  if (snapshot.schemaVersion === 2) {
    validateSignetReferences(snapshot, diagnostics);
  } else if (
    snapshot.schemaVersion === 3 ||
    snapshot.schemaVersion === 4 ||
    snapshot.schemaVersion === 5 ||
    snapshot.schemaVersion === 6 ||
    snapshot.schemaVersion === 7 ||
    snapshot.schemaVersion === 8 ||
    snapshot.schemaVersion === 9 ||
    snapshot.schemaVersion === 10 ||
    snapshot.schemaVersion === 11 ||
    snapshot.schemaVersion === 12 ||
    snapshot.schemaVersion === 13 ||
    snapshot.schemaVersion === 14 ||
    snapshot.schemaVersion === 15
  ) {
    validateClueReferences(snapshot, diagnostics);
    if (snapshot.schemaVersion >= 14) {
      const quest = snapshot.questItem;
      const item = snapshot.items?.find(({ id }) => id === quest?.itemId);
      const feature = snapshot.features.find(
        ({ id }) => id === quest?.featureId,
      );
      const discovery = snapshot.discoveries.find(
        ({ id }) => id === quest?.discoveryId,
      );
      if (
        !quest ||
        !item ||
        item.healing !== undefined ||
        !feature ||
        !snapshot.quest.milestones.includes(quest.milestoneId) ||
        discovery?.sourceFeatureId !== feature.id ||
        snapshot.items?.some(
          (other) => other.id !== quest.itemId && other.healing === undefined,
        )
      ) {
        diagnostics.push({
          severity: "error",
          code: "invalid-quest-item",
          path: "/questItem",
          entity: quest?.itemId ?? null,
          message:
            "Quest item requires one non-healing item, a target feature, milestone and target-sourced discovery; other items must heal.",
        });
      }
    }
    if (snapshot.recovery !== undefined) {
      const recovery = snapshot.recovery;
      if (
        !snapshot.features.some(({ id }) => id === recovery.featureId) ||
        !snapshot.quest.milestones.includes(recovery.milestoneId)
      ) {
        diagnostics.push({
          severity: "error",
          code: "invalid-recovery",
          path: "/recovery",
          entity: recovery.featureId,
          message:
            "Recovery requires a feature and a declared quest milestone.",
        });
      }
    }
    if (snapshot.combatBrace !== undefined) {
      const brace = snapshot.combatBrace;
      const feature = snapshot.features.find(
        ({ id }) => id === brace.featureId,
      );
      const monster = snapshot.monsters?.find(
        ({ id }) => id === brace.monsterId,
      );
      if (
        feature === undefined ||
        monster === undefined ||
        feature.locationId !== monster.locationId ||
        !snapshot.encounters?.some(
          ({ monsterId }) => monsterId === brace.monsterId,
        )
      ) {
        diagnostics.push({
          severity: "error",
          code: "invalid-combat-brace",
          path: "/combatBrace",
          entity: brace.featureId,
          message:
            "Combat cover requires a feature beside an encountered monster.",
        });
      }
    }
    if (snapshot.schemaVersion >= 6) {
      validateAdjudicationProfiles(snapshot, diagnostics);
    }
    if (snapshot.schemaVersion >= 7) {
      validateDistractionProfiles(snapshot, diagnostics);
    }
  } else if (snapshot.schemaVersion === 1) {
    validateReferences(snapshot, diagnostics);
  }
  if (diagnostics.length > 0) {
    return freezeDefinition({
      ok: false,
      diagnostics: diagnostics.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : 1,
      ),
    });
  }
  if (
    snapshot.schemaVersion === 3 ||
    snapshot.schemaVersion === 4 ||
    snapshot.schemaVersion === 5 ||
    snapshot.schemaVersion === 6 ||
    snapshot.schemaVersion === 7 ||
    snapshot.schemaVersion === 8 ||
    snapshot.schemaVersion === 9 ||
    snapshot.schemaVersion === 10 ||
    snapshot.schemaVersion === 11 ||
    snapshot.schemaVersion === 12 ||
    snapshot.schemaVersion === 13 ||
    snapshot.schemaVersion === 14 ||
    snapshot.schemaVersion === 15
  ) {
    diagnostics.push(...analyzeProgression(snapshot));
  }
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return freezeDefinition({
      ok: false,
      diagnostics: diagnostics.sort(compareDiagnostics),
    });
  }
  const canonical = canonicalJson(snapshot);
  return freezeDefinition({
    ok: true,
    adventure: {
      snapshot,
      canonicalJson: canonical,
      digest: `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`,
      indexes: {
        locations: Object.fromEntries(
          snapshot.locations.map((entity) => [entity.id, entity]),
        ),
        features: Object.fromEntries(
          snapshot.features.map((entity) => [entity.id, entity]),
        ),
        connections: Object.fromEntries(
          snapshot.connections.map((entity) => [entity.id, entity]),
        ),
        ...(snapshot.schemaVersion === 2
          ? {
              doors: Object.fromEntries(
                snapshot.doors.map((entity) => [entity.id, entity]),
              ),
              equipment: Object.fromEntries(
                snapshot.equipment.map((entity) => [entity.id, entity]),
              ),
              monsterDefinitions: Object.fromEntries(
                snapshot.monsterDefinitions.map((entity) => [
                  entity.id,
                  entity,
                ]),
              ),
              monsters: Object.fromEntries(
                snapshot.monsters.map((entity) => [entity.id, entity]),
              ),
              items: Object.fromEntries(
                snapshot.items.map((entity) => [entity.id, entity]),
              ),
            }
          : {}),
      },
    },
    diagnostics: diagnostics.sort(compareDiagnostics),
  });
}
