import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/tide-observatory.json";
const original = JSON.parse(readFileSync(source, "utf8"));
const route = [
  "move pier",
  "search chart",
  "move vault",
  "attack sentinel",
  "attack sentinel",
  "search log",
  "move tower",
  "move pier",
  "talk keeper signal ask",
  "move vault",
  "move tower",
];
const run = (input, args, extraEnv = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...extraEnv },
  });
const temporary = (check) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-50-"));
  try {
    return check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const play = (file, choice, tracePath, steps = route) =>
  run(
    `${[...steps, `resolve ${choice}`, "status", "journal", "quit"].join("\n")}\n`,
    ["--adventure-file", file, "--seed", "0", "--trace", tracePath],
  );

test("third adventure completes both command endings and replays after its source is removed", () =>
  temporary((directory) => {
    const validation = run("", ["--validate-adventure", source]);
    assert.equal(validation.status, 0, validation.stdout);
    const diagnostics = JSON.parse(validation.stdout).diagnostics;
    assert.deepEqual(
      diagnostics.map(({ severity, code, entity }) => [severity, code, entity]),
      [
        ["warning", "analysis-incomplete", "log-reading"],
        ["warning", "analysis-incomplete", "keeper-testimony"],
        ["warning", "analysis-incomplete", "tide-observatory"],
        ["warning", "analysis-incomplete", "sentinel-cleared"],
        ["warning", "analysis-incomplete", "log-read"],
        ["warning", "analysis-incomplete", "keeper-account"],
      ],
    );
    for (const [choice, alias] of [
      ["public-bulletin", "public bulletin"],
      ["private-report", "private report"],
    ]) {
      const copy = join(directory, `${choice}.json`);
      const tracePath = join(directory, `${choice}.trace.json`);
      writeFileSync(copy, JSON.stringify(original));
      const result = play(copy, alias, tracePath);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Resolution: ${choice}`, "u"));
      assert.doesNotMatch(result.stdout, /Tavi|chapel|potion/u);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.formatVersion, 4);
      assert.equal(
        trace.actions.find(({ stateAfter }) => stateAfter?.ending)?.stateAfter
          .ending.id,
        choice,
      );
      rmSync(copy);
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));

test("scripted AI completes both endings with the new vocabulary", () =>
  temporary((directory) => {
    const calls = [
      ["move", { destinationId: "pier" }],
      ["search", { target: "chart" }],
      ["move", { destinationId: "vault" }],
      ["attack", { opponent_id: "vault-sentinel" }],
      ["attack", { opponent_id: "vault-sentinel" }],
      ["search", { target: "log" }],
      ["move", { destinationId: "tower" }],
      ["move", { destinationId: "pier" }],
      ["talk", { speakerId: "keeper", topicId: "signal", approach: "ask" }],
      ["move", { destinationId: "vault" }],
      ["move", { destinationId: "tower" }],
    ];
    for (const [choice, phrase] of [
      ["public-bulletin", "Please post the tide bulletin"],
      ["private-report", "Please send the tide report"],
    ]) {
      const script = join(directory, `${choice}.script.json`);
      const tracePath = join(directory, `${choice}.trace.json`);
      writeFileSync(
        script,
        JSON.stringify(
          [...calls, ["resolve_quest", { resolutionId: choice }]].flatMap(
            ([name, args], index) => [
              {
                toolCalls: [
                  {
                    id: `call-${index}`,
                    name,
                    argumentsJson: JSON.stringify(args),
                  },
                ],
              },
              { text: "Continue." },
            ],
          ),
        ),
      );
      const result = run(
        `${[...calls.map(() => "Continue"), phrase, "status", "quit"].join("\n")}\n`,
        [
          "--adventure-file",
          source,
          "--ai",
          "--seed",
          "0",
          "--trace",
          tracePath,
        ],
        { DUNGEON_ONE_TEST_DM_SCRIPT: script },
      );
      assert.equal(result.status, 0, result.stderr);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.ok(
        trace.turns.some(({ stateAfter }) => stateAfter?.ending?.id === choice),
      );
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));

test("renamed identities and unordered definitions keep play while authored reply order is protected", () =>
  temporary((directory) => {
    const renamed = structuredClone(original);
    const ids = {
      tower: "beacon",
      pier: "quay",
      vault: "chamber",
      store: "locker",
      chart: "tide-table",
      log: "instrument-book",
      "blue-tonic": "azure-draught",
      "public-bulletin": "harbor-notice",
      "private-report": "sealed-message",
    };
    const rename = (value) => {
      if (typeof value === "string") {
        return ids[value] ?? value;
      }
      if (Array.isArray(value)) {
        return value.map(rename);
      }
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, rename(entry)]),
        );
      }
      return value;
    };
    const variant = rename(renamed);
    variant.id = "renamed-observatory";
    variant.locations.reverse();
    variant.connections.reverse();
    variant.features.reverse();
    variant.discoveries.reverse();
    variant.items[0].aliases = ["draught"];
    variant.endings.choices[0].aliases = ["harbor notice"];
    variant.endings.choices[1].aliases = ["sealed message"];
    const file = join(directory, "renamed adventure.json");
    writeFileSync(file, JSON.stringify(variant));
    assert.equal(run("", ["--validate-adventure", file]).status, 0);
    const steps = [
      "move quay",
      "search tide-table",
      "move chamber",
      "attack sentinel",
      "attack sentinel",
      "search instrument-book",
      "move beacon",
      "move quay",
      "talk keeper signal ask",
      "move chamber",
      "move beacon",
    ];
    const result = play(
      file,
      "sealed message",
      join(directory, "renamed.trace.json"),
      steps,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Resolution: sealed-message/u);
    assert.match(result.stdout, /The log confirms it/u);
    const reordered = structuredClone(variant);
    const replies = reordered.npcs[0].topics[0].replies;
    replies.splice(1, 0, {
      ...structuredClone(replies[0]),
      text: "Keeper: I checked the instrument book twice.",
    });
    [replies[0], replies[1]] = [replies[1], replies[0]];
    writeFileSync(file, JSON.stringify(reordered));
    const validation = run("", ["--validate-adventure", file]);
    assert.equal(validation.status, 0, validation.stdout);
    const branch = play(
      file,
      "sealed message",
      join(directory, "reordered.trace.json"),
      steps,
    );
    assert.equal(branch.status, 0, branch.stderr);
    assert.doesNotMatch(branch.stdout, /The log confirms it/u);
    assert.match(branch.stdout, /I checked the instrument book twice/u);
    reordered.npcs[0].topics[0].replies.reverse();
    writeFileSync(file, JSON.stringify(reordered));
    const invalid = run("", ["--validate-adventure", file]);
    assert.equal(invalid.status, 2);
    assert.ok(
      JSON.parse(invalid.stdout).diagnostics.some(
        ({ code }) => code === "missing-fallback",
      ),
    );
  }));

test("edited prose and requirements apply without rebuilding, with isolated sessions and generic intent guards", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  temporary((directory) => {
    const edited = structuredClone(original);
    edited.locations[0].description = "A silver bell hangs above the harbor.";
    edited.endings.choices[1].when.push({
      type: "milestone-recorded",
      id: "keeper-account",
    });
    const file = join(directory, "edited adventure.json");
    writeFileSync(file, JSON.stringify(edited));
    const validation = run("", ["--validate-adventure", file]);
    assert.equal(validation.status, 0, validation.stdout);
    const played = play(
      file,
      "private report",
      join(directory, "edited.trace.json"),
      route.slice(0, 7),
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /silver bell/u);
    assert.doesNotMatch(played.stdout, /Resolution: private-report/u);
  });
  const loaded = loadAdventure(JSON.stringify(original));
  assert.equal(loaded.ok, true);
  const runtime = createChapelCluesRuntime(loaded.adventure);
  const random = createSeededRandom(0);
  const first = runtime.handleAction(
    runtime.createSession(),
    runtime.parseCommand("move store"),
    random,
  ).state;
  assert.equal(first.locationId, "store");
  const second = runtime.createSession();
  assert.equal(second.locationId, "tower");
  assert.deepEqual(second.discoveries, []);
  const collection = runtime.dispatchGameTool(
    first,
    { name: "take", argumentsJson: '{"item_id":"blue-tonic"}' },
    random,
    "Look at the blue tonic",
  );
  assert.equal(collection.modelOutput.error.code, "unavailable-reference");
  assert.strictEqual(collection.state, first);
  const requested = runtime.dispatchGameTool(
    first,
    { name: "take", argumentsJson: '{"item_id":"blue-tonic"}' },
    random,
    "Collect the blue tonic",
  );
  assert.equal(requested.state.items["blue-tonic"], "inventory");
  const wounded = structuredClone(original);
  wounded.player.hp = 15;
  const healingRuntime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(wounded)).adventure,
  );
  let healingState = healingRuntime.createSession();
  for (const command of [
    "move store",
    "take tonic",
    "move tower",
    "move pier",
  ]) {
    healingState = healingRuntime.handleAction(
      healingState,
      healingRuntime.parseCommand(command),
      random,
    ).state;
  }
  assert.equal(
    healingRuntime.handleAction(
      healingState,
      healingRuntime.parseCommand("talk keeper signal ask"),
      random,
    ).rejection.reason,
    "invisible-target",
  );
  for (const command of ["search chart", "move vault", "use tonic"]) {
    healingState = healingRuntime.handleAction(
      healingState,
      healingRuntime.parseCommand(command),
      random,
    ).state;
  }
  assert.equal(healingState.items["blue-tonic"], "consumed");
  assert.ok(healingState.fighter.hp > 15);
  let state = runtime.createSession();
  for (const command of route) {
    state = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    ).state;
  }
  for (const input of [
    "Do not post the tide bulletin",
    "Post the tide bulletin or send the tide report",
    "Should we post the tide bulletin?",
  ]) {
    const rejected = runtime.dispatchGameTool(
      state,
      {
        name: "resolve_quest",
        argumentsJson: '{"resolutionId":"public-bulletin"}',
      },
      random,
      input,
    );
    assert.equal(
      rejected.modelOutput.error.code,
      "unavailable-reference",
      input,
    );
    assert.strictEqual(rejected.state, state);
  }
});
