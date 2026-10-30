// #455: the room map. Every room sits on a hand-placed cell, `at: [x, y]`,
// on a floor (0 by default). The validator keeps the layout readable: one
// room to a cell, straight passages that run through no room and cross no
// other, and stairs, a ladder or a shaft between adjacent floors. The rules
// live in map-5e.ts, which the mapping tool (#456) shares; a scattered region
// is only the tool's warning.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FIFTH_ADVENTURE_FORMAT,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import { layoutErrors, layoutWarnings } from "../dist/map-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  moduleFile,
  ratTunnels,
  regionTunnels,
  room,
} from "./fixtures/modules.mjs";

/** The rat tunnels' JSON, changed by `change`. */
const changed = (change) => {
  const module = moduleFile("rat-tunnels");
  change(module);
  return module;
};
const passage = (module, id) =>
  module.passages.find((entry) => entry.id === id);

test("an older module file is refused by name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-455-"));
  try {
    const path = join(directory, "old-tunnels.json");
    const older = moduleFile("rat-tunnels");
    older.formatVersion = 42;
    for (const entry of older.rooms) {
      delete entry.at;
    }
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      loadFifthAdventure(path),
      new RegExp(
        `^Error: ${path.replace(/[\\.]/gu, "\\$&")} is a 5e adventure module in format version 42, not ${FIFTH_ADVENTURE_FORMAT}\\. Move it aside; the file has not been changed\\.$`,
        "u",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("every room has a cell, and a floor that is 0 unless authored", () => {
  assert.deepEqual(
    ratTunnels.rooms.map(({ id, at, floor }) => [id, at, floor]),
    [
      ["stair-foot", [1, 0], 0],
      ["alcove", [0, 0], 0],
      ["rat-cellar", [1, 1], 0],
      ["den", [1, 2], 0],
    ],
  );
  const below = validateModule(
    changed((module) => {
      room(module, "den").floor = -1;
      passage(module, "cellar-to-den").vertical = "stairs";
    }),
  );
  assert.equal(room(below, "den").floor, -1);
  assert.equal(passage(below, "cellar-to-den").vertical, "stairs");
  assert.equal(passage(ratTunnels, "cellar-to-den").vertical, undefined);
});

test("the validator refuses a room without a cell, or with a bad one", () => {
  for (const [change, message] of [
    [
      (module) => delete room(module, "alcove").at,
      /room 2 must have id, name, at, description, features, items and may have floor, /u,
    ],
    [
      (module) => (room(module, "alcove").at = [0]),
      /room 2 \(alcove\) at must be a cell, \[x, y\]\./u,
    ],
    [
      (module) => (room(module, "alcove").at = [0, 0.5]),
      /room 2 \(alcove\) at y must be an integer from -50 to 50\./u,
    ],
    [
      (module) => (room(module, "alcove").floor = 10),
      /room 2 \(alcove\) floor must be an integer from -9 to 9\./u,
    ],
    [
      (module) => (passage(module, "cellar-to-den").vertical = "rope"),
      /passage 3 vertical must be stairs, ladder, shaft\./u,
    ],
  ]) {
    assert.throws(() => validateModule(changed(change)), message);
  }
});

test("no two rooms share a cell of one floor", () => {
  assert.throws(
    () =>
      validateModule(
        changed((module) => {
          room(module, "alcove").at = [1, 1];
        }),
      ),
    /rooms alcove and rat-cellar are both on cell \[1, 1\] of floor 0: give each room its own cell\./u,
  );
  // On another floor, the same cell is free.
  validateModule(
    changed((module) => {
      room(module, "den").at = [1, 1];
      room(module, "den").floor = -1;
      passage(module, "cellar-to-den").vertical = "ladder";
    }),
  );
});

test("a passage on one floor is a straight run", () => {
  assert.throws(
    () =>
      validateModule(
        changed((module) => {
          room(module, "den").at = [2, 3];
        }),
      ),
    /passage cellar-to-den from rat-cellar on cell \[1, 1\] of floor 0 to den on cell \[2, 3\] is not a straight run: make it horizontal, vertical or a 45° diagonal\./u,
  );
  // Horizontal, vertical and 45° diagonal runs of any length are straight.
  for (const at of [
    [4, 1],
    [1, 5],
    [4, 4],
    [-2, 4],
  ]) {
    validateModule(
      changed((module) => {
        room(module, "den").at = at;
      }),
    );
  }
});

test("no room sits on a cell between a passage's two ends", () => {
  assert.throws(
    () =>
      validateModule(
        changed((module) => {
          room(module, "alcove").at = [1, 2];
          room(module, "den").at = [2, 2];
        }),
      ),
    /passage stair-to-alcove from stair-foot to alcove runs through room rat-cellar on cell \[1, 1\] of floor 0: move the room, or route the passage round it\./u,
  );
  // A room on another floor is not in the way.
  validateModule(
    changed((module) => {
      room(module, "alcove").at = [1, 2];
      room(module, "alcove").floor = 1;
      passage(module, "stair-to-alcove").vertical = "stairs";
      room(module, "den").at = [2, 2];
    }),
  );
});

test("passages on one floor don't cross", () => {
  assert.throws(
    () =>
      validateModule(
        changed((module) => {
          room(module, "alcove").at = [2, 1];
          room(module, "den").at = [2, 0];
        }),
      ),
    /passages stair-to-alcove \(stair-foot on cell \[1, 0\] to alcove on cell \[2, 1\]\) and cellar-to-den \(rat-cellar on cell \[1, 1\] to den on cell \[2, 0\]\) cross on floor 0: move a room so they don't\./u,
  );
  // Two passages between the same rooms lie along each other.
  assert.deepEqual(
    layoutErrors(
      [
        { id: "a", at: [0, 0], floor: 0 },
        { id: "b", at: [1, 1], floor: 0 },
      ],
      [
        { id: "a-b", between: ["a", "b"] },
        { id: "b-a", between: ["b", "a"] },
      ],
    ),
    ["passages a-b and b-a both link a and b: one is enough."],
  );
  // Passages on different floors may pass over each other.
  validateModule(
    changed((module) => {
      room(module, "alcove").at = [2, 1];
      room(module, "rat-cellar").floor = -1;
      room(module, "den").at = [2, 0];
      room(module, "den").floor = -1;
      passage(module, "stair-to-cellar").vertical = "stairs";
    }),
  );
});

test("a passage between floors is vertical, and links adjacent floors", () => {
  for (const [change, message] of [
    [
      (module) => (room(module, "den").floor = -1),
      /passage cellar-to-den links rat-cellar on cell \[1, 1\] of floor 0 and den on cell \[1, 2\] of floor -1: mark a passage between floors as stairs, a ladder or a shaft \(vertical\)\./u,
    ],
    [
      (module) => {
        room(module, "den").floor = -2;
        passage(module, "cellar-to-den").vertical = "shaft";
      },
      /passage cellar-to-den \(shaft\) links rat-cellar on cell \[1, 1\] of floor 0 and den on cell \[1, 2\] of floor -2: it may link only adjacent floors\./u,
    ],
    [
      (module) => (passage(module, "cellar-to-den").vertical = "stairs"),
      /passage cellar-to-den is stairs, but rat-cellar and den are both on floor 0: a vertical passage links adjacent floors\./u,
    ],
  ]) {
    assert.throws(() => validateModule(changed(change)), message);
  }
});

test("the rules report every problem, and a scattered region only warns", () => {
  const rooms = [
    { id: "a", at: [0, 0], floor: 0, region: "upper" },
    { id: "b", at: [2, 0], floor: 0, region: "upper" },
    { id: "c", at: [1, 0], floor: 0, region: "lower" },
    { id: "d", at: [1, 0], floor: 0, region: "lower" },
  ];
  assert.deepEqual(layoutErrors(rooms, [{ id: "a-b", between: ["a", "b"] }]), [
    "rooms c and d are both on cell [1, 0] of floor 0: give each room its own cell.",
    "passage a-b from a to b runs through room c on cell [1, 0] of floor 0: move the room, or route the passage round it.",
  ]);
  assert.deepEqual(layoutWarnings(rooms.slice(0, 3)), [
    "region upper is scattered: room c of region lower is on cell [1, 0], among its rooms on floor 0 ([0, 0] to [2, 0]).",
  ]);
  // A region on its own floor, or beside another, is a block.
  assert.deepEqual(
    layoutWarnings([
      ...rooms.slice(0, 2),
      { id: "c", at: [1, 0], floor: -1, region: "lower" },
      { id: "d", at: [3, 0], floor: 0, region: "lower" },
    ]),
    [],
  );
  assert.deepEqual(
    layoutWarnings(
      regionTunnels.rooms.map(({ id, at, floor, region }) => ({
        id,
        at,
        floor,
        region,
      })),
    ),
    [],
  );
});
