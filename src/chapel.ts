import type { Action } from "./session.js";
import type { RandomSource } from "./random.js";

export const CHAPEL_ID = "chapel";
export const LEGACY_CHAPEL_VERSION = "chapel-exploration-v1";
export const LEGACY_CHAPEL_RULES_VERSION = "chapel-exploration-rules-v1";
export const LEGACY_CHAPEL_TOOL_VERSION = "chapel-exploration-tools-v1";
export const LEGACY_CHAPEL_PROMPT_VERSION = "chapel-exploration-dm-v1";
export const DISCOVERY_CHAPEL_VERSION = "chapel-discovery-v2";
export const DISCOVERY_CHAPEL_RULES_VERSION = "chapel-discovery-rules-v2";
export const DISCOVERY_CHAPEL_TOOL_VERSION = "chapel-discovery-tools-v2";
export const DISCOVERY_CHAPEL_PROMPT_VERSION = "chapel-discovery-dm-v2";
export const DIALOGUE_CHAPEL_VERSION = "chapel-dialogue-v3";
export const DIALOGUE_CHAPEL_RULES_VERSION = "chapel-dialogue-rules-v3";
export const DIALOGUE_CHAPEL_TOOL_VERSION = "chapel-dialogue-tools-v3";
export const DIALOGUE_CHAPEL_PROMPT_VERSION = "chapel-dialogue-dm-v3";
export const CHAPEL_VERSION = "chapel-social-v4";
export const CHAPEL_RULES_VERSION = "chapel-social-rules-v4";
export const CHAPEL_TOOL_VERSION = "chapel-social-tools-v4";
export const CHAPEL_PROMPT_VERSION = "chapel-social-dm-v4";
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
export type ChapelNpcId = "mara" | "oren" | "tavi";
export type ChapelTalkTopicId = "tavi" | "repairs";
export const CHAPEL_TALK_APPROACHES = [
  "ask",
  "persuade",
  "deceive",
  "intimidate",
] as const;
export type ChapelTalkApproach = (typeof CHAPEL_TALK_APPROACHES)[number];
export type ChapelDiscoveryId =
  | "chapel-route"
  | "unsafe-repairs"
  | "tavi-disappearance-testimony"
  | "mara-ferry-belief";
export type ChapelMilestoneId =
  | "chapel-route-known"
  | "unsafe-repairs-linked-to-oren"
  | "mara-account-recorded"
  | "oren-account-released";
export type ChapelDiscovery = Readonly<{
  id: ChapelDiscoveryId;
  title: string;
  source: Readonly<
    | {
        type: "feature";
        id: ChapelFeatureId;
        name: string;
        locationId: ChapelRoomId;
      }
    | {
        type: "npc";
        id: ChapelNpcId;
        name: string;
        locationId: ChapelRoomId;
      }
  >;
  classification: "observation" | "testimony" | "belief";
  summary: string;
  actionableLead?: string;
}>;

export type ChapelConversation = Readonly<{
  speakerId: ChapelNpcId;
  speakerName: string;
  topicId: ChapelTalkTopicId;
  topicName: string;
  approach: ChapelTalkApproach;
  attitude: "concerned" | "guarded" | "remorseful" | "defiant";
  voice: string;
  approvedFacts: readonly Readonly<{ id: string; statement: string }>[];
  authoredReply: string;
  speakerHistory: readonly string[];
}>;

type ChapelNpcDefinition = Readonly<{
  id: ChapelNpcId;
  name: string;
  locationId: ChapelRoomId;
  publiclyVisible: boolean;
  knows: readonly string[];
  doesNotKnow: readonly string[];
  believes: readonly string[];
  wants: readonly string[];
  reveals: readonly Readonly<{
    topicId: ChapelTalkTopicId;
    topicName: string;
    factIds: readonly string[];
  }>[];
}>;

// These authored fields are deliberately separate. Only `reveals` is used to
// construct public tool schemas and approved conversation results.
export const CHAPEL_NPCS = [
  {
    id: "mara",
    name: "Mara",
    locationId: "inn",
    publiclyVisible: true,
    knows: ["Tavi has disappeared."],
    doesNotKnow: ["Oren's private motive and Tavi's current condition."],
    believes: ["Tavi may have gone toward the ferry."],
    wants: ["Find Tavi."],
    reveals: [
      {
        topicId: "tavi",
        topicName: "Tavi's disappearance",
        factIds: ["tavi-disappearance-testimony", "mara-ferry-belief"],
      },
    ],
  },
  {
    id: "oren",
    name: "Oren",
    locationId: "ferry-landing",
    publiclyVisible: true,
    knows: [
      "The chapel route is passable.",
      "PRIVATE_MOTIVE: Oren diverted chapel repair money to buy medicine.",
    ],
    doesNotKnow: ["Tavi's current condition."],
    believes: [],
    wants: ["Protect the medicine recipients and avoid exposure."],
    reveals: [
      {
        topicId: "tavi",
        topicName: "Tavi's disappearance",
        factIds: ["oren-tavi-uncertainty", "chapel-route-passable"],
      },
      {
        topicId: "repairs",
        topicName: "Unfinished chapel repairs",
        factIds: [],
      },
    ],
  },
  {
    id: "tavi",
    name: "Tavi",
    locationId: "crypt",
    publiclyVisible: false,
    knows: ["PRIVATE_CONDITION: Tavi is trapped beyond the guardian."],
    doesNotKnow: ["Unrelated village conversations after entering the crypt."],
    believes: [],
    wants: ["Escape the crypt and report what happened."],
    reveals: [],
  },
] as const satisfies readonly ChapelNpcDefinition[];

const MARA_DISCOVERIES = [
  {
    id: "tavi-disappearance-testimony",
    title: "Mara's account of Tavi's disappearance",
    source: { type: "npc", id: "mara", name: "Mara", locationId: "inn" },
    classification: "testimony",
    summary: "Mara reports that Tavi has disappeared.",
  },
  {
    id: "mara-ferry-belief",
    title: "Mara's ferry lead",
    source: { type: "npc", id: "mara", name: "Mara", locationId: "inn" },
    classification: "belief",
    summary:
      "Mara believes Tavi may have gone toward the ferry; this is her belief, not an observed fact.",
    actionableLead:
      "Check the ferry landing, while treating Mara's lead as uncertain.",
  },
] as const satisfies readonly ChapelDiscovery[];

export const INITIAL_CHAPEL_NPC_STATES = Object.freeze({
  mara: Object.freeze({ condition: "living" as const }),
  oren: Object.freeze({ condition: "living" as const }),
  tavi: Object.freeze({ condition: "living" as const }),
});
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
  npcStates: Readonly<
    Record<ChapelNpcId, Readonly<{ condition: "living" | "dead" }>>
  >;
  conversationHistory: readonly Readonly<{
    speakerId: ChapelNpcId;
    statements: readonly string[];
  }>[];
  socialChallenges: Readonly<{
    guardedAccount?: ChapelSocialCheck;
  }>;
}>;

export type ChapelSocialCheck = Readonly<{
  approach: Exclude<ChapelTalkApproach, "ask">;
  die: number;
  modifier: 1;
  total: number;
  dc: 11;
  result: "success" | "failure";
}>;
export type DialogueChapelState = Omit<ChapelState, "socialChallenges">;
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
export type DiscoveryChapelState = Readonly<{
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
    milestones: readonly Exclude<ChapelMilestoneId, "mara-account-recorded">[];
  }>;
  discoveries: readonly Exclude<ChapelDiscovery, { source: { type: "npc" } }>[];
}>;
export type DiscoveryChapelEvent = Readonly<
  Exclude<ChapelEvent, { type: "chapel-conversation" }>
>;
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
  | { type: "chapel-conversation"; conversation: ChapelConversation }
  | (Readonly<{ type: "chapel-social-check" }> & ChapelSocialCheck)
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
    npcStates: INITIAL_CHAPEL_NPC_STATES,
    conversationHistory: [],
    socialChallenges: {},
  };
}

export function visibleChapelNpcs(state: ChapelState): readonly Readonly<{
  id: ChapelNpcId;
  name: string;
  subjects: readonly Readonly<{ id: ChapelTalkTopicId; name: string }>[];
}>[] {
  return CHAPEL_NPCS.filter(
    (npc) =>
      npc.locationId === state.locationId &&
      npc.publiclyVisible &&
      state.npcStates[npc.id].condition === "living",
  ).map((npc) => ({
    id: npc.id,
    name: npc.name,
    subjects: npc.reveals
      .filter(() => npc.id !== "oren" || "socialChallenges" in state)
      .map(({ topicId, topicName }) => ({
        id: topicId,
        name: topicName,
      })),
  }));
}

function talkToNpc(
  state: ChapelState,
  target: string | undefined,
  topic: string | undefined,
  approach: string | undefined,
  random?: Pick<RandomSource, "roll">,
): ChapelResult {
  const speakerId = normalized(target ?? "") as ChapelNpcId;
  const topicId = normalized(topic ?? "") as ChapelTalkTopicId;
  const normalizedApproach = normalized(approach ?? "") as ChapelTalkApproach;
  const visible = visibleChapelNpcs(state).find(
    (candidate) => candidate.id === speakerId,
  );
  const npc = CHAPEL_NPCS.find((candidate) => candidate.id === speakerId);
  const reveal = npc?.reveals.find(
    (candidate) => candidate.topicId === topicId,
  );
  if (
    visible === undefined ||
    npc === undefined ||
    reveal === undefined ||
    !visible.subjects.some((subject) => subject.id === topicId) ||
    !CHAPEL_TALK_APPROACHES.includes(normalizedApproach)
  ) {
    return { state, rejection: { reason: "chapel-unavailable" } };
  }

  if (speakerId === "oren") {
    return talkToOren(state, topicId, normalizedApproach, npc.name, random);
  }

  const discoveries = MARA_DISCOVERIES.filter((discovery) =>
    reveal.factIds.some((factId) => factId === discovery.id),
  );
  const newDiscoveries = discoveries.filter(
    (discovery) =>
      !state.discoveries.some((existing) => existing.id === discovery.id),
  );
  const approvedFacts = [
    {
      id: "tavi-disappearance-testimony",
      statement: "Tavi is missing.",
    },
    {
      id: "mara-ferry-belief",
      statement:
        "I think Tavi may have gone toward the ferry, but that is only my belief, not an observed fact.",
    },
  ].filter(({ id }) => reveal.factIds.some((factId) => factId === id));
  const priorStatements = state.conversationHistory
    .filter((entry) => entry.speakerId === speakerId)
    .flatMap(({ statements }) => statements)
    .slice(-6);
  const authoredReply =
    "Mara: Tavi is missing. I thought they might have gone toward the ferry, but that is only my guess. Please help me find them.";
  const conversation: ChapelConversation = {
    speakerId,
    speakerName: npc.name,
    topicId,
    topicName: reveal.topicName,
    approach: normalizedApproach,
    attitude: "concerned",
    voice:
      "Direct, warm, and worried; speaks as a practical village innkeeper.",
    approvedFacts,
    authoredReply,
    speakerHistory: priorStatements,
  };
  const hasMilestone = state.quest.milestones.includes("mara-account-recorded");
  return {
    state: {
      ...state,
      quest: {
        ...state.quest,
        milestones: hasMilestone
          ? state.quest.milestones
          : [...state.quest.milestones, "mara-account-recorded"],
      },
      discoveries: [...state.discoveries, ...newDiscoveries],
      conversationHistory: [
        ...state.conversationHistory,
        {
          speakerId,
          statements: approvedFacts.map(({ statement }) => statement),
        },
      ].slice(-8),
    },
    events: [{ type: "chapel-conversation", conversation }],
  };
}

function talkToOren(
  state: ChapelState,
  topicId: ChapelTalkTopicId,
  approach: ChapelTalkApproach,
  speakerName: string,
  random?: Pick<RandomSource, "roll">,
): ChapelResult {
  const priorStatements = state.conversationHistory
    .filter((entry) => entry.speakerId === "oren")
    .flatMap(({ statements }) => statements)
    .slice(-6);
  const finish = (
    approvedFacts: readonly Readonly<{ id: string; statement: string }>[],
    authoredReply: string,
    attitude: ChapelConversation["attitude"],
    events: readonly ChapelEvent[] = [],
    nextState: ChapelState = state,
    responseApproach: ChapelTalkApproach = approach,
  ): ChapelResult => {
    const conversation: ChapelConversation = {
      speakerId: "oren",
      speakerName,
      topicId,
      topicName:
        topicId === "repairs"
          ? "Unfinished chapel repairs"
          : "Tavi's disappearance",
      approach: responseApproach,
      attitude,
      voice:
        "Terse and weathered; speaks like a ferryman used to hard choices.",
      approvedFacts,
      authoredReply,
      speakerHistory: priorStatements,
    };
    return {
      state: {
        ...nextState,
        conversationHistory: [
          ...nextState.conversationHistory,
          {
            speakerId: "oren" as const,
            statements: approvedFacts.map(({ statement }) => statement),
          },
        ].slice(-8),
      },
      events: [...events, { type: "chapel-conversation", conversation }],
    };
  };

  if (topicId === "tavi") {
    return finish(
      [
        {
          id: "oren-tavi-uncertainty",
          statement: "I do not know what has happened to Tavi.",
        },
        {
          id: "chapel-route-passable",
          statement: "The chapel route is passable from the inn.",
        },
      ],
      "Oren: I do not know what has happened to Tavi. The chapel route is passable from the inn.",
      "guarded",
    );
  }

  const remembered = state.socialChallenges.guardedAccount;
  if (remembered !== undefined) {
    return remembered.result === "success"
      ? finish(
          [
            {
              id: "oren-guarded-admission",
              statement:
                "I diverted the chapel repair funds to buy medicine, leaving the repairs unfinished.",
            },
          ],
          orenSuccessReply(remembered.approach),
          "remorseful",
          [],
          state,
          remembered.approach,
        )
      : finish(
          [
            {
              id: "oren-guarded-refusal",
              statement: "I will not give you an account of the repairs.",
            },
          ],
          "Oren: I have already answered. I will not give you an account of the repairs. The public notice and chapel evidence remain yours to examine.",
          "defiant",
          [],
          state,
          remembered.approach,
        );
  }

  if (approach === "ask") {
    return finish(
      [
        {
          id: "oren-guarded-refusal",
          statement: "I will not give you an account of the repairs.",
        },
      ],
      "Oren: I will not give you an account of the repairs. If you are searching for Tavi, follow what you can establish for yourself.",
      "guarded",
    );
  }
  if (random === undefined) {
    throw new Error("A random source is required for a social check.");
  }
  const die = random.roll(20);
  const check: ChapelSocialCheck = {
    approach,
    die,
    modifier: 1,
    total: die + 1,
    dc: 11,
    result: die + 1 >= 11 ? "success" : "failure",
  };
  const released = check.result === "success";
  const hasMilestone = state.quest.milestones.includes("oren-account-released");
  const nextState: ChapelState = {
    ...state,
    quest: released
      ? {
          ...state.quest,
          milestones: hasMilestone
            ? state.quest.milestones
            : [...state.quest.milestones, "oren-account-released"],
        }
      : state.quest,
    socialChallenges: { ...state.socialChallenges, guardedAccount: check },
  };
  return released
    ? finish(
        [
          {
            id: "oren-guarded-admission",
            statement:
              "I diverted the chapel repair funds to buy medicine, leaving the repairs unfinished.",
          },
        ],
        orenSuccessReply(approach),
        "remorseful",
        [{ type: "chapel-social-check", ...check }],
        nextState,
      )
    : finish(
        [
          {
            id: "oren-guarded-refusal",
            statement: "I will not give you an account of the repairs.",
          },
        ],
        `Oren: ${orenApproachLead(approach)} I will not give you an account of the repairs. The public notice and chapel evidence remain yours to examine.`,
        "defiant",
        [{ type: "chapel-social-check", ...check }],
        nextState,
      );
}

function orenApproachLead(
  approach: Exclude<ChapelTalkApproach, "ask">,
): string {
  switch (approach) {
    case "persuade":
      return "Your appeal to help find Tavi does not move me.";
    case "deceive":
      return "You claim the records were checked, but I do not accept the pretext.";
    case "intimidate":
      return "Your threat of public scrutiny does not make me yield.";
  }
}

function orenSuccessReply(
  approach: Exclude<ChapelTalkApproach, "ask">,
): string {
  const lead =
    approach === "persuade"
      ? "Your appeal to help find Tavi breaks through my reserve."
      : approach === "deceive"
        ? "Your claim that the records were checked makes me reconsider; the claim itself remains only your pretext."
        : "Faced with your threat of public scrutiny, I relent.";
  return `Oren: ${lead} I diverted the chapel repair funds to buy medicine, leaving the repairs unfinished. I do not know what has happened to Tavi.`;
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
  random?: Pick<RandomSource, "roll">,
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
    case "talk": {
      if (state.status === "quit") {
        return { state, rejection: { reason: "chapel-session-ended" } };
      }
      if (!action.target || !action.topic || !action.approach) {
        return { state, rejection: { reason: "chapel-missing-argument" } };
      }
      return talkToNpc(
        state,
        action.target,
        action.topic,
        action.approach,
        random,
      );
    }
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
  return `${CHAPEL_TITLE}\n\nObjective: ${CHAPEL_OBJECTIVE}\nActive quest: Find Tavi.\nMara is here. Public subject: Tavi's disappearance.\nType "help" for available commands.`;
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
          const npcs = visibleChapelNpcs(result.state).filter(
            (npc) =>
              CHAPEL_NPCS.find(({ id }) => id === npc.id)?.locationId ===
              event.roomId,
          );
          const speakers = npcs.map(
            (npc) =>
              `${npc.name} (public subjects: ${
                npc.subjects.map(({ name }) => name).join(", ") || "none"
              })`,
          );
          return `${room.name}\n${room.description}\nVisible: ${room.features.map((feature) => feature.name).join(", ")}.\nNPCs: ${speakers.join("; ") || "none"}.\nExits: ${room.exits.join(", ")}.`;
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
        case "chapel-conversation":
          return event.conversation.authoredReply;
        case "chapel-social-check":
          return `Social check\nApproach: ${event.approach}\nDie: d20 = ${event.die}\nModifier: +${event.modifier}\nTotal: ${event.total}\nDC: ${event.dc}\nResult: ${event.result}.`;
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
          return "Available commands: help, look, inspect <target>, search <evidence>, talk <npc> <topic> <approach>, move <location>, status, inventory, journal, quit.\nConversation approaches: ask, persuade, deceive, intimidate.\nExamples: talk mara tavi ask; move ferry-landing; talk oren tavi ask; talk oren repairs persuade; talk oren repairs deceive; talk oren repairs intimidate; search missing-person notice; journal; move inn; move chapel-path; move ruined-chapel; move crypt.\nEnter each command on its own line. Explore the crypt entrance, then return or quit. The quest cannot yet be completed.";
        case "session-quit":
          return "You leave the game.";
      }
    })
    .join("\n");
}
