import type {
  AdventureDiagnostic,
  ChapelCluesDefinition,
  ClueCondition,
  ValidatedAdventure,
} from "./adventure-loader.js";
import type { ClueState } from "./chapel-clues-runtime.js";
import { createDataRuntime } from "./data-runtime.js";
import type { RouteEvidence, RouteWitness } from "./generation-routes.js";
import { createSeededRandom } from "./random.js";

function eligible(state: ClueState, conditions: readonly ClueCondition[]) {
  return conditions.every(({ type, id, locationId, tier, at }) => {
    switch (type) {
      case "discovery-known":
        return state.discoveries.includes(id);
      case "milestone-recorded":
        return state.milestones.includes(id);
      case "actor-alive":
        return (state.npcHealth?.[id]?.hp ?? 1) > 0;
      case "actor-dead":
        return state.npcHealth?.[id]?.hp === 0;
      case "actor-dead-at":
        return (
          state.npcHealth?.[id]?.hp === 0 &&
          state.npcDeathLocations?.[id] === locationId
        );
      case "relationship-tier":
        return state.relationships?.[id]?.tier === tier;
      case "clock-before":
        return (state.clocks?.[id] ?? 0) < (at ?? 0);
    }
  });
}

function ids(entries: readonly { id: string }[]) {
  return entries.map(({ id }) => id).sort();
}

function equalIds(
  actual: readonly { id: string }[],
  expected: readonly { id: string }[],
) {
  return JSON.stringify(ids(actual)) === JSON.stringify(ids(expected));
}

function diagnostic(
  code: string,
  path: string,
  entity: string,
): AdventureDiagnostic {
  return { severity: "error", code, path, entity, message: code };
}

/** Check witnessed public state and a small set of unambiguous prose contradictions. */
export function checkGenerationContinuity(
  adventure: ValidatedAdventure,
  routes: RouteEvidence,
): AdventureDiagnostic[] {
  if (adventure.snapshot.schemaVersion !== 3) {
    return [
      diagnostic(
        "unsupported-continuity",
        "/schemaVersion",
        adventure.snapshot.id,
      ),
    ];
  }
  const snapshot: ChapelCluesDefinition = adventure.snapshot;
  const runtime = createDataRuntime(adventure);
  const failures: AdventureDiagnostic[] = [];
  const visited = new Set<string>();
  const fail = (code: string, path: string) => {
    if (!failures.some((entry) => entry.code === code && entry.path === path)) {
      failures.push(diagnostic(code, path, snapshot.id));
    }
  };
  const endingClaims = [
    ...(snapshot.endings?.fates.map((fate) => fate.text) ?? []),
    ...(snapshot.endings?.choices ?? []).flatMap((choice) => [
      ...choice.consequences.map((entry) => entry.text),
      ...choice.narration.map((entry) => entry.text),
    ]),
  ]
    .map((text) => {
      const normalized = text.trim().toLocaleLowerCase();
      return {
        text: normalized,
        possible: /\b(?:can|could|may|might|will|would|should)\b/iu.test(
          normalized,
        ),
      };
    })
    .filter((claim) => claim.text.length >= 12);
  const contentWords = (text: string) =>
    (text.toLocaleLowerCase().match(/[a-z]+/gu) ?? []).filter(
      (word) =>
        ![
          "a",
          "an",
          "the",
          "is",
          "are",
          "was",
          "were",
          "has",
          "have",
          "been",
          "already",
          "now",
          "can",
          "could",
          "will",
          "with",
          "to",
          "of",
          "and",
          "for",
          "in",
          "it",
          "its",
        ].includes(word),
    );
  const publicProse: [string, string][] = [
    ["/introduction", snapshot.introduction],
    ["/objective", snapshot.objective],
    ...snapshot.locations.flatMap((entry, index): [string, string][] => [
      [`/locations/${index}/description`, entry.description],
      ...(entry.descriptions ?? []).map(
        (variant, variantIndex): [string, string] => [
          `/locations/${index}/descriptions/${variantIndex}/text`,
          variant.text,
        ],
      ),
    ]),
    ...snapshot.features.flatMap((entry, index): [string, string][] => [
      [`/features/${index}/description`, entry.description],
      ...(entry.descriptions ?? []).map(
        (variant, variantIndex): [string, string] => [
          `/features/${index}/descriptions/${variantIndex}/text`,
          variant.text,
        ],
      ),
    ]),
    ...snapshot.discoveries.flatMap((entry, index): [string, string][] => [
      [`/discoveries/${index}/summary`, entry.summary],
      [`/discoveries/${index}/lead`, entry.lead],
      ...(entry.leads ?? []).map((variant, variantIndex): [string, string] => [
        `/discoveries/${index}/leads/${variantIndex}/text`,
        variant.text,
      ]),
    ]),
    ...snapshot.searches.map((entry, index): [string, string] => [
      `/searches/${index}/text`,
      entry.text,
    ]),
    ...(snapshot.npcs ?? []).flatMap((npc, npcIndex) =>
      npc.topics.flatMap((topic, topicIndex) =>
        topic.replies.map((reply, replyIndex): [string, string] => [
          `/npcs/${npcIndex}/topics/${topicIndex}/replies/${replyIndex}/text`,
          reply.text,
        ]),
      ),
    ),
    ...(snapshot.items ?? []).map((entry, index): [string, string] => [
      `/items/${index}/description`,
      entry.description,
    ]),
    ...(snapshot.monsterDefinitions ?? []).map(
      (entry, index): [string, string] => [
        `/monsterDefinitions/${index}/description`,
        entry.description,
      ],
    ),
  ];
  for (const [path, prose] of publicProse) {
    if (
      endingClaims.some((claim) => {
        const lower = prose.toLocaleLowerCase();
        if (lower.includes(claim.text)) {
          return !claim.possible;
        }
        if (
          !/\b(?:already|has been|have been|is now|was|were)\b/iu.test(lower)
        ) {
          return false;
        }
        const words = contentWords(claim.text);
        const present = new Set(contentWords(lower));
        return (
          words.length >= 2 &&
          words.filter((word) => present.has(word)).length >=
            Math.max(2, Math.ceil(words.length * 0.6))
        );
      })
    ) {
      fail("premature-ending-claim", path);
    }
    if (
      /\b(?:spell slots?|saving throws?|proficiency bonus|experience points?|level up)\b/iu.test(
        prose,
      )
    ) {
      fail("unsupported-mechanic-claim", path);
    }
  }
  const inspect = (state: ClueState, path: string) => {
    const scene = runtime.projectDmScene(state);
    const status = runtime.projectCharacterStatus(state);
    const tools = runtime.getGameToolDefinitions(state);
    const here = snapshot.locations.find(
      (entry) => entry.id === state.locationId,
    )!;
    const exits = snapshot.connections
      .filter(
        (entry) =>
          entry.from === state.locationId && eligible(state, entry.when),
      )
      .map((entry) => ({ id: entry.to }));
    const features = snapshot.features.filter(
      (entry) =>
        entry.locationId === state.locationId && eligible(state, entry.when),
    );
    const npcs = (snapshot.npcs ?? []).filter(
      (entry) =>
        (state.npcLocations?.[entry.id] ?? entry.locationId) ===
          state.locationId &&
        (state.npcHealth?.[entry.id]?.hp ?? 1) > 0 &&
        eligible(state, entry.when ?? []),
    );
    const items = (snapshot.items ?? []).filter(
      (entry) =>
        entry.locationId === state.locationId &&
        state.items?.[entry.id] === "room" &&
        features.some((feature) => feature.id === entry.featureId),
    );
    const carried = (snapshot.items ?? []).filter(
      (entry) => state.items?.[entry.id] === "inventory",
    );
    const remains = (snapshot.npcs ?? []).filter(
      (entry) =>
        entry.remains !== undefined &&
        state.npcHealth?.[entry.id]?.hp === 0 &&
        state.npcDeathLocations?.[entry.id] === state.locationId,
    );
    const opponents = (snapshot.monsters ?? []).filter(
      (entry) =>
        entry.locationId === state.locationId &&
        (state.monsters?.[entry.id]?.hp === 0 ||
          (snapshot.encounters ?? []).some(
            (encounter) =>
              encounter.monsterId === entry.id &&
              eligible(state, encounter.when),
          )),
    );
    const choices =
      state.status === "playing" &&
      state.combat === undefined &&
      snapshot.endings?.locationId === state.locationId &&
      eligible(state, snapshot.endings.when) &&
      snapshot.endings.any.some((branch) => eligible(state, branch))
        ? snapshot.endings.choices.filter((choice) =>
            eligible(state, choice.when),
          )
        : [];
    const activeOpponent =
      state.combat !== undefined &&
      ((state.monsters?.[state.combat.opponentId]?.hp ?? 0) > 0 ||
        (state.npcHealth?.[state.combat.opponentId]?.hp ?? 0) > 0)
        ? state.combat.opponentId
        : undefined;
    const searchTargets =
      state.status === "playing" && activeOpponent === undefined
        ? [
            ...features
              .filter((feature) =>
                snapshot.searches.some(
                  (search) =>
                    search.targetId === feature.id &&
                    eligible(state, search.when) &&
                    search.effects.some((effect) =>
                      effect.type === "grant-discovery"
                        ? !state.discoveries.includes(effect.id)
                        : !state.milestones.includes(effect.id),
                    ),
                ),
              )
              .map((entry) => entry.id),
            ...remains
              .filter((npc) =>
                npc.remains?.search?.effects.some((effect) =>
                  effect.type === "grant-discovery"
                    ? !state.discoveries.includes(effect.id)
                    : !state.milestones.includes(effect.id),
                ),
              )
              .map((entry) => entry.id),
          ]
        : [];
    const attackTargets =
      state.status !== "playing"
        ? []
        : activeOpponent !== undefined
          ? [activeOpponent]
          : npcs
              .filter((entry) => entry.combat !== undefined)
              .map((entry) => entry.id);
    const values = (name: string, field: string): string[] => {
      const tool = tools.find((entry) => entry.name === name);
      const property = (
        tool?.parameters.properties as
          Record<string, { enum?: string[] }> | undefined
      )?.[field];
      return property?.enum ?? [];
    };
    const same = (actual: readonly string[], expected: readonly string[]) =>
      JSON.stringify([...actual].sort()) ===
      JSON.stringify([...expected].sort());
    if (
      scene.room.id !== here.id ||
      scene.room.name !== here.name ||
      scene.outcome !== state.status ||
      !equalIds(scene.room.features, features) ||
      !same(
        scene.room.exits.map((entry) => entry.destinationId),
        exits.map((entry) => entry.id),
      ) ||
      !equalIds(
        (scene.room.npcs ?? []).filter((entry) => entry.condition === "living"),
        npcs,
      ) ||
      !equalIds(
        (scene.room.npcs ?? []).filter((entry) => entry.condition === "dead"),
        remains,
      ) ||
      !equalIds(scene.room.opponents, opponents) ||
      !equalIds(scene.room.items, items) ||
      !equalIds(status.collectedItems, carried) ||
      scene.journal === undefined ||
      !same(
        scene.journal.discoveries.map((entry) => entry.id),
        state.discoveries,
      ) ||
      !same(scene.journal.quest.milestones, state.milestones) ||
      status.hp !== state.fighter.hp ||
      status.outcome !== state.status
    ) {
      fail("continuity-projection", path);
    }
    if (
      !same(
        values("resolve_quest", "resolutionId"),
        choices.map((entry) => entry.id),
      ) ||
      !same(
        values("take", "item_id"),
        state.combat === undefined && state.status === "playing"
          ? items.map((entry) => entry.id)
          : [],
      ) ||
      !same(
        values("use_item", "item_id"),
        state.status === "playing" ? carried.map((entry) => entry.id) : [],
      ) ||
      !same(
        values("move", "destinationId"),
        state.combat === undefined && state.status === "playing"
          ? exits.map((entry) => entry.id)
          : [],
      ) ||
      !same(
        values("talk", "speakerId"),
        state.combat === undefined &&
          state.status === "playing" &&
          npcs.some((npc) =>
            npc.topics.some((topic) => eligible(state, topic.when)),
          )
          ? npcs.map((entry) => entry.id)
          : [],
      ) ||
      !same(values("search", "target"), searchTargets) ||
      !same(values("attack", "opponent_id"), attackTargets)
    ) {
      fail("continuity-actions", path);
    }
    const look = runtime.handleAction(state, { type: "look" });
    const rendered = runtime.renderResult(look);
    if (
      look.rejection !== undefined ||
      look.state !== state ||
      !rendered.startsWith(`${here.name}\n`) ||
      !rendered.includes(
        `Exits: ${exits.map(({ id }) => snapshot.locations.find((entry) => entry.id === id)!.name).join(", ") || "none"}.`,
      ) ||
      (choices.length === 0 && rendered.includes("Ending choices:")) ||
      (choices.length > 0 && !rendered.includes("Ending choices:"))
    ) {
      fail("continuity-command-view", path);
    }
    const read = runtime.dispatchGameTool(state, {
      name: "look",
      argumentsJson: "{}",
    });
    if (
      !read.modelOutput.ok ||
      read.state !== state ||
      JSON.stringify(read.modelOutput.scene) !== JSON.stringify(scene)
    ) {
      fail("continuity-scripted-view", path);
    }
    if (
      state.status !== "playing" &&
      tools.some((tool) => runtime.mutationToolNames.includes(tool.name))
    ) {
      fail("continuity-terminal-actions", path);
    }
  };
  const checkWitness = (witness: RouteWitness, name: string) => {
    const random = createSeededRandom(witness.seed);
    let state = runtime.createSession() as ClueState;
    for (let index = 0; index <= witness.steps.length; index++) {
      const path = `/routes/${name}/${index}`;
      const key = JSON.stringify(state);
      if (!visited.has(key)) {
        visited.add(key);
        inspect(state, path);
      }
      const step = witness.steps[index];
      if (step === undefined) {
        break;
      }
      const args = JSON.parse(step.action.argumentsJson) as Record<
        string,
        string
      >;
      const intent =
        step.action.name === "resolve_quest"
          ? `resolve ${snapshot.endings?.choices.find((choice) => choice.id === args.resolutionId)?.label ?? ""}`
          : undefined;
      const draws: { sides: number; value: number }[] = [];
      const result = runtime.dispatchGameTool(
        state,
        step.action,
        {
          roll(sides) {
            const value = random.roll(sides);
            draws.push({ sides, value });
            return value;
          },
        },
        intent,
      );
      if (
        !result.modelOutput.ok ||
        JSON.stringify(draws) !== JSON.stringify(step.draws) ||
        JSON.stringify(result.state) !== JSON.stringify(step.state)
      ) {
        fail("continuity-route-drift", path);
        break;
      }
      state = result.state as ClueState;
    }
    if (state.status === "victory") {
      const before = JSON.stringify(state);
      const rejected = runtime.dispatchGameTool(
        state,
        { name: "search", argumentsJson: '{"target":"__hidden__"}' },
        {
          roll() {
            throw new Error("Terminal rejection consumed a draw.");
          },
        },
      );
      if (
        rejected.modelOutput.ok ||
        JSON.stringify(rejected.state) !== before
      ) {
        fail("continuity-terminal-mutation", `/routes/${name}`);
      }
    }
  };
  for (const [name, witness] of Object.entries(routes.endings)) {
    checkWitness(witness, name);
  }
  if (routes.physicalAfterFailure !== undefined) {
    checkWitness(routes.physicalAfterFailure, "physical-fallback");
  }
  for (const [name, witness] of Object.entries(routes.warnings)) {
    checkWitness(witness, `warning-${name.replaceAll("/", "-")}`);
  }
  return failures;
}
