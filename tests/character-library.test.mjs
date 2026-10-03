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

test("a rolled character joins an existing library without changing its version 1 records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "character-library-"));
  try {
    const path = join(directory, "characters.json");
    const library = new CharacterLibrary(path);
    const saved = await library.create(
      "Ada",
      "balanced",
      (await library.read()).revision,
    );
    const before = await readFile(path, "utf8");
    const rolls = {
      strength: [6, 5, 4],
      dexterity: [3, 3, 3],
      constitution: [1, 3, 3],
      intelligence: [1, 1, 1],
      wisdom: [2, 2, 2],
      charisma: [6, 6, 6],
    };
    const after = await library.createRolled("Bram", rolls, saved.revision);
    assert.deepEqual(after.characters[0], JSON.parse(before).characters[0]);
    assert.equal(after.characters[0].sheet.rulesVersion, "fighter-rules-v1");
    assert.equal(after.characters[1].sheet.rulesVersion, "fighter-rules-v2");
    assert.deepEqual(after.characters[1].sheet.abilityRolls, rolls);
    assert.deepEqual(await new CharacterLibrary(path).read(), after);
    await assert.rejects(
      library.createRolled(
        "Low",
        { ...rolls, strength: [1, 1, 1] },
        after.revision,
      ),
      /Fighter minimums/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
