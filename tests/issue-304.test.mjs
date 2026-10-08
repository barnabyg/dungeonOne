// #304: reaction rolls, a house rule on top of 5e. When a reaction-eligible
// fight would begin with no one surprised, the engine rolls 2d6 + the
// character's Charisma modifier and maps it to a band: hostile always
// fights; every other band offers only the options its module authors
// (attack, or let pass, which ends the encounter peacefully for its peaceful
// XP). The roll is remembered; mindless opponents never react.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  playAdventure,
  REACTION_POLICIES,
  renderGateResult,
} from "../dist/balance-5e.js";
import { characterProfile } from "../dist/character-5e.js";
import {
  FIFTH_REACTION_DM_CASES,
  loadFifthReactionEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import {
  REACTION_TABLE,
  reactionBand,
  rollReaction,
} from "../dist/reaction-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthEvent,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  moduleFile,
  ratTunnels,
  waryTunnels,
  waryTunnelsFile,
} from "./fixtures/modules.mjs";

const runtime = createFifthRuntime(waryTunnels, TEST_FIGHTER);
const bea = createFifthRuntime(waryTunnels, BEA);
const MOVE = { type: "move", destinationId: "rat-cellar" };
const SNEAK = { type: "sneak", destinationId: "rat-cellar" };
const ATTACK = { type: "react", option: "attack" };
const LET_PASS = { type: "react", option: "let-pass" };
/** Two d6s for a reaction roll. */
const d6s = (first, second) => [
  [6, first],
  [6, second],
];
// Initiative: the character's d20 18, the rat's 2.
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
const types = (events) => events.map(({ type }) => type);
const offered = (using, state, kind) =>
  using
    .projectActions(state)
    .filter(({ action, available }) => action === kind && available)
    .map(({ target }) => target.id);

test("the module, save and trace formats bump; reactions are validated", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 24);
  // #306 bumped the save and trace again.
  assert.ok(FIFTH_SESSION_FORMAT >= 31);
  assert.ok(FIFTH_TRACE_FORMAT >= 25);
  assert.throws(
    () => validateModule({ ...moduleFile("rat-tunnels"), formatVersion: 23 }),
    /format version 23 is not 24/u,
  );
  assert.deepEqual(waryTunnels.encounters[0].reaction.bands.friendly, {
    options: ["let-pass"],
    text: "The rat sniffs at your boots and wanders off.",
  });
  assert.equal(waryTunnels.encounters[0].reaction.peacefulXp, 15);
  assert.equal(ratTunnels.encounters[0].reaction, undefined);
  const rejects = (change, message) => {
    const file = structuredClone(waryTunnelsFile);
    change(file, file.encounters[0]);
    assert.throws(() => validateModule(file), message);
  };
  // A band with no authored option, or missing.
  rejects(
    (_, fight) => (fight.reaction.bands.uncertain.options = []),
    /encounter 1 reaction band uncertain authors no option/u,
  );
  rejects(
    (_, fight) => delete fight.reaction.bands.friendly,
    /encounter 1 reaction bands must have unfriendly, uncertain, indifferent, friendly/u,
  );
  rejects(
    (_, fight) => (fight.reaction.bands.hostile = { options: ["let-pass"] }),
    /band hostile always fights/u,
  );
  rejects(
    (_, fight) => (fight.reaction.bands.friendly.options = ["parley"]),
    /option parley is not one of attack, let-pass/u,
  );
  rejects(
    (_, fight) =>
      (fight.reaction.bands.friendly.options = ["let-pass", "let-pass"]),
    /offers let-pass twice/u,
  );
  rejects(
    (_, fight) => (fight.reaction.peacefulXp = 0),
    /peacefulXp must be an integer from 1 to 10000/u,
  );
  // An opponent that reacts needs its encounter's reaction.
  rejects((_, fight) => {
    delete fight.reaction;
    fight.opponents[0].reacts = true;
  }, /reacts, but encounter 1 has no reaction/u);
  // A fight that ends the adventure can't be let pass.
  rejects((file, fight) => {
    file.endings.push({
      id: "rat-beaten",
      kind: "victory",
      title: "The rat is beaten",
      text: "The cellar is yours.",
    });
    fight.victoryEndingId = "rat-beaten";
  }, /encounter 1 is reaction-eligible, but its fight ends the adventure/u);
});

test("mindless opponents are never reaction-eligible", () => {
  const zombie = (file) => {
    file.encounters[0].opponents = [
      { id: "zombie", monster: "zombie", description: "A zombie shambles." },
    ];
  };
  // An undead (morale "never") marked by its encounter, or on its own.
  const file = structuredClone(waryTunnelsFile);
  zombie(file);
  assert.throws(
    () => validateModule(file),
    /encounter 1 is reaction-eligible, but opponent zombie is mindless/u,
  );
  const marked = structuredClone(waryTunnelsFile);
  zombie(marked);
  marked.encounters[0].opponents[0].reacts = true;
  assert.throws(() => validateModule(marked), /opponent zombie is mindless/u);
  // A stat block whose morale is "never" is mindless too.
  const fearless = structuredClone(waryTunnelsFile);
  fearless.encounters[0].opponents[0].statBlock.morale = "never";
  assert.throws(
    () => validateModule(fearless),
    /opponent giant-rat is mindless/u,
  );
  // Nor may a zombie stand beside a rat marked to react: it would follow
  // the rat's lead and let the character pass.
  const mixed = structuredClone(waryTunnelsFile);
  mixed.encounters[0].opponents[0].reacts = true;
  mixed.encounters[0].opponents.push({
    id: "zombie",
    monster: "zombie",
    description: "A zombie shambles.",
  });
  assert.throws(
    () => validateModule(mixed),
    /is reaction-eligible, but opponent zombie is mindless/u,
  );
});

test("the reaction table maps 2d6 + Charisma to a band", () => {
  assert.deepEqual(
    REACTION_TABLE.map(({ band, upTo }) => [band, upTo]),
    [
      ["hostile", 2],
      ["unfriendly", 5],
      ["uncertain", 8],
      ["indifferent", 11],
      ["friendly", undefined],
    ],
  );
  assert.deepEqual([-1, 2, 3, 5, 6, 8, 9, 11, 12, 15].map(reactionBand), [
    "hostile",
    "hostile",
    "unfriendly",
    "unfriendly",
    "uncertain",
    "uncertain",
    "indifferent",
    "indifferent",
    "friendly",
    "friendly",
  ]);
  assert.deepEqual(rollReaction(-1, dice(...d6s(3, 4))), {
    dice: [3, 4],
    charisma: -1,
    total: 6,
    band: "uncertain",
  });
});

test("every band, with Charisma −1 and +3", () => {
  assert.equal(characterProfile(TEST_FIGHTER).modifiers.charisma, -1);
  assert.equal(characterProfile(BEA).modifiers.charisma, 3);
  const cases = [
    // Ada, Charisma −1: 2d6 − 1 runs 1–11, so she is never met as friendly.
    [runtime, [1, 2], 2, "hostile", []],
    [runtime, [2, 3], 4, "unfriendly", ["attack"]],
    [runtime, [3, 4], 6, "uncertain", ["attack", "let-pass"]],
    [runtime, [5, 5], 9, "indifferent", ["let-pass", "attack"]],
    [runtime, [6, 6], 11, "indifferent", ["let-pass", "attack"]],
    // Bea, Charisma +3: 2d6 + 3 runs 5–15, so she is never met as hostile.
    [bea, [1, 1], 5, "unfriendly", ["attack"]],
    [bea, [2, 3], 8, "uncertain", ["attack", "let-pass"]],
    [bea, [4, 4], 11, "indifferent", ["let-pass", "attack"]],
    [bea, [6, 3], 12, "friendly", ["let-pass"]],
  ];
  for (const [using, [first, second], total, band, options] of cases) {
    const random = dice(
      ...d6s(first, second),
      ...(band === "hostile" ? INITIATIVE : []),
    );
    const result = accepted(start(using), MOVE, random, using);
    const reaction = result.events.find(({ type }) => type === "reaction");
    assert.equal(reaction.roll.total, total, band);
    assert.equal(reaction.roll.band, band);
    assert.deepEqual(reaction.options, options, band);
    assert.deepEqual(result.state.reactions, [
      { encounterId: "cellar-rat", roll: reaction.roll },
    ]);
    // The card: the roll, the Charisma modifier, the band and the options.
    const [group] = describeFifthResult(result, random.drawn, "Ada")
      .flatMap(({ rolls }) => rolls)
      .filter(({ purpose }) => purpose === "reaction");
    assert.deepEqual(
      [group.dice.map(({ value }) => value), group.modifier, group.total],
      [[first, second], using === bea ? 3 : -1, total],
    );
    assert.equal(group.reaction, band);
    if (band === "hostile") {
      // Hostile always fights, at once.
      assert.equal(result.state.encounter.outcome, "ongoing");
      assert.equal(result.state.reactingTo, undefined);
      assert.deepEqual(offered(using, result.state, "react"), []);
      continue;
    }
    assert.equal(result.state.encounter, undefined);
    assert.equal(result.state.reactingTo, "cellar-rat");
    assert.deepEqual(offered(using, result.state, "react"), options);
  }
  const text = (using, pair) => {
    const result = accepted(start(using), MOVE, dice(...d6s(...pair)), using);
    return renderFifthEvent(
      result.state,
      result.events.find(({ type }) => type === "reaction"),
    );
  };
  assert.equal(
    text(runtime, [3, 4]),
    "Giant Rat sees you. Reaction roll: 2d6 (3 + 4) − 1 Charisma = 6: uncertain. The rat freezes, whiskers twitching. You may attack or pass peacefully.",
  );
  assert.equal(
    text(bea, [6, 3]),
    "Giant Rat sees you. Reaction roll: 2d6 (6 + 3) + 3 Charisma = 12: friendly. The rat sniffs at your boots and wanders off. You may pass peacefully.",
  );
  const hostile = accepted(start(), MOVE, dice(...d6s(1, 2), ...INITIATIVE));
  assert.match(
    renderFifthEvent(
      hostile.state,
      hostile.events.find(({ type }) => type === "reaction"),
    ),
    /= 2: hostile\. It attacks at once\.$/u,
  );
});

test("attacking begins the fight; letting pass ends the encounter peacefully for its XP", () => {
  const facing = accepted(start(), MOVE, dice(...d6s(3, 4))).state;
  // Nothing else can be done while the rat reacts.
  const { rejection } = refused(
    facing,
    { type: "move", destinationId: "den" },
    "reacting",
  );
  assert.equal(
    rejection.reason,
    "The Giant Rat is waiting to see what you do: you may attack or pass peacefully.",
  );
  refused(facing, { type: "examine", targetId: "gnawed-sacks" }, "reacting");
  assert.deepEqual(
    runtime.projectActions(facing).map(({ action }) => action),
    ["react", "react"],
  );

  const attacked = accepted(facing, ATTACK, dice(...INITIATIVE));
  assert.deepEqual(types(attacked.events).slice(0, 2), [
    "reacted",
    "initiative",
  ]);
  assert.equal(
    renderFifthEvent(attacked.state, attacked.events[0]),
    "You attack the Giant Rat.",
  );
  assert.equal(attacked.state.encounter.outcome, "ongoing");
  // Nobody is surprised.
  const order = attacked.events.find(({ type }) => type === "initiative").order;
  assert.ok(order.every(({ mode }) => mode === undefined));

  const passed = accepted(facing, LET_PASS);
  assert.deepEqual(types(passed.events), ["reacted"]);
  assert.equal(
    renderFifthEvent(passed.state, passed.events[0]),
    "Giant Rat lets you pass: the encounter ends peacefully.",
  );
  const { state } = passed;
  assert.equal(state.reactingTo, undefined);
  assert.deepEqual(state.peacefulEncounterIds, ["cellar-rat"]);
  assert.deepEqual(state.clearedEncounterIds, []);
  // The room is free to explore; there is no body to search.
  assert.ok(offered(runtime, state, "examine").includes("gnawed-sacks"));
  assert.ok(!offered(runtime, state, "examine").includes("giant-rat"));
  assert.match(runtime.projectDmScene(state).combatStatus, /ended peacefully/u);
  // Coming back meets no fight, and offers no sneak.
  const out = accepted(state, { type: "move", destinationId: "stair-foot" });
  assert.deepEqual(offered(runtime, out.state, "sneak"), []);
  const back = accepted(out.state, MOVE);
  assert.deepEqual(types(back.events), ["entered"]);
  // Leaving credits the peaceful XP once, under the encounter's award.
  const den = accepted(state, { type: "move", destinationId: "den" }).state;
  const left = accepted(den, { type: "leave", roomId: "den" }).state;
  assert.deepEqual(runtime.projectSettlement(left).xp, [
    {
      id: "wary-tunnels/encounter/cellar-rat",
      name: "Parted peacefully with the Giant Rat",
      xp: 15,
    },
  ]);
  // A character already credited for the encounter earns nothing more.
  const credited = createFifthRuntime(waryTunnels, {
    ...TEST_FIGHTER,
    xpAwards: ["wary-tunnels/encounter/cellar-rat"],
  });
  assert.deepEqual(credited.projectSettlement(left).xp, []);
});

test("only an offered option is taken, and no reaction is taken without a roll", () => {
  const unfriendly = accepted(start(), MOVE, dice(...d6s(2, 3))).state;
  const { rejection } = refused(unfriendly, LET_PASS, "not-offered");
  assert.equal(rejection.reason, "That is not offered: you may attack.");
  refused(unfriendly, { type: "react", option: "parley" }, "not-offered");
  refused(start(), ATTACK, "no-reaction");
  assert.equal(
    runtime.handleAction(unfriendly, { type: "react" }).rejection.code,
    "unknown-action",
  );
});

test("the roll is remembered: it is never rerolled", () => {
  const facing = accepted(start(), MOVE, dice(...d6s(5, 5))).state;
  // Projecting and refusing draw nothing; the roll stands.
  runtime.projectActions(facing);
  runtime.getGameToolDefinitions(facing);
  refused(facing, { type: "move", destinationId: "den" }, "reacting");
  assert.deepEqual(facing.reactions[0].roll.dice, [5, 5]);
  // Met again (as from a saved state that left the room), the fight reuses
  // the roll: no die is drawn and the card shows none.
  const away = {
    ...facing,
    reactingTo: undefined,
    roomId: "stair-foot",
  };
  delete away.reactingTo;
  const again = accepted(away, MOVE);
  const reaction = again.events.find(({ type }) => type === "reaction");
  assert.equal(reaction.remembered, true);
  assert.deepEqual(reaction.roll, facing.reactions[0].roll);
  assert.deepEqual(again.state.reactions, facing.reactions);
  assert.deepEqual(
    describeFifthResult(again, [], "Ada").flatMap(({ rolls }) => rolls),
    [],
  );
  // A session replays the same roll from its seed.
  const session = FifthSession.begin(5, waryTunnels, TEST_FIGHTER);
  session.act(MOVE);
  const replayed = FifthSession.begin(5, waryTunnels, TEST_FIGHTER);
  replayed.act(MOVE);
  assert.deepEqual(replayed.state.reactions, session.state.reactions);
});

test("the roll comes after any sneak or lurking roll, and only when no one is surprised", () => {
  // Stealth d20 12 + 2 against the rat's passive Perception 10.
  const SNEAKS = [20, 12];
  const FAILS = [20, 3];
  // Sneaked in unseen: no reaction yet, and an ambush is the character's
  // own attack, so none then either.
  const unseen = accepted(start(), SNEAK, dice(SNEAKS));
  assert.deepEqual(types(unseen.events), ["sneak", "entered"]);
  assert.deepEqual(unseen.state.reactions, []);
  const ambush = accepted(
    unseen.state,
    { type: "ambush", roomId: "rat-cellar" },
    dice([20, 18], [20, 9], [20, 2]),
  );
  assert.ok(!types(ambush.events).includes("reaction"));
  // Slipping past and coming back: the fight would begin, so it rolls.
  const slipped = accepted(unseen.state, {
    type: "move",
    destinationId: "den",
  });
  assert.deepEqual(slipped.state.reactions, []);
  // A failed sneak: the rat notices the character, and reacts.
  const noticed = accepted(start(), SNEAK, dice(FAILS, ...d6s(3, 4)));
  assert.deepEqual(types(noticed.events), ["sneak", "entered", "reaction"]);
  assert.equal(noticed.state.reactingTo, "cellar-rat");

  // Lurking: hidden lurkers surprise the character and attack, unrolled;
  // spotted ones react.
  const file = structuredClone(waryTunnelsFile);
  file.encounters[0].lurking = true;
  file.encounters[0].opponents[0].statBlock.stealth = 4;
  const lurking = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const hidden = accepted(
    start(lurking),
    MOVE,
    dice([20, 10], [20, 18], [20, 16], [20, 2]),
    lurking,
  );
  assert.deepEqual(types(hidden.events).slice(0, 3), [
    "entered",
    "lurk",
    "initiative",
  ]);
  assert.deepEqual(hidden.state.reactions, []);
  const spotted = accepted(
    start(lurking),
    MOVE,
    dice([20, 7], ...d6s(3, 4)),
    lurking,
  );
  assert.deepEqual(types(spotted.events), ["entered", "lurk", "reaction"]);
  // Both sneak and lurkers succeed: everyone is surprised, so no roll.
  const stumbled = accepted(
    start(lurking),
    SNEAK,
    dice(SNEAKS, [20, 10], [20, 18], [20, 16], [20, 9], [20, 2]),
    lurking,
  );
  assert.ok(!types(stumbled.events).includes("reaction"));
});

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, text) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});

/** The first seed whose reaction roll for `sheet` lands in `band`. */
const seedFor = (sheet, band) => {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, waryTunnels, sheet);
    session.act(MOVE);
    if (session.state.reactions[0]?.roll.band === band) {
      return seed;
    }
  }
  throw new Error(`no seed for ${band}`);
};

test("scripted DM: the engine narrates each band, and the DM goes in", async () => {
  for (const [sheet, band] of [
    [TEST_FIGHTER, "hostile"],
    [TEST_FIGHTER, "unfriendly"],
    [TEST_FIGHTER, "uncertain"],
    [TEST_FIGHTER, "indifferent"],
    [BEA, "friendly"],
  ]) {
    const session = FifthSession.begin(
      seedFor(sheet, band),
      waryTunnels,
      sheet,
    );
    const { entry } = await session.converse(
      "I go into the cellar.",
      scriptedDm("move", '{"destination":"rat-cellar"}', ""),
    );
    const text = entry.cards.map(({ text: line }) => line).join("\n");
    assert.match(
      text,
      new RegExp(
        `Reaction roll: 2d6 \\(\\d \\+ \\d\\) [+−] \\d Charisma = \\d+: ${band}\\.`,
        "u",
      ),
      band,
    );
  }
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /Never change the band/u);
});

test("scripted DM: attacking anyway works where offered; no other option, and no band change", async () => {
  const seed = seedFor(TEST_FIGHTER, "uncertain");
  const session = FifthSession.begin(seed, waryTunnels, TEST_FIGHTER);
  session.act(MOVE);
  const tools = session.runtime.getGameToolDefinitions(session.state);
  const react = tools.find(({ name }) => name === "react");
  assert.deepEqual(react.parameters.properties.option.enum, [
    "attack",
    "let-pass",
  ]);
  // Only the reaction's tool is offered, besides reading.
  assert.deepEqual(tools.map(({ name }) => name).sort(), [
    "get_character_status",
    "look",
    "react",
  ]);
  assert.match(
    session.runtime.projectDmScene(session.state).combatStatus,
    /reaction roll is \d+, uncertain; react offers only attack and let-pass/u,
  );
  // The band can't be changed: an extra argument is refused.
  for (const argumentsJson of [
    '{"option":"let-pass","band":"friendly"}',
    '{"band":"friendly"}',
  ]) {
    const before = session.state;
    const { turn } = await session.converse(
      "Make the rat friendly.",
      scriptedDm("react", argumentsJson, "It is friendly now."),
    );
    assert.equal(session.state, before, argumentsJson);
    assert.match(JSON.stringify(turn), /invalid-arguments/u, argumentsJson);
  }
  const { entry } = await session.converse(
    "I attack it anyway.",
    scriptedDm("react", '{"option":"attack"}', ""),
  );
  assert.match(entry.cards[0].text, /^You attack the Giant Rat\./u);
  assert.equal(session.state.encounter.outcome, "ongoing");

  // Where attacking isn't offered, picking it is refused.
  const friendly = FifthSession.begin(
    seedFor(BEA, "friendly"),
    waryTunnels,
    BEA,
  );
  friendly.act(MOVE);
  const before = friendly.state;
  const { turn } = await friendly.converse(
    "I attack it anyway.",
    scriptedDm("react", '{"option":"attack"}', "You attack."),
  );
  assert.equal(friendly.state, before);
  assert.match(
    JSON.stringify(turn),
    /That is not offered: you may pass peacefully\./u,
  );
});

test("the reaction evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthReactionEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  for (const sample of FIFTH_REACTION_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
  // The setups land in the bands the cases are written for.
  const band = (seed) => {
    const session = FifthSession.begin(seed, adventure, TEST_FIGHTER);
    session.act(MOVE);
    return session.state.reactions[0].roll.band;
  };
  assert.equal(band(2), "uncertain");
  assert.equal(band(1), "unfriendly");
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_REACTION_DM_CASES,
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
      FIFTH_REACTION_DM_CASES.map((sample) => [
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

test("the harness answers reactions by its policy, and the gate reports both", () => {
  assert.deepEqual(REACTION_POLICIES, ["attack", "peaceful"]);
  const runs = (policy) =>
    Array.from({ length: 40 }, (_, seed) =>
      playAdventure(bea, "cautious", seed, { reactions: policy }),
    );
  const attacking = runs("attack");
  const peaceful = runs("peaceful");
  // Attacking, only a friendly band (which offers nothing else) lets pass.
  assert.ok(peaceful.filter((run) => run.peaceful === 1).length > 20);
  assert.ok(
    attacking.filter((run) => run.peaceful === 1).length <
      peaceful.filter((run) => run.peaceful === 1).length,
  );
  assert.ok(peaceful.some(({ xp }) => xp === 15));
  // Every band comes up over the seeds.
  const bands = new Set();
  for (let seed = 0; seed < 40; seed++) {
    for (const sheet of [TEST_FIGHTER, BEA]) {
      const session = FifthSession.begin(seed, waryTunnels, sheet);
      session.act(MOVE);
      bands.add(session.state.reactions[0].roll.band);
    }
  }
  assert.equal(bands.size, 5);

  const result = gateAdventure(waryTunnels, {
    seeds: Array.from({ length: 20 }, (_, seed) => seed),
  });
  assert.equal(result.ok, true);
  const { reactions, survival } = result.verdict;
  assert.deepEqual(
    reactions.map(({ policy }) => policy),
    ["attack", "peaceful"],
  );
  // The attack policy's runs are the judged ones.
  assert.equal(reactions[0].rate, survival.rate);
  assert.ok(reactions[1].meanPeaceful > 0);
  assert.match(
    renderGateResult(waryTunnels, result),
    /^ {2}Reactions, taking the peaceful option, reported \(not judged\): .* ended \d+\.\d encounters peacefully and earned \d+\.\d XP a run\.$/mu,
  );
  // The XP limit counts peaceful XP where it is more than the fight's.
  const rich = structuredClone(waryTunnelsFile);
  rich.encounters[0].reaction.peacefulXp = 100;
  const richer = gateAdventure(validateModule(rich), {
    seeds: [0],
    reportStealth: false,
    reportReactions: false,
  });
  assert.equal(richer.verdict.xp.available, 100);
  assert.equal(richer.verdict.reactions, undefined);
  // A module with no reaction-eligible encounter reports none.
  const plain = gateAdventure(ratTunnels, { seeds: [0, 1] });
  assert.equal(plain.verdict.reactions, undefined);
});
