// #525: the fight panel's ways to heal, with what each restores. A Life
// Cleric's healing spells heal their dice + her spellcasting modifier +
// Disciple of Life's 2 + the slot level, at each slot level she has from
// the spell's own; Preserve Life restores what it would now, up to half her
// hit points, or, while that is nothing, says its pool. The engine heals by
// the same rules, so the panel and the engine never disagree.
import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { goblinTrio } from "./fixtures/modules.mjs";
import { lifeCleric } from "./fixtures/playthroughs.mjs";

const MIRA = lifeCleric();
const runtime = createFifthRuntime(goblinTrio, MIRA);

/** The fight on `seed`, begun: Mira as the engine has her, and the panel's healing. */
function begun(seed) {
  const { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    createSeededRandom(seed),
  );
  const mira = state.encounter.combatants.find(({ id }) => id === "pc");
  return { mira, healing: runtime.projectFight(state).healing };
}

test("a Life Cleric's healing spells add Disciple of Life's 2 + the slot level at each slot", () => {
  const { mira, healing } = begun(1);
  const { modifier, slots } = mira.spellcasting;
  assert.equal(modifier, 4);
  assert.equal(slots.length, 2);
  // 2d4 (Healing Word) or 2d8 (Cure Wounds) a level, + 4 + 2 + the slot.
  assert.deepEqual(
    healing.filter(({ action }) => action === "cast"),
    [
      { id: "healing-word", slotLevel: 1, amount: "2d4 + 7", cost: "bonus" },
      { id: "healing-word", slotLevel: 2, amount: "4d4 + 8", cost: "bonus" },
      { id: "cure-wounds", slotLevel: 1, amount: "2d8 + 7", cost: "action" },
      { id: "cure-wounds", slotLevel: 2, amount: "4d8 + 8", cost: "action" },
    ].map((view) => ({ action: "cast", ...view })),
  );
});

test("Preserve Life shows what it would restore now, up to half her HP, or else its pool", () => {
  const shown = (seed) => {
    const { mira, healing } = begun(seed);
    const view = healing.find(({ action }) => action === "preserve-life");
    return { mira, amount: view.amount };
  };
  const pool = 5 * MIRA.level;
  const kinds = new Set();
  for (let seed = 0; seed < 60 && kinds.size < 2; seed++) {
    const { mira, amount } = shown(seed);
    const now = Math.min(
      pool,
      Math.max(0, Math.floor(mira.maxHp / 2) - mira.hp),
    );
    assert.equal(
      amount,
      now === 0 ? `up to ${pool} HP` : `${now} HP`,
      `seed ${seed}`,
    );
    kinds.add(now === 0);
  }
  assert.equal(kinds.size, 2, "both a hurt and an unhurt Mira were seen");
});
