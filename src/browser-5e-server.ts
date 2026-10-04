/**
 * The browser server behind the temporary `--5e` flag (until #137).
 *
 * It serves the 5e character library: start or resume a creation, preview the
 * player's placement and choices, save a level 1 Fighter, read its sheet and
 * delete it. A saved Fighter can take on a built-in adventure module, where
 * the player explores by clicking Go to, Examine, Take or Drink, fights by
 * clicking an attack, Drink, Second Wind, Action Surge or End turn, or types
 * to the AI DM. The session view projects every action in the action bar with
 * whether the engine would accept it now and why not. Each
 * session is saved after every action and continues after a reload or a
 * restart.
 * A library in another format is refused before the server listens.
 */
import { createServer } from "node:http";
import {
  loadBuiltInFifthAdventures,
  type FifthAdventure,
} from "./adventure-5e.js";
import {
  FifthCharacterLibrary,
  type FifthLibraryData,
} from "./character-library-5e.js";
import { DM_TURN_LIMITS, runDmTurn, type DmModel } from "./dm-turn.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "./openai-dm-model.js";

import {
  FifthSession,
  startFifthAdventure,
  type HistoryCard,
  type HistoryEntry,
} from "./session-5e.js";
import { PLAYER_ID, type FifthAction } from "./runtime-5e.js";
import {
  ABILITIES,
  buildFighter,
  droppedDie,
  fighterProfile,
  FIGHTER_SKILLS,
  FIGHTING_STYLES,
  keptTotal,
  type FighterChoices,
} from "./fighter-5e.js";
import {
  json,
  readBody,
  rejectForeignRequest,
  respond,
} from "./browser-http.js";
import {
  FIFTH_BROWSER_CSS,
  FIFTH_BROWSER_HTML,
  FIFTH_BROWSER_SCRIPT,
} from "./browser-5e-page.js";

export type FifthBrowserOptions = Readonly<{
  libraryPath: string;
  seed: number;
  /** For the AI DM; typed messages are refused without it. */
  apiKey?: string;
  /** Replaces the OpenAI DM, for tests. */
  dmModel?: DmModel;
}>;

/**
 * The rules, the library and request validation raise errors for the player
 * to read and fix. System errors (they carry a `code`, and their messages can
 * hold paths) get the fallback instead.
 */
function playerMessage(error: unknown, fallback: string): string {
  return error instanceof Error && !("code" in error)
    ? error.message
    : fallback;
}

function adventureView(adventure: FifthAdventure) {
  return {
    id: adventure.id,
    title: adventure.title,
    objective: adventure.objective,
    difficulty: adventure.difficulty,
    recommendedLevels: adventure.recommendedLevels,
  };
}

function sessionView(session: FifthSession) {
  const { state, runtime, adventure } = session;
  const ending = adventure.endings.find(({ id }) => id === state.endingId);
  return {
    id: session.id,
    characterId: session.character.id,
    sequence: session.transitions.length,
    adventure: adventureView(adventure),
    room: runtime.projectRoom(state),
    status: state.status,
    ...(ending === undefined
      ? {}
      : {
          ending: { kind: ending.kind, title: ending.title, text: ending.text },
        }),
    ...runtime.projectFight(state),
    actions: runtime.projectActions(state),
    history: session.history,
  };
}

function libraryView(
  data: FifthLibraryData,
  adventures: readonly FifthAdventure[],
) {
  const pending = data.pendingCreation;
  return {
    revision: data.revision,
    adventures: adventures.map(adventureView),
    abilities: ABILITIES,
    skills: Object.entries(FIGHTER_SKILLS).map(([id, skill]) => ({
      id,
      ...skill,
    })),
    fightingStyles: Object.entries(FIGHTING_STYLES).map(([id, style]) => ({
      id,
      ...style,
    })),
    ...(pending === undefined
      ? {}
      : {
          pendingCreation: {
            number: pending.number,
            rolls: pending.dice.map((dice) => ({
              dice,
              dropped: droppedDie(dice),
              total: keptTotal(dice),
            })),
          },
        }),
    characters: data.characters.map(({ sheet, session, defeated }) => ({
      sheet,
      profile: fighterProfile(sheet),
      ...(session === undefined ? {} : { session }),
      defeated: defeated === true,
    })),
  };
}

function choicesFrom(body: Record<string, unknown>): FighterChoices {
  return {
    placement: body.placement as FighterChoices["placement"],
    increase: body.increase as FighterChoices["increase"],
    skills: body.skills as FighterChoices["skills"],
    fightingStyle: body.fightingStyle as FighterChoices["fightingStyle"],
  };
}

function hasExactKeys(body: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(body).sort().join(",") === [...keys].sort().join(",");
}

const CHOICE_KEYS = ["placement", "increase", "skills", "fightingStyle"];
/** The clicked actions that take no target. */
const CLICK_ACTIONS = ["second-wind", "action-surge", "end-turn"] as const;
/** The clicked exploring actions, and the action each makes from its target. */
const EXPLORE_ACTIONS: Record<string, (target: string) => FifthAction> = {
  move: (destinationId) => ({ type: "move", destinationId }),
  examine: (targetId) => ({ type: "examine", targetId }),
  take: (itemId) => ({ type: "take", itemId }),
  use: (itemId) => ({ type: "use-item", itemId }),
};

export async function startFifthBrowserServer(options: FifthBrowserOptions) {
  if (
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff
  ) {
    throw new Error("Seed must be an integer from 0 to 4294967295.");
  }
  const library = new FifthCharacterLibrary(options.libraryPath, options.seed);
  // Refuse an old or invalid library, or a broken module, before listening.
  await library.read();
  const adventures = await loadBuiltInFifthAdventures();
  const apiKey = options.apiKey?.trim() ?? "";
  const model: DmModel | undefined =
    options.dmModel ??
    (apiKey.length === 0
      ? undefined
      : createOpenAiDmModel({ apiKey, model: OPENAI_DM_DEFAULT_MODEL }));
  const view = (data: FifthLibraryData) => libraryView(data, adventures);
  // The file lock fails rather than waits, so this server's own changes queue.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  // Loaded sessions, by id. A session whose save fails is dropped, so the
  // next request reloads it from its file.
  const sessions = new Map<string, FifthSession>();
  const openSession = async (sessionId: unknown): Promise<FifthSession> => {
    const record = (await library.read()).characters.find(
      ({ session }) => session !== undefined && session.id === sessionId,
    );
    if (record === undefined || typeof sessionId !== "string") {
      throw new Error("There is no such adventure in progress.");
    }
    let session = sessions.get(sessionId);
    if (session === undefined) {
      session = await FifthSession.load(
        library.sessionPath(sessionId),
        adventures,
      );
      if (session.character.id !== record.sheet.id) {
        throw new Error("There is no such adventure in progress.");
      }
      sessions.set(sessionId, session);
    }
    return session;
  };
  const persist = async (session: FifthSession) => {
    try {
      await session.persist();
    } catch (error) {
      sessions.delete(session.id);
      throw error;
    }
  };
  /** The response to a session request: the library and the session. */
  const respondWith = async (session: FifthSession) => ({
    library: view(await library.read()),
    session: sessionView(session),
  });
  /** Saves the session, then frees or defeats its character if it ended. */
  const save = async (session: FifthSession) => {
    await persist(session);
    const status = session.state.status;
    const data =
      status === "victory" || status === "defeat"
        ? await library.settleSession(session.character.id, session.id, status)
        : await library.read();
    if (status !== "playing") {
      sessions.delete(session.id);
    }
    return { library: view(data), session: sessionView(session) };
  };
  const requireCurrent = (session: FifthSession, sequence: unknown) => {
    if (sequence !== session.transitions.length) {
      throw new Error(
        "This adventure has moved on since the page last saw it; refresh before acting.",
      );
    }
  };

  /** Resolves a clicked action; a refusal changes, draws and saves nothing. */
  const click = (body: Record<string, unknown>, action: FifthAction) =>
    serialized(async () => {
      const session = await openSession(body.sessionId);
      requireCurrent(session, body.sequence);
      const { result, rolls } = session.act(action, "click");
      if (result.rejection !== undefined) {
        return {
          ...(await respondWith(session)),
          rejection: result.rejection.reason,
        };
      }
      session.history.push({
        reply: "",
        cards: [session.card(result, rolls)],
      });
      return save(session);
    });

  let url = "";
  const handlePost = async (path: string, body: Record<string, unknown>) => {
    switch (path) {
      case "/api/5e/adventures/start": {
        if (
          !hasExactKeys(body, ["revision", "characterId", "adventureId"]) ||
          typeof body.revision !== "string" ||
          typeof body.characterId !== "string"
        ) {
          throw new Error("Invalid adventure request.");
        }
        const adventure = adventures.find(({ id }) => id === body.adventureId);
        if (adventure === undefined) {
          throw new Error("There is no such adventure.");
        }
        return serialized(async () => {
          const session = await startFifthAdventure(
            library,
            options.seed,
            body.characterId as string,
            adventure,
            body.revision as string,
          );
          if (session.state.status === "playing") {
            sessions.set(session.id, session);
          }
          return respondWith(session);
        });
      }
      case "/api/5e/session":
        if (!hasExactKeys(body, ["sessionId"])) {
          throw new Error("Invalid adventure request.");
        }
        return serialized(async () => {
          const session = await openSession(body.sessionId);
          // A session that ended before its character was settled (a crash
          // between the two saves) is settled now.
          return session.state.status === "playing"
            ? respondWith(session)
            : save(session);
        });
      case "/api/5e/session/attack":
        if (
          !hasExactKeys(body, [
            "sessionId",
            "sequence",
            "actorId",
            "targetId",
          ]) ||
          typeof body.actorId !== "string" ||
          typeof body.targetId !== "string"
        ) {
          throw new Error("Invalid attack request.");
        }
        return click(body, {
          type: "attack",
          actorId: body.actorId,
          targetId: body.targetId,
        });
      case "/api/5e/session/action":
        if (
          !hasExactKeys(body, ["sessionId", "sequence", "action"]) ||
          !(CLICK_ACTIONS as readonly unknown[]).includes(body.action)
        ) {
          throw new Error("Invalid action request.");
        }
        return click(body, {
          type: body.action as (typeof CLICK_ACTIONS)[number],
          actorId: PLAYER_ID,
        });
      case "/api/5e/session/explore":
        if (
          !hasExactKeys(body, ["sessionId", "sequence", "action", "target"]) ||
          typeof body.action !== "string" ||
          !Object.hasOwn(EXPLORE_ACTIONS, body.action) ||
          typeof body.target !== "string"
        ) {
          throw new Error("Invalid exploring request.");
        }
        return click(body, EXPLORE_ACTIONS[body.action]!(body.target));
      case "/api/5e/session/message": {
        if (
          !hasExactKeys(body, ["sessionId", "sequence", "message"]) ||
          typeof body.message !== "string"
        ) {
          throw new Error("Invalid message request.");
        }
        const message = body.message.trim();
        if (
          message.length === 0 ||
          message.length > DM_TURN_LIMITS.maxPlayerInputCharacters
        ) {
          throw new Error(
            `Write a message of 1–${DM_TURN_LIMITS.maxPlayerInputCharacters} characters.`,
          );
        }
        if (model === undefined) {
          throw new Error(
            "The AI Dungeon Master needs OPENAI_API_KEY. Set it and restart, or use the buttons.",
          );
        }
        return serialized(async () => {
          const session = await openSession(body.sessionId);
          requireCurrent(session, body.sequence);
          const cards: HistoryCard[] = [];
          const index = session.history.length;
          const record = (reply: string) => {
            const entry: HistoryEntry = {
              player: message,
              reply,
              cards: [...cards],
            };
            session.history[index] = entry;
          };
          const result = await runDmTurn({
            state: session.state,
            playerInput: message,
            transcript: session.history.slice(-4).flatMap((entry) => [
              ...(entry.player === undefined
                ? []
                : [{ role: "player" as const, text: entry.player }]),
              {
                role: "dungeon-master" as const,
                text:
                  entry.reply || entry.cards.map(({ text }) => text).join("\n"),
              },
            ]),
            random: {
              roll() {
                throw new Error("An AI DM turn draws dice only through tools.");
              },
            },
            model,
            runtime: session.runtime,
            resultSurface: "browser-cards",
            executeTool: async (_state, call) => {
              const dispatched = session.dispatch(call);
              if (dispatched.card !== undefined) {
                cards.push(dispatched.card);
                if (dispatched.card.kind !== "rejection") {
                  // Save the committed action, and settle the character if
                  // it ended the fight, before the reply is written.
                  record(
                    "The reply was interrupted; the result is shown below.",
                  );
                  await persist(session);
                  const status = session.state.status;
                  if (status === "victory" || status === "defeat") {
                    await library.settleSession(
                      session.character.id,
                      session.id,
                      status,
                    );
                  }
                }
              }
              return { result: dispatched.result, rolls: dispatched.rolls };
            },
          });
          record(result.narration);
          return save(session);
        });
      }
      case "/api/5e/creation":
        if (!hasExactKeys(body, [])) {
          throw new Error("Invalid character creation request.");
        }
        return view(await serialized(() => library.startCreation()));
      case "/api/5e/creation/preview": {
        if (!hasExactKeys(body, CHOICE_KEYS)) {
          throw new Error("Invalid character creation request.");
        }
        const pending = (await library.read()).pendingCreation;
        if (pending === undefined) {
          throw new Error("There is no pending creation to preview.");
        }
        const sheet = buildFighter(
          "0".repeat(32),
          "Preview",
          pending.dice,
          choicesFrom(body),
        );
        return {
          abilities: sheet.abilities,
          profile: fighterProfile(sheet),
        };
      }
      case "/api/5e/characters":
        if (
          !hasExactKeys(body, ["revision", "name", ...CHOICE_KEYS]) ||
          typeof body.revision !== "string" ||
          typeof body.name !== "string"
        ) {
          throw new Error("Invalid character creation request.");
        }
        return view(
          await serialized(() =>
            library.create(
              (body.name as string).trim(),
              choicesFrom(body),
              body.revision as string,
            ),
          ),
        );
      case "/api/5e/characters/delete":
        if (
          !hasExactKeys(body, ["revision", "characterId", "name"]) ||
          typeof body.revision !== "string" ||
          typeof body.characterId !== "string" ||
          typeof body.name !== "string"
        ) {
          throw new Error("Invalid character deletion request.");
        }
        return view(
          await serialized(() =>
            library.delete(
              body.characterId as string,
              body.name as string,
              body.revision as string,
            ),
          ),
        );
      default:
        return undefined;
    }
  };

  const server = createServer((request, response) => {
    void (async () => {
      if (rejectForeignRequest(request, response, url)) {
        return;
      }
      if (request.method === "POST") {
        try {
          const body = await readBody(request);
          if (
            body === null ||
            typeof body !== "object" ||
            Array.isArray(body)
          ) {
            throw new Error("Invalid character creation request.");
          }
          const result = await handlePost(
            request.url ?? "",
            body as Record<string, unknown>,
          );
          if (result === undefined) {
            json(response, 404, { error: "Unknown endpoint." });
          } else {
            json(response, 200, result);
          }
        } catch (error) {
          json(response, 409, {
            error: playerMessage(
              error,
              "Local storage could not be updated. Refresh, and check that the library folder is writable.",
            ),
          });
        }
        return;
      }
      if (request.method !== "GET") {
        json(response, 405, { error: "Method not allowed." });
        return;
      }
      switch (request.url) {
        case "/":
          respond(
            response,
            200,
            "text/html; charset=utf-8",
            FIFTH_BROWSER_HTML,
          );
          break;
        case "/app.css":
          respond(response, 200, "text/css; charset=utf-8", FIFTH_BROWSER_CSS);
          break;
        case "/app.js":
          respond(
            response,
            200,
            "text/javascript; charset=utf-8",
            FIFTH_BROWSER_SCRIPT,
          );
          break;
        case "/api/5e/library":
          try {
            json(response, 200, view(await library.read()));
          } catch (error) {
            json(response, 409, {
              error: playerMessage(
                error,
                "Unable to read the character library.",
              ),
            });
          }
          break;
        default:
          json(response, 404, { error: "Unknown endpoint." });
      }
    })().catch(() => {
      json(response, 500, { error: "Unable to read the character library." });
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
      await queue;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
        server.closeAllConnections();
      });
    },
  };
}
