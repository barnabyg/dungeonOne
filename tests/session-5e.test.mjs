import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadBuiltInFifthAdventures,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  FifthSession,
  sessionSeed,
  startFifthAdventure,
} from "../dist/session-5e.js";

const adventures = await loadBuiltInFifthAdventures();
const adventure = adventures.find(({ id }) => id === "cellar-goblin");
const CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};
const ATTACK = { type: "attack", actorId: "pc", targetId: "goblin" };
const END_TURN = { type: "end-turn", actorId: "pc" };
/** Attack, or end the turn once the action is spent. */
const step = (runtime, state) =>
  runtime.attackTargets(state).length > 0 ? ATTACK : END_TURN;

async function withLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "session-5e-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const data = await library.create("Ada", CHOICES, started.revision);
    await run(library, data.characters[0].sheet, data.revision, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** How a session on `seed` ends if the player always attacks. */
function outcome(sheet, seed) {
  const runtime = createFifthRuntime(adventure, sheet);
  const random = createSeededRandom(seed);
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  while (state.status === "playing") {
    state = runtime.handleAction(state, step(runtime, state), random).state;
  }
  return state.status;
}

/** A browser seed whose first session ends in `wanted` for `sheet`. */
function seedFor(sheet, wanted) {
  for (let seed = 0; seed < 5000; seed++) {
    if (outcome(sheet, sessionSeed(seed, 1)) === wanted) {
      return seed;
    }
  }
  throw new Error(`no seed found for ${wanted}`);
}

test("starting an adventure saves the session with its fight begun, then links it", async () => {
  await withLibrary(async (library, sheet, revision) => {
    const session = await startFifthAdventure(
      library,
      3,
      sheet.id,
      adventure,
      revision,
    );
    const data = await library.read();
    assert.deepEqual(data.characters[0].session, {
      id: session.id,
      adventureId: "cellar-goblin",
    });
    assert.equal(data.sessionsStarted, 1);
    const file = JSON.parse(
      await readFile(library.sessionPath(session.id), "utf8"),
    );
    assert.equal(file.kind, "dungeon-one-5e-session");
    assert.equal(file.formatVersion, 10);
    assert.equal(file.random.seed, sessionSeed(3, 1));
    assert.deepEqual(file.transitions[0].action, { type: "begin" });
    // Every initiative die (and any opening goblin attack) is recorded.
    assert.ok(file.transitions[0].rolls.length >= 2);
    assert.equal(file.random.position, file.transitions[0].rolls.length);
    assert.match(file.history[0].cards[0].text, /^Initiative: /);

    await assert.rejects(
      startFifthAdventure(library, 3, sheet.id, adventure, data.revision),
      /already on an adventure/,
    );
    await assert.rejects(
      startFifthAdventure(library, 3, sheet.id, adventure, revision),
      /stale/,
    );
  });
});

test("a reloaded session continues exactly: same state, dice stream and records", async () => {
  await withLibrary(async (library, sheet, revision) => {
    const seed = seedFor(sheet, "victory");
    const original = await startFifthAdventure(
      library,
      seed,
      sheet.id,
      adventure,
      revision,
    );
    original.act(ATTACK, "click");
    await original.persist();
    const resumed = await FifthSession.load(original.path, adventures);
    assert.deepEqual(resumed.state, original.state);
    assert.deepEqual(resumed.transitions, original.transitions);
    assert.equal(resumed.randomPosition, original.randomPosition);
    assert.deepEqual(resumed.history, original.history);
    // Both draw the same dice from here on.
    while (original.state.status === "playing") {
      const action = step(original.runtime, original.state);
      const a = original.act(action, "click");
      const b = resumed.act(action, "click");
      assert.deepEqual(b.rolls, a.rolls);
      assert.deepEqual(resumed.state, original.state);
    }
    assert.equal(original.state.status, "victory");
  });
});

test("a session save that does not replay exactly is refused", async () => {
  await withLibrary(async (library, sheet, revision) => {
    const session = await startFifthAdventure(
      library,
      1,
      sheet.id,
      adventure,
      revision,
    );
    session.act(ATTACK, "click");
    await session.persist();
    const path = session.path;
    const good = JSON.parse(await readFile(path, "utf8"));
    const tamper = async (change, message) => {
      const copy = structuredClone(good);
      change(copy);
      const bytes = JSON.stringify(copy);
      await writeFile(path, bytes);
      await assert.rejects(FifthSession.load(path, adventures), message);
      assert.equal(await readFile(path, "utf8"), bytes);
    };
    await tamper(
      (file) => (file.transitions[1].rolls[0].value = 21),
      /Invalid adventure session/,
    );
    await tamper(
      (file) => (file.state.encounter.combatants[1].hp = 0),
      /Invalid adventure session/,
    );
    await tamper(
      (file) => (file.random.position += 1),
      /Invalid adventure session/,
    );
    await tamper((file) => file.transitions.pop(), /Invalid adventure session/);
    await tamper(
      (file) => (file.formatVersion = 0),
      /format version 0, not 10\..*Move it aside/,
    );
    // A save from before coin (#208), named by its path.
    await tamper(
      (file) => (file.formatVersion = 9),
      new RegExp(
        `${path.replaceAll("\\", "\\\\")} is an adventure session in format version 9, not 10\\..*Move it aside`,
      ),
    );
    // The session holds the character's possessions from the start.
    await tamper(
      (file) =>
        (file.state.possessions.treasure = [
          { id: "a/b", name: "B", description: "B." },
        ]),
      /Invalid adventure session/,
    );
    await tamper(
      (file) => (file.adventure.id = "lost-mine"),
      /does not have.*Move it aside/,
    );
    const changed = validateFifthAdventure({
      ...structuredClone(adventure),
      title: "The Goblin in the Wine Cellar",
    });
    await writeFile(path, JSON.stringify(good));
    await assert.rejects(
      FifthSession.load(path, [changed]),
      /different version of The Goblin in the Wine Cellar.*Move it aside/,
    );
  });
});

test("defeat ends the character: 0 HP, defeated, and no new adventure", async () => {
  await withLibrary(async (library, sheet, revision) => {
    const seed = seedFor(sheet, "defeat");
    const session = await startFifthAdventure(
      library,
      seed,
      sheet.id,
      adventure,
      revision,
    );
    while (session.state.status === "playing") {
      session.act(step(session.runtime, session.state), "click");
    }
    assert.equal(session.state.status, "defeat");
    assert.equal(session.state.endingId, "fallen-in-the-cellar");
    await session.persist();
    let data = await library.settleSession(sheet.id, session.id, "defeat");
    assert.equal(data.characters[0].defeated, true);
    assert.equal(data.characters[0].session, undefined);
    assert.equal(data.characters[0].sheet.hp, 0);
    // Settling again changes nothing.
    const bytes = await readFile(library.path);
    data = await library.settleSession(sheet.id, session.id, "defeat");
    assert.deepEqual(await readFile(library.path), bytes);
    await assert.rejects(
      startFifthAdventure(library, seed, sheet.id, adventure, data.revision),
      /Ada was defeated and cannot start another adventure/,
    );
  });
});

test("victory frees the character for another adventure", async () => {
  await withLibrary(async (library, sheet, revision) => {
    const seed = seedFor(sheet, "victory");
    const session = await startFifthAdventure(
      library,
      seed,
      sheet.id,
      adventure,
      revision,
    );
    while (session.state.status === "playing") {
      session.act(step(session.runtime, session.state), "click");
    }
    const data = await library.settleSession(
      sheet.id,
      session.id,
      "victory",
      session.runtime.projectSettlement(session.state),
    );
    assert.equal(data.characters[0].defeated, undefined);
    assert.equal(data.characters[0].session, undefined);
    assert.equal(data.characters[0].sheet.hp, sheet.hp);
    const again = await startFifthAdventure(
      library,
      seed,
      sheet.id,
      adventure,
      data.revision,
    );
    assert.equal((await library.read()).sessionsStarted, 2);
    assert.equal(again.seed, sessionSeed(seed, 2));
  });
});

test("deletion is refused, with no write, while the character is on an adventure", async () => {
  await withLibrary(async (library, sheet, revision) => {
    const session = await startFifthAdventure(
      library,
      1,
      sheet.id,
      adventure,
      revision,
    );
    const data = await library.read();
    const bytes = await readFile(library.path);
    await assert.rejects(
      library.delete(sheet.id, "Ada", data.revision),
      /Ada is on an adventure\. Finish it before deleting the character; nothing was deleted\./,
    );
    assert.deepEqual(await readFile(library.path), bytes);
    while (session.state.status === "playing") {
      session.act(step(session.runtime, session.state), "click");
    }
    const settled = await library.settleSession(
      sheet.id,
      session.id,
      session.state.status,
      session.runtime.projectSettlement(session.state),
    );
    const deleted = await library.delete(sheet.id, "Ada", settled.revision);
    assert.deepEqual(deleted.characters, []);
  });
});
