// #517: faint backdrops. A module may name a backdrop for each region, and a
// room may override its region's; the room panel's view carries the current
// room's backdrop, and the AI DM's scene never does. The validator and the
// map tool refuse an unknown name, the map tool names each room's, and the
// format is bumped.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FIFTH_ADVENTURE_FORMAT,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import { BACKDROPS, BACKDROP_ART } from "../dist/backdrops-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { main } from "../scripts/map-5e.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  backdropTunnels,
  backdropTunnelsFile,
  moduleFile,
  ratTunnels,
  room,
} from "./fixtures/modules.mjs";

test("the format is bumped, and an older module file is refused by name", async () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 45);
  const directory = await mkdtemp(join(tmpdir(), "dungeon-517-"));
  try {
    const path = join(directory, "old-tunnels.json");
    const older = moduleFile("rat-tunnels");
    older.formatVersion = 43;
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      loadFifthAdventure(path),
      new RegExp(
        `^Error: ${path.replace(/[\\.]/gu, "\\$&")} is a 5e adventure module in format version 43, not ${FIFTH_ADVENTURE_FORMAT}\\. Move it aside; the file has not been changed\\.$`,
        "u",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("each backdrop is a faint one-colour drawing hidden from assistive technology", () => {
  assert.ok(BACKDROPS.length > 0);
  assert.deepEqual(Object.keys(BACKDROP_ART), [...BACKDROPS]);
  for (const name of BACKDROPS) {
    const art = BACKDROP_ART[name];
    assert.match(art, /^<svg [^>]*aria-hidden="true" focusable="false"/u);
    assert.match(art, /<g fill="currentColor">/u);
    // One colour: no other fill or stroke colour, and no text or images.
    assert.doesNotMatch(art, /(fill|stroke)="(?!currentColor|none)/u);
    assert.doesNotMatch(art, /<(text|image|script|style)\b/u);
  }
});

test("the authoring guide names every backdrop", async () => {
  const guide = await readFile(
    new URL("../docs/module-authoring.md", import.meta.url),
    "utf8",
  );
  for (const name of BACKDROPS) {
    assert.ok(guide.includes(`\`${name}\``), name);
  }
});

test("regions and rooms may name a backdrop", () => {
  assert.equal(backdropTunnels.regions[0].backdrop, "cellar");
  assert.equal(backdropTunnels.regions[1].backdrop, "crypt");
  assert.equal(room(backdropTunnels, "alcove").backdrop, "forest");
  assert.equal("backdrop" in room(backdropTunnels, "den"), false);
  // Neither needs one, and a module without regions may name them on rooms.
  assert.equal("backdrop" in ratTunnels.rooms[0], false);
  const plain = moduleFile("rat-tunnels");
  room(plain, "den").backdrop = "crypt";
  assert.equal(room(validateModule(plain), "den").backdrop, "crypt");
});

test("the validator refuses an unknown backdrop", () => {
  const named = BACKDROPS.join(", ");
  const changed = (change) => {
    const module = structuredClone(backdropTunnelsFile);
    change(module);
    return module;
  };
  for (const [module, message] of [
    [
      changed((module) => {
        module.regions[1].backdrop = "volcano";
      }),
      `region lower names unknown backdrop volcano: use one of ${named}.`,
    ],
    [
      changed((module) => {
        room(module, "den").backdrop = "Crypt";
      }),
      `room 4 (den) names unknown backdrop Crypt: use one of ${named}.`,
    ],
    [
      changed((module) => {
        room(module, "den").backdrop = 3;
      }),
      `room 4 (den) names unknown backdrop 3: use one of ${named}.`,
    ],
  ]) {
    assert.throws(
      () => validateModule(module),
      (error) => error.message.endsWith(message),
    );
  }
});

test("the room panel shows a room's backdrop, else its region's; the AI DM sees none", () => {
  const runtime = createFifthRuntime(backdropTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.equal(runtime.projectRoom(start).backdrop, "cellar");
  assert.equal(
    runtime.projectRoom({ ...start, roomId: "alcove" }).backdrop,
    "forest",
  );
  assert.equal(
    runtime.projectRoom({ ...start, roomId: "den" }).backdrop,
    "crypt",
  );
  assert.equal(
    JSON.stringify(runtime.projectDmScene(start)).includes("backdrop"),
    false,
  );
  // Without either, there is none.
  const plain = createFifthRuntime(ratTunnels, TEST_FIGHTER);
  assert.equal("backdrop" in plain.projectRoom(plain.createSession()), false);
});

test("the map tool names each room's backdrop and each region's", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-517-map-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const map = async (module) => {
    const path = join(directory, `${module.id}.json`);
    await writeFile(path, JSON.stringify(module));
    let text = "";
    const output = { write: (chunk) => (text += chunk) };
    const code = await main([path], {
      output,
      outDir: join(directory, "maps"),
    });
    return { code, text };
  };
  const { code, text } = await map(backdropTunnelsFile);
  assert.equal(code, 0);
  assert.match(
    text,
    /\n {2}A {2}stair-foot .* Upper Tunnels {2}cellar backdrop {2}start\n/u,
  );
  assert.match(
    text,
    /\n {2}B {2}alcove .* Upper Tunnels {2}forest backdrop\n/u,
  );
  assert.match(text, /\n {2}D {2}den .* Lower Tunnels {2}crypt backdrop\n/u);
  const svg = await readFile(
    join(directory, "maps", "backdrop-tunnels.svg"),
    "utf8",
  );
  assert.match(svg, />Upper Tunnels \(cellar backdrop\)</u);
  assert.match(svg, />Lower Tunnels \(crypt backdrop\)</u);
  // Without backdrops, the room list has no column for them.
  assert.doesNotMatch((await map(moduleFile("rat-tunnels"))).text, /backdrop/u);
  // An unknown name is refused, as the validator refuses it.
  const unknown = structuredClone(backdropTunnelsFile);
  unknown.regions[0].backdrop = "volcano";
  const refused = await map(unknown);
  assert.equal(refused.code, 1);
  assert.match(
    refused.text,
    /region upper names unknown backdrop volcano: use one of /u,
  );
});
