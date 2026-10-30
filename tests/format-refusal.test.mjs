// AGENTS.md, "5e and file formats": a loader refuses a file in an older format
// with a message that names the file and tells the player to move it aside,
// and leaves the file as it was. Each test builds a file one version behind
// the current one, so a bump needs no edit here. The save's refusal is in
// tests/issue-506.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIFTH_ADVENTURE_FORMAT,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import { FIFTH_TRACE_FORMAT, verifyFifthTraceFile } from "../dist/trace-5e.js";
import { main } from "../scripts/map-5e.mjs";
import { moduleFile, ratTunnels } from "./fixtures/modules.mjs";

/** Writes `value` as JSON into a fresh folder; returns its path and bytes. */
async function olderFile(t, name, value) {
  const directory = await mkdtemp(join(tmpdir(), "format-refusal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, name);
  const bytes = JSON.stringify(value);
  await writeFile(path, bytes);
  return { path, bytes, directory };
}

test("a character library one format behind is refused by name and left unchanged", async (t) => {
  const older = FIFTH_LIBRARY_FORMAT - 1;
  const { path, bytes } = await olderFile(t, "characters.json", {
    kind: "dungeon-one-characters",
    formatVersion: older,
    revision: "0".repeat(32),
    creationsStarted: 0,
    sessionsStarted: 0,
    characters: [],
  });
  await assert.rejects(new FifthCharacterLibrary(path, 1).read(), {
    message: `${path} is a character library in format version ${older}, not ${FIFTH_LIBRARY_FORMAT}. This build creates 5e characters and cannot read it. Move it aside, or choose another --characters path; the file has not been changed.`,
  });
  assert.equal(await readFile(path, "utf8"), bytes);
});

test("a trace one format behind is refused by name and left unchanged", async (t) => {
  const older = FIFTH_TRACE_FORMAT - 1;
  const { path, bytes } = await olderFile(t, "trace.json", {
    kind: "dungeon-one-5e-trace",
    formatVersion: older,
  });
  await assert.rejects(verifyFifthTraceFile(path, [ratTunnels]), {
    message: `${path} is a trace in format version ${older}, not ${FIFTH_TRACE_FORMAT}. This build cannot replay it. Move it aside; the file has not been changed.`,
  });
  assert.equal(await readFile(path, "utf8"), bytes);
});

test("an adventure module one format behind is refused by name and left unchanged", async (t) => {
  const older = FIFTH_ADVENTURE_FORMAT - 1;
  const { path, bytes } = await olderFile(t, "old-tunnels.json", {
    ...moduleFile("rat-tunnels"),
    formatVersion: older,
  });
  await assert.rejects(loadFifthAdventure(path), {
    message: `${path} is a 5e adventure module in format version ${older}, not ${FIFTH_ADVENTURE_FORMAT}. Move it aside; the file has not been changed.`,
  });
  assert.equal(await readFile(path, "utf8"), bytes);
});

test("a layout sketch one format behind is refused by name and left unchanged", async (t) => {
  // The fixture is in the current format, whose constant the tool keeps private.
  const sketch = JSON.parse(
    await readFile(
      fileURLToPath(
        new URL("./fixtures/fox-barrow-sketch.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const current = sketch.formatVersion;
  const older = current - 1;
  const { path, bytes, directory } = await olderFile(t, "old-sketch.json", {
    ...sketch,
    formatVersion: older,
  });
  let text = "";
  const code = await main([path], {
    output: { write: (chunk) => (text += chunk) },
    outDir: join(directory, "maps"),
  });
  assert.equal(code, 1);
  assert.equal(
    text,
    `${path}: it is a layout sketch in format version ${older}, not ${current}. Move it aside; the file has not been changed.\n`,
  );
  assert.equal(await readFile(path, "utf8"), bytes);
});
