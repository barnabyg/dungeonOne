// #163: a fresh creation places the highest roll on Strength and the rest in
// the documented Fighter priority order; tied rolls keep their roll order.
import assert from "node:assert/strict";
import test from "node:test";
import { defaultPlacement, keptTotal } from "../dist/character-5e.js";

/** A roll whose kept total is `total` (3–18): three dice plus a dropped 1. */
const rollOf = (total) => {
  const kept = [6, 6, 6];
  let excess = 18 - total;
  for (let index = 0; excess > 0; index = (index + 1) % 3) {
    if (kept[index] > 1) {
      kept[index]--;
      excess--;
    }
  }
  return [1, ...kept];
};

test("distinct rolls go highest first down the priority order", () => {
  const dice = [8, 16, 12, 4, 15, 10].map(rollOf);
  assert.deepEqual(dice.map(keptTotal), [8, 16, 12, 4, 15, 10]);
  assert.deepEqual(defaultPlacement(dice), {
    strength: 1, // 16
    constitution: 4, // 15
    dexterity: 2, // 12
    wisdom: 5, // 10
    charisma: 0, // 8
    intelligence: 3, // 4
  });
});

test("tied rolls keep their roll order: the earlier roll gets the higher priority", () => {
  const dice = [13, 15, 13, 15, 9, 13].map(rollOf);
  assert.deepEqual(defaultPlacement(dice), {
    strength: 1,
    constitution: 3,
    dexterity: 0,
    wisdom: 2,
    charisma: 5,
    intelligence: 4,
  });
});

test("ties count kept totals, not the dropped die", () => {
  // Both keep 12; the second dropped a higher die but is still second.
  const dice = [[1, 4, 4, 4], [3, 4, 4, 4], ...[3, 3, 3, 3].map(rollOf)];
  const placement = defaultPlacement(dice);
  assert.equal(placement.strength, 0);
  assert.equal(placement.constitution, 1);
});

test("invalid dice are refused", () => {
  assert.throws(() => defaultPlacement([[6, 6, 6, 6]]), /six rolls/);
});
