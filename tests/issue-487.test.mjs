// #487: warning and outcome sounds. The engine tags the line that raises
// the alarm, the one that brings a wandering monster (but not a roll that
// brings nothing or only an omen), and a foe fleeing or surrendering; the
// adventure's ending sounds the objective's fanfare when it meets the
// objective.
import assert from "node:assert/strict";
import test from "node:test";
import { objectiveEnding } from "../dist/adventure-5e.js";
import { createFifthRuntime, describeFifthResult } from "../dist/runtime-5e.js";
import { resultSounds, SOUNDS } from "../dist/sounds-5e.js";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { uncheckedDice as dice } from "./fixtures/engine-dice.mjs";
import { lintelBarrow, loneGoblin } from "./fixtures/modules.mjs";

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

test("a wandering monster that comes sounds its warning; a roll that brings nothing or an omen does not", () => {
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
