import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../dist/fighter-5e.js";
import { createFifthRuntime, healthOf } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT } from "../dist/session-5e.js";

const adventure = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "cellar-goblin",
);
// Con 14 (+2): 12 HP at level 1.
const sheet = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
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
);

function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

test("health: bloodied at half HP or less, critical at a quarter, down at 0 (#155)", () => {
  assert.equal(healthOf(12, 12), "healthy");
  assert.equal(healthOf(7, 12), "healthy");
  assert.equal(healthOf(6, 12), "bloodied");
  assert.equal(healthOf(4, 12), "bloodied");
  assert.equal(healthOf(3, 12), "critical");
  assert.equal(healthOf(1, 12), "critical");
  assert.equal(healthOf(0, 12), "down");
  assert.equal(healthOf(1, 1), "healthy");
});

test("the room view projects the character's health with its HP (#155)", () => {
  const runtime = createFifthRuntime(adventure, sheet);
  const fresh = runtime.createSession();
  assert.deepEqual(runtime.projectRoom(fresh).character, {
    hp: 12,
    maxHp: 12,
    health: "healthy",
  });
  // The goblin goes first and hits for 3 + 2.
  const hit = runtime.handleAction(
    fresh,
    { type: "begin" },
    dice(4, 17, 15, 3),
  );
  assert.deepEqual(runtime.projectRoom(hit.state).character, {
    hp: 7,
    maxHp: 12,
    health: "healthy",
  });
  // Ada misses (2 + 5) and ends her turn; the goblin hits for 4 + 2.
  const missed = runtime.handleAction(
    hit.state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice(2),
  );
  const ended = runtime.handleAction(
    missed.state,
    { type: "end-turn", actorId: "pc" },
    dice(15, 4),
  );
  assert.deepEqual(runtime.projectRoom(ended.state).character, {
    hp: 1,
    maxHp: 12,
    health: "critical",
  });
});

test("the turn view counts the actions this turn: two after Action Surge (#155)", () => {
  const xp = 300;
  const leveled = { ...sheet, xp, level: levelForXp(xp) };
  const veteran = validateFighter({
    ...leveled,
    hp: fighterProfile(leveled).maxHp,
  });
  const runtime = createFifthRuntime(adventure, veteran);
  // Ada first (15 against 3).
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(15, 3),
  ).state;
  assert.equal(runtime.projectFight(begun).turn.actions, 1);
  assert.equal(runtime.projectFight(begun).turn.maxActions, 1);
  const surged = runtime.handleAction(
    begun,
    { type: "action-surge", actorId: "pc" },
    dice(),
  ).state;
  assert.equal(runtime.projectFight(surged).turn.actions, 2);
  assert.equal(runtime.projectFight(surged).turn.maxActions, 2);
  // A miss (2 + 5) spends one of the two.
  const missed = runtime.handleAction(
    surged,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice(2),
  ).state;
  assert.equal(runtime.projectFight(missed).turn.actions, 1);
  assert.equal(runtime.projectFight(missed).turn.maxActions, 2);
});

test("adventure saves are in format version 14 (#155, #132, #133, #206, #207, #208, #209, #144, #210, #224)", () => {
  assert.equal(FIFTH_SESSION_FORMAT, 14);
});
