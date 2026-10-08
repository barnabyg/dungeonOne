import assert from "node:assert/strict";
import test from "node:test";
import {
  abilityModifier,
  buildCharacter,
  droppedDie,
  characterProfile,
  keptTotal,
  levelForXp,
  levelUpChanges,
  nextLevelXp,
  proficiencyBonus,
  settleCharacter,
  rollAbilitySet,
  validateCharacter,
} from "../dist/character-5e.js";
import { ABILITIES } from "../dist/class-5e.js";
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
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};
const fighter = (choices = {}) =>
  buildCharacter(ID, "Ada", DICE, { ...CHOICES, ...choices });
const atLevel = (sheet, xp) => {
  const level = levelForXp(xp);
  const raised = { ...sheet, level, xp };
  return validateCharacter({ ...raised, hp: characterProfile(raised).maxHp });
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

test("5e modifiers round down and proficiency is +2 at levels 1-4", () => {
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
  for (const level of [1, 2, 3, 4]) {
    assert.equal(proficiencyBonus(level), 2);
  }
  assert.equal(proficiencyBonus(5), 3);
});

test("XP thresholds are 300 for level 2, 900 for level 3, 2,700 for level 4 and 6,500 for level 5", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(899), 2);
  assert.equal(levelForXp(900), 3);
  assert.equal(levelForXp(2699), 3);
  assert.equal(levelForXp(2700), 4);
  assert.equal(levelForXp(6499), 4);
  assert.equal(levelForXp(6500), 5);
  assert.equal(levelForXp(50000), 5);
  assert.equal(nextLevelXp(1), 300);
  assert.equal(nextLevelXp(2), 900);
  assert.equal(nextLevelXp(3), 2700);
  assert.equal(nextLevelXp(4), 6500);
  assert.equal(nextLevelXp(5), undefined);
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
  assert.deepEqual(sheet.equipment, ["leather", "mace"]);
  assert.deepEqual(sheet.weaponMasteries, ["dagger", "mace", "shortsword"]);
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
  const profile = characterProfile(fighter());
  assert.equal(profile.proficiencyBonus, 2);
  // 10 + Con 14 (+2).
  assert.equal(profile.maxHp, 12);
  assert.equal(fighter().hp, 12);
  // Leather 11 + Dex (+2) + Defense 1.
  assert.equal(profile.armorClass, 14);
  assert.equal(
    characterProfile(fighter({ fightingStyle: "great-weapon-fighting" }))
      .armorClass,
    13,
  );
  assert.equal(profile.initiative, 2);
  assert.deepEqual(profile.attack, {
    weaponId: "mace",
    weapon: "Mace",
    ability: "strength",
    grip: "one-handed",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    criticalRange: 20,
    mastery: "Sap",
    disadvantage: [],
  });
  assert.equal(profile.lightAttack, undefined);
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
  const profile = characterProfile(weak);
  assert.equal(profile.armorClass, 12);
  assert.equal(profile.attack.bonus, 1);
  assert.equal(profile.attack.damage.modifier, -1);
  const clumsy = fighter({
    placement: { ...IN_ORDER, dexterity: 5, charisma: 1 },
    increase: { strength: 2, wisdom: 1 },
  });
  assert.equal(clumsy.abilities.dexterity, 8);
  assert.equal(characterProfile(clumsy).armorClass, 11);
});

test("each kit gives its own AC and attacks; masteries apply only to weapons held", () => {
  const rows = [
    // kit, equipment, AC, attack, light attack
    ["mace", ["leather", "mace"], 14, "Mace +5 1d6+3 Sap", undefined],
    [
      "two-daggers",
      ["leather", "dagger", "dagger"],
      14,
      "Dagger +5 1d4+3 -",
      "Dagger +5 1d4+0 Nick",
    ],
    [
      "club-and-dagger",
      ["leather", "club", "dagger"],
      14,
      "Club +5 1d4+3 -",
      "Dagger +5 1d4+0 Nick",
    ],
  ];
  const text = (attack) =>
    attack === undefined
      ? undefined
      : `${attack.weapon} +${attack.bonus} ${attack.damage.dice}d${attack.damage.sides}+${attack.damage.modifier} ${attack.mastery ?? "-"}`;
  for (const [kit, equipment, armorClass, attack, light] of rows) {
    const sheet = fighter({ kit });
    const profile = characterProfile(sheet);
    assert.deepEqual(sheet.equipment, equipment, kit);
    assert.equal(profile.armorClass, armorClass, kit);
    assert.equal(text(profile.attack), attack, kit);
    assert.equal(text(profile.lightAttack), light, kit);
  }
  // Without the dagger's mastery, the daggers have no Nick.
  const unmastered = characterProfile(
    fighter({
      kit: "two-daggers",
      masteries: ["mace", "shortsword", "greatsword"],
    }),
  );
  assert.equal(unmastered.attack.mastery, undefined);
  assert.equal(unmastered.lightAttack.mastery, undefined);
  assert.equal(
    unmastered.features.find(({ id }) => id === "weapon-mastery").name,
    "Weapon Mastery: Mace, Shortsword, Greatsword",
  );
});

test("creation refuses an unknown kit and anything but three different masteries", () => {
  assert.throws(() => fighter({ kit: "plate" }), /starting kits/);
  for (const masteries of [
    ["dagger", "mace"],
    ["dagger", "mace", "mace"],
    ["dagger", "mace", "club"],
    ["dagger", "mace", "shortsword", "longsword"],
    "dagger",
  ]) {
    assert.throws(() => fighter({ masteries }), /weapon/, String(masteries));
  }
});

test("levels 2 and 3 add hit points, Action Surge, Tactical Mind and Champion", () => {
  const second = atLevel(fighter(), 300);
  const two = characterProfile(second);
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
  const three = characterProfile(atLevel(fighter(), 900));
  assert.equal(three.maxHp, 28);
  assert.equal(three.attack.criticalRange, 19);
  assert.deepEqual(
    three.features.slice(5).map(({ id }) => id),
    ["improved-critical", "remarkable-athlete"],
  );
  assert.equal(three.nextLevelXp, 2700);
  assert.equal(three.attack.bonus, 5);
  assert.equal(three.savingThrows.strength.bonus, 5);
});

test("validation rejects malformed sheets and illegal choices", () => {
  const sheet = fighter();
  const rejects = (value, pattern) =>
    assert.throws(() => validateCharacter(value), pattern);
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
  rejects({ ...sheet, fightingStyle: "blind-fighting" }, /Fighting Style/);
  rejects(
    { ...sheet, equipment: ["chain-mail", "shield", "greatsword"] },
    /equipment/,
  );
  rejects({ ...sheet, equipment: ["leather", "sling"] }, /equipment/);
  rejects({ ...sheet, weaponMasteries: ["greatsword"] }, /mastery/);
  rejects({ ...sheet, weaponMasteries: ["club", "mace", "dagger"] }, /mastery/);
  // Gear found later is any legal loadout, not only a kit.
  assert.deepEqual(
    validateCharacter({ ...sheet, equipment: ["chain-mail", "longsword"] })
      .equipment,
    ["chain-mail", "longsword"],
  );
  rejects({ ...sheet, level: 2 }, /level/);
  rejects({ ...sheet, hp: 13 }, /health/);
  rejects({ ...sheet, hp: -1 }, /health/);
  assert.equal(validateCharacter({ ...sheet, hp: 0 }).hp, 0);

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
  assert.throws(
    () => buildCharacter(ID, "Ada", DICE.slice(1), CHOICES),
    /dice/,
  );
  assert.throws(
    () => buildCharacter(ID, "Ada", [[6, 6, 6, 0], ...DICE.slice(1)], CHOICES),
    /dice/,
  );
});

test("no score rises above 20", () => {
  const dice = [[6, 6, 6, 6], ...DICE.slice(1)];
  const sheet = buildCharacter(ID, "Ada", dice, CHOICES);
  assert.equal(sheet.abilities.strength, 20);
  assert.equal(abilityModifier(20), 5);
});

test("a new Fighter has no treasure, no finds and no XP awards", () => {
  const sheet = fighter();
  assert.deepEqual(sheet.treasure, []);
  assert.deepEqual(sheet.finds, []);
  assert.deepEqual(sheet.xpAwards, []);
});

const TORC = {
  id: "lintel-barrow/silver-torc",
  name: "Silver Torc",
  description: "A neck ring of twisted silver.",
  value: 2500,
};
const AWARDS = [
  { id: "lintel-barrow/encounter/barrow-goblin", name: "Goblin", xp: 50 },
  { id: "lintel-barrow/ending/out-with-the-torc", name: "Out", xp: 250 },
];
/** A settlement holding the starting equipment, `treasure` and nothing else. */
const settlement = (xp, finds = [], treasure = finds) => ({
  possessions: {
    equipment: ["chain-shirt", "shield", "mace"],
    stowed: [],
    ammunition: { arrows: 0, bolts: 0 },
    treasure,
    purse: 0,
  },
  xp,
  finds,
  sold: [],
  coin: [],
  gear: [],
});

test("settling credits XP and finds once, keeps what is held, levels up at 300 XP and rests to full HP", () => {
  const hurt = { ...fighter(), hp: 3 };
  const rewarded = settleCharacter(hurt, settlement(AWARDS, [TORC]));
  assert.equal(rewarded.xp, 300);
  assert.equal(rewarded.level, 2);
  assert.equal(rewarded.hp, characterProfile(rewarded).maxHp);
  assert.deepEqual(rewarded.treasure, [TORC]);
  assert.deepEqual(rewarded.finds, [TORC.id]);
  assert.deepEqual(
    rewarded.xpAwards,
    AWARDS.map(({ id }) => id),
  );
  // Settling the same adventure again changes nothing.
  assert.deepEqual(
    settleCharacter(rewarded, settlement(AWARDS, [TORC])),
    rewarded,
  );
  // With nothing to credit, the rest still restores HP.
  const rested = settleCharacter(hurt, settlement([]));
  assert.equal(rested.hp, characterProfile(rested).maxHp);
  assert.equal(rested.xp, 0);
  // What is no longer held is gone, but stays found.
  const parted = settleCharacter(rewarded, settlement([], [], []));
  assert.deepEqual(parted.treasure, []);
  assert.deepEqual(parted.finds, [TORC.id]);
});

test("the level-up changes name the new level, hit points and features", () => {
  const before = fighter();
  const after = settleCharacter(before, settlement(AWARDS));
  const changes = levelUpChanges(before, after);
  assert.equal(changes.from, 1);
  assert.equal(changes.to, 2);
  assert.deepEqual(changes.maxHp, {
    before: characterProfile(before).maxHp,
    after: characterProfile(after).maxHp,
  });
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Action Surge", "Tactical Mind"],
  );
  assert.equal(levelUpChanges(before, before), undefined);
});

test("reaching 900 XP raises a level 2 Fighter to 3 with the Champion's features", () => {
  const second = settleCharacter(fighter(), settlement(AWARDS));
  const third = settleCharacter(
    second,
    settlement([
      { id: "sealed-crypt/ending/crypt-cleared", name: "Crypt", xp: 600 },
    ]),
  );
  assert.equal(third.level, 3);
  assert.equal(third.hp, characterProfile(third).maxHp);
  const changes = levelUpChanges(second, third);
  assert.equal(changes.from, 2);
  assert.equal(changes.to, 3);
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Champion: Improved Critical", "Champion: Remarkable Athlete"],
  );
});

test("validation rejects malformed treasure and repeated awards", () => {
  const sheet = fighter();
  for (const change of [
    { treasure: [{ ...TORC, price: 5 }] },
    { treasure: [{ ...TORC, value: -1 }] },
    { treasure: [{ ...TORC, value: 2.5 }] },
    { treasure: [{ ...TORC, value: undefined }] },
    { treasure: [{ ...TORC, id: "torc" }] },
    { treasure: [TORC, TORC] },
    { treasure: "torc" },
    { xpAwards: ["lintel-barrow/encounter/a", "lintel-barrow/encounter/a"] },
    { xpAwards: ["goblin"] },
    { finds: [TORC.id, TORC.id] },
    { finds: ["torc"] },
    { finds: undefined },
  ]) {
    assert.throws(() => validateCharacter({ ...sheet, ...change }));
  }
  assert.deepEqual(
    validateCharacter({ ...sheet, treasure: [TORC], xpAwards: [AWARDS[0].id] })
      .treasure,
    [TORC],
  );
});
