import {
  ADVENTURE,
  type DoorId,
  type EquipmentId,
  type FeatureId,
  type ItemId,
  type OpponentId,
  type RoomId,
} from "./adventure.js";
import type { CombatantId } from "./combat.js";
import type { RandomSource } from "./random.js";
import {
  handleGameAction,
  type Event,
  type GameAction,
  type InspectableRef,
  type Rejection,
  type SessionState,
} from "./session.js";

export const GAME_TOOL_SCHEMA_VERSION = "stolen-signet-tools-v1";

export type DmScene = Readonly<{
  title: string;
  objective: string;
  outcome: SessionState["status"];
  room: Readonly<{
    id: RoomId;
    name: string;
    description: string;
    features: readonly Readonly<{
      id: FeatureId;
      name: string;
      description: string;
    }>[];
    items: readonly Readonly<{
      id: ItemId;
      name: string;
      description: string;
      placement: Readonly<{
        featureId: FeatureId;
        description: string;
      }>;
    }>[];
    opponents: readonly Readonly<{
      id: OpponentId;
      name: string;
      condition: "living" | "defeated";
    }>[];
    exits: readonly Readonly<{
      destinationId: RoomId;
      name: string;
      doorway?: Readonly<{
        doorId: DoorId;
        name: string;
        open: boolean;
      }>;
    }>[];
  }>;
  combat?: Readonly<{
    opponentId: OpponentId;
    currentTurn: CombatantId;
  }>;
}>;

export type CharacterStatus = Readonly<{
  hp: number;
  maxHp: number;
  equipment: readonly Readonly<{ id: EquipmentId; name: string }>[];
  collectedItems: readonly Readonly<{ id: ItemId; name: string }>[];
  outcome: SessionState["status"];
  combatTurn?: CombatantId;
}>;

type JsonSchema = Readonly<Record<string, unknown>>;

export type GameToolDefinition = Readonly<{
  type: "function";
  name: GameToolName;
  description: string;
  strict: true;
  parameters: JsonSchema;
}>;

export type GameToolName =
  | "look"
  | "move"
  | "inspect"
  | "open"
  | "take"
  | "attack"
  | "leave"
  | "get_character_status";

export type GameToolCall = Readonly<{
  name: string;
  argumentsJson: string;
}>;

export type DmInspection = Readonly<
  | {
      type: "feature";
      id: FeatureId;
      name: string;
      description: string;
    }
  | {
      type: "item";
      id: ItemId;
      name: string;
      description: string;
    }
  | {
      type: "opponent";
      id: OpponentId;
      name: string;
      description: string;
      condition: "living" | "defeated";
    }
  | {
      type: "door";
      id: DoorId;
      name: string;
      description: string;
      open: boolean;
    }
  | {
      type: "named_exit";
      destinationId: RoomId;
      name: string;
      doorway?: Readonly<{
        doorId: DoorId;
        name: string;
        open: boolean;
      }>;
    }
>;

type ToolValidationErrorCode =
  | "unknown-tool"
  | "malformed-json"
  | "invalid-arguments"
  | "unavailable-reference";

type ReferenceValidationError = "invalid-arguments" | "unavailable-reference";

export type GameToolDispatchResult = Readonly<{
  state: SessionState;
  engineResult?:
    Readonly<{ events: readonly Event[] }> | Readonly<{ rejection: Rejection }>;
  modelOutput:
    | Readonly<{
        ok: true;
        scene?: DmScene;
        status?: CharacterStatus;
        events?: readonly Event[];
        inspection?: DmInspection;
      }>
    | Readonly<{
        ok: false;
        error:
          | Readonly<{ code: ToolValidationErrorCode }>
          | Readonly<{ code: "action-rejected"; rejection: Rejection }>;
        scene?: DmScene;
      }>;
}>;

type Visibility = Readonly<{
  room: (typeof ADVENTURE.rooms)[RoomId];
  featureIds: readonly FeatureId[];
  itemIds: readonly ItemId[];
  carriedItemIds: readonly ItemId[];
  opponentIds: readonly OpponentId[];
  attackableOpponentIds: readonly OpponentId[];
  destinationIds: readonly RoomId[];
  doorIds: readonly DoorId[];
}>;

function doorBetween(firstRoomId: RoomId, secondRoomId: RoomId) {
  return Object.values(ADVENTURE.doors).find(
    (door) =>
      door.roomIds.includes(firstRoomId) && door.roomIds.includes(secondRoomId),
  );
}

function deriveVisibility(state: SessionState): Visibility {
  const room = ADVENTURE.rooms[state.locationId];
  const opponentIds = Object.values(ADVENTURE.opponents)
    .filter((opponent) => opponent.roomId === state.locationId)
    .map(({ id }) => id);
  return {
    room,
    featureIds: room.features.map(({ id }) => id),
    itemIds: Object.entries(state.itemPlacements)
      .filter(
        ([, placement]) =>
          placement.type === "room" && placement.roomId === state.locationId,
      )
      .map(([itemId]) => itemId as ItemId),
    carriedItemIds: Object.entries(state.itemPlacements)
      .filter(([, placement]) => placement.type === "inventory")
      .map(([itemId]) => itemId as ItemId),
    opponentIds,
    attackableOpponentIds: opponentIds.filter(
      (opponentId) => state.opponents[opponentId].hp > 0,
    ),
    destinationIds: room.exitRoomIds,
    doorIds: Object.values(ADVENTURE.doors)
      .filter((door) => door.roomIds.includes(state.locationId))
      .map(({ id }) => id),
  };
}

function isActiveEncounter(state: SessionState): boolean {
  const opponent = ADVENTURE.opponents.goblin;
  return (
    state.status === "playing" &&
    state.locationId === opponent.roomId &&
    state.fighter.hp > 0 &&
    state.opponents[opponent.id].hp > 0
  );
}

function activeCombat(state: SessionState) {
  return isActiveEncounter(state) ? state.combat : undefined;
}

export function projectDmScene(state: SessionState): DmScene {
  const visibility = deriveVisibility(state);
  const { room } = visibility;
  const combat = activeCombat(state);
  return {
    title: ADVENTURE.title,
    objective: ADVENTURE.objective.description,
    outcome: state.status,
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      features: room.features.map(({ id, name, description }) => ({
        id,
        name,
        description,
      })),
      items: Object.entries(state.itemPlacements)
        .filter(
          ([, placement]) =>
            placement.type === "room" && placement.roomId === room.id,
        )
        .map(([itemId, placement]) => {
          if (placement.type !== "room") {
            throw new Error("Unreachable item placement");
          }
          const item = ADVENTURE.items[itemId as ItemId];
          const feature = room.features.find(
            (candidate) => candidate.id === placement.featureId,
          );
          if (feature === undefined) {
            throw new Error(
              `Unknown item placement feature: ${placement.featureId}`,
            );
          }
          return {
            id: item.id,
            name: item.name,
            description: item.description,
            placement: {
              featureId: feature.id,
              description: `on the ${feature.name}`,
            },
          };
        }),
      opponents: visibility.opponentIds.map((opponentId) => {
        const opponent = ADVENTURE.opponents[opponentId];
        return {
          id: opponent.id,
          name: opponent.name,
          condition:
            state.opponents[opponent.id].hp > 0 ? "living" : "defeated",
        };
      }),
      exits: room.exitRoomIds.map((destinationId) => {
        const destination = ADVENTURE.rooms[destinationId];
        const door = doorBetween(room.id, destinationId);
        return {
          destinationId,
          name: destination.name,
          ...(door === undefined
            ? {}
            : {
                doorway: {
                  doorId: door.id,
                  name: door.name,
                  open: state.doorStates[door.id].open,
                },
              }),
        };
      }),
    },
    ...(combat === undefined
      ? {}
      : {
          combat: {
            opponentId: combat.opponentId,
            currentTurn: combat.currentTurn,
          },
        }),
  };
}

function objectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function stringEnum(values: readonly string[]): JsonSchema {
  return { type: "string", enum: values };
}

function tool(
  name: GameToolName,
  description: string,
  parameters: JsonSchema = objectSchema({}),
): GameToolDefinition {
  return { type: "function", name, description, strict: true, parameters };
}

function inspectTargetSchemas(visibility: Visibility): JsonSchema[] {
  const schemas: JsonSchema[] = [];
  const add = (
    type: string,
    idProperty: string,
    ids: readonly string[],
  ): void => {
    if (ids.length > 0) {
      schemas.push(
        objectSchema({
          type: stringEnum([type]),
          [idProperty]: stringEnum(ids),
        }),
      );
    }
  };
  add("feature", "feature_id", visibility.featureIds);
  add("door", "door_id", visibility.doorIds);
  add("item", "item_id", [...visibility.itemIds, ...visibility.carriedItemIds]);
  add("opponent", "opponent_id", visibility.opponentIds);
  add("named_exit", "destination_id", visibility.destinationIds);
  return schemas;
}

export function getGameToolDefinitions(
  state: SessionState,
): readonly GameToolDefinition[] {
  const visibility = deriveVisibility(state);
  const mutable = state.status === "playing" && !isActiveEncounter(state);
  const definitions: GameToolDefinition[] = [
    tool("look", "Inspect the current public scene without changing it."),
    tool(
      "inspect",
      "Inspect a visible feature, doorway, item, opponent, named exit, or carried item.",
      objectSchema({ target: { anyOf: inspectTargetSchemas(visibility) } }),
    ),
  ];

  if (mutable) {
    definitions.splice(
      1,
      0,
      tool(
        "move",
        "Attempt to move to a named adjacent location.",
        objectSchema({
          destination_id: stringEnum(visibility.destinationIds),
        }),
      ),
    );
  }
  if (mutable && visibility.doorIds.length > 0) {
    definitions.push(
      tool(
        "open",
        "Attempt to open a currently visible door.",
        objectSchema({ door_id: stringEnum(visibility.doorIds) }),
      ),
    );
  }
  if (mutable && visibility.itemIds.length > 0) {
    definitions.push(
      tool(
        "take",
        "Attempt to take a currently visible collectible.",
        objectSchema({ item_id: stringEnum(visibility.itemIds) }),
      ),
    );
  }
  const { attackableOpponentIds } = visibility;
  if (state.status === "playing" && attackableOpponentIds.length > 0) {
    definitions.push(
      tool(
        "attack",
        "Attempt one attack against a currently visible opponent.",
        objectSchema({ opponent_id: stringEnum(attackableOpponentIds) }),
      ),
    );
  }

  if (mutable) {
    definitions.push(
      tool("leave", "Attempt to leave through the adventure's explicit exit."),
    );
  }
  definitions.push(
    tool(
      "get_character_status",
      "Inspect exact character health, equipment, collected items, outcome, and combat turn.",
    ),
  );
  return definitions;
}

export function projectCharacterStatus(state: SessionState): CharacterStatus {
  const combat = activeCombat(state);
  return {
    hp: state.fighter.hp,
    maxHp: state.fighter.maxHp,
    equipment: state.fighter.equipmentIds.map((equipmentId) => ({
      id: equipmentId,
      name: ADVENTURE.equipment[equipmentId].name,
    })),
    collectedItems: Object.entries(state.itemPlacements)
      .filter(([, placement]) => placement.type === "inventory")
      .map(([itemId]) => ({
        id: itemId as ItemId,
        name: ADVENTURE.items[itemId as ItemId].name,
      })),
    outcome: state.status,
    ...(combat === undefined ? {} : { combatTurn: combat.currentTurn }),
  };
}

const TOOL_NAMES: readonly GameToolName[] = [
  "look",
  "move",
  "inspect",
  "open",
  "take",
  "attack",
  "leave",
  "get_character_status",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function validationFailure(
  state: SessionState,
  code: ToolValidationErrorCode,
): GameToolDispatchResult {
  return { state, modelOutput: { ok: false, error: { code } } };
}

type ParsedTool =
  | Readonly<{ type: "action"; action: GameAction }>
  | Readonly<{ type: "character-status" }>;

function validateReference<T extends string>(
  value: unknown,
  available: readonly T[],
):
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReferenceValidationError }> {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid-arguments" };
  }
  return available.includes(value as T)
    ? { ok: true, value: value as T }
    : { ok: false, error: "unavailable-reference" };
}

function mapReference<T extends string, U>(
  value: unknown,
  available: readonly T[],
  map: (reference: T) => U,
): U | ReferenceValidationError {
  const reference = validateReference(value, available);
  return reference.ok ? map(reference.value) : reference.error;
}

function parseInspectTarget(
  value: unknown,
  visibility: Visibility,
): InspectableRef | ReferenceValidationError {
  if (!isRecord(value) || typeof value.type !== "string") {
    return "invalid-arguments";
  }
  switch (value.type) {
    case "feature": {
      if (!hasExactlyKeys(value, ["type", "feature_id"])) {
        return "invalid-arguments";
      }
      return mapReference(
        value.feature_id,
        visibility.featureIds,
        (featureId) => ({ type: "feature", featureId }),
      );
    }
    case "door": {
      if (!hasExactlyKeys(value, ["type", "door_id"])) {
        return "invalid-arguments";
      }
      return mapReference(value.door_id, visibility.doorIds, (doorId) => ({
        type: "door",
        doorId,
      }));
    }
    case "item": {
      if (!hasExactlyKeys(value, ["type", "item_id"])) {
        return "invalid-arguments";
      }
      return mapReference(
        value.item_id,
        [...visibility.itemIds, ...visibility.carriedItemIds],
        (itemId) => ({ type: "item", itemId }),
      );
    }
    case "opponent": {
      if (!hasExactlyKeys(value, ["type", "opponent_id"])) {
        return "invalid-arguments";
      }
      return mapReference(
        value.opponent_id,
        visibility.opponentIds,
        (opponentId) => ({ type: "opponent", opponentId }),
      );
    }
    case "named_exit": {
      if (!hasExactlyKeys(value, ["type", "destination_id"])) {
        return "invalid-arguments";
      }
      return mapReference(
        value.destination_id,
        visibility.destinationIds,
        (destinationId) => ({ type: "named-exit", destinationId }),
      );
    }
    default:
      return "invalid-arguments";
  }
}

function parseTool(
  name: GameToolName,
  args: Record<string, unknown>,
  visibility: Visibility,
): ParsedTool | ToolValidationErrorCode {
  switch (name) {
    case "look":
    case "leave":
      return hasExactlyKeys(args, [])
        ? { type: "action", action: { type: name } }
        : "invalid-arguments";
    case "get_character_status":
      return hasExactlyKeys(args, [])
        ? { type: "character-status" }
        : "invalid-arguments";
    case "move": {
      if (!hasExactlyKeys(args, ["destination_id"])) {
        return "invalid-arguments";
      }
      return mapReference(
        args.destination_id,
        visibility.destinationIds,
        (destinationId) => ({
          type: "action",
          action: { type: "move", destinationId },
        }),
      );
    }
    case "open": {
      if (!hasExactlyKeys(args, ["door_id"])) {
        return "invalid-arguments";
      }
      return mapReference(args.door_id, visibility.doorIds, (doorId) => ({
        type: "action",
        action: { type: "open", doorId },
      }));
    }
    case "take": {
      if (!hasExactlyKeys(args, ["item_id"])) {
        return "invalid-arguments";
      }
      return mapReference(args.item_id, visibility.itemIds, (itemId) => ({
        type: "action",
        action: { type: "take", itemId },
      }));
    }
    case "attack": {
      if (!hasExactlyKeys(args, ["opponent_id"])) {
        return "invalid-arguments";
      }
      return mapReference(
        args.opponent_id,
        visibility.attackableOpponentIds,
        (opponentId) => ({
          type: "action",
          action: { type: "attack", opponentId },
        }),
      );
    }
    case "inspect": {
      if (!hasExactlyKeys(args, ["target"])) {
        return "invalid-arguments";
      }
      const target = parseInspectTarget(args.target, visibility);
      return typeof target === "string"
        ? target
        : { type: "action", action: { type: "inspect", target } };
    }
    default:
      name satisfies never;
      return "invalid-arguments";
  }
}

export function dispatchGameTool(
  state: SessionState,
  call: GameToolCall,
  random?: Pick<RandomSource, "roll">,
): GameToolDispatchResult {
  if (!TOOL_NAMES.includes(call.name as GameToolName)) {
    return validationFailure(state, "unknown-tool");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(call.argumentsJson) as unknown;
  } catch {
    return validationFailure(state, "malformed-json");
  }
  if (!isRecord(decoded)) {
    return validationFailure(state, "invalid-arguments");
  }

  const parsed = parseTool(
    call.name as GameToolName,
    decoded,
    deriveVisibility(state),
  );
  if (typeof parsed === "string") {
    return validationFailure(state, parsed);
  }
  if (parsed.type === "character-status") {
    return {
      state,
      modelOutput: { ok: true, status: projectCharacterStatus(state) },
    };
  }

  const result = handleGameAction(state, parsed.action, random);
  if (result.rejection !== undefined) {
    return {
      state: result.state,
      engineResult: { rejection: result.rejection },
      modelOutput: {
        ok: false,
        error: { code: "action-rejected", rejection: result.rejection },
        scene: projectDmScene(result.state),
      },
    };
  }
  return {
    state: result.state,
    engineResult: { events: result.events },
    modelOutput: {
      ok: true,
      events: result.events,
      scene: projectDmScene(result.state),
      ...(parsed.action.type === "inspect"
        ? { inspection: projectInspection(result.state, parsed.action.target) }
        : {}),
    },
  };
}

function projectInspection(
  state: SessionState,
  target: InspectableRef,
): DmInspection {
  switch (target.type) {
    case "feature": {
      const feature = Object.values(ADVENTURE.rooms)
        .flatMap(({ features }) => features)
        .find(({ id }) => id === target.featureId);
      if (feature === undefined) {
        throw new Error(`Unknown inspected feature: ${target.featureId}`);
      }
      return {
        type: "feature",
        id: feature.id,
        name: feature.name,
        description: feature.description,
      };
    }
    case "door": {
      const door = ADVENTURE.doors[target.doorId];
      return {
        type: "door",
        id: door.id,
        name: door.name,
        description: door.description,
        open: state.doorStates[door.id].open,
      };
    }
    case "item": {
      const item = ADVENTURE.items[target.itemId];
      return {
        type: "item",
        id: item.id,
        name: item.name,
        description: item.description,
      };
    }
    case "opponent": {
      const opponent = ADVENTURE.opponents[target.opponentId];
      return {
        type: "opponent",
        id: opponent.id,
        name: opponent.name,
        description: opponent.description,
        condition: state.opponents[opponent.id].hp > 0 ? "living" : "defeated",
      };
    }
    case "named-exit": {
      const destination = ADVENTURE.rooms[target.destinationId];
      const door = doorBetween(state.locationId, target.destinationId);
      return {
        type: "named_exit",
        destinationId: destination.id,
        name: destination.name,
        ...(door === undefined
          ? {}
          : {
              doorway: {
                doorId: door.id,
                name: door.name,
                open: state.doorStates[door.id].open,
              },
            }),
      };
    }
    default:
      target satisfies never;
      throw new Error("Unreachable inspectable reference");
  }
}
