// #284: authored retries and circumstantial advantage. A check is tried
// again only when its module authors a retry: after a cost (damage, or a tool
// used up), paid before the roll, or after a changed circumstance (an item
// held, a discovery made, an encounter won). The same circumstances give
// advantage or disadvantage, and the AI DM can grant neither. Played on the
// rope cove with Ada (Athletics +5, Perception +2, Dexterity +2, Persuasion
// −1, 12 HP).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIFTH_ADVENTURE_FORMAT,
  loadFifthAdventure,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import { createFifthRuntime, describeFifthResult } from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER, testFighterAt } from "../dist/test-fighter-5e.js";
import { bestiary as BESTIARY } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  gradedCellar,
  moduleFile,
  room,
  ropeCove,
} from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(ropeCove, TEST_FIGHTER);
const CLIMB = { type: "examine", targetId: "sheer-cliff" };
const CLIMB_AGAIN = { ...CLIMB, retry: true };
const FORCE = { type: "force", doorId: "swollen-door" };

function accepted(state, action, random = dice(), using = runtime) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** Refused, before any die is drawn. */
function refused(state, action, code, using = runtime) {
  const random = dice();
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  assert.equal(random.drawn.length, 0);
  return result.rejection;
}

const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const types = (events) => events.map(({ type }) => type);
/** The projected actions on `target`, as kind, retry reason and availability. */
const offered = (state, target, using = runtime) =>
  using
    .projectActions(state)
    .filter((view) => view.target?.id === target)
    .map(({ action, approach, retry, available }) => ({
      action,
      ...(approach === undefined ? {} : { approach: approach.id }),
      ...(retry === undefined ? {} : { retry: retry.reason }),
      available,
    }));
/** Ada with the knotted rope in hand: the crate examined and the rope taken. */
const withRope = (state) =>
  accepted(accepted(state, { type: "examine", targetId: "old-crate" }).state, {
    type: "take",
    itemId: "knotted-rope",
  }).state;
/** Ada in the tool shed, its door forced. */
const inShed = (() => {
  const forced = accepted(begun, FORCE, dice([20, 15])).state;
  return accepted(forced, { type: "move", destinationId: "tool-shed" }).state;
})();

test("never, the default: a failed check is not tried again, whatever is asked", () => {
  const cellar = createFifthRuntime(gradedCellar, TEST_FIGHTER);
  const start = accepted(
    cellar.createSession(),
    { type: "begin" },
    dice(),
    cellar,
  ).state;
  const heap = { type: "examine", targetId: "rubble-heap" };
  // 9 + 0 + 2 = 11 against DC 12: a plain failure.
  const { state } = accepted(start, heap, dice([20, 9]), cellar);
  assert.equal(
    refused(state, { ...heap, retry: true }, "no-retry", cellar).reason,
    "Nothing lets you try the Rubble Heap again.",
  );
  // Examining again repeats what the band revealed and rolls nothing.
  assert.deepEqual(types(accepted(state, heap, dice(), cellar).events), [
    "examined",
  ]);
  assert.deepEqual(
    offered(state, "rubble-heap", cellar).map(({ retry }) => retry),
    [undefined],
  );
  const forced = accepted(
    start,
    { type: "force", doorId: "warped-hatch" },
    dice([20, 6]),
    cellar,
  ).state;
  refused(
    forced,
    { type: "force", doorId: "warped-hatch" },
    "already-tried",
    cellar,
  );
  refused(
    forced,
    { type: "force", doorId: "warped-hatch", retry: true },
    "no-retry",
    cellar,
  );
});

test("a retry is refused before the check is first made", () => {
  assert.equal(
    refused(begun, CLIMB_AGAIN, "no-retry").reason,
    "You haven't tried the Sheer Cliff yet.",
  );
  refused(begun, { ...FORCE, retry: true }, "no-retry");
  // A feature or item without a check has nothing to try again.
  refused(
    begun,
    { type: "examine", targetId: "old-crate", retry: true },
    "no-retry",
  );
});

test("after a changed circumstance: holding the rope offers one more try, at advantage", () => {
  // The first climb fails: total 8 + 5 = 13 against DC 15.
  const failed = accepted(begun, CLIMB, dice([20, 8]));
  assert.equal(failed.events[0].roll.mode, undefined);
  assert.deepEqual(failed.state.checks, [
    { id: "examine:sheer-cliff", band: "failure" },
  ]);
  // Without the rope nothing has changed: no retry is offered or accepted.
  assert.deepEqual(offered(failed.state, "sheer-cliff"), [
    { action: "examine", available: true },
  ]);
  refused(failed.state, CLIMB_AGAIN, "no-retry");
  // Examining again still rolls nothing.
  assert.deepEqual(types(accepted(failed.state, CLIMB).events), ["examined"]);

  const roped = withRope(failed.state);
  assert.deepEqual(offered(roped, "sheer-cliff"), [
    { action: "examine", available: true },
    { action: "examine", retry: "Knotted Rope", available: true },
  ]);
  // Examining without asking for the retry still rolls nothing.
  assert.deepEqual(types(accepted(roped, CLIMB).events), ["examined"]);

  // The retry rolls with advantage from the rope: 4 and 15, keeping 15.
  const retried = accepted(roped, CLIMB_AGAIN, dice([20, 4], [20, 15]));
  assert.deepEqual(types(retried.events), [
    "retry",
    "check",
    "examined",
    "outcome",
    "route",
  ]);
  assert.deepEqual(retried.events[1].roll.mode, {
    d20s: [4, 15],
    advantage: ["Knotted Rope"],
    disadvantage: [],
  });
  assert.equal(retried.events[1].band, "success");
  assert.deepEqual(retried.state.checks, [
    { id: "examine:sheer-cliff", band: "failure" },
    { id: "examine:sheer-cliff", band: "success", held: true },
  ]);
  const text = runtime.renderResult(retried);
  assert.match(text, /^Another try at the Sheer Cliff \(Knotted Rope\)\.\n/);
  assert.match(
    text,
    /Athletics check, at advantage \(Knotted Rope\): d20 4 and 15, keeping 15; 15 \+ 3 \+ 2 proficiency = 20 against DC 15\. Success\./,
  );
  // The card names the advantage's source.
  const [line, check] = describeFifthResult(
    retried,
    [
      { sides: 20, value: 4 },
      { sides: 20, value: 15 },
    ],
    "Ada",
  );
  assert.equal(line.text, "Another try at the Sheer Cliff (Knotted Rope).");
  assert.equal(check.rolls[0].mode, "advantage (Knotted Rope)");
  // The success opened the way up, and nothing is left to try.
  assert.ok(
    runtime
      .projectRoom(retried.state)
      .exits.some(({ id }) => id === "gull-ledge"),
  );
  assert.deepEqual(
    offered(retried.state, "sheer-cliff").map(({ retry }) => retry),
    [undefined],
  );
  refused(retried.state, CLIMB_AGAIN, "no-retry");
});

test("a changed circumstance gives one try: failing the retry ends it", () => {
  const failed = accepted(begun, CLIMB, dice([20, 8])).state;
  const again = accepted(
    withRope(failed),
    CLIMB_AGAIN,
    dice([20, 6], [20, 7]),
  ).state;
  assert.equal(again.checks.at(-1).band, "failure");
  refused(again, CLIMB_AGAIN, "no-retry");
  // Holding the rope from the start gives advantage, but no retry after.
  const first = accepted(withRope(begun), CLIMB, dice([20, 3], [20, 6]));
  assert.deepEqual(first.events[0].roll.mode.advantage, ["Knotted Rope"]);
  assert.deepEqual(first.state.checks, [
    { id: "examine:sheer-cliff", band: "failure", held: true },
  ]);
  refused(first.state, CLIMB_AGAIN, "no-retry");
});

test("Remarkable Athlete keeps working alongside a circumstance", () => {
  const champion = createFifthRuntime(ropeCove, testFighterAt(3));
  const start = accepted(
    champion.createSession(),
    { type: "begin" },
    dice(),
    champion,
  ).state;
  const roped = accepted(
    accepted(
      start,
      { type: "examine", targetId: "old-crate" },
      dice(),
      champion,
    ).state,
    { type: "take", itemId: "knotted-rope" },
    dice(),
    champion,
  ).state;
  const { events } = accepted(roped, CLIMB, dice([20, 2], [20, 18]), champion);
  assert.deepEqual(events[0].roll.mode, {
    d20s: [2, 18],
    advantage: ["Remarkable Athlete", "Knotted Rope"],
    disadvantage: [],
  });
});

test("after a cost: damage is paid before the roll, every try", () => {
  const failed = accepted(begun, FORCE, dice([20, 2])).state;
  refused(failed, FORCE, "already-tried");
  assert.deepEqual(offered(failed, "swollen-door"), [
    { action: "force", available: false },
    {
      action: "force",
      retry: "costs 1d4 bludgeoning damage",
      available: true,
    },
  ]);
  // The d4 for the cost is drawn first, then the check's d20.
  const random = dice([4, 3], [20, 4]);
  const again = accepted(failed, { ...FORCE, retry: true }, random);
  assert.deepEqual(
    random.drawn.map(({ sides }) => sides),
    [4, 20],
  );
  assert.deepEqual(types(again.events), [
    "retry",
    "check-damage",
    "check",
    "door",
  ]);
  assert.equal(again.state.character.hp, 9);
  assert.match(
    runtime.renderResult(again),
    /^Another try at the Swollen Door \(costs 1d4 bludgeoning damage\)\.\nThe Swollen Door deals 3 = 3 bludgeoning; you have 9\/12 HP\.\nAthletics check/,
  );
  // A cost retry is offered again after each failure, while it can be paid.
  const third = accepted(
    again.state,
    { ...FORCE, retry: true },
    dice([4, 1], [20, 10]),
  );
  assert.deepEqual(third.state.openedDoorIds, ["swollen-door"]);
  assert.equal(third.state.checks.length, 3);
});

test("a check whose fall closed the way its success opens offers no other try (#289)", () => {
  // The rope cove's cliff with a cost retry, and a fall that brings the way
  // up down with it.
  const module = moduleFile("rope-cove");
  const { check } = room(module, "cliff-foot").features[0];
  check.retry = {
    cost: {
      type: "damage",
      dice: 1,
      sides: 4,
      modifier: 0,
      damageType: "bludgeoning",
      defeatEndingId: "fallen-at-the-cliff",
    },
  };
  check.bands["failure-by-5"].effects.push({
    type: "close",
    passage: "foot-to-ledge",
  });
  const crumbling = createFifthRuntime(
    validateFifthAdventure(module, BESTIARY),
    TEST_FIGHTER,
  );
  const start = accepted(
    crumbling.createSession(),
    { type: "begin" },
    dice(),
    crumbling,
  ).state;
  // A plain failure leaves the way to be found: another try is offered.
  const balked = accepted(start, CLIMB, dice([20, 6]), crumbling).state;
  assert.deepEqual(offered(balked, "sheer-cliff", crumbling), [
    { action: "examine", available: true },
    {
      action: "examine",
      retry: "costs 1d4 bludgeoning damage",
      available: true,
    },
  ]);
  // A failure by 5 closes it: there is nothing left to climb to.
  const fallen = accepted(start, CLIMB, dice([20, 1], [4, 2]), crumbling).state;
  assert.deepEqual(offered(fallen, "sheer-cliff", crumbling), [
    { action: "examine", available: true },
  ]);
  refused(fallen, CLIMB_AGAIN, "no-retry", crumbling);
});

test("a check whose success still has something to give keeps its retry once its way closes (#289)", () => {
  // As above, but a success also makes the cliff's discovery.
  const module = moduleFile("rope-cove");
  const cliff = room(module, "cliff-foot").features[0];
  cliff.discovery = "Gull feathers mark the easiest holds.";
  const { check } = cliff;
  check.retry = {
    cost: {
      type: "damage",
      dice: 1,
      sides: 4,
      modifier: 0,
      damageType: "bludgeoning",
      defeatEndingId: "fallen-at-the-cliff",
    },
  };
  check.bands["failure-by-5"].effects.push({
    type: "close",
    passage: "foot-to-ledge",
  });
  check.bands.success.effects.push({
    type: "discovery",
    feature: "sheer-cliff",
  });
  const crumbling = createFifthRuntime(
    validateFifthAdventure(module, BESTIARY),
    TEST_FIGHTER,
  );
  const start = accepted(
    crumbling.createSession(),
    { type: "begin" },
    dice(),
    crumbling,
  ).state;
  const fallen = accepted(start, CLIMB, dice([20, 1], [4, 2]), crumbling).state;
  assert.deepEqual(offered(fallen, "sheer-cliff", crumbling), [
    { action: "examine", available: true },
    {
      action: "examine",
      retry: "costs 1d4 bludgeoning damage",
      available: true,
    },
  ]);
});

test("a retry's damage that drops the character ends the adventure unrolled", () => {
  const failed = accepted(begun, FORCE, dice([20, 2])).state;
  const weak = { ...failed, character: { ...failed.character, hp: 2 } };
  // Only the cost's d4 is drawn: the check is never made.
  const { state, events } = accepted(
    weak,
    { ...FORCE, retry: true },
    dice([4, 4]),
  );
  assert.deepEqual(types(events), ["retry", "check-damage", "ending"]);
  assert.equal(state.status, "defeat");
  assert.equal(state.endingId, "fallen-at-the-cliff");
  assert.equal(state.checks.length, 1);
});

test("after a cost: a tool is used up before the roll, and only while it is held", () => {
  const searched = accepted(
    inShed,
    { type: "search", roomId: "tool-shed" },
    dice([20, 15]),
  ).state;
  const disarm = { type: "disarm", trapId: "trip-wire" };
  const failed = accepted(searched, disarm, dice([20, 3])).state;
  // Without the iron spike there is nothing to pay with.
  assert.deepEqual(
    offered(failed, "trip-wire").map(({ retry }) => retry),
    [undefined],
  );
  refused(failed, { ...disarm, retry: true }, "no-retry");
  const spiked = {
    ...failed,
    inventory: [...failed.inventory, "iron-spike"],
  };
  assert.deepEqual(offered(spiked, "trip-wire").at(-1), {
    action: "disarm",
    retry: "uses up the Iron Spike",
    available: true,
  });
  const again = accepted(spiked, { ...disarm, retry: true }, dice([20, 5]));
  assert.deepEqual(types(again.events), [
    "retry",
    "used-up",
    "check",
    "disarmed",
  ]);
  assert.match(
    runtime.renderResult(again),
    /^Another try at the Trip Wire \(uses up the Iron Spike\)\.\nThe Iron Spike is used up\.\n/,
  );
  assert.deepEqual(again.state.inventory, failed.inventory);
  assert.ok(again.state.usedItemIds.includes("iron-spike"));
  // The spike is gone, so nothing pays for another try.
  refused(again.state, { ...disarm, retry: true }, "no-retry");
});

test("after a changed circumstance: a discovery made offers another question", () => {
  const ask = { type: "talk", topicId: "the-burrow" };
  const failed = accepted(begun, ask, dice([20, 5])).state;
  refused(failed, ask, "already-asked");
  refused(failed, { ...ask, retry: true }, "no-retry");
  const read = accepted(failed, {
    type: "examine",
    targetId: "tide-notice",
  }).state;
  assert.deepEqual(offered(read, "the-burrow").at(-1), {
    action: "talk",
    retry: "the tide notice",
    available: true,
  });
  const again = accepted(read, { ...ask, retry: true }, dice([20, 16]));
  assert.deepEqual(types(again.events), ["retry", "check", "talked"]);
  assert.match(again.events[2].words, /runs down to the sea/);
  assert.deepEqual(again.state.talkedTopicIds, ["the-burrow"]);
  refused(again.state, { ...ask, retry: true }, "no-retry");
});

test("an encounter not yet won gives disadvantage, and winning it offers a retry", () => {
  const listen = { type: "examine", targetId: "burrow-mouth" };
  // Disadvantage from the rats: 15 and 3, keeping 3; 3 + 0 + 2 = 5.
  const failed = accepted(inShed, listen, dice([20, 15], [20, 3]));
  assert.deepEqual(failed.events[0].roll.mode, {
    d20s: [15, 3],
    advantage: [],
    disadvantage: ["the rats squealing nearby"],
  });
  assert.match(
    runtime.renderResult(failed),
    /Perception check, at disadvantage \(the rats squealing nearby\)/,
  );
  refused(failed.state, { ...listen, retry: true }, "no-retry");
  // Once the rat is beaten, the noise is gone and another try is offered.
  const quiet = {
    ...failed.state,
    clearedEncounterIds: ["burrow-rat"],
  };
  assert.deepEqual(offered(quiet, "burrow-mouth").at(-1), {
    action: "examine",
    retry: "the rats gone quiet",
    available: true,
  });
  const again = accepted(quiet, { ...listen, retry: true }, dice([20, 12]));
  assert.equal(again.events[1].roll.mode, undefined);
  assert.equal(again.events[1].band, "success");
  assert.match(
    runtime
      .projectRoom(again.state)
      .features.find(({ id }) => id === "burrow-mouth").discovery,
    /runs down to the sea/,
  );
});

test("a retry with several approaches offers one button per approach", () => {
  const module = moduleFile("rope-cove");
  const cliff = room(module, "cliff-foot").features[0];
  const { skill, dc, advantage, ...rest } = cliff.check;
  cliff.check = {
    ...rest,
    approaches: [
      { skill, dc, advantage },
      { skill: "acrobatics", dc: 16 },
    ],
  };
  const yard = createFifthRuntime(
    validateFifthAdventure(module, BESTIARY),
    TEST_FIGHTER,
  );
  const start = accepted(
    yard.createSession(),
    { type: "begin" },
    dice(),
    yard,
  ).state;
  const failed = accepted(
    start,
    { ...CLIMB, approach: "acrobatics" },
    dice([20, 12]),
    yard,
  ).state;
  const roped = accepted(
    accepted(failed, { type: "examine", targetId: "old-crate" }, dice(), yard)
      .state,
    { type: "take", itemId: "knotted-rope" },
    dice(),
    yard,
  ).state;
  assert.deepEqual(offered(roped, "sheer-cliff", yard), [
    { action: "examine", available: true },
    {
      action: "examine",
      approach: "athletics",
      retry: "Knotted Rope",
      available: true,
    },
    {
      action: "examine",
      approach: "acrobatics",
      retry: "Knotted Rope",
      available: true,
    },
  ]);
  refused(roped, CLIMB_AGAIN, "choose-approach", yard);
  const { events } = accepted(
    roped,
    { ...CLIMB_AGAIN, approach: "athletics" },
    dice([20, 5], [20, 11]),
    yard,
  );
  assert.deepEqual(events[1].roll.mode.advantage, ["Knotted Rope"]);
});

test("the AI DM's tools take retry only where one is offered, and never advantage", () => {
  const failed = accepted(begun, CLIMB, dice([20, 8])).state;
  const examine = (state) =>
    runtime
      .getGameToolDefinitions(state)
      .find(({ name }) => name === "examine");
  // Nothing to retry: the tool has no retry, and asking for one is refused.
  assert.equal(examine(failed).parameters.properties.retry, undefined);
  for (const [argumentsJson, code] of [
    ['{"target":"sheer-cliff","retry":true}', "action-rejected"],
    ['{"target":"sheer-cliff","advantage":true}', "invalid-arguments"],
    ['{"target":"sheer-cliff","retry":"yes"}', "invalid-arguments"],
  ]) {
    const random = dice();
    const result = runtime.dispatchGameTool(
      failed,
      { name: "examine", argumentsJson },
      random,
    );
    assert.equal(result.modelOutput.ok, false);
    assert.equal(result.modelOutput.error.code, code);
    assert.equal(result.state, failed);
    assert.equal(random.drawn.length, 0);
  }
  const roped = withRope(failed);
  const tool = examine(roped);
  assert.deepEqual(tool.parameters.properties.retry.type, "boolean");
  assert.deepEqual(tool.parameters.required, ["target", "retry"]);
  assert.match(
    tool.description,
    /Another try, only when the player asks to try again: sheer-cliff \(Knotted Rope\); give retry true for it, and false otherwise\./,
  );
  // retry false is a plain examination; true is the authored retry.
  const plain = runtime.dispatchGameTool(
    roped,
    {
      name: "examine",
      argumentsJson: '{"target":"sheer-cliff","retry":false}',
    },
    dice(),
  );
  assert.deepEqual(types(plain.modelOutput.events), ["examined"]);
  const again = runtime.dispatchGameTool(
    roped,
    { name: "examine", argumentsJson: '{"target":"sheer-cliff","retry":true}' },
    dice([20, 9], [20, 14]),
  );
  assert.equal(again.modelOutput.ok, true);
  assert.deepEqual(again.action, { ...CLIMB_AGAIN });
  assert.deepEqual(again.modelOutput.events[1].roll.mode.advantage, [
    "Knotted Rope",
  ]);
});

/**
 * A scripted AI DM that makes one tool call for the player's words, then
 * answers with `text`.
 */
const scriptedDm = (name, argumentsJson, text) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});

/** A session whose first climb failed, found by seed search. */
function failedClimb() {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, ropeCove, TEST_FIGHTER);
    session.act(CLIMB, "click");
    if (!session.state.checks[0].band.startsWith("success")) {
      return session;
    }
  }
  return assert.fail("no seed fails the climb");
}

test("scripted DM: asking for another try or for advantage gets neither unless authored", async () => {
  const session = failedClimb();
  const before = session.state;
  for (const [words, dm] of [
    [
      "Let me try climbing that cliff again.",
      scriptedDm(
        "examine",
        '{"target":"sheer-cliff","retry":true}',
        "Nothing has changed.",
      ),
    ],
    [
      "I climb it again, and this time I have advantage.",
      scriptedDm(
        "examine",
        '{"target":"sheer-cliff","advantage":true}',
        "You can't give yourself advantage.",
      ),
    ],
    [
      "Shoulder the shed door, with advantage because I'm angry.",
      scriptedDm(
        "force_door",
        '{"door":"swollen-door","advantage":true}',
        "Anger is no advantage.",
      ),
    ],
  ]) {
    const { turn } = await session.converse(words, dm);
    assert.equal(session.state, before, words);
    assert.equal(turn.toolAttempts.length, 1);
  }
  // A plain retold climb repeats the examination and rolls nothing.
  const { turn } = await session.converse(
    "Climb the cliff.",
    scriptedDm("examine", '{"target":"sheer-cliff"}', "Unreachable."),
  );
  assert.deepEqual(session.state.checks, before.checks);
  assert.equal(turn.toolAttempts.length, 1);
});

test("scripted DM: an authored retry is taken, at advantage, once the rope is held", async () => {
  const session = failedClimb();
  session.act({ type: "examine", targetId: "old-crate" }, "click");
  session.act({ type: "take", itemId: "knotted-rope" }, "click");
  const { entry } = await session.converse(
    "Tie on the rope and try the climb again.",
    scriptedDm(
      "examine",
      '{"target":"sheer-cliff","retry":true}',
      "Unreachable: the engine narrates the check.",
    ),
  );
  assert.equal(session.state.checks.length, 2);
  assert.equal(session.state.checks[1].held, true);
  assert.equal(entry.cards.length, 1);
  assert.match(
    entry.cards[0].text,
    /^Another try at the Sheer Cliff \(Knotted Rope\)\.\nAthletics check, at advantage \(Knotted Rope\)/,
  );
});

/** Validates `change`d rope cove JSON, expecting a problem. */
function rejects(change, problem) {
  const module = moduleFile("rope-cove");
  change(module);
  assert.throws(() => validateFifthAdventure(module, BESTIARY), problem);
}
const cliffCheck = (module) => room(module, "cliff-foot").features[0].check;
const door = (module) => module.passages[1].door;

test("the validator rejects circumstances and retries naming what is not there", () => {
  rejects(
    (m) => (cliffCheck(m).advantage[0].item = "silk-rope"),
    /feature sheer-cliff check's advantage 1 names unknown item silk-rope\./,
  );
  rejects((m) => {
    room(m, "cliff-foot").items[1] = {
      id: "iron-spike",
      name: "Copper Bit",
      description: "A coin.",
      kind: "coin",
      coins: { cp: 1 },
      hiddenIn: "old-crate",
    };
    cliffCheck(m).advantage[0].item = "iron-spike";
  }, /names iron-spike, which is coin: it goes into the purse, so it is never held\./);
  rejects(
    (m) =>
      (cliffCheck(m).retry.after = {
        type: "discovered",
        feature: "sheer-cliff",
        name: "the cliff",
      }),
    /feature sheer-cliff check's retry names sheer-cliff, which has no discovery\./,
  );
  rejects(
    (m) =>
      (cliffCheck(m).retry.after = {
        type: "won",
        encounter: "gull-fight",
        name: "the gulls",
      }),
    /retry names unknown encounter gull-fight\./,
  );
  rejects(
    (m) => (cliffCheck(m).retry.after.not = true),
    /retry after can't be a circumstance with not/,
  );
  rejects(
    (m) => (door(m).force.retry.cost = { type: "item", item: "knotted-rope2" }),
    /door swollen-door force's retry costs unknown item knotted-rope2\./,
  );
  rejects((m) => {
    room(m, "cliff-foot").items[1].kind = "key";
    door(m).force.retry.cost = { type: "item", item: "iron-spike" };
  }, /retry costs iron-spike, which is key; only a tool is used up\./);
  rejects(
    (m) => (door(m).force.retry.cost.defeatEndingId = "left-the-cove"),
    /names left-the-cove, which is not a defeat ending\./,
  );
  rejects(
    (m) => (door(m).force.retry = { cost: { type: "gold" } }),
    /retry cost type must be item or damage\./,
  );
  rejects(
    (m) => (door(m).force.retry = { never: true }),
    /passage 2 door force retry must have exactly cost\./,
  );
  rejects(
    (m) => (cliffCheck(m).advantage[0].type = "wields"),
    /advantage 1 type must be holds, discovered, won\./,
  );
  rejects(
    (m) => (cliffCheck(m).advantage[0].name = ""),
    /advantage 1 name must be text of 1–60 characters\./,
  );
  // A trap's find is one search for the whole room: it has no circumstances.
  rejects(
    (m) =>
      (m.passages[2].trap.find.advantage = [
        { type: "holds", item: "knotted-rope", name: "Knotted Rope" },
      ]),
    /passage 3 trap find must have exactly dc\./,
  );
  // A retry is a cost or a circumstance, not both.
  rejects((m) => {
    cliffCheck(m).retry.cost = { type: "item", item: "iron-spike" };
  }, /room 1 feature 1 check retry must have exactly after\./);
  // A retry that uses up the tool giving its advantage would cancel it.
  rejects(
    (m) =>
      (cliffCheck(m).retry = {
        cost: { type: "item", item: "knotted-rope" },
      }),
    /feature sheer-cliff check's retry uses up knotted-rope, which its advantage 1 needs held\./,
  );
});

test("a module from before retries (format 19) is refused by name and left unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-284-format-"));
  try {
    const path = join(directory, "before-retries.json");
    const bytes = JSON.stringify({
      ...moduleFile("graded-cellar"),
      formatVersion: 19,
    });
    await writeFile(path, bytes);
    await assert.rejects(loadFifthAdventure(path), {
      message: new RegExp(
        String.raw`before-retries\.json is a 5e adventure module in format version 19, not ${FIFTH_ADVENTURE_FORMAT}\. Move it aside`,
      ),
    });
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
