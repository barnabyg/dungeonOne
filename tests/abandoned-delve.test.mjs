// #136: The Abandoned Delve, the first real 5e adventure module, expanded
// for #442 as the owner approved it on #441: a long level-2 module of
// sixteen rooms in two regions, the Keep Cellars and the Crypts, with the
// rope that frees the goblin and opens the well, Mags Corrow the rival, the
// crypts' alarm, the vault's coffer stack, the lord's sarcophagus and a
// wandering dead delver on rests. Scripted-DM journeys reach each of its
// endings; shipped-modules.test.mjs checks it qualifies at its declared
// difficulty, with its quoted figures. The DM evaluation's cases and the
// live qualification, both written for it (#138), are checked here too.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { regionSweeps, requiredPath } from "../dist/balance-5e.js";
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
import { createFifthRuntime } from "../dist/runtime-5e.js";
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
const level2 = testFighterAt(2);

// #233: Undead Fortitude made its Zombie too deadly at level 1. #442: the
// weakest level-2 Rogue survives the old-well route 84.5%, under Medium's
// 85%, so the expanded delve is declared Hard.
test("the delve is a long level-2 Hard module of sixteen rooms in two regions, left by the gate or the shaft", () => {
  assert.equal(delve.title, "The Abandoned Delve");
  assert.deepEqual(delve.recommendedLevels, { min: 2, max: 2 });
  assert.equal(delve.difficulty, "hard");
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
      ["vault", "crypts", false, false, true],
      ["well-bottom", "crypts", false, false, false],
      ["flooded-cistern", "crypts", false, false, false],
      ["ossuary", "crypts", false, false, false],
      ["lords-tomb", "crypts", false, false, false],
    ],
  );
  assert.deepEqual(
    delve.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-loot", "escape-with-loot", 600],
      ["out-empty-handed", "escape-without-loot", undefined],
      ["lost-in-the-delve", "defeat", undefined],
    ],
  );
  assert.deepEqual(delve.flags, ["goblin-freed", "delve-roused"]);
  assert.deepEqual(delve.wanderingEncounter, {
    encounterId: "dead-delver",
    chance: 25,
  });
});

test("its fights: the ghoul is the only boss, Mags runs to the shaft when the crypts are roused, and a dead delver wanders", () => {
  assert.deepEqual(
    delve.encounters.map(({ id, opponents, movesTo }) => [
      id,
      opponents.map(({ id: opponentId, statBlock, boss }) => [
        opponentId,
        statBlock.name,
        boss === true,
      ]),
      movesTo,
    ]),
    [
      ["guard-zombie", [["zombie", "Zombie", false]], undefined],
      [
        "barracks-skeletons",
        [
          ["skeleton-sergeant", "Skeleton", false],
          ["skeleton-guard", "Skeleton", false],
        ],
        undefined,
      ],
      ["kitchen-wolf", [["grey-wolf", "Wolf", false]], undefined],
      ["crypt-spider", [["giant-spider", "Giant Spider", false]], undefined],
      ["vault-ghoul", [["ghoul", "Ghoul", true]], undefined],
      [
        "ossuary-rival",
        [["mags-corrow", "Bandit", false]],
        { roomId: "shaft-bottom", when: "delve-roused" },
      ],
      ["dead-delver", [["dead-delver", "Zombie", false]], undefined],
    ],
  );
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
          "shrine",
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
  assert.deepEqual(
    room("dry-well").creatures[0].topics.map(({ id, offeredWhile }) => [
      id,
      offeredWhile,
    ]),
    [
      ["the-vault", undefined],
      ["the-stair", undefined],
      ["the-woman", "goblin-freed"],
      ["the-tomb", "goblin-freed"],
    ],
  );
  assert.equal(passage("dry-well", "shrine").trap.id, "loose-step");
  assert.equal(passage("gate-hall", "storeroom").door.state, "stuck");
  const vault = passage("shaft-bottom", "vault").door;
  assert.equal(vault.state, "locked");
  assert.equal(vault.keyItemId, "bronze-key");
  assert.equal(vault.break.bands["failure-by-5"].noisy, true);
});

test("the sarcophagus opens two ways, the goblin's directions help, and failing by 5 is noisy; the coffers fall on a foe", () => {
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
    ],
  );
  assert.equal(check.bands["failure-by-5"].noisy, true);
  assert.equal(check.bands["failure-by-5"].effects, undefined);
  for (const band of ["success", "success-by-5"]) {
    assert.deepEqual(
      check.bands[band].effects
        .filter(({ type }) => type === "item")
        .map(({ item }) => item),
      ["death-mask", "tomb-peridot"],
      band,
    );
  }
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
  // Nothing removes the ghoul, so nothing it guards is ever lost.
  assert.ok(
    Object.values(fightAction.bands).every(({ effects = [] }) =>
      effects.every(({ type }) => type !== "remove"),
    ),
  );
});

test("its treasure is 98% of the long level-2 budget, with two potions and a scroll, and nothing to carry out lies unfought", () => {
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
      ["dagger-hilt", "art-25gp"],
      ["moss-agate", "gem-10gp"],
      ["candlesticks", "art-25gp"],
      ["gold-ring", "art-25gp"],
      ["jewelled-goblet", "art-25gp"],
      ["vault-garnet", "gem-50gp"],
      ["delvers-jasper", "gem-50gp"],
      ["satchel-turquoise", "gem-10gp"],
      ["death-mask", "art-25gp"],
      ["tomb-peridot", "gem-50gp"],
    ],
  );
  assert.ok(items.every(({ hiddenIn }) => hiddenIn !== undefined));
  assert.equal(findableValue(delve), 59070);
  assert.equal(treasureBudget(2, true), 60000);
  // The rooms reachable from the gate without entering a fight hold no
  // treasure or coin, so a cautious run can't take loot and leave unfought.
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
  ["move", "well-bottom"],
];

test("down the old well with the porter's rope: the goblin goes free and talks, Mags falls in the ossuary, and the shaft pays 600 XP", () => {
  const { state, runtime } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["examine", "silted-floor"],
      ["take", "wishing-coins"],
      ["move", "flooded-cistern"],
      ["examine", "drowned-delver"],
      ["take", "delvers-jasper"],
      ["move", "ossuary"],
      ["examine", "mags-satchel"],
      ["take", "satchel-gold"],
      ["take", "satchel-turquoise"],
      ["move", "shaft-bottom"],
      ["leave", "shaft-bottom"],
    ],
    ({ status }) => status === "escaped",
  );
  assert.equal(state.endingId, "out-with-the-loot");
  assert.ok(state.flags.includes("goblin-freed"));
  assert.ok(!state.inventory.includes("coil-of-rope"));
  assert.deepEqual(state.clearedEncounterIds, [
    "guard-zombie",
    "ossuary-rival",
  ]);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Zombie", 50],
    ["Defeated Mags Corrow", 25],
    ["Out with the loot", 600],
  ]);
});

test("with the goblin's directions, the sarcophagus gives up the death mask and the peridot", () => {
  const { state } = firstJourney(
    delve,
    level2,
    [
      ...TO_THE_WELL,
      ["move", "flooded-cistern"],
      ["move", "ossuary"],
      ["move", "lords-tomb"],
      ["examine", "sarcophagus-lid", "investigation"],
      ["take", "death-mask"],
      ["take", "tomb-peridot"],
    ],
    ({ status, inventory }) =>
      status === "playing" && inventory.includes("tomb-peridot"),
  );
  assert.ok(state.inventory.includes("death-mask"));
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
  ["take", { item: "candlesticks" }],
  ["move", { destination: "shaft-bottom" }],
  ["unlock", { door: "vault-door" }],
  ["move", { destination: "vault" }],
  ["examine", { target: "iron-chest" }],
  ["take", { item: "jewelled-goblet" }],
  ["take", { item: "coin-chest" }],
  ["move", { destination: "shaft-bottom" }],
  ["leave", "shaft-bottom"],
];

/**
 * The first seed from 0 on whose journey ends with `endingId` and, if
 * given, whose last state `wanted` accepts.
 */
async function seedFor(sheet, steps, endingId, wanted = () => true) {
  for (let seed = 0; seed < 200; seed++) {
    const { state } = await journey(sheet, seed, steps);
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
    ["candlesticks", "jewelled-goblet"],
  );
  // The guard's purse and the chest's gold went into the purse.
  assert.equal(state.possessions.purse, 180 + 9000);
  assert.deepEqual(state.clearedEncounterIds, ["guard-zombie", "vault-ghoul"]);
  // The fights' XP and the ending's.
  assert.equal(
    runtime.projectSettlement(state).xp.reduce((sum, { xp }) => sum + xp, 0),
    50 + 200 + 600,
  );
});

// #442: the vault's fight going on past round 4 rouses the crypts, and Mags
// runs from the ossuary to the shaft bottom, where Ada meets her on the way
// out.
test("scripted DM: a long fight in the vault rouses the crypts, and Mags waits at the shaft", async () => {
  const seed = await seedFor(
    STRONG,
    PUSH_DEEPER,
    "out-with-the-loot",
    ({ flags }) => flags.includes("delve-roused"),
  );
  const { state, runtime } = await journey(STRONG, seed, PUSH_DEEPER);
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
