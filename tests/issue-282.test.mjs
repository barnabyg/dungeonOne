// #282: a check's band can open a hidden passage or close one for the rest
// of the adventure, and the validator proves every essential room and some
// exit stay reachable: by a route without a check, or through a check whose
// every band leaves a way forward, whatever a band may close. Played on the
// shifting ossuary with Ada (Perception +2, Athletics +5).
import assert from "node:assert/strict";
import test from "node:test";
import { validateFifthAdventure } from "../dist/adventure-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { moduleFile, room, shiftingOssuary } from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(shiftingOssuary, TEST_FIGHTER);

function accepted(state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const inHall = accepted(begun, {
  type: "move",
  destinationId: "bone-hall",
}).state;
const exits = (state) =>
  runtime
    .projectRoom(state)
    .exits.map(({ id, route }) =>
      route === undefined ? id : `${id} ${route}`,
    );
const SEARCH_WALL = { type: "examine", targetId: "skull-wall" };
const FORCE = { type: "force", doorId: "rotten-door" };

test("a hidden passage is no way until a band opens it", () => {
  assert.deepEqual(exits(inHall), ["ossuary-gate", "tomb", "side-crypt"]);
  assert.equal(
    runtime.handleAction(
      inHall,
      { type: "move", destinationId: "reliquary" },
      dice(),
    ).rejection.code,
    "no-exit",
  );
  const failed = accepted(inHall, SEARCH_WALL, dice([20, 9]));
  assert.deepEqual(exits(failed.state), exits(inHall));

  const { state, events } = accepted(inHall, SEARCH_WALL, dice([20, 10]));
  assert.deepEqual(
    events.map(({ type }) => type),
    ["check", "examined", "outcome", "route"],
  );
  assert.deepEqual(events[3], {
    type: "route",
    passageId: "hall-to-reliquary",
    change: "opened",
    rooms: ["Reliquary"],
  });
  assert.match(
    runtime.renderResult({ state, events }),
    /The way to the Reliquary is open\.$/,
  );
  assert.deepEqual(exits(state), [
    "ossuary-gate",
    "tomb",
    "reliquary opened",
    "side-crypt",
  ]);
  const moved = accepted(state, { type: "move", destinationId: "reliquary" });
  assert.equal(moved.state.roomId, "reliquary");
  // The way stays open from the far side too.
  assert.deepEqual(exits(moved.state), ["bone-hall opened"]);
});

test("a band closes a passage for the rest of the adventure", () => {
  const { state, events } = accepted(inHall, FORCE, dice([20, 1]));
  assert.deepEqual(
    events.map(({ type }) => type),
    ["check", "door", "outcome", "route"],
  );
  assert.match(
    runtime.renderResult({ state, events }),
    /The Rotten Door holds\.\nThe sagging frame gives way.*\nThe way to the Side Crypt is closed\.$/,
  );
  assert.deepEqual(exits(state), ["ossuary-gate", "tomb", "side-crypt closed"]);
  // Its door has nothing left to try, and going through is refused.
  const views = runtime.projectActions(state);
  assert.equal(
    views.some(({ target }) => target?.id === "rotten-door"),
    false,
  );
  assert.deepEqual(
    views.find(
      ({ action, target }) => action === "move" && target.id === "side-crypt",
    ),
    {
      action: "move",
      target: { id: "side-crypt", name: "Side Crypt" },
      available: false,
      reason: "Way closed",
    },
  );
  const refused = runtime.handleAction(
    state,
    { type: "move", destinationId: "side-crypt" },
    dice(),
  );
  assert.equal(
    refused.rejection.reason,
    "The way to the Side Crypt is closed.",
  );
  // The AI DM sees the closed way, and its move is refused too.
  const scene = runtime.projectDmScene(state);
  assert.match(
    scene.room.exits.find(({ destinationId }) => destinationId === "side-crypt")
      .name,
    /The way is closed\./,
  );
  const tools = runtime.getGameToolDefinitions(state);
  assert.deepEqual(
    tools.find(({ name }) => name === "move").parameters.properties.destination
      .enum,
    ["ossuary-gate", "tomb"],
  );
  const typed = runtime.dispatchGameTool(
    state,
    { name: "move", argumentsJson: '{"destination":"side-crypt"}' },
    dice(),
  );
  assert.equal(typed.modelOutput.ok, false);
  assert.equal(typed.state, state);
});

/** Validates `change`d ossuary JSON, expecting a problem. */
function rejects(change, problem) {
  const module = moduleFile("shifting-ossuary");
  change(module);
  assert.throws(() => validateFifthAdventure(module, bestiary), problem);
}
const accepts = (change) => {
  const module = moduleFile("shifting-ossuary");
  change(module);
  return validateFifthAdventure(module, bestiary);
};
const wall = (m) => room(m, "bone-hall").features[0];
const passage = (m, id) => m.passages.find((entry) => entry.id === id);

test("the validator rejects a close that can cut off an essential room", () => {
  rejects(
    (m) =>
      (wall(m).check.bands.failure.effects = [
        { type: "close", passage: "hall-to-tomb" },
      ]),
    /feature skull-wall check's failure band closes passage hall-to-tomb, which can cut off essential room tomb\./,
  );
});

test("the validator rejects a close that can cut off every exit", () => {
  rejects((m) => {
    // The only exit is a stair top beyond the gate, which a band can close.
    delete room(m, "ossuary-gate").exit;
    m.rooms.push({
      id: "stair-top",
      name: "Stair Top",
      description: "The top of the ossuary stair, open to the sky.",
      exit: true,
      features: [],
      items: [],
    });
    m.passages.push({
      id: "gate-to-top",
      between: ["ossuary-gate", "stair-top"],
      description: "A crumbling stair.",
    });
    wall(m).check.bands.failure.effects = [
      { type: "close", passage: "gate-to-top" },
    ];
  }, /feature skull-wall check's failure band closes passage gate-to-top, which can cut off every exit room\./);
});

/**
 * The tomb behind a stuck door instead of the free arch, with a way round
 * through the reliquary that the skull wall's success opens.
 */
const behindDoor = (m) => {
  passage(m, "hall-to-tomb").door = {
    id: "tomb-door",
    name: "Tomb Door",
    description: "A heavy door carved with skulls.",
    state: "stuck",
    force: { skill: "athletics", dc: 15 },
  };
  m.passages.push({
    id: "reliquary-to-tomb",
    between: ["reliquary", "tomb"],
    description: "A crawl through the bones.",
  });
};

test("an essential room behind a check is accepted only when every band goes forward", () => {
  rejects(
    behindDoor,
    /room tomb is essential, but every route to it needs a check or passes a trap \(tomb-door, hall-to-reliquary\)\./,
  );
  // Fail forward: a failed force finds the crawl, a success opens the door.
  const adventure = accepts((m) => {
    behindDoor(m);
    passage(m, "hall-to-tomb").door.force.bands = {
      failure: {
        text: "The door holds, but your shoulder knocks skulls loose from the wall beside it.",
        effects: [{ type: "open", passage: "hall-to-reliquary" }],
      },
    };
  });
  assert.equal(adventure.passages.length, 5);
  // A failure that opens nothing, or a band out of reach, is no way forward.
  rejects((m) => {
    behindDoor(m);
    passage(m, "hall-to-tomb").door.force.bands = {
      "failure-by-5": {
        effects: [{ type: "open", passage: "hall-to-reliquary" }],
      },
    };
  }, /room tomb is essential/);
});

test("the validator rejects opens and closes naming the wrong passage", () => {
  rejects(
    (m) => (wall(m).check.bands.success.effects[0].passage = "hall-to-attic"),
    /feature skull-wall check's success band names unknown passage hall-to-attic\./,
  );
  rejects(
    (m) => (wall(m).check.bands.success.effects[0].passage = "hall-to-tomb"),
    /opens passage hall-to-tomb, which is not hidden; only a hidden passage is opened\./,
  );
  rejects(
    (m) =>
      (wall(m).check.bands.success.effects = [
        { type: "discovery", feature: "reliquary-niche" },
      ]),
    /passage hall-to-reliquary is hidden, but no check's band opens it\./,
  );
  rejects((m) => {
    wall(m).check.bands.success.effects = [];
  }, /success band effects must list 1–6 entries\./);
  rejects(
    (m) => (passage(m, "hall-to-reliquary").hidden = false),
    /passage 3 hidden must be true, or left out\./,
  );
});
