import { pathToFileURL } from "node:url";

import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import { DEFAULT_SEED_COUNT, GATE_CLASSES } from "../dist/balance-5e.js";
import {
  CAREER_REQUIRED_LEVEL,
  renderCareerResult,
  simulateCareer,
} from "../dist/career-5e.js";
import { MAX_LEVEL } from "../dist/character-5e.js";

const USAGE = [
  "Usage: npm run career -- [--seeds <count>] [--required-level <level>]",
  "       [--class <class>] [--json] [module.json ...]",
].join("\n");

function count(text, min, max) {
  const value = Number(text);
  if (!/^\d+$/u.test(text) || value < min || value > max) {
    throw new Error(USAGE);
  }
  return value;
}

/** Reads the command line: options, then module files (all built-in ones by default). */
export function parseArguments(args) {
  const parsed = {
    seeds: DEFAULT_SEED_COUNT,
    requiredLevel: CAREER_REQUIRED_LEVEL,
    classId: "fighter",
    json: false,
    paths: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = () => {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(USAGE);
      }
      index += 1;
      return next;
    };
    if (argument === "--seeds") {
      parsed.seeds = count(value(), 1, Number.MAX_SAFE_INTEGER);
    } else if (argument === "--required-level") {
      parsed.requiredLevel = count(value(), 1, MAX_LEVEL);
    } else if (argument === "--class") {
      parsed.classId = value();
      if (!GATE_CLASSES.includes(parsed.classId)) {
        throw new Error(USAGE);
      }
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument.startsWith("--")) {
      throw new Error(USAGE);
    } else {
      parsed.paths.push(argument);
    }
  }
  return parsed;
}

/**
 * Simulates a career through the modules (#290) over seeds 0 to `--seeds`
 * − 1; the exit code is 1 if no career reaches the required level.
 */
export async function main(args, output = process.stdout) {
  const options = parseArguments(args);
  const adventures =
    options.paths.length === 0
      ? await loadBuiltInFifthAdventures()
      : await Promise.all(
          options.paths.map((path) => loadFifthAdventure(path)),
        );
  const report = simulateCareer(adventures, {
    seeds: Array.from({ length: options.seeds }, (_, seed) => seed),
    requiredLevel: options.requiredLevel,
    classId: options.classId,
  });
  output.write(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${renderCareerResult(report)}\n`,
  );
  return report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
