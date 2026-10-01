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
import {
  cachedHints,
  hintCandidates,
  hintRevision,
  prepareHints,
  type BrowserHints,
  type HintPreparer,
} from "./browser-hints.js";

export type BrowserOptions = Readonly<{
  savePath: string;
  seed: number;
  apiKey: string;
  dmModel?: DmModel;
  hintPreparer?: HintPreparer;
}>;

async function readPlayerInput(
  request: IncomingMessage,
): Promise<
  ({ message: string } | { optionId: string }) & { revision: string }
> {
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
    body === null ||
    typeof body !== "object" ||
    !("revision" in body) ||
    typeof body.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.revision)
  ) {
    throw new Error("Invalid revision.");
  }
  if (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 2 &&
    "optionId" in body &&
    typeof body.optionId === "string" &&
    body.optionId.length <= 64
  ) {
    return { optionId: body.optionId, revision: body.revision };
  }
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    /[\ud800-\udfff]/u.test(body.message) ||
    body.message.trim().length === 0 ||
    body.message.length > DM_TURN_LIMITS.maxPlayerInputCharacters
  ) {
    throw new Error("Invalid player message.");
  }
  return { message: body.message, revision: body.revision };
}

export type BrowserView = Readonly<
  | { slot: "empty"; title: string; seed: number }
  | {
      slot: "occupied";
      revision: string;
      position: number;
      recovery: "saved" | "pending" | "unsaved";
      seed: number;
      scene: DmScene;
      clocks: ReturnType<NonNullable<AdventureRuntime["projectPlayerClocks"]>>;
      hp: Readonly<{ current: number; maximum: number }>;
      character: CharacterStatus;
      deadline: Readonly<{ name: string; day: number }>;
      actions: readonly BrowserAction[];
      title: string;
      history: readonly BrowserTurn[];
      hints:
        | BrowserHints
        | Readonly<{
            revision: string;
            status: "preparing";
            entries: readonly string[];
          }>;
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

function playerView(
  session: SaveSession,
  revision: string,
): Extract<BrowserView, { slot: "occupied" }> {
  assertSupported(session);
  const status = session.runtime.projectCharacterStatus(session.state);
  return {
    slot: "occupied",
    revision,
    position: session.progress.sequence,
    recovery:
      session.browserHistory?.pending === undefined ? "saved" : "pending",
    seed: session.seed,
    scene: session.runtime.projectDmScene(session.state),
    clocks: session.runtime.projectPlayerClocks?.(session.state) ?? [],
    hp: { current: status.hp, maximum: status.maxHp },
    character: status,
    // Public premise of the supported authored Watch Route, not a hidden
    // clock threshold/effect projection or a parse of terminal narration.
    deadline: { name: "Caravan at the ridge fork", day: 3 },
    actions: browserActions(
      session,
      createHash("sha256")
        .update(
          JSON.stringify({
            generation: session.generation,
            progress: session.progress,
          }),
        )
        .digest("hex"),
    ),
    title: session.runtime.content!.snapshot.title,
    history: [
      ...(session.browserHistory?.turns ?? []),
      ...(session.browserHistory?.pending === undefined
        ? []
        : [
            {
              sequence: session.progress.sequence,
              message: session.browserHistory.pending.message,
              reply:
                session.browserHistory.pending.reply ??
                "Waiting for the complete reply…",
              ...(session.browserHistory.pending.speaker === undefined
                ? {}
                : { speaker: session.browserHistory.pending.speaker }),
              cards: session.browserHistory.pending.cards,
              committed:
                session.progress.sequence >
                session.browserHistory.pending.sequence,
              notice: `Turn pending at position ${session.progress.sequence}. Do not repeat it; read current state.`,
            },
          ]),
    ],
    hints: cachedHints(session) ?? {
      revision: hintRevision(session),
      status: "preparing",
      entries: [],
    },
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
          pending.reply ??
          "The previous turn was interrupted before its reply was saved. " +
            notice,
        ...(pending.speaker === undefined ? {} : { speaker: pending.speaker }),
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
  let retained: SaveSession | undefined;
  // Callers own the exclusive turn lock while changing the recovery session.
  const retainSession = (session: SaveSession | undefined) => {
    retained = session;
  };
  let saveFailed = false;
  let turning = false;
  let starting: Promise<BrowserView> | undefined;
  let closed = false;
  let hintJob:
    | { revision: string; result?: BrowserHints; persisted?: boolean }
    | undefined;
  let hintWrite: Promise<void> | undefined;
  const flushHints = () => {
    if (
      closed ||
      turning ||
      retained !== undefined ||
      hintJob?.result === undefined ||
      hintJob.persisted
    ) {
      return;
    }
    const result = hintJob.result;
    turning = true;
    hintWrite = (async () => {
      try {
        const session = await SaveSession.load(options.savePath);
        if (hintRevision(session) === result.revision) {
          await session.saveBrowserHints(result);
        }
        if (hintJob?.revision === result.revision) {
          hintJob.persisted = true;
        }
      } catch {
        // Derived-cache failure never turns a committed action into a retry.
        if (hintJob?.revision === result.revision) {
          hintJob.result = { ...result, status: "unavailable", entries: [] };
          hintJob.persisted = true;
        }
      } finally {
        turning = false;
      }
    })();
  };
  const scheduleHints = (session: SaveSession) => {
    if (cachedHints(session) !== undefined) {
      return;
    }
    if (options.hintPreparer === undefined) {
      session.browserHints = prepareHints(session);
      return;
    }
    const revision = hintRevision(session);
    if (hintJob?.revision === revision) {
      return;
    }
    const job: NonNullable<typeof hintJob> = { revision };
    hintJob = job;
    const candidates = hintCandidates(session);
    void Promise.resolve()
      .then(() => options.hintPreparer!(candidates))
      .then((entries) => {
        if (
          !Array.isArray(entries) ||
          entries.length === 0 ||
          entries.length > candidates.length ||
          entries.some((entry) => !candidates.includes(entry))
        ) {
          throw new Error("Unapproved hint content.");
        }
        job.result = {
          version: 1,
          revision,
          status: "ready",
          entries: [...new Set(entries)],
        };
      })
      .catch(() => {
        job.result = {
          version: 1,
          revision,
          status: "unavailable",
          entries: [],
        };
      })
      .finally(() => {
        if (hintJob === job) {
          flushHints();
        }
      });
  };
  const readSlot = async (): Promise<BrowserView> => {
    try {
      const session = retained ?? (await SaveSession.load(options.savePath));
      const view = playerView(
        session,
        createHash("sha256")
          .update(
            JSON.stringify({
              progress: session.progress,
              generation: session.generation,
              history: session.browserHistory,
              seed: session.seed,
              content: session.runtime.content!.digest,
            }),
          )
          .digest("hex"),
      );
      const hints =
        hintJob?.revision === hintRevision(session) && hintJob.persisted
          ? hintJob.result
          : undefined;
      return {
        ...view,
        ...(hints === undefined ? {} : { hints }),
        ...(saveFailed ? { recovery: "unsaved" as const } : {}),
      };
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
  // Invalid, incompatible or closed occupied slots fail before listening.
  await readSlot();
  try {
    const session = await SaveSession.load(options.savePath);
    await recoverHistory(session);
    const missingHints = cachedHints(session) === undefined;
    scheduleHints(session);
    if (options.hintPreparer === undefined && missingHints) {
      await session.saveBrowserHints(session.browserHints);
    }
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
    flushHints();
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
        if (
          !["/api/start", "/api/turn", "/api/recover"].includes(
            request.url ?? "",
          )
        ) {
          json(response, 404, { error: "Unknown endpoint." });
          return;
        }
        if (request.url === "/api/start" && starting !== undefined) {
          json(response, 200, await starting);
          return;
        }
        if (turning) {
          json(response, 409, {
            error:
              "A turn is already pending. Wait for its reply; this request was not applied.",
            view: await readSlot(),
          });
          return;
        }
        if (request.url === "/api/recover") {
          turning = true;
          try {
            if (retained !== undefined) {
              await retained.saveBrowserHistory(retained.browserHistory!);
              await recoverHistory(retained);
              retainSession(undefined);
              saveFailed = false;
            }
            json(response, 200, { view: await readSlot() });
          } catch {
            saveFailed = true;
            json(response, 503, {
              error:
                "Result retained but not durably saved. Repair local storage and read current state again. Do not repeat the action.",
              view: await readSlot(),
            });
          } finally {
            releaseTurn();
          }
          return;
        }
        if (request.url === "/api/turn") {
          turning = true;
          try {
            let input: Awaited<ReturnType<typeof readPlayerInput>>;
            try {
              input = await readPlayerInput(request);
            } catch {
              json(response, 400, {
                error:
                  "Enter one message of 1–1000 characters. No action was committed.",
              });
              return;
            }
            const viewBefore = await readSlot();
            if (
              retained !== undefined ||
              viewBefore.slot !== "occupied" ||
              input.revision !== viewBefore.revision
            ) {
              json(response, 409, {
                error:
                  retained !== undefined
                    ? "Result not durably saved. Read current state to recover it before continuing."
                    : "This request is stale. Current saved position refreshed; no action was committed.",
                view: viewBefore,
              });
              return;
            }
            const session = await SaveSession.load(options.savePath);
            assertSupported(session);
            await recoverHistory(session);
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
            retainSession(session);
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
                        ...(toolResult.modelOutput.ok &&
                        toolResult.modelOutput.conversation !== undefined
                          ? {
                              reply:
                                toolResult.modelOutput.conversation
                                  .authoredReply,
                              speaker:
                                toolResult.modelOutput.conversation.speakerName,
                            }
                          : {}),
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
                scheduleHints(session);
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
              ? `AI service failed. ${committed ? `Your action was saved; do not repeat it. Position ${session.progress.sequence}.` : "No action was committed. You may retry when AI is available."}`
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
            scheduleHints(session);
            await session.saveBrowserHistory({
              version: 1,
              progress: session.progress,
              turns: [...session.browserHistory!.turns, turn],
            });
            retainSession(undefined);
            json(response, 200, { view: await readSlot(), ...turn });
          } catch {
            saveFailed = retained !== undefined;
            const durable = await SaveSession.load(options.savePath).catch(
              () => undefined,
            );
            json(response, 500, {
              error: `Unable to durably save the complete turn. Durable position: ${durable?.progress.sequence ?? "unavailable"}. Result retained in this process; read current state to save it without repeating the action.`,
              view: await readSlot(),
            });
          } finally {
            releaseTurn();
          }
          return;
        }
        const start = (async () => {
          turning = true;
          try {
            const session = await SaveSession.start(
              options.savePath,
              runtime,
              options.seed,
              {
                exclusive: true,
              },
            );
            scheduleHints(session);
            if (options.hintPreparer === undefined) {
              await session.saveBrowserHints(session.browserHints);
            }
          } catch (error) {
            if (!hasCode(error, "EEXIST")) {
              throw error;
            }
          } finally {
            releaseTurn();
          }
          return readSlot();
        })();
        starting = start;
        const clearStart = () => {
          if (starting === start) {
            starting = undefined;
          }
        };
        void start.then(clearStart, clearStart);
        json(response, 200, await start);
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
        case "/api/hints": {
          const view = await readSlot();
          json(response, 200, view.slot === "occupied" ? view.hints : null);
          break;
        }
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
      closed = true;
      await hintWrite;
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
