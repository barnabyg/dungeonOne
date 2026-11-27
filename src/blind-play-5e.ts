/**
 * Blind play: a model plays a module as a player who has never seen it,
 * choosing from the action bar the game shows and keeping a journal of what
 * it thinks is going on. The journal is the point: it shows whether the
 * module's story can be worked out from the screen alone, where the words
 * confuse, and which steps tell the player nothing.
 *
 * The player sees only what the command-line adapter prints (text-view-5e.ts)
 * and its own notes. The AI DM is off: it tests the module's own words. A
 * run is a report to read, never a pass or a fail, and is made only when
 * asked for (`npm run blind-play`); no test suite runs one.
 */
import type { FifthAdventure } from "./adventure-5e.js";
import type { CharacterSheet } from "./character-5e.js";
import type {
  StructuredModel,
  StructuredRequest,
} from "./openai-structured-model.js";
import { FifthSession } from "./session-5e.js";
import { DEFAULT_SETTINGS, type GameSettings } from "./settings-5e.js";
import {
  actionText,
  renderCard,
  renderEnding,
  renderView,
} from "./text-view-5e.js";
import { FifthTraceRun, type FifthTrace } from "./trace-5e.js";

export const BLIND_PLAYER_PROMPT_VERSION = "blind-player-v1";
export const BLIND_PLAY_DEFAULT_MAX_ACTIONS = 150;
/** How many of the latest steps the player is shown again, word for word. */
const RECENT_STEPS = 6;
const MAX_NOTES = 1_200;
const MAX_FIELD = 600;

export const BLIND_PLAYER_PROMPT = [
  "You are playing a text adventure game for the first time. You know nothing about it beyond what the game shows you, and you play one character, alone.",
  "Each turn you are shown the job you were given, your own notes, what happened in your last few steps, and the room as it stands with a numbered list of actions. Choose one action by its number. An action marked with a dash and a reason is not available.",
  "Play as a curious, sensible person would: try to understand the place and the people in it, look after your character, and decide for yourself what is worth doing. You may leave when you judge it right to.",
  "With each choice, keep an honest journal. Say what you now think is going on here, and what you want next and why. If anything confused you, contradicted something you were told, promised something that was not there, or seemed to have no purpose, say exactly what; if nothing did, leave that empty. Say whether this last step told you anything new.",
  "Your notes are your only memory beyond the last few steps. Rewrite them each turn to hold what you have learned, what you carry that matters, and what you mean to do.",
].join("\n\n");

const DEBRIEF_PROMPT = [
  "You have just finished playing a text adventure game for the first time. Answer from what you saw and noted while playing, and nothing else.",
].join("\n\n");

/** One step of a blind run: the choice made, the journal, and what followed. */
export type BlindStep = Readonly<{
  number: number;
  /** The room the choice was made in. */
  room: string;
  fighting: boolean;
  /** The action as the action bar worded it. */
  action: string;
  thinks: string;
  wants: string;
  /** What confused the player at this step; empty when nothing did. */
  puzzled: string;
  /** Whether the step before this one told the player anything new. */
  learned: boolean;
  /** What the game said the action did. */
  result: string;
}>;

export type BlindDebrief = Readonly<{
  /** What the player believes was really going on. */
  goingOn: string;
  /** Why it ended as it did, and what else it thinks it could have done. */
  ending: string;
  /** The most confusing moment, or empty. */
  confusing: string;
}>;

export type BlindPlayReport = Readonly<{
  promptVersion: string;
  module: Readonly<{ id: string; title: string; rooms: number }>;
  character: Readonly<{ name: string; class: string; level: number }>;
  seed: number;
  model?: Readonly<{ provider: string; model: string }>;
  /** Why the run stopped. */
  stopped: "ended" | "action-limit" | "no-action" | "model-error";
  /** The model's error, when that is what stopped the run. */
  error?: string;
  ending?: Readonly<{ id: string; title: string; kind: string }>;
  steps: readonly BlindStep[];
  /** The rooms entered, in the order first entered. */
  roomsVisited: readonly string[];
  /** The player's notes as they stood at the end. */
  notes: string;
  debrief?: BlindDebrief;
  usage: Readonly<{ calls: number; inputTokens: number; outputTokens: number }>;
  /** The run as a trace, which the command-line adapter can replay. */
  trace: FifthTrace;
}>;

export type BlindPlayOptions = Readonly<{
  adventure: FifthAdventure;
  character: CharacterSheet;
  seed: number;
  model: StructuredModel;
  maxActions?: number;
  settings?: GameSettings;
}>;

/**
 * What the page shows of the room as it stands: its description, the ways
 * on, each feature with what examining it revealed, who is here and what
 * lies here; then the status line and the action bar.
 */
function screen(session: FifthSession): string {
  const room = session.runtime.projectRoom(session.state);
  const listed = (
    title: string,
    entries: readonly Readonly<{ name: string; text: string }>[],
  ) =>
    entries.length === 0
      ? []
      : [title, ...entries.map(({ name, text }) => `  ${name}: ${text}`)];
  return [
    `The room: ${room.description}`,
    ...listed(
      "Ways on:",
      room.exits.map(({ name, description }) => ({ name, text: description })),
    ),
    ...listed(
      "Features:",
      room.features.map(({ name, description, discovery }) => ({
        name,
        text:
          discovery === undefined
            ? description
            : `${description} Examined: ${discovery}`,
      })),
    ),
    ...listed(
      "Here with you:",
      room.creatures.map(({ name, description }) => ({
        name,
        text: description,
      })),
    ),
    ...listed(
      "Lying here:",
      room.items.map(({ name, description }) => ({ name, text: description })),
    ),
    renderView(session),
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const clipped = (value: unknown, limit: number): string =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

function decisionRequest(
  input: string,
  choices: readonly number[],
): StructuredRequest {
  return {
    instructions: BLIND_PLAYER_PROMPT,
    input,
    name: "play",
    description:
      "Take one of the numbered actions that is available, and write your journal for this turn.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["thinks", "wants", "puzzled", "learned", "notes", "choice"],
      properties: {
        thinks: {
          type: "string",
          description: "What you now think is going on in this place.",
        },
        wants: {
          type: "string",
          description: "What you want to do next, and why.",
        },
        puzzled: {
          type: "string",
          description:
            "Exactly what confused you, contradicted what you were told, promised something that was not there, or seemed pointless. Empty if nothing.",
        },
        learned: {
          type: "boolean",
          description: "Whether your last step told you anything new.",
        },
        notes: {
          type: "string",
          description:
            "Your notes, rewritten: what you have learned, what you carry that matters, what you mean to do. At most 150 words.",
        },
        choice: {
          type: "integer",
          enum: choices,
          description: "The number of the action you take.",
        },
      },
    },
  };
}

function debriefRequest(input: string): StructuredRequest {
  return {
    instructions: DEBRIEF_PROMPT,
    input,
    name: "debrief",
    description: "Say what you made of the adventure you have just played.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["goingOn", "ending", "confusing"],
      properties: {
        goingOn: {
          type: "string",
          description:
            "In your own words, what was really going on in this place, and who or what were the people and creatures you met?",
        },
        ending: {
          type: "string",
          description:
            "Why did it end the way it did? Was there something else you think you could have done?",
        },
        confusing: {
          type: "string",
          description:
            "What was the most confusing or unsatisfying moment? Empty if none.",
        },
      },
    },
  };
}

/**
 * Plays `adventure` once with `model` as the player, to an ending or to
 * `maxActions` steps, and returns the journal. It throws nothing for a model
 * that fails part-way: the report says where it stopped and why.
 */
export async function runBlindPlay(
  options: BlindPlayOptions,
): Promise<BlindPlayReport> {
  const { adventure, character, seed, model } = options;
  const maxActions = options.maxActions ?? BLIND_PLAY_DEFAULT_MAX_ACTIONS;
  if (!Number.isInteger(maxActions) || maxActions < 1) {
    throw new Error("maxActions must be a whole number of at least 1.");
  }
  const run = new FifthTraceRun(
    FifthSession.begin(
      seed,
      adventure,
      character,
      options.settings ?? DEFAULT_SETTINGS,
    ),
  );
  const { session } = run;
  const { runtime } = session;
  const opening = [
    `The adventure: ${adventure.title}.`,
    `Your job, as you were told it: ${adventure.objective}`,
    ...session.history[0]!.cards.map((card) => renderCard(card, false)),
  ].join("\n");
  const roomName = () => runtime.projectRoom(session.state).name;
  const steps: BlindStep[] = [];
  const recent: string[] = [];
  const roomsVisited = [roomName()];
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  let notes = "";
  let stopped: BlindPlayReport["stopped"] = "ended";
  let error: string | undefined;

  const ask = async (request: StructuredRequest) => {
    const answer = await model.ask(request);
    usage.calls += 1;
    usage.inputTokens += answer.usage?.inputTokens ?? 0;
    usage.outputTokens += answer.usage?.outputTokens ?? 0;
    return answer.value;
  };
  const shown = (last: string) =>
    [
      opening,
      `Your notes so far:\n${notes === "" ? "(none yet)" : notes}`,
      ...(recent.length === 0
        ? []
        : [`Your last steps:\n${recent.join("\n\n")}`]),
      last,
    ].join("\n\n");

  while (session.state.status === "playing") {
    if (steps.length >= maxActions) {
      stopped = "action-limit";
      break;
    }
    const views = runtime.projectActions(session.state);
    const choices = views.flatMap(({ available }, index) =>
      available ? [index + 1] : [],
    );
    if (choices.length === 0) {
      stopped = "no-action";
      break;
    }
    let answer: unknown;
    try {
      answer = await ask(decisionRequest(shown(screen(session)), choices));
    } catch (failure) {
      stopped = "model-error";
      error = (failure as Error).message;
      break;
    }
    const choice = isRecord(answer) ? answer.choice : undefined;
    if (typeof choice !== "number" || !choices.includes(choice)) {
      stopped = "model-error";
      error = `The player chose ${JSON.stringify(choice)}, which is not an available action.`;
      break;
    }
    const decided = answer as Record<string, unknown>;
    const view = views[choice - 1]!;
    const room = roomName();
    const fighting =
      runtime.projectFight(session.state).encounter !== undefined;
    const action = actionText(view);
    const { card } = run.click(runtime.actionOf(view)!);
    const result = renderCard(card, false);
    notes = clipped(decided.notes, MAX_NOTES);
    steps.push({
      number: steps.length + 1,
      room,
      fighting,
      action,
      thinks: clipped(decided.thinks, MAX_FIELD),
      wants: clipped(decided.wants, MAX_FIELD),
      puzzled: clipped(decided.puzzled, MAX_FIELD),
      learned: decided.learned === true,
      result,
    });
    recent.push(`You chose: ${action}\n${result}`);
    if (recent.length > RECENT_STEPS) {
      recent.shift();
    }
    if (
      session.state.status === "playing" &&
      !roomsVisited.includes(roomName())
    ) {
      roomsVisited.push(roomName());
    }
  }

  const ended = session.state.status !== "playing";
  const ending = adventure.endings.find(
    ({ id }) => id === session.state.endingId,
  );
  let debrief: BlindDebrief | undefined;
  if (stopped !== "model-error" && steps.length > 0) {
    try {
      const answer = await ask(
        debriefRequest(
          shown(
            ended
              ? renderEnding(session)
              : `You were stopped after ${steps.length} steps, before the adventure ended.`,
          ),
        ),
      );
      if (isRecord(answer)) {
        debrief = {
          goingOn: clipped(answer.goingOn, MAX_NOTES),
          ending: clipped(answer.ending, MAX_NOTES),
          confusing: clipped(answer.confusing, MAX_NOTES),
        };
      }
    } catch (failure) {
      error = (failure as Error).message;
    }
  }
  return {
    promptVersion: BLIND_PLAYER_PROMPT_VERSION,
    module: {
      id: adventure.id,
      title: adventure.title,
      rooms: adventure.rooms.length,
    },
    character: {
      name: character.name,
      class: character.class,
      level: character.level,
    },
    seed,
    ...(model.identity === undefined ? {} : { model: model.identity }),
    stopped,
    ...(error === undefined ? {} : { error }),
    ...(ended && ending !== undefined
      ? { ending: { id: ending.id, title: ending.title, kind: ending.kind } }
      : {}),
    steps,
    roomsVisited,
    notes,
    ...(debrief === undefined ? {} : { debrief }),
    usage,
    trace: run.trace,
  };
}

const STOPPED: Readonly<Record<BlindPlayReport["stopped"], string>> = {
  ended: "The adventure ended.",
  "action-limit": "Stopped at the action limit, before any ending.",
  "no-action": "Stopped: the game offered no available action.",
  "model-error": "Stopped: the player model failed.",
};

const quoted = (text: string) =>
  text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

/**
 * The report as Markdown for the owner to read: how it ended, what the
 * player made of it, every moment it was puzzled, the rooms where steps
 * taught it nothing, and then the whole journal.
 */
export function renderBlindPlayReport(report: BlindPlayReport): string {
  const { steps } = report;
  const puzzled = steps.filter(({ puzzled: text }) => text !== "");
  // Outside a fight, the steps in each room that told the player nothing.
  const exploring = steps.filter(({ fighting }) => !fighting);
  const quiet = [...new Set(exploring.map(({ room }) => room))]
    .map((room) => {
      const here = exploring.filter((step) => step.room === room);
      // `learned` speaks of the step before: a step's own verdict is the
      // next step's.
      const dull = here.filter(
        ({ number }) => steps[number]?.learned === false,
      );
      return { room, steps: here.length, dull: dull.length };
    })
    .filter(({ dull }) => dull > 0);
  return [
    `# Blind play: ${report.module.title}`,
    "",
    `- **Player:** ${report.model === undefined ? "a scripted player" : `${report.model.model} (${report.model.provider})`}, prompt ${report.promptVersion}`,
    `- **Character:** ${report.character.name}, a level-${report.character.level} ${report.character.class}, seed ${report.seed}`,
    `- **How it stopped:** ${STOPPED[report.stopped]}${report.error === undefined ? "" : ` ${report.error}`}`,
    `- **Ending:** ${report.ending === undefined ? "none" : `${report.ending.title} (${report.ending.kind})`}`,
    `- **Steps:** ${steps.length}, in ${report.roomsVisited.length} of ${report.module.rooms} rooms`,
    `- **Model use:** ${report.usage.calls} calls, ${report.usage.inputTokens} tokens in, ${report.usage.outputTokens} out`,
    "",
    "## What the player made of it",
    "",
    ...(report.debrief === undefined
      ? ["No debrief was given."]
      : [
          "**What was going on:**",
          "",
          quoted(report.debrief.goingOn),
          "",
          "**Why it ended as it did, and what else it could have done:**",
          "",
          quoted(report.debrief.ending),
          "",
          "**The most confusing moment:**",
          "",
          quoted(
            report.debrief.confusing === ""
              ? "(nothing)"
              : report.debrief.confusing,
          ),
        ]),
    "",
    "## Where the player was puzzled",
    "",
    ...(puzzled.length === 0
      ? ["Nowhere."]
      : puzzled.map(
          ({ number, room, action, puzzled: text }) =>
            `- **Step ${number}, ${room}** (before choosing "${action}"): ${text}`,
        )),
    "",
    "## Steps that told the player nothing new",
    "",
    ...(quiet.length === 0
      ? ["None, outside fights."]
      : quiet.map(
          ({ room, steps: count, dull }) =>
            `- **${room}:** ${dull} of ${count} steps`,
        )),
    "",
    "## The player's notes at the end",
    "",
    quoted(report.notes === "" ? "(none)" : report.notes),
    "",
    "## The journal",
    "",
    ...steps.flatMap((step) => [
      `### ${step.number}. ${step.room}: ${step.action}`,
      "",
      `- **Thinks:** ${step.thinks}`,
      `- **Wants:** ${step.wants}`,
      ...(step.puzzled === "" ? [] : [`- **Puzzled:** ${step.puzzled}`]),
      "",
      "```text",
      step.result,
      "```",
      "",
    ]),
  ].join("\n");
}
