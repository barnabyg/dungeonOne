import { createCharacterRuntime } from "./character-runtime.js";
import type { CharacterSheet } from "./character-rules.js";
import { createChapelCluesRuntime } from "./chapel-clues-runtime.js";
import { createExplorationRuntime } from "./exploration-runtime.js";
import { createSignetRuntime } from "./signet-runtime.js";
import {
  isCharacterSchema,
  type ValidatedAdventure,
} from "./adventure-loader.js";
import type { AdventureRuntime as LegacyAdventureRuntime } from "./legacy-runtime-contract.js";
import type { AdventureRuntime } from "./runtime-contract.js";

/**
 * The runtime registry: the only module that selects a runtime implementation.
 * Shared infrastructure obtains runtimes here and uses them only through the
 * generic AdventureRuntime interface; it never imports a runtime module.
 */
export function createDataRuntime(
  content: ValidatedAdventure,
  character?: CharacterSheet,
): AdventureRuntime {
  return createLegacyDataRuntime(content, character);
}

/** For old-game modules that need the pre-5e runtimes' own unions. */
export function createLegacyDataRuntime(
  content: ValidatedAdventure,
  character?: CharacterSheet,
): LegacyAdventureRuntime {
  if (isCharacterSchema(content.snapshot.schemaVersion)) {
    return createCharacterRuntime(content, character);
  }
  switch (content.snapshot.schemaVersion) {
    case 2:
      return createSignetRuntime(content);
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
    case 9:
    case 16:
    case 15:
    case 14:
    case 13:
    case 12:
    case 11:
    case 10:
      return createChapelCluesRuntime(content);
    default:
      return createExplorationRuntime(content);
  }
}

export { LEGACY_TRACE_REPLAY as TRACE_REPLAY } from "./legacy-replay.js";
