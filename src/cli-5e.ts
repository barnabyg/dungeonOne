/**
 * The 5e command-line adapter: a testing and regression route, not the
 * player's game (players use the browser).
 *
 * It plays a built-in 5e adventure module (The Abandoned Delve by default)
 * with a fixed level-1 Fighter from a seed. Each turn it lists the action
 * bar the browser shows, from the runtime's `projectActions`: every action,
 * numbered, with a disabled one's engine reason. Typing a number takes that
 * action; any other text goes to the AI DM, when there is one:
 *
 * - offline command mode (the default): no AI DM, so typed messages are
 *   refused with a notice;
 * - scripted DM: DUNGEON_ONE_TEST_DM_SCRIPT names a JSON array of model
 *   responses, for offline regression runs;
 * - live AI: `--ai` with OPENAI_API_KEY, within `--max-calls` provider calls.
 *
 * `--trace` records the run (see trace-5e.ts) after every turn, and
 * `--replay` replays a recorded trace and checks it reproduces exactly.
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import {
  loadBuiltInFifthAdventures,
  type FifthAdventure,
} from "./adventure-5e.js";
import { createDmCallBudget, type DmModel } from "./dm-turn.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "./openai-dm-model.js";
import {
  DAMAGE_ADJUSTMENT_TEXT,
  type ActionView,
  type RollGroup,
} from "./runtime-5e.js";
import { loadScriptedDmModel } from "./scripted-dm-model.js";
import { FifthSession, type HistoryCard } from "./session-5e.js";
import { TEST_FIGHTER } from "./test-fighter-5e.js";
import {
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "./trace-5e.js";

const DEFAULT_ADVENTURE = "abandoned-delve";
const DEFAULT_MAX_CALLS = 30;

const USAGE = [
  "Usage: dungeon-one-5e [--adventure <id>] [--seed <0-4294967295>] [--trace <path>]",
  "       dungeon-one-5e --ai [--model <model-id>] [--max-calls <count>] [--adventure <id>] [--seed <0-4294967295>] [--trace <path>]",
  "       dungeon-one-5e --replay <trace.json>",
  "       dungeon-one-5e --help",
  `Default adventure: ${DEFAULT_ADVENTURE}. The character is Ada, a fixed level-1 Fighter.`,
  `Live AI needs --ai and OPENAI_API_KEY; it makes at most --max-calls provider calls (default ${DEFAULT_MAX_CALLS}). Default AI model: ${OPENAI_DM_DEFAULT_MODEL}.`,
  "For a scripted AI DM, set DUNGEON_ONE_TEST_DM_SCRIPT to a JSON array of model responses.",
].join("\n");

const COMMANDS =
  "Type an action's number to take it, or type to the Dungeon Master. Commands: look, help, quit.";
const DM_OFF_NOTICE =
  "Typing to the Dungeon Master is off. Choose an action by its number.";

/** The browser's button labels, so both offer the same choices. */
const LABELS: Readonly<Record<ActionView["action"], string>> = {
  attack: "Attack ",
  "light-attack": "Extra attack ",
  use: "Drink ",
  move: "Go to ",
  examine: "Examine ",
  take: "Take ",
  force: "Force ",
  pick: "Pick ",
  break: "Break ",
  unlock: "Unlock ",
  search: "Search ",
  disarm: "Disarm ",
  talk: "Talk to ",
  equip: "Equip ",
  unequip: "Unequip ",
  swap: "Wield ",
  drop: "Drop ",
  buy: "Buy ",
  sell: "Sell ",
  "sell-equipped": "Sell equipped ",
  "second-wind": "Second Wind",
  "action-surge": "Action Surge",
  "end-turn": "End turn",
  leave: "Leave the adventure",
};

type Options = Readonly<
  | { mode: "help" }
  | { mode: "replay"; path: string }
  | {
      mode: "play";
      adventureId: string;
      seed: number;
      tracePath?: string;
      ai?: Readonly<{ model: string; maxCalls: number }>;
    }
>;

function parseOptions(args: readonly string[]): Options {
  if (args.length === 1 && args[0] === "--help") {
    return { mode: "help" };
  }
  const values = new Map<string, string>();
  let ai = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--ai" && !ai) {
      ai = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const name = equals < 0 ? argument : argument.slice(0, equals);
    const value = equals < 0 ? args[++index] : argument.slice(equals + 1);
    if (
      ![
        "--replay",
        "--adventure",
        "--seed",
        "--trace",
        "--model",
        "--max-calls",
      ].includes(name) ||
      values.has(name) ||
      value === undefined ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      throw new Error(USAGE);
    }
    values.set(name, value);
  }
  const replay = values.get("--replay");
  if (replay !== undefined) {
    if (values.size !== 1 || ai) {
      throw new Error(
        `--replay cannot be combined with other options.\n${USAGE}`,
      );
    }
    return { mode: "replay", path: replay };
  }
  if (!ai && (values.has("--model") || values.has("--max-calls"))) {
    throw new Error(`--model and --max-calls require --ai.\n${USAGE}`);
  }
  const integer = (text: string | undefined, max: number) =>
    text !== undefined && /^\d+$/u.test(text) && Number(text) <= max
      ? Number(text)
      : undefined;
  const seedText = values.get("--seed");
  const seed =
    seedText === undefined
      ? randomBytes(4).readUInt32LE(0)
      : integer(seedText, 0xffffffff);
  if (seed === undefined) {
    throw new Error(`Seed must be an integer from 0 to 4294967295.\n${USAGE}`);
  }
  const maxCalls = integer(
    values.get("--max-calls") ?? String(DEFAULT_MAX_CALLS),
    1000,
  );
  if (maxCalls === undefined || maxCalls === 0) {
    throw new Error(`--max-calls must be from 1 to 1000.\n${USAGE}`);
  }
  const tracePath = values.get("--trace");
  return {
    mode: "play",
    adventureId: values.get("--adventure") ?? DEFAULT_ADVENTURE,
    seed,
    ...(tracePath === undefined ? {} : { tracePath }),
    ...(ai
      ? {
          ai: {
            model: values.get("--model") ?? OPENAI_DM_DEFAULT_MODEL,
            maxCalls,
          },
        }
      : {}),
  };
}

/** One roll group in a line, such as "Ada's attack: d20 14 + 5 = 19 vs AC 13, hit". */
function describeRoll(group: RollGroup): string {
  const dice = group.dice
    .map(
      ({ sides, value, dropped }) =>
        `d${sides} ${value}${dropped === true ? " (dropped)" : ""}`,
    )
    .join(", ");
  const modifier =
    group.modifier === 0
      ? ""
      : ` ${group.modifier < 0 ? "-" : "+"} ${Math.abs(group.modifier)}`;
  return [
    `${group.roller}'s ${group.label ?? group.purpose}`,
    group.target === undefined ? "" : ` on ${group.target}`,
    `: ${dice}${modifier} = ${group.total}`,
    group.armorClass === undefined ? "" : ` vs AC ${group.armorClass}`,
    group.dc === undefined ? "" : ` vs DC ${group.dc}`,
    group.mode === undefined ? "" : ` (${group.mode})`,
    group.outcome === undefined ? "" : `, ${group.outcome}`,
    group.halved === true ? ", halved" : "",
    group.adjustment === undefined
      ? ""
      : `, ${DAMAGE_ADJUSTMENT_TEXT[group.adjustment]}`,
    group.hpAfter === undefined
      ? ""
      : `, HP ${group.hpAfter}/${String(group.maxHp)}`,
  ].join("");
}

/** A card as text: its heading, each line, and each line's rolls beneath it. */
function renderCard(card: HistoryCard): string {
  const heading = {
    narration: "Scene",
    result: "Result",
    rejection: "Action rejected",
  }[card.kind];
  return [
    `[${heading}]`,
    ...card.lines.flatMap(({ text, rolls }) => [
      `  ${text}`,
      ...rolls.map((group) => `    ${describeRoll(group)}`),
    ]),
  ].join("\n");
}

function renderView(session: FifthSession): string {
  const { runtime, state } = session;
  const room = runtime.projectRoom(state);
  const fight = runtime.projectFight(state).encounter;
  const actions = runtime.projectActions(state);
  return [
    `== ${room.name} == ${session.character.name} HP ${room.character.hp}/${room.character.maxHp} (${room.character.health})`,
    ...(fight === undefined
      ? []
      : [
          `Fight, round ${fight.round}: ${fight.combatants
            .map(
              ({ name, hp, maxHp, armorClass, defeated }) =>
                `${name} ${defeated ? "down" : `HP ${hp}/${maxHp}`} AC ${armorClass}`,
            )
            .join("; ")}`,
        ]),
    ...(room.inventory.length === 0
      ? []
      : [`Carrying: ${room.inventory.map(({ name }) => name).join(", ")}`]),
    ...(room.purse === undefined ? [] : [`Purse: ${room.purse}`]),
    "Actions:",
    ...actions.map(
      ({ action, target, available, reason }, index) =>
        `  ${index + 1}. ${LABELS[action]}${target === undefined || action === "leave" ? "" : target.name}${available ? "" : ` — ${String(reason)}`}`,
    ),
  ].join("\n");
}

function renderEnding(session: FifthSession): string {
  const ending = session.adventure.endings.find(
    ({ id }) => id === session.state.endingId,
  );
  return [
    `The adventure is over: ${session.state.status}.`,
    ...(ending === undefined
      ? []
      : [`${ending.title} (${ending.kind}). ${ending.text}`]),
  ].join("\n");
}

/** Input lines, queued so EOF is never missed while a turn is awaited. */
function inputLines() {
  const terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal,
    prompt: "> ",
  });
  const pending: string[] = [];
  let closed = false;
  let wake: (() => void) | undefined;
  lines.on("line", (line) => {
    pending.push(line);
    wake?.();
  });
  lines.on("close", () => {
    closed = true;
    wake?.();
  });
  return {
    prompt: () => {
      if (terminal) {
        lines.prompt();
      }
    },
    close: () => lines.close(),
    async next(): Promise<string | undefined> {
      while (pending.length === 0 && !closed) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
      return pending.shift();
    },
  };
}

async function play(
  options: Extract<Options, { mode: "play" }>,
  adventures: readonly FifthAdventure[],
): Promise<void> {
  const adventure = adventures.find(({ id }) => id === options.adventureId);
  if (adventure === undefined) {
    throw new Error(
      `There is no adventure ${options.adventureId}. Adventures: ${adventures.map(({ id }) => id).join(", ")}.`,
    );
  }
  let dm:
    | Readonly<{
        model: DmModel;
        budget: ReturnType<typeof createDmCallBudget>;
      }>
    | undefined;
  const scriptPath = process.env.DUNGEON_ONE_TEST_DM_SCRIPT;
  if (scriptPath !== undefined && scriptPath.length > 0) {
    if (options.ai !== undefined) {
      throw new UsageError(
        "--ai plays the live AI DM; unset DUNGEON_ONE_TEST_DM_SCRIPT to use it.",
      );
    }
    const budget = createDmCallBudget(Infinity);
    dm = { budget, model: budget.limit(await loadScriptedDmModel(scriptPath)) };
  } else if (options.ai !== undefined) {
    const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
    if (apiKey.length === 0) {
      throw new UsageError("OPENAI_API_KEY is required for --ai.");
    }
    const budget = createDmCallBudget(options.ai.maxCalls);
    dm = {
      budget,
      model: budget.limit(
        createOpenAiDmModel({ apiKey, model: options.ai.model }),
      ),
    };
  }

  const write = (text: string) => process.stdout.write(`${text}\n`);
  const run = new FifthTraceRun(
    FifthSession.begin(options.seed, adventure, TEST_FIGHTER),
  );
  const { session } = run;
  const saveTrace = async () => {
    if (options.tracePath !== undefined) {
      await writeFifthTrace(options.tracePath, run.trace);
    }
  };
  write(`${adventure.title}. Seed ${options.seed}.`);
  if (
    options.ai !== undefined &&
    dm !== undefined &&
    scriptPath === undefined
  ) {
    write(
      `AI DM: ${options.ai.model}, at most ${options.ai.maxCalls} provider calls.`,
    );
  }
  write(COMMANDS);
  const opening = session.history[0]!;
  write(opening.reply);
  opening.cards.forEach((card) => write(renderCard(card)));
  await saveTrace();

  const lines = inputLines();
  try {
    while (session.state.status === "playing") {
      write(renderView(session));
      lines.prompt();
      const line = await lines.next();
      if (line === undefined) {
        break;
      }
      const input = line.trim();
      const command = input.toLowerCase();
      if (command === "quit") {
        break;
      }
      if (command === "help") {
        write(COMMANDS);
        continue;
      }
      if (command === "look" || command.length === 0) {
        continue;
      }
      if (/^\d+$/u.test(input)) {
        const view = session.runtime.projectActions(session.state)[
          Number(input) - 1
        ];
        if (view === undefined) {
          write(`There is no action ${input}.`);
        } else if (!view.available) {
          write(`That action is not available: ${String(view.reason)}.`);
        } else {
          const { card } = run.click(session.runtime.actionOf(view)!);
          write(renderCard(card));
          await saveTrace();
        }
        continue;
      }
      if (dm === undefined || dm.budget.spent()) {
        write(
          dm === undefined
            ? DM_OFF_NOTICE
            : `The AI call budget is spent. ${DM_OFF_NOTICE}`,
        );
        continue;
      }
      const { entry } = await run.message(input, dm.model);
      entry.cards.forEach((card) => write(renderCard(card)));
      write(`DM: ${entry.reply}`);
      await saveTrace();
    }
  } finally {
    lines.close();
  }
  if (session.state.status !== "playing") {
    write(renderEnding(session));
  }
  if (options.tracePath !== undefined) {
    write(`Trace written: ${options.tracePath}`);
  }
}

class UsageError extends Error {}

async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.mode === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  try {
    const adventures = await loadBuiltInFifthAdventures();
    if (options.mode === "replay") {
      const { turns, state } = await verifyFifthTraceFile(
        options.path,
        adventures,
      );
      process.stdout.write(
        `Trace verified: ${options.path} (${turns} turns, ${state.status}).\n`,
      );
      return;
    }
    await play(options, adventures);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

await main();
