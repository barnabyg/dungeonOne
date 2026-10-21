// #515: the shop view's engine side. A merchant's view says what selling
// every gem and art object carried would bring and take, for the shop's
// "Sell all treasure", and a shield the character's hands can't hold says
// what to do to hold it, not that it can't be carried. The view itself is
// issue-515-browser.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { itemStats } from "../dist/item-stats-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { marketBarrow } from "./fixtures/market-barrow.mjs";

const begin = (runtime) =>
  runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    createSeededRandom(1),
  ).state;

const treasure = (id, name, value) => ({
  id: `elsewhere/${id}`,
  name,
  description: `${name}, brought in.`,
  value,
});

test("a merchant's view names the coin and minutes selling all the treasure carried would bring", () => {
  const rich = createFifthRuntime(marketBarrow, {
    ...TEST_FIGHTER,
    treasure: [
      treasure("torc", "Silver Torc", 2500),
      treasure("garnet", "Garnet", 1050),
    ],
  });
  const [pedlar] = rich.projectRoom(begin(rich)).creatures;
  assert.deepEqual(pedlar.treasureSale, {
    count: 2,
    coin: "35 gp 5 sp",
    minutes: 20,
  });
  const poor = createFifthRuntime(marketBarrow, TEST_FIGHTER);
  assert.equal(
    poor.projectRoom(begin(poor)).creatures[0].treasureSale,
    undefined,
  );
});

test("a shield the character's hands can't hold says what to do to hold it", () => {
  const holding = (equipment) => ({ ...TEST_FIGHTER, equipment, stowed: [] });
  assert.deepEqual(
    itemStats("shield", holding(["leather", "dagger", "dagger"])).compare,
    ["To hold it, unequip the dagger first."],
  );
  assert.deepEqual(
    itemStats("shield", holding(["leather", "greatsword"])).compare,
    ["To hold it, swap the greatsword for a one-handed weapon first."],
  );
});
