// #343: the balance harness builds level-2 and level-3 Wizards: Scholar's
// Expertise, two spells written into the spellbook at each level (the
// highest level first), and the spells each level adds prepared. A level-3
// Wizard's cantrips play with Potent Cantrip, and the gate reports the
// Wizard at levels 2 and 3.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  gateModule,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import {
  characterProfile,
  expertiseOwed,
  spellbookOwed,
  spellsOwed,
} from "../dist/character-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "wizard",
});
const wizard = (level) =>
  characterAtLevel(weakest.dice, level, undefined, false, undefined, "wizard");

/** The rat tunnels for level 3, with two bandits in the cellar. */
const den = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "bandit-cellar";
  module.recommendedLevels = { min: 3, max: 3 };
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
  return validateModule(module);
})();

test("the harness builds a level-2 and a level-3 Wizard with every choice made", () => {
  const two = wizard(2);
  assert.equal(two.level, 2);
  assert.equal(expertiseOwed(two), 0);
  assert.equal(spellbookOwed(two), 0);
  assert.deepEqual(spellsOwed(two), { cantrips: 0, prepared: 0 });
  assert.equal(two.expertise.length, 1);
  assert.deepEqual(two.spellbook.slice(6), ["thunderwave", "ray-of-sickness"]);
  assert.equal(two.spells.prepared.length, 5);
  const three = wizard(3);
  assert.equal(three.level, 3);
  assert.equal(spellbookOwed(three), 0);
  assert.deepEqual(three.spellbook.slice(8), ["scorching-ray", "shatter"]);
  assert.equal(three.spells.prepared.length, 6);
  assert.equal(characterProfile(three).spellcasting.potentCantrip, true);
});

test("a level-3 Wizard's missed cantrips still deal half with Potent Cantrip", () => {
  const runtime = createFifthRuntime(den, wizard(3));
  let halves = 0;
  // Every result's events, as the runtime returns them.
  const watched = {
    ...runtime,
    handleAction(state, action, random) {
      const result = runtime.handleAction(state, action, random);
      halves += result.events.filter(
        (event) =>
          event.type === "attack" &&
          event.actorId === "pc" &&
          event.missHalf === true,
      ).length;
      return result;
    },
  };
  for (let seed = 0; seed < 10; seed++) {
    playAdventure(watched, "cautious", seed);
  }
  assert.ok(halves > 0, "some missed cantrip dealt half");
});

test("the gate reports the Wizard at level 3", () => {
  const gate = gateModule(den, { seeds: [0, 1] });
  const reported = gate.reported.find(({ classId }) => classId === "wizard");
  assert.deepEqual(reported.levels, [3]);
  assert.equal(reported.ok, true);
});
