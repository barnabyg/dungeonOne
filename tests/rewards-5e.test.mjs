import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import {
  buildFighter,
  fighterProfile,
  levelUpChanges,
  rewardFighter,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  FifthSession,
  sessionSeed,
  settleFifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";

const adventures = await loadBuiltInFifthAdventures();
const barrow = adventures.find(({ id }) => id === "robbers-barrow");
const cellar = adventures.find(({ id }) => id === "cellar-goblin");
// Str 16 (+3), Dex 12 (+1), Con 14 (+2): AC 17 with Defense, 12 HP, mace +5.
const sheet = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
  ],
  {
    placement: {
      strength: 0,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: 5,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
  },
);

/** Returns queued values in order. */
function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

/** Plays `actions` in order, each accepted; returns the final state. */
function play(runtime, actions, random) {
  let state = runtime.createSession();
  for (const action of actions) {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

const LEAVE = { type: "leave", roomId: "barrow-mouth" };
// Ada wins initiative and fells the goblin with one critical hit.
const WIN_THE_HALL = [
  { type: "begin" },
  { type: "move", destinationId: "burial-hall" },
  { type: "attack", actorId: "pc", targetId: "barrow-goblin" },
];
const WIN_DICE = () => dice(20, 1, 20, 6, 6);
const LOOT = [
  { type: "examine", targetId: "stone-bier" },
  { type: "take", itemId: "silver-torc" },
  { type: "move", destinationId: "barrow-mouth" },
];

test("leaving from an exit without treasure ends the adventure empty-handed", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.deepEqual(
    runtime.projectActions(begun).filter(({ action }) => action === "leave"),
    [
      {
        action: "leave",
        target: { id: "barrow-mouth", name: "Barrow Mouth" },
        available: true,
      },
    ],
  );
  const result = runtime.handleAction(begun, LEAVE);
  assert.equal(result.state.status, "escaped");
  assert.equal(result.state.endingId, "out-empty-handed");
  assert.deepEqual(result.events, [
    {
      type: "ending",
      endingId: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
      text: "You climb back into the daylight with nothing to show for the barrow but dust.",
    },
  ]);
  assert.deepEqual(runtime.projectRewards(result.state), {
    xp: [],
    treasure: [],
  });
  assert.deepEqual(runtime.projectActions(result.state), []);
});

test("treasure found by examining and carried out earns the loot ending, its XP and the fight's", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const won = play(runtime, WIN_THE_HALL, WIN_DICE());
  assert.equal(won.status, "playing");
  // Leaving is offered only at an exit.
  assert.ok(
    !runtime.projectActions(won).some(({ action }) => action === "leave"),
  );
  const examined = runtime.handleAction(won, LOOT[0]);
  assert.deepEqual(examined.events[0].found, ["Silver Torc"]);
  const out = play(runtime, [...WIN_THE_HALL, ...LOOT, LEAVE], WIN_DICE());
  assert.equal(out.status, "escaped");
  assert.equal(out.endingId, "out-with-the-torc");
  assert.deepEqual(runtime.projectRewards(out), {
    xp: [
      {
        id: "robbers-barrow/encounter/barrow-goblin",
        name: "Defeated the Goblin Warrior",
        xp: 50,
      },
      {
        id: "robbers-barrow/ending/out-with-the-torc",
        name: "Out with the silver",
        xp: 250,
      },
    ],
    treasure: [
      {
        id: "robbers-barrow/silver-torc",
        name: "Silver Torc",
        description: "A neck ring of twisted silver, heavy and cold.",
      },
    ],
  });
});

test("a fallen opponent's treasure is found only by searching its body once the fight is won", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const SEARCH = { type: "examine", targetId: "barrow-goblin" };
  // Not before the fight, and not during it.
  const begun = play(runtime, [{ type: "begin" }]);
  assert.equal(
    runtime.handleAction(begun, SEARCH).rejection.code,
    "nothing-to-examine",
  );
  const fighting = play(runtime, WIN_THE_HALL.slice(0, 2), dice(20, 1));
  assert.equal(
    runtime.handleAction(fighting, SEARCH).rejection.code,
    "fighting",
  );
  const won = play(runtime, WIN_THE_HALL, WIN_DICE());
  // Winning drops nothing: the pouch is still on the body.
  assert.deepEqual(won.inventory, []);
  assert.deepEqual(runtime.projectRoom(won).items, []);
  assert.deepEqual(
    runtime
      .projectActions(won)
      .filter(({ action }) => action === "examine")
      .map(({ target }) => target.name),
    ["Stone Bier", "Goblin Warrior's body"],
  );
  const searched = runtime.handleAction(won, SEARCH);
  assert.deepEqual(searched.events, [
    {
      type: "examined",
      targetId: "barrow-goblin",
      name: "Goblin Warrior's body",
      description: "It lies where it fell.",
      found: ["Pouch of Old Coins"],
    },
  ]);
  const body = runtime
    .projectRoom(searched.state)
    .features.find(({ id }) => id === "barrow-goblin");
  assert.equal(body.discovery, "Pouch of Old Coins");
  // Searching again finds nothing new; the pouch must still be taken.
  assert.deepEqual(
    runtime.handleAction(searched.state, SEARCH).events[0].found,
    [],
  );
  const out = play(
    runtime,
    [
      ...WIN_THE_HALL,
      SEARCH,
      { type: "take", itemId: "coin-pouch" },
      { type: "move", destinationId: "barrow-mouth" },
      LEAVE,
    ],
    WIN_DICE(),
  );
  assert.equal(out.endingId, "out-with-the-torc");
  assert.deepEqual(
    runtime.projectRewards(out).treasure.map(({ id }) => id),
    ["robbers-barrow/coin-pouch"],
  );
  // Once kept, the body holds nothing of value.
  const veteran = rewardFighter(sheet, runtime.projectRewards(out));
  const again = createFifthRuntime(barrow, veteran);
  const empty = again.handleAction(
    play(again, WIN_THE_HALL, WIN_DICE()),
    SEARCH,
  );
  assert.equal(empty.events[0].discovery, "Nothing of value.");
  assert.deepEqual(empty.events[0].found, []);
});

test("treasure and XP already earned are not found or awarded again", () => {
  const first = createFifthRuntime(barrow, sheet);
  const out = play(first, [...WIN_THE_HALL, ...LOOT, LEAVE], WIN_DICE());
  const veteran = rewardFighter(sheet, first.projectRewards(out));
  const runtime = createFifthRuntime(barrow, veteran);
  const won = play(runtime, WIN_THE_HALL, WIN_DICE());
  const examined = runtime.handleAction(won, LOOT[0]);
  assert.deepEqual(examined.events[0].found, []);
  assert.deepEqual(runtime.projectRoom(examined.state).items, []);
  assert.equal(
    runtime.handleAction(examined.state, LOOT[1]).rejection.code,
    "no-item",
  );
  const again = play(
    runtime,
    [...WIN_THE_HALL, LOOT[0], LOOT[2], LEAVE],
    WIN_DICE(),
  );
  assert.equal(again.endingId, "out-empty-handed");
  assert.deepEqual(runtime.projectRewards(again), { xp: [], treasure: [] });
});

test("the AI DM is never offered leaving, and cannot call it", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const begun = play(runtime, [{ type: "begin" }]);
  const names = runtime.getGameToolDefinitions(begun).map(({ name }) => name);
  assert.ok(!names.some((name) => /leave|escape|exit/.test(name)), names);
  for (const name of ["leave", "escape"]) {
    const result = runtime.dispatchGameTool(begun, {
      name,
      argumentsJson: JSON.stringify({ room: "barrow-mouth" }),
    });
    assert.equal(result.state, begun);
    assert.deepEqual(result.modelOutput.error, { code: "unknown-tool" });
  }
});

test("leaving is refused away from an exit, for another room and in a fight", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.equal(
    runtime.handleAction(begun, { type: "leave", roomId: "burial-hall" })
      .rejection.code,
    "not-here",
  );
  const fighting = play(runtime, WIN_THE_HALL.slice(0, 2), dice(20, 1));
  assert.equal(
    runtime.handleAction(fighting, { type: "leave", roomId: "burial-hall" })
      .rejection.code,
    "fighting",
  );
  const won = play(runtime, WIN_THE_HALL, WIN_DICE());
  assert.equal(
    runtime.handleAction(won, { type: "leave", roomId: "burial-hall" })
      .rejection.code,
    "not-an-exit",
  );
});

test("a victory credits the fight that ended it; a defeat or an unfinished adventure credits nothing", () => {
  const runtime = createFifthRuntime(cellar, sheet);
  const won = play(
    runtime,
    [{ type: "begin" }, { type: "attack", actorId: "pc", targetId: "goblin" }],
    dice(20, 1, 20, 6, 6),
  );
  assert.equal(won.status, "victory");
  assert.deepEqual(runtime.projectRewards(won), {
    xp: [
      {
        id: "cellar-goblin/encounter/cellar-goblin",
        name: "Defeated the Goblin Warrior",
        xp: 50,
      },
    ],
    treasure: [],
  });
  const begun = play(runtime, [{ type: "begin" }], dice(20, 1));
  assert.equal(runtime.projectRewards(begun), undefined);
  // The goblin wins initiative and hits until Ada drops.
  let state = play(runtime, [{ type: "begin" }], dice(1, 20, 20, 6, 6));
  while (state.status === "playing") {
    state = runtime.handleAction(
      state,
      { type: "end-turn", actorId: "pc" },
      dice(20, 6, 6, 20, 6, 6),
    ).state;
  }
  assert.equal(state.status, "defeat");
  assert.equal(runtime.projectRewards(state), undefined);
});

test("a level 2 Fighter from the barrow reaches level 3 by escaping the goblin warren with its hoard", () => {
  const warren = adventures.find(({ id }) => id === "goblin-warren");
  assert.deepEqual(warren.recommendedLevels, { min: 2, max: 3 });
  // The barrow's 300 XP makes Ada level 2.
  const veteran = rewardFighter(sheet, {
    xp: [
      { id: "robbers-barrow/encounter/barrow-goblin", name: "Goblin", xp: 50 },
      { id: "robbers-barrow/ending/out-with-the-torc", name: "Out", xp: 250 },
    ],
    treasure: [],
  });
  assert.equal(veteran.level, 2);
  const runtime = createFifthRuntime(warren, veteran);
  const fightThrough = (state, random) => {
    while (state.encounter?.outcome === "ongoing") {
      const [target] = runtime.attackTargets(state);
      state = runtime.handleAction(
        state,
        target === undefined
          ? { type: "end-turn", actorId: "pc" }
          : { type: "attack", actorId: "pc", targetId: target.id },
        random,
      ).state;
    }
    return state;
  };
  const run = (seed) => {
    const random = createSeededRandom(seed);
    const act = (state, action) => {
      const result = runtime.handleAction(state, action, random);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
      return result.state;
    };
    let state = act(runtime.createSession(), { type: "begin" });
    state = fightThrough(
      act(state, { type: "move", destinationId: "guard-tunnel" }),
      random,
    );
    if (state.status !== "playing") {
      return undefined;
    }
    state = fightThrough(
      act(state, { type: "move", destinationId: "boss-hall" }),
      random,
    );
    if (state.status !== "playing") {
      return undefined;
    }
    for (const action of [
      { type: "examine", targetId: "crate-throne" },
      { type: "take", itemId: "stolen-coins" },
      { type: "examine", targetId: "goblin-boss" },
      { type: "take", itemId: "boss-chain" },
      { type: "move", destinationId: "guard-tunnel" },
      { type: "move", destinationId: "warren-gate" },
      { type: "leave", roomId: "warren-gate" },
    ]) {
      state = act(state, action);
    }
    return state;
  };
  let out;
  for (let seed = 0; out === undefined; seed++) {
    assert.ok(seed < 2000, "no seed wins both warren fights");
    out = run(seed);
  }
  assert.equal(out.endingId, "out-with-the-hoard");
  const rewards = runtime.projectRewards(out);
  assert.deepEqual(
    rewards.xp.map(({ name, xp }) => [name, xp]),
    [
      ["Defeated the Goblin Warrior", 50],
      ["Defeated the Goblin Boss", 200],
      ["Out with the hoard", 400],
    ],
  );
  assert.deepEqual(
    rewards.treasure.map(({ name }) => name),
    ["Sack of Stolen Coins", "Silver Chain of Office"],
  );
  const champion = rewardFighter(veteran, rewards);
  assert.equal(champion.xp, 950);
  assert.equal(champion.level, 3);
  assert.deepEqual(
    levelUpChanges(veteran, champion).features.map(({ name }) => name),
    ["Champion: Improved Critical", "Champion: Remarkable Athlete"],
  );
});

// Engine → storage: the library and the session saves.

async function withLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "rewards-5e-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const data = await library.create(
      "Ada",
      {
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
      },
      started.revision,
    );
    await run(library, data.characters[0].sheet.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The barrow fight's next action: attack, or end the turn once spent. */
const fightStep = (runtime, state) =>
  runtime.attackTargets(state).length > 0
    ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
    : { type: "end-turn", actorId: "pc" };

/** A browser seed whose `number`th session wins the barrow's fight. */
async function winningSeed(library, characterId, number) {
  const { sheet: current } = (await library.read()).characters.find(
    (record) => record.sheet.id === characterId,
  );
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(barrow, current);
    const random = createSeededRandom(sessionSeed(seed, number));
    let state = runtime.createSession();
    for (const action of [
      { type: "begin" },
      { type: "move", destinationId: "burial-hall" },
    ]) {
      state = runtime.handleAction(state, action, random).state;
    }
    while (state.encounter?.outcome === "ongoing") {
      state = runtime.handleAction(
        state,
        fightStep(runtime, state),
        random,
      ).state;
    }
    if (state.status === "playing") {
      return seed;
    }
  }
  throw new Error("no winning seed");
}

/** Starts the barrow, wins its fight, takes the torc if it is there, and returns to the exit. */
async function lootTheBarrow(library, characterId, number) {
  const seed = await winningSeed(library, characterId, number);
  const session = await startFifthAdventure(
    library,
    seed,
    characterId,
    barrow,
    (await library.read()).revision,
  );
  session.act({ type: "move", destinationId: "burial-hall" }, "click");
  while (session.state.encounter?.outcome === "ongoing") {
    session.act(fightStep(session.runtime, session.state), "click");
  }
  session.act({ type: "examine", targetId: "stone-bier" }, "click");
  if (session.runtime.projectRoom(session.state).items.length > 0) {
    session.act({ type: "take", itemId: "silver-torc" }, "click");
  }
  session.act({ type: "move", destinationId: "barrow-mouth" }, "click");
  return session;
}

test("escaping with the torc credits it, the XP and a level once, however often settling is retried", async () => {
  await withLibrary(async (library, characterId) => {
    const session = await lootTheBarrow(library, characterId, 1);
    assert.equal(session.act(LEAVE, "click").result.rejection, undefined);
    await session.persist();
    // A crash here leaves the session ended and the library untouched.
    let record = (await library.read()).characters[0];
    assert.equal(record.session.id, session.id);
    assert.equal(record.sheet.xp, 0);
    // Settling on the next request, after a restart, credits everything.
    const reloaded = await FifthSession.load(session.path, adventures);
    await settleFifthSession(library, reloaded);
    record = (await library.read()).characters[0];
    assert.equal(record.session, undefined);
    assert.equal(record.sheet.xp, 300);
    assert.equal(record.sheet.level, 2);
    assert.equal(record.sheet.hp, fighterProfile(record.sheet).maxHp);
    assert.deepEqual(
      record.sheet.treasure.map(({ id }) => id),
      ["robbers-barrow/silver-torc"],
    );
    // Settling again writes nothing.
    const bytes = await readFile(library.path);
    await settleFifthSession(library, reloaded);
    await settleFifthSession(library, session);
    assert.deepEqual(await readFile(library.path), bytes);

    // Playing the barrow again finds no torc and earns nothing.
    const again = await lootTheBarrow(library, characterId, 2);
    assert.deepEqual(again.state.inventory, []);
    again.act(LEAVE, "click");
    assert.equal(again.state.endingId, "out-empty-handed");
    await again.persist();
    await settleFifthSession(library, again);
    const after = (await library.read()).characters[0];
    assert.equal(after.session, undefined);
    assert.equal(after.sheet.xp, 300);
    assert.equal(after.sheet.treasure.length, 1);
  });
});

test("abandoning keeps the character's treasure and XP as they were at the start", async () => {
  await withLibrary(async (library, characterId) => {
    const before = (await library.read()).characters[0].sheet;
    const session = await lootTheBarrow(library, characterId, 1);
    assert.deepEqual(session.state.inventory, ["silver-torc"]);
    await session.persist();
    const data = await library.abandonSession(
      characterId,
      (await library.read()).revision,
    );
    assert.equal(data.characters[0].session, undefined);
    assert.deepEqual(data.characters[0].sheet, before);
    await assert.rejects(
      library.abandonSession(characterId, data.revision),
      /Ada is not on an adventure/,
    );
    await assert.rejects(
      library.abandonSession(characterId, "0".repeat(32)),
      /stale/,
    );
    // The abandoned session can no longer be settled into the library.
    session.act(LEAVE, "click");
    await settleFifthSession(library, session);
    assert.deepEqual((await library.read()).characters[0].sheet, before);
  });
});

test("a defeat with treasure in hand keeps nothing and ends the character", async () => {
  await withLibrary(async (library, characterId) => {
    const before = (await library.read()).characters[0].sheet;
    const session = await lootTheBarrow(library, characterId, 1);
    // Fall on the way out: the ended state, as a defeat leaves it.
    session.state = {
      ...session.state,
      status: "defeat",
      endingId: "fallen-in-the-barrow",
    };
    await settleFifthSession(library, session);
    const record = (await library.read()).characters[0];
    assert.equal(record.defeated, true);
    assert.equal(record.sheet.hp, 0);
    assert.equal(record.sheet.xp, before.xp);
    assert.deepEqual(record.sheet.treasure, before.treasure);
  });
});

/** Posts to the browser server as its own page would. */
async function post(url, path, body) {
  const response = await fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("abandoning an escape that was never settled records it instead; an unreadable session can still be abandoned", async () => {
  await withLibrary(async (library, characterId) => {
    const session = await lootTheBarrow(library, characterId, 1);
    session.act(LEAVE, "click");
    // A crash after the session save, before the library write.
    await session.persist();
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 7,
    });
    try {
      const refused = await post(server.url, "/api/5e/adventures/abandon", {
        revision: (await library.read()).revision,
        characterId,
      });
      assert.equal(refused.status, 409);
      assert.match(
        refused.body.error,
        /already ended; its ending is now recorded/,
      );
      let record = (await library.read()).characters[0];
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, 300);

      // A session file this build cannot read is abandoned, crediting nothing.
      const next = await lootTheBarrow(library, characterId, 2);
      await writeFile(next.path, "{");
      const abandoned = await post(server.url, "/api/5e/adventures/abandon", {
        revision: (await library.read()).revision,
        characterId,
      });
      assert.equal(abandoned.status, 200);
      record = (await library.read()).characters[0];
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, 300);
    } finally {
      await server.close();
    }
  });
});
