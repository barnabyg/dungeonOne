// #425: the AI DM failed three cases of the delve evaluation suite on main.
// Asked to take an item in the guard post, or to sneak up on whoever is at
// the broken gate, it moved there, and asked to slip past a fight it had
// already joined, it fled. The prompt (v43) says a move is made only when
// the player asks to go, that a sneak with no fight to sneak up on moves
// nowhere in its place, and that slipping past a fight is not fleeing. The
// clear attack case names the test Fighter's mace, not a sword she lacks.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_DM_CASES } from "../dist/dm-evaluation-5e.js";
import {
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
} from "../dist/runtime-5e.js";
import { TEST_FIGHTER_CHOICES } from "../dist/test-fighter-5e.js";

test("the prompt is v43", () => {
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v43");
});

test("a request to do something in another room is not a move", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /Call move only when the player asks to go: a request to take, examine, search or do something in another room, even one through an exit here .*, is not a request to go there, so say it is in another room and they must go there first, without calling a tool; never move there in its place\./u,
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /when the player asks to go to a known room that is not an exit here, move one room toward it by the ways they give; a request to do something there is not a request to go\./u,
  );
});

test("a sneak with no fight to sneak up on moves nowhere", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /if the player asks to sneak up on or ambush someone where sneak is not offered, say there is no one to sneak up on there, without calling a tool; never move there in its place\./u,
  );
});

test("slipping past a fight is not fleeing", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /Slipping, sneaking or creeping past a fight is not fleeing: never call flee in its place; if flee lists that way, say each opponent able to act will attack as the character goes, and ask whether it flees instead\./u,
  );
});

test("the clear attack names the test Fighter's own weapon, her mace", () => {
  const sample = FIFTH_DM_CASES.find(({ id }) => id === "clear-attack");
  assert.equal(sample.playerInput, "Attack the zombie with my mace.");
  assert.equal(TEST_FIGHTER_CHOICES.kit, "mace");
});
