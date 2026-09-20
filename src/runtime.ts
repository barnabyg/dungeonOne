// Startup selection is deliberately separate from persisted replay selection.
// Until data-runtime parity is established, ordinary play uses these frozen
// implementations as well. Never derive a historical identity from this default.
import { CHAPEL_ID } from "./chapel.js";
import { CHAPEL_RUNTIME, STOLEN_SIGNET_RUNTIME } from "./historical-runtime.js";
import type { AdventureRuntime } from "./runtime-contract.js";
export type { AdventureRuntime } from "./runtime-contract.js";
export {
  ADVENTURE_VERSION,
  RULES_VERSION,
  LEGACY_ADVENTURE_VERSION,
  LEGACY_RULES_VERSION,
  resolveHistoricalAdventure,
  type ReplayRuntime,
} from "./historical-runtime.js";

export const DEFAULT_ADVENTURE_ID = CHAPEL_ID;

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
