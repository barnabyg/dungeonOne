import { createInterface } from "node:readline";

import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import { createSession, handleAction } from "./session.js";

const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const lines = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal,
  prompt: "> ",
});

let state = createSession();
process.stdout.write(`${renderIntroduction()}\n`);
const initialLook = handleAction(state, { type: "look" });
state = initialLook.state;
process.stdout.write(`${renderResult(initialLook)}\n`);

if (terminal) {
  lines.prompt();
}

for await (const line of lines) {
  const result = handleAction(state, parseCommand(line));
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
