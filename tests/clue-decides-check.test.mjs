// #629: a clue that decides a check. A feature's check may name a
// circumstance (`noRollWhen`) that makes it needless: while it holds,
// examining the feature rolls nothing and its success band applies, even
// after a failure made before the clue was found. Played on the rope cove,
// its old crate given a search that the tide notice decides.
import assert from "node:assert/strict";
import test from "node:test";
import { validateFifthAdventure } from "../dist/adventure-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary as BESTIARY } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";

const NOTICE = {
  type: "discovered",
  feature: "tide-notice",
  name: "the tide notice",
};
/** The rope cove, its crate searched by Investigation or Perception. */
function cove(change = () => {}) {
  const module = moduleFile("rope-cove");
  room(module, "cliff-foot").features[1].check = {
    approaches: [
      { skill: "investigation", dc: 15 },
      { skill: "perception", dc: 15 },
    ],
    noRollWhen: { ...NOTICE },
    bands: {
      success: {
        text: "You find what the sacking hides.",
        effects: [
          { type: "discovery", feature: "old-crate" },
          { type: "item", item: "knotted-rope" },
        ],
      },
    },
  };
  change(module);
  return module;
}
const runtime = createFifthRuntime(
  validateFifthAdventure(cove(), BESTIARY),
  TEST_FIGHTER,
);
const CRATE = { type: "examine", targetId: "old-crate" };
const NOTICE_READ = { type: "examine", targetId: "tide-notice" };

function accepted(state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}
const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const crateViews = (state) =>
  runtime
    .projectActions(state)
    .filter(
      ({ action, target }) =>
        action === "examine" && target?.id === "old-crate",
    )
    .map(({ approach }) => approach?.id ?? null);
const lines = (result) => runtime.renderResult(result).split("\n");

test("without the clue the check is rolled, by the approach chosen", () => {
  assert.deepEqual(crateViews(begun), ["investigation", "perception"]);
  const result = accepted(
    begun,
    { ...CRATE, approach: "investigation" },
    dice([20, 18]),
  );
  assert.equal(result.events[0].type, "check");
  assert.match(runtime.renderResult(result), /coil of knotted rope/);
});

test("with the clue found, examining makes the success band with no roll", () => {
  const read = accepted(begun, NOTICE_READ).state;
  // A plain look, with no approach to choose.
  assert.deepEqual(crateViews(read), [null]);
  const random = dice();
  const result = accepted(read, CRATE, random);
  assert.equal(random.drawn.length, 0);
  assert.deepEqual(lines(result).slice(0, 1), [
    "No roll needed: you know what to look for (the tide notice).",
  ]);
  assert.match(
    runtime.renderResult(result),
    /You find what the sacking hides\./,
  );
  assert.match(runtime.renderResult(result), /coil of knotted rope/);
  // It is remembered as a success: the rope is there to take, and looking
  // again rolls nothing.
  const taken = accepted(result.state, {
    type: "take",
    itemId: "knotted-rope",
  });
  assert.ok(taken.state.inventory.includes("knotted-rope"));
  accepted(taken.state, CRATE);
});

test("a failure made before the clue was found gives way to it", () => {
  const failed = accepted(
    begun,
    { ...CRATE, approach: "perception" },
    dice([20, 3]),
  ).state;
  assert.equal(failed.checks.at(-1).band, "failure");
  const read = accepted(failed, NOTICE_READ).state;
  const result = accepted(read, CRATE);
  assert.equal(result.state.checks.at(-1).band, "success");
  assert.ok(
    accepted(result.state, {
      type: "take",
      itemId: "knotted-rope",
    }).state.inventory.includes("knotted-rope"),
  );
});

test("the validator takes noRollWhen only on a feature's check, never with not", () => {
  const rejects = (change, problem) =>
    assert.throws(
      () => validateFifthAdventure(cove(change), BESTIARY),
      problem,
    );
  rejects(
    (m) =>
      (room(m, "cliff-foot").creatures[0].topics[0].check.noRollWhen = NOTICE),
    /topic the-burrow check has noRollWhen; only a feature's check may have one\./,
  );
  rejects(
    (m) => (room(m, "cliff-foot").features[1].check.noRollWhen.not = true),
    /noRollWhen can't be a circumstance with not/,
  );
  rejects(
    (m) =>
      (room(m, "cliff-foot").features[1].check.noRollWhen.feature = "sea-cave"),
    /feature old-crate check's noRollWhen names unknown feature sea-cave\./,
  );
});
