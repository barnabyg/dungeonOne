/**
 * The browser server: 5e is the browser's only mode (#137).
 *
 * It serves the 5e character library: start or resume a creation, project the
 * player's placement and choices (every score, modifier, cap and the skill
 * limit, so the page computes none), save a level 1 Fighter, read its sheet and
 * delete it. A saved Fighter can take on a built-in adventure module, where
 * the player explores by clicking Go to, Examine, Take or Drink, equips,
 * unequips, wields or drops gear, opens doors
 * with Force, Pick, Break or Unlock, deals with traps with Search and Disarm,
 * asks creatures about their topics with Talk, fights by
 * clicking an attack, Drink, Second Wind, Action Surge or End turn, or types
 * to the AI DM. In an exit room the player alone can choose Leave, ending the
 * adventure with or without the loot carried (treasure, or coin found). The session view projects
 * every action in the action bar with whether the engine would accept it now
 * and why not. Each session is saved after every action and continues after
 * a reload or a restart; an ended session settles its character in the
 * library (crediting XP, treasure and coin once), and stays viewable, read-only,
 * with its ending's kind, what it earned and any level-up. A character's
 * adventure in progress can be abandoned, crediting nothing. A level-4
 * Fighter's sheet asks for its Ability Score Improvement and fourth weapon
 * mastery (#286), projecting what each choice changes, and the server makes
 * the choice; until then the character starts no adventure.
 * A library in another format is refused before the server listens.
 */
import { createServer } from "node:http";
import {
  loadBuiltInFifthAdventures,
  orderFifthAdventures,
  type FifthAdventure,
} from "./adventure-5e.js";
import {
  FifthCharacterLibrary,
  type FifthLibraryData,
} from "./character-library-5e.js";
import { DM_TURN_LIMITS, type DmModel } from "./dm-turn.js";
import {
  createOpenAiDmModel,
  OPENAI_DM_DEFAULT_MODEL,
} from "./openai-dm-model.js";

import {
  FifthSession,
  settleFifthSession,
  startFifthAdventure,
} from "./session-5e.js";
import { PLAYER_ID, type FifthAction } from "./runtime-5e.js";
import { passesGate } from "./balance-5e.js";
import {
  ammunitionCount,
  ammunitionHeld,
  formatCoins,
  itemName,
  MASTERIES,
  MASTERY_WEAPONS,
  STARTING_KITS,
  WEAPONS,
} from "./equipment-5e.js";
import {
  CLASSES,
  classOf,
  DEFAULT_CLASS,
  defaultPlacement,
  droppedDie,
  characterCarrying,
  characterProfile,
  keptTotal,
  levelUpChanges,
  masteryOptions,
  pendingLevelUp,
  projectCreation,
  projectLevelChoice,
  settleCharacter,
  type CreationChoices,
  type TreasureRecord,
} from "./character-5e.js";
import {
  ABILITIES,
  ABILITY_SCORE_CAP,
  SKILLS,
  FIGHTING_STYLES,
} from "./class-5e.js";
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
  FIFTH_DM_OFF_NOTICE,
} from "./browser-5e-page.js";

export type FifthBrowserOptions = Readonly<{
  libraryPath: string;
  seed: number;
  /** For the AI DM; typed messages are refused without it. */
  apiKey?: string;
  /** Replaces the OpenAI DM, for tests. */
  dmModel?: DmModel;
  /**
   * Which modules are offered; the balance gate at each module's declared
   * difficulty unless replaced, for tests.
   */
  qualifies?: (adventure: FifthAdventure) => boolean;
  /** The modules to offer in place of the built-in ones, for tests. */
  adventures?: readonly FifthAdventure[];
}>;

/**
 * The setup hint when there is no AI DM. It is for whoever launched the
 * server, so it goes to the launcher's terminal output; the player reads
 * FIFTH_DM_OFF_NOTICE instead.
 */
export const FIFTH_DM_SETUP_HINT =
  "The AI Dungeon Master is off: OPENAI_API_KEY is not set. Players can still use the buttons; to let them type to the Dungeon Master, set OPENAI_API_KEY and restart.\n";

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

/**
 * What a surviving ending earned, from the character as the session started:
 * each XP award, the treasure and coin found, the purse kept when coin was
 * found or the purse changed (coin found may have been spent), the XP and
 * level after, and the level-up, if any. Settling credits exactly this.
 */
function rewardsView(session: FifthSession) {
  const settlement = session.runtime.projectSettlement(session.state);
  if (settlement === undefined) {
    return undefined;
  }
  const before = session.character;
  const after = settleCharacter(before, settlement);
  const levelUp = levelUpChanges(before, after);
  return {
    xp: settlement.xp.map(({ name, xp }) => ({ name, xp })),
    treasure: settlement.finds.map(treasureView),
    ...(settlement.coin.length === 0
      ? {}
      : {
          coin: formatCoins(
            settlement.coin.reduce((sum, { copper }) => sum + copper, 0),
          ),
        }),
    ...(settlement.coin.length === 0 && after.purse === before.purse
      ? {}
      : { purse: after.purse === 0 ? "empty" : formatCoins(after.purse) }),
    totalXp: after.xp,
    level: after.level,
    ...(levelUp === undefined ? {} : { levelUp }),
  };
}

/** A treasure as the sheet and the ending show it, with its value in coins (#239). */
function treasureView({ name, description, value }: TreasureRecord) {
  return { name, description, value: formatCoins(value) };
}

function sessionView(session: FifthSession) {
  const { state, runtime, adventure } = session;
  const ending = adventure.endings.find(({ id }) => id === state.endingId);
  const rewards = rewardsView(session);
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
          ending: {
            kind: ending.kind,
            title: ending.title,
            text: ending.text,
            ...(rewards === undefined ? {} : { rewards }),
          },
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
  // Creation makes the default class while there is no choice of class.
  const creating = CLASSES[DEFAULT_CLASS];
  return {
    revision: data.revision,
    adventures: adventures.map(adventureView),
    abilities: ABILITIES,
    skills: creating.skillChoices.options.map((id) => ({
      id,
      ...SKILLS[id],
    })),
    fightingStyles: Object.entries(FIGHTING_STYLES).map(([id, style]) => ({
      id,
      ...style,
    })),
    kits: creating.kits.map((id) => ({
      id,
      name: STARTING_KITS[id].name,
    })),
    masteryWeapons: MASTERY_WEAPONS.map((id) => ({
      id,
      name: WEAPONS[id].name,
      mastery: WEAPONS[id].mastery,
      text: MASTERIES[WEAPONS[id].mastery].text,
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
            defaultPlacement: defaultPlacement(pending.dice),
            rules: {
              scoreCap: ABILITY_SCORE_CAP,
              skillCount: creating.skillChoices.count,
              masteryCount: creating.weaponMasteries[1],
            },
          },
        }),
    characters: data.characters.map(({ sheet, session, defeated }) => {
      const levelUp = pendingLevelUp(sheet);
      return {
        sheet,
        className: classOf(sheet).name,
        profile: characterProfile(sheet),
        purse: formatCoins(sheet.purse),
        carrying: characterCarrying(sheet),
        stowed: sheet.stowed.map(itemName),
        ammunition: ammunitionHeld(sheet.ammunition).map(({ id, count }) =>
          ammunitionCount(id, count),
        ),
        treasure: sheet.treasure.map(treasureView),
        ...(session === undefined ? {} : { session }),
        defeated: defeated === true,
        // The level choice still to make (#286), with the level's changes.
        ...(levelUp === undefined
          ? {}
          : {
              levelChoice: {
                levelUp,
                masteries: masteryOptions(sheet),
                scoreCap: ABILITY_SCORE_CAP,
              },
            }),
      };
    }),
  };
}

function choicesFrom(body: Record<string, unknown>): CreationChoices {
  return {
    placement: body.placement as CreationChoices["placement"],
    increase: body.increase as CreationChoices["increase"],
    skills: body.skills as CreationChoices["skills"],
    fightingStyle: body.fightingStyle as CreationChoices["fightingStyle"],
    kit: body.kit as CreationChoices["kit"],
    masteries: body.masteries as CreationChoices["masteries"],
  };
}

function hasExactKeys(body: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(body).sort().join(",") === [...keys].sort().join(",");
}

const CHOICE_KEYS = [
  "placement",
  "increase",
  "skills",
  "fightingStyle",
  "kit",
  "masteries",
];
/** The clicked actions that take no target. */
const CLICK_ACTIONS = ["second-wind", "action-surge", "end-turn"] as const;
/**
 * The clicked actions that make a check, which may name its approach (#283)
 * and ask for another try (#284).
 */
const APPROACH_ACTIONS: readonly string[] = [
  "examine",
  "force",
  "pick",
  "break",
  "disarm",
  "talk",
];
/** The clicked exploring actions, and the action each makes from its target. */
const EXPLORE_ACTIONS: Record<string, (target: string) => FifthAction> = {
  move: (destinationId) => ({ type: "move", destinationId }),
  examine: (targetId) => ({ type: "examine", targetId }),
  take: (itemId) => ({ type: "take", itemId }),
  use: (itemId) => ({ type: "use-item", itemId }),
  force: (doorId) => ({ type: "force", doorId }),
  pick: (doorId) => ({ type: "pick", doorId }),
  break: (doorId) => ({ type: "break", doorId }),
  unlock: (doorId) => ({ type: "unlock", doorId }),
  search: (roomId) => ({ type: "search", roomId }),
  disarm: (trapId) => ({ type: "disarm", trapId }),
  talk: (topicId) => ({ type: "talk", topicId }),
  leave: (roomId) => ({ type: "leave", roomId }),
  equip: (itemId) => ({ type: "equip", itemId }),
  unequip: (itemId) => ({ type: "unequip", itemId }),
  swap: (itemId) => ({ type: "swap", itemId }),
  drop: (itemId) => ({ type: "drop", itemId }),
  buy: (itemId) => ({ type: "buy", itemId }),
  sell: (itemId) => ({ type: "sell", itemId }),
  // Sent only once the player has confirmed the sale in the panel.
  "sell-equipped": (itemId) => ({ type: "sell", itemId, equipped: true }),
  "sell-treasure": (itemId) => ({ type: "sell-treasure", itemId }),
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
  const adventures = options.adventures ?? (await loadBuiltInFifthAdventures());
  const apiKey = options.apiKey?.trim() ?? "";
  const model: DmModel | undefined =
    options.dmModel ??
    (apiKey.length === 0
      ? undefined
      : createOpenAiDmModel({ apiKey, model: OPENAI_DM_DEFAULT_MODEL }));
  // Only modules that qualify at their declared difficulty are offered or
  // can be started; a session already under way plays on.
  const offered = orderFifthAdventures(
    adventures,
    options.qualifies ?? passesGate,
  );
  const view = (data: FifthLibraryData) => libraryView(data, offered);
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
  /**
   * An ended session of a character still in the library, to show its
   * ending again (#158). It is never cached, so no action can reach it.
   */
  const openEnded = async (sessionId: unknown): Promise<FifthSession> => {
    const refused = new Error("There is no such adventure.");
    if (typeof sessionId !== "string") {
      throw refused;
    }
    let session: FifthSession;
    try {
      session = await FifthSession.load(
        library.sessionPath(sessionId),
        adventures,
      );
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        throw refused;
      }
      throw error;
    }
    const known = (await library.read()).characters.some(
      ({ sheet }) => sheet.id === session.character.id,
    );
    if (session.state.status === "playing" || !known) {
      throw refused;
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
  const dmAvailable = model !== undefined;
  /** The session view, with whether the player can type to the AI DM. */
  const projectSession = (session: FifthSession) => ({
    ...sessionView(session),
    dmAvailable,
  });
  /** The response to a session request: the library and the session. */
  const respondWith = async (session: FifthSession) => ({
    library: view(await library.read()),
    session: projectSession(session),
  });
  /**
   * Saves the session, then settles its character if it ended: keeping what
   * it holds after a victory or escape, or recording a defeat.
   */
  const save = async (session: FifthSession) => {
    await persist(session);
    const data = await settleFifthSession(library, session);
    if (session.state.status !== "playing") {
      sessions.delete(session.id);
    }
    return { library: view(data), session: projectSession(session) };
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
        const adventure = offered.find(({ id }) => id === body.adventureId);
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
      case "/api/5e/adventures/abandon": {
        if (
          !hasExactKeys(body, ["revision", "characterId"]) ||
          typeof body.revision !== "string" ||
          typeof body.characterId !== "string"
        ) {
          throw new Error("Invalid adventure request.");
        }
        return serialized(async () => {
          const before = (await library.read()).characters.find(
            ({ sheet }) => sheet.id === body.characterId,
          );
          // A session that ended before its character was settled (a crash
          // between the two saves) has its ending recorded, never discarded.
          let ended: FifthSession | undefined;
          if (before?.session !== undefined) {
            try {
              const session = await openSession(before.session.id);
              ended = session.state.status === "playing" ? undefined : session;
            } catch {
              // An unreadable session is exactly what abandoning is for.
            }
          }
          if (ended !== undefined) {
            await save(ended);
            throw new Error(
              `${before!.sheet.name}'s adventure had already ended; its ending is now recorded. Refresh to see it.`,
            );
          }
          const data = await library.abandonSession(
            body.characterId as string,
            body.revision as string,
          );
          // The abandoned session takes no more actions.
          if (before?.session !== undefined) {
            sessions.delete(before.session.id);
          }
          return view(data);
        });
      }
      case "/api/5e/session":
        if (!hasExactKeys(body, ["sessionId"])) {
          throw new Error("Invalid adventure request.");
        }
        return serialized(async () => {
          const inProgress = (await library.read()).characters.some(
            ({ session }) => session?.id === body.sessionId,
          );
          if (!inProgress) {
            return respondWith(await openEnded(body.sessionId));
          }
          const session = await openSession(body.sessionId);
          // A session that ended before its character was settled (a crash
          // between the two saves) is settled now.
          return session.state.status === "playing"
            ? respondWith(session)
            : save(session);
        });
      case "/api/5e/session/attack":
      case "/api/5e/session/light-attack":
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
          type: path.endsWith("/light-attack") ? "light-attack" : "attack",
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
      case "/api/5e/session/explore": {
        // A check's approach (#283) and a retry (#284) come with the
        // actions that make checks.
        const approach = typeof body.approach === "string";
        const retry = body.retry === true;
        if (
          !hasExactKeys(body, [
            "sessionId",
            "sequence",
            "action",
            "target",
            ...(approach ? ["approach"] : []),
            ...(retry ? ["retry"] : []),
          ]) ||
          typeof body.action !== "string" ||
          !Object.hasOwn(EXPLORE_ACTIONS, body.action) ||
          typeof body.target !== "string" ||
          ((approach || retry) && !APPROACH_ACTIONS.includes(body.action))
        ) {
          throw new Error("Invalid exploring request.");
        }
        const action = EXPLORE_ACTIONS[body.action]!(body.target);
        return click(body, {
          ...action,
          ...(approach ? { approach: body.approach } : {}),
          ...(retry ? { retry: true } : {}),
        } as FifthAction);
      }
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
          throw new Error(FIFTH_DM_OFF_NOTICE);
        }
        return serialized(async () => {
          const session = await openSession(body.sessionId);
          requireCurrent(session, body.sequence);
          // Save each committed action, and settle the character if it
          // ended the fight, before the reply is written.
          await session.converse(message, model, async () => {
            await persist(session);
            await settleFifthSession(library, session);
          });
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
        return projectCreation(pending.dice, choicesFrom(body));
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
      case "/api/5e/characters/level-choice/preview": {
        if (
          !hasExactKeys(body, ["characterId", "increase", "mastery"]) ||
          typeof body.characterId !== "string"
        ) {
          throw new Error("Invalid level choice request.");
        }
        const record = (await library.read()).characters.find(
          ({ sheet }) => sheet.id === body.characterId,
        );
        if (record === undefined) {
          throw new Error("There is no such character in the library.");
        }
        return projectLevelChoice(record.sheet, {
          increase: body.increase,
          mastery: body.mastery,
        });
      }
      case "/api/5e/characters/level-choice":
        if (
          !hasExactKeys(body, [
            "revision",
            "characterId",
            "increase",
            "mastery",
          ]) ||
          typeof body.revision !== "string" ||
          typeof body.characterId !== "string"
        ) {
          throw new Error("Invalid level choice request.");
        }
        return view(
          await serialized(() =>
            library.chooseLevel(
              body.characterId as string,
              { increase: body.increase, mastery: body.mastery },
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
    /** Whether players can type to the AI DM; false without a key. */
    dmAvailable,
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
