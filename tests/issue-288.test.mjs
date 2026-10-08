// #288: bestiary monsters for levels 4–5. Five SRD 5.2 monsters join the
// Ogre: the Dire Wolf, Brown Bear and Bandit Captain (bands reaching 4–5)
// and the Owlbear and Warrior Veteran (level 5). Each fights with mechanics
// the engine already has; what their SRD blocks need beyond that is left
// out and recorded in the rules document. The estimator covers levels 4–5.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { estimateEncounter, renderEstimate } from "../dist/estimate-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { uncheckedDice as dice } from "./fixtures/engine-dice.mjs";
import { fightRoom } from "./fixtures/modules.mjs";

const NEW_MONSTERS = [
  {
    id: "dire-wolf",
    name: "Dire Wolf",
    band: { min: 3, max: 5 },
    treasureType: "none",
    challengeRating: "1",
    xp: 200,
    morale: 6,
  },
  {
    id: "brown-bear",
    name: "Brown Bear",
    band: { min: 3, max: 5 },
    treasureType: "none",
    challengeRating: "1",
    xp: 200,
    morale: 5,
  },
  {
    id: "bandit-captain",
    name: "Bandit Captain",
    band: { min: 4, max: 5 },
    treasureType: "gold",
    challengeRating: "2",
    xp: 450,
    morale: 6,
  },
  {
    id: "owlbear",
    name: "Owlbear",
    band: { min: 5, max: 5 },
    treasureType: "none",
    challengeRating: "3",
    xp: 700,
    morale: 4,
  },
  {
    id: "warrior-veteran",
    name: "Warrior Veteran",
    band: { min: 5, max: 5 },
    treasureType: "gold",
    challengeRating: "3",
    xp: 700,
    morale: 4,
  },
];

const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);

test("the bestiary holds each new monster with its band, treasure type, XP and morale", () => {
  for (const expected of NEW_MONSTERS) {
    const entry = monster(expected.id);
    assert.ok(entry, expected.id);
    assert.equal(entry.statBlock.name, expected.name);
    assert.deepEqual(entry.levelBand, expected.band);
    assert.ok(entry.levelBand.max >= 4, `${expected.id} reaches level 4–5`);
    assert.equal(entry.treasureType, expected.treasureType);
    assert.equal(entry.statBlock.challengeRating, expected.challengeRating);
    assert.equal(entry.statBlock.xp, expected.xp);
    assert.equal(entry.statBlock.morale, expected.morale);
    assert.ok(entry.description.length > 0);
  }
});

/**
 * Ada at level 5 against one `id`, which wins initiative (her 1 to its 20)
 * and takes its first turn with `values`, the dice after initiative.
 */
function monsterTurn(id, ...values) {
  const room = fightRoom("lair", "The Lair", [{ id: "beast", monster: id }]);
  const runtime = createFifthRuntime(room, testFighterAt(5));
  const random = dice(1, 20, ...values);
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  );
  assert.equal(result.rejection, undefined);
  assert.equal(random.remaining(), 0);
  return {
    events: result.events.filter(({ type }) => type !== "initiative"),
    state: result.state,
  };
}
const attacks = (events) =>
  events
    .filter(({ type }) => type === "attack")
    .map(({ weapon, bonus, damageRolls, damageModifier, damageType }) => [
      weapon,
      bonus,
      damageRolls,
      damageModifier,
      damageType,
    ]);

test("Owlbear: Multiattack, two Rend attacks a turn at +7 for 2d8 + 5 slashing", () => {
  const { events } = monsterTurn("owlbear", 10, 8, 3, 10, 3, 8);
  assert.deepEqual(attacks(events), [
    ["Rend", 7, [8, 3], 5, "slashing"],
    ["Rend", 7, [3, 8], 5, "slashing"],
  ]);
});

test("Warrior Veteran: Multiattack, two Greatsword attacks at +5 for 2d6 + 3 slashing", () => {
  // Splint armour (AC 17); its Heavy Crossbow and Parry are left out.
  assert.equal(monster("warrior-veteran").statBlock.armorClass, 17);
  assert.deepEqual(
    monster("warrior-veteran").statBlock.attacks.map(({ name }) => name),
    ["Greatsword"],
  );
  const { events } = monsterTurn("warrior-veteran", 15, 6, 6, 15, 1, 1);
  assert.deepEqual(attacks(events), [
    ["Greatsword", 5, [6, 6], 3, "slashing"],
    ["Greatsword", 5, [1, 1], 3, "slashing"],
  ]);
});

test("Bandit Captain: two Scimitar attacks, and proficient Strength, Dexterity and Wisdom saves", () => {
  const { events, state } = monsterTurn("bandit-captain", 15, 4, 15, 2);
  assert.deepEqual(attacks(events), [
    ["Scimitar", 5, [4], 3, "slashing"],
    ["Scimitar", 5, [2], 3, "slashing"],
  ]);
  const captain = state.encounter.combatants.find(({ id }) => id === "beast");
  // Str 15, Dex 16, Wis 11 with proficiency +2; Con 14, Int 14, Cha 14 without.
  assert.deepEqual(captain.saves, {
    strength: 4,
    dexterity: 5,
    constitution: 2,
    intelligence: 2,
    wisdom: 2,
    charisma: 2,
  });
});

test("Brown Bear: Multiattack picks Bite or Claw by a die; a Claw hit knocks prone on a failed DC 13 Strength save", () => {
  // Die 1 picks the Bite (1d8 + 3); die 2 the Claw (1d4 + 3), whose rider
  // Ada (Strength save +7) resists on 6 + 7 = 13.
  const { events } = monsterTurn("brown-bear", 1, 12, 5, 2, 12, 2, 6);
  assert.deepEqual(attacks(events), [
    ["Bite", 5, [5], 3, "piercing"],
    ["Claw", 5, [2], 3, "slashing"],
  ]);
  const save = events.find(({ type }) => type === "save");
  assert.equal(save.condition, "prone");
  assert.equal(save.dc, 13);
  assert.equal(save.success, true);
  assert.equal(
    events.some(({ type }) => type === "condition"),
    false,
  );
});

test("Dire Wolf: Bite at +5 for 1d10 + 3; a failed DC 13 Strength save leaves Ada prone", () => {
  const { events, state } = monsterTurn("dire-wolf", 12, 7, 5);
  assert.deepEqual(attacks(events), [["Bite", 5, [7], 3, "piercing"]]);
  const save = events.find(({ type }) => type === "save");
  assert.equal(save.dc, 13);
  assert.equal(save.success, false);
  assert.deepEqual(
    state.encounter.conditions.map(({ targetId, kind }) => [targetId, kind]),
    [["pc", "prone"]],
  );
  assert.deepEqual(monster("dire-wolf").statBlock.traits, ["Pack Tactics"]);
});

test("the estimator reports each new monster at levels 4 and 5", () => {
  for (const { id, name } of NEW_MONSTERS) {
    const result = estimateEncounter(
      bestiary,
      { monsters: [{ id, count: 1 }], levels: { min: 4, max: 5 } },
      { seeds: [0, 1, 2, 3] },
    );
    assert.equal(result.ok, true, id);
    const { estimate } = result;
    assert.deepEqual(
      [...new Set(estimate.cells.map(({ level }) => level))],
      [4, 5],
      id,
    );
    for (const { level, monsters } of estimate.oneHitKill) {
      assert.ok([4, 5].includes(level));
      assert.deepEqual(
        monsters.map((entry) => entry.name),
        [name],
      );
    }
    const text = renderEstimate(result);
    assert.match(text, new RegExp(`^${name} at levels 4–5`, "u"), id);
    assert.match(text, /Level 4, 5th percentile/u);
    assert.match(text, /Level 5, 95th percentile/u);
  }
});

test("the rules document lists each new monster, its source and the left-out mechanics", async () => {
  const rules = await readFile(
    new URL("../docs/character-rules.md", import.meta.url),
    "utf8",
  );
  for (const { id, name } of NEW_MONSTERS) {
    assert.match(
      rules,
      new RegExp(`\\| ${name} \\(\`${id}\`\\) +\\| SRD 5\\.2`, "u"),
      name,
    );
  }
  for (const omitted of [
    "Hobgoblin Captain",
    "Minotaur of Baphomet",
    "Wight",
    "Parry",
    "Heavy Crossbow",
    "Pistol",
  ]) {
    assert.match(rules, new RegExp(omitted, "u"), omitted);
  }
});
