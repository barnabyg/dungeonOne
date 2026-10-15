// #456: the mapping tool. `npm run map -- <module-id | path>` draws a module
// or a design-stage layout sketch as an SVG and a plain-text grid, checks it
// with the layout rules the module validator uses (src/map-5e.ts), lists
// every violation and warning, and exits non-zero on any error.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { layoutWarnings } from "../dist/map-5e.js";
import { main } from "../scripts/map-5e.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";

const fixture = (name) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const SKETCH = fixture("fox-barrow-sketch.json");

/** Runs the tool on `args` into a fresh output folder. */
async function run(t, args) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-456-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let text = "";
  const output = { write: (chunk) => (text += chunk) };
  const code = await main(args, { output, outDir: join(directory, "maps") });
  return { code, text, directory, maps: join(directory, "maps") };
}

/** Writes `value` as JSON into a fresh folder and returns its path. */
async function jsonFile(t, name, value) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-456-in-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value));
  return path;
}

const sketch = async () => JSON.parse(await readFile(SKETCH, "utf8"));

test("a sketch is drawn as a text grid per floor, with its rooms and marked passages listed", async (t) => {
  const { code, text, maps } = await run(t, [SKETCH]);
  assert.equal(code, 0);
  assert.equal(
    text,
    [
      "The Fox Barrow (fox-barrow): a sketch of 6 rooms and 5 passages.",
      "",
      "Floor 0",
      "      0   1   2   3",
      "  0  [A]-[B]-----[D]",
      "          |",
      "  1      [C]",
      "",
      "Floor -1",
      "      0   1   2   3",
      "  0      [E]",
      "            \\",
      "  1          [F]",
      "",
      "Rooms",
      "  A  mound-gate  Mound Gate  [0, 0]  floor 0   The Mound  start, exit",
      "  B  fox-hall    Fox Hall    [1, 0]  floor 0   The Mound",
      "  C  bone-niche  Bone Niche  [1, 1]  floor 0   The Mound",
      "  D  far-shrine  Far Shrine  [3, 0]  floor 0   The Mound",
      "  E  stair-foot  Stair Foot  [1, 0]  floor -1  The Vault",
      "  F  gold-vault  Gold Vault  [2, 1]  floor -1  The Vault",
      "",
      "Marked passages",
      "  A-B  gate-to-hall    stuck door",
      "  B-C  hall-to-niche   hidden",
      "  B-D  hall-to-shrine  trap",
      "  B-E  hall-stairs     stairs, down from floor 0 to floor -1, hidden",
      "  E-F  foot-to-vault   locked door",
      "",
      "No layout errors.",
      "No warnings.",
      `Map: ${join(maps, "fox-barrow.svg")}`,
      "",
    ].join("\n"),
  );
});

test("every layout error is listed with its rooms and cells, the map is still drawn, and the exit code is 1", async (t) => {
  const broken = await sketch();
  broken.rooms.find(({ id }) => id === "mound-gate").at = [1, 1];
  broken.rooms.find(({ id }) => id === "far-shrine").at = [3, 1];
  const { code, text, maps } = await run(t, [
    await jsonFile(t, "broken.json", broken),
  ]);
  assert.equal(code, 1);
  assert.ok(
    text.endsWith(
      [
        "Layout errors (2):",
        "  - rooms mound-gate and bone-niche are both on cell [1, 1] of floor 0: give each room its own cell.",
        "  - passage hall-to-shrine from fox-hall on cell [1, 0] of floor 0 to far-shrine on cell [3, 1] is not a straight run: make it horizontal, vertical or a 45° diagonal.",
        "No warnings.",
        `Map: ${join(maps, "fox-barrow.svg")}`,
        "",
      ].join("\n"),
    ),
    text,
  );
  // The crooked passage isn't drawn as if it were straight.
  assert.match(
    text,
    /\nFloor 0\n.*\n {2}0 {2}\[B\]\n {6}\|\n {2}1 {2}\[C\] {5}\[D\]\n/u,
  );
  assert.ok((await stat(join(maps, "fox-barrow.svg"))).isFile());
});

test("a sketch is read strictly: only the module's map fields, in its own format version", async (t) => {
  for (const [change, message] of [
    [
      (value) => (value.rooms[1].description = "A hall of foxes."),
      "room 2 must have id, name, at and may have floor, region, exit, and nothing else.",
    ],
    [
      (value) => (value.passages[0].door.id = "gate-door"),
      "passage 1 door must have a state, stuck or locked, and nothing else in a sketch.",
    ],
    [
      (value) => (value.passages[2].trap = { dc: 12 }),
      "passage 3 trap must be {} in a sketch: the module fills it in.",
    ],
    [
      (value) => (value.passages[1].between = ["fox-hall", "fox-den"]),
      "passage hall-to-niche names unknown room fox-den.",
    ],
    [
      (value) => (value.formatVersion = 2),
      "it is a layout sketch in format version 2, not 1. Move it aside; the file has not been changed.",
    ],
    // What a module refuses, a sketch refuses too, in the module's words.
    [
      (value) =>
        (value.regions = Array.from({ length: 11 }, (_, index) => ({
          id: `region-${index}`,
          name: `Region ${index}`,
        }))),
      "regions must list 1–10 entries.",
    ],
    [
      (value) => delete value.rooms[1].region,
      "room 2 (fox-hall) has no region, but other rooms have one: give every room a region, or none.",
    ],
    [
      (value) => value.regions.push({ id: "den", name: "The Den" }),
      "region den has no room: give it one, or leave it out.",
    ],
    [
      (value) => (value.passages[1].openWhen = "roots-cut"),
      "passage 2 is hidden and has openWhen: a band opens a hidden passage, a flag one already there to see.",
    ],
    [
      (value) => {
        value.passages[0].openWhen = "roots-cut";
        value.passages[0].closeWhen = "roots-cut";
      },
      "passage 1 opens and closes on the same flag.",
    ],
  ]) {
    const value = await sketch();
    change(value);
    const path = await jsonFile(t, "sketch.json", value);
    const { code, text, maps } = await run(t, [path]);
    assert.equal(code, 1);
    assert.equal(text, `${path}: ${message}\n`);
    await assert.rejects(stat(maps));
  }
});

test("a module is checked whole: every layout error, then the validator's first other problem", async (t) => {
  const module = moduleFile("rat-tunnels");
  room(module, "alcove").at = [1, 1];
  room(module, "den").at = [3, 2];
  const { code, text } = await run(t, [
    await jsonFile(t, "rat-tunnels.json", module),
  ]);
  assert.equal(code, 1);
  assert.match(
    text,
    /^The Rat Tunnels \(rat-tunnels\): a module of 4 rooms and 3 passages\.\n/u,
  );
  assert.match(
    text,
    /\nLayout errors \(2\):\n {2}- rooms alcove and rat-cellar are both on cell \[1, 1\] of floor 0: give each room its own cell\.\n {2}- passage cellar-to-den from rat-cellar on cell \[1, 1\] of floor 0 to den on cell \[3, 2\] is not a straight run: make it horizontal, vertical or a 45° diagonal\.\nNo warnings\.\n/u,
  );
  const other = moduleFile("rat-tunnels");
  room(other, "den").encounterId = "no-such-fight";
  const invalid = await run(t, [await jsonFile(t, "rat-tunnels.json", other)]);
  assert.equal(invalid.code, 1);
  assert.match(
    invalid.text,
    /\nLayout errors \(1\):\n {2}- the module is invalid: room 4 names unknown encounter no-such-fight\.\n/u,
  );
});

test("awkward layouts only warn: a scattered region, a long passage, and a passage longer than its description reads", async (t) => {
  const rooms = [
    { id: "a", at: [0, 0], floor: 0, region: "upper" },
    { id: "b", at: [3, 0], floor: 0, region: "upper" },
    { id: "c", at: [0, 2], floor: 0, region: "lower" },
    { id: "d", at: [2, 2], floor: 0, region: "lower" },
    { id: "e", at: [2, 2], floor: -1, region: "lower" },
  ];
  assert.deepEqual(
    layoutWarnings(rooms, [
      { id: "a-b", between: ["a", "b"], description: "A tunnel." },
      { id: "a-c", between: ["a", "c"], description: "The low arch." },
      { id: "c-d", between: ["c", "d"], description: "A short way on." },
      // Neither one cell, nor a long way between floors, nor a crooked run
      // (an error) warns.
      { id: "d-e", between: ["d", "e"], vertical: "ladder" },
      { id: "b-d", between: ["b", "d"], description: "A door." },
    ]),
    [
      "passage a-b from a to b runs 3 cells on floor 0: move the rooms closer, or put a room on the way.",
      'passage a-c from a to c runs 2 cells, but its description reads as a doorway or a step ("The low arch."): describe the way between, or move the rooms together.',
      'passage c-d from c to d runs 2 cells, but its description reads as a doorway or a step ("A short way on."): describe the way between, or move the rooms together.',
    ],
  );
  // A way between, however it starts, reads as long enough.
  for (const description of [
    "The walkway round the cistern, to an arch.",
    "A passage lined with bones.",
    "The gatehouse wall-walk.",
    "A tunnel beside the river, forty metres long.",
  ]) {
    assert.deepEqual(
      layoutWarnings(rooms, [{ id: "a-c", between: ["a", "c"], description }]),
      [],
    );
  }
  const scattered = await sketch();
  scattered.rooms.find(({ id }) => id === "bone-niche").region = "vault";
  scattered.rooms.find(({ id }) => id === "mound-gate").at = [0, 1];
  scattered.passages.find(({ id }) => id === "hall-to-shrine").description =
    "A door.";
  const { code, text } = await run(t, [
    await jsonFile(t, "scattered.json", scattered),
  ]);
  assert.equal(code, 0);
  assert.ok(
    text.includes(
      [
        "No layout errors.",
        "Warnings (2):",
        "  - region mound is scattered: room bone-niche of region vault is on cell [1, 1], among its rooms on floor 0 ([0, 0] to [3, 1]).",
        '  - passage hall-to-shrine from fox-hall to far-shrine runs 2 cells, but its description reads as a doorway or a step ("A door."): describe the way between, or move the rooms together.',
        "Map: ",
      ].join("\n"),
    ),
    text,
  );
});

/** The SVG group of room `id`: its box, its name and its marks. */
const roomGroup = (svg, id) =>
  new RegExp(`<g class="room[^"]*" data-room="${id}">.*?</g>`, "su").exec(
    svg,
  )?.[0] ?? assert.fail(`no room ${id} in the map`);

test("the SVG draws every floor, the rooms by name in their region's shade, and the passages' marks", async (t) => {
  const named = await sketch();
  named.rooms.find(({ id }) => id === "bone-niche").name = 'Fox & "Den" <1>';
  const { code, maps } = await run(t, [await jsonFile(t, "fox.json", named)]);
  assert.equal(code, 0);
  const svg = await readFile(join(maps, "fox-barrow.svg"), "utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /u);
  assert.match(svg, /<\/svg>\n$/u);
  assert.match(svg, /<title>The Fox Barrow \(fox-barrow\)<\/title>/u);
  // Floors from the top down, each named.
  assert.ok(svg.indexOf('data-floor="0"') < svg.indexOf('data-floor="-1"'));
  assert.match(svg, />Floor 0</u);
  assert.match(svg, />Floor -1</u);
  // Rooms by name, escaped; start and exit marked.
  assert.match(roomGroup(svg, "fox-hall"), />Fox Hall</u);
  assert.match(
    roomGroup(svg, "bone-niche"),
    />Fox &amp; &quot;Den&quot; &lt;1&gt;</u,
  );
  assert.match(svg, /<g class="room start exit" data-room="mound-gate">/u);
  assert.match(roomGroup(svg, "mound-gate"), />START · EXIT</u);
  // A region's rooms share its legend swatch's shade; regions differ.
  const swatch = (name) =>
    new RegExp(
      `<rect class="swatch"[^>]* fill="(#[0-9a-f]{6})"[^>]*/>\\s*<text[^>]*>${name}</text>`,
      "u",
    ).exec(svg)?.[1];
  const shade = (id) => /fill="(#[0-9a-f]{6})"/u.exec(roomGroup(svg, id))?.[1];
  assert.equal(shade("fox-hall"), swatch("The Mound"));
  assert.equal(shade("gold-vault"), swatch("The Vault"));
  assert.notEqual(swatch("The Mound"), swatch("The Vault"));
  // Doors, hidden passages and traps are marked on the passage; stairs on
  // the rooms they join, and listed in the legend.
  assert.match(svg, /<line class="passage" data-passage="gate-to-hall"/u);
  assert.match(
    svg,
    /<line class="passage hidden" data-passage="hall-to-niche"/u,
  );
  assert.match(svg, /<rect class="door stuck" data-passage="gate-to-hall"/u);
  assert.match(svg, /<rect class="door locked" data-passage="foot-to-vault"/u);
  assert.match(svg, /<path class="trap" data-passage="hall-to-shrine"/u);
  assert.doesNotMatch(svg, /<line[^>]*data-passage="hall-stairs"/u);
  assert.match(roomGroup(svg, "fox-hall"), />▼ stairs</u);
  assert.match(roomGroup(svg, "stair-foot"), />▲ stairs</u);
  assert.match(svg, />Fox Hall ▼ stairs to Stair Foot \(floor -1\): hidden</u);
});

test("the command takes one module id or path, and says how otherwise", async (t) => {
  for (const args of [[], [SKETCH, SKETCH], ["--all"]]) {
    const { code, text } = await run(t, args);
    assert.equal(code, 2);
    assert.equal(
      text,
      "Usage: npm run map -- <module-id | path to a module or a layout sketch>\n",
    );
  }
  const missing = await run(t, ["no-such-module"]);
  assert.equal(missing.code, 1);
  assert.equal(missing.text, "no-such-module is not a readable JSON file.\n");
});
