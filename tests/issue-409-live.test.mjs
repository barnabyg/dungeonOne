// #409: the live release script plays a generated route with --generated:
// any built-in module, here the eight-room Hollow Chantry, on the route the
// harness's cautious run takes on the seed, from a saved level-3 Ada.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("the live release script plays a generated route with --generated", async () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const env = { ...process.env, OPENAI_API_KEY: "" };
  const directory = await mkdtemp(join(tmpdir(), "issue-409-script-"));
  try {
    const output = join(directory, "report.json");
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--generated",
        "--adventure",
        "hollow-chantry",
        "--output",
        output,
        "--max-calls",
        "4",
      ],
      { encoding: "utf8", env, timeout: 60000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.issue, 409);
    assert.equal(report.generated, true);
    assert.equal(report.adventureId, "hollow-chantry");
    assert.equal(report.seed, 0);
    assert.equal(report.ending.kind, "victory");
    assert.equal(report.summary.skipped, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("without --generated, a module with no hand-written route is refused", () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [script, "--dry-run", "--adventure", "hollow-chantry"],
    { encoding: "utf8", timeout: 60000 },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--generated/u);
});
