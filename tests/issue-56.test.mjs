import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { proveGenerationRoutes } from "../dist/generation-routes.js";
import { createSeededRandom } from "../dist/random.js";

const base = JSON.parse(
  readFileSync(resolve("adventures/generation-example.json"), "utf8"),
);
const candidate = () => ({
  ...structuredClone(base),
  id: "issue-56-candidate",
});
function routes(document) {
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return {
    loaded,
    result: proveGenerationRoutes(loaded.adventure, loaded.diagnostics),
  };
}

test("both endings and a combat gated discovery have replayable public action witnesses", () => {
  const { loaded, result } = routes(candidate());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(Object.keys(result.evidence.endings).sort(), [
    "private-report",
    "public-notice",
  ]);
  assert.ok(result.evidence.warnings["/discoveries/2"]);
  const runtime = createDataRuntime(loaded.adventure);
  for (const witness of Object.values(result.evidence.endings)) {
    let state = runtime.createSession();
    const random = createSeededRandom(witness.seed);
    for (const step of witness.steps) {
      const draws = [];
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
        step.action.name === "resolve_quest"
          ? `resolve ${
              loaded.adventure.snapshot.endings.choices.find(
                (choice) =>
                  choice.id ===
                  JSON.parse(step.action.argumentsJson).resolutionId,
              ).label
            }`
          : undefined,
      );
      assert.equal(result.modelOutput.ok, true);
      assert.deepEqual(draws, step.draws);
      assert.deepEqual(result.state, step.state);
      state = result.state;
    }
    assert.equal(state.status, "victory");
  }
});

function socialCandidate() {
  const document = candidate();
  document.quest.milestones.push("porter-account");
  document.discoveries.push({
    id: "porter-clue",
    title: "Porter's account",
    classification: "testimony",
    sourceNpcId: "porter",
    summary: "The porter saw the keeper.",
    lead: "Read the record.",
  });
  document.socialChallenges = [
    {
      id: "porter-question",
      modifier: 0,
      dc: 20,
      guardedFactIds: [],
      guardedDiscoveryIds: ["porter-clue"],
      guardedMilestoneIds: ["porter-account"],
      evidenceWhen: [{ type: "discovery-known", id: "record-clue" }],
    },
  ];
  document.npcs[0].topics = [
    {
      id: "signals",
      name: "Signals",
      aliases: ["signals"],
      when: [],
      challengeId: "porter-question",
      replies: [
        {
          when: [{ type: "discovery-known", id: "record-clue" }],
          outcome: "any",
          approach: "any",
          text: "The record confirms it.",
          attitude: "helpful",
          approvedFactIds: [],
          effects: [
            { type: "grant-discovery", id: "porter-clue" },
            { type: "record-milestone", id: "porter-account" },
          ],
        },
        {
          when: [],
          outcome: "success",
          approach: "any",
          text: "The keeper has the record.",
          attitude: "helpful",
          approvedFactIds: [],
          effects: [
            { type: "grant-discovery", id: "porter-clue" },
            { type: "record-milestone", id: "porter-account" },
          ],
        },
        {
          when: [],
          outcome: "failure",
          approach: "any",
          text: "Find the record yourself.",
          attitude: "guarded",
          approvedFactIds: [],
          effects: [],
        },
        {
          when: [],
          outcome: "unattempted",
          approach: "ask",
          text: "Ask me plainly.",
          attitude: "guarded",
          approvedFactIds: [],
          effects: [],
        },
        {
          when: [],
          outcome: "any",
          approach: "any",
          text: "Read the record.",
          attitude: "guarded",
          approvedFactIds: [],
          effects: [],
        },
      ],
    },
  ];
  return document;
}

test("a failed social check has a physical search route to an ending", () => {
  const { result } = routes(socialCandidate());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const witness = result.evidence.physicalAfterFailure;
  assert.ok(witness);
  const actions = witness.steps.map((step) => step.action.name);
  assert.ok(
    actions.indexOf("talk") <
      actions.indexOf("search", actions.indexOf("talk")),
  );
  assert.equal(actions.at(-1), "resolve_quest");
});

test("an unrelated physical search cannot certify a social fallback", () => {
  const document = socialCandidate();
  document.endings.when = [
    { type: "milestone-recorded", id: "scribe-account" },
  ];
  document.endings.any = [
    [{ type: "milestone-recorded", id: "scribe-account" }],
  ];
  document.quest.milestones.push("scribe-account");
  document.npcs[1].topics = [
    {
      id: "answer",
      name: "Answer",
      aliases: ["answer"],
      when: [],
      challengeId: "none",
      replies: [
        {
          when: [],
          outcome: "any",
          approach: "any",
          text: "Here is the answer.",
          attitude: "open",
          approvedFactIds: [],
          effects: [{ type: "record-milestone", id: "scribe-account" }],
        },
      ],
    },
  ];
  const { result } = routes(document);
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      (entry) => entry.code === "physical-fallback-incomplete",
    ),
  );
});

test("combat self dependency and an unreachable ending never receive a witness", () => {
  const locked = candidate();
  locked.quest.milestones.push("moth-awakened");
  locked.encounters[0].when = [
    { type: "milestone-recorded", id: "moth-awakened" },
  ];
  locked.encounters[0].effects = [
    { type: "record-milestone", id: "moth-awakened" },
  ];
  locked.features[2].when = [
    { type: "milestone-recorded", id: "moth-awakened" },
  ];
  locked.endings.when.push({ type: "discovery-known", id: "plaque-clue" });
  const loaded = loadAdventure(JSON.stringify(locked));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const lockedRoutes = proveGenerationRoutes(
    loaded.adventure,
    loaded.diagnostics,
  );
  assert.equal(lockedRoutes.ok, false);
  assert.ok(
    lockedRoutes.diagnostics.some((entry) => entry.code === "route-incomplete"),
  );

  const ending = candidate();
  ending.endings.choices[1].when = [
    { type: "milestone-recorded", id: "never" },
  ];
  ending.quest.milestones.push("never");
  const impossible = routes(ending).result;
  assert.equal(impossible.ok, false);
  assert.ok(
    impossible.diagnostics.some((entry) => entry.path === "/endings/choices/1"),
  );
});

test("a mandatory dead speaker is incomplete when no legal attack exists", () => {
  const document = candidate();
  document.npcs[0].combat = {
    hp: 2,
    maxHp: 2,
    stats: {
      armorClass: 10,
      attackBonus: 0,
      initiativeBonus: 0,
      damage: { dice: 1, sides: 2, modifier: 0 },
    },
  };
  document.quest.milestones.push("dead-speaker-account");
  document.endings.when.push({
    type: "milestone-recorded",
    id: "dead-speaker-account",
  });
  document.endings.when.push({ type: "actor-dead", id: "porter" });
  document.npcs[0].topics = [
    {
      id: "account",
      name: "Account",
      aliases: ["account"],
      when: [{ type: "actor-dead", id: "porter" }],
      challengeId: "none",
      replies: [
        {
          when: [],
          outcome: "any",
          approach: "any",
          text: "An impossible reply.",
          attitude: "calm",
          approvedFactIds: [],
          effects: [{ type: "record-milestone", id: "dead-speaker-account" }],
        },
      ],
    },
  ];
  const { result } = routes(document);
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      (entry) => entry.code === "warning-without-witness",
    ),
  );
});

test("an optional analysis warning without a witnessed route rejects the candidate", () => {
  const document = candidate();
  document.npcs[1].combat = {
    hp: 2,
    maxHp: 2,
    stats: {
      armorClass: 10,
      attackBonus: 0,
      initiativeBonus: 0,
      damage: { dice: 1, sides: 2, modifier: 0 },
    },
  };
  document.features[2].when = [
    { type: "actor-dead-at", id: "scribe", locationId: "garden" },
  ];
  const { result } = routes(document);
  assert.equal(result.ok, false);
  assert.ok(
    result.diagnostics.some(
      (entry) =>
        entry.code === "warning-without-witness" &&
        entry.path === "/discoveries/2",
    ),
  );
});

test("seed dependent combat defeat is recorded without being mistaken for a route", () => {
  const document = candidate();
  document.endings.when.push({ type: "discovery-known", id: "plaque-clue" });
  document.player.hp = 1;
  document.player.maxHp = 1;
  document.monsterDefinitions[0].stats.armorClass = 19;
  document.monsterDefinitions[0].stats.attackBonus = 10;
  const { loaded, result } = routes(document);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.ok(result.evidence.endings["public-notice"].seed > 0);
  const runtime = createDataRuntime(loaded.adventure);
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  state = runtime.dispatchGameTool(
    state,
    {
      name: "move",
      argumentsJson: JSON.stringify({ destinationId: "garden" }),
    },
    random,
  ).state;
  while (state.status === "playing" && state.combat !== undefined) {
    state = runtime.dispatchGameTool(
      state,
      {
        name: "attack",
        argumentsJson: JSON.stringify({ opponent_id: "garden-moth" }),
      },
      random,
    ).state;
  }
  assert.equal(state.status, "defeat");
});
