/**
 * The generic runtime interface.
 *
 * The AI DM turn loop and the model adapters depend only on this module, and
 * take the runtime they drive as an argument. The 5e runtime (runtime-5e.ts)
 * implements `AdventureRuntime`; the tests also drive a minimal counter
 * runtime. A lint rule keeps shared modules from importing the 5e game.
 *
 * Runtime state is engine-owned JSON. Shared code reads only its `status`,
 * persists it, compares it and hands it back to the runtime that produced it.
 */
import type { RandomSource } from "./random.js";

/** `escaped`: the player chose to leave the adventure, alive. */
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
    }>[];
    opponents: readonly Readonly<{
      id: string;
      name: string;
      condition: "living" | "defeated";
    }>[];
    npcs?: readonly Readonly<{
      id: string;
      name: string;
      condition: "living";
      description?: string;
      subjects: readonly Readonly<{
        id: string;
        name: string;
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
  combatStatus?: string;
}>;

export type CharacterStatus = Readonly<{
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
  resources?: readonly string[];
}>;

/** The AI DM's tools for reading the scene and acting in it. */
export type GameToolName =
  | "look"
  | "get_character_status"
  | "move"
  | "examine"
  | "search"
  | "take"
  | "use_item"
  | "talk"
  | "attack";

/** The AI DM's tools for 5e class features, doors and traps. */
export type FifthToolName =
  | "second_wind"
  | "action_surge"
  | "light_attack"
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

export type AdventureRuntime = Readonly<{
  id: string;
  version: string;
  rulesVersion: string;
  promptVersion: string;
  systemPrompt: string;
  toolSchemaVersion: string;
  readToolNames: readonly string[];
  mutationToolNames: readonly string[];
  /** Create a fresh session. */
  createSession(): RuntimeState;
  /** Resolve one action. Dice come only from `random`. */
  handleAction(
    state: RuntimeState,
    action: RuntimeAction,
    random?: Pick<RandomSource, "roll">,
  ): RuntimeResult;
  renderResult(result: RuntimeResult): string;
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
}>;
