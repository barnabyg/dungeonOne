import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const chapel = fileURLToPath(
  new URL("../adventures/chapel-clues.json", import.meta.url),
);

function call(name, args, id) {
  return { toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }] };
}

function run(directory, savePath, input, responses, resume = false) {
  const script = join(directory, "script.json");
  writeFileSync(script, JSON.stringify(responses));
  return spawnSync(
    process.execPath,
    [
      cli,
      ...(resume
        ? ["--resume", savePath, "--ai"]
        : [
            "--adventure-file",
            chapel,
            "--seed",
            "0",
            "--save",
            savePath,
            "--ai",
          ]),
    ],
    {
      input: `${input.join("\n")}\n`,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        DUNGEON_ONE_TEST_DM_SCRIPT: script,
        OPENAI_API_KEY: "test-secret",
      },
    },
  );
}

function saved(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("scripted AI restart preserves committed attack, scene, and next dice after narration failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-65-"));
  try {
    const fullPath = join(directory, "full.json");
    const splitPath = join(directory, "split.json");
    const route = [
      [
        "search notice",
        call("search", { target: "missing-person-notice" }, "notice"),
      ],
      [
        "go to the chapel path",
        call("move", { destinationId: "chapel-path" }, "path"),
      ],
      [
        "take the potion",
        call("take", { item_id: "healing-potion" }, "potion"),
      ],
      [
        "enter the chapel",
        call("move", { destinationId: "ruined-chapel" }, "chapel"),
      ],
      ["enter the crypt", call("move", { destinationId: "crypt" }, "crypt")],
      [
        "attack the skeleton",
        call("attack", { opponent_id: "skeleton-guardian" }, "attack-one"),
      ],
      [
        "attack again",
        call("attack", { opponent_id: "skeleton-guardian" }, "attack-two"),
      ],
    ];
    const responses = (steps, narrateLast = true) =>
      steps.flatMap(([, tool], index) =>
        index === steps.length - 1 && !narrateLast
          ? [tool]
          : [tool, { text: "Done." }],
      );
    const full = run(
      directory,
      fullPath,
      route.map(([input]) => input),
      responses(route),
    );
    assert.equal(full.status, 0, full.stderr);
    const first = run(
      directory,
      splitPath,
      route.slice(0, -1).map(([input]) => input),
      responses(route.slice(0, -1), false),
    );
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /No further action was executed/);
    const middle = saved(splitPath);
    assert.equal(middle.transitions.length, 6);
    assert.equal(middle.transitions[5].action.type, "attack");
    assert.ok(middle.transitions[5].rolls.length > 0);
    const resumed = run(
      directory,
      splitPath,
      ["help", "status", "inventory", "journal", route.at(-1)[0]],
      responses(route.slice(-1)),
      true,
    );
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /Resumed chapel-clues at crypt/);
    assert.match(resumed.stdout, /Local commands:/);
    assert.match(resumed.stdout, /HP:/);
    assert.deepEqual(saved(splitPath).transitions, saved(fullPath).transitions);
    assert.deepEqual(saved(splitPath).checkpoint, saved(fullPath).checkpoint);
    assert.doesNotMatch(
      readFileSync(splitPath, "utf8"),
      /test-secret|Done\.|Dungeon Master|responseId|transcript/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("AI reads and failed or rejected turns add no save transition", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-65-"));
  try {
    const path = join(directory, "save.json");
    const result = run(
      directory,
      path,
      [
        "help",
        "status",
        "inventory",
        "journal",
        "what is in my journal?",
        "read everything repeatedly",
        "what?",
        "search nowhere",
        "search notice",
        "try again",
      ],
      [
        call("get_journal", {}, "read"),
        { text: "Your journal is open." },
        call("get_journal", {}, "read-1"),
        call("get_journal", {}, "read-2"),
        call("get_journal", {}, "read-3"),
        call("get_journal", {}, "read-4"),
        { text: "Which place?" },
        call("search", { target: "nowhere" }, "bad"),
        { text: "Unavailable." },
        call("search", { target: "missing-person-notice" }, "good"),
      ],
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(saved(path).transitions.length, 1);
    assert.equal(saved(path).checkpoint.randomPosition, 0);
    assert.match(result.stdout, /Which place\?/);
    assert.match(result.stdout, /Your journal is open/);
    assert.match(result.stdout, /No further action was executed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("completed save resumes in AI mode for local reads and reflection", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-65-"));
  try {
    const path = join(directory, "completed.json");
    const route = readFileSync(
      fileURLToPath(
        new URL(
          "../docs/acceptance/inputs/chapel-confidential.txt",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const completed = spawnSync(
      process.execPath,
      [cli, "--adventure-file", chapel, "--seed", "0", "--save", path],
      {
        input: route,
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(saved(path).checkpoint.status, "victory");
    const count = saved(path).transitions.length;
    const resumed = run(
      directory,
      path,
      ["help", "status", "inventory", "journal", "what happened?"],
      [{ text: "The investigation is complete." }],
      true,
    );
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /status: victory/);
    assert.match(resumed.stdout, /The investigation is complete/);
    assert.equal(saved(path).transitions.length, count);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
