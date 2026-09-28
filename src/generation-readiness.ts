import type {
  AdventureDiagnostic,
  ChapelCluesDefinition,
  ClueCondition,
  ClueEffect,
} from "./adventure-loader.js";

type State = { location: string; facts: Set<string>; fought: Set<string> };
const key = (type: string, id: string) => `${type}/${id}`;
const positive = (conditions: readonly ClueCondition[], facts: Set<string>) =>
  conditions.every(
    (condition) =>
      (condition.type === "discovery-known" ||
        condition.type === "milestone-recorded") &&
      facts.has(key(condition.type, condition.id)),
  );
const apply = (facts: Set<string>, effects: readonly ClueEffect[]) => {
  const next = new Set(facts);
  for (const effect of effects) {
    if (effect.type === "grant-discovery") {
      next.add(key("discovery-known", effect.id));
    } else if (effect.type === "record-milestone") {
      next.add(key("milestone-recorded", effect.id));
    }
  }
  return next;
};
const signature = (state: State) =>
  `${state.location}|${[...state.facts].sort().join(",")}|${[...state.fought].sort().join(",")}`;

function explore(snapshot: ChapelCluesDefinition, omittedNpc?: string) {
  const monsters = snapshot.monsters ?? [];
  const encounters = snapshot.encounters ?? [];
  const start: State = {
    location: snapshot.player.locationId,
    facts: new Set([
      ...(snapshot.initialDiscoveries ?? []).map((id) =>
        key("discovery-known", id),
      ),
      ...(snapshot.initialMilestones ?? []).map((id) =>
        key("milestone-recorded", id),
      ),
    ]),
    fought: new Set(),
  };
  const queue = [start];
  const seen = new Set([signature(start)]);
  const locations = new Set<string>();
  const discoveries = new Set<string>();
  const visibleNpcs = new Set<string>();
  const triggeredEncounters = new Set<string>();
  const availableChoices = new Map<string, Set<string>>();
  let completion = false;
  let limited = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (queue.length > 50000) {
      limited = true;
      break;
    }
    const state = queue[cursor]!;
    locations.add(state.location);
    for (const fact of state.facts) {
      if (fact.startsWith("discovery-known/")) {
        discoveries.add(fact);
      }
    }
    const add = (next: State) => {
      let facts = next.facts;
      const fought = new Set(next.fought);
      for (const monster of monsters.filter(
        (entry) => entry.locationId === next.location && !fought.has(entry.id),
      )) {
        const encounter = encounters.find(
          (entry) => entry.monsterId === monster.id,
        );
        if (encounter === undefined || !positive(encounter.when, facts)) {
          continue;
        }
        if (fought.size >= 1) {
          return;
        }
        fought.add(monster.id);
        triggeredEncounters.add(encounter.id);
        facts = apply(facts, encounter.effects);
      }
      const resolved = { ...next, facts, fought };
      const id = signature(resolved);
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(resolved);
      }
    };
    const ending = snapshot.endings;
    if (
      ending !== undefined &&
      state.location === ending.locationId &&
      positive(ending.when, state.facts) &&
      (ending.any.length === 0 ||
        ending.any.some((branch) => positive(branch, state.facts)))
    ) {
      const choicesAtEnding = new Map<string, Set<string>>();
      for (const choice of ending.choices) {
        if (positive(choice.when, state.facts)) {
          const outcomes = new Set([
            ...choice.consequences
              .filter((entry) => positive(entry.when, state.facts))
              .map((entry) => entry.text.trim().toLowerCase()),
            ...choice.narration
              .filter((entry) => positive(entry.when, state.facts))
              .map((entry) => entry.text.trim().toLowerCase()),
          ]);
          if (outcomes.size > 0) {
            availableChoices.set(choice.id, outcomes);
            choicesAtEnding.set(choice.id, outcomes);
          }
        }
      }
      completion ||= choicesAtEnding.size >= 2;
    }
    for (const route of snapshot.connections) {
      if (route.from !== state.location || !positive(route.when, state.facts)) {
        continue;
      }
      add({ ...state, location: route.to });
    }
    for (const feature of snapshot.features) {
      if (
        feature.locationId !== state.location ||
        !positive(feature.when, state.facts)
      ) {
        continue;
      }
      const search = snapshot.searches.find(
        (entry) =>
          entry.targetId === feature.id && positive(entry.when, state.facts),
      );
      if (search !== undefined) {
        add({ ...state, facts: apply(state.facts, search.effects) });
      }
    }
    for (const npc of snapshot.npcs ?? []) {
      if (
        npc.id === omittedNpc ||
        npc.locationId !== state.location ||
        !positive(npc.when ?? [], state.facts)
      ) {
        continue;
      }
      visibleNpcs.add(npc.id);
      for (const topic of npc.topics) {
        if (!positive(topic.when, state.facts)) {
          continue;
        }
        const reply = topic.replies.find(
          (entry) =>
            (entry.outcome === "any" || entry.outcome === "unattempted") &&
            (entry.approach === "any" || entry.approach === "ask") &&
            positive(entry.when, state.facts),
        );
        if (reply !== undefined) {
          add({ ...state, facts: apply(state.facts, reply.effects) });
        }
      }
    }
  }
  return {
    locations,
    discoveries,
    visibleNpcs,
    triggeredEncounters,
    availableChoices,
    completion,
    limited,
  };
}

export function checkGenerationReadiness(
  snapshot: ChapelCluesDefinition,
): AdventureDiagnostic[] {
  const failures: AdventureDiagnostic[] = [];
  const fail = (code: string, path: string, entity: string) =>
    failures.push({
      severity: "error",
      code,
      path,
      entity,
      message: code,
    });
  const count = snapshot.locations.length;
  if (count < 3 || count > 5) {
    fail("location-count", "/locations", snapshot.id);
  }
  const npcs = snapshot.npcs ?? [];
  if (
    npcs.length < 3 ||
    npcs.length > 5 ||
    new Set(npcs.map((npc) => npc.id)).size !== npcs.length
  ) {
    fail("npc-count", "/npcs", snapshot.id);
  }
  const encounters = snapshot.encounters ?? [];
  const monsters = snapshot.monsters ?? [];
  if (
    encounters.length < 1 ||
    encounters.length > 3 ||
    monsters.length !== encounters.length ||
    new Set(encounters.map((entry) => entry.monsterId)).size !==
      encounters.length ||
    new Set(monsters.map((entry) => entry.locationId)).size !==
      monsters.length ||
    encounters.some((entry) =>
      entry.when.some(
        (condition) =>
          condition.type !== "discovery-known" &&
          condition.type !== "milestone-recorded",
      ),
    )
  ) {
    fail("unsupported-encounter", "/encounters", snapshot.id);
  }
  if ((snapshot.initialDiscoveries ?? []).length === 0) {
    fail("missing-initial-lead", "/initialDiscoveries", snapshot.id);
  }
  const route = explore(snapshot);
  if (route.limited) {
    fail("analysis-limit", "/", snapshot.id);
  }
  if (route.locations.size < count) {
    fail("unreachable-location", "/locations", snapshot.id);
  }
  for (let i = 0; i < encounters.length; i++) {
    if (!route.triggeredEncounters.has(encounters[i]!.id)) {
      fail("unreachable-encounter", `/encounters/${i}`, encounters[i]!.id);
    }
  }
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i]!;
    if (!route.visibleNpcs.has(npc.id)) {
      fail("unavailable-npc", `/npcs/${i}`, npc.id);
    }
  }
  if (route.discoveries.size < 3) {
    fail("insufficient-clues", "/discoveries", snapshot.id);
  }
  if (!route.completion) {
    fail("unreachable-resolution", "/endings", snapshot.id);
  }
  const choices = [...route.availableChoices];
  if (choices.length >= 2) {
    const outcomes = choices.map(([, values]) =>
      JSON.stringify([...values].sort()),
    );
    if (new Set(outcomes).size < 2) {
      fail("duplicate-resolution", "/endings/choices", snapshot.id);
    }
  }
  for (let i = 0; i < npcs.length; i++) {
    const without = explore(snapshot, npcs[i]!.id);
    if (!without.completion || without.limited) {
      fail("single-npc-dependency", `/npcs/${i}`, npcs[i]!.id);
      break;
    }
  }
  return failures;
}
