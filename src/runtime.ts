import { ADVENTURE } from "./adventure.js";
import {
  dispatchGameTool,
  getGameToolDefinitions,
  projectCharacterStatus,
  projectDmScene,
} from "./game-tools.js";
import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import { createSession, handleAction } from "./session.js";
import type { SessionState, ActionResult } from "./session.js";
import {
  CHAPEL_ID,
  CHAPEL_VERSION,
  CHAPEL_RULES_VERSION,
  CHAPEL_TOOL_VERSION,
  CHAPEL_PROMPT_VERSION,
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
  INITIAL_CHAPEL_NPC_STATES,
  LEGACY_CHAPEL_VERSION,
  LEGACY_CHAPEL_RULES_VERSION,
  LEGACY_CHAPEL_PROMPT_VERSION,
  LEGACY_CHAPEL_TOOL_VERSION,
  createChapelSession,
  handleChapelAction,
  renderChapelIntroduction,
  renderChapelResult,
  type ChapelState,
  type SocialChapelState,
  type ChapelResult,
  type ChapelEvent,
  type DialogueChapelState,
  type LegacyChapelEvent,
  type LegacyChapelState,
  type DiscoveryChapelState,
  type DiscoveryChapelEvent,
} from "./chapel.js";
import {
  dispatchChapelTool,
  getChapelTools,
  projectChapelScene,
  projectChapelStatus,
} from "./chapel-tools.js";
import { GAME_TOOL_SCHEMA_VERSION } from "./game-tools.js";
import type {
  AdventureRuntime,
  RuntimeResult,
  RuntimeState,
  RuntimeToolResult,
} from "./runtime-contract.js";
import type { Action } from "./session.js";
import type { DmScene } from "./game-tools.js";
export type { AdventureRuntime } from "./runtime-contract.js";

export const LEGACY_RULES_VERSION = "stolen-signet-rules-v1";
export const LEGACY_ADVENTURE_VERSION = "1";
export const RULES_VERSION = "stolen-signet-rules-v2";
export const ADVENTURE_VERSION = "2";

function parseCurrentChapelCommand(input: string): Action {
  const action = parseCommand(input);
  if (
    action.type === "talk" &&
    input.trim().toLowerCase().split(/\s+/u).length !== 4
  ) {
    return { type: "unknown", input: input.trim().toLowerCase() };
  }
  return action;
}

// These modules are the original signet implementation. Keep its persisted state
// and event shapes intact; selection belongs to the session's runtime, not state.
function signetState(state: RuntimeState): SessionState {
  if ("adventureId" in state) {
    throw new Error("State does not belong to stolen-signet.");
  }
  return state;
}

function chapelState(state: RuntimeState): ChapelState {
  if (
    !("adventureId" in state) ||
    state.adventureId !== CHAPEL_ID ||
    !("discoveries" in state) ||
    !("npcStates" in state) ||
    !("socialChallenges" in state) ||
    !("opponents" in state)
  ) {
    throw new Error("State does not belong to chapel.");
  }
  return state;
}

function socialChapelState(state: RuntimeState): SocialChapelState {
  if (
    !("adventureId" in state) ||
    state.adventureId !== CHAPEL_ID ||
    !("discoveries" in state) ||
    !("npcStates" in state) ||
    !("socialChallenges" in state) ||
    "opponents" in state
  ) {
    throw new Error("State does not belong to chapel social v4.");
  }
  return state;
}

function dialogueChapelState(state: RuntimeState): DialogueChapelState {
  if (
    !("adventureId" in state) ||
    state.adventureId !== CHAPEL_ID ||
    !("discoveries" in state) ||
    !("npcStates" in state) ||
    "socialChallenges" in state
  ) {
    throw new Error("State does not belong to chapel dialogue v3.");
  }
  return state;
}

function discoveryChapelState(state: RuntimeState): DiscoveryChapelState {
  if (
    !("adventureId" in state) ||
    state.adventureId !== CHAPEL_ID ||
    !("discoveries" in state) ||
    "npcStates" in state
  ) {
    throw new Error("State does not belong to chapel discovery v2.");
  }
  return state;
}

function legacyChapelState(state: RuntimeState): LegacyChapelState {
  if (
    !("adventureId" in state) ||
    state.adventureId !== CHAPEL_ID ||
    "discoveries" in state
  ) {
    throw new Error("State does not belong to chapel exploration v1.");
  }
  return state;
}

function createLegacyChapelSession(): LegacyChapelState {
  return {
    adventureId: CHAPEL_ID,
    locationId: "inn",
    status: "playing",
    fighter: { hp: 20, maxHp: 20, equipmentIds: ["longsword"] },
    quest: { id: "find-tavi", status: "active" },
  };
}

function initialChapelOpponents(): ChapelState["opponents"] {
  return createChapelSession().opponents;
}

function upgradeLegacyChapelState(state: LegacyChapelState): ChapelState {
  return {
    ...state,
    quest: { ...state.quest, milestones: [] },
    discoveries: [],
    npcStates: INITIAL_CHAPEL_NPC_STATES,
    conversationHistory: [],
    opponents: initialChapelOpponents(),
  } as unknown as ChapelState;
}

function upgradeDiscoveryChapelState(state: DiscoveryChapelState): ChapelState {
  return {
    ...state,
    npcStates: INITIAL_CHAPEL_NPC_STATES,
    conversationHistory: [],
    opponents: initialChapelOpponents(),
  } as unknown as ChapelState;
}

function createDialogueChapelSession(): DialogueChapelState {
  return downgradeDialogueChapelState(createChapelSession());
}

function upgradeDialogueChapelState(state: DialogueChapelState): ChapelState {
  return {
    ...state,
    opponents: initialChapelOpponents(),
  } as ChapelState;
}

function downgradeDialogueChapelState(state: ChapelState): DialogueChapelState {
  return {
    adventureId: state.adventureId,
    locationId: state.locationId,
    status: state.status === "defeat" ? "playing" : state.status,
    fighter: state.fighter,
    quest: state.quest,
    discoveries: state.discoveries,
    npcStates: state.npcStates,
    conversationHistory: state.conversationHistory,
  };
}

function createSocialChapelSession(): SocialChapelState {
  return downgradeSocialChapelState(createChapelSession());
}

function upgradeSocialChapelState(state: SocialChapelState): ChapelState {
  return { ...state, opponents: initialChapelOpponents() };
}

function downgradeSocialChapelState(state: ChapelState): SocialChapelState {
  return {
    adventureId: state.adventureId,
    locationId: state.locationId,
    status: state.status === "defeat" ? "playing" : state.status,
    fighter: state.fighter,
    quest: state.quest,
    discoveries: state.discoveries,
    npcStates: state.npcStates,
    conversationHistory: state.conversationHistory,
    socialChallenges: state.socialChallenges,
  };
}

function downgradeDiscoveryChapelState(
  state: ChapelState,
): DiscoveryChapelState {
  return {
    adventureId: CHAPEL_ID,
    locationId: state.locationId,
    status: state.status,
    fighter: state.fighter,
    quest: {
      id: state.quest.id,
      status: state.quest.status,
      milestones: state.quest.milestones.filter(
        (milestone) => milestone !== "mara-account-recorded",
      ),
    },
    discoveries: state.discoveries.filter(
      (discovery) => discovery.source.type === "feature",
    ),
  } as DiscoveryChapelState;
}

function downgradeDiscoveryChapelEvents(
  events: readonly ChapelEvent[],
): readonly DiscoveryChapelEvent[] {
  return events.filter(
    (event): event is DiscoveryChapelEvent =>
      event.type !== "chapel-conversation",
  );
}

function downgradeChapelState(state: ChapelState): LegacyChapelState {
  return {
    adventureId: CHAPEL_ID,
    locationId: state.locationId,
    status: state.status === "defeat" ? "playing" : state.status,
    fighter: state.fighter,
    quest: { id: state.quest.id, status: state.quest.status },
  };
}

function downgradeChapelEvents(
  events: readonly ChapelEvent[],
): readonly LegacyChapelEvent[] {
  const downgraded: LegacyChapelEvent[] = [];
  for (const event of events) {
    if (event.type === "chapel-discovered" || event.type === "chapel-journal") {
      continue;
    }
    if (event.type === "chapel-status") {
      downgraded.push({
        ...event,
        status: event.status === "defeat" ? "playing" : event.status,
        quest: { id: event.quest.id, status: event.quest.status },
      });
      continue;
    }
    downgraded.push(event);
  }
  return downgraded;
}

function handleLegacyChapelAction(
  state: LegacyChapelState,
  action: Action,
): RuntimeResult {
  if (
    action.type === "search" ||
    action.type === "journal" ||
    action.type === "talk"
  ) {
    return { state, rejection: { reason: "chapel-unavailable" } };
  }
  if (
    action.type === "inspect" &&
    action.target?.trim().toLowerCase().replace(/-/gu, " ") ===
      "damaged repair record"
  ) {
    return { state, rejection: { reason: "chapel-unavailable" } };
  }
  const result = handleChapelAction(
    upgradeLegacyChapelState(state),
    action,
    undefined,
    false,
  );
  return result.rejection === undefined
    ? {
        state: downgradeChapelState(result.state),
        events: downgradeChapelEvents(result.events),
      }
    : {
        state: downgradeChapelState(result.state),
        rejection: result.rejection,
      };
}

function parseLegacyChapelCommand(input: string): Action {
  const action = parseCommand(input);
  return action.type === "search" ||
    action.type === "journal" ||
    action.type === "talk"
    ? { type: "unknown", input: input.trim().toLowerCase() }
    : action;
}

function downgradeChapelScene(scene: DmScene | undefined): DmScene | undefined {
  if (scene === undefined) {
    return undefined;
  }
  const withoutJournal = { ...scene };
  delete withoutJournal.journal;
  return {
    ...withoutJournal,
    room: {
      ...withoutJournal.room,
      features: withoutJournal.room.features.filter(
        ({ id }) => id !== "damaged-repair-record",
      ),
    },
  };
}

function dispatchLegacyChapelTool(
  state: LegacyChapelState,
  call: Parameters<AdventureRuntime["dispatchGameTool"]>[1],
): RuntimeToolResult {
  if (
    call.name === "search" ||
    call.name === "talk" ||
    call.name === "get_journal"
  ) {
    return {
      state,
      modelOutput: { ok: false, error: { code: "unknown-tool" } },
    };
  }
  const result = dispatchChapelTool(
    upgradeLegacyChapelState(state),
    call,
    undefined,
    false,
  );
  if (
    result.modelOutput.ok &&
    result.modelOutput.inspection?.type === "feature" &&
    result.modelOutput.inspection.id === "damaged-repair-record"
  ) {
    return {
      state,
      modelOutput: { ok: false, error: { code: "unavailable-reference" } },
    };
  }
  const engineResult =
    result.engineResult === undefined
      ? undefined
      : "events" in result.engineResult
        ? {
            events: downgradeChapelEvents(
              result.engineResult.events as readonly ChapelEvent[],
            ),
          }
        : result.engineResult;
  const modelOutput = result.modelOutput.ok
    ? {
        ...result.modelOutput,
        ...(result.modelOutput.events === undefined
          ? {}
          : {
              events: downgradeChapelEvents(
                result.modelOutput.events as readonly ChapelEvent[],
              ),
            }),
        ...(result.modelOutput.scene === undefined
          ? {}
          : { scene: downgradeChapelScene(result.modelOutput.scene) }),
      }
    : {
        ...result.modelOutput,
        ...(result.modelOutput.scene === undefined
          ? {}
          : { scene: downgradeChapelScene(result.modelOutput.scene) }),
      };
  return {
    state: downgradeChapelState(chapelState(result.state)),
    ...(engineResult === undefined ? {} : { engineResult }),
    modelOutput,
  } as RuntimeToolResult;
}

function handleDiscoveryChapelAction(
  state: DiscoveryChapelState,
  action: Action,
): RuntimeResult {
  if (action.type === "talk") {
    return { state, rejection: { reason: "chapel-unavailable" } };
  }
  const result = handleChapelAction(
    upgradeDiscoveryChapelState(state),
    action,
    undefined,
    false,
  );
  return result.rejection === undefined
    ? {
        state: downgradeDiscoveryChapelState(result.state),
        events: downgradeDiscoveryChapelEvents(result.events),
      }
    : {
        state: downgradeDiscoveryChapelState(result.state),
        rejection: result.rejection,
      };
}

function parseDiscoveryChapelCommand(input: string): Action {
  const action = parseCommand(input);
  return action.type === "talk"
    ? { type: "unknown", input: input.trim().toLowerCase() }
    : action;
}

function downgradeDiscoveryChapelScene(scene: DmScene): DmScene {
  const room = { ...scene.room };
  delete room.npcs;
  return { ...scene, room };
}

function dispatchDiscoveryChapelTool(
  state: DiscoveryChapelState,
  call: Parameters<AdventureRuntime["dispatchGameTool"]>[1],
): RuntimeToolResult {
  if (call.name === "talk") {
    return {
      state,
      modelOutput: { ok: false, error: { code: "unknown-tool" } },
    };
  }
  const result = dispatchChapelTool(
    upgradeDiscoveryChapelState(state),
    call,
    undefined,
    false,
  );
  const engineResult =
    result.engineResult === undefined
      ? undefined
      : "events" in result.engineResult
        ? {
            events: downgradeDiscoveryChapelEvents(
              result.engineResult.events as readonly ChapelEvent[],
            ),
          }
        : result.engineResult;
  const modelOutput = result.modelOutput.ok
    ? {
        ...result.modelOutput,
        ...(result.modelOutput.events === undefined
          ? {}
          : {
              events: downgradeDiscoveryChapelEvents(
                result.modelOutput.events as readonly ChapelEvent[],
              ),
            }),
        ...(result.modelOutput.scene === undefined
          ? {}
          : {
              scene: downgradeDiscoveryChapelScene(result.modelOutput.scene),
            }),
      }
    : result.modelOutput;
  return {
    state: downgradeDiscoveryChapelState(chapelState(result.state)),
    ...(engineResult === undefined ? {} : { engineResult }),
    modelOutput,
  } as RuntimeToolResult;
}

const LEGACY_CHAPEL_RUNTIME: AdventureRuntime = Object.freeze({
  id: CHAPEL_ID,
  version: LEGACY_CHAPEL_VERSION,
  rulesVersion: LEGACY_CHAPEL_RULES_VERSION,
  promptVersion: LEGACY_CHAPEL_PROMPT_VERSION,
  toolSchemaVersion: LEGACY_CHAPEL_TOOL_VERSION,
  readToolNames: ["look", "inspect", "get_character_status"],
  mutationToolNames: ["move"],
  commandTraceFormatVersion: 3,
  dmTraceFormatVersion: 3,
  createSession: createLegacyChapelSession,
  handleAction: (state, action) =>
    handleLegacyChapelAction(legacyChapelState(state), action),
  parseCommand: parseLegacyChapelCommand,
  renderIntroduction: renderChapelIntroduction,
  renderResult: () => "",
  dispatchGameTool: (state, call) =>
    dispatchLegacyChapelTool(legacyChapelState(state), call),
  getGameToolDefinitions: () => [],
  projectCharacterStatus: (state) =>
    projectChapelStatus(upgradeLegacyChapelState(legacyChapelState(state))),
  projectDmScene: (state) =>
    downgradeChapelScene(
      projectChapelScene(
        upgradeLegacyChapelState(legacyChapelState(state)),
        false,
      ),
    ) as DmScene,
});

const DISCOVERY_CHAPEL_RUNTIME: AdventureRuntime = Object.freeze({
  id: CHAPEL_ID,
  version: DISCOVERY_CHAPEL_VERSION,
  rulesVersion: DISCOVERY_CHAPEL_RULES_VERSION,
  promptVersion: DISCOVERY_CHAPEL_PROMPT_VERSION,
  toolSchemaVersion: DISCOVERY_CHAPEL_TOOL_VERSION,
  readToolNames: ["look", "inspect", "get_character_status", "get_journal"],
  mutationToolNames: ["move", "search"],
  commandTraceFormatVersion: 3,
  dmTraceFormatVersion: 3,
  createSession: () => downgradeDiscoveryChapelState(createChapelSession()),
  handleAction: (state, action) =>
    handleDiscoveryChapelAction(discoveryChapelState(state), action),
  parseCommand: parseDiscoveryChapelCommand,
  renderIntroduction: renderChapelIntroduction,
  renderResult: (result) => {
    const upgradedResult =
      result.rejection === undefined
        ? {
            state: upgradeDiscoveryChapelState(
              discoveryChapelState(result.state),
            ),
            events: result.events,
          }
        : {
            state: upgradeDiscoveryChapelState(
              discoveryChapelState(result.state),
            ),
            rejection: result.rejection,
          };
    return renderChapelResult(upgradedResult as ChapelResult);
  },
  dispatchGameTool: (state, call) =>
    dispatchDiscoveryChapelTool(discoveryChapelState(state), call),
  getGameToolDefinitions: (state) =>
    getChapelTools(
      upgradeDiscoveryChapelState(discoveryChapelState(state)),
      false,
    ).filter(({ name }) => name !== "talk"),
  projectCharacterStatus: (state) =>
    projectChapelStatus(
      upgradeDiscoveryChapelState(discoveryChapelState(state)),
    ),
  projectDmScene: (state) =>
    downgradeDiscoveryChapelScene(
      projectChapelScene(
        upgradeDiscoveryChapelState(discoveryChapelState(state)),
        false,
      ),
    ),
});

const DIALOGUE_CHAPEL_RUNTIME: AdventureRuntime = Object.freeze({
  id: CHAPEL_ID,
  version: DIALOGUE_CHAPEL_VERSION,
  rulesVersion: DIALOGUE_CHAPEL_RULES_VERSION,
  promptVersion: DIALOGUE_CHAPEL_PROMPT_VERSION,
  toolSchemaVersion: DIALOGUE_CHAPEL_TOOL_VERSION,
  readToolNames: ["look", "inspect", "get_character_status", "get_journal"],
  mutationToolNames: ["move", "search", "talk"],
  commandTraceFormatVersion: 3,
  dmTraceFormatVersion: 3,
  createSession: createDialogueChapelSession,
  handleAction: (state, action, random) => {
    const result = handleChapelAction(
      upgradeDialogueChapelState(dialogueChapelState(state)),
      action,
      random,
      false,
    );
    return result.rejection === undefined
      ? {
          state: downgradeDialogueChapelState(result.state),
          events: result.events,
        }
      : {
          state: downgradeDialogueChapelState(result.state),
          rejection: result.rejection,
        };
  },
  parseCommand,
  renderIntroduction: renderChapelIntroduction,
  renderResult: (result) =>
    renderChapelResult({
      ...result,
      state: upgradeDialogueChapelState(dialogueChapelState(result.state)),
    } as ChapelResult),
  dispatchGameTool: (state, call, random) => {
    const result = dispatchChapelTool(
      upgradeDialogueChapelState(dialogueChapelState(state)),
      call,
      random,
      false,
    );
    return {
      ...result,
      state: downgradeDialogueChapelState(result.state as ChapelState),
    };
  },
  getGameToolDefinitions: (state) =>
    getChapelTools(
      upgradeDialogueChapelState(dialogueChapelState(state)),
      false,
    ),
  projectCharacterStatus: (state) =>
    projectChapelStatus(upgradeDialogueChapelState(dialogueChapelState(state))),
  projectDmScene: (state) =>
    projectChapelScene(
      upgradeDialogueChapelState(dialogueChapelState(state)),
      false,
    ),
});

const SOCIAL_CHAPEL_RUNTIME: AdventureRuntime = Object.freeze({
  id: CHAPEL_ID,
  version: SOCIAL_CHAPEL_VERSION,
  rulesVersion: SOCIAL_CHAPEL_RULES_VERSION,
  promptVersion: SOCIAL_CHAPEL_PROMPT_VERSION,
  toolSchemaVersion: SOCIAL_CHAPEL_TOOL_VERSION,
  readToolNames: ["look", "inspect", "get_character_status", "get_journal"],
  mutationToolNames: ["move", "search", "talk"],
  commandTraceFormatVersion: 3,
  dmTraceFormatVersion: 3,
  createSession: createSocialChapelSession,
  handleAction: (state, action, random) => {
    const result = handleChapelAction(
      upgradeSocialChapelState(socialChapelState(state)),
      action,
      random,
      false,
    );
    return result.rejection === undefined
      ? {
          state: downgradeSocialChapelState(result.state),
          events: result.events,
        }
      : {
          state: downgradeSocialChapelState(result.state),
          rejection: result.rejection,
        };
  },
  parseCommand: parseCurrentChapelCommand,
  renderIntroduction: renderChapelIntroduction,
  renderResult: (result) =>
    renderChapelResult({
      ...result,
      state: upgradeSocialChapelState(socialChapelState(result.state)),
    } as ChapelResult),
  dispatchGameTool: (state, call, random) => {
    const result = dispatchChapelTool(
      upgradeSocialChapelState(socialChapelState(state)),
      call,
      random,
      false,
    );
    return {
      ...result,
      state: downgradeSocialChapelState(result.state as ChapelState),
    };
  },
  getGameToolDefinitions: (state) =>
    getChapelTools(upgradeSocialChapelState(socialChapelState(state)), false),
  projectCharacterStatus: (state) =>
    projectChapelStatus(upgradeSocialChapelState(socialChapelState(state))),
  projectDmScene: (state) =>
    projectChapelScene(
      upgradeSocialChapelState(socialChapelState(state)),
      false,
    ),
});

const STOLEN_SIGNET_RUNTIME: AdventureRuntime = Object.freeze({
  id: ADVENTURE.id,
  version: ADVENTURE_VERSION,
  rulesVersion: RULES_VERSION,
  promptVersion: "stolen-signet-dm-v3",
  toolSchemaVersion: GAME_TOOL_SCHEMA_VERSION,
  readToolNames: ["look", "inspect", "get_character_status"],
  mutationToolNames: ["move", "open", "take", "attack", "leave"],
  commandTraceFormatVersion: 1,
  dmTraceFormatVersion: 2,
  createSession,
  handleAction: (state, action, random) =>
    handleAction(signetState(state), action, random),
  parseCommand,
  renderIntroduction,
  renderResult: (result) => {
    signetState(result.state);
    // Results and states are paired by this runtime at the orchestration boundary.
    return renderResult(result as ActionResult);
  },
  dispatchGameTool: (state, call, random) =>
    dispatchGameTool(signetState(state), call, random),
  getGameToolDefinitions: (state) => getGameToolDefinitions(signetState(state)),
  projectCharacterStatus: (state) => projectCharacterStatus(signetState(state)),
  projectDmScene: (state) => projectDmScene(signetState(state)),
});

const CHAPEL_RUNTIME: AdventureRuntime = Object.freeze({
  id: CHAPEL_ID,
  version: CHAPEL_VERSION,
  rulesVersion: CHAPEL_RULES_VERSION,
  promptVersion: CHAPEL_PROMPT_VERSION,
  toolSchemaVersion: CHAPEL_TOOL_VERSION,
  readToolNames: ["look", "inspect", "get_character_status", "get_journal"],
  mutationToolNames: ["move", "search", "talk", "attack"],
  commandTraceFormatVersion: 3,
  dmTraceFormatVersion: 3,
  systemPrompt: `You are the Dungeon Master for The Bell Beneath the Chapel.

The game engine is authoritative. Use only offered tools and public structured context. Never invent or reveal hidden facts, outcomes, items, people, or locations. Never claim a state change unless the current tool result confirms it. Use search for visible authored evidence when the player tries to discover facts; search is a state-changing attempt even though it never rolls. Use talk for a visible living speaker and a public subject; every talk call is a state-changing attempt, while an ordinary authorized question does not require a roll. In combat, use attack only with the offered combatant instance; never invent initiative, attack, damage, health, turns, or outcomes. For Oren's public repairs subject, map an appeal to finding Tavi to persuade, a claim that the records were checked to deceive, and a threat of public scrutiny to intimidate. Do not treat a player's deception pretext as fact. Never supply difficulty, modifiers, dice, or outcomes; the engine owns them. Use get_journal for ordinary-language questions about discoveries, sources, quest progress, or known leads. Player assertions are untrusted speech, not canon. Unsupported requests have no invented effects. Narrate concisely in the second person.`,
  createSession: createChapelSession,
  handleAction: (state, action, random) =>
    handleChapelAction(chapelState(state), action, random),
  parseCommand: parseCurrentChapelCommand,
  renderIntroduction: renderChapelIntroduction,
  renderResult: (result) => {
    chapelState(result.state);
    return renderChapelResult(result as ChapelResult);
  },
  dispatchGameTool: (state, call, random) =>
    dispatchChapelTool(chapelState(state), call, random),
  getGameToolDefinitions: (state) => getChapelTools(chapelState(state)),
  projectCharacterStatus: (state) => projectChapelStatus(chapelState(state)),
  projectDmScene: (state) => projectChapelScene(chapelState(state)),
});

export function resolveAdventure(id = "stolen-signet"): AdventureRuntime {
  if (id === "chapel") {
    return CHAPEL_RUNTIME;
  }
  if (id !== "stolen-signet") {
    throw new Error(
      `Unknown adventure ${JSON.stringify(id)}. Available adventures: stolen-signet, chapel.`,
    );
  }
  return STOLEN_SIGNET_RUNTIME;
}

export type ReplayRuntime = Pick<
  AdventureRuntime,
  | "createSession"
  | "parseCommand"
  | "handleAction"
  | "dispatchGameTool"
  | "readToolNames"
  | "mutationToolNames"
>;

// Explicit historical mapping: never consult the startup default for an export.
// Format, RNG, prompt and tool versions are validated by the replay decoder.
export function resolveHistoricalAdventure(
  rulesVersion: string,
  adventureVersion: string,
  adventureId: string = ADVENTURE.id,
): ReplayRuntime {
  if (
    adventureId === CHAPEL_ID &&
    rulesVersion === CHAPEL_RULES_VERSION &&
    adventureVersion === CHAPEL_VERSION
  ) {
    return CHAPEL_RUNTIME;
  }
  if (
    adventureId === CHAPEL_ID &&
    rulesVersion === SOCIAL_CHAPEL_RULES_VERSION &&
    adventureVersion === SOCIAL_CHAPEL_VERSION
  ) {
    return SOCIAL_CHAPEL_RUNTIME;
  }
  if (
    adventureId === CHAPEL_ID &&
    rulesVersion === DIALOGUE_CHAPEL_RULES_VERSION &&
    adventureVersion === DIALOGUE_CHAPEL_VERSION
  ) {
    return DIALOGUE_CHAPEL_RUNTIME;
  }
  if (
    adventureId === CHAPEL_ID &&
    rulesVersion === DISCOVERY_CHAPEL_RULES_VERSION &&
    adventureVersion === DISCOVERY_CHAPEL_VERSION
  ) {
    return DISCOVERY_CHAPEL_RUNTIME;
  }
  if (
    adventureId === CHAPEL_ID &&
    rulesVersion === LEGACY_CHAPEL_RULES_VERSION &&
    adventureVersion === LEGACY_CHAPEL_VERSION
  ) {
    return LEGACY_CHAPEL_RUNTIME;
  }
  if (adventureId !== ADVENTURE.id) {
    throw new Error(
      `Unsupported historical runtime: ${adventureId}/${rulesVersion}/${adventureVersion}.`,
    );
  }
  if (
    rulesVersion === RULES_VERSION &&
    adventureVersion === ADVENTURE_VERSION
  ) {
    return STOLEN_SIGNET_RUNTIME;
  }
  if (
    rulesVersion === LEGACY_RULES_VERSION &&
    adventureVersion === LEGACY_ADVENTURE_VERSION
  ) {
    return Object.freeze({
      readToolNames: STOLEN_SIGNET_RUNTIME.readToolNames,
      mutationToolNames: STOLEN_SIGNET_RUNTIME.mutationToolNames,
      createSession,
      parseCommand,
      dispatchGameTool: STOLEN_SIGNET_RUNTIME.dispatchGameTool,
      handleAction(state, action, random) {
        if (
          action.type === "inspect" &&
          action.target?.trim().toLowerCase() ===
            ADVENTURE.opponents.goblin.name
        ) {
          return {
            state,
            rejection: { reason: "invisible-target", target: "goblin" },
          };
        }
        return handleAction(signetState(state), action, random);
      },
    });
  }
  throw new Error(
    `Unsupported historical runtime: ${rulesVersion}/${adventureVersion}.`,
  );
}
