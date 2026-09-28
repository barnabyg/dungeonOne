import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { proveGenerationRoutes } from "../dist/generation-routes.js";
import { createOpenAiDmModel } from "../dist/openai-dm-model.js";
import { createSeededRandom } from "../dist/random.js";

const cases = [
  {
    sample: "investigation",
    ending: "launch-search",
    stage: "start",
    input: "What can I learn here about the missing surveyor?",
  },
  {
    sample: "investigation",
    ending: "launch-search",
    stage: "ready",
    input: "I choose to launch the harbor search.",
  },
  {
    sample: "rescue",
    ending: "send-dispatch",
    stage: "start",
    input: "Has Tovin been freed yet?",
  },
  {
    sample: "rescue",
    ending: "send-dispatch",
    stage: "start",
    input: "What did Mira see at dawn?",
  },
  {
    sample: "rescue",
    ending: "send-dispatch",
    stage: "freed",
    input: "Where is Tovin now?",
  },
  {
    sample: "rescue",
    ending: "send-dispatch",
    stage: "ready",
    input: "I choose to send the dispatch quietly.",
  },
  {
    sample: "negotiation",
    ending: "clear-willowbank",
    stage: "start",
    input: "I return the bell to Brackenford and clear Willowbank.",
  },
  {
    sample: "negotiation",
    ending: "clear-willowbank",
    stage: "ready",
    input: "Settle the dispute.",
  },
  {
    sample: "negotiation",
    ending: "clear-willowbank",
    stage: "ready",
    input: "I choose to return the bell and clear Willowbank.",
  },
];

const selectedCase = process.argv[2] === "--case" ? process.argv[3] : undefined;
if (
  (process.argv.length !== 2 &&
    (process.argv.length !== 4 || selectedCase === undefined)) ||
  (selectedCase !== undefined &&
    !cases.some((item) => `${item.sample}:${item.stage}` === selectedCase))
) {
  throw new Error(
    "Usage: node scripts/eval-generated-dm.mjs [--case sample:stage]",
  );
}
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is required for the generated DM evaluation.",
  );
}
const output = resolve(
  selectedCase === undefined
    ? ".dm-evaluations/issue-60-generated.json"
    : `.dm-evaluations/issue-60-${selectedCase.replace(":", "-")}-rerun.json`,
);
const modelId = "gpt-5.6-luna";
const report = { model: modelId, cases: [] };
for (const item of cases.filter(
  (entry) =>
    selectedCase === undefined ||
    `${entry.sample}:${entry.stage}` === selectedCase,
)) {
  const file = resolve(`docs/acceptance/issue-60-samples/${item.sample}.json`);
  const bytes = await readFile(file);
  const loaded = loadAdventure(bytes);
  if (!loaded.ok) {
    throw new Error(`Invalid sample: ${item.sample}`);
  }
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  if (!routes.ok) {
    throw new Error(`Unwitnessed sample: ${item.sample}`);
  }
  const witness = routes.evidence.endings[item.ending];
  const runtime = createDataRuntime(loaded.adventure);
  const random = createSeededRandom(witness.seed);
  let state = runtime.createSession();
  const setupActions =
    item.stage === "ready"
      ? witness.steps.slice(0, -1)
      : item.stage === "freed"
        ? witness.steps.slice(
            0,
            witness.steps.findIndex(
              ({ action }) =>
                action.name === "search" &&
                JSON.parse(action.argumentsJson).target === "jammed-hatch",
            ) + 1,
          )
        : [];
  if (item.stage === "freed" && setupActions.length === 0) {
    throw new Error("Missing courier rescue witness.");
  }
  if (setupActions.length > 0) {
    for (const step of setupActions) {
      const result = runtime.dispatchGameTool(state, step.action, random);
      if (!result.modelOutput.ok) {
        throw new Error(`Invalid setup: ${item.sample}`);
      }
      state = result.state;
    }
  }
  const requests = [];
  const responses = [];
  const liveModel = createOpenAiDmModel({
    apiKey: process.env.OPENAI_API_KEY,
    model: modelId,
  });
  const model = {
    async respond(request) {
      requests.push({
        playerInput: request.playerInput,
        scene: request.scene,
        characterStatus: request.characterStatus,
        tools: request.tools.map(({ name, parameters }) => ({
          name,
          parameters,
        })),
        toolResults: request.toolResults,
      });
      const response = await liveModel.respond(request);
      responses.push({
        ...(response.provider === undefined
          ? {}
          : {
              actualModel: response.provider.model,
              status: response.provider.status,
            }),
        ...("toolCalls" in response
          ? { toolCalls: response.toolCalls }
          : { text: response.text }),
      });
      return response;
    },
  };
  const before = {
    locationId: state.locationId,
    status: state.status,
    discoveries: state.discoveries,
    milestones: state.milestones,
  };
  const result = await runDmTurn({
    state,
    playerInput: item.input,
    transcript: [],
    random,
    model,
    runtime,
  });
  report.cases.push({
    sample: item.sample,
    stage: item.stage,
    input: item.input,
    contentId: runtime.id,
    contentVersion: runtime.version,
    contentDigest: loaded.adventure.digest,
    fileSha256: createHash("sha256").update(bytes).digest("hex"),
    seed: witness.seed,
    setupActions: setupActions.map(({ action }) => action),
    engineVersion: runtime.engineVersion,
    rulesVersion: runtime.rulesVersion,
    promptVersion: runtime.promptVersion,
    toolSchemaVersion: runtime.toolSchemaVersion,
    requests,
    responses,
    toolAttempts: result.toolAttempts,
    diagnostics: result.diagnostics,
    narration: result.narration,
    before,
    after: {
      locationId: result.state.locationId,
      status: result.state.status,
      endingId: result.state.ending?.id,
      discoveries: result.state.discoveries,
      milestones: result.state.milestones,
    },
  });
  await mkdir(dirname(output), { recursive: true });
  const content = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(content) > 1024 * 1024) {
    throw new Error("DM report limit exceeded.");
  }
  await writeFile(output, content);
  process.stdout.write(
    `${item.sample} ${item.stage}: ${result.state.status}, ${result.diagnostics.map(({ code }) => code).join(",") || "no diagnostic"}\n`,
  );
}
