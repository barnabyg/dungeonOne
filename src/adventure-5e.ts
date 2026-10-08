/**
 * The 5e adventure module format (format version 24) and its validator.
 *
 * A module declares its recommended levels and difficulty, its rooms and the
 * passages between them, the features to examine, items to take and creatures
 * to talk to in each room, the encounters, and its endings. Each opponent in
 * an encounter names a monster in the bestiary (`bestiary-5e.ts`), optionally
 * with its own name and description, or authors a one-off SRD 5.2 stat block
 * inline. A passage may have a door, stuck (forced open by a check) or
 * locked (opened by its key, or picked or broken open by a check), and a trap,
 * found and disarmed by checks or sprung by going through, with a saving
 * throw against its damage. A creature's topics may need a check, and a
 * creature may be a merchant, with catalogue gear in stock and the minutes
 * each trade takes. A merchant stocks common gear, and uncommon gear only in
 * a module for level 3 and up; no merchant sells rare gear. Each
 * opponent in an encounter has its own name, so the player can target it,
 * and may have a surrender (#238): what it says once it yields to a failed
 * morale saving throw, the things it carries that it hands over when asked,
 * and any XP for sparing it.
 * Treasure, coin and gear are items hidden in a feature or carried by an
 * opponent, so they are only ever found by examining: the feature, or the
 * opponent's body once its fight is won. Coin is authored in gold, silver and
 * copper pieces; gear names a catalogue weapon, armour or shield; treasure
 * names a catalogue gem or art object (`treasure-5e.ts`), which sets its
 * value. Everything findable (coin, gems, art objects, potions and gear) is
 * held to the treasure budget for the module's maximum recommended level,
 * and each item's tier must be allowed at that level (#239). What a bestiary
 * opponent carries must be loot its monster's treasure type could produce
 * (#240): an authoring-time roll (`npm run loot`) writes it in, and an
 * author may lower or remove it. A key is never loot, and an inline
 * opponent has no treasure type, so what it carries is the author's. A room may be an exit, where the player can choose to leave: the
 * adventure then ends in its escape-with-loot ending when the character
 * carries treasure or found coin, and its escape-without-loot ending otherwise. A victory
 * or escape ending may award XP, on top of each won encounter's stat-block XP.
 * An encounter may award XP for sneaking past it unfought (#302), and may let
 * the character sneak up on it again after slipping past it once. An
 * encounter may be lurking (#303): its opponents lie in wait, and may
 * surprise the character as it comes in. An encounter may be
 * reaction-eligible (#304): its reaction authors the options each band of a
 * reaction roll offers, and any XP for an encounter ended peacefully; it may
 * name the opponents who react, and none of its opponents may be mindless.
 *
 * A feature may have a check made when it is first examined (#281). Every
 * authored check (a feature's, a door's force, pick or break, a trap's
 * disarm, a topic's) may grade its outcome into bands, each with words and
 * typed effects: a feature's discovery made, an item hidden in a feature
 * revealed, damage that can defeat the character, or a passage opened or
 * closed (#282). An item hidden in a feature with a check is found only
 * through an item effect, and a hidden passage is a way only once a band
 * opens it. Each essential room, and some exit, must be reachable by a
 * route without a check, or through checks every band of which leaves a way
 * forward, whatever any band may close.
 *
 * A check may author a retry (#284): never (the default), after a cost
 * (damage, or using up a carried tool), or after a changed circumstance
 * (holding an item, a discovery made, an encounter won). Each approach may
 * have circumstances that give it advantage or disadvantage. A tool is a
 * mundane item, such as a rope, that does nothing by itself: a check's
 * circumstance or retry cost names it.
 *
 * Validation names the first problem it finds. A module in any other format
 * version is refused with a message naming the file.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoundedJson } from "./bounded-json.js";
import { BANDS, isSuccess, type Band, type CheckSpec } from "./checks-5e.js";
import type { Combatant, DamageDefenses, DamageType } from "./encounter-5e.js";
import {
  COIN_VALUES,
  coinsInCopper,
  formatCoins,
  isCatalogueId,
  itemName,
  itemPrice,
  itemTier,
  TREASURE_WEIGHT,
  type Coin,
  type Coins,
  type CatalogueId,
  type Tier,
} from "./equipment-5e.js";
import {
  isTradeGoodId,
  POTIONS,
  TREASURE_TYPES,
  type TreasureTypeData,
  type TreasureTypeId,
  tierAllowed,
  TRADE_GOOD_TIER,
  tradeGoodValue,
  treasureBudget,
  TIER_MIN_LEVEL,
  type PotionId,
  type TradeGoodId,
} from "./treasure-5e.js";
import { MAX_LEVEL, proficiencyBonus } from "./character-5e.js";
import {
  ABILITIES,
  SKILLS,
  type Ability,
  type SkillId,
  type Level,
} from "./class-5e.js";
import {
  distinct,
  exactKeys,
  fail,
  id,
  integer,
  isRecord,
  knownKeys,
  list,
  ShapeError,
  text,
  unique,
} from "./json-shape.js";
import {
  damageType,
  loadBuiltInFifthBestiary,
  statBlock,
  type FifthBestiary,
  type MonsterTrait,
  type StatBlock,
} from "./bestiary-5e.js";

import {
  AUTHORED_REACTION_BANDS,
  REACTION_OPTIONS,
  type AuthoredReactionBand,
  type ReactionOption,
} from "./reaction-5e.js";

export type { StatBlock, StatBlockAttack } from "./bestiary-5e.js";

export const FIFTH_ADVENTURE_FORMAT = 24;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
/** The most opponents one encounter may have. */
export const MAX_OPPONENTS = 8;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type FifthOpponent = Readonly<{
  id: string;
  name: string;
  description: string;
  statBlock: StatBlock;
  /**
   * A boss is exempt from the balance gate's one-hit-kill cap; every other
   * opponent is ordinary.
   */
  boss?: true;
  /**
   * What it does when it fails morale (#238): it surrenders instead of
   * fleeing, and becomes a creature to talk to once its fight is won.
   */
  surrender?: FifthSurrender;
  /**
   * It reacts to the character (#304): only those marked react, or, when
   * none is, every opponent of a reaction-eligible encounter.
   */
  reacts?: true;
}>;

/**
 * A surrendered opponent as a creature: how it looks once it has yielded, its
 * topics, and the XP for sparing it, credited on surviving completion.
 */
export type FifthSurrender = Readonly<{
  description: string;
  topics: readonly FifthTopic[];
  xp?: number;
}>;

export type FifthEncounter = Readonly<{
  id: string;
  opponents: readonly FifthOpponent[];
  /** Winning ends the adventure here; without one, exploring goes on. */
  victoryEndingId?: string;
  defeatEndingId: string;
  /**
   * XP for sneaking past the fight unfought (#302), credited once on
   * surviving completion; none when left out.
   */
  bypassXp?: number;
  /**
   * After slipping past it, the character may sneak up on it again, with a
   * fresh Stealth check (#302). Without this, coming back starts the fight.
   */
  sneakAgain?: true;
  /**
   * Its opponents lie in wait (#303): as the character comes in, they roll
   * Stealth against its passive Perception, and surprise it if they win.
   */
  lurking?: true;
  /**
   * Reaction-eligible (#304): when its fight would begin with no one
   * surprised, a reaction roll picks a band, and the band offers these
   * options. Off when left out.
   */
  reaction?: FifthReaction;
}>;

/**
 * A reaction-eligible encounter's reaction (#304): the options each band but
 * hostile (which always fights) offers, with optional words for it, and the
 * XP for ending the encounter peacefully, credited once on surviving
 * completion; none when left out.
 */
export type FifthReaction = Readonly<{
  bands: Readonly<
    Record<
      AuthoredReactionBand,
      Readonly<{ options: readonly ReactionOption[]; text?: string }>
    >
  >;
  peacefulXp?: number;
}>;

/**
 * Something in a room to examine. Examining it makes its discovery; one with
 * a check (#281) instead makes the check, once, whose bands decide what it
 * reveals.
 */
export type FifthFeature = Readonly<{
  id: string;
  name: string;
  description: string;
  discovery?: string;
  check?: AuthoredCheck;
}>;

/**
 * One effect of a check's band (#281): a feature's discovery made, an item
 * hidden in a feature revealed (found once per character, like other
 * finds), damage of a type, which can defeat the character, or a passage
 * opened (a hidden one becomes a way) or closed for the rest of the
 * adventure (#282).
 */
export type CheckEffect = Readonly<
  | { type: "discovery"; feature: string }
  | { type: "item"; item: string }
  | { type: "open" | "close"; passage: string }
  | {
      type: "damage";
      dice: number;
      sides: number;
      modifier: number;
      damageType: DamageType;
      /** Where the adventure ends if the damage drops the character. */
      defeatEndingId: string;
    }
>;

/** What one band of an authored check does: its words and its effects. */
export type CheckBand = Readonly<{
  text?: string;
  effects?: readonly CheckEffect[];
}>;

/**
 * A circumstance (#284): the character holds an item, has made a feature's
 * discovery, or has won an encounter; with `not`, while it hasn't. `name`
 * is how a check card and the action bar name it.
 */
export type Circumstance = Readonly<
  (
    | { type: "holds"; item: string }
    | { type: "discovered"; feature: string }
    | { type: "won"; encounter: string }
  ) & { name: string; not?: true }
>;

/**
 * One approach to a check: a skill or ability against a DC, with the
 * circumstances that give it advantage or disadvantage (#284).
 */
export type AuthoredApproach = CheckSpec &
  Readonly<{
    advantage?: readonly Circumstance[];
    disadvantage?: readonly Circumstance[];
  }>;

/**
 * What another try at a failed check needs (#284): a cost paid before the
 * roll (damage, or a carried tool used up), or a changed circumstance (one
 * that didn't hold when the check was last made). Without one, a check is
 * never tried again.
 */
export type RetryPolicy = Readonly<
  { cost: RetryCost; after?: never } | { after: Circumstance; cost?: never }
>;

/** What a retry costs: damage, or a carried tool used up. */
export type RetryCost = Readonly<
  | { type: "item"; item: string }
  | {
      type: "damage";
      dice: number;
      sides: number;
      modifier: number;
      damageType: DamageType;
      defeatEndingId: string;
    }
>;

/**
 * An authored check (#281): its approach, a skill or an ability against a
 * DC, and the bands its outcome is graded into. Any band may be left out;
 * an unauthored failure or success by 5 or more falls back to plain failure
 * or success, and an unauthored plain band does nothing beyond the site's
 * own outcome. It may author a retry (#284).
 */
export type AuthoredCheck = (
  | AuthoredApproach
  /**
   * Alternative approaches to one obstacle (#283): 2–4 skills or abilities,
   * each with its own DC. The bands belong to the obstacle.
   */
  | Readonly<{
      approaches: readonly AuthoredApproach[];
      skill?: never;
      ability?: never;
      dc?: never;
      advantage?: never;
      disadvantage?: never;
    }>
) &
  Readonly<{
    bands?: Readonly<Partial<Record<Band, CheckBand>>>;
    retry?: RetryPolicy;
  }>;

/** The approaches an authored check can be made with, one or several. */
export function approachesOf(
  check: AuthoredCheck,
): readonly AuthoredApproach[] {
  if ("approaches" in check && check.approaches !== undefined) {
    return check.approaches;
  }
  const circumstances = {
    ...(check.advantage === undefined ? {} : { advantage: check.advantage }),
    ...(check.disadvantage === undefined
      ? {}
      : { disadvantage: check.disadvantage }),
  };
  return [
    check.skill === undefined
      ? { ability: check.ability!, dc: check.dc!, ...circumstances }
      : { skill: check.skill, dc: check.dc!, ...circumstances },
  ];
}

/** A band's effects, none when it authors only words. */
export const effectsOf = (outcome: CheckBand | undefined) =>
  outcome?.effects ?? [];

/**
 * The band whose outcome applies to a rolled band: a failure or success by
 * 5 or more that the check doesn't author counts as plain failure or
 * success.
 */
export function authoredBand(check: AuthoredCheck, rolled: Band): Band {
  if (check.bands?.[rolled] !== undefined) {
    return rolled;
  }
  return rolled === "failure-by-5"
    ? "failure"
    : rolled === "success-by-5"
      ? "success"
      : rolled;
}

/** Where an authored check is made, by the id of the thing it is made on. */
export type AuthoredSite = Readonly<{
  kind: "examine" | "force" | "pick" | "break" | "disarm" | "talk";
  id: string;
  check: AuthoredCheck;
}>;

/**
 * Every authored check in a module (#281): each feature's, each door's
 * force, pick and break, each trap's disarm, and each topic's, a
 * surrender's included.
 */
export function authoredChecks(
  adventure: Pick<FifthAdventure, "rooms" | "passages" | "encounters">,
): readonly AuthoredSite[] {
  const topicChecks = (topics: readonly FifthTopic[]): AuthoredSite[] =>
    topics.flatMap(({ id, check }) =>
      check === undefined ? [] : [{ kind: "talk" as const, id, check }],
    );
  return [
    ...adventure.rooms.flatMap(({ features, creatures }) => [
      ...features.flatMap(({ id, check }) =>
        check === undefined ? [] : [{ kind: "examine" as const, id, check }],
      ),
      ...creatures.flatMap(({ topics }) => topicChecks(topics)),
    ]),
    ...adventure.encounters.flatMap(({ opponents }) =>
      opponents.flatMap(({ surrender }) =>
        topicChecks(surrender?.topics ?? []),
      ),
    ),
    ...adventure.passages.flatMap(({ door, trap }) => [
      ...(["force", "pick", "break"] as const).flatMap((kind) => {
        const check = door?.[kind];
        return check === undefined ? [] : [{ kind, id: door!.id, check }];
      }),
      ...(trap === undefined
        ? []
        : [{ kind: "disarm" as const, id: trap.id, check: trap.disarm }]),
    ]),
  ];
}

/**
 * What each kind of item does: the SRD 5.2 healing potions heal, a key
 * opens the locked doors that name it, treasure is kept on surviving, coin
 * goes into the purse as it is taken, and gear (a catalogue weapon, armour or
 * shield) is stowed as it is taken, ready to equip, or, for a bundle of
 * arrows or bolts, adds 20 to what the character holds (#230). A tool
 * (#284), such as a rope, does nothing by itself: a check's circumstance or
 * retry cost names it, and it is not kept after the adventure. A carried
 * item weighs its kind's `weight` in pounds (#224); coin and gear weigh what
 * the purse, the gear and the ammunition they become weigh.
 */
export const ITEM_KINDS = {
  ...POTIONS,
  key: { weight: 0 },
  treasure: { weight: TREASURE_WEIGHT },
  coin: { weight: 0 },
  gear: { weight: 0 },
  tool: { weight: 0 },
} as const;
export type ItemKind = keyof typeof ITEM_KINDS;
/** The kinds that are found once per character: never there to find again. */
export const FOUND_ONCE_KINDS: readonly ItemKind[] = [
  "treasure",
  "coin",
  "gear",
];
/**
 * The kinds that are loot: carrying treasure, or coin found here, out of an
 * exit is escaping with loot. Gear is equipment, not loot.
 */
export const LOOT_KINDS: readonly ItemKind[] = ["treasure", "coin"];
/** The most of each coin one item may hold. */
const MAX_COINS = 100000;

/**
 * An item placed in a room. One hidden in a feature is found by examining it;
 * one carried by an opponent, by searching its body once the fight is won.
 */
export type FifthItem = Readonly<{
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  /** How much coin it holds; present exactly on coin. */
  coins?: Coins;
  /**
   * The catalogue weapon, armour, shield or bundle of ammunition it is;
   * present exactly on gear.
   */
  gear?: CatalogueId;
  /** The catalogue gem or art object it is; present exactly on treasure. */
  treasure?: TradeGoodId;
  /** The feature it is hidden in, or the opponent carrying it. */
  hiddenIn?: string;
}>;

/** Something to ask a creature about; a check, if any, decides its answer. */
export type FifthTopic = Readonly<{
  id: string;
  name: string;
  /** What the creature says, after a passed check when there is one. */
  reply: string;
  check?: AuthoredCheck;
  /** What it says after a failed check; present exactly with `check`. */
  failure?: string;
  /**
   * Items it hands over with its reply (after a passed check, when there is
   * one): only a surrendered opponent gives, and only what it carries (#238).
   */
  gives?: readonly string[];
}>;

/**
 * What a merchant sells, any number of each, at catalogue prices, and the
 * minutes each purchase or sale takes. It buys any catalogue gear at half
 * price, and ammunition by the bundle of 20 (#230).
 */
export type FifthMerchant = Readonly<{
  stock: readonly CatalogueId[];
  minutes: number;
}>;

/**
 * A creature the character can talk to, about its authored topics only, and
 * trade with when it is a merchant.
 */
export type FifthCreature = Readonly<{
  id: string;
  name: string;
  description: string;
  topics: readonly FifthTopic[];
  merchant?: FifthMerchant;
}>;

/** The most minutes one trade may take. */
const MAX_TRADE_MINUTES = 60;

export type FifthRoom = Readonly<{
  id: string;
  name: string;
  description: string;
  /** The fight that begins when the character enters. */
  encounterId?: string;
  /** The character may leave the adventure from here. */
  exit?: true;
  features: readonly FifthFeature[];
  items: readonly FifthItem[];
  creatures: readonly FifthCreature[];
}>;

/**
 * A shut door in a passage. A stuck door is forced open; a locked one opens
 * with its key, or is picked or broken open. Each check is tried once.
 */
export type FifthDoor = Readonly<{
  id: string;
  name: string;
  description: string;
  state: "stuck" | "locked";
  force?: AuthoredCheck;
  pick?: AuthoredCheck;
  break?: AuthoredCheck;
  keyItemId?: string;
}>;

/**
 * A hidden trap in a passage: found by a check (searching either room),
 * disarmed by a check once found, or sprung by going through while armed,
 * with a saving throw for half damage. The search is one roll for the whole
 * room, so `find` is a DC and never graded; `disarm` may be.
 */
export type FifthTrap = Readonly<{
  id: string;
  name: string;
  description: string;
  find: CheckSpec;
  disarm: AuthoredCheck;
  trigger: string;
  save: Readonly<{ ability: Ability; dc: number }>;
  damage: Readonly<{
    dice: number;
    sides: number;
    modifier: number;
    type: DamageType;
  }>;
  /** Where the adventure ends if the trap's damage drops the character. */
  defeatEndingId: string;
}>;

/**
 * A two-way way between two rooms. A hidden one (#282) is no way at all
 * until a check's band opens it.
 */
export type FifthPassage = Readonly<{
  id: string;
  between: readonly [string, string];
  description: string;
  hidden?: true;
  door?: FifthDoor;
  trap?: FifthTrap;
}>;

export const ENDING_KINDS = [
  "victory",
  "escape-with-loot",
  "escape-without-loot",
  "defeat",
] as const;
export type EndingKind = (typeof ENDING_KINDS)[number];

export type FifthEnding = Readonly<{
  id: string;
  kind: EndingKind;
  title: string;
  text: string;
  /** XP for reaching this ending; never on a defeat. */
  xp?: number;
}>;

export type FifthAdventure = Readonly<{
  kind: "dungeon-one-5e-adventure";
  formatVersion: typeof FIFTH_ADVENTURE_FORMAT;
  id: string;
  title: string;
  objective: string;
  recommendedLevels: Readonly<{ min: number; max: number }>;
  difficulty: Difficulty;
  startRoomId: string;
  rooms: readonly FifthRoom[];
  passages: readonly FifthPassage[];
  encounters: readonly FifthEncounter[];
  endings: readonly FifthEnding[];
}>;

/**
 * What a placed item is worth toward the treasure budget, in copper: coin's
 * amount, a gem or art object's value, a potion's value and gear's price.
 * A key is worth nothing.
 */
export function itemValue(item: FifthItem): number {
  if (item.coins !== undefined) {
    return coinsInCopper(item.coins);
  }
  if (item.treasure !== undefined) {
    return tradeGoodValue(item.treasure);
  }
  if (item.gear !== undefined) {
    return itemPrice(item.gear);
  }
  return isPotionKind(item.kind) ? POTIONS[item.kind].value : 0;
}

/** Whether an item kind is one of the catalogue's potions. */
function isPotionKind(kind: ItemKind): kind is PotionId {
  return Object.hasOwn(POTIONS, kind);
}

/** A placed item as the validator names it: its catalogue gear or potion, or its own name. */
function catalogueName(item: FifthItem): string {
  return item.gear !== undefined
    ? itemName(item.gear).toLowerCase()
    : isPotionKind(item.kind)
      ? POTIONS[item.kind].name
      : item.name;
}

/** A placed item's availability tier; a key and coin have none. */
function findableTier(item: FifthItem): Tier | undefined {
  if (item.gear !== undefined) {
    return itemTier(item.gear);
  }
  if (item.treasure !== undefined) {
    return TRADE_GOOD_TIER;
  }
  return isPotionKind(item.kind) ? POTIONS[item.kind].tier : undefined;
}

/**
 * Everything a module hides to find, in copper (#239): its coin, gems, art
 * objects, potions and gear. The validator holds it to the budget for the
 * module's maximum recommended level.
 */
export function findableValue(
  adventure: Pick<FifthAdventure, "rooms">,
): number {
  return adventure.rooms
    .flatMap(({ items }) => items)
    .reduce((sum, item) => sum + itemValue(item), 0);
}

/** What a treasure type gives, for a problem: "up to 18 cp and one of gem-10gp". */
function treasureTypeGives(type: TreasureTypeId): string {
  const { coins, trinkets }: TreasureTypeData = TREASURE_TYPES[type];
  const parts = [
    ...(coins === undefined
      ? []
      : [`up to ${coins.dice * coins.sides} ${coins.coin}`]),
    ...(trinkets === undefined ? [] : [`one of ${trinkets.join(", ")}`]),
  ];
  return parts.length === 0 ? "nothing" : `only ${parts.join(" and ")}`;
}

/**
 * Checks what an opponent carries against its treasure type (#240): coin in
 * the type's coin, no more than its dice can roll, and at most one of its
 * trinkets. A key is not loot. A problem throws a `ShapeError` naming `who`.
 */
function carriedLoot(
  carried: readonly FifthItem[],
  type: TreasureTypeId,
  who: string,
): void {
  const { coins, trinkets }: TreasureTypeData = TREASURE_TYPES[type];
  const refuse: (what: string) => never = (what) =>
    fail(
      `${who} carries ${what}, but its treasure type ${type} gives ${treasureTypeGives(type)}.`,
    );
  let amount = 0;
  let found = 0;
  for (const item of carried) {
    // A key or a tool (#284) is not loot.
    if (item.kind === "key" || item.kind === "tool") {
      continue;
    }
    if (item.coins !== undefined) {
      const held = Object.entries(item.coins).filter(([, count]) => count > 0);
      if (coins === undefined || held.some(([coin]) => coin !== coins.coin)) {
        refuse(
          `${item.name} (${held.map(([coin, count]) => `${count} ${coin}`).join(" ")})`,
        );
      }
      amount += item.coins[coins.coin] ?? 0;
    } else if (item.treasure !== undefined) {
      if (!(trinkets ?? []).includes(item.treasure)) {
        refuse(`${item.name} (${item.treasure})`);
      }
      found += 1;
    } else {
      refuse(item.name);
    }
  }
  if (coins !== undefined && amount > coins.dice * coins.sides) {
    refuse(`${amount} ${coins.coin}`);
  }
  if (found > 1) {
    refuse(`${found} trinkets`);
  }
}

/** An amount of coin: some gold, silver or copper pieces, at least one. */
function coins(value: unknown, where: string): Coins {
  const denominations = Object.keys(COIN_VALUES) as Coin[];
  if (
    !isRecord(value) ||
    !Object.keys(value).every((key) => denominations.includes(key as Coin))
  ) {
    fail(`${where} may have only ${denominations.join(", ")}.`);
  }
  const amount = value;
  for (const coin of denominations) {
    if (amount[coin] !== undefined) {
      integer(amount[coin], `${where} ${coin}`, 0, MAX_COINS);
    }
  }
  if (!denominations.some((coin) => ((amount[coin] as number) ?? 0) > 0)) {
    fail(`${where} must hold at least one coin.`);
  }
  return Object.fromEntries(
    denominations.flatMap((coin) =>
      amount[coin] === undefined ? [] : [[coin, amount[coin] as number]],
    ),
  );
}

function ability(value: unknown, where: string): Ability {
  if (!(ABILITIES as readonly unknown[]).includes(value)) {
    fail(`${where} must be an ability.`);
  }
  return value as Ability;
}

/** The most circumstances one approach's advantage or disadvantage may name. */
const MAX_CIRCUMSTANCES = 4;
const CIRCUMSTANCE_TYPES = ["holds", "discovered", "won"] as const;

/**
 * A circumstance (#284): `{ "type": "holds", "item" }`, `{ "type":
 * "discovered", "feature" }` or `{ "type": "won", "encounter" }`, each with
 * its `name` and optional `not: true`. What it names is checked once the
 * whole module is read.
 */
function circumstance(value: unknown, where: string): Circumstance {
  const type = isRecord(value) ? value.type : undefined;
  const target = {
    holds: "item",
    discovered: "feature",
    won: "encounter",
  } as const;
  if (!(CIRCUMSTANCE_TYPES as readonly unknown[]).includes(type)) {
    fail(`${where} type must be ${CIRCUMSTANCE_TYPES.join(", ")}.`);
  }
  const kind = type as (typeof CIRCUMSTANCE_TYPES)[number];
  const raw = knownKeys(value, ["type", target[kind], "name"], ["not"], where);
  if (raw.not !== undefined && raw.not !== true) {
    fail(`${where} not must be true when given.`);
  }
  const named = id(raw[target[kind]], `${where} ${target[kind]}`);
  return {
    ...(kind === "holds"
      ? { type: kind, item: named }
      : kind === "discovered"
        ? { type: kind, feature: named }
        : { type: kind, encounter: named }),
    name: text(raw.name, `${where} name`, 60),
    ...(raw.not === true ? { not: true as const } : {}),
  };
}

/** An approach's advantage or disadvantage: 1–4 circumstances. */
function circumstances(value: unknown, where: string): readonly Circumstance[] {
  return list(value, where, MAX_CIRCUMSTANCES).map((entry, index) =>
    circumstance(entry, `${where} ${index + 1}`),
  );
}

/**
 * A check's approach: `{ skill, dc }` or `{ ability, dc }`, each with
 * optional `advantage` and `disadvantage` circumstances (#284), unless it
 * is a trap's find, which a room's one search rolls.
 */
function approach(
  value: unknown,
  where: string,
  circumstanced = true,
): AuthoredApproach {
  const skilled = isRecord(value) && "skill" in value;
  const raw = knownKeys(
    value,
    [skilled ? "skill" : "ability", "dc"],
    circumstanced ? ["advantage", "disadvantage"] : [],
    where,
  );
  const dc = integer(raw.dc, `${where} dc`, 5, 30);
  const modes = {
    ...(raw.advantage === undefined
      ? {}
      : { advantage: circumstances(raw.advantage, `${where} advantage`) }),
    ...(raw.disadvantage === undefined
      ? {}
      : {
          disadvantage: circumstances(
            raw.disadvantage,
            `${where} disadvantage`,
          ),
        }),
  };
  if (skilled) {
    if (typeof raw.skill !== "string" || !Object.hasOwn(SKILLS, raw.skill)) {
      fail(`${where} skill must be one of ${Object.keys(SKILLS).join(", ")}.`);
    }
    return { skill: raw.skill as SkillId, dc, ...modes };
  }
  return { ability: ability(raw.ability, `${where} ability`), dc, ...modes };
}

/** A damage effect's or a damage cost's fields (#281, #284). */
function damageFields(raw: Record<string, unknown>, where: string) {
  return {
    dice: integer(raw.dice, `${where} dice`, 1, 10),
    sides: integer(raw.sides, `${where} sides`, 2, 12),
    modifier: integer(raw.modifier, `${where} modifier`, -5, 20),
    damageType: damageType(raw.damageType, `${where} damageType`),
    defeatEndingId: id(raw.defeatEndingId, `${where} defeatEndingId`),
  };
}
const DAMAGE_KEYS = [
  "type",
  "dice",
  "sides",
  "modifier",
  "damageType",
  "defeatEndingId",
];

/**
 * A check's retry (#284): `{ "cost": { "type": "damage", ... } }`, `{
 * "cost": { "type": "item", "item" } }` or `{ "after": circumstance }`.
 */
function retry(value: unknown, where: string): RetryPolicy {
  if (isRecord(value) && "after" in value) {
    const raw = exactKeys(value, ["after"], where);
    const after = circumstance(raw.after, `${where} after`);
    if (after.not === true) {
      fail(
        `${where} after can't be a circumstance with not: one that no longer holds never changes back.`,
      );
    }
    return { after };
  }
  const raw = exactKeys(value, ["cost"], where);
  const on = `${where} cost`;
  const type = isRecord(raw.cost) ? raw.cost.type : undefined;
  if (type === "item") {
    const cost = exactKeys(raw.cost, ["type", "item"], on);
    return { cost: { type, item: id(cost.item, `${on} item`) } };
  }
  if (type === "damage") {
    return {
      cost: { type, ...damageFields(exactKeys(raw.cost, DAMAGE_KEYS, on), on) },
    };
  }
  return fail(`${on} type must be item or damage.`);
}

/** The most effects one band may have. */
const MAX_EFFECTS = 6;

/**
 * A band's effect (#281). What it names (a feature, an item or an ending)
 * is checked once the whole module is read.
 */
function effect(value: unknown, where: string): CheckEffect {
  const type = isRecord(value) ? value.type : undefined;
  switch (type) {
    case "discovery": {
      const raw = exactKeys(value, ["type", "feature"], where);
      return { type, feature: id(raw.feature, `${where} feature`) };
    }
    case "item": {
      const raw = exactKeys(value, ["type", "item"], where);
      return { type, item: id(raw.item, `${where} item`) };
    }
    case "open":
    case "close": {
      const raw = exactKeys(value, ["type", "passage"], where);
      return { type, passage: id(raw.passage, `${where} passage`) };
    }
    case "damage":
      return {
        type,
        ...damageFields(exactKeys(value, DAMAGE_KEYS, where), where),
      };
    default:
      return fail(`${where} type must be ${EFFECT_TYPES.join(", ")}.`);
  }
}
const EFFECT_TYPES = ["discovery", "item", "damage", "open", "close"] as const;

/** The most approaches one check may offer (#283). */
const MAX_APPROACHES = 4;

/**
 * A check's approach or approaches: `{ skill, dc }`, `{ ability, dc }`, or
 * `{ approaches: [...] }`, 2–4 of those, each with a different skill or
 * ability (#283).
 */
function approaches(
  spec: Record<string, unknown>,
  where: string,
): AuthoredCheck {
  if (!("approaches" in spec)) {
    return approach(spec, where);
  }
  const raw = exactKeys(spec, ["approaches"], where);
  const offered = list(
    raw.approaches,
    `${where} approaches`,
    MAX_APPROACHES,
    2,
  ).map((entry, index) => approach(entry, `${where} approach ${index + 1}`));
  distinct(
    offered,
    (entry) => entry.skill ?? entry.ability,
    (entry) =>
      `${where} offers ${entry.skill ?? entry.ability} twice; each approach needs its own skill or ability.`,
  );
  return { approaches: offered };
}

/**
 * An authored check: its approaches (see `approaches`), with optional
 * `bands` (#281), each with optional `text` and `effects`, and an optional
 * `retry` (#284).
 */
function check(value: unknown, where: string): AuthoredCheck {
  const { retry: again, ...rest } = isRecord(value) ? value : { value };
  const made = gradedCheck(rest, where);
  return again === undefined
    ? made
    : { ...made, retry: retry(again, `${where} retry`) };
}

/** A check's approaches and its optional `bands` (#281). */
function gradedCheck(
  value: Record<string, unknown>,
  where: string,
): AuthoredCheck {
  const { bands, ...spec } = value;
  if (bands === undefined) {
    return approaches(spec, where);
  }
  const graded = knownKeys(bands, [], BANDS, `${where} bands`);
  if (Object.keys(graded).length === 0) {
    fail(`${where} bands must author at least one band.`);
  }
  return {
    ...approaches(spec, where),
    bands: Object.fromEntries(
      BANDS.flatMap((band) => {
        if (graded[band] === undefined) {
          return [];
        }
        const on = `${where} ${band} band`;
        const raw = knownKeys(graded[band], [], ["text", "effects"], on);
        if (raw.text === undefined && raw.effects === undefined) {
          fail(`${on} needs text or effects.`);
        }
        return [
          [
            band,
            {
              ...(raw.text === undefined
                ? {}
                : { text: text(raw.text, `${on} text`) }),
              ...(raw.effects === undefined
                ? {}
                : {
                    effects: list(
                      raw.effects,
                      `${on} effects`,
                      MAX_EFFECTS,
                    ).map((entry, index) =>
                      effect(entry, `${on} effect ${index + 1}`),
                    ),
                  }),
            },
          ],
        ];
      }),
    ),
  };
}

/** How an authored check's site is named in a problem. */
function siteLabel({ kind, id: siteId }: Omit<AuthoredSite, "check">): string {
  switch (kind) {
    case "examine":
      return `feature ${siteId} check`;
    case "talk":
      return `topic ${siteId} check`;
    case "disarm":
      return `trap ${siteId} disarm`;
    default:
      return `door ${siteId} ${kind}`;
  }
}

/**
 * The lowest and highest totals an approach can make for a character of
 * `level` or below: a natural 1 at the lowest ability modifier (−4, a score
 * of 3), and a natural 20 at the highest (+5), plus the proficiency bonus
 * for a skill. The bands between them are the ones the validator counts
 * reachable, and the balance harness's always-fail and always-succeed
 * check policies (#285) make every check at one end.
 */
export function extremeTotals(
  spec: CheckSpec,
  level: number,
): readonly [number, number] {
  const proficiency = proficiencyBonus(level as Level);
  return [1 - 4, 20 + 5 + (spec.skill === undefined ? 0 : proficiency)];
}

/** Whether some character of `level` or below can roll `band` on `spec`. */
function bandReachable(band: Band, spec: CheckSpec, level: number): boolean {
  const [lowest, highest] = extremeTotals(spec, level);
  switch (band) {
    case "failure-by-5":
      return lowest <= spec.dc - 5;
    case "failure":
      return lowest < spec.dc;
    case "success":
      return highest >= spec.dc;
    case "success-by-5":
      return highest >= spec.dc + 5;
  }
}

/**
 * A creature's topics, each optionally with a check and its failure words;
 * with `gifts`, each may also give items, by id (#238).
 */
function topics(
  value: unknown,
  at: string,
  gifts = false,
): readonly FifthTopic[] {
  const parsed = list(value, `${at} topics`, 12).map((rawTopic, index) => {
    const on = `${at} topic ${index + 1}`;
    const topic = knownKeys(
      rawTopic,
      ["id", "name", "reply"],
      gifts ? ["check", "failure", "gives"] : ["check", "failure"],
      on,
    );
    const topicId = id(topic.id, `${on} id`);
    if ((topic.check === undefined) !== (topic.failure === undefined)) {
      fail(
        topic.check === undefined
          ? `topic ${topicId} has a failure but no check.`
          : `topic ${topicId} has a check but no failure.`,
      );
    }
    return {
      id: topicId,
      name: text(topic.name, `${on} name`, 60),
      reply: text(topic.reply, `${on} reply`),
      ...(topic.check === undefined
        ? {}
        : {
            check: check(topic.check, `${on} check`),
            failure: text(topic.failure, `${on} failure`),
          }),
      ...(topic.gives === undefined
        ? {}
        : {
            gives: list(topic.gives, `${on} gives`, 12).map((given, number) =>
              id(given, `${on} gives ${number + 1}`),
            ),
          }),
    };
  });
  // The player asks about topics by name, in any case.
  distinct(
    parsed,
    ({ name }) => name.toLowerCase(),
    ({ name }) => `${at} has two topics named ${name}.`,
  );
  return parsed;
}

/**
 * Validates a decoded module against the bestiary its opponents name,
 * rejecting unknown references and missing endings. Each opponent that names
 * a bestiary monster gets that monster's stat block, and its name and
 * description unless the module gives its own.
 */
export function validateFifthAdventure(
  value: unknown,
  bestiary: FifthBestiary,
): FifthAdventure {
  try {
    return validateModule(value, bestiary);
  } catch (error) {
    if (error instanceof ShapeError) {
      throw new Error(`Invalid adventure module: ${error.message}`);
    }
    throw error;
  }
}

/**
 * A reaction-eligible encounter's reaction (#304): each band but hostile
 * authors 1–2 distinct options and optional words; hostile always fights,
 * so it authors none.
 */
function reactionOf(value: unknown, where: string): FifthReaction {
  const raw = knownKeys(value, ["bands"], ["peacefulXp"], where);
  if (isRecord(raw.bands) && "hostile" in raw.bands) {
    fail(`${where} band hostile always fights, so it authors no options.`);
  }
  const bands = knownKeys(
    raw.bands,
    AUTHORED_REACTION_BANDS,
    [],
    `${where} bands`,
  );
  const authored = (band: AuthoredReactionBand) => {
    const on = `${where} band ${band}`;
    const entry = knownKeys(bands[band], ["options"], ["text"], on);
    if (Array.isArray(entry.options) && entry.options.length === 0) {
      fail(`${on} authors no option: give it at least one.`);
    }
    const options = list(
      entry.options,
      `${on} options`,
      REACTION_OPTIONS.length,
    ).map((option) => {
      if (!REACTION_OPTIONS.includes(option as ReactionOption)) {
        fail(
          `${on} option ${String(option)} is not one of ${REACTION_OPTIONS.join(", ")}.`,
        );
      }
      return option as ReactionOption;
    });
    distinct(
      options,
      (option) => option,
      (option) => `${on} offers ${option} twice.`,
    );
    return {
      options,
      ...(entry.text === undefined
        ? {}
        : { text: text(entry.text, `${on} text`) }),
    };
  };
  return {
    bands: {
      unfriendly: authored("unfriendly"),
      uncertain: authored("uncertain"),
      indifferent: authored("indifferent"),
      friendly: authored("friendly"),
    },
    ...(raw.peacefulXp === undefined
      ? {}
      : {
          peacefulXp: integer(raw.peacefulXp, `${where} peacefulXp`, 1, 10000),
        }),
  };
}

function validateModule(
  value: unknown,
  bestiary: FifthBestiary,
): FifthAdventure {
  if (!isRecord(value) || value.kind !== "dungeon-one-5e-adventure") {
    fail("not a 5e adventure module.");
  }
  if (value.formatVersion !== FIFTH_ADVENTURE_FORMAT) {
    fail(
      `format version ${String(value.formatVersion)} is not ${FIFTH_ADVENTURE_FORMAT}.`,
    );
  }
  const module = exactKeys(
    value,
    [
      "kind",
      "formatVersion",
      "id",
      "title",
      "objective",
      "recommendedLevels",
      "difficulty",
      "startRoomId",
      "rooms",
      "passages",
      "encounters",
      "endings",
    ],
    "the module",
  );
  const moduleId = id(module.id, "id");
  const levels = exactKeys(
    module.recommendedLevels,
    ["min", "max"],
    "recommendedLevels",
  );
  const min = integer(levels.min, "recommendedLevels min", 1, MAX_LEVEL);
  const max = integer(levels.max, "recommendedLevels max", min, MAX_LEVEL);
  if (!DIFFICULTIES.includes(module.difficulty as Difficulty)) {
    fail("difficulty must be easy, medium or hard.");
  }
  const endings = list(module.endings, "endings", 20).map((entry, index) => {
    const where = `ending ${index + 1}`;
    const ending = knownKeys(
      entry,
      ["id", "kind", "title", "text"],
      ["xp"],
      where,
    );
    if (!(ENDING_KINDS as readonly unknown[]).includes(ending.kind)) {
      fail(`${where} kind must be ${ENDING_KINDS.join(", ")}.`);
    }
    if (ending.kind === "defeat" && ending.xp !== undefined) {
      fail(`${where}: a defeat ending awards no XP.`);
    }
    return {
      id: id(ending.id, `${where} id`),
      kind: ending.kind as EndingKind,
      title: text(ending.title, `${where} title`, 80),
      text: text(ending.text, `${where} text`),
      ...(ending.xp === undefined
        ? {}
        : { xp: integer(ending.xp, `${where} xp`, 1, 10000) }),
    };
  });
  unique(endings, "ending");
  if (!endings.some(({ kind }) => kind !== "defeat")) {
    fail("missing a victory or escape ending.");
  }
  for (const kind of ["escape-with-loot", "escape-without-loot"] as const) {
    if (endings.filter((ending) => ending.kind === kind).length > 1) {
      fail(`more than one ${kind} ending.`);
    }
  }
  const ending = (
    endingId: unknown,
    kind: FifthEnding["kind"],
    where: string,
  ) => {
    const found = endings.find(({ id: candidate }) => candidate === endingId);
    if (found === undefined) {
      fail(`${where} names unknown ending ${String(endingId)}.`);
    }
    if (found.kind !== kind) {
      fail(`${where} names ${found.id}, which is not a ${kind} ending.`);
    }
    return found.id;
  };
  /** A merchant's stock, limited by tier for the module's levels. */
  const merchant = (value: unknown, where: string): FifthMerchant => {
    const raw = exactKeys(value, ["stock", "minutes"], where);
    const stock = list(raw.stock, `${where} stock`, 12).map((entry, index) => {
      if (!isCatalogueId(entry)) {
        fail(
          `${where} stock ${index + 1} must be a catalogue weapon, armour or ammunition.`,
        );
      }
      const tier = itemTier(entry);
      if (tier === "rare") {
        fail(
          `${where} stocks the rare ${entry}, but no merchant sells rare gear.`,
        );
      }
      if (tier === "uncommon" && min < 3) {
        fail(
          `${where} stocks the uncommon ${entry}, but uncommon gear is sold only in modules for level 3 and up.`,
        );
      }
      return entry;
    });
    distinct(
      stock,
      (entry) => entry,
      (entry) => `${where} stocks ${entry} twice.`,
    );
    return {
      stock,
      minutes: integer(raw.minutes, `${where} minutes`, 1, MAX_TRADE_MINUTES),
    };
  };
  /** The treasure type of each opponent that names a bestiary monster. */
  const treasureTypes = new Map<FifthOpponent, TreasureTypeId>();
  const encounters = list(module.encounters, "encounters", 20).map(
    (entry, index) => {
      const where = `encounter ${index + 1}`;
      const encounter = knownKeys(
        entry,
        ["id", "opponents", "defeatEndingId"],
        ["victoryEndingId", "bypassXp", "sneakAgain", "lurking", "reaction"],
        where,
      );
      if (encounter.sneakAgain !== undefined && encounter.sneakAgain !== true) {
        fail(`${where} sneakAgain must be true, or left out.`);
      }
      if (encounter.lurking !== undefined && encounter.lurking !== true) {
        fail(`${where} lurking must be true, or left out.`);
      }
      const opponents = list(
        encounter.opponents,
        `${where} opponents`,
        MAX_OPPONENTS,
      ).map((raw, number) => {
        const at = `${where} opponent ${number + 1}`;
        const reference = isRecord(raw) && "monster" in raw;
        const opponent = reference
          ? knownKeys(
              raw,
              ["id", "monster"],
              [
                "name",
                "description",
                "boss",
                "statBlock",
                "surrender",
                "reacts",
              ],
              at,
            )
          : knownKeys(
              raw,
              ["id", "name", "description", "statBlock"],
              ["boss", "surrender", "reacts"],
              at,
            );
        if (opponent.boss !== undefined && opponent.boss !== true) {
          fail(`${at} boss must be true, or left out.`);
        }
        if (opponent.reacts !== undefined && opponent.reacts !== true) {
          fail(`${at} reacts must be true, or left out.`);
        }
        const opponentId = id(opponent.id, `${at} id`);
        if (opponent.reacts === true && encounter.reaction === undefined) {
          fail(
            `${at} (${opponentId}) reacts, but ${where} has no reaction: author one, with each band's options.`,
          );
        }
        const boss = {
          ...(opponent.boss === true ? { boss: true as const } : {}),
          ...(opponent.reacts === true ? { reacts: true as const } : {}),
        };
        /** Its surrender, if authored, for a monster that checks morale. */
        const yielding = (block: StatBlock) => {
          if (opponent.surrender === undefined) {
            return {};
          }
          if (block.morale === "never") {
            fail(
              `${at} (${opponentId}) never checks morale (undead or mindless), so it cannot surrender.`,
            );
          }
          if (encounter.victoryEndingId !== undefined) {
            fail(
              `${at} (${opponentId}) can surrender, but its fight ends the adventure, so it can never be talked to.`,
            );
          }
          const on = `${at} surrender`;
          const raw = knownKeys(
            opponent.surrender,
            ["description", "topics"],
            ["xp"],
            on,
          );
          return {
            surrender: {
              description: text(raw.description, `${on} description`),
              topics: topics(raw.topics, on, true),
              ...(raw.xp === undefined
                ? {}
                : { xp: integer(raw.xp, `${on} xp`, 1, 10000) }),
            },
          };
        };
        if (!reference) {
          const block = statBlock(opponent.statBlock, `${at} statBlock`);
          return {
            id: opponentId,
            name: text(opponent.name, `${at} name`, 60),
            description: text(opponent.description, `${at} description`),
            statBlock: block,
            ...boss,
            ...yielding(block),
          };
        }
        const monsterId = id(opponent.monster, `${at} monster`);
        if (opponent.statBlock !== undefined) {
          fail(
            `module ${moduleId} ${at} (${opponentId}) names bestiary monster ${monsterId} and has an inline statBlock; give only one.`,
          );
        }
        const monster = bestiary.monsters.find(
          ({ id: entryId }) => entryId === monsterId,
        );
        if (monster === undefined) {
          fail(
            `module ${moduleId} ${at} (${opponentId}) names bestiary monster ${monsterId}, which is not in the bestiary.`,
          );
        }
        const named: FifthOpponent = {
          id: opponentId,
          name:
            opponent.name === undefined
              ? monster.statBlock.name
              : text(opponent.name, `${at} name`, 60),
          description:
            opponent.description === undefined
              ? monster.description
              : text(opponent.description, `${at} description`),
          statBlock: monster.statBlock,
          ...boss,
          ...yielding(monster.statBlock),
        };
        treasureTypes.set(named, monster.treasureType);
        return named;
      });
      unique(opponents, `${where} opponent`);
      // The player targets opponents by name, in any case.
      distinct(
        opponents,
        ({ name }) => name.toLowerCase(),
        ({ name }) =>
          `${where} has two opponents named ${name}; give each a name the player can target.`,
      );
      if (opponents.some(({ id: opponentId }) => opponentId === "pc")) {
        fail(`${where} opponent id pc is reserved for the player character.`);
      }
      const reaction =
        encounter.reaction === undefined
          ? undefined
          : reactionOf(encounter.reaction, `${where} reaction`);
      if (reaction !== undefined) {
        if (encounter.victoryEndingId !== undefined) {
          fail(
            `${where} is reaction-eligible, but its fight ends the adventure: it could never be won once its opponents let the character pass.`,
          );
        }
        // Mindless opponents (undead, or never checking morale) never
        // react, and none may follow another's lead either.
        for (const opponent of opponents) {
          if (isMindless(opponent.statBlock)) {
            fail(
              `${where} is reaction-eligible, but opponent ${opponent.id} is mindless (undead, or its morale is "never"): remove the reaction or the opponent.`,
            );
          }
        }
      }
      return {
        id: id(encounter.id, `${where} id`),
        opponents,
        ...(encounter.victoryEndingId === undefined
          ? {}
          : {
              victoryEndingId: ending(
                encounter.victoryEndingId,
                "victory",
                where,
              ),
            }),
        defeatEndingId: ending(encounter.defeatEndingId, "defeat", where),
        ...(encounter.bypassXp === undefined
          ? {}
          : {
              bypassXp: integer(
                encounter.bypassXp,
                `${where} bypassXp`,
                1,
                10000,
              ),
            }),
        ...(encounter.sneakAgain === true ? { sneakAgain: true as const } : {}),
        ...(encounter.lurking === true ? { lurking: true as const } : {}),
        ...(reaction === undefined ? {} : { reaction }),
      };
    },
  );
  const encounterIds = unique(encounters, "encounter");
  const rooms = list(module.rooms, "rooms", 50).map((entry, index) => {
    const where = `room ${index + 1}`;
    const room = knownKeys(
      entry,
      ["id", "name", "description", "features", "items"],
      ["encounterId", "creatures", "exit"],
      where,
    );
    if (room.exit !== undefined && room.exit !== true) {
      fail(`${where} exit must be true, or left out.`);
    }
    if (
      room.encounterId !== undefined &&
      !encounterIds.has(room.encounterId as string)
    ) {
      fail(`${where} names unknown encounter ${String(room.encounterId)}.`);
    }
    const features = list(room.features, `${where} features`, 12, 0).map(
      (raw, number) => {
        const at = `${where} feature ${number + 1}`;
        const feature = knownKeys(
          raw,
          ["id", "name", "description"],
          ["discovery", "check"],
          at,
        );
        return {
          id: id(feature.id, `${at} id`),
          name: text(feature.name, `${at} name`, 60),
          description: text(feature.description, `${at} description`),
          ...(feature.discovery === undefined
            ? {}
            : { discovery: text(feature.discovery, `${at} discovery`) }),
          ...(feature.check === undefined
            ? {}
            : { check: check(feature.check, `${at} check`) }),
        };
      },
    );
    // The player examines features by name, in any case.
    distinct(
      features,
      ({ name }) => name.toLowerCase(),
      ({ name }) => `${where} has two features named ${name}.`,
    );
    const items = list(room.items, `${where} items`, 12, 0).map(
      (raw, number) => {
        const at = `${where} item ${number + 1}`;
        const item = knownKeys(
          raw,
          ["id", "name", "description", "kind"],
          ["coins", "gear", "treasure", "hiddenIn"],
          at,
        );
        if (!Object.hasOwn(ITEM_KINDS, item.kind as string)) {
          fail(
            `${at} kind must be one of ${Object.keys(ITEM_KINDS).join(", ")}.`,
          );
        }
        if (
          FOUND_ONCE_KINDS.includes(item.kind as ItemKind) &&
          item.hiddenIn === undefined
        ) {
          fail(
            `${at} is ${String(item.kind)}, so it must be hidden in a feature or carried by an opponent.`,
          );
        }
        if (item.kind === "coin" && item.coins === undefined) {
          fail(`${at} is coin, so it needs coins.`);
        }
        if (item.kind !== "coin" && item.coins !== undefined) {
          fail(`${at} has coins, but only coin has coins.`);
        }
        if (item.kind === "gear" && !isCatalogueId(item.gear)) {
          fail(
            `${at} is gear, so it needs gear: a catalogue weapon, armour or ammunition.`,
          );
        }
        if (item.kind !== "gear" && item.gear !== undefined) {
          fail(`${at} has gear, but only gear has gear.`);
        }
        if (item.kind === "treasure" && !isTradeGoodId(item.treasure)) {
          fail(
            `${at} is treasure, so it needs treasure: a catalogue gem or art object.`,
          );
        }
        if (item.kind !== "treasure" && item.treasure !== undefined) {
          fail(`${at} has treasure, but only treasure has treasure.`);
        }
        // An opponent of this room's fight may carry it: searching its body
        // once the fight is won finds it.
        const fight = encounters.find(
          ({ id: encounterId }) => encounterId === room.encounterId,
        );
        const carrier = fight?.opponents.find(
          ({ id: opponentId }) => opponentId === item.hiddenIn,
        );
        if (carrier !== undefined && fight!.victoryEndingId !== undefined) {
          fail(
            `${at} is carried by ${carrier.id}, whose fight ends the adventure, so its body can never be searched.`,
          );
        }
        if (item.hiddenIn !== undefined && carrier === undefined) {
          const holder = features.find(
            ({ id: featureId }) => featureId === item.hiddenIn,
          );
          if (holder === undefined) {
            fail(
              `${at} is hidden in unknown feature ${String(item.hiddenIn)}.`,
            );
          }
          // A checked feature's items are found by its bands' item
          // effects, checked below.
          if (holder.discovery === undefined && holder.check === undefined) {
            fail(
              `${at} is hidden in ${holder.id}, which has no discovery to reveal it.`,
            );
          }
        }
        const placed = {
          id: id(item.id, `${at} id`),
          name: text(item.name, `${at} name`, 60),
          description: text(item.description, `${at} description`),
          kind: item.kind as ItemKind,
          ...(item.coins === undefined
            ? {}
            : { coins: coins(item.coins, `${at} coins`) }),
          ...(item.gear === undefined
            ? {}
            : { gear: item.gear as CatalogueId }),
          ...(item.treasure === undefined
            ? {}
            : { treasure: item.treasure as TradeGoodId }),
          ...(item.hiddenIn === undefined
            ? {}
            : { hiddenIn: item.hiddenIn as string }),
        };
        const tier = findableTier(placed);
        if (tier !== undefined && !tierAllowed(tier, max)) {
          const from = TIER_MIN_LEVEL[tier];
          fail(
            `module ${moduleId} ${at} (${placed.id}) is the ${tier} ${catalogueName(placed)}, but ${
              from === undefined
                ? `no ${tier} treasure is found yet.`
                : `${tier} treasure is found only in modules for level ${from} and up.`
            }`,
          );
        }
        return placed;
      },
    );
    const creatures = (
      room.creatures === undefined
        ? []
        : list(room.creatures, `${where} creatures`, 6, 0)
    ).map((raw, number) => {
      const at = `${where} creature ${number + 1}`;
      const creature = knownKeys(
        raw,
        ["id", "name", "description", "topics"],
        ["merchant"],
        at,
      );
      return {
        id: id(creature.id, `${at} id`),
        name: text(creature.name, `${at} name`, 60),
        description: text(creature.description, `${at} description`),
        topics: topics(creature.topics, at),
        ...(creature.merchant === undefined
          ? {}
          : { merchant: merchant(creature.merchant, `${at} merchant`) }),
      };
    });
    const fight = encounters.find(
      ({ id: encounterId }) => encounterId === room.encounterId,
    );
    for (const opponent of fight?.opponents ?? []) {
      const type = treasureTypes.get(opponent);
      if (type !== undefined) {
        carriedLoot(
          items.filter(({ hiddenIn }) => hiddenIn === opponent.id),
          type,
          `module ${moduleId} ${where}: ${opponent.id}`,
        );
      }
    }
    if (creatures.filter((creature) => creature.merchant).length > 1) {
      fail(`${where} has two merchants; one is enough.`);
    }
    return {
      id: id(room.id, `${where} id`),
      name: text(room.name, `${where} name`, 80),
      description: text(room.description, `${where} description`),
      ...(room.encounterId === undefined
        ? {}
        : { encounterId: room.encounterId as string }),
      ...(room.exit === true ? { exit: true as const } : {}),
      features,
      items,
      creatures,
    };
  });
  const roomIds = unique(rooms, "room");
  const worth = findableValue({ rooms });
  const budget = treasureBudget(max);
  if (worth > budget) {
    fail(
      `module ${moduleId}: its findable treasure is worth ${formatCoins(worth)}, ${formatCoins(worth - budget)} over the ${formatCoins(budget)} budget for level ${max}.`,
    );
  }
  if (!roomIds.has(module.startRoomId as string)) {
    fail(`startRoomId names unknown room ${String(module.startRoomId)}.`);
  }
  const placed = rooms.flatMap(({ encounterId }) =>
    encounterId === undefined ? [] : [encounterId],
  );
  distinct(
    placed,
    (encounterId) => encounterId,
    (encounterId) => `encounter ${encounterId} is in more than one room.`,
  );
  for (const { id: encounterId } of encounters) {
    if (!placed.includes(encounterId)) {
      fail(`encounter ${encounterId} is in no room.`);
    }
  }
  const door = (value: unknown, where: string): FifthDoor => {
    const raw = knownKeys(
      value,
      ["id", "name", "description", "state"],
      ["force", "pick", "break", "keyItemId"],
      where,
    );
    const doorId = id(raw.id, `${where} id`);
    const checks = {
      ...(raw.force === undefined
        ? {}
        : { force: check(raw.force, `${where} force`) }),
      ...(raw.pick === undefined
        ? {}
        : { pick: check(raw.pick, `${where} pick`) }),
      ...(raw.break === undefined
        ? {}
        : { break: check(raw.break, `${where} break`) }),
    };
    if (raw.state === "stuck") {
      if (
        checks.pick !== undefined ||
        checks.break !== undefined ||
        raw.keyItemId !== undefined
      ) {
        fail(`door ${doorId}: a stuck door is opened only by force.`);
      }
      if (checks.force === undefined) {
        fail(`door ${doorId}: a stuck door needs force.`);
      }
    } else if (raw.state === "locked") {
      if (checks.force !== undefined) {
        fail(`door ${doorId}: a locked door is not forced; pick or break it.`);
      }
      if (
        checks.pick === undefined &&
        checks.break === undefined &&
        raw.keyItemId === undefined
      ) {
        fail(`door ${doorId}: a locked door needs a key, pick or break.`);
      }
    } else {
      fail(`${where} state must be stuck or locked.`);
    }
    return {
      id: doorId,
      name: text(raw.name, `${where} name`, 60),
      description: text(raw.description, `${where} description`),
      state: raw.state,
      ...checks,
      ...(raw.keyItemId === undefined
        ? {}
        : { keyItemId: id(raw.keyItemId, `${where} keyItemId`) }),
    };
  };
  const trap = (value: unknown, where: string): FifthTrap => {
    const raw = exactKeys(
      value,
      [
        "id",
        "name",
        "description",
        "find",
        "disarm",
        "trigger",
        "save",
        "damage",
        "defeatEndingId",
      ],
      where,
    );
    const save = exactKeys(raw.save, ["ability", "dc"], `${where} save`);
    const damage = exactKeys(
      raw.damage,
      ["dice", "sides", "modifier", "type"],
      `${where} damage`,
    );
    return {
      id: id(raw.id, `${where} id`),
      name: text(raw.name, `${where} name`, 60),
      description: text(raw.description, `${where} description`),
      find: approach(raw.find, `${where} find`, false),
      disarm: check(raw.disarm, `${where} disarm`),
      trigger: text(raw.trigger, `${where} trigger`),
      save: {
        ability: ability(save.ability, `${where} save ability`),
        dc: integer(save.dc, `${where} save dc`, 5, 30),
      },
      damage: {
        dice: integer(damage.dice, `${where} damage dice`, 1, 10),
        sides: integer(damage.sides, `${where} damage sides`, 2, 12),
        modifier: integer(damage.modifier, `${where} damage modifier`, -5, 20),
        type: damageType(damage.type, `${where} damage type`),
      },
      defeatEndingId: ending(raw.defeatEndingId, "defeat", where),
    };
  };
  const passages = list(module.passages, "passages", 100, 0).map(
    (entry, index) => {
      const where = `passage ${index + 1}`;
      const passage = knownKeys(
        entry,
        ["id", "between", "description"],
        ["door", "trap", "hidden"],
        where,
      );
      if (passage.hidden !== undefined && passage.hidden !== true) {
        fail(`${where} hidden must be true, or left out.`);
      }
      if (!Array.isArray(passage.between) || passage.between.length !== 2) {
        fail(`${where} between must name two rooms.`);
      }
      const [from, to] = passage.between as unknown[];
      for (const end of [from, to]) {
        if (!roomIds.has(end as string)) {
          fail(`${where} names unknown room ${String(end)}.`);
        }
      }
      if (from === to) {
        fail(`${where} leads from ${String(from)} to itself.`);
      }
      return {
        id: id(passage.id, `${where} id`),
        between: [from as string, to as string] as const,
        description: text(passage.description, `${where} description`, 200),
        ...(passage.hidden === true ? { hidden: true as const } : {}),
        ...(passage.door === undefined
          ? {}
          : { door: door(passage.door, `${where} door`) }),
        ...(passage.trap === undefined
          ? {}
          : { trap: trap(passage.trap, `${where} trap`) }),
      };
    },
  );
  unique(passages, "passage");
  // Features, items, doors, traps, creatures, topics and the opponents whose
  // bodies can be searched share one namespace: each is an action's target.
  distinct(
    [
      ...encounters.flatMap(({ opponents }) => opponents),
      ...encounters.flatMap(({ opponents }) =>
        opponents.flatMap(({ surrender }) => surrender?.topics ?? []),
      ),
      ...rooms.flatMap(({ features, items, creatures }) => [
        ...features,
        ...items,
        ...creatures,
        ...creatures.flatMap(({ topics }) => topics),
      ]),
      ...passages.flatMap(({ door: shut, trap: armed }) => [
        ...(shut === undefined ? [] : [shut]),
        ...(armed === undefined ? [] : [armed]),
      ]),
    ],
    ({ id: thingId }) => {
      // Catalogue ids name the character's own gear in its actions.
      if (isCatalogueId(thingId)) {
        fail(`id ${thingId} names catalogue gear; choose another.`);
      }
      return thingId;
    },
    ({ id: thingId }) => `duplicate id ${thingId}.`,
  );
  // The player names doors, in any case.
  distinct(
    passages.flatMap(({ door: shut }) => (shut === undefined ? [] : [shut])),
    ({ name }) => name.toLowerCase(),
    ({ name }) => `two doors named ${name}.`,
  );
  const itemRooms = new Map(
    rooms.flatMap(({ id: roomId, items }) =>
      items.map((item) => [item.id, { item, roomId }] as const),
    ),
  );
  // A surrendered opponent gives only what it carries, and each thing once.
  const given = new Set<string>();
  for (const { opponents } of encounters) {
    for (const { id: opponentId, surrender } of opponents) {
      for (const { id: topicId, gives } of surrender?.topics ?? []) {
        for (const itemId of gives ?? []) {
          const item = itemRooms.get(itemId)?.item;
          if (item === undefined) {
            fail(`topic ${topicId} gives unknown item ${itemId}.`);
          }
          if (item.hiddenIn !== opponentId) {
            fail(
              `topic ${topicId} gives ${itemId}, which ${opponentId} does not carry.`,
            );
          }
          if (given.has(itemId)) {
            fail(`${itemId} is given by two topics.`);
          }
          given.add(itemId);
        }
      }
    }
  }
  for (const { door: shut } of passages) {
    if (shut?.keyItemId !== undefined) {
      const key = itemRooms.get(shut.keyItemId)?.item;
      if (key === undefined) {
        fail(`door ${shut.id} names unknown key ${shut.keyItemId}.`);
      }
      if (key.kind !== "key") {
        fail(`door ${shut.id}'s key ${key.id} is not a key.`);
      }
    }
  }
  // Each authored check's bands (#281): each band can be reached, and each
  // effect names a feature with a discovery, an item hidden in a feature, or
  // a defeat ending. An item hidden in a feature with a check must be
  // revealed by some item effect, or it could never be found.
  const featureById = new Map(
    rooms.flatMap(({ features }) =>
      features.map((feature) => [feature.id, feature] as const),
    ),
  );
  const revealed = new Set<string>();
  /** Hidden passages some band opens, and who can close each passage. */
  const openable = new Set<string>();
  const closers = new Map<string, string[]>();
  for (const site of authoredChecks({ rooms, passages, encounters })) {
    const label = siteLabel(site);
    for (const band of BANDS) {
      const outcome = site.check.bands?.[band];
      if (outcome === undefined) {
        continue;
      }
      const on = `${label}'s ${band} band`;
      if (
        !approachesOf(site.check).some((spec) => bandReachable(band, spec, max))
      ) {
        // Named by the approach that comes closest: the lowest DC for a
        // success, the highest for a failure.
        const closest = [...approachesOf(site.check)].sort(
          (one, other) => one.dc - other.dc,
        )[
          band.startsWith("success") ? 0 : approachesOf(site.check).length - 1
        ]!;
        const [lowest, highest] = extremeTotals(closest, max);
        const { dc } = closest;
        fail(
          `${on} can't be reached with DC ${dc}: ${
            band === "success-by-5"
              ? `it needs a total of ${dc + 5}`
              : band === "success"
                ? `it needs a total of ${dc}`
                : `it needs a total of ${band === "failure" ? dc - 1 : dc - 5}`
          }, and a character of level ${max} totals ${lowest} to ${highest}.`,
        );
      }
      for (const entry of effectsOf(outcome)) {
        switch (entry.type) {
          case "discovery": {
            const feature = featureById.get(entry.feature);
            if (feature === undefined) {
              fail(`${on} names unknown discovery ${entry.feature}.`);
            }
            if (feature.discovery === undefined) {
              fail(
                `${on} names ${feature.id}'s discovery, but it has no discovery.`,
              );
            }
            break;
          }
          case "item": {
            const placed = itemRooms.get(entry.item)?.item;
            if (placed === undefined) {
              fail(`${on} names unknown item ${entry.item}.`);
            }
            if (
              placed.hiddenIn === undefined ||
              !featureById.has(placed.hiddenIn)
            ) {
              fail(
                `${on} reveals ${placed.id}, which is not hidden in a feature.`,
              );
            }
            revealed.add(placed.id);
            break;
          }
          case "damage":
            ending(entry.defeatEndingId, "defeat", on);
            break;
          case "open":
          case "close": {
            const way = passages.find(
              ({ id: passageId }) => passageId === entry.passage,
            );
            if (way === undefined) {
              fail(`${on} names unknown passage ${entry.passage}.`);
            }
            if (entry.type === "open" && way.hidden !== true) {
              fail(
                `${on} opens passage ${way.id}, which is not hidden; only a hidden passage is opened.`,
              );
            }
            if (entry.type === "open") {
              openable.add(way.id);
            } else {
              closers.set(way.id, [...(closers.get(way.id) ?? []), `${on}`]);
            }
            break;
          }
        }
      }
    }
  }
  // Each check's circumstances and retry (#284) name what exists: an item
  // the character can carry, a feature with a discovery, an encounter; a
  // retry's cost, a tool, or damage with a defeat ending.
  const named = (entry: Circumstance, on: string) => {
    switch (entry.type) {
      case "holds": {
        const placed = itemRooms.get(entry.item)?.item;
        if (placed === undefined) {
          fail(`${on} names unknown item ${entry.item}.`);
        }
        if (placed.kind === "coin" || placed.kind === "gear") {
          fail(
            `${on} names ${placed.id}, which is ${placed.kind}: it goes into the ${placed.kind === "coin" ? "purse" : "stowed gear"}, so it is never held.`,
          );
        }
        break;
      }
      case "discovered": {
        const feature = featureById.get(entry.feature);
        if (feature === undefined) {
          fail(`${on} names unknown feature ${entry.feature}.`);
        }
        if (feature.discovery === undefined) {
          fail(`${on} names ${feature.id}, which has no discovery.`);
        }
        break;
      }
      case "won":
        if (!encounterIds.has(entry.encounter)) {
          fail(`${on} names unknown encounter ${entry.encounter}.`);
        }
        break;
    }
  };
  for (const site of authoredChecks({ rooms, passages, encounters })) {
    const label = siteLabel(site);
    approachesOf(site.check).forEach((spec, index) => {
      const way =
        approachesOf(site.check).length === 1
          ? label
          : `${label}'s approach ${index + 1}`;
      for (const mode of ["advantage", "disadvantage"] as const) {
        (spec[mode] ?? []).forEach((entry, number) =>
          named(entry, `${way}'s ${mode} ${number + 1}`),
        );
      }
    });
    const again = site.check.retry;
    if (again?.after !== undefined) {
      named(again.after, `${label}'s retry`);
    } else if (again?.cost.type === "item") {
      const placed = itemRooms.get(again.cost.item)?.item;
      if (placed === undefined) {
        fail(`${label}'s retry costs unknown item ${again.cost.item}.`);
      }
      if (placed.kind !== "tool") {
        fail(
          `${label}'s retry costs ${placed.id}, which is ${placed.kind}; only a tool is used up.`,
        );
      }
      // The cost is paid before the roll, so a tool used up can't also be
      // the one held for advantage on that roll.
      approachesOf(site.check).forEach((spec, index) => {
        const needed = (spec.advantage ?? []).findIndex(
          (entry) =>
            entry.type === "holds" &&
            entry.item === placed.id &&
            entry.not !== true,
        );
        if (needed !== -1) {
          const way =
            approachesOf(site.check).length === 1
              ? label
              : `${label}'s approach ${index + 1}`;
          fail(
            `${way}'s retry uses up ${placed.id}, which its advantage ${needed + 1} needs held.`,
          );
        }
      });
    } else if (again?.cost.type === "damage") {
      ending(again.cost.defeatEndingId, "defeat", `${label}'s retry`);
    }
  }
  for (const { id: passageId, hidden } of passages) {
    if (hidden === true && !openable.has(passageId)) {
      fail(`passage ${passageId} is hidden, but no check's band opens it.`);
    }
  }
  for (const { item } of itemRooms.values()) {
    const holder =
      item.hiddenIn === undefined ? undefined : featureById.get(item.hiddenIn);
    if (holder?.check !== undefined && !revealed.has(item.id)) {
      fail(
        `${item.id} is hidden in ${holder.id}, which has a check, but no check's item effect reveals it.`,
      );
    }
  }
  distinct(
    passages,
    ({ between }) => [...between].sort().join(" "),
    ({ between: [from, to] }) =>
      `two passages join ${from} and ${to}; one is enough.`,
  );
  // Every room must be reachable from the start.
  const reached = new Set([module.startRoomId as string]);
  for (let grew = true; grew;) {
    grew = false;
    for (const { between } of passages) {
      const [from, to] = between;
      if (reached.has(from) !== reached.has(to)) {
        reached.add(from).add(to);
        grew = true;
      }
    }
  }
  for (const { id: roomId } of rooms) {
    if (!reached.has(roomId)) {
      fail(
        `room ${roomId} cannot be reached from ${String(module.startRoomId)}.`,
      );
    }
  }
  // An essential room (one whose fight wins the adventure) must be reachable
  // without a check or a trap, or through checks that go forward on every
  // band (#282). A locked door counts as open when its key can be reached
  // that way. `excluded` passages are never counted on: those a band can
  // close.
  const sites = authoredChecks({ rooms, passages, encounters });
  const siteRooms = (site: AuthoredSite): readonly string[] => {
    switch (site.kind) {
      case "examine":
        return rooms.flatMap(({ id: roomId, features }) =>
          features.some(({ id: featureId }) => featureId === site.id)
            ? [roomId]
            : [],
        );
      case "talk":
        // A surrender's topics need it to surrender, which is never sure.
        return rooms.flatMap(({ id: roomId, creatures }) =>
          creatures.some(({ topics: said }) =>
            said.some(({ id: topicId }) => topicId === site.id),
          )
            ? [roomId]
            : [],
        );
      case "disarm":
        return [];
      default:
        return passages.flatMap(({ door: shut, between }) =>
          shut?.id === site.id ? [...between] : [],
        );
    }
  };
  /** The effective bands some character can roll on a check. */
  const outcomesOf = (site: AuthoredSite): readonly Band[] => [
    ...new Set(
      BANDS.filter((band) =>
        approachesOf(site.check).some((spec) => bandReachable(band, spec, max)),
      ).map((band) => authoredBand(site.check, band)),
    ),
  ];
  /** The passages a band makes a way: its opens, and a door it opens. */
  const opensOn = (site: AuthoredSite, band: Band): ReadonlySet<string> =>
    new Set([
      ...effectsOf(site.check.bands?.[band]).flatMap((entry) =>
        entry.type === "open" ? [entry.passage] : [],
      ),
      ...(["force", "pick", "break"].includes(site.kind) && isSuccess(band)
        ? passages.flatMap(({ id: passageId, door: shut }) =>
            shut?.id === site.id ? [passageId] : [],
          )
        : []),
    ]);
  const reachable = (excluded: ReadonlySet<string>): Set<string> => {
    // The rooms reached from `from` through ways needing no check, and the
    // passages in `extra` a band has made ways.
    const closure = (
      from: ReadonlySet<string>,
      extra: ReadonlySet<string>,
    ): Set<string> => {
      const reached = new Set(from);
      // A key in a feature with a check is found only on some bands.
      const keyed = (shut: FifthDoor) =>
        shut.keyItemId !== undefined &&
        reached.has(itemRooms.get(shut.keyItemId)!.roomId) &&
        featureById.get(itemRooms.get(shut.keyItemId)!.item.hiddenIn ?? "")
          ?.check === undefined;
      const passable = (entry: FifthPassage) =>
        !excluded.has(entry.id) &&
        entry.trap === undefined &&
        (extra.has(entry.id) ||
          (entry.hidden !== true &&
            (entry.door === undefined || keyed(entry.door))));
      for (let grew = true; grew;) {
        grew = false;
        for (const entry of passages) {
          const [from, to] = entry.between;
          if (reached.has(from) !== reached.has(to) && passable(entry)) {
            reached.add(from).add(to);
            grew = true;
          }
        }
      }
      return reached;
    };
    let sure = closure(new Set([module.startRoomId as string]), new Set());
    // A check reached for sure adds what every band of it reaches.
    for (let grew = true; grew;) {
      grew = false;
      for (const site of sites) {
        if (!siteRooms(site).some((roomId) => sure.has(roomId))) {
          continue;
        }
        const ways = outcomesOf(site).map((band) =>
          closure(sure, opensOn(site, band)),
        );
        const forward = new Set(
          [...ways[0]!].filter((roomId) =>
            ways.every((way) => way.has(roomId)),
          ),
        );
        if (forward.size > sure.size) {
          sure = forward;
          grew = true;
        }
      }
    }
    return sure;
  };
  const free = reachable(new Set());
  const safe = reachable(new Set(closers.keys()));
  /**
   * Fails naming the check whose close can cut `what` off, when one alone
   * can; otherwise the checks that can between them.
   */
  const cutOff = (what: string, gone: (sure: Set<string>) => boolean) => {
    for (const [passageId, who] of closers) {
      if (gone(reachable(new Set([passageId])))) {
        fail(
          `${who[0]!} closes passage ${passageId}, which can cut off ${what}.`,
        );
      }
    }
    fail(
      `${[...closers.values()].flat().join(", ")} can between them cut off ${what}.`,
    );
  };
  const winning = new Set(
    encounters.flatMap(({ id: encounterId, victoryEndingId }) =>
      victoryEndingId === undefined ? [] : [encounterId],
    ),
  );
  for (const { id: roomId, encounterId } of rooms) {
    if (
      encounterId !== undefined &&
      winning.has(encounterId) &&
      !free.has(roomId)
    ) {
      // The rooms the essential one joins without passing the free rooms;
      // the guards are on the passages from the free rooms into them.
      const beyond = new Set([roomId]);
      for (let grew = true; grew;) {
        grew = false;
        for (const { between } of passages) {
          const [from, to] = between;
          if (
            !free.has(from) &&
            !free.has(to) &&
            beyond.has(from) !== beyond.has(to)
          ) {
            beyond.add(from).add(to);
            grew = true;
          }
        }
      }
      const guards = passages.flatMap((entry) => {
        const [from, to] = entry.between;
        return (free.has(from) && beyond.has(to)) ||
          (free.has(to) && beyond.has(from))
          ? [
              entry.door?.id,
              entry.trap?.id,
              entry.hidden === true ? entry.id : undefined,
            ].filter((guard): guard is string => guard !== undefined)
          : [];
      });
      fail(
        `room ${roomId} is essential, but every route to it needs a check or passes a trap (${guards.join(", ")}).`,
      );
    }
    if (
      encounterId !== undefined &&
      winning.has(encounterId) &&
      !safe.has(roomId)
    ) {
      cutOff(`essential room ${roomId}`, (sure) => !sure.has(roomId));
    }
  }
  // Leaving from an exit reaches the escape endings: with loot only when
  // there is treasure to carry out. Like an essential room, some exit must
  // be reachable without a check or a trap.
  const hasExit = rooms.some(({ exit }) => exit === true);
  const exitIn = (sure: Set<string>) =>
    rooms.some(({ id: roomId, exit }) => exit && sure.has(roomId));
  if (hasExit && !exitIn(free)) {
    fail(
      "every exit needs a check or passes a trap; one must be free to reach.",
    );
  }
  if (hasExit && !exitIn(safe)) {
    cutOff("every exit room", (sure) => !exitIn(sure));
  }
  const hasTreasure = rooms.some(({ items }) =>
    items.some(({ kind }) => LOOT_KINDS.includes(kind)),
  );
  const escapes = new Set(endings.map(({ kind }) => kind));
  if (hasExit && !escapes.has("escape-without-loot")) {
    fail("an exit needs an escape-without-loot ending.");
  }
  if (hasExit && hasTreasure && !escapes.has("escape-with-loot")) {
    fail(
      "an exit with treasure or coin to find needs an escape-with-loot ending.",
    );
  }
  for (const { id: endingId, kind } of endings) {
    if (kind === "escape-with-loot" || kind === "escape-without-loot") {
      if (!hasExit) {
        fail(
          `escape ending ${endingId} cannot be reached: no room is an exit.`,
        );
      }
      if (kind === "escape-with-loot" && !hasTreasure) {
        fail(
          `escape-with-loot ending ${endingId} cannot be reached: there is no treasure or coin.`,
        );
      }
    }
  }
  // Every other ending must be reachable: an encounter, a trap or a check's
  // damage names it.
  const damageEndings = new Set(
    authoredChecks({ rooms, passages, encounters }).flatMap(({ check: c }) => [
      ...Object.values(c.bands ?? {}).flatMap((outcome) =>
        effectsOf(outcome).flatMap((entry) =>
          entry.type === "damage" ? [entry.defeatEndingId] : [],
        ),
      ),
      // A retry's damage (#284) can drop the character too.
      ...(c.retry?.cost?.type === "damage"
        ? [c.retry.cost.defeatEndingId]
        : []),
    ]),
  );
  for (const { id: endingId, kind } of endings) {
    if (
      kind !== "escape-with-loot" &&
      kind !== "escape-without-loot" &&
      !encounters.some(
        ({ victoryEndingId, defeatEndingId }) =>
          victoryEndingId === endingId || defeatEndingId === endingId,
      ) &&
      !passages.some(({ trap: armed }) => armed?.defeatEndingId === endingId) &&
      !damageEndings.has(endingId)
    ) {
      fail(
        `ending ${endingId} cannot be reached: no encounter, trap or check names it.`,
      );
    }
  }
  return {
    kind: "dungeon-one-5e-adventure",
    formatVersion: FIFTH_ADVENTURE_FORMAT,
    id: moduleId,
    title: text(module.title, "title", 80),
    objective: text(module.objective, "objective", 400),
    recommendedLevels: { min, max },
    difficulty: module.difficulty as Difficulty,
    startRoomId: module.startRoomId as string,
    rooms,
    passages,
    encounters,
    endings,
  };
}

/** A digest of the validated module, so a session can tell if it changed. */
export function adventureDigest(adventure: FifthAdventure): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(adventure)).digest("hex")}`;
}

/** An ability score's modifier; a monster's score may be 1–30. */
const statBlockModifier = (score: number) => Math.floor((score - 10) / 2);

export function statBlockInitiative(block: StatBlock): number {
  return statBlockModifier(block.abilities.dexterity);
}

/**
 * Whether a monster is mindless (#304): an Undead, or any stat block whose
 * morale is "never", the mark the bestiary gives undead and mindless
 * monsters. A mindless opponent never reacts.
 */
export function isMindless(block: Pick<StatBlock, "type" | "morale">): boolean {
  return /^undead/iu.test(block.type) || block.morale === "never";
}

/**
 * The opponents of a reaction-eligible encounter who react (#304): those
 * marked `reacts`, or every one when none is.
 */
export function reactors<T extends Pick<FifthOpponent, "reacts">>(
  opponents: readonly T[],
): readonly T[] {
  const marked = opponents.filter(({ reacts }) => reacts === true);
  return marked.length === 0 ? opponents : marked;
}

/**
 * A monster's Stealth bonus (#303): its stat block's, or else its Dexterity
 * modifier.
 */
export function statBlockStealth(
  block: Pick<StatBlock, "stealth" | "abilities">,
): number {
  return block.stealth ?? statBlockModifier(block.abilities.dexterity);
}

/** A monster's proficiency bonus, from its challenge rating (SRD 5.2). */
export function statBlockProficiency(
  block: Pick<StatBlock, "challengeRating">,
): number {
  const rating = block.challengeRating.includes("/")
    ? 0
    : Number(block.challengeRating);
  return 2 + Math.floor(Math.max(0, rating - 1) / 4);
}

/** A monster's damage resistances, vulnerabilities and immunities. */
export function statBlockDefenses(
  block: Pick<
    StatBlock,
    "damageResistances" | "damageVulnerabilities" | "damageImmunities"
  >,
): DamageDefenses {
  return {
    ...(block.damageResistances === undefined
      ? {}
      : { resistances: block.damageResistances }),
    ...(block.damageVulnerabilities === undefined
      ? {}
      : { vulnerabilities: block.damageVulnerabilities }),
    ...(block.damageImmunities === undefined
      ? {}
      : { immunities: block.damageImmunities }),
  };
}

/** The combatant flag through which the encounter engine applies each trait. */
export const TRAIT_FLAGS = {
  "Pack Tactics": "packTactics",
  "Undead Fortitude": "undeadFortitude",
  "Nimble Escape": "nimbleEscape",
  Rampage: "rampage",
} as const satisfies Record<MonsterTrait, keyof Combatant>;

type TraitFlag = (typeof TRAIT_FLAGS)[MonsterTrait];

const simulated = (trait: string): trait is MonsterTrait =>
  Object.hasOwn(TRAIT_FLAGS, trait);

/**
 * The traits on `block` that the encounter engine does not apply. A
 * validated stat block has none; the balance harness refuses one that does.
 */
export function unsimulatedTraits(
  block: Pick<StatBlock, "traits">,
): readonly string[] {
  return (block.traits ?? []).filter((trait) => !simulated(trait));
}

/** A monster's traits as the flags its combatant carries into a fight. */
export function statBlockTraits(
  block: Pick<StatBlock, "traits">,
): Partial<Record<TraitFlag, true>> {
  return Object.fromEntries(
    (block.traits ?? [])
      .filter(simulated)
      .map((trait) => [TRAIT_FLAGS[trait], true]),
  );
}

/**
 * A monster's saving throws: each ability's modifier, plus its proficiency
 * bonus for each save it is proficient in.
 */
export function statBlockSaves(
  block: Pick<StatBlock, "abilities" | "challengeRating" | "saveProficiencies">,
): Record<Ability, number> {
  return Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      statBlockModifier(block.abilities[ability]) +
        (block.saveProficiencies?.includes(ability) === true
          ? statBlockProficiency(block)
          : 0),
    ]),
  ) as Record<Ability, number>;
}

/**
 * Reads and validates a module file against a bestiary, the built-in one by
 * default; problems name the file.
 */
export async function loadFifthAdventure(
  path: string,
  bestiary?: FifthBestiary,
): Promise<FifthAdventure> {
  let decoded: unknown;
  try {
    decoded = parseBoundedJson(await readFile(path), 1024 * 1024, 32);
  } catch {
    throw new Error(`${path} is not a readable adventure module.`);
  }
  if (
    isRecord(decoded) &&
    decoded.kind === "dungeon-one-5e-adventure" &&
    decoded.formatVersion !== FIFTH_ADVENTURE_FORMAT
  ) {
    throw new Error(
      `${path} is a 5e adventure module in format version ${String(decoded.formatVersion)}, not ${FIFTH_ADVENTURE_FORMAT}. Move it aside; the file has not been changed.`,
    );
  }
  const monsters = bestiary ?? (await loadBuiltInFifthBestiary());
  try {
    return validateFifthAdventure(decoded, monsters);
  } catch (error) {
    throw new Error(`${path}: ${(error as Error).message}`);
  }
}

/**
 * The modules the browser offers, in the order it offers them: only those
 * `qualifies` accepts (the balance gate, #135), by recommended level range,
 * lowest first, then by difficulty, easy to hard, then by id. Returns a new
 * array.
 */
export function orderFifthAdventures<
  T extends Pick<FifthAdventure, "id" | "recommendedLevels" | "difficulty">,
>(adventures: readonly T[], qualifies: (adventure: T) => boolean): T[] {
  return adventures
    .filter(qualifies)
    .sort(
      (a, b) =>
        a.recommendedLevels.min - b.recommendedLevels.min ||
        a.recommendedLevels.max - b.recommendedLevels.max ||
        DIFFICULTIES.indexOf(a.difficulty) -
          DIFFICULTIES.indexOf(b.difficulty) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * The built-in 5e modules, by id. The browser offers those that qualify, in
 * `orderFifthAdventures` order.
 */
export const FIFTH_ADVENTURE_FILES = {
  "abandoned-delve": "abandoned-delve.json",
  "drowned-chapel": "drowned-chapel.json",
  "goblin-warren": "goblin-warren.json",
  "gravediggers-lodge": "gravediggers-lodge.json",
  "ravagers-tower": "ravagers-tower.json",
  "robbers-barrow": "robbers-barrow.json",
  "shepherds-bothy": "shepherds-bothy.json",
  "silvervein-mine": "silvervein-mine.json",
  "smugglers-cellar": "smugglers-cellar.json",
  "thornwood-lodge": "thornwood-lodge.json",
  "tinkers-toll": "tinkers-toll.json",
  "warden-crypt": "warden-crypt.json",
  "wolfstone-hillfort": "wolfstone-hillfort.json",
} as const;
export type FifthAdventureId = keyof typeof FIFTH_ADVENTURE_FILES;

export async function loadBuiltInFifthAdventures(): Promise<
  readonly FifthAdventure[]
> {
  const bestiary = await loadBuiltInFifthBestiary();
  return Promise.all(
    Object.entries(FIFTH_ADVENTURE_FILES).map(async ([expected, file]) => {
      const adventure = await loadFifthAdventure(
        fileURLToPath(new URL(`../adventures/5e/${file}`, import.meta.url)),
        bestiary,
      );
      if (adventure.id !== expected) {
        throw new Error(`adventures/5e/${file} must have id ${expected}.`);
      }
      return adventure;
    }),
  );
}
