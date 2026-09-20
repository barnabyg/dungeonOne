import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import {
  resolveAdventure,
  resolveHistoricalAdventure,
} from "../dist/runtime.js";

function noRolls(message = "Resolution actions must not draw randomness") {
  return {
    roll() {
      assert.fail(message);
    },
  };
}

function resolutionReadyState(runtime, { rescueTavi = false } = {}) {
  let state = runtime.createSession();
  for (const destination of ["chapel-path", "ruined-chapel"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      noRolls(),
    ).state;
  }
  state = runtime.handleAction(
    state,
    { type: "move", destination: "crypt" },
    { roll: (sides) => sides },
  ).state;
  state = runtime.handleAction(
    state,
    { type: "attack", target: "skeleton" },
    { roll: (sides) => sides },
  ).state;
  state = runtime.handleAction(
    state,
    runtime.parseCommand("search diversion ledger"),
    noRolls(),
  ).state;
  state = runtime.handleAction(
    state,
    runtime.parseCommand("talk tavi crypt ask"),
    noRolls(),
  ).state;
  if (rescueTavi) {
    state = runtime.handleAction(
      state,
      runtime.parseCommand("talk tavi rescue ask"),
      noRolls(),
    ).state;
  }
  for (const destination of ["ruined-chapel", "chapel-path", "inn"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      noRolls(),
    ).state;
  }
  return state;
}

test("public disclosure records an authoritative ending with Tavi's actual fate", () => {
  const runtime = resolveAdventure("chapel");
  const ready = resolutionReadyState(runtime);
  const result = runtime.handleAction(
    ready,
    runtime.parseCommand("resolve public disclosure"),
    noRolls(),
  );

  assert.equal(result.rejection, undefined);
  assert.equal(result.state.status, "victory");
  assert.equal(result.state.quest.status, "resolved");
  assert.deepEqual(result.state.resolution, {
    id: "public-disclosure",
    taviFate: "alive-in-crypt",
    casualties: [],
    consequences: ["evidence-published", "village-inquiry-initiated"],
  });
  assert.deepEqual(result.events, [
    {
      type: "chapel-resolved",
      resolution: result.state.resolution,
    },
  ]);
  assert.match(runtime.renderResult(result), /published.*inquiry/is);
  assert.match(runtime.renderResult(result), /Tavi.*alive.*crypt/is);
  assert.doesNotMatch(
    runtime.renderResult(result),
    /paid|repairs? (?:are|were) completed/i,
  );
});

test("confidential referral records trustees' request and only future restitution", () => {
  const runtime = resolveAdventure("chapel");
  const ready = resolutionReadyState(runtime, { rescueTavi: true });
  const result = runtime.handleAction(
    ready,
    runtime.parseCommand("resolve confidential referral"),
    noRolls(),
  );

  assert.equal(result.rejection, undefined);
  assert.deepEqual(result.state.resolution, {
    id: "confidential-referral",
    taviFate: "rescued-to-inn",
    casualties: [],
    consequences: [
      "evidence-delivered-confidentially",
      "restitution-repair-requested",
      "oren-committed-future-restitution",
    ],
  });
  const output = runtime.renderResult(result);
  assert.match(output, /confidential|privately/i);
  assert.match(output, /trustees.*request.*restitution.*repair/is);
  assert.match(output, /Oren commits.*future restitution/i);
  assert.match(output, /Tavi.*alive.*safe.*inn/i);
  assert.match(output, /no payment or completed repair is claimed/i);
});

test("noticeboard exposes both known stakes only when resolution is eligible", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  assert.doesNotMatch(
    JSON.stringify(runtime.getGameToolDefinitions(initial)),
    /resolve_quest|public-disclosure|confidential-referral/,
  );
  const premature = runtime.handleAction(
    initial,
    runtime.parseCommand("resolve public disclosure"),
    noRolls(),
  );
  assert.equal(premature.rejection.reason, "chapel-resolution-unavailable");
  assert.strictEqual(premature.state, initial);

  const ready = resolutionReadyState(runtime);
  const look = runtime.renderResult(
    runtime.handleAction(ready, { type: "look" }, noRolls()),
  );
  assert.match(look, /noticeboard/i);
  assert.match(look, /public disclosure.*publish.*inquiry/is);
  assert.match(look, /confidential referral.*trustees.*restitution.*repair/is);

  const leftInn = runtime.handleAction(
    ready,
    { type: "move", destination: "chapel-path" },
    noRolls(),
  ).state;
  const returned = runtime.handleAction(
    leftInn,
    { type: "move", destination: "inn" },
    noRolls(),
  );
  assert.match(
    runtime.renderResult(returned),
    /noticeboard choices.*public disclosure.*confidential referral/is,
  );

  const resolveTool = runtime
    .getGameToolDefinitions(ready)
    .find(({ name }) => name === "resolve_quest");
  assert.deepEqual(resolveTool.parameters.properties.resolutionId.enum, [
    "public-disclosure",
    "confidential-referral",
  ]);

  const forged = runtime.dispatchGameTool(
    ready,
    {
      name: "resolve_quest",
      argumentsJson: '{"resolutionId":"forged-ending"}',
    },
    noRolls(),
    "Publish the ledger evidence.",
  );
  assert.equal(forged.modelOutput.ok, false);
  assert.equal(forged.modelOutput.error.code, "unavailable-reference");
  assert.strictEqual(forged.state, ready);
});

test("validated model intent rejects ambiguous, tonal, and mismatched ending calls", async () => {
  const runtime = resolveAdventure("chapel");
  for (const sample of [
    {
      input: "Deal with Oren.",
      resolutionId: "public-disclosure",
    },
    {
      input: "I angrily threaten Oren over what happened.",
      resolutionId: "public-disclosure",
    },
    {
      input: "Threaten Oren with public scrutiny.",
      resolutionId: "public-disclosure",
    },
    {
      input: "I angrily confront Oren publicly.",
      resolutionId: "public-disclosure",
    },
    {
      input: "Demand restitution from Oren.",
      resolutionId: "confidential-referral",
    },
    {
      input: "Do not ever publish the ledger; deal with Oren.",
      resolutionId: "public-disclosure",
    },
    {
      input: "Don't publicly publish the evidence.",
      resolutionId: "public-disclosure",
    },
    {
      input: "Publish the ledger evidence for everyone to see.",
      resolutionId: "confidential-referral",
    },
  ]) {
    let response = 0;
    const result = await runDmTurn({
      state: resolutionReadyState(runtime),
      runtime,
      playerInput: sample.input,
      transcript: [],
      random: noRolls(),
      model: {
        async respond() {
          response += 1;
          return response === 1
            ? {
                toolCalls: [
                  {
                    id: "invalid-resolution-intent",
                    name: "resolve_quest",
                    argumentsJson: JSON.stringify({
                      resolutionId: sample.resolutionId,
                    }),
                  },
                ],
              }
            : {
                text: "Please choose public disclosure or confidential referral.",
              };
        },
      },
    });

    assert.equal(result.state.resolution, undefined);
    assert.equal(result.state.status, "playing");
    assert.equal(result.toolAttempts.length, 1);
    assert.equal(result.toolAttempts[0].disposition.validated, false);
    assert.equal(result.toolAttempts[0].disposition.executed, false);
    assert.equal(
      result.toolAttempts[0].result.modelOutput.error.code,
      "invalid-arguments",
    );
    assert.match(result.narration, /choose public disclosure or confidential/i);
  }

  const explicitPrivate = runtime.dispatchGameTool(
    resolutionReadyState(runtime),
    {
      name: "resolve_quest",
      argumentsJson: '{"resolutionId":"confidential-referral"}',
    },
    noRolls(),
    "Refer the ledger confidentially to the trustees.",
  );
  assert.equal(explicitPrivate.modelOutput.ok, true);
  assert.equal(explicitPrivate.state.resolution.id, "confidential-referral");
});

test("resolution freezes gameplay mutations while final-state reads and quit remain available", () => {
  const runtime = resolveAdventure("chapel");
  const resolved = runtime.handleAction(
    resolutionReadyState(runtime),
    runtime.parseCommand("resolve public disclosure"),
    noRolls(),
  ).state;

  for (const action of [
    { type: "move", destination: "chapel-path" },
    { type: "search", target: "missing-person-notice" },
    { type: "talk", target: "mara", topic: "tavi", approach: "ask" },
    { type: "take", target: "healing-potion" },
    { type: "use", target: "healing-potion" },
    { type: "attack", target: "mara" },
    { type: "resolve", target: "confidential-referral" },
  ]) {
    const rejected = runtime.handleAction(resolved, action, noRolls());
    assert.equal(rejected.rejection.reason, "chapel-terminal-state");
    assert.strictEqual(rejected.state, resolved);
  }

  for (const action of [
    { type: "look" },
    { type: "inspect", target: "missing-person-notice" },
    { type: "status" },
    { type: "inventory" },
    { type: "journal" },
    { type: "help" },
  ]) {
    const read = runtime.handleAction(resolved, action, noRolls());
    assert.equal(read.rejection, undefined);
    assert.strictEqual(read.state, resolved);
  }
  const journal = runtime.renderResult(
    runtime.handleAction(resolved, { type: "journal" }, noRolls()),
  );
  assert.match(journal, /resolution: public-disclosure/i);
  assert.match(journal, /evidence-published.*village-inquiry-initiated/is);
  const finalLook = runtime.renderResult(
    runtime.handleAction(resolved, { type: "look" }, noRolls()),
  );
  assert.match(finalLook, /noticeboard record.*public disclosure/is);
  const finalNoticeboard = runtime.renderResult(
    runtime.handleAction(
      resolved,
      { type: "inspect", target: "resolution noticeboard" },
      noRolls(),
    ),
  );
  assert.match(finalNoticeboard, /published.*inquiry.*Tavi.*alive-in-crypt/is);
  assert.deepEqual(
    runtime.getGameToolDefinitions(resolved).map(({ name }) => name),
    ["look", "get_character_status", "get_journal", "inspect"],
  );

  const quit = runtime.handleAction(resolved, { type: "quit" }, noRolls());
  assert.strictEqual(quit.state, resolved);
  assert.deepEqual(quit.events, [{ type: "session-quit" }]);
});

test("provider failure after resolution preserves exactly one ending", async () => {
  const runtime = resolveAdventure("chapel");
  let calls = 0;
  const result = await runDmTurn({
    state: resolutionReadyState(runtime, { rescueTavi: true }),
    runtime,
    playerInput: "Refer the ledger confidentially to the trustees.",
    transcript: [],
    random: noRolls(),
    model: {
      async respond() {
        calls += 1;
        if (calls === 1) {
          return {
            toolCalls: [
              {
                id: "resolve-private",
                name: "resolve_quest",
                argumentsJson: '{"resolutionId":"confidential-referral"}',
              },
            ],
          };
        }
        throw new Error("provider failed after resolution");
      },
    },
  });

  assert.equal(result.state.status, "victory");
  assert.equal(result.state.resolution.id, "confidential-referral");
  assert.equal(
    result.mechanics.filter((line) =>
      /confidential referral recorded/i.test(line),
    ).length,
    1,
  );
  assert.equal(result.toolAttempts.length, 1);
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.match(result.narration, /authoritative result is shown/i);
});

test("provider failure after rescue preserves exactly one rescue", async () => {
  const runtime = resolveAdventure("chapel");
  let state = resolutionReadyState(runtime);
  for (const destination of ["chapel-path", "ruined-chapel", "crypt"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      noRolls(),
    ).state;
  }
  let calls = 0;
  const result = await runDmTurn({
    state,
    runtime,
    playerInput: "Tavi, come back to the inn with me.",
    transcript: [],
    random: noRolls("Rescue must not draw randomness"),
    model: {
      async respond() {
        calls += 1;
        if (calls === 1) {
          return {
            toolCalls: [
              {
                id: "rescue-tavi",
                name: "talk",
                argumentsJson:
                  '{"speakerId":"tavi","topicId":"rescue","approach":"ask"}',
              },
            ],
          };
        }
        throw new Error("provider failed after rescue");
      },
    },
  });

  assert.equal(result.state.npcLocations.tavi, "inn");
  assert.equal(
    result.toolResults[0].result.engineResult.events.filter(
      ({ type }) => type === "chapel-tavi-rescued",
    ).length,
    1,
  );
  assert.equal(result.toolAttempts.length, 1);
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.match(result.narration, /^Tavi:/u);
});

test("rescue-v7 remains replayable without resolution state or references", () => {
  const runtime = resolveHistoricalAdventure(
    "chapel-rescue-rules-v7",
    "chapel-rescue-v7",
    "chapel",
  );
  const state = resolutionReadyState(runtime);

  assert.equal("resolution" in state, false);
  assert.doesNotMatch(
    JSON.stringify(runtime.getGameToolDefinitions(state)),
    /resolve_quest|public-disclosure|confidential-referral/,
  );
  assert.deepEqual(runtime.parseCommand("resolve public disclosure"), {
    type: "unknown",
    input: "resolve public disclosure",
  });
});

test("every pre-v8 runtime preserves resolve text as an unknown command", () => {
  const historicalTuples = [
    ["chapel-exploration-rules-v1", "chapel-exploration-v1"],
    ["chapel-discovery-rules-v2", "chapel-discovery-v2"],
    ["chapel-dialogue-rules-v3", "chapel-dialogue-v3"],
    ["chapel-social-rules-v4", "chapel-social-v4"],
    ["chapel-guardian-rules-v5", "chapel-guardian-v5"],
    ["chapel-potion-rules-v6", "chapel-potion-v6"],
    ["chapel-rescue-rules-v7", "chapel-rescue-v7"],
  ];
  for (const [rulesVersion, adventureVersion] of historicalTuples) {
    const runtime = resolveHistoricalAdventure(
      rulesVersion,
      adventureVersion,
      "chapel",
    );
    assert.deepEqual(runtime.parseCommand("resolve public disclosure"), {
      type: "unknown",
      input: "resolve public disclosure",
    });
  }
  assert.deepEqual(
    resolveAdventure("stolen-signet").parseCommand("resolve public disclosure"),
    { type: "unknown", input: "resolve public disclosure" },
  );
});

test("both offline endings, failed-social fallback, tampering, and replay are deterministic", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-resolution-"));
  try {
    for (const scenario of [
      {
        name: "public",
        seed: "7",
        opening: [
          "resolve public disclosure",
          "resolve public disclosure then move chapel-path",
          "move ferry-landing",
          "talk oren repairs intimidate",
          "move inn",
        ],
        choice: "resolve public disclosure",
        expectedId: "public-disclosure",
        expectedOutput: /published.*inquiry/is,
      },
      {
        name: "private",
        seed: "0",
        opening: [],
        choice: "resolve confidential referral",
        expectedId: "confidential-referral",
        expectedOutput: /delivered privately.*trustees.*request.*restitution/is,
      },
    ]) {
      const tracePath = path.join(directory, `${scenario.name}.json`);
      const played = spawnSync(
        process.execPath,
        [
          "dist/cli.js",
          "--adventure",
          "chapel",
          "--seed",
          scenario.seed,
          "--trace",
          tracePath,
        ],
        {
          encoding: "utf8",
          input: [
            ...scenario.opening,
            "move chapel-path",
            "move ruined-chapel",
            "move crypt",
            "attack skeleton",
            "attack skeleton",
            ...(scenario.seed === "0" ? ["attack skeleton"] : []),
            "search diversion ledger",
            "talk tavi crypt ask",
            "talk tavi rescue ask",
            "move ruined-chapel",
            "move chapel-path",
            "move inn",
            scenario.choice,
            "move chapel-path",
            scenario.choice === "resolve public disclosure"
              ? "resolve confidential referral"
              : "resolve public disclosure",
            "status",
            "journal",
            "quit",
            "",
          ].join("\n"),
        },
      );
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, scenario.expectedOutput);
      assert.match(played.stdout, /Session: victory/i);
      assert.match(
        played.stdout,
        /chapel-terminal-state|can't change the final state/i,
      );
      if (scenario.name === "public") {
        assert.match(played.stdout, /Result: failure/i);
        assert.match(played.stdout, /chapel evidence remain yours to examine/i);
        assert.match(played.stdout, /cannot resolve.*yet/i);
      }

      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.adventure.version, "chapel-casualties-v9");
      assert.equal(trace.completion.outcome, "victory");
      assert.equal(trace.completion.reason, "quit");
      assert.equal(
        trace.actions.at(-1).stateAfter.resolution.id,
        scenario.expectedId,
      );
      assert.equal(
        trace.actions
          .flatMap(({ result }) => result.events ?? [])
          .filter(({ type }) => type === "chapel-resolved").length,
        1,
      );
      const replayed = spawnSync(
        process.execPath,
        ["dist/cli.js", "--replay", tracePath],
        { encoding: "utf8" },
      );
      assert.equal(replayed.status, 0, replayed.stderr);
      if (scenario.name === "public") {
        const endingTampered = structuredClone(trace);
        endingTampered.actions.at(-1).stateAfter.resolution.id =
          "confidential-referral";
        const endingTamperedPath = path.join(directory, "tampered-ending.json");
        writeFileSync(endingTamperedPath, JSON.stringify(endingTampered));
        const rejectedEnding = spawnSync(
          process.execPath,
          ["dist/cli.js", "--replay", endingTamperedPath],
          { encoding: "utf8" },
        );
        assert.notEqual(rejectedEnding.status, 0);
        assert.match(rejectedEnding.stderr, /replay divergence.*state/is);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("both scripted-AI endings clarify ambiguity, permit reflection, and replay", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-resolution-ai-"));
  try {
    const actionTurn = (id, name, argumentsJson, narration) => [
      { toolCalls: [{ id, name, argumentsJson }] },
      { text: narration },
    ];
    for (const scenario of [
      {
        name: "public",
        seed: "7",
        resolutionId: "public-disclosure",
        openingResponses: [
          ...actionTurn(
            "move-ferry",
            "move",
            '{"destinationId":"ferry-landing"}',
            "You approach Oren.",
          ),
          {
            toolCalls: [
              {
                id: "challenge-oren",
                name: "talk",
                argumentsJson:
                  '{"speakerId":"oren","topicId":"repairs","approach":"intimidate"}',
              },
            ],
          },
          {
            text: JSON.stringify({
              delivery: "defiant",
              opening: "none",
              factIds: ["oren-guarded-refusal"],
              closing: "use-authored",
            }),
          },
          ...actionTurn(
            "return-inn",
            "move",
            '{"destinationId":"inn"}',
            "You return to the inn.",
          ),
        ],
        openingInputs: [
          "Go to the ferry landing.",
          "Threaten Oren with public scrutiny about the repairs.",
          "Return to the inn.",
        ],
        attacks: 2,
      },
      {
        name: "private",
        seed: "0",
        resolutionId: "confidential-referral",
        openingResponses: [],
        openingInputs: [],
        attacks: 3,
      },
    ]) {
      const scriptPath = path.join(directory, `${scenario.name}-script.json`);
      const tracePath = path.join(directory, `${scenario.name}-trace.json`);
      const responses = [
        ...scenario.openingResponses,
        ...actionTurn(
          "move-path",
          "move",
          '{"destinationId":"chapel-path"}',
          "You follow the chapel path.",
        ),
        ...actionTurn(
          "move-chapel",
          "move",
          '{"destinationId":"ruined-chapel"}',
          "You enter the ruined chapel.",
        ),
        ...actionTurn(
          "move-crypt",
          "move",
          '{"destinationId":"crypt"}',
          "You enter the crypt.",
        ),
        ...Array.from({ length: scenario.attacks }, (_, index) =>
          actionTurn(
            `attack-${index}`,
            "attack",
            '{"combatantId":"skeleton-guardian"}',
            "The authoritative combat result stands.",
          ),
        ).flat(),
        {
          toolCalls: [
            {
              id: "search-ledger",
              name: "search",
              argumentsJson: '{"target":"diversion-ledger"}',
            },
          ],
        },
        {
          toolCalls: [
            {
              id: "talk-tavi",
              name: "talk",
              argumentsJson:
                '{"speakerId":"tavi","topicId":"crypt","approach":"ask"}',
            },
          ],
        },
        {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            factIds: ["tavi-crypt-testimony"],
            closing: "check-carefully",
          }),
        },
        {
          toolCalls: [
            {
              id: "rescue-tavi",
              name: "talk",
              argumentsJson:
                '{"speakerId":"tavi","topicId":"rescue","approach":"ask"}',
            },
          ],
        },
        {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            factIds: ["tavi-rescue-consent"],
            closing: "check-carefully",
          }),
        },
        actionTurn(
          "leave-crypt",
          "move",
          '{"destinationId":"ruined-chapel"}',
          "unused",
        )[0],
        actionTurn(
          "return-path",
          "move",
          '{"destinationId":"chapel-path"}',
          "unused",
        )[0],
        actionTurn(
          "return-final-inn",
          "move",
          '{"destinationId":"inn"}',
          "unused",
        )[0],
        { text: "Do you mean public disclosure or confidential referral?" },
        ...(scenario.name === "public"
          ? [
              {
                toolCalls: [
                  {
                    id: "resolve-ending",
                    name: "resolve_quest",
                    argumentsJson: JSON.stringify({
                      resolutionId: scenario.resolutionId,
                    }),
                  },
                ],
              },
            ]
          : [
              ...actionTurn(
                "resolve-ending",
                "resolve_quest",
                JSON.stringify({ resolutionId: scenario.resolutionId }),
                "The chosen ending is recorded.",
              ),
              {
                text: "You reflect on the cost of the choice and what remains ahead.",
              },
            ]),
      ];
      writeFileSync(scriptPath, JSON.stringify(responses));
      const inputs = [
        ...scenario.openingInputs,
        "Go to the chapel path.",
        "Enter the ruined chapel.",
        "Enter the crypt.",
        ...Array.from(
          { length: scenario.attacks },
          (_, index) => `Attack the skeleton (${index + 1}).`,
        ),
        "Search the ledger.",
        "Ask Tavi what happened.",
        "Get Tavi safely to the inn.",
        "Leave the crypt.",
        "Return along the chapel path.",
        "Return to the inn.",
        "Deal with Oren.",
        scenario.resolutionId === "public-disclosure"
          ? "Publish the ledger evidence for everyone to see."
          : "Refer the ledger confidentially to the trustees.",
        ...(scenario.name === "public" ? [] : ["Was that the right choice?"]),
        "status",
        "journal",
        "quit",
        "",
      ];
      const played = spawnSync(
        process.execPath,
        [
          "dist/cli.js",
          "--adventure",
          "chapel",
          "--ai",
          "--model",
          "test-model",
          "--seed",
          scenario.seed,
          "--trace",
          tracePath,
        ],
        {
          encoding: "utf8",
          input: inputs.join("\n"),
          env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
        },
      );
      assert.equal(played.status, 0, played.stderr);
      assert.match(
        played.stdout,
        /public disclosure or confidential referral/i,
      );
      if (scenario.name === "private") {
        assert.match(played.stdout, /reflect on the cost/i);
      }
      assert.match(
        played.stdout,
        new RegExp(`Resolution: ${scenario.resolutionId}`, "i"),
      );
      if (scenario.name === "public") {
        assert.match(played.stdout, /Result: failure/i);
      }

      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      const ambiguous = trace.turns.find(
        ({ rawPlayerInput }) => rawPlayerInput === "Deal with Oren.",
      );
      assert.deepEqual(ambiguous.calls, []);
      assert.equal(ambiguous.stateAfter.resolution, undefined);
      if (scenario.name === "public") {
        assert.equal(
          trace.turns.find(({ calls }) =>
            calls.some(({ name }) => name === "resolve_quest"),
          ).diagnostics[0].code,
          "model-failure",
        );
      }
      assert.equal(
        trace.turns.at(-2).stateAfter.resolution.id,
        scenario.resolutionId,
      );
      assert.equal(
        trace.turns
          .flatMap(({ calls }) => calls)
          .flatMap(({ result }) => result?.engineResult?.events ?? [])
          .filter(({ type }) => type === "chapel-resolved").length,
        1,
      );
      const replayed = spawnSync(
        process.execPath,
        ["dist/cli.js", "--replay", tracePath],
        { encoding: "utf8" },
      );
      assert.equal(replayed.status, 0, replayed.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
