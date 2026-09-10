import {
  ADVENTURE,
  type EquipmentId,
  type FeatureId,
  type RoomId,
} from "./adventure.js";

export type SessionState = Readonly<{
  locationId: RoomId;
  status: "playing" | "quit";
  fighter: Readonly<{
    hp: number;
    maxHp: number;
    equipmentIds: readonly EquipmentId[];
  }>;
  inventoryItemIds: readonly never[];
}>;

export type Action = Readonly<
  | { type: "help" }
  | { type: "look" }
  | { type: "inspect"; target?: string }
  | { type: "move"; destination?: string }
  | { type: "status" }
  | { type: "inventory" }
  | { type: "quit" }
  | { type: "empty" }
  | { type: "unknown"; input: string }
>;

export type Event = Readonly<
  | { type: "help-requested"; commands: readonly string[] }
  | {
      type: "room-described";
      roomId: RoomId;
      featureIds: readonly FeatureId[];
      exitRoomIds: readonly RoomId[];
    }
  | {
      type: "target-inspected";
      target:
        | Readonly<{ type: "feature"; id: FeatureId }>
        | Readonly<{ type: "exit"; id: RoomId }>;
    }
  | { type: "room-entered"; fromRoomId: RoomId; roomId: RoomId }
  | {
      type: "status-described";
      hp: number;
      maxHp: number;
      status: SessionState["status"];
    }
  | {
      type: "inventory-described";
      equipmentIds: readonly EquipmentId[];
      itemIds: readonly never[];
    }
  | { type: "session-quit" }
>;

export type Rejection = Readonly<
  | { reason: "empty" }
  | { reason: "unknown-command"; input: string }
  | { reason: "missing-argument"; command: "inspect" | "move" }
  | { reason: "invisible-target"; target: string }
  | { reason: "unknown-destination"; destination: string }
  | { reason: "nonadjacent-destination"; destinationId: RoomId }
>;

export type ActionResult =
  | Readonly<{
      state: SessionState;
      events: readonly Event[];
      rejection?: never;
    }>
  | Readonly<{
      state: SessionState;
      rejection: Rejection;
      events?: never;
    }>;

const COMMANDS = [
  "help",
  "look",
  "inspect <target>",
  "move <location>",
  "status",
  "inventory",
  "quit",
] as const;

export function createSession(): SessionState {
  return {
    locationId: ADVENTURE.startingRoomId,
    status: "playing",
    fighter: { hp: 20, maxHp: 20, equipmentIds: ["longsword"] },
    inventoryItemIds: [],
  };
}

function describedRoom(roomId: RoomId): Event {
  const room = ADVENTURE.rooms[roomId];
  return {
    type: "room-described",
    roomId,
    featureIds: room.features.map((feature) => feature.id),
    exitRoomIds: room.exitRoomIds,
  };
}

function normalizeTarget(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function resolveRoom(value: string): RoomId | undefined {
  const normalized = normalizeTarget(value);
  return Object.values(ADVENTURE.rooms).find(
    (room) => room.id === normalized || room.name.toLowerCase() === normalized,
  )?.id;
}

function inspect(
  state: SessionState,
  target: string | undefined,
): ActionResult {
  const normalized = normalizeTarget(target);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "inspect" },
    };
  }

  const room = ADVENTURE.rooms[state.locationId];
  const feature = room.features.find(
    (candidate) =>
      candidate.id === normalized ||
      candidate.name.toLowerCase() === normalized,
  );
  if (feature !== undefined) {
    return {
      state,
      events: [
        {
          type: "target-inspected",
          target: { type: "feature", id: feature.id },
        },
      ],
    };
  }

  const exitRoomId = room.exitRoomIds.find((candidate) => {
    const exitRoom = ADVENTURE.rooms[candidate];
    return (
      exitRoom.id === normalized || exitRoom.name.toLowerCase() === normalized
    );
  });
  if (exitRoomId !== undefined) {
    return {
      state,
      events: [
        {
          type: "target-inspected",
          target: { type: "exit", id: exitRoomId },
        },
      ],
    };
  }

  return {
    state,
    rejection: { reason: "invisible-target", target: normalized },
  };
}

function move(
  state: SessionState,
  destination: string | undefined,
): ActionResult {
  const normalized = normalizeTarget(destination);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "move" },
    };
  }

  const destinationId = resolveRoom(normalized);
  if (destinationId === undefined) {
    return {
      state,
      rejection: { reason: "unknown-destination", destination: normalized },
    };
  }

  const room = ADVENTURE.rooms[state.locationId];
  if (!room.exitRoomIds.includes(destinationId)) {
    return {
      state,
      rejection: { reason: "nonadjacent-destination", destinationId },
    };
  }

  const nextState: SessionState = { ...state, locationId: destinationId };
  return {
    state: nextState,
    events: [
      {
        type: "room-entered",
        fromRoomId: state.locationId,
        roomId: destinationId,
      },
      describedRoom(destinationId),
    ],
  };
}

export function handleAction(
  state: SessionState,
  action: Action,
): ActionResult {
  switch (action.type) {
    case "help":
      return {
        state,
        events: [{ type: "help-requested", commands: COMMANDS }],
      };
    case "look":
      return { state, events: [describedRoom(state.locationId)] };
    case "inspect":
      return inspect(state, action.target);
    case "move":
      return move(state, action.destination);
    case "status":
      return {
        state,
        events: [
          {
            type: "status-described",
            hp: state.fighter.hp,
            maxHp: state.fighter.maxHp,
            status: state.status,
          },
        ],
      };
    case "inventory":
      return {
        state,
        events: [
          {
            type: "inventory-described",
            equipmentIds: state.fighter.equipmentIds,
            itemIds: state.inventoryItemIds,
          },
        ],
      };
    case "empty":
      return { state, rejection: { reason: "empty" } };
    case "unknown":
      return {
        state,
        rejection: { reason: "unknown-command", input: action.input },
      };
    case "quit":
      return {
        state: { ...state, status: "quit" },
        events: [{ type: "session-quit" }],
      };
    default:
      action satisfies never;
      throw new Error("Unreachable action");
  }
}
