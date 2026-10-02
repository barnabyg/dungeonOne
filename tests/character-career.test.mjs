import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CharacterCareer } from "../dist/character-career.js";
import { SaveSession } from "../dist/save.js";

export const beaconPeaceful = [
  "move watch-loft",
  "move signal-records",
  "search setting-plate",
  "move watch-loft",
  "move watch-yard",
  "move valley-road",
  "search wagon-ruts",
  "move ridge-shelter",
  "move drainage-walk",
  "move beacon-tower",
  "search tower-work-order",
  "talk vey plate-proof ask",
  "search final-warning-board",
  "resolve human-warning",
];
export const stonebridgePeaceful = [
  "move archives",
  "search archive-chest",
  "take bridge-seal",
  "move toll-yard",
  "move bridge-span",
  "place bridge-seal at bridge-socket",
  "resolve open-crossing",
];

async function journey(session, commands) {
  for (const command of commands) {
    const result = await session.commit(
      command,
      session.runtime.parseCommand(command),
    );
    assert.equal(
      result.rejection,
      undefined,
      command + ": " + JSON.stringify(result.rejection),
    );
  }
  assert.equal(session.state.status, "victory");
}

test("one independent character completes two modules, rests, advances, and reviews without rollback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "character-career-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  try {
    let data = await career.library.create(
      "Ada",
      "balanced",
      (await career.library.read()).revision,
    );
    const id = data.characters[0].sheet.id;
    const firstPath = await career.start(
      id,
      "hollow-beacon",
      data.revision,
      42,
      true,
    );
    data = await career.library.read();
    await assert.rejects(
      career.start(id, "stonebridge", data.revision, 42, true),
      /available/,
    );
    const first = await SaveSession.load(firstPath);
    await journey(first, beaconPeaceful);
    // Simulates interruption after the terminal save, before career publication.
    await new CharacterCareer(career.library.path).synchronize();
    data = await career.library.read();
    assert.equal(data.characters[0].sheet.level, 2);
    assert.equal(data.characters[0].sheet.xp, 1000);
    assert.equal(data.characters[0].availability, "rest-needed");
    const once = await readFile(career.library.path, "utf8");
    await career.acceptSession(firstPath);
    assert.equal(await readFile(career.library.path, "utf8"), once);
    await career.rest(id, data.revision);
    data = await career.library.read();
    const secondPath = await career.start(
      id,
      "stonebridge",
      data.revision,
      43,
      true,
    );
    const second = await SaveSession.load(secondPath);
    assert.equal(second.runtime.startingCharacter.level, 2);
    assert.equal(second.runtime.startingCharacter.hp, 28);
    assert.equal(second.state.discoveries.length, 0);
    await journey(second, stonebridgePeaceful);
    await career.acceptSession(secondPath);
    data = await career.library.read();
    assert.equal(data.characters[0].sheet.level, 3);
    assert.equal(data.characters[0].sheet.xp, 2500);
    assert.equal(data.characters[0].acceptedReceipts.length, 2);
    const advanced = data.characters[0].sheet;
    await career.select(data.sessions[0].id, data.revision);
    await career.acceptSession(firstPath);
    assert.deepEqual(
      (await career.library.read()).characters[0].sheet,
      advanced,
    );
    assert.equal(
      (await SaveSession.load(firstPath)).runtime.startingCharacter.level,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("explicit abandonment preserves career, discards pending XP, and retains a reviewable journey", async () => {
  const directory = await mkdtemp(join(tmpdir(), "character-abandon-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  try {
    let data = await career.library.create(
      "Bram",
      "stout",
      (await career.library.read()).revision,
    );
    const id = data.characters[0].sheet.id;
    const path = await career.start(id, "stonebridge", data.revision, 2, true);
    data = await career.library.read();
    await assert.rejects(career.abandon(id, data.revision, false), /Confirm/);
    await career.abandon(id, data.revision, true);
    data = await career.library.read();
    assert.equal(data.characters[0].sheet.xp, 0);
    assert.equal(data.characters[0].availability, "rest-needed");
    assert.equal(data.sessions[0].status, "abandoned");
    assert.equal((await SaveSession.load(path)).state.status, "quit");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
