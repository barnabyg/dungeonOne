// #302: sneaking past a fight. A successful sneak leaves the character unseen
// in the fight's room: it may spring an ambush, or go on through another
// passage, leaving the fight bypassed, unresolved and met again on coming
// back. A bypassed fight gives only the XP its module authors, once; and the
// balance harness gains a stealth-first style the gate reports.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  PLAY_STYLES,
  playAdventure,
  qualifyAdventure,
  renderBalanceResult,
  renderGateResult,
} from "../dist/balance-5e.js";
import { validateCharacter } from "../dist/character-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthEvent,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  moduleFile,
  ratRun,
  ratRunFile,
  ratTunnels,
} from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(ratTunnels, TEST_FIGHTER);
const SNEAK = { type: "sneak", destinationId: "rat-cellar" };
// Stealth d20 12 + 2 = 14 against the rat's passive Perception 10.
const SNEAKS = [20, 12];
// Stealth d20 3 + 2 = 5: the rat notices.
const FAILS = [20, 3];

function accepted(state, action, random = dice(), using = runtime) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** A refusal that draws no die and leaves the state as it was. */
function refused(state, action, code, using = runtime) {
  const random = dice();
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection?.code, code, JSON.stringify(result));
  assert.equal(result.state, state);
  assert.equal(random.drawn.length, 0);
  return result;
}

const start = (using = runtime) =>
  accepted(using.createSession(), { type: "begin" }, dice(), using).state;
const begun = start();
const types = (events) => events.map(({ type }) => type);
const available = (using, state, kind) =>
  using
    .projectActions(state)
    .filter(({ action, available: on }) => action === kind && on)
    .map(({ target }) => target.id);

test("the module, save and trace formats bump; bypass XP and sneaking again are validated", () => {
  assert.ok(FIFTH_ADVENTURE_FORMAT >= 22);
  assert.ok(FIFTH_SESSION_FORMAT >= 29);
  assert.ok(FIFTH_TRACE_FORMAT >= 23);
  const older = { ...moduleFile("rat-tunnels"), formatVersion: 21 };
  assert.throws(
    () => validateModule(older),
    new RegExp(`format version 21 is not ${FIFTH_ADVENTURE_FORMAT}`, "u"),
  );
  for (const [field, value, message] of [
    ["bypassXp", 0, /bypassXp/u],
    ["bypassXp", 2.5, /bypassXp/u],
    ["sneakAgain", false, /sneakAgain must be true/u],
  ]) {
    const file = moduleFile("rat-tunnels");
    file.encounters[0][field] = value;
    assert.throws(() => validateModule(file), message, `${field} ${value}`);
  }
  assert.equal(ratRun.encounters[0].bypassXp, 20);
  assert.equal(ratTunnels.encounters[0].bypassXp, undefined);
});

test("a successful sneak leaves the character unseen: the fight has not begun", () => {
  const result = accepted(begun, SNEAK, dice(SNEAKS));
  assert.deepEqual(types(result.events), ["sneak", "entered"]);
  const { state } = result;
  assert.equal(state.roomId, "rat-cellar");
  assert.equal(state.unseenBy, "cellar-rat");
  assert.equal(state.encounter, undefined);
  assert.deepEqual(state.clearedEncounterIds, []);
  assert.equal(
    renderFifthEvent(state, result.events[0]),
    "You sneak into the Rat-Gnawed Cellar. Stealth check: d20 12 + 2 = 14 against DC 10. Success. The best passive Perception is Giant Rat's 10: Giant Rat has not noticed you. Ambush it, and it is surprised; or slip past through another way.",
  );
  // Ambush, or slip past by any exit; nothing in the room can be touched.
  assert.deepEqual(available(runtime, state, "ambush"), ["rat-cellar"]);
  assert.deepEqual(available(runtime, state, "move"), ["stair-foot", "den"]);
  assert.deepEqual(available(runtime, state, "examine"), []);
  const shown = runtime
    .projectActions(state)
    .find(({ action }) => action === "examine");
  assert.equal(shown.reason, "You'd be seen");
  const { rejection } = refused(
    state,
    { type: "examine", targetId: "gnawed-sacks" },
    "unseen",
  );
  assert.match(
    rejection.reason,
    /^Not while you are sneaking past the Giant Rat: you would be seen\./u,
  );
  // The AI DM is offered ambush and move, and no examine.
  const tools = runtime.getGameToolDefinitions(state).map(({ name }) => name);
  assert.ok(tools.includes("ambush"));
  assert.ok(tools.includes("move"));
  assert.ok(!tools.includes("examine"));
  assert.match(
    runtime.projectDmScene(state).combatStatus,
    /have not noticed the character/u,
  );
});

test("an ambush from unseen surprises every opponent", () => {
  const unseen = accepted(begun, SNEAK, dice(SNEAKS)).state;
  // Initiative: Ada d20 15, the rat 18 and 4, keeping 4.
  const result = accepted(
    unseen,
    { type: "ambush", roomId: "rat-cellar" },
    dice([20, 15], [20, 18], [20, 4]),
  );
  assert.deepEqual(types(result.events).slice(0, 2), ["ambush", "initiative"]);
  assert.equal(
    renderFifthEvent(result.state, result.events[0]),
    "You spring your ambush: Giant Rat is surprised and rolls initiative with disadvantage.",
  );
  const rat = result.events[1].order.find(
    ({ combatantId }) => combatantId === "giant-rat",
  );
  assert.deepEqual(rat.mode.disadvantage, ["surprised"]);
  assert.equal(result.state.unseenBy, undefined);
  assert.equal(result.state.encounter.outcome, "ongoing");
  // Ambushing where no one is unaware of you is refused.
  refused(begun, { type: "ambush", roomId: "stair-foot" }, "not-unseen");
});

test("slipping past leaves the fight unresolved, and the next room's fight begins", () => {
  const unseen = accepted(begun, SNEAK, dice(SNEAKS)).state;
  // The den's goblin fight begins: Ada d20 15, the goblin 10.
  const result = accepted(
    unseen,
    { type: "move", destinationId: "den" },
    dice([20, 15], [20, 10]),
  );
  assert.deepEqual(types(result.events).slice(0, 3), [
    "bypassed",
    "entered",
    "initiative",
  ]);
  assert.equal(
    renderFifthEvent(result.state, result.events[0]),
    "You slip out of the Rat-Gnawed Cellar unseen, past Giant Rat. The fight there is left unfought.",
  );
  const { state } = result;
  assert.equal(state.unseenBy, undefined);
  assert.deepEqual(state.bypassedEncounterIds, ["cellar-rat"]);
  assert.deepEqual(state.clearedEncounterIds, []);
  assert.equal(state.roomId, "den");
  assert.equal(state.encounter.outcome, "ongoing");
});

test("coming back meets a bypassed fight again: no fresh sneak unless the module authors one", () => {
  const unseen = accepted(begun, SNEAK, dice(SNEAKS)).state;
  const back = accepted(unseen, {
    type: "move",
    destinationId: "stair-foot",
  }).state;
  assert.deepEqual(back.bypassedEncounterIds, ["cellar-rat"]);
  assert.equal(back.encounter, undefined);
  // The check stands: sneaking up on the rat again is refused, unrolled.
  assert.deepEqual(available(runtime, back, "sneak"), []);
  const { rejection } = refused(back, SNEAK, "already-sneaked");
  assert.match(rejection.reason, /going in again starts it/u);
  // Going in starts the fight, and the rat is not surprised.
  const met = accepted(
    back,
    { type: "move", destinationId: "rat-cellar" },
    dice([20, 15], [20, 4]),
  );
  const rat = met.events
    .find(({ type }) => type === "initiative")
    .order.find(({ combatantId }) => combatantId === "giant-rat");
  assert.equal(rat.mode, undefined);
  assert.equal(met.state.encounter.outcome, "ongoing");

  // A module may let the character sneak up on it again: a fresh check.
  const file = moduleFile("rat-tunnels");
  file.encounters[0].sneakAgain = true;
  const again = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const there = accepted(start(again), SNEAK, dice(SNEAKS), again).state;
  const out = accepted(
    there,
    { type: "move", destinationId: "stair-foot" },
    dice(),
    again,
  ).state;
  assert.deepEqual(available(again, out, "sneak"), ["rat-cellar"]);
  const fresh = accepted(out, SNEAK, dice(FAILS, [20, 15], [20, 4]), again);
  assert.equal(fresh.state.sneaks.length, 1);
  assert.equal(fresh.state.sneaks[0].roll.total, 5);
  assert.equal(fresh.state.encounter.outcome, "ongoing");
});

test("after a failed sneak the fight is on, and there is no slipping past", () => {
  const caught = accepted(begun, SNEAK, dice(FAILS, [20, 15], [20, 4])).state;
  assert.equal(caught.unseenBy, undefined);
  assert.deepEqual(available(runtime, caught, "move"), []);
  refused(caught, { type: "move", destinationId: "den" }, "fighting");
});

/** The Rat Run sneaked through: past the rat, into the den, and out. */
function slipThrough(sheet) {
  const run = createFifthRuntime(ratRun, sheet);
  let state = accepted(
    run.createSession(),
    { type: "begin" },
    dice(),
    run,
  ).state;
  state = accepted(state, SNEAK, dice(SNEAKS), run).state;
  state = accepted(
    state,
    { type: "move", destinationId: "den" },
    dice(),
    run,
  ).state;
  state = accepted(state, { type: "leave", roomId: "den" }, dice(), run).state;
  return { run, state };
}

test("a bypassed fight gives only its authored XP, credited once; none by default", () => {
  const { run, state } = slipThrough(TEST_FIGHTER);
  assert.equal(state.status, "escaped");
  assert.deepEqual(state.bypassedEncounterIds, ["cellar-rat"]);
  // The encounter's own award: an encounter is credited once, won or not.
  assert.deepEqual(run.projectSettlement(state).xp, [
    {
      id: "rat-run/encounter/cellar-rat",
      name: "Slipped past the Giant Rat",
      xp: 20,
    },
  ]);
  const credited = validateCharacter({
    ...TEST_FIGHTER,
    xp: 20,
    xpAwards: ["rat-run/encounter/cellar-rat"],
  });
  const again = slipThrough(credited);
  assert.deepEqual(again.run.projectSettlement(again.state).xp, []);
  // Without an authored award, slipping past earns no XP.
  const file = structuredClone(ratRunFile);
  delete file.encounters[0].bypassXp;
  const plain = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  let quiet = accepted(
    plain.createSession(),
    { type: "begin" },
    dice(),
    plain,
  ).state;
  quiet = accepted(quiet, SNEAK, dice(SNEAKS), plain).state;
  quiet = accepted(
    quiet,
    { type: "move", destinationId: "den" },
    dice(),
    plain,
  ).state;
  quiet = accepted(
    quiet,
    { type: "leave", roomId: "den" },
    dice(),
    plain,
  ).state;
  assert.deepEqual(plain.projectSettlement(quiet).xp, []);
});

test("slipping past and then winning the fight earns the fight's XP alone", () => {
  const run = createFifthRuntime(ratRun, TEST_FIGHTER);
  let state = accepted(
    run.createSession(),
    { type: "begin" },
    dice(),
    run,
  ).state;
  state = accepted(state, SNEAK, dice(SNEAKS), run).state;
  state = accepted(
    state,
    { type: "move", destinationId: "stair-foot" },
    dice(),
    run,
  ).state;
  state = run.handleAction(
    state,
    { type: "move", destinationId: "rat-cellar" },
    dice([20, 20], [20, 1]),
  ).state;
  // Ada hits until the rat falls: d20 19 to hit, 1d8 8 + 3 damage.
  while (state.encounter.outcome === "ongoing") {
    const result = run.handleAction(
      state,
      { type: "attack", actorId: "pc", targetId: "giant-rat" },
      dice([20, 19], [6, 6]),
    );
    state = result.state;
  }
  state = accepted(
    state,
    { type: "move", destinationId: "den" },
    dice(),
    run,
  ).state;
  state = accepted(state, { type: "leave", roomId: "den" }, dice(), run).state;
  assert.deepEqual(state.bypassedEncounterIds, ["cellar-rat"]);
  assert.deepEqual(
    run.projectSettlement(state).xp.map(({ id, name, xp }) => [id, name, xp]),
    [["rat-run/encounter/cellar-rat", "Defeated the Giant Rat", 25]],
  );
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

/** A session on `seed` sneaked into the rat cellar, and how it went. */
async function sneakedSession(success) {
  for (let seed = 0; seed < 100; seed++) {
    const session = FifthSession.begin(seed, ratTunnels, TEST_FIGHTER);
    await session.converse(
      "I sneak into the cellar.",
      scriptedDm("sneak", '{"destination":"rat-cellar"}', "Unreachable."),
    );
    if (session.state.sneaks[0].roll.success === success) {
      return session;
    }
  }
  throw new Error("no seed gave that sneak");
}

test('scripted DM: "I slip past them to the north door" after a successful sneak moves on', async () => {
  const session = await sneakedSession(true);
  assert.equal(session.state.unseenBy, "cellar-rat");
  const { turn } = await session.converse(
    "I slip past them to the north door.",
    scriptedDm("move", '{"destination":"den"}', "Unreachable."),
  );
  assert.equal(turn.toolAttempts.length, 1);
  assert.equal(turn.toolAttempts[0].disposition.executed, true);
  assert.equal(session.state.roomId, "den");
  assert.deepEqual(session.state.bypassedEncounterIds, ["cellar-rat"]);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /I slip past them to the north door/u);
});

test('scripted DM: "I slip past them to the north door" after a failed sneak is rejected', async () => {
  const session = await sneakedSession(false);
  assert.equal(session.state.encounter.outcome, "ongoing");
  const before = session.state;
  const { turn } = await session.converse(
    "I slip past them to the north door.",
    scriptedDm("move", '{"destination":"den"}', "You slip past."),
  );
  // The engine refuses it before any die is drawn: nothing changes.
  assert.equal(session.state, before);
  assert.equal(turn.toolAttempts.length, 1);
  assert.match(
    JSON.stringify(turn),
    /You can't leave in the middle of a fight/u,
  );
});

test("scripted DM: the DM can't declare an ambush or a bypass itself", async () => {
  // Ambushing where no one is unaware of the character is the engine's
  // refusal; an argument no tool lists is refused before the engine.
  for (const [name, argumentsJson, refusal] of [
    ["ambush", '{"room":"stair-foot"}', /no one to ambush/u],
    [
      "sneak",
      '{"destination":"rat-cellar","unseen":true}',
      /invalid-arguments/u,
    ],
  ]) {
    const session = FifthSession.begin(0, ratTunnels, TEST_FIGHTER);
    const before = session.state;
    const { turn } = await session.converse(
      "They never see me: I ambush them.",
      scriptedDm(name, argumentsJson, "Ambush!"),
    );
    assert.equal(session.state, before, name);
    assert.match(JSON.stringify(turn), refusal, name);
  }
});

test("the harness's stealth-first style sneaks and slips past what it can", () => {
  assert.ok(PLAY_STYLES.includes("stealth-first"));
  const run = createFifthRuntime(ratRun, TEST_FIGHTER);
  const runs = Array.from({ length: 40 }, (_, seed) =>
    playAdventure(run, "stealth-first", seed),
  );
  // Slipping past the rat earns its 20 XP; caught, Ada fights it for 25.
  const slipped = runs.filter(({ bypassed }) => bypassed === 1);
  assert.ok(slipped.length > 0 && slipped.length < runs.length);
  for (const { xp, encounters, outcome } of slipped) {
    assert.equal(outcome, "escape-without-loot");
    assert.deepEqual(encounters, []);
    assert.equal(xp, 20);
  }
  for (const { encounters, bypassed } of runs.filter(
    ({ bypassed: count }) => count === 0,
  )) {
    assert.equal(bypassed, 0);
    assert.deepEqual(
      encounters.map(({ id }) => id),
      ["cellar-rat"],
    );
  }
  // The cautious style never sneaks.
  for (let seed = 0; seed < 10; seed++) {
    const cautious = playAdventure(run, "cautious", seed);
    assert.equal(cautious.bypassed, 0);
    assert.equal(cautious.encounters.length, 1);
  }
  // Stealth-first ambushes a fight that is its goal: the den's victory.
  const tunnels = createFifthRuntime(ratTunnels, TEST_FIGHTER);
  for (let seed = 0; seed < 10; seed++) {
    const played = playAdventure(tunnels, "stealth-first", seed);
    assert.ok(
      played.encounters.some(({ id }) => id === "den-goblin"),
      `seed ${seed}`,
    );
  }
  const report = qualifyAdventure(ratRun, {
    seeds: [0, 1, 2, 3],
    styles: ["stealth-first"],
  });
  assert.equal(report.ok, true);
  assert.match(
    renderBalanceResult(ratRun, report),
    /^ {2}stealth-first: survived .*; slipped past \d\.\d fights$/mu,
  );
});

test("the gate reports stealth-first beside its checks, and its XP limit counts bypass XP", () => {
  const result = gateAdventure(ratRun, { seeds: [0, 1, 2, 3, 4, 5, 6, 7] });
  assert.equal(result.ok, true);
  const { stealthFirst, xp } = result.verdict;
  assert.equal(stealthFirst.style, "stealth-first");
  assert.equal(stealthFirst.runs, 8);
  assert.ok(stealthFirst.meanBypassed > 0);
  // The rat's encounter is credited once: its 25 XP for beating it is more
  // than the 20 for slipping past, unless a module authors more.
  assert.equal(xp.available, 25);
  const file = structuredClone(ratRunFile);
  file.encounters[0].bypassXp = 60;
  assert.equal(
    gateAdventure(validateModule(file), { seeds: [0] }).verdict.xp.available,
    60,
  );
  assert.match(
    renderGateResult(ratRun, result),
    /^ {2}Stealth-first, reported \(not judged\): the level 1, 5th percentile Fighter playing stealth-first survived \d+\.\d% of 8 runs with its weakest kit, [a-z-]+ \(.*\); over every kit and level it completed \d+\.\d%, slipped past \d\.\d fights and earned \d+\.\d XP a run\.$/mu,
  );
});
