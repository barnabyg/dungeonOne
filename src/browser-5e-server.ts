/**
 * The browser server behind the temporary `--5e` flag (until #137).
 *
 * It serves the 5e character library: start or resume a creation, preview the
 * player's placement and choices, save a level 1 Fighter, read its sheet and
 * delete it.
 * A library in another format is refused before the server listens.
 */
import { createServer } from "node:http";
import {
  FifthCharacterLibrary,
  type FifthLibraryData,
} from "./character-library-5e.js";
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

function libraryView(data: FifthLibraryData) {
  const pending = data.pendingCreation;
  return {
    revision: data.revision,
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
    characters: data.characters.map(({ sheet }) => ({
      sheet,
      profile: fighterProfile(sheet),
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

export async function startFifthBrowserServer(options: FifthBrowserOptions) {
  if (
    !Number.isInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff
  ) {
    throw new Error("Seed must be an integer from 0 to 4294967295.");
  }
  const library = new FifthCharacterLibrary(options.libraryPath, options.seed);
  // Refuse an old or invalid library before listening.
  await library.read();
  // The file lock fails rather than waits, so this server's own changes queue.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  let url = "";
  const handlePost = async (path: string, body: Record<string, unknown>) => {
    switch (path) {
      case "/api/5e/creation":
        if (!hasExactKeys(body, [])) {
          throw new Error("Invalid character creation request.");
        }
        return libraryView(await serialized(() => library.startCreation()));
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
        return libraryView(
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
        return libraryView(
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
              "Character storage could not be updated. Refresh and check local storage.",
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
            json(response, 200, libraryView(await library.read()));
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
