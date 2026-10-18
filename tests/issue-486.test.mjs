// #486: world actions sound through the result-line sound tag. A lock
// picked or unlocked clicks, a door forced or broken bursts open, a trap
// sprung and a trap disarmed each sound, and so do a potion drunk and a
// short or long rest. A failed pick, force or disarm plays only its check's
// sounds.
import assert from "node:assert/strict";
import test from "node:test";
import { buildCharacter, validateCharacter } from "../dist/character-5e.js";
import { createFifthRuntime, describeFifthResult } from "../dist/runtime-5e.js";
import { resultSounds, SOUNDS } from "../dist/sounds-5e.js";
import { uncheckedDice as dice } from "./fixtures/engine-dice.mjs";
import { restingTunnels, sealedCrypt } from "./fixtures/modules.mjs";

// Str 16 (+3), Dex 12 (+1), Con 14 (+2); Athletics (+5) and Perception
// (+2); 12 HP; carrying thieves' tools to pick and disarm.
const ADA = validateCharacter({
  ...buildCharacter(
    "a".repeat(32),
    "Ada",
    [
      [6, 6, 4, 1],
      [4, 4, 4, 1],
      [4, 4, 4, 1],
      [3, 3, 3, 1],
      [3, 3, 4, 1],
      [3, 3, 4, 1],
    ],
    {
      placement: {
        strength: 0,
        dexterity: 1,
        constitution: 2,
        intelligence: 3,
        wisdom: 4,
        charisma: 5,
      },
      increase: { constitution: 2, intelligence: 1 },
      skills: ["athletics", "perception"],
      fightingStyle: "defense",
      kit: "mace",
      masteries: ["dagger", "mace", "shortsword"],
    },
  ),
  stowed: ["thieves-tools"],
});

const runtime = createFifthRuntime(sealedCrypt, ADA);

/** Applies actions in order, each drawing from its own queue. */
function play(steps, state = runtime.createSession()) {
  for (const [action, ...values] of steps) {
    const result = runtime.handleAction(state, action, dice(...values));
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    state = result.state;
  }
  return state;
}

/** Each line's text and sound tag for `action` from `state`. */
function tagged(state, action, ...values) {
  const random = dice(...values);
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return describeFifthResult(result, random.drawn, "Ada", runtime.lineLookup);
}

const tags = (lines) => lines.map(({ sound }) => sound);
const answer = (lines) =>
  resultSounds({ character: "Ada", cards: [{ lines }] });

const BEGIN = [{ type: "begin" }];
const TO_HALL = [{ type: "move", destinationId: "hall" }];
const pick = { type: "pick", doorId: "iron-door" };
const force = { type: "force", doorId: "swollen-door" };
const disarm = {
  type: "disarm",
  trapId: "dart-trap",
  approach: "thieves-tools",
};

test("each world-action sound is a named, bundled sound", () => {
  for (const id of [
    "unlock",
    "door-forced",
    "trap-sprung",
    "trap-disarmed",
    "potion",
    "rest-short",
    "rest-long",
  ]) {
    assert.ok(Object.hasOwn(SOUNDS, id), id);
  }
});

test("a lock picked or unlocked with its key clicks, after the pick's check", () => {
  const hall = play([BEGIN, TO_HALL]);
  // Dexterity 14 + 1 = 15 against DC 15.
  const picked = tagged(hall, pick, 14);
  assert.deepEqual(tags(picked), [undefined, "unlock"]);
  assert.deepEqual(answer(picked), ["dice", "success", "unlock"]);

  // With the key from the offering bowl, the trap found and disarmed first.
  const keyed = play(
    [
      [{ type: "search", roomId: "hall" }, 15],
      [disarm, 15],
      [{ type: "move", destinationId: "offering-room" }],
      [{ type: "examine", targetId: "offering-bowl" }],
      [{ type: "take", itemId: "iron-key" }],
      TO_HALL,
    ],
    hall,
  );
  const unlocked = tagged(keyed, { type: "unlock", doorId: "iron-door" });
  assert.equal(unlocked[0].text, "You unlock the Iron Door with the Iron Key.");
  assert.deepEqual(tags(unlocked), ["unlock"]);
});

test("a door forced or broken bursts open, after its check", () => {
  // Athletics 8 + 3 + 2 = 13 against DC 13.
  const forced = tagged(play([BEGIN]), force, 8);
  assert.match(forced[1].text, /^You force the Swollen Door open\.$/u);
  assert.deepEqual(tags(forced), [undefined, "door-forced"]);
  assert.deepEqual(answer(forced), ["dice", "success", "door-forced"]);
  // Athletics 13 + 5 = 18 against DC 18.
  const broken = tagged(play([BEGIN, TO_HALL]), { ...pick, type: "break" }, 13);
  assert.match(broken[1].text, /^You break the Iron Door open\.$/u);
  assert.deepEqual(tags(broken), [undefined, "door-forced"]);
});

test("a failed pick, force or disarm plays only its check's sounds", () => {
  const hall = play([BEGIN, TO_HALL]);
  const found = play([[{ type: "search", roomId: "hall" }, 15]], hall);
  for (const lines of [
    tagged(hall, pick, 3),
    tagged(play([BEGIN]), force, 2),
    tagged(found, disarm, 2),
  ]) {
    assert.deepEqual(tags(lines), [undefined, undefined], lines[1].text);
    assert.deepEqual(answer(lines), ["dice", "failure"], lines[1].text);
  }
});

test("a trap disarmed and a trap set off each sound", () => {
  const hall = play([BEGIN, TO_HALL]);
  const found = play([[{ type: "search", roomId: "hall" }, 15]], hall);
  // Dexterity 11 + 1 = 12 against DC 12.
  const disarmed = tagged(found, disarm, 11);
  assert.equal(disarmed[1].text, "You disarm the Dart Trap.");
  assert.deepEqual(tags(disarmed), [undefined, "trap-disarmed"]);
  assert.deepEqual(answer(disarmed), ["dice", "success", "trap-disarmed"]);

  // Walking into the unfound trap: the darts, a failed save and 2d4.
  const sprung = tagged(
    hall,
    { type: "move", destinationId: "offering-room" },
    3,
    2,
    2,
  );
  const line = sprung.find(({ text }) => text.startsWith("Dart Trap: "));
  assert.equal(line.sound, "trap-sprung");
  assert.equal(
    sprung.filter(({ sound }) => sound !== undefined).length,
    1,
    "only the trap's own line is tagged",
  );
  assert.equal(answer(sprung)[0], "trap-sprung");
});

test("a potion drunk sounds", () => {
  // Through the Swollen Door, forced open, to the potion in the cell.
  const reached = play([
    BEGIN,
    [force, 8],
    [{ type: "move", destinationId: "flooded-cell" }],
    [{ type: "examine", targetId: "wall-shelf" }],
    [{ type: "take", itemId: "cell-potion" }],
  ]);
  const drunk = tagged(
    { ...reached, character: { ...reached.character, hp: 4 } },
    { type: "use-item", itemId: "cell-potion" },
    2,
    3,
  );
  assert.deepEqual(tags(drunk), ["potion"]);
});

test("a short rest and a long rest each sound; one a wanderer interrupts does not", () => {
  const resting = createFifthRuntime(restingTunnels, ADA);
  const begun = resting.handleAction(
    resting.createSession(),
    { type: "begin" },
    dice(),
  ).state;
  const alcove = resting.handleAction(
    begun,
    { type: "move", destinationId: "alcove" },
    dice(),
  ).state;
  const tired = { ...alcove, character: { ...alcove.character, hp: 4 } };
  const rest = (action, ...values) => {
    const random = dice(...values);
    const result = resting.handleAction(tired, action, random);
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    return describeFifthResult(
      result,
      random.drawn,
      "Ada",
      resting.lineLookup,
    ).map(({ text, sound }) => [text.split(":")[0].split(".")[0], sound]);
  };
  // d100 90: no wanderer; then a hit die of 4.
  assert.deepEqual(
    rest({ type: "rest", hitDice: 1 }, 90, 4).map(([, sound]) => sound),
    [undefined, "rest-short", undefined],
  );
  assert.deepEqual(
    rest({ type: "long-rest" }, 90).map(([, sound]) => sound),
    [undefined, "rest-long"],
  );
  // d100 25: the Prowling Rat comes, and the rest restores nothing.
  const interrupted = rest({ type: "long-rest" }, 25, 15, 2);
  assert.ok(interrupted.every(([, sound]) => sound !== "rest-long"));
});
