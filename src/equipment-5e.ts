/**
 * Weapons and armour (SRD 5.2), the starting kits, and the one rules module
 * that derives armour class and attacks from what a character has equipped.
 *
 * Pure rules over data. Prices are in copper pieces. Each item has an
 * availability tier: starting kits use only common items, and later tickets
 * limit merchants and treasure by tier. `docs/character-rules.md` records the
 * catalogue, the kits, the masteries and each abstraction.
 *
 * Positions are not modelled, so masteries that need distance are omitted
 * (Slow), and a Strength requirement's speed penalty is recorded but has no
 * effect. Ranged weapons are deferred, so the dagger's Thrown property is not
 * used.
 */

/** Availability tiers, from the easiest found to the hardest. */
export const TIERS = ["common", "uncommon", "rare"] as const;
export type Tier = (typeof TIERS)[number];

/** SRD 5.2 weapon mastery properties of the catalogue's weapons. */
export type MasteryName = "Graze" | "Nick" | "Sap" | "Slow" | "Vex";
/** The masteries the game uses: Slow needs positions. */
export type UsedMastery = Exclude<MasteryName, "Slow">;

export type WeaponProperty =
  "finesse" | "heavy" | "light" | "two-handed" | "versatile";

export type DamageType = "bludgeoning" | "piercing" | "slashing";

export type Dice = Readonly<{ dice: number; sides: number }>;

export type WeaponData = Readonly<{
  name: string;
  /** In copper pieces. */
  price: number;
  damage: Dice;
  /** The damage held in two hands, for a versatile weapon. */
  versatile?: Dice;
  damageType: DamageType;
  properties: readonly WeaponProperty[];
  mastery: MasteryName;
  tier: Tier;
}>;

/** SRD 5.2 melee weapons. Prices in copper: 1 sp = 10 cp, 1 gp = 100 cp. */
export const WEAPONS = {
  club: {
    name: "Club",
    price: 10,
    damage: { dice: 1, sides: 4 },
    damageType: "bludgeoning",
    properties: ["light"],
    mastery: "Slow",
    tier: "common",
  },
  dagger: {
    name: "Dagger",
    price: 200,
    damage: { dice: 1, sides: 4 },
    damageType: "piercing",
    properties: ["finesse", "light"],
    mastery: "Nick",
    tier: "common",
  },
  mace: {
    name: "Mace",
    price: 500,
    damage: { dice: 1, sides: 6 },
    damageType: "bludgeoning",
    properties: [],
    mastery: "Sap",
    tier: "common",
  },
  shortsword: {
    name: "Shortsword",
    price: 1000,
    damage: { dice: 1, sides: 6 },
    damageType: "piercing",
    properties: ["finesse", "light"],
    mastery: "Vex",
    tier: "common",
  },
  longsword: {
    name: "Longsword",
    price: 1500,
    damage: { dice: 1, sides: 8 },
    versatile: { dice: 1, sides: 10 },
    damageType: "slashing",
    properties: ["versatile"],
    mastery: "Sap",
    tier: "uncommon",
  },
  greatsword: {
    name: "Greatsword",
    price: 5000,
    damage: { dice: 2, sides: 6 },
    damageType: "slashing",
    properties: ["heavy", "two-handed"],
    mastery: "Graze",
    tier: "uncommon",
  },
} as const satisfies Record<string, WeaponData>;
export type WeaponId = keyof typeof WEAPONS;

export type ArmourData = Readonly<{
  name: string;
  /** In copper pieces. */
  price: number;
  category: "light" | "medium" | "heavy" | "shield";
  /** Base AC for body armour; the bonus for a shield. */
  armorClass: number;
  /** The most Dexterity modifier it adds; absent for no limit. Heavy armour adds none, not even a penalty. */
  dexterityCap?: number;
  /** The Strength score its wearer needs, or its speed drops by 10 feet. */
  strength?: number;
  stealthDisadvantage: boolean;
  tier: Tier;
}>;

/** SRD 5.2 armour, and the shield. */
export const ARMOUR = {
  leather: {
    name: "Leather armour",
    price: 1000,
    category: "light",
    armorClass: 11,
    stealthDisadvantage: false,
    tier: "common",
  },
  "chain-shirt": {
    name: "Chain shirt",
    price: 5000,
    category: "medium",
    armorClass: 13,
    dexterityCap: 2,
    stealthDisadvantage: false,
    tier: "common",
  },
  "chain-mail": {
    name: "Chain mail",
    price: 7500,
    category: "heavy",
    armorClass: 16,
    dexterityCap: 0,
    strength: 13,
    stealthDisadvantage: true,
    tier: "uncommon",
  },
  plate: {
    name: "Plate armour",
    price: 150000,
    category: "heavy",
    armorClass: 18,
    dexterityCap: 0,
    strength: 15,
    stealthDisadvantage: true,
    tier: "rare",
  },
  shield: {
    name: "Shield",
    price: 1000,
    category: "shield",
    armorClass: 2,
    stealthDisadvantage: false,
    tier: "common",
  },
} as const satisfies Record<string, ArmourData>;
export type ArmourId = keyof typeof ARMOUR;

export type ItemId = WeaponId | ArmourId;

/** Whether `id` names a catalogue weapon. */
export function isWeaponId(id: string): id is WeaponId {
  return Object.hasOwn(WEAPONS, id);
}

/** Whether `id` names catalogue armour or the shield. */
export function isArmourId(id: string): id is ArmourId {
  return Object.hasOwn(ARMOUR, id);
}

/** An item's SRD 5.2 name, such as "Leather armour". */
export function itemName(id: ItemId): string {
  return isWeaponId(id) ? WEAPONS[id].name : ARMOUR[id].name;
}

/** An item's price in copper pieces. */
export function itemPrice(id: ItemId): number {
  return isWeaponId(id) ? WEAPONS[id].price : ARMOUR[id].price;
}

/** An item's availability tier. */
export function itemTier(id: ItemId): Tier {
  return isWeaponId(id) ? WEAPONS[id].tier : ARMOUR[id].tier;
}

/** What each mastery does here, and whether it is used. */
export const MASTERIES: Readonly<
  Record<MasteryName, Readonly<{ text: string; used: boolean }>>
> = {
  Graze: {
    text: "When your attack with it misses, the target still takes damage equal to the ability modifier you attacked with, if above 0.",
    used: true,
  },
  Nick: {
    text: "The extra attack with it from holding two light weapons is part of the Attack action, so it doesn't take your bonus action.",
    used: true,
  },
  Sap: {
    text: "A creature it hits has disadvantage on its next attack roll before the start of your next turn.",
    used: true,
  },
  Slow: {
    text: "Slow reduces a creature's speed; with no positions it is omitted.",
    used: false,
  },
  Vex: {
    text: "When it hits and deals damage, you have advantage on your next attack roll against that creature before the end of your next turn.",
    used: true,
  },
};

/**
 * The weapons a Fighter can choose a mastery for: every catalogue weapon
 * whose mastery is used. The club's Slow needs positions.
 */
export const MASTERY_WEAPONS = (Object.keys(WEAPONS) as WeaponId[]).filter(
  (id) => MASTERIES[WEAPONS[id].mastery].used,
);

/** SRD 5.2: a level 1–3 Fighter masters three kinds of weapon. */
export const FIGHTER_MASTERY_COUNT = 3;

/** What a character has equipped, read from its equipment list. */
export type Loadout = Readonly<{
  armour?: ArmourId;
  shield: boolean;
  /** The weapon it attacks with. */
  mainHand: WeaponId;
  /** A second light weapon, for the Light property's extra attack. */
  offHand?: WeaponId;
  /** Whether the main weapon is held in two hands. */
  twoHanded: boolean;
}>;

/**
 * Reads an equipment list as a loadout, refusing one no character could
 * hold: unknown items, more than one body armour or shield, no weapon or more
 * than two, a shield with two weapons, a two-handed weapon with a shield or a
 * second weapon, or a second weapon when the two are not both light (the only
 * use for a second weapon is the Light extra attack). The first weapon listed
 * is the one attacked with. A versatile weapon is held in two hands when
 * nothing else is held.
 */
export function readLoadout(equipment: readonly string[]): Loadout {
  if (
    !Array.isArray(equipment) ||
    !equipment.every(
      (id) => typeof id === "string" && (isWeaponId(id) || isArmourId(id)),
    )
  ) {
    throw new Error("Unsupported character equipment.");
  }
  const ids = equipment as readonly ItemId[];
  const body = ids.filter(
    (id): id is ArmourId => isArmourId(id) && id !== "shield",
  );
  const shields = ids.filter((id) => id === "shield").length;
  const weapons = ids.filter(isWeaponId);
  if (body.length > 1 || shields > 1) {
    throw new Error("A character wears at most one armour and one shield.");
  }
  if (weapons.length === 0 || weapons.length > 2) {
    throw new Error("A character holds one weapon, or two light weapons.");
  }
  const [mainHand, offHand] = weapons as [WeaponId, WeaponId | undefined];
  const main: WeaponData = WEAPONS[mainHand];
  const shield = shields === 1;
  if (main.properties.includes("two-handed") && (shield || offHand)) {
    throw new Error(
      `The ${main.name.toLowerCase()} needs both hands: no shield or second weapon.`,
    );
  }
  if (offHand !== undefined) {
    const off: WeaponData = WEAPONS[offHand];
    if (shield) {
      throw new Error("Two weapons and a shield need three hands.");
    }
    if (
      !main.properties.includes("light") ||
      !off.properties.includes("light")
    ) {
      throw new Error("A second weapon must be light, and so must the first.");
    }
  }
  return {
    ...(body[0] === undefined ? {} : { armour: body[0] }),
    shield,
    mainHand,
    ...(offHand === undefined ? {} : { offHand }),
    twoHanded:
      main.properties.includes("two-handed") ||
      (main.properties.includes("versatile") && !shield && !offHand),
  };
}

export type AbilityModifiers = Readonly<{
  strength: number;
  dexterity: number;
}>;

/** One weapon attack as the combat engine makes it. */
export type AttackProfile = Readonly<{
  weaponId: WeaponId;
  weapon: string;
  /** The ability the attack and its damage use: finesse takes the higher. */
  ability: "strength" | "dexterity";
  grip: "one-handed" | "two-handed";
  bonus: number;
  damage: Readonly<{
    dice: number;
    sides: number;
    modifier: number;
    type: DamageType;
  }>;
  criticalRange: 19 | 20;
  /**
   * The weapon's mastery, present only when the character has mastered it and
   * it acts on this attack (Nick acts only on the extra attack).
   */
  mastery?: UsedMastery;
  /** Sources of disadvantage on every attack with it: a heavy weapon below Strength 13. */
  disadvantage: readonly string[];
}>;

/** Everything a character's equipment gives it in a fight. */
export type EquipmentProfile = Readonly<{
  loadout: Loadout;
  armorClass: number;
  attack: AttackProfile;
  /**
   * The Light property's extra attack with the second light weapon: no
   * ability modifier on its damage unless that is negative.
   */
  lightAttack?: AttackProfile;
  /** Armour worn below its Strength requirement: speed -10 ft (no effect without positions). */
  strengthShortfall?: Readonly<{ armour: string; strength: number }>;
  /** Armour that gives disadvantage on Dexterity (Stealth) checks. */
  stealthDisadvantage: boolean;
}>;

export type EquipmentContext = Readonly<{
  modifiers: AbilityModifiers;
  strengthScore: number;
  proficiency: number;
  masteries: readonly WeaponId[];
  /** Defense: +1 AC while wearing armour. */
  defense: boolean;
  criticalRange: 19 | 20;
}>;

function attackWith(
  weaponId: WeaponId,
  grip: "one-handed" | "two-handed",
  extra: boolean,
  context: EquipmentContext,
): AttackProfile {
  const weapon: WeaponData = WEAPONS[weaponId];
  const { strength, dexterity } = context.modifiers;
  const ability =
    weapon.properties.includes("finesse") && dexterity > strength
      ? "dexterity"
      : "strength";
  const modifier = context.modifiers[ability];
  const dice =
    grip === "two-handed" && weapon.versatile !== undefined
      ? weapon.versatile
      : weapon.damage;
  return {
    weaponId,
    weapon: weapon.name,
    ability,
    grip,
    bonus: modifier + context.proficiency,
    damage: {
      dice: dice.dice,
      sides: dice.sides,
      // The Light extra attack adds the modifier only when it is negative.
      modifier: extra ? Math.min(0, modifier) : modifier,
      type: weapon.damageType,
    },
    criticalRange: context.criticalRange,
    // Nick acts only on the extra attack; an unused mastery never applies.
    ...(context.masteries.includes(weaponId) &&
    MASTERIES[weapon.mastery].used &&
    (weapon.mastery !== "Nick" || extra)
      ? { mastery: weapon.mastery as UsedMastery }
      : {}),
    disadvantage:
      weapon.properties.includes("heavy") && context.strengthScore < 13
        ? ["Heavy"]
        : [],
  };
}

/**
 * Derives armour class and attacks from an equipment list: body armour's
 * base AC plus the Dexterity modifier up to its cap (10 + Dexterity with
 * none), +2 for a shield, +1 for Defense while wearing body armour; the main
 * weapon's attack (finesse uses the higher of Strength and Dexterity, a
 * versatile weapon held in two hands its larger die, a heavy weapon below
 * Strength 13 has disadvantage); and the Light extra attack when a second
 * light weapon is held. A mastery applies only to a weapon the character has
 * mastered and is holding.
 */
export function equipmentProfile(
  equipment: readonly string[],
  context: EquipmentContext,
): EquipmentProfile {
  const loadout = readLoadout(equipment);
  const dexterity = context.modifiers.dexterity;
  const armour: ArmourData | undefined =
    loadout.armour === undefined ? undefined : ARMOUR[loadout.armour];
  const body =
    armour === undefined
      ? 10 + dexterity
      : armour.category === "heavy"
        ? armour.armorClass
        : armour.armorClass +
          Math.min(dexterity, armour.dexterityCap ?? Number.POSITIVE_INFINITY);
  const armorClass =
    body +
    (loadout.shield ? ARMOUR.shield.armorClass : 0) +
    (context.defense && armour !== undefined ? 1 : 0);
  return {
    loadout,
    armorClass,
    attack: attackWith(
      loadout.mainHand,
      loadout.twoHanded ? "two-handed" : "one-handed",
      false,
      context,
    ),
    ...(loadout.offHand === undefined
      ? {}
      : {
          lightAttack: attackWith(loadout.offHand, "one-handed", true, context),
        }),
    ...(armour?.strength !== undefined &&
    context.strengthScore < armour.strength
      ? {
          strengthShortfall: {
            armour: armour.name,
            strength: armour.strength,
          },
        }
      : {}),
    stealthDisadvantage: armour?.stealthDisadvantage ?? false,
  };
}

export type KitData = Readonly<{
  name: string;
  /** Armour first, then the weapon attacked with, then any second weapon. */
  equipment: readonly ItemId[];
}>;

/**
 * The starting kits: common-tier items only, and a little of each. Early
 * levels are dangerous, so better gear is found, bought or earned.
 */
export const STARTING_KITS = {
  mace: { name: "Mace and leather", equipment: ["leather", "mace"] },
  "two-daggers": {
    name: "Two daggers and leather",
    equipment: ["leather", "dagger", "dagger"],
  },
  "club-and-dagger": {
    name: "Club, dagger and leather",
    equipment: ["leather", "club", "dagger"],
  },
} as const satisfies Record<string, KitData>;
export type KitId = keyof typeof STARTING_KITS;
/** Every starting kit's id, in the order creation offers them. */
export const KIT_IDS = Object.keys(STARTING_KITS) as readonly KitId[];

/** The most two kits' prices may differ by, in copper: they are of equal value. */
export const KIT_VALUE_TOLERANCE = 300;

/** A kit's value: the sum of its items' prices, in copper. */
export function kitPrice(kit: KitId): number {
  return STARTING_KITS[kit].equipment.reduce(
    (sum, id) => sum + itemPrice(id),
    0,
  );
}

/** Whether `value` names a starting kit. */
export function isKitId(value: unknown): value is KitId {
  return typeof value === "string" && Object.hasOwn(STARTING_KITS, value);
}

/** A price in copper as mixed coins, largest first: "12 gp 1 sp". */
export function formatPrice(copper: number): string {
  const gold = Math.floor(copper / 100);
  const silver = Math.floor((copper % 100) / 10);
  const parts = [
    ...(gold > 0 ? [`${gold} gp`] : []),
    ...(silver > 0 ? [`${silver} sp`] : []),
    ...(copper % 10 > 0 ? [`${copper % 10} cp`] : []),
  ];
  return parts.length === 0 ? "0 cp" : parts.join(" ");
}
