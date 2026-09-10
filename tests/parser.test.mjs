import assert from "node:assert/strict";
import test from "node:test";

import { parseCommand } from "../dist/parser.js";

test("canonical commands are parsed case-insensitively", () => {
  assert.deepEqual(parseCommand("  HeLp  "), { type: "help" });
  assert.deepEqual(parseCommand("QUIT"), { type: "quit" });
});

test("empty and unknown input become structured actions", () => {
  assert.deepEqual(parseCommand("   "), { type: "empty" });
  assert.deepEqual(parseCommand("dance wildly"), {
    type: "unknown",
    input: "dance wildly",
  });
});
