import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { CharacterCareer } from "../dist/character-career.js";
import { SaveSession } from "../dist/save.js";
import { acquireFileLock } from "../dist/file-lock.js";
import { startBrowserServer } from "../dist/browser-server.js";

test("an interrupted start recovers its exact reservation; competing starts and turns fail", async () => {
  const directory = await mkdtemp(join(tmpdir(), "career-start-recovery-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  try {
    const data = await career.library.create(
      "Ada",
      "balanced",
      (await career.library.read()).revision,
    );
    await writeFile(join(directory, "character-adventures"), "blocked");
    await assert.rejects(
      career.start(
        data.characters[0].sheet.id,
        "hollow-beacon",
        data.revision,
        42,
        true,
      ),
    );
    const reserved = await career.library.read();
    assert.equal(reserved.sessions[0].status, "starting");
    assert.equal(reserved.characters[0].availability, "active");
    await rm(join(directory, "character-adventures"));
    await new CharacterCareer(career.library.path).recoverStarts();
    const recovered = await career.library.read();
    assert.equal(recovered.sessions.length, 1);
    assert.equal(recovered.sessions[0].id, reserved.sessions[0].id);
    const session = await SaveSession.load(
      career.sessionPath(recovered.sessions[0].id),
    );
    assert.deepEqual(
      session.runtime.startingCharacter,
      reserved.sessions[0].startingCharacter,
    );
    assert.equal(session.seed, 42);
    assert.equal(session.progress.randomPosition, 0);
    await assert.rejects(
      career.start(
        data.characters[0].sheet.id,
        "stonebridge",
        recovered.revision,
        42,
        true,
      ),
      /available/,
    );
    const release = await career.beginTurn(session);
    try {
      await assert.rejects(
        new CharacterCareer(career.library.path).beginTurn(session),
        /busy/,
      );
    } finally {
      await release();
    }
    const checkpoint = await readFile(session.path);
    await session.commit(
      "move keeper-path",
      session.runtime.parseCommand("move keeper-path"),
    );
    await career.acceptSession(session.path);
    await writeFile(session.path, checkpoint);
    await assert.rejects(
      career.beginTurn(await SaveSession.load(session.path)),
      /stale/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "a crashed OS lock owner releases; concurrent recovery grants exactly one owner",
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "career-lock-"));
    const path = join(directory, "owner.lock");
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { acquireFileLock } from ${JSON.stringify(new URL("../dist/file-lock.js", import.meta.url).href)}; await acquireFileLock(process.argv[1]); process.stdout.write("owned");`,
        path,
      ],
      { windowsHide: true },
    );
    try {
      const [ready] = await once(child.stdout, "data");
      assert.equal(ready.toString(), "owned");
      await assert.rejects(acquireFileLock(path), /busy/);
      const closed = once(child, "close");
      child.kill();
      await closed;
      const contenders = await Promise.allSettled(
        Array.from({ length: 8 }, () => acquireFileLock(path)),
      );
      const owners = contenders.filter(
        (result) => result.status === "fulfilled",
      );
      assert.equal(owners.length, 1);
      for (const result of contenders.filter(
        (result) => result.status === "rejected",
      )) {
        assert.match(result.reason.message, /busy/);
      }
      await owners[0].value();
      const next = await acquireFileLock(path);
      await next();
    } finally {
      child.kill();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("a missing character library leaves the embedded adventure readable without enabling play or XP publication", async () => {
  const directory = await mkdtemp(join(tmpdir(), "career-orphan-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  let server;
  let calls = 0;
  try {
    const data = await career.library.create(
      "Ada",
      "balanced",
      (await career.library.read()).revision,
    );
    const path = await career.start(
      data.characters[0].sheet.id,
      "hollow-beacon",
      data.revision,
      42,
      true,
    );
    const original = await readFile(path);
    await rm(career.library.path);
    server = await startBrowserServer({
      contentVersion: "11",
      libraryPath: career.library.path,
      savePath: path,
      seed: 42,
      apiKey: "offline",
      dmModel: {
        async respond() {
          calls++;
          throw new Error("must not call AI");
        },
      },
    });
    const view = await (await fetch(server.url + "/api/state")).json();
    assert.equal(view.scene.outcome, "quit");
    assert.deepEqual(view.actions, []);
    assert.equal(view.character.sheet.name, "Ada");
    const attempt = await fetch(server.url + "/api/turn", {
      method: "POST",
      headers: { Origin: server.url },
      body: JSON.stringify({
        revision: view.revision,
        message: "Travel to Keeper Path",
      }),
    });
    assert.equal(attempt.ok, false);
    assert.equal(calls, 0);
    assert.deepEqual(await readFile(path), original);
    await assert.rejects(career.acceptSession(path), /association is missing/);
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("successful optional checks earn pending XP that abandonment discards", async () => {
  const directory = await mkdtemp(join(tmpdir(), "career-pending-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  try {
    const data = await career.library.create(
      "Ada",
      "scout",
      (await career.library.read()).revision,
    );
    const id = data.characters[0].sheet.id;
    const path = await career.start(
      id,
      "hollow-beacon",
      data.revision,
      1,
      true,
    );
    const session = await SaveSession.load(path);
    // Seed 1's first d20 succeeds with Wisdom +1.
    await session.commit(
      "check read-beacon",
      session.runtime.parseCommand("check read-beacon"),
    );
    assert.equal(
      session.state.pendingRewards.reduce((sum, reward) => sum + reward.xp, 0),
      20,
    );
    await career.acceptSession(path);
    await career.abandon(id, (await career.library.read()).revision, true);
    const result = await career.library.read();
    assert.equal(result.characters[0].sheet.xp, 0);
    assert.deepEqual(result.characters[0].earnedRewards, []);
    assert.equal(result.sessions[0].status, "abandoned");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
