// #507: the loot and economy settings. Treasure found scales coin taken and
// a gem or art object's value as found, which the held item keeps (library
// format 27); Scarce items found leaves out potions, gear, scrolls and wands
// with an even chance drawn from the session's seed; merchant prices and
// buy-back change the offers the engine lists; starting coin fills a new
// character's purse when it is saved.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { settleCharacter } from "../dist/character-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import {
  buyItem,
  formatCoins,
  itemPrice,
  merchantPrice,
  salePrice,
  sellItem,
} from "../dist/equipment-5e.js";
import { createSeededRandom } from "../dist/random.js";
import {
  createFifthRuntime,
  scarceCandidateIds,
  scarceItemIds,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import {
  DEFAULT_SETTINGS,
  SETTING_IDS,
  SETTINGS,
} from "../dist/settings-5e.js";
import { TEST_FIGHTER, TEST_FIGHTER_CHOICES } from "../dist/test-fighter-5e.js";
import { scaledTreasure } from "../dist/treasure-5e.js";
import { armouryBarrow } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";
import { gemMarket } from "./fixtures/gem-market.mjs";
import { endTurnOrFall } from "./fixtures/last-stand.mjs";
import { room, snakeDoorFile } from "./fixtures/modules.mjs";

const LOOT_SETTINGS = [
  "treasureFound",
  "itemsFound",
  "merchantPrices",
  "merchantBuyBack",
  "startingCoin",
];

const withSettings = (settings) => ({ ...DEFAULT_SETTINGS, ...settings });

test("the five loot and economy settings follow carrying capacity, each defaulting to today's game", () => {
  assert.deepEqual(
    SETTING_IDS.filter((id) => LOOT_SETTINGS.includes(id)),
    LOOT_SETTINGS,
  );
  assert.ok(
    SETTING_IDS.indexOf("carryingCapacity") <
      SETTING_IDS.indexOf("treasureFound"),
  );
  const offered = Object.fromEntries(
    LOOT_SETTINGS.map((id) => [
      id,
      [SETTINGS[id].choices.map(({ value }) => value), SETTINGS[id].default],
    ]),
  );
  assert.deepEqual(offered, {
    treasureFound: [[50, 75, 100, 150], 100],
    itemsFound: [["normal", "scarce"], "normal"],
    merchantPrices: [[0.5, 0.75, 1, 1.5, 2], 1],
    merchantBuyBack: [[25, 50, 75, 100], 50],
    startingCoin: [[0, 10, 25, 50], 0],
  });
  assert.deepEqual(
    SETTINGS.itemsFound.choices.map(({ label }) => label),
    ["Normal", "Scarce"],
  );
});

test("treasure found scales an amount, rounded down to the copper and at least 1 cp", () => {
  assert.equal(scaledTreasure(250, 100), 250);
  assert.equal(scaledTreasure(250, 200), 500);
  assert.equal(scaledTreasure(250, 50), 125);
  assert.equal(scaledTreasure(5, 50), 2);
  assert.equal(scaledTreasure(3, 150), 4);
  assert.equal(scaledTreasure(1, 50), 1);
});

/** Applies `action`, which the engine must accept. */
function accept(runtime, state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  return result;
}

/**
 * Wins the burial hall's fight on the first dice seed that wins it, searches
 * the goblin's body and takes its pouch of 10 gp, takes the opal from under
 * the bier, and goes back to the pedlar at the mouth. Returns the state and
 * the coin the pouch gave.
 */
function lootHall(runtime) {
  for (let seed = 0; seed < 100; seed++) {
    const random = createSeededRandom(seed);
    const run = (state, action) => accept(runtime, state, action, random);
    let state = run(runtime.createSession(), { type: "begin" }).state;
    state = run(state, { type: "move", destinationId: "burial-hall" }).state;
    while (state.encounter?.outcome === "ongoing") {
      state = run(
        state,
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
          : endTurnOrFall(state),
      ).state;
    }
    if (state.status !== "playing") {
      continue;
    }
    state = run(state, { type: "examine", targetId: "barrow-goblin" }).state;
    const pouch = run(state, { type: "take", itemId: "coin-pouch" });
    state = run(pouch.state, { type: "examine", targetId: "stone-bier" }).state;
    state = run(state, { type: "take", itemId: "blue-opal" }).state;
    state = run(state, { type: "move", destinationId: "barrow-mouth" }).state;
    return { state, coin: pouch.events[0].coin };
  }
  throw new Error("no seed wins the burial hall");
}

const opalOf = (runtime, state) =>
  runtime.projectRoom(state).inventory.find(({ id }) => id === "blue-opal");
const tradeOffers = (runtime, state) =>
  JSON.stringify(
    runtime.getGameToolDefinitions(state).find(({ name }) => name === "trade"),
  );

test("treasure found 150% raises the coin taken and a found gem's value by half, which it keeps in a later adventure at 100%", () => {
  const raised = createFifthRuntime(
    gemMarket,
    TEST_FIGHTER,
    {},
    withSettings({ treasureFound: 150 }),
  );
  const { state, coin } = lootHall(raised);
  // The goblin's pouch holds 10 gp.
  assert.equal(coin, 1500);
  assert.equal(state.possessions.purse, TEST_FIGHTER.purse + 1500);
  assert.equal(opalOf(raised, state).value, "75 gp");
  assert.match(
    tradeOffers(raised, state),
    /sell-treasure:blue-opal \(sell the blue opal for 75 gp\)/,
  );
  const left = accept(raised, state, {
    type: "leave",
    roomId: "barrow-mouth",
  }).state;
  const settlement = raised.projectSettlement(left);
  assert.deepEqual(settlement.coin, [
    { id: "lintel-barrow/coin-pouch", copper: 1500 },
  ]);
  const after = settleCharacter(TEST_FIGHTER, settlement);
  assert.deepEqual(after.treasure, [
    {
      id: "lintel-barrow/blue-opal",
      name: "Blue Opal",
      description: "A milky opal flecked with blue fire.",
      value: 7500,
    },
  ]);

  // At 100% and a quarter's buy-back, it still sells for the value it was
  // found with.
  const later = createFifthRuntime(
    gemMarket,
    after,
    {},
    withSettings({ merchantBuyBack: 25 }),
  );
  const start = accept(later, later.createSession(), { type: "begin" }).state;
  const sold = accept(later, start, {
    type: "sell-treasure",
    itemId: "lintel-barrow/blue-opal",
  });
  assert.equal(sold.state.possessions.purse, after.purse + 7500);

  // At 50%, the pouch gives 5 gp and the opal is worth 25 gp.
  const halved = createFifthRuntime(
    gemMarket,
    TEST_FIGHTER,
    {},
    withSettings({ treasureFound: 50 }),
  );
  const half = lootHall(halved);
  assert.equal(half.coin, 500);
  assert.equal(opalOf(halved, half.state).value, "25 gp");
  const halfSale = accept(halved, half.state, {
    type: "sell-treasure",
    itemId: "blue-opal",
  });
  assert.equal(halfSale.events[0].price, 2500);

  // At 75%, the pouch gives 7 gp 5 sp and the opal is worth 37 gp 5 sp.
  const lessened = createFifthRuntime(
    gemMarket,
    TEST_FIGHTER,
    {},
    withSettings({ treasureFound: 75 }),
  );
  const less = lootHall(lessened);
  assert.equal(less.coin, 750);
  assert.equal(opalOf(lessened, less.state).value, "37 gp 5 sp");
});

test("at the defaults coin and treasure are worth what the module says", () => {
  const runtime = createFifthRuntime(gemMarket, TEST_FIGHTER);
  const { state, coin } = lootHall(runtime);
  assert.equal(coin, 1000);
  assert.equal(opalOf(runtime, state).value, "50 gp");
});

const SCARCE = withSettings({ itemsFound: "scarce" });
const YARD_FINDS = ["yard-dagger", "yard-scroll", "yard-potion", "yard-sword"];

/** The first session seed whose missing items in `module` are `missing`. */
function seedMissing(module, missing) {
  for (let seed = 0; seed < 10_000; seed++) {
    const absent = scarceItemIds(module, seed);
    if (
      absent.size === missing.length &&
      missing.every((id) => absent.has(id))
    ) {
      return seed;
    }
  }
  throw new Error(`no seed misses exactly ${missing.join(", ")}`);
}

test("on Scarce each potion, gear, scroll or wand is missing with an even chance; coin, gems and art never are", () => {
  assert.deepEqual(scarceCandidateIds(findsYard), YARD_FINDS);
  const counts = Object.fromEntries(YARD_FINDS.map((id) => [id, 0]));
  const seeds = 2000;
  for (let seed = 0; seed < seeds; seed++) {
    const absent = scarceItemIds(findsYard, seed);
    // The same seed misses the same items, every time.
    assert.deepEqual(scarceItemIds(findsYard, seed), absent);
    for (const id of absent) {
      counts[id] += 1;
    }
  }
  for (const [id, count] of Object.entries(counts)) {
    assert.ok(count > seeds * 0.45 && count < seeds * 0.55, `${id}: ${count}`);
  }
  // A runtime on Scarce needs the session's seed to draw from.
  assert.throws(() => createFifthRuntime(findsYard, BEA, {}, SCARCE), {
    message: "Scarce items found needs the session's seed.",
  });
});

test("on Scarce an item a door or a feature's use names, or one that sets a flag, is never missing", () => {
  const module = structuredClone(snakeDoorFile);
  // The snake that opens the door is a potion here, and another potion lies
  // in the alcove beside it.
  const alcove = room(module, "alcove");
  alcove.items.find(({ id }) => id === "stone-snake").kind =
    "potion-of-healing";
  alcove.items.push({
    id: "alcove-potion",
    name: "Potion of Healing",
    description: "A stoppered vial of red liquid.",
    kind: "potion-of-healing",
  });
  const snakeDoor = validateModule(module);
  const candidates = scarceCandidateIds(snakeDoor);
  assert.ok(candidates.includes("alcove-potion"));
  assert.equal(candidates.includes("stone-snake"), false);
  // An item that sets a flag when taken may open a way on.
  const flagged = structuredClone(snakeDoor);
  flagged.rooms
    .find(({ id }) => id === "alcove")
    .items.push({
      id: "flagged-dagger",
      name: "Dagger",
      description: "A dagger on a pressure plate.",
      kind: "gear",
      gear: "dagger",
      hiddenIn: "iron-chest",
      sets: "dagger-taken",
    });
  assert.equal(scarceCandidateIds(flagged).includes("flagged-dagger"), false);
  let missed = 0;
  for (let seed = 0; seed < 200; seed++) {
    const absent = scarceItemIds(snakeDoor, seed);
    assert.equal(absent.has("stone-snake"), false);
    missed += absent.has("alcove-potion") ? 1 : 0;
  }
  assert.ok(missed > 0 && missed < 200);
});

test("a missing item is not there for the player or the AI DM, and a reload or a rerun misses the same", async () => {
  const seed = seedMissing(findsYard, ["yard-potion", "yard-scroll"]);
  const directory = await mkdtemp(join(tmpdir(), "issue-507-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "e".repeat(32),
      seed,
      findsYard,
      BEA,
      SCARCE,
    );
    const { runtime } = session;
    const shown = (state) => {
      const view = runtime.projectRoom(state);
      return {
        items: view.items.map(({ id }) => id),
        take: JSON.stringify(
          runtime
            .getGameToolDefinitions(state)
            .find(({ name }) => name === "take") ?? null,
        ),
      };
    };
    // The potion lay in plain sight: it is not in the room, nor offered.
    const begun = shown(session.state);
    assert.equal(begun.items.includes("yard-potion"), false);
    assert.equal(begun.take.includes("yard-potion"), false);
    assert.equal(
      runtime.handleAction(session.state, {
        type: "take",
        itemId: "yard-potion",
      }).rejection.code,
      "no-item",
    );
    // Searching the woodpile finds the dagger, but no scroll.
    const { result } = session.act(
      { type: "examine", targetId: "woodpile" },
      "click",
    );
    assert.deepEqual(result.events[0].found, ["Dagger"]);
    assert.deepEqual(shown(session.state).items, ["yard-dagger"]);
    assert.equal(
      JSON.stringify(runtime.projectRoom(session.state)).includes(
        "Sealed Parchment",
      ),
      false,
    );
    session.act({ type: "take", itemId: "yard-dagger" }, "click");
    await session.persist();

    // Reloaded, the same items are missing.
    const loaded = await FifthSession.load(path, [findsYard]);
    assert.deepEqual(loaded.settings, SCARCE);
    assert.deepEqual(shown(loaded.state), shown(session.state));
    assert.deepEqual(loaded.state, session.state);
    // Rerun from the start on the same seed, the same items are missing.
    const rerun = FifthSession.begin(seed, findsYard, BEA, SCARCE);
    assert.deepEqual(shown(rerun.state), begun);

    // On Normal, the same seed misses nothing.
    const normal = FifthSession.begin(seed, findsYard, BEA);
    assert.ok(
      normal.runtime
        .projectRoom(normal.state)
        .items.some(({ id }) => id === "yard-potion"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a missing item never reaches the ledger, so a later adventure draws for it again", () => {
  // The lintel at the barrow's mouth hides a longsword, a shield, a
  // greatsword and chain mail.
  const seed = seedMissing(armouryBarrow, ["lintel-longsword"]);
  const runtime = createFifthRuntime(armouryBarrow, BEA, {}, SCARCE, seed);
  let state = accept(runtime, runtime.createSession(), {
    type: "begin",
  }).state;
  const searched = accept(runtime, state, {
    type: "examine",
    targetId: "scratched-lintel",
  });
  assert.deepEqual(searched.events[0].found, [
    "Shield",
    "Greatsword",
    "Chain Mail",
  ]);
  state = accept(runtime, searched.state, {
    type: "take",
    itemId: "lintel-shield",
  }).state;
  state = accept(runtime, state, {
    type: "leave",
    roomId: "barrow-mouth",
  }).state;
  const settlement = runtime.projectSettlement(state);
  assert.deepEqual(settlement.gear, ["lintel-barrow/lintel-shield"]);
  const after = settleCharacter(BEA, settlement);
  // In a later adventure whose seed misses nothing, the longsword is there.
  const later = createFifthRuntime(
    armouryBarrow,
    after,
    {},
    SCARCE,
    seedMissing(armouryBarrow, []),
  );
  const begun = accept(later, later.createSession(), { type: "begin" }).state;
  assert.deepEqual(
    accept(later, begun, { type: "examine", targetId: "scratched-lintel" })
      .events[0].found,
    ["Longsword", "Greatsword", "Chain Mail"],
  );
});

test("merchant prices and buy-back set the price of every trade, ammunition included", () => {
  assert.equal(merchantPrice("dagger"), itemPrice("dagger"));
  assert.equal(merchantPrice("dagger", 1.5), 300);
  assert.equal(merchantPrice("dagger", 0.75), 150);
  assert.equal(merchantPrice("arrows", 0.75), 75);
  assert.equal(merchantPrice("arrows", 2), 200);
  // Rounded to the nearest copper, and never free.
  assert.equal(merchantPrice("club", 0.75), 8);
  assert.equal(merchantPrice("club", 0.5), 5);
  assert.equal(salePrice("arrows"), 50);
  assert.equal(salePrice("arrows", 25), 25);
  assert.equal(salePrice("dagger", 75), 150);
  assert.equal(salePrice("dagger", 100), 200);
  const holding = { equipment: ["leather", "mace"], stowed: [], purse: 300 };
  const bought = buyItem(
    holding,
    "dagger",
    { capacity: 100, other: 0 },
    merchantPrice("dagger", 1.5),
  );
  assert.equal(bought.price, 300);
  assert.equal(bought.holding.purse, 0);
  assert.equal(
    buyItem(holding, "dagger", { capacity: 100, other: 0 }, 400).refusal.code,
    "too-little-coin",
  );
  const sold = sellItem(
    bought.holding,
    "dagger",
    false,
    salePrice("dagger", 75),
  );
  assert.equal(sold.price, 150);
  assert.equal(sold.holding.purse, 150);
});

test("the engine lists the merchant's offers at the settings' prices; the AI DM only chooses one", () => {
  const sheet = { ...BEA, purse: 1000 };
  const runtime = createFifthRuntime(
    findsYard,
    sheet,
    {},
    withSettings({ merchantPrices: 1.5, merchantBuyBack: 75 }),
  );
  const state = accept(runtime, runtime.createSession(), {
    type: "begin",
  }).state;
  const pedlar = runtime
    .projectRoom(state)
    .creatures.find(({ id }) => id === "pedlar");
  assert.deepEqual(
    pedlar.wares.map(({ id, price }) => [id, price]),
    [["dagger", "3 gp"]],
  );
  assert.equal(pedlar.buyBack, "three quarters of the price");
  // Each piece of gear carried, at three quarters of its catalogue price.
  assert.ok(pedlar.salePrices.length > 0);
  for (const { id, price } of pedlar.salePrices) {
    assert.equal(price, formatCoins(Math.floor((itemPrice(id) * 3) / 4)));
  }
  const offers = tradeOffers(runtime, state);
  assert.match(offers, /buy:dagger \(buy the dagger for 3 gp\)/);
  // The AI DM picks an offer by its id; the engine sets the price.
  const result = runtime.dispatchGameTool(state, {
    name: "trade",
    argumentsJson: JSON.stringify({ offer: "buy:dagger" }),
  });
  assert.equal(result.state.possessions.purse, 700);
  const daggerSale = runtime
    .projectRoom(result.state)
    .creatures.find(({ id }) => id === "pedlar")
    .salePrices.find(({ id }) => id === "dagger");
  assert.equal(daggerSale.price, "1 gp 5 sp");
  assert.match(
    tradeOffers(runtime, result.state),
    /sell:dagger \(sell the dagger for 1 gp 5 sp\)/,
  );
  const resold = runtime.dispatchGameTool(result.state, {
    name: "trade",
    argumentsJson: JSON.stringify({ offer: "sell:dagger" }),
  });
  assert.equal(resold.state.possessions.purse, 850);

  // At the defaults, half price.
  const plain = createFifthRuntime(findsYard, sheet);
  const begun = accept(plain, plain.createSession(), { type: "begin" }).state;
  const pedlarNow = plain
    .projectRoom(begun)
    .creatures.find(({ id }) => id === "pedlar");
  assert.equal(pedlarNow.buyBack, "half price");
  assert.deepEqual(pedlarNow.wares[0].price, "2 gp");
});

test("starting coin fills a new character's purse when it is saved; characters saved before keep theirs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-507-coin-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const first = await library.startCreation();
    const before = await library.create(
      "Ada",
      TEST_FIGHTER_CHOICES,
      first.revision,
    );
    assert.equal(before.characters[0].sheet.purse, 0);
    const second = await library.startCreation();
    const after = await library.create(
      "Bea",
      TEST_FIGHTER_CHOICES,
      second.revision,
      "fighter",
      withSettings({ startingCoin: 25 }),
    );
    assert.deepEqual(
      after.characters.map(({ sheet }) => [sheet.name, sheet.purse]),
      [
        ["Ada", 0],
        ["Bea", 2500],
      ],
    );
    // Its coin isn't loot: leaving with only it is escaping without loot.
    const runtime = createFifthRuntime(gemMarket, after.characters[1].sheet);
    const begun = accept(runtime, runtime.createSession(), {
      type: "begin",
    }).state;
    assert.equal(begun.possessions.purse, 2500);
    const left = accept(runtime, begun, {
      type: "leave",
      roomId: "barrow-mouth",
    }).state;
    assert.equal(
      gemMarket.endings.find(({ id }) => id === left.endingId).kind,
      "escape-without-loot",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const post = async (url, path, body) => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test("the server gives a new character the starting coin the settings have when it is saved", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-507-server-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 3,
    adventures: [gemMarket],
    qualifies: () => true,
  });
  try {
    const create = async (name) => {
      const started = await post(server.url, "/api/5e/creation", {});
      const { classes, pendingCreation, revision } = started.body;
      const fighter = classes.find(({ id }) => id === "fighter");
      const created = await post(server.url, "/api/5e/characters", {
        revision,
        name,
        class: "fighter",
        placement: pendingCreation.defaultPlacements.fighter,
        ...fighter.defaults,
      });
      assert.equal(created.status, 200, JSON.stringify(created.body));
      return created.body;
    };
    await create("Ada");
    const changed = await post(server.url, "/api/5e/settings", {
      id: "startingCoin",
      value: 25,
    });
    assert.equal(changed.status, 200);
    const library = await create("Bea");
    assert.deepEqual(
      library.characters.map(({ sheet, purse }) => [sheet.name, purse]),
      [
        ["Ada", "0 cp"],
        ["Bea", "25 gp"],
      ],
    );
    const stored = JSON.parse(await readFile(libraryPath, "utf8"));
    assert.equal(stored.formatVersion, FIFTH_LIBRARY_FORMAT);
    assert.equal(stored.characters[1].sheet.purse, 2500);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an older character library is refused with the move-aside message", async () => {
  assert.equal(FIFTH_LIBRARY_FORMAT, 28);
  const directory = await mkdtemp(join(tmpdir(), "issue-507-library-"));
  try {
    const path = join(directory, "characters.json");
    const bytes = JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: 26,
      revision: "0".repeat(32),
      creationsStarted: 0,
      sessionsStarted: 0,
      characters: [],
    });
    await writeFile(path, bytes);
    await assert.rejects(new FifthCharacterLibrary(path, 1).read(), {
      message: `${path} is a character library in format version 26, not 28. This build creates 5e characters and cannot read it. Move it aside, or choose another --characters path; the file has not been changed.`,
    });
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
