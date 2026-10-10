// #275: The Shepherd's Bothy, the first Easy module, as the owner approved
// it: a lone Bandit in a moorland bothy with the market's takings, and a
// lean-to behind it with a potion and a bloodstone. Journeys reach its
// endings; shipped-modules.test.mjs checks it qualifies at its declared
// difficulty, with the gate figures its proposal quotes.
import assert from "node:assert/strict";
import test from "node:test";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { requiredPath } from "../dist/balance-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";

const bothy = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "shepherds-bothy",
);
const room = (id) => bothy.rooms.find((entry) => entry.id === id);
/** The loot in a room: treasure, coin and potions. */
const lootIn = (roomId) =>
  room(roomId).items.map(({ id, hiddenIn }) => [id, hiddenIn]);

test("the bothy is a three-room level-2 Easy module, entered and left by the sheepfold", () => {
  assert.equal(bothy.title, "The Shepherd's Bothy");
  assert.deepEqual(bothy.recommendedLevels, { min: 2, max: 2 });
  assert.equal(bothy.difficulty, "easy");
  assert.equal(bothy.startRoomId, "sheepfold");
  assert.deepEqual(
    bothy.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["sheepfold"],
  );
  assert.deepEqual(
    bothy.passages.map(({ between, door, trap }) => [between, door, trap]),
    [
      [["sheepfold", "bothy"], undefined, undefined],
      [["bothy", "lean-to"], undefined, undefined],
    ],
  );
  assert.deepEqual(
    bothy.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-takings", "escape-with-loot", 200],
      ["out-of-the-bothy", "escape-without-loot", undefined],
      ["fallen-at-the-bothy", "defeat", undefined],
    ],
  );
});

test("its one fight is a lone Bandit, the Moor Bandit", () => {
  assert.deepEqual(
    bothy.encounters.map(({ id, opponents }) => [
      id,
      room("bothy").encounterId === id,
      opponents.map(({ name, statBlock }) => [name, statBlock.name]),
    ]),
    [["bothy-bandit", true, [["Moor Bandit", "Bandit"]]]],
  );
});

test("nothing lies in the sheepfold: all the loot is behind the bandit", () => {
  assert.deepEqual(lootIn("sheepfold"), []);
  assert.deepEqual(requiredPath(bothy).roomIds, ["sheepfold", "bothy"]);
  assert.deepEqual(lootIn("bothy"), [
    ["market-gold", "open-strongbox"],
    ["enamel-brooch", "open-strongbox"],
    ["pallet-sapphire", "straw-pallet"],
    ["bothy-bandit-coins", "bothy-bandit"],
  ]);
  assert.deepEqual(lootIn("lean-to"), [
    ["lean-to-potion", "peat-stack"],
    ["bloodstone", "peat-stack"],
  ]);
});

test("its treasure is 95% of the level-2 budget, the bandit's coins rolled from its treasure type", () => {
  // Rolled with `npm run loot -- adventures/5e/shepherds-bothy.json --seed 275`.
  const coins = room("bothy").items.find(
    ({ id }) => id === "bothy-bandit-coins",
  );
  assert.deepEqual(coins.coins, { sp: 11 });
  // In copper: 286 gp 1 sp of 300 gp.
  assert.equal(findableValue(bothy), 28610);
  assert.equal(treasureBudget(2), 30000);
});

const FULL_CLEAR = [
  ["move", "bothy"],
  ["examine", "open-strongbox"],
  ["take", "market-gold"],
  ["take", "enamel-brooch"],
  ["examine", "straw-pallet"],
  ["take", "pallet-sapphire"],
  ["examine", "bothy-bandit"],
  ["take", "bothy-bandit-coins"],
  ["move", "lean-to"],
  ["examine", "peat-stack"],
  ["take", "lean-to-potion"],
  ["take", "bloodstone"],
  ["move", "bothy"],
  ["move", "sheepfold"],
  ["leave", "sheepfold"],
];

test("a level-2 Fighter clears the bothy and walks out with the takings", () => {
  const { state, runtime } = firstJourney(
    bothy,
    testFighterAt(2),
    FULL_CLEAR,
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-takings");
  assert.deepEqual(state.inventory, [
    "enamel-brooch",
    "pallet-sapphire",
    "lean-to-potion",
    "bloodstone",
  ]);
  // 60 gp and 11 sp, in copper: the test fighter brings an empty purse.
  assert.equal(state.possessions.purse, 6000 + 110);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Moor Bandit", 25],
    ["Out with the takings", 200],
  ]);
});

test("one who turns back at the sheepfold leaves empty-handed, with no XP", () => {
  const { state, runtime } = firstJourney(
    bothy,
    testFighterAt(2),
    [["leave", "sheepfold"]],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-of-the-bothy");
  assert.deepEqual(xpOf(runtime, state), []);
});
