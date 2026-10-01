import { createHash } from "node:crypto";
import { browserActions } from "./browser-actions.js";
import type { SaveSession } from "./save.js";

export type BrowserHints = Readonly<{
  version: 1;
  revision: string;
  status: "ready" | "unavailable";
  entries: readonly string[];
}>;

// History and hint-cache writes are not new game positions.
export function hintRevision(session: SaveSession): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        generation: session.generation,
        progress: session.progress,
      }),
    )
    .digest("hex");
}

export function hintCandidates(session: SaveSession): readonly string[] {
  const scene = session.runtime.projectDmScene(session.state);
  if (scene.outcome !== "playing") {
    return [
      "This adventure has ended. You can revisit your journal and conversation.",
    ];
  }
  return [
    ...new Set([
      `Current objective: ${scene.objective}`,
      ...(scene.journal?.actionableLeads ?? []).map(
        (lead) => `Known lead: ${lead}`,
      ),
      ...browserActions(session, hintRevision(session)).map(
        (action) =>
          `You can ${action.message}${action.stakes ? ` Stakes: ${action.stakes}` : ""}`,
      ),
    ]),
  ];
}

// A preparer can select/order approved guidance, never introduce free-form facts.
export type HintPreparer = (
  candidates: readonly string[],
) => Promise<readonly string[]>;

export function cachedHints(session: SaveSession): BrowserHints | undefined {
  const value: unknown = session.browserHints;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const cache = value as BrowserHints;
  const allowed = hintCandidates(session);
  return Object.keys(cache).length === 4 &&
    cache.version === 1 &&
    cache.revision === hintRevision(session) &&
    (cache.status === "ready" || cache.status === "unavailable") &&
    Array.isArray(cache.entries) &&
    cache.entries.length <= allowed.length &&
    cache.entries.every(
      (entry) => typeof entry === "string" && allowed.includes(entry),
    ) &&
    (cache.status === "ready"
      ? cache.entries.length > 0
      : cache.entries.length === 0)
    ? {
        version: 1,
        revision: cache.revision,
        status: cache.status,
        entries: [...cache.entries],
      }
    : undefined;
}

export function prepareHints(session: SaveSession): BrowserHints {
  return {
    version: 1,
    revision: hintRevision(session),
    status: "ready",
    entries: hintCandidates(session),
  };
}
