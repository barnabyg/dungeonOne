import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/consequence-journey.json", import.meta.url),
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

function journey(name) {
  return readFileSync(join(inputs, `issue-71-${name}.txt`), "utf8");
}

function withDirectory(body) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-71-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the checked-in two-session route preserves public consequences and replays without its source file", () =>
  withDirectory((directory) => {
    const source = join(directory, "adventure.json");
    const moved = join(directory, "adventure-away.json");
    const save = join(directory, "save.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    copyFileSync(adventure, source);
    const opening = run(journey("late-first"), [
      "--adventure-file",
      source,
      "--seed",
      "0",
      "--save",
      save,
      "--trace",
      first,
    ]);
    assert.match(opening, /I will remember that insult/);
    assert.match(opening, /Raider Scout dies at Cellar/);
    assert.match(opening, /raiders close the short passage/);
    const checkpoint = JSON.parse(readFileSync(save, "utf8")).checkpoint.state;
    assert.equal(checkpoint.locationId, "square");
    assert.equal(checkpoint.clocks["raider-plan"], 6);
    assert.equal(checkpoint.relationships.guard.tier, "hostile");
    assert.equal(checkpoint.items["restorative-tonic"], "inventory");
    assert.equal(checkpoint.npcLocations.neri, "square");

    renameSync(source, moved);
    const returnTrip = run(journey("late-second"), [
      "--resume",
      save,
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    assert.match(returnTrip, /Raider Scout's remains/);
    assert.match(returnTrip, /You insulted me/);
    assert.match(returnTrip, /long street toward the hall/);
    assert.match(returnTrip, /I have no report of Neri's fate/);
    assert.match(returnTrip, /Since you told me Neri reached the square/);
    assert.match(
      returnTrip,
      /Safe route \[observation; route register, Cellar\]/,
    );
    assert.match(returnTrip, /report arrives after the deadline/);
    assert.match(returnTrip, /Neri is alive in the square after the rescue/);
    const finished = JSON.parse(readFileSync(save, "utf8")).checkpoint.state;
    assert.equal(finished.status, "victory");
    assert.deepEqual(finished.ending.casualties, ["scout"]);
    assert.deepEqual(finished.ending.consequences, [
      "register-filed",
      "deadline-missed",
    ]);
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/,
    );
    assert.match(run("", ["--validate-adventure", moved]), /"ok":true/);
  }));

test("helping the guard and delivering directly meets the deadline", () =>
  withDirectory((directory) => {
    const save = join(directory, "save.json");
    const trace = join(directory, "trace.json");
    const output = run(journey("on-time"), [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      save,
      "--trace",
      trace,
    ]);
    assert.match(output, /Thank you for helping at the cellar exit/);
    assert.match(output, /before the raiders close the safe passage/);
    assert.doesNotMatch(output, /report arrives after the deadline/);
    const state = JSON.parse(readFileSync(save, "utf8")).checkpoint.state;
    assert.equal(state.relationships.guard.tier, "trusted");
    assert.equal(state.clocks["raider-plan"], 4);
    assert.deepEqual(state.ending.consequences, [
      "register-filed",
      "deadline-met",
    ]);
    const replayable = join(directory, "replayable.json");
    run(journey("on-time"), [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--trace",
      replayable,
    ]);
    assert.match(
      run("", ["--replay", replayable]),
      /Trace verified successfully/,
    );
    assert.equal(JSON.parse(readFileSync(trace, "utf8")).formatVersion, 5);
  }));

test("scripted AI selects guard actions across restart and verifies linked tools", () =>
  withDirectory((directory) => {
    const save = join(directory, "save.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const script = join(directory, "script.json");
    const call = (id, name, args) => ({
      toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }],
    });
    writeFileSync(
      script,
      JSON.stringify([
        call("insult", "talk", {
          speakerId: "guard",
          topicId: "insult",
          approach: "ask",
        }),
        { text: "The guard heard you." },
        call("square", "move", { destinationId: "square" }),
        { text: "You leave the cellar." },
      ]),
    );
    const opening = run(
      "Insult the guard\nGo to the square\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--ai",
        "--save",
        save,
        "--trace",
        first,
      ],
      script,
    );
    assert.match(opening, /I will remember that insult/);
    writeFileSync(
      script,
      JSON.stringify([
        call("cellar", "move", { destinationId: "cellar" }),
        { text: "You return to the cellar." },
        call("return", "talk", {
          speakerId: "guard",
          topicId: "return",
          approach: "ask",
        }),
        { text: "The guard remembers your earlier insult." },
      ]),
    );
    const resumed = run(
      "Return to the cellar\nAsk the guard to guide me\n",
      ["--resume", save, "--ai", "--trace", second, "--previous-trace", first],
      script,
    );
    assert.match(resumed, /You insulted me/);
    assert.doesNotMatch(resumed, /I can guide you through the streets/);
    assert.equal(JSON.parse(readFileSync(first, "utf8")).formatVersion, 5);
    assert.equal(
      JSON.parse(readFileSync(second, "utf8")).turns.at(-1).calls[0].name,
      "talk",
    );
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/,
    );
  }));
