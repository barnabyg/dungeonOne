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
  const random = createSeededRandom(options.seed);
  let state = createSession();
  const trace =
    options.tracePath === undefined
      ? undefined
      : createSessionTrace(options.seed, state);
  let terminationReason: "quit" | "eof" = "eof";

  io.write(`Seed: ${options.seed} (${RANDOM_ALGORITHM})\n`);
  io.write(`${renderIntroduction()}\n`);
  const initialStatus = handleAction(state, { type: "status" }, random);
  state = initialStatus.state;
  io.write(`${renderResult(initialStatus)}\n`);
  const initialLook = handleAction(state, { type: "look" }, random);
  state = initialLook.state;
  io.write(`${renderResult(initialLook)}\n`);

  if (io.terminal) {
    io.lines.prompt();
  }

  for await (const line of io.lines) {
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

    if (
      state.status === "quit" ||
      result.events?.some((event) => event.type === "session-quit") === true
    ) {
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
