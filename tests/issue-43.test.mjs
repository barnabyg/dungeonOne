import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/chapel-clues.json";
const document = JSON.parse(readFileSync(source, "utf8"));
const run = (input, args, env = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
const temporary = (work) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-43-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("social check locks by challenge ID, while evidence later overrides without a second draw", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  let state = runtime.createSession(),
    draws = 0;
  const random = {
    roll() {
      draws++;
      return 1;
    },
  };
  const unavailable = runtime.dispatchGameTool(
    state,
    {
      name: "talk",
      argumentsJson:
        '{"speakerId":"oren","topicId":"repairs","approach":"persuade"}',
    },
    random,
  );
  assert.equal(unavailable.modelOutput.ok, false);
  assert.equal(draws, 0);
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ferry landing",
  }).state;
  const first = runtime.dispatchGameTool(
    state,
    {
      name: "talk",
      argumentsJson:
        '{"speakerId":"oren","topicId":"repairs","approach":"persuade"}',
    },
    random,
  );
  assert.equal(draws, 1);
  assert.equal(
    first.state.socialChallenges["guarded-account"].result,
    "failure",
  );
  assert.deepEqual(first.state.discoveries, []);
  assert.deepEqual(
    first.modelOutput.conversation.approvedFacts.map(({ id }) => id),
    ["oren-refusal"],
  );
  const again = runtime.handleAction(
    first.state,
    {
      type: "talk",
      target: "ferryman",
      topic: "chapel repairs",
      approach: "intimidate",
    },
    random,
  );
  assert.equal(draws, 1);
  assert.equal(
    again.state.socialChallenges["guarded-account"].approach,
    "persuade",
  );
  state = runtime.handleAction(again.state, {
    type: "move",
    destination: "inn",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "chapel path",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ruined chapel",
  }).state;
  state = runtime.handleAction(state, {
    type: "search",
    target: "record",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "chapel path",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "inn",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ferry landing",
  }).state;
  const evidence = runtime.handleAction(
    state,
    { type: "talk", target: "oren", topic: "repairs", approach: "ask" },
    random,
  );
  assert.equal(draws, 1);
  assert.deepEqual(evidence.state.discoveries, [
    "unsafe-repairs",
    "oren-admission",
  ]);
  assert.equal(
    evidence.state.socialChallenges["guarded-account"].result,
    "failure",
  );
  assert.deepEqual(evidence.events[0].conversation.speakerHistory, [
    "Oren will not give an account of the repairs without further cause.",
    "Oren will not give an account of the repairs without further cause.",
  ]);
});

test("success releases only authored facts, and another speaker receives no private history", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  let state = runtime.handleAction(runtime.createSession(), {
    type: "talk",
    target: "mara",
    topic: "tavi",
    approach: "ask",
  }).state;
  assert.deepEqual(state.discoveries, ["mara-account"]);
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ferry landing",
  }).state;
  const reply = runtime.handleAction(
    state,
    { type: "talk", target: "oren", topic: "repairs", approach: "deceive" },
    { roll: () => 20 },
  );
  assert.deepEqual(reply.state.discoveries, ["mara-account", "oren-admission"]);
  assert.deepEqual(reply.events[0].conversation.speakerHistory, []);
  assert.deepEqual(
    reply.events[0].conversation.approvedFacts.map(({ id }) => id),
    ["oren-admission-fact", "oren-uncertain"],
  );
  const scene = runtime.projectDmScene(state);
  assert.deepEqual(
    scene.room.npcs.map(({ id }) => id),
    ["oren"],
  );
  assert.ok(!JSON.stringify(scene).includes("medicine purchase"));
});

test("content rejects undisclosed knowledge, wrong sources and missing fallback", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const mutate = (change) => {
    const value = structuredClone(document);
    change(value);
    return loadAdventure(JSON.stringify(value));
  };
  assert.ok(
    mutate((value) =>
      value.npcs[0].topics[0].replies
        .at(-1)
        .approvedFactIds.push("oren-admission-fact"),
    ).diagnostics.some(({ code }) => code === "unapproved-knowledge"),
  );
  assert.ok(
    mutate(
      (value) =>
        (value.npcs[0].topics[0].replies.at(-1).effects[0].id =
          "oren-admission"),
    ).diagnostics.some(({ code }) => code === "invalid-source"),
  );
  assert.ok(
    mutate((value) => value.npcs[1].topics[1].replies.pop()).diagnostics.some(
      ({ code }) => code === "missing-fallback",
    ),
  );
  assert.ok(
    mutate((value) =>
      value.npcs[1].topics[1].replies.unshift(
        value.npcs[1].topics[1].replies.pop(),
      ),
    ).diagnostics.some(({ code }) => code === "missing-fallback"),
  );
  assert.ok(
    mutate((value) =>
      value.npcs[1].topics[1].replies
        .find(({ outcome }) => outcome === "failure")
        .approvedFactIds.push("oren-admission-fact"),
    ).diagnostics.some(({ code }) => code === "guarded-disclosure"),
  );
  assert.ok(
    mutate((value) =>
      value.npcs[1].topics[1].replies
        .find(({ outcome }) => outcome === "failure")
        .effects.push({
          type: "grant-discovery",
          id: "oren-admission",
        }),
    ).diagnostics.some(({ code }) => code === "guarded-disclosure"),
  );
});

test("command and scripted AI conversations export and replay with no provider", () =>
  temporary((directory) => {
    const commandTrace = join(directory, "command.json");
    const command = run(
      "talk mara tavi ask\nmove ferry landing\ntalk oren repairs persuade\ntalk oren repairs intimidate\nmove inn\nmove chapel path\nmove ruined chapel\nsearch record\nmove chapel path\nmove inn\nmove ferry landing\ntalk oren repairs ask\nquit\n",
      ["--adventure-file", source, "--seed", "0", "--trace", commandTrace],
    );
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /Mara: Tavi is missing/);
    assert.match(command.stdout, /Oren: You found the damaged record/);
    const trace = JSON.parse(readFileSync(commandTrace, "utf8"));
    assert.equal(trace.formatVersion, 4);
    assert.equal(
      trace.actions.filter(({ rolls }) => rolls.length > 0).length,
      1,
    );
    assert.equal(run("", ["--replay", commandTrace]).status, 0);

    const script = join(directory, "script.json"),
      aiTrace = join(directory, "ai.json");
    writeFileSync(
      script,
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
        { text: "Mara is worried." },
        {
          toolCalls: [
            {
              id: "bad-speaker",
              name: "talk",
              argumentsJson:
                '{"speakerId":"oren","topicId":"repairs","approach":"persuade"}',
            },
          ],
        },
        { text: "No one here can answer that." },
      ]),
    );
    const ai = run(
      "Ask Mara about Tavi\nAsk Oren here\njournal\nquit\n",
      ["--adventure-file", source, "--ai", "--seed", "2", "--trace", aiTrace],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(ai.status, 0, ai.stderr);
    assert.match(ai.stdout, /Mara: Tavi is missing/);
    assert.match(ai.stdout, /Tool rejected: unavailable-reference/);
    assert.equal(run("", ["--replay", aiTrace]).status, 0);
  }));

test("a reply-provider failure preserves one committed conversation and local recovery", () =>
  temporary((directory) => {
    const script = join(directory, "script.json");
    const tracePath = join(directory, "failure.json");
    writeFileSync(
      script,
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
      ]),
    );
    const played = run(
      "Ask Mara about Tavi\njournal\nquit\n",
      ["--adventure-file", source, "--ai", "--seed", "2", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Mara: Tavi is missing/);
    assert.match(played.stdout, /Mara's account \[testimony/);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.deepEqual(trace.turns[0].stateAfter.discoveries, ["mara-account"]);
    assert.equal(trace.turns[0].diagnostics[0].code, "model-failure");
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("scripted AI success and failure share the retry lock and replay evidence recovery", () =>
  temporary((directory) => {
    const calls = [
      ["move", { destinationId: "ferry-landing" }],
      ["talk", { speakerId: "oren", topicId: "repairs", approach: "persuade" }],
      [
        "talk",
        { speakerId: "oren", topicId: "repairs", approach: "intimidate" },
      ],
      ["move", { destinationId: "inn" }],
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["search", { target: "damaged-repair-record" }],
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "inn" }],
      ["move", { destinationId: "ferry-landing" }],
      ["talk", { speakerId: "oren", topicId: "repairs", approach: "ask" }],
    ];
    const script = join(directory, "script.json");
    writeFileSync(
      script,
      JSON.stringify(
        calls.flatMap(([name, args], index) => [
          {
            toolCalls: [
              {
                id: `action-${index}`,
                name,
                argumentsJson: JSON.stringify(args),
              },
            ],
          },
          { text: "Continue." },
        ]),
      ),
    );
    for (const [seed, expected] of [
      [0, "failure"],
      [1, "success"],
    ]) {
      const tracePath = join(directory, `ai-${seed}.json`);
      const played = run(
        `${calls.map(([name]) => `Do ${name}`).join("\n")}\nquit\n`,
        [
          "--adventure-file",
          source,
          "--ai",
          "--seed",
          String(seed),
          "--trace",
          tracePath,
        ],
        { DUNGEON_ONE_TEST_DM_SCRIPT: script },
      );
      assert.equal(played.status, 0, played.stderr);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(
        trace.turns[1].stateAfter.socialChallenges["guarded-account"].result,
        expected,
      );
      const firstConversation =
        trace.turns[1].calls[0].result.modelOutput.conversation;
      assert.deepEqual(
        firstConversation.approvedFacts.map(({ id }) => id),
        expected === "success"
          ? ["oren-admission-fact", "oren-uncertain"]
          : ["oren-refusal"],
      );
      assert.deepEqual(firstConversation.speakerHistory, []);
      assert.ok(
        !JSON.stringify(firstConversation).includes(
          "Keep the medicine purchase private",
        ),
      );
      assert.equal(
        trace.turns[2].stateAfter.socialChallenges["guarded-account"].approach,
        "persuade",
      );
      const retryConversation =
        trace.turns[2].calls[0].result.modelOutput.conversation;
      assert.deepEqual(
        retryConversation.approvedFacts.map(({ id }) => id),
        expected === "success"
          ? ["oren-admission-fact", "oren-uncertain"]
          : ["oren-refusal"],
      );
      assert.deepEqual(
        retryConversation.speakerHistory,
        firstConversation.approvedFacts.map(({ statement }) => statement),
      );
      if (expected === "failure") {
        assert.ok(
          !JSON.stringify(retryConversation).includes(
            "diverted chapel repair funds",
          ),
        );
      }
      assert.equal(
        trace.turns.flatMap(({ calls }) => calls.flatMap(({ rolls }) => rolls))
          .length,
        1,
      );
      assert.deepEqual(
        trace.turns[10].stateAfter.discoveries.includes("oren-admission"),
        true,
      );
      assert.deepEqual(
        trace.turns[10].calls[0].result.modelOutput.conversation.approvedFacts.map(
          ({ id }) => id,
        ),
        ["oren-admission-fact"],
      );
      assert.match(played.stdout, /Oren: You found the damaged record/);
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));
