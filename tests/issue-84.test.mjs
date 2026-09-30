import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/hollow-beacon-watch.json", import.meta.url),
);

function inTemp(body) {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-issue-84-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
function script(path, actions) {
  writeFileSync(
    path,
    JSON.stringify(
      actions.flatMap(([id, name, args]) => [
        { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] },
        { text: "The " + name + " action resolved." },
      ]),
    ),
  );
}

test("opposite command and scripted-AI clue orders converge on one attributed discovery", () =>
  inTemp((dir) => {
    const loaded = loadAdventure(readFileSync(adventure));
    const previous = loadAdventure(
      readFileSync("adventures/hollow-beacon-conversations.json"),
    );
    assert.equal(loaded.ok, true);
    assert.equal(previous.ok, true);
    assert.equal(loaded.adventure.snapshot.contentVersion, "4");
    assert.notEqual(loaded.adventure.digest, previous.adventure.digest);
    const commandSave = join(dir, "command.json");
    const commandTrace = join(dir, "command-trace.json");
    const commandInput =
      "move watch-loft\ntalk pell shift persuade\nmove signal-records\nsearch setting-plate\nmove watch-loft\njournal\n";
    const output = run(commandInput, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      commandSave,
      "--trace",
      commandTrace,
    ]);
    assert.match(output, /Pell: I cannot give you my shift account/);
    assert.match(
      output,
      /Altered beacon setting \[observation; beacon setting plate, Signal Records Room\]/,
    );
    assert.match(output, /who changed it and why remain unknown/);
    assert.doesNotMatch(output, /the keeper is safe|the caravan is safe/i);
    const aiSave = join(dir, "ai.json");
    const aiTrace = join(dir, "ai-trace.json");
    const aiScript = join(dir, "ai-script.json");
    script(aiScript, [
      ["loft", "move", { destinationId: "watch-loft" }],
      ["records", "move", { destinationId: "signal-records" }],
      ["plate", "search", { target: "setting-plate" }],
      ["back", "move", { destinationId: "watch-loft" }],
      [
        "pell",
        "talk",
        { speakerId: "pell", topicId: "shift", approach: "persuade" },
      ],
    ]);
    const aiInput =
      "Go to the watch loft\nEnter the records room\nCompare the setting plate\nReturn to Pell\nPersuade Pell to discuss the shift\n";
    run(
      aiInput,
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
    const command = read(commandSave).checkpoint;
    const ai = read(aiSave).checkpoint;
    assert.deepEqual(ai.state, command.state);
    assert.deepEqual(ai.randomState, command.randomState);
    assert.equal(ai.state.clocks["caravan-deadline"], 0);
    assert.deepEqual(ai.state.discoveries, [
      "dark-beacon-known",
      "altered-setting",
    ]);
    assert.equal(ai.state.socialChallenges["pell-account"].result, "failure");
    assert.equal(
      read(commandTrace).actions.flatMap(({ rolls }) => rolls).length,
      1,
    );
    run(commandInput, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--trace",
      commandTrace,
    ]);
    run(
      aiInput,
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
    assert.match(
      run("", ["--replay", commandTrace]),
      /Trace verified successfully/,
    );
    assert.match(run("", ["--replay", aiTrace]), /Trace verified successfully/);
  }));

test("a failed check cannot be rerolled by paraphrase; success reveals only Pell's account", () =>
  inTemp((dir) => {
    const save = join(dir, "failed.json");
    const trace = join(dir, "failed-trace.json");
    const output = run(
      "move watch-loft\ntalk pell shift persuade\ntalk signaler watch deceive\ntalk pell shift ask\nmove signal-records\nsearch setting-plate\nmove watch-loft\ntalk pell shift intimidate\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        trace,
      ],
    );
    assert.equal(
      (output.match(/I cannot give you my shift account/g) ?? []).length,
      4,
    );
    assert.equal(read(trace).actions.flatMap(({ rolls }) => rolls).length, 1);
    assert.equal(
      read(save).checkpoint.state.socialChallenges["pell-account"].result,
      "failure",
    );
    assert.ok(!read(save).checkpoint.state.discoveries.includes("pell-shift"));
    assert.ok(
      read(save).checkpoint.state.discoveries.includes("altered-setting"),
    );
    const loaded = loadAdventure(readFileSync(adventure));
    assert.equal(loaded.ok, true);
    const game = createDataRuntime(loaded.adventure);
    const moved = game.handleAction(
      game.createSession(),
      game.parseCommand("move watch-loft"),
    );
    const success = game.handleAction(
      moved.state,
      game.parseCommand("talk pell shift persuade"),
      { roll: () => 20 },
    );
    assert.equal(
      success.state.socialChallenges["pell-account"].result,
      "success",
    );
    assert.ok(success.state.discoveries.includes("pell-shift"));
    assert.ok(!success.state.discoveries.includes("altered-setting"));
    assert.deepEqual(success.state.conversationHistory.at(-1).statements, [
      "Before dusk, Pell copied the approved beacon setting toward the caravan fork.",
    ]);
    assert.equal(
      loaded.adventure.snapshot.discoveries.find(
        ({ id }) => id === "pell-shift",
      ).sourceNpcId,
      "pell",
    );
  }));

test("the plate remains a fallback after Pell leaves or dies; scenes reflect the evidence and deadline", () =>
  inTemp((dir) => {
    const lateSave = join(dir, "late.json");
    const late = run(
      "move watch-loft\nwait days 3\nlook\nmove signal-records\nsearch setting-plate\nlook\njournal\n",
      ["--adventure-file", adventure, "--seed", "0", "--save", lateSave],
    );
    assert.match(late, /The bell is silent/);
    assert.match(
      late,
      /approved fork score and fresh east-cut score remain visible after the missed Day 3 turn/,
    );
    assert.equal(
      read(lateSave).checkpoint.state.npcLocations.pell,
      "watch-yard",
    );
    assert.equal(read(lateSave).checkpoint.state.clocks["caravan-deadline"], 3);
    assert.ok(
      read(lateSave).checkpoint.state.discoveries.includes("altered-setting"),
    );
    assert.doesNotMatch(late, /the keeper is safe|the caravan is safe/i);
    const revisited = run(
      "move watch-loft\nmove watch-yard\nlook\ntalk iona brief ask\ntalk iona setting ask\n",
      ["--resume", lateSave],
    );
    assert.match(revisited, /plate confirms a changed signal setting/);
    assert.match(revisited, /Ridge Trail is closed/);
    assert.match(revisited, /black pennant marks a missed turn, not a rescue/);
    assert.match(revisited, /late rescue may still be possible/);
    const deadSave = join(dir, "dead.json");
    const deadTrace = join(dir, "dead-trace.json");
    const deadInput =
      "move watch-loft\nattack pell\nattack pell\nlook\njournal\nmove signal-records\nsearch setting-plate\n";
    const dead = run(deadInput, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      deadSave,
      "--trace",
      deadTrace,
    ]);
    assert.match(dead, /Pell dies at Watch Loft/);
    assert.match(dead, /Pell lies where they fell beside the watch bell/);
    assert.match(dead, /Pell cannot answer/);
    assert.equal(read(deadSave).checkpoint.state.npcHealth.pell.hp, 0);
    assert.ok(
      read(deadSave).checkpoint.state.discoveries.includes("altered-setting"),
    );
    assert.match(
      run("move watch-loft\nlook\n", ["--resume", deadSave]),
      /Pell lies where they fell beside the watch bell/,
    );
    run(deadInput, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--trace",
      deadTrace,
    ]);
    assert.match(
      run("", ["--replay", deadTrace]),
      /Trace verified successfully/,
    );
    const early = run(
      "move watch-loft\ntalk pell\nmove signal-records\nsearch setting-plate\nmove watch-loft\ntalk pell\nmove watch-yard\ntalk iona\n",
      ["--adventure-file", adventure, "--seed", "0"],
    );
    assert.match(early, /Discuss the altered plate — talk pell plate ask/);
    assert.match(early, /Report the altered setting — talk iona setting ask/);
  }));

test("save, resume, and replay preserve the failed check, clue, witness move, clock, and late route", () =>
  inTemp((dir) => {
    const before =
      "move watch-loft\ntalk pell shift persuade\nmove signal-records\nsearch setting-plate\nmove watch-loft\n";
    const crossing = "wait days 3\n";
    const after =
      "follow pell\ntalk iona setting ask\nmove valley-road\nsearch wagon-ruts\nmove beacon-tower\nresolve hold-beacon\n";
    const fullSave = join(dir, "full.json");
    const fullTrace = join(dir, "full-trace.json");
    run(before + crossing + after, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      fullSave,
      "--trace",
      fullTrace,
    ]);
    const full = read(fullSave).checkpoint;
    assert.equal(full.state.status, "victory");
    assert.equal(full.state.ending.id, "hold-beacon");
    assert.equal(full.state.clocks["caravan-deadline"], 7);
    assert.equal(full.state.npcLocations.pell, "watch-yard");
    assert.equal(full.state.socialChallenges["pell-account"].result, "failure");
    assert.ok(full.state.discoveries.includes("altered-setting"));
    for (const [name, prefix, suffix] of [
      ["before", before, crossing + after],
      ["after", before + crossing, after],
    ]) {
      const save = join(dir, name + ".json");
      const first = join(dir, name + "-first.json");
      const second = join(dir, name + "-second.json");
      run(prefix, [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        first,
      ]);
      assert.match(
        run(suffix, [
          "--resume",
          save,
          "--trace",
          second,
          "--previous-trace",
          first,
        ]),
        /Resumed hollow-beacon/,
      );
      assert.deepEqual(read(save).checkpoint, full);
      assert.match(
        run("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
    }
    run(before + crossing + after, [
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
  }));
