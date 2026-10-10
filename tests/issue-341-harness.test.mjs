// #341: the balance harness builds level-2 and level-3 Clerics, preparing
// the spells each level adds in list order, and plays Channel Divinity by
// policy: Turn Undead whenever an undead foe is left to turn, turned foes
// attacked only once every foe is turned, Divine Spark while it leaves a
// use, and Preserve Life when low.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import { characterProfile, spellsOwed } from "../dist/character-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "cleric",
});
const cleric = (level) =>
  characterAtLevel(weakest.dice, level, undefined, false, undefined, "cleric");

/** The rat tunnels with the cellar's rat swapped for a Zombie and a Ghoul. */
const crypt = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "zombie-cellar";
  module.recommendedLevels = { min: 1, max: 3 };
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = [
    { id: "zombie", monster: "zombie", description: "A zombie." },
    { id: "ghoul", monster: "ghoul", description: "A ghoul." },
  ];
  return validateModule(module);
})();

test("the harness builds a level-2 and a level-3 Cleric with every spell prepared", () => {
  const two = cleric(2);
  assert.equal(two.level, 2);
  assert.deepEqual(spellsOwed(two), { cantrips: 0, prepared: 0 });
  assert.deepEqual(two.spells.prepared, [
    "bless",
    "cure-wounds",
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
  ]);
  const three = cleric(3);
  assert.deepEqual(spellsOwed(three), { cantrips: 0, prepared: 0 });
  // Bless and Cure Wounds are the Life Domain's: six others are chosen.
  assert.deepEqual(three.spells.prepared, [
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
    "shield-of-faith",
    "spiritual-weapon",
    "hold-person",
  ]);
  assert.equal(characterProfile(three).channelDivinity.preserveLife, 15);
});

test("a level-3 Cleric turns undead and spends Channel Divinity by policy", () => {
  const runtime = createFifthRuntime(crypt, cleric(3));
  let spent = 0;
  let runs = 0;
  for (let seed = 0; seed < 10; seed++) {
    const run = playAdventure(runtime, "cautious", seed);
    spent += run.channelDivinity;
    runs += run.channelDivinity > 0 ? 1 : 0;
  }
  // Two undead wait in the cellar: every run that reaches them turns them.
  assert.ok(runs >= 5, `${runs} of 10 runs used Channel Divinity`);
  assert.ok(spent >= runs);
});
