// #339: a level-1 Cleric. Creation makes a Cleric from its class data, with
// its Divine Order (Protector or Thaumaturge), cantrips and prepared
// spells; its numbers by table; the Thaumaturge's bonus on Arcana and
// Religion checks; and prepared spells change in the library between
// adventures, never during one. Engine tests are in
// issue-339-engine.test.mjs; levels 2 and 3 are #341's.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  abilityDisadvantages,
  buildCharacter,
  characterProfile,
  CLASSES,
  defaultPlacement,
  OFFERED_CLASS_IDS,
  prepareSpells,
  projectCreation,
  validateCharacter,
} from "../dist/character-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import { abilityCheck } from "../dist/checks-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { kitPrice, KIT_VALUE_TOLERANCE } from "../dist/equipment-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const ID = "d".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const CHOICES = {
  ...CLERIC.defaults,
  placement: defaultPlacement(DICE, CLERIC),
};
const cleric = (choices = {}) =>
  buildCharacter(ID, "Mira", DICE, { ...CHOICES, ...choices }, "cleric");
const THAUMATURGE = {
  divineOrder: "thaumaturge",
  spells: {
    cantrips: ["sacred-flame", "guidance", "resistance", "thaumaturgy"],
    prepared: CLERIC.defaults.spells.prepared,
  },
};

const saves = (profile) =>
  Object.fromEntries(
    Object.entries(profile.savingThrows).map(([ability, save]) => [
      ability,
      [save.bonus, save.proficient],
    ]),
  );

for (const [order, choices] of [
  ["protector", {}],
  ["thaumaturge", THAUMATURGE],
]) {
  test(`a level-1 ${order} Cleric's numbers, with each kit`, () => {
    const mira = cleric(choices);
    // Wisdom, Constitution, Strength, Dexterity, Charisma, Intelligence from
    // the highest roll; +2 Wisdom and +1 Constitution.
    assert.deepEqual(mira.abilities, {
      strength: 13,
      dexterity: 12,
      constitution: 15,
      intelligence: 8,
      wisdom: 17,
      charisma: 10,
    });
    assert.equal(mira.class, "cleric");
    assert.equal(mira.divineOrder, order);
    const profile = characterProfile(mira);
    // d8 + Constitution 2.
    assert.equal(profile.maxHp, 10);
    assert.equal(mira.hp, 10);
    assert.equal(profile.proficiencyBonus, 2);
    assert.deepEqual(saves(profile), {
      strength: [1, false],
      dexterity: [1, false],
      constitution: [2, false],
      intelligence: [-1, false],
      wisdom: [5, true],
      charisma: [2, true],
    });
    // Wisdom 17: attack +3 +2, DC 8 +3 +2; two 1st-level slots.
    assert.equal(profile.spellcasting.attackBonus, 5);
    assert.equal(profile.spellcasting.saveDc, 13);
    assert.deepEqual(profile.spellcasting.slots, [2]);
    assert.deepEqual(profile.featureUses, {
      "spell-slots-1": { max: 2, recovery: { shortRest: 0, longRest: "all" } },
    });
    assert.equal(
      profile.spellcasting.cantrips.length,
      order === "thaumaturge" ? 4 : 3,
    );
    assert.equal(profile.spellcasting.prepared.length, 4);
    // Leather 11 + Dexterity 1 with the mace; and +2 with the shield.
    assert.equal(profile.armorClass, 12);
    assert.equal(profile.attack.weapon, "Mace");
    assert.equal(profile.attack.bonus, 3);
    assert.deepEqual(mira.stowed, ["dagger", "dagger"]);
    const shielded = characterProfile(
      cleric({ ...choices, kit: "club-and-shield" }),
    );
    assert.equal(shielded.armorClass, 14);
    assert.equal(shielded.untrainedShield, undefined);
    assert.equal(shielded.attack.weapon, "Club");
    assert.equal(
      profile.features.find(({ id }) => id === "divine-order").name,
      `Divine Order: ${order === "protector" ? "Protector" : "Thaumaturge"}`,
    );
  });
}

test("creation offers the Fighter, the Rogue, the Cleric and the Wizard", () => {
  assert.deepEqual(OFFERED_CLASS_IDS, ["fighter", "rogue", "cleric", "wizard"]);
});

test("the Cleric's kits are of equal value", () => {
  assert.equal(kitPrice("mace-and-daggers"), 1900);
  assert.equal(kitPrice("club-and-shield"), 2010);
  assert.ok(
    Math.abs(kitPrice("mace-and-daggers") - kitPrice("club-and-shield")) <=
      KIT_VALUE_TOLERANCE,
  );
});

test("a Protector is trained with heavy armour and martial weapons; a Thaumaturge is not", () => {
  const armoured = (choices) =>
    validateCharacter({
      ...cleric(choices),
      equipment: ["chain-mail", "longsword"],
    });
  const protector = armoured({});
  assert.equal(characterProfile(protector).untrainedArmour, undefined);
  assert.deepEqual(abilityDisadvantages(protector, "dexterity"), []);
  // Longsword: Strength 1 + proficiency 2.
  assert.equal(characterProfile(protector).attack.bonus, 3);
  const thaumaturge = armoured(THAUMATURGE);
  assert.equal(characterProfile(thaumaturge).untrainedArmour, "Chain mail");
  assert.equal(characterProfile(thaumaturge).attack.bonus, 1);
});

test("a Thaumaturge adds its Wisdom modifier to Arcana and Religion checks", () => {
  const thaumaturge = cleric(THAUMATURGE);
  const skill = (sheet, id) =>
    characterProfile(sheet).skills.find((entry) => entry.id === id);
  // Intelligence −1, + Wisdom 3; Religion unproficient here.
  assert.equal(skill(thaumaturge, "arcana").bonus, 2);
  assert.equal(skill(thaumaturge, "religion").bonus, 2);
  assert.equal(skill(thaumaturge, "history").bonus, -1);
  assert.equal(skill(cleric(), "arcana").bonus, -1);
  const roll = abilityCheck(
    thaumaturge,
    { skill: "religion", dc: 12 },
    dice([20, 10]),
  );
  assert.deepEqual(roll.bonus, { source: "Thaumaturge", value: 3 });
  assert.equal(roll.total, 12);
  assert.equal(roll.success, true);
  // At least +1, with a Wisdom modifier below it.
  const dim = validateCharacter({
    ...thaumaturge,
    abilityRolls: { ...thaumaturge.abilityRolls, wisdom: [1, 1, 2, 2] },
    abilities: { ...thaumaturge.abilities, wisdom: 7 },
  });
  assert.equal(skill(dim, "arcana").bonus, 0);
});

test("creation refuses a Cleric's spells or order its class doesn't allow", () => {
  assert.throws(
    () => cleric({ divineOrder: undefined }),
    /Choose a Divine Order\./u,
  );
  assert.throws(
    () => cleric({ divineOrder: "warden" }),
    /Choose a Divine Order\./u,
  );
  // A Thaumaturge knows four cantrips; a Protector three.
  assert.throws(
    () => cleric({ divineOrder: "thaumaturge" }),
    /A level 1 Cleric knows cantrips: 4 different spells from its list\./u,
  );
  assert.throws(
    () => cleric({ spells: THAUMATURGE.spells }),
    /knows cantrips: 3 different/u,
  );
  // Fire Bolt isn't on the Cleric's list.
  assert.throws(
    () =>
      cleric({
        spells: {
          cantrips: ["sacred-flame", "guidance", "fire-bolt"],
          prepared: CLERIC.defaults.spells.prepared,
        },
      }),
    /knows cantrips/u,
  );
  assert.throws(
    () =>
      buildCharacter(
        ID,
        "Ada",
        DICE,
        {
          ...CLASSES.fighter.defaults,
          placement: CHOICES.placement,
          divineOrder: "protector",
        },
        "fighter",
      ),
    /A Fighter has no Divine Order\./u,
  );
});

test("the creation preview counts cantrips and prepared spells as they are ticked", () => {
  const partial = projectCreation(
    DICE,
    {
      ...CHOICES,
      divineOrder: "thaumaturge",
      spells: { cantrips: ["guidance"], prepared: ["bless", "cure-wounds"] },
    },
    "cleric",
  );
  assert.deepEqual(partial.spells, {
    cantrips: { chosen: 1, limit: 4, full: false },
    prepared: { chosen: 2, limit: 4, full: false },
  });
  assert.equal(
    partial.unfinished.spells,
    "Choose 4 cantrips and 4 spells to prepare; 1 and 2 chosen.",
  );
  assert.equal(partial.sheet, undefined);
  const done = projectCreation(DICE, CHOICES, "cleric");
  assert.deepEqual(done.unfinished, {});
  assert.equal(done.sheet.profile.spellcasting.saveDc, 13);
});

test("prepared spells change between adventures, from the class's list", () => {
  const mira = cleric();
  const changed = prepareSpells(mira, [
    "inflict-wounds",
    "shield-of-faith",
    "cure-wounds",
    "healing-word",
  ]);
  assert.deepEqual(changed.spells, {
    cantrips: mira.spells.cantrips,
    prepared: [
      "inflict-wounds",
      "shield-of-faith",
      "cure-wounds",
      "healing-word",
    ],
  });
  assert.throws(
    () => prepareSpells(mira, ["bless", "cure-wounds", "guiding-bolt"]),
    /Choose 4 spells to prepare; 3 chosen./u,
  );
  assert.throws(
    () =>
      prepareSpells(mira, [
        "bless",
        "cure-wounds",
        "guiding-bolt",
        "sacred-flame",
      ]),
    /prepares levelled spells/u,
  );
});

test("the library prepares spells between adventures and refuses during one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-339-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      3,
    );
    const started = await library.startCreation();
    const created = await library.create(
      "Mira",
      {
        ...CLERIC.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, CLERIC),
      },
      started.revision,
      "cleric",
    );
    const { id } = created.characters[0].sheet;
    const prepared = ["inflict-wounds", "bless", "cure-wounds", "healing-word"];
    const changed = await library.prepareSpells(id, prepared, created.revision);
    assert.deepEqual(changed.characters[0].sheet.spells.prepared, prepared);
    assert.equal(changed.formatVersion, FIFTH_LIBRARY_FORMAT);
    await library.attachSession(
      id,
      { id: "e".repeat(32), adventureId: "graded-cellar" },
      1,
      changed.revision,
    );
    const during = await library.read();
    await assert.rejects(
      library.prepareSpells(
        id,
        CLERIC.defaults.spells.prepared,
        during.revision,
      ),
      /Mira is on an adventure: prepared spells change only between adventures\./u,
    );
    assert.deepEqual(
      (await library.read()).characters[0].sheet.spells.prepared,
      prepared,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a format-16 library is refused, naming the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-339-"));
  try {
    const path = join(directory, "characters.json");
    await writeFile(
      path,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: 16,
        revision: "0",
        creationsStarted: 0,
        sessionsStarted: 0,
        characters: [],
      }),
    );
    assert.equal(FIFTH_LIBRARY_FORMAT, 21);
    await assert.rejects(
      new FifthCharacterLibrary(path, 1).read(),
      (error) =>
        error.message.includes(path) &&
        /format version 16, not 21/u.test(error.message),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
