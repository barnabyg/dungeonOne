import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/chapel-clues.json";
const run = (input, args, env = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
const temporary = (work) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-47-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const cryptRoute = [
  "move chapel path",
  "move ruined chapel",
  "move crypt",
  "attack skeleton",
  "attack skeleton",
  "attack skeleton",
];

test("each casualty remains visible and the physical investigation survives in command traces", () =>
  temporary((directory) => {
    for (const [actor, location, route] of [
      ["mara", "inn", []],
      ["oren", "ferry-landing", ["move ferry landing"]],
      ["tavi", "crypt", cryptRoute],
      [
        "tavi",
        "inn",
        [
          ...cryptRoute,
          "talk tavi rescue ask",
          "move ruined chapel",
          "move chapel path",
          "move inn",
        ],
      ],
    ]) {
      const tracePath = join(directory, `${actor}-${location}.json`);
      const commands = [
        ...route,
        ...Array.from({ length: 4 }, () => `attack ${actor}`),
        "look",
        "inspect " + actor,
        ...(actor === "tavi"
          ? ["search tavi", "journal", "talk tavi rescue ask"]
          : []),
        ...(actor === "mara" ? ["talk mara tavi ask"] : []),
        ...(actor === "oren" ? ["talk oren tavi ask"] : []),
        ...(actor === "tavi" && location === "inn"
          ? ["talk mara tavi ask"]
          : []),
        ...(actor === "mara" ? ["search notice", "journal"] : []),
        ...(actor === "oren"
          ? [
              "move inn",
              "search notice",
              "move chapel path",
              "move ruined chapel",
              "search repair record",
              "move crypt",
              "attack skeleton",
              "attack skeleton",
              "attack skeleton",
              "attack skeleton",
              "search ledger",
              "journal",
            ]
          : []),
        "quit",
      ];
      const played = run(`${commands.join("\n")}\n`, [
        "--adventure-file",
        source,
        "--seed",
        "0",
        "--trace",
        tracePath,
      ]);
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, /search <feature or remains>/);
      assert.match(played.stdout, /attack <monster or person>/);
      assert.match(played.stdout, new RegExp(`${actor} dies at`, "i"));
      assert.match(played.stdout, new RegExp(`${actor}'s remains`, "i"));
      assert.doesNotMatch(
        played.stdout.slice(
          played.stdout.search(new RegExp(`${actor} dies at`, "i")),
        ),
        new RegExp(`${actor}:`, "i"),
      );
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      const death = trace.actions.find(
        ({ stateAfter }) => stateAfter?.npcHealth?.[actor]?.hp === 0,
      );
      assert.ok(death, `${actor} should die at ${location}`);
      assert.equal(death.stateAfter.npcDeathLocations[actor], location);
      assert.equal(trace.engineVersion, "chapel-clues-engine-v7");
      assert.equal(run("", ["--replay", tracePath]).status, 0);
      if (actor === "tavi") {
        assert.match(played.stdout, /confirm their death/);
        assert.doesNotMatch(played.stdout, /Tavi: I am already safe/);
        const searched = trace.actions.find(
          ({ action }) => action.type === "search" && action.target === "tavi",
        );
        assert.equal(
          searched.stateAfter.discoveryLocations["tavi-remains"],
          location,
        );
        assert.ok(
          searched.stateAfter.milestones.includes("tavi-death-confirmed"),
        );
        if (location === "inn") {
          assert.match(played.stdout, /Mara: Tavi has died/);
        }
      } else {
        assert.match(played.stdout, /The chapel route/);
        if (actor === "oren") {
          assert.match(played.stdout, /The diversion ledger/);
        }
      }
    }
  }));

test("inspection cannot confirm Tavi's fate; dead dialogue and forged rescue consume no rolls", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const runtime = createChapelCluesRuntime(
    loadAdventure(readFileSync(source, "utf8")).adventure,
  );
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  for (const command of [
    ...cryptRoute,
    "talk tavi crypt ask",
    "attack tavi",
    "attack tavi",
    "attack tavi",
  ]) {
    state = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    ).state;
  }
  assert.equal(state.npcHealth.tavi.hp, 0);
  assert.ok(state.discoveries.includes("tavi-crypt-testimony"));
  const before = state.discoveries;
  const inspected = runtime.handleAction(state, {
    type: "inspect",
    target: "tavi",
  });
  assert.deepEqual(inspected.state.discoveries, before);
  assert.ok(
    runtime
      .projectDmScene(state)
      .room.npcs.some(
        ({ id, condition }) => id === "tavi" && condition === "dead",
      ),
  );
  assert.ok(
    !runtime.getGameToolDefinitions(state).some(({ name }) => name === "talk"),
  );
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
  assert.strictEqual(forged.state, state);
  const forgedAttack = runtime.dispatchGameTool(
    state,
    { name: "attack", argumentsJson: JSON.stringify({ opponent_id: "tavi" }) },
    {
      roll: () => {
        throw Error("Unexpected draw");
      },
    },
  );
  assert.equal(forgedAttack.modelOutput.error.code, "unavailable-reference");
  const searched = runtime.handleAction(state, {
    type: "search",
    target: "tavi",
  });
  assert.ok(searched.state.discoveries.includes("tavi-remains"));
  assert.deepEqual(
    searched.state.discoveries.filter((id) => before.includes(id)),
    before,
  );
});

test("scripted AI records every NPC casualty and both Tavi death locations", () =>
  temporary((directory) => {
    const movesToCrypt = ["chapel-path", "ruined-chapel", "crypt"].map(
      (destinationId) => ["move", { destinationId }],
    );
    const guardian = Array.from({ length: 3 }, () => [
      "attack",
      { opponent_id: "skeleton-guardian" },
    ]);
    const crypt = [...movesToCrypt, ...guardian];
    const cases = [
      [
        "mara",
        "inn",
        Array.from({ length: 2 }, () => ["attack", { opponent_id: "mara" }]),
      ],
      [
        "oren",
        "ferry-landing",
        [
          ["move", { destinationId: "ferry-landing" }],
          ...Array.from({ length: 3 }, () => [
            "attack",
            { opponent_id: "oren" },
          ]),
        ],
      ],
      [
        "tavi",
        "crypt",
        [
          ...crypt,
          ["attack", { opponent_id: "tavi" }],
          ["search", { target: "tavi" }],
        ],
      ],
      [
        "tavi",
        "inn",
        [
          ...crypt,
          ["talk", { speakerId: "tavi", topicId: "rescue", approach: "ask" }],
          ...["ruined-chapel", "chapel-path", "inn"].map((destinationId) => [
            "move",
            { destinationId },
          ]),
          ["attack", { opponent_id: "tavi" }],
          ["search", { target: "tavi" }],
        ],
      ],
    ];
    for (const [actor, location, calls] of cases) {
      const attemptedCalls = [
        ...calls,
        [
          "talk",
          {
            speakerId: actor,
            topicId: actor === "tavi" ? "rescue" : "tavi",
            approach: "ask",
          },
        ],
      ];
      const script = join(directory, `${actor}-${location}-script.json`);
      writeFileSync(
        script,
        JSON.stringify(
          attemptedCalls.flatMap(([name, args], index) => [
            {
              toolCalls: [
                {
                  id: `call-${index}`,
                  name,
                  argumentsJson: JSON.stringify(args),
                },
              ],
            },
            { text: "Continue." },
          ]),
        ),
      );
      const tracePath = join(directory, `${actor}-${location}-ai.json`);
      const played = run(
        `${attemptedCalls.map(() => "Continue").join("\n")}\nquit\n`,
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
      assert.match(played.stdout, new RegExp(`${actor} dies at`, "i"));
      assert.doesNotMatch(
        played.stdout.slice(
          played.stdout.search(new RegExp(`${actor} dies at`, "i")),
        ),
        new RegExp(`${actor}:`, "i"),
      );
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      const death = trace.turns.find(
        ({ stateAfter }) => stateAfter?.npcHealth?.[actor]?.hp === 0,
      );
      assert.ok(death, `${actor} should die at ${location}`);
      assert.equal(death.stateAfter.npcDeathLocations[actor], location);
      if (actor === "tavi") {
        assert.equal(
          trace.turns.at(-1).stateAfter.discoveryLocations["tavi-remains"],
          location,
        );
      }
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));

test("casualty data rejects impossible HP, unsourced remains and old rules", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const document = JSON.parse(readFileSync(source, "utf8"));
  for (const [change, code] of [
    [
      (copy) => {
        copy.npcs[0].combat.hp = 99;
      },
      "invalid-placement",
    ],
    [
      (copy) => {
        copy.npcs[2].remains.search.effects[0].id = "ledger-evidence";
      },
      "invalid-source",
    ],
    [
      (copy) => {
        copy.rulesVersion = "chapel-clues-rules-v2";
      },
      "unsupported-rules",
    ],
    [
      (copy) => {
        copy.npcs[0].combat = undefined;
      },
      "invalid-placement",
    ],
  ]) {
    const copy = structuredClone(document);
    change(copy);
    assert.ok(
      loadAdventure(JSON.stringify(copy)).diagnostics.some(
        (entry) => entry.code === code,
      ),
      code,
    );
  }
});

test("pre-casualty chapel format-4 traces keep their v5 engine", () =>
  temporary((directory) => {
    const previous = JSON.parse(readFileSync(source, "utf8"));
    previous.contentVersion = "3";
    previous.rulesVersion = "chapel-clues-rules-v2";
    delete previous.endings;
    previous.quest.milestones = previous.quest.milestones.filter(
      (id) => id !== "tavi-death-confirmed",
    );
    previous.discoveries = previous.discoveries.filter(
      (entry) => entry.id !== "tavi-remains",
    );
    for (const entry of [...previous.locations, ...previous.features]) {
      entry.descriptions = entry.descriptions?.filter((variant) =>
        variant.when.every(
          (condition) =>
            condition.type !== "actor-dead" &&
            condition.id !== "tavi-death-confirmed",
        ),
      );
      if (entry.descriptions?.length === 0) {
        delete entry.descriptions;
      }
    }
    for (const discovery of previous.discoveries) {
      discovery.leads = discovery.leads?.filter((variant) =>
        variant.when.every(
          (condition) =>
            condition.type !== "actor-dead" &&
            condition.id !== "tavi-death-confirmed",
        ),
      );
      if (discovery.leads?.length === 0) {
        delete discovery.leads;
      }
    }
    for (const npc of previous.npcs) {
      delete npc.combat;
      delete npc.remains;
      for (const topic of npc.topics) {
        topic.replies = topic.replies.filter((reply) =>
          reply.when.every((condition) => condition.type !== "actor-dead"),
        );
      }
    }
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
    assert.equal(
      JSON.parse(readFileSync(tracePath, "utf8")).engineVersion,
      "chapel-clues-engine-v5",
    );
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));
