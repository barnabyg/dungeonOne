// #396: fleeing a fight. On its turn, with its action, the character may
// flee through any exit it could otherwise use. Each opponent able to act
// first makes one attack (D1); a Rogue's Cunning Action gains Disengage,
// which spares them. The fight stays unresolved in its room: the fallen stay
// fallen, the standing keep their wounds and are met again on coming back,
// and no one follows (D2). The AI DM flees with a `flee` tool listing only
// the usable exits. Session 54, trace 48, prompt v36.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  gateAdventure,
  playAdventure,
  renderGateResult,
} from "../dist/balance-5e.js";
import {
  buildCharacter,
  defaultPlacement,
  settleCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import {
  FIFTH_FLAG_DM_CASES,
  loadFifthFlagEvaluationAdventure,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { act, currentCombatant, startEncounter } from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { testRogueAt } from "../dist/test-rogue-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import { fightRoom, fleeingCellar } from "./fixtures/modules.mjs";

const FLEE = (destinationId) => ({ type: "flee", destinationId });
const MOVE = (destinationId) => ({ type: "move", destinationId });

function accepted(runtime, state, action, ...rolls) {
  const random = uncheckedDice(...rolls);
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/**
 * The cellar's fight with `sheet` acting first: initiative 20 for the
 * character, then 1 for the Giant Rat (+3) and the Zombie (−2).
 */
function cellarFight(runtime, start = runtime.createSession()) {
  const { state } = accepted(runtime, start, MOVE("rat-cellar"), 20, 1, 1);
  assert.equal(currentCombatant(state.encounter).id, "pc");
  return state;
}

const offered = (runtime, state, kind) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === kind && available);

/** `state` with the cellar's opponent `id` at `hp`. */
const wounded = (state, id, hp) => ({
  ...state,
  encounter: {
    ...state.encounter,
    combatants: state.encounter.combatants.map((entrant) =>
      entrant.id === id ? { ...entrant, hp } : entrant,
    ),
  },
});

test("the formats and the prompt version bump", () => {
  assert.equal(FIFTH_SESSION_FORMAT, 66);
  assert.equal(FIFTH_TRACE_FORMAT, 60);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v47");
});

test("each opponent able to act attacks before the character gets away; the fight stays behind", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  assert.equal(state.moves, 1);
  // Flight is offered by each usable exit, with the attacks it draws.
  const flights = offered(runtime, state, "flee");
  assert.deepEqual(
    flights.map(({ target }) => target.id),
    ["stair-foot", "den", "sump"],
  );
  assert.deepEqual(
    flights[0].attackers.map(({ id }) => id),
    ["giant-rat", "zombie"],
  );
  // The rat (2) and the Zombie (2) both miss.
  const fled = accepted(runtime, state, FLEE("stair-foot"), 2, 2);
  const attacks = fled.events.filter(({ type }) => type === "attack");
  assert.deepEqual(
    attacks.map(({ actorId, targetId }) => [actorId, targetId]),
    [
      ["giant-rat", "pc"],
      ["zombie", "pc"],
    ],
  );
  assert.equal(fled.state.encounter, undefined);
  assert.equal(fled.state.roomId, "stair-foot");
  assert.equal(fled.state.moves, 2);
  assert.ok(!fled.state.clearedEncounterIds.includes("cellar-rat"));
  const text = renderFifthResult(fled);
  assert.match(
    text,
    /You turn to flee: Giant Rat and Zombie each get an attack on you as you go\./u,
  );
  assert.match(
    text,
    /Giant Rat attacks Ada with Bite: 2 \+ 5 = 7 against AC 14\. Miss\./u,
  );
  assert.match(
    text,
    /You get away from the Rat-Gnawed Cellar into the Foot of the Stair, leaving Giant Rat and Zombie behind\. The fight is unresolved: they wait there if you come back, wounds and all, and the fallen stay fallen\./u,
  );
  // The stair foot is an exit room: leaving is offered, and is an escape.
  assert.equal(offered(runtime, fled.state, "leave").length, 1);
  const left = accepted(runtime, fled.state, {
    type: "leave",
    roomId: "stair-foot",
  });
  assert.equal(left.state.status, "escaped");
});

test("the fled fight is met again: the fallen stay fallen and the standing keep their wounds", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  // The rat is down to 3 HP, the Zombie has fallen.
  const state = wounded(
    wounded(cellarFight(runtime), "giant-rat", 3),
    "zombie",
    0,
  );
  // Only the rat attacks (2: a miss).
  const fled = accepted(runtime, state, FLEE("stair-foot"), 2);
  assert.deepEqual(
    fled.events.find(({ type }) => type === "flee").attackerIds,
    ["giant-rat"],
  );
  assert.deepEqual(fled.state.fallenOpponents, [
    { encounterId: "cellar-rat", opponentId: "zombie" },
  ]);
  assert.deepEqual(fled.state.woundedOpponents, [
    { encounterId: "cellar-rat", opponentId: "giant-rat", hp: 3 },
  ]);
  // Coming back: initiative 20 for Ada, 1 for the rat alone.
  const back = accepted(runtime, fled.state, MOVE("rat-cellar"), 20, 1);
  assert.deepEqual(
    back.state.encounter.combatants.map(({ id, hp }) => [id, hp]),
    [
      ["pc", fled.state.character.hp],
      ["giant-rat", 3],
    ],
  );
  assert.deepEqual(
    back.events.find(({ type }) => type === "entered").opponentIds,
    ["giant-rat"],
  );
});

test("an incapacitated (turned) foe makes no attack on the fleeing character", () => {
  const dice6 = [
    [6, 5, 4, 1],
    [5, 5, 4, 2],
    [3, 6, 4, 2],
    [4, 4, 4, 4],
    [1, 3, 3, 4],
    [2, 2, 4, 2],
  ];
  const earn = (sheet, xp, id) =>
    settleCharacter(sheet, {
      possessions: {
        equipment: sheet.equipment,
        stowed: sheet.stowed,
        ammunition: sheet.ammunition,
        treasure: [],
        purse: 0,
        magicItems: [],
      },
      xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
      finds: [],
      sold: [],
      coin: [],
      gear: [],
    });
  const mira = withOwedChoices(
    earn(
      withOwedChoices(
        earn(
          buildCharacter(
            "d".repeat(32),
            "Mira",
            dice6,
            { ...CLERIC.defaults, placement: defaultPlacement(dice6, CLERIC) },
            "cleric",
          ),
          300,
          "cellar",
        ),
      ),
      600,
      "barrow",
    ),
  );
  const runtime = createFifthRuntime(fleeingCellar, mira);
  let state = cellarFight(runtime);
  // The Zombie fails its Wisdom save (1) and is turned.
  state = accepted(
    runtime,
    state,
    { type: "turn-undead", actorId: "pc" },
    1,
  ).state;
  // The rat misses (2); the Zombie fails the save it repeats (1).
  state = accepted(
    runtime,
    state,
    { type: "end-turn", actorId: "pc" },
    2,
    1,
  ).state;
  assert.equal(currentCombatant(state.encounter).id, "pc");
  assert.deepEqual(
    offered(runtime, state, "flee")[0].attackers.map(({ id }) => id),
    ["giant-rat"],
  );
  // Only the rat attacks (2).
  const fled = accepted(runtime, state, FLEE("stair-foot"), 2);
  assert.deepEqual(
    fled.events.find(({ type }) => type === "flee").attackerIds,
    ["giant-rat"],
  );
  assert.equal(fled.state.roomId, "stair-foot");
});

test("a Rogue's Disengage spares it every attack as it flees", () => {
  const runtime = createFifthRuntime(fleeingCellar, testRogueAt(2));
  const state = cellarFight(runtime);
  assert.equal(offered(runtime, state, "disengage").length, 1);
  const disengaged = accepted(runtime, state, {
    type: "disengage",
    actorId: "pc",
  });
  assert.match(
    renderFifthResult(disengaged),
    /You disengage: fleeing this turn draws no attacks\./u,
  );
  // The bonus action is spent, and the flight now draws no attacks.
  assert.equal(offered(runtime, disengaged.state, "disengage").length, 0);
  assert.deepEqual(offered(runtime, disengaged.state, "flee")[0].attackers, []);
  const fled = accepted(runtime, disengaged.state, FLEE("stair-foot"));
  assert.equal(fled.events.filter(({ type }) => type === "attack").length, 0);
  assert.equal(
    fled.events.find(({ type }) => type === "flee").disengaged,
    true,
  );
  assert.equal(fled.state.roomId, "stair-foot");
  assert.match(
    renderFifthResult(fled),
    /You flee, disengaged: no foe gets an attack on you as you go\./u,
  );
  // A level-1 Rogue has no Cunning Action yet, and a Fighter none at all.
  for (const sheet of [testRogueAt(1), TEST_FIGHTER]) {
    const other = createFifthRuntime(fleeingCellar, sheet);
    const fight = cellarFight(other);
    assert.equal(offered(other, fight, "disengage").length, 0);
    assert.equal(
      other.handleAction(fight, { type: "disengage", actorId: "pc" }).rejection
        .code,
      "no-disengage",
    );
  }
});

test("Disengage is refused where no way out is open to flee by", () => {
  // The yard has no exits at all, so there is nowhere to flee.
  const yard = fightRoom("yard", "The Yard", [
    { id: "goblin", monster: "goblin-warrior", description: "A goblin." },
  ]);
  const runtime = createFifthRuntime(yard, testRogueAt(2));
  // Initiative: the Rogue 20, the goblin 1.
  const { state } = accepted(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    20,
    1,
  );
  assert.equal(currentCombatant(state.encounter).id, "pc");
  assert.deepEqual(offered(runtime, state, "flee"), []);
  assert.deepEqual(offered(runtime, state, "disengage"), []);
  const shown = runtime
    .projectActions(state)
    .find(({ action }) => action === "disengage");
  assert.equal(shown.reason, "No way out");
  const refusal = runtime.handleAction(state, {
    type: "disengage",
    actorId: "pc",
  }).rejection;
  assert.equal(refusal.code, "no-way-out");
  assert.equal(
    refusal.reason,
    "No way out of here is open, so you can't flee: disengaging would do nothing.",
  );
  // The AI DM is offered no disengage tool.
  assert.equal(
    runtime
      .getGameToolDefinitions(state)
      .some(({ name }) => name === "disengage"),
    false,
  );
});

test("the AI DM's no-way-open case is a fight whose every way out is shut", async () => {
  const adventure = await loadFifthFlagEvaluationAdventure();
  const sample = FIFTH_FLAG_DM_CASES.find(
    ({ id }) => id === "flee-no-way-open",
  );
  assert.deepEqual(sample.expectation, { kind: "no-action" });
  const { runtime, state } = setUpCase(sample, adventure);
  assert.equal(state.roomId, "rat-cage");
  assert.equal(state.encounter?.outcome, "ongoing");
  assert.equal(currentCombatant(state.encounter).id, "pc");
  // Its one way out exists, but the dropped gate has closed it.
  assert.deepEqual(
    runtime.projectRoom(state).exits.map(({ id }) => id),
    ["alcove"],
  );
  assert.equal(
    runtime.handleAction(state, FLEE("alcove")).rejection.code,
    "route-closed",
  );
  assert.equal(
    runtime.getGameToolDefinitions(state).some(({ name }) => name === "flee"),
    false,
  );
});

test("fleeing through a shut door, a closed way or a way not found is refused, and so is fleeing no fight", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const refused = (at, destinationId) =>
    runtime.handleAction(at, FLEE(destinationId)).rejection;
  assert.equal(refused(state, "store").code, "door-shut");
  assert.match(
    refused(state, "store").reason,
    /The Sagging Door is shut: you can't flee that way\./u,
  );
  // The crawl to the alcove is hidden until the beam's check opens it.
  assert.equal(refused(state, "alcove").code, "no-exit");
  // The beam's failure by 5 closed the way to the sump.
  const closed = {
    ...state,
    checks: [{ id: "examine:rotten-beam", band: "failure-by-5" }],
  };
  assert.equal(refused(closed, "sump").code, "route-closed");
  assert.deepEqual(
    offered(runtime, closed, "flee").map(({ target }) => target.id),
    ["stair-foot", "den"],
  );
  // Out of a fight there is nothing to flee.
  assert.equal(refused(runtime.createSession(), "rat-cellar").code, "no-fight");
});

test("a trap on the way springs as the character flees", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const hp = state.encounter.combatants[0].hp;
  // Both miss (2, 2); the Dexterity save fails (1) and the stone deals 4.
  const fled = accepted(runtime, state, FLEE("sump"), 2, 2, 1, 4);
  assert.equal(fled.state.roomId, "sump");
  assert.deepEqual(fled.state.sprungTrapIds, ["loose-stone"]);
  assert.equal(fled.state.character.hp, hp - 4);
  assert.equal(fled.state.moves, 2);
  assert.match(renderFifthResult(fled), /Loose Stone/u);
});

test("0 HP from a fleeing attack ends in the fight's defeat ending", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  const start = runtime.createSession();
  const state = cellarFight(runtime, {
    ...start,
    character: { ...start.character, hp: 1 },
  });
  // The rat hits (19) for 1d4 1 + 3: Ada falls before she gets away.
  const fled = accepted(runtime, state, FLEE("stair-foot"), 19, 1);
  assert.equal(fled.state.status, "defeat");
  assert.equal(fled.state.endingId, "fallen-in-the-cellar");
  assert.equal(fled.state.roomId, "rat-cellar");
  assert.equal(fled.state.moves, 1);
});

test("a hit on the fleeing character waits for its reaction, then the flight goes on", () => {
  const SAVES = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
  const blade = {
    name: "Shortsword",
    bonus: 7,
    damage: { dice: 1, sides: 6, modifier: 4, type: "piercing" },
    criticalRange: 20,
  };
  const rogue = {
    id: "pc",
    name: "Vex",
    side: "party",
    armorClass: 14,
    hp: 38,
    maxHp: 38,
    dexterity: 19,
    initiativeBonus: 4,
    saves: SAVES,
    attack: blade,
    uncannyDodge: true,
  };
  const foe = (id, name) => ({
    id,
    name,
    side: "opponents",
    armorClass: 11,
    hp: 20,
    maxHp: 20,
    dexterity: 8,
    initiativeBonus: -1,
    saves: SAVES,
    attack: {
      name: "Club",
      bonus: 6,
      damage: { dice: 1, sides: 8, modifier: 2, type: "bludgeoning" },
      criticalRange: 20,
    },
  });
  // Vex, then the lookout, then the brute.
  const fight = startEncounter(
    [rogue, foe("brute", "Brute"), foe("lookout", "Lookout")],
    dice([20, 15], [20, 2], [20, 3]),
  ).state;
  // The flight takes the action: once it is spent, there is none.
  const spent = { ...fight, economy: { ...fight.economy, actions: 0 } };
  assert.equal(
    act(spent, { type: "flee", actorId: "pc", to: "out" }, dice()).rejection
      .code,
    "action-used",
  );
  // The lookout hits (15 + 6): Uncanny Dodge may answer it.
  const hit = act(
    fight,
    { type: "flee", actorId: "pc", to: "out" },
    dice([20, 15]),
  );
  assert.equal(hit.state.pendingReaction.attackerId, "lookout");
  assert.deepEqual(hit.state.escape.attackers, ["brute"]);
  // Halved (6 + 2 = 8 → 4), then the brute misses (2): Vex has got away.
  const dodged = act(
    hit.state,
    { type: "uncanny-dodge", actorId: "pc" },
    dice([8, 6], [20, 2]),
  );
  assert.equal(dodged.rejection, undefined);
  assert.equal(dodged.state.pendingReaction, undefined);
  assert.deepEqual(dodged.state.escape, {
    combatantId: "pc",
    to: "out",
    attackers: [],
  });
  assert.equal(dodged.state.outcome, "ongoing");
  assert.equal(dodged.state.combatants[0].hp, 38 - 4);
});

test("the AI DM's flee tool lists only usable exits and the attacks; the prompt says how fleeing works", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "flee");
  assert.ok(tool);
  assert.match(
    tool.description,
    /the engine rolls one attack against it from each of Giant Rat and Zombie\./u,
  );
  assert.deepEqual(tool.parameters.properties.destination.enum, [
    "stair-foot",
    "den",
    "sump",
  ]);
  // A shut door can't be fled through, whatever the AI DM asks.
  const shut = runtime.dispatchGameTool(state, {
    id: "call-1",
    name: "flee",
    argumentsJson: JSON.stringify({ destination: "store" }),
  });
  assert.equal(shut.modelOutput.ok, false);
  assert.equal(shut.state, state);
  // Outside a fight there is no flee tool.
  assert.ok(
    !runtime
      .getGameToolDefinitions(runtime.createSession())
      .some(({ name }) => name === "flee"),
  );
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /I run for the door/u);
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /A player cannot flee unharmed by asking/u,
  );
  // Disengage is a tool only for a character with Cunning Action.
  const vex = createFifthRuntime(fleeingCellar, testRogueAt(2));
  assert.ok(
    vex
      .getGameToolDefinitions(cellarFight(vex))
      .some(({ name }) => name === "disengage"),
  );
  assert.ok(
    !runtime
      .getGameToolDefinitions(state)
      .some(({ name }) => name === "disengage"),
  );
});

test("a reload restores a flight, and a trace replays it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-396-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      3,
      fleeingCellar,
      TEST_FIGHTER,
    );
    const run = new FifthTraceRun(created);
    const click = (action) => {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
      return result;
    };
    // Entering plays the opponents' turns until Ada's; then she flees.
    click(MOVE("rat-cellar"));
    assert.equal(currentCombatant(run.session.state.encounter).id, "pc");
    click(FLEE("stair-foot"));
    assert.equal(run.session.state.status, "playing");
    assert.equal(run.session.state.roomId, "stair-foot");
    assert.equal(run.session.state.moves, 2);
    await run.session.persist();
    const loaded = await FifthSession.load(path, [fleeingCellar]);
    assert.deepEqual(loaded.state, run.session.state);

    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [fleeingCellar]);
    assert.deepEqual(replayed.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The balance harness.

test("the retreat style flees below its heal threshold and heads out; the judged styles never flee", () => {
  const runtime = createFifthRuntime(fleeingCellar, TEST_FIGHTER);
  const seeds = Array.from({ length: 40 }, (_, seed) => seed);
  for (const style of [
    "direct",
    "cautious",
    "avoid-optional",
    "stealth-first",
  ]) {
    assert.ok(
      seeds.every((seed) => playAdventure(runtime, style, seed).fled === 0),
      style,
    );
  }
  const fled = seeds.filter(
    (seed) => playAdventure(runtime, "retreat", seed).fled > 0,
  );
  assert.ok(fled.length > 0);
  // Seed 6: Ada wins the cellar, flees the den low on hit points and goes
  // out by the stair foot; playing cautious she falls in the den.
  const retreat = playAdventure(runtime, "retreat", 6);
  assert.deepEqual(
    retreat.encounters.map(({ id, outcome }) => [id, outcome]),
    [
      ["cellar-rat", "victory"],
      ["den-goblin", "fled"],
    ],
  );
  assert.equal(retreat.outcome, "escape-without-loot");
  const cautious = playAdventure(runtime, "cautious", 6);
  assert.equal(cautious.outcome, "defeat");
  assert.ok(cautious.retreatChances > 0);
  // A cautious run never low with no heal left is the retreat run too.
  for (const seed of seeds) {
    const run = playAdventure(runtime, "cautious", seed);
    if (run.retreatChances === 0) {
      assert.deepEqual(playAdventure(runtime, "retreat", seed), run, `${seed}`);
    }
  }
});

test("the gate reports the retreat style beside its checks, never judging it", () => {
  const result = gateAdventure(fleeingCellar, {
    seeds: Array.from({ length: 8 }, (_, seed) => seed),
  });
  assert.equal(result.ok, true);
  const { retreat } = result.verdict;
  assert.equal(retreat.style, "retreat");
  assert.equal(retreat.runs, 8);
  assert.match(
    renderGateResult(fleeingCellar, result),
    /^ {2}Retreat, reported \(not judged\): the level 1, 5th percentile Fighter playing retreat survived \d+\.\d% of 8 runs with its weakest kit, [a-z-]+ \(.*\); over every kit and level it completed \d+\.\d%, fled \d\.\d fights and earned \d+\.\d XP a run\.$/mu,
  );
  // Left out when not asked for, as passesGate leaves it out.
  const quiet = gateAdventure(fleeingCellar, {
    seeds: [0, 1],
    reportRetreat: false,
  });
  assert.equal(quiet.verdict.retreat, undefined);
});
