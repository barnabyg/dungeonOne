// #340: a level-1 Wizard. Creation makes a Wizard from its class data, with
// its cantrips, the six spells of its spellbook and four prepared from it;
// its numbers by table, with and without Mage Armor; a Wizard stays at level
// 1 for now; and prepared spells change in the library between adventures,
// only from its spellbook. Engine tests are in issue-340-engine.test.mjs.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
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
import { SKILLS } from "../dist/class-5e.js";
import {
  kitPrice,
  KIT_VALUE_TOLERANCE,
  MASTERY_WEAPONS,
  WEAPONS,
} from "../dist/equipment-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";

const ID = "e".repeat(32);
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
  ...WIZARD.defaults,
  placement: defaultPlacement(DICE, WIZARD),
};
const wizard = (choices = {}) =>
  buildCharacter(ID, "Vela", DICE, { ...CHOICES, ...choices }, "wizard");

const saves = (profile) =>
  Object.fromEntries(
    Object.entries(profile.savingThrows).map(([ability, save]) => [
      ability,
      [save.bonus, save.proficient],
    ]),
  );

test("a level-1 Wizard's numbers, with each kit", () => {
  const vela = wizard();
  // Intelligence, Dexterity, Constitution, Wisdom, Charisma, Strength from
  // the highest roll; +2 Intelligence and +1 Constitution.
  assert.deepEqual(vela.abilities, {
    strength: 8,
    dexterity: 14,
    constitution: 14,
    intelligence: 17,
    wisdom: 12,
    charisma: 10,
  });
  assert.equal(vela.class, "wizard");
  const profile = characterProfile(vela);
  // d6 + Constitution 2.
  assert.equal(profile.maxHp, 8);
  assert.equal(vela.hp, 8);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(saves(profile), {
    strength: [-1, false],
    dexterity: [2, false],
    constitution: [2, false],
    intelligence: [5, true],
    wisdom: [3, true],
    charisma: [0, false],
  });
  // Intelligence 17: attack +3 +2, DC 8 +3 +2; two 1st-level slots.
  assert.equal(profile.spellcasting.ability, "intelligence");
  assert.equal(profile.spellcasting.attackBonus, 5);
  assert.equal(profile.spellcasting.saveDc, 13);
  assert.deepEqual(profile.spellcasting.slots, [2]);
  assert.deepEqual(profile.featureUses, {
    "arcane-recovery": { max: 1, recovery: { shortRest: 0, longRest: "all" } },
    "spell-slots-1": { max: 2, recovery: { shortRest: 0, longRest: "all" } },
  });
  assert.equal(profile.spellcasting.cantrips.length, 3);
  assert.equal(profile.spellcasting.prepared.length, 4);
  assert.deepEqual(profile.spellcasting.spellbook, WIZARD.defaults.spellbook);
  // No armour: 10 + Dexterity 2. The quarterstaff in two hands: Strength
  // −1 + proficiency 2, 1d8 − 1; the dagger stowed.
  assert.equal(profile.armorClass, 12);
  assert.equal(profile.attack.weapon, "Quarterstaff");
  assert.equal(profile.attack.bonus, 1);
  assert.deepEqual(profile.attack.damage, {
    dice: 1,
    sides: 8,
    modifier: -1,
    type: "bludgeoning",
  });
  assert.deepEqual(vela.stowed, ["dagger"]);
  // Two daggers: Finesse, Dexterity 2 + 2.
  const daggers = characterProfile(wizard({ kit: "daggers" }));
  assert.equal(daggers.armorClass, 12);
  assert.equal(daggers.attack.weapon, "Dagger");
  assert.equal(daggers.attack.bonus, 4);
  assert.equal(daggers.lightAttack.weapon, "Dagger");
  assert.deepEqual(
    profile.features.map(({ name }) => name),
    ["Spellcasting", "Ritual Adept", "Arcane Recovery"],
  );
  assert.match(profile.features[1].text, /^Omitted/u);
});

test("Mage Armor makes the Wizard's AC 13 + Dexterity", () => {
  const runtime = createFifthRuntime(ratTunnels, wizard());
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(),
  ).state;
  assert.equal(runtime.projectRoom(begun).gear.armorClass, 12);
  const armoured = runtime.handleAction(
    begun,
    {
      type: "cast",
      actorId: "pc",
      spellId: "mage-armor",
      slotLevel: 1,
      targetIds: ["pc"],
    },
    dice(),
  );
  assert.equal(armoured.rejection, undefined, armoured.rejection?.reason);
  assert.equal(runtime.projectRoom(armoured.state).gear.armorClass, 15);
});

test("creation offers the Fighter, the Rogue, the Cleric and the Wizard", () => {
  assert.deepEqual(OFFERED_CLASS_IDS, ["fighter", "rogue", "cleric", "wizard"]);
  assert.equal(SKILLS.nature.ability, "intelligence");
  assert.equal(CLASSES.wizard.maxLevel, 1);
  assert.deepEqual(CLASSES.wizard.armourTraining, []);
});

test("the Wizard's kits carry no armour and are of equal value; the quarterstaff is SRD 5.2's", () => {
  assert.deepEqual(WIZARD.kits, ["quarterstaff-and-dagger", "daggers"]);
  assert.equal(kitPrice("quarterstaff-and-dagger"), 220);
  assert.equal(kitPrice("daggers"), 400);
  assert.ok(
    Math.abs(kitPrice("quarterstaff-and-dagger") - kitPrice("daggers")) <=
      KIT_VALUE_TOLERANCE,
  );
  assert.deepEqual(WEAPONS.quarterstaff, {
    name: "Quarterstaff",
    category: "simple",
    price: 20,
    weight: 4,
    damage: { dice: 1, sides: 6 },
    versatile: { dice: 1, sides: 8 },
    damageType: "bludgeoning",
    properties: ["versatile"],
    mastery: "Topple",
    tier: "common",
  });
  // Topple isn't used yet: no class masters the quarterstaff.
  assert.equal(MASTERY_WEAPONS.includes("quarterstaff"), false);
});

test("creation refuses a spellbook or prepared spells the Wizard doesn't allow", () => {
  const book = WIZARD.defaults.spellbook;
  // Six different 1st-level spells from its list.
  assert.throws(
    () => wizard({ spellbook: book.slice(0, 5) }),
    /A level 1 Wizard's spellbook holds 6 different levelled spells from its list that it has slots for\./u,
  );
  assert.throws(
    () => wizard({ spellbook: [...book.slice(0, 5), "fire-bolt"] }),
    /spellbook holds 6/u,
  );
  assert.throws(
    () => wizard({ spellbook: [...book.slice(0, 5), "cure-wounds"] }),
    /spellbook holds 6/u,
  );
  assert.throws(() => wizard({ spellbook: undefined }), /spellbook holds 6/u);
  // Thunderwave isn't in the default spellbook, so it can't be prepared.
  assert.throws(
    () =>
      wizard({
        spells: {
          cantrips: WIZARD.defaults.spells.cantrips,
          prepared: ["mage-armor", "magic-missile", "shield", "thunderwave"],
        },
      }),
    /A Wizard prepares only spells in its spellbook\./u,
  );
  // Another class has none.
  assert.throws(
    () =>
      buildCharacter(
        ID,
        "Ada",
        DICE,
        {
          ...CLASSES.fighter.defaults,
          placement: CHOICES.placement,
          spellbook: book,
        },
        "fighter",
      ),
    /A Fighter has no spellbook\./u,
  );
});

test("the creation preview counts the spellbook as it is ticked", () => {
  const partial = projectCreation(
    DICE,
    {
      ...CHOICES,
      spellbook: ["sleep", "mage-armor"],
      spells: { cantrips: ["fire-bolt"], prepared: ["sleep"] },
    },
    "wizard",
  );
  assert.deepEqual(partial.spells, {
    cantrips: { chosen: 1, limit: 3, full: false },
    prepared: { chosen: 1, limit: 4, full: false },
    spellbook: { chosen: 2, limit: 6, full: false },
  });
  assert.equal(
    partial.unfinished.spells,
    "Choose 3 cantrips, 6 spells for your spellbook and 4 of them to prepare; 1, 2 and 1 chosen.",
  );
  assert.equal(partial.sheet, undefined);
  const done = projectCreation(DICE, CHOICES, "wizard");
  assert.deepEqual(done.unfinished, {});
  assert.equal(done.sheet.profile.spellcasting.saveDc, 13);
});

test("prepared spells change only to spells in the spellbook", () => {
  const vela = wizard();
  const changed = prepareSpells(vela, [
    "burning-hands",
    "chromatic-orb",
    "sleep",
    "shield",
  ]);
  assert.deepEqual(changed.spells.prepared, [
    "burning-hands",
    "chromatic-orb",
    "sleep",
    "shield",
  ]);
  assert.deepEqual(changed.spellbook, vela.spellbook);
  assert.throws(
    () => prepareSpells(vela, ["thunderwave", "sleep", "shield", "mage-armor"]),
    /A Wizard prepares only spells in its spellbook\./u,
  );
  // The spellbook itself is checked on every sheet.
  assert.throws(
    () => validateCharacter({ ...vela, spellbook: undefined }),
    /spellbook holds 6/u,
  );
});

test("the library prepares a Wizard's spells from its spellbook, between adventures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-340-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      3,
    );
    const started = await library.startCreation();
    const created = await library.create(
      "Vela",
      {
        ...WIZARD.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, WIZARD),
      },
      started.revision,
      "wizard",
    );
    const { id, spellbook } = created.characters[0].sheet;
    assert.deepEqual(spellbook, WIZARD.defaults.spellbook);
    const prepared = ["burning-hands", "chromatic-orb", "sleep", "shield"];
    const changed = await library.prepareSpells(id, prepared, created.revision);
    assert.deepEqual(changed.characters[0].sheet.spells.prepared, prepared);
    await assert.rejects(
      library.prepareSpells(
        id,
        ["thunderwave", "sleep", "shield", "mage-armor"],
        changed.revision,
      ),
      /A Wizard prepares only spells in its spellbook\./u,
    );
    assert.deepEqual(
      (await library.read()).characters[0].sheet.spells.prepared,
      prepared,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a format-17 library is refused, naming the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-340-"));
  try {
    const path = join(directory, "characters.json");
    await writeFile(
      path,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: 17,
        revision: "0",
        creationsStarted: 0,
        sessionsStarted: 0,
        characters: [],
      }),
    );
    assert.equal(FIFTH_LIBRARY_FORMAT, 18);
    await assert.rejects(
      new FifthCharacterLibrary(path, 1).read(),
      (error) =>
        error.message.includes(path) &&
        /format version 17, not 18/u.test(error.message),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
