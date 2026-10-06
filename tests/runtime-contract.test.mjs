// The generic runtime interface (#126), exercised through shared
// infrastructure with the counter fixture runtime.
import assert from "node:assert/strict";
import test from "node:test";

import { ESLint } from "eslint";

import { runDmTurn } from "../dist/dm-turn.js";
import { counterRuntime } from "./fixtures/counter-runtime.mjs";

test("the AI DM turn offers the runtime's tools and resolves its mutation with engine dice", async () => {
  const runtime = counterRuntime();
  const requests = [];
  const responses = [
    { toolCalls: [{ id: "call-1", name: "advance", argumentsJson: "{}" }] },
    { text: "The counter clicks forward." },
  ];
  const result = await runDmTurn({
    state: runtime.createSession(),
    playerInput: "Push the counter.",
    transcript: [],
    random: { roll: (sides) => (sides === 6 ? 4 : 1) },
    runtime,
    model: {
      async respond(request) {
        requests.push(request);
        return responses.shift();
      },
    },
  });
  assert.deepEqual(
    requests[0].tools.map(({ name }) => name),
    ["look", "inspect", "get_character_status", "advance", "finish"],
  );
  assert.equal(requests[0].promptVersion, "counter-dm-v1");
  assert.equal(requests[0].systemPrompt, "Counter DM instructions.");
  assert.equal(requests[0].scene.room.description, "The counter reads 0.");
  assert.deepEqual(result.state, { status: "playing", count: 4 });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.narration, "The counter clicks forward.");
  assert.deepEqual(
    result.toolResults.map(({ call, rolls }) => [call.name, rolls]),
    [["advance", [{ sides: 6, value: 4 }]]],
  );
});

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
