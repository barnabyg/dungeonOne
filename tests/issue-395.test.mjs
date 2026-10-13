// #395: regions and the move count, a gameplay-neutral prefactor for long
// modules. A module may declare regions and give each room one; the room
// panel and the AI DM's scene name the current room's region. The session
// counts the character's moves between rooms, which a reload restores and a
// trace records. Nothing else uses either yet.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  ratTunnels,
  regionTunnels,
  regionTunnelsFile,
  room,
} from "./fixtures/modules.mjs";

// The validator.

test("a module may declare regions and give each room one", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 38);
  assert.equal(FIFTH_SESSION_FORMAT, 59);
  assert.equal(FIFTH_TRACE_FORMAT, 53);
  assert.deepEqual(regionTunnels.regions, [
    { id: "upper", name: "Upper Tunnels" },
    { id: "lower", name: "Lower Tunnels" },
  ]);
  assert.equal(room(regionTunnels, "alcove").region, "upper");
  assert.equal(room(regionTunnels, "den").region, "lower");
  // A module without regions stays valid, and its rooms have none.
  assert.equal(ratTunnels.regions, undefined);
  assert.ok(ratTunnels.rooms.every(({ region }) => region === undefined));
});

test("the validator refuses unknown, unused and partial regions", () => {
  const changed = (change) => {
    const module = structuredClone(regionTunnelsFile);
    change(module);
    return module;
  };
  for (const [module, message] of [
    [
      changed((module) => {
        room(module, "den").region = "cellars";
      }),
      /room 4 \(den\) names unknown region cellars\./u,
    ],
    [
      changed((module) => {
        delete module.regions;
      }),
      /room 1 \(stair-foot\) names unknown region upper\./u,
    ],
    [
      changed((module) => {
        module.regions.push({ id: "attic", name: "Attic" });
      }),
      /region attic has no room: give it one, or leave it out\./u,
    ],
    [
      changed((module) => {
        delete room(module, "alcove").region;
      }),
      /room 2 \(alcove\) has no region, but other rooms have one: give every room a region, or none\./u,
    ],
    [
      changed((module) => {
        for (const entry of module.rooms) {
          delete entry.region;
        }
      }),
      /region upper has no room/u,
    ],
    [
      changed((module) => {
        module.regions.push({ id: "upper", name: "Upper Again" });
      }),
      /duplicate region id upper\./u,
    ],
    [
      changed((module) => {
        module.regions = [];
      }),
      /regions must list 1–/u,
    ],
    [
      changed((module) => {
        module.regions[0].colour = "blue";
      }),
      /region 1 must have exactly id, name\./u,
    ],
  ]) {
    assert.throws(() => validateModule(module), message);
  }
});

// The room panel and the AI DM's scene.

test("the room panel and the AI DM's scene name the current room's region", () => {
  const runtime = createFifthRuntime(regionTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.equal(runtime.projectRoom(start).region, "Upper Tunnels");
  assert.equal(runtime.projectDmScene(start).room.region, "Upper Tunnels");
  const below = { ...start, roomId: "den" };
  assert.equal(runtime.projectRoom(below).region, "Lower Tunnels");
  assert.equal(runtime.projectDmScene(below).room.region, "Lower Tunnels");
  // Without regions, neither names one.
  const plain = createFifthRuntime(ratTunnels, TEST_FIGHTER);
  const fresh = plain.createSession();
  assert.equal("region" in plain.projectRoom(fresh), false);
  assert.equal("region" in plain.projectDmScene(fresh).room, false);
});

// The move count.

test("the move count rises on each move between rooms, and only then", () => {
  const session = FifthSession.begin(0, regionTunnels, TEST_FIGHTER);
  assert.equal(session.state.moves, 0);
  const moved = (destinationId) => {
    const { result } = session.act({ type: "move", destinationId }, "click");
    assert.equal(result.rejection, undefined, result.rejection?.reason);
  };
  moved("alcove");
  assert.equal(session.state.moves, 1);
  // Examining, or a move the engine refuses, moves no one.
  session.act({ type: "examine", targetId: "iron-chest" }, "click");
  const refused = session.act(
    { type: "move", destinationId: "den" },
    "click",
  ).result;
  assert.equal(refused.rejection?.code, "no-exit");
  assert.equal(session.state.moves, 1);
  moved("stair-foot");
  assert.equal(session.state.moves, 2);
  // Sneaking into a fight's room is a move too.
  const sneaked = session.act(
    { type: "sneak", destinationId: "rat-cellar" },
    "click",
  ).result;
  assert.equal(sneaked.rejection, undefined, sneaked.rejection?.reason);
  assert.equal(session.state.roomId, "rat-cellar");
  assert.equal(session.state.moves, 3);
});

test("a reload restores the move count, and a trace records it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-395-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      0,
      regionTunnels,
      TEST_FIGHTER,
    );
    const run = new FifthTraceRun(created);
    for (const destinationId of ["alcove", "stair-foot", "alcove"]) {
      const { result } = run.click({ type: "move", destinationId });
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    assert.equal(run.session.state.moves, 3);
    await run.session.persist();
    const loaded = await FifthSession.load(path, [regionTunnels]);
    assert.equal(loaded.state.moves, 3);
    assert.deepEqual(loaded.state, run.session.state);

    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const file = JSON.parse(await readFile(tracePath, "utf8"));
    assert.deepEqual(
      file.turns.map(({ stateAfter }) => stateAfter.moves),
      [1, 2, 3],
    );
    const replayed = await verifyFifthTraceFile(tracePath, [regionTunnels]);
    assert.equal(replayed.state.moves, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
