// #342: the balance harness builds level-4 and level-5 Clerics, making the
// level-4 Ability Score Improvement by the gate's policy and choosing the
// cantrip and spells each level adds in list order, and the gate reports
// the Cleric at levels 4 and 5.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  percentileCharacters,
  playAdventure,
  reportClass,
} from "../dist/balance-5e.js";
import {
  characterProfile,
  pendingLevelChoice,
  spellsOwed,
} from "../dist/character-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "cleric",
});
const cleric = (level) =>
  characterAtLevel(weakest.dice, level, undefined, false, undefined, "cleric");

/** The rat tunnels for levels 4–5, with a Zombie and a Ghoul in the cellar. */
const crypt = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "zombie-cellar";
  module.recommendedLevels = { min: 4, max: 5 };
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = [
    { id: "zombie", monster: "zombie", description: "A zombie." },
    { id: "ghoul", monster: "ghoul", description: "A ghoul." },
  ];
  return validateModule(module);
})();

test("the harness builds level-4 and level-5 Clerics with every choice made", () => {
  const three = cleric(3);
  const four = cleric(4);
  assert.equal(four.level, 4);
  assert.equal(pendingLevelChoice(four), undefined);
  // The gate's improvement: Wisdom first.
  assert.equal(four.abilityScoreImprovements.length, 1);
  assert.equal(four.abilities.wisdom, three.abilities.wisdom + 2);
  assert.deepEqual(spellsOwed(four), { cantrips: 0, prepared: 0 });
  assert.deepEqual(four.spells.cantrips, [
    "sacred-flame",
    "guidance",
    "resistance",
    "thaumaturgy",
  ]);
  assert.equal(four.spells.prepared.length, 7);
  const five = cleric(5);
  assert.equal(five.level, 5);
  assert.deepEqual(spellsOwed(five), { cantrips: 0, prepared: 0 });
  assert.equal(five.spells.prepared.length, 9);
  const { channelDivinity, spellcasting } = characterProfile(five);
  assert.equal(channelDivinity.searUndead.sides, 8);
  assert.ok(channelDivinity.searUndead.dice >= 1);
  assert.deepEqual(spellcasting.slots, [4, 3, 2]);
});

test("a level-5 Cleric plays a crypt and turns its undead", () => {
  const runtime = createFifthRuntime(crypt, cleric(5));
  let runs = 0;
  for (let seed = 0; seed < 10; seed++) {
    runs +=
      playAdventure(runtime, "cautious", seed).channelDivinity > 0 ? 1 : 0;
  }
  assert.ok(runs >= 5, `${runs} of 10 runs used Channel Divinity`);
});

test("the gate reports the Cleric at levels 4 and 5", () => {
  const report = reportClass(crypt, "cleric", { seeds: [0, 1] });
  assert.equal(report.ok, true);
  assert.deepEqual(report.levels, [4, 5]);
  assert.ok(report.survival !== undefined);
});
