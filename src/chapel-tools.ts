import {
  CHAPEL_TITLE,
  CHAPEL_OBJECTIVE,
  CHAPEL_TALK_APPROACHES,
  CHAPEL_OPPONENT_COMBATANTS,
  CHAPEL_OPPONENT_DEFINITIONS,
  chapelRoom,
  chapelInspection,
  chapelSearchTargets,
  handleChapelAction,
  projectChapelJournal,
  visibleChapelNpcs,
  type ChapelTalkApproach,
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

export function projectChapelScene(
  state: ChapelState,
  guardianEnabled = true,
): DmScene {
  const room = chapelRoom(state.locationId);
  const skeleton = CHAPEL_OPPONENT_COMBATANTS["skeleton-guardian"];
  const skeletonDefinition = CHAPEL_OPPONENT_DEFINITIONS[skeleton.definitionId];
  const skeletonVisible =
    guardianEnabled && state.locationId === skeleton.roomId;
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
      opponents: skeletonVisible
        ? [
            {
              id: skeleton.combatantId,
              name: skeletonDefinition.name,
              condition:
                state.opponents[skeleton.combatantId].hp > 0
                  ? "living"
                  : "defeated",
            },
          ]
        : [],
      npcs: visibleChapelNpcs(state),
      exits: room.exits.map((id) => ({ destinationId: id, name: id })),
    },
    journal: projectChapelJournal(state),
    ...(state.combat === undefined ||
    state.opponents[state.combat.opponentCombatantId].hp === 0
      ? {}
      : {
          combat: {
            opponentCombatantId: state.combat.opponentCombatantId,
            currentTurn: state.combat.currentTurn,
          },
        }),
  };
}

export function projectChapelStatus(state: ChapelState): CharacterStatus {
  return {
    hp: state.fighter.hp,
    maxHp: state.fighter.maxHp,
    equipment: [{ id: "longsword", name: "longsword" }],
    collectedItems: [],
    outcome: state.status,
    ...(state.combat === undefined ||
    state.opponents[state.combat.opponentCombatantId].hp === 0
      ? {}
      : { combatTurn: state.combat.currentTurn }),
  };
}

export function getChapelTools(
  state: ChapelState,
  guardianEnabled = true,
): readonly GameToolDefinition[] {
  const room = chapelRoom(state.locationId);
  const activeCombat =
    guardianEnabled &&
    state.status === "playing" &&
    state.combat !== undefined &&
    state.opponents[state.combat.opponentCombatantId].hp > 0;
  const searchTargets =
    state.status === "playing" ? chapelSearchTargets(state) : [];
  const visibleNpcs =
    state.status === "playing" && !activeCombat
      ? visibleChapelNpcs(state).filter(({ subjects }) => subjects.length > 0)
      : [];
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
    definition(
      "inspect",
      "Inspect a public feature, opponent, or adjacent route.",
      {
        target: {
          type: "string",
          enum: [
            ...room.features.map(({ id }) => id),
            ...(guardianEnabled && state.locationId === "crypt"
              ? ["skeleton-guardian"]
              : []),
            ...room.exits,
          ],
        },
      },
    ),
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
    ...(visibleNpcs.length === 0
      ? []
      : [
          definition(
            "talk",
            `Speak with a visible living NPC about a public subject. Visible speakers: ${visibleNpcs.map(({ name }) => name).join(", ")}.`,
            {
              speakerId: {
                type: "string",
                enum: visibleNpcs.map(({ id }) => id),
              },
              topicId: {
                type: "string",
                enum: visibleNpcs.flatMap(({ subjects }) =>
                  subjects.map(({ id }) => id),
                ),
              },
              approach: {
                type: "string",
                enum: CHAPEL_TALK_APPROACHES,
              },
            },
          ),
        ]),
    ...(activeCombat
      ? [
          definition("attack", "Attack the active opponent combatant.", {
            combatantId: {
              type: "string",
              enum: [state.combat?.opponentCombatantId],
            },
          }),
        ]
      : []),
    ...(state.status === "playing" && !activeCombat
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
  random?: Parameters<typeof handleChapelAction>[2],
  guardianEnabled = true,
): RuntimeToolResult {
  const reject = (code: ToolValidationErrorCode): RuntimeToolResult => ({
    state,
    modelOutput: { ok: false, error: { code } },
  });
  const tool = getChapelTools(state, guardianEnabled).find(
    ({ name }) => name === call.name,
  );
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
  if (call.name === "talk") {
    if (
      Object.keys(args).length !== 3 ||
      typeof args.speakerId !== "string" ||
      typeof args.topicId !== "string" ||
      typeof args.approach !== "string"
    ) {
      return reject("invalid-arguments");
    }
    const speaker = visibleChapelNpcs(state).find(
      ({ id }) => id === args.speakerId,
    );
    if (
      speaker === undefined ||
      !speaker.subjects.some(({ id }) => id === args.topicId) ||
      !CHAPEL_TALK_APPROACHES.includes(args.approach as ChapelTalkApproach)
    ) {
      return reject("unavailable-reference");
    }
  }
  if (call.name === "attack") {
    if (
      Object.keys(args).length !== 1 ||
      typeof args.combatantId !== "string"
    ) {
      return reject("invalid-arguments");
    }
    if (args.combatantId !== state.combat?.opponentCombatantId) {
      return reject("unavailable-reference");
    }
  }
  const field =
    call.name === "move"
      ? "destinationId"
      : call.name === "inspect" || call.name === "search"
        ? "target"
        : call.name === "talk"
          ? "talk"
          : undefined;
  if (
    call.name !== "talk" &&
    call.name !== "attack" &&
    (Object.keys(args).length !== (field === undefined ? 0 : 1) ||
      (field !== undefined && typeof args[field] !== "string"))
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
      ...(guardianEnabled && state.locationId === "crypt"
        ? ["skeleton-guardian"]
        : []),
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
  } else if (call.name === "talk") {
    action = {
      type: "talk",
      target: String(args.speakerId),
      topic: String(args.topicId),
      approach: String(args.approach),
    };
  } else if (call.name === "attack") {
    action = { type: "attack", target: String(args.combatantId) };
  }
  const result = handleChapelAction(state, action, random, guardianEnabled);
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
      ? chapelInspection(state, action.target ?? "", guardianEnabled)
      : undefined;
  const conversation =
    action.type === "talk"
      ? result.events.find((event) => event.type === "chapel-conversation")
          ?.conversation
      : undefined;
  if (action.type === "talk" && conversation === undefined) {
    throw new Error("Accepted talk action did not return a conversation.");
  }
  return {
    state: result.state,
    engineResult: { events: result.events },
    modelOutput: {
      ok: true,
      events: result.events,
      scene: projectChapelScene(result.state, guardianEnabled),
      ...(conversation === undefined ? {} : { conversation }),
      ...(inspection === undefined
        ? {}
        : {
            inspection:
              inspection.type === "feature" || inspection.type === "opponent"
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
