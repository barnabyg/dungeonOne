// Sneaking into a fight (#301) and past it (#302). A Stealth check against
// the opponents' best passive Perception surprises every opponent on a
// success; surprised opponents roll initiative with disadvantage. The check
// is remembered, and only the engine decides surprise. A successful sneak
// leaves the character unseen in the fight's room: it may spring an ambush,
// or go on through another passage, leaving the fight bypassed, unresolved
// and met again on coming back. A bypassed fight gives only the XP its module
// authors, once; and the balance harness gains a stealth-first style the gate
// reports.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import { characterProfile, validateCharacter } from "../dist/character-5e.js";
import { SKILLS } from "../dist/class-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthEvent,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  goblinYard,
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
    "You sneak into the Rat-Gnawed Cellar. Stealth check: d20 12 + 2 = 14 against DC 10. Success. The best passive Perception is Giant Rat's 10: Giant Rat has not noticed you. Ambush it, and it is surprised and rolls initiative with disadvantage; or slip past through another way.",
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
    /^Not while you are sneaking past Giant Rat: you would be seen\./u,
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
    "You spring your ambush: Giant Rat is surprised and rolls initiative with disadvantage. A rat the size of a dog rears up from the sacks, teeth bared.",
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
      name: "Slipped past Giant Rat",
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
    [["rat-run/encounter/cellar-rat", "Defeated Giant Rat", 25]],
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

// Sneaking into a fight's room (#620): while the character is unseen, its
// opponents have not turned to face it, so the arrival and the opponents'
// card hold their descriptions, written for the moment the fight begins.
// Springing the ambush, or failing the sneak, shows them.

const yard = createFifthRuntime(goblinYard, TEST_FIGHTER);
const goblin = goblinYard.encounters.find(({ id }) => id === "lone-goblin")
  .opponents[0];
const SNEAK_CELLAR = { type: "sneak", destinationId: "cellar" };

function actedIn(state, action, ...rolls) {
  const result = yard.handleAction(
    state,
    action,
    uncheckedDice(...rolls, ...Array(40).fill(10)),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

test("a successful sneak's arrival holds the opponents' descriptions (#620)", () => {
  const sneaked = actedIn(yard.createSession(), SNEAK_CELLAR, 20);
  const text = renderFifthResult(sneaked);
  assert.match(text, /has not noticed you/u);
  assert.equal(text.includes(goblin.description), false, text);
  const waiting = yard.projectRoom(sneaked.state).waiting;
  assert.equal(waiting.state, "unseen");
  assert.deepEqual(
    waiting.opponents.map(({ name, description }) => [name, description]),
    [[goblin.name, undefined]],
  );

  // Springing the ambush shows them: the fight begins.
  const ambushed = actedIn(sneaked.state, {
    type: "ambush",
    roomId: "cellar",
  });
  assert.ok(renderFifthResult(ambushed).includes(goblin.description));
});

test("a failed sneak's arrival shows the opponents' descriptions (#620)", () => {
  const seen = actedIn(yard.createSession(), SNEAK_CELLAR, 1);
  assert.ok(renderFifthResult(seen).includes(goblin.description));
});

// Sneaking in (#301).
const sneakEvent = (result) =>
  result.events.find(({ type }) => type === "sneak");
const initiativeOf = (result, id) =>
  result.events
    .find(({ type }) => type === "initiative")
    .order.find(({ combatantId }) => combatantId === id);

test("Stealth is a Dexterity skill anyone can roll; the Fighter is not proficient", () => {
  assert.deepEqual(SKILLS.stealth, {
    name: "Stealth",
    ability: "dexterity",
    summary: "Escape notice by moving quietly and hiding behind things",
  });
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
    "You sneak into the Rat-Gnawed Cellar. Stealth check: d20 12 + 2 = 14 against DC 10. Success. The best passive Perception is Giant Rat's 10: Giant Rat has not noticed you. Ambush it, and it is surprised and rolls initiative with disadvantage; or slip past through another way.",
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

/**
 * A scripted AI DM that makes one tool call for the player's words, then
 * answers with `text`.
 */
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
