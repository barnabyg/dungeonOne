import { runDmTurn, type DmModel, type DmTranscriptEntry } from "./dm-turn.js";
import { parseCommand } from "./parser.js";
import { renderIntroduction, renderResult } from "./presenter.js";
import { RANDOM_ALGORITHM, createSeededRandom } from "./random.js";
import { createSession, handleAction, type ActionResult } from "./session.js";
import {
  completeSessionTrace,
  createSessionTrace,
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
  if (options.dmModel !== undefined && options.tracePath !== undefined) {
    throw new Error("Trace export is not available in scripted DM test mode.");
  }
  const random = createSeededRandom(options.seed);
  let state = createSession();
  const trace =
    options.tracePath === undefined
      ? undefined
      : createSessionTrace(options.seed, state);
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
      "Read-only DM mode: ask about the scene or your character's status.\n",
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
            "Read-only DM mode accepts ordinary questions about the current scene and character status.",
            "Local commands:",
            "  help  Show this guidance without calling the model.",
            "  quit  Leave the game without calling the model.",
          ].join("\n") + "\n",
        );
      } else if (localCommand === "quit") {
        const quit = handleAction(state, { type: "quit" }, random);
        state = quit.state;
        io.write(`${renderResult(quit)}\n`);
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
      if (trace === undefined) {
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
        recordTraceAction(trace, line, action, rolls, result);
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

  if (options.tracePath !== undefined && trace !== undefined) {
    completeSessionTrace(trace, terminationReason, state);
    await writeSessionTrace(options.tracePath, trace);
    io.write(`Trace exported to ${options.tracePath}\n`);
  }
}
