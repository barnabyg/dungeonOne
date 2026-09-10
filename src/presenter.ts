import type { Response } from "./session.js";

export function renderInitialScene(): string {
  return [
    "The Stolen Signet",
    "",
    "You stand at the entrance to a ruined watchtower. Rain beads on the old stone, and the passage ahead disappears into darkness.",
    "",
    'Type "help" for available commands.',
  ].join("\n");
}

export function renderResponse(response: Response): string {
  if (response.type === "help") {
    return [
      "Available commands:",
      "  help  Show this command list.",
      "  quit  Leave the game without completing the adventure.",
    ].join("\n");
  }

  if (response.type === "quit") {
    return "You leave the adventure. Goodbye.";
  }

  if (response.reason === "empty") {
    return 'Please enter a command. Type "help" to see the available commands.';
  }

  return `I don't understand "${response.input ?? ""}". Type "help" to see the available commands.`;
}
