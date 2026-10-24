// Way marks: the engine records the room the character last came from, by
// a move, a sneak or a flight, and the room view marks each exit as the way
// back (`cameFrom`) or a way to a room not yet visited (`unvisited`). The
// previous room is saved with the state, so older saves and traces are
// refused. The DM's scene is unchanged. Played in the quiet tunnels and the
// fleeing cellar.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currentCombatant } from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  FIFTH_PROMPT_VERSION,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT, verifyFifthTraceFile } from "../dist/trace-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { fleeingCellar, ratlessTunnels } from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const FLEE = (destinationId) => ({ type: "flee", destinationId });

function accepted(runtime, state, action, ...rolls) {
  const random = uncheckedDice(...rolls);
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result.state;
}

/** The room's exits, each as its id and its marks. */
const marks = (runtime, state) =>
  runtime
    .projectRoom(state)
    .exits.map(({ id, cameFrom, unvisited }) => [
      id,
      ...(cameFrom ? ["came from"] : []),
      ...(unvisited ? ["unvisited"] : []),
    ]);

const tunnels = createFifthRuntime(ratlessTunnels, TEST_FIGHTER);

test("each move records the room left; the way back and the rooms not yet visited are marked", () => {
  const start = tunnels.createSession();
  assert.equal(start.previousRoomId, undefined);
  assert.deepEqual(marks(tunnels, start), [
    ["alcove", "unvisited"],
    ["rat-cellar", "unvisited"],
  ]);

  const alcove = accepted(tunnels, start, MOVE("alcove"));
  assert.equal(alcove.previousRoomId, "stair-foot");
  assert.deepEqual(marks(tunnels, alcove), [["stair-foot", "came from"]]);

  // Back at the start, the alcove is the way back and is visited now.
  const back = accepted(tunnels, alcove, MOVE("stair-foot"));
  assert.equal(back.previousRoomId, "alcove");
  assert.deepEqual(marks(tunnels, back), [
    ["alcove", "came from"],
    ["rat-cellar", "unvisited"],
  ]);

  const cellar = accepted(tunnels, back, MOVE("rat-cellar"));
  assert.equal(cellar.previousRoomId, "stair-foot");
  assert.deepEqual(marks(tunnels, cellar), [
    ["stair-foot", "came from"],
    ["den", "unvisited"],
  ]);

  // The DM's scene names the ways without the marks.
  for (const exit of tunnels.projectDmScene(cellar).room.exits) {
    assert.deepEqual(Object.keys(exit).sort(), [
      "destinationId",
      "direction",
      "name",
    ]);
  }
});

test("a flight is a way in too: the room fled is the way back", () => {
  const cellar = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  // Initiative 20 for the character, then 1 for the rat and the Zombie.
  const fight = accepted(
    cellar,
    cellar.createSession(),
    MOVE("rat-cellar"),
    20,
    1,
    1,
  );
  assert.equal(currentCombatant(fight.encounter).id, "pc");
  assert.equal(fight.previousRoomId, "stair-foot");
  assert.deepEqual(marks(cellar, fight).slice(0, 2), [
    ["stair-foot", "came from"],
    ["den", "unvisited"],
  ]);
  // The rat (2) and the Zombie (2) both miss.
  const fled = accepted(cellar, fight, FLEE("stair-foot"), 2, 2);
  assert.equal(fled.roomId, "stair-foot");
  assert.equal(fled.previousRoomId, "rat-cellar");
  assert.deepEqual(marks(cellar, fled), [
    ["alcove", "unvisited"],
    ["rat-cellar", "came from"],
  ]);
});

test("a save keeps the room come from; an older save and an older trace are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "way-marks-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "d".repeat(32),
      7,
      ratlessTunnels,
      TEST_FIGHTER,
    );
    const { result } = session.act(MOVE("alcove"), "click");
    assert.equal(result.rejection, undefined);
    await session.persist();
    const loaded = await FifthSession.load(path, [ratlessTunnels]);
    assert.equal(loaded.state.previousRoomId, "stair-foot");
    const file = JSON.parse(await readFile(path, "utf8"));
    assert.equal(file.formatVersion, FIFTH_SESSION_FORMAT);

    const older = { ...file, formatVersion: 68 };
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      FifthSession.load(path, [ratlessTunnels]),
      new RegExp(
        String.raw`session\.json is an adventure session in format version 68, not ${FIFTH_SESSION_FORMAT}\. This build cannot continue it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(path, "utf8"), JSON.stringify(older));

    const tracePath = join(directory, "trace.json");
    const trace = JSON.stringify({
      kind: "dungeon-one-5e-trace",
      formatVersion: 63,
    });
    await writeFile(tracePath, trace);
    await assert.rejects(
      verifyFifthTraceFile(tracePath, [ratlessTunnels]),
      new RegExp(
        String.raw`trace\.json is a trace in format version 63, not ${FIFTH_TRACE_FORMAT}\. This build cannot replay it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(tracePath, "utf8"), trace);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the save and trace formats bump; the DM prompt does not", () => {
  assert.equal(FIFTH_SESSION_FORMAT, 69);
  assert.equal(FIFTH_TRACE_FORMAT, 64);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v48");
});
