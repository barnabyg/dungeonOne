// #301: sneaking into an encounter room. A Stealth check against the
// opponents' best passive Perception surprises every opponent on a success;
// surprised opponents roll initiative with disadvantage. The check is
// remembered, and only the engine decides surprise.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { FIFTH_BESTIARY_FORMAT } from "../dist/bestiary-5e.js";
import { characterProfile, validateCharacter } from "../dist/character-5e.js";
import { SKILLS } from "../dist/class-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthEvent,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { moduleFile, ratTunnels } from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(ratTunnels, TEST_FIGHTER);
const SNEAK = { type: "sneak", destinationId: "rat-cellar" };

function accepted(state, action, random = dice(), using = runtime) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const types = (events) => events.map(({ type }) => type);
const sneakEvent = (result) =>
  result.events.find(({ type }) => type === "sneak");
const initiativeOf = (result, id) =>
  result.events
    .find(({ type }) => type === "initiative")
    .order.find(({ combatantId }) => combatantId === id);

test("Stealth is a Dexterity skill anyone can roll; the Fighter is not proficient", () => {
  assert.deepEqual(SKILLS.stealth, { name: "Stealth", ability: "dexterity" });
  const stealth = characterProfile(TEST_FIGHTER).skills.find(
    ({ id }) => id === "stealth",
  );
  assert.deepEqual(stealth, {
    id: "stealth",
    name: "Stealth",
    ability: "dexterity",
    bonus: 2,
    proficient: false,
  });
});

test("every bestiary monster has its SRD 5.2 passive Perception", () => {
  assert.equal(FIFTH_BESTIARY_FORMAT, 8);
  const perception = Object.fromEntries(
    bestiary.monsters.map(({ id, statBlock }) => [
      id,
      statBlock.passivePerception,
    ]),
  );
  assert.equal(perception.wolf, 15);
  assert.equal(perception["giant-rat"], 12);
  assert.equal(perception.zombie, 8);
  assert.equal(perception["goblin-warrior"], 9);
  assert.equal(perception["warrior-veteran"], 12);
  // The house Gnoll Ravager: 10 + its Wisdom modifier.
  assert.equal(perception.gnoll, 10);
  assert.ok(Object.values(perception).every(Number.isInteger));
});

test("an inline stat block needs a passive Perception; the module format bumps", () => {
  assert.ok(FIFTH_ADVENTURE_FORMAT >= 21);
  const file = moduleFile("rat-tunnels");
  delete file.encounters[0].opponents[0].statBlock.passivePerception;
  assert.throws(() => validateModule(file), /passivePerception/u);
  const older = { ...moduleFile("rat-tunnels"), formatVersion: 20 };
  assert.throws(
    () => validateModule(older),
    new RegExp(`format version 20 is not ${FIFTH_ADVENTURE_FORMAT}`, "u"),
  );
});

test("sneaking in is offered beside going in, only where a fight waits", () => {
  const offered = runtime
    .projectActions(begun)
    .filter(({ action }) => action === "move" || action === "sneak")
    .map(({ action, target, available }) => [action, target.id, available]);
  assert.deepEqual(offered, [
    ["move", "alcove", true],
    ["move", "rat-cellar", true],
    ["sneak", "rat-cellar", true],
  ]);
  const random = dice();
  const result = runtime.handleAction(
    begun,
    { type: "sneak", destinationId: "alcove" },
    random,
  );
  assert.equal(result.rejection.code, "no-fight-ahead");
  assert.match(result.rejection.reason, /No fight waits in the Alcove/u);
  assert.equal(result.state, begun);
  assert.equal(random.drawn.length, 0);
});

test("a successful sneak surprises every opponent: they roll initiative at disadvantage", () => {
  // Stealth d20 12 + 2 = 14 against the rat's passive Perception 10. The
  // rat has not noticed Ada (#302); she springs an ambush, and initiative:
  // Ada d20 15, the rat 18 and 4, keeping 4.
  const sneaked = accepted(begun, SNEAK, dice([20, 12]));
  assert.deepEqual(types(sneaked.events), ["sneak", "entered"]);
  const sneak = sneakEvent(sneaked);
  const ambush = accepted(
    sneaked.state,
    { type: "ambush", roomId: "rat-cellar" },
    dice([20, 15], [20, 18], [20, 4]),
  );
  const result = {
    state: ambush.state,
    events: [...sneaked.events, ...ambush.events],
  };
  assert.deepEqual(types(result.events).slice(0, 4), [
    "sneak",
    "entered",
    "ambush",
    "initiative",
  ]);
  assert.equal(sneak.roll.label, "Stealth check");
  assert.equal(sneak.roll.total, 14);
  assert.equal(sneak.roll.dc, 10);
  assert.equal(sneak.roll.success, true);
  assert.equal(sneak.roll.mode, undefined);
  assert.deepEqual(sneak.watcher, { name: "Giant Rat", passivePerception: 10 });
  assert.deepEqual(sneak.surprised, ["Giant Rat"]);
  assert.equal(
    renderFifthEvent(result.state, sneak),
    "You sneak into the Rat-Gnawed Cellar. Stealth check: d20 12 + 2 = 14 against DC 10. Success. The best passive Perception is Giant Rat's 10: Giant Rat has not noticed you. Ambush it, and it is surprised; or slip past through another way.",
  );
  const rat = initiativeOf(result, "giant-rat");
  assert.equal(rat.d20, 4);
  assert.deepEqual(rat.mode, {
    d20s: [18, 4],
    advantage: [],
    disadvantage: ["surprised"],
  });
  assert.equal(initiativeOf(result, "pc").mode, undefined);
  // The initiative table shows who was surprised and both dice.
  const fight = runtime.projectFight(result.state);
  const shown = fight.encounter.combatants.find(({ id }) => id === "giant-rat");
  assert.deepEqual(shown.initiative.mode.d20s, [18, 4]);
  // The result card: the Stealth roll against the DC, then initiative with
  // the rat's higher die dropped.
  const lines = describeFifthResult(
    result,
    [
      { sides: 20, value: 12 },
      { sides: 20, value: 15 },
      { sides: 20, value: 18 },
      { sides: 20, value: 4 },
    ],
    "Ada",
  );
  const [check] = lines[0].rolls;
  assert.equal(check.label, "Stealth check");
  assert.equal(check.dc, 10);
  assert.equal(check.outcome, "success");
  assert.equal(check.target, "Giant Rat");
  const initiative = lines.find(({ rolls }) =>
    rolls.some(({ purpose }) => purpose === "initiative"),
  );
  const ratRoll = initiative.rolls.find(({ roller }) => roller === "Giant Rat");
  assert.deepEqual(ratRoll.dice, [
    { sides: 20, value: 18, dropped: true },
    { sides: 20, value: 4 },
  ]);
  assert.equal(ratRoll.mode, "disadvantage (surprised)");
  assert.match(
    initiative.text,
    /Giant Rat \(surprised, d20s 18 and 4, kept\) 4/u,
  );
});

test("a failed sneak starts an ordinary fight", () => {
  // Stealth d20 3 + 2 = 5 against 10; initiative d20s 15 and 4.
  const result = accepted(begun, SNEAK, dice([20, 3], [20, 15], [20, 4]));
  const sneak = sneakEvent(result);
  assert.equal(sneak.roll.success, false);
  assert.deepEqual(sneak.surprised, []);
  assert.match(
    renderFifthEvent(result.state, sneak),
    /Giant Rat notices you \(passive Perception 10\): no one is surprised\.$/u,
  );
  assert.equal(initiativeOf(result, "giant-rat").mode, undefined);
  assert.equal(result.state.encounter.outcome, "ongoing");
});

test("armour that hampers Stealth gives the check disadvantage", () => {
  const armoured = validateCharacter({
    ...TEST_FIGHTER,
    equipment: ["chain-mail", "mace"],
  });
  const heavy = createFifthRuntime(ratTunnels, armoured);
  const start = accepted(
    heavy.createSession(),
    { type: "begin" },
    dice(),
    heavy,
  ).state;
  // Stealth d20s 15 and 5, keeping 5: 5 + 2 = 7, a failure.
  const result = accepted(
    start,
    SNEAK,
    dice([20, 15], [20, 5], [20, 15], [20, 4]),
    heavy,
  );
  const { roll } = sneakEvent(result);
  assert.equal(roll.d20, 5);
  assert.deepEqual(roll.mode.disadvantage, ["Chain mail"]);
  assert.equal(roll.success, false);
  assert.match(
    renderFifthEvent(result.state, sneakEvent(result)),
    /Stealth check, at disadvantage \(Chain mail\)/u,
  );
});

test("the Stealth check is remembered: sneaking up on the same fight again never rerolls it", () => {
  const first = accepted(begun, SNEAK, dice([20, 12]));
  assert.deepEqual(first.state.sneaks, [
    { encounterId: "cellar-rat", roll: sneakEvent(first).roll },
  ]);
  // Back out with the fight not begun (#302): the check stands, so sneaking
  // up on it again is refused before any die is drawn.
  const outside = accepted(first.state, {
    type: "move",
    destinationId: "stair-foot",
  }).state;
  const random = dice();
  const again = runtime.handleAction(outside, SNEAK, random);
  assert.equal(again.rejection.code, "already-sneaked");
  assert.equal(again.state, outside);
  assert.equal(random.drawn.length, 0);
  assert.deepEqual(outside.sneaks, first.state.sneaks);
});

test("the save and trace formats bump", () => {
  assert.ok(FIFTH_SESSION_FORMAT >= 28);
  assert.ok(FIFTH_TRACE_FORMAT >= 22);
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

test("scripted DM: the sneak tool lists only rooms where a fight waits", () => {
  const sneak = runtime
    .getGameToolDefinitions(begun)
    .find(({ name }) => name === "sneak");
  assert.deepEqual(sneak.parameters.properties.destination.enum, [
    "rat-cellar",
  ]);
  assert.match(sneak.description, /passive Perception/u);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /never declare surprise/u);
});

test('scripted DM: "I sneak in" calls the sneak tool, and the engine rolls Stealth', async () => {
  const session = FifthSession.begin(0, ratTunnels, TEST_FIGHTER);
  const { entry, turn } = await session.converse(
    "I sneak into the cellar.",
    scriptedDm("sneak", '{"destination":"rat-cellar"}', "Unreachable."),
  );
  assert.equal(turn.toolAttempts.length, 1);
  assert.equal(session.state.roomId, "rat-cellar");
  assert.equal(session.state.sneaks.length, 1);
  assert.match(entry.cards[0].text, /Stealth check: d20 \d+/u);
  assert.notEqual(session.state.encounter, undefined);
});

test("scripted DM: sneaking where no fight lies ahead is rejected", async () => {
  const session = FifthSession.begin(0, ratTunnels, TEST_FIGHTER);
  const before = session.state;
  const { turn } = await session.converse(
    "I creep into the alcove.",
    scriptedDm(
      "sneak",
      '{"destination":"alcove"}',
      "There is no one to sneak up on there.",
    ),
  );
  // The engine refuses it before any die is drawn.
  assert.equal(session.state, before);
  assert.equal(turn.toolAttempts.length, 1);
  assert.match(JSON.stringify(turn), /No fight waits in the Alcove/u);
});

test("scripted DM: the DM can't declare surprise itself", async () => {
  for (const [name, argumentsJson] of [
    ["move", '{"destination":"rat-cellar","surprise":true}'],
    ["sneak", '{"destination":"rat-cellar","success":true}'],
  ]) {
    const session = FifthSession.begin(0, ratTunnels, TEST_FIGHTER);
    const before = session.state;
    const { turn } = await session.converse(
      "We ambush the rat: it is surprised.",
      scriptedDm(name, argumentsJson, "Ambush!"),
    );
    assert.equal(session.state, before, name);
    assert.equal(turn.toolAttempts[0].disposition.executed, false, name);
  }
});

test("the AI DM evaluation fixture modules still validate", async () => {
  const eval_ = JSON.parse(
    await readFile(
      new URL("../adventures/eval/obstacle-yard.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(eval_.formatVersion, FIFTH_ADVENTURE_FORMAT);
  validateModule(eval_);
});
