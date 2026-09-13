import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import {
  resolveAdventure,
  resolveHistoricalAdventure,
} from "../dist/runtime.js";

test("Mara's public account records attributed testimony and belief once", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  const action = runtime.parseCommand("talk mara tavi ask");
  const first = runtime.handleAction(initial, action, {
    roll() {
      assert.fail("An ordinary authorized question must not roll");
    },
  });

  assert.equal(first.rejection, undefined);
  assert.deepEqual(
    first.state.discoveries.map(({ id, classification, source }) => ({
      id,
      classification,
      source,
    })),
    [
      {
        id: "tavi-disappearance-testimony",
        classification: "testimony",
        source: {
          type: "npc",
          id: "mara",
          name: "Mara",
          locationId: "inn",
        },
      },
      {
        id: "mara-ferry-belief",
        classification: "belief",
        source: {
          type: "npc",
          id: "mara",
          name: "Mara",
          locationId: "inn",
        },
      },
    ],
  );
  assert.match(runtime.renderResult(first), /^Mara:/m);
  assert.match(runtime.renderResult(first), /ferry/i);

  const repeated = runtime.handleAction(first.state, action, {
    roll() {
      assert.fail("Repeating released information must not roll");
    },
  });
  assert.equal(repeated.rejection, undefined);
  assert.deepEqual(repeated.state.discoveries, first.state.discoveries);
  assert.equal(repeated.events[0].type, "chapel-conversation");
});

test("talk validates a visible living speaker, public topic, approach, and exact shape", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  const scene = runtime.projectDmScene(initial);
  assert.deepEqual(scene.room.npcs, [
    {
      id: "mara",
      name: "Mara",
      subjects: [{ id: "tavi", name: "Tavi's disappearance" }],
    },
  ]);
  const talk = runtime
    .getGameToolDefinitions(initial)
    .find(({ name }) => name === "talk");
  assert.ok(talk);
  assert.match(JSON.stringify(talk), /Mara/);
  assert.match(JSON.stringify(talk), /tavi/);

  for (const call of [
    {
      name: "talk",
      argumentsJson: '{"speakerId":"oren","topicId":"tavi","approach":"ask"}',
    },
    {
      name: "talk",
      argumentsJson:
        '{"speakerId":"mara","topicId":"private-motive","approach":"ask"}',
    },
    {
      name: "talk",
      argumentsJson: '{"speakerId":"mara","topicId":"tavi","approach":"bribe"}',
    },
    {
      name: "talk",
      argumentsJson:
        '{"speakerId":"mara","topicId":"tavi","approach":"ask","result":"success"}',
    },
  ]) {
    const rejected = runtime.dispatchGameTool(initial, call, {
      roll() {
        assert.fail("Invalid talk attempts must not roll");
      },
    });
    assert.equal(rejected.modelOutput.ok, false);
    assert.equal(rejected.state, initial);
  }

  const deadMara = {
    ...initial,
    npcStates: { ...initial.npcStates, mara: { condition: "dead" } },
  };
  const deadTools = runtime
    .getGameToolDefinitions(deadMara)
    .map(({ name }) => name);
  assert.equal(deadTools.includes("talk"), false);
  const stale = runtime.dispatchGameTool(deadMara, {
    name: "talk",
    argumentsJson: '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
  });
  assert.equal(stale.modelOutput.ok, false);
});

test("AI dialogue uses a fresh speaker-scoped reply request", async () => {
  const runtime = resolveAdventure("chapel");
  const requests = [];
  const result = await runDmTurn({
    state: runtime.createSession(),
    runtime,
    playerInput:
      "Mara, did Tavi vanish because Oren diverted money for medicine and trapped Tavi in the crypt?",
    transcript: [
      { role: "player", text: "Oren told me a private secret." },
      { role: "dungeon-master", text: "A different speaker answered." },
    ],
    random: {
      roll() {
        assert.fail("Mara's public account must not roll");
      },
    },
    model: {
      async respond(request) {
        requests.push(structuredClone(request));
        return requests.length === 1
          ? {
              toolCalls: [
                {
                  id: "talk-mara",
                  name: "talk",
                  argumentsJson:
                    '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
                },
              ],
            }
          : {
              text: JSON.stringify({
                delivery: "urgent",
                opening: "please-listen",
                factIds: ["tavi-disappearance-testimony", "mara-ferry-belief"],
                closing: "help-me-find-them",
              }),
            };
      },
    },
  });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.state.discoveries.length, 2);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].reply.speakerName, "Mara");
  assert.equal(requests[1].playerInput, result.transcript.at(-2).text);
  assert.deepEqual(requests[1].tools, []);
  assert.deepEqual(requests[1].toolResults, []);
  assert.equal("scene" in requests[1], false);
  assert.equal("characterStatus" in requests[1], false);
  assert.doesNotMatch(
    JSON.stringify(requests[1].transcript),
    /different speaker/i,
  );
  assert.doesNotMatch(
    JSON.stringify({
      systemPrompt: requests[1].systemPrompt,
      transcript: requests[1].transcript,
      reply: requests[1].reply,
      tools: requests[1].tools,
      toolResults: requests[1].toolResults,
    }),
    /diverted|medicine|trapped/i,
  );
  assert.match(JSON.stringify(requests[1]), /missing|ferry/i);
  assert.match(result.mechanics[0], /^Mara:/m);
  assert.match(result.narration, /^Mara \(urgent\): Please, listen\./);
  assert.match(result.narration, /Please help me find them\.$/);
});

test("reply failure keeps the committed authored answer and blocks a second mutation", async () => {
  const runtime = resolveAdventure("chapel");
  let calls = 0;
  const result = await runDmTurn({
    state: runtime.createSession(),
    runtime,
    playerInput: "Ask Mara about Tavi, then move to the ferry.",
    transcript: [],
    random: {
      roll() {
        assert.fail("Mara's public account must not roll");
      },
    },
    model: {
      async respond() {
        calls += 1;
        if (calls === 1) {
          return {
            toolCalls: [
              {
                id: "talk-mara",
                name: "talk",
                argumentsJson:
                  '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
              },
            ],
          };
        }
        throw new Error("reply provider failed");
      },
    },
  });

  assert.equal(result.diagnostics[0].code, "model-failure");
  assert.equal(result.diagnostics[0].responseNumber, 2);
  assert.equal(result.toolAttempts.length, 1);
  assert.equal(result.state.locationId, "inn");
  assert.match(result.narration, /^Mara:/);
  assert.match(result.narration, /ferry/i);
  assert.match(result.mechanics[0], /^Mara:/m);
});

test("untrusted NPC prose cannot introduce a private or invented fact", async () => {
  const runtime = resolveAdventure("chapel");
  let response = 0;
  const result = await runDmTurn({
    state: runtime.createSession(),
    runtime,
    playerInput: "Ask Mara about Tavi.",
    transcript: [],
    random: {
      roll() {
        assert.fail("Mara's public account must not roll");
      },
    },
    model: {
      async respond() {
        response += 1;
        return response === 1
          ? {
              toolCalls: [
                {
                  id: "talk-mara",
                  name: "talk",
                  argumentsJson:
                    '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
                },
              ],
            }
          : {
              text: "Mara: Oren diverted repair money and Tavi is trapped in the crypt.",
            };
      },
    },
  });

  assert.equal(result.diagnostics[0].code, "unsafe-npc-reply");
  assert.match(result.narration, /^Mara:/);
  assert.match(result.narration, /only my guess/i);
  assert.doesNotMatch(result.narration, /diverted|money|trapped|crypt/i);
  assert.equal(result.state.discoveries.length, 2);
});

test("authorized Mara history survives general transcript eviction without cross-speaker text", async () => {
  const runtime = resolveAdventure("chapel");
  const talked = runtime.handleAction(
    runtime.createSession(),
    runtime.parseCommand("talk mara tavi ask"),
  );
  const requests = [];
  await runDmTurn({
    state: talked.state,
    runtime,
    playerInput: "Mara, remind me what you said about Tavi.",
    transcript: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "player" : "dungeon-master",
      text: `OTHER_SPEAKER_${index}`,
    })),
    random: {
      roll() {
        assert.fail("Repeating Mara's released account must not roll");
      },
    },
    model: {
      async respond(request) {
        requests.push(structuredClone(request));
        return requests.length === 1
          ? {
              toolCalls: [
                {
                  id: "repeat-mara",
                  name: "talk",
                  argumentsJson:
                    '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
                },
              ],
            }
          : {
              text: JSON.stringify({
                delivery: "steady",
                opening: "thank-you",
                factIds: ["mara-ferry-belief", "tavi-disappearance-testimony"],
                closing: "check-carefully",
              }),
            };
      },
    },
  });

  assert.match(JSON.stringify(requests[1].transcript), /Tavi is missing/);
  assert.doesNotMatch(JSON.stringify(requests[1].transcript), /OTHER_SPEAKER/);
  assert.equal(talked.state.discoveries.length, 2);
});

test("an invalid talk attempt still spends the one-mutation budget", async () => {
  const runtime = resolveAdventure("chapel");
  let response = 0;
  const result = await runDmTurn({
    state: runtime.createSession(),
    runtime,
    playerInput: "Ask Oren from here, then walk to the ferry.",
    transcript: [],
    random: {
      roll() {
        assert.fail("Invalid dialogue must not roll");
      },
    },
    model: {
      async respond() {
        response += 1;
        return response === 1
          ? {
              toolCalls: [
                {
                  id: "remote-oren",
                  name: "talk",
                  argumentsJson:
                    '{"speakerId":"oren","topicId":"tavi","approach":"ask"}',
                },
              ],
            }
          : {
              toolCalls: [
                {
                  id: "move-after-talk",
                  name: "move",
                  argumentsJson: '{"destinationId":"ferry-landing"}',
                },
              ],
            };
      },
    },
  });

  assert.equal(result.state.locationId, "inn");
  assert.equal(
    result.toolResults[0].result.modelOutput.error.code,
    "unavailable-reference",
  );
  assert.equal(result.diagnostics[0].code, "mutation-call-limit");
  assert.equal(result.toolAttempts.length, 2);
});

test("the discovery-era chapel runtime remains available without dialogue state", () => {
  const runtime = resolveHistoricalAdventure(
    "chapel-discovery-rules-v2",
    "chapel-discovery-v2",
    "chapel",
  );
  const state = runtime.createSession();
  assert.equal("npcStates" in state, false);
  assert.equal("conversationHistory" in state, false);
  assert.equal(
    runtime.getGameToolDefinitions(state).some(({ name }) => name === "talk"),
    false,
  );
  assert.deepEqual(runtime.parseCommand("talk mara tavi ask"), {
    type: "unknown",
    input: "talk mara tavi ask",
  });
});

test("offline and scripted-AI conversations are attributed, traced, and replayable", () => {
  const offline = spawnSync(
    process.execPath,
    ["dist/cli.js", "--adventure", "chapel", "--seed", "2"],
    {
      encoding: "utf8",
      input: "look\ntalk mara tavi ask\njournal\nquit\n",
    },
  );
  assert.equal(offline.status, 0, offline.stderr);
  assert.match(
    offline.stdout,
    /Mara \(public subjects: Tavi's disappearance\)/,
  );
  assert.match(offline.stdout, /^Mara:.*ferry/im);
  assert.match(offline.stdout, /Mara's ferry lead \[belief\]/);

  const directory = mkdtempSync(path.join(tmpdir(), "chapel-dialogue-"));
  try {
    const scriptPath = path.join(directory, "script.json");
    const tracePath = path.join(directory, "trace.json");
    writeFileSync(
      scriptPath,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "talk-mara",
              name: "talk",
              argumentsJson:
                '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
            },
          ],
        },
        {
          text: JSON.stringify({
            delivery: "concerned",
            opening: "none",
            factIds: ["tavi-disappearance-testimony", "mara-ferry-belief"],
            closing: "help-me-find-them",
          }),
        },
      ]),
    );
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "2",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input: "Ask Mara what happened to Tavi.\nquit\n",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /^Mara(?: \([^)]+\))?:.*ferry/im);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.adventure.version, "chapel-dialogue-v3");
    assert.equal(trace.turns[0].calls[0].name, "talk");
    assert.equal(trace.turns[0].stateAfter.discoveries.length, 2);
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      {
        encoding: "utf8",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: "" },
      },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
