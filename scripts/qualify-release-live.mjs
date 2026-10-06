// Opt-in issue #140 live release run: The Abandoned Delve played from start
// to an ending through the 5e browser server, its API and its saves, every
// step typed to the configured OpenAI provider (src/release-run-5e.ts). A
// step the AI DM's turn leaves undone is taken with its button and flagged,
// so the run always reaches an ending. Each turn records the message, what
// the DM did, the engine's cards and the reply; a reply to a turn that
// committed nothing is flagged for review when it claims an outcome.
// Provider calls are hard-capped; once the budget is spent, turns fail with
// the engine's own reply and the run finishes by button. Credentials and
// prompts are never recorded.
// Usage: node scripts/qualify-release-live.mjs --live|--dry-run
//          [--output <report.json>] [--max-calls <count>] [--seed <seed>]
// --live needs OPENAI_API_KEY. --dry-run substitutes a provider that always
// overclaims, to check the harness itself without credentials or calls.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { OUTCOME_CLAIM, startDelveOverHttp } from "../dist/dm-evaluation-5e.js";
import { createDmCallBudget } from "../dist/dm-turn.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "../dist/openai-dm-model.js";
import { playReleaseRun } from "../dist/release-run-5e.js";

const USAGE =
  "Usage: node scripts/qualify-release-live.mjs --live|--dry-run [--output <report.json>] [--max-calls <count>] [--seed <seed>]";
const usage = () => {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
};
const options = {
  output: ".verify-artifacts/issue-140-live.json",
  maxCalls: "160",
  // Ada clears every room and climbs out on this seed when each step is
  // taken as planned.
  seed: "99",
};
const VALUED = {
  "--output": "output",
  "--max-calls": "maxCalls",
  "--seed": "seed",
};
let mode;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--live" || argument === "--dry-run") {
    if (mode !== undefined) {
      usage();
    }
    mode = argument;
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
if (mode === undefined) {
  usage();
}
const dryRun = mode === "--dry-run";
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

const root = resolve(".verify-artifacts");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "issue-140-live-"));
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
  issue: 140,
  mode: dryRun ? "dry-run" : "live",
  adventureId: "abandoned-delve",
  runDirectory: relative(process.cwd(), directory),
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

const server = await startFifthBrowserServer({
  libraryPath: join(directory, "characters.json"),
  seed,
  dmModel: model,
});
try {
  const { session } = await playReleaseRun({
    url: server.url,
    session: await startDelveOverHttp(server.url),
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
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(
    `Wrote ${relative(process.cwd(), output)}: ${report.turns.length} turns, ${report.providerCalls} of at most ${maxProviderCalls} provider calls, ${report.ending?.title ?? report.finalStatus}.\n`,
  );
}
