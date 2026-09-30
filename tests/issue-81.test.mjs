import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/hollow-beacon.json", import.meta.url),
);
const inputs = fileURLToPath(
  new URL("../docs/acceptance/inputs/", import.meta.url),
);

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
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-81-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function input(name) {
  return readFileSync(join(inputs, `issue-81-${name}.txt`), "utf8");
}

function snapshot(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function call(id, name, args) {
  return { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] };
}

function scriptAt(path, actions) {
  writeFileSync(
    path,
    JSON.stringify(
      actions.flatMap(([id, name, args]) => [
        call(id, name, args),
        { text: `The ${name} action happened.` },
      ]),
    ),
  );
}

test("the opening exposes both leads and truthful immediate departure choices", () =>
  withDirectory((directory) => {
    const validation = JSON.parse(run("", ["--validate-adventure", adventure]));
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.diagnostics, []);
    assert.equal(validation.content.id, "hollow-beacon");

    const opening = run("look\ntalk iona\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
    ]);
    assert.match(opening, /caravan is coming/);
    assert.match(opening, /move refugee-camp/);
    assert.match(opening, /move keeper-path/);
    assert.doesNotMatch(opening, /resolve Hold the beacon/);
    assert.doesNotMatch(opening, /talk iona relay-warning ask/);

    for (const [choice, consequence] of [
      ["refuse-watch", "decision-declined"],
      ["walk-away", "decision-abandoned"],
    ]) {
      const save = join(directory, `${choice}.json`);
      const output = run(`resolve ${choice}\nlook\n`, [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        save,
      ]);
      assert.match(output, /remains unresolved|later choice/);
      assert.doesNotMatch(output, /watch lights the beacon|runners to guide/);
      assert.equal(snapshot(save).checkpoint.state.ending.id, choice);
      assert.deepEqual(snapshot(save).checkpoint.state.ending.consequences, [
        consequence,
      ]);
      if (choice === "walk-away") {
        assert.match(
          output,
          /walk away from Iona's post across the Watch Yard/,
        );
      }
    }
  }));

test("either lead permits a decision and the latch observation stays qualified", () =>
  withDirectory((directory) => {
    const save = join(directory, "path-save.json");
    const trace = join(directory, "path-trace.json");
    const output = run(
      "move keeper-path\nsearch shutter-latch\njournal\nmove watch-yard\nresolve light-beacon\nlook\n",
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
    assert.match(
      output,
      /damage alone does not identify|cause and the keeper's whereabouts remain unknown/,
    );
    assert.match(output, /Whether anyone else follows it is still unknown/);
    const lastLook = output.slice(output.lastIndexOf("Watch Yard\n"));
    assert.match(lastLook, /watch lights the beacon/);
    assert.doesNotMatch(lastLook, /beacon is still dark|signal is decided/);
    assert.deepEqual(snapshot(save).checkpoint.state.discoveries, [
      "dark-beacon-known",
      "damaged-latch",
    ]);
    assert.equal(snapshot(save).checkpoint.state.ending.id, "light-beacon");
    const replayable = join(directory, "path-replayable.json");
    run(
      "move keeper-path\nsearch shutter-latch\nmove watch-yard\nresolve light-beacon\n",
      ["--adventure-file", adventure, "--seed", "0", "--trace", replayable],
    );
    assert.match(
      run("", ["--replay", replayable]),
      /Trace verified successfully/,
    );
  }));

test("command and scripted AI retain identical canonical state across restart and replay", () =>
  withDirectory((directory) => {
    const routes = [];
    for (const mode of ["command", "ai"]) {
      const save = join(directory, `${mode}-save.json`);
      const first = join(directory, `${mode}-first.json`);
      const second = join(directory, `${mode}-second.json`);
      const script = join(directory, `${mode}-script.json`);
      if (mode === "ai") {
        scriptAt(script, [
          ["camp", "move", { destinationId: "refugee-camp" }],
          [
            "sera",
            "talk",
            { speakerId: "sera", topicId: "keeper-warning", approach: "ask" },
          ],
          ["yard", "move", { destinationId: "watch-yard" }],
          [
            "warning",
            "talk",
            { speakerId: "iona", topicId: "relay-warning", approach: "ask" },
          ],
          ["path", "move", { destinationId: "keeper-path" }],
        ]);
      }
      const firstInput =
        mode === "ai"
          ? "Go to the refugee camp\nAsk Sera about the keeper\nReturn to the watch yard\nRelay a caution to Iona\nGo to the keeper path\n"
          : input("first");
      const opening = run(
        firstInput,
        [
          "--adventure-file",
          adventure,
          "--seed",
          "0",
          ...(mode === "ai" ? ["--ai"] : []),
          "--save",
          save,
          "--trace",
          first,
        ],
        mode === "ai" ? script : undefined,
      );
      assert.match(opening, /yellow flag|yellow caution flag/);
      const firstSave = snapshot(save);
      assert.equal(firstSave.runtime.adventureId, "hollow-beacon");
      assert.equal(firstSave.content.snapshot.contentVersion, "1");
      assert.equal(firstSave.runtime.contentVersion, "1");
      assert.match(firstSave.content.digest, /^sha256:/);
      assert.equal(firstSave.checkpoint.state.locationId, "keeper-path");
      assert.deepEqual(firstSave.checkpoint.state.milestones, [
        "lead-followed",
        "warning-relayed",
      ]);

      if (mode === "ai") {
        scriptAt(script, [
          ["back", "move", { destinationId: "watch-yard" }],
          [
            "response",
            "talk",
            { speakerId: "iona", topicId: "response", approach: "ask" },
          ],
          ["hold", "resolve_quest", { resolutionId: "hold-beacon" }],
        ]);
      }
      const resumed = run(
        mode === "ai"
          ? "Return to the watch yard\nAsk Iona how the watch responds\nHold the beacon\n"
          : input("second"),
        [
          "--resume",
          save,
          ...(mode === "ai" ? ["--ai"] : []),
          "--trace",
          second,
          "--previous-trace",
          first,
        ],
        mode === "ai" ? script : undefined,
      );
      assert.match(resumed, /Because you warned us/);
      assert.match(resumed, /keeps the beacon dark/);
      assert.ok(snapshot(save).checkpoint.state.ending, `${mode}: ${resumed}`);
      assert.equal(snapshot(save).checkpoint.state.ending.id, "hold-beacon");
      assert.equal(snapshot(save).checkpoint.state.status, "victory");
      assert.match(
        run("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
      routes.push(snapshot(save));
    }
    assert.deepEqual(routes[0].checkpoint.state, routes[1].checkpoint.state);
    assert.equal(
      routes[0].checkpoint.stateDigest,
      routes[1].checkpoint.stateDigest,
    );
    assert.equal(routes[0].content.digest, routes[1].content.digest);
  }));
