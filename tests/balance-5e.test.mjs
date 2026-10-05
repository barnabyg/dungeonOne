import assert from "node:assert/strict";
import test from "node:test";
import {
  DIFFICULTY_THRESHOLDS,
  fighterAtLevel,
  gateAdventure,
  oneHitKillChance,
  percentileCharacters,
  PLAY_STYLES,
  playAdventure,
  qualifies,
  qualifyAdventure,
  renderBalanceResult,
  renderGateResult,
  requiredPath,
} from "../dist/balance-5e.js";
import { main, parseArguments } from "../scripts/balance-5e.mjs";
import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";

const STRONG_DICE = [
  [6, 6, 6, 1],
  [5, 5, 5, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [2, 2, 2, 1],
  [1, 1, 1, 1],
];

test("a character is placed with the creation defaults at the level asked for", () => {
  const sheet = fighterAtLevel(STRONG_DICE, 2);
  assert.equal(sheet.level, 2);
  assert.equal(sheet.xp, 300);
  assert.deepEqual(sheet.abilities, {
    strength: 20,
    constitution: 16,
    dexterity: 12,
    wisdom: 9,
    charisma: 6,
    intelligence: 3,
  });
  assert.deepEqual(sheet.skills, ["athletics", "perception"]);
  assert.equal(sheet.fightingStyle, "defense");
  // 10 + 3 at level 1, then 6 + 3 for level 2, at full health.
  assert.equal(sheet.hp, 22);
});

test("percentile characters come from the 4d6-drop-lowest distribution by total modifier", () => {
  const characters = percentileCharacters({ percentiles: [5, 50, 95] });
  assert.deepEqual(
    characters.map(({ percentile }) => percentile),
    [5, 50, 95],
  );
  const [weak, middle, strong] = characters.map(
    ({ totalModifier }) => totalModifier,
  );
  // Six 4d6-drop-lowest scores average about 12.2 each, +1 with the
  // background increase on Strength: roughly +5 in all at the median.
  assert.ok(middle >= 3 && middle <= 7, `median ${middle}`);
  assert.ok(weak <= 2, `5th percentile ${weak}`);
  assert.ok(strong >= 8, `95th percentile ${strong}`);
  for (const { dice, totalModifier } of characters) {
    const sheet = fighterAtLevel(dice, 1);
    const total = Object.values(sheet.abilities).reduce(
      (sum, score) => sum + Math.floor((score - 10) / 2),
      0,
    );
    assert.equal(total, totalModifier);
  }
});

test("the same sample gives the same characters", () => {
  assert.deepEqual(
    percentileCharacters({ percentiles: [5, 95] }),
    percentileCharacters({ percentiles: [5, 95] }),
  );
});

test("the chance of killing an enemy with one attack counts hit chance and critical hits", () => {
  // Strength 20 at level 1: mace +7 to hit, 1d6 + 5, critical on a 20.
  const strong = fighterAtLevel(STRONG_DICE, 1);
  const minion = { armorClass: 12, hitPoints: { average: 7 } };
  const warrior = { armorClass: 15, hitPoints: { average: 10 } };
  // Minion: 5–19 hit and kill on a d6 of 2+ (15/20 × 5/6); a 20 always kills.
  assert.ok(Math.abs(oneHitKillChance(strong, minion) - 0.675) < 1e-9);
  // Warrior: 8–19 hit and kill on a 5+ (12/20 × 2/6); a 20 kills unless 2d6 ≤ 4.
  assert.ok(
    Math.abs(oneHitKillChance(strong, warrior) - (0.2 + (1 / 20) * (30 / 36))) <
      1e-9,
  );
  // Level 3's Improved Critical makes a 19 a critical hit too.
  const champion = fighterAtLevel(STRONG_DICE, 3);
  assert.ok(
    Math.abs(oneHitKillChance(champion, minion) - (14 / 20) * (5 / 6) - 0.1) <
      1e-9,
  );
});

const SHIPPED = Object.fromEntries(
  (await loadBuiltInFifthAdventures()).map((adventure) => [
    adventure.id,
    adventure,
  ]),
);

test("the required path leads to a victory, or else out with treasure, through the fewest fights", () => {
  assert.deepEqual(requiredPath(SHIPPED["smugglers-cellar"]), {
    objective: "victory",
    roomIds: ["stair-foot", "rat-cellar", "den"],
  });
  assert.deepEqual(requiredPath(SHIPPED["warden-crypt"]), {
    objective: "victory",
    roomIds: ["crypt-stair", "hall", "tomb"],
  });
  assert.deepEqual(requiredPath(SHIPPED["robbers-barrow"]), {
    objective: "escape-with-loot",
    roomIds: ["barrow-mouth", "burial-hall"],
  });
  assert.deepEqual(requiredPath(SHIPPED["goblin-warren"]), {
    objective: "escape-with-loot",
    roomIds: ["warren-gate", "guard-tunnel", "boss-hall"],
  });
  assert.deepEqual(requiredPath(SHIPPED["cellar-goblin"]), {
    objective: "victory",
    roomIds: ["cellar"],
  });
});

const MEDIAN = percentileCharacters({ percentiles: [50] })[0].dice;

/** A shipped module changed by `change`, validated again. */
function variant(id, change) {
  const copy = structuredClone(SHIPPED[id]);
  change(copy);
  return validateFifthAdventure(copy);
}

/** The smugglers' cellar with a giant rat in the optional alcove too. */
const RAT_IN_ALCOVE = variant("smugglers-cellar", (module) => {
  const rat = module.encounters.find(({ id }) => id === "cellar-rat");
  module.encounters.push({
    ...structuredClone(rat),
    id: "alcove-rat",
    opponents: rat.opponents.map((opponent) => ({
      ...opponent,
      id: "alcove-rat",
    })),
  });
  module.rooms.find(({ id }) => id === "alcove").encounterId = "alcove-rat";
});

function play(adventure, style, seed, dice = STRONG_DICE, level = 1) {
  return playAdventure(
    createFifthRuntime(adventure, fighterAtLevel(dice, level)),
    style,
    seed,
  );
}

test("a run is the same for the same seed", () => {
  for (const style of PLAY_STYLES) {
    assert.deepEqual(
      play(SHIPPED["warden-crypt"], style, 7, MEDIAN),
      play(SHIPPED["warden-crypt"], style, 7, MEDIAN),
    );
  }
});

test("avoid-optional keeps to the required rooms; cautious and direct look into quiet optional rooms", () => {
  const cellar = SHIPPED["smugglers-cellar"];
  const avoiding = play(cellar, "avoid-optional", 1);
  assert.equal(avoiding.outcome, "victory");
  assert.deepEqual(avoiding.roomIds, ["stair-foot", "rat-cellar", "den"]);
  for (const style of ["cautious", "direct"]) {
    const run = play(cellar, style, 1);
    assert.equal(run.outcome, "victory");
    assert.ok(run.roomIds.includes("alcove"), `${style} visits the alcove`);
  }
});

test("direct fights optional fights; cautious and avoid-optional skip them", () => {
  const fought = (style) =>
    play(RAT_IN_ALCOVE, style, 3).encounters.map(({ id }) => id);
  assert.deepEqual(fought("direct").sort(), [
    "alcove-rat",
    "cellar-rat",
    "den-goblin",
  ]);
  assert.deepEqual(fought("cautious"), ["cellar-rat", "den-goblin"]);
  assert.deepEqual(fought("avoid-optional"), ["cellar-rat", "den-goblin"]);
});

test("a loot run takes the treasure out and earns its XP", () => {
  const run = play(SHIPPED["robbers-barrow"], "avoid-optional", 2);
  assert.equal(run.outcome, "escape-with-loot");
  // The goblin's 50 XP and the ending's 250; the torc and the coin pouch.
  assert.equal(run.xp, 300);
  assert.equal(run.treasure, 2);
});

test("carrying treasure through an exit, direct still fights through the rooms beyond", () => {
  // The torc lies under the lintel by the way out instead of on the bier.
  const torcAtTheDoor = variant("robbers-barrow", (module) => {
    const [mouth, hall] = module.rooms;
    const torc = hall.items.find(({ id }) => id === "silver-torc");
    hall.items = hall.items.filter((item) => item !== torc);
    mouth.items.push({ ...torc, hiddenIn: "scratched-lintel" });
  });
  const direct = play(torcAtTheDoor, "direct", 2);
  assert.deepEqual(direct.roomIds, ["barrow-mouth", "burial-hall"]);
  assert.equal(direct.treasure, 2);
  // The hall's fight is optional now, so the other styles leave at once.
  for (const style of ["cautious", "avoid-optional"]) {
    const run = play(torcAtTheDoor, style, 2);
    assert.deepEqual(run.roomIds, ["barrow-mouth"], style);
    assert.equal(run.outcome, "escape-with-loot", style);
  }
});

test("each fight records the hit points it cost and how many rounds it lasted", () => {
  const run = play(SHIPPED["cellar-goblin"], "direct", 5, MEDIAN);
  assert.equal(run.encounters.length, 1);
  const [fight] = run.encounters;
  assert.equal(fight.id, "cellar-goblin");
  assert.ok(fight.rounds >= 1);
  assert.ok(fight.hpLost >= 0);
});

test("a run against an overwhelming enemy ends in defeat", () => {
  const deadly = variant("cellar-goblin", (module) => {
    const block = module.encounters[0].opponents[0].statBlock;
    block.hitPoints.average = 300;
    const attack = block.attacks[0];
    attack.bonus = 20;
    attack.damage = { dice: 10, sides: 12, modifier: 20, type: "slashing" };
  });
  const run = play(deadly, "cautious", 1);
  assert.equal(run.outcome, "defeat");
  assert.equal(run.xp, 0);
  // The killing blow costs only the hit points left: 13 at the start, plus
  // whatever healing came before it.
  assert.equal(run.encounters[0].hpLost, 13 + run.healing.hp);
});

test("a trap sprung on the way is counted apart from the fights", () => {
  // Direct goes through the hall's trapped passage without searching.
  const runs = Array.from({ length: 20 }, (_, seed) =>
    play(SHIPPED["warden-crypt"], "direct", seed, MEDIAN),
  );
  assert.ok(runs.some(({ trapDamage }) => trapDamage > 0));
  const careful = Array.from({ length: 20 }, (_, seed) =>
    play(SHIPPED["warden-crypt"], "avoid-optional", seed, MEDIAN),
  );
  assert.ok(careful.every(({ trapDamage }) => trapDamage === 0));
});

test("an action the harness can't play fails the run with a named reason", () => {
  const runtime = createFifthRuntime(
    SHIPPED["cellar-goblin"],
    fighterAtLevel(STRONG_DICE, 1),
  );
  const casting = {
    ...runtime,
    projectActions: (state) => [
      ...runtime.projectActions(state),
      { action: "cast", available: true },
    ],
  };
  assert.throws(() => playAdventure(casting, "direct", 1), {
    name: "BalanceError",
    code: "unsupported-action",
  });
});

test("a run left with no way on and no way out fails with a named reason", () => {
  const runtime = createFifthRuntime(
    SHIPPED["smugglers-cellar"],
    fighterAtLevel(STRONG_DICE, 1),
  );
  // As if the stair foot's ways out needed something no style does.
  const walled = {
    ...runtime,
    projectActions: (state) =>
      runtime.projectActions(state).filter(({ action }) => action !== "move"),
  };
  assert.throws(() => playAdventure(walled, "cautious", 1), {
    name: "BalanceError",
    code: "stranded",
    message: /smugglers-cellar: a cautious run was stranded in stair-foot/u,
  });
});

const FEW_SEEDS = Array.from({ length: 20 }, (_, seed) => seed);

test("a report has metrics for each level, character percentile and style", () => {
  const result = qualifyAdventure(SHIPPED["goblin-warren"], {
    seeds: FEW_SEEDS,
  });
  assert.equal(result.ok, true);
  const { report } = result;
  assert.equal(report.adventureId, "goblin-warren");
  assert.equal(report.objective, "escape-with-loot");
  assert.deepEqual(
    report.cells.map(({ level, percentile, style }) => [
      level,
      percentile,
      style,
    ]),
    [2, 3].flatMap((level) =>
      [5, 95].flatMap((percentile) =>
        ["direct", "cautious", "avoid-optional"].map((style) => [
          level,
          percentile,
          style,
        ]),
      ),
    ),
  );
  for (const cell of report.cells) {
    assert.equal(cell.runs, 20);
    assert.ok(cell.survivalRate >= 0 && cell.survivalRate <= 1);
    assert.ok(cell.completionRate <= cell.survivalRate);
    assert.deepEqual(cell.encounters.map(({ id }) => id).sort(), [
      "boss-fight",
      "tunnel-guards",
    ]);
    for (const fight of cell.encounters) {
      assert.ok(fight.runs > 0 && fight.runs <= 20);
      assert.ok(fight.meanRounds >= 1);
      assert.ok(fight.meanHpLost >= 0);
    }
    assert.ok(cell.healing.meanSecondWinds <= 2);
    // Surviving runs earn the 650 XP of both fights and the ending at most.
    assert.ok(cell.meanXp > 0 && cell.meanXp <= 650);
    assert.ok(cell.meanTreasure > 0 && cell.meanTreasure <= 2);
    assert.deepEqual(
      cell.oneHitKill.map(({ opponentId }) => opponentId),
      ["tunnel-guard", "goblin-boss"],
    );
  }
});

test("a weak character survives a hard fight less often than a strong one", () => {
  const { report } = qualifyAdventure(SHIPPED["goblin-storeroom"], {
    seeds: Array.from({ length: 100 }, (_, seed) => seed),
    styles: ["cautious"],
  });
  const [weak, strong] = report.cells;
  assert.equal(weak.percentile, 5);
  assert.ok(weak.survivalRate < strong.survivalRate);
  assert.ok(
    strong.oneHitKill.every(
      ({ opponentId }, index) =>
        weak.oneHitKill[index].opponentId === opponentId &&
        weak.oneHitKill[index].chance <= strong.oneHitKill[index].chance,
    ),
  );
});

test("the same seeds give the same report", () => {
  const options = { seeds: FEW_SEEDS, percentiles: [25] };
  assert.deepEqual(
    qualifyAdventure(SHIPPED["warden-crypt"], options),
    qualifyAdventure(SHIPPED["warden-crypt"], options),
  );
});

test("a run that never ends fails qualification with a named reason", () => {
  const result = qualifyAdventure(SHIPPED["smugglers-cellar"], {
    seeds: FEW_SEEDS,
    stepLimit: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "step-limit");
  assert.match(result.failure.message, /smugglers-cellar/);
});

test("the default run qualifies every shipped module within its time budget", () => {
  const started = performance.now();
  for (const adventure of Object.values(SHIPPED)) {
    const result = qualifyAdventure(adventure);
    assert.equal(result.ok, true, adventure.id);
    assert.ok(result.report.cells.every(({ runs }) => runs === 200));
  }
  const seconds = (performance.now() - started) / 1000;
  // docs/character-rules.md records the budget: well inside verify.
  assert.ok(seconds < 30, `the default run took ${seconds.toFixed(1)} s`);
});

test("the report reads as text, and a failure names its reason", () => {
  const cellar = SHIPPED["cellar-goblin"];
  const text = renderBalanceResult(
    cellar,
    qualifyAdventure(cellar, { seeds: [0, 1], styles: ["cautious"] }),
  );
  assert.match(
    text,
    /^The Goblin in the Cellar \(cellar-goblin\)\nObjective: victory, through cellar$/mu,
  );
  assert.match(
    text,
    /Level 1, 5th percentile character\. One-hit kill: Goblin Warrior \d+\.\d%/u,
  );
  assert.match(text, /cautious: survived \d+\.\d%, completed \d+\.\d% of 2;/u);
  assert.match(text, /cellar-goblin: fought in 2, lost \d+\.\d%/u);
  assert.equal(
    renderBalanceResult(cellar, {
      ok: false,
      failure: { code: "step-limit", message: "A run never ended." },
    }),
    "The Goblin in the Cellar (cellar-goblin) fails: step-limit. A run never ended.",
  );
});

test("npm run balance qualifies the modules it is given", async () => {
  let written = "";
  const code = await main(
    [
      "--seeds",
      "3",
      "--styles",
      "direct",
      "--json",
      "adventures/5e/cellar-goblin.json",
    ],
    { write: (text) => (written += text) },
  );
  assert.equal(code, 0);
  const [result] = JSON.parse(written);
  assert.equal(result.adventureId, "cellar-goblin");
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.report.cells.map(({ percentile, style, runs }) => [
      percentile,
      style,
      runs,
    ]),
    [
      [5, "direct", 3],
      [95, "direct", 3],
    ],
  );
  assert.deepEqual(
    parseArguments(["--percentiles", "10,50"]).percentiles,
    [10, 50],
  );
  for (const bad of [
    ["--seeds", "0"],
    ["--styles", "reckless"],
    ["--fast"],
    ["--seeds"],
  ]) {
    assert.throws(() => parseArguments(bad), /Usage: npm run balance/u);
  }
});

test("the difficulty thresholds are the settled parameter table", () => {
  assert.deepEqual(DIFFICULTY_THRESHOLDS, {
    easy: { survival: 0.95, oneHitKillCap: 0.5 },
    medium: { survival: 0.85, oneHitKillCap: 0.4 },
    hard: { survival: 0.75, oneHitKillCap: 0.3 },
  });
});

const GOBLIN_PAIR = await loadFifthAdventure(
  "tests/fixtures/gate-goblin-pair.json",
);
const MINION_YARD = await loadFifthAdventure(
  "tests/fixtures/gate-minion-yard.json",
);
const declared = (adventure, difficulty) =>
  validateFifthAdventure({ ...adventure, difficulty });

test("a module too deadly for its difficulty is rejected, and passes declared one step harder", () => {
  const medium = gateAdventure(GOBLIN_PAIR);
  assert.equal(medium.ok, true);
  const { verdict } = medium;
  assert.equal(verdict.difficulty, "medium");
  assert.equal(verdict.qualified, false);
  assert.equal(verdict.survival.ok, false);
  assert.deepEqual(
    [
      verdict.survival.level,
      verdict.survival.percentile,
      verdict.survival.style,
    ],
    [2, 5, "cautious"],
  );
  assert.equal(verdict.survival.runs, 200);
  assert.ok(
    verdict.survival.rate >= 0.75 && verdict.survival.rate < 0.85,
    `survived ${verdict.survival.rate}`,
  );
  assert.equal(verdict.oneHitKill.ok, true);
  assert.equal(verdict.xp.ok, true);
  assert.match(
    renderGateResult(GOBLIN_PAIR, medium),
    /^The Goblin Pair \(goblin-pair\) does not qualify as medium\.\n {2}Too deadly, FAIL: the level 2, 5th percentile character playing cautious survived \d+\.\d% of 200 runs; medium needs 85\.0%\.$/mu,
  );

  const hard = gateAdventure(declared(GOBLIN_PAIR, "hard"));
  assert.equal(hard.verdict.qualified, true);
  assert.equal(hard.verdict.survival.rate, verdict.survival.rate);
  assert.match(
    renderGateResult(GOBLIN_PAIR, hard),
    /^The Goblin Pair \(goblin-pair\) qualifies as hard\.$/mu,
  );
});

test("a module whose ordinary enemies a strong level-1 Fighter usually one-shots is rejected, naming them", () => {
  for (const difficulty of ["easy", "medium", "hard"]) {
    const result = gateAdventure(declared(MINION_YARD, difficulty));
    const { oneHitKill } = result.verdict;
    assert.equal(result.verdict.qualified, false, difficulty);
    assert.equal(oneHitKill.ok, false, difficulty);
    assert.deepEqual([oneHitKill.level, oneHitKill.percentile], [1, 95]);
    assert.equal(
      oneHitKill.cap,
      DIFFICULTY_THRESHOLDS[difficulty].oneHitKillCap,
    );
    assert.deepEqual(oneHitKill.overCap, [
      "Goblin Minion 1",
      "Goblin Minion 2",
    ]);
    for (const { chance } of oneHitKill.enemies) {
      assert.ok(chance > 0.5, `usually one-shot: ${chance}`);
    }
  }
  const medium = gateAdventure(MINION_YARD);
  assert.equal(medium.verdict.survival.ok, true);
  assert.match(
    renderGateResult(MINION_YARD, medium),
    /^ {2}Too easy, FAIL: the level 1, 95th percentile character kills 2 of 2 ordinary enemies with one attack more than 40\.0% of the time: Goblin Minion 1 \d+\.\d%, Goblin Minion 2 \d+\.\d%\. No more than half may be\.$/mu,
  );
});

test("bosses are exempt from the one-hit-kill cap, and half the ordinary enemies may exceed it", () => {
  const withBoss = (bosses) =>
    validateFifthAdventure({
      ...MINION_YARD,
      encounters: MINION_YARD.encounters.map((encounter) => ({
        ...encounter,
        opponents: encounter.opponents.map((opponent) =>
          bosses.includes(opponent.id) ? { ...opponent, boss: true } : opponent,
        ),
      })),
    });
  const oneBoss = gateAdventure(withBoss(["gate-minion"])).verdict.oneHitKill;
  assert.deepEqual(
    oneBoss.enemies.map(({ opponentId }) => opponentId),
    ["yard-minion"],
  );
  assert.equal(oneBoss.ok, false);
  const allBosses = gateAdventure(withBoss(["gate-minion", "yard-minion"]));
  assert.deepEqual(allBosses.verdict.oneHitKill.enemies, []);
  assert.equal(allBosses.verdict.oneHitKill.ok, true);
  assert.equal(allBosses.verdict.qualified, true);
  // One minion of two over the cap is half, not most.
  const smugglers = gateAdventure(declared(SHIPPED["smugglers-cellar"], "hard"))
    .verdict.oneHitKill;
  assert.deepEqual(smugglers.overCap, ["Giant Rat"]);
  assert.equal(smugglers.enemies.length, 2);
  assert.equal(smugglers.ok, true);
});

test("a module whose XP could carry a character past its maximum level + 1 is rejected", () => {
  // Level 2 at most: from 899 XP, 100 XP reaches level 3; 1,801 more reach 4.
  const rich = (xp) =>
    validateFifthAdventure({
      ...GOBLIN_PAIR,
      difficulty: "hard",
      endings: GOBLIN_PAIR.endings.map((ending) =>
        ending.kind === "victory" ? { ...ending, xp } : ending,
      ),
    });
  const within = gateAdventure(rich(1700)).verdict.xp;
  assert.deepEqual(within, {
    ok: true,
    available: 1800,
    startXp: 899,
    endLevel: 3,
    levelLimit: 3,
  });
  const over = gateAdventure(rich(1701));
  assert.deepEqual(over.verdict.xp, {
    ok: false,
    available: 1801,
    startXp: 899,
    endLevel: 4,
    levelLimit: 3,
  });
  assert.equal(over.verdict.qualified, false);
  assert.match(
    renderGateResult(GOBLIN_PAIR, over),
    /^ {2}XP, FAIL: its 1801 XP takes a character from 899 XP to level 4; the limit is level 3\.$/mu,
  );
});

test("a module the harness can't play fails the gate with a named reason", () => {
  const result = gateAdventure(GOBLIN_PAIR, { stepLimit: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "step-limit");
  assert.equal(
    renderGateResult(GOBLIN_PAIR, result),
    `The Goblin Pair (goblin-pair) does not qualify: step-limit. ${result.failure.message}`,
  );
});

test("every shipped module qualifies at its declared difficulty", () => {
  for (const adventure of Object.values(SHIPPED)) {
    const result = gateAdventure(adventure);
    assert.ok(
      result.ok && result.verdict.qualified,
      renderGateResult(adventure, result),
    );
  }
});

test("npm run balance reports the gate and fails when a module doesn't qualify", async () => {
  let written = "";
  const write = { write: (text) => (written += text) };
  assert.equal(
    await main(
      [
        "--seeds",
        "20",
        "--styles",
        "cautious",
        "tests/fixtures/gate-goblin-pair.json",
      ],
      write,
    ),
    1,
  );
  assert.match(
    written,
    /^The Goblin Pair \(goblin-pair\) does not qualify as medium\.$/mu,
  );
  written = "";
  assert.equal(
    await main(
      ["--seeds", "20", "--json", "adventures/5e/warden-crypt.json"],
      write,
    ),
    0,
  );
  const [result] = JSON.parse(written);
  assert.equal(result.gate.ok, true);
  assert.equal(result.gate.verdict.qualified, true);
  assert.equal(result.gate.verdict.survival.runs, 20);
});

test("the browser's qualifies is the gate's verdict at the defaults", () => {
  assert.equal(qualifies(SHIPPED["warden-crypt"]), true);
  assert.equal(qualifies(GOBLIN_PAIR), false);
  assert.equal(qualifies(declared(GOBLIN_PAIR, "hard")), true);
  assert.equal(qualifies(GOBLIN_PAIR), false);
});
