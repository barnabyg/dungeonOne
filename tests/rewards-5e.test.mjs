import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  characterProfile,
  levelUpChanges,
  settleCharacter,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  FifthSession,
  settleFifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";
import {
  goblinBurrow,
  lintelBarrow as barrow,
  loneGoblin as cellar,
} from "./fixtures/modules.mjs";
import { archeryBarrow } from "./fixtures/archery-barrow.mjs";
import { armouryBarrow } from "./fixtures/armoury-barrow.mjs";
import {
  barrowFightStep,
  playSession,
  winBarrowSeed,
  WIN_THE_BURIAL_HALL,
  withLibrary,
} from "./fixtures/library.mjs";
import { marketBarrow } from "./fixtures/market-barrow.mjs";

const adventures = [barrow];
// Str 16 (+3), Dex 12 (+1), Con 14 (+2): AC 17 with Defense, 12 HP, mace +5.
const sheet = buildCharacter(
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
  assert.deepEqual(runtime.projectSettlement(result.state), {
    possessions: {
      equipment: ["leather", "mace"],
      stowed: [],
      ammunition: { arrows: 0, bolts: 0 },
      treasure: [],
      purse: 0,
    },
    xp: [],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
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
  const torc = {
    id: "lintel-barrow/silver-torc",
    name: "Silver Torc",
    description: "A neck ring of twisted silver, heavy and cold.",
    value: 2500,
  };
  assert.deepEqual(runtime.projectSettlement(out), {
    possessions: {
      equipment: ["leather", "mace"],
      stowed: [],
      ammunition: { arrows: 0, bolts: 0 },
      treasure: [torc],
      purse: 0,
    },
    xp: [
      {
        id: "lintel-barrow/encounter/barrow-goblin",
        name: "Defeated the Goblin Warrior",
        xp: 50,
      },
      {
        id: "lintel-barrow/ending/out-with-the-torc",
        name: "Out with the silver",
        xp: 250,
      },
    ],
    finds: [torc],
    sold: [],
    coin: [],
    gear: [],
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
    runtime.projectSettlement(out).coin.map(({ id }) => id),
    ["lintel-barrow/coin-pouch"],
  );
});

test("treasure and XP already earned are not found or awarded again", () => {
  const first = createFifthRuntime(barrow, sheet);
  const out = play(first, [...WIN_THE_HALL, ...LOOT, LEAVE], WIN_DICE());
  const veteran = settleCharacter(sheet, first.projectSettlement(out));
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
  const settled = runtime.projectSettlement(again);
  assert.deepEqual(settled.xp, []);
  assert.deepEqual(settled.finds, []);
  // The torc it already holds is still held.
  assert.deepEqual(settled.possessions.treasure, veteran.treasure);
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
  assert.deepEqual(runtime.projectSettlement(won), {
    possessions: {
      equipment: ["leather", "mace"],
      stowed: [],
      ammunition: { arrows: 0, bolts: 0 },
      treasure: [],
      purse: 0,
    },
    xp: [
      {
        id: "lone-goblin/encounter/lone-goblin",
        name: "Defeated the Goblin Warrior",
        xp: 50,
      },
    ],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });
  const begun = play(runtime, [{ type: "begin" }], dice(20, 1));
  assert.equal(runtime.projectSettlement(begun), undefined);
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
  assert.equal(runtime.projectSettlement(state), undefined);
});

test("a level 2 Fighter from the barrow reaches level 3 by escaping the goblin burrow with its hoard", () => {
  const warren = goblinBurrow;
  assert.deepEqual(warren.recommendedLevels, { min: 2, max: 3 });
  // The barrow's 300 XP makes Ada level 2.
  const veteran = settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: [],
      ammunition: { arrows: 0, bolts: 0 },
      treasure: [],
      purse: 0,
    },
    xp: [
      { id: "lintel-barrow/encounter/barrow-goblin", name: "Goblin", xp: 50 },
      { id: "lintel-barrow/ending/out-with-the-torc", name: "Out", xp: 250 },
    ],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
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
  const rewards = runtime.projectSettlement(out);
  assert.deepEqual(
    rewards.xp.map(({ name, xp }) => [name, xp]),
    [
      ["Defeated the Goblin Warrior", 50],
      ["Defeated the Goblin Boss", 200],
      ["Out with the hoard", 400],
    ],
  );
  assert.deepEqual(
    rewards.finds.map(({ name }) => name),
    ["Silver Chain of Office"],
  );
  // The sack of stolen coins (9 gp 6 sp) goes into the purse.
  assert.deepEqual(rewards.coin, [
    { id: "goblin-burrow/stolen-coins", copper: 960 },
  ]);
  assert.equal(rewards.possessions.purse, 960);
  const champion = settleCharacter(veteran, rewards);
  assert.equal(champion.xp, 950);
  assert.equal(champion.level, 3);
  assert.deepEqual(
    levelUpChanges(veteran, champion).features.map(({ name }) => name),
    ["Champion: Improved Critical", "Champion: Remarkable Athlete"],
  );
});

// Engine → storage: the library and the session saves.

/** Starts the barrow, wins its fight, takes the torc if it is there, and returns to the exit. */
async function lootTheBarrow(library, characterId, number) {
  const { sheet: current } = (await library.read()).characters[0];
  const seed = winBarrowSeed(barrow, current, number);
  const session = await startFifthAdventure(
    library,
    seed,
    characterId,
    barrow,
    (await library.read()).revision,
  );
  session.act({ type: "move", destinationId: "burial-hall" }, "click");
  while (session.state.encounter?.outcome === "ongoing") {
    session.act(barrowFightStep(session.runtime, session.state), "click");
  }
  session.act({ type: "examine", targetId: "stone-bier" }, "click");
  if (session.runtime.projectRoom(session.state).items.length > 0) {
    session.act({ type: "take", itemId: "silver-torc" }, "click");
  }
  session.act({ type: "move", destinationId: "barrow-mouth" }, "click");
  return session;
}

test("escaping with the torc credits it, the XP and a level once, however often settling is retried", async () => {
  await withLibrary(async (library, { id: characterId }) => {
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
    assert.equal(record.sheet.hp, characterProfile(record.sheet).maxHp);
    assert.deepEqual(
      record.sheet.treasure.map(({ id }) => id),
      ["lintel-barrow/silver-torc"],
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
  await withLibrary(async (library, { id: characterId }) => {
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
  await withLibrary(async (library, { id: characterId }) => {
    const session = await lootTheBarrow(library, characterId, 1);
    session.act(LEAVE, "click");
    // A crash after the session save, before the library write.
    await session.persist();
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 7,
      adventures: [barrow],
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

// Replace-on-settle (#206): the session holds the character's possessions,
// and a surviving ending replaces them with what it holds at the end.

const TORC_ID = "lintel-barrow/silver-torc";
const GEM = {
  id: "sealed-crypt/river-pearl",
  name: "River Pearl",
  description: "A grey pearl the size of a thumbnail.",
  value: 5000,
};

/** Ada after escaping the barrow with the torc. */
function torcBearer() {
  const first = createFifthRuntime(barrow, sheet);
  const out = play(first, [...WIN_THE_HALL, ...LOOT, LEAVE], WIN_DICE());
  return settleCharacter(sheet, first.projectSettlement(out));
}

test("an adventure starts holding the character's equipment and kept treasure (#206)", () => {
  const veteran = torcBearer();
  assert.deepEqual(veteran.finds, [TORC_ID]);
  const runtime = createFifthRuntime(cellar, veteran);
  assert.deepEqual(runtime.createSession().possessions, {
    equipment: ["leather", "mace"],
    stowed: [],
    ammunition: { arrows: 0, bolts: 0 },
    treasure: veteran.treasure,
    purse: 0,
  });
});

test("settling replaces possessions: an item gone from the holdings is gone, one added is kept, and finds stay earned (#206)", () => {
  const veteran = torcBearer();
  const runtime = createFifthRuntime(barrow, veteran);
  const begun = play(runtime, [{ type: "begin" }]);
  const holding = (treasure) => ({
    ...begun,
    possessions: { ...begun.possessions, treasure },
  });

  const without = runtime.handleAction(holding([]), LEAVE).state;
  const lost = settleCharacter(veteran, runtime.projectSettlement(without));
  assert.deepEqual(lost.treasure, []);
  assert.deepEqual(lost.finds, [TORC_ID]);
  assert.equal(lost.xp, veteran.xp);
  // The torc was found once, so it is not there to find again.
  const again = createFifthRuntime(barrow, lost);
  const examined = again.handleAction(
    play(again, WIN_THE_HALL, WIN_DICE()),
    LOOT[0],
  );
  assert.deepEqual(examined.events[0].found, []);

  const added = runtime.handleAction(
    holding([...begun.possessions.treasure, GEM]),
    LEAVE,
  ).state;
  const settlement = runtime.projectSettlement(added);
  // Holding something is not finding it: nothing new is earned or shown.
  assert.deepEqual(settlement.finds, []);
  const kept = settleCharacter(veteran, settlement);
  assert.deepEqual(
    kept.treasure.map(({ id }) => id),
    [TORC_ID, GEM.id],
  );
  assert.deepEqual(kept.finds, [TORC_ID]);
});

test("a surviving ending keeps treasure brought in beside coin found (#206, #208)", () => {
  const veteran = torcBearer();
  const runtime = createFifthRuntime(barrow, veteran);
  const out = play(
    runtime,
    [
      ...WIN_THE_HALL,
      { type: "examine", targetId: "barrow-goblin" },
      { type: "take", itemId: "coin-pouch" },
      { type: "move", destinationId: "barrow-mouth" },
      LEAVE,
    ],
    WIN_DICE(),
  );
  const settlement = runtime.projectSettlement(out);
  assert.deepEqual(
    settlement.coin.map(({ id }) => id),
    ["lintel-barrow/coin-pouch"],
  );
  const after = settleCharacter(veteran, settlement);
  assert.deepEqual(
    after.treasure.map(({ id }) => id),
    [TORC_ID],
  );
  assert.equal(after.purse, 250);
  assert.deepEqual(after.finds, [TORC_ID, "lintel-barrow/coin-pouch"]);
  // Settling the same ending again changes nothing.
  assert.deepEqual(settleCharacter(after, settlement), after);
});

/**
 * At the archers' barrow's mouth: changes the worn and held gear, sells the
 * torc, buys a bow and draws it, sells the arrows, and drops the mace.
 */
const CHANGE_EVERY_POSSESSION = [
  { type: "equip", itemId: "leather" },
  { type: "sell-treasure", itemId: "archery-barrow/silver-torc" },
  { type: "buy", itemId: "shortbow" },
  { type: "swap", itemId: "shortbow" },
  { type: "sell", itemId: "arrows" },
  { type: "drop", itemId: "mace" },
];

test("abandonment restores the sheet from the start exactly, and defeat restores it at 0 HP, whatever possessions changed (#206)", async () => {
  await withLibrary(async (library, { id: characterId }) => {
    // A first escape leaves Ada holding something of every kind.
    const first = await playSession(library, archeryBarrow, [
      { type: "examine", targetId: "scratched-lintel" },
      { type: "take", itemId: "lintel-quiver" },
      WIN_THE_BURIAL_HALL,
      { type: "examine", targetId: "stone-bier" },
      { type: "take", itemId: "silver-torc" },
      { type: "examine", targetId: "barrow-goblin" },
      { type: "take", itemId: "coin-pouch" },
      { type: "move", destinationId: "barrow-mouth" },
      { type: "unequip", itemId: "leather" },
      { type: "buy", itemId: "bolts" },
      LEAVE,
    ]);
    await first.persist();
    await settleFifthSession(library, first);
    const before = (await library.read()).characters[0].sheet;
    assert.deepEqual(
      {
        equipment: before.equipment,
        stowed: before.stowed,
        ammunition: before.ammunition,
        treasure: before.treasure.map(({ id }) => id),
        purse: before.purse,
        xp: before.xp,
      },
      {
        equipment: ["mace"],
        stowed: ["leather"],
        ammunition: { arrows: 20, bolts: 20 },
        treasure: ["archery-barrow/silver-torc"],
        purse: 150,
        xp: 300,
      },
    );

    /** Plays the changes; the session then differs from the sheet in every possession. */
    const changeEverything = async () => {
      const session = await playSession(
        library,
        archeryBarrow,
        CHANGE_EVERY_POSSESSION,
      );
      for (const [field, held] of Object.entries(session.state.possessions)) {
        assert.notDeepEqual(held, before[field], field);
      }
      assert.deepEqual(session.state.dropped, [
        { roomId: "barrow-mouth", item: "mace" },
      ]);
      return session;
    };

    const abandoned = await changeEverything();
    await abandoned.persist();
    const data = await library.abandonSession(
      characterId,
      (await library.read()).revision,
    );
    assert.deepEqual(data.characters[0].sheet, before);

    const fallen = await changeEverything();
    fallen.state = {
      ...fallen.state,
      status: "defeat",
      endingId: "fallen-in-the-barrow",
    };
    await settleFifthSession(library, fallen);
    const record = (await library.read()).characters[0];
    assert.equal(record.defeated, true);
    assert.deepEqual(record.sheet, { ...before, hp: 0 });
  });
});

/**
 * Escapes played in turn by one Ada, each carrying the last one's
 * possessions in, and the sheet each leaves: `treasure` lists ids.
 */
const ESCAPES = [
  {
    name: "treasure and coin from the burial hall",
    module: barrow,
    actions: [
      WIN_THE_BURIAL_HALL,
      { type: "examine", targetId: "stone-bier" },
      { type: "take", itemId: "silver-torc" },
      { type: "examine", targetId: "barrow-goblin" },
      { type: "take", itemId: "coin-pouch" },
      { type: "move", destinationId: "barrow-mouth" },
      LEAVE,
    ],
    sheet: {
      equipment: ["leather", "mace"],
      stowed: [],
      treasure: [TORC_ID],
      purse: 250,
      finds: [TORC_ID, "lintel-barrow/coin-pouch"],
      xp: 300,
    },
  },
  {
    name: "gear found and wielded, and the mace dropped",
    module: armouryBarrow,
    actions: [
      { type: "examine", targetId: "scratched-lintel" },
      { type: "take", itemId: "lintel-longsword" },
      { type: "swap", itemId: "longsword" },
      { type: "drop", itemId: "mace" },
      LEAVE,
    ],
    sheet: {
      equipment: ["leather", "longsword"],
      stowed: [],
      treasure: [TORC_ID],
      purse: 250,
      finds: [
        TORC_ID,
        "lintel-barrow/coin-pouch",
        "lintel-barrow/lintel-longsword",
      ],
      xp: 300,
    },
  },
  {
    name: "armour sold and a dagger bought",
    module: marketBarrow,
    actions: [
      { type: "sell", itemId: "leather", equipped: true },
      { type: "buy", itemId: "dagger" },
      LEAVE,
    ],
    sheet: {
      equipment: ["longsword"],
      stowed: ["dagger"],
      treasure: [TORC_ID],
      purse: 550,
      finds: [
        TORC_ID,
        "lintel-barrow/coin-pouch",
        "lintel-barrow/lintel-longsword",
      ],
      xp: 300,
    },
  },
];

test("an interruption between the session and library writes never duplicates or loses what an escape holds (#206)", async () => {
  await withLibrary(async (library) => {
    for (const { name, module, actions, sheet } of ESCAPES) {
      const session = await playSession(library, module, actions);
      assert.equal(session.state.status, "escaped", name);
      const before = (await library.read()).characters[0];
      await session.persist();
      // A crash here: the session has ended, the library still names it.
      const crashed = (await library.read()).characters[0];
      assert.equal(crashed.session.id, session.id, name);
      assert.deepEqual(crashed.sheet, before.sheet, name);
      const reloaded = await FifthSession.load(session.path, [module]);
      assert.deepEqual(reloaded.state, session.state, name);
      await settleFifthSession(library, reloaded);
      await settleFifthSession(library, reloaded);
      await settleFifthSession(library, session);
      const after = (await library.read()).characters[0];
      assert.equal(after.session, undefined, name);
      assert.deepEqual(
        {
          equipment: after.sheet.equipment,
          stowed: after.sheet.stowed,
          treasure: after.sheet.treasure.map(({ id }) => id),
          purse: after.sheet.purse,
          finds: after.sheet.finds,
          xp: after.sheet.xp,
        },
        sheet,
        name,
      );
    }
  });
});

test("a surviving ending cannot be settled without what the character holds (#206)", async () => {
  await withLibrary(async (library, { id: characterId }) => {
    const session = await lootTheBarrow(library, characterId, 1);
    const bytes = await readFile(library.path);
    await assert.rejects(
      library.settleSession(characterId, session.id, "escaped"),
      /needs what the character holds/,
    );
    assert.deepEqual(await readFile(library.path), bytes);
  });
});
