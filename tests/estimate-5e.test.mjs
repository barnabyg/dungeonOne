import assert from "node:assert/strict";
import test from "node:test";
import { DIFFICULTIES, loadFifthAdventure } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  gateVerdictAt,
  KITS,
  PLAY_STYLES,
  qualifyAdventure,
} from "../dist/balance-5e.js";
import {
  encounterModule,
  estimateEncounter,
  renderEstimate,
} from "../dist/estimate-5e.js";
import { main, parseArguments } from "../scripts/estimate-5e.mjs";
import { bestiary } from "./fixtures/bestiary.mjs";

const SEEDS = Array.from({ length: 40 }, (_, seed) => seed);
const WOLF_PAIR = await loadFifthAdventure(
  "tests/fixtures/estimate-wolf-pair.json",
);
const WOLVES = {
  monsters: [{ id: "wolf", count: 2 }],
  levels: WOLF_PAIR.recommendedLevels,
};

test("the ad-hoc estimate matches the gate's numbers for the same fight as a one-room module", () => {
  const result = estimateEncounter(bestiary, WOLVES, { seeds: SEEDS });
  assert.equal(result.ok, true);
  const { estimate } = result;
  const gate = gateAdventure(WOLF_PAIR, { seeds: SEEDS });
  assert.equal(gate.ok, true);

  // The gate's verdict at every difficulty, from the same measurements.
  for (const difficulty of DIFFICULTIES) {
    const expected = gateVerdictAt(gate.verdict, difficulty);
    const actual = estimate.gate[difficulty];
    assert.equal(actual.qualified, expected.qualified, difficulty);
    assert.deepEqual(actual.survival, expected.survival);
    assert.deepEqual(actual.xp, expected.xp);
    const chances = ({ enemies, overCap, ok, cap }) => ({
      ok,
      cap,
      enemies: enemies.map(({ chance, kit, fightingStyle }) => ({
        chance,
        kit,
        fightingStyle,
      })),
      overCap: overCap.length,
    });
    assert.deepEqual(chances(actual.oneHitKill), chances(expected.oneHitKill));
  }

  // Its own cells agree with the gate: the weakest character's cautious
  // survival with each kit at each level...
  for (const { kit, level, rate } of gate.verdict.survival.kits) {
    const cell = estimate.cells.find(
      (entry) =>
        entry.level === level &&
        entry.percentile === 5 &&
        entry.kit === kit &&
        entry.style === "cautious",
    );
    assert.equal(cell.survivalRate, rate, `${kit} level ${level}`);
  }
  // ...the strongest character's one-hit-kill chances at the top level...
  const top = estimate.oneHitKill.find(
    ({ level, percentile }) => level === 3 && percentile === 95,
  );
  assert.deepEqual(
    top.monsters.map(({ monsterId, chance }) => [monsterId, chance]),
    [["wolf", gate.verdict.oneHitKill.enemies[0].chance]],
  );
  assert.equal(
    gate.verdict.oneHitKill.enemies[1].chance,
    gate.verdict.oneHitKill.enemies[0].chance,
  );
  // ...and the harness's report on the module, which plays the default kit.
  const report = qualifyAdventure(WOLF_PAIR, { seeds: SEEDS });
  assert.equal(report.ok, true);
  for (const cell of report.report.cells) {
    const mine = estimate.cells.find(
      (entry) =>
        entry.level === cell.level &&
        entry.percentile === cell.percentile &&
        entry.kit === "mace" &&
        entry.style === cell.style,
    );
    const [fight] = cell.encounters;
    assert.deepEqual(
      [mine.runs, mine.survivalRate, mine.meanHpLost, mine.meanRounds],
      [cell.runs, cell.survivalRate, fight.meanHpLost, fight.meanRounds],
    );
  }
});

test("an estimate plays every level, character, kit and style", () => {
  const result = estimateEncounter(
    bestiary,
    {
      monsters: [{ id: "goblin-minion", count: 1 }],
      levels: { min: 1, max: 2 },
    },
    { seeds: [0, 1], percentiles: [5, 50, 95] },
  );
  assert.equal(result.ok, true);
  assert.equal(
    result.estimate.cells.length,
    2 * 3 * KITS.length * PLAY_STYLES.length,
  );
  assert.deepEqual(
    result.estimate.oneHitKill.map(({ level, percentile }) => [
      level,
      percentile,
    ]),
    [
      [1, 5],
      [1, 50],
      [1, 95],
      [2, 5],
      [2, 50],
      [2, 95],
    ],
  );
  for (const { monsters } of result.estimate.oneHitKill) {
    const [minion] = monsters;
    assert.deepEqual(
      minion.overCaps,
      DIFFICULTIES.filter(
        (difficulty) =>
          minion.chance > result.estimate.gate[difficulty].oneHitKill.cap,
      ),
    );
  }
});

test("an encounter becomes a valid one-room module of the monsters, each counted", () => {
  const module = encounterModule(bestiary, {
    monsters: [
      { id: "goblin-minion", count: 2 },
      { id: "goblin-boss", count: 1 },
    ],
    levels: { min: 2, max: 3 },
  });
  assert.equal(module.rooms.length, 1);
  assert.equal(module.passages.length, 0);
  assert.deepEqual(module.recommendedLevels, { min: 2, max: 3 });
  const [encounter] = module.encounters;
  assert.equal(module.rooms[0].encounterId, encounter.id);
  assert.deepEqual(
    encounter.opponents.map(({ name }) => name),
    ["Goblin Minion 1", "Goblin Minion 2", "Goblin Boss"],
  );
  assert.equal(
    encounter.opponents[2].statBlock,
    bestiary.monsters.find(({ id }) => id === "goblin-boss").statBlock,
  );
});

test("an unknown bestiary id fails with a named reason", () => {
  const result = estimateEncounter(bestiary, {
    monsters: [
      { id: "wolf", count: 1 },
      { id: "owlbear", count: 1 },
    ],
    levels: { min: 1, max: 1 },
  });
  assert.deepEqual(result, {
    ok: false,
    failure: {
      code: "unknown-monster",
      message: "owlbear is not a monster in the bestiary.",
    },
  });
});

test("a monster the harness can't simulate fails with a named reason", () => {
  const wolf = bestiary.monsters.find(({ id }) => id === "wolf");
  const troll = {
    ...wolf,
    id: "troll",
    statBlock: { ...wolf.statBlock, name: "Troll", traits: ["Regeneration"] },
  };
  const result = estimateEncounter(
    { ...bestiary, monsters: [...bestiary.monsters, troll] },
    { monsters: [{ id: "troll", count: 1 }], levels: { min: 1, max: 1 } },
    { seeds: [0] },
  );
  assert.deepEqual(result, {
    ok: false,
    failure: {
      code: "unsimulated-trait",
      message:
        "troll (Troll) has Regeneration, which the encounter engine does not simulate.",
    },
  });
});

test("an encounter must name 1 to 8 monsters and levels from 1 to 4", () => {
  for (const [spec, problem] of [
    [{ monsters: [], levels: { min: 1, max: 1 } }, /at least one monster/u],
    [
      { monsters: [{ id: "wolf", count: 0 }], levels: { min: 1, max: 1 } },
      /count of wolf must be a whole number from 1 to 8/u,
    ],
    [
      {
        monsters: [
          { id: "wolf", count: 5 },
          { id: "bandit", count: 4 },
        ],
        levels: { min: 1, max: 1 },
      },
      /at most 8 monsters/u,
    ],
    [
      {
        monsters: [
          { id: "wolf", count: 1 },
          { id: "wolf", count: 1 },
        ],
        levels: { min: 1, max: 1 },
      },
      /wolf is listed twice/u,
    ],
    [
      { monsters: [{ id: "wolf", count: 1 }], levels: { min: 2, max: 1 } },
      /levels must run from 1 to 4/u,
    ],
    [
      { monsters: [{ id: "wolf", count: 1 }], levels: { min: 1, max: 5 } },
      /levels must run from 1 to 4/u,
    ],
  ]) {
    assert.throws(() => estimateEncounter(bestiary, spec), problem);
  }
});

test("the estimate renders per level, character and kit, and the gate per difficulty", () => {
  const result = estimateEncounter(bestiary, WOLVES, {
    seeds: [0, 1, 2],
    styles: ["cautious"],
  });
  const text = renderEstimate(result);
  assert.match(text, /^Wolf ×2 at levels 2–3, 3 runs a cell\.$/mu);
  assert.match(
    text,
    /^Level 2, 5th percentile character\. One-hit kill \(best kit and Fighting Style\): Wolf \d+\.\d% \((over the [a-z, and]+ caps?|under every cap)\)$/mu,
  );
  assert.match(
    text,
    /^ {2}mace, cautious: survived \d+\.\d%, \d+\.\d HP lost, \d+\.\d rounds$/mu,
  );
  for (const difficulty of DIFFICULTIES) {
    assert.match(
      text,
      new RegExp(
        `^Wolf ×2 \\(encounter-estimate\\) (qualifies|does not qualify) as ${difficulty}\\.$`,
        "mu",
      ),
    );
  }
  assert.equal(
    renderEstimate({
      ok: false,
      failure: {
        code: "unknown-monster",
        message: "owlbear is not a monster in the bestiary.",
      },
    }),
    "The encounter can't be estimated: unknown-monster. owlbear is not a monster in the bestiary.",
  );
});

test("npm run estimate takes bestiary ids with counts, levels and the harness parameters", async () => {
  assert.deepEqual(
    parseArguments([
      "--levels",
      "2-3",
      "--seeds",
      "5",
      "--percentiles",
      "10,90",
      "--styles",
      "direct",
      "wolf:2",
      "bandit",
    ]),
    {
      monsters: [
        { id: "wolf", count: 2 },
        { id: "bandit", count: 1 },
      ],
      levels: { min: 2, max: 3 },
      seeds: 5,
      percentiles: [10, 90],
      styles: ["direct"],
      bestiary: undefined,
      json: false,
    },
  );
  assert.deepEqual(parseArguments(["--levels", "2", "wolf"]).levels, {
    min: 2,
    max: 2,
  });
  for (const bad of [
    [],
    ["--levels", "a-b", "wolf"],
    ["--seeds", "0", "wolf"],
    ["--styles", "reckless", "wolf"],
    ["wolf:x"],
    ["wolf:"],
    ["--fast", "wolf"],
  ]) {
    assert.throws(() => parseArguments(bad), /Usage: npm run estimate/u);
  }

  let written = "";
  const write = { write: (text) => (written += text) };
  assert.equal(
    await main(
      [
        "--levels",
        "2",
        "--seeds",
        "2",
        "--styles",
        "cautious",
        "--json",
        "wolf:2",
      ],
      write,
    ),
    0,
  );
  const parsed = JSON.parse(written);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.estimate.cells.length, 2 * KITS.length);

  written = "";
  assert.equal(await main(["--seeds", "2", "owlbear"], write), 1);
  assert.equal(
    written,
    "The encounter can't be estimated: unknown-monster. owlbear is not a monster in the bestiary.\n",
  );

  written = "";
  assert.equal(
    await main(
      [
        "--levels",
        "1",
        "--seeds",
        "1",
        "--styles",
        "direct",
        "--bestiary",
        "adventures/5e/bestiary.json",
        "bandit",
      ],
      write,
    ),
    0,
  );
  assert.match(written, /^Bandit at level 1, 1 run a cell\.$/mu);
});
