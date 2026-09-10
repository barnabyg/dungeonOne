import {
  ADVENTURE,
  type DoorId,
  type EquipmentId,
  type FeatureId,
  type ItemId,
  type RoomId,
} from "./adventure.js";

export type SessionState = Readonly<{
  locationId: RoomId;
  status: "playing" | "victory" | "quit";
  fighter: Readonly<{
    hp: number;
    maxHp: number;
    equipmentIds: readonly EquipmentId[];
  }>;
  itemPlacements: Readonly<
    Record<
      ItemId,
      | Readonly<{ type: "room"; roomId: RoomId; featureId: FeatureId }>
      | Readonly<{ type: "inventory" }>
    >
  >;
  doorStates: Readonly<Record<DoorId, Readonly<{ open: boolean }>>>;
}>;

export type Action = Readonly<
  | { type: "help" }
  | { type: "look" }
  | { type: "inspect"; target?: string }
  | { type: "move"; destination?: string }
  | { type: "open"; target?: string }
  | { type: "take"; target?: string }
  | { type: "status" }
  | { type: "inventory" }
  | { type: "leave" }
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
      visibleItems: readonly Readonly<{
        itemId: ItemId;
        featureId: FeatureId;
      }>[];
      exitRoomIds: readonly RoomId[];
      doorways: readonly Readonly<{
        doorId: DoorId;
        destinationId: RoomId;
        open: boolean;
      }>[];
    }
  | {
      type: "target-inspected";
      target:
        | Readonly<{ type: "feature"; id: FeatureId }>
        | Readonly<{
            type: "exit";
            id: RoomId;
            doorway?: Readonly<{ doorId: DoorId; open: boolean }>;
          }>
        | Readonly<{ type: "door"; id: DoorId; open: boolean }>
        | Readonly<{ type: "item"; id: ItemId }>;
    }
  | { type: "room-entered"; fromRoomId: RoomId; roomId: RoomId }
  | { type: "door-opened"; doorId: DoorId }
  | { type: "door-already-open"; doorId: DoorId }
  | { type: "item-taken"; itemId: ItemId }
  | { type: "victory" }
  | {
      type: "status-described";
      hp: number;
      maxHp: number;
      status: SessionState["status"];
    }
  | {
      type: "inventory-described";
      equipmentIds: readonly EquipmentId[];
      itemIds: readonly ItemId[];
    }
  | { type: "session-quit" }
>;

export type Rejection = Readonly<
  | { reason: "empty" }
  | { reason: "unknown-command"; input: string }
  | {
      reason: "missing-argument";
      command: "inspect" | "move" | "open" | "take";
    }
  | { reason: "invisible-target"; target: string }
  | { reason: "not-openable"; target: string }
  | { reason: "unknown-destination"; destination: string }
  | { reason: "nonadjacent-destination"; destinationId: RoomId }
  | { reason: "closed-door"; doorId: DoorId; destinationId: RoomId }
  | { reason: "already-carried"; itemId: ItemId }
  | {
      reason: "leave-requirement";
      requirement: "reliquary" | "signet" | "living-fighter";
    }
  | { reason: "terminal-state"; status: "victory" }
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
  "open <target>",
  "take <item>",
  "status",
  "inventory",
  "leave",
  "quit",
] as const;

export function createSession(): SessionState {
  return {
    locationId: ADVENTURE.startingRoomId,
    status: "playing",
    fighter: { hp: 20, maxHp: 20, equipmentIds: ["longsword"] },
    itemPlacements: {
      signet: {
        type: "room",
        roomId: "reliquary",
        featureId: "stone-pedestal",
      },
    },
    doorStates: { "entrance-door": { open: false } },
  };
}

function take(state: SessionState, target: string | undefined): ActionResult {
  const normalized = normalizeTarget(target);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "take" },
    };
  }

  const item = resolveItem(normalized);
  const placement =
    item === undefined ? undefined : state.itemPlacements[item.id];
  if (item !== undefined && placement?.type === "inventory") {
    return {
      state,
      rejection: { reason: "already-carried", itemId: item.id },
    };
  }
  if (
    item === undefined ||
    placement === undefined ||
    placement.type !== "room" ||
    placement.roomId !== state.locationId
  ) {
    return {
      state,
      rejection: { reason: "invisible-target", target: normalized },
    };
  }

  return {
    state: {
      ...state,
      itemPlacements: {
        ...state.itemPlacements,
        [item.id]: { type: "inventory" },
      },
    },
    events: [{ type: "item-taken", itemId: item.id }],
  };
}

function describedRoom(state: SessionState): Event {
  const room = ADVENTURE.rooms[state.locationId];
  return {
    type: "room-described",
    roomId: state.locationId,
    featureIds: room.features.map((feature) => feature.id),
    visibleItems: Object.entries(state.itemPlacements)
      .filter(
        ([, placement]) =>
          placement.type === "room" && placement.roomId === state.locationId,
      )
      .map(([itemId, placement]) => {
        if (placement.type !== "room") {
          throw new Error("Unreachable item placement");
        }
        return { itemId: itemId as ItemId, featureId: placement.featureId };
      }),
    exitRoomIds: room.exitRoomIds,
    doorways: Object.values(ADVENTURE.doors)
      .filter((door) => door.roomIds.includes(state.locationId))
      .map((door) => ({
        doorId: door.id,
        destinationId:
          door.roomIds[0] === state.locationId
            ? door.roomIds[1]
            : door.roomIds[0],
        open: state.doorStates[door.id].open,
      })),
  };
}

function normalizeTarget(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function resolveItem(value: string) {
  const normalized = normalizeTarget(value);
  return Object.values(ADVENTURE.items).find(
    (item) => item.name.toLowerCase() === normalized,
  );
}

function resolveRoom(value: string): RoomId | undefined {
  const normalized = normalizeTarget(value);
  return Object.values(ADVENTURE.rooms).find(
    (room) => room.name.toLowerCase() === normalized,
  )?.id;
}

function doorBetween(firstRoomId: RoomId, secondRoomId: RoomId) {
  return Object.values(ADVENTURE.doors).find(
    (door) =>
      door.roomIds.includes(firstRoomId) && door.roomIds.includes(secondRoomId),
  );
}

function resolveAccessibleDoor(roomId: RoomId, normalizedName: string) {
  return Object.values(ADVENTURE.doors).find(
    (door) =>
      door.name.toLowerCase() === normalizedName &&
      door.roomIds.includes(roomId),
  );
}

function open(state: SessionState, target: string | undefined): ActionResult {
  const normalized = normalizeTarget(target);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "open" },
    };
  }

  const door = resolveAccessibleDoor(state.locationId, normalized);
  if (door === undefined) {
    const room = ADVENTURE.rooms[state.locationId];
    const visibleNonDoor =
      room.features.some(
        (feature) => feature.name.toLowerCase() === normalized,
      ) ||
      room.exitRoomIds.some(
        (roomId) => ADVENTURE.rooms[roomId].name.toLowerCase() === normalized,
      );
    return {
      state,
      rejection: {
        reason: visibleNonDoor ? "not-openable" : "invisible-target",
        target: normalized,
      },
    };
  }

  if (state.doorStates[door.id].open) {
    return {
      state,
      events: [{ type: "door-already-open", doorId: door.id }],
    };
  }

  return {
    state: {
      ...state,
      doorStates: { ...state.doorStates, [door.id]: { open: true } },
    },
    events: [{ type: "door-opened", doorId: door.id }],
  };
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
  const door = resolveAccessibleDoor(state.locationId, normalized);
  if (door !== undefined) {
    return {
      state,
      events: [
        {
          type: "target-inspected",
          target: {
            type: "door",
            id: door.id,
            open: state.doorStates[door.id].open,
          },
        },
      ],
    };
  }

  const feature = room.features.find(
    (candidate) => candidate.name.toLowerCase() === normalized,
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

  const item = resolveItem(normalized);
  if (item !== undefined) {
    const placement = state.itemPlacements[item.id];
    if (
      placement.type === "inventory" ||
      (placement.type === "room" && placement.roomId === state.locationId)
    ) {
      return {
        state,
        events: [
          {
            type: "target-inspected",
            target: { type: "item", id: item.id },
          },
        ],
      };
    }
  }

  const exitRoomId = room.exitRoomIds.find((candidate) => {
    const exitRoom = ADVENTURE.rooms[candidate];
    return exitRoom.name.toLowerCase() === normalized;
  });
  if (exitRoomId !== undefined) {
    const doorway = doorBetween(state.locationId, exitRoomId);
    return {
      state,
      events: [
        {
          type: "target-inspected",
          target: {
            type: "exit",
            id: exitRoomId,
            ...(doorway === undefined
              ? {}
              : {
                  doorway: {
                    doorId: doorway.id,
                    open: state.doorStates[doorway.id].open,
                  },
                }),
          },
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

  const door = doorBetween(state.locationId, destinationId);
  if (door !== undefined && !state.doorStates[door.id].open) {
    return {
      state,
      rejection: {
        reason: "closed-door",
        doorId: door.id,
        destinationId,
      },
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
      describedRoom(nextState),
    ],
  };
}

function leave(state: SessionState): ActionResult {
  if (state.locationId !== ADVENTURE.objective.escapeRoomId) {
    return {
      state,
      rejection: { reason: "leave-requirement", requirement: "reliquary" },
    };
  }

  if (
    state.itemPlacements[ADVENTURE.objective.requiredItemId].type !==
    "inventory"
  ) {
    return {
      state,
      rejection: { reason: "leave-requirement", requirement: "signet" },
    };
  }

  if (state.fighter.hp <= 0) {
    return {
      state,
      rejection: {
        reason: "leave-requirement",
        requirement: "living-fighter",
      },
    };
  }

  return {
    state: { ...state, status: "victory" },
    events: [{ type: "victory" }],
  };
}

function isGameplayMutation(action: Action): boolean {
  return ["move", "open", "take", "leave"].includes(action.type);
}

export function handleAction(
  state: SessionState,
  action: Action,
): ActionResult {
  if (state.status === "victory" && isGameplayMutation(action)) {
    return {
      state,
      rejection: { reason: "terminal-state", status: "victory" },
    };
  }

  switch (action.type) {
    case "help":
      return {
        state,
        events: [{ type: "help-requested", commands: COMMANDS }],
      };
    case "look":
      return { state, events: [describedRoom(state)] };
    case "inspect":
      return inspect(state, action.target);
    case "move":
      return move(state, action.destination);
    case "open":
      return open(state, action.target);
    case "take":
      return take(state, action.target);
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
            itemIds: Object.entries(state.itemPlacements)
              .filter(([, placement]) => placement.type === "inventory")
              .map(([itemId]) => itemId as ItemId),
          },
        ],
      };
    case "leave":
      return leave(state);
    case "empty":
      return { state, rejection: { reason: "empty" } };
    case "unknown":
      return {
        state,
        rejection: { reason: "unknown-command", input: action.input },
      };
    case "quit":
      return {
        state:
          state.status === "victory" ? state : { ...state, status: "quit" },
        events: [{ type: "session-quit" }],
      };
    default:
      action satisfies never;
      throw new Error("Unreachable action");
  }
}
