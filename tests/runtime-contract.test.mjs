// The generic runtime interface (#126): the lint boundary keeps shared
// infrastructure free of the 5e game. dm-turn.test.mjs exercises the shared
// AI DM turn on the counter fixture runtime.
import assert from "node:assert/strict";
import test from "node:test";

import { ESLint } from "eslint";

test("the lint boundary keeps shared infrastructure free of the 5e game", async () => {
  const eslint = new ESLint({ overrideConfigFile: "eslint.style.config.mjs" });
  const code =
    'import type { FifthState } from "./runtime-5e.js";\n' +
    'export { loadFifthAdventure } from "./adventure-5e.js";\n' +
    'export type { AdventureRuntime } from "./runtime-contract.js";\n' +
    "export type Shared = FifthState;\n";
  const [shared] = await eslint.lintText(code, { filePath: "src/dm-turn.ts" });
  assert.deepEqual(
    shared.messages.map(({ ruleId, line }) => [ruleId, line]),
    [
      ["no-restricted-imports", 1],
      ["no-restricted-imports", 2],
    ],
  );
  const [game] = await eslint.lintText(code, {
    filePath: "src/session-5e.ts",
  });
  assert.deepEqual(game.messages, []);
});
