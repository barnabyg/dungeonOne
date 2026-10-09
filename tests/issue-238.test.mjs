// #238: a monster whose module authors a surrender yields instead of fleeing
// when it fails morale. On its next turn it surrenders: it is out of the
// fight, and once the fight is won it is a creature to talk to about its
// authored topics, which may hand over what it carries. It gives half its XP
// if it exchanged blows with the character first, like a fled monster, plus
// any XP the module awards for sparing it.
import assert from "node:assert/strict";
import test from "node:test";
import { gateAdventure, playAdventure } from "../dist/balance-5e.js";
import { act, legalTargets, moraleStatus } from "../dist/encounter-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";
import {
  GOBLINS,
  lairOf,
  mercyOf,
  ringOf,
  SPARED_XP,
  surrenderingGoblins,
  surrenderingGoblinsJson,
  surrenderSeed,
} from "./fixtures/surrendering-goblins.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  ada,
  attack,
  begin,
  goblin,
  KILL,
} from "./fixtures/morale-encounter.mjs";

// The encounter engine.

test("a monster that may surrender and fails morale surrenders on its turn, and the fight is won", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2", { surrenders: true })],
    ...KILL,
    [20, 2], // Goblin 2 fails: 2 − 1 = 1.
  );
  const first = attack(state, random, "g1");
  assert.equal(moraleStatus(first.state, "g2"), "surrendering");
  // Until its turn it can still be cut down.
  assert.deepEqual(
    legalTargets(first.state, "pc").map(({ id }) => id),
    ["g2"],
  );
  const end = dice();
  const ended = act(first.state, { type: "end-turn", actorId: "pc" }, end);
  assert.equal(ended.rejection, undefined);
  assert.equal(end.remaining(), 0);
  assert.ok(!ended.events.some(({ type }) => type === "attack"));
  assert.deepEqual(
    ended.events.filter(({ type }) =>
      ["surrendered", "fled", "ended"].includes(type),
    ),
    [
      { type: "surrendered", combatantId: "g2" },
      { type: "ended", outcome: "victory" },
    ],
  );
  assert.deepEqual(ended.state.surrendered, ["g2"]);
  assert.deepEqual(ended.state.fled, []);
  assert.equal(moraleStatus(ended.state, "g2"), "surrendered");
  assert.equal(ended.state.outcome, "victory");
});

// Fleeing (#237) and surrendering leave the fight the same way.
for (const surrenders of [false, true]) {
  const left = surrenders ? "surrendered" : "fled";
  test(`a ${left} monster can't be attacked, and its leaving can bring the rest to half strength`, () => {
    // Three goblins: Goblin 2 fails at the first fall and leaves on its turn,
    // leaving one of three, so Goblin 3 checks at half strength.
    const { state, random } = begin(
      [ada, goblin("g1"), goblin("g2", { surrenders }), goblin("g3")],
      ...KILL,
      [20, 2], // Goblin 2 fails.
      [20, 20], // Goblin 3 holds.
    );
    const first = attack(state, random, "g1");
    const end = dice(
      [20, 20], // Goblin 3 holds at half strength, after Goblin 2 leaves.
      [20, 1], // Goblin 3 attacks Ada and misses.
    );
    const ended = act(first.state, { type: "end-turn", actorId: "pc" }, end);
    assert.equal(end.remaining(), 0);
    assert.deepEqual(
      ended.events
        .filter(({ type }) => type === "morale")
        .map(({ combatantId, trigger }) => [combatantId, trigger]),
      [["g3", "half-strength"]],
    );
    assert.equal(ended.state.outcome, "ongoing");
    const refused = act(
      ended.state,
      { type: "attack", actorId: "pc", targetId: "g2" },
      dice(),
    );
    assert.equal(refused.rejection?.code, left);
    assert.equal(refused.rejection?.reason, `Goblin 2 has ${left}.`);
    assert.deepEqual(
      legalTargets(ended.state, "pc").map(({ id }) => id),
      ["g3"],
    );
  });
}

test("a monster that may surrender and holds its nerve fights on", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2", { surrenders: true })],
    ...KILL,
    [20, 20],
  );
  const first = attack(state, random, "g1");
  assert.equal(moraleStatus(first.state, "g2"), undefined);
  const ended = act(
    first.state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 1]),
  );
  assert.ok(ended.events.some(({ type }) => type === "attack"));
  assert.deepEqual(ended.state.surrendered, []);
});

// The module format: a surrender is authored on an opponent.

const withGoblin = (index, change) => {
  const module = structuredClone(surrenderingGoblinsJson);
  change(module.encounters[0].opponents[index], module);
  return () => validateModule(module);
};

test("a module authors a surrender with topics, gifts it carries and XP for sparing it", () => {
  const [first] = surrenderingGoblins.encounters[0].opponents;
  assert.deepEqual(first.surrender, {
    description: "Goblin 1 kneels in the dirt, its dagger thrown down.",
    topics: [
      {
        id: "goblin-1-mercy",
        name: "Mercy",
        reply: "Spare me! Take it, take the ring!",
        gives: ["goblin-1-ring"],
      },
      {
        id: "goblin-1-lair",
        name: "The barrow",
        reply: "Only us three. The rest ran off with the good silver.",
      },
    ],
    xp: SPARED_XP,
  });
});

test("the validator refuses a surrender on an undead or mindless monster", () => {
  assert.throws(
    withGoblin(
      0,
      (opponent) =>
        (opponent.statBlock = bestiary.monsters.find(
          ({ id }) => id === "skeleton",
        ).statBlock),
    ),
    /encounter 1 opponent 1 \(goblin-1\) never checks morale \(undead or mindless\), so it cannot surrender\./,
  );
});

test("the validator refuses a gift that doesn't exist or that the opponent doesn't carry", () => {
  assert.throws(
    withGoblin(0, (opponent) => {
      opponent.surrender.topics[0].gives = ["no-such-ring"];
    }),
    /topic goblin-1-mercy gives unknown item no-such-ring\./,
  );
  assert.throws(
    withGoblin(0, (opponent) => {
      opponent.surrender.topics[0].gives = ["goblin-2-ring"];
    }),
    /topic goblin-1-mercy gives goblin-2-ring, which goblin-1 does not carry\./,
  );
  assert.throws(
    withGoblin(0, (opponent) => {
      opponent.surrender.topics[1].gives = ["goblin-1-ring"];
    }),
    /goblin-1-ring is given by two topics\./,
  );
});

test("the validator refuses topics a surrender can't use or that clash", () => {
  // A gift is only for a surrender's topics.
  assert.throws(
    () =>
      validateModule({
        ...surrenderingGoblinsJson,
        rooms: surrenderingGoblinsJson.rooms.map((room) =>
          room.id === "barrow-mouth"
            ? {
                ...room,
                creatures: [
                  {
                    id: "hermit",
                    name: "Hermit",
                    description: "An old hermit.",
                    topics: [
                      { id: "alms", name: "Alms", reply: "No.", gives: [] },
                    ],
                  },
                ],
              }
            : room,
        ),
      }),
    /room 1 creature 1 topic 1 must have id, name, reply and may have check, failure, and nothing else\./,
  );
  assert.throws(
    withGoblin(1, (opponent) => {
      opponent.surrender.topics[0].id = "goblin-1-mercy";
    }),
    /duplicate id goblin-1-mercy\./,
  );
  assert.throws(
    withGoblin(0, (opponent) => {
      opponent.surrender.topics[1].name = "mercy";
    }),
    /encounter 1 opponent 1 surrender has two topics named mercy\./,
  );
  assert.throws(
    withGoblin(0, (opponent) => (opponent.surrender.xp = 0)),
    /encounter 1 opponent 1 surrender xp must be/,
  );
});

test("the validator refuses a surrender in a fight that ends the adventure", () => {
  assert.throws(
    withGoblin(0, (_opponent, module) => {
      module.encounters[0].victoryEndingId = "won-the-barrow";
      module.endings.push({
        id: "won-the-barrow",
        kind: "victory",
        title: "Won",
        text: "The barrow is yours.",
      });
    }),
    /encounter 1 opponent 1 \(goblin-1\) can surrender, but its fight ends the adventure, so it can never be talked to\./,
  );
});

// The runtime: a surrendered goblin leaves no body, is a creature to talk to
// once the fight is won, and offers its ring when asked for mercy.

/** Plays `actions` from `state`, checking each is accepted. */
function play(runtime, state, actions, random) {
  let next = state;
  const events = [];
  for (const action of actions) {
    const result = runtime.handleAction(next, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(action));
    events.push(...result.events);
    next = result.state;
  }
  return { state: next, events };
}

test("a surrender ends the fight: the captive has no body and is a creature to talk to", () => {
  const { runtime, state: won, events } = surrenderSeed();
  assert.equal(won.encounter.outcome, "victory");
  const captives = won.surrenderedOpponents.map(({ opponentId }) => opponentId);
  const fallen = GOBLINS.filter(
    (id) =>
      !captives.includes(id) &&
      !won.fledOpponents.some(({ opponentId }) => opponentId === id),
  );
  const captive = captives[0];
  const name = `Goblin ${captive.slice(-1)}`;
  assert.ok(
    events.some(
      (event) => event.type === "surrendered" && event.combatantId === captive,
    ),
  );
  // Only the fallen leave bodies; the captive is listed with its topics.
  const actions = runtime.projectActions(won);
  assert.deepEqual(
    actions
      .filter(({ action }) => action === "examine")
      .map(({ target }) => target.id),
    fallen,
  );
  assert.deepEqual(
    actions
      .filter(({ action }) => action === "talk")
      .map(({ target }) => target.id),
    captives.flatMap((id) => [mercyOf(id), lairOf(id)]),
  );
  const [creature] = runtime.projectRoom(won).creatures;
  assert.deepEqual(creature, {
    id: captive,
    name,
    description: `${name} kneels in the dirt, its dagger thrown down.`,
    topics: [
      { id: mercyOf(captive), name: "Mercy" },
      { id: lairOf(captive), name: "The barrow" },
    ],
  });
  const scene = runtime.projectDmScene(won);
  assert.equal(
    scene.room.opponents.find(({ id }) => id === captive).condition,
    "surrendered",
  );
  assert.deepEqual(
    scene.room.npcs.map(({ id }) => id),
    captives,
  );
});

test("the captive offers its ring when asked for mercy; it is found once, and the XP counts half plus sparing", () => {
  const { seed, runtime, random, state: won } = surrenderSeed();
  const [{ opponentId: captive, engaged }] = won.surrenderedOpponents;
  const name = `Goblin ${captive.slice(-1)}`;
  const ring = `Stolen Ring ${captive.slice(-1)}`;
  // Before it is asked, its ring is not there to take.
  assert.ok(
    runtime.handleAction(won, { type: "take", itemId: ringOf(captive) }, random)
      .rejection,
  );
  const lair = runtime.handleAction(
    won,
    { type: "talk", topicId: lairOf(captive) },
    random,
  );
  assert.deepEqual(lair.events[0].given, []);
  const asked = runtime.handleAction(
    won,
    { type: "talk", topicId: mercyOf(captive) },
    random,
  );
  assert.equal(asked.rejection, undefined);
  assert.deepEqual(asked.events, [
    {
      type: "talked",
      topicId: mercyOf(captive),
      creature: name,
      words: "Spare me! Take it, take the ring!",
      given: [ring],
    },
  ]);
  assert.equal(
    runtime.renderResult(asked),
    `${name}: Spare me! Take it, take the ring! ${name} offers you the ${ring}.`,
  );
  const { state: escaped } = play(
    runtime,
    asked.state,
    [
      { type: "take", itemId: ringOf(captive) },
      { type: "move", destinationId: "barrow-mouth" },
      { type: "leave", roomId: "barrow-mouth" },
    ],
    random,
  );
  assert.equal(escaped.status, "escaped");
  const settlement = runtime.projectSettlement(escaped);
  assert.ok(
    settlement.finds.some(
      ({ id }) => id === `surrendering-goblins/${ringOf(captive)}`,
    ),
  );
  // It attacked Ada before it yielded: half a Goblin Minion's 25 XP, and the
  // module's XP for sparing it, in the fight's award.
  assert.equal(engaged, true);
  assert.deepEqual(escaped.surrenderedOpponents.length, 1);
  const fallen = GOBLINS.filter((id) => id !== captive).map(
    (id) => `Goblin ${id.slice(-1)}`,
  );
  const award = (state, at = runtime) =>
    at
      .projectSettlement(state)
      .xp.find(
        ({ id }) => id === "surrendering-goblins/encounter/barrow-goblin",
      );
  assert.deepEqual(award(escaped), {
    id: "surrendering-goblins/encounter/barrow-goblin",
    name: `Defeated ${fallen.join(" and ")}; spared ${name}`,
    xp: 25 * fallen.length + 12 + SPARED_XP,
  });

  // Had it yielded without a blow exchanged, only the sparing XP; with none
  // authored either, it would give nothing and go unnamed.
  const untouched = {
    ...escaped,
    surrenderedOpponents: [
      { ...escaped.surrenderedOpponents[0], engaged: false },
    ],
  };
  assert.equal(award(untouched).xp, 25 * fallen.length + SPARED_XP);
  const stingyJson = structuredClone(surrenderingGoblinsJson);
  for (const opponent of stingyJson.encounters[0].opponents) {
    delete opponent.surrender.xp;
  }
  const stingy = createFifthRuntime(
    validateModule(stingyJson),
    firstFighter(seed),
  );
  assert.deepEqual(award(untouched, stingy), {
    id: "surrendering-goblins/encounter/barrow-goblin",
    name: `Defeated ${fallen.join(" and ")}`,
    xp: 25 * fallen.length,
  });

  // A character that found the ring before is offered nothing.
  const again = createFifthRuntime(surrenderingGoblins, {
    ...firstFighter(seed),
    finds: [`surrendering-goblins/${ringOf(captive)}`],
  });
  const askedAgain = again.handleAction(
    won,
    { type: "talk", topicId: mercyOf(captive) },
    random,
  );
  assert.deepEqual(askedAgain.events[0].given, []);
  assert.ok(
    again.handleAction(
      askedAgain.state,
      { type: "take", itemId: ringOf(captive) },
      random,
    ).rejection,
  );
});

test("the AI DM talks to the captive only through its authored topics", () => {
  const { runtime, state: won } = surrenderSeed();
  const captives = won.surrenderedOpponents.map(({ opponentId }) => opponentId);
  const talk = runtime
    .getGameToolDefinitions(won)
    .find(({ name }) => name === "talk");
  assert.deepEqual(
    talk.parameters.properties.topic.enum,
    captives.flatMap((id) => [mercyOf(id), lairOf(id)]),
  );
  for (const topic of ["treasure", ringOf(captives[0]), captives[0]]) {
    const refused = runtime.dispatchGameTool(won, {
      name: "talk",
      argumentsJson: JSON.stringify({ topic }),
    });
    assert.equal(refused.state, won);
    assert.equal(refused.modelOutput.ok, false);
  }
  const asked = runtime.dispatchGameTool(won, {
    name: "talk",
    argumentsJson: JSON.stringify({ topic: mercyOf(captives[0]) }),
  });
  assert.equal(asked.modelOutput.ok, true);
  assert.deepEqual(
    runtime
      .getGameToolDefinitions(asked.state)
      .find(({ name }) => name === "take").parameters.properties.item.enum,
    [ringOf(captives[0])],
  );
});

test("the morale card and the scene say a goblin will surrender, then has", () => {
  const { runtime, state: won, events } = surrenderSeed();
  const [{ opponentId: captive }] = won.surrenderedOpponents;
  const name = `Goblin ${captive.slice(-1)}`;
  const text = runtime.renderResult({ state: won, events });
  assert.match(
    text,
    new RegExp(
      `${name} checks morale [^.]+: a Wisdom saving throw, \\d+ − 1 = -?\\d+ against DC 8\\. Failure: it will surrender on its turn\\.`,
      "u",
    ),
  );
  assert.match(
    text,
    new RegExp(`${name} throws down its arms and surrenders\\.`),
  );
  // While the fight goes on, the scene and the table show it yielding.
  const fighting = {
    ...won,
    encounter: {
      ...won.encounter,
      outcome: "ongoing",
      surrendered: [],
      fleeing: [captive],
    },
    clearedEncounterIds: [],
    surrenderedOpponents: [],
  };
  assert.match(
    runtime.projectDmScene(fighting).combatStatus,
    new RegExp(`${name} is surrendering: it yields on its turn\\.`),
  );
  const morale = (at) =>
    runtime
      .projectFight(at)
      .encounter.combatants.find(({ id }) => id === captive).morale;
  assert.equal(morale(fighting), "surrendering");
  assert.equal(morale(won), "surrendered");
  // The captive can't be talked to until the fight is over.
  assert.equal(
    runtime.handleAction(
      fighting,
      { type: "talk", topicId: mercyOf(captive) },
      dice(),
    ).rejection?.code,
    "fighting",
  );
});

// The balance harness handles surrender like fleeing: each fight counts who
// surrendered, and the XP check counts sparing XP when it gives more.

test("the harness counts surrendered goblins, and the XP check counts sparing", () => {
  const runtime = createFifthRuntime(surrenderingGoblins, firstFighter(0));
  let surrendered = 0;
  for (let seed = 0; seed < 60; seed++) {
    const run = playAdventure(runtime, "direct", seed);
    if (run.outcome === "defeat") {
      continue;
    }
    const [fight] = run.encounters;
    surrendered += fight.surrendered;
    assert.equal(fight.fled, 0);
    const ending = run.outcome === "escape-with-loot" ? 250 : 0;
    const defeated = ending + 25 * (GOBLINS.length - fight.surrendered);
    // Half of 25 if it fought, and 10 for sparing it.
    assert.ok(
      run.xp >= defeated + SPARED_XP * fight.surrendered &&
        run.xp <= defeated + (12 + SPARED_XP) * fight.surrendered,
    );
  }
  assert.ok(surrendered > 0, "some goblins surrendered");
  const xp = (module) =>
    gateAdventure(module, { seeds: [0], sampleSize: 20 }).verdict.xp.available;
  // 12 + 10 is less than 25: sparing a goblin never gives more than killing it.
  assert.equal(xp(surrenderingGoblins), 3 * 25 + 250);
  const generous = structuredClone(surrenderingGoblinsJson);
  for (const opponent of generous.encounters[0].opponents) {
    opponent.surrender.xp = 100;
  }
  assert.equal(xp(validateModule(generous)), 3 * (12 + 100) + 250);
});
