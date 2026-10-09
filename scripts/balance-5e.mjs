import { pathToFileURL } from "node:url";

import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  CHECK_POLICIES,
  DEFAULT_PERCENTILES,
  DEFAULT_SEED_COUNT,
  GATE_CLASSES,
  gateModule,
  PLAY_STYLES,
  qualifyAdventure,
  renderBalanceResult,
  renderModuleGateResult,
} from "../dist/balance-5e.js";

const USAGE = [
  "Usage: npm run balance -- [--seeds <count>] [--percentiles <p,p>]",
  "       [--styles <style,style>] [--checks <policy>] [--classes <class,class>]",
  "       [--json] [module.json ...]",
].join("\n");

function list(value, parse) {
  return value.split(",").map(parse);
}

function number(text) {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) {
    throw new Error(USAGE);
  }
  return value;
}

/** Reads the command line: options, then module files (all built-in ones by default). */
export function parseArguments(args) {
  const parsed = {
    seeds: DEFAULT_SEED_COUNT,
    percentiles: [...DEFAULT_PERCENTILES],
    styles: [...PLAY_STYLES],
    checks: "seeded",
    classes: [...GATE_CLASSES],
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
      parsed.seeds = number(value());
      if (!Number.isInteger(parsed.seeds) || parsed.seeds < 1) {
        throw new Error(USAGE);
      }
    } else if (argument === "--percentiles") {
      parsed.percentiles = list(value(), number);
    } else if (argument === "--styles") {
      parsed.styles = list(value(), (style) => {
        if (!PLAY_STYLES.includes(style)) {
          throw new Error(USAGE);
        }
        return style;
      });
    } else if (argument === "--checks") {
      parsed.checks = value();
      if (!CHECK_POLICIES.includes(parsed.checks)) {
        throw new Error(USAGE);
      }
    } else if (argument === "--classes") {
      parsed.classes = list(value(), (classId) => {
        if (!GATE_CLASSES.includes(classId)) {
          throw new Error(USAGE);
        }
        return classId;
      });
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
 * Qualifies each module for each class in `--classes` (every class the gate
 * judges by default, #310), with its checks graded by `--checks` (seeded by
 * default), and gates it on its declared difficulty for every class, which
 * plays every check policy, over the same seeds; the exit code is 1 if any
 * fails with a named reason or does not qualify.
 */
export async function main(args, output = process.stdout) {
  const options = parseArguments(args);
  const adventures =
    options.paths.length === 0
      ? await loadBuiltInFifthAdventures()
      : await Promise.all(
          options.paths.map((path) => loadFifthAdventure(path)),
        );
  const qualification = {
    seeds: Array.from({ length: options.seeds }, (_, seed) => seed),
    percentiles: options.percentiles,
    styles: options.styles,
    checks: options.checks,
  };
  const results = adventures.map((adventure) => ({
    adventure,
    reports: options.classes.map((classId) => ({
      classId,
      result: qualifyAdventure(adventure, { ...qualification, classId }),
    })),
    gate: gateModule(adventure, { seeds: qualification.seeds }),
  }));
  output.write(
    options.json
      ? `${JSON.stringify(
          results.map(({ adventure, reports, gate }) => ({
            adventureId: adventure.id,
            reports: reports.map(({ classId, result }) => ({
              classId,
              ...result,
            })),
            gate,
          })),
          null,
          2,
        )}\n`
      : `${results
          .map(({ adventure, reports, gate }) =>
            [
              ...reports.map(({ result }) =>
                renderBalanceResult(adventure, result),
              ),
              renderModuleGateResult(adventure, gate),
            ].join("\n\n"),
          )
          .join("\n\n")}\n`,
  );
  return results.every(
    ({ reports, gate }) =>
      reports.every(({ result }) => result.ok) && gate.qualified,
  )
    ? 0
    : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
