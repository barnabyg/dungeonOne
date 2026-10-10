// #342: a Cleric at levels 4 and 5. Level 4 brings an Ability Score
// Improvement (the pending level choice, made before the next adventure), a
// fourth cantrip, a third 2nd-level slot and a seventh prepared spell.
// Level 5 brings Sear Undead, 3rd-level slots and spells, Mass Healing Word
// always prepared, and cantrips that deal two dice. Engine tests are in
// issue-342-engine.test.mjs.
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  defaultPlacement,
  learnableCantrips,
  learnCantrips,
  levelUpChanges,
  pendingLevelChoice,
  preparableSpells,
  prepareSpells,
  settleCharacter,
  spellsOwed,
  spellsOwedWords,
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
const mira = (choices = {}) =>
  buildCharacter(
    ID,
    "Mira",
    DICE,
    {
      ...CLERIC.defaults,
      placement: defaultPlacement(DICE, CLERIC),
      ...choices,
    },
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

/** Level 3 with its spells chosen, 900 XP. */
const level3 = (choices) =>
  withOwedSpells(earn(withOwedSpells(earn(mira(choices), 300)), 600, "barrow"));
/** Level 4 at 2,700 XP, its choices still owed. */
const level4 = (choices) => earn(level3(choices), 1800, "crypt");
/** Level 4 with +1 Wisdom and +1 Constitution, its spells chosen. */
const level4Ready = () =>
  withOwedSpells(
    applyLevelChoice(level4(), { increase: { wisdom: 1, constitution: 1 } }),
  );
/** Level 5 at 6,500 XP, its spells chosen. */
const level5 = () => withOwedSpells(earn(level4Ready(), 3800, "tomb"));
const names = (profile) => profile.features.map(({ name }) => name);

test("a level-4 Cleric owes its Ability Score Improvement, a cantrip and a spell", () => {
  const sheet = level4();
  assert.equal(sheet.level, 4);
  assert.equal(sheet.xp, 2700);
  assert.equal(pendingLevelChoice(sheet), 4);
  // Level 4 knows 4 cantrips and prepares 7: one more of each.
  assert.deepEqual(spellsOwed(sheet), { cantrips: 1, prepared: 1 });
  assert.equal(
    spellsOwedWords(sheet),
    "1 more cantrip to learn and 1 more spell to prepare",
  );
  // The Protector knows three of the five; Thaumaturgy and Light are left.
  assert.deepEqual(learnableCantrips(sheet), ["thaumaturgy", "light"]);
  const profile = characterProfile(sheet);
  // 8 + 2, then 5 + 2 for each of three levels.
  assert.equal(profile.maxHp, 31);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.spellcasting.slots, [4, 3]);
  assert.equal(profile.nextLevelXp, 6500);
  const changes = levelUpChanges(level3(), sheet);
  assert.deepEqual(changes.choices, ["ability-score-improvement"]);
  assert.deepEqual(changes.spells, {
    slots: { before: [4, 2], after: [4, 3] },
    cantrips: { before: 3, after: 4 },
    prepared: { before: 6, after: 7 },
    alwaysPrepared: [],
    newSpells: [],
    owed: 1,
    cantripsOwed: 1,
  });
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Ability Score Improvement"],
  );
});

test("golden numbers for a level-4 Cleric after +1 Wisdom and +1 Constitution", () => {
  const chosen = applyLevelChoice(level4(), {
    increase: { wisdom: 1, constitution: 1 },
  });
  assert.equal(chosen.abilities.wisdom, 18);
  assert.equal(chosen.abilities.constitution, 16);
  assert.equal(pendingLevelChoice(chosen), undefined);
  const sheet = withOwedSpells(chosen);
  // The harness's choices: the first cantrip and spell on the list.
  assert.deepEqual(sheet.spells.cantrips, [
    "sacred-flame",
    "guidance",
    "resistance",
    "thaumaturgy",
  ]);
  assert.equal(sheet.spells.prepared.length, 7);
  assert.deepEqual(spellsOwed(sheet), { cantrips: 0, prepared: 0 });
  const profile = characterProfile(sheet);
  // Constitution 16 raises every level's hit points: 4 × (+3) more.
  assert.equal(profile.maxHp, 35);
  assert.equal(sheet.hp, 35);
  assert.equal(profile.spellcasting.saveDc, 14);
  assert.equal(profile.spellcasting.attackBonus, 6);
  assert.deepEqual(profile.channelDivinity, {
    saveDc: 14,
    divineSpark: { dice: 1, sides: 8, modifier: 4 },
    preserveLife: 20,
  });
  assert.match(
    profile.features.find(({ id }) => id === "ability-score-improvement").text,
    /Wisdom/u,
  );
});

test("a level-4 Thaumaturge learns Light, its one cantrip left", () => {
  const sheet = level4({
    divineOrder: "thaumaturge",
    spells: {
      cantrips: ["sacred-flame", "guidance", "resistance", "thaumaturgy"],
      prepared: CLERIC.defaults.spells.prepared,
    },
  });
  assert.deepEqual(spellsOwed(sheet), { cantrips: 1, prepared: 1 });
  assert.deepEqual(learnableCantrips(sheet), ["light"]);
  assert.throws(
    () => learnCantrips(sheet, ["sacred-flame"]),
    /learns only cantrips on its list it doesn't know: Light\./u,
  );
  assert.throws(() => learnCantrips(sheet, []), /Choose 1 cantrip to learn/u);
  const learned = learnCantrips(sheet, ["light"]);
  assert.equal(learned.spells.cantrips.length, 5);
  assert.throws(() => learnCantrips(learned, []), /no cantrip to learn/u);
});

test("golden numbers for a level-5 Cleric: Sear Undead, 3rd-level slots and two-dice cantrips", () => {
  const sheet = level5();
  assert.equal(sheet.level, 5);
  const profile = characterProfile(sheet);
  // Constitution 16: 8 + 3, then 5 + 3 for each of four levels.
  assert.equal(profile.maxHp, 43);
  assert.equal(profile.proficiencyBonus, 3);
  assert.deepEqual(profile.spellcasting.slots, [4, 3, 2]);
  assert.equal(profile.spellcasting.saveDc, 15);
  assert.equal(profile.spellcasting.attackBonus, 7);
  assert.deepEqual(profile.featureUses["spell-slots-3"], {
    max: 2,
    recovery: { shortRest: 0, longRest: "all" },
  });
  // Sear Undead: Wisdom 18's +4 d8s.
  assert.deepEqual(profile.channelDivinity, {
    saveDc: 15,
    divineSpark: { dice: 1, sides: 8, modifier: 4 },
    preserveLife: 25,
    searUndead: { dice: 4, sides: 8 },
  });
  assert.deepEqual(names(profile), [
    "Spellcasting",
    "Divine Order: Protector",
    "Channel Divinity",
    "Life Domain: Life Domain Spells",
    "Life Domain: Disciple of Life",
    "Life Domain: Preserve Life",
    "Ability Score Improvement",
    "Sear Undead",
    "Life Domain: Life Domain Spells: Mass Healing Word",
  ]);
  assert.match(
    profile.features.find(({ id }) => id === "sear-undead").text,
    /roll 4d8/u,
  );
  assert.match(
    profile.features.find(({ id }) => id === "life-domain-spells-5").text,
    /Revivify.*omitted/u,
  );
  assert.deepEqual(profile.spellcasting.alwaysPrepared, [
    "aid",
    "bless",
    "cure-wounds",
    "lesser-restoration",
    "mass-healing-word",
  ]);
  // Nine chosen, besides the five always prepared.
  assert.equal(sheet.spells.prepared.length, 9);
  assert.equal(profile.nextLevelXp, undefined);
  const pc = playerCombatant(sheet, startingResources(sheet));
  assert.deepEqual(pc.channelDivinity.searUndead, { dice: 4, sides: 8 });
  const flame = pc.spellcasting.spells.find(({ id }) => id === "sacred-flame");
  assert.equal(flame.effect.damage.dice, 2);
  assert.ok(
    pc.spellcasting.spells.some(({ id }) => id === "mass-healing-word"),
  );
  assert.deepEqual(pc.spellcasting.slots, [
    { uses: 4, max: 4 },
    { uses: 3, max: 3 },
    { uses: 2, max: 2 },
  ]);
});

test("reaching level 5 offers the 3rd-level spells; Mass Healing Word is the domain's", () => {
  const before = level4Ready();
  const after = earn(before, 3800, "tomb");
  assert.deepEqual(spellsOwed(after), { cantrips: 0, prepared: 2 });
  const preparable = preparableSpells(after);
  for (const id of [
    "spirit-guardians",
    "beacon-of-hope",
    "bestow-curse",
    "protection-from-energy",
  ]) {
    assert.ok(preparable.includes(id), id);
  }
  assert.ok(!preparable.includes("mass-healing-word"));
  const changes = levelUpChanges(before, after);
  assert.deepEqual(changes.spells, {
    slots: { before: [4, 3], after: [4, 3, 2] },
    cantrips: { before: 4, after: 4 },
    prepared: { before: 7, after: 9 },
    alwaysPrepared: ["mass-healing-word"],
    newSpells: [
      "spirit-guardians",
      "beacon-of-hope",
      "bestow-curse",
      "protection-from-energy",
    ],
    owed: 2,
    cantripsOwed: 0,
  });
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Sear Undead", "Life Domain: Life Domain Spells: Mass Healing Word"],
  );
  assert.deepEqual(changes.choices, []);
  // A choice of a 3rd-level spell is accepted.
  const ready = prepareSpells(after, [
    ...after.spells.prepared,
    "spirit-guardians",
    "bestow-curse",
  ]);
  assert.deepEqual(spellsOwed(ready), { cantrips: 0, prepared: 0 });
});

test("the library won't start a level-4 Cleric's adventure until its choices are made", async () => {
  const sheet = level4();
  const directory = await mkdtemp(join(tmpdir(), "dungeon-342-"));
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
      /Mira must choose the level 4 Ability Score Improvement on the character sheet before starting another adventure\./u,
    );
    data = await library.chooseLevel(
      sheet.id,
      { increase: { wisdom: 2 } },
      data.revision,
    );
    await assert.rejects(
      library.attachSession(sheet.id, session, 1, data.revision),
      /Mira has 1 more cantrip to learn and 1 more spell to prepare on the character sheet/u,
    );
    data = await library.learnCantrips(sheet.id, ["light"], data.revision);
    const [record] = data.characters;
    assert.deepEqual(record.sheet.spells.cantrips, [
      "sacred-flame",
      "guidance",
      "resistance",
      "light",
    ]);
    await assert.rejects(
      library.learnCantrips(sheet.id, ["thaumaturgy"], data.revision),
      /no cantrip to learn/u,
    );
    data = await library.prepareSpells(
      sheet.id,
      [...record.sheet.spells.prepared, "protection-from-poison"],
      data.revision,
    );
    await library.attachSession(sheet.id, session, 1, data.revision);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
