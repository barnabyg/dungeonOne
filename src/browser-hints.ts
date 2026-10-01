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
  const leads = scene.journal?.actionableLeads ?? [];
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
  // Choose a concrete information-gathering step, without claiming a hidden
  // result or interpreting authored adventure internals.
  const informationActions = ["talk", "search", "move", "inspect"].flatMap(
    (name) =>
      actions.filter(
        (option) =>
          option.call.name === name &&
          (name !== "talk" ||
            JSON.parse(option.call.argumentsJson).approach === "ask"),
      ),
  );
  const linked = leads.flatMap((lead) =>
    targets
      .map((target) => ({
        target,
        mention: lead.toLowerCase().indexOf(target.name.toLowerCase()),
      }))
      .filter(({ mention }) => mention >= 0)
      .sort((left, right) => left.mention - right.mention)
      .flatMap(({ target }) =>
        informationActions.filter(
          (option) => option.contextId === target.contextId,
        ),
      ),
  )[0];
  const action = linked ?? informationActions[0];
  if (scene.outcome !== "playing" || action === undefined) {
    return [
      "No stronger next step is justified by your current knowledge and available actions. Revisit your journal and known leads; this hint cannot reveal an undiscovered solution.",
    ];
  }
  return [
    `Try this next: ${action.message}${action.message.endsWith(".") ? "" : "."} ${linked === undefined ? "This is an available" : "Following a lead already in your journal, this is an available"} ${action.call.name === "move" ? "route to a visible location" : "way to gather information about a known subject"}. Read the result, then compare it with your journal and current objective: ${scene.objective} No particular discovery or success is guaranteed.`,
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
