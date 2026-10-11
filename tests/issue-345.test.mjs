// #345: SRD 5.2 +1 weapons, +1 armour and +1 shields, uncommon magic items.
// A +1 weapon adds 1 to attack and damage rolls, +1 armour or a +1 shield 1
// to AC. A module hides at most one, only for level 3 and up, outside its
// treasure budget (D10), and none needs attunement (D11). Merchants neither
// sell nor buy them.
import assert from "node:assert/strict";
import test from "node:test";
import {
  ARMOUR,
  equipItem,
  equipmentProfile,
  itemName,
  itemTier,
  magicItemText,
  MASTERY_WEAPONS,
  readLoadout,
  sellItem,
  swapWeapon,
  unequipItem,
  WEAPONS,
} from "../dist/equipment-5e.js";
import { findableValue } from "../dist/adventure-5e.js";
import { characterAtLevel, gateAdventure } from "../dist/balance-5e.js";
import {
  buildCharacter,
  settleCharacter,
  validateCharacter,
} from "../dist/character-5e.js";
import { grazeDamage } from "../dist/encounter-5e.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { magicItemProblems } from "../dist/treasure-5e.js";
import { barrowFile, room } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  magicBarrow,
  magicBarrowFile,
  PLUS_ONE_SHORTSWORD,
} from "./fixtures/magic-barrow.mjs";
import { marketFile } from "./fixtures/market-barrow.mjs";

/** Strength +3 (16), Dexterity +1, no masteries, no Fighting Style. */
const CONTEXT = {
  modifiers: { strength: 3, dexterity: 1 },
  strengthScore: 16,
  dexterityScore: 12,
  proficiency: 2,
  weaponProficiencies: ["simple", "martial"],
  armourTraining: ["light", "medium", "heavy", "shield"],
  masteries: [],
  criticalRange: 20,
};
const profile = (equipment, context = {}) =>
  equipmentProfile(equipment, { ...CONTEXT, ...context });

test("every mundane weapon, armour and the shield has a +1 version: uncommon, no attunement", () => {
  for (const table of [WEAPONS, ARMOUR]) {
    const mundane = Object.keys(table).filter((id) => !table[id].magic);
    for (const id of mundane) {
      const magic = table[`${id}-plus-1`];
      assert.ok(magic, id);
      assert.equal(magic.name, `+1 ${table[id].name}`);
      assert.deepEqual(magic.magic, {
        base: id,
        bonus: 1,
        rarity: "uncommon",
        attunement: false,
      });
      assert.equal(magic.weight, table[id].weight);
      assert.equal(magic.price, 40000);
    }
  }
  assert.equal(itemName("shortsword-plus-1"), "+1 Shortsword");
  assert.equal(itemTier("shortsword-plus-1"), "uncommon");
  // A +1 version is never more available than its mundane item.
  assert.equal(itemTier("plate-plus-1"), "rare");
  // Masteries are of a kind of weapon, never of a +1 one.
  assert.ok(MASTERY_WEAPONS.every((id) => !WEAPONS[id].magic));
});

test("a +1 weapon adds 1 to its attack and damage rolls", () => {
  const plain = profile(["leather", "shortsword"]).attack;
  const magic = profile(["leather", "shortsword-plus-1"]).attack;
  assert.equal(magic.weapon, "+1 Shortsword");
  assert.equal(magic.bonus, plain.bonus + 1);
  assert.equal(magic.damage.modifier, plain.damage.modifier + 1);
  assert.deepEqual(
    { dice: magic.damage.dice, sides: magic.damage.sides },
    { dice: 1, sides: 6 },
  );
  // A ranged +1 weapon too, Archery's +2 besides.
  const bow = profile(["shortbow-plus-1"], { fightingStyle: "archery" });
  assert.equal(bow.attack.bonus, 1 + 2 + 2 + 1);
  assert.equal(bow.attack.damage.modifier, 1 + 1);
});

test("the Light extra attack with a +1 weapon keeps its +1 to damage without the modifier", () => {
  const { lightAttack } = profile(["leather", "dagger", "dagger-plus-1"]);
  assert.equal(lightAttack.bonus, 3 + 2 + 1);
  assert.equal(lightAttack.damage.modifier, 1);
  const { lightAttack: twf } = profile(["leather", "dagger", "dagger-plus-1"], {
    fightingStyle: "two-weapon-fighting",
  });
  assert.equal(twf.damage.modifier, 3 + 1);
});

test("a mastered weapon's mastery applies to its +1 version", () => {
  const { attack } = profile(["leather", "shortsword-plus-1"], {
    masteries: ["shortsword"],
  });
  assert.equal(attack.mastery, "Vex");
});

test("+1 armour and a +1 shield each add 1 to AC; an untrained +1 shield adds none", () => {
  const base = profile(["leather", "shield", "mace"]).armorClass;
  assert.equal(
    profile(["leather-plus-1", "shield", "mace"]).armorClass,
    base + 1,
  );
  assert.equal(
    profile(["leather", "shield-plus-1", "mace"]).armorClass,
    base + 1,
  );
  assert.equal(
    profile(["leather-plus-1", "shield-plus-1", "mace"]).armorClass,
    base + 2,
  );
  // Heavy +1 armour: its base, no Dexterity, +1.
  assert.equal(profile(["chain-mail-plus-1", "mace"]).armorClass, 17);
  assert.equal(
    profile(["leather", "shield-plus-1", "mace"], {
      armourTraining: ["light"],
    }).armorClass,
    11 + 1,
  );
  // A +1 shield is a shield: one only, and not with a two-handed weapon.
  assert.equal(readLoadout(["shield-plus-1", "mace"]).shield, true);
  assert.throws(
    () => readLoadout(["shield", "shield-plus-1", "mace"]),
    /at most one armour and one shield/,
  );
  assert.throws(
    () => readLoadout(["leather", "leather-plus-1", "mace"]),
    /at most one armour/,
  );
  assert.throws(
    () => readLoadout(["shield-plus-1", "greatsword"]),
    /needs both hands/,
  );
});

test("swapping to a +1 weapon and back changes the attack; equipping +1 armour and a shield changes AC", () => {
  const start = {
    equipment: ["leather", "mace"],
    stowed: ["shortsword-plus-1"],
  };
  const to = swapWeapon(start, "shortsword-plus-1");
  assert.deepEqual(to.gear, {
    equipment: ["leather", "shortsword-plus-1"],
    stowed: ["mace"],
  });
  assert.equal(profile(to.gear.equipment).attack.weapon, "+1 Shortsword");
  const back = swapWeapon(to.gear, "mace");
  assert.deepEqual(back.gear, {
    equipment: ["leather", "mace"],
    stowed: ["shortsword-plus-1"],
  });
  assert.equal(
    profile(back.gear.equipment).attack.bonus,
    profile(to.gear.equipment).attack.bonus - 1,
  );

  const armour = equipItem(
    { equipment: ["leather", "mace"], stowed: ["leather-plus-1"] },
    "leather-plus-1",
  );
  assert.deepEqual(armour.gear, {
    equipment: ["leather-plus-1", "mace"],
    stowed: ["leather"],
  });
  assert.deepEqual(armour.replaced, ["leather"]);
  const shield = equipItem(armour.gear, "shield-plus-1");
  assert.equal(shield.refusal.code, "not-carried");
  const strapped = equipItem(
    { equipment: ["leather", "mace"], stowed: ["shield-plus-1"] },
    "shield-plus-1",
  );
  assert.deepEqual(strapped.gear.equipment, [
    "leather",
    "shield-plus-1",
    "mace",
  ]);
  assert.equal(
    equipItem(
      { equipment: ["greatsword"], stowed: ["shield-plus-1"] },
      "shield-plus-1",
    ).refusal.code,
    "two-handed",
  );
  assert.equal(
    swapWeapon(
      { equipment: ["shield-plus-1", "mace"], stowed: ["greatsword"] },
      "greatsword",
    ).refusal.code,
    "two-handed",
  );
  const off = unequipItem(strapped.gear, "shield-plus-1");
  assert.deepEqual(off.gear, {
    equipment: ["leather", "mace"],
    stowed: ["shield-plus-1"],
  });
});

test("no merchant buys a magic item", () => {
  const holding = {
    equipment: ["leather", "mace"],
    stowed: ["shortsword-plus-1"],
    purse: 0,
  };
  const sale = sellItem(holding, "shortsword-plus-1");
  assert.equal(sale.refusal.code, "magic-item");
  assert.match(sale.refusal.reason, /No merchant here deals in magic items/);
});

test("a magic item's text explains its bonus", () => {
  assert.equal(
    magicItemText("shortsword-plus-1"),
    "Uncommon magic weapon: +1 to attack and damage rolls.",
  );
  assert.equal(
    magicItemText("chain-shirt-plus-1"),
    "Uncommon magic armour: +1 to AC.",
  );
  assert.equal(
    magicItemText("shield-plus-1"),
    "Uncommon magic shield: +1 to AC.",
  );
  assert.equal(magicItemText("shortsword"), undefined);
});

test("D10 and D11: at most one magic item a module, from level 3, none needing attunement", () => {
  const sword = { id: "sword", magic: WEAPONS["shortsword-plus-1"].magic };
  const shield = { id: "shield", magic: ARMOUR["shield-plus-1"].magic };
  assert.deepEqual(magicItemProblems([sword], 3), []);
  assert.deepEqual(magicItemProblems([], 1), []);
  assert.deepEqual(magicItemProblems([sword, shield], 5), [
    "shield is one magic item too many: a module hides at most 1.",
  ]);
  assert.deepEqual(magicItemProblems([sword], 2), [
    "sword is a magic item, but magic items are found only in modules for level 3 and up.",
  ]);
  assert.deepEqual(
    magicItemProblems(
      [{ id: "ring", magic: { ...sword.magic, attunement: true } }],
      3,
    ),
    ["ring needs attunement, and no item that needs attunement is found yet."],
  );
});

test("Graze on a miss deals the ability modifier, not a +1 weapon's bonus", () => {
  const { attack } = profile(["greatsword-plus-1"], {
    masteries: ["greatsword"],
  });
  assert.equal(attack.mastery, "Graze");
  assert.equal(attack.magicBonus, 1);
  assert.equal(attack.damage.modifier, 4);
  assert.equal(grazeDamage(attack), 3);
  assert.equal(grazeDamage(profile(["greatsword"]).attack), 3);
});

const ROLLS = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];
// Str 16 (+3), Dex 12 (+1), Con 14 (+2), with the mace kit.
const ada = buildCharacter("a".repeat(32), "Ada", ROLLS, {
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

/** Plays `actions` from a fresh session, each accepted; returns the last result. */
function play(runtime, actions) {
  let result = { state: runtime.createSession(), events: [] };
  for (const action of actions) {
    result = runtime.handleAction(result.state, action);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return result;
}

test("a +1 shortsword found behind the lintel is wielded at once and kept on leaving", () => {
  const runtime = createFifthRuntime(magicBarrow, ada);
  const taken = play(runtime, [
    { type: "begin" },
    { type: "examine", targetId: "scratched-lintel" },
    { type: "take", itemId: "lintel-blade" },
  ]);
  assert.equal(
    renderFifthResult(taken),
    "You take the +1 Shortsword and stow it.",
  );
  assert.deepEqual(runtime.projectRoom(taken.state).gear.stowed, [
    {
      id: "shortsword-plus-1",
      name: "+1 Shortsword",
      magic: "Uncommon magic weapon: +1 to attack and damage rolls.",
    },
  ]);

  const wielded = runtime.handleAction(taken.state, {
    type: "swap",
    itemId: "shortsword-plus-1",
  });
  assert.equal(
    renderFifthResult(wielded),
    "You stow the mace and wield the +1 shortsword. AC 13; +1 Shortsword +6 to hit, 1d6 + 4 piercing.",
  );
  const gear = runtime.projectRoom(wielded.state).gear;
  assert.deepEqual(gear.held, [
    {
      id: "shortsword-plus-1",
      name: "+1 Shortsword",
      magic: "Uncommon magic weapon: +1 to attack and damage rolls.",
    },
  ]);
  assert.equal(gear.attack.bonus, 6);
  // Vex: Ada has mastered the shortsword, so its +1 version too.
  assert.equal(gear.attack.mastery, "Vex");

  const left = runtime.handleAction(wielded.state, {
    type: "leave",
    roomId: "barrow-mouth",
  });
  const after = settleCharacter(ada, runtime.projectSettlement(left.state));
  assert.deepEqual(after.equipment, ["leather", "shortsword-plus-1"]);
  assert.deepEqual(after.stowed, ["mace"]);
});

test("the balance gate's one-hit-kill measure counts a placed +1 weapon", () => {
  const plain = { ...structuredClone(barrowFile) };
  plain.recommendedLevels = { min: 1, max: 3 };
  const enemy = (adventure) => {
    const result = gateAdventure(adventure, { seeds: [0] });
    assert.equal(result.ok, true);
    return result.verdict.oneHitKill.enemies[0];
  };
  const without = enemy(validateModule(plain));
  const withMagic = enemy(magicBarrow);
  assert.equal(withMagic.gear, "shortsword-plus-1");
  assert.ok(withMagic.chance > without.chance);
});

test("the validator: one magic item a module, from level 3, never on sale, outside the budget", () => {
  assert.equal(
    findableValue(magicBarrow),
    findableValue(validateModule(barrowFile)),
  );

  const second = magicBarrowFile();
  room(second, "barrow-mouth").items.push({
    ...PLUS_ONE_SHORTSWORD,
    id: "lintel-shield",
    name: "+1 Shield",
    gear: "shield-plus-1",
  });
  assert.throws(
    () => validateModule(second),
    /module lintel-barrow: lintel-shield is one magic item too many: a module hides at most 1\./,
  );

  const low = magicBarrowFile();
  low.recommendedLevels = { min: 1, max: 2 };
  assert.throws(() => validateModule(low), /level 3 and up/);

  const pedlar = structuredClone(marketFile);
  pedlar.recommendedLevels = { min: 3, max: 3 };
  room(pedlar, "barrow-mouth").creatures[0].merchant.stock.push(
    "dagger-plus-1",
  );
  assert.throws(
    () => validateModule(pedlar),
    /stocks the magic dagger-plus-1, but no merchant sells magic items\./,
  );
});

test("a merchant offers no sale of a magic item, and the engine refuses one", () => {
  const carrying = validateCharacter({ ...ada, stowed: ["dagger-plus-1"] });
  const runtime = createFifthRuntime(validateModule(marketFile), carrying);
  const start = play(runtime, [{ type: "begin" }]);
  const offers = runtime
    .projectActions(start.state)
    .filter(({ action }) => action.startsWith("sell"))
    .map(({ target }) => target.id);
  assert.ok(!offers.includes("dagger-plus-1"), offers.join());
  assert.ok(
    !runtime
      .projectRoom(start.state)
      .creatures[0].salePrices.some(({ id }) => id === "dagger-plus-1"),
  );
  assert.deepEqual(
    runtime.handleAction(start.state, { type: "sell", itemId: "dagger-plus-1" })
      .rejection,
    {
      code: "magic-item",
      reason: "No merchant here deals in magic items: you keep the +1 dagger.",
    },
  );
});

test("at a level that brings a mastery, the gate masters a placed +1 weapon's kind", () => {
  const dice = [
    [6, 6, 6, 1],
    [5, 5, 5, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [2, 2, 2, 1],
    [1, 1, 1, 1],
  ];
  const plain = characterAtLevel(dice, 4, undefined, false, "greatsword");
  const magic = characterAtLevel(
    dice,
    4,
    undefined,
    false,
    "greatsword-plus-1",
  );
  assert.ok(plain.weaponMasteries.includes("greatsword"));
  assert.deepEqual(magic.weaponMasteries, plain.weaponMasteries);
});

test("a +1 shield takes the place of the shield carried, which is stowed", () => {
  const change = equipItem(
    { equipment: ["leather", "shield", "mace"], stowed: ["shield-plus-1"] },
    "shield-plus-1",
  );
  assert.deepEqual(change, {
    gear: {
      equipment: ["leather", "shield-plus-1", "mace"],
      stowed: ["shield"],
    },
    replaced: ["shield"],
  });
  const carrying = validateCharacter({ ...ada, stowed: ["shield-plus-1"] });
  const shielded = validateCharacter({
    ...carrying,
    equipment: ["leather", "shield", "mace"],
  });
  const runtime = createFifthRuntime(magicBarrow, shielded);
  const start = play(runtime, [{ type: "begin" }]);
  const result = runtime.handleAction(start.state, {
    type: "equip",
    itemId: "shield-plus-1",
  });
  assert.equal(result.rejection, undefined);
  assert.match(
    renderFifthResult(result),
    /^You unstrap the shield and strap the \+1 shield to your arm\. AC 16;/,
  );
});
