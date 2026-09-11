import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import { verifyTraceFile } from "./replay.js";
import {
  RANDOM_ALGORITHM,
  createSeededRandom,
  resolveStartupSeed,
} from "./random.js";
import { createSession, handleAction, type ActionResult } from "./session.js";
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

type StartupOptions = Readonly<
  | { mode: "play"; seed: number; tracePath?: string }
  | { mode: "replay"; replayPath: string }
>;
const USAGE =
  "Usage: dungeon-one [--seed <0-4294967295>] [--trace <path>] | --replay <path>";

function resolveStartupOptions(args: readonly string[]): StartupOptions {
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

  let seedArgument: readonly string[] | undefined;
  let tracePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
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

  return {
    mode: "play",
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

  const random = createSeededRandom(startup.seed);
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
    prompt: "> ",
  });

  let state = createSession();
  const trace =
    startup.tracePath === undefined
      ? undefined
      : createSessionTrace(startup.seed, state);
  let terminationReason: "quit" | "eof" = "eof";
  process.stdout.write(`Seed: ${startup.seed} (${RANDOM_ALGORITHM})\n`);
  process.stdout.write(`${renderIntroduction()}\n`);
  const initialStatus = handleAction(state, { type: "status" }, random);
  state = initialStatus.state;
  process.stdout.write(`${renderResult(initialStatus)}\n`);
  const initialLook = handleAction(state, { type: "look" }, random);
  state = initialLook.state;
  process.stdout.write(`${renderResult(initialLook)}\n`);

  if (terminal) {
    lines.prompt();
  }

  for await (const line of lines) {
    const action = parseCommand(line);
    let result: ActionResult;
    if (trace === undefined) {
      result = handleAction(state, action, random);
    } else {
      const rolls: RollRecord[] = [];
      const recordingRandom = {
        roll(sides: number): number {
          const value = random.roll(sides);
          rolls.push({ sides, value });
          return value;
        },
      };
      result = handleAction(state, action, recordingRandom);
      recordTraceAction(trace, line, action, rolls, result);
    }
    state = result.state;
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

  if (startup.tracePath !== undefined && trace !== undefined) {
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
