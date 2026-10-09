// #237: monsters check morale (a house rule) when their side's first
// combatant falls and again at half strength, and one that fails flees on its
// turn. A fled monster takes its loot with it, and gives half its XP if it
// exchanged blows with the character first, or none.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playAdventure, qualifyAdventure } from "../dist/balance-5e.js";
import { validateFifthBestiary } from "../dist/bestiary-5e.js";
import { act, legalTargets } from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FifthSession, sessionSeed } from "../dist/session-5e.js";
import {
  fleeingGoblins,
  fleeingSeed,
  GOBLINS,
  pouchOf,
} from "./fixtures/fleeing-goblins.mjs";
import { bestiary } from "./fixtures/bestiary.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  ada,
  attack,
  begin,
  goblin,
  KILL,
} from "./fixtures/morale-encounter.mjs";

const morale = (events) => events.filter(({ type }) => type === "morale");

test("the first fall makes the rest of the side check morale, in initiative order", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2"), goblin("g3")],
    ...KILL,
    [20, 9], // Goblin 2: 9 − 1 = 8 against DC 8, held.
    [20, 8], // Goblin 3: 8 − 1 = 7, fails.
  );
  const { state: after, events } = attack(state, random, "g1");
  assert.equal(random.remaining(), 0);
  assert.deepEqual(morale(events), [
    {
      type: "morale",
      combatantId: "g2",
      trigger: "first-fall",
      d20: 9,
      bonus: -1,
      total: 8,
      dc: 8,
      success: true,
    },
    {
      type: "morale",
      combatantId: "g3",
      trigger: "first-fall",
      d20: 8,
      bonus: -1,
      total: 7,
      dc: 8,
      success: false,
    },
  ]);
  assert.deepEqual(after.fleeing, ["g3"]);
  assert.deepEqual(after.fled, []);
  // A fleeing goblin is still there to be hit until its turn.
  assert.deepEqual(
    legalTargets(after, "pc").map(({ id }) => id),
    ["g2", "g3"],
  );
});

test("a side checks again at half strength, and each check is made once", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2"), goblin("g3"), goblin("g4")],
    ...KILL,
    [20, 20],
    [20, 20],
    [20, 20], // First fall: all three hold.
  );
  const first = attack(state, random, "g1");
  assert.equal(morale(first.events).length, 3);
  const surged = act(
    first.state,
    { type: "action-surge", actorId: "pc" },
    random,
  );
  // Her turn then ends by itself, and Goblins 3 and 4 swing and miss.
  const second = attack(
    surged.state,
    dice(...KILL, [20, 20], [20, 20], [20, 1], [20, 1]),
    "g2",
  );
  // Two of four left: half strength.
  assert.deepEqual(
    morale(second.events).map(({ combatantId, trigger }) => [
      combatantId,
      trigger,
    ]),
    [
      ["g3", "half-strength"],
      ["g4", "half-strength"],
    ],
  );
  assert.deepEqual(second.state.moraleChecks, [
    { side: "opponents", trigger: "first-fall" },
    { side: "opponents", trigger: "half-strength" },
  ]);
  // Her next kill draws no morale die: both checks are spent. Goblin 4 then
  // swings and misses.
  const random3 = dice(...KILL, [20, 1]);
  const third = attack(second.state, random3, "g3");
  assert.equal(random3.remaining(), 0);
  assert.deepEqual(morale(third.events), []);
});

test("a pair's first fall is also half strength: one check, not two", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2")],
    ...KILL,
    [20, 20],
  );
  const { state: after, events } = attack(state, random, "g1");
  assert.equal(random.remaining(), 0);
  assert.equal(morale(events).length, 1);
  assert.deepEqual(after.moraleChecks, [
    { side: "opponents", trigger: "first-fall" },
    { side: "opponents", trigger: "half-strength" },
  ]);
});

test("a combatant with no morale DC (undead, mindless) never checks", () => {
  const skeleton = (id) => {
    const { morale: _never, ...rest } = goblin(id, { name: `Skeleton ${id}` });
    void _never;
    return rest;
  };
  const { state, random } = begin(
    [ada, skeleton("g1"), skeleton("g2"), skeleton("g3")],
    ...KILL,
  );
  const { events, state: after } = attack(state, random, "g1");
  assert.equal(random.remaining(), 0);
  assert.deepEqual(morale(events), []);
  assert.deepEqual(after.fleeing, []);
});

test("a goblin that fails flees on its turn instead of attacking, and the fight is won", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2")],
    ...KILL,
    [20, 2], // Goblin 2 fails: 2 − 1 = 1.
  );
  const first = attack(state, random, "g1");
  assert.deepEqual(first.state.fleeing, ["g2"]);
  const end = dice();
  const ended = act(first.state, { type: "end-turn", actorId: "pc" }, end);
  assert.equal(ended.rejection, undefined);
  assert.equal(end.remaining(), 0);
  const types = ended.events.map(({ type }) => type);
  assert.ok(!types.includes("attack"));
  assert.deepEqual(
    ended.events.filter(({ type }) => type === "fled" || type === "ended"),
    [
      { type: "fled", combatantId: "g2" },
      { type: "ended", outcome: "victory" },
    ],
  );
  assert.deepEqual(ended.state.fled, ["g2"]);
  assert.deepEqual(ended.state.fleeing, []);
  assert.equal(ended.state.outcome, "victory");
});

test("a fleeing goblin cut down before its turn is defeated, not fled", () => {
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2")],
    ...KILL,
    [20, 2],
  );
  const first = attack(state, random, "g1");
  const surged = act(
    first.state,
    { type: "action-surge", actorId: "pc" },
    random,
  );
  const second = attack(surged.state, dice(...KILL), "g2");
  assert.equal(second.state.outcome, "victory");
  assert.deepEqual(second.state.fled, []);
  assert.deepEqual(second.state.fleeing, []);
  assert.ok(second.events.some(({ type }) => type === "defeated"));
});

// A fled combatant can't be attacked, and its flight can bring the rest to
// half strength: tested beside surrender's yielding in issue-238.test.mjs.

test("a lone monster never checks morale", () => {
  const { state, random } = begin([ada, goblin("g1")], ...KILL);
  const { events } = attack(state, random, "g1");
  assert.equal(random.remaining(), 0);
  assert.deepEqual(morale(events), []);
});

// The runtime: a fled goblin leaves no body and keeps its pouch, and gives
// half its XP for having fought; the defeated goblins' bodies still hold
// theirs.

test("a fled goblin's pouch is absent at settlement, it leaves no body, and it gives half its XP", () => {
  const { runtime, random, state: won } = fleeingSeed();
  const [{ opponentId: gone }] = won.fledOpponents;
  const fallen = GOBLINS.filter((id) => id !== gone);
  const bodies = runtime
    .projectActions(won)
    .filter(({ action }) => action === "examine")
    .map(({ target }) => target.id);
  assert.deepEqual(bodies, fallen);
  assert.ok(
    runtime.handleAction(won, { type: "examine", targetId: gone }, random)
      .rejection,
  );
  assert.deepEqual(
    runtime
      .projectDmScene(won)
      .room.opponents.map(({ id, condition }) => [id, condition]),
    GOBLINS.map((id) => [id, id === gone ? "fled" : "defeated"]),
  );

  let state = won;
  for (const action of [
    ...fallen.flatMap((id) => [
      { type: "examine", targetId: id },
      { type: "take", itemId: pouchOf(id) },
    ]),
    { type: "move", destinationId: "barrow-mouth" },
    { type: "leave", roomId: "barrow-mouth" },
  ]) {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(action));
    state = result.state;
  }
  assert.equal(state.status, "escaped");
  const settlement = runtime.projectSettlement(state);
  const [encounter] = settlement.xp;
  const names = fallen.map((id) => `Goblin ${id.slice(-1)}`);
  // It attacked Ada before it fled: half a Goblin Minion's 25 XP.
  assert.equal(won.fledOpponents[0].engaged, true);
  assert.deepEqual(encounter, {
    id: "fleeing-goblins/encounter/barrow-goblin",
    name: `Defeated ${names.join(" and ")}; drove off Goblin ${gone.slice(-1)}`,
    xp: 25 * fallen.length + 12,
  });
  assert.deepEqual(
    settlement.coin.map(({ id }) => id),
    fallen.map((id) => `fleeing-goblins/${pouchOf(id)}`),
  );

  // Had it fled without exchanging a blow, it would give nothing.
  const untouched = {
    ...state,
    fledOpponents: [{ ...state.fledOpponents[0], engaged: false }],
  };
  assert.deepEqual(runtime.projectSettlement(untouched).xp[0], {
    id: "fleeing-goblins/encounter/barrow-goblin",
    name: `Defeated ${names.join(" and ")}`,
    xp: 25 * fallen.length,
  });
  // A whole band that fled after fighting is driven off, for half its XP;
  // one that never fought gives none, so no award is credited for it.
  const band = (engaged) => ({
    ...state,
    fledOpponents: GOBLINS.map((opponentId) => ({
      encounterId: "barrow-goblin",
      opponentId,
      engaged,
    })),
  });
  assert.deepEqual(runtime.projectSettlement(band(true)).xp[0], {
    id: "fleeing-goblins/encounter/barrow-goblin",
    name: "Drove off Goblin 1, Goblin 2 and Goblin 3",
    xp: 36,
  });
  assert.deepEqual(
    runtime.projectSettlement(band(false)).xp.map(({ id }) => id),
    ["fleeing-goblins/ending/out-with-the-torc"],
  );
});

test("a combatant has exchanged blows once it attacks or is attacked, hit or miss", () => {
  // Ada misses Goblin 1; Goblins 2 and 3 have done nothing yet.
  const { state, random } = begin(
    [ada, goblin("g1"), goblin("g2"), goblin("g3")],
    [20, 2],
  );
  assert.deepEqual(state.engaged, []);
  const { state: after } = attack(state, random, "g1");
  assert.deepEqual(after.engaged, ["pc", "g1"]);
});

test("the AI DM's scene and the initiative table show a fleeing goblin, then a fled one", () => {
  const runtime = createFifthRuntime(fleeingGoblins, firstFighter(0));
  const random = createSeededRandom(1);
  let state = runtime.createSession();
  for (const action of [
    { type: "begin" },
    { type: "move", destinationId: "burial-hall" },
  ]) {
    state = runtime.handleAction(state, action, random).state;
  }
  const marked = (encounter) => ({ ...state, encounter });
  const fleeing = marked({ ...state.encounter, fleeing: ["goblin-2"] });
  const fled = marked({ ...state.encounter, fled: ["goblin-2"] });
  const condition = (at) =>
    runtime
      .projectDmScene(at)
      .room.opponents.find(({ id }) => id === "goblin-2").condition;
  assert.equal(condition(fleeing), "fleeing");
  assert.equal(condition(fled), "fled");
  assert.match(
    runtime.projectDmScene(fleeing).combatStatus,
    /Goblin 2 is fleeing: it leaves on its turn\./,
  );
  assert.match(
    runtime.projectDmScene(fled).combatStatus,
    /Goblin 2 has fled\./,
  );
  const morale = (at) =>
    runtime
      .projectFight(at)
      .encounter.combatants.find(({ id }) => id === "goblin-2").morale;
  assert.equal(morale(state), undefined);
  assert.equal(morale(fleeing), "fleeing");
  assert.equal(morale(fled), "fled");
});

test("morale saves are narrated, carded, recorded and replay exactly from a save", async () => {
  const { seed } = fleeingSeed();
  const directory = await mkdtemp(join(tmpdir(), "issue-237-"));
  try {
    const original = await FifthSession.create(
      join(directory, "session.json"),
      "f".repeat(32),
      sessionSeed(seed, 1),
      fleeingGoblins,
      firstFighter(seed),
    );
    original.act({ type: "move", destinationId: "burial-hall" }, "click");
    const next = (session) => {
      const [target] = session.runtime.attackTargets(session.state);
      return target === undefined
        ? { type: "end-turn", actorId: "pc" }
        : { type: "attack", actorId: "pc", targetId: target.id };
    };
    const triggers = (result) =>
      result.events.some(({ type }) => type === "morale");
    // Save before each action; the first that checks morale is played
    // again from the save.
    let a;
    let b;
    let resumed;
    for (;;) {
      await original.persist();
      const action = next(original);
      a = original.act(action, "click");
      if (triggers(a.result)) {
        resumed = await FifthSession.load(original.path, [fleeingGoblins]);
        b = resumed.act(action, "click");
        assert.deepEqual(resumed.state, original.state);
        break;
      }
    }
    assert.deepEqual(b.rolls, a.rolls);
    assert.deepEqual(b.result.events, a.result.events);
    const card = original.card(a.result, a.rolls);
    assert.deepEqual(resumed.card(b.result, b.rolls), card);
    assert.match(
      card.text,
      /Goblin \d checks morale as the first of its side falls: a Wisdom saving throw, \d+ − 1 = -?\d+ against DC 8\. (Success: it stands its ground|Failure: it will flee on its turn)\./u,
    );
    const save = card.lines
      .flatMap(({ rolls }) => rolls)
      .find(({ label }) => label === "Wisdom saving throw (morale)");
    assert.equal(save.purpose, "save");
    assert.equal(save.dc, 8);
    // The rest of the fight, a flight among it, replays from the save too.
    while (original.state.encounter?.outcome === "ongoing") {
      original.act(next(original), "click");
    }
    assert.ok(original.state.fledOpponents.length > 0);
    await original.persist();
    const reloaded = await FifthSession.load(original.path, [fleeingGoblins]);
    assert.deepEqual(reloaded.state, original.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The bestiary: every monster has a morale DC or never checks.

test("the bestiary's morale DCs: goblins and their kin 8, hobgoblins 5, the undead never", () => {
  const dc = (id) =>
    bestiary.monsters.find((monster) => monster.id === id).statBlock.morale;
  assert.deepEqual(
    ["goblin-minion", "goblin-warrior", "kobold", "bandit"].map(dc),
    [8, 8, 8, 8],
  );
  assert.equal(dc("hobgoblin-warrior"), 5);
  assert.equal(dc("zombie"), "never");
  // A combatant carries the DC; one that never checks carries none.
  const runtime = createFifthRuntime(fleeingGoblins, firstFighter(0));
  const { state } = runtime.handleAction(
    runtime.handleAction(runtime.createSession(), { type: "begin" }, dice())
      .state,
    { type: "move", destinationId: "burial-hall" },
    createSeededRandom(0),
  );
  assert.equal(
    state.encounter.combatants.find(({ id }) => id === "goblin-1").morale,
    8,
  );
});

test("the bestiary refuses a monster without a morale DC, or an undead one with one", () => {
  const entry = (id, change) => {
    const copy = structuredClone(
      bestiary.monsters.find((monster) => monster.id === id),
    );
    change(copy.statBlock);
    return () => validateFifthBestiary({ ...bestiary, monsters: [copy] });
  };
  assert.throws(
    entry("goblin-minion", (block) => delete block.morale),
    /statBlock must have name, .*, attacks, morale and may have/,
  );
  assert.throws(
    entry("goblin-minion", (block) => (block.morale = "sometimes")),
    /statBlock morale must be a DC from 1 to 30, or "never"\./,
  );
  assert.throws(
    entry("goblin-minion", (block) => (block.morale = 31)),
    /statBlock morale must be/,
  );
  assert.throws(
    entry("skeleton", (block) => (block.morale = 10)),
    /statBlock is Undead, so its morale must be "never"\./,
  );
});

// The balance harness: survival and XP come from the runtime, so a fled
// goblin's XP is at most halved in a run, and each fight counts who fled.

test("the harness counts fled goblins and credits a fled one at most half its XP", () => {
  const runtime = createFifthRuntime(fleeingGoblins, firstFighter(0));
  let fled = 0;
  for (let seed = 0; seed < 60; seed++) {
    const run = playAdventure(runtime, "direct", seed);
    if (run.outcome === "defeat") {
      continue;
    }
    const [fight] = run.encounters;
    fled += fight.fled;
    const ending = run.outcome === "escape-with-loot" ? 250 : 0;
    const defeated = ending + 25 * (GOBLINS.length - fight.fled);
    assert.ok(run.xp >= defeated && run.xp <= defeated + 12 * fight.fled);
  }
  assert.ok(fled > 0, "some goblins fled");
  // A goblin that may flee still counts toward the one-hit-kill check.
  const { report } = qualifyAdventure(fleeingGoblins, {
    seeds: [0],
    percentiles: [95],
    styles: ["direct"],
  });
  assert.deepEqual(
    report.cells[0].oneHitKill.map(({ opponentId }) => opponentId),
    GOBLINS,
  );
});
