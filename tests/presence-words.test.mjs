// Words of an encounter's presence (#621): a room or a passage may mark
// words, such as a sound beyond a door, shown only while a named encounter
// is unsettled and there: in the room or next to it, or beyond the passage
// from the character's side. Won, ended peacefully or moved away, the words go.
import assert from "node:assert/strict";
import test from "node:test";

import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import { goblinYardFile } from "./fixtures/modules.mjs";

const MUTTERS = "Something mutters below.";
const MUTTERING = "A voice mutters down the steps.";

/** The goblin yard, its yard and its steps marked with the goblin's words. */
const markedFile = () => {
  const file = structuredClone(goblinYardFile);
  const yard = file.rooms.find(({ id }) => id === "yard");
  yard.presence = { encounter: "lone-goblin", text: MUTTERING };
  file.passages.find(({ id }) => id === "yard-to-cellar").presence = {
    encounter: "lone-goblin",
    text: MUTTERS,
  };
  return file;
};

function accepted(runtime, state, action) {
  const result = runtime.handleAction(state, action, dice());
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
}

const yardWords = (runtime, state) => {
  const room = runtime.projectRoom(state);
  return {
    room: room.description,
    steps: room.exits.find(({ id }) => id === "cellar").description,
  };
};

test("a room's and a passage's marked words show while the fight beyond is unsettled (#621)", () => {
  const runtime = createFifthRuntime(
    validateModule(markedFile()),
    TEST_FIGHTER,
  );
  const begun = accepted(runtime, runtime.createSession(), { type: "begin" });
  assert.deepEqual(yardWords(runtime, begun), {
    room: `A muddy yard behind the inn. Steps lead down to the cellar. ${MUTTERING}`,
    steps: `Steps down to the cellar. ${MUTTERS}`,
  });
  assert.match(
    JSON.stringify(runtime.projectDmScene(begun)),
    new RegExp(MUTTERS, "u"),
  );

  // Won, the words go.
  const won = { ...begun, clearedEncounterIds: ["lone-goblin"] };
  assert.deepEqual(yardWords(runtime, won), {
    room: "A muddy yard behind the inn. Steps lead down to the cellar.",
    steps: "Steps down to the cellar.",
  });
  // So they do once it ended peacefully.
  const spared = { ...begun, peacefulEncounterIds: ["lone-goblin"] };
  assert.equal(yardWords(runtime, spared).steps, "Steps down to the cellar.");
});

test("the marked words go once the encounter has withdrawn (#621)", () => {
  // The goblin may slip away, so its fight no longer ends the adventure:
  // the yard is a way out.
  const file = markedFile();
  const goblin = file.encounters.find(({ id }) => id === "lone-goblin");
  delete goblin.victoryEndingId;
  file.endings.find(({ id }) => id === "goblin-defeated").kind =
    "escape-without-loot";
  file.rooms.find(({ id }) => id === "yard").exit = true;
  file.flags = ["goblin-gone"];
  file.endings.push({
    id: "off-with-the-purse",
    kind: "escape-with-loot",
    title: "Off with the purse",
    text: "You leave the yard with what you found.",
  });
  file.rooms
    .find(({ id }) => id === "yard")
    .features.find(({ id }) => id === "woodpile").sets = "goblin-gone";
  goblin.presentUntil = "goblin-gone";
  const runtime = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const begun = accepted(runtime, runtime.createSession(), { type: "begin" });
  assert.equal(
    yardWords(runtime, begun).steps,
    `Steps down to the cellar. ${MUTTERS}`,
  );
  const gone = accepted(runtime, begun, {
    type: "examine",
    targetId: "woodpile",
  });
  assert.deepEqual(yardWords(runtime, gone), {
    room: "A muddy yard behind the inn. Steps lead down to the cellar.",
    steps: "Steps down to the cellar.",
  });
});

test("a module's marked words name an encounter that can be there (#621)", () => {
  const unknown = markedFile();
  unknown.passages[0].presence.encounter = "no-such-fight";
  assert.throws(() => validateModule(unknown), /no-such-fight/u);
});

test("a passage's marked words show only from the far side of the fight (#621)", () => {
  const runtime = createFifthRuntime(
    validateModule(markedFile()),
    TEST_FIGHTER,
  );
  const begun = accepted(runtime, runtime.createSession(), { type: "begin" });
  // Sneaked into the cellar, the goblin is here, not beyond the steps.
  const sneaked = runtime.handleAction(
    begun,
    { type: "sneak", destinationId: "cellar" },
    uncheckedDice(20),
  );
  assert.equal(sneaked.rejection, undefined, sneaked.rejection?.reason);
  const steps = runtime
    .projectRoom(sneaked.state)
    .exits.find(({ id }) => id === "yard");
  assert.equal(steps.description, "Steps down to the cellar.");
});
