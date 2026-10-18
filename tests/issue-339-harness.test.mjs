// #339: the balance harness builds and plays a level-1 Cleric. It heals
// with its healing spells before potions, in a fight and out of one; the
// gate judges the Cleric too since #348.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  GATE_CLASSES,
  gateModule,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { ratTunnels } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "cleric",
});
const cleric = (kit) =>
  characterAtLevel(weakest.dice, 1, kit, false, undefined, "cleric");

test("the harness builds a level-1 Cleric from its defaults", () => {
  const sheet = cleric();
  assert.equal(sheet.class, "cleric");
  assert.equal(sheet.divineOrder, "protector");
  assert.deepEqual(sheet.spells.prepared, [
    "bless",
    "cure-wounds",
    "guiding-bolt",
    "healing-word",
  ]);
  assert.equal(cleric("club-and-shield").equipment.includes("shield"), true);
});

test("a Cleric heals with its spells before it drinks a potion", () => {
  const runtime = createFifthRuntime(ratTunnels, cleric());
  let spells = 0;
  for (let seed = 0; seed < 20; seed++) {
    const run = playAdventure(runtime, "cautious", seed);
    spells += run.healing.spells;
    // A potion only once both 1st-level slots are spent on healing; Last
    // Stand's (#499) comes whenever the Cleric falls.
    if (run.healing.potions > run.healing.lastStands) {
      assert.equal(run.healing.spells, 2, `seed ${seed}`);
    }
  }
  assert.ok(spells > 0);
});

test("the gate judges the Cleric with both its kits (#348)", () => {
  assert.ok(GATE_CLASSES.includes("cleric"));
  const gate = gateModule(ratTunnels, { seeds: [0, 1] });
  const { result } = gate.classes.find(({ classId }) => classId === "cleric");
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.verdict.survival.kits.map(({ kit, level }) => [kit, level]),
    [
      ["mace-and-daggers", 1],
      ["club-and-shield", 1],
    ],
  );
});
