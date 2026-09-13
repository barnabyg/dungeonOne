import { ADVENTURE } from "./adventure.js";
import {
  dispatchGameTool,
  getGameToolDefinitions,
  projectCharacterStatus,
  projectDmScene,
} from "./game-tools.js";
import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import { createSession, handleAction } from "./session.js";
import type { SessionState, ActionResult } from "./session.js";
import {
  CHAPEL_ID,
  CHAPEL_VERSION,
  CHAPEL_RULES_VERSION,
  CHAPEL_TOOL_VERSION,
  CHAPEL_PROMPT_VERSION,
  createChapelSession,
  handleChapelAction,
  renderChapelIntroduction,
  renderChapelResult,
  type ChapelState,
  type ChapelResult,
} from "./chapel.js";
import {
  dispatchChapelTool,
  getChapelTools,
  projectChapelScene,
  projectChapelStatus,
} from "./chapel-tools.js";
import { GAME_TOOL_SCHEMA_VERSION } from "./game-tools.js";
import type { AdventureRuntime, RuntimeState } from "./runtime-contract.js";
export type { AdventureRuntime } from "./runtime-contract.js";

export const LEGACY_RULES_VERSION = "stolen-signet-rules-v1";
export const LEGACY_ADVENTURE_VERSION = "1";
export const RULES_VERSION = "stolen-signet-rules-v2";
export const ADVENTURE_VERSION = "2";

// These modules are the original signet implementation. Keep its persisted state
// and event shapes intact; selection belongs to the session's runtime, not state.
function signetState(state: RuntimeState): SessionState {
  if ("adventureId" in state) {
    throw new Error("State does not belong to stolen-signet.");
  }
  return state;
}

function chapelState(state: RuntimeState): ChapelState {
  if (!("adventureId" in state) || state.adventureId !== CHAPEL_ID) {
    throw new Error("State does not belong to chapel.");
  }
  return state;
}

const STOLEN_SIGNET_RUNTIME: AdventureRuntime = Object.freeze({
  id: ADVENTURE.id,
  version: ADVENTURE_VERSION,
  rulesVersion: RULES_VERSION,
  promptVersion: "stolen-signet-dm-v3",
  toolSchemaVersion: GAME_TOOL_SCHEMA_VERSION,
  commandTraceFormatVersion: 1,
  dmTraceFormatVersion: 2,
  createSession,
  handleAction: (state, action, random) =>
    handleAction(signetState(state), action, random),
  parseCommand,
  renderIntroduction,
  renderResult: (result) => {
    signetState(result.state);
    // Results and states are paired by this runtime at the orchestration boundary.
    return renderResult(result as ActionResult);
  },
  dispatchGameTool: (state, call, random) =>
    dispatchGameTool(signetState(state), call, random),
  getGameToolDefinitions: (state) => getGameToolDefinitions(signetState(state)),
  projectCharacterStatus: (state) => projectCharacterStatus(signetState(state)),
  projectDmScene: (state) => projectDmScene(signetState(state)),
});

const CHAPEL_RUNTIME: AdventureRuntime = Object.freeze({
  id: CHAPEL_ID,
  version: CHAPEL_VERSION,
  rulesVersion: CHAPEL_RULES_VERSION,
  promptVersion: CHAPEL_PROMPT_VERSION,
  toolSchemaVersion: CHAPEL_TOOL_VERSION,
  commandTraceFormatVersion: 3,
  dmTraceFormatVersion: 3,
  systemPrompt: `You are the Dungeon Master for The Bell Beneath the Chapel.

The game engine is authoritative. Use only offered tools and public structured context. Never invent or reveal hidden facts, outcomes, items, people, or locations. Never claim a state change unless the current tool result confirms it. This build supports public inspection and travel only; explain unavailable actions honestly. Narrate concisely in the second person.`,
  createSession: createChapelSession,
  handleAction: (state, action) =>
    handleChapelAction(chapelState(state), action),
  parseCommand,
  renderIntroduction: renderChapelIntroduction,
  renderResult: (result) => {
    chapelState(result.state);
    return renderChapelResult(result as ChapelResult);
  },
  dispatchGameTool: (state, call) =>
    dispatchChapelTool(chapelState(state), call),
  getGameToolDefinitions: (state) => getChapelTools(chapelState(state)),
  projectCharacterStatus: (state) => projectChapelStatus(chapelState(state)),
  projectDmScene: (state) => projectChapelScene(chapelState(state)),
});

export function resolveAdventure(id = "stolen-signet"): AdventureRuntime {
  if (id === "chapel") {
    return CHAPEL_RUNTIME;
  }
  if (id !== "stolen-signet") {
    throw new Error(
      `Unknown adventure ${JSON.stringify(id)}. Available adventures: stolen-signet, chapel.`,
    );
  }
  return STOLEN_SIGNET_RUNTIME;
}

export type ReplayRuntime = Pick<
  AdventureRuntime,
  "createSession" | "parseCommand" | "handleAction" | "dispatchGameTool"
>;

// Explicit historical mapping: never consult the startup default for an export.
// Format, RNG, prompt and tool versions are validated by the replay decoder.
export function resolveHistoricalAdventure(
  rulesVersion: string,
  adventureVersion: string,
  adventureId: string = ADVENTURE.id,
): ReplayRuntime {
  if (
    adventureId === CHAPEL_ID &&
    rulesVersion === CHAPEL_RULES_VERSION &&
    adventureVersion === CHAPEL_VERSION
  ) {
    return CHAPEL_RUNTIME;
  }
  if (adventureId !== ADVENTURE.id) {
    throw new Error(
      `Unsupported historical runtime: ${adventureId}/${rulesVersion}/${adventureVersion}.`,
    );
  }
  if (
    rulesVersion === RULES_VERSION &&
    adventureVersion === ADVENTURE_VERSION
  ) {
    return STOLEN_SIGNET_RUNTIME;
  }
  if (
    rulesVersion === LEGACY_RULES_VERSION &&
    adventureVersion === LEGACY_ADVENTURE_VERSION
  ) {
    return Object.freeze({
      createSession,
      parseCommand,
      dispatchGameTool: STOLEN_SIGNET_RUNTIME.dispatchGameTool,
      handleAction(state, action, random) {
        if (
          action.type === "inspect" &&
          action.target?.trim().toLowerCase() ===
            ADVENTURE.opponents.goblin.name
        ) {
          return {
            state,
            rejection: { reason: "invisible-target", target: "goblin" },
          };
        }
        return handleAction(signetState(state), action, random);
      },
    });
  }
  throw new Error(
    `Unsupported historical runtime: ${rulesVersion}/${adventureVersion}.`,
  );
}
