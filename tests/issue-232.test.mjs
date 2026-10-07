// #232: monsters' attacks poison and knock prone, conditions end on a save,
// on time or with the fight, and Pack Tactics gives advantage while an ally
// stands.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateAdventure } from "../dist/balance-5e.js";
import { validateFifthBestiary } from "../dist/bestiary-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import {
  act,
  CONDITION_RULES,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  FifthSession,
  sessionSeed,
  startFifthAdventure,
} from "../dist/session-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import {
  fightRoom,
  withoutRiders,
  withStatBlocks,
} from "./fixtures/modules.mjs";

/** Returns the queued values in order, checking each die's sides. */
function dice(...queue) {
  return {
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      return value;
    },
  };
}

const saves = {
  strength: 4,
  dexterity: 1,
  constitution: 4,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};

const fighter = {
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 12,
  maxHp: 12,
  dexterity: 12,
  initiativeBonus: 1,
  saves,
  attack: {
    name: "Mace",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    criticalRange: 20,
  },
};

const beastSaves = {
  strength: 2,
  dexterity: 3,
  constitution: 1,
  intelligence: -4,
  wisdom: 0,
  charisma: -3,
};

const spider = {
  id: "spider",
  name: "Giant Spider",
  side: "opponents",
  armorClass: 14,
  hp: 26,
  maxHp: 26,
  dexterity: 16,
  initiativeBonus: 3,
  saves: beastSaves,
  attack: {
    name: "Bite",
    bonus: 5,
    damage: { dice: 1, sides: 8, modifier: 3, type: "piercing" },
    criticalRange: 20,
    rider: {
      damage: { dice: 1, sides: 6, modifier: 0, type: "poison" },
      condition: {
        kind: "poisoned",
        save: { ability: "constitution", dc: 11 },
        turns: 10,
        repeatSave: true,
      },
    },
  },
};

const wolf = (id = "wolf", name = "Wolf") => ({
  id,
  name,
  side: "opponents",
  armorClass: 12,
  hp: 11,
  maxHp: 11,
  dexterity: 15,
  initiativeBonus: 2,
  saves: beastSaves,
  packTactics: true,
  attack: {
    name: "Bite",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "piercing" },
    criticalRange: 20,
    rider: {
      condition: { kind: "prone", save: { ability: "strength", dc: 11 } },
    },
  },
});

/** A wolf without Pack Tactics. */
const loneWolf = (id, name) => {
  const { packTactics, ...rest } = wolf(id, name);
  assert.equal(packTactics, true);
  return rest;
};

/** The spider wins initiative, bites Ada and poisons her. */
function poisoned() {
  // Initiative: Ada 5 + 1, spider 18 + 3. The bite: 15 + 5 hits AC 16 for
  // 1 + 3 piercing and 2 poison; Ada's Constitution save is 6 + 4 = 10.
  return startEncounter(
    [fighter, spider],
    dice([20, 5], [20, 18], [20, 15], [8, 1], [6, 2], [20, 6]),
  );
}

test("a hit's rider deals its extra damage and a failed save gives the condition", () => {
  const { state, events } = poisoned();
  const bite = events.find(({ type }) => type === "attack");
  assert.equal(bite.damage, 4);
  assert.deepEqual(bite.rider, {
    damageRolls: [2],
    damageModifier: 0,
    damage: 2,
    damageType: "poison",
  });
  assert.equal(bite.hpAfter, 12 - 4 - 2);
  assert.deepEqual(
    events.filter(({ type }) => type === "save" || type === "condition"),
    [
      {
        type: "save",
        combatantId: "pc",
        ability: "constitution",
        d20: 6,
        bonus: 4,
        total: 10,
        dc: 11,
        success: false,
        condition: "poisoned",
        repeat: false,
      },
      {
        type: "condition",
        combatantId: "pc",
        kind: "poisoned",
        sourceId: "spider",
        source: "Bite",
        turns: 10,
        save: { ability: "constitution", dc: 11 },
      },
    ],
  );
  assert.deepEqual(state.conditions, [
    {
      kind: "poisoned",
      targetId: "pc",
      sourceId: "spider",
      source: "Bite",
      turnsLeft: 10,
      save: { ability: "constitution", dc: 11 },
    },
  ]);
  assert.equal(currentCombatant(state).id, "pc");
});

test("a successful save avoids the condition but not the extra damage", () => {
  const { state, events } = startEncounter(
    [fighter, spider],
    dice([20, 5], [20, 18], [20, 15], [8, 1], [6, 6], [20, 7]),
  );
  const save = events.find(({ type }) => type === "save");
  assert.equal(save.total, 11);
  assert.equal(save.success, true);
  assert.equal(
    events.find(({ type }) => type === "attack").hpAfter,
    12 - 4 - 6,
  );
  assert.deepEqual(state.conditions, []);
});

test("a miss carries no rider, and a critical hit doubles the rider's dice", () => {
  const missed = startEncounter(
    [fighter, spider],
    dice([20, 5], [20, 18], [20, 2]),
  );
  assert.equal(
    missed.events.find(({ type }) => type === "attack").rider,
    undefined,
  );
  assert.deepEqual(missed.state.conditions, []);

  const critical = startEncounter(
    [{ ...fighter, hp: 30, maxHp: 30 }, spider],
    dice([20, 5], [20, 18], [20, 20], [8, 1], [8, 1], [6, 3], [6, 4], [20, 15]),
  );
  const bite = critical.events.find(({ type }) => type === "attack");
  assert.deepEqual(bite.rider.damageRolls, [3, 4]);
  assert.equal(bite.hpAfter, 30 - 5 - 7);
});

test("a hit that defeats the target rolls no save", () => {
  const { state, events } = startEncounter(
    [{ ...fighter, hp: 5 }, spider],
    dice([20, 5], [20, 18], [20, 15], [8, 2], [6, 1]),
  );
  assert.ok(!events.some(({ type }) => type === "save"));
  assert.equal(state.outcome, "defeat");
  assert.deepEqual(state.conditions, []);
});

test("poisoned: disadvantage on attack rolls and ability checks, none on saves", () => {
  assert.deepEqual(CONDITION_RULES.poisoned, {
    name: "Poisoned",
    attacks: "disadvantage",
    checks: "disadvantage",
  });
  // Poisoned, Ada rolls 18 and 4 and keeps the 4: 4 + 5 misses AC 14. At the
  // end of her turn her repeat save is one d20: 15 + 4 succeeds.
  const result = act(
    poisoned().state,
    { type: "attack", actorId: "pc", targetId: "spider" },
    dice([20, 18], [20, 4], [20, 15], [20, 1]),
  );
  const swing = result.events.find(({ actorId }) => actorId === "pc");
  assert.equal(swing.hit, false);
  assert.deepEqual(swing.mode, {
    d20s: [18, 4],
    advantage: [],
    disadvantage: ["Poisoned"],
  });
  assert.deepEqual(
    result.events.filter(
      ({ type }) => type === "save" || type === "condition-ended",
    ),
    [
      {
        type: "save",
        combatantId: "pc",
        ability: "constitution",
        d20: 15,
        bonus: 4,
        total: 19,
        dc: 11,
        success: true,
        condition: "poisoned",
        repeat: true,
      },
      {
        type: "condition-ended",
        combatantId: "pc",
        kind: "poisoned",
        reason: "saved",
      },
    ],
  );
  assert.deepEqual(result.state.conditions, []);
  // The save came at the end of Ada's turn, before the spider's.
  const order = result.events.map(({ type }) => type);
  assert.ok(order.indexOf("condition-ended") < order.lastIndexOf("attack"));
});

test("a failed repeat save keeps the condition, which runs out after its turns", () => {
  const start = poisoned().state;
  const lastTurn = {
    ...start,
    conditions: [{ ...start.conditions[0], turnsLeft: 2 }],
  };
  // End of Ada's turn: 3 + 4 fails, one turn left. The spider misses on a 1.
  const first = act(
    lastTurn,
    { type: "end-turn", actorId: "pc" },
    dice([20, 3], [20, 1]),
  );
  assert.equal(first.state.conditions[0].turnsLeft, 1);
  assert.equal(first.events.find(({ type }) => type === "save").success, false);
  // End of her next turn: another failure, and the poison runs out.
  const second = act(
    first.state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 2], [20, 1]),
  );
  assert.deepEqual(
    second.events.find(({ type }) => type === "condition-ended"),
    {
      type: "condition-ended",
      combatantId: "pc",
      kind: "poisoned",
      reason: "expired",
    },
  );
  assert.deepEqual(second.state.conditions, []);
});

test("conditions end with the fight", () => {
  const { state } = poisoned();
  const hurt = {
    ...state,
    combatants: state.combatants.map((entrant) =>
      entrant.id === "spider" ? { ...entrant, hp: 1 } : entrant,
    ),
  };
  // Poisoned, Ada rolls 19 and 16 and keeps 16: 21 hits and fells the spider.
  const result = act(
    hurt,
    { type: "attack", actorId: "pc", targetId: "spider" },
    dice([20, 19], [20, 16], [6, 1]),
  );
  assert.deepEqual(
    result.events.slice(-3).map(({ type, reason }) => reason ?? type),
    ["defeated", "fight-over", "ended"],
  );
  assert.deepEqual(result.state.conditions, []);
});

test("prone: disadvantage on its own attacks, and it stands at the end of its turn", () => {
  assert.deepEqual(CONDITION_RULES.prone, {
    name: "Prone",
    attacks: "disadvantage",
    attacked: "advantage",
  });
  // Initiative: Ada 5 + 1, the wolf 18 + 2. The bite: 14 + 4 hits for 3 + 2;
  // Ada's Strength save is 5 + 4 = 9.
  const { state, events } = startEncounter(
    [fighter, wolf()],
    dice([20, 5], [20, 18], [20, 14], [6, 3], [20, 5]),
  );
  assert.deepEqual(
    events.find(({ type }) => type === "condition"),
    {
      type: "condition",
      combatantId: "pc",
      kind: "prone",
      sourceId: "wolf",
      source: "Bite",
      turns: 1,
    },
  );
  // Prone, Ada rolls 17 and 3 and keeps the 3. The end of her turn stands
  // her up, and the wolf, alone, then bites with one d20 (missing on a 1).
  const result = act(
    state,
    { type: "attack", actorId: "pc", targetId: "wolf" },
    dice([20, 17], [20, 3], [20, 1]),
  );
  assert.deepEqual(
    result.events.find(({ actorId }) => actorId === "pc").mode.disadvantage,
    ["Prone"],
  );
  assert.deepEqual(
    result.events.find(({ type }) => type === "condition-ended"),
    {
      type: "condition-ended",
      combatantId: "pc",
      kind: "prone",
      reason: "stood",
    },
  );
  assert.equal(
    result.events.findLast(({ type }) => type === "attack").mode,
    undefined,
  );
  assert.deepEqual(result.state.conditions, []);
});

test("prone: attacks against it have advantage until it stands", () => {
  // Two wolves without Pack Tactics: initiative wolf 18, hound 15, Ada 5.
  const { events } = startEncounter(
    [fighter, loneWolf("wolf", "Wolf"), loneWolf("hound", "Hound")],
    dice(
      [20, 5],
      [20, 18],
      [20, 15],
      // The wolf hits and knocks Ada prone.
      [20, 14],
      [6, 3],
      [20, 5],
      // The hound attacks at advantage: 2 and 13, keeping 13, and hits;
      // Ada saves against its knockdown.
      [20, 2],
      [20, 13],
      [6, 1],
      [20, 20],
    ),
  );
  const swing = events.findLast(({ type }) => type === "attack");
  assert.equal(swing.actorId, "hound");
  assert.deepEqual(swing.mode, {
    d20s: [2, 13],
    advantage: ["target prone"],
    disadvantage: [],
  });
});

test("Pack Tactics: advantage while an ally is alive, none once it falls", () => {
  const pack = startEncounter(
    [fighter, wolf("wolf"), wolf("hound", "Hound")],
    dice([20, 5], [20, 18], [20, 15], [20, 3], [20, 9], [20, 1], [20, 1]),
  );
  const first = pack.events.find(({ type }) => type === "attack");
  assert.equal(first.actorId, "wolf");
  assert.deepEqual(first.mode, {
    d20s: [3, 9],
    advantage: ["Pack Tactics"],
    disadvantage: [],
  });

  const alone = startEncounter(
    [fighter, wolf("wolf"), { ...wolf("hound", "Hound"), hp: 0 }],
    dice([20, 5], [20, 18], [20, 15], [20, 3]),
  );
  assert.equal(
    alone.events.find(({ type }) => type === "attack").mode,
    undefined,
  );
});

const monster = (id) =>
  bestiary.monsters.find((entry) => entry.id === id).statBlock;

test("the bestiary's Wolf, Giant Spider and Giant Rat carry their riders and Pack Tactics", () => {
  assert.deepEqual(monster("wolf").traits, ["Pack Tactics"]);
  assert.deepEqual(monster("wolf").attacks[0].rider, {
    condition: { kind: "prone", save: { ability: "strength", dc: 11 } },
  });
  assert.deepEqual(monster("giant-spider").attacks[0].rider, {
    damage: { dice: 1, sides: 6, modifier: 0, type: "poison" },
    condition: {
      kind: "poisoned",
      save: { ability: "constitution", dc: 11 },
      turns: 10,
      repeatSave: true,
    },
  });
  assert.deepEqual(monster("giant-rat").traits, ["Pack Tactics"]);
  assert.equal(monster("giant-rat").attacks[0].rider, undefined);
});

test("the bestiary validator refuses malformed riders and traits", () => {
  const withBite = (change) => {
    const entry = structuredClone(
      bestiary.monsters.find(({ id }) => id === "wolf"),
    );
    change(entry.statBlock);
    return () => validateFifthBestiary({ ...bestiary, monsters: [entry] });
  };
  const rider = (value) =>
    withBite((block) => {
      block.attacks[0].rider = value;
    });
  assert.throws(rider({}), /rider must give damage, a condition or both\./);
  assert.throws(
    rider({ condition: { kind: "frightened" } }),
    /condition kind must be one of poisoned, prone, paralysed\./,
  );
  assert.throws(
    rider({ condition: { kind: "prone", turns: 2 } }),
    /is prone, which ends when the target gets up on its next turn/,
  );
  assert.throws(
    rider({ condition: { kind: "poisoned" } }),
    /must say how many of the target's turns it lasts\./,
  );
  assert.throws(
    rider({ condition: { kind: "poisoned", turns: 3, repeatSave: true } }),
    /repeats a save, so it must name one\./,
  );
  assert.throws(
    rider({
      condition: {
        kind: "poisoned",
        turns: 11,
        save: { ability: "constitution", dc: 11 },
      },
    }),
    /condition turns must be an integer from 1 to 10\./,
  );
  assert.throws(
    rider({
      condition: {
        kind: "poisoned",
        turns: 1,
        save: { ability: "luck", dc: 11 },
      },
    }),
    /save ability must be one of strength/,
  );
  assert.throws(
    withBite((block) => {
      block.traits = ["Pack Tactics", "Pack Tactics"];
    }),
    /traits lists Pack Tactics twice\./,
  );
  assert.throws(
    withBite((block) => {
      block.traits = ["Keen Smell"];
    }),
    /trait 1 must be one of Pack Tactics, Undead Fortitude, Nimble Escape, Rampage\./,
  );
});

/** The lone goblin's room with `opponents` in its place, as module `id`. */
/** The lone goblin's room with the bestiary's Giant Spider in its place. */
const spiderCellar = fightRoom("spider-cellar", "The Spider Cellar", [
  { id: "spider", monster: "giant-spider" },
]);

const withoutTraits = (block) => {
  delete block.traits;
};

/**
 * The gate's weakest survival rate playing `adventure`, on its first `count`
 * seeds, or the gate's default seeds.
 */
function survival(adventure, count) {
  const result = gateAdventure(
    adventure,
    count === undefined
      ? {}
      : { seeds: Array.from({ length: count }, (_, seed) => seed) },
  );
  assert.ok(result.ok, adventure.id);
  return result.verdict.survival.rate;
}

test("the balance gate plays the riders and Pack Tactics", () => {
  // A lone Wolf: its knockdown makes it deadlier.
  const wolf = fightRoom("wolf-cellar", "The Wolf Cellar", [
    { id: "wolf", monster: "wolf" },
  ]);
  // The knockdown changes survival by about as much as the seeds do, so the
  // wolf keeps the gate's default seeds.
  assert.ok(survival(wolf) < survival(withStatBlocks(wolf, withoutRiders)));
  // The Giant Spider's poison makes it deadlier, clearly so on 60 seeds.
  assert.ok(
    survival(spiderCellar, 60) <
      survival(withStatBlocks(spiderCellar, withoutRiders), 60),
  );
  // Two Wolves with Pack Tactics are deadlier than two without.
  const pack = fightRoom("wolf-pack", "The Wolf Pack", [
    { id: "wolf-1", monster: "wolf", name: "Wolf 1" },
    { id: "wolf-2", monster: "wolf", name: "Wolf 2" },
  ]);
  assert.ok(survival(pack) < survival(withStatBlocks(pack, withoutTraits)));
});

const CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

/** Attack the spider, or end the turn once the action is spent. */
const step = (runtime, state) =>
  runtime.attackTargets(state).length > 0
    ? { type: "attack", actorId: "pc", targetId: "spider" }
    : { type: "end-turn", actorId: "pc" };

const poisonedNow = (state) =>
  (state.encounter?.conditions ?? []).some(
    ({ targetId, kind }) => targetId === "pc" && kind === "poisoned",
  );

/** The actions that leave Ada poisoned mid-fight, first in a session on `seed`. */
function poisoning(sheet, seed) {
  const runtime = createFifthRuntime(spiderCellar, sheet);
  const random = createSeededRandom(sessionSeed(seed, 1));
  const actions = [];
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  while (state.status === "playing" && !poisonedNow(state)) {
    const action = step(runtime, state);
    actions.push(action);
    state = runtime.handleAction(state, action, random).state;
  }
  return poisonedNow(state) ? actions : undefined;
}

test("a session saved while poisoned replays exactly, repeat saves and all", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-232-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const data = await library.create("Ada", CHOICES, started.revision);
    const sheet = data.characters[0].sheet;
    let seed = 0;
    while (poisoning(sheet, seed) === undefined) {
      seed += 1;
      assert.ok(seed < 500, "a seed poisons Ada");
    }
    const original = await startFifthAdventure(
      library,
      seed,
      sheet.id,
      spiderCellar,
      data.revision,
    );
    for (const action of poisoning(sheet, seed)) {
      original.act(action, "click");
    }
    assert.ok(poisonedNow(original.state));
    // The browser's fight and the AI DM's status and scene report it.
    const { runtime, state } = original;
    const condition = runtime
      .projectFight(state)
      .encounter.combatants.find(({ id }) => id === "pc").conditions[0];
    assert.equal(condition.kind, "poisoned");
    assert.equal(condition.name, "Poisoned");
    assert.match(
      condition.text,
      /^Giant Spider's Bite; DC 11 Constitution save at the end of each of its turns, up to \d+ turns? left$/u,
    );
    assert.deepEqual(runtime.projectCharacterStatus(state).conditions, [
      `Poisoned (${condition.text})`,
    ]);
    assert.ok(
      runtime
        .projectDmScene(state)
        .combatStatus.includes(`Ada is poisoned (${condition.text}).`),
    );
    await original.persist();
    const saved = JSON.parse(await readFile(original.path, "utf8"));
    assert.deepEqual(
      saved.state.encounter.conditions,
      original.state.encounter.conditions,
    );

    const resumed = await FifthSession.load(original.path, [spiderCellar]);
    assert.deepEqual(resumed.state, original.state);
    assert.equal(resumed.randomPosition, original.randomPosition);
    // Both go on drawing the same dice: the repeat save at the end of Ada's
    // turn is rolled, recorded and narrated alike.
    let repeated = false;
    while (original.state.status === "playing" && !repeated) {
      const action = step(original.runtime, original.state);
      const a = original.act(action, "click");
      const b = resumed.act(action, "click");
      assert.deepEqual(b.rolls, a.rolls);
      assert.deepEqual(b.result.events, a.result.events);
      const text = original.runtime.renderResult(a.result);
      assert.equal(resumed.runtime.renderResult(b.result), text);
      repeated = a.result.events.some(
        ({ type, repeat }) => type === "save" && repeat,
      );
      if (repeated) {
        assert.match(
          text,
          /Ada repeats a Constitution saving throw against being poisoned: \d+ [+−] \d+ = \d+ against DC 11\. (Success|Failure)\./u,
        );
      }
    }
    assert.ok(repeated, "Ada repeats her save");
    assert.deepEqual(resumed.state, original.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
