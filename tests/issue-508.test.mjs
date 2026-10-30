// #508: the survival settings. Short rests per adventure (0–4 or
// unlimited), long rests at rest sites, Last Stand (off, DC 11, DC 10 or
// automatic), opponent hit points (75–150%), wandering encounters (off,
// normal or double), fleeing drawing attacks, and morale (never, normal or
// easily). Each plays through `runtime.settings`, the adventure's frozen
// copy, and the AI DM prompt states the adventure's own rules: at the
// defaults it is word for word as before. Prompt v47.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { characterProfile } from "../dist/character-5e.js";
import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  fifthDmSystemPrompt,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { DEFAULT_SETTINGS, SETTINGS } from "../dist/settings-5e.js";
import { testFighterAt, TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { testRogueAt } from "../dist/test-rogue-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  fleeingCellar,
  goblinTrio,
  longTunnels,
  potionCellar,
  restingTunnels,
  restingTunnelsFile,
  wanderingTunnelsFile,
  alarmTunnelsFile,
} from "./fixtures/modules.mjs";

const ADA_2 = testFighterAt(2);
const MAX = characterProfile(ADA_2).maxHp;
const quiet = validateModule(restingTunnelsFile());

/** The runtime for `adventure` and `sheet` under these settings. */
const under = (adventure, sheet, settings = {}) =>
  createFifthRuntime(
    adventure,
    sheet,
    {},
    { ...DEFAULT_SETTINGS, ...settings },
  );

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(using, state, action, code) {
  const result = using.handleAction(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  return result.rejection;
}

const begun = (using) =>
  accepted(using, using.createSession(), { type: "begin" }).state;

/**
 * `state` with the character at `hp`, its uses spent and its hit dice
 * back, in `roomId`.
 */
const worn = (state, hp, roomId) => ({
  ...state,
  ...(roomId === undefined ? {} : { roomId }),
  character: {
    ...state.character,
    hp,
    featureUses: { "second-wind": 0, "action-surge": 0 },
    hitDice: 2,
  },
});

const REST = { type: "rest", hitDice: 1 };
const LONG = { type: "long-rest" };
const view = (using, state, kind) =>
  using.projectActions(state).find(({ action }) => action === kind);
const types = (events) => events.map(({ type }) => type);

test("the survival settings follow carrying capacity, in the issue's order, at today's game by default", () => {
  const survival = [
    "shortRests",
    "longRest",
    "lastStand",
    "opponentHp",
    "wandering",
    "fleeAttacks",
    "morale",
  ];
  const ids = Object.keys(SETTINGS);
  assert.deepEqual(
    ids.filter((id) => survival.includes(id)),
    survival,
  );
  assert.ok(ids.indexOf("carryingCapacity") < ids.indexOf("shortRests"));
  const values = (id) => SETTINGS[id].choices.map(({ value }) => value);
  assert.deepEqual(values("shortRests"), [0, 1, 2, 3, 4, "unlimited"]);
  assert.deepEqual(values("longRest"), ["on", "off"]);
  assert.deepEqual(values("lastStand"), ["off", 11, 10, "automatic"]);
  assert.deepEqual(values("opponentHp"), [75, 100, 125, 150]);
  assert.deepEqual(values("wandering"), ["off", "normal", "double"]);
  assert.deepEqual(values("fleeAttacks"), ["on", "off"]);
  assert.deepEqual(values("morale"), ["never", "normal", "easily"]);
  assert.deepEqual(
    Object.fromEntries(survival.map((id) => [id, DEFAULT_SETTINGS[id]])),
    {
      shortRests: 2,
      longRest: "on",
      lastStand: 11,
      opponentHp: 100,
      wandering: "normal",
      fleeAttacks: "on",
      morale: "normal",
    },
  );
});

// The AI DM prompt.

test("the prompt states the adventure's own rules, and at the defaults is as before", () => {
  assert.equal(fifthDmSystemPrompt(DEFAULT_SETTINGS), FIFTH_DM_SYSTEM_PROMPT);
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /may take a short rest, at most two short rests in an adventure: rest is offered only then\./u,
  );
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /both short rests taken, or nothing/u);
  assert.equal(
    under(restingTunnels, ADA_2).systemPrompt,
    FIFTH_DM_SYSTEM_PROMPT,
  );
  const prompt = (settings) =>
    under(restingTunnels, ADA_2, settings).systemPrompt;
  assert.match(
    prompt({ shortRests: 1 }),
    /at most one short rest in an adventure: rest is offered only then\. .*\(a fight, foes here, the short rest already taken, or nothing to recover\)/u,
  );
  assert.match(
    prompt({ shortRests: 4 }),
    /at most four short rests in an adventure: .*all four short rests taken, or nothing/u,
  );
  assert.match(
    prompt({ shortRests: "unlimited" }),
    /as many short rests as it likes in an adventure: .*\(a fight, foes here, or nothing to recover\)/u,
  );
  const none = prompt({ shortRests: 0 });
  assert.match(
    none,
    /This adventure allows no short rest: rest is never offered\./u,
  );
  assert.doesNotMatch(none, /at most \w+ short rest/u);
  const noLong = prompt({ longRest: "off" });
  assert.match(
    noLong,
    /This adventure allows no long rest: long_rest is never offered\..* A wandering encounter may interrupt any rest/u,
  );
  assert.doesNotMatch(noLong, /may take one long rest/u);
  assert.match(
    prompt({ lastStand: "off" }),
    /it falls: this adventure has no Last Stand/u,
  );
  // DC 10 is worded as DC 11: the prompt names no DC.
  assert.equal(prompt({ lastStand: 10 }), FIFTH_DM_SYSTEM_PROMPT);
  const automatic = prompt({ lastStand: "automatic" });
  assert.match(automatic, /with no death saving throw in this adventure/u);
  assert.doesNotMatch(automatic, /rolls a death saving throw/u);
  const free = prompt({ fleeAttacks: "off" });
  assert.match(free, /In this adventure fleeing draws no attacks/u);
  assert.doesNotMatch(free, /Nothing spares those attacks/u);
  const still = prompt({ wandering: "off" });
  assert.match(still, /This adventure has no wandering encounters/u);
  assert.doesNotMatch(still, /may interrupt any rest/u);
  assert.equal(prompt({ wandering: "double" }), FIFTH_DM_SYSTEM_PROMPT);
  // Opponent hit points and morale change nothing the prompt says.
  assert.equal(
    prompt({ opponentHp: 150, morale: "never" }),
    FIFTH_DM_SYSTEM_PROMPT,
  );
});

// Short rests.

test("short rests: one allows one, and the refusal says so", () => {
  const using = under(quiet, ADA_2, { shortRests: 1 });
  const rested = accepted(using, worn(begun(using), 3), REST, dice([10, 1]));
  assert.match(
    renderFifthResult(rested),
    /Short rests: 0 of 1 left in this adventure\.$/mu,
  );
  const again = worn(rested.state, 3);
  assert.equal(
    refused(using, again, REST, "no-rests-left").reason,
    "You have taken the one short rest an adventure allows.",
  );
  assert.equal(view(using, again, "rest").reason, "No short rests left");
});

test("short rests: none are allowed at 0, and three or four at 3 or 4", () => {
  const none = under(quiet, ADA_2, { shortRests: 0 });
  const tired = worn(begun(none), 3);
  assert.equal(
    refused(none, tired, REST, "no-rests-left").reason,
    "This adventure's settings allow no short rests.",
  );
  assert.equal(view(none, tired, "rest").available, false);
  assert.deepEqual(none.projectRests(tired, "short"), { left: 0, max: 0 });
  assert.ok(
    none
      .projectCharacterStatus(tired)
      .resources.includes("Short rests: 0 of 0 left"),
  );
  // No rest tool for the AI DM.
  assert.ok(
    !none.getGameToolDefinitions(tired).some(({ name }) => name === "rest"),
  );
  for (const allowed of [3, 4]) {
    const using = under(quiet, ADA_2, { shortRests: allowed });
    let state = begun(using);
    for (let taken = 0; taken < allowed; taken += 1) {
      state = accepted(using, worn(state, 3), REST, dice([10, 1])).state;
    }
    assert.equal(
      refused(using, worn(state, 3), REST, "no-rests-left").reason,
      `You have taken the ${allowed === 3 ? "three" : "four"} short rests an adventure allows.`,
    );
  }
});

test("short rests: unlimited never runs out, and says so", () => {
  const using = under(quiet, ADA_2, { shortRests: "unlimited" });
  let result;
  let state = begun(using);
  for (let taken = 0; taken < 6; taken += 1) {
    result = accepted(using, worn(state, 3), REST, dice([10, 1]));
    state = result.state;
  }
  assert.equal(state.shortRests, 6);
  assert.deepEqual(using.projectRests(state, "short"), { unlimited: true });
  assert.match(renderFifthResult(result), /Short rests: unlimited\.$/mu);
  assert.ok(
    using
      .projectCharacterStatus(state)
      .resources.includes("Short rests: unlimited"),
  );
  const tool = using
    .getGameToolDefinitions(worn(state, 3))
    .find(({ name }) => name === "rest");
  assert.match(tool.description, /short rests are unlimited/u);
});

test("short rests in a long module are the setting's number per region", () => {
  const three = under(longTunnels, ADA_2, { shortRests: 3 });
  const start = three.createSession();
  assert.deepEqual(three.projectRests(start, "short"), {
    left: 3,
    max: 3,
    per: "region",
  });
  const unlimited = under(longTunnels, ADA_2, { shortRests: "unlimited" });
  assert.deepEqual(unlimited.projectRests(start, "short"), {
    unlimited: true,
    per: "region",
  });
});

// Long rests.

test("long rest off: no rest site anywhere, and a long rest is refused", () => {
  const using = under(quiet, ADA_2, { longRest: "off" });
  const alcove = worn(begun(using), 3, "alcove");
  assert.equal(view(using, alcove, "long-rest"), undefined);
  assert.equal(
    refused(using, alcove, LONG, "not-rest-site").reason,
    "This adventure's settings allow no long rest.",
  );
  assert.equal(using.projectRoom(alcove).restSite, undefined);
  assert.ok(
    !using
      .projectCharacterStatus(alcove)
      .resources.some((line) => line.startsWith("Long rests")),
  );
  assert.ok(
    !using
      .getGameToolDefinitions(alcove)
      .some(({ name }) => name === "long_rest"),
  );
  // A short rest is still taken there.
  accepted(using, alcove, REST, dice([10, 1]));
  // On, as before.
  const on = under(quiet, ADA_2);
  const there = worn(begun(on), 3, "alcove");
  assert.equal(on.projectRoom(there).restSite, true);
  assert.equal(accepted(on, there, LONG).state.character.hp, MAX);
});

// Last Stand.

/**
 * The potion cellar's fight (as #499's tests): the character at 2 HP with
 * the potion, the goblin first, its hit bringing the character to 0 HP;
 * then `rest`, the dice after the hit.
 */
function struckDown(settings, ...rest) {
  const sheet = testFighterAt(1);
  const using = under(potionCellar, sheet, settings);
  const started = accepted(using, using.createSession(), { type: "begin" });
  const held = accepted(using, started.state, {
    type: "take",
    itemId: "healing-potion",
  }).state;
  const result = accepted(
    using,
    { ...held, character: { ...held.character, hp: 2 } },
    { type: "move", destinationId: "cellar" },
    dice([20, 2], [20, 18], [20, 15], [6, 4], ...rest),
  );
  return { using, result, sheet };
}

test("Last Stand off: the character falls with no death saving throw", () => {
  const { result } = struckDown({ lastStand: "off" });
  assert.equal(result.state.status, "defeat");
  assert.ok(!types(result.events).includes("last-stand"));
});

test("Last Stand DC 10: a 10 saves", () => {
  const { result, sheet } = struckDown({ lastStand: 10 }, [20, 10]);
  assert.equal(result.state.status, "playing");
  assert.equal(result.state.encounter.pendingReaction.kind, "last-stand");
  assert.match(
    renderFifthResult(result),
    new RegExp(
      `^Last Stand: ${sheet.name} drops to 0 HP and makes a death saving throw: 10 against DC 10\\. Success`,
      "mu",
    ),
  );
  // At the default DC 11, a 10 fails.
  assert.equal(struckDown({}, [20, 10]).result.state.status, "defeat");
});

test("Last Stand automatic: no death saving throw, and the fall always waits", () => {
  const { using, result, sheet } = struckDown({ lastStand: "automatic" });
  const { state } = result;
  assert.equal(state.status, "playing");
  assert.equal(state.encounter.pendingReaction.kind, "last-stand");
  assert.deepEqual(
    result.events.find(({ type }) => type === "last-stand"),
    {
      type: "last-stand",
      combatantId: "pc",
      attackerId: "goblin",
      automatic: true,
      success: true,
      potions: ["Potion of Healing"],
    },
  );
  assert.equal(
    renderFifthResult(result).split("\n").at(-1),
    `Last Stand: ${sheet.name} drops to 0 HP and clings on, and can drink the Potion of Healing with the reaction to rise again, or fall.`,
  );
  assert.deepEqual(
    using
      .projectActions(state)
      .map(({ action, available }) => [action, available]),
    [
      ["use", true],
      ["fall", true],
    ],
  );
  assert.ok(offeredToolsMatchActions({ runtime: using, state }));
});

// Opponent hit points.

/**
 * The bolt-hole cellar's fight with the character first: initiative 20,
 * then 1 for the Giant Rat and the Zombie.
 */
function cellarFight(using, start = using.createSession()) {
  const random = uncheckedDice(20, 1, 1);
  const { state } = using.handleAction(
    start,
    { type: "move", destinationId: "rat-cellar" },
    random,
  );
  assert.equal(random.remaining(), 0);
  return state;
}
const foes = (state) =>
  state.encounter.combatants
    .filter(({ side }) => side === "opponents")
    .map(({ id, hp, maxHp }) => [id, hp, maxHp]);

test("opponent hit points scale each opponent's maximum, rounded up; carried wounds keep to it", () => {
  // The Giant Rat has 7 HP, the Zombie 15.
  for (const [percent, rat, zombie] of [
    [75, 6, 12],
    [100, 7, 15],
    [125, 9, 19],
    [150, 11, 23],
  ]) {
    const using = under(fleeingCellar, TEST_FIGHTER, { opponentHp: percent });
    const state = cellarFight(using);
    assert.deepEqual(foes(state), [
      ["giant-rat", rat, rat],
      ["zombie", zombie, zombie],
    ]);
    // The fight bar shows them.
    assert.deepEqual(
      using
        .projectFight(state)
        .encounter.combatants.filter(({ id }) => id !== "pc")
        .map(({ hp, maxHp }) => [hp, maxHp]),
      [
        [rat, rat],
        [zombie, zombie],
      ],
    );
  }
  // Wounded, fled from and met again, the Zombie keeps its wounds of 23.
  const using = under(fleeingCellar, TEST_FIGHTER, {
    opponentHp: 150,
    fleeAttacks: "off",
  });
  const state = cellarFight(using);
  const hurt = {
    ...state,
    encounter: {
      ...state.encounter,
      combatants: state.encounter.combatants.map((entrant) =>
        entrant.id === "zombie" ? { ...entrant, hp: 20 } : entrant,
      ),
    },
  };
  const fled = accepted(using, hurt, {
    type: "flee",
    destinationId: "stair-foot",
  });
  assert.equal(fled.state.roomId, "stair-foot");
  assert.deepEqual(foes(cellarFight(using, fled.state)), [
    ["giant-rat", 11, 11],
    ["zombie", 20, 23],
  ]);
});

// Wandering encounters.

/** The wandering tunnels with the lower table's chance at 30. */
const lowerAt30 = (() => {
  const module = structuredClone(wanderingTunnelsFile);
  module.regions[1].wandering.chance = 30;
  return validateModule(module);
})();
const fromCellar = (using) => ({
  ...using.createSession(),
  roomId: "rat-cellar",
  clearedEncounterIds: ["cellar-rat"],
});
const rolls = (result) =>
  result.events.filter(({ type }) => type === "wandering-roll");

test("wandering double: each table's chance doubles, up to 100, and the entries split it as before", () => {
  const double = under(lowerAt30, TEST_FIGHTER, { wandering: "double" });
  // 1–30 the rat, 31–60 the dripping water, over 60 nothing.
  const rat = accepted(
    double,
    fromCellar(double),
    { type: "move", destinationId: "landing" },
    dice([100, 30], [20, 15], [20, 2]),
  );
  assert.deepEqual(rolls(rat)[0], {
    type: "wandering-roll",
    trigger: "moves",
    roll: 30,
    chance: 60,
    interrupted: true,
    opponents: ["Prowling Rat"],
  });
  const drip = accepted(
    double,
    fromCellar(double),
    { type: "move", destinationId: "landing" },
    dice([100, 31]),
  );
  assert.equal(rolls(drip)[0].chance, 60);
  assert.equal(
    rolls(drip)[0].omen,
    "Water drips steadily from the vaulted ceiling.",
  );
  const nothing = accepted(
    double,
    fromCellar(double),
    { type: "move", destinationId: "landing" },
    dice([100, 61]),
  );
  assert.equal(rolls(nothing)[0].interrupted, false);
  assert.equal(rolls(nothing)[0].omen, undefined);
  // At normal, 31 is over the chance.
  const normal = under(lowerAt30, TEST_FIGHTER);
  const calm = accepted(
    normal,
    fromCellar(normal),
    { type: "move", destinationId: "landing" },
    dice([100, 31]),
  );
  assert.deepEqual(rolls(calm)[0], {
    type: "wandering-roll",
    trigger: "moves",
    roll: 31,
    chance: 30,
    interrupted: false,
  });
  // A rest's table: 25 doubles to 50.
  const resting = under(restingTunnels, ADA_2, { wandering: "double" });
  const interrupted = accepted(
    resting,
    worn(begun(resting), 3, "alcove"),
    LONG,
    dice([100, 50], [20, 15], [20, 2]),
  );
  assert.equal(rolls(interrupted)[0].chance, 50);
  assert.equal(interrupted.state.wandering, "prowling-rat");
});

test("wandering off: no roll on moves, rests or the alarm, and the alarm still sounds", () => {
  const off = under(lowerAt30, TEST_FIGHTER, { wandering: "off" });
  const moved = accepted(off, fromCellar(off), {
    type: "move",
    destinationId: "landing",
  });
  assert.deepEqual(rolls(moved), []);
  const resting = under(restingTunnels, ADA_2, { wandering: "off" });
  const rested = accepted(resting, worn(begun(resting), 3, "alcove"), LONG);
  assert.deepEqual(types(rested.events), ["long-rest", "uses-regained"]);
  // The crates crash and raise the alarm (a d20 of 1), with no d100.
  const alarmFile = structuredClone(alarmTunnelsFile);
  alarmFile.regions[0].wandering = {
    chance: 100,
    entries: [{ omen: "Claws skitter somewhere in the dark, then fade." }],
  };
  const alarmed = under(validateModule(alarmFile), TEST_FIGHTER, {
    wandering: "off",
  });
  const raised = accepted(
    alarmed,
    alarmed.createSession(),
    { type: "examine", targetId: "stacked-crates" },
    dice([20, 1]),
  );
  assert.ok(types(raised.events).includes("alarm"));
  assert.notEqual(raised.state.alarm, undefined);
  assert.equal(raised.state.wanderingDue, undefined);
  assert.deepEqual(rolls(raised), []);
});

// Fleeing.

test("fleeing draws attacks off: every flight goes with none, and Disengage is refused", () => {
  const using = under(fleeingCellar, TEST_FIGHTER, { fleeAttacks: "off" });
  const state = cellarFight(using);
  const flights = using
    .projectActions(state)
    .filter(({ action, available }) => action === "flee" && available);
  assert.deepEqual(
    flights.map(({ attackers }) => attackers),
    [[], [], []],
  );
  const fled = accepted(using, state, {
    type: "flee",
    destinationId: "stair-foot",
  });
  assert.ok(!types(fled.events).includes("attack"));
  assert.match(
    renderFifthResult(fled),
    /^You flee: in this adventure fleeing draws no attacks, so no foe strikes at you as you go\.$/mu,
  );
  assert.equal(fled.state.roomId, "stair-foot");
  // A Rogue's Disengage would change nothing.
  const rogue = under(fleeingCellar, testRogueAt(2), { fleeAttacks: "off" });
  const its = cellarFight(rogue);
  assert.equal(
    refused(rogue, its, { type: "disengage", actorId: "pc" }, "flees-unopposed")
      .reason,
    "Fleeing draws no attacks in this adventure: disengaging would do nothing.",
  );
  assert.equal(
    rogue.projectActions(its).find(({ action }) => action === "disengage")
      .available,
    false,
  );
});

// Morale.

/**
 * The goblin band's fight begun, the character first (20), the goblins
 * after (2, 3, 4: no ties to roll off).
 */
function goblinFight(settings) {
  const using = under(goblinTrio, TEST_FIGHTER, settings);
  const queue = [20, 2, 3, 4];
  const random = { roll: () => queue.shift() ?? 1 };
  const { state } = using.handleAction(
    using.createSession(),
    { type: "begin" },
    random,
  );
  return { using, state };
}
const morales = (state) =>
  state.encounter.combatants
    .filter(({ side }) => side === "opponents")
    .map(({ morale }) => morale);

test("morale: never takes every morale DC away, flee easily adds 2, and undead never check", () => {
  assert.deepEqual(morales(goblinFight({}).state), [8, 8, 8]);
  assert.deepEqual(
    morales(goblinFight({ morale: "easily" }).state),
    [10, 10, 10],
  );
  assert.deepEqual(morales(goblinFight({ morale: "never" }).state), [
    undefined,
    undefined,
    undefined,
  ]);
  // The Zombie has no morale DC under any choice.
  const zombie = (settings) =>
    cellarFight(
      under(fleeingCellar, TEST_FIGHTER, settings),
    ).encounter.combatants.find(({ id }) => id === "zombie").morale;
  assert.equal(zombie({ morale: "easily" }), undefined);
  assert.equal(zombie({}), undefined);
  // A first fall: the rest check at DC 10 when easily, and not at all when never.
  const firstFall = (settings) => {
    const { using, state } = goblinFight(settings);
    const target = state.encounter.combatants.find(
      ({ side }) => side === "opponents",
    );
    const weak = {
      ...state,
      encounter: {
        ...state.encounter,
        combatants: state.encounter.combatants.map((entrant) =>
          entrant.id === target.id ? { ...entrant, hp: 1 } : entrant,
        ),
      },
    };
    const result = using.handleAction(
      weak,
      { type: "attack", actorId: "pc", targetId: target.id },
      { roll: (sides) => (sides === 20 ? 19 : sides) },
    );
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    return result.events
      .filter(({ type }) => type === "morale")
      .map(({ dc }) => dc);
  };
  assert.deepEqual(firstFall({ morale: "easily" }), [10, 10]);
  assert.deepEqual(firstFall({}), [8, 8]);
  assert.deepEqual(firstFall({ morale: "never" }), []);
});

// The adventure's own copy.

test("a reloaded session plays by its own settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-508-"));
  try {
    const settings = {
      ...DEFAULT_SETTINGS,
      opponentHp: 150,
      shortRests: 0,
      fleeAttacks: "off",
    };
    const session = await FifthSession.create(
      join(directory, "session.json"),
      "d".repeat(32),
      7,
      fleeingCellar,
      TEST_FIGHTER,
      settings,
    );
    session.act({ type: "move", destinationId: "rat-cellar" }, "click");
    await session.persist();
    const loaded = await FifthSession.load(session.path, [fleeingCellar]);
    assert.deepEqual(loaded.settings, settings);
    assert.deepEqual(loaded.state, session.state);
    assert.deepEqual(
      foes(loaded.state).map(([id, , maxHp]) => [id, maxHp]),
      [
        ["giant-rat", 11],
        ["zombie", 23],
      ],
    );
    assert.equal(loaded.runtime.systemPrompt, fifthDmSystemPrompt(settings));
    assert.deepEqual(loaded.runtime.projectRests(loaded.state, "short"), {
      left: 0,
      max: 0,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
