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

function chooseStartupSeed(): number {
  return randomBytes(4).readUInt32LE(0);
}

async function main(): Promise<void> {
  let startup;
  try {
    startup = resolveStartupSeed(process.argv.slice(2), chooseStartupSeed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
    return;
  }

  const random = createSeededRandom(startup);
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
    prompt: "> ",
  });

  let state = createSession();
  process.stdout.write(`Seed: ${startup} (${RANDOM_ALGORITHM})\n`);
  process.stdout.write(`${renderIntroduction()}\n`);
  const initialLook = handleAction(state, { type: "look" }, random);
  state = initialLook.state;
  process.stdout.write(`${renderResult(initialLook)}\n`);

  if (terminal) {
    lines.prompt();
  }

  for await (const line of lines) {
    const result = handleAction(state, parseCommand(line), random);
    state = result.state;
    process.stdout.write(`${renderResult(result)}\n`);

    if (
      state.status === "quit" ||
      result.events?.some((event) => event.type === "session-quit") === true
    ) {
      lines.close();
      break;
    }

    if (terminal) {
      lines.prompt();
    }
  }
}

await main();
