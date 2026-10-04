import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadAdventure } from "./adventure-loader.js";
import { createDataRuntime } from "./data-runtime.js";
import type { AdventureRuntime } from "./runtime-contract.js";
export type { AdventureRuntime } from "./runtime-contract.js";

export const DEFAULT_ADVENTURE_ID = "chapel";

const BUILTIN_FILES = {
  chapel: "chapel-clues.json",
  "stolen-signet": "stolen-signet.json",
} as const;

export function resolveAdventure(id = DEFAULT_ADVENTURE_ID): AdventureRuntime {
  if (!Object.hasOwn(BUILTIN_FILES, id)) {
    throw new Error(
      `Unknown adventure ${JSON.stringify(id)}. Available adventures: stolen-signet, chapel.`,
    );
  }
  const filename = BUILTIN_FILES[id as keyof typeof BUILTIN_FILES];
  const path = fileURLToPath(
    new URL(`../adventures/${filename}`, import.meta.url),
  );
  const result = loadAdventure(readFileSync(path));
  if (!result.ok) {
    throw new Error(
      `Invalid bundled adventure ${filename}: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return createDataRuntime(result.adventure);
}
