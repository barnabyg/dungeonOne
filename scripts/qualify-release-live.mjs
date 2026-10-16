// Opt-in live release run: a module played from start to an ending through
// the 5e browser server, its API and its saves (The Abandoned Delve for #140
// by default, on a generated route since its expansion (#442), played by a
// saved level-2 Ada, or The Thornwood Lodge for #291 with --adventure
// thornwood-lodge, on a generated route since its expansion (#445), played by
// a saved level-4 Ada with 4,100 XP), or, with --generated, any built-in
// module on a route generated from the harness's cautious run on the seed
// (#409), played by the run's saved character or else a saved Ada at the
// module's lowest recommended level (level 3 for the Coldwater Weirgate,
// level 1 for the Bramblecote Cider House, #440),
// every step typed to the configured OpenAI provider (src/release-run-5e.ts). A
// step the AI DM's turn leaves undone is taken with its button and flagged,
// so the run always reaches an ending. Each turn records the message, what
// the DM did, the engine's cards and the reply; a reply to a turn that
// committed nothing is flagged for review when it claims an outcome.
// Provider calls are hard-capped; once the budget is spent, turns fail with
// the engine's own reply and the run finishes by button. Credentials and
// prompts are never recorded.
// Usage: node scripts/qualify-release-live.mjs --live|--dry-run
//          [--adventure <id>] [--output <report.json>] [--max-calls <count>]
//          [--seed <seed>] [--generated]
// --live needs OPENAI_API_KEY. --dry-run substitutes a provider that always
// overclaims, to check the harness itself without credentials or calls.
// A live run keeps its run folder (the character library and saves) under
// .verify-artifacts/issue-<n>-live-*; a dry run plays in a temporary folder it
// removes, and writes only its report (by default
// .verify-artifacts/issue-<n>-dry-run.json, so it never overwrites a live one).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  OUTCOME_CLAIM,
  startAdventureOverHttp,
  startSavedAdventureOverHttp,
} from "../dist/dm-evaluation-5e.js";
import { createDmCallBudget } from "../dist/dm-turn.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "../dist/openai-dm-model.js";
import { generateReleaseRun, playReleaseRun } from "../dist/release-run-5e.js";
import { levelFourCareerLibrary, libraryAt } from "../dist/test-fighter-5e.js";

const USAGE =
  "Usage: node scripts/qualify-release-live.mjs --live|--dry-run [--adventure <id>] [--output <report.json>] [--max-calls <count>] [--seed <seed>] [--generated]";

// Each release run's issue, route and default seed, on which its character
// clears the route and walks out when each step is taken as planned. A run with a
// `character` starts from a library holding it, already saved. A `generated`
// run always plays the route generated on its seed (#409), as --generated
// does, under its own issue.
const RUNS = {
  "abandoned-delve": { issue: 140, generated: true, seed: "0" },
  "thornwood-lodge": {
    issue: 291,
    generated: true,
    seed: "1",
    character: levelFourCareerLibrary,
  },
};
const usage = () => {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
};
const options = { adventure: "abandoned-delve", maxCalls: "160" };
const VALUED = {
  "--adventure": "adventure",
  "--output": "output",
  "--max-calls": "maxCalls",
  "--seed": "seed",
};
let mode;
let generated = false;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--live" || argument === "--dry-run") {
    if (mode !== undefined) {
      usage();
    }
    mode = argument;
  } else if (argument === "--generated") {
    generated = true;
  } else if (Object.hasOwn(VALUED, argument)) {
    const value = args[++index];
    if (value === undefined || value.startsWith("--")) {
      usage();
    }
    options[VALUED[argument]] = value;
  } else {
    usage();
  }
}
const own = RUNS[options.adventure];
generated ||= own?.generated === true;
const adventure = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === options.adventure,
);
if (
  mode === undefined ||
  (generated
    ? adventure === undefined
    : !Object.hasOwn(RUNS, options.adventure))
) {
  usage();
}
// A generated route (#409) is the harness's run with a saved character's
// sheet: the run's own, or else Ada at the module's lowest recommended level.
const run = generated
  ? {
      seed: "0",
      ...own,
      // A run that is always generated keeps its own issue.
      issue: own?.generated ? own.issue : 409,
      character:
        own?.character ?? (() => libraryAt(adventure.recommendedLevels.min)),
    }
  : own;
const dryRun = mode === "--dry-run";
options.output ??= `.verify-artifacts/issue-${run.issue}-${dryRun ? "dry-run" : "live"}.json`;
options.seed ??= run.seed;
if (!dryRun && !process.env.OPENAI_API_KEY?.trim()) {
  process.stderr.write("OPENAI_API_KEY is required for --live.\n");
  process.exit(2);
}
const output = resolve(options.output);
const maxProviderCalls = /^\d+$/u.test(options.maxCalls)
  ? Number(options.maxCalls)
  : 0;
if (maxProviderCalls < 1 || !/^\d+$/u.test(options.seed)) {
  usage();
}
const seed = Number(options.seed);

const root = dryRun ? tmpdir() : resolve(".verify-artifacts");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(
  join(root, `issue-${run.issue}-${dryRun ? "dry-run" : "live"}-`),
);
const provider = dryRun
  ? {
      identity: { provider: "scripted-dry-run", model: "overclaimer" },
      async respond() {
        return {
          text: "You hit the zombie for 12 damage and find the vault key.",
        };
      },
    }
  : createOpenAiDmModel({
      apiKey: process.env.OPENAI_API_KEY,
      model: OPENAI_DM_DEFAULT_MODEL,
    });
const report = {
  issue: run.issue,
  mode: dryRun ? "dry-run" : "live",
  adventureId: options.adventure,
  generated,
  // A dry run's folder is gone once it finishes.
  ...(dryRun ? {} : { runDirectory: relative(process.cwd(), directory) }),
  requestedModel: OPENAI_DM_DEFAULT_MODEL,
  startedAt: new Date().toISOString(),
  seed,
  maxProviderCalls,
  providerCalls: 0,
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  promptVersions: [],
  summary: {},
  turns: [],
};
let calls = [];
const budget = createDmCallBudget(maxProviderCalls);
const limited = budget.limit(provider);
const model = {
  identity: provider.identity,
  async respond(request) {
    const response = await limited.respond(request);
    if (!report.promptVersions.includes(request.promptVersion)) {
      report.promptVersions.push(request.promptVersion);
    }
    for (const key of Object.keys(report.usage)) {
      report.usage[key] += response.provider?.usage?.[key] ?? 0;
    }
    calls.push({
      phase: request.toolResults.length > 0 ? "narration" : "interpretation",
      model: response.provider?.model,
      toolCalls: (response.toolCalls ?? []).map(({ name, argumentsJson }) => ({
        name,
        argumentsJson,
      })),
      ...(response.text === undefined ? {} : { text: response.text }),
    });
    return response;
  },
};

const libraryPath = join(directory, "characters.json");
if (run.character !== undefined) {
  await writeFile(libraryPath, JSON.stringify(run.character()));
}
const server = await startFifthBrowserServer({
  libraryPath,
  seed,
  dmModel: model,
  // This qualifies the AI DM, not the balance gate, which the shipped-module
  // tests check; gating all the built-ins only slowed startup.
  qualifies: () => true,
});
try {
  const { session } = await playReleaseRun({
    url: server.url,
    session: await (
      run.character === undefined
        ? startAdventureOverHttp
        : startSavedAdventureOverHttp
    )(server.url, options.adventure),
    ...(generated
      ? generateReleaseRun(adventure, run.character().characters[0].sheet, {
          seed,
        })
      : { route: run.route }),
    onTurn(turn) {
      report.turns.push({
        ...turn,
        // Needs review: a turn that committed nothing, whose reply claims
        // an outcome.
        reviewClaim:
          turn.reply !== undefined &&
          !turn.committed &&
          OUTCOME_CLAIM.test(turn.reply),
        calls,
      });
      calls = [];
    },
  });
  report.finalStatus = session.status;
  report.finalRoom = session.room.name;
  if (session.ending !== undefined) {
    report.ending = session.ending;
  }
} finally {
  const typed = report.turns.filter(({ message }) => message !== undefined);
  report.summary = {
    turns: report.turns.length,
    typed: typed.length,
    committed: typed.filter(({ committed }) => committed).length,
    matched: typed.filter(({ matched }) => matched).length,
    fallbacks: report.turns.filter(({ fallback }) => fallback).length,
    skipped: report.turns.filter(({ skipped }) => skipped !== undefined).length,
    reviewClaims: report.turns.filter(({ reviewClaim }) => reviewClaim).length,
    roomsVisited: new Set(report.turns.map(({ room }) => room)).size,
  };
  report.providerCalls = budget.calls();
  report.finishedAt = new Date().toISOString();
  await server.close();
  if (dryRun) {
    await rm(directory, { recursive: true, force: true });
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(
    `Wrote ${relative(process.cwd(), output)}: ${report.turns.length} turns, ${report.providerCalls} of at most ${maxProviderCalls} provider calls, ${report.ending?.title ?? report.finalStatus}.\n`,
  );
}
