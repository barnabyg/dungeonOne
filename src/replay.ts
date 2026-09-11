import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import { ADVENTURE } from "./adventure.js";
import { parseCommand } from "./parser.js";
import { RANDOM_ALGORITHM, createSeededRandom } from "./random.js";
import { createSession, handleAction, type ActionResult } from "./session.js";
import {
  ADVENTURE_VERSION,
  RULES_VERSION,
  TRACE_FORMAT_VERSION,
  type RollRecord,
} from "./trace.js";

type JsonObject = Record<string, unknown>;

type ReplayAction = Readonly<{
  sequence: number;
  rawInput: string;
  action: JsonObject;
  rolls: readonly RollRecord[];
  result: JsonObject;
  stateAfter: JsonObject;
}>;

type ReplayTrace = Readonly<{
  initialSeed: number;
  initialState: JsonObject;
  actions: readonly ReplayAction[];
  completion: Readonly<{
    reason: "quit" | "eof";
    outcome: "victory" | "defeat" | "incomplete";
  }>;
}>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return value;
}

function requireOneOf(
  value: unknown,
  allowed: readonly string[],
  path: string,
): string {
  const actual = requireString(value, path);
  if (!allowed.includes(actual)) {
    throw new Error(`${path} must be one of: ${allowed.join(", ")}.`);
  }
  return actual;
}

function requireInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a safe integer.`);
  }
  return Number(value);
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  return value;
}

function requireExactKeys(
  value: JsonObject,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path} contains unsupported identifier ${key}.`);
    }
  }
  for (const key of allowed) {
    requireObject(value[key], `${path}.${key}`);
  }
}

function validateStringArray(value: unknown, path: string): void {
  requireArray(value, path).forEach((entry, index) => {
    requireString(entry, `${path}[${index}]`);
  });
}

function validateOneOfArray(
  value: unknown,
  allowed: readonly string[],
  path: string,
): void {
  requireArray(value, path).forEach((entry, index) => {
    requireOneOf(entry, allowed, `${path}[${index}]`);
  });
}

function validateAction(value: unknown, path: string): JsonObject {
  const action = requireObject(value, path);
  const type = requireString(action.type, `${path}.type`);
  switch (type) {
    case "help":
    case "look":
    case "status":
    case "inventory":
    case "leave":
    case "quit":
    case "empty":
      break;
    case "inspect":
    case "open":
    case "take":
    case "attack":
      if (action.target !== undefined) {
        requireString(action.target, `${path}.target`);
      }
      break;
    case "move":
      if (action.destination !== undefined) {
        requireString(action.destination, `${path}.destination`);
      }
      break;
    case "unknown":
      requireString(action.input, `${path}.input`);
      break;
    default:
      throw new Error(`${path}.type is not a supported action type.`);
  }
  return action;
}

function validateEvent(value: unknown, path: string): void {
  const event = requireObject(value, path);
  const type = requireString(event.type, `${path}.type`);
  switch (type) {
    case "help-requested":
      validateStringArray(event.commands, `${path}.commands`);
      break;
    case "room-described":
      requireOneOf(
        event.roomId,
        ["entrance", "guardroom", "reliquary"],
        `${path}.roomId`,
      );
      validateOneOfArray(
        event.featureIds,
        ["ruined-archway", "cold-hearth", "stone-pedestal"],
        `${path}.featureIds`,
      );
      validateOneOfArray(
        event.exitRoomIds,
        ["entrance", "guardroom", "reliquary"],
        `${path}.exitRoomIds`,
      );
      requireArray(event.visibleItems, `${path}.visibleItems`).forEach(
        (value, index) => {
          const item = requireObject(value, `${path}.visibleItems[${index}]`);
          requireOneOf(
            item.itemId,
            ["signet"],
            `${path}.visibleItems[${index}].itemId`,
          );
          requireOneOf(
            item.featureId,
            ["ruined-archway", "cold-hearth", "stone-pedestal"],
            `${path}.visibleItems[${index}].featureId`,
          );
        },
      );
      requireArray(event.doorways, `${path}.doorways`).forEach(
        (value, index) => {
          const doorway = requireObject(value, `${path}.doorways[${index}]`);
          requireOneOf(
            doorway.doorId,
            ["entrance-door"],
            `${path}.doorways[${index}].doorId`,
          );
          requireOneOf(
            doorway.destinationId,
            ["entrance", "guardroom", "reliquary"],
            `${path}.doorways[${index}].destinationId`,
          );
          requireBoolean(doorway.open, `${path}.doorways[${index}].open`);
        },
      );
      break;
    case "target-inspected": {
      const target = requireObject(event.target, `${path}.target`);
      const targetType = requireOneOf(
        target.type,
        ["feature", "exit", "door", "item"],
        `${path}.target.type`,
      );
      requireOneOf(
        target.id,
        targetType === "feature"
          ? ["ruined-archway", "cold-hearth", "stone-pedestal"]
          : targetType === "exit"
            ? ["entrance", "guardroom", "reliquary"]
            : targetType === "door"
              ? ["entrance-door"]
              : ["signet"],
        `${path}.target.id`,
      );
      if (targetType === "door") {
        requireBoolean(target.open, `${path}.target.open`);
      }
      if (targetType === "exit" && target.doorway !== undefined) {
        const doorway = requireObject(target.doorway, `${path}.target.doorway`);
        requireOneOf(
          doorway.doorId,
          ["entrance-door"],
          `${path}.target.doorway.doorId`,
        );
        requireBoolean(doorway.open, `${path}.target.doorway.open`);
      }
      break;
    }
    case "room-entered":
      requireOneOf(
        event.fromRoomId,
        ["entrance", "guardroom", "reliquary"],
        `${path}.fromRoomId`,
      );
      requireOneOf(
        event.roomId,
        ["entrance", "guardroom", "reliquary"],
        `${path}.roomId`,
      );
      break;
    case "door-opened":
    case "door-already-open":
      requireOneOf(event.doorId, ["entrance-door"], `${path}.doorId`);
      break;
    case "item-taken":
      requireOneOf(event.itemId, ["signet"], `${path}.itemId`);
      break;
    case "status-described":
      requireInteger(event.hp, `${path}.hp`);
      requireInteger(event.maxHp, `${path}.maxHp`);
      requireOneOf(
        event.status,
        ["playing", "victory", "defeat", "quit"],
        `${path}.status`,
      );
      break;
    case "inventory-described":
      validateOneOfArray(
        event.equipmentIds,
        ["longsword"],
        `${path}.equipmentIds`,
      );
      validateOneOfArray(event.itemIds, ["signet"], `${path}.itemIds`);
      break;
    case "attack-resolved":
      requireOneOf(
        event.attackerId,
        ["fighter", "goblin"],
        `${path}.attackerId`,
      );
      requireOneOf(event.targetId, ["fighter", "goblin"], `${path}.targetId`);
      for (const field of [
        "attackRoll",
        "attackBonus",
        "attackTotal",
        "targetArmorClass",
        "targetHp",
        "targetMaxHp",
      ]) {
        requireInteger(event[field], `${path}.${field}`);
      }
      requireOneOf(
        event.outcome,
        ["miss", "hit", "critical-hit"],
        `${path}.outcome`,
      );
      if (event.damage !== undefined) {
        requireInteger(event.damage, `${path}.damage`);
      }
      break;
    case "combat-started":
      requireOneOf(event.opponentId, ["goblin"], `${path}.opponentId`);
      break;
    case "initiative-rolled":
      requireOneOf(
        event.combatantId,
        ["fighter", "goblin"],
        `${path}.combatantId`,
      );
      requireInteger(event.bonus, `${path}.bonus`);
      requireInteger(event.roll, `${path}.roll`);
      requireInteger(event.total, `${path}.total`);
      break;
    case "turn-started":
      requireOneOf(
        event.combatantId,
        ["fighter", "goblin"],
        `${path}.combatantId`,
      );
      break;
    case "combat-ended":
      requireOneOf(
        event.outcome,
        ["goblin-defeated", "fighter-defeated"],
        `${path}.outcome`,
      );
      break;
    case "victory":
    case "session-quit":
      break;
    default:
      throw new Error(`${path}.type is not a supported event type.`);
  }
}

function validateRejection(value: unknown, path: string): void {
  const rejection = requireObject(value, path);
  const reason = requireString(rejection.reason, `${path}.reason`);
  switch (reason) {
    case "empty":
    case "combat-restriction":
      break;
    case "unknown-command":
      requireString(rejection.input, `${path}.input`);
      break;
    case "missing-argument":
      requireOneOf(
        rejection.command,
        ["inspect", "move", "open", "take", "attack"],
        `${path}.command`,
      );
      break;
    case "invisible-target":
    case "not-openable":
    case "invalid-attack-target":
      requireString(rejection.target, `${path}.target`);
      break;
    case "unknown-destination":
      requireString(rejection.destination, `${path}.destination`);
      break;
    case "nonadjacent-destination":
      requireOneOf(
        rejection.destinationId,
        ["entrance", "guardroom", "reliquary"],
        `${path}.destinationId`,
      );
      break;
    case "closed-door":
      requireOneOf(rejection.doorId, ["entrance-door"], `${path}.doorId`);
      requireOneOf(
        rejection.destinationId,
        ["entrance", "guardroom", "reliquary"],
        `${path}.destinationId`,
      );
      break;
    case "already-carried":
      requireOneOf(rejection.itemId, ["signet"], `${path}.itemId`);
      break;
    case "leave-requirement":
      requireOneOf(
        rejection.requirement,
        ["reliquary", "signet", "living-fighter"],
        `${path}.requirement`,
      );
      break;
    case "dead-target":
      requireOneOf(rejection.targetId, ["goblin"], `${path}.targetId`);
      break;
    case "terminal-state":
      requireOneOf(rejection.status, ["victory", "defeat"], `${path}.status`);
      break;
    default:
      throw new Error(`${path}.reason is not a supported rejection reason.`);
  }
}

function validateState(value: unknown, path: string): JsonObject {
  const state = requireObject(value, path);
  requireOneOf(
    state.locationId,
    ["entrance", "guardroom", "reliquary"],
    `${path}.locationId`,
  );
  requireOneOf(
    state.status,
    ["playing", "victory", "defeat", "quit"],
    `${path}.status`,
  );
  const fighter = requireObject(state.fighter, `${path}.fighter`);
  requireInteger(fighter.hp, `${path}.fighter.hp`);
  requireInteger(fighter.maxHp, `${path}.fighter.maxHp`);
  validateOneOfArray(
    fighter.equipmentIds,
    ["longsword"],
    `${path}.fighter.equipmentIds`,
  );

  const itemPlacements = requireObject(
    state.itemPlacements,
    `${path}.itemPlacements`,
  );
  requireExactKeys(itemPlacements, ["signet"], `${path}.itemPlacements`);
  for (const [id, value] of Object.entries(itemPlacements)) {
    const placement = requireObject(value, `${path}.itemPlacements.${id}`);
    const type = requireString(
      placement.type,
      `${path}.itemPlacements.${id}.type`,
    );
    if (type === "room") {
      requireOneOf(
        placement.roomId,
        ["entrance", "guardroom", "reliquary"],
        `${path}.itemPlacements.${id}.roomId`,
      );
      requireOneOf(
        placement.featureId,
        ["ruined-archway", "cold-hearth", "stone-pedestal"],
        `${path}.itemPlacements.${id}.featureId`,
      );
    } else if (type !== "inventory") {
      throw new Error(`${path}.itemPlacements.${id}.type is not supported.`);
    }
  }

  const doorStates = requireObject(state.doorStates, `${path}.doorStates`);
  requireExactKeys(doorStates, ["entrance-door"], `${path}.doorStates`);
  for (const [id, value] of Object.entries(doorStates)) {
    const door = requireObject(value, `${path}.doorStates.${id}`);
    requireBoolean(door.open, `${path}.doorStates.${id}.open`);
  }

  const opponents = requireObject(state.opponents, `${path}.opponents`);
  requireExactKeys(opponents, ["goblin"], `${path}.opponents`);
  for (const [id, value] of Object.entries(opponents)) {
    const opponent = requireObject(value, `${path}.opponents.${id}`);
    requireInteger(opponent.hp, `${path}.opponents.${id}.hp`);
    requireInteger(opponent.maxHp, `${path}.opponents.${id}.maxHp`);
  }

  if (state.combat !== undefined) {
    const combat = requireObject(state.combat, `${path}.combat`);
    requireOneOf(combat.opponentId, ["goblin"], `${path}.combat.opponentId`);
    const initiative = requireObject(
      combat.initiative,
      `${path}.combat.initiative`,
    );
    requireExactKeys(
      initiative,
      ["fighter", "goblin"],
      `${path}.combat.initiative`,
    );
    for (const [id, value] of Object.entries(initiative)) {
      const roll = requireObject(value, `${path}.combat.initiative.${id}`);
      requireOneOf(
        roll.combatantId,
        ["fighter", "goblin"],
        `${path}.combat.initiative.${id}.combatantId`,
      );
      requireInteger(roll.bonus, `${path}.combat.initiative.${id}.bonus`);
      requireInteger(roll.roll, `${path}.combat.initiative.${id}.roll`);
      requireInteger(roll.total, `${path}.combat.initiative.${id}.total`);
    }
    const turnOrder = requireArray(
      combat.turnOrder,
      `${path}.combat.turnOrder`,
    );
    if (turnOrder.length !== 2) {
      throw new Error(`${path}.combat.turnOrder must contain two entries.`);
    }
    turnOrder.forEach((combatantId, index) => {
      requireOneOf(
        combatantId,
        ["fighter", "goblin"],
        `${path}.combat.turnOrder[${index}]`,
      );
    });
    requireOneOf(
      combat.currentTurn,
      ["fighter", "goblin"],
      `${path}.combat.currentTurn`,
    );
  }
  return state;
}

function requireSupported(
  actual: unknown,
  expected: string | number,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(`Unsupported ${label} ${JSON.stringify(actual)}.`);
  }
}

function validateRoll(value: unknown, path: string): RollRecord {
  const roll = requireObject(value, path);
  if (!Number.isSafeInteger(roll.sides) || Number(roll.sides) <= 0) {
    throw new Error(`${path}.sides must be a positive safe integer.`);
  }
  if (
    !Number.isSafeInteger(roll.value) ||
    Number(roll.value) < 1 ||
    Number(roll.value) > Number(roll.sides)
  ) {
    throw new Error(`${path}.value must be an integer from 1 through sides.`);
  }
  return { sides: Number(roll.sides), value: Number(roll.value) };
}

function validateResult(value: unknown, path: string): JsonObject {
  const result = requireObject(value, path);
  if (result.type === "accepted") {
    requireArray(result.events, `${path}.events`).forEach((event, index) => {
      validateEvent(event, `${path}.events[${index}]`);
    });
  } else if (result.type === "rejected") {
    validateRejection(result.rejection, `${path}.rejection`);
  } else {
    throw new Error(`${path}.type must be "accepted" or "rejected".`);
  }
  return result;
}

function validateTrace(value: unknown): ReplayTrace {
  const trace = requireObject(value, "Trace");
  requireSupported(
    trace.formatVersion,
    TRACE_FORMAT_VERSION,
    "trace format version",
  );
  requireSupported(trace.rulesVersion, RULES_VERSION, "rules version");

  const adventure = requireObject(trace.adventure, "adventure");
  requireSupported(adventure.id, ADVENTURE.id, "adventure id");
  requireSupported(adventure.version, ADVENTURE_VERSION, "adventure version");

  const random = requireObject(trace.random, "random");
  requireSupported(random.algorithm, RANDOM_ALGORITHM, "random algorithm");
  if (
    !Number.isInteger(random.initialSeed) ||
    Number(random.initialSeed) < 0 ||
    Number(random.initialSeed) > 0xffff_ffff
  ) {
    throw new Error("random.initialSeed must be an unsigned 32-bit integer.");
  }

  const initialState = validateState(trace.initialState, "initialState");
  if (!Array.isArray(trace.actions)) {
    throw new Error("actions must be an array.");
  }
  const actions = trace.actions.map((value, index): ReplayAction => {
    const path = `actions[${index}]`;
    const entry = requireObject(value, path);
    if (entry.sequence !== index + 1) {
      throw new Error(`${path}.sequence must be ${index + 1}.`);
    }
    if (typeof entry.rawInput !== "string") {
      throw new Error(`${path}.rawInput must be a string.`);
    }
    const action = validateAction(entry.action, `${path}.action`);
    if (!Array.isArray(entry.rolls)) {
      throw new Error(`${path}.rolls must be an array.`);
    }
    return {
      sequence: entry.sequence,
      rawInput: entry.rawInput,
      action,
      rolls: entry.rolls.map((roll, rollIndex) =>
        validateRoll(roll, `${path}.rolls[${rollIndex}]`),
      ),
      result: validateResult(entry.result, `${path}.result`),
      stateAfter: validateState(entry.stateAfter, `${path}.stateAfter`),
    };
  });

  const completion = requireObject(trace.completion, "completion");
  if (completion.reason !== "quit" && completion.reason !== "eof") {
    throw new Error('completion.reason must be "quit" or "eof".');
  }
  if (
    completion.outcome !== "victory" &&
    completion.outcome !== "defeat" &&
    completion.outcome !== "incomplete"
  ) {
    throw new Error(
      'completion.outcome must be "victory", "defeat", or "incomplete".',
    );
  }

  return {
    initialSeed: Number(random.initialSeed),
    initialState,
    actions,
    completion: {
      reason: completion.reason,
      outcome: completion.outcome,
    },
  };
}

function traceResult(result: ActionResult): JsonObject {
  return result.rejection === undefined
    ? { type: "accepted", events: result.events }
    : { type: "rejected", rejection: result.rejection };
}

function formatDiagnosticJson(value: unknown): string {
  return JSON.stringify(value, undefined, 2);
}

function requireMatch(
  location: string,
  expected: unknown,
  actual: unknown,
): void {
  if (!isDeepStrictEqual(expected, actual)) {
    throw new Error(
      `Replay divergence at ${location}.\nExpected:\n${formatDiagnosticJson(expected)}\nActual:\n${formatDiagnosticJson(actual)}`,
    );
  }
}

export async function verifyTraceFile(path: string): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read trace "${path}": ${message}`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Trace contains invalid JSON: ${message}`, {
      cause: error,
    });
  }
  const trace = validateTrace(parsed);

  let state = createSession();
  requireMatch("initial state", trace.initialState, state);
  const random = createSeededRandom(trace.initialSeed);
  let reason: "quit" | "eof" = "eof";

  for (const [index, expected] of trace.actions.entries()) {
    const actionNumber = index + 1;
    const action = parseCommand(expected.rawInput);
    requireMatch(
      `action ${actionNumber} parsed action`,
      expected.action,
      action,
    );

    const rolls: RollRecord[] = [];
    const result = handleAction(state, action, {
      roll(sides: number): number {
        const value = random.roll(sides);
        rolls.push({ sides, value });
        return value;
      },
    });
    requireMatch(`action ${actionNumber} rolls`, expected.rolls, rolls);
    requireMatch(
      `action ${actionNumber} result`,
      expected.result,
      traceResult(result),
    );
    requireMatch(
      `action ${actionNumber} state`,
      expected.stateAfter,
      result.state,
    );
    state = result.state;
    if (
      result.events?.some((event) => event.type === "session-quit") === true
    ) {
      reason = "quit";
      if (index !== trace.actions.length - 1) {
        requireMatch(
          `action ${actionNumber + 1} presence`,
          trace.actions[actionNumber],
          "session ended",
        );
      }
    }
  }

  const outcome =
    state.status === "victory" || state.status === "defeat"
      ? state.status
      : "incomplete";
  requireMatch("completion", trace.completion, { reason, outcome });
}
