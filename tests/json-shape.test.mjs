import assert from "node:assert/strict";
import test from "node:test";
import {
  distinct,
  exactKeys,
  id,
  integer,
  knownKeys,
  list,
  ShapeError,
  text,
  unique,
} from "../dist/json-shape.js";

const fails = (check, message) =>
  assert.throws(
    check,
    (error) => error instanceof ShapeError && message.test(error.message),
  );

test("each check returns a well-shaped value and names the problem otherwise", () => {
  assert.deepEqual(exactKeys({ a: 1, b: 2 }, ["b", "a"], "x"), { a: 1, b: 2 });
  fails(
    () => exactKeys({ a: 1 }, ["a", "b"], "x"),
    /^x must have exactly a, b\.$/,
  );
  assert.deepEqual(knownKeys({ a: 1 }, ["a"], ["b"], "x"), { a: 1 });
  fails(
    () => knownKeys({ a: 1, c: 3 }, ["a"], ["b"], "x"),
    /^x must have a and may have b, and nothing else\.$/,
  );
  assert.equal(text("Goblin", "name", 10), "Goblin");
  fails(() => text(" Goblin", "name", 10), /name must be text of 1–10/);
  fails(() => text("a\nb", "name"), /name must be text/);
  assert.equal(id("goblin-warrior", "id"), "goblin-warrior");
  fails(() => id("Goblin", "id"), /id must be a lowercase id\./);
  assert.equal(integer(3, "n", 1, 3), 3);
  fails(() => integer(1.5, "n", 1, 3), /n must be an integer from 1 to 3\./);
  assert.deepEqual(list([1], "xs", 2), [1]);
  fails(() => list([], "xs", 2), /xs must list 1–2 entries\./);
});

test("distinct and unique name the first repeated key", () => {
  assert.deepEqual(
    [...distinct(["a", "B"], (entry) => entry.toLowerCase(), String)],
    ["a", "b"],
  );
  fails(
    () =>
      distinct(
        ["a", "A"],
        (entry) => entry.toLowerCase(),
        (e) => e,
      ),
    /^A$/,
  );
  fails(
    () => unique([{ id: "rat" }, { id: "rat" }], "monster"),
    /^duplicate monster id rat\.$/,
  );
});
