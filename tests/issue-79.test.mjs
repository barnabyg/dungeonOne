import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";

function game(file) {
  const loaded = loadAdventure(
    readFileSync(
      new URL(`../adventures/${file}.json`, import.meta.url),
      "utf8",
    ),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

function command(runtime, state, text) {
  const result = runtime.handleAction(state, runtime.parseCommand(text), {
    roll: () => 20,
  });
  assert.equal(result.rejection, undefined, runtime.renderResult(result));
  return result.state;
}

const cases = [
  {
    name: "barricade",
    file: "bribed-crossroads",
    setup: (runtime) =>
      command(runtime, runtime.createSession(), "move square"),
    call: {
      name: "adjudicate",
      argumentsJson:
        '{"profileId":"cart-short-passage","targetId":"square-hall","resourceId":"market-cart","approach":"brace"}',
    },
    phrasings: [
      "Wedge the market cart across the short passage.",
      "Bar the short passage with the market cart.",
    ],
  },
  {
    name: "distraction",
    file: "bribed-crossroads",
    setup: (runtime) =>
      command(runtime, runtime.createSession(), "move cellar"),
    call: {
      name: "distract",
      argumentsJson: '{"profileId":"crate-guard-door"}',
    },
    phrasings: [
      "Rattle the heavy crate to draw the guard away.",
      "Make noise with the heavy crate to distract the guard.",
    ],
  },
  {
    name: "deception",
    file: "bribed-crossroads",
    setup: (runtime) => runtime.createSession(),
    call: {
      name: "deceive",
      argumentsJson: '{"profileId":"lysa-neri-safe"}',
    },
    phrasings: [
      "Tell Lysa Neri escaped.",
      "Mislead Lysa: Neri reached the safe route.",
    ],
  },
  {
    name: "offer",
    file: "bribed-crossroads",
    setup: (runtime) => {
      const cellar = command(runtime, runtime.createSession(), "move cellar");
      return command(runtime, cellar, "take tonic");
    },
    call: { name: "offer", argumentsJson: '{"profileId":"guard-tonic"}' },
    phrasings: [
      "Present the tonic to the guard.",
      "Trade my restorative tonic to the cellar guard.",
    ],
  },
  {
    name: "follow",
    file: "day-raider-crossroads",
    setup: (runtime) => {
      const square = command(runtime, runtime.createSession(), "move square");
      const cellar = command(runtime, square, "move cellar");
      return command(runtime, cellar, "wait days 1");
    },
    call: { name: "follow", argumentsJson: '{"npcId":"guard"}' },
    phrasings: ["Trail the guard.", "I will pursue the cellar guard."],
  },
];

for (const sample of cases) {
  test(`${sample.name} scripted DM commits one mutation with exact runtime identity`, async () => {
    const runtime = game(sample.file);
    const initial = sample.setup(runtime);
    let requests = 0;
    const turn = await runDmTurn({
      runtime,
      state: initial,
      playerInput: sample.phrasings[0],
      transcript: [],
      random: { roll: () => 20 },
      model: {
        identity: { provider: "scripted", model: "issue-79" },
        respond: async (request) => {
          requests += 1;
          assert.equal(request.promptVersion, runtime.promptVersion);
          assert.ok(
            request.tools.some(({ name }) => name === sample.call.name) ||
              requests > 1,
          );
          return requests === 1
            ? { toolCalls: [{ id: sample.name, ...sample.call }] }
            : { text: "The authoritative result is shown in Mechanics." };
        },
      },
    });
    assert.equal(turn.toolAttempts.length, 1);
    assert.equal(turn.toolResults.length, 1);
    assert.equal(turn.toolResults[0].result.modelOutput.ok, true);
    assert.notDeepEqual(turn.state, initial);
    assert.deepEqual(turn.diagnostics, []);
    assert.match(runtime.promptVersion, /^chapel-clues-dm-v\d+$/u);
    assert.match(runtime.toolSchemaVersion, /^chapel-clues-tools-v\d+$/u);
  });

  test(`${sample.name} accepts varied clear AI requests through the offered tool`, () => {
    const runtime = game(sample.file);
    const initial = sample.setup(runtime);
    assert.ok(
      runtime
        .getGameToolDefinitions(initial)
        .some((tool) => tool.name === sample.call.name),
    );
    for (const phrase of sample.phrasings) {
      const result = runtime.dispatchGameTool(
        initial,
        sample.call,
        { roll: () => 20 },
        phrase,
      );
      assert.equal(result.modelOutput.ok, true, phrase);
      assert.notDeepEqual(result.state, initial);
    }
  });

  test(`${sample.name} rejects compound, uncertain, and destructive requests`, () => {
    const runtime = game(sample.file);
    const initial = sample.setup(runtime);
    for (const phrase of [
      `${sample.phrasings[0]} Then burn the hall.`,
      `Maybe ${sample.phrasings[0]}`,
      `Can I ${sample.phrasings[0]}`,
    ]) {
      let draws = 0;
      const result = runtime.dispatchGameTool(
        initial,
        sample.call,
        {
          roll: () => {
            draws += 1;
            return 20;
          },
        },
        phrase,
      );
      assert.equal(result.modelOutput.ok, false, phrase);
      assert.deepEqual(result.state, initial, phrase);
      assert.equal(draws, 0, phrase);
    }
  });
}

test("unoffered physical target and hidden actor cannot be selected by the DM", () => {
  const runtime = game("bribed-crossroads");
  const initial = runtime.createSession();
  for (const call of [
    { name: "adjudicate", argumentsJson: cases[0].call.argumentsJson },
    { name: "offer", argumentsJson: '{"profileId":"guard-tonic"}' },
    { name: "follow", argumentsJson: '{"npcId":"guard"}' },
  ]) {
    const result = runtime.dispatchGameTool(
      initial,
      call,
      { roll: () => 20 },
      "Do it.",
    );
    assert.equal(result.modelOutput.ok, false);
    assert.deepEqual(result.state, initial);
  }
});

test("provider failure after a committed check repeats its exact mechanics and a next action", async () => {
  const runtime = game("bribed-crossroads");
  const state = command(runtime, runtime.createSession(), "move cellar");
  let responses = 0;
  const result = await runDmTurn({
    runtime,
    state,
    playerInput: "Rattle the heavy crate to draw the guard away.",
    transcript: [],
    random: { roll: () => 20 },
    model: {
      identity: { provider: "scripted", model: "issue-79" },
      respond: async () => {
        responses += 1;
        if (responses === 1) {
          return {
            toolCalls: [
              {
                id: "distraction",
                name: "distract",
                argumentsJson: '{"profileId":"crate-guard-door"}',
              },
            ],
          };
        }
        throw new Error("provider unavailable");
      },
    },
  });
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].result.modelOutput.ok, true);
  assert.match(result.narration, /d20 20.*DC 12.*success/u);
  assert.match(result.narration, /Time cost: 1 day/u);
  assert.match(result.narration, /Next:/u);
  assert.equal(result.diagnostics[0].code, "model-failure");
});
