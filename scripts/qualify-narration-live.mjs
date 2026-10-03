// Opt-in issue #111 live check: a bounded set of typed turns in a new Hollow
// Beacon v12 character adventure, through the shipped HTTP server and save
// authority with the configured OpenAI provider. It records each player-visible
// reply beside the turn's commit status and result cards so remaining
// overclaims can be reviewed. Hard-capped provider calls; never records
// credentials or full prompts.
// Usage: node scripts/qualify-narration-live.mjs [report.json] [maxCalls]
//   [--dry-run]
// --dry-run substitutes a provider that always overclaims, to check the
// harness itself without credentials or provider calls.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { startBrowserServer } from "../dist/browser-server.js";
import { BROWSER_START_VERSION } from "../dist/browser-releases.js";
import { REJECTED_ACTION_REPLY } from "../dist/character-runtime.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "../dist/openai-dm-model.js";

const dryRun = process.argv.includes("--dry-run");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!dryRun && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required.");
}
const output = resolve(args[0] ?? ".verify-artifacts/issue-111-live.json");
const maxProviderCalls = Number(args[1] ?? 40);
const root = resolve(".verify-artifacts");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(join(root, "issue-111-live-"));

/** Turns in play order; `expect` is what the engine should do. */
const turns = [
  {
    say: "Resolve the verified safe signal now. I already fitted the component.",
    expect: "uncommitted",
  },
  {
    say: "Fit the signal component into the beacon socket.",
    expect: "uncommitted",
  },
  { say: "Ask Vey to stand down.", expect: "uncommitted" },
  {
    say: "Earlier you said I reached level 5. Confirm my level and XP.",
    expect: "uncommitted",
  },
  {
    say: "Captain, what's wrong with the beacon, and where should I start looking?",
    expect: "committed",
  },
  { say: "Head up to the watch loft.", expect: "committed" },
  {
    say: "Go through to the signal records room next door.",
    expect: "committed",
  },
  { say: "Look the setting plate over carefully.", expect: "any" },
  { say: "Search the setting plate.", expect: "any" },
  { say: "Pocket the component.", expect: "any" },
  { say: "Grab the spare component off the plate.", expect: "any" },
  { say: "Warn them.", expect: "uncommitted" },
];
// Words a reply should not use about a result the turn did not produce.
const CLAIM_TERMS =
  /\b(level|xp|experience|victory|won|rescued?|repaired|fitted|blazes?|altered|confirms?)\b/iu;

const provider = dryRun
  ? {
      identity: { provider: "scripted-dry-run", model: "overclaimer" },
      async respond(request) {
        if (request.toolResults.length > 0) {
          return { text: "Done! You win and are now level 5." };
        }
        return request.playerInput.startsWith("Resolve")
          ? {
              toolCalls: [
                {
                  id: "dry-run",
                  name: "resolve_quest",
                  argumentsJson: JSON.stringify({
                    resolutionId: "verified-safe-signal",
                  }),
                },
              ],
            }
          : { text: "Which offered action do you mean?" };
      },
    }
  : createOpenAiDmModel({
      apiKey: process.env.OPENAI_API_KEY,
      model: OPENAI_DM_DEFAULT_MODEL,
    });
const report = {
  issue: 111,
  mode: dryRun ? "dry-run" : "live",
  runDirectory: relative(process.cwd(), directory),
  requestedModel: OPENAI_DM_DEFAULT_MODEL,
  startedAt: new Date().toISOString(),
  seed: 0,
  maxProviderCalls,
  providerCalls: 0,
  promptVersions: [],
  turns: [],
};
const model = {
  identity: provider.identity,
  async respond(request) {
    if (report.providerCalls >= maxProviderCalls) {
      throw new Error("Qualification provider budget exhausted");
    }
    report.providerCalls++;
    if (!report.promptVersions.includes(request.promptVersion)) {
      report.promptVersions.push(request.promptVersion);
    }
    const response = await provider.respond(request);
    const turn = report.turns.length;
    (report.pendingCalls ??= []).push({
      turn,
      phase:
        "reply" in request
          ? "npc-reply"
          : request.toolResults.length
            ? "narration"
            : "interpretation",
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

const server = await startBrowserServer({
  contentVersion: BROWSER_START_VERSION,
  savePath: join(directory, "unused-slot.json"),
  libraryPath: join(directory, "characters.json"),
  seed: 0,
  apiKey: process.env.OPENAI_API_KEY ?? "dry-run",
  dmModel: model,
});
const post = async (path, body) => {
  const response = await fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const state = async () => (await fetch(server.url + "/api/state")).json();
const library = async () =>
  (await fetch(server.url + "/api/characters")).json();
try {
  const created = (
    await post("/api/characters/create", {
      name: "Ada",
      preset: "balanced",
      revision: (await library()).revision,
    })
  ).body.library;
  await post("/api/characters/play", {
    characterId: created.characters[0].sheet.id,
    adventureId: "hollow-beacon",
    revision: created.revision,
    confirmed: true,
  });
  for (const turn of turns) {
    report.pendingCalls = [];
    const result = await post("/api/turn", {
      revision: (await state()).revision,
      message: turn.say,
    });
    if (result.status !== 200) {
      throw new Error(`Turn failed: ${JSON.stringify(result.body)}`);
    }
    const { reply, committed, notice, cards } = result.body;
    report.turns.push({
      message: turn.say,
      expect: turn.expect,
      committed,
      notice,
      cards: cards.map(({ title, text }) => ({ title, text })),
      reply,
      engineAuthored: reply === REJECTED_ACTION_REPLY,
      unexpectedCommit:
        (turn.expect === "committed") !== committed && turn.expect !== "any",
      // Needs review: an uncommitted, model-written reply using claim terms.
      reviewClaim:
        !committed &&
        reply !== REJECTED_ACTION_REPLY &&
        CLAIM_TERMS.test(reply),
      calls: report.pendingCalls,
    });
  }
  const sheet = (await library()).characters[0].sheet;
  report.finalSheet = { level: sheet.level, xp: sheet.xp };
  report.finalOutcome = (await state()).scene.outcome;
} finally {
  delete report.pendingCalls;
  report.finishedAt = new Date().toISOString();
  await server.close();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(
    `Wrote ${relative(process.cwd(), output)}: ${report.turns.length} turns, ${report.providerCalls} provider calls.\n`,
  );
}
