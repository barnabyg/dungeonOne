// #504: open an item to see its stats. Catalogue gear says what it is, and
// for the character whether it is proficient or trained and what equipping
// it would do, set against what it uses now, worked out as a real change of
// gear would be. Loot, a merchant's wares and stowed gear are compared;
// gear equipped is not. The browser side is issue-504-browser.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacter, defaultPlacement } from "../dist/character-5e.js";
import { itemStats } from "../dist/item-stats-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { armouryBarrow } from "./fixtures/armoury-barrow.mjs";
import { marketBarrow } from "./fixtures/market-barrow.mjs";

const ROLLS = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];
const fighter = (strength) =>
  buildCharacter("a".repeat(32), "Ada", ROLLS, {
    placement: {
      strength,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: strength === 0 ? 5 : 0,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  });
// Str 16 (+3), Dex 12 (+1), leather armour and a mace: AC 13.
const ada = fighter(0);
// Str 9: below chain mail's Strength 13 and the greatsword's Heavy.
const weak = fighter(5);

const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
// Simple weapons only, and no armour training (SRD 5.2).
const vela = buildCharacter(
  "d".repeat(32),
  "Vela",
  DICE,
  { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
  "wizard",
);

/** Plays `actions` from a fresh session, each accepted; returns the state. */
function play(runtime, actions) {
  let result = { state: runtime.createSession(), events: [] };
  for (const action of actions) {
    result = runtime.handleAction(result.state, action);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return result.state;
}

const LINTEL = [
  { type: "begin" },
  { type: "examine", targetId: "scratched-lintel" },
];
const loot = (view, id) => view.items.find((item) => item.id === id).stats;

test("an item without a character says what it is: damage, properties, mastery, AC, Strength, Stealth and weight", () => {
  assert.deepEqual(itemStats("longsword"), {
    facts: [
      "Martial melee weapon",
      "Damage 1d8 slashing; 1d10 in two hands",
      "Attacks with Strength",
      "Properties: Versatile",
      "Mastery: Sap. A creature it hits has disadvantage on its next attack roll before the start of your next turn.",
      "Weight 3 lb",
    ],
  });
  assert.deepEqual(itemStats("chain-mail"), {
    facts: [
      "Heavy armour",
      "AC 16 (no Dexterity)",
      "Needs Strength 13, or your speed drops by 10 ft",
      "Disadvantage on Dexterity (Stealth) checks",
      "Takes 10 minutes to don and 5 to doff, never in a fight",
      "Weight 55 lb",
    ],
  });
  assert.deepEqual(itemStats("shield").facts, [
    "Shield",
    "+2 AC",
    "Weight 6 lb",
  ]);
  assert.deepEqual(itemStats("chain-shirt").facts.slice(0, 2), [
    "Medium armour",
    "AC 13 + Dexterity modifier (max 2)",
  ]);
  assert.match(
    itemStats("shortbow").facts.join("\n"),
    /^Simple ranged weapon\nDamage 1d6 piercing\nAttacks with Dexterity\nProperties: Ammunition \(arrows\), Two-Handed\n/,
  );
  assert.equal(
    itemStats("dagger").facts[2],
    "Attacks with Strength or Dexterity, whichever is higher",
  );
  // A +1 item says so, and its AC counts the bonus.
  assert.equal(
    itemStats("chain-mail-plus-1").facts[1],
    "Uncommon magic armour: +1 to AC.",
  );
  assert.equal(itemStats("chain-mail-plus-1").facts[2], "AC 17 (no Dexterity)");
  assert.deepEqual(itemStats("thieves-tools").facts, [
    "Tool: used from your pack, never equipped",
    "Weight 1 lb",
  ]);
  // Ammunition's entry says enough.
  assert.equal(itemStats("arrows"), undefined);
});

test("loot behind the lintel says what wielding or wearing it would do, against what Ada uses now", () => {
  const runtime = createFifthRuntime(armouryBarrow, ada);
  const view = runtime.projectRoom(play(runtime, LINTEL));
  const longsword = loot(view, "lintel-longsword");
  assert.deepEqual(longsword.facts.slice(-3), [
    "Mastery: Sap (you haven't mastered it)",
    "You are proficient with it.",
    "Weight 3 lb",
  ]);
  // With nothing in the other hand, the longsword is held in two.
  assert.deepEqual(longsword.compare, [
    "If wielded: Longsword +5 to hit, 1d10 + 3 slashing, two-handed",
    "Now: Mace +5 to hit, 1d6 + 3 bludgeoning, Sap",
  ]);
  assert.deepEqual(loot(view, "lintel-shield").compare, [
    "If carried: AC 15",
    "Now: AC 13",
  ]);
  assert.deepEqual(loot(view, "lintel-mail").compare, [
    "If worn: AC 17, Stealth disadvantage",
    "Now: AC 13",
  ]);
  // Gear equipped has its facts but no comparison.
  assert.equal(view.gear.worn[0].stats.compare, undefined);
  assert.equal(view.gear.worn[0].stats.facts[0], "Light armour");
  assert.equal(view.gear.held[0].stats.compare, undefined);
});

test("too little Strength shows as the speed chain mail costs and the greatsword's Heavy disadvantage", () => {
  const runtime = createFifthRuntime(armouryBarrow, weak);
  const view = runtime.projectRoom(play(runtime, LINTEL));
  const mail = loot(view, "lintel-mail");
  assert.ok(
    mail.facts.includes(
      "Needs Strength 13, or your speed drops by 10 ft (yours is 9)",
    ),
  );
  assert.deepEqual(mail.compare, [
    "If worn: AC 17, speed −10 ft (Strength below 13), Stealth disadvantage",
    "Now: AC 13",
  ]);
  assert.equal(
    loot(view, "lintel-greatsword").compare[0],
    "If wielded: Greatsword +1 to hit, 2d6 − 1 slashing, two-handed, disadvantage (Heavy)",
  );
});

test("a change the rules refuse gives its reason, and a shield shows the hand it takes from a versatile weapon", () => {
  const runtime = createFifthRuntime(armouryBarrow, ada);
  const shielded = play(runtime, [
    ...LINTEL,
    { type: "take", itemId: "lintel-shield" },
    { type: "equip", itemId: "shield" },
  ]);
  assert.deepEqual(
    loot(runtime.projectRoom(shielded), "lintel-greatsword").compare,
    [
      "Can't be wielded with what you have now: The greatsword needs both hands, and your shield is on your arm.",
    ],
  );
  // With the longsword in both hands, the shield takes one.
  const twoHanded = play(runtime, [
    ...LINTEL,
    { type: "take", itemId: "lintel-longsword" },
    { type: "swap", itemId: "longsword" },
  ]);
  assert.deepEqual(
    loot(runtime.projectRoom(twoHanded), "lintel-shield").compare,
    [
      "If carried: AC 15; Longsword +5 to hit, 1d8 + 3 slashing",
      "Now: AC 13; Longsword +5 to hit, 1d10 + 3 slashing, two-handed",
    ],
  );
});

test("the comparison is what the swap gives: after wielding the longsword, the mace's line is the old Now", () => {
  const runtime = createFifthRuntime(armouryBarrow, ada);
  const taken = play(runtime, [
    ...LINTEL,
    { type: "take", itemId: "lintel-longsword" },
  ]);
  const before = runtime
    .projectRoom(taken)
    .gear.stowed.find(({ id }) => id === "longsword").stats.compare;
  const swapped = play(runtime, [
    ...LINTEL,
    { type: "take", itemId: "lintel-longsword" },
    { type: "swap", itemId: "longsword" },
  ]);
  const gear = runtime.projectRoom(swapped).gear;
  const after = gear.stowed.find(({ id }) => id === "mace").stats.compare;
  assert.equal(
    after[0].replace("If wielded: ", ""),
    before[1].replace("Now: ", ""),
  );
  assert.equal(
    after[1].replace("Now: ", ""),
    before[0].replace("If wielded: ", ""),
  );
  assert.deepEqual(
    [gear.attack.bonus, gear.attack.damage],
    [5, { dice: 1, sides: 10, modifier: 3, type: "slashing" }],
  );
});

test("a Wizard sees it isn't proficient with a longsword or trained in chain mail", () => {
  const longsword = itemStats("longsword", vela);
  assert.ok(
    longsword.facts.includes(
      "You are not proficient with it: no proficiency bonus to hit.",
    ),
  );
  assert.match(
    longsword.compare[0],
    /^If wielded: Longsword .*, not proficient$/,
  );
  const mail = itemStats("chain-mail", vela);
  assert.ok(
    mail.facts.includes(
      "You are not trained with heavy armour: disadvantage on Strength and Dexterity rolls, attacks among them.",
    ),
  );
  assert.match(
    mail.compare[0],
    /^If worn: AC 16, speed −10 ft \(Strength below 13\), Stealth disadvantage, disadvantage on Strength and Dexterity rolls \(untrained\); /,
  );
  assert.ok(
    itemStats("shield", vela).facts.includes(
      "You are not trained with shields: it adds no AC.",
    ),
  );
  // Without the comparison, as the library sheet shows it.
  assert.equal(
    itemStats("longsword", vela, { compare: false }).compare,
    undefined,
  );
});

test("chain mail worn shows Stealth disadvantage in the gear view", () => {
  const runtime = createFifthRuntime(armouryBarrow, ada);
  const leather = runtime.projectRoom(play(runtime, LINTEL)).gear;
  assert.equal(leather.stealthDisadvantage, undefined);
  const mailed = play(runtime, [
    ...LINTEL,
    { type: "take", itemId: "lintel-mail" },
    { type: "equip", itemId: "chain-mail" },
  ]);
  const gear = runtime.projectRoom(mailed).gear;
  assert.equal(gear.stealthDisadvantage, true);
  // The leather now stowed compares against the mail.
  assert.deepEqual(
    gear.stowed.find(({ id }) => id === "leather").stats.compare,
    ["If worn: AC 13", "Now: AC 17, Stealth disadvantage"],
  );
});

test("a merchant's wares show the same stats and comparison as loot", () => {
  const runtime = createFifthRuntime(marketBarrow, ada);
  const [pedlar] = runtime.projectRoom(
    play(runtime, [{ type: "begin" }]),
  ).creatures;
  const shortsword = pedlar.wares.find(({ id }) => id === "shortsword");
  assert.deepEqual(shortsword.stats, itemStats("shortsword", ada));
  // Ada has mastered the shortsword: Vex.
  assert.deepEqual(shortsword.stats.compare, [
    "If wielded: Shortsword +5 to hit, 1d6 + 3 piercing, Vex",
    "Now: Mace +5 to hit, 1d6 + 3 bludgeoning, Sap",
  ]);
  assert.deepEqual(
    pedlar.wares.find(({ id }) => id === "shield").stats.compare,
    ["If carried: AC 15", "Now: AC 13"],
  );
});
