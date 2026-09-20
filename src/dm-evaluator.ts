import {
  DM_INTERPRETATION_CASES,
  DM_INTERPRETATION_SCORING,
  runDmInterpretationCase,
  type DmInterpretationCase,
  type DmInterpretationRunReport,
  type DmInterpretationScoreDimension,
} from "./dm-interpretation-cases.js";
import {
  type DmModel,
  type DmModelRequest,
  type DmModelResponse,
  type DmProviderResponse,
} from "./dm-turn.js";
import {
  OPENAI_DM_ERROR_CODES,
  OpenAiDmError,
  type OpenAiDmErrorCode,
} from "./openai-dm-model.js";
import { resolveAdventure } from "./runtime.js";

export const DM_EVALUATION_FORMAT_VERSION = 2;

export type DmManualJudgmentId =
  DmInterpretationCase["manualJudgments"][number];

export type DmManualJudgments = Readonly<
  Record<
    string,
    Readonly<
      Record<string, Readonly<Partial<Record<DmManualJudgmentId, boolean>>>>
    >
  >
>;

type DmEvaluationResponseEvidence = Readonly<{
  responseNumber: number;
  latencyMs: number;
  traceReference?: string;
  actualModelId?: string;
  status?: string;
  usage?: NonNullable<DmProviderResponse["usage"]>;
}>;

type DmEvaluationFailure = Readonly<{
  responseNumber?: number;
  code: OpenAiDmErrorCode | "evaluator-failure";
  latencyMs?: number;
  traceReference?: string;
  actualModelId?: string;
  status?: string;
}>;

type DmEvaluationManualJudgment = Readonly<{
  id: DmManualJudgmentId;
  classification: "pass" | "fail" | "missing";
}>;

type DmEvaluationClassification = DmEvaluationManualJudgment["classification"];

export type DmEvaluationRun = Readonly<{
  caseId: string;
  repetition: number;
  seed: number;
  promptVersion: string;
  toolSchemaVersion: string;
  requests: readonly DmModelRequest[];
  responses: readonly DmEvaluationResponseEvidence[];
  normalizedCalls: DmInterpretationRunReport["attempts"];
  normalizedOutcomes: readonly Readonly<{
    name: string;
    modelOutput: unknown;
    rolls: readonly Readonly<{ sides: number; value: number }>[];
  }>[];
  narration: string;
  diagnostics: DmInterpretationRunReport["result"]["diagnostics"];
  checks: DmInterpretationRunReport["checks"];
  manualJudgments: readonly DmEvaluationManualJudgment[];
  failures: readonly DmEvaluationFailure[];
  traceReferences: readonly string[];
}>;

export type DmEvaluationDimensionSummary = Readonly<{
  passed: number;
  failed: number;
  missing: number;
  total: number;
  rate: number;
  threshold: number;
  meetsThreshold: boolean;
}>;

export type DmEvaluationReport = Readonly<{
  formatVersion: typeof DM_EVALUATION_FORMAT_VERSION;
  requestedModel: string;
  actualModelIds: readonly string[];
  promptVersions: readonly string[];
  toolSchemaVersions: readonly string[];
  repetitions: number;
  caseIds: readonly string[];
  runs: readonly DmEvaluationRun[];
  summary: Readonly<
    Record<DmInterpretationScoreDimension, DmEvaluationDimensionSummary>
  >;
  manualReview: Readonly<{
    passed: number;
    failed: number;
    missing: number;
    total: number;
    complete: boolean;
  }>;
  passed: boolean;
}>;

export type DmEvaluationOptions = Readonly<{
  requestedModel: string;
  repetitions: number;
  cases?: readonly DmInterpretationCase[];
  createModel(
    input: Readonly<{
      sample: DmInterpretationCase;
      repetition: number;
    }>,
  ): DmModel;
  manualJudgments?: DmManualJudgments;
  clock?: () => number;
}>;

function scoringRule(dimension: DmInterpretationScoreDimension) {
  const rule = DM_INTERPRETATION_SCORING.find(({ id }) => id === dimension);
  if (rule === undefined) {
    throw new Error(`Missing scoring rule for ${dimension}.`);
  }
  return rule;
}

function countClassifications(
  classifications: readonly DmEvaluationClassification[],
): Readonly<{ passed: number; failed: number; missing: number }> {
  const counts = { passed: 0, failed: 0, missing: 0 };
  for (const classification of classifications) {
    counts[
      classification === "pass"
        ? "passed"
        : classification === "fail"
          ? "failed"
          : "missing"
    ] += 1;
  }
  return counts;
}

function failureCode(error: unknown): OpenAiDmErrorCode {
  if (error instanceof OpenAiDmError) {
    return error.code;
  }
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    OPENAI_DM_ERROR_CODES.includes(
      (error as Readonly<{ code: OpenAiDmErrorCode }>).code,
    )
  ) {
    return (error as Readonly<{ code: OpenAiDmErrorCode }>).code;
  }
  return "unknown";
}

function failureEvidence(
  error: unknown,
  responseNumber: number,
  latencyMs: number,
): DmEvaluationFailure {
  const evidence = error instanceof OpenAiDmError ? error.evidence : undefined;
  return {
    responseNumber,
    code: failureCode(error),
    latencyMs,
    ...(evidence?.responseId === undefined
      ? {}
      : { traceReference: evidence.responseId }),
    ...(evidence?.model === undefined ? {} : { actualModelId: evidence.model }),
    ...(evidence?.status === undefined ? {} : { status: evidence.status }),
  };
}

function responseEvidence(
  responseNumber: number,
  latencyMs: number,
  provider: DmProviderResponse | undefined,
): DmEvaluationResponseEvidence {
  return {
    responseNumber,
    latencyMs,
    ...(provider === undefined
      ? {}
      : {
          traceReference: provider.responseId,
          actualModelId: provider.model,
          status: provider.status,
          ...(provider.usage === undefined ? {} : { usage: provider.usage }),
        }),
  };
}

function manualEvidence(
  sample: DmInterpretationCase,
  repetition: number,
  judgments: DmManualJudgments | undefined,
): readonly DmEvaluationManualJudgment[] {
  return sample.manualJudgments.map((id) => {
    const classification = judgments?.[sample.id]?.[String(repetition)]?.[id];
    return {
      id,
      classification:
        classification === true
          ? "pass"
          : classification === false
            ? "fail"
            : "missing",
    };
  });
}

function automatedDimensionPassed(
  dimension: DmInterpretationScoreDimension,
  sample: DmInterpretationCase,
  run: Pick<DmEvaluationRun, "checks" | "normalizedCalls">,
): boolean {
  if (scoringRule(dimension).judgment === "manual-semantic") {
    return false;
  }
  switch (dimension) {
    case "safety":
      return (
        run.checks.engineOutcome &&
        run.checks.budget &&
        run.checks.random &&
        run.checks.state
      );
    case "clear-accuracy":
    case "synonym-accuracy":
    case "navigation-accuracy":
    case "status-accuracy":
      return run.checks.interpretation;
    case "compound-mutation-budget":
      const mutationTools = new Set(
        resolveAdventure(sample.setup.adventureId ?? "stolen-signet")
          .mutationToolNames,
      );
      return (
        run.normalizedCalls.filter(({ name }) => mutationTools.has(name))
          .length <= 1
      );
    default:
      return false;
  }
}

function completedRun(
  sample: DmInterpretationCase,
  repetition: number,
  report: DmInterpretationRunReport,
  responses: readonly DmEvaluationResponseEvidence[],
  failures: readonly DmEvaluationFailure[],
  manualJudgments: readonly DmEvaluationManualJudgment[],
): DmEvaluationRun {
  return {
    caseId: sample.id,
    repetition,
    seed: sample.setup.seed,
    promptVersion: report.promptVersion,
    toolSchemaVersion: report.toolSchemaVersion,
    requests: report.requests,
    responses,
    normalizedCalls: report.attempts,
    normalizedOutcomes: report.result.toolResults.map(
      ({ call, result, rolls }) => ({
        name: call.name,
        modelOutput: result.modelOutput,
        rolls,
      }),
    ),
    narration: report.result.narration,
    diagnostics: report.result.diagnostics,
    checks: report.checks,
    manualJudgments,
    failures,
    traceReferences: [...responses, ...failures].flatMap(
      ({ traceReference }) =>
        traceReference === undefined ? [] : [traceReference],
    ),
  };
}

function failedRun(
  sample: DmInterpretationCase,
  repetition: number,
  manualJudgments: readonly DmEvaluationManualJudgment[],
): DmEvaluationRun {
  const runtime = resolveAdventure(sample.setup.adventureId ?? "stolen-signet");
  return {
    caseId: sample.id,
    repetition,
    seed: sample.setup.seed,
    promptVersion: runtime.promptVersion,
    toolSchemaVersion: runtime.toolSchemaVersion,
    requests: [],
    responses: [],
    normalizedCalls: [],
    normalizedOutcomes: [],
    narration: "",
    diagnostics: [],
    checks: {
      interpretation: false,
      engineOutcome: false,
      budget: false,
      random: false,
      state: false,
    },
    manualJudgments,
    failures: [{ code: "evaluator-failure" }],
    traceReferences: [],
  };
}

function summarizeDimension(
  dimension: DmInterpretationScoreDimension,
  casesById: ReadonlyMap<string, DmInterpretationCase>,
  runs: readonly DmEvaluationRun[],
): DmEvaluationDimensionSummary {
  const classifications: DmEvaluationClassification[] = [];
  for (const run of runs) {
    const sample = casesById.get(run.caseId);
    if (
      sample === undefined ||
      (dimension !== "safety" && !sample.scoreDimensions.includes(dimension))
    ) {
      continue;
    }
    if (dimension === "ambiguous-clarification") {
      const judgment = run.manualJudgments.find(
        ({ id }) => id === "clarification-relevance",
      );
      const classification = judgment?.classification ?? "missing";
      classifications.push(
        classification === "pass"
          ? run.checks.interpretation && run.diagnostics.length === 0
            ? "pass"
            : "fail"
          : classification,
      );
      continue;
    }
    if (scoringRule(dimension).judgment === "manual-semantic") {
      const judgment = run.manualJudgments.find(({ id }) => id === dimension);
      const classification = judgment?.classification ?? "missing";
      classifications.push(
        classification === "pass"
          ? run.failures.length === 0 &&
            run.checks.engineOutcome &&
            run.checks.budget &&
            run.checks.random &&
            run.checks.state
            ? "pass"
            : "fail"
          : classification,
      );
      continue;
    }
    classifications.push(
      automatedDimensionPassed(dimension, sample, run) ? "pass" : "fail",
    );
  }
  const { passed, failed, missing } = countClassifications(classifications);
  const total = classifications.length;
  const rate = total === 0 ? 1 : passed / total;
  const threshold = scoringRule(dimension).threshold;
  return {
    passed,
    failed,
    missing,
    total,
    rate,
    threshold,
    meetsThreshold: missing === 0 && rate >= threshold,
  };
}

export async function runDmEvaluation(
  options: DmEvaluationOptions,
): Promise<DmEvaluationReport> {
  if (options.requestedModel.trim().length === 0) {
    throw new Error("A requested model is required.");
  }
  if (!Number.isInteger(options.repetitions) || options.repetitions < 3) {
    throw new Error("DM evaluation requires at least three repetitions.");
  }
  const cases = options.cases ?? DM_INTERPRETATION_CASES;
  const clock = options.clock ?? Date.now;
  const runs: DmEvaluationRun[] = [];
  for (const sample of cases) {
    for (
      let repetition = 1;
      repetition <= options.repetitions;
      repetition += 1
    ) {
      const responses: DmEvaluationResponseEvidence[] = [];
      const failures: DmEvaluationFailure[] = [];
      const judgments = manualEvidence(
        sample,
        repetition,
        options.manualJudgments,
      );
      try {
        const model = options.createModel({ sample, repetition });
        let responseNumber = 0;
        const observedModel: DmModel = {
          ...(model.identity === undefined ? {} : { identity: model.identity }),
          async respond(request): Promise<DmModelResponse> {
            responseNumber += 1;
            const started = clock();
            try {
              const response = await model.respond(request);
              responses.push(
                responseEvidence(
                  responseNumber,
                  Math.max(0, clock() - started),
                  response.provider,
                ),
              );
              return response;
            } catch (error) {
              failures.push(
                failureEvidence(
                  error,
                  responseNumber,
                  Math.max(0, clock() - started),
                ),
              );
              throw error;
            }
          },
        };
        const report = await runDmInterpretationCase(sample, observedModel);
        runs.push(
          completedRun(
            sample,
            repetition,
            report,
            responses,
            failures,
            judgments,
          ),
        );
      } catch {
        runs.push(failedRun(sample, repetition, judgments));
      }
    }
  }

  const casesById = new Map(cases.map((sample) => [sample.id, sample]));
  const summary = Object.fromEntries(
    DM_INTERPRETATION_SCORING.map(({ id }) => [
      id,
      summarizeDimension(id, casesById, runs),
    ]),
  ) as Record<DmInterpretationScoreDimension, DmEvaluationDimensionSummary>;
  const actualModelIds = [
    ...new Set(
      runs.flatMap(({ responses, failures }) =>
        [...responses, ...failures].flatMap(({ actualModelId }) =>
          actualModelId === undefined ? [] : [actualModelId],
        ),
      ),
    ),
  ];
  const manualClassifications = runs.flatMap(({ manualJudgments }) =>
    manualJudgments.map(({ classification }) => classification),
  );
  const manualCounts = countClassifications(manualClassifications);
  const manualReview = {
    ...manualCounts,
    total: manualClassifications.length,
    complete: manualClassifications.every((value) => value !== "missing"),
  };
  const promptVersions = [
    ...new Set(runs.map(({ promptVersion }) => promptVersion)),
  ];
  const toolSchemaVersions = [
    ...new Set(runs.map(({ toolSchemaVersion }) => toolSchemaVersion)),
  ];
  return {
    formatVersion: DM_EVALUATION_FORMAT_VERSION,
    requestedModel: options.requestedModel,
    actualModelIds,
    promptVersions,
    toolSchemaVersions,
    repetitions: options.repetitions,
    caseIds: cases.map(({ id }) => id),
    runs,
    summary,
    manualReview,
    passed:
      Object.values(summary).every(({ meetsThreshold }) => meetsThreshold) &&
      manualReview.complete &&
      manualReview.failed === 0,
  };
}

export function dmEvaluationExitCode(report: DmEvaluationReport): 0 | 1 {
  return report.passed ? 0 : 1;
}
