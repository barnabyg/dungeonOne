import type { Action } from "./session.js";

export function parseCommand(input: string): Action {
  const command = input.trim().toLowerCase();

  if (command.length === 0) {
    return { type: "empty" };
  }

  if (command === "help") {
    return { type: "help" };
  }

  if (command === "quit") {
    return { type: "quit" };
  }

  return { type: "unknown", input: command };
}
