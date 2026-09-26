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
  const directory = mkdtempSync(join(tmpdir(), "issue-45-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("healing items validate placement, target, parameters and aliases", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  for (const [change, code, path] of [
    [
      (value) => {
        value.items[0].featureId = "missing";
      },
      "unknown-reference",
      "/items/0/featureId",
    ],
    [
      (value) => {
        value.items[0].locationId = "inn";
      },
      "invalid-placement",
      "/items/0/featureId",
    ],
    [
      (value) => {
        value.items[0].healing.dice = 0;
      },
      "numeric-limit",
      "/items/0/healing/dice",
    ],
    [
      (value) => {
        value.items[0].healing.target = "monster";
      },
      "unsupported-value",
      "/items/0/healing/target",
    ],
    [
      (value) => {
        value.items.push({ ...value.items[0] });
      },
      "duplicate-id",
      "/items/1/id",
    ],
  ]) {
    const value = structuredClone(document);
    change(value);
    const result = loadAdventure(JSON.stringify(value));
    assert.ok(
      result.diagnostics.some(
        (diagnostic) => diagnostic.code === code && diagnostic.path === path,
      ),
      JSON.stringify(result.diagnostics),
    );
  }
  const renamed = structuredClone(document);
  renamed.items[0].id = "amber-tonic";
  renamed.items[0].name = "amber tonic";
  renamed.items[0].aliases = ["tonic"];
  assert.equal(loadAdventure(JSON.stringify(renamed)).ok, true);
});

test("collection intent uses visible aliases and honors feature visibility", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const hidden = structuredClone(document);
  hidden.items[0].featureId = "waymarker";
  const hiddenRuntime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(hidden)).adventure,
  );
  const random = createSeededRandom(0);
  const hiddenState = hiddenRuntime.handleAction(
    hiddenRuntime.createSession(),
    { type: "move", destination: "chapel path" },
    random,
  ).state;
  assert.deepEqual(hiddenRuntime.projectDmScene(hiddenState).room.items, []);
  assert.equal(
    hiddenRuntime
      .getGameToolDefinitions(hiddenState)
      .some(({ name }) => name === "take"),
    false,
  );
  assert.equal(
    hiddenRuntime.handleAction(hiddenState, { type: "take", target: "potion" })
      .state,
    hiddenState,
  );

  const variant = structuredClone(document);
  variant.items.push({
    ...variant.items[0],
    id: "silver-tonic",
    name: "silver tonic",
    aliases: ["potion"],
    locationId: "ruined-chapel",
    featureId: "broken-roof",
  });
  const loaded = loadAdventure(JSON.stringify(variant));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const runtime = createChapelCluesRuntime(loaded.adventure);
  let state = runtime.createSession();
  for (const destination of ["chapel path", "ruined chapel"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      random,
    ).state;
  }
  const result = runtime.dispatchGameTool(
    state,
    { name: "take", argumentsJson: '{"item_id":"silver-tonic"}' },
    random,
    "Collect potion",
  );
  assert.equal(result.modelOutput.ok, true);
  assert.equal(result.state.items["silver-tonic"], "inventory");
  assert.equal(result.state.items["healing-potion"], "room");
});

test("collection and healing use authoritative ownership, cap, exact draws and retaliation", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  const random = createSeededRandom(74);
  let state = runtime.createSession();
  const unavailable = runtime.handleAction(
    state,
    { type: "use", target: "potion" },
    random,
  );
  assert.equal(unavailable.state, state);
  state = runtime.handleAction(
    state,
    { type: "move", destination: "chapel path" },
    random,
  ).state;
  assert.deepEqual(
    runtime.projectDmScene(state).room.items.map(({ id }) => id),
    ["healing-potion"],
  );
  assert.match(
    runtime.handleAction(state, { type: "inspect", target: "potion" }).events[0]
      .text,
    /2d4/,
  );
  state = runtime.handleAction(
    state,
    { type: "take", target: "potion" },
    random,
  ).state;
  assert.equal(state.items["healing-potion"], "inventory");
  assert.deepEqual(
    runtime.projectCharacterStatus(state).collectedItems.map(({ id }) => id),
    ["healing-potion"],
  );
  assert.equal(
    runtime.handleAction(state, { type: "take", target: "potion" }, random)
      .state,
    state,
  );
  const full = runtime.handleAction(
    state,
    { type: "use", target: "potion" },
    random,
  );
  assert.equal(full.rejection.reason, "full-hp");
  assert.equal(full.state, state);
  for (const destination of ["ruined chapel", "crypt"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      random,
    ).state;
  }
  const before = state.fighter.hp;
  const used = runtime.handleAction(
    state,
    { type: "use", target: "potion" },
    random,
  );
  assert.equal(used.state.items["healing-potion"], "consumed");
  assert.equal(used.events[0].operation, "use");
  assert.match(
    used.events[0].text,
    /Healing: d4 2, d4 4 \+ 2 = 8\. Actual healing: 8\. Fighter HP: 18\/20/,
  );
  assert.ok(
    used.events.some(
      (entry) =>
        entry.type === "attack-resolved" &&
        entry.attackerId === "skeleton-guardian",
    ),
  );
  assert.equal(
    used.events.find((entry) => entry.type === "attack-resolved").attackRoll,
    2,
  );
  assert.equal(
    runtime.handleAction(used.state, { type: "use", target: "potion" }, random)
      .state,
    used.state,
  );
  assert.ok(used.state.fighter.hp <= Math.min(20, before + 10));
  assert.deepEqual(
    runtime.projectCharacterStatus(used.state).collectedItems,
    [],
  );
});

test("healing caps at maximum, and a spent item cannot prevent seeded defeat", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const cappedDocument = structuredClone(document);
  cappedDocument.player.hp = 19;
  const cappedRuntime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(cappedDocument)).adventure,
  );
  const cappedRandom = createSeededRandom(74);
  let capped = cappedRuntime.createSession();
  capped = cappedRuntime.handleAction(
    capped,
    { type: "move", destination: "chapel path" },
    cappedRandom,
  ).state;
  capped = cappedRuntime.handleAction(
    capped,
    { type: "take", target: "potion" },
    cappedRandom,
  ).state;
  const healed = cappedRuntime.handleAction(
    capped,
    { type: "use", target: "potion" },
    cappedRandom,
  );
  assert.equal(healed.state.fighter.hp, 20);
  assert.match(healed.events[0].text, /Actual healing: 1\./);
  assert.equal(healed.state.items["healing-potion"], "consumed");

  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  const random = createSeededRandom(7);
  let state = runtime.createSession();
  for (const [type, target] of [
    ["move", "chapel path"],
    ["take", "potion"],
    ["move", "ruined chapel"],
    ["move", "crypt"],
    ["use", "potion"],
  ]) {
    state = runtime.handleAction(
      state,
      type === "move" ? { type, destination: target } : { type, target },
      random,
    ).state;
  }
  for (let turn = 0; turn < 10 && state.status === "playing"; turn += 1) {
    state = runtime.handleAction(
      state,
      { type: "attack", target: "skeleton" },
      random,
    ).state;
  }
  assert.equal(state.status, "defeat");
  assert.equal(state.items["healing-potion"], "consumed");
  assert.equal(
    runtime.handleAction(state, { type: "use", target: "potion" }, random)
      .rejection.reason,
    "terminal-state",
  );
});

test("command collection, combat use and defeat export replayable format 4", () =>
  temporary((directory) => {
    const tracePath = join(directory, "command.json");
    const played = run(
      "move chapel path\ntake potion\nmove ruined chapel\nmove crypt\nuse potion\nuse potion\nattack skeleton\nquit\n",
      ["--adventure-file", source, "--seed", "74", "--trace", tracePath],
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.formatVersion, 4);
    assert.equal(
      trace.actions[1].stateAfter.items["healing-potion"],
      "inventory",
    );
    assert.equal(
      trace.actions[4].stateAfter.items["healing-potion"],
      "consumed",
    );
    assert.equal(trace.actions[5].rolls.length, 0);
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("seed 7 defeats the fighter after a combat potion use in command and scripted AI replay", () =>
  temporary((directory) => {
    const actions = [
      ["move", "chapel-path"],
      ["take", "healing-potion"],
      ["move", "ruined-chapel"],
      ["move", "crypt"],
      ["use_item", "healing-potion"],
      ...Array.from({ length: 5 }, () => ["attack", "skeleton-guardian"]),
    ];
    const commandTrace = join(directory, "command-defeat.json");
    const command = run(
      `move chapel path\ntake potion\nmove ruined chapel\nmove crypt\nuse potion\n${"attack skeleton\n".repeat(5)}quit\n`,
      ["--adventure-file", source, "--seed", "7", "--trace", commandTrace],
    );
    assert.equal(command.status, 0, command.stderr);
    const commandData = JSON.parse(readFileSync(commandTrace, "utf8"));
    assert.equal(commandData.actions.at(-1).stateAfter.status, "defeat");
    assert.equal(commandData.actions[4].rolls.length, 3);
    assert.equal(run("", ["--replay", commandTrace]).status, 0);

    const script = join(directory, "script.json");
    const aiTrace = join(directory, "ai-defeat.json");
    writeFileSync(
      script,
      JSON.stringify(
        actions.flatMap(([name, value], index) => [
          {
            toolCalls: [
              {
                id: `call-${index}`,
                name,
                argumentsJson: JSON.stringify({
                  [name === "move"
                    ? "destinationId"
                    : name === "attack"
                      ? "opponent_id"
                      : "item_id"]: value,
                }),
              },
            ],
          },
          { text: "Continue." },
        ]),
      ),
    );
    const aiInput =
      [
        "Go to chapel path",
        "Collect potion",
        "Go to ruined chapel",
        "Go to crypt",
        "Use potion",
        ...Array.from({ length: 5 }, () => "Attack skeleton"),
        "quit",
      ].join("\n") + "\n";
    const ai = run(
      aiInput,
      ["--adventure-file", source, "--ai", "--seed", "7", "--trace", aiTrace],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(ai.status, 0, ai.stderr);
    const aiData = JSON.parse(readFileSync(aiTrace, "utf8"));
    assert.equal(aiData.turns.at(-1).stateAfter.status, "defeat");
    assert.equal(
      aiData.turns[4].stateAfter.items["healing-potion"],
      "consumed",
    );
    assert.equal(run("", ["--replay", aiTrace]).status, 0);
  }));

test("scripted AI respects renamed collection intent and committed use after provider failure", () =>
  temporary((directory) => {
    const variant = structuredClone(document);
    variant.items[0].id = "amber-tonic";
    variant.items[0].name = "amber tonic";
    variant.items[0].aliases = ["tonic"];
    const adventure = join(directory, "variant.json");
    const script = join(directory, "script.json");
    const tracePath = join(directory, "ai.json");
    writeFileSync(adventure, JSON.stringify(variant));
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "move",
              name: "move",
              argumentsJson: '{"destinationId":"chapel-path"}',
            },
          ],
        },
        { text: "On the path." },
        {
          toolCalls: [
            {
              id: "wrong",
              name: "inspect",
              argumentsJson: '{"target":"amber-tonic"}',
            },
          ],
        },
        { text: "The tonic remains visible." },
        {
          toolCalls: [
            {
              id: "take",
              name: "take",
              argumentsJson: '{"item_id":"amber-tonic"}',
            },
          ],
        },
        { text: "Collected." },
        {
          toolCalls: [
            {
              id: "chapel",
              name: "move",
              argumentsJson: '{"destinationId":"ruined-chapel"}',
            },
          ],
        },
        { text: "At the chapel." },
        {
          toolCalls: [
            {
              id: "crypt",
              name: "move",
              argumentsJson: '{"destinationId":"crypt"}',
            },
          ],
        },
        { text: "At the crypt." },
        {
          toolCalls: [
            {
              id: "use",
              name: "use_item",
              argumentsJson: '{"item_id":"amber-tonic"}',
            },
          ],
        },
      ]),
    );
    const played = run(
      "Go to chapel path\nCollect tonic\nCollect tonic\nGo to ruined chapel\nGo to crypt\nUse tonic\ninventory\nquit\n",
      [
        "--adventure-file",
        adventure,
        "--ai",
        "--seed",
        "74",
        "--trace",
        tracePath,
      ],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns[1].stateAfter.items["amber-tonic"], "room");
    assert.equal(trace.turns[2].stateAfter.items["amber-tonic"], "inventory");
    assert.equal(trace.turns[5].stateAfter.items["amber-tonic"], "consumed");
    assert.equal(trace.turns[5].diagnostics[0].code, "model-failure");
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));
