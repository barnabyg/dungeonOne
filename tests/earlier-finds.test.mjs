// A find from an earlier visit: treasure, coin and gear are found once per
// character, so a find in the sheet's ledger is not there on a later visit.
// The feature's words still describe it ("A purse lies in the mud behind
// it."), so examining the feature says the find is gone and why. The same
// holds for a find a check's band would reveal. A fresh character is told
// nothing of the sort.
import assert from "node:assert/strict";
import test from "node:test";

import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { goblinYard, gradedCellar } from "./fixtures/modules.mjs";

const EXAMINE = (targetId) => ({ type: "examine", targetId });

/** Ada, having carried off `finds` on an earlier visit. */
const returning = (...finds) => ({
  ...TEST_FIGHTER,
  finds: [...TEST_FIGHTER.finds, ...finds],
});

function examined(runtime, state, targetId, ...rolls) {
  const result = runtime.handleAction(
    state,
    EXAMINE(targetId),
    uncheckedDice(...rolls),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

const takes = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "take")
    .map(({ target }) => target.id);

test("a fresh character finds the purse, and is told nothing of an earlier visit", () => {
  const runtime = createFifthRuntime(goblinYard, TEST_FIGHTER);
  const looked = examined(runtime, runtime.createSession(), "water-butt");
  assert.deepEqual(looked.events[0].found, ["Lost Purse"]);
  assert.equal(looked.events[0].gone, undefined);
  assert.equal(
    renderFifthResult(looked),
    "Water Butt: A barrel of rainwater by the door. A purse lies in the mud behind it.\nYou find the Lost Purse.",
  );
});

test("coin carried off on an earlier visit is gone, and examining says so", () => {
  const runtime = createFifthRuntime(
    goblinYard,
    returning("goblin-yard/lost-purse"),
  );
  const looked = examined(runtime, runtime.createSession(), "water-butt");
  assert.deepEqual(looked.events[0].found, []);
  assert.deepEqual(looked.events[0].gone, ["Lost Purse"]);
  assert.equal(
    renderFifthResult(looked),
    "Water Butt: A barrel of rainwater by the door. A purse lies in the mud behind it. The Lost Purse is gone: you carried it off on an earlier visit.",
  );
  assert.equal(takes(runtime, looked.state).includes("lost-purse"), false);
  // A second look says the same.
  assert.equal(
    renderFifthResult(examined(runtime, looked.state, "water-butt")),
    renderFifthResult(looked),
  );
  // What was not carried off is still found, with nothing said of it.
  const woodpile = examined(runtime, looked.state, "woodpile");
  assert.deepEqual(woodpile.events[0].found, ["Dagger"]);
  assert.equal(woodpile.events[0].gone, undefined);
});

test("gear carried off on an earlier visit is gone too", () => {
  const runtime = createFifthRuntime(
    goblinYard,
    returning("goblin-yard/yard-dagger"),
  );
  const looked = examined(runtime, runtime.createSession(), "woodpile");
  assert.equal(
    renderFifthResult(looked),
    "Woodpile: A stack of split logs against the wall. Something glints under the bottom log. The Dagger is gone: you carried it off on an earlier visit.",
  );
});

test("a find a check's band would reveal says it is gone", () => {
  const fresh = createFifthRuntime(gradedCellar, TEST_FIGHTER);
  const found = examined(fresh, fresh.createSession(), "rubble-heap", 20);
  assert.match(renderFifthResult(found), /You find the Silver Ring\./u);
  assert.doesNotMatch(renderFifthResult(found), /is gone/u);

  const runtime = createFifthRuntime(
    gradedCellar,
    returning("graded-cellar/silver-ring"),
  );
  const looked = examined(runtime, runtime.createSession(), "rubble-heap", 20);
  const text = renderFifthResult(looked);
  assert.match(
    text,
    /The Silver Ring is gone: you carried it off on an earlier visit\./u,
  );
  assert.doesNotMatch(text, /You find the Silver Ring/u);
  assert.equal(takes(runtime, looked.state).includes("silver-ring"), false);
});

// A find taken on this visit (#619): the feature's words still describe it,
// so each showing of them says it was taken, in the examine result, on the
// feature's card and in the line on coming back.
const TAKEN_PURSE =
  "Water Butt: A barrel of rainwater by the door. A purse lies in the mud behind it. You have taken the Lost Purse.";

function acted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

test("a find taken on this visit is said to be taken wherever its feature's words show (#619)", () => {
  const runtime = createFifthRuntime(goblinYard, TEST_FIGHTER);
  const looked = examined(runtime, runtime.createSession(), "water-butt");
  assert.doesNotMatch(renderFifthResult(looked), /You have taken/u);
  const took = acted(runtime, looked.state, {
    type: "take",
    itemId: "lost-purse",
  });
  assert.equal(
    renderFifthResult(examined(runtime, took.state, "water-butt")),
    TAKEN_PURSE,
  );
  const card = runtime
    .projectRoom(took.state)
    .features.find(({ id }) => id === "water-butt");
  assert.equal(
    card.discovery,
    "A purse lies in the mud behind it. You have taken the Lost Purse.",
  );
  // Sneak into the cellar, slip back out, and come back to the yard.
  const sneaked = acted(
    runtime,
    took.state,
    { type: "sneak", destinationId: "cellar" },
    20,
  );
  const back = acted(
    runtime,
    sneaked.state,
    { type: "move", destinationId: "yard" },
    20,
  );
  assert.match(
    renderFifthResult(back),
    /You’re back\. Water Butt: A purse lies in the mud behind it\. You have taken the Lost Purse\./u,
  );
});

test("a feature with a find still there says nothing of taking (#619)", () => {
  const runtime = createFifthRuntime(goblinYard, TEST_FIGHTER);
  const looked = examined(runtime, runtime.createSession(), "water-butt");
  const again = examined(runtime, looked.state, "water-butt");
  assert.doesNotMatch(renderFifthResult(again), /taken/u);
  const card = runtime
    .projectRoom(looked.state)
    .features.find(({ id }) => id === "water-butt");
  assert.equal(card.discovery, "A purse lies in the mud behind it.");
});

test("a find a band revealed and this visit took is said to be taken (#619)", () => {
  const runtime = createFifthRuntime(gradedCellar, TEST_FIGHTER);
  const found = examined(runtime, runtime.createSession(), "rubble-heap", 20);
  const took = acted(runtime, found.state, {
    type: "take",
    itemId: "silver-ring",
  });
  assert.match(
    renderFifthResult(examined(runtime, took.state, "rubble-heap")),
    /You have taken the Silver Ring\.$/u,
  );
});
