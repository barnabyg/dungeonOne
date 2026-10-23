// #541: class parity is judged. At a judged level from 4, a module fails
// the gate when the weakest caster's cautious survival is more than 5
// points below the weakest Fighter's, on seeded checks or when every check
// fails (D4); the verdict names the class, level and gap.
import assert from "node:assert/strict";
import test from "node:test";

import {
  moduleGateResult,
  renderModuleGateResult,
} from "../dist/balance-5e.js";

/** A qualified verdict for `classId` with one level's figures. */
const verdictOf = (classId, level, seeded, alwaysFail = seeded) => ({
  classId,
  result: {
    ok: true,
    verdict: {
      adventureId: "fixture",
      classId,
      qualified: true,
      parity: [
        {
          level,
          seeded: { kit: "mace", rate: seeded },
          alwaysFail: { kit: "mace", rate: alwaysFail },
        },
      ],
    },
  },
});
const fighter = verdictOf("fighter", 4, 0.975);

test("a caster 6 points behind the Fighter fails the gate, naming the class, level and gap", () => {
  const result = moduleGateResult("fixture", [
    fighter,
    verdictOf("cleric", 4, 0.915),
  ]);
  assert.equal(result.qualified, false);
  assert.match(
    renderModuleGateResult(
      { id: "fixture", title: "The Fixture" },
      {
        ...result,
        classes: [],
      },
    ),
    /^Class parity, FAIL: the Cleric at level 4, .*91\.5% \(mace\) on seeded checks against the Fighter's 97\.5% \(mace\), 6\.0 points behind \(more than 5\);.* A caster may trail the Fighter by no more than 5 points\.$/mu,
  );
});

test("a caster 5 points behind passes", () => {
  const result = moduleGateResult("fixture", [
    fighter,
    verdictOf("wizard", 4, 0.925),
  ]);
  assert.equal(result.qualified, true);
  assert.match(
    renderModuleGateResult(
      { id: "fixture", title: "The Fixture" },
      {
        ...result,
        classes: [],
      },
    ),
    /^Class parity, pass: the Wizard at level 4, .*5\.0 points behind \(within 5\)/mu,
  );
});

test("a gap on the always-fail branch alone fails too", () => {
  assert.equal(
    moduleGateResult("fixture", [fighter, verdictOf("wizard", 4, 0.975, 0.9)])
      .qualified,
    false,
  );
});
