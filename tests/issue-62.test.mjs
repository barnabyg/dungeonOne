import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
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
import { once } from "node:events";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const chapel = fileURLToPath(
  new URL("../adventures/chapel-clues.json", import.meta.url),
);

function run(input, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
  });
}

test("schema-3 command adventure resumes a committed move from embedded content", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-save-"));
  try {
    const source = join(directory, "adventure.json");
    const savePath = join(directory, "journey.json");
    writeFileSync(source, readFileSync(chapel));
    const first = run("look\nmove nowhere\nmove chapel path\n", [
      "--adventure-file",
      source,
      "--seed",
      "0",
      "--save",
      savePath,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Chapel Path/);
    const save = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(save.kind, "dungeon-one-save");
    assert.equal(save.formatVersion, 1);
    assert.equal(save.transitions.length, 1);
    assert.deepEqual(save.transitions[0].domainEvent, {
      type: "actor-relocated",
      actionId: "action-1",
      actionType: "move",
      locationId: "chapel-path",
    });
    assert.equal(save.transitions[0].randomPosition, 0);
    assert.equal(save.checkpoint.state.locationId, "chapel-path");
    renameSync(source, join(directory, "moved.json"));
    const second = run("", ["--resume", savePath]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(
      second.stdout,
      /Resumed chapel-clues at chapel-path; status: playing/,
    );
    assert.match(second.stdout, /take healing-potion/);
    assert.doesNotMatch(
      second.stdout,
      /Tavi is missing\. Begin at the village inn/,
    );
    const continued = run("move inn\n", ["--resume", savePath]);
    assert.equal(continued.status, 0, continued.stderr);
    assert.equal(
      JSON.parse(readFileSync(savePath, "utf8")).transitions.length,
      2,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tampered saves and trace/save mode confusion fail before play", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-save-"));
  try {
    const savePath = join(directory, "journey.json");
    const start = run("move chapel path\n", [
      "--adventure-file",
      chapel,
      "--seed",
      "0",
      "--save",
      savePath,
    ]);
    assert.equal(start.status, 0, start.stderr);
    const replay = run("", ["--replay", savePath]);
    assert.notEqual(replay.status, 0);
    const trace = join(directory, "trace.json");
    assert.equal(
      run("look\n", [
        "--adventure-file",
        chapel,
        "--seed",
        "0",
        "--trace",
        trace,
      ]).status,
      0,
    );
    assert.notEqual(run("", ["--resume", trace]).status, 0);
    const save = JSON.parse(readFileSync(savePath, "utf8"));
    save.checkpoint.state.locationId = "crypt";
    writeFileSync(savePath, JSON.stringify(save));
    const tampered = run("", ["--resume", savePath]);
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /checkpoint differs/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("quit closes the saved in-world session", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-save-"));
  try {
    const savePath = join(directory, "journey.json");
    const result = run("move chapel path\nquit\n", [
      "--adventure-file",
      chapel,
      "--seed",
      "0",
      "--save",
      savePath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    const save = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(save.checkpoint.status, "quit");
    assert.equal(save.transitions.length, 2);
    const resumed = run("", ["--resume", savePath]);
    assert.notEqual(resumed.status, 0);
    assert.match(resumed.stderr, /cannot resume gameplay/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  "failed atomic replacement reports the unsaved action and preserves the prior save",
  { skip: process.platform !== "win32" },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "dungeon-save-"));
    let lock;
    try {
      const savePath = join(directory, "journey.json");
      assert.equal(
        run("move chapel path\n", [
          "--adventure-file",
          chapel,
          "--seed",
          "0",
          "--save",
          savePath,
        ]).status,
        0,
      );
      const original = readFileSync(savePath, "utf8");
      lock = spawn(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "$file=[System.IO.File]::Open($env:SAVE_LOCK_PATH,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); [Console]::WriteLine('ready'); [Console]::ReadLine(); $file.Dispose()",
        ],
        {
          env: { ...process.env, SAVE_LOCK_PATH: savePath },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      await once(lock.stdout, "data");
      const failed = run("move inn\n", ["--resume", savePath]);
      assert.equal(failed.status, 1, `${failed.stderr} ${failed.signal ?? ""}`);
      assert.match(failed.stderr, /NOT SAVED/);
      lock.stdin.write("\n");
      await once(lock, "exit");
      lock = undefined;
      assert.equal(readFileSync(savePath, "utf8"), original);
      const resumed = run("", ["--resume", savePath]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.match(resumed.stdout, /Resumed chapel-clues at chapel-path/);
    } finally {
      lock?.kill();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
