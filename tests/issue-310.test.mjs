// #310: the balance harness, gate and career simulation play both classes.
import assert from "node:assert/strict";
import test from "node:test";
import {
  characterAtLevel,
  gateAdventure,
  percentileCharacters,
  qualifyAdventure,
  strongestAttackers,
} from "../dist/balance-5e.js";
import { CLASSES } from "../dist/character-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";

const ROLLS = [
  [6, 6, 6, 1],
  [5, 5, 5, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [2, 2, 2, 1],
  [1, 1, 1, 1],
];

test("each class ranks its own creations: the Rogue's percentile characters place Dexterity first", () => {
  const fighter = percentileCharacters({ percentiles: [5, 95] });
  assert.deepEqual(
    percentileCharacters({ percentiles: [5, 95], classId: "fighter" }),
    fighter,
  );
  const rogue = percentileCharacters({
    percentiles: [5, 95],
    classId: "rogue",
  });
  assert.deepEqual(
    percentileCharacters({ percentiles: [5, 95], classId: "rogue" }),
    rogue,
  );
  for (const { dice, totalModifier } of rogue) {
    const sheet = characterAtLevel(
      dice,
      1,
      undefined,
      false,
      undefined,
      "rogue",
    );
    const { abilities } = sheet;
    assert.equal(sheet.class, "rogue");
    assert.ok(
      Object.values(abilities).every((score) => score <= abilities.dexterity),
    );
    assert.equal(
      Object.values(abilities).reduce(
        (sum, score) => sum + Math.floor((score - 10) / 2),
        0,
      ),
      totalModifier,
    );
  }
});

test("a Rogue archer is its usual Dexterity-first build", () => {
  assert.deepEqual(
    characterAtLevel(ROLLS, 2, undefined, true, undefined, "rogue"),
    characterAtLevel(ROLLS, 2, undefined, false, undefined, "rogue"),
  );
});

test("the strongest Rogue is armed with each Rogue kit and placed weapon, with no Fighting Style", () => {
  const attackers = strongestAttackers(ROLLS, 3, ["shortbow"], "rogue");
  assert.deepEqual(
    attackers.map(({ kit, gear }) => [kit, gear]),
    [
      ...CLASSES.rogue.kits.map((kit) => [kit, undefined]),
      [CLASSES.rogue.defaults.kit, "shortbow"],
    ],
  );
  for (const { sheet, fightingStyle } of attackers) {
    assert.equal(sheet.class, "rogue");
    assert.equal(fightingStyle, undefined);
  }
});

test("the harness report and the gate play the class asked for, the Fighter by default", () => {
  const options = { seeds: [0, 1], percentiles: [5], styles: ["cautious"] };
  const fighter = qualifyAdventure(loneGoblin, options);
  assert.equal(fighter.report.classId, "fighter");
  assert.deepEqual(
    qualifyAdventure(loneGoblin, { ...options, classId: "fighter" }),
    fighter,
  );
  assert.equal(
    qualifyAdventure(loneGoblin, { ...options, classId: "rogue" }).report
      .classId,
    "rogue",
  );

  const seeds = { seeds: [0, 1] };
  assert.equal(gateAdventure(loneGoblin, seeds).verdict.classId, "fighter");
  const { verdict } = gateAdventure(loneGoblin, { ...seeds, classId: "rogue" });
  assert.equal(verdict.classId, "rogue");
  assert.deepEqual(
    verdict.survival.kits.map(({ kit }) => kit),
    CLASSES.rogue.kits,
  );
  assert.ok(
    verdict.oneHitKill.enemies.every(
      ({ kit, fightingStyle }) =>
        CLASSES.rogue.kits.includes(kit) && fightingStyle === undefined,
    ),
  );
});
