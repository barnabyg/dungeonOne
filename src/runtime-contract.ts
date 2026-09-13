import type { Action, SessionState, Event, Rejection } from "./session.js";
import type {
  ChapelState,
  ChapelEvent,
  ChapelJournal,
  ChapelConversation,
  DialogueChapelState,
  LegacyChapelState,
  LegacyChapelEvent,
  DiscoveryChapelState,
  DiscoveryChapelEvent,
  ChapelRejection,
} from "./chapel.js";
import type {
  CharacterStatus,
  DmScene,
  DmInspection,
  GameToolCall,
  GameToolDefinition,
  ToolValidationErrorCode,
} from "./game-tools.js";
import type { RandomSource } from "./random.js";

export type RuntimeState =
  | SessionState
  | ChapelState
  | DialogueChapelState
  | DiscoveryChapelState
  | LegacyChapelState;
export type RuntimeEvent =
  Event | ChapelEvent | DiscoveryChapelEvent | LegacyChapelEvent;
export type RuntimeRejection = Rejection | ChapelRejection;
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
export type RuntimeToolResult = Readonly<{
  state: RuntimeState;
  engineResult?:
    | Readonly<{ events: readonly RuntimeEvent[] }>
    | Readonly<{ rejection: RuntimeRejection }>;
  modelOutput:
    | Readonly<{
        ok: true;
        scene?: DmScene;
        status?: CharacterStatus;
        journal?: ChapelJournal;
        conversation?: ChapelConversation;
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
  systemPrompt?: string;
  toolSchemaVersion: string;
  readToolNames: readonly string[];
  mutationToolNames: readonly string[];
  commandTraceFormatVersion: 1 | 3;
  dmTraceFormatVersion: 2 | 3;
  createSession(): RuntimeState;
  handleAction(
    state: RuntimeState,
    action: Action,
    random?: Pick<RandomSource, "roll">,
  ): RuntimeResult;
  parseCommand(input: string): Action;
  renderIntroduction(): string;
  renderResult(result: RuntimeResult): string;
  dispatchGameTool(
    state: RuntimeState,
    call: GameToolCall,
    random?: Pick<RandomSource, "roll">,
  ): RuntimeToolResult;
  getGameToolDefinitions(state: RuntimeState): readonly GameToolDefinition[];
  projectCharacterStatus(state: RuntimeState): CharacterStatus;
  projectDmScene(state: RuntimeState): DmScene;
}>;
