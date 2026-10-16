// #475: Leave says which ending leaving now brings and, short of the
// module's objective, warns of the ending award given up.
import assert from "node:assert/strict";
import test from "node:test";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { lintelBarrow as barrow, moduleFile } from "./fixtures/modules.mjs";
import { ada } from "./fixtures/playthroughs.mjs";

/** Returns queued values in order. */
function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

/** Plays `actions` in order, each accepted; returns the final state. */
function play(runtime, actions, random) {
  let state = runtime.createSession();
  for (const action of actions) {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

const leaveView = (runtime, state) =>
  runtime.projectActions(state).find(({ action }) => action === "leave");

/** Leaves, and checks the ending reached is the one the view named. */
function leaveAsProjected(runtime, state) {
  const { leaving, target } = leaveView(runtime, state);
  const result = runtime.handleAction(state, {
    type: "leave",
    roomId: target.id,
  });
  assert.equal(result.state.status, "escaped");
  assert.equal(result.state.endingId, leaving.ending.id);
  return result.state;
}

const KEPT = "You keep the XP for any fights you have won.";

test("leaving the barrow empty-handed warns of the loot ending's award, and settles the ending it named", () => {
  const runtime = createFifthRuntime(barrow, ada);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.deepEqual(leaveView(runtime, begun).leaving, {
    ending: {
      id: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
    },
    warning:
      "You have no treasure or coin to carry out. Leaving now earns no " +
      "ending award, not the 250 XP for “Out with the silver”. " +
      KEPT,
  });
  leaveAsProjected(runtime, begun);
});

test("leaving the barrow with the torc meets the objective: its ending and award, no warning", () => {
  const runtime = createFifthRuntime(barrow, ada);
  // Ada wins initiative and fells the goblin with one critical hit.
  const looted = play(
    runtime,
    [
      { type: "begin" },
      { type: "move", destinationId: "burial-hall" },
      { type: "attack", actorId: "pc", targetId: "barrow-goblin" },
      { type: "examine", targetId: "stone-bier" },
      { type: "take", itemId: "silver-torc" },
      { type: "move", destinationId: "barrow-mouth" },
    ],
    dice(20, 1, 20, 6, 6),
  );
  assert.deepEqual(leaveView(runtime, looted).leaving, {
    ending: {
      id: "out-with-the-torc",
      kind: "escape-with-loot",
      title: "Out with the silver",
      xp: 250,
    },
  });
  leaveAsProjected(runtime, looted);
});

test("once the loot ending's award is credited, leaving without loot warns of nothing and names no award", () => {
  const veteran = {
    ...ada,
    xpAwards: [...ada.xpAwards, "lintel-barrow/ending/out-with-the-torc"],
  };
  const runtime = createFifthRuntime(barrow, veteran);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.deepEqual(leaveView(runtime, begun).leaving, {
    ending: {
      id: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
    },
  });
});

test("a module with a victory warns that leaving falls short of its objective, with or without loot", () => {
  const file = moduleFile("shifting-ossuary");
  file.endings.find(({ kind }) => kind === "victory").xp = 400;
  const ossuary = validateModule(file);
  const runtime = createFifthRuntime(ossuary, ada);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.deepEqual(leaveView(runtime, begun).leaving, {
    ending: {
      id: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
    },
    warning:
      "You haven't met the objective: " +
      ossuary.objective +
      " Leaving now earns no ending award, not the 400 XP for “" +
      file.endings.find(({ kind }) => kind === "victory").title +
      "”. " +
      KEPT,
  });
  leaveAsProjected(runtime, begun);
});

test("a victory without an award warns only that the objective is unmet", () => {
  const ossuary = validateModule(moduleFile("shifting-ossuary"));
  const runtime = createFifthRuntime(ossuary, ada);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.equal(
    leaveView(runtime, begun).leaving.warning,
    "You haven't met the objective: " + ossuary.objective + " " + KEPT,
  );
});
