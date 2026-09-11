import {
  ADVENTURE,
  type DoorId,
  type EquipmentId,
  type FeatureId,
  type ItemId,
  type OpponentId,
  type RoomId,
} from "./adventure.js";
import {
  resolveAttack,
  resolveInitiative,
  type AttackResolvedEvent,
  type CombatantId,
  type InitiativeRoll,
} from "./combat.js";
import type { RandomSource } from "./random.js";

export type SessionState = Readonly<{
  locationId: RoomId;
  status: "playing" | "victory" | "defeat" | "quit";
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
  opponents: Readonly<
    Record<OpponentId, Readonly<{ hp: number; maxHp: number }>>
  >;
  combat?: Readonly<{
    opponentId: OpponentId;
    initiative: Readonly<Record<CombatantId, InitiativeRoll>>;
    turnOrder: readonly [CombatantId, CombatantId];
    currentTurn: CombatantId;
  }>;
}>;

export type Action = Readonly<
  | { type: "help" }
  | { type: "look" }
  | { type: "inspect"; target?: string }
  | { type: "move"; destination?: string }
  | { type: "open"; target?: string }
  | { type: "take"; target?: string }
  | { type: "attack"; target?: string }
  | { type: "status" }
  | { type: "inventory" }
  | { type: "leave" }
  | { type: "quit" }
  | { type: "empty" }
  | { type: "unknown"; input: string }
>;

export type InspectableRef = Readonly<
  | { type: "feature"; featureId: FeatureId }
  | { type: "door"; doorId: DoorId }
  | { type: "item"; itemId: ItemId }
  | { type: "opponent"; opponentId: OpponentId }
  | { type: "named-exit"; destinationId: RoomId }
>;

export type GameAction = Readonly<
  | { type: "look" }
  | { type: "inspect"; target: InspectableRef }
  | { type: "move"; destinationId: RoomId }
  | { type: "open"; doorId: DoorId }
  | { type: "take"; itemId: ItemId }
  | { type: "attack"; opponentId: OpponentId }
  | { type: "leave" }
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
  | AttackResolvedEvent
  | { type: "combat-started"; opponentId: OpponentId }
  | (InitiativeRoll & { type: "initiative-rolled" })
  | { type: "turn-started"; combatantId: CombatantId }
  | {
      type: "combat-ended";
      outcome: "goblin-defeated" | "fighter-defeated";
    }
>;

export type Rejection = Readonly<
  | { reason: "empty" }
  | { reason: "unknown-command"; input: string }
  | {
      reason: "missing-argument";
      command: "inspect" | "move" | "open" | "take" | "attack";
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
  | { reason: "combat-restriction" }
  | { reason: "invalid-attack-target"; target: string }
  | { reason: "dead-target"; targetId: OpponentId }
  | { reason: "terminal-state"; status: "victory" | "defeat" }
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
  "attack <target>",
  "status",
  "inventory",
  "leave",
  "quit",
] as const;

export function createSession(): SessionState {
  return {
    locationId: ADVENTURE.startingRoomId,
    status: "playing",
    fighter: {
      hp: ADVENTURE.fighter.maxHp,
      maxHp: ADVENTURE.fighter.maxHp,
      equipmentIds: [ADVENTURE.fighter.weaponId],
    },
    itemPlacements: {
      signet: {
        type: "room",
        roomId: "reliquary",
        featureId: "stone-pedestal",
      },
    },
    doorStates: { "entrance-door": { open: false } },
    opponents: {
      goblin: {
        hp: ADVENTURE.opponents.goblin.maxHp,
        maxHp: ADVENTURE.opponents.goblin.maxHp,
      },
    },
  };
}

function takeCommand(
  state: SessionState,
  target: string | undefined,
): ActionResult {
  const normalized = normalizeTarget(target);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "take" },
    };
  }

  const item = resolveItem(normalized);
  if (item === undefined) {
    return {
      state,
      rejection: { reason: "invisible-target", target: normalized },
    };
  }

  return handleGameAction(state, { type: "take", itemId: item.id });
}

function takeItem(state: SessionState, itemId: ItemId): ActionResult {
  const placement = state.itemPlacements[itemId];
  if (placement?.type === "inventory") {
    return {
      state,
      rejection: { reason: "already-carried", itemId },
    };
  }
  if (
    placement === undefined ||
    placement.type !== "room" ||
    placement.roomId !== state.locationId
  ) {
    return invisibleTarget(state, itemName(itemId));
  }

  return {
    state: {
      ...state,
      itemPlacements: {
        ...state.itemPlacements,
        [itemId]: { type: "inventory" },
      },
    },
    events: [{ type: "item-taken", itemId }],
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

function resolveFeature(value: string) {
  const normalized = normalizeTarget(value);
  return Object.values(ADVENTURE.rooms)
    .flatMap((room) => room.features)
    .find((feature) => feature.name.toLowerCase() === normalized);
}

function resolveDoor(value: string) {
  const normalized = normalizeTarget(value);
  return Object.values(ADVENTURE.doors).find(
    (door) => door.name.toLowerCase() === normalized,
  );
}

function resolveOpponent(value: string) {
  const normalized = normalizeTarget(value);
  return Object.values(ADVENTURE.opponents).find(
    (opponent) => opponent.name.toLowerCase() === normalized,
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

function isActiveCombat(state: SessionState): boolean {
  const goblin = ADVENTURE.opponents.goblin;
  return (
    state.status === "playing" &&
    state.locationId === goblin.roomId &&
    state.fighter.hp > 0 &&
    state.opponents[goblin.id].hp > 0
  );
}

function resolveGoblinTurn(
  state: SessionState,
  random: Pick<RandomSource, "roll">,
): Readonly<{ state: SessionState; events: readonly Event[] }> {
  const goblin = ADVENTURE.opponents.goblin;
  const attack = resolveAttack(
    {
      attackerId: goblin.id,
      targetId: "fighter",
      attackBonus: goblin.attackBonus,
      targetArmorClass: ADVENTURE.fighter.armorClass,
      targetMaxHp: ADVENTURE.fighter.maxHp,
      damage: goblin.damage,
    },
    state.fighter.hp,
    random,
  );
  const fighterDefeated = attack.targetHp === 0;
  const nextState: SessionState = {
    ...state,
    status: fighterDefeated ? "defeat" : "playing",
    fighter: { ...state.fighter, hp: attack.targetHp },
    ...(state.combat === undefined
      ? {}
      : {
          combat: {
            ...state.combat,
            currentTurn: fighterDefeated ? goblin.id : "fighter",
          },
        }),
  };
  return {
    state: nextState,
    events: [
      { type: "turn-started", combatantId: goblin.id },
      attack.event,
      fighterDefeated
        ? { type: "combat-ended", outcome: "fighter-defeated" }
        : { type: "turn-started", combatantId: "fighter" },
    ],
  };
}

function attackCommand(
  state: SessionState,
  target: string | undefined,
  random: Pick<RandomSource, "roll"> | undefined,
): ActionResult {
  const normalized = normalizeTarget(target);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "attack" },
    };
  }

  const opponent = resolveOpponent(normalized);
  if (opponent === undefined) {
    return {
      state,
      rejection: { reason: "invalid-attack-target", target: normalized },
    };
  }

  return handleGameAction(
    state,
    { type: "attack", opponentId: opponent.id },
    random,
  );
}

function attackOpponent(
  state: SessionState,
  opponentId: OpponentId,
  random: Pick<RandomSource, "roll"> | undefined,
): ActionResult {
  const goblin = ADVENTURE.opponents[opponentId];
  if (goblin === undefined || state.locationId !== goblin.roomId) {
    return {
      state,
      rejection: {
        reason: "invalid-attack-target",
        target: opponentName(opponentId),
      },
    };
  }
  if (state.opponents[opponentId].hp <= 0) {
    return {
      state,
      rejection: { reason: "dead-target", targetId: opponentId },
    };
  }
  if (!isActiveCombat(state)) {
    return {
      state,
      rejection: {
        reason: "invalid-attack-target",
        target: opponentName(opponentId),
      },
    };
  }
  if (random === undefined) {
    throw new Error("A random source is required for combat.");
  }

  const weapon = ADVENTURE.equipment[ADVENTURE.fighter.weaponId];
  const playerAttack = resolveAttack(
    {
      attackerId: "fighter",
      targetId: goblin.id,
      attackBonus: ADVENTURE.fighter.attackBonus,
      targetArmorClass: goblin.armorClass,
      targetMaxHp: goblin.maxHp,
      damage: weapon.damage,
    },
    state.opponents[goblin.id].hp,
    random,
  );
  const nextState: SessionState = {
    ...state,
    opponents: {
      ...state.opponents,
      [goblin.id]: {
        ...state.opponents[goblin.id],
        hp: playerAttack.targetHp,
      },
    },
  };
  const events: Event[] = [playerAttack.event];

  if (playerAttack.targetHp === 0) {
    events.push({ type: "combat-ended", outcome: "goblin-defeated" });
    return { state: nextState, events };
  }

  const goblinTurn = resolveGoblinTurn(nextState, random);
  events.push(...goblinTurn.events);
  return { state: goblinTurn.state, events };
}

function openCommand(
  state: SessionState,
  target: string | undefined,
): ActionResult {
  const normalized = normalizeTarget(target);
  if (normalized.length === 0) {
    return {
      state,
      rejection: { reason: "missing-argument", command: "open" },
    };
  }

  const door = resolveDoor(normalized);
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

  return handleGameAction(state, { type: "open", doorId: door.id });
}

function openDoor(state: SessionState, doorId: DoorId): ActionResult {
  const door = ADVENTURE.doors[doorId];
  if (door === undefined || !door.roomIds.includes(state.locationId)) {
    return invisibleTarget(state, doorName(doorId));
  }

  if (state.doorStates[doorId].open) {
    return {
      state,
      events: [{ type: "door-already-open", doorId }],
    };
  }

  return {
    state: {
      ...state,
      doorStates: { ...state.doorStates, [doorId]: { open: true } },
    },
    events: [{ type: "door-opened", doorId }],
  };
}

function inspectCommand(
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

  const door = resolveDoor(normalized);
  if (door !== undefined) {
    return handleGameAction(state, {
      type: "inspect",
      target: { type: "door", doorId: door.id },
    });
  }

  const feature = resolveFeature(normalized);
  if (feature !== undefined) {
    return handleGameAction(state, {
      type: "inspect",
      target: { type: "feature", featureId: feature.id },
    });
  }

  const item = resolveItem(normalized);
  if (item !== undefined) {
    return handleGameAction(state, {
      type: "inspect",
      target: { type: "item", itemId: item.id },
    });
  }

  const opponent = resolveOpponent(normalized);
  if (opponent !== undefined) {
    return handleGameAction(state, {
      type: "inspect",
      target: { type: "opponent", opponentId: opponent.id },
    });
  }

  const destinationId = resolveRoom(normalized);
  if (destinationId !== undefined) {
    return handleGameAction(state, {
      type: "inspect",
      target: {
        type: "named-exit",
        destinationId,
      },
    });
  }

  return {
    state,
    rejection: { reason: "invisible-target", target: normalized },
  };
}

function inspectTarget(
  state: SessionState,
  target: InspectableRef,
): ActionResult {
  const room = ADVENTURE.rooms[state.locationId];

  switch (target.type) {
    case "feature": {
      const feature = room.features.find(
        (candidate) => candidate.id === target.featureId,
      );
      return feature === undefined
        ? invisibleTarget(state, featureName(target.featureId))
        : {
            state,
            events: [
              {
                type: "target-inspected",
                target: { type: "feature", id: feature.id },
              },
            ],
          };
    }
    case "door": {
      const door = Object.values(ADVENTURE.doors).find(
        (candidate) =>
          candidate.id === target.doorId &&
          candidate.roomIds.includes(state.locationId),
      );
      return door === undefined
        ? invisibleTarget(state, doorName(target.doorId))
        : {
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
    case "item": {
      const placement = state.itemPlacements[target.itemId];
      return placement?.type === "inventory" ||
        (placement?.type === "room" && placement.roomId === state.locationId)
        ? {
            state,
            events: [
              {
                type: "target-inspected",
                target: { type: "item", id: target.itemId },
              },
            ],
          }
        : invisibleTarget(state, itemName(target.itemId));
    }
    case "opponent":
      return invisibleTarget(state, opponentName(target.opponentId));
    case "named-exit": {
      if (!room.exitRoomIds.includes(target.destinationId)) {
        return invisibleTarget(state, roomName(target.destinationId));
      }
      const doorway = doorBetween(state.locationId, target.destinationId);
      return {
        state,
        events: [
          {
            type: "target-inspected",
            target: {
              type: "exit",
              id: target.destinationId,
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
    default:
      target satisfies never;
      throw new Error("Unreachable inspectable reference");
  }
}

function invisibleTarget(state: SessionState, target: string): ActionResult {
  return { state, rejection: { reason: "invisible-target", target } };
}

function featureName(featureId: FeatureId): string {
  return (
    Object.values(ADVENTURE.rooms)
      .flatMap((room) => room.features)
      .find((feature) => feature.id === featureId)?.name ?? featureId
  );
}

function doorName(doorId: DoorId): string {
  return ADVENTURE.doors[doorId]?.name ?? doorId;
}

function itemName(itemId: ItemId): string {
  return ADVENTURE.items[itemId]?.name ?? itemId;
}

function opponentName(opponentId: OpponentId): string {
  return ADVENTURE.opponents[opponentId]?.name ?? opponentId;
}

function roomName(roomId: RoomId): string {
  return ADVENTURE.rooms[roomId]?.name.toLowerCase() ?? roomId;
}

function moveCommand(
  state: SessionState,
  destination: string | undefined,
  random: Pick<RandomSource, "roll"> | undefined,
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

  return handleGameAction(state, { type: "move", destinationId }, random);
}

function moveTo(
  state: SessionState,
  destinationId: RoomId,
  random: Pick<RandomSource, "roll"> | undefined,
): ActionResult {
  if (ADVENTURE.rooms[destinationId] === undefined) {
    return {
      state,
      rejection: {
        reason: "unknown-destination",
        destination: destinationId,
      },
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

  let nextState: SessionState = { ...state, locationId: destinationId };
  const events: Event[] = [
    {
      type: "room-entered",
      fromRoomId: state.locationId,
      roomId: destinationId,
    },
    describedRoom(nextState),
  ];
  const goblin = ADVENTURE.opponents.goblin;
  if (
    destinationId === goblin.roomId &&
    nextState.opponents[goblin.id].hp > 0
  ) {
    if (random === undefined) {
      throw new Error("A random source is required for combat.");
    }
    const initiative = resolveInitiative(
      {
        combatantId: "fighter",
        bonus: ADVENTURE.fighter.initiativeBonus,
      },
      { combatantId: goblin.id, bonus: goblin.initiativeBonus },
      random,
    );
    const initiativeByCombatant = Object.fromEntries(
      initiative.rolls.map((roll) => [roll.combatantId, roll]),
    ) as Record<CombatantId, InitiativeRoll>;
    nextState = {
      ...nextState,
      combat: {
        opponentId: goblin.id,
        initiative: initiativeByCombatant,
        turnOrder: initiative.turnOrder,
        currentTurn: initiative.turnOrder[0],
      },
    };
    events.push(
      { type: "combat-started", opponentId: goblin.id },
      ...initiative.rolls.map((roll) => ({
        type: "initiative-rolled" as const,
        ...roll,
      })),
    );
    if (initiative.turnOrder[0] === goblin.id) {
      const goblinTurn = resolveGoblinTurn(nextState, random);
      nextState = goblinTurn.state;
      events.push(...goblinTurn.events);
    } else {
      events.push({ type: "turn-started", combatantId: "fighter" });
    }
  }
  return {
    state: nextState,
    events,
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

function isGameplayMutation(
  type: Action["type"] | GameAction["type"],
): boolean {
  return ["move", "open", "take", "attack", "leave"].includes(type);
}

function gameplayRestriction(
  state: SessionState,
  actionType: Action["type"] | GameAction["type"],
): Rejection | undefined {
  if (
    (state.status === "victory" || state.status === "defeat") &&
    isGameplayMutation(actionType)
  ) {
    return { reason: "terminal-state", status: state.status };
  }
  if (
    isActiveCombat(state) &&
    isGameplayMutation(actionType) &&
    actionType !== "attack"
  ) {
    return { reason: "combat-restriction" };
  }
  return undefined;
}

export function handleGameAction(
  state: SessionState,
  action: GameAction,
  random?: Pick<RandomSource, "roll">,
): ActionResult {
  const restriction = gameplayRestriction(state, action.type);
  if (restriction !== undefined) {
    return { state, rejection: restriction };
  }

  switch (action.type) {
    case "look":
      return { state, events: [describedRoom(state)] };
    case "inspect":
      return inspectTarget(state, action.target);
    case "move":
      return moveTo(state, action.destinationId, random);
    case "open":
      return openDoor(state, action.doorId);
    case "take":
      return takeItem(state, action.itemId);
    case "attack":
      return attackOpponent(state, action.opponentId, random);
    case "leave":
      return leave(state);
    default:
      action satisfies never;
      throw new Error("Unreachable game action");
  }
}

export function handleAction(
  state: SessionState,
  action: Action,
  random?: Pick<RandomSource, "roll">,
): ActionResult {
  const restriction = gameplayRestriction(state, action.type);
  if (restriction !== undefined) {
    return { state, rejection: restriction };
  }

  switch (action.type) {
    case "help":
      return {
        state,
        events: [{ type: "help-requested", commands: COMMANDS }],
      };
    case "look":
      return handleGameAction(state, action, random);
    case "inspect":
      return inspectCommand(state, action.target);
    case "move":
      return moveCommand(state, action.destination, random);
    case "open":
      return openCommand(state, action.target);
    case "take":
      return takeCommand(state, action.target);
    case "attack":
      return attackCommand(state, action.target, random);
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
      return handleGameAction(state, action, random);
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
          state.status === "victory" || state.status === "defeat"
            ? state
            : { ...state, status: "quit" },
        events: [{ type: "session-quit" }],
      };
    default:
      action satisfies never;
      throw new Error("Unreachable action");
  }
}
