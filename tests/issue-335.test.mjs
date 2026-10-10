// #335: long rests at authored rest sites, and rests that a module's
// wandering encounter can interrupt. A long rest (at most one an adventure,
// D1) restores every hit point, hit die (D2) and feature use. Each short or
// long rest rolls a d100 against the wandering encounter's chance; on an
// interruption the rest restores nothing and its fight begins. It fires at
// most once, and its XP counts once.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  playAdventure,
  renderGateResult,
} from "../dist/balance-5e.js";
import { characterProfile } from "../dist/character-5e.js";
import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  LONG_RESTS_PER_ADVENTURE,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER, testFighterAt } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT, verifyFifthTraceFile } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  moduleFile,
  restingTunnels,
  restingTunnelsFile,
  room,
  waryTunnelsFile,
} from "./fixtures/modules.mjs";

// The validator.

test("a module may mark rest sites and author one wandering encounter", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 28);
  assert.equal(room(restingTunnels, "alcove").restSite, true);
  assert.equal(room(restingTunnels, "stair-foot").restSite, undefined);
  assert.deepEqual(restingTunnels.wanderingEncounter, {
    encounterId: "prowling-rat",
    chance: 25,
  });
  // Without one, nothing can interrupt a rest.
  assert.equal(
    validateModule(restingTunnelsFile()).wanderingEncounter,
    undefined,
  );
  const older = { ...moduleFile("rat-tunnels"), formatVersion: 27 };
  assert.throws(
    () => validateModule(older),
    new RegExp(`format version 27 is not ${FIFTH_ADVENTURE_FORMAT}`, "u"),
  );
});

test("the validator refuses malformed rest sites and wandering encounters", () => {
  const cases = [
    [
      (module) => {
        room(module, "alcove").restSite = false;
      },
      /room 2 restSite must be true, or left out\./u,
    ],
    [
      (module) => {
        module.wanderingEncounter.chance = 0;
      },
      /wanderingEncounter chance/u,
    ],
    [
      (module) => {
        module.wanderingEncounter.chance = 101;
      },
      /wanderingEncounter chance/u,
    ],
    [
      (module) => {
        module.wanderingEncounter.chance = 12.5;
      },
      /wanderingEncounter chance/u,
    ],
    [
      (module) => {
        module.wanderingEncounter.encounterId = "nobody";
      },
      /wanderingEncounter names unknown encounter nobody\./u,
    ],
    [
      (module) => {
        module.wanderingEncounter.text = "Footsteps.";
      },
      /wanderingEncounter/u,
    ],
    [
      // The wandering encounter comes to the character: it is in no room.
      (module) => {
        room(module, "alcove").encounterId = "prowling-rat";
      },
      /wandering encounter prowling-rat is in room alcove: it comes to the character as it rests, so it is in no room\./u,
    ],
    [
      // The cellar's rat as the wanderer: it is in a room.
      (module) => {
        module.wanderingEncounter.encounterId = "cellar-rat";
      },
      /wandering encounter cellar-rat is in room rat-cellar/u,
    ],
    [
      (module) => {
        module.encounters.at(-1).victoryEndingId = "cellar-cleared";
      },
      /wandering encounter prowling-rat can't end the adventure in victory\./u,
    ],
    ...[
      ["bypassXp", 10],
      ["sneakAgain", true],
      ["lurking", true],
    ].map(([field, value]) => [
      (module) => {
        module.encounters.at(-1)[field] = value;
      },
      new RegExp(
        `wandering encounter prowling-rat can't have ${field}: no one sneaks up on it, and it never lies in wait\\.`,
        "u",
      ),
    ]),
    [
      (module) => {
        module.encounters.at(-1).opponents[0].surrender = {
          description: "It cowers.",
          topics: [{ id: "mercy", name: "Mercy", reply: "It squeaks." }],
        };
      },
      /wandering encounter prowling-rat opponent prowler can't surrender/u,
    ],
  ];
  for (const [change, message] of cases) {
    const module = restingTunnelsFile(25);
    change(module);
    assert.throws(() => validateModule(module), message);
  }
  // Without a wandering encounter, every encounter is still in a room.
  const stray = restingTunnelsFile(25);
  delete stray.wanderingEncounter;
  assert.throws(
    () => validateModule(stray),
    /encounter prowling-rat is in no room\./u,
  );
  // A wandering encounter never reacts: it comes upon the character.
  const reacting = restingTunnelsFile(25);
  reacting.encounters.at(-1).reaction = waryTunnelsFile.encounters[0].reaction;
  reacting.encounters.at(-1).opponents[0].reacts = true;
  assert.throws(
    () => validateModule(reacting),
    /wandering encounter prowling-rat can't have a reaction/u,
  );
});

// The engine.

const ADA_2 = testFighterAt(2);
const MAX = characterProfile(ADA_2).maxHp;
const quiet = validateModule(restingTunnelsFile());
const always = validateModule(restingTunnelsFile(100));

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(using, state, action, code) {
  const result = using.handleAction(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection;
}

const begun = (using) =>
  accepted(using, using.createSession(), { type: "begin" }).state;

/** `state` with the character at `hp`, and these uses, hit dice and room. */
const worn = (state, hp, { uses = {}, hitDice, roomId } = {}) => ({
  ...state,
  ...(roomId === undefined ? {} : { roomId }),
  character: {
    ...state.character,
    hp,
    featureUses: { ...state.character.featureUses, ...uses },
    ...(hitDice === undefined ? {} : { hitDice }),
  },
});

const LONG = { type: "long-rest" };
const view = (using, state, kind) =>
  using.projectActions(state).find(({ action }) => action === kind);
const types = (events) => events.map(({ type }) => type);

test("a long rest at a rest site restores every hit point, hit die and feature use", () => {
  const using = createFifthRuntime(quiet, ADA_2);
  assert.equal(LONG_RESTS_PER_ADVENTURE, 1);
  const tired = worn(begun(using), 3, {
    uses: { "second-wind": 0, "action-surge": 0 },
    hitDice: 0,
    roomId: "alcove",
  });
  const result = accepted(using, tired, LONG);
  const { state, events } = result;
  assert.equal(state.character.hp, MAX);
  assert.equal(state.character.hitDice, 2);
  assert.deepEqual(state.character.featureUses, {
    "second-wind": 2,
    "action-surge": 1,
  });
  assert.equal(state.longRests, 1);
  // A long rest leaves the short rests as they were.
  assert.equal(state.shortRests, 0);
  assert.deepEqual(types(events), ["long-rest", "uses-regained"]);
  assert.deepEqual(events[0], {
    type: "long-rest",
    healing: MAX - 3,
    hpAfter: MAX,
    maxHp: MAX,
    regainedHitDice: 2,
    hitDice: { available: 2, total: 2, sides: 10 },
    longRests: { left: 0, max: 1 },
  });
  const text = renderFifthResult(result);
  assert.match(
    text,
    new RegExp(
      `^You take a long rest: you regain ${MAX - 3} HP \\(${MAX}/${MAX} HP\\) and 2 hit dice \\(2 of 2 d10 left\\)\\. Long rests: 0 of 1 left in this adventure\\.$`,
      "mu",
    ),
  );
  assert.match(
    text,
    /^Second Wind regains 2 uses \(2 of 2 left\)\. Action Surge regains 1 use \(1 of 1 left\)\.$/mu,
  );
  // The status lists the long rests left in a module with a rest site.
  assert.match(
    using.projectCharacterStatus(tired).resources.join("\n"),
    /^Long rests: 1 of 1 left$/mu,
  );
  assert.deepEqual(using.projectRests(state, "long"), { left: 0, max: 1 });
});

test("a long rest is refused away from a rest site, after one, in a fight, with foes here, and with nothing to restore", () => {
  const using = createFifthRuntime(quiet, ADA_2);
  const fresh = begun(using);
  // Away from a rest site: refused, and not offered.
  const stair = worn(fresh, 3);
  assert.match(
    refused(using, stair, LONG, "not-rest-site").reason,
    /^You can take a long rest only at a safe place to rest/u,
  );
  assert.equal(view(using, stair, "long-rest"), undefined);
  // At a rest site, once.
  const alcove = worn(fresh, 3, { roomId: "alcove" });
  assert.equal(view(using, alcove, "long-rest").available, true);
  const rested = accepted(using, alcove, LONG).state;
  const again = worn(rested, 3);
  assert.match(
    refused(using, again, LONG, "no-long-rests-left").reason,
    /^You have taken the one long rest an adventure allows\.$/u,
  );
  const spent = view(using, again, "long-rest");
  assert.equal(spent.available, false);
  assert.equal(spent.reason, "No long rest left");
  // Nothing to restore: refused, and not offered.
  const whole = worn(fresh, MAX, { roomId: "alcove" });
  assert.match(
    refused(using, whole, LONG, "nothing-to-recover").reason,
    /a long rest would restore nothing/u,
  );
  assert.equal(view(using, whole, "long-rest"), undefined);
  // A rest site with foes not yet beaten (made one for this test).
  const lairFile = restingTunnelsFile();
  room(lairFile, "rat-cellar").restSite = true;
  const lair = createFifthRuntime(validateModule(lairFile), ADA_2);
  const cellar = worn(begun(lair), 3, { roomId: "rat-cellar" });
  refused(lair, cellar, LONG, "hostile-here");
  assert.equal(view(lair, cellar, "long-rest").reason, "Foes here");
  const fight = accepted(
    lair,
    worn(begun(lair), 3),
    { type: "move", destinationId: "rat-cellar" },
    dice([20, 15], [20, 2]),
  ).state;
  assert.equal(fight.encounter.outcome, "ongoing");
  refused(lair, fight, LONG, "fighting");
});

test("each rest rolls a d100 against the wandering encounter; above its chance the rest goes on", () => {
  const using = createFifthRuntime(restingTunnels, ADA_2);
  const tired = worn(begun(using), 3, { roomId: "alcove" });
  const result = accepted(using, tired, LONG, dice([100, 26]));
  assert.deepEqual(types(result.events), ["wandering-roll", "long-rest"]);
  assert.deepEqual(result.events[0], {
    type: "wandering-roll",
    rest: "long",
    roll: 26,
    chance: 25,
    interrupted: false,
  });
  assert.equal(result.state.character.hp, MAX);
  assert.match(
    renderFifthResult(result),
    /^You keep watch as you rest: d100 26, over 25: nothing disturbs you\.$/mu,
  );
  // The d100 shows on the card.
  const lines = describeFifthResult(result, [{ sides: 100, value: 26 }], "Ada");
  assert.deepEqual(
    lines.flatMap(({ rolls }) => rolls),
    [
      {
        purpose: "wandering",
        roller: "Ada",
        label: "Wandering encounter",
        dice: [{ sides: 100, value: 26 }],
        modifier: 0,
        total: 26,
        dc: 25,
        outcome: "failure",
      },
    ],
  );
  // A short rest rolls first too.
  const short = accepted(
    using,
    worn(begun(using), 3),
    { type: "rest", hitDice: 1 },
    dice([100, 90], [10, 4]),
  );
  assert.deepEqual(types(short.events), [
    "wandering-roll",
    "short-rest",
    "hit-die",
  ]);
  assert.equal(short.events[0].rest, "short");
});

test("an interrupted rest restores nothing and starts the wandering encounter's fight", () => {
  const using = createFifthRuntime(restingTunnels, ADA_2);
  const tired = worn(begun(using), 3, {
    uses: { "action-surge": 0 },
    roomId: "alcove",
  });
  // d100 25: interrupted. Then initiative: Ada 15, the rat 2.
  const result = accepted(
    using,
    tired,
    LONG,
    dice([100, 25], [20, 15], [20, 2]),
  );
  const { state, events } = result;
  assert.deepEqual(events[0], {
    type: "wandering-roll",
    rest: "long",
    roll: 25,
    chance: 25,
    interrupted: true,
    opponents: ["Prowling Rat"],
  });
  assert.equal(
    events.some(({ type }) => type === "long-rest"),
    false,
  );
  // Nothing restored, and the rest is not used up.
  assert.equal(state.character.hp, 3);
  assert.equal(state.character.hitDice, 2);
  assert.equal(state.character.featureUses["action-surge"], 0);
  assert.equal(state.longRests, 0);
  // The wanderer's fight is under way, here.
  assert.equal(state.roomId, "alcove");
  assert.equal(state.encounter.outcome, "ongoing");
  assert.deepEqual(
    state.encounter.combatants
      .filter(({ side }) => side === "opponents")
      .map(({ name }) => name),
    ["Prowling Rat"],
  );
  assert.match(
    renderFifthResult(result),
    /^You keep watch as you rest: d100 25, 25 or less: the Prowling Rat comes upon you\. Your long rest is interrupted and restores nothing\.$/mu,
  );
  // No rest in its fight.
  refused(using, state, LONG, "fighting");
  refused(using, state, { type: "rest", hitDice: 1 }, "fighting");
  // An interrupted short rest likewise.
  const short = accepted(
    using,
    worn(begun(using), 3),
    { type: "rest", hitDice: 2 },
    dice([100, 1], [20, 15], [20, 2]),
  );
  assert.equal(short.events[0].rest, "short");
  assert.equal(short.events[0].interrupted, true);
  assert.equal(short.state.character.hp, 3);
  assert.equal(short.state.character.hitDice, 2);
  assert.equal(short.state.shortRests, 0);
  assert.equal(short.state.encounter.outcome, "ongoing");
  assert.match(
    renderFifthResult(short),
    /Your short rest is interrupted and restores nothing\./u,
  );
});

/** Attacks the first foe the action bar offers until the fight is over. */
function fightOut(session) {
  for (let turn = 0; turn < 200; turn += 1) {
    if (session.state.encounter?.outcome !== "ongoing") {
      return;
    }
    const views = session.runtime
      .projectActions(session.state)
      .filter(({ available }) => available);
    const choice =
      views.find(({ action }) => action === "attack") ??
      views.find(({ action }) => action === "end-turn");
    session.act(session.runtime.actionOf(choice), "click");
  }
}

const move = (session, destinationId) =>
  session.act({ type: "move", destinationId }, "click");

test("the wandering encounter fires at most once, and its XP counts once", () => {
  const session = FifthSession.begin(3, always, ADA_2);
  move(session, "rat-cellar");
  fightOut(session);
  assert.equal(session.state.status, "playing");
  move(session, "stair-foot");
  move(session, "alcove");
  session.state = worn(session.state, MAX - 1);
  // Chance 100: the first rest is interrupted.
  const first = session.act(LONG, "click");
  assert.equal(first.result.events[0].interrupted, true);
  fightOut(session);
  assert.equal(session.state.status, "playing", "Ada beats the prowling rat");
  assert.ok(session.state.clearedEncounterIds.includes("prowling-rat"));
  // The fight is won here: resting is safe again, and no d100 is rolled,
  // as the wanderer has come.
  session.state = worn(session.state, 3);
  const second = session.act(LONG, "click");
  assert.equal(second.result.rejection, undefined);
  assert.equal(second.result.events[0].type, "long-rest");
  assert.equal(second.rolls.length, 0);
  assert.equal(session.state.character.hp, MAX);
  // Coming back meets no fight, and a short rest rolls no d100 either.
  move(session, "stair-foot");
  move(session, "alcove");
  assert.equal(session.state.encounter, undefined);
  session.state = worn(session.state, 3);
  const short = session.act({ type: "rest", hitDice: 1 }, "click");
  assert.equal(short.result.events[0].type, "short-rest");
  // The den's goblin ends it in victory: the rat, the wanderer and the
  // goblin each count once.
  session.state = worn(session.state, MAX);
  move(session, "stair-foot");
  move(session, "rat-cellar");
  move(session, "den");
  fightOut(session);
  assert.equal(session.state.status, "victory");
  const { xp } = session.runtime.projectSettlement(session.state);
  assert.deepEqual(
    xp.map(({ xp: earned }) => earned),
    [25, 25, 50],
  );
  assert.equal(xp.filter(({ id }) => id.includes("prowling-rat")).length, 1);
});

test("losing to the wandering encounter ends in its defeat ending", () => {
  const using = createFifthRuntime(always, ADA_2);
  const result = using.handleAction(
    worn(begun(using), 1, { roomId: "alcove" }),
    LONG,
    // Interrupted; then the session's own dice play the fight's start.
    dice([100, 50], [20, 2], [20, 15], [20, 18], [4, 4]),
  );
  assert.equal(result.rejection, undefined);
  assert.equal(result.state.status, "defeat");
  assert.equal(result.state.endingId, "fallen-in-the-cellar");
});

// The balance harness and gate.

/** The resting tunnels with the rat's cellar a rest site too. */
const cellarRest = (chance) => {
  const module = restingTunnelsFile(chance);
  room(module, "rat-cellar").restSite = true;
  return validateModule(module);
};

test("the harness takes a long rest at a rest site when low, and counts rests interrupted", () => {
  const using = createFifthRuntime(cellarRest(), TEST_FIGHTER);
  const seeds = Array.from({ length: 20 }, (_, seed) => seed);
  const runs = seeds.map((seed) => playAdventure(using, "cautious", seed));
  assert.ok(
    runs.some(({ healing }) => healing.longRests === 1),
    "some run rests long in the cellar",
  );
  assert.ok(runs.every(({ healing }) => healing.longRests <= 1));
  assert.ok(runs.every(({ healing }) => healing.interruptedRests === 0));
  // Chance 100: the first rest is interrupted, and its fight recorded.
  const watched = createFifthRuntime(cellarRest(100), TEST_FIGHTER);
  const interrupted = seeds
    .map((seed) => playAdventure(watched, "cautious", seed))
    .filter(({ healing }) => healing.interruptedRests > 0);
  assert.ok(interrupted.length > 0);
  for (const run of interrupted) {
    assert.equal(run.healing.interruptedRests, 1);
    assert.ok(run.encounters.some(({ id }) => id === "prowling-rat"));
  }
});

test("the gate's XP check counts the wandering encounter, and it reports rests", () => {
  const seeds = { seeds: [0, 1, 2, 3] };
  // The rat 25, the prowling rat 25 and the goblin 50.
  const result = gateAdventure(cellarRest(25), seeds);
  assert.equal(result.ok, true);
  assert.equal(result.verdict.xp.available, 100);
  assert.equal(
    gateAdventure(validateModule(restingTunnelsFile()), seeds).verdict.xp
      .available,
    75,
  );
  const { rests } = result.verdict;
  assert.equal(typeof rests.meanShort, "number");
  assert.equal(typeof rests.meanLong, "number");
  assert.equal(typeof rests.meanInterrupted, "number");
  assert.match(
    renderGateResult(cellarRest(25), result),
    /^ {2}Rests, reported \(not judged\): on seeded checks the level 1, 5th percentile Fighter playing cautious took \d+\.\d short and \d+\.\d long rests a run; \d+\.\d rests a run were interrupted\.$/mu,
  );
});

// The AI DM's long_rest tool.

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson = "{}", text = "Done.") => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});
const attempt = (turn) => turn.toolAttempts[0];
const longRestTool = (session) =>
  session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "long_rest");

test("scripted DM: asking to sleep at a rest site calls long_rest", async () => {
  const session = FifthSession.begin(0, quiet, ADA_2);
  // Away from the rest site: not offered, and the engine refuses it.
  session.state = worn(session.state, 3);
  assert.equal(longRestTool(session), undefined);
  const away = await session.converse(
    "I make camp for the night.",
    scriptedDm("long_rest"),
  );
  assert.equal(
    attempt(away.turn).result.engineResult.rejection.code,
    "not-rest-site",
  );
  // In the alcove: offered, with no arguments.
  session.state = worn(session.state, 3, { roomId: "alcove" });
  const tool = longRestTool(session);
  assert.match(tool.description, /^Only when the player asks for a long rest/u);
  assert.match(tool.description, /long rests: 1 of 1 left/u);
  assert.deepEqual(tool.parameters.properties, {});
  assert.ok(offeredToolsMatchActions(session));
  const bad = await session.converse(
    "I sleep.",
    scriptedDm("long_rest", JSON.stringify({ hours: 8 })),
  );
  assert.equal(
    attempt(bad.turn).result.modelOutput.error.code,
    "invalid-arguments",
  );
  const { turn } = await session.converse(
    "I sleep here until morning.",
    scriptedDm("long_rest"),
  );
  assert.equal(attempt(turn).disposition.executed, true);
  assert.deepEqual(attempt(turn).result.action, LONG);
  assert.equal(session.state.character.hp, MAX);
  assert.equal(session.state.longRests, 1);
  // Taken: no longer offered.
  assert.equal(longRestTool(session), undefined);
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /one long rest in an adventure: long_rest is offered only then\. Call long_rest only when the player asks for a long rest/u,
  );
});

test("a session or trace saved before #335 is refused, naming the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-335-"));
  try {
    const path = join(directory, "session.json");
    await FifthSession.create(path, "a".repeat(32), 0, quiet, ADA_2);
    const file = JSON.parse(await readFile(path, "utf8"));
    file.formatVersion = 37;
    const bytes = JSON.stringify(file);
    await writeFile(path, bytes);
    await assert.rejects(FifthSession.load(path, [quiet]), (error) => {
      assert.equal(
        error.message,
        `${path} is an adventure session in format version 37, not ${FIFTH_SESSION_FORMAT}. This build cannot continue it. Move it aside; the file has not been changed.`,
      );
      return true;
    });
    assert.equal(await readFile(path, "utf8"), bytes);

    const tracePath = join(directory, "trace.json");
    const trace = JSON.stringify({
      kind: "dungeon-one-5e-trace",
      formatVersion: 31,
    });
    await writeFile(tracePath, trace);
    await assert.rejects(verifyFifthTraceFile(tracePath, [quiet]), (error) => {
      assert.equal(
        error.message,
        `${tracePath} is a trace in format version 31, not ${FIFTH_TRACE_FORMAT}. This build cannot replay it. Move it aside; the file has not been changed.`,
      );
      return true;
    });
    assert.equal(await readFile(tracePath, "utf8"), trace);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
