// #403: wandering encounter tables by region. A region may have a table of
// up to six entries, each an encounter in no room or an omen (words only).
// Every `every` moves within the region, on each rest there and when the
// alarm is raised there, the engine rolls its chance: the d100 picks the
// entry too, each taking an equal share of the chance. A fight entry comes
// once and is its omen from then on; omens repeat. The module's single
// `wanderingEncounter` (#335) is a one-entry table rolled only on rests.
// The gate counts wandering fights in survival and their XP in the XP
// limit, and reports them. Adventure 39, session 60, trace 54, prompt v40.
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
import {
  FIFTH_WANDERING_DM_CASES,
  loadFifthWanderingEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
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
import { dice } from "./fixtures/engine-dice.mjs";
import {
  alarmTunnelsFile,
  restingTunnels,
  restingTunnelsFile,
  room,
  wanderingTunnels,
  wanderingTunnelsFile,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });
const END_TURN = { type: "end-turn", actorId: "pc" };
const LONG = { type: "long-rest" };
const CHAIN = "Far above, a chain clinks against stone, then is still.";
const CLAWS = "Claws skitter somewhere in the dark, then fade.";
const DRIP = "Water drips steadily from the vaulted ceiling.";

/** Dice that show `queue` in order, whatever the die, then 1s. */
function steady(...queue) {
  return { roll: () => (queue.length > 0 ? queue.shift() : 1) };
}

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** The wandering tunnels' JSON, changed by `change`, validated. */
function wandering(change) {
  const module = structuredClone(wanderingTunnelsFile);
  change(module);
  return validateModule(module);
}

const runtime = createFifthRuntime(wanderingTunnels, TEST_FIGHTER);
const rolls = (result) =>
  result.events.filter(({ type }) => type === "wandering-roll");
const types = (events) => events.map(({ type }) => type);
/** The start, moved to `roomId` with the cellar's rat beaten. */
const at = (roomId, more = {}) => ({
  ...runtime.createSession(),
  roomId,
  clearedEncounterIds: ["cellar-rat"],
  ...more,
});

test("the formats bump, and the prompt", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 43);
  assert.equal(FIFTH_SESSION_FORMAT, 62);
  assert.equal(FIFTH_TRACE_FORMAT, 56);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v44");
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /No tool summons, rolls for, delays or keeps away a wandering encounter\./u,
  );
});

// The validator.

test("a region's wandering table is read", () => {
  const [upper, lower] = wanderingTunnels.regions;
  assert.deepEqual(upper.wandering, {
    chance: 100,
    every: 1,
    entries: [{ omen: CHAIN }],
  });
  assert.deepEqual(lower.wandering.entries, [
    { encounterId: "prowling-rat", omen: CLAWS },
    { omen: DRIP },
  ]);
  // Without `every`, it rolls only on rests and the alarm.
  assert.equal(
    wandering((module) => delete module.regions[0].wandering.every).regions[0]
      .wandering.every,
    undefined,
  );
  // The prowling rat is in no room: its table places it.
  assert.equal(
    wanderingTunnels.rooms.some(
      ({ encounterId }) => encounterId === "prowling-rat",
    ),
    false,
  );
});

test("the validator refuses malformed wandering tables", () => {
  const lower = (module) => module.regions[1].wandering;
  for (const [change, message] of [
    [
      (module) => (lower(module).chance = 0),
      /region lower's wandering table chance/u,
    ],
    [
      (module) => (lower(module).chance = 1),
      /region lower's wandering table has 2 entries but a chance of 1: each entry needs at least 1 of the d100\./u,
    ],
    [
      (module) => (lower(module).every = 0),
      /region lower's wandering table every/u,
    ],
    [
      (module) => (lower(module).every = 21),
      /region lower's wandering table every/u,
    ],
    [
      (module) => (lower(module).entries = []),
      /region lower's wandering table entries must list 1–6 entries\./u,
    ],
    [
      (module) =>
        (lower(module).entries = Array.from({ length: 7 }, () => ({
          omen: DRIP,
        }))),
      /region lower's wandering table entries/u,
    ],
    [
      (module) => delete lower(module).entries[0].omen,
      /region lower's wandering table entry 1 must have omen/u,
    ],
    [
      (module) => (lower(module).entries[1].text = "Drip."),
      /region lower's wandering table entry 2/u,
    ],
    [
      (module) => (lower(module).entries[0].encounterId = "nobody"),
      /region lower's wandering table names unknown encounter nobody\./u,
    ],
    [
      (module) => (lower(module).entries[0].encounterId = "cellar-rat"),
      /wandering encounter cellar-rat is in room rat-cellar/u,
    ],
    [
      (module) =>
        module.regions[0].wandering.entries.push({
          encounterId: "prowling-rat",
          omen: CLAWS,
        }),
      /wandering encounter prowling-rat is in more than one wandering table entry\./u,
    ],
    [
      (module) =>
        (module.wanderingEncounter = {
          encounterId: "prowling-rat",
          chance: 25,
        }),
      /a module has a wanderingEncounter or regions with wandering tables, not both\./u,
    ],
    [
      (module) => (module.encounters.at(-1).bypassXp = 10),
      /wandering encounter prowling-rat can't have bypassXp/u,
    ],
    // Out of every table, it is in no room.
    [
      (module) => (lower(module).entries = [{ omen: DRIP }]),
      /encounter prowling-rat is in no room\./u,
    ],
  ]) {
    assert.throws(() => wandering(change), message);
  }
});

test("a module may have 30 encounters, wandering ones counted (D5)", () => {
  /**
   * The tunnels with `count` more rats, each in a nook of its own, the
   * nooks in a row east of the stair foot.
   */
  const nooks = (count) =>
    wandering((module) => {
      const rat = module.encounters[0];
      for (let index = 0; index < count; index += 1) {
        const id = `nook-rat-${index}`;
        module.encounters.push({
          ...structuredClone(rat),
          id,
          opponents: [
            { ...structuredClone(rat.opponents[0]), id: `${id}-rat` },
          ],
        });
        module.rooms.push({
          id: `nook-${index}`,
          name: `Nook ${index}`,
          at: [2 + index, 0],
          description: "A damp nook.",
          region: "upper",
          encounterId: id,
          features: [],
          items: [],
        });
        module.passages.push({
          id: `to-nook-${index}`,
          between: [
            index === 0 ? "stair-foot" : `nook-${index - 1}`,
            `nook-${index}`,
          ],
          description: "A gap in the wall.",
        });
      }
    });
  // Three encounters, the wandering rat's among them, and 27 more: 30.
  assert.equal(wanderingTunnels.encounters.length, 3);
  assert.equal(nooks(27).encounters.length, 30);
  assert.throws(() => nooks(28), /encounters/u);
});

// The engine.

test("each move within a region rolls its table every so many moves; omens repeat", () => {
  const start = runtime.createSession();
  // Into the alcove: the upper table's d100 (chance 100) brings its omen.
  const first = accepted(runtime, start, MOVE("alcove"), dice([100, 37]));
  assert.deepEqual(types(first.events), ["entered", "wandering-roll"]);
  assert.deepEqual(rolls(first)[0], {
    type: "wandering-roll",
    trigger: "moves",
    roll: 37,
    chance: 100,
    interrupted: false,
    omen: CHAIN,
  });
  assert.deepEqual(first.state.regionMoves, { upper: 1 });
  assert.equal(first.state.omen, CHAIN);
  assert.match(
    renderFifthResult(first),
    /^You listen as you go: d100 37, 100 or less: Far above, a chain clinks against stone, then is still\.$/mu,
  );
  // The d100 shows on the card.
  assert.deepEqual(
    describeFifthResult(first, [{ sides: 100, value: 37 }], "Ada").flatMap(
      ({ rolls: groups }) => groups,
    ),
    [
      {
        purpose: "wandering",
        roller: "Ada",
        label: "Wandering encounter",
        dice: [{ sides: 100, value: 37 }],
        modifier: 0,
        total: 37,
        dc: 100,
        outcome: "failure",
      },
    ],
  );
  // Back again: the omen comes again.
  const second = accepted(
    runtime,
    first.state,
    MOVE("stair-foot"),
    dice([100, 100]),
  );
  assert.equal(rolls(second)[0].omen, CHAIN);
  assert.deepEqual(second.state.regionMoves, { upper: 2 });
  // Every second move: the first rolls nothing, the second rolls.
  const everyTwo = createFifthRuntime(
    wandering((module) => (module.regions[0].wandering.every = 2)),
    TEST_FIGHTER,
  );
  const quiet = accepted(everyTwo, start, MOVE("alcove"), dice());
  assert.deepEqual(types(quiet.events), ["entered"]);
  assert.equal(quiet.state.omen, undefined);
  const rolled = accepted(
    everyTwo,
    quiet.state,
    MOVE("stair-foot"),
    dice([100, 5]),
  );
  assert.equal(rolls(rolled).length, 1);
  // Over the chance, nothing stirs.
  const rare = createFifthRuntime(
    wandering((module) => (module.regions[0].wandering.chance = 10)),
    TEST_FIGHTER,
  );
  const nothing = accepted(rare, start, MOVE("alcove"), dice([100, 11]));
  assert.deepEqual(rolls(nothing)[0], {
    type: "wandering-roll",
    trigger: "moves",
    roll: 11,
    chance: 10,
    interrupted: false,
  });
  assert.match(
    renderFifthResult(nothing),
    /^You listen as you go: d100 11, over 10: nothing stirs\.$/mu,
  );
});

test("a move that meets a fight loses its roll, but counts", () => {
  // Into the cellar: initiative only, no d100.
  const result = accepted(
    runtime,
    runtime.createSession(),
    MOVE("rat-cellar"),
    dice([20, 15], [20, 2]),
  );
  assert.equal(rolls(result).length, 0);
  assert.deepEqual(result.state.regionMoves, { lower: 1 });
  assert.equal(result.state.encounter.outcome, "ongoing");
});

test("a fight entry comes once, then is its omen; the d100 picks the entry", () => {
  // 1–50 the rat; then initiative: Ada 15, the rat 2.
  const came = accepted(
    runtime,
    at("rat-cellar"),
    MOVE("landing"),
    dice([100, 50], [20, 15], [20, 2]),
  );
  assert.deepEqual(rolls(came)[0], {
    type: "wandering-roll",
    trigger: "moves",
    roll: 50,
    chance: 100,
    interrupted: true,
    opponents: ["Prowling Rat"],
  });
  assert.match(
    renderFifthResult(came),
    /^You listen as you go: d100 50, 100 or less: Prowling Rat comes upon you\.$/mu,
  );
  const { state } = came;
  assert.equal(state.wandering, "prowling-rat");
  assert.deepEqual(state.wanderersCome, ["prowling-rat"]);
  assert.equal(state.encounter.outcome, "ongoing");
  assert.deepEqual(
    state.encounter.combatants
      .filter(({ side }) => side === "opponents")
      .map(({ name }) => name),
    ["Prowling Rat"],
  );
  assert.equal(
    runtime.projectDmScene(state).wandering,
    "A wandering encounter came upon you here: Prowling Rat.",
  );
  // Come (here, fled from and never beaten), it is its omen from now on.
  const after = at("landing", { wanderersCome: ["prowling-rat"] });
  const omen = accepted(runtime, after, MOVE("rat-cellar"), dice([100, 1]));
  assert.deepEqual(rolls(omen)[0], {
    type: "wandering-roll",
    trigger: "moves",
    roll: 1,
    chance: 100,
    interrupted: false,
    omen: CLAWS,
  });
  assert.equal(omen.state.encounter, undefined);
  // 51–100 the dripping water, again and again.
  for (const roll of [51, 100]) {
    const drip = accepted(
      runtime,
      after,
      MOVE("rat-cellar"),
      dice([100, roll]),
    );
    assert.equal(rolls(drip)[0].omen, DRIP);
  }
});

test("a rest rolls its region's table: an omen lets it go on, a fight interrupts it and restores nothing", () => {
  const tired = (on, roomId = "alcove") => {
    const state = on.createSession();
    return { ...state, roomId, character: { ...state.character, hp: 3 } };
  };
  // The alcove's region brings only the chain: the long rest goes on.
  const heard = accepted(runtime, tired(runtime), LONG, dice([100, 64]));
  assert.deepEqual(types(heard.events).slice(0, 2), [
    "wandering-roll",
    "long-rest",
  ]);
  assert.deepEqual(rolls(heard)[0], {
    type: "wandering-roll",
    rest: "long",
    roll: 64,
    chance: 100,
    interrupted: false,
    omen: CHAIN,
  });
  assert.match(
    renderFifthResult(heard),
    /^You keep watch as you rest: d100 64, 100 or less: Far above, a chain clinks against stone, then is still\.$/mu,
  );
  assert.equal(heard.state.longRests, 1);
  assert.ok(heard.state.character.hp > 3);
  // With the rat in the upper table, it interrupts the rest.
  const prowled = createFifthRuntime(
    wandering((module) => {
      module.regions[0].wandering.entries = [
        { encounterId: "prowling-rat", omen: CLAWS },
      ];
      module.regions[1].wandering.entries = [{ omen: DRIP }];
    }),
    TEST_FIGHTER,
  );
  const result = accepted(
    prowled,
    tired(prowled),
    LONG,
    dice([100, 30], [20, 15], [20, 2]),
  );
  assert.deepEqual(rolls(result)[0], {
    type: "wandering-roll",
    rest: "long",
    roll: 30,
    chance: 100,
    interrupted: true,
    opponents: ["Prowling Rat"],
  });
  assert.equal(
    result.events.some(({ type }) => type === "long-rest"),
    false,
  );
  assert.equal(result.state.character.hp, 3);
  assert.equal(result.state.longRests, 0);
  assert.equal(result.state.wandering, "prowling-rat");
  assert.equal(result.state.encounter.outcome, "ongoing");
});

test("the module's one wandering encounter rolls only on rests, as before", () => {
  const resting = createFifthRuntime(restingTunnels, TEST_FIGHTER);
  // Moves roll nothing.
  let state = resting.createSession();
  for (const to of ["alcove", "stair-foot", "alcove"]) {
    const result = accepted(resting, state, MOVE(to), dice());
    assert.equal(rolls(result).length, 0);
    state = result.state;
  }
  assert.equal(state.regionMoves, undefined);
  // A rest draws its one d100, and nothing else, as in #335.
  const tired = { ...state, character: { ...state.character, hp: 3 } };
  const rest = accepted(resting, tired, LONG, dice([100, 26]));
  assert.deepEqual(rolls(rest)[0], {
    type: "wandering-roll",
    rest: "long",
    roll: 26,
    chance: 25,
    interrupted: false,
  });
  // Once it has come, no rest rolls for it: it has no omen.
  const come = accepted(
    resting,
    { ...tired, wanderersCome: ["prowling-rat"] },
    LONG,
    dice(),
  );
  assert.equal(rolls(come).length, 0);
  // A module without one rolls nothing.
  const none = createFifthRuntime(
    validateModule(restingTunnelsFile()),
    TEST_FIGHTER,
  );
  const plain = { ...none.createSession(), roomId: "alcove" };
  assert.equal(
    rolls(
      accepted(
        none,
        { ...plain, character: { ...plain.character, hp: 3 } },
        LONG,
        dice(),
      ),
    ).length,
    0,
  );
});

/** The alarmed tunnels, with wandering tables `upper` and `lower`. */
function alarmedWith(upper, lower) {
  const module = structuredClone(alarmTunnelsFile);
  module.id = "wandering-alarm";
  const rat = structuredClone(module.encounters[0].opponents[0]);
  if (JSON.stringify([upper, lower]).includes("prowling-rat")) {
    module.encounters.push({
      id: "prowling-rat",
      opponents: [{ ...rat, id: "prowler", name: "Prowling Rat" }],
      defeatEndingId: "fallen-in-the-cellar",
    });
  }
  module.regions[0].wandering = upper;
  module.regions[1].wandering = lower;
  return createFifthRuntime(validateModule(module), TEST_FIGHTER);
}

test("the alarm rolls the table of the region it is raised in", () => {
  const alarmed = alarmedWith(
    { chance: 100, entries: [{ encounterId: "prowling-rat", omen: CLAWS }] },
    { chance: 100, entries: [{ omen: DRIP }] },
  );
  // The crates crash at the foot of the stair, in the upper region: its
  // table rolls at once, and the rat comes. Then initiative.
  const result = accepted(
    alarmed,
    alarmed.createSession(),
    EXAMINE("stacked-crates"),
    dice([20, 1], [100, 40], [20, 15], [20, 2]),
  );
  const order = types(result.events);
  assert.ok(order.indexOf("alarm") < order.indexOf("wandering-roll"));
  assert.deepEqual(rolls(result)[0], {
    type: "wandering-roll",
    trigger: "alarm",
    roll: 40,
    chance: 100,
    interrupted: true,
    opponents: ["Prowling Rat"],
  });
  assert.match(
    renderFifthResult(result),
    /^The alarm carries through the dark: d100 40, 100 or less: Prowling Rat comes upon you\.$/mu,
  );
  assert.equal(result.state.roomId, "stair-foot");
  assert.equal(result.state.wandering, "prowling-rat");
  assert.equal(result.state.wanderingDue, undefined);
  // A table without `every` rolls nothing on moves.
  const moved = accepted(
    alarmed,
    alarmed.createSession(),
    MOVE("alcove"),
    dice(),
  );
  assert.equal(rolls(moved).length, 0);
});

test("an alarm raised in a fight rolls once the character is out of it", () => {
  const alarmed = alarmedWith(
    { chance: 100, entries: [{ omen: CHAIN }] },
    { chance: 100, entries: [{ omen: DRIP }] },
  );
  // Into the cellar first (initiative 20 to 1); everyone misses; round 3
  // makes noise.
  let result = accepted(
    alarmed,
    alarmed.createSession(),
    MOVE("rat-cellar"),
    steady(20, 1),
  );
  for (let turn = 0; turn < 2; turn += 1) {
    result = accepted(alarmed, result.state, END_TURN, steady());
  }
  assert.equal(result.state.alarm?.by, "fight");
  assert.equal(result.state.wanderingDue, "lower");
  assert.equal(rolls(result).length, 0);
  // Fleeing up the crawl (the rat misses) leaves the fight: the lower
  // table, where the alarm was raised, rolls in the alcove.
  const fled = accepted(
    alarmed,
    result.state,
    { type: "flee", destinationId: "alcove" },
    steady(),
  );
  assert.equal(fled.state.roomId, "alcove");
  assert.deepEqual(rolls(fled), [
    {
      type: "wandering-roll",
      trigger: "alarm",
      roll: 1,
      chance: 100,
      interrupted: false,
      omen: DRIP,
    },
  ]);
  assert.equal(fled.state.wanderingDue, undefined);
});

// The AI DM.

test("the AI DM's scene shows the omen or the arrival, and no tool rolls for one", () => {
  const start = runtime.createSession();
  assert.equal(runtime.projectDmScene(start).wandering, undefined);
  const heard = accepted(runtime, start, MOVE("alcove"), dice([100, 3])).state;
  assert.equal(
    runtime.projectDmScene(heard).wandering,
    `An omen, heard here: ${CHAIN}`,
  );
  // Moving on, on a move that rolls nothing, clears it.
  const everyTwo = createFifthRuntime(
    wandering((module) => (module.regions[0].wandering.every = 2)),
    TEST_FIGHTER,
  );
  const moved = accepted(
    everyTwo,
    { ...heard, regionMoves: { upper: 2 } },
    MOVE("stair-foot"),
    dice(),
  ).state;
  assert.equal(moved.omen, undefined);
  assert.equal(everyTwo.projectDmScene(moved).wandering, undefined);
  for (const state of [start, heard]) {
    for (const { name, parameters } of runtime.getGameToolDefinitions(state)) {
      assert.doesNotMatch(
        `${name} ${JSON.stringify(parameters)}`,
        /wander|omen/u,
      );
    }
  }
});

test("the wandering evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthWanderingEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  assert.deepEqual(adventure, wanderingTunnels);
  for (const sample of FIFTH_WANDERING_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
    // Each case after the move into the alcove has heard the chain.
    assert.equal(
      session.state.omen === CHAIN,
      sample.setup.length > 0,
      sample.id,
    );
  }
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_WANDERING_DM_CASES,
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
      FIFTH_WANDERING_DM_CASES.map((sample) => [
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

test("a reload replays the wandering rolls, and a trace records them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-403-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      0,
      wanderingTunnels,
      TEST_FIGHTER,
    );
    const run = new FifthTraceRun(created);
    for (const to of ["alcove", "stair-foot"]) {
      const { result } = run.click(MOVE(to));
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    assert.deepEqual(run.session.state.regionMoves, { upper: 2 });
    assert.equal(run.session.state.omen, CHAIN);
    await run.session.persist();
    const loaded = await FifthSession.load(path, [wanderingTunnels]);
    assert.deepEqual(loaded.state, run.session.state);
    assert.deepEqual(
      run.trace.turns.at(-1).stateAfter.regionMoves,
      run.session.state.regionMoves,
    );
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [wanderingTunnels]);
    assert.deepEqual(replayed.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The balance harness and the gate.

const GATE_OPTIONS = {
  seeds: [0, 1, 2, 3],
  reportStealth: false,
  reportRetreat: false,
  reportUseRoom: false,
  reportReactions: false,
};

test("seeded and always-fail runs meet the wandering rat on the landing", () => {
  const failing = createFifthRuntime(wanderingTunnels, TEST_FIGHTER, {
    checks: "always-fail",
  });
  for (const using of [runtime, failing]) {
    const met = [0, 1, 2, 3, 4, 5].map(
      (seed) => playAdventure(using, "cautious", seed).encounters,
    );
    const prowled = met.filter((fights) =>
      fights.some(({ id }) => id === "prowling-rat"),
    );
    assert.ok(prowled.length > 0);
    for (const fights of prowled) {
      // Between the cellar's fight and the den's: on the landing.
      assert.deepEqual(
        fights.map(({ id }) => id),
        ["cellar-rat", "prowling-rat", "den-goblin"],
      );
    }
  }
});

test("the gate counts wandering fights in survival and their XP in the XP limit, and reports them", () => {
  const result = gateAdventure(wanderingTunnels, GATE_OPTIONS);
  const { wandering: report, xp } = result.verdict;
  // 25 (the cellar's rat) + 25 (the prowling rat) + 50 (the goblin).
  assert.equal(xp.available, 100);
  assert.deepEqual(report.runs, { seeded: 12, "always-fail": 12 });
  assert.ok(report.met.seeded > 0);
  assert.ok(report.met["always-fail"] > 0);
  assert.deepEqual(report.fell, { seeded: 0, "always-fail": 0 });
  assert.equal(report.xp, 25);
  assert.match(
    renderGateResult(wanderingTunnels, result),
    /\n {2}Wandering encounters, reported \(not judged\): the level 1, 5th percentile Fighter playing cautious met one in \d+ of 12 seeded runs and \d+ of 12 always-fail runs, and fell in one in 0 and 0; they count in survival, and their 25 XP in the XP limit\./u,
  );
  // A deadly wanderer kills the runs that meet it: survival falls, on
  // seeded and always-fail checks alike.
  const deadly = wandering((module) => {
    const bite = module.encounters.at(-1).opponents[0].statBlock.attacks[0];
    bite.bonus = 20;
    bite.damage = { dice: 4, sides: 12, modifier: 20, type: "piercing" };
    module.encounters.at(-1).opponents[0].statBlock.xp = 25;
  });
  const fatal = gateAdventure(deadly, GATE_OPTIONS);
  const fell = fatal.verdict.wandering.fell;
  assert.ok(fell.seeded > 0 && fell["always-fail"] > 0, JSON.stringify(fell));
  assert.ok(fatal.verdict.survival.rate < result.verdict.survival.rate);
  assert.ok(fatal.verdict.alwaysFail.rate < result.verdict.alwaysFail.rate);
  // A module without region tables has no such report.
  const resting = gateAdventure(restingTunnels, GATE_OPTIONS);
  assert.equal(resting.verdict.wandering, undefined);
  assert.equal(room(restingTunnels, "alcove").restSite, true);
});
