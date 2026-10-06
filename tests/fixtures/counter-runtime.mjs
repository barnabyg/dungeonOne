// A minimal `AdventureRuntime` for testing shared infrastructure (the DM turn
// loop, the OpenAI adapter) without any game's rules. The counter starts at
// 0; "advance" rolls a d6 and adds it, and "finish" wins once the counter
// reads at least 3.

const READ_TOOLS = ["look", "inspect", "get_character_status"];
const MUTATION_TOOLS = ["advance", "finish"];

function tool(name, properties = {}) {
  return {
    type: "function",
    name,
    description: name,
    strict: true,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}

function scene(state) {
  return {
    title: "Counter",
    objective: "Reach three.",
    outcome: state.status,
    room: {
      id: "hall",
      name: "Hall",
      description: `The counter reads ${state.count}.`,
      features: [
        { id: "counter", name: "Counter", description: "A brass counter." },
      ],
      items: [],
      opponents: [],
      exits: [],
    },
  };
}

function status(state) {
  return {
    hp: 5,
    maxHp: 5,
    equipment: [],
    collectedItems: [],
    outcome: state.status,
  };
}

function handleAction(state, action, random) {
  if (state.status !== "playing") {
    return { state, rejection: { reason: "session-ended" } };
  }
  if (action.type === "advance") {
    const roll = random.roll(6);
    return {
      state: { ...state, count: state.count + roll },
      events: [{ type: "advanced", by: roll }],
    };
  }
  if (action.type === "finish") {
    return state.count < 3
      ? { state, rejection: { reason: "count-too-low" } }
      : {
          state: { ...state, status: "victory" },
          events: [{ type: "finished" }],
        };
  }
  return { state, rejection: { reason: "unknown-command" } };
}

function parseArguments(argumentsJson) {
  try {
    const value = JSON.parse(argumentsJson);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function invalid(state, code) {
  return { state, modelOutput: { ok: false, error: { code } } };
}

function dispatchGameTool(state, call, random) {
  if (![...READ_TOOLS, ...MUTATION_TOOLS].includes(call.name)) {
    return invalid(state, "unknown-tool");
  }
  const args = parseArguments(call.argumentsJson);
  if (args === undefined) {
    return invalid(state, "malformed-json");
  }
  const keys = Object.keys(args);
  if (call.name === "inspect") {
    if (keys.length !== 1 || typeof args.target !== "string") {
      return invalid(state, "invalid-arguments");
    }
    if (args.target !== "counter") {
      return invalid(state, "unavailable-reference");
    }
    return {
      state,
      modelOutput: {
        ok: true,
        inspection: {
          type: "feature",
          id: "counter",
          name: "Counter",
          description: "A brass counter with a worn dial.",
        },
      },
    };
  }
  if (keys.length !== 0) {
    return invalid(state, "invalid-arguments");
  }
  if (call.name === "look") {
    return { state, modelOutput: { ok: true, scene: scene(state) } };
  }
  if (call.name === "get_character_status") {
    return { state, modelOutput: { ok: true, status: status(state) } };
  }
  const action = { type: call.name };
  const result = handleAction(state, action, random);
  return result.rejection === undefined
    ? {
        state: result.state,
        action,
        engineResult: { events: result.events },
        modelOutput: { ok: true, events: result.events },
      }
    : {
        state: result.state,
        action,
        engineResult: { rejection: result.rejection },
        modelOutput: {
          ok: false,
          error: { code: "action-rejected", rejection: result.rejection },
          scene: scene(result.state),
        },
      };
}

function renderResult(result) {
  if (result.rejection !== undefined) {
    return `Rejected: ${result.rejection.reason}.`;
  }
  return result.events
    .map((event) =>
      event.type === "advanced"
        ? `Advanced by ${event.by}; the counter reads ${result.state.count}.`
        : "You win.",
    )
    .join("\n");
}

/** A fresh counter runtime; `overrides` replace any of its members. */
export function counterRuntime(overrides = {}) {
  return Object.freeze({
    id: "counter",
    version: "1",
    rulesVersion: "counter-rules-v1",
    promptVersion: "counter-dm-v1",
    systemPrompt: "Counter DM instructions.",
    toolSchemaVersion: "counter-tools-v1",
    readToolNames: READ_TOOLS,
    mutationToolNames: MUTATION_TOOLS,
    commandTraceFormatVersion: 6,
    dmTraceFormatVersion: 6,
    createSession: () => ({ status: "playing", count: 0 }),
    handleAction,
    parseCommand: (input) => ({ type: input.trim() }),
    renderIntroduction: () => "A counter.",
    renderResult,
    dispatchGameTool,
    getGameToolDefinitions: (state) => [
      tool("look"),
      tool("inspect", { target: { type: "string", enum: ["counter"] } }),
      tool("get_character_status"),
      ...(state.status === "playing" ? [tool("advance"), tool("finish")] : []),
    ],
    projectCharacterStatus: status,
    projectDmScene: scene,
    ...overrides,
  });
}
