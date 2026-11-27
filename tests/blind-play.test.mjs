// Blind play: a model plays a module as a first-time player, choosing from
// the action bar and keeping a journal. These tests drive the loop with a
// scripted player, so they call no provider. A real blind run is made only
// with `npm run blind-play -- --live`; no test suite makes one.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BLIND_PLAYER_PROMPT,
  renderBlindPlayReport,
  runBlindPlay,
} from "../dist/blind-play-5e.js";
import { createOpenAiStructuredModel } from "../dist/openai-structured-model.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { verifyFifthTraceFile, writeFifthTrace } from "../dist/trace-5e.js";
import { goblinYard } from "./fixtures/modules.mjs";

/**
 * A player that takes, in order, the action each pattern names on the
 * action bar it is shown, with `journal(turn)` as its journal. It records
 * every request it was asked.
 */
function scriptedPlayer(patterns, journal = () => ({})) {
  const requests = [];
  let turn = 0;
  return {
    requests,
    async ask(request) {
      requests.push(request);
      if (request.name === "debrief") {
        return {
          value: {
            goingOn: "A goblin had taken the cellar.",
            ending: "I drove it out.",
            confusing: "",
          },
          usage: { inputTokens: 7, outputTokens: 3 },
        };
      }
      const bar = request.input.slice(request.input.lastIndexOf("Actions:"));
      const match = bar.match(patterns[turn]);
      assert.ok(match, `turn ${turn + 1}: ${patterns[turn]} not on\n${bar}`);
      turn += 1;
      return {
        value: {
          thinks: `thought ${turn}`,
          wants: `want ${turn}`,
          puzzled: "",
          learned: true,
          notes: `notes ${turn}`,
          choice: Number(match[1]),
          ...journal(turn),
        },
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
  };
}

const WATER_BUTT = /(\d+)\. Examine Water Butt/u;
const PURSE = /(\d+)\. Take Lost Purse/u;
const CELLAR = /(\d+)\. Go to Inn Cellar/u;
const ATTACK = /(\d+)\. Attack Goblin Warrior/u;
const TO_THE_END = [WATER_BUTT, PURSE, CELLAR, ATTACK, ATTACK, ATTACK, ATTACK];

const play = (model, options = {}) =>
  runBlindPlay({
    adventure: goblinYard,
    character: TEST_FIGHTER,
    seed: 1,
    model,
    ...options,
  });

test("the player is shown the job, the room and the action bar, and may choose only what is available", async () => {
  const model = scriptedPlayer([WATER_BUTT]);
  await play(model, { maxActions: 1 });
  const [first] = model.requests;
  assert.equal(first.instructions, BLIND_PLAYER_PROMPT);
  assert.equal(first.name, "play");
  for (const shown of [
    "The adventure: The Lone Goblin.",
    "Your job, as you were told it: Drive out the goblin that has taken over the inn's cellar.",
    "Your notes so far:\n(none yet)",
    "The room: A muddy yard behind the inn. Steps lead down to the cellar.",
    "  Water Butt: A barrel of rainwater by the door.",
    "== Inn Yard == Ada HP 12/12 (healthy)",
    "  4. Examine Water Butt",
  ]) {
    assert.ok(first.input.includes(shown), shown);
  }
  // Every action offered at the start is available.
  assert.deepEqual(first.schema.properties.choice.enum, [1, 2, 3, 4, 5]);
  assert.equal(first.schema.additionalProperties, false);
  assert.deepEqual(first.schema.required, [
    "thinks",
    "wants",
    "puzzled",
    "learned",
    "notes",
    "choice",
  ]);
});

test("each step records the choice, the journal and what the game said, and the notes are carried on", async () => {
  const model = scriptedPlayer([WATER_BUTT, PURSE]);
  const report = await play(model, { maxActions: 2 });
  assert.deepEqual(
    report.steps.map(({ number, room, fighting, action, thinks, wants }) => [
      number,
      room,
      fighting,
      action,
      thinks,
      wants,
    ]),
    [
      [1, "Inn Yard", false, "Examine Water Butt", "thought 1", "want 1"],
      [2, "Inn Yard", false, "Take Lost Purse", "thought 2", "want 2"],
    ],
  );
  assert.match(
    report.steps[0].result,
    /Water Butt: A barrel of rainwater by the door\. A purse lies in the mud behind it\.\nYou find the Lost Purse\./u,
  );
  // The second turn shows the notes, the last step and what examining found.
  const second = model.requests[1].input;
  assert.ok(second.includes("Your notes so far:\nnotes 1"));
  assert.ok(second.includes("You chose: Examine Water Butt"));
  assert.ok(second.includes("Examined: A purse lies in the mud behind it."));
  assert.ok(second.includes("  Lost Purse: A purse a drinker dropped"));
  assert.equal(report.notes, "notes 2");
});

test("a run stopped at the action limit says so, and the player is still debriefed", async () => {
  const model = scriptedPlayer([WATER_BUTT, PURSE]);
  const report = await play(model, { maxActions: 2 });
  assert.equal(report.stopped, "action-limit");
  assert.equal(report.ending, undefined);
  const debrief = model.requests.at(-1);
  assert.equal(debrief.name, "debrief");
  assert.ok(
    debrief.input.includes(
      "You were stopped after 2 steps, before the adventure ended.",
    ),
  );
  assert.equal(report.debrief.goingOn, "A goblin had taken the cellar.");
  assert.deepEqual(report.usage, {
    calls: 3,
    inputTokens: 27,
    outputTokens: 13,
  });
});

test("a run played to its ending names the ending, the rooms and a trace that replays", async () => {
  const model = scriptedPlayer(TO_THE_END);
  const report = await play(model);
  assert.equal(report.stopped, "ended");
  assert.deepEqual(report.ending, {
    id: report.ending.id,
    title: "The cellar is clear",
    kind: "victory",
  });
  assert.deepEqual(report.roomsVisited, ["Inn Yard", "Inn Cellar"]);
  assert.equal(report.module.rooms, 2);
  assert.equal(report.steps.at(-1).fighting, true);
  // The dice behind each line are left out: the player sees the outcome.
  assert.doesNotMatch(report.steps.at(-1).result, /d20/u);
  assert.match(model.requests.at(-1).input, /The cellar is clear/u);
  // The run is a trace the engine reproduces exactly.
  const directory = await mkdtemp(join(tmpdir(), "blind-play-"));
  try {
    const path = join(directory, "trace.json");
    await writeFifthTrace(path, report.trace);
    const replayed = await verifyFifthTraceFile(path, [goblinYard]);
    assert.equal(replayed.turns, report.steps.length);
    assert.equal(replayed.state.status, "victory");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a player model that fails stops the run where it was, with what it had journalled", async () => {
  const scripted = scriptedPlayer([WATER_BUTT]);
  let calls = 0;
  const failing = {
    async ask(request) {
      calls += 1;
      if (calls === 2) {
        throw new Error("The provider timed out.");
      }
      return scripted.ask(request);
    },
  };
  const report = await play(failing);
  assert.equal(report.stopped, "model-error");
  assert.equal(report.error, "The provider timed out.");
  assert.equal(report.steps.length, 1);
  assert.equal(report.debrief, undefined);
  assert.match(renderBlindPlayReport(report), /The provider timed out\./u);
});

test("a choice that is not an available action stops the run", async () => {
  const model = scriptedPlayer([WATER_BUTT], () => ({ choice: 99 }));
  const report = await play(model);
  assert.equal(report.stopped, "model-error");
  assert.equal(
    report.error,
    "The player chose 99, which is not an available action.",
  );
  assert.equal(report.steps.length, 0);
});

test("the report leads with what the player made of it, where it was puzzled and what taught it nothing", async () => {
  const model = scriptedPlayer(TO_THE_END, (turn) => ({
    // At its second turn the player is puzzled, and at its third it says
    // its second step, taking the purse, told it nothing new.
    puzzled: turn === 2 ? "The purse was said to be full." : "",
    learned: turn !== 3,
  }));
  const text = renderBlindPlayReport(await play(model));
  const sections = [...text.matchAll(/^## (.+)$/gmu)].map(([, name]) => name);
  assert.deepEqual(sections, [
    "What the player made of it",
    "Where the player was puzzled",
    "Steps that told the player nothing new",
    "The player's notes at the end",
    "The journal",
  ]);
  assert.match(text, /^# Blind play: The Lone Goblin$/mu);
  assert.match(text, /\*\*Player:\*\* a scripted player/u);
  assert.match(text, /\*\*Ending:\*\* The cellar is clear \(victory\)/u);
  assert.match(text, /in 2 of 2 rooms/u);
  assert.match(text, /> A goblin had taken the cellar\./u);
  assert.match(
    text,
    /- \*\*Step 2, Inn Yard\*\* \(before choosing "Take Lost Purse"\): The purse was said to be full\./u,
  );
  assert.match(text, /- \*\*Inn Yard:\*\* 1 of 3 steps/u);
  assert.match(text, /^### 1\. Inn Yard: Examine Water Butt$/mu);
});

// The provider adapter, with a stand-in client.

test("the structured model asks with one strict tool it must call, and reads its answer", async () => {
  const bodies = [];
  const model = createOpenAiStructuredModel({
    apiKey: "unused",
    model: "test-model",
    reasoningEffort: "low",
    client: {
      responses: {
        async create(body) {
          bodies.push(body);
          return {
            output: [
              { type: "reasoning" },
              {
                type: "function_call",
                name: "play",
                call_id: "call-1",
                arguments: '{"choice":2}',
              },
            ],
            usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15 },
          };
        },
      },
    },
  });
  assert.deepEqual(model.identity, { provider: "openai", model: "test-model" });
  const schema = { type: "object", properties: {} };
  const answer = await model.ask({
    instructions: "Play.",
    input: "The room.",
    name: "play",
    description: "Choose.",
    schema,
  });
  assert.deepEqual(answer, {
    value: { choice: 2 },
    usage: { inputTokens: 11, outputTokens: 4 },
  });
  assert.deepEqual(bodies, [
    {
      model: "test-model",
      reasoning: { effort: "low" },
      instructions: "Play.",
      input: [{ role: "user", content: "The room." }],
      tools: [
        {
          type: "function",
          name: "play",
          description: "Choose.",
          strict: true,
          parameters: schema,
        },
      ],
      tool_choice: { type: "function", name: "play" },
      parallel_tool_calls: false,
      store: false,
    },
  ]);
});

test("the structured model refuses an answer with no call or with bad JSON", async () => {
  const answering = (output) =>
    createOpenAiStructuredModel({
      apiKey: "unused",
      model: "test-model",
      client: { responses: { create: async () => ({ output }) } },
    }).ask({
      instructions: "",
      input: "",
      name: "play",
      description: "",
      schema: {},
    });
  await assert.rejects(
    answering([{ type: "message", content: [] }]),
    /The model did not answer with play\./u,
  );
  await assert.rejects(
    answering([{ type: "function_call", name: "play", arguments: "{" }]),
    /The model's play was not JSON\./u,
  );
  await assert.rejects(
    createOpenAiStructuredModel({
      apiKey: "unused",
      model: "test-model",
      client: { responses: { create: async () => ({}) } },
    }).ask({
      instructions: "",
      input: "",
      name: "play",
      description: "",
      schema: {},
    }),
    /The model's response had no output\./u,
  );
});
