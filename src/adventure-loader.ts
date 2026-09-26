import { createHash } from "node:crypto";
import { JsonInputError, parseBoundedJson, pointer } from "./bounded-json.js";
import { ADVENTURE_SCHEMA, type Schema } from "./adventure-schema.js";
import { SIGNET_SCHEMA } from "./signet-schema.js";

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
export type AdventureDefinition = ExplorationDefinition | SignetDefinition;
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
