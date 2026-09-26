import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/stolen-signet.json";
const document = JSON.parse(readFileSync(source, "utf8"));
const run = (input, args, env = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
const temporary = (work) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-41-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const commandInputs = {
  victory: [
    "move guardroom",
    "open wooden door",
    "move guardroom",
    "status",
    "attack goblin",
    "attack goblin",
    "move reliquary",
    "leave",
    "take signet",
    "inspect signet",
    "leave",
    "inspect signet",
    "move guardroom",
    "status",
    "inventory",
    "quit",
    "",
  ].join("\n"),
  defeat: [
    "open wooden door",
    "move guardroom",
    "attack goblin",
    "attack goblin",
    "attack goblin",
    "move reliquary",
    "status",
    "look",
    "quit",
    "",
  ].join("\n"),
};

test("validated combat content has exact references and rejects impossible placements", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.equal(loaded.adventure.snapshot.schemaVersion, 2);
  assert.equal(
    loaded.adventure.indexes.monsters.goblin.definitionId,
    "goblin-definition",
  );
  const { SIGNET_SCHEMA } = await import("../dist/signet-schema.js");
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v2.schema.json", "utf8")),
    SIGNET_SCHEMA,
  );
  const { createSignetRuntime } = await import("../dist/signet-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const runtime = createSignetRuntime(loaded.adventure);
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  state = runtime.handleAction(state, {
    type: "open",
    target: "wooden door",
  }).state;
  state = runtime.handleAction(
    state,
    { type: "move", destination: "guardroom" },
    random,
  ).state;
  const inspect = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "inspect");
  assert.ok(inspect.parameters.properties.target.enum.includes("goblin"));
  assert.equal(
    runtime.dispatchGameTool(state, {
      name: "inspect",
      argumentsJson: '{"target":"goblin"}',
    }).modelOutput.ok,
    true,
  );
  state = runtime.handleAction(
    state,
    { type: "attack", target: "goblin" },
    random,
  ).state;
  state = runtime.handleAction(
    state,
    { type: "attack", target: "goblin" },
    random,
  ).state;
  state = runtime.handleAction(
    state,
    { type: "move", destination: "reliquary" },
    random,
  ).state;
  state = runtime.handleAction(
    state,
    { type: "take", target: "signet" },
    random,
  ).state;
  assert.ok(
    runtime
      .getGameToolDefinitions(state)
      .find(({ name }) => name === "inspect")
      .parameters.properties.target.enum.includes("signet"),
  );
  assert.equal(
    runtime.dispatchGameTool(state, {
      name: "inspect",
      argumentsJson: '{"target":"signet"}',
    }).modelOutput.ok,
    true,
  );
  for (const change of [
    (copy) => {
      copy.player.weaponId = "missing";
    },
    (copy) => {
      copy.items[0].featureId = "cold-hearth";
    },
    (copy) => {
      copy.monsters[0].hp = 8;
    },
    (copy) => {
      copy.doors[0].to = "reliquary";
    },
    (copy) => {
      copy.locations[2].aliases = ["entrance"];
    },
  ]) {
    const copy = structuredClone(document);
    change(copy);
    const result = loadAdventure(JSON.stringify(copy));
    assert.equal(result.ok, false, JSON.stringify(result));
  }
});

test("renamed content IDs and aliases complete the same combat and escape journey", () =>
  temporary((directory) => {
    const renamed = structuredClone(document);
    const replacements = new Map([
      ["entrance", "gate"],
      ["guardroom", "hall"],
      ["reliquary", "vault"],
      ["entrance-door", "oak-door"],
      ["longsword", "blade"],
      ["goblin-definition", "raider-definition"],
      ["goblin", "raider"],
      ["signet", "token"],
      ["stone-pedestal", "stone-plinth"],
    ]);
    const rename = (value) => {
      if (Array.isArray(value)) {
        return value.map(rename);
      }
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, rename(child)]),
        );
      }
      return typeof value === "string"
        ? (replacements.get(value) ?? value)
        : value;
    };
    const content = rename(renamed);
    content.id = "renamed-quest";
    content.locations[0].aliases = ["gate"];
    content.locations[1].aliases = ["hall"];
    content.locations[2].aliases = ["vault"];
    content.doors[0].aliases = ["oak door"];
    content.monsterDefinitions[0].aliases = ["raider"];
    content.items[0].aliases = ["token"];
    content.exit.aliases = ["hidden way"];
    const path = join(directory, "renamed.json");
    writeFileSync(path, JSON.stringify(content));
    const played = run(
      "open oak door\nmove hall\nattack raider\nattack raider\nmove vault\ntake token\nleave wrong way\nleave hidden way\nquit\n",
      ["--adventure-file", path, "--seed", "0"],
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Victory![\s\S]*token/);
  }));

test("external command victory and defeat preserve seeded historical combat and replay without source", () =>
  temporary((directory) => {
    for (const [name, seed] of [
      ["victory", "0"],
      ["defeat", "207"],
    ]) {
      const tracePath = join(directory, `${name}.json`);
      const input = commandInputs[name];
      const external = run(input, [
        "--adventure-file",
        source,
        "--seed",
        seed,
        "--trace",
        tracePath,
      ]);
      const historical = run(input, [
        "--adventure",
        "stolen-signet",
        "--seed",
        seed,
      ]);
      assert.equal(external.status, 0, external.stderr);
      assert.equal(historical.status, 0, historical.stderr);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.formatVersion, 4);
      assert.equal(trace.completion.outcome, name);
      if (name === "victory") {
        const inspections = trace.actions.filter(
          (entry) =>
            entry.action.type === "inspect" && entry.action.target === "signet",
        );
        assert.equal(inspections.length, 2);
        assert.ok(
          inspections.every((entry) => entry.result.type === "accepted"),
        );
      }
      assert.deepEqual(
        trace.actions.flatMap((entry) => entry.rolls),
        (() => {
          const oldTracePath = join(directory, `${name}-old.json`);
          const old = run(input, [
            "--adventure",
            "stolen-signet",
            "--seed",
            seed,
            "--trace",
            oldTracePath,
          ]);
          assert.equal(old.status, 0, old.stderr);
          return JSON.parse(readFileSync(oldTracePath, "utf8")).actions.flatMap(
            (entry) => entry.rolls,
          );
        })(),
      );
      for (const action of trace.actions) {
        if (
          ["status", "inventory", "look"].includes(action.action.type) ||
          action.result.type === "rejected"
        ) {
          assert.deepEqual(action.rolls, []);
        }
      }
      assert.match(
        external.stdout,
        name === "victory" ? /Session: victory/ : /Session: defeat/,
      );
      assert.match(
        historical.stdout,
        name === "victory" ? /Session: victory/ : /Session: defeat/,
      );
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));

test("scripted AI uses strict tools, local reads, one mutation, and replays format 4", () =>
  temporary((directory) => {
    const scriptPath = join(directory, "script.json"),
      tracePath = join(directory, "ai.json"),
      sourcePath = join(directory, "signet.json");
    writeFileSync(sourcePath, JSON.stringify(document));
    const call = (id, name, args) => [
      { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
      { text: "Done." },
    ];
    writeFileSync(
      scriptPath,
      JSON.stringify([
        ...call("closed", "move", { destination_id: "guardroom" }),
        ...call("open", "open", { door_id: "entrance-door" }),
        ...call("enter", "move", { destination_id: "guardroom" }),
        ...call("hit1", "attack", { opponent_id: "goblin" }),
        ...call("hit2", "attack", { opponent_id: "goblin" }),
        ...call("relic", "move", { destination_id: "reliquary" }),
        ...call("early", "leave", {}),
        ...call("take", "take", { item_id: "signet" }),
        ...call("leave", "leave", {}),
      ]),
    );
    const played = run(
      "status\nGo to the guardroom\nOpen the door\nEnter the guardroom\nAttack goblin\nAttack goblin again\nEnter the reliquary\nLeave\nTake the signet\nLeave\nquit\n",
      [
        "--adventure-file",
        sourcePath,
        "--ai",
        "--seed",
        "0",
        "--trace",
        tracePath,
      ],
      { DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.completion.outcome, "victory");
    assert.equal(trace.turns[0].kind, "local-status");
    assert.equal(
      trace.turns[1].calls[0].result.modelOutput.error.code,
      "action-rejected",
    );
    assert.equal(
      trace.turns[7].calls[0].result.modelOutput.error.code,
      "unavailable-reference",
    );
    rmSync(sourcePath);
    assert.equal(run("", ["--replay", tracePath]).status, 0);
    const changed = structuredClone(trace);
    changed.turns[4].stateAfter.fighter.hp = 1;
    writeFileSync(tracePath, JSON.stringify(changed));
    assert.equal(run("", ["--replay", tracePath]).status, 1);
  }));

test("scripted AI defeat keeps final reads and blocks later mutations", () =>
  temporary((directory) => {
    const scriptPath = join(directory, "script.json"),
      tracePath = join(directory, "defeat.json");
    const call = (id, name, args) => [
      { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
      { text: "Observed." },
    ];
    writeFileSync(
      scriptPath,
      JSON.stringify([
        ...call("open", "open", { door_id: "entrance-door" }),
        ...call("enter", "move", { destination_id: "guardroom" }),
        ...call("hit1", "attack", { opponent_id: "goblin" }),
        ...call("hit2", "attack", { opponent_id: "goblin" }),
        ...call("hit3", "attack", { opponent_id: "goblin" }),
        ...call("move-after", "move", { destination_id: "reliquary" }),
      ]),
    );
    const played = run(
      "Open door\nEnter guardroom\nAttack goblin\nAttack goblin\nAttack goblin\nstatus\nMove reliquary\nlook\nquit\n",
      [
        "--adventure-file",
        source,
        "--ai",
        "--seed",
        "207",
        "--trace",
        tracePath,
      ],
      { DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.completion.outcome, "defeat");
    assert.equal(trace.turns[5].kind, "local-status");
    assert.equal(
      trace.turns[6].calls[0].result.modelOutput.error.code,
      "unavailable-reference",
    );
    assert.equal(trace.turns[7].stateAfter.locationId, "guardroom");
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("scripted narration failure after a killing blow keeps one committed result", () =>
  temporary((directory) => {
    const scriptPath = join(directory, "script.json"),
      tracePath = join(directory, "failure.json");
    const call = (id, name, args) => [
      { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
      { text: "Observed." },
    ];
    writeFileSync(
      scriptPath,
      JSON.stringify([
        ...call("open", "open", { door_id: "entrance-door" }),
        ...call("enter", "move", { destination_id: "guardroom" }),
        ...call("miss", "attack", { opponent_id: "goblin" }),
        {
          toolCalls: [
            {
              id: "kill",
              name: "attack",
              argumentsJson: '{"opponent_id":"goblin"}',
            },
          ],
        },
      ]),
    );
    const played = run(
      "Open door\nEnter guardroom\nAttack goblin\nAttack goblin\nstatus\nquit\n",
      ["--adventure-file", source, "--ai", "--seed", "0", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns[3].diagnostics[0].code, "model-failure");
    assert.equal(trace.turns[3].stateAfter.monsters.goblin.hp, 0);
    assert.equal(trace.turns[4].stateAfter.monsters.goblin.hp, 0);
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));
