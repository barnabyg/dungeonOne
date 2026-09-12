import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import { resolveHistoricalAdventure, type ReplayRuntime } from "./runtime.js";
import { ADVENTURE } from "./adventure.js";
import {
  DM_CALL_DIAGNOSTIC_CODES,
  DM_DIAGNOSTIC_CODES,
  DM_INPUT_DIAGNOSTIC_CODES,
  DM_MUTATION_TOOL_NAMES,
  DM_READ_TOOL_NAMES,
  DM_SUPPORTED_PROMPT_VERSIONS,
  DM_TURN_LIMITS,
  normalizeDmText,
  type DmDiagnosticCode,
} from "./dm-turn.js";
import { GAME_TOOL_SCHEMA_VERSION } from "./game-tools.js";
import { RANDOM_ALGORITHM, createSeededRandom } from "./random.js";
import type { ActionResult } from "./session.js";
import {
  ADVENTURE_VERSION,
  DM_TRACE_FORMAT_VERSION,
  LEGACY_ADVENTURE_VERSION,
  LEGACY_RULES_VERSION,
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
  runtime: ReplayRuntime;
  rulesVersion: typeof LEGACY_RULES_VERSION | typeof RULES_VERSION;
  initialSeed: number;
  initialState: JsonObject;
  actions: readonly ReplayAction[];
  completion: Readonly<{
    reason: "quit" | "eof";
    outcome: "victory" | "defeat" | "incomplete";
  }>;
}>;

type ReplayDmCall = Readonly<{
  sequence: number;
  id: string;
  name: string;
  argumentsJson: string;
  disposition: JsonObject;
  rolls: readonly RollRecord[];
  result?: JsonObject;
  failure?: ReplayDmDiagnostic;
  stateAfter: JsonObject;
}>;

type ReplayDmDiagnostic = Readonly<{
  code: DmDiagnosticCode;
  responseNumber?: number;
  callId?: string;
}>;

type ReplayDmTurn = Readonly<{
  sequence: number;
  kind: "dm" | "local-help" | "local-quit";
  rawPlayerInput: string;
  calls: readonly ReplayDmCall[];
  diagnostics: readonly ReplayDmDiagnostic[];
  stateAfter: JsonObject;
}>;

type ReplayDmTrace = Readonly<{
  runtime: ReplayRuntime;
  initialSeed: number;
  initialState: JsonObject;
  turns: readonly ReplayDmTurn[];
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

function requireOnlyKeys(
  value: JsonObject,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path} contains unsupported field ${key}.`);
    }
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
        ["feature", "exit", "door", "item", "opponent"],
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
              : targetType === "item"
                ? ["signet"]
                : ["goblin"],
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
      if (targetType === "opponent") {
        requireString(target.description, `${path}.target.description`);
        requireOneOf(
          target.condition,
          ["living", "defeated"],
          `${path}.target.condition`,
        );
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

function validateFormat1Trace(value: unknown): ReplayTrace {
  const trace = requireObject(value, "Trace");
  requireSupported(
    trace.formatVersion,
    TRACE_FORMAT_VERSION,
    "trace format version",
  );
  const rulesVersionValue = requireString(trace.rulesVersion, "rulesVersion");
  if (
    rulesVersionValue !== LEGACY_RULES_VERSION &&
    rulesVersionValue !== RULES_VERSION
  ) {
    throw new Error(
      `Unsupported rules version ${JSON.stringify(rulesVersionValue)}.`,
    );
  }
  const rulesVersion = rulesVersionValue as ReplayTrace["rulesVersion"];

  const adventure = requireObject(trace.adventure, "adventure");
  if (adventure.id !== undefined) {
    requireSupported(adventure.id, ADVENTURE.id, "adventure id");
  }
  requireSupported(
    adventure.version,
    rulesVersion === LEGACY_RULES_VERSION
      ? LEGACY_ADVENTURE_VERSION
      : ADVENTURE_VERSION,
    "adventure version",
  );

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
    rulesVersion,
    runtime: resolveHistoricalAdventure(
      requireString(trace.rulesVersion, "rulesVersion"),
      requireString(adventure.version, "adventure.version"),
    ),
    initialSeed: Number(random.initialSeed),
    initialState,
    actions,
    completion: {
      reason: completion.reason,
      outcome: completion.outcome,
    },
  };
}

function validateCompletion(value: unknown): ReplayDmTrace["completion"] {
  const completion = requireObject(value, "completion");
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
    reason: completion.reason,
    outcome: completion.outcome,
  };
}

function validateDmArguments(value: unknown, path: string): string {
  const encoded = requireObject(value, path);
  const raw = requireString(encoded.raw, `${path}.raw`);
  if (encoded.encoding === "json") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`${path}.raw must contain valid JSON.`);
    }
    requireMatch(`${path} decoded value`, encoded.value, decoded);
  } else if (encoded.encoding === "invalid-json") {
    try {
      JSON.parse(raw);
    } catch {
      return raw;
    }
    throw new Error(`${path}.raw must contain invalid JSON.`);
  } else {
    throw new Error(`${path}.encoding must be "json" or "invalid-json".`);
  }
  return raw;
}

function validateDisposition(value: unknown, path: string): JsonObject {
  const disposition = requireObject(value, path);
  if (disposition.attempted !== true) {
    throw new Error(`${path}.attempted must be true.`);
  }
  requireBoolean(disposition.validated, `${path}.validated`);
  requireBoolean(disposition.executed, `${path}.executed`);
  return disposition;
}

const INPUT_DIAGNOSTIC_CODE_SET = new Set<DmDiagnosticCode>(
  DM_INPUT_DIAGNOSTIC_CODES,
);
const CALL_DIAGNOSTIC_CODE_SET = new Set<DmDiagnosticCode>(
  DM_CALL_DIAGNOSTIC_CODES,
);

function validateDmDiagnostic(
  value: unknown,
  path: string,
): ReplayDmDiagnostic {
  const diagnostic = requireObject(value, path);
  requireOnlyKeys(diagnostic, ["code", "responseNumber", "callId"], path);
  const code = requireOneOf(
    diagnostic.code,
    DM_DIAGNOSTIC_CODES,
    `${path}.code`,
  ) as DmDiagnosticCode;
  const responseNumber =
    diagnostic.responseNumber === undefined
      ? undefined
      : requireInteger(diagnostic.responseNumber, `${path}.responseNumber`);
  const callId =
    diagnostic.callId === undefined
      ? undefined
      : requireString(diagnostic.callId, `${path}.callId`);

  if (INPUT_DIAGNOSTIC_CODE_SET.has(code)) {
    if (responseNumber !== undefined || callId !== undefined) {
      throw new Error(`${path} must not identify a response or call.`);
    }
  } else {
    if (
      responseNumber === undefined ||
      responseNumber < 1 ||
      responseNumber > DM_TURN_LIMITS.maxModelResponses
    ) {
      throw new Error(
        `${path}.responseNumber must be from 1 through ${DM_TURN_LIMITS.maxModelResponses}.`,
      );
    }
    const requiresCallId = CALL_DIAGNOSTIC_CODE_SET.has(code);
    if (requiresCallId !== (callId !== undefined)) {
      throw new Error(
        requiresCallId
          ? `${path}.callId is required for ${code}.`
          : `${path}.callId is not allowed for ${code}.`,
      );
    }
  }

  return {
    code,
    ...(responseNumber === undefined ? {} : { responseNumber }),
    ...(callId === undefined ? {} : { callId }),
  };
}

function validateDmTrace(value: unknown): ReplayDmTrace {
  const trace = requireObject(value, "Trace");
  requireSupported(
    trace.formatVersion,
    DM_TRACE_FORMAT_VERSION,
    "trace format version",
  );
  requireSupported(trace.rulesVersion, RULES_VERSION, "rules version");
  const adventure = requireObject(trace.adventure, "adventure");
  if (adventure.id !== undefined) {
    requireSupported(adventure.id, ADVENTURE.id, "adventure id");
  }
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
  const dm = requireObject(trace.dm, "dm");
  if (
    !DM_SUPPORTED_PROMPT_VERSIONS.some(
      (version) => version === dm.promptVersion,
    )
  ) {
    throw new Error(
      `Unsupported DM prompt version ${JSON.stringify(dm.promptVersion)}.`,
    );
  }
  requireSupported(
    dm.toolSchemaVersion,
    GAME_TOOL_SCHEMA_VERSION,
    "tool schema version",
  );
  requireString(dm.provider, "dm.provider");
  requireString(dm.model, "dm.model");
  const initialState = validateState(trace.initialState, "initialState");
  const turns = requireArray(trace.turns, "turns").map(
    (value, turnIndex): ReplayDmTurn => {
      const path = `turns[${turnIndex}]`;
      const turn = requireObject(value, path);
      if (turn.sequence !== turnIndex + 1) {
        throw new Error(`${path}.sequence must be ${turnIndex + 1}.`);
      }
      const kind = requireOneOf(
        turn.kind,
        ["dm", "local-help", "local-quit"],
        `${path}.kind`,
      ) as ReplayDmTurn["kind"];
      const rawPlayerInput = requireString(
        turn.rawPlayerInput,
        `${path}.rawPlayerInput`,
      );
      const calls = requireArray(turn.calls, `${path}.calls`).map(
        (callValue, callIndex): ReplayDmCall => {
          const callPath = `${path}.calls[${callIndex}]`;
          const call = requireObject(callValue, callPath);
          if (call.sequence !== callIndex + 1) {
            throw new Error(`${callPath}.sequence must be ${callIndex + 1}.`);
          }
          const result =
            call.result === undefined
              ? undefined
              : requireObject(call.result, `${callPath}.result`);
          const disposition = validateDisposition(
            call.disposition,
            `${callPath}.disposition`,
          );
          const rolls = requireArray(call.rolls, `${callPath}.rolls`).map(
            (roll, rollIndex) =>
              validateRoll(roll, `${callPath}.rolls[${rollIndex}]`),
          );
          if (result !== undefined) {
            requireObject(result.modelOutput, `${callPath}.result.modelOutput`);
            if (result.engineResult !== undefined) {
              requireObject(
                result.engineResult,
                `${callPath}.result.engineResult`,
              );
            }
          }
          const failure =
            call.failure === undefined
              ? undefined
              : validateDmDiagnostic(call.failure, `${callPath}.failure`);
          if (result === undefined) {
            if (disposition.validated || disposition.executed) {
              throw new Error(
                `${callPath}.result is required for a validated or executed call.`,
              );
            }
            if (failure === undefined) {
              throw new Error(
                `${callPath}.failure is required for an unexecuted call.`,
              );
            }
            if (rolls.length !== 0) {
              throw new Error(
                `${callPath}.rolls must be empty for an unexecuted call.`,
              );
            }
          } else if (failure !== undefined) {
            throw new Error(
              `${callPath}.failure is not allowed when a result is recorded.`,
            );
          }
          if (disposition.validated !== disposition.executed) {
            throw new Error(
              `${callPath}.validated and executed must be equal for this tool schema version.`,
            );
          }
          return {
            sequence: call.sequence as number,
            id: requireString(call.id, `${callPath}.id`),
            name: requireString(call.name, `${callPath}.name`),
            argumentsJson: validateDmArguments(
              call.arguments,
              `${callPath}.arguments`,
            ),
            disposition,
            rolls,
            ...(result === undefined ? {} : { result }),
            ...(failure === undefined ? {} : { failure }),
            stateAfter: validateState(
              call.stateAfter,
              `${callPath}.stateAfter`,
            ),
          };
        },
      );
      if (kind !== "dm" && calls.length !== 0) {
        throw new Error(`${path}.calls must be empty for ${kind}.`);
      }
      if (kind === "dm") {
        requireString(turn.narration, `${path}.narration`);
      } else if (turn.narration !== null) {
        throw new Error(`${path}.narration must be null for ${kind}.`);
      }
      const diagnostics = requireArray(
        turn.diagnostics,
        `${path}.diagnostics`,
      ).map((diagnostic, diagnosticIndex) =>
        validateDmDiagnostic(
          diagnostic,
          `${path}.diagnostics[${diagnosticIndex}]`,
        ),
      );
      if (kind !== "dm" && diagnostics.length !== 0) {
        throw new Error(`${path}.diagnostics must be empty for ${kind}.`);
      }
      if (kind === "dm" && diagnostics.length > 1) {
        throw new Error(
          `${path}.diagnostics must contain at most one failure.`,
        );
      }
      return {
        sequence: turn.sequence as number,
        kind,
        rawPlayerInput,
        calls,
        diagnostics,
        stateAfter: validateState(turn.stateAfter, `${path}.stateAfter`),
      };
    },
  );
  return {
    runtime: resolveHistoricalAdventure(
      requireString(trace.rulesVersion, "rulesVersion"),
      requireString(adventure.version, "adventure.version"),
    ),
    initialSeed: Number(random.initialSeed),
    initialState,
    turns,
    completion: validateCompletion(trace.completion),
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
  const envelope = requireObject(parsed, "Trace");
  if (envelope.formatVersion === DM_TRACE_FORMAT_VERSION) {
    replayDmTrace(validateDmTrace(parsed));
    return;
  }
  if (envelope.formatVersion !== TRACE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported trace format version ${JSON.stringify(envelope.formatVersion)}.`,
    );
  }
  const trace = validateFormat1Trace(parsed);

  let state = trace.runtime.createSession();
  requireMatch("initial state", trace.initialState, state);
  const random = createSeededRandom(trace.initialSeed);
  let reason: "quit" | "eof" = "eof";

  for (const [index, expected] of trace.actions.entries()) {
    const actionNumber = index + 1;
    const action = trace.runtime.parseCommand(expected.rawInput);
    requireMatch(
      `action ${actionNumber} parsed action`,
      expected.action,
      action,
    );

    const rolls: RollRecord[] = [];
    const result = trace.runtime.handleAction(state, action, {
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

const REPLAY_READ_TOOL_NAMES = new Set<string>(DM_READ_TOOL_NAMES);
const REPLAY_MUTATION_TOOL_NAMES = new Set<string>(DM_MUTATION_TOOL_NAMES);

function expectedBlockedCallFailure(
  call: ReplayDmCall,
  callIds: ReadonlySet<string>,
  readCalls: number,
  mutationAttempts: number,
  responseNumber: number,
): ReplayDmDiagnostic | undefined {
  if (callIds.has(call.id)) {
    return { code: "duplicate-call-id", responseNumber, callId: call.id };
  }
  if (
    !REPLAY_READ_TOOL_NAMES.has(call.name) &&
    !REPLAY_MUTATION_TOOL_NAMES.has(call.name)
  ) {
    return { code: "unsupported-tool", responseNumber, callId: call.id };
  }
  if (REPLAY_MUTATION_TOOL_NAMES.has(call.name) && mutationAttempts > 0) {
    return { code: "mutation-call-limit", responseNumber, callId: call.id };
  }
  if (
    REPLAY_READ_TOOL_NAMES.has(call.name) &&
    readCalls >= DM_TURN_LIMITS.maxReadCalls
  ) {
    return { code: "read-call-limit", responseNumber, callId: call.id };
  }
  return undefined;
}

function expectedPlayerInputFailure(
  rawPlayerInput: string,
): ReplayDmDiagnostic | undefined {
  const playerInput = normalizeDmText(rawPlayerInput);
  return playerInput.length === 0
    ? { code: "empty-player-input" }
    : playerInput.length > DM_TURN_LIMITS.maxPlayerInputCharacters
      ? { code: "overlong-player-input" }
      : undefined;
}

function expectedTerminalDiagnostic(
  diagnostic: ReplayDmDiagnostic,
  callCount: number,
  responseNumber: number,
): ReplayDmDiagnostic | undefined {
  if (INPUT_DIAGNOSTIC_CODE_SET.has(diagnostic.code)) {
    return undefined;
  }
  if (diagnostic.code === "model-response-limit") {
    return responseNumber === DM_TURN_LIMITS.maxModelResponses + 1
      ? {
          code: "model-response-limit",
          responseNumber: DM_TURN_LIMITS.maxModelResponses,
        }
      : undefined;
  }
  if (
    diagnostic.code === "multi-call-response" &&
    callCount === 0 &&
    responseNumber <= DM_TURN_LIMITS.maxModelResponses
  ) {
    return { code: "multi-call-response", responseNumber };
  }
  if (
    [
      "model-failure",
      "malformed-response",
      "empty-narration",
      "overlong-narration",
    ].includes(diagnostic.code) &&
    responseNumber <= DM_TURN_LIMITS.maxModelResponses
  ) {
    return { code: diagnostic.code, responseNumber };
  }
  return undefined;
}

function replayDmTrace(trace: ReplayDmTrace): void {
  let state = trace.runtime.createSession();
  requireMatch("initial state", trace.initialState, state);
  const random = createSeededRandom(trace.initialSeed);
  let reason: "quit" | "eof" = "eof";

  for (const [turnIndex, turn] of trace.turns.entries()) {
    const turnNumber = turnIndex + 1;
    if (reason === "quit") {
      requireMatch(`turn ${turnNumber} presence`, turn, "session ended");
    }
    if (turn.kind === "local-help") {
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
      continue;
    }
    if (turn.kind === "local-quit") {
      const quit = trace.runtime.handleAction(state, { type: "quit" }, random);
      state = quit.state;
      reason = "quit";
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
      continue;
    }

    const inputFailure = expectedPlayerInputFailure(turn.rawPlayerInput);
    if (inputFailure !== undefined) {
      requireMatch(`turn ${turnNumber} calls`, turn.calls, []);
      requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
        inputFailure,
      ]);
      requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
      continue;
    }

    const callIds = new Set<string>();
    let readCalls = 0;
    let mutationAttempts = 0;
    let responseNumber = 1;
    let orchestrationEnded = false;

    for (const [callIndex, expected] of turn.calls.entries()) {
      const location = `turn ${turnNumber} call ${callIndex + 1}`;
      if (expected.result === undefined) {
        if (expected.failure?.code === "multi-call-response") {
          const failure = {
            code: "multi-call-response",
            responseNumber,
          };
          for (const [remainingIndex, blocked] of turn.calls
            .slice(callIndex)
            .entries()) {
            const blockedLocation = `turn ${turnNumber} call ${
              callIndex + remainingIndex + 1
            }`;
            requireMatch(
              `${blockedLocation} result presence`,
              blocked.result,
              undefined,
            );
            requireMatch(
              `${blockedLocation} disposition`,
              blocked.disposition,
              { attempted: true, validated: false, executed: false },
            );
            requireMatch(
              `${blockedLocation} failure`,
              blocked.failure,
              failure,
            );
            requireMatch(`${blockedLocation} state`, blocked.stateAfter, state);
          }
          requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
            failure,
          ]);
          orchestrationEnded = true;
          break;
        }

        const failure = expectedBlockedCallFailure(
          expected,
          callIds,
          readCalls,
          mutationAttempts,
          responseNumber,
        );
        requireMatch(`${location} failure`, expected.failure, failure);
        requireMatch(`${location} disposition`, expected.disposition, {
          attempted: true,
          validated: false,
          executed: false,
        });
        requireMatch(`${location} state`, expected.stateAfter, state);
        if (callIndex !== turn.calls.length - 1) {
          requireMatch(
            `turn ${turnNumber} call ${callIndex + 2} presence`,
            turn.calls[callIndex + 1],
            "turn ended",
          );
        }
        requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
          failure,
        ]);
        orchestrationEnded = true;
        break;
      }

      const blockedFailure = expectedBlockedCallFailure(
        expected,
        callIds,
        readCalls,
        mutationAttempts,
        responseNumber,
      );
      requireMatch(`${location} failure`, undefined, blockedFailure);
      callIds.add(expected.id);
      if (REPLAY_MUTATION_TOOL_NAMES.has(expected.name)) {
        mutationAttempts += 1;
      } else {
        readCalls += 1;
      }
      const rolls: RollRecord[] = [];
      const result = trace.runtime.dispatchGameTool(
        state,
        {
          name: expected.name,
          argumentsJson: expected.argumentsJson,
        },
        {
          roll(sides: number): number {
            const value = random.roll(sides);
            rolls.push({ sides, value });
            return value;
          },
        },
      );
      const validated =
        result.engineResult !== undefined || result.modelOutput.ok;
      requireMatch(`${location} disposition`, expected.disposition, {
        attempted: true,
        validated,
        executed: validated,
      });
      requireMatch(`${location} rolls`, expected.rolls, rolls);
      requireMatch(`${location} result`, expected.result, {
        ...(result.engineResult === undefined
          ? {}
          : { engineResult: result.engineResult }),
        modelOutput: result.modelOutput,
      });
      requireMatch(`${location} state`, expected.stateAfter, result.state);
      state = result.state;
      responseNumber += 1;
    }

    if (!orchestrationEnded) {
      const diagnostic = turn.diagnostics[0];
      if (diagnostic === undefined) {
        requireMatch(
          `turn ${turnNumber} diagnostics`,
          turn.diagnostics,
          responseNumber <= DM_TURN_LIMITS.maxModelResponses
            ? []
            : [
                {
                  code: "model-response-limit",
                  responseNumber: DM_TURN_LIMITS.maxModelResponses,
                },
              ],
        );
      } else {
        requireMatch(`turn ${turnNumber} diagnostics`, turn.diagnostics, [
          expectedTerminalDiagnostic(
            diagnostic,
            turn.calls.length,
            responseNumber,
          ),
        ]);
      }
    }
    requireMatch(`turn ${turnNumber} state`, turn.stateAfter, state);
  }

  const outcome =
    state.status === "victory" || state.status === "defeat"
      ? state.status
      : "incomplete";
  requireMatch("completion", trace.completion, { reason, outcome });
}
