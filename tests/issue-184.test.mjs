// #184: the server projects each ability row's score, modifier and cap, the
// skill limit and any unfinished choice, so the creation page computes none.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCharacter,
  defaultPlacement,
  characterCarrying,
  characterProfile,
  projectCreation,
} from "../dist/character-5e.js";
import { ABILITIES } from "../dist/class-5e.js";

const dice = [
  [6, 6, 6, 1],
  [5, 4, 3, 2],
  [2, 2, 2, 2],
  [6, 5, 4, 3],
  [3, 1, 1, 1],
  [4, 4, 4, 4],
];
const complete = {
  placement: defaultPlacement(dice),
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

test("complete choices project the same scores and modifiers as buildCharacter", () => {
  for (const increase of [
    { strength: 2, constitution: 1 },
    { dexterity: 1, wisdom: 1, charisma: 1 },
    { intelligence: 2, charisma: 1 },
  ]) {
    const choices = { ...complete, increase };
    const sheet = buildCharacter("0".repeat(32), "Preview", dice, choices);
    const profile = characterProfile(sheet);
    const projection = projectCreation(dice, choices);
    assert.deepEqual(
      projection.rows.map(({ ability }) => ability),
      [...ABILITIES],
    );
    for (const row of projection.rows) {
      assert.equal(row.score, sheet.abilities[row.ability], row.ability);
      assert.equal(row.modifier, profile.modifiers[row.ability], row.ability);
      assert.equal(row.atCap, sheet.abilities[row.ability] >= 20, row.ability);
    }
    assert.deepEqual(projection.unfinished, {});
    assert.deepEqual(projection.sheet, {
      abilities: sheet.abilities,
      profile,
      carrying: characterCarrying(sheet),
    });
  }
});

test("a score that reaches 20 is marked at the cap", () => {
  const projection = projectCreation(dice, complete);
  const strength = projection.rows.find(
    ({ ability }) => ability === "strength",
  );
  assert.deepEqual(strength, {
    ability: "strength",
    score: 20,
    modifier: 5,
    atCap: true,
  });
  assert.equal(projection.rows.filter(({ atCap }) => atCap).length, 1);
});

test("the skill limit is projected for the current choices", () => {
  const two = projectCreation(dice, complete).skills;
  assert.deepEqual(two, { chosen: 2, limit: 2, full: true });
  const one = projectCreation(dice, { ...complete, skills: ["athletics"] });
  assert.deepEqual(one.skills, { chosen: 1, limit: 2, full: false });
  assert.equal(one.unfinished.skills, "Choose 2 skills; 1 chosen.");
  assert.equal(one.sheet, undefined);
  // A third tick sent before the page saw the limit is reported, not saved.
  const three = projectCreation(dice, {
    ...complete,
    skills: ["athletics", "perception", "survival"],
  });
  assert.deepEqual(three.skills, { chosen: 3, limit: 2, full: true });
  assert.equal(three.unfinished.skills, "Choose 2 skills; 3 chosen.");
  assert.equal(three.sheet, undefined);
});

test("an unfinished +1 to three still projects every row", () => {
  for (const [increase, message] of [
    [{}, "Choose 3 more abilities for +1."],
    [{ wisdom: 1 }, "Choose 2 more abilities for +1."],
    [{ wisdom: 1, charisma: 1 }, "Choose 1 more ability for +1."],
  ]) {
    const projection = projectCreation(dice, { ...complete, increase });
    assert.equal(projection.unfinished.increase, message);
    assert.equal(projection.sheet, undefined);
    const wisdom = projection.rows.find(({ ability }) => ability === "wisdom");
    const base = projectCreation(dice, {
      ...complete,
      increase: { strength: 2, constitution: 1 },
    }).rows.find(({ ability }) => ability === "wisdom");
    assert.equal(wisdom.score, base.score + (increase.wisdom ?? 0));
  }
});

test("choices that no page could send are refused", () => {
  for (const choices of [
    { ...complete, placement: { ...complete.placement, strength: 9 } },
    { ...complete, increase: { strength: 2 } },
    { ...complete, increase: { strength: 2, wisdom: 2 } },
    {
      ...complete,
      increase: { strength: 1, wisdom: 1, charisma: 1, dexterity: 1 },
    },
    { ...complete, increase: { luck: 1 } },
    { ...complete, skills: ["athletics", "athletics"] },
    { ...complete, skills: ["stealth"] },
    { ...complete, skills: "athletics" },
    { ...complete, fightingStyle: "blind-fighting" },
  ]) {
    assert.throws(() => projectCreation(dice, choices), Error);
  }
  assert.throws(() => projectCreation([[6, 6, 6, 6]], complete), /six rolls/);
});
