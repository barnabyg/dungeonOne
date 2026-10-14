// #428: card lines name opponents as the fight log does, with no article
// before the name (#323's option A), for one opponent and several alike.
import assert from "node:assert/strict";
import test from "node:test";

import { renderFifthEvent } from "../dist/runtime-5e.js";

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
