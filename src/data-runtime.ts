import { createChapelCluesRuntime } from "./chapel-clues-runtime.js";
import { createExplorationRuntime } from "./exploration-runtime.js";
import { createSignetRuntime } from "./signet-runtime.js";
import type { ValidatedAdventure } from "./adventure-loader.js";
import type { AdventureRuntime } from "./runtime-contract.js";

export function createDataRuntime(
  content: ValidatedAdventure,
): AdventureRuntime {
  switch (content.snapshot.schemaVersion) {
    case 2:
      return createSignetRuntime(content);
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return createChapelCluesRuntime(content);
    default:
      return createExplorationRuntime(content);
  }
}
