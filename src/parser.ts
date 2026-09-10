import type { Action } from "./session.js";

export function parseCommand(input: string): Action {
  const command = input.trim().toLowerCase();

  if (command.length === 0) {
    return { type: "empty" };
  }

  const [verb = "", ...argumentParts] = command.split(/\s+/u);
  const argument = argumentParts.join(" ");

  switch (verb) {
    case "help":
    case "look":
    case "status":
    case "inventory":
    case "quit": {
      if (argument.length > 0) {
        return { type: "unknown", input: command };
      }
      return { type: verb };
    }
    case "inspect":
      return { type: "inspect", target: argument };
    case "move":
      return { type: "move", destination: argument };
    case "open":
      return { type: "open", target: argument };
    default:
      return { type: "unknown", input: command };
  }
}
