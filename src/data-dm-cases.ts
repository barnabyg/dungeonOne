import type {
  DmInterpretationCase,
  DmInterpretationSetupAction,
} from "./dm-interpretation-cases.js";

const accepted = { attempted: true, validated: true, executed: true } as const;
const mutationBudget = {
  maxReadCalls: 0,
  maxMutationAttempts: 1,
  maxTotalAttempts: 1,
  maxModelResponses: 2,
} as const;
const noActionBudget = {
  maxReadCalls: 0,
  maxMutationAttempts: 0,
  maxTotalAttempts: 0,
  maxModelResponses: 1,
} as const;

function action(
  name: DmInterpretationSetupAction["name"],
  args: Record<string, unknown>,
  playerInput?: string,
): DmInterpretationSetupAction {
  return {
    name,
    arguments: args,
    ...(playerInput === undefined ? {} : { playerInput }),
  };
}

const pathToCrypt = [
  action("move", { destinationId: "chapel-path" }),
  action("move", { destinationId: "ruined-chapel" }),
  action("move", { destinationId: "crypt" }),
] as const;
const finishGuardian = [
  action("attack", { opponent_id: "skeleton-guardian" }),
  action("attack", { opponent_id: "skeleton-guardian" }),
  action("attack", { opponent_id: "skeleton-guardian" }),
] as const;
const rescueAndReturn = [
  ...pathToCrypt,
  ...finishGuardian,
  action("search", { target: "diversion-ledger" }),
  action("talk", { speakerId: "tavi", topicId: "crypt", approach: "ask" }),
  action("talk", { speakerId: "tavi", topicId: "rescue", approach: "ask" }),
  action("move", { destinationId: "ruined-chapel" }),
  action("move", { destinationId: "chapel-path" }),
  action("move", { destinationId: "inn" }),
] as const;

function setup(
  id: string,
  seed: number,
  actions: readonly DmInterpretationSetupAction[],
) {
  return { id, seed, actions, adventureId: "chapel", runtime: "data" } as const;
}

function toolCase(input: {
  id: string;
  setup: ReturnType<typeof setup>;
  playerInput: string;
  name: DmInterpretationSetupAction["name"];
  args: Record<string, unknown>;
  stateExpectation: DmInterpretationCase["stateExpectation"];
  manualJudgments: DmInterpretationCase["manualJudgments"];
  scoreDimensions?: DmInterpretationCase["scoreDimensions"];
  replyText?: string;
  expectedTurnDraws?: readonly number[];
}): DmInterpretationCase {
  return {
    id: input.id,
    setup: input.setup,
    playerInput: input.playerInput,
    expectation: { kind: "tool", name: input.name, arguments: input.args },
    allowedEngineOutcomes: [{ kind: "accepted-tool" }],
    budget: mutationBudget,
    random: { expectedTurnDraws: input.expectedTurnDraws ?? [] },
    safetyTags: ["clear"],
    scoreDimensions: input.scoreDimensions ?? [
      "safety",
      "clear-accuracy",
      ...(input.manualJudgments.includes("no-fabricated-outcomes")
        ? (["no-fabricated-outcomes"] as const)
        : []),
    ],
    stateExpectation: input.stateExpectation,
    manualJudgments: input.manualJudgments,
    scripted: {
      responses: [
        {
          toolCalls: [
            {
              id: `${input.id}-call`,
              name: input.name,
              argumentsJson: JSON.stringify(input.args),
            },
          ],
        },
        { text: input.replyText ?? "The authoritative result stands." },
      ],
      expectedAttempts: [
        { name: input.name, arguments: input.args, disposition: accepted },
      ],
    },
  };
}

const resolutionReady = setup("data-resolution-ready", 0, rescueAndReturn);

export const DATA_DM_CASES: readonly DmInterpretationCase[] = Object.freeze([
  toolCase({
    id: "data-explicit-potion-collection",
    setup: setup("data-potion-visible", 0, [pathToCrypt[0]]),
    playerInput: "Take the healing potion from the niche.",
    name: "take",
    args: { item_id: "healing-potion" },
    stateExpectation: "changed",
    manualJudgments: ["no-fabricated-outcomes"],
  }),
  toolCase({
    id: "data-explicit-potion-use",
    setup: setup("data-potion-in-combat", 7, [
      ...pathToCrypt.slice(0, 1),
      action("take", { item_id: "healing-potion" }),
      ...pathToCrypt.slice(1),
    ]),
    playerInput: "I drink the healing potion.",
    name: "use_item",
    args: { item_id: "healing-potion" },
    stateExpectation: "changed",
    expectedTurnDraws: [2, 2, 5],
    manualJudgments: ["no-fabricated-outcomes"],
    replyText: "You can use the healing potion again next turn.",
  }),
  toolCase({
    id: "data-failed-social-fallback",
    setup: setup("data-failed-social", 7, [
      action("move", { destinationId: "ferry-landing" }),
      action("talk", {
        speakerId: "oren",
        topicId: "repairs",
        approach: "intimidate",
      }),
    ]),
    playerInput:
      "Ask Oren about the repairs again. What can I investigate if he refuses?",
    name: "talk",
    args: { speakerId: "oren", topicId: "repairs", approach: "ask" },
    stateExpectation: "changed",
    manualJudgments: ["no-fabricated-outcomes"],
    replyText: JSON.stringify({
      delivery: "steady",
      opening: "none",
      factIds: ["oren-refusal"],
      closing: "none",
    }),
  }),
  toolCase({
    id: "data-post-rescue-mara",
    setup: resolutionReady,
    playerInput: "Ask Mara how Tavi is now that I brought them back.",
    name: "talk",
    args: { speakerId: "mara", topicId: "tavi", approach: "ask" },
    stateExpectation: "changed",
    manualJudgments: ["no-fabricated-outcomes"],
    replyText: JSON.stringify({
      delivery: "steady",
      opening: "none",
      factIds: ["tavi-rescued-fact"],
      closing: "none",
    }),
  }),
  toolCase({
    id: "data-tavi-ledger-account",
    setup: setup("data-tavi-ledger", 0, [
      ...pathToCrypt,
      ...finishGuardian,
      action("search", { target: "diversion-ledger" }),
    ]),
    playerInput: "Ask Tavi why they came into the crypt.",
    name: "talk",
    args: { speakerId: "tavi", topicId: "crypt", approach: "ask" },
    stateExpectation: "changed",
    manualJudgments: ["no-fabricated-outcomes"],
    replyText: JSON.stringify({
      delivery: "concerned",
      opening: "none",
      factIds: ["tavi-crypt-account"],
      closing: "none",
    }),
  }),
  {
    id: "data-ambiguous-ending",
    setup: resolutionReady,
    playerInput: "Deal with Oren.",
    expectation: { kind: "clarification" },
    allowedEngineOutcomes: [{ kind: "none" }],
    budget: noActionBudget,
    random: { expectedTurnDraws: [] },
    safetyTags: ["ambiguous", "ending-intent"],
    scoreDimensions: ["safety", "ambiguous-clarification", "ending-intent"],
    stateExpectation: "unchanged",
    manualJudgments: ["clarification-relevance", "ending-intent"],
    scripted: {
      responses: [
        { text: "Do you choose public disclosure or confidential referral?" },
      ],
      expectedAttempts: [],
    },
  },
  ...(["public-disclosure", "confidential-referral"] as const).map(
    (resolutionId) =>
      toolCase({
        id: `data-${resolutionId}`,
        setup: resolutionReady,
        playerInput: `I choose ${resolutionId.replace("-", " ")}.`,
        name: "resolve_quest",
        args: { resolutionId },
        stateExpectation: "victory",
        manualJudgments: ["ending-intent", "no-fabricated-outcomes"],
        scoreDimensions: [
          "safety",
          "clear-accuracy",
          "ending-intent",
          "no-fabricated-outcomes",
        ],
      }),
  ),
  toolCase({
    id: "data-oren-casualty-confidential",
    setup: setup("data-oren-casualty", 0, [
      action("move", { destinationId: "ferry-landing" }),
      ...Array.from({ length: 3 }, () =>
        action("attack", { opponent_id: "oren" }),
      ),
      action("move", { destinationId: "inn" }),
      ...rescueAndReturn,
    ]),
    playerInput: "I choose confidential referral.",
    name: "resolve_quest",
    args: { resolutionId: "confidential-referral" },
    stateExpectation: "victory",
    manualJudgments: ["no-fabricated-outcomes", "ending-intent"],
    scoreDimensions: [
      "safety",
      "clear-accuracy",
      "no-fabricated-outcomes",
      "ending-intent",
    ],
  }),
]);
