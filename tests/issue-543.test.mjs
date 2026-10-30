// #543: a locked door may have a spare key. Either key unlocks it, the
// reachability check counts the spare, and the adventure format is bumped,
// since a door now lists its keys.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FIFTH_ADVENTURE_FORMAT,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { uncheckedDice as dice } from "./fixtures/engine-dice.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";

/** The crypt with a spare key to the iron door on the stair's carving. */
function spareKeyCrypt() {
  const file = moduleFile("sealed-crypt");
  file.passages.find(({ id }) => id === "hall-to-strongroom").door.keyItemIds =
    ["iron-key", "spare-key"];
  file.rooms
    .find(({ id }) => id === "crypt-stair")
    .items.push({
      id: "spare-key",
      name: "Spare Key",
      description: "A second iron key, newer than the first.",
      kind: "key",
      hiddenIn: "carved-warning",
    });
  return validateModule(file);
}

test("an older module file is refused by name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-543-"));
  try {
    const path = join(directory, "one-key-crypt.json");
    const older = moduleFile("sealed-crypt");
    older.formatVersion = 45;
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      loadFifthAdventure(path),
      new RegExp(
        `^Error: ${path.replace(/[\\.]/gu, "\\$&")} is a 5e adventure module in format version 45, not ${FIFTH_ADVENTURE_FORMAT}\\. Move it aside; the file has not been changed\\.$`,
        "u",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the spare key unlocks the door without the first key", () => {
  const runtime = createFifthRuntime(spareKeyCrypt(), TEST_FIGHTER);
  let state = runtime.createSession();
  for (const action of [
    { type: "begin" },
    { type: "examine", targetId: "carved-warning" },
    { type: "take", itemId: "spare-key" },
    { type: "move", destinationId: "hall" },
  ]) {
    const result = runtime.handleAction(state, action, dice());
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    state = result.state;
  }
  assert.ok(!state.inventory.includes("iron-key"));
  const unlock = runtime
    .projectActions(state)
    .find(
      ({ action, target }) => action === "unlock" && target?.id === "iron-door",
    );
  assert.equal(unlock?.available, true);
  const unlocked = runtime.handleAction(
    state,
    { type: "unlock", doorId: "iron-door" },
    dice(),
  );
  assert.equal(unlocked.rejection, undefined);
  assert.deepEqual(unlocked.state.openedDoorIds, ["iron-door"]);
});
