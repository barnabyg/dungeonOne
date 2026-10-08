// #283: alternative approaches to one obstacle. Each approach rolls its own
// skill and DC, the bands belong to the obstacle, and once one approach is
// rolled the others are withdrawn. Played on the obstacle yard with Ada
// (Athletics +5, Acrobatics +2, Persuasion and Intimidation −1).
import assert from "node:assert/strict";
import test from "node:test";
import { validateFifthAdventure } from "../dist/adventure-5e.js";
import {
  FIFTH_APPROACH_DM_CASES,
  loadFifthApproachEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { moduleFile, obstacleYard, room } from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(obstacleYard, TEST_FIGHTER);

function accepted(state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** Asserts a refusal with `code` that changes nothing and draws nothing. */
function refused(state, action, code, reason) {
  const random = dice();
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection?.code, code);
  assert.match(result.rejection.reason, reason);
  assert.equal(result.state, state);
  assert.equal(random.drawn.length, 0);
}

const begun = accepted(runtime.createSession(), { type: "begin" }).state;
const WALL = { type: "examine", targetId: "crumbling-wall" };
const GUARD = { type: "talk", topicId: "let-me-pass" };
const offered = (state, target) =>
  runtime
    .projectActions(state)
    .filter((view) => view.target?.id === target)
    .map(({ action, approach, available, reason }) =>
      [action, approach?.name, available ? undefined : reason]
        .filter(Boolean)
        .join(" "),
    );

test("the action bar offers each approach with its skill", () => {
  assert.deepEqual(offered(begun, "crumbling-wall"), [
    "examine Athletics",
    "examine Acrobatics",
  ]);
  assert.deepEqual(offered(begun, "let-me-pass"), [
    "talk Persuasion",
    "talk Intimidation",
  ]);
  assert.deepEqual(
    runtime.projectActions(begun).find(({ approach }) => approach).approach,
    { id: "athletics", name: "Athletics" },
  );
});

test("each approach rolls its own skill against its own DC", () => {
  const climbed = accepted(
    begun,
    { ...WALL, approach: "athletics" },
    dice([20, 7]),
  );
  assert.equal(climbed.events[0].roll.label, "Athletics check");
  assert.equal(climbed.events[0].roll.dc, 12);
  assert.equal(climbed.events[0].roll.total, 12);
  const vaulted = accepted(
    begun,
    { ...WALL, approach: "acrobatics" },
    dice([20, 8]),
  );
  assert.equal(vaulted.events[0].roll.label, "Acrobatics check");
  assert.equal(vaulted.events[0].roll.dc, 14);
  assert.equal(vaulted.events[0].roll.total, 10);
  // The bands belong to the obstacle: either way, a success opens the garden.
  for (const [approach, d20] of [
    ["athletics", 7],
    ["acrobatics", 12],
  ]) {
    const { state, events } = accepted(
      begun,
      { ...WALL, approach },
      dice([20, d20]),
    );
    assert.equal(events[0].band, "success");
    assert.equal(events.at(-1).type, "route");
    assert.ok(
      runtime.projectRoom(state).exits.some(({ id }) => id === "herb-garden"),
    );
  }
  const persuaded = accepted(
    begun,
    { ...GUARD, approach: "intimidation" },
    dice([20, 20]),
  );
  assert.equal(persuaded.events[0].roll.label, "Intimidation check");
  assert.match(persuaded.events[1].words, /Go on in/);
});

test("once one approach is rolled, the others are withdrawn", () => {
  const { state } = accepted(
    begun,
    { ...WALL, approach: "acrobatics" },
    dice([20, 8]),
  );
  // One plain Examine is left, which rolls nothing.
  assert.deepEqual(offered(state, "crumbling-wall"), ["examine"]);
  assert.deepEqual(
    accepted(state, WALL).events.map(({ type }) => type),
    ["examined"],
  );
  refused(
    state,
    { ...WALL, approach: "athletics" },
    "already-tried",
    /already tried the Crumbling Wall/,
  );
  refused(
    state,
    { ...WALL, approach: "acrobatics" },
    "already-tried",
    /already tried/,
  );
  const asked = accepted(
    begun,
    { ...GUARD, approach: "persuasion" },
    dice([20, 1]),
  ).state;
  assert.deepEqual(offered(asked, "let-me-pass"), ["talk Already asked"]);
  refused(
    asked,
    { ...GUARD, approach: "intimidation" },
    "already-asked",
    /already asked/,
  );
});

test("an approach must be chosen, and only an offered one", () => {
  refused(
    begun,
    WALL,
    "choose-approach",
    /^Choose how to try it: Athletics or Acrobatics\.$/,
  );
  refused(
    begun,
    { ...WALL, approach: "stealth" },
    "unknown-approach",
    /^That way isn't offered here; try Athletics or Acrobatics\.$/,
  );
  refused(begun, GUARD, "choose-approach", /Persuasion or Intimidation/);
  // A site without a check takes no approach.
  const garden = { ...begun, roomId: "herb-garden" };
  refused(
    garden,
    { type: "examine", targetId: "herb-bed", approach: "athletics" },
    "unknown-approach",
    /no check to try that way/,
  );
  assert.equal(
    runtime.handleAction(begun, { ...WALL, approach: 3 }, dice()).rejection
      .code,
    "unknown-action",
  );
});

test("the AI DM's check tools take the approach, offered only from the list", () => {
  const tools = Object.fromEntries(
    runtime.getGameToolDefinitions(begun).map((tool) => [tool.name, tool]),
  );
  assert.deepEqual(tools.examine.parameters.required, ["target", "approach"]);
  assert.deepEqual(tools.examine.parameters.properties.approach.enum, [
    "athletics",
    "acrobatics",
    null,
  ]);
  assert.match(
    tools.examine.description,
    /Approaches, chosen by the player's words: crumbling-wall: athletics \(Athletics\) or acrobatics \(Acrobatics\)\. Give null for any other target\./,
  );
  assert.deepEqual(tools.talk.parameters.properties.approach.enum, [
    "persuasion",
    "intimidation",
    null,
  ]);
  const call = (args, random = dice()) =>
    runtime.dispatchGameTool(
      begun,
      { name: "examine", argumentsJson: JSON.stringify(args) },
      random,
    );
  const rolled = call(
    { target: "crumbling-wall", approach: "athletics" },
    dice([20, 10]),
  );
  assert.equal(rolled.modelOutput.ok, true);
  assert.deepEqual(rolled.action, { ...WALL, approach: "athletics" });
  for (const [args, code] of [
    [{ target: "crumbling-wall", approach: "stealth" }, "action-rejected"],
    [{ target: "crumbling-wall", approach: null }, "action-rejected"],
    [{ target: "crumbling-wall", approach: 3 }, "invalid-arguments"],
    [{ target: "crumbling-wall", skill: "athletics" }, "invalid-arguments"],
  ]) {
    const random = dice();
    const result = call(args, random);
    assert.equal(result.modelOutput.error.code, code, JSON.stringify(args));
    assert.equal(result.state, begun);
    assert.equal(random.drawn.length, 0);
  }
  // Once the wall is tried, its tool takes no approach.
  const after = runtime
    .getGameToolDefinitions(rolled.state)
    .find(({ name }) => name === "examine");
  assert.deepEqual(after.parameters.required, ["target"]);
});

/** Validates `change`d yard JSON, expecting a problem. */
function rejects(change, problem) {
  const module = moduleFile("obstacle-yard");
  change(module);
  assert.throws(() => validateFifthAdventure(module, bestiary), problem);
}
const wall = (m) => room(m, "yard-gate").features[0];

test("the validator rejects malformed approaches", () => {
  rejects(
    (m) => (wall(m).check.approaches[1].skill = "athletics"),
    /room 1 feature 1 check offers athletics twice; each approach needs its own skill or ability\./,
  );
  rejects(
    (m) => wall(m).check.approaches.pop(),
    /room 1 feature 1 check approaches must list 2–4 entries\./,
  );
  rejects(
    (m) => (wall(m).check.dc = 12),
    /room 1 feature 1 check must have exactly approaches\./,
  );
  rejects(
    (m) => (wall(m).check.approaches[0] = { skill: "arcana", dc: 12 }),
    /room 1 feature 1 check approach 1 skill must be one of/,
  );
});

test("approach selection: the scripted DM passes every evaluation case", async () => {
  const adventure = await loadFifthApproachEvaluationAdventure();
  for (const sample of FIFTH_APPROACH_DM_CASES) {
    assert.ok(
      offeredToolsMatchActions(setUpCase(sample, adventure)),
      sample.id,
    );
  }
  assert.deepEqual(
    FIFTH_APPROACH_DM_CASES.map(({ id }) => id),
    [
      "approach-climb",
      "approach-vault",
      "approach-persuade",
      "approach-intimidate",
      "approach-not-offered",
      "approach-ambiguous",
    ],
  );
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_APPROACH_DM_CASES,
    adventure,
    createModel: (sample) => {
      let next = 0;
      return {
        async respond() {
          return sample.scripted[next++];
        },
      };
    },
    manualJudgments: Object.fromEntries(
      FIFTH_APPROACH_DM_CASES.map((sample) => [
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
  assert.equal(report.passed, true);
});

test("a DM that picks an approach that isn't offered is refused", async () => {
  const adventure = await loadFifthApproachEvaluationAdventure();
  const [sample] = FIFTH_APPROACH_DM_CASES;
  const session = setUpCase(sample, adventure);
  const before = session.state;
  const { entry } = await session.converse("I sneak over the wall.", {
    async respond(request) {
      return request.toolResults.length === 0
        ? {
            toolCalls: [
              {
                id: "sneak",
                name: "examine",
                argumentsJson: JSON.stringify({
                  target: "crumbling-wall",
                  approach: "stealth",
                }),
              },
            ],
          }
        : { text: "You can climb it or vault it." };
    },
  });
  assert.equal(session.state, before);
  assert.match(entry.cards[0].text, /That way isn't offered here/);
});
