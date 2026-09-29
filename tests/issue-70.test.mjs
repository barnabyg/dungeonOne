import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const chapel = fileURLToPath(
  new URL("../adventures/chapel-clues.json", import.meta.url),
);

function run(input, args, script) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      ...(script === undefined ? {} : { DUNGEON_ONE_TEST_DM_SCRIPT: script }),
    },
  });
}

function withDirectory(body) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-70-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("uninterrupted and split command journeys verify the same actions and dice", () =>
  withDirectory((directory) => {
    const save = join(directory, "save.json");
    const full = join(directory, "full.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const prefix =
      "move chapel path\nmove ruined chapel\nmove crypt\nattack skeleton\n";
    const suffix = "attack skeleton\n";
    assert.match(
      run("", [
        "--adventure-file",
        chapel,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        save,
      ]).stderr,
      /trace and save paths must differ/i,
    );
    assert.equal(
      run(prefix + suffix, [
        "--adventure-file",
        chapel,
        "--seed",
        "0",
        "--trace",
        full,
      ]).status,
      0,
    );
    assert.equal(
      run(prefix, [
        "--adventure-file",
        chapel,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        first,
      ]).status,
      0,
    );
    const resumed = run(suffix, [
      "--resume",
      save,
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(run("", ["--replay", full]).status, 0);
    const verified = run("", ["--replay", first, second]);
    assert.equal(verified.status, 0, verified.stderr);
    const stale = run("", [
      "--resume",
      save,
      "--trace",
      join(directory, "third.json"),
      "--previous-trace",
      first,
    ]);
    assert.match(stale.stderr, /resume state/i);
    assert.match(
      run("", [
        "--resume",
        save,
        "--trace",
        join(directory, ".", "first.json"),
        "--previous-trace",
        first,
      ]).stderr,
      /new trace path must differ/i,
    );
    const combined = [
      ...JSON.parse(readFileSync(first)).actions,
      ...JSON.parse(readFileSync(second)).actions,
    ];
    assert.deepEqual(
      combined.map(({ rawInput, rolls, result, stateAfter }) => ({
        rawInput,
        rolls,
        result,
        stateAfter,
      })),
      JSON.parse(readFileSync(full)).actions.map(
        ({ rawInput, rolls, result, stateAfter }) => ({
          rawInput,
          rolls,
          result,
          stateAfter,
        }),
      ),
    );

    assert.match(
      run("", ["--replay", first]).stderr,
      /complete ordered segment list/i,
    );
    assert.match(
      run("", ["--replay", second, first]).stderr,
      /segment 0 index/i,
    );
    const altered = join(directory, "altered.json");
    const changed = JSON.parse(readFileSync(first));
    changed.actions[0].rawInput = "look";
    writeFileSync(altered, JSON.stringify(changed));
    assert.match(
      run("", ["--replay", altered, second]).stderr,
      /previous digest/i,
    );
    const ordinary = run("", ["--replay", full, second]);
    assert.match(ordinary.stderr, /format 5/i);
    const mismatched = join(directory, "mismatched.json");
    const changedIdentity = JSON.parse(readFileSync(second));
    changedIdentity.engineVersion = "different-engine";
    writeFileSync(mismatched, JSON.stringify(changedIdentity));
    assert.match(
      run("", ["--replay", first, mismatched]).stderr,
      /segment 1 engineVersion/i,
    );
    const badSequence = join(directory, "bad-sequence.json");
    const changedSequence = JSON.parse(readFileSync(second));
    changedSequence.actions[0].sequence = 9;
    writeFileSync(badSequence, JSON.stringify(changedSequence));
    assert.match(
      run("", ["--replay", first, badSequence]).stderr,
      /segment entry 1 sequence/i,
    );

    const badCompletion = join(directory, "bad-completion.json");
    const relinked = join(directory, "relinked.json");
    const changedCompletion = JSON.parse(readFileSync(first));
    changedCompletion.completion.outcome = "victory";
    writeFileSync(badCompletion, JSON.stringify(changedCompletion));
    const changedLink = JSON.parse(readFileSync(second));
    changedLink.segment.previousDigest = `sha256:${createHash("sha256").update(readFileSync(badCompletion)).digest("hex")}`;
    writeFileSync(relinked, JSON.stringify(changedLink));
    assert.match(
      run("", ["--replay", badCompletion, relinked]).stderr,
      /segment 0 completion/i,
    );
  }));

test("split scripted-AI journey verifies tool calls and state across resume", () =>
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
        call("path", "move", { destinationId: "chapel-path" }),
        { text: "Done." },
      ]),
    );
    const started = run(
      "go to the chapel path\n",
      [
        "--adventure-file",
        chapel,
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
    assert.equal(started.status, 0, started.stderr);
    writeFileSync(
      script,
      JSON.stringify([
        call("potion", "take", { item_id: "healing-potion" }),
        { text: "Taken." },
      ]),
    );
    const resumed = run(
      "take the potion\n",
      ["--resume", save, "--ai", "--trace", second, "--previous-trace", first],
      script,
    );
    assert.equal(resumed.status, 0, resumed.stderr);
    const verified = run("", ["--replay", first, second]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(
      JSON.parse(readFileSync(second)).turns[0].calls[0].name,
      "take",
    );
    const mismatch = join(directory, "mismatch.json");
    const changed = JSON.parse(readFileSync(second));
    changed.turns[0].calls[0].name = "move";
    writeFileSync(mismatch, JSON.stringify(changed));
    assert.match(
      run("", ["--replay", first, mismatch]).stderr,
      /replay divergence|unsupported|failure/i,
    );
  }));
