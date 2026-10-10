// #339: the balance harness builds and plays a level-1 Cleric. It heals
// with its healing spells before potions, in a fight and out of one; the
// gate reports the Cleric beside the classes it judges, never judging it,
// and only at module levels a Cleric reaches yet.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  GATE_CLASSES,
  gateModule,
  percentileCharacters,
  playAdventure,
  REPORTED_CLASSES,
  renderModuleGateResult,
} from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { goblinBand, ratTunnels } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "cleric",
});
const cleric = (kit) =>
  characterAtLevel(weakest.dice, 1, kit, false, undefined, "cleric");

test("the harness builds a level-1 Cleric from its defaults, and no higher level yet", () => {
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
  assert.throws(
    () =>
      characterAtLevel(weakest.dice, 2, undefined, false, undefined, "cleric"),
    /A Cleric reaches only level 1 yet\./u,
  );
});

test("a Cleric heals with its spells before it drinks a potion", () => {
  const runtime = createFifthRuntime(ratTunnels, cleric());
  let spells = 0;
  for (let seed = 0; seed < 20; seed++) {
    const run = playAdventure(runtime, "cautious", seed);
    spells += run.healing.spells;
    // A potion only once both 1st-level slots are spent on healing.
    if (run.healing.potions > 0) {
      assert.equal(run.healing.spells, 2, `seed ${seed}`);
    }
  }
  assert.ok(spells > 0);
});

test("the gate reports the Cleric and never judges it", () => {
  assert.deepEqual(GATE_CLASSES, ["fighter", "rogue"]);
  assert.deepEqual(REPORTED_CLASSES, ["cleric"]);
  const gate = gateModule(ratTunnels, { seeds: [0, 1] });
  assert.deepEqual(
    gate.classes.map(({ classId }) => classId),
    ["fighter", "rogue"],
  );
  const [reported] = gate.reported;
  assert.equal(reported.classId, "cleric");
  assert.equal(reported.ok, true);
  assert.deepEqual(reported.levels, [1]);
  assert.equal(reported.survival.runs, 2);
  assert.deepEqual(
    reported.survival.kits.map(({ kit }) => kit),
    ["mace-and-daggers", "club-and-shield"],
  );
  assert.match(
    renderModuleGateResult(ratTunnels, gate),
    /^The Rat Tunnels \(rat-tunnels\) for the Cleric, reported \(not judged\): the level 1, 5th percentile Cleric playing cautious survived \d+\.\d% of 2 runs with its weakest kit, [a-z-]+ \(mace-and-daggers level 1 \d+\.\d%, club-and-shield level 1 \d+\.\d%\), casting \d+\.\d healing spells a run\.$/mu,
  );
  // A module above level 1 isn't played for the Cleric yet.
  const higher = gateModule(goblinBand, { seeds: [0] });
  assert.deepEqual(higher.reported, [
    { classId: "cleric", ok: true, levels: [] },
  ]);
  assert.match(
    renderModuleGateResult(goblinBand, higher),
    /for the Cleric, not reported: the Cleric reaches only level 1 yet, and the module is for level 2\.$/mu,
  );
  // Leaving the report out changes no verdict.
  const plain = gateModule(ratTunnels, { seeds: [0, 1], reportClasses: false });
  assert.equal(plain.reported, undefined);
  assert.equal(plain.qualified, gate.qualified);
});
