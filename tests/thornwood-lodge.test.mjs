// #291: The Thornwood Lodge, the level 4–5 Hard module, as the owner
// approved it: a charcoal-burner who trades at the forest gate, Captain
// Hesk's hound and mastiffs in the kennel yard, a bear in the hall, an
// owlbear in the ice house and the captain himself in the solar, with graded
// checks that open the ways in and reveal what the trophy wall hides.
// Journeys reach its endings and its checks; shipped-modules.test.mjs checks
// it qualifies at its declared difficulty.
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
import { gateModule, requiredPath } from "../dist/balance-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { startSavedAdventureOverHttp } from "../dist/dm-evaluation-5e.js";
import { LODGE_ROUTE, playReleaseRun } from "../dist/release-run-5e.js";
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
/** The items in a room, with what each is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, hiddenIn }) => [id, kind, hiddenIn]);

test("the lodge is a six-room level 4–5 Hard module, entered and left by the forest gate", () => {
  assert.equal(lodge.title, "The Thornwood Lodge");
  assert.deepEqual(lodge.recommendedLevels, { min: 4, max: 5 });
  assert.equal(lodge.difficulty, "hard");
  assert.equal(lodge.startRoomId, "forest-gate");
  assert.deepEqual(
    lodge.rooms.map(({ id }) => id),
    [
      "forest-gate",
      "poachers-hide",
      "kennel-yard",
      "lodge-hall",
      "ice-house",
      "captains-solar",
    ],
  );
  assert.deepEqual(
    lodge.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["forest-gate"],
  );
  assert.deepEqual(
    lodge.passages.map(({ id, between, hidden, trap }) => [
      id,
      between,
      hidden === true,
      trap?.id,
    ]),
    [
      ["gate-to-yard", ["forest-gate", "kennel-yard"], false, undefined],
      ["gate-to-hide", ["forest-gate", "poachers-hide"], true, undefined],
      ["yard-to-hall", ["kennel-yard", "lodge-hall"], false, undefined],
      ["hall-to-ice-house", ["lodge-hall", "ice-house"], true, undefined],
      [
        "hall-to-solar",
        ["lodge-hall", "captains-solar"],
        false,
        "gallery-man-trap",
      ],
    ],
  );
  assert.deepEqual(
    lodge.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-spoils", "escape-with-loot", 2350],
      ["out-empty-handed", "escape-without-loot", undefined],
      ["fallen-in-the-thornwood", "defeat", undefined],
    ],
  );
});

test("its fights are the hound and a mastiff, a brown bear, an owlbear and Captain Hesk, its one boss", () => {
  assert.deepEqual(
    lodge.encounters.map(({ id, opponents, victoryEndingId }) => [
      id,
      lodge.rooms.find(({ encounterId }) => encounterId === id).id,
      victoryEndingId,
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
        undefined,
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
    ],
  );
});

test("Brann the Charcoal-burner trades shield, chain mail, longsword and greatsword at the gate", () => {
  const [brann] = room("forest-gate").creatures;
  assert.equal(brann.name, "Brann the Charcoal-burner");
  assert.deepEqual(brann.merchant, {
    stock: ["shield", "chain-mail", "longsword", "greatsword"],
    minutes: 10,
  });
  assert.deepEqual(
    brann.topics.map(({ id, check }) => [id, check !== undefined]),
    [
      ["the-lodge", false],
      ["the-poachers-path", true],
    ],
  );
});

test("only a potion and a lantern lie at the gate: the first loot is behind the kennel fight", () => {
  assert.deepEqual(itemsIn("forest-gate"), [
    ["woodpile-potion", "potion-of-healing", "woodpile"],
    ["hooded-lantern", "tool", "woodpile"],
  ]);
  assert.deepEqual(requiredPath(lodge).roomIds, ["forest-gate", "kennel-yard"]);
  assert.deepEqual(itemsIn("poachers-hide"), [
    ["hide-potion", "potion-of-healing", "poachers-cache"],
    ["trap-tongs", "tool", "poachers-cache"],
  ]);
  assert.deepEqual(itemsIn("kennel-yard"), [
    ["hunting-cup", "treasure", "hounds-kennel"],
    ["kennel-gold", "coin", "hounds-kennel"],
  ]);
  assert.deepEqual(itemsIn("lodge-hall"), [
    ["trophy-topaz", "treasure", "trophy-wall"],
    ["trophy-potion", "potion-of-healing", "trophy-wall"],
  ]);
  assert.deepEqual(itemsIn("ice-house"), [
    ["nest-potion", "potion-of-healing", "owlbear-nest"],
    ["nest-jade", "treasure", "owlbear-nest"],
  ]);
  assert.deepEqual(itemsIn("captains-solar"), [
    ["hunting-horn", "treasure", "hesk-strongbox"],
    ["hesk-gold", "coin", "hesk-strongbox"],
    ["captain-hesk-coins", "coin", "captain-hesk"],
  ]);
});

const ROLLED_HESK_COINS = { gp: 8 };

test("its treasure is 99% of the level-5 budget, the captain's gold rolled from its treasure type", () => {
  // Rolled with `npm run loot -- adventures/5e/thornwood-lodge.json --seed 291`.
  const coins = room("captains-solar").items.find(
    ({ id }) => id === "captain-hesk-coins",
  );
  assert.deepEqual(coins.coins, ROLLED_HESK_COINS);
  assert.equal(findableValue(lodge), 73500 + ROLLED_HESK_COINS.gp * 100);
  assert.equal(treasureBudget(5), 75000);
});

test("the gate qualifies it as Hard for both classes on seeded and always-failing checks (#310)", () => {
  const gate = gateModule(lodge);
  assert.equal(gate.qualified, true);
  const [fighter, rogue] = gate.classes.map(({ result }) => result.verdict);
  // The Fighter is 8.5 points over the 88% that would make it Medium (4
  // until the Champion's initiative advantage, #315); the Rogue, 10.5 over
  // Hard's 75% and 2.5 under 88%, keeps it Hard.
  for (const [verdict, kit, rate] of [
    [fighter, "mace", 0.965],
    [rogue, "shortsword", 0.855],
  ]) {
    assert.deepEqual(
      [verdict.survival.level, verdict.survival.kit, verdict.survival.rate],
      [4, kit, rate],
    );
    assert.deepEqual(
      [verdict.alwaysFail.level, verdict.alwaysFail.rate],
      [4, rate],
    );
    // One of four ordinary enemies, under the more-than-half that fails it.
    assert.deepEqual(
      verdict.oneHitKill.overCap.map(({ name }) => name),
      ["Kennel Mastiff"],
    );
    // Every fight's XP and the spoils' 2,350.
    assert.equal(verdict.xp.available, 200 + 25 + 200 + 700 + 700 + 2350);
  }
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
  assert.deepEqual(exits(begun), ["kennel-yard"]);
  // 15 − 1 = 14 meets DC 14.
  const talked = accepted(
    begun,
    { ...POACHERS, approach: "persuasion" },
    dice([20, 15]),
  );
  assert.deepEqual(exits(talked), ["kennel-yard", "poachers-hide"]);
});

test("failing to frighten Brann leaves the path hidden, and he won't be asked again", () => {
  // 10 − 1 = 9 misses DC 16.
  const talked = accepted(
    begun,
    { ...POACHERS, approach: "intimidation" },
    dice([20, 10]),
  );
  assert.deepEqual(exits(talked), ["kennel-yard"]);
  const again = runtime.handleAction(
    talked,
    { ...POACHERS, approach: "persuasion" },
    dice(),
  );
  assert.equal(again.rejection?.code, "already-asked");
});

/**
 * A level-5 Fighter who has won the kennel yard and the hall on a seed and
 * stands in the hall, with what `route` took.
 */
const inHall = (route = []) =>
  firstJourney(
    lodge,
    level5,
    [...route, ["move", "kennel-yard"], ["move", "lodge-hall"]],
    ({ status, roomId, encounter }) =>
      status === "playing" &&
      roomId === "lodge-hall" &&
      encounter?.outcome !== "ongoing",
  ).state;
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

const HATCH = { type: "examine", targetId: "ice-house-hatch" };

test("finding the hatch's release with Perception opens the way to the ice house", () => {
  assert.deepEqual(exits(hall), ["kennel-yard", "captains-solar"]);
  // 11 + 3 = 14 meets DC 14.
  const opened = accepted(
    hall,
    { ...HATCH, approach: "perception" },
    dice([20, 11]),
  );
  assert.deepEqual(exits(opened), [
    "kennel-yard",
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
const level4 = testFighterAt(4);

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
  // 2,562 XP, the mastiff fleeing for half its XP (the hound fled instead
  // until the Champion's initiative advantage, #315, moved the dice): what
  // takes a career that ends the earlier modules near 4,100 XP past level
  // 5's 6,500.
  assert.deepEqual(xpOf(played, state), [
    ["Defeated Hesk's Hound; drove off Kennel Mastiff", 212],
    ["Out with the spoils", 2350],
  ]);
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

test("a level-5 Fighter can win the yard and the hall, and leave with the cup", () => {
  const { state } = firstJourney(
    lodge,
    level5,
    [
      ...POTION_AND_LANTERN,
      ...KENNEL_LOOT,
      ["move", "lodge-hall"],
      ["examine", "bear-pit"],
      ["move", "kennel-yard"],
      ["move", "forest-gate"],
      ["leave", "forest-gate"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-spoils");
  assert.ok(state.clearedEncounterIds.includes("hall-bear"));
});

/** The release run's browser seed, the handoff's scenario 2 seed. */
const RELEASE_SEED = 2;

test("the release run takes the 4,100 XP Ada through the lodge's checks to level 5, through the server to the library file", async () => {
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
    const { session, turns } = await playReleaseRun({
      url: server.url,
      session: await startSavedAdventureOverHttp(server.url, "thornwood-lodge"),
      route: LODGE_ROUTE,
    });
    assert.equal(session.status, "escaped");
    assert.equal(session.ending.kind, "escape-with-loot");
    // The hatch failed at the first try and opened at the second (at the
    // first, until the Champion's initiative advantage, #315, moved the dice).
    assert.deepEqual(
      turns.flatMap(({ intent, skipped }) =>
        skipped === undefined ? [] : [intent],
      ),
      [],
    );
    assert.equal(new Set(turns.map(({ room }) => room)).size, 4);
    const checks = turns.flatMap(({ phase, intent, cards }) =>
      (phase === "fight" ? [] : cards)
        .filter(({ text }) => /check/u.test(text))
        .map(({ text }) => [intent, text.split("\n")[0]]),
    );
    assert.deepEqual(checks, [
      [
        "talk the-poachers-path (persuasion)",
        "Persuasion check: d20 19 − 1 = 18 against DC 14. Success.",
      ],
      [
        "examine trophy-wall (history)",
        "History check: d20 20 + 1 = 21 against DC 13. Success by 5 or more.",
      ],
      [
        "examine ice-house-hatch (perception)",
        "Perception check: d20 1 + 0 + 2 proficiency = 3 against DC 14. Failure.",
      ],
      [
        "examine ice-house-hatch (perception, retry)",
        "Another try at the Ice-house Hatch (costs 1d4 bludgeoning damage).",
      ],
      [
        "search lodge-hall",
        "Perception check: d20 12 + 0 + 2 proficiency = 14 against DC 14. Success.",
      ],
      [
        "disarm gallery-man-trap",
        "Dexterity check, at advantage (Trapper's Tongs): d20 18 and 20, keeping 20; 20 + 2 = 22 against DC 14. Success.",
      ],
    ]);
    // 4,100 XP before; the fights' 425 and the ending's 2,350.
    assert.equal(session.ending.rewards.totalXp, 4100 + 425 + 2350);
    assert.equal(session.ending.rewards.level, 5);
    assert.deepEqual(
      session.ending.rewards.treasure.map(({ name }) => name),
      ["Gilt Hunting Cup", "Topaz"],
    );
    const [ada] = JSON.parse(await readFile(libraryPath, "utf8")).characters;
    assert.equal(ada.session, undefined);
    assert.deepEqual([ada.sheet.level, ada.sheet.xp], [5, 6875]);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the live release script plays the lodge with --adventure thornwood-lodge from the 4,100 XP Ada", async () => {
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
    assert.equal(report.adventureId, "thornwood-lodge");
    assert.equal(report.seed, RELEASE_SEED);
    assert.equal(report.providerCalls, 10);
    assert.equal(report.ending.kind, "escape-with-loot");
    assert.equal(report.summary.roomsVisited, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
