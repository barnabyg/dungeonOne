import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import {
  browserActions,
  matchesBrowserAction,
  type BrowserAction,
} from "./browser-actions.js";
import { DM_TURN_LIMITS, runDmTurn, type DmModel } from "./dm-turn.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "./openai-dm-model.js";
import { loadAdventureFile } from "./adventure-file.js";
import { createDataRuntime } from "./data-runtime.js";
import type { CharacterStatus, DmScene } from "./game-tools.js";
import type {
  AdventureRuntime,
  RuntimeToolResult,
} from "./runtime-contract.js";
import type { GameToolCall } from "./game-tools.js";
import {
  browserTranscript,
  type BrowserTurn,
  type ResultCard,
} from "./browser-history.js";
import { SaveSession } from "./save.js";
import { BROWSER_HTML, BROWSER_CSS, BROWSER_SCRIPT } from "./browser-page.js";

export type BrowserOptions = Readonly<{
  savePath: string;
  seed: number;
  apiKey: string;
  dmModel?: DmModel;
}>;

async function readPlayerInput(
  request: IncomingMessage,
): Promise<{ message: string } | { optionId: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > 8192) {
      throw new Error("Request too large.");
    }
    chunks.push(bytes);
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    "optionId" in body &&
    typeof body.optionId === "string" &&
    body.optionId.length <= 64
  ) {
    return { optionId: body.optionId };
  }
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    /[\ud800-\udfff]/u.test(body.message) ||
    body.message.trim().length === 0 ||
    body.message.length > DM_TURN_LIMITS.maxPlayerInputCharacters
  ) {
    throw new Error("Invalid player message.");
  }
  return { message: body.message };
}

export type BrowserView = Readonly<
  | { slot: "empty"; title: string; seed: number }
  | {
      slot: "occupied";
      seed: number;
      scene: DmScene;
      clocks: ReturnType<NonNullable<AdventureRuntime["projectPlayerClocks"]>>;
      hp: Readonly<{ current: number; maximum: number }>;
      character: CharacterStatus;
      deadline: Readonly<{ name: string; day: number }>;
      actions: readonly BrowserAction[];
      title: string;
      history: readonly BrowserTurn[];
    }
>;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function assertSupported(session: SaveSession): void {
  if (
    session.runtime.id !== "hollow-beacon" ||
    session.runtime.version !== "4"
  ) {
    throw new Error(
      "This browser supports Hollow Beacon: Watch Route (content version 4). The occupied slot was left unchanged; select another save path.",
    );
  }
}

function playerView(session: SaveSession, revision: string): BrowserView {
  assertSupported(session);
  const status = session.runtime.projectCharacterStatus(session.state);
  return {
    slot: "occupied",
    seed: session.seed,
    scene: session.runtime.projectDmScene(session.state),
    clocks: session.runtime.projectPlayerClocks?.(session.state) ?? [],
    hp: { current: status.hp, maximum: status.maxHp },
    character: status,
    // Public premise of the supported authored Watch Route, not a hidden
    // clock threshold/effect projection or a parse of terminal narration.
    deadline: { name: "Caravan at the ridge fork", day: 3 },
    actions: browserActions(session, revision),
    title: session.runtime.content!.snapshot.title,
    history: session.browserHistory?.turns ?? [],
  };
}

function resultCard(
  session: SaveSession,
  call: GameToolCall,
  result: RuntimeToolResult,
  mechanics: string,
): ResultCard {
  const events =
    result.engineResult !== undefined && "events" in result.engineResult
      ? result.engineResult.events
      : undefined;
  return {
    title: session.runtime.readToolNames.includes(call.name)
      ? "Authoritative information"
      : events !== undefined
        ? "Resolved action"
        : "Action rejected",
    text:
      call.name === "move" && events !== undefined
        ? [
            `Travelled to ${session.runtime.projectDmScene(result.state).room.name}.`,
            session.runtime.renderResult({
              state: result.state,
              events: events.filter(
                (event) => event.type !== "clue" || event.operation !== "move",
              ),
            }),
          ]
            .filter((text) => text.length > 0)
            .join("\n")
        : mechanics,
  };
}

async function recoverHistory(session: SaveSession): Promise<void> {
  const history = session.browserHistory;
  if (history?.pending === undefined) {
    return;
  }
  const pending = history.pending;
  const committed = session.progress.sequence > pending.sequence;
  const notice = committed
    ? "Your action was saved; do not repeat it."
    : "No action was committed.";
  await session.saveBrowserHistory({
    version: 1,
    progress: session.progress,
    turns: [
      ...history.turns,
      {
        sequence: session.progress.sequence,
        message: pending.message,
        reply:
          "The previous turn was interrupted before its reply was saved. " +
          notice,
        cards: pending.cards,
        committed,
        notice,
      },
    ],
  });
}

export async function startBrowserServer(options: BrowserOptions) {
  if (options.apiKey.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY is required for browser mode. Set it in the launch environment before starting.",
    );
  }
  if (
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff
  ) {
    throw new Error("Seed must be an integer from 0 to 4294967295.");
  }
  const loaded = await loadAdventureFile(
    fileURLToPath(
      new URL("../adventures/hollow-beacon-watch.json", import.meta.url),
    ),
  );
  if (!loaded.ok) {
    throw new Error("The bundled Hollow Beacon adventure is invalid.");
  }
  const runtime = createDataRuntime(loaded.adventure);
  const readSlot = async (): Promise<BrowserView> => {
    try {
      const session = await SaveSession.load(options.savePath);
      return playerView(
        session,
        createHash("sha256")
          .update(
            JSON.stringify({
              progress: session.progress,
              seed: session.seed,
              content: session.runtime.content!.digest,
            }),
          )
          .digest("hex"),
      );
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        throw error;
      }
      return {
        slot: "empty",
        title: loaded.adventure.snapshot.title,
        seed: options.seed,
      };
    }
  };
  let turning = false;
  // Invalid, incompatible or closed occupied slots fail before listening.
  await readSlot();
  try {
    await recoverHistory(await SaveSession.load(options.savePath));
  } catch (error) {
    if (!hasCode(error, "ENOENT")) {
      throw error;
    }
  }
  const model =
    options.dmModel ??
    createOpenAiDmModel({
      apiKey: options.apiKey,
      model: OPENAI_DM_DEFAULT_MODEL,
    });
  const releaseTurn = () => {
    turning = false;
  };

  let url = "";
  const respond = (
    response: ServerResponse,
    status: number,
    type: string,
    body: string,
  ) => {
    response.writeHead(status, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
    });
    response.end(body);
  };
  const json = (response: ServerResponse, status: number, value: unknown) =>
    respond(
      response,
      status,
      "application/json; charset=utf-8",
      JSON.stringify(value),
    );
  const server = createServer((request, response) => {
    void (async () => {
      // Exact Host plus Origin checks also prevent DNS rebinding and cross-site starts.
      if (request.headers.host !== new URL(url).host) {
        json(response, 403, { error: "Unrelated host rejected." });
        return;
      }
      if (request.method === "POST") {
        if (
          request.headers.origin !== url ||
          (request.headers["sec-fetch-site"] !== undefined &&
            request.headers["sec-fetch-site"] !== "same-origin")
        ) {
          json(response, 403, { error: "Unrelated origin rejected." });
          return;
        }
        if (request.url !== "/api/start" && request.url !== "/api/turn") {
          json(response, 404, { error: "Unknown endpoint." });
          return;
        }
        if (turning) {
          json(response, 409, {
            error:
              "A turn is already pending. Wait for its reply; this request was not applied.",
          });
          return;
        }
        if (request.url === "/api/turn") {
          turning = true;
          try {
            let input: { message: string } | { optionId: string };
            try {
              input = await readPlayerInput(request);
            } catch {
              json(response, 400, {
                error:
                  "Enter one message of 1–1000 characters. No action was committed.",
              });
              return;
            }
            const session = await SaveSession.load(options.savePath);
            assertSupported(session);
            await recoverHistory(session);
            const viewBefore = await readSlot();
            const selected =
              "optionId" in input && viewBefore.slot === "occupied"
                ? viewBefore.actions.find(
                    (action) => action.id === input.optionId,
                  )
                : undefined;
            if ("optionId" in input && selected === undefined) {
              json(response, 409, {
                error:
                  "That option is no longer available. Current information refreshed; no action was committed.",
                view: viewBefore,
              });
              return;
            }
            const playerInput =
              "message" in input ? input.message : selected!.message;
            if ((session.browserHistory?.turns.length ?? 0) >= 10000) {
              json(response, 409, {
                error:
                  "The conversation history limit has been reached. Choose a new save path to start another adventure; this slot was left unchanged.",
              });
              return;
            }
            const transcript = browserTranscript(session.browserHistory);
            await session.saveBrowserHistory({
              version: 1,
              progress: session.progress,
              turns: session.browserHistory?.turns ?? [],
              pending: {
                sequence: session.progress.sequence,
                message: playerInput,
                cards: [],
              },
            });
            let committed = false;
            const result = await runDmTurn({
              state: session.state,
              playerInput,
              transcript,
              random: session.random,
              model,
              runtime: session.runtime,
              history: (state, speakerId) =>
                session.dmHistory(state, speakerId),
              executeTool: async (state, call, input) => {
                // AI still interprets the request; a click authorizes only its
                // selected intent, including its exact speaker/topic or ending.
                if (
                  selected !== undefined &&
                  ![
                    "get_scene",
                    "get_character_status",
                    "get_journal",
                  ].includes(call.name) &&
                  !matchesBrowserAction(selected, call)
                ) {
                  return {
                    result: {
                      state,
                      modelOutput: {
                        ok: false,
                        error: { code: "unavailable-reference" },
                      },
                    },
                    rolls: [],
                  };
                }
                const executed = await session.executeTool(
                  state,
                  call,
                  input,
                  (toolResult) => {
                    const history = session.browserHistory!;
                    const events = toolResult.engineResult;
                    const mechanics =
                      events !== undefined && "events" in events
                        ? session.runtime.renderResult({
                            state: toolResult.state,
                            events: events.events,
                          })
                        : "";
                    session.browserHistory = {
                      ...history,
                      pending: {
                        ...history.pending!,
                        cards: [
                          ...history.pending!.cards,
                          resultCard(session, call, toolResult, mechanics),
                        ],
                      },
                    };
                  },
                );
                committed ||=
                  !isDeepStrictEqual(state, executed.result.state) ||
                  executed.rolls.length > 0;
                return executed;
              },
            });
            const lastOutput = result.toolResults.at(-1)?.result.modelOutput;
            const conversation = lastOutput?.ok
              ? lastOutput.conversation
              : undefined;
            const reply =
              conversation?.approvedFacts.length === 0
                ? conversation.authoredReply
                : result.narration;
            const cards = result.toolResults.map(
              ({ call, result: toolResult }, index) =>
                resultCard(session, call, toolResult, result.mechanics[index]!),
            );
            const notice = result.diagnostics.some(
              ({ code }) => code === "model-failure",
            )
              ? `AI service failed. ${committed ? "Your action was saved; do not repeat it." : "No action was committed."}`
              : committed
                ? "Action saved."
                : "No action was committed.";
            const turn: BrowserTurn = {
              sequence: session.progress.sequence,
              message: playerInput,
              reply,
              ...(conversation === undefined
                ? {}
                : { speaker: conversation.speakerName }),
              cards,
              committed,
              notice,
            };
            await session.saveBrowserHistory({
              version: 1,
              progress: session.progress,
              turns: [...session.browserHistory!.turns, turn],
            });
            json(response, 200, { view: await readSlot(), ...turn });
          } catch {
            // Recover only while holding the turn lock. GET never writes the slot.
            await SaveSession.load(options.savePath)
              .then(recoverHistory)
              .catch(() => undefined);
            json(response, 500, {
              error:
                "Unable to complete the turn. Read current state to check saved progress before sending another action; this request will not be retried automatically.",
            });
          } finally {
            releaseTurn();
          }
          return;
        }
        try {
          await SaveSession.start(options.savePath, runtime, options.seed, {
            exclusive: true,
          });
        } catch (error) {
          if (!hasCode(error, "EEXIST")) {
            throw error;
          }
        }
        json(response, 200, await readSlot());
        return;
      }
      if (request.method !== "GET") {
        json(response, 405, { error: "Method not allowed." });
        return;
      }
      switch (request.url) {
        case "/":
          respond(response, 200, "text/html; charset=utf-8", BROWSER_HTML);
          break;
        case "/app.css":
          respond(response, 200, "text/css; charset=utf-8", BROWSER_CSS);
          break;
        case "/app.js":
          respond(
            response,
            200,
            "text/javascript; charset=utf-8",
            BROWSER_SCRIPT,
          );
          break;
        case "/api/state":
          json(response, 200, await readSlot());
          break;
        default:
          json(response, 404, { error: "Unknown endpoint." });
      }
    })().catch(() => {
      // Filesystem errors and validation details can contain paths or internal
      // content. Keep the browser error public and leave the slot unchanged.
      json(response, 500, {
        error:
          "Unable to read or start the save slot. Check the local save file and restart; it has not been replaced.",
      });
    });
  });
  server.requestTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Unable to determine the local browser port.");
  }
  url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
        // Browsers may hold speculative sockets without sending a request;
        // they must not keep Ctrl+C or restart waiting indefinitely.
        server.closeAllConnections();
      });
    },
  };
}
