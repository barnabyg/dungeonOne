// #404: a long module. A module with two or more regions may declare itself
// `long`: then rests are counted per region, two short rests and one long
// rest in each (the long one only at a rest site, and every region has
// one), and it has twice the treasure budget for its maximum level and an
// XP limit one level higher (D6). Adventure 40, session 61, trace 55.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { gateAdventure } from "../dist/balance-5e.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  longTunnels,
  longTunnelsFile,
  regionTunnels,
  room,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const REST = (hitDice) => ({ type: "rest", hitDice });
const LONG = { type: "long-rest" };
const ADA_3 = testFighterAt(3);

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

function refused(runtime, state, action, code) {
  const result = runtime.handleAction(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  return result.rejection;
}

/** The character down to 3 HP with every hit die, so a rest restores some. */
const hurt = (state) => ({
  ...state,
  character: { ...state.character, hp: 3, hitDice: 3 },
});

/** The long tunnels' JSON, changed by `change`. */
function changed(change) {
  const module = structuredClone(longTunnelsFile);
  change(module);
  return module;
}

// The validator.

test("a module with two regions and a rest site in each may declare itself long", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 41);
  assert.equal(FIFTH_SESSION_FORMAT, 62);
  assert.equal(FIFTH_TRACE_FORMAT, 56);
  assert.equal(longTunnels.long, true);
  // Any other module is not long.
  assert.equal(regionTunnels.long, undefined);
});

test("the validator refuses a long module without two regions or a rest site in each", () => {
  for (const [module, message] of [
    [
      changed((module) => {
        module.long = false;
      }),
      /long must be true, or left out\./u,
    ],
    [
      changed((module) => {
        delete module.regions;
        for (const entry of module.rooms) {
          delete entry.region;
        }
      }),
      /a long module needs at least two regions: it has none\./u,
    ],
    [
      changed((module) => {
        module.regions = [{ id: "upper", name: "Upper Tunnels" }];
        for (const entry of module.rooms) {
          entry.region = "upper";
        }
      }),
      /a long module needs at least two regions: it has one\./u,
    ],
    [
      changed((module) => {
        delete room(module, "cistern").restSite;
      }),
      /region lower has no rest site: a long module needs one in each region\./u,
    ],
  ]) {
    assert.throws(() => validateModule(module), message);
  }
});

test("a long module's treasure budget is twice its maximum level's, and its excess is named", () => {
  assert.equal(treasureBudget(3, true), 2 * treasureBudget(3));
  assert.equal(treasureBudget(3, true), 90000);
  const purse = (gp) =>
    changed((module) => {
      room(module, "cistern").features.push({
        id: "silt",
        name: "Silt",
        description: "Silt lies thick on the cistern floor.",
        discovery: "A purse lies in the silt.",
      });
      room(module, "cistern").items.push({
        id: "cistern-purse",
        name: "Sodden Purse",
        description: "A purse lost down the cistern.",
        kind: "coin",
        coins: { gp },
        hiddenIn: "silt",
      });
    });
  // With the alcove's 50 gp potion, 600 gp is over a level-3 module's
  // 450 gp, but within a long one's.
  validateModule(purse(550));
  const short = purse(550);
  delete short.long;
  assert.throws(
    () => validateModule(short),
    /module long-tunnels: its findable treasure is worth 600 gp, 150 gp over the 450 gp budget for level 3\./u,
  );
  assert.throws(
    () => validateModule(purse(851)),
    /module long-tunnels: its findable treasure is worth 901 gp, 1 gp over the 900 gp budget for a long module at level 3\./u,
  );
});

test("npm run loot names a long module's budget", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-404-loot-"));
  try {
    const path = join(directory, "long.json");
    await writeFile(path, JSON.stringify(longTunnelsFile));
    const script = fileURLToPath(
      new URL("../scripts/loot-5e.mjs", import.meta.url),
    );
    const run = spawnSync(process.execPath, [script, path, "--seed", "1"], {
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      /Findable treasure: 50 gp of the 900 gp budget for a long module at level 3\.\n$/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the gate's XP limit allows a long module one more level", () => {
  const { verdict } = gateAdventure(longTunnels, {
    seeds: [0, 1],
    sampleSize: 200,
  });
  assert.equal(verdict.xp.startXp, 2699);
  assert.equal(verdict.xp.levelLimit, 5);
  const short = structuredClone(longTunnelsFile);
  delete short.long;
  const plain = gateAdventure(validateModule(short), {
    seeds: [0, 1],
    sampleSize: 200,
  }).verdict;
  assert.equal(plain.xp.levelLimit, 4);
});

// Rests per region.

test("a long module allows two short rests and one long rest in each region", () => {
  const runtime = createFifthRuntime(longTunnels, ADA_3);
  // The rat's fight is won, so the way down is quiet.
  let state = {
    ...runtime.createSession(),
    roomId: "alcove",
    clearedEncounterIds: ["cellar-rat"],
  };
  assert.deepEqual(runtime.projectRests(state, "short"), {
    left: 2,
    max: 2,
    per: "region",
  });
  // Two short rests in the Upper Tunnels, then a third is refused there.
  const first = accepted(runtime, hurt(state), REST(1), dice([10, 1]));
  assert.match(
    renderFifthResult(first),
    /Short rests: 1 of 2 left in this region\./u,
  );
  state = accepted(runtime, hurt(first.state), REST(1), dice([10, 1])).state;
  const third = refused(runtime, hurt(state), REST(1), "no-rests-left");
  assert.equal(
    third.reason,
    "You have taken the two short rests each region allows: rest again in another region.",
  );
  assert.deepEqual(runtime.projectRests(state, "short"), {
    left: 0,
    max: 2,
    per: "region",
  });
  // The upper long rest, at the alcove; a second there is refused.
  state = accepted(runtime, hurt(state), LONG).state;
  assert.equal(
    refused(runtime, hurt(state), LONG, "no-long-rests-left").reason,
    "You have taken the one long rest each region allows: rest again in another region.",
  );
  // Down in the Lower Tunnels, rests are allowed again.
  for (const to of ["stair-foot", "rat-cellar", "cistern"]) {
    state = accepted(runtime, state, MOVE(to)).state;
  }
  assert.deepEqual(runtime.projectRests(state, "short"), {
    left: 2,
    max: 2,
    per: "region",
  });
  assert.deepEqual(runtime.projectRests(state, "long"), {
    left: 1,
    max: 1,
    per: "region",
  });
  state = accepted(runtime, hurt(state), REST(1), dice([10, 1])).state;
  state = accepted(runtime, hurt(state), LONG).state;
  // Back up, the Upper Tunnels' rests stay spent.
  for (const to of ["rat-cellar", "stair-foot", "alcove"]) {
    state = accepted(runtime, state, MOVE(to)).state;
  }
  refused(runtime, hurt(state), REST(1), "no-rests-left");
  refused(runtime, hurt(state), LONG, "no-long-rests-left");
  assert.equal(state.shortRests, 3);
  assert.equal(state.longRests, 2);
  assert.deepEqual(state.regionRests, {
    upper: { short: 2, long: 1 },
    lower: { short: 1, long: 1 },
  });
  // The character status names the region's rests.
  assert.ok(
    runtime
      .projectCharacterStatus(state)
      .resources.includes("Short rests: 0 of 2 left in this region"),
  );
});

test("a module with regions that is not long counts rests per adventure, as before", () => {
  const runtime = createFifthRuntime(regionTunnels, ADA_3);
  let state = {
    ...runtime.createSession(),
    clearedEncounterIds: ["cellar-rat"],
  };
  assert.deepEqual(runtime.projectRests(state, "short"), { left: 2, max: 2 });
  state = accepted(runtime, hurt(state), REST(1), dice([10, 1])).state;
  state = accepted(runtime, hurt(state), REST(1), dice([10, 1])).state;
  state = accepted(runtime, state, MOVE("rat-cellar")).state;
  assert.equal(
    refused(runtime, hurt(state), REST(1), "no-rests-left").reason,
    "You have taken the two short rests an adventure allows.",
  );
  assert.equal(state.regionRests, undefined);
});

/** Fights the traced run's fight out, attacking whenever it can. */
function fightOut(run) {
  for (let turn = 0; turn < 200; turn += 1) {
    const { session } = run;
    if (session.state.encounter?.outcome !== "ongoing") {
      return;
    }
    const views = session.runtime
      .projectActions(session.state)
      .filter(({ available }) => available);
    const choice =
      views.find(({ action }) => action === "attack") ??
      views.find(({ action }) => action === "end-turn");
    run.click(session.runtime.actionOf(choice));
  }
}

test("a reload restores each region's rests, and a trace records them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-404-"));
  try {
    // The first seed on which the rat bites the fighter and loses.
    let run;
    let path;
    for (let seed = 0; run === undefined; seed += 1) {
      path = join(directory, `session-${seed}.json`);
      const trial = new FifthTraceRun(
        await FifthSession.create(
          path,
          "a".repeat(32),
          seed,
          longTunnels,
          ADA_3,
        ),
      );
      trial.click(MOVE("rat-cellar"));
      fightOut(trial);
      const { state } = trial.session;
      if (
        state.status === "playing" &&
        state.character.hp <
          trial.session.runtime.projectCharacterStatus(state).maxHp
      ) {
        run = trial;
      }
    }
    assert.equal(run.click(MOVE("cistern")).result.rejection, undefined);
    assert.equal(run.session.state.regionRests, undefined);
    const rested = run.click(REST(1)).result;
    assert.equal(rested.rejection, undefined, rested.rejection?.reason);
    assert.deepEqual(run.session.state.regionRests, {
      lower: { short: 1, long: 0 },
    });
    await run.session.persist();
    const loaded = await FifthSession.load(path, [longTunnels]);
    assert.deepEqual(loaded.state, run.session.state);
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [longTunnels]);
    assert.deepEqual(replayed.state.regionRests, {
      lower: { short: 1, long: 0 },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
