import assert from "node:assert/strict";
import test from "node:test";

import { createSession, handleAction } from "../dist/session.js";

test("help keeps a fresh session playable and leaves its state unchanged", () => {
  const initial = createSession();
  const result = handleAction(initial, { type: "help" });

  assert.deepEqual(result.state, initial);
  assert.equal(result.response.type, "help");
  assert.equal(result.response.commands.includes("quit"), true);
});

test("rejected input leaves the session usable", () => {
  const initial = createSession();
  const empty = handleAction(initial, { type: "empty" });
  const unknown = handleAction(empty.state, {
    type: "unknown",
    input: "dance",
  });

  assert.deepEqual(empty.state, initial);
  assert.deepEqual(empty.response, { type: "rejected", reason: "empty" });
  assert.deepEqual(unknown.state, initial);
  assert.deepEqual(unknown.response, {
    type: "rejected",
    reason: "unknown",
    input: "dance",
  });
  assert.equal(
    handleAction(unknown.state, { type: "help" }).response.type,
    "help",
  );
});

test("quit ends the session without a gameplay outcome", () => {
  const result = handleAction(createSession(), { type: "quit" });

  assert.deepEqual(result.state, { location: "entrance", status: "quit" });
  assert.deepEqual(result.response, { type: "quit" });
});
