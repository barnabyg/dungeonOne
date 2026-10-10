// #343: a Wizard at levels 2 and 3. Level 2 brings Scholar (Expertise in
// one of six skills) and three 1st-level slots; level 3 the Evoker
// (Evocation Savant, flavour only, and Potent Cantrip) and 2nd-level slots.
// Each level after 1st writes two spells into the spellbook. A new level's
// choices are made on the sheet before the next adventure. Engine tests are
// in issue-343-engine.test.mjs.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  addToSpellbook,
  buildCharacter,
  characterProfile,
  chooseExpertise,
  defaultPlacement,
  expertiseOptions,
  expertiseOwed,
  levelUpChanges,
  settleCharacter,
  spellbookOptions,
  spellbookOwed,
  validateCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import { playerCombatant, startingResources } from "../dist/runtime-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";

const ID = "e".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order: Intelligence 17,
// Dexterity 14, Constitution 14.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const vela = () =>
  buildCharacter(
    ID,
    "Vela",
    DICE,
    { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
    "wizard",
  );

/** `sheet` after an adventure that earned `xp`, keeping what it holds. */
const earn = (sheet, xp, id = "cellar") =>
  settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: sheet.stowed,
      ammunition: sheet.ammunition,
      treasure: [],
      purse: 0,
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });

const level2 = () => earn(vela(), 300);
const level3 = () =>
  withOwedChoices(earn(withOwedChoices(level2()), 600, "barrow"));
const names = (profile) => profile.features.map(({ name }) => name);
const skill = (profile, id) => profile.skills.find((entry) => entry.id === id);

async function withLibrary(sheet, run, record = {}) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-343-"));
  try {
    const path = join(directory, "characters.json");
    await writeFile(
      path,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "a".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet, revision: 1, ...record }],
      }),
    );
    await run(new FifthCharacterLibrary(path, 3));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a Wizard now reaches level 3", () => {
  assert.equal(WIZARD.maxLevel, 3);
  assert.equal(earn(vela(), 2700).level, 3);
});

test("a level-2 Wizard's numbers: Scholar and three 1st-level slots", () => {
  const sheet = level2();
  assert.equal(sheet.level, 2);
  const profile = characterProfile(sheet);
  // 6 + 2 at level 1, then 4 + 2.
  assert.equal(profile.maxHp, 14);
  assert.equal(sheet.hp, 14);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.spellcasting.slots, [3]);
  assert.equal(profile.spellcasting.attackBonus, 5);
  assert.equal(profile.spellcasting.saveDc, 13);
  // Arcane Recovery: half of level 2, so one slot level.
  assert.deepEqual(profile.arcaneRecovery, { slotLevels: 1 });
  assert.deepEqual(names(profile), [
    "Spellcasting",
    "Ritual Adept",
    "Arcane Recovery",
    "Scholar",
  ]);
  assert.match(profile.features[3].text, /^Not chosen yet:/u);
  assert.equal(profile.spellcasting.potentCantrip, undefined);
  assert.equal(profile.nextLevelXp, 900);
  // Five prepared, six in the book: one to prepare, two to write, and
  // Scholar's Expertise to choose.
  assert.equal(spellbookOwed(sheet), 2);
  assert.equal(expertiseOwed(sheet), 1);
});

test("Scholar: Expertise in one proficient skill of the six, chosen on the sheet", () => {
  const sheet = level2();
  // Proficient in Arcana and Investigation, both on Scholar's list.
  assert.deepEqual(expertiseOptions(sheet), ["arcana", "investigation"]);
  assert.throws(
    () => chooseExpertise(sheet, ["insight"]),
    /Scholar's Expertise is one of the skills you're proficient in among Arcana, History, Investigation, Medicine, Nature and Religion: Arcana, Investigation\./u,
  );
  assert.throws(
    () => chooseExpertise(sheet, ["arcana", "investigation"]),
    /Choose 1 skill for Expertise; 2 chosen\./u,
  );
  const scholar = chooseExpertise(sheet, ["arcana"]);
  assert.deepEqual(scholar.expertise, ["arcana"]);
  assert.equal(expertiseOwed(scholar), 0);
  const profile = characterProfile(scholar);
  // Intelligence 3 + twice the proficiency bonus.
  assert.equal(skill(profile, "arcana").bonus, 7);
  assert.equal(skill(profile, "arcana").expertise, true);
  assert.equal(skill(profile, "investigation").bonus, 5);
  assert.match(profile.features[3].text, /^Expertise in Arcana:/u);
  assert.throws(
    () => chooseExpertise(scholar, ["investigation"]),
    /no Expertise to choose/u,
  );
  // A sheet can't hold Expertise in a skill outside Scholar's six.
  assert.throws(
    () =>
      validateCharacter({
        ...sheet,
        skills: ["arcana", "insight"],
        expertise: ["insight"],
      }),
    /Scholar's Expertise/u,
  );
});

test("each level after 1st writes two spells into the spellbook, of a level with slots", () => {
  const sheet = level2();
  // Only 1st-level slots: the 1st-level spells not yet in the book.
  assert.deepEqual(spellbookOptions(sheet), [
    "thunderwave",
    "ray-of-sickness",
    "ice-knife",
  ]);
  assert.throws(
    () => addToSpellbook(sheet, ["thunderwave"]),
    /Choose 2 spells for your spellbook; 1 chosen\./u,
  );
  assert.throws(
    () => addToSpellbook(sheet, ["thunderwave", "scorching-ray"]),
    /Vela writes into the spellbook only Wizard spells it lacks of a level it has slots for: Thunderwave, Ray of Sickness, Ice Knife\./u,
  );
  const written = addToSpellbook(sheet, ["ray-of-sickness", "ice-knife"]);
  assert.equal(written.spellbook.length, 8);
  assert.equal(spellbookOwed(written), 0);
  assert.throws(
    () => addToSpellbook(written, ["thunderwave"]),
    /no spells to write into the spellbook/u,
  );
  // The harness's choice: the highest level first, in the list's order.
  const chosen = withOwedChoices(sheet);
  assert.deepEqual(chosen.spellbook.slice(6), [
    "thunderwave",
    "ray-of-sickness",
  ]);
  assert.deepEqual(chosen.expertise, ["arcana"]);
  assert.equal(chosen.spells.prepared.length, 5);
});

test("a level-3 Wizard's numbers: the Evoker and 2nd-level slots", () => {
  const sheet = level3();
  assert.equal(sheet.level, 3);
  const profile = characterProfile(sheet);
  assert.equal(profile.maxHp, 20);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.spellcasting.slots, [4, 2]);
  assert.deepEqual(profile.featureUses["spell-slots-2"], {
    max: 2,
    recovery: { shortRest: 0, longRest: "all" },
  });
  assert.deepEqual(profile.arcaneRecovery, { slotLevels: 2 });
  assert.deepEqual(names(profile), [
    "Spellcasting",
    "Ritual Adept",
    "Arcane Recovery",
    "Scholar",
    "Evoker: Evocation Savant",
    "Evoker: Potent Cantrip",
  ]);
  assert.match(profile.features[4].text, /flavour only/iu);
  assert.equal(profile.spellcasting.potentCantrip, true);
  // Ten spells in the book, the two new ones 2nd-level; six prepared.
  assert.equal(sheet.spellbook.length, 10);
  assert.deepEqual(sheet.spellbook.slice(8), ["scorching-ray", "shatter"]);
  assert.equal(sheet.spells.prepared.length, 6);
  // The Wizard's top level for now.
  assert.equal(profile.nextLevelXp, undefined);
  // Potent Cantrip reaches the fight.
  const pc = playerCombatant(sheet, startingResources(sheet));
  assert.equal(pc.spellcasting.potentCantrip, true);
  assert.deepEqual(
    pc.spellcasting.slots.map(({ max }) => max),
    [4, 2],
  );
});

test("the level-up card says what the new level brings and asks for", () => {
  const before = withOwedChoices(level2());
  const after = earn(before, 600, "barrow");
  const changes = levelUpChanges(before, after);
  assert.deepEqual([changes.from, changes.to], [2, 3]);
  assert.deepEqual(changes.maxHp, { before: 14, after: 20 });
  assert.deepEqual(changes.spells.slots, { before: [3], after: [4, 2] });
  assert.deepEqual(changes.spells.prepared, { before: 5, after: 6 });
  assert.equal(changes.spells.spellbookOwed, 2);
  // Every 2nd-level spell, and the 1st-level one not yet written.
  assert.deepEqual(changes.spells.spellbookOptions, [
    "scorching-ray",
    "shatter",
    "hold-person",
    "acid-arrow",
    "mind-spike",
    "blur",
    "mirror-image",
    "ice-knife",
  ]);
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Evoker: Evocation Savant", "Evoker: Potent Cantrip"],
  );
  // Level 2's card asks for Scholar's Expertise.
  const second = levelUpChanges(vela(), level2());
  assert.deepEqual(second.expertise, {
    owed: 1,
    options: ["arcana", "investigation"],
  });
  assert.equal(second.spells.spellbookOwed, 2);
});

test("the library won't start an adventure until the new level's choices are made", async () => {
  const sheet = level2();
  await withLibrary(sheet, async (library) => {
    const session = { id: "f".repeat(32), adventureId: "graded-cellar" };
    let data = await library.read();
    await assert.rejects(
      library.attachSession(sheet.id, session, 1, data.revision),
      /Vela has 2 more spells to write into the spellbook and 1 more spell to prepare on the character sheet before starting another adventure\./u,
    );
    data = await library.addToSpellbook(
      sheet.id,
      ["thunderwave", "ice-knife"],
      data.revision,
    );
    data = await library.prepareSpells(
      sheet.id,
      [...sheet.spells.prepared, "thunderwave"],
      data.revision,
    );
    await assert.rejects(
      library.attachSession(sheet.id, session, 1, data.revision),
      /Vela must choose Scholar's Expertise on the character sheet before starting another adventure\./u,
    );
    data = await library.chooseExpertise(
      sheet.id,
      ["investigation"],
      data.revision,
    );
    assert.deepEqual(data.characters[0].sheet.expertise, ["investigation"]);
    await library.attachSession(sheet.id, session, 1, data.revision);
  });
});

test("a Wizard two levels up writes each level's spells of a level that level had slots for", () => {
  // From level 1 to 3 at once: four spells owed, at most two of them 2nd-level.
  const sheet = earn(vela(), 900);
  assert.equal(spellbookOwed(sheet), 4);
  assert.throws(
    () =>
      addToSpellbook(sheet, [
        "scorching-ray",
        "shatter",
        "blur",
        "thunderwave",
      ]),
    /Vela's level 2 spells are of a level its slots at level 2 allow: at most 2 of these may be 2nd-level\./u,
  );
  const written = addToSpellbook(sheet, [
    "scorching-ray",
    "thunderwave",
    "blur",
    "ice-knife",
  ]);
  assert.equal(written.spellbook.length, 10);
});

test("the library refuses spellbook spells and Expertise on an adventure, when defeated or when none is owed", async () => {
  const sheet = level2();
  const session = { id: "f".repeat(32), adventureId: "graded-cellar" };
  await withLibrary(withOwedChoices(sheet), async (library) => {
    const data = await library.read();
    await assert.rejects(
      library.addToSpellbook(sheet.id, ["thunderwave"], data.revision),
      /Vela has no spells to write into the spellbook\./u,
    );
    await assert.rejects(
      library.chooseExpertise(sheet.id, ["arcana"], data.revision),
      /Vela has no Expertise to choose\./u,
    );
  });
  for (const [record, refusal] of [
    [{ defeated: true }, /Vela was defeated\./u],
    [
      { session },
      /Vela is on an adventure: spells are written into the spellbook only between adventures\./u,
    ],
  ]) {
    await withLibrary(
      sheet,
      async (library) => {
        const data = await library.read();
        await assert.rejects(
          library.addToSpellbook(
            sheet.id,
            ["thunderwave", "ice-knife"],
            data.revision,
          ),
          refusal,
        );
      },
      record,
    );
  }
});
