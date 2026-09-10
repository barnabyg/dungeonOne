import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

function runCli(input) {
  return spawnSync(process.execPath, [cli], {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: 5_000,
  });
}

test("built game starts at the entrance, offers help, and quits cleanly", () => {
  const result = runCli("help\nquit\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /The Stolen Signet/i);
  assert.match(result.stdout, /entrance/i);
  assert.match(result.stdout, /type [\"']help[\"']/i);
  assert.match(result.stdout, /Available commands:[\s\S]*help[\s\S]*quit/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});

test("built game recovers from empty and unknown input", () => {
  const result = runCli("\ndance\nhelp\nquit\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /enter a command/i);
  assert.match(result.stdout, /don't understand [\"']dance[\"']/i);
  assert.match(result.stdout, /Available commands:/i);
});

test("built game exits cleanly on EOF without an outcome", () => {
  const result = runCli("");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /entrance/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});
