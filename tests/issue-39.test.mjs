import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "tests", "fixtures");
const inputs = path.join(root, "docs", "acceptance", "inputs");

function runCli(input, args, environment = {}) {
  return spawnSync(
    process.execPath,
    [path.join(root, "dist", "cli.js"), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        DUNGEON_ONE_TEST_DM_SCRIPT: undefined,
        ...environment,
      },
      input,
      timeout: 5_000,
    },
  );
}

for (const [name, seed] of [
  ["chapel-public-social-fallback", "7"],
  ["chapel-confidential", "0"],
  ["chapel-potion-defeat", "15"],
  ["chapel-oren-casualty", "0"],
  ["chapel-ai-failure-after", "0"],
]) {
  test(`chapel preserves frozen ${name} terminal output, trace and replay`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "issue-39-"));
    try {
      const tracePath = path.join(directory, "trace.json");
      const played = runCli(
        readFileSync(path.join(inputs, `${name}.txt`), "utf8"),
        ["--seed", seed, "--trace", tracePath],
        name.includes("-ai-")
          ? {
              DUNGEON_ONE_TEST_DM_SCRIPT: path.join(
                inputs,
                `${name}.script.json`,
              ),
            }
          : {},
      );
      assert.equal(played.status, 0, played.stderr);
      assert.equal(
        played.stdout.replace(/^Trace exported to .*\r?\n?/gmu, ""),
        readFileSync(path.join(fixtures, `historical-${name}.txt`), "utf8"),
      );
      assert.deepEqual(
        JSON.parse(readFileSync(tracePath, "utf8")),
        JSON.parse(
          readFileSync(path.join(fixtures, `historical-${name}.json`), "utf8"),
        ),
      );
      const replayed = runCli("", [
        "--replay",
        path.join(fixtures, `historical-${name}.json`),
      ]);
      assert.equal(replayed.status, 0, replayed.stderr);
      assert.match(replayed.stdout, /Trace verified successfully/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test("chapel replay accepts every v9 prompt identity and rejects mixed or missing identities", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "issue-39-tuples-"));
  const original = JSON.parse(
    readFileSync(
      path.join(fixtures, "historical-chapel-ai-failure-after.json"),
      "utf8",
    ),
  );
  const tracePath = path.join(directory, "trace.json");
  try {
    for (const prompt of [
      "chapel-casualties-dm-v9",
      "chapel-qualified-dm-v10",
      "chapel-qualified-dm-v11",
      "chapel-human-dm-v12",
    ]) {
      const trace = structuredClone(original);
      trace.dm.promptVersion = prompt;
      writeFileSync(tracePath, JSON.stringify(trace));
      const replayed = runCli("", ["--replay", tracePath]);
      assert.equal(replayed.status, 0, replayed.stderr);
    }
    for (const mutate of [
      (trace) => {
        delete trace.adventure.id;
      },
      (trace) => {
        trace.adventure.id = "stolen-signet";
      },
      (trace) => {
        trace.adventure.version = "chapel-resolution-v8";
      },
      (trace) => {
        trace.rulesVersion = "chapel-resolution-rules-v8";
      },
      (trace) => {
        trace.dm.promptVersion = "chapel-resolution-dm-v8";
      },
      (trace) => {
        trace.dm.toolSchemaVersion = "chapel-resolution-tools-v8";
      },
      (trace) => {
        trace.random.algorithm = "unknown";
      },
      (trace) => {
        trace.formatVersion = 4;
      },
    ]) {
      const trace = structuredClone(original);
      mutate(trace);
      writeFileSync(tracePath, JSON.stringify(trace));
      const replayed = runCli("", ["--replay", tracePath]);
      assert.equal(replayed.status, 1, replayed.stderr);
      assert.match(replayed.stderr, /Unsupported/u);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
