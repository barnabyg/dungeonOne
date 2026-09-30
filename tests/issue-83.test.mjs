import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/hollow-beacon-journey.json", import.meta.url),
);

function withDirectory(body) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-83-"));
  try {
    return body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function run(input, args, script) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ...(script === undefined ? {} : { DUNGEON_ONE_TEST_DM_SCRIPT: script }),
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function snapshot(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runtime() {
  const loaded = loadAdventure(readFileSync(adventure));
  assert.equal(loaded.ok, true);
  return createDataRuntime(loaded.adventure);
}

test("a named person's topic menu is copyable and costs no day, roll, or conversation", () =>
  withDirectory((directory) => {
    const menuSave = join(directory, "menu.json");
    const menuTrace = join(directory, "menu-trace.json");
    const menu = run("talk to Captain Iona\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      menuSave,
      "--trace",
      menuTrace,
    ]);
    assert.match(
      menu,
      /Current topics: Ask about the beacon and two leads — talk iona brief ask/,
    );
    assert.match(menu, /Ask how the watch responds — talk iona response ask/);
    assert.doesNotMatch(menu, /talk iona relay-warning ask/);
    const afterMenu = snapshot(menuSave).checkpoint;
    assert.deepEqual(afterMenu.state.conversationHistory, []);
    assert.deepEqual(afterMenu.state.milestones, []);
    assert.equal(afterMenu.state.clocks["caravan-deadline"], 0);
    assert.deepEqual(snapshot(menuTrace).actions[0].rolls, []);

    const directSave = join(directory, "direct.json");
    const suggestedSave = join(directory, "suggested.json");
    run("talk iona brief ask\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      directSave,
    ]);
    const answer = run("talk to Captain Iona\ntalk iona brief ask\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      suggestedSave,
    ]);
    assert.match(answer, /ask Sera what she knows/);
    assert.deepEqual(
      snapshot(suggestedSave).checkpoint,
      snapshot(directSave).checkpoint,
    );
    assert.deepEqual(
      snapshot(suggestedSave).checkpoint.state.conversationHistory,
      [
        {
          speakerId: "iona",
          statements: [
            "The valley beacon is dark at dusk.",
            "A caravan is approaching the ridge fork.",
            "The beacon keeper is missing from the watch post and service gate.",
          ],
        },
      ],
    );
  }));

test("topic menus follow the current scene and a person with no topic says so", () =>
  withDirectory((directory) => {
    const save = join(directory, "route.json");
    const output = run(
      "move refugee-camp\ntalk Sera\ntalk sera keeper-warning ask\nmove watch-yard\ntalk Captain Iona\ntalk to Captain Iona relay-warning ask\ntalk Iona\ntalk iona brief ask\n",
      ["--adventure-file", adventure, "--seed", "0", "--save", save],
    );
    assert.match(
      output,
      /Ask what the keeper said — talk sera keeper-warning ask/,
    );
    assert.match(
      output,
      /Relay a caution to the watch — talk iona relay-warning ask/,
    );
    assert.match(output, /Your caution reached me/);
    assert.deepEqual(
      snapshot(save).checkpoint.state.conversationHistory.map(
        ({ speakerId }) => speakerId,
      ),
      ["sera", "iona", "iona"],
    );
    assert.deepEqual(snapshot(save).checkpoint.state.milestones, [
      "lead-followed",
      "warning-relayed",
    ]);

    const copy = JSON.parse(readFileSync(adventure, "utf8"));
    copy.contentVersion = "83-no-topics";
    copy.npcs.find(({ id }) => id === "iona").topics = [];
    const noTopics = join(directory, "no-topics.json");
    writeFileSync(noTopics, JSON.stringify(copy));
    const quiet = run("talk Captain Iona\n", [
      "--adventure-file",
      noTopics,
      "--seed",
      "0",
    ]);
    assert.match(
      quiet,
      /Captain Iona has nothing relevant to discuss right now/,
    );
    assert.doesNotMatch(quiet, /Iona: The caravan/);
  }));

test("natural AI talk reaches the same bounded reply after a provider failure", async () => {
  const game = runtime();
  const command = game.handleAction(
    game.createSession(),
    game.parseCommand("talk iona brief ask"),
    { roll: () => assert.fail("The opening exchange must not roll") },
  );
  let calls = 0;
  const ai = await runDmTurn({
    state: game.createSession(),
    runtime: game,
    playerInput: "Captain Iona, what is happening with the beacon?",
    transcript: [],
    random: { roll: () => assert.fail("The opening exchange must not roll") },
    model: {
      async respond() {
        calls += 1;
        if (calls === 1) {
          return {
            toolCalls: [
              {
                id: "iona-brief",
                name: "talk",
                argumentsJson: JSON.stringify({
                  speakerId: "iona",
                  topicId: "brief",
                  approach: "ask",
                }),
              },
            ],
          };
        }
        throw new Error("reply provider failed");
      },
    },
  });
  assert.deepEqual(ai.state, command.state);
  assert.equal(ai.diagnostics[0].code, "model-failure");
  assert.match(ai.narration, /ask Sera what she knows/);
  assert.equal(ai.toolAttempts.length, 1);
  assert.deepEqual(ai.toolAttempts[0].rolls, []);
  assert.deepEqual(
    ai.toolAttempts[0].result.modelOutput.conversation.approvedFacts.map(
      ({ id }) => id,
    ),
    ["beacon-dark", "caravan-coming", "keeper-missing"],
  );
});

test("an AI reply failure preserves the opening conversation in a resumable save", () =>
  withDirectory((directory) => {
    const script = join(directory, "script.json");
    const save = join(directory, "save.json");
    const trace = join(directory, "trace.json");
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "iona-brief",
              name: "talk",
              argumentsJson: JSON.stringify({
                speakerId: "iona",
                topicId: "brief",
                approach: "ask",
              }),
            },
          ],
        },
      ]),
    );
    const output = run(
      "Captain Iona, what is happening with the beacon?\n",
      [
        "--adventure-file",
        adventure,
        "--ai",
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        trace,
      ],
      script,
    );
    assert.match(output, /ask Sera what she knows/);
    const saved = snapshot(save);
    assert.equal(saved.checkpoint.state.conversationHistory.length, 1);
    assert.equal(
      saved.checkpoint.state.conversationHistory[0].speakerId,
      "iona",
    );
    assert.equal(saved.checkpoint.state.clocks["caravan-deadline"], 0);
    assert.equal(snapshot(trace).turns[0].diagnostics[0].code, "model-failure");
    const resumed = run("journal\n", ["--resume", save]);
    assert.match(resumed, /Resumed hollow-beacon/);
  }));
