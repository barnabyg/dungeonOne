// #344: the balance harness builds level-4 and level-5 Wizards: the Ability
// Score Improvement (+2 to Intelligence, the first ability it raises), a
// fourth cantrip, two spellbook spells at each level (3rd-level ones first
// at level 5) and the spells each level adds prepared; and the gate reports
// the Wizard at levels 4 and 5.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  gateModule,
  percentileCharacters,
} from "../dist/balance-5e.js";
import {
  characterProfile,
  pendingLevelChoice,
  spellbookOwed,
  spellsOwed,
} from "../dist/character-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "wizard",
});
const wizard = (level) =>
  characterAtLevel(weakest.dice, level, undefined, false, undefined, "wizard");

test("the harness builds a level-4 and a level-5 Wizard with every choice made", () => {
  const before = wizard(3);
  const four = wizard(4);
  assert.equal(four.level, 4);
  assert.equal(pendingLevelChoice(four), undefined);
  assert.deepEqual(four.abilityScoreImprovements, [{ intelligence: 2 }]);
  assert.equal(four.abilities.intelligence, before.abilities.intelligence + 2);
  assert.equal(spellbookOwed(four), 0);
  assert.deepEqual(spellsOwed(four), { cantrips: 0, prepared: 0 });
  assert.equal(four.spells.cantrips.length, 4);
  assert.equal(four.spellbook.length, 12);
  assert.equal(four.spells.prepared.length, 7);
  const five = wizard(5);
  assert.equal(five.level, 5);
  assert.equal(spellbookOwed(five), 0);
  assert.deepEqual(five.spellbook.slice(12), ["fireball", "lightning-bolt"]);
  assert.equal(five.spells.prepared.length, 9);
  const profile = characterProfile(five);
  assert.deepEqual(profile.spellcasting.slots, [4, 3, 2]);
  assert.equal(profile.spellcasting.memorizeSpell, true);
});

test("the gate reports the Wizard at levels 4 and 5", () => {
  const module = moduleFile("rat-tunnels");
  module.id = "deep-cellar";
  module.recommendedLevels = { min: 4, max: 5 };
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = [
    {
      id: "b1",
      monster: "bandit",
      name: "Red Bandit",
      description: "A bandit.",
    },
    {
      id: "b2",
      monster: "bandit",
      name: "Grey Bandit",
      description: "A bandit.",
    },
  ];
  const gate = gateModule(validateModule(module), { seeds: [0, 1] });
  const reported = gate.reported.find(({ classId }) => classId === "wizard");
  assert.deepEqual(reported.levels, [4, 5]);
  assert.equal(reported.ok, true);
});
