// #208: find coin and carry it out. Coin is copper, silver and gold, held as
// copper in the character's purse and shown in mixed denominations. Modules
// hide it in features and on opponents' bodies; it is found once, usable at
// once in the adventure, and kept only on surviving completion.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { formatCoins } from "../dist/equipment-5e.js";
import {
  buildFighter,
  settleFighter,
  validateFighter,
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
const barrowFile = JSON.parse(
  await readFile(
    new URL("../adventures/5e/robbers-barrow.json", import.meta.url),
  ),
);
const changed = (change) => {
  const copy = structuredClone(barrowFile);
  change(copy);
  return copy;
};
const hall = (module) => module.rooms.find(({ id }) => id === "burial-hall");
const pouchOf = (module) =>
  hall(module).items.find(({ id }) => id === "coin-pouch");

const POUCH = 250; // 2 gp 5 sp
const POUCH_ID = "robbers-barrow/coin-pouch";

// Str 16 (+3), Dex 12 (+1), Con 14 (+2): the rewards tests' Ada.
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
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  },
);

function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

function play(runtime, actions, random) {
  let state = runtime.createSession();
  for (const action of actions) {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

// Ada wins initiative and fells the goblin with one critical hit.
const WIN_THE_HALL = [
  { type: "begin" },
  { type: "move", destinationId: "burial-hall" },
  { type: "attack", actorId: "pc", targetId: "barrow-goblin" },
];
const WIN_DICE = () => dice(20, 1, 20, 6, 6);
const SEARCH_BODY = { type: "examine", targetId: "barrow-goblin" };
const TAKE_POUCH = { type: "take", itemId: "coin-pouch" };
const OUT = { type: "move", destinationId: "barrow-mouth" };
const LEAVE = { type: "leave", roomId: "barrow-mouth" };

test("coin is shown in mixed denominations from copper", () => {
  assert.equal(formatCoins(0), "0 cp");
  assert.equal(formatCoins(7), "7 cp");
  assert.equal(formatCoins(340), "3 gp 4 sp");
  assert.equal(formatCoins(1234), "12 gp 3 sp 4 cp");
});

test("the barrow's goblin carries coin, authored in gold and silver", () => {
  assert.deepEqual(pouchOf(barrow), {
    id: "coin-pouch",
    name: "Pouch of Old Coins",
    description:
      "A greasy leather pouch of tarnished coins, robbed from the barrow's dead.",
    kind: "coin",
    coins: { gp: 2, sp: 5 },
    hiddenIn: "barrow-goblin",
  });
});

test("the validator rejects coin that is not hidden in a feature or carried by an opponent", () => {
  assert.throws(
    () => validateFifthAdventure(changed((m) => delete pouchOf(m).hiddenIn)),
    /room 2 item 2 is coin, so it must be hidden in a feature or carried by an opponent\./,
  );
  assert.throws(
    () =>
      validateFifthAdventure(
        changed((m) => (pouchOf(m).hiddenIn = "the-floor")),
      ),
    /hidden in unknown feature the-floor/,
  );
});

test("the validator rejects coin without an amount, and an amount on anything else", () => {
  for (const [change, message] of [
    [(m) => delete pouchOf(m).coins, /item 2 is coin, so it needs coins/],
    [(m) => (pouchOf(m).coins = {}), /coins must hold at least one coin/],
    [
      (m) => (pouchOf(m).coins = { gp: 0, sp: 0 }),
      /coins must hold at least one coin/,
    ],
    [(m) => (pouchOf(m).coins = { pp: 1 }), /coins may have only gp, sp, cp/],
    [(m) => (pouchOf(m).coins = { gp: -1 }), /coins gp must be an integer/],
    [(m) => (pouchOf(m).coins = { sp: 1.5 }), /coins sp must be an integer/],
    [(m) => (pouchOf(m).kind = "treasure"), /only coin has coins/],
  ]) {
    assert.throws(() => validateFifthAdventure(changed(change)), message);
  }
});

test("coin alone is loot: an exit with only coin to find needs its escape-with-loot ending", () => {
  const coinOnly = changed((m) => {
    hall(m).items = hall(m).items.filter(({ kind }) => kind === "coin");
  });
  assert.doesNotThrow(() => validateFifthAdventure(coinOnly));
  assert.throws(
    () =>
      validateFifthAdventure(
        changed((m) => {
          hall(m).items = hall(m).items.filter(({ kind }) => kind === "coin");
          m.endings = m.endings.filter(
            ({ kind }) => kind !== "escape-with-loot",
          );
        }),
      ),
    /an exit with treasure or coin to find needs an escape-with-loot ending/,
  );
});

test("an older module file is refused with a message naming the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-208-"));
  try {
    const path = join(directory, "older-barrow.json");
    const bytes = JSON.stringify({ ...barrowFile, formatVersion: 5 });
    await writeFile(path, bytes);
    await assert.rejects(
      loadFifthAdventure(path),
      /older-barrow\.json is a 5e adventure module in format version 5, not 7\. Move it aside/,
    );
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("coin looted from a body goes into the purse at once, not the pack", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const won = play(runtime, WIN_THE_HALL, WIN_DICE());
  assert.equal(won.possessions.purse, 0);
  assert.equal(runtime.projectRoom(won).purse, undefined);
  assert.equal(runtime.projectCharacterStatus(won).purse, "0 cp");
  const searched = runtime.handleAction(won, SEARCH_BODY);
  assert.deepEqual(searched.events[0].found, ["Pouch of Old Coins"]);
  assert.deepEqual(runtime.projectRoom(searched.state).items, [
    {
      id: "coin-pouch",
      name: "Pouch of Old Coins",
      description:
        "A greasy leather pouch of tarnished coins, robbed from the barrow's dead.",
    },
  ]);
  const taken = runtime.handleAction(searched.state, TAKE_POUCH);
  assert.deepEqual(taken.events, [
    {
      type: "taken",
      itemId: "coin-pouch",
      name: "Pouch of Old Coins",
      coin: POUCH,
    },
  ]);
  assert.equal(
    runtime.renderResult(taken),
    "You take the Pouch of Old Coins and put 2 gp 5 sp in your purse.",
  );
  assert.equal(taken.state.possessions.purse, POUCH);
  assert.deepEqual(taken.state.inventory, []);
  const room = runtime.projectRoom(taken.state);
  assert.deepEqual(room.items, []);
  assert.deepEqual(room.inventory, []);
  assert.equal(room.purse, "2 gp 5 sp");
  assert.equal(runtime.projectCharacterStatus(taken.state).purse, "2 gp 5 sp");
  // It cannot be taken twice.
  assert.equal(
    runtime.handleAction(taken.state, TAKE_POUCH).rejection.code,
    "no-item",
  );
  // The body still says what it held.
  assert.equal(
    room.features.find(({ id }) => id === "barrow-goblin").discovery,
    "Pouch of Old Coins",
  );
});

test("carrying coin out is escaping with loot; the settlement keeps the purse and records the find", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const out = play(
    runtime,
    [...WIN_THE_HALL, SEARCH_BODY, TAKE_POUCH, OUT, LEAVE],
    WIN_DICE(),
  );
  assert.equal(out.endingId, "out-with-the-torc");
  const settlement = runtime.projectSettlement(out);
  assert.equal(settlement.possessions.purse, POUCH);
  assert.deepEqual(settlement.finds, []);
  assert.deepEqual(settlement.coin, [{ id: POUCH_ID, copper: POUCH }]);
  const after = settleFighter(sheet, settlement);
  assert.equal(after.purse, POUCH);
  assert.deepEqual(after.treasure, []);
  assert.deepEqual(after.finds, [POUCH_ID]);
  assert.deepEqual(settleFighter(after, settlement), after);

  // Found once: the body holds nothing of value next time, and the purse
  // comes along into the next adventure.
  const again = createFifthRuntime(barrow, after);
  const won = play(again, WIN_THE_HALL, WIN_DICE());
  assert.equal(won.possessions.purse, POUCH);
  const empty = again.handleAction(won, SEARCH_BODY);
  assert.deepEqual(empty.events[0].found, []);
  assert.equal(empty.events[0].discovery, "Nothing of value.");
  const left = play(
    again,
    [...WIN_THE_HALL, SEARCH_BODY, OUT, LEAVE],
    WIN_DICE(),
  );
  assert.equal(left.endingId, "out-empty-handed");
  const nothing = again.projectSettlement(left);
  assert.deepEqual(nothing.coin, []);
  assert.equal(settleFighter(after, nothing).purse, POUCH);
});

test("the AI DM cannot narrate coin into existence: take only reveals authored coin it lists", () => {
  const runtime = createFifthRuntime(barrow, sheet);
  const won = play(runtime, WIN_THE_HALL, WIN_DICE());
  // Before the body is searched, no coin is offered or takeable.
  const offered = (state) =>
    runtime.getGameToolDefinitions(state).find(({ name }) => name === "take");
  assert.equal(offered(won), undefined);
  for (const item of ["coin-pouch", "gold", "pouch-of-100-gp"]) {
    const refused = runtime.dispatchGameTool(won, {
      name: "take",
      argumentsJson: JSON.stringify({ item }),
    });
    assert.equal(refused.state, won);
    assert.equal(refused.modelOutput.ok, false);
  }
  const searched = runtime.handleAction(won, SEARCH_BODY).state;
  assert.deepEqual(offered(searched).parameters.properties.item.enum, [
    "coin-pouch",
  ]);
  // The tool takes an id, never an amount: the engine decides how much.
  assert.deepEqual(Object.keys(offered(searched).parameters.properties), [
    "item",
  ]);
  const taken = runtime.dispatchGameTool(searched, {
    name: "take",
    argumentsJson: JSON.stringify({ item: "coin-pouch" }),
  });
  assert.equal(taken.state.possessions.purse, POUCH);
  assert.equal(taken.modelOutput.events[0].coin, POUCH);
  const status = runtime.dispatchGameTool(taken.state, {
    name: "get_character_status",
    argumentsJson: "{}",
  });
  assert.equal(status.modelOutput.status.purse, "2 gp 5 sp");
});

test("a sheet's purse is a whole number of copper, and new characters start with none", () => {
  assert.equal(sheet.purse, 0);
  for (const purse of [-1, 1.5, "10", undefined]) {
    assert.throws(() => validateFighter({ ...sheet, purse }), /purse/i);
  }
  assert.equal(validateFighter({ ...sheet, purse: 12345 }).purse, 12345);
});

// Engine → storage.

async function withLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-208-"));
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
        kit: "mace",
        masteries: ["dagger", "mace", "shortsword"],
      },
      started.revision,
    );
    assert.equal(data.characters[0].sheet.purse, 0);
    await run(library, data.characters[0].sheet.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const fightStep = (runtime, state) =>
  runtime.attackTargets(state).length > 0
    ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
    : { type: "end-turn", actorId: "pc" };

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

/** Starts the barrow, wins its fight, loots the body if it holds coin, and returns to the exit. */
async function lootTheGoblin(library, characterId, number) {
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
  session.act(SEARCH_BODY, "click");
  if (session.runtime.projectRoom(session.state).items.length > 0) {
    session.act(TAKE_POUCH, "click");
  }
  session.act(OUT, "click");
  return session;
}

const ada = async (library) => (await library.read()).characters[0];

test("escaping with coin keeps it once; an interruption between the session and library writes never duplicates or loses it", async () => {
  await withLibrary(async (library, characterId) => {
    const session = await lootTheGoblin(library, characterId, 1);
    assert.equal(session.state.possessions.purse, POUCH);
    session.act(LEAVE, "click");
    await session.persist();
    // A crash here: the session has ended, the library still names it.
    assert.equal((await ada(library)).sheet.purse, 0);
    const reloaded = await FifthSession.load(session.path, adventures);
    assert.equal(reloaded.state.possessions.purse, POUCH);
    await settleFifthSession(library, reloaded);
    await settleFifthSession(library, reloaded);
    await settleFifthSession(library, session);
    let record = await ada(library);
    assert.equal(record.session, undefined);
    assert.equal(record.sheet.purse, POUCH);
    assert.deepEqual(record.sheet.finds, [POUCH_ID]);

    // The same adventure again finds no coin; the purse is carried in and out.
    const again = await lootTheGoblin(library, characterId, 2);
    assert.equal(again.state.possessions.purse, POUCH);
    again.act(LEAVE, "click");
    assert.equal(again.state.endingId, "out-empty-handed");
    await again.persist();
    await settleFifthSession(library, again);
    record = await ada(library);
    assert.equal(record.sheet.purse, POUCH);
  });
});

test("defeat and abandonment leave the purse as it was at the start", async () => {
  await withLibrary(async (library, characterId) => {
    const first = await lootTheGoblin(library, characterId, 1);
    first.act(LEAVE, "click");
    await first.persist();
    await settleFifthSession(library, first);
    const before = (await ada(library)).sheet;
    assert.equal(before.purse, POUCH);

    // Coin spent or gained mid-adventure is forgotten on abandonment.
    const abandoned = await lootTheGoblin(library, characterId, 2);
    abandoned.state = {
      ...abandoned.state,
      possessions: { ...abandoned.state.possessions, purse: 9999 },
    };
    await abandoned.persist();
    const data = await library.abandonSession(
      characterId,
      (await library.read()).revision,
    );
    assert.deepEqual(data.characters[0].sheet, before);

    const fallen = await lootTheGoblin(library, characterId, 3);
    fallen.state = {
      ...fallen.state,
      possessions: { ...fallen.state.possessions, purse: 0 },
      status: "defeat",
      endingId: "fallen-in-the-barrow",
    };
    await settleFifthSession(library, fallen);
    const record = await ada(library);
    assert.equal(record.defeated, true);
    assert.deepEqual(record.sheet, { ...before, hp: 0 });
  });
});
