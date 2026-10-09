// #275: The Ravager's Tower, the level-3 Hard module, as the owner approved
// it: a dead pedlar's two potions at the foot of a ruined watchtower, and a
// Gnoll Ravager at the top with the plunder of the road. Journeys reach its
// endings; shipped-modules.test.mjs checks it qualifies at its declared
// difficulty.
import assert from "node:assert/strict";
import test from "node:test";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { gateAdventure, requiredPath } from "../dist/balance-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";

const tower = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "ravagers-tower",
);
const room = (id) => tower.rooms.find((entry) => entry.id === id);
/** The items in a room, with what each is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, hiddenIn }) => [id, kind, hiddenIn]);

test("the tower is a two-room level-3 Hard module, entered and left by the tower foot", () => {
  assert.equal(tower.title, "The Ravager's Tower");
  assert.deepEqual(tower.recommendedLevels, { min: 3, max: 3 });
  assert.equal(tower.difficulty, "hard");
  assert.equal(tower.startRoomId, "tower-foot");
  assert.deepEqual(
    tower.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["tower-foot"],
  );
  assert.deepEqual(
    tower.passages.map(({ between, door, trap }) => [between, door, trap]),
    [[["tower-foot", "gnoll-roost"], undefined, undefined]],
  );
  assert.deepEqual(
    tower.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-plunder", "escape-with-loot", 400],
      ["out-of-the-tower", "escape-without-loot", undefined],
      ["fallen-in-the-tower", "defeat", undefined],
    ],
  );
});

test("its one fight is the Gnoll Ravager, an ordinary enemy with Multiattack", () => {
  assert.deepEqual(
    tower.encounters.map(({ id, opponents }) => [
      id,
      room("gnoll-roost").encounterId === id,
      opponents.map(({ name, boss, statBlock }) => [
        name,
        boss,
        statBlock.challengeRating,
        statBlock.multiattack !== undefined,
      ]),
    ]),
    [["ravager", true, [["Gnoll Ravager", undefined, "1", true]]]],
  );
});

test("only potions lie at the tower foot: the loot is all behind the gnoll", () => {
  assert.deepEqual(itemsIn("tower-foot"), [
    ["pedlar-potion", "potion-of-healing", "dead-pedlar"],
    ["pedlar-second-potion", "potion-of-healing", "dead-pedlar"],
  ]);
  assert.deepEqual(requiredPath(tower).roomIds, ["tower-foot", "gnoll-roost"]);
  assert.deepEqual(itemsIn("gnoll-roost"), [
    ["pedlar-cashbox", "coin", "plunder-heap"],
    ["gilt-icon", "treasure", "plunder-heap"],
    ["pearl-earrings", "treasure", "plunder-heap"],
    ["tower-gnoll-coins", "coin", "tower-gnoll"],
  ]);
});

test("its treasure is 98% of the level-3 budget, the gnoll's coins rolled from its treasure type", () => {
  // Rolled with `npm run loot -- adventures/5e/ravagers-tower.json --seed 275`.
  const coins = room("gnoll-roost").items.find(
    ({ id }) => id === "tower-gnoll-coins",
  );
  assert.deepEqual(coins.coins, { sp: 11 });
  // In copper: 441 gp 1 sp of 450 gp.
  assert.equal(findableValue(tower), 44110);
  assert.equal(treasureBudget(3), 45000);
});

test("the gate qualifies it as Hard, mid-band, with the figures the proposal quotes", () => {
  const result = gateAdventure(tower);
  assert.equal(result.ok, true);
  const { verdict } = result;
  assert.equal(verdict.qualified, true);
  // 6.5 points over Hard's 75%, and 6.5 under the 88% that would make it
  // Medium (82.0% until the Champion's initiative advantage, #315).
  assert.deepEqual(
    [verdict.survival.level, verdict.survival.kit, verdict.survival.rate],
    [3, "mace", 0.815],
  );
  assert.deepEqual(verdict.oneHitKill.overCap, []);
  assert.deepEqual(
    verdict.oneHitKill.enemies.map(({ opponentId, chance }) => [
      opponentId,
      chance,
    ]),
    [["tower-gnoll", 0]],
  );
  assert.equal(verdict.xp.available, 600);
});

const POTIONS = [
  ["examine", "dead-pedlar"],
  ["take", "pedlar-potion"],
  ["take", "pedlar-second-potion"],
];

const FULL_CLEAR = [
  ...POTIONS,
  ["move", "gnoll-roost"],
  ["examine", "plunder-heap"],
  ["take", "pedlar-cashbox"],
  ["take", "gilt-icon"],
  ["take", "pearl-earrings"],
  ["examine", "tower-gnoll"],
  ["take", "tower-gnoll-coins"],
  ["move", "tower-foot"],
  ["leave", "tower-foot"],
];

const level3 = testFighterAt(3);

test("a level-3 Fighter kills the gnoll and climbs down with the plunder", () => {
  const { state, runtime } = firstJourney(
    tower,
    level3,
    FULL_CLEAR,
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-plunder");
  for (const id of ["gilt-icon", "pearl-earrings"]) {
    assert.ok(state.inventory.includes(id), id);
  }
  // 40 gp and 11 sp, in copper: the test fighter brings an empty purse.
  assert.equal(state.possessions.purse, 4000 + 110);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Gnoll Ravager", 200],
    ["Out with the plunder", 400],
  ]);
});

test("the gnoll can still win against both potions", () => {
  const { state } = firstJourney(
    tower,
    level3,
    [...POTIONS, ["move", "gnoll-roost"]],
    ({ status }) => status === "defeat",
  );
  assert.equal(state.endingId, "fallen-in-the-tower");
});

test("taking the potions and leaving is escaping without loot: potions are not loot", () => {
  const { state, runtime } = firstJourney(
    tower,
    level3,
    [...POTIONS, ["leave", "tower-foot"]],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-of-the-tower");
  assert.deepEqual(xpOf(runtime, state), []);
});
