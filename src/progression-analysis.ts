import type {
  AdventureDiagnostic,
  ChapelCluesDefinition,
  ClueCondition,
  ClueEffect,
} from "./adventure-loader.js";

type Producer = Readonly<{
  path: string;
  entity: string;
  locationId: string;
  when: readonly ClueCondition[];
  effects: readonly ClueEffect[];
  unsupported: boolean;
}>;

const fact = (condition: ClueCondition): string =>
  `${condition.type}/${condition.id}`;
const output = (effect: ClueEffect): string =>
  `${effect.type === "grant-discovery" ? "discovery-known" : "milestone-recorded"}/${effect.id}`;
const positive = (condition: ClueCondition): boolean =>
  condition.type === "discovery-known" ||
  condition.type === "milestone-recorded";

/** A monotone may-reach analysis. Unknown mechanics may add facts only in the
 * optimistic pass; the supported pass never treats them as proven. */
export function analyzeProgression(
  snapshot: ChapelCluesDefinition,
): AdventureDiagnostic[] {
  const diagnostics: AdventureDiagnostic[] = [];
  const report = (
    severity: "error" | "warning",
    code: string,
    path: string,
    entity: string,
    message: string,
  ) => diagnostics.push({ severity, code, path, entity, message });
  const producers: Producer[] = [];
  const shadows = (
    earlier: readonly ClueCondition[],
    later: readonly ClueCondition[],
  ) =>
    earlier.every((condition) =>
      later.some(
        (candidate) =>
          candidate.type === condition.type &&
          candidate.id === condition.id &&
          candidate.locationId === condition.locationId &&
          candidate.tier === condition.tier &&
          candidate.at === condition.at,
      ),
    );
  const shadowedOutputs = new Set<string>();
  const combatLocations = new Set(
    (snapshot.monsters ?? []).map((monster) => monster.locationId),
  );
  snapshot.searches.forEach((search, i) => {
    const feature = snapshot.features.find(
      (entry) => entry.id === search.targetId,
    );
    if (feature !== undefined) {
      if (
        snapshot.searches
          .slice(0, i)
          .some(
            (earlier) =>
              earlier.targetId === search.targetId &&
              shadows(earlier.when, search.when),
          )
      ) {
        search.effects
          .filter(
            (effect) =>
              effect.type === "grant-discovery" ||
              effect.type === "record-milestone",
          )
          .forEach((effect) => shadowedOutputs.add(output(effect)));
        return;
      }
      producers.push({
        path: `/searches/${i}`,
        entity: search.id,
        locationId: feature.locationId,
        when: [...feature.when, ...search.when],
        effects: search.effects,
        unsupported: combatLocations.has(feature.locationId),
      });
    }
  });
  (snapshot.npcs ?? []).forEach((npc, i) => {
    npc.topics.forEach((topic, j) => {
      topic.replies.forEach((reply, k) => {
        if (reply.effects.length > 0) {
          if (
            topic.replies
              .slice(0, k)
              .some(
                (earlier) =>
                  shadows(earlier.when, reply.when) &&
                  (earlier.outcome === "any" ||
                    (topic.challengeId === "none" &&
                      earlier.outcome === "unattempted") ||
                    earlier.outcome === reply.outcome) &&
                  (earlier.approach === "any" ||
                    earlier.approach === reply.approach),
              )
          ) {
            reply.effects
              .filter(
                (effect) =>
                  effect.type === "grant-discovery" ||
                  effect.type === "record-milestone",
              )
              .forEach((effect) => shadowedOutputs.add(output(effect)));
            return;
          }
          producers.push({
            path: `/npcs/${i}/topics/${j}/replies/${k}`,
            entity: topic.id,
            locationId: npc.locationId,
            when: [...(npc.when ?? []), ...topic.when, ...reply.when],
            effects: reply.effects,
            unsupported:
              combatLocations.has(npc.locationId) ||
              reply.outcome === "success" ||
              reply.outcome === "failure" ||
              reply.effects.some((effect) => effect.type === "relocate-npc"),
          });
        }
      });
    });
    if (npc.remains?.search !== undefined) {
      producers.push({
        path: `/npcs/${i}/remains/search`,
        entity: npc.id,
        locationId: npc.locationId,
        when: [{ type: "actor-dead", id: npc.id }],
        effects: npc.remains.search.effects,
        unsupported: true,
      });
    }
  });
  (snapshot.encounters ?? []).forEach((encounter, i) => {
    const monster = snapshot.monsters?.find(
      (entry) => entry.id === encounter.monsterId,
    );
    if (monster !== undefined) {
      producers.push({
        path: `/encounters/${i}`,
        entity: encounter.id,
        locationId: monster.locationId,
        when: encounter.when,
        effects: encounter.effects,
        unsupported: true,
      });
    }
  });
  (snapshot.clocks ?? []).forEach((clock, i) =>
    clock.thresholds.forEach((threshold, j) => {
      producers.push({
        path: `/clocks/${i}/thresholds/${j}`,
        entity: clock.id,
        locationId: snapshot.player.locationId,
        when: [],
        effects: threshold.effects,
        unsupported: false,
      });
    }),
  );

  if (snapshot.questItem) {
    const quest = snapshot.questItem;
    const item = snapshot.items?.find(({ id }) => id === quest.itemId);
    const source = snapshot.features.find(({ id }) => id === item?.featureId);
    const target = snapshot.features.find(({ id }) => id === quest.featureId);
    if (source && target)
      producers.push({
        path: "/questItem",
        entity: quest.itemId,
        locationId: target.locationId,
        when: source.when,
        effects: [
          { type: "grant-discovery", id: quest.discoveryId },
          { type: "record-milestone", id: quest.milestoneId },
        ],
        unsupported: true,
      });
  }
  const seed = new Set([
    ...(snapshot.initialDiscoveries ?? []).map((id) => `discovery-known/${id}`),
    ...(snapshot.initialMilestones ?? []).map(
      (id) => `milestone-recorded/${id}`,
    ),
  ]);
  const run = (optimistic: boolean) => {
    const known = new Set(seed);
    const reached = new Set([snapshot.player.locationId]);
    let additions = 0;
    let evaluations = 0;
    const eligible = (conditions: readonly ClueCondition[]) => {
      for (const condition of conditions) {
        evaluations++;
        if (evaluations > 65536) {
          return false;
        }
        if (!positive(condition)) {
          if (!optimistic) {
            return false;
          }
        } else if (!known.has(fact(condition))) {
          return false;
        }
      }
      return true;
    };
    let changed = true;
    while (changed && additions < 512 && evaluations <= 65536) {
      changed = false;
      for (const route of snapshot.connections) {
        if (
          reached.has(route.from) &&
          !reached.has(route.to) &&
          (optimistic || !combatLocations.has(route.from)) &&
          eligible(route.when)
        ) {
          reached.add(route.to);
          additions++;
          changed = true;
        }
      }
      for (const producer of producers) {
        if (
          reached.has(producer.locationId) &&
          (optimistic || !producer.unsupported) &&
          eligible(producer.when)
        ) {
          for (const effect of producer.effects) {
            if (
              effect.type !== "grant-discovery" &&
              effect.type !== "record-milestone"
            ) {
              continue;
            }
            const value = output(effect);
            if (!known.has(value)) {
              known.add(value);
              additions++;
              changed = true;
            }
          }
        }
      }
    }
    return { known, reached, limited: additions >= 512 || evaluations > 65536 };
  };
  const supported = run(false);
  const possible = run(true);
  if (supported.limited || possible.limited) {
    report(
      "warning",
      "analysis-limit",
      "",
      snapshot.id,
      "Positive prerequisite analysis reached its 512 addition or 65536 evaluation limit; no impossibility conclusions are available.",
    );
    return diagnostics;
  }
  const required = new Set<string>();
  snapshot.endings?.when.forEach((condition, i) => {
    if (positive(condition)) {
      required.add(fact(condition));
    } else {
      report(
        "warning",
        "analysis-incomplete",
        `/endings/when/${i}`,
        snapshot.id,
        "Ending eligibility uses actor state; provide route evidence.",
      );
    }
  });
  // An ending's any-branches are alternatives, not independent requirements.
  const any = snapshot.endings?.any ?? [];
  const anySupported = any.some((branch) =>
    branch.every(
      (condition) =>
        positive(condition) && supported.known.has(fact(condition)),
    ),
  );
  const anyPossible = any.some((branch) =>
    branch.every(
      (condition) =>
        !positive(condition) || possible.known.has(fact(condition)),
    ),
  );
  if (any.length > 0 && !anySupported) {
    report(
      anyPossible ? "warning" : "error",
      anyPossible ? "analysis-incomplete" : "unreachable-required-progress",
      "/endings/any",
      snapshot.id,
      anyPossible
        ? "An ending alternative depends on unsupported behavior. Provide route evidence."
        : "No ending alternative can be reached from authored producers.",
    );
  }
  const hasUnsupportedProducer = (value: string) =>
    producers.some(
      (producer) =>
        (producer.unsupported || producer.when.some((c) => !positive(c))) &&
        producer.effects.some(
          (effect) =>
            (effect.type === "grant-discovery" ||
              effect.type === "record-milestone") &&
            output(effect) === value,
        ),
    );
  const listed = [
    ...snapshot.discoveries.map((entry, i) => ({
      value: `discovery-known/${entry.id}`,
      path: `/discoveries/${i}`,
      id: entry.id,
    })),
    ...snapshot.quest.milestones.map((id, i) => ({
      value: `milestone-recorded/${id}`,
      path: `/quest/milestones/${i}`,
      id,
    })),
  ];
  for (const entry of listed) {
    if (supported.known.has(entry.value)) {
      continue;
    }
    const isRequired = required.has(entry.value);
    const hasProducer = producers.some((producer) =>
      producer.effects.some(
        (effect) =>
          (effect.type === "grant-discovery" ||
            effect.type === "record-milestone") &&
          output(effect) === entry.value,
      ),
    );
    report(
      isRequired &&
        (!hasProducer ||
          (!possible.known.has(entry.value) &&
            !hasUnsupportedProducer(entry.value)))
        ? "error"
        : "warning",
      !hasProducer
        ? shadowedOutputs.has(entry.value)
          ? isRequired
            ? "unreachable-required-progress"
            : "unreachable-optional-progress"
          : "missing-producer"
        : possible.known.has(entry.value)
          ? "analysis-incomplete"
          : isRequired
            ? "unreachable-required-progress"
            : "unreachable-optional-progress",
      entry.path,
      entry.id,
      !hasProducer
        ? shadowedOutputs.has(entry.value)
          ? "Every authored producer branch is shadowed by an earlier eligible branch."
          : "No authored interaction or initial state produces this fact."
        : possible.known.has(entry.value)
          ? "Only unsupported behavior can establish this fact; provide route evidence."
          : "Positive prerequisites have no entry route.",
    );
  }
  snapshot.locations.forEach((location, i) => {
    if (!supported.reached.has(location.id)) {
      report(
        possible.reached.has(location.id) ? "warning" : "error",
        possible.reached.has(location.id)
          ? "analysis-incomplete"
          : "unreachable-required-location",
        `/locations/${i}`,
        location.id,
        possible.reached.has(location.id)
          ? "The location route depends on unsupported behavior."
          : "No directed route reaches this required location.",
      );
    }
  });
  return diagnostics;
}
