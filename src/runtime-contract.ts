/**
 * The generic runtime interface.
 *
 * Shared infrastructure (saves, traces and replay, the AI DM turn loop and its
 * history, the browser server and the character career handoff) depends only
 * on this module. Each runtime implements `AdventureRuntime`, and
 * `data-runtime.ts` is the single registry that selects one. A lint rule keeps
 * shared modules from importing a runtime directly, so a runtime can be added
 * or deleted without touching shared code.
 *
 * Runtime state is engine-owned JSON. Shared code reads only its `status`,
 * persists it, compares it and hands it back to the runtime that produced it.
 */
import type { RandomSource } from "./random.js";

/** `escaped`: the player chose to leave the adventure, alive (5e only). */
export type RuntimeStatus =
  "playing" | "victory" | "defeat" | "escaped" | "quit";

/** Opaque, serialisable session state owned by one runtime. */
export type RuntimeState = Readonly<{ status: RuntimeStatus }>;

/** A validated player action; its other fields belong to the runtime. */
export type RuntimeAction = Readonly<{ type: string }>;

export type RuntimeEvent = Readonly<{ type: string }>;

export type RuntimeRejection = Readonly<{ reason: string }>;

export type RuntimeResult =
  | Readonly<{
      state: RuntimeState;
      events: readonly RuntimeEvent[];
      rejection?: never;
    }>
  | Readonly<{
      state: RuntimeState;
      rejection: RuntimeRejection;
      events?: never;
    }>;

/** A save-verified, runtime-authored fact about one committed transition. */
export type RuntimeDomainEvent = Readonly<{ type: string; actionId: string }>;

/** A committed transition as saves record it. */
export type RecordedTransition = Readonly<{
  sequence: number;
  action?: RuntimeAction;
  domainEvents?: readonly RuntimeDomainEvent[];
}>;

export type DmHistoryFact = Readonly<{
  sequence: number;
  type: string;
  subjectId: string;
  detail?: string;
  cause?: string;
}>;

/** A player-visible, bounded account of earlier play for the AI DM. */
export type DmHistory = Readonly<{
  locationId: string;
  speakerId?: string;
  facts: readonly DmHistoryFact[];
}>;

export type DmJournal = Readonly<{
  quest: Readonly<{
    id: string;
    title: string;
    status: "active" | "resolved";
    milestones: readonly string[];
  }>;
  discoveries: readonly Readonly<{
    id: string;
    title: string;
    classification: "observation" | "testimony" | "belief";
    source: Readonly<{
      type: "feature" | "npc";
      id: string;
      name: string;
      locationId: string;
    }>;
    summary: string;
    actionableLead?: string;
  }>[];
  actionableLeads: readonly string[];
  /** A runtime-specific resolution record, shown as given. */
  resolution?: Readonly<{ id: string }>;
  ending?:
    | Readonly<{
        id: string;
        fate: string;
        casualties: readonly string[];
        consequences: readonly string[];
        narration: string;
      }>
    | undefined;
}>;

/** An engine-authored conversation result the AI DM may voice. */
export type DmConversation = Readonly<{
  speakerId: string;
  speakerName: string;
  topicId: string;
  topicName: string;
  approach: string;
  attitude: string;
  voice: string;
  approvedFacts: readonly Readonly<{ id: string; statement: string }>[];
  authoredReply: string;
  speakerHistory: readonly string[];
  allowedClosings?: readonly ("none" | "check-carefully")[];
  /** Show the authored reply as written, without composing one (#95). */
  authoredOnly?: true;
}>;

/** The player-safe scene: everything the AI DM and the browser may see. */
export type DmScene = Readonly<{
  title: string;
  objective: string;
  outcome: RuntimeStatus;
  room: Readonly<{
    id: string;
    name: string;
    description: string;
    features: readonly Readonly<{
      id: string;
      name: string;
      description: string;
    }>[];
    items: readonly Readonly<{
      id: string;
      name: string;
      description: string;
      /** Where a pre-5e item lies; 5e items are simply in the room. */
      placement?: Readonly<{
        featureId: string;
        description: string;
      }>;
    }>[];
    opponents: readonly Readonly<{
      id: string;
      name: string;
      condition: "living" | "defeated";
    }>[];
    npcs?: readonly Readonly<{
      id: string;
      name: string;
      condition: "living" | "dead";
      description?: string;
      subjects: readonly Readonly<{
        id: string;
        name: string;
        intent?: "claim" | "correction";
        stakes?: string;
      }>[];
    }>[];
    exits: readonly Readonly<{
      destinationId: string;
      name: string;
      doorway?: Readonly<{
        doorId: string;
        name: string;
        open: boolean;
      }>;
    }>[];
  }>;
  combat?: Readonly<
    | { opponentId: string; currentTurn: string }
    | { opponentCombatantId: string; currentTurn: string }
  >;
  journal?: DmJournal;
  suggestions?: readonly string[];
  combatChoices?: readonly Readonly<{
    featureId: string;
    label: string;
    stakes: string;
  }>[];
  recoveryChoices?: readonly Readonly<{
    featureId: string;
    label: string;
    stakes: string;
  }>[];
  itemUseChoices?: readonly Readonly<{
    itemId: string;
    featureId: string;
    label: string;
    stakes: string;
  }>[];
  combatStatus?: string;
  endingChoices?: readonly Readonly<{
    id: string;
    label: string;
    stakes: string;
  }>[];
}>;

export type CharacterStatus = Readonly<{
  pendingXp?: number;
  hp: number;
  maxHp: number;
  equipment: readonly Readonly<{ id: string; name: string }>[];
  collectedItems: readonly Readonly<{
    id: string;
    name: string;
    description?: string;
  }>[];
  outcome: RuntimeStatus;
  combatTurn?: string;
  conditions?: readonly string[];
  resources?: readonly string[];
}>;

export type GameToolName =
  | "check_ability"
  | "look"
  | "move"
  | "follow"
  | "inspect"
  | "search"
  | "examine"
  | "talk"
  | "open"
  | "take"
  | "place_item"
  | "use_item"
  | "recover"
  | "brace"
  | "attack"
  | "resolve_quest"
  | "wait"
  | "adjudicate"
  | "distract"
  | "deceive"
  | "offer"
  | "leave"
  | "get_journal"
  | "get_character_status";

/** Tools only the 5e runtime offers; kept apart from the pre-5e tool set. */
export type FifthToolName =
  | "second_wind"
  | "action_surge"
  | "end_turn"
  | "force_door"
  | "pick_lock"
  | "break_door"
  | "unlock"
  | "disarm";

/** A bounded tool the AI DM may call; the runtime offers only legal ones. */
export type GameToolDefinition = Readonly<{
  type: "function";
  name: GameToolName | FifthToolName;
  description: string;
  strict: true;
  parameters: Readonly<Record<string, unknown>>;
}>;

export type GameToolCall = Readonly<{
  name: string;
  argumentsJson: string;
}>;

export type DmInspection = Readonly<
  | {
      type: "feature" | "item";
      id: string;
      name: string;
      description: string;
    }
  | {
      type: "opponent";
      id: string;
      name: string;
      description: string;
      condition: "living" | "defeated";
    }
  | {
      type: "door";
      id: string;
      name: string;
      description: string;
      open: boolean;
    }
  | {
      type: "named_exit";
      destinationId: string;
      name: string;
      doorway?: Readonly<{
        doorId: string;
        name: string;
        open: boolean;
      }>;
    }
>;

export type ToolValidationErrorCode =
  | "unknown-tool"
  | "malformed-json"
  | "invalid-arguments"
  | "unavailable-reference";

export type RuntimeToolResult = Readonly<{
  state: RuntimeState;
  action?: RuntimeAction;
  engineResult?:
    | Readonly<{ events: readonly RuntimeEvent[] }>
    | Readonly<{ rejection: RuntimeRejection }>;
  modelOutput:
    | Readonly<{
        ok: true;
        scene?: DmScene;
        status?: CharacterStatus;
        journal?: DmJournal;
        conversation?: DmConversation;
        events?: readonly RuntimeEvent[];
        inspection?: DmInspection;
      }>
    | Readonly<{
        ok: false;
        error:
          | Readonly<{ code: ToolValidationErrorCode }>
          | Readonly<{ code: "action-rejected"; rejection: RuntimeRejection }>;
        scene?: DmScene;
      }>;
}>;

/** Browser-only, player-safe facts the AI DM scene leaves out. */
export type BrowserFacts = Readonly<{
  monsterHealth: Readonly<
    Record<string, Readonly<{ hp: number; maxHp: number }>>
  >;
  npcHealth: Readonly<Record<string, Readonly<{ hp: number; maxHp: number }>>>;
  consumedItemIds: readonly string[];
}>;

export type PlayerClock = Readonly<{
  id: string;
  name: string;
  unit: "day" | "tick";
  value: number;
}>;

export type AdventureRuntime = Readonly<{
  id: string;
  version: string;
  rulesVersion: string;
  promptVersion: string;
  systemPrompt?: string;
  toolSchemaVersion: string;
  readToolNames: readonly string[];
  mutationToolNames: readonly string[];
  commandTraceFormatVersion: 1 | 3 | 4 | 6;
  dmTraceFormatVersion: 2 | 3 | 4 | 6;
  engineVersion?: string;
  localStatusReads?: boolean;
  /** Create a fresh session. */
  createSession(): RuntimeState;
  /** Resolve one action. Dice come only from `random`. */
  handleAction(
    state: RuntimeState,
    action: RuntimeAction,
    random?: Pick<RandomSource, "roll">,
  ): RuntimeResult;
  parseCommand(input: string): RuntimeAction;
  renderIntroduction(): string;
  renderResult(result: RuntimeResult): string;
  renderStateSummary?(state: RuntimeState): string;
  renderDmNarration?(
    call: GameToolCall,
    result: RuntimeToolResult,
  ): string | undefined;
  /** Validate and resolve one AI DM tool call against the legal actions. */
  dispatchGameTool(
    state: RuntimeState,
    call: GameToolCall,
    random?: Pick<RandomSource, "roll">,
    playerInput?: string,
  ): RuntimeToolResult;
  /** The tools legal in this state. */
  getGameToolDefinitions(state: RuntimeState): readonly GameToolDefinition[];
  projectCharacterStatus(state: RuntimeState): CharacterStatus;
  projectDmScene(state: RuntimeState): DmScene;
  projectPlayerClocks?(state: RuntimeState): readonly PlayerClock[];
  /**
   * Save support: the domain events one committed transition records. A
   * runtime without it cannot be saved. Format-2 saves did not record settled
   * combat events, so replaying them passes `includeSettledEvents: false`.
   */
  recordDomainEvents?(
    action: RuntimeAction,
    actionId: string,
    before: RuntimeState,
    after: RuntimeState,
    events: readonly RuntimeEvent[],
    includeSettledEvents: boolean,
  ): readonly RuntimeDomainEvent[];
  /** The player-visible history of save-verified transitions. */
  projectDmHistory?(
    state: RuntimeState,
    transitions: readonly RecordedTransition[],
    speakerId?: string,
  ): DmHistory | undefined;
  /** Browser presentation facts; undefined when the state has none. */
  projectBrowserFacts?(state: RuntimeState): BrowserFacts | undefined;
}>;
