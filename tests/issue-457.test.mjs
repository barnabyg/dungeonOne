// #457: the fog-of-war map. The engine projects the rooms visited, each on
// its cell and floor with its region, and every way out of them the
// character can see, once each: a way to a room not yet visited names only
// that room's cell and floor, never the room. A hidden passage shows once a
// band opens it; a closed way, a door and a found trap are marked; a way
// from the character's room names the room it moves to. It is worked out
// from the session's visited rooms, so the formats don't change.
import assert from "node:assert/strict";
import test from "node:test";

import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  mapTunnels,
  quayStrongroom,
  shiftingOssuary,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });

function accepted(runtime, state, action, random = uncheckedDice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
}

/** Each way as `from > to`, a room by id and a cell not visited as `x,y/floor`. */
const ways = (map) =>
  map.ways.map(({ between, ...rest }) => {
    const [from, to] = between.map(
      ({ room, at, floor }) => room ?? `${at[0]},${at[1]}/${floor}`,
    );
    return { way: `${from} > ${to}`, ...rest };
  });

test("the formats stay as they were", () => {
  assert.equal(FIFTH_SESSION_FORMAT, 62);
});

test("the map shows the rooms visited, and ways to the rooms beyond by cell only", () => {
  const runtime = createFifthRuntime(mapTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  const map = runtime.projectMap(start);
  assert.equal(map.floor, 0);
  assert.deepEqual(map.rooms, [
    {
      id: "stair-foot",
      name: "Foot of the Stair",
      at: [1, 0],
      floor: 0,
      region: { name: "Upper Tunnels", shade: 0 },
      current: true,
    },
  ]);
  assert.deepEqual(ways(map), [
    { way: "stair-foot > 0,0/0", move: "alcove" },
    { way: "stair-foot > 1,1/0", move: "rat-cellar" },
    // Two cells east: its stub is the gallery's own cell, not the next one.
    { way: "stair-foot > 3,0/0", move: "gallery" },
    { way: "stair-foot > 2,-1/1", vertical: "stairs", move: "belfry" },
  ]);
  // No room not yet visited is named, nor any region not yet entered.
  const text = JSON.stringify(map);
  for (const name of [
    "Alcove",
    "Rat-Gnawed Cellar",
    "Long Gallery",
    "Belfry",
    "Lower Tunnels",
  ]) {
    assert.equal(text.includes(name), false, name);
  }
});

test("each way shows once, and moves only from the character's room", () => {
  const runtime = createFifthRuntime(mapTunnels, TEST_FIGHTER);
  const inGallery = accepted(runtime, runtime.createSession(), MOVE("gallery"));
  const map = runtime.projectMap(inGallery);
  assert.deepEqual(
    map.rooms.map(({ id, current }) => (current ? `${id}!` : id)),
    ["stair-foot", "gallery!"],
  );
  assert.deepEqual(ways(map), [
    { way: "stair-foot > 0,0/0" },
    { way: "stair-foot > 1,1/0" },
    { way: "stair-foot > gallery", move: "stair-foot" },
    { way: "stair-foot > 2,-1/1", vertical: "stairs" },
    { way: "gallery > 3,0/-1", vertical: "ladder", move: "sump" },
  ]);

  // Down the ladder, the map opens on floor −1, in the Lower Tunnels.
  const inSump = accepted(runtime, inGallery, MOVE("sump"));
  const below = runtime.projectMap(inSump);
  assert.equal(below.floor, -1);
  assert.deepEqual(below.rooms.at(-1), {
    id: "sump",
    name: "Sump",
    at: [3, 0],
    floor: -1,
    region: { name: "Lower Tunnels", shade: 1 },
    current: true,
  });
  assert.deepEqual(ways(below).at(-1), {
    way: "gallery > sump",
    vertical: "ladder",
    move: "gallery",
  });
});

test("a hidden passage shows once found; a door and a closed way are marked", () => {
  const runtime = createFifthRuntime(shiftingOssuary, TEST_FIGHTER);
  const begun = accepted(runtime, runtime.createSession(), { type: "begin" });
  const inHall = accepted(runtime, begun, MOVE("bone-hall"));
  assert.deepEqual(ways(runtime.projectMap(inHall)), [
    { way: "ossuary-gate > bone-hall", move: "ossuary-gate" },
    { way: "bone-hall > 2,0/0", move: "tomb" },
    {
      way: "bone-hall > 1,1/0",
      door: { name: "Rotten Door", open: false },
      move: "side-crypt",
    },
  ]);

  const found = accepted(
    runtime,
    inHall,
    { type: "examine", targetId: "skull-wall" },
    dice([20, 10]),
  );
  assert.deepEqual(ways(runtime.projectMap(found))[2], {
    way: "bone-hall > 1,-1/0",
    move: "reliquary",
  });

  // A failed force brings the ceiling down: the way is closed, its door gone.
  const closed = accepted(
    runtime,
    inHall,
    { type: "force", doorId: "rotten-door" },
    dice([20, 1]),
  );
  assert.deepEqual(ways(runtime.projectMap(closed))[2], {
    way: "bone-hall > 1,1/0",
    closed: true,
    move: "side-crypt",
  });
});

test("a trap shows once found, and a way from a room left behind keeps its marks", () => {
  const runtime = createFifthRuntime(quayStrongroom, TEST_FIGHTER);
  const start = runtime.createSession();
  // Projected from a state set by hand: the hall visited, the blade found.
  const state = {
    ...start,
    roomId: "toll-arch",
    visitedRoomIds: ["quay-steps", "toll-arch", "counting-hall"],
  };
  const hall = (map) =>
    ways(map).filter(({ way }) => way.startsWith("counting-hall"));
  assert.deepEqual(hall(runtime.projectMap(state)), [
    { way: "counting-hall > 2,0/1", vertical: "stairs" },
    {
      way: "counting-hall > 3,0/0",
      door: { name: "Strongroom Door", open: false },
    },
  ]);
  const found = { ...state, foundTrapIds: ["scything-blade"] };
  assert.deepEqual(hall(runtime.projectMap(found))[0], {
    way: "counting-hall > 2,0/1",
    vertical: "stairs",
    trap: { name: "Scything Blade", state: "armed" },
  });
});
