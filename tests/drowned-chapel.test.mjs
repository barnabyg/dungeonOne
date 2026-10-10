// #275: The Drowned Chapel, the level-3 Easy module, as the owner approved
// it: the drowned sexton, a Zombie, guards the chapel's silver in a flooded
// nave, and the vestry beyond holds the parish alms. Journeys reach its
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

const chapel = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "drowned-chapel",
);
const room = (id) => chapel.rooms.find((entry) => entry.id === id);
/** The loot in a room: treasure, coin and potions. */
const lootIn = (roomId) =>
  room(roomId).items.map(({ id, hiddenIn }) => [id, hiddenIn]);

test("the chapel is a three-room level-3 Easy module, entered and left by the porch", () => {
  assert.equal(chapel.title, "The Drowned Chapel");
  assert.deepEqual(chapel.recommendedLevels, { min: 3, max: 3 });
  assert.equal(chapel.difficulty, "easy");
  assert.equal(chapel.startRoomId, "chapel-porch");
  assert.deepEqual(
    chapel.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["chapel-porch"],
  );
  assert.deepEqual(
    chapel.passages.map(({ between, door, trap }) => [between, door, trap]),
    [
      [["chapel-porch", "flooded-nave"], undefined, undefined],
      [["flooded-nave", "vestry"], undefined, undefined],
    ],
  );
  assert.deepEqual(
    chapel.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-silver", "escape-with-loot", 300],
      ["out-of-the-chapel", "escape-without-loot", undefined],
      ["drowned-in-the-chapel", "defeat", undefined],
    ],
  );
});

test("its one fight is a lone Zombie, the Drowned Sexton, which carries nothing", () => {
  assert.deepEqual(
    chapel.encounters.map(({ id, opponents }) => [
      id,
      room("flooded-nave").encounterId === id,
      opponents.map(({ name, statBlock }) => [name, statBlock.name]),
    ]),
    [["drowned-sexton", true, [["Drowned Sexton", "Zombie"]]]],
  );
  assert.ok(
    chapel.rooms.every(({ items }) =>
      items.every(({ hiddenIn }) => hiddenIn !== "drowned-sexton"),
    ),
  );
});

test("nothing lies at the porch: all the loot is behind the sexton", () => {
  assert.deepEqual(lootIn("chapel-porch"), []);
  assert.deepEqual(requiredPath(chapel).roomIds, [
    "chapel-porch",
    "flooded-nave",
  ]);
  assert.deepEqual(lootIn("flooded-nave"), [
    ["silver-reliquary", "sunken-altar"],
    ["moss-agate", "sunken-altar"],
  ]);
  assert.deepEqual(lootIn("vestry"), [
    ["parish-alms", "alms-cupboard"],
    ["vestry-potion", "alms-cupboard"],
    ["chrysoprase-fob", "alms-cupboard"],
  ]);
});

test("its treasure is 94% of the level-3 budget", () => {
  // In copper: 425 gp of 450 gp.
  assert.equal(findableValue(chapel), 42500);
  assert.equal(treasureBudget(3), 45000);
});

const FULL_CLEAR = [
  ["move", "flooded-nave"],
  ["examine", "sunken-altar"],
  ["take", "silver-reliquary"],
  ["take", "moss-agate"],
  ["move", "vestry"],
  ["examine", "alms-cupboard"],
  ["take", "parish-alms"],
  ["take", "vestry-potion"],
  ["take", "chrysoprase-fob"],
  ["move", "flooded-nave"],
  ["move", "chapel-porch"],
  ["leave", "chapel-porch"],
];

test("a level-3 Fighter puts the sexton down and wades out with the silver", () => {
  const { state, runtime } = firstJourney(
    chapel,
    testFighterAt(3),
    FULL_CLEAR,
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-silver");
  assert.deepEqual(state.inventory, [
    "silver-reliquary",
    "moss-agate",
    "vestry-potion",
    "chrysoprase-fob",
  ]);
  // 60 gp and 50 sp, in copper: the test fighter brings an empty purse.
  assert.equal(state.possessions.purse, 6000 + 500);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Drowned Sexton", 50],
    ["Out with the chapel silver", 300],
  ]);
});

test("one who turns back at the porch leaves empty-handed, with no XP", () => {
  const { state, runtime } = firstJourney(
    chapel,
    testFighterAt(3),
    [["leave", "chapel-porch"]],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-of-the-chapel");
  assert.deepEqual(xpOf(runtime, state), []);
});
