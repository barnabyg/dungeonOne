import assert from "node:assert/strict";
import test from "node:test";

import { createSession, handleAction } from "../dist/session.js";

test("read commands expose the fighter and entrance without changing state", () => {
  const initial = createSession();

  assert.deepEqual(initial, {
    locationId: "entrance",
    status: "playing",
    fighter: {
      hp: 20,
      maxHp: 20,
      equipmentIds: ["longsword"],
    },
    inventoryItemIds: [],
  });

  const look = handleAction(initial, { type: "look" });
  const status = handleAction(look.state, { type: "status" });
  const inventory = handleAction(status.state, { type: "inventory" });

  assert.deepEqual(look.state, initial);
  assert.deepEqual(status.state, initial);
  assert.deepEqual(inventory.state, initial);
  assert.deepEqual(look.events, [
    {
      type: "room-described",
      roomId: "entrance",
      featureIds: ["ruined-archway"],
      exitRoomIds: ["guardroom"],
    },
  ]);
  assert.deepEqual(status.events, [
    { type: "status-described", hp: 20, maxHp: 20, status: "playing" },
  ]);
  assert.deepEqual(inventory.events, [
    {
      type: "inventory-described",
      equipmentIds: ["longsword"],
      itemIds: [],
    },
  ]);
});

test("movement visits all three rooms and supports backtracking", () => {
  const initial = createSession();
  const guardroom = handleAction(initial, {
    type: "move",
    destination: "guardroom",
  });
  const reliquary = handleAction(guardroom.state, {
    type: "move",
    destination: "reliquary",
  });
  const backtracked = handleAction(reliquary.state, {
    type: "move",
    destination: "guardroom",
  });

  assert.equal(guardroom.state.locationId, "guardroom");
  assert.equal(reliquary.state.locationId, "reliquary");
  assert.equal(backtracked.state.locationId, "guardroom");
  assert.deepEqual(guardroom.events, [
    { type: "room-entered", fromRoomId: "entrance", roomId: "guardroom" },
    {
      type: "room-described",
      roomId: "guardroom",
      featureIds: ["cold-hearth"],
      exitRoomIds: ["entrance", "reliquary"],
    },
  ]);
});

test("inspection is limited to visible features and named exits", () => {
  const initial = createSession();
  const feature = handleAction(initial, {
    type: "inspect",
    target: "ruined archway",
  });
  const exit = handleAction(initial, {
    type: "inspect",
    target: "guardroom",
  });
  const invisible = handleAction(initial, {
    type: "inspect",
    target: "pedestal",
  });
  const internalId = handleAction(initial, {
    type: "inspect",
    target: "ruined-archway",
  });

  assert.deepEqual(feature.events, [
    {
      type: "target-inspected",
      target: { type: "feature", id: "ruined-archway" },
    },
  ]);
  assert.deepEqual(exit.events, [
    {
      type: "target-inspected",
      target: { type: "exit", id: "guardroom" },
    },
  ]);
  assert.deepEqual(invisible.state, initial);
  assert.deepEqual(invisible.rejection, {
    reason: "invisible-target",
    target: "pedestal",
  });
  assert.deepEqual(internalId.rejection, {
    reason: "invisible-target",
    target: "ruined-archway",
  });
});

test("malformed and illegal movement is rejected without changing state", () => {
  const initial = createSession();
  const omittedInspect = handleAction(initial, { type: "inspect" });
  const omittedMove = handleAction(initial, { type: "move" });
  const missingInspect = handleAction(initial, {
    type: "inspect",
    target: "",
  });
  const missingMove = handleAction(initial, { type: "move", destination: "" });
  const unknownMove = handleAction(initial, {
    type: "move",
    destination: "cellar",
  });
  const nonadjacentMove = handleAction(initial, {
    type: "move",
    destination: "reliquary",
  });

  for (const result of [
    omittedInspect,
    omittedMove,
    missingInspect,
    missingMove,
    unknownMove,
    nonadjacentMove,
  ]) {
    assert.deepEqual(result.state, initial);
    assert.equal("events" in result, false);
  }
  assert.deepEqual(omittedInspect.rejection, {
    reason: "missing-argument",
    command: "inspect",
  });
  assert.deepEqual(omittedMove.rejection, {
    reason: "missing-argument",
    command: "move",
  });
  assert.deepEqual(missingInspect.rejection, {
    reason: "missing-argument",
    command: "inspect",
  });
  assert.deepEqual(missingMove.rejection, {
    reason: "missing-argument",
    command: "move",
  });
  assert.deepEqual(unknownMove.rejection, {
    reason: "unknown-destination",
    destination: "cellar",
  });
  assert.deepEqual(nonadjacentMove.rejection, {
    reason: "nonadjacent-destination",
    destinationId: "reliquary",
  });
});

test("help keeps a fresh session playable and leaves its state unchanged", () => {
  const initial = createSession();
  const result = handleAction(initial, { type: "help" });

  assert.deepEqual(result.state, initial);
  assert.equal(result.events[0].type, "help-requested");
  assert.equal(result.events[0].commands.includes("quit"), true);
});

test("rejected input leaves the session usable", () => {
  const initial = createSession();
  const empty = handleAction(initial, { type: "empty" });
  const unknown = handleAction(empty.state, {
    type: "unknown",
    input: "dance",
  });

  assert.deepEqual(empty.state, initial);
  assert.deepEqual(empty.rejection, { reason: "empty" });
  assert.deepEqual(unknown.state, initial);
  assert.deepEqual(unknown.rejection, {
    reason: "unknown-command",
    input: "dance",
  });
  assert.equal(
    handleAction(unknown.state, { type: "help" }).events[0].type,
    "help-requested",
  );
});

test("quit ends the session without a gameplay outcome", () => {
  const result = handleAction(createSession(), { type: "quit" });

  assert.equal(result.state.locationId, "entrance");
  assert.equal(result.state.status, "quit");
  assert.deepEqual(result.events, [{ type: "session-quit" }]);
});
