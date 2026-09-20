import assert from "node:assert/strict";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import { resolveAdventure } from "../dist/runtime.js";

function noRolls() {
  return {
    roll() {
      assert.fail("This setup step must not draw randomness");
    },
  };
}

function clearGuardian(runtime) {
  let state = runtime.createSession();
  for (const destination of ["chapel-path", "ruined-chapel"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      noRolls(),
    ).state;
  }
  state = runtime.handleAction(
    state,
    { type: "move", destination: "crypt" },
    { roll: (sides) => sides },
  ).state;
  return runtime.handleAction(
    state,
    { type: "attack", target: "skeleton" },
    { roll: (sides) => sides },
  ).state;
}

function returnWithRescuedTavi(runtime) {
  let state = clearGuardian(runtime);
  for (const command of [
    "search diversion ledger",
    "talk tavi crypt ask",
    "talk tavi rescue ask",
    "move ruined chapel",
    "move chapel path",
    "move inn",
  ]) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      noRolls(),
    );
    assert.equal(result.rejection, undefined, command);
    state = result.state;
  }
  return state;
}

test("ledger recovery keeps Tavi and the available crypt actions in view", () => {
  const runtime = resolveAdventure("chapel");
  const found = runtime.handleAction(
    clearGuardian(runtime),
    runtime.parseCommand("search diversion ledger"),
    noRolls(),
  );

  assert.equal(found.rejection, undefined);
  assert.match(runtime.renderResult(found), /next:.*Tavi.*crypt/i);
  assert.deepEqual(found.state.quest, {
    id: "find-tavi",
    status: "active",
    milestones: ["guardian-cleared", "ledger-recovered"],
  });
  assert.match(
    runtime.renderStateSummary(found.state),
    /Options — Exits: ruined chapel \| Try:.*talk tavi crypt ask.*talk tavi rescue ask/i,
  );
  assert.deepEqual(
    runtime.projectDmScene(found.state).journal.actionableLeads,
    [
      "Establish Tavi's fate here in the crypt before following up on the ledger.",
    ],
  );
});

test("clear potion collection intent cannot be satisfied by looking", async () => {
  const runtime = resolveAdventure("chapel");
  const path = runtime.handleAction(runtime.createSession(), {
    type: "move",
    destination: "chapel-path",
  }).state;
  let response = 0;
  const result = await runDmTurn({
    state: path,
    runtime,
    playerInput: "Take the potion.",
    transcript: [],
    random: noRolls(),
    model: {
      async respond() {
        response += 1;
        if (response === 1) {
          return {
            toolCalls: [
              { id: "wrong-look", name: "look", argumentsJson: "{}" },
            ],
          };
        }
        if (response === 2) {
          return {
            toolCalls: [
              {
                id: "take-potion",
                name: "take",
                argumentsJson: '{"itemId":"healing-potion"}',
              },
            ],
          };
        }
        return { text: "You collect the healing potion." };
      },
    },
  });

  assert.equal(response, 3);
  assert.deepEqual(
    result.toolAttempts.map(({ call, disposition }) => ({
      name: call.name,
      validated: disposition.validated,
    })),
    [
      { name: "look", validated: false },
      { name: "take", validated: true },
    ],
  );
  assert.deepEqual(result.state.itemPlacements["healing-potion"], {
    type: "inventory",
  });
});

test("the issue 37 prompt revision is a distinct replay contract", () => {
  assert.equal(resolveAdventure("chapel").promptVersion, "chapel-human-dm-v12");
});

test("Mara acknowledges Tavi after the rescue instead of repeating the search request", async () => {
  const runtime = resolveAdventure("chapel");
  let responses = 0;
  const result = await runDmTurn({
    state: returnWithRescuedTavi(runtime),
    runtime,
    playerInput: "Talk to Mara about Tavi.",
    transcript: [],
    random: noRolls(),
    model: {
      async respond() {
        responses += 1;
        return {
          toolCalls: [
            {
              id: "talk-mara",
              name: "talk",
              argumentsJson:
                '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
            },
          ],
        };
      },
    },
  });

  assert.equal(responses, 1);
  assert.match(result.narration, /Tavi.*safe.*inn/i);
  assert.doesNotMatch(result.narration, /missing|help me find/i);
});

test("the inn prioritizes both resolutions once Tavi is safe", () => {
  const runtime = resolveAdventure("chapel");
  const summary = runtime.renderStateSummary(returnWithRescuedTavi(runtime));

  assert.match(
    summary,
    /Try: resolve public disclosure; resolve confidential referral/i,
  );
});
