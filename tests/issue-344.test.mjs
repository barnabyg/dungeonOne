// #344: a Wizard at levels 4 and 5. Level 4 brings an Ability Score
// Improvement (the pending level choice, made before the next adventure), a
// fourth cantrip, a third 2nd-level slot, a seventh prepared spell and two
// spellbook spells. Level 5 brings Memorize Spell, 3rd-level slots and the
// owner's 3rd-level spells, nine prepared spells and cantrips that deal two
// dice. Engine tests are in issue-344-engine.test.mjs; Memorize Spell in
// play is in issue-344-runtime.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  defaultPlacement,
  learnableCantrips,
  levelUpChanges,
  pendingLevelChoice,
  settleCharacter,
  spellbookOptions,
  spellbookOwed,
  spellsOwed,
  withOwedChoices,
} from "../dist/character-5e.js";
import { playerCombatant, startingResources } from "../dist/runtime-5e.js";
import { SPELLS } from "../dist/spells-5e.js";
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
      magicItems: [],
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });

/** Level 3 with its choices made, 900 XP. */
const level3 = () =>
  withOwedChoices(earn(withOwedChoices(earn(vela(), 300)), 600, "barrow"));
/** Level 4 at 2,700 XP, its choices still owed. */
const level4 = () => earn(level3(), 1800, "crypt");
/** Level 4 with +1 Intelligence and +1 Constitution, its spells chosen. */
const level4Ready = () =>
  withOwedChoices(
    applyLevelChoice(level4(), {
      increase: { intelligence: 1, constitution: 1 },
    }),
  );
/** Level 5 at 6,500 XP, its choices made. */
const level5 = () => withOwedChoices(earn(level4Ready(), 3800, "tomb"));
const names = (profile) => profile.features.map(({ name }) => name);

test("a Wizard now reaches level 5", () => {
  assert.equal(WIZARD.maxLevel, undefined);
  assert.equal(earn(vela(), 6500).level, 5);
});

test("a level-4 Wizard owes its Ability Score Improvement, a cantrip, a spell and two spellbook spells", () => {
  const sheet = level4();
  assert.equal(sheet.level, 4);
  assert.equal(pendingLevelChoice(sheet), 4);
  assert.deepEqual(spellsOwed(sheet), { cantrips: 1, prepared: 1 });
  assert.equal(spellbookOwed(sheet), 2);
  // The defaults know three of the four cantrips.
  assert.deepEqual(learnableCantrips(sheet), ["chill-touch"]);
  // Still no 3rd-level slot: the spellbook takes 1st- and 2nd-level spells.
  assert.ok(spellbookOptions(sheet).every((id) => SPELLS[id].level <= 2));
  const profile = characterProfile(sheet);
  // 6 + 2, then 4 + 2 for each of three levels.
  assert.equal(profile.maxHp, 26);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.spellcasting.slots, [4, 3]);
  assert.equal(profile.nextLevelXp, 6500);
  const changes = levelUpChanges(level3(), sheet);
  assert.deepEqual(changes.choices, ["ability-score-improvement"]);
  assert.deepEqual(changes.spells.slots, {
    before: [4, 2],
    after: [4, 3],
  });
  assert.deepEqual(changes.spells.cantrips, { before: 3, after: 4 });
  assert.deepEqual(changes.spells.prepared, { before: 6, after: 7 });
  assert.equal(changes.spells.spellbookOwed, 2);
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Ability Score Improvement"],
  );
});

test("golden numbers for a level-4 Wizard after +1 Intelligence and +1 Constitution", () => {
  const chosen = applyLevelChoice(level4(), {
    increase: { intelligence: 1, constitution: 1 },
  });
  assert.equal(chosen.abilities.intelligence, 18);
  assert.equal(chosen.abilities.constitution, 15);
  assert.equal(pendingLevelChoice(chosen), undefined);
  const sheet = withOwedChoices(chosen);
  assert.deepEqual(sheet.spells.cantrips, [
    "fire-bolt",
    "ray-of-frost",
    "shocking-grasp",
    "chill-touch",
  ]);
  assert.equal(sheet.spells.prepared.length, 7);
  assert.equal(sheet.spellbook.length, 12);
  const profile = characterProfile(sheet);
  // Constitution 15 keeps its +2: no more hit points.
  assert.equal(profile.maxHp, 26);
  assert.equal(sheet.hp, 26);
  // Intelligence 18: +4.
  assert.equal(profile.spellcasting.saveDc, 14);
  assert.equal(profile.spellcasting.attackBonus, 6);
  assert.deepEqual(profile.arcaneRecovery, { slotLevels: 2 });
  assert.match(
    profile.features.find(({ id }) => id === "ability-score-improvement").text,
    /Intelligence/u,
  );
});

test("reaching level 5 offers the 3rd-level spells for the spellbook", () => {
  const before = level4Ready();
  const after = earn(before, 3800, "tomb");
  assert.deepEqual(spellsOwed(after), { cantrips: 0, prepared: 2 });
  assert.equal(spellbookOwed(after), 2);
  const changes = levelUpChanges(before, after);
  assert.deepEqual(changes.spells.slots, {
    before: [4, 3],
    after: [4, 3, 2],
  });
  assert.deepEqual(changes.spells.prepared, { before: 7, after: 9 });
  assert.deepEqual(changes.spells.spellbookOptions.slice(0, 7), [
    "fireball",
    "lightning-bolt",
    "bestow-curse",
    "protection-from-energy",
    "vampiric-touch",
    "haste",
    "slow",
  ]);
  assert.deepEqual(
    changes.features.map(({ name }) => name),
    ["Memorize Spell"],
  );
  assert.deepEqual(changes.choices, []);
});

test("golden numbers for a level-5 Wizard: Memorize Spell, 3rd-level slots and two-dice cantrips", () => {
  const sheet = level5();
  assert.equal(sheet.level, 5);
  const profile = characterProfile(sheet);
  // 6 + 2, then 4 + 2 for each of four levels.
  assert.equal(profile.maxHp, 32);
  assert.equal(profile.proficiencyBonus, 3);
  assert.deepEqual(profile.spellcasting.slots, [4, 3, 2]);
  assert.equal(profile.spellcasting.saveDc, 15);
  assert.equal(profile.spellcasting.attackBonus, 7);
  assert.equal(profile.spellcasting.memorizeSpell, true);
  assert.equal(profile.spellcasting.potentCantrip, true);
  assert.deepEqual(profile.featureUses["spell-slots-3"], {
    max: 2,
    recovery: { shortRest: 0, longRest: "all" },
  });
  // Arcane Recovery: half of level 5, rounded up.
  assert.deepEqual(profile.arcaneRecovery, { slotLevels: 3 });
  assert.deepEqual(names(profile), [
    "Spellcasting",
    "Ritual Adept",
    "Arcane Recovery",
    "Scholar",
    "Evoker: Evocation Savant",
    "Evoker: Potent Cantrip",
    "Ability Score Improvement",
    "Memorize Spell",
  ]);
  assert.match(
    profile.features.find(({ id }) => id === "memorize-spell").text,
    /short rest.*until the adventure ends/u,
  );
  // Fourteen in the book: the harness writes the 3rd-level ones first.
  assert.equal(sheet.spellbook.length, 14);
  assert.deepEqual(sheet.spellbook.slice(12), ["fireball", "lightning-bolt"]);
  assert.equal(sheet.spells.prepared.length, 9);
  assert.equal(profile.nextLevelXp, undefined);
  const pc = playerCombatant(sheet, startingResources(sheet));
  for (const id of ["fire-bolt", "ray-of-frost", "shocking-grasp"]) {
    const cantrip = pc.spellcasting.spells.find((spell) => spell.id === id);
    assert.equal(cantrip.effect.damage.dice, 2, id);
  }
  const chill = pc.spellcasting.spells.find(({ id }) => id === "chill-touch");
  assert.deepEqual(chill.effect.damage, {
    dice: 2,
    sides: 10,
    type: "necrotic",
  });
  assert.deepEqual(pc.spellcasting.slots, [
    { uses: 4, max: 4 },
    { uses: 3, max: 3 },
    { uses: 2, max: 2 },
  ]);
});

test("every Wizard spell is on the list once and in SRD 5.2's spells the game knows", () => {
  const { list } = WIZARD.spellcasting;
  assert.equal(new Set(list).size, list.length);
  const third = list.filter((id) => SPELLS[id].level === 3);
  assert.deepEqual(third, [
    "fireball",
    "lightning-bolt",
    "bestow-curse",
    "protection-from-energy",
    "vampiric-touch",
    "haste",
    "slow",
  ]);
});
