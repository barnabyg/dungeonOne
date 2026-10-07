import { pathToFileURL } from "node:url";

import {
  loadBuiltInFifthBestiary,
  loadFifthBestiary,
} from "../dist/bestiary-5e.js";
import {
  DEFAULT_PERCENTILES,
  DEFAULT_SEED_COUNT,
  PLAY_STYLES,
} from "../dist/balance-5e.js";
import { estimateEncounter, renderEstimate } from "../dist/estimate-5e.js";

const USAGE = [
  "Usage: npm run estimate -- [--levels <min>-<max>] [--seeds <count>]",
  "       [--percentiles <p,p>] [--styles <style,style>] [--bestiary <file>]",
  "       [--json] <monster>[:<count>] ...",
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

function whole(text) {
  const value = number(text);
  if (!Number.isInteger(value)) {
    throw new Error(USAGE);
  }
  return value;
}

/**
 * Reads the command line: options, then the bestiary ids, each with an
 * optional count (`wolf:2`). Levels default to 1–3.
 */
export function parseArguments(args) {
  const parsed = {
    monsters: [],
    levels: { min: 1, max: 3 },
    seeds: DEFAULT_SEED_COUNT,
    percentiles: [...DEFAULT_PERCENTILES],
    styles: [...PLAY_STYLES],
    bestiary: undefined,
    json: false,
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
    if (argument === "--levels") {
      const [min, max = min, ...rest] = value().split("-");
      if (rest.length > 0) {
        throw new Error(USAGE);
      }
      parsed.levels = { min: whole(min), max: whole(max) };
    } else if (argument === "--seeds") {
      parsed.seeds = whole(value());
      if (parsed.seeds < 1) {
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
    } else if (argument === "--bestiary") {
      parsed.bestiary = value();
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument.startsWith("--")) {
      throw new Error(USAGE);
    } else {
      const [id, count, ...rest] = argument.split(":");
      if (id === "" || rest.length > 0) {
        throw new Error(USAGE);
      }
      parsed.monsters.push({
        id,
        count: count === undefined ? 1 : whole(count),
      });
    }
  }
  if (parsed.monsters.length === 0) {
    throw new Error(USAGE);
  }
  return parsed;
}

/**
 * Estimates the encounter against the built-in bestiary, or the one named;
 * the exit code is 1 if it fails with a named reason.
 */
export async function main(args, output = process.stdout) {
  const options = parseArguments(args);
  const bestiary =
    options.bestiary === undefined
      ? await loadBuiltInFifthBestiary()
      : await loadFifthBestiary(options.bestiary);
  const result = estimateEncounter(
    bestiary,
    { monsters: options.monsters, levels: options.levels },
    {
      seeds: Array.from({ length: options.seeds }, (_, seed) => seed),
      percentiles: options.percentiles,
      styles: options.styles,
    },
  );
  output.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${renderEstimate(result)}\n`,
  );
  return result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
