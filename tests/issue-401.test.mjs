// #401: alarms. A module may declare an alarm: one of its flags, which only
// noise sets. Noise is a sneak that fails by 5 or more, a fight in one of the
// alarm's regions going on past its round, a check landing in a band marked
// `noisy`, or an opponent that flees a fight and survives it. The alarm is
// raised once and remembered with what raised it; what it changes is authored
// with flag conditions. The room panel shows the module's words once it is
// raised, its card names what raised it, and the AI DM's scene says so; no
// tool raises or lowers it. The harness meets it, and the gate's report names
// the runs that raised it. Adventure 38, session 59, trace 53, prompt v39.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  playAdventure,
  renderGateResult,
} from "../dist/balance-5e.js";
import { bandOf } from "../dist/checks-5e.js";
import {
  FIFTH_ALARM_DM_CASES,
  loadFifthAlarmEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { createSeededRandom } from "../dist/random.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  alarmTunnels,
  alarmTunnelsFile,
  room,
  rousedTunnels,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const SNEAK = (destinationId) => ({ type: "sneak", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });
const END_TURN = { type: "end-turn", actorId: "pc" };

/** Dice that show `queue` in order, then 1s: every attack misses. */
function steady(...queue) {
  return { roll: () => (queue.length > 0 ? queue.shift() : 1) };
}

function accepted(runtime, state, action, random = steady()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** The alarmed tunnels' JSON, changed by `change`, validated. */
function alarmed(change) {
  const module = structuredClone(alarmTunnelsFile);
  change(module);
  return validateModule(module);
}

const runtime = createFifthRuntime(alarmTunnels, TEST_FIGHTER);
const alarmEvents = (result) =>
  result.events.filter(({ type }) => type === "alarm");

/** The crates crash down (a 1 on the check): the alarm is raised. */
const crashed = (on = runtime) =>
  accepted(on, on.createSession(), EXAMINE("stacked-crates"), steady(1));

/**
 * A fight in the cellar the character goes into first (initiative 20 to
 * the rat's 1), ending its turn `turns` times while everyone misses.
 */
function longFight(on, turns, from = on.createSession()) {
  let result = accepted(on, from, MOVE("rat-cellar"), steady(20, 1));
  const events = [...result.events];
  for (let turn = 0; turn < turns; turn += 1) {
    result = accepted(on, result.state, END_TURN);
    events.push(...result.events);
  }
  return { state: result.state, events };
}

test("the formats bump, and the prompt", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 42);
  assert.equal(FIFTH_SESSION_FORMAT, 62);
  assert.equal(FIFTH_TRACE_FORMAT, 56);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v44");
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /No tool raises or lowers the alarm\. Never raise it, quiet it, or say it is raised or quiet in your words/u,
  );
});

// The validator.

test("a module's alarm and a noisy band are read", () => {
  assert.deepEqual(alarmTunnels.alarm, {
    flag: "alarm",
    text: "A gong booms below, and goblin voices shout. The tunnels are roused.",
    fights: [{ region: "lower", round: 2 }],
  });
  const crates = room(alarmTunnels, "stair-foot").features.at(-1);
  assert.equal(crates.check.bands["failure-by-5"].noisy, true);
  assert.equal(crates.check.bands.success.noisy, undefined);
  // An alarm needs no fights: noise of the other kinds raises it anywhere.
  assert.equal(
    alarmed((module) => delete module.alarm.fights).alarm.fights,
    undefined,
  );
});

test("the validator refuses an alarm naming an unknown flag or region, or a bad round", () => {
  assert.throws(
    () => alarmed((module) => (module.alarm.flag = "gong")),
    /the alarm names unknown flag gong\./u,
  );
  assert.throws(
    () => alarmed((module) => (module.alarm.fights[0].region = "attic")),
    /alarm fight 1 names unknown region attic\./u,
  );
  assert.throws(
    () =>
      alarmed((module) =>
        module.alarm.fights.push({ region: "lower", round: 3 }),
      ),
    /the alarm names region lower twice\./u,
  );
  for (const round of [0, 11, 1.5]) {
    assert.throws(
      () => alarmed((module) => (module.alarm.fights[0].round = round)),
      /alarm fight 1 round must be an integer from 1 to 10\./u,
    );
  }
  assert.throws(() => alarmed((module) => delete module.alarm.text), /alarm/u);
});

test("the validator refuses a noisy band without an alarm, and anything else setting its flag", () => {
  assert.throws(
    () =>
      alarmed((module) => {
        delete module.alarm;
        delete module.flags;
        delete module.passages.find(({ id }) => id === "stair-to-cellar")
          .closeWhen;
        delete module.encounters.find(({ id }) => id === "lookout").movesTo;
      }),
    /feature stacked-crates check's failure-by-5 band is noisy, but the module has no alarm for it to raise\./u,
  );
  assert.throws(
    () =>
      alarmed((module) => {
        const crates = room(module, "stair-foot").features.at(-1);
        crates.check.bands["failure-by-5"].noisy = "yes";
      }),
    /noisy must be true, or left out\./u,
  );
  assert.throws(
    () => alarmed((module) => (room(module, "alcove").sets = "alarm")),
    /room alcove sets alarm, the alarm's flag: only noise raises it\./u,
  );
  assert.throws(
    () =>
      alarmed((module) => {
        const crates = room(module, "stair-foot").features.at(-1);
        crates.check.bands.success.effects = [{ type: "set", flag: "alarm" }];
      }),
    /sets alarm, the alarm's flag: only noise raises it\./u,
  );
});

test("reachability never counts the alarm as set: a way it closes or opens can't be the only one", () => {
  // Without the crawl from the alcove, the grate the alarm drops cuts the
  // cellar, and the den beyond it, off.
  assert.throws(
    () =>
      alarmed((module) => {
        module.passages = module.passages.filter(
          ({ id }) => id !== "alcove-to-cellar",
        );
      }),
    /flag alarm closes passage stair-to-cellar, which can cut off/u,
  );
  // A way only the alarm opens is never counted on.
  assert.throws(
    () =>
      alarmed((module) => {
        const archway = module.passages.find(
          ({ id }) => id === "landing-to-den",
        );
        archway.openWhen = "alarm";
      }),
    /den/u,
  );
});

// The engine: each noise source.

test("a sneak that fails by 5 or more raises the alarm; one that fails by less does not", () => {
  const loud = accepted(
    runtime,
    runtime.createSession(),
    SNEAK("rat-cellar"),
    steady(1, 20, 1),
  );
  assert.equal(bandOf(loud.state.sneaks[0].roll), "failure-by-5");
  assert.deepEqual(loud.state.alarm, {
    by: "sneak",
    encounterId: "cellar-rat",
    roomId: "rat-cellar",
  });
  assert.ok(loud.state.flags.includes("alarm"));
  assert.deepEqual(alarmEvents(loud), [
    {
      type: "alarm",
      text: "A gong booms below, and goblin voices shout. The tunnels are roused.",
      cause: "a sneak into the Rat-Gnawed Cellar that failed by 5 or more",
    },
  ]);

  const quiet = accepted(
    runtime,
    runtime.createSession(),
    SNEAK("rat-cellar"),
    steady(6, 20, 1),
  );
  assert.equal(bandOf(quiet.state.sneaks[0].roll), "failure");
  assert.equal(quiet.state.alarm, undefined);
  assert.ok(!quiet.state.flags.includes("alarm"));
});

test("a check landing in a noisy band raises the alarm; another band does not", () => {
  const loud = crashed();
  assert.deepEqual(loud.state.alarm, {
    by: "check",
    checkId: "examine:stacked-crates",
    band: "failure-by-5",
  });
  assert.match(
    renderFifthResult(loud),
    /The stack topples with a crash that rings down the passage\.\nThe alarm is raised by examining the Stacked Crates \(failure by 5 or more\)\. A gong booms below, and goblin voices shout\. The tunnels are roused\./u,
  );
  const quiet = accepted(
    runtime,
    runtime.createSession(),
    EXAMINE("stacked-crates"),
    steady(20),
  );
  assert.equal(quiet.state.checks[0].band, "success");
  assert.equal(quiet.state.alarm, undefined);
  assert.deepEqual(alarmEvents(quiet), []);
});

test("a fight in an alarm region going on past its round raises the alarm", () => {
  // Round 1 and round 2 pass quietly; round 3 makes noise.
  const two = longFight(runtime, 1);
  assert.equal(two.state.encounter.round, 2);
  assert.equal(two.state.alarm, undefined);
  const three = longFight(runtime, 2);
  assert.equal(three.state.encounter.round, 3);
  assert.deepEqual(three.state.alarm, {
    by: "fight",
    encounterId: "cellar-rat",
    roomId: "rat-cellar",
    round: 2,
  });
  assert.deepEqual(
    three.events
      .filter(({ type }) => type === "alarm")
      .map(({ cause }) => cause),
    ["the fight in the Rat-Gnawed Cellar going on past round 2"],
  );
  // A fight outside the alarm's regions makes no such noise.
  const upstairs = createFifthRuntime(
    alarmed((module) => (module.alarm.fights[0].region = "upper")),
    TEST_FIGHTER,
  );
  assert.equal(longFight(upstairs, 4).state.alarm, undefined);
});

test("an opponent that flees a fight and survives it raises the alarm", () => {
  // Two rats in the cellar, and no long-fight noise: on seed 6, attacking
  // the first rat standing, one rat loses its nerve and gets away.
  const twoRats = createFifthRuntime(
    alarmed((module) => {
      delete module.alarm.fights;
      const fight = module.encounters.find(({ id }) => id === "cellar-rat");
      fight.opponents.push({
        ...structuredClone(fight.opponents[0]),
        id: "second-rat",
        name: "Second Rat",
      });
    }),
    TEST_FIGHTER,
  );
  const random = createSeededRandom(6);
  let result = accepted(
    twoRats,
    twoRats.createSession(),
    MOVE("rat-cellar"),
    random,
  );
  const events = [...result.events];
  while (result.state.encounter.outcome === "ongoing") {
    const offered = twoRats
      .projectActions(result.state)
      .filter(({ available }) => available);
    const next =
      offered.find(({ action }) => action === "attack") ??
      offered.find(({ action }) => action === "end-turn");
    result = accepted(twoRats, result.state, twoRats.actionOf(next), random);
    events.push(...result.events);
  }
  assert.equal(result.state.encounter.outcome, "victory");
  assert.deepEqual(
    result.state.fledOpponents.map(({ opponentId }) => opponentId),
    ["giant-rat"],
  );
  assert.deepEqual(result.state.alarm, {
    by: "fled",
    encounterId: "cellar-rat",
    opponentId: "giant-rat",
    roomId: "rat-cellar",
  });
  assert.deepEqual(
    events.filter(({ type }) => type === "alarm").map(({ cause }) => cause),
    ["Giant Rat that fled the fight in the Rat-Gnawed Cellar and lived"],
  );
});

test("the alarm is raised once and remembered: later noise changes nothing", () => {
  const raised = crashed().state;
  // Round 3 of the cellar's fight would be noise; the grate is down, so
  // the crawl from the alcove leads there.
  const alcove = accepted(runtime, raised, MOVE("alcove")).state;
  const later = longFight(runtime, 3, alcove);
  assert.equal(later.state.encounter.round, 4);
  assert.deepEqual(later.state.alarm, raised.alarm);
  assert.deepEqual(
    later.state.flags.filter((flag) => flag === "alarm"),
    ["alarm"],
  );
  assert.deepEqual(
    later.events.filter(({ type }) => type === "alarm"),
    [],
  );
});

test("a module without an alarm makes no noise", () => {
  const quiet = createFifthRuntime(rousedTunnels, TEST_FIGHTER);
  const sneaked = accepted(
    quiet,
    quiet.createSession(),
    MOVE("nest"),
    steady(20, 1),
  );
  assert.equal(sneaked.state.alarm, undefined);
  assert.equal(quiet.projectRoom(sneaked.state).alarm, undefined);
});

// What the alarm changes.

test("the alarm drops the grate and brings the lookout to the landing", () => {
  const start = runtime.createSession();
  const raised = crashed();
  // The way down from the stair closes, said as a band's close is.
  assert.match(
    renderFifthResult(raised),
    /The way to the Rat-Gnawed Cellar is closed\./u,
  );
  const down = (state) =>
    runtime.projectRoom(state).exits.find(({ id }) => id === "rat-cellar")
      .route;
  assert.equal(down(start), undefined);
  assert.equal(down(raised.state), "closed");
  assert.match(
    runtime.handleAction(raised.state, MOVE("rat-cellar"), steady()).rejection
      .reason,
    /closed/u,
  );
  // From the cellar, its rat beaten, a fight waits on the landing only
  // once the alarm is raised: the lookout has left its post.
  const sneakable = (state) =>
    runtime
      .projectActions({
        ...state,
        roomId: "rat-cellar",
        clearedEncounterIds: ["cellar-rat"],
      })
      .filter(({ action, available }) => action === "sneak" && available)
      .map(({ target }) => target.id);
  assert.deepEqual(sneakable(start), []);
  assert.deepEqual(sneakable(raised.state), ["landing"]);
});

// What the player and the AI DM see.

test("the room panel says the alarm is raised, in the module's words", () => {
  const start = runtime.createSession();
  assert.equal(runtime.projectRoom(start).alarm, undefined);
  const raised = crashed().state;
  assert.equal(
    runtime.projectRoom(raised).alarm,
    "A gong booms below, and goblin voices shout. The tunnels are roused.",
  );
  // In every room from then on.
  const alcove = accepted(runtime, raised, MOVE("alcove")).state;
  assert.equal(
    runtime.projectRoom(alcove).alarm,
    "A gong booms below, and goblin voices shout. The tunnels are roused.",
  );
});

test("the AI DM's scene says the alarm is raised, and no tool raises or lowers it", () => {
  const start = runtime.createSession();
  assert.equal(runtime.projectDmScene(start).alarm, undefined);
  const raised = crashed().state;
  assert.equal(
    runtime.projectDmScene(raised).alarm,
    "The alarm is raised: A gong booms below, and goblin voices shout. The tunnels are roused.",
  );
  for (const state of [start, raised]) {
    for (const { name, parameters } of runtime.getGameToolDefinitions(state)) {
      assert.doesNotMatch(
        `${name} ${JSON.stringify(parameters)}`,
        /alarm|noise/u,
      );
    }
  }
});

test("the alarm evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthAlarmEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  assert.deepEqual(adventure, alarmTunnels);
  for (const sample of FIFTH_ALARM_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
    // Each case after the crash plays with the alarm raised.
    assert.equal(
      session.state.alarm !== undefined,
      sample.setup.length > 0,
      sample.id,
    );
  }
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_ALARM_DM_CASES,
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
      FIFTH_ALARM_DM_CASES.map((sample) => [
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

// Reload and trace.

test("a reload replays the alarm and what raised it, and a trace records it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-401-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      0,
      alarmTunnels,
      TEST_FIGHTER,
    );
    const run = new FifthTraceRun(created);
    const { result } = run.click(EXAMINE("stacked-crates"));
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    assert.equal(run.session.state.alarm?.by, "check");
    await run.session.persist();
    const loaded = await FifthSession.load(path, [alarmTunnels]);
    assert.deepEqual(loaded.state.alarm, run.session.state.alarm);
    assert.deepEqual(loaded.state, run.session.state);
    assert.deepEqual(
      run.trace.turns.at(-1).stateAfter.alarm,
      run.session.state.alarm,
    );
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [alarmTunnels]);
    assert.deepEqual(replayed.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a noisy band names its own kind of check: forcing a door, disarming a trap", () => {
  // A dead-end store room off the stair foot, behind a door and a trap.
  const module = structuredClone(alarmTunnelsFile);
  module.rooms.push({
    id: "store",
    name: "Store",
    description: "A bare store cut into the rock.",
    features: [],
    items: [],
    region: "upper",
  });
  const passage = {
    id: "stair-to-store",
    between: ["stair-foot", "store"],
    description: "A narrow gap.",
  };
  module.passages.push(passage);
  passage.door = {
    id: "warped-door",
    name: "Warped Door",
    description: "A door swollen tight in its frame.",
    state: "stuck",
    force: {
      skill: "athletics",
      dc: 12,
      bands: {
        "failure-by-5": {
          text: "The door shrieks on its hinges.",
          noisy: true,
        },
      },
    },
  };
  passage.trap = {
    id: "tin-wire",
    name: "Tin Wire",
    description: "A wire strung with tin cups across the gap.",
    find: { dc: 10 },
    disarm: {
      ability: "dexterity",
      dc: 12,
      bands: {
        "failure-by-5": { text: "The cups clatter to the floor.", noisy: true },
      },
    },
    trigger: "The wire snags your ankle and you fall.",
    save: { ability: "dexterity", dc: 10 },
    damage: { dice: 1, sides: 4, modifier: 0, type: "bludgeoning" },
    defeatEndingId: "fallen-in-the-cellar",
  };
  const loud = createFifthRuntime(validateModule(module), TEST_FIGHTER);
  const forced = accepted(
    loud,
    loud.createSession(),
    { type: "force", doorId: "warped-door" },
    steady(1),
  );
  assert.match(
    renderFifthResult(forced),
    /The alarm is raised by forcing the Warped Door \(failure by 5 or more\)\./u,
  );
  const searched = accepted(
    loud,
    loud.createSession(),
    { type: "search", roomId: "stair-foot" },
    steady(20, 20),
  );
  const disarmed = accepted(
    loud,
    searched.state,
    { type: "disarm", trapId: "tin-wire" },
    steady(1),
  );
  assert.match(
    renderFifthResult(disarmed),
    /The alarm is raised by disarming the Tin Wire \(failure by 5 or more\)\./u,
  );
});

// The balance harness and the gate.

test("every always-fail run raises the alarm at the crates, takes the crawl and meets the lookout", () => {
  const failing = createFifthRuntime(alarmTunnels, TEST_FIGHTER, {
    checks: "always-fail",
  });
  for (const style of ["direct", "cautious", "avoid-optional"]) {
    for (const seed of [0, 1, 2]) {
      const run = playAdventure(failing, style, seed);
      const where = `${style} ${seed}`;
      assert.equal(
        run.alarm,
        "examining the Stacked Crates (failure by 5 or more)",
        where,
      );
      // The grate is down, so the way to the cellar is the crawl.
      const alcove = run.roomIds.indexOf("alcove");
      assert.ok(
        alcove > 0 && alcove < run.roomIds.indexOf("rat-cellar"),
        `${where}: ${run.roomIds.join(" > ")}`,
      );
      // The lookout has left its post for the landing.
      if (run.roomIds.includes("landing")) {
        assert.ok(
          run.encounters.some(({ id }) => id === "lookout"),
          where,
        );
      }
    }
  }
});

test("seeded runs meet the alarm too: raised in the cellar's fight, the lookout waits on the landing", () => {
  const raisedInFight = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((seed) => playAdventure(runtime, "cautious", seed))
    .filter(({ alarm }) =>
      alarm?.startsWith("the fight in the Rat-Gnawed Cellar"),
    );
  assert.ok(raisedInFight.length > 0);
  for (const run of raisedInFight) {
    if (run.roomIds.includes("landing")) {
      assert.ok(run.encounters.some(({ id }) => id === "lookout"));
    }
  }
});

test("the gate's report names the runs that raised the alarm, judging none of it", () => {
  const options = {
    seeds: [0, 1, 2, 3],
    reportStealth: false,
    reportRetreat: false,
    reportUseRoom: false,
    reportReactions: false,
  };
  const result = gateAdventure(alarmTunnels, options);
  assert.equal(result.ok, true);
  const { alarm } = result.verdict;
  assert.deepEqual(alarm.runs, { seeded: 12, "always-fail": 12 });
  const failing = alarm.raised.filter(({ checks }) => checks === "always-fail");
  assert.equal(failing.length, 12);
  assert.ok(
    alarm.raised.some(({ checks }) => checks === "seeded"),
    JSON.stringify(alarm.raised),
  );
  const text = renderGateResult(alarmTunnels, result);
  assert.match(
    text,
    /\n {2}Alarm, reported \(not judged\): the level 1, 5th percentile Fighter playing cautious raised it in \d+ of 12 seeded runs and 12 of 12 always-fail runs: /u,
  );
  assert.match(
    text,
    /always-fail mace level 1, by examining the Stacked Crates \(failure by 5 or more\), seeds 0–3/u,
  );
  // A module without an alarm has no such report.
  const quiet = gateAdventure(rousedTunnels, options);
  assert.equal(quiet.verdict.alarm, undefined);
  assert.doesNotMatch(renderGateResult(rousedTunnels, quiet), /Alarm/u);
});
