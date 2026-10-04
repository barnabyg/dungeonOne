import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";

const fixture = JSON.parse(
  await readFile(
    new URL("../adventures/5e/cellar-goblin.json", import.meta.url),
  ),
);
const changed = (change) => {
  const copy = structuredClone(fixture);
  change(copy);
  return copy;
};

test("the built-in fixture is a valid one-room module with a declared level range and difficulty", async () => {
  const [adventure] = await loadBuiltInFifthAdventures();
  assert.equal(adventure.id, "cellar-goblin");
  assert.deepEqual(adventure.recommendedLevels, { min: 1, max: 1 });
  assert.equal(adventure.difficulty, "easy");
  assert.equal(adventure.rooms.length, 1);
  const [opponent] = adventure.encounters[0].opponents;
  // SRD 5.2 Goblin Warrior.
  assert.equal(opponent.statBlock.armorClass, 15);
  assert.deepEqual(opponent.statBlock.hitPoints, {
    average: 10,
    formula: "3d6",
  });
  assert.deepEqual(validateFifthAdventure(fixture), adventure);
});

test("the validator rejects unknown references", () => {
  for (const [change, message] of [
    [(m) => (m.startRoomId = "attic"), /startRoomId names unknown room attic/],
    [(m) => (m.rooms[0].encounterId = "rats"), /unknown encounter rats/],
    [
      (m) => (m.encounters[0].victoryEndingId = "parade"),
      /unknown ending parade/,
    ],
    [(m) => (m.encounters[0].defeatEndingId = "nap"), /unknown ending nap/],
    [
      (m) => (m.encounters[0].victoryEndingId = "fallen-in-the-cellar"),
      /not a victory ending/,
    ],
  ]) {
    assert.throws(() => validateFifthAdventure(changed(change)), message);
  }
});

test("the validator rejects a missing ending", () => {
  assert.throws(
    () =>
      validateFifthAdventure(
        changed((m) => {
          m.endings = m.endings.filter(({ kind }) => kind !== "victory");
        }),
      ),
    /missing a victory ending|unknown ending goblin-defeated/,
  );
  assert.throws(
    () => validateFifthAdventure(changed((m) => (m.endings = []))),
    /endings must list/,
  );
});

test("the validator rejects malformed modules", () => {
  for (const [change, message] of [
    [(m) => (m.difficulty = "deadly"), /difficulty/],
    [
      (m) => (m.recommendedLevels = { min: 2, max: 1 }),
      /recommendedLevels max/,
    ],
    [(m) => (m.surprise = true), /exactly/],
    [
      (m) => m.rooms.push(structuredClone(m.rooms[0])),
      /duplicate room id cellar/,
    ],
    [(m) => (m.encounters[0].opponents[0].id = "pc"), /reserved/],
    [
      (m) => (m.encounters[0].opponents[0].statBlock.armorClass = "15"),
      /armorClass/,
    ],
    [
      (m) => (m.encounters[0].opponents[0].statBlock.attacks = []),
      /attacks must list/,
    ],
    [
      (m) => (m.encounters[0].opponents[0].statBlock.challengeRating = "1/3"),
      /challengeRating/,
    ],
  ]) {
    assert.throws(() => validateFifthAdventure(changed(change)), message);
  }
});

test("a module in another format version is refused by name and left unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adventure-5e-"));
  try {
    const path = join(directory, "old.json");
    const bytes = JSON.stringify({ ...fixture, formatVersion: 0 });
    await writeFile(path, bytes);
    await assert.rejects(loadFifthAdventure(path), (error) => {
      assert.match(
        error.message,
        /old\.json is a 5e adventure module in format version 0, not 1\. Move it aside/,
      );
      return true;
    });
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the group-fight module holds three goblins with distinct names", async () => {
  const adventures = await loadBuiltInFifthAdventures();
  assert.deepEqual(
    adventures.map(({ id }) => id),
    ["cellar-goblin", "goblin-storeroom"],
  );
  const group = adventures[1];
  assert.equal(group.difficulty, "hard");
  assert.deepEqual(
    group.encounters[0].opponents.map(({ id, name, statBlock }) => [
      id,
      name,
      statBlock.name,
    ]),
    [
      ["minion-1", "Goblin Minion 1", "Goblin Minion"],
      ["minion-2", "Goblin Minion 2", "Goblin Minion"],
      ["warrior", "Goblin Warrior", "Goblin Warrior"],
    ],
  );
});

test("the validator rejects opponents in one encounter that share a name", () => {
  assert.throws(
    () =>
      validateFifthAdventure(
        changed((m) =>
          m.encounters[0].opponents.push({
            ...m.encounters[0].opponents[0],
            id: "goblin-2",
          }),
        ),
      ),
    /encounter 1 has two opponents named Goblin Warrior; give each a name the player can target/,
  );
});
