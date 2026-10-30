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
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  mapTunnels,
  moduleFile,
  quayStrongroom,
  shiftingOssuary,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });

function accepted(runtime, state, action, random = uncheckedDice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
}

/** Each passage as `from > to`, a room by id and a cell not visited as `x,y/floor`. */
const passages = (map) =>
  map.passages.map(({ between, ...rest }) => {
    const [from, to] = between.map(
      ({ room, at, floor }) => room ?? `${at[0]},${at[1]}/${floor}`,
    );
    return { passage: `${from} > ${to}`, ...rest };
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
  assert.deepEqual(passages(map), [
    { passage: "stair-foot > 0,0/0", move: "alcove" },
    { passage: "stair-foot > 1,1/0", move: "rat-cellar" },
    // Two cells east: its stub is the gallery's own cell, not the next one.
    { passage: "stair-foot > 3,0/0", move: "gallery" },
    { passage: "stair-foot > 2,-1/1", vertical: "stairs", move: "belfry" },
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
  assert.deepEqual(passages(map), [
    { passage: "stair-foot > 0,0/0" },
    { passage: "stair-foot > 1,1/0" },
    { passage: "stair-foot > gallery", move: "stair-foot" },
    { passage: "stair-foot > 2,-1/1", vertical: "stairs" },
    { passage: "gallery > 3,0/-1", vertical: "ladder", move: "sump" },
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
  assert.deepEqual(passages(below).at(-1), {
    passage: "gallery > sump",
    vertical: "ladder",
    move: "gallery",
  });
});

test("a hidden passage shows once found; a door and a closed way are marked", () => {
  const runtime = createFifthRuntime(shiftingOssuary, TEST_FIGHTER);
  const begun = accepted(runtime, runtime.createSession(), { type: "begin" });
  const inHall = accepted(runtime, begun, MOVE("bone-hall"));
  assert.deepEqual(passages(runtime.projectMap(inHall)), [
    { passage: "ossuary-gate > bone-hall", move: "ossuary-gate" },
    { passage: "bone-hall > 2,0/0", move: "tomb" },
    {
      passage: "bone-hall > 1,1/0",
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
  assert.deepEqual(passages(runtime.projectMap(found))[2], {
    passage: "bone-hall > 1,-1/0",
    move: "reliquary",
  });

  // A failed force brings the ceiling down: the way is closed, its door gone.
  const closed = accepted(
    runtime,
    inHall,
    { type: "force", doorId: "rotten-door" },
    dice([20, 1]),
  );
  assert.deepEqual(passages(runtime.projectMap(closed))[2], {
    passage: "bone-hall > 1,1/0",
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
    passages(map).filter(({ passage }) => passage.startsWith("counting-hall"));
  assert.deepEqual(hall(runtime.projectMap(state)), [
    { passage: "counting-hall > 2,0/1", vertical: "stairs" },
    {
      passage: "counting-hall > 3,0/0",
      door: { name: "Strongroom Door", open: false },
    },
  ]);
  const found = { ...state, foundTrapIds: ["scything-blade"] };
  assert.deepEqual(hall(runtime.projectMap(found))[0], {
    passage: "counting-hall > 2,0/1",
    vertical: "stairs",
    trap: { name: "Scything Blade", state: "armed" },
  });
});

test("a closed way keeps its found trap, as on the room panel", () => {
  // The shifting ossuary with a trap on the rotten door's way.
  const file = moduleFile("shifting-ossuary");
  const trapped = file.passages.find(({ id }) => id === "hall-to-side");
  trapped.trap = structuredClone(
    moduleFile("quay-strongroom").passages.find(({ trap }) => trap).trap,
  );
  trapped.trap.defeatEndingId = file.endings.find(
    ({ kind }) => kind === "defeat",
  ).id;
  const runtime = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const begun = accepted(runtime, runtime.createSession(), { type: "begin" });
  const inHall = {
    ...accepted(runtime, begun, MOVE("bone-hall")),
    foundTrapIds: ["scything-blade"],
  };
  const closed = accepted(
    runtime,
    inHall,
    { type: "force", doorId: "rotten-door" },
    dice([20, 1]),
  );
  // Its door is gone, but the trap found stays marked.
  assert.deepEqual(passages(runtime.projectMap(closed))[2], {
    passage: "bone-hall > 1,1/0",
    closed: true,
    trap: { name: "Scything Blade", state: "armed" },
    move: "side-crypt",
  });
  const exit = runtime
    .projectRoom(closed)
    .exits.find(({ id }) => id === "side-crypt");
  assert.equal(exit.route, "closed");
  assert.equal(exit.door, undefined);
  assert.equal(exit.trap.state, "armed");
});
