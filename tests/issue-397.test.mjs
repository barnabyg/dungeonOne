// #397: flags that open and close passages. A module declares named flags,
// which only ever turn on (D3). A check band's `set` effect, an encounter's
// outcome (won, bypassed, ended peacefully, fled from), taking an item,
// first entering a room and examining a feature each set one. A passage may
// be open only once a flag is set (`openWhen`) or closed once one is
// (`closeWhen`), and a circumstance may name a flag. The validator grows the
// rooms reached and the flags set together, and refuses flags nothing sets
// or uses, unknown flags, an essential room behind a flag only a check sets
// and a flag that can close off every exit. The harness goes where a flag
// its route needs is set. Adventure 33, session 55, trace 49.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { playAdventure, requiredPath } from "../dist/balance-5e.js";
import {
  FIFTH_FLAG_DM_CASES,
  loadFifthFlagEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
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
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  fleeingCellarFile,
  moduleFile,
  ratRunFile,
  room,
  waryTunnelsFile,
  winchTunnels,
  winchTunnelsFile,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });

/** The action accepted, with `rolls` queued (not all need be drawn). */
function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

const exitTo = (runtime, state, roomId) =>
  runtime.projectRoom(state).exits.find(({ id }) => id === roomId);

/**
 * `base`'s JSON with flag `flag` declared and used: a passage from the stair
 * foot to a Nook, open only once it is set (or, with `closing`, closed once
 * it is). `setter` makes something in it set the flag.
 */
function nookFile(base, flag, setter, closing = false) {
  const module = structuredClone(base);
  module.flags = [flag];
  module.rooms.push({
    id: "nook",
    name: "Nook",
    description: "A dry nook in the rock.",
    features: [],
    items: [],
  });
  module.passages.push({
    id: "stair-to-nook",
    between: ["stair-foot", "nook"],
    description: "A narrow gap.",
    [closing ? "closeWhen" : "openWhen"]: flag,
  });
  setter(module);
  return module;
}

const nook = (...args) => validateModule(nookFile(...args));

test("the formats bump; the prompt does not change", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 42);
  assert.equal(FIFTH_SESSION_FORMAT, 62);
  assert.equal(FIFTH_TRACE_FORMAT, 56);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v44");
});

// The validator.

test("a module declares its flags; passages, features and the rest name them", () => {
  assert.deepEqual(winchTunnels.flags, ["portcullis-raised"]);
  const down = winchTunnels.passages.find(({ id }) => id === "stair-to-cellar");
  assert.equal(down.openWhen, "portcullis-raised");
  assert.equal(
    room(winchTunnels, "alcove").features.find(
      ({ id }) => id === "rusted-winch",
    ).sets,
    "portcullis-raised",
  );
  // A module without flags has none.
  assert.equal("flags" in validateModule(moduleFile("rat-tunnels")), false);
});

test("the validator refuses a flag nothing sets, nothing uses, or declared twice", () => {
  const unset = structuredClone(winchTunnelsFile);
  delete room(unset, "alcove").features.at(-1).sets;
  assert.throws(
    () => validateModule(unset),
    /flag portcullis-raised is never set: a band, an encounter, an item, a room or a feature must set it\./u,
  );
  const unused = structuredClone(winchTunnelsFile);
  delete unused.passages.find(({ id }) => id === "stair-to-cellar").openWhen;
  assert.throws(
    () => validateModule(unused),
    /flag portcullis-raised is never used: a passage, a circumstance, an encounter, a feature or a topic must name it, or leave it out\./u,
  );
  const twice = structuredClone(winchTunnelsFile);
  twice.flags.push("portcullis-raised");
  assert.throws(
    () => validateModule(twice),
    /flag portcullis-raised is declared twice\./u,
  );
});

test("the validator refuses an unknown flag wherever one is named", () => {
  const cases = [
    [
      (module) =>
        (module.passages.find(({ id }) => id === "stair-to-cellar").openWhen =
          "no-such-flag"),
      /passage stair-to-cellar names unknown flag no-such-flag\./u,
    ],
    [
      (module) =>
        (room(module, "alcove").features.at(-1).sets = "no-such-flag"),
      /feature rusted-winch names unknown flag no-such-flag\./u,
    ],
    [
      (module) => (room(module, "den").sets = "no-such-flag"),
      /room den names unknown flag no-such-flag\./u,
    ],
    [
      (module) => (room(module, "alcove").items[0].sets = "no-such-flag"),
      /item healing-potion names unknown flag no-such-flag\./u,
    ],
    [
      (module) => (module.encounters[0].sets = { fled: "no-such-flag" }),
      /encounter cellar-rat's fled names unknown flag no-such-flag\./u,
    ],
    [
      (module) =>
        (room(module, "stair-foot").features[0].check = {
          skill: "investigation",
          dc: 10,
          advantage: [{ type: "flag", flag: "no-such-flag", name: "Lit" }],
        }),
      /advantage 1 names unknown flag no-such-flag\./u,
    ],
    [
      (module) =>
        (room(module, "stair-foot").features[0].check = {
          skill: "investigation",
          dc: 10,
          bands: {
            success: { effects: [{ type: "set", flag: "no-such-flag" }] },
          },
        }),
      /success band names unknown flag no-such-flag\./u,
    ],
  ];
  for (const [change, message] of cases) {
    const module = structuredClone(winchTunnelsFile);
    change(module);
    assert.throws(() => validateModule(module), message, String(message));
  }
  // An encounter's sets names at least one outcome, and only outcomes.
  for (const sets of [{}, { lost: "portcullis-raised" }]) {
    const module = structuredClone(winchTunnelsFile);
    module.encounters[0].sets = sets;
    assert.throws(() => validateModule(module), /encounter 1 sets/u);
  }
});

test("a hidden passage can't wait on a flag, nor open and close on one", () => {
  const hidden = structuredClone(winchTunnelsFile);
  hidden.passages.find(({ id }) => id === "stair-to-cellar").hidden = true;
  assert.throws(
    () => validateModule(hidden),
    /is hidden and has openWhen: a band opens a hidden passage, a flag one already there to see\./u,
  );
  const both = structuredClone(winchTunnelsFile);
  both.passages.find(({ id }) => id === "stair-to-cellar").closeWhen =
    "portcullis-raised";
  assert.throws(
    () => validateModule(both),
    /opens and closes on the same flag\./u,
  );
});

test("an essential room reachable only through a flag only a check sets is refused", () => {
  // The winch must be heaved round (Athletics DC 10): only a success sets
  // the flag, so the den's fight may never be reached.
  const module = structuredClone(winchTunnelsFile);
  const winch = room(module, "alcove").features.at(-1);
  delete winch.sets;
  winch.check = {
    skill: "athletics",
    dc: 10,
    bands: {
      success: { effects: [{ type: "set", flag: "portcullis-raised" }] },
    },
  };
  assert.throws(
    () => validateModule(module),
    /room den is essential, but every route to it needs a check or passes a trap \(stair-to-cellar, which opens only once flag portcullis-raised is set\)\./u,
  );
  // A flag every band sets is as sure as examining.
  winch.check.bands.failure = {
    effects: [{ type: "set", flag: "portcullis-raised" }],
  };
  assert.doesNotThrow(() => validateModule(module));
});

test("the flags set and the rooms reached grow together until neither changes", () => {
  // A second flag, set in the cellar (behind the first), opens the way to
  // the den: reached only once the first flag lets the character in.
  const module = structuredClone(winchTunnelsFile);
  module.flags.push("den-unbarred");
  room(module, "rat-cellar").features[0].sets = "den-unbarred";
  module.passages.find(({ id }) => id === "cellar-to-den").openWhen =
    "den-unbarred";
  assert.doesNotThrow(() => validateModule(module));
  // Set only in the den, it could never be set before reaching it.
  room(module, "rat-cellar").features[0].sets = undefined;
  delete room(module, "rat-cellar").features[0].sets;
  room(module, "den").sets = "den-unbarred";
  assert.throws(
    () => validateModule(module),
    /room den is essential, but every route to it needs a check or passes a trap \(cellar-to-den, which opens only once flag den-unbarred is set\)\./u,
  );
});

test("an encounter's flag is sure only if every final outcome it can reach sets it", () => {
  // The Wary Tunnels' rat may let the character pass (#304): a way out that
  // opens only once it is beaten may never open, and the character is
  // stranded.
  const wary = structuredClone(waryTunnelsFile);
  wary.flags = ["rat-dead"];
  wary.encounters[0].sets = { won: "rat-dead" };
  wary.passages.find(({ id }) => id === "cellar-to-den").openWhen = "rat-dead";
  assert.throws(
    () => validateModule(wary),
    /every exit needs a check or passes a trap; one must be free to reach\./u,
  );
  // Ending it peacefully sets the flag too: it is sure.
  wary.encounters[0].sets.peaceful = "rat-dead";
  assert.doesNotThrow(() => validateModule(wary));
  // The Rat Run's rat can be slipped past (#302), but a fight slipped past
  // is met again on coming back, so winning it is still sure.
  const run = structuredClone(ratRunFile);
  run.flags = ["rat-dead"];
  run.encounters[0].sets = { won: "rat-dead" };
  run.passages.find(({ id }) => id === "cellar-to-den").openWhen = "rat-dead";
  assert.doesNotThrow(() => validateModule(run));
});

test("a flag-closed passage that can cut off every exit is refused", () => {
  // The Rat Run's way out is the den: a cave-in set on entering the cellar
  // closes the only way there.
  const module = structuredClone(ratRunFile);
  module.flags = ["cave-in"];
  room(module, "rat-cellar").sets = "cave-in";
  module.passages.find(({ id }) => id === "cellar-to-den").closeWhen =
    "cave-in";
  assert.throws(
    () => validateModule(module),
    /flag cave-in closes passage cellar-to-den, which can cut off every exit room\./u,
  );
  // Closing a way to a dead end is fine.
  assert.doesNotThrow(() =>
    nook(
      ratRunFile,
      "cave-in",
      (file) => (room(file, "rat-cellar").sets = "cave-in"),
      true,
    ),
  );
});

// The runtime: each trigger.

test("examining a feature sets its flag, which opens a way elsewhere", () => {
  const runtime = createFifthRuntime(winchTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.deepEqual(start.flags, []);
  // The portcullis is down: the way shows, closed, and is refused.
  assert.equal(exitTo(runtime, start, "rat-cellar").route, "closed");
  const refused = runtime.handleAction(start, MOVE("rat-cellar"));
  assert.equal(refused.rejection.code, "route-closed");
  const alcove = accepted(runtime, start, MOVE("alcove")).state;
  const pulled = accepted(runtime, alcove, EXAMINE("rusted-winch"));
  assert.deepEqual(pulled.state.flags, ["portcullis-raised"]);
  assert.deepEqual(pulled.events.at(-1), {
    type: "route",
    passageId: "stair-to-cellar",
    change: "opened",
    rooms: ["Foot of the Stair", "Rat-Gnawed Cellar"],
  });
  assert.match(
    renderFifthResult(pulled),
    /The way between the Foot of the Stair and the Rat-Gnawed Cellar is open\./u,
  );
  // Examining it again sets nothing new and says nothing more.
  const again = accepted(runtime, pulled.state, EXAMINE("rusted-winch"));
  assert.deepEqual(again.state.flags, ["portcullis-raised"]);
  assert.ok(!again.events.some(({ type }) => type === "route"));
  const back = accepted(runtime, pulled.state, MOVE("stair-foot")).state;
  assert.equal(exitTo(runtime, back, "rat-cellar").route, "open-now");
  const inside = accepted(runtime, back, MOVE("rat-cellar"), 20, 1).state;
  assert.equal(inside.roomId, "rat-cellar");
});

test("first entering a room sets its flag; the start room's is set at the start", () => {
  const module = nook(
    moduleFile("rat-tunnels"),
    "alcove-seen",
    (file) => (room(file, "alcove").sets = "alcove-seen"),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.equal(exitTo(runtime, start, "nook").route, "closed");
  const entered = accepted(runtime, start, MOVE("alcove"));
  assert.deepEqual(entered.state.flags, ["alcove-seen"]);
  assert.equal(
    entered.events.find(({ type }) => type === "route").passageId,
    "stair-to-nook",
  );
  // A start room's flag is set as the adventure begins.
  const atStart = createFifthRuntime(
    nook(
      moduleFile("rat-tunnels"),
      "begun",
      (file) => (room(file, "stair-foot").sets = "begun"),
    ),
    TEST_FIGHTER,
  );
  assert.deepEqual(atStart.createSession().flags, ["begun"]);
});

test("taking an item sets its flag", () => {
  const module = nook(
    moduleFile("rat-tunnels"),
    "potion-taken",
    (file) => (room(file, "alcove").items[0].sets = "potion-taken"),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  let state = accepted(runtime, runtime.createSession(), MOVE("alcove")).state;
  state = accepted(runtime, state, EXAMINE("iron-chest")).state;
  assert.deepEqual(state.flags, []);
  state = accepted(runtime, state, {
    type: "take",
    itemId: "healing-potion",
  }).state;
  assert.deepEqual(state.flags, ["potion-taken"]);
});

test("a check's band sets its flag", () => {
  const file = structuredClone(winchTunnelsFile);
  const winch = room(file, "alcove").features.at(-1);
  delete winch.sets;
  // Every band sets it, so the den stays sure; the failure says so.
  winch.check = {
    skill: "athletics",
    dc: 10,
    bands: {
      failure: {
        text: "The winch slips, and the portcullis crashes up.",
        effects: [{ type: "set", flag: "portcullis-raised" }],
      },
      success: { effects: [{ type: "set", flag: "portcullis-raised" }] },
    },
  };
  const runtime = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const alcove = accepted(
    runtime,
    runtime.createSession(),
    MOVE("alcove"),
  ).state;
  const failed = accepted(runtime, alcove, EXAMINE("rusted-winch"), 2);
  assert.equal(failed.state.checks.at(-1).band, "failure");
  assert.deepEqual(failed.state.flags, ["portcullis-raised"]);
});

test("an encounter won sets its flag", () => {
  const module = nook(
    moduleFile("rat-tunnels"),
    "rat-dead",
    (file) => (file.encounters[0].sets = { won: "rat-dead" }),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  // Initiative: Ada 20, the rat 1; the rat is down to 1 HP.
  const fight = accepted(
    runtime,
    runtime.createSession(),
    MOVE("rat-cellar"),
    20,
    1,
  ).state;
  const weak = {
    ...fight,
    encounter: {
      ...fight.encounter,
      combatants: fight.encounter.combatants.map((entrant) =>
        entrant.id === "giant-rat" ? { ...entrant, hp: 1 } : entrant,
      ),
    },
  };
  assert.deepEqual(weak.flags, []);
  const won = accepted(
    runtime,
    weak,
    { type: "attack", actorId: "pc", targetId: "giant-rat" },
    19,
    6,
    6,
    6,
  ).state;
  assert.deepEqual(won.clearedEncounterIds, ["cellar-rat"]);
  assert.deepEqual(won.flags, ["rat-dead"]);
});

test("an encounter slipped past sets its flag", () => {
  const module = nook(
    ratRunFile,
    "rat-dodged",
    (file) => (file.encounters[0].sets = { bypassed: "rat-dodged" }),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  // Stealth d20 12 + 2 = 14 against the rat's passive Perception 10.
  const unseen = accepted(
    runtime,
    runtime.createSession(),
    { type: "sneak", destinationId: "rat-cellar" },
    12,
  ).state;
  assert.deepEqual(unseen.flags, []);
  const past = accepted(runtime, unseen, MOVE("den")).state;
  assert.deepEqual(past.bypassedEncounterIds, ["cellar-rat"]);
  assert.deepEqual(past.flags, ["rat-dodged"]);
});

test("an encounter ended peacefully sets its flag", () => {
  const module = nook(
    waryTunnelsFile,
    "rat-calmed",
    (file) => (file.encounters[0].sets = { peaceful: "rat-calmed" }),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  // Reaction 2d6 (3 + 4) − 1 = 6: uncertain, so Ada may pass.
  const facing = accepted(
    runtime,
    runtime.createSession(),
    MOVE("rat-cellar"),
    3,
    4,
  ).state;
  const passed = accepted(runtime, facing, {
    type: "react",
    option: "let-pass",
  }).state;
  assert.deepEqual(passed.peacefulEncounterIds, ["cellar-rat"]);
  assert.deepEqual(passed.flags, ["rat-calmed"]);
});

test("an encounter the character flees sets its flag", () => {
  const module = nook(
    fleeingCellarFile,
    "rat-fled",
    (file) => (file.encounters[0].sets = { fled: "rat-fled" }),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  // Initiative: Ada 20, the rat and the Zombie 1; both miss as she flees.
  const fight = accepted(
    runtime,
    runtime.createSession(),
    MOVE("rat-cellar"),
    20,
    1,
    1,
  ).state;
  const fled = accepted(
    runtime,
    fight,
    { type: "flee", destinationId: "stair-foot" },
    2,
    2,
  );
  assert.equal(fled.state.roomId, "stair-foot");
  assert.deepEqual(fled.state.flags, ["rat-fled"]);
  // The way to the nook, from the room fled into, opens.
  assert.deepEqual(fled.events.at(-1), {
    type: "route",
    passageId: "stair-to-nook",
    change: "opened",
    rooms: ["Nook"],
  });
});

test("a flag closes a passage for the rest of the adventure", () => {
  const module = nook(
    moduleFile("rat-tunnels"),
    "nook-collapsed",
    (file) => (room(file, "alcove").sets = "nook-collapsed"),
    true,
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.equal(exitTo(runtime, start, "nook").route, undefined);
  const alcove = accepted(runtime, start, MOVE("alcove"));
  assert.deepEqual(alcove.events.at(-1), {
    type: "route",
    passageId: "stair-to-nook",
    change: "closed",
    rooms: ["Foot of the Stair", "Nook"],
  });
  const back = accepted(runtime, alcove.state, MOVE("stair-foot")).state;
  assert.equal(exitTo(runtime, back, "nook").route, "closed");
  assert.equal(
    runtime.handleAction(back, MOVE("nook")).rejection.code,
    "route-closed",
  );
  assert.match(
    runtime
      .projectDmScene(back)
      .room.exits.find(({ destinationId }) => destinationId === "nook").name,
    /The way is closed\.\)$/u,
  );
});

test("a flag circumstance gives a check advantage once it is set", () => {
  const file = structuredClone(winchTunnelsFile);
  // The lantern by the stair, studied with the portcullis up.
  room(file, "stair-foot").features[0].check = {
    skill: "investigation",
    dc: 10,
    advantage: [
      { type: "flag", flag: "portcullis-raised", name: "Light from below" },
    ],
  };
  const runtime = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const start = runtime.createSession();
  const plain = accepted(runtime, start, EXAMINE("rusted-lantern"), 7);
  assert.equal(plain.state.checks.length, 1);
  assert.doesNotMatch(renderFifthResult(plain), /Light from below/u);
  let state = accepted(runtime, start, MOVE("alcove")).state;
  state = accepted(runtime, state, EXAMINE("rusted-winch")).state;
  state = accepted(runtime, state, MOVE("stair-foot")).state;
  const lit = accepted(runtime, state, EXAMINE("rusted-lantern"), 7, 15);
  assert.match(renderFifthResult(lit), /Light from below/u);
});

// The AI DM's scene.

test("the AI DM's scene says which ways a flag opened or keeps closed", () => {
  const runtime = createFifthRuntime(winchTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  const way = (state) =>
    runtime
      .projectDmScene(state)
      .room.exits.find(({ destinationId }) => destinationId === "rat-cellar")
      .name;
  assert.equal(
    way(start),
    "Rat-Gnawed Cellar (The passage, sloping down to an iron portcullis. The way is closed.)",
  );
  const opened = { ...start, flags: ["portcullis-raised"] };
  assert.equal(
    way(opened),
    "Rat-Gnawed Cellar (The passage, sloping down to an iron portcullis. This way has opened.)",
  );
  // No tool takes a flag.
  for (const { parameters } of runtime.getGameToolDefinitions(opened)) {
    assert.ok(!JSON.stringify(parameters).includes("flag"));
  }
});

test("the flag evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthFlagEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  // The rat cage's gate is for fleeing where no way is open (#396).
  assert.deepEqual(adventure.flags, ["portcullis-raised", "cage-gate-dropped"]);
  for (const sample of FIFTH_FLAG_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_FLAG_DM_CASES,
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
      FIFTH_FLAG_DM_CASES.map((sample) => [
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

test("a reload restores the flags by replaying the actions, and a trace records them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-397-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      3,
      winchTunnels,
      TEST_FIGHTER,
    );
    const run = new FifthTraceRun(created);
    const click = (action) => {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
      return result;
    };
    click(MOVE("alcove"));
    click(EXAMINE("rusted-winch"));
    click(MOVE("stair-foot"));
    assert.deepEqual(run.session.state.flags, ["portcullis-raised"]);
    await run.session.persist();
    const loaded = await FifthSession.load(path, [winchTunnels]);
    assert.deepEqual(loaded.state.flags, ["portcullis-raised"]);
    assert.deepEqual(loaded.state, run.session.state);
    assert.deepEqual(run.trace.turns.at(-1).stateAfter.flags, [
      "portcullis-raised",
    ]);

    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [winchTunnels]);
    assert.deepEqual(replayed.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The balance harness.

test("the harness goes to set the flag its route needs, then goes through", () => {
  // The required path goes by the alcove, where the winch is.
  assert.deepEqual(requiredPath(winchTunnels).roomIds, [
    "stair-foot",
    "alcove",
    "rat-cellar",
    "den",
  ]);
  const runtime = createFifthRuntime(winchTunnels, TEST_FIGHTER);
  for (const style of ["direct", "cautious", "avoid-optional"]) {
    for (const seed of [0, 1, 2]) {
      const run = playAdventure(runtime, style, seed);
      const alcove = run.roomIds.indexOf("alcove");
      assert.ok(alcove > 0, `${style} ${seed}`);
      assert.ok(
        run.roomIds.indexOf("rat-cellar") > alcove,
        `${style} ${seed}: ${run.roomIds.join(" > ")}`,
      );
    }
  }
});

test("the harness wins the fight whose flag its route needs", () => {
  // The den's way opens only once the rat's fight is won.
  const file = moduleFile("rat-tunnels");
  file.flags = ["rat-dead"];
  file.encounters[0].sets = { won: "rat-dead" };
  file.passages.find(({ id }) => id === "cellar-to-den").openWhen = "rat-dead";
  const module = validateModule(file);
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  const runs = [0, 1, 2, 3].map((seed) =>
    playAdventure(runtime, "cautious", seed),
  );
  assert.ok(runs.some(({ roomIds }) => roomIds.includes("den")));
  for (const run of runs) {
    if (run.roomIds.includes("den")) {
      assert.equal(run.encounters[0].id, "cellar-rat");
      assert.equal(run.encounters[0].outcome, "victory");
    }
  }
});

test("the harness goes back to set a flag in a room it slipped through", () => {
  // The Rat Run with its way out moved to a hatch past the den, unbarred by
  // examining the gnawed sacks in the rat's cellar. The stealth-first run
  // slips past the rat to look into the den first, leaving the sacks
  // unexamined: it must go back to the cellar for the flag.
  const file = structuredClone(ratRunFile);
  file.flags = ["hatch-unbarred"];
  room(file, "rat-cellar").features[0].sets = "hatch-unbarred";
  delete room(file, "den").exit;
  file.rooms.push({
    id: "hatch",
    name: "Hatch",
    description: "A trapdoor opens onto the hillside.",
    features: [],
    items: [],
    exit: true,
  });
  file.passages.push({
    id: "den-to-hatch",
    between: ["den", "hatch"],
    description: "A ladder up to a barred hatch.",
    openWhen: "hatch-unbarred",
  });
  const runtime = createFifthRuntime(validateModule(file), TEST_FIGHTER);
  const runs = [0, 1, 2, 3, 4, 5].map((seed) =>
    playAdventure(runtime, "stealth-first", seed),
  );
  // Some run slipped past the rat and still got out by the hatch.
  assert.ok(
    runs.some(
      ({ bypassed, outcome, encounters }) =>
        bypassed > 0 &&
        outcome === "escape-without-loot" &&
        encounters.some(({ id }) => id === "cellar-rat"),
    ),
  );
  for (const { roomIds, outcome } of runs) {
    assert.ok(
      outcome === "defeat" ||
        (outcome === "escape-without-loot" && roomIds.includes("hatch")),
      `${outcome}: ${roomIds.join(" > ")}`,
    );
  }
});
