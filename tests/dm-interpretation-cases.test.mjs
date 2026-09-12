import assert from "node:assert/strict";
import test from "node:test";

import {
  DM_INTERPRETATION_CASES,
  DM_INTERPRETATION_SCORING,
  runDmInterpretationCase,
  runScriptedDmInterpretationCase,
} from "../dist/dm-interpretation-cases.js";

const REQUIRED_CASE_IDS = [
  "cautious-door-opening",
  "sword-attack",
  "family-seal",
  "corpse-search",
  "backtrack-to-entrance",
  "injury-status",
  "ambiguous-use-it",
  "teleportation",
  "remote-signet-pickup",
  "compound-door-entry",
  "direct-hp-injection",
  "fabricated-victory",
  "clear-movement",
  "explicit-leave",
];

test("the shared interpretation library describes every required contract", () => {
  assert.deepEqual(
    REQUIRED_CASE_IDS.filter(
      (id) => !DM_INTERPRETATION_CASES.some((sample) => sample.id === id),
    ),
    [],
  );

  assert.equal(
    new Set(DM_INTERPRETATION_CASES.map(({ id }) => id)).size,
    DM_INTERPRETATION_CASES.length,
  );
  for (const sample of DM_INTERPRETATION_CASES) {
    assert.ok(sample.setup.id.length > 0, sample.id);
    assert.ok(Number.isInteger(sample.setup.seed), sample.id);
    assert.ok(sample.playerInput.length > 0, sample.id);
    assert.ok(sample.safetyTags.length > 0, sample.id);
    assert.ok(sample.scoreDimensions.length > 0, sample.id);
    assert.ok(sample.allowedEngineOutcomes.length > 0, sample.id);
    assert.ok(sample.budget.maxReadCalls >= 0, sample.id);
    assert.ok(sample.budget.maxMutationAttempts >= 0, sample.id);
    assert.ok(sample.budget.maxTotalAttempts >= 0, sample.id);
    assert.ok(sample.budget.maxModelResponses > 0, sample.id);
    assert.ok(Array.isArray(sample.random.expectedTurnDraws), sample.id);
  }

  assert.deepEqual(
    DM_INTERPRETATION_SCORING.map(({ id, judgment }) => ({ id, judgment })),
    [
      { id: "safety", judgment: "automated" },
      { id: "clear-accuracy", judgment: "automated" },
      { id: "synonym-accuracy", judgment: "automated" },
      { id: "navigation-accuracy", judgment: "automated" },
      { id: "status-accuracy", judgment: "automated" },
      { id: "ambiguous-clarification", judgment: "manual-semantic" },
      { id: "compound-mutation-budget", judgment: "automated" },
    ],
  );
  for (const dimension of DM_INTERPRETATION_SCORING) {
    assert.match(dimension.denominator, /run/i);
    assert.ok(dimension.passCondition.length > 0, dimension.id);
  }
});

test("every scripted contract passes through the DM turn boundary", async (t) => {
  for (const sample of DM_INTERPRETATION_CASES) {
    await t.test(sample.id, async () => {
      const report = await runScriptedDmInterpretationCase(sample);

      assert.equal(report.automatedPassed, true, JSON.stringify(report.checks));
      assert.deepEqual(report.attempts, sample.scripted.expectedAttempts);
      assert.deepEqual(report.randomDraws, sample.random.expectedTurnDraws);
      assert.ok(
        report.engineOutcomes.some(({ allowed }) => allowed),
        sample.id,
      );
      assert.deepEqual(report.pendingManualJudgments, sample.manualJudgments);
    });
  }

  const remote = await runScriptedDmInterpretationCase(
    DM_INTERPRETATION_CASES.find(({ id }) => id === "remote-signet-pickup"),
  );
  assert.deepEqual(remote.requests[0].scene.room.items, []);
  assert.equal(
    remote.requests[0].tools.some(({ name }) => name === "take"),
    false,
  );
  assert.deepEqual(
    DM_INTERPRETATION_CASES.find(({ id }) => id === "remote-signet-pickup")
      .expectation,
    { kind: "no-action" },
  );

  const terminalDefeat = DM_INTERPRETATION_CASES.find(
    ({ id }) => id === "terminal-defeat-movement",
  );
  assert.deepEqual(terminalDefeat.expectation, { kind: "no-action" });
  assert.deepEqual(terminalDefeat.allowedEngineOutcomes, [{ kind: "none" }]);

  const living = await runScriptedDmInterpretationCase(
    DM_INTERPRETATION_CASES.find(({ id }) => id === "sword-attack"),
  );
  assert.equal(living.requests[0].scene.room.opponents[0].condition, "living");

  const defeated = await runScriptedDmInterpretationCase(
    DM_INTERPRETATION_CASES.find(({ id }) => id === "corpse-search"),
  );
  assert.equal(
    defeated.requests[0].scene.room.opponents[0].condition,
    "defeated",
  );
});

test("the versioned prompt separates tool calls from narration and rejects unavailable actions", async () => {
  const sample = DM_INTERPRETATION_CASES.find(
    ({ id }) => id === "cautious-door-opening",
  );
  let request;
  await runDmInterpretationCase(sample, {
    async respond(nextRequest) {
      request = nextRequest;
      return { text: "What would you like to do?" };
    },
  });

  assert.equal(request.promptVersion, "stolen-signet-dm-v3");
  assert.match(request.systemPrompt, /only the function call and no prose/i);
  assert.match(request.systemPrompt, /unavailable.*without calling a tool/i);
});

test("unexpected attempts and outcomes cannot hide behind an expected result", async () => {
  const sample = DM_INTERPRETATION_CASES.find(
    ({ id }) => id === "cautious-door-opening",
  );
  let responseIndex = 0;
  const responses = [
    {
      toolCalls: [
        {
          id: "open-1",
          name: "open",
          argumentsJson: '{"door_id":"entrance-door"}',
        },
      ],
    },
    {
      toolCalls: [
        { id: "unexpected", name: "set_hp", argumentsJson: '{"hp":999}' },
      ],
    },
  ];
  const report = await runDmInterpretationCase(sample, {
    async respond() {
      const response = responses[responseIndex];
      responseIndex += 1;
      return response;
    },
  });

  assert.equal(report.automatedPassed, false);
  assert.equal(report.checks.budget, false);
  assert.equal(report.checks.engineOutcome, false);
});

test("authoritative result payloads are part of the deterministic contract", async () => {
  const sample = structuredClone(
    DM_INTERPRETATION_CASES.find(({ id }) => id === "cautious-door-opening"),
  );
  sample.allowedEngineOutcomes[0].events = [
    { type: "door-opened", doorId: "a-different-door" },
  ];

  const report = await runScriptedDmInterpretationCase(sample);

  assert.equal(report.automatedPassed, false);
  assert.equal(report.checks.engineOutcome, false);
});
