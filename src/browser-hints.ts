import { createHash } from "node:crypto";
import { browserActions } from "./browser-actions.js";
import type { SaveSession } from "./save.js";
import { browserInformation } from "./browser-information.js";

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
      ...browserInformation(session).currentLeads.map(
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
  return validatedHints(
    session.browserHints,
    hintCandidates(session),
    hintRevision(session),
  );
}

export function strongerHintCandidates(
  session: SaveSession,
): readonly string[] {
  const scene = session.runtime.projectDmScene(session.state);
  const actions = browserActions(session, hintRevision(session));
  const leads = browserInformation(session).currentLeads;
  const targets = [
    ...scene.room.exits.map((exit) => ({
      contextId: "exit:" + exit.destinationId,
      name: exit.name.replace(/ \(\d+ days\)$/, ""),
    })),
    ...(scene.room.npcs ?? []).map((npc) => ({
      contextId: "npc:" + npc.id,
      name: npc.name,
    })),
    ...[
      ...scene.room.features,
      ...scene.room.items,
      ...scene.room.opponents,
    ].map((target) => ({
      contextId: "target:" + target.id,
      name: target.name,
    })),
  ];
  // Narrow attention to subjects already named together in a public lead.
  // Availability is a grounding check, not an instruction to execute a tool.
  const available = targets.filter((target) =>
    actions.some(
      (action) =>
        action.contextId === target.contextId &&
        ["talk", "search", "examine", "move", "inspect"].includes(
          action.call.name,
        ),
    ),
  );
  const linked = leads
    .map((lead) =>
      available
        .map((target) => ({
          target,
          mention: lead.toLowerCase().indexOf(target.name.toLowerCase()),
        }))
        .filter(({ mention }) => mention >= 0)
        .sort((left, right) => left.mention - right.mention)
        .map(({ target }) => target.name),
    )
    .find((names) => names.length > 0);
  if (scene.outcome !== "playing" || available.length === 0) {
    return [
      "No stronger next step is justified by your current knowledge and available actions. Revisit your journal and known leads; this hint cannot reveal an undiscovered solution.",
    ];
  }
  const names = [...new Set(linked ?? [available[0]!.name])].slice(0, 2);
  return names.length === 2
    ? [
        `Your current lead mentions ${names[0]} alongside ${names[1]}. Consider how information from those sources might fit together. What would help you make sense of what you already know?`,
      ]
    : [
        `${linked === undefined ? "One subject still in view is" : "Your current lead points toward"} ${names[0]}. What information is still missing from that part of the story? Consider it alongside what your journal already records.`,
      ];
}

export function cachedStrongerHints(
  session: SaveSession,
): BrowserHints | undefined {
  return validatedHints(
    session.browserStrongerHints,
    strongerHintCandidates(session),
    hintRevision(session),
  );
}

function validatedHints(
  value: unknown,
  allowed: readonly string[],
  revision: string,
): BrowserHints | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const cache = value as BrowserHints;
  return Object.keys(cache).length === 4 &&
    cache.version === 1 &&
    cache.revision === revision &&
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
