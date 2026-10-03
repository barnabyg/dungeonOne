// Opt-in issue #110 live check: typed "look over / read through / study"
// requests and an Examine click in Hollow Beacon v13, through the shipped HTTP
// server and save authority with the configured OpenAI provider. The #94
// journey is first played with the scripted journey interpreter (no provider
// calls), saving a copy of the library just before the plate, the work order
// and the warning board. Each trial then runs once on its own copy of its
// checkpoint, so every trial starts from the same saved position.
// Hard-capped provider calls; never records credentials or full prompts.
// Usage: node scripts/qualify-examine-live.mjs [report.json] [maxCalls]
//   [--dry-run]
// --dry-run uses the scripted interpreter for the trials too, to check the
// harness itself without credentials or provider calls.
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { startBrowserServer } from "../dist/browser-server.js";
import { BROWSER_START_VERSION } from "../dist/browser-releases.js";
import { browserActions } from "../dist/browser-actions.js";
import { CharacterCareer } from "../dist/character-career.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "../dist/openai-dm-model.js";
import { SaveSession } from "../dist/save.js";
import {
  JOURNEY_SEED,
  combatPhrases,
  interpretJourneyMessage,
  journey,
} from "../tests/fixtures/issue-94-journey.mjs";

const dryRun = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!dryRun && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required.");
}
const output = resolve(args[0] ?? ".verify-artifacts/issue-110-live.json");
const maxProviderCalls = Number(args[1] ?? 24);
const root = resolve(".verify-artifacts");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "issue-110-live-"));
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const step = (id) => journey.find((entry) => entry.id === id);
/** Trials in run order: [checkpoint step id, typed message or click]. */
const trials = [
  ["plate", { say: step("plate").say }],
  ["plate", { say: step("plate").say }],
  ["plate", { say: step("plate").say }],
  ["plate", { click: "Examine beacon setting plate" }],
  ["work-order", { say: step("work-order").say }],
  ["work-order", { say: step("work-order").say }],
  ["board", { say: step("board").say }],
  ["board", { say: step("board").say }],
];
const checkpoints = [...new Set(trials.map(([id]) => id))];

/** The #94 scripted interpreter, reading the offered options from the save. */
const scripted = (libraryPath) => ({
  identity: { provider: "scripted", model: "issue-94-journey" },
  async respond(request) {
    if ("reply" in request) {
      return {
        text: JSON.stringify({
          delivery: "steady",
          opening: "none",
          closing: "none",
          factIds: request.reply.approvedFacts.map(({ id }) => id),
        }),
      };
    }
    if (request.toolResults.length) {
      return { text: "The result card below is what happened." };
    }
    const career = new CharacterCareer(libraryPath);
    const session = await SaveSession.load(
      career.sessionPath((await career.library.read()).selectedSessionId),
    );
    const selected = interpretJourneyMessage(
      request.playerInput,
      browserActions(session, "scripted"),
    );
    return selected === undefined
      ? { text: "Which offered action do you mean?" }
      : {
          toolCalls: [
            {
              id: "scripted",
              name: selected.name,
              argumentsJson: JSON.stringify(selected.arguments),
            },
          ],
        };
  },
});
const live = dryRun
  ? undefined
  : createOpenAiDmModel({
      apiKey: process.env.OPENAI_API_KEY,
      model: OPENAI_DM_DEFAULT_MODEL,
    });

const report = {
  issue: 110,
  mode: dryRun ? "dry-run" : "live",
  runDirectory: relative(process.cwd(), directory),
  requestedModel: OPENAI_DM_DEFAULT_MODEL,
  startedAt: new Date().toISOString(),
  seed: JOURNEY_SEED,
  maxProviderCalls,
  checkpoints: {},
  calls: [],
  trials: [],
};
const liveCalls = () => report.calls.length;

/** Wraps the trial provider: hard budget and a per-call record. */
const recorded = (provider, trial) => ({
  identity: provider.identity,
  async respond(request) {
    if (liveCalls() >= maxProviderCalls) {
      throw new Error("Qualification provider budget exhausted");
    }
    const call = {
      trial,
      phase:
        "reply" in request
          ? "npc-reply"
          : request.toolResults.length
            ? "narration"
            : "interpretation",
      input: request.playerInput,
      promptVersion: request.promptVersion,
      systemPromptDigest: digest(request.systemPrompt),
      toolSchemaDigest: digest(request.tools),
      tools: request.tools.map(({ name }) => name),
    };
    report.calls.push(call);
    const start = performance.now();
    try {
      const response = await provider.respond(request);
      call.reportedModel = response.provider?.model ?? null;
      call.usage = response.provider?.usage ?? null;
      call.toolCalls = (response.toolCalls ?? []).map(
        ({ name, argumentsJson }) => ({ name, argumentsJson }),
      );
      call.text = response.text ?? null;
      return response;
    } catch (error) {
      call.error = error.message;
      throw error;
    } finally {
      call.latencyMs = Math.round(performance.now() - start);
    }
  },
});

async function withServer(libraryDirectory, dmModel, body) {
  const server = await startBrowserServer({
    contentVersion: BROWSER_START_VERSION,
    savePath: join(libraryDirectory, "unused-slot.json"),
    libraryPath: join(libraryDirectory, "characters.json"),
    seed: JOURNEY_SEED,
    apiKey: process.env.OPENAI_API_KEY ?? "dry-run",
    dmModel,
  });
  const api = async (path, body) => {
    const response = await fetch(server.url + path, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              Origin: server.url,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }),
    });
    return response.json();
  };
  try {
    return await body(api);
  } finally {
    await server.close();
  }
}
const turn = async (api, body) =>
  api("/api/turn", { revision: (await api("/api/state")).revision, ...body });
const option = async (api, message) => {
  const found = (await api("/api/state")).actions.find(
    (action) => action.message === message,
  );
  if (found === undefined) {
    throw new Error("Option not offered: " + message);
  }
  return found;
};
const discoveries = (view) =>
  (view.scene.journal?.discoveries ?? []).map(({ id }) => id);

// Setup: the #94 journey, scripted with no provider calls, copying the
// library just before each checkpoint step. The server restarts between
// segments, as rerunning the launcher does, so each copy is at rest.
const base = join(directory, "journey");
const scriptedBase = scripted(join(base, "characters.json"));
await withServer(base, scriptedBase, async (api) => {
  const created = (
    await api("/api/characters/create", {
      name: "Ada",
      preset: "balanced",
      revision: (await api("/api/characters")).revision,
    })
  ).library;
  await api("/api/characters/play", {
    characterId: created.characters[0].sheet.id,
    adventureId: "hollow-beacon",
    revision: created.revision,
    confirmed: true,
  });
});
let next = 0;
for (const checkpoint of checkpoints) {
  const until = journey.findIndex(({ id }) => id === checkpoint);
  await withServer(base, scriptedBase, async (api) => {
    for (const entry of journey.slice(next, until)) {
      const result = entry.click
        ? await turn(api, { optionId: (await option(api, entry.click)).id })
        : await turn(api, { message: entry.say });
      if (!result.committed) {
        throw new Error(`Setup step ${entry.id} did not commit.`);
      }
      for (
        let round = 0;
        entry.untilCombatEnds && (await api("/api/state")).scene.combat;
        round += 1
      ) {
        await turn(api, {
          message: combatPhrases[round % combatPhrases.length],
        });
      }
    }
    const view = await api("/api/state");
    report.checkpoints[checkpoint] = {
      location: view.scene.room.name,
      position: view.position,
      examineOptions: view.actions
        .filter(({ call }) => call.name === "examine")
        .map(({ message }) => message),
    };
  });
  await cp(base, join(directory, `at-${checkpoint}`), { recursive: true });
  next = until;
}

// Trials: each once, from its own copy of its checkpoint.
try {
  for (const [index, [checkpoint, request]] of trials.entries()) {
    const trialDirectory = join(directory, `trial-${index + 1}`);
    await cp(join(directory, `at-${checkpoint}`), trialDirectory, {
      recursive: true,
    });
    const expected = step(checkpoint).call;
    const firstCall = liveCalls();
    const start = performance.now();
    await withServer(
      trialDirectory,
      recorded(
        live ?? scripted(join(trialDirectory, "characters.json")),
        index + 1,
      ),
      async (api) => {
        const before = await api("/api/state");
        const result =
          request.click === undefined
            ? await turn(api, { message: request.say })
            : await turn(api, {
                optionId: (await option(api, request.click)).id,
              });
        const after = await api("/api/state");
        const selected = report.calls
          .slice(firstCall)
          .flatMap(({ toolCalls }) => toolCalls ?? []);
        report.trials.push({
          trial: index + 1,
          checkpoint,
          ...request,
          expected,
          committed: result.committed,
          matchedExpected: selected.some(
            ({ name, argumentsJson }) =>
              name === expected.name &&
              JSON.stringify(JSON.parse(argumentsJson)) ===
                JSON.stringify(expected.arguments),
          ),
          clarification: !result.committed && selected.length === 0,
          selectedCalls: selected,
          newDiscoveries: discoveries(after).filter(
            (id) => !discoveries(before).includes(id),
          ),
          positionBefore: before.position,
          positionAfter: after.position,
          reply: result.reply,
          cards: result.cards,
          notice: result.notice ?? null,
          providerCalls: liveCalls() - firstCall,
          latencyMs: Math.round(performance.now() - start),
        });
        console.log(
          JSON.stringify({
            trial: index + 1,
            committed: result.committed,
            calls: liveCalls(),
          }),
        );
      },
    );
  }
} catch (error) {
  report.error = error.message;
} finally {
  report.finishedAt = new Date().toISOString();
  report.providerCalls = liveCalls();
  report.tokens = report.calls.reduce(
    (sum, { usage }) => ({
      input: sum.input + (usage?.inputTokens ?? usage?.input_tokens ?? 0),
      output: sum.output + (usage?.outputTokens ?? usage?.output_tokens ?? 0),
    }),
    { input: 0, output: 0 },
  );
  report.reportedModels = [
    ...new Set(report.calls.map(({ reportedModel }) => reportedModel)),
  ];
  report.committedFirstTime = report.trials.filter(
    ({ committed, matchedExpected }) => committed && matchedExpected,
  ).length;
  report.clarifications = report.trials.filter(
    ({ clarification }) => clarification,
  ).length;
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      output: relative(process.cwd(), output),
      trials: report.trials.length,
      committed: report.committedFirstTime,
      clarifications: report.clarifications,
      calls: report.providerCalls,
      error: report.error ?? null,
    }),
  );
}
if (report.error !== undefined) {
  process.exitCode = 1;
}
