// Runs the test files concurrently, then the files that measure CPU time on
// their own: other processes sharing the cores inflate a process's CPU time
// (by about half on a loaded machine), so a budget measured alongside them
// fails on load, not on a slower engine. At most half the hardware threads
// run test files at once: many test files start a browser or a launcher of
// their own, and one per thread starves them past their timeouts.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";

/** Test files with a CPU-time budget, run after the rest, one at a time. */
const ALONE = ["tests/shipped-modules.test.mjs"];

const CONCURRENCY = Math.max(1, Math.floor(availableParallelism() / 2));

const files = readdirSync("tests")
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => `tests/${name}`);
const together = files.filter((file) => !ALONE.includes(file));

let failed = false;
for (const batch of [together, ...ALONE.map((file) => [file])]) {
  const { status } = spawnSync(
    process.execPath,
    [`--test-concurrency=${CONCURRENCY}`, "--test", ...batch],
    { stdio: "inherit" },
  );
  failed ||= status !== 0;
}
process.exitCode = failed ? 1 : 0;
