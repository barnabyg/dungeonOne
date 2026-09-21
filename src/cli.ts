import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import {
  DEFAULT_ADVENTURE_ID,
  resolveAdventure,
  type AdventureRuntime,
} from "./runtime.js";
import { playGame } from "./play.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "./openai-dm-model.js";
import { verifyTraceFile } from "./replay.js";
import { resolveStartupSeed } from "./random.js";
import { loadScriptedDmModel } from "./scripted-dm-model.js";
import { loadAdventureFile } from "./adventure-file.js";
import { createExplorationRuntime } from "./exploration-runtime.js";

function chooseStartupSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

type StartupOptions = Readonly<
  | {
      mode: "play";
      runtime: AdventureRuntime;
      seed: number;
      tracePath?: string;
      ai?: Readonly<{ model: string }>;
    }
  | { mode: "replay"; replayPath: string }
  | { mode: "help" }
  | { mode: "validate"; result: Awaited<ReturnType<typeof loadAdventureFile>> }
>;
const USAGE = [
  "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>] [--adventure stolen-signet|chapel]",
  "       dungeon-one --ai [--model <model-id>] [--seed <0-4294967295>] [--trace <path>] [--adventure stolen-signet|chapel]",
  "       dungeon-one --replay <path>",
  "       dungeon-one --adventure-file <path> [--ai] [--seed <seed>] [--trace <path>]",
  "       dungeon-one --validate-adventure <path>",
  "       dungeon-one --help",
  `Default AI model: ${OPENAI_DM_DEFAULT_MODEL}`,
  `Default adventure: ${DEFAULT_ADVENTURE_ID}`,
].join("\n");

async function resolveStartupOptions(
  args: readonly string[],
): Promise<StartupOptions> {
  if (args.length === 1 && args[0] === "--help") {
    return { mode: "help" };
  }
  if (
    args.some(
      (argument) =>
        argument === "--validate-adventure" ||
        argument.startsWith("--validate-adventure="),
    )
  ) {
    const path =
      args.length === 2 && args[0] === "--validate-adventure"
        ? args[1]
        : args.length === 1 &&
            args[0]?.startsWith("--validate-adventure=") === true
          ? args[0].slice("--validate-adventure=".length)
          : undefined;
    if (path === undefined || path.length === 0 || path.startsWith("--")) {
      throw new Error(
        `--validate-adventure requires one path and cannot be combined with other options.\n${USAGE}`,
      );
    }
    return { mode: "validate", result: await loadAdventureFile(path) };
  }
  if (
    args.length === 2 &&
    args[0] === "--replay" &&
    args[1] !== undefined &&
    args[1].length > 0 &&
    !args[1].startsWith("--")
  ) {
    return { mode: "replay", replayPath: args[1] };
  }
  if (
    args.length === 1 &&
    args[0]?.startsWith("--replay=") === true &&
    args[0].slice("--replay=".length).length > 0
  ) {
    return { mode: "replay", replayPath: args[0].slice("--replay=".length) };
  }

  if (
    args.some(
      (argument) => argument === "--replay" || argument.startsWith("--replay="),
    )
  ) {
    throw new Error(`--replay cannot be combined with play options.\n${USAGE}`);
  }

  let adventureId: string | undefined;
  let adventureFile: string | undefined;
  let seedArgument: readonly string[] | undefined;
  let tracePath: string | undefined;
  let ai = false;
  let model: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      argument === "--adventure-file" ||
      argument?.startsWith("--adventure-file=") === true
    ) {
      const value =
        argument === "--adventure-file"
          ? args[++index]
          : argument.slice("--adventure-file=".length);
      if (
        adventureFile !== undefined ||
        adventureId !== undefined ||
        value === undefined ||
        value.length === 0 ||
        value.startsWith("--")
      ) {
        throw new Error(
          `Adventure selectors are mutually exclusive and cannot be duplicated.\n${USAGE}`,
        );
      }
      adventureFile = value;
      continue;
    }
    if (
      argument === "--adventure" ||
      argument?.startsWith("--adventure=") === true
    ) {
      const value =
        argument === "--adventure"
          ? args[++index]
          : argument.slice("--adventure=".length);
      if (
        adventureId !== undefined ||
        adventureFile !== undefined ||
        value === undefined ||
        value.length === 0 ||
        value.startsWith("--")
      ) {
        throw new Error(
          `--adventure requires one built-in selector.\n${USAGE}`,
        );
      }
      adventureId = value;
      continue;
    }
    if (argument === "--ai") {
      if (ai) {
        throw new Error(USAGE);
      }
      ai = true;
      continue;
    }
    if (argument === "--model") {
      const value = args[index + 1];
      if (
        model !== undefined ||
        value === undefined ||
        value.length === 0 ||
        value.startsWith("--")
      ) {
        throw new Error(USAGE);
      }
      model = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--model=") === true) {
      const value = argument.slice("--model=".length);
      if (model !== undefined || value.length === 0) {
        throw new Error(USAGE);
      }
      model = value;
      continue;
    }
    if (argument === "--seed") {
      const value = args[index + 1];
      if (seedArgument !== undefined || value === undefined) {
        throw new Error(USAGE);
      }
      seedArgument = [argument, value];
      index += 1;
      continue;
    }
    if (argument?.startsWith("--seed=") === true) {
      if (seedArgument !== undefined) {
        throw new Error(USAGE);
      }
      seedArgument = [argument];
      continue;
    }
    if (argument === "--trace") {
      const value = args[index + 1];
      if (
        tracePath !== undefined ||
        value === undefined ||
        value.length === 0 ||
        value.startsWith("--")
      ) {
        throw new Error(USAGE);
      }
      tracePath = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--trace=") === true) {
      const value = argument.slice("--trace=".length);
      if (tracePath !== undefined || value.length === 0) {
        throw new Error(USAGE);
      }
      tracePath = value;
      continue;
    }
    throw new Error(USAGE);
  }

  if (!ai && model !== undefined) {
    throw new Error(`--model requires --ai.\n${USAGE}`);
  }

  let runtime: AdventureRuntime;
  if (adventureFile === undefined) {
    runtime = resolveAdventure(adventureId ?? DEFAULT_ADVENTURE_ID);
  } else {
    const result = await loadAdventureFile(adventureFile);
    if (!result.ok) {
      throw new Error(
        JSON.stringify({ ok: false, diagnostics: result.diagnostics }),
      );
    }
    runtime = createExplorationRuntime(result.adventure);
  }

  return {
    mode: "play",
    runtime,
    seed: resolveStartupSeed(seedArgument ?? [], chooseStartupSeed),
    ...(tracePath === undefined ? {} : { tracePath }),
    ...(ai ? { ai: { model: model ?? OPENAI_DM_DEFAULT_MODEL } } : {}),
  };
}

async function main(): Promise<void> {
  let startup;
  try {
    startup = await resolveStartupOptions(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
    return;
  }

  if (startup.mode === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (startup.mode === "validate") {
    const result = startup.result;
    process.stdout.write(
      `${JSON.stringify({ ok: result.ok, diagnostics: result.diagnostics, ...(result.ok ? { content: { id: result.adventure.snapshot.id, digest: result.adventure.digest } } : {}) })}\n`,
    );
    if (!result.ok) {
      process.exitCode = 2;
    }
    return;
  }

  if (startup.mode === "replay") {
    try {
      await verifyTraceFile(startup.replayPath);
      process.stdout.write(
        `Trace verified successfully: ${startup.replayPath}\n`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  const scriptedDmPath = process.env.DUNGEON_ONE_TEST_DM_SCRIPT;
  let dmModel;
  try {
    if (scriptedDmPath !== undefined) {
      dmModel = await loadScriptedDmModel(scriptedDmPath);
    } else if (startup.ai !== undefined) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey === undefined || apiKey.trim().length === 0) {
        process.stderr.write("OPENAI_API_KEY is required for AI mode.\n");
        process.exitCode = 2;
        return;
      }
      dmModel = createOpenAiDmModel({ apiKey, model: startup.ai.model });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }

  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
    prompt: "> ",
  });

  try {
    await playGame(
      { ...startup, ...(dmModel === undefined ? {} : { dmModel }) },
      {
        lines,
        terminal,
        write(text) {
          process.stdout.write(text);
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

await main();
