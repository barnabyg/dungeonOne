import assert from "node:assert/strict";
import test from "node:test";

import { DATA_DM_CASES } from "../dist/data-dm-cases.js";
import { runScriptedDmInterpretationCase } from "../dist/dm-interpretation-cases.js";
import { runDmEvaluation } from "../dist/dm-evaluator.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { createSeededRandom } from "../dist/random.js";
import { resolveAdventure } from "../dist/runtime.js";

test("data campaign scenarios execute through the shipped runtime and projected tools", async () => {
  assert.deepEqual(
    DATA_DM_CASES.map(({ id }) => id),
    [
      "data-explicit-potion-collection",
      "data-explicit-potion-use",
      "data-failed-social-fallback",
      "data-post-rescue-mara",
      "data-tavi-ledger-account",
      "data-ambiguous-ending",
      "data-public-disclosure",
      "data-confidential-referral",
      "data-oren-casualty-confidential",
    ],
  );

  const byId = new Map();
  for (const sample of DATA_DM_CASES) {
    const report = await runScriptedDmInterpretationCase(sample);
    byId.set(sample.id, report);
    assert.equal(
      report.automatedPassed,
      true,
      `${sample.id}: ${JSON.stringify(report.checks)}`,
    );
    assert.equal(report.contentVersion, "8");
    assert.equal(report.rulesVersion, "chapel-clues-rules-v4");
    assert.equal(report.promptVersion, "chapel-clues-dm-v10");
    assert.equal(report.toolSchemaVersion, "chapel-clues-tools-v7");
    assert.equal(
      report.requests[0].scene.room.id,
      report.initialState.locationId,
    );
    if (sample.expectation.kind === "tool") {
      assert.ok(
        report.requests[0].tools.some(
          ({ name }) => name === sample.expectation.name,
        ),
        sample.id,
      );
    }
  }

  assert.match(
    byId.get("data-failed-social-fallback").result.narration,
    /notice and chapel evidence/u,
  );
  assert.match(
    byId.get("data-post-rescue-mara").result.narration,
    /Tavi has returned safely to the village inn/u,
  );
  assert.match(
    byId.get("data-tavi-ledger-account").result.narration,
    /I entered the crypt to find the chapel repair ledger/u,
  );
  assert.doesNotMatch(
    byId.get("data-explicit-potion-use").result.narration,
    /use the healing potion again/u,
  );
  assert.deepEqual(byId.get("data-ambiguous-ending").attempts, []);
  assert.equal(
    byId.get("data-public-disclosure").result.state.status,
    "victory",
  );
  assert.equal(
    byId.get("data-confidential-referral").result.state.status,
    "victory",
  );
  assert.equal(
    byId.get("data-oren-casualty-confidential").result.state.npcHealth.oren.hp,
    0,
  );
});

test("default live evaluator selects only the bounded data campaign and records content identity", async () => {
  const report = await runDmEvaluation({
    requestedModel: "scripted-evidence",
    repetitions: 3,
    createModel: ({ sample }) => {
      let index = 0;
      return {
        async respond() {
          return sample.scripted.responses[index++];
        },
      };
    },
  });
  assert.equal(report.campaign, "data-chapel");
  assert.deepEqual(
    report.caseIds,
    DATA_DM_CASES.map(({ id }) => id),
  );
  assert.deepEqual(report.contentVersions, ["8"]);
  assert.deepEqual(report.rulesVersions, ["chapel-clues-rules-v4"]);
  assert.ok(report.runs.every(({ failures }) => failures.length === 0));
  assert.equal(report.summary["no-fabricated-outcomes"].total, 24);
  assert.equal(
    report.passed,
    false,
    "unreviewed semantic judgments must remain an open gate",
  );
});

test("returning to the path after collecting the potion exposes no stale bottle", () => {
  const runtime = resolveAdventure("chapel");
  let state = runtime.createSession();
  for (const command of [
    "move chapel-path",
    "take healing-potion",
    "move ruined-chapel",
    "move chapel-path",
  ]) {
    const result = runtime.handleAction(state, runtime.parseCommand(command));
    assert.equal(result.rejection, undefined, command);
    state = result.state;
  }
  const scene = runtime.projectDmScene(state);
  assert.deepEqual(scene.room.items, []);
  assert.doesNotMatch(JSON.stringify(scene.room), /stoppered bottle/u);
  assert.ok(
    runtime
      .projectCharacterStatus(state)
      .collectedItems.some(({ id }) => id === "healing-potion"),
  );
});

test("using the potion in combat cannot offer the consumed potion again", async () => {
  const runtime = resolveAdventure("chapel");
  const random = createSeededRandom(7);
  let state = runtime.createSession();
  for (const command of [
    "move chapel-path",
    "take healing-potion",
    "move ruined-chapel",
    "move crypt",
  ]) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    );
    assert.equal(result.rejection, undefined, command);
    state = result.state;
  }
  assert.ok(state.fighter.hp < state.fighter.maxHp);
  let responses = 0;
  const turn = await runDmTurn({
    runtime,
    state,
    playerInput: "I drink the healing potion.",
    transcript: [],
    random,
    model: {
      async respond() {
        responses += 1;
        return responses === 1
          ? {
              toolCalls: [
                {
                  id: "drink-potion",
                  name: "use_item",
                  argumentsJson: '{"item_id":"healing-potion"}',
                },
              ],
            }
          : { text: "You can use the healing potion again next turn." };
      },
    },
  });
  assert.equal(turn.state.items["healing-potion"], "consumed");
  assert.equal(
    runtime
      .getGameToolDefinitions(turn.state)
      .some(({ name }) => name === "use_item"),
    false,
  );
  assert.equal(
    runtime
      .projectDmScene(turn.state)
      .suggestions.some((value) => /use healing-potion/u.test(value)),
    false,
  );
  assert.doesNotMatch(turn.narration, /use the healing potion again/u);
  assert.equal(
    responses,
    1,
    "authoritative use narration must bypass a stale model continuation",
  );
  const followUp = await runDmTurn({
    runtime,
    state: turn.state,
    playerInput: "What can I do now?",
    transcript: turn.transcript,
    random,
    model: {
      async respond(request) {
        assert.equal(request.scene.room.id, "crypt");
        assert.equal(
          request.scene.suggestions.some((value) =>
            /use healing-potion/u.test(value),
          ),
          false,
        );
        assert.equal(
          request.tools.some(({ name }) => name === "use_item"),
          false,
        );
        return { text: "You can attack the skeleton guardian." };
      },
    },
  });
  assert.doesNotMatch(followUp.narration, /potion/u);
});

test("Tavi explains entering the crypt to find the ledger", () => {
  const runtime = resolveAdventure("chapel");
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  for (const command of [
    "move chapel-path",
    "move ruined-chapel",
    "move crypt",
    "attack skeleton-guardian",
    "attack skeleton-guardian",
    "attack skeleton-guardian",
    "search diversion-ledger",
    "talk tavi crypt ask",
  ]) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    );
    assert.equal(result.rejection, undefined, command);
    state = result.state;
  }
  const prose = JSON.stringify(runtime.projectDmScene(state).journal);
  assert.match(prose, /entered the crypt to find the chapel repair ledger/u);
  assert.doesNotMatch(prose, /followed the ledger into the crypt/u);
});
