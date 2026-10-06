import assert from "node:assert/strict";
import test from "node:test";
import {
  ARMOUR,
  equipmentProfile,
  formatCoins,
  isKitId,
  itemTier,
  KIT_VALUE_TOLERANCE,
  kitPrice,
  MASTERIES,
  MASTERY_WEAPONS,
  readLoadout,
  STARTING_KITS,
  WEAPONS,
} from "../dist/equipment-5e.js";

/** Strength +3 (16), Dexterity +1, no masteries, no Defense. */
const CONTEXT = {
  modifiers: { strength: 3, dexterity: 1 },
  strengthScore: 16,
  proficiency: 2,
  masteries: [],
  defense: false,
  criticalRange: 20,
};
const profile = (equipment, context = {}) =>
  equipmentProfile(equipment, { ...CONTEXT, ...context });

test("the catalogue holds the SRD 5.2 weapons with price in copper, damage, properties, mastery and tier", () => {
  const rows = [
    ["club", 10, "1d4", "bludgeoning", [], "light", "Slow", "common"],
    ["dagger", 200, "1d4", "piercing", [], "finesse,light", "Nick", "common"],
    ["mace", 500, "1d6", "bludgeoning", [], "", "Sap", "common"],
    [
      "shortsword",
      1000,
      "1d6",
      "piercing",
      [],
      "finesse,light",
      "Vex",
      "common",
    ],
    [
      "longsword",
      1500,
      "1d8",
      "slashing",
      ["1d10"],
      "versatile",
      "Sap",
      "uncommon",
    ],
    [
      "greatsword",
      5000,
      "2d6",
      "slashing",
      [],
      "heavy,two-handed",
      "Graze",
      "uncommon",
    ],
  ];
  assert.deepEqual(
    Object.keys(WEAPONS),
    rows.map(([id]) => id),
  );
  for (const [
    id,
    price,
    damage,
    type,
    versatile,
    properties,
    mastery,
    tier,
  ] of rows) {
    const weapon = WEAPONS[id];
    assert.equal(weapon.price, price, id);
    assert.equal(`${weapon.damage.dice}d${weapon.damage.sides}`, damage, id);
    assert.deepEqual(
      weapon.versatile === undefined
        ? []
        : [`${weapon.versatile.dice}d${weapon.versatile.sides}`],
      versatile,
      id,
    );
    assert.equal(weapon.damageType, type, id);
    assert.equal(weapon.properties.join(","), properties, id);
    assert.equal(weapon.mastery, mastery, id);
    assert.equal(weapon.tier, tier, id);
  }
});

test("the catalogue holds the SRD 5.2 armour with price, AC, Dex cap, Strength and stealth", () => {
  const rows = [
    ["leather", 1000, "light", 11, undefined, undefined, false, "common"],
    ["chain-shirt", 5000, "medium", 13, 2, undefined, false, "common"],
    ["chain-mail", 7500, "heavy", 16, 0, 13, true, "uncommon"],
    ["plate", 150000, "heavy", 18, 0, 15, true, "rare"],
    ["shield", 1000, "shield", 2, undefined, undefined, false, "common"],
  ];
  assert.deepEqual(
    Object.keys(ARMOUR),
    rows.map(([id]) => id),
  );
  for (const [id, price, category, ac, cap, strength, stealth, tier] of rows) {
    const armour = ARMOUR[id];
    assert.deepEqual(
      [
        armour.price,
        armour.category,
        armour.armorClass,
        armour.dexterityCap,
        armour.strength,
        armour.stealthDisadvantage,
        armour.tier,
      ],
      [price, category, ac, cap, strength, stealth, tier],
      id,
    );
  }
});

test("each weapon's attack uses its damage, type and ability", () => {
  const rows = [
    // id, ability, bonus, damage
    ["club", "strength", 5, "1d4+3 bludgeoning"],
    ["dagger", "strength", 5, "1d4+3 piercing"],
    ["mace", "strength", 5, "1d6+3 bludgeoning"],
    ["shortsword", "strength", 5, "1d6+3 piercing"],
    ["longsword", "strength", 5, "1d10+3 slashing"],
    ["greatsword", "strength", 5, "2d6+3 slashing"],
  ];
  for (const [id, ability, bonus, damage] of rows) {
    const { attack } = profile(["leather", id]);
    assert.equal(attack.ability, ability, id);
    assert.equal(attack.bonus, bonus, id);
    assert.equal(
      `${attack.damage.dice}d${attack.damage.sides}+${attack.damage.modifier} ${attack.damage.type}`,
      damage,
      id,
    );
    assert.equal(attack.weapon, WEAPONS[id].name);
  }
});

test("finesse takes the higher of Strength and Dexterity; others use Strength", () => {
  const dexterous = { modifiers: { strength: -1, dexterity: 3 } };
  for (const [id, ability, bonus, modifier] of [
    ["dagger", "dexterity", 5, 3],
    ["shortsword", "dexterity", 5, 3],
    ["club", "strength", 1, -1],
    ["mace", "strength", 1, -1],
  ]) {
    const { attack } = profile([id], dexterous);
    assert.deepEqual(
      [attack.ability, attack.bonus, attack.damage.modifier],
      [ability, bonus, modifier],
      id,
    );
  }
});

test("a versatile weapon uses its larger die only in two hands", () => {
  const rows = [
    [["longsword"], "two-handed", 10],
    [["longsword", "shield"], "one-handed", 8],
    [["chain-shirt", "longsword"], "two-handed", 10],
  ];
  for (const [equipment, grip, sides] of rows) {
    const { attack } = profile(equipment);
    assert.equal(attack.grip, grip, equipment.join());
    assert.equal(attack.damage.sides, sides, equipment.join());
  }
});

test("two-handed weapons exclude a shield and a second weapon; two weapons must both be light", () => {
  const refused = [
    [["greatsword", "shield"], /needs both hands/],
    [["greatsword", "dagger"], /needs both hands/],
    [["mace", "dagger"], /must be light/],
    [["dagger", "mace"], /must be light/],
    [["dagger", "dagger", "shield"], /three hands/],
    [["dagger", "dagger", "club"], /one weapon, or two/],
    [["leather"], /one weapon, or two/],
    [["leather", "chain-shirt", "mace"], /at most one armour/],
    [["shield", "shield", "mace"], /at most one armour/],
    [["mace", "sling"], /Unsupported/],
  ];
  for (const [equipment, message] of refused) {
    assert.throws(() => readLoadout(equipment), message, equipment.join());
  }
  assert.deepEqual(readLoadout(["leather", "club", "dagger"]), {
    armour: "leather",
    shield: false,
    mainHand: "club",
    offHand: "dagger",
    twoHanded: false,
  });
  assert.deepEqual(readLoadout(["greatsword", "plate"]), {
    armour: "plate",
    shield: false,
    mainHand: "greatsword",
    twoHanded: true,
  });
});

test("armour class follows each armour's base and Dexterity cap, the shield and Defense", () => {
  // AC for Dexterity modifier -1, +1, +3, +5.
  const rows = [
    [["mace"], [9, 11, 13, 15]],
    [
      ["leather", "mace"],
      [10, 12, 14, 16],
    ],
    [
      ["chain-shirt", "mace"],
      [12, 14, 15, 15],
    ],
    [
      ["chain-mail", "mace"],
      [16, 16, 16, 16],
    ],
    [
      ["plate", "mace"],
      [18, 18, 18, 18],
    ],
    [
      ["shield", "mace"],
      [11, 13, 15, 17],
    ],
    [
      ["chain-shirt", "shield", "mace"],
      [14, 16, 17, 17],
    ],
  ];
  for (const [equipment, expected] of rows) {
    assert.deepEqual(
      [-1, 1, 3, 5].map(
        (dexterity) =>
          profile(equipment, { modifiers: { strength: 3, dexterity } })
            .armorClass,
      ),
      expected,
      equipment.join(),
    );
  }
  assert.equal(profile(["leather", "mace"], { defense: true }).armorClass, 13);
  // Defense needs armour; a shield alone is not armour.
  assert.equal(profile(["shield", "mace"], { defense: true }).armorClass, 13);
});

test("heavy armour below its Strength is noted, and a heavy weapon below 13 has disadvantage", () => {
  assert.deepEqual(
    profile(["chain-mail", "mace"], { strengthScore: 12 }).strengthShortfall,
    { armour: "Chain mail", strength: 13 },
  );
  assert.equal(
    profile(["chain-mail", "mace"], { strengthScore: 13 }).strengthShortfall,
    undefined,
  );
  assert.deepEqual(
    profile(["plate", "mace"], { strengthScore: 14 }).strengthShortfall,
    { armour: "Plate armour", strength: 15 },
  );
  assert.equal(
    profile(["plate", "mace"], { strengthScore: 15 }).strengthShortfall,
    undefined,
  );
  assert.equal(profile(["plate", "mace"]).stealthDisadvantage, true);
  assert.equal(profile(["leather", "mace"]).stealthDisadvantage, false);
  assert.deepEqual(
    profile(["greatsword"], { strengthScore: 12 }).attack.disadvantage,
    ["Heavy"],
  );
  assert.deepEqual(
    profile(["greatsword"], { strengthScore: 13 }).attack.disadvantage,
    [],
  );
});

test("two light weapons give an extra attack without the ability modifier unless negative", () => {
  const twin = profile(["leather", "shortsword", "dagger"]);
  assert.equal(twin.attack.weapon, "Shortsword");
  assert.deepEqual(twin.lightAttack.damage, {
    dice: 1,
    sides: 4,
    modifier: 0,
    type: "piercing",
  });
  assert.equal(twin.lightAttack.bonus, 5);
  const weak = profile(["club", "club"], {
    modifiers: { strength: -2, dexterity: 0 },
  });
  assert.equal(weak.lightAttack.damage.modifier, -2);
  assert.equal(profile(["leather", "mace"]).lightAttack, undefined);
});

test("a mastery applies only to a mastered weapon being held", () => {
  const masteries = ["dagger", "mace", "longsword"];
  assert.equal(profile(["mace"], { masteries }).attack.mastery, "Sap");
  assert.equal(
    profile(["shortsword"], { masteries }).attack.mastery,
    undefined,
  );
  const twin = profile(["club", "dagger"], { masteries });
  assert.equal(twin.attack.mastery, undefined);
  assert.equal(twin.lightAttack.mastery, "Nick");
  // Slow needs positions, so the club is never mastered.
  assert.equal(
    profile(["club"], { masteries: ["club"] }).attack.mastery,
    undefined,
  );
  assert.deepEqual(MASTERY_WEAPONS, [
    "dagger",
    "mace",
    "shortsword",
    "longsword",
    "greatsword",
  ]);
  assert.equal(MASTERIES.Slow.used, false);
});

/** Average damage of dice. */
const average = ({ dice, sides }) => (dice * (sides + 1)) / 2;
const weaponDominates = (a, b) => {
  const better = [
    average(a.versatile ?? a.damage) - average(b.versatile ?? b.damage),
    average(a.damage) - average(b.damage),
    ...["finesse", "light"].map(
      (property) =>
        Number(a.properties.includes(property)) -
        Number(b.properties.includes(property)),
    ),
    // Drawbacks: fewer is better.
    ...["heavy", "two-handed"].map(
      (property) =>
        Number(b.properties.includes(property)) -
        Number(a.properties.includes(property)),
    ),
  ];
  return better.every((gain) => gain >= 0) && better.some((gain) => gain > 0);
};
const armourAc = (armour, dexterity) =>
  armour.armorClass +
  (armour.category === "heavy"
    ? 0
    : Math.min(dexterity, armour.dexterityCap ?? 99));
const armourDominates = (a, b) => {
  const better = [
    ...[-4, -2, 0, 1, 2, 3, 4, 5].map(
      (dexterity) => armourAc(a, dexterity) - armourAc(b, dexterity),
    ),
    (b.strength ?? 0) - (a.strength ?? 0),
    Number(b.stealthDisadvantage) - Number(a.stealthDisadvantage),
  ];
  return better.every((gain) => gain >= 0) && better.some((gain) => gain > 0);
};

test("within each table no item is both cheaper and strictly better than another", () => {
  const tables = [
    [Object.values(WEAPONS), weaponDominates],
    [
      Object.values(ARMOUR).filter(({ category }) => category !== "shield"),
      armourDominates,
    ],
  ];
  for (const [items, dominates] of tables) {
    for (const a of items) {
      for (const b of items) {
        if (a !== b && a.price <= b.price) {
          assert.ok(
            !dominates(a, b),
            `${a.name} costs no more than ${b.name} and is strictly better`,
          );
        }
      }
    }
  }
  // The check catches a cheaper, strictly better item.
  assert.ok(weaponDominates(WEAPONS.shortsword, WEAPONS.club));
  assert.ok(
    armourDominates(
      { ...ARMOUR["chain-mail"], armorClass: 17 },
      ARMOUR["chain-mail"],
    ),
  );
});

test("kits hold only common-tier items, are legal loadouts and are of equal value", () => {
  const kits = Object.keys(STARTING_KITS);
  assert.ok(kits.length >= 3 && kits.length <= 4);
  for (const kit of kits) {
    assert.ok(isKitId(kit));
    for (const item of STARTING_KITS[kit].equipment) {
      assert.equal(itemTier(item), "common", `${kit}: ${item}`);
    }
    readLoadout(STARTING_KITS[kit].equipment);
    for (const other of kits) {
      assert.ok(
        Math.abs(kitPrice(kit) - kitPrice(other)) <= KIT_VALUE_TOLERANCE,
        `${kit} and ${other} differ in value by more than ${formatCoins(KIT_VALUE_TOLERANCE)}`,
      );
    }
  }
  assert.ok(
    kits.some((kit) => readLoadout(STARTING_KITS[kit].equipment).offHand),
    "one kit holds two light weapons",
  );
  assert.equal(isKitId("plate"), false);
});

test("prices show as mixed coins", () => {
  assert.equal(formatCoins(1210), "12 gp 1 sp");
  assert.equal(formatCoins(10), "1 sp");
  assert.equal(formatCoins(150000), "1500 gp");
  assert.equal(formatCoins(7), "7 cp");
  assert.equal(formatCoins(0), "0 cp");
});
