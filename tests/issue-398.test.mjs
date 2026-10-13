// #398: encounters that appear, vanish or move with flags. An encounter may
// be in its room only once a flag is set (`presentWhile`), only until one
// is (`presentUntil`), or in another room once one is (`movesTo`). Only an
// encounter not yet met moves: one sneaked up on, fought, slipped past or
// fled from stays where it was met. A fight a flag places in the
// character's room comes in and begins at once. The validator refuses an
// unknown room, two encounters that may share a room, and a fight placed
// where it can't be counted on when its flag is the only way on. The
// harness and gate play a fight a flag moves onto the required path.
// Adventure 35, session 56, trace 50.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  playAdventure,
  requiredPath,
} from "../dist/balance-5e.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT, FifthTraceRun } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  moduleFile,
  ratRunFile,
  room,
  rousedTunnels,
  rousedTunnelsFile,
  waryTunnelsFile,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const SNEAK = (destinationId) => ({ type: "sneak", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });

function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/**
 * The rat tunnels with the flag `alarm`, which knocking the rusted lantern
 * at the foot of the stair down sets, placing the cellar's Giant Rat as
 * `place` says. `change` may change the module further.
 */
function alarmedFile(place, change = () => {}) {
  const module = moduleFile("rat-tunnels");
  module.flags = ["alarm"];
  room(module, "stair-foot").features[0].sets = "alarm";
  Object.assign(module.encounters[0], place);
  change(module);
  return module;
}
const alarmed = (place, change) => validateModule(alarmedFile(place, change));

/** The state once the lantern is knocked down at the start. */
const sounded = (runtime) =>
  accepted(runtime, runtime.createSession(), EXAMINE("rusted-lantern"));

const sneakable = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === "sneak" && available)
    .map(({ target }) => target.id);

test("the formats bump", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 38);
  assert.equal(FIFTH_SESSION_FORMAT, 59);
  assert.equal(FIFTH_TRACE_FORMAT, 53);
});

// The validator.

test("an encounter's placement is read", () => {
  const moving = alarmed({ movesTo: { roomId: "alcove", when: "alarm" } });
  assert.deepEqual(moving.encounters[0].movesTo, {
    roomId: "alcove",
    when: "alarm",
  });
  assert.equal(
    alarmed({ presentWhile: "alarm" }).encounters[0].presentWhile,
    "alarm",
  );
  assert.equal(
    alarmed({ presentUntil: "alarm" }).encounters[0].presentUntil,
    "alarm",
  );
});

test("the validator refuses an encounter placed in an unknown room or its own", () => {
  assert.throws(
    () => alarmed({ movesTo: { roomId: "attic", when: "alarm" } }),
    /encounter cellar-rat moves to unknown room attic\./u,
  );
  assert.throws(
    () => alarmed({ movesTo: { roomId: "rat-cellar", when: "alarm" } }),
    /encounter cellar-rat moves to room rat-cellar, which is already its own\./u,
  );
});

test("the validator refuses an unknown flag, or more than one placement", () => {
  assert.throws(
    () => alarmed({ presentWhile: "no-such-flag" }),
    /encounter cellar-rat names unknown flag no-such-flag\./u,
  );
  assert.throws(
    () =>
      alarmed({
        presentWhile: "alarm",
        movesTo: { roomId: "alcove", when: "alarm" },
      }),
    /may have only one of presentWhile, presentUntil and movesTo\./u,
  );
});

test("the validator refuses two encounters that may share a room", () => {
  // The rat moving into the goblin's den would share it with him.
  assert.throws(
    () => alarmed({ movesTo: { roomId: "den", when: "alarm" } }),
    /room den may hold encounters cellar-rat and den-goblin at once; only one fight waits in a room\./u,
  );
  // Even when one is there only until the flag the other waits for: a fight
  // met before the flag is set stays.
  const shared = alarmedFile({ presentUntil: "alarm" }, (module) => {
    module.encounters.push({
      ...structuredClone(module.encounters[0]),
      id: "second-rat",
      presentWhile: "alarm",
    });
    delete module.encounters.at(-1).presentUntil;
    module.encounters.at(-1).opponents[0].id = "second-giant-rat";
    module.encounters.at(-1).movesTo = { roomId: "rat-cellar", when: "alarm" };
    delete module.encounters.at(-1).presentWhile;
    room(module, "alcove").encounterId = "second-rat";
  });
  assert.throws(
    () => validateModule(shared),
    /room rat-cellar may hold encounters second-rat and cellar-rat at once/u,
  );
});

test("the encounter that wins the adventure, and the wandering one, stay put", () => {
  const file = moduleFile("rat-tunnels");
  file.flags = ["alarm"];
  room(file, "stair-foot").features[0].sets = "alarm";
  file.encounters[1].presentWhile = "alarm";
  assert.throws(
    () => validateModule(file),
    /encounter den-goblin ends the adventure in victory, so it can't appear, vanish or move\./u,
  );
});

test("a moving fight whose new room cuts off every exit is refused, naming it", () => {
  // The Rat Run, whose den is the way out: the door to it opens only once
  // the rat is dead. Moved into the den by the lantern's alarm, the rat is
  // behind the very door its death opens.
  const file = structuredClone(ratRunFile);
  file.flags = ["rat-dead"];
  file.encounters[0].sets = { won: "rat-dead" };
  file.passages.find(({ id }) => id === "cellar-to-den").openWhen = "rat-dead";
  assert.doesNotThrow(() => validateModule(file));
  file.flags.push("alarm");
  room(file, "stair-foot").features[0].sets = "alarm";
  file.encounters[0].movesTo = { roomId: "den", when: "alarm" };
  assert.throws(
    () => validateModule(file),
    /encounter cellar-rat can cut off every exit: once flag alarm is set it moves to room den, where it may never be met, so flag rat-dead its fight sets is never set for sure\./u,
  );
  // A fight that vanishes may be gone first.
  delete file.encounters[0].movesTo;
  file.encounters[0].presentUntil = "alarm";
  assert.throws(
    () => validateModule(file),
    /encounter cellar-rat can cut off every exit: it vanishes once flag alarm is set/u,
  );
});

test("a moving fight met wherever it is still counts", () => {
  // Moved into the alcove, the rat is met in the cellar or the alcove,
  // both reached for sure: its flag still opens the den.
  const file = moduleFile("rat-tunnels");
  file.flags = ["rat-dead", "alarm"];
  room(file, "stair-foot").features[0].sets = "alarm";
  file.encounters[0].sets = { won: "rat-dead" };
  file.encounters[0].movesTo = { roomId: "alcove", when: "alarm" };
  file.passages.find(({ id }) => id === "cellar-to-den").openWhen = "rat-dead";
  assert.doesNotThrow(() => validateModule(file));
});

// The runtime.

test("an encounter moves once its flag is set: the Sneak control and the fight follow it", () => {
  const runtime = createFifthRuntime(
    alarmed({ movesTo: { roomId: "alcove", when: "alarm" } }),
    TEST_FIGHTER,
  );
  const start = runtime.createSession();
  assert.deepEqual(sneakable(runtime, start), ["rat-cellar"]);
  const after = sounded(runtime).state;
  assert.deepEqual(after.flags, ["alarm"]);
  assert.deepEqual(sneakable(runtime, after), ["alcove"]);
  // The cellar is empty now; the rat waits in the alcove.
  const cellar = accepted(runtime, after, MOVE("rat-cellar")).state;
  assert.equal(cellar.encounter, undefined);
  assert.equal(
    runtime.projectDmScene(cellar).combatStatus,
    "There is no fight here.",
  );
  const alcove = accepted(runtime, after, MOVE("alcove"), 20, 1);
  assert.equal(alcove.state.encounter.outcome, "ongoing");
  assert.match(renderFifthResult(alcove), /A rat the size of a dog/u);
  assert.deepEqual(
    runtime.projectDmScene(alcove.state).room.opponents.map(({ id }) => id),
    ["giant-rat"],
  );
  assert.deepEqual(alcove.state.metEncounters, [
    { encounterId: "cellar-rat", roomId: "alcove" },
  ]);
});

test("an encounter appears once its flag is set, and another vanishes", () => {
  const appearing = createFifthRuntime(
    alarmed({ presentWhile: "alarm" }),
    TEST_FIGHTER,
  );
  const before = accepted(
    appearing,
    appearing.createSession(),
    MOVE("rat-cellar"),
  ).state;
  assert.equal(before.encounter, undefined);
  const back = accepted(appearing, before, MOVE("stair-foot")).state;
  const sounding = accepted(appearing, back, EXAMINE("rusted-lantern")).state;
  const met = accepted(appearing, sounding, MOVE("rat-cellar"), 20, 1).state;
  assert.equal(met.encounter.outcome, "ongoing");

  const vanishing = createFifthRuntime(
    alarmed({ presentUntil: "alarm" }),
    TEST_FIGHTER,
  );
  assert.deepEqual(sneakable(vanishing, vanishing.createSession()), [
    "rat-cellar",
  ]);
  const gone = sounded(vanishing).state;
  assert.deepEqual(sneakable(vanishing, gone), []);
  const empty = accepted(vanishing, gone, MOVE("rat-cellar")).state;
  assert.equal(empty.encounter, undefined);
});

test("an encounter already met does not move", () => {
  const runtime = createFifthRuntime(
    alarmed({ movesTo: { roomId: "alcove", when: "alarm" } }),
    TEST_FIGHTER,
  );
  const start = runtime.createSession();
  // Sneak in unseen (a 20), and slip out past the rat.
  const unseen = accepted(runtime, start, SNEAK("rat-cellar"), 20).state;
  assert.equal(unseen.unseenBy, "cellar-rat");
  const out = accepted(runtime, unseen, MOVE("stair-foot")).state;
  assert.deepEqual(out.bypassedEncounterIds, ["cellar-rat"]);
  assert.deepEqual(out.metEncounters, [
    { encounterId: "cellar-rat", roomId: "rat-cellar" },
  ]);
  const after = accepted(runtime, out, EXAMINE("rusted-lantern")).state;
  assert.deepEqual(after.flags, ["alarm"]);
  // It is still in the cellar, not the alcove.
  const alcove = accepted(runtime, after, MOVE("alcove")).state;
  assert.equal(alcove.encounter, undefined);
  const back = accepted(runtime, alcove, MOVE("stair-foot")).state;
  const cellar = accepted(runtime, back, MOVE("rat-cellar"), 20, 1).state;
  assert.equal(cellar.encounter.outcome, "ongoing");
});

test("a moved encounter keeps its lurking and its reaction", () => {
  const lurking = createFifthRuntime(
    alarmed({ movesTo: { roomId: "alcove", when: "alarm" }, lurking: true }),
    TEST_FIGHTER,
  );
  const lurked = accepted(
    lurking,
    sounded(lurking).state,
    MOVE("alcove"),
    1,
    20,
    1,
  );
  assert.ok(lurked.events.some(({ type }) => type === "lurk"));
  assert.deepEqual(
    lurked.state.lurks.map(({ encounterId }) => encounterId),
    ["cellar-rat"],
  );

  const wary = structuredClone(waryTunnelsFile);
  wary.flags = ["alarm"];
  room(wary, "stair-foot").features[0].sets = "alarm";
  wary.encounters[0].movesTo = { roomId: "alcove", when: "alarm" };
  const reacting = createFifthRuntime(validateModule(wary), TEST_FIGHTER);
  // A friendly 12 on the reaction roll: the rat only lets the character pass.
  const reacted = accepted(
    reacting,
    sounded(reacting).state,
    MOVE("alcove"),
    6,
    6,
  );
  const reaction = reacted.events.find(({ type }) => type === "reaction");
  assert.equal(reaction.encounterId, "cellar-rat");
  assert.equal(reacted.state.reactingTo, "cellar-rat");
});

test("a fight a flag places in the character's room comes in at once", () => {
  const runtime = createFifthRuntime(
    alarmed({ movesTo: { roomId: "stair-foot", when: "alarm" } }),
    TEST_FIGHTER,
  );
  const start = runtime.createSession();
  const result = accepted(runtime, start, EXAMINE("rusted-lantern"), 20, 1);
  const types = result.events.map(({ type }) => type);
  assert.equal(types[0], "examined");
  assert.equal(types[1], "arrived");
  assert.ok(types.includes("initiative"));
  assert.deepEqual(result.events[1], {
    type: "arrived",
    encounterId: "cellar-rat",
    room: "Foot of the Stair",
    opponents: [
      "A rat the size of a dog rears up from the sacks, teeth bared.",
    ],
    opponentIds: ["giant-rat"],
  });
  assert.match(
    renderFifthResult(result),
    /Someone comes into the Foot of the Stair\. A rat the size of a dog/u,
  );
  assert.equal(result.state.encounter.outcome, "ongoing");
  assert.deepEqual(result.state.metEncounters, [
    { encounterId: "cellar-rat", roomId: "stair-foot" },
  ]);
});

test("what a moved fight's opponents carry goes with it", () => {
  const runtime = createFifthRuntime(
    alarmed({ movesTo: { roomId: "alcove", when: "alarm" } }, (module) => {
      room(module, "rat-cellar").items.push({
        id: "rat-collar",
        name: "Brass Collar",
        description: "A brass collar, green with age.",
        kind: "key",
        hiddenIn: "giant-rat",
      });
    }),
    TEST_FIGHTER,
  );
  const after = sounded(runtime).state;
  // Won in the alcove, the rat's body lies there with the collar on it.
  const alcove = accepted(runtime, after, MOVE("alcove"), 20, 1).state;
  const won = {
    ...alcove,
    clearedEncounterIds: ["cellar-rat"],
    encounter: { ...alcove.encounter, outcome: "victory" },
  };
  const searched = accepted(runtime, won, EXAMINE("giant-rat"));
  assert.deepEqual(searched.events[0].found, ["Brass Collar"]);
  const foot = accepted(runtime, won, MOVE("stair-foot")).state;
  const cellar = accepted(runtime, foot, MOVE("rat-cellar")).state;
  assert.deepEqual(
    runtime.projectRoom(cellar).features.map(({ id }) => id),
    ["gnawed-sacks"],
  );
});

test("a reload replays where an encounter was met, and a trace records it", async () => {
  const module = alarmed({ movesTo: { roomId: "alcove", when: "alarm" } });
  const directory = await mkdtemp(join(tmpdir(), "issue-398-"));
  try {
    const path = join(directory, "session.json");
    const run = new FifthTraceRun(
      await FifthSession.create(path, "a".repeat(32), 3, module, TEST_FIGHTER),
    );
    for (const action of [EXAMINE("rusted-lantern"), MOVE("alcove")]) {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    assert.deepEqual(run.session.state.metEncounters, [
      { encounterId: "cellar-rat", roomId: "alcove" },
    ]);
    await run.session.persist();
    const loaded = await FifthSession.load(path, [module]);
    assert.deepEqual(loaded.state, run.session.state);
    assert.deepEqual(run.trace.turns.at(-1).stateAfter.metEncounters, [
      { encounterId: "cellar-rat", roomId: "alcove" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The balance harness and the gate.

test("the required path meets the fight a flag moves onto it", () => {
  assert.deepEqual(requiredPath(rousedTunnels).roomIds, [
    "stair-foot",
    "rat-cellar",
    "den",
  ]);
  const runtime = createFifthRuntime(rousedTunnels, TEST_FIGHTER);
  for (const seed of [0, 1, 2]) {
    const run = playAdventure(runtime, "cautious", seed);
    // The cautious run skips optional fights, but meets the rat on its way.
    assert.equal(run.encounters[0].id, "cellar-rat", run.roomIds.join(" > "));
  }
  // Asleep in its nest, the rat is an optional fight the cautious run skips.
  const sleeping = createFifthRuntime(
    validateModule(rousedTunnelsFile(false)),
    TEST_FIGHTER,
  );
  const quiet = playAdventure(sleeping, "cautious", 0);
  assert.deepEqual(
    quiet.encounters.map(({ id }) => id),
    ["den-goblin"],
  );
});

test("the gate's verdict counts the fight a flag moves onto the path", () => {
  const options = { seeds: Array.from({ length: 40 }, (_, seed) => seed) };
  const roused = gateAdventure(rousedTunnels, options);
  const sleeping = gateAdventure(
    validateModule(rousedTunnelsFile(false)),
    options,
  );
  assert.ok(roused.ok && sleeping.ok);
  assert.ok(
    roused.verdict.survival.rate < sleeping.verdict.survival.rate,
    `${roused.verdict.survival.rate} vs ${sleeping.verdict.survival.rate}`,
  );
});
