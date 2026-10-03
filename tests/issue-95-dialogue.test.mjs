// Round 2 of the issue 95 playtest (docs/acceptance/issue-95-sessions):
// Hollow Beacon v14 people answer in their authored words, and the engine's
// "Try:" hints name Examine in Examine-era releases.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createCharacter } from "../dist/character-rules.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { createSeededRandom } from "../dist/random.js";

const runtimeFor = async (file) =>
  createDataRuntime(
    loadAdventure(
      await readFile(
        fileURLToPath(new URL(`../adventures/${file}`, import.meta.url)),
      ),
    ).adventure,
    createCharacter("Ada", "balanced"),
  );

/** Asks Iona her first topic; returns the narration and provider requests. */
async function askIona(file) {
  const runtime = await runtimeFor(file);
  const requests = [];
  const responses = [
    {
      toolCalls: [
        {
          id: "a",
          name: "talk",
          argumentsJson: JSON.stringify({
            speakerId: "iona",
            topicId: "brief",
            approach: "ask",
          }),
        },
      ],
    },
    {
      text: JSON.stringify({
        delivery: "urgent",
        opening: "please-listen",
        factIds: ["beacon-dark", "keeper-missing", "caravan-coming"],
        closing: "check-carefully",
      }),
    },
  ];
  const turn = await runDmTurn({
    state: runtime.createSession(),
    playerInput: "Captain, what's wrong with the beacon?",
    transcript: [],
    random: createSeededRandom(0),
    runtime,
    model: {
      identity: { provider: "scripted", model: "issue-95" },
      respond: async (request) => {
        requests.push(request);
        return responses.shift();
      },
    },
  });
  return { turn, requests };
}

test("v14: a person answers in their authored words, without a second AI call", async () => {
  const { turn, requests } = await askIona("hollow-beacon-story.json");
  assert.equal(requests.length, 1);
  assert.match(turn.narration, /^Iona: Our beacon went dark at dusk/);
  assert.doesNotMatch(turn.narration, /Please check carefully|\(urgent\)/);
});

test("v13 keeps composing replies from approved facts", async () => {
  const { turn, requests } = await askIona("hollow-beacon-examine.json");
  assert.equal(requests.length, 2);
  assert.match(turn.narration, /Captain Iona \(urgent\): Please, listen\./);
});

test("Examine-era rejection hints suggest examine, not search or inspect", async () => {
  for (const file of [
    "hollow-beacon-examine.json",
    "hollow-beacon-story.json",
  ]) {
    const runtime = await runtimeFor(file);
    const random = createSeededRandom(0);
    let state = runtime.createSession();
    state = runtime.handleAction(
      state,
      runtime.parseCommand("move refugee-camp"),
      random,
    ).state;
    const rejected = runtime.handleAction(
      state,
      runtime.parseCommand("take lantern"),
      random,
    );
    const text = runtime.renderResult(rejected);
    assert.match(text, /Try: examine camp-survey;/, file);
    assert.doesNotMatch(text, /\b(search|inspect) [a-z-]+/, file);
  }
});
