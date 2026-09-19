import type { Action } from "./session.js";
import type { RandomSource } from "./random.js";
import type { DamageDefinition } from "./adventure.js";
import {
  resolveAttack,
  resolveInitiative,
  type AttackResolvedEvent,
  type InitiativeRoll,
} from "./combat.js";

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
export const SOCIAL_CHAPEL_VERSION = "chapel-social-v4";
export const SOCIAL_CHAPEL_RULES_VERSION = "chapel-social-rules-v4";
export const SOCIAL_CHAPEL_TOOL_VERSION = "chapel-social-tools-v4";
export const SOCIAL_CHAPEL_PROMPT_VERSION = "chapel-social-dm-v4";
export const GUARDIAN_CHAPEL_VERSION = "chapel-guardian-v5";
export const GUARDIAN_CHAPEL_RULES_VERSION = "chapel-guardian-rules-v5";
export const GUARDIAN_CHAPEL_TOOL_VERSION = "chapel-guardian-tools-v5";
export const GUARDIAN_CHAPEL_PROMPT_VERSION = "chapel-guardian-dm-v5";
export const POTION_CHAPEL_VERSION = "chapel-potion-v6";
export const POTION_CHAPEL_RULES_VERSION = "chapel-potion-rules-v6";
export const POTION_CHAPEL_TOOL_VERSION = "chapel-potion-tools-v6";
export const POTION_CHAPEL_PROMPT_VERSION = "chapel-potion-dm-v6";
export const RESCUE_CHAPEL_VERSION = "chapel-rescue-v7";
export const RESCUE_CHAPEL_RULES_VERSION = "chapel-rescue-rules-v7";
export const RESCUE_CHAPEL_TOOL_VERSION = "chapel-rescue-tools-v7";
export const RESCUE_CHAPEL_PROMPT_VERSION = "chapel-rescue-dm-v7";
export const RESOLUTION_CHAPEL_VERSION = "chapel-resolution-v8";
export const RESOLUTION_CHAPEL_RULES_VERSION = "chapel-resolution-rules-v8";
export const RESOLUTION_CHAPEL_TOOL_VERSION = "chapel-resolution-tools-v8";
export const RESOLUTION_CHAPEL_PROMPT_VERSION = "chapel-resolution-dm-v8";
export const CHAPEL_VERSION = "chapel-casualties-v9";
export const CHAPEL_RULES_VERSION = "chapel-casualties-rules-v9";
export const CHAPEL_TOOL_VERSION = "chapel-casualties-tools-v9";
export const CHAPEL_PROMPT_VERSION = "chapel-casualties-dm-v9";
export const CHAPEL_TITLE = "The Bell Beneath the Chapel";
export const CHAPEL_OBJECTIVE =
  "Tavi, a village apprentice, is missing. Explore the route to the ruined chapel and find out what happened to them.";
export const CRYPT_BOUNDARY =
  "A sealed arch divides the crypt. A skeleton guardian waits between the entrance and the evidence beyond.";

export type ChapelRoomId =
  "inn" | "ferry-landing" | "chapel-path" | "ruined-chapel" | "crypt";
export type ChapelFeatureId =
  | "missing-person-notice"
  | "mooring"
  | "waymarker"
  | "broken-roof"
  | "damaged-repair-record"
  | "crypt-steps"
  | "diversion-ledger"
  | "tavi-remains"
  | "resolution-noticeboard";
export type ChapelItemId = "healing-potion";
export type ChapelNpcId = "mara" | "oren" | "tavi";
export type ChapelOpponentDefinitionId = "skeleton";
export type ChapelOpponentCombatantId = "skeleton-guardian";
export type ChapelHostileCombatantId = ChapelOpponentCombatantId | ChapelNpcId;
export type ChapelCombatantId = "fighter" | ChapelHostileCombatantId;

export const CHAPEL_OPPONENT_DEFINITIONS = Object.freeze({
  skeleton: {
    id: "skeleton",
    name: "skeleton guardian",
    description:
      "A bleached skeleton rises beside the sealed arch, gripping a rusted shortsword.",
    maxHp: 13,
    armorClass: 13,
    attackBonus: 4,
    initiativeBonus: 2,
    attackName: "rusted shortsword",
    damage: { dice: 1, sides: 6, modifier: 2 },
  },
} as const);

export const CHAPEL_OPPONENT_COMBATANTS = Object.freeze({
  "skeleton-guardian": {
    combatantId: "skeleton-guardian",
    definitionId: "skeleton",
    roomId: "crypt",
  },
} as const);

export const CHAPEL_ITEMS = Object.freeze({
  "healing-potion": {
    id: "healing-potion",
    name: "healing potion",
    description: "A stoppered red potion that restores 2d4 + 2 HP.",
    initialPlacement: {
      type: "room" as const,
      roomId: "chapel-path" as const,
      featureId: "waymarker" as const,
      description: "tucked into a dry niche beneath the waymarker",
    },
  },
} as const);

const CHAPEL_FIGHTER_DEFINITION = Object.freeze({
  maxHp: 20,
  armorClass: 16,
  attackBonus: 5,
  initiativeBonus: 1,
  damage: { dice: 1, sides: 8, modifier: 3 },
});
export type ChapelTalkTopicId = "tavi" | "repairs" | "crypt" | "rescue";
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
  | "mara-ferry-belief"
  | "diversion-ledger"
  | "tavi-crypt-testimony"
  | "tavi-remains";
export type ChapelMilestoneId =
  | "chapel-route-known"
  | "unsafe-repairs-linked-to-oren"
  | "mara-account-recorded"
  | "oren-account-released"
  | "guardian-cleared"
  | "ledger-recovered"
  | "tavi-fate-established"
  | "tavi-rescued"
  | "tavi-death-confirmed";
export type ChapelResolutionId = "public-disclosure" | "confidential-referral";
export type ChapelResolution = Readonly<{
  id: ChapelResolutionId;
  taviFate:
    "alive-in-crypt" | "rescued-to-inn" | "dead-in-crypt" | "dead-at-inn";
  casualties?: readonly ChapelNpcId[];
  consequences: readonly (
    | "evidence-published"
    | "village-inquiry-initiated"
    | "evidence-delivered-confidentially"
    | "restitution-repair-requested"
    | "oren-committed-future-restitution"
  )[];
}>;
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
  maxHp: number;
  armorClass: number;
  attackBonus: number;
  initiativeBonus: number;
  attackName: string;
  damage: DamageDefinition;
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
    maxHp: 8,
    armorClass: 10,
    attackBonus: 1,
    initiativeBonus: 0,
    attackName: "iron poker",
    damage: { dice: 1, sides: 4, modifier: 0 },
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
    maxHp: 9,
    armorClass: 11,
    attackBonus: 2,
    initiativeBonus: 1,
    attackName: "ferryman's pole",
    damage: { dice: 1, sides: 4, modifier: 1 },
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
    maxHp: 6,
    armorClass: 10,
    attackBonus: 1,
    initiativeBonus: 2,
    attackName: "stone shard",
    damage: { dice: 1, sides: 4, modifier: 0 },
    knows: ["PRIVATE_CONDITION: Tavi is trapped beyond the guardian."],
    doesNotKnow: ["Unrelated village conversations after entering the crypt."],
    believes: [],
    wants: ["Escape the crypt and report what happened."],
    reveals: [
      {
        topicId: "crypt",
        topicName: "What happened in the crypt",
        factIds: ["tavi-crypt-testimony"],
      },
      {
        topicId: "rescue",
        topicName: "Return safely to the inn",
        factIds: [],
      },
    ],
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

const TAVI_DISCOVERY = {
  id: "tavi-crypt-testimony",
  title: "Tavi's crypt account",
  source: { type: "npc", id: "tavi", name: "Tavi", locationId: "crypt" },
  classification: "testimony",
  summary:
    "Tavi reports following the chapel ledger into the crypt and becoming trapped when the skeleton guardian rose.",
  actionableLead: "Return Tavi safely to the village inn.",
} as const satisfies ChapelDiscovery;

export const INITIAL_CHAPEL_NPC_STATES = Object.freeze({
  mara: Object.freeze({ hp: 8, maxHp: 8 }),
  oren: Object.freeze({ hp: 9, maxHp: 9 }),
  tavi: Object.freeze({ hp: 6, maxHp: 6 }),
});
export type ChapelJournal = Readonly<{
  quest: Readonly<{
    id: "find-tavi";
    title: "Find Tavi";
    status: "active" | "resolved";
    milestones: readonly ChapelMilestoneId[];
  }>;
  discoveries: readonly ChapelDiscovery[];
  actionableLeads: readonly string[];
  resolution?: ChapelResolution;
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
  {
    targetId: "diversion-ledger",
    discovery: {
      id: "diversion-ledger",
      title: "Oren's diversion ledger",
      source: {
        type: "feature",
        id: "diversion-ledger",
        name: "diversion ledger",
        locationId: "crypt",
      },
      classification: "observation",
      summary:
        "The ledger proves Oren diverted chapel repair funds to buy medicine, leaving the unsafe work unfinished.",
      actionableLead: "Return to Oren with the conclusive ledger evidence.",
    },
    milestoneId: "ledger-recovered",
  },
  {
    targetId: "tavi-remains",
    discovery: {
      id: "tavi-remains",
      title: "Tavi's fate",
      source: {
        type: "feature",
        id: "tavi-remains",
        name: "Tavi's remains",
        locationId: "crypt",
      },
      classification: "observation",
      summary:
        "Tavi died in the crypt after being trapped beyond the guardian.",
      actionableLead:
        "Return to the inn noticeboard and resolve the investigation truthfully.",
    },
    milestoneId: "tavi-death-confirmed",
  },
] as const satisfies readonly ChapelEvidence[];

type PublicFeature = Readonly<{
  id: ChapelFeatureId;
  name: string;
  description: string;
}>;
const DIVERSION_LEDGER_FEATURE = Object.freeze({
  id: "diversion-ledger" as const,
  name: "diversion ledger",
  description:
    "A water-stained ledger lies beyond the defeated guardian. Its entries can be searched carefully.",
});
const TAVI_REMAINS_FEATURE = Object.freeze({
  id: "tavi-remains" as const,
  name: "Tavi's remains",
  description:
    "Tavi lies motionless here. A careful search can establish and record what happened.",
});

function npcHitPoints(state: ChapelState, npcId: ChapelNpcId): number {
  const npcState = state.npcStates[npcId];
  return "hp" in npcState
    ? npcState.hp
    : npcState.condition === "living"
      ? (CHAPEL_NPCS.find(({ id }) => id === npcId)?.maxHp ?? 1)
      : 0;
}

function npcIsLiving(state: ChapelState, npcId: ChapelNpcId): boolean {
  return npcHitPoints(state, npcId) > 0;
}
function resolutionNoticeboardFeature(state: ChapelState): PublicFeature {
  const description =
    state.resolution === undefined
      ? "The inn noticeboard presents two deliberate choices. Public disclosure publishes the ledger evidence and initiates a village inquiry. Confidential referral delivers the evidence privately to the trustees with a request for restitution and chapel repair."
      : state.resolution.id === "public-disclosure"
        ? `The noticeboard records public disclosure: the ledger evidence was published and a village inquiry was initiated. Tavi's recorded fate is ${state.resolution.taviFate}.`
        : `The noticeboard records confidential referral: the ledger was delivered privately to the trustees with a restitution and chapel-repair request. ${(state.resolution.casualties ?? []).includes("oren") ? "Oren was dead, so no personal promise of restitution was recorded." : "Oren committed to future restitution."} Tavi's recorded fate is ${state.resolution.taviFate}. No completed payment or repair is claimed.`;
  return {
    id: "resolution-noticeboard",
    name: "resolution noticeboard",
    description,
  };
}
export type ChapelInspection =
  | Readonly<PublicFeature & { type: "feature" }>
  | Readonly<{
      type: "opponent";
      id: ChapelOpponentCombatantId;
      name: string;
      description: string;
      condition: "living" | "defeated";
    }>
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
  status: "playing" | "victory" | "defeat" | "quit";
  fighter: Readonly<{
    hp: number;
    maxHp: number;
    equipmentIds: readonly ["longsword"];
  }>;
  quest: Readonly<{
    id: "find-tavi";
    status: "active" | "resolved";
    milestones: readonly ChapelMilestoneId[];
  }>;
  discoveries: readonly ChapelDiscovery[];
  npcStates: Readonly<
    Record<
      ChapelNpcId,
      | Readonly<{ hp: number; maxHp: number }>
      | Readonly<{ condition: "living" | "dead" }>
    >
  >;
  npcLocations: Readonly<Record<ChapelNpcId, ChapelRoomId>>;
  npcDeathLocations?: Readonly<Partial<Record<ChapelNpcId, ChapelRoomId>>>;
  conversationHistory: readonly Readonly<{
    speakerId: ChapelNpcId;
    statements: readonly string[];
  }>[];
  socialChallenges: Readonly<{
    guardedAccount?: ChapelSocialCheck;
  }>;
  itemPlacements: Readonly<
    Record<
      ChapelItemId,
      | Readonly<{
          type: "room";
          roomId: ChapelRoomId;
          featureId: ChapelFeatureId;
        }>
      | Readonly<{ type: "inventory" }>
      | Readonly<{ type: "consumed" }>
    >
  >;
  opponents: Readonly<
    Record<
      ChapelOpponentCombatantId,
      Readonly<{
        combatantId: ChapelOpponentCombatantId;
        definitionId: ChapelOpponentDefinitionId;
        hp: number;
        maxHp: number;
      }>
    >
  >;
  combat?: Readonly<{
    opponentCombatantId: ChapelHostileCombatantId;
    initiative: Readonly<
      Record<ChapelCombatantId, InitiativeRoll<ChapelCombatantId>>
    >;
    turnOrder: readonly [ChapelCombatantId, ChapelCombatantId];
    currentTurn: ChapelCombatantId;
  }>;
  resolution?: ChapelResolution;
}>;

export type ChapelSocialCheck = Readonly<{
  approach: Exclude<ChapelTalkApproach, "ask">;
  die: number;
  modifier: 1;
  total: number;
  dc: 11;
  result: "success" | "failure";
}>;
export type DialogueChapelState = Omit<
  ChapelState,
  | "socialChallenges"
  | "itemPlacements"
  | "opponents"
  | "combat"
  | "npcLocations"
>;
export type SocialChapelState = Omit<
  ChapelState,
  "itemPlacements" | "opponents" | "combat" | "status" | "npcLocations"
> &
  Readonly<{ status: "playing" | "quit" }>;
export type GuardianChapelState = Omit<
  ChapelState,
  "itemPlacements" | "npcLocations"
>;
export type PotionChapelState = Omit<ChapelState, "npcLocations">;
export type RescueChapelState = Omit<ChapelState, "resolution" | "quest"> &
  Readonly<{
    quest: Readonly<{
      id: "find-tavi";
      status: "active";
      milestones: readonly ChapelMilestoneId[];
    }>;
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
  | {
      type: "chapel-inspected";
      name: string;
      description: string;
      condition?: "living" | "defeated";
    }
  | {
      type: "chapel-discovered";
      discoveryId: ChapelDiscoveryId;
      milestoneId: ChapelMilestoneId;
    }
  | { type: "chapel-conversation"; conversation: ChapelConversation }
  | { type: "chapel-tavi-rescued"; fromRoomId: "crypt"; roomId: "inn" }
  | { type: "chapel-resolved"; resolution: ChapelResolution }
  | { type: "chapel-item-taken"; itemId: ChapelItemId }
  | {
      type: "chapel-item-used";
      itemId: ChapelItemId;
      healingRolls: readonly [number, number];
      modifier: 2;
      rolledHealing: number;
      actualHealing: number;
      hp: number;
      maxHp: number;
    }
  | (Readonly<{ type: "chapel-social-check" }> & ChapelSocialCheck)
  | {
      type: "combat-started";
      combatantId: ChapelHostileCombatantId;
      definitionId: ChapelOpponentDefinitionId | ChapelNpcId;
    }
  | {
      type: "initiative-rolled";
      combatantId: ChapelCombatantId;
      bonus: number;
      roll: number;
      total: number;
    }
  | { type: "turn-started"; combatantId: ChapelCombatantId }
  | AttackResolvedEvent<ChapelCombatantId>
  | {
      type: "combat-ended";
      combatantId: ChapelCombatantId;
      outcome: "defeated";
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
    | "chapel-unavailable"
    | "chapel-missing-argument"
    | "chapel-session-ended"
    | "chapel-combat-restriction"
    | "chapel-invalid-attack-target"
    | "chapel-dead-target"
    | "chapel-item-unavailable"
    | "chapel-full-hp"
    | "chapel-invalid-resolution"
    | "chapel-resolution-unavailable"
    | "chapel-terminal-state";
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
    npcLocations: { mara: "inn", oren: "ferry-landing", tavi: "crypt" },
    npcDeathLocations: {},
    conversationHistory: [],
    socialChallenges: {},
    itemPlacements: {
      "healing-potion": {
        type: "room",
        roomId: "chapel-path",
        featureId: "waymarker",
      },
    },
    opponents: {
      "skeleton-guardian": {
        combatantId: "skeleton-guardian",
        definitionId: "skeleton",
        hp: CHAPEL_OPPONENT_DEFINITIONS.skeleton.maxHp,
        maxHp: CHAPEL_OPPONENT_DEFINITIONS.skeleton.maxHp,
      },
    },
  };
}

type VisibleChapelNpc = Readonly<{
  id: ChapelNpcId;
  name: string;
  condition: "living";
  subjects: readonly Readonly<{ id: ChapelTalkTopicId; name: string }>[];
}>;

export function visibleChapelNpcs(
  state: ChapelState,
  rescueEnabled = true,
): readonly VisibleChapelNpc[] {
  const guardianCleared = state.quest.milestones.includes("guardian-cleared");
  return CHAPEL_NPCS.filter(
    (npc) =>
      state.npcLocations[npc.id] === state.locationId &&
      (npc.publiclyVisible ||
        (rescueEnabled && npc.id === "tavi" && guardianCleared)) &&
      npcIsLiving(state, npc.id),
  ).map((npc) => ({
    id: npc.id,
    name: npc.name,
    condition: "living",
    subjects: npc.reveals
      .filter(() => npc.id !== "oren" || "socialChallenges" in state)
      .filter(({ topicId }) =>
        npc.id !== "tavi" || topicId !== "rescue"
          ? true
          : state.npcLocations.tavi === "crypt",
      )
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
  rescueEnabled = true,
): ChapelResult {
  const speakerId = normalized(target ?? "") as ChapelNpcId;
  const topicId = normalized(topic ?? "") as ChapelTalkTopicId;
  const normalizedApproach = normalized(approach ?? "") as ChapelTalkApproach;
  const visible = visibleChapelNpcs(state, rescueEnabled).find(
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

  if (speakerId === "tavi") {
    return talkToTavi(state, topicId, normalizedApproach, npc.name);
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

function talkToTavi(
  state: ChapelState,
  topicId: ChapelTalkTopicId,
  approach: ChapelTalkApproach,
  speakerName: string,
): ChapelResult {
  const priorStatements = state.conversationHistory
    .filter((entry) => entry.speakerId === "tavi")
    .flatMap(({ statements }) => statements)
    .slice(-6);
  const rescued = topicId === "rescue";
  const approvedFacts = rescued
    ? [
        {
          id: "tavi-rescue-consent",
          statement: "I am ready to return safely to the village inn.",
        },
      ]
    : [
        {
          id: "tavi-crypt-testimony",
          statement:
            "I followed the chapel ledger into the crypt and was trapped when the skeleton guardian rose.",
        },
      ];
  const hasFate = state.quest.milestones.includes("tavi-fate-established");
  const hasRescue = state.quest.milestones.includes("tavi-rescued");
  const nextState: ChapelState = {
    ...state,
    quest: {
      ...state.quest,
      milestones: [
        ...state.quest.milestones,
        ...(!rescued && !hasFate ? (["tavi-fate-established"] as const) : []),
        ...(rescued && !hasRescue ? (["tavi-rescued"] as const) : []),
      ],
    },
    discoveries:
      !rescued && !state.discoveries.some(({ id }) => id === TAVI_DISCOVERY.id)
        ? [...state.discoveries, TAVI_DISCOVERY]
        : state.discoveries,
    npcLocations: rescued
      ? { ...state.npcLocations, tavi: "inn" }
      : state.npcLocations,
    conversationHistory: [
      ...state.conversationHistory,
      {
        speakerId: "tavi" as const,
        statements: approvedFacts.map(({ statement }) => statement),
      },
    ].slice(-8),
  };
  const conversation: ChapelConversation = {
    speakerId: "tavi",
    speakerName,
    topicId,
    topicName:
      topicId === "rescue"
        ? "Return safely to the inn"
        : "What happened in the crypt",
    approach,
    attitude: "concerned",
    voice:
      "Observant and shaken but precise; speaks only about events personally witnessed in the crypt.",
    approvedFacts,
    authoredReply: rescued
      ? "Tavi: Yes. I am ready to leave the crypt. I can follow the marked safe route to the village inn."
      : "Tavi: I followed the chapel ledger into the crypt. The skeleton rose behind me and trapped me here.",
    speakerHistory: priorStatements,
  };
  return {
    state: nextState,
    events: [
      ...(rescued
        ? ([
            { type: "chapel-tavi-rescued", fromRoomId: "crypt", roomId: "inn" },
          ] as const)
        : []),
      { type: "chapel-conversation", conversation },
    ],
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
  const hasLedger = state.discoveries.some(
    ({ id }) => id === "diversion-ledger",
  );
  if (topicId === "repairs" && hasLedger) {
    return finish(
      [
        {
          id: "oren-ledger-response",
          statement:
            "The ledger proves I diverted the chapel repair funds to buy medicine and left the work unfinished.",
        },
      ],
      "Oren: The ledger is conclusive. I diverted the chapel repair funds to buy medicine, and the unfinished work was left unsafe.",
      "remorseful",
    );
  }
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

export function chapelRoomDescription(state: ChapelState): string {
  const room = chapelRoom(state.locationId);
  if (state.locationId === "inn" && !npcIsLiving(state, "mara")) {
    return "Rain taps the inn windows. The counter stands unattended beside a public noticeboard.";
  }
  if (state.locationId === "ferry-landing" && !npcIsLiving(state, "oren")) {
    return "A wooden ferry rests beside the empty landing, its mooring secured.";
  }
  return room.description;
}

export function visibleChapelFeatures(
  state: ChapelState,
  rescueEnabled = true,
  resolutionEnabled = true,
): readonly PublicFeature[] {
  return [
    ...chapelRoom(state.locationId).features,
    ...(rescueEnabled &&
    state.locationId === "crypt" &&
    state.quest.milestones.includes("guardian-cleared")
      ? [DIVERSION_LEDGER_FEATURE]
      : []),
    ...(rescueEnabled &&
    state.locationId ===
      (state.npcDeathLocations?.tavi ?? state.npcLocations.tavi) &&
    state.quest.milestones.includes("guardian-cleared") &&
    !npcIsLiving(state, "tavi")
      ? [TAVI_REMAINS_FEATURE]
      : []),
    ...(resolutionEnabled &&
    (chapelResolutionChoices(state).length > 0 ||
      state.resolution !== undefined)
      ? [resolutionNoticeboardFeature(state)]
      : []),
  ];
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/-/gu, " ");
}

export function chapelInspection(
  state: ChapelState,
  target: string,
  guardianEnabled = true,
  rescueEnabled = true,
  resolutionEnabled = true,
): ChapelInspection | undefined {
  const room = chapelRoom(state.locationId);
  const match = normalized(target);
  const feature = visibleChapelFeatures(
    state,
    rescueEnabled,
    resolutionEnabled,
  ).find(
    (entry) =>
      normalized(entry.id) === match || normalized(entry.name) === match,
  );
  if (feature !== undefined) {
    return { type: "feature", ...feature };
  }
  const skeleton = CHAPEL_OPPONENT_COMBATANTS["skeleton-guardian"];
  const skeletonDefinition = CHAPEL_OPPONENT_DEFINITIONS[skeleton.definitionId];
  if (
    guardianEnabled &&
    state.locationId === skeleton.roomId &&
    (match === normalized(skeleton.combatantId) ||
      match === normalized(skeletonDefinition.id) ||
      match === normalized(skeletonDefinition.name))
  ) {
    return {
      type: "opponent",
      id: skeleton.combatantId,
      name: skeletonDefinition.name,
      description: skeletonDefinition.description,
      condition:
        state.opponents[skeleton.combatantId].hp > 0 ? "living" : "defeated",
    };
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
    actionableLeads:
      state.resolution === undefined
        ? state.discoveries.flatMap((discovery) => {
            if (discovery.actionableLead === undefined) {
              return [];
            }
            if (
              discovery.id === "tavi-crypt-testimony" &&
              (state.quest.milestones.includes("tavi-rescued") ||
                !npcIsLiving(state, "tavi"))
            ) {
              return [];
            }
            if (
              discovery.id === "diversion-ledger" &&
              !npcIsLiving(state, "oren")
            ) {
              return [
                "Return to the inn noticeboard and resolve the investigation with the ledger evidence.",
              ];
            }
            return [discovery.actionableLead];
          })
        : [],
    ...(state.resolution === undefined ? {} : { resolution: state.resolution }),
  };
}

export function chapelSearchTargets(
  state: ChapelState,
  rescueEnabled = true,
  resolutionEnabled = true,
): readonly ChapelFeatureId[] {
  const visibleFeatures = new Set(
    visibleChapelFeatures(state, rescueEnabled, resolutionEnabled).map(
      ({ id }) => id,
    ),
  );
  return CHAPEL_EVIDENCE.map(({ targetId }) => targetId).filter((targetId) =>
    visibleFeatures.has(targetId),
  );
}

function startSkeletonCombat(
  state: ChapelState,
  random: Pick<RandomSource, "roll">,
): ChapelResult {
  const combatant = CHAPEL_OPPONENT_COMBATANTS["skeleton-guardian"];
  const definition = CHAPEL_OPPONENT_DEFINITIONS[combatant.definitionId];
  const initiative = resolveInitiative<ChapelCombatantId>(
    {
      combatantId: "fighter",
      bonus: CHAPEL_FIGHTER_DEFINITION.initiativeBonus,
    },
    {
      combatantId: combatant.combatantId,
      bonus: definition.initiativeBonus,
    },
    random,
  );
  const initiativeByCombatant = Object.fromEntries(
    initiative.rolls.map((roll) => [roll.combatantId, roll]),
  ) as Record<ChapelCombatantId, InitiativeRoll<ChapelCombatantId>>;
  const nextState: ChapelState = {
    ...state,
    combat: {
      opponentCombatantId: combatant.combatantId,
      initiative: initiativeByCombatant,
      turnOrder: initiative.turnOrder,
      currentTurn: initiative.turnOrder[0],
    },
  };
  const events: ChapelEvent[] = [
    {
      type: "combat-started",
      combatantId: combatant.combatantId,
      definitionId: combatant.definitionId,
    },
    ...initiative.rolls.map((roll) => ({
      type: "initiative-rolled" as const,
      ...roll,
    })),
    { type: "turn-started", combatantId: initiative.turnOrder[0] },
  ];
  if (initiative.turnOrder[0] === combatant.combatantId) {
    const openingTurn = resolveSkeletonTurn(nextState, random, false);
    return {
      state: openingTurn.state,
      events: [...events, ...openingTurn.events],
    };
  }
  return {
    state: nextState,
    events,
  };
}

function resolveSkeletonTurn(
  state: ChapelState,
  random: Pick<RandomSource, "roll">,
  announceTurn = true,
): Readonly<{ state: ChapelState; events: readonly ChapelEvent[] }> {
  const combatant = CHAPEL_OPPONENT_COMBATANTS["skeleton-guardian"];
  const definition = CHAPEL_OPPONENT_DEFINITIONS[combatant.definitionId];
  const attack = resolveAttack<ChapelCombatantId>(
    {
      attackerId: combatant.combatantId,
      targetId: "fighter",
      attackBonus: definition.attackBonus,
      targetArmorClass: CHAPEL_FIGHTER_DEFINITION.armorClass,
      targetMaxHp: CHAPEL_FIGHTER_DEFINITION.maxHp,
      damage: definition.damage,
    },
    state.fighter.hp,
    random,
  );
  const fighterDefeated = attack.targetHp === 0;
  return {
    state: {
      ...state,
      status: fighterDefeated ? "defeat" : "playing",
      fighter: { ...state.fighter, hp: attack.targetHp },
      ...(state.combat === undefined
        ? {}
        : {
            combat: {
              ...state.combat,
              currentTurn: fighterDefeated ? combatant.combatantId : "fighter",
            },
          }),
    },
    events: [
      ...(announceTurn
        ? ([
            {
              type: "turn-started",
              combatantId: combatant.combatantId,
            },
          ] as const)
        : []),
      attack.event,
      fighterDefeated
        ? {
            type: "combat-ended",
            combatantId: "fighter",
            outcome: "defeated",
          }
        : { type: "turn-started", combatantId: "fighter" },
    ],
  };
}

function isActiveSkeletonCombat(state: ChapelState): boolean {
  return (
    state.status === "playing" &&
    state.locationId === "crypt" &&
    state.combat?.opponentCombatantId === "skeleton-guardian" &&
    state.fighter.hp > 0 &&
    state.opponents["skeleton-guardian"].hp > 0
  );
}

export function chapelHostileHitPoints(
  state: ChapelState,
  combatantId: ChapelHostileCombatantId,
): number {
  return combatantId === "skeleton-guardian"
    ? state.opponents[combatantId].hp
    : npcHitPoints(state, combatantId);
}

function isActiveChapelCombat(state: ChapelState): boolean {
  return (
    state.status === "playing" &&
    state.combat !== undefined &&
    state.fighter.hp > 0 &&
    chapelHostileHitPoints(state, state.combat.opponentCombatantId) > 0
  );
}

function resolveNpcTurn(
  state: ChapelState,
  npc: (typeof CHAPEL_NPCS)[number],
  random: Pick<RandomSource, "roll">,
  includeTurnStart = true,
): ChapelResult {
  const attack = resolveAttack<ChapelCombatantId>(
    {
      attackerId: npc.id,
      targetId: "fighter",
      attackBonus: npc.attackBonus,
      targetArmorClass: CHAPEL_FIGHTER_DEFINITION.armorClass,
      targetMaxHp: CHAPEL_FIGHTER_DEFINITION.maxHp,
      damage: npc.damage,
    },
    state.fighter.hp,
    random,
  );
  const fighterDefeated = attack.targetHp === 0;
  return {
    state: {
      ...state,
      status: fighterDefeated ? "defeat" : "playing",
      fighter: { ...state.fighter, hp: attack.targetHp },
      ...(state.combat === undefined
        ? {}
        : {
            combat: {
              ...state.combat,
              currentTurn: fighterDefeated ? npc.id : "fighter",
            },
          }),
    },
    events: [
      ...(includeTurnStart
        ? ([{ type: "turn-started", combatantId: npc.id }] as const)
        : []),
      attack.event,
      ...(fighterDefeated
        ? ([
            {
              type: "combat-ended",
              combatantId: "fighter",
              outcome: "defeated",
            },
          ] as const)
        : ([{ type: "turn-started", combatantId: "fighter" }] as const)),
    ],
  };
}

function attackNpcRound(
  state: ChapelState,
  npc: (typeof CHAPEL_NPCS)[number],
  random: Pick<RandomSource, "roll">,
): ChapelResult {
  const attack = resolveAttack<ChapelCombatantId>(
    {
      attackerId: "fighter",
      targetId: npc.id,
      attackBonus: CHAPEL_FIGHTER_DEFINITION.attackBonus,
      targetArmorClass: npc.armorClass,
      targetMaxHp: npc.maxHp,
      damage: CHAPEL_FIGHTER_DEFINITION.damage,
    },
    npcHitPoints(state, npc.id),
    random,
  );
  const npcDefeated = attack.targetHp === 0;
  const nextState: ChapelState = {
    ...state,
    npcStates: {
      ...state.npcStates,
      [npc.id]: { hp: attack.targetHp, maxHp: npc.maxHp },
    },
    ...(npcDefeated
      ? {
          npcDeathLocations: {
            ...state.npcDeathLocations,
            [npc.id]: state.locationId,
          },
        }
      : {}),
  };
  if (npcDefeated) {
    return {
      state: nextState,
      events: [
        attack.event,
        { type: "combat-ended", combatantId: npc.id, outcome: "defeated" },
      ],
    };
  }
  const retaliation = resolveNpcTurn(nextState, npc, random);
  return {
    state: retaliation.state,
    events: [attack.event, ...(retaliation.events ?? [])],
  };
}

function attackNpc(
  state: ChapelState,
  npc: (typeof CHAPEL_NPCS)[number],
  random: Pick<RandomSource, "roll"> | undefined,
  rescueEnabled: boolean,
): ChapelResult {
  if (state.npcLocations[npc.id] !== state.locationId) {
    return { state, rejection: { reason: "chapel-invalid-attack-target" } };
  }
  if (!npcIsLiving(state, npc.id)) {
    return { state, rejection: { reason: "chapel-dead-target" } };
  }
  const targetVisible = visibleChapelNpcs(state, rescueEnabled).some(
    ({ id }) => id === npc.id,
  );
  if (!targetVisible) {
    return { state, rejection: { reason: "chapel-invalid-attack-target" } };
  }
  if (random === undefined) {
    throw new Error("A random source is required for combat.");
  }
  if (isActiveChapelCombat(state)) {
    return state.combat?.opponentCombatantId === npc.id
      ? attackNpcRound(state, npc, random)
      : { state, rejection: { reason: "chapel-invalid-attack-target" } };
  }
  const initiative = resolveInitiative<ChapelCombatantId>(
    {
      combatantId: "fighter",
      bonus: CHAPEL_FIGHTER_DEFINITION.initiativeBonus,
    },
    { combatantId: npc.id, bonus: npc.initiativeBonus },
    random,
  );
  const startedState: ChapelState = {
    ...state,
    combat: {
      opponentCombatantId: npc.id,
      initiative: Object.fromEntries(
        initiative.rolls.map((roll) => [roll.combatantId, roll]),
      ) as Record<ChapelCombatantId, InitiativeRoll<ChapelCombatantId>>,
      turnOrder: initiative.turnOrder,
      currentTurn: initiative.turnOrder[0],
    },
  };
  const openingEvents: ChapelEvent[] = [
    { type: "combat-started", combatantId: npc.id, definitionId: npc.id },
    ...initiative.rolls.map((roll) => ({
      type: "initiative-rolled" as const,
      ...roll,
    })),
    { type: "turn-started", combatantId: initiative.turnOrder[0] },
  ];
  const round =
    initiative.turnOrder[0] === "fighter"
      ? attackNpcRound(startedState, npc, random)
      : resolveNpcTurn(startedState, npc, random, false);
  return {
    state: round.state,
    events: [...openingEvents, ...(round.events ?? [])],
  };
}

function attackChapelTarget(
  state: ChapelState,
  target: string | undefined,
  random: Pick<RandomSource, "roll"> | undefined,
  rescueEnabled: boolean,
): ChapelResult {
  const targetName = normalized(target ?? "");
  const npc = CHAPEL_NPCS.find(
    ({ id, name }) =>
      normalized(id) === targetName || normalized(name) === targetName,
  );
  return npc === undefined
    ? attackSkeleton(state, target, random)
    : attackNpc(state, npc, random, rescueEnabled);
}

function attackSkeleton(
  state: ChapelState,
  target: string | undefined,
  random: Pick<RandomSource, "roll"> | undefined,
): ChapelResult {
  const targetName = normalized(target ?? "");
  if (targetName.length === 0) {
    return { state, rejection: { reason: "chapel-missing-argument" } };
  }
  if (targetName !== "skeleton" && targetName !== "skeleton guardian") {
    return { state, rejection: { reason: "chapel-invalid-attack-target" } };
  }
  const combatant = CHAPEL_OPPONENT_COMBATANTS["skeleton-guardian"];
  const definition = CHAPEL_OPPONENT_DEFINITIONS[combatant.definitionId];
  if (state.opponents[combatant.combatantId].hp === 0) {
    return { state, rejection: { reason: "chapel-dead-target" } };
  }
  if (!isActiveSkeletonCombat(state)) {
    return { state, rejection: { reason: "chapel-invalid-attack-target" } };
  }
  if (random === undefined) {
    throw new Error("A random source is required for combat.");
  }
  const attack = resolveAttack<ChapelCombatantId>(
    {
      attackerId: "fighter",
      targetId: combatant.combatantId,
      attackBonus: CHAPEL_FIGHTER_DEFINITION.attackBonus,
      targetArmorClass: definition.armorClass,
      targetMaxHp: definition.maxHp,
      damage: CHAPEL_FIGHTER_DEFINITION.damage,
    },
    state.opponents[combatant.combatantId].hp,
    random,
  );
  const opponentDefeated = attack.targetHp === 0;
  const milestoneRecorded = state.quest.milestones.includes("guardian-cleared");
  const nextState: ChapelState = {
    ...state,
    opponents: {
      ...state.opponents,
      [combatant.combatantId]: {
        ...state.opponents[combatant.combatantId],
        hp: attack.targetHp,
      },
    },
    ...(opponentDefeated && !milestoneRecorded
      ? {
          quest: {
            ...state.quest,
            milestones: [...state.quest.milestones, "guardian-cleared"],
          },
        }
      : {}),
  };
  if (opponentDefeated) {
    return {
      state: nextState,
      events: [
        attack.event,
        {
          type: "combat-ended",
          combatantId: combatant.combatantId,
          outcome: "defeated",
        },
      ],
    };
  }
  const opponentTurn = resolveSkeletonTurn(nextState, random);
  return {
    state: opponentTurn.state,
    events: [attack.event, ...opponentTurn.events],
  };
}

function takeChapelItem(
  state: ChapelState,
  target: string | undefined,
): ChapelResult {
  const targetName = normalized(target ?? "");
  if (targetName.length === 0) {
    return { state, rejection: { reason: "chapel-missing-argument" } };
  }
  const item = CHAPEL_ITEMS["healing-potion"];
  const placement = state.itemPlacements[item.id];
  if (
    ![normalized(item.id), normalized(item.name), "potion"].includes(
      targetName,
    ) ||
    placement.type !== "room" ||
    placement.roomId !== state.locationId
  ) {
    return { state, rejection: { reason: "chapel-item-unavailable" } };
  }
  return {
    state: {
      ...state,
      itemPlacements: {
        ...state.itemPlacements,
        [item.id]: { type: "inventory" },
      },
    },
    events: [{ type: "chapel-item-taken", itemId: item.id }],
  };
}

function useHealingPotion(
  state: ChapelState,
  target: string | undefined,
  random: Pick<RandomSource, "roll"> | undefined,
): ChapelResult {
  if (state.fighter.hp === 0) {
    return { state, rejection: { reason: "chapel-terminal-state" } };
  }
  const targetName = normalized(target ?? "");
  if (targetName.length === 0) {
    return { state, rejection: { reason: "chapel-missing-argument" } };
  }
  const item = CHAPEL_ITEMS["healing-potion"];
  if (
    ![normalized(item.id), normalized(item.name), "potion"].includes(
      targetName,
    ) ||
    state.itemPlacements[item.id].type !== "inventory"
  ) {
    return { state, rejection: { reason: "chapel-item-unavailable" } };
  }
  if (state.fighter.hp === state.fighter.maxHp) {
    return { state, rejection: { reason: "chapel-full-hp" } };
  }
  if (random === undefined) {
    throw new Error("A random source is required for healing.");
  }
  const healingRolls = [random.roll(4), random.roll(4)] as const;
  const rolledHealing = healingRolls[0] + healingRolls[1] + 2;
  const hp = Math.min(state.fighter.maxHp, state.fighter.hp + rolledHealing);
  const healedState: ChapelState = {
    ...state,
    fighter: { ...state.fighter, hp },
    itemPlacements: {
      ...state.itemPlacements,
      [item.id]: { type: "consumed" },
    },
  };
  const usedEvent: ChapelEvent = {
    type: "chapel-item-used",
    itemId: item.id,
    healingRolls,
    modifier: 2,
    rolledHealing,
    actualHealing: hp - state.fighter.hp,
    hp,
    maxHp: state.fighter.maxHp,
  };
  if (!isActiveSkeletonCombat(healedState)) {
    const npcId = healedState.combat?.opponentCombatantId;
    const npc = CHAPEL_NPCS.find(({ id }) => id === npcId);
    if (npc === undefined || !isActiveChapelCombat(healedState)) {
      return { state: healedState, events: [usedEvent] };
    }
    const opponentTurn = resolveNpcTurn(healedState, npc, random);
    return {
      state: opponentTurn.state,
      events: [usedEvent, ...(opponentTurn.events ?? [])],
    };
  }
  const opponentTurn = resolveSkeletonTurn(healedState, random);
  return {
    state: opponentTurn.state,
    events: [usedEvent, ...opponentTurn.events],
  };
}

export function chapelResolutionChoices(
  state: ChapelState,
): readonly ChapelResolutionId[] {
  const eligible =
    state.status === "playing" &&
    state.locationId === "inn" &&
    state.discoveries.some(({ id }) => id === "diversion-ledger") &&
    (state.quest.milestones.includes("tavi-fate-established") ||
      state.quest.milestones.includes("tavi-death-confirmed"));
  return eligible
    ? (["public-disclosure", "confidential-referral"] as const)
    : [];
}

export function chapelResolutionIntent(
  input: string,
): ChapelResolutionId | undefined {
  const normalizedInput = normalized(input);
  if (/\b(?:do not|don't|never|not|avoid|without)\b/u.test(normalizedInput)) {
    return undefined;
  }
  const evidence = "(?:it|this|(?:the )?(?:ledger|evidence|diversion|truth))";
  const publicIntent =
    new RegExp(
      `\\bpublic disclosure\\b|\\b(?:publish|expose) ${evidence}\\b|\\b${evidence} (?:public|published)\\b|\\btell everyone\\b.*\\b${evidence}\\b`,
      "u",
    ).test(normalizedInput) ||
    /\bmake (?:it|this|the ledger|the evidence) public\b/u.test(
      normalizedInput,
    );
  const confidentialIntent =
    new RegExp(
      `\\b(?:confidential|private) referral\\b|\\brefer ${evidence}\\b.*\\b(?:confidentially|trustee|trustees)\\b|\\bdeliver ${evidence}\\b.*\\b(?:privately|confidentially|trustee|trustees)\\b`,
      "u",
    ).test(normalizedInput) ||
    /\bseek private restitution\b/u.test(normalizedInput);
  if (publicIntent === confidentialIntent) {
    return undefined;
  }
  return publicIntent ? "public-disclosure" : "confidential-referral";
}

function resolveChapelQuest(
  state: ChapelState,
  target: string | undefined,
  casualtiesEnabled = true,
): ChapelResult {
  const normalizedTarget = normalized(target ?? "");
  if (normalizedTarget.length === 0) {
    return { state, rejection: { reason: "chapel-missing-argument" } };
  }
  const resolutionId = (
    ["public", "public disclosure", "expose", "expose the diversion"].includes(
      normalizedTarget,
    )
      ? "public-disclosure"
      : [
            "private",
            "private referral",
            "confidential referral",
            "restitution",
          ].includes(normalizedTarget)
        ? "confidential-referral"
        : undefined
  ) satisfies ChapelResolutionId | undefined;
  if (resolutionId === undefined) {
    return { state, rejection: { reason: "chapel-invalid-resolution" } };
  }
  if (!chapelResolutionChoices(state).includes(resolutionId)) {
    return { state, rejection: { reason: "chapel-resolution-unavailable" } };
  }
  const taviFate = !npcIsLiving(state, "tavi")
    ? state.npcDeathLocations?.tavi === "inn"
      ? "dead-at-inn"
      : "dead-in-crypt"
    : state.quest.milestones.includes("tavi-rescued")
      ? "rescued-to-inn"
      : "alive-in-crypt";
  const casualties = CHAPEL_NPCS.filter(
    ({ id }) => !npcIsLiving(state, id),
  ).map(({ id }) => id);
  const resolution: ChapelResolution =
    resolutionId === "public-disclosure"
      ? {
          id: resolutionId,
          taviFate,
          ...(casualtiesEnabled ? { casualties } : {}),
          consequences: ["evidence-published", "village-inquiry-initiated"],
        }
      : {
          id: resolutionId,
          taviFate,
          ...(casualtiesEnabled ? { casualties } : {}),
          consequences: [
            "evidence-delivered-confidentially",
            "restitution-repair-requested",
            ...(npcIsLiving(state, "oren")
              ? (["oren-committed-future-restitution"] as const)
              : []),
          ],
        };
  return {
    state: {
      ...state,
      status: "victory",
      quest: { ...state.quest, status: "resolved" },
      resolution,
    },
    events: [{ type: "chapel-resolved", resolution }],
  };
}

export function handleChapelAction(
  state: ChapelState,
  action: Action,
  random?: Pick<RandomSource, "roll">,
  guardianEnabled = true,
  itemsEnabled = true,
  rescueEnabled = true,
  resolutionEnabled = true,
  casualtiesEnabled = true,
): ChapelResult {
  const accept = (...events: ChapelEvent[]): ChapelResult => ({
    state,
    events,
  });
  if (action.type === "quit") {
    return {
      state: state.status === "playing" ? { ...state, status: "quit" } : state,
      events: [{ type: "session-quit" }],
    };
  }
  const gameplayMutation = [
    "move",
    "search",
    "talk",
    "take",
    "use",
    "attack",
    "resolve",
  ].includes(action.type);
  if (state.status === "quit" && gameplayMutation) {
    return { state, rejection: { reason: "chapel-session-ended" } };
  }
  if (!itemsEnabled && (action.type === "take" || action.type === "use")) {
    return { state, rejection: { reason: "chapel-unavailable" } };
  }
  if (
    (state.status === "victory" || state.status === "defeat") &&
    gameplayMutation
  ) {
    return { state, rejection: { reason: "chapel-terminal-state" } };
  }
  if (
    isActiveChapelCombat(state) &&
    gameplayMutation &&
    action.type !== "attack" &&
    action.type !== "use"
  ) {
    return { state, rejection: { reason: "chapel-combat-restriction" } };
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
    case "attack":
      return casualtiesEnabled
        ? attackChapelTarget(state, action.target, random, rescueEnabled)
        : attackSkeleton(state, action.target, random);
    case "take":
      return takeChapelItem(state, action.target);
    case "use":
      return useHealingPotion(state, action.target, random);
    case "resolve":
      return resolutionEnabled
        ? resolveChapelQuest(state, action.target, casualtiesEnabled)
        : { state, rejection: { reason: "chapel-unavailable" } };
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
        rescueEnabled,
      );
    }
    case "inspect": {
      if (!action.target) {
        return { state, rejection: { reason: "chapel-missing-argument" } };
      }
      const target = chapelInspection(
        state,
        action.target,
        guardianEnabled,
        rescueEnabled,
        resolutionEnabled,
      );
      return target === undefined
        ? { state, rejection: { reason: "chapel-unavailable" } }
        : accept({
            type: "chapel-inspected",
            name: target.name,
            description: target.description,
            ...(target.type === "opponent"
              ? { condition: target.condition }
              : {}),
          });
    }
    case "search": {
      if (state.status === "quit") {
        return { state, rejection: { reason: "chapel-session-ended" } };
      }
      if (!action.target) {
        return { state, rejection: { reason: "chapel-missing-argument" } };
      }
      const target = chapelInspection(
        state,
        action.target,
        guardianEnabled,
        rescueEnabled,
      );
      const evidence = CHAPEL_EVIDENCE.find(
        (entry) => entry.targetId === target?.id,
      );
      if (evidence === undefined) {
        return { state, rejection: { reason: "chapel-unavailable" } };
      }
      const discovery: ChapelDiscovery =
        evidence.discovery.id === "tavi-remains"
          ? {
              ...evidence.discovery,
              summary: `Tavi died at the ${chapelRoom(state.npcDeathLocations?.tavi ?? state.npcLocations.tavi).name} after being trapped beyond the guardian.`,
              source: {
                ...evidence.discovery.source,
                locationId:
                  state.npcDeathLocations?.tavi ?? state.npcLocations.tavi,
              },
            }
          : evidence.discovery;
      if (state.discoveries.some((existing) => existing.id === discovery.id)) {
        return accept();
      }
      return {
        state: {
          ...state,
          quest: {
            ...state.quest,
            milestones: [...state.quest.milestones, evidence.milestoneId],
          },
          discoveries: [...state.discoveries, discovery],
        },
        events: [
          {
            type: "chapel-discovered",
            discoveryId: discovery.id,
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
      const movedState = { ...state, locationId: room.id };
      const movementEvents: ChapelEvent[] = [
        {
          type: "chapel-moved",
          fromRoomId: state.locationId,
          roomId: room.id,
        },
        { type: "chapel-scene", roomId: room.id },
      ];
      if (
        guardianEnabled &&
        room.id === "crypt" &&
        movedState.opponents["skeleton-guardian"].hp > 0
      ) {
        if (random === undefined) {
          throw new Error("A random source is required for combat.");
        }
        const combat = startSkeletonCombat(movedState, random);
        return {
          state: combat.state,
          events: [...movementEvents, ...(combat.events ?? [])],
        };
      }
      return { state: movedState, events: movementEvents };
    }
    default:
      return { state, rejection: { reason: "chapel-unavailable" } };
  }
}

export function renderChapelIntroduction(): string {
  return `${CHAPEL_TITLE}\n\nObjective: ${CHAPEL_OBJECTIVE}\nActive quest: Find Tavi.\nMara is here. Public subject: Tavi's disappearance.\nType "help" for available commands.`;
}

function chapelHasActiveCombat(state: ChapelState): boolean {
  return (
    state.status === "playing" &&
    state.combat !== undefined &&
    chapelHostileHitPoints(state, state.combat.opponentCombatantId) > 0
  );
}

export function renderChapelStateSummary(state: ChapelState): string {
  const potion = state.itemPlacements["healing-potion"].type;
  const potionStatus =
    potion === "inventory"
      ? "available"
      : potion === "consumed"
        ? "consumed"
        : "not collected";
  const activeCombat = chapelHasActiveCombat(state);
  const combatStatus = activeCombat
    ? `${chapelCombatantName(state.combat?.currentTurn ?? "fighter")}'s turn`
    : "none";
  const discoveryCount = state.discoveries.length;
  return `State — HP ${state.fighter.hp}/${state.fighter.maxHp} | Potion: ${potionStatus} | Combat: ${combatStatus} | Quest: Find Tavi (${state.quest.status}; ${discoveryCount} ${discoveryCount === 1 ? "discovery" : "discoveries"}).`;
}

function chapelCombatantName(combatantId: ChapelCombatantId): string {
  if (combatantId === "fighter") {
    return "Fighter";
  }
  if (combatantId === "skeleton-guardian") {
    return "skeleton guardian";
  }
  return CHAPEL_NPCS.find(({ id }) => id === combatantId)?.name ?? combatantId;
}

function chapelAttackName(
  combatantId: Exclude<ChapelCombatantId, "fighter">,
): string {
  return combatantId === "skeleton-guardian"
    ? CHAPEL_OPPONENT_DEFINITIONS.skeleton.attackName
    : (CHAPEL_NPCS.find(({ id }) => id === combatantId)?.attackName ??
        "improvised weapon");
}

function chapelPublicCommandSuggestions(
  state: ChapelState,
  rescueEnabled: boolean,
  resolutionEnabled: boolean,
): readonly string[] {
  if (state.status !== "playing") {
    return ["status", "inventory", "journal", "help", "quit"];
  }
  const activeCombat = chapelHasActiveCombat(state);
  const features = visibleChapelFeatures(
    state,
    rescueEnabled,
    resolutionEnabled,
  );
  const searchCommands = activeCombat
    ? []
    : chapelSearchTargets(state, rescueEnabled, resolutionEnabled).map(
        (targetId) => {
          const target = features.find(({ id }) => id === targetId);
          return `search ${target?.name ?? targetId}`;
        },
      );
  const talkCommands = activeCombat
    ? []
    : visibleChapelNpcs(state, rescueEnabled).flatMap((npc) =>
        npc.subjects.flatMap(({ id: topicId }) =>
          (npc.id === "oren" && topicId === "repairs"
            ? CHAPEL_TALK_APPROACHES
            : (["ask"] as const)
          ).map((approach) => `talk ${npc.id} ${topicId} ${approach}`),
        ),
      );
  const potionPlacement = state.itemPlacements["healing-potion"];
  const itemCommands =
    !activeCombat &&
    potionPlacement.type === "room" &&
    potionPlacement.roomId === state.locationId
      ? ["take healing potion"]
      : potionPlacement.type === "inventory"
        ? ["use potion"]
        : [];
  const combatCommands =
    activeCombat && state.combat !== undefined
      ? [
          `attack ${state.combat.opponentCombatantId === "skeleton-guardian" ? "skeleton" : state.combat.opponentCombatantId}`,
        ]
      : [];
  const resolutionCommands =
    resolutionEnabled && !activeCombat
      ? chapelResolutionChoices(state).map((choice) =>
          choice === "public-disclosure"
            ? "resolve public disclosure"
            : "resolve confidential referral",
        )
      : [];
  return [
    ...searchCommands,
    ...talkCommands,
    ...itemCommands,
    ...combatCommands,
    ...resolutionCommands,
  ];
}

function renderChapelJournalUpdate(discovery: ChapelDiscovery): string {
  return `Journal update — ${discovery.title}: ${discovery.summary}`;
}

export function renderChapelResult(
  result: ChapelResult,
  rescueEnabled = true,
  resolutionEnabled = rescueEnabled,
): string {
  if (result.rejection !== undefined) {
    switch (result.rejection.reason) {
      case "chapel-terminal-state":
        return "The adventure is over; you can't change the final state. You may look, inspect, check status or inventory, read the journal, ask for help, or quit.";
      case "chapel-combat-restriction":
        return "You cannot do that during combat. Attack the active opponent or use an available potion.";
      case "chapel-invalid-attack-target":
        return "You cannot attack that target here.";
      case "chapel-dead-target":
        return "That target is already dead or defeated.";
      case "chapel-item-unavailable":
        return "You do not have that usable item available.";
      case "chapel-full-hp":
        return "You are already at full HP; the healing potion remains available.";
      case "chapel-invalid-resolution":
        return 'Choose "resolve public disclosure" or "resolve confidential referral" after the noticeboard presents those choices.';
      case "chapel-resolution-unavailable":
        return "The noticeboard cannot resolve the investigation yet. Recover the ledger, establish Tavi's fate, and return to the inn.";
      case "chapel-missing-argument":
        return 'Name a visible target or adjacent location. Use "look" for choices.';
      case "chapel-session-ended":
        return "This session has ended.";
      case "chapel-unavailable":
        return 'That action or target is unavailable here. Use "look" for public features and adjacent routes.';
    }
  }
  if (result.events.length === 0) {
    return "You find nothing new; this evidence is already recorded in your journal.";
  }
  return result.events
    .map((event) => {
      switch (event.type) {
        case "chapel-scene": {
          const room = chapelRoom(event.roomId);
          const npcs = visibleChapelNpcs(result.state, rescueEnabled);
          const speakers = npcs.map(
            (npc) =>
              `${npc.name} (${npc.condition}; public subjects: ${
                npc.subjects.map(({ name }) => name).join(", ") || "none"
              })`,
          );
          const skeleton = result.state.opponents["skeleton-guardian"];
          const opponentLine =
            event.roomId !== "crypt"
              ? "Opponents: none."
              : skeleton.hp > 0
                ? "Opponent: skeleton guardian (living)."
                : !rescueEnabled
                  ? "Defeated opponents: skeleton guardian. The way beyond the guardian is clear for later crypt evidence."
                  : result.state.npcLocations.tavi === "crypt" &&
                      npcIsLiving(result.state, "tavi")
                    ? "Defeated opponents: skeleton guardian. Tavi and the diversion ledger are now accessible beyond the arch."
                    : "Defeated opponents: skeleton guardian. The diversion ledger remains accessible beyond the arch.";
          const potion = CHAPEL_ITEMS["healing-potion"];
          const placement = result.state.itemPlacements[potion.id];
          const visibleItems =
            placement.type === "room" && placement.roomId === event.roomId
              ? `${potion.name} (${potion.initialPlacement.description})`
              : "none";
          const featureNames = visibleChapelFeatures(
            result.state,
            rescueEnabled,
            resolutionEnabled,
          ).map(({ name }) => name);
          const resolutionLine =
            resolutionEnabled &&
            chapelResolutionChoices(result.state).length > 0
              ? "\nNoticeboard choices: public disclosure publishes the ledger evidence and initiates a village inquiry; confidential referral delivers it privately to the trustees with a restitution and repair request."
              : resolutionEnabled && result.state.resolution !== undefined
                ? `\nNoticeboard record: ${resolutionNoticeboardFeature(result.state).description}`
                : "";
          const suggestions = chapelPublicCommandSuggestions(
            result.state,
            rescueEnabled,
            resolutionEnabled,
          );
          return `${room.name}\n${chapelRoomDescription(result.state)}\nVisible: ${featureNames.join(", ")}.${resolutionLine}\nVisible items: ${visibleItems}.\n${opponentLine}\nNPCs: ${speakers.join("; ") || "none"}.\nExits: ${room.exits.join(", ")}.\nTry: ${suggestions.join("; ") || "look"}.`;
        }
        case "chapel-moved":
          return `You travel to ${chapelRoom(event.roomId).name}.`;
        case "chapel-inspected":
          return `${event.name}: ${event.description}${event.condition === undefined ? "" : `\nCondition: ${event.condition}.`}`;
        case "chapel-discovered": {
          const discovery =
            result.state.discoveries.find(
              (entry) => entry.id === event.discoveryId,
            ) ??
            CHAPEL_EVIDENCE.find(
              (entry) => entry.discovery.id === event.discoveryId,
            )?.discovery;
          return discovery === undefined
            ? "A discovery was recorded."
            : renderChapelJournalUpdate(discovery);
        }
        case "chapel-conversation":
          return [
            event.conversation.authoredReply,
            ...result.state.discoveries
              .filter(
                (discovery) =>
                  discovery.source.type === "npc" &&
                  discovery.source.id === event.conversation.speakerId &&
                  event.conversation.approvedFacts.some(
                    (fact) =>
                      fact.id === discovery.id &&
                      !event.conversation.speakerHistory.includes(
                        fact.statement,
                      ),
                  ),
              )
              .map(renderChapelJournalUpdate),
          ].join("\n");
        case "chapel-tavi-rescued":
          return "Tavi takes the marked safe route from the crypt to the village inn.";
        case "chapel-resolved": {
          const taviOutcome =
            event.resolution.taviFate === "rescued-to-inn"
              ? "Tavi is alive and safe at the village inn."
              : event.resolution.taviFate === "dead-in-crypt"
                ? "Tavi's death in the crypt is included truthfully in the record."
                : event.resolution.taviFate === "dead-at-inn"
                  ? "Tavi's death at the village inn is included truthfully in the record."
                  : "Tavi is alive in the crypt; that established fate is included in the record.";
          const orenOutcome = (event.resolution.casualties ?? []).includes(
            "oren",
          )
            ? "Oren is dead, so no personal promise of restitution is recorded."
            : "Oren commits to future restitution; no payment or completed repair is claimed.";
          return event.resolution.id === "public-disclosure"
            ? `Public disclosure recorded. The ledger evidence is published and a village inquiry is initiated. ${taviOutcome}`
            : `Confidential referral recorded. The ledger is delivered privately to the village trustees with a request for restitution and chapel repair. ${orenOutcome} ${taviOutcome}`;
        }
        case "chapel-item-taken":
          return "You take the healing potion. It is now available in your inventory.";
        case "chapel-item-used":
          return `You drink the healing potion.\nHealing: d4 rolls: ${event.healingRolls.join(", ")} + ${event.modifier} = ${event.rolledHealing}.\nActual healing: ${event.actualHealing}.\nFighter HP: ${event.hp}/${event.maxHp}.\nThe potion is consumed.`;
        case "chapel-social-check":
          return `Social check\nApproach: ${event.approach}\nDie: d20 = ${event.die}\nModifier: +${event.modifier}\nTotal: ${event.total}\nDC: ${event.dc}\nResult: ${event.result}.`;
        case "combat-started":
          return `Combat begins against ${event.combatantId === "skeleton-guardian" ? "the " : ""}${chapelCombatantName(event.combatantId)}.`;
        case "initiative-rolled":
          return `Initiative — ${chapelCombatantName(event.combatantId)}: d20 roll ${event.roll} + modifier ${event.bonus} = ${event.total}.`;
        case "turn-started":
          return `Turn: ${chapelCombatantName(event.combatantId)}.`;
        case "attack-resolved": {
          const attackerIsFighter = event.attackerId === "fighter";
          const attackerName = chapelCombatantName(event.attackerId);
          const attackName = attackerIsFighter
            ? "longsword"
            : chapelAttackName(event.attackerId);
          const targetName = chapelCombatantName(event.targetId);
          const outcome =
            event.outcome === "critical-hit" ? "critical hit" : event.outcome;
          return [
            `${attackerName} attacks ${targetName} with ${attackName}.`,
            `Attack roll: d20 ${event.attackRoll} + modifier ${event.attackBonus} = ${event.attackTotal} vs AC ${event.targetArmorClass} — ${outcome}.`,
            ...(event.damage === undefined ? [] : [`Damage: ${event.damage}.`]),
            `Remaining HP: ${targetName} ${event.targetHp}/${event.targetMaxHp}.`,
          ].join("\n");
        }
        case "combat-ended":
          if (event.combatantId === "fighter") {
            return `${chapelCombatantName(result.state.combat?.opponentCombatantId ?? "skeleton-guardian")} defeats you.\nYou have ${result.state.fighter.hp}/${result.state.fighter.maxHp} HP and the adventure has ended in defeat. The final state remains readable; quit or start a fresh run.`;
          }
          if (event.combatantId !== "skeleton-guardian") {
            return `${chapelCombatantName(event.combatantId)} is dead. Their conversation and any rescue involving them are no longer available; discoveries already recorded remain in your journal.`;
          }
          return rescueEnabled
            ? "The skeleton guardian is defeated. Guardian cleared; Tavi and the diversion ledger beyond are now accessible. Find Tavi remains active."
            : "The skeleton guardian is defeated. Guardian cleared; the crypt evidence beyond is now accessible. Find Tavi remains active.";
        case "chapel-journal": {
          const discoveries = event.journal.discoveries.map((discovery) => {
            const sourceLocation = chapelRoom(discovery.source.locationId).name;
            return `- ${discovery.title} [${discovery.classification}] — ${discovery.summary}\n  Source: ${discovery.source.name}, ${sourceLocation}.`;
          });
          const milestones = event.journal.quest.milestones;
          return [
            `Journal\nActive quest: ${event.journal.quest.title} (${event.journal.quest.status}).`,
            `Milestones: ${milestones.length === 0 ? "none" : milestones.join(", ")}.`,
            ...(event.journal.resolution === undefined
              ? []
              : [
                  `Resolution: ${event.journal.resolution.id}.`,
                  `Consequences: ${event.journal.resolution.consequences.join(", ")}.`,
                  `Tavi fate: ${event.journal.resolution.taviFate}.`,
                ]),
            `Discoveries: ${discoveries.length === 0 ? "none" : `\n${discoveries.join("\n")}`}`,
            `Known leads: ${event.journal.actionableLeads.length === 0 ? "none" : `\n- ${event.journal.actionableLeads.join("\n- ")}`}`,
          ].join("\n");
        }
        case "chapel-status":
          return `Fighter HP: ${event.hp}/${event.maxHp}\nHealing potion: ${result.state.itemPlacements["healing-potion"].type === "inventory" ? "available" : result.state.itemPlacements["healing-potion"].type === "consumed" ? "consumed" : "not collected"}.\nSession: ${event.status}.\nQuest: Find Tavi (${event.quest.status}). ${event.quest.status === "resolved" ? `Resolution: ${result.state.resolution?.id ?? "recorded"}.` : CHAPEL_OBJECTIVE}`;
        case "chapel-inventory":
          return `Equipped: longsword.\nHealing potion: ${result.state.itemPlacements["healing-potion"].type === "inventory" ? "available" : result.state.itemPlacements["healing-potion"].type === "consumed" ? "consumed" : "not collected"}.`;
        case "chapel-help":
          return `Available commands: help, look, inspect <target>, search <evidence>, talk <npc> <topic> <approach>, move <location>, take <item>, use <item>, attack <target>, resolve <choice>, status, inventory, journal, quit.\nConversation approaches: ask, persuade, deceive, intimidate.\nPublic examples here: ${chapelPublicCommandSuggestions(result.state, rescueEnabled, resolutionEnabled).join("; ") || "look"}.\nEnter each command on its own line. During combat, attack or potion use advances the turn; reads and quit remain available. Commands are suggested only when their public target is currently available.`;
        case "session-quit":
          return "You leave the game.";
      }
    })
    .join("\n");
}
