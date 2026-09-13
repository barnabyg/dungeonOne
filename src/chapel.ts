import type { Action } from "./session.js";

export const CHAPEL_ID = "chapel";
export const LEGACY_CHAPEL_VERSION = "chapel-exploration-v1";
export const LEGACY_CHAPEL_RULES_VERSION = "chapel-exploration-rules-v1";
export const LEGACY_CHAPEL_TOOL_VERSION = "chapel-exploration-tools-v1";
export const LEGACY_CHAPEL_PROMPT_VERSION = "chapel-exploration-dm-v1";
export const CHAPEL_VERSION = "chapel-discovery-v2";
export const CHAPEL_RULES_VERSION = "chapel-discovery-rules-v2";
export const CHAPEL_TOOL_VERSION = "chapel-discovery-tools-v2";
export const CHAPEL_PROMPT_VERSION = "chapel-discovery-dm-v2";
export const CHAPEL_TITLE = "The Bell Beneath the Chapel";
export const CHAPEL_OBJECTIVE =
  "Tavi, a village apprentice, is missing. Explore the route to the ruined chapel and find out what happened to them.";
export const CRYPT_BOUNDARY =
  "The crypt entrance is accessible, but the guardian encounter and the area beyond it are not yet playable. This exploration build cannot resolve the search. You can return to the chapel or quit.";

export type ChapelRoomId =
  "inn" | "ferry-landing" | "chapel-path" | "ruined-chapel" | "crypt";
export type ChapelFeatureId =
  | "missing-person-notice"
  | "mooring"
  | "waymarker"
  | "broken-roof"
  | "damaged-repair-record"
  | "crypt-steps";
export type ChapelDiscoveryId = "chapel-route" | "unsafe-repairs";
export type ChapelMilestoneId =
  "chapel-route-known" | "unsafe-repairs-linked-to-oren";
export type ChapelDiscovery = Readonly<{
  id: ChapelDiscoveryId;
  title: string;
  source: Readonly<{
    type: "feature";
    id: ChapelFeatureId;
    name: string;
    locationId: ChapelRoomId;
  }>;
  classification: "observation" | "testimony" | "belief";
  summary: string;
  actionableLead?: string;
}>;
export type ChapelJournal = Readonly<{
  quest: Readonly<{
    id: "find-tavi";
    title: "Find Tavi";
    status: "active";
    milestones: readonly ChapelMilestoneId[];
  }>;
  discoveries: readonly ChapelDiscovery[];
  actionableLeads: readonly string[];
}>;

type ChapelEvidence = Readonly<{
  targetId: ChapelFeatureId;
  discovery: ChapelDiscovery;
  milestoneId: ChapelMilestoneId;
}>;

const CHAPEL_EVIDENCE = [
  {
    targetId: "missing-person-notice",
    discovery: {
      id: "chapel-route",
      title: "The chapel route",
      source: {
        type: "feature",
        id: "missing-person-notice",
        name: "missing-person notice",
        locationId: "inn",
      },
      classification: "observation",
      summary:
        "The public notice says Tavi is missing and directs searchers along the chapel path to the ruined chapel.",
      actionableLead: "Follow the chapel path to the ruined chapel.",
    },
    milestoneId: "chapel-route-known",
  },
  {
    targetId: "damaged-repair-record",
    discovery: {
      id: "unsafe-repairs",
      title: "Unsafe chapel repairs",
      source: {
        type: "feature",
        id: "damaged-repair-record",
        name: "damaged repair record",
        locationId: "ruined-chapel",
      },
      classification: "observation",
      summary:
        "The damaged record assigns the chapel repairs to Oren and shows that the roof supports were left unfinished and unsafe.",
      actionableLead: "Ask Oren about the unfinished chapel repairs.",
    },
    milestoneId: "unsafe-repairs-linked-to-oren",
  },
] as const satisfies readonly ChapelEvidence[];

type PublicFeature = Readonly<{
  id: ChapelFeatureId;
  name: string;
  description: string;
}>;
export type ChapelInspection =
  | Readonly<PublicFeature & { type: "feature" }>
  | Readonly<{
      type: "named_exit";
      id: ChapelRoomId;
      name: string;
      description: string;
    }>;
type ChapelRoom = Readonly<{
  id: ChapelRoomId;
  name: string;
  description: string;
  features: readonly PublicFeature[];
  exits: readonly ChapelRoomId[];
}>;

// Only public exploration content belongs here. Private canon lives in the
// authoring document, never in scene projections or tool definitions.
export const CHAPEL_ROOMS = [
  {
    id: "inn",
    name: "Village Inn",
    description:
      "Rain taps the inn windows. Mara, the innkeeper, tends the counter beside a public noticeboard.",
    features: [
      {
        id: "missing-person-notice",
        name: "missing-person notice",
        description:
          "Tavi, the village apprentice, is missing. The public notice asks searchers to check the ruined chapel, reached by the chapel path.",
      },
    ],
    exits: ["ferry-landing", "chapel-path"],
  },
  {
    id: "ferry-landing",
    name: "Ferry Landing",
    description:
      "A wooden ferry rests beside the landing. Oren, the ferryman, checks its mooring.",
    features: [
      {
        id: "mooring",
        name: "mooring",
        description:
          "A thick rope holds the ferry against the landing. The village inn lies back along the lane.",
      },
    ],
    exits: ["inn"],
  },
  {
    id: "chapel-path",
    name: "Chapel Path",
    description:
      "An uphill path runs from the village toward the ruined chapel.",
    features: [
      {
        id: "waymarker",
        name: "waymarker",
        description:
          "A weathered arrow marks the way to the ruined chapel. The path back leads to the village inn.",
      },
    ],
    exits: ["inn", "ruined-chapel"],
  },
  {
    id: "ruined-chapel",
    name: "Ruined Chapel",
    description:
      "Daylight falls through the broken chapel roof. Stone steps descend to the crypt entrance.",
    features: [
      {
        id: "broken-roof",
        name: "broken roof",
        description:
          "Gaps in the roof let the rain through. Stay clear of the fallen stones.",
      },
      {
        id: "damaged-repair-record",
        name: "damaged repair record",
        description:
          "A water-spotted repair record is pinned beneath a fallen beam. Its cramped entries need a careful search to interpret.",
      },
    ],
    exits: ["chapel-path", "crypt"],
  },
  {
    id: "crypt",
    name: "Crypt",
    description: CRYPT_BOUNDARY,
    features: [
      {
        id: "crypt-steps",
        name: "crypt steps",
        description:
          "The stone steps lead back up to the ruined chapel. " +
          CRYPT_BOUNDARY,
      },
    ],
    exits: ["ruined-chapel"],
  },
] as const satisfies readonly ChapelRoom[];

export type ChapelState = Readonly<{
  adventureId: typeof CHAPEL_ID;
  locationId: ChapelRoomId;
  status: "playing" | "quit";
  fighter: Readonly<{
    hp: number;
    maxHp: number;
    equipmentIds: readonly ["longsword"];
  }>;
  quest: Readonly<{
    id: "find-tavi";
    status: "active";
    milestones: readonly ChapelMilestoneId[];
  }>;
  discoveries: readonly ChapelDiscovery[];
}>;
export type LegacyChapelState = Readonly<{
  adventureId: typeof CHAPEL_ID;
  locationId: ChapelRoomId;
  status: "playing" | "quit";
  fighter: Readonly<{
    hp: number;
    maxHp: number;
    equipmentIds: readonly ["longsword"];
  }>;
  quest: Readonly<{ id: "find-tavi"; status: "active" }>;
}>;
export type LegacyChapelEvent = Readonly<
  | Exclude<
      ChapelEvent,
      { type: "chapel-status" | "chapel-discovered" | "chapel-journal" }
    >
  | {
      type: "chapel-status";
      hp: number;
      maxHp: number;
      status: LegacyChapelState["status"];
      quest: LegacyChapelState["quest"];
    }
>;
export type ChapelEvent = Readonly<
  | { type: "chapel-scene"; roomId: ChapelRoomId }
  | { type: "chapel-moved"; fromRoomId: ChapelRoomId; roomId: ChapelRoomId }
  | { type: "chapel-inspected"; name: string; description: string }
  | {
      type: "chapel-discovered";
      discoveryId: ChapelDiscoveryId;
      milestoneId: ChapelMilestoneId;
    }
  | { type: "chapel-journal"; journal: ChapelJournal }
  | {
      type: "chapel-status";
      hp: number;
      maxHp: number;
      status: ChapelState["status"];
      quest: ChapelState["quest"];
    }
  | { type: "chapel-inventory" }
  | { type: "chapel-help" }
  | { type: "session-quit" }
>;
export type ChapelRejection = Readonly<{
  reason:
    "chapel-unavailable" | "chapel-missing-argument" | "chapel-session-ended";
}>;
export type ChapelResult =
  | Readonly<{
      state: ChapelState;
      events: readonly ChapelEvent[];
      rejection?: never;
    }>
  | Readonly<{
      state: ChapelState;
      rejection: ChapelRejection;
      events?: never;
    }>;

export function createChapelSession(): ChapelState {
  return {
    adventureId: CHAPEL_ID,
    locationId: "inn",
    status: "playing",
    fighter: { hp: 20, maxHp: 20, equipmentIds: ["longsword"] },
    quest: { id: "find-tavi", status: "active", milestones: [] },
    discoveries: [],
  };
}

export function chapelRoom(id: ChapelRoomId): ChapelRoom {
  const room = CHAPEL_ROOMS.find((entry) => entry.id === id);
  if (room === undefined) {
    throw new Error("Invalid chapel location.");
  }
  return room;
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/-/gu, " ");
}

export function chapelInspection(
  state: ChapelState,
  target: string,
): ChapelInspection | undefined {
  const room = chapelRoom(state.locationId);
  const match = normalized(target);
  const feature = room.features.find(
    (entry) =>
      normalized(entry.id) === match || normalized(entry.name) === match,
  );
  if (feature !== undefined) {
    return { type: "feature", ...feature };
  }
  const exit = CHAPEL_ROOMS.find(
    (entry) =>
      room.exits.includes(entry.id) &&
      (normalized(entry.id) === match || normalized(entry.name) === match),
  );
  return exit === undefined
    ? undefined
    : {
        type: "named_exit",
        id: exit.id,
        name: exit.name,
        description: `An open route leads to ${exit.name}.`,
      };
}

export function projectChapelJournal(state: ChapelState): ChapelJournal {
  return {
    quest: {
      id: state.quest.id,
      title: "Find Tavi",
      status: state.quest.status,
      milestones: state.quest.milestones,
    },
    discoveries: state.discoveries,
    actionableLeads: state.discoveries.flatMap((discovery) =>
      discovery.actionableLead === undefined ? [] : [discovery.actionableLead],
    ),
  };
}

export function chapelSearchTargets(
  state: ChapelState,
): readonly ChapelFeatureId[] {
  const visibleFeatures = new Set(
    chapelRoom(state.locationId).features.map(({ id }) => id),
  );
  return CHAPEL_EVIDENCE.map(({ targetId }) => targetId).filter((targetId) =>
    visibleFeatures.has(targetId),
  );
}

export function handleChapelAction(
  state: ChapelState,
  action: Action,
): ChapelResult {
  const accept = (...events: ChapelEvent[]): ChapelResult => ({
    state,
    events,
  });
  if (action.type === "quit") {
    return {
      state: { ...state, status: "quit" },
      events: [{ type: "session-quit" }],
    };
  }
  switch (action.type) {
    case "help":
      return accept({ type: "chapel-help" });
    case "look":
      return accept({ type: "chapel-scene", roomId: state.locationId });
    case "status":
      return accept({
        type: "chapel-status",
        hp: state.fighter.hp,
        maxHp: state.fighter.maxHp,
        status: state.status,
        quest: state.quest,
      });
    case "inventory":
      return accept({ type: "chapel-inventory" });
    case "journal":
      return accept({
        type: "chapel-journal",
        journal: projectChapelJournal(state),
      });
    case "inspect": {
      if (!action.target) {
        return { state, rejection: { reason: "chapel-missing-argument" } };
      }
      const target = chapelInspection(state, action.target);
      return target === undefined
        ? { state, rejection: { reason: "chapel-unavailable" } }
        : accept({
            type: "chapel-inspected",
            name: target.name,
            description: target.description,
          });
    }
    case "search": {
      if (state.status === "quit") {
        return { state, rejection: { reason: "chapel-session-ended" } };
      }
      if (!action.target) {
        return { state, rejection: { reason: "chapel-missing-argument" } };
      }
      const target = chapelInspection(state, action.target);
      const evidence = CHAPEL_EVIDENCE.find(
        (entry) => entry.targetId === target?.id,
      );
      if (evidence === undefined) {
        return { state, rejection: { reason: "chapel-unavailable" } };
      }
      if (
        state.discoveries.some(
          (discovery) => discovery.id === evidence.discovery.id,
        )
      ) {
        return accept();
      }
      return {
        state: {
          ...state,
          quest: {
            ...state.quest,
            milestones: [...state.quest.milestones, evidence.milestoneId],
          },
          discoveries: [...state.discoveries, evidence.discovery],
        },
        events: [
          {
            type: "chapel-discovered",
            discoveryId: evidence.discovery.id,
            milestoneId: evidence.milestoneId,
          },
        ],
      };
    }
    case "move": {
      if (state.status === "quit") {
        return { state, rejection: { reason: "chapel-session-ended" } };
      }
      if (!action.destination) {
        return { state, rejection: { reason: "chapel-missing-argument" } };
      }
      const destination = normalized(action.destination);
      const room = CHAPEL_ROOMS.find(
        (entry) =>
          normalized(entry.id) === destination ||
          normalized(entry.name) === destination,
      );
      if (
        room === undefined ||
        !chapelRoom(state.locationId).exits.includes(room.id)
      ) {
        return { state, rejection: { reason: "chapel-unavailable" } };
      }
      return {
        state: { ...state, locationId: room.id },
        events: [
          {
            type: "chapel-moved",
            fromRoomId: state.locationId,
            roomId: room.id,
          },
          { type: "chapel-scene", roomId: room.id },
        ],
      };
    }
    default:
      return { state, rejection: { reason: "chapel-unavailable" } };
  }
}

export function renderChapelIntroduction(): string {
  return `${CHAPEL_TITLE}\n\nObjective: ${CHAPEL_OBJECTIVE}\nActive quest: Find Tavi.\nInvestigation preview: conversations, combat and resolutions are not yet playable.\nType "help" for available commands.`;
}

export function renderChapelResult(result: ChapelResult): string {
  if (result.rejection !== undefined) {
    return result.rejection.reason === "chapel-missing-argument"
      ? 'Name a visible target or adjacent location. Use "look" for choices.'
      : result.rejection.reason === "chapel-session-ended"
        ? "This session has ended."
        : 'That action or target is unavailable here. Use "look" for public features and adjacent routes. This exploration build cannot complete the quest.';
  }
  if (result.events.length === 0) {
    return "You find nothing new; this evidence is already recorded in your journal.";
  }
  return result.events
    .map((event) => {
      switch (event.type) {
        case "chapel-scene": {
          const room = chapelRoom(event.roomId);
          return `${room.name}\n${room.description}\nVisible: ${room.features.map((feature) => feature.name).join(", ")}.\nExits: ${room.exits.join(", ")}.`;
        }
        case "chapel-moved":
          return `You travel to ${chapelRoom(event.roomId).name}.`;
        case "chapel-inspected":
          return `${event.name}: ${event.description}`;
        case "chapel-discovered": {
          const discovery = CHAPEL_EVIDENCE.find(
            (entry) => entry.discovery.id === event.discoveryId,
          )?.discovery;
          return discovery === undefined
            ? "A discovery was recorded."
            : `Discovery recorded — ${discovery.title}: ${discovery.summary}`;
        }
        case "chapel-journal": {
          const discoveries = event.journal.discoveries.map((discovery) => {
            const sourceLocation = chapelRoom(discovery.source.locationId).name;
            return `- ${discovery.title} [${discovery.classification}] — ${discovery.summary}\n  Source: ${discovery.source.name}, ${sourceLocation}.`;
          });
          const milestones = event.journal.quest.milestones;
          return [
            `Journal\nActive quest: ${event.journal.quest.title} (${event.journal.quest.status}).`,
            `Milestones: ${milestones.length === 0 ? "none" : milestones.join(", ")}.`,
            `Discoveries: ${discoveries.length === 0 ? "none" : `\n${discoveries.join("\n")}`}`,
            `Known leads: ${event.journal.actionableLeads.length === 0 ? "none" : `\n- ${event.journal.actionableLeads.join("\n- ")}`}`,
          ].join("\n");
        }
        case "chapel-status":
          return `Fighter HP: ${event.hp}/${event.maxHp}\nSession: ${event.status}.\nActive quest: Find Tavi. ${CHAPEL_OBJECTIVE}`;
        case "chapel-inventory":
          return "Equipped: longsword.\nCollectibles: empty.";
        case "chapel-help":
          return "Available commands: help, look, inspect <target>, search <evidence>, move <location>, status, inventory, journal, quit.\nExamples: search missing-person notice; journal; move ferry-landing; move inn; move chapel-path; move ruined-chapel; move crypt.\nEnter each command on its own line. Explore the crypt entrance, then return or quit. The quest cannot yet be completed.";
        case "session-quit":
          return "You leave the game.";
      }
    })
    .join("\n");
}
