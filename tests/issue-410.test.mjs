// #410: keeping the gate within its time budget for a long module. A
// projection may be narrowed to the entries aimed at some targets, so the
// harness dry-runs only the move to the next room on its way. The gate's
// results are unchanged: tests/shipped-modules.test.mjs pins every shipped
// module's figures and the gate-time canary's.
import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { longWorkings } from "./fixtures/modules.mjs";
import {
  ada,
  engineAction,
  playthroughStates,
} from "./fixtures/playthroughs.mjs";

/** Whether `entry` is aimed at one of `targets`, or at nothing. */
const aimedAt = (targets) => (entry) =>
  entry.target === undefined || targets.has(entry.target.id);

test("a projection of chosen targets is the full projection's entries aimed at them or at nothing (#410)", () => {
  const kinds = new Set(["move", "sneak", "ambush", "leave", "attack"]);
  let checked = 0;
  for (const { runtime, state } of playthroughStates()) {
    // A fresh copy, so neither projection reuses the other's cache.
    const full = runtime.projectActions({ ...state });
    // The first exit's room and the room itself, if there is one.
    const targets = new Set([
      state.roomId,
      ...full
        .filter(({ action }) => action === "move")
        .slice(0, 1)
        .map(({ target }) => target.id),
    ]);
    const expected = full.filter(
      (entry) => kinds.has(entry.action) && aimedAt(targets)(entry),
    );
    const chosen = runtime.projectActions(
      { ...state },
      kinds,
      undefined,
      targets,
    );
    assert.deepEqual(chosen, expected);
    // The chosen entries stand for the same engine actions.
    for (const [i, entry] of chosen.entries()) {
      assert.deepEqual(runtime.actionOf(entry), runtime.actionOf(expected[i]));
    }
    // A state's kept full projection gives the same answer.
    runtime.projectActions(state);
    assert.deepEqual(
      runtime.projectActions(state, kinds, undefined, targets),
      expected,
    );
    checked += 1;
  }
  assert.ok(checked > 1000, `${checked} states`);
});

test("a projection of chosen targets dry-runs no entry aimed elsewhere (#410)", () => {
  const dryRun = [];
  const runtime = createFifthRuntime(longWorkings, ada, {
    dryRun: (action) => dryRun.push(action),
  });
  const random = createSeededRandom(1);
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  let narrowed = 0;
  for (let step = 0; step < 60 && state.status === "playing"; step++) {
    const moves = runtime
      .projectActions({ ...state }, new Set(["move"]))
      .map(({ target }) => target.id);
    if (moves.length > 1) {
      dryRun.length = 0;
      const chosen = runtime.projectActions(
        { ...state },
        new Set(["move"]),
        undefined,
        new Set([moves[0]]),
      );
      assert.deepEqual(
        dryRun.map(({ destinationId }) => destinationId),
        [moves[0]],
      );
      assert.equal(chosen.length, 1);
      narrowed += 1;
    }
    const enabled = runtime
      .projectActions(state)
      .filter(({ available }) => available);
    const next = enabled[random.roll(enabled.length) - 1];
    state = runtime.handleAction(state, engineAction(next), random).state;
  }
  assert.ok(narrowed > 5, `${narrowed} rooms with more than one exit`);
});
