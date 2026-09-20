import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const inputs = path.join(root, "docs", "acceptance", "inputs");

function runCli(input, args, environment = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input,
    timeout: 5_000,
  });
}

test("tracked chapel handoff journeys reach both endings, defeat, a casualty ending, and replay", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "issue-38-"));
  const scenarios = [
    {
      name: "chapel-public-social-fallback",
      seed: "7",
      args: [],
      outcome: "victory",
      resolution: "public-disclosure",
      output: /Result: failure[\s\S]*published.*inquiry/is,
    },
    {
      name: "chapel-confidential",
      seed: "0",
      args: [],
      outcome: "victory",
      resolution: "confidential-referral",
      output: /delivered privately.*trustees.*restitution/is,
    },
    {
      name: "chapel-potion-defeat",
      seed: "15",
      args: ["--adventure", "chapel"],
      outcome: "defeat",
      output: /d4 rolls: 2, 1[\s\S]*skeleton guardian defeats you/is,
    },
    {
      name: "chapel-oren-casualty",
      seed: "0",
      args: ["--adventure", "chapel"],
      outcome: "victory",
      resolution: "confidential-referral",
      casualties: ["oren"],
      output: /Oren is dead.*no personal promise/is,
    },
  ];

  try {
    for (const scenario of scenarios) {
      const tracePath = path.join(directory, `${scenario.name}.json`);
      const input = readFileSync(
        path.join(inputs, `${scenario.name}.txt`),
        "utf8",
      );
      const played = runCli(input, [
        ...scenario.args,
        "--seed",
        scenario.seed,
        "--trace",
        tracePath,
      ]);
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, /The Bell Beneath the Chapel/i);
      assert.match(played.stdout, scenario.output);

      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.completion.outcome, scenario.outcome);
      if (scenario.resolution !== undefined) {
        assert.equal(
          trace.actions.at(-1).stateAfter.resolution.id,
          scenario.resolution,
        );
      }
      if (scenario.casualties !== undefined) {
        assert.deepEqual(
          trace.actions.at(-1).stateAfter.resolution.casualties,
          scenario.casualties,
        );
      }

      const replayed = runCli("", ["--replay", tracePath], {
        OPENAI_API_KEY: "",
      });
      assert.equal(replayed.status, 0, replayed.stderr);
      assert.match(replayed.stdout, /Trace verified successfully/i);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tracked provider failure journey preserves local recovery and model-free replay", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "issue-38-recovery-"));
  try {
    const tracePath = path.join(directory, "recovery.json");
    const played = runCli(
      readFileSync(path.join(inputs, "chapel-ai-failure-after.txt"), "utf8"),
      ["--seed", "0", "--trace", tracePath],
      {
        DUNGEON_ONE_TEST_DM_SCRIPT: path.join(
          inputs,
          "chapel-ai-failure-after.script.json",
        ),
      },
    );

    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Journal[\s\S]*The chapel route/u);
    assert.match(played.stdout, /Fighter HP: 20\/20/u);
    assert.match(played.stdout, /Equipped: longsword/u);
    assert.match(played.stdout, /Local commands:/u);

    const replayed = runCli("", ["--replay", tracePath], {
      OPENAI_API_KEY: "",
    });
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
