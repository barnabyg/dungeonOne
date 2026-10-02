import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createCharacter } from "../dist/character-rules.js";
import { SaveSession } from "../dist/save.js";

test("surviving completion records one XP award and level change, and replay preserves it", async () => {
  const source = JSON.parse(
    await readFile("adventures/hollow-beacon-characters.json", "utf8"),
  );
  source.player.locationId = "beacon-tower";
  source.initialMilestones = [...source.quest.milestones];
  source.initialDiscoveries = source.discoveries.map(({ id }) => id);
  const loaded = loadAdventure(JSON.stringify(source));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const sheet = createCharacter("Ada", "balanced");
  const runtime = createDataRuntime(loaded.adventure, sheet);
  const directory = await mkdtemp(join(tmpdir(), "character-xp-"));
  try {
    const session = await SaveSession.start(
      join(directory, "save.json"),
      runtime,
      0,
    );
    const result = await session.commit(
      "resolve human-warning",
      runtime.parseCommand("resolve human-warning"),
    );
    assert.equal(result.rejection, undefined);
    assert.equal(session.state.status, "victory");
    assert.equal(session.state.characterResult.xp, 1000);
    assert.equal(session.state.characterResult.level, 2);
    assert.equal(session.state.fighter.maxHp, 28);
    assert.match(runtime.renderResult(result), /Level 1 → 2/);
    const resumed = await SaveSession.load(session.path);
    assert.deepEqual(resumed.state, session.state);
    const repeated = await resumed.commit(
      "resolve human-warning",
      runtime.parseCommand("resolve human-warning"),
    );
    assert.ok(repeated.rejection);
    assert.equal(resumed.state.characterResult.xp, 1000);
    const second = createDataRuntime(
      loaded.adventure,
      session.state.characterResult,
    );
    const replayed = second.handleAction(
      second.createSession(),
      second.parseCommand("resolve human-warning"),
    );
    assert.equal(replayed.state.characterResult.xp, 1000);
    assert.equal(replayed.state.pendingRewards.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
