// #557: the shipped modules call on skills, saves and Turn Undead they never
// did. Bramblecote's Brack can be calmed with Animal Handling; the Delve's
// sarcophagus opens with Religion and a crowned-skull ward on the tomb's
// arch wails for a Wisdom save, disarmed with Arcana or Religion; the
// Weirgate's kobolds rig a fire-pot, and Medicine wins Hobb's trust; ghouls
// haunt the Thornwood's undercroft.
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { createFifthRuntime, creatureTypeOf } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const modules = await loadBuiltInFifthAdventures();
const shipped = (id) => modules.find((entry) => entry.id === id);
const feature = (module, roomId, id) =>
  module.rooms
    .find((entry) => entry.id === roomId)
    .features.find((entry) => entry.id === id);
const trap = (module, passageId) =>
  module.passages.find(({ id }) => id === passageId).trap;
const approaches = (check) =>
  (check.approaches ?? [check]).map(({ skill, ability, dc }) => [
    skill ?? ability,
    dc,
  ]);

function accepted(runtime, state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

// Bramblecote (level 1): Brack's kennel.
const cider = shipped("bramblecote-cider-house");
const level1 = createFifthRuntime(cider, testFighterAt(1));
const KENNEL = { type: "use-feature", featureId: "kennel", targetId: "brack" };

/** The Fighter in the dog yard, first in initiative (20 to Brack's 1). */
const inDogYard = accepted(
  level1,
  level1.createSession(),
  { type: "move", destinationId: "dog-yard" },
  dice([20, 20], [20, 1]),
).state;

test("Brack's kennel calls for Animal Handling, once an adventure", () => {
  const { fightAction } = feature(cider, "dog-yard", "kennel");
  assert.equal(fightAction.once, "adventure");
  assert.deepEqual(approaches(fightAction.check), [["animal-handling", 13]]);
  assert.deepEqual(fightAction.bands.success.effects, [{ type: "remove" }]);
});

test("calming Brack sends him to his kennel and wins the dog yard", () => {
  const calmed = accepted(level1, inDogYard, KENNEL, dice([20, 18]));
  assert.match(level1.renderResult(calmed), /slinks back into the straw/u);
  assert.equal(calmed.state.encounter.outcome, "victory");
});

test("failing to calm Brack leaves him fighting", () => {
  const failed = accepted(level1, inDogYard, KENNEL, dice([20, 2], [20, 1]));
  assert.match(level1.renderResult(failed), /lunges to the end of his chain/u);
  assert.equal(failed.state.encounter.outcome, "ongoing");
});

// The Delve (level 2): the lord's tomb.
const delve = shipped("abandoned-delve");

test("the sarcophagus lid opens with Religion as well as Athletics or Investigation", () => {
  assert.deepEqual(
    approaches(feature(delve, "lords-tomb", "sarcophagus-lid").check),
    [
      ["athletics", 14],
      ["investigation", 13],
      ["religion", 13],
    ],
  );
});

test("the crowned-skull ward wails for a Wisdom save, 1d6 psychic, disarmed with Arcana or Religion", () => {
  const ward = trap(delve, "ossuary-to-tomb");
  assert.equal(ward.name, "Crowned-Skull Ward");
  // The Delve's search keeps showing DC 13, its lowest find DC.
  assert.equal(ward.find.dc, 13);
  assert.equal(trap(delve, "well-to-shrine").find.dc, 13);
  assert.deepEqual(ward.save, { ability: "wisdom", dc: 12 });
  // 1d6, not 2d6: a level-2 Rogue whose checks all fail walks under it
  // after the ossuary fight.
  assert.deepEqual(ward.damage, {
    dice: 1,
    sides: 6,
    modifier: 0,
    type: "psychic",
  });
  assert.deepEqual(approaches(ward.disarm), [
    ["arcana", 13],
    ["religion", 13],
  ]);
});

// The Weirgate (levels 3–4): the culvert's fire-pot and Hobb.
const weirgate = shipped("coldwater-weirgate");

test("the kobolds' bell-wire pot burns: 2d6 fire, Dexterity for half", () => {
  const pot = trap(weirgate, "drain-to-warren");
  assert.equal(pot.name, "Bell-Wire Fire-Pot");
  assert.deepEqual(pot.save, { ability: "dexterity", dc: 12 });
  assert.equal(pot.damage.type, "fire");
  // The deadfall on the keeper's stair still drops stones.
  assert.equal(trap(weirgate, "keepers-stair").damage.type, "bludgeoning");
});

test("Medicine for his chafed ankle wins Hobb's trust as Persuasion does", () => {
  const hobb = weirgate.rooms
    .find(({ id }) => id === "kennel-larder")
    .creatures.find(({ id }) => id === "hobb");
  const { check } = hobb.topics.find(({ id }) => id === "the-bell-wires");
  assert.deepEqual(approaches(check), [
    ["persuasion", 10],
    ["medicine", 10],
  ]);
  assert.match(
    feature(weirgate, "kennel-larder", "hobbs-shackle").description,
    /rubbed raw/u,
  );
});

// The Thornwood (levels 4–5): the undercroft.
const lodge = shipped("thornwood-lodge");

test("two ghouls, undead for Turn Undead, haunt the Thornwood's undercroft", () => {
  const undercroft = lodge.rooms.find(({ id }) => id === "undercroft");
  assert.equal(undercroft.encounterId, "undercroft-ghouls");
  const { opponents } = lodge.encounters.find(
    ({ id }) => id === "undercroft-ghouls",
  );
  assert.deepEqual(
    opponents.map(({ name, statBlock }) => [
      name,
      statBlock.name,
      creatureTypeOf(statBlock.type),
    ]),
    [
      ["Barrow Ghoul", "Ghoul", "undead"],
      ["Barrow Hag-Ghoul", "Ghoul", "undead"],
    ],
  );
});
