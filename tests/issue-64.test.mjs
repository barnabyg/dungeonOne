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

function run(commands, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input: `${commands.join("\n")}\n`,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function saved(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function compareSplit(prefix, suffix, seed = 0) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-64-"));
  try {
    const fullPath = join(directory, "full.json");
    const splitPath = join(directory, "split.json");
    run(
      [...prefix, ...suffix],
      ["--adventure-file", chapel, "--seed", String(seed), "--save", fullPath],
    );
    run(prefix, [
      "--adventure-file",
      chapel,
      "--seed",
      String(seed),
      "--save",
      splitPath,
    ]);
    const middle = saved(splitPath);
    const resumed = run(suffix, ["--resume", splitPath]);
    const full = saved(fullPath);
    const split = saved(splitPath);
    assert.deepEqual(split.transitions, full.transitions);
    assert.deepEqual(split.checkpoint, full.checkpoint);
    assert.equal(split.checkpoint.randomState, full.checkpoint.randomState);
    assert.match(resumed.stdout, /Resumed chapel-clues/);
    return { middle, full, split, resumed };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("mid-combat and pre-healing restarts preserve dice, HP, items, and settled turns", () => {
  const route = [
    "search missing-person notice",
    "move chapel-path",
    "take healing-potion",
    "move ruined-chapel",
    "move crypt",
  ];
  const middle = compareSplit(route, ["attack skeleton", "attack skeleton"]);
  assert.ok(middle.middle.checkpoint.state.combat);
  assert.equal(middle.full.checkpoint.state.combat.currentTurn, "fighter");
  assert.deepEqual(
    middle.middle.transitions
      .at(-1)
      .domainEvents.slice(0, 4)
      .map(({ type }) => type),
    [
      "combat-started",
      "initiative-rolled",
      "initiative-rolled",
      "turn-started",
    ],
  );
  const settledRound = middle.full.transitions.find(
    (transition) =>
      transition.action.type === "attack" &&
      transition.domainEvents.filter(
        (event) => event.type === "attack-resolved",
      ).length === 2,
  );
  assert.ok(settledRound);
  assert.ok(
    settledRound.domainEvents.every(
      (event) => event.actionId === settledRound.actionId,
    ),
  );
  assert.ok(
    middle.full.transitions.every(
      (transition) =>
        transition.randomState !== undefined && transition.randomPosition >= 0,
    ),
  );
  const healed = compareSplit(
    [...route, "attack skeleton", "attack skeleton"],
    ["use healing-potion", "attack skeleton"],
  );
  assert.equal(
    healed.full.checkpoint.state.items["healing-potion"],
    "consumed",
  );
  assert.equal(
    healed.full.transitions
      .flatMap((transition) => transition.domainEvents)
      .filter((event) => event.type === "healing-item-used").length,
    1,
  );
  assert.equal(
    healed.full.transitions
      .flatMap((transition) => transition.domainEvents)
      .filter((event) => event.type === "item-consumed").length,
    1,
  );
});

test("failed one-attempt social check remains committed after a pre-check restart", () => {
  const prefix = ["move ferry-landing"];
  const { full, resumed } = compareSplit(prefix, [
    "talk oren repairs intimidate",
    "talk oren repairs persuade",
  ]);
  const check = full.checkpoint.state.socialChallenges["guarded-account"];
  assert.equal(check.result, "failure");
  assert.equal(check.approach, "intimidate");
  assert.equal(
    full.transitions
      .flatMap((transition) => transition.domainEvents)
      .filter((event) => event.type === "social-check-attempted").length,
    1,
  );
  assert.equal(full.transitions[1].rolls.length, 1);
  assert.equal(full.transitions[2].rolls.length, 0);
  assert.match(resumed.stdout, /Oren:/);
});

test("combat completion and death are durable once across a location revisit", () => {
  const route = [
    "search missing-person notice",
    "move chapel-path",
    "take healing-potion",
    "move ruined-chapel",
    "move crypt",
    ...Array(6).fill("attack skeleton"),
    "move ruined-chapel",
    "move crypt",
  ];
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-64-"));
  try {
    const path = join(directory, "fight.json");
    run(route, ["--adventure-file", chapel, "--seed", "0", "--save", path]);
    const first = saved(path);
    const events = first.transitions.flatMap(
      (transition) => transition.domainEvents,
    );
    assert.equal(
      events.filter((event) => event.type === "combat-ended").length,
      1,
    );
    assert.equal(
      events.filter(
        (event) =>
          event.type === "actor-defeated" &&
          event.actorId === "skeleton-guardian",
      ).length,
      1,
    );
    assert.equal(first.checkpoint.state.monsters["skeleton-guardian"].hp, 0);
    run(["look", "attack skeleton"], ["--resume", path]);
    const after = saved(path);
    assert.equal(after.checkpoint.state.monsters["skeleton-guardian"].hp, 0);
    assert.equal(
      after.transitions
        .flatMap((transition) => transition.domainEvents)
        .filter((event) => event.type === "combat-ended").length,
      1,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a defeated NPC keeps the death location after leaving and resuming", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-64-"));
  try {
    const path = join(directory, "casualty.json");
    run(
      ["attack mara", "attack mara", "move chapel-path"],
      ["--adventure-file", chapel, "--seed", "0", "--save", path],
    );
    const before = saved(path);
    assert.equal(before.checkpoint.state.npcHealth.mara.hp, 0);
    assert.equal(before.checkpoint.state.npcDeathLocations.mara, "inn");
    assert.equal(
      before.transitions
        .flatMap((transition) => transition.domainEvents)
        .filter(
          (event) =>
            event.type === "actor-defeated" && event.actorId === "mara",
        ).length,
      1,
    );
    run(["move inn", "attack mara"], ["--resume", path]);
    const after = saved(path);
    assert.equal(after.checkpoint.state.npcHealth.mara.hp, 0);
    assert.equal(after.checkpoint.state.npcDeathLocations.mara, "inn");
    assert.equal(
      after.transitions
        .flatMap((transition) => transition.domainEvents)
        .filter(
          (event) =>
            event.type === "actor-defeated" && event.actorId === "mara",
        ).length,
      1,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tampered random positions, states, rolls, and checkpoints report divergence", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-64-"));
  try {
    const path = join(directory, "fight.json");
    run(
      ["move chapel-path", "move ruined-chapel", "move crypt"],
      ["--adventure-file", chapel, "--seed", "0", "--save", path],
    );
    const original = saved(path);
    const alterations = [
      [
        (save) => {
          save.transitions.at(-1).randomPosition++;
        },
        /transition 3/,
      ],
      [
        (save) => {
          save.transitions.at(-1).randomState++;
        },
        /transition 3/,
      ],
      [
        (save) => {
          save.transitions.at(-1).rolls[0].value++;
        },
        /transition 3/,
      ],
      [
        (save) => {
          save.checkpoint.randomState++;
        },
        /checkpoint differs/,
      ],
      [
        (save) => {
          save.checkpoint.randomPosition++;
        },
        /checkpoint differs/,
      ],
      [
        (save) => {
          save.random.initialSeed = 1;
        },
        /transition 1/,
      ],
    ];
    for (const [change, message] of alterations) {
      const save = structuredClone(original);
      change(save);
      writeFileSync(path, JSON.stringify(save));
      const result = spawnSync(process.execPath, [cli, "--resume", path], {
        encoding: "utf8",
        timeout: 10000,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, message);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a version-2 save remains playable and upgrades after the next committed action", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-64-"));
  try {
    const path = join(directory, "journey.json");
    run(
      ["move chapel-path"],
      ["--adventure-file", chapel, "--seed", "0", "--save", path],
    );
    const previous = saved(path);
    previous.formatVersion = 2;
    delete previous.transitions[0].randomState;
    delete previous.checkpoint.randomState;
    writeFileSync(path, JSON.stringify(previous));
    run(["take healing-potion"], ["--resume", path]);
    const upgraded = saved(path);
    assert.equal(upgraded.formatVersion, 3);
    assert.equal(upgraded.transitions.length, 2);
    assert.equal(
      upgraded.checkpoint.state.items["healing-potion"],
      "inventory",
    );
    run(["look"], ["--resume", path]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
