// #210: trade with merchants inside adventures. A module's creature may be a
// merchant with authored stock and a time cost; the character buys catalogue
// gear at its price and sells gear for half, with coin found or brought.
// Stock and prices are the engine's, and trades follow the adventure
// rollback contract.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateAdventure } from "../dist/balance-5e.js";
import { buyItem, salePrice, sellItem } from "../dist/equipment-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import { buildFighter, settleFighter } from "../dist/fighter-5e.js";
import {
  FifthSession,
  settleFifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { room } from "./fixtures/armoury-barrow.mjs";
import { marketBarrow, marketFile, PEDLAR } from "./fixtures/market-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

const holding = (equipment, stowed = [], purse = 0) => ({
  equipment,
  stowed,
  purse,
});
/** Str 16's 240 lb, with nothing else carried: weight never refuses these (#224). */
const ROOMY = { capacity: 240, other: 0 };

test("a sale returns half the catalogue price, rounded down to the copper", () => {
  assert.equal(salePrice("shortsword"), 500);
  assert.equal(salePrice("mace"), 250);
  // A club costs 1 sp: half is 5 cp.
  assert.equal(salePrice("club"), 5);
  assert.equal(salePrice("chain-mail"), 3750);
});

test("buying pays the catalogue price from the purse and stows the item", () => {
  assert.deepEqual(
    buyItem(holding(["leather", "mace"], [], 1234), "shortsword", ROOMY),
    {
      holding: holding(["leather", "mace"], ["shortsword"], 234),
      price: 1000,
    },
  );
  // Exactly enough coin is enough.
  assert.deepEqual(
    buyItem(holding(["leather", "mace"], ["dagger"], 1000), "shield", ROOMY),
    {
      holding: holding(["leather", "mace"], ["dagger", "shield"], 0),
      price: 1000,
    },
  );
});

test("buying with too little coin is refused, saying what it costs and what the purse holds", () => {
  assert.deepEqual(
    buyItem(holding(["leather", "mace"], [], 950), "shortsword", ROOMY).refusal,
    {
      code: "too-little-coin",
      reason:
        "The shortsword costs 10 gp, and your purse holds only 9 gp 5 sp.",
    },
  );
  assert.deepEqual(
    buyItem(holding(["leather", "mace"], [], 0), "dagger", ROOMY).refusal,
    {
      code: "too-little-coin",
      reason: "The dagger costs 2 gp, and your purse is empty.",
    },
  );
});

test("selling stowed gear adds half its price to the purse", () => {
  assert.deepEqual(
    sellItem(holding(["leather", "mace"], ["dagger", "shield"], 7), "shield"),
    {
      holding: holding(["leather", "mace"], ["dagger"], 507),
      price: 500,
      replaced: [],
    },
  );
});

test("selling an equipped item needs it to be confirmed as equipped", () => {
  // Without confirmation, an item only equipped is not sold.
  assert.deepEqual(sellItem(holding(["leather", "mace"]), "leather").refusal, {
    code: "sale-unconfirmed",
    reason:
      "You are wearing the leather armour. Selling it needs your confirmation.",
  });
  assert.deepEqual(sellItem(holding(["leather", "mace"]), "leather", true), {
    holding: holding(["mace"], [], 500),
    price: 500,
    replaced: ["leather"],
  });
  // A stowed copy is sold first, leaving the equipped one in place.
  assert.deepEqual(
    sellItem(holding(["leather", "dagger", "dagger"], ["dagger"]), "dagger"),
    {
      holding: holding(["leather", "dagger", "dagger"], [], 100),
      price: 100,
      replaced: [],
    },
  );
  // Confirmed, the equipped one goes even when a copy is stowed.
  assert.deepEqual(
    sellItem(
      holding(["leather", "dagger", "dagger"], ["dagger"]),
      "dagger",
      true,
    ),
    {
      holding: holding(["leather", "dagger"], ["dagger"], 100),
      price: 100,
      replaced: ["dagger"],
    },
  );
});

test("selling never leaves the character without a weapon, nor sells what it lacks", () => {
  assert.equal(
    sellItem(holding(["leather", "mace"]), "mace", true).refusal.code,
    "last-weapon",
  );
  assert.equal(
    sellItem(holding(["leather", "mace"]), "shield").refusal.code,
    "not-carried",
  );
  assert.equal(
    sellItem(holding(["leather", "mace"]), "shield", true).refusal.code,
    "not-equipped",
  );
});

/** The market barrow with the pedlar changed by `change`. */
function withPedlar(change) {
  const module = structuredClone(marketFile);
  change(room(module, "barrow-mouth").creatures[0], module);
  return module;
}

test("a module's creature may be a merchant with authored stock and minutes per trade", () => {
  assert.equal(marketBarrow.formatVersion, 13);
  assert.deepEqual(room(marketBarrow, "barrow-mouth").creatures[0].merchant, {
    stock: ["shortsword", "shield", "dagger"],
    minutes: 10,
  });
  assert.throws(
    () =>
      validateModule({
        ...structuredClone(marketFile),
        formatVersion: 7,
      }),
    /format version 7 is not 13/,
  );
});

test("a merchant stocks only distinct catalogue gear and takes 1–60 minutes a trade", () => {
  const cases = [
    [
      (pedlar) => (pedlar.merchant.stock = ["rope"]),
      /stock 1 must be a catalogue weapon or armour/,
    ],
    [(pedlar) => (pedlar.merchant.stock = []), /stock must list 1–12 entries/],
    [(pedlar) => pedlar.merchant.stock.push("dagger"), /stocks dagger twice/],
    [
      (pedlar) => (pedlar.merchant.minutes = 0),
      /minutes must be an integer from 1 to 60/,
    ],
    [
      (pedlar) => (pedlar.merchant.price = 5),
      /merchant must have exactly stock, minutes/,
    ],
  ];
  for (const [change, message] of cases) {
    assert.throws(() => validateModule(withPedlar(change)), message);
  }
});

test("a merchant stocks common gear always, uncommon only for level 3 and up, and never rare", () => {
  assert.throws(
    () =>
      validateModule(
        withPedlar((pedlar) => pedlar.merchant.stock.push("longsword")),
      ),
    /stocks the uncommon longsword, but uncommon gear is sold only in modules for level 3 and up/,
  );
  const levelThree = (stock) =>
    validateModule(
      withPedlar((pedlar, module) => {
        pedlar.merchant.stock.push(stock);
        module.recommendedLevels = { min: 3, max: 3 };
      }),
    );
  assert.ok(levelThree("longsword"));
  assert.throws(
    () => levelThree("plate"),
    /stocks the rare plate, but no merchant sells rare gear/,
  );
});

test("a room has at most one merchant", () => {
  assert.throws(
    () =>
      validateModule(
        withPedlar((pedlar, module) =>
          room(module, "barrow-mouth").creatures.push({
            ...structuredClone(PEDLAR),
            id: "tinker",
            name: "Tinker",
            topics: [
              { id: "tinkering", name: "tinkering", reply: '"Pots mended."' },
            ],
          }),
        ),
      ),
    /room 1 has two merchants; one is enough/,
  );
});

// Str 16 (+3), Dex 12 (+1), Con 14 (+2), with leather and a mace.
const ada = buildFighter(
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

const buy = (itemId) => ({ type: "buy", itemId });
const sell = (itemId, equipped) => ({
  type: "sell",
  itemId,
  ...(equipped ? { equipped: true } : {}),
});

/** Applies `action`, which the engine must accept. */
function accept(runtime, state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  return result;
}

/**
 * Wins the burial hall's fight on the first seed that wins it, takes the
 * pouch from the goblin's body if it is there, and goes back to the pedlar.
 */
function loot(runtime) {
  for (let seed = 0; seed < 100; seed++) {
    const random = createSeededRandom(seed);
    const run = (state, action) => accept(runtime, state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    state = run(state, { type: "move", destinationId: "burial-hall" });
    while (state.encounter?.outcome === "ongoing") {
      state = run(
        state,
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
          : { type: "end-turn", actorId: "pc" },
      );
    }
    if (state.status !== "playing") {
      continue;
    }
    state = run(state, { type: "examine", targetId: "barrow-goblin" });
    if (
      runtime.projectRoom(state).items.some(({ id }) => id === "coin-pouch")
    ) {
      state = run(state, { type: "take", itemId: "coin-pouch" });
    }
    return run(state, { type: "move", destinationId: "barrow-mouth" });
  }
  throw new Error("no seed wins the burial hall");
}

test("10 gp looted from the goblin's body buys a shortsword, in the trade's authored minutes", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  const looted = loot(runtime);
  assert.equal(looted.possessions.purse, 1000);
  const bought = accept(runtime, looted, buy("shortsword"));
  assert.deepEqual(bought.events, [
    {
      type: "traded",
      deal: "buy",
      item: "shortsword",
      merchant: "Pedlar",
      price: 1000,
      purse: 0,
      minutes: 10,
    },
  ]);
  assert.equal(
    renderFifthResult(bought),
    "You buy the shortsword from Pedlar for 10 gp and stow it. The trade takes 10 minutes. Your purse is empty.",
  );
  assert.equal(bought.state.possessions.purse, 0);
  assert.deepEqual(bought.state.possessions.stowed, ["shortsword"]);
  // The coin it spent is still recorded as found.
  assert.ok(bought.state.usedItemIds.includes("coin-pouch"));
});

test("a merchant offers only its authored stock, at engine prices, and only outside a fight where it is", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  const looted = loot(runtime);
  assert.deepEqual(runtime.projectRoom(looted).creatures[0].wares, [
    { id: "shortsword", name: "Shortsword", price: "10 gp" },
    { id: "shield", name: "Shield", price: "10 gp" },
    { id: "dagger", name: "Dagger", price: "2 gp" },
  ]);
  assert.deepEqual(
    runtime
      .projectActions(looted)
      .filter(({ action }) => action === "buy")
      .map(({ target, available }) => [target.id, available]),
    [
      ["shortsword", true],
      ["shield", true],
      ["dagger", true],
    ],
  );
  assert.deepEqual(runtime.handleAction(looted, buy("longsword")).rejection, {
    code: "not-stocked",
    reason: "The Pedlar doesn't sell that.",
  });
  assert.equal(
    runtime.handleAction(looted, buy("rope")).rejection.code,
    "not-stocked",
  );
  // No merchant in the burial hall, and none mid-fight.
  const hall = accept(runtime, looted, {
    type: "move",
    destinationId: "burial-hall",
  }).state;
  assert.equal(
    runtime.handleAction(hall, buy("dagger")).rejection.code,
    "no-merchant",
  );
  const fresh = accept(runtime, runtime.createSession(), { type: "begin" });
  const fighting = accept(
    runtime,
    fresh.state,
    { type: "move", destinationId: "burial-hall" },
    createSeededRandom(0),
  ).state;
  assert.equal(
    runtime.handleAction(fighting, buy("dagger")).rejection.code,
    "fighting",
  );
});

test("the AI DM trades only through the trade tool's offers, and cannot set a price", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  const looted = loot(runtime);
  const trade = runtime
    .getGameToolDefinitions(looted)
    .find(({ name }) => name === "trade");
  assert.deepEqual(trade.parameters.properties.offer.enum, [
    "buy:shortsword",
    "buy:shield",
    "buy:dagger",
  ]);
  assert.match(
    trade.description,
    /buy:shortsword \(buy the shortsword for 10 gp\)/,
  );
  const call = (argumentsJson) =>
    runtime.dispatchGameTool(looted, { name: "trade", argumentsJson });
  assert.equal(
    call('{"offer":"buy:shortsword","price":1}').modelOutput.error.code,
    "invalid-arguments",
  );
  // An offer without buy: or sell: is no trade, even naming stocked gear.
  for (const offer of ["shortsword", "steal:shortsword", ""]) {
    assert.equal(
      call(JSON.stringify({ offer })).engineResult.rejection.code,
      "not-stocked",
      offer,
    );
  }
  const refused = call('{"offer":"buy:longsword"}');
  assert.equal(refused.state, looted);
  assert.deepEqual(refused.engineResult, {
    rejection: {
      code: "not-stocked",
      reason: "The Pedlar doesn't sell that.",
    },
  });
  const bought = call('{"offer":"buy:dagger"}');
  assert.equal(bought.state.possessions.purse, 800);
  assert.equal(
    runtime.renderDmNarration({ name: "trade" }, bought),
    "You buy the dagger from Pedlar for 2 gp and stow it. The trade takes 10 minutes. Purse: 8 gp.",
  );
  // The stowed dagger can now be sold through the tool too.
  assert.ok(
    runtime
      .getGameToolDefinitions(bought.state)
      .find(({ name }) => name === "trade")
      .parameters.properties.offer.enum.includes("sell:dagger"),
  );
});

test("buying with too little coin is refused with the engine's reply", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  const start = accept(runtime, runtime.createSession(), { type: "begin" });
  assert.deepEqual(
    runtime.handleAction(start.state, buy("shortsword")).rejection,
    {
      code: "too-little-coin",
      reason: "The shortsword costs 10 gp, and your purse is empty.",
    },
  );
  assert.deepEqual(
    runtime
      .projectActions(start.state)
      .filter(({ action }) => action === "buy")
      .map(({ available, reason }) => [available, reason]),
    [
      [false, "Too little coin"],
      [false, "Too little coin"],
      [false, "Too little coin"],
    ],
  );
  // Nothing the AI DM could buy or sell, so no trade tool.
  assert.equal(
    runtime
      .getGameToolDefinitions(start.state)
      .some(({ name }) => name === "trade"),
    false,
  );
});

test("selling pays half price; equipped gear is sold only once confirmed", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  const start = accept(runtime, runtime.createSession(), { type: "begin" });
  assert.deepEqual(
    runtime
      .projectActions(start.state)
      .filter(({ action }) => action.startsWith("sell"))
      .map(({ action, target, available }) => [action, target.id, available]),
    [
      ["sell-equipped", "leather", true],
      // The last weapon can't be sold.
      ["sell-equipped", "mace", false],
    ],
  );
  assert.deepEqual(
    runtime.handleAction(start.state, sell("leather")).rejection,
    {
      code: "sale-unconfirmed",
      reason:
        "You are wearing the leather armour. Selling it needs your confirmation.",
    },
  );
  // The panel shows what the merchant pays for each kind carried.
  assert.deepEqual(runtime.projectRoom(start.state).creatures[0].salePrices, [
    { id: "leather", name: "Leather armour", price: "5 gp" },
    { id: "mace", name: "Mace", price: "2 gp 5 sp" },
  ]);
  const sold = accept(runtime, start.state, sell("leather", true));
  assert.equal(
    renderFifthResult(sold),
    "You spend 1 minute doffing the leather armour and sell it to Pedlar for 5 gp. The trade takes 10 minutes. Purse: 5 gp. AC 11; Mace +5 to hit, 1d6 + 3 bludgeoning.",
  );
  assert.deepEqual(sold.state.possessions.equipment, ["mace"]);
  const bought = accept(runtime, sold.state, buy("dagger"));
  const resold = accept(runtime, bought.state, sell("dagger"));
  assert.equal(
    renderFifthResult(resold),
    "You sell the dagger to Pedlar for 1 gp. The trade takes 10 minutes. Purse: 4 gp.",
  );
  assert.deepEqual(resold.state.possessions.stowed, []);
});

test("a surviving ending keeps what was bought and the change; found coin spent is never found again", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  let state = accept(runtime, loot(runtime), buy("shortsword")).state;
  state = accept(runtime, state, { type: "swap", itemId: "shortsword" }).state;
  state = accept(runtime, state, sell("mace")).state;
  state = accept(runtime, state, {
    type: "leave",
    roomId: "barrow-mouth",
  }).state;
  // Coin found here makes this an escape with loot, though it was spent.
  assert.equal(state.endingId, "out-with-the-torc");
  const settlement = runtime.projectSettlement(state);
  assert.deepEqual(settlement.possessions.equipment, ["leather", "shortsword"]);
  assert.deepEqual(settlement.possessions.stowed, []);
  assert.equal(settlement.possessions.purse, 250);
  const after = settleFighter(ada, settlement);
  assert.equal(after.purse, 250);
  assert.ok(after.finds.includes("robbers-barrow/coin-pouch"));

  // On a later visit the goblin's body holds nothing; the purse is as kept.
  const again = createFifthRuntime(marketBarrow, after);
  const revisited = loot(again);
  assert.equal(revisited.possessions.purse, 250);
  assert.equal(
    again
      .projectRoom(
        accept(again, revisited, { type: "move", destinationId: "burial-hall" })
          .state,
      )
      .features.find(({ id }) => id === "barrow-goblin").discovery,
    "Nothing of value.",
  );
});

test("the trade tool offers exactly the trades the panel shows enabled, but no equipped sale", () => {
  const session = FifthSession.begin(0, marketBarrow, TEST_FIGHTER);
  assert.equal(offeredToolsMatchActions(session), true);
  const { result } = session.act(sell("leather", true), "click");
  assert.equal(result.rejection, undefined);
  assert.ok(
    session.runtime
      .getGameToolDefinitions(session.state)
      .some(({ name }) => name === "trade"),
  );
  assert.equal(offeredToolsMatchActions(session), true);
});

/** A library holding one fresh Ada (Str 16, the mace kit). */
async function withLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-210-"));
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
    await run(library, data.characters[0].sheet.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const record = async (library) => (await library.read()).characters[0];

/** Starts the market barrow and trades at its mouth; no dice. */
async function trade(library, characterId, actions) {
  const session = await startFifthAdventure(
    library,
    0,
    characterId,
    marketBarrow,
    (await library.read()).revision,
  );
  for (const action of actions) {
    const { result } = session.act(action, "click");
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return session;
}

const LEAVE = { type: "leave", roomId: "barrow-mouth" };

test("trades are kept on escape, once, even across an interrupted settlement", async () => {
  await withLibrary(async (library, characterId) => {
    const session = await trade(library, characterId, [
      sell("leather", true),
      buy("dagger"),
      LEAVE,
    ]);
    await session.persist();
    // A crash here: the session has ended, the library still names it.
    assert.equal((await record(library)).sheet.purse, 0);
    const reloaded = await FifthSession.load(session.path, [marketBarrow]);
    await settleFifthSession(library, reloaded);
    await settleFifthSession(library, session);
    const { sheet, session: active } = await record(library);
    assert.equal(active, undefined);
    assert.deepEqual(sheet.equipment, ["mace"]);
    assert.deepEqual(sheet.stowed, ["dagger"]);
    assert.equal(sheet.purse, 300);
  });
});

test("abandonment and defeat undo every trade: the coin and gear the character started with", async () => {
  await withLibrary(async (library, characterId) => {
    const first = await trade(library, characterId, [
      sell("leather", true),
      LEAVE,
    ]);
    await first.persist();
    await settleFifthSession(library, first);
    const before = (await record(library)).sheet;
    assert.equal(before.purse, 500);

    const abandoned = await trade(library, characterId, [
      buy("dagger"),
      { type: "swap", itemId: "dagger" },
      sell("mace"),
    ]);
    await abandoned.persist();
    const data = await library.abandonSession(
      characterId,
      (await library.read()).revision,
    );
    assert.deepEqual(data.characters[0].sheet, before);

    const fallen = await trade(library, characterId, [
      buy("dagger"),
      buy("dagger"),
    ]);
    fallen.state = {
      ...fallen.state,
      status: "defeat",
      endingId: "fallen-in-the-barrow",
    };
    await settleFifthSession(library, fallen);
    const { sheet, defeated } = await record(library);
    assert.equal(defeated, true);
    assert.deepEqual(sheet, { ...before, hp: 0 });
  });
});

test("the balance gate's one-hit-kill measure tries each weapon a merchant sells", () => {
  const stocking = (stock) =>
    validateModule(
      withPedlar((pedlar, module) => {
        pedlar.merchant.stock = [stock];
        module.recommendedLevels = { min: 3, max: 3 };
      }),
    );
  const enemy = (adventure) =>
    gateAdventure(adventure, { seeds: [0] }).verdict.oneHitKill.enemies[0];
  const without = enemy(stocking("shield"));
  assert.equal(without.gear, undefined);
  const withGreatsword = enemy(stocking("greatsword"));
  assert.equal(withGreatsword.gear, "greatsword");
  assert.ok(withGreatsword.chance > without.chance);
});
