// #311: The Counting-House on Mallow Quay, the increment 15 release module,
// as the owner approved it: Snikk's toll at the arch (a reaction with a
// parley, a toll and trade), a goblin lurking in the counting hall, a bugbear
// lurking in the records loft with the strongroom key, a scything blade on
// the gallery stair, and the strongroom's iron door, opened by its key,
// picked with thieves' tools or broken open. Journeys reach its endings;
// shipped-modules.test.mjs checks it qualifies at its declared difficulty,
// with the gate figures its proposal quotes.
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
import {
  COUNTING_HOUSE_ROUTE,
  playReleaseRun,
} from "../dist/release-run-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { rogueLibrary } from "../dist/test-rogue-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";
import { thief } from "./fixtures/playthroughs.mjs";
import { narratingDm } from "./fixtures/session-layout.mjs";

const quay = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "mallow-counting-house",
);
const room = (id) => quay.rooms.find((entry) => entry.id === id);
/** The items in a room, with what each is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, hiddenIn }) => [id, kind, hiddenIn]);

test("the counting-house is a six-room level 3–4 Medium module, entered and left by the quay steps", () => {
  assert.equal(quay.title, "The Counting-House on Mallow Quay");
  assert.deepEqual(quay.recommendedLevels, { min: 3, max: 4 });
  // Hard until short rests (#334) raised its survival past Medium's.
  assert.equal(quay.difficulty, "medium");
  assert.equal(quay.startRoomId, "quay-steps");
  assert.deepEqual(
    quay.rooms.map(({ id, encounterId }) => [id, encounterId]),
    [
      ["quay-steps", undefined],
      ["toll-arch", "arch-toll"],
      ["counting-hall", "hall-goblin"],
      ["clerks-gallery", undefined],
      ["records-loft", "loft-bugbear"],
      ["strongroom", undefined],
    ],
  );
  assert.deepEqual(
    quay.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["quay-steps"],
  );
  assert.deepEqual(
    quay.passages.map(({ id, between, door, trap }) => [
      id,
      between,
      door?.id,
      trap?.id,
    ]),
    [
      ["quay-to-arch", ["quay-steps", "toll-arch"], undefined, undefined],
      ["arch-to-hall", ["toll-arch", "counting-hall"], undefined, undefined],
      [
        "hall-to-gallery",
        ["counting-hall", "clerks-gallery"],
        undefined,
        "scything-blade",
      ],
      [
        "gallery-to-loft",
        ["clerks-gallery", "records-loft"],
        undefined,
        undefined,
      ],
      [
        "hall-to-strongroom",
        ["counting-hall", "strongroom"],
        "strongroom-door",
        undefined,
      ],
    ],
  );
  assert.deepEqual(
    quay.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-guild-gold", "escape-with-loot", 400],
      ["out-empty-handed", "escape-without-loot", undefined],
      ["fallen-on-mallow-quay", "defeat", undefined],
    ],
  );
});

test("its fights are Snikk at the arch, a lurking goblin in the hall and a lurking bugbear in the loft, none a boss", () => {
  assert.deepEqual(
    quay.encounters.map(
      ({ id, opponents, lurking, sneakAgain, bypassXp, reaction }) => [
        id,
        opponents.map(({ name, boss, statBlock }) => [
          name,
          boss,
          statBlock.name,
        ]),
        lurking,
        sneakAgain,
        bypassXp,
        reaction !== undefined,
      ],
    ),
    [
      [
        "arch-toll",
        [["Snikk the Toll-Taker", undefined, "Goblin Boss"]],
        undefined,
        undefined,
        undefined,
        true,
      ],
      [
        "hall-goblin",
        [["Soot Goblin", undefined, "Goblin Warrior"]],
        true,
        true,
        25,
        false,
      ],
      [
        "loft-bugbear",
        [["The Clerk-Eater", undefined, "Bugbear Warrior"]],
        true,
        true,
        undefined,
        false,
      ],
    ],
  );
});

test("Snikk takes a 5 gp toll, can be talked round and sells daggers, a shortbow and arrows", () => {
  const { reaction } = quay.encounters[0];
  assert.deepEqual(
    Object.entries(reaction.bands).map(([band, { options }]) => [
      band,
      options,
    ]),
    [
      ["unfriendly", ["attack", "parley", "toll"]],
      ["uncertain", ["attack", "parley", "toll"]],
      ["indifferent", ["let-pass", "trade", "attack"]],
      ["friendly", ["let-pass", "trade"]],
    ],
  );
  assert.equal(reaction.peacefulXp, 125);
  assert.deepEqual(reaction.toll.coins, { gp: 5 });
  assert.deepEqual(reaction.parley.approaches, [
    { skill: "persuasion", dc: 13 },
    { skill: "deception", dc: 14 },
    { skill: "intimidation", dc: 15 },
  ]);
  assert.deepEqual(
    Object.entries(reaction.parley.bands).map(([band, { shift, outcome }]) => [
      band,
      shift ?? outcome,
    ]),
    [
      ["failure-by-5", "surprise-attack"],
      ["failure", -1],
      ["success", 1],
      ["success-by-5", "let-pass"],
    ],
  );
  assert.deepEqual(reaction.trade, {
    stock: ["dagger", "shortbow", "arrows"],
    minutes: 10,
  });
});

test("only a potion lies on the quay: the first loot is the till, behind the arch and the hall", () => {
  assert.deepEqual(itemsIn("quay-steps"), [
    ["bollard-potion", "potion-of-healing", "mooring-bollard"],
  ]);
  assert.deepEqual(itemsIn("toll-arch"), []);
  assert.deepEqual(requiredPath(quay).roomIds, [
    "quay-steps",
    "toll-arch",
    "counting-hall",
  ]);
  assert.deepEqual(itemsIn("counting-hall"), [
    ["till-silver", "coin", "smashed-till"],
    ["soot-goblin-coins", "coin", "soot-goblin"],
  ]);
  assert.deepEqual(itemsIn("clerks-gallery"), [
    ["desk-bloodstone", "treasure", "tally-desk"],
  ]);
  assert.deepEqual(itemsIn("records-loft"), [
    ["strongroom-key", "key", "clerk-eater"],
    ["clerk-eater-coins", "coin", "clerk-eater"],
    ["clerk-eater-trinket", "treasure", "clerk-eater"],
  ]);
  assert.deepEqual(itemsIn("strongroom"), [
    ["coffer-garnet", "treasure", "iron-coffer"],
    ["coffer-garnet-2", "treasure", "iron-coffer"],
    ["chain-of-office", "treasure", "iron-coffer"],
    ["guild-gold", "coin", "iron-coffer"],
  ]);
});

test("its treasure is 84% of the level-4 budget, the carried loot rolled from its treasure types", () => {
  // Rolled with `npm run loot -- adventures/5e/mallow-counting-house.json
  // --seed 311`; Snikk's roll was removed, so the arch holds no loot.
  const carried = quay.rooms.flatMap(({ items }) =>
    items.flatMap(({ id, coins, treasure }) =>
      id.startsWith("soot-goblin") || id.startsWith("clerk-eater")
        ? [[id, coins ?? treasure]]
        : [],
    ),
  );
  assert.deepEqual(carried, [
    ["soot-goblin-coins", { cp: 4 }],
    ["clerk-eater-coins", { sp: 9 }],
    ["clerk-eater-trinket", "art-25gp"],
  ]);
  // Potion 50 gp, till 6 gp, bloodstone 50 gp, coffer 375 gp; carried 4 cp,
  // 9 sp and a 25 gp trinket.
  assert.equal(findableValue(quay), 5000 + 600 + 5000 + 37500 + 4 + 90 + 2500);
  assert.equal(treasureBudget(4), 60000);
});

// The checks and reactions, with scripted dice. testFighterAt(3): Athletics
// +5 at advantage (Remarkable Athlete), Investigation +1, Perception +2,
// Charisma −1. thief() at level 3: Dexterity +4, Perception +5, Stealth +8,
// Persuasion +1, Charisma −1.
const ada = testFighterAt(3);
const vex = thief();
const RICH = 5000;

function accepted(runtime, state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result.state;
}

/** Two d6s for a reaction roll. */
const d6s = (first, second) => [
  [6, first],
  [6, second],
];
const offered = (runtime, state, kind) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === kind && available)
    .map(({ target, approach }) =>
      approach === undefined ? target.id : `${target.id}:${approach.id}`,
    );

/** `sheet` with a full purse, facing Snikk after a reaction roll of `roll`. */
function atArch(sheet, roll) {
  const runtime = createFifthRuntime(quay, { ...sheet, purse: RICH });
  const begun = accepted(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    dice(),
  );
  return {
    runtime,
    state: accepted(
      runtime,
      begun,
      { type: "move", destinationId: "toll-arch" },
      dice(...roll),
    ),
  };
}

test("an unfriendly Snikk offers a fight, a parley or the toll; paying 5 gp lets the character into the hall", () => {
  // 2d6 2 + 2 − 1 = 3: unfriendly.
  const { runtime, state } = atArch(ada, d6s(2, 2));
  assert.deepEqual(offered(runtime, state, "react"), [
    "attack",
    "parley:persuasion",
    "parley:deception",
    "parley:intimidation",
    "toll",
  ]);
  const paid = accepted(
    runtime,
    state,
    { type: "react", option: "toll" },
    dice(),
  );
  assert.equal(paid.possessions.purse, RICH - 500);
  assert.deepEqual(paid.peacefulEncounterIds, ["arch-toll"]);
  assert.deepEqual(offered(runtime, paid, "move"), [
    "quay-steps",
    "counting-hall",
  ]);
});

test("a Persuasion parley that succeeds by 5 has Snikk lift the chain", () => {
  // 2d6 2 + 2 − 1 = 3: unfriendly; then 17 + 1 = 18 against DC 13.
  const { runtime, state } = atArch(vex, d6s(2, 2));
  const passed = accepted(
    runtime,
    state,
    { type: "react", option: "parley", approach: "persuasion" },
    dice([20, 17]),
  );
  assert.deepEqual(passed.peacefulEncounterIds, ["arch-toll"]);
  assert.equal(passed.possessions.purse, RICH);
});

test("an indifferent Snikk lets the character pass or trades his stock", () => {
  // 2d6 5 + 5 − 1 = 9: indifferent.
  const { runtime, state } = atArch(ada, d6s(5, 5));
  assert.deepEqual(offered(runtime, state, "react"), ["let-pass", "attack"]);
  // Trade is offered as buying his stock while the band holds.
  assert.deepEqual(offered(runtime, state, "buy"), [
    "dagger",
    "shortbow",
    "arrows",
  ]);
});

/**
 * A level-3 character, rich enough for the toll, who paid Snikk and stands
 * in the counting hall with its fight won, on the first seed that does.
 */
const inHall = (sheet) =>
  firstJourney(
    quay,
    { ...sheet, purse: RICH },
    [
      ["move", "toll-arch"],
      ["react", "toll"],
      ["move", "counting-hall"],
    ],
    ({ status, roomId, clearedEncounterIds }) =>
      status === "playing" &&
      roomId === "counting-hall" &&
      clearedEncounterIds.includes("hall-goblin"),
  );

const DOOR = "strongroom-door";

test("the Rogue picks the strongroom door with thieves' tools, once", () => {
  const { runtime, state } = inHall(vex);
  assert.deepEqual(offered(runtime, state, "pick"), [DOOR]);
  // 9 + 4 + 2 proficiency = 15 meets DC 15.
  const opened = accepted(
    runtime,
    state,
    { type: "pick", doorId: DOOR },
    dice([20, 9]),
  );
  assert.ok(offered(runtime, opened, "move").includes("strongroom"));
  // 8 + 4 + 2 = 14 misses, and the lock can't be picked again.
  const missed = accepted(
    runtime,
    state,
    { type: "pick", doorId: DOOR },
    dice([20, 8]),
  );
  assert.ok(!offered(runtime, missed, "move").includes("strongroom"));
  assert.deepEqual(offered(runtime, missed, "pick"), []);
  assert.deepEqual(offered(runtime, missed, "break"), [DOOR]);
});

test("a Fighter without thieves' tools breaks the door open, and may try again for 1d4 bludgeoning", () => {
  const { runtime, state } = inHall(ada);
  assert.deepEqual(offered(runtime, state, "pick"), []);
  assert.deepEqual(
    runtime.handleAction(state, { type: "pick", doorId: DOOR }, dice())
      .rejection.code,
    "no-tools",
  );
  // At advantage (Remarkable Athlete): 11 and 4, keeping 11; 11 + 5 = 16
  // misses DC 17.
  const held = accepted(
    runtime,
    state,
    { type: "break", doorId: DOOR },
    dice([20, 11], [20, 4]),
  );
  assert.ok(!offered(runtime, held, "move").includes("strongroom"));
  // 1d4 3, then 12 and 2, keeping 12; 12 + 5 = 17.
  const broken = accepted(
    runtime,
    held,
    { type: "break", doorId: DOOR, retry: true },
    dice([4, 3], [20, 12], [20, 2]),
  );
  assert.equal(broken.character.hp, held.character.hp - 3);
  assert.ok(offered(runtime, broken, "move").includes("strongroom"));
});

test("the scything blade is found by a search and disarmed with thieves' tools or bare hands", () => {
  const { runtime, state } = inHall(vex);
  // 8 + 5 = 13 meets the find DC 13 (Perception, Vex's better skill).
  const found = accepted(
    runtime,
    state,
    { type: "search", roomId: "counting-hall" },
    dice([20, 8]),
  );
  assert.ok(found.foundTrapIds.includes("scything-blade"));
  assert.deepEqual(offered(runtime, found, "disarm"), [
    "scything-blade:thieves-tools",
    "scything-blade:dexterity",
  ]);
  // 7 + 4 + 2 = 13 meets the tools' DC 13.
  accepted(
    runtime,
    found,
    { type: "disarm", trapId: "scything-blade", approach: "thieves-tools" },
    dice([20, 7]),
  );
  // Bare-handed, 10 + 4 = 14 misses DC 15.
  const missed = runtime.handleAction(
    found,
    { type: "disarm", trapId: "scything-blade", approach: "dexterity" },
    dice([20, 10]),
  );
  assert.equal(missed.rejection, undefined);
  assert.ok(!missed.state.disarmedTrapIds?.includes("scything-blade"));
});

test("the tally-master's desk gives up its bloodstone to Investigation, once", () => {
  const { runtime, state } = inHall(ada);
  // The trap: Ada's save 15 + 2 = 17 halves 2d4 (2 + 3) to 2.
  const gallery = accepted(
    runtime,
    state,
    { type: "move", destinationId: "clerks-gallery" },
    dice([20, 15], [4, 2], [4, 3]),
  );
  const desk = { type: "examine", targetId: "tally-desk" };
  // 12 + 1 = 13 meets DC 13.
  const found = accepted(runtime, gallery, desk, dice([20, 12]));
  assert.deepEqual(offered(runtime, found, "take"), ["desk-bloodstone"]);
  const empty = accepted(runtime, gallery, desk, dice([20, 11]));
  assert.deepEqual(offered(runtime, empty, "take"), []);
});

const TOLL_TO_HALL = [
  ["examine", "mooring-bollard"],
  ["take", "bollard-potion"],
  ["move", "toll-arch"],
  ["react", "toll"],
];
const OUT = [
  ["move", "toll-arch"],
  ["move", "quay-steps"],
  ["leave", "quay-steps"],
];

test("a Fighter who pays the toll, wins the hall and breaks into the strongroom leaves with the guild's gold", () => {
  const { state, runtime } = firstJourney(
    quay,
    { ...ada, purse: RICH },
    [
      ...TOLL_TO_HALL,
      ["move", "counting-hall"],
      ["examine", "smashed-till"],
      ["take", "till-silver"],
      ["break", DOOR],
      ["move", "strongroom"],
      ["examine", "iron-coffer"],
      ["take", "coffer-garnet"],
      ["take", "guild-gold"],
      ["move", "counting-hall"],
      ...OUT,
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-guild-gold");
  // The goblin's 50, the toll's peaceful 125 and the ending's 400.
  assert.deepEqual(
    xpOf(runtime, state).map(([, xp]) => xp),
    [50, 125, 400],
  );
});

test("a Rogue slips past the hall's goblin, ambushes the Clerk-Eater for the key, ambushes the goblin and unlocks the strongroom", () => {
  // Every step after a sneak needs it to have left the Rogue unseen: a
  // failed sneak starts the fight, so the seed's route is refused.
  const { state } = firstJourney(
    quay,
    { ...vex, purse: RICH },
    [
      ...TOLL_TO_HALL,
      ["sneak", "counting-hall"],
      ["move", "clerks-gallery"],
      ["sneak", "records-loft"],
      ["ambush", "records-loft"],
      ["examine", "clerk-eater"],
      ["take", "strongroom-key"],
      ["take", "clerk-eater-trinket"],
      ["move", "clerks-gallery"],
      ["sneak", "counting-hall"],
      ["ambush", "counting-hall"],
      ["unlock", DOOR],
      ["move", "strongroom"],
      ["examine", "iron-coffer"],
      ["take", "guild-gold"],
      ["move", "counting-hall"],
      ...OUT,
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-guild-gold");
  assert.deepEqual(
    state.sneaks.map(({ encounterId, roll }) => [encounterId, roll.success]),
    // The hall's second sneak replaced its first (sneakAgain).
    [
      ["loft-bugbear", true],
      ["hall-goblin", true],
    ],
  );
  assert.deepEqual(state.clearedEncounterIds, ["loft-bugbear", "hall-goblin"]);
});

test("the hall's goblin can surprise the character as it comes in", () => {
  const { state } = firstJourney(
    quay,
    { ...ada, purse: RICH },
    [...TOLL_TO_HALL, ["move", "counting-hall"]],
    ({ lurks }) => lurks.some(({ roll }) => roll.success),
  );
  assert.equal(state.lurks[0].encounterId, "hall-goblin");
});

test("taking the potion and leaving is escaping without loot", () => {
  const { state, runtime } = firstJourney(
    quay,
    ada,
    [
      ["examine", "mooring-bollard"],
      ["take", "bollard-potion"],
      ["leave", "quay-steps"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-empty-handed");
  assert.deepEqual(xpOf(runtime, state), []);
});

/** The release run's browser seed, the handoff's scenario 2 seed. */
const RELEASE_SEED = 8;

test("the release run takes the level-3 Rogue through a parley, a toll, a sneak, an ambush and a picked lock, through the server to the library file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-311-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(libraryPath, JSON.stringify(rogueLibrary()));
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
      session: await startSavedAdventureOverHttp(
        server.url,
        "mallow-counting-house",
      ),
      route: COUNTING_HOUSE_ROUTE,
    });
    assert.equal(session.status, "escaped");
    assert.equal(session.ending.kind, "escape-with-loot");
    assert.deepEqual(
      turns.flatMap(({ intent, skipped }) =>
        skipped === undefined ? [] : [intent],
      ),
      [],
    );
    // The DM only narrates, so every step is its button.
    assert.ok(
      turns.every(({ message, fallback }) => message === undefined || fallback),
    );
    assert.equal(new Set(turns.map(({ room }) => room)).size, 5);
    const rolls = turns.flatMap(({ phase, intent, cards }) =>
      (phase === "fight" ? [] : cards)
        .filter(({ text }) => /check|Reaction roll/u.test(text))
        .map(({ text }) => [intent, text.split("\n")[0]]),
    );
    assert.deepEqual(
      rolls.map(([intent]) => intent),
      [
        "move toll-arch",
        "react parley (persuasion)",
        "sneak counting-hall",
        "examine tally-desk",
        "sneak counting-hall",
        "pick strongroom-door",
      ],
    );
    // 900 XP before; the goblin's 50, the peaceful 125 and the ending's 400.
    assert.equal(session.ending.rewards.totalXp, 900 + 575);
    assert.deepEqual(
      session.ending.rewards.treasure.map(({ name }) => name),
      ["Garnet", "Second Garnet", "Chain of Office"],
    );
    const [vex] = JSON.parse(await readFile(libraryPath, "utf8")).characters;
    assert.equal(vex.session, undefined);
    assert.deepEqual([vex.sheet.level, vex.sheet.xp], [3, 1475]);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the live release script plays the counting-house with --adventure mallow-counting-house from the level-3 Rogue", async () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const env = { ...process.env, OPENAI_API_KEY: "" };
  const directory = await mkdtemp(join(tmpdir(), "issue-311-script-"));
  try {
    const output = join(directory, "report.json");
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--adventure",
        "mallow-counting-house",
        "--output",
        output,
        "--max-calls",
        "10",
      ],
      { encoding: "utf8", env, timeout: 60000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.issue, 311);
    assert.equal(report.adventureId, "mallow-counting-house");
    assert.equal(report.seed, RELEASE_SEED);
    assert.equal(report.providerCalls, 10);
    assert.equal(report.ending.kind, "escape-with-loot");
    assert.equal(report.summary.roomsVisited, 5);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
