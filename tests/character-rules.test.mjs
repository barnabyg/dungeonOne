import assert from "node:assert/strict";
import test from "node:test";
import {
  abilityModifier,
  createCharacter,
  characterProfile,
  advanceCharacter,
  validateCharacter,
  ABILITIES,
  createRolledCharacter,
  meetsFighterMinimums,
  rollAbilities,
  rolledAbilities,
} from "../dist/character-rules.js";
import { createSeededRandom } from "../dist/random.js";

test("a saved Fighter sheet explains ability modifiers, equipment and capped advancement", () => {
  const sheet = createCharacter("Ada", "stout", "a".repeat(32));
  assert.equal(abilityModifier(3), -3);
  assert.equal(abilityModifier(18), 3);
  assert.equal(sheet.level, 1);
  assert.equal(characterProfile(sheet).armorClass, 15);
  assert.equal(characterProfile(sheet).attackBonus, 4);
  assert.equal(characterProfile(sheet).maxHp, 20);
  const advanced = advanceCharacter(sheet, 1000, 7);
  assert.equal(advanced.level, 2);
  assert.equal(advanced.hp, 7);
  assert.equal(characterProfile(advanced).maxHp, 30);
  assert.equal(characterProfile(advanced).attackBonus, 5);
  assert.equal(advanceCharacter(advanced, 5000, 7).level, 3);
  assert.equal(advanceCharacter(advanced, 5000, 7).xp, 6000);
  assert.deepEqual(advanced.abilities, sheet.abilities);
  assert.throws(() => validateCharacter({ ...sheet, level: 3 }), /level/);
  assert.throws(
    () =>
      validateCharacter({
        ...sheet,
        abilities: { ...sheet.abilities, wisdom: 19 },
      }),
    /ability/,
  );
  assert.throws(
    () => validateCharacter({ ...sheet, class: "Wizard" }),
    /class/,
  );
});

// Issue 118: 3d6 in order under fighter-rules-v2.
const dice = (strength, dexterity, constitution, others = [1, 1, 1]) => ({
  strength,
  dexterity,
  constitution,
  intelligence: others,
  wisdom: others,
  charisma: others,
});

test("the engine rolls 3d6 in ability order from a seeded source", () => {
  const rolls = rollAbilities(createSeededRandom(118));
  assert.deepEqual(rollAbilities(createSeededRandom(118)), rolls);
  assert.deepEqual(Object.keys(rolls), [...ABILITIES]);
  for (const ability of ABILITIES) {
    assert.equal(rolls[ability].length, 3);
    assert.ok(
      rolls[ability].every(
        (die) => Number.isInteger(die) && die >= 1 && die <= 6,
      ),
    );
  }
  const random = createSeededRandom(118);
  const draws = Array.from({ length: 18 }, () => random.roll(6));
  assert.deepEqual(
    ABILITIES.flatMap((ability) => rolls[ability]),
    draws,
  );
});

test("a rolled Fighter records its dice under fighter-rules-v2 and keeps them through advancement", () => {
  const rolls = dice([3, 3, 3], [2, 3, 4], [1, 2, 4]);
  const sheet = createRolledCharacter(" Ada ", rolls, "b".repeat(32));
  assert.equal(sheet.rulesVersion, "fighter-rules-v2");
  assert.equal(sheet.name, "Ada");
  assert.deepEqual(sheet.abilityRolls, rolls);
  assert.deepEqual(sheet.abilities, {
    strength: 9,
    dexterity: 9,
    constitution: 7,
    intelligence: 3,
    wisdom: 3,
    charisma: 3,
  });
  assert.equal(sheet.hp, 17);
  assert.deepEqual(validateCharacter(sheet), sheet);
  assert.deepEqual(advanceCharacter(sheet, 1000, 5).abilityRolls, rolls);
});

test("a roll below the Fighter minimums cannot make a character", () => {
  assert.equal(
    meetsFighterMinimums(
      rolledAbilities(dice([3, 3, 2], [3, 3, 3], [3, 3, 3])),
    ),
    false,
  );
  assert.equal(
    meetsFighterMinimums(
      rolledAbilities(dice([3, 3, 3], [3, 3, 2], [3, 3, 3])),
    ),
    false,
  );
  assert.equal(
    meetsFighterMinimums(
      rolledAbilities(dice([3, 3, 3], [3, 3, 3], [2, 2, 2])),
    ),
    false,
  );
  assert.equal(
    meetsFighterMinimums(
      rolledAbilities(dice([3, 3, 3], [3, 3, 3], [3, 2, 2])),
    ),
    true,
  );
  assert.throws(
    () => createRolledCharacter("Low", dice([1, 1, 1], [6, 6, 6], [6, 6, 6])),
    /Fighter minimums/,
  );
});

test("rolled sheets must match their recorded dice, and preset sheets stay fighter-rules-v1", () => {
  const sheet = createRolledCharacter(
    "Ada",
    dice([6, 5, 4], [4, 4, 4], [3, 3, 3]),
    "c".repeat(32),
  );
  assert.throws(
    () =>
      validateCharacter({
        ...sheet,
        abilities: { ...sheet.abilities, strength: 18 },
      }),
    /ability rolls/,
  );
  assert.throws(
    () => validateCharacter({ ...sheet, abilityRolls: undefined }),
    /ability rolls/,
  );
  assert.throws(
    () =>
      validateCharacter({
        ...sheet,
        abilityRolls: { ...sheet.abilityRolls, wisdom: [0, 1, 2] },
      }),
    /ability rolls/,
  );
  assert.throws(
    () =>
      validateCharacter({
        ...sheet,
        abilities: { ...sheet.abilities, strength: 8 },
        abilityRolls: { ...sheet.abilityRolls, strength: [2, 3, 3] },
      }),
    /Fighter minimums/,
  );
  const preset = createCharacter("Bram", "balanced", "d".repeat(32));
  assert.deepEqual(Object.keys(preset), [
    "id",
    "name",
    "class",
    "rulesVersion",
    "abilities",
    "level",
    "xp",
    "hp",
    "equipment",
    "earnedRewards",
  ]);
  assert.equal(preset.rulesVersion, "fighter-rules-v1");
  assert.throws(
    () => validateCharacter({ ...preset, abilityRolls: sheet.abilityRolls }),
    /ability rolls/,
  );
});

// Issue 119: new characters carry a treasure inventory under fighter-rules-v3.
test("new characters can be made under fighter-rules-v3 with an empty inventory", () => {
  const preset = createCharacter(
    "Ada",
    "balanced",
    "e".repeat(32),
    "fighter-rules-v3",
  );
  assert.equal(preset.rulesVersion, "fighter-rules-v3");
  assert.equal(preset.abilityRolls, undefined);
  assert.deepEqual(preset.inventory, { silver: 0, items: [] });
  assert.deepEqual(Object.keys(preset).slice(-2), [
    "earnedRewards",
    "inventory",
  ]);
  assert.deepEqual(validateCharacter(preset), preset);
  const rolls = dice([3, 3, 3], [4, 4, 4], [3, 3, 3]);
  const rolled = createRolledCharacter(
    "Bram",
    rolls,
    "f".repeat(32),
    "fighter-rules-v3",
  );
  assert.equal(rolled.rulesVersion, "fighter-rules-v3");
  assert.deepEqual(rolled.abilityRolls, rolls);
  assert.deepEqual(rolled.inventory, { silver: 0, items: [] });
  assert.deepEqual(validateCharacter(rolled), rolled);
  assert.deepEqual(advanceCharacter(rolled, 1000, 5).inventory, {
    silver: 0,
    items: [],
  });
  assert.throws(
    () =>
      createRolledCharacter(
        "Low",
        dice([1, 1, 1], [6, 6, 6], [6, 6, 6]),
        undefined,
        "fighter-rules-v3",
      ),
    /Fighter minimums/,
  );
});

test("a fighter-rules-v3 inventory holds bounded silver and known items only", () => {
  const sheet = createCharacter(
    "Ada",
    "balanced",
    "e".repeat(32),
    "fighter-rules-v3",
  );
  const stocked = {
    ...sheet,
    inventory: { silver: 21, items: ["healing-draught", "healing-draught"] },
  };
  assert.deepEqual(validateCharacter(stocked), stocked);
  // Key order is not part of validity.
  const reordered = { ...sheet, inventory: { items: [], silver: 2 } };
  assert.deepEqual(validateCharacter(reordered), reordered);
  for (const inventory of [
    undefined,
    { silver: -1, items: [] },
    { silver: 1.5, items: [] },
    { silver: 1_000_001, items: [] },
    { silver: 0 },
    { silver: 0, items: ["vorpal-sword"] },
    { silver: 0, items: Array(21).fill("healing-draught") },
    { silver: 0, items: [], gold: 1 },
  ]) {
    assert.throws(
      () => validateCharacter({ ...sheet, inventory }),
      /inventory/,
      JSON.stringify(inventory),
    );
  }
  const preset = createCharacter("Bram", "balanced", "d".repeat(32));
  assert.throws(
    () => validateCharacter({ ...preset, inventory: { silver: 0, items: [] } }),
    /inventory/,
  );
  assert.throws(
    () =>
      validateCharacter({
        ...sheet,
        abilityRolls: dice([3, 3, 3], [4, 4, 4], [3, 3, 3]),
      }),
    /ability rolls/,
  );
});
