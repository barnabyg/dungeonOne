import { createHash } from "node:crypto";
import { JsonInputError, parseBoundedJson, pointer } from "./bounded-json.js";
import { ADVENTURE_SCHEMA, type Schema } from "./adventure-schema.js";
import { SIGNET_SCHEMA } from "./signet-schema.js";
import { CHAPEL_CLUES_SCHEMA } from "./chapel-clues-schema.js";

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
  type: "discovery-known" | "milestone-recorded";
  id: string;
}>;
export type ClueEffect = Readonly<{
  type: "grant-discovery" | "record-milestone";
  id: string;
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
  replies: readonly DialogueReply[];
}>;
export type DialogueNpc = Readonly<{
  id: string;
  name: string;
  aliases: readonly string[];
  locationId: string;
  voice: string;
  knows: readonly string[];
  believes: readonly string[];
  wants: readonly string[];
  knowledgeLimits: readonly string[];
  topics: readonly DialogueTopic[];
}>;
export type ChapelCluesDefinition = Readonly<{
  schemaVersion: 3;
  id: string;
  contentVersion: string;
  rulesVersion: "chapel-clues-rules-v1";
  title: string;
  introduction: string;
  objective: string;
  player: Readonly<{ locationId: string; hp: number; maxHp: number }>;
  locations: readonly LocationDefinition[];
  connections: readonly (ConnectionDefinition &
    Readonly<{ when: readonly ClueCondition[] }>)[];
  features: readonly (FeatureDefinition &
    Readonly<{ when: readonly ClueCondition[] }>)[];
  quest: Readonly<{ id: string; title: string; milestones: readonly string[] }>;
  discoveries: readonly Readonly<{
    id: string;
    title: string;
    classification: "observation" | "testimony" | "belief";
    sourceFeatureId?: string;
    sourceNpcId?: string;
    summary: string;
    lead: string;
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
  }>[];
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
  validateUniqueIds(
    [
      { namespace: "locations", entries: snapshot.locations },
      { namespace: "connections", entries: snapshot.connections },
      { namespace: "features", entries: snapshot.features },
      { namespace: "discoveries", entries: snapshot.discoveries },
      { namespace: "searches", entries: snapshot.searches },
      { namespace: "facts", entries: snapshot.facts ?? [] },
      { namespace: "npcs", entries: snapshot.npcs ?? [] },
      {
        namespace: "socialChallenges",
        entries: snapshot.socialChallenges ?? [],
      },
    ],
    error,
    "Duplicate entity ID.",
  );
  const features = new Set(snapshot.features.map(({ id }) => id));
  const discoveries = new Set(snapshot.discoveries.map(({ id }) => id));
  const milestones = new Set(snapshot.quest.milestones);
  const facts = new Set((snapshot.facts ?? []).map(({ id }) => id));
  const npcs = new Set((snapshot.npcs ?? []).map(({ id }) => id));
  const challenges = new Set(
    (snapshot.socialChallenges ?? []).map(({ id }) => id),
  );
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
  const ref = (set: Set<string>, id: string, path: string, entity: string) => {
    if (!set.has(id)) {
      error("unknown-reference", path, entity, `Unknown reference: ${id}.`);
    }
  };
  const conditions = (
    list: readonly ClueCondition[],
    path: string,
    entity: string,
  ) =>
    list.forEach((entry, i) =>
      ref(
        entry.type === "discovery-known" ? discoveries : milestones,
        entry.id,
        `${path}/${i}/id`,
        entity,
      ),
    );
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
  });
  snapshot.connections.forEach((entry, i) =>
    conditions(entry.when, `/connections/${i}/when`, entry.id),
  );
  snapshot.features.forEach((entry, i) =>
    conditions(entry.when, `/features/${i}/when`, entry.id),
  );
  snapshot.discoveries.forEach((entry, i) => {
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
  const producers = new Set([
    ...snapshot.searches.flatMap((search) =>
      search.effects
        .filter((effect) => effect.type === "record-milestone")
        .map((effect) => effect.id),
    ),
    ...(snapshot.npcs ?? []).flatMap((npc) =>
      npc.topics.flatMap((topic) =>
        topic.replies.flatMap((reply) =>
          reply.effects
            .filter((effect) => effect.type === "record-milestone")
            .map((effect) => effect.id),
        ),
      ),
    ),
  ]);
  snapshot.quest.milestones.forEach((id, i) => {
    if (!producers.has(id)) {
      error(
        "unproducible-milestone",
        `/quest/milestones/${i}`,
        id,
        "No search records this milestone.",
      );
    }
  });
  snapshot.searches.forEach((entry, i) => {
    ref(features, entry.targetId, `/searches/${i}/targetId`, entry.id);
    conditions(entry.when, `/searches/${i}/when`, entry.id);
    const seen = new Set<string>();
    entry.effects.forEach((effect, j) => {
      ref(
        effect.type === "grant-discovery" ? discoveries : milestones,
        effect.id,
        `/searches/${i}/effects/${j}/id`,
        entry.id,
      );
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
          const evidenceAuthorized =
            guarded.evidenceWhen.length > 0 &&
            guarded.evidenceWhen.every((needed) =>
              reply.when.some(
                (actual) =>
                  actual.type === needed.type && actual.id === needed.id,
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
                : guarded.guardedMilestoneIds.includes(effect.id),
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
          ref(
            effect.type === "grant-discovery" ? discoveries : milestones,
            effect.id,
            `/npcs/${i}/topics/${j}/replies/${k}/effects/${n}/id`,
            topic.id,
          );
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
      ],
      error,
      (alias) => `Ambiguous visible alias: ${alias}.`,
      true,
    );
  }
  // A finite fixed point catches closed prerequisite cycles without guessing combat outcomes.
  const known = new Set<string>();
  const reached = new Set([snapshot.player.locationId]);
  const reachableSearches = new Set<string>();
  for (
    let pass = 0;
    pass < snapshot.searches.length + snapshot.connections.length + 1;
    pass++
  ) {
    for (const route of snapshot.connections) {
      if (
        reached.has(route.from) &&
        route.when.every((c) => known.has(`${c.type}/${c.id}`))
      ) {
        reached.add(route.to);
      }
    }
    for (const search of snapshot.searches) {
      const feature = snapshot.features.find(
        (entry) => entry.id === search.targetId,
      );
      if (
        feature !== undefined &&
        reached.has(feature.locationId) &&
        feature.when.every((c) => known.has(`${c.type}/${c.id}`)) &&
        search.when.every((c) => known.has(`${c.type}/${c.id}`))
      ) {
        reachableSearches.add(search.id);
        search.effects.forEach((effect) =>
          known.add(
            `${effect.type === "grant-discovery" ? "discovery-known" : "milestone-recorded"}/${effect.id}`,
          ),
        );
      }
    }
  }
  snapshot.searches.forEach((entry, i) => {
    if (!reachableSearches.has(entry.id)) {
      error(
        "unreachable-search",
        `/searches/${i}`,
        entry.id,
        "Search prerequisites form an unreachable dependency.",
      );
    }
  });
  snapshot.locations.forEach((entry, i) => {
    if (!reached.has(entry.id)) {
      error(
        "unreachable-location",
        `/locations/${i}`,
        entry.id,
        "Conditional routes never make this location reachable.",
      );
    }
  });
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
      : (parsed as { schemaVersion?: number } | null)?.schemaVersion === 3
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
  } else if (snapshot.schemaVersion === 3) {
    validateClueReferences(snapshot, diagnostics);
  } else {
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
    diagnostics: [],
  });
}
