// #280: door, trap and topic checks go through one check path. Each site
// rolls one d20 from the dice it is given, shows a check event and then its
// own event, and remembers its outcome under its site id, so neither a click
// nor a typed request rolls it again.
import assert from "node:assert/strict";
import test from "node:test";
import { validateCharacter } from "../dist/character-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { sealedCrypt } from "./fixtures/modules.mjs";

// The test Fighter carrying thieves' tools (#309), so it can pick and disarm.
const runtime = createFifthRuntime(
  sealedCrypt,
  validateCharacter({ ...TEST_FIGHTER, stowed: ["thieves-tools"] }),
);

function accepted(state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const inHall = accepted(begun, { type: "move", destinationId: "hall" }).state;

/**
 * Makes the check at `site` with one d20 showing `d20`: the result is the
 * check event, then the site's own event, and the outcome is remembered.
 * Asking again, by click or by the AI DM's tool, is refused without a die.
 */
function checkOnce(state, action, { site, event, d20, success, tool, again }) {
  const result = accepted(state, action, dice([20, d20]));
  assert.deepEqual(
    result.events.map(({ type }) => type),
    ["check", event],
  );
  assert.equal(result.events[0].roll.d20, d20);
  assert.equal(result.events[0].roll.success, success);
  assert.deepEqual(result.state.checks, [
    ...state.checks,
    { id: site, band: success ? "success" : "failure" },
  ]);

  const random = dice();
  const repeat = runtime.handleAction(result.state, action, random);
  assert.match(repeat.rejection?.reason ?? "", again);
  assert.equal(repeat.state, result.state);
  assert.equal(random.drawn.length, 0);

  const typed = runtime.dispatchGameTool(result.state, tool, dice());
  assert.equal(typed.modelOutput.ok, false);
  assert.equal(typed.state, result.state);
  return result;
}

test("forcing a stuck door is one remembered check", () => {
  for (const [d20, success] of [
    [20, true],
    [1, false],
  ]) {
    const { state } = checkOnce(
      begun,
      { type: "force", doorId: "swollen-door" },
      {
        site: "force:swollen-door",
        event: "door",
        d20,
        success,
        tool: {
          name: "force_door",
          argumentsJson: '{"door":"swollen-door"}',
        },
        again: success ? /already open/ : /already tried to force/,
      },
    );
    assert.equal(state.openedDoorIds.includes("swollen-door"), success);
  }
});

test("picking and breaking a locked door are separate remembered checks", () => {
  const picked = checkOnce(
    inHall,
    { type: "pick", doorId: "iron-door" },
    {
      site: "pick:iron-door",
      event: "door",
      d20: 1,
      success: false,
      tool: { name: "pick_lock", argumentsJson: '{"door":"iron-door"}' },
      again: /already tried to pick/,
    },
  ).state;
  const broken = checkOnce(
    picked,
    { type: "break", doorId: "iron-door" },
    {
      site: "break:iron-door",
      event: "door",
      d20: 1,
      success: false,
      tool: { name: "break_door", argumentsJson: '{"door":"iron-door"}' },
      again: /already tried to break/,
    },
  ).state;
  const reasons = runtime
    .projectActions(broken)
    .filter(({ target }) => target?.id === "iron-door")
    .map(({ action, reason }) => `${action}: ${reason}`);
  assert.deepEqual(reasons, ["pick: Already tried", "break: Already tried"]);
});

test("searching a room and disarming a found trap are remembered checks", () => {
  const searched = checkOnce(
    inHall,
    { type: "search", roomId: "hall" },
    {
      site: "search:hall",
      event: "searched",
      d20: 20,
      success: true,
      tool: { name: "search", argumentsJson: '{"room":"hall"}' },
      again: /already searched/,
    },
  ).state;
  assert.deepEqual(searched.foundTrapIds, ["dart-trap"]);
  const tried = checkOnce(
    searched,
    // With thieves' tools the trap offers them or bare hands (#309).
    { type: "disarm", trapId: "dart-trap", approach: "thieves-tools" },
    {
      site: "disarm:dart-trap",
      event: "disarmed",
      d20: 1,
      success: false,
      tool: { name: "disarm", argumentsJson: '{"trap":"dart-trap"}' },
      again: /already tried to disarm/,
    },
  ).state;
  assert.deepEqual(tried.disarmedTrapIds, []);
});

test("asking about a topic with a check is one remembered check", () => {
  for (const [d20, success, words] of [
    [20, true, /In the offering bowl/],
    [1, false, /Untie me first/],
  ]) {
    const { state, events } = checkOnce(
      inHall,
      { type: "talk", topicId: "key-whereabouts" },
      {
        site: "talk:key-whereabouts",
        event: "talked",
        d20,
        success,
        tool: { name: "talk", argumentsJson: '{"topic":"key-whereabouts"}' },
        again: /already asked/,
      },
    );
    assert.match(events[1].words, words);
    // The room keeps showing what the remembered outcome drew.
    const topic = runtime
      .projectRoom(state)
      .creatures[0].topics.find(({ id }) => id === "key-whereabouts");
    assert.match(topic.said, words);
  }
});

test("a topic without a check rolls nothing and still answers once", () => {
  const random = dice();
  const { state, events } = accepted(
    inHall,
    { type: "talk", topicId: "warden" },
    random,
  );
  assert.deepEqual(
    events.map(({ type }) => type),
    ["talked"],
  );
  assert.deepEqual(state.checks, []);
  assert.match(
    runtime.handleAction(state, { type: "talk", topicId: "warden" }, dice())
      .rejection.reason,
    /already asked/,
  );
});
