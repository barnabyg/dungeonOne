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

export const LEGACY_RULES_VERSION = "stolen-signet-rules-v1";
export const LEGACY_ADVENTURE_VERSION = "1";
export const RULES_VERSION = "stolen-signet-rules-v2";
export const ADVENTURE_VERSION = "2";

// These modules are the original signet implementation. Keep its persisted state
// and event shapes intact; selection belongs to the session's runtime, not state.
const STOLEN_SIGNET_RUNTIME = Object.freeze({
  id: ADVENTURE.id,
  version: ADVENTURE_VERSION,
  rulesVersion: RULES_VERSION,
  createSession,
  handleAction,
  parseCommand,
  renderIntroduction,
  renderResult,
  dispatchGameTool,
  getGameToolDefinitions,
  projectCharacterStatus,
  projectDmScene,
});

export type AdventureRuntime = typeof STOLEN_SIGNET_RUNTIME;

export function resolveAdventure(id = "stolen-signet"): AdventureRuntime {
  if (id !== "stolen-signet") {
    throw new Error(
      `Unknown adventure ${JSON.stringify(id)}. Available adventures: stolen-signet.`,
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
): ReplayRuntime {
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
      dispatchGameTool,
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
        return handleAction(state, action, random);
      },
    });
  }
  throw new Error(
    `Unsupported historical runtime: ${rulesVersion}/${adventureVersion}.`,
  );
}
