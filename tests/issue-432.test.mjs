// #432: "You carry" groups what the character carries besides its gear. The
// room view says each entry's group: consumables (potions, spell scrolls and
// wands), treasure (gems and art objects) or other (keys, tools).
import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { HAUL, packedBarrow } from "./fixtures/packed-barrow.mjs";
import { sealedCrypt } from "./fixtures/modules.mjs";

const run = (runtime, state, action) => {
  const result = runtime.handleAction(state, action, createSeededRandom(0));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
};

test("each carried item says its group: consumable, treasure or other", () => {
  const runtime = createFifthRuntime(packedBarrow, TEST_FIGHTER);
  let state = run(runtime, runtime.createSession(), { type: "begin" });
  state = run(runtime, state, {
    type: "examine",
    targetId: "scratched-lintel",
  });
  for (const { id } of HAUL) {
    state = run(runtime, state, { type: "take", itemId: id });
  }
  const groups = Object.fromEntries(
    runtime.projectRoom(state).inventory.map(({ id, group }) => [id, group]),
  );
  assert.deepEqual(groups, {
    "healing-potion-1": "consumable",
    "healing-potion-2": "consumable",
    "healing-potion-3": "consumable",
    "dull-garnet-1": "treasure",
    "dull-garnet-2": "treasure",
    "dull-garnet-3": "treasure",
    "dull-garnet-4": "treasure",
    "dull-garnet-5": "treasure",
    "silver-cup": "treasure",
    "silver-comb": "treasure",
    "packed-barrow/armour-scroll": "consumable",
  });
});

test("a key is in the other group", () => {
  const runtime = createFifthRuntime(sealedCrypt, TEST_FIGHTER);
  const state = runtime.createSession();
  const key = sealedCrypt.rooms
    .flatMap(({ items }) => items)
    .find(({ kind }) => kind === "key");
  const carrying = { ...state, inventory: [key.id] };
  assert.deepEqual(
    runtime.projectRoom(carrying).inventory.map(({ id, group }) => [id, group]),
    [[key.id, "other"]],
  );
});
