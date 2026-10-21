// #407: the gate judges declared routes. A module may declare its routes:
// entrance-to-objective paths, each a list of rooms that must be passed in
// order. The gate judges each as it judges the fewest-fights route (the
// cautious style, every kit and level, seeded and always-fail checks), and
// fails the module when any route falls below its difficulty, naming the
// route and its weakest kit and level. A route that can't be followed is a
// named failure. A module that declares none is judged as before.
// Adventure 41.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  playAdventure,
  renderGateResult,
  requiredPath,
} from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { forkedTunnels, forkedTunnelsFile } from "./fixtures/modules.mjs";

const GATE_OPTIONS = {
  seeds: [0, 1, 2, 3],
  reportStealth: false,
  reportRetreat: false,
  reportUseRoom: false,
  reportReactions: false,
};
const CELLAR = {
  id: "cellar",
  name: "through the cellar",
  rooms: ["rat-cellar"],
};
const HALL = {
  id: "guard-hall",
  name: "through the guard hall",
  rooms: ["guard-hall"],
};

const routed = (routes) => validateModule(forkedTunnelsFile(routes));

test("the adventure format bumps", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 44);
});

test("a module declares its routes, each a list of rooms to pass", () => {
  assert.deepEqual(forkedTunnels.routes, [CELLAR, HALL]);
  // A module may declare none.
  assert.equal(validateModule(forkedTunnelsFile()).routes, undefined);
});

test("the validator refuses a route that is malformed or names an unknown room", () => {
  for (const [routes, message] of [
    [[], /routes must list 1–6 entries\./u],
    [[{ ...CELLAR, rooms: [] }], /route 1 rooms must list 1–20 entries\./u],
    [
      [{ ...CELLAR, rooms: ["vault"] }],
      /route cellar names unknown room vault\./u,
    ],
    [
      [{ ...CELLAR, rooms: ["rat-cellar", "rat-cellar"] }],
      /route cellar names room rat-cellar twice\./u,
    ],
    [[CELLAR, { ...HALL, id: "cellar" }], /duplicate route id cellar\./u],
    [[{ ...CELLAR, extra: 1 }], /route 1 must have exactly id, name, rooms\./u],
  ]) {
    assert.throws(() => routed(routes), message);
  }
});

test("a route's required path passes its rooms in order on the way to the objective", () => {
  // Undeclared: the fewest-fights route, through the cellar.
  assert.deepEqual(requiredPath(forkedTunnels).roomIds, [
    "stair-foot",
    "rat-cellar",
    "den",
  ]);
  assert.deepEqual(requiredPath(forkedTunnels, HALL).roomIds, [
    "stair-foot",
    "guard-hall",
    "hall-stair",
    "den",
  ]);
  assert.deepEqual(requiredPath(forkedTunnels, CELLAR).roomIds, [
    "stair-foot",
    "rat-cellar",
    "den",
  ]);
});

test("a cautious run on a route goes through its rooms", () => {
  const runtime = createFifthRuntime(forkedTunnels, TEST_FIGHTER);
  const hall = playAdventure(runtime, "cautious", 0, { route: HALL });
  assert.ok(hall.roomIds.includes("guard-hall"));
  assert.ok(!hall.roomIds.includes("rat-cellar"));
  // The guardian's bite always kills.
  assert.equal(hall.outcome, "defeat");
  const cellar = playAdventure(runtime, "cautious", 0, { route: CELLAR });
  assert.ok(cellar.roomIds.includes("rat-cellar"));
  assert.ok(!cellar.roomIds.includes("guard-hall"));
});

test("the gate fails a module whose deadlier route is below its difficulty, naming the route", () => {
  // Undeclared, only the cellar route is judged, and the module passes.
  const plain = gateAdventure(
    validateModule(forkedTunnelsFile()),
    GATE_OPTIONS,
  );
  assert.equal(plain.ok, true);
  assert.equal(plain.verdict.qualified, true);
  assert.equal(plain.verdict.routes, undefined);

  const result = gateAdventure(forkedTunnels, GATE_OPTIONS);
  assert.equal(result.ok, true);
  const { verdict } = result;
  assert.equal(verdict.qualified, false);
  assert.deepEqual(
    verdict.routes.map(({ id, name }) => [id, name]),
    [
      ["cellar", "through the cellar"],
      ["guard-hall", "through the guard hall"],
    ],
  );
  const [cellar, hall] = verdict.routes;
  assert.equal(cellar.survival.ok, true);
  assert.equal(cellar.alwaysFail.ok, true);
  // The cellar route is the fewest-fights route: the same runs.
  assert.deepEqual(cellar.survival, verdict.survival);
  assert.equal(hall.survival.ok, false);
  assert.equal(hall.survival.rate, 0);
  assert.equal(hall.alwaysFail.ok, false);
  assert.equal(hall.survival.level, 1);
  const text = renderGateResult(forkedTunnels, result);
  assert.match(
    text,
    new RegExp(
      `\\n {2}Route guard-hall \\(through the guard hall\\), too deadly, FAIL: the level 1, 5th percentile Fighter playing cautious survived 0\.0% of 4 runs with its weakest kit, ${hall.survival.kit} \\(`,
      "u",
    ),
  );
  assert.match(
    text,
    /\n {2}Route cellar \(through the cellar\), too deadly, pass: /u,
  );
  assert.match(
    text,
    /\n {2}Route guard-hall \(through the guard hall\), too deadly when every check fails, FAIL: /u,
  );
});

test("a route that can't be followed is a named failure", () => {
  // The cache opens only by talking, and no style talks.
  const talking = gateAdventure(
    routed([CELLAR, { id: "cache", name: "by the cache", rooms: ["cache"] }]),
    GATE_OPTIONS,
  );
  assert.deepEqual(talking.failure, {
    code: "unfollowable-route",
    message:
      "forked-tunnels: route cache (by the cache) can't be followed: no way reaches room cache: no style talks, and only talking opens the way through stair-foot > cache.",
  });
  // Only a success at the sluice wheel sets the flag that opens the sluice.
  const flagged = gateAdventure(
    routed([{ id: "sluice", name: "by the sluice", rooms: ["sluice-room"] }]),
    GATE_OPTIONS,
  );
  assert.deepEqual(flagged.failure, {
    code: "unfollowable-route",
    message:
      "forked-tunnels: route sluice (by the sluice) can't be followed: no way reaches room sluice-room: passage alcove-to-sluice opens only once flag sluice-open is set, and nothing the character does sets it for sure.",
  });
  assert.match(
    renderGateResult(forkedTunnels, flagged),
    /does not qualify: unfollowable-route\. forked-tunnels: route sluice/u,
  );
});
