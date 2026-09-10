import { ADVENTURE } from "./adventure.js";
import type { ActionResult, Event, Rejection } from "./session.js";

export function renderIntroduction(): string {
  return [ADVENTURE.title, "", 'Type "help" for available commands.'].join(
    "\n",
  );
}

function renderHelp(commands: readonly string[]): string {
  const descriptions: Readonly<Record<string, string>> = {
    help: "Show this command list.",
    look: "Describe your current room, visible features, and exits.",
    "inspect <target>": "Inspect a visible feature or named exit.",
    "move <location>": "Walk to a named adjacent location.",
    status: "Show the fighter's hit points and session status.",
    inventory: "Show fixed equipment and collected items.",
    quit: "Leave the game without completing the adventure.",
  };

  return [
    "Available commands:",
    ...commands.map((command) =>
      `  ${command}  ${descriptions[command] ?? ""}`.trimEnd(),
    ),
  ].join("\n");
}

function renderRoom(event: Extract<Event, { type: "room-described" }>): string {
  const room = ADVENTURE.rooms[event.roomId];
  const featureNames = event.featureIds.map((featureId) => {
    const feature = room.features.find(
      (candidate) => candidate.id === featureId,
    );
    if (feature === undefined) {
      throw new Error(`Unknown visible feature: ${featureId}`);
    }
    return feature.name;
  });
  const exitNames = event.exitRoomIds.map(
    (roomId) => ADVENTURE.rooms[roomId].name,
  );

  return [
    room.name,
    room.description,
    `Visible features: ${featureNames.join(", ") || "none"}.`,
    `Exits: ${exitNames.join(", ") || "none"}.`,
  ].join("\n");
}

function renderInspection(
  event: Extract<Event, { type: "target-inspected" }>,
): string {
  if (event.target.type === "exit") {
    const room = ADVENTURE.rooms[event.target.id];
    return `The open passage leads to ${room.name}.`;
  }

  for (const room of Object.values(ADVENTURE.rooms)) {
    const feature = room.features.find(
      (candidate) => candidate.id === event.target.id,
    );
    if (feature !== undefined) {
      return feature.description;
    }
  }

  throw new Error(`Unknown inspected feature: ${event.target.id}`);
}

function renderEvent(event: Event): string {
  switch (event.type) {
    case "help-requested":
      return renderHelp(event.commands);
    case "room-described":
      return renderRoom(event);
    case "target-inspected":
      return renderInspection(event);
    case "room-entered":
      return `You move from ${ADVENTURE.rooms[event.fromRoomId].name} to ${ADVENTURE.rooms[event.roomId].name}.`;
    case "status-described":
      return `Fighter HP: ${event.hp}/${event.maxHp}\nSession: ${event.status}.`;
    case "inventory-described": {
      const equipment = event.equipmentIds.map(
        (equipmentId) => ADVENTURE.equipment[equipmentId].name,
      );
      return [
        `Equipped: ${equipment.join(", ") || "nothing"}.`,
        `Collectibles: ${event.itemIds.join(", ") || "empty"}.`,
      ].join("\n");
    }
    case "session-quit":
      return "You leave the adventure. Goodbye.";
    default:
      event satisfies never;
      throw new Error("Unreachable event");
  }
}

function renderRejection(rejection: Rejection): string {
  switch (rejection.reason) {
    case "empty":
      return 'Please enter a command. Type "help" to see the available commands.';
    case "unknown-command":
      return `I don't understand "${rejection.input}". Type "help" to see the available commands.`;
    case "missing-argument":
      return rejection.command === "inspect"
        ? 'What do you want to inspect? Use "inspect <target>".'
        : 'Where do you want to move? Use "move <location>".';
    case "invisible-target":
      return `You can't see "${rejection.target}" here. Use "look" to see visible features and exits.`;
    case "unknown-destination":
      return `You don't know a location named "${rejection.destination}". Use "look" to see named exits.`;
    case "nonadjacent-destination":
      return `${ADVENTURE.rooms[rejection.destinationId].name} isn't adjacent. Use "look" to see named exits.`;
    default:
      rejection satisfies never;
      throw new Error("Unreachable rejection");
  }
}

export function renderResult(result: ActionResult): string {
  if (result.rejection !== undefined) {
    return renderRejection(result.rejection);
  }

  return result.events.map(renderEvent).join("\n");
}
