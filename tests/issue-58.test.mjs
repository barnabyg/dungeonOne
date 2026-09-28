import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { checkGenerationContinuity } from "../dist/generation-continuity.js";
import { proveGenerationRoutes } from "../dist/generation-routes.js";
import { generateAdventure } from "../dist/generation.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createSeededRandom } from "../dist/random.js";

const source = JSON.parse(
  readFileSync(resolve("adventures/generation-example.json"), "utf8"),
);
const fixture = () => ({
  ...structuredClone(source),
  id: "verified-lantern-route",
});
const cli = resolve("dist/cli.js");
const completed = (output_text) => ({ status: "completed", output_text });
const temporary = async (run) => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-one-issue-58-"));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const launch = (args, input = "", env = {}) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const command = (step, document) => {
  const args = JSON.parse(step.action.argumentsJson);
  switch (step.action.name) {
    case "move":
      return `move ${args.destinationId}`;
    case "search":
      return `search ${args.target}`;
    case "attack":
      return `attack ${args.opponent_id}`;
    case "talk":
      return `talk ${args.speakerId} ${args.topicId} ${args.approach}`;
    case "take":
      return `take ${args.item_id}`;
    case "use_item":
      return `use ${args.item_id}`;
    case "resolve_quest":
      return `resolve ${document.endings.choices.find((choice) => choice.id === args.resolutionId).label}`;
    default:
      throw new Error(`Unexpected route action ${step.action.name}`);
  }
};

test("a generated artifact completes both command and scripted journeys, with source-free format-4 replay", async () =>
  temporary(async (directory) => {
    const document = fixture();
    const outputPath = join(directory, "generated.json");
    const result = await generateAdventure({
      premise: "A lost record",
      outputPath,
      model: "fixture-model",
      apiKey: "fixture-key",
      client: {
        responses: {
          async create() {
            return completed(JSON.stringify(document));
          },
        },
      },
    });
    assert.equal(result.attempts, 1);
    assert.equal(
      result.digest,
      loadAdventure(readFileSync(outputPath, "utf8")).adventure.digest,
    );
    for (const [ending, witness] of Object.entries(result.routes.endings)) {
      const commands = witness.steps.map((step) => command(step, document));
      const commandTrace = join(directory, `${ending}-command.json`);
      const commandOutput = launch(
        [
          "--adventure-file",
          outputPath,
          "--seed",
          String(witness.seed),
          "--trace",
          commandTrace,
        ],
        `${["look", ...commands, "search notice", "status", "journal", "quit"].join("\n")}\n`,
      );
      assert.match(commandOutput, new RegExp(`Resolution: ${ending}`, "u"));
      const exported = JSON.parse(readFileSync(commandTrace, "utf8"));
      assert.equal(exported.formatVersion, 4);
      assert.equal(exported.completion.outcome, "victory");
      assert.equal(exported.adventureSnapshot.id, document.id);
      const terminalAttempt = exported.actions.find(
        (action) => action.rawInput === "search notice",
      );
      assert.equal(terminalAttempt.result.type, "rejected");
      assert.equal(terminalAttempt.stateAfter.ending.id, ending);

      const scriptPath = join(directory, `${ending}.script.json`);
      writeFileSync(
        scriptPath,
        JSON.stringify(
          witness.steps.flatMap((step, index) => [
            {
              toolCalls: [
                {
                  id: `call-${index}`,
                  name: step.action.name,
                  argumentsJson: step.action.argumentsJson,
                },
              ],
            },
            { text: "The authoritative result is shown in Mechanics." },
          ]),
        ),
      );
      const aiTrace = join(directory, `${ending}-ai.json`);
      const aiInput =
        witness.steps
          .map((step) => command(step, document))
          .concat("status", "journal", "quit")
          .join("\n") + "\n";
      launch(
        [
          "--adventure-file",
          outputPath,
          "--ai",
          "--seed",
          String(witness.seed),
          "--trace",
          aiTrace,
        ],
        aiInput,
        { DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      );
      const ai = JSON.parse(readFileSync(aiTrace, "utf8"));
      assert.equal(ai.formatVersion, 4);
      assert.equal(ai.completion.outcome, "victory");
      assert.ok(ai.turns.some((turn) => turn.stateAfter.ending?.id === ending));
    }
    rmSync(outputPath);
    for (const ending of Object.keys(result.routes.endings)) {
      for (const mode of ["command", "ai"]) {
        assert.match(
          launch(["--replay", join(directory, `${ending}-${mode}.json`)]),
          /verified successfully/u,
        );
      }
    }
    for (const legacy of [
      "historical-victory.json",
      "historical-ai-victory.json",
      "historical-chapel-confidential.json",
    ]) {
      assert.match(
        launch(["--replay", resolve("tests/fixtures", legacy)]),
        /verified successfully/u,
      );
    }
  }));

test("witnesses expose only reachable controls and terminal choices", () => {
  const loaded = loadAdventure(JSON.stringify(fixture()));
  assert.equal(loaded.ok, true);
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  assert.deepEqual(
    checkGenerationContinuity(loaded.adventure, routes.evidence),
    [],
  );
  assert.ok(
    Object.values(routes.evidence.warnings).some((witness) =>
      witness.steps.some((step) => step.action.name === "attack"),
    ),
    "optional garden combat must be exercised by a warning witness",
  );
});

test("the optional garden encounter completes a command and scripted ending", () =>
  temporary(async (directory) => {
    const document = fixture();
    const file = join(directory, "optional.json");
    writeFileSync(file, JSON.stringify(document));
    const calls = [
      ["move", { destinationId: "garden" }],
      ["attack", { opponent_id: "garden-moth" }],
      ["search", { target: "plaque" }],
      ["move", { destinationId: "square" }],
      ["move", { destinationId: "archive" }],
      ["search", { target: "record" }],
      ["move", { destinationId: "square" }],
      ["resolve_quest", { resolutionId: "public-notice" }],
    ];
    const commands = calls.map(([name, args]) =>
      command(
        { action: { name, argumentsJson: JSON.stringify(args) } },
        document,
      ),
    );
    const commandTrace = join(directory, "optional-command.json");
    launch(
      ["--adventure-file", file, "--seed", "0", "--trace", commandTrace],
      `${commands.join("\n")}\nquit\n`,
    );
    const commandExport = JSON.parse(readFileSync(commandTrace, "utf8"));
    assert.equal(commandExport.completion.outcome, "victory");
    assert.ok(
      commandExport.actions.some((action) => action.action.type === "attack"),
    );
    const script = join(directory, "optional.script.json");
    writeFileSync(
      script,
      JSON.stringify(
        calls.flatMap(([name, args], index) => [
          {
            toolCalls: [
              {
                id: `optional-${index}`,
                name,
                argumentsJson: JSON.stringify(args),
              },
            ],
          },
          { text: "The authoritative result is shown in Mechanics." },
        ]),
      ),
    );
    const aiTrace = join(directory, "optional-ai.json");
    launch(
      ["--adventure-file", file, "--ai", "--seed", "0", "--trace", aiTrace],
      `${commands.join("\n")}\nquit\n`,
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    const aiExport = JSON.parse(readFileSync(aiTrace, "utf8"));
    assert.equal(aiExport.completion.outcome, "victory");
    assert.ok(
      aiExport.turns.some((turn) =>
        turn.calls.some((call) => call.name === "attack"),
      ),
    );
    rmSync(file);
    assert.match(launch(["--replay", commandTrace]), /verified successfully/u);
    assert.match(launch(["--replay", aiTrace]), /verified successfully/u);
  }));

test("a committed scripted action survives provider failure and local reads", () =>
  temporary(async (directory) => {
    const file = join(directory, "generated.json");
    writeFileSync(file, JSON.stringify(fixture()));
    const script = join(directory, "one-call.json");
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "move-once",
              name: "move",
              argumentsJson: '{"destinationId":"archive"}',
            },
          ],
        },
      ]),
    );
    const tracePath = join(directory, "failure.json");
    launch(
      ["--adventure-file", file, "--ai", "--seed", "0", "--trace", tracePath],
      "Move to the archive\nstatus\njournal\nquit\n",
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    const committed = trace.turns[0];
    assert.equal(committed.calls.length, 1);
    assert.equal(committed.calls[0].disposition.executed, true);
    assert.equal(committed.diagnostics.at(-1).code, "model-failure");
    assert.equal(committed.stateAfter.locationId, "archive");
    assert.equal(trace.turns[1].kind, "local-status");
    assert.equal(trace.turns[2].kind, "local-journal");
    assert.deepEqual(trace.turns[2].stateAfter, committed.stateAfter);
    rmSync(file);
    assert.match(launch(["--replay", tracePath]), /verified successfully/u);
  }));

test("hidden scripted action is rejected without changing the generated session", () =>
  temporary(async (directory) => {
    const file = join(directory, "generated.json");
    writeFileSync(file, JSON.stringify(fixture()));
    const script = join(directory, "hidden.json");
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "hidden",
              name: "search",
              argumentsJson: '{"target":"record"}',
            },
          ],
        },
      ]),
    );
    const tracePath = join(directory, "hidden-trace.json");
    launch(
      ["--adventure-file", file, "--ai", "--seed", "0", "--trace", tracePath],
      "Search the record\nstatus\nquit\n",
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns[0].calls[0].result.modelOutput.ok, false);
    assert.deepEqual(trace.turns[0].stateAfter, trace.initialState);
    assert.deepEqual(trace.turns[1].stateAfter, trace.initialState);
  }));

test("completed ending text cannot be presented as an initial public fact", () => {
  const document = fixture();
  document.locations[0].description = "The public notice is posted.";
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true);
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  assert.ok(
    checkGenerationContinuity(loaded.adventure, routes.evidence).some(
      (entry) => entry.code === "premature-ending-claim",
    ),
  );
});

test("a paraphrased completed promise cannot appear before its ending", () => {
  const document = fixture();
  document.locations[0].description =
    "The private report has already been sent.";
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true);
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  assert.ok(
    checkGenerationContinuity(loaded.adventure, routes.evidence).some(
      (entry) => entry.code === "premature-ending-claim",
    ),
  );
});

test("a truthful future possibility remains valid before an ending", () => {
  const document = fixture();
  document.locations[0].description = "The signal can be restored.";
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true);
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  assert.deepEqual(
    checkGenerationContinuity(loaded.adventure, routes.evidence),
    [],
  );
});

test("generated public prose cannot advertise an unsupported mechanic", () => {
  const document = fixture();
  document.locations[0].description = "Spend a spell slot to open the archive.";
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true);
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  assert.ok(
    checkGenerationContinuity(loaded.adventure, routes.evidence).some(
      (entry) => entry.code === "unsupported-mechanic-claim",
    ),
  );
});

test("a mandatory encounter and an authored healing item retain state and action continuity", () => {
  const document = fixture();
  document.player.hp = 10;
  document.endings.when.push({ type: "discovery-known", id: "plaque-clue" });
  document.items = [
    {
      id: "tonic",
      name: "healing tonic",
      description: "Restores health.",
      aliases: ["tonic"],
      locationId: "square",
      featureId: "notice",
      healing: { dice: 1, sides: 4, modifier: 1, target: "fighter" },
    },
  ];
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true, JSON.stringify(routes.diagnostics));
  assert.ok(
    Object.values(routes.evidence.endings).every((witness) =>
      witness.steps.some((step) => step.action.name === "attack"),
    ),
  );
  assert.deepEqual(
    checkGenerationContinuity(loaded.adventure, routes.evidence),
    [],
  );
  const runtime = createDataRuntime(loaded.adventure);
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  const take = runtime.dispatchGameTool(
    state,
    { name: "take", argumentsJson: '{"item_id":"tonic"}' },
    random,
  );
  assert.equal(take.modelOutput.ok, true);
  state = take.state;
  assert.deepEqual(
    runtime
      .projectCharacterStatus(state)
      .collectedItems.map((entry) => entry.id),
    ["tonic"],
  );
  const use = runtime.dispatchGameTool(
    state,
    { name: "use_item", argumentsJson: '{"item_id":"tonic"}' },
    random,
  );
  assert.equal(use.modelOutput.ok, true);
  state = use.state;
  assert.equal(state.items.tonic, "consumed");
  assert.ok(state.fighter.hp > 10);
  assert.deepEqual(runtime.projectCharacterStatus(state).collectedItems, []);
  const repeat = runtime.dispatchGameTool(
    state,
    { name: "use_item", argumentsJson: '{"item_id":"tonic"}' },
    {
      roll() {
        throw new Error("A repeated use consumed a draw.");
      },
    },
  );
  assert.equal(repeat.modelOutput.ok, false);
  assert.deepEqual(repeat.state, state);
});

test("failed social check retains an independent physical evidence route", () => {
  const document = fixture();
  document.socialChallenges = [
    {
      id: "porter-question",
      modifier: 0,
      dc: 20,
      guardedFactIds: [],
      guardedDiscoveryIds: ["porter-clue"],
      guardedMilestoneIds: [],
      evidenceWhen: [{ type: "discovery-known", id: "record-clue" }],
    },
  ];
  document.discoveries.push({
    id: "porter-clue",
    title: "Porter's account",
    classification: "testimony",
    sourceNpcId: "porter",
    summary: "The porter saw the keeper.",
    lead: "Read the record.",
  });
  document.npcs[0].topics = [
    {
      id: "signals",
      name: "Signals",
      aliases: ["signals"],
      when: [],
      challengeId: "porter-question",
      replies: [
        {
          when: [{ type: "discovery-known", id: "record-clue" }],
          outcome: "any",
          approach: "any",
          text: "The record confirms it.",
          attitude: "helpful",
          approvedFactIds: [],
          effects: [{ type: "grant-discovery", id: "porter-clue" }],
        },
        {
          when: [],
          outcome: "success",
          approach: "any",
          text: "The keeper has the record.",
          attitude: "helpful",
          approvedFactIds: [],
          effects: [{ type: "grant-discovery", id: "porter-clue" }],
        },
        {
          when: [],
          outcome: "failure",
          approach: "any",
          text: "Find the record yourself.",
          attitude: "guarded",
          approvedFactIds: [],
          effects: [],
        },
        {
          when: [],
          outcome: "unattempted",
          approach: "ask",
          text: "Ask me plainly.",
          attitude: "guarded",
          approvedFactIds: [],
          effects: [],
        },
        {
          when: [],
          outcome: "any",
          approach: "any",
          text: "Read the record.",
          attitude: "guarded",
          approvedFactIds: [],
          effects: [],
        },
      ],
    },
  ];
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true, JSON.stringify(routes.diagnostics));
  assert.ok(routes.evidence.physicalAfterFailure);
  assert.deepEqual(
    checkGenerationContinuity(loaded.adventure, routes.evidence),
    [],
  );
});
