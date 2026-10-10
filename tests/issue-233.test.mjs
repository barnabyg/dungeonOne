// #233: damage types are a closed set; monsters resist, are vulnerable to or
// ignore damage of a type; a Zombie's Undead Fortitude keeps it standing; and
// the balance gate counts both.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statBlockSaves } from "../dist/adventure-5e.js";
import { characterAtLevel, oneHitKillChance } from "../dist/balance-5e.js";
import { act, startEncounter } from "../dist/encounter-5e.js";
import { validateCharacter } from "../dist/character-5e.js";
import { validateFifthBestiary } from "../dist/bestiary-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";
import { fightRoom, moduleFile } from "./fixtures/modules.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { IN_ORDER_CHOICES as CHOICES } from "./fixtures/fighter-choices.mjs";

const saves = {
  strength: 4,
  dexterity: 1,
  constitution: 4,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};

/** Action Surge keeps Ada's turn open after one attack. */
const fighter = (attack = {}, extra = {}) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 12,
  maxHp: 12,
  dexterity: 12,
  initiativeBonus: 1,
  saves,
  actionSurge: { uses: 1, max: 1 },
  attack: {
    name: "Mace",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    criticalRange: 20,
    ...attack,
  },
  ...extra,
});

const undeadSaves = {
  strength: 1,
  dexterity: -2,
  constitution: 3,
  intelligence: -4,
  wisdom: 0,
  charisma: -3,
};

const dummy = (defenses = {}, hp = 30) => ({
  id: "foe",
  name: "Skeleton",
  side: "opponents",
  armorClass: 13,
  hp,
  maxHp: hp,
  dexterity: 6,
  initiativeBonus: -2,
  saves: undeadSaves,
  attack: {
    name: "Slam",
    bonus: 3,
    damage: { dice: 1, sides: 8, modifier: 1, type: "bludgeoning" },
    criticalRange: 20,
  },
  ...defenses,
});

/** Ada wins initiative (15 + 1 against 5 − 2) and attacks with these dice. */
function strike(attacker, target, ...attack) {
  const random = dice([20, 15], [20, 5], ...attack);
  const { state } = startEncounter([attacker, target], random);
  const result = act(
    state,
    { type: "attack", actorId: "pc", targetId: "foe" },
    random,
  );
  assert.equal(result.rejection, undefined);
  assert.equal(random.remaining(), 0);
  return result;
}

const ADJUSTMENTS = [
  { by: undefined, defenses: {}, dealt: (rolled) => rolled },
  {
    by: "resistance",
    defenses: { resistances: ["bludgeoning"] },
    dealt: (rolled) => Math.floor(rolled / 2),
  },
  {
    by: "vulnerability",
    defenses: { vulnerabilities: ["bludgeoning"] },
    dealt: (rolled) => rolled * 2,
  },
  {
    by: "immunity",
    defenses: { immunities: ["bludgeoning"] },
    dealt: () => 0,
  },
];

const PATHS = [
  // A hit: 15 + 5 against AC 13, 4 + 3 bludgeoning.
  {
    path: "hit",
    attacker: fighter(),
    dice: [
      [20, 15],
      [6, 4],
    ],
    rolled: 7,
  },
  // A critical hit doubles the dice: 4 + 2 + 3.
  {
    path: "critical hit",
    attacker: fighter(),
    dice: [
      [20, 20],
      [6, 4],
      [6, 2],
    ],
    rolled: 9,
  },
  // A Graze miss deals the modifier.
  {
    path: "Graze",
    attacker: fighter({ mastery: "Graze" }),
    dice: [[20, 2]],
    rolled: 3,
  },
];

for (const { path, attacker, dice: rolls, rolled } of PATHS) {
  for (const { by, defenses, dealt } of ADJUSTMENTS) {
    test(`${path}: ${by ?? "no adjustment"} on the weapon's damage`, () => {
      const { state, events } = strike(attacker, dummy(defenses), ...rolls);
      const attack = events.find(({ type }) => type === "attack");
      assert.equal(attack.damage, dealt(rolled));
      assert.equal(attack.damageType, "bludgeoning");
      assert.deepEqual(
        attack.damageAdjustment,
        by === undefined ? undefined : { by, rolled },
      );
      assert.equal(attack.hpAfter, 30 - dealt(rolled));
      assert.equal(state.combatants[1].hp, 30 - dealt(rolled));
    });
  }
}

for (const { by, dealt } of ADJUSTMENTS) {
  test(`a rider: ${by ?? "no adjustment"} on its extra damage`, () => {
    // Ada resists, is vulnerable to or ignores poison.
    const defenses = {
      resistance: { resistances: ["poison"] },
      vulnerability: { vulnerabilities: ["poison"] },
      immunity: { immunities: ["poison"] },
    }[by];
    const spider = {
      ...dummy(),
      initiativeBonus: 3,
      attack: {
        name: "Bite",
        bonus: 5,
        damage: { dice: 1, sides: 8, modifier: 3, type: "piercing" },
        criticalRange: 20,
        rider: { damage: { dice: 1, sides: 6, modifier: 0, type: "poison" } },
      },
    };
    // Initiative: Ada 5 + 1, the spider 18 + 3. The bite hits for 1 + 3
    // piercing and 5 poison; a critical hit (the second run) adds a d8 and
    // a d6.
    for (const critical of [false, true]) {
      const { events } = startEncounter(
        [fighter({}, { hp: 30, maxHp: 30, ...defenses }), spider],
        dice(
          [20, 5],
          [20, 18],
          [20, critical ? 20 : 15],
          [8, 1],
          ...(critical ? [[8, 2]] : []),
          [6, 5],
          ...(critical ? [[6, 1]] : []),
        ),
      );
      const bite = events.find(({ type }) => type === "attack");
      const rolled = critical ? 6 : 5;
      assert.equal(bite.damage, critical ? 6 : 4);
      assert.equal(bite.damageAdjustment, undefined);
      assert.equal(bite.rider.damage, dealt(rolled));
      assert.deepEqual(
        bite.rider.damageAdjustment,
        by === undefined ? undefined : { by, rolled },
      );
      assert.equal(bite.hpAfter, 30 - bite.damage - dealt(rolled));
    }
  });
}

test("a combatant immune to a rider's condition rolls no save and is spared it", () => {
  const spider = {
    ...dummy(),
    initiativeBonus: 3,
    attack: {
      name: "Bite",
      bonus: 5,
      damage: { dice: 1, sides: 8, modifier: 3, type: "piercing" },
      criticalRange: 20,
      rider: {
        condition: {
          kind: "poisoned",
          save: { ability: "constitution", dc: 11 },
          turns: 10,
          repeatSave: true,
        },
      },
    },
  };
  const random = dice([20, 5], [20, 18], [20, 15], [8, 1]);
  const { state, events } = startEncounter(
    [fighter({}, { conditionImmunities: ["poisoned"] }), spider],
    random,
  );
  assert.equal(random.remaining(), 0);
  assert.deepEqual(state.conditions, []);
  assert.ok(!events.some(({ type }) => type === "save"));
});

const zombie = (hp = 5) => ({
  ...dummy({ undeadFortitude: true }, hp),
  name: "Zombie",
  maxHp: 15,
});

test("Undead Fortitude: a successful save leaves the zombie at 1 HP", () => {
  // 4 + 3 = 7 takes it from 5 to 0; its Constitution save is 9 + 3 = 12
  // against DC 5 + 7.
  const { state, events } = strike(
    fighter(),
    zombie(),
    [20, 15],
    [6, 4],
    [20, 9],
  );
  const attack = events.find(({ type }) => type === "attack");
  assert.equal(attack.hpAfter, 0);
  assert.deepEqual(
    events.find(({ type }) => type === "undead-fortitude"),
    {
      type: "undead-fortitude",
      combatantId: "foe",
      damage: 7,
      d20: 9,
      bonus: 3,
      total: 12,
      dc: 12,
      success: true,
      hpAfter: 1,
    },
  );
  assert.ok(!events.some(({ type }) => type === "defeated"));
  assert.equal(state.combatants[1].hp, 1);
  assert.equal(state.outcome, "ongoing");
});

test("Undead Fortitude: a failed save leaves the zombie defeated", () => {
  const { state, events } = strike(
    fighter(),
    zombie(),
    [20, 15],
    [6, 4],
    [20, 8],
  );
  const fortitude = events.find(({ type }) => type === "undead-fortitude");
  assert.equal(fortitude.total, 11);
  assert.equal(fortitude.success, false);
  assert.equal(fortitude.hpAfter, 0);
  assert.deepEqual(
    events.slice(events.indexOf(fortitude) + 1, events.indexOf(fortitude) + 2),
    [{ type: "defeated", combatantId: "foe" }],
  );
  assert.equal(state.combatants[1].hp, 0);
  assert.equal(state.outcome, "victory");
});

test("Undead Fortitude: the DC counts the damage taken after a resistance", () => {
  // 6 + 3 = 9 halved to 4 takes it from 4 to 0: DC 5 + 4.
  const { events } = strike(
    fighter(),
    { ...zombie(4), resistances: ["bludgeoning"] },
    [20, 15],
    [6, 6],
    [20, 6],
  );
  const fortitude = events.find(({ type }) => type === "undead-fortitude");
  assert.equal(fortitude.damage, 4);
  assert.equal(fortitude.dc, 9);
  assert.equal(fortitude.success, true);
});

test("Undead Fortitude: no save against a critical hit", () => {
  const { state, events } = strike(
    fighter(),
    zombie(),
    [20, 20],
    [6, 1],
    [6, 1],
  );
  assert.ok(!events.some(({ type }) => type === "undead-fortitude"));
  assert.equal(state.combatants[1].hp, 0);
  assert.equal(state.outcome, "victory");
});

test("Undead Fortitude: no save against radiant damage", () => {
  const { state, events } = strike(
    fighter({
      damage: { dice: 1, sides: 6, modifier: 3, type: "radiant" },
    }),
    zombie(),
    [20, 15],
    [6, 4],
  );
  assert.ok(!events.some(({ type }) => type === "undead-fortitude"));
  assert.equal(state.combatants[1].hp, 0);
});

test("Undead Fortitude: no save while the zombie stays above 0 HP", () => {
  const { state, events } = strike(fighter(), zombie(15), [20, 15], [6, 4]);
  assert.ok(!events.some(({ type }) => type === "undead-fortitude"));
  assert.equal(state.combatants[1].hp, 8);
});

const STRONG_DICE = [
  [6, 6, 6, 1],
  [5, 5, 5, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [2, 2, 2, 1],
  [1, 1, 1, 1],
];

/** Strength 20 at level 1, in leather with `weapon`: +7 to hit, 1d6 + 5. */
const holding = (weapon) => {
  const sheet = characterAtLevel(STRONG_DICE, 1);
  return validateCharacter({ ...sheet, equipment: ["leather", weapon] });
};

test("one-hit kill: a mace against a Skeleton beats a shortsword of the same average damage", () => {
  const skeleton = bestiary.monsters.find(({ id }) => id === "skeleton");
  const mace = oneHitKillChance(holding("mace"), skeleton.statBlock);
  const shortsword = oneHitKillChance(
    holding("shortsword"),
    skeleton.statBlock,
  );
  // 13 HP against AC 14: 7–19 hit, and only a critical's 2d6 + 5 kills with
  // a shortsword (8+ on 2d6), while 1d6 + 5 doubled kills on a 2+.
  assert.ok(Math.abs(shortsword - (1 / 20) * (15 / 36)) < 1e-9);
  assert.ok(Math.abs(mace - ((13 / 20) * (5 / 6) + 1 / 20)) < 1e-9);
  assert.ok(mace > shortsword);
});

test("one-hit kill: resistance halves and immunity ignores the damage", () => {
  const target = { armorClass: 12, hitPoints: { average: 6 } };
  const mace = holding("mace");
  // Untouched: 1d6 + 5 always reaches 6 on a hit (5–20).
  assert.ok(Math.abs(oneHitKillChance(mace, target) - 16 / 20) < 1e-9);
  // Halved: only 1d6 + 5 = 12+ (never) or a critical's 2d6 + 5 = 12+ (7+).
  assert.ok(
    Math.abs(
      oneHitKillChance(mace, {
        ...target,
        damageResistances: ["bludgeoning"],
      }) -
        (1 / 20) * (21 / 36),
    ) < 1e-9,
  );
  assert.equal(
    oneHitKillChance(mace, { ...target, damageImmunities: ["bludgeoning"] }),
    0,
  );
  assert.equal(
    oneHitKillChance(mace, { ...target, damageResistances: ["piercing"] }),
    oneHitKillChance(mace, target),
  );
});

test("one-hit kill: Undead Fortitude must fail its save, except against a critical hit", () => {
  const zombie = bestiary.monsters.find(({ id }) => id === "zombie");
  const target = { ...zombie.statBlock, hitPoints: { average: 6 } };
  // AC 8: 2–19 hit for 1d6 + 5 = 6–11, then the zombie's Constitution save
  // (+3) against DC 10 + the d6 roll fails on a d20 of 6 + the d6 roll or
  // less.
  const failed = [1, 2, 3, 4, 5, 6].reduce(
    (sum, face) => sum + (6 + face) / 20 / 6,
    0,
  );
  const expected = (18 / 20) * failed + 1 / 20;
  assert.ok(
    Math.abs(oneHitKillChance(holding("mace"), target) - expected) < 1e-9,
  );
});

const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);

test("the bestiary's undead carry their SRD defences, and the Zombie Undead Fortitude", () => {
  const zombie = monster("zombie").statBlock;
  assert.deepEqual(zombie.traits, ["Undead Fortitude"]);
  assert.deepEqual(zombie.damageImmunities, ["poison"]);
  // Exhaustion (#340), which makes it succeed on Sleep's saves.
  assert.deepEqual(zombie.conditionImmunities, ["exhaustion", "poisoned"]);
  // Wisdom 6 (−2) with proficiency (+2 at CR 1/4): +0; Constitution 16: +3.
  assert.deepEqual(zombie.saveProficiencies, ["wisdom"]);
  assert.equal(statBlockSaves(zombie).wisdom, 0);
  assert.equal(statBlockSaves(zombie).constitution, 3);
  const skeleton = monster("skeleton").statBlock;
  assert.deepEqual(skeleton.damageVulnerabilities, ["bludgeoning"]);
  assert.deepEqual(skeleton.damageImmunities, ["poison"]);
  assert.deepEqual(skeleton.conditionImmunities, ["exhaustion", "poisoned"]);
  const ghoul = monster("ghoul").statBlock;
  assert.deepEqual(ghoul.damageImmunities, ["poison"]);
  assert.deepEqual(ghoul.conditionImmunities, ["exhaustion", "poisoned"]);
  // A save proficiency adds the challenge rating's proficiency bonus.
  assert.equal(
    statBlockSaves({ ...zombie, challengeRating: "5" }).wisdom,
    -2 + 3,
  );
});

test("the bestiary and module validators refuse a damage type outside SRD 5.2", () => {
  const entry = (change) => {
    const copy = structuredClone(monster("skeleton"));
    change(copy.statBlock);
    return () => validateFifthBestiary({ ...bestiary, monsters: [copy] });
  };
  const TYPES =
    /must be one of acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing, poison, psychic, radiant, slashing, thunder\./;
  assert.throws(
    entry((block) => {
      block.attacks[0].damage.type = "Piercing";
    }),
    TYPES,
  );
  assert.throws(
    entry((block) => {
      block.attacks[0].rider = {
        damage: { dice: 1, sides: 6, modifier: 0, type: "venom" },
      };
    }),
    TYPES,
  );
  assert.throws(
    entry((block) => {
      block.damageResistances = ["holy"];
    }),
    /damage resistance 1 must be one of acid/,
  );
  assert.throws(
    entry((block) => {
      block.damageImmunities = ["poison", "poison"];
    }),
    /damageImmunities lists poison twice\./,
  );
  assert.throws(
    entry((block) => {
      block.damageResistances = ["bludgeoning"];
    }),
    /gives bludgeoning damage more than one of resistance, vulnerability and immunity\./,
  );
  assert.throws(
    entry((block) => {
      block.conditionImmunities = ["charmed"];
    }),
    /condition immunity 1 must be one of poisoned, prone, paralysed, exhaustion\./,
  );
  assert.throws(
    entry((block) => {
      block.saveProficiencies = ["luck"];
    }),
    /save proficiency 1 must be one of strength/,
  );
  // A trap's damage type is checked the same way.
  const crypt = moduleFile("sealed-crypt");
  crypt.passages.find(({ trap }) => trap !== undefined).trap.damage.type =
    "darts";
  assert.throws(() => validateModule(crypt), TYPES);
});

/** The lone goblin's room with `opponents` in its place, as module `id`. */
/** A Skeleton under `name` with `defenses` in place of its own. */
const skeletonWith = (name, defenses) => {
  const rest = structuredClone(monster("skeleton").statBlock);
  delete rest.damageVulnerabilities;
  delete rest.damageImmunities;
  const id = `${name.toLowerCase().replace(" ", "-")}-cellar`;
  return fightRoom(id, `The ${name} Cellar`, [
    {
      id: "foe",
      name,
      description: "A skeleton.",
      statBlock: {
        ...rest,
        hitPoints: { average: 40, formula: "8d8 + 4" },
        ...defenses,
      },
    },
  ]);
};

/** Attack `targetId`, or end the turn once the action is spent. */
const step = (runtime, state, targetId) =>
  runtime.attackTargets(state).length > 0
    ? { type: "attack", actorId: "pc", targetId }
    : { type: "end-turn", actorId: "pc" };

let library;
let directory;
test.before(async () => {
  directory = await mkdtemp(join(tmpdir(), "issue-233-"));
  library = new FifthCharacterLibrary(join(directory, "characters.json"), 7);
  const started = await library.startCreation();
  await library.create("Ada", CHOICES, started.revision);
});
test.after(() => rm(directory, { recursive: true, force: true }));

const ada = async () => (await library.read()).characters[0].sheet;

test("the result card says when a mace's damage is doubled, halved or ignored", async () => {
  const sheet = await ada();
  const cases = [
    {
      module: fightRoom("skeleton-cellar", "The Skeleton Cellar", [
        { id: "foe", monster: "skeleton" },
      ]),
      by: "vulnerability",
      text: /Hit\. Damage \d+ \+ \d+ = (\d+) bludgeoning, doubled to (\d+) \(vulnerable\); Skeleton has \d+\/13 HP\./u,
      dealt: (rolled) => rolled * 2,
    },
    {
      module: skeletonWith("Iron Skeleton", {
        damageResistances: ["bludgeoning"],
      }),
      by: "resistance",
      text: /Hit\. Damage \d+ \+ \d+ = (\d+) bludgeoning, halved to (\d+) \(resistant\); Iron Skeleton has \d+\/40 HP\./u,
      dealt: (rolled) => Math.floor(rolled / 2),
    },
    {
      module: skeletonWith("Glass Skeleton", {
        damageImmunities: ["bludgeoning"],
      }),
      by: "immunity",
      text: /Hit\. Damage \d+ \+ \d+ = (\d+) bludgeoning, ignored \(immune\); Glass Skeleton has 40\/40 HP\./u,
      dealt: () => 0,
    },
  ];
  for (const { module, by, text, dealt } of cases) {
    const session = FifthSession.begin(3, module, sheet);
    let shown;
    while (session.state.status === "playing" && shown === undefined) {
      const { result, rolls } = session.act(
        step(session.runtime, session.state, "foe"),
        "click",
      );
      const hit = result.events.find(
        (event) =>
          event.type === "attack" && event.actorId === "pc" && event.hit,
      );
      if (hit !== undefined) {
        shown = { hit, card: session.card(result, rolls) };
      }
    }
    assert.ok(shown, `Ada hits (${by})`);
    const { hit, card } = shown;
    assert.equal(hit.damageAdjustment.by, by);
    const [, rolled, after] = card.text.match(text) ?? [];
    assert.ok(rolled !== undefined, card.text);
    if (after !== undefined) {
      assert.equal(Number(after), dealt(Number(rolled)));
    }
    const group = card.lines
      .flatMap(({ rolls }) => rolls)
      .find(({ purpose, roller }) => purpose === "damage" && roller === "Ada");
    assert.equal(group.adjustment, by);
    assert.equal(group.total, dealt(Number(rolled)));
  }
});

/** The actions before the first attack a Zombie's Undead Fortitude answers. */
function toFortitude(sheet, module, seed) {
  const session = FifthSession.begin(seed, module, sheet);
  const actions = [];
  while (session.state.status === "playing") {
    const action = step(session.runtime, session.state, "zombie");
    const { result } = session.act(action, "click");
    if (result.events.some(({ type }) => type === "undead-fortitude")) {
      return actions;
    }
    actions.push(action);
  }
  return undefined;
}

test("Undead Fortitude is narrated, carded and replays exactly from a save", async () => {
  const sheet = await ada();
  const module = fightRoom("zombie-cellar", "The Zombie Cellar", [
    { id: "zombie", monster: "zombie" },
  ]);
  const outcomes = new Set();
  for (let seed = 0; outcomes.size < 2; seed++) {
    assert.ok(seed < 200, "seeds show a success and a failure");
    const before = toFortitude(sheet, module, seed);
    if (before === undefined) {
      continue;
    }
    const original = await FifthSession.create(
      join(directory, `zombie-${seed}.json`),
      seed.toString(16).padStart(32, "0"),
      seed,
      module,
      sheet,
    );
    for (const action of before) {
      original.act(action, "click");
    }
    await original.persist();
    const resumed = await FifthSession.load(original.path, [module]);
    assert.deepEqual(resumed.state, original.state);
    const action = step(original.runtime, original.state, "zombie");
    const a = original.act(action, "click");
    const b = resumed.act(action, "click");
    assert.deepEqual(b.rolls, a.rolls);
    assert.deepEqual(b.result.events, a.result.events);
    const card = original.card(a.result, a.rolls);
    assert.deepEqual(resumed.card(b.result, b.rolls), card);
    const fortitude = a.result.events.find(
      ({ type }) => type === "undead-fortitude",
    );
    if (outcomes.has(fortitude.success)) {
      continue;
    }
    outcomes.add(fortitude.success);
    assert.match(
      card.text,
      fortitude.success
        ? /Undead Fortitude: Zombie makes a Constitution saving throw against DC 5 \+ \d+ damage taken: \d+ \+ 3 = \d+ against DC \d+\. Success: Zombie refuses to fall and has 1\/15 HP\./u
        : /Undead Fortitude: Zombie makes a Constitution saving throw against DC 5 \+ \d+ damage taken: \d+ \+ 3 = \d+ against DC \d+\. Failure: Zombie stays down\.\nZombie is defeated\./u,
    );
    const save = card.lines
      .flatMap(({ rolls }) => rolls)
      .find(
        ({ label }) => label === "Constitution saving throw (Undead Fortitude)",
      );
    assert.equal(save.purpose, "save");
    assert.equal(save.dc, fortitude.dc);
    assert.equal(save.outcome, fortitude.success ? "success" : "failure");
    assert.equal(save.hpAfter, fortitude.success ? 1 : 0);
  }
});
