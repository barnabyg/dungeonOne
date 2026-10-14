// #428: card lines name opponents as the fight log does, with no article
// before the name (#323's option A), for one opponent or several.
import assert from "node:assert/strict";
import test from "node:test";

import { createFifthRuntime, renderFifthEvent } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { moduleFile } from "./fixtures/modules.mjs";

const state = {};

test("the reaction attack names a named foe without an article", () => {
  assert.equal(
    renderFifthEvent(state, {
      type: "reacted",
      encounterId: "lock-keepers",
      option: "attack",
      reactors: ["Sergeant Larrow"],
    }),
    "You attack Sergeant Larrow.",
  );
});

test("fleeing a fight leaves each foe behind by name alone", () => {
  assert.equal(
    renderFifthEvent(state, {
      type: "fled-fight",
      encounterId: "sullage",
      room: "Lock Chamber",
      to: "Pump Room",
      opponents: ["Old Sullage"],
    }),
    "You get away from the Lock Chamber into the Pump Room, leaving Old Sullage behind. The fight is unresolved: it waits there if you come back, wounds and all, and the fallen stay fallen.",
  );
});

test("turned foes and wandering comers are listed without articles", () => {
  assert.match(
    renderFifthEvent(state, {
      type: "turned-away",
      encounterId: "crypt",
      room: "Crypt",
      opponents: ["The Wolfstone Reaver", "Zombie"],
    }),
    /^You leave the Crypt with The Wolfstone Reaver and Zombie still turned\./u,
  );
  assert.equal(
    renderFifthEvent(state, {
      type: "wandering-roll",
      roll: 2,
      chance: 15,
      interrupted: true,
      opponents: ["Patrolling Bandit", "Patrol Bandit"],
    }),
    "You listen as you go: d100 2, 15 or less: Patrolling Bandit and Patrol Bandit come upon you.",
  );
});

// The expanded scope: a creature to talk to may be a surrendered or reacting
// opponent, so it is named without an article too. Doors, traps and features
// keep theirs. The rope cove's hermit is renamed Hesk; Ada has Persuasion −1
// and 12 HP.
const hesk = (retry) => {
  const module = moduleFile("rope-cove");
  const creature = module.rooms
    .flatMap(({ creatures }) => creatures ?? [])
    .find(({ id }) => id === "old-hermit");
  creature.name = "Hesk";
  const { check } = creature.topics[0];
  check.retry = retry;
  check.bands = {
    "failure-by-5": {
      text: "Hesk cuffs you.",
      effects: [
        {
          type: "damage",
          dice: 1,
          sides: 4,
          modifier: 0,
          damageType: "bludgeoning",
          defeatEndingId: "fallen-at-the-cliff",
        },
      ],
    },
  };
  const runtime = createFifthRuntime(validateModule(module), TEST_FIGHTER);
  const random = dice();
  return {
    runtime,
    begun: runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state,
  };
};
const ASK = { type: "talk", topicId: "the-burrow" };
const COST = {
  cost: {
    type: "damage",
    dice: 1,
    sides: 4,
    modifier: 0,
    damageType: "bludgeoning",
    defeatEndingId: "fallen-at-the-cliff",
  },
};

test("talk refusals and retries name the creature without an article", () => {
  const { runtime, begun } = hesk(COST);
  assert.equal(
    runtime.handleAction(begun, { ...ASK, retry: true }, dice()).rejection
      ?.reason,
    "You haven't tried asking Hesk about the burrow yet.",
  );
  // 1 − 1 = 0 against DC 14: a failure by 5 or more, and Hesk deals 3.
  const asked = runtime.handleAction(begun, ASK, dice([20, 1], [4, 3]));
  assert.equal(asked.rejection, undefined, asked.rejection?.reason);
  const text = runtime.renderResult(asked);
  assert.match(text, /^Hesk deals 3 = 3 bludgeoning; you have 9\/12 HP\.$/mu);
  assert.doesNotMatch(text, /the Hesk/iu);
  assert.equal(
    runtime.handleAction(asked.state, ASK, dice()).rejection?.reason,
    "You already asked Hesk about the burrow.",
  );
  const again = runtime.handleAction(
    asked.state,
    { ...ASK, retry: true },
    dice([4, 2], [20, 1], [4, 1]),
  );
  assert.equal(again.rejection, undefined, again.rejection?.reason);
  assert.match(
    runtime.renderResult(again),
    /^Another try at asking Hesk about the burrow \(costs 1d4 bludgeoning damage\)\.\nHesk deals 2 = 2 bludgeoning; you have 7\/12 HP\.\n/u,
  );
});

test("with nothing changed, a talk retry is refused by the creature's name alone", () => {
  const { runtime, begun } = hesk({
    after: {
      type: "discovered",
      feature: "tide-notice",
      name: "the tide notice",
    },
  });
  const asked = runtime.handleAction(begun, ASK, dice([20, 1], [4, 3])).state;
  assert.equal(
    runtime.handleAction(asked, { ...ASK, retry: true }, dice()).rejection
      ?.reason,
    "Nothing lets you try asking Hesk about the burrow again.",
  );
});
