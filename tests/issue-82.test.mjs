import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAdventure } from "../dist/adventure-loader.js";
import { TRAVEL_SCHEMA } from "../dist/travel-schema.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/hollow-beacon-journey.json", import.meta.url),
);
const content = JSON.parse(readFileSync(adventure, "utf8"));

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

function withDirectory(body) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-82-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function save(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function script(path, actions) {
  writeFileSync(
    path,
    JSON.stringify(
      actions.flatMap(([id, name, args]) => [
        { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
        { text: `The ${name} action resolved.` },
      ]),
    ),
  );
}

test("schema 10 validates per-route days and ordered effects without changing schema 9", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v10.schema.json", "utf8")),
    TRAVEL_SCHEMA,
  );
  const valid = loadAdventure(JSON.stringify(content));
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.diagnostics, []);
  const invalid = (change, path) => {
    const copy = structuredClone(content);
    change(copy);
    const result = loadAdventure(JSON.stringify(copy));
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((entry) => entry.path === path));
  };
  invalid(
    (copy) => (copy.connections[4].travelDays = -1),
    "/connections/4/travelDays",
  );
  invalid(
    (copy) => delete copy.connections[4].travelDays,
    "/connections/4/travelDays",
  );
  invalid(
    (copy) => (copy.connections[4].travelDays = 1.5),
    "/connections/4/travelDays",
  );
  invalid((copy) => (copy.timeCosts.search = 1), "/timeCosts/search");
  invalid(
    (copy) =>
      copy.connections.push({
        id: "duplicate-route",
        from: "watch-yard",
        to: "ridge-trail",
        when: [],
        travelDays: 3,
      }),
    `/connections/${content.connections.length}/to`,
  );
  invalid(
    (copy) =>
      copy.clocks[0].thresholds.push({
        at: 2,
        text: "Out of order",
        visibleFrom: ["watch-yard"],
        effects: [{ type: "record-milestone", id: "deadline-passed" }],
      }),
    "/clocks/0/thresholds/1/at",
  );
  const old = loadAdventure(readFileSync("adventures/bribed-crossroads.json"));
  assert.equal(old.ok, true);
  assert.equal(old.adventure.snapshot.schemaVersion, 9);
  assert.equal(old.adventure.snapshot.timeCosts.move, 1);
});

test("on-time and late commands apply the deadline once and keep late rescue playable", () =>
  withDirectory((directory) => {
    const fast = join(directory, "fast.json");
    const fastTrace = join(directory, "fast-trace.json");
    const fastOutput = run(
      "look\nmove nowhere\nmove keeper-path\nsearch latch\nmove watch-yard\nmove ridge-trail\nsearch broken-marker\nmove beacon-tower\nresolve hold-beacon\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        fast,
        "--trace",
        fastTrace,
      ],
    );
    assert.match(fastOutput, /Ridge Trail \(2 days\)/);
    assert.match(fastOutput, /Valley Road \(4 days\)/);
    assert.match(fastOutput, /Caravan Deadline: Day 2\/14/);
    assert.equal(save(fast).checkpoint.state.ending.id, "hold-beacon");
    assert.equal(save(fast).checkpoint.state.clocks["caravan-deadline"], 2);
    assert.equal(save(fast).runtime.engineVersion, "chapel-clues-engine-v15");
    run(
      "move keeper-path\nsearch latch\nmove watch-yard\nmove ridge-trail\nsearch broken-marker\nmove beacon-tower\nresolve hold-beacon\n",
      ["--adventure-file", adventure, "--seed", "0", "--trace", fastTrace],
    );
    assert.match(
      run("", ["--replay", fastTrace]),
      /Trace verified successfully/,
    );

    const late = join(directory, "late.json");
    const lateTrace = join(directory, "late-trace.json");
    const lateOutput = run(
      "move refugee-camp\ntalk sera keeper-warning ask\nmove watch-yard\nmove valley-road\njournal\nsearch wagon-ruts\nmove beacon-tower\njournal\nresolve hold-beacon\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        late,
        "--trace",
        lateTrace,
      ],
    );
    assert.equal((lateOutput.match(/Day 3 passes\./g) ?? []).length, 1);
    assert.match(lateOutput, /stranded caravan wagons/);
    assert.match(lateOutput, /late rescue|stranded caravan/i);
    const [offscreenJournal, towerJournal] = lateOutput
      .split("Journal — ")
      .slice(1);
    assert.doesNotMatch(offscreenJournal, /Milestones: [^\n]*deadline-passed/);
    assert.match(towerJournal, /Milestones: [^\n]*deadline-passed/);
    assert.equal(save(late).checkpoint.state.clocks["caravan-deadline"], 4);
    assert.deepEqual(save(late).checkpoint.state.ending.consequences, [
      "late-rescue",
    ]);
    run(
      "move refugee-camp\ntalk sera keeper-warning ask\nmove watch-yard\nmove valley-road\nsearch wagon-ruts\nmove beacon-tower\nresolve hold-beacon\n",
      ["--adventure-file", adventure, "--seed", "0", "--trace", lateTrace],
    );
    assert.match(
      run("", ["--replay", lateTrace]),
      /Trace verified successfully/,
    );

    const lateStart = run(
      "wait days 3\nlook\nmove ridge-trail\nmove valley-road\n",
      ["--adventure-file", adventure, "--seed", "0"],
    );
    const afterDeadline = lateStart.slice(lateStart.indexOf("Day 0 → Day 3."));
    assert.doesNotMatch(
      afterDeadline.match(/Exits: ([^\n]+)/)[1],
      /Ridge Trail/,
    );
    assert.match(lateStart, /Day 3 → Day 7/);
    assert.match(lateStart, /Valley Road \(4 days\)/);
  }));

test("one journey crosses multiple ordered thresholds exactly once", () =>
  withDirectory((directory) => {
    const ordered = structuredClone(content);
    ordered.quest.milestones.push("second-warning");
    ordered.clocks[0].thresholds.push({
      at: 5,
      text: "A second watch pennant marks the search crews' departure.",
      visibleFrom: ["watch-yard"],
      effects: [{ type: "record-milestone", id: "second-warning" }],
    });
    const path = join(directory, "ordered.json");
    const saved = join(directory, "ordered-save.json");
    writeFileSync(path, JSON.stringify(ordered));
    const output = run("wait days 7\nwait days 1\n", [
      "--adventure-file",
      path,
      "--seed",
      "0",
      "--save",
      saved,
    ]);
    assert.equal(
      (output.match(/watch raises a black pennant/g) ?? []).length,
      1,
    );
    assert.equal((output.match(/second watch pennant/g) ?? []).length, 1);
    assert.ok(
      output.indexOf("watch raises a black pennant") <
        output.indexOf("second watch pennant"),
    );
    assert.deepEqual(save(saved).checkpoint.state.milestones, [
      "deadline-passed",
      "second-warning",
    ]);
  }));

test("reads, invalid moves, and split resumes preserve clock and next draw", () =>
  withDirectory((directory) => {
    const plain = join(directory, "plain.json");
    const noisy = join(directory, "noisy.json");
    run("move valley-road\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "4",
      "--save",
      plain,
    ]);
    run("look\nstatus\njournal\nmove nowhere\nmove valley-road\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "4",
      "--save",
      noisy,
    ]);
    assert.deepEqual(
      save(plain).checkpoint.state,
      save(noisy).checkpoint.state,
    );
    assert.equal(
      save(plain).checkpoint.randomPosition,
      save(noisy).checkpoint.randomPosition,
    );
    assert.deepEqual(
      save(plain).checkpoint.randomState,
      save(noisy).checkpoint.randomState,
    );

    for (const [name, prefix, suffix] of [
      [
        "before",
        "move keeper-path\nsearch latch\nmove watch-yard\n",
        "move ridge-trail\nmove beacon-tower\n",
      ],
      [
        "after",
        "move refugee-camp\ntalk sera keeper-warning ask\nmove watch-yard\nmove valley-road\n",
        "move beacon-tower\n",
      ],
    ]) {
      const fullSave = join(directory, `${name}-full-save.json`);
      const splitSave = join(directory, `${name}-split-save.json`);
      const fullTrace = join(directory, `${name}-full-trace.json`);
      const first = join(directory, `${name}-first.json`);
      const second = join(directory, `${name}-second.json`);
      run(prefix + suffix, [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        fullSave,
        "--trace",
        fullTrace,
      ]);
      run(prefix, [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        splitSave,
        "--trace",
        first,
      ]);
      run(suffix, [
        "--resume",
        splitSave,
        "--trace",
        second,
        "--previous-trace",
        first,
      ]);
      assert.deepEqual(
        save(splitSave).checkpoint.state,
        save(fullSave).checkpoint.state,
      );
      assert.equal(
        save(splitSave).checkpoint.randomPosition,
        save(fullSave).checkpoint.randomPosition,
      );
      assert.deepEqual(
        save(splitSave).checkpoint.randomState,
        save(fullSave).checkpoint.randomState,
      );
      run(prefix + suffix, [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--trace",
        fullTrace,
      ]);
      assert.match(
        run("", ["--replay", fullTrace]),
        /Trace verified successfully/,
      );
      assert.match(
        run("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
    }
  }));

test("scripted AI and command travel reach the same canonical late world", () =>
  withDirectory((directory) => {
    const commandSave = join(directory, "command.json");
    const aiSave = join(directory, "ai.json");
    const aiTrace = join(directory, "ai-trace.json");
    const aiScript = join(directory, "script.json");
    run(
      "move refugee-camp\ntalk sera keeper-warning ask\nmove watch-yard\nmove valley-road\nsearch wagon-ruts\nmove beacon-tower\n",
      ["--adventure-file", adventure, "--seed", "0", "--save", commandSave],
    );
    script(aiScript, [
      ["camp", "move", { destinationId: "refugee-camp" }],
      [
        "sera",
        "talk",
        { speakerId: "sera", topicId: "keeper-warning", approach: "ask" },
      ],
      ["yard", "move", { destinationId: "watch-yard" }],
      ["valley", "move", { destinationId: "valley-road" }],
      ["ruts", "search", { target: "wagon-ruts" }],
      ["tower", "move", { destinationId: "beacon-tower" }],
    ]);
    run(
      "Go to camp\nAsk Sera about the keeper\nReturn to the yard\nTake the valley road\nSearch the wagon ruts\nGo to the tower\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--ai",
        "--save",
        aiSave,
        "--trace",
        aiTrace,
      ],
      aiScript,
    );
    assert.deepEqual(
      save(aiSave).checkpoint.state,
      save(commandSave).checkpoint.state,
    );
    assert.deepEqual(
      save(aiSave).checkpoint.randomState,
      save(commandSave).checkpoint.randomState,
    );
    run(
      "Go to camp\nAsk Sera about the keeper\nReturn to the yard\nTake the valley road\nSearch the wagon ruts\nGo to the tower\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--ai",
        "--trace",
        aiTrace,
      ],
      aiScript,
    );
    assert.match(run("", ["--replay", aiTrace]), /Trace verified successfully/);
  }));
