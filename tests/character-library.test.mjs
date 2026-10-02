import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CharacterLibrary } from "../dist/character-library.js";

test("characters survive closing before selecting any adventure, and stale edits fail", async () => {
  const directory = await mkdtemp(join(tmpdir(), "character-library-"));
  try {
    const path = join(directory, "characters.json");
    const library = new CharacterLibrary(path);
    const before = await library.read();
    const saved = await library.create("Ada", "balanced", before.revision);
    assert.equal(saved.characters[0].sheet.name, "Ada");
    assert.deepEqual(await new CharacterLibrary(path).read(), saved);
    await assert.rejects(
      library.create("Stale", "scout", before.revision),
      /stale/,
    );
    const two = await library.create("Bram", "stout", saved.revision);
    assert.equal(two.characters.length, 2);
    assert.equal(JSON.parse(await readFile(path, "utf8")).formatVersion, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
