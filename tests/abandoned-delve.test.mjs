// #136: The Abandoned Delve, the first real 5e adventure module, expanded
// for #442 as the owner approved it on #441: a long level-2 module of
// sixteen rooms in two regions, the Keep Cellars and the Crypts, with the
// rope that frees the goblin and opens the well, Mags Corrow the rival, the
// crypts' alarm, the vault's coffer stack, the lord's sarcophagus and a
// wandering dead delver on rests, and, since #512, Hedda the Pedlar trading
// in the porter's lodge. Since #601 it tells a story, The Unrelieved Watch,
// as the owner approved it on #599: the dead garrison is still on duty and
// unpaid, a garrison badge makes its posts stand aside, Mags and the goblin
// each tell half of it, and the Castellan in the vault offers a deal that
// rules out the best ending, paying the dead at the muster bell.
// Scripted-DM journeys reach each of its endings; shipped-modules.test.mjs
// checks it qualifies at its declared difficulty, with its quoted figures.
// The DM evaluation's cases and the live qualification, both written for it
// (#138), are checked here too.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encounterInRoom,
  encounterPlacements,
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import {
  characterAtLevel,
  GATE_CLASSES,
  GATE_STYLE,
  percentileCharacters,
  playAdventure,
  regionSweeps,
  requiredPath,
  WEAKEST_PERCENTILE,
  XP_STYLE,
} from "../dist/balance-5e.js";
import {
  FIFTH_DM_CASES,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  scriptedCaseModel,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { buildCharacter } from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { IN_ORDER_CHOICES as CHOICES } from "./fixtures/fighter-choices.mjs";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";

const delve = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "abandoned-delve",
);

// Str 17 (+3), Dex 14 (+2), Con 15 (+2): a sturdy level-1 Fighter.
const STRONG = buildCharacter(
  "a".repeat(32),
  "Ada",
  [
    [5, 5, 5, 1],
    [5, 5, 4, 1],
    [5, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 4, 1],
    [3, 3, 3, 1],
  ],
  CHOICES,
);

// Every score 10: a feeble level-1 Fighter.
const WEAK = buildCharacter(
  "b".repeat(32),
  "Bo",
  Array.from({ length: 6 }, () => [3, 3, 4, 1]),
  { ...CHOICES, increase: { strength: 1, constitution: 1, dexterity: 1 } },
);

const room = (id) => delve.rooms.find((entry) => entry.id === id);
const passage = (from, to) =>
  delve.passages.find(
    ({ between }) => between.includes(from) && between.includes(to),
  );
const feature = (roomId, id) =>
  room(roomId).features.find((entry) => entry.id === id);
const fight = (id) => delve.encounters.find((entry) => entry.id === id);
const topicsOf = (roomId) =>
  room(roomId).creatures.flatMap(({ topics }) =>
    topics.map(({ id, offeredWhile, offeredUntil }) => [
      id,
      offeredWhile,
      offeredUntil,
    ]),
  );
const level2 = testFighterAt(2);
/** Whether the runtime refuses `action` in `state`. */
const refused = (runtime, state, action) =>
  runtime.handleAction(state, action).rejection !== undefined;

// #233: Undead Fortitude made its Zombie too deadly at level 1. #442: the
// weakest level-2 Rogue survived the old-well route 84.5%, under Medium's
// 85%, so the expanded delve was declared Hard. #499: with Last Stand that
// Rogue survives 88%, Medium's 85% with 3 points of slack, so it is Medium.
// #601: the story's two paying endings, the victory first.
test("the delve is a long level-2 Medium module of sixteen rooms in two regions, left by the gate or the shaft", () => {
  assert.equal(delve.title, "The Abandoned Delve");
  assert.equal(
    delve.objective,
    "Bring up what you can of the old lord's hoard from under the ruined keep, and get out alive.",
  );
  assert.deepEqual(delve.recommendedLevels, { min: 2, max: 2 });
  assert.equal(delve.difficulty, "medium");
  assert.equal(delve.long, true);
  assert.deepEqual(
    delve.regions.map(({ id, name }) => [id, name]),
    [
      ["cellars", "The Keep Cellars"],
      ["crypts", "The Crypts"],
    ],
  );
  assert.deepEqual(
    delve.rooms.map(({ id, region, exit, restSite, avoidable }) => [
      id,
      region,
      exit === true,
      restSite === true,
      avoidable === true,
    ]),
    [
      ["broken-gate", "cellars", true, false, false],
      ["gate-hall", "cellars", false, false, false],
      ["guard-post", "cellars", false, false, false],
      ["barracks", "cellars", false, false, true],
      ["storeroom", "cellars", false, false, false],
      ["dry-well", "cellars", false, false, false],
      ["porters-lodge", "cellars", false, true, false],
      ["fallen-kitchen", "cellars", false, false, false],
      ["shrine", "crypts", false, true, false],
      ["web-crypt", "crypts", false, false, true],
      ["shaft-bottom", "crypts", true, false, false],
      // Avoidable since #442: its ghoul held the Crypts sweep to 68.5%.
      ["vault", "crypts", false, false, false],
      ["well-bottom", "crypts", false, false, false],
      ["flooded-cistern", "crypts", false, false, false],
      ["ossuary", "crypts", false, false, false],
      ["lords-tomb", "crypts", false, false, false],
    ],
  );
  assert.deepEqual(
    delve.endings.map(
      ({ id, kind, title, xp, onEscapeWhen, objective, needsItem }) => [
        id,
        kind,
        title,
        xp,
        onEscapeWhen,
        objective,
        needsItem,
      ],
    ),
    [
      [
        "the-watch-stands-down",
        "victory",
        "The watch stands down",
        600,
        "watch-relieved",
        undefined,
        undefined,
      ],
      [
        "out-with-the-loot",
        "escape-with-loot",
        "Out with the garrison's pay",
        600,
        undefined,
        // The objective names the escape with the vault's chest (#607,
        // #611), so the relief is found in play.
        true,
        "coin-chest",
      ],
      [
        "out-empty-handed",
        "escape-without-loot",
        "Out without the pay",
        undefined,
        undefined,
        undefined,
        undefined,
      ],
      [
        "lost-in-the-delve",
        "defeat",
        "Lost in the delve",
        undefined,
        undefined,
        undefined,
        undefined,
      ],
    ],
  );
  assert.deepEqual(delve.flags, [
    "goblin-freed",
    "delve-roused",
    "posts-stand-aside",
    "mags-dealt",
    "castellan-freed",
    "castellan-silent",
    "watch-relieved",
  ]);
  assert.deepEqual(delve.wanderingEncounter, {
    encounterId: "dead-delver",
    chance: 25,
  });
});

// #601: every feature is a clue, a lever, a risk or a reward. Six that
// carried nothing were cut and their words folded into the rooms; the
// Muster Bell, the Standing Orders and the Door Grille were added.
test("its 29 features each carry something: a discovery, a check, a use, a fight action or a hidden find", () => {
  assert.deepEqual(
    delve.rooms.map(({ id, features }) => [
      id,
      features.map((entry) => entry.id),
    ]),
    [
      ["broken-gate", ["chalk-marks"]],
      ["gate-hall", ["muster-bell", "standing-orders"]],
      ["guard-post", ["weapon-rack", "overturned-table"]],
      ["barracks", ["footlocker"]],
      ["storeroom", ["old-barrel"]],
      ["dry-well", ["well-head", "windlass"]],
      ["porters-lodge", ["peg-rail", "key-board"]],
      ["fallen-kitchen", ["hearth", "bone-heap"]],
      ["shrine", ["altar", "offering-box", "shrine-lamp"]],
      ["web-crypt", ["cocoon"]],
      ["shaft-bottom", ["knotted-rope", "door-grille"]],
      ["vault", ["iron-chest", "coffer-stack"]],
      ["well-bottom", ["silted-floor", "goblins-nest"]],
      ["flooded-cistern", ["black-water", "drowned-delver"]],
      ["ossuary", ["skull-wall", "mags-satchel"]],
      ["lords-tomb", ["sarcophagus-lid", "effigy"]],
    ],
  );
  const all = delve.rooms.flatMap(({ features, items }) =>
    features.map((entry) => ({ ...entry, items })),
  );
  assert.equal(all.length, 29);
  for (const { id, discovery, check, uses, fightAction, items } of all) {
    assert.ok(
      discovery !== undefined ||
        check !== undefined ||
        uses !== undefined ||
        fightAction !== undefined ||
        items.some(({ hiddenIn }) => hiddenIn === id),
      id,
    );
  }
});

test("its fights: the Castellan is the only boss, the posts and the Castellan withdraw on their flags, Mags reacts and runs to the shaft when the delve is roused, and a dead delver wanders", () => {
  assert.deepEqual(
    delve.encounters.map(({ id, opponents, movesTo, presentUntil }) => [
      id,
      opponents.map(({ id: opponentId, statBlock, boss }) => [
        opponentId,
        statBlock.name,
        boss === true,
      ]),
      movesTo ?? presentUntil,
    ]),
    [
      ["guard-zombie", [["zombie", "Zombie", false]], "posts-stand-aside"],
      [
        "barracks-skeletons",
        [
          ["skeleton-sergeant", "Skeleton", false],
          ["skeleton-guard", "Skeleton", false],
        ],
        "posts-stand-aside",
      ],
      ["kitchen-wolf", [["grey-wolf", "Wolf", false]], undefined],
      ["crypt-spider", [["giant-spider", "Giant Spider", false]], undefined],
      ["vault-ghoul", [["ghoul", "Ghoul", true]], "castellan-freed"],
      [
        "ossuary-rival",
        [["mags-corrow", "Bandit", false]],
        // A reaction-eligible encounter may keep its move (#601).
        { roomId: "shaft-bottom", when: "delve-roused" },
      ],
      ["dead-delver", [["dead-delver", "Zombie", false]], undefined],
    ],
  );
  assert.equal(fight("vault-ghoul").opponents[0].name, "Castellan");
  // A Castellan fought, won or fled, bargains no more (#609).
  assert.deepEqual(fight("vault-ghoul").sets, {
    won: "castellan-silent",
    fled: "castellan-silent",
  });
  assert.equal(delve.alarm.flag, "delve-roused");
  assert.deepEqual(delve.alarm.fights, [{ region: "crypts", round: 4 }]);
  // Nothing closes: the alarm only moves Mags, so no exit is cut off.
  assert.ok(delve.passages.every(({ closeWhen }) => closeWhen === undefined));
});

test("two ways lead down, the shrine stair past the zombie and the goblin's well with the porter's rope", () => {
  assert.deepEqual(
    delve.routes.map((route) => [route.id, requiredPath(delve, route).roomIds]),
    [
      [
        "shrine-stair",
        [
          "broken-gate",
          "gate-hall",
          "guard-post",
          "dry-well",
          "shrine",
          "shaft-bottom",
          "vault",
        ],
      ],
      [
        "old-well",
        [
          "broken-gate",
          "gate-hall",
          "porters-lodge",
          "guard-post",
          "dry-well",
          "well-bottom",
          "flooded-cistern",
          "ossuary",
          "shaft-bottom",
          "vault",
        ],
      ],
    ],
  );
  assert.deepEqual(
    regionSweeps(delve).map(({ region, rooms }) => [region, rooms]),
    [
      [
        "cellars",
        [
          "broken-gate",
          "gate-hall",
          "guard-post",
          "storeroom",
          "dry-well",
          "porters-lodge",
          "fallen-kitchen",
        ],
      ],
      [
        "crypts",
        [
          "shrine",
          "shaft-bottom",
          "vault",
          "well-bottom",
          "flooded-cistern",
          "ossuary",
          "lords-tomb",
        ],
      ],
    ],
  );
  // The rope on the well head opens the way down and frees the goblin.
  assert.equal(passage("dry-well", "well-bottom").hidden, true);
  const [use] = feature("dry-well", "well-head").uses;
  assert.equal(use.item, "coil-of-rope");
  assert.equal(use.consumes, true);
  assert.deepEqual(use.effects, [
    { type: "open", passage: "well-rope" },
    { type: "set", flag: "goblin-freed" },
  ]);
  assert.equal(passage("dry-well", "shrine").trap.id, "loose-step");
  assert.equal(passage("gate-hall", "storeroom").door.state, "stuck");
  const vault = passage("shaft-bottom", "vault").door;
  assert.equal(vault.state, "locked");
  assert.deepEqual(vault.keyItemIds, ["bronze-key"]);
  // Might is loud (#545): every band of the vault's break and the
  // storeroom's force rouses the crypts.
  assert.deepEqual(noisyBands(vault.break), ALL_NOISY);
  assert.deepEqual(
    noisyBands(passage("gate-hall", "storeroom").door.force),
    ALL_NOISY,
  );
});

// #601: who you take up with. The goblin talks until you come to terms
// with Mags; Mags talks once you have, and until the goblin is freed.
test("the goblin and Mags each tell half the story, and each falls silent once the other is helped", () => {
  assert.deepEqual(topicsOf("dry-well"), [
    ["the-vault", undefined, "mags-dealt"],
    ["the-stair", undefined, "mags-dealt"],
    ["the-woman", "goblin-freed", "mags-dealt"],
    ["the-tomb", "goblin-freed", "mags-dealt"],
    ["the-bell", "goblin-freed", "mags-dealt"],
  ]);
  assert.deepEqual(topicsOf("ossuary"), [
    ["the-badge", "mags-dealt", "goblin-freed"],
    ["where-badges-are", "mags-dealt", "goblin-freed"],
    ["the-goblin", "mags-dealt", "goblin-freed"],
    ["the-voice", "mags-dealt", "goblin-freed"],
  ]);
  // Mags reacts: every band can end in a fight, and each offers terms.
  const { reaction, sets } = fight("ossuary-rival");
  assert.deepEqual(sets, { peaceful: "mags-dealt" });
  assert.equal(reaction.peacefulXp, 25);
  assert.deepEqual(reaction.toll.coins, { gp: 2 });
  assert.deepEqual(
    reaction.parley.approaches.map(({ skill, dc }) => [skill, dc]),
    [
      ["persuasion", 12],
      ["deception", 13],
      ["intimidation", 13],
    ],
  );
  assert.deepEqual(
    Object.entries(reaction.bands).map(([band, { options }]) => [
      band,
      options,
    ]),
    [
      ["unfriendly", ["attack", "parley", "toll"]],
      ["uncertain", ["attack", "parley", "toll"]],
      ["indifferent", ["let-pass", "parley", "attack"]],
      ["friendly", ["let-pass", "attack"]],
    ],
  );
  // Hedda has the village's story, and bids against paying the dead.
  assert.deepEqual(topicsOf("porters-lodge"), [
    ["the-keep", undefined, undefined],
    ["the-way-down", undefined, undefined],
    ["the-garrison", undefined, undefined],
    ["what-she-buys", undefined, undefined],
    ["the-hoard", undefined, undefined],
    ["what-walked-out", "castellan-freed", undefined],
  ]);
});

test("the sarcophagus opens three ways, the goblin's directions help, and failing by 5 is noisy; the coffers fall on a foe, and the garrison's oath holds one fast", () => {
  const { check } = feature("lords-tomb", "sarcophagus-lid");
  assert.deepEqual(
    check.approaches.map(({ skill, dc, advantage }) => [
      skill,
      dc,
      advantage?.map(({ flag }) => flag),
    ]),
    [
      ["athletics", 14, undefined],
      ["investigation", 13, ["goblin-freed"]],
      // Religion since #557: the old rite of the carved hand.
      ["religion", 13, undefined],
    ],
  );
  assert.equal(check.bands["failure-by-5"].noisy, true);
  assert.equal(check.bands["failure-by-5"].effects, undefined);
  for (const band of ["success", "success-by-5"]) {
    assert.deepEqual(
      check.bands[band].effects
        .filter(({ type }) => type === "item")
        .map(({ item }) => item),
      ["death-mask", "grave-coins"],
      band,
    );
  }
  // The relief order is words, read once the lid is off (#601).
  assert.match(
    feature("lords-tomb", "sarcophagus-lid").discovery,
    /read this at the muster bell: the watch is relieved\. Pay each man/u,
  );
  const { fightAction } = feature("vault", "coffer-stack");
  assert.equal(fightAction.once, "adventure");
  assert.deepEqual(
    fightAction.check.approaches.map(({ skill, ability, dc }) => [
      skill ?? ability,
      dc,
    ]),
    [
      ["athletics", 13],
      ["strength", 13],
    ],
  );
  // #601, the owner's choice on #599: mind and voice against the Castellan.
  const oath = feature("vault", "iron-chest").fightAction;
  assert.equal(oath.once, "fight");
  assert.deepEqual(
    oath.check.approaches.map(({ skill, dc }) => [skill, dc]),
    [
      ["religion", 13],
      ["history", 13],
      ["intimidation", 13],
    ],
  );
  assert.deepEqual(
    Object.entries(oath.bands).map(([band, { effects }]) => [band, effects]),
    [
      ["failure", undefined],
      ["success", [{ type: "condition", condition: "paralysed", turns: 2 }]],
      [
        "success-by-5",
        [{ type: "condition", condition: "paralysed", turns: 3 }],
      ],
    ],
  );
  // Nothing removes the Castellan, so the roll he carries is never lost.
  for (const action of [fightAction, oath]) {
    assert.ok(
      Object.values(action.bands).every(({ effects = [] }) =>
        effects.every(({ type }) => type !== "remove"),
      ),
    );
  }
});

test("its treasure is 81% of the long level-2 budget, with two potions and a scroll, and nothing to carry out lies unfought without a badge", () => {
  const items = delve.rooms.flatMap(({ items: placed }) => placed);
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "potion-of-healing")
      .map(({ hiddenIn }) => hiddenIn),
    ["weapon-rack", "old-barrel"],
  );
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "scroll")
      .map(({ spell, hiddenIn }) => [spell, hiddenIn]),
    [["cure-wounds", "offering-box"]],
  );
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "treasure")
      .map(({ id, treasure }) => [id, treasure]),
    [
      ["vault-garnet", "gem-50gp"],
      ["death-mask", "art-25gp"],
    ],
  );
  assert.ok(items.every(({ hiddenIn }) => hiddenIn !== undefined));
  assert.equal(findableValue(delve), 16230);
  assert.equal(treasureBudget(2, true), 20000);
  // The rooms reachable from the gate without entering a fight or forcing
  // a door hold no treasure or coin, so a cautious run can't take loot and
  // leave unfought. A badge from the storeroom, behind its stuck door,
  // stands the Guard Post and the Barracks aside (#601).
  const fightless = new Set();
  const frontier = [delve.startRoomId];
  while (frontier.length > 0) {
    const id = frontier.pop();
    if (fightless.has(id) || room(id).encounterId !== undefined) {
      continue;
    }
    fightless.add(id);
    for (const { between, hidden, door } of delve.passages) {
      if (between.includes(id) && hidden !== true && door === undefined) {
        frontier.push(between.find((other) => other !== id));
      }
    }
  }
  assert.deepEqual([...fightless].sort(), [
    "broken-gate",
    "gate-hall",
    "porters-lodge",
  ]);
  for (const id of fightless) {
    assert.ok(
      room(id).items.every(
        ({ kind }) => kind !== "treasure" && kind !== "coin",
      ),
      id,
    );
  }
});

// #512: before the Delve, no merchant was sure to be met until Thornwood
// Lodge, so a career had nowhere to sell its finds.
test("Hedda the Pedlar trades in the porter's lodge: the kitchen's purse buys a shield", () => {
  assert.deepEqual(
    room("porters-lodge").creatures.map(({ id, name, merchant }) => [
      id,
      name,
      merchant,
    ]),
    [
      [
        "hedda",
        "Hedda the Pedlar",
        { stock: ["shortbow", "arrows", "shield", "chain-shirt"], minutes: 10 },
      ],
    ],
  );
  const { state } = firstJourney(
    delve,
    level2,
    [
      ["move", "gate-hall"],
      ["move", "fallen-kitchen"],
      ["examine", "bone-heap"],
      ["take", "travellers-purse"],
      ["move", "gate-hall"],
      ["move", "porters-lodge"],
      ["buy", "shield"],
    ],
    ({ status }) => status === "playing",
  );
  assert.deepEqual(state.possessions.stowed, ["shield"]);
  assert.equal(state.possessions.purse, 0);
});

// #388: #239 turned the barrel's longsword into a shortsword, but the
// barrel's discovery still named a longsword.
test("each feature's discovery names the gear hidden in it", () => {
  for (const { features = [], items } of delve.rooms) {
    for (const { id, discovery } of features) {
      for (const { gear } of items.filter(
        (item) => item.kind === "gear" && item.hiddenIn === id,
      )) {
        assert.match(discovery, new RegExp(gear.replaceAll("-", " ")), id);
      }
    }
  }
  assert.doesNotMatch(
    feature("storeroom", "old-barrel").discovery,
    /longsword/,
  );
});

const TO_THE_WELL = [
  ["move", "gate-hall"],
  ["move", "porters-lodge"],
  ["examine", "peg-rail"],
  ["take", "coil-of-rope"],
  ["move", "gate-hall"],
  ["move", "guard-post"],
  ["move", "dry-well"],
  ["use", "well-head", "coil-of-rope"],
  ["talk", "the-woman"],
  ["talk", "the-tomb"],
  ["talk", "the-bell"],
  ["move", "well-bottom"],
];

test("down the old well with the porter's rope: the goblin goes free and talks, Mags falls in the ossuary, and coin without the vault's chest is not the garrison's pay (#611)", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["examine", "silted-floor"],
      ["take", "wishing-coins"],
      ["move", "flooded-cistern"],
      ["examine", "drowned-delver"],
      ["take", "delvers-savings"],
      ["move", "ossuary"],
      // Mags reacts (#601); a seed where she is hostile is passed over.
      ["react", "attack"],
      ["examine", "mags-satchel"],
      ["take", "satchel-gold"],
      ["move", "shaft-bottom"],
      ["leave", "shaft-bottom"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-empty-handed");
  assert.ok(state.flags.includes("goblin-freed"));
  assert.ok(!state.inventory.includes("coil-of-rope"));
  assert.deepEqual(state.clearedEncounterIds, [
    "guard-zombie",
    "ossuary-rival",
  ]);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Zombie", 50],
    ["Defeated Mags Corrow", 25],
  ]);
});

test("with the goblin's directions, the sarcophagus gives up the death mask and the grave coins", () => {
  const { state } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["move", "flooded-cistern"],
      ["move", "ossuary"],
      ["react", "attack"],
      ["move", "lords-tomb"],
      ["examine", "sarcophagus-lid", "investigation"],
      ["take", "death-mask"],
      ["take", "grave-coins"],
    ],
    ({ status, possessions }) =>
      status === "playing" && possessions.purse === 700,
  );
  assert.ok(state.inventory.includes("death-mask"));
});

// #601: the posts.
test("a garrison badge stands the posts aside: the Guard Post and the Barracks are walked through unfought, for no XP, and their coin is not the garrison's pay (#611)", () => {
  const badges = delve.rooms.flatMap(({ items }) =>
    items.filter(({ sets }) => sets === "posts-stand-aside"),
  );
  assert.deepEqual(
    badges.map(({ id, name, kind, hiddenIn }) => [id, name, kind, hiddenIn]),
    [
      ["garrison-badge", "Garrison Badge", "key", "old-barrel"],
      ["drowned-badge", "Garrison Badge", "key", "black-water"],
    ],
  );
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ["move", "gate-hall"],
      ["force", "swollen-door"],
      ["move", "storeroom"],
      ["examine", "old-barrel"],
      ["take", "garrison-badge"],
      ["move", "gate-hall"],
      ["move", "barracks"],
      ["examine", "footlocker"],
      ["take", "soldiers-pay"],
      ["move", "gate-hall"],
      ["move", "guard-post"],
      ["examine", "overturned-table"],
      ["take", "guard-purse"],
      ["move", "gate-hall"],
      ["move", "broken-gate"],
      ["leave", "broken-gate"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.ok(state.flags.includes("posts-stand-aside"));
  assert.deepEqual(state.clearedEncounterIds, []);
  assert.equal(state.possessions.purse, 250 + 180);
  assert.equal(state.endingId, "out-empty-handed");
  // Withdrawn posts pay nothing, and nor does leaving without the chest.
  assert.deepEqual(xpOf(runtime, state), []);
});

test("the second badge lies under the cistern's black water: a dive or a sharp eye brings it up, and a bad failure costs cold damage", () => {
  const { check } = feature("flooded-cistern", "black-water");
  assert.deepEqual(
    check.approaches.map(({ skill, dc }) => [skill, dc]),
    [
      ["athletics", 12],
      ["perception", 13],
      ["investigation", 13],
    ],
  );
  assert.deepEqual(check.bands["failure-by-5"].effects, [
    {
      type: "damage",
      dice: 1,
      sides: 6,
      modifier: 0,
      damageType: "cold",
      defeatEndingId: "lost-in-the-delve",
    },
  ]);
  assert.equal(check.bands.failure.effects, undefined);
  assert.deepEqual(check.bands.success.effects, [
    { type: "discovery", feature: "black-water" },
    { type: "item", item: "drowned-badge" },
  ]);
  const { state } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["move", "flooded-cistern"],
      ["examine", "black-water", "athletics"],
      ["take", "drowned-badge"],
    ],
    ({ status }) => status === "playing",
  );
  assert.ok(state.flags.includes("posts-stand-aside"));
});

// #601: who you take up with.
test("coming to terms with Mags opens her mouth and shuts the goblin's", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ["move", "gate-hall"],
      ["move", "guard-post"],
      ["move", "dry-well"],
      ["talk", "the-vault"],
      ["move", "shrine"],
      ["move", "shaft-bottom"],
      ["move", "ossuary"],
      ["react", "let-pass"],
      ["talk", "the-badge"],
      ["talk", "where-badges-are"],
      ["move", "shaft-bottom"],
      ["move", "shrine"],
      ["move", "dry-well"],
    ],
    ({ status, roomId }) => status === "playing" && roomId === "dry-well",
    { limit: 400 },
  );
  assert.ok(state.flags.includes("mags-dealt"));
  assert.deepEqual(state.peacefulEncounterIds, ["ossuary-rival"]);
  assert.ok(state.talkedTopicIds.includes("where-badges-are"));
  // The goblin tells her new partner nothing, even what he would have
  // told anyone before.
  for (const topicId of ["the-vault", "the-stair"]) {
    assert.ok(refused(runtime, state, { type: "talk", topicId }), topicId);
  }
});

test("fetching the goblin up shuts Mags's mouth, even on terms", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["move", "flooded-cistern"],
      ["move", "ossuary"],
      ["react", "let-pass"],
    ],
    ({ status }) => status === "playing",
    { limit: 400 },
  );
  assert.ok(state.flags.includes("goblin-freed"));
  assert.ok(state.flags.includes("mags-dealt"));
  for (const [topicId] of topicsOf("ossuary")) {
    assert.ok(refused(runtime, state, { type: "talk", topicId }), topicId);
  }
});

// #601: the Castellan's deal.
const TO_THE_GRILLE = [
  ["move", "gate-hall"],
  ["move", "guard-post"],
  ["move", "dry-well"],
  ["move", "shrine"],
  ["examine", "altar"],
  ["take", "bronze-key"],
  ["move", "shaft-bottom"],
  ["talk", "his-offer"],
];

// The owner reached the Shaft Bottom by the old well, with no key, and the
// voice said "You have the chaplain's key": there was nothing to pass through
// the bars. The offer now holds either way, and says where the key is.
test("the Castellan's offer never says the character holds the key, and says where it is", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["move", "flooded-cistern"],
      ["move", "ossuary"],
      ["react", "let-pass"],
      ["move", "shaft-bottom"],
    ],
    ({ status }) => status === "playing",
    { limit: 400 },
  );
  assert.equal(state.inventory.includes("bronze-key"), false);
  const offer = runtime.handleAction(state, {
    type: "talk",
    topicId: "his-offer",
  });
  assert.equal(offer.rejection, undefined);
  const said = renderFifthResult(offer);
  assert.match(said, /He left it on his altar/u);
  assert.match(said, /Bring it here, pass it through/u);
  assert.doesNotMatch(said, /You have the chaplain's key/u);
  // Without the key there is nothing to use on the grille.
  assert.deepEqual(
    runtime
      .projectActions(offer.state)
      .filter(({ action }) => action === "use-on"),
    [],
  );
});

test("the Castellan's deal: the chaplain's key through the grille lets him out with the Pay Roll, and the chest is left unguarded", () => {
  assert.deepEqual(topicsOf("shaft-bottom"), [
    ["who-he-is", undefined, "castellan-silent"],
    ["the-dead", undefined, "castellan-silent"],
    ["the-relief", undefined, "castellan-silent"],
    ["his-offer", undefined, "castellan-silent"],
  ]);
  const grille = feature("shaft-bottom", "door-grille");
  assert.deepEqual(
    grille.uses.map(({ item, consumes, coins, effects }) => [
      item,
      consumes,
      coins,
      effects,
    ]),
    [
      [
        "bronze-key",
        undefined,
        undefined,
        [
          { type: "set", flag: "castellan-freed" },
          { type: "set", flag: "castellan-silent" },
        ],
      ],
    ],
  );
  assert.equal(grille.changed.when, "castellan-silent");
  // The gate and Hedda show that something walked out.
  assert.equal(
    feature("broken-gate", "chalk-marks").changed.when,
    "castellan-freed",
  );
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_GRILLE,
      ["use", "door-grille", "bronze-key"],
      ["unlock", "vault-door"],
      ["move", "vault"],
      ["examine", "iron-chest"],
      ["take", "coin-chest"],
      ["take", "vault-garnet"],
    ],
    ({ status, roomId }) => status === "playing" && roomId === "vault",
  );
  assert.ok(state.flags.includes("castellan-freed"));
  // The key is kept, and opens the door on an empty vault.
  assert.ok(state.inventory.includes("bronze-key"));
  assert.equal(state.encounter, undefined);
  assert.ok(!state.clearedEncounterIds.includes("vault-ghoul"));
  assert.equal(state.possessions.purse, 4500);
  // He took the roll with him: relief is closed.
  assert.ok(refused(runtime, state, { type: "take", itemId: "pay-roll" }));
  assert.ok(refused(runtime, state, { type: "examine", targetId: "ghoul" }));
  const left = runtime.handleAction(
    runtime.handleAction(state, {
      type: "move",
      destinationId: "shaft-bottom",
    }).state,
    { type: "leave", roomId: "shaft-bottom" },
  ).state;
  assert.equal(left.endingId, "out-with-the-loot");
  // He no longer answers at the grille.
  assert.ok(
    refused(
      runtime,
      runtime.handleAction(state, {
        type: "move",
        destinationId: "shaft-bottom",
      }).state,
      { type: "talk", topicId: "who-he-is" },
    ),
  );
});

// #608, #609: a Castellan fought bargains no more, and no one speaks at
// the grille.

/** The names on the Here list of the room the state is in. */
const hereNames = (runtime, state) =>
  runtime.projectRoom(state).creatures.map(({ name }) => name);
const usesOffered = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "use-on")
    .map(({ target, item }) => [target.id, item.id]);

test("the deal is offered only until the Castellan is silent, and the Voice at the Grille goes with it (#608, #609)", () => {
  const grille = feature("shaft-bottom", "door-grille");
  assert.equal(grille.uses[0].offeredUntil, "castellan-silent");
  const { state, runtime } = firstJourney(
    delve,
    level2,
    TO_THE_GRILLE,
    ({ status }) => status === "playing",
  );
  assert.deepEqual(hereNames(runtime, state), ["Voice at the Grille"]);
  assert.deepEqual(usesOffered(runtime, state), [
    ["door-grille", "bronze-key"],
  ]);
  const dealt = runtime.handleAction(state, {
    type: "use-on",
    featureId: "door-grille",
    itemId: "bronze-key",
  }).state;
  assert.deepEqual(hereNames(runtime, dealt), []);
  assert.deepEqual(usesOffered(runtime, dealt), []);
});

test("after the vault fight is won, the grille offers no deal and no voice answers (#608)", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_GRILLE,
      ["unlock", "vault-door"],
      ["move", "vault"],
      ["move", "shaft-bottom"],
    ],
    ({ status, clearedEncounterIds }) =>
      status === "playing" && clearedEncounterIds.includes("vault-ghoul"),
    { limit: 400 },
  );
  assert.ok(state.flags.includes("castellan-silent"));
  assert.deepEqual(hereNames(runtime, state), []);
  assert.deepEqual(usesOffered(runtime, state), []);
  assert.ok(
    refused(runtime, state, {
      type: "use-on",
      featureId: "door-grille",
      itemId: "bronze-key",
    }),
  );
});

test("a Castellan fought and fled bargains no more: the grille offers no deal (#609)", () => {
  const { state: atDoor, runtime } = firstJourney(
    delve,
    level2,
    [...TO_THE_GRILLE, ["unlock", "vault-door"]],
    ({ status }) => status === "playing",
  );
  let fled;
  for (let seed = 0; seed < 200 && fled === undefined; seed += 1) {
    const random = createSeededRandom(seed);
    let state = runtime.handleAction(
      atDoor,
      { type: "move", destinationId: "vault" },
      random,
    ).state;
    for (
      let turn = 0;
      turn < 20 && state.encounter?.outcome === "ongoing";
      turn += 1
    ) {
      const away = runtime.handleAction(
        state,
        { type: "flee", destinationId: "shaft-bottom" },
        random,
      );
      state = (
        away.rejection === undefined
          ? away
          : runtime.handleAction(
              state,
              { type: "end-turn", actorId: "pc" },
              random,
            )
      ).state;
    }
    if (
      state.status === "playing" &&
      (state.fledEncounterIds ?? []).includes("vault-ghoul") &&
      state.roomId === "shaft-bottom"
    ) {
      fled = state;
    }
  }
  assert.ok(fled, "no seed below 200 flees the vault fight");
  assert.ok(fled.flags.includes("castellan-silent"));
  assert.ok(!fled.flags.includes("castellan-freed"));
  assert.ok(fled.inventory.includes("bronze-key"));
  assert.deepEqual(usesOffered(runtime, fled), []);
  assert.deepEqual(hereNames(runtime, fled), []);
});

// #610: the victory and the escape with loot share one award.

test("a character credited the relief is paid nothing more for carrying the chest out (#610)", () => {
  const veteran = {
    ...level2,
    xpAwards: [
      ...level2.xpAwards,
      "abandoned-delve/ending/the-watch-stands-down",
    ],
  };
  const { state, runtime } = firstJourney(
    delve,
    veteran,
    [
      ...TO_THE_GRILLE,
      ["use", "door-grille", "bronze-key"],
      ["unlock", "vault-door"],
      ["move", "vault"],
      ["examine", "iron-chest"],
      ["take", "coin-chest"],
      ["move", "shaft-bottom"],
      ["leave", "shaft-bottom"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-loot");
  // Only the zombie on the stair pays: the ending's 600 XP was had.
  assert.deepEqual(xpOf(runtime, state), [["Defeated Zombie", 50]]);
});

// #601: the muster. The owner's price (#601): half the vault's coin, so
// the vault alone pays it at every Treasure found setting.
const TO_THE_BELL = [
  ...TO_THE_WELL,
  ["move", "flooded-cistern"],
  ["move", "ossuary"],
  ["react", "attack"],
  ["move", "lords-tomb"],
  ["examine", "sarcophagus-lid", "investigation"],
  ["move", "ossuary"],
  ["move", "shaft-bottom"],
  ["talk", "the-relief"],
  ["move", "shrine"],
  ["examine", "altar"],
  ["take", "bronze-key"],
  ["move", "shaft-bottom"],
  ["unlock", "vault-door"],
  ["move", "vault"],
  // Refusing the deal is a fight; the oath opens it.
  ["use-feature", "iron-chest", "ghoul", "religion"],
  ["examine", "ghoul"],
  ["take", "pay-roll"],
];
const BACK_TO_THE_BELL = [
  ["move", "shaft-bottom"],
  ["move", "ossuary"],
  ["move", "flooded-cistern"],
  ["move", "well-bottom"],
  ["move", "dry-well"],
  ["move", "guard-post"],
  ["move", "gate-hall"],
];

test("the muster bell rings at a look and rouses the delve; with the Pay Roll and half the vault's coin it stands the watch down", () => {
  const bell = feature("gate-hall", "muster-bell");
  assert.deepEqual(noisyBands(bell.check), [
    ["failure", true],
    ["success", true],
  ]);
  assert.deepEqual(
    bell.uses.map(({ item, consumes, coins, effects }) => [
      item,
      consumes,
      coins,
      effects,
    ]),
    [
      [
        "pay-roll",
        true,
        { gp: 15, sp: 75 },
        [
          { type: "set", flag: "watch-relieved" },
          { type: "set", flag: "posts-stand-aside" },
        ],
      ],
    ],
  );
  // 15 gp and 75 sp are 2,250 cp: half of the chest's 30 gp and 150 sp.
  const chest = room("vault").items.find(({ id }) => id === "coin-chest");
  assert.deepEqual(chest.coins, { gp: 30, sp: 150 });
  // The Castellan carries the roll.
  assert.deepEqual(
    room("vault")
      .items.filter(({ hiddenIn }) => hiddenIn === "ghoul")
      .map(({ id, kind }) => [id, kind]),
    [["pay-roll", "key"]],
  );
  for (const band of ["failure", "success"]) {
    const { state } = firstJourney(
      delve,
      level2,
      [
        ["move", "gate-hall"],
        ["examine", "muster-bell"],
      ],
      ({ checks }) => checks.at(-1).band.startsWith(band),
    );
    assert.ok(state.flags.includes("delve-roused"), band);
  }
});

test("the reliever: the goblin, the lord's order, the oath and the fight, then the muster pays the dead and the gate pays 600 XP", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_BELL,
      ["examine", "iron-chest"],
      ["take", "coin-chest"],
      ...BACK_TO_THE_BELL,
      ["use", "muster-bell", "pay-roll"],
      ["move", "broken-gate"],
      ["leave", "broken-gate"],
    ],
    ({ status, fightActions = [] }) =>
      status === "victory" &&
      fightActions.some(({ band }) => band.startsWith("success")),
    { limit: 400 },
  );
  assert.equal(state.endingId, "the-watch-stands-down");
  assert.ok(state.flags.includes("watch-relieved"));
  assert.ok(state.flags.includes("posts-stand-aside"));
  assert.deepEqual(
    state.fightActions.map(({ featureId }) => featureId),
    ["iron-chest"],
  );
  // The roll is used up, and half the chest went to the dead.
  assert.ok(!state.inventory.includes("pay-roll"));
  assert.equal(state.possessions.purse, 4500 - 2250);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Zombie", 50],
    ["Defeated Mags Corrow", 25],
    ["Defeated Castellan", 200],
    ["The watch stands down", 600],
  ]);
});

test("the muster is refused with too little coin, and the Pay Roll is kept", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    // The chest is left in the vault.
    [...TO_THE_BELL, ...BACK_TO_THE_BELL],
    ({ status, roomId }) => status === "playing" && roomId === "gate-hall",
    { limit: 400 },
  );
  assert.equal(state.possessions.purse, 0);
  const result = runtime.handleAction(state, {
    type: "use-on",
    featureId: "muster-bell",
    itemId: "pay-roll",
  });
  assert.match(
    result.rejection.reason,
    /^Using the Pay Roll on the Muster Bell costs 22 gp 5 sp, /u,
  );
  assert.ok(result.state.inventory.includes("pay-roll"));
  assert.ok(!result.state.flags.includes("watch-relieved"));
});

// #601, the clicker test: the gate's runs examine everything, take
// everything, use every item a feature accepts and pay for any use they
// can afford (src/balance-5e.ts), so the gate already is a player who
// clicks every button. The best ending must need a choice it never makes:
// refusing the Castellan's deal.
test("the clicker never relieves the watch: a gate run that takes the Castellan's deal never ends in The watch stands down", () => {
  const SEEDS = 50;
  const DEAL = "door-grille:bronze-key";
  const VICTORY = "the-watch-stands-down";
  const judged = [
    {},
    ...delve.routes.map((route) => ({ route })),
    ...regionSweeps(delve).map((sweep) => ({ sweep })),
  ].map((options) => [GATE_STYLE, options]);
  let dealt = 0;
  for (const classId of GATE_CLASSES) {
    const [{ dice }] = percentileCharacters({
      percentiles: [WEAKEST_PERCENTILE],
      classId,
    });
    const sheet = characterAtLevel(
      dice,
      2,
      undefined,
      false,
      undefined,
      classId,
    );
    // The judged cautious runs, and the direct style, which enters every
    // room.
    for (const [style, options] of [...judged, [XP_STYLE, {}]]) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const run = playAdventure(
          createFifthRuntime(delve, sheet),
          style,
          seed,
          options,
        );
        const label = `${classId} ${style} ${options.route?.id ?? options.sweep?.region ?? "fewest fights"} seed ${seed}`;
        if (run.uses.includes(DEAL)) {
          dealt += 1;
          assert.notEqual(run.endingId, VICTORY, label);
          assert.ok(!run.uses.includes("muster-bell:pay-roll"), label);
        }
        if (style === GATE_STYLE) {
          // No judged run reaches the best ending at all.
          assert.notEqual(run.endingId, VICTORY, label);
          // And one that walks a route out alive has always dealt: it
          // reaches the Shaft Bottom holding the key.
          if (options.route !== undefined && run.outcome !== "defeat") {
            assert.ok(run.uses.includes(DEAL), label);
          }
        }
      }
    }
  }
  assert.ok(dealt > 0);
});

function scripted(responses) {
  return {
    async respond() {
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}

const call = (name, args = {}) => ({
  toolCalls: [{ id: "call-1", name, argumentsJson: JSON.stringify(args) }],
});

/**
 * Plays `steps` as scripted-DM turns, each one tool call the engine must
 * accept, and fights each fight to its end by attacking the first opponent
 * offered. Leaving is the browser's action, never the DM's, so it goes to
 * the engine directly. Stops early once the adventure ends.
 */
async function journey(sheet, seed, steps) {
  const runtime = createFifthRuntime(delve, sheet);
  const random = createSeededRandom(seed);
  const dm = async (state, name, args) => {
    const result = await runDmTurn({
      state,
      playerInput: `${name} ${JSON.stringify(args)}`,
      transcript: [],
      random,
      model: scripted([call(name, args)]),
      runtime,
    });
    const refused = result.toolResults.find(
      ({ engineResult }) => engineResult?.rejection !== undefined,
    );
    assert.equal(refused, undefined, `${name} ${JSON.stringify(args)}`);
    return result.state;
  };
  const fight = async (start) => {
    let state = start;
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      // Last Stand (#499): the journey falls, as it did before the rule;
      // no AI DM tool takes the fall.
      if (state.encounter.pendingReaction?.kind === "last-stand") {
        state = runtime.handleAction(state, {
          type: "fall",
          actorId: "pc",
        }).state;
        continue;
      }
      const attack = runtime
        .getGameToolDefinitions(state)
        .find(({ name }) => name === "attack");
      state =
        attack === undefined
          ? await dm(state, "end_turn")
          : await dm(state, "attack", {
              target: attack.parameters.properties.target.enum[0],
            });
    }
    return state;
  };
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  for (const [name, args] of steps) {
    if (state.status !== "playing") {
      break;
    }
    state =
      name === "leave"
        ? runtime.handleAction(state, { type: "leave", roomId: args }).state
        : await fight(await dm(state, name, args));
  }
  return { state, runtime };
}

const PUSH_DEEPER = [
  ["examine", { target: "chalk-marks" }],
  ["move", { destination: "gate-hall" }],
  ["move", { destination: "guard-post" }],
  ["examine", { target: "overturned-table" }],
  ["take", { item: "guard-purse" }],
  ["examine", { target: "weapon-rack" }],
  ["take", { item: "rack-potion" }],
  ["move", { destination: "dry-well" }],
  ["talk", { topic: "the-vault" }],
  ["search", { room: "dry-well" }],
  ["move", { destination: "shrine" }],
  ["examine", { target: "altar" }],
  ["take", { item: "bronze-key" }],
  ["move", { destination: "shaft-bottom" }],
  ["unlock", { door: "vault-door" }],
  ["move", { destination: "vault" }],
  ["examine", { target: "iron-chest" }],
  ["take", { item: "vault-garnet" }],
  ["take", { item: "coin-chest" }],
  ["move", { destination: "shaft-bottom" }],
  ["leave", "shaft-bottom"],
];

/**
 * The first seed from 0 on whose journey ends with `endingId` and, if
 * given, whose last state `wanted` accepts. A seed on which the engine
 * refuses a step (Mags hostile, so no reaction to answer) is passed over.
 */
async function seedFor(sheet, steps, endingId, wanted = () => true) {
  for (let seed = 0; seed < 200; seed++) {
    let state;
    try {
      ({ state } = await journey(sheet, seed, steps));
    } catch {
      continue;
    }
    if (state.endingId === endingId && wanted(state)) {
      return seed;
    }
  }
  throw new Error(`no seed reaches ${endingId}`);
}

test("scripted DM: pushing on to the vault and climbing the shaft escapes with all the loot", async () => {
  const seed = await seedFor(
    STRONG,
    PUSH_DEEPER,
    "out-with-the-loot",
    ({ flags }) => !flags.includes("delve-roused"),
  );
  const { state, runtime } = await journey(STRONG, seed, PUSH_DEEPER);
  assert.equal(state.status, "escaped");
  assert.deepEqual(
    state.inventory.filter(
      (id) =>
        delve.rooms.flatMap(({ items }) => items).find((item) => item.id === id)
          .kind === "treasure",
    ),
    ["vault-garnet"],
  );
  // The guard's purse and the chest's coin went into the purse.
  assert.equal(state.possessions.purse, 180 + 4500);
  assert.deepEqual(state.clearedEncounterIds, ["guard-zombie", "vault-ghoul"]);
  // The fights' XP and the ending's.
  assert.equal(
    runtime.projectSettlement(state).xp.reduce((sum, { xp }) => sum + xp, 0),
    50 + 200 + 600,
  );
});

// #442: the vault's fight going on past round 4 rouses the crypts, and Mags
// runs from the ossuary to the shaft bottom, where Ada meets her on the way
// out. She reacts (#601), and Ada attacks.
test("scripted DM: a long fight in the vault rouses the crypts, and Mags waits at the shaft", async () => {
  const steps = [
    ...PUSH_DEEPER.slice(0, -1),
    ["react", { option: "attack" }],
    PUSH_DEEPER.at(-1),
  ];
  const seed = await seedFor(STRONG, steps, "out-with-the-loot", ({ flags }) =>
    flags.includes("delve-roused"),
  );
  const { state, runtime } = await journey(STRONG, seed, steps);
  assert.deepEqual(state.clearedEncounterIds, [
    "guard-zombie",
    "vault-ghoul",
    "ossuary-rival",
  ]);
  assert.equal(
    runtime.projectSettlement(state).xp.reduce((sum, { xp }) => sum + xp, 0),
    50 + 200 + 25 + 600,
  );
});

test("scripted DM: turning back at the gate before any fight escapes empty-handed", async () => {
  const { state } = await journey(STRONG, 0, [
    ["examine", { target: "chalk-marks" }],
    ["move", { destination: "gate-hall" }],
    ["move", { destination: "broken-gate" }],
    ["leave", "broken-gate"],
  ]);
  assert.equal(state.status, "escaped");
  assert.equal(state.endingId, "out-empty-handed");
});

test("scripted DM: a feeble Fighter who walks into the barracks and the crypt falls", async () => {
  const steps = [
    ["move", { destination: "gate-hall" }],
    ["move", { destination: "barracks" }],
    ["move", { destination: "gate-hall" }],
    ["move", { destination: "guard-post" }],
    ["move", { destination: "dry-well" }],
    ["move", { destination: "web-crypt" }],
  ];
  const seed = await seedFor(WEAK, steps, "lost-in-the-delve");
  const { state } = await journey(WEAK, seed, steps);
  assert.equal(state.status, "defeat");
  assert.equal(state.character.hp, 0);
});

// The DM evaluation's cases and the live qualification are written for the
// delve (#138); issue-138.test.mjs tests their harness on fixtures (#255).
const qualify = fileURLToPath(
  new URL("../scripts/qualify-delve-live.mjs", import.meta.url),
);

const withDirectory = async (work) => {
  const directory = await mkdtemp(join(tmpdir(), "delve-qualify-"));
  try {
    await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("the DM evaluation covers interpretation, refusal and narration fidelity on the dungeon", () => {
  assert.deepEqual(
    [...new Set(FIFTH_DM_CASES.map(({ kind }) => kind))].sort(),
    ["interpretation", "narration-fidelity", "refusal"],
  );
  const dimensions = new Set(FIFTH_DM_CASES.flatMap((c) => c.dimensions));
  for (const dimension of [
    "clear-accuracy",
    "synonym-accuracy",
    "navigation-accuracy",
    "target-accuracy",
    "status-accuracy",
    "compound-mutation-budget",
    "ambiguous-clarification",
    "refusal",
    "narration-fidelity",
  ]) {
    assert.ok(dimensions.has(dimension), dimension);
  }
  assert.equal(
    new Set(FIFTH_DM_CASES.map(({ id }) => id)).size,
    FIFTH_DM_CASES.length,
  );
});

test("every case's setup offers the AI DM exactly the enabled actions", () => {
  for (const sample of FIFTH_DM_CASES) {
    const session = setUpCase(sample, delve);
    const ended = [
      "after-the-ending",
      "after-a-defeat",
      "status-after-the-ending",
    ];
    assert.equal(
      session.state.status === "playing",
      !ended.includes(sample.id),
      sample.id,
    );
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
});

test("a correct scripted DM passes every automated check, and the DM-off notice is checked", async () => {
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    createModel: (sample) => scriptedCaseModel(sample),
    manualJudgments: Object.fromEntries(
      FIFTH_DM_CASES.map((sample) => [
        sample.id,
        {
          1: Object.fromEntries(sample.manualJudgments.map((id) => [id, true])),
        },
      ]),
    ),
  });
  for (const run of report.runs) {
    assert.ok(Object.values(run.checks).every(Boolean), run.caseId);
  }
  assert.deepEqual(report.dmOff, { refused: true });
  assert.equal(report.passed, true);
  assert.ok(report.providerCalls <= report.maxCalls);
});

test("the live qualification runs only with --live and a key, and its dry run flags overclaims", () =>
  withDirectory(async (directory) => {
    const env = { ...process.env, OPENAI_API_KEY: "" };
    for (const args of [
      ["--dry-run", "--live"],
      ["--dry-run", "--max-calls", "0"],
      ["--dry-run", "--max-calls"],
      ["--dry-run", "report.json"],
    ]) {
      const refused = spawnSync(process.execPath, [qualify, ...args], {
        encoding: "utf8",
        env,
      });
      assert.equal(refused.status, 2, args.join(" "));
    }
    const bare = spawnSync(process.execPath, [qualify], {
      encoding: "utf8",
      env,
    });
    assert.equal(bare.status, 2);
    const noKey = spawnSync(process.execPath, [qualify, "--live"], {
      encoding: "utf8",
      env,
    });
    assert.equal(noKey.status, 2);
    assert.match(noKey.stderr, /OPENAI_API_KEY is required for --live/);

    const output = join(directory, "report.json");
    const dry = spawnSync(
      process.execPath,
      [qualify, "--dry-run", "--output", output, "--max-calls", "5"],
      {
        // From the empty directory: a dry run leaves only its report, no
        // run folder under .verify-artifacts.
        cwd: directory,
        encoding: "utf8",
        env,
        timeout: 20000,
      },
    );
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(await readdir(directory), ["report.json"]);
    const report = await readJson(output);
    assert.equal(report.runDirectory, undefined);
    assert.equal(report.adventureId, "abandoned-delve");
    assert.equal(report.maxProviderCalls, 5);
    assert.ok(report.providerCalls <= 5);
    assert.deepEqual(
      [...new Set(report.turns.map(({ kind }) => kind))].sort(),
      ["interpretation", "narration-fidelity", "refusal"],
    );
    // One call a turn: the first five overclaim and are flagged; after the
    // budget is spent, each turn gets the engine's safe fallback.
    assert.equal(report.providerCalls, 5);
    assert.deepEqual(
      report.turns.map(({ reviewClaim }) => reviewClaim),
      [true, true, true, true, true, false, false, false, false, false],
    );
  }));

/** Each band of a door's check, and whether it is noisy. */
const noisyBands = (check) =>
  Object.entries(check.bands).map(([band, { noisy }]) => [band, noisy]);
const ALL_NOISY = [
  ["failure-by-5", true],
  ["failure", true],
  ["success", true],
];

// #545: a door broken or forced open rouses the crypts, success included.
const forcedOpen = (doorId) => (state) =>
  state.status === "playing" &&
  state.flags.includes("delve-roused") &&
  state.checks.some(
    ({ id, band }) => id.endsWith(doorId) && band.startsWith("success"),
  );

test("forcing the swollen storeroom door open rouses the crypts", () => {
  const { state } = firstJourney(
    delve,
    testFighterAt(2),
    [
      ["move", "gate-hall"],
      ["force", "swollen-door"],
    ],
    forcedOpen("swollen-door"),
  );
  assert.ok(state.openedDoorIds.includes("swollen-door"));
});

test("breaking the vault door open rouses the crypts, which brings Mags to the shaft bottom", () => {
  const { state } = firstJourney(
    delve,
    testFighterAt(2),
    [
      ["move", "gate-hall"],
      ["move", "guard-post"],
      ["move", "dry-well"],
      ["search", "dry-well"],
      ["move", "shrine"],
      ["move", "shaft-bottom"],
      ["break", "vault-door"],
    ],
    forcedOpen("vault-door"),
    { limit: 200 },
  );
  assert.ok(state.openedDoorIds.includes("vault-door"));
  // Mags has left the ossuary for the shaft bottom, where she waits.
  const placements = encounterPlacements(delve);
  const at = (roomId) =>
    encounterInRoom(placements, roomId, state.flags, state.metEncounters);
  assert.equal(at("shaft-bottom"), "ossuary-rival");
  assert.equal(at("ossuary"), undefined);
});

// #621: the sounds beyond its arches and the Barracks's guards are words of
// those fights' presence, gone once a fight is settled or has moved away.
test("the delve's sounds and guards go with their fights (#621)", () => {
  const runtime = createFifthRuntime(delve, STRONG);
  const begun = runtime.handleAction(runtime.createSession(), {
    type: "begin",
  }).state;
  const at = (state, roomId) => ({ ...state, roomId });
  const words = (state, roomId) => {
    const view = runtime.projectRoom(at(state, roomId));
    return [
      view.description,
      ...view.exits.map(({ name, description }) => `${name}: ${description}`),
    ].join("\n");
  };
  const unsettled = [
    ["gate-hall", "Bones clatter beyond the barracks arch."],
    ["gate-hall", "Barracks: An arch. Bones clatter beyond it."],
    [
      "gate-hall",
      "Fallen Kitchen: A rubble-strewn arch toward daylight. Something growls beyond it.",
    ],
    [
      "barracks",
      "Rows of collapsed bunks, and a footlocker at the far end. Two skeletons in rusted mail stand guard beside it.",
    ],
    [
      "flooded-cistern",
      "Ossuary: The walkway round the cistern, to an arch. Something taps beyond it.",
    ],
  ];
  for (const [roomId, line] of unsettled) {
    assert.ok(words(begun, roomId).includes(line), `${roomId}: ${line}`);
  }
  // Won, stood aside or gone to the shaft, the fights are silent.
  const settled = {
    ...begun,
    clearedEncounterIds: ["kitchen-wolf"],
    flags: [...begun.flags, "posts-stand-aside", "delve-roused"],
  };
  for (const [roomId] of unsettled) {
    assert.doesNotMatch(
      words(settled, roomId),
      /clatter|growls|taps|skeletons/u,
      roomId,
    );
  }
  assert.ok(
    words(settled, "barracks").startsWith(
      "Rows of collapsed bunks, and a footlocker at the far end.\n",
    ),
  );
});

// #622: carrying a garrison badge is enough, and its words say so.
test("a garrison badge's words say carrying it is enough (#622)", () => {
  const badges = delve.rooms
    .flatMap(({ items }) => items)
    .filter(({ name }) => name === "Garrison Badge");
  assert.equal(badges.length, 2);
  for (const { description } of badges) {
    assert.match(
      description,
      /Carrying it marks you as one of the garrison\.$/u,
    );
    assert.doesNotMatch(description, /pinned|wearer/iu);
  }
});
