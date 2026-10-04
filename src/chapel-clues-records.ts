// Chapel-clues save and history records: part of the clue runtime adapter
// (an old runtime, removed by #139). Shared infrastructure reaches these only
// through AdventureRuntime.recordDomainEvents and projectDmHistory.
import {
  normalizeAlias,
  type ChapelCluesDefinition,
} from "./adventure-loader.js";
import type { ClueState, OfferResolution } from "./chapel-clues-runtime.js";
import type {
  AdventureRuntime,
  RuntimeEvent,
  RuntimeState,
} from "./legacy-runtime-contract.js";
import { DM_HISTORY_LIMIT } from "./dm-history.js";
import type {
  BrowserFacts,
  DmHistory,
  DmHistoryFact,
  RecordedTransition,
} from "./runtime-contract.js";
import type { Action } from "./session.js";

export type DomainEvent = Readonly<
  | { type: "search-performed"; actionId: string; targetId: string }
  | {
      type: "discovery-granted";
      actionId: string;
      discoveryId: string;
      locationId: string;
    }
  | { type: "milestone-recorded"; actionId: string; milestoneId: string }
  | {
      type: "clock-advanced";
      actionId: string;
      clockId: string;
      from: number;
      to: number;
    }
  | {
      type: "clock-threshold-crossed";
      actionId: string;
      clockId: string;
      at: number;
    }
  | {
      type: "relationship-changed";
      actionId: string;
      targetId: string;
      from: string;
      to: string;
      reason: string;
    }
  | {
      type: "item-transferred";
      actionId: string;
      itemId: string;
      from: "room";
      to: "inventory";
    }
  | { type: "item-consumed"; actionId: string; itemId: string }
  | {
      type: "social-check-attempted";
      actionId: string;
      challengeId: string;
      approach: string;
      die: number;
      result: "success" | "failure";
    }
  | {
      type: "combat-started" | "combat-ended";
      actionId: string;
      opponentId: string;
    }
  | {
      type: "initiative-rolled";
      actionId: string;
      combatantId: string;
    }
  | { type: "turn-started"; actionId: string; combatantId: string }
  | { type: "encounter-effect"; actionId: string; effectId: string }
  | {
      type: "attack-resolved";
      actionId: string;
      attackerId: string;
      targetId: string;
      attackRoll: number;
      outcome: "miss" | "hit" | "critical-hit";
      damage?: number;
      targetHp: number;
    }
  | {
      type: "actor-defeated";
      actionId: string;
      actorId: string;
      locationId: string;
    }
  | { type: "healing-item-used"; actionId: string; itemId: string }
  | ({ type: "item-offered"; actionId: string } & OfferResolution)
  | {
      type: "passage-barricaded";
      actionId: string;
      profileId: string;
      targetId: string;
      resourceId: string;
      blockedConnectionIds: readonly string[];
    }
  | {
      type: "guard-distracted";
      actionId: string;
      profileId: string;
      guardId: string;
      resourceId: string;
      connectionId: string;
      expiresAt: number;
      timeCost: number;
      die: number;
      modifier: number;
      total: number;
      dc: number;
      result: "success" | "failure";
    }
  | {
      type: "ally-deceived";
      actionId: string;
      profileId: string;
      allyId: string;
      claimId: string;
      playerDie: number;
      playerModifier: number;
      playerTotal: number;
      defenderDie: number;
      defenderModifier: number;
      defenderTotal: number;
      result: "success" | "failure";
    }
  | {
      type: "actor-relocated";
      actionId: string;
      actorId: string;
      from: string;
      to: string;
    }
  | { type: "action-committed"; actionId: string; actionType: string }
>;

type HistoryTransition = Readonly<{
  sequence: number;
  action?: Action;
  domainEvents?: readonly DomainEvent[];
}>;

function clueState(state: RuntimeState): ClueState {
  if (!("runtimeKind" in state) || state.runtimeKind !== "chapel-clues") {
    throw new Error("Save transition has an unsupported runtime state.");
  }
  return state;
}

export function clueDomainEvents(
  action: Action,
  actionId: string,
  beforeState: RuntimeState,
  afterState: RuntimeState,
  resultEvents: readonly RuntimeEvent[],
  includeSettledEvents = true,
): readonly DomainEvent[] {
  const before = clueState(beforeState);
  const after = clueState(afterState);
  const events: DomainEvent[] = [];
  for (const entry of includeSettledEvents ? resultEvents : []) {
    if (entry.type === "attack-resolved") {
      events.push({
        type: "attack-resolved",
        actionId,
        attackerId: entry.attackerId,
        targetId: entry.targetId,
        attackRoll: entry.attackRoll,
        outcome: entry.outcome,
        ...(entry.damage === undefined ? {} : { damage: entry.damage }),
        targetHp: entry.targetHp,
      });
      if (entry.targetHp === 0) {
        events.push({
          type: "actor-defeated",
          actionId,
          actorId: entry.targetId,
          locationId: before.locationId,
        });
      }
    } else if (entry.type === "clue") {
      if (entry.operation === "offer" && entry.offer !== undefined) {
        events.push({ type: "item-offered", actionId, ...entry.offer });
      }
      if (entry.operation === "deceive" && entry.deception !== undefined) {
        events.push({
          type: "ally-deceived",
          actionId,
          ...entry.deception,
        });
      }
      if (entry.operation === "distract" && entry.distraction !== undefined) {
        events.push({
          type: "guard-distracted",
          actionId,
          ...entry.distraction,
        });
      }
      if (
        entry.operation === "adjudicate" &&
        entry.adjudication !== undefined
      ) {
        events.push({
          type: "passage-barricaded",
          actionId,
          ...entry.adjudication,
        });
      }
      if (entry.operation === "clock-advanced" && entry.clock !== undefined) {
        events.push({
          type: "clock-advanced",
          actionId,
          clockId: entry.clock.id,
          from: entry.clock.from,
          to: entry.clock.to,
        });
      }
      if (
        entry.operation === "clock-threshold" &&
        entry.clock?.threshold !== undefined
      ) {
        events.push({
          type: "clock-threshold-crossed",
          actionId,
          clockId: entry.clock.id,
          at: entry.clock.threshold,
        });
      }
      if (entry.check !== undefined) {
        events.push({
          type: "social-check-attempted",
          actionId,
          challengeId: entry.check.challengeId,
          approach: entry.check.approach,
          die: entry.check.die,
          result: entry.check.result,
        });
      }
      if (
        entry.operation === "combat-started" ||
        entry.operation === "combat-ended"
      ) {
        events.push({
          type: entry.operation,
          actionId,
          opponentId: entry.target ?? "fighter",
        });
      }
      if (
        entry.operation === "initiative-rolled" &&
        entry.target !== undefined
      ) {
        events.push({
          type: "initiative-rolled",
          actionId,
          combatantId: entry.target,
        });
      }
      if (entry.operation === "turn-started" && entry.target !== undefined) {
        events.push({
          type: "turn-started",
          actionId,
          combatantId: entry.target,
        });
      }
      if (
        entry.operation === "encounter-effect" &&
        entry.target !== undefined
      ) {
        events.push({
          type: "encounter-effect",
          actionId,
          effectId: entry.target,
        });
      }
      if (entry.operation === "use" && entry.target !== undefined) {
        events.push({
          type: "healing-item-used",
          actionId,
          itemId: entry.target,
        });
      }
    }
  }
  const search = resultEvents.find(
    (entry) => entry.type === "clue" && entry.operation === "search",
  );
  // A committed examine is a search: it changes state only by searching.
  if (action.type === "search" || action.type === "examine") {
    if (search?.type !== "clue" || search.target === undefined) {
      throw new Error("Committed search has no resolved target.");
    }
    events.push({
      type: "search-performed",
      actionId,
      targetId: search.target,
    });
  }
  for (const discoveryId of after.discoveries) {
    if (!before.discoveries.includes(discoveryId)) {
      events.push({
        type: "discovery-granted",
        actionId,
        discoveryId,
        locationId:
          after.discoveryLocations?.[discoveryId] ?? before.locationId,
      });
    }
  }
  for (const milestoneId of after.milestones) {
    if (!before.milestones.includes(milestoneId)) {
      events.push({ type: "milestone-recorded", actionId, milestoneId });
    }
  }
  for (const [targetId, relationship] of Object.entries(
    after.relationships ?? {},
  )) {
    const prior = before.relationships?.[targetId];
    if (
      prior !== undefined &&
      (prior.tier !== relationship.tier || prior.reason !== relationship.reason)
    ) {
      events.push({
        type: "relationship-changed",
        actionId,
        targetId,
        from: prior.tier,
        to: relationship.tier,
        reason: relationship.reason,
      });
    }
  }
  for (const [itemId, position] of Object.entries(after.items ?? {})) {
    const prior = before.items?.[itemId];
    if (prior === "room" && position === "inventory") {
      events.push({
        type: "item-transferred",
        actionId,
        itemId,
        from: "room",
        to: "inventory",
      });
    } else if (prior === "inventory" && position === "consumed") {
      events.push({ type: "item-consumed", actionId, itemId });
    }
  }
  if (before.locationId !== after.locationId) {
    events.push({
      type: "actor-relocated",
      actionId,
      actorId: "player",
      from: before.locationId,
      to: after.locationId,
    });
  }
  for (const [actorId, locationId] of Object.entries(
    after.npcLocations ?? {},
  )) {
    const prior = before.npcLocations?.[actorId];
    if (prior !== undefined && prior !== locationId) {
      events.push({
        type: "actor-relocated",
        actionId,
        actorId,
        from: prior,
        to: locationId,
      });
    }
  }
  if (events.length === 0) {
    events.push({
      type: "action-committed",
      actionId,
      actionType: action.type,
    });
  }
  return events;
}

/** A player-visible, bounded account. Save replay has already verified every event. */
export function projectClueDmHistory(
  runtime: Pick<AdventureRuntime, "content" | "projectDmScene">,
  state: ClueState,
  transitions: readonly HistoryTransition[],
  speakerId?: string,
): DmHistory {
  const definition = runtime.content?.snapshot as
    ChapelCluesDefinition | undefined;
  const scene = runtime.projectDmScene(state);
  const visibleActors = new Set([
    ...(scene.room.npcs ?? []).map(({ id }) => id),
    ...scene.room.opponents.map(({ id }) => id),
  ]);
  const publicMilestones = new Set(
    definition?.locations
      .find(({ id }) => id === state.locationId)
      ?.descriptions?.filter(({ text }) =>
        scene.room.description.startsWith(text),
      )
      .flatMap(({ when }) =>
        when
          .filter(({ type }) => type === "milestone-recorded")
          .map(({ id }) => id),
      ) ?? [],
  );
  const publicThresholds = new Set(
    (definition?.clocks ?? []).flatMap((clock) =>
      clock.thresholds
        .filter((threshold) =>
          (definition?.schemaVersion ?? 0) >= 7
            ? state.observedThresholds?.includes(`${clock.id}:${threshold.at}`)
            : threshold.effects.some(
                ({ type, id }) =>
                  type === "record-milestone" &&
                  publicMilestones.has(id) &&
                  state.milestones.includes(id),
              ),
        )
        .map(({ at }) => `${clock.id}:${at}`),
    ),
  );
  const candidates: DmHistoryFact[] = [];
  for (const transition of transitions) {
    for (const event of transition.domainEvents ?? []) {
      const common = { sequence: transition.sequence, type: event.type };
      switch (event.type) {
        case "discovery-granted":
          if (
            state.discoveries.includes(event.discoveryId) &&
            (speakerId === undefined ||
              definition?.npcs
                ?.find(({ id }) => id === speakerId)
                ?.knows.includes(event.discoveryId) === true)
          ) {
            candidates.push({ ...common, subjectId: event.discoveryId });
          }
          break;
        case "relationship-changed":
          if (
            (speakerId === event.targetId ||
              (speakerId === undefined && visibleActors.has(event.targetId))) &&
            state.relationships?.[event.targetId]?.tier === event.to
          ) {
            const action = transition.action;
            const cause =
              action?.type === "talk" && action.target === event.targetId
                ? definition?.npcs
                    ?.find(({ id }) => id === event.targetId)
                    ?.topics.find((topic) =>
                      [topic.id, ...topic.aliases].some(
                        (alias) =>
                          normalizeAlias(alias) ===
                          normalizeAlias(action.topic ?? ""),
                      ),
                    )?.name
                : undefined;
            candidates.push({
              ...common,
              subjectId: event.targetId,
              detail: event.to,
              ...(cause === undefined ? {} : { cause }),
            });
          }
          break;
        case "actor-relocated":
          if (
            event.actorId !== "player" &&
            (definition?.schemaVersion ?? 0) < 7 &&
            (speakerId === event.actorId ||
              (speakerId === undefined &&
                (visibleActors.has(event.actorId) ||
                  event.from === state.locationId ||
                  (transition.action?.type === "talk" &&
                    transition.action.target === event.actorId)))) &&
            state.npcLocations?.[event.actorId] === event.to
          ) {
            candidates.push({
              ...common,
              subjectId: event.actorId,
              detail: `${event.from} -> ${event.to}`,
            });
          }
          break;
        case "actor-defeated":
          if (
            (speakerId === event.actorId ||
              (speakerId === undefined &&
                (event.locationId === state.locationId ||
                  visibleActors.has(event.actorId) ||
                  transition.domainEvents?.some(
                    (entry) =>
                      entry.type === "attack-resolved" &&
                      entry.targetId === event.actorId,
                  )))) &&
            (state.npcHealth?.[event.actorId]?.hp === 0 ||
              state.monsters?.[event.actorId]?.hp === 0)
          ) {
            candidates.push({ ...common, subjectId: event.actorId });
          }
          break;
        case "item-transferred":
        case "item-consumed":
          if (
            speakerId === undefined &&
            state.items?.[event.itemId] ===
              (event.type === "item-consumed" ? "consumed" : "inventory")
          ) {
            candidates.push({ ...common, subjectId: event.itemId });
          }
          break;
        case "clock-threshold-crossed":
          if (
            speakerId === undefined &&
            publicThresholds.has(`${event.clockId}:${event.at}`) &&
            (state.clocks?.[event.clockId] ?? 0) >= event.at
          ) {
            candidates.push({
              ...common,
              subjectId: event.clockId,
              detail: String(event.at),
            });
          }
          break;
        case "passage-barricaded":
          if (
            speakerId === undefined &&
            state.barricades?.includes(event.profileId) &&
            event.blockedConnectionIds.some((id) =>
              definition?.connections.some(
                (connection) =>
                  connection.id === id && connection.from === state.locationId,
              ),
            )
          ) {
            candidates.push({
              ...common,
              subjectId: event.profileId,
              detail: event.targetId,
            });
          }
          break;
        case "guard-distracted": {
          const profile = definition?.distractionProfiles?.find(
            ({ id }) => id === event.profileId,
          );
          const connection = definition?.connections.find(
            ({ id }) => id === event.connectionId,
          );
          if (
            speakerId === undefined &&
            profile !== undefined &&
            connection?.from === state.locationId &&
            state.distractionChecks?.[event.profileId]?.result === event.result
          ) {
            candidates.push({
              ...common,
              subjectId: event.profileId,
              detail:
                event.result === "failure"
                  ? "failure"
                  : (state.clocks?.[profile.clockId] ?? 0) < profile.expiresAt
                    ? "active until day " + profile.expiresAt
                    : "expired",
            });
          }
          break;
        }
        case "ally-deceived":
          if (
            speakerId === event.allyId &&
            state.deceptionChecks?.[event.profileId]?.result === event.result
          ) {
            candidates.push({
              ...common,
              subjectId: event.allyId,
              detail: `${event.claimId}: ${event.result === "success" ? "accepted claim" : "rejected claim"}`,
            });
          }
          break;
        case "item-offered":
          if (
            (speakerId === undefined || speakerId === event.npcId) &&
            state.offers?.[event.profileId] === event.outcome
          ) {
            candidates.push({
              ...common,
              subjectId: event.npcId,
              detail: `${event.itemId}: ${event.outcome}; ${event.itemCost}`,
            });
          }
          break;
        default:
          break;
      }
    }
  }
  return {
    locationId: state.locationId,
    ...(speakerId === undefined ? {} : { speakerId }),
    facts: candidates.slice(-DM_HISTORY_LIMIT),
  };
}

function isClueState(state: RuntimeState): state is ClueState {
  return "runtimeKind" in state && state.runtimeKind === "chapel-clues";
}

/** Browser-only facts the scene projection leaves out. */
export function projectClueBrowserFacts(
  state: RuntimeState,
): BrowserFacts | undefined {
  if (!isClueState(state)) {
    return undefined;
  }
  return {
    monsterHealth: state.monsters ?? {},
    npcHealth: state.npcHealth ?? {},
    consumedItemIds: Object.entries(state.items ?? {})
      .filter(([, position]) => position === "consumed")
      .map(([itemId]) => itemId),
  };
}

/** The history of a clue session; other states have none. */
export function projectClueSessionHistory(
  runtime: Pick<AdventureRuntime, "content" | "projectDmScene">,
  state: RuntimeState,
  transitions: readonly RecordedTransition[],
  speakerId?: string,
): DmHistory | undefined {
  // Saves record only this runtime's actions and domain events.
  return isClueState(state)
    ? projectClueDmHistory(
        runtime,
        state,
        transitions as readonly HistoryTransition[],
        speakerId,
      )
    : undefined;
}
