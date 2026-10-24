// #291, #445: The Thornwood Lodge, the long level 4–5 Hard module, as the
// owner approved its expansion on #444: Captain Hesk's lodge, where a
// charcoal-burner trades at the forest gate, the hound and a mastiff hold the
// kennel yard, a bear that can be fed baits in the hall, an owlbear nests in
// the ice house and the captain keeps the solar; and the Wolfstone above it,
// the Hillfort's six rooms (#289) with a sheepfold and a guardroom added,
// where a drover trades and the Reaver's wolf, two ghouls (#557) and the
// Reaver hold the fort. Since #544 the wolf's lair hides a run under the rampart into the
// guardroom, found with Nature or Survival, and forcing the portcullis rouses
// the Wolfstone, which rolls its wandering table. Journeys reach its
// endings and its checks; shipped-modules.test.mjs checks it qualifies at
// its declared difficulty, with the gate figures its proposal quotes.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { requiredPath } from "../dist/balance-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { startSavedAdventureOverHttp } from "../dist/dm-evaluation-5e.js";
import { generateReleaseRun, playReleaseRun } from "../dist/release-run-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  levelFourCareerLibrary,
  testFighterAt,
} from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";
import { narratingDm } from "./fixtures/session-layout.mjs";

const lodge = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "thornwood-lodge",
);
const room = (id) => lodge.rooms.find((entry) => entry.id === id);
const feature = (roomId, id) =>
  room(roomId).features.find((entry) => entry.id === id);
/** The items in a room, with what each is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, hiddenIn }) => [id, kind, hiddenIn]);
const roomIds = (keep) => lodge.rooms.filter(keep).map(({ id }) => id);

test("the lodge is a sixteen-room long level 4–5 Hard module in two regions, left by the forest gate or the drovers' camp", () => {
  assert.equal(lodge.title, "The Thornwood Lodge");
  assert.deepEqual(lodge.recommendedLevels, { min: 4, max: 5 });
  assert.equal(lodge.difficulty, "hard");
  assert.equal(lodge.long, true);
  assert.equal(lodge.startRoomId, "forest-gate");
  assert.deepEqual(
    lodge.regions.map(({ id, name }) => [
      id,
      name,
      roomIds(({ region }) => region === id),
    ]),
    [
      [
        "lodge",
        "The Lodge",
        [
          "forest-gate",
          "poachers-hide",
          "kennel-yard",
          "falconers-mews",
          "lodge-kitchen",
          "lodge-hall",
          "ice-house",
          "captains-solar",
        ],
      ],
      [
        "wolfstone",
        "The Wolfstone",
        [
          "drovers-camp",
          "sheepfold",
          "watchtower",
          "outer-ditch",
          "gatehouse",
          "guardroom",
          "undercroft",
          "keep-hall",
        ],
      ],
    ],
  );
  assert.deepEqual(
    roomIds(({ exit }) => exit),
    ["forest-gate", "drovers-camp"],
  );
  assert.deepEqual(
    roomIds(({ restSite }) => restSite),
    ["falconers-mews", "sheepfold"],
  );
  // The two rooms only talking opens, the two bosses and the Owlbear, the
  // Gaoler and the undercroft's ghouls (#444, decision 3): each route and sweep holds
  // one fight.
  assert.deepEqual(
    roomIds(({ avoidable }) => avoidable),
    [
      "poachers-hide",
      "ice-house",
      "captains-solar",
      "watchtower",
      "guardroom",
      "undercroft",
      "keep-hall",
    ],
  );
  assert.deepEqual(lodge.flags, ["bear-fed", "wolfstone-roused"]);
  // Only noise raises the alarm, and no fight runs long enough to (#544).
  assert.equal(lodge.alarm.flag, "wolfstone-roused");
  assert.equal(lodge.alarm.fights, undefined);
  assert.deepEqual(
    lodge.routes.map(({ id, rooms }) => [id, rooms]),
    [
      ["lodge-hall", ["kennel-yard", "lodge-kitchen", "lodge-hall"]],
      ["wolfstone-gate", ["drovers-camp", "outer-ditch", "gatehouse"]],
    ],
  );
  assert.deepEqual(
    lodge.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-spoils", "escape-with-loot", 3800],
      ["out-empty-handed", "escape-without-loot", undefined],
      ["fallen-in-the-thornwood", "defeat", undefined],
    ],
  );
  // Two exits now: the endings name neither.
  for (const { text } of lodge.endings) {
    assert.doesNotMatch(text, /forest gate|drovers' camp/iu);
  }
});

test("the hunt ride joins the two holds, and the hall door from the kennels is nailed shut", () => {
  assert.deepEqual(
    lodge.passages.map(({ id, between, hidden, trap, door }) => [
      id,
      between,
      hidden === true,
      trap?.id ?? door?.id,
    ]),
    [
      ["gate-to-yard", ["forest-gate", "kennel-yard"], false, undefined],
      ["gate-to-hide", ["forest-gate", "poachers-hide"], true, undefined],
      ["yard-to-mews", ["kennel-yard", "falconers-mews"], false, undefined],
      ["yard-to-kitchen", ["kennel-yard", "lodge-kitchen"], false, undefined],
      ["kitchen-to-hall", ["lodge-kitchen", "lodge-hall"], false, undefined],
      ["hall-to-ice-house", ["lodge-hall", "ice-house"], true, undefined],
      [
        "hall-to-solar",
        ["lodge-hall", "captains-solar"],
        false,
        "gallery-man-trap",
      ],
      ["hunt-ride", ["forest-gate", "drovers-camp"], false, undefined],
      ["camp-to-fold", ["drovers-camp", "sheepfold"], false, undefined],
      ["camp-to-watchtower", ["drovers-camp", "watchtower"], true, undefined],
      ["camp-to-ditch", ["drovers-camp", "outer-ditch"], false, undefined],
      [
        "ditch-to-gatehouse",
        ["outer-ditch", "gatehouse"],
        false,
        "rusted-portcullis",
      ],
      ["wolfs-run", ["outer-ditch", "guardroom"], true, undefined],
      ["gatehouse-to-guardroom", ["gatehouse", "guardroom"], false, undefined],
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
  assert.match(room("kennel-yard").description, /hall door is nailed shut/u);
});

test("its fights are sturdy beasts, the undercroft's ghouls and the two bosses, the hall's bear only until it is fed, with a wandering beast in each region", () => {
  assert.deepEqual(
    lodge.encounters.map(({ id, opponents, presentUntil }) => [
      id,
      lodge.rooms.find(({ encounterId }) => encounterId === id)?.id,
      presentUntil,
      opponents.map(({ name, boss, statBlock }) => [
        name,
        boss,
        statBlock.challengeRating,
      ]),
    ]),
    [
      [
        "yard-hound",
        "kennel-yard",
        undefined,
        [
          ["Hesk's Hound", undefined, "1"],
          // One mastiff since #310: two made the yard too deadly for a
          // level-4 Rogue.
          ["Kennel Mastiff", undefined, "1/8"],
        ],
      ],
      [
        "hall-bear",
        "lodge-hall",
        "bear-fed",
        [["Baiting Bear", undefined, "1"]],
      ],
      [
        "ice-house-owlbear",
        "ice-house",
        undefined,
        [["Owlbear", undefined, "3"]],
      ],
      [
        "solar-captain",
        "captains-solar",
        undefined,
        [["Captain Hesk", true, "3"]],
      ],
      [
        "ditch-wolf",
        "outer-ditch",
        undefined,
        [["Reaver's Wolf", undefined, "1"]],
      ],
      [
        "guardroom-gaoler",
        "guardroom",
        undefined,
        [["Reaver's Gaoler", undefined, "1"]],
      ],
      [
        // Ghouls since #557, so Turn Undead and Sear Undead have a foe here.
        "undercroft-ghouls",
        "undercroft",
        undefined,
        [
          ["Barrow Ghoul", undefined, "1"],
          ["Barrow Hag-Ghoul", undefined, "1"],
        ],
      ],
      [
        "keep-reaver",
        "keep-hall",
        undefined,
        [["The Wolfstone Reaver", true, "2"]],
      ],
      [
        "loose-mastiff",
        undefined,
        undefined,
        [["Loose Mastiff", undefined, "1/8"]],
      ],
      ["crag-wolf", undefined, undefined, [["Crag Wolf", undefined, "1/4"]]],
    ],
  );
  assert.deepEqual(
    lodge.regions.map(({ id, wandering }) => [
      id,
      wandering.chance,
      wandering.every,
      wandering.entries.map(({ encounterId }) => encounterId),
    ]),
    [
      ["lodge", 15, 4, ["loose-mastiff", undefined, undefined]],
      ["wolfstone", 15, 4, ["crag-wolf", undefined, undefined]],
    ],
  );
});

test("Brann sells the weapons at the gate and Wenna the armour at the camp", () => {
  const [brann] = room("forest-gate").creatures;
  assert.equal(brann.name, "Brann the Charcoal-burner");
  assert.deepEqual(brann.merchant, {
    stock: ["longsword", "greatsword"],
    minutes: 10,
  });
  assert.deepEqual(
    brann.topics.map(({ id, check }) => [id, check !== undefined]),
    [
      ["the-lodge", false],
      ["the-poachers-path", true],
    ],
  );
  // His word on the lodge points to the kitchen, where the bear is fed.
  assert.match(brann.topics[0].reply, /feeds it from the kitchen/u);
  const [wenna] = room("drovers-camp").creatures;
  assert.equal(wenna.name, "Wenna the Drover");
  assert.deepEqual(wenna.merchant, {
    stock: ["shield", "chain-shirt", "chain-mail"],
    minutes: 10,
  });
  assert.deepEqual(
    wenna.topics.map(({ id, check }) => [id, check !== undefined]),
    [
      ["the-hillfort", false],
      ["the-sheep-track", true],
    ],
  );
  assert.match(wenna.topics[0].reply, /Captain Hesk/u);
});

test("no loot lies in an exit or a rest site: the first loot is behind the kennel fight", () => {
  // The Pearl of Power (#540) is a caster item, not loot.
  assert.deepEqual(itemsIn("forest-gate"), [
    ["woodpile-potion", "potion-of-healing", "woodpile"],
    ["hooded-lantern", "tool", "woodpile"],
    ["oilskin-pearl", "caster-item", "woodpile"],
  ]);
  assert.deepEqual(itemsIn("drovers-camp"), [
    ["cart-potion", "potion-of-healing", "drovers-cart"],
    ["crowbar", "tool", "drovers-cart"],
  ]);
  assert.deepEqual(itemsIn("falconers-mews"), []);
  assert.deepEqual(itemsIn("sheepfold"), []);
  assert.deepEqual(requiredPath(lodge).roomIds, ["forest-gate", "kennel-yard"]);
  assert.deepEqual(itemsIn("kennel-yard"), [
    ["hunting-cup", "treasure", "hounds-kennel"],
    ["kennel-gold", "coin", "hounds-kennel"],
  ]);
  assert.deepEqual(itemsIn("lodge-kitchen"), [
    ["venison-haunch", "tool", "larder-hooks"],
    ["cooks-purse", "coin", "larder-hooks"],
  ]);
  assert.deepEqual(itemsIn("lodge-hall"), [
    ["trophy-topaz", "treasure", "trophy-wall"],
    ["trophy-potion", "potion-of-healing", "trophy-wall"],
    ["kings-hanger", "gear", "hall-hearth"],
  ]);
  assert.deepEqual(itemsIn("guardroom"), [
    ["guardroom-winnings", "coin", "dice-table"],
    ["ivory-dice", "treasure", "dice-table"],
    ["reavers-gaoler-coins", "coin", "reavers-gaoler"],
    ["reavers-gaoler-trinket", "treasure", "reavers-gaoler"],
  ]);
});

const ROLLED_GAOLER_COINS = { sp: 8 };

test("its treasure is 87% of the long level-5 budget, the Gaoler's silver and gem rolled from its treasure type, and its one magic item the King's Hanger", () => {
  // Rolled with `npm run loot -- adventures/5e/thornwood-lodge.json --seed 445`;
  // Hesk's and the Reaver's coins came over with their modules (seeds 291
  // and 289).
  const carried = (roomId, id) =>
    room(roomId).items.find((item) => item.id === id);
  assert.deepEqual(
    carried("guardroom", "reavers-gaoler-coins").coins,
    ROLLED_GAOLER_COINS,
  );
  assert.equal(
    carried("guardroom", "reavers-gaoler-trinket").treasure,
    "gem-10gp",
  );
  assert.deepEqual(carried("captains-solar", "captain-hesk-coins").coins, {
    gp: 8,
  });
  assert.deepEqual(carried("keep-hall", "wolfstone-reaver-coins").coins, {
    gp: 6,
  });
  // 1,039 gp of coin, gems and art placed, the Gaoler's 10 gp gem and 8 sp.
  assert.equal(findableValue(lodge), 103900 + 1000 + 80);
  assert.equal(treasureBudget(5, true), 120000);
  const hanger = carried("lodge-hall", "kings-hanger");
  assert.deepEqual(
    [hanger.name, hanger.gear],
    ["The King's Hanger", "shortsword-plus-1"],
  );
});

// The checks, with scripted dice. testFighterAt(5): Perception +3,
// History +1, Persuasion −1, Intimidation −1, Dexterity +2.
const level5 = testFighterAt(5);
const runtime = createFifthRuntime(lodge, level5);

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
const POACHERS = { type: "talk", topicId: "the-poachers-path" };

test("winning Brann over with Persuasion opens the poachers' path to the hide", () => {
  assert.deepEqual(exits(begun), ["kennel-yard", "drovers-camp"]);
  // 15 − 1 = 14 meets DC 14.
  const talked = accepted(
    begun,
    { ...POACHERS, approach: "persuasion" },
    dice([20, 15]),
  );
  assert.deepEqual(exits(talked), [
    "kennel-yard",
    "poachers-hide",
    "drovers-camp",
  ]);
});

test("failing to frighten Brann leaves the path hidden, and he won't be asked again", () => {
  // 10 − 1 = 9 misses DC 16.
  const talked = accepted(
    begun,
    { ...POACHERS, approach: "intimidation" },
    dice([20, 10]),
  );
  assert.deepEqual(exits(talked), ["kennel-yard", "drovers-camp"]);
  const again = runtime.handleAction(
    talked,
    { ...POACHERS, approach: "persuasion" },
    dice(),
  );
  assert.equal(again.rejection?.code, "already-asked");
});

/** The Fighter at the drovers' camp, up the hunt ride. */
const atCamp = accepted(
  begun,
  { type: "move", destinationId: "drovers-camp" },
  dice(),
);
const TRACK = { type: "talk", topicId: "the-sheep-track" };

test("winning Wenna over with Persuasion opens the sheep track to the watchtower", () => {
  assert.deepEqual(exits(atCamp), ["forest-gate", "sheepfold", "outer-ditch"]);
  // 14 − 1 = 13 meets DC 13.
  const talked = accepted(
    atCamp,
    { ...TRACK, approach: "persuasion" },
    dice([20, 14]),
  );
  assert.deepEqual(exits(talked), [
    "forest-gate",
    "sheepfold",
    "watchtower",
    "outer-ditch",
  ]);
});

test("failing to win Wenna over leaves the track closed, and she won't be asked again", () => {
  // 10 − 1 = 9 misses DC 15.
  const talked = accepted(
    atCamp,
    { ...TRACK, approach: "intimidation" },
    dice([20, 10]),
  );
  assert.ok(!exits(talked).includes("watchtower"));
  assert.equal(
    runtime.handleAction(talked, { ...TRACK, approach: "persuasion" }, dice())
      .rejection?.code,
    "already-asked",
  );
});

/** A level-5 Fighter who has won the kennel yard on a seed, with what `route` took. */
const afterKennel = (route) =>
  firstJourney(
    lodge,
    level5,
    [["move", "kennel-yard"], ...route],
    ({ status, encounter }) =>
      status === "playing" && encounter?.outcome !== "ongoing",
  ).state;
const yard = afterKennel([]);
const FEED = [
  ["move", "lodge-kitchen"],
  ["examine", "larder-hooks"],
  ["take", "venison-haunch"],
  ["use", "serving-hatch", "venison-haunch"],
];
const kitchen = afterKennel(FEED);

test("from the kennel yard the way into the hall is through the kitchen", () => {
  assert.deepEqual(exits(yard), [
    "forest-gate",
    "falconers-mews",
    "lodge-kitchen",
  ]);
  assert.deepEqual(exits(kitchen), ["kennel-yard", "lodge-hall"]);
});

test("the haunch thrown through the serving hatch feeds the bear, which lets you into the hall without a fight", () => {
  assert.ok(kitchen.flags.includes("bear-fed"));
  // The haunch is gone into the pit.
  assert.ok(!kitchen.inventory.includes("venison-haunch"));
  assert.ok(kitchen.usedItemIds.includes("venison-haunch"));
  const inside = accepted(
    kitchen,
    { type: "move", destinationId: "lodge-hall" },
    dice(),
  );
  assert.equal(inside.roomId, "lodge-hall");
  assert.equal(inside.encounter, undefined);
  // The hatch and the pit say the bear is busy; a fed bear gives no XP.
  for (const [roomId, id] of [
    ["lodge-kitchen", "serving-hatch"],
    ["lodge-hall", "bear-pit"],
  ]) {
    assert.equal(feature(roomId, id).changed.when, "bear-fed");
  }
  assert.ok(!inside.clearedEncounterIds.includes("hall-bear"));
});

test("an unfed bear fights, and its chain is a fight action that can haul it off its feet", () => {
  const fight = runtime.handleAction(
    afterKennel([["move", "lodge-kitchen"]]),
    { type: "move", destinationId: "lodge-hall" },
    createSeededRandom(0),
  ).state;
  assert.equal(fight.encounter?.outcome, "ongoing");
  assert.deepEqual(
    runtime
      .projectActions(fight)
      .filter(({ action }) => action === "use-feature")
      .map(({ feature: used, target, approach }) => [
        used.id,
        target.id,
        approach.id,
      ]),
    [
      ["bear-chain", "baiting-bear", "athletics"],
      ["bear-chain", "baiting-bear", "strength"],
    ],
  );
  const { fightAction } = feature("lodge-hall", "bear-chain");
  assert.equal(fightAction.once, "fight");
  assert.deepEqual(fightAction.bands.success.effects, [
    { type: "condition", condition: "prone", turns: 1 },
  ]);
  assert.equal(fightAction.bands.failure.effects, undefined);
});

/** A level-5 Fighter in the hall, the bear fed, with what `route` took. */
const inHall = (route = []) =>
  afterKennel([...route, ...FEED, ["move", "lodge-hall"]]);
const hall = inHall();
const TROPHY = { type: "examine", targetId: "trophy-wall" };
const visible = (state) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === "take" && available)
    .map(({ target }) => target.id);

test("a success on the trophy wall reveals the topaz", () => {
  // 12 + 3 = 15 meets DC 15.
  const found = accepted(
    hall,
    { ...TROPHY, approach: "perception" },
    dice([20, 12]),
  );
  assert.deepEqual(visible(found), ["trophy-topaz"]);
});

test("a success by 5 on the trophy wall reveals the topaz and a potion", () => {
  // 12 + 1 = 13 meets History's DC 13; 17 + 1 = 18 is 5 over.
  const found = accepted(
    hall,
    { ...TROPHY, approach: "history" },
    dice([20, 17]),
  );
  assert.deepEqual(visible(found), ["trophy-topaz", "trophy-potion"]);
});

test("a failure by 5 on the trophy wall brings the antlers down for 1d6 piercing", () => {
  // 2 + 3 = 5, failure by 5 or more against DC 15.
  const hurt = accepted(
    hall,
    { ...TROPHY, approach: "perception" },
    dice([20, 2], [6, 4]),
  );
  assert.equal(hurt.character.hp, hall.character.hp - 4);
  assert.deepEqual(visible(hurt), []);
});

test("the trophy wall may be searched again only once you hold the Hooded Lantern", () => {
  // 8 + 3 = 11: failure, not by 5.
  const missed = accepted(
    hall,
    { ...TROPHY, approach: "perception" },
    dice([20, 8]),
  );
  const refused = runtime.handleAction(
    missed,
    { ...TROPHY, approach: "perception", retry: true },
    dice(),
  );
  assert.deepEqual(refused.rejection, {
    code: "no-retry",
    reason: "Nothing lets you try the Trophy Wall again.",
  });
  const lit = { ...missed, inventory: [...missed.inventory, "hooded-lantern"] };
  const found = accepted(
    lit,
    { ...TROPHY, approach: "perception", retry: true },
    dice([20, 12]),
  );
  assert.deepEqual(visible(found), ["trophy-topaz"]);
});

test("the King's Hanger hangs over the hearth", () => {
  const found = accepted(
    hall,
    { type: "examine", targetId: "hall-hearth" },
    dice(),
  );
  assert.ok(visible(found).includes("kings-hanger"));
});

const HATCH = { type: "examine", targetId: "ice-house-hatch" };

test("finding the hatch's release with Perception opens the way to the ice house", () => {
  assert.deepEqual(exits(hall), ["lodge-kitchen", "captains-solar"]);
  // 11 + 3 = 14 meets DC 14.
  const opened = accepted(
    hall,
    { ...HATCH, approach: "perception" },
    dice([20, 11]),
  );
  assert.deepEqual(exits(opened), [
    "lodge-kitchen",
    "ice-house",
    "captains-solar",
  ]);
});

test("a hatch that holds may be tried again for 1d4 bludgeoning damage", () => {
  // 5 + 3 = 8 misses DC 14.
  const held = accepted(
    hall,
    { ...HATCH, approach: "perception" },
    dice([20, 5]),
  );
  assert.ok(!exits(held).includes("ice-house"));
  const opened = accepted(
    held,
    { ...HATCH, approach: "perception", retry: true },
    dice([4, 3], [20, 15]),
  );
  assert.equal(opened.character.hp, held.character.hp - 3);
  assert.ok(exits(opened).includes("ice-house"));
});

const SEARCH = { type: "search", roomId: "lodge-hall" };
const DISARM = { type: "disarm", trapId: "gallery-man-trap" };

test("the man-trap on the gallery stair is found with Perception and disarmed at advantage with the Trapper's Tongs", () => {
  // 11 + 3 = 14 meets the find DC 14.
  const found = accepted(hall, SEARCH, dice([20, 11]));
  // 3 + 2 = 5 fails; 12 + 2 = 14 meets DC 14, at advantage.
  const tonged = { ...found, inventory: [...found.inventory, "trap-tongs"] };
  const disarmed = runtime.handleAction(
    tonged,
    DISARM,
    dice([20, 3], [20, 12]),
  );
  assert.equal(disarmed.rejection, undefined, disarmed.rejection?.reason);
  assert.match(
    runtime.renderResult(disarmed),
    /at advantage \(Trapper's Tongs\)/u,
  );
  // Without the tongs, one d20: 12 + 2 = 14 disarms it as well.
  accepted(found, DISARM, dice([20, 12]));
});

// The Wolfstone's checks (#289), at level 4: Athletics +5, Acrobatics +2.
const level4 = testFighterAt(4);
const wolfstone = createFifthRuntime(lodge, level4);

/**
 * A level-4 Fighter who has killed the Reaver's wolf on a seed and stands in
 * the ditch before the portcullis, with the crowbar or without.
 */
const ditchAfterWolf = (route) =>
  firstJourney(
    lodge,
    level4,
    [["move", "drovers-camp"], ...route, ["move", "outer-ditch"]],
    ({ status, roomId, encounter }) =>
      status === "playing" &&
      roomId === "outer-ditch" &&
      encounter?.outcome !== "ongoing",
  ).state;
const atPortcullis = ditchAfterWolf([
  ["examine", "drovers-cart"],
  ["take", "crowbar"],
]);
const FORCE = { type: "force", doorId: "rusted-portcullis" };
const levelFourExits = (state) =>
  wolfstone
    .projectActions(state)
    .filter(({ action, available }) => action === "move" && available)
    .map(({ target }) => target.id);

function forced(state, action, random) {
  const result = wolfstone.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

// Forcing the portcullis is loud in every band (#544): it rouses the
// Wolfstone, which rolls the region's wandering table (a d100 of 99 brings
// nothing).
test("with the crowbar, Remarkable Athlete forces the portcullis at advantage: the better of two d20s", () => {
  // 4 + 5 = 9 fails; 12 + 5 = 17 beats DC 15.
  const result = forced(
    atPortcullis,
    FORCE,
    dice([20, 4], [20, 12], [100, 99]),
  );
  assert.match(
    wolfstone.renderResult(result),
    /^Athletics check, at advantage \(Remarkable Athlete\)/u,
  );
  assert.ok(levelFourExits(result.state).includes("gatehouse"));
});

test("without a lever, the portcullis cancels Remarkable Athlete: one d20", () => {
  // 12 + 5 = 17 beats DC 15, on a single die.
  const result = forced(ditchAfterWolf([]), FORCE, dice([20, 12], [100, 99]));
  assert.ok(levelFourExits(result.state).includes("gatehouse"));
});

test("a portcullis that holds may be tried again for 1d4 bludgeoning damage", () => {
  // The alarm's wandering roll waits while Tactical Mind is offered for the
  // failed check (and the retry, taking that offer away, doesn't roll it).
  const held = forced(atPortcullis, FORCE, dice([20, 3], [20, 4])).state;
  assert.ok(!levelFourExits(held).includes("gatehouse"));
  assert.ok(held.flags.includes("wolfstone-roused"));
  const { state } = forced(
    held,
    { ...FORCE, retry: true },
    dice([4, 2], [20, 15], [20, 1]),
  );
  assert.equal(state.character.hp, held.character.hp - 2);
  assert.ok(levelFourExits(state).includes("gatehouse"));
});

test("the rampart's loose stones are a fight action against the wolf, once an adventure, for 2d6", () => {
  const camp = wolfstone.handleAction(
    wolfstone.handleAction(wolfstone.createSession(), { type: "begin" }, dice())
      .state,
    { type: "move", destinationId: "drovers-camp" },
    dice(),
  ).state;
  const fight = wolfstone.handleAction(
    camp,
    { type: "move", destinationId: "outer-ditch" },
    createSeededRandom(0),
  ).state;
  assert.equal(fight.encounter?.outcome, "ongoing");
  assert.deepEqual(
    wolfstone
      .projectActions(fight)
      .filter(({ action }) => action === "use-feature")
      .map(({ feature: used, target }) => [used.id, target.id]),
    [
      ["rampart-stones", "reavers-wolf"],
      ["rampart-stones", "reavers-wolf"],
    ],
  );
  const { fightAction } = feature("outer-ditch", "rampart-stones");
  assert.equal(fightAction.once, "adventure");
  assert.deepEqual(
    fightAction.check.approaches.map(({ skill, ability, dc }) => [
      skill ?? ability,
      dc,
    ]),
    [
      ["athletics", 14],
      ["strength", 14],
    ],
  );
  assert.deepEqual(fightAction.bands.success.effects, [
    {
      type: "damage",
      dice: 2,
      sides: 6,
      modifier: 0,
      damageType: "bludgeoning",
    },
  ]);
});

/** The same Fighter in the gatehouse, the portcullis forced. */
const inGatehouse = forced(
  forced(atPortcullis, FORCE, dice([20, 20], [20, 20], [100, 99])).state,
  { type: "move", destinationId: "gatehouse" },
  dice(),
).state;
const CROSS = { type: "examine", targetId: "rope-bridge" };

test("crossing the rope bridge with Acrobatics opens the way to the keep", () => {
  assert.deepEqual(levelFourExits(inGatehouse), [
    "outer-ditch",
    "guardroom",
    "undercroft",
  ]);
  // 11 + 2 = 13 meets DC 13.
  const { state } = forced(
    inGatehouse,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 11]),
  );
  assert.deepEqual(levelFourExits(state), [
    "outer-ditch",
    "guardroom",
    "undercroft",
    "keep-hall",
  ]);
});

test("the Knotted Rope gives the Acrobatics approach advantage", () => {
  // 2 + 2 = 4 fails; 11 + 2 = 13 meets DC 13, at advantage.
  const roped = {
    ...inGatehouse,
    inventory: [...inGatehouse.inventory, "knotted-rope"],
  };
  const { state } = forced(
    roped,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 2], [20, 11]),
  );
  assert.ok(levelFourExits(state).includes("keep-hall"));
});

test("failing the bridge by 5 drops you 2d6 and closes it for good: the undercroft is still the way on", () => {
  // 1 + 2 = 3, failure by 5 or more against DC 13.
  const { state } = forced(
    inGatehouse,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 1], [6, 3], [6, 4]),
  );
  assert.equal(state.character.hp, inGatehouse.character.hp - 7);
  assert.deepEqual(levelFourExits(state), [
    "outer-ditch",
    "guardroom",
    "undercroft",
  ]);
  assert.equal(
    wolfstone.handleAction(
      state,
      { ...CROSS, approach: "acrobatics", retry: true },
      dice(),
    ).rejection?.code,
    "no-retry",
  );
});

test("a plain failure on the bridge may be tried again for 1d4 bludgeoning damage", () => {
  // 8 + 2 = 10: failure, not by 5.
  const balked = forced(
    inGatehouse,
    { ...CROSS, approach: "acrobatics" },
    dice([20, 8]),
  ).state;
  assert.ok(!levelFourExits(balked).includes("keep-hall"));
  const { state } = forced(
    balked,
    { ...CROSS, approach: "acrobatics", retry: true },
    dice([4, 1], [20, 15]),
  );
  assert.equal(state.character.hp, balked.character.hp - 1);
  assert.ok(levelFourExits(state).includes("keep-hall"));
});

const POTION_AND_LANTERN = [
  ["examine", "woodpile"],
  ["take", "woodpile-potion"],
  ["take", "hooded-lantern"],
];
const KENNEL_LOOT = [
  ["move", "kennel-yard"],
  ["examine", "hounds-kennel"],
  ["take", "hunting-cup"],
  ["take", "kennel-gold"],
];

test("a level-4 Fighter wins the kennel yard and walks out with the hunting cup and gold", () => {
  const { state, runtime: played } = firstJourney(
    lodge,
    level4,
    [
      ...POTION_AND_LANTERN,
      ...KENNEL_LOOT,
      ["move", "forest-gate"],
      ["leave", "forest-gate"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-spoils");
  assert.ok(state.inventory.includes("hunting-cup"));
  assert.equal(state.possessions.purse, 3000);
  // The career's path through the Lodge (#444): a career enters at level 4
  // with about 2,950 XP, and the kennel fight and the ending's 3,800 take it
  // past level 5's 6,500.
  const [fought, ending] = xpOf(played, state);
  assert.match(fought[0], /Hesk's Hound/u);
  assert.ok(fought[1] >= 200);
  assert.deepEqual(ending, ["Out with the spoils", 3800]);
  assert.ok(2950 + fought[1] + ending[1] >= 6500);
});

test("the kennel yard can still win at level 4, potion and all", () => {
  const { state } = firstJourney(
    lodge,
    level4,
    [...POTION_AND_LANTERN, ["move", "kennel-yard"]],
    ({ status }) => status === "defeat",
  );
  assert.equal(state.endingId, "fallen-in-the-thornwood");
});

test("taking the potion and leaving is escaping without loot", () => {
  const { state, runtime: played } = firstJourney(
    lodge,
    level4,
    [...POTION_AND_LANTERN, ["leave", "forest-gate"]],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-empty-handed");
  assert.deepEqual(xpOf(played, state), []);
});

test("a level-4 Fighter kills the Reaver's wolf, forces the portcullis and leaves by the drovers' camp with the bell and the bloodstone", () => {
  const { state, runtime: played } = firstJourney(
    lodge,
    level4,
    [
      ["move", "drovers-camp"],
      ["examine", "drovers-cart"],
      ["take", "cart-potion"],
      ["take", "crowbar"],
      ["move", "outer-ditch"],
      ["examine", "wolf-lair", "survival"],
      ["take", "drovers-purse"],
      ["take", "silver-bell"],
      ["force", "rusted-portcullis"],
      ["move", "gatehouse"],
      ["examine", "guard-locker"],
      ["take", "bloodstone"],
      ["move", "outer-ditch"],
      ["move", "drovers-camp"],
      ["leave", "drovers-camp"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-spoils");
  for (const id of ["silver-bell", "bloodstone"]) {
    assert.ok(state.inventory.includes(id), id);
  }
  assert.deepEqual(xpOf(played, state).at(-1), ["Out with the spoils", 3800]);
});

test("a level-5 Fighter feeds the bear, takes the King's Hanger and the topaz, and walks out", () => {
  const { state } = firstJourney(
    lodge,
    level5,
    [
      ...POTION_AND_LANTERN,
      ...KENNEL_LOOT,
      ...FEED,
      ["take", "cooks-purse"],
      ["move", "lodge-hall"],
      ["examine", "hall-hearth"],
      ["take", "kings-hanger"],
      ["examine", "trophy-wall", "history"],
      ["take", "trophy-topaz"],
      ["move", "lodge-kitchen"],
      ["move", "kennel-yard"],
      ["move", "forest-gate"],
      ["leave", "forest-gate"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-spoils");
  assert.ok(!state.clearedEncounterIds.includes("hall-bear"));
  // Taken gear is stowed until it is wielded.
  assert.ok(state.possessions.stowed.includes("shortsword-plus-1"));
});

/**
 * The release run's seed: Ada escapes with loot on its generated route, every
 * step offered (seed 0's hound flees before it can be searched).
 */
const RELEASE_SEED = 1;

test("the release run plays the lodge's generated route from the saved 4,100 XP Ada, feeds the bear and walks out with the loot at level 5, through the server to the library file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-291-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(libraryPath, JSON.stringify(levelFourCareerLibrary()));
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: RELEASE_SEED,
    dmModel: narratingDm(),
    // shipped-modules.test.mjs gates every shipped module; skip it here.
    qualifies: () => true,
  });
  try {
    const [{ sheet }] = levelFourCareerLibrary().characters;
    const { session, turns } = await playReleaseRun({
      url: server.url,
      session: await startSavedAdventureOverHttp(server.url, "thornwood-lodge"),
      ...generateReleaseRun(lodge, sheet, { seed: RELEASE_SEED }),
    });
    assert.equal(session.status, "escaped");
    assert.equal(session.ending.kind, "escape-with-loot");
    assert.deepEqual(
      turns.filter(({ skipped }) => skipped !== undefined),
      [],
    );
    assert.ok(turns.some(({ phase }) => phase === "fight"));
    // The cautious run feeds the bear on its way through the kitchen, so
    // the hall is no fight.
    assert.ok(turns.some(({ intent }) => intent === "use-on serving-hatch"));
    assert.ok(
      !turns.some(
        ({ phase, room }) => phase === "fight" && room === "lodge-hall",
      ),
    );
    assert.match(turns.at(-1).intent, /^leave /u);
    // The ending's 3,800 and a fight take Ada from level 4 to level 5.
    assert.ok(session.ending.rewards.totalXp >= sheet.xp + 200 + 3800);
    assert.equal(session.ending.rewards.level, 5);
    const [ada] = JSON.parse(await readFile(libraryPath, "utf8")).characters;
    assert.equal(ada.session, undefined);
    assert.deepEqual(
      [ada.sheet.level, ada.sheet.xp],
      [5, session.ending.rewards.totalXp],
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the live release script plays the lodge's generated route with --adventure thornwood-lodge", async () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const env = { ...process.env, OPENAI_API_KEY: "" };
  const directory = await mkdtemp(join(tmpdir(), "issue-291-script-"));
  try {
    const output = join(directory, "report.json");
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--adventure",
        "thornwood-lodge",
        "--output",
        output,
        "--max-calls",
        "10",
      ],
      { encoding: "utf8", env, timeout: 60000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.issue, 291);
    assert.equal(report.generated, true);
    assert.equal(report.adventureId, "thornwood-lodge");
    assert.equal(report.seed, RELEASE_SEED);
    assert.equal(report.providerCalls, 10);
    assert.equal(report.ending.kind, "escape-with-loot");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// #544: a mind way past the portcullis, and the portcullis is loud.
const examinedLair =
  (band) =>
  ({ checks }) =>
    checks.some(
      ({ id, band: made }) => id === "examine:wolf-lair" && made === band,
    );
const TO_LAIR = [
  ["move", "drovers-camp"],
  ["move", "outer-ditch"],
  ["examine", "wolf-lair", "nature"],
];

test("the wolf's lair is searched with Nature or Survival: either band finds the purse and the bell, and success finds the run under the rampart", () => {
  const { check } = feature("outer-ditch", "wolf-lair");
  assert.deepEqual(
    check.approaches.map(({ skill, dc }) => [skill, dc]),
    [
      ["nature", 14],
      ["survival", 14],
    ],
  );
  const loot = [
    { type: "discovery", feature: "wolf-lair" },
    { type: "item", item: "drovers-purse" },
    { type: "item", item: "silver-bell" },
  ];
  assert.equal(check.bands.failure.text, "Fur and old bones.");
  assert.deepEqual(check.bands.failure.effects, loot);
  assert.deepEqual(check.bands.success.effects, [
    ...loot,
    { type: "open", passage: "wolfs-run" },
  ]);
  const run = lodge.passages.find(({ id }) => id === "wolfs-run");
  assert.deepEqual(
    [run.between, run.hidden],
    [["outer-ditch", "guardroom"], true],
  );
});

test("finding the wolf's run leads into the guardroom without forcing the portcullis", () => {
  const { state } = firstJourney(
    lodge,
    level4,
    [...TO_LAIR, ["take", "silver-bell"], ["move", "guardroom"]],
    (reached) =>
      reached.status === "playing" &&
      reached.roomId === "guardroom" &&
      examinedLair("success")(reached),
  );
  assert.ok(state.inventory.includes("silver-bell"));
  assert.ok(!state.openedDoorIds.includes("rusted-portcullis"));
  assert.ok(!state.flags.includes("wolfstone-roused"));
  // The Gaoler was at his post, and the way on is the gatehouse.
  assert.ok(state.clearedEncounterIds.includes("guardroom-gaoler"));
  assert.ok(levelFourExits(state).includes("gatehouse"));
});

test("a failed search of the lair still finds the purse and the bell, but not the run", () => {
  const { state } = firstJourney(
    lodge,
    level4,
    [...TO_LAIR, ["take", "drovers-purse"], ["take", "silver-bell"]],
    (reached) =>
      reached.status === "playing" && examinedLair("failure")(reached),
  );
  assert.ok(state.inventory.includes("silver-bell"));
  assert.ok(!levelFourExits(state).includes("guardroom"));
});

test("forcing the portcullis rouses the Wolfstone, rolling its wandering table, and scatters the gaoler's dice", () => {
  const { bands } = lodge.passages.find(({ id }) => id === "ditch-to-gatehouse")
    .door.force;
  assert.deepEqual(
    Object.entries(bands).map(([band, { noisy }]) => [band, noisy]),
    [
      ["failure-by-5", true],
      ["failure", true],
      ["success", true],
    ],
  );
  // inGatehouse's force rolled the table (a d100 of 99: nothing came).
  assert.ok(inGatehouse.flags.includes("wolfstone-roused"));
  assert.deepEqual(feature("guardroom", "dice-table").changed, {
    when: "wolfstone-roused",
    description:
      "A barrel-head table strewn with cups, two of them knocked over and their dice scattered by the racket at the gate.",
  });
});
