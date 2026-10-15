// #458: compass directions on exits. Each exit takes its direction from the
// grid: the compass point from its room's cell to the other room's, or up
// or down for a passage between floors. The room panel's exits carry it,
// and so do the AI DM's scene and its move, flee and sneak tools, so its
// narration agrees with the map. The prompt says there is no tactical grid,
// but the rooms lie in directions.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_DM_CASES } from "../dist/dm-evaluation-5e.js";
import { exitDirection } from "../dist/map-5e.js";
import {
  FIFTH_PROMPT_VERSION,
  FIFTH_DM_SYSTEM_PROMPT,
  createFifthRuntime,
} from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { mapTunnels } from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });

function accepted(runtime, state, action, random = uncheckedDice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
}

const place = (at, floor = 0) => ({ at, floor });

test("an exit's direction is the compass point between the cells, or up or down", () => {
  const from = place([0, 0]);
  const expected = [
    [[0, -1], "north"],
    [[2, -2], "northeast"],
    [[3, 0], "east"],
    [[1, 1], "southeast"],
    [[0, 2], "south"],
    [[-1, 1], "southwest"],
    [[-1, 0], "west"],
    [[-4, -4], "northwest"],
  ];
  for (const [at, direction] of expected) {
    assert.equal(exitDirection(from, place(at)), direction, `to ${at}`);
  }
  // Between floors, the floor decides, wherever the other cell lies.
  assert.equal(exitDirection(from, place([1, -1], 1)), "up");
  assert.equal(exitDirection(from, place([0, 0], -1)), "down");
});

test("the room panel's exits carry their directions, a hidden one once found", () => {
  const runtime = createFifthRuntime(mapTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  const ways = (state) =>
    runtime
      .projectRoom(state)
      .exits.map(({ id, direction }) => [id, direction]);
  assert.deepEqual(ways(start), [
    ["alcove", "west"],
    ["rat-cellar", "south"],
    ["gallery", "east"],
    ["belfry", "up"],
  ]);
  const found = accepted(
    runtime,
    start,
    { type: "examine", targetId: "draughty-wall" },
    uncheckedDice(15),
  );
  assert.deepEqual(ways(found).at(-1), ["cupboard", "north"]);
  const gallery = accepted(runtime, start, MOVE("gallery"));
  assert.deepEqual(ways(gallery), [
    ["stair-foot", "west"],
    ["sump", "down"],
  ]);
});

test("the AI DM's scene and its move tool give each exit's direction", () => {
  const runtime = createFifthRuntime(mapTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.deepEqual(
    runtime
      .projectDmScene(start)
      .room.exits.map(({ destinationId, direction }) => [
        destinationId,
        direction,
      ]),
    [
      ["alcove", "west"],
      ["rat-cellar", "south"],
      ["gallery", "east"],
      ["belfry", "up"],
    ],
  );
  const move = runtime
    .getGameToolDefinitions(start)
    .find(({ name }) => name === "move");
  assert.match(
    move.description,
    /alcove \(Alcove, west\), rat-cellar \(Rat-Gnawed Cellar, south\), gallery \(Long Gallery, east\), belfry \(Belfry, up\)\.$/u,
  );
});

test("the flee and sneak tools give each exit's direction too", () => {
  const runtime = createFifthRuntime(mapTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  const tool = (state, name) =>
    runtime
      .getGameToolDefinitions(state)
      .find((definition) => definition.name === name);
  assert.match(
    tool(start, "sneak").description,
    /rat-cellar \(Rat-Gnawed Cellar, south\)/u,
  );
  // The rat's fight is on in the cellar, Ada first; she may flee back north.
  const cellar = accepted(
    runtime,
    start,
    MOVE("rat-cellar"),
    uncheckedDice(20, 20, 20, 1, 1, 1),
  );
  assert.equal(cellar.encounter?.outcome, "ongoing");
  assert.match(
    tool(cellar, "flee").description,
    /stair-foot \(Foot of the Stair, north\)/u,
  );
});

test("the prompt says there is no tactical grid, while the rooms have directions", () => {
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v45");
  assert.doesNotMatch(FIFTH_DM_SYSTEM_PROMPT, /There is no map/u);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /no tactical grid/u);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /"I go north"/u);
});

test("the DM evaluation asks the AI DM to go north from the Gate Hall", () => {
  const sample = FIFTH_DM_CASES.find(({ id }) => id === "direction-north");
  assert.ok(sample);
  assert.match(sample.playerInput, /north/iu);
  assert.deepEqual(sample.expectation, {
    kind: "action",
    name: "move",
    arguments: { destination: "broken-gate" },
  });
});
