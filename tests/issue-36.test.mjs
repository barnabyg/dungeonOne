import assert from "node:assert/strict";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import { createSeededRandom } from "../dist/random.js";
import { resolveAdventure } from "../dist/runtime.js";

function dispatch(runtime, state, random, name, argumentsValue) {
  const result = runtime.dispatchGameTool(
    state,
    {
      id: `setup-${name}`,
      name,
      argumentsJson: JSON.stringify(argumentsValue),
    },
    random,
  );
  assert.equal(result.modelOutput.ok, true, `${name} setup must succeed`);
  return result.state;
}

function rescuedTaviState(runtime) {
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  for (const [name, argumentsValue] of [
    ["move", { destinationId: "chapel-path" }],
    ["move", { destinationId: "ruined-chapel" }],
    ["move", { destinationId: "crypt" }],
    ["attack", { combatantId: "skeleton-guardian" }],
    ["attack", { combatantId: "skeleton-guardian" }],
    ["attack", { combatantId: "skeleton-guardian" }],
    ["search", { target: "diversion-ledger" }],
    ["talk", { speakerId: "tavi", topicId: "crypt", approach: "ask" }],
    ["talk", { speakerId: "tavi", topicId: "rescue", approach: "ask" }],
  ]) {
    state = dispatch(runtime, state, random, name, argumentsValue);
  }
  return { state, random };
}

test("post-rescue movement uses authored narration grounded in Tavi's location", async () => {
  const runtime = resolveAdventure("chapel");
  const setup = rescuedTaviState(runtime);
  let responses = 0;
  const result = await runDmTurn({
    state: setup.state,
    runtime,
    playerInput: "Return to the ruined chapel.",
    transcript: [
      { role: "dungeon-master", text: "Tavi remains in the crypt." },
    ],
    random: setup.random,
    model: {
      async respond() {
        responses += 1;
        return responses === 1
          ? {
              toolCalls: [
                {
                  id: "leave-crypt",
                  name: "move",
                  argumentsJson: '{"destinationId":"ruined-chapel"}',
                },
              ],
            }
          : { text: "Tavi remains in the crypt." };
      },
    },
  });

  assert.equal(responses, 1);
  assert.match(result.narration, /Tavi.*safely.*village inn/i);
  assert.doesNotMatch(result.narration, /remains in the crypt/i);
});

test("potion use uses authored narration without contradicting healing", async () => {
  const runtime = resolveAdventure("chapel");
  const random = createSeededRandom(7);
  let state = runtime.createSession();
  for (const [name, argumentsValue] of [
    ["move", { destinationId: "chapel-path" }],
    ["take", { itemId: "healing-potion" }],
    ["move", { destinationId: "ruined-chapel" }],
    ["move", { destinationId: "crypt" }],
  ]) {
    state = dispatch(runtime, state, random, name, argumentsValue);
  }
  assert.equal(state.fighter.hp, 9);

  let responses = 0;
  const result = await runDmTurn({
    state,
    runtime,
    playerInput: "Drink my healing potion now.",
    transcript: [],
    random,
    model: {
      async respond() {
        responses += 1;
        return responses === 1
          ? {
              toolCalls: [
                {
                  id: "drink-potion",
                  name: "use_item",
                  argumentsJson: '{"itemId":"healing-potion"}',
                },
              ],
            }
          : { text: "Your health remains at 15." };
      },
    },
  });

  assert.equal(responses, 1);
  assert.match(result.narration, /restores 6 HP.*15\/20/i);
  assert.doesNotMatch(result.narration, /remains at 15/i);
});
