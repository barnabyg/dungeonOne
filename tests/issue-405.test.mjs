// #405: the known rooms. The engine projects every room the character has
// visited or seen through an exit, grouped by region, with the current room
// marked; each visited room carries its record: the discoveries made there,
// the creatures talked to and what they said, its doors and the traps
// found, and how its fight stands. The session remembers the rooms visited
// and the fights fled, so the record survives a reload. Session 62, trace 56.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { ratTunnels, regionTunnels, sealedCrypt } from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const FLEE = (destinationId) => ({ type: "flee", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });
const LANTERN =
  'Scratched into the lantern\'s base: "Rats in the cellar. Boss in the den."';

function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** Each region's name and its rooms as `id`, `id*` (visited) or `id*!` (here). */
const outline = (known) =>
  known.map(({ region, rooms }) => [
    region,
    rooms.map(
      ({ id, visited, current }) =>
        `${id}${visited ? "*" : ""}${current ? "!" : ""}`,
    ),
  ]);

const knownRoom = (runtime, state, id) =>
  runtime
    .projectKnownRooms(state)
    .flatMap(({ rooms }) => rooms)
    .find((entry) => entry.id === id);

test("the formats bump", () => {
  assert.equal(FIFTH_SESSION_FORMAT, 68);
  assert.equal(FIFTH_TRACE_FORMAT, 63);
});

test("the known rooms are those visited and those seen through an exit, by region", () => {
  const runtime = createFifthRuntime(regionTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.deepEqual(start.visitedRoomIds, ["stair-foot"]);
  // The den is behind the cellar: not seen yet.
  assert.deepEqual(outline(runtime.projectKnownRooms(start)), [
    ["Upper Tunnels", ["stair-foot*!", "alcove"]],
    ["Lower Tunnels", ["rat-cellar"]],
  ]);
  // A room only seen has a name and no record.
  assert.deepEqual(knownRoom(runtime, start, "alcove"), {
    id: "alcove",
    name: "Alcove",
    visited: false,
  });
  const alcove = accepted(runtime, start, MOVE("alcove")).state;
  assert.deepEqual(alcove.visitedRoomIds, ["stair-foot", "alcove"]);
  assert.deepEqual(outline(runtime.projectKnownRooms(alcove)), [
    ["Upper Tunnels", ["stair-foot*", "alcove*!"]],
    ["Lower Tunnels", ["rat-cellar"]],
  ]);
  // Going back adds no second visit.
  const back = accepted(runtime, alcove, MOVE("stair-foot")).state;
  assert.deepEqual(back.visitedRoomIds, ["stair-foot", "alcove"]);
  // A module without regions has one group, with no region.
  const plain = createFifthRuntime(ratTunnels, TEST_FIGHTER);
  assert.deepEqual(outline(plain.projectKnownRooms(plain.createSession())), [
    [undefined, ["stair-foot*!", "alcove", "rat-cellar"]],
  ]);
});

test("a visited room's record keeps its discoveries after the character moves on", () => {
  const runtime = createFifthRuntime(regionTunnels, TEST_FIGHTER);
  let state = runtime.createSession();
  assert.deepEqual(knownRoom(runtime, state, "stair-foot").record, {
    discoveries: [],
    creatures: [],
    doors: [],
    traps: [],
  });
  state = accepted(runtime, state, EXAMINE("rusted-lantern")).state;
  state = accepted(runtime, state, MOVE("alcove")).state;
  assert.deepEqual(knownRoom(runtime, state, "stair-foot").record, {
    discoveries: [{ name: "Rusted Lantern", discovery: LANTERN }],
    creatures: [],
    doors: [],
    traps: [],
  });
  // A feature not yet examined shows nothing.
  assert.deepEqual(knownRoom(runtime, state, "alcove").record.discoveries, []);
});

test("a room's fight is under way, fled from, won, slipped past, ended peacefully or still waiting", () => {
  const runtime = createFifthRuntime(regionTunnels, TEST_FIGHTER);
  const fight = (state) => knownRoom(runtime, state, "rat-cellar").record.fight;
  // Initiative: the character 20, the rat 1.
  const fighting = accepted(
    runtime,
    runtime.createSession(),
    MOVE("rat-cellar"),
    20,
    1,
  ).state;
  assert.deepEqual(fight(fighting), {
    status: "under-way",
    opponents: ["Giant Rat"],
  });
  // The rat's parting bite misses.
  const fled = accepted(runtime, fighting, FLEE("stair-foot"), 2).state;
  assert.deepEqual(fled.fledEncounterIds, ["cellar-rat"]);
  assert.deepEqual(fight(fled), { status: "fled", opponents: ["Giant Rat"] });
  // The den, seen through the cellar's exit, has no record: its fight
  // isn't known.
  assert.deepEqual(knownRoom(runtime, fled, "den"), {
    id: "den",
    name: "Smugglers' Den",
    visited: false,
  });
  for (const [change, status] of [
    [{ clearedEncounterIds: ["cellar-rat"] }, "won"],
    [{ peacefulEncounterIds: ["cellar-rat"] }, "peaceful"],
    [{ bypassedEncounterIds: ["cellar-rat"] }, "bypassed"],
    [{ fledEncounterIds: [] }, "waiting"],
  ]) {
    assert.equal(fight({ ...fled, ...change }).status, status);
  }
  // A room without a fight has none.
  assert.equal(knownRoom(runtime, fled, "stair-foot").record.fight, undefined);
});

test("a visited room's record names the creatures talked to, its doors and the traps found", () => {
  const runtime = createFifthRuntime(sealedCrypt, TEST_FIGHTER);
  let state = runtime.createSession();
  // The swollen door is stuck.
  assert.deepEqual(knownRoom(runtime, state, "crypt-stair").record.doors, [
    { name: "Swollen Door", to: "Flooded Cell", open: false },
  ]);
  state = accepted(runtime, state, MOVE("hall")).state;
  state = accepted(runtime, state, {
    type: "talk",
    topicId: "warden",
  }).state;
  // The dart trap is found by searching the hall: a natural 20.
  state = accepted(
    runtime,
    state,
    { type: "search", roomId: "hall" },
    20,
  ).state;
  state = accepted(runtime, state, MOVE("crypt-stair")).state;
  const hall = knownRoom(runtime, state, "hall").record;
  assert.equal(hall.creatures.length, 1);
  assert.equal(hall.creatures[0].name, "Bound Smuggler");
  assert.deepEqual(
    hall.creatures[0].said.map(({ topic }) => topic),
    ["the warden"],
  );
  assert.match(hall.creatures[0].said[0].said, /the warden climbed out/u);
  assert.deepEqual(hall.doors, [
    { name: "Iron Door", to: "Strongroom", open: false },
  ]);
  assert.deepEqual(hall.traps, [
    { name: "Dart Trap", to: "Offering Room", state: "armed" },
  ]);
  // A creature not talked to isn't listed.
  const fresh = accepted(runtime, runtime.createSession(), MOVE("hall")).state;
  assert.deepEqual(knownRoom(runtime, fresh, "hall").record.creatures, []);
});

test("the known rooms survive a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-405-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "a".repeat(32),
      0,
      regionTunnels,
      TEST_FIGHTER,
    );
    for (const action of [
      EXAMINE("rusted-lantern"),
      MOVE("alcove"),
      EXAMINE("iron-chest"),
    ]) {
      const { result } = session.act(action, "click");
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    await session.persist();
    const loaded = await FifthSession.load(path, [regionTunnels]);
    assert.deepEqual(loaded.state.visitedRoomIds, ["stair-foot", "alcove"]);
    assert.deepEqual(
      loaded.runtime.projectKnownRooms(loaded.state),
      session.runtime.projectKnownRooms(session.state),
    );
    assert.deepEqual(
      knownRoom(loaded.runtime, loaded.state, "stair-foot").record.discoveries,
      [{ name: "Rusted Lantern", discovery: LANTERN }],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
