// #413: the AI DM in the release module. Evaluation cases on The Coldwater
// Weirgate itself, played by Ada at level 3 (D7), cover its new mechanics in
// play: fleeing a fight, the right and the wrong item on the drain gear, the
// weir bell's alarm raised and described, the counterweight fight action, a
// wandering omen, and recalling a discovery and the way back from the other
// region. `--suite weirgate` runs them live. A live run exposed the AI DM
// examining the drain gear when the player jammed a mace into it, and
// fleeing when the player asked to get away untouched, so the prompt (v42)
// says a use_on refusal calls no tool in its place, and asks before fleeing
// when the player makes going untouched part of the request.
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import {
  FIFTH_WEIRGATE_DM_CASES,
  FIFTH_WEIRGATE_DM_CHARACTER,
  loadFifthWeirgateEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { FIFTH_DM_SYSTEM_PROMPT } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";

const byId = (id) => FIFTH_WEIRGATE_DM_CASES.find((sample) => sample.id === id);

test("the prompt says a wrong item, or fleeing untouched, calls no tool", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /without calling a tool: not examine on the feature, nor use_on with another item, in its place/u,
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /If the player makes getting away untouched part of the request .*, don't call flee: say which opponents will attack as the character goes, and ask whether it still flees/u,
  );
});

test("the release cases play the shipped Weirgate with Ada at level 3", async () => {
  const adventure = await loadFifthWeirgateEvaluationAdventure();
  const shipped = (await loadBuiltInFifthAdventures()).find(
    ({ id }) => id === "coldwater-weirgate",
  );
  assert.deepEqual(adventure, shipped);
  assert.deepEqual(FIFTH_WEIRGATE_DM_CHARACTER, testFighterAt(3));
  assert.deepEqual(
    FIFTH_WEIRGATE_DM_CASES.map(({ id }) => id),
    [
      "weirgate-flee",
      "weirgate-flee-not-free",
      "weirgate-crank-right",
      "weirgate-mace-wrong",
      "weirgate-grate-broken",
      "weirgate-alarm-said",
      "weirgate-alarm-not-quieted",
      "weirgate-counterweight-strength",
      "weirgate-counterweight-deft",
      "weirgate-paddles-elsewhere",
      "weirgate-omen-said",
      "weirgate-ledger-recalled",
      "weirgate-way-back",
      // #443: Larrow's trade, and sneaking past the sleeping bandits.
      "weirgate-trade-offered",
      "weirgate-trade-not-offered",
      "weirgate-sneak-past-sleepers",
      "weirgate-sneak-again",
    ],
  );
  for (const sample of FIFTH_WEIRGATE_DM_CASES) {
    const session = setUpCase(sample, adventure, FIFTH_WEIRGATE_DM_CHARACTER);
    assert.equal(session.character.level, 3, sample.id);
    assert.equal(session.state.status, "playing", sample.id);
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
});

test("each case's setup holds the mechanic it is about", async () => {
  const adventure = await loadFifthWeirgateEvaluationAdventure();
  const set = (id) =>
    setUpCase(byId(id), adventure, FIFTH_WEIRGATE_DM_CHARACTER);
  const scene = (id) => {
    const session = set(id);
    return session.runtime.projectDmScene(session.state);
  };
  const tools = (id) => {
    const session = set(id);
    return JSON.stringify(
      session.runtime.getGameToolDefinitions(session.state),
    );
  };

  // Fleeing: Brindle's fight is on.
  const fighting = (id, opponentId) =>
    set(id).state.encounter?.combatants.some(
      (combatant) => combatant.id === opponentId,
    );
  assert.ok(fighting("weirgate-flee", "brindle"));
  assert.match(tools("weirgate-flee"), /"flee"/u);

  // The drain gear takes the crank, and nothing else Ada carries.
  assert.match(tools("weirgate-crank-right"), /drain-gear:windlass-crank/u);
  assert.doesNotMatch(tools("weirgate-mace-wrong"), /drain-gear:mace/u);

  // Breaking the grate, as the AI DM is asked to, rings the weir bell.
  const breaking = set("weirgate-grate-broken");
  assert.match(tools("weirgate-grate-broken"), /iron-grate/u);
  assert.equal(
    breaking.act({ type: "break", doorId: "iron-grate" }, "click").result
      .rejection,
    undefined,
  );
  assert.ok(breaking.state.flags.includes("bell-rung"));

  // The weir bell rang when the grate broke noisily.
  const alarmed = set("weirgate-alarm-said");
  assert.ok(alarmed.state.flags.includes("bell-rung"));
  assert.match(scene("weirgate-alarm-said").alarm, /bell/iu);
  assert.deepEqual(byId("weirgate-alarm-said").recalls, ["bell"]);

  // Grisk's fight is on, the counterweight is offered, the paddles aren't.
  assert.ok(fighting("weirgate-counterweight-strength", "grisk"));
  assert.match(
    tools("weirgate-counterweight-strength"),
    /counterweight-chain:grisk/u,
  );
  assert.doesNotMatch(tools("weirgate-paddles-elsewhere"), /lock-paddles/u);

  // The barge horn was heard on the way to the sluice-house.
  assert.match(scene("weirgate-omen-said").wandering, /barge horn/u);
  assert.deepEqual(byId("weirgate-omen-said").recalls, ["horn"]);

  // The ledger was read in the Keep, and Ada is in the Culverts: it is in
  // the known rooms, not the room.
  const remembered = scene("weirgate-ledger-recalled");
  assert.equal(remembered.room.id, "pump-room");
  assert.equal(remembered.room.region, "The Culverts");
  for (const phrase of byId("weirgate-ledger-recalled").recalls) {
    assert.ok(
      remembered.knownRooms.some((line) => line.toLowerCase().includes(phrase)),
      phrase,
    );
    assert.doesNotMatch(
      JSON.stringify(remembered.room),
      new RegExp(phrase, "iu"),
    );
  }
});

test("the release cases pass with a scripted DM", async () => {
  const adventure = await loadFifthWeirgateEvaluationAdventure();
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_WEIRGATE_DM_CASES,
    adventure,
    character: FIFTH_WEIRGATE_DM_CHARACTER,
    createModel: (sample) => {
      let next = 0;
      return {
        async respond() {
          return sample.scripted[next++];
        },
      };
    },
    manualJudgments: Object.fromEntries(
      FIFTH_WEIRGATE_DM_CASES.map((sample) => [
        sample.id,
        {
          1: Object.fromEntries(sample.manualJudgments.map((id) => [id, true])),
        },
      ]),
    ),
  });
  for (const run of report.runs) {
    assert.ok(Object.values(run.checks).every(Boolean), run.caseId);
  }
  assert.equal(report.adventureId, "coldwater-weirgate");
  assert.equal(report.dmOff.refused, true);
  assert.equal(report.passed, true);
});

test("a DM that uses the wrong item on the drain gear fails the case", async () => {
  const adventure = await loadFifthWeirgateEvaluationAdventure();
  const sample = byId("weirgate-mace-wrong");
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: [sample],
    adventure,
    character: FIFTH_WEIRGATE_DM_CHARACTER,
    createModel: () => {
      let next = 0;
      const responses = [
        {
          toolCalls: [
            {
              id: "wrong",
              name: "use_on",
              argumentsJson: JSON.stringify({
                use: "drain-gear:windlass-crank",
              }),
            },
          ],
        },
        { text: "The gear turns." },
      ];
      return {
        async respond() {
          return responses[next++];
        },
      };
    },
    manualJudgments: { [sample.id]: { 1: {} } },
  });
  assert.equal(report.runs[0].checks.state, false);
  assert.equal(report.passed, false);
});
