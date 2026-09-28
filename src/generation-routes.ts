import { performance } from "node:perf_hooks";

import type {
  AdventureDiagnostic,
  ChapelCluesDefinition,
  ClueCondition,
  ValidatedAdventure,
} from "./adventure-loader.js";
import { createDataRuntime } from "./data-runtime.js";
import { createSeededRandom } from "./random.js";
import type { GameToolCall, GameToolDefinition } from "./game-tools.js";
import type { ClueState } from "./chapel-clues-runtime.js";

const LIMITS = Object.freeze({
  turns: 32,
  states: 12000,
  seeds: 16,
  milliseconds: 5000,
});

export type RouteStep = Readonly<{
  action: GameToolCall;
  state: ClueState;
  draws: readonly Readonly<{ sides: number; value: number }>[];
}>;
export type RouteWitness = Readonly<{
  seed: number;
  steps: readonly RouteStep[];
}>;
export type RouteEvidence = Readonly<{
  endings: Readonly<Record<string, RouteWitness>>;
  warnings: Readonly<Record<string, RouteWitness>>;
  physicalAfterFailure?: RouteWitness;
  exploredStates: number;
  seedAttempts: number;
}>;
export type RouteCheck =
  | Readonly<{ ok: true; evidence: RouteEvidence }>
  | Readonly<{ ok: false; diagnostics: readonly AdventureDiagnostic[] }>;

type Draw = Readonly<{ sides: number; value: number }>;
type Node = Readonly<{
  state: ClueState;
  steps: readonly RouteStep[];
  draws: readonly Draw[];
  failedSocial: boolean;
  socialSuccess: boolean;
  physicalEvidence: boolean;
  endingOfferedBeforeEvidence: boolean;
  socialEffectsBeforeEvidence: boolean;
}>;

function diagnostic(
  code: string,
  path: string,
  entity: string,
): AdventureDiagnostic {
  return { severity: "error", code, path, entity, message: code };
}

function parameters(
  tool: GameToolDefinition,
): readonly Record<string, string>[] {
  const properties = tool.parameters.properties as Record<
    string,
    Readonly<{ enum?: readonly string[] }>
  >;
  if (tool.name === "talk") {
    const speakers = properties.speakerId?.enum ?? [];
    const topics = properties.topicId?.enum ?? [];
    return speakers.flatMap((speakerId) =>
      topics.flatMap((topicId) =>
        ["ask", "persuade", "deceive", "intimidate"].map((approach) => ({
          speakerId,
          topicId,
          approach,
        })),
      ),
    );
  }
  const [key] = Object.keys(properties);
  return key === undefined
    ? [{}]
    : (properties[key]?.enum ?? []).map((value) => ({ [key]: value }));
}

function signature(node: Node): string {
  const { state } = node;
  return JSON.stringify([
    state.locationId,
    state.status,
    state.ending?.id,
    state.fighter.hp,
    [...state.discoveries].sort(),
    [...state.milestones].sort(),
    state.socialChallenges,
    state.npcLocations,
    state.npcHealth,
    state.npcDeathLocations,
    state.items,
    state.monsters,
    state.combat,
    node.draws.length,
    node.failedSocial,
    node.physicalEvidence,
    node.socialSuccess,
    node.endingOfferedBeforeEvidence,
    node.socialEffectsBeforeEvidence,
  ]);
}

function conditionHolds(state: ClueState, condition: ClueCondition): boolean {
  switch (condition.type) {
    case "discovery-known":
      return state.discoveries.includes(condition.id);
    case "milestone-recorded":
      return state.milestones.includes(condition.id);
    case "actor-alive":
      return (state.npcHealth?.[condition.id]?.hp ?? 1) > 0;
    case "actor-dead":
      return state.npcHealth?.[condition.id]?.hp === 0;
    case "actor-dead-at":
      return (
        state.npcHealth?.[condition.id]?.hp === 0 &&
        state.npcDeathLocations?.[condition.id] === condition.locationId
      );
  }
}

function warningProven(
  snapshot: ChapelCluesDefinition,
  path: string,
  state: ClueState,
  offeredResolution: boolean,
): boolean {
  const parts = path.split("/");
  const index = Number(parts[2]);
  if (path === "/endings/any") {
    return offeredResolution;
  }
  if (parts[1] === "endings" && parts[2] === "when") {
    return (
      offeredResolution &&
      conditionHolds(state, snapshot.endings!.when[Number(parts[3])]!)
    );
  }
  if (parts[1] === "discoveries") {
    return state.discoveries.includes(snapshot.discoveries[index]!.id);
  }
  if (parts[1] === "quest" && parts[2] === "milestones") {
    return state.milestones.includes(
      snapshot.quest.milestones[Number(parts[3])]!,
    );
  }
  if (parts[1] === "locations") {
    return state.locationId === snapshot.locations[index]!.id;
  }
  return false;
}

function checkNonMutations(
  runtime: ReturnType<typeof createDataRuntime>,
  state: ClueState,
): boolean {
  const before = JSON.stringify(state);
  const noDraw = {
    roll: (): number => {
      throw new Error("read or rejection consumed a draw");
    },
  };
  for (const name of runtime.readToolNames) {
    const tool = runtime
      .getGameToolDefinitions(state)
      .find((entry) => entry.name === name);
    if (tool === undefined) {
      continue;
    }
    const args = parameters(tool)[0];
    if (args === undefined) {
      continue;
    }
    const result = runtime.dispatchGameTool(
      state,
      { name, argumentsJson: JSON.stringify(args) },
      noDraw,
    );
    if (
      !result.modelOutput.ok ||
      JSON.stringify(state) !== before ||
      JSON.stringify(result.state) !== before
    ) {
      return false;
    }
  }
  const offeredSearch = runtime
    .getGameToolDefinitions(state)
    .find((tool) => tool.name === "search");
  const searchTargets =
    (
      offeredSearch?.parameters.properties as
        Record<string, { enum?: string[] }> | undefined
    )?.target?.enum ?? [];
  let forged = "__forged_hidden_target__";
  while (searchTargets.includes(forged)) {
    forged += "_";
  }
  const rejected = runtime.dispatchGameTool(
    state,
    {
      name: "search",
      argumentsJson: JSON.stringify({ target: forged }),
    },
    noDraw,
  );
  return (
    !rejected.modelOutput.ok &&
    JSON.stringify(state) === before &&
    JSON.stringify(rejected.state) === before
  );
}

function physicalEvidenceRequired(
  runtime: ReturnType<typeof createDataRuntime>,
  snapshot: ChapelCluesDefinition,
  witness: RouteWitness,
): boolean {
  const random = createSeededRandom(witness.seed);
  let state = runtime.createSession() as ClueState;
  let original = state;
  let failed = false;
  let omitted = false;
  for (const step of witness.steps) {
    const gainedEvidence =
      step.action.name === "search" &&
      failed &&
      (step.state.discoveries.length > original.discoveries.length ||
        step.state.milestones.length > original.milestones.length);
    original = step.state;
    if (gainedEvidence) {
      omitted = true;
      for (const draw of step.draws) {
        random.roll(draw.sides);
      }
      continue;
    }
    const args = JSON.parse(step.action.argumentsJson) as Record<
      string,
      string
    >;
    const intent =
      step.action.name === "resolve_quest"
        ? `resolve ${snapshot.endings?.choices.find((choice) => choice.id === args.resolutionId)?.label ?? ""}`
        : undefined;
    let result;
    const actualDraws: Draw[] = [];
    try {
      result = runtime.dispatchGameTool(
        state,
        step.action,
        {
          roll(sides) {
            const value = random.roll(sides);
            actualDraws.push({ sides, value });
            return value;
          },
        },
        intent,
      );
    } catch {
      return false;
    }
    if (JSON.stringify(actualDraws) !== JSON.stringify(step.draws)) {
      return false;
    }
    if (!result.modelOutput.ok) {
      continue;
    }
    if (
      result.engineResult !== undefined &&
      "events" in result.engineResult &&
      result.engineResult.events.some(
        (event) => event.type === "clue" && event.check?.result === "failure",
      )
    ) {
      failed = true;
    }
    state = result.state as ClueState;
  }
  return omitted && state.status !== "victory";
}

/** Search only actions offered by the ordinary runtime and commit them through its public tool dispatcher. */
export function proveGenerationRoutes(
  adventure: ValidatedAdventure,
  warnings: readonly AdventureDiagnostic[],
): RouteCheck {
  if (adventure.snapshot.schemaVersion !== 3) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "unsupported-routes",
          "/schemaVersion",
          adventure.snapshot.id,
        ),
      ],
    };
  }
  const snapshot = adventure.snapshot;
  const runtime = createDataRuntime(adventure);
  const requiredWarnings = warnings.filter(
    (entry) => entry.code === "analysis-incomplete",
  );
  const endings: Record<string, RouteWitness> = {};
  const warningEvidence: Record<string, RouteWitness> = {};
  const needsSocialFallback = (snapshot.socialChallenges ?? []).length > 0;
  let physicalAfterFailure: RouteWitness | undefined;
  let exploredStates = 0;
  let seedAttempts = 0;
  let limited = false;
  let unsupported = false;
  const began = performance.now();
  const complete = () =>
    snapshot.endings?.choices.every(
      (choice) => endings[choice.id] !== undefined,
    ) &&
    requiredWarnings.every(
      (entry) => warningEvidence[entry.path] !== undefined,
    ) &&
    (!needsSocialFallback || physicalAfterFailure !== undefined);

  for (let seed = 0; seed < LIMITS.seeds && !complete(); seed++) {
    seedAttempts++;
    const initial = runtime.createSession() as ClueState;
    const start: Node = {
      state: initial,
      steps: [],
      draws: [],
      failedSocial: false,
      socialSuccess: false,
      physicalEvidence: false,
      endingOfferedBeforeEvidence: false,
      socialEffectsBeforeEvidence: false,
    };
    const queue: Node[] = [start];
    const seen = new Set([signature(start)]);
    for (let cursor = 0; cursor < queue.length && !complete(); cursor++) {
      if (
        exploredStates >= LIMITS.states ||
        performance.now() - began >= LIMITS.milliseconds
      ) {
        limited = true;
        break;
      }
      const node = queue[cursor]!;
      exploredStates++;
      try {
        if (!checkNonMutations(runtime, node.state)) {
          return {
            ok: false,
            diagnostics: [
              diagnostic("non-mutating-action-changed-state", "/", snapshot.id),
            ],
          };
        }
      } catch {
        return {
          ok: false,
          diagnostics: [
            diagnostic("non-mutating-action-consumed-draw", "/", snapshot.id),
          ],
        };
      }
      const tools = runtime.getGameToolDefinitions(node.state);
      const offeredResolution = tools.some(
        (tool) => tool.name === "resolve_quest",
      );
      const witness = { seed, steps: node.steps };
      for (const warning of requiredWarnings) {
        if (
          warningEvidence[warning.path] === undefined &&
          warningProven(snapshot, warning.path, node.state, offeredResolution)
        ) {
          warningEvidence[warning.path] = witness;
        }
      }
      if (node.state.status === "victory" && node.state.ending !== undefined) {
        endings[node.state.ending.id] ??= witness;
        if (
          node.failedSocial &&
          !node.socialSuccess &&
          node.physicalEvidence &&
          !node.endingOfferedBeforeEvidence &&
          !node.socialEffectsBeforeEvidence &&
          physicalEvidenceRequired(runtime, snapshot, witness)
        ) {
          physicalAfterFailure ??= witness;
        }
        continue;
      }
      if (
        node.state.status !== "playing" ||
        node.steps.length >= LIMITS.turns
      ) {
        continue;
      }
      for (const tool of tools) {
        if (!runtime.mutationToolNames.includes(tool.name)) {
          continue;
        }
        for (const args of parameters(tool)) {
          const action: GameToolCall = {
            name: tool.name,
            argumentsJson: JSON.stringify(args),
          };
          const rng = createSeededRandom(seed);
          for (const draw of node.draws) {
            if (rng.roll(draw.sides) !== draw.value) {
              unsupported = true;
              break;
            }
          }
          if (unsupported) {
            break;
          }
          const newDraws: Draw[] = [];
          const random = {
            roll(sides: number) {
              const value = rng.roll(sides);
              newDraws.push({ sides, value });
              return value;
            },
          };
          const intent =
            tool.name === "resolve_quest"
              ? `resolve ${snapshot.endings?.choices.find((choice) => choice.id === args.resolutionId)?.label ?? ""}`
              : undefined;
          let result;
          try {
            result = runtime.dispatchGameTool(
              node.state,
              action,
              random,
              intent,
            );
          } catch {
            unsupported = true;
            break;
          }
          if (!result.modelOutput.ok) {
            if (newDraws.length > 0 || result.state !== node.state) {
              return {
                ok: false,
                diagnostics: [
                  diagnostic("rejected-action-changed-state", "/", snapshot.id),
                ],
              };
            }
            continue;
          }
          const nextState = result.state as ClueState;
          if (nextState === node.state && newDraws.length === 0) {
            continue;
          }
          const failedSocial =
            node.failedSocial ||
            (result.engineResult !== undefined &&
              "events" in result.engineResult &&
              result.engineResult.events.some(
                (event) =>
                  event.type === "clue" && event.check?.result === "failure",
              ));
          const socialSuccess =
            node.socialSuccess ||
            (result.engineResult !== undefined &&
              "events" in result.engineResult &&
              result.engineResult.events.some(
                (event) =>
                  event.type === "clue" && event.check?.result === "success",
              ));
          const searchGainedEvidence =
            tool.name === "search" &&
            failedSocial &&
            (nextState.discoveries.length > node.state.discoveries.length ||
              nextState.milestones.length > node.state.milestones.length);
          const next: Node = {
            state: nextState,
            steps: [
              ...node.steps,
              { action, state: nextState, draws: newDraws },
            ],
            draws: [...node.draws, ...newDraws],
            failedSocial,
            socialSuccess,
            physicalEvidence: node.physicalEvidence || searchGainedEvidence,
            endingOfferedBeforeEvidence:
              node.endingOfferedBeforeEvidence ||
              (node.failedSocial &&
                !node.physicalEvidence &&
                offeredResolution),
            socialEffectsBeforeEvidence:
              node.socialEffectsBeforeEvidence ||
              (tool.name === "talk" &&
                !node.physicalEvidence &&
                (nextState.discoveries.length > node.state.discoveries.length ||
                  nextState.milestones.length > node.state.milestones.length ||
                  JSON.stringify(nextState.npcLocations) !==
                    JSON.stringify(node.state.npcLocations))),
          };
          const key = signature(next);
          if (!seen.has(key)) {
            seen.add(key);
            queue.push(next);
          }
        }
        if (unsupported) {
          break;
        }
      }
      if (unsupported) {
        break;
      }
    }
    if (limited || unsupported) {
      break;
    }
  }
  if (complete()) {
    return {
      ok: true,
      evidence: {
        endings,
        warnings: warningEvidence,
        ...(physicalAfterFailure === undefined ? {} : { physicalAfterFailure }),
        exploredStates,
        seedAttempts,
      },
    };
  }
  const failures: AdventureDiagnostic[] = [];
  for (const choice of snapshot.endings?.choices ?? []) {
    if (endings[choice.id] === undefined) {
      failures.push(
        diagnostic(
          "route-incomplete",
          `/endings/choices/${snapshot.endings!.choices.indexOf(choice)}`,
          choice.id,
        ),
      );
    }
  }
  for (const warning of requiredWarnings) {
    if (warningEvidence[warning.path] === undefined) {
      failures.push(
        diagnostic(
          "warning-without-witness",
          warning.path ?? "",
          warning.entity ?? snapshot.id,
        ),
      );
    }
  }
  if (needsSocialFallback && physicalAfterFailure === undefined) {
    failures.push(
      diagnostic(
        "physical-fallback-incomplete",
        "/socialChallenges",
        snapshot.id,
      ),
    );
  }
  if (limited || unsupported) {
    failures.unshift(
      diagnostic(
        unsupported ? "unsupported-route-condition" : "route-search-exhausted",
        "/",
        snapshot.id,
      ),
    );
  }
  return { ok: false, diagnostics: failures };
}
