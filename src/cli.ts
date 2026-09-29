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
import { verifyTraceFile, verifyTraceSegments } from "./replay.js";
import { resolveStartupSeed } from "./random.js";
import { loadScriptedDmModel } from "./scripted-dm-model.js";
import { loadAdventureFile } from "./adventure-file.js";
import { createDataRuntime } from "./data-runtime.js";
import { generateAdventure } from "./generation.js";
import { SaveSession } from "./save.js";

function chooseStartupSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

type StartupOptions = Readonly<
  | {
      mode: "play";
      runtime: AdventureRuntime;
      seed: number;
      tracePath?: string;
      savePath?: string;
      saveSession?: SaveSession;
      previousTracePath?: string;
      ai?: Readonly<{ model: string }>;
    }
  | { mode: "replay"; replayPaths: readonly string[] }
  | { mode: "help" }
  | { mode: "validate"; result: Awaited<ReturnType<typeof loadAdventureFile>> }
  | { mode: "generate"; premise: string; outputPath: string; model: string }
>;
const USAGE = [
  "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>] [--adventure stolen-signet|chapel]",
  "       dungeon-one --ai [--model <model-id>] [--seed <0-4294967295>] [--trace <path>] [--adventure stolen-signet|chapel]",
  "       dungeon-one --replay <path> [next-segment.json ...]",
  "       dungeon-one --adventure-file <schema-3-through-6.json> --seed <seed> --save <path>",
  "       dungeon-one --adventure-file <schema-3-through-6.json> --ai --seed <seed> --save <path>",
  "       dungeon-one --resume <path> [--ai] [--model <model-id>] [--trace <path> --previous-trace <path>]",
  "       dungeon-one --adventure-file <path> [--ai] [--seed <seed>] [--trace <path>]",
  "       dungeon-one --validate-adventure <path>",
  "       dungeon-one --generate-adventure <output.json> --premise <text> --model <model-id>",
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
        argument === "--generate-adventure" ||
        argument.startsWith("--generate-adventure="),
    )
  ) {
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index];
      const equals = argument?.indexOf("=") ?? -1;
      const name = equals < 0 ? argument : argument?.slice(0, equals);
      if (
        name !== "--generate-adventure" &&
        name !== "--premise" &&
        name !== "--model"
      ) {
        throw new Error(
          `Generation cannot be combined with other options.\n${USAGE}`,
        );
      }
      const value = equals < 0 ? args[++index] : argument?.slice(equals + 1);
      if (
        value === undefined ||
        value.length === 0 ||
        value.startsWith("--") ||
        values.has(name)
      ) {
        throw new Error(
          `Generation requires one output, premise, and model.\n${USAGE}`,
        );
      }
      values.set(name, value);
    }
    const outputPath = values.get("--generate-adventure");
    const premise = values.get("--premise");
    const model = values.get("--model");
    if (
      outputPath === undefined ||
      premise === undefined ||
      model === undefined
    ) {
      throw new Error(
        `Generation requires one output, premise, and model.\n${USAGE}`,
      );
    }
    return { mode: "generate", outputPath, premise, model };
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
    args.length >= 2 &&
    args[0] === "--replay" &&
    args.slice(1).every((path) => path.length > 0 && !path.startsWith("--"))
  ) {
    return { mode: "replay", replayPaths: args.slice(1) };
  }
  if (
    args.length === 1 &&
    args[0]?.startsWith("--replay=") === true &&
    args[0].slice("--replay=".length).length > 0
  ) {
    return { mode: "replay", replayPaths: [args[0].slice("--replay=".length)] };
  }

  if (
    args.some(
      (argument) => argument === "--replay" || argument.startsWith("--replay="),
    )
  ) {
    throw new Error(`--replay cannot be combined with play options.\n${USAGE}`);
  }

  if (
    args[0] === "--resume" &&
    args[1] !== undefined &&
    !args[1].startsWith("--")
  ) {
    const resumeArgs = args.slice(2);
    const resumeAi = resumeArgs.includes("--ai");
    const modelIndex = resumeArgs.indexOf("--model");
    const resumeModel = modelIndex < 0 ? undefined : resumeArgs[modelIndex + 1];
    const traceIndex = resumeArgs.indexOf("--trace");
    const previousIndex = resumeArgs.indexOf("--previous-trace");
    const tracePath = traceIndex < 0 ? undefined : resumeArgs[traceIndex + 1];
    const previousTracePath =
      previousIndex < 0 ? undefined : resumeArgs[previousIndex + 1];
    if (
      resumeArgs.length !==
        (resumeAi ? 1 : 0) +
          (modelIndex < 0 ? 0 : 2) +
          (traceIndex < 0 ? 0 : 2) +
          (previousIndex < 0 ? 0 : 2) ||
      (tracePath === undefined) !== (previousTracePath === undefined) ||
      (tracePath !== undefined &&
        (tracePath.length === 0 || tracePath.startsWith("--"))) ||
      (previousTracePath !== undefined &&
        (previousTracePath.length === 0 ||
          previousTracePath.startsWith("--"))) ||
      (resumeModel !== undefined &&
        (!resumeAi ||
          resumeModel.startsWith("--") ||
          resumeModel.length === 0)) ||
      (modelIndex >= 0 && resumeModel === undefined)
    ) {
      throw new Error(`Invalid resume options.\n${USAGE}`);
    }
    const saveSession = await SaveSession.load(args[1]);
    return {
      mode: "play",
      runtime: saveSession.runtime,
      seed: saveSession.seed,
      saveSession,
      ...(tracePath === undefined
        ? {}
        : { tracePath, previousTracePath: previousTracePath! }),
      ...(resumeAi
        ? { ai: { model: resumeModel ?? OPENAI_DM_DEFAULT_MODEL } }
        : {}),
    };
  }
  if (
    args.some(
      (argument) => argument === "--resume" || argument.startsWith("--resume="),
    )
  ) {
    throw new Error(
      `--resume requires one path and cannot be combined with other options.\n${USAGE}`,
    );
  }

  let adventureId: string | undefined;
  let adventureFile: string | undefined;
  let seedArgument: readonly string[] | undefined;
  let tracePath: string | undefined;
  let savePath: string | undefined;
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
    if (argument === "--save" || argument?.startsWith("--save=") === true) {
      const value =
        argument === "--save"
          ? args[++index]
          : argument.slice("--save=".length);
      if (
        savePath !== undefined ||
        value === undefined ||
        value.length === 0 ||
        value.startsWith("--")
      ) {
        throw new Error(USAGE);
      }
      savePath = value;
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
    runtime = createDataRuntime(result.adventure);
  }

  return {
    mode: "play",
    runtime,
    seed: resolveStartupSeed(seedArgument ?? [], chooseStartupSeed),
    ...(tracePath === undefined ? {} : { tracePath }),
    ...(savePath === undefined ? {} : { savePath }),
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

  if (startup.mode === "generate") {
    try {
      const result = await generateAdventure({
        ...startup,
        apiKey: process.env.OPENAI_API_KEY ?? "",
      });
      const quotedPath = `'${result.outputPath.replaceAll("'", "''")}'`;
      process.stdout.write(
        `Generated ${result.id}\nDigest: ${result.digest}\nModel: ${result.model}\nAttempts: ${result.attempts}\nValidation warnings: ${result.warnings}\nRoute witnesses: ${Object.entries(
          result.routes.endings,
        )
          .map(
            ([id, route]) =>
              `${id} (seed ${route.seed}, ${route.steps.length} actions)`,
          )
          .join(
            ", ",
          )}\nWarnings witnessed: ${Object.keys(result.routes.warnings).length}\nExplored: ${result.routes.exploredStates} states across ${result.routes.seedAttempts} seeds\nValidate: node dist/cli.js --validate-adventure ${quotedPath}\nPlay: node dist/cli.js --adventure-file ${quotedPath} --seed 0\n`,
      );
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Adventure generation failed."}\n`,
      );
      process.exitCode = 2;
    }
    return;
  }

  if (startup.mode === "replay") {
    try {
      if (startup.replayPaths.length === 1) {
        await verifyTraceFile(startup.replayPaths[0]!);
      } else {
        await verifyTraceSegments(startup.replayPaths);
      }
      process.stdout.write(
        `Trace verified successfully: ${startup.replayPaths.join(", ")}\n`,
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
  // Readline's built-in async iterator can miss EOF while a command awaits a
  // durable save. Capture lines and close before entering the play loop.
  const pendingLines: string[] = [];
  let closed = false;
  let wake: (() => void) | undefined;
  lines.on("line", (line) => {
    pendingLines.push(line);
    wake?.();
  });
  lines.on("close", () => {
    closed = true;
    wake?.();
  });
  const queuedLines = {
    prompt: () => lines.prompt(),
    close: () => lines.close(),
    async *[Symbol.asyncIterator]() {
      while (!closed || pendingLines.length > 0) {
        if (pendingLines.length > 0) {
          yield pendingLines.shift()!;
        } else {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          wake = undefined;
        }
      }
    },
  };

  try {
    await playGame(
      { ...startup, ...(dmModel === undefined ? {} : { dmModel }) },
      {
        lines: queuedLines,
        terminal,
        write(text) {
          process.stdout.write(text);
        },
      },
    );
  } catch (error) {
    lines.close();
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

await main();
