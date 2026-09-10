import assert from "node:assert/strict";
import test from "node:test";

import { parseCommand } from "../dist/parser.js";

test("canonical commands are parsed case-insensitively", () => {
  assert.deepEqual(parseCommand("  HeLp  "), { type: "help" });
  assert.deepEqual(parseCommand("LOOK"), { type: "look" });
  assert.deepEqual(parseCommand("InSpEcT Ruined Archway"), {
    type: "inspect",
    target: "ruined archway",
  });
  assert.deepEqual(parseCommand("MoVe GuardRoom"), {
    type: "move",
    destination: "guardroom",
  });
  assert.deepEqual(parseCommand("STATUS"), { type: "status" });
  assert.deepEqual(parseCommand("Inventory"), { type: "inventory" });
  assert.deepEqual(parseCommand("QUIT"), { type: "quit" });
});

test("argument commands stay structured when their argument is missing", () => {
  assert.deepEqual(parseCommand("inspect"), { type: "inspect", target: "" });
  assert.deepEqual(parseCommand("move   "), { type: "move", destination: "" });
});

test("argument-free commands reject extra words instead of guessing intent", () => {
  assert.deepEqual(parseCommand("look around"), {
    type: "unknown",
    input: "look around",
  });
  assert.deepEqual(parseCommand("status please"), {
    type: "unknown",
    input: "status please",
  });
  assert.deepEqual(parseCommand("quit now"), {
    type: "unknown",
    input: "quit now",
  });
});

test("empty and unknown input become structured actions", () => {
  assert.deepEqual(parseCommand("   "), { type: "empty" });
  assert.deepEqual(parseCommand("dance wildly"), {
    type: "unknown",
    input: "dance wildly",
  });
});
