// #487: warning and outcome sounds. The engine tags the line that raises
// the alarm, the one that brings a wandering encounter (but not a roll that
// brings nothing or only an omen), and a foe fleeing or surrendering; the
// adventure's ending sounds the objective's fanfare when it meets the
// objective.
import assert from "node:assert/strict";
import test from "node:test";
import { objectiveEnding } from "../dist/adventure-5e.js";
import { createFifthRuntime, describeFifthResult } from "../dist/runtime-5e.js";
import { resultSounds, SOUNDS } from "../dist/sounds-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { sessionSeed } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { uncheckedDice as dice } from "./fixtures/engine-dice.mjs";
import { fleeingGoblins, fleeingSeed } from "./fixtures/fleeing-goblins.mjs";
import {
  alarmTunnels,
  lintelBarrow,
  loneGoblin,
  restingTunnels,
} from "./fixtures/modules.mjs";
import { recordingRandom } from "./fixtures/seed-search.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";
import {
  surrenderingGoblins,
  surrenderSeed,
} from "./fixtures/surrendering-goblins.mjs";

const runtime = createFifthRuntime(loneGoblin, BEA);
// Bea's fight with the goblin, for lines that name its combatants.
const { state } = runtime.handleAction(
  runtime.createSession(),
  { type: "begin" },
  dice(10, 10, 10, 10, 10),
);

/**
 * Each event's line's sound tag, told against Bea's fight; a wandering roll
 * drew its d100.
 */
const tags = (...events) =>
  describeFifthResult(
    { state, events },
    events.flatMap((event) =>
      event.type === "wandering-roll"
        ? [{ sides: 100, value: event.roll }]
        : [],
    ),
    "Bea",
    runtime.lineLookup,
  ).map(({ sound }) => sound);

const wandering = (fields) => ({
  type: "wandering-roll",
  trigger: "moves",
  chance: 20,
  ...fields,
});

test("each warning and outcome sound is a named, bundled sound", () => {
  for (const id of [
    "alarm",
    "wandering",
    "foe-flees",
    "foe-surrenders",
    "objective",
  ]) {
    assert.ok(Object.hasOwn(SOUNDS, id), id);
  }
});

test("the alarm raised sounds its warning", () => {
  assert.deepEqual(
    tags({
      type: "alarm",
      text: "A horn blares through the tunnels.",
      cause: "a goblin that fled the fight in the Cellar and lived",
    }),
    ["alarm"],
  );
});

test("a wandering encounter that comes sounds its warning; a roll that brings nothing or an omen does not", () => {
  assert.deepEqual(
    tags(
      wandering({ roll: 7, interrupted: true, opponents: ["Prowling Rat"] }),
      wandering({
        rest: "long",
        trigger: undefined,
        roll: 3,
        interrupted: true,
        opponents: ["Prowling Rat"],
      }),
      wandering({ roll: 64, interrupted: false }),
      wandering({
        roll: 12,
        interrupted: false,
        omen: "Claws skitter somewhere above.",
      }),
    ),
    ["wandering", "wandering", undefined, undefined],
  );
});

test("a foe fleeing and a foe surrendering each sound", () => {
  assert.deepEqual(
    tags(
      { type: "fled", combatantId: "goblin" },
      { type: "surrendered", combatantId: "goblin" },
    ),
    ["foe-flees", "foe-surrenders"],
  );
});

/** Each line `action` brings, told with its dice and the runtime's lookup. */
function lines(on, state, action, random) {
  const drawn = [[]];
  const result = on.handleAction(state, action, recordingRandom(random, drawn));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return {
    state: result.state,
    lines: describeFifthResult(result, drawn[0], "Ada", on.lineLookup),
  };
}

/** Sound-tagged lines as [text, sound]. */
const soundedLines = (told) =>
  told
    .filter(({ sound }) => sound !== undefined)
    .map(({ text, sound }) => [text, sound]);

test("in play, the crates crashing down raise the alarm, which sounds once", () => {
  const runtime = createFifthRuntime(alarmTunnels, TEST_FIGHTER);
  // A 1 on the check: the crates crash down.
  const told = lines(
    runtime,
    runtime.createSession(),
    { type: "examine", targetId: "stacked-crates" },
    dice(1),
  ).lines;
  assert.deepEqual(soundedLines(told), [
    [
      "The alarm is raised by examining the Stacked Crates (failure by 5 or more). A gong booms below, and goblin voices shout. The tunnels are roused.",
      "alarm",
    ],
  ]);
});

test("in play, a wanderer interrupting a rest sounds the warning; a roll that brings nothing is silent", () => {
  const resting = createFifthRuntime(restingTunnels, TEST_FIGHTER);
  let state = resting.createSession();
  for (const action of [
    { type: "begin" },
    { type: "move", destinationId: "alcove" },
  ]) {
    state = resting.handleAction(state, action, dice()).state;
  }
  state = { ...state, character: { ...state.character, hp: 4 } };
  // d100 25: the Prowling Rat comes; then initiative.
  const came = lines(resting, state, { type: "long-rest" }, dice(25, 15, 2));
  assert.deepEqual(came.lines.map(({ sound }) => sound).filter(Boolean), [
    "wandering",
  ]);
  assert.match(
    came.lines.find(({ sound }) => sound === "wandering").text,
    /Prowling Rat comes upon you/u,
  );
  // d100 90: nothing comes, and the rest goes ahead.
  const quiet = lines(resting, state, { type: "long-rest" }, dice(90));
  assert.deepEqual(
    quiet.lines.map(({ sound }) => sound),
    [undefined, "rest-long"],
  );
});

/**
 * A fight in the burial hall played as the browser tests click it, on the
 * seed `find` gives: every line it brought.
 */
function foughtLines(adventure, find) {
  const { seed } = find();
  const runtime = createFifthRuntime(adventure, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  const told = [];
  let state = runtime.createSession();
  for (const action of [
    { type: "begin" },
    { type: "move", destinationId: "burial-hall" },
  ]) {
    ({ state } = lines(runtime, state, action, random));
  }
  while (state.status === "playing" && state.encounter?.outcome === "ongoing") {
    const [target] = runtime.attackTargets(state);
    const next = lines(
      runtime,
      state,
      target === undefined
        ? { type: "end-turn", actorId: "pc" }
        : { type: "attack", actorId: "pc", targetId: target.id },
      random,
    );
    told.push(...next.lines);
    state = next.state;
  }
  return told;
}

test("in play, a goblin fleeing and a goblin surrendering each sound", () => {
  const fled = foughtLines(fleeingGoblins, fleeingSeed).filter(({ text }) =>
    / flees the fight\.$/u.test(text),
  );
  assert.ok(fled.length > 0);
  assert.ok(fled.every(({ sound }) => sound === "foe-flees"));
  const yielded = foughtLines(surrenderingGoblins, surrenderSeed).filter(
    ({ text }) => / surrenders\.$/u.test(text),
  );
  assert.ok(yielded.length > 0);
  assert.ok(yielded.every(({ sound }) => sound === "foe-surrenders"));
});

test("each sound plays once, before the sounds its line's rolls ask for", () => {
  const lines = describeFifthResult(
    {
      state,
      events: [
        { type: "fled", combatantId: "goblin" },
        { type: "alarm", text: "A horn blares.", cause: "the goblin" },
      ],
    },
    [],
    "Bea",
    runtime.lineLookup,
  );
  assert.deepEqual(resultSounds({ character: "Bea", cards: [{ lines }] }), [
    "foe-flees",
    "alarm",
  ]);
});

test("the objective is the victory, or with none, the escape with loot", () => {
  assert.equal(objectiveEnding(loneGoblin).kind, "victory");
  assert.equal(objectiveEnding(lintelBarrow).kind, "escape-with-loot");
});

test("an ending that meets the objective sounds the objective's fanfare in place of its kind's", () => {
  const sounds = (ending) =>
    resultSounds({ character: "Bea", cards: [], ending });
  assert.deepEqual(
    sounds({ kind: "victory", objective: true, levelUp: false }),
    ["objective"],
  );
  assert.deepEqual(
    sounds({ kind: "escape-with-loot", objective: true, levelUp: true }),
    ["objective", "level-up"],
  );
  // Escaping with loot from a module with a victory falls short of it.
  assert.deepEqual(
    sounds({ kind: "escape-with-loot", objective: false, levelUp: false }),
    ["ending-escape"],
  );
});
