import assert from "node:assert/strict";
import test from "node:test";

import { createSession, handleAction } from "../dist/session.js";

function afterGoblinVictory(state) {
  return {
    ...state,
    opponents: {
      ...state.opponents,
      goblin: { ...state.opponents.goblin, hp: 0 },
    },
  };
}

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
    itemPlacements: {
      signet: {
        type: "room",
        roomId: "reliquary",
        featureId: "stone-pedestal",
      },
    },
    doorStates: { "entrance-door": { open: false } },
    opponents: { goblin: { hp: 7, maxHp: 7 } },
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
      visibleItems: [],
      exitRoomIds: ["guardroom"],
      doorways: [
        {
          doorId: "entrance-door",
          destinationId: "guardroom",
          open: false,
        },
      ],
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
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  const reliquary = handleAction(afterGoblinVictory(guardroom.state), {
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
  assert.deepEqual(guardroom.events.slice(0, 2), [
    { type: "room-entered", fromRoomId: "entrance", roomId: "guardroom" },
    {
      type: "room-described",
      roomId: "guardroom",
      featureIds: ["cold-hearth"],
      visibleItems: [],
      exitRoomIds: ["entrance", "reliquary"],
      doorways: [
        {
          doorId: "entrance-door",
          destinationId: "entrance",
          open: true,
        },
      ],
    },
  ]);
});

test("taking the signet transfers it from the reliquary pedestal to inventory", () => {
  const initial = createSession();
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  const reliquary = handleAction(afterGoblinVictory(guardroom.state), {
    type: "move",
    destination: "reliquary",
  });
  const taken = handleAction(reliquary.state, {
    type: "take",
    target: "signet",
  });
  const inventory = handleAction(taken.state, { type: "inventory" });

  assert.deepEqual(reliquary.state.itemPlacements, {
    signet: {
      type: "room",
      roomId: "reliquary",
      featureId: "stone-pedestal",
    },
  });
  assert.deepEqual(taken.events, [{ type: "item-taken", itemId: "signet" }]);
  assert.deepEqual(taken.state.itemPlacements, {
    signet: { type: "inventory" },
  });
  assert.deepEqual(inventory.events, [
    {
      type: "inventory-described",
      equipmentIds: ["longsword"],
      itemIds: ["signet"],
    },
  ]);
});

test("the signet is visible only in its room and remains inspectable when carried", () => {
  const initial = createSession();
  const entranceLook = handleAction(initial, { type: "look" });
  const remoteInspect = handleAction(initial, {
    type: "inspect",
    target: "signet",
  });
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  const reliquary = handleAction(afterGoblinVictory(guardroom.state), {
    type: "move",
    destination: "reliquary",
  });
  const roomInspect = handleAction(reliquary.state, {
    type: "inspect",
    target: "signet",
  });
  const taken = handleAction(reliquary.state, {
    type: "take",
    target: "signet",
  });
  const afterTakeLook = handleAction(taken.state, { type: "look" });
  const carriedInspect = handleAction(taken.state, {
    type: "inspect",
    target: "signet",
  });

  assert.deepEqual(entranceLook.events[0].visibleItems, []);
  assert.deepEqual(remoteInspect.state, initial);
  assert.deepEqual(remoteInspect.rejection, {
    reason: "invisible-target",
    target: "signet",
  });
  assert.deepEqual(reliquary.events[1].visibleItems, [
    { itemId: "signet", featureId: "stone-pedestal" },
  ]);
  assert.deepEqual(roomInspect.events, [
    { type: "target-inspected", target: { type: "item", id: "signet" } },
  ]);
  assert.deepEqual(afterTakeLook.events[0].visibleItems, []);
  assert.deepEqual(carriedInspect.events, [
    { type: "target-inspected", target: { type: "item", id: "signet" } },
  ]);
});

test("take rejects missing, unknown, remote, and duplicate targets atomically", () => {
  const initial = createSession();
  const missing = handleAction(initial, { type: "take" });
  const unknown = handleAction(initial, { type: "take", target: "gem" });
  const remote = handleAction(initial, { type: "take", target: "signet" });
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  const reliquary = handleAction(afterGoblinVictory(guardroom.state), {
    type: "move",
    destination: "reliquary",
  });
  const taken = handleAction(reliquary.state, {
    type: "take",
    target: "signet",
  });
  const duplicate = handleAction(taken.state, {
    type: "take",
    target: "signet",
  });

  assert.deepEqual(missing.rejection, {
    reason: "missing-argument",
    command: "take",
  });
  assert.deepEqual(unknown.rejection, {
    reason: "invisible-target",
    target: "gem",
  });
  assert.deepEqual(remote.rejection, {
    reason: "invisible-target",
    target: "signet",
  });
  assert.deepEqual(duplicate.rejection, {
    reason: "already-carried",
    itemId: "signet",
  });
  for (const [result, expectedState] of [
    [missing, initial],
    [unknown, initial],
    [remote, initial],
    [duplicate, taken.state],
  ]) {
    assert.deepEqual(result.state, expectedState);
    assert.equal("events" in result, false);
  }
});

test("the entrance door blocks movement until opened and stays open from both sides", () => {
  const initial = createSession();
  const blocked = handleAction(initial, {
    type: "move",
    destination: "guardroom",
  });
  const opened = handleAction(blocked.state, {
    type: "open",
    target: "wooden door",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  const backtracked = handleAction(afterGoblinVictory(guardroom.state), {
    type: "move",
    destination: "entrance",
  });

  assert.deepEqual(blocked.state, initial);
  assert.deepEqual(blocked.rejection, {
    reason: "closed-door",
    doorId: "entrance-door",
    destinationId: "guardroom",
  });
  assert.deepEqual(opened.state.doorStates, {
    "entrance-door": { open: true },
  });
  assert.deepEqual(opened.events, [
    { type: "door-opened", doorId: "entrance-door" },
  ]);
  assert.equal(guardroom.state.locationId, "guardroom");
  assert.equal(backtracked.state.locationId, "entrance");
  assert.equal(backtracked.state.doorStates["entrance-door"].open, true);
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
      target: {
        type: "exit",
        id: "guardroom",
        doorway: {
          doorId: "entrance-door",
          open: false,
        },
      },
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

test("inspection reports the current state of an accessible door", () => {
  const initial = createSession();
  const closed = handleAction(initial, {
    type: "inspect",
    target: "wooden door",
  });
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const open = handleAction(opened.state, {
    type: "inspect",
    target: "wooden door",
  });

  assert.deepEqual(closed.events, [
    {
      type: "target-inspected",
      target: { type: "door", id: "entrance-door", open: false },
    },
  ]);
  assert.deepEqual(open.events, [
    {
      type: "target-inspected",
      target: { type: "door", id: "entrance-door", open: true },
    },
  ]);
});

test("inspection of a named exit reports its current doorway state", () => {
  const initial = createSession();
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const closedExit = handleAction(initial, {
    type: "inspect",
    target: "guardroom",
  });
  const openExit = handleAction(opened.state, {
    type: "inspect",
    target: "guardroom",
  });

  assert.equal(closedExit.events[0].target.doorway.open, false);
  assert.equal(openExit.events[0].target.doorway.open, true);
});

test("open is an informative no-op or rejects invalid targets without changes", () => {
  const initial = createSession();
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const alreadyOpen = handleAction(opened.state, {
    type: "open",
    target: "wooden door",
  });
  const missing = handleAction(initial, { type: "open" });
  const nonDoor = handleAction(initial, {
    type: "open",
    target: "ruined archway",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  const reliquary = handleAction(afterGoblinVictory(guardroom.state), {
    type: "move",
    destination: "reliquary",
  });
  const remote = handleAction(reliquary.state, {
    type: "open",
    target: "wooden door",
  });

  assert.deepEqual(alreadyOpen.state, opened.state);
  assert.deepEqual(alreadyOpen.events, [
    { type: "door-already-open", doorId: "entrance-door" },
  ]);
  assert.deepEqual(missing.state, initial);
  assert.deepEqual(missing.rejection, {
    reason: "missing-argument",
    command: "open",
  });
  assert.deepEqual(nonDoor.state, initial);
  assert.deepEqual(nonDoor.rejection, {
    reason: "not-openable",
    target: "ruined archway",
  });
  assert.deepEqual(remote.state, reliquary.state);
  assert.deepEqual(remote.rejection, {
    reason: "invisible-target",
    target: "wooden door",
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

function reachReliquary(state = createSession()) {
  const opened = handleAction(state, {
    type: "open",
    target: "wooden door",
  });
  const guardroom = handleAction(opened.state, {
    type: "move",
    destination: "guardroom",
  });
  return handleAction(afterGoblinVictory(guardroom.state), {
    type: "move",
    destination: "reliquary",
  }).state;
}

test("leaving wins only for a living fighter carrying the signet in the reliquary", () => {
  const initial = createSession();
  const wrongLocation = handleAction(initial, { type: "leave" });
  const reliquary = reachReliquary(initial);
  const missingSignet = handleAction(reliquary, { type: "leave" });
  const taken = handleAction(reliquary, {
    type: "take",
    target: "signet",
  });
  const dead = { ...taken.state, fighter: { ...taken.state.fighter, hp: 0 } };
  const deadFighter = handleAction(dead, { type: "leave" });
  const backtracked = handleAction(taken.state, {
    type: "move",
    destination: "guardroom",
  });
  const entrance = handleAction(backtracked.state, {
    type: "move",
    destination: "entrance",
  });
  const entranceWithSignet = handleAction(entrance.state, { type: "leave" });
  const victory = handleAction(taken.state, { type: "leave" });

  assert.deepEqual(wrongLocation.rejection, {
    reason: "leave-requirement",
    requirement: "reliquary",
  });
  assert.deepEqual(missingSignet.rejection, {
    reason: "leave-requirement",
    requirement: "signet",
  });
  assert.deepEqual(deadFighter.rejection, {
    reason: "leave-requirement",
    requirement: "living-fighter",
  });
  assert.deepEqual(entranceWithSignet.rejection, {
    reason: "leave-requirement",
    requirement: "reliquary",
  });
  assert.deepEqual(wrongLocation.state, initial);
  assert.deepEqual(missingSignet.state, reliquary);
  assert.deepEqual(deadFighter.state, dead);
  assert.deepEqual(entranceWithSignet.state, entrance.state);
  assert.equal(taken.state.status, "playing");
  assert.equal(victory.state.status, "victory");
  assert.deepEqual(victory.events, [{ type: "victory" }]);
});

test("victory freezes gameplay mutations but keeps final state readable", () => {
  const reliquary = reachReliquary();
  const taken = handleAction(reliquary, {
    type: "take",
    target: "signet",
  });
  const victory = handleAction(taken.state, { type: "leave" });

  for (const action of [
    { type: "leave" },
    { type: "move", destination: "guardroom" },
    { type: "open", target: "wooden door" },
    { type: "take", target: "signet" },
  ]) {
    const result = handleAction(victory.state, action);
    assert.deepEqual(result.state, victory.state);
    assert.deepEqual(result.rejection, {
      reason: "terminal-state",
      status: "victory",
    });
  }

  for (const action of [
    { type: "help" },
    { type: "look" },
    { type: "inspect", target: "signet" },
    { type: "status" },
    { type: "inventory" },
  ]) {
    const result = handleAction(victory.state, action);
    assert.deepEqual(result.state, victory.state);
    assert.equal(result.rejection, undefined);
  }

  const quit = handleAction(victory.state, { type: "quit" });
  assert.deepEqual(quit.state, victory.state);
  assert.deepEqual(quit.events, [{ type: "session-quit" }]);
});
