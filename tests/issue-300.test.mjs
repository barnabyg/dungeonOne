// #300: the Fighter is class data. A Fighter built through its class
// definition derives exactly the numbers the hard-coded Fighter did.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyLevelChoice,
  buildCharacter,
  characterCarrying,
  characterProfile,
  CLASSES,
  classOf,
  DEFAULT_CLASS,
  defaultPlacement,
  levelForXp,
  levelUpChanges,
  pendingLevelChoice,
  projectCreation,
  validateCharacter,
} from "../dist/character-5e.js";
import { FEATURE_USES_RULE, FIGHTING_STYLES } from "../dist/class-5e.js";
import { equipmentProfile } from "../dist/equipment-5e.js";
import { FIGHTER } from "../dist/fighter-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { digest, goldenCases } from "./fixtures/fighter-golden-cases.mjs";

const golden = JSON.parse(
  readFileSync(new URL("./fixtures/fighter-golden.json", import.meta.url)),
);

/**
 * Leaves out of a case the skills added after #300 (Stealth, #301), which
 * the hard-coded Fighter's profile did not list, and reads the two
 * hard-coded counters back out of the feature-uses map (#333), without the
 * hit-dice pool it added.
 */
const GOLDEN_SKILLS = new Set(FIGHTER.skillChoices.options);
const asRecorded = ({ featureUses, ...profile }) => {
  delete profile.hitDice;
  return {
    ...profile,
    skills: profile.skills.filter(({ id }) => GOLDEN_SKILLS.has(id)),
    ...(profile.secondWind === undefined
      ? {}
      : {
          secondWind: {
            uses: featureUses["second-wind"]?.max ?? 0,
            ...profile.secondWind,
          },
        }),
    actionSurgeUses: featureUses["action-surge"]?.max ?? 0,
  };
};

const api = {
  build: (dice, choices) =>
    buildCharacter("0".repeat(32), "Golden", dice, choices),
  defaults: FIGHTER.defaults,
  styles: Object.keys(FIGHTING_STYLES),
  validate: validateCharacter,
  profile: (sheet) => asRecorded(characterProfile(sheet)),
  carrying: characterCarrying,
  levelForXp,
  defaultPlacement,
  applyLevelChoice,
  pendingLevelChoice,
  levelUpChanges,
  projectCreation: (dice, choices) => {
    const projection = projectCreation(dice, choices);
    return projection.sheet === undefined
      ? projection
      : {
          ...projection,
          sheet: {
            ...projection.sheet,
            profile: asRecorded(projection.sheet.profile),
          },
        };
  },
};

/**
 * The feature-uses rule as the hard-coded Fighter worded it, before short
 * rests (#334) changed it.
 */
const RECORDED_RULE =
  "Spent uses stay spent for the rest of the adventure; a rest between adventures restores them and every hit point.";
const asWorded = (value) =>
  JSON.parse(
    JSON.stringify(value).replaceAll(FEATURE_USES_RULE, RECORDED_RULE),
  );

test("a Fighter derives the hard-coded Fighter's numbers at every level, style and kit", () => {
  const { cases, levelUps, creation } = asWorded(goldenCases(api));
  assert.equal(cases.length, Object.keys(golden.digests).length);
  const differing = cases
    .filter(({ id, ...rest }) => digest(rest) !== golden.digests[id])
    .map(({ id }) => id);
  assert.deepEqual(differing, []);
  for (const sample of golden.samples) {
    const { id, ...expected } = sample;
    const actual = cases.find((entry) => entry.id === id);
    assert.deepEqual(
      JSON.parse(JSON.stringify(actual)),
      { id, ...expected },
      id,
    );
  }
  assert.equal(digest(levelUps), golden.levelUps);
  assert.equal(digest(creation), golden.creation);
});

test("the sheet names its class by id, and only a known class is valid", () => {
  assert.equal(TEST_FIGHTER.class, "fighter");
  assert.equal(DEFAULT_CLASS, "fighter");
  assert.equal(classOf(TEST_FIGHTER), FIGHTER);
  assert.equal(CLASSES.fighter.name, "Fighter");
  assert.throws(
    () => validateCharacter({ ...TEST_FIGHTER, class: "Fighter" }),
    /Unsupported character class/u,
  );
  assert.throws(
    () => validateCharacter({ ...TEST_FIGHTER, class: "wizard" }),
    /Unsupported character class/u,
  );
});

test("weapon proficiency follows the class's training", () => {
  const context = {
    modifiers: { strength: 3, dexterity: 2 },
    strengthScore: 17,
    dexterityScore: 14,
    proficiency: 2,
    armourTraining: FIGHTER.armourTraining,
    masteries: [],
    criticalRange: 20,
  };
  const longsword = (weaponProficiencies) =>
    equipmentProfile(["longsword"], { ...context, weaponProficiencies }).attack
      .bonus;
  assert.equal(longsword(FIGHTER.weaponProficiencies), 5);
  // A class trained only with simple weapons adds no proficiency to it.
  assert.equal(longsword(["simple"]), 3);
  const sheet = validateCharacter({
    ...TEST_FIGHTER,
    equipment: ["leather", "longsword"],
  });
  assert.equal(characterProfile(sheet).attack.bonus, 5);
});

test("the Fighter's level table comes from its definition", () => {
  assert.equal(FIGHTER.hitDie, 10);
  assert.deepEqual(FIGHTER.savingThrows, ["strength", "constitution"]);
  for (const level of [1, 2, 3, 4, 5]) {
    const raised = {
      ...TEST_FIGHTER,
      level,
      xp: [0, 300, 900, 2700, 6500][level - 1],
    };
    const profile = characterProfile(raised);
    assert.equal(profile.featureUses["second-wind"].max, level >= 4 ? 3 : 2);
    assert.equal(
      profile.featureUses["action-surge"]?.max ?? 0,
      level >= 2 ? 1 : 0,
    );
    assert.equal(profile.attack.criticalRange, level >= 3 ? 19 : 20);
    assert.equal(profile.attacksPerAction, level >= 5 ? 2 : 1);
    assert.equal(
      profile.maxHp,
      10 +
        profile.modifiers.constitution +
        (level - 1) * (6 + profile.modifiers.constitution),
    );
  }
});
