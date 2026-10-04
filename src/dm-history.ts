import type {
  AdventureRuntime,
  DmHistory,
  RecordedTransition,
  RuntimeState,
} from "./runtime-contract.js";

export type { DmHistory, DmHistoryFact } from "./runtime-contract.js";

export const DM_HISTORY_LIMIT = 12;

/**
 * A player-visible, bounded account of save-verified transitions, projected
 * by the runtime. Runtimes without a history projection have none.
 */
export function projectDmHistory(
  runtime: AdventureRuntime,
  state: RuntimeState,
  transitions: readonly RecordedTransition[],
  speakerId?: string,
): DmHistory | undefined {
  return runtime.projectDmHistory?.(state, transitions, speakerId);
}
