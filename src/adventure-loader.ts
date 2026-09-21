import { createHash } from "node:crypto";
import { JsonInputError, parseBoundedJson, pointer } from "./bounded-json.js";
import { ADVENTURE_SCHEMA, type Schema } from "./adventure-schema.js";

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
export type AdventureDefinition = Readonly<{
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

function validateReferences(
  snapshot: AdventureDefinition,
  diagnostics: AdventureDiagnostic[],
): void {
  const error = (code: string, path: string, entity: string, message: string) =>
    diagnostics.push({ severity: "error", code, path, entity, message });
  for (const namespace of ["locations", "connections", "features"] as const) {
    const ids = new Set<string>();
    snapshot[namespace].forEach((entry, index) => {
      if (ids.has(entry.id)) {
        error(
          "duplicate-id",
          `/${namespace}/${index}/id`,
          entry.id,
          "Duplicate entity ID in namespace.",
        );
      }
      ids.add(entry.id);
    });
  }
  const locations = new Set(snapshot.locations.map((entry) => entry.id));
  const reference = (id: string, path: string, entity: string) => {
    if (!locations.has(id)) {
      error(
        "unknown-reference",
        path,
        entity,
        "Expected a location reference.",
      );
    }
  };
  reference(snapshot.player.locationId, "/player/locationId", "player");
  if (snapshot.player.hp === 0 || snapshot.player.hp > snapshot.player.maxHp) {
    error(
      "invalid-placement",
      "/player/hp",
      "player",
      "The initial player must be alive and HP cannot exceed maxHp.",
    );
  }
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
        "Connections must be distinct directed routes to another location.",
      );
    }
    routes.add(route);
  });
  // Inspection sees local features and outgoing destinations in the same namespace.
  // IDs are implicit aliases, too; two aliases of one entity are harmless.
  for (const location of snapshot.locations) {
    const visible = [
      ...snapshot.locations.flatMap((entry, index) =>
        routes.has(`${location.id}/${entry.id}`)
          ? [{ entry, path: `/locations/${index}`, namespace: "location" }]
          : [],
      ),
      ...snapshot.features.flatMap((entry, index) =>
        entry.locationId === location.id
          ? [{ entry, path: `/features/${index}`, namespace: "feature" }]
          : [],
      ),
    ];
    const aliases = new Map<string, string>();
    for (const { entry, path, namespace } of visible) {
      [entry.id, ...entry.aliases].forEach((alias, index) => {
        const normalized = normalizeAlias(alias);
        const identity = `${namespace}/${entry.id}`;
        if (aliases.has(normalized) && aliases.get(normalized) !== identity) {
          error(
            "ambiguous-alias",
            index === 0 ? `${path}/id` : `${path}/aliases/${index - 1}`,
            entry.id,
            "Alias overlaps another visible reference.",
          );
        }
        aliases.set(normalized, identity);
      });
    }
  }
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
        "Location is not reachable from the initial placement.",
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
  validateStructure(parsed, ADVENTURE_SCHEMA, "", diagnostics);
  if (diagnostics.length > 0) {
    return freezeDefinition({
      ok: false,
      diagnostics: diagnostics.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : 1,
      ),
    });
  }
  const snapshot = parsed as AdventureDefinition;
  validateReferences(snapshot, diagnostics);
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
      },
    },
    diagnostics: [],
  });
}
