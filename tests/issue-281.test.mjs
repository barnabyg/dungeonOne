// #281: an authored check grades its outcome into bands, each with words and
// typed effects (a discovery, an item revealed, damage). Played on the graded
// cellar with Ada (Perception +2, Athletics +5, Animal Handling +0, 12 HP).
import assert from "node:assert/strict";
import test from "node:test";
import {
  FIFTH_ADVENTURE_FORMAT,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import { bandOf } from "../dist/checks-5e.js";
import { createFifthRuntime, describeFifthResult } from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary as BESTIARY } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { gradedCellar, moduleFile, room } from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(gradedCellar, TEST_FIGHTER);
const EXAMINE = { type: "examine", targetId: "rubble-heap" };

function accepted(state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const types = (events) => events.map(({ type }) => type);
const visible = (state) => runtime.projectRoom(state).items.map(({ id }) => id);
const discovery = (state, id) =>
  runtime.projectRoom(state).features.find((feature) => feature.id === id)
    .discovery;

test("a total's band: by 5 or more either side of the DC", () => {
  const band = (total) => bandOf({ total, dc: 12 });
  assert.deepEqual([7, 8, 11, 12, 16, 17].map(band), [
    "failure-by-5",
    "failure",
    "failure",
    "success",
    "success",
    "success-by-5",
  ]);
});

test("failing by 5 or more: the band's words and its damage", () => {
  const { state, events } = accepted(begun, EXAMINE, dice([20, 1], [6, 4]));
  assert.deepEqual(types(events), [
    "check",
    "examined",
    "outcome",
    "check-damage",
  ]);
  assert.equal(events[0].band, "failure-by-5");
  assert.equal(events[3].damage, 4);
  assert.equal(state.character.hp, 8);
  assert.deepEqual(state.checks, [
    { id: "examine:rubble-heap", band: "failure-by-5" },
  ]);
  assert.deepEqual(visible(state), []);
  assert.equal(discovery(state, "rubble-heap"), undefined);
  const text = runtime.renderResult({ state, events });
  assert.match(
    text,
    /Perception check: d20 1 \+ 0 \+ 2 proficiency = 3 against DC 12\. Failure by 5 or more\./,
  );
  assert.match(
    text,
    /The Rubble Heap deals 4 = 4 bludgeoning; you have 8\/12 HP\./,
  );
  // The card shows the band and the damage's dice.
  const lines = describeFifthResult(
    { state, events },
    [
      { sides: 20, value: 1 },
      { sides: 6, value: 4 },
    ],
    "Ada",
  );
  assert.equal(lines[0].rolls[0].band, "failure-by-5");
  assert.deepEqual(lines[3].rolls[0].dice, [{ sides: 6, value: 4 }]);
});

test("damage that drops the character ends the adventure in its defeat", () => {
  const weak = { ...begun, character: { ...begun.character, hp: 3 } };
  const { state, events } = accepted(weak, EXAMINE, dice([20, 1], [6, 5]));
  assert.equal(state.status, "defeat");
  assert.equal(state.endingId, "buried-in-the-cellar");
  assert.deepEqual(types(events).slice(-2), ["check-damage", "ending"]);
});

test("a plain failure: the band's words, and nothing found", () => {
  const { state, events } = accepted(begun, EXAMINE, dice([20, 9]));
  assert.equal(events[0].band, "failure");
  assert.deepEqual(types(events), ["check", "examined", "outcome"]);
  assert.equal(state.character.hp, 12);
  assert.deepEqual(visible(state), []);
  // Taking the ring is refused: no band revealed it, whatever is asked.
  assert.equal(
    runtime.handleAction(state, { type: "take", itemId: "silver-ring" }, dice())
      .rejection.code,
    "no-item",
  );
});

test("a success reveals the item to take, and only the item", () => {
  const { state, events } = accepted(begun, EXAMINE, dice([20, 10]));
  assert.equal(events[0].band, "success");
  assert.deepEqual(types(events), ["check", "examined", "revealed"]);
  assert.deepEqual(visible(state), ["silver-ring"]);
  assert.equal(discovery(state, "rubble-heap"), undefined);
  const taken = accepted(state, { type: "take", itemId: "silver-ring" });
  assert.deepEqual(taken.state.inventory, ["silver-ring"]);
});

test("a success by 5 or more reveals the item and makes the discovery", () => {
  const { state, events } = accepted(begun, EXAMINE, dice([20, 15]));
  assert.equal(events[0].band, "success-by-5");
  assert.deepEqual(types(events), [
    "check",
    "examined",
    "outcome",
    "revealed",
    "discovered",
  ]);
  assert.deepEqual(visible(state), ["silver-ring"]);
  assert.match(discovery(state, "rubble-heap"), /crushed lantern/);
  assert.match(
    runtime.renderResult({ state, events }),
    /Success by 5 or more\.[\s\S]*You find the Silver Ring\.\nPinned under a beam/,
  );
});

test("examining again repeats what the band revealed and rolls nothing", () => {
  const { state } = accepted(begun, EXAMINE, dice([20, 15]));
  const again = accepted(state, EXAMINE);
  assert.deepEqual(types(again.events), ["examined"]);
  assert.match(again.events[0].discovery, /crushed lantern/);
  assert.deepEqual(again.state.checks, state.checks);
  // Typed again through the AI DM: the same, with no die.
  const typed = runtime.dispatchGameTool(
    state,
    { name: "examine", argumentsJson: '{"target":"rubble-heap"}' },
    dice(),
  );
  assert.equal(typed.modelOutput.ok, true);
  assert.deepEqual(types(typed.modelOutput.events), ["examined"]);
});

test("a topic's band makes another feature's discovery", () => {
  const { state, events } = accepted(
    begun,
    { type: "talk", topicId: "the-cask" },
    dice([20, 15]),
  );
  assert.deepEqual(types(events), ["check", "talked", "discovered"]);
  assert.match(events[1].words, /paws at the rag/);
  assert.match(discovery(state, "cracked-cask"), /hides nothing/);
});

test("an unauthored band falls back to plain failure or success", () => {
  // The cat's topic authors only a success by 5 or more.
  const plain = accepted(
    begun,
    { type: "talk", topicId: "the-cask" },
    dice([20, 10]),
  );
  assert.equal(plain.events[0].band, "success");
  assert.deepEqual(types(plain.events), ["check", "talked"]);
  // The hatch authors only a failure by 5 or more: a total 5 over is a success.
  const forced = accepted(
    begun,
    { type: "force", doorId: "warped-hatch" },
    dice([20, 12]),
  );
  assert.equal(forced.events[0].band, "success");
  assert.match(runtime.renderResult(forced), /= 17 against DC 12\. Success\./);
  assert.deepEqual(forced.state.openedDoorIds, ["warped-hatch"]);
});

test("a door's failure by 5 or more hurts and leaves it shut", () => {
  const { state, events } = accepted(
    begun,
    { type: "force", doorId: "warped-hatch" },
    dice([20, 1], [4, 3]),
  );
  assert.deepEqual(types(events), ["check", "door", "outcome", "check-damage"]);
  assert.equal(state.character.hp, 9);
  assert.deepEqual(state.openedDoorIds, []);
});

test("the AI DM's examine returns the band and its effects, and nothing else", () => {
  const result = runtime.dispatchGameTool(
    begun,
    { name: "examine", argumentsJson: '{"target":"rubble-heap"}' },
    dice([20, 10]),
  );
  assert.equal(result.modelOutput.ok, true);
  assert.equal(result.modelOutput.events[0].band, "success");
  assert.deepEqual(result.modelOutput.events[2], {
    type: "revealed",
    itemId: "silver-ring",
    name: "Silver Ring",
  });
  // A call that claims a band or an effect of its own is refused unrolled.
  for (const argumentsJson of [
    '{"target":"rubble-heap","band":"success-by-5"}',
    '{"target":"rubble-heap","effect":{"type":"item","item":"silver-ring"}}',
  ]) {
    const random = dice();
    const claimed = runtime.dispatchGameTool(
      begun,
      { name: "examine", argumentsJson },
      random,
    );
    assert.equal(claimed.modelOutput.ok, false);
    assert.equal(claimed.modelOutput.error.code, "invalid-arguments");
    assert.equal(claimed.state, begun);
    assert.equal(random.drawn.length, 0);
  }
});

/** A scripted AI DM that examines the rubble heap, then says nothing more. */
const examiningDm = () => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? {
          toolCalls: [
            {
              id: "examine-1",
              name: "examine",
              argumentsJson: '{"target":"rubble-heap"}',
            },
          ],
        }
      : { text: "Unreachable: the engine narrates the check." };
  },
});

test("scripted DM: each band's card is the engine's, on the seeded stream", async () => {
  const wanted = {
    "failure-by-5":
      /Failure by 5 or more\.\n.*\nThe heap shifts[\s\S]*The Rubble Heap deals/,
    failure: /Failure\.\n.*\nYou shift stone after stone/,
    success: /Success\.\n.*\nYou find the Silver Ring\.$/,
    "success-by-5":
      /Success by 5 or more\.\n.*\nYou clear the heap[\s\S]*Pinned under a beam/,
  };
  const seen = new Set();
  for (let seed = 0; seen.size < 4 && seed < 200; seed++) {
    const session = FifthSession.begin(seed, gradedCellar, TEST_FIGHTER);
    const { entry } = await session.converse(
      "Dig through the rubble.",
      examiningDm(),
    );
    const { band } = session.state.checks[0];
    if (seen.has(band)) {
      continue;
    }
    seen.add(band);
    assert.equal(entry.cards.length, 1);
    assert.match(entry.cards[0].text, wanted[band]);
    assert.equal(entry.reply, entry.cards[0].text);
  }
  assert.equal(seen.size, 4);
});

test("scripted DM: a take the band didn't reveal is refused", async () => {
  // Seed search: the first seed whose examination fails.
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, gradedCellar, TEST_FIGHTER);
    session.act(EXAMINE, "click");
    if (session.state.checks[0].band.startsWith("success")) {
      continue;
    }
    const before = session.state;
    const { turn } = await session.converse("Take the silver ring.", {
      async respond(request) {
        return request.toolResults.length === 0
          ? {
              toolCalls: [
                {
                  id: "take-1",
                  name: "take",
                  argumentsJson: '{"item":"silver-ring"}',
                },
              ],
            }
          : { text: "There is no ring to take." };
      },
    });
    assert.equal(session.state, before);
    assert.equal(turn.toolAttempts.length, 1);
    return;
  }
  assert.fail("no seed fails the examination");
});

/** Validates `change`d graded cellar JSON, expecting a problem. */
function rejects(change, problem) {
  const module = moduleFile("graded-cellar");
  change(module);
  assert.throws(() => validateFifthAdventure(module, BESTIARY), problem);
}
const heap = (module) =>
  room(module, "cellar-steps").features.find(({ id }) => id === "rubble-heap");

test("the validator rejects effects naming what is not there", () => {
  rejects(
    (m) =>
      (heap(m).check.bands.success.effects[0] = {
        type: "item",
        item: "gold-cup",
      }),
    /feature rubble-heap check's success band names unknown item gold-cup\./,
  );
  rejects(
    (m) =>
      (heap(m).check.bands.success.effects[0] = {
        type: "discovery",
        feature: "secret-door",
      }),
    /names unknown discovery secret-door\./,
  );
  rejects((m) => {
    delete room(m, "cellar-steps").features[1].discovery;
  }, /topic the-cask check's success-by-5 band names cracked-cask's discovery, but it has no discovery\./);
  rejects((m) => {
    delete room(m, "cellar-steps").items[0].hiddenIn;
    room(m, "cellar-steps").items[0].kind = "key";
    delete room(m, "cellar-steps").items[0].treasure;
  }, /reveals silver-ring, which is not hidden in a feature\./);
  rejects(
    (m) =>
      (heap(m).check.bands["failure-by-5"].effects[0].defeatEndingId =
        "out-empty-handed"),
    /names out-empty-handed, which is not a defeat ending\./,
  );
  rejects(
    (m) => (heap(m).check.bands.success.effects[0].type = "gold"),
    /effect 1 type must be discovery, item, damage\./,
  );
});

test("the validator rejects a band its DC puts out of reach", () => {
  // Level 1, Perception: a natural 20 + 5 + 2 is 27 at most.
  rejects(
    (m) => (heap(m).check.dc = 23),
    /feature rubble-heap check's success-by-5 band can't be reached with DC 23: it needs a total of 28, and a character of level 1 totals -3 to 27\./,
  );
});

test("the validator rejects an item no band can reveal", () => {
  rejects((m) => {
    delete heap(m).check.bands.success;
    heap(m).check.bands["success-by-5"].effects.shift();
  }, /silver-ring is hidden in rubble-heap, which has a check, but no check's item effect reveals it\./);
  rejects(
    (m) => (heap(m).check.bands = {}),
    /bands must author at least one band\./,
  );
});

test("a module in the format before graded checks is refused", () => {
  const module = moduleFile("graded-cellar");
  module.formatVersion = FIFTH_ADVENTURE_FORMAT - 1;
  assert.throws(
    () => validateFifthAdventure(module, BESTIARY),
    new RegExp(`format version 18 is not ${FIFTH_ADVENTURE_FORMAT}`),
  );
});
