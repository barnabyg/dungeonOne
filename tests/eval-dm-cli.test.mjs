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
      "--output",
      "README.md",
    ],
    { cwd: process.cwd(), encoding: "utf8", env: {} },
  );

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /inside \.dm-evaluations/u);
});
