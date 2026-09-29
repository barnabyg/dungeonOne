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
const generated = fileURLToPath(
  new URL("../docs/acceptance/issue-60-samples/rescue.json", import.meta.url),
);

function run(input, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
  });
}

test("inn hints include every available exit before and after a rejected move", () => {
  const result = run(
    "search missing-person-notice\nmove chapel\nmove chapel-path\n",
    ["--adventure-file", chapel, "--seed", "0"],
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Exits: Ferry Landing, Chapel Path/);
  assert.match(result.stdout, /Try: .*move ferry-landing; move chapel-path/);
  assert.match(result.stdout, /Action unavailable: invisible-target/);
  assert.match(result.stdout, /Chapel Path\n/);
  assert.equal(
    (result.stdout.match(/move ferry-landing; move chapel-path/g) ?? []).length,
    2,
  );
});

test("evidence, item, and actor changes remain authoritative through restart and revisit", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-63-"));
  try {
    const savePath = join(directory, "journey.json");
    const first = run(
      "search missing-person notice\nsearch missing-person notice\nmove chapel-path\ntake healing-potion\ntake healing-potion\nmove ruined-chapel\nsearch damaged-repair-record\nmove chapel-path\n",
      ["--adventure-file", chapel, "--seed", "0", "--save", savePath],
    );
    assert.equal(first.status, 0, first.stderr);
    const saved = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(saved.formatVersion, 3);
    assert.equal(saved.transitions.length, 6);
    assert.deepEqual(
      saved.transitions[0].domainEvents.map(({ type }) => type),
      ["search-performed", "discovery-granted", "milestone-recorded"],
    );
    assert.deepEqual(saved.transitions[2].domainEvents, [
      {
        type: "item-transferred",
        actionId: "action-3",
        itemId: "healing-potion",
        from: "room",
        to: "inventory",
      },
    ]);
    assert.deepEqual(saved.transitions[3].domainEvents, [
      {
        type: "actor-relocated",
        actionId: "action-4",
        actorId: "player",
        from: "chapel-path",
        to: "ruined-chapel",
      },
    ]);
    assert.equal(saved.checkpoint.state.items["healing-potion"], "inventory");
    const second = run("journal\ninventory\nmove ruined-chapel\n", [
      "--resume",
      savePath,
    ]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Unsafe chapel repairs/);
    assert.match(second.stdout, /Inventory: healing potion/);
    assert.doesNotMatch(second.stdout, /Try: search damaged-repair-record/);
    assert.equal(
      JSON.parse(readFileSync(savePath, "utf8")).transitions.length,
      7,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("consumption and NPC relocation survive restart with no second item use", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-63-"));
  try {
    const savePath = join(directory, "rescue.json");
    const commands = [
      "search missing-person notice",
      "move chapel-path",
      "take healing-potion",
      "move ruined-chapel",
      "move crypt",
      "attack skeleton",
      "attack skeleton",
      "use healing-potion",
      "use healing-potion",
      "attack skeleton",
      "attack skeleton",
      "attack skeleton",
      "attack skeleton",
      "search diversion-ledger",
      "talk tavi crypt ask",
      "talk tavi rescue ask",
      "move ruined-chapel",
      "move chapel-path",
      "move inn",
    ];
    const first = run(`${commands.join("\n")}\n`, [
      "--adventure-file",
      chapel,
      "--seed",
      "0",
      "--save",
      savePath,
    ]);
    assert.equal(first.status, 0, first.stderr);
    const save = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(save.checkpoint.state.items["healing-potion"], "consumed");
    assert.equal(save.checkpoint.state.npcLocations.tavi, "inn");
    assert.equal(
      save.transitions
        .flatMap((entry) => entry.domainEvents)
        .filter((event) => event.type === "item-consumed").length,
      1,
    );
    assert.deepEqual(
      save.transitions
        .flatMap((entry) => entry.domainEvents)
        .filter(
          (event) =>
            event.type === "actor-relocated" && event.actorId === "tavi",
        )
        .map(({ from, to }) => [from, to]),
      [["crypt", "inn"]],
    );
    const resumed = run(
      "look\ninventory\njournal\nuse healing-potion\nmove chapel-path\nlook\ntake healing-potion\n",
      ["--resume", savePath],
    );
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /People: Mara, Tavi/);
    assert.match(resumed.stdout, /Inventory: empty/);
    assert.match(resumed.stdout, /tavi-rescued/);
    assert.match(resumed.stdout, /Action unavailable: invisible-target/);
    assert.match(resumed.stdout, /Items: none/);
    assert.doesNotMatch(resumed.stdout, /Try: take healing-potion/);
    assert.equal(
      JSON.parse(readFileSync(savePath, "utf8"))
        .transitions.flatMap((entry) => entry.domainEvents)
        .filter((event) => event.type === "item-consumed").length,
      1,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated schema-3 snapshots resume without new relationship or clock fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-63-"));
  try {
    const savePath = join(directory, "generated-save.json");
    const source = JSON.parse(readFileSync(generated, "utf8"));
    assert.equal(
      run("look\n", [
        "--adventure-file",
        generated,
        "--seed",
        "0",
        "--save",
        savePath,
      ]).status,
      0,
    );
    const save = JSON.parse(readFileSync(savePath, "utf8"));
    assert.deepEqual(save.content.snapshot, source);
    assert.equal(run("journal\n", ["--resume", savePath]).status, 0);
    const resumed = JSON.parse(readFileSync(savePath, "utf8"));
    assert.deepEqual(resumed.content.snapshot, source);
    assert.equal("relationships" in resumed.checkpoint.state, false);
    assert.equal("clock" in resumed.checkpoint.state, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tampered domain events, digests, size, duplicate keys, and tuples fail before play", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-63-"));
  try {
    const savePath = join(directory, "journey.json");
    assert.equal(
      run("search missing-person notice\n", [
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
    const mutate = (change) => {
      const save = JSON.parse(original);
      change(save);
      writeFileSync(savePath, JSON.stringify(save));
      const result = run("", ["--resume", savePath]);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout, /Resumed/);
    };
    mutate((save) => {
      save.transitions[0].domainEvents[1].discoveryId = "invented";
    });
    mutate((save) => {
      save.transitions[0].domainEvents.reverse();
    });
    mutate((save) => {
      save.transitions[0].stateDigest = "sha256:bad";
    });
    mutate((save) => {
      save.checkpoint.state.discoveries = [];
    });
    mutate((save) => {
      save.content.digest = "sha256:bad";
    });
    mutate((save) => {
      save.runtime.engineVersion = "unknown";
    });
    mutate((save) => {
      save.formatVersion = 1;
    });
    writeFileSync(
      savePath,
      original.replace(
        '"kind":"dungeon-one-save"',
        '"kind":"dungeon-one-save","kind":"dungeon-one-save"',
      ),
    );
    assert.notEqual(run("", ["--resume", savePath]).status, 0);
    writeFileSync(savePath, " ".repeat(16 * 1024 * 1024 + 1));
    assert.notEqual(run("", ["--resume", savePath]).status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("version-1 saves remain readable and upgrade after a new command", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-63-"));
  try {
    const savePath = join(directory, "legacy.json");
    assert.equal(
      run("move chapel-path\n", [
        "--adventure-file",
        chapel,
        "--seed",
        "0",
        "--save",
        savePath,
      ]).status,
      0,
    );
    const save = JSON.parse(readFileSync(savePath, "utf8"));
    save.formatVersion = 1;
    for (const transition of save.transitions) {
      delete transition.domainEvents;
      delete transition.randomState;
    }
    delete save.checkpoint.randomState;
    writeFileSync(savePath, JSON.stringify(save));
    const resumed = run("move inn\n", ["--resume", savePath]);
    assert.equal(resumed.status, 0, resumed.stderr);
    const upgraded = JSON.parse(readFileSync(savePath, "utf8"));
    assert.equal(upgraded.formatVersion, 3);
    assert.equal(
      upgraded.transitions[0].domainEvents[0].type,
      "actor-relocated",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
