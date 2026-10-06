// #132: ability checks and saving throws, as pure rules over a sheet.
import assert from "node:assert/strict";
import test from "node:test";
import { abilityCheck, savingThrow } from "../dist/checks-5e.js";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../dist/fighter-5e.js";

// Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 10, Wis 10, Cha 10;
// Athletics and Perception; proficiency +2.
const sheet = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 4, 1],
    [3, 3, 4, 1],
  ],
  {
    placement: {
      strength: 0,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: 5,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  },
);

function at(level) {
  const xp = { 1: 0, 2: 300, 3: 900 }[level];
  const leveled = { ...sheet, xp, level: levelForXp(xp) };
  return validateFighter({ ...leveled, hp: fighterProfile(leveled).maxHp });
}

function dice(...queue) {
  const drawn = [];
  return {
    drawn,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      drawn.push(sides);
      return queue.shift();
    },
  };
}

test("a skill check adds the ability modifier and proficiency in the skill", () => {
  const random = dice(8);
  const roll = abilityCheck(sheet, { skill: "athletics", dc: 15 }, random);
  assert.deepEqual(random.drawn, [20]);
  assert.deepEqual(roll, {
    kind: "check",
    ability: "strength",
    skill: "athletics",
    label: "Athletics check",
    d20: 8,
    modifier: 3,
    proficiency: 2,
    total: 13,
    dc: 15,
    success: false,
  });
});

test("a check meets its DC to succeed; a skill without proficiency adds none", () => {
  const passed = abilityCheck(sheet, { skill: "athletics", dc: 13 }, dice(8));
  assert.equal(passed.success, true);
  const persuasion = abilityCheck(
    sheet,
    { skill: "persuasion", dc: 10 },
    dice(10),
  );
  assert.equal(persuasion.proficiency, 0);
  assert.equal(persuasion.modifier, 0);
  assert.equal(persuasion.total, 10);
  assert.equal(persuasion.label, "Persuasion check");
});

test("a plain ability check uses only the ability modifier", () => {
  const roll = abilityCheck(sheet, { ability: "dexterity", dc: 12 }, dice(11));
  assert.equal(roll.label, "Dexterity check");
  assert.equal(roll.skill, undefined);
  assert.equal(roll.total, 12);
  assert.equal(roll.proficiency, 0);
  assert.equal(roll.success, true);
});

test("a natural 20 or 1 on a check is just its number", () => {
  assert.equal(
    abilityCheck(sheet, { skill: "persuasion", dc: 25 }, dice(20)).success,
    false,
  );
  assert.equal(
    abilityCheck(sheet, { skill: "athletics", dc: 6 }, dice(1)).success,
    true,
  );
});

test("Remarkable Athlete gives a level 3 Champion advantage on Athletics only", () => {
  const champion = at(3);
  const random = dice(4, 15);
  const roll = abilityCheck(champion, { skill: "athletics", dc: 15 }, random);
  assert.deepEqual(random.drawn, [20, 20]);
  assert.deepEqual(roll.mode, {
    d20s: [4, 15],
    advantage: ["Remarkable Athlete"],
    disadvantage: [],
  });
  assert.equal(roll.d20, 15);
  assert.equal(roll.total, 20);
  assert.equal(
    abilityCheck(at(2), { skill: "athletics", dc: 15 }, dice(4)).mode,
    undefined,
  );
  assert.equal(
    abilityCheck(champion, { skill: "perception", dc: 15 }, dice(4)).mode,
    undefined,
  );
});

test("saving throws add proficiency only in Strength and Constitution", () => {
  assert.deepEqual(savingThrow(sheet, "constitution", 12, dice(8)), {
    kind: "save",
    ability: "constitution",
    label: "Constitution saving throw",
    d20: 8,
    modifier: 2,
    proficiency: 2,
    total: 12,
    dc: 12,
    success: true,
  });
  const dexterity = savingThrow(sheet, "dexterity", 12, dice(10));
  assert.equal(dexterity.proficiency, 0);
  assert.equal(dexterity.total, 11);
  assert.equal(dexterity.success, false);
});
