import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(input, args, env = {}) {
  const environment = { ...process.env, OPENAI_API_KEY: "", ...env };
  if (!("DUNGEON_ONE_TEST_DM_SCRIPT" in env)) {
    delete environment.DUNGEON_ONE_TEST_DM_SCRIPT;
  }
  return spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    env: environment,
    timeout: 10000,
  });
}
function temporary(work) {
  const directory = mkdtempSync(join(tmpdir(), "issue-40-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const document = {
  schemaVersion: 1,
  id: "signet-exploration",
  contentVersion: "1",
  rulesVersion: "exploration-rules-v1",
  title: "The Stolen Signet",
  introduction: "Explore the old watchtower.",
  objective: "Survey the entrance and guardroom.",
  player: { locationId: "entrance", hp: 20, maxHp: 20 },
  locations: [
    {
      id: "entrance",
      name: "Entrance",
      description: "A ruined arch.",
      aliases: ["entrance"],
    },
    {
      id: "guardroom",
      name: "Guardroom",
      description: "Dusty benches.",
      aliases: ["guard room", "guardroom"],
    },
  ],
  connections: [
    { id: "inward", from: "entrance", to: "guardroom" },
    { id: "outward", from: "guardroom", to: "entrance" },
  ],
  features: [
    {
      id: "carving",
      locationId: "entrance",
      name: "Carving",
      description: "A worn signet carved in stone.",
      aliases: ["carving"],
    },
  ],
};

test("external definitions round-trip canonically and expose immutable reference indexes", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const loaded = loadAdventure(Buffer.from(JSON.stringify(document)));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.adventure.indexes.locations.entrance.name, "Entrance");
  assert.throws(() => {
    loaded.adventure.snapshot.locations[0].name = "changed";
  }, TypeError);
  assert.throws(() => {
    loaded.adventure.indexes.locations.entrance = null;
  }, TypeError);
  const again = loadAdventure(loaded.adventure.canonicalJson);
  assert.deepEqual(again, loaded);
});

test("loader rejects malformed, ambiguous, unsupported and unbounded authored content with stable diagnostics", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const invalid = [
    ['{"id":"a","id":"b"}', "duplicate-key", "/id"],
    ['{"id":"a","\\u0069d":"b"}', "duplicate-key", "/id"],
    [new Uint8Array([0xc3, 0x28]), "invalid-utf8", ""],
    [" ".repeat(1024 * 1024 + 1), "byte-limit", ""],
    ["[".repeat(33) + "0" + "]".repeat(33), "depth-limit", "/0".repeat(32)],
  ];
  const mutate = (change, code, path) => {
    const copy = structuredClone(document);
    change(copy);
    invalid.push([JSON.stringify(copy), code, path]);
  };
  mutate(
    (d) => {
      d.schemaVersion = 2;
    },
    "unsupported-version",
    "/schemaVersion",
  );
  mutate(
    (d) => {
      d.rulesVersion = "future";
    },
    "unsupported-version",
    "/rulesVersion",
  );
  mutate(
    (d) => {
      d.script = "run";
    },
    "unknown-field",
    "/script",
  );
  mutate(
    (d) => {
      d.locations.push(d.locations[0]);
    },
    "duplicate-id",
    "/locations/2/id",
  );
  mutate(
    (d) => {
      d.features[0].locationId = "carving";
    },
    "unknown-reference",
    "/features/0/locationId",
  );
  mutate(
    (d) => {
      d.player.locationId = "missing";
    },
    "unknown-reference",
    "/player/locationId",
  );
  mutate(
    (d) => {
      d.player.hp = 21;
    },
    "invalid-placement",
    "/player/hp",
  );
  mutate(
    (d) => {
      d.player.hp = 1.5;
    },
    "invalid-integer",
    "/player/hp",
  );
  mutate(
    (d) => {
      d.title = "x".repeat(4097);
    },
    "string-limit",
    "/title",
  );
  mutate(
    (d) => {
      d.title = "\ud800";
    },
    "invalid-string",
    "/title",
  );
  mutate(
    (d) => {
      d.title = "{unknown}";
    },
    "unsupported-placeholder",
    "/title",
  );
  mutate(
    (d) => {
      d.locations[0].aliases = ["Bad Alias"];
    },
    "invalid-alias",
    "/locations/0/aliases/0",
  );
  mutate(
    (d) => {
      d.features[0].aliases = ["guard-room"];
    },
    "ambiguous-alias",
    "/features/0/aliases/0",
  );
  mutate(
    (d) => {
      d.connections[0].to = "carving";
    },
    "unknown-reference",
    "/connections/0/to",
  );
  mutate(
    (d) => {
      d.features = Array(257).fill(d.features[0]);
    },
    "collection-limit",
    "/features",
  );
  for (const [input, code, path] of invalid) {
    const result = loadAdventure(input);
    assert.equal(result.ok, false, code);
    assert.ok(
      result.diagnostics.some((d) => d.code === code && d.path === path),
      JSON.stringify(result),
    );
    assert.deepEqual(loadAdventure(input), result);
    assert.ok(
      result.diagnostics.every((d) => "entity" in d && d.severity === "error"),
    );
  }
});

test("CLI validates and explores a file with spaces before starting a provider", () =>
  temporary((directory) => {
    const source = join(directory, "my adventure.json");
    writeFileSync(source, JSON.stringify(document));
    const validation = run("", [`--validate-adventure=${source}`]);
    assert.equal(validation.status, 0, validation.stderr);
    assert.equal(JSON.parse(validation.stdout).ok, true);
    const played = run(
      "help\ninspect carving\nmove guard-room\nlook\nmove entrance\nattack goblin\nquit\n",
      ["--adventure-file", source, "--seed=0"],
    );
    assert.equal(played.status, 0, played.stderr);
    for (const text of [
      "The Stolen Signet",
      "A ruined arch.",
      "A worn signet carved in stone.",
      "Dusty benches.",
      "unavailable",
      "Goodbye",
    ]) {
      assert.ok(played.stdout.includes(text), played.stdout);
    }
    writeFileSync(source, "{}");
    const invalid = run("", ["--adventure-file", source, "--ai"]);
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /missing-field/);
    assert.doesNotMatch(invalid.stderr, /OPENAI_API_KEY|scripted DM/);
  }));

test("format 4 commands replay from their snapshot after source deletion and reject changed evidence", () =>
  temporary((directory) => {
    const source = join(directory, "external.json"),
      tracePath = join(directory, "trace.json");
    writeFileSync(source, JSON.stringify(document));
    const played = run("inspect carving\nmove guardroom\nlook\nquit\n", [
      `--adventure-file=${source}`,
      "--seed=0",
      `--trace=${tracePath}`,
    ]);
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.formatVersion, 4);
    assert.equal(trace.mode, "command");
    assert.equal(trace.engineVersion, "data-engine-v1");
    assert.deepEqual(trace.adventureSnapshot, document);
    assert.match(trace.content.digest, /^sha256:[0-9a-f]{64}$/);
    rmSync(source);
    const replayed = run("", ["--replay", tracePath]);
    assert.equal(replayed.status, 0, replayed.stderr);
    for (const change of [
      (t) => {
        t.adventureSnapshot.title = "Changed";
      },
      (t) => {
        t.engineVersion = "future";
      },
      (t) => {
        t.content.id = "other";
      },
      (t) => {
        t.rulesVersion = "future";
      },
      (t) => {
        t.random.algorithm = "other";
      },
      (t) => {
        t.actions[1].action.destination = "entrance";
      },
      (t) => {
        t.actions[1].stateAfter.locationId = "entrance";
      },
      (t) => {
        t.actions[0].result.events = [];
      },
      (t) => {
        t.actions[0].rolls = [{ sides: 20, value: 10 }];
      },
      (t) => {
        t.initialState.locationId = "guardroom";
      },
      (t) => {
        t.adventureSnapshot.introduction = "x".repeat(1024 * 1024);
      },
    ]) {
      const changed = structuredClone(trace);
      change(changed);
      writeFileSync(tracePath, JSON.stringify(changed));
      const result = run("", ["--replay", tracePath]);
      assert.equal(result.status, 1, result.stdout);
      assert.match(
        result.stderr,
        /digest|Unsupported|divergence|byte-limit|identity/,
      );
    }
  }));

test("scripted AI shares exploration dispatch, keeps local controls local and exports authoritative format 4 calls", () =>
  temporary((directory) => {
    const source = join(directory, "source.json"),
      tracePath = join(directory, "ai.json"),
      script = join(directory, "script.json");
    writeFileSync(source, JSON.stringify(document));
    const call = (id, name, args) => [
      { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
      { text: "\u001b[31mObserved.\u001b[0m" },
    ];
    writeFileSync(
      script,
      JSON.stringify([
        ...call("look", "look", {}),
        ...call("inspect", "inspect", { target: "carving" }),
        ...call("move", "move", { destinationId: "guardroom" }),
        ...call("remote", "inspect", { target: "carving" }),
      ]),
    );
    const played = run(
      "help\nstatus\ninventory\nlook around\ninspect the carving\nenter guardroom\ninspect the distant carving\nquit\n",
      ["--adventure-file", source, "--ai", "--seed=0", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Dusty benches/);
    assert.doesNotMatch(played.stdout, /scripted DM has no response|\u001b/);
    assert.doesNotMatch(played.stdout, /journal|potion|combat/);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.mode, "ai");
    assert.deepEqual(
      trace.turns.map((t) => t.kind),
      [
        "local-help",
        "local-status",
        "local-inventory",
        "dm",
        "dm",
        "dm",
        "dm",
        "local-quit",
      ],
    );
    assert.equal(
      trace.turns[6].calls[0].result.modelOutput.error.code,
      "unavailable-reference",
    );
    assert.ok(trace.turns.every((t) => !JSON.stringify(t).includes("\\u001b")));
    rmSync(source);
    rmSync(script);
    let replay = run("", [`--replay=${tracePath}`]);
    assert.equal(replay.status, 0, replay.stderr);
    for (const change of [
      (t) => {
        t.dm.promptVersion = "future";
      },
      (t) => {
        t.turns[5].rawPlayerInput = "quit";
      },
      (t) => {
        t.turns[5].rawPlayerInput = " STATUS ";
      },
      (t) => {
        t.turns[5].rawPlayerInput = "help";
      },
      (t) => {
        t.turns[5].rawPlayerInput = "inventory";
      },
      (t) => {
        t.dm.toolSchemaVersion = "future";
      },
      (t) => {
        t.turns[0].rawPlayerInput = "move guardroom";
      },
      (t) => {
        t.turns[5].calls[0].arguments.value.destinationId = "entrance";
      },
      (t) => {
        t.turns[5].calls[0].disposition.executed = false;
      },
      (t) => {
        t.turns[5].calls[0].result.engineResult.events = [];
      },
      (t) => {
        t.turns[5].stateAfter.locationId = "entrance";
      },
      (t) => {
        t.turns[3].calls[0].rolls.push({ sides: 20, value: 1 });
      },
    ]) {
      const changed = structuredClone(trace);
      change(changed);
      writeFileSync(tracePath, JSON.stringify(changed));
      replay = run("", ["--replay", tracePath]);
      assert.equal(replay.status, 1, replay.stdout);
    }
  }));

test("selectors, missing files and validation conflicts fail before session startup", () =>
  temporary((directory) => {
    const source = join(directory, "source.json");
    writeFileSync(source, JSON.stringify(document));
    for (const args of [
      ["--adventure-file", source, `--adventure-file=${source}`],
      ["--adventure=chapel", "--adventure-file", source],
      ["--adventure-file", source, "--adventure", "chapel"],
      ["--adventure-file="],
      ["--adventure-file"],
      ["--adventure-file", join(directory, "missing.json"), "--ai"],
      ["--adventure-file", directory, "--ai"],
      ["--replay=missing.json", "--adventure-file", source],
      ["--validate-adventure", source, "--seed=0"],
      ["--validate-adventure", source, "--ai"],
      ["--validate-adventure", source, "--trace=x"],
      ["--validate-adventure", source, "--replay=x"],
      ["--validate-adventure", source, "--adventure=chapel"],
      ["--validate-adventure", source, `--validate-adventure=${source}`],
    ]) {
      const result = run("", args);
      assert.equal(result.status, 2, JSON.stringify(args));
      assert.doesNotMatch(result.stdout, /Seed:|The Stolen Signet/);
      assert.doesNotMatch(result.stderr, /OPENAI_API_KEY/);
    }
    const validation = run("", ["--validate-adventure", source]);
    assert.equal(validation.status, 0, validation.stderr);
    writeFileSync(source, "{}");
    const bad = run("", [`--validate-adventure=${source}`]);
    assert.equal(bad.status, 2);
    assert.equal(JSON.parse(bad.stdout).ok, false);
  }));

test("published schema and example match the pure loader and canonical digest is order sensitive only for arrays", async () => {
  const { loadAdventure, canonicalJson } =
    await import("../dist/adventure-loader.js");
  const { ADVENTURE_SCHEMA } = await import("../dist/adventure-schema.js");
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v1.schema.json", "utf8")),
    ADVENTURE_SCHEMA,
  );
  assert.equal(
    loadAdventure(readFileSync("adventures/signet-exploration.json")).ok,
    true,
  );
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(
    canonicalJson({ zero: -0, text: "é😀" }),
    '{"text":"é😀","zero":0}',
  );
  const load = (value) => loadAdventure(JSON.stringify(value)).adventure;
  assert.equal(
    load(document).digest,
    load(Object.fromEntries(Object.entries(document).reverse())).digest,
  );
  const copy = structuredClone(document);
  copy.locations.reverse();
  assert.notEqual(load(document).digest, load(copy).digest);
});

test("independent sessions use arbitrary authored IDs and expose only public views to scripted AI", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createExplorationRuntime } =
    await import("../dist/exploration-runtime.js");
  const { playGame } = await import("../dist/play.js");
  const other = structuredClone(document);
  other.id = "other-world";
  other.locations[1].id = "library";
  other.locations[1].name = "Library";
  other.locations[1].aliases = ["library"];
  other.locations[1].description = "A remote private description.";
  other.connections[0].to = "library";
  other.connections[1].from = "library";
  const runtime = createExplorationRuntime(
    loadAdventure(JSON.stringify(other)).adventure,
  );
  const requests = [];
  let response = 0;
  const model = {
    respond: async (request) => {
      requests.push(structuredClone(request));
      return response++ === 0
        ? {
            toolCalls: [
              {
                id: "go",
                name: "move",
                argumentsJson: '{"destinationId":"library"}',
              },
            ],
          }
        : { text: "You arrive." };
    },
  };
  const io = (inputs) => ({
    terminal: false,
    lines: {
      async *[Symbol.asyncIterator]() {
        yield* inputs;
      },
      close() {},
      prompt() {},
    },
    write() {},
  });
  await playGame(
    { seed: 0, runtime, dmModel: model },
    io(["enter library", "quit"]),
  );
  assert.equal(requests[0].scene.room.id, "entrance");
  assert.equal(requests[1].scene.room.id, "library");
  assert.doesNotMatch(
    JSON.stringify(requests[0]),
    /A remote private description|adventureSnapshot|schemaVersion|connections|canonicalJson/,
  );
  assert.deepEqual(
    requests[0].tools.map((t) => t.name),
    ["look", "get_character_status", "inspect", "move"],
  );
  const move = requests[0].tools.find((t) => t.name === "move");
  assert.deepEqual(move.parameters.properties.destinationId.enum, ["library"]);
  requests.length = 0;
  response = 0;
  await playGame(
    { seed: 0, runtime, dmModel: model },
    io(["enter library", "quit"]),
  );
  assert.equal(requests[0].scene.room.id, "entrance");
});

test("format 4 preserves committed movement when scripted narration fails and rejects malformed tools", () =>
  temporary((directory) => {
    const source = join(directory, "source.json"),
      tracePath = join(directory, "ai.json"),
      script = join(directory, "script.json");
    writeFileSync(source, JSON.stringify(document));
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "bad",
              name: "move",
              argumentsJson: '{"destinationId":"guardroom","extra":1}',
            },
          ],
        },
        { text: "No movement." },
        {
          toolCalls: [
            {
              id: "duplicate",
              name: "move",
              argumentsJson:
                '{"destinationId":"entrance","destinationId":"guardroom"}',
            },
          ],
        },
        { text: "No movement." },
        {
          toolCalls: [
            {
              id: "move",
              name: "move",
              argumentsJson: '{"destinationId":"guardroom"}',
            },
          ],
        },
      ]),
    );
    const played = run(
      "go\ngo\ngo\nstatus\nquit\n",
      ["--adventure-file", source, "--seed=0", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns[0].stateAfter.locationId, "entrance");
    assert.equal(trace.turns[1].stateAfter.locationId, "entrance");
    assert.equal(trace.turns[2].stateAfter.locationId, "guardroom");
    assert.equal(trace.turns[2].diagnostics[0].code, "model-failure");
    const replay = run("", ["--replay", tracePath]);
    assert.equal(replay.status, 0, replay.stderr);
  }));

test("rejected noninteger and malformed-Unicode tool arguments remain replayable evidence", () =>
  temporary((directory) => {
    const source = join(directory, "source.json"),
      tracePath = join(directory, "ai.json"),
      script = join(directory, "script.json");
    writeFileSync(source, JSON.stringify(document));
    const argumentsList = [
      '{"destinationId":1.5}',
      '{"destinationId":1e999}',
      '{"destinationId":"\\ud800"}',
      '{"destinationId":"\ud800"}',
    ];
    writeFileSync(
      script,
      JSON.stringify(
        argumentsList.flatMap((argumentsJson, index) => [
          { toolCalls: [{ id: String(index), name: "move", argumentsJson }] },
          { text: "Rejected." },
        ]),
      ),
    );
    const played = run(
      "go\ngo\ngo\ngo\nquit\n",
      ["--adventure-file", source, "--seed=0", "--trace", tracePath],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.ok(
      trace.turns
        .slice(0, 4)
        .every((turn) => turn.stateAfter.locationId === "entrance"),
    );
    const replay = run("", ["--replay", tracePath]);
    assert.equal(replay.status, 0, replay.stderr);
  }));

test("format 4 bounds apply before decoding with late, escaped and long numeric version fields; legacy sizes stay readable", () =>
  temporary((directory) => {
    const path = join(directory, "bounded.json");
    const padding = " ".repeat(17 * 1024 * 1024);
    for (const version of [
      '"formatVersion":4',
      '"format\\u0056ersion":4',
      `"formatVersion":4${"0".repeat(200)}e-200`,
    ]) {
      writeFileSync(path, `{${padding}${version}}`);
      const replay = run("", ["--replay", path]);
      assert.equal(replay.status, 1, replay.stderr);
      assert.match(replay.stderr, /byte-limit/);
    }
    writeFileSync(
      path,
      `${padding}${readFileSync("tests/fixtures/historical-victory.json", "utf8")}`,
    );
    const legacy = run("", ["--replay", path]);
    assert.equal(legacy.status, 0, legacy.stderr);
    writeFileSync(
      path,
      '{"formatVersion":4,"nested":' +
        "[".repeat(49) +
        "0" +
        "]".repeat(49) +
        "}",
    );
    const deep = run("", ["--replay", path]);
    assert.equal(deep.status, 1);
    assert.match(deep.stderr, /nesting/);
  }));
