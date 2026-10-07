// Rolls loot for a module's bestiary opponents from their treasure types
// (#240) and writes it into the module file as items they carry.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import * as prettier from "prettier";

import { findableValue, validateFifthAdventure } from "../dist/adventure-5e.js";
import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import { formatCoins } from "../dist/equipment-5e.js";
import { rollModuleLoot } from "../dist/loot-5e.js";
import { resolveStartupSeed } from "../dist/random.js";
import { treasureBudget } from "../dist/treasure-5e.js";

const USAGE = "Usage: npm run loot -- <module.json> --seed <0-4294967295>";

/** Reads the command line: one module file and a seed, in either order. */
export function parseArguments(args) {
  let seed;
  const paths = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--seed" && index + 1 < args.length) {
      seed = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--seed=")) {
      seed = argument.slice("--seed=".length);
    } else if (argument.startsWith("--")) {
      throw new Error(USAGE);
    } else {
      paths.push(argument);
    }
  }
  if (seed === undefined || paths.length !== 1) {
    throw new Error(USAGE);
  }
  return {
    path: paths[0],
    seed: resolveStartupSeed(["--seed", seed], () => 0),
  };
}

/**
 * Rolls the module's loot with the seed and writes the file back, formatted,
 * if anything was rolled; reports what each opponent now carries and the
 * module's treasure against its budget.
 */
export async function main(args, output = process.stdout) {
  const { path, seed } = parseArguments(args);
  const bestiary = await loadBuiltInFifthBestiary();
  const { module, rolled } = rollModuleLoot(
    JSON.parse(await readFile(path, "utf8")),
    bestiary,
    seed,
  );
  if (rolled.length > 0) {
    const text = await prettier.format(JSON.stringify(module), {
      ...(await prettier.resolveConfig(path)),
      filepath: path,
    });
    await writeFile(path, text);
  }
  const adventure = validateFifthAdventure(module, bestiary);
  const max = adventure.recommendedLevels.max;
  output.write(
    [
      rolled.length === 0
        ? `No opponent in ${adventure.id} needs loot; ${path} is unchanged.`
        : `Rolled loot for ${adventure.id} with seed ${seed}:`,
      ...rolled.map(
        ({ opponentId, treasureType, items }) =>
          `  ${opponentId} (${treasureType}): ${items.join(", ")}`,
      ),
      `Findable treasure: ${formatCoins(findableValue(adventure))} of the ${formatCoins(treasureBudget(max))} budget for level ${max}.`,
      "",
    ].join("\n"),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
