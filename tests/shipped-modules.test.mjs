// The shipped adventure modules in adventures/5e/ (#251): each loads and
// validates, and qualifies at its declared difficulty. These are the only
// checks besides each module's own content and release tests that read a
// shipped module; engine tests play the fixtures in tests/fixtures/.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  qualifyAdventure,
  renderGateResult,
} from "../dist/balance-5e.js";

const shipped = await loadBuiltInFifthAdventures();

test("the built-in modules are the eight shipped ones", () => {
  assert.deepEqual(
    shipped.map(({ id }) => id),
    [
      "abandoned-delve",
      "cellar-goblin",
      "goblin-storeroom",
      "goblin-warren",
      "robbers-barrow",
      "smugglers-cellar",
      "tinkers-toll",
      "warden-crypt",
    ],
  );
});

test("the default run qualifies every shipped module within its time budget", () => {
  // CPU time, not elapsed time: this file runs in its own process, so other
  // test files running alongside it cannot push it over the budget.
  const started = process.cpuUsage();
  for (const adventure of shipped) {
    const result = qualifyAdventure(adventure);
    assert.equal(result.ok, true, adventure.id);
    assert.ok(result.report.cells.every(({ runs }) => runs === 200));
  }
  const { user, system } = process.cpuUsage(started);
  const seconds = (user + system) / 1_000_000;
  // docs/character-rules.md records the budget: well inside verify.
  assert.ok(
    seconds < 30,
    `the default run took ${seconds.toFixed(1)} s of CPU`,
  );
});

test("every shipped module qualifies at its declared difficulty", () => {
  for (const adventure of shipped) {
    const result = gateAdventure(adventure);
    assert.ok(
      result.ok && result.verdict.qualified,
      renderGateResult(adventure, result),
    );
  }
});
