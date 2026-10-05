import assert from "node:assert/strict";
import test from "node:test";
import {
  ABILITIES,
  abilityModifier,
  buildFighter,
  droppedDie,
  fighterProfile,
  keptTotal,
  levelForXp,
  levelUpChanges,
  nextLevelXp,
  proficiencyBonus,
  rewardFighter,
  rollAbilitySet,
  validateFighter,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";

const ID = "a".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const IN_ORDER = {
  strength: 0,
  dexterity: 1,
  constitution: 2,
  intelligence: 3,
  wisdom: 4,
  charisma: 5,
};
const CHOICES = {
  placement: IN_ORDER,
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
};
const fighter = (choices = {}) =>
  buildFighter(ID, "Ada", DICE, { ...CHOICES, ...choices });
const atLevel = (sheet, xp) => {
  const level = levelForXp(xp);
  const raised = { ...sheet, level, xp };
  return validateFighter({ ...raised, hp: fighterProfile(raised).maxHp });
};

test("4d6-drop-lowest rolls six sets of four dice from the seeded stream", () => {
  const dice = rollAbilitySet(createSeededRandom(127));
  assert.deepEqual(rollAbilitySet(createSeededRandom(127)), dice);
  assert.equal(dice.length, 6);
  for (const roll of dice) {
    assert.equal(roll.length, 4);
    assert.ok(
      roll.every((die) => Number.isInteger(die) && die >= 1 && die <= 6),
    );
  }
  assert.notDeepEqual(rollAbilitySet(createSeededRandom(128)), dice);
  assert.equal(keptTotal([6, 5, 4, 1]), 15);
  assert.equal(keptTotal([4, 4, 4, 4]), 12);
  assert.equal(droppedDie([6, 5, 4, 1]), 3);
  // Only one of equal lowest dice is dropped.
  assert.equal(droppedDie([2, 2, 4, 2]), 0);
});

test("5e modifiers round down and proficiency is +2 at levels 1-3", () => {
  const table = [
    [3, -4],
    [7, -2],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [18, 4],
    [20, 5],
  ];
  for (const [score, modifier] of table) {
    assert.equal(abilityModifier(score), modifier, `score ${score}`);
  }
  assert.throws(() => abilityModifier(2), /ability score/);
  assert.throws(() => abilityModifier(21), /ability score/);
  for (const level of [1, 2, 3]) {
    assert.equal(proficiencyBonus(level), 2);
  }
});

test("XP thresholds are 300 for level 2 and 900 for level 3", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(899), 2);
  assert.equal(levelForXp(900), 3);
  assert.equal(levelForXp(50000), 3);
  assert.equal(nextLevelXp(1), 300);
  assert.equal(nextLevelXp(2), 900);
  assert.equal(nextLevelXp(3), undefined);
  assert.throws(() => levelForXp(-1), /experience/);
});

test("placement and the background increase set the six scores", () => {
  const sheet = fighter();
  assert.deepEqual(sheet.abilities, {
    strength: 17,
    dexterity: 14,
    constitution: 14,
    intelligence: 12,
    wisdom: 10,
    charisma: 8,
  });
  assert.deepEqual(sheet.abilityRolls.strength, DICE[0]);
  assert.equal(sheet.level, 1);
  assert.equal(sheet.xp, 0);
  assert.deepEqual(sheet.equipment, ["chain-shirt", "shield", "mace"]);
  // "Amazing Strength, but Charisma 7": any roll may go anywhere.
  const swapped = fighter({
    placement: { ...IN_ORDER, strength: 5, charisma: 0 },
    increase: { dexterity: 1, wisdom: 1, charisma: 1 },
  });
  assert.equal(swapped.abilities.strength, 8);
  assert.equal(swapped.abilities.charisma, 16);
  assert.equal(swapped.abilities.dexterity, 15);
});

test("the level 1 Fighter has 5e numbers from its kit and choices", () => {
  const profile = fighterProfile(fighter());
  assert.equal(profile.proficiencyBonus, 2);
  // 10 + Con 14 (+2).
  assert.equal(profile.maxHp, 12);
  assert.equal(fighter().hp, 12);
  // Chain shirt 13 + Dex (+2, max 2) + shield 2 + Defense 1.
  assert.equal(profile.armorClass, 18);
  assert.equal(
    fighterProfile(fighter({ fightingStyle: "great-weapon-fighting" }))
      .armorClass,
    17,
  );
  assert.equal(profile.initiative, 2);
  assert.deepEqual(profile.attack, {
    weapon: "Mace",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    mastery: "Sap",
    criticalRange: 20,
  });
  assert.deepEqual(
    Object.fromEntries(
      ABILITIES.map((ability) => [ability, profile.savingThrows[ability]]),
    ),
    {
      strength: { bonus: 5, proficient: true },
      dexterity: { bonus: 2, proficient: false },
      constitution: { bonus: 4, proficient: true },
      intelligence: { bonus: 1, proficient: false },
      wisdom: { bonus: 0, proficient: false },
      charisma: { bonus: -1, proficient: false },
    },
  );
  const skill = (id) => profile.skills.find((entry) => entry.id === id);
  assert.deepEqual(skill("athletics"), {
    id: "athletics",
    name: "Athletics",
    ability: "strength",
    bonus: 5,
    proficient: true,
  });
  assert.equal(skill("perception").bonus, 2);
  assert.equal(skill("intimidation").bonus, -1);
  assert.equal(skill("intimidation").proficient, false);
  assert.deepEqual(profile.secondWind, {
    uses: 2,
    healing: { dice: 1, sides: 10, modifier: 1 },
  });
  assert.equal(profile.actionSurgeUses, 0);
  assert.deepEqual(
    profile.features.map(({ id }) => id),
    ["fighting-style", "second-wind", "weapon-mastery"],
  );
  assert.equal(profile.nextLevelXp, 300);
});

test("Dexterity below 10 lowers armour class; a weak Strength weakens the mace", () => {
  const weak = fighter({
    placement: {
      ...IN_ORDER,
      strength: 5,
      dexterity: 4,
      wisdom: 1,
      charisma: 0,
    },
    increase: { intelligence: 1, wisdom: 1, charisma: 1 },
  });
  // Dex 10, Str 8.
  assert.equal(weak.abilities.dexterity, 10);
  assert.equal(weak.abilities.strength, 8);
  const profile = fighterProfile(weak);
  assert.equal(profile.armorClass, 16);
  assert.equal(profile.attack.bonus, 1);
  assert.equal(profile.attack.damage.modifier, -1);
  const clumsy = fighter({
    placement: { ...IN_ORDER, dexterity: 5, charisma: 1 },
    increase: { strength: 2, wisdom: 1 },
  });
  assert.equal(clumsy.abilities.dexterity, 8);
  assert.equal(fighterProfile(clumsy).armorClass, 15);
});

test("levels 2 and 3 add hit points, Action Surge, Tactical Mind and Champion", () => {
  const second = atLevel(fighter(), 300);
  const two = fighterProfile(second);
  assert.equal(second.level, 2);
  // + 6 + Con (+2).
  assert.equal(two.maxHp, 20);
  assert.equal(two.proficiencyBonus, 2);
  assert.equal(two.actionSurgeUses, 1);
  assert.equal(two.secondWind.healing.modifier, 2);
  assert.deepEqual(
    two.features.map(({ id }) => id),
    [
      "fighting-style",
      "second-wind",
      "weapon-mastery",
      "action-surge",
      "tactical-mind",
    ],
  );
  assert.equal(two.attack.criticalRange, 20);
  assert.equal(two.nextLevelXp, 900);
  const three = fighterProfile(atLevel(fighter(), 900));
  assert.equal(three.maxHp, 28);
  assert.equal(three.attack.criticalRange, 19);
  assert.deepEqual(
    three.features.slice(5).map(({ id }) => id),
    ["improved-critical", "remarkable-athlete"],
  );
  assert.equal(three.nextLevelXp, undefined);
  assert.equal(three.attack.bonus, 5);
  assert.equal(three.savingThrows.strength.bonus, 5);
});

test("validation rejects malformed sheets and illegal choices", () => {
  const sheet = fighter();
  const rejects = (value, pattern) =>
    assert.throws(() => validateFighter(value), pattern);
  rejects(null, /sheet/);
  rejects({ ...sheet, id: "x" }, /identity/);
  rejects({ ...sheet, name: " Ada" }, /name/);
  rejects({ ...sheet, class: "Wizard" }, /class/);
  rejects({ ...sheet, extra: true }, /sheet/);
  rejects(
    { ...sheet, abilities: { ...sheet.abilities, strength: 18 } },
    /dice/,
  );
  rejects(
    {
      ...sheet,
      abilityRolls: { ...sheet.abilityRolls, strength: [6, 5, 4, 7] },
    },
    /dice/,
  );
  rejects({ ...sheet, backgroundIncrease: { strength: 2 } }, /increase/);
  rejects(
    { ...sheet, backgroundIncrease: { strength: 2, constitution: 2 } },
    /increase/,
  );
  rejects({ ...sheet, skills: ["athletics"] }, /skill/);
  rejects({ ...sheet, skills: ["athletics", "athletics"] }, /skill/);
  rejects({ ...sheet, skills: ["athletics", "stealth"] }, /skill/);
  rejects({ ...sheet, fightingStyle: "archery" }, /Fighting Style/);
  rejects(
    { ...sheet, equipment: ["chain-mail", "shield", "greatsword"] },
    /equipment/,
  );
  rejects({ ...sheet, weaponMasteries: ["greatsword"] }, /mastery/);
  rejects({ ...sheet, level: 2 }, /level/);
  rejects({ ...sheet, hp: 13 }, /health/);
  rejects({ ...sheet, hp: -1 }, /health/);
  assert.equal(validateFighter({ ...sheet, hp: 0 }).hp, 0);

  assert.throws(
    () => fighter({ placement: { ...IN_ORDER, charisma: 0 } }),
    /placement/,
  );
  assert.throws(
    () => fighter({ placement: { ...IN_ORDER, charisma: 6 } }),
    /placement/,
  );
  assert.throws(
    () => fighter({ increase: { strength: 1, dexterity: 1 } }),
    /increase/,
  );
  assert.throws(() => fighter({ increase: { strength: 3 } }), /increase/);
  assert.throws(() => buildFighter(ID, "Ada", DICE.slice(1), CHOICES), /dice/);
  assert.throws(
    () => buildFighter(ID, "Ada", [[6, 6, 6, 0], ...DICE.slice(1)], CHOICES),
    /dice/,
  );
});

test("no score rises above 20", () => {
  const dice = [[6, 6, 6, 6], ...DICE.slice(1)];
  const sheet = buildFighter(ID, "Ada", dice, CHOICES);
  assert.equal(sheet.abilities.strength, 20);
  assert.equal(abilityModifier(20), 5);
});

test("a new Fighter has no treasure and no XP awards", () => {
  const sheet = fighter();
  assert.deepEqual(sheet.treasure, []);
  assert.deepEqual(sheet.xpAwards, []);
});

const TORC = {
  id: "robbers-barrow/silver-torc",
  name: "Silver Torc",
  description: "A neck ring of twisted silver.",
};
const AWARDS = [
  { id: "robbers-barrow/encounter/barrow-goblin", name: "Goblin", xp: 50 },
  { id: "robbers-barrow/ending/out-with-the-torc", name: "Out", xp: 250 },
];

test("rewards credit XP and treasure once, level up at 300 XP and rest to full HP", () => {
  const hurt = { ...fighter(), hp: 3 };
  const rewarded = rewardFighter(hurt, { xp: AWARDS, treasure: [TORC] });
  assert.equal(rewarded.xp, 300);
  assert.equal(rewarded.level, 2);
  assert.equal(rewarded.hp, fighterProfile(rewarded).maxHp);
  assert.deepEqual(rewarded.treasure, [TORC]);
  assert.deepEqual(
    rewarded.xpAwards,
    AWARDS.map(({ id }) => id),
  );
  // Crediting the same rewards again changes nothing.
  assert.deepEqual(
    rewardFighter(rewarded, { xp: AWARDS, treasure: [TORC] }),
    rewarded,
  );
  // With nothing to credit, the rest still restores HP.
  const rested = rewardFighter(hurt, { xp: [], treasure: [] });
  assert.equal(rested.hp, fighterProfile(rested).maxHp);
  assert.equal(rested.xp, 0);
});

test("the level-up changes name the new level, hit points and features", () => {
  const before = fighter();
  const after = rewardFighter(before, { xp: AWARDS, treasure: [] });
  const changes = levelUpChanges(before, after);
  assert.equal(changes.from, 1);
  assert.equal(changes.to, 2);
  assert.deepEqual(changes.maxHp, {
    before: fighterProfile(before).maxHp,
    after: fighterProfile(after).maxHp,
  });
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Action Surge", "Tactical Mind"],
  );
  assert.equal(levelUpChanges(before, before), undefined);
});

test("validation rejects malformed treasure and repeated awards", () => {
  const sheet = fighter();
  for (const change of [
    { treasure: [{ ...TORC, value: 5 }] },
    { treasure: [{ ...TORC, id: "torc" }] },
    { treasure: [TORC, TORC] },
    { treasure: "torc" },
    { xpAwards: ["robbers-barrow/encounter/a", "robbers-barrow/encounter/a"] },
    { xpAwards: ["goblin"] },
  ]) {
    assert.throws(() => validateFighter({ ...sheet, ...change }));
  }
  assert.deepEqual(
    validateFighter({ ...sheet, treasure: [TORC], xpAwards: [AWARDS[0].id] })
      .treasure,
    [TORC],
  );
});
