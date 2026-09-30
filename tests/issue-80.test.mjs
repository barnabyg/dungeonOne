import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";

function game(name = "bribed-crossroads") {
  const loaded = loadAdventure(
    readFileSync(
      new URL(`../adventures/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

function act(runtime, state, input, rolls = [20, 1]) {
  let draws = 0;
  const result = runtime.handleAction(state, runtime.parseCommand(input), {
    roll: (sides) => Math.min(sides, rolls[draws++ % rolls.length]),
  });
  return { ...result, draws };
}

function setup(runtime, commands) {
  let state = runtime.createSession();
  for (const input of commands) {
    const result = act(runtime, state, input);
    assert.equal(
      result.rejection,
      undefined,
      `${input}: ${runtime.renderResult(result)}`,
    );
    state = result.state;
  }
  return state;
}

const matrix = [
  {
    category: "attack quest giver",
    setup: [],
    input: "attack lysa",
    effect: "combat",
    cost: 1,
    continuation: "move cellar",
  },
  {
    category: "refuse",
    setup: [],
    input: "resolve refuse-errand",
    effect: "ending",
    cost: 0,
    continuation: null,
  },
  {
    category: "leave town",
    setup: [],
    input: "resolve leave-town",
    effect: "ending",
    cost: 0,
    continuation: null,
  },
  {
    category: "burn stone hall",
    setup: [],
    input: "burn hall-masonry",
    effect: "reject",
    cost: 0,
    continuation: "move cellar",
  },
  {
    category: "deceive ally",
    setup: [],
    input: "attempt deceive lysa about neri safe route",
    effect: "deception",
    cost: 1,
    continuation: "move cellar",
  },
  {
    category: "wait days",
    setup: [],
    input: "wait days 3",
    effect: "clock",
    cost: 3,
    continuation: "move cellar",
  },
  {
    category: "unusual item use",
    setup: ["move cellar", "take tonic", "move square", "move hall"],
    input: "offer tonic to lysa",
    effect: "retained",
    cost: 1,
    continuation: "move cellar",
  },
  {
    category: "barricade",
    setup: ["move square"],
    input: "attempt barricade short passage with market cart",
    effect: "barricade",
    cost: 0,
    continuation: "move cellar",
  },
  {
    category: "distraction",
    setup: ["move cellar"],
    input: "attempt distract guard with heavy crate",
    effect: "distraction",
    cost: 1,
    continuation: "search route-register",
  },
  {
    category: "bribe",
    setup: ["move cellar", "take tonic"],
    input: "offer tonic to guard",
    effect: "spent",
    cost: 1,
    continuation: "search route-register",
  },
  {
    category: "stale target",
    setup: ["move square", "attempt barricade short passage with market cart"],
    input: "attempt barricade short passage with market cart",
    effect: "reject",
    cost: 0,
    continuation: "move cellar",
  },
  {
    category: "hidden target",
    setup: [],
    input: "offer tonic to guard",
    effect: "reject",
    cost: 0,
    continuation: "move cellar",
  },
  {
    category: "ambiguous target",
    setup: ["move square"],
    input: "attempt barricade",
    effect: "reject",
    cost: 0,
    continuation: "move cellar",
  },
  {
    category: "compound request",
    setup: ["move cellar"],
    input: "attempt distract guard with heavy crate then attack guard",
    effect: "reject",
    cost: 0,
    continuation: "search route-register",
  },
  {
    category: "dead actor",
    setup: [],
    dead: "lysa",
    input: "talk lysa request ask",
    effect: "reject",
    cost: 0,
    continuation: "move cellar",
  },
];

for (const sample of matrix) {
  test(`frozen ${sample.category} outcome, cost, and continuation`, () => {
    const runtime = game();
    const prepared = setup(runtime, sample.setup);
    const before =
      sample.dead === undefined
        ? prepared
        : {
            ...prepared,
            npcHealth: {
              ...prepared.npcHealth,
              [sample.dead]: { ...prepared.npcHealth[sample.dead], hp: 0 },
            },
            npcDeathLocations: {
              ...prepared.npcDeathLocations,
              [sample.dead]: prepared.locationId,
            },
          };
    const result = act(runtime, before, sample.input);
    const actualCost =
      result.state.clocks["raider-plan"] - before.clocks["raider-plan"];
    assert.equal(actualCost, sample.cost, sample.category);
    if (sample.effect === "reject") {
      assert.notEqual(result.rejection, undefined, sample.category);
      assert.deepEqual(result.state, before, sample.category);
      assert.equal(result.draws, 0, sample.category);
    } else {
      assert.equal(
        result.rejection,
        undefined,
        `${sample.category}: ${runtime.renderResult(result)}`,
      );
    }
    if (sample.effect === "ending") {
      assert.equal(result.state.ending.id, sample.input.split(" ")[1]);
      assert.doesNotMatch(
        runtime.renderResult(result),
        /register filed|Neri rescued/iu,
      );
    }
    if (sample.effect === "spent") {
      assert.equal(result.state.items["restorative-tonic"], "consumed");
    }
    if (sample.effect === "retained") {
      assert.equal(result.state.items["restorative-tonic"], "inventory");
      assert.equal(result.state.fighter.hp, before.fighter.hp);
    }
    if (sample.effect === "barricade") {
      assert.deepEqual(result.state.barricades, ["cart-short-passage"]);
    }
    if (sample.effect === "deception") {
      assert.equal(result.state.milestones.includes("neri-rescued"), false);
    }
    if (sample.effect === "combat") {
      assert.ok(
        result.events.some(({ operation }) => operation === "combat-started"),
      );
      assert.ok(result.state.npcHealth.lysa.hp < before.npcHealth.lysa.hp);
    }
    if (sample.effect === "clock") {
      assert.ok(result.state.milestones.includes("raiders-near"));
    }
    if (sample.effect === "distraction") {
      assert.equal(
        result.state.distractionChecks["crate-guard-door"].result,
        "success",
      );
    }
    if (sample.continuation) {
      let continued = result.state;
      if (sample.effect === "combat") {
        for (
          let turn = 0;
          turn < 8 && continued.npcHealth.lysa.hp > 0;
          turn += 1
        ) {
          const strike = act(runtime, continued, "attack lysa");
          assert.equal(strike.rejection, undefined);
          continued = strike.state;
        }
        assert.equal(continued.npcHealth.lysa.hp, 0);
        assert.match(
          runtime.renderResult(act(runtime, continued, "look")),
          /remains/iu,
        );
      }
      const next = act(runtime, continued, sample.continuation);
      assert.equal(
        next.rejection,
        undefined,
        `${sample.category} continuation: ${runtime.renderResult(next)}`,
      );
    }
  });
}

test("witness follow, lost trail, and late route remain playable", () => {
  const runtime = game("day-raider-crossroads");
  const witnessed = setup(runtime, [
    "move square",
    "move cellar",
    "wait days 1",
  ]);
  const followed = act(runtime, witnessed, "follow guard");
  assert.equal(followed.rejection, undefined);
  assert.equal(followed.state.locationId, "square");
  assert.equal(
    followed.state.clocks["raider-plan"] - witnessed.clocks["raider-plan"],
    1,
  );
  const stale = act(runtime, followed.state, "follow guard");
  assert.notEqual(stale.rejection, undefined);
  assert.deepEqual(stale.state, followed.state);
  const continued = act(runtime, followed.state, "move cellar");
  assert.equal(continued.rejection, undefined);
});

test("authoritative hints recover the four live refusal phrasings", () => {
  const runtime = game();
  const samples = [
    {
      setup: ["move square"],
      name: "adjudicate",
      args: {
        profileId: "cart-short-passage",
        targetId: "square-hall",
        resourceId: "market-cart",
        approach: "brace",
      },
      rejected:
        "Can you shove the market cart across the short passage? Do it.",
      retry: "attempt barricade square-hall with market-cart",
      next: "move cellar",
    },
    {
      setup: [],
      name: "deceive",
      args: { profileId: "lysa-neri-safe" },
      rejected:
        "Convince Lysa that Neri made it to the safe route, even though that is false.",
      retry: "attempt deceive lysa about neri-safe-route",
      next: "move cellar",
    },
    {
      setup: [],
      name: "deceive",
      args: { profileId: "lysa-neri-safe" },
      rejected: "Lie to Lysa and say Neri reached safety.",
      retry: "attempt deceive lysa about neri-safe-route",
      next: "move cellar",
    },
    {
      setup: ["move cellar"],
      name: "distract",
      args: { profileId: "crate-guard-door" },
      rejected: "Distract the guard with the heavy crate and then stab him.",
      retry: "attempt distract guard with heavy-crate",
      next: "search route-register",
    },
  ];
  for (const sample of samples) {
    const before = setup(runtime, sample.setup);
    const call = {
      name: sample.name,
      argumentsJson: JSON.stringify(sample.args),
    };
    const refused = runtime.dispatchGameTool(
      before,
      call,
      { roll: () => 20 },
      sample.rejected,
    );
    assert.equal(refused.modelOutput.ok, false, sample.rejected);
    assert.deepEqual(refused.state, before);
    const retry = runtime.dispatchGameTool(
      before,
      call,
      { roll: () => 20 },
      sample.retry,
    );
    assert.equal(retry.modelOutput.ok, true, sample.retry);
    const continuation = act(runtime, retry.state, sample.next);
    assert.equal(continuation.rejection, undefined, sample.next);
  }
});

test("seeded late journey has the same state, RNG, and events after a two-session resume", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-80-"));
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const adventure = fileURLToPath(
    new URL("../adventures/bribed-crossroads.json", import.meta.url),
  );
  const run = (input, args) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      input,
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, OPENAI_API_KEY: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const prefix = [
    "move cellar",
    "take tonic",
    "offer tonic to guard",
    "attempt distract guard with heavy crate",
    "search route-register",
  ];
  const suffix = [
    "move square",
    "wait days 1",
    "move back lane",
    "move hall",
    "resolve file-register",
  ];
  try {
    const wholeSave = join(directory, "whole-save.json");
    const splitSave = join(directory, "split-save.json");
    const wholeTrace = join(directory, "whole-trace.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const output = run(`${[...prefix, ...suffix].join("\n")}\n`, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      wholeSave,
      "--trace",
      wholeTrace,
    ]);
    assert.match(output, /Distraction check: d20 6 .* failure/u);
    assert.match(output, /report arrives after the deadline/u);
    run(`${prefix.join("\n")}\n`, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      splitSave,
      "--trace",
      first,
    ]);
    run(`${suffix.join("\n")}\n`, [
      "--resume",
      splitSave,
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    const whole = JSON.parse(readFileSync(wholeSave, "utf8"));
    const split = JSON.parse(readFileSync(splitSave, "utf8"));
    assert.deepEqual(split.checkpoint, whole.checkpoint);
    assert.deepEqual(split.transitions, whole.transitions);
    assert.equal(split.checkpoint.state.items["restorative-tonic"], "consumed");
    assert.ok(
      split.checkpoint.state.ending.consequences.includes("deadline-missed"),
    );
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/u,
    );
    assert.equal(JSON.parse(readFileSync(wholeTrace, "utf8")).formatVersion, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("scripted AI reaches the on-time ending across two sessions with equal replay state", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-80-ai-"));
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const adventure = fileURLToPath(
    new URL("../adventures/bribed-crossroads.json", import.meta.url),
  );
  const steps = [
    ["Go to the cellar", "move", { destinationId: "cellar" }],
    ["Search the route register", "search", { target: "route-register" }],
    ["Go to the square", "move", { destinationId: "square" }],
    ["Go to the hall", "move", { destinationId: "hall" }],
    ["File the register", "resolve_quest", { resolutionId: "file-register" }],
  ];
  const script = join(directory, "script.json");
  const run = (input, args) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      input,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        DUNGEON_ONE_TEST_DM_SCRIPT: script,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const play = (selected, args) => {
    writeFileSync(
      script,
      JSON.stringify(
        selected.flatMap(([, name, parameters], index) => [
          {
            toolCalls: [
              {
                id: `step-${index}`,
                name,
                argumentsJson: JSON.stringify(parameters),
              },
            ],
          },
          { text: "The authoritative mechanics are shown above." },
        ]),
      ),
    );
    return run(`${selected.map(([input]) => input).join("\n")}\n`, args);
  };
  try {
    const wholeSave = join(directory, "whole.json");
    const splitSave = join(directory, "split.json");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const whole = play(steps, [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--ai",
      "--save",
      wholeSave,
    ]);
    assert.match(whole, /before the raiders close the safe passage/u);
    play(steps.slice(0, 2), [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--ai",
      "--save",
      splitSave,
      "--trace",
      first,
    ]);
    const resumed = play(steps.slice(2), [
      "--resume",
      splitSave,
      "--ai",
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    assert.match(resumed, /before the raiders close the safe passage/u);
    const full = JSON.parse(readFileSync(wholeSave, "utf8"));
    const split = JSON.parse(readFileSync(splitSave, "utf8"));
    assert.deepEqual(split.checkpoint, full.checkpoint);
    assert.deepEqual(split.transitions, full.transitions);
    assert.ok(
      split.checkpoint.state.ending?.consequences.includes("deadline-met"),
      resumed,
    );
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/u,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
