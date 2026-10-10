// #341: a Cleric at levels 2 and 3. Level 2 brings Channel Divinity (two
// uses, one back on a short rest) and three 1st-level slots; level 3 the
// Life Domain (Disciple of Life, Preserve Life and its always-prepared
// spells) and 2nd-level slots and spells. A new level's spells are chosen
// on the sheet before the next adventure; a Cleric stays at level 3 for
// now, keeping its XP. Engine tests are in issue-341-engine.test.mjs.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCharacter,
  characterProfile,
  defaultPlacement,
  levelUpChanges,
  preparableSpells,
  prepareSpells,
  settleCharacter,
  spellsOwed,
  validateCharacter,
  withOwedSpells,
} from "../dist/character-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { playerCombatant, startingResources } from "../dist/runtime-5e.js";

const ID = "d".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order: Wisdom 17,
// Constitution 15.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const mira = () =>
  buildCharacter(
    ID,
    "Mira",
    DICE,
    { ...CLERIC.defaults, placement: defaultPlacement(DICE, CLERIC) },
    "cleric",
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

const level2 = () => earn(mira(), 300);
const level3 = () =>
  withOwedSpells(earn(withOwedSpells(level2()), 600, "barrow"));
const names = (profile) => profile.features.map(({ name }) => name);

test("a level-2 Cleric's numbers: Channel Divinity and three 1st-level slots", () => {
  const sheet = level2();
  assert.equal(sheet.level, 2);
  const profile = characterProfile(sheet);
  // 8 + 2 at level 1, then 5 + 2.
  assert.equal(profile.maxHp, 17);
  assert.equal(sheet.hp, 17);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.spellcasting.slots, [3]);
  assert.equal(profile.spellcasting.saveDc, 13);
  assert.deepEqual(profile.featureUses, {
    "channel-divinity": { max: 2, recovery: { shortRest: 1, longRest: "all" } },
    "spell-slots-1": { max: 3, recovery: { shortRest: 0, longRest: "all" } },
  });
  // Divine Spark: 1d8 + Wisdom 3 against DC 13; no Preserve Life yet.
  assert.deepEqual(profile.channelDivinity, {
    saveDc: 13,
    divineSpark: { dice: 1, sides: 8, modifier: 3 },
  });
  assert.deepEqual(names(profile), [
    "Spellcasting",
    "Divine Order: Protector",
    "Channel Divinity",
  ]);
  assert.match(
    profile.features[2].text,
    /^2 uses; a short rest restores one, a long rest all\. .*Divine Spark: roll 1d8 \+ 3 \(Wisdom\)/u,
  );
  assert.equal(profile.spellcasting.alwaysPrepared, undefined);
  assert.equal(profile.spellcasting.discipleOfLife, undefined);
  assert.equal(profile.nextLevelXp, 900);
});

test("a new level's spell is chosen on the sheet before the next adventure", async () => {
  const sheet = level2();
  // Level 2 prepares five: one more to choose.
  assert.deepEqual(sheet.spells.prepared, CLERIC.defaults.spells.prepared);
  assert.deepEqual(spellsOwed(sheet), { cantrips: 0, prepared: 1 });
  assert.throws(
    () => prepareSpells(sheet, sheet.spells.prepared),
    /Choose 5 spells to prepare; 4 chosen\./u,
  );
  const ready = prepareSpells(sheet, [
    ...sheet.spells.prepared,
    "shield-of-faith",
  ]);
  assert.deepEqual(spellsOwed(ready), { cantrips: 0, prepared: 0 });
  // The harness's choice: the first on the list not yet prepared.
  assert.deepEqual(withOwedSpells(sheet).spells.prepared, [
    ...sheet.spells.prepared,
    "inflict-wounds",
  ]);
  // The library won't start an adventure while a spell is owed.
  const directory = await mkdtemp(join(tmpdir(), "dungeon-341-"));
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
        characters: [{ sheet, revision: 1 }],
      }),
    );
    const library = new FifthCharacterLibrary(path, 3);
    const session = { id: "e".repeat(32), adventureId: "graded-cellar" };
    let data = await library.read();
    await assert.rejects(
      library.attachSession(sheet.id, session, 1, data.revision),
      /Mira has 1 more spell to prepare on the character sheet before starting another adventure\./u,
    );
    data = await library.prepareSpells(
      sheet.id,
      ready.spells.prepared,
      data.revision,
    );
    await library.attachSession(sheet.id, session, 1, data.revision);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a level-3 Cleric's numbers: the Life Domain and 2nd-level slots", () => {
  const sheet = level3();
  assert.equal(sheet.level, 3);
  const profile = characterProfile(sheet);
  assert.equal(profile.maxHp, 24);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.spellcasting.slots, [4, 2]);
  assert.deepEqual(profile.featureUses["spell-slots-2"], {
    max: 2,
    recovery: { shortRest: 0, longRest: "all" },
  });
  assert.equal(profile.featureUses["channel-divinity"].max, 2);
  // Preserve Life: five times the level.
  assert.deepEqual(profile.channelDivinity, {
    saveDc: 13,
    divineSpark: { dice: 1, sides: 8, modifier: 3 },
    preserveLife: 15,
  });
  assert.deepEqual(names(profile), [
    "Spellcasting",
    "Divine Order: Protector",
    "Channel Divinity",
    "Life Domain: Life Domain Spells",
    "Life Domain: Disciple of Life",
    "Life Domain: Preserve Life",
  ]);
  assert.match(profile.features[5].text, /restore up to 15 hit points/u);
  assert.deepEqual(profile.spellcasting.alwaysPrepared, [
    "aid",
    "bless",
    "cure-wounds",
    "lesser-restoration",
  ]);
  assert.equal(profile.spellcasting.discipleOfLife, true);
  // Six chosen, besides the four always prepared.
  assert.equal(sheet.spells.prepared.length, 6);
  assert.ok(!sheet.spells.prepared.includes("bless"));
  assert.equal(profile.nextLevelXp, undefined);
});

test("reaching level 3 frees the choices that are now always prepared", () => {
  const before = withOwedSpells(level2());
  assert.deepEqual(before.spells.prepared, [
    "bless",
    "cure-wounds",
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
  ]);
  const after = earn(before, 600, "barrow");
  // Bless and Cure Wounds are the domain's now: three of six chosen.
  assert.deepEqual(after.spells.prepared, [
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
  ]);
  assert.deepEqual(spellsOwed(after), { cantrips: 0, prepared: 3 });
  // 2nd-level spells may be prepared; the domain's never are chosen.
  assert.deepEqual(preparableSpells(after), [
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
    "shield-of-faith",
    "spiritual-weapon",
    "hold-person",
    "protection-from-poison",
    "prayer-of-healing",
  ]);
  assert.throws(
    () =>
      prepareSpells(after, [
        "guiding-bolt",
        "healing-word",
        "inflict-wounds",
        "shield-of-faith",
        "spiritual-weapon",
        "aid",
      ]),
    /prepares, besides Aid, Bless, Cure Wounds, Lesser Restoration, levelled spells it has slots for: 6 different/u,
  );
  const changes = levelUpChanges(before, after);
  assert.deepEqual(changes.spells, {
    slots: { before: [3], after: [4, 2] },
    prepared: { before: 5, after: 6 },
    alwaysPrepared: ["aid", "bless", "cure-wounds", "lesser-restoration"],
    newSpells: [
      "spiritual-weapon",
      "hold-person",
      "protection-from-poison",
      "prayer-of-healing",
    ],
    owed: 3,
  });
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    [
      "Life Domain: Life Domain Spells",
      "Life Domain: Disciple of Life",
      "Life Domain: Preserve Life",
    ],
  );
  // Level 2's card names Channel Divinity and the spell to choose.
  const two = levelUpChanges(mira(), level2());
  assert.deepEqual(
    two.features.map(({ name }) => name),
    ["Channel Divinity"],
  );
  assert.equal(two.spells.owed, 1);
  assert.deepEqual(two.spells.newSpells, []);
});

test("a level-3 Cleric fights with Channel Divinity and its domain's spells", () => {
  const sheet = level3();
  const pc = playerCombatant(sheet, startingResources(sheet));
  assert.equal(pc.creatureType, "humanoid");
  assert.deepEqual(pc.channelDivinity, {
    uses: 2,
    max: 2,
    saveDc: 13,
    divineSpark: { dice: 1, sides: 8, modifier: 3 },
    preserveLife: 15,
  });
  assert.equal(pc.spellcasting.discipleOfLife, true);
  const spells = pc.spellcasting.spells.map(({ id }) => id);
  for (const id of ["aid", "bless", "cure-wounds", "lesser-restoration"]) {
    assert.ok(spells.includes(id), id);
  }
  assert.deepEqual(pc.spellcasting.slots, [
    { uses: 4, max: 4 },
    { uses: 2, max: 2 },
  ]);
});

test("a Cleric stays at level 3 for now, keeping the XP it earns", () => {
  const settled = earn(level3(), 5000, "far");
  assert.equal(settled.level, 3);
  assert.equal(settled.xp, 5900);
  assert.throws(
    () => validateCharacter({ ...settled, level: 4 }),
    /Character level differs from experience points\./u,
  );
});
