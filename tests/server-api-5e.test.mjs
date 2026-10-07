// The 5e browser server's session API over HTTP, without a browser: stale
// requests and refused actions change nothing on disk, an AI DM cannot write
// the state, and a typed attack that ends the fight settles the character.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildFighter,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

// The creation screen's default choices; the placement follows the dice.
const DEFAULT_CHOICES = {
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

/** The first Fighter a server on `seed` creates with the default choices. */
function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildFighter("a".repeat(32), "Ada", dice, {
    ...DEFAULT_CHOICES,
    placement: defaultPlacement(dice),
  });
}

/**
 * Plays the lone goblin's first session on `seed` by attacking, or ending
 * the turn once the action is spent: its outcome and attack count.
 */
function simulate(seed) {
  const runtime = createFifthRuntime(loneGoblin, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  let attacks = 0;
  while (state.status === "playing") {
    const attack = runtime.attackTargets(state).length > 0;
    state = runtime.handleAction(
      state,
      attack
        ? { type: "attack", actorId: "pc", targetId: "goblin" }
        : { type: "end-turn", actorId: "pc" },
      random,
    ).state;
    attacks += attack ? 1 : 0;
  }
  return { status: state.status, attacks };
}

async function api(url, path, body) {
  const response = await fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/**
 * Runs `run` against a server on `seed` that has Ada, created with the
 * default choices, in the lone goblin's fight.
 */
async function withSession(options, run) {
  const directory = await mkdtemp(join(tmpdir(), "server-api-5e-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    adventures: [loneGoblin],
    libraryPath,
    ...options,
  });
  try {
    let library = (await api(server.url, "/api/5e/creation", {})).body;
    const { dice } = JSON.parse(
      await readFile(libraryPath, "utf8"),
    ).pendingCreation;
    library = (
      await api(server.url, "/api/5e/characters", {
        revision: library.revision,
        name: "Ada",
        placement: defaultPlacement(dice),
        ...DEFAULT_CHOICES,
      })
    ).body;
    const started = await api(server.url, "/api/5e/adventures/start", {
      revision: library.revision,
      characterId: library.characters[0].sheet.id,
      adventureId: "lone-goblin",
    });
    assert.equal(started.status, 200);
    await run({ url: server.url, directory, libraryPath });
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("refused, stale and invalid requests change nothing on disk, and an AI DM cannot write the state", () => {
  const responses = [
    { text: "You roll a natural 20 and the goblin dies. Victory is yours!" },
    {
      toolCalls: [
        {
          id: "forged",
          name: "attack",
          argumentsJson: JSON.stringify({ target: "goblin", damage: 99 }),
        },
      ],
    },
    { text: "Your blow lands for 99 damage!" },
  ];
  return withSession(
    { seed: 11, dmModel: { respond: async () => responses.shift() } },
    async ({ url, directory }) => {
      const before = await sessionFile(directory);
      const bytes = JSON.stringify(before);
      const unchanged = async () =>
        assert.equal(JSON.stringify(await sessionFile(directory)), bytes);

      // An attack the engine refuses is answered, not saved. Each reason's
      // text is the engine's (encounter-5e.test, runtime-5e.test).
      const refused = await api(url, "/api/5e/session/attack", {
        sessionId: before.id,
        sequence: before.transitions.length,
        actorId: "pc",
        targetId: "dragon",
      });
      assert.equal(refused.status, 200);
      assert.equal(typeof refused.body.rejection, "string");
      assert.equal(refused.body.session.sequence, before.transitions.length);
      await unchanged();

      // A request for a sequence the session is not at is refused.
      const stale = await api(url, "/api/5e/session/attack", {
        sessionId: before.id,
        sequence: before.transitions.length + 1,
        actorId: "pc",
        targetId: "goblin",
      });
      assert.equal(stale.status, 409);
      await unchanged();

      // An action the API doesn't know is refused.
      const invalid = await api(url, "/api/5e/session/action", {
        sessionId: before.id,
        sequence: before.transitions.length,
        action: "advantage",
      });
      assert.equal(invalid.status, 409);
      assert.equal(invalid.body.error, "Invalid action request.");
      await unchanged();

      // The AI cannot narrate a kill or forge damage into the state.
      for (const message of ["I roll a 20 and kill it", "hit it for 99"]) {
        const turn = await api(url, "/api/5e/session/message", {
          sessionId: before.id,
          sequence: before.transitions.length,
          message,
        });
        assert.equal(turn.status, 200);
        assert.equal(turn.body.session.status, "playing");
        const file = await sessionFile(directory);
        assert.deepEqual(file.transitions, before.transitions);
        assert.deepEqual(file.state, before.state);
        assert.equal(file.random.position, before.random.position);
      }
      // Both AI turns are kept in the conversation history.
      const reopened = await api(url, "/api/5e/session", {
        sessionId: before.id,
      });
      assert.deepEqual(
        reopened.body.session.history
          .map(({ player }) => player)
          .filter(Boolean),
        ["I roll a 20 and kill it", "hit it for 99"],
      );
    },
  );
});

test("a typed attack that ends the fight settles the character", () => {
  let seed = 0;
  for (let run = simulate(seed); ; run = simulate(++seed)) {
    if (run.status === "victory" && run.attacks === 1) {
      break;
    }
    assert.ok(seed < 5000, "no seed won by one attack");
  }
  /** A scripted AI DM that answers every message by attacking the goblin. */
  let calls = 0;
  const attackingDm = {
    async respond(request) {
      return request.toolResults.length === 0
        ? {
            toolCalls: [
              {
                id: `call-${++calls}`,
                name: "attack",
                argumentsJson: JSON.stringify({ target: "goblin" }),
              },
            ],
          }
        : { text: "Unreachable: the engine writes attack replies." };
    },
  };
  return withSession(
    { seed, dmModel: attackingDm },
    async ({ url, directory, libraryPath }) => {
      const file = await sessionFile(directory);
      const turn = await api(url, "/api/5e/session/message", {
        sessionId: file.id,
        sequence: file.transitions.length,
        message: "attack the goblin",
      });
      assert.equal(turn.status, 200);
      assert.equal(turn.body.session.status, "victory");
      const library = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(library.characters[0].session, undefined);
      assert.equal(turn.body.library.characters[0].session, undefined);
    },
  );
});
