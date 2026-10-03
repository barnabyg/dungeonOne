// Named Hollow Beacon v13 character journeys for the issue 95 player
// qualification. Each journey creates a level-1 Fighter and plays offered
// options through the shipped HTTP server and save authority, running in its
// own process so a journey can kill and relaunch it. Only the provider is
// scripted (tests/fixtures/issue-93-server.mjs).
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { beaconExamine, commandCall } from "./fixtures/character-journeys.mjs";

const SERVER = fileURLToPath(
  new URL("./fixtures/issue-93-server.mjs", import.meta.url),
);

async function launchServer(directory, seed) {
  const child = fork(
    SERVER,
    [
      join(directory, "unused-slot.json"),
      String(seed),
      join(directory, "characters.json"),
    ],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const url = await new Promise((resolve, reject) => {
    child.once("message", (message) => resolve(message.url));
    child.once("exit", () => reject(new Error(output)));
  });
  return {
    url,
    calls: () => output.split("provider-call\n").length - 1,
    async kill() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = new Promise((resolve) => {
        child.once("exit", resolve);
      });
      child.kill();
      await exited;
    },
  };
}

const post = async (server, path, body) => {
  const response = await fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const state = async (server) => (await fetch(`${server.url}/api/state`)).json();
const library = async (server) =>
  (await fetch(`${server.url}/api/characters`)).json();

async function startAda(server) {
  let data = await library(server);
  const created = await post(server, "/api/characters/create", {
    name: "Ada",
    preset: "balanced",
    revision: data.revision,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  data = created.body.library;
  const played = await post(server, "/api/characters/play", {
    characterId: data.characters[0].sheet.id,
    adventureId: "hollow-beacon",
    revision: data.revision,
    confirmed: true,
  });
  assert.equal(played.status, 200, JSON.stringify(played.body));
  return played.body.view;
}

/** The offered call a journey step names; `fight` attacks one round. */
function stepCall(step) {
  const [verb, target] = step.split(" ");
  if (verb === "attack" || verb === "fight") {
    return { name: "attack", arguments: { opponent_id: target } };
  }
  if (verb === "check") {
    return { name: "check_ability", arguments: { checkId: target } };
  }
  if (verb === "recover") {
    return { name: "recover", arguments: { target } };
  }
  return commandCall(step);
}

const offered = (view, expected) =>
  view.actions.find(
    ({ call }) =>
      call.name === expected.name &&
      Object.entries(expected.arguments).every(
        ([key, value]) => JSON.parse(call.argumentsJson)[key] === value,
      ),
  );

/** Clicks the offered option for one step and returns its committed cards. */
async function click(server, step) {
  const before = await state(server);
  const option = offered(before, stepCall(step));
  assert.ok(option, `${step} must be offered`);
  const result = await post(server, "/api/turn", {
    revision: before.revision,
    optionId: option.id,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.committed, true, step);
  return result.body.cards.map(({ text }) => text).join("\n");
}

/**
 * Plays steps in order. `fight <id>` repeats the attack until the opponent is
 * no longer offered or the adventure ends. Returns every card's text.
 */
async function play(server, steps) {
  const cards = [];
  for (const step of steps) {
    if (step.startsWith("fight ")) {
      do {
        cards.push(await click(server, step));
      } while (
        (await state(server)).scene.outcome === "playing" &&
        offered(await state(server), stepCall(step))
      );
    } else {
      cards.push(await click(server, step));
    }
  }
  return cards.join("\n");
}

async function withServer(seed, body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-95-"));
  const servers = [];
  const relaunch = async () => {
    await servers.at(-1)?.kill();
    servers.push(await launchServer(directory, seed));
    return servers.at(-1);
  };
  try {
    await body(await relaunch(), relaunch, directory);
  } finally {
    await servers.at(-1)?.kill();
    await rm(directory, { recursive: true, force: true });
  }
}

const sheet = async (server) => (await library(server)).characters[0].sheet;
const carried = (view) => view.character.collectedItems.map(({ id }) => id);

// Shared route fragments.
const PLATE_AND_COMPONENT = [
  "move watch-loft",
  "move signal-records",
  "examine setting-plate",
  "take signal-component",
  "move watch-loft",
  "move watch-yard",
];
const RIDGE = ["move ridge-trail", "fight ridge-raider", "move ridge-shelter"];
const FINAL_BOARD = "examine final-warning-board";
const ON_TIME = /Before Day 3: the warning is issued before the planned turn/;
const LATE = /Day 3 or later: the caravan missed its planned turn/;

/** Asserts a surviving ending credited 1,000 XP once and survives restart. */
async function assertCompletedOnce(server, relaunch, cards) {
  assert.match(cards, /Level 1 → 2/);
  assert.equal((cards.match(/1000 XP credited/g) ?? []).length, 1);
  const completed = await state(server);
  assert.equal(completed.scene.outcome, "victory");
  assert.deepEqual(completed.actions, []);
  const restarted = await relaunch();
  const review = await state(restarted);
  assert.deepEqual(review, { ...completed, newGameSeed: review.newGameSeed });
  const turn = await post(restarted, "/api/turn", {
    revision: review.revision,
    message: "Light the beacon again",
  });
  assert.notEqual(turn.status, 200);
  assert.equal(restarted.calls(), 0);
  const after = await sheet(restarted);
  assert.equal(after.xp, 1000);
  assert.equal(after.level, 2);
}

test("on time: a failed check, both fights and a spent component end in a verified safe signal", async () =>
  withServer(0, async (server, relaunch) => {
    await startAda(server);
    const check = await click(server, "check read-beacon");
    assert.match(check, /failure/i);
    assert.doesNotMatch(check, /XP earned/);
    const cards = await play(server, [
      ...PLATE_AND_COMPONENT,
      ...RIDGE,
      "move tower-approach",
      "fight tower-sentry",
      "move beacon-tower",
      "examine tower-work-order",
      "talk vey plate-proof ask",
      "place signal-component at beacon-socket",
      FINAL_BOARD,
      "resolve verified-safe-signal",
    ]);
    assert.match(cards, /Combat victory! The ridge raider is defeated/);
    assert.match(cards, /Combat victory! The tower sentry is defeated/);
    assert.match(cards, /component is fitted permanently .* and spent/);
    assert.match(cards, ON_TIME);
    assert.doesNotMatch(cards, LATE);
    const final = await state(server);
    assert.equal(final.clocks[0].value, 2);
    assert.deepEqual(carried(final), []);
    await assertCompletedOnce(server, relaunch, cards);
  }));

for (const seed of [0, 1, 2, 3]) {
  test(`seed ${seed}: the valley road avoids every fight and ends late with the slower human warning`, async () =>
    withServer(seed, async (server, relaunch) => {
      await startAda(server);
      const cards = await play(server, beaconExamine);
      assert.doesNotMatch(cards, /Combat begins|Initiative/);
      assert.match(cards, /post the warning for travellers/);
      assert.match(cards, LATE);
      assert.doesNotMatch(cards, ON_TIME);
      assert.equal((await state(server)).character.hp, 19);
      await assertCompletedOnce(server, relaunch, cards);
    }));
}

test("casualty: killing Vey after avoiding the sentry ends late with an urgent risky signal and the unspent component", async () =>
  withServer(0, async (server, relaunch) => {
    await startAda(server);
    const cards = await play(server, [
      ...PLATE_AND_COMPONENT,
      ...RIDGE,
      "move drainage-walk",
      "move beacon-tower",
      "fight vey",
      "examine control-access",
      FINAL_BOARD,
      "resolve urgent-risky-signal",
    ]);
    assert.match(cards, /Vey dies at Beacon Tower/);
    assert.match(cards, /Vey is dead; the final warning cannot reverse/);
    assert.match(cards, /emergency shutter warning/);
    assert.match(cards, LATE);
    assert.deepEqual(carried(await state(server)), ["signal-component"]);
    await assertCompletedOnce(server, relaunch, cards);
  }));

test("defeat: a level-1 Fighter can fall to the ridge raider; no XP is awarded and Review survives restart", async () =>
  withServer(33, async (server, relaunch) => {
    await startAda(server);
    const cards = await play(server, [
      "move ridge-trail",
      "fight ridge-raider",
    ]);
    assert.match(cards, /Combat begins against the ridge raider/);
    const defeated = await state(server);
    assert.equal(defeated.scene.outcome, "defeat");
    assert.equal(defeated.character.hp, 0);
    assert.deepEqual(defeated.actions, []);
    assert.doesNotMatch(cards, /XP credited|Level 1 → 2/);
    const restarted = await relaunch();
    assert.deepEqual(await state(restarted), {
      ...defeated,
      newGameSeed: (await state(restarted)).newGameSeed,
    });
    assert.equal(restarted.calls(), 0);
    const after = await sheet(restarted);
    assert.equal(after.xp, 0);
    assert.equal(after.level, 1);
  }));

test("restarts mid-combat and at the Day 3 threshold continue exactly, then finish with one award", async () =>
  withServer(0, async (first, relaunch) => {
    await startAda(first);
    await play(first, [
      ...PLATE_AND_COMPONENT,
      ...RIDGE,
      "move tower-approach",
      "attack tower-sentry",
    ]);
    const midCombat = await state(first);
    assert.ok(offered(midCombat, stepCall("attack tower-sentry")));
    let server = await relaunch();
    assert.deepEqual(await state(server), midCombat);
    assert.equal(server.calls(), 0);
    await play(server, ["fight tower-sentry", "move ridge-shelter"]);
    // Crossing Day 3 fires the deadline threshold once.
    const threshold = await play(server, ["move drainage-walk"]);
    assert.match(threshold, /Day 2 → Day 3/);
    const crossed = await state(server);
    server = await relaunch();
    assert.deepEqual(await state(server), crossed);
    assert.equal(server.calls(), 0);
    const cards = await play(server, [
      "move beacon-tower",
      "examine tower-work-order",
      "talk vey plate-proof ask",
      "place signal-component at beacon-socket",
      FINAL_BOARD,
      "resolve verified-safe-signal",
    ]);
    assert.doesNotMatch(cards, /Day 2 → Day 3/);
    assert.match(cards, LATE);
    assert.equal((await state(server)).clocks[0].value, 3);
    await assertCompletedOnce(server, relaunch, cards);
  }));
