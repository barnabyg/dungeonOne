import assert from "node:assert/strict";
import test from "node:test";
import {
  abilityModifier,
  createCharacter,
  characterProfile,
  advanceCharacter,
  validateCharacter,
} from "../dist/character-rules.js";

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
