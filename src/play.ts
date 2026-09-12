import { runDmTurn, type DmModel, type DmTranscriptEntry } from "./dm-turn.js";
import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import { RANDOM_ALGORITHM, createSeededRandom } from "./random.js";
import { createSession, handleAction, type ActionResult } from "./session.js";
import {
  completeSessionTrace,
  createDmSessionTrace,
  createSessionTrace,
  recordDmTraceTurn,
  recordLocalTraceTurn,
  recordTraceAction,
  writeSessionTrace,
  type RollRecord,
} from "./trace.js";

export type PlayOptions = Readonly<{
  seed: number;
  tracePath?: string;
  dmModel?: DmModel;
}>;

export type PlayIo = Readonly<{
  terminal: boolean;
  lines: AsyncIterable<string> &
    Readonly<{
      prompt(): void;
      close(): void;
    }>;
  write(text: string): void;
}>;

export async function playGame(
  options: PlayOptions,
  io: PlayIo,
): Promise<void> {
  const dmIdentity = options.dmModel?.identity;
  if (
    options.dmModel !== undefined &&
    options.tracePath !== undefined &&
    dmIdentity === undefined
  ) {
    throw new Error("DM model identity is required for trace export.");
  }
  const random = createSeededRandom(options.seed);
  let state = createSession();
  const commandTrace =
    options.tracePath === undefined || options.dmModel !== undefined
      ? undefined
      : createSessionTrace(options.seed, state);
  const dmTrace =
    options.tracePath === undefined || dmIdentity === undefined
      ? undefined
      : createDmSessionTrace(options.seed, state, dmIdentity);
  let terminationReason: "quit" | "eof" = "eof";
  let transcript: readonly DmTranscriptEntry[] = [];

  io.write(`Seed: ${options.seed} (${RANDOM_ALGORITHM})\n`);
  io.write(`${renderIntroduction()}\n`);
  const initialStatus = handleAction(state, { type: "status" }, random);
  state = initialStatus.state;
  io.write(`${renderResult(initialStatus)}\n`);
  const initialLook = handleAction(state, { type: "look" }, random);
  state = initialLook.state;
  io.write(`${renderResult(initialLook)}\n`);

  if (options.dmModel !== undefined) {
    io.write(
      "Scripted DM mode: describe one action or ask about the scene or your character's status.\n",
    );
  }

  if (io.terminal) {
    io.lines.prompt();
  }

  for await (const line of io.lines) {
    let requestedQuit = false;
    if (options.dmModel !== undefined) {
      const localCommand = line.trim().toLowerCase();
      if (localCommand === "help") {
        io.write(
          [
            "Scripted DM mode accepts ordinary language for one gameplay attempt or questions about the current scene and character status.",
            "After victory or defeat, gameplay mutations are frozen but reflection and reads remain available.",
            "Local commands:",
            "  help  Show this guidance without calling the model.",
            "  quit  Leave the game without calling the model.",
          ].join("\n") + "\n",
        );
        if (dmTrace !== undefined) {
          recordLocalTraceTurn(dmTrace, "local-help", line, state);
        }
      } else if (localCommand === "quit") {
        const quit = handleAction(state, { type: "quit" }, random);
        state = quit.state;
        io.write(`${renderResult(quit)}\n`);
        if (dmTrace !== undefined) {
          recordLocalTraceTurn(dmTrace, "local-quit", line, state);
        }
        requestedQuit = true;
      } else {
        const result = await runDmTurn({
          state,
          playerInput: line,
          transcript,
          random,
          model: options.dmModel,
        });
        state = result.state;
        transcript = result.transcript;
        if (dmTrace !== undefined) {
          recordDmTraceTurn(dmTrace, line, result);
        }
        io.write(
          [
            "Mechanics:",
            result.mechanics.length === 0
              ? "No action or read tool was used."
              : result.mechanics.join("\n"),
            "",
            "Dungeon Master:",
            result.narration,
          ].join("\n") + "\n",
        );
      }
    } else {
      const action = parseCommand(line);
      let result: ActionResult;
      if (commandTrace === undefined) {
        result = handleAction(state, action, random);
      } else {
        const rolls: RollRecord[] = [];
        const recordingRandom = {
          roll(sides: number): number {
            const value = random.roll(sides);
            rolls.push({ sides, value });
            return value;
          },
        };
        result = handleAction(state, action, recordingRandom);
        recordTraceAction(commandTrace, line, action, rolls, result);
      }
      state = result.state;
      io.write(`${renderResult(result)}\n`);
      requestedQuit =
        result.events?.some((event) => event.type === "session-quit") === true;
    }

    if (state.status === "quit" || requestedQuit) {
      terminationReason = "quit";
      io.lines.close();
      break;
    }

    if (io.terminal) {
      io.lines.prompt();
    }
  }

  const trace = commandTrace ?? dmTrace;
  if (options.tracePath !== undefined && trace !== undefined) {
    completeSessionTrace(trace, terminationReason, state);
    await writeSessionTrace(options.tracePath, trace);
    io.write(`Trace exported to ${options.tracePath}\n`);
  }
}
