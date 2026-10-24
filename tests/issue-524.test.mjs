// #524: the opening is an arrival card with an empty reply, and an arrival
// reads "Dog Yard — …" rather than "You enter the Dog Yard. …". A trace
// replays the opening exactly, so traces from before the change are refused
// by their format version. Sessions are not: an older session keeps its old
// opening reply and "You enter the…" lines and loads as it is.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FifthSession } from "../dist/session-5e.js";
import { FIFTH_TRACE_FORMAT, verifyFifthTraceFile } from "../dist/trace-5e.js";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";

test("a trace from before the arrival entry is refused by its format version", async () => {
  assert.equal(FIFTH_TRACE_FORMAT, 64);
  const directory = await mkdtemp(join(tmpdir(), "issue-524-"));
  try {
    const tracePath = join(directory, "trace.json");
    const trace = JSON.stringify({
      kind: "dungeon-one-5e-trace",
      formatVersion: 60,
    });
    await writeFile(tracePath, trace);
    await assert.rejects(
      verifyFifthTraceFile(tracePath, [findsYard]),
      new RegExp(
        String.raw`trace\.json is a trace in format version 60, not ${FIFTH_TRACE_FORMAT}\. This build cannot replay it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(tracePath, "utf8"), trace);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a session with the old opening reply and entry wording still loads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-524-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "e".repeat(32),
      7,
      findsYard,
      BEA,
    );
    await session.persist();
    const file = JSON.parse(await readFile(path, "utf8"));
    const room = findsYard.rooms.find(({ id }) => id === findsYard.startRoomId);
    // Before #524 the opening was a reply naming the room, with no card for
    // a quiet start room; an entered room read "You enter the …".
    const opening = `${room.name}. ${room.description}`;
    const entered = `You enter the ${room.name}. ${room.description}`;
    file.history = [
      { reply: opening, cards: [] },
      {
        player: "Look around.",
        reply: "",
        cards: [
          {
            kind: "narration",
            text: entered,
            lines: [{ text: entered, rolls: [] }],
          },
        ],
      },
    ];
    await writeFile(path, JSON.stringify(file));
    const loaded = await FifthSession.load(path, [findsYard]);
    assert.equal(loaded.history[0].reply, opening);
    assert.deepEqual(loaded.history[0].cards, []);
    assert.equal(loaded.history[1].cards[0].text, entered);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
