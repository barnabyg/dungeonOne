// #321: the balance gate's cost. A character's profile is reused while its
// sheet's fields are the same objects, and the harness projects only the
// kinds of action it plays, so it never dry-runs gear changes or trade.
import assert from "node:assert/strict";
import test from "node:test";
import { characterProfile } from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIXTURE_MODULES } from "./fixtures/modules.mjs";
import {
  ada,
  engineAction,
  playthroughStates,
  rogueAt5,
  veteran,
} from "./fixtures/playthroughs.mjs";

test("a sheet's profile follows every field it reads, even when the others are shared (#321)", () => {
  const sheet = veteran();
  const variants = [
    sheet,
    { ...sheet },
    { ...sheet, level: 1 },
    { ...sheet, abilities: { ...sheet.abilities, constitution: 18 } },
    { ...sheet, equipment: [...sheet.equipment].reverse() },
    { ...sheet, skills: [] },
    { ...sheet, fightingStyle: "great-weapon-fighting" },
    { ...sheet, weaponMasteries: [] },
    rogueAt5(),
    { ...rogueAt5(), expertise: [] },
    { ...rogueAt5(), equipment: sheet.equipment },
  ];
  // Each twice, so a cached profile is checked as well as a fresh one.
  for (const variant of [...variants, ...variants]) {
    assert.deepEqual(
      characterProfile(variant),
      characterProfile(structuredClone(variant)),
    );
  }
});

test("a projection of chosen kinds is the full projection's entries of those kinds, and dry-runs only them (#321)", () => {
  const kinds = new Set(["attack", "move", "examine", "take", "end-turn"]);
  let checked = 0;
  for (const { runtime, state } of playthroughStates()) {
    // A fresh copy, so neither projection reuses the other's cache.
    const full = runtime.projectActions({ ...state });
    const chosen = runtime.projectActions({ ...state }, kinds);
    assert.deepEqual(
      chosen,
      full.filter(({ action }) => kinds.has(action)),
    );
    // The chosen entries stand for the same engine actions.
    for (const [i, entry] of chosen.entries()) {
      assert.deepEqual(
        runtime.actionOf(entry),
        runtime.actionOf(full.filter(({ action }) => kinds.has(action))[i]),
      );
    }
    checked += 1;
  }
  assert.ok(checked > 1000, `${checked} states`);
});

test("a projection of chosen kinds dry-runs no other kind (#321)", () => {
  const kinds = new Set(["move", "examine", "attack", "end-turn"]);
  for (const adventure of FIXTURE_MODULES) {
    const dryRun = [];
    const runtime = createFifthRuntime(adventure, ada, {
      dryRun: (action) => dryRun.push(action.type),
    });
    const random = createSeededRandom(1);
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    for (let step = 0; step < 30 && state.status === "playing"; step++) {
      dryRun.length = 0;
      const chosen = runtime.projectActions({ ...state }, kinds);
      assert.equal(dryRun.length, chosen.length);
      assert.ok(
        dryRun.every((type) => kinds.has(type)),
        dryRun.join(", "),
      );
      const enabled = runtime
        .projectActions(state)
        .filter(({ available }) => available);
      const next = enabled[random.roll(enabled.length) - 1];
      state = runtime.handleAction(state, engineAction(next), random).state;
    }
  }
});
