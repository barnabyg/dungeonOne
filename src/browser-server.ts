import {
  CharacterCareer,
  matchesCareerSession,
  hasActiveCharacter,
} from "./character-career.js";
import {
  carriesTreasure,
  characterProfile,
  createCharacter,
  describeTreasure,
  meetsFighterMinimums,
  PRESETS,
  ABILITIES,
  abilityModifier,
  nextLevelXp,
  rollAbilities,
  rolledAbilities,
  type Abilities,
  type AbilityRolls,
} from "./character-rules.js";
import { createSeededRandom } from "./random.js";
import type { ChapelCluesDefinition } from "./adventure-loader.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { isDeepStrictEqual } from "node:util";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
import { createDataRuntime } from "./data-runtime.js";
import type { CharacterStatus, DmScene } from "./game-tools.js";
import {
  browserInformation,
  type BrowserInformation,
} from "./browser-information.js";
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
import {
  browserReleasePolicy,
  startableCharacterAdventures,
  type BrowserReleasePolicy,
} from "./browser-releases.js";
import { BROWSER_HTML, BROWSER_CSS, BROWSER_SCRIPT } from "./browser-page.js";
import {
  artworkForLocation,
  loadBrowserArtwork,
  type BrowserArtwork,
} from "./browser-artwork.js";
import {
  cachedHints,
  cachedStrongerHints,
  hintCandidates,
  hintRevision,
  prepareHints,
  strongerHintCandidates,
  type BrowserHints,
  type HintPreparer,
} from "./browser-hints.js";

export type BrowserOptions = Readonly<{
  /** Hollow Beacon version for new `--legacy` slots (a listed single-slot
   * release); occupied saves follow the release policy. */
  contentVersion?: string;
  libraryPath?: string;
  savePath: string;
  seed: number;
  apiKey: string;
  dmModel?: DmModel;
  hintPreparer?: HintPreparer;
  strongerHintPreparer?: HintPreparer;
  artworkPath?: string;
}>;

async function readBody(request: IncomingMessage): Promise<unknown> {
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
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function readPlayerInput(
  request: IncomingMessage,
): Promise<
  ({ message: string } | { optionId: string }) & { revision: string }
> {
  const body = await readBody(request);
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

const treasureView = (status: CharacterStatus) => {
  const found = status.pendingTreasure;
  return status.sheet === undefined || !carriesTreasure(status.sheet)
    ? {}
    : {
        treasure: {
          silver: status.sheet.inventory.silver,
          ...(found === undefined ||
          (found.silver === 0 && found.items.length === 0)
            ? {}
            : { found: describeTreasure(found.silver, found.items) }),
        },
      };
};

const nextLevelView = (status: CharacterStatus) => {
  const next =
    status.sheet === undefined ? undefined : nextLevelXp(status.sheet.level);
  return next === undefined ? {} : { nextLevelXp: next };
};

export type BrowserView = Readonly<
  | {
      slot: "empty";
      title: string;
      introduction: string;
      seed: number;
      careerMode?: boolean;
    }
  | {
      slot: "occupied";
      careerMode?: boolean;
      revision: string;
      generation: string;
      position: number;
      recovery: "saved" | "pending" | "unsaved";
      seed: number;
      newGameSeed: number;
      scene: DmScene;
      clocks: ReturnType<NonNullable<AdventureRuntime["projectPlayerClocks"]>>;
      hp: Readonly<{ current: number; maximum: number }>;
      character: CharacterStatus;
      information: BrowserInformation;
      deadline?: Readonly<{ name: string; day: number }>;
      actions: readonly BrowserAction[];
      title: string;
      introduction: string;
      characterLabel: string;
      /** XP for the selected character's next level; absent at the top. */
      nextLevelXp?: number;
      /** Silver carried and treasure found; only for characters who keep it. */
      treasure?: Readonly<{ silver: number; found?: string }>;
      artwork?: BrowserArtwork;
      history: readonly BrowserTurn[];
      strongerHints?:
        | BrowserHints
        | Readonly<{
            revision: string;
            status: "preparing";
            entries: readonly string[];
          }>;
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

function playerView(
  session: SaveSession,
  revision: string,
  newGameSeed: number,
  releases: BrowserReleasePolicy,
): Extract<BrowserView, { slot: "occupied" }> {
  releases.assertContinuable(session.runtime);
  const status = session.runtime.projectCharacterStatus(session.state);
  const completed = status.outcome !== "playing";
  return {
    slot: "occupied",
    revision,
    generation: session.generation,
    position: session.progress.sequence,
    recovery:
      session.browserHistory?.pending === undefined ? "saved" : "pending",
    seed: session.seed,
    newGameSeed,
    scene: session.runtime.projectDmScene(session.state),
    clocks: session.runtime.projectPlayerClocks?.(session.state) ?? [],
    hp: { current: status.hp, maximum: status.maxHp },
    character: status,
    ...treasureView(status),
    information: browserInformation(session),
    // Public premise of the supported authored Watch Route, not a hidden
    // clock threshold/effect projection or a parse of terminal narration.
    ...(session.runtime.id === "hollow-beacon"
      ? { deadline: { name: "Caravan at the ridge fork", day: 3 } }
      : {}),
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
    introduction: session.runtime.content!.snapshot.introduction,
    ...nextLevelView(status),
    characterLabel:
      status.sheet === undefined
        ? "Fighter"
        : `${status.sheet.name} \u00b7 Fighter level ${status.sheet.level}`,
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
    ...(completed || cachedStrongerHints(session) === undefined
      ? {}
      : { strongerHints: cachedStrongerHints(session)! }),
    hints: completed
      ? {
          version: 1,
          revision: hintRevision(session),
          status: "unavailable",
          entries: [],
        }
      : (cachedHints(session) ?? {
          revision: hintRevision(session),
          status: "preparing",
          entries: [],
        }),
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
        : !result.modelOutput.ok && result.engineResult === undefined
          ? result.modelOutput.error.code === "unavailable-reference"
            ? "That subject or action is not available at this position. Choose a person, object or exit in view, or clarify which visible subject you mean. No time, dice or items were spent."
            : result.modelOutput.error.code === "invalid-arguments" ||
                result.modelOutput.error.code === "malformed-json"
              ? "The request did not identify one complete supported action. Clarify the person, object or destination, or choose its contextual options. No time, dice or items were spent."
              : mechanics
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
  if (
    options.apiKey.trim().length === 0 &&
    options.libraryPath === undefined &&
    options.dmModel === undefined
  ) {
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
  const releases = await browserReleasePolicy(options.contentVersion ?? "4");
  const runtime = createDataRuntime(releases.start);
  const career =
    options.libraryPath === undefined
      ? undefined
      : new CharacterCareer(options.libraryPath);
  let savePath = options.savePath;
  await career?.recoverStarts();
  await career?.synchronize();
  // Ability rolls draw from their own stream of the startup seed (#118). The
  // server keeps the one pending roll, so saving cannot choose its own scores.
  const abilityRandom = createSeededRandom(
    createHash("sha256")
      .update(`ability-rolls:${options.seed}`)
      .digest()
      .readUInt32LE(0),
  );
  let rollCount = 0;
  let pendingRoll: { id: number; rolls: AbilityRolls } | undefined;
  const modifiersOf = (abilities: Abilities) =>
    Object.fromEntries(
      ABILITIES.map((ability) => [
        ability,
        abilityModifier(abilities[ability]),
      ]),
    );
  const libraryView = async () => {
    if (career === undefined) {
      throw new Error("Character library is not enabled.");
    }
    const data = await career.library.read();
    return {
      revision: data.revision,
      presets: PRESETS,
      presetProfiles: Object.fromEntries(
        Object.keys(PRESETS).map((preset) => {
          const preview = createCharacter("Preview", preset, "0".repeat(32));
          return [
            preset,
            {
              profile: characterProfile(preview),
              modifiers: modifiersOf(preview.abilities),
            },
          ];
        }),
      ),
      pendingRoll:
        pendingRoll === undefined
          ? undefined
          : (() => {
              const abilities = rolledAbilities(pendingRoll.rolls);
              return {
                id: pendingRoll.id,
                rolls: pendingRoll.rolls,
                abilities,
                modifiers: modifiersOf(abilities),
                profile: characterProfile({ abilities, level: 1 }),
                meetsMinimums: meetsFighterMinimums(abilities),
              };
            })(),
      characters: data.characters.map((record) => ({
        ...record,
        profile: characterProfile(record.sheet),
        modifiers: modifiersOf(record.sheet.abilities),
        // Absent for characters made before they could carry treasure.
        ...(carriesTreasure(record.sheet)
          ? {
              treasure: {
                empty:
                  record.sheet.inventory.silver === 0 &&
                  record.sheet.inventory.items.length === 0,
                text: describeTreasure(
                  record.sheet.inventory.silver,
                  record.sheet.inventory.items,
                ),
              },
            }
          : {}),
      })),
      sessions: data.sessions.map((entry) => ({
        id: entry.id,
        characterId: entry.characterId,
        title: entry.content.title,
        status: entry.status,
      })),
      adventures: (await startableCharacterAdventures()).map(({ snapshot }) => {
        // Treasure stays a surprise; the page never lists what drops.
        const support = {
          ...(snapshot as ChapelCluesDefinition).characterAdventure!,
        };
        delete support.treasure;
        return { id: snapshot.id, title: snapshot.title, ...support };
      }),
    };
  };
  const artwork =
    options.artworkPath === undefined
      ? undefined
      : await loadBrowserArtwork(options.artworkPath);
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
  let strongerJob: typeof hintJob;
  // The replacement caller holds the turn lock and has checked that neither
  // current hint job is pending before discarding the old generation's caches.
  const clearHintJobs = () => {
    hintJob = undefined;
    strongerJob = undefined;
  };
  const flushHints = () => {
    const job = [hintJob, strongerJob].find(
      (candidate) => candidate?.result !== undefined && !candidate.persisted,
    );
    if (
      closed ||
      turning ||
      retained !== undefined ||
      job?.result === undefined
    ) {
      return;
    }
    const result = job.result;
    // Completion belongs to this captured job even if a later scene has
    // replaced the active request. It is projected only for its own revision.
    const finishWrite = (failed = false) => {
      if (failed) {
        job.result = { ...result, status: "unavailable", entries: [] };
      }
      job.persisted = true;
    };
    turning = true;
    hintWrite = (async () => {
      try {
        const session = await SaveSession.load(savePath);
        if (
          session.runtime.projectDmScene(session.state).outcome === "playing" &&
          hintRevision(session) === result.revision
        ) {
          if (job === strongerJob) {
            await session.saveBrowserStrongerHints(result);
          } else {
            await session.saveBrowserHints(result);
          }
        }
        finishWrite();
      } catch {
        // Derived-cache failure never turns a committed action into a retry.
        finishWrite(true);
      } finally {
        turning = false;
        flushHints();
      }
    })();
  };
  const scheduleHints = (session: SaveSession) => {
    if (session.runtime.projectDmScene(session.state).outcome !== "playing") {
      clearHintJobs();
      return;
    }
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
  const requestStrongerHints = (session: SaveSession) => {
    const revision = hintRevision(session);
    if (
      cachedStrongerHints(session) !== undefined ||
      strongerJob?.revision === revision
    ) {
      return;
    }
    const job: NonNullable<typeof hintJob> = { revision };
    strongerJob = job;
    const candidates = strongerHintCandidates(session);
    void Promise.resolve()
      .then(() => options.strongerHintPreparer?.([...candidates]) ?? candidates)
      .then((entries) => {
        if (
          !Array.isArray(entries) ||
          entries.length !== 1 ||
          !candidates.includes(entries[0]!)
        ) {
          throw new Error("Unapproved stronger hint content.");
        }
        job.result = {
          version: 1,
          revision,
          status: "ready",
          entries: [...entries],
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
        if (strongerJob === job) {
          flushHints();
        }
      });
  };
  const readSlot = async (): Promise<BrowserView> => {
    const selected = await career?.library.read();
    if (selected?.selectedSessionId !== undefined) {
      savePath = career!.sessionPath(selected.selectedSessionId);
    }
    // A readable cache may precede release of its publication lock. Wait for
    // the recovery-file rename before loading, so it cannot look like an empty
    // slot while the journal is being moved to the primary.
    let publishing = hintWrite;
    while (publishing !== undefined) {
      await publishing;
      if (publishing === hintWrite) {
        break;
      }
      publishing = hintWrite;
    }
    try {
      const session = retained ?? (await SaveSession.load(savePath));
      let view = playerView(
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
        options.seed,
        releases,
      );
      if (session.runtime.startingCharacter !== undefined) {
        const data = await career?.library.read();
        const entry = data?.sessions.find(
          (candidate) => career!.sessionPath(candidate.id) === session.path,
        );
        const record = data?.characters.find(
          ({ sheet }) => sheet.id === entry?.characterId,
        );
        const safe =
          entry !== undefined &&
          matchesCareerSession(entry, session) &&
          (session.state.status !== "playing" ||
            (record !== undefined && hasActiveCharacter(entry, record)));
        if (!safe) {
          view = {
            ...view,
            actions: [],
            scene: {
              ...view.scene,
              outcome: "quit",
              objective:
                "Historical review only. Restore the current adventure and its original character library to continue this identity.",
            },
          };
        }
      }
      const hints =
        view.scene.outcome === "playing" &&
        hintJob?.revision === hintRevision(session) &&
        hintJob.persisted
          ? hintJob.result
          : undefined;
      const sceneArtwork = artworkForLocation(
        artwork,
        session.runtime,
        view.scene.room.id,
      );
      return {
        ...view,
        ...(career === undefined ? {} : { careerMode: true }),
        ...(sceneArtwork === undefined ? {} : { artwork: sceneArtwork }),
        ...(hints === undefined ? {} : { hints }),
        ...(view.scene.outcome === "playing" &&
        strongerJob?.revision === hintRevision(session)
          ? {
              strongerHints: strongerJob.persisted
                ? strongerJob.result!
                : {
                    revision: strongerJob.revision,
                    status: "preparing" as const,
                    entries: [],
                  },
            }
          : {}),
        ...(saveFailed ? { recovery: "unsaved" as const } : {}),
      };
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        throw error;
      }
      return {
        slot: "empty",
        ...(career === undefined ? {} : { careerMode: true }),
        title: releases.start.snapshot.title,
        introduction: releases.start.snapshot.introduction,
        seed: options.seed,
      };
    }
  };
  // Invalid, incompatible or closed occupied slots fail before listening.
  const initialView = await readSlot();
  if (initialView.slot === "occupied" && initialView.scene.outcome !== "quit") {
    try {
      const session = await SaveSession.load(savePath);
      await recoverHistory(session);
      const missingHints = cachedHints(session) === undefined;
      scheduleHints(session);
      if (
        session.runtime.projectDmScene(session.state).outcome === "playing" &&
        options.hintPreparer === undefined &&
        missingHints
      ) {
        await session.saveBrowserHints(session.browserHints);
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        throw error;
      }
    }
  }
  const model =
    options.dmModel ??
    (options.apiKey.trim().length === 0
      ? {
          async respond() {
            throw new Error("Configure OPENAI_API_KEY to play.");
          },
        }
      : createOpenAiDmModel({
          apiKey: options.apiKey,
          model: OPENAI_DM_DEFAULT_MODEL,
        }));
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
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
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
        if (request.url?.startsWith("/api/characters/")) {
          if (career === undefined) {
            json(response, 404, { error: "Character library is not enabled." });
            return;
          }
          if (
            turning ||
            retained !== undefined ||
            [hintJob, strongerJob].some(
              (job) => job !== undefined && !job.persisted,
            )
          ) {
            json(response, 409, {
              error:
                "Wait for the pending adventure reply before changing selection.",
            });
            return;
          }
          turning = true;
          try {
            const body = (await readBody(request)) as Record<string, unknown>;
            if (
              body === null ||
              typeof body !== "object" ||
              Array.isArray(body) ||
              typeof body.revision !== "string"
            ) {
              throw new Error("Invalid character request.");
            }
            if (request.url === "/api/characters/roll") {
              if (Object.keys(body).length !== 1) {
                throw new Error("Invalid character request.");
              }
              // Only the whole set is ever rerolled (#118).
              pendingRoll = {
                id: ++rollCount,
                rolls: rollAbilities(abilityRandom),
              };
            } else if (
              request.url === "/api/characters/create" &&
              Object.keys(body).length === 3 &&
              typeof body.name === "string" &&
              typeof body.rollId === "number"
            ) {
              const roll = pendingRoll;
              if (roll?.id !== body.rollId) {
                throw new Error(
                  "This ability roll is no longer current; roll again before saving a character.",
                );
              }
              await career.library.createRolled(
                body.name,
                roll.rolls,
                body.revision,
              );
              // A saved set is spent; a newer roll is left for the player.
              if (pendingRoll === roll) {
                pendingRoll = undefined;
              }
            } else if (request.url === "/api/characters/create") {
              if (
                Object.keys(body).length !== 3 ||
                typeof body.name !== "string" ||
                typeof body.preset !== "string"
              ) {
                throw new Error("Enter a name and ability preset.");
              }
              await career.library.create(
                body.name,
                body.preset,
                body.revision,
              );
            } else if (request.url === "/api/characters/play") {
              if (
                Object.keys(body).length !== 4 ||
                typeof body.characterId !== "string" ||
                typeof body.adventureId !== "string" ||
                body.confirmed !== true
              ) {
                throw new Error("Confirm your character and adventure pair.");
              }
              savePath = await career.start(
                body.characterId,
                body.adventureId,
                body.revision,
                options.seed,
                body.confirmed,
              );
              clearHintJobs();
              // Like a single-slot start, the opening saves its baseline hints.
              const session = await SaveSession.load(savePath);
              scheduleHints(session);
              if (options.hintPreparer === undefined) {
                await session.saveBrowserHints(session.browserHints);
              }
            } else if (request.url === "/api/characters/rest") {
              if (
                Object.keys(body).length !== 2 ||
                typeof body.characterId !== "string"
              ) {
                throw new Error("Choose a character to rest.");
              }
              await career.rest(body.characterId, body.revision);
            } else if (request.url === "/api/characters/abandon") {
              if (
                Object.keys(body).length !== 3 ||
                typeof body.characterId !== "string" ||
                body.confirmed !== true
              ) {
                throw new Error("Confirm abandonment and pending XP loss.");
              }
              await career.abandon(
                body.characterId,
                body.revision,
                body.confirmed,
              );
              clearHintJobs();
            } else if (request.url === "/api/characters/continue") {
              if (
                Object.keys(body).length !== 2 ||
                typeof body.sessionId !== "string"
              ) {
                throw new Error("Choose a saved adventure.");
              }
              savePath = await career.select(body.sessionId, body.revision);
              clearHintJobs();
            } else {
              json(response, 404, { error: "Unknown character action." });
              return;
            }
            json(response, 200, {
              library: await libraryView(),
              view: await readSlot(),
            });
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Character action failed.";
            json(response, 409, {
              error:
                /character|Character|preset|stale|Confirm|Choose|Wait|available|supported|busy|level|adventure|library/.test(
                  message,
                )
                  ? message
                  : "Character storage could not be updated. Refresh and check local storage.",
            });
          } finally {
            releaseTurn();
          }
          return;
        }
        if (
          ![
            "/api/start",
            "/api/turn",
            "/api/recover",
            "/api/hints/stronger",
            "/api/new-game",
          ].includes(request.url ?? "")
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
        if (
          career !== undefined &&
          (request.url === "/api/start" || request.url === "/api/new-game")
        ) {
          json(response, 409, {
            error:
              "Choose a saved character and adventure from the character library.",
          });
          return;
        }
        if (request.url === "/api/new-game") {
          turning = true;
          let stagedPath: string | undefined;
          let previous: SaveSession | undefined;
          try {
            const body = await readBody(request).catch(() => undefined);
            if (
              body === null ||
              typeof body !== "object" ||
              Array.isArray(body) ||
              Object.keys(body).length !== 3 ||
              !("confirmed" in body) ||
              body.confirmed !== true ||
              !("seed" in body) ||
              body.seed !== options.seed ||
              !("revision" in body) ||
              typeof body.revision !== "string"
            ) {
              json(response, 400, {
                error:
                  "Confirm replacement with the displayed seed and current slot revision.",
              });
              return;
            }
            const before = await readSlot();
            if (
              retained !== undefined ||
              before.slot !== "occupied" ||
              body.revision !== before.revision ||
              [hintJob, strongerJob].some(
                (job) => job !== undefined && !job.persisted,
              )
            ) {
              json(response, 409, {
                error:
                  "New game was not started. Read current state and wait for pending turns or hints to finish before confirming replacement.",
                view: before,
              });
              return;
            }
            previous = await SaveSession.load(savePath);
            retainSession(previous);
            // Publish any verified recovery journal before replacing the primary,
            // so a prior journal cannot resurrect the old game after restart.
            await previous.saveBrowserHistory(
              previous.browserHistory ?? {
                version: 1,
                progress: previous.progress,
                turns: [],
              },
            );
            stagedPath = join(
              dirname(savePath),
              `.${basename(savePath)}.${randomBytes(8).toString("hex")}.new-game`,
            );
            const fresh = await SaveSession.start(
              stagedPath,
              runtime,
              options.seed,
              { exclusive: true },
            );
            await fresh.saveBrowserHistory({
              version: 1,
              progress: fresh.progress,
              turns: [],
            });
            if (options.hintPreparer === undefined) {
              await fresh.saveBrowserHints(prepareHints(fresh));
            }
            await SaveSession.load(stagedPath);
            // The only replacement point: a complete verified same-directory file.
            // Before this atomic rename the old slot remains recoverable; after it
            // restart sees the entire new generation, including empty history.
            await rename(stagedPath, savePath);
            retainSession(undefined);
            clearHintJobs();
            saveFailed = false;
            scheduleHints(fresh);
            json(response, 200, { view: await readSlot() });
          } catch {
            json(response, 500, {
              error:
                "New game replacement failed. Read current state to recover the verified slot before trying again.",
              view: await readSlot(),
            });
          } finally {
            if (retained === previous) {
              retainSession(undefined);
            }
            if (stagedPath !== undefined) {
              await unlink(stagedPath).catch(() => undefined);
              await unlink(`${stagedPath}.recovery`).catch(() => undefined);
            }
            releaseTurn();
          }
          return;
        }
        if (request.url === "/api/recover") {
          turning = true;
          try {
            if (retained !== undefined) {
              await retained.saveBrowserHistory(retained.browserHistory!);
              await recoverHistory(retained);
              await career?.acceptSession(retained.path);
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
        if (request.url === "/api/hints/stronger") {
          turning = true;
          try {
            const body = await readBody(request).catch(() => undefined);
            if (
              body === null ||
              typeof body !== "object" ||
              Array.isArray(body) ||
              Object.keys(body).length !== 1 ||
              !("revision" in body) ||
              typeof body.revision !== "string" ||
              !/^[a-f0-9]{64}$/.test(body.revision)
            ) {
              json(response, 400, { error: "Invalid hint request." });
              return;
            }
            const view = await readSlot();
            if (
              retained !== undefined ||
              view.slot !== "occupied" ||
              view.scene.outcome !== "playing" ||
              body.revision !== view.hints.revision ||
              view.hints.status !== "ready"
            ) {
              json(response, 409, {
                error:
                  "Read the current baseline hints before requesting a stronger hint.",
                view,
              });
              return;
            }
            requestStrongerHints(await SaveSession.load(savePath));
            json(response, 200, { view: await readSlot() });
          } finally {
            releaseTurn();
          }
          return;
        }
        if (request.url === "/api/turn") {
          turning = true;
          let releaseCareerTurn: (() => Promise<void>) | undefined;
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
              viewBefore.scene.outcome !== "playing" ||
              input.revision !== viewBefore.revision
            ) {
              json(response, 409, {
                error:
                  retained !== undefined
                    ? "Result not durably saved. Read current state to recover it before continuing."
                    : viewBefore.slot === "occupied" &&
                        viewBefore.scene.outcome !== "playing"
                      ? "This adventure has ended. Review your conversation and current information; further interaction is closed."
                      : "This request is stale. Current saved position refreshed; no action was committed.",
                view: viewBefore,
              });
              return;
            }
            const session = await SaveSession.load(savePath);
            releases.assertContinuable(session.runtime);
            if (session.runtime.startingCharacter !== undefined) {
              releaseCareerTurn = await career!.beginTurn(session);
            }
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
              resultSurface: "browser-cards",
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
            await career?.acceptSession(session.path);
            retainSession(undefined);
            json(response, 200, { view: await readSlot(), ...turn });
          } catch {
            saveFailed = retained !== undefined;
            const durable = await SaveSession.load(savePath).catch(
              () => undefined,
            );
            json(response, 500, {
              error: `Unable to durably save the complete turn. Durable position: ${durable?.progress.sequence ?? "unavailable"}. Result retained in this process; read current state to save it without repeating the action.`,
              view: await readSlot(),
            });
          } finally {
            await releaseCareerTurn?.();
            releaseTurn();
          }
          return;
        }
        const start = (async () => {
          turning = true;
          try {
            await mkdir(dirname(savePath), { recursive: true });
            const session = await SaveSession.start(
              savePath,
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
        case "/api/characters":
          if (career === undefined) {
            json(response, 404, { error: "Character library is not enabled." });
          } else {
            json(response, 200, await libraryView());
          }
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
