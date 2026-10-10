// #336: a class-agnostic casting engine, exercised by the test-only caster
// (Sage). Spells are data (SRD 5.2); spell slots come from class data, are
// spent per cast and come back on a long rest; cantrips grow at level 5; a
// spell attack adds proficiency + the spellcasting modifier, and a save DC is
// 8 + both. Engine tests for the effect kinds and refusals are in
// issue-336-engine.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCharacter,
  characterProfile,
  CLASSES,
  OFFERED_CLASS_IDS,
  validateCharacter,
} from "../dist/character-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import {
  effectAtSlot,
  slotLevelOf,
  slotUsesId,
  SPELLS,
  spellAtLevel,
} from "../dist/spells-5e.js";
import {
  TEST_CASTER,
  testCasterAt,
  testCasterChoices,
} from "../dist/test-caster-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";

test("Sage's spell attack bonus, save DC and slots come from class data", () => {
  const profile = characterProfile(TEST_CASTER);
  assert.equal(TEST_CASTER.class, "test-caster");
  assert.equal(TEST_CASTER.abilities.wisdom, 17);
  assert.deepEqual(profile.spellcasting, {
    ability: "wisdom",
    modifier: 3,
    attackBonus: 5,
    saveDc: 13,
    cantrips: ["fire-bolt", "sacred-flame"],
    prepared: ["magic-missile", "cure-wounds", "healing-word"],
    slots: [2],
  });
  // Slots are feature uses, so rests restore them: none on a short rest.
  assert.deepEqual(profile.featureUses, {
    "spell-slots-1": { max: 2, recovery: { shortRest: 0, longRest: "all" } },
  });
  const five = characterProfile(testCasterAt(5));
  assert.equal(five.spellcasting.attackBonus, 6);
  assert.equal(five.spellcasting.saveDc, 14);
  assert.deepEqual(five.spellcasting.slots, [4, 3, 2]);
  assert.deepEqual(Object.keys(five.featureUses), [
    "spell-slots-1",
    "spell-slots-2",
    "spell-slots-3",
  ]);
  // A class that casts nothing has no spellcasting and no spells.
  assert.equal(characterProfile(TEST_FIGHTER).spellcasting, undefined);
  assert.equal(TEST_FIGHTER.spells, undefined);
});

test("creation never offers the test-only caster", () => {
  assert.equal(CLASSES["test-caster"].testOnly, true);
  assert.deepEqual(OFFERED_CLASS_IDS, ["fighter", "rogue", "cleric"]);
});

test("cantrips grow at level 5 and levelled spells grow with the slot", () => {
  assert.deepEqual(spellAtLevel(SPELLS["fire-bolt"], 4).effect.damage, {
    dice: 1,
    sides: 10,
    type: "fire",
  });
  assert.deepEqual(spellAtLevel(SPELLS["fire-bolt"], 5).effect.damage, {
    dice: 2,
    sides: 10,
    type: "fire",
  });
  assert.equal(effectAtSlot(SPELLS["magic-missile"], 1).missiles, 3);
  assert.equal(effectAtSlot(SPELLS["magic-missile"], 3).missiles, 5);
  assert.equal(effectAtSlot(SPELLS["inflict-wounds"], 2).damage.dice, 3);
  assert.equal(effectAtSlot(SPELLS["cure-wounds"], 3).healing.dice, 6);
  assert.equal(effectAtSlot(SPELLS["healing-word"], 2).healing.dice, 4);
  assert.equal(effectAtSlot(SPELLS["fire-bolt"], undefined).damage.dice, 1);
});

test("a caster knows and prepares exactly its class's counts from its list", () => {
  const build = (spells, choices = testCasterChoices(spells)) =>
    buildCharacter(
      "d".repeat(32),
      "Wren",
      [
        [5, 5, 5, 1],
        [5, 5, 4, 1],
        [5, 4, 4, 1],
        [4, 4, 4, 1],
        [3, 3, 4, 1],
        [3, 3, 3, 1],
      ],
      choices,
      "test-caster",
    );
  assert.deepEqual(
    build({
      cantrips: ["shocking-grasp", "fire-bolt"],
      prepared: ["inflict-wounds", "magic-missile", "cure-wounds"],
    }).spells.cantrips,
    ["shocking-grasp", "fire-bolt"],
  );
  for (const spells of [
    // One cantrip too few, a levelled spell as a cantrip, a repeat.
    { cantrips: ["fire-bolt"], prepared: TEST_CASTER.spells.prepared },
    {
      cantrips: ["fire-bolt", "magic-missile"],
      prepared: TEST_CASTER.spells.prepared,
    },
    {
      cantrips: TEST_CASTER.spells.cantrips,
      prepared: ["cure-wounds", "cure-wounds", "magic-missile"],
    },
    // A cantrip prepared, or a spell no one knows.
    {
      cantrips: TEST_CASTER.spells.cantrips,
      prepared: ["fire-bolt", "cure-wounds", "magic-missile"],
    },
    {
      cantrips: TEST_CASTER.spells.cantrips,
      prepared: ["wish", "cure-wounds", "magic-missile"],
    },
  ]) {
    assert.throws(() => build(spells), /different spells from its list/u);
  }
  const without = { ...testCasterChoices(), spells: undefined };
  assert.throws(() => build(undefined, without), /Invalid spell choices/u);
  // A class that casts nothing has no spells.
  assert.throws(
    () => validateCharacter({ ...TEST_FIGHTER, spells: TEST_CASTER.spells }),
    /A Fighter casts no spells\./u,
  );
});

test("a slot level's feature-uses id reads back to its level", () => {
  assert.equal(slotUsesId(2), "spell-slots-2");
  assert.equal(slotLevelOf(slotUsesId(2)), 2);
  assert.equal(slotLevelOf("second-wind"), undefined);
});

test("a library saved before sheets had spells (#336) is refused, naming the file", async () => {
  assert.equal(FIFTH_LIBRARY_FORMAT, 17);
  const directory = await mkdtemp(join(tmpdir(), "issue-336-"));
  try {
    const path = join(directory, "characters.json");
    const older = JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: 15,
      revision: "0".repeat(32),
      creationsStarted: 0,
      sessionsStarted: 0,
      characters: [],
    });
    await writeFile(path, older);
    await assert.rejects(new FifthCharacterLibrary(path, 7).read(), {
      message: `${path} is a character library in format version 15, not 17. This build creates 5e characters and cannot read it. Move it aside, or choose another --characters path; the file has not been changed.`,
    });
    assert.equal(await readFile(path, "utf8"), older);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
