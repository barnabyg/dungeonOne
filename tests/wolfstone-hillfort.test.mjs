// #289: The Wolfstone Hillfort, the level 3–4 Hard module, as the owner
// approved it: a drover who trades at the camp below an old hillfort, the
// Reaver's dire wolf in the ditch, a brown bear in the undercroft and the
// Reaver himself in the keep, with graded checks that open and close the
// ways in. Journeys reach its endings and its checks; shipped-modules.test.mjs
// checks it qualifies at its declared difficulty.
import assert from "node:assert/strict";
import test from "node:test";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { gateAdventure, requiredPath } from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";

const hillfort = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "wolfstone-hillfort",
);
const room = (id) => hillfort.rooms.find((entry) => entry.id === id);
/** The items in a room, with what each is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, hiddenIn }) => [id, kind, hiddenIn]);

test("the hillfort is a six-room level 3–4 Hard module, entered and left by the drovers' camp", () => {
  assert.equal(hillfort.title, "The Wolfstone Hillfort");
  assert.deepEqual(hillfort.recommendedLevels, { min: 3, max: 4 });
  assert.equal(hillfort.difficulty, "hard");
  assert.equal(hillfort.startRoomId, "drovers-camp");
  assert.deepEqual(
    hillfort.rooms.map(({ id }) => id),
    [
      "drovers-camp",
      "outer-ditch",
      "watchtower",
      "gatehouse",
      "undercroft",
      "keep-hall",
    ],
  );
  assert.deepEqual(
    hillfort.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["drovers-camp"],
  );
  assert.deepEqual(
    hillfort.passages.map(({ id, between, hidden, door }) => [
      id,
      between,
      hidden === true,
      door?.state,
    ]),
    [
      ["camp-to-ditch", ["drovers-camp", "outer-ditch"], false, undefined],
      ["camp-to-watchtower", ["drovers-camp", "watchtower"], true, undefined],
      ["ditch-to-gatehouse", ["outer-ditch", "gatehouse"], false, "stuck"],
      [
        "gatehouse-to-undercroft",
        ["gatehouse", "undercroft"],
        false,
        undefined,
      ],
      ["undercroft-to-keep", ["undercroft", "keep-hall"], false, undefined],
      ["gatehouse-to-keep-bridge", ["gatehouse", "keep-hall"], true, undefined],
    ],
  );
  assert.deepEqual(
    hillfort.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-plunder", "escape-with-loot", 500],
      ["out-empty-handed", "escape-without-loot", undefined],
      ["fallen-at-wolfstone", "defeat", undefined],
    ],
  );
});

test("its fights are the Reaver's dire wolf, a brown bear and the Reaver, its one boss", () => {
  assert.deepEqual(
    hillfort.encounters.map(({ id, opponents, victoryEndingId }) => [
      id,
      hillfort.rooms.find(({ encounterId }) => encounterId === id).id,
      victoryEndingId,
      opponents.map(({ name, boss, statBlock }) => [
        name,
        boss,
        statBlock.challengeRating,
      ]),
    ]),
    [
      [
        "ditch-wolf",
        "outer-ditch",
        undefined,
        [["Reaver's Wolf", undefined, "1"]],
      ],
      [
        "undercroft-bear",
        "undercroft",
        undefined,
        [["Brown Bear", undefined, "1"]],
      ],
      [
        "keep-reaver",
        "keep-hall",
        undefined,
        [["The Wolfstone Reaver", true, "2"]],
      ],
    ],
  );
});

test("Wenna the Drover trades shield, chain shirt, longsword and chain mail at the camp", () => {
  const [wenna] = room("drovers-camp").creatures;
  assert.equal(wenna.name, "Wenna the Drover");
  assert.deepEqual(wenna.merchant, {
    stock: ["shield", "chain-shirt", "longsword", "chain-mail"],
    minutes: 10,
  });
  assert.deepEqual(
    wenna.topics.map(({ id, check }) => [id, check !== undefined]),
    [
      ["the-hillfort", false],
      ["the-sheep-track", true],
    ],
  );
});

test("only a potion and a crowbar lie at the camp: the first loot is behind the wolf", () => {
  assert.deepEqual(itemsIn("drovers-camp"), [
    ["cart-potion", "potion-of-healing", "drovers-cart"],
    ["crowbar", "tool", "drovers-cart"],
  ]);
  assert.deepEqual(requiredPath(hillfort).roomIds, [
    "drovers-camp",
    "outer-ditch",
  ]);
  assert.deepEqual(itemsIn("outer-ditch"), [
    ["drovers-purse", "coin", "wolf-lair"],
    ["silver-bell", "treasure", "wolf-lair"],
  ]);
  assert.deepEqual(itemsIn("watchtower"), [
    ["knotted-rope", "tool", "lookout-niche"],
    ["watchtower-potion", "potion-of-healing", "lookout-niche"],
  ]);
  assert.deepEqual(itemsIn("gatehouse"), [
    ["bloodstone", "treasure", "guard-locker"],
  ]);
  assert.deepEqual(itemsIn("undercroft"), [
    ["undercroft-potion", "potion-of-healing", "bear-bones"],
    ["moonstone", "treasure", "bear-bones"],
  ]);
  assert.deepEqual(itemsIn("keep-hall"), [
    ["drinking-horn", "treasure", "reaver-strongbox"],
    ["reaver-gold", "coin", "reaver-strongbox"],
    ["wolfstone-reaver-coins", "coin", "wolfstone-reaver"],
  ]);
});

const ROLLED_REAVER_COINS = { gp: 6 };

test("its treasure is 97% of the level-4 budget, the Reaver's gold rolled from its treasure type", () => {
  // Rolled with `npm run loot -- adventures/5e/wolfstone-hillfort.json --seed 289`.
  const coins = room("keep-hall").items.find(
    ({ id }) => id === "wolfstone-reaver-coins",
  );
  assert.deepEqual(coins.coins, ROLLED_REAVER_COINS);
  assert.equal(findableValue(hillfort), 58000 + ROLLED_REAVER_COINS.gp * 100);
  assert.equal(treasureBudget(4), 60000);
});

test("the gate qualifies it as Hard on seeded and always-failing checks, with the figures the proposal quotes", () => {
  const result = gateAdventure(hillfort);
  assert.equal(result.ok, true);
  const { verdict } = result;
  assert.equal(verdict.qualified, true);
  // 5.5 points over Hard's 75%, and 7.5 under the 88% that would make it
  // Medium (83.0% and 84.0% until the Champion's initiative advantage, #315,
  // moved the dice).
  assert.deepEqual(
    [verdict.survival.level, verdict.survival.kit, verdict.survival.rate],
    [3, "two-daggers", 0.805],
  );
  assert.deepEqual(
    [verdict.alwaysFail.level, verdict.alwaysFail.rate],
    [3, 0.81],
  );
  assert.deepEqual(verdict.oneHitKill.overCap, []);
  // Every fight's XP and the plunder's 500.
  assert.equal(verdict.xp.available, 200 + 200 + 450 + 500);
});

// The checks, with scripted dice. testFighterAt(3): Athletics +5,
// Acrobatics +2, Persuasion −1, Intimidation −1.
const level3 = testFighterAt(3);
const runtime = createFifthRuntime(hillfort, level3);

function accepted(state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  if (random.remaining !== undefined) {
    assert.equal(random.remaining(), 0, "every queued die is drawn");
  }
  return result.state;
}

const begun = accepted(runtime.createSession(), { type: "begin" }, dice());
/** The exits offered from the current room, by passage. */
const exits = (state) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === "move" && available)
    .map(({ target }) => target.id);

test("winning Wenna over with Persuasion opens the sheep track to the watchtower", () => {
  assert.deepEqual(exits(begun), ["outer-ditch"]);
  const talked = accepted(
    begun,
    { type: "talk", topicId: "the-sheep-track", approach: "persuasion" },
    dice([20, 15]),
  );
  assert.deepEqual(exits(talked), ["outer-ditch", "watchtower"]);
});

test("failing to win Wenna over leaves the track closed, and she won't be asked again", () => {
  const talked = accepted(
    begun,
    { type: "talk", topicId: "the-sheep-track", approach: "intimidation" },
    dice([20, 10]),
  );
  assert.deepEqual(exits(talked), ["outer-ditch"]);
  const again = runtime.handleAction(
    talked,
    { type: "talk", topicId: "the-sheep-track", approach: "persuasion" },
    dice(),
  );
  assert.equal(again.rejection?.code, "already-asked");
});

/**
 * A level-3 Fighter who has killed the wolf on a seed and stands in the
 * ditch before the portcullis, with the crowbar or without.
 */
const ditchAfterWolf = (route) =>
  firstJourney(
    hillfort,
    level3,
    [...route, ["move", "outer-ditch"]],
    ({ status, roomId }) => status === "playing" && roomId === "outer-ditch",
  ).state;
const atPortcullis = ditchAfterWolf([
  ["examine", "drovers-cart"],
  ["take", "crowbar"],
]);
const FORCE = { type: "force", doorId: "rusted-portcullis" };

test("with the crowbar, Remarkable Athlete forces the portcullis at advantage: the better of two d20s", () => {
  // 4 + 5 = 9 fails; 12 + 5 = 17 beats DC 15.
  const forced = runtime.handleAction(
    atPortcullis,
    FORCE,
    dice([20, 4], [20, 12]),
  );
  assert.match(
    runtime.renderResult(forced),
    /^Athletics check, at advantage \(Remarkable Athlete\)/u,
  );
  assert.ok(exits(forced.state).includes("gatehouse"));
});

test("without a lever, the portcullis cancels Remarkable Athlete: one d20", () => {
  const bare = ditchAfterWolf([]);
  // 12 + 5 = 17 beats DC 15, on a single die.
  const forced = runtime.handleAction(bare, FORCE, dice([20, 12]));
  assert.equal(forced.rejection, undefined);
  assert.ok(exits(forced.state).includes("gatehouse"));
});

test("a portcullis that holds may be tried again for 1d4 bludgeoning damage", () => {
  const held = accepted(atPortcullis, FORCE, dice([20, 3], [20, 4]));
  assert.ok(!exits(held).includes("gatehouse"));
  const hp = held.character.hp;
  const forced = accepted(
    held,
    { ...FORCE, retry: true },
    dice([4, 2], [20, 15], [20, 1]),
  );
  assert.equal(forced.character.hp, hp - 2);
  assert.ok(exits(forced).includes("gatehouse"));
});

/** The same Fighter in the gatehouse, the portcullis forced. */
const inGatehouse = accepted(
  accepted(atPortcullis, FORCE, dice([20, 20], [20, 20])),
  { type: "move", destinationId: "gatehouse" },
  dice(),
);
const CROSS = { type: "examine", targetId: "rope-bridge" };

test("crossing the rope bridge with Acrobatics opens the way to the keep", () => {
  assert.deepEqual(exits(inGatehouse), ["outer-ditch", "undercroft"]);
  // 11 + 2 = 13 meets DC 13.
  const crossed = accepted(
    inGatehouse,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 11]),
  );
  assert.deepEqual(exits(crossed), ["outer-ditch", "undercroft", "keep-hall"]);
});

test("the Knotted Rope gives the Acrobatics approach advantage", () => {
  // 2 + 2 = 4 fails; 11 + 2 = 13 meets DC 13, at advantage.
  const roped = {
    ...inGatehouse,
    inventory: [...inGatehouse.inventory, "knotted-rope"],
  };
  const crossed = accepted(
    roped,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 2], [20, 11]),
  );
  assert.ok(exits(crossed).includes("keep-hall"));
});

test("failing the bridge by 5 drops you 2d6 and closes it for good: the undercroft is still the way on", () => {
  // 1 + 2 = 3, failure by 5 or more against DC 13.
  const hp = inGatehouse.character.hp;
  const fallen = accepted(
    inGatehouse,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 1], [6, 3], [6, 4]),
  );
  assert.equal(fallen.character.hp, hp - 7);
  assert.deepEqual(exits(fallen), ["outer-ditch", "undercroft"]);
  // A closed way offers no other try.
  const again = runtime.handleAction(
    fallen,
    { ...CROSS, approach: "acrobatics", retry: true },
    dice(),
  );
  assert.equal(again.rejection?.code, "no-retry");
});

test("a plain failure on the bridge may be tried again for 1d4 bludgeoning damage", () => {
  // 8 + 2 = 10: failure, not by 5.
  const balked = accepted(
    inGatehouse,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 8]),
  );
  assert.deepEqual(exits(balked), ["outer-ditch", "undercroft"]);
  const crossed = accepted(
    balked,
    { ...CROSS, approach: "acrobatics", retry: true },
    dice([4, 1], [20, 15]),
  );
  assert.equal(crossed.character.hp, balked.character.hp - 1);
  assert.ok(exits(crossed).includes("keep-hall"));
});

const POTION_AND_CROWBAR = [
  ["examine", "drovers-cart"],
  ["take", "cart-potion"],
  ["take", "crowbar"],
];
const WOLF_LOOT = [
  ["move", "outer-ditch"],
  ["examine", "wolf-lair"],
  ["take", "drovers-purse"],
  ["take", "silver-bell"],
];

test("a level-3 Fighter kills the wolf and walks out with the drover's purse and bell", () => {
  const { state, runtime: played } = firstJourney(
    hillfort,
    level3,
    [
      ...POTION_AND_CROWBAR,
      ...WOLF_LOOT,
      ["move", "drovers-camp"],
      ["leave", "drovers-camp"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-plunder");
  assert.ok(state.inventory.includes("silver-bell"));
  assert.equal(state.possessions.purse, 2500);
  assert.deepEqual(xpOf(played, state), [
    ["Defeated Reaver's Wolf", 200],
    ["Out with the plunder", 500],
  ]);
});

test("the wolf can still win, potion and all", () => {
  const { state } = firstJourney(
    hillfort,
    level3,
    [...POTION_AND_CROWBAR, ["move", "outer-ditch"]],
    ({ status }) => status === "defeat",
  );
  assert.equal(state.endingId, "fallen-at-wolfstone");
});

test("taking the potion and leaving is escaping without loot", () => {
  const { state, runtime: played } = firstJourney(
    hillfort,
    level3,
    [...POTION_AND_CROWBAR, ["leave", "drovers-camp"]],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-empty-handed");
  assert.deepEqual(xpOf(played, state), []);
});

test("a level-4 Fighter can force the portcullis, kill the bear and take the undercroft's moonstone", () => {
  const { state } = firstJourney(
    hillfort,
    testFighterAt(4),
    [
      ...POTION_AND_CROWBAR,
      ...WOLF_LOOT,
      ["force", "rusted-portcullis"],
      ["move", "gatehouse"],
      ["examine", "guard-locker"],
      ["take", "bloodstone"],
      ["move", "undercroft"],
      ["examine", "bear-bones"],
      ["take", "undercroft-potion"],
      ["take", "moonstone"],
      ["move", "gatehouse"],
      ["move", "outer-ditch"],
      ["move", "drovers-camp"],
      ["leave", "drovers-camp"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-plunder");
  for (const id of ["silver-bell", "bloodstone", "moonstone"]) {
    assert.ok(state.inventory.includes(id), id);
  }
});
