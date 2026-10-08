// #286: the 2024 Fighter (SRD 5.2) at level 4. Level 4 comes at 2,700 XP with
// its hit points, a third Second Wind use, an Ability Score Improvement and a
// fourth weapon mastery; settling credits the level, and the character owes
// the two choices, saved in the library, before it can start another
// adventure. The engine refuses an improvement past 20.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fighterAtLevel,
  gateAdventure,
  gateLevelChoice,
  strongestAttackers,
} from "../dist/balance-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import {
  applyLevelChoice,
  buildFighter,
  fighterProfile,
  LEVEL_XP,
  levelChoiceChanges,
  levelForXp,
  levelUpChanges,
  pendingLevelChoice,
  pendingLevelUp,
  projectLevelChoice,
  settleFighter,
  validateFighter,
} from "../dist/fighter-5e.js";
import { startFifthAdventure } from "../dist/session-5e.js";
import { libraryAt } from "../dist/test-fighter-5e.js";
import { tierAllowed, treasureBudget } from "../dist/treasure-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { lintelBarrow, moduleFile } from "./fixtures/modules.mjs";

const ID = "a".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order: Str 17, Dex 14, Con 14.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
// An 18 on Strength: Str 20 with the background's +2.
const STRONG_DICE = [[6, 6, 6, 1], ...DICE.slice(1)];
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
const fighter = (dice = DICE) => buildFighter(ID, "Ada", dice, CHOICES);
/** The sheet at `level` with that level's least XP, at full health. */
const atLevel = (sheet, level) => {
  const raised = { ...sheet, level, xp: LEVEL_XP[level] };
  return validateFighter({ ...raised, hp: fighterProfile(raised).maxHp });
};
const FEATURES = [
  "fighting-style",
  "second-wind",
  "weapon-mastery",
  "action-surge",
  "tactical-mind",
  "improved-critical",
  "remarkable-athlete",
  "ability-score-improvement",
];

test("the Fighter table, levels 1 to 4: XP, HP, proficiency, features and masteries", () => {
  // Con 14 (+2): 10 + 2 at level 1, then 6 + 2 a level.
  const table = [
    { level: 1, xp: 0, maxHp: 12, features: 3, secondWind: 2, masteries: 3 },
    { level: 2, xp: 300, maxHp: 20, features: 5, secondWind: 2, masteries: 3 },
    { level: 3, xp: 900, maxHp: 28, features: 7, secondWind: 2, masteries: 3 },
    { level: 4, xp: 2700, maxHp: 36, features: 8, secondWind: 3, masteries: 4 },
  ];
  for (const row of table) {
    assert.equal(LEVEL_XP[row.level], row.xp, `level ${row.level} XP`);
    assert.equal(levelForXp(row.xp), row.level);
    let sheet = atLevel(fighter(), row.level);
    if (row.level === 4) {
      sheet = applyLevelChoice(sheet, {
        increase: { wisdom: 2 },
        mastery: "longsword",
      });
    }
    const profile = fighterProfile(sheet);
    assert.equal(profile.maxHp, row.maxHp, `level ${row.level} HP`);
    assert.equal(profile.proficiencyBonus, 2, `level ${row.level} proficiency`);
    assert.deepEqual(
      profile.features.map(({ id }) => id),
      FEATURES.slice(0, row.features),
      `level ${row.level} features`,
    );
    assert.equal(profile.secondWind.uses, row.secondWind);
    assert.equal(profile.secondWind.healing.modifier, row.level);
    assert.equal(sheet.weaponMasteries.length, row.masteries);
    assert.equal(profile.actionSurgeUses, row.level >= 2 ? 1 : 0);
    assert.equal(profile.attack.criticalRange, row.level >= 3 ? 19 : 20);
  }
  assert.equal(levelForXp(2699), 3);
  assert.equal(fighterProfile(atLevel(fighter(), 3)).nextLevelXp, 2700);
  assert.equal(fighterProfile(atLevel(fighter(), 4)).nextLevelXp, 6500);
});

test("settling past 2,700 XP credits level 4 and leaves its choices pending", () => {
  const third = atLevel(fighter(), 3);
  assert.equal(pendingLevelChoice(third), undefined);
  const fourth = settleFighter(third, {
    possessions: {
      equipment: third.equipment,
      stowed: [],
      ammunition: { arrows: 0, bolts: 0 },
      treasure: [],
      purse: 0,
    },
    xp: [{ id: "barrow/encounter/goblin", name: "Goblin", xp: 1800 }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });
  assert.equal(fourth.level, 4);
  assert.equal(fourth.xp, 2700);
  assert.equal(fourth.hp, 36);
  assert.equal(pendingLevelChoice(fourth), 4);
  assert.deepEqual(fourth.abilityScoreImprovements, []);
  assert.equal(fourth.weaponMasteries.length, 3);
  const profile = fighterProfile(fourth);
  assert.match(
    profile.features.at(-1).text,
    /Not chosen yet: \+2 to one ability score or \+1 to two, to a maximum of 20\./u,
  );

  const changes = levelUpChanges(third, fourth);
  assert.equal(changes.from, 3);
  assert.equal(changes.to, 4);
  assert.deepEqual(changes.maxHp, { before: 28, after: 36 });
  assert.deepEqual(changes.proficiencyBonus, { before: 2, after: 2 });
  assert.deepEqual(changes.secondWind, {
    before: { uses: 2, modifier: 3 },
    after: { uses: 3, modifier: 4 },
  });
  assert.deepEqual(changes.weaponMasteries, { before: 3, after: 4 });
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Ability Score Improvement"],
  );
  assert.deepEqual(changes.choices, [
    "ability-score-improvement",
    "weapon-mastery",
  ]);
  // The sheet's card shows the same level-up while the choice is owed.
  assert.deepEqual(pendingLevelUp(fourth), changes);
  // Levels 2 and 3 ask for nothing.
  assert.deepEqual(
    levelUpChanges(atLevel(fighter(), 2), atLevel(fighter(), 3)).choices,
    [],
  );
});

test("the level choice raises scores and recomputes every number from them", () => {
  const owed = atLevel(fighter(), 4);
  const strong = applyLevelChoice(owed, {
    increase: { strength: 2 },
    mastery: "longsword",
  });
  assert.equal(pendingLevelChoice(strong), undefined);
  assert.equal(strong.abilities.strength, 19);
  assert.deepEqual(strong.abilityScoreImprovements, [{ strength: 2 }]);
  assert.deepEqual(strong.weaponMasteries, [
    "dagger",
    "mace",
    "shortsword",
    "longsword",
  ]);
  const was = fighterProfile(owed);
  const now = fighterProfile(strong);
  assert.equal(now.attack.bonus, was.attack.bonus + 1);
  assert.equal(now.attack.damage.modifier, was.attack.damage.modifier + 1);
  assert.equal(now.savingThrows.strength.bonus, 6);
  assert.equal(
    now.skills.find(({ id }) => id === "athletics").bonus,
    was.skills.find(({ id }) => id === "athletics").bonus + 1,
  );
  assert.equal(now.maxHp, was.maxHp);
  assert.equal(
    now.features.find(({ id }) => id === "ability-score-improvement").text,
    "+2 Strength, to a maximum of 20.",
  );
  assert.deepEqual(levelChoiceChanges(owed, strong), [
    "Strength 17 → 19 (modifier +3 → +4).",
    "Mace: +5 → +6 to hit, 1d6 + 3 → 1d6 + 4 bludgeoning.",
    "Strength saving throw +5 → +6.",
    "Athletics +5 → +6.",
    "Carrying capacity 255 → 285 lb.",
    "Weapon Mastery: Longsword (Sap): A creature it hits has disadvantage on its next attack roll before the start of your next turn. It applies only while you wield it.",
  ]);

  // A Constitution increase raises hit points for every level (2024 rules).
  const tough = applyLevelChoice(owed, {
    increase: { constitution: 1, dexterity: 1 },
    mastery: "greatsword",
  });
  assert.equal(tough.abilities.constitution, 15);
  assert.equal(tough.abilities.dexterity, 15);
  assert.equal(fighterProfile(tough).maxHp, 36);
  const hardy = applyLevelChoice(owed, {
    increase: { constitution: 2 },
    mastery: "greatsword",
  });
  // Con 16 (+3): 10 + 3, then 3 × (6 + 3).
  assert.equal(fighterProfile(hardy).maxHp, 40);
  assert.equal(hardy.hp, 40);
  assert.ok(
    levelChoiceChanges(owed, hardy).includes(
      "Hit points 36 → 40: the Constitution modifier counts at every level.",
    ),
  );
  // Dexterity moves AC in leather, initiative and Acrobatics.
  const quick = levelChoiceChanges(
    owed,
    applyLevelChoice(owed, { increase: { dexterity: 2 }, mastery: "shortbow" }),
  );
  assert.ok(quick.includes("AC 14 → 15."));
  assert.ok(quick.includes("Initiative +2 → +3."));
  assert.ok(quick.includes("Acrobatics +2 → +3."));
});

test("an illegal level choice is refused: past 20, the wrong shape, a known mastery, none owed", () => {
  const owed = atLevel(fighter(STRONG_DICE), 4);
  assert.equal(owed.abilities.strength, 20);
  const refuses = (choice, message) =>
    assert.throws(() => applyLevelChoice(owed, choice), message);
  refuses(
    { increase: { strength: 2 }, mastery: "longsword" },
    /Strength is 20: an Ability Score Improvement can't raise a score above 20\./u,
  );
  refuses(
    { increase: { strength: 1, constitution: 1 }, mastery: "longsword" },
    /Strength is 20/u,
  );
  for (const increase of [
    {},
    { strength: 1 },
    { dexterity: 2, constitution: 1 },
    { dexterity: 1, constitution: 1, wisdom: 1 },
    { dexterity: 3 },
    { luck: 2 },
  ]) {
    refuses(
      { increase, mastery: "longsword" },
      /\+2 to one ability or \+1 to two different abilities/u,
    );
  }
  refuses(
    { increase: { dexterity: 2 }, mastery: "mace" },
    /already masters the mace/u,
  );
  refuses({ increase: { dexterity: 2 }, mastery: "club" }, /weapon to master/u);
  refuses({ increase: { dexterity: 2 } }, /Invalid level choice/u);
  const made = applyLevelChoice(owed, {
    increase: { dexterity: 2 },
    mastery: "longsword",
  });
  assert.throws(
    () =>
      applyLevelChoice(made, {
        increase: { wisdom: 2 },
        mastery: "greatsword",
      }),
    /no level choice to make/u,
  );
  // Nothing but the level choice adds an improvement or a mastery.
  assert.throws(
    () =>
      validateFighter({
        ...atLevel(fighter(), 3),
        abilityScoreImprovements: [{ wisdom: 2 }],
        abilities: { ...atLevel(fighter(), 3).abilities, wisdom: 12 },
        weaponMasteries: ["dagger", "mace", "shortsword", "longsword"],
      }),
    /Too many Ability Score Improvements/u,
  );
  assert.throws(
    () =>
      validateFighter({
        ...owed,
        weaponMasteries: [...owed.weaponMasteries, "longsword"],
      }),
    /weapon mastery/u,
  );
  assert.throws(
    () =>
      validateFighter({
        ...made,
        abilities: { ...made.abilities, dexterity: 14 },
      }),
    /Ability Score Improvements/u,
  );
});

test("the level choice projection shows each score, what is unfinished and every change", () => {
  const owed = atLevel(fighter(STRONG_DICE), 4);
  const empty = projectLevelChoice(owed, { increase: {}, mastery: null });
  assert.equal(empty.level, 4);
  assert.deepEqual(
    empty.rows.find(({ ability }) => ability === "strength"),
    { ability: "strength", before: 20, score: 20, modifier: 5, room: 0 },
  );
  assert.deepEqual(empty.masteries, ["longsword", "greatsword", "shortbow"]);
  assert.deepEqual(empty.unfinished, {
    increase: "Choose the ability score to improve.",
    mastery: "Choose a fourth kind of weapon to master.",
  });
  assert.equal(empty.changes, undefined);
  const half = projectLevelChoice(owed, {
    increase: { constitution: 1 },
    mastery: "longsword",
  });
  assert.deepEqual(half.unfinished, {
    increase: "Choose one more ability for +1.",
  });
  // An improvement past 20 is shown as unfinished, never applied.
  const over = projectLevelChoice(owed, {
    increase: { strength: 2 },
    mastery: "longsword",
  });
  assert.match(over.unfinished.increase, /Strength is 20/u);
  assert.equal(over.changes, undefined);
  const done = projectLevelChoice(owed, {
    increase: { constitution: 1, dexterity: 1 },
    mastery: "longsword",
  });
  assert.deepEqual(done.unfinished, {});
  assert.ok(done.changes.includes("Dexterity 14 → 15 (modifier +2 → +2)."));
  assert.throws(
    () => projectLevelChoice(owed, { increase: {}, mastery: "dagger" }),
    /already masters the dagger/u,
  );
  assert.throws(
    () =>
      projectLevelChoice(atLevel(fighter(), 3), {
        increase: {},
        mastery: null,
      }),
    /no level choice/u,
  );
});

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-286-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** A library file holding only `sheet`, at revision 1. */
const libraryOf = (sheet) => ({
  kind: "dungeon-one-characters",
  formatVersion: FIFTH_LIBRARY_FORMAT,
  revision: "0".repeat(32),
  creationsStarted: 1,
  sessionsStarted: 0,
  characters: [{ sheet, revision: 1 }],
});

test("the library saves the pending choice, refuses an adventure until it is made, and makes it", async () => {
  await withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const owed = atLevel(fighter(STRONG_DICE), 4);
    await writeFile(path, JSON.stringify(libraryOf(owed)));
    const library = new FifthCharacterLibrary(path, 7);
    let data = await library.read();
    assert.equal(pendingLevelChoice(data.characters[0].sheet), 4);
    await assert.rejects(
      startFifthAdventure(library, 0, ID, lintelBarrow, data.revision),
      /Ada must choose the level 4 Ability Score Improvement and weapon mastery on the character sheet before starting another adventure\./u,
    );
    const before = await readFile(path, "utf8");
    // Past 20 is refused, and nothing is written.
    await assert.rejects(
      library.chooseLevel(
        ID,
        { increase: { strength: 2 }, mastery: "longsword" },
        data.revision,
      ),
      /Strength is 20/u,
    );
    await assert.rejects(
      library.chooseLevel(
        ID,
        { increase: { dexterity: 2 }, mastery: "longsword" },
        "f".repeat(32),
      ),
      /stale/u,
    );
    assert.equal(await readFile(path, "utf8"), before);
    data = await library.chooseLevel(
      ID,
      { increase: { dexterity: 2 }, mastery: "longsword" },
      data.revision,
    );
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(stored.characters[0].sheet.abilityScoreImprovements, [
      { dexterity: 2 },
    ]);
    assert.equal(stored.characters[0].sheet.abilities.dexterity, 16);
    assert.equal(stored.characters[0].revision, 2);
    await assert.rejects(
      library.chooseLevel(
        ID,
        { increase: { wisdom: 2 }, mastery: "greatsword" },
        data.revision,
      ),
      /no level choice to make/u,
    );
    const session = await startFifthAdventure(
      library,
      0,
      ID,
      lintelBarrow,
      data.revision,
    );
    assert.equal(session.state.status, "playing");
    // On an adventure, no choice can be made (none is owed anyway).
    await assert.rejects(
      library.chooseLevel(
        ID,
        { increase: { wisdom: 2 }, mastery: "greatsword" },
        (await library.read()).revision,
      ),
      /on an adventure/u,
    );
  });
});

test("modules may recommend level 4, with a 600 gp budget and the same tiers as level 3", () => {
  assert.equal(treasureBudget(4), 60000);
  assert.equal(treasureBudget(4), 4 * treasureBudget(1));
  assert.equal(tierAllowed("common", 4), true);
  assert.equal(tierAllowed("uncommon", 4), true);
  assert.equal(tierAllowed("rare", 4), false);
  const module = moduleFile("lintel-barrow");
  module.recommendedLevels = { min: 3, max: 4 };
  assert.deepEqual(validateModule(module).recommendedLevels, {
    min: 3,
    max: 4,
  });
  module.recommendedLevels = { min: 4, max: 6 };
  assert.throws(() => validateModule(module), /recommendedLevels max/u);
});

test("the gate builds level-4 Fighters with its stated level choice", () => {
  const owed = atLevel(fighter(), 4);
  assert.deepEqual(gateLevelChoice(owed), {
    increase: { strength: 2 },
    mastery: "longsword",
  });
  // Points that would pass 20 go to Constitution.
  const capped = atLevel(fighter(STRONG_DICE), 4);
  assert.deepEqual(gateLevelChoice(capped).increase, { constitution: 2 });
  const nineteen = atLevel(
    buildFighter(ID, "Ada", STRONG_DICE, {
      ...CHOICES,
      increase: { strength: 1, constitution: 1, wisdom: 1 },
    }),
    4,
  );
  assert.deepEqual(gateLevelChoice(nineteen).increase, {
    strength: 1,
    constitution: 1,
  });
  // The Dexterity-first build improves Dexterity; a placed weapon is mastered.
  assert.deepEqual(gateLevelChoice(owed, true, "shortbow"), {
    increase: { dexterity: 2 },
    mastery: "shortbow",
  });
  assert.equal(gateLevelChoice(owed, false, "mace").mastery, "longsword");

  const built = fighterAtLevel(DICE, 4);
  assert.equal(built.level, 4);
  assert.equal(pendingLevelChoice(built), undefined);
  assert.equal(built.weaponMasteries.length, 4);
  for (const attacker of strongestAttackers(DICE, 4, ["greatsword"])) {
    assert.equal(pendingLevelChoice(attacker.sheet), undefined);
    if (attacker.gear === "greatsword") {
      assert.ok(attacker.sheet.weaponMasteries.includes("greatsword"));
    }
  }
});

test("the gate's XP limit counts up to level 6 for a module whose maximum is 4", () => {
  const module = moduleFile("lintel-barrow");
  module.recommendedLevels = { min: 4, max: 4 };
  module.difficulty = "hard";
  const options = { seeds: [0, 1], sampleSize: 200 };
  const verdict = (xp) => {
    const changed = structuredClone(module);
    changed.endings.find(({ id }) => id === "out-with-the-torc").xp = xp;
    const result = gateAdventure(validateModule(changed), options);
    assert.equal(result.ok, true);
    return result.verdict.xp;
  };
  // From 6,499 XP, one short of level 5, the goblin's 50 XP and 7,450 more
  // stay below level 6 at 14,000.
  const fits = verdict(7450);
  assert.equal(fits.startXp, 6499);
  assert.equal(fits.levelLimit, 5);
  assert.equal(fits.endLevel, 5);
  assert.equal(fits.ok, true);
  const over = verdict(7451);
  assert.equal(over.endLevel, 6);
  assert.equal(over.ok, false);
});

test("the handoff's input library is Ada at level 3, 10 XP short of level 4", async () => {
  // Regenerate it from libraryAt(3) with 2,690 XP when the library format changes.
  const input = new URL(
    "../docs/acceptance/inputs/issue-286/level-3-ada-2690-xp.json",
    import.meta.url,
  );
  const expected = libraryAt(3);
  expected.characters[0].sheet = validateFighter({
    ...expected.characters[0].sheet,
    xp: 2690,
  });
  assert.deepEqual(
    JSON.parse(await readFile(input, "utf8")),
    JSON.parse(JSON.stringify(expected)),
  );
});
