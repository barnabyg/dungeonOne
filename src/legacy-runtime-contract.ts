// The pre-5e runtimes' own contract: their state, event and result unions.
// Only old runtime modules use it; shared code uses runtime-contract.ts.
import type { CharacterSheet } from "./character-rules.js";
import type { Action, SessionState, Event, Rejection } from "./session.js";
import type {
  ChapelState,
  ChapelEvent,
  ChapelJournal,
  ChapelConversation,
  SocialChapelState,
  GuardianChapelState,
  PotionChapelState,
  RescueChapelState,
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
import type {
  BrowserFacts,
  DmHistory,
  RecordedTransition,
  RuntimeDomainEvent,
} from "./runtime-contract.js";
import type {
  ExplorationState,
  ExplorationEvent,
} from "./exploration-runtime.js";
import type { ValidatedAdventure } from "./adventure-loader.js";
import type { SignetState, SignetEvent } from "./signet-runtime.js";
import type {
  ClueState,
  ClueEvent,
  ClueJournal,
  ClueConversation,
} from "./chapel-clues-runtime.js";

export type RuntimeState =
  | ClueState
  | SignetState
  | ExplorationState
  | SessionState
  | ChapelState
  | GuardianChapelState
  | PotionChapelState
  | RescueChapelState
  | SocialChapelState
  | DialogueChapelState
  | DiscoveryChapelState
  | LegacyChapelState;
export type RuntimeEvent =
  | ClueEvent
  | SignetEvent
  | Event
  | ChapelEvent
  | DiscoveryChapelEvent
  | LegacyChapelEvent
  | ExplorationEvent;
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
  action?: Action;
  engineResult?:
    | Readonly<{ events: readonly RuntimeEvent[] }>
    | Readonly<{ rejection: RuntimeRejection }>;
  modelOutput:
    | Readonly<{
        ok: true;
        scene?: DmScene;
        status?: CharacterStatus;
        journal?: ChapelJournal | ClueJournal;
        conversation?: ChapelConversation | ClueConversation;
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
  startingCharacter?: CharacterSheet;
  commandTraceFormatVersion: 1 | 3 | 4 | 6;
  dmTraceFormatVersion: 2 | 3 | 4 | 6;
  content?: ValidatedAdventure;
  engineVersion?: string;
  localStatusReads?: boolean;
  createSession(): RuntimeState;
  handleAction(
    state: RuntimeState,
    action: Action,
    random?: Pick<RandomSource, "roll">,
  ): RuntimeResult;
  parseCommand(input: string): Action;
  renderIntroduction(): string;
  renderResult(result: RuntimeResult): string;
  renderStateSummary?(state: RuntimeState): string;
  renderDmNarration?(
    call: GameToolCall,
    result: RuntimeToolResult,
  ): string | undefined;
  dispatchGameTool(
    state: RuntimeState,
    call: GameToolCall,
    random?: Pick<RandomSource, "roll">,
    playerInput?: string,
  ): RuntimeToolResult;
  getGameToolDefinitions(state: RuntimeState): readonly GameToolDefinition[];
  projectCharacterStatus(state: RuntimeState): CharacterStatus;
  projectDmScene(state: RuntimeState): DmScene;
  projectPlayerClocks?(state: RuntimeState): readonly Readonly<{
    id: string;
    name: string;
    unit: "day" | "tick";
    value: number;
  }>[];
  recordDomainEvents?(
    action: Action,
    actionId: string,
    before: RuntimeState,
    after: RuntimeState,
    events: readonly RuntimeEvent[],
    includeSettledEvents: boolean,
  ): readonly RuntimeDomainEvent[];
  projectDmHistory?(
    state: RuntimeState,
    transitions: readonly RecordedTransition[],
    speakerId?: string,
  ): DmHistory | undefined;
  projectCharacterResult?(
    state: RuntimeState,
    startingSheet: CharacterSheet,
  ): unknown;
  projectBrowserFacts?(state: RuntimeState): BrowserFacts | undefined;
}>;
