import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  evaluationCallBudget,
  FIFTH_DM_CASES,
  runFifthDmEvaluation,
} from "../dist/dm-evaluation-5e.js";
import { createOpenAiDmModel } from "../dist/openai-dm-model.js";

const USAGE = [
  "Usage: npm run eval:dm -- --model <model-id> --live",
  "       [--repetitions <count>] [--judgments <path>] [--output <path>]",
  "       [--max-calls <count>]",
  "       Runs the abandoned-delve cases. It calls the live provider",
  "       only with --live, within --max-calls provider calls",
  "       (default: four per case and repetition).",
].join(" ");

function argumentValue(args, index) {
  const value = args[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(USAGE);
  }
  return value;
}

function parseArguments(args) {
  const parsed = { repetitions: 3 };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--live" && parsed.live !== true) {
      parsed.live = true;
      continue;
    }
    let name;
    let value;
    if (argument?.startsWith("--") === true && argument.includes("=")) {
      [name, value] = argument.split(/=(.*)/su, 2);
      if (value.length === 0) {
        throw new Error(USAGE);
      }
    } else {
      name = argument;
      value = argumentValue(args, index);
      index += 1;
    }
    if (seen.has(name)) {
      throw new Error(USAGE);
    }
    seen.add(name);
    if (name === "--model") {
      parsed.model = value;
    } else if (name === "--repetitions") {
      parsed.repetitions = Number(value);
    } else if (name === "--judgments") {
      parsed.judgmentsPath = value;
    } else if (name === "--output") {
      parsed.outputPath = value;
    } else if (name === "--max-calls") {
      parsed.maxCalls = Number(value);
    } else {
      throw new Error(USAGE);
    }
  }
  if (
    parsed.model === undefined ||
    parsed.model.startsWith("--") ||
    (parsed.maxCalls !== undefined &&
      (!Number.isInteger(parsed.maxCalls) || parsed.maxCalls < 1)) ||
    parsed.live !== true ||
    !Number.isInteger(parsed.repetitions) ||
    parsed.repetitions < 3
  ) {
    throw new Error(USAGE);
  }
  return parsed;
}

function defaultOutputPath(model) {
  const safeModel = model.replaceAll(/[^A-Za-z0-9._-]/gu, "_");
  return path.join(".dm-evaluations", `${safeModel}-report.json`);
}

function resolveOutputPath(model, requestedPath) {
  const reportRoot = path.resolve(".dm-evaluations");
  const outputPath = path.resolve(requestedPath ?? defaultOutputPath(model));
  const relativePath = path.relative(reportRoot, outputPath);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Report output must be inside .dm-evaluations.");
  }
  return outputPath;
}

let configuration;
try {
  configuration = parseArguments(process.argv.slice(2));
  configuration.outputPath = resolveOutputPath(
    configuration.model,
    configuration.outputPath,
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : USAGE}\n${USAGE}\n`,
  );
  process.exit(2);
}

if (
  process.env.OPENAI_API_KEY === undefined ||
  process.env.OPENAI_API_KEY.trim().length === 0
) {
  process.stderr.write("OPENAI_API_KEY is required for live DM evaluation.\n");
  process.exit(2);
}

let manualJudgments;
try {
  manualJudgments =
    configuration.judgmentsPath === undefined
      ? undefined
      : JSON.parse(await readFile(configuration.judgmentsPath, "utf8"));
} catch {
  process.stderr.write("Unable to read the manual-judgments JSON file.\n");
  process.exit(2);
}

const outputPath = configuration.outputPath;
try {
  const live = (model) =>
    createOpenAiDmModel({ apiKey: process.env.OPENAI_API_KEY, model });
  // Every case, every repetition, at most four model responses each.
  const maxCalls =
    configuration.maxCalls ?? evaluationCallBudget(configuration.repetitions);
  process.stdout.write(
    `Evaluating ${FIFTH_DM_CASES.length} cases × ${configuration.repetitions} repetitions on ${configuration.model}, at most ${maxCalls} provider calls.\n`,
  );
  const report = await runFifthDmEvaluation({
    requestedModel: configuration.model,
    repetitions: configuration.repetitions,
    maxCalls,
    ...(manualJudgments === undefined ? {} : { manualJudgments }),
    createModel: () => live(configuration.model),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(report, undefined, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `DM evaluation ${report.passed ? "passed" : "failed"}; report: ${outputPath}\n`,
  );
  process.exitCode = report.passed ? 0 : 1;
} catch {
  process.stderr.write("DM evaluation could not produce a report.\n");
  process.exitCode = 1;
}
