// Replay of the historical trace formats (1 to 3) and the version history of
// the pre-5e runtimes: an old-runtime module, removed by #139. Shared replay
// reaches it only through the registry's TRACE_REPLAY.
import {
  CHARACTER_PROMPT_VERSION,
  CHARACTER_TOOL_VERSION,
  PREVIOUS_CHARACTER_PROMPT_VERSION,
  PREVIOUS_CHARACTER_TOOL_VERSION,
} from "./character-runtime.js";
import {
  CLUES_ENGINE_VERSION,
  RELATIONSHIP_ENGINE_VERSION,
  CLOCK_ENGINE_VERSION,
  ADJUDICATION_ENGINE_VERSION,
  DAY_ENGINE_VERSION,
  DISTRACTION_ENGINE_VERSION,
  DECEPTION_ENGINE_VERSION,
  OFFER_ENGINE_VERSION,
  TRAVEL_ENGINE_VERSION,
  CLAIM_ENGINE_VERSION,
  BRACE_ENGINE_VERSION,
  QUEST_ITEM_ENGINE_VERSION,
  CONFRONTATION_ENGINE_VERSION,
  FINALE_ENGINE_VERSION,
  RECOVERY_ENGINE_VERSION,
  CASUALTY_CLUES_ENGINE_VERSION,
  COMBAT_CLUES_ENGINE_VERSION,
  LEGACY_CLUES_ENGINE_VERSION,
  POTION_CLUES_ENGINE_VERSION,
  RESCUE_CLUES_ENGINE_VERSION,
} from "./chapel-clues-runtime.js";
import { DATA_ENGINE_VERSION } from "./exploration-runtime.js";
import { SIGNET_ENGINE_VERSION } from "./signet-runtime.js";
import {
  ADVENTURE_VERSION,
  LEGACY_ADVENTURE_VERSION,
  LEGACY_RULES_VERSION,
  RULES_VERSION,
  resolveHistoricalAdventure,
} from "./historical-runtime.js";
import { ADVENTURE } from "./adventure.js";
import { GAME_TOOL_SCHEMA_VERSION } from "./game-tools.js";
import { RANDOM_ALGORITHM } from "./random.js";
import {
  CHAPEL_ID,
  CHAPEL_VERSION,
  CHAPEL_RULES_VERSION,
  CHAPEL_PROMPT_VERSION,
  isExplicitPotionCollectionIntent,
  CASUALTIES_CHAPEL_PROMPT_VERSION,
  FIRST_QUALIFIED_CHAPEL_PROMPT_VERSION,
  SECOND_QUALIFIED_CHAPEL_PROMPT_VERSION,
  CHAPEL_TOOL_VERSION,
  RESOLUTION_CHAPEL_VERSION,
  RESOLUTION_CHAPEL_RULES_VERSION,
  RESOLUTION_CHAPEL_PROMPT_VERSION,
  RESOLUTION_CHAPEL_TOOL_VERSION,
  RESCUE_CHAPEL_VERSION,
  RESCUE_CHAPEL_RULES_VERSION,
  RESCUE_CHAPEL_PROMPT_VERSION,
  RESCUE_CHAPEL_TOOL_VERSION,
  POTION_CHAPEL_VERSION,
  POTION_CHAPEL_RULES_VERSION,
  POTION_CHAPEL_PROMPT_VERSION,
  POTION_CHAPEL_TOOL_VERSION,
  GUARDIAN_CHAPEL_VERSION,
  GUARDIAN_CHAPEL_RULES_VERSION,
  GUARDIAN_CHAPEL_PROMPT_VERSION,
  GUARDIAN_CHAPEL_TOOL_VERSION,
  SOCIAL_CHAPEL_VERSION,
  SOCIAL_CHAPEL_RULES_VERSION,
  SOCIAL_CHAPEL_PROMPT_VERSION,
  SOCIAL_CHAPEL_TOOL_VERSION,
  DIALOGUE_CHAPEL_VERSION,
  DIALOGUE_CHAPEL_RULES_VERSION,
  DIALOGUE_CHAPEL_PROMPT_VERSION,
  DIALOGUE_CHAPEL_TOOL_VERSION,
  DISCOVERY_CHAPEL_VERSION,
  DISCOVERY_CHAPEL_RULES_VERSION,
  DISCOVERY_CHAPEL_PROMPT_VERSION,
  DISCOVERY_CHAPEL_TOOL_VERSION,
  LEGACY_CHAPEL_VERSION,
  LEGACY_CHAPEL_RULES_VERSION,
  LEGACY_CHAPEL_PROMPT_VERSION,
  LEGACY_CHAPEL_TOOL_VERSION,
} from "./chapel.js";
import {
  requireArray,
  requireBoolean,
  requireExactKeys,
  requireInteger,
  requireObject,
  requireOneOf,
  requireString,
  requireSupported,
  validateCompletion,
  validateOneOfArray,
  validateRoll,
  validateStringArray,
  type JsonObject,
} from "./replay-decode.js";
// Types only: the engine itself arrives as a verifyTrace argument, so this
// module (reachable from the registry) never loads the DM turn loop.
import type {
  ReplayAction,
  ReplayDmTurn,
  ReplayRuntime,
  ReplayTrace,
  TraceReplayEngine,
  TraceReplaySupport,
} from "./replay-engine.js";
import {
  CHAPEL_TRACE_FORMAT_VERSION,
  DM_TRACE_FORMAT_VERSION,
  TRACE_FORMAT_VERSION,
} from "./trace-file.js";

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

function chapelTraceConfig(trace: JsonObject): Readonly<{
  runtime: ReplayRuntime;
  version: string;
  rulesVersion: string;
  promptVersions: readonly string[];
  toolVersion: string;
  localKinds: readonly ReplayDmTurn["kind"][];
}> {
  const adventure = requireObject(trace.adventure, "adventure");
  requireSupported(adventure.id, CHAPEL_ID, "adventure id");
  const version = requireString(adventure.version, "adventure.version");
  const rulesVersion = requireString(trace.rulesVersion, "rulesVersion");
  const current =
    version === CHAPEL_VERSION && rulesVersion === CHAPEL_RULES_VERSION;
  const resolution =
    version === RESOLUTION_CHAPEL_VERSION &&
    rulesVersion === RESOLUTION_CHAPEL_RULES_VERSION;
  const rescue =
    version === RESCUE_CHAPEL_VERSION &&
    rulesVersion === RESCUE_CHAPEL_RULES_VERSION;
  const potion =
    version === POTION_CHAPEL_VERSION &&
    rulesVersion === POTION_CHAPEL_RULES_VERSION;
  const guardian =
    version === GUARDIAN_CHAPEL_VERSION &&
    rulesVersion === GUARDIAN_CHAPEL_RULES_VERSION;
  const social =
    version === SOCIAL_CHAPEL_VERSION &&
    rulesVersion === SOCIAL_CHAPEL_RULES_VERSION;
  const dialogue =
    version === DIALOGUE_CHAPEL_VERSION &&
    rulesVersion === DIALOGUE_CHAPEL_RULES_VERSION;
  const discovery =
    version === DISCOVERY_CHAPEL_VERSION &&
    rulesVersion === DISCOVERY_CHAPEL_RULES_VERSION;
  const legacy =
    version === LEGACY_CHAPEL_VERSION &&
    rulesVersion === LEGACY_CHAPEL_RULES_VERSION;
  if (
    !current &&
    !resolution &&
    !rescue &&
    !potion &&
    !guardian &&
    !social &&
    !dialogue &&
    !discovery &&
    !legacy
  ) {
    if (
      rulesVersion !== CHAPEL_RULES_VERSION &&
      rulesVersion !== RESOLUTION_CHAPEL_RULES_VERSION &&
      rulesVersion !== RESCUE_CHAPEL_RULES_VERSION &&
      rulesVersion !== POTION_CHAPEL_RULES_VERSION &&
      rulesVersion !== GUARDIAN_CHAPEL_RULES_VERSION &&
      rulesVersion !== SOCIAL_CHAPEL_RULES_VERSION &&
      rulesVersion !== DIALOGUE_CHAPEL_RULES_VERSION &&
      rulesVersion !== DISCOVERY_CHAPEL_RULES_VERSION &&
      rulesVersion !== LEGACY_CHAPEL_RULES_VERSION
    ) {
      throw new Error(
        `Unsupported rules version ${JSON.stringify(rulesVersion)}.`,
      );
    }
    if (
      version !== CHAPEL_VERSION &&
      version !== RESOLUTION_CHAPEL_VERSION &&
      version !== RESCUE_CHAPEL_VERSION &&
      version !== POTION_CHAPEL_VERSION &&
      version !== GUARDIAN_CHAPEL_VERSION &&
      version !== SOCIAL_CHAPEL_VERSION &&
      version !== DIALOGUE_CHAPEL_VERSION &&
      version !== DISCOVERY_CHAPEL_VERSION &&
      version !== LEGACY_CHAPEL_VERSION
    ) {
      throw new Error(
        `Unsupported adventure version ${JSON.stringify(version)}.`,
      );
    }
    throw new Error(
      `Unsupported chapel version combination ${JSON.stringify(rulesVersion)}/${JSON.stringify(version)}.`,
    );
  }
  return {
    runtime: resolveHistoricalAdventure(rulesVersion, version, CHAPEL_ID),
    version,
    rulesVersion,
    promptVersions: current
      ? [
          CHAPEL_PROMPT_VERSION,
          SECOND_QUALIFIED_CHAPEL_PROMPT_VERSION,
          FIRST_QUALIFIED_CHAPEL_PROMPT_VERSION,
          CASUALTIES_CHAPEL_PROMPT_VERSION,
        ]
      : resolution
        ? [RESOLUTION_CHAPEL_PROMPT_VERSION]
        : rescue
          ? [RESCUE_CHAPEL_PROMPT_VERSION]
          : potion
            ? [POTION_CHAPEL_PROMPT_VERSION]
            : guardian
              ? [GUARDIAN_CHAPEL_PROMPT_VERSION]
              : social
                ? [SOCIAL_CHAPEL_PROMPT_VERSION]
                : dialogue
                  ? [DIALOGUE_CHAPEL_PROMPT_VERSION]
                  : discovery
                    ? [DISCOVERY_CHAPEL_PROMPT_VERSION]
                    : [LEGACY_CHAPEL_PROMPT_VERSION],
    toolVersion: current
      ? CHAPEL_TOOL_VERSION
      : resolution
        ? RESOLUTION_CHAPEL_TOOL_VERSION
        : rescue
          ? RESCUE_CHAPEL_TOOL_VERSION
          : potion
            ? POTION_CHAPEL_TOOL_VERSION
            : guardian
              ? GUARDIAN_CHAPEL_TOOL_VERSION
              : social
                ? SOCIAL_CHAPEL_TOOL_VERSION
                : dialogue
                  ? DIALOGUE_CHAPEL_TOOL_VERSION
                  : discovery
                    ? DISCOVERY_CHAPEL_TOOL_VERSION
                    : LEGACY_CHAPEL_TOOL_VERSION,
    localKinds:
      current || resolution || rescue || potion
        ? [
            "dm",
            "local-help",
            "local-journal",
            "local-status",
            "local-inventory",
            "local-quit",
          ]
        : guardian || social || dialogue || discovery
          ? ["dm", "local-help", "local-journal", "local-quit"]
          : ["dm", "local-help", "local-quit"],
  };
}

function validateFormat3CommandTrace(value: unknown): ReplayTrace {
  const trace = requireObject(value, "Trace");
  requireSupported(
    trace.formatVersion,
    CHAPEL_TRACE_FORMAT_VERSION,
    "trace format version",
  );
  const config = chapelTraceConfig(trace);
  const random = requireObject(trace.random, "random");
  requireSupported(random.algorithm, RANDOM_ALGORITHM, "random algorithm");
  if (
    !Number.isInteger(random.initialSeed) ||
    Number(random.initialSeed) < 0 ||
    Number(random.initialSeed) > 0xffff_ffff
  ) {
    throw new Error("random.initialSeed must be an unsigned 32-bit integer.");
  }
  const actions = requireArray(trace.actions, "actions").map(
    (value, index): ReplayAction => {
      const path = `actions[${index}]`;
      const entry = requireObject(value, path);
      if (entry.sequence !== index + 1) {
        throw new Error(`${path}.sequence must be ${index + 1}.`);
      }
      return {
        sequence: index + 1,
        rawInput: requireString(entry.rawInput, `${path}.rawInput`),
        action: requireObject(entry.action, `${path}.action`),
        rolls: requireArray(entry.rolls, `${path}.rolls`).map(
          (roll, rollIndex) =>
            validateRoll(roll, `${path}.rolls[${rollIndex}]`),
        ),
        result: requireObject(entry.result, `${path}.result`),
        stateAfter: requireObject(entry.stateAfter, `${path}.stateAfter`),
      };
    },
  );
  return {
    runtime: config.runtime,
    rulesVersion: config.rulesVersion,
    initialSeed: Number(random.initialSeed),
    initialState: requireObject(trace.initialState, "initialState"),
    actions,
    completion: validateCompletion(trace.completion),
  };
}

// Format-1 and format-2 traces may omit the Stolen Signet adventure id.
function resolveLegacyRuntime(
  trace: JsonObject,
  adventure: JsonObject,
): ReplayRuntime {
  return resolveHistoricalAdventure(
    requireString(trace.rulesVersion, "rulesVersion"),
    requireString(adventure.version, "adventure.version"),
    adventure.id === undefined
      ? ADVENTURE.id
      : requireString(adventure.id, "adventure.id"),
  );
}

function replayedPlayerInput(
  promptVersion: string,
  toolName: string,
  rawPlayerInput: string,
): string | undefined {
  return promptVersion !== CHAPEL_PROMPT_VERSION &&
    toolName === "look" &&
    isExplicitPotionCollectionIntent(rawPlayerInput)
    ? undefined
    : rawPlayerInput;
}

function verifyLegacyTrace(
  envelope: JsonObject,
  engine: TraceReplayEngine,
): boolean {
  if (envelope.formatVersion === DM_TRACE_FORMAT_VERSION) {
    engine.replayDmTrace(
      engine.validateDmTrace(envelope, {
        rulesVersion: RULES_VERSION,
        adventureId: ADVENTURE.id,
        adventureVersion: ADVENTURE_VERSION,
        toolSchemaVersions: [GAME_TOOL_SCHEMA_VERSION],
        validateRuntimeState: validateState,
        resolveRuntime: resolveLegacyRuntime,
      }),
      replayedPlayerInput,
    );
    return true;
  }
  if (envelope.formatVersion === CHAPEL_TRACE_FORMAT_VERSION) {
    if (envelope.actions !== undefined && envelope.turns === undefined) {
      engine.replayCommandTrace(validateFormat3CommandTrace(envelope));
      return true;
    }
    if (envelope.turns !== undefined && envelope.actions === undefined) {
      const config = chapelTraceConfig(envelope);
      engine.replayDmTrace(
        engine.validateDmTrace(envelope, {
          formatVersion: CHAPEL_TRACE_FORMAT_VERSION,
          adventureId: CHAPEL_ID,
          adventureVersion: config.version,
          rulesVersion: config.rulesVersion,
          promptVersions: config.promptVersions,
          toolSchemaVersions: [config.toolVersion],
          localKinds: config.localKinds,
          validateRuntimeState: requireObject,
          resolveRuntime: resolveLegacyRuntime,
        }),
        replayedPlayerInput,
      );
      return true;
    }
    throw new Error(
      "Trace format 3 must contain exactly one of actions or turns.",
    );
  }
  if (envelope.formatVersion === TRACE_FORMAT_VERSION) {
    engine.replayCommandTrace(validateFormat1Trace(envelope));
    return true;
  }
  return false;
}

const PREVIOUS_PROMPT_VERSIONS: Readonly<Record<string, readonly string[]>> = {
  "chapel-clues-dm-v10": ["chapel-clues-dm-v9"],
  "chapel-clues-dm-v11": ["chapel-clues-dm-v10"],
  "chapel-clues-dm-v12": ["chapel-clues-dm-v11"],
  [CHARACTER_PROMPT_VERSION]: [PREVIOUS_CHARACTER_PROMPT_VERSION],
};

// Tool definitions only steer the model; replay re-dispatches each recorded
// call, so v1 character traces replay unchanged (#109).
const PREVIOUS_TOOL_SCHEMA_VERSIONS: Readonly<
  Record<string, readonly string[]>
> = {
  [CHARACTER_TOOL_VERSION]: [PREVIOUS_CHARACTER_TOOL_VERSION],
};

export const LEGACY_TRACE_REPLAY: TraceReplaySupport = Object.freeze({
  verifyTrace: verifyLegacyTrace,
  engineVersions: [
    "character-adventure-engine-v1",
    DATA_ENGINE_VERSION,
    SIGNET_ENGINE_VERSION,
    CLUES_ENGINE_VERSION,
    RELATIONSHIP_ENGINE_VERSION,
    CLOCK_ENGINE_VERSION,
    ADJUDICATION_ENGINE_VERSION,
    DAY_ENGINE_VERSION,
    DISTRACTION_ENGINE_VERSION,
    DECEPTION_ENGINE_VERSION,
    OFFER_ENGINE_VERSION,
    TRAVEL_ENGINE_VERSION,
    CLAIM_ENGINE_VERSION,
    BRACE_ENGINE_VERSION,
    QUEST_ITEM_ENGINE_VERSION,
    CONFRONTATION_ENGINE_VERSION,
    FINALE_ENGINE_VERSION,
    RECOVERY_ENGINE_VERSION,
    CASUALTY_CLUES_ENGINE_VERSION,
    RESCUE_CLUES_ENGINE_VERSION,
    COMBAT_CLUES_ENGINE_VERSION,
    POTION_CLUES_ENGINE_VERSION,
    LEGACY_CLUES_ENGINE_VERSION,
  ],
  previousPromptVersions: (promptVersion: string) =>
    Object.hasOwn(PREVIOUS_PROMPT_VERSIONS, promptVersion)
      ? PREVIOUS_PROMPT_VERSIONS[promptVersion]!
      : [],
  previousToolSchemaVersions: (toolSchemaVersion: string) =>
    Object.hasOwn(PREVIOUS_TOOL_SCHEMA_VERSIONS, toolSchemaVersion)
      ? PREVIOUS_TOOL_SCHEMA_VERSIONS[toolSchemaVersion]!
      : [],
  replayedPlayerInput,
});
