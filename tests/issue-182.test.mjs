// #182: the action projection is computed once per state and feeds the action
// bar, the room options, the attack targets and the AI DM's tools; and it
// rests on the engine refusing every action before it draws a die.
import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIXTURE_MODULES as adventures } from "./fixtures/modules.mjs";
import {
  ada as sheet,
  engineAction,
  playthroughStates,
} from "./fixtures/playthroughs.mjs";

/** Dice that count how many they have drawn. */
function countingDice(seed) {
  const random = createSeededRandom(seed);
  const dice = {
    drawn: 0,
    roll(sides) {
      dice.drawn += 1;
      return random.roll(sides);
    },
  };
  return dice;
}

test("one tool listing dry-runs each projected action once, and the bar, room and targets reuse it (#182)", () => {
  // Kinds of state checked: in a fight (End turn is offered) and out of one.
  const checked = { fighting: 0, exploring: 0 };
  for (const adventure of adventures) {
    let dryRuns = 0;
    const runtime = createFifthRuntime(adventure, sheet, {
      dryRun: () => {
        dryRuns += 1;
      },
    });
    const random = createSeededRandom(3);
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    for (let step = 0; step < 30 && state.status === "playing"; step++) {
      // A fresh copy, in case an action handed back a state already seen.
      state = { ...state };
      dryRuns = 0;
      runtime.getGameToolDefinitions(state);
      const listing = dryRuns;
      const actions = runtime.projectActions(state);
      assert.equal(
        listing,
        actions.length,
        "one tool listing dry-runs each projected action exactly once",
      );
      runtime.projectRoom(state);
      runtime.attackTargets(state);
      runtime.projectFight(state);
      runtime.getGameToolDefinitions(state);
      assert.equal(dryRuns, listing, "the same state is projected only once");
      const fighting = actions.some(({ action }) => action === "end-turn");
      checked[fighting ? "fighting" : "exploring"] += 1;
      const enabled = actions.filter(({ available }) => available);
      const chosen = enabled[random.roll(enabled.length) - 1];
      state = runtime.handleAction(state, engineAction(chosen), random).state;
    }
  }
  // Each module is checked at least as far as its first state, and the walks
  // reach both fights and exploring.
  assert.ok(
    checked.fighting + checked.exploring >= adventures.length,
    JSON.stringify(checked),
  );
  assert.ok(checked.fighting > 0, JSON.stringify(checked));
  assert.ok(checked.exploring > 0, JSON.stringify(checked));
});

test("no action is refused after it draws a die, in any state of the #156 playthroughs (#182)", () => {
  const refused = new Set();
  for (const { runtime, state, seed } of playthroughStates()) {
    for (const shown of runtime.projectActions(state)) {
      // The action tried is the one the bar's projection dry-ran.
      assert.deepEqual(
        engineAction(shown),
        runtime.actionOf(shown),
        JSON.stringify(shown),
      );
      const dice = countingDice(seed);
      const result = runtime.handleAction(state, engineAction(shown), dice);
      if (result.rejection !== undefined) {
        refused.add(shown.action);
        assert.equal(
          dice.drawn,
          0,
          `${JSON.stringify(shown)} was refused after drawing ${dice.drawn} dice: ${result.rejection.reason}`,
        );
      }
    }
  }
  // Refusals of actions that roll when accepted, in a fight and out of one.
  for (const kind of [
    "attack",
    "second-wind",
    "force",
    "pick",
    "break",
    "search",
    "talk",
  ]) {
    assert.ok(refused.has(kind), `the playthroughs refuse a ${kind}`);
  }
});
