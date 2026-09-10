import { createInterface } from "node:readline";

import { parseCommand } from "./parser.js";
import { renderInitialScene, renderResponse } from "./presenter.js";
import { createSession, handleAction } from "./session.js";

const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const lines = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal,
  prompt: "> ",
});

let state = createSession();
process.stdout.write(`${renderInitialScene()}\n`);

if (terminal) {
  lines.prompt();
}

for await (const line of lines) {
  const result = handleAction(state, parseCommand(line));
  state = result.state;
  process.stdout.write(`${renderResponse(result.response)}\n`);

  if (state.status === "quit") {
    lines.close();
    break;
  }

  if (terminal) {
    lines.prompt();
  }
}
