// Trace verification and resumed-journey segments. Formats 4 to 6 replay any
// registry runtime through the runtime contract; older formats, and the
// version history of the runtimes that wrote them, come from the registry's
// trace replay support. This module never imports a runtime.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateCharacter } from "./character-rules.js";
import { isCharacterSchema, loadAdventure } from "./adventure-loader.js";
import { createDataRuntime, TRACE_REPLAY } from "./data-runtime.js";
import { RANDOM_ALGORITHM } from "./random.js";
import {
  requireArray,
  requireFields,
  requireInteger,
  requireMatch,
  requireObject,
  requireOneOf,
  requireString,
  requireSupported,
  validateCompletion,
  validateRoll,
  type JsonObject,
} from "./replay-decode.js";
import {
  replayCommandTrace,
  replayDmTrace,
  TRACE_REPLAY_ENGINE,
  validateDmTrace,
  type ReplayAction,
} from "./replay-engine.js";
import { readTraceFile } from "./trace-file.js";

function replayFormat4(trace: JsonObject): void {
  if (
    !TRACE_REPLAY.engineVersions.some(
      (version) => version === trace.engineVersion,
    )
  ) {
    throw new Error(
      `Unsupported engine version ${JSON.stringify(trace.engineVersion)}.`,
    );
  }
  const mode = requireOneOf(trace.mode, ["command", "ai"], "mode");
  requireFields(
    trace,
    [
      "formatVersion",
      "mode",
      "engineVersion",
      "rulesVersion",
      "adventure",
      "content",
      "adventureSnapshot",
      ...(trace.formatVersion === 6 ? ["startingCharacter"] : []),
      "random",
      "initialState",
      "completion",
      ...(mode === "command" ? ["actions"] : ["dm", "turns"]),
    ],
    "Trace",
  );
  const loaded = loadAdventure(JSON.stringify(trace.adventureSnapshot));
  if (!loaded.ok) {
    throw new Error(
      `Invalid embedded content: ${JSON.stringify(loaded.diagnostics)}`,
    );
  }
  const content = loaded.adventure;
  requireMatch("content identity/digest", trace.content, {
    schemaVersion: content.snapshot.schemaVersion,
    id: content.snapshot.id,
    contentVersion: content.snapshot.contentVersion,
    digest: content.digest,
  });
  requireMatch("adventure identity", trace.adventure, {
    id: content.snapshot.id,
    version: content.snapshot.contentVersion,
  });
  requireSupported(
    trace.rulesVersion,
    content.snapshot.rulesVersion,
    "rules version",
  );
  const random = requireObject(trace.random, "random");
  requireFields(random, ["algorithm", "initialSeed"], "random");
  requireSupported(random.algorithm, RANDOM_ALGORITHM, "random algorithm");
  const seed = requireInteger(random.initialSeed, "random.initialSeed");
  if (seed < 0 || seed > 0xffffffff) {
    throw new Error("random.initialSeed must be an unsigned 32-bit integer.");
  }
  if (
    (trace.formatVersion === 6) !==
    isCharacterSchema(content.snapshot.schemaVersion)
  ) {
    throw new Error("Character trace format does not match content.");
  }
  const runtime = createDataRuntime(
    content,
    trace.formatVersion === 6
      ? validateCharacter(trace.startingCharacter)
      : undefined,
  );
  requireSupported(
    trace.engineVersion,
    runtime.engineVersion as string,
    "engine version",
  );
  const entries = requireArray(
    mode === "command" ? trace.actions : trace.turns,
    mode,
  );
  if (entries.length > 10000) {
    throw new Error("Trace turn-limit: at most 10000 entries are supported.");
  }
  if (mode === "ai") {
    const decoded = validateDmTrace(trace, {
      formatVersion: trace.formatVersion === 6 ? 6 : 4,
      adventureId: runtime.id,
      adventureVersion: runtime.version,
      rulesVersion: runtime.rulesVersion,
      promptVersions: [
        runtime.promptVersion,
        ...TRACE_REPLAY.previousPromptVersions(runtime.promptVersion),
      ],
      toolSchemaVersions: [
        runtime.toolSchemaVersion,
        ...TRACE_REPLAY.previousToolSchemaVersions(runtime.toolSchemaVersion),
      ],
      validateRuntimeState: requireObject,
      resolveRuntime: () => runtime,
      localKinds: [
        "dm",
        "local-help",
        ...([3, 4, 5].includes(content.snapshot.schemaVersion)
          ? ["local-journal" as const]
          : []),
        "local-status",
        "local-inventory",
        "local-quit",
      ],
    });
    for (const [index, turn] of decoded.turns.entries()) {
      const input = turn.rawPlayerInput.trim().toLowerCase();
      const local = [
        "help",
        "status",
        "inventory",
        "quit",
        ...([3, 4, 5].includes(content.snapshot.schemaVersion)
          ? ["journal"]
          : []),
      ].includes(input);
      requireMatch(
        `turn ${index + 1} input routing`,
        turn.kind,
        local ? `local-${input}` : "dm",
      );
    }
    replayDmTrace(decoded, TRACE_REPLAY.replayedPlayerInput);
    return;
  }
  const actions = entries.map((value, index): ReplayAction => {
    const path = `actions[${index}]`;
    const entry = requireObject(value, path);
    requireFields(
      entry,
      ["sequence", "rawInput", "action", "rolls", "result", "stateAfter"],
      path,
    );
    requireMatch(`${path}.sequence`, entry.sequence, index + 1);
    return {
      sequence: index + 1,
      rawInput: requireString(entry.rawInput, `${path}.rawInput`),
      action: requireObject(entry.action, `${path}.action`),
      rolls: requireArray(entry.rolls, `${path}.rolls`).map((roll, number) =>
        validateRoll(roll, `${path}.rolls[${number}]`),
      ),
      result: requireObject(entry.result, `${path}.result`),
      stateAfter: requireObject(entry.stateAfter, `${path}.stateAfter`),
    };
  });
  replayCommandTrace({
    runtime,
    rulesVersion: runtime.rulesVersion,
    initialSeed: seed,
    initialState: requireObject(trace.initialState, "initialState"),
    actions,
    completion: validateCompletion(trace.completion),
  });
}

export async function verifyTraceFile(path: string): Promise<void> {
  const parsed = await readTraceFile(path);
  const envelope = requireObject(parsed, "Trace");
  if (envelope.formatVersion === 5) {
    throw new Error(
      "Format-5 trace segments require --replay with the complete ordered segment list.",
    );
  }
  if (envelope.formatVersion === 4 || envelope.formatVersion === 6) {
    replayFormat4(envelope);
    return;
  }
  if (TRACE_REPLAY.verifyTrace(envelope, TRACE_REPLAY_ENGINE)) {
    return;
  }
  throw new Error(
    `Unsupported trace format version ${JSON.stringify(envelope.formatVersion)}.`,
  );
}

function segmentEntries(trace: JsonObject): JsonObject[] {
  return requireArray(
    trace.mode === "command" ? trace.actions : trace.turns,
    "segment entries",
  ).map((entry, index) => {
    const decoded = requireObject(entry, `segment entry ${index + 1}`);
    requireMatch(
      `segment entry ${index + 1} sequence`,
      decoded.sequence,
      index + 1,
    );
    return decoded;
  });
}

function segmentEndState(trace: JsonObject): unknown {
  return segmentEntries(trace).at(-1)?.stateAfter ?? trace.initialState;
}

async function segmentDigest(path: string): Promise<string> {
  return `sha256:${createHash("sha256")
    .update(await readFile(path))
    .digest("hex")}`;
}

export async function prepareTraceContinuation(
  path: string,
  state: unknown,
  seed: number,
): Promise<{ index: number; previousDigest: string }> {
  const trace = requireObject(await readTraceFile(path), "Previous segment");
  if (trace.formatVersion !== 5) {
    throw new Error(
      "Previous trace must be a format-5 segment; ordinary format-4 traces cannot be spliced.",
    );
  }
  const segment = requireObject(trace.segment, "Previous segment link");
  const index = requireInteger(segment.index, "previous segment index");
  if (index < 0 || (index === 0) !== (segment.previousDigest === null)) {
    throw new Error("Previous segment link is invalid.");
  }
  requireMatch("resume seed", trace.random, {
    algorithm: RANDOM_ALGORITHM,
    initialSeed: seed,
  });
  requireMatch("resume state", segmentEndState(trace), state);
  requireMatch("previous segment completion", trace.completion, {
    reason: "eof",
    outcome:
      state &&
      typeof state === "object" &&
      "status" in state &&
      (state.status === "victory" || state.status === "defeat")
        ? state.status
        : "incomplete",
  });
  return { index: index + 1, previousDigest: await segmentDigest(path) };
}

export async function verifyTraceSegments(
  paths: readonly string[],
): Promise<void> {
  if (paths.length < 2) {
    throw new Error(
      "A resumed journey requires at least two ordered format-5 trace segments.",
    );
  }
  let first: JsonObject | undefined;
  let previous: JsonObject | undefined;
  let previousDigest: string | null = null;
  const entries: JsonObject[] = [];
  for (const [index, path] of paths.entries()) {
    const trace = requireObject(await readTraceFile(path), `Segment ${index}`);
    if (trace.formatVersion !== 5) {
      throw new Error(
        `Segment ${index} is not format 5; ordinary format-4 traces cannot be spliced.`,
      );
    }
    const link = requireObject(trace.segment, `Segment ${index} link`);
    requireFields(link, ["index", "previousDigest"], `Segment ${index} link`);
    requireMatch(`segment ${index} index`, link.index, index);
    requireMatch(
      `segment ${index} previous digest`,
      link.previousDigest,
      previousDigest,
    );
    if (previous !== undefined) {
      for (const key of [
        "mode",
        "engineVersion",
        "rulesVersion",
        "adventure",
        "content",
        "adventureSnapshot",
        "random",
        "dm",
      ]) {
        requireMatch(`segment ${index} ${key}`, trace[key], first?.[key]);
      }
      requireMatch(
        `segment ${index} initial state`,
        trace.initialState,
        segmentEndState(previous),
      );
      const boundaryState = segmentEndState(previous);
      const status = requireObject(
        boundaryState,
        "segment boundary state",
      ).status;
      requireMatch(`segment ${index - 1} completion`, previous.completion, {
        reason: "eof",
        outcome:
          status === "victory" || status === "defeat" ? status : "incomplete",
      });
    }
    first ??= trace;
    previous = trace;
    previousDigest = await segmentDigest(path);
    entries.push(...segmentEntries(trace));
  }
  const mode = first?.mode;
  const key = mode === "command" ? "actions" : "turns";
  const merged: JsonObject = {
    ...first,
    formatVersion: 4,
    completion: previous?.completion,
    [key]: entries.map((entry, index) => ({ ...entry, sequence: index + 1 })),
  };
  delete merged.segment;
  replayFormat4(merged);
}
