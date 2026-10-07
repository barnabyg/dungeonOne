// #239: treasure has a value, and every adventure's treasure fits its level.
// Gems and art objects come from a catalogue with a value; merchants buy them
// at full value. Each module's findable treasure (coin, gems, art objects,
// potions and gear) is held to a budget for its maximum recommended level,
// and an item's tier must be allowed at that level.
import assert from "node:assert/strict";
import test from "node:test";
import { findableValue } from "../dist/adventure-5e.js";
import { itemPrice } from "../dist/equipment-5e.js";
import { settleFighter, validateFighter } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import {
  POTIONS,
  TRADE_GOODS,
  TREASURE_BUDGETS,
  tierAllowed,
  treasureBudget,
} from "../dist/treasure-5e.js";
import { barrowFile, room } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { gemMarket } from "./fixtures/gem-market.mjs";

/** The barrow's own treasure: the silver torc (25 gp) and 2 gp 5 sp. */
const BARROW_VALUE = TRADE_GOODS["art-25gp"].value + 250;

/** The barrow with `items` added to the coin and torc in its burial hall. */
function barrowWith(items, levels) {
  const module = structuredClone(barrowFile);
  room(module, "burial-hall").items.push(...items);
  if (levels !== undefined) {
    module.recommendedLevels = levels;
  }
  return module;
}

const coin = (copper) => ({
  id: "extra-coin",
  name: "Extra Coin",
  description: "A heap of coin.",
  kind: "coin",
  coins: { cp: copper },
  hiddenIn: "stone-bier",
});

const hidden = (fields) => ({
  description: "Something under the bier.",
  hiddenIn: "stone-bier",
  ...fields,
});

test("the catalogue values gems and art objects, and both healing potions", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(TRADE_GOODS).map(([id, { value }]) => [id, value]),
    ),
    {
      "gem-10gp": 1000,
      "gem-50gp": 5000,
      "gem-100gp": 10000,
      "art-25gp": 2500,
      "art-250gp": 25000,
    },
  );
  assert.equal(POTIONS["potion-of-healing"].value, 5000);
  assert.equal(POTIONS["potion-of-healing"].tier, "common");
  assert.deepEqual(POTIONS["potion-of-greater-healing"].healing, {
    dice: 4,
    sides: 4,
    modifier: 4,
  });
  assert.equal(POTIONS["potion-of-greater-healing"].tier, "uncommon");
});

test("tiers have a minimum level: common always, uncommon from 3, no rare", () => {
  assert.equal(tierAllowed("common", 1), true);
  assert.equal(tierAllowed("uncommon", 2), false);
  assert.equal(tierAllowed("uncommon", 3), true);
  assert.equal(tierAllowed("rare", 3), false);
  assert.throws(() => treasureBudget(4), /No treasure budget for level 4/);
});

test("a module's findable value counts coin, gems, art objects, potions and gear", () => {
  const module = validateModule(
    barrowWith([
      hidden({
        id: "opal",
        name: "Opal",
        kind: "treasure",
        treasure: "gem-50gp",
      }),
      hidden({ id: "draught", name: "Draught", kind: "potion-of-healing" }),
      hidden({ id: "old-mace", name: "Old Mace", kind: "gear", gear: "mace" }),
    ]),
  );
  assert.equal(
    findableValue(module),
    BARROW_VALUE +
      5000 +
      POTIONS["potion-of-healing"].value +
      itemPrice("mace"),
  );
});

test("the validator accepts a module exactly at its budget", () => {
  const module = validateModule(
    barrowWith([coin(TREASURE_BUDGETS[1] - BARROW_VALUE)]),
  );
  assert.equal(findableValue(module), TREASURE_BUDGETS[1]);
});

test("the validator rejects a module over its budget, naming the module and the excess", () => {
  assert.throws(
    () =>
      validateModule(
        barrowWith([coin(TREASURE_BUDGETS[1] - BARROW_VALUE + 1)]),
      ),
    {
      message:
        "Invalid adventure module: module lintel-barrow: its findable treasure is worth 150 gp 1 cp, 1 cp over the 150 gp budget for level 1.",
    },
  );
});

test("the budget follows the maximum recommended level", () => {
  const value = TREASURE_BUDGETS[2] - BARROW_VALUE;
  assert.throws(
    () => validateModule(barrowWith([coin(value)])),
    /over the 150 gp budget for level 1/,
  );
  assert.equal(
    findableValue(
      validateModule(barrowWith([coin(value)], { min: 1, max: 2 })),
    ),
    TREASURE_BUDGETS[2],
  );
});

test("the validator rejects an item above the tier allowed for the maximum level", () => {
  const longsword = hidden({
    id: "old-sword",
    name: "Old Sword",
    kind: "gear",
    gear: "longsword",
  });
  assert.throws(
    () => validateModule(barrowWith([longsword], { min: 1, max: 2 })),
    {
      message:
        "Invalid adventure module: module lintel-barrow room 2 item 3 (old-sword) is the uncommon longsword, but uncommon treasure is found only in modules for level 3 and up.",
    },
  );
  validateModule(barrowWith([longsword], { min: 1, max: 3 }));

  const greater = hidden({
    id: "red-vial",
    name: "Red Vial",
    kind: "potion-of-greater-healing",
  });
  assert.throws(
    () => validateModule(barrowWith([greater])),
    /\(red-vial\) is the uncommon Potion of Greater Healing, but uncommon treasure is found only in modules for level 3 and up/,
  );
  validateModule(barrowWith([greater], { min: 2, max: 3 }));

  assert.throws(
    () =>
      validateModule(
        barrowWith(
          [hidden({ id: "plate", name: "Plate", kind: "gear", gear: "plate" })],
          { min: 3, max: 3 },
        ),
      ),
    /\(plate\) is the rare plate armour, but no rare treasure is found yet/,
  );
});

test("a treasure names a gem or art object from the catalogue, and nothing else does", () => {
  const torc = (changes) => {
    const module = structuredClone(barrowFile);
    const item = room(module, "burial-hall").items.find(
      ({ id }) => id === "silver-torc",
    );
    Object.assign(item, changes);
    return module;
  };
  assert.throws(
    () => validateModule(torc({ treasure: undefined })),
    /item 1 is treasure, so it needs treasure: a catalogue gem or art object/,
  );
  assert.throws(
    () => validateModule(torc({ treasure: "ruby" })),
    /item 1 is treasure, so it needs treasure: a catalogue gem or art object/,
  );
  assert.throws(
    () => validateModule(torc({ kind: "key" })),
    /item 1 has treasure, but only treasure has treasure/,
  );
});

/** Applies `action`, which the engine must accept. */
function accept(runtime, state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  return result;
}

/**
 * Wins the burial hall's fight on the first seed that wins it, takes the
 * opal from under the bier, and goes back to the pedlar at the mouth.
 */
function findOpal(runtime) {
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
    state = run(state, { type: "examine", targetId: "stone-bier" });
    state = run(state, { type: "take", itemId: "blue-opal" });
    return run(state, { type: "move", destinationId: "barrow-mouth" });
  }
  throw new Error("no seed wins the burial hall");
}

const sellTreasure = (itemId) => ({ type: "sell-treasure", itemId });

test("a merchant buys a found gem at its full value, in the trade's minutes", () => {
  const runtime = createFifthRuntime(gemMarket, TEST_FIGHTER);
  const found = findOpal(runtime);
  const entry = runtime
    .projectRoom(found)
    .inventory.find(({ id }) => id === "blue-opal");
  assert.equal(entry.value, "50 gp");
  assert.ok(
    runtime
      .projectActions(found)
      .some(
        ({ action, target, available }) =>
          action === "sell-treasure" && target.id === "blue-opal" && available,
      ),
  );
  const sold = accept(runtime, found, sellTreasure("blue-opal"));
  assert.deepEqual(sold.events, [
    {
      type: "sold-treasure",
      item: "blue-opal",
      name: "Blue Opal",
      merchant: "Pedlar",
      price: 5000,
      purse: found.possessions.purse + 5000,
      minutes: 10,
    },
  ]);
  assert.match(
    renderFifthResult(sold),
    /^You sell the blue opal to Pedlar for 50 gp\. The trade takes 10 minutes\. Purse: /,
  );
  assert.equal(sold.state.inventory.includes("blue-opal"), false);
  // It is gone, and not there to sell again.
  assert.equal(
    runtime.handleAction(sold.state, sellTreasure("blue-opal")).rejection.code,
    "not-carried",
  );
});

test("selling treasure needs a merchant, outside a fight, and treasure carried", () => {
  const runtime = createFifthRuntime(gemMarket, TEST_FIGHTER);
  const found = findOpal(runtime);
  const away = accept(runtime, found, {
    type: "move",
    destinationId: "burial-hall",
  }).state;
  assert.equal(
    runtime.handleAction(away, sellTreasure("blue-opal")).rejection.code,
    "no-merchant",
  );
  assert.equal(
    runtime.handleAction(found, sellTreasure("silver-torc")).rejection.code,
    "not-carried",
  );
  // Gear is sold with sell, never as treasure.
  assert.equal(
    runtime.handleAction(found, sellTreasure("mace")).rejection.code,
    "not-carried",
  );
});

test("the AI DM can sell treasure only through the trade tool's offers", () => {
  const runtime = createFifthRuntime(gemMarket, TEST_FIGHTER);
  const found = findOpal(runtime);
  const trade = runtime
    .getGameToolDefinitions(found)
    .find(({ name }) => name === "trade");
  assert.match(
    JSON.stringify(trade),
    /sell-treasure:blue-opal \(sell the blue opal for 50 gp\)/,
  );
  const result = runtime.dispatchGameTool(found, {
    name: "trade",
    argumentsJson: JSON.stringify({ offer: "sell-treasure:blue-opal" }),
  });
  assert.equal(result.state.possessions.purse, found.possessions.purse + 5000);
});

test("a sold find stays in the ledger, and escaping after selling it is escaping with loot", () => {
  const runtime = createFifthRuntime(gemMarket, TEST_FIGHTER);
  const sold = accept(
    runtime,
    findOpal(runtime),
    sellTreasure("blue-opal"),
  ).state;
  const left = accept(runtime, sold, {
    type: "leave",
    roomId: "barrow-mouth",
  }).state;
  assert.equal(
    gemMarket.endings.find(({ id }) => id === left.endingId).kind,
    "escape-with-loot",
  );
  const settlement = runtime.projectSettlement(left);
  assert.deepEqual(settlement.finds, []);
  assert.deepEqual(settlement.sold, ["lintel-barrow/blue-opal"]);
  const after = settleFighter(TEST_FIGHTER, settlement);
  assert.ok(after.finds.includes("lintel-barrow/blue-opal"));
  assert.deepEqual(after.treasure, []);
  assert.equal(after.purse, sold.possessions.purse);
  // Found once: the opal is not under the bier for this character again.
  const again = createFifthRuntime(gemMarket, after);
  assert.throws(() => findOpal(again), /There is no such item here to take/);
});

test("kept treasure carries its value onto the sheet, and a later merchant pays it", () => {
  const runtime = createFifthRuntime(gemMarket, TEST_FIGHTER);
  const found = findOpal(runtime);
  const left = accept(runtime, found, {
    type: "leave",
    roomId: "barrow-mouth",
  }).state;
  const after = settleFighter(TEST_FIGHTER, runtime.projectSettlement(left));
  assert.deepEqual(after.treasure, [
    {
      id: "lintel-barrow/blue-opal",
      name: "Blue Opal",
      description: "A milky opal flecked with blue fire.",
      value: 5000,
    },
  ]);
  assert.throws(
    () =>
      validateFighter({
        ...after,
        treasure: [{ ...after.treasure[0], value: -1 }],
      }),
    /Invalid treasure/,
  );

  // Brought into another adventure, it is carried and sells for its value.
  const later = createFifthRuntime(gemMarket, after);
  const start = accept(later, later.createSession(), { type: "begin" }).state;
  const held = later
    .projectRoom(start)
    .inventory.find(({ id }) => id === "lintel-barrow/blue-opal");
  assert.deepEqual(held, {
    id: "lintel-barrow/blue-opal",
    name: "Blue Opal",
    description: "A milky opal flecked with blue fire.",
    value: "50 gp",
  });
  const sold = accept(later, start, sellTreasure("lintel-barrow/blue-opal"));
  assert.equal(sold.state.possessions.treasure.length, 0);
  assert.equal(sold.state.possessions.purse, after.purse + 5000);
  const out = accept(later, sold.state, {
    type: "leave",
    roomId: "barrow-mouth",
  }).state;
  const settled = settleFighter(after, later.projectSettlement(out));
  assert.deepEqual(settled.treasure, []);
  assert.equal(settled.purse, after.purse + 5000);
  assert.ok(settled.finds.includes("lintel-barrow/blue-opal"));
});

test("a Potion of Greater Healing heals 4d4 + 4 and is used up", () => {
  const module = validateModule(
    barrowWith(
      [
        hidden({
          id: "red-vial",
          name: "Red Vial",
          kind: "potion-of-greater-healing",
        }),
      ],
      { min: 2, max: 3 },
    ),
  );
  const hurt = { ...TEST_FIGHTER, hp: 1 };
  const runtime = createFifthRuntime(module, hurt);
  let state = runtime.createSession();
  // The vial lies under the bier, past the goblin: put it straight in hand.
  state = { ...state, inventory: ["red-vial"] };
  const rolls = [1, 2, 3, 4];
  const drunk = accept(
    runtime,
    state,
    { type: "use-item", itemId: "red-vial" },
    { roll: (sides) => (assert.equal(sides, 4), rolls.shift()) },
  );
  const { maxHp } = runtime.projectRoom(drunk.state).character;
  assert.equal(drunk.state.character.hp, Math.min(maxHp, 1 + 14));
  assert.deepEqual(drunk.state.inventory, []);
  assert.match(renderFifthResult(drunk), /1 \+ 2 \+ 3 \+ 4 \+ 4 = 14/);
});
