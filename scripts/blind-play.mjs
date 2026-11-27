// Blind play: a live model plays one module as a first-time player and keeps
// a journal (src/blind-play-5e.ts). It calls the provider, so it runs only
// when asked for by name with --live; no test suite and no gate runs it.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import {
  BLIND_PLAY_MIN_MAX_ACTIONS,
  BLIND_PLAY_STEPS_PER_ROOM,
  blindPlayDefaultMaxActions,
  describeLoop,
  renderBlindPlayReport,
  runBlindPlay,
} from "../dist/blind-play-5e.js";
import { validateCharacter } from "../dist/character-5e.js";
import { createOpenAiStructuredModel } from "../dist/openai-structured-model.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { writeFifthTrace } from "../dist/trace-5e.js";

const USAGE = [
  "Usage: npm run blind-play -- --module <id> --model <model-id> --live",
  "       [--seed <number>] [--level <1|2|3|5>] [--library <characters.json>]",
  "       [--max-actions <count>] [--effort <level>] [--output <directory>]",
  "",
  "A live model plays the module once as a player who has never seen it,",
  "from the action bar alone, with the AI DM off, and keeps a journal.",
  "It calls the provider only with --live, and needs OPENAI_API_KEY.",
  "",
  "The character is Ada, the test Fighter, at --level (default: the module's",
  "lowest recommended level), or the first character in --library.",
  `It stops at an ending, after --max-actions steps (default ${BLIND_PLAY_STEPS_PER_ROOM} a room,`,
  `at least ${BLIND_PLAY_MIN_MAX_ACTIONS}), or when it goes back and forth between two rooms.`,
  "The journal, the report and a replayable trace are written to --output",
  "(default: .scratch/blind-play/<module>-seed<seed>-<time>/).",
].join("\n");

class UsageError extends Error {}

function parseArguments(args) {
  const parsed = { seed: 0 };
  const names = {
    "--module": "module",
    "--model": "model",
    "--seed": "seed",
    "--level": "level",
    "--library": "library",
    "--max-actions": "maxActions",
    "--effort": "effort",
    "--output": "output",
  };
  const numbers = new Set(["seed", "level", "maxActions"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      parsed.help = true;
      continue;
    }
    if (argument === "--live") {
      parsed.live = true;
      continue;
    }
    const name = names[argument];
    const value = args[index + 1];
    if (name === undefined || value === undefined || value.startsWith("--")) {
      throw new UsageError(USAGE);
    }
    index += 1;
    parsed[name] = numbers.has(name) ? Number(value) : value;
    if (numbers.has(name) && !Number.isInteger(parsed[name])) {
      throw new UsageError(`${argument} must be a whole number.\n\n${USAGE}`);
    }
  }
  return parsed;
}

async function characterFor(options, adventure) {
  if (options.library !== undefined) {
    const library = JSON.parse(await readFile(options.library, "utf8"));
    const sheet = library?.characters?.[0]?.sheet;
    if (sheet === undefined) {
      throw new UsageError(`${options.library} holds no character.`);
    }
    return validateCharacter(sheet);
  }
  const level = options.level ?? adventure.recommendedLevels.min;
  if (![1, 2, 3, 5].includes(level)) {
    throw new UsageError(
      `There is no test Fighter at level ${level}: give --level 1, 2, 3 or 5, or a --library.`,
    );
  }
  return testFighterAt(level);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (options.module === undefined || options.model === undefined) {
    throw new UsageError(USAGE);
  }
  if (options.live !== true) {
    throw new UsageError(
      `Blind play calls the live provider: add --live to run it.\n\n${USAGE}`,
    );
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  if (apiKey.length === 0) {
    throw new UsageError("OPENAI_API_KEY is required for blind play.");
  }
  const adventures = await loadBuiltInFifthAdventures();
  const adventure = adventures.find(({ id }) => id === options.module);
  if (adventure === undefined) {
    throw new UsageError(
      `There is no module ${options.module}. Modules: ${adventures.map(({ id }) => id).join(", ")}.`,
    );
  }
  const character = await characterFor(options, adventure);
  const maxActions =
    options.maxActions ?? blindPlayDefaultMaxActions(adventure);
  process.stdout.write(
    `Blind play: ${adventure.title}, ${character.name} (level ${character.level} ${character.class}), seed ${options.seed}, player ${options.model}, at most ${maxActions} steps.\n`,
  );
  const report = await runBlindPlay({
    adventure,
    character,
    seed: options.seed,
    maxActions,
    model: createOpenAiStructuredModel({
      apiKey,
      model: options.model,
      ...(options.effort === undefined
        ? {}
        : { reasoningEffort: options.effort }),
    }),
  });
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace("T", "-")
    .slice(0, 15);
  const directory =
    options.output ??
    path.join(
      ".scratch",
      "blind-play",
      `${adventure.id}-seed${options.seed}-${stamp}`,
    );
  await mkdir(directory, { recursive: true });
  const { trace, ...summary } = report;
  await writeFile(
    path.join(directory, "journal.md"),
    renderBlindPlayReport(report),
  );
  await writeFile(
    path.join(directory, "report.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFifthTrace(path.join(directory, "trace.json"), trace);
  const puzzled = report.steps.filter(({ puzzled: text }) => text !== "");
  process.stdout.write(
    [
      `Stopped: ${report.stopped}${report.loop === undefined ? "" : ` (${describeLoop(report.loop)})`}${report.error === undefined ? "" : ` (${report.error})`}.`,
      `Ending: ${report.ending === undefined ? "none" : report.ending.title}.`,
      `Steps: ${report.steps.length}, in ${report.roomsVisited.length} of ${report.module.rooms} rooms. Puzzled at ${puzzled.length}.`,
      `Model use: ${report.usage.calls} calls, ${report.usage.inputTokens} tokens in, ${report.usage.outputTokens} out.`,
      `Journal: ${path.join(directory, "journal.md")}`,
      "",
    ].join("\n"),
  );
  if (report.stopped === "model-error") {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}
