// #290: the career simulation plays one new character through a set of
// modules, carrying what it holds and its XP from each to the next, and
// checks that some career reaches a required level.
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CAREER_REQUIRED_LEVEL,
  renderCareerResult,
  simulateCareer,
} from "../dist/career-5e.js";
import { main, parseArguments } from "../scripts/career-5e.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  goblinBurrow,
  lintelBarrow,
  loneGoblin,
  moduleFile,
} from "./fixtures/modules.mjs";

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const fixture = (name) =>
  fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url));

/** The lintel barrow under another id, its ending giving `xp`. */
function barrowGiving(id, xp) {
  const module = moduleFile("lintel-barrow");
  module.id = id;
  module.endings.find(({ kind }) => kind === "escape-with-loot").xp = xp;
  return validateModule(module);
}

test("the required level is 4 until the level 4–5 module ships", () => {
  assert.equal(CAREER_REQUIRED_LEVEL, 4);
});

test("a career plays the modules in the browser's order, each once its level is reached, carrying its XP", () => {
  // Given in the wrong order: the burrow (levels 2–3) waits for level 2.
  const result = simulateCareer([goblinBurrow, lintelBarrow], {
    seeds: SEEDS,
    requiredLevel: 2,
  });
  const survivor = result.runs.find(({ fellIn }) => fellIn === undefined);
  assert.ok(survivor, "some career survives both");
  assert.deepEqual(
    survivor.steps.map(({ adventureId, level }) => [adventureId, level]),
    [
      ["lintel-barrow", 1],
      ["goblin-burrow", 2],
    ],
  );
  // The barrow's goblin and ending give 300 XP: level 2.
  assert.equal(survivor.steps[0].xp, 300);
  assert.equal(
    survivor.sheet.xp,
    survivor.steps.reduce((sum, { xp }) => sum + xp, 0),
  );
  assert.equal(result.ok, true);
});

test("a career carries what it holds from one module to the next", () => {
  const result = simulateCareer([lintelBarrow, goblinBurrow], {
    seeds: SEEDS,
    requiredLevel: 2,
  });
  const survivor = result.runs.find(({ fellIn }) => fellIn === undefined);
  // The torc found under the barrow's bier is still held after the burrow.
  assert.ok(
    survivor.sheet.treasure.some(
      ({ id }) => id === "lintel-barrow/silver-torc",
    ),
  );
  assert.ok(survivor.sheet.finds.includes("lintel-barrow/coin-pouch"));
});

test("a career that falls ends where it fell, with nothing more played", () => {
  const result = simulateCareer([loneGoblin, lintelBarrow], {
    seeds: Array.from({ length: 40 }, (_, seed) => seed),
    requiredLevel: 2,
  });
  const fallen = result.runs.filter(({ fellIn }) => fellIn !== undefined);
  assert.ok(fallen.length > 0, "the weakest character falls somewhere");
  for (const run of fallen) {
    const last = run.steps.at(-1);
    assert.equal(last.adventureId, run.fellIn);
    assert.equal(last.outcome, "defeat");
    assert.equal(last.xp, 0);
  }
  // Each step's survival counts only the careers that played it.
  for (const step of result.modules) {
    assert.equal(
      step.played,
      result.runs.filter((run) =>
        run.steps.some(({ adventureId }) => adventureId === step.adventureId),
      ).length,
    );
    assert.equal(
      step.fell,
      fallen.filter(({ fellIn }) => fellIn === step.adventureId).length,
    );
  }
});

test("the level-4 choice is made by the gate's policy before the next module", () => {
  const result = simulateCareer(
    [barrowGiving("first-barrow", 2650), barrowGiving("second-barrow", 250)],
    { seeds: SEEDS, requiredLevel: 4 },
  );
  const survivor = result.runs.find(({ fellIn }) => fellIn === undefined);
  assert.deepEqual(
    survivor.steps.map(({ level }) => level),
    [1, 4],
  );
  // The gate's choice: +2 Strength, and the longsword mastered.
  assert.equal(survivor.sheet.abilityScoreImprovements.length, 1);
  assert.deepEqual(survivor.sheet.abilityScoreImprovements[0], {
    strength: 2,
  });
  assert.ok(survivor.sheet.weaponMasteries.includes("longsword"));
  assert.equal(result.ok, true);
  assert.equal(result.reached > 0, true);
});

test("a set whose XP can't reach the required level fails the check", () => {
  // The lone goblin gives 50 XP: no career reaches level 2.
  const result = simulateCareer([loneGoblin], {
    seeds: SEEDS,
    requiredLevel: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reached, 0);
  assert.ok(result.runs.every(({ sheet }) => sheet.level === 1));
  assert.match(renderCareerResult(result), /FAIL/u);
});

test("a module above every career's level is reported as not played", () => {
  const result = simulateCareer([loneGoblin, goblinBurrow], {
    seeds: SEEDS,
    requiredLevel: 2,
  });
  const burrow = result.modules.find(
    ({ adventureId }) => adventureId === "goblin-burrow",
  );
  assert.equal(burrow.played, 0);
  assert.match(
    renderCareerResult(result),
    /The Goblin Burrow \(goblin-burrow, levels 2–3\): not played/u,
  );
});

test("the report names each module played, its XP and its survival", () => {
  const result = simulateCareer([lintelBarrow, goblinBurrow], {
    seeds: SEEDS,
    requiredLevel: 2,
  });
  const text = renderCareerResult(result);
  assert.match(
    text,
    /^Career of a level-1, 5th percentile Fighter with the .+ kit playing cautious over 8 seeds: \d+ of 8 careers \(\d+\.\d%\) reach level 2, the required level; pass\.$/mu,
  );
  assert.match(
    text,
    /^ {2}Step 1, The Lintel Barrow \(lintel-barrow, level 1\): played by 8 careers at level 1, survived \d+\.\d%, gained 300 XP on average(, fell \d+)?\.$/mu,
  );
  assert.match(text, /^ {2}Step 2, The Goblin Burrow \(goblin-burrow/mu);
  assert.match(text, /^ {2}Levels reached: /mu);
});

test("the career script reads its options and fails on a set that can't reach the level", async () => {
  assert.deepEqual(parseArguments([]), {
    seeds: 200,
    requiredLevel: 4,
    json: false,
    paths: [],
  });
  assert.deepEqual(
    parseArguments(["--seeds", "5", "--required-level", "2", "a.json"]),
    { seeds: 5, requiredLevel: 2, json: false, paths: ["a.json"] },
  );
  assert.throws(() => parseArguments(["--required-level", "9"]), /Usage/u);
  assert.throws(() => parseArguments(["--seeds", "0"]), /Usage/u);
  assert.throws(() => parseArguments(["--bogus"]), /Usage/u);

  const output = () => {
    const chunks = [];
    return {
      write: (chunk) => chunks.push(chunk),
      text: () => chunks.join(""),
    };
  };
  const failing = output();
  assert.equal(
    await main(
      ["--seeds", "4", "--required-level", "2", fixture("lone-goblin")],
      failing,
    ),
    1,
  );
  assert.match(failing.text(), /reach level 2, the required level; FAIL/u);

  const passing = output();
  assert.equal(
    await main(
      [
        "--seeds",
        "4",
        "--required-level",
        "2",
        "--json",
        fixture("lintel-barrow"),
      ],
      passing,
    ),
    0,
  );
  const report = JSON.parse(passing.text());
  assert.equal(report.ok, true);
  assert.equal(report.requiredLevel, 2);
  assert.equal(report.modules[0].adventureId, "lintel-barrow");
});
