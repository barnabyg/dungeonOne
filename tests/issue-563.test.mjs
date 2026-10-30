// #563: the map marks the rest sites among the rooms visited, and says none
// of the rooms beyond is one. With the long rest setting off no room is a rest
// site and the key has no entry for them.
import assert from "node:assert/strict";
import test from "node:test";

import { createFifthRuntime } from "../dist/runtime-5e.js";
import { DEFAULT_SETTINGS } from "../dist/settings-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { restingTunnels } from "./fixtures/modules.mjs";

const inAlcove = (runtime) => {
  const start = runtime.createSession();
  const { state, rejection } = runtime.handleAction(
    start,
    { type: "move", destinationId: "alcove" },
    uncheckedDice(),
  );
  assert.equal(rejection, undefined, rejection?.reason);
  return { start, state };
};

const restSites = (map) =>
  map.rooms.filter(({ restSite }) => restSite).map(({ id }) => id);

test("the map marks a rest site only once it has been visited", () => {
  const runtime = createFifthRuntime(restingTunnels, TEST_FIGHTER);
  const { start, state } = inAlcove(runtime);
  const before = runtime.projectMap(start);
  assert.equal(before.restSites, true);
  assert.deepEqual(restSites(before), []);
  assert.deepEqual(restSites(runtime.projectMap(state)), ["alcove"]);
});

test("the mark stays after the character has left the rest site", () => {
  const runtime = createFifthRuntime(restingTunnels, TEST_FIGHTER);
  const { start, state } = inAlcove(runtime);
  const { state: back, rejection } = runtime.handleAction(
    state,
    { type: "move", destinationId: start.roomId },
    uncheckedDice(),
  );
  assert.equal(rejection, undefined, rejection?.reason);
  assert.deepEqual(restSites(runtime.projectMap(back)), ["alcove"]);
});

test("with the long rest setting off, the map shows no rest site", () => {
  const runtime = createFifthRuntime(
    restingTunnels,
    TEST_FIGHTER,
    {},
    { ...DEFAULT_SETTINGS, longRest: "off" },
  );
  const map = runtime.projectMap(inAlcove(runtime).state);
  assert.equal(map.restSites, undefined);
  assert.deepEqual(restSites(map), []);
});
