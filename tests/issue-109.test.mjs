import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  loadAdventure,
  offeredTalkApproaches,
} from "../dist/adventure-loader.js";
import { browserActions } from "../dist/browser-actions.js";
import { createCharacter } from "../dist/character-rules.js";
import {
  CHARACTER_TOOL_VERSION,
  PREVIOUS_CHARACTER_TOOL_VERSION,
} from "../dist/character-runtime.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { createSeededRandom } from "../dist/random.js";
import { verifyTraceFile } from "../dist/replay.js";
import {
  completeSessionTrace,
  createDmSessionTrace,
  recordDmTraceTurn,
} from "../dist/trace.js";

const load = async (file) =>
  loadAdventure(
    await readFile(
      fileURLToPath(new URL(`../adventures/${file}`, import.meta.url)),
    ),
  ).adventure;
const characterRuntime = async () =>
  createDataRuntime(
    await load("hollow-beacon-characters.json"),
    createCharacter("Ada", "balanced"),
  );
const talkTool = (runtime, state) =>
  runtime.getGameToolDefinitions(state).find(({ name }) => name === "talk");

/** The #94 scene: Vey at the tower after the work order and plate search. */
const atVey = (state) => ({
  ...state,
  locationId: "beacon-tower",
  discoveries: [...state.discoveries, "tower-order-known", "altered-setting"],
});

test("the character talk tool names each topic's label and offered approaches", async () => {
  const runtime = await characterRuntime();
  assert.equal(runtime.toolSchemaVersion, CHARACTER_TOOL_VERSION);
  const tool = talkTool(runtime, atVey(runtime.createSession()));
  assert.match(
    tool.description,
    /plate-proof "Present the work order and setting plate" \[ask only\]/,
  );
  assert.match(
    tool.description,
    /stand-down "Ask Vey to stand down" \[ask or persuade\]/,
  );
  assert.match(tool.description, /Never ask the player to choose an approach/);
  assert.deepEqual(tool.parameters.properties.approach.enum, [
    "ask",
    "persuade",
  ]);
  assert.doesNotMatch(tool.description, /deceive|intimidate/);
});

test("every talk click is a call the v2 tool offers, under the clicked label", async () => {
  const runtime = await characterRuntime();
  for (const state of [
    runtime.createSession(),
    atVey(runtime.createSession()),
  ]) {
    const tool = talkTool(runtime, state);
    const { properties } = tool.parameters;
    const clicks = browserActions({ runtime, state }, "revision").filter(
      ({ call }) => call.name === "talk",
    );
    assert.ok(clicks.length > 0);
    for (const click of clicks) {
      const args = JSON.parse(click.call.argumentsJson);
      assert.ok(properties.speakerId.enum.includes(args.speakerId));
      assert.ok(properties.topicId.enum.includes(args.topicId));
      assert.ok(properties.approach.enum.includes(args.approach));
      const label = click.message.match(/"(.+)"/)[1];
      const listed = tool.description.match(
        new RegExp(`${args.topicId} "${label}" \\[([^\\]]+)\\]`),
      );
      assert.ok(listed, `${args.topicId} is listed with its label`);
      assert.match(listed[1], new RegExp(args.approach));
    }
  }
});

test("offered approaches follow topic intent and whether persuasion differs", () => {
  const plain = { challengeId: "none", replies: [{ approach: "any" }] };
  assert.deepEqual(offeredTalkApproaches(plain), ["ask"]);
  assert.deepEqual(
    offeredTalkApproaches({ ...plain, challengeId: "vey-stand-down" }),
    ["ask", "persuade"],
  );
  assert.deepEqual(
    offeredTalkApproaches({ ...plain, replies: [{ approach: "persuade" }] }),
    ["ask", "persuade"],
  );
  assert.deepEqual(
    offeredTalkApproaches({ ...plain, intent: "claim", challengeId: "x" }),
    ["persuade"],
  );
  assert.deepEqual(offeredTalkApproaches({ ...plain, intent: "correction" }), [
    "ask",
  ]);
});

test("released single-slot Hollow Beacon keeps its generic talk tool", async () => {
  const runtime = createDataRuntime(await load("hollow-beacon-finale.json"));
  const tool = talkTool(runtime, runtime.createSession());
  assert.deepEqual(tool.parameters.properties.approach.enum, [
    "ask",
    "persuade",
    "deceive",
    "intimidate",
  ]);
  assert.match(
    tool.description,
    /^Talk to a visible speaker about an offered topic\. Speakers and topics:/,
  );
});

test("the Vey click commits through the bounded talk tool", async () => {
  const runtime = await characterRuntime();
  const state = atVey(runtime.createSession());
  const click = browserActions({ runtime, state }, "revision").find(
    ({ call }) => call.argumentsJson.includes("plate-proof"),
  );
  assert.equal(
    click.message,
    'Ask Vey about "Present the work order and setting plate".',
  );
  const requests = [];
  const responses = [
    { toolCalls: [{ id: "a", ...click.call }] },
    { text: "Vey studies the order and the plate." },
  ];
  const turn = await runDmTurn({
    state,
    playerInput: click.message,
    transcript: [],
    random: createSeededRandom(0),
    runtime,
    model: {
      identity: { provider: "scripted", model: "issue-109" },
      respond: async (request) => {
        requests.push(request);
        return responses.shift();
      },
    },
  });
  // Free text fails the NPC reply-plan guard, so Vey's authored reply is
  // shown; the click itself still commits.
  assert.match(
    requests[0].tools.find(({ name }) => name === "talk").description,
    /"Present the work order and setting plate" \[ask only\]/,
  );
  assert.ok(turn.state.milestones.includes("peaceful-control"));
});

test("character AI traces recorded under the previous tool version still replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-109-"));
  try {
    const runtime = await characterRuntime();
    const identity = { provider: "scripted", model: "issue-109" };
    const initial = runtime.createSession();
    const trace = createDmSessionTrace(0, initial, identity, runtime);
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
      { text: "Iona briefs you." },
    ];
    const input =
      'Ask Captain Iona about "Ask about the beacon and watch leads".';
    const turn = await runDmTurn({
      state: initial,
      playerInput: input,
      transcript: [],
      random: createSeededRandom(0),
      runtime,
      model: { identity, respond: async () => responses.shift() },
    });
    assert.ok(turn.state.conversationHistory.length > 0);
    recordDmTraceTurn(trace, input, turn);
    completeSessionTrace(trace, "eof", turn.state);
    const path = join(directory, "trace.json");
    for (const version of [
      CHARACTER_TOOL_VERSION,
      PREVIOUS_CHARACTER_TOOL_VERSION,
    ]) {
      trace.dm.toolSchemaVersion = version;
      await writeFile(path, JSON.stringify(trace));
      await verifyTraceFile(path);
    }
    trace.dm.toolSchemaVersion = "character-adventure-tools-v0";
    await writeFile(path, JSON.stringify(trace));
    await assert.rejects(verifyTraceFile(path), /tool schema version/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
