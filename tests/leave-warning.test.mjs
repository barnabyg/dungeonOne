// #475: Leave says which ending leaving now brings and, short of the
// module's objective, warns of the ending award given up.
import assert from "node:assert/strict";
import test from "node:test";
import { objectiveEnding } from "../dist/adventure-5e.js";
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
      "You have found no treasure or coin here to carry out. Leaving now gives up the 250 XP for “Out with the silver”. " +
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

test("coin brought from an earlier adventure is not loot: leaving still warns", () => {
  const runtime = createFifthRuntime(barrow, { ...ada, purse: 250 });
  const begun = play(runtime, [{ type: "begin" }]);
  const { leaving } = leaveView(runtime, begun);
  assert.equal(leaving.ending.id, "out-empty-handed");
  assert.match(
    leaving.warning,
    /^You have found no treasure or coin here to carry out\. /u,
  );
  leaveAsProjected(runtime, begun);
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
      "Objective not met: " +
      ossuary.objective +
      " Leaving now gives up the 400 XP for “" +
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
    "Objective not met: " + ossuary.objective + " " + KEPT,
  );
});

test("an escape that pays its own XP says what it earns and what it gives up", () => {
  const file = moduleFile("shifting-ossuary");
  file.endings.find(({ kind }) => kind === "victory").xp = 400;
  file.endings.find(({ kind }) => kind === "escape-without-loot").xp = 50;
  const ossuary = validateModule(file);
  const runtime = createFifthRuntime(ossuary, ada);
  const begun = play(runtime, [{ type: "begin" }]);
  const { leaving } = leaveView(runtime, begun);
  assert.equal(leaving.ending.xp, 50);
  assert.equal(
    leaving.warning,
    "Objective not met: " +
      ossuary.objective +
      " Leaving now earns 50 XP for “Out empty-handed” but gives up the " +
      "400 XP for “" +
      file.endings.find(({ kind }) => kind === "victory").title +
      "”. " +
      KEPT,
  );
});

/**
 * The barrow with a victory found in play (#607): reading the lintel and
 * leaving lays the barrow to rest, for 400 XP. With `marked`, its objective
 * names the escape with the torc.
 */
function barrowWithVictory({ marked = true, change = () => {} } = {}) {
  const file = moduleFile("lintel-barrow");
  file.flags = ["lintel-read"];
  file.rooms
    .find(({ id }) => id === "barrow-mouth")
    .features.find(({ id }) => id === "scratched-lintel").sets = "lintel-read";
  file.endings.unshift({
    id: "barrow-laid",
    kind: "victory",
    onEscapeWhen: "lintel-read",
    title: "The barrow laid to rest",
    text: "You read the old words aloud at the lintel, and the barrow is still.",
    xp: 400,
  });
  if (marked) {
    file.endings.find(({ id }) => id === "out-with-the-torc").objective = true;
  }
  change(file);
  return validateModule(file);
}

/** Into the barrow, the goblin felled, the torc taken and back out. */
const TORC_RUN = [
  { type: "begin" },
  { type: "move", destinationId: "burial-hall" },
  { type: "attack", actorId: "pc", targetId: "barrow-goblin" },
  { type: "examine", targetId: "stone-bier" },
  { type: "take", itemId: "silver-torc" },
  { type: "move", destinationId: "barrow-mouth" },
];
const TORC_DICE = () => dice(20, 1, 20, 6, 6);

test("an ending marked objective is the one Leave warns of; a victory found in play is never named (#607)", () => {
  const unmarked = createFifthRuntime(
    barrowWithVictory({ marked: false }),
    ada,
  );
  assert.match(
    leaveView(unmarked, play(unmarked, [{ type: "begin" }])).leaving.warning,
    /“The barrow laid to rest”/u,
  );
  const runtime = createFifthRuntime(barrowWithVictory(), ada);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.equal(
    leaveView(runtime, begun).leaving.warning,
    "You have found no treasure or coin here to carry out. Leaving now gives up the 250 XP for “Out with the silver”. " +
      KEPT,
  );
  leaveAsProjected(runtime, begun);
  // With the torc, the objective is met: no warning.
  const looted = play(runtime, TORC_RUN, TORC_DICE());
  assert.deepEqual(leaveView(runtime, looted).leaving, {
    ending: {
      id: "out-with-the-torc",
      kind: "escape-with-loot",
      title: "Out with the silver",
      xp: 250,
    },
  });
  // The victory found in play is still reached, without a warning.
  const read = play(runtime, [
    { type: "begin" },
    { type: "examine", targetId: "scratched-lintel" },
  ]);
  assert.deepEqual(leaveView(runtime, read).leaving, {
    ending: {
      id: "barrow-laid",
      kind: "victory",
      title: "The barrow laid to rest",
      xp: 400,
    },
  });
});

test("the validator reads one objective mark, on a victory or an escape with loot (#607)", () => {
  assert.equal(objectiveEnding(barrowWithVictory()).id, "out-with-the-torc");
  assert.equal(
    objectiveEnding(barrowWithVictory({ marked: false })).id,
    "barrow-laid",
  );
  assert.throws(
    () =>
      barrowWithVictory({
        change: (file) => (file.endings[0].objective = true),
      }),
    /more than one ending is marked objective\./u,
  );
  assert.throws(
    () =>
      barrowWithVictory({
        marked: false,
        change: (file) =>
          (file.endings.find(({ id }) => id === "out-empty-handed").objective =
            true),
      }),
    /only a victory or an escape with loot can be the objective\./u,
  );
});

// #611: an escape with loot that needs one item.

test("leaving without the item an escape with loot needs is an escape without loot, and the objective is unmet (#611)", () => {
  const file = moduleFile("lintel-barrow");
  file.endings.find(({ id }) => id === "out-with-the-torc").needsItem =
    "coin-pouch";
  const needing = validateModule(file);
  const runtime = createFifthRuntime(needing, ada);
  const looted = play(runtime, TORC_RUN, TORC_DICE());
  assert.ok(looted.inventory.includes("silver-torc"));
  assert.deepEqual(leaveView(runtime, looted).leaving, {
    ending: {
      id: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
    },
    warning:
      "Objective not met: " +
      needing.objective +
      " Leaving now gives up the 250 XP for “Out with the silver”. " +
      KEPT,
  });
  leaveAsProjected(runtime, looted);
  // With the pouch from the goblin's body, it is the escape with loot.
  const pouched = play(
    runtime,
    [
      ...TORC_RUN.slice(0, -1),
      { type: "examine", targetId: "barrow-goblin" },
      { type: "take", itemId: "coin-pouch" },
      { type: "move", destinationId: "barrow-mouth" },
    ],
    TORC_DICE(),
  );
  assert.equal(
    leaveAsProjected(runtime, pouched).endingId,
    "out-with-the-torc",
  );
});

test("the validator refuses an item an escape needs that is unknown or no loot, or on another ending (#611)", () => {
  const needing = (endingId, itemId) => () => {
    const file = moduleFile("lintel-barrow");
    file.endings.find(({ id }) => id === endingId).needsItem = itemId;
    return validateModule(file);
  };
  assert.throws(
    needing("out-with-the-torc", "nowhere"),
    /ending out-with-the-torc needs unknown item nowhere\./u,
  );
  assert.throws(
    needing("out-empty-handed", "silver-torc"),
    /only an escape with loot can have needsItem\./u,
  );
  const ossuary = moduleFile("shifting-ossuary");
  ossuary.endings.find(({ kind }) => kind === "escape-with-loot").needsItem =
    "urn-potion";
  assert.throws(
    () => validateModule(ossuary),
    /needs urn-potion, which is potion-of-healing: it must be treasure or coin\./u,
  );
});

// #610: a module's main endings share one award.

test("once one main ending's award is credited, no other main ending pays, and Leave warns of nothing (#610)", () => {
  const veteran = {
    ...ada,
    xpAwards: [...ada.xpAwards, "lintel-barrow/ending/barrow-laid"],
  };
  const runtime = createFifthRuntime(barrowWithVictory(), veteran);
  const begun = play(runtime, [{ type: "begin" }]);
  assert.equal(leaveView(runtime, begun).leaving.warning, undefined);
  const looted = play(runtime, TORC_RUN, TORC_DICE());
  assert.deepEqual(leaveView(runtime, looted).leaving, {
    ending: {
      id: "out-with-the-torc",
      kind: "escape-with-loot",
      title: "Out with the silver",
    },
  });
  const escaped = leaveAsProjected(runtime, looted);
  assert.deepEqual(
    runtime.projectSettlement(escaped).xp.map(({ id }) => id),
    ["lintel-barrow/encounter/barrow-goblin"],
  );
  // A first play is paid for the ending it reaches.
  const fresh = createFifthRuntime(barrowWithVictory(), ada);
  const first = leaveAsProjected(fresh, play(fresh, TORC_RUN, TORC_DICE()));
  assert.ok(
    fresh
      .projectSettlement(first)
      .xp.some(({ id }) => id === "lintel-barrow/ending/out-with-the-torc"),
  );
});
