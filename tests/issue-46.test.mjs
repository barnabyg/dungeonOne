import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/chapel-clues.json";
const document = JSON.parse(readFileSync(source, "utf8"));
const run = (input, args, env = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
const temporary = (work) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-46-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

test("ledger evidence bypasses either social result without a second roll", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  for (const die of [1, 20]) {
    let state = runtime.createSession();
    state = runtime.handleAction(state, {
      type: "move",
      destination: "ferry landing",
    }).state;
    let draws = 0;
    const random = { roll: () => (draws++, die) };
    state = runtime.handleAction(
      state,
      { type: "talk", target: "oren", topic: "repairs", approach: "persuade" },
      random,
    ).state;
    const originalCheck = state.socialChallenges["guarded-account"];
    assert.equal(draws, 1);
    // Enter the crypt with seeded combat, then recover evidence without the repair record.
    for (const destination of [
      "inn",
      "chapel-path",
      "ruined-chapel",
      "crypt",
    ]) {
      state = runtime.handleAction(
        state,
        { type: "move", destination },
        createSeededRandom(0),
      ).state;
    }
    const combatRandom = createSeededRandom(0);
    for (
      let attempt = 0;
      state.monsters["skeleton-guardian"].hp > 0 && attempt < 10;
      attempt++
    ) {
      state = runtime.handleAction(
        state,
        { type: "attack", target: "skeleton" },
        combatRandom,
      ).state;
    }
    assert.equal(state.monsters["skeleton-guardian"].hp, 0);
    state = runtime.handleAction(state, {
      type: "search",
      target: "ledger",
    }).state;
    assert.deepEqual(state.discoveries.includes("unsafe-repairs"), false);
    for (const destination of [
      "ruined-chapel",
      "chapel-path",
      "inn",
      "ferry-landing",
    ]) {
      state = runtime.handleAction(state, { type: "move", destination }).state;
    }
    const response = runtime.handleAction(
      state,
      {
        type: "talk",
        target: "oren",
        topic: "repairs",
        approach: "intimidate",
      },
      random,
    );
    assert.equal(draws, 1);
    assert.equal(
      response.state.socialChallenges["guarded-account"],
      originalCheck,
    );
    assert.match(response.events[0].text, /ledger is conclusive/);
    assert.ok(response.state.discoveries.includes("oren-admission"));
  }
});

test("rescue relocates Tavi once and refreshes public guidance", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(JSON.stringify(document)).adventure,
  );
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  const forged = runtime.dispatchGameTool(
    state,
    {
      name: "talk",
      argumentsJson: JSON.stringify({
        speakerId: "tavi",
        topicId: "rescue",
        approach: "ask",
      }),
    },
    {
      roll: () => {
        throw Error("Unexpected draw");
      },
    },
  );
  assert.equal(forged.modelOutput.error.code, "unavailable-reference");
  for (const destination of ["chapel-path", "ruined-chapel", "crypt"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      random,
    ).state;
  }
  while (state.monsters["skeleton-guardian"].hp > 0) {
    state = runtime.handleAction(
      state,
      { type: "attack", target: "skeleton" },
      random,
    ).state;
  }
  state = runtime.handleAction(state, {
    type: "search",
    target: "ledger",
  }).state;
  state = runtime.handleAction(state, {
    type: "talk",
    target: "tavi",
    topic: "crypt",
    approach: "ask",
  }).state;
  const priorDiscoveries = state.discoveries;
  const rescued = runtime.handleAction(state, {
    type: "talk",
    target: "tavi",
    topic: "rescue",
    approach: "ask",
  });
  state = rescued.state;
  assert.equal(state.npcLocations.tavi, "inn");
  assert.ok(state.milestones.includes("tavi-rescued"));
  assert.deepEqual(state.discoveries, priorDiscoveries);
  assert.equal(
    runtime
      .projectDmScene(state)
      .journal.discoveries.find(({ id }) => id === "tavi-crypt-testimony")
      .source.locationId,
    "crypt",
  );
  assert.deepEqual(runtime.projectDmScene(state).room.npcs, []);
  for (const destination of ["ruined-chapel", "chapel-path", "inn"]) {
    state = runtime.handleAction(state, { type: "move", destination }).state;
  }
  const scene = runtime.projectDmScene(state);
  assert.deepEqual(
    scene.room.npcs.map(({ id }) => id),
    ["mara", "tavi"],
  );
  assert.match(scene.room.description, /Tavi rests safely/);
  assert.match(scene.room.features[0].description, /returned safely/);
  assert.ok(
    !JSON.stringify(scene.journal.actionableLeads).includes(
      "remains in the crypt",
    ),
  );
  const mara = runtime.handleAction(state, {
    type: "talk",
    target: "mara",
    topic: "tavi",
    approach: "ask",
  });
  assert.match(mara.events[0].text, /Tavi is safe here/);
  assert.deepEqual(
    mara.events[0].conversation.approvedFacts.map(({ id }) => id),
    ["tavi-rescued-fact"],
  );
  const again = runtime.handleAction(mara.state, {
    type: "talk",
    target: "tavi",
    topic: "rescue",
    approach: "ask",
  });
  assert.match(again.events[0].text, /already safe/);
  assert.deepEqual(again.state.milestones, mara.state.milestones);
  assert.equal(again.state.npcLocations.tavi, "inn");

  // A player can rescue first and still obtain Tavi's testimony at the inn.
  let later = runtime.createSession();
  const laterRandom = createSeededRandom(0);
  for (const destination of ["chapel-path", "ruined-chapel", "crypt"]) {
    later = runtime.handleAction(
      later,
      { type: "move", destination },
      laterRandom,
    ).state;
  }
  while (later.monsters["skeleton-guardian"].hp > 0) {
    later = runtime.handleAction(
      later,
      { type: "attack", target: "skeleton" },
      laterRandom,
    ).state;
  }
  later = runtime.handleAction(later, {
    type: "talk",
    target: "tavi",
    topic: "rescue",
    approach: "ask",
  }).state;
  for (const destination of ["ruined-chapel", "chapel-path", "inn"]) {
    later = runtime.handleAction(later, { type: "move", destination }).state;
  }
  later = runtime.handleAction(later, {
    type: "talk",
    target: "tavi",
    topic: "crypt",
    approach: "ask",
  }).state;
  assert.ok(later.discoveries.includes("tavi-crypt-testimony"));
  assert.equal(
    runtime
      .projectDmScene(later)
      .journal.discoveries.find(({ id }) => id === "tavi-crypt-testimony")
      .source.locationId,
    "inn",
  );
});

test("command and scripted AI rescue journeys replay, including provider recovery", () =>
  temporary((directory) => {
    const commandTrace = join(directory, "command.json");
    const actions = [
      "move chapel path",
      "move ruined chapel",
      "move crypt",
      "attack skeleton",
      "attack skeleton",
      "attack skeleton",
      "search ledger",
      "talk tavi crypt ask",
      "talk tavi rescue ask",
      "move ruined chapel",
      "move chapel path",
      "move inn",
      "talk mara tavi ask",
      "look",
      "journal",
      "quit",
    ];
    const command = run(`${actions.join("\n")}\n`, [
      "--adventure-file",
      source,
      "--seed",
      "0",
      "--trace",
      commandTrace,
    ]);
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /Tavi is safe here at the inn/);
    const trace = JSON.parse(readFileSync(commandTrace, "utf8"));
    assert.equal(trace.actions.at(-4).stateAfter.npcLocations.tavi, "inn");
    assert.equal(run("", ["--replay", commandTrace]).status, 0);

    const failedSocialTrace = join(directory, "failed-social.json");
    const failedSocial = run(
      [
        "move ferry landing",
        "talk oren repairs persuade",
        "move inn",
        ...actions.slice(0, -1),
        "move ferry landing",
        "talk oren repairs ask",
        "quit",
      ].join("\n") + "\n",
      ["--adventure-file", source, "--seed", "0", "--trace", failedSocialTrace],
    );
    assert.equal(failedSocial.status, 0, failedSocial.stderr);
    const failedTrace = JSON.parse(readFileSync(failedSocialTrace, "utf8"));
    assert.equal(
      failedTrace.actions[1].stateAfter.socialChallenges["guarded-account"]
        .result,
      "failure",
    );
    assert.match(failedSocial.stdout, /ledger is conclusive/);
    assert.deepEqual(
      failedTrace.actions.at(-2).stateAfter.socialChallenges,
      failedTrace.actions[1].stateAfter.socialChallenges,
    );
    assert.equal(run("", ["--replay", failedSocialTrace]).status, 0);

    const calls = [
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "crypt" }],
      ...Array.from({ length: 3 }, () => [
        "attack",
        { opponent_id: "skeleton-guardian" },
      ]),
      ["search", { target: "diversion-ledger" }],
      ["talk", { speakerId: "tavi", topicId: "rescue", approach: "ask" }],
    ];
    const script = join(directory, "script.json");
    writeFileSync(
      script,
      JSON.stringify(
        calls.flatMap(([name, args], index) => [
          {
            toolCalls: [
              {
                id: `call-${index}`,
                name,
                argumentsJson: JSON.stringify(args),
              },
            ],
          },
          ...(index === calls.length - 1 ? [] : [{ text: "Continue." }]),
        ]),
      ),
    );
    const aiTrace = join(directory, "ai.json");
    const ai = run(
      `${calls.map(() => "Continue").join("\n")}\njournal\nquit\n`,
      ["--adventure-file", source, "--ai", "--seed", "0", "--trace", aiTrace],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(ai.status, 0, ai.stderr);
    const aiData = JSON.parse(readFileSync(aiTrace, "utf8"));
    assert.equal(aiData.turns.at(-1).stateAfter.npcLocations.tavi, "inn");
    assert.equal(aiData.turns[7].diagnostics[0].code, "model-failure");
    assert.equal(run("", ["--replay", aiTrace]).status, 0);
  }));

test("validation rejects relocation to unknown places or another speaker", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const mutate = (change) => {
    const variant = structuredClone(document);
    change(variant);
    return loadAdventure(JSON.stringify(variant)).diagnostics;
  };
  assert.ok(
    mutate((variant) => {
      variant.npcs[2].topics[1].replies[1].effects[0].toLocationId = "missing";
    }).some(({ code }) => code === "unknown-reference"),
  );
  assert.ok(
    mutate((variant) => {
      variant.npcs[2].topics[1].replies[1].effects[0].id = "mara";
    }).some(({ code }) => code === "invalid-relocation"),
  );
  assert.ok(
    mutate((variant) => {
      variant.socialChallenges[0].evidenceAlternatives = [[]];
    }).some(({ code }) => code === "invalid-evidence"),
  );
  assert.ok(
    mutate((variant) => {
      variant.locations = [];
    }).some(({ code }) => code === "collection-limit"),
  );
});

test("previous chapel format-4 engine traces remain replayable", () =>
  temporary((directory) => {
    const previous = structuredClone(document);
    previous.contentVersion = "2";
    previous.rulesVersion = "chapel-clues-rules-v1";
    for (const location of previous.locations) {
      delete location.descriptions;
    }
    for (const feature of previous.features) {
      delete feature.descriptions;
    }
    for (const discovery of previous.discoveries) {
      delete discovery.leads;
    }
    delete previous.socialChallenges[0].evidenceAlternatives;
    previous.quest.milestones.pop();
    previous.npcs[0].topics[0].replies.shift();
    previous.npcs[1].topics[1].replies.shift();
    previous.npcs[2].topics[0].replies.shift();
    previous.npcs[2].topics.pop();
    const adventure = join(directory, "previous.json");
    const tracePath = join(directory, "previous-trace.json");
    writeFileSync(adventure, JSON.stringify(previous));
    const played = run("look\nquit\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--trace",
      tracePath,
    ]);
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.engineVersion, "chapel-clues-engine-v4");
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("scripted post-rescue Mara narration cannot ask to find Tavi", () =>
  temporary((directory) => {
    const calls = [
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "crypt" }],
      ...Array.from({ length: 3 }, () => [
        "attack",
        { opponent_id: "skeleton-guardian" },
      ]),
      ["talk", { speakerId: "tavi", topicId: "rescue", approach: "ask" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "inn" }],
      ["talk", { speakerId: "mara", topicId: "tavi", approach: "ask" }],
    ];
    for (const closing of ["none", "help-me-find-them"]) {
      const script = join(directory, `${closing}.json`);
      const tracePath = join(directory, `${closing}-trace.json`);
      writeFileSync(
        script,
        JSON.stringify(
          calls.flatMap(([name, args], index) => [
            {
              toolCalls: [
                {
                  id: `call-${index}`,
                  name,
                  argumentsJson: JSON.stringify(args),
                },
              ],
            },
            {
              text:
                index === calls.length - 1
                  ? JSON.stringify({
                      delivery: "steady",
                      opening: "none",
                      factIds: ["tavi-rescued-fact"],
                      closing,
                    })
                  : "Continue.",
            },
          ]),
        ),
      );
      const played = run(
        `${calls.map(() => "Continue").join("\n")}\nquit\n`,
        [
          "--adventure-file",
          source,
          "--ai",
          "--seed",
          "0",
          "--trace",
          tracePath,
        ],
        { DUNGEON_ONE_TEST_DM_SCRIPT: script },
      );
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, /Tavi (has returned safely|is safe here)/);
      assert.doesNotMatch(played.stdout, /Please help me find them/);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      if (closing === "help-me-find-them") {
        assert.equal(
          trace.turns.at(-2).diagnostics[0].code,
          "unsafe-npc-reply",
        );
      }
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));
