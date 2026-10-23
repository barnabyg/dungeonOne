// #346: spell scrolls and the Wand of Magic Missiles. A character whose
// class has a scroll's spell on its list reads it as a Magic action and
// casts the spell with no slot, and the scroll is used up; a spell above its
// slots needs a check first. Anyone may use the wand: a charge a spell
// level, a long rest gives back 1d6 + 1, and its last charge may crumble it.
// What a surviving character holds at the end is kept, a wand recharged; a
// Wizard copies a scroll into its spellbook between adventures for 50 gp a
// spell level. Scrolls are priced inside the treasure budget; the wand is a
// magic item under D10.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findableValue } from "../dist/adventure-5e.js";
import {
  buildCharacter,
  copyableScrolls,
  copyScroll,
  defaultPlacement,
  prepareSpells,
  preparableSpells,
  settleCharacter,
  spellbookOptions,
  validateCharacter,
} from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { act, startEncounter } from "../dist/encounter-5e.js";
import {
  copyCost,
  heldItemText,
  scrollSpellProblem,
  scrollTier,
  scrollValue,
  WANDS,
} from "../dist/magic-items-5e.js";
import {
  createFifthRuntime,
  playerCombatant,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { createSeededRandom } from "../dist/random.js";
import {
  FifthSession,
  settleFifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { PLUS_ONE_SHORTSWORD } from "./fixtures/magic-barrow.mjs";
import {
  scroll,
  scrollBarrow,
  scrollBarrowFile,
  WAND,
} from "./fixtures/scroll-barrow.mjs";
import { barrowFile } from "./fixtures/armoury-barrow.mjs";

// Kept totals 15, 14, 13, 12, 10, 8 in roll order.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const build = (id, name, definition, className, choices = {}) =>
  buildCharacter(
    id.repeat(32),
    name,
    DICE,
    {
      ...definition.defaults,
      placement: defaultPlacement(DICE, definition),
      ...choices,
    },
    className,
  );
const vela = build("e", "Vela", WIZARD, "wizard");
const mira = build("c", "Mira", CLERIC, "cleric");
const vex = build("b", "Vex", ROGUE, "rogue");
const ada = buildCharacter("a".repeat(32), "Ada", DICE, {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { constitution: 2, intelligence: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
});

/** `sheet` holding `magicItems` and `purse` copper. */
const holding = (sheet, magicItems, purse = sheet.purse) =>
  validateCharacter({ ...sheet, magicItems, purse });

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** Into the barrow, the lintel examined and every item behind it taken. */
function looted(runtime) {
  let { state } = accepted(runtime, runtime.createSession(), {
    type: "begin",
  });
  state = accepted(runtime, state, {
    type: "examine",
    targetId: "scratched-lintel",
  }).state;
  for (const id of [
    "armour-scroll",
    "thunder-scroll",
    "healing-scroll",
    "lintel-wand",
  ]) {
    state = accepted(runtime, state, { type: "take", itemId: id }).state;
  }
  return state;
}

/** The cast entries the bar shows from scrolls and wands: item, spell, level, target, why not. */
const itemCasts = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action, spell }) => action === "cast" && spell.item)
    .map(({ spell, target, available, reason }) => [
      spell.item.id,
      spell.id,
      spell.slotLevel ?? null,
      target?.id ?? null,
      available ? null : reason,
    ]);

test("the catalogue: scroll values and tiers by spell level, and the wand", () => {
  assert.equal(scrollValue("mage-armor"), 5000);
  assert.equal(scrollTier("mage-armor"), "common");
  assert.equal(scrollValue("blur"), 20000);
  assert.equal(scrollTier("blur"), "uncommon");
  assert.equal(scrollValue("fireball"), 20000);
  assert.equal(scrollTier("fireball"), "uncommon");
  assert.equal(copyCost("thunderwave"), 5000);
  assert.equal(copyCost("fireball"), 15000);
  assert.match(scrollSpellProblem("fire-bolt"), /cantrip/u);
  assert.match(scrollSpellProblem("shield"), /reaction/u);
  assert.match(scrollSpellProblem("wish"), /not a spell/u);
  assert.equal(scrollSpellProblem("cure-wounds"), undefined);
  assert.deepEqual(WANDS["wand-of-magic-missiles"], {
    name: "Wand of Magic Missiles",
    spell: "magic-missile",
    charges: 7,
    regain: { dice: 1, sides: 6, modifier: 1 },
    rarity: "uncommon",
    attunement: false,
  });
  assert.match(
    heldItemText({ id: "a/b", wand: "wand-of-magic-missiles", charges: 3 }),
    /3 of 7 charges\.$/u,
  );
});

test("the validator: scrolls inside the budget at their tier; the wand fills the module's open magic item slot, from level 3", () => {
  const plain = validateModule({
    ...structuredClone(barrowFile),
    recommendedLevels: { min: 1, max: 3 },
  });
  assert.equal(
    findableValue(scrollBarrow),
    findableValue(plain) + 3 * 5000,
    "three 1st-level scrolls at 50 gp each; the wand outside the budget",
  );
  // A 1st-level scroll is common: any level.
  validateModule(scrollBarrowFile([scroll("s", "mage-armor")], 1));
  // A 2nd-level scroll is uncommon: from level 3.
  assert.throws(
    () => validateModule(scrollBarrowFile([scroll("s", "blur")], 2)),
    /uncommon/u,
  );
  validateModule(scrollBarrowFile([scroll("s", "blur")], 3));
  assert.throws(
    () => validateModule(scrollBarrowFile([scroll("s", "fire-bolt")])),
    /is a spell scroll, but Fire Bolt is a cantrip/u,
  );
  assert.throws(
    () => validateModule(scrollBarrowFile([scroll("s", "shield")])),
    /cast as a reaction/u,
  );
  assert.throws(
    () =>
      validateModule(
        scrollBarrowFile([{ ...scroll("s", "mage-armor"), spell: undefined }]),
      ),
    /is a spell scroll, but it needs a spell/u,
  );
  assert.throws(
    () =>
      validateModule(scrollBarrowFile([{ ...WAND, wand: "wand-of-wonder" }])),
    /is a wand, so it needs wand/u,
  );
  assert.throws(
    () =>
      validateModule(
        scrollBarrowFile([
          { ...scroll("s", "mage-armor"), kind: "potion-of-healing" },
        ]),
      ),
    /has a spell, but only a spell scroll has one/u,
  );
  assert.throws(
    () => validateModule(scrollBarrowFile([WAND], 2)),
    /level 3 and up/u,
  );
  // Any class may use the wand, so it isn't caster-only (#537, D1): beside
  // a +1 shortsword, one of them is a second item outside the caster slot.
  assert.throws(
    () => validateModule(scrollBarrowFile([WAND, PLUS_ONE_SHORTSWORD])),
    /a second magic item that isn't caster-only/u,
  );
});

test('a scroll and the wand found behind the lintel are carried in "You carry"', () => {
  const runtime = createFifthRuntime(scrollBarrow, vela);
  const state = looted(runtime);
  const carried = runtime
    .projectRoom(state)
    .inventory.filter(({ id }) => id.startsWith("lintel-barrow/"));
  assert.deepEqual(
    carried.map(({ id, name, charges }) => [id, name, charges ?? null]),
    [
      ["lintel-barrow/armour-scroll", "Spell Scroll (Mage Armor)", null],
      ["lintel-barrow/thunder-scroll", "Spell Scroll (Thunderwave)", null],
      ["lintel-barrow/healing-scroll", "Spell Scroll (Cure Wounds)", null],
      ["lintel-barrow/lintel-wand", "Wand of Magic Missiles", "7 of 7 charges"],
    ],
  );
  assert.match(
    carried[0].description,
    /reads it to cast the spell with no slot/u,
  );
});

test("outside a fight a Wizard reads Mage Armor from its scroll: no slot spent, the scroll used up", () => {
  const runtime = createFifthRuntime(scrollBarrow, vela);
  const state = looted(runtime);
  // Only spells that outlast a fight are read outside one; Cure Wounds isn't
  // a Wizard spell; the wand has no one to aim at.
  assert.deepEqual(itemCasts(runtime, state), [
    ["lintel-barrow/armour-scroll", "mage-armor", null, "pc", null],
    [
      "lintel-barrow/healing-scroll",
      "cure-wounds",
      null,
      "pc",
      "Not on your list",
    ],
  ]);
  const slots = state.character.featureUses["spell-slots-1"];
  const read = accepted(runtime, state, {
    type: "cast",
    actorId: "pc",
    spellId: "mage-armor",
    targetIds: ["pc"],
    itemId: "lintel-barrow/armour-scroll",
  });
  assert.match(
    renderFifthResult(read),
    /^You cast Mage Armor on yourself from the Spell Scroll \(Mage Armor\), which is used up\./u,
  );
  assert.equal(read.state.character.featureUses["spell-slots-1"], slots);
  assert.equal(runtime.projectRoom(read.state).gear.armorClass, 13 + 2);
  assert.deepEqual(
    read.state.possessions.magicItems.map(({ id }) => id),
    [
      "lintel-barrow/thunder-scroll",
      "lintel-barrow/healing-scroll",
      "lintel-barrow/lintel-wand",
    ],
  );
  // Read once: it's gone.
  assert.equal(
    runtime.handleAction(read.state, {
      type: "cast",
      actorId: "pc",
      spellId: "mage-armor",
      targetIds: ["pc"],
      itemId: "lintel-barrow/armour-scroll",
    }).rejection.code,
    "no-item",
  );
});

test("a Fighter can't read a scroll; a Cleric can't read a Wizard-only scroll", () => {
  const fighter = createFifthRuntime(scrollBarrow, ada);
  const fighting = looted(fighter);
  const refusal = fighter.handleAction(fighting, {
    type: "cast",
    actorId: "pc",
    spellId: "mage-armor",
    targetIds: ["pc"],
    itemId: "lintel-barrow/armour-scroll",
  }).rejection;
  assert.deepEqual(refusal, {
    code: "not-on-list",
    reason:
      "Mage Armor isn't on your class's spell list, so you can't read the scroll.",
  });

  const cleric = createFifthRuntime(scrollBarrow, mira);
  const state = looted(cleric);
  assert.equal(
    cleric.handleAction(state, {
      type: "cast",
      actorId: "pc",
      spellId: "mage-armor",
      targetIds: ["pc"],
      itemId: "lintel-barrow/armour-scroll",
    }).rejection.code,
    "not-on-list",
  );
  // Cure Wounds is a Cleric spell: Mira reads it once hurt.
  const hurt = { ...state, character: { ...state.character, hp: 3 } };
  const healed = accepted(
    cleric,
    hurt,
    {
      type: "cast",
      actorId: "pc",
      spellId: "cure-wounds",
      targetIds: ["pc"],
      itemId: "lintel-barrow/healing-scroll",
    },
    dice([8, 5], [8, 5]),
  );
  assert.ok(healed.state.character.hp > 3);
  assert.ok(
    !healed.state.possessions.magicItems.some(
      ({ id }) => id === "lintel-barrow/healing-scroll",
    ),
  );
});

// The engine, on combatants built from sheets.

const goblin = {
  id: "goblin",
  name: "Goblin Warrior",
  side: "opponents",
  armorClass: 15,
  hp: 30,
  maxHp: 30,
  dexterity: 14,
  initiativeBonus: 2,
  saves: {
    strength: -1,
    dexterity: 2,
    constitution: 0,
    intelligence: 0,
    wisdom: -1,
    charisma: -1,
  },
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
};

/**
 * A fight between `sheet` and the goblin, at `sheet`'s first turn, its
 * combatant changed by `tweak`.
 */
function fightFor(sheet, tweak = (pc) => pc) {
  // The character rolls 20 for initiative, the goblin 1.
  // Hurt, with a potion, its turn stays open after its action.
  const pc = {
    ...playerCombatant(sheet),
    hp: 3,
    potions: [
      {
        id: "potion",
        name: "Potion of Healing",
        healing: { dice: 2, sides: 4, modifier: 2 },
      },
    ],
  };
  return startEncounter([tweak(pc), goblin], dice([20, 20], [20, 1])).state;
}

const wandCast = (slotLevel, itemId = "a/wand") => ({
  type: "cast",
  actorId: "pc",
  spellId: "magic-missile",
  targetIds: ["goblin"],
  slotLevel,
  itemId,
});

test("anyone may use the wand: a charge for each spell level, up to 3rd", () => {
  const armed = holding(ada, [
    { id: "a/wand", wand: "wand-of-magic-missiles", charges: 7 },
  ]);
  const state = fightFor(armed);
  // 2nd level: two charges, four darts.
  const result = act(state, wandCast(2), dice([4, 1], [4, 1], [4, 1], [4, 1]));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  const cast = result.events.find(({ type }) => type === "cast");
  assert.deepEqual(cast.item, {
    id: "a/wand",
    name: "Wand of Magic Missiles",
    kind: "wand",
    charges: { spent: 2, left: 5, max: 7 },
  });
  assert.equal(cast.slot, undefined);
  assert.equal(
    result.events.find(({ type }) => type === "spell-damage").missiles,
    4,
  );
  const pc = result.state.combatants.find(({ id }) => id === "pc");
  assert.equal(pc.magicItems[0].charges, 5);
  // The action is spent.
  assert.equal(
    act(result.state, wandCast(1), dice()).rejection.code,
    "action-used",
  );
  // 4th level is beyond the game's spells; more charges than it has, refused.
  assert.equal(act(state, wandCast(4), dice()).rejection.code, "slot-level");
  const low = fightFor(
    holding(ada, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 1 },
    ]),
  );
  assert.match(
    act(low, wandCast(2), dice()).rejection.reason,
    /from 1st to 1st level now/u,
  );
  const empty = fightFor(
    holding(ada, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 0 },
    ]),
  );
  assert.equal(act(empty, wandCast(1), dice()).rejection.code, "no-charges");
});

test("spending the wand's last charge rolls a d20: on a 1 it crumbles", () => {
  const last = fightFor(
    holding(ada, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 1 },
    ]),
  );
  const kept = act(last, wandCast(1), dice([4, 1], [4, 1], [4, 1], [20, 2]));
  assert.deepEqual(
    kept.events.find(({ type }) => type === "wand-last-charge"),
    {
      type: "wand-last-charge",
      combatantId: "pc",
      item: "Wand of Magic Missiles",
      roll: 2,
      crumbled: false,
    },
  );
  assert.equal(
    kept.state.combatants.find(({ id }) => id === "pc").magicItems.length,
    1,
  );
  const gone = act(last, wandCast(1), dice([4, 1], [4, 1], [4, 1], [20, 1]));
  assert.equal(
    gone.events.find(({ type }) => type === "wand-last-charge").crumbled,
    true,
  );
  assert.deepEqual(
    gone.state.combatants.find(({ id }) => id === "pc").magicItems,
    [],
  );
});

test("a scroll above its reader's slots needs a check: 10 + the spell's level", () => {
  // Vela (Intelligence 17, +3) at level 1 has only 1st-level slots.
  const reader = holding(vela, [{ id: "a/web", scroll: "scorching-ray" }]);
  const state = fightFor(reader);
  const cast = {
    type: "cast",
    actorId: "pc",
    spellId: "scorching-ray",
    targetIds: ["goblin"],
    itemId: "a/web",
  };
  // d20 8 + 3 = 11 < 12: used up with no effect.
  const failed = act(state, cast, dice([20, 8]));
  assert.deepEqual(
    failed.events.find(({ type }) => type === "scroll-check"),
    {
      type: "scroll-check",
      combatantId: "pc",
      item: "Spell Scroll (Scorching Ray)",
      spell: "Scorching Ray",
      d20: 8,
      modifier: 3,
      total: 11,
      dc: 12,
      success: false,
    },
  );
  assert.ok(!failed.events.some(({ type }) => type === "attack"));
  assert.deepEqual(
    failed.state.combatants.find(({ id }) => id === "pc").magicItems,
    [],
  );
  // d20 9 + 3 = 12: three rays.
  const passed = act(
    state,
    cast,
    dice(
      [20, 9],
      ...[1, 2, 3].flatMap(() => [
        [20, 15],
        [6, 1],
        [6, 1],
      ]),
    ),
  );
  assert.equal(passed.rejection, undefined, passed.rejection?.reason);
  assert.equal(passed.events.filter(({ type }) => type === "attack").length, 3);
  // A Wizard with 2nd-level slots reads it without a check: a scroll's
  // spell spends no slot and the turn's one slot is still free.
  assert.equal(
    act(state, { ...cast, slotLevel: 2 }, dice()).rejection?.code ?? null,
    "slot-level",
  );
});

test("a long rest gives the wand back 1d6 + 1 charges, up to 7", () => {
  const runtime = createFifthRuntime(
    scrollBarrow,
    holding(vela, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 2 },
    ]),
  );
  const { state } = accepted(runtime, runtime.createSession(), {
    type: "begin",
  });
  // Unhurt, with every slot, only the wand's charges would come back.
  const rested = accepted(runtime, state, { type: "long-rest" }, dice([6, 3]));
  assert.deepEqual(rested.state.possessions.magicItems, [
    { id: "a/wand", wand: "wand-of-magic-missiles", charges: 6 },
  ]);
  assert.match(
    renderFifthResult(rested),
    /The Wand of Magic Missiles regains charges: 3 \+ 1 = 4; it gains 4 and has 6 of 7\./u,
  );
  const full = createFifthRuntime(
    scrollBarrow,
    holding(vela, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 7 },
    ]),
  );
  const begun = accepted(full, full.createSession(), { type: "begin" });
  assert.equal(
    full.handleAction(begun.state, { type: "long-rest" }, dice()).rejection
      .code,
    "nothing-to-recover",
  );
});

test("on leaving, a used scroll is gone, an unused one kept, and the wand recharged", () => {
  const runtime = createFifthRuntime(scrollBarrow, vela);
  let state = looted(runtime);
  state = accepted(runtime, state, {
    type: "cast",
    actorId: "pc",
    spellId: "mage-armor",
    targetIds: ["pc"],
    itemId: "lintel-barrow/armour-scroll",
  }).state;
  // Spend two of the wand's charges, as a fight would have.
  state = {
    ...state,
    possessions: {
      ...state.possessions,
      magicItems: state.possessions.magicItems.map((item) =>
        item.wand ? { ...item, charges: 5 } : item,
      ),
    },
  };
  const left = accepted(runtime, state, {
    type: "leave",
    roomId: "barrow-mouth",
  });
  const settlement = runtime.projectSettlement(left.state);
  assert.deepEqual(settlement.gear, [
    "lintel-barrow/armour-scroll",
    "lintel-barrow/thunder-scroll",
    "lintel-barrow/healing-scroll",
    "lintel-barrow/lintel-wand",
  ]);
  const after = settleCharacter(vela, settlement);
  assert.deepEqual(after.magicItems, [
    { id: "lintel-barrow/thunder-scroll", scroll: "thunderwave" },
    { id: "lintel-barrow/healing-scroll", scroll: "cure-wounds" },
    {
      id: "lintel-barrow/lintel-wand",
      wand: "wand-of-magic-missiles",
      charges: 7,
    },
  ]);
  // Found once: the scrolls aren't behind the lintel again.
  const again = createFifthRuntime(scrollBarrow, after);
  const back = accepted(again, again.createSession(), { type: "begin" });
  const looked = accepted(again, back.state, {
    type: "examine",
    targetId: "scratched-lintel",
  });
  assert.deepEqual(again.projectRoom(looked.state).items, []);
  // Kept scrolls are read in the next adventure.
  assert.deepEqual(
    itemCasts(again, looked.state).map(([id]) => id),
    ["lintel-barrow/healing-scroll"],
  );
});

test("a Wizard copies a scroll's spell into its spellbook between adventures for 50 gp a level", () => {
  const sheet = holding(
    vela,
    [
      { id: "a/sickness", scroll: "ray-of-sickness" },
      { id: "a/missile", scroll: "magic-missile" },
      { id: "a/cure", scroll: "cure-wounds" },
      { id: "a/ray", scroll: "scorching-ray" },
    ],
    7000,
  );
  assert.deepEqual(copyableScrolls(sheet), [
    { id: "a/sickness", name: "Spell Scroll (Ray of Sickness)", cost: 5000 },
    {
      id: "a/missile",
      name: "Spell Scroll (Magic Missile)",
      cost: 5000,
      reason: "Magic Missile is in the spellbook already.",
    },
    {
      id: "a/cure",
      name: "Spell Scroll (Cure Wounds)",
      cost: 5000,
      reason: "Cure Wounds isn't a Wizard spell.",
    },
    {
      id: "a/ray",
      name: "Spell Scroll (Scorching Ray)",
      cost: 10000,
      reason:
        "Scorching Ray is 2nd-level, and Vela has no slots of that level yet.",
    },
  ]);
  const copied = copyScroll(sheet, "a/sickness");
  assert.deepEqual(copied.copiedSpells, ["ray-of-sickness"]);
  assert.equal(copied.purse, 2000);
  assert.deepEqual(
    copied.magicItems.map(({ id }) => id),
    ["a/missile", "a/cure", "a/ray"],
  );
  // Prepared like any other spell in the book; not offered to write again.
  assert.ok(preparableSpells(copied).includes("ray-of-sickness"));
  assert.ok(!spellbookOptions(copied).includes("ray-of-sickness"));
  const prepared = prepareSpells(copied, [
    "ray-of-sickness",
    "magic-missile",
    "shield",
    "burning-hands",
  ]);
  assert.ok(prepared.spells.prepared.includes("ray-of-sickness"));
  // A sheet round-trips its copied spells.
  assert.deepEqual(validateCharacter(structuredClone(prepared)), prepared);

  assert.throws(
    () => copyScroll(holding(vela, sheet.magicItems, 4999), "a/sickness"),
    /Copying Ray of Sickness costs 50 gp, and Vela has 49 gp 9 sp 9 cp\./u,
  );
  assert.throws(() => copyScroll(sheet, "a/cure"), /isn't a Wizard spell/u);
  assert.throws(() => copyScroll(sheet, "a/none"), /no such spell scroll/u);
  const cleric = holding(mira, [{ id: "a/cure", scroll: "cure-wounds" }], 9000);
  assert.throws(() => copyScroll(cleric, "a/cure"), /no spellbook/u);
  assert.deepEqual(copyableScrolls(cleric), []);
  assert.throws(
    () => validateCharacter({ ...cleric, copiedSpells: ["cure-wounds"] }),
    /no spellbook to copy into/u,
  );
  assert.throws(
    () => validateCharacter({ ...sheet, copiedSpells: ["magic-missile"] }),
    /none already in its spellbook/u,
  );
});

test("a sheet's magic items are validated", () => {
  assert.throws(
    () => holding(vela, [{ id: "a/x", scroll: "fire-bolt" }]),
    /Unsupported spell scroll/u,
  );
  assert.throws(
    () =>
      holding(vela, [
        { id: "a/x", wand: "wand-of-magic-missiles", charges: 8 },
      ]),
    /Unsupported wand/u,
  );
  assert.throws(
    () =>
      holding(vela, [
        { id: "a/x", scroll: "sleep" },
        { id: "a/x", scroll: "sleep" },
      ]),
    /Duplicate magic item/u,
  );
  assert.throws(
    () => holding(vela, [{ id: "not an id", scroll: "sleep" }]),
    /Unsupported magic item id/u,
  );
});

/** A session of `sheet` in the burial hall's fight, at its turn. */
function inTheHall(sheet) {
  for (let seed = 0; ; seed++) {
    const session = FifthSession.begin(seed, scrollBarrow, sheet);
    const moved = session.runtime.handleAction(
      session.state,
      { type: "move", destinationId: "burial-hall" },
      createSeededRandom(seed),
    );
    if (
      moved.rejection === undefined &&
      session.runtime.projectFight(moved.state).turn !== undefined
    ) {
      return { runtime: session.runtime, state: moved.state };
    }
  }
}

test("in a fight the bar and the AI DM's cast tool offer the scroll and the wand", () => {
  const { runtime, state } = inTheHall(
    holding(vela, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 2 },
      { id: "a/thunder", scroll: "thunderwave" },
      { id: "a/cure", scroll: "cure-wounds" },
    ]),
  );
  assert.deepEqual(itemCasts(runtime, state), [
    ["a/wand", "magic-missile", 1, "barrow-goblin", null],
    ["a/wand", "magic-missile", 2, "barrow-goblin", null],
    ["a/thunder", "thunderwave", null, null, null],
    ["a/cure", "cure-wounds", null, "pc", "Not on your list"],
  ]);
  const wand = runtime
    .projectActions(state)
    .find(({ spell }) => spell?.item?.id === "a/wand");
  assert.deepEqual(wand.spell.item, {
    id: "a/wand",
    name: "Wand of Magic Missiles",
    kind: "wand",
    charges: { left: 2, max: 7 },
  });
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "cast");
  assert.deepEqual(tool.parameters.properties.item.enum, [
    "a/wand",
    "a/thunder",
    null,
  ]);
  assert.ok(tool.parameters.required.includes("item"));
  assert.match(
    tool.description,
    /item a\/wand \(Wand of Magic Missiles: spell magic-missile, Magic Missile; slot_level 1 or 2, a charge for each level \(2 of 7 charges left\); targets from barrow-goblin \(Goblin Warrior\)\)/u,
  );
  // A Fighter sees the wand too, and no scroll it can't read in the tool.
  const fighter = inTheHall(
    holding(ada, [
      { id: "a/wand", wand: "wand-of-magic-missiles", charges: 7 },
      { id: "a/thunder", scroll: "thunderwave" },
    ]),
  );
  const fighterTool = fighter.runtime
    .getGameToolDefinitions(fighter.state)
    .find(({ name }) => name === "cast");
  assert.deepEqual(fighterTool.parameters.properties.item.enum, [
    "a/wand",
    null,
  ]);
  assert.deepEqual(fighterTool.parameters.properties.slot_level.enum, [
    1,
    2,
    3,
    null,
  ]);
});

test("a Rogue can't read a scroll either", () => {
  const rogue = createFifthRuntime(scrollBarrow, vex);
  const state = looted(rogue);
  assert.equal(
    rogue.handleAction(state, {
      type: "cast",
      actorId: "pc",
      spellId: "mage-armor",
      targetIds: ["pc"],
      itemId: "lintel-barrow/armour-scroll",
    }).rejection.code,
    "not-on-list",
  );
});

test("a scroll's spell uses the scroll's save DC and attack bonus, then the reader's come back", () => {
  // Vela with an unusually high DC of 17: the scroll's is 13.
  const state = fightFor(
    holding(vela, [{ id: "a/thunder", scroll: "thunderwave" }]),
    (pc) => ({ ...pc, spellcasting: { ...pc.spellcasting, saveDc: 17 } }),
  );
  const result = act(
    state,
    {
      type: "cast",
      actorId: "pc",
      spellId: "thunderwave",
      targetIds: ["goblin"],
      itemId: "a/thunder",
    },
    dice([8, 1], [8, 1], [20, 20]),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(
    result.events.find(({ type }) => type === "spell-save").save.dc,
    13,
  );
  assert.equal(
    result.state.combatants.find(({ id }) => id === "pc").spellcasting.saveDc,
    17,
  );
});

test("abandoning or losing the adventure gives back a scroll read in it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-346-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      0,
    );
    const started = await library.startCreation();
    const data = await library.create(
      "Vela",
      {
        ...WIZARD.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, WIZARD),
      },
      started.revision,
      "wizard",
    );
    const [{ sheet }] = data.characters;
    const scrolls = [{ id: "a/armour", scroll: "mage-armor" }];
    // Mage Armor's scroll from an earlier adventure.
    const path = join(directory, "characters.json");
    const file = JSON.parse(await readFile(path, "utf8"));
    file.characters[0].sheet = holding(sheet, scrolls);
    await writeFile(path, JSON.stringify(file, null, 2));
    const start = (await library.read()).characters[0].sheet;
    const readIt = async () => {
      const current = await library.read();
      const session = await startFifthAdventure(
        library,
        0,
        start.id,
        scrollBarrow,
        current.revision,
      );
      const { result } = session.act(
        {
          type: "cast",
          actorId: "pc",
          spellId: "mage-armor",
          targetIds: ["pc"],
          itemId: "a/armour",
        },
        "click",
      );
      assert.equal(result.rejection, undefined, result.rejection?.reason);
      assert.deepEqual(session.state.possessions.magicItems, []);
      return session;
    };
    const abandoned = await readIt();
    await abandoned.persist();
    const after = await library.abandonSession(
      start.id,
      (await library.read()).revision,
    );
    assert.deepEqual(after.characters[0].sheet, start);

    const fallen = await readIt();
    fallen.state = {
      ...fallen.state,
      status: "defeat",
      endingId: "fallen-in-the-barrow",
    };
    await settleFifthSession(library, fallen);
    const record = (await library.read()).characters[0];
    assert.equal(record.defeated, true);
    assert.deepEqual(record.sheet.magicItems, scrolls);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a scroll casts in the spell's own time: Healing Word takes the bonus action, not the action", () => {
  const state = fightFor(
    holding(mira, [{ id: "a/word", scroll: "healing-word" }]),
  );
  const result = act(
    state,
    {
      type: "cast",
      actorId: "pc",
      spellId: "healing-word",
      targetIds: ["pc"],
      itemId: "a/word",
    },
    dice([4, 2], [4, 2]),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(
    result.events.find(({ type }) => type === "cast").castingTime,
    "bonus-action",
  );
  assert.equal(result.state.economy.bonusAction, false);
  assert.equal(result.state.economy.actions, 1);
});
