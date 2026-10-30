// #491: the engine records each item examined, as it records features, and
// the projected Examine on a feature, a body or an item says once it has
// been examined; a feature's "Try again" does not. Items examined are saved
// with the state, so older saves and traces are refused. Played on the
// finds yard with Bea and the rope cove with Ada.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT, verifyFifthTraceFile } from "../dist/trace-5e.js";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";
import { ropeCove } from "./fixtures/modules.mjs";

const examine = (targetId) => ({ type: "examine", targetId });
const take = (itemId) => ({ type: "take", itemId });

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result.state;
}

/** The projected Examine actions on `target`: each one's retry and mark. */
const examines = (runtime, state, target) =>
  runtime
    .projectActions(state)
    .filter(
      ({ action, target: on }) => action === "examine" && on?.id === target,
    )
    .map(({ retry, examined }) => ({
      retry: retry !== undefined,
      examined: examined === true,
    }));

const yard = createFifthRuntime(findsYard, BEA);
const inYard = accepted(yard, yard.createSession(), { type: "begin" });

test("examining an item records it once, whether it lies in the room or is carried", () => {
  assert.deepEqual(inYard.examinedItemIds, []);
  const looked = accepted(yard, inYard, examine("yard-potion"));
  assert.deepEqual(looked.examinedItemIds, ["yard-potion"]);
  assert.deepEqual(looked.examinedFeatureIds, []);
  // Examining it again records nothing new.
  assert.deepEqual(
    accepted(yard, looked, examine("yard-potion")).examinedItemIds,
    ["yard-potion"],
  );
  // Taking it keeps the record; a feature is still recorded as a feature.
  const taken = accepted(yard, looked, take("yard-potion"));
  assert.deepEqual(taken.examinedItemIds, ["yard-potion"]);
  const searched = accepted(yard, taken, examine("water-butt"));
  assert.deepEqual(searched.examinedFeatureIds, ["water-butt"]);
  assert.deepEqual(searched.examinedItemIds, ["yard-potion"]);
  // A carried item examined for the first time is recorded too.
  const unlooked = accepted(yard, inYard, take("yard-potion"));
  assert.deepEqual(unlooked.examinedItemIds, []);
  assert.deepEqual(
    accepted(yard, unlooked, examine("yard-potion")).examinedItemIds,
    ["yard-potion"],
  );
});

test("Examine is marked on a feature and an item once examined, in the room and carried", () => {
  assert.deepEqual(examines(yard, inYard, "water-butt"), [
    { retry: false, examined: false },
  ]);
  assert.deepEqual(examines(yard, inYard, "yard-potion"), [
    { retry: false, examined: false },
  ]);
  const looked = accepted(
    yard,
    accepted(yard, inYard, examine("water-butt")),
    examine("yard-potion"),
  );
  assert.deepEqual(examines(yard, looked, "water-butt"), [
    { retry: false, examined: true },
  ]);
  assert.deepEqual(examines(yard, looked, "yard-potion"), [
    { retry: false, examined: true },
  ]);
  // The other feature is not marked.
  assert.deepEqual(examines(yard, looked, "woodpile"), [
    { retry: false, examined: false },
  ]);
  const taken = accepted(yard, looked, take("yard-potion"));
  assert.deepEqual(examines(yard, taken, "yard-potion"), [
    { retry: false, examined: true },
  ]);
});

test("a feature's Try again is not marked; its Examine is, and a carried item keeps its mark in another room", () => {
  const cove = createFifthRuntime(ropeCove, TEST_FIGHTER);
  const begun = accepted(cove, cove.createSession(), { type: "begin" });
  // 8 + 5 = 13 against DC 15: a plain failure.
  const climbed = accepted(cove, begun, examine("sheer-cliff"), dice([20, 8]));
  const roped = accepted(
    cove,
    accepted(cove, climbed, examine("old-crate")),
    take("knotted-rope"),
  );
  assert.deepEqual(examines(cove, roped, "sheer-cliff"), [
    { retry: false, examined: true },
    { retry: true, examined: false },
  ]);
  assert.deepEqual(examines(cove, roped, "old-crate"), [
    { retry: false, examined: true },
  ]);
  // The rope was taken unexamined.
  assert.deepEqual(examines(cove, roped, "knotted-rope"), [
    { retry: false, examined: false },
  ]);
  // Examined, it keeps its mark when carried into another room.
  const looked = accepted(cove, roped, examine("knotted-rope"));
  const forced = accepted(
    cove,
    looked,
    { type: "force", doorId: "swollen-door" },
    dice([20, 15]),
  );
  const inShed = accepted(cove, forced, {
    type: "move",
    destinationId: "tool-shed",
  });
  assert.equal(inShed.roomId, "tool-shed");
  assert.deepEqual(examines(cove, inShed, "knotted-rope"), [
    { retry: false, examined: true },
  ]);
});

test("a save keeps the items examined; an older save and an older trace are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-491-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "d".repeat(32),
      7,
      findsYard,
      BEA,
    );
    for (const action of [examine("yard-potion"), take("yard-potion")]) {
      const { result } = session.act(action, "click");
      assert.equal(result.rejection, undefined);
    }
    await session.persist();
    const loaded = await FifthSession.load(path, [findsYard]);
    assert.deepEqual(loaded.state.examinedItemIds, ["yard-potion"]);
    const file = JSON.parse(await readFile(path, "utf8"));
    assert.equal(file.formatVersion, FIFTH_SESSION_FORMAT);

    const older = { ...file, formatVersion: 63 };
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      FifthSession.load(path, [findsYard]),
      new RegExp(
        String.raw`session\.json is an adventure session in format version 63, not ${FIFTH_SESSION_FORMAT}\. This build cannot continue it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(path, "utf8"), JSON.stringify(older));

    const tracePath = join(directory, "trace.json");
    const trace = JSON.stringify({
      kind: "dungeon-one-5e-trace",
      formatVersion: 57,
    });
    await writeFile(tracePath, trace);
    await assert.rejects(
      verifyFifthTraceFile(tracePath, [findsYard]),
      new RegExp(
        String.raw`trace\.json is a trace in format version 57, not ${FIFTH_TRACE_FORMAT}\. This build cannot replay it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(tracePath, "utf8"), trace);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
