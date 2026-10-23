/**
 * The treasure catalogue (#239): gems and art objects, the potions, and the
 * treasure-value budget each adventure is held to, and the treasure types
 * that say what a bestiary monster carries (#240).
 *
 * Pure rules over data. Values are in copper pieces, like gear prices.
 * Gems and art objects are trade goods: they do nothing but sell, and a
 * merchant pays their full value (SRD 5.2 trade goods). A potion's value
 * counts toward a module's budget, but no merchant buys one.
 *
 * Each item has an availability tier, and a module may hide an item only if
 * its tier is allowed at the module's maximum recommended level: common
 * always, uncommon from level 3, and no rare treasure yet. A module hides
 * magic items (#345, D10) only for level 3 and up, outside its budget: one
 * any class may use and one that only a spellcaster may attune (#537, D1),
 * each from its own minimum level (D3). The budgets, the tier levels and
 * the magic item limits are parameter tables; tune them here. `docs/rules/gear.md` states the rules they serve.
 */
import {
  POTION_WEIGHT,
  type Coin,
  type Coins,
  type Tier,
} from "./equipment-5e.js";
import type { Attunement, CasterItemId, WandId } from "./magic-items-5e.js";
import type { RandomSource } from "./random.js";

/** What a module's treasure may be worth, by its maximum recommended level, in copper. */
export const TREASURE_BUDGETS: Readonly<Record<number, number>> = {
  1: 15000,
  2: 30000,
  3: 45000,
  4: 60000,
  5: 75000,
};

/**
 * The lowest maximum recommended level at which a module may hide an item of
 * each tier. A tier left out is never found in this increment.
 */
export const TIER_MIN_LEVEL: Readonly<Partial<Record<Tier, number>>> = {
  common: 1,
  uncommon: 3,
};

/**
 * The magic items a module may hide (#345, D10; #537, D1): only in a module
 * whose maximum recommended level is `minLevel` or more, `perModule` that
 * any class may use and `casterSlot` more that only a spellcaster may
 * attune. They are outside the treasure budget. Potions are priced inside
 * it, and are not counted here.
 */
export const MAGIC_ITEM_LIMITS = {
  perModule: 1,
  casterSlot: 1,
  minLevel: 3,
} as const;

/**
 * The lowest maximum recommended level of a module that may hide each wand
 * and caster item, by catalogue id (#537, D3), on top of its tier's; a
 * new wand or caster item fails to compile until it has a row. A +1
 * weapon, armour or shield needs only `MAGIC_ITEM_LIMITS.minLevel`. Tune it
 * here.
 */
export const MAGIC_ITEM_MIN_LEVEL: Readonly<
  Record<WandId | CasterItemId, number>
> = {
  "wand-of-magic-missiles": 3,
  "wand-of-the-war-mage-plus-1": 3,
  "pearl-of-power": 3,
};

/** A magic item a module hides, as `magicItemProblems` judges it. */
export type HiddenMagicItem = Readonly<{
  /** The placed item's id. */
  id: string;
  /** Its catalogue id: "shortsword-plus-1". */
  catalogue: string;
  /** Its catalogue name: "+1 Shortsword". */
  name: string;
  /** Who may attune it (#537, D2), or false when it needs no attunement. */
  attunement: false | Attunement;
  /** Whether only a spellcaster may attune it, so it may fill the caster slot. */
  casterOnly: boolean;
}>;

/**
 * What is wrong with the magic items a module hides, for a module whose
 * maximum recommended level is `level`: any below `MAGIC_ITEM_LIMITS` or
 * its own minimum level (`MAGIC_ITEM_MIN_LEVEL`), any any class may attune
 * (D2), a second that isn't caster-only when the first isn't either, and
 * any past the two slots (D1). Empty when they may be hidden.
 */
export function magicItemProblems(
  items: readonly HiddenMagicItem[],
  level: number,
): readonly string[] {
  const slots = MAGIC_ITEM_LIMITS.perModule + MAGIC_ITEM_LIMITS.casterSlot;
  let open = MAGIC_ITEM_LIMITS.perModule;
  let caster = MAGIC_ITEM_LIMITS.casterSlot;
  return items.flatMap(
    ({ id, catalogue, name, attunement, casterOnly }, index) => {
      const minimum = Object.hasOwn(MAGIC_ITEM_MIN_LEVEL, catalogue)
        ? MAGIC_ITEM_MIN_LEVEL[catalogue as WandId | CasterItemId]
        : undefined;
      const problems = [
        ...(level < MAGIC_ITEM_LIMITS.minLevel
          ? [
              `${id} is a magic item, but magic items are found only in modules for level ${MAGIC_ITEM_LIMITS.minLevel} and up.`,
            ]
          : minimum !== undefined && level < minimum
            ? [
                `${id} is the ${name}, found only in modules for level ${minimum} and up.`,
              ]
            : []),
        ...(attunement !== false && attunement.by === "anyone"
          ? [
              `${id} needs attunement by anyone, but only an item restricted to a spellcaster or named classes may need attunement.`,
            ]
          : []),
      ];
      // A caster-only item takes the caster slot while it is free, so the
      // open slot stays for an item any class may use.
      if (index >= slots) {
        problems.push(
          `${id} is one magic item too many: a module hides at most ${slots}, one of them caster-only.`,
        );
      } else if (casterOnly && caster > 0) {
        caster -= 1;
      } else if (open > 0) {
        open -= 1;
      } else {
        problems.push(
          `${id} is a second magic item that isn't caster-only: the caster slot takes only an item that requires attunement by a spellcaster or a caster class.`,
        );
      }
      return problems;
    },
  );
}

/** How many times its level's budget a long module (#404, D6) may hold. */
export const LONG_MODULE_BUDGET_FACTOR = 2;

/**
 * The budget for a module whose maximum recommended level is `level`, in
 * copper: `LONG_MODULE_BUDGET_FACTOR` times as much for a long one (#404).
 */
export function treasureBudget(level: number, long = false): number {
  const budget = TREASURE_BUDGETS[level];
  if (budget === undefined) {
    throw new Error(`No treasure budget for level ${level}.`);
  }
  return long ? budget * LONG_MODULE_BUDGET_FACTOR : budget;
}

/** Whether a module whose maximum recommended level is `level` may hide an item of `tier`. */
export function tierAllowed(tier: Tier, level: number): boolean {
  const from = TIER_MIN_LEVEL[tier];
  return from !== undefined && level >= from;
}

export type TradeGoodData = Readonly<{
  category: "gem" | "art object";
  /** In copper pieces. */
  value: number;
}>;

/**
 * Gems and art objects by value. A module names one for each treasure it
 * hides and gives it its own name and description ("Gold Ring"); the
 * catalogue sets what it is worth.
 */
export const TRADE_GOODS = {
  "gem-10gp": { category: "gem", value: 1000 },
  "gem-50gp": { category: "gem", value: 5000 },
  "gem-100gp": { category: "gem", value: 10000 },
  "art-25gp": { category: "art object", value: 2500 },
  "art-250gp": { category: "art object", value: 25000 },
} as const satisfies Record<string, TradeGoodData>;
export type TradeGoodId = keyof typeof TRADE_GOODS;

/** Every gem and art object is common: its value, not its tier, limits it. */
export const TRADE_GOOD_TIER: Tier = "common";

export function isTradeGoodId(value: unknown): value is TradeGoodId {
  return typeof value === "string" && Object.hasOwn(TRADE_GOODS, value);
}

/** What a gem or art object is worth, and what a merchant pays for it, in copper. */
export function tradeGoodValue(id: TradeGoodId): number {
  return TRADE_GOODS[id].value;
}

/**
 * Coin or a gem or art object's value as found under the treasure found
 * setting (#507): `percent` of `copper`, rounded down to the copper and at
 * least 1 cp. A found gem or art object keeps the value it was found with.
 */
export function scaledTreasure(copper: number, percent: number): number {
  return percent === 100
    ? copper
    : Math.max(1, Math.floor((copper * percent) / 100));
}

export type PotionData = Readonly<{
  name: string;
  healing: Readonly<{ dice: number; sides: number; modifier: number }>;
  /** In pounds. */
  weight: number;
  /** In copper pieces. */
  value: number;
  tier: Tier;
}>;

/**
 * SRD 5.2 healing potions. The Potion of Healing costs 50 gp; the Potion of
 * Greater Healing, uncommon, is valued at 200 gp (half an uncommon magic
 * item's 400 gp, as consumables are).
 */
export const POTIONS = {
  "potion-of-healing": {
    name: "Potion of Healing",
    healing: { dice: 2, sides: 4, modifier: 2 },
    weight: POTION_WEIGHT,
    value: 5000,
    tier: "common",
  },
  "potion-of-greater-healing": {
    name: "Potion of Greater Healing",
    healing: { dice: 4, sides: 4, modifier: 4 },
    weight: POTION_WEIGHT,
    value: 20000,
    tier: "uncommon",
  },
} as const satisfies Record<string, PotionData>;
export type PotionId = keyof typeof POTIONS;

export type TreasureTypeData = Readonly<{
  /** The coins it carries: `dice`d`sides` pieces of one coin. */
  coins?: Readonly<{ coin: Coin; dice: number; sides: number }>;
  /** One trinket it carries, a gem or art object chosen by a die. */
  trinkets?: readonly TradeGoodId[];
}>;

/**
 * What a bestiary monster carries, by its treasure type (#240, a house rule
 * the owner chose): undead and beasts carry nothing, goblins and kobolds a
 * few coppers, bandits, hobgoblins and gnolls some silver, a goblin boss or
 * bugbear silver and a trinket, an ogre some gold. An authoring-time roll
 * turns a type into the items an opponent carries; an author may lower or
 * remove what was rolled, but nothing the type couldn't produce validates.
 */
export const TREASURE_TYPES = {
  none: {},
  copper: { coins: { coin: "cp", dice: 3, sides: 6 } },
  silver: { coins: { coin: "sp", dice: 3, sides: 6 } },
  "silver-and-trinket": {
    coins: { coin: "sp", dice: 3, sides: 6 },
    trinkets: ["gem-10gp", "art-25gp"],
  },
  gold: { coins: { coin: "gp", dice: 2, sides: 6 } },
} as const satisfies Record<string, TreasureTypeData>;
export type TreasureTypeId = keyof typeof TREASURE_TYPES;

/** Whether `value` names one of the treasure types. */
export function isTreasureTypeId(value: unknown): value is TreasureTypeId {
  return typeof value === "string" && Object.hasOwn(TREASURE_TYPES, value);
}

/** What one roll of a treasure type gives. */
export type RolledTreasure = Readonly<{
  coins?: Coins;
  trinket?: TradeGoodId;
}>;

/** Rolls a treasure type: its coins' dice, then a die for its trinket. */
export function rollTreasure(
  type: TreasureTypeId,
  random: RandomSource,
): RolledTreasure {
  const { coins, trinkets }: TreasureTypeData = TREASURE_TYPES[type];
  let amount = 0;
  for (let die = 0; coins !== undefined && die < coins.dice; die += 1) {
    amount += random.roll(coins.sides);
  }
  return {
    ...(coins === undefined ? {} : { coins: { [coins.coin]: amount } }),
    ...(trinkets === undefined
      ? {}
      : { trinket: trinkets[random.roll(trinkets.length) - 1] }),
  };
}
