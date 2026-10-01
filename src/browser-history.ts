import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { DmTranscriptEntry } from "./dm-turn.js";

export type ResultCard = Readonly<{ title: string; text: string }>;
export type BrowserTurn = Readonly<{
  sequence: number;
  message: string;
  reply: string;
  speaker?: string;
  cards: readonly ResultCard[];
  committed: boolean;
  notice: string;
}>;
export type BrowserHistory = Readonly<{
  version: 1;
  progress: Readonly<{
    sequence: number;
    stateDigest: string;
    randomPosition: number;
  }>;
  turns: readonly BrowserTurn[];
  pending?: Readonly<{
    sequence: number;
    message: string;
    cards: readonly ResultCard[];
  }>;
}>;

export function historyDigest(history: BrowserHistory): string {
  return createHash("sha256").update(JSON.stringify(history)).digest("hex");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function text(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100_000 &&
    !/[\ud800-\udfff]/u.test(value)
  );
}
function cards(value: unknown): value is readonly ResultCard[] {
  return (
    Array.isArray(value) &&
    value.length <= 16 &&
    value.every(
      (card) =>
        record(card) &&
        keys(card, ["title", "text"]) &&
        text(card.title) &&
        text(card.text),
    )
  );
}

/** The engine has already verified this progress by replay. History is display data only. */
export function validateBrowserHistory(
  value: unknown,
  checksum: unknown,
  progress: BrowserHistory["progress"],
): BrowserHistory {
  const fail = () => {
    throw new Error(
      "Invalid or inconsistent browser conversation history; save left unchanged.",
    );
  };
  if (
    !record(value) ||
    !keys(value, ["version", "progress", "turns", "pending"]) ||
    value.version !== 1 ||
    !record(value.progress) ||
    !isDeepStrictEqual(value.progress, progress) ||
    !Array.isArray(value.turns) ||
    value.turns.length > 10000
  ) {
    return fail();
  }
  let sequence = 0;
  for (const turn of value.turns) {
    if (
      !record(turn) ||
      !keys(turn, [
        "sequence",
        "message",
        "reply",
        "speaker",
        "cards",
        "committed",
        "notice",
      ]) ||
      !Number.isSafeInteger(turn.sequence) ||
      typeof turn.sequence !== "number" ||
      turn.sequence < sequence ||
      turn.sequence > progress.sequence ||
      !text(turn.message) ||
      turn.message.length > 1000 ||
      !text(turn.reply) ||
      (turn.speaker !== undefined && !text(turn.speaker)) ||
      !cards(turn.cards) ||
      typeof turn.committed !== "boolean" ||
      (turn.committed &&
        (turn.sequence <= sequence ||
          !turn.cards.some((card) => card.title === "Resolved action"))) ||
      !text(turn.notice)
    ) {
      return fail();
    }
    sequence = turn.sequence;
  }
  if (value.pending !== undefined) {
    const pending = value.pending;
    if (
      !record(pending) ||
      !keys(pending, ["sequence", "message", "cards"]) ||
      !Number.isSafeInteger(pending.sequence) ||
      typeof pending.sequence !== "number" ||
      pending.sequence < sequence ||
      pending.sequence > progress.sequence ||
      progress.sequence - pending.sequence > 1 ||
      !text(pending.message) ||
      pending.message.length > 1000 ||
      !cards(pending.cards)
    ) {
      return fail();
    }
    const committed = pending.sequence < progress.sequence;
    if (
      committed
        ? pending.cards.length !== 1 ||
          pending.cards[0]?.title !== "Resolved action"
        : pending.cards.length !== 0
    ) {
      return fail();
    }
  }
  const history = value as BrowserHistory;
  if (checksum !== historyDigest(history)) {
    return fail();
  }
  return history;
}

// Never feed the long visible record or result cards back to the provider.
// NPC replies receive the engine's separate speaker-scoped context in runDmTurn.
export function browserTranscript(
  history: BrowserHistory | undefined,
): readonly DmTranscriptEntry[] {
  return (history?.turns ?? []).slice(-4).flatMap((turn) => [
    { role: "player" as const, text: turn.message },
    { role: "dungeon-master" as const, text: turn.reply },
  ]);
}
