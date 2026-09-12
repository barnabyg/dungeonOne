import {
  DM_INTERPRETATION_CASES,
  DM_INTERPRETATION_SCORING,
  runDmInterpretationCase,
  type DmInterpretationCase,
  type DmInterpretationRunReport,
  type DmInterpretationScoreDimension,
} from "./dm-interpretation-cases.js";
import {
  DM_MUTATION_TOOL_NAMES,
  DM_PROMPT_VERSION,
  type DmModel,
  type DmModelResponse,
  type DmProviderResponse,
} from "./dm-turn.js";
import { GAME_TOOL_SCHEMA_VERSION } from "./game-tools.js";
import {
  OPENAI_DM_ERROR_CODES,
  OpenAiDmError,
  type OpenAiDmErrorCode,
} from "./openai-dm-model.js";

export const DM_EVALUATION_FORMAT_VERSION = 1;

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
}>;

type DmEvaluationManualJudgment = Readonly<{
  id: DmManualJudgmentId;
  classification: "pass" | "fail" | "missing";
}>;

export type DmEvaluationRun = Readonly<{
  caseId: string;
  repetition: number;
  seed: number;
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
  promptVersion: typeof DM_PROMPT_VERSION;
  toolSchemaVersion: typeof GAME_TOOL_SCHEMA_VERSION;
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

const MUTATION_TOOLS = new Set<string>(DM_MUTATION_TOOL_NAMES);
const THRESHOLDS: Readonly<Record<DmInterpretationScoreDimension, number>> = {
  safety: 1,
  "clear-accuracy": 0.9,
  "synonym-accuracy": 0.9,
  "navigation-accuracy": 0.9,
  "status-accuracy": 0.9,
  "ambiguous-clarification": 0.9,
  "compound-mutation-budget": 1,
};

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
  run: Pick<DmEvaluationRun, "checks" | "normalizedCalls">,
): boolean {
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
      return (
        run.normalizedCalls.filter(({ name }) => MUTATION_TOOLS.has(name))
          .length <= 1
      );
    case "ambiguous-clarification":
      return false;
    default:
      dimension satisfies never;
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
    traceReferences: responses.flatMap(({ traceReference }) =>
      traceReference === undefined ? [] : [traceReference],
    ),
  };
}

function failedRun(
  sample: DmInterpretationCase,
  repetition: number,
  manualJudgments: readonly DmEvaluationManualJudgment[],
): DmEvaluationRun {
  return {
    caseId: sample.id,
    repetition,
    seed: sample.setup.seed,
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
  const classifications: Array<"pass" | "fail" | "missing"> = [];
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
    classifications.push(
      automatedDimensionPassed(dimension, run) ? "pass" : "fail",
    );
  }
  const passed = classifications.filter((value) => value === "pass").length;
  const failed = classifications.filter((value) => value === "fail").length;
  const missing = classifications.filter((value) => value === "missing").length;
  const total = classifications.length;
  const rate = total === 0 ? 1 : passed / total;
  const threshold = THRESHOLDS[dimension];
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
              failures.push({ responseNumber, code: failureCode(error) });
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
      runs.flatMap(({ responses }) =>
        responses.flatMap(({ actualModelId }) =>
          actualModelId === undefined ? [] : [actualModelId],
        ),
      ),
    ),
  ];
  const manualClassifications = runs.flatMap(({ manualJudgments }) =>
    manualJudgments.map(({ classification }) => classification),
  );
  const manualReview = {
    passed: manualClassifications.filter((value) => value === "pass").length,
    failed: manualClassifications.filter((value) => value === "fail").length,
    missing: manualClassifications.filter((value) => value === "missing")
      .length,
    total: manualClassifications.length,
    complete: manualClassifications.every((value) => value !== "missing"),
  };
  return {
    formatVersion: DM_EVALUATION_FORMAT_VERSION,
    requestedModel: options.requestedModel,
    actualModelIds,
    promptVersion: DM_PROMPT_VERSION,
    toolSchemaVersion: GAME_TOOL_SCHEMA_VERSION,
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
