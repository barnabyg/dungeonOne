import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import {
  OPENAI_DM_DEFAULT_MODEL,
  createOpenAiDmModel,
} from "../dist/openai-dm-model.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required.");
}

const modelId = process.argv[2] ?? OPENAI_DM_DEFAULT_MODEL;
const cases = [
  [
    "barricade",
    "bribed-crossroads",
    ["move square"],
    "Wedge the market cart across the short passage.",
  ],
  [
    "distraction",
    "bribed-crossroads",
    ["move cellar"],
    "Rattle the heavy crate to draw the guard away.",
  ],
  ["deception", "bribed-crossroads", [], "Tell Lysa Neri escaped."],
  [
    "offer",
    "bribed-crossroads",
    ["move cellar", "take tonic"],
    "Present the tonic to the guard.",
  ],
  [
    "follow",
    "day-raider-crossroads",
    ["move square", "move cellar", "wait days 1"],
    "Trail the guard.",
  ],
  [
    "ambiguous",
    "bribed-crossroads",
    ["move square"],
    "Should I barricade the passage?",
  ],
  [
    "destructive",
    "bribed-crossroads",
    ["move square"],
    "Burn down the stone hall.",
  ],
  [
    "compound",
    "bribed-crossroads",
    ["move cellar"],
    "Rattle the heavy crate to distract the guard, then attack him.",
  ],
];

const report = {
  issue: 79,
  requestedModel: modelId,
  cases: [],
};

for (const [id, file, commands, playerInput] of cases) {
  const bytes = await readFile(path.join("adventures", `${file}.json`));
  const loaded = loadAdventure(bytes.toString("utf8"));
  if (!loaded.ok) {
    throw new Error(JSON.stringify(loaded.diagnostics));
  }
  const runtime = createDataRuntime(loaded.adventure);
  let state = runtime.createSession();
  for (const text of commands) {
    const result = runtime.handleAction(state, runtime.parseCommand(text), {
      roll: () => 20,
    });
    if (result.rejection) {
      throw new Error(`${id}: ${runtime.renderResult(result)}`);
    }
    state = result.state;
  }
  const requests = [];
  const provider = [];
  const live = createOpenAiDmModel({
    apiKey: process.env.OPENAI_API_KEY,
    model: modelId,
  });
  const model = {
    identity: live.identity,
    async respond(request) {
      requests.push({
        promptVersion: request.promptVersion,
        systemPrompt: request.systemPrompt,
        tools: request.tools,
        scene: request.scene,
        history: request.history,
        toolResults: request.toolResults,
      });
      const response = await live.respond(request);
      provider.push(response.provider ?? null);
      return response;
    },
  };
  const result = await runDmTurn({
    runtime,
    state,
    playerInput,
    transcript: [],
    random: { roll: () => 20 },
    model,
  });
  report.cases.push({
    id,
    input: playerInput,
    setup: commands,
    content: {
      id: runtime.id,
      version: runtime.version,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    rulesVersion: runtime.rulesVersion,
    engineVersion: runtime.engineVersion,
    promptVersion: runtime.promptVersion,
    toolSchemaVersion: runtime.toolSchemaVersion,
    requestedModel: modelId,
    provider,
    requests,
    attempts: result.toolAttempts.map(({ call, disposition }) => ({
      call,
      disposition,
    })),
    mechanics: result.mechanics,
    narration: result.narration,
    diagnostics: result.diagnostics,
    stateChanged: JSON.stringify(result.state) !== JSON.stringify(state),
  });
}

const output = path.join(
  ".dm-evaluations",
  `issue-79-${modelId.replaceAll(/[^A-Za-z0-9._-]/gu, "_")}.json`,
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${output}\n`);
