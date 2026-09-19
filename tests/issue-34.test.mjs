import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { playGame } from "../dist/play.js";
import { resolveAdventure } from "../dist/runtime.js";

function runChapel(input, extraArgs = []) {
  const environment = { ...process.env };
  delete environment.DUNGEON_ONE_TEST_DM_SCRIPT;
  return spawnSync(
    process.execPath,
    ["dist/cli.js", "--adventure", "chapel", "--seed", "0", ...extraArgs],
    {
      encoding: "utf8",
      input,
      env: environment,
    },
  );
}

test("chapel prints a compact authoritative state line at startup and after accepted actions", () => {
  const played = runChapel(
    [
      "talk mara tavi ask",
      "move chapel-path",
      "take potion",
      "move ruined-chapel",
      "move crypt",
      "quit",
      "",
    ].join("\n"),
  );

  assert.equal(played.status, 0, played.stderr);
  const summaries = played.stdout.match(/^State — .*$/gmu) ?? [];
  assert.equal(summaries.length, 6);
  assert.match(
    summaries[0],
    /HP 20\/20 \| Potion: not collected \| Combat: none \| Quest: Find Tavi \(active; 0 discoveries\)/u,
  );
  assert.match(summaries[3], /Potion: available/u);
  assert.match(summaries[5], /Combat: (Fighter|skeleton guardian)'s turn/u);
  assert.doesNotMatch(
    summaries.join("\n"),
    /equipment|milestones|known leads/iu,
  );
});

test("chapel offers copyable public commands without leaking later discoveries", () => {
  const played = runChapel(
    [
      "help",
      "move ferry-landing",
      "help",
      "move inn",
      "move chapel-path",
      "help",
      "take potion",
      "help",
      "quit",
      "",
    ].join("\n"),
  );

  assert.equal(played.status, 0, played.stderr);
  assert.match(played.stdout, /search missing-person notice/u);
  assert.match(played.stdout, /talk mara tavi ask/u);
  assert.match(played.stdout, /talk oren repairs ask/u);
  assert.match(played.stdout, /talk oren repairs persuade/u);
  assert.match(played.stdout, /talk oren repairs deceive/u);
  assert.match(played.stdout, /talk oren repairs intimidate/u);
  assert.match(played.stdout, /take healing potion/u);
  assert.match(played.stdout, /use potion/u);
  assert.match(
    played.stdout,
    /Chapel Path[\s\S]*?Try: take healing potion\.\nState —/u,
  );
  assert.doesNotMatch(
    played.stdout,
    /search diversion ledger|talk tavi rescue|resolve public disclosure|resolve confidential referral/iu,
  );
});

test("chapel labels discoveries as journal updates while preserving attributed dialogue", () => {
  const played = runChapel(
    "talk mara tavi ask\ntalk mara tavi ask\nsearch missing-person notice\nquit\n",
  );

  assert.equal(played.status, 0, played.stderr);
  assert.match(played.stdout, /^Mara:/mu);
  assert.match(
    played.stdout,
    /Journal update — Mara's account of Tavi's disappearance:/u,
  );
  assert.match(played.stdout, /Journal update — Mara's ferry lead:/u);
  assert.match(played.stdout, /Journal update — The chapel route:/u);
  assert.equal(
    (played.stdout.match(/Journal update — Mara'/gu) ?? []).length,
    2,
  );
});

test("chapel clears the active combat turn when lethal retaliation ends the session", () => {
  const played = spawnSync(
    process.execPath,
    ["dist/cli.js", "--adventure", "chapel", "--seed", "74"],
    {
      encoding: "utf8",
      input:
        "move chapel-path\nmove ruined-chapel\nmove crypt\nattack skeleton\nattack skeleton\nquit\n",
    },
  );

  assert.equal(played.status, 0, played.stderr);
  assert.match(
    played.stdout,
    /State — HP 0\/20 \| Potion: not collected \| Combat: none \| Quest: Find Tavi \(active; 0 discoveries\)/u,
  );
});

test("provider failure leaves every exact local control usable and replay-validated", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "issue-34-recovery-"));
  try {
    const scriptPath = path.join(directory, "script.json");
    const tracePath = path.join(directory, "trace.json");
    writeFileSync(
      scriptPath,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "search-notice",
              name: "search",
              argumentsJson: '{"target":"missing-person-notice"}',
            },
          ],
        },
      ]),
    );
    const environment = {
      ...process.env,
      DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath,
    };
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "0",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input:
          "Search the missing-person notice.\njournal\nstatus\ninventory\nhelp\nquit\n",
        env: environment,
      },
    );

    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Journal[\s\S]*The chapel route/u);
    assert.match(played.stdout, /Fighter HP: 20\/20/u);
    assert.match(played.stdout, /Equipped: longsword/u);
    assert.match(played.stdout, /Local commands:/u);
    const summaries = played.stdout.match(/^State — .*$/gmu) ?? [];
    assert.equal(summaries.length, 2);
    assert.match(summaries[1], /Quest: Find Tavi \(active; 1 discovery\)/u);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.deepEqual(
      trace.turns.map(({ kind }) => kind),
      [
        "dm",
        "local-journal",
        "local-status",
        "local-inventory",
        "local-help",
        "local-quit",
      ],
    );

    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      { encoding: "utf8" },
    );
    assert.equal(replayed.status, 0, replayed.stderr);

    trace.turns[2].rawPlayerInput = "status please";
    const invalidPath = path.join(directory, "invalid.json");
    writeFileSync(invalidPath, JSON.stringify(trace));
    const invalid = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", invalidPath],
      { encoding: "utf8" },
    );
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /local-status.*input/iu);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live AI help names the live mode without calling the provider", async () => {
  let output = "";
  let closed = false;
  let providerCalls = 0;
  const lines = {
    close() {
      closed = true;
    },
    prompt() {},
    async *[Symbol.asyncIterator]() {
      for (const line of ["help", "quit"]) {
        if (closed) {
          return;
        }
        yield line;
      }
    },
  };

  await playGame(
    {
      seed: 0,
      runtime: resolveAdventure("chapel"),
      dmModel: {
        identity: { provider: "openai", model: "test-model" },
        async respond() {
          providerCalls += 1;
          throw new Error("Local controls must not call the provider.");
        },
      },
    },
    {
      terminal: false,
      lines,
      write(text) {
        output += text;
      },
    },
  );

  assert.equal(providerCalls, 0);
  assert.match(output, /Live AI DM mode accepts ordinary language/u);
  assert.doesNotMatch(output, /Scripted DM mode accepts ordinary language/u);
});
