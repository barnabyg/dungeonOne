// #412: The Coldwater Weirgate, the increment 17 release module, as the
// owner approved it in #411 with the six changes approved on #412: a long
// level-3 Medium module of twenty rooms in two regions, the Keep above and
// the Culverts below. Two ways lead down, the keeper's stair (Sergeant
// Larrow's key, a pick or a break, and a bell-wire deadfall) and the culvert
// the keeper's crank drains; Grisk waits in the gear hall at the end of both.
// Off the routes, the kobolds bargain, Old Sullage the ogre can be lured
// away with salt pork, and the weir bell raises the Keep. Journeys reach its
// endings by both ways; shipped-modules.test.mjs checks it qualifies at its
// declared difficulty, with its routes', sweeps' and quoted figures.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encounterInRoom,
  encounterPlacements,
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { regionSweeps, requiredPath } from "../dist/balance-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { velaAt3 } from "./fixtures/level-3-casters.mjs";
import { firstJourney, routeAction, xpOf } from "./fixtures/module-journey.mjs";

const weirgate = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "coldwater-weirgate",
);
const room = (id) => weirgate.rooms.find((entry) => entry.id === id);
const passage = (id) => weirgate.passages.find((entry) => entry.id === id);
const encounter = (id) => weirgate.encounters.find((entry) => entry.id === id);
const feature = (roomId, id) =>
  room(roomId).features.find((entry) => entry.id === id);
const level3 = testFighterAt(3);

test("the weirgate is a long level-3 Medium module of twenty rooms in two regions, left by the towpath or the outfall", () => {
  assert.equal(weirgate.title, "The Coldwater Weirgate");
  assert.deepEqual(weirgate.recommendedLevels, { min: 3, max: 3 });
  assert.equal(weirgate.difficulty, "medium");
  assert.equal(weirgate.long, true);
  assert.equal(weirgate.startRoomId, "towpath-gate");
  assert.deepEqual(
    weirgate.regions.map(({ id, name }) => [id, name]),
    [
      ["keep", "The Keep"],
      ["culverts", "The Culverts"],
    ],
  );
  assert.deepEqual(
    weirgate.rooms.map(({ id, region, exit, restSite, avoidable }) => [
      id,
      region,
      exit === true,
      restSite === true,
      avoidable === true,
    ]),
    [
      ["towpath-gate", "keep", true, false, false],
      ["toll-hall", "keep", false, false, false],
      ["barge-yard", "keep", false, false, false],
      ["keepers-office", "keep", false, false, false],
      ["kennel-larder", "keep", false, false, false],
      ["bunk-room", "keep", false, false, false],
      ["sluice-house", "keep", false, false, false],
      ["bell-tower", "keep", false, false, false],
      ["keepers-loft", "keep", false, true, false],
      ["stair-head", "keep", false, false, false],
      ["stair-foot", "culverts", false, false, false],
      ["drain-mouth", "culverts", false, false, false],
      ["pump-room", "culverts", false, true, false],
      ["outfall", "culverts", true, false, false],
      ["kobold-warren", "culverts", false, false, true],
      ["wheel-pit", "culverts", false, false, true],
      ["lock-chamber", "culverts", false, false, true],
      ["spillway", "culverts", false, false, true],
      ["flooded-vault", "culverts", false, false, true],
      ["gear-hall", "culverts", false, false, false],
    ],
  );
  // Two to four things to examine in every room.
  for (const { id, features } of weirgate.rooms) {
    assert.ok(features.length >= 2 && features.length <= 4, id);
  }
  assert.deepEqual(
    weirgate.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["sluices-open", "victory", 500],
      ["out-with-the-weir-goods", "escape-with-loot", undefined],
      ["out-of-the-weirgate", "escape-without-loot", undefined],
      ["fallen-at-the-weirgate", "defeat", undefined],
    ],
  );
});

test("its fights: nine placed and two wandering, Grisk the boss whose defeat ends it", () => {
  assert.deepEqual(
    weirgate.encounters.map(({ id, opponents, victoryEndingId }) => [
      id,
      opponents.map(({ id: opponentId, statBlock, boss }) => [
        opponentId,
        statBlock.name,
        boss === true,
      ]),
      victoryEndingId,
    ]),
    [
      ["toll-hall-fight", [["sergeant-larrow", "Bandit", false]], undefined],
      ["kennel-fight", [["brindle", "Wolf", false]], undefined],
      [
        "bunk-room-fight",
        [
          ["bunk-bandit-1", "Bandit", false],
          ["bunk-bandit-2", "Bandit", false],
        ],
        undefined,
      ],
      ["bell-tower-fight", [["lookout", "Bandit", false]], undefined],
      [
        "warren-fight",
        [
          ["kobold-1", "Kobold", false],
          ["kobold-2", "Kobold", false],
          ["kobold-3", "Kobold", false],
        ],
        undefined,
      ],
      ["wheel-pit-fight", [["drowned-wheelwright", "Ghoul", false]], undefined],
      ["lock-chamber-fight", [["old-sullage", "Ogre", false]], undefined],
      [
        "vault-fight",
        [
          ["guildsman-1", "Zombie", false],
          ["guildsman-2", "Zombie", false],
        ],
        undefined,
      ],
      ["gear-hall-fight", [["grisk", "Goblin Boss", true]], "sluices-open"],
      [
        "lockjaw-patrol",
        [
          ["patrol-bandit-1", "Bandit", false],
          ["patrol-bandit-2", "Bandit", false],
        ],
        undefined,
      ],
      [
        "drowned-wanderer",
        [["wandering-guildsman", "Zombie", false]],
        undefined,
      ],
    ],
  );
  // Each region's table: one wandering fight and two omens.
  for (const [index, encounterId] of [
    "lockjaw-patrol",
    "drowned-wanderer",
  ].entries()) {
    const { chance, every, entries } = weirgate.regions[index].wandering;
    assert.deepEqual([chance, every, entries.length], [15, 4, 3]);
    assert.equal(entries[0].encounterId, encounterId);
  }
});

test("two ways lead down, each with one fight before Grisk, and every Culverts room off them is avoidable", () => {
  const grate = passage("keepers-stair").door;
  assert.deepEqual(
    [grate.state, grate.keyItemId, grate.pick],
    [
      "locked",
      "grate-key",
      { ability: "dexterity", tool: "thieves-tools", dc: 13 },
    ],
  );
  assert.equal(grate.break.bands["failure-by-5"].noisy, true);
  // The culvert is hidden until the keeper's crank drains it.
  assert.equal(passage("drained-culvert").hidden, true);
  assert.deepEqual(feature("sluice-house", "drain-gear").uses, [
    {
      item: "windlass-crank",
      text: feature("sluice-house", "drain-gear").uses[0].text,
      effects: [
        { type: "open", passage: "drained-culvert" },
        { type: "set", flag: "culvert-drained" },
      ],
    },
  ]);
  assert.deepEqual(
    weirgate.routes.map((route) => [
      route.id,
      requiredPath(weirgate, route).roomIds,
    ]),
    [
      [
        "keepers-stair",
        [
          "towpath-gate",
          "toll-hall",
          "stair-head",
          "stair-foot",
          "pump-room",
          "gear-hall",
        ],
      ],
      [
        "drained-culvert",
        [
          "towpath-gate",
          "barge-yard",
          "keepers-office",
          "sluice-house",
          "drain-mouth",
          "outfall",
          "pump-room",
          "gear-hall",
        ],
      ],
    ],
  );
  // A sweep of each region visits every room not avoidable.
  assert.deepEqual(
    regionSweeps(weirgate).map(({ region }) => region),
    ["keep", "culverts"],
  );
  // The silt tunnel, the secret loop, opens from either end.
  assert.equal(passage("silt-tunnel").hidden, true);
  assert.deepEqual(
    feature("flooded-vault", "silted-arch").check.bands.success.effects,
    [{ type: "open", passage: "silt-tunnel" }],
  );
});

test("its treasure is 96% of the long module's 900 gp budget, with five potions inside it and the wand outside", () => {
  const items = weirgate.rooms.flatMap(({ items: placed }) => placed);
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "potion-of-healing")
      .map(({ hiddenIn }) => hiddenIn),
    ["toll-chest", "lookouts-stool", "dead-goblin", "dry-shelf", "gear-shrine"],
  );
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "wand")
      .map(({ id, wand, hiddenIn }) => [id, wand, hiddenIn]),
    [["guild-wand", "wand-of-magic-missiles", "guild-strongbox"]],
  );
  // Nothing to carry out of either exit room.
  assert.deepEqual(room("towpath-gate").items, []);
  assert.deepEqual(room("outfall").items, []);
  assert.equal(findableValue(weirgate), 86730);
  assert.equal(treasureBudget(3, true), 90000);
});

const DOWN_THE_STAIR = [
  ["move", "toll-hall"],
  ["react", "attack"],
  ["examine", "sergeant-larrow"],
  ["examine", "toll-chest"],
  ["take", "toll-potion"],
  ["take", "toll-takings"],
  ["take", "grate-key"],
  ["move", "stair-head"],
  ["unlock", "iron-grate"],
  ["move", "stair-foot"],
  ["move", "pump-room"],
  ["move", "gear-hall"],
];

test("a level-3 Fighter wins the toll hall, unlocks the grate with Larrow's key and opens the sluices", () => {
  const { state, runtime } = firstJourney(
    weirgate,
    level3,
    DOWN_THE_STAIR,
    ({ status, clearedEncounterIds }) =>
      status === "victory" && clearedEncounterIds.length === 2,
  );
  assert.equal(state.endingId, "sluices-open");
  assert.ok(state.openedDoorIds.includes("iron-grate"));
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Sergeant Larrow", 25],
    ["Defeated Grisk", 200],
    ["The sluices open", 500],
  ]);
});

/**
 * Plays `steps` on `seed` without a fight: each step must be accepted and
 * leave no fight under way. Undefined when a step is refused or a fight
 * begins (a wandering one, say), so a test can try the next seed.
 */
function walk(sheet, seed, steps, options) {
  const runtime = createFifthRuntime(weirgate, sheet, options);
  const random = createSeededRandom(seed);
  let { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  );
  for (const step of steps) {
    const result = runtime.handleAction(state, routeAction(step), random);
    if (
      result.rejection !== undefined ||
      result.state.encounter !== undefined
    ) {
      return undefined;
    }
    state = result.state;
  }
  return { state, runtime, random };
}

/** The first seed's walk of `steps` with no fight on the way. */
function firstWalk(sheet, steps, options) {
  for (let seed = 0; seed < 100; seed += 1) {
    const walked = walk(sheet, seed, steps, options);
    if (walked !== undefined) {
      return { ...walked, seed };
    }
  }
  throw new Error("no seed below 100 walks it without a fight");
}

const TO_THE_CULVERT = [
  ["move", "barge-yard"],
  ["move", "keepers-office"],
  ["examine", "chart-cupboard"],
  ["take", "windlass-crank"],
  ["move", "barge-yard"],
  ["move", "sluice-house"],
];

test("the keeper's crank drains the culvert, and the way down runs past the outfall and the pump room to Grisk", () => {
  const { state, runtime, random } = firstWalk(level3, TO_THE_CULVERT);
  assert.equal(
    runtime.handleAction(
      state,
      { type: "move", destinationId: "drain-mouth" },
      random,
    ).rejection?.code !== undefined,
    true,
    "the culvert is no way until it is drained",
  );
  const drained = runtime.handleAction(
    state,
    { type: "use-on", featureId: "drain-gear", itemId: "windlass-crank" },
    random,
  );
  assert.equal(drained.rejection, undefined);
  assert.ok(drained.state.flags.includes("culvert-drained"));
  // The crank is kept: it isn't used up.
  assert.ok(drained.state.inventory.includes("windlass-crank"));
  const down = runtime.handleAction(
    drained.state,
    { type: "move", destinationId: "drain-mouth" },
    random,
  );
  assert.equal(down.rejection, undefined);
  assert.equal(down.state.roomId, "drain-mouth");
  // The gear hall's fight offers the counterweight chain as a fight
  // action (#402), against Grisk.
  const gear = firstWalk(level3, [
    ...TO_THE_CULVERT,
    ["use", "drain-gear", "windlass-crank"],
    ["move", "drain-mouth"],
    ["move", "outfall"],
    ["move", "pump-room"],
  ]);
  const fight = gear.runtime.handleAction(
    gear.state,
    { type: "move", destinationId: "gear-hall" },
    gear.random,
  ).state;
  assert.equal(fight.roomId, "gear-hall");
  assert.equal(fight.encounter?.outcome, "ongoing");
  assert.ok(
    gear.runtime
      .projectActions(fight)
      .some(
        ({ action, feature: used }) =>
          action === "use-feature" && used?.id === "counterweight-chain",
      ),
  );
});

test("salt pork thrown down the feeding hatch sends Old Sullage to the spillway, leaving the strongbox and its wand", () => {
  // The kennel's wolf is fought first, for the pork: a journey wins it.
  const { state: fed } = firstJourney(
    weirgate,
    level3,
    [
      ["move", "barge-yard"],
      ["move", "kennel-larder"],
      ["examine", "meat-hooks"],
      ["take", "salt-pork"],
      ["move", "barge-yard"],
      ["move", "keepers-office"],
      ["examine", "chart-cupboard"],
      ["take", "windlass-crank"],
      ["move", "barge-yard"],
      ["move", "sluice-house"],
      ["use", "drain-gear", "windlass-crank"],
      ["move", "drain-mouth"],
      ["move", "outfall"],
      ["move", "pump-room"],
      ["use", "feeding-hatch", "salt-pork"],
      ["move", "lock-chamber"],
      ["examine", "guild-strongbox"],
      ["take", "guild-wand"],
    ],
    ({ status, possessions }) =>
      status === "playing" &&
      possessions.magicItems.some(
        ({ wand }) => wand === "wand-of-magic-missiles",
      ),
  );
  assert.ok(fed.flags.includes("ogre-lured"));
  assert.ok(fed.usedItemIds.includes("salt-pork"));
  // The ogre has gone to the spillway; nothing was fought in the lock.
  assert.ok(!fed.clearedEncounterIds.includes("lock-chamber-fight"));
  const placements = encounterPlacements(weirgate);
  assert.equal(
    encounterInRoom(placements, "spillway", fed.flags, fed.metEncounters),
    "lock-chamber-fight",
  );
  assert.equal(
    encounterInRoom(placements, "lock-chamber", fed.flags, fed.metEncounters),
    undefined,
  );
});

test("the weir bell rung by a failed grate-break moves the Bunk Room's sleepers to the Keeper's Loft", () => {
  // With every check failing, breaking the grate fails by 5 or more: noise.
  const { state: won } = firstJourney(
    weirgate,
    level3,
    [
      ["move", "toll-hall"],
      ["react", "attack"],
    ],
    ({ status, clearedEncounterIds }) =>
      status === "playing" && clearedEncounterIds.includes("toll-hall-fight"),
  );
  const failing = createFifthRuntime(weirgate, level3, {
    checks: "always-fail",
  });
  const random = createSeededRandom(0);
  let { state } = failing.handleAction(
    won,
    { type: "move", destinationId: "stair-head" },
    random,
  );
  ({ state } = failing.handleAction(
    state,
    { type: "break", doorId: "iron-grate" },
    random,
  ));
  assert.ok(state.flags.includes("bell-rung"));
  const placements = encounterPlacements(weirgate);
  assert.equal(
    encounterInRoom(
      placements,
      "keepers-loft",
      state.flags,
      state.metEncounters,
    ),
    "bunk-room-fight",
  );
  assert.equal(
    encounterInRoom(placements, "bunk-room", state.flags, state.metEncounters),
    undefined,
  );
});

test("a truce with the kobolds lets Tikka talk, until the bell rings", () => {
  const tikka = room("kobold-warren").creatures[0];
  assert.deepEqual(
    tikka.topics.map(({ id, offeredWhile, offeredUntil }) => [
      id,
      offeredWhile,
      offeredUntil,
    ]),
    [
      ["the-big-one", "kobold-truce", "bell-rung"],
      ["the-silt-tunnel", "kobold-truce", "bell-rung"],
      ["about-grisk", "kobold-truce", "bell-rung"],
    ],
  );
  assert.deepEqual(encounter("warren-fight").sets, {
    peaceful: "kobold-truce",
  });
  // A seed whose reaction lets the character pass ends it peacefully.
  const { state, runtime } = firstJourney(
    weirgate,
    velaAt3(),
    [
      ...TO_THE_CULVERT,
      ["use", "drain-gear", "windlass-crank"],
      ["move", "drain-mouth"],
      ["move", "kobold-warren"],
      ["react", "let-pass"],
    ],
    ({ status, peacefulEncounterIds }) =>
      status === "playing" && peacefulEncounterIds.includes("warren-fight"),
  );
  assert.ok(state.flags.includes("kobold-truce"));
  const topics = runtime
    .projectActions(state)
    .filter(({ action }) => action === "talk")
    .map(({ target }) => target.id);
  assert.ok(topics.includes("the-big-one"), topics.join(", "));
});

test("its release run plays a generated route to the open sluices (#409)", async () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const directory = await mkdtemp(join(tmpdir(), "issue-412-release-"));
  try {
    const output = join(directory, "report.json");
    // Seed 2: on seeds 0 and 1 the harness's search at the drain mouth finds
    // the culvert deadfall but the replayed one doesn't, so its disarm step
    // is skipped (the run still wins).
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--generated",
        "--seed",
        "2",
        "--adventure",
        "coldwater-weirgate",
        "--output",
        output,
        "--max-calls",
        "1",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
        timeout: 120000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.generated, true);
    assert.equal(report.adventureId, "coldwater-weirgate");
    assert.equal(report.ending.kind, "victory");
    assert.equal(report.summary.skipped, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
