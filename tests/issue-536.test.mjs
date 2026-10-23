// #536: the gate reports class parity, each caster's weakest survival
// beside the Fighter's from level 4, without judging it.
import assert from "node:assert/strict";
import test from "node:test";

import {
  gateAdventure,
  gateModule,
  moduleGateResult,
  PARITY_LEVEL,
  PARITY_POINTS,
  parityLevels,
  renderModuleGateResult,
} from "../dist/balance-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";

/** A qualified verdict for `classId` carrying `parity`, as a gate gives it. */
const verdictOf = (classId, parity) => ({
  ok: true,
  verdict: {
    adventureId: "fixture",
    classId,
    qualified: true,
    ...(parity === undefined ? {} : { parity }),
  },
});

/** One level's figures: the weakest kit on each branch. */
const at = (level, seeded, alwaysFail, casting) => ({
  level,
  seeded: { ...seeded, ...(casting === undefined ? {} : { casting }) },
  alwaysFail: { ...alwaysFail, ...(casting === undefined ? {} : { casting }) },
});

test("parity takes each level's weakest kit from level 4 on each branch", () => {
  assert.equal(PARITY_LEVEL, 4);
  assert.equal(PARITY_POINTS, 5);
  const kits = (rates) =>
    rates.map(([kit, level, rate, casting]) => ({
      kit,
      level,
      rate,
      ...(casting === undefined ? {} : { casting }),
    }));
  assert.deepEqual(
    parityLevels(
      {
        kits: kits([
          ["daggers", 3, 0.5, "conserve"],
          ["daggers", 4, 0.9, "conserve"],
          ["quarterstaff-and-dagger", 4, 0.845, "spend-early"],
          ["daggers", 5, 0.95, "conserve"],
          ["quarterstaff-and-dagger", 5, 0.97, "conserve"],
        ]),
      },
      {
        kits: kits([
          ["daggers", 3, 0.4, "conserve"],
          ["daggers", 4, 0.8, "conserve"],
          ["quarterstaff-and-dagger", 4, 0.85, "spend-early"],
          ["daggers", 5, 0.9, "conserve"],
          ["quarterstaff-and-dagger", 5, 0.9, "conserve"],
        ]),
      },
    ),
    [
      {
        level: 4,
        seeded: {
          kit: "quarterstaff-and-dagger",
          rate: 0.845,
          casting: "spend-early",
        },
        alwaysFail: { kit: "daggers", rate: 0.8, casting: "conserve" },
      },
      {
        level: 5,
        seeded: { kit: "daggers", rate: 0.95, casting: "conserve" },
        alwaysFail: { kit: "daggers", rate: 0.9, casting: "conserve" },
      },
    ],
  );
  assert.deepEqual(
    parityLevels(
      { kits: kits([["mace", 3, 1]]) },
      { kits: kits([["mace", 3, 1]]) },
    ),
    [],
  );
});

test("the module result sets each caster beside the Fighter at each level, and parity never fails the gate", () => {
  const result = moduleGateResult("fixture", [
    {
      classId: "fighter",
      result: verdictOf("fighter", [
        at(4, { kit: "mace", rate: 0.975 }, { kit: "mace", rate: 0.9 }),
        at(5, { kit: "two-daggers", rate: 0.98 }, { kit: "mace", rate: 0.93 }),
      ]),
    },
    {
      classId: "rogue",
      result: verdictOf("rogue", [
        at(
          4,
          { kit: "shortsword", rate: 0.5 },
          { kit: "shortsword", rate: 0.5 },
        ),
      ]),
    },
    {
      classId: "cleric",
      result: verdictOf("cleric", [
        at(
          4,
          { kit: "club-and-shield", rate: 0.925 },
          { kit: "club-and-shield", rate: 0.95 },
          "conserve",
        ),
        at(
          5,
          { kit: "mace-and-shield", rate: 0.93 },
          { kit: "mace-and-shield", rate: 0.88 },
          "spend-early",
        ),
      ]),
    },
    {
      classId: "wizard",
      result: verdictOf("wizard", [
        at(
          4,
          { kit: "daggers", rate: 0.845 },
          { kit: "daggers", rate: 0.8 },
          "conserve",
        ),
        at(
          5,
          { kit: "daggers", rate: 0.93 },
          { kit: "daggers", rate: 0.9 },
          "conserve",
        ),
      ]),
    },
  ]);
  // Parity is reported, not judged.
  assert.equal(result.qualified, true);
  const lines = result.parity.map(({ classId, level, seeded, alwaysFail }) => [
    classId,
    level,
    seeded.gap,
    seeded.within,
    alwaysFail.gap,
    alwaysFail.within,
  ]);
  assert.deepEqual(lines, [
    ["cleric", 4, 5, true, -5, true],
    ["cleric", 5, 5, true, 5, true],
    ["wizard", 4, 13, false, 10, false],
    ["wizard", 5, 5, true, 3, true],
  ]);
  const [, , wizard] = result.parity;
  assert.deepEqual(wizard.seeded, {
    caster: { kit: "daggers", rate: 0.845, casting: "conserve" },
    fighter: { kit: "mace", rate: 0.975 },
    gap: 13,
    within: false,
  });
  // The fake verdicts have no checks to render: the parity lines alone.
  const text = renderModuleGateResult(
    { id: "fixture", title: "The Fixture" },
    { ...result, classes: [] },
  );
  assert.match(
    text,
    /^Class parity, reported \(not judged\): the Wizard at level 4, playing cautious as the 5th percentile, survived 84\.5% \(daggers, conserve\) on seeded checks against the Fighter's 97\.5% \(mace\), 13\.0 points behind \(more than 5\); when every check fails 80\.0% \(daggers, conserve\) against 90\.0% \(mace\), 10\.0 points behind \(more than 5\)\.$/mu,
  );
  assert.match(
    text,
    /^Class parity, reported \(not judged\): the Cleric at level 4, .* when every check fails 95\.0% \(club-and-shield, conserve\) against 90\.0% \(mace\), 5\.0 points ahead\.$/mu,
  );
  assert.equal(text.match(/^Class parity/gmu).length, 4);
});

test("no parity line without a Fighter or caster to compare, or below level 4", () => {
  const fighter = {
    classId: "fighter",
    result: verdictOf("fighter", [
      at(4, { kit: "mace", rate: 1 }, { kit: "mace", rate: 1 }),
    ]),
  };
  const wizard = {
    classId: "wizard",
    result: verdictOf("wizard", [
      at(
        4,
        { kit: "daggers", rate: 1 },
        { kit: "daggers", rate: 1 },
        "conserve",
      ),
    ]),
  };
  const failed = (classId) => ({
    classId,
    result: { ok: false, failure: { code: "step-limit", message: "x" } },
  });
  for (const classes of [
    [failed("fighter"), wizard],
    [fighter, failed("wizard")],
    [
      { classId: "fighter", result: verdictOf("fighter") },
      { classId: "wizard", result: verdictOf("wizard") },
    ],
  ]) {
    const result = moduleGateResult("fixture", classes);
    assert.equal(result.parity, undefined);
  }
  assert.equal(moduleGateResult("fixture", [fighter, wizard]).parity.length, 1);
});

test("the gate reports parity from level 4 from the figures it judges", () => {
  const seeds = { seeds: [0, 1] };
  const threeToFour = {
    ...loneGoblin,
    recommendedLevels: { min: 3, max: 4 },
  };
  const wizard = gateAdventure(threeToFour, { ...seeds, classId: "wizard" });
  assert.ok(wizard.ok);
  const { survival, alwaysFail, parity } = wizard.verdict;
  assert.deepEqual(parity, parityLevels(survival, alwaysFail));
  assert.deepEqual(
    parity.map(({ level }) => level),
    [4],
  );
  assert.ok(parity[0].seeded.casting !== undefined);
  const gate = gateModule(threeToFour, seeds);
  assert.deepEqual(
    gate.parity.map(({ classId, level }) => [classId, level]),
    [
      ["cleric", 4],
      ["wizard", 4],
    ],
  );
  assert.match(
    renderModuleGateResult(threeToFour, gate),
    /^Class parity, reported \(not judged\): the Wizard at level 4, playing cautious as the 5th percentile, survived \d+\.\d% \([a-z-]+, (conserve|spend-early)\) on seeded checks against the Fighter's \d+\.\d% \([a-z-]+\), .*\.$/mu,
  );
  // A module whose levels are all below 4 reports none.
  const low = gateModule(loneGoblin, seeds);
  assert.equal(low.parity, undefined);
  for (const { result } of low.classes) {
    assert.equal(result.verdict.parity, undefined);
  }
  assert.doesNotMatch(renderModuleGateResult(loneGoblin, low), /Class parity/u);
});
