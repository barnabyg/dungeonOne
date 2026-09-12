import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { dmEvaluationExitCode, runDmEvaluation } from "../dist/dm-evaluator.js";
import { createOpenAiDmModel } from "../dist/openai-dm-model.js";

const USAGE = [
  "Usage: npm run eval:dm -- --model <model-id> [--repetitions <count>]",
  "       [--judgments <path>] [--output <path>]",
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
    } else {
      throw new Error(USAGE);
    }
  }
  if (
    parsed.model === undefined ||
    parsed.model.startsWith("--") ||
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

let configuration;
try {
  configuration = parseArguments(process.argv.slice(2));
} catch {
  process.stderr.write(`${USAGE}\n`);
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

const outputPath =
  configuration.outputPath ?? defaultOutputPath(configuration.model);
try {
  const report = await runDmEvaluation({
    requestedModel: configuration.model,
    repetitions: configuration.repetitions,
    ...(manualJudgments === undefined ? {} : { manualJudgments }),
    createModel() {
      return createOpenAiDmModel({
        apiKey: process.env.OPENAI_API_KEY,
        model: configuration.model,
      });
    },
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
  process.exitCode = dmEvaluationExitCode(report);
} catch {
  process.stderr.write("DM evaluation could not produce a report.\n");
  process.exitCode = 1;
}
