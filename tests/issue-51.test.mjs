import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve("dist/cli.js");

function inTemporaryDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon one issue 51 "));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function launch(cwd, args, input = "", env = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("built-in selectors and external files have equivalent seeded command play", () =>
  inTemporaryDirectory((directory) => {
    for (const [selector, filename, commands] of [
      ["chapel", "chapel-clues.json", "look\nmove chapel path\nstatus\nquit\n"],
      [
        "stolen-signet",
        "stolen-signet.json",
        "open wooden door\nmove guardroom\nstatus\nquit\n",
      ],
    ]) {
      const source = resolve("adventures", filename);
      const copied = join(directory, `copied ${filename}`);
      writeFileSync(copied, readFileSync(source));
      const builtinTrace = join(directory, `${selector} builtin trace.json`);
      const externalTrace = join(directory, `${selector} external trace.json`);
      const builtIn = launch(
        directory,
        ["--adventure", selector, "--seed", "0", "--trace", builtinTrace],
        commands,
      );
      const external = launch(
        directory,
        ["--adventure-file", copied, "--seed", "0", "--trace", externalTrace],
        commands,
      );
      assert.equal(
        builtIn.replace(/^Trace exported to .*$/gmu, ""),
        external.replace(/^Trace exported to .*$/gmu, ""),
      );
      const builtInExport = JSON.parse(readFileSync(builtinTrace, "utf8"));
      const externalExport = JSON.parse(readFileSync(externalTrace, "utf8"));
      assert.equal(builtInExport.formatVersion, 4);
      assert.deepEqual(builtInExport.actions, externalExport.actions);
      assert.deepEqual(builtInExport.content, externalExport.content);
      rmSync(copied);
      assert.match(
        launch(directory, ["--replay", builtinTrace]),
        /verified successfully/u,
      );
      assert.match(
        launch(directory, ["--replay", externalTrace]),
        /verified successfully/u,
      );
    }
  }));

test("default chapel and scripted AI export self-contained format-4 traces", () =>
  inTemporaryDirectory((directory) => {
    const script = join(directory, "empty script.json");
    writeFileSync(script, "[]");
    for (const args of [[], ["--ai"]]) {
      const trace = join(
        directory,
        args.length ? "ai trace.json" : "command trace.json",
      );
      launch(
        directory,
        [...args, "--seed", "0", "--trace", trace],
        "status\nquit\n",
        {
          DUNGEON_ONE_TEST_DM_SCRIPT: script,
        },
      );
      const exported = JSON.parse(readFileSync(trace, "utf8"));
      assert.equal(exported.formatVersion, 4);
      assert.equal(exported.content.id, "chapel-clues");
      assert.match(
        launch(directory, ["--replay", trace]),
        /verified successfully/u,
      );
    }
  }));

test("built-in command journeys match the authored files through endings and defeat", () =>
  inTemporaryDirectory((directory) => {
    for (const [selector, filename, seed, input, outcome] of [
      [
        "chapel",
        "chapel-clues.json",
        "0",
        readFileSync("docs/acceptance/inputs/chapel-confidential.txt", "utf8"),
        "victory",
      ],
      [
        "chapel",
        "chapel-clues.json",
        "7",
        readFileSync(
          "docs/acceptance/inputs/chapel-public-social-fallback.txt",
          "utf8",
        ),
        "victory",
      ],
      [
        "stolen-signet",
        "stolen-signet.json",
        "0",
        "open wooden door\nmove guardroom\nattack goblin\nattack goblin\nmove reliquary\ntake signet\nleave\nquit\n",
        "victory",
      ],
      [
        "stolen-signet",
        "stolen-signet.json",
        "207",
        "open wooden door\nmove guardroom\nattack goblin\nattack goblin\nattack goblin\nquit\n",
        "defeat",
      ],
    ]) {
      const builtInTrace = join(directory, `${selector} ${seed} built in.json`);
      const explicitTrace = join(
        directory,
        `${selector} ${seed} explicit.json`,
      );
      const builtIn = launch(
        directory,
        ["--adventure", selector, "--seed", seed, "--trace", builtInTrace],
        input,
      );
      const explicit = launch(
        directory,
        [
          "--adventure-file",
          resolve("adventures", filename),
          "--seed",
          seed,
          "--trace",
          explicitTrace,
        ],
        input,
      );
      assert.equal(
        builtIn.replace(/^Trace exported to .*$/gmu, ""),
        explicit.replace(/^Trace exported to .*$/gmu, ""),
      );
      const builtInExport = JSON.parse(readFileSync(builtInTrace, "utf8"));
      const explicitExport = JSON.parse(readFileSync(explicitTrace, "utf8"));
      assert.deepEqual(builtInExport.actions, explicitExport.actions);
      assert.equal(builtInExport.completion.outcome, outcome);
      assert.match(
        launch(directory, ["--replay", builtInTrace]),
        /verified successfully/u,
      );
    }
  }));

test("built-in and explicit-file scripted AI share authoritative tool behavior", () =>
  inTemporaryDirectory((directory) => {
    for (const [selector, filename, playerInput, toolName, argumentsJson] of [
      [
        "chapel",
        "chapel-clues.json",
        "Search the notice",
        "search",
        '{"target":"missing-person-notice"}',
      ],
      [
        "stolen-signet",
        "stolen-signet.json",
        "Open the wooden door",
        "open",
        '{"door_id":"entrance-door"}',
      ],
    ]) {
      const script = join(directory, `${selector} script.json`);
      writeFileSync(
        script,
        JSON.stringify([
          { toolCalls: [{ id: "call-1", name: toolName, argumentsJson }] },
          { text: "Continue." },
        ]),
      );
      const environment = { DUNGEON_ONE_TEST_DM_SCRIPT: script };
      const builtInTrace = join(directory, `${selector} ai built in.json`);
      const explicitTrace = join(directory, `${selector} ai explicit.json`);
      const input = `${playerInput}\nstatus\nquit\n`;
      const builtIn = launch(
        directory,
        [
          "--adventure",
          selector,
          "--ai",
          "--seed",
          "0",
          "--trace",
          builtInTrace,
        ],
        input,
        environment,
      );
      const explicit = launch(
        directory,
        [
          "--adventure-file",
          resolve("adventures", filename),
          "--ai",
          "--seed",
          "0",
          "--trace",
          explicitTrace,
        ],
        input,
        environment,
      );
      assert.equal(
        builtIn.replace(/^Trace exported to .*$/gmu, ""),
        explicit.replace(/^Trace exported to .*$/gmu, ""),
      );
      const builtInExport = JSON.parse(readFileSync(builtInTrace, "utf8"));
      const explicitExport = JSON.parse(readFileSync(explicitTrace, "utf8"));
      assert.equal(builtInExport.formatVersion, 4);
      assert.deepEqual(builtInExport.turns, explicitExport.turns);
      assert.match(
        launch(directory, ["--replay", builtInTrace]),
        /verified successfully/u,
      );
    }
  }));
