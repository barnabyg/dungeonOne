import {
  CHAPEL_TITLE,
  CHAPEL_OBJECTIVE,
  chapelRoom,
  chapelInspection,
  chapelSearchTargets,
  handleChapelAction,
  projectChapelJournal,
  type ChapelState,
} from "./chapel.js";
import type {
  CharacterStatus,
  DmScene,
  GameToolCall,
  GameToolDefinition,
  ToolValidationErrorCode,
} from "./game-tools.js";
import type { RuntimeToolResult } from "./runtime-contract.js";
import type { Action } from "./session.js";

export function projectChapelScene(state: ChapelState): DmScene {
  const room = chapelRoom(state.locationId);
  return {
    title: CHAPEL_TITLE,
    objective: CHAPEL_OBJECTIVE,
    outcome: state.status,
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      features: room.features,
      items: [],
      opponents: [],
      exits: room.exits.map((id) => ({ destinationId: id, name: id })),
    },
    journal: projectChapelJournal(state),
  };
}

export function projectChapelStatus(state: ChapelState): CharacterStatus {
  return {
    hp: state.fighter.hp,
    maxHp: state.fighter.maxHp,
    equipment: [{ id: "longsword", name: "longsword" }],
    collectedItems: [],
    outcome: state.status,
  };
}

export function getChapelTools(
  state: ChapelState,
): readonly GameToolDefinition[] {
  const room = chapelRoom(state.locationId);
  const searchTargets =
    state.status === "playing" ? chapelSearchTargets(state) : [];
  const definition = (
    name: GameToolDefinition["name"],
    description: string,
    properties: Readonly<Record<string, unknown>> = {},
  ): GameToolDefinition => ({
    type: "function",
    name,
    description,
    strict: true,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  });
  return [
    definition("look", "Read the current public scene."),
    definition(
      "get_character_status",
      "Read health, equipment and session status.",
    ),
    definition(
      "get_journal",
      "Read discovered facts, their sources, quest progress and known leads.",
    ),
    definition("inspect", "Inspect a public feature or adjacent route.", {
      target: {
        type: "string",
        enum: [...room.features.map(({ id }) => id), ...room.exits],
      },
    }),
    ...(searchTargets.length === 0
      ? []
      : [
          definition(
            "search",
            "Search visible authored evidence and record any discovery.",
            {
              target: {
                type: "string",
                enum: searchTargets,
              },
            },
          ),
        ]),
    ...(state.status === "playing"
      ? [
          definition("move", "Travel to an adjacent public location.", {
            destinationId: { type: "string", enum: room.exits },
          }),
        ]
      : []),
  ];
}

export function dispatchChapelTool(
  state: ChapelState,
  call: GameToolCall,
): RuntimeToolResult {
  const reject = (code: ToolValidationErrorCode): RuntimeToolResult => ({
    state,
    modelOutput: { ok: false, error: { code } },
  });
  const tool = getChapelTools(state).find(({ name }) => name === call.name);
  if (tool === undefined) {
    return reject("unknown-tool");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.argumentsJson) as unknown;
  } catch {
    return reject("malformed-json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return reject("invalid-arguments");
  }
  const args = parsed as Record<string, unknown>;
  const field =
    call.name === "move"
      ? "destinationId"
      : call.name === "inspect" || call.name === "search"
        ? "target"
        : undefined;
  if (
    Object.keys(args).length !== (field === undefined ? 0 : 1) ||
    (field !== undefined && typeof args[field] !== "string")
  ) {
    return reject("invalid-arguments");
  }
  if (call.name === "get_character_status") {
    return {
      state,
      modelOutput: { ok: true, status: projectChapelStatus(state) },
    };
  }
  if (call.name === "get_journal") {
    return {
      state,
      modelOutput: { ok: true, journal: projectChapelJournal(state) },
    };
  }
  let action: Action = { type: "look" };
  if (call.name === "move") {
    const destinationId = String(args.destinationId);
    const destination = chapelRoom(state.locationId).exits.find(
      (id) => id === destinationId,
    );
    if (destination === undefined) {
      return reject("unavailable-reference");
    }
    action = { type: "move", destination };
  } else if (call.name === "inspect") {
    const target = String(args.target);
    const room = chapelRoom(state.locationId);
    const reference = [
      ...room.features.map(({ id }) => id),
      ...room.exits,
    ].find((id) => id === target);
    if (reference === undefined) {
      return reject("unavailable-reference");
    }
    action = { type: "inspect", target: reference };
  } else if (call.name === "search") {
    const target = String(args.target);
    if (!chapelSearchTargets(state).some((id) => id === target)) {
      return reject("unavailable-reference");
    }
    action = { type: "search", target };
  }
  const result = handleChapelAction(state, action);
  if (result.rejection !== undefined) {
    return {
      state: result.state,
      engineResult: { rejection: result.rejection },
      modelOutput: {
        ok: false,
        error: { code: "action-rejected", rejection: result.rejection },
      },
    };
  }
  const inspection =
    action.type === "inspect"
      ? chapelInspection(state, action.target ?? "")
      : undefined;
  return {
    state: result.state,
    engineResult: { events: result.events },
    modelOutput: {
      ok: true,
      events: result.events,
      scene: projectChapelScene(result.state),
      ...(inspection === undefined
        ? {}
        : {
            inspection:
              inspection.type === "feature"
                ? inspection
                : {
                    type: "named_exit" as const,
                    destinationId: inspection.id,
                    name: inspection.name,
                  },
          }),
    },
  };
}
