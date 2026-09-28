import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  readFile,
  readdir,
  mkdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  generateAdventure,
  GENERATION_REQUEST_TIMEOUT_MS,
  GENERATION_TOTAL_TIMEOUT_MS,
  GENERATION_MAX_OUTPUT_TOKENS,
} from "../dist/generation.js";
import { CLUES_ENGINE_VERSION } from "../dist/chapel-clues-runtime.js";

const PLAN = JSON.parse(
  await readFile(
    new URL("./generation-premises.json", import.meta.url),
    "utf8",
  ),
);
const hash = (text) => createHash("sha256").update(text).digest("hex");
const source = await readFile(
  new URL("../src/generation.ts", import.meta.url),
  "utf8",
);
const example = await readFile(
  new URL("../adventures/generation-example.json", import.meta.url),
  "utf8",
);
const schema = await readFile(
  new URL("../schema/adventure-v3.schema.json", import.meta.url),
  "utf8",
);
const generationSchema = await readFile(
  new URL("../src/generation-schema.ts", import.meta.url),
  "utf8",
);
const runCount = PLAN.premises.length * PLAN.runsPerPremise;
const batch = process.argv[2] === "--batch" ? Number(process.argv[3]) : NaN;
const dryRun = process.argv[4] === "--dry-run";
const validArgs =
  (process.argv.length === 4 || (process.argv.length === 5 && dryRun)) &&
  Number.isSafeInteger(batch) &&
  batch > 0 &&
  runCount === 10 &&
  PLAN.premises.length === 10 &&
  PLAN.runsPerPremise === 1;
const ROOT = resolve(
  ".generation-evaluations",
  `protocol-${PLAN.protocolVersion}`,
  `batch-${batch}`,
);

if (!validArgs) {
  process.stderr.write(
    "Usage: node scripts/eval-generation.mjs --batch <positive-number> [--dry-run]\n",
  );
  process.exitCode = 2;
} else if (dryRun) {
  process.stdout.write(
    `${JSON.stringify({ protocolVersion: PLAN.protocolVersion, batch, total: runCount, model: PLAN.model, premises: PLAN.premises })}\n`,
  );
} else if (!process.env.OPENAI_API_KEY) {
  process.stderr.write(
    "OPENAI_API_KEY is required for generation evaluation.\n",
  );
  process.exitCode = 2;
} else {
  await mkdir(ROOT, { recursive: true });
  // An interrupted prior batch can leave a validated candidate or trace behind.
  // The evaluation owns these exact names; clear them before any provider call.
  for (const name of await readdir(ROOT)) {
    if (/^(?:candidate-\d+|trace-\d+-[a-z0-9-]+)\.json$/u.test(name)) {
      await rm(join(ROOT, name), { force: true });
    }
  }
  const reportPath = join(ROOT, "report.json");
  const expected = {
    protocolVersion: PLAN.protocolVersion,
    batch,
    startedAt: new Date().toISOString(),
    model: PLAN.model,
    schemaVersion: PLAN.schemaVersion,
    rulesVersion: PLAN.rulesVersion,
    engineVersion: CLUES_ENGINE_VERSION,
    requestTimeoutMs: GENERATION_REQUEST_TIMEOUT_MS,
    totalTimeoutMs: GENERATION_TOTAL_TIMEOUT_MS,
    maxOutputTokens: GENERATION_MAX_OUTPUT_TOKENS,
    generationSourceSha256: hash(source),
    exampleSha256: hash(example),
    schemaSha256: hash(schema),
    generationSchemaSha256: hash(generationSchema),
    premisePlanSha256: hash(JSON.stringify(PLAN)),
    pricing: {
      inputUsdPerMillion: PLAN.model === "gpt-5.6-terra" ? 2 : 0.25,
      outputUsdPerMillion: PLAN.model === "gpt-5.6-terra" ? 12 : 2,
      source: `https://developers.openai.com/api/docs/models/${PLAN.model === "gpt-5.6-terra" ? "gpt-5.6-terra" : "gpt-5-mini"}`,
      note: "Upper estimate treats all input tokens as uncached; missing usage is excluded.",
    },
    runs: [],
  };
  const previous = await readFile(reportPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  const report = previous === undefined ? expected : JSON.parse(previous);
  if (
    !Array.isArray(report.runs) ||
    report.runs.length > runCount ||
    report.runs.some((run, index) => run.run !== index + 1) ||
    JSON.stringify(report.pricing) !== JSON.stringify(expected.pricing) ||
    [
      "protocolVersion",
      "batch",
      "model",
      "schemaVersion",
      "rulesVersion",
      "engineVersion",
      "requestTimeoutMs",
      "totalTimeoutMs",
      "maxOutputTokens",
      "generationSourceSha256",
      "exampleSha256",
      "schemaSha256",
      "generationSchemaSha256",
      "premisePlanSha256",
    ].some((key) => report[key] !== expected[key])
  ) {
    throw new Error(
      "Existing evaluation report does not match the frozen protocol.",
    );
  }
  const save = async () => {
    const temp = join(ROOT, "report.tmp");
    const content = JSON.stringify(report, null, 2);
    if (Buffer.byteLength(content) > 4 * 1024 * 1024) {
      throw new Error("Evaluation report byte limit exceeded.");
    }
    await writeFile(temp, content, { mode: 0o600 });
    await rename(temp, reportPath);
  };
  for (let index = report.runs.length; index < runCount; index++) {
    const premise = PLAN.premises[index % PLAN.premises.length];
    const file = join(ROOT, `candidate-${index + 1}.json`);
    const attempts = [];
    const began = performance.now();
    const item = {
      run: index + 1,
      category: premise.category,
      premise: premise.text,
      attempts,
    };
    try {
      const result = await generateAdventure({
        premise: premise.text,
        outputPath: file,
        model: PLAN.model,
        apiKey: process.env.OPENAI_API_KEY,
        onAttempt: (attempt) => attempts.push(attempt),
      });
      item.digest = result.digest;
      item.routeSearch = {
        exploredStates: result.routes.exploredStates,
        seedAttempts: result.routes.seedAttempts,
      };
      item.routes = Object.fromEntries(
        Object.entries({
          ...result.routes.endings,
          physicalAfterFailure: result.routes.physicalAfterFailure,
        })
          .filter(([, route]) => route !== undefined)
          .map(([name, route]) => [
            name,
            {
              seed: route.seed,
              actions: route.steps.map((step) => step.action),
              draws: route.steps.map((step) => step.draws),
            },
          ]),
      );
      const document = JSON.parse(await readFile(file, "utf8"));
      item.replay = await checkReplay(file, document, result.routes, index + 1);
      item.playable =
        item.replay.ok && result.routes.physicalAfterFailure !== undefined;
      if (!item.playable) {
        item.failureCode = item.replay.ok
          ? "no-failed-social-fallback"
          : item.replay.code;
      }
    } catch {
      item.playable = false;
      item.failureCode =
        attempts.at(-1)?.diagnosticCodes[0] ?? "artifact-or-evaluation-failure";
    } finally {
      await rm(file, { force: true });
    }
    item.elapsedMs = Math.round(performance.now() - began);
    item.inputTokens = attempts.reduce(
      (sum, attempt) => sum + (attempt.inputTokens ?? 0),
      0,
    );
    item.outputTokens = attempts.reduce(
      (sum, attempt) => sum + (attempt.outputTokens ?? 0),
      0,
    );
    item.estimatedUsd = Number(
      (
        (item.inputTokens * report.pricing.inputUsdPerMillion +
          item.outputTokens * report.pricing.outputUsdPerMillion) /
        1_000_000
      ).toFixed(6),
    );
    report.runs.push(item);
    await save();
    process.stdout.write(
      `Run ${index + 1}/${runCount}: ${item.playable ? "playable" : item.failureCode}\n`,
    );
  }
  report.finishedAt = new Date().toISOString();
  report.summary = summarize(report.runs);
  await save();
  process.stdout.write(`${JSON.stringify(report.summary)}\n`);
}

function command(step, document) {
  const args = JSON.parse(step.action.argumentsJson);
  switch (step.action.name) {
    case "move":
      return `move ${args.destinationId}`;
    case "search":
      return `search ${args.target}`;
    case "attack":
      return `attack ${args.opponent_id}`;
    case "talk":
      return `talk ${args.speakerId} ${args.topicId} ${args.approach}`;
    case "take":
      return `take ${args.item_id}`;
    case "use_item":
      return `use ${args.item_id}`;
    case "resolve_quest":
      return `resolve ${document.endings.choices.find((choice) => choice.id === args.resolutionId).label}`;
    default:
      throw new Error("unsupported-witness-action");
  }
}

async function checkReplay(file, document, routes, run) {
  const tracePaths = [];
  try {
    const witnesses = {
      ...routes.endings,
      ...(routes.physicalAfterFailure === undefined
        ? {}
        : { physicalAfterFailure: routes.physicalAfterFailure }),
    };
    for (const [name, witness] of Object.entries(witnesses)) {
      const ending = witness.steps.at(-1)?.state.ending?.id;
      if (ending === undefined) {
        return { ok: false, code: "witness-missing-ending" };
      }
      const trace = join(ROOT, `trace-${run}-${name}.json`);
      tracePaths.push(trace);
      const input = `${witness.steps.map((step) => command(step, document)).join("\n")}\nquit\n`;
      const played = spawnSync(
        process.execPath,
        [
          "dist/cli.js",
          "--adventure-file",
          file,
          "--seed",
          String(witness.seed),
          "--trace",
          trace,
        ],
        {
          input,
          encoding: "utf8",
          timeout: 15000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, OPENAI_API_KEY: "" },
        },
      );
      if (played.status !== 0) {
        return { ok: false, code: "command-play-failed" };
      }
      const recorded = JSON.parse(await readFile(trace, "utf8"));
      if (
        recorded.formatVersion !== 4 ||
        recorded.completion?.outcome !== "victory" ||
        !recorded.actions.some(
          (action) => action.stateAfter?.ending?.id === ending,
        )
      ) {
        return { ok: false, code: "ending-trace-mismatch" };
      }
    }
    await rm(file);
    for (const trace of tracePaths) {
      const replay = spawnSync(
        process.execPath,
        ["dist/cli.js", "--replay", trace],
        {
          encoding: "utf8",
          timeout: 15000,
          maxBuffer: 1024 * 1024,
          env: { ...process.env, OPENAI_API_KEY: "" },
        },
      );
      if (replay.status !== 0) {
        return { ok: false, code: "source-free-replay-failed" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "replay-check-failed" };
  } finally {
    for (const trace of tracePaths) {
      await rm(trace, { force: true });
    }
  }
}

function summarize(runs) {
  const counts = Object.fromEntries(
    [...new Set(runs.map((run) => run.category))].map((category) => {
      const group = runs.filter((run) => run.category === category);
      return [
        category,
        {
          playable: group.filter((run) => run.playable).length,
          total: group.length,
        },
      ];
    }),
  );
  return {
    playable: runs.filter((run) => run.playable).length,
    total: runs.length,
    firstPass: runs.filter((run) => run.playable && run.attempts.length === 1)
      .length,
    repairOne: runs.filter((run) => run.playable && run.attempts.length === 2)
      .length,
    repairTwo: runs.filter((run) => run.playable && run.attempts.length === 3)
      .length,
    categories: counts,
    failureCodes: Object.fromEntries(
      [
        ...new Set(
          runs.filter((run) => !run.playable).map((run) => run.failureCode),
        ),
      ].map((code) => [
        code,
        runs.filter((run) => run.failureCode === code).length,
      ]),
    ),
    inputTokens: runs.reduce((sum, run) => sum + run.inputTokens, 0),
    outputTokens: runs.reduce((sum, run) => sum + run.outputTokens, 0),
    estimatedUsd: Number(
      runs.reduce((sum, run) => sum + run.estimatedUsd, 0).toFixed(6),
    ),
    elapsedMs: runs.reduce((sum, run) => sum + run.elapsedMs, 0),
  };
}
