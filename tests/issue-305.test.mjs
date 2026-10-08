// #305: parley, tolls and trade from a reaction. A reaction band may offer a
// parley (one remembered Persuasion, Deception or Intimidation check whose
// band moves the reaction, lets the character pass or starts the fight), a
// toll paid from the purse to pass, and trade with the reacting opponents
// while the band holds. The AI DM picks only offered options and approaches,
// and can neither move the band nor waive a toll.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { playAdventure } from "../dist/balance-5e.js";
import { SKILLS } from "../dist/class-5e.js";
import {
  FIFTH_PARLEY_DM_CASES,
  loadFifthParleyEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { PEACEFUL_OPTIONS, shiftedBand } from "../dist/reaction-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthEvent,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { banditToll, banditTollFile, moduleFile } from "./fixtures/modules.mjs";

/** Bea, with 2 gp in her purse. */
const RICH = { ...BEA, purse: 200 };
const runtime = createFifthRuntime(banditToll, RICH);
const poor = createFifthRuntime(banditToll, BEA);
const MOVE = { type: "move", destinationId: "rat-cellar" };
const parley = (approach) => ({ type: "react", option: "parley", approach });
const TOLL = { type: "react", option: "toll" };
const LET_PASS = { type: "react", option: "let-pass" };
/** Two d6s for a reaction roll. */
const d6s = (first, second) => [
  [6, first],
  [6, second],
];
// Bea's reaction roll (2d6 + 3) for each band.
const BANDS = {
  unfriendly: d6s(1, 1),
  uncertain: d6s(2, 1),
  indifferent: d6s(3, 3),
  friendly: d6s(5, 4),
};
// Initiative: the character's d20 18, the bandit's 2.
const INITIATIVE = [
  [20, 18],
  [20, 2],
];

function accepted(state, action, random = dice(), using = runtime) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** A refusal that draws no die and leaves the state as it was. */
function refused(state, action, code, using = runtime) {
  const random = dice();
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection?.code, code, JSON.stringify(result));
  assert.equal(result.state, state);
  assert.equal(random.drawn.length, 0);
  return result;
}

const start = (using = runtime) =>
  accepted(using.createSession(), { type: "begin" }, dice(), using).state;
/** Bea facing the bandit in `band`. */
const facing = (band, using = runtime) =>
  accepted(start(using), MOVE, dice(...BANDS[band]), using).state;
const types = (events) => events.map(({ type }) => type);
const text = (result, type) =>
  renderFifthEvent(
    result.state,
    result.events.find((event) => event.type === type),
  );

test("the module, save and trace formats bump; parley, toll and trade are validated", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 25);
  assert.equal(FIFTH_SESSION_FORMAT, 32);
  assert.equal(FIFTH_TRACE_FORMAT, 26);
  assert.throws(
    () => validateModule({ ...moduleFile("rat-tunnels"), formatVersion: 24 }),
    /format version 24 is not 25/u,
  );
  assert.deepEqual(SKILLS.deception, {
    name: "Deception",
    ability: "charisma",
  });
  const { reaction } = banditToll.encounters[0];
  assert.deepEqual(reaction.parley.approaches, [
    { skill: "persuasion", dc: 12 },
    { skill: "deception", dc: 14 },
    { skill: "intimidation", dc: 13 },
  ]);
  assert.deepEqual(reaction.toll.coins, { sp: 5 });
  assert.deepEqual(reaction.trade, {
    stock: ["dagger", "arrows"],
    minutes: 10,
  });
  const rejects = (change, message) => {
    const file = structuredClone(banditTollFile);
    change(file.encounters[0].reaction);
    assert.throws(() => validateModule(file), message);
  };
  // A band offers only what the reaction authors.
  rejects(
    (reaction) => delete reaction.toll,
    /band unfriendly offers toll, but encounter 1 reaction authors no toll/u,
  );
  // Each one authored is offered somewhere.
  rejects((reaction) => {
    for (const band of Object.values(reaction.bands)) {
      band.options = band.options.filter((option) => option !== "trade");
    }
  }, /authors a trade, but no band offers it/u);
  // Every band can end the reaction.
  rejects(
    (reaction) => (reaction.bands.uncertain.options = ["parley", "toll"]),
    /band uncertain offers neither attack nor let-pass/u,
  );
  rejects(
    (reaction) => (reaction.bands.friendly.options = ["let-pass", "bribe"]),
    /option bribe is not one of attack, let-pass, parley, toll, trade/u,
  );
  // A parley uses Persuasion, Deception or Intimidation, each once.
  rejects(
    (reaction) => (reaction.parley.approaches[0].skill = "athletics"),
    /parley approach 1 skill must be one of persuasion, deception, intimidation/u,
  );
  rejects(
    (reaction) => (reaction.parley.approaches[1].skill = "persuasion"),
    /parley offers persuasion twice/u,
  );
  rejects(
    (reaction) => (reaction.parley.approaches = []),
    /parley approaches must have 1–3 entries|parley approaches/u,
  );
  // A band shifts or ends the reaction, not both; only failing by 5 or
  // more surprises the character.
  rejects(
    (reaction) => (reaction.parley.bands.success.outcome = "let-pass"),
    /success band has a shift and an outcome/u,
  );
  rejects(
    (reaction) => (reaction.parley.bands.failure.shift = 0),
    /failure band shift 0 moves nothing/u,
  );
  rejects(
    (reaction) => (reaction.parley.bands.failure.shift = -5),
    /failure band shift must be an integer from -4 to 4/u,
  );
  rejects((reaction) => {
    delete reaction.parley.bands.failure.shift;
    reaction.parley.bands.failure.outcome = "surprise-attack";
  }, /surprise-attack is only for the failure-by-5 band/u);
  rejects(
    (reaction) => (reaction.parley.bands["success-by-5"].outcome = "bribe"),
    /outcome must be one of let-pass, fight, surprise-attack/u,
  );
  rejects(
    (reaction) => (reaction.toll.coins = { sp: 0 }),
    /toll coins must hold at least one coin/u,
  );
  // Trade stock follows a merchant's rules.
  rejects(
    (reaction) => (reaction.trade.stock = ["dagger", "longsword"]),
    /trade stocks the uncommon longsword, but uncommon gear is sold only in modules for level 3 and up/u,
  );
});

test("each band's card names its parley approaches with their DCs, its toll and its trade", () => {
  const unfriendly = accepted(start(), MOVE, dice(...BANDS.unfriendly));
  assert.equal(
    text(unfriendly, "reaction"),
    'Bandit sees you. Reaction roll: 2d6 (1 + 1) + 3 Charisma = 5: unfriendly. "Five silver, or blood." You may attack, parley (Persuasion DC 12, Deception DC 14, Intimidation DC 13) or pay the toll (5 sp).',
  );
  const indifferent = accepted(start(), MOVE, dice(...BANDS.indifferent));
  assert.match(
    text(indifferent, "reaction"),
    /You may pass peacefully, trade with Bandit or attack\.$/u,
  );
  // The action bar: one parley button per approach, with its skill and DC,
  // and the toll with its price.
  const bar = runtime
    .projectActions(unfriendly.state)
    .map(({ action, target, approach, available }) => [
      action,
      target.name,
      approach === undefined ? null : `${approach.name} DC ${approach.dc}`,
      available,
    ]);
  assert.deepEqual(bar, [
    ["react", "Attack", null, true],
    ["react", "Parley", "Persuasion DC 12", true],
    ["react", "Parley", "Deception DC 14", true],
    ["react", "Parley", "Intimidation DC 13", true],
    ["react", "Pay the toll (5 sp)", null, true],
  ]);
});

test("each parley approach rolls its own skill, once", () => {
  for (const [skill, d20, dc] of [
    ["persuasion", 10, 12],
    ["deception", 12, 14],
    ["intimidation", 11, 13],
  ]) {
    const result = accepted(
      facing("unfriendly"),
      parley(skill),
      dice([20, d20]),
    );
    const check = result.events.find(({ type }) => type === "check");
    assert.equal(check.roll.skill, skill);
    assert.equal(check.roll.label, `${SKILLS[skill].name} check`);
    // Charisma +3, and Bea is proficient in none of them.
    assert.equal(check.roll.total, d20 + 3);
    assert.equal(check.roll.dc, dc);
    assert.equal(check.band, "success");
    assert.deepEqual(result.state.parleys, [
      { encounterId: "cellar-bandit", roll: check.roll, band: "success" },
    ]);
  }
  // With several approaches one must be chosen; one not offered is refused.
  const unfriendly = facing("unfriendly");
  assert.equal(
    refused(unfriendly, { type: "react", option: "parley" }, "choose-approach")
      .rejection.reason,
    "Choose how to parley: Persuasion (DC 12), Deception (DC 14) or Intimidation (DC 13).",
  );
  refused(unfriendly, parley("athletics"), "unknown-approach");
  refused(
    unfriendly,
    { type: "react", option: "attack", approach: "persuasion" },
    "unknown-approach",
  );
  // A one-approach parley needs none named.
  const file = structuredClone(banditTollFile);
  file.encounters[0].reaction.parley.approaches = [
    { skill: "deception", dc: 14 },
  ];
  const single = createFifthRuntime(validateModule(file), RICH);
  const deceived = accepted(
    facing("unfriendly", single),
    { type: "react", option: "parley" },
    dice([20, 12]),
    single,
  );
  assert.equal(deceived.events[0].roll.skill, "deception");
});

test("a parley's band moves the reaction, lets the character pass or starts the fight", () => {
  // Success: a band up, and the new band's options (no second parley).
  const up = accepted(
    facing("unfriendly"),
    parley("persuasion"),
    dice([20, 10]),
  );
  assert.deepEqual(types(up.events), ["check", "outcome", "parleyed"]);
  assert.equal(up.state.reactingTo, "cellar-bandit");
  assert.equal(
    text(up, "parleyed"),
    "Bandit is now uncertain (was unfriendly). You may attack or pay the toll (5 sp).",
  );
  assert.deepEqual(
    runtime.projectActions(up.state).map(({ target }) => target.id),
    ["attack", "toll"],
  );
  assert.match(
    runtime.projectDmScene(up.state).combatStatus,
    /reaction roll is 5, unfriendly, and a parley has made it uncertain; the character may only attack or pay the toll \(5 sp\)\./u,
  );
  // A success from uncertain reaches indifferent, which opens trade.
  const traded = accepted(
    facing("uncertain"),
    parley("persuasion"),
    dice([20, 10]),
  );
  assert.match(
    text(traded, "parleyed"),
    /^Bandit is now indifferent \(was uncertain\)\. You may pass peacefully, trade with Bandit or attack\.$/u,
  );
  assert.ok(
    runtime.projectActions(traded.state).some(({ action }) => action === "buy"),
  );

  // Success by 5 or more: she lets the character pass, for the peaceful XP.
  const passed = accepted(
    facing("unfriendly"),
    parley("persuasion"),
    dice([20, 14]),
  );
  assert.equal(
    text(passed, "parleyed"),
    "Bandit lets you pass: the encounter ends peacefully.",
  );
  assert.equal(passed.state.reactingTo, undefined);
  assert.deepEqual(passed.state.peacefulEncounterIds, ["cellar-bandit"]);
  const den = accepted(passed.state, { type: "move", destinationId: "den" });
  const left = accepted(den.state, { type: "leave", roomId: "den" }).state;
  assert.deepEqual(runtime.projectSettlement(left).xp, [
    {
      id: "bandit-toll/encounter/cellar-bandit",
      name: "Parted peacefully with the Bandit",
      xp: 25,
    },
  ]);

  // Failure: a band down; from unfriendly that is hostile, and she fights.
  const down = accepted(
    facing("unfriendly"),
    parley("persuasion"),
    dice([20, 6], ...INITIATIVE),
  );
  assert.deepEqual(types(down.events).slice(0, 4), [
    "check",
    "outcome",
    "parleyed",
    "initiative",
  ]);
  assert.equal(text(down, "parleyed"), "Bandit turns hostile and attacks.");
  assert.equal(down.state.encounter.outcome, "ongoing");
  const order = down.events.find(({ type }) => type === "initiative").order;
  assert.ok(order.every(({ mode }) => mode === undefined));
  // From uncertain, a band down leaves her unfriendly, still talking.
  const wary = accepted(
    facing("uncertain"),
    parley("persuasion"),
    dice([20, 6]),
  );
  assert.equal(
    text(wary, "parleyed"),
    "Bandit is now unfriendly (was uncertain). You may attack or pay the toll (5 sp).",
  );

  // Failure by 5 or more: she attacks, and the character is surprised.
  const ambushed = accepted(
    facing("uncertain"),
    parley("intimidation"),
    dice([20, 2], [20, 18], [20, 5], [20, 2]),
  );
  assert.equal(
    text(ambushed, "parleyed"),
    "Bandit attacks before you are ready: you are surprised and roll initiative with disadvantage.",
  );
  const pc = ambushed.events
    .find(({ type }) => type === "initiative")
    .order.find(({ combatantId }) => combatantId === "pc");
  assert.equal(pc.d20, 5);
  assert.deepEqual(pc.mode.d20s, [18, 5]);

  // An authored "fight" outcome starts the fight, no one surprised; a band
  // left out changes nothing.
  const file = structuredClone(banditTollFile);
  file.encounters[0].reaction.parley.bands = {
    failure: { outcome: "fight" },
  };
  const blunt = createFifthRuntime(validateModule(file), RICH);
  const fought = accepted(
    facing("uncertain", blunt),
    parley("persuasion"),
    dice([20, 6], ...INITIATIVE),
    blunt,
  );
  assert.equal(text(fought, "parleyed"), "Bandit attacks.");
  assert.equal(fought.state.encounter.outcome, "ongoing");
  const unmoved = accepted(
    facing("uncertain", blunt),
    parley("persuasion"),
    dice([20, 10]),
    blunt,
  );
  assert.deepEqual(types(unmoved.events), ["check", "parleyed"]);
  assert.equal(
    text(unmoved, "parleyed"),
    "Bandit is still uncertain. You may attack or pay the toll (5 sp).",
  );
});

test("a parley is remembered: it is never rerolled", () => {
  const up = accepted(
    facing("unfriendly"),
    parley("persuasion"),
    dice([20, 10]),
  );
  // No second parley, by any approach; projecting and refusing draw nothing.
  runtime.projectActions(up.state);
  runtime.getGameToolDefinitions(up.state);
  assert.equal(
    refused(up.state, parley("deception"), "already-tried").rejection.reason,
    "You have already parleyed: you may attack or pay the toll (5 sp).",
  );
  assert.equal(up.state.parleys.length, 1);
  // A session replays the same parley from its seed.
  const play = (seed) => {
    const session = FifthSession.begin(seed, banditToll, RICH);
    session.act(MOVE);
    if (session.state.reactingTo !== undefined) {
      const offered = session.runtime
        .projectActions(session.state)
        .find(({ target }) => target.id === "parley");
      if (offered !== undefined) {
        session.act(session.runtime.actionOf(offered));
      }
    }
    return session.state;
  };
  for (let seed = 0; seed < 5; seed++) {
    assert.deepEqual(play(seed), play(seed));
  }
});

test("tolls: paid from the purse to pass, or refused for lack of coin", () => {
  const paid = accepted(facing("unfriendly"), TOLL);
  assert.deepEqual(types(paid.events), ["reacted"]);
  assert.equal(
    text(paid, "reacted"),
    "You pay the toll of 5 sp. She bites a coin and waves you on. Bandit lets you pass: the encounter ends peacefully. Purse: 1 gp 5 sp.",
  );
  assert.equal(paid.state.possessions.purse, 150);
  assert.deepEqual(paid.state.peacefulEncounterIds, ["cellar-bandit"]);
  // The room is hers no more: on to the den and out, keeping the loss.
  const den = accepted(paid.state, { type: "move", destinationId: "den" });
  const left = accepted(den.state, { type: "leave", roomId: "den" }).state;
  const settlement = runtime.projectSettlement(left);
  assert.equal(settlement.possessions.purse, 150);
  assert.deepEqual(
    settlement.xp.map(({ xp }) => xp),
    [25],
  );

  // Bea with an empty purse can't pay: the bar shows why.
  const broke = facing("unfriendly", poor);
  const toll = poor
    .projectActions(broke)
    .find(({ target }) => target.id === "toll");
  assert.deepEqual([toll.available, toll.reason], [false, "Too little coin"]);
  assert.equal(
    refused(broke, TOLL, "too-little-coin", poor).rejection.reason,
    "The toll is 5 sp, and you have 0 cp.",
  );
  // A toll is not offered where the band offers none, and nothing waives it.
  refused(facing("indifferent"), TOLL, "not-offered");
  assert.equal(
    refused(facing("unfriendly"), LET_PASS, "not-offered").rejection.reason,
    "That is not offered: you may attack, parley (Persuasion DC 12, Deception DC 14, Intimidation DC 13) or pay the toll (5 sp).",
  );
  assert.deepEqual(PEACEFUL_OPTIONS, ["let-pass", "toll"]);
});

test("trade opens only while a band offering it holds", () => {
  // Indifferent: the bandit trades, and the character still answers her.
  const indifferent = facing("indifferent");
  const room = runtime.projectRoom(indifferent);
  const trader = room.creatures.find(({ id }) => id === "cellar-bandit");
  assert.equal(trader.name, "Bandit");
  assert.deepEqual(
    trader.wares.map(({ id, price }) => [id, price]),
    [
      ["dagger", "2 gp"],
      ["arrows", "1 gp"],
    ],
  );
  const bought = accepted(indifferent, { type: "buy", itemId: "arrows" });
  assert.deepEqual(types(bought.events), ["traded"]);
  assert.equal(bought.events[0].merchant, "Bandit");
  assert.equal(bought.state.possessions.purse, 100);
  assert.equal(bought.state.reactingTo, "cellar-bandit");
  // Sell back what she stocks, too.
  const sold = accepted(bought.state, { type: "sell", itemId: "arrows" });
  assert.equal(sold.state.possessions.purse, 150);
  // Anything else waits for an answer.
  refused(bought.state, { type: "move", destinationId: "den" }, "reacting");
  refused(bought.state, { type: "react", option: "trade" }, "not-offered");
  const gone = accepted(bought.state, LET_PASS);
  assert.deepEqual(gone.state.peacefulEncounterIds, ["cellar-bandit"]);
  // Once she lets the character pass, the trade is over.
  refused(gone.state, { type: "buy", itemId: "arrows" }, "no-merchant");
  assert.ok(
    !runtime
      .projectRoom(gone.state)
      .creatures.some(({ id }) => id === "cellar-bandit"),
  );

  // Unfriendly or uncertain, she doesn't trade.
  for (const band of ["unfriendly", "uncertain"]) {
    const state = facing(band);
    const { rejection } = refused(
      state,
      { type: "buy", itemId: "arrows" },
      "reacting",
    );
    assert.match(
      rejection.reason,
      /^The Bandit is waiting to see what you do/u,
    );
    assert.ok(
      !runtime.projectActions(state).some(({ action }) => action === "buy"),
    );
    assert.deepEqual(runtime.projectRoom(state).creatures, []);
  }
});

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, reply) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text: reply };
  },
});

/** The first seed whose reaction roll for `sheet` lands in `band`. */
const seedFor = (sheet, band) => {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, banditToll, sheet);
    session.act(MOVE);
    if (session.state.reactions[0]?.roll.band === band) {
      return seed;
    }
  }
  throw new Error(`no seed for ${band}`);
};

test("scripted DM: a parley takes the approach; the DM can't move the band or waive a toll", async () => {
  const session = FifthSession.begin(
    seedFor(RICH, "unfriendly"),
    banditToll,
    RICH,
  );
  session.act(MOVE);
  const react = session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "react");
  assert.deepEqual(react.parameters.properties.option.enum, [
    "attack",
    "parley",
    "toll",
  ]);
  assert.deepEqual(react.parameters.properties.approach.enum, [
    "persuasion",
    "deception",
    "intimidation",
    null,
  ]);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /lower or waive a toll/u);
  // No band, price or retry rides along, and letting pass isn't offered.
  for (const argumentsJson of [
    '{"option":"toll","approach":null,"band":"friendly"}',
    '{"option":"toll","approach":null,"price":0}',
    '{"option":"parley","approach":"deception","retry":true}',
  ]) {
    const before = session.state;
    const { turn } = await session.converse(
      "Let me through for nothing.",
      scriptedDm("react", argumentsJson, "She waves you through."),
    );
    assert.equal(session.state, before, argumentsJson);
    assert.match(JSON.stringify(turn), /invalid-arguments/u, argumentsJson);
  }
  const before = session.state;
  const { turn } = await session.converse(
    "Waive the toll and let me pass.",
    scriptedDm("react", '{"option":"let-pass","approach":null}', "Go on."),
  );
  assert.equal(session.state, before);
  assert.match(JSON.stringify(turn), /That is not offered/u);

  // "I tell them we're from the guild": Deception, rolled by the engine.
  const { entry } = await session.converse(
    "I tell them we're from the guild.",
    scriptedDm("react", '{"option":"parley","approach":"deception"}', ""),
  );
  assert.match(entry.cards[0].text, /Deception check/u);
  assert.equal(session.state.parleys[0].roll.skill, "deception");
});

test("the parley evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthParleyEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  for (const sample of FIFTH_PARLEY_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
    // Ada carries the pouch's 8 sp, and the bandit is uncertain.
    assert.equal(session.state.possessions.purse, 80, sample.id);
    assert.equal(session.state.reactions[0].roll.band, "uncertain", sample.id);
  }
  assert.ok(
    FIFTH_PARLEY_DM_CASES.some(
      ({ playerInput, expectation }) =>
        playerInput === "I tell them we're from the guild." &&
        expectation.arguments.approach === "deception",
    ),
  );
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_PARLEY_DM_CASES,
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
      FIFTH_PARLEY_DM_CASES.map((sample) => [
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

test("the harness parleys with its best skill and pays tolls it can afford", () => {
  assert.equal(shiftedBand("uncertain", 1), "indifferent");
  assert.equal(shiftedBand("friendly", 2), "friendly");
  assert.equal(shiftedBand("unfriendly", -3), "hostile");
  // Peaceful: with coin, a toll before any parley.
  const rich = Array.from({ length: 30 }, (_, seed) =>
    playAdventure(runtime, "cautious", seed, { reactions: "peaceful" }),
  );
  const tolls = rich.filter(
    ({ settlement }) => settlement?.possessions.purse === 150,
  );
  assert.ok(tolls.length > 0);
  // Without coin, it parleys with the approach whose bonus best beats its
  // DC: Persuasion (DC 12) over Intimidation (DC 13) and Deception (DC 14),
  // all at +3 for Bea.
  const parleyed = [];
  const watching = {
    ...poor,
    handleAction(state, action, random) {
      if (action.type === "react" && action.option === "parley") {
        parleyed.push(action.approach);
      }
      return poor.handleAction(state, action, random);
    },
  };
  for (let seed = 0; seed < 30; seed++) {
    playAdventure(watching, "cautious", seed, { reactions: "peaceful" });
  }
  assert.ok(parleyed.length > 0);
  assert.ok(parleyed.every((approach) => approach === "persuasion"));
  // Always attacking, no run pays a toll.
  const attacking = Array.from({ length: 30 }, (_, seed) =>
    playAdventure(runtime, "cautious", seed),
  );
  assert.ok(
    attacking.every(
      ({ settlement }) =>
        settlement === undefined || settlement.possessions.purse === 200,
    ),
  );
});
