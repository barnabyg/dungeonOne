// #275: The Gravedigger's Lodge, the level-2 Hard module, as the owner
// approved it: two potions at the lychgate, then a false gravedigger, a
// Bandit, and the corpse he dug up, a Zombie, fighting together over the
// stolen grave goods. Journeys reach its endings; shipped-modules.test.mjs
// checks it qualifies at its declared difficulty, with the gate figures its
// proposal quotes.
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

const lodge = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "gravediggers-lodge",
);
const room = (id) => lodge.rooms.find((entry) => entry.id === id);
/** The items in a room, with what each is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, hiddenIn }) => [id, kind, hiddenIn]);

test("the lodge is a two-room level-2 Hard module, entered and left by the lychgate", () => {
  assert.equal(lodge.title, "The Gravedigger's Lodge");
  assert.deepEqual(lodge.recommendedLevels, { min: 2, max: 2 });
  assert.equal(lodge.difficulty, "hard");
  assert.equal(lodge.startRoomId, "lychgate");
  assert.deepEqual(
    lodge.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["lychgate"],
  );
  assert.deepEqual(
    lodge.passages.map(({ between, door, trap }) => [between, door, trap]),
    [[["lychgate", "dead-house"], undefined, undefined]],
  );
  assert.deepEqual(
    lodge.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-grave-goods", "escape-with-loot", 300],
      ["out-of-the-churchyard", "escape-without-loot", undefined],
      ["laid-out-in-the-dead-house", "defeat", undefined],
    ],
  );
});

test("its one fight is a Bandit and a Zombie together in the dead-house", () => {
  assert.deepEqual(
    lodge.encounters.map(({ id, opponents }) => [
      id,
      room("dead-house").encounterId === id,
      opponents.map(({ id, name, statBlock }) => [id, name, statBlock.name]),
    ]),
    [
      [
        "dead-house-fight",
        true,
        [
          ["false-gravedigger", "False Gravedigger", "Bandit"],
          ["risen-corpse", "Risen Corpse", "Zombie"],
        ],
      ],
    ],
  );
});

test("only potions lie at the lychgate: the loot is all behind the fight", () => {
  assert.deepEqual(itemsIn("lychgate"), [
    ["lychgate-potion", "potion-of-healing", "coffin-rest"],
    ["lychgate-second-potion", "potion-of-healing", "coffin-rest"],
  ]);
  assert.deepEqual(requiredPath(lodge).roomIds, ["lychgate", "dead-house"]);
  assert.deepEqual(itemsIn("dead-house"), [
    ["mourning-ring", "treasure", "dragged-coffin"],
    ["jet-cameo", "treasure", "dragged-coffin"],
    ["grave-tourmaline", "treasure", "dragged-coffin"],
    ["grave-coin", "coin", "dragged-coffin"],
    ["false-gravedigger-coins", "coin", "false-gravedigger"],
  ]);
});

test("its treasure is 97% of the level-2 budget, the bandit's coins rolled from its treasure type", () => {
  // Rolled with `npm run loot -- adventures/5e/gravediggers-lodge.json --seed 275`.
  const coins = room("dead-house").items.find(
    ({ id }) => id === "false-gravedigger-coins",
  );
  assert.deepEqual(coins.coins, { sp: 11 });
  // In copper: 291 gp 1 sp of 300 gp.
  assert.equal(findableValue(lodge), 29110);
  assert.equal(treasureBudget(2), 30000);
});

const POTIONS = [
  ["examine", "coffin-rest"],
  ["take", "lychgate-potion"],
  ["take", "lychgate-second-potion"],
];

const FULL_CLEAR = [
  ...POTIONS,
  ["move", "dead-house"],
  ["examine", "dragged-coffin"],
  ["take", "mourning-ring"],
  ["take", "jet-cameo"],
  ["take", "grave-tourmaline"],
  ["take", "grave-coin"],
  ["examine", "false-gravedigger"],
  ["take", "false-gravedigger-coins"],
  ["move", "lychgate"],
  ["leave", "lychgate"],
];

const level2 = testFighterAt(2);

test("a level-2 Fighter wins the dead-house fight and walks out with the grave goods", () => {
  const { state, runtime } = firstJourney(
    lodge,
    level2,
    FULL_CLEAR,
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-grave-goods");
  for (const id of ["mourning-ring", "jet-cameo", "grave-tourmaline"]) {
    assert.ok(state.inventory.includes(id), id);
  }
  // 40 gp and 11 sp, in copper: the test fighter brings an empty purse.
  assert.equal(state.possessions.purse, 4000 + 110);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated False Gravedigger and Risen Corpse", 75],
    ["Out with the grave goods", 300],
  ]);
});

test("the dead-house fight can still be lost with both potions in hand", () => {
  const { state } = firstJourney(
    lodge,
    level2,
    [...POTIONS, ["move", "dead-house"]],
    ({ status }) => status === "defeat",
  );
  assert.equal(state.endingId, "laid-out-in-the-dead-house");
});

test("taking the potions and leaving is escaping without loot: potions are not loot", () => {
  const { state, runtime } = firstJourney(
    lodge,
    level2,
    [...POTIONS, ["leave", "lychgate"]],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-of-the-churchyard");
  assert.deepEqual(state.inventory, [
    "lychgate-potion",
    "lychgate-second-potion",
  ]);
  assert.deepEqual(xpOf(runtime, state), []);
});
