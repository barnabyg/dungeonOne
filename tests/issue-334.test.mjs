// #334: a short rest inside an adventure. Outside a fight, in a room with no
// unresolved hostile encounter, at most twice per adventure, the character
// spends hit dice one at a time (each heals the die + its Constitution
// modifier, at least 0) and regains its short-rest feature uses.
import assert from "node:assert/strict";
import test from "node:test";

import { abilityModifier, characterProfile } from "../dist/character-5e.js";
import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
  SHORT_RESTS_PER_ADVENTURE,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER, testFighterAt } from "../dist/test-fighter-5e.js";
import { TEST_ROGUE } from "../dist/test-rogue-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";

const ADA_2 = testFighterAt(2);
const CON = abilityModifier(TEST_FIGHTER.abilities.constitution);
const MAX = characterProfile(ADA_2).maxHp;

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(using, state, action, code) {
  const result = using.handleAction(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection;
}

const begun = (using) =>
  accepted(using, using.createSession(), { type: "begin" }).state;

/** `state` with the character at `hp` and its feature uses at `uses`. */
const hurt = (state, hp, uses = {}) => ({
  ...state,
  character: {
    ...state.character,
    hp,
    featureUses: { ...state.character.featureUses, ...uses },
  },
});

const rest = (hitDice) => ({ type: "rest", hitDice });
const restView = (using, state) =>
  using.projectActions(state).find(({ action }) => action === "rest");

test("a short rest spends hit dice one at a time and regains short-rest uses", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  const tired = hurt(begun(using), 4, { "second-wind": 0, "action-surge": 0 });
  const random = dice([10, 3], [10, 5]);
  const result = accepted(using, tired, rest(2), random);
  const { state, events } = result;
  const healed = 3 + CON + 5 + CON;
  assert.equal(state.character.hp, 4 + healed);
  assert.equal(state.character.hitDice, 0);
  assert.equal(state.shortRests, 1);
  // Second Wind regains one use, Action Surge all of its (SRD 5.2).
  assert.deepEqual(state.character.featureUses, {
    "second-wind": 1,
    "action-surge": 1,
  });
  assert.deepEqual(
    events.map(({ type }) => type),
    ["short-rest", "hit-die", "hit-die", "uses-regained"],
  );
  assert.deepEqual(events[0], {
    type: "short-rest",
    spent: 2,
    hitDice: { available: 0, total: 2, sides: 10 },
    shortRests: { left: 1, max: 2 },
  });
  assert.deepEqual(events[1], {
    type: "hit-die",
    sides: 10,
    value: 3,
    modifier: CON,
    healing: 3 + CON,
    hpAfter: 4 + 3 + CON,
    maxHp: MAX,
  });
  assert.deepEqual(events[3].features, [
    {
      featureId: "second-wind",
      name: "Second Wind",
      regained: 1,
      uses: 1,
      max: 2,
    },
    {
      featureId: "action-surge",
      name: "Action Surge",
      regained: 1,
      uses: 1,
      max: 1,
    },
  ]);
  const text = renderFifthResult(result);
  assert.match(
    text,
    /^You take a short rest and spend 2 hit dice \(0 of 2 d10 left\)\. Short rests: 1 of 2 left in this adventure\.$/mu,
  );
  assert.match(
    text,
    new RegExp(
      `^You spend a hit die: d10 3 \\+ ${CON} = ${3 + CON}; you regain ${3 + CON} HP and have ${4 + 3 + CON}/${MAX} HP\\.$`,
      "mu",
    ),
  );
  assert.match(
    text,
    /^Second Wind regains 1 use \(1 of 2 left\)\. Action Surge regains 1 use \(1 of 1 left\)\.$/mu,
  );
  // The card shows each die as a healing roll.
  const lines = describeFifthResult(result, random.drawn, "Ada");
  const heals = lines.flatMap(({ rolls }) => rolls);
  assert.deepEqual(
    heals.map(({ purpose, dice: shown, total, hpAfter }) => ({
      purpose,
      shown,
      total,
      hpAfter,
    })),
    [
      {
        purpose: "healing",
        shown: [{ sides: 10, value: 3 }],
        total: 3 + CON,
        hpAfter: 4 + 3 + CON,
      },
      {
        purpose: "healing",
        shown: [{ sides: 10, value: 5 }],
        total: 5 + CON,
        hpAfter: 4 + healed,
      },
    ],
  );
});

test("a rest stops spending hit dice once HP is full", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  const scratched = hurt(begun(using), MAX - 2);
  // Only one die is rolled: the second would heal nothing.
  const { state, events } = accepted(using, scratched, rest(2), dice([10, 6]));
  assert.equal(state.character.hp, MAX);
  assert.equal(state.character.hitDice, 1);
  assert.equal(events[0].spent, 1);
  assert.equal(events[1].healing, 2);
  // Nothing to regain: no recovery line.
  assert.deepEqual(
    events.map(({ type }) => type),
    ["short-rest", "hit-die"],
  );
});

test("a negative Constitution modifier lowers each die, never below 0", () => {
  const frail = {
    ...TEST_FIGHTER,
    abilities: { ...TEST_FIGHTER.abilities, constitution: 6 },
  };
  const profile = characterProfile(frail);
  const using = createFifthRuntime(ratTunnels, { ...frail, hp: profile.maxHp });
  const at = hurt(begun(using), 1);
  // Level 1: one hit die. A 1 − 2 heals 0, not −1.
  const low = accepted(using, at, rest(1), dice([10, 1]));
  assert.equal(low.events[1].modifier, -2);
  assert.equal(low.events[1].healing, 0);
  assert.equal(low.state.character.hp, 1);
  assert.match(
    renderFifthResult(low),
    /You spend a hit die: d10 1 − 2 = −1, at least 0; you regain 0 HP and have 1\/\d+ HP\./u,
  );
  const better = accepted(using, at, rest(1), dice([10, 7]));
  assert.equal(better.events[1].healing, 5);
  assert.equal(better.state.character.hp, 6);
});

test("a Rogue spends hit dice and regains no feature uses", () => {
  const using = createFifthRuntime(ratTunnels, TEST_ROGUE);
  const { state, events } = accepted(
    using,
    hurt(begun(using), 2),
    rest(1),
    dice([8, 4]),
  );
  const con = abilityModifier(TEST_ROGUE.abilities.constitution);
  assert.equal(state.character.hp, 2 + Math.max(0, 4 + con));
  assert.deepEqual(state.character.featureUses, {});
  assert.deepEqual(
    events.map(({ type }) => type),
    ["short-rest", "hit-die"],
  );
});

test("a rest may spend no hit dice when a feature regains a use", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  const { state, events } = accepted(
    using,
    hurt(begun(using), 5, { "action-surge": 0 }),
    rest(0),
  );
  assert.equal(state.character.hp, 5);
  assert.equal(state.character.hitDice, 2);
  assert.equal(state.character.featureUses["action-surge"], 1);
  assert.deepEqual(
    events.map(({ type }) => type),
    ["short-rest", "uses-regained"],
  );
  assert.match(
    renderFifthResult({ state, events }),
    /^You take a short rest and spend no hit dice \(2 of 2 d10 left\)\./u,
  );
});

test("a rest is refused in a fight", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  const fight = accepted(
    using,
    begun(using),
    { type: "move", destinationId: "rat-cellar" },
    dice([20, 15], [20, 2]),
  ).state;
  assert.equal(fight.encounter.outcome, "ongoing");
  refused(using, hurt(fight, 4), rest(1), "fighting");
  assert.equal(restView(using, fight), undefined);
});

test("a rest is refused in a room whose hostile encounter is unresolved", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  // The rat's room before its fight has begun (as when sneaking in).
  const lair = { ...hurt(begun(using), 4), roomId: "rat-cellar" };
  const rejection = refused(using, lair, rest(1), "hostile-here");
  assert.match(
    rejection.reason,
    /^Not with the Giant Rat here: you can rest only where no foes are left./u,
  );
  // Once the fight is won, the room is safe.
  const won = { ...lair, clearedEncounterIds: ["cellar-rat"] };
  accepted(using, won, rest(1), dice([10, 4]));
});

test("a third short rest is refused", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  assert.equal(SHORT_RESTS_PER_ADVENTURE, 2);
  let state = hurt(begun(using), 1, { "action-surge": 0 });
  state = accepted(using, state, rest(1), dice([10, 1])).state;
  state = hurt(state, 1, { "action-surge": 0 });
  state = accepted(using, state, rest(1), dice([10, 1])).state;
  assert.equal(state.shortRests, 2);
  const rejection = refused(
    using,
    hurt(state, 1, { "action-surge": 0 }),
    rest(0),
    "no-rests-left",
  );
  assert.match(rejection.reason, /two short rests/u);
  const view = restView(using, hurt(state, 1, { "action-surge": 0 }));
  assert.equal(view.available, false);
  assert.equal(view.reason, "No short rests left");
});

test("a rest with nothing to spend or recover is refused", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  const fresh = begun(using);
  // Full HP and every use: nothing to do.
  refused(using, fresh, rest(2), "nothing-to-recover");
  // Rest is listed only while it would restore something.
  assert.equal(restView(using, fresh), undefined);
  // Hurt, but spending no dice and with every use left.
  refused(using, hurt(fresh, 4), rest(0), "nothing-to-recover");
  // Hurt, but no hit dice left.
  const spent = {
    ...hurt(fresh, 4),
    character: { ...hurt(fresh, 4).character, hitDice: 0 },
  };
  refused(using, spent, rest(1), "too-many-hit-dice");
  refused(using, spent, rest(0), "nothing-to-recover");
  // More dice than are left, and malformed counts.
  refused(using, hurt(fresh, 4), rest(3), "too-many-hit-dice");
  refused(using, hurt(fresh, 4), rest(-1), "unknown-action");
  refused(using, hurt(fresh, 4), rest(1.5), "unknown-action");
  refused(using, hurt(fresh, 4), { type: "rest" }, "unknown-action");
});

test("the projection offers Rest with the hit dice the engine accepts", () => {
  const using = createFifthRuntime(ratTunnels, ADA_2);
  const tired = hurt(begun(using), 4);
  const view = restView(using, tired);
  assert.equal(view.available, true);
  // With every use left, a rest has to spend at least one die.
  assert.deepEqual(view.rest, { hitDice: [1, 2] });
  assert.deepEqual(using.actionOf(view), rest(2));
  const surged = hurt(tired, 4, { "action-surge": 0 });
  assert.deepEqual(restView(using, surged).rest, { hitDice: [0, 1, 2] });
  // At full HP no die would be spent, so a rest spends none.
  const rested = hurt(tired, MAX, { "action-surge": 0 });
  assert.deepEqual(restView(using, rested).rest, { hitDice: [0] });
  assert.match(
    refused(using, rested, rest(1), "nothing-to-recover").reason,
    /^You are at full health: a rest spends no hit dice.$/u,
  );
  // The short rests left show with the hit dice.
  assert.deepEqual(using.projectRests(tired, "short"), { left: 2, max: 2 });
  assert.match(
    using.projectCharacterStatus(tired).resources.join("\n"),
    /^Short rests: 2 of 2 left$/mu,
  );
});

// The AI DM's rest tool.

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (argumentsJson, name = "rest", text = "Done.") => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});
const attempt = (turn) => turn.toolAttempts[0];
const restTool = (session) =>
  session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "rest");

/** Level-2 Ada in the stair foot at 4 HP: a rest is offered. */
function tiredSession(seed = 0) {
  const session = FifthSession.begin(seed, ratTunnels, ADA_2);
  session.state = hurt(session.state, 4);
  return session;
}

test("scripted DM: asking to rest calls rest with the hit dice to spend", async () => {
  const session = tiredSession();
  const tool = restTool(session);
  assert.deepEqual(tool.parameters.properties.hit_dice.enum, [1, 2]);
  assert.deepEqual(tool.parameters.required, ["hit_dice"]);
  assert.match(tool.description, /^Only when the player asks to rest/u);
  assert.match(tool.description, /2 of 2 short rests left/u);
  assert.ok(offeredToolsMatchActions(session));
  const { turn } = await session.converse(
    "I sit down and catch my breath for an hour, spending one hit die.",
    scriptedDm(JSON.stringify({ hit_dice: 1 })),
  );
  assert.equal(attempt(turn).disposition.executed, true);
  assert.deepEqual(attempt(turn).result.action, rest(1));
  assert.equal(session.state.shortRests, 1);
  assert.equal(session.state.character.hitDice, 1);
});

test("scripted DM: the DM can't rest the character outside the offered action", async () => {
  // In a fight: not offered, and the engine refuses it.
  const fighting = FifthSession.begin(0, ratTunnels, ADA_2);
  fighting.act({ type: "move", destinationId: "rat-cellar" }, "click");
  assert.equal(fighting.state.encounter.outcome, "ongoing");
  assert.equal(restTool(fighting), undefined);
  const before = fighting.state;
  const { turn } = await fighting.converse(
    "I take a short rest.",
    scriptedDm(JSON.stringify({ hit_dice: 1 })),
  );
  assert.equal(attempt(turn).result.engineResult.rejection.code, "fighting");
  assert.equal(fighting.state, before);
  // At full health with every use: not offered, and refused.
  const fresh = FifthSession.begin(0, ratTunnels, ADA_2);
  assert.equal(restTool(fresh), undefined);
  const idle = await fresh.converse(
    "Let's rest.",
    scriptedDm(JSON.stringify({ hit_dice: 2 })),
  );
  assert.equal(
    attempt(idle.turn).result.engineResult.rejection.code,
    "nothing-to-recover",
  );
  // More dice than are left, or malformed arguments.
  const session = tiredSession();
  const greedy = await session.converse(
    "Rest, spending five hit dice.",
    scriptedDm(JSON.stringify({ hit_dice: 5 })),
  );
  assert.equal(
    attempt(greedy.turn).result.engineResult.rejection.code,
    "too-many-hit-dice",
  );
  for (const argumentsJson of [
    "{}",
    JSON.stringify({ hit_dice: "2" }),
    JSON.stringify({ hit_dice: 1, heal: 10 }),
  ]) {
    const bad = await session.converse("Rest.", scriptedDm(argumentsJson));
    assert.equal(
      attempt(bad.turn).result.modelOutput.error.code,
      "invalid-arguments",
    );
  }
  assert.equal(session.state.shortRests, 0);
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /at most two short rests in an adventure[^]*Call rest only when the player asks to rest/u,
  );
});
