import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CharacterLibrary } from "../dist/character-library.js";
import {
  createCharacter,
  createRolledCharacter,
} from "../dist/character-rules.js";

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

test("a rolled character joins an existing library without changing its earlier records", async () => {
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
    // New characters, from presets or rolls, carry treasure (#119).
    assert.equal(after.characters[0].sheet.rulesVersion, "fighter-rules-v3");
    assert.equal(after.characters[1].sheet.rulesVersion, "fighter-rules-v3");
    assert.deepEqual(after.characters[1].sheet.inventory, {
      silver: 0,
      items: [],
    });
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

// Released libraries are a compatibility contract: version 1 and 2 records
// load unchanged beside new version 3 characters (#119).
test("a library of released version 1 and 2 characters loads unchanged and accepts version 3 characters", async () => {
  const directory = await mkdtemp(join(tmpdir(), "character-library-"));
  try {
    const path = join(directory, "characters.json");
    const record = (sheet) => ({
      sheet,
      revision: 1,
      availability: "ready",
      earnedRewards: [],
      acceptedReceipts: [],
    });
    const released = {
      kind: "dungeon-one-characters",
      formatVersion: 1,
      revision: "1".repeat(32),
      characters: [
        record(createCharacter("Ada", "balanced", "a".repeat(32))),
        record(
          createRolledCharacter(
            "Bram",
            {
              strength: [6, 5, 4],
              dexterity: [3, 3, 3],
              constitution: [1, 3, 3],
              intelligence: [1, 1, 1],
              wisdom: [2, 2, 2],
              charisma: [6, 6, 6],
            },
            "b".repeat(32),
          ),
        ),
      ],
      sessions: [],
    };
    await writeFile(path, JSON.stringify(released) + "\n");
    const library = new CharacterLibrary(path);
    assert.deepEqual(await library.read(), released);
    const added = await library.create("Cora", "scout", released.revision);
    assert.deepEqual(added.characters.slice(0, 2), released.characters);
    assert.equal(added.characters[2].sheet.rulesVersion, "fighter-rules-v3");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
