import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createCharacter, advanceCharacter } from "../dist/character-rules.js";
import { SaveSession } from "../dist/save.js";
import {
  createSessionTrace,
  recordTraceAction,
  completeSessionTrace,
} from "../dist/trace.js";
import { verifyTraceFile } from "../dist/replay.js";

test("character saves replay their frozen sheet independently of later career advancement", async () => {
  const loaded = loadAdventure(
    await readFile("adventures/hollow-beacon-characters.json"),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const sheet = createCharacter("Ada", "scout");
  const runtime = createDataRuntime(loaded.adventure, sheet);
  const directory = await mkdtemp(join(tmpdir(), "character-save-"));
  try {
    const session = await SaveSession.start(
      join(directory, "save.json"),
      runtime,
      42,
    );
    const action = runtime.parseCommand("move keeper-path");
    const result = await session.commit("move keeper-path", action);
    assert.equal(result.rejection, undefined);
    assert.equal(session.progress.sequence, 1);
    const resumed = await SaveSession.load(session.path);
    assert.deepEqual(resumed.state, session.state);
    assert.equal(
      resumed.runtime.projectCharacterStatus(resumed.state).sheet.level,
      1,
    );
    assert.equal(advanceCharacter(sheet, 2500, 18).level, 3);
    assert.equal(JSON.parse(await readFile(session.path)).formatVersion, 4);
    const trace = createSessionTrace(42, runtime.createSession(), runtime);
    recordTraceAction(trace, "move keeper-path", action, [], result);
    completeSessionTrace(trace, "eof", result.state);
    await writeFile(join(directory, "trace.json"), JSON.stringify(trace));
    await verifyTraceFile(join(directory, "trace.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
