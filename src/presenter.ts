import { ADVENTURE } from "./adventure.js";
import type {
  ActionResult,
  Event,
  Rejection,
  SessionState,
} from "./session.js";

const ENDING_GUIDANCE =
  'The final state remains available through "look", "status", and "inventory". Enter "quit" to exit. Start a fresh run with "npm start".';
const COMMAND_EXAMPLES = {
  inspect: "inspect ruined archway",
  move: "move guardroom",
  open: "open wooden door",
  take: "take signet",
  attack: "attack goblin",
} as const;

function example(command: keyof typeof COMMAND_EXAMPLES): string {
  return `For example: "${COMMAND_EXAMPLES[command]}".`;
}

export function renderIntroduction(): string {
  return [
    ADVENTURE.title,
    "",
    `Objective: ${ADVENTURE.objective.description}`,
    'Type "help" for available commands.',
  ].join("\n");
}

function renderHelp(commands: readonly string[]): string {
  const descriptions: Readonly<Record<string, string>> = {
    help: "Show this command list.",
    look: "Describe your current room, visible features, and exits.",
    "inspect <target>": `Inspect something visible or carried. ${example("inspect")}`,
    "move <location>": `Walk to a named adjacent location. ${example("move")}`,
    "open <target>": `Open an accessible door. ${example("open")}`,
    "take <item>": `Take a visible collectible. ${example("take")}`,
    "attack <target>": `Attack a living opponent. ${example("attack")}`,
    status: "Show the fighter's hit points and session status.",
    inventory: "Show fixed equipment and collected items.",
    leave: "Use the reliquary's far exit to complete the objective.",
    quit: "Leave the game without completing the adventure.",
  };

  return [
    "Available commands:",
    ...commands.map((command) =>
      `  ${command}  ${descriptions[command] ?? ""}`.trimEnd(),
    ),
    "",
    'Commands are case-insensitive but must use these forms. Use "look" for visible targets and named exits.',
    'You cannot retreat during combat; use "attack goblin". The Entrance is not an escape: recover the signet and use "leave" in the Reliquary.',
  ].join("\n");
}

function renderRoom(
  event: Extract<Event, { type: "room-described" }>,
  state: SessionState,
): string {
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
  const exitNames = event.exitRoomIds.map((roomId) => {
    const roomName = ADVENTURE.rooms[roomId].name;
    const doorway = event.doorways.find(
      (candidate) => candidate.destinationId === roomId,
    );
    if (doorway === undefined) {
      return roomName;
    }
    const doorName = ADVENTURE.doors[doorway.doorId].name;
    return `${roomName} (${doorway.open ? "open" : "closed"} ${doorName})`;
  });
  const visibleItems = event.visibleItems.map(({ itemId, featureId }) => {
    const feature = room.features.find(
      (candidate) => candidate.id === featureId,
    );
    if (feature === undefined) {
      throw new Error(`Unknown item placement feature: ${featureId}`);
    }
    return `${ADVENTURE.items[itemId].name} (on ${feature.name})`;
  });
  const defeatedOpponents = Object.values(ADVENTURE.opponents)
    .filter(
      (opponent) =>
        opponent.roomId === event.roomId &&
        state.opponents[opponent.id].hp === 0,
    )
    .map((opponent) => opponent.name);

  return [
    room.name,
    room.description,
    `Visible features: ${featureNames.join(", ") || "none"}.`,
    `Visible items: ${visibleItems.join(", ") || "none"}.`,
    ...(defeatedOpponents.length === 0
      ? []
      : [`Defeated opponents: ${defeatedOpponents.join(", ")}.`]),
    `Exits: ${exitNames.join(", ") || "none"}.`,
  ].join("\n");
}

function renderInspection(
  event: Extract<Event, { type: "target-inspected" }>,
): string {
  if (event.target.type === "item") {
    return ADVENTURE.items[event.target.id].description;
  }

  if (event.target.type === "door") {
    const door = ADVENTURE.doors[event.target.id];
    return `${door.description} It is ${event.target.open ? "open" : "closed"}.`;
  }

  if (event.target.type === "exit") {
    const room = ADVENTURE.rooms[event.target.id];
    if (event.target.doorway !== undefined) {
      const door = ADVENTURE.doors[event.target.doorway.doorId];
      return `The ${event.target.doorway.open ? "open" : "closed"} ${door.name} leads to ${room.name}.`;
    }
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

function renderEvent(event: Event, state: SessionState): string {
  switch (event.type) {
    case "help-requested":
      return renderHelp(event.commands);
    case "room-described":
      return renderRoom(event, state);
    case "target-inspected":
      return renderInspection(event);
    case "room-entered":
      return `You move from ${ADVENTURE.rooms[event.fromRoomId].name} to ${ADVENTURE.rooms[event.roomId].name}.`;
    case "door-opened":
      return `You open the ${ADVENTURE.doors[event.doorId].name}.`;
    case "door-already-open":
      return `The ${ADVENTURE.doors[event.doorId].name} is already open.`;
    case "item-taken":
      return `You take the ${ADVENTURE.items[event.itemId].name}.`;
    case "combat-started":
      return `Combat begins against the ${ADVENTURE.opponents[event.opponentId].name}.`;
    case "initiative-rolled": {
      const combatantName =
        event.combatantId === "fighter"
          ? "Fighter"
          : ADVENTURE.opponents[event.combatantId].name;
      return `Initiative — ${combatantName}: d20 roll ${event.roll} + modifier ${event.bonus} = ${event.total}.`;
    }
    case "turn-started":
      return `Turn: ${event.combatantId === "fighter" ? "Fighter" : ADVENTURE.opponents[event.combatantId].name}.`;
    case "attack-resolved": {
      const attacker =
        event.attackerId === "fighter"
          ? {
              name: "Fighter",
              attackName: ADVENTURE.equipment[ADVENTURE.fighter.weaponId].name,
            }
          : {
              name: ADVENTURE.opponents[event.attackerId].name,
              attackName: ADVENTURE.opponents[event.attackerId].attackName,
            };
      const targetName =
        event.targetId === "fighter"
          ? "Fighter"
          : ADVENTURE.opponents[event.targetId].name;
      const outcome =
        event.outcome === "critical-hit" ? "critical hit" : event.outcome;
      const damage =
        event.damage === undefined
          ? "Damage: none (not rolled)."
          : `Damage: ${event.damage}.`;
      return [
        `${attacker.name} attacks ${targetName} with ${attacker.attackName}.`,
        `Attack roll: d20 ${event.attackRoll} + modifier ${event.attackBonus} = ${event.attackTotal} vs AC ${event.targetArmorClass} — ${outcome}.`,
        damage,
        `Remaining HP: ${targetName} ${event.targetHp}/${event.targetMaxHp}.`,
      ].join("\n");
    }
    case "combat-ended":
      return event.outcome === "goblin-defeated"
        ? "Combat victory! The goblin is defeated."
        : `Defeat! The fighter has fallen. ${ENDING_GUIDANCE}`;
    case "victory":
      return `Victory! You escaped through the ${ADVENTURE.objective.exitName} with the stolen signet. ${ENDING_GUIDANCE}`;
    case "status-described":
      return `Fighter HP: ${event.hp}/${event.maxHp}\nSession: ${event.status}.`;
    case "inventory-described": {
      const equipment = event.equipmentIds.map(
        (equipmentId) => ADVENTURE.equipment[equipmentId].name,
      );
      const items = event.itemIds.map((itemId) => ADVENTURE.items[itemId].name);
      return [
        `Equipped: ${equipment.join(", ") || "nothing"}.`,
        `Collectibles: ${items.join(", ") || "empty"}.`,
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
      if (rejection.command === "inspect") {
        return `What do you want to inspect? ${example("inspect")}`;
      }
      if (rejection.command === "move") {
        return `Where do you want to move? ${example("move")}`;
      }
      if (rejection.command === "attack") {
        return `What do you want to attack? ${example("attack")}`;
      }
      return rejection.command === "open"
        ? `What do you want to open? ${example("open")}`
        : `What do you want to take? ${example("take")}`;
    case "invisible-target":
      return `You can't see "${rejection.target}" here. Use "look" to see visible features and exits.`;
    case "not-openable":
      return `You can't open the ${rejection.target}.`;
    case "unknown-destination":
      return `You don't know a location named "${rejection.destination}". Use "look" to see named exits.`;
    case "nonadjacent-destination":
      return `${ADVENTURE.rooms[rejection.destinationId].name} isn't adjacent. Use "look" to see named exits.`;
    case "closed-door":
      return `The ${ADVENTURE.doors[rejection.doorId].name} to ${ADVENTURE.rooms[rejection.destinationId].name} is closed. Open it before moving through.`;
    case "already-carried":
      return `You are already carrying the ${ADVENTURE.items[rejection.itemId].name}.`;
    case "combat-restriction":
      return 'You cannot do that during combat. Attack the goblin with "attack goblin".';
    case "invalid-attack-target":
      return `You cannot attack "${rejection.target}" here.`;
    case "dead-target":
      return `The ${ADVENTURE.opponents[rejection.targetId].name} is already defeated.`;
    case "leave-requirement":
      if (rejection.requirement === "reliquary") {
        return "You must be in the Reliquary to leave through its far exit. The entrance is not a way to complete the objective.";
      }
      if (rejection.requirement === "signet") {
        return "You need the stolen signet before leaving through the far exit.";
      }
      return "The fighter must be alive to escape with the signet.";
    case "terminal-state":
      return "The adventure is over; you can't change the final state. You may look, inspect, check status or inventory, ask for help, or quit.";
    default:
      rejection satisfies never;
      throw new Error("Unreachable rejection");
  }
}

export function renderResult(result: ActionResult): string {
  if (result.rejection !== undefined) {
    return renderRejection(result.rejection);
  }

  return result.events
    .map((event) => renderEvent(event, result.state))
    .join("\n");
}
