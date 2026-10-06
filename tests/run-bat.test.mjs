// run.bat (#215): one-step install, build and launch on Windows. Each test
// copies the script into a scratch directory and puts a stub npm.cmd first on
// PATH, so the script's own control flow is checked without a real install.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const windowsOnly = {
  skip: process.platform !== "win32" && "run.bat is a Windows launcher",
};

const STUB_NPM = [
  "@echo off",
  'echo %CD%^|%*>>"%RUN_BAT_LOG%"',
  'if not "%RUN_BAT_FAIL%"=="" if "%~1"=="%RUN_BAT_FAIL%" exit /b 7',
  'if not "%RUN_BAT_FAIL%"=="" if "%~2"=="%RUN_BAT_FAIL%" exit /b 7',
  "exit /b 0",
  "",
].join("\r\n");

function setUp(t, { installed }) {
  const root = mkdtempSync(path.join(tmpdir(), "run-bat-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const game = path.join(root, "game");
  const stubs = path.join(root, "stubs");
  const elsewhere = path.join(root, "elsewhere");
  for (const directory of [game, stubs, elsewhere]) {
    mkdirSync(directory);
  }
  copyFileSync("run.bat", path.join(game, "run.bat"));
  if (installed) {
    mkdirSync(path.join(game, "node_modules"));
  }
  writeFileSync(path.join(stubs, "npm.cmd"), STUB_NPM);
  const log = path.join(root, "npm.log");
  writeFileSync(log, "");
  return { game, stubs, elsewhere, log };
}

function runBat({ game, stubs, elsewhere, log }, args, fail = "") {
  const result = spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", `""${path.join(game, "run.bat")}" ${args}"`],
    {
      cwd: elsewhere,
      encoding: "utf8",
      // stdin from NUL makes the on-failure pause return at once.
      stdio: ["ignore", "pipe", "pipe"],
      windowsVerbatimArguments: true,
      env: {
        ...process.env,
        PATH: `${stubs};${process.env.PATH}`,
        RUN_BAT_LOG: log,
        RUN_BAT_FAIL: fail,
      },
    },
  );
  const calls = readFileSync(log, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const [cwd, command] = line.split("|");
      return { cwd, command: command.trim() };
    });
  return { status: result.status, stdout: result.stdout, calls };
}

test(
  "a first run installs, builds, then launches with the arguments",
  windowsOnly,
  (t) => {
    const paths = setUp(t, { installed: false });
    const { status, calls } = runBat(
      paths,
      '--seed 0 --characters ".\\my games\\characters.json"',
    );
    assert.equal(status, 0);
    assert.deepEqual(
      calls.map((call) => call.command),
      [
        "install",
        "run build",
        'run browser -- --seed 0 --characters ".\\my games\\characters.json"',
      ],
    );
    // Every step runs from the script's directory, not the caller's.
    for (const call of calls) {
      assert.equal(call.cwd, paths.game);
    }
  },
);

test("a later run skips the install", windowsOnly, (t) => {
  const paths = setUp(t, { installed: true });
  const { status, calls } = runBat(paths, "--help");
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map((call) => call.command),
    ["run build", "run browser -- --help"],
  );
});

test(
  "a failed build stops before launch with its exit code",
  windowsOnly,
  (t) => {
    const paths = setUp(t, { installed: true });
    const { status, stdout, calls } = runBat(paths, "", "build");
    assert.equal(status, 7);
    assert.deepEqual(
      calls.map((call) => call.command),
      ["run build"],
    );
    assert.match(
      stdout,
      /run\.bat stopped: the step above failed with exit code 7/,
    );
  },
);

test("a failed install stops before the build", windowsOnly, (t) => {
  const paths = setUp(t, { installed: false });
  const { status, calls } = runBat(paths, "", "install");
  assert.equal(status, 7);
  assert.deepEqual(
    calls.map((call) => call.command),
    ["install"],
  );
});
