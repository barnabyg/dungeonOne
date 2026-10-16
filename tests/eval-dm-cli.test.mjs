import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("eval command confines custom reports to the ignored report directory", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "eval-dm.mjs"),
      "--model",
      "test-model",
      "--live",
      "--output",
      "README.md",
    ],
    { cwd: process.cwd(), encoding: "utf8", env: {} },
  );

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /inside \.dm-evaluations/u);
});

test("eval command prints its usage once, one row per line", () => {
  const run = (args) =>
    spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "eval-dm.mjs"), ...args],
      { cwd: process.cwd(), encoding: "utf8", env: {} },
    );
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(
    help.stdout,
    /^Usage: npm run eval:dm -- --model <model-id> --live\n {7}\[--repetitions/u,
  );
  assert.equal(help.stdout.match(/Usage:/gu).length, 1);
  const refused = run(["--bogus"]);
  assert.equal(refused.status, 2);
  assert.equal(refused.stdout, "");
  assert.equal(refused.stderr.match(/Usage:/gu).length, 1);
});
