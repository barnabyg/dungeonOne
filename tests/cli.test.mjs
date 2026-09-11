import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { playGame } from "../dist/play.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const acceptanceInputs = path.join(root, "docs", "acceptance", "inputs");
const traceFixtures = path.join(root, "tests", "fixtures");
const winningAttacks = ["attack goblin", "attack goblin"];

function runCli(input, args = []) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: 5_000,
  });
}

function withTemporaryDirectory(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "dungeon-one-trace-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function createTerminalLines(inputs, readOutput) {
  let closed = false;
  const prompts = [];

  return {
    lines: {
      close() {
        closed = true;
      },
      prompt() {
        prompts.push(readOutput());
      },
      async *[Symbol.asyncIterator]() {
        for (const input of inputs) {
          if (closed) {
            return;
          }
          yield input;
        }
      },
    },
    prompts,
  };
}

test("built game prints one reproducible seed and rejects invalid startup seeds", () => {
  const seeded = runCli("quit\n", ["--seed", "4294967295"]);
  const generated = runCli("quit\n");
  const invalid = runCli("", ["--seed", "-1"]);

  assert.equal(seeded.status, 0, seeded.stderr);
  assert.equal(
    (seeded.stdout.match(/Seed: 4294967295 \(mulberry32-v1\)/g) ?? []).length,
    1,
  );
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(
    (generated.stdout.match(/Seed: \d+ \(mulberry32-v1\)/g) ?? []).length,
    1,
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /unsigned 32-bit integer/i);
  assert.doesNotMatch(invalid.stdout, /The Stolen Signet/i);
});

test("built game opens with the essential state and teaches canonical commands", () => {
  const result = runCli("help\nstatus\ninventory\nquit\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /The Stolen Signet/i);
  assert.match(
    result.stdout,
    /Objective:[^\n]+[\s\S]*Fighter HP:\s*20\/20[\s\S]*Entrance/i,
  );
  assert.match(result.stdout, /type [\"']help[\"']/i);
  assert.match(
    result.stdout,
    /Available commands:[\s\S]*look[\s\S]*inspect <target>[\s\S]*move <location>[\s\S]*open <target>[\s\S]*status[\s\S]*inventory[\s\S]*quit/i,
  );
  assert.match(result.stdout, /inspect ruined archway/i);
  assert.match(result.stdout, /move guardroom/i);
  assert.match(result.stdout, /open wooden door/i);
  assert.match(result.stdout, /take signet/i);
  assert.match(result.stdout, /attack goblin/i);
  assert.match(result.stdout, /commands are case-insensitive/i);
  assert.match(result.stdout, /cannot retreat during combat/i);
  assert.match(result.stdout, /entrance is not an escape/i);
  assert.match(result.stdout, /HP:\s*20\/20/i);
  assert.match(result.stdout, /Equipped:\s*longsword/i);
  assert.match(result.stdout, /Collectibles:\s*empty/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});

test("built game opens the entrance door, visits all rooms, and backtracks", () => {
  const result = runCli(
    [
      "look",
      "inspect ruined archway",
      "inspect guardroom",
      "move guardroom",
      "inspect wooden door",
      "open",
      "open ruined archway",
      "open wooden door",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "inspect entrance",
      "inspect wooden door",
      "inspect cold hearth",
      "move reliquary",
      "open wooden door",
      "look",
      "move guardroom",
      "move entrance",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Entrance[\s\S]*Visible features:[^\n]*ruined archway/i,
  );
  assert.match(result.stdout, /Exits:[^\n]*guardroom/i);
  assert.match(result.stdout, /crest of the old watch/i);
  assert.match(result.stdout, /wooden door to Guardroom is closed/i);
  assert.match(result.stdout, /closed wooden door leads to Guardroom/i);
  assert.match(result.stdout, /weathered iron straps[^\n]*closed/i);
  assert.match(result.stdout, /open wooden door/i);
  assert.match(result.stdout, /can't open the ruined archway/i);
  assert.match(result.stdout, /You open the wooden door/i);
  assert.match(result.stdout, /wooden door is already open/i);
  assert.match(result.stdout, /Guardroom[\s\S]*cold hearth/i);
  assert.match(result.stdout, /open wooden door leads to Entrance/i);
  assert.match(result.stdout, /weathered iron straps[^\n]*open/i);
  assert.match(result.stdout, /Reliquary[\s\S]*stone pedestal/i);
  assert.match(result.stdout, /can't see ["']wooden door["'] here/i);
  assert.match(result.stdout, /Exits:[^\n]*entrance[^\n]*reliquary/i);
  assert.match(result.stdout, /Guardroom[\s\S]*Entrance/i);
});

test("built game collects the signet once and keeps it inspectable in inventory", () => {
  const result = runCli(
    [
      "take signet",
      "take",
      "take gem",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "move reliquary",
      "inspect signet",
      "take signet",
      "look",
      "inventory",
      "move guardroom",
      "inspect signet",
      "take signet",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /can't see ["']signet["'] here/i);
  assert.match(result.stdout, /take signet/i);
  assert.match(result.stdout, /can't see ["']gem["'] here/i);
  assert.match(
    result.stdout,
    /Reliquary[\s\S]*Visible items:[^\n]*signet \(on stone pedestal\)/i,
  );
  assert.match(result.stdout, /silver signet[\s\S]*family crest/i);
  const afterPickup = result.stdout.split("You take the signet.")[1];
  assert.ok(afterPickup);
  assert.match(afterPickup, /Visible items:\s*none/i);
  assert.match(afterPickup, /Equipped:\s*longsword/i);
  assert.match(afterPickup, /Collectibles:\s*signet/i);
  assert.match(afterPickup, /silver signet[\s\S]*family crest/i);
  assert.match(afterPickup, /already carrying the signet/i);
});

test("built game recovers from malformed, invisible, and illegal commands", () => {
  const result = runCli(
    "\ndance\nlook around\ninspect\ninspect pedestal\nmove\nmove cellar\nmove reliquary\nlook\nquit\n",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /enter a command/i);
  assert.match(result.stdout, /don't understand [\"']dance[\"']/i);
  assert.match(result.stdout, /don't understand [\"']look around[\"']/i);
  assert.match(result.stdout, /inspect ruined archway/i);
  assert.match(result.stdout, /can't see [\"']pedestal[\"']/i);
  assert.match(result.stdout, /move guardroom/i);
  assert.match(result.stdout, /don't know a location named [\"']cellar[\"']/i);
  assert.match(result.stdout, /reliquary isn't adjacent/i);
  assert.match(result.stdout, /Entrance/i);
});

test("missing arguments recover with commands the player can copy", () => {
  const result = runCli("inspect\nmove\nopen\ntake\nattack\nquit\n");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /inspect ruined archway/i);
  assert.match(result.stdout, /move guardroom/i);
  assert.match(result.stdout, /open wooden door/i);
  assert.match(result.stdout, /take signet/i);
  assert.match(result.stdout, /attack goblin/i);
  assert.match(result.stdout, /You leave the adventure/i);
});

test("terminal play prompts after recoverable, combat, and final-state actions", async () => {
  let output = "";
  const terminal = createTerminalLines(
    [
      "move guardroom",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "move reliquary",
      "take signet",
      "leave",
      "status",
      "quit",
    ],
    () => output,
  );

  await playGame(
    { seed: 0 },
    {
      lines: terminal.lines,
      terminal: true,
      write(text) {
        output += text;
      },
    },
  );

  assert.equal(terminal.prompts.length, 10);
  assert.match(terminal.prompts[0], /Fighter HP:\s*20\/20[\s\S]*Entrance/i);
  assert.match(terminal.prompts[1], /door to Guardroom is closed/i);
  assert.match(terminal.prompts[3], /Turn: Fighter/i);
  assert.match(terminal.prompts[5], /Combat victory/i);
  assert.match(terminal.prompts[8], /Victory!/i);
  assert.match(terminal.prompts[9], /Session:\s*victory/i);
  assert.match(output, /You leave the adventure/i);
});

test("built game exits cleanly on EOF without an outcome", () => {
  const result = runCli("");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /entrance/i);
  assert.doesNotMatch(result.stdout, /victory|defeat/i);
});

test("built game requires the signet at the reliquary exit and ends explicitly", () => {
  const result = runCli(
    [
      "leave",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "move reliquary",
      "leave",
      "take signet",
      "leave",
      "move guardroom",
      "look",
      "status",
      "inventory",
      "help",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Objective: retrieve the stolen signet and leave through the reliquary's far exit/i,
  );
  assert.match(result.stdout, /must be in the reliquary/i);
  assert.match(result.stdout, /need the stolen signet/i);
  assert.match(result.stdout, /Victory![\s\S]*escaped through the far exit/i);
  assert.match(result.stdout, /enter ["']quit["'] to exit/i);
  assert.match(result.stdout, /start a fresh run with ["']npm start["']/i);
  assert.match(result.stdout, /adventure is over[\s\S]*can't change/i);
  assert.match(result.stdout, /Session:\s*victory/i);
  assert.match(result.stdout, /Collectibles:\s*signet/i);
  assert.match(result.stdout, /Available commands:/i);
  assert.equal((result.stdout.match(/^Victory!/gim) ?? []).length, 1);
});

test("seed 0 survives combat and rejected commands do not disturb its rolls", () => {
  const result = runCli(
    [
      "open wooden door",
      "move guardroom",
      "attack",
      "move reliquary",
      "status",
      "dance",
      ...winningAttacks,
      "status",
      "quit",
      "",
    ].join("\n"),
    ["--seed", "0"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /What do you want to attack/i);
  assert.match(result.stdout, /cannot do that during combat/i);
  assert.match(result.stdout, /don't understand ["']dance["']/i);
  assert.match(
    result.stdout,
    /Initiative — Fighter: d20 roll 6 \+ modifier 1 = 7[\s\S]*Initiative — goblin: d20 roll 1 \+ modifier 2 = 3[\s\S]*Attack roll: d20 5 \+ modifier 5 = 10 vs AC 13 — miss[\s\S]*Attack roll: d20 3 \+ modifier 4 = 7 vs AC 16 — miss[\s\S]*Attack roll: d20 10 \+ modifier 5 = 15 vs AC 13 — hit/i,
  );
  assert.match(result.stdout, /Damage: 8[\s\S]*Remaining HP: goblin 0\/7/i);
  assert.match(result.stdout, /Combat victory![\s\S]*Fighter HP: 20\/20/i);
});

test("returning to the guardroom identifies the defeated goblin", () => {
  const input = readFileSync(
    path.join(acceptanceInputs, "victory.txt"),
    "utf8",
  );
  const result = runCli(input, ["--seed", "0"]);

  assert.equal(result.status, 0, result.stderr);
  const afterReturn = result.stdout.split(
    "You move from Reliquary to Guardroom.",
  )[1];
  assert.ok(afterReturn);
  assert.match(afterReturn, /Defeated opponents:\s*goblin/i);
  assert.doesNotMatch(afterReturn, /Combat begins/i);
});

test("seed 207 gives the goblin initiative and defeats the fighter", () => {
  const result = runCli(
    [
      "open wooden door",
      "move guardroom",
      "attack goblin",
      "attack goblin",
      "attack goblin",
      "status",
      "move reliquary",
      "look",
      "help",
      "quit",
      "",
    ].join("\n"),
    ["--seed=207"],
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Seed: 207 \(mulberry32-v1\)/i);
  assert.match(
    result.stdout,
    /Initiative — Fighter: d20 roll 3 \+ modifier 1 = 4[\s\S]*Initiative — goblin: d20 roll 19 \+ modifier 2 = 21[\s\S]*Turn: goblin[\s\S]*goblin attacks Fighter with scimitar[\s\S]*Attack roll: d20 17 \+ modifier 4 = 21 vs AC 16 — hit[\s\S]*Damage: 7[\s\S]*Remaining HP: Fighter 13\/20/i,
  );
  assert.match(
    result.stdout,
    /Attack roll: d20 3 \+ modifier 5 = 8 vs AC 13 — miss[\s\S]*Attack roll: d20 19 \+ modifier 4 = 23 vs AC 16 — hit[\s\S]*Damage: 5[\s\S]*Attack roll: d20 6 \+ modifier 5 = 11 vs AC 13 — miss[\s\S]*Attack roll: d20 10 \+ modifier 4 = 14 vs AC 16 — miss[\s\S]*Attack roll: d20 19 \+ modifier 5 = 24 vs AC 13 — hit[\s\S]*Damage: 5[\s\S]*Attack roll: d20 15 \+ modifier 4 = 19 vs AC 16 — hit[\s\S]*Damage: 8/i,
  );
  assert.match(result.stdout, /Fighter HP: 0\/20[\s\S]*Session: defeat/i);
  assert.match(result.stdout, /Defeat! The fighter has fallen/i);
  assert.match(result.stdout, /enter ["']quit["'] to exit/i);
  assert.match(result.stdout, /start a fresh run with ["']npm start["']/i);
  assert.match(result.stdout, /adventure is over[\s\S]*can't change/i);
  assert.match(result.stdout, /Guardroom[\s\S]*Available commands:/i);
});

test("built CLI exports a complete winning trace without narration or timestamps", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "winning.json");
    const rawInputs = [
      "look",
      "dance",
      "open wooden door",
      "move guardroom",
      ...winningAttacks,
      "move reliquary",
      "take signet",
      "leave",
      "status",
      "move guardroom",
      "open wooden door",
      "take signet",
      "leave",
      "quit",
    ];
    const result = runCli(`${rawInputs.join("\n")}\n`, [
      "--trace",
      tracePath,
      "--seed",
      "0",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Trace exported to .+winning\.json/i);
    const traceText = readFileSync(tracePath, "utf8");
    const trace = JSON.parse(traceText);

    assert.equal(trace.formatVersion, 1);
    assert.equal(trace.rulesVersion, "stolen-signet-rules-v2");
    assert.deepEqual(trace.adventure, {
      id: "stolen-signet",
      version: "2",
    });
    assert.deepEqual(trace.random, {
      algorithm: "mulberry32-v1",
      initialSeed: 0,
    });
    assert.deepEqual(trace.completion, {
      reason: "quit",
      outcome: "victory",
    });
    assert.deepEqual(
      trace.actions.map((entry) => entry.rawInput),
      rawInputs,
    );
    assert.deepEqual(trace.actions[1].action, {
      type: "unknown",
      input: "dance",
    });
    assert.deepEqual(trace.actions[1].result, {
      type: "rejected",
      rejection: { reason: "unknown-command", input: "dance" },
    });

    const enteredCombat = trace.actions.find(
      (entry) => entry.rawInput === "move guardroom",
    );
    assert.deepEqual(enteredCombat.rolls, [
      { sides: 20, value: 6 },
      { sides: 20, value: 1 },
    ]);
    assert.equal(
      enteredCombat.result.events.some(
        (event) => event.type === "combat-started",
      ),
      true,
    );
    assert.equal(enteredCombat.stateAfter.combat.currentTurn, "fighter");

    const terminalRead = trace.actions.find(
      (entry) => entry.rawInput === "status",
    );
    assert.equal(terminalRead.stateAfter.status, "victory");
    for (const entry of trace.actions.slice(-5, -1)) {
      assert.deepEqual(entry.rolls, []);
      assert.deepEqual(entry.result, {
        type: "rejected",
        rejection: { reason: "terminal-state", status: "victory" },
      });
      assert.equal(entry.stateAfter.status, "victory");
    }
    assert.equal(trace.actions.at(-1).stateAfter.status, "victory");
    assert.doesNotMatch(traceText, /Victory!|You move|timestamp|createdAt/i);
  });
});

test("built CLI exports defeat on EOF and keeps enemy actions within player entries", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "defeat.json");
    const inputs = [
      "open wooden door",
      "move guardroom",
      "look",
      "dance",
      "open wooden door",
      "move reliquary",
      "take signet",
      "leave",
      "attack goblin",
      "attack goblin",
      "attack goblin",
    ];
    const result = runCli(inputs.join("\n"), [
      "--seed=207",
      `--trace=${tracePath}`,
    ]);

    assert.equal(result.status, 0, result.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.deepEqual(trace.completion, {
      reason: "eof",
      outcome: "defeat",
    });
    assert.equal(trace.actions.length, inputs.length);
    assert.equal(
      trace.actions.some((entry) => entry.action.type === "goblin-turn"),
      false,
    );
    for (const entry of trace.actions.slice(2, 8)) {
      assert.deepEqual(entry.rolls, []);
      assert.deepEqual(entry.stateAfter, trace.actions[1].stateAfter);
    }
    assert.deepEqual(trace.actions[3].result, {
      type: "rejected",
      rejection: { reason: "unknown-command", input: "dance" },
    });
    for (const entry of trace.actions.slice(4, 8)) {
      assert.deepEqual(entry.result, {
        type: "rejected",
        rejection: { reason: "combat-restriction" },
      });
    }
    assert.equal(trace.actions.at(-1).stateAfter.status, "defeat");
    assert.equal(
      trace.actions
        .at(-1)
        .result.events.some(
          (event) =>
            event.type === "attack-resolved" && event.attackerId === "goblin",
        ),
      true,
    );
  });
});

test("trace write failures are clear and do not alter the gameplay outcome", () => {
  withTemporaryDirectory((directory) => {
    const result = runCli(
      "open wooden door\nmove guardroom\nattack goblin\nattack goblin\nmove reliquary\ntake signet\nleave\nquit\n",
      ["--seed", "0", "--trace", directory],
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Victory!/i);
    assert.doesNotMatch(result.stdout, /Trace exported/i);
    assert.match(result.stderr, /Unable to write session trace/i);
  });
});

test("built CLI verifies exported victory, defeat, and voluntary early-exit traces", () => {
  withTemporaryDirectory((directory) => {
    const runs = [
      {
        name: "victory",
        seed: "0",
        input: readFileSync(path.join(acceptanceInputs, "victory.txt"), "utf8"),
      },
      {
        name: "defeat",
        seed: "207",
        input: readFileSync(path.join(acceptanceInputs, "defeat.txt"), "utf8"),
      },
      {
        name: "early-exit",
        seed: "123",
        input: "look\ndance\nstatus\nquit\n",
      },
    ];

    for (const run of runs) {
      const tracePath = path.join(directory, `${run.name}.json`);
      const exported = runCli(run.input, [
        "--seed",
        run.seed,
        "--trace",
        tracePath,
      ]);
      const replayed = runCli("", ["--replay", tracePath]);

      assert.equal(exported.status, 0, exported.stderr);
      assert.equal(replayed.status, 0, replayed.stderr);
      assert.match(replayed.stdout, /Trace verified successfully/i);
      assert.doesNotMatch(replayed.stdout, /The Stolen Signet|Seed:/i);
    }
  });
});

test("built CLI replays the historical format-1 command rejection fixture", () => {
  const result = runCli("", [
    "--replay",
    path.join(traceFixtures, "format-1-command-rejections.json"),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Trace verified successfully/i);
});

test("built CLI inspects a living and defeated goblin and replays the new trace", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "goblin-inspection.json");
    const inputs = [
      "inspect goblin",
      "open wooden door",
      "move guardroom",
      "inspect goblin",
      ...winningAttacks,
      "inspect goblin",
      "quit",
    ];
    const exported = runCli(`${inputs.join("\n")}\n`, [
      "--seed",
      "0",
      "--trace",
      tracePath,
    ]);

    assert.equal(exported.status, 0, exported.stderr);
    assert.match(exported.stdout, /can't see ["']goblin["'] here/i);
    assert.match(
      exported.stdout,
      /wiry goblin in battered leather[^\n]*Condition: living/i,
    );
    assert.match(
      exported.stdout,
      /Combat victory![\s\S]*wiry goblin in battered leather[^\n]*Condition: defeated/i,
    );

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.formatVersion, 1);
    assert.equal(trace.rulesVersion, "stolen-signet-rules-v2");
    assert.deepEqual(trace.adventure, {
      id: "stolen-signet",
      version: "2",
    });
    for (const index of [0, 3, 6]) {
      assert.deepEqual(trace.actions[index].rolls, []);
      if (index > 0) {
        assert.deepEqual(
          trace.actions[index].stateAfter,
          trace.actions[index - 1].stateAfter,
        );
      }
    }
    const attacks = trace.actions
      .flatMap((entry) => entry.result.events ?? [])
      .filter((event) => event.type === "attack-resolved");
    assert.deepEqual(
      attacks.map(({ attackerId, attackRoll, damage, targetHp }) => ({
        attackerId,
        attackRoll,
        damage: damage ?? 0,
        targetHp,
      })),
      [
        { attackerId: "fighter", attackRoll: 5, damage: 0, targetHp: 7 },
        { attackerId: "goblin", attackRoll: 3, damage: 0, targetHp: 20 },
        { attackerId: "fighter", attackRoll: 10, damage: 8, targetHp: 0 },
      ],
    );

    const replayed = runCli("", ["--replay", tracePath]);
    assert.equal(replayed.status, 0, replayed.stderr);
    assert.match(replayed.stdout, /Trace verified successfully/i);

    const legacyPath = path.join(directory, "legacy-goblin-rejection.json");
    const legacyTrace = structuredClone(trace);
    legacyTrace.rulesVersion = "stolen-signet-rules-v1";
    legacyTrace.adventure.version = "1";
    for (const index of [3, 6]) {
      legacyTrace.actions[index].result = {
        type: "rejected",
        rejection: { reason: "invisible-target", target: "goblin" },
      };
    }
    writeFileSync(legacyPath, JSON.stringify(legacyTrace));

    const legacyReplay = runCli("", ["--replay", legacyPath]);
    assert.equal(legacyReplay.status, 0, legacyReplay.stderr);
    assert.match(legacyReplay.stdout, /Trace verified successfully/i);
  });
});

test("built CLI reports the first corrupted replay expectation", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "corrupted.json");
    const exported = runCli(
      "open wooden door\nmove guardroom\nattack goblin\nquit\n",
      ["--seed", "0", "--trace", tracePath],
    );
    assert.equal(exported.status, 0, exported.stderr);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    trace.actions[1].rolls[0].value = 20;
    writeFileSync(tracePath, `${JSON.stringify(trace, undefined, 2)}\n`);

    const replayed = runCli("", [`--replay=${tracePath}`]);

    assert.equal(replayed.status, 1);
    assert.match(replayed.stderr, /action 2.*rolls/i);
    assert.match(replayed.stderr, /expected[\s\S]*20/i);
    assert.match(replayed.stderr, /actual[\s\S]*6/i);
    assert.doesNotMatch(replayed.stdout, /verified successfully/i);
  });
});

test("built CLI rejects malformed, unsupported, and structurally invalid traces", () => {
  withTemporaryDirectory((directory) => {
    const malformedPath = path.join(directory, "malformed.json");
    writeFileSync(malformedPath, "{not json");
    const malformed = runCli("", ["--replay", malformedPath]);
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /invalid JSON/i);

    const supportedHeader = {
      formatVersion: 1,
      rulesVersion: "stolen-signet-rules-v1",
      adventure: { id: "stolen-signet", version: "1" },
      random: { algorithm: "mulberry32-v1", initialSeed: 0 },
      initialState: {},
      actions: [],
      completion: { reason: "eof", outcome: "incomplete" },
    };
    const unsupportedCases = [
      {
        name: "format",
        trace: { ...supportedHeader, formatVersion: 2 },
        error: /unsupported trace format version 2/i,
      },
      {
        name: "rules",
        trace: { ...supportedHeader, rulesVersion: "future-rules" },
        error: /unsupported rules version "future-rules"/i,
      },
      {
        name: "adventure",
        trace: {
          ...supportedHeader,
          adventure: { id: "stolen-signet", version: "2" },
        },
        error: /unsupported adventure version "2"/i,
      },
      {
        name: "random",
        trace: {
          ...supportedHeader,
          random: { algorithm: "future-rng", initialSeed: 0 },
        },
        error: /unsupported random algorithm "future-rng"/i,
      },
    ];
    for (const unsupportedCase of unsupportedCases) {
      const unsupportedPath = path.join(
        directory,
        `${unsupportedCase.name}.json`,
      );
      writeFileSync(unsupportedPath, JSON.stringify(unsupportedCase.trace));
      const unsupported = runCli("", ["--replay", unsupportedPath]);
      assert.equal(unsupported.status, 1);
      assert.match(unsupported.stderr, unsupportedCase.error);
    }

    const invalidPath = path.join(directory, "invalid.json");
    const exported = runCli("look\n", ["--seed", "0", "--trace", invalidPath]);
    assert.equal(exported.status, 0, exported.stderr);
    const invalidTrace = JSON.parse(readFileSync(invalidPath, "utf8"));
    invalidTrace.actions[0].rawInput = 42;
    writeFileSync(invalidPath, JSON.stringify(invalidTrace));
    const invalid = runCli("", ["--replay", invalidPath]);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /actions\[0\]\.rawInput must be a string/i);
  });
});

test("built CLI detects corrupted read-only and invalid-input records", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "non-mutating.json");
    const exported = runCli("look\ndance\nstatus\nquit\n", [
      "--seed",
      "0",
      "--trace",
      tracePath,
    ]);
    assert.equal(exported.status, 0, exported.stderr);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    trace.actions[1].result.rejection.input = "sing";
    writeFileSync(tracePath, JSON.stringify(trace));
    const replayed = runCli("", ["--replay", tracePath]);

    assert.equal(replayed.status, 1);
    assert.match(replayed.stderr, /action 2.*result/i);
    assert.match(replayed.stderr, /dance/i);
    assert.match(replayed.stderr, /sing/i);
  });
});

test("built CLI validates nested trace records before replay", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "nested-invalid.json");
    const exported = runCli("open wooden door\nquit\n", [
      "--seed",
      "0",
      "--trace",
      tracePath,
    ]);
    assert.equal(exported.status, 0, exported.stderr);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    trace.actions[0].result.events[0] = null;
    writeFileSync(tracePath, JSON.stringify(trace));

    const replayed = runCli("", ["--replay", tracePath]);
    assert.equal(replayed.status, 1);
    assert.match(
      replayed.stderr,
      /actions\[0\]\.result\.events\[0\] must be an object/i,
    );
    assert.doesNotMatch(replayed.stderr, /Replay divergence/i);
  });
});

test("built CLI gives expected and actual details for records after quit", () => {
  withTemporaryDirectory((directory) => {
    const tracePath = path.join(directory, "after-quit.json");
    const exported = runCli("look\nquit\n", [
      "--seed",
      "0",
      "--trace",
      tracePath,
    ]);
    assert.equal(exported.status, 0, exported.stderr);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    trace.actions.push({ ...trace.actions[0], sequence: 3 });
    writeFileSync(tracePath, JSON.stringify(trace));

    const replayed = runCli("", ["--replay", tracePath]);
    assert.equal(replayed.status, 1);
    assert.match(replayed.stderr, /action 3/i);
    assert.match(replayed.stderr, /Expected:[\s\S]*look/i);
    assert.match(replayed.stderr, /Actual:[\s\S]*session ended/i);
  });
});

test("built CLI validates format-1 literals and required state records", () => {
  withTemporaryDirectory((directory) => {
    const sourcePath = path.join(directory, "source.json");
    const exported = runCli("look\nmove reliquary\nquit\n", [
      "--seed",
      "0",
      "--trace",
      sourcePath,
    ]);
    assert.equal(exported.status, 0, exported.stderr);
    const source = JSON.parse(readFileSync(sourcePath, "utf8"));

    const invalidCases = [
      {
        name: "status",
        mutate(trace) {
          trace.initialState.status = "bogus";
        },
        error: /initialState\.status must be one of.*playing/i,
      },
      {
        name: "opponent",
        mutate(trace) {
          delete trace.initialState.opponents.goblin;
        },
        error: /initialState\.opponents\.goblin must be an object/i,
      },
      {
        name: "unknown-opponent",
        mutate(trace) {
          trace.initialState.opponents.dragon = { hp: 1, maxHp: 1 };
        },
        error:
          /initialState\.opponents contains unsupported identifier dragon/i,
      },
      {
        name: "event-room",
        mutate(trace) {
          trace.actions[0].result.events[0].roomId = "moon";
        },
        error: /actions\[0\]\.result\.events\[0\]\.roomId must be one of/i,
      },
      {
        name: "rejection-room",
        mutate(trace) {
          trace.actions[1].result.rejection.destinationId = "moon";
        },
        error: /actions\[1\]\.result\.rejection\.destinationId must be one of/i,
      },
    ];

    for (const invalidCase of invalidCases) {
      const trace = structuredClone(source);
      invalidCase.mutate(trace);
      const tracePath = path.join(directory, `${invalidCase.name}.json`);
      writeFileSync(tracePath, JSON.stringify(trace));
      const replayed = runCli("", ["--replay", tracePath]);
      assert.equal(replayed.status, 1);
      assert.match(replayed.stderr, invalidCase.error);
      assert.doesNotMatch(replayed.stderr, /Replay divergence/i);
    }
  });
});
