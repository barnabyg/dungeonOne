import {
  normalizeAlias,
  type ChapelCluesDefinition,
} from "./adventure-loader.js";
import type { ClueState } from "./chapel-clues-runtime.js";
import type { DomainEvent } from "./save.js";
import type { AdventureRuntime } from "./runtime-contract.js";
import type { Action } from "./session.js";

export const DM_HISTORY_LIMIT = 12;

export type DmHistoryFact = Readonly<{
  sequence: number;
  type: DomainEvent["type"];
  subjectId: string;
  detail?: string;
  cause?: string;
}>;

export type DmHistory = Readonly<{
  locationId: string;
  speakerId?: string;
  facts: readonly DmHistoryFact[];
}>;

type HistoryTransition = Readonly<{
  sequence: number;
  action?: Action;
  domainEvents?: readonly DomainEvent[];
}>;

/** A player-visible, bounded account. Save replay has already verified every event. */
export function projectDmHistory(
  runtime: AdventureRuntime,
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
          threshold.effects.some(
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
                  (transition.action?.type === "attack" &&
                    transition.action.target === event.actorId)))) &&
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
