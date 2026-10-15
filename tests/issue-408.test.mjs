// #408: the gate sweeps each region of a long module. For each region the
// cautious style visits every room not marked `avoidable` and fights what
// waits there, and must clear one difficulty lower than the module's (D8).
// An avoidable room must lie off every declared route, and every region
// must have an exit the character can reach from every room in it (D9).
// Adventure 42.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  gateVerdictAt,
  playAdventure,
  regionSweeps,
  renderGateResult,
  requiredPath,
} from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  lairTunnels,
  lairTunnelsFile,
  longTunnels,
  longTunnelsFile,
  ratTunnels,
  regionTunnels,
  room,
} from "./fixtures/modules.mjs";

const GATE_OPTIONS = {
  seeds: [0, 1, 2, 3],
  reportStealth: false,
  reportRetreat: false,
  reportUseRoom: false,
  reportReactions: false,
};
const UPPER_SWEEP = {
  region: "upper",
  name: "Upper Tunnels",
  rooms: ["stair-foot", "alcove", "lair"],
};

test("the adventure format bumps", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 43);
});

test("a long module's region sweeps visit every room but the avoidable ones", () => {
  // The victory room is left to the objective, which comes last.
  assert.deepEqual(regionSweeps(longTunnels), [
    { region: "upper", name: "Upper Tunnels", rooms: ["stair-foot", "alcove"] },
    {
      region: "lower",
      name: "Lower Tunnels",
      rooms: ["rat-cellar", "cistern"],
    },
  ]);
  assert.deepEqual(regionSweeps(lairTunnels)[0], UPPER_SWEEP);
  const avoided = validateModule(lairTunnelsFile({ avoidable: true }));
  assert.equal(room(avoided, "lair").avoidable, true);
  assert.deepEqual(regionSweeps(avoided)[0].rooms, ["stair-foot", "alcove"]);
  // Only a long module is swept.
  assert.deepEqual(regionSweeps(regionTunnels), []);
  assert.deepEqual(regionSweeps(ratTunnels), []);
});

test("a sweep's required path visits its rooms, nearest first, then the objective", () => {
  assert.deepEqual(requiredPath(lairTunnels).roomIds, [
    "stair-foot",
    "rat-cellar",
    "den",
  ]);
  assert.deepEqual(requiredPath(lairTunnels, UPPER_SWEEP).roomIds, [
    "stair-foot",
    "alcove",
    "lair",
    "rat-cellar",
    "den",
  ]);
});

test("a cautious run on a sweep fights what waits in each room", () => {
  const runtime = createFifthRuntime(lairTunnels, testFighterAt(3));
  // The fewest-fights route leaves the lair alone.
  const plain = playAdventure(runtime, "cautious", 0);
  assert.ok(!plain.roomIds.includes("lair"));
  const swept = playAdventure(runtime, "cautious", 0, { sweep: UPPER_SWEEP });
  assert.ok(swept.roomIds.includes("lair"));
  // The guardian's bite always kills.
  assert.equal(swept.outcome, "defeat");
});

test("the validator refuses an avoidable room on a declared route, or outside a long module", () => {
  assert.throws(
    () =>
      validateModule(
        lairTunnelsFile({
          avoidable: true,
          routes: [{ id: "lair", name: "by the lair", rooms: ["lair"] }],
        }),
      ),
    /room lair is avoidable, but route lair names it: an avoidable room must lie off every declared route\./u,
  );
  const short = structuredClone(lairTunnelsFile({ avoidable: true }));
  delete short.long;
  assert.throws(
    () => validateModule(short),
    /room lair is avoidable, but only a long module's rooms are swept\./u,
  );
  const odd = lairTunnelsFile();
  room(odd, "lair").avoidable = false;
  assert.throws(
    () => validateModule(odd),
    /room lair avoidable must be true, or left out\./u,
  );
  const winning = structuredClone(longTunnelsFile);
  room(winning, "den").avoidable = true;
  assert.throws(
    () => validateModule(winning),
    /room den is avoidable, but winning its fight is the module's victory\./u,
  );
});

test("the validator refuses a long module with a region whose exit can't be reached", () => {
  // A grate drops behind the character in the cistern.
  const grated = structuredClone(longTunnelsFile);
  grated.flags = ["grate-dropped"];
  room(grated, "cistern").sets = "grate-dropped";
  grated.passages.find(({ id }) => id === "cellar-to-cistern").closeWhen =
    "grate-dropped";
  assert.throws(
    () => validateModule(grated),
    /region lower has no exit to reach from room cistern: every way out passes passage cellar-to-cistern, which can close\. Every region of a long module needs an exit the character can reach from each of its rooms \(D9\)\./u,
  );
  // A long module with no exit at all.
  const sealed = structuredClone(longTunnelsFile);
  delete room(sealed, "stair-foot").exit;
  sealed.endings = sealed.endings.filter(({ id }) => id !== "climbed-out");
  assert.throws(
    () => validateModule(sealed),
    /region upper has no exit to reach from room stair-foot: the module has no exit\./u,
  );
});

test("the gate fails a long module whose sweep is too deadly, naming the region", () => {
  const result = gateAdventure(lairTunnels, GATE_OPTIONS);
  assert.equal(result.ok, true);
  const { verdict } = result;
  assert.equal(verdict.qualified, false);
  // The fewest-fights route leaves the lair alone and survives.
  assert.equal(verdict.survival.ok, true);
  assert.deepEqual(
    verdict.sweeps.map(({ region, name, difficulty }) => [
      region,
      name,
      difficulty,
    ]),
    [
      ["upper", "Upper Tunnels", "hard"],
      ["lower", "Lower Tunnels", "hard"],
    ],
  );
  const [upper, lower] = verdict.sweeps;
  assert.equal(upper.survival.ok, false);
  assert.equal(upper.survival.rate, 0);
  assert.equal(upper.alwaysFail.ok, false);
  assert.equal(lower.survival.ok, true);
  const text = renderGateResult(lairTunnels, result);
  assert.match(
    text,
    new RegExp(
      `\\n {2}Sweep of region upper \\(Upper Tunnels\\), too deadly, FAIL: the level 3, 5th percentile Fighter playing cautious survived 0\\.0% of 4 runs with its weakest kit, ${upper.survival.kit} \\([^)]*\\); hard needs 75\\.0%\\.`,
      "u",
    ),
  );
  assert.match(
    text,
    /\n {2}Sweep of region lower \(Lower Tunnels\), too deadly, pass: /u,
  );
  assert.match(
    text,
    /\n {2}Sweep of region upper \(Upper Tunnels\), too deadly when every check fails, FAIL: /u,
  );

  // Marking the deadly room avoidable leaves it out of the sweep.
  const avoided = gateAdventure(
    validateModule(lairTunnelsFile({ avoidable: true })),
    GATE_OPTIONS,
  );
  assert.equal(avoided.ok, true);
  assert.equal(avoided.verdict.qualified, true);
  assert.ok(avoided.verdict.sweeps.every(({ survival }) => survival.ok));
});

test("a sweep is judged one difficulty lower than the module's", () => {
  const result = gateAdventure(
    validateModule(lairTunnelsFile({ avoidable: true })),
    GATE_OPTIONS,
  );
  assert.equal(result.ok, true);
  for (const [declared, swept, required] of [
    ["easy", "medium", 0.85],
    ["medium", "hard", 0.75],
    // Hard has none lower: its sweeps are judged at hard.
    ["hard", "hard", 0.75],
  ]) {
    const verdict = gateVerdictAt(result.verdict, declared);
    for (const sweep of verdict.sweeps) {
      assert.equal(sweep.difficulty, swept);
      assert.equal(sweep.survival.required, required);
    }
  }
});

test("a sweep that can't reach a room is a named failure", () => {
  // Only a success at the winch sets the flag that opens the grate.
  const module = lairTunnelsFile({ avoidable: true });
  module.flags = ["grate-open"];
  room(module, "alcove").features.push({
    id: "winch",
    name: "Winch",
    description: "A rusted winch works a grate in the floor.",
    check: {
      skill: "athletics",
      dc: 10,
      bands: { success: { effects: [{ type: "set", flag: "grate-open" }] } },
    },
  });
  module.passages.find(({ id }) => id === "cellar-to-cistern").openWhen =
    "grate-open";
  // The cistern's rest site is the lower region's, and needs the grate.
  const result = gateAdventure(validateModule(module), GATE_OPTIONS);
  assert.deepEqual(result.failure, {
    code: "unsweepable-region",
    message:
      "lair-tunnels: the sweep of region lower (Lower Tunnels) can't reach room cistern: passage cellar-to-cistern opens only once flag grate-open is set, and nothing the character does sets it for sure. Mark the room avoidable if the character need never go there.",
  });
});

test("modules without regions, or not long, are not swept", () => {
  for (const module of [ratTunnels, regionTunnels]) {
    const result = gateAdventure(module, GATE_OPTIONS);
    assert.equal(result.ok, true);
    assert.equal(result.verdict.sweeps, undefined);
    assert.doesNotMatch(renderGateResult(module, result), /Sweep of/u);
  }
});

test("the gate fails a module whose route passes an avoidable room on its way", () => {
  // A route to a Bone Pit beyond the lair names only the pit, but must
  // pass the lair to get there.
  const module = lairTunnelsFile({
    avoidable: true,
    routes: [{ id: "pit", name: "by the bone pit", rooms: ["bone-pit"] }],
  });
  module.rooms.push({
    id: "bone-pit",
    name: "Bone Pit",
    at: [-2, 0],
    description: "A pit heaped with old bones.",
    region: "upper",
    features: [],
    items: [],
  });
  module.passages.push({
    id: "lair-to-pit",
    between: ["lair", "bone-pit"],
    description: "A drop at the back of the lair.",
  });
  assert.deepEqual(
    gateAdventure(validateModule(module), GATE_OPTIONS).failure,
    {
      code: "avoidable-on-route",
      message:
        "lair-tunnels: room lair is avoidable, but route pit (by the bone pit) passes it: an avoidable room must lie off every declared route.",
    },
  );
  // Without declared routes, the fewest-fights route is the one judged.
  const cellar = structuredClone(longTunnelsFile);
  room(cellar, "rat-cellar").avoidable = true;
  assert.deepEqual(
    gateAdventure(validateModule(cellar), GATE_OPTIONS).failure,
    {
      code: "avoidable-on-route",
      message:
        "long-tunnels: room rat-cellar is avoidable, but the fewest-fights route passes it: an avoidable room must lie off every declared route.",
    },
  );
});
