/**
 * The 5e adventure module format and its validator.
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
 * A reaction may author a parley (#305), a Persuasion, Deception or
 * Intimidation check whose bands move the reaction or end it, a toll in
 * coin to pass, and trade: the opponents' stock, as a merchant's.
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
 * forward, whatever any band may close, and without thieves' tools.
 *
 * A feature may offer a fight action (#402): in a fight in its room, with
 * the character's action, a check against one opponent whose bands damage
 * it, give it a condition or remove it from the fight, used once per fight
 * or once per adventure. Only a room where a fight is fought may have one,
 * and one that can remove an opponent is used once per adventure and never
 * where a boss may be fought (D4), nor where an opponent may be fought that
 * carries a door's key or an item a use needs.
 *
 * A Dexterity check may be made with thieves' tools (#309), which only a
 * character carrying them can make: a door's pick always is, and a trap's
 * disarm may be, alone or as one of its approaches. Nothing else uses them.
 * A trap's find is only a DC: the search rolls Perception or Investigation.
 *
 * A check may author a retry (#284): never (the default), after a cost
 * (damage, or using up a carried tool), or after a changed circumstance
 * (holding an item, a discovery made, an encounter won). Each approach may
 * have circumstances that give it advantage or disadvantage. A tool is a
 * mundane item, such as a rope, that does nothing by itself: a check's
 * circumstance or retry cost names it.
 *
 * A module may group its rooms into regions (#395), such as an upper and a
 * lower level: then every room names its region, and every region has a
 * room, and the room map shades it.
 *
 * A region may name a backdrop (#517), a faint drawing of the kind of place
 * it is behind the room panel, and a room may name its own instead. They
 * are only for the page: the AI DM never sees them.
 *
 * Every room sits on a cell of the room map (#455), `at: [x, y]`, on a
 * floor (0 unless authored). The rules that keep the map readable live in
 * `map-5e.ts`: one room to a cell, straight passages that don't cross or
 * run through rooms, and stairs, a ladder or a shaft (`vertical`) between
 * adjacent floors. The map is a layout of rooms; there is no tactical grid,
 * no position inside a room.
 *
 * A module may declare flags (#397): named facts about the session that
 * only ever turn on. A flag is set by a check band's `set` effect, an
 * encounter's outcome (won, bypassed, ended peacefully or fled), taking an
 * item, first entering a room or examining a feature. A passage may be open
 * only once a flag is set (`openWhen`), or closed once one is
 * (`closeWhen`), and a circumstance may name a flag. Reachability treats
 * flags as a fixed point: the rooms reached and the flags set for sure are
 * grown together until neither changes.
 *
 * An encounter may be in its room only while a flag is set
 * (`presentWhile`), only until one is (`presentUntil`), or in another room
 * once one is (`movesTo`) (#398); one met stays where it was met, and no
 * room may hold two. A feature may have another description while a flag
 * is set (`changed`), and a creature's topic may be offered only while a
 * flag is set (`offeredWhile`) or only until one is (`offeredUntil`)
 * (#399).
 *
 * A feature may accept items the character carries (`uses`, #400): each
 * names its item, its words, whether the item is used up, and effects as a
 * band's. A way a use opens counts toward reachability only once the
 * feature's room and the item are reached for sure.
 *
 * A module may declare an alarm (#401): one of its flags, which only noise
 * sets: a sneak that fails by 5 or more, a fight in one of its `fights`
 * regions lasting past that region's round, a check's band marked `noisy`,
 * or an opponent that flees a fight and survives it. What the alarm
 * changes is authored with flag conditions, and its `text` is how the room
 * panel says it has been raised. Nothing else may set its flag, and
 * reachability never counts it as set for sure.
 *
 * A region may have a wandering encounter table (#403) of up to six
 * entries, each an encounter in no room or an omen (words only). Every
 * `every` moves within the region, on each rest there and when the alarm
 * is raised there, the engine rolls its chance. A module's single
 * `wanderingEncounter` (#335) is a one-entry table rolled only on rests; a
 * module has that or region tables, never both. Wandering encounters count
 * against the module's 30 encounters.
 *
 * A module with two or more regions, each with a rest site, may declare
 * itself `long` (#404): its rests are counted per region, and it has twice
 * the treasure budget for its maximum level and an XP limit one level
 * higher (D6).
 *
 * A module may declare its routes (#407): the ways from the entrance to
 * the objective, each by the rooms it must pass in order, for the balance
 * gate to judge each.
 *
 * A long module's room may be `avoidable` (#408): left out of its region's
 * sweep, so the balance gate never makes the character go there. It must
 * lie off every declared route, and can't be where the victory is won.
 * From every room of a long module the character must be able to reach an
 * exit by ways nothing can close (D9).
 *
 * Validation names the first problem it finds. A module in any other format
 * version is refused with a message naming the file.
 */
import { type Backdrop, readBackdrop } from "./backdrops-5e.js";
import {
  type GameIconId,
  isGameIconId,
  MONSTER_ICONS,
  OPPONENT_ICON,
} from "./icons-5e.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoundedJson } from "./bounded-json.js";
import {
  approachId,
  BANDS,
  isSuccess,
  MOVEMENTS,
  specAbility,
  type Band,
  type CheckSpec,
} from "./checks-5e.js";
import type {
  Combatant,
  DamageDefenses,
  DamageType,
  FeatureEffect,
} from "./encounter-5e.js";
import {
  COIN_VALUES,
  coinsInCopper,
  formatCoins,
  isCatalogueId,
  itemName,
  itemPrice,
  itemTier,
  magicOf,
  TREASURE_WEIGHT,
  type Coin,
  type Coins,
  type CatalogueId,
  type Tier,
  type ToolId,
} from "./equipment-5e.js";
import {
  isTradeGoodId,
  POTIONS,
  TREASURE_TYPES,
  type TreasureTypeData,
  type TreasureTypeId,
  magicItemProblems,
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
  isWandId,
  scrollName,
  scrollSpellProblem,
  scrollTier,
  scrollValue,
  WANDS,
  type WandId,
} from "./magic-items-5e.js";
import type { SpellId } from "./spells-5e.js";
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
  isOneOf,
  isRecord,
  knownKeys,
  list,
  ShapeError,
  text,
  unique,
} from "./json-shape.js";
import {
  type Cell,
  layoutErrors,
  readCell,
  readFloor,
  VERTICAL_KINDS,
  type VerticalKind,
} from "./map-5e.js";
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
  PARLEY_OUTCOMES,
  PARLEY_SKILLS,
  REACTION_BANDS,
  REACTION_OPTIONS,
  type AuthoredReactionBand,
  type ParleyOutcome,
  type ParleySkill,
  type ReactionOption,
} from "./reaction-5e.js";

export type { StatBlock, StatBlockAttack } from "./bestiary-5e.js";

export const FIFTH_ADVENTURE_FORMAT = 44;
/** The `kind` every adventure module file declares. */
export const FIFTH_ADVENTURE_KIND = "dungeon-one-5e-adventure";
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
/** The most opponents one encounter may have. */
export const MAX_OPPONENTS = 8;
/** The most regions one module may declare (#395). */
export const MAX_REGIONS = 10;
/** The most encounters one module may have, wandering ones included (D5). */
export const MAX_ENCOUNTERS = 30;
/** The most entries a region's wandering encounter table may have (#403). */
export const MAX_WANDERING_ENTRIES = 6;
/** The most moves within a region between its table's rolls (#403). */
export const MAX_WANDERING_EVERY = 20;
/** The most flags one module may declare (#397). */
const MAX_FLAGS = 30;
/** The encounter outcomes that may set a flag (#397). */
export const FLAG_OUTCOMES = ["won", "bypassed", "peaceful", "fled"] as const;
export type FlagOutcome = (typeof FLAG_OUTCOMES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export type FifthOpponent = Readonly<{
  id: string;
  name: string;
  description: string;
  statBlock: StatBlock;
  /**
   * The icon shown beside its name (#377): authored, or else its bestiary
   * monster's, or else a generic one.
   */
  icon: GameIconId;
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
  /**
   * The flags its outcomes set (#397): won, slipped past unfought, ended
   * peacefully, or fled from by the character.
   */
  sets?: Readonly<Partial<Record<FlagOutcome, string>>>;
  /**
   * Its room holds it only once this flag is set (#398): it appears. At
   * most one of `presentWhile`, `presentUntil` and `movesTo`.
   */
  presentWhile?: string;
  /** Its room holds it only until this flag is set (#398): it vanishes. */
  presentUntil?: string;
  /**
   * Once the flag `when` is set, it is in the room `roomId` instead of its
   * own (#398): defenders fall back, gather or take up an ambush.
   */
  movesTo?: Readonly<{ roomId: string; when: string }>;
}>;

/**
 * A room an encounter may be in (#398): while a flag is set, until one is,
 * or always.
 */
export type Placement = Readonly<{
  encounterId: string;
  roomId: string;
  while?: string;
  until?: string;
}>;

/**
 * Where an encounter was first met (#398): an encounter not yet begun goes
 * where the flags place it, and one met stays there.
 */
export type MetEncounter = Readonly<{ encounterId: string; roomId: string }>;

/** Whether flags place the encounter (#398): it appears, vanishes or moves. */
export const isConditional = (encounter: FifthEncounter): boolean =>
  encounter.presentWhile !== undefined ||
  encounter.presentUntil !== undefined ||
  encounter.movesTo !== undefined;

/**
 * Every room each placed encounter may be in (#398): its own room, while
 * its `presentWhile` flag is set or until its `presentUntil` flag is; or,
 * for one that moves, its own room until the flag and the other once it is
 * set.
 */
export function encounterPlacements(
  adventure: Pick<FifthAdventure, "rooms" | "encounters">,
): readonly Placement[] {
  return adventure.rooms.flatMap(({ id: roomId, encounterId }) => {
    const encounter = adventure.encounters.find(
      ({ id: entry }) => entry === encounterId,
    );
    if (encounter === undefined) {
      return [];
    }
    const { presentWhile, presentUntil, movesTo } = encounter;
    return movesTo !== undefined
      ? [
          { encounterId: encounter.id, roomId, until: movesTo.when },
          {
            encounterId: encounter.id,
            roomId: movesTo.roomId,
            while: movesTo.when,
          },
        ]
      : [
          {
            encounterId: encounter.id,
            roomId,
            ...(presentWhile === undefined ? {} : { while: presentWhile }),
            ...(presentUntil === undefined ? {} : { until: presentUntil }),
          },
        ];
  });
}

/**
 * `placements` by room (#398), so a lookup reads only its room's: the
 * route planner and the projections look up a room's fight at every step.
 */
export function placementsByRoom(
  placements: readonly Placement[],
): ReadonlyMap<string, readonly Placement[]> {
  const byRoom = new Map<string, Placement[]>();
  for (const placement of placements) {
    byRoom.set(placement.roomId, [
      ...(byRoom.get(placement.roomId) ?? []),
      placement,
    ]);
  }
  return byRoom;
}

/**
 * The id of the encounter in room `roomId` now (#398), from `placements`:
 * one met stays where it was met; one not yet met is where the flags set
 * place it. Undefined when none is.
 */
export function encounterInRoom(
  placements: readonly Placement[],
  roomId: string,
  flags: readonly string[],
  met: readonly MetEncounter[] = [],
): string | undefined {
  for (const placement of placements) {
    if (placement.roomId !== roomId) {
      continue;
    }
    const metIn = met.find(
      ({ encounterId }) => encounterId === placement.encounterId,
    );
    if (
      metIn !== undefined
        ? metIn.roomId === roomId
        : (placement.while === undefined || flags.includes(placement.while)) &&
          (placement.until === undefined || !flags.includes(placement.until))
    ) {
      return placement.encounterId;
    }
  }
  return undefined;
}

/**
 * A reaction-eligible encounter's reaction (#304): the options each band but
 * hostile (which always fights) offers, with optional words for it, and the
 * XP for ending the encounter peacefully, credited once on surviving
 * completion; none when left out. A band offering parley, toll or trade
 * (#305) offers the reaction's own.
 */
export type FifthReaction = Readonly<{
  bands: Readonly<
    Record<
      AuthoredReactionBand,
      Readonly<{ options: readonly ReactionOption[]; text?: string }>
    >
  >;
  peacefulXp?: number;
  parley?: FifthParley;
  /** The coin the opponents let the character pass for, with their words. */
  toll?: FifthToll;
  /** What the opponents sell and buy while a band offering trade holds. */
  trade?: FifthMerchant;
}>;

/**
 * A parley (#305): one to three approaches, Persuasion, Deception or
 * Intimidation, each with its own DC, and the bands its outcome is graded
 * into (#281). A band may move the reaction `shift` bands up (toward
 * friendly) or down (toward hostile, which fights), or have an `outcome`:
 * the opponents let the character pass, the fight begins, or (failing by
 * 5 or more only) it begins with the character surprised. A failure or
 * success by 5 or more left out counts as plain failure or success; a band
 * left out, or with only words, leaves the reaction as it was. One parley
 * is made per encounter, and remembered.
 */
export type FifthParley = Readonly<{
  approaches: readonly Readonly<{ skill: ParleySkill; dc: number }>[];
  bands: Readonly<Partial<Record<Band, ParleyBand>>>;
}>;

/** What one band of a parley does: its words, and a shift or an outcome. */
export type ParleyBand = Readonly<{
  text?: string;
  shift?: number;
  outcome?: ParleyOutcome;
}>;

/** A toll (#305): the coin to pass, and the opponents' words asking it. */
export type FifthToll = Readonly<{ coins: Coins; text?: string }>;

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
  /** The flag examining it sets (#397), whatever its check's band. */
  sets?: string;
  /**
   * Its description while a flag is set (#399): the altar after the ritual,
   * the hall after the alarm. Its discovery and check are unchanged.
   */
  changed?: Readonly<{ when: string; description: string }>;
  /** The items it accepts (#400), each once, and what using one does. */
  uses?: readonly FeatureUse[];
  /** What the character can do with it in a fight here (#402). */
  fightAction?: FeatureFightAction;
}>;

/**
 * A fight action (#402): on the character's turn, with its action, a check
 * against one opponent, made once per fight or once per adventure. Its bands
 * deal the opponent damage, give it a condition or remove it from the
 * fight; a band left out, or with only words, does nothing to it.
 */
export type FeatureFightAction = Readonly<{
  once: FightActionOnce;
  /** One approach, or 2–4 (#283), each a skill or an ability and a DC. */
  check: AuthoredCheck;
  bands: Readonly<Partial<Record<Band, FightActionBand>>>;
}>;

/** How often a fight action may be used: once per fight or per adventure. */
export const FIGHT_ACTION_ONCE = ["fight", "adventure"] as const;
export type FightActionOnce = (typeof FIGHT_ACTION_ONCE)[number];

/** What one band of a fight action does (#402): its words and its effects. */
export type FightActionBand = Readonly<{
  text?: string;
  effects?: readonly FightActionEffect[];
}>;

/** The conditions a fight action may give (#402). */
export const FIGHT_ACTION_CONDITIONS = [
  "prone",
  "poisoned",
  "paralysed",
] as const;

/**
 * One effect of a fight action's band on its opponent (#402), as the
 * encounter engine applies it (`FeatureEffect`): damage of a type, a
 * condition for a number of the opponent's turns (prone always one: it gets
 * up on its next turn), or removal from the fight (pushed into the chasm),
 * which counts as defeating it and loses what it carries.
 */
export type FightActionEffect = FeatureEffect;

/**
 * The band of a fight action whose outcome applies to a rolled band (#402):
 * a failure or success by 5 or more it doesn't author counts as plain
 * failure or success.
 */
export function fightActionBand(
  action: FeatureFightAction,
  rolled: Band,
): Band {
  return action.bands[rolled] !== undefined
    ? rolled
    : rolled === "failure-by-5"
      ? "failure"
      : rolled === "success-by-5"
        ? "success"
        : rolled;
}

/** Whether a fight action can remove its opponent from the fight (#402). */
export const removes = (action: FeatureFightAction): boolean =>
  Object.values(action.bands).some((band) =>
    (band.effects ?? []).some(({ type }) => type === "remove"),
  );

/**
 * Using an item on a feature (#400): the item, the words said, whether the
 * item is used up, and the effects, as a band's: a discovery, an item
 * revealed, damage, a passage opened or closed, or a flag set. Each use is
 * made once.
 */
export type FeatureUse = Readonly<{
  item: string;
  text: string;
  consumes?: true;
  effects: readonly CheckEffect[];
}>;

/** The most items one feature may accept (#400). */
const MAX_USES = 4;

/**
 * One effect of a check's band (#281): a feature's discovery made, an item
 * hidden in a feature revealed (found once per character, like other
 * finds), damage of a type, which can defeat the character, a passage
 * opened (a hidden one becomes a way) or closed for the rest of the
 * adventure (#282), or a flag set (#397).
 */
export type CheckEffect = Readonly<
  | { type: "discovery"; feature: string }
  | { type: "item"; item: string }
  | { type: "open" | "close"; passage: string }
  | { type: "set"; flag: string }
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
  /** Landing in it makes noise, which raises the module's alarm (#401). */
  noisy?: true;
}>;

/**
 * A circumstance (#284): the character holds an item, has made a feature's
 * discovery, or has won an encounter, or a flag is set (#397); with `not`,
 * while it hasn't. `name` is how a check card and the action bar name it.
 */
export type Circumstance = Readonly<
  (
    | { type: "holds"; item: string }
    | { type: "discovered"; feature: string }
    | { type: "won"; encounter: string }
    | { type: "flag"; flag: string }
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
      tool?: never;
      dc?: never;
      movement?: never;
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
    ...(check.movement === undefined ? {} : { movement: check.movement }),
  };
  return [
    check.skill === undefined
      ? {
          ability: check.ability!,
          dc: check.dc!,
          ...(check.tool === undefined ? {} : { tool: check.tool }),
          ...circumstances,
        }
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
 * The flag ending `encounter` sets for sure (#397), as a list: the one its
 * `won` sets, when every other final outcome it can reach sets it too. Only
 * a reaction-eligible fight (#304) can end peacefully. Slipping past it
 * (#302) or fleeing it (#396) leaves it unresolved, met again on coming
 * back, so neither counts.
 */
export function encounterSureFlags(
  encounter: FifthEncounter | undefined,
): readonly string[] {
  const won = encounter?.sets?.won;
  return won === undefined ||
    (encounter!.reaction !== undefined && encounter!.sets!.peaceful !== won)
    ? []
    : [won];
}

/** The flags a check's band sets (#397): its `set` effects. */
export const flagsSetBy = (outcome: CheckBand | undefined): readonly string[] =>
  effectsOf(outcome).flatMap((entry) =>
    entry.type === "set" ? [entry.flag] : [],
  );

/** A flag going into a room sets for sure (#397), and what sets it. */
export type SureFlagSetter = Readonly<{
  flag: string;
  /**
   * Entering the room, examining one of its features, taking one of its
   * items or ending its fight, by the room's, feature's, item's or
   * encounter's id.
   */
  by: "room" | "feature" | "item" | "encounter";
  id: string;
}>;

/**
 * What sets each flag going into `room` sets for sure (#397): entering it;
 * examining a feature, by its own `sets` (whatever its check's band) or a
 * flag every band of its check sets; taking an item in plain sight or hidden
 * in a feature of the room with no check (not one a band may never reveal,
 * nor one an opponent carries, whose body may never be searched); and
 * ending its fight (`encounterSureFlags`). The validator and the balance
 * harness both count on these, and on nothing else in the room.
 */
export function sureFlagSetters(
  room: FifthRoom,
  encounters: readonly FifthEncounter[],
): readonly SureFlagSetter[] {
  const everyBand = (check: AuthoredCheck | undefined): readonly string[] =>
    check === undefined
      ? []
      : BANDS.map((band) =>
          flagsSetBy(check.bands?.[authoredBand(check, band)]),
        ).reduce((all, flags) => all.filter((flag) => flags.includes(flag)));
  // A fight flags place (#398) may never be met here: the validator and
  // the harness count on it only where it surely is.
  const fight = encounters.find(
    (encounter) =>
      encounter.id === room.encounterId && !isConditional(encounter),
  );
  const unchecked = new Set(
    room.features.flatMap(({ id, check }) => (check === undefined ? [id] : [])),
  );
  return [
    ...(room.sets === undefined
      ? []
      : [{ flag: room.sets, by: "room" as const, id: room.id }]),
    ...room.features.flatMap(({ id, sets, check }) =>
      [
        ...new Set([
          ...(sets === undefined ? [] : [sets]),
          ...everyBand(check),
        ]),
      ].map((flag) => ({ flag, by: "feature" as const, id })),
    ),
    ...room.items.flatMap(({ id, sets, hiddenIn }) =>
      sets === undefined || (hiddenIn !== undefined && !unchecked.has(hiddenIn))
        ? []
        : [{ flag: sets, by: "item" as const, id }],
    ),
    ...(fight === undefined
      ? []
      : encounterSureFlags(fight).map((flag) => ({
          flag,
          by: "encounter" as const,
          id: fight.id,
        }))),
  ];
}

/** The flags going into `room` sets for sure (#397): `sureFlagSetters`'. */
export const roomSureFlags = (
  room: FifthRoom,
  encounters: readonly FifthEncounter[],
): readonly string[] => [
  ...new Set(sureFlagSetters(room, encounters).map(({ flag }) => flag)),
];

/**
 * What each kind of item does: the SRD 5.2 healing potions heal, a key
 * opens the locked doors that name it, treasure is kept on surviving, coin
 * goes into the purse as it is taken, and gear (a catalogue weapon, armour or
 * shield) is stowed as it is taken, ready to equip, or, for a bundle of
 * arrows or bolts, adds 20 to what the character holds (#230). A tool
 * (#284), such as a rope, does nothing by itself: a check's circumstance or
 * retry cost names it, and it is not kept after the adventure. A carried
 * item weighs its kind's `weight` in pounds (#224); coin and gear weigh what
 * the purse, the gear and the ammunition they become weigh. A spell scroll
 * or a wand (#346) is kept with the character's magic items as it is taken,
 * ready to cast from, and weighs nothing.
 */
export const ITEM_KINDS = {
  ...POTIONS,
  key: { weight: 0 },
  treasure: { weight: TREASURE_WEIGHT },
  coin: { weight: 0 },
  gear: { weight: 0 },
  tool: { weight: 0 },
  scroll: { weight: 0 },
  wand: { weight: 0 },
} as const;
export type ItemKind = keyof typeof ITEM_KINDS;
/** The kinds that are found once per character: never there to find again. */
export const FOUND_ONCE_KINDS: readonly ItemKind[] = [
  "treasure",
  "coin",
  "gear",
  "scroll",
  "wand",
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
  /** The spell it holds; present exactly on a spell scroll (#346). */
  spell?: SpellId;
  /** The catalogue wand it is; present exactly on a wand (#346). */
  wand?: WandId;
  /** The feature it is hidden in, or the opponent carrying it. */
  hiddenIn?: string;
  /** The flag taking it sets (#397). */
  sets?: string;
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
  /** Offered only once this flag is set (#399). */
  offeredWhile?: string;
  /** Offered only until this flag is set (#399), then withdrawn. */
  offeredUntil?: string;
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
  /** Its cell on the room map (#455): `[x, y]`, x east and y south. */
  at: Cell;
  /** Its floor on the room map (#455): 0 unless authored, up positive. */
  floor: number;
  description: string;
  /** The fight that begins when the character enters. */
  encounterId?: string;
  /** The character may leave the adventure from here. */
  exit?: true;
  /** The character may take its one long rest here (#335). */
  restSite?: true;
  /** The id of the region it belongs to (#395), in a module with regions. */
  region?: string;
  /** The drawing behind the room panel here (#517), in place of its region's. */
  backdrop?: Backdrop;
  /** The flag first entering it sets (#397); the start room's, at the start. */
  sets?: string;
  /**
   * Left out of its region's sweep (#408): a long module's room the
   * character may leave unvisited, off every declared route.
   */
  avoidable?: true;
  features: readonly FifthFeature[];
  items: readonly FifthItem[];
  creatures: readonly FifthCreature[];
}>;

/**
 * A part of a module, such as an upper or a lower level (#395): a group of
 * rooms, which the room map shades. In a module with regions every room belongs
 * to one, and every region has a room.
 */
export type FifthRegion = Readonly<{
  id: string;
  name: string;
  /** Its wandering encounter table (#403), if it has one. */
  wandering?: WanderingTable;
  /** The drawing behind the room panel in its rooms (#517). */
  backdrop?: Backdrop;
}>;

/**
 * A region's wandering encounter table (#403). Every `every` moves within
 * the region (never, without it), on each rest in it and when the alarm is
 * raised in it, a d100 is rolled: at `chance` or less one entry comes, the
 * entries sharing the chance equally in order (with chance 30 and three
 * entries, 1–10 the first, 11–20 the second, 21–30 the third).
 */
export type WanderingTable = Readonly<{
  chance: number;
  every?: number;
  entries: readonly WanderingEntry[];
}>;

/**
 * An entry of a wandering encounter table (#403): an encounter in no room,
 * whose fight comes at most once and is then the omen its words say; or
 * an omen alone, words that may come again and again.
 */
export type WanderingEntry = Readonly<
  { encounterId: string; omen: string } | { omen: string }
>;

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
 * A hidden trap in a passage: found by a check (searching either room, with
 * Perception or Investigation, #309), disarmed by a check once found, or
 * sprung by going through while armed, with a saving throw for half damage.
 * The search is one roll for the whole room, so `find` is only a DC and
 * never graded; `disarm` may be, and may need thieves' tools (#309).
 */
export type FifthTrap = Readonly<{
  id: string;
  name: string;
  description: string;
  find: Readonly<{ dc: number }>;
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
 * until a check's band opens it. One with `openWhen` (#397) is closed until
 * its flag is set; one with `closeWhen` is closed once its flag is set.
 */
export type FifthPassage = Readonly<{
  id: string;
  between: readonly [string, string];
  description: string;
  /** What carries it between floors (#455): only between adjacent floors. */
  vertical?: VerticalKind;
  hidden?: true;
  /** The flag that opens it (#397): closed until it is set. */
  openWhen?: string;
  /** The flag that closes it (#397) for the rest of the adventure. */
  closeWhen?: string;
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

/**
 * The ending that meets a module's objective (#475), as
 * docs/rules/balance.md has it: its victory, if it has one, or else getting
 * out with loot.
 */
export function objectiveEnding(
  adventure: Pick<FifthAdventure, "endings">,
): FifthEnding | undefined {
  return (
    adventure.endings.find(({ kind }) => kind === "victory") ??
    adventure.endings.find(({ kind }) => kind === "escape-with-loot")
  );
}

export type FifthAdventure = Readonly<{
  kind: "dungeon-one-5e-adventure";
  formatVersion: typeof FIFTH_ADVENTURE_FORMAT;
  id: string;
  title: string;
  objective: string;
  recommendedLevels: Readonly<{ min: number; max: number }>;
  difficulty: Difficulty;
  startRoomId: string;
  /**
   * A long module (#404): two short rests and one long rest in each region
   * rather than in the adventure, twice the treasure budget and an XP limit
   * one level higher (D6). It has two or more regions, each with a rest site.
   */
  long?: true;
  /** Its regions (#395), each with a room; without them, rooms have none. */
  regions?: readonly FifthRegion[];
  /** The ids of its flags (#397), each set by something and used by something. */
  flags?: readonly string[];
  /** Its alarm (#401): a flag only noise sets. */
  alarm?: FifthAlarm;
  /**
   * Its declared routes (#407): the ways from the entrance to the
   * objective the balance gate judges, each by the rooms it passes, in
   * order. Without them, the gate judges the fewest-fights route.
   */
  routes?: readonly FifthRoute[];
  rooms: readonly FifthRoom[];
  passages: readonly FifthPassage[];
  encounters: readonly FifthEncounter[];
  endings: readonly FifthEnding[];
  /**
   * The one encounter that can interrupt a rest (#335): each short or long
   * rest rolls a d100, and on `chance` or less the rest restores nothing and
   * this encounter's fight begins where the character rests. It fires at
   * most once. It is in no room. It is a one-entry wandering table rolled
   * only on rests (#403), and a module with it has no region tables.
   */
  wanderingEncounter?: WanderingEncounter;
}>;

/**
 * A declared route (#407): a way from the entrance to the objective, such
 * as "through the guard hall", given by the rooms it must pass, in order.
 */
export type FifthRoute = Readonly<{
  id: string;
  name: string;
  rooms: readonly string[];
}>;

/** The most routes a module may declare (#407), and rooms one may name. */
const MAX_ROUTES = 6;
const MAX_ROUTE_ROOMS = 20;

/**
 * A module's alarm (#401): the flag noise sets, the words the room panel
 * shows once it is raised, and the regions where a fight lasting past a
 * round makes noise. A failed sneak by 5 or more, a `noisy` band and an
 * opponent that flees a fight and survives it make noise anywhere.
 */
export type FifthAlarm = Readonly<{
  flag: string;
  text: string;
  /** A fight in `region` that goes on past round `round` makes noise. */
  fights?: readonly Readonly<{ region: string; round: number }>[];
}>;

/** The most rounds an alarm's fight may last before it makes noise (#401). */
export const MAX_ALARM_ROUND = 10;

/** A module's wandering encounter (#335) and its chance, 1–100 in a d100. */
export type WanderingEncounter = Readonly<{
  encounterId: string;
  chance: number;
}>;

/**
 * What a placed item is worth toward the treasure budget, in copper: coin's
 * amount, a gem or art object's value, a potion's or spell scroll's value
 * (#346) and gear's price. A key is worth nothing, and a magic item (a +1
 * item or a wand) is outside the budget (#345, #346, D10).
 */
export function itemValue(item: FifthItem): number {
  if (item.coins !== undefined) {
    return coinsInCopper(item.coins);
  }
  if (item.treasure !== undefined) {
    return tradeGoodValue(item.treasure);
  }
  if (item.gear !== undefined) {
    return magicOf(item.gear) === undefined ? itemPrice(item.gear) : 0;
  }
  if (item.spell !== undefined) {
    return scrollValue(item.spell);
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
    : item.spell !== undefined
      ? scrollName(item.spell)
      : item.wand !== undefined
        ? WANDS[item.wand].name
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
  if (item.spell !== undefined) {
    return scrollTier(item.spell);
  }
  if (item.wand !== undefined) {
    return WANDS[item.wand].rarity;
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
  if (!isOneOf(ABILITIES, value)) {
    fail(`${where} must be an ability.`);
  }
  return value;
}

/** The most circumstances one approach's advantage or disadvantage may name. */
const MAX_CIRCUMSTANCES = 4;
const CIRCUMSTANCE_TYPES = ["holds", "discovered", "won", "flag"] as const;

/**
 * A circumstance (#284): `{ "type": "holds", "item" }`, `{ "type":
 * "discovered", "feature" }`, `{ "type": "won", "encounter" }` or `{
 * "type": "flag", "flag" }` (#397), each with its `name` and optional `not:
 * true`. What it names is checked once the whole module is read.
 */
function circumstance(value: unknown, where: string): Circumstance {
  const kind = isRecord(value) ? value.type : undefined;
  const target = {
    holds: "item",
    discovered: "feature",
    won: "encounter",
    flag: "flag",
  } as const;
  if (!isOneOf(CIRCUMSTANCE_TYPES, kind)) {
    fail(`${where} type must be ${CIRCUMSTANCE_TYPES.join(", ")}.`);
  }
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
        : kind === "won"
          ? { type: kind, encounter: named }
          : { type: kind, flag: named }),
    name: text(raw.name, `${where} name`, 60),
    ...(raw.not === true ? { not: true as const } : {}),
  };
}

/**
 * An encounter's `sets` (#397): one or more of `won`, `bypassed`,
 * `peaceful` and `fled`, each naming the flag that outcome sets. What it
 * names is checked once the whole module is read.
 */
function outcomeFlags(
  value: unknown,
  where: string,
): Readonly<Partial<Record<FlagOutcome, string>>> {
  const raw = knownKeys(value, [], FLAG_OUTCOMES, where);
  const outcomes = FLAG_OUTCOMES.filter(
    (outcome) => raw[outcome] !== undefined,
  );
  if (outcomes.length === 0) {
    fail(
      `${where} must name a flag for at least one of ${FLAG_OUTCOMES.join(", ")}.`,
    );
  }
  return Object.fromEntries(
    outcomes.map((outcome) => [
      outcome,
      id(raw[outcome], `${where} ${outcome}`),
    ]),
  );
}

/** An approach's advantage or disadvantage: 1–4 circumstances. */
function circumstances(value: unknown, where: string): readonly Circumstance[] {
  return list(value, where, MAX_CIRCUMSTANCES).map((entry, index) =>
    circumstance(entry, `${where} ${index + 1}`),
  );
}

/**
 * A check's approach: `{ skill, dc }` or `{ ability, dc }`, each with
 * optional `advantage` and `disadvantage` circumstances (#284). A Dexterity
 * approach may name `"tool": "thieves-tools"` (#309): only a character
 * carrying them may take it.
 */
function approach(value: unknown, where: string): AuthoredApproach {
  const skilled = isRecord(value) && "skill" in value;
  const raw = knownKeys(
    value,
    [skilled ? "skill" : "ability", "dc"],
    ["advantage", "disadvantage", "movement", ...(skilled ? [] : ["tool"])],
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
  const made: AuthoredApproach = skilled
    ? { skill: skillId(raw.skill, where), dc, ...modes }
    : {
        ability: ability(raw.ability, `${where} ability`),
        dc,
        ...modes,
        ...(raw.tool === undefined ? {} : { tool: toolOf(raw.tool, where) }),
      };
  // Thieves' tools (#309) are used with Dexterity (SRD 5.2).
  if (made.tool !== undefined && made.ability !== "dexterity") {
    fail(`${where} uses thieves' tools, which make a Dexterity check.`);
  }
  if (raw.movement === undefined) {
    return made;
  }
  // Second-Story Work (#307) swaps Strength for Dexterity on a marked climb
  // or jump; no other ability's check is one.
  if (!isOneOf(MOVEMENTS, raw.movement)) {
    fail(`${where} movement must be ${MOVEMENTS.join(" or ")}.`);
  }
  if (specAbility(made) !== "strength") {
    fail(
      `${where} movement marks a climb or jump, which needs a Strength check (Athletics or Strength).`,
    );
  }
  return { ...made, movement: raw.movement };
}

/** An approach's tool (#309): thieves' tools, the only one checks use. */
function toolOf(value: unknown, where: string): ToolId {
  if (value !== "thieves-tools") {
    fail(`${where} tool must be thieves-tools.`);
  }
  return value;
}

/** An approach's skill, one the game knows. */
function skillId(value: unknown, where: string): SkillId {
  if (typeof value !== "string" || !Object.hasOwn(SKILLS, value)) {
    fail(`${where} skill must be one of ${Object.keys(SKILLS).join(", ")}.`);
  }
  return value as SkillId;
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
    case "set": {
      const raw = exactKeys(value, ["type", "flag"], where);
      return { type, flag: id(raw.flag, `${where} flag`) };
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
const EFFECT_TYPES = [
  "discovery",
  "item",
  "damage",
  "open",
  "close",
  "set",
] as const;

/** The most effects one band of a fight action may have (#402). */
const MAX_FIGHT_EFFECTS = 2;

/** A fight action's effect on its opponent (#402). */
function fightEffect(value: unknown, where: string): FightActionEffect {
  const type = isRecord(value) ? value.type : undefined;
  switch (type) {
    case "damage": {
      const raw = exactKeys(
        value,
        ["type", "dice", "sides", "modifier", "damageType"],
        where,
      );
      return {
        type,
        dice: integer(raw.dice, `${where} dice`, 1, 10),
        sides: integer(raw.sides, `${where} sides`, 2, 12),
        modifier: integer(raw.modifier, `${where} modifier`, -5, 20),
        damageType: damageType(raw.damageType, `${where} damageType`),
      };
    }
    case "condition": {
      const raw = exactKeys(value, ["type", "condition", "turns"], where);
      if (!isOneOf(FIGHT_ACTION_CONDITIONS, raw.condition)) {
        fail(
          `${where} condition must be ${FIGHT_ACTION_CONDITIONS.join(", ")}.`,
        );
      }
      const turns = integer(raw.turns, `${where} turns`, 1, 10);
      if (raw.condition === "prone" && turns !== 1) {
        fail(
          `${where} gives prone for ${turns} turns, but a prone creature gets up on its next turn: give 1.`,
        );
      }
      return { type, condition: raw.condition, turns };
    }
    case "remove":
      exactKeys(value, ["type"], where);
      return { type };
    default:
      return fail(`${where} type must be damage, condition or remove.`);
  }
}

/**
 * A feature's fight action (#402): `{ once, check, bands }`, its check one
 * approach or 2–4, each a skill or an ability and a DC only, and its bands
 * each with text or 1–2 effects of different types, a removal alone.
 */
function fightActionOf(value: unknown, where: string): FeatureFightAction {
  const raw = exactKeys(value, ["once", "check", "bands"], where);
  if (!isOneOf(FIGHT_ACTION_ONCE, raw.once)) {
    fail(`${where} once must be ${FIGHT_ACTION_ONCE.join(" or ")}.`);
  }
  if (!isRecord(raw.check)) {
    fail(`${where} check must be an object.`);
  }
  const made = approaches(raw.check, `${where} check`);
  for (const spec of approachesOf(made)) {
    if (
      spec.tool !== undefined ||
      spec.movement !== undefined ||
      spec.advantage !== undefined ||
      spec.disadvantage !== undefined
    ) {
      fail(
        `${where} check's approaches take a skill or an ability and a DC only.`,
      );
    }
  }
  const graded = knownKeys(raw.bands, [], BANDS, `${where} bands`);
  const bands: Partial<Record<Band, FightActionBand>> = {};
  for (const band of BANDS) {
    if (graded[band] === undefined) {
      continue;
    }
    const on = `${where} ${band} band`;
    const entry = knownKeys(graded[band], [], ["text", "effects"], on);
    if (entry.text === undefined && entry.effects === undefined) {
      fail(`${on} needs text or effects.`);
    }
    const effects =
      entry.effects === undefined
        ? undefined
        : list(entry.effects, `${on} effects`, MAX_FIGHT_EFFECTS).map(
            (effectValue, index) =>
              fightEffect(effectValue, `${on} effect ${index + 1}`),
          );
    if (effects !== undefined) {
      distinct(
        effects,
        ({ type }) => type,
        ({ type }) => `${on} has two ${type} effects.`,
      );
      if (effects.length > 1 && effects.some(({ type }) => type === "remove")) {
        fail(`${on} removes its opponent, so it can have no other effect.`);
      }
    }
    bands[band] = {
      ...(entry.text === undefined
        ? {}
        : { text: text(entry.text, `${on} text`) }),
      ...(effects === undefined ? {} : { effects }),
    };
  }
  if (!Object.values(bands).some(({ effects }) => effects !== undefined)) {
    fail(`${where} needs a band with effects.`);
  }
  return { once: raw.once, check: made, bands };
}

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
    approachId,
    (entry) =>
      `${where} offers ${approachId(entry)} twice; each approach needs its own skill or ability.`,
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
        const raw = knownKeys(
          graded[band],
          [],
          ["text", "effects", "noisy"],
          on,
        );
        if (raw.text === undefined && raw.effects === undefined) {
          fail(`${on} needs text or effects.`);
        }
        if (raw.noisy !== undefined && raw.noisy !== true) {
          fail(`${on} noisy must be true, or left out.`);
        }
        return [
          [
            band,
            {
              ...(raw.text === undefined
                ? {}
                : { text: text(raw.text, `${on} text`) }),
              ...(raw.noisy === true ? { noisy: true as const } : {}),
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
 * for a skill or a tool (#309). The bands between them are the ones the validator counts
 * reachable, and the balance harness's always-fail and always-succeed
 * check policies (#285) make every check at one end.
 */
export function extremeTotals(
  spec: CheckSpec,
  level: number,
): readonly [number, number] {
  const proficiency = proficiencyBonus(level as Level);
  return [
    1 - 4,
    20 +
      5 +
      (spec.skill === undefined && spec.tool === undefined ? 0 : proficiency),
  ];
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
      [
        "check",
        "failure",
        "offeredWhile",
        "offeredUntil",
        ...(gifts ? ["gives"] : []),
      ],
      on,
    );
    const topicId = id(topic.id, `${on} id`);
    if (
      topic.offeredWhile !== undefined &&
      topic.offeredWhile === topic.offeredUntil
    ) {
      fail(`topic ${topicId} is offered while and until the same flag.`);
    }
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
      ...(topic.offeredWhile === undefined
        ? {}
        : { offeredWhile: id(topic.offeredWhile, `${on} offeredWhile`) }),
      ...(topic.offeredUntil === undefined
        ? {}
        : { offeredUntil: id(topic.offeredUntil, `${on} offeredUntil`) }),
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
 * authors 1–5 distinct options and optional words; hostile always fights,
 * so it authors none. Every band offers attack or let pass, so the
 * character can always end the reaction (#305). Parley, toll and trade are
 * the reaction's own (`merchant` reads its trade), offered only by the
 * bands that name them, and each one authored is offered by some band.
 */
function reactionOf(
  value: unknown,
  where: string,
  merchant: (value: unknown, where: string) => FifthMerchant,
): FifthReaction {
  const raw = knownKeys(
    value,
    ["bands"],
    ["peacefulXp", ...OWN_OPTIONS],
    where,
  );
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
      const own = OWN_OPTIONS.find((entry) => entry === option);
      if (own !== undefined && raw[own] === undefined) {
        fail(`${on} offers ${own}, but ${where} authors no ${own}.`);
      }
      return option as ReactionOption;
    });
    distinct(
      options,
      (option) => option,
      (option) => `${on} offers ${option} twice.`,
    );
    if (!options.includes("attack") && !options.includes("let-pass")) {
      fail(
        `${on} offers neither attack nor let-pass, so the character could never end the reaction: give it one.`,
      );
    }
    return {
      options,
      ...(entry.text === undefined
        ? {}
        : { text: text(entry.text, `${on} text`) }),
    };
  };
  const reaction: FifthReaction = {
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
    ...(raw.parley === undefined
      ? {}
      : { parley: parleyOf(raw.parley, `${where} parley`) }),
    ...(raw.toll === undefined
      ? {}
      : { toll: tollOf(raw.toll, `${where} toll`) }),
    ...(raw.trade === undefined
      ? {}
      : { trade: merchant(raw.trade, `${where} trade`) }),
  };
  for (const own of OWN_OPTIONS) {
    if (
      raw[own] !== undefined &&
      !AUTHORED_REACTION_BANDS.some((band) =>
        reaction.bands[band].options.includes(own),
      )
    ) {
      fail(`${where} authors a ${own}, but no band offers it.`);
    }
  }
  return reaction;
}

/** The options a reaction authors itself (#305), each offered by name. */
const OWN_OPTIONS = ["parley", "toll", "trade"] as const;

/** The most bands a parley's band may move a reaction, up or down (#305). */
const MAX_SHIFT = REACTION_BANDS.length - 1;

/**
 * A reaction's parley (#305): `{ approaches: [...], bands: {...} }`, 1–3
 * approaches `{ skill, dc }`, each a different one of Persuasion, Deception
 * and Intimidation, and its bands, each with optional `text` and one of
 * `shift` (−4 to 4, not 0) or `outcome`.
 */
function parleyOf(value: unknown, where: string): FifthParley {
  const raw = exactKeys(value, ["approaches", "bands"], where);
  const approaches = list(
    raw.approaches,
    `${where} approaches`,
    PARLEY_SKILLS.length,
  ).map((entry, index) => {
    const on = `${where} approach ${index + 1}`;
    const spec = exactKeys(entry, ["skill", "dc"], on);
    if (!PARLEY_SKILLS.includes(spec.skill as ParleySkill)) {
      fail(`${on} skill must be one of ${PARLEY_SKILLS.join(", ")}.`);
    }
    return {
      skill: spec.skill as ParleySkill,
      dc: integer(spec.dc, `${on} dc`, 5, 30),
    };
  });
  distinct(
    approaches,
    ({ skill }) => skill,
    ({ skill }) =>
      `${where} offers ${skill} twice; each approach needs its own skill.`,
  );
  const graded = knownKeys(raw.bands, [], BANDS, `${where} bands`);
  if (Object.keys(graded).length === 0) {
    fail(`${where} bands must author at least one band.`);
  }
  return {
    approaches,
    bands: Object.fromEntries(
      BANDS.flatMap((band) => {
        if (graded[band] === undefined) {
          return [];
        }
        const on = `${where} ${band} band`;
        const entry = knownKeys(
          graded[band],
          [],
          ["text", "shift", "outcome"],
          on,
        );
        if (Object.keys(entry).length === 0) {
          fail(`${on} needs text, a shift or an outcome.`);
        }
        if (entry.shift !== undefined && entry.outcome !== undefined) {
          fail(`${on} has a shift and an outcome: give it one.`);
        }
        if (entry.shift === 0) {
          fail(`${on} shift 0 moves nothing: leave it out.`);
        }
        if (
          entry.outcome !== undefined &&
          !PARLEY_OUTCOMES.includes(entry.outcome as ParleyOutcome)
        ) {
          fail(`${on} outcome must be one of ${PARLEY_OUTCOMES.join(", ")}.`);
        }
        if (entry.outcome === "surprise-attack" && band !== "failure-by-5") {
          fail(
            `${on} outcome surprise-attack is only for the failure-by-5 band.`,
          );
        }
        return [
          [
            band,
            {
              ...(entry.text === undefined
                ? {}
                : { text: text(entry.text, `${on} text`) }),
              ...(entry.shift === undefined
                ? {}
                : {
                    shift: integer(
                      entry.shift,
                      `${on} shift`,
                      -MAX_SHIFT,
                      MAX_SHIFT,
                    ),
                  }),
              ...(entry.outcome === undefined
                ? {}
                : { outcome: entry.outcome as ParleyOutcome }),
            },
          ],
        ];
      }),
    ),
  };
}

/** A reaction's toll (#305): `{ coins: {...}, text? }`. */
function tollOf(value: unknown, where: string): FifthToll {
  const raw = knownKeys(value, ["coins"], ["text"], where);
  return {
    coins: coins(raw.coins, `${where} coins`),
    ...(raw.text === undefined
      ? {}
      : { text: text(raw.text, `${where} text`) }),
  };
}

function validateModule(
  value: unknown,
  bestiary: FifthBestiary,
): FifthAdventure {
  if (!isRecord(value) || value.kind !== FIFTH_ADVENTURE_KIND) {
    fail("not a 5e adventure module.");
  }
  if (value.formatVersion !== FIFTH_ADVENTURE_FORMAT) {
    fail(
      `format version ${String(value.formatVersion)} is not ${FIFTH_ADVENTURE_FORMAT}.`,
    );
  }
  const module = knownKeys(
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
    ["long", "regions", "flags", "alarm", "routes", "wanderingEncounter"],
    "the module",
  );
  if (module.long !== undefined && module.long !== true) {
    fail("long must be true, or left out.");
  }
  const long = module.long === true;
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
    if (!isOneOf(ENDING_KINDS, ending.kind)) {
      fail(`${where} kind must be ${ENDING_KINDS.join(", ")}.`);
    }
    if (ending.kind === "defeat" && ending.xp !== undefined) {
      fail(`${where}: a defeat ending awards no XP.`);
    }
    return {
      id: id(ending.id, `${where} id`),
      kind: ending.kind,
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
      if (magicOf(entry) !== undefined) {
        fail(
          `${where} stocks the magic ${entry}, but no merchant sells magic items.`,
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
  const encounters = list(module.encounters, "encounters", MAX_ENCOUNTERS).map(
    (entry, index) => {
      const where = `encounter ${index + 1}`;
      const encounter = knownKeys(
        entry,
        ["id", "opponents", "defeatEndingId"],
        [
          "victoryEndingId",
          "bypassXp",
          "sneakAgain",
          "lurking",
          "reaction",
          "sets",
          "presentWhile",
          "presentUntil",
          "movesTo",
        ],
        where,
      );
      if (
        ["presentWhile", "presentUntil", "movesTo"].filter(
          (field) => encounter[field] !== undefined,
        ).length > 1
      ) {
        fail(
          `${where} may have only one of presentWhile, presentUntil and movesTo.`,
        );
      }
      const movesTo =
        encounter.movesTo === undefined
          ? undefined
          : exactKeys(
              encounter.movesTo,
              ["roomId", "when"],
              `${where} movesTo`,
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
                "icon",
              ],
              at,
            )
          : knownKeys(
              raw,
              ["id", "name", "description", "statBlock"],
              ["boss", "surrender", "reacts", "icon"],
              at,
            );
        if (opponent.boss !== undefined && opponent.boss !== true) {
          fail(`${at} boss must be true, or left out.`);
        }
        if (opponent.reacts !== undefined && opponent.reacts !== true) {
          fail(`${at} reacts must be true, or left out.`);
        }
        const opponentId = id(opponent.id, `${at} id`);
        if (opponent.icon !== undefined && !isGameIconId(opponent.icon)) {
          fail(
            `${at} (${opponentId}) icon must name an icon in src/icons-5e.ts.`,
          );
        }
        const authoredIcon = opponent.icon as GameIconId | undefined;
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
            icon: authoredIcon ?? OPPONENT_ICON,
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
          icon: authoredIcon ?? MONSTER_ICONS[monsterId] ?? OPPONENT_ICON,
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
          : reactionOf(encounter.reaction, `${where} reaction`, merchant);
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
        ...(encounter.sets === undefined
          ? {}
          : { sets: outcomeFlags(encounter.sets, `${where} sets`) }),
        ...(encounter.presentWhile === undefined
          ? {}
          : {
              presentWhile: id(encounter.presentWhile, `${where} presentWhile`),
            }),
        ...(encounter.presentUntil === undefined
          ? {}
          : {
              presentUntil: id(encounter.presentUntil, `${where} presentUntil`),
            }),
        ...(movesTo === undefined
          ? {}
          : {
              movesTo: {
                roomId: id(movesTo.roomId, `${where} movesTo roomId`),
                when: id(movesTo.when, `${where} movesTo when`),
              },
            }),
      };
    },
  );
  const encounterIds = unique(encounters, "encounter");
  const regions =
    module.regions === undefined
      ? undefined
      : list(module.regions, "regions", MAX_REGIONS).map((entry, index) => {
          const where = `region ${index + 1}`;
          const region = knownKeys(
            entry,
            ["id", "name"],
            ["wandering", "backdrop"],
            where,
          );
          const regionId = id(region.id, `${where} id`);
          return {
            id: regionId,
            name: text(region.name, `${where} name`, 60),
            ...(region.wandering === undefined
              ? {}
              : { wandering: wanderingTable(region.wandering, regionId) }),
            ...readBackdrop(region.backdrop, `region ${regionId}`),
          };
        });
  const regionIds = unique(regions ?? [], "region");
  // Flags (#397): ids, each declared once; what sets and uses each is
  // checked once the whole module is read.
  const flags =
    module.flags === undefined
      ? []
      : list(module.flags, "flags", MAX_FLAGS).map((entry, index) =>
          id(entry, `flag ${index + 1}`),
        );
  distinct(
    flags,
    (flag) => flag,
    (flag) => `flag ${flag} is declared twice.`,
  );
  const alarm =
    module.alarm === undefined
      ? undefined
      : readAlarm(module.alarm, new Set(flags), regionIds);
  const rooms = list(module.rooms, "rooms", 50).map((entry, index) => {
    const where = `room ${index + 1}`;
    const room = knownKeys(
      entry,
      ["id", "name", "at", "description", "features", "items"],
      [
        "floor",
        "encounterId",
        "creatures",
        "exit",
        "restSite",
        "region",
        "backdrop",
        "sets",
        "avoidable",
      ],
      where,
    );
    if (room.region !== undefined && !regionIds.has(room.region as string)) {
      fail(
        `${where} (${String(room.id)}) names unknown region ${String(room.region)}.`,
      );
    }
    if (room.exit !== undefined && room.exit !== true) {
      fail(`${where} exit must be true, or left out.`);
    }
    if (room.restSite !== undefined && room.restSite !== true) {
      fail(`${where} restSite must be true, or left out.`);
    }
    if (room.avoidable !== undefined && room.avoidable !== true) {
      fail(`room ${String(room.id)} avoidable must be true, or left out.`);
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
          ["discovery", "check", "sets", "changed", "uses", "fightAction"],
          at,
        );
        const uses =
          feature.uses === undefined
            ? undefined
            : list(feature.uses, `${at} uses`, MAX_USES).map((value, index) => {
                const on = `${at} use ${index + 1}`;
                const use = knownKeys(
                  value,
                  ["item", "text", "effects"],
                  ["consumes"],
                  on,
                );
                if (use.consumes !== undefined && use.consumes !== true) {
                  fail(`${on} consumes must be true, or left out.`);
                }
                return {
                  item: id(use.item, `${on} item`),
                  text: text(use.text, `${on} text`),
                  ...(use.consumes === true ? { consumes: true as const } : {}),
                  effects: list(use.effects, `${on} effects`, MAX_EFFECTS).map(
                    (entry, number) =>
                      effect(entry, `${on} effect ${number + 1}`),
                  ),
                };
              });
        if (uses !== undefined) {
          distinct(
            uses,
            ({ item }) => item,
            ({ item }) =>
              `${at} (${String(feature.id)}) accepts item ${item} twice.`,
          );
        }
        const changed =
          feature.changed === undefined
            ? undefined
            : exactKeys(
                feature.changed,
                ["when", "description"],
                `${at} changed`,
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
          ...(feature.sets === undefined
            ? {}
            : { sets: id(feature.sets, `${at} sets`) }),
          ...(uses === undefined ? {} : { uses }),
          ...(feature.fightAction === undefined
            ? {}
            : {
                fightAction: fightActionOf(
                  feature.fightAction,
                  `${at} fightAction`,
                ),
              }),
          ...(changed === undefined
            ? {}
            : {
                changed: {
                  when: id(changed.when, `${at} changed when`),
                  description: text(
                    changed.description,
                    `${at} changed description`,
                  ),
                },
              }),
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
          ["coins", "gear", "treasure", "spell", "wand", "hiddenIn", "sets"],
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
        // A spell scroll names its spell, a wand its catalogue wand (#346).
        if (item.kind === "scroll") {
          const problem =
            item.spell === undefined
              ? "it needs a spell"
              : scrollSpellProblem(String(item.spell));
          if (problem !== undefined) {
            fail(`${at} is a spell scroll, but ${problem}`);
          }
        }
        if (item.kind !== "scroll" && item.spell !== undefined) {
          fail(`${at} has a spell, but only a spell scroll has one.`);
        }
        if (item.kind === "wand" && !isWandId(item.wand)) {
          fail(
            `${at} is a wand, so it needs wand: one of ${Object.keys(WANDS).join(", ")}.`,
          );
        }
        if (item.kind !== "wand" && item.wand !== undefined) {
          fail(`${at} has wand, but only a wand has one.`);
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
          ...(item.spell === undefined ? {} : { spell: item.spell as SpellId }),
          ...(item.wand === undefined ? {} : { wand: item.wand as WandId }),
          ...(item.hiddenIn === undefined
            ? {}
            : { hiddenIn: item.hiddenIn as string }),
          ...(item.sets === undefined
            ? {}
            : { sets: id(item.sets, `${at} sets`) }),
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
      at: readCell(room.at, `${where} (${String(room.id)}) at`),
      floor: readFloor(room.floor, `${where} (${String(room.id)}) floor`),
      description: text(room.description, `${where} description`),
      ...(room.encounterId === undefined
        ? {}
        : { encounterId: room.encounterId as string }),
      ...(room.exit === true ? { exit: true as const } : {}),
      ...(room.restSite === true ? { restSite: true as const } : {}),
      ...(room.region === undefined ? {} : { region: room.region as string }),
      ...readBackdrop(room.backdrop, `${where} (${String(room.id)})`),
      ...(room.avoidable === true ? { avoidable: true as const } : {}),
      ...(room.sets === undefined
        ? {}
        : { sets: id(room.sets, `${where} sets`) }),
      features,
      items,
      creatures,
    };
  });
  const roomIds = unique(rooms, "room");
  // Regions (#395): every room has one, or none does, and each has a room.
  if (rooms.some(({ region }) => region !== undefined)) {
    const index = rooms.findIndex(({ region }) => region === undefined);
    if (index !== -1) {
      fail(
        `room ${index + 1} (${rooms[index]!.id}) has no region, but other rooms have one: give every room a region, or none.`,
      );
    }
  }
  for (const { id: regionId } of regions ?? []) {
    if (!rooms.some(({ region }) => region === regionId)) {
      fail(`region ${regionId} has no room: give it one, or leave it out.`);
    }
  }
  // A long module (#404) rests per region, so each region has a rest site.
  if (long) {
    const count = regions?.length ?? 0;
    if (count < 2) {
      fail(
        `a long module needs at least two regions: it has ${count === 0 ? "none" : "one"}.`,
      );
    }
    for (const { id: regionId } of regions!) {
      if (
        !rooms.some(
          ({ region, restSite }) => region === regionId && restSite === true,
        )
      ) {
        fail(
          `region ${regionId} has no rest site: a long module needs one in each region.`,
        );
      }
    }
  }
  // Only a long module is swept (#408), so only its rooms are avoidable.
  const avoidable = rooms.filter((room) => room.avoidable === true);
  if (!long && avoidable.length > 0) {
    fail(
      `room ${avoidable[0]!.id} is avoidable, but only a long module's rooms are swept.`,
    );
  }
  const routes =
    module.routes === undefined
      ? undefined
      : readRoutes(
          module.routes,
          new Set(rooms.map(({ id: roomId }) => roomId)),
        );
  // D8 (#408): an avoidable room lies off every declared route.
  for (const { id: roomId } of avoidable) {
    const route = routes?.find(({ rooms: on }) => on.includes(roomId));
    if (route !== undefined) {
      fail(
        `room ${roomId} is avoidable, but route ${route.id} names it: an avoidable room must lie off every declared route.`,
      );
    }
  }
  // D10 and D11 (#345): one magic item, from level 3, none needing
  // attunement; a wand (#346) is one.
  const [magicProblem] = magicItemProblems(
    rooms.flatMap(({ items }) =>
      items.flatMap(({ id: itemId, gear, wand }) => {
        const magic =
          wand !== undefined
            ? WANDS[wand]
            : gear === undefined
              ? undefined
              : magicOf(gear);
        return magic === undefined ? [] : [{ id: itemId, magic }];
      }),
    ),
    max,
  );
  if (magicProblem !== undefined) {
    fail(`module ${moduleId}: ${magicProblem}`);
  }
  const worth = findableValue({ rooms });
  const budget = treasureBudget(max, long);
  if (worth > budget) {
    fail(
      `module ${moduleId}: its findable treasure is worth ${formatCoins(worth)}, ${formatCoins(worth - budget)} over the ${formatCoins(budget)} budget for ${long ? "a long module at " : ""}level ${max}.`,
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
  const wanderingEncounter = wandering(
    module.wanderingEncounter,
    encounters,
    rooms,
  );
  // Region tables (#403): each fight entry names a wandering encounter as
  // the module's one does, and each wandering encounter is in one table.
  const tabled = (regions ?? []).flatMap(({ id: regionId, wandering: table }) =>
    (table?.entries ?? []).flatMap((entry) =>
      "encounterId" in entry
        ? [{ regionId, encounterId: entry.encounterId }]
        : [],
    ),
  );
  if (
    wanderingEncounter !== undefined &&
    (regions ?? []).some(({ wandering: table }) => table !== undefined)
  ) {
    fail(
      "a module has a wanderingEncounter or regions with wandering tables, not both.",
    );
  }
  for (const { regionId, encounterId } of tabled) {
    wanderer(
      encounterId,
      encounters,
      rooms,
      `region ${regionId}'s wandering table`,
    );
  }
  distinct(
    tabled,
    ({ encounterId }) => encounterId,
    ({ encounterId }) =>
      `wandering encounter ${encounterId} is in more than one wandering table entry.`,
  );
  const wanderers = new Set([
    ...(wanderingEncounter === undefined
      ? []
      : [wanderingEncounter.encounterId]),
    ...tabled.map(({ encounterId }) => encounterId),
  ]);
  for (const { id: encounterId } of encounters) {
    if (!placed.includes(encounterId) && !wanderers.has(encounterId)) {
      fail(`encounter ${encounterId} is in no room.`);
    }
  }
  // Encounters flags place (#398): one moves to a known room not its own;
  // the one whose fight wins the adventure stays put; and no room may hold
  // two.
  for (const encounter of encounters) {
    const { id: encounterId, movesTo, victoryEndingId } = encounter;
    if (movesTo !== undefined) {
      if (!roomIds.has(movesTo.roomId)) {
        fail(
          `encounter ${encounterId} moves to unknown room ${movesTo.roomId}.`,
        );
      }
      if (
        rooms.some(
          ({ id: roomId, encounterId: here }) =>
            here === encounterId && roomId === movesTo.roomId,
        )
      ) {
        fail(
          `encounter ${encounterId} moves to room ${movesTo.roomId}, which is already its own.`,
        );
      }
    }
    if (isConditional(encounter) && victoryEndingId !== undefined) {
      fail(
        `encounter ${encounterId} ends the adventure in victory, so it can't appear, vanish or move.`,
      );
    }
  }
  // A fight met stays where it was met, so two encounters that may each be
  // in a room could both be there, whatever their flags.
  const placements = encounterPlacements({ rooms, encounters });
  placements.forEach((one, index) => {
    const other = placements
      .slice(index + 1)
      .find(
        ({ roomId, encounterId }) =>
          roomId === one.roomId && encounterId !== one.encounterId,
      );
    if (other !== undefined) {
      fail(
        `room ${one.roomId} may hold encounters ${one.encounterId} and ${other.encounterId} at once; only one fight waits in a room.`,
      );
    }
  });
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
    // Picking a lock needs thieves' tools (#309), on every approach.
    if (
      checks.pick !== undefined &&
      approachesOf(checks.pick).some(({ tool }) => tool === undefined)
    ) {
      fail(
        `door ${doorId}: picking a lock needs thieves' tools; make its pick a Dexterity check with "tool": "thieves-tools".`,
      );
    }
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
      find: {
        dc: integer(
          exactKeys(raw.find, ["dc"], `${where} find`).dc,
          `${where} find dc`,
          5,
          30,
        ),
      },
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
        ["vertical", "door", "trap", "hidden", "openWhen", "closeWhen"],
        where,
      );
      if (
        passage.vertical !== undefined &&
        !isOneOf(VERTICAL_KINDS, passage.vertical)
      ) {
        fail(`${where} vertical must be ${VERTICAL_KINDS.join(", ")}.`);
      }
      if (passage.hidden !== undefined && passage.hidden !== true) {
        fail(`${where} hidden must be true, or left out.`);
      }
      // A hidden passage is opened by a band (#282); a flag opens one that
      // is there to see (#397).
      if (passage.hidden === true && passage.openWhen !== undefined) {
        fail(
          `${where} is hidden and has openWhen: a band opens a hidden passage, a flag one already there to see.`,
        );
      }
      if (
        passage.openWhen !== undefined &&
        passage.openWhen === passage.closeWhen
      ) {
        fail(`${where} opens and closes on the same flag.`);
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
        ...(passage.vertical === undefined
          ? {}
          : { vertical: passage.vertical as VerticalKind }),
        ...(passage.hidden === true ? { hidden: true as const } : {}),
        ...(passage.openWhen === undefined
          ? {}
          : { openWhen: id(passage.openWhen, `${where} openWhen`) }),
        ...(passage.closeWhen === undefined
          ? {}
          : { closeWhen: id(passage.closeWhen, `${where} closeWhen`) }),
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
  // Flags (#397): each one named is declared; each declared is set by
  // something and used by something.
  const declaredFlags = new Set(flags);
  const flagNamed = (flag: string, on: string) => {
    if (!declaredFlags.has(flag)) {
      fail(`${on} names unknown flag ${flag}.`);
    }
  };
  const setters = new Set<string>();
  const flagUsers = new Set<string>();
  // Only noise raises the alarm (#401): nothing else may set its flag.
  if (alarm !== undefined) {
    setters.add(alarm.flag);
  }
  const setBy = (flag: string, on: string) => {
    flagNamed(flag, on);
    if (flag === alarm?.flag) {
      fail(`${on} sets ${flag}, the alarm's flag: only noise raises it.`);
    }
    setters.add(flag);
  };
  for (const room of rooms) {
    const sets = [
      ...(room.sets === undefined
        ? []
        : [[room.sets, `room ${room.id}`] as const]),
      ...room.features.flatMap(({ id: featureId, sets: flag }) =>
        flag === undefined ? [] : [[flag, `feature ${featureId}`] as const],
      ),
      ...room.items.flatMap(({ id: itemId, sets: flag }) =>
        flag === undefined ? [] : [[flag, `item ${itemId}`] as const],
      ),
    ];
    for (const [flag, on] of sets) {
      setBy(flag, on);
    }
  }
  for (const {
    id: encounterId,
    sets,
    presentWhile,
    presentUntil,
    movesTo,
  } of encounters) {
    for (const [outcome, flag] of Object.entries(sets ?? {})) {
      setBy(flag, `encounter ${encounterId}'s ${outcome}`);
    }
    // Where it is (#398).
    for (const flag of [presentWhile, presentUntil, movesTo?.when]) {
      if (flag !== undefined) {
        flagNamed(flag, `encounter ${encounterId}`);
        flagUsers.add(flag);
      }
    }
  }
  for (const { id: passageId, openWhen, closeWhen } of passages) {
    for (const flag of [openWhen, closeWhen]) {
      if (flag !== undefined) {
        flagNamed(flag, `passage ${passageId}`);
        flagUsers.add(flag);
      }
    }
  }
  // A feature's changed description and a topic's offer (#399) use flags.
  const allTopics = [
    ...rooms.flatMap(({ creatures }) =>
      creatures.flatMap(({ topics }) => topics),
    ),
    ...encounters.flatMap(({ opponents }) =>
      opponents.flatMap(({ surrender }) => surrender?.topics ?? []),
    ),
  ];
  for (const { id: featureId, changed } of rooms.flatMap(
    ({ features }) => features,
  )) {
    if (changed !== undefined) {
      flagNamed(changed.when, `feature ${featureId}`);
      flagUsers.add(changed.when);
    }
  }
  for (const { id: topicId, offeredWhile, offeredUntil } of allTopics) {
    for (const flag of [offeredWhile, offeredUntil]) {
      if (flag !== undefined) {
        flagNamed(flag, `topic ${topicId}`);
        flagUsers.add(flag);
      }
    }
  }
  /** Hidden passages some band opens, and who can close each passage. */
  const openable = new Set<string>();
  const closers = new Map<string, string[]>();
  /**
   * Checks one effect of a band, or of a use of an item on a feature
   * (#400): it names a feature with a discovery, an item hidden in a
   * feature, a defeat ending, a passage (only a hidden one opened) or a
   * flag. `on` names where it is.
   */
  const checkEffect = (entry: CheckEffect, on: string) => {
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
          fail(`${on} reveals ${placed.id}, which is not hidden in a feature.`);
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
      case "set":
        setBy(entry.flag, on);
        break;
    }
  };
  for (const site of authoredChecks({ rooms, passages, encounters })) {
    const label = siteLabel(site);
    // Thieves' tools (#309) pick locks and disarm traps, and nothing else.
    if (
      site.kind !== "pick" &&
      site.kind !== "disarm" &&
      approachesOf(site.check).some(({ tool }) => tool !== undefined)
    ) {
      fail(
        `${label} uses thieves' tools, which only pick a lock or disarm a trap.`,
      );
    }
    for (const band of BANDS) {
      const outcome = site.check.bands?.[band];
      if (outcome === undefined) {
        continue;
      }
      const on = `${label}'s ${band} band`;
      if (outcome.noisy === true && alarm === undefined) {
        fail(`${on} is noisy, but the module has no alarm for it to raise.`);
      }
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
        checkEffect(entry, on);
      }
    }
  }
  // Each use of an item on a feature (#400) names an item the character
  // can hold, which only a use that keeps it may be treasure, and effects as
  // a band's.
  for (const { id: featureId, uses } of featureById.values()) {
    for (const use of uses ?? []) {
      const on = `feature ${featureId}'s use of ${use.item}`;
      const placed = itemRooms.get(use.item)?.item;
      if (placed === undefined) {
        fail(`${on} names unknown item ${use.item}.`);
      }
      if (
        placed.kind === "coin" ||
        placed.kind === "gear" ||
        placed.kind === "scroll" ||
        placed.kind === "wand"
      ) {
        fail(
          `${on} names ${placed.id}, which is ${placed.kind}: it goes into the ${placed.kind === "coin" ? "purse" : placed.kind === "gear" ? "stowed gear" : "magic items"}, so it is never carried to use.`,
        );
      }
      if (use.consumes === true && placed.kind === "treasure") {
        fail(
          `${on} uses up ${placed.id}, which is treasure: treasure is sold or carried out, never used up.`,
        );
      }
      if (use.effects.length === 0) {
        fail(`${on} needs effects.`);
      }
      for (const entry of use.effects) {
        checkEffect(entry, on);
      }
    }
  }
  // A fight action (#402) needs a fight in its room: the room's own
  // encounter, one flags move there (#398), or the wandering encounter at
  // a rest site (#335). One that can remove an opponent is used once per
  // adventure, and never where a boss may be fought (D4), nor where an
  // opponent carries an item needed to go on: a key to a door, or an item
  // a use needs (#331, #400). Its other loot is lost with it.
  const neededFor = new Map<string, string>([
    ...passages.flatMap(({ door: shut }) =>
      shut?.keyItemId === undefined
        ? []
        : [[shut.keyItemId, `opens door ${shut.id}`] as const],
    ),
    ...[...featureById.values()].flatMap(({ id: featureId, uses }) =>
      (uses ?? []).map(
        ({ item }) => [item, `feature ${featureId}'s use needs`] as const,
      ),
    ),
  ]);
  for (const { id: roomId, encounterId, restSite, features } of rooms) {
    const fought = encounters.filter(
      ({ id: fightId, movesTo }) =>
        fightId === encounterId ||
        movesTo?.roomId === roomId ||
        (restSite === true && fightId === wanderingEncounter?.encounterId) ||
        // A region's wandering encounters (#403) may come anywhere in it.
        tabled.some(
          (entry) =>
            entry.encounterId === fightId &&
            entry.regionId === rooms.find(({ id }) => id === roomId)?.region,
        ),
    );
    for (const { id: featureId, fightAction } of features) {
      if (fightAction === undefined) {
        continue;
      }
      const on = `feature ${featureId}'s fight action`;
      if (fought.length === 0) {
        fail(
          `${on} needs a fight, but no fight is ever fought in room ${roomId}.`,
        );
      }
      if (!removes(fightAction)) {
        continue;
      }
      if (fightAction.once !== "adventure") {
        fail(
          `${on} can remove an opponent, so it must be usable once per adventure.`,
        );
      }
      for (const { id: fightId, opponents } of fought) {
        const boss = opponents.find((opponent) => opponent.boss === true);
        if (boss !== undefined) {
          fail(
            `${on} can remove an opponent, but boss ${boss.id} of encounter ${fightId} may be fought in room ${roomId}: a boss is never removed.`,
          );
        }
        const home = rooms.find((entry) => entry.encounterId === fightId);
        for (const { id: opponentId } of opponents) {
          for (const { id: itemId, hiddenIn } of home?.items ?? []) {
            const why = neededFor.get(itemId);
            if (hiddenIn === opponentId && why !== undefined) {
              fail(
                `${on} can remove an opponent, but ${opponentId} of encounter ${fightId}, which may be fought in room ${roomId}, carries ${itemId}, which ${why}: removed, it would be lost with it.`,
              );
            }
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
        if (
          placed.kind === "coin" ||
          placed.kind === "gear" ||
          placed.kind === "scroll" ||
          placed.kind === "wand"
        ) {
          fail(
            `${on} names ${placed.id}, which is ${placed.kind}: it goes into the ${placed.kind === "coin" ? "purse" : placed.kind === "gear" ? "stowed gear" : "magic items"}, so it is never held.`,
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
      case "flag":
        flagNamed(entry.flag, on);
        flagUsers.add(entry.flag);
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
      fail(
        `passage ${passageId} is hidden, but no check's band or use of an item opens it.`,
      );
    }
  }
  for (const flag of flags) {
    if (!setters.has(flag)) {
      fail(
        `flag ${flag} is never set: a band, an encounter, an item, a room or a feature must set it.`,
      );
    }
    if (!flagUsers.has(flag)) {
      fail(
        `flag ${flag} is never used: a passage, a circumstance, an encounter, a feature or a topic must name it, or leave it out.`,
      );
    }
  }
  // A passage a flag closes (#397) can cut a route off, as a band's close.
  for (const { id: passageId, closeWhen } of passages) {
    if (closeWhen !== undefined) {
      closers.set(passageId, [
        ...(closers.get(passageId) ?? []),
        `flag ${closeWhen}`,
      ]);
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
  // The room map (#455): its rules live in map-5e.ts, shared with the
  // mapping tool.
  const [layoutError] = layoutErrors(rooms, passages);
  if (layoutError !== undefined) {
    fail(layoutError);
  }
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
  /**
   * The approaches a character can take: without thieves' tools (#309),
   * none that needs them.
   */
  const topicById = new Map(allTopics.map((topic) => [topic.id, topic]));
  /**
   * Whether a topic's check is surely there to make once `flags` are set
   * (#399): one withdrawn once a flag is set may be gone before it is
   * asked, and one offered only once a flag is set waits for it. Any other
   * check is.
   */
  const surelyOffered = (site: AuthoredSite, flags: ReadonlySet<string>) => {
    const topic = site.kind === "talk" ? topicById.get(site.id) : undefined;
    return (
      topic?.offeredUntil === undefined &&
      (topic?.offeredWhile === undefined || flags.has(topic.offeredWhile))
    );
  };
  const takeable = (site: AuthoredSite, tools: boolean) =>
    approachesOf(site.check).filter(({ tool }) => tools || tool === undefined);
  /** The effective bands some character can roll on a check. */
  const outcomesOf = (site: AuthoredSite, tools: boolean): readonly Band[] => [
    ...new Set(
      BANDS.filter((band) =>
        takeable(site, tools).some((spec) => bandReachable(band, spec, max)),
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
  /** The flags reaching each room sets for sure (#397). */
  const roomFlags = new Map(
    rooms.map((room) => [room.id, roomSureFlags(room, encounters)] as const),
  );
  /**
   * The uses of items on features (#400) that can be counted on, each with
   * its feature's room and its item's: an item in plain sight or hidden in a
   * feature with no check (not one a band may never reveal, nor one an
   * opponent carries), that nothing else uses up first.
   */
  const usingUp = [
    ...[...featureById.values()].flatMap(({ uses }) =>
      (uses ?? []).flatMap(({ item, consumes }) =>
        consumes === true ? [item] : [],
      ),
    ),
    ...sites.flatMap(({ check: { retry } }) =>
      retry?.cost?.type === "item" ? [retry.cost.item] : [],
    ),
  ];
  const sureUseSites = rooms.flatMap(({ id: roomId, features }) =>
    features.flatMap(({ uses }) =>
      (uses ?? []).flatMap((use) => {
        const { item, roomId: itemRoomId } = itemRooms.get(use.item)!;
        const holder =
          item.hiddenIn === undefined
            ? undefined
            : featureById.get(item.hiddenIn);
        return (item.hiddenIn !== undefined &&
          (holder === undefined || holder.check !== undefined)) ||
          usingUp.filter((id) => id === use.item).length >
            (use.consumes === true ? 1 : 0)
          ? []
          : [{ roomId, itemRoomId, use }];
      }),
    ),
  );
  /** Each encounter flags place (#398), with its own room. */
  const placedByFlags = encounters.flatMap((fight) => {
    const own = rooms.find(({ encounterId }) => encounterId === fight.id);
    return isConditional(fight) && own !== undefined
      ? [[fight, own.id] as const]
      : [];
  });
  /**
   * Whether a fight flags place (#398) is surely met, given the rooms
   * `reached` and the flags `flagged` for sure: one that moves once its new
   * room is reached and either its flag is set or its own room is reached
   * too, as wherever it is the character meets it; one that appears once
   * its room is reached and its flag is set; one that vanishes never, as
   * it may be gone first.
   */
  const surelyMet = (
    fight: FifthEncounter,
    own: string,
    reached: ReadonlySet<string>,
    flagged: ReadonlySet<string>,
  ) =>
    fight.movesTo !== undefined
      ? reached.has(fight.movesTo.roomId) &&
        (flagged.has(fight.movesTo.when) || reached.has(own))
      : fight.presentWhile !== undefined &&
        reached.has(own) &&
        flagged.has(fight.presentWhile);
  /** The rooms reached for sure, and the flags set for sure (#397). */
  type Reach = Readonly<{ rooms: Set<string>; flags: Set<string> }>;
  /**
   * With `fixed`, fights flags place (#398) count as staying in their own
   * rooms, to tell when moving one is what cuts a room off.
   */
  const reachable = (
    excluded: ReadonlySet<string>,
    tools = false,
    fixed = false,
  ): Reach => {
    // The rooms reached from `from` through ways needing no check, and the
    // passages in `extra` a band has made ways; and the flags set on the
    // way, beside those in `set` (#397). Flags only turn on, so the two
    // grow together until neither changes.
    const closure = (
      from: ReadonlySet<string>,
      extra: ReadonlySet<string>,
      set: ReadonlySet<string>,
    ): Reach => {
      const reached = new Set(from);
      const flagged = new Set(set);
      // A key in a feature with a check is found only on some bands.
      const keyed = (shut: FifthDoor) =>
        shut.keyItemId !== undefined &&
        reached.has(itemRooms.get(shut.keyItemId)!.roomId) &&
        featureById.get(itemRooms.get(shut.keyItemId)!.item.hiddenIn ?? "")
          ?.check === undefined;
      // A use of an item on a feature (#400) is made for sure once its
      // feature's room and its item are reached for sure.
      const used = new Set<string>();
      const passable = (entry: FifthPassage) =>
        !excluded.has(entry.id) &&
        entry.trap === undefined &&
        (entry.openWhen === undefined || flagged.has(entry.openWhen)) &&
        (extra.has(entry.id) ||
          used.has(entry.id) ||
          (entry.hidden !== true &&
            (entry.door === undefined || keyed(entry.door))));
      for (let grew = true; grew;) {
        grew = false;
        const sureUses = sureUseSites.filter(
          ({ roomId, itemRoomId }) =>
            reached.has(roomId) && reached.has(itemRoomId),
        );
        for (const { use } of sureUses) {
          for (const entry of use.effects) {
            if (entry.type === "open" && !used.has(entry.passage)) {
              used.add(entry.passage);
              grew = true;
            }
          }
        }
        const sureFlags = [
          ...sureUses.flatMap(({ use }) =>
            use.effects.flatMap((entry) =>
              entry.type === "set" ? [entry.flag] : [],
            ),
          ),
          ...[...reached].flatMap((roomId) => roomFlags.get(roomId)!),
          ...placedByFlags.flatMap(([fight, own]) =>
            (fixed ? reached.has(own) : surelyMet(fight, own, reached, flagged))
              ? encounterSureFlags(fight)
              : [],
          ),
        ];
        for (const flag of sureFlags) {
          if (!flagged.has(flag)) {
            flagged.add(flag);
            grew = true;
          }
        }
        for (const entry of passages) {
          const [from, to] = entry.between;
          if (reached.has(from) !== reached.has(to) && passable(entry)) {
            reached.add(from).add(to);
            grew = true;
          }
        }
      }
      return { rooms: reached, flags: flagged };
    };
    let sure = closure(
      new Set([module.startRoomId as string]),
      new Set(),
      new Set(),
    );
    // A check reached for sure adds what every band of it reaches, and the
    // flags every band of it sets (#397).
    for (let grew = true; grew;) {
      grew = false;
      for (const site of sites) {
        // A character may carry no thieves' tools (#309): a check only
        // they can make is never counted on.
        if (
          !siteRooms(site).some((roomId) => sure.rooms.has(roomId)) ||
          takeable(site, tools).length === 0 ||
          !surelyOffered(site, sure.flags)
        ) {
          continue;
        }
        const ways = outcomesOf(site, tools).map((band) =>
          closure(
            sure.rooms,
            opensOn(site, band),
            new Set([...sure.flags, ...flagsSetBy(site.check.bands?.[band])]),
          ),
        );
        const forward: Reach = {
          rooms: new Set(
            [...ways[0]!.rooms].filter((roomId) =>
              ways.every((way) => way.rooms.has(roomId)),
            ),
          ),
          flags: new Set(
            [...ways[0]!.flags].filter((flag) =>
              ways.every((way) => way.flags.has(flag)),
            ),
          ),
        };
        if (
          forward.rooms.size > sure.rooms.size ||
          forward.flags.size > sure.flags.size
        ) {
          sure = forward;
          grew = true;
        }
      }
    }
    return sure;
  };
  const freeReach = reachable(new Set());
  // A surrendered opponent hands over what it carries only through a topic
  // (#238), so a topic that gives must stay there to ask (#399): never
  // withdrawn, and offered only once a flag set for sure is set.
  for (const { id: topicId, gives, offeredWhile, offeredUntil } of allTopics) {
    if (gives === undefined) {
      continue;
    }
    if (offeredUntil !== undefined) {
      fail(
        `topic ${topicId} gives ${gives.join(", ")}, but is withdrawn once flag ${offeredUntil} is set: what it gives could be lost.`,
      );
    }
    if (offeredWhile !== undefined && !freeReach.flags.has(offeredWhile)) {
      fail(
        `topic ${topicId} gives ${gives.join(", ")}, but is offered only once flag ${offeredWhile} is set, which nothing sets for sure.`,
      );
    }
  }
  const free = freeReach.rooms;
  const safe = reachable(new Set(closers.keys())).rooms;
  /**
   * Fails when `what` is cut off only because a fight flags place (#398)
   * may never be met where the character is sure to go: the flag its fight
   * sets is then never counted on. Names the first such encounter.
   */
  const placedCutOff = (what: string, gone: (sure: Set<string>) => boolean) => {
    if (!gone(reachable(new Set(), false, true).rooms)) {
      const blamed = placedByFlags.find(
        ([fight, own]) =>
          encounterSureFlags(fight).length > 0 &&
          !surelyMet(fight, own, freeReach.rooms, freeReach.flags),
      );
      if (blamed !== undefined) {
        const [fight] = blamed;
        const how =
          fight.movesTo !== undefined
            ? `once flag ${fight.movesTo.when} is set it moves to room ${fight.movesTo.roomId}, where it may never be met`
            : fight.presentWhile !== undefined
              ? `it is there only once flag ${fight.presentWhile} is set`
              : `it vanishes once flag ${fight.presentUntil!} is set`;
        fail(
          `encounter ${fight.id} can cut off ${what}: ${how}, so flag ${encounterSureFlags(fight).join(", ")} its fight sets is never set for sure.`,
        );
      }
    }
  };
  /** A door only thieves' tools open (#309): no key, force or break. */
  const toolsOnly = (shut: FifthDoor) =>
    shut.pick !== undefined &&
    shut.keyItemId === undefined &&
    shut.force === undefined &&
    shut.break === undefined;
  /** What thieves' tools would reach (#309), to name a tools-only route. */
  const tooled = reachable(new Set(), true).rooms;
  /**
   * Fails naming the check whose close can cut `what` off, when one alone
   * can; otherwise the checks that can between them.
   */
  const cutOff = (what: string, gone: (sure: Set<string>) => boolean) => {
    for (const [passageId, who] of closers) {
      if (gone(reachable(new Set([passageId])).rooms)) {
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
      placedCutOff(`essential room ${roomId}`, (sure) => !sure.has(roomId));
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
              entry.door === undefined
                ? undefined
                : toolsOnly(entry.door)
                  ? `${entry.door.id}, which only thieves' tools open`
                  : entry.door.id,
              entry.trap?.id,
              entry.hidden === true ? entry.id : undefined,
              // A flag that opens it (#397), when nothing sure sets it.
              entry.openWhen === undefined ||
              freeReach.flags.has(entry.openWhen)
                ? undefined
                : `${entry.id}, which opens only once flag ${entry.openWhen} is set`,
            ].filter((guard): guard is string => guard !== undefined)
          : [];
      });
      fail(
        tooled.has(roomId)
          ? `room ${roomId} is essential, but its only route needs thieves' tools (${guards.join(", ")}); add a key, another way through, or another passage.`
          : `room ${roomId} is essential, but every route to it needs a check or passes a trap (${guards.join(", ")}).`,
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
    placedCutOff("every exit", (sure) => !exitIn(sure));
    fail(
      exitIn(tooled)
        ? "every exit needs thieves' tools to reach; one must be reachable without them."
        : "every exit needs a check or passes a trap; one must be free to reach.",
    );
  }
  if (hasExit && !exitIn(safe)) {
    cutOff("every exit room", (sure) => !exitIn(sure));
  }
  for (const { id: roomId, encounterId } of avoidable) {
    if (encounterId !== undefined && winning.has(encounterId)) {
      fail(
        `room ${roomId} is avoidable, but winning its fight is the module's victory.`,
      );
    }
  }
  // D9 (#408): from every room of a long module the character can reach an
  // exit, by ways nothing can close, so a hurt character can leave with
  // what it found. A way it came by that can close is not counted on.
  if (long) {
    const lasting = passages.filter(
      ({ id: passageId }) => !closers.has(passageId),
    );
    for (const { id: roomId, region } of rooms) {
      const reached = new Set([roomId]);
      for (let grew = true; grew;) {
        grew = false;
        for (const { between } of lasting) {
          const [from, to] = between;
          if (reached.has(from) !== reached.has(to)) {
            reached.add(from).add(to);
            grew = true;
          }
        }
      }
      if (!exitIn(reached)) {
        const closing = passages.flatMap(({ id: passageId, between }) =>
          closers.has(passageId) &&
          between.some((end) => reached.has(end)) &&
          !between.every((end) => reached.has(end))
            ? [passageId]
            : [],
        );
        fail(
          `region ${region!} has no exit to reach from room ${roomId}: ` +
            (!hasExit
              ? "the module has no exit."
              : `every way out passes ${closing.length === 1 ? "passage" : "passages"} ${closing.join(", ")}, which can close. Every region of a long module needs an exit the character can reach from each of its rooms (D9).`),
        );
      }
    }
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
  // So can a use's (#400).
  for (const { uses } of featureById.values()) {
    for (const { effects } of uses ?? []) {
      for (const entry of effects) {
        if (entry.type === "damage") {
          damageEndings.add(entry.defeatEndingId);
        }
      }
    }
  }
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
    ...(long ? { long: true as const } : {}),
    ...(regions === undefined ? {} : { regions }),
    ...(flags.length === 0 ? {} : { flags }),
    ...(alarm === undefined ? {} : { alarm }),
    ...(routes === undefined ? {} : { routes }),
    rooms,
    passages,
    encounters,
    endings,
    ...(wanderingEncounter === undefined ? {} : { wanderingEncounter }),
  };
}

/**
 * A module's declared routes (#407): 1 to `MAX_ROUTES` routes, each
 * `{ id, name, rooms }`, its id unique and its rooms 1 to
 * `MAX_ROUTE_ROOMS` of the module's rooms, each once.
 */
function readRoutes(
  value: unknown,
  roomIds: ReadonlySet<string>,
): readonly FifthRoute[] {
  const routes = list(value, "routes", MAX_ROUTES).map((entry, index) => {
    const where = `route ${index + 1}`;
    const raw = exactKeys(entry, ["id", "name", "rooms"], where);
    const routeId = id(raw.id, `${where} id`);
    const rooms = list(raw.rooms, `${where} rooms`, MAX_ROUTE_ROOMS).map(
      (roomId, at) => id(roomId, `${where} room ${at + 1}`),
    );
    for (const [at, roomId] of rooms.entries()) {
      if (!roomIds.has(roomId)) {
        fail(`route ${routeId} names unknown room ${roomId}.`);
      }
      if (rooms.indexOf(roomId) !== at) {
        fail(`route ${routeId} names room ${roomId} twice.`);
      }
    }
    return { id: routeId, name: text(raw.name, `${where} name`, 80), rooms };
  });
  unique(routes, "route");
  return routes;
}

/**
 * A module's alarm (#401): `{ flag, text, fights? }`. Its flag is one of the
 * module's; each of its `fights` names a region of the module, each once,
 * and the round (1 to `MAX_ALARM_ROUND`) a fight there may last before it
 * makes noise.
 */
function readAlarm(
  value: unknown,
  flags: ReadonlySet<string>,
  regionIds: ReadonlySet<string>,
): FifthAlarm {
  const raw = knownKeys(value, ["flag", "text"], ["fights"], "alarm");
  const flag = id(raw.flag, "alarm flag");
  if (!flags.has(flag)) {
    fail(`the alarm names unknown flag ${flag}.`);
  }
  const fights =
    raw.fights === undefined
      ? undefined
      : list(raw.fights, "alarm fights", MAX_REGIONS).map((entry, index) => {
          const where = `alarm fight ${index + 1}`;
          const fight = exactKeys(entry, ["region", "round"], where);
          const region = id(fight.region, `${where} region`);
          if (!regionIds.has(region)) {
            fail(`${where} names unknown region ${region}.`);
          }
          return {
            region,
            round: integer(fight.round, `${where} round`, 1, MAX_ALARM_ROUND),
          };
        });
  if (fights !== undefined) {
    distinct(
      fights,
      ({ region }) => region,
      ({ region }) => `the alarm names region ${region} twice.`,
    );
  }
  return {
    flag,
    text: text(raw.text, "alarm text", 200),
    ...(fights === undefined ? {} : { fights }),
  };
}

/**
 * A module's wandering encounter (#335), validated: it names an encounter in
 * no room, whose fight can't end the adventure in victory, that no one
 * sneaks past or up on, that never lies in wait or reacts, and whose
 * opponents never surrender; its chance is 1–100.
 */
function wandering(
  value: unknown,
  encounters: readonly FifthEncounter[],
  rooms: readonly FifthRoom[],
): WanderingEncounter | undefined {
  if (value === undefined) {
    return undefined;
  }
  const raw = exactKeys(value, ["encounterId", "chance"], "wanderingEncounter");
  const encounterId = id(raw.encounterId, "wanderingEncounter encounterId");
  wanderer(encounterId, encounters, rooms, "wanderingEncounter");
  return {
    encounterId,
    chance: integer(raw.chance, "wanderingEncounter chance", 1, 100),
  };
}

/**
 * A region's wandering encounter table (#403), its shape validated: a
 * chance of 1–100, at least one for each entry so each can come; `every`,
 * if given, 1–`MAX_WANDERING_EVERY` moves; and 1–`MAX_WANDERING_ENTRIES`
 * entries, each an omen's words, with the encounter it names until its
 * fight has come. The encounters are checked once the rooms are read.
 */
function wanderingTable(value: unknown, regionId: string): WanderingTable {
  const where = `region ${regionId}'s wandering table`;
  const raw = knownKeys(value, ["chance", "entries"], ["every"], where);
  const entries = list(raw.entries, `${where} entries`, MAX_WANDERING_ENTRIES);
  const chance = integer(raw.chance, `${where} chance`, 1, 100);
  if (chance < entries.length) {
    fail(
      `${where} has ${entries.length} entries but a chance of ${chance}: each entry needs at least 1 of the d100.`,
    );
  }
  return {
    chance,
    ...(raw.every === undefined
      ? {}
      : {
          every: integer(raw.every, `${where} every`, 1, MAX_WANDERING_EVERY),
        }),
    entries: entries.map((entry, index) => {
      const on = `${where} entry ${index + 1}`;
      const read = knownKeys(entry, ["omen"], ["encounterId"], on);
      const omen = text(read.omen, `${on} omen`, 200);
      return read.encounterId === undefined
        ? { omen }
        : { encounterId: id(read.encounterId, `${on} encounterId`), omen };
    }),
  };
}

/**
 * Checks that encounter `encounterId`, named by `by`, can wander (#335,
 * #403): it is in no room, its fight can't end the adventure in victory,
 * no one sneaks past or up on it, it never lies in wait or reacts, it
 * never appears, vanishes or moves, and its opponents never surrender.
 */
function wanderer(
  encounterId: string,
  encounters: readonly FifthEncounter[],
  rooms: readonly FifthRoom[],
  by: string,
): void {
  const fight = encounters.find(({ id: entry }) => entry === encounterId);
  if (fight === undefined) {
    fail(`${by} names unknown encounter ${encounterId}.`);
  }
  const where = `wandering encounter ${encounterId}`;
  const placedIn = rooms.find((entry) => entry.encounterId === encounterId);
  if (placedIn !== undefined) {
    fail(
      `${where} is in room ${placedIn.id}: it comes to the character as it rests, so it is in no room.`,
    );
  }
  if (fight.victoryEndingId !== undefined) {
    fail(`${where} can't end the adventure in victory.`);
  }
  for (const field of ["bypassXp", "sneakAgain", "lurking"] as const) {
    if (fight[field] !== undefined) {
      fail(
        `${where} can't have ${field}: no one sneaks up on it, and it never lies in wait.`,
      );
    }
  }
  if (fight.reaction !== undefined) {
    fail(`${where} can't have a reaction: it comes upon the character.`);
  }
  if (isConditional(fight)) {
    fail(
      `${where} can't appear, vanish or move: it is in no room, and comes to the character as it rests.`,
    );
  }
  for (const opponent of fight.opponents) {
    if (opponent.surrender !== undefined) {
      fail(
        `${where} opponent ${opponent.id} can't surrender: it is met in no room, so it could never be talked to.`,
      );
    }
  }
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
    decoded.kind === FIFTH_ADVENTURE_KIND &&
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
  "bramblecote-cider-house": "bramblecote-cider-house.json",
  "coldwater-weirgate": "coldwater-weirgate.json",
  "thornwood-lodge": "thornwood-lodge.json",
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
