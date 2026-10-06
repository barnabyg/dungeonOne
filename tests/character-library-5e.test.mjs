import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { buildFighter, keptTotal } from "../dist/fighter-5e.js";

// A pre-5e character library, as the deleted pre-5e game wrote it (#139).
const PRE_5E_LIBRARY = JSON.stringify({
  kind: "dungeon-one-characters",
  formatVersion: 1,
  revision: "0".repeat(32),
  characters: [{ id: "a".repeat(32), name: "Ada" }],
});

const IN_ORDER = {
  strength: 0,
  dexterity: 1,
  constitution: 2,
  intelligence: 3,
  wisdom: 4,
  charisma: 5,
};
const CHOICES = {
  placement: IN_ORDER,
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
};

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "character-library-5e-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a pending creation is saved before it is returned and never changes", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(path, 7);
    assert.equal((await library.read()).pendingCreation, undefined);
    const started = await library.startCreation();
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.equal(stored.formatVersion, 4);
    assert.deepEqual(stored.pendingCreation, started.pendingCreation);
    assert.equal(started.pendingCreation.dice.length, 6);
    const bytes = await readFile(path);
    // Asking again, from this or a restarted library with any seed, returns the
    // stored dice without writing.
    assert.deepEqual(
      (await library.startCreation()).pendingCreation,
      started.pendingCreation,
    );
    assert.deepEqual(
      (await new FifthCharacterLibrary(path, 99).startCreation())
        .pendingCreation,
      started.pendingCreation,
    );
    assert.deepEqual(await readFile(path), bytes);
  });
});

test("saving spends the pending dice; the next creation rolls new ones", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(path, 7);
    const first = await library.startCreation();
    const saved = await library.create("Ada", CHOICES, first.revision);
    assert.equal(saved.pendingCreation, undefined);
    assert.equal(saved.characters.length, 1);
    const sheet = saved.characters[0].sheet;
    assert.equal(sheet.name, "Ada");
    assert.equal(sheet.level, 1);
    assert.equal(sheet.xp, 0);
    assert.equal(
      sheet.abilities.strength,
      keptTotal(first.pendingCreation.dice[0]) + 2,
    );
    assert.deepEqual(await new FifthCharacterLibrary(path, 7).read(), saved);
    await assert.rejects(
      library.create("Bram", CHOICES, saved.revision),
      /no pending creation/i,
    );
    const second = await new FifthCharacterLibrary(path, 7).startCreation();
    assert.equal(second.pendingCreation.number, 2);
    assert.notDeepEqual(
      second.pendingCreation.dice,
      first.pendingCreation.dice,
    );
  });
});

test("the library accepts only level 1, 0 XP sheets made from the pending dice", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(path, 7);
    const { pendingCreation, revision } = await library.startCreation();
    const id = "b".repeat(32);
    const sheet = buildFighter(id, "Ada", pendingCreation.dice, CHOICES);
    await assert.rejects(
      library.save({ ...sheet, level: 2, xp: 300 }, revision),
      /level 1 with 0 XP/,
    );
    await assert.rejects(
      library.save({ ...sheet, xp: 10 }, revision),
      /level 1 with 0 XP/,
    );
    await assert.rejects(
      library.save({ ...sheet, hp: sheet.hp - 1 }, revision),
      /full health/,
    );
    const otherDice = pendingCreation.dice.map((roll) =>
      roll.map((die) => (die === 6 ? 6 : die + 1)),
    );
    await assert.rejects(
      library.save(buildFighter(id, "Ada", otherDice, CHOICES), revision),
      /pending creation's dice/,
    );
    await assert.rejects(
      library.save(
        { ...sheet, abilities: { ...sheet.abilities, wisdom: 3 } },
        revision,
      ),
      /Ability scores/,
    );
    await assert.rejects(
      library.create("Ada", { ...CHOICES, increase: { wisdom: 3 } }, revision),
      /increase/,
    );
    await assert.rejects(
      library.create(
        "Ada",
        { ...CHOICES, placement: { ...IN_ORDER, wisdom: 0 } },
        revision,
      ),
      /placement/,
    );
    await assert.rejects(
      library.create("Ada", CHOICES, "0".repeat(32)),
      /stale/,
    );
    const saved = await library.save(sheet, revision);
    assert.deepEqual(saved.characters[0].sheet, sheet);
  });
});

test("a pre-5e library is refused by name and left byte-identical", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    await writeFile(path, PRE_5E_LIBRARY);
    const before = await readFile(path);
    const library = new FifthCharacterLibrary(path, 7);
    const refusal = new RegExp(
      `${path.replaceAll("\\", "\\\\")} is a pre-5e character library.*Move it aside`,
    );
    await assert.rejects(library.read(), refusal);
    await assert.rejects(library.startCreation(), refusal);
    assert.deepEqual(await readFile(path), before);

    await writeFile(
      path,
      JSON.stringify({ ...JSON.parse(before), formatVersion: 9 }),
    );
    await assert.rejects(library.read(), /format version 9.*Move it aside/);
    // A library from #127's build, before adventure sessions.
    const earlier = JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: 2,
      revision: "0".repeat(32),
      creationsStarted: 0,
      characters: [],
    });
    await writeFile(path, earlier);
    await assert.rejects(
      library.read(),
      /5e character library from an earlier build \(format version 2\).*Move it aside/,
    );
    assert.equal(await readFile(path, "utf8"), earlier);
    await writeFile(path, "{");
    await assert.rejects(library.read(), /Invalid character library/);
  });
});

test("a malformed stored sheet or pending creation is rejected", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(path, 7);
    const started = await library.startCreation();
    const saved = await library.create("Ada", CHOICES, started.revision);
    const stored = JSON.parse(await readFile(path, "utf8"));
    await writeFile(
      path,
      JSON.stringify({
        ...stored,
        characters: [
          {
            ...stored.characters[0],
            sheet: { ...saved.characters[0].sheet, level: 3 },
          },
        ],
      }),
    );
    await assert.rejects(library.read(), /level/);
    await writeFile(
      path,
      JSON.stringify({
        ...stored,
        pendingCreation: { number: 1, dice: [[1, 2, 3, 4]] },
      }),
    );
    await assert.rejects(library.read(), /dice/);
  });
});

test("deleting a character removes only it and keeps the pending dice", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(path, 7);
    let data = await library.create(
      "Ada",
      CHOICES,
      (await library.startCreation()).revision,
    );
    data = await library.create(
      "Bram",
      CHOICES,
      (await library.startCreation()).revision,
    );
    data = await library.startCreation();
    const [ada, bram] = data.characters;
    const before = await readFile(path, "utf8");
    const keptBram = JSON.stringify(bram);
    const keptPending = JSON.stringify(data.pendingCreation);
    assert.ok(before.includes(keptBram) && before.includes(keptPending));

    // Unknown id, inexact names and a stale revision all write nothing.
    const refusals = [
      [ada.sheet.id, "Ada", "0".repeat(32), /stale/],
      ["c".repeat(32), "Ada", data.revision, /no such character/i],
      [ada.sheet.id, "ada", data.revision, /exactly/],
      [ada.sheet.id, " Ada", data.revision, /exactly/],
      [ada.sheet.id, "Ada ", data.revision, /exactly/],
      [ada.sheet.id, "Bram", data.revision, /exactly/],
    ];
    for (const [id, name, revision, message] of refusals) {
      await assert.rejects(library.delete(id, name, revision), message);
      assert.equal(await readFile(path, "utf8"), before);
    }

    const deleted = await library.delete(ada.sheet.id, "Ada", data.revision);
    assert.deepEqual(
      deleted.characters.map(({ sheet }) => sheet.name),
      ["Bram"],
    );
    assert.notEqual(deleted.revision, data.revision);
    const after = await readFile(path, "utf8");
    assert.ok(after.includes(keptBram), "Bram is byte-for-byte unchanged");
    assert.ok(after.includes(keptPending), "the pending dice are unchanged");
    const reread = await new FifthCharacterLibrary(path, 99).read();
    assert.deepEqual(reread, deleted);
    assert.equal(reread.creationsStarted, data.creationsStarted);
    // A replay of the same delete is stale; with a fresh revision, unknown.
    await assert.rejects(
      library.delete(ada.sheet.id, "Ada", data.revision),
      /stale/,
    );
    await assert.rejects(
      library.delete(ada.sheet.id, "Ada", deleted.revision),
      /no such character/i,
    );
    assert.equal(await readFile(path, "utf8"), after);
  });
});
