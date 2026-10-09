// #285: the balance harness's check policies. Seeded rolls checks as players
// meet them; always-fail lands every check in its worst reachable band and
// always-succeed in its best. The gate plays the weakest character's cautious
// survival check on the always-fail branch too, so a module must stay
// completable and within its difficulty however its checks go, and counts
// the XP the strongest character earns on the always-succeed branch toward
// the XP limit.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECK_POLICIES,
  characterAtLevel,
  gateAdventure,
  percentileCharacters,
  playAdventure,
  qualifyAdventure,
  renderBalanceResult,
  renderGateResult,
} from "../dist/balance-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { main } from "../scripts/balance-5e.mjs";
import {
  coalStore,
  collapsingOssuary,
  fallingArch,
  gradedCellar,
  loneGoblin,
  ropeCove,
  sealedCrypt,
} from "./fixtures/modules.mjs";

const [WEAKEST] = percentileCharacters({ percentiles: [5] });

/** The state after `actions`, each accepted, on seeded dice. */
function played(runtime, actions, seed = 1) {
  const random = createSeededRandom(seed);
  let state = runtime.createSession();
  const events = [];
  for (const action of [{ type: "begin" }, ...actions]) {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const bandsOf = (events) =>
  events.flatMap((event) => (event.type === "check" ? [event.band] : []));

test("the check policies are seeded, always-fail and always-succeed", () => {
  assert.deepEqual(CHECK_POLICIES, ["seeded", "always-fail", "always-succeed"]);
  assert.equal(createFifthRuntime(gradedCellar, TEST_FIGHTER).checks, "seeded");
});

test("always-fail lands every check in its worst band, and always-succeed in its best", () => {
  const heap = { type: "examine", targetId: "rubble-heap" };
  const hatch = { type: "force", doorId: "warped-hatch" };
  const cat = { type: "talk", topicId: "the-cask" };
  const runtime = (checks) =>
    createFifthRuntime(gradedCellar, TEST_FIGHTER, { checks });
  for (const seed of [1, 2, 3]) {
    const failing = played(runtime("always-fail"), [heap, hatch, cat], seed);
    // Each check totals −3: a natural 1 at the lowest modifier.
    assert.deepEqual(bandsOf(failing.events), [
      "failure-by-5",
      "failure-by-5",
      "failure",
    ]);
    assert.ok(
      failing.events.some(({ type }) => type === "check-damage"),
      "the heap's stones fall",
    );
    assert.ok(!failing.events.some(({ type }) => type === "revealed"));
    assert.deepEqual(failing.state.openedDoorIds, []);
    for (const event of failing.events.filter(({ type }) => type === "check")) {
      assert.equal(event.roll.total, -3);
      assert.equal(event.roll.success, false);
    }

    const succeeding = played(runtime("always-succeed"), [heap, hatch, cat]);
    // The hatch authors no success by 5, so it lands in plain success.
    assert.deepEqual(bandsOf(succeeding.events), [
      "success-by-5",
      "success",
      "success-by-5",
    ]);
    assert.deepEqual(
      succeeding.events
        .filter(({ type }) => type === "revealed" || type === "discovered")
        .map(({ type }) => type),
      ["revealed", "discovered", "discovered"],
    );
    assert.deepEqual(succeeding.state.openedDoorIds, ["warped-hatch"]);
  }
});

test("a search is a check too: always-fail finds no trap, always-succeed every one", () => {
  const sheet = characterAtLevel(WEAKEST.dice, 2);
  const searched = (checks) =>
    played(createFifthRuntime(sealedCrypt, sheet, { checks }), [
      { type: "move", destinationId: "hall" },
      { type: "search", roomId: "hall" },
    ]).state.foundTrapIds;
  assert.deepEqual(searched("always-fail"), []);
  assert.deepEqual(searched("always-succeed"), ["dart-trap"]);
});

test("a check that fails into a dead end is rejected, naming the check", () => {
  // Seeded, the urn shelf's Athletics check never fails by 5.
  const seeded = qualifyAdventure(collapsingOssuary, { styles: ["cautious"] });
  assert.equal(seeded.ok, true);
  const result = gateAdventure(collapsingOssuary);
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "stranded");
  assert.match(
    result.failure.message,
    /^collapsing-ossuary: a cautious run with always-fail checks was stranded in side-crypt, after .*feature urn-shelf check failure-by-5 \(closes passage hall-to-side\)\.$/u,
  );
  assert.match(
    renderGateResult(collapsingOssuary, result),
    /^The Collapsing Ossuary \(collapsing-ossuary\) does not qualify: stranded\. .*feature urn-shelf check failure-by-5/u,
  );
});

test("a module completable but too deadly when its checks fail is rejected", () => {
  const result = gateAdventure(fallingArch);
  assert.equal(result.ok, true);
  const { verdict } = result;
  assert.equal(verdict.qualified, false);
  assert.equal(verdict.survival.ok, true);
  assert.equal(verdict.survival.checks, "seeded");
  assert.equal(verdict.oneHitKill.ok, true);
  assert.equal(verdict.xp.ok, true);
  assert.equal(verdict.alwaysFail.ok, false);
  assert.equal(verdict.alwaysFail.checks, "always-fail");
  assert.equal(verdict.alwaysFail.runs, 200);
  assert.ok(
    verdict.alwaysFail.rate < 0.75,
    `survived ${verdict.alwaysFail.rate}`,
  );
  assert.match(
    renderGateResult(fallingArch, result),
    /^ {2}Too deadly when every check fails, FAIL: the level 1, 5th percentile Fighter playing cautious survived \d+\.\d% of 200 runs with its weakest kit, [a-z-]+ \(.*\); hard needs 75\.0%\.$/mu,
  );
});

test("a module with no check plays the same on every branch", () => {
  const { verdict } = gateAdventure(loneGoblin, { seeds: [0, 1, 2] });
  const { checks, ...failing } = verdict.alwaysFail;
  assert.equal(checks, "always-fail");
  assert.deepEqual(
    { ...verdict.survival, checks: undefined },
    {
      ...failing,
      checks: undefined,
    },
  );
});

test("the always-succeed branch counts toward the XP limit and is reported", () => {
  const result = gateAdventure(gradedCellar, { seeds: [0, 1, 2, 3, 4] });
  const { alwaysSucceed, available } = result.verdict.xp;
  assert.deepEqual(
    [alwaysSucceed.level, alwaysSucceed.percentile, alwaysSucceed.style],
    [1, 95, "direct"],
  );
  // Direct fights the rat behind the hatch the check opens, and the ending
  // awards the rest: all the XP offered, so no later seed is played.
  assert.equal(alwaysSucceed.mostXp, available);
  assert.ok(alwaysSucceed.runs >= 1 && alwaysSucceed.runs <= 5);
  assert.match(
    renderGateResult(gradedCellar, result),
    new RegExp(
      `^ {2}When every check succeeds, the level 1, 95th percentile Fighter playing direct earned at most ${available} of the ${available} XP offered in ${alwaysSucceed.runs} runs?\.$`,
      "mu",
    ),
  );
});

test("loot a failed check loses no longer holds the run: it heads out without it", () => {
  const sheet = characterAtLevel(WEAKEST.dice, 1);
  const runtime = createFifthRuntime(coalStore, sheet, {
    checks: "always-fail",
  });
  for (const seed of [0, 1, 2, 3, 4]) {
    const run = playAdventure(runtime, "cautious", seed);
    assert.ok(
      ["escape-without-loot", "defeat"].includes(run.outcome),
      run.outcome,
    );
    assert.ok(run.roomIds.includes("coal-store"));
  }
});

test("a run takes no retry whose damage could leave it low, so failing checks can't wear it down (#284)", () => {
  // The Rope Cove's swollen door may be forced again for 1d4 damage; when
  // every check fails, a run paying for try after try would fall at it.
  const sheet = characterAtLevel(WEAKEST.dice, 1);
  const runtime = createFifthRuntime(ropeCove, sheet, {
    checks: "always-fail",
  });
  for (const seed of [0, 1, 2, 3, 4]) {
    const run = playAdventure(runtime, "cautious", seed);
    assert.notEqual(run.outcome, "defeat", `seed ${seed}`);
  }
});

test("npm run balance plays the check policy asked for", async () => {
  let written = "";
  const write = { write: (text) => (written += text) };
  await main(
    [
      "--seeds",
      "3",
      "--styles",
      "cautious",
      "--checks",
      "always-succeed",
      "tests/fixtures/graded-cellar.json",
    ],
    write,
  );
  assert.match(
    written,
    /^The Graded Cellar \(graded-cellar\) for the Fighter, with always-succeed checks$/mu,
  );
  assert.match(written, /^ {2}Too deadly when every check fails, /mu);
  const report = qualifyAdventure(gradedCellar, {
    seeds: [0],
    styles: ["cautious"],
    checks: "always-fail",
  });
  assert.equal(report.report.checks, "always-fail");
  assert.match(
    renderBalanceResult(gradedCellar, report),
    /^The Graded Cellar \(graded-cellar\) for the Fighter, with always-fail checks$/mu,
  );
  await assert.rejects(
    main(["--checks", "sometimes"], write),
    /Usage: npm run balance/u,
  );
});
