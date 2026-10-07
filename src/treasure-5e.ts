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
 * always, uncommon from level 3, and no rare treasure yet. The budgets and
 * the tier levels are parameter tables, recorded in `docs/character-rules.md`;
 * tune them here.
 */
import {
  POTION_WEIGHT,
  type Coin,
  type Coins,
  type Tier,
} from "./equipment-5e.js";
import type { RandomSource } from "./random.js";

/** What a module's treasure may be worth, by its maximum recommended level, in copper. */
export const TREASURE_BUDGETS: Readonly<Record<number, number>> = {
  1: 15000,
  2: 30000,
  3: 45000,
};

/**
 * The lowest maximum recommended level at which a module may hide an item of
 * each tier. A tier left out is never found in this increment.
 */
export const TIER_MIN_LEVEL: Readonly<Partial<Record<Tier, number>>> = {
  common: 1,
  uncommon: 3,
};

/** The budget for a module whose maximum recommended level is `level`, in copper. */
export function treasureBudget(level: number): number {
  const budget = TREASURE_BUDGETS[level];
  if (budget === undefined) {
    throw new Error(`No treasure budget for level ${level}.`);
  }
  return budget;
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
