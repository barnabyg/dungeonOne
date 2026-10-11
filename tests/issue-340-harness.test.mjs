// #340: the balance harness builds and plays a level-1 Wizard. It casts
// Mage Armor once, outside a fight, before its first; attacks with a
// cantrip (a ranged one in the opening volley, then a melee one) instead of
// its quarterstaff; and answers a hit with Shield. The gate judges the
// Wizard since #348.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  gateModule,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import { armorClassOf, combatant } from "../dist/encounter-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { ratTunnels } from "./fixtures/modules.mjs";

const [weakest] = percentileCharacters({
  percentiles: [5],
  classId: "wizard",
});
const wizard = (kit) =>
  characterAtLevel(weakest.dice, 1, kit, false, undefined, "wizard");

test("the harness builds a level-1 Wizard from its defaults", () => {
  const sheet = wizard();
  assert.equal(sheet.class, "wizard");
  assert.deepEqual(sheet.spells.prepared, [
    "mage-armor",
    "magic-missile",
    "shield",
    "burning-hands",
  ]);
  assert.equal(sheet.spellbook.length, 6);
  assert.deepEqual(wizard("daggers").equipment, ["dagger", "dagger"]);
});

/**
 * Plays `seed` and returns the character's casts, each with whether a fight
 * was on and its round, from the runtime's results.
 */
function castsOf(seed) {
  const runtime = createFifthRuntime(ratTunnels, wizard());
  const casts = [];
  const record = {
    ...runtime,
    handleAction(state, action, random) {
      const result = runtime.handleAction(state, action, random);
      for (const event of result.events) {
        if (event.type === "cast" && event.combatantId === "pc") {
          casts.push({
            spellId: event.spellId,
            fighting: result.state.encounter?.round,
          });
        }
      }
      return result;
    },
  };
  const run = playAdventure(record, "cautious", seed);
  return { run, casts };
}

test("a Wizard casts Mage Armor once before its first fight and attacks with cantrips", () => {
  let cantrips = 0;
  for (let seed = 0; seed < 10; seed++) {
    const { run, casts } = castsOf(seed);
    assert.equal(run.spellsCast, casts.length, `seed ${seed}`);
    // Mage Armor first, outside a fight, and only once.
    assert.deepEqual(casts[0], { spellId: "mage-armor", fighting: undefined });
    assert.equal(
      casts.filter(({ spellId }) => spellId === "mage-armor").length,
      1,
    );
    assert.equal(run.encounters.length > 0, true);
    // Its attacks are cantrips: Fire Bolt or Shocking Grasp; conserving
    // (#348), a levelled attack only once hurt (issue-348-harness tests
    // when).
    cantrips += casts.filter(({ spellId }) =>
      ["fire-bolt", "shocking-grasp"].includes(spellId),
    ).length;
    assert.ok(
      casts.every(({ spellId }) =>
        [
          "mage-armor",
          "fire-bolt",
          "shocking-grasp",
          "shield",
          "magic-missile",
          "burning-hands",
        ].includes(spellId),
      ),
      JSON.stringify(casts),
    );
  }
  assert.ok(cantrips > 0);
});

test("the gate judges the Wizard with both its kits (#348)", () => {
  const gate = gateModule(ratTunnels, { seeds: [0, 1] });
  const { result } = gate.classes.find(({ classId }) => classId === "wizard");
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.verdict.survival.kits.map(({ kit, level }) => [kit, level]),
    [
      ["quarterstaff-and-dagger", 1],
      ["daggers", 1],
    ],
  );
  assert.ok(result.verdict.spendEarly.meanSpellsCast > 0);
});

test("the harness casts Shield only when it turns the hit into a miss", () => {
  let shields = 0;
  let taken = 0;
  for (let seed = 0; seed < 10; seed++) {
    const runtime = createFifthRuntime(ratTunnels, wizard());
    const record = {
      ...runtime,
      handleAction(state, action, random) {
        const pending = state.encounter?.pendingReaction;
        if (pending !== undefined) {
          const ac = armorClassOf(combatant(state.encounter, "pc"));
          const turned =
            pending.roll.d20 < pending.weapon.criticalRange &&
            pending.roll.total < ac + 5;
          if (action.type === "cast" && action.spellId === "shield") {
            shields++;
            assert.ok(turned, `seed ${seed}: ${JSON.stringify(pending.roll)}`);
          } else if (action.type === "take-hit" && !turned) {
            taken++;
          }
        }
        return runtime.handleAction(state, action, random);
      },
    };
    playAdventure(record, "cautious", seed);
  }
  assert.ok(shields > 0);
  assert.ok(taken > 0);
});
