// #440: The Bramblecote Cider House, the four-module set's level-1 module, as
// the owner approved it on #439 with the three changes approved on #440: a
// long level-1 Medium module of seventeen rooms in two regions, the Yard
// above and the Vaults below. Two ways lead down, the press-house trapdoor
// past Nib and the old well past Brack, whose climb opens the way in every
// band; Wick surrenders in the avoidable Hayloft and gives the strongroom
// key; the goblin tally in the cider press gives advantage on finding the
// goblins' cut in the cask gallery; leaving with loot pays 300 XP. Journeys
// reach its endings by both ways; shipped-modules.test.mjs checks it
// qualifies at its declared difficulty, with its quoted figures.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { regionSweeps, requiredPath } from "../dist/balance-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { firstJourney, routeAction, xpOf } from "./fixtures/module-journey.mjs";

const cider = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "bramblecote-cider-house",
);
const room = (id) => cider.rooms.find((entry) => entry.id === id);
const passage = (id) => cider.passages.find((entry) => entry.id === id);
const feature = (roomId, id) =>
  room(roomId).features.find((entry) => entry.id === id);
const level1 = testFighterAt(1);

test("the cider house is a long level-1 Medium module of seventeen rooms in two regions, left by the lane gate or the river door", () => {
  assert.equal(cider.title, "The Bramblecote Cider House");
  assert.deepEqual(cider.recommendedLevels, { min: 1, max: 1 });
  assert.equal(cider.difficulty, "medium");
  assert.equal(cider.long, true);
  assert.equal(cider.startRoomId, "lane-gate");
  assert.deepEqual(
    cider.regions.map(({ id, name }) => [id, name]),
    [
      ["yard", "The Yard"],
      ["vaults", "The Vaults"],
    ],
  );
  assert.deepEqual(
    cider.rooms.map(({ id, region, exit, restSite, avoidable }) => [
      id,
      region,
      exit === true,
      restSite === true,
      avoidable === true,
    ]),
    [
      ["lane-gate", "yard", true, false, false],
      ["dog-yard", "yard", false, false, false],
      ["kitchen", "yard", false, false, false],
      ["parlour", "yard", false, true, false],
      ["coopers-shed", "yard", false, false, false],
      ["press-house", "yard", false, false, false],
      ["hayloft", "yard", false, false, true],
      ["well-yard", "yard", false, false, false],
      // Avoidable since #440: with Dace in the Yard's sweep the weakest
      // level-1 Rogue survived it 72.0%.
      ["cart-shed", "yard", false, false, true],
      ["cellar-stair", "vaults", false, false, false],
      ["cask-gallery", "vaults", false, false, false],
      ["well-bottom", "vaults", false, false, false],
      ["pell-strongroom", "vaults", false, false, false],
      ["bottling-room", "vaults", false, true, false],
      ["cider-store", "vaults", false, false, false],
      ["flooded-sump", "vaults", false, false, true],
      ["river-door", "vaults", true, false, false],
    ],
  );
  for (const { id, features } of cider.rooms) {
    assert.ok(features.length >= 2 && features.length <= 4, id);
  }
  assert.deepEqual(
    cider.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-pells-goods", "escape-with-loot", 300],
      ["out-of-bramblecote", "escape-without-loot", undefined],
      ["fallen-at-bramblecote", "defeat", undefined],
    ],
  );
  // No merchant, no wandering monsters, no flags (#439).
  assert.ok(
    cider.rooms.every(({ creatures }) =>
      creatures.every(({ merchant }) => merchant === undefined),
    ),
  );
  assert.equal(cider.wanderingEncounter, undefined);
  assert.ok(cider.regions.every(({ wandering }) => wandering === undefined));
  assert.equal(cider.flags, undefined);
});

test("its fights: six single foes or pairs, none a boss, and Wick can surrender with the strongroom key", () => {
  assert.deepEqual(
    cider.encounters.map(({ id, opponents, victoryEndingId }) => [
      id,
      opponents.map(({ id: opponentId, statBlock, boss }) => [
        opponentId,
        statBlock.name,
        boss === true,
      ]),
      victoryEndingId,
    ]),
    [
      ["dog-yard-fight", [["brack", "Mastiff", false]], undefined],
      ["press-house-fight", [["nib", "Goblin Minion", false]], undefined],
      [
        "hayloft-fight",
        [
          ["snagtooth", "Goblin Warrior", false],
          ["wick", "Goblin Minion", false],
        ],
        undefined,
      ],
      ["cart-shed-fight", [["dace", "Bandit", false]], undefined],
      ["cider-store-fight", [["corran-vey", "Bandit", false]], undefined],
      ["sump-fight", [["drowned-sump-walker", "Zombie", false]], undefined],
    ],
  );
  const wick = cider.encounters
    .find(({ id }) => id === "hayloft-fight")
    .opponents.find(({ id }) => id === "wick");
  assert.equal(wick.surrender.xp, 25);
  assert.deepEqual(
    wick.surrender.topics.map(({ id, gives }) => [id, gives]),
    [
      ["the-key", ["strongroom-key"]],
      ["about-snagtooth", undefined],
      ["the-river-man", undefined],
      ["the-water", undefined],
    ],
  );
  assert.equal(
    room("hayloft").items.find(({ id }) => id === "strongroom-key").hiddenIn,
    "wick",
  );
  // Dace carries nothing (#440): his coin made the shed by the gate the
  // gate's nearest loot.
  assert.deepEqual(room("cart-shed").items, []);
});

test("two ways lead down, the trapdoor past Nib and the well past Brack, each one fight to the cask gallery", () => {
  // The trapdoor's way ends at the goblins' cut in the cask gallery, the
  // nearest loot once down; a run whose search fails goes on for other loot.
  assert.deepEqual(
    cider.routes.map((route) => [route.id, requiredPath(cider, route).roomIds]),
    [
      [
        "press-house",
        [
          "lane-gate",
          "kitchen",
          "press-house",
          "cellar-stair",
          "cask-gallery",
          "river-door",
        ],
      ],
      [
        "old-well",
        [
          "lane-gate",
          "dog-yard",
          "well-yard",
          "well-bottom",
          "cask-gallery",
          "river-door",
        ],
      ],
    ],
  );
  assert.deepEqual(
    regionSweeps(cider).map(({ region, rooms }) => [region, rooms]),
    [
      [
        "yard",
        [
          "lane-gate",
          "dog-yard",
          "kitchen",
          "parlour",
          "coopers-shed",
          "press-house",
          "well-yard",
        ],
      ],
      [
        "vaults",
        [
          "cellar-stair",
          "cask-gallery",
          "well-bottom",
          "pell-strongroom",
          "bottling-room",
          "cider-store",
          "river-door",
        ],
      ],
    ],
  );
  // The well opens in every band, at advantage with the rope (#282, #284).
  assert.equal(passage("well-shaft").hidden, true);
  const { check } = feature("well-yard", "well-head");
  for (const band of ["failure-by-5", "failure", "success", "success-by-5"]) {
    assert.ok(
      check.bands[band].effects.some(
        ({ type, passage: opened }) =>
          type === "open" && opened === "well-shaft",
      ),
      band,
    );
  }
  assert.deepEqual(
    check.approaches.map(({ skill, dc, advantage }) => [
      skill,
      dc,
      advantage.map(({ item }) => item),
    ]),
    [
      ["athletics", 12, ["coil-of-rope"]],
      ["acrobatics", 13, ["coil-of-rope"]],
    ],
  );
  // The strongroom door: key, pick or break, and the break hurts no one
  // (#440).
  const { door } = passage("gallery-to-strongroom");
  assert.deepEqual(
    [door.state, door.keyItemId, door.pick, door.break.skill, door.break.dc],
    [
      "locked",
      "strongroom-key",
      { ability: "dexterity", tool: "thieves-tools", dc: 13 },
      "athletics",
      14,
    ],
  );
  assert.equal(door.break.bands["failure-by-5"].effects, undefined);
});

test("its treasure is 99.6% of the long level-1 budget, and nothing to carry out is reachable without a fight", () => {
  const items = cider.rooms.flatMap(({ items: placed }) => placed);
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "potion-of-healing")
      .map(({ hiddenIn }) => hiddenIn),
    ["pantry", "corking-bench"],
  );
  assert.deepEqual(
    items
      .filter(({ kind }) => kind === "treasure")
      .map(({ id, treasure }) => [id, treasure]),
    [
      ["sack-bloodstone", "gem-50gp"],
      ["christening-cup", "art-25gp"],
      ["banded-agate", "gem-10gp"],
      ["smugglers-carnelian", "gem-50gp"],
    ],
  );
  assert.equal(findableValue(cider), 29884);
  assert.equal(treasureBudget(1, true), 30000);
  // The rooms reachable from the gate without entering a fight hold no
  // treasure or coin, so a cautious run can't take loot and leave unfought.
  const fightless = new Set();
  const frontier = [cider.startRoomId];
  while (frontier.length > 0) {
    const id = frontier.pop();
    if (fightless.has(id) || room(id).encounterId !== undefined) {
      continue;
    }
    fightless.add(id);
    for (const { between, hidden, door } of cider.passages) {
      if (between.includes(id) && hidden !== true && door === undefined) {
        frontier.push(between.find((other) => other !== id));
      }
    }
  }
  assert.deepEqual([...fightless].sort(), ["kitchen", "lane-gate", "parlour"]);
  for (const id of fightless) {
    assert.ok(
      room(id).items.every(
        ({ kind }) => kind !== "treasure" && kind !== "coin",
      ),
      id,
    );
  }
});

const PRESS_HOUSE = [
  ["move", "kitchen"],
  ["examine", "pantry"],
  ["take", "pantry-potion"],
  ["move", "press-house"],
  ["examine", "pomace-heap"],
  ["take", "nibs-hoard"],
  ["move", "cellar-stair"],
  ["move", "cask-gallery"],
  ["move", "river-door"],
  ["leave", "river-door"],
];

test("a level-1 Fighter beats Nib, takes his hoard down the trapdoor and leaves by the river door with 300 XP", () => {
  const { state, runtime } = firstJourney(
    cider,
    level1,
    PRESS_HOUSE,
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-pells-goods");
  assert.deepEqual(state.clearedEncounterIds, ["press-house-fight"]);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Nib", 25],
    ["Out with the Pells' goods", 300],
  ]);
});

const pressed =
  (band) =>
  ({ checks }) =>
    checks.some(
      ({ id, band: made }) => id === "examine:cider-press" && made === band,
    );

test("the goblin tally from the cider press gives advantage on finding the goblins' cut in the great casks", () => {
  const { check } = feature("cask-gallery", "great-casks");
  assert.deepEqual(
    check.approaches.map(({ skill, dc, advantage }) => [
      skill,
      dc,
      advantage.map(({ type, feature: found, name }) => [type, found, name]),
    ]),
    [
      ["investigation", 15, [["discovered", "cider-press", "Goblin tally"]]],
      ["perception", 16, [["discovered", "cider-press", "Goblin tally"]]],
    ],
  );
  assert.deepEqual(
    room("cask-gallery").items.map(({ id, kind, coins, hiddenIn }) => [
      id,
      kind,
      coins,
      hiddenIn,
    ]),
    [["goblins-cut", "coin", { sp: 44 }, "great-casks"]],
  );
  const toGallery = (band) =>
    firstJourney(
      cider,
      level1,
      [
        ["move", "kitchen"],
        ["move", "press-house"],
        ["examine", "cider-press", "investigation"],
        ["move", "cellar-stair"],
        ["move", "cask-gallery"],
      ],
      (state) => state.roomId === "cask-gallery" && pressed(band)(state),
    );
  const search = ({ state, runtime }) =>
    runtime
      .handleAction(
        state,
        routeAction(["examine", "great-casks", "investigation"]),
        createSeededRandom(0),
      )
      .events.find(({ type }) => type === "check").roll.mode;
  assert.deepEqual(search(toGallery("success")).advantage, ["Goblin tally"]);
  // Without the tally the search is a plain roll.
  assert.equal(search(toGallery("failure")), undefined);
});

test("found by its tally, the goblins' cut comes out by the river door", () => {
  const { state } = firstJourney(
    cider,
    level1,
    [
      ["move", "kitchen"],
      ["move", "press-house"],
      ["examine", "pomace-heap"],
      ["take", "nibs-hoard"],
      ["examine", "cider-press", "investigation"],
      ["move", "cellar-stair"],
      ["move", "cask-gallery"],
      ["examine", "great-casks", "investigation"],
      ["take", "goblins-cut"],
      ["move", "river-door"],
      ["leave", "river-door"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-pells-goods");
});

test("down the old well with the cooper's rope: past Brack, the climb opens the shaft, and the wishing coins come out", () => {
  const { state } = firstJourney(
    cider,
    level1,
    [
      ["move", "dog-yard"],
      ["move", "coopers-shed"],
      ["examine", "tool-rack"],
      ["take", "coil-of-rope"],
      ["move", "dog-yard"],
      ["move", "well-yard"],
      ["examine", "well-head", "athletics"],
      ["move", "well-bottom"],
      ["examine", "silted-floor"],
      ["take", "wishing-coins"],
      ["move", "cask-gallery"],
      ["move", "river-door"],
      ["leave", "river-door"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-pells-goods");
  assert.deepEqual(state.clearedEncounterIds, ["dog-yard-fight"]);
});

test("a failed climb by 5 or more still opens the well, for 1d4 bludgeoning", () => {
  const { state: won } = firstJourney(
    cider,
    level1,
    [["move", "dog-yard"]],
    ({ status, clearedEncounterIds }) =>
      status === "playing" && clearedEncounterIds.includes("dog-yard-fight"),
  );
  const failing = createFifthRuntime(cider, level1, { checks: "always-fail" });
  const random = createSeededRandom(0);
  let { state } = failing.handleAction(
    won,
    { type: "move", destinationId: "well-yard" },
    random,
  );
  const before = state.character.hp;
  ({ state } = failing.handleAction(
    state,
    routeAction(["examine", "well-head", "athletics"]),
    random,
  ));
  const lost = before - state.character.hp;
  assert.ok(lost >= 1 && lost <= 4, `lost ${lost}`);
  const down = failing.handleAction(
    state,
    { type: "move", destinationId: "well-bottom" },
    random,
  );
  assert.equal(down.rejection, undefined);
  assert.equal(down.state.roomId, "well-bottom");
});

test("Wick surrenders when Snagtooth falls and hands over the key, which opens the Pells' strongroom", () => {
  const { state, runtime } = firstJourney(
    cider,
    level1,
    [
      ["move", "kitchen"],
      ["move", "press-house"],
      ["move", "hayloft"],
      ["talk", "the-key"],
      ["take", "strongroom-key"],
      ["move", "press-house"],
      ["move", "cellar-stair"],
      ["move", "cask-gallery"],
      ["unlock", "strongroom-door"],
      ["move", "pell-strongroom"],
      ["examine", "iron-chest"],
      ["take", "christening-cup"],
      ["take", "pell-savings"],
      ["move", "cask-gallery"],
      ["move", "river-door"],
      ["leave", "river-door"],
    ],
    ({ status, surrenderedOpponents }) =>
      status === "escaped" &&
      surrenderedOpponents.some(({ opponentId }) => opponentId === "wick"),
    { limit: 200 },
  );
  assert.equal(state.endingId, "out-with-the-pells-goods");
  assert.ok(state.openedDoorIds.includes("strongroom-door"));
  assert.ok(state.inventory.includes("christening-cup"));
  assert.ok(
    xpOf(runtime, state).some(([name]) => /Wick/u.test(name)),
    JSON.stringify(xpOf(runtime, state)),
  );
});

test("its release run plays a generated route out with the Pells' goods (#409, #440)", async () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const directory = await mkdtemp(join(tmpdir(), "issue-440-release-"));
  try {
    const output = join(directory, "report.json");
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--generated",
        "--seed",
        "0",
        "--adventure",
        "bramblecote-cider-house",
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
    assert.equal(report.adventureId, "bramblecote-cider-house");
    assert.equal(report.ending.kind, "escape-with-loot");
    assert.equal(report.summary.skipped, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
