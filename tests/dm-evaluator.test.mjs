import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { DM_INTERPRETATION_CASES } from "../dist/dm-interpretation-cases.js";
import { dmEvaluationExitCode, runDmEvaluation } from "../dist/dm-evaluator.js";

function interpretationCase(id) {
  const sample = DM_INTERPRETATION_CASES.find(
    (candidate) => candidate.id === id,
  );
  assert.ok(sample, `missing interpretation case ${id}`);
  return sample;
}

function scriptedFactory(observations) {
  return ({ sample, repetition }) => {
    let responseIndex = 0;
    observations.push({ caseId: sample.id, repetition, requests: [] });
    const observation = observations.at(-1);
    return {
      identity: { provider: "scripted", model: "requested-model" },
      async respond(request) {
        observation.requests.push(structuredClone(request));
        const response = structuredClone(
          sample.scripted.responses[responseIndex],
        );
        responseIndex += 1;
        assert.ok(
          response,
          `${sample.id} repetition ${repetition} ran out of responses`,
        );
        response.provider = {
          responseId: `${sample.id}-${repetition}-${responseIndex}`,
          model: "actual-model-2026-09-01",
          status: "completed",
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
        return response;
      },
    };
  };
}

test("evaluator aggregates repeated isolated runs and threshold evidence", async () => {
  const observations = [];
  let tick = 0;
  const cases = [
    interpretationCase("cautious-door-opening"),
    interpretationCase("ambiguous-use-it"),
    interpretationCase("compound-door-entry"),
  ];
  const report = await runDmEvaluation({
    requestedModel: "requested-model",
    repetitions: 3,
    cases,
    createModel: scriptedFactory(observations),
    manualJudgments: {
      "ambiguous-use-it": {
        1: { "clarification-relevance": true },
        2: { "clarification-relevance": true },
        3: { "clarification-relevance": true },
      },
    },
    clock: () => tick++,
  });

  assert.equal(observations.length, 9);
  assert.ok(
    observations.every(({ requests }) => requests[0].transcript.length === 0),
  );
  assert.deepEqual(report.actualModelIds, ["actual-model-2026-09-01"]);
  assert.equal(report.runs.length, 9);
  assert.equal(report.runs[0].responses[0].latencyMs, 1);
  assert.deepEqual(report.runs[0].responses[0].usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  });
  assert.match(report.runs[0].narration, /door opens/u);
  assert.equal(report.runs[0].normalizedCalls[0].name, "open");
  assert.equal(report.runs[0].normalizedOutcomes[0].name, "open");
  assert.equal(report.summary.safety.rate, 1);
  assert.equal(report.summary["clear-accuracy"].rate, 1);
  assert.equal(report.summary["ambiguous-clarification"].rate, 1);
  assert.equal(report.summary["compound-mutation-budget"].rate, 1);
  assert.equal(report.passed, true);
  assert.deepEqual(report.manualReview, {
    passed: 3,
    failed: 0,
    missing: 0,
    total: 3,
    complete: true,
  });
  assert.equal(dmEvaluationExitCode(report), 0);
});

test("provider failures preserve sanitized partial evidence and fail the evaluation", async () => {
  const report = await runDmEvaluation({
    requestedModel: "failing-model",
    repetitions: 3,
    cases: [interpretationCase("cautious-door-opening")],
    createModel: () => ({
      identity: { provider: "mock", model: "failing-model" },
      async respond() {
        throw new Error(
          "Authorization: Bearer sk-this-provider-secret-must-not-escape provider body",
        );
      },
    }),
  });

  assert.equal(report.runs.length, 3);
  assert.ok(report.runs.every((run) => run.failures[0].code === "unknown"));
  assert.equal(report.passed, false);
  assert.equal(dmEvaluationExitCode(report), 1);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /Bearer|provider body|must-not-escape/u);
});

test("missing manual classifications are explicit failures", async () => {
  const report = await runDmEvaluation({
    requestedModel: "requested-model",
    repetitions: 3,
    cases: [interpretationCase("ambiguous-use-it")],
    createModel: scriptedFactory([]),
  });

  assert.equal(report.summary["ambiguous-clarification"].missing, 3);
  assert.equal(report.summary["ambiguous-clarification"].meetsThreshold, false);
  assert.ok(
    report.runs.every(
      (run) => run.manualJudgments[0].classification === "missing",
    ),
  );
  assert.equal(report.passed, false);
});

test("manual approval cannot hide a mutating ambiguous interpretation", async () => {
  const sample = interpretationCase("ambiguous-use-it");
  const report = await runDmEvaluation({
    requestedModel: "unsafe-model",
    repetitions: 3,
    cases: [sample],
    manualJudgments: {
      "ambiguous-use-it": {
        1: { "clarification-relevance": true },
        2: { "clarification-relevance": true },
        3: { "clarification-relevance": true },
      },
    },
    createModel: ({ repetition }) => {
      let responseNumber = 0;
      return {
        async respond() {
          responseNumber += 1;
          return responseNumber === 1
            ? {
                toolCalls: [
                  {
                    id: `unsafe-${repetition}`,
                    name: "open",
                    argumentsJson: '{"door_id":"entrance-door"}',
                  },
                ],
              }
            : { text: "What would you like to use?" };
        },
      };
    },
  });

  assert.equal(report.summary["ambiguous-clarification"].rate, 0);
  assert.equal(report.passed, false);
});

test("eval command rejects missing models and fewer than three repetitions", () => {
  for (const args of [[], ["--model", "test-model", "--repetitions", "2"]]) {
    const result = spawnSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "eval-dm.mjs"), ...args],
      { cwd: process.cwd(), encoding: "utf8", env: {} },
    );
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage: npm run eval:dm/u);
  }
});
