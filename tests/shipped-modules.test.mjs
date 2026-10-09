// The shipped adventure modules in adventures/5e/ (#251): each loads and
// validates, names its monsters from the bestiary, fits its treasure budget,
// qualifies at its declared difficulty for every class (#310), and takes its
// place in the browser's adventure list; and a new character's career
// through them reaches the required level in every class (#290, #310). Besides each released module's own content and release
// tests, these are the only tests that read a shipped module; engine tests
// play the fixtures in tests/fixtures/.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DIFFICULTIES,
  FIFTH_ADVENTURE_FILES,
  findableValue,
  loadBuiltInFifthAdventures,
  orderFifthAdventures,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  DIFFICULTY_THRESHOLDS,
  GATE_CLASSES,
  gateModule,
  gateVerdictAt,
  passesGate,
  qualifyAdventure,
  renderGateResult,
  renderModuleGateResult,
} from "../dist/balance-5e.js";
import {
  CAREER_REQUIRED_LEVEL,
  renderCareerResult,
  simulateCareer,
} from "../dist/career-5e.js";
import { CLASSES } from "../dist/character-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { referenceCpuSeconds } from "./fixtures/cpu-reference.mjs";

const shipped = await loadBuiltInFifthAdventures();
const moduleFiles = Object.fromEntries(
  await Promise.all(
    Object.entries(FIFTH_ADVENTURE_FILES).map(async ([id, file]) => [
      id,
      JSON.parse(
        await readFile(new URL(`../adventures/5e/${file}`, import.meta.url)),
      ),
    ]),
  ),
);
/** The least survival margin over its difficulty's threshold a module keeps (#252). */
const SURVIVAL_SLACK = 0.03;
const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);
const opponents = (module) =>
  module.encounters.flatMap((encounter) => encounter.opponents);

test("the built-in modules are the shipped ones (#252, #275, #289, #291, #311)", () => {
  assert.deepEqual(
    shipped.map(({ id }) => id),
    [
      "abandoned-delve",
      "drowned-chapel",
      "goblin-warren",
      "gravediggers-lodge",
      "mallow-counting-house",
      "ravagers-tower",
      "robbers-barrow",
      "shepherds-bothy",
      "silvervein-mine",
      "smugglers-cellar",
      "thornwood-lodge",
      "tinkers-toll",
      "warden-crypt",
      "wolfstone-hillfort",
    ],
  );
});

test("the default run qualifies every shipped module for every class within its time budget (#310)", () => {
  // CPU time scaled to the reference machine (cpu-reference.mjs): runners
  // differ in speed by nearly 2×, so plain CPU seconds judge the runner.
  const seconds = referenceCpuSeconds(() => {
    for (const adventure of shipped) {
      for (const classId of GATE_CLASSES) {
        const result = qualifyAdventure(adventure, { classId });
        assert.equal(result.ok, true, `${adventure.id} ${classId}`);
        assert.equal(result.report.classId, classId);
        assert.ok(result.report.cells.every(({ runs }) => runs === 200));
      }
    }
  });
  // docs/character-rules.md records the budget: 90 s for both classes
  // since #321 (150 s from #310, 45 s for the Fighter alone before it).
  assert.ok(
    seconds < 90,
    `the default run took ${seconds.toFixed(1)} s of reference CPU`,
  );
});

test("every shipped module qualifies at its declared difficulty for every class (#310)", () => {
  assert.deepEqual(GATE_CLASSES, ["fighter", "rogue"]);
  // passesGate keeps its verdicts, so the adventure list below reuses them.
  for (const adventure of shipped) {
    if (!passesGate(adventure)) {
      assert.fail(renderModuleGateResult(adventure, gateModule(adventure)));
    }
  }
});

test("a new character's career through the shipped modules reaches the required level in every class (#290, #310)", () => {
  for (const classId of GATE_CLASSES) {
    const report = simulateCareer(shipped, { classId });
    assert.equal(report.classId, classId);
    assert.equal(report.requiredLevel, CAREER_REQUIRED_LEVEL);
    assert.equal(report.ok, true, renderCareerResult(report));
    // Every shipped module is played by some career.
    assert.ok(
      report.modules.every(({ played }) => played > 0),
      renderCareerResult(report),
    );
  }
});

/** Each shipped module's full gate result for every class, reports included. */
const gates = new Map();
const gateOf = (adventure) => {
  if (!gates.has(adventure.id)) {
    gates.set(adventure.id, gateModule(adventure));
  }
  return gates.get(adventure.id);
};

test("every shipped module declares the strictest difficulty every class passes with 3 points of slack (#252, #310)", () => {
  // Survival must clear the threshold by at least 3 points for every class,
  // and no stricter difficulty may also pass with that slack: the label is
  // what the weakest class measures.
  for (const adventure of shipped) {
    const verdicts = gateOf(adventure).classes.map(({ classId, result }) => {
      assert.equal(result.ok, true, `${adventure.id} ${classId}`);
      return result.verdict;
    });
    const passes = (difficulty) =>
      verdicts.every((measures) => {
        const verdict = gateVerdictAt(measures, difficulty);
        return (
          verdict.qualified &&
          verdict.survival.rate - DIFFICULTY_THRESHOLDS[difficulty].survival >=
            SURVIVAL_SLACK
        );
      });
    assert.equal(
      DIFFICULTIES.find(passes),
      adventure.difficulty,
      `${adventure.id} survives ${verdicts
        .map(({ classId, survival }) => `${survival.rate} (${classId})`)
        .join(", ")}`,
    );
  }
});

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

test("the gate names both classes and reports the stealth-first style for every shipped module (#302, #310)", () => {
  for (const adventure of shipped) {
    const gate = gateOf(adventure);
    assert.deepEqual(
      gate.classes.map(({ classId }) => classId),
      GATE_CLASSES,
    );
    const text = renderModuleGateResult(adventure, gate);
    for (const { classId, result } of gate.classes) {
      const { name } = CLASSES[classId];
      assert.match(
        text,
        new RegExp(
          `^${literal(`${adventure.title} (${adventure.id}) qualifies as ${adventure.difficulty} for the ${name}.`)}$`,
          "mu",
        ),
      );
      const { stealthFirst } = result.verdict;
      assert.equal(stealthFirst.style, "stealth-first", adventure.id);
      assert.equal(stealthFirst.runs, 200, adventure.id);
      assert.match(
        renderGateResult(adventure, result),
        new RegExp(
          `^ {2}Stealth-first, reported \\(not judged\\): the level \\d, 5th percentile ${name} playing stealth-first survived \\d+\\.\\d% of 200 runs .*; over every kit and level it completed \\d+\\.\\d%, slipped past \\d+\\.\\d fights and earned \\d+\\.\\d XP a run\\.$`,
          "mu",
        ),
        adventure.id,
      );
    }
  }
});

test("every shipped opponent names its bestiary monster instead of an inline stat block (#231)", () => {
  for (const [id, module] of Object.entries(moduleFiles)) {
    for (const opponent of opponents(module)) {
      assert.equal("statBlock" in opponent, false, `${id} ${opponent.id}`);
      assert.ok(monster(opponent.monster), `${id} ${opponent.id}`);
    }
  }
  // Moving to the bestiary changed nothing: each module plays exactly as it
  // did with every stat block inline.
  for (const adventure of shipped) {
    const inline = structuredClone(moduleFiles[adventure.id]);
    for (const opponent of opponents(inline)) {
      const { statBlock, description } = monster(opponent.monster);
      opponent.name ??= statBlock.name;
      opponent.description ??= description;
      opponent.statBlock = structuredClone(statBlock);
      delete opponent.monster;
    }
    assert.deepEqual(
      validateFifthAdventure(inline, { ...bestiary, monsters: [] }),
      adventure,
      adventure.id,
    );
  }
});

test("every shipped module's treasure fits its budget (#239)", () => {
  for (const module of shipped) {
    const budget = treasureBudget(module.recommendedLevels.max);
    assert.ok(
      findableValue(module) <= budget,
      `${module.id} is worth ${findableValue(module)} cp, over ${budget}`,
    );
  }
});

test("each module designed against the budget holds 75–100% of it as a mixed hoard (#252)", () => {
  // The Delve and the Mine keep their shipped treasure; the others were
  // designed against the budget with more than one class of gem or art object.
  for (const id of [
    "drowned-chapel",
    "goblin-warren",
    "gravediggers-lodge",
    "mallow-counting-house",
    "ravagers-tower",
    "robbers-barrow",
    "shepherds-bothy",
    "smugglers-cellar",
    "thornwood-lodge",
    "tinkers-toll",
    "warden-crypt",
    "wolfstone-hillfort",
  ]) {
    const module = shipped.find((adventure) => adventure.id === id);
    const budget = treasureBudget(module.recommendedLevels.max);
    const value = findableValue(module);
    assert.ok(
      value >= budget * 0.75 && value <= budget,
      `${id} is worth ${value} cp of ${budget}`,
    );
    const classes = new Set(
      module.rooms.flatMap(({ items }) =>
        items.flatMap(({ treasure }) =>
          treasure === undefined ? [] : [treasure],
        ),
      ),
    );
    assert.ok(classes.size >= 2, `${id} holds ${[...classes].join(", ")}`);
  }
});

test("only bestiary monsters with a treasure type carry loot in the shipped modules (#240)", () => {
  // Undead and beasts carry none: the Delve's purse and goblet and the
  // Warren's potion lie in the room, and the Toll's tolls are in the strongbox.
  const carriers = shipped.flatMap((adventure) =>
    adventure.rooms.flatMap(({ items }) =>
      items.flatMap(({ id, hiddenIn }) =>
        adventure.encounters.some(({ opponents }) =>
          opponents.some((opponent) => opponent.id === hiddenIn),
        )
          ? [`${adventure.id}/${id}@${hiddenIn}`]
          : [],
      ),
    ),
  );
  assert.deepEqual(carriers.sort(), [
    "goblin-warren/boss-chain@goblin-boss",
    "gravediggers-lodge/false-gravedigger-coins@false-gravedigger",
    "mallow-counting-house/clerk-eater-coins@clerk-eater",
    "mallow-counting-house/clerk-eater-trinket@clerk-eater",
    "mallow-counting-house/soot-goblin-coins@soot-goblin",
    "mallow-counting-house/strongroom-key@clerk-eater",
    "ravagers-tower/tower-gnoll-coins@tower-gnoll",
    "robbers-barrow/barrow-robber-coins@barrow-robber",
    "shepherds-bothy/bothy-bandit-coins@bothy-bandit",
    "silvervein-mine/bugbear-overseer-coins@bugbear-overseer",
    "silvervein-mine/bugbear-overseer-trinket@bugbear-overseer",
    "silvervein-mine/iron-key@kobold-tunneller",
    "silvervein-mine/kobold-lookout-coins@kobold-lookout",
    "silvervein-mine/kobold-tunneller-coins@kobold-tunneller",
    "thornwood-lodge/captain-hesk-coins@captain-hesk",
    "wolfstone-hillfort/wolfstone-reaver-coins@wolfstone-reaver",
  ]);
});

test("the browser offers the shipped modules by level, then difficulty (#165)", () => {
  assert.deepEqual(
    orderFifthAdventures(shipped, passesGate).map(
      ({ id, recommendedLevels: { min, max }, difficulty }) => [
        id,
        `${min}–${max}`,
        difficulty,
      ],
    ),
    [
      ["robbers-barrow", "1–1", "medium"],
      ["smugglers-cellar", "1–1", "hard"],
      ["tinkers-toll", "1–1", "hard"],
      ["shepherds-bothy", "2–2", "easy"],
      ["abandoned-delve", "2–2", "medium"],
      ["warden-crypt", "2–2", "medium"],
      ["gravediggers-lodge", "2–2", "hard"],
      ["silvervein-mine", "2–3", "medium"],
      ["drowned-chapel", "3–3", "easy"],
      ["goblin-warren", "3–3", "medium"],
      ["ravagers-tower", "3–3", "hard"],
      ["mallow-counting-house", "3–4", "hard"],
      ["wolfstone-hillfort", "3–4", "hard"],
      ["thornwood-lodge", "4–5", "hard"],
    ],
  );
});
