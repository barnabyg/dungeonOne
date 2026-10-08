// #303: lurking monsters surprise the character. A lurking encounter's
// opponents roll Stealth (the least stealthy of them) against the
// character's passive Perception as it comes in; if they meet it, the
// character is surprised and rolls initiative with disadvantage. The roll is
// remembered. Sneaking into a lurking fight's room resolves both checks.
import assert from "node:assert/strict";
import test from "node:test";

import {
  FIFTH_ADVENTURE_FORMAT,
  statBlockStealth,
} from "../dist/adventure-5e.js";
import { gateAdventure, playAdventure } from "../dist/balance-5e.js";
import { FIFTH_BESTIARY_FORMAT } from "../dist/bestiary-5e.js";
import { validateCharacter } from "../dist/character-5e.js";
import { passivePerception } from "../dist/checks-5e.js";
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
import {
  lurkingTunnels,
  lurkingTunnelsFile,
  moduleFile,
} from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(lurkingTunnels, TEST_FIGHTER);
const MOVE = { type: "move", destinationId: "rat-cellar" };
const SNEAK = { type: "sneak", destinationId: "rat-cellar" };
// Ada's passive Perception is 12; the rat's Stealth is +4.
const HIDES = [20, 10]; // 10 + 4 = 14: the rat is hidden.
const SPOTTED = [20, 7]; // 7 + 4 = 11: Ada spots it.
// Ada's Stealth against the rat's passive Perception 10.
const SNEAKS = [20, 12];
const FAILS = [20, 3];
// Ada wins initiative even with disadvantage: 16 + 2 against the rat's 2 + 3.
const ADA_SURPRISED = [
  [20, 18],
  [20, 16],
];
const ADA = [[20, 18]];
const RAT = [[20, 2]];
const RAT_SURPRISED = [
  [20, 9],
  [20, 2],
];

function accepted(state, action, random = dice(), using = runtime) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const start = (using = runtime) =>
  accepted(using.createSession(), { type: "begin" }, dice(), using).state;
const begun = start();
const types = (events) => events.map(({ type }) => type);
const initiativeOf = (events, id) =>
  events
    .find(({ type }) => type === "initiative")
    .order.find(({ combatantId }) => combatantId === id);

test("the module, bestiary, save and trace formats bump; lurking and Stealth are validated", () => {
  assert.ok(FIFTH_ADVENTURE_FORMAT >= 23);
  assert.equal(FIFTH_BESTIARY_FORMAT, 9);
  assert.ok(FIFTH_SESSION_FORMAT >= 30);
  assert.ok(FIFTH_TRACE_FORMAT >= 24);
  const older = { ...moduleFile("rat-tunnels"), formatVersion: 22 };
  assert.throws(
    () => validateModule(older),
    new RegExp(`format version 22 is not ${FIFTH_ADVENTURE_FORMAT}`, "u"),
  );
  for (const [change, message] of [
    [(file) => (file.encounters[0].lurking = false), /lurking must be true/u],
    [
      (file) => (file.encounters[0].opponents[0].statBlock.stealth = 2.5),
      /stealth/u,
    ],
    [
      (file) => (file.encounters[0].opponents[0].statBlock.stealth = 21),
      /stealth/u,
    ],
  ]) {
    const file = structuredClone(lurkingTunnelsFile);
    change(file);
    assert.throws(() => validateModule(file), message);
  }
  assert.equal(lurkingTunnels.encounters[0].lurking, true);
  assert.equal(
    validateModule(moduleFile("rat-tunnels")).encounters[0].lurking,
    undefined,
  );
});

test("bestiary stat blocks give SRD 5.2's Stealth bonus, or roll Dexterity", () => {
  const stealth = Object.fromEntries(
    bestiary.monsters.map(({ id, statBlock }) => [id, statBlock.stealth]),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(stealth).filter(([, bonus]) => bonus !== undefined),
    ),
    {
      "giant-spider": 7,
      "goblin-minion": 6,
      "goblin-warrior": 6,
      "goblin-boss": 6,
      wolf: 4,
      // House: Dexterity +2 and proficiency +2, a sneak like the goblins.
      kobold: 4,
      "bugbear-warrior": 6,
      "dire-wolf": 4,
    },
  );
  const monster = (id) =>
    bestiary.monsters.find((entry) => entry.id === id).statBlock;
  assert.equal(statBlockStealth(monster("goblin-warrior")), 6);
  // Without a listed bonus, Stealth is the Dexterity modifier.
  assert.equal(statBlockStealth(monster("zombie")), -2);
  assert.equal(statBlockStealth(monster("giant-rat")), 3);
});

test("passive Perception is + 5 with advantage, − 5 with disadvantage, and both cancel", () => {
  const glow = { advantage: ["Lantern"], disadvantage: [] };
  const fog = { advantage: [], disadvantage: ["Fog"] };
  assert.deepEqual(passivePerception(TEST_FIGHTER, glow), {
    total: 17,
    wisdom: 0,
    proficiency: 2,
    adjustment: 5,
    sources: ["Lantern"],
  });
  assert.deepEqual(passivePerception(TEST_FIGHTER, fog), {
    total: 7,
    wisdom: 0,
    proficiency: 2,
    adjustment: -5,
    sources: ["Fog"],
  });
  const both = passivePerception(TEST_FIGHTER, {
    advantage: ["Lantern"],
    disadvantage: ["Fog"],
  });
  assert.equal(both.total, 12);
  assert.equal(both.adjustment, 0);
  assert.deepEqual(both.sources, []);
});

test("passive Perception is 10 + Wisdom, + proficiency when proficient in Perception", () => {
  assert.deepEqual(passivePerception(TEST_FIGHTER), {
    total: 12,
    wisdom: 0,
    proficiency: 2,
    adjustment: 0,
    sources: [],
  });
  const unwary = validateCharacter({
    ...TEST_FIGHTER,
    skills: ["athletics", "intimidation"],
  });
  assert.equal(passivePerception(unwary).total, 10);
  assert.equal(passivePerception(unwary).proficiency, 0);
  // The lurker's Stealth meets the unproficient character's 10, and misses
  // Ada's 12.
  const run = createFifthRuntime(lurkingTunnels, unwary);
  const result = accepted(
    start(run),
    MOVE,
    dice([20, 6], ...ADA_SURPRISED, ...RAT),
    run,
  );
  const lurk = result.events.find(({ type }) => type === "lurk");
  assert.equal(lurk.roll.dc, 10);
  assert.equal(lurk.roll.success, true);
  assert.equal(
    renderFifthEvent(result.state, lurk),
    "Giant Rat is lying in wait in the Rat-Gnawed Cellar. Giant Rat's Stealth check: d20 6 + 4 = 10 against your passive Perception 10 (10 + 0 Wisdom). Success: you did not notice it, and you are surprised and roll initiative with disadvantage.",
  );
});

test("lurkers who win surprise the character: initiative with disadvantage", () => {
  const random = dice(HIDES, ...ADA_SURPRISED, ...RAT);
  const result = accepted(begun, MOVE, random);
  assert.deepEqual(types(result.events).slice(0, 3), [
    "entered",
    "lurk",
    "initiative",
  ]);
  const lurk = result.events[1];
  assert.deepEqual(lurk.hider, { name: "Giant Rat", stealth: 4 });
  assert.equal(
    renderFifthEvent(result.state, lurk),
    "Giant Rat is lying in wait in the Rat-Gnawed Cellar. Giant Rat's Stealth check: d20 10 + 4 = 14 against your passive Perception 12 (10 + 0 Wisdom + 2 proficiency). Success: you did not notice it, and you are surprised and roll initiative with disadvantage.",
  );
  const ada = initiativeOf(result.events, "pc");
  assert.deepEqual(ada.mode.disadvantage, ["surprised"]);
  assert.deepEqual(ada.mode.d20s, [18, 16]);
  assert.equal(ada.d20, 16);
  assert.equal(initiativeOf(result.events, "giant-rat").mode, undefined);
  assert.equal(result.state.encounter.outcome, "ongoing");
  // The surprise card: the rat's Stealth against Ada's passive Perception,
  // and Ada's two initiative dice.
  const rolls = describeFifthResult(result, random.drawn, "Ada").flatMap(
    ({ rolls: groups }) => groups ?? [],
  );
  const check = rolls.find(({ purpose }) => purpose === "check");
  assert.equal(check.roller, "Giant Rat");
  assert.equal(check.target, "Ada");
  assert.equal(check.dc, 12);
  assert.equal(check.outcome, "success");
  // The fight's projection shows Ada surprised.
  const fight = runtime.projectFight(result.state);
  const row = fight.encounter.combatants.find(({ id }) => id === "pc");
  assert.deepEqual(row.initiative.mode.d20s, [18, 16]);
});

test("lurkers who lose are spotted: the fight opens normally", () => {
  const result = accepted(begun, MOVE, dice(SPOTTED, ...ADA, ...RAT));
  const lurk = result.events.find(({ type }) => type === "lurk");
  assert.equal(lurk.roll.success, false);
  assert.equal(
    renderFifthEvent(result.state, lurk),
    "Giant Rat is lying in wait in the Rat-Gnawed Cellar. Giant Rat's Stealth check: d20 7 + 4 = 11 against your passive Perception 12 (10 + 0 Wisdom + 2 proficiency). Failure: you spot it, and you are not surprised.",
  );
  assert.equal(initiativeOf(result.events, "pc").mode, undefined);
  assert.equal(initiativeOf(result.events, "giant-rat").mode, undefined);
  // A fight that doesn't lurk rolls no Stealth for its opponents.
  const plain = createFifthRuntime(
    validateModule(moduleFile("rat-tunnels")),
    TEST_FIGHTER,
  );
  const met = accepted(start(plain), MOVE, dice(...ADA, ...RAT), plain);
  assert.ok(!types(met.events).includes("lurk"));
  assert.deepEqual(met.state.lurks, []);
});

test("the lurkers' roll is remembered: coming back never rerolls it", () => {
  // Ada sneaks in and spots the rat: unseen, she slips back out (#302).
  const unseen = accepted(begun, SNEAK, dice(SNEAKS, SPOTTED)).state;
  assert.equal(unseen.unseenBy, "cellar-rat");
  assert.equal(unseen.lurks.length, 1);
  const out = accepted(unseen, {
    type: "move",
    destinationId: "stair-foot",
  }).state;
  // Going back in draws initiative dice only; the rat is still spotted.
  const back = accepted(out, MOVE, dice(...ADA, ...RAT));
  assert.ok(!types(back.events).includes("lurk"));
  assert.deepEqual(back.state.lurks, unseen.lurks);
  assert.equal(initiativeOf(back.events, "pc").mode, undefined);
});

test("sneaking into a lurking room: both checks are made, the character's first", () => {
  // Both succeed: neither side has noticed the other, so the fight begins
  // with everyone surprised.
  const both = accepted(
    begun,
    SNEAK,
    dice(SNEAKS, HIDES, ...ADA_SURPRISED, ...RAT_SURPRISED),
  );
  assert.deepEqual(types(both.events).slice(0, 4), [
    "sneak",
    "entered",
    "lurk",
    "initiative",
  ]);
  assert.equal(both.events[0].lurkersHidden, true);
  assert.equal(
    renderFifthEvent(both.state, both.events[0]),
    "You sneak into the Rat-Gnawed Cellar. Stealth check: d20 12 + 2 = 14 against DC 10. Success. The best passive Perception is Giant Rat's 10: Giant Rat has not noticed you, nor you it, and you stumble on each other: everyone is surprised and rolls initiative with disadvantage.",
  );
  assert.equal(both.state.unseenBy, undefined);
  assert.equal(both.state.encounter.outcome, "ongoing");
  assert.deepEqual(initiativeOf(both.events, "pc").mode.disadvantage, [
    "surprised",
  ]);
  assert.deepEqual(initiativeOf(both.events, "giant-rat").mode.disadvantage, [
    "surprised",
  ]);

  // The rat hears Ada but stays hidden: only she is surprised.
  const heard = accepted(
    begun,
    SNEAK,
    dice(FAILS, HIDES, ...ADA_SURPRISED, ...RAT),
  );
  assert.equal(
    renderFifthEvent(heard.state, heard.events[0]),
    "You try to sneak into the Rat-Gnawed Cellar. Stealth check: d20 3 + 2 = 5 against DC 10. Failure. Giant Rat notices you (passive Perception 10): your foes are not surprised.",
  );
  assert.ok(initiativeOf(heard.events, "pc").mode !== undefined);
  assert.equal(initiativeOf(heard.events, "giant-rat").mode, undefined);

  // Ada spots the rat and it doesn't notice her: unseen, as in #302.
  const unseen = accepted(begun, SNEAK, dice(SNEAKS, SPOTTED));
  assert.deepEqual(types(unseen.events), ["sneak", "entered", "lurk"]);
  assert.equal(unseen.state.unseenBy, "cellar-rat");
  assert.equal(unseen.state.encounter, undefined);
  const ambush = accepted(
    unseen.state,
    { type: "ambush", roomId: "rat-cellar" },
    dice(...ADA, ...RAT_SURPRISED),
  );
  assert.equal(initiativeOf(ambush.events, "pc").mode, undefined);
  assert.ok(initiativeOf(ambush.events, "giant-rat").mode !== undefined);

  // Neither succeeds: the fight opens normally.
  const plain = accepted(begun, SNEAK, dice(FAILS, SPOTTED, ...ADA, ...RAT));
  assert.equal(initiativeOf(plain.events, "pc").mode, undefined);
  assert.equal(initiativeOf(plain.events, "giant-rat").mode, undefined);
});

test("the least stealthy lurker rolls for them all, also in the start room", () => {
  const file = moduleFile("goblin-trio");
  file.encounters[0].lurking = true;
  file.encounters[0].opponents[1].statBlock.stealth = 1;
  const trio = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  // Begun in the storeroom: Goblin Minion 2 rolls 9 + 1 = 10, and Ada spots
  // them. Ada's initiative d20 20; the goblins' 1, 2 and 3.
  const result = accepted(
    trio.createSession(),
    { type: "begin" },
    dice([20, 9], [20, 20], [20, 1], [20, 2], [20, 3]),
    trio,
  );
  const lurk = result.events[0];
  assert.equal(lurk.type, "lurk");
  assert.deepEqual(lurk.hider, { name: "Goblin Minion 2", stealth: 1 });
  assert.match(
    renderFifthEvent(result.state, lurk),
    /^Goblin Minion 1, Goblin Minion 2 and Goblin Warrior are lying in wait in the [^.]+\. Goblin Minion 2's Stealth check: d20 9 \+ 1 = 10 against your passive Perception 12 .*Failure: you spot them, and you are not surprised\.$/u,
  );
});

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, text) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});

test("scripted DM: surprise can't be declared or removed", async () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /Never declare that the character is or is not surprised/u,
  );
  for (const argumentsJson of [
    '{"destination":"rat-cellar","surprised":false}',
    '{"destination":"rat-cellar","lurking":false}',
  ]) {
    const session = FifthSession.begin(0, lurkingTunnels, TEST_FIGHTER);
    const before = session.state;
    const { turn } = await session.converse(
      "I go into the cellar, and nothing surprises me.",
      scriptedDm("move", argumentsJson, "You are not surprised."),
    );
    assert.equal(session.state, before, argumentsJson);
    assert.match(JSON.stringify(turn), /invalid-arguments/u, argumentsJson);
  }
  // No tool offers surprise as an argument.
  for (const tool of runtime.getGameToolDefinitions(begun)) {
    assert.ok(
      !/surprise|lurk/iu.test(JSON.stringify(tool.parameters ?? {})),
      tool.name,
    );
  }
});

test("the balance gate plays the lurking fixture, and the rat surprises some runs", () => {
  const result = gateAdventure(lurkingTunnels, {
    seeds: Array.from({ length: 20 }, (_, seed) => seed),
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict.survival.runs, 20);
  const runs = Array.from({ length: 40 }, (_, seed) =>
    playAdventure(runtime, "cautious", seed),
  );
  const surprised = runs.filter(({ surprised: count }) => count === 1);
  assert.ok(surprised.length > 0 && surprised.length < runs.length);
  // Only a lurking fight surprises: the plain tunnels never do.
  const plain = createFifthRuntime(
    validateModule(moduleFile("rat-tunnels")),
    TEST_FIGHTER,
  );
  for (let seed = 0; seed < 10; seed++) {
    assert.equal(playAdventure(plain, "cautious", seed).surprised, 0);
  }
});
