import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import {
  RANDOM_ALGORITHM,
  createSeededRandom,
  resolveStartupSeed,
} from "./random.js";
import { createSession, handleAction } from "./session.js";
import {
  completeSessionTrace,
  createSessionTrace,
  recordTraceAction,
  writeSessionTrace,
  type RollRecord,
} from "./trace.js";

function chooseStartupSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

type StartupOptions = Readonly<{ seed: number; tracePath?: string }>;

function resolveStartupOptions(args: readonly string[]): StartupOptions {
  let seedArgument: readonly string[] | undefined;
  let tracePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--seed") {
      const value = args[index + 1];
      if (seedArgument !== undefined || value === undefined) {
        throw new Error(
          "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>]",
        );
      }
      seedArgument = [argument, value];
      index += 1;
      continue;
    }
    if (argument?.startsWith("--seed=") === true) {
      if (seedArgument !== undefined) {
        throw new Error(
          "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>]",
        );
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
        throw new Error(
          "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>]",
        );
      }
      tracePath = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--trace=") === true) {
      const value = argument.slice("--trace=".length);
      if (tracePath !== undefined || value.length === 0) {
        throw new Error(
          "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>]",
        );
      }
      tracePath = value;
      continue;
    }
    throw new Error(
      "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>]",
    );
  }

  return {
    seed: resolveStartupSeed(seedArgument ?? [], chooseStartupSeed),
    ...(tracePath === undefined ? {} : { tracePath }),
  };
}

async function main(): Promise<void> {
  let startup;
  try {
    startup = resolveStartupOptions(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
    return;
  }

  const random = createSeededRandom(startup.seed);
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
    prompt: "> ",
  });

  let state = createSession();
  const trace = createSessionTrace(startup.seed, state);
  let terminationReason: "quit" | "eof" = "eof";
  process.stdout.write(`Seed: ${startup.seed} (${RANDOM_ALGORITHM})\n`);
  process.stdout.write(`${renderIntroduction()}\n`);
  const initialLook = handleAction(state, { type: "look" }, random);
  state = initialLook.state;
  process.stdout.write(`${renderResult(initialLook)}\n`);

  if (terminal) {
    lines.prompt();
  }

  for await (const line of lines) {
    const action = parseCommand(line);
    const rolls: RollRecord[] = [];
    const recordingRandom = {
      roll(sides: number): number {
        const value = random.roll(sides);
        rolls.push({ sides, value });
        return value;
      },
    };
    const result = handleAction(state, action, recordingRandom);
    state = result.state;
    recordTraceAction(trace, line, action, rolls, result);
    process.stdout.write(`${renderResult(result)}\n`);

    if (
      state.status === "quit" ||
      result.events?.some((event) => event.type === "session-quit") === true
    ) {
      terminationReason = "quit";
      lines.close();
      break;
    }

    if (terminal) {
      lines.prompt();
    }
  }

  if (startup.tracePath !== undefined) {
    completeSessionTrace(trace, terminationReason, state);
    try {
      await writeSessionTrace(startup.tracePath, trace);
      process.stdout.write(`Trace exported to ${startup.tracePath}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    }
  }
}

await main();
