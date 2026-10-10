/**
 * Spells as data (SRD 5.2, #336): each spell's level, school, casting time
 * and what the engine does with it. The casting engine in `encounter-5e.ts`
 * reads only this data, so it never asks which spell it is casting.
 *
 * Effect kinds:
 * - `attack`: a melee or ranged spell attack (d20 + the spell attack bonus
 *   against AC); a hit deals the damage, its dice doubled by a critical hit.
 *   A ranged one follows the ranged-weapon rule: disadvantage from the
 *   fight's second round (D6).
 * - `save`: the target makes a saving throw against the caster's spell save
 *   DC; a failure takes the damage, a success half of it (rounded down) or
 *   none.
 * - `auto-hit`: missiles that always hit, each dealing its own roll (Magic
 *   Missile).
 * - `healing`: the dice plus the caster's spellcasting ability modifier.
 * - `buff` (#337): an ongoing effect on the caster or an ally, lasting as
 *   its duration's band says (`effectEnds`, D9), some while the caster
 *   concentrates on it: a die added to attack rolls and saving throws
 *   (Bless), a bonus to AC (Shield of Faith, Shield) or a base AC (Mage
 *   Armor); a die added to the next ability check (Guidance, #339), or a
 *   die taken off damage of a type chosen at casting (Resistance, #339).
 * - `flavour` (#339): no effect in play (Thaumaturgy); it is never cast.
 * - An attack may give the next attack roll against its target advantage
 *   (Guiding Bolt, #339).
 * - `control` (#340): the target saves or has a condition until the end
 *   of its next turn, then saves again or has a worse one for as long as
 *   the caster concentrates (Sleep). Damage ends it on the target, and a
 *   creature immune to exhaustion succeeds without a roll. A hold (#341,
 *   Hold Person) works on one creature type, keeps its condition until a
 *   repeat save succeeds, and damage doesn't end it.
 * - `restoration` (#341): ends a condition on the caster or an ally
 *   (Lesser Restoration).
 * - `spectral-weapon` (#341): a melee spell attack as it is cast, then one
 *   more as a bonus action on each later turn while the caster
 *   concentrates (Spiritual Weapon).
 * - Buffs (#341) may also raise maximum and current hit points (Aid) or
 *   ward against poison (Protection from Poison, which also ends being
 *   poisoned).
 * - A healing spell may heal its dice alone and give a short rest's
 *   recovery of feature uses, once per long rest (#341, Prayer of Healing,
 *   cast in minutes and so only outside a fight).
 * - An area spell (#338) declares its shape and size, and so the most
 *   opponents it can catch (`maxTargets`, D4); the caster chooses them.
 * - A spell may take a damage type chosen at casting (`damageTypes`, #339,
 *   #340): the one Resistance resists, or the one Chromatic Orb deals, or
 *   the one Protection from Energy (#342) gives resistance to.
 * - `curse` (#342): the target saves or is cursed while the caster
 *   concentrates, with the curse chosen at casting (Bestow Curse).
 * - `guardians` (#342): an area that damages the opponents it catches as
 *   it is cast and again at the end of each of their turns while the
 *   caster concentrates (Spirit Guardians).
 * - Buffs (#342) may also give advantage on Wisdom saves and maximise
 *   healing (Beacon of Hope), or resistance to the damage type chosen at
 *   casting (Protection from Energy).
 * - An attack (#343) may be several rays, each its own attack roll, split
 *   among the targets chosen (Scorching Ray); deal half its damage on a
 *   miss and more at the end of the target's next turn on a hit (Acid
 *   Arrow); give its target a condition on a hit (Ray of Sickness); or
 *   burst, hit or miss, for a saving throw against more damage (Ice Knife).
 * - Buffs (#343) may also give attacks on their holder disadvantage (Blur)
 *   or illusory duplicates that a hit may strike instead (Mirror Image).
 *
 * Without positions or a clock, ranges are left out and areas and
 * durations are abstracted; the rules document lists what that omits.
 */
import type { Ability } from "./class-5e.js";
import type {
  ConditionImmunity,
  ConditionKind,
  DamageType,
} from "./encounter-5e.js";

/**
 * How long a spell takes to cast: the Magic action, a bonus action, a
 * reaction, or minutes (#341: Prayer of Healing's ten), which only time
 * outside a fight allows.
 */
export type CastingTime = "action" | "bonus-action" | "reaction" | "minutes";

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation";

/** Dice of a spell's damage or healing. */
export type SpellDice = Readonly<{ dice: number; sides: number }>;

/** A spell's damage: its dice and type. */
export type SpellDamage = SpellDice & Readonly<{ type: DamageType }>;

/**
 * What a buff spell's effect does while it lasts (#337): a die added to the
 * target's attack rolls and saving throws, a bonus to its AC, or a base AC
 * in place of its unarmoured 10 (only while it wears no armour). Guidance's
 * die (#339) is added to the next ability check, which ends it;
 * Resistance's (#339) is taken off damage of the type chosen at casting,
 * once a turn.
 */
export type Buff = Readonly<
  | { kind: "die"; sides: number }
  | { kind: "armor-class"; bonus: number }
  | { kind: "base-armor-class"; base: number }
  | { kind: "check-die"; sides: number }
  | { kind: "damage-reduction"; sides: number }
  /**
   * A control effect's hold on an opponent (#340): Sleep's, while its
   * conditions last. It ends when the target takes damage, unless it is a
   * `hold` (#341, Hold Person), which only a save or the caster's
   * concentration ends. Turn Undead's (#341) is a `turning`: damage, an
   * attack on the target, or the turner being incapacitated ends it.
   */
  | { kind: "control"; by?: "hold" | "turning" }
  /** More maximum and current hit points while it lasts (#341, Aid). */
  | { kind: "max-hp"; bonus: number }
  /**
   * Protection from Poison (#341): resistance to poison damage, and
   * advantage on saving throws against being poisoned.
   */
  | { kind: "poison-ward" }
  /**
   * A spectral weapon the caster commands (#341, Spiritual Weapon): a
   * bonus action makes its melee spell attack, dealing these dice of its
   * type + the caster's spellcasting modifier.
   */
  | { kind: "spectral-weapon"; dice: number; sides: number; type: DamageType }
  /**
   * A spell its target can't benefit from again until a long rest (#341,
   * Prayer of Healing): it does nothing else.
   */
  | { kind: "lockout" }
  /**
   * Beacon of Hope (#342): advantage on Wisdom saving throws, and the most
   * hit points possible from any healing. There are no death saving throws.
   */
  | { kind: "beacon" }
  /**
   * Protection from Energy (#342): resistance to the damage type chosen at
   * casting.
   */
  | { kind: "energy-ward" }
  /**
   * Bestow Curse's curse on its target (#342), as chosen at casting:
   * disadvantage on its attack rolls against the caster, or the extra
   * `damage` whenever the caster damages it with an attack roll or a spell.
   */
  | { kind: "curse"; curse: CurseId; damage: SpellDamage }
  /**
   * Spirit Guardians around their caster (#342): each opponent they caught
   * at casting saves on `ability` at the end of each of its turns, taking
   * the damage, or half on a success.
   */
  | { kind: "guardians"; ability: Ability; damage: SpellDamage }
  /** Blur (#343): attack rolls against its holder have disadvantage. */
  | { kind: "blur" }
  /**
   * Mirror Image (#343): the `duplicates` left. Each hit on its holder by
   * an attack roll rolls a d6 for each; any 3 or higher strikes a
   * duplicate instead, which is destroyed.
   */
  | { kind: "mirror-image"; duplicates: number }
  /**
   * Acid Arrow's acid (#343) on the opponent it hit: the damage it takes
   * at the end of its next turn.
   */
  | { kind: "later-damage"; damage: SpellDamage }
>;

/**
 * The curses Bestow Curse may lay (#342, owner-approved): disadvantage on
 * the target's attack rolls against the caster, or extra necrotic damage
 * from the caster's attacks and spells. The ability and Dodge curses are
 * omitted.
 */
export const CURSES = ["attacks", "necrotic"] as const;
export type CurseId = (typeof CURSES)[number];

/** A curse's name as the player sees it (#342). */
export const CURSE_NAMES: Readonly<Record<CurseId, string>> = {
  attacks: "disadvantage on its attacks against you",
  necrotic: "extra necrotic damage from your attacks and spells",
};

/**
 * The damage types Resistance may be cast against (SRD 5.2, #339): every
 * type but force and psychic.
 */
export const RESISTANCE_DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "radiant",
  "slashing",
  "thunder",
] as const satisfies readonly DamageType[];

/**
 * The damage types Chromatic Orb may deal (SRD 5.2, #340), chosen at
 * casting.
 */
export const CHROMATIC_ORB_DAMAGE_TYPES = [
  "acid",
  "cold",
  "fire",
  "lightning",
  "poison",
  "thunder",
] as const satisfies readonly DamageType[];

/**
 * The damage types Protection from Energy may resist (SRD 5.2, #342),
 * chosen at casting.
 */
export const ENERGY_DAMAGE_TYPES = [
  "acid",
  "cold",
  "fire",
  "lightning",
  "thunder",
] as const satisfies readonly DamageType[];

/**
 * A spell's duration as SRD 5.2 gives it (#337): a number of minutes (1
 * minute, 10 minutes, 8 hours as 480), or until the start of the caster's
 * next turn (Shield's one round).
 */
export type SpellDuration = Readonly<
  { minutes: number } | { until: "next-turn" }
>;

/**
 * When an ongoing effect ends without a clock (#337, D9): at the start of
 * the caster's next turn; when the fight ends (up to 1 minute); at the next
 * rest, short or long (10 minutes to 1 hour); or at a long rest or the
 * adventure's end (8 hours). Each also ends when the fight or rest says,
 * and a concentration spell when concentration ends.
 */
export type EffectEnds = "next-turn" | "fight" | "rest" | "long-rest";

/** The band a spell's duration falls in (D9). */
export function effectEnds(duration: SpellDuration): EffectEnds {
  if ("until" in duration) {
    return "next-turn";
  }
  return duration.minutes <= 1
    ? "fight"
    : duration.minutes <= 60
      ? "rest"
      : "long-rest";
}

/**
 * Whether an effect ending `ends` outlasts the fight it was cast in (#337):
 * one lasting to a rest or a long rest. Only those are cast out of a fight.
 */
export function outlastsFight(ends: EffectEnds): boolean {
  return ends === "rest" || ends === "long-rest";
}

/** What a spell does to its target. */
export type SpellEffect = Readonly<
  | {
      kind: "attack";
      range: "melee" | "ranged";
      damage: SpellDamage;
      /**
       * On a hit, the next attack roll against the target before the end
       * of the caster's next turn has advantage (Guiding Bolt, #339).
       */
      nextAttackAdvantage?: true;
      /**
       * Rays (#343, Scorching Ray): this many attack rolls, split as evenly
       * as they go among the targets chosen, the first ones taking any
       * more; a ray whose target has fallen goes at the next one standing.
       */
      rays?: number;
      /** A miss deals half the damage, rounded down (#343, Acid Arrow). */
      missHalf?: true;
      /** A hit deals this too at the end of the target's next turn (#343). */
      later?: SpellDamage;
      /**
       * A hit gives the target this condition for `turns` of its turns
       * (#343, Ray of Sickness's poison until the end of the caster's next
       * turn).
       */
      condition?: Readonly<{ kind: ConditionKind; turns: number }>;
      /**
       * Hit or miss, the target then saves on `ability` or takes `damage`
       * (#343, Ice Knife's burst; its 5 feet catch only the target, D4).
       */
      burst?: Readonly<{ ability: Ability; damage: SpellDamage }>;
    }
  | {
      kind: "save";
      ability: Ability;
      /** What a successful save takes: half the damage, or none. */
      onSuccess: "half" | "none";
      damage: SpellDamage;
    }
  | {
      kind: "auto-hit";
      /** The missiles cast at the spell's own level. */
      missiles: number;
      /** Each missile's damage: its dice, its flat bonus and its type. */
      damage: SpellDamage & Readonly<{ modifier: number }>;
    }
  /**
   * The dice plus the caster's spellcasting ability modifier, unless
   * `noModifier` (#341, Prayer of Healing). A healing spell with
   * `restBenefit` also gives a short rest's recovery of feature uses, and
   * its target can't benefit from it again until a long rest (#341).
   */
  | {
      kind: "healing";
      healing: SpellDice;
      noModifier?: true;
      restBenefit?: true;
    }
  /**
   * An ongoing effect on the caster or an ally (#337), for as long as its
   * duration's band, and while the caster concentrates on it if it needs
   * concentration.
   */
  | {
      kind: "buff";
      buff: Buff;
      duration: SpellDuration;
      concentration?: true;
    }
  /** No effect in play (#339): flavour only, so never cast. */
  | { kind: "flavour" }
  /**
   * A control spell (#340, Sleep): the target makes an `ability` save or
   * has `condition` until the end of its next turn, then saves again or has
   * `then` for as long as the caster concentrates. Damage ends it on the
   * target. A creature immune to exhaustion succeeds without a roll.
   */
  | {
      kind: "control";
      ability: Ability;
      condition: ConditionKind;
      /**
       * The worse condition a failed repeat save gives (Sleep's); without
       * it (#341, Hold Person) a failed repeat save keeps the condition.
       */
      then?: ConditionKind;
      duration: SpellDuration;
      concentration: true;
      /**
       * What makes a creature succeed without a roll: exhaustion for Sleep,
       * the condition itself for Hold Person (#341).
       */
      immunity: ConditionImmunity;
      /** The only creature type it works on (#341: Hold Person's humanoid). */
      creatureType?: string;
      /** A hold (#341, Hold Person): damage doesn't end it. */
      hold?: true;
    }
  /**
   * Ends one of `conditions` on its target (#341, Lesser Restoration): the
   * first it has, in this order.
   */
  | { kind: "restoration"; conditions: readonly ConditionKind[] }
  /**
   * A spectral weapon (#341, Spiritual Weapon): a melee spell attack as it
   * is cast, dealing the damage + the spellcasting modifier; then the
   * weapon stays while the caster concentrates, attacking again with a
   * bonus action on each later turn.
   */
  | {
      kind: "spectral-weapon";
      damage: SpellDamage;
      duration: SpellDuration;
      concentration: true;
    }
  /**
   * A curse (#342, Bestow Curse): the target saves on `ability` or is
   * cursed, as chosen at casting, while the caster concentrates; the
   * necrotic curse deals `damage`.
   */
  | {
      kind: "curse";
      ability: Ability;
      damage: SpellDamage;
      duration: SpellDuration;
      concentration: true;
    }
  /**
   * Guardians (#342, Spirit Guardians): each opponent caught saves on
   * `ability` as it is cast and at the end of each of its turns while the
   * caster concentrates, taking the damage or half on a success. They end
   * with the fight.
   */
  | {
      kind: "guardians";
      ability: Ability;
      onSuccess: "half";
      damage: SpellDamage;
      duration: SpellDuration;
      concentration: true;
    }
>;

/**
 * What each slot level above a levelled spell's own adds: more dice of its
 * damage or healing, or more missiles.
 */
export type Upcast = Readonly<
  | { dice: number }
  | { missiles: number }
  /** More hit points for a max-hp buff (#341, Aid). */
  | { maxHp: number }
  /** More rays (#343, Scorching Ray). */
  | { rays: number }
  /** More dice of an attack's burst (#343, Ice Knife's cold). */
  | { burstDice: number }
>;

/** An area spell's shape and size in feet (SRD 5.2, #338). */
export type SpellArea = Readonly<{
  shape: "cone" | "cube" | "line" | "sphere" | "emanation";
  /**
   * A cone's or line's length, a cube's side (#340), a sphere's or
   * emanation's radius.
   */
  feet: number;
}>;

export type SpellDefinition = Readonly<{
  id: string;
  name: string;
  /** 0 for a cantrip. */
  level: 0 | 1 | 2 | 3;
  school: SpellSchool;
  castingTime: CastingTime;
  effect: SpellEffect;
  /** An area spell's shape and size (#338): it may catch several opponents. */
  area?: SpellArea;
  /** A cantrip's damage dice from character level 5 (SRD 5.2). */
  cantripDice?: number;
  /** A levelled spell's gain from each slot level above its own. */
  upcast?: Upcast;
  /**
   * The damage types the caster chooses one of at casting (#339, #340):
   * the one Resistance resists, or the one Chromatic Orb deals in place of
   * its effect's.
   */
  damageTypes?: readonly DamageType[];
}>;

/**
 * The feet of an area that each opponent it catches stands for (D4, #338):
 * a cone's length ÷ 10, a cube's side ÷ 10 (#340), a line's ÷ 30, a
 * sphere's or emanation's radius ÷ 5.
 */
const FEET_PER_TARGET: Readonly<Record<SpellArea["shape"], number>> = {
  cone: 10,
  cube: 10,
  line: 30,
  sphere: 5,
  emanation: 5,
};

/**
 * The most opponents `spell` can catch (#338): an area spell's size ÷ its
 * shape's feet per target (D4), rounded up and at least 1; a spell of rays
 * (#343) as many as its rays with a slot of `slotLevel`; any other spell
 * has one target.
 */
export function maxTargets(spell: SpellDefinition, slotLevel?: number): number {
  const { area } = spell;
  if (area !== undefined) {
    return Math.max(1, Math.ceil(area.feet / FEET_PER_TARGET[area.shape]));
  }
  const effect = effectAtSlot(spell, slotLevel);
  return effect.kind === "attack" && effect.rays !== undefined
    ? effect.rays
    : 1;
}

/** The character level at which a cantrip's damage grows (SRD 5.2). */
export const CANTRIP_UPGRADE_LEVEL = 5;

/** The spells the game knows, by id (SRD 5.2). */
export const SPELLS = {
  "fire-bolt": {
    id: "fire-bolt",
    name: "Fire Bolt",
    level: 0,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 1, sides: 10, type: "fire" },
    },
    cantripDice: 2,
  },
  "sacred-flame": {
    id: "sacred-flame",
    name: "Sacred Flame",
    level: 0,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "dexterity",
      onSuccess: "none",
      damage: { dice: 1, sides: 8, type: "radiant" },
    },
    cantripDice: 2,
  },
  // The Cleric's cantrips (#339).
  guidance: {
    id: "guidance",
    name: "Guidance",
    level: 0,
    school: "divination",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "check-die", sides: 4 },
      duration: { minutes: 1 },
      concentration: true,
    },
  },
  resistance: {
    id: "resistance",
    name: "Resistance",
    level: 0,
    school: "abjuration",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "damage-reduction", sides: 4 },
      duration: { minutes: 1 },
      concentration: true,
    },
    damageTypes: RESISTANCE_DAMAGE_TYPES,
  },
  thaumaturgy: {
    id: "thaumaturgy",
    name: "Thaumaturgy",
    level: 0,
    school: "transmutation",
    castingTime: "action",
    effect: { kind: "flavour" },
  },
  // Flavour only (#342, owner-approved), so a level-4 Thaumaturge has a
  // fifth cantrip to learn.
  light: {
    id: "light",
    name: "Light",
    level: 0,
    school: "evocation",
    castingTime: "action",
    effect: { kind: "flavour" },
  },
  "shocking-grasp": {
    id: "shocking-grasp",
    name: "Shocking Grasp",
    level: 0,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "melee",
      damage: { dice: 1, sides: 8, type: "lightning" },
    },
    cantripDice: 2,
  },
  // The Wizard's other cantrips (#340): Ray of Frost's slowing and Chill
  // Touch's bar on regaining hit points have no effect here.
  "ray-of-frost": {
    id: "ray-of-frost",
    name: "Ray of Frost",
    level: 0,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 1, sides: 8, type: "cold" },
    },
    cantripDice: 2,
  },
  "chill-touch": {
    id: "chill-touch",
    name: "Chill Touch",
    level: 0,
    school: "necromancy",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "melee",
      damage: { dice: 1, sides: 10, type: "necrotic" },
    },
    cantripDice: 2,
  },
  "magic-missile": {
    id: "magic-missile",
    name: "Magic Missile",
    level: 1,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "auto-hit",
      missiles: 3,
      damage: { dice: 1, sides: 4, modifier: 1, type: "force" },
    },
    upcast: { missiles: 1 },
  },
  "inflict-wounds": {
    id: "inflict-wounds",
    name: "Inflict Wounds",
    level: 1,
    school: "necromancy",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "constitution",
      onSuccess: "half",
      damage: { dice: 2, sides: 10, type: "necrotic" },
    },
    upcast: { dice: 1 },
  },
  // A ranged spell attack that lights the target up (#339).
  "guiding-bolt": {
    id: "guiding-bolt",
    name: "Guiding Bolt",
    level: 1,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 4, sides: 6, type: "radiant" },
      nextAttackAdvantage: true,
    },
    upcast: { dice: 1 },
  },
  "cure-wounds": {
    id: "cure-wounds",
    name: "Cure Wounds",
    level: 1,
    school: "abjuration",
    castingTime: "action",
    effect: { kind: "healing", healing: { dice: 2, sides: 8 } },
    upcast: { dice: 2 },
  },
  "healing-word": {
    id: "healing-word",
    name: "Healing Word",
    level: 1,
    school: "abjuration",
    castingTime: "bonus-action",
    effect: { kind: "healing", healing: { dice: 2, sides: 4 } },
    upcast: { dice: 2 },
  },
  bless: {
    id: "bless",
    name: "Bless",
    level: 1,
    school: "enchantment",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "die", sides: 4 },
      duration: { minutes: 1 },
      concentration: true,
    },
  },
  "shield-of-faith": {
    id: "shield-of-faith",
    name: "Shield of Faith",
    level: 1,
    school: "abjuration",
    castingTime: "bonus-action",
    effect: {
      kind: "buff",
      buff: { kind: "armor-class", bonus: 2 },
      duration: { minutes: 10 },
      concentration: true,
    },
  },
  "mage-armor": {
    id: "mage-armor",
    name: "Mage Armor",
    level: 1,
    school: "abjuration",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "base-armor-class", base: 13 },
      duration: { minutes: 480 },
    },
  },
  // Area spells (#338): a 15-foot cone, 10- and 20-foot spheres.
  "burning-hands": {
    id: "burning-hands",
    name: "Burning Hands",
    level: 1,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "dexterity",
      onSuccess: "half",
      damage: { dice: 3, sides: 6, type: "fire" },
    },
    area: { shape: "cone", feet: 15 },
    upcast: { dice: 1 },
  },
  shatter: {
    id: "shatter",
    name: "Shatter",
    level: 2,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "constitution",
      onSuccess: "half",
      damage: { dice: 3, sides: 8, type: "thunder" },
    },
    area: { shape: "sphere", feet: 10 },
    upcast: { dice: 1 },
  },
  fireball: {
    id: "fireball",
    name: "Fireball",
    level: 3,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "dexterity",
      onSuccess: "half",
      damage: { dice: 8, sides: 6, type: "fire" },
    },
    area: { shape: "sphere", feet: 20 },
    upcast: { dice: 1 },
  },
  // The Wizard's 1st-level spells (#340). Chromatic Orb's damage type is
  // chosen at casting (its effect's is the first) and it never leaps;
  // Thunderwave's 15-foot cube catches two, and its push is omitted.
  "chromatic-orb": {
    id: "chromatic-orb",
    name: "Chromatic Orb",
    level: 1,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 3, sides: 8, type: "acid" },
    },
    upcast: { dice: 1 },
    damageTypes: CHROMATIC_ORB_DAMAGE_TYPES,
  },
  thunderwave: {
    id: "thunderwave",
    name: "Thunderwave",
    level: 1,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "constitution",
      onSuccess: "half",
      damage: { dice: 2, sides: 8, type: "thunder" },
    },
    area: { shape: "cube", feet: 15 },
    upcast: { dice: 1 },
  },
  // The Wizard's 1st-level spells added at #343 (owner-approved), so a
  // level-2 Wizard has two to write into its spellbook.
  "ray-of-sickness": {
    id: "ray-of-sickness",
    name: "Ray of Sickness",
    level: 1,
    school: "necromancy",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 2, sides: 8, type: "poison" },
      condition: { kind: "poisoned", turns: 1 },
    },
    upcast: { dice: 1 },
  },
  "ice-knife": {
    id: "ice-knife",
    name: "Ice Knife",
    level: 1,
    school: "conjuration",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 1, sides: 10, type: "piercing" },
      burst: {
        ability: "dexterity",
        damage: { dice: 2, sides: 6, type: "cold" },
      },
    },
    upcast: { burstDice: 1 },
  },
  // A 5-foot sphere: one target (D4).
  sleep: {
    id: "sleep",
    name: "Sleep",
    level: 1,
    school: "enchantment",
    castingTime: "action",
    effect: {
      kind: "control",
      ability: "wisdom",
      condition: "incapacitated",
      then: "unconscious",
      duration: { minutes: 1 },
      concentration: true,
      immunity: "exhaustion",
    },
    area: { shape: "sphere", feet: 5 },
  },
  // The Cleric's 2nd-level spells (#341, owner-approved). Aid and Lesser
  // Restoration are also the Life Domain's always-prepared spells. Without
  // companions Aid has one target, its caster. Spiritual Weapon's moving
  // is omitted, and Hold Person's extra targets from a higher slot. Prayer
  // of Healing takes ten minutes, so it is cast only outside a fight; its
  // short rest gives feature uses back, not hit dice.
  aid: {
    id: "aid",
    name: "Aid",
    level: 2,
    school: "abjuration",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "max-hp", bonus: 5 },
      duration: { minutes: 480 },
    },
    upcast: { maxHp: 5 },
  },
  "lesser-restoration": {
    id: "lesser-restoration",
    name: "Lesser Restoration",
    level: 2,
    school: "abjuration",
    castingTime: "bonus-action",
    effect: { kind: "restoration", conditions: ["paralysed", "poisoned"] },
  },
  "spiritual-weapon": {
    id: "spiritual-weapon",
    name: "Spiritual Weapon",
    level: 2,
    school: "evocation",
    castingTime: "bonus-action",
    effect: {
      kind: "spectral-weapon",
      damage: { dice: 1, sides: 8, type: "force" },
      duration: { minutes: 1 },
      concentration: true,
    },
    upcast: { dice: 1 },
  },
  "hold-person": {
    id: "hold-person",
    name: "Hold Person",
    level: 2,
    school: "enchantment",
    castingTime: "action",
    effect: {
      kind: "control",
      ability: "wisdom",
      condition: "paralysed",
      duration: { minutes: 1 },
      concentration: true,
      immunity: "paralysed",
      creatureType: "humanoid",
      hold: true,
    },
  },
  "protection-from-poison": {
    id: "protection-from-poison",
    name: "Protection from Poison",
    level: 2,
    school: "abjuration",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "poison-ward" },
      duration: { minutes: 60 },
    },
  },
  "prayer-of-healing": {
    id: "prayer-of-healing",
    name: "Prayer of Healing",
    level: 2,
    school: "abjuration",
    castingTime: "minutes",
    effect: {
      kind: "healing",
      healing: { dice: 2, sides: 8 },
      noModifier: true,
      restBenefit: true,
    },
    upcast: { dice: 1 },
  },
  // The Wizard's 2nd-level spells (#343, owner-approved), with Shatter and
  // Hold Person. Mind Spike's knowing where its target is has no use
  // without positions, so it keeps no concentration. Blur's and Mirror
  // Image's minute is the fight (D9); no opponent has Blindsight or
  // Truesight to see through them.
  "scorching-ray": {
    id: "scorching-ray",
    name: "Scorching Ray",
    level: 2,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 2, sides: 6, type: "fire" },
      rays: 3,
    },
    upcast: { rays: 1 },
  },
  "acid-arrow": {
    id: "acid-arrow",
    name: "Acid Arrow",
    level: 2,
    school: "evocation",
    castingTime: "action",
    effect: {
      kind: "attack",
      range: "ranged",
      damage: { dice: 4, sides: 4, type: "acid" },
      missHalf: true,
      later: { dice: 2, sides: 4, type: "acid" },
    },
    upcast: { dice: 1 },
  },
  "mind-spike": {
    id: "mind-spike",
    name: "Mind Spike",
    level: 2,
    school: "divination",
    castingTime: "action",
    effect: {
      kind: "save",
      ability: "wisdom",
      onSuccess: "half",
      damage: { dice: 3, sides: 8, type: "psychic" },
    },
    upcast: { dice: 1 },
  },
  blur: {
    id: "blur",
    name: "Blur",
    level: 2,
    school: "illusion",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "blur" },
      duration: { minutes: 1 },
      concentration: true,
    },
  },
  "mirror-image": {
    id: "mirror-image",
    name: "Mirror Image",
    level: 2,
    school: "illusion",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "mirror-image", duplicates: 3 },
      duration: { minutes: 1 },
    },
  },
  // The Cleric's 3rd-level spells (#342, owner-approved). Without
  // companions Mass Healing Word, Beacon of Hope and Protection from Energy
  // have one target, their caster. Spirit Guardians' 15-foot emanation
  // catches three (D4), chosen at casting; its slowing is omitted, its
  // damage is radiant, and it ends with the fight. Beacon of Hope's death
  // saving throws don't exist (ADR 0005). Bestow Curse lays one of two
  // curses (`CURSES`).
  "mass-healing-word": {
    id: "mass-healing-word",
    name: "Mass Healing Word",
    level: 3,
    school: "abjuration",
    castingTime: "bonus-action",
    effect: { kind: "healing", healing: { dice: 2, sides: 4 } },
    upcast: { dice: 1 },
  },
  "spirit-guardians": {
    id: "spirit-guardians",
    name: "Spirit Guardians",
    level: 3,
    school: "conjuration",
    castingTime: "action",
    effect: {
      kind: "guardians",
      ability: "wisdom",
      onSuccess: "half",
      damage: { dice: 3, sides: 8, type: "radiant" },
      duration: { minutes: 10 },
      concentration: true,
    },
    area: { shape: "emanation", feet: 15 },
    upcast: { dice: 1 },
  },
  "beacon-of-hope": {
    id: "beacon-of-hope",
    name: "Beacon of Hope",
    level: 3,
    school: "abjuration",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "beacon" },
      duration: { minutes: 1 },
      concentration: true,
    },
  },
  "bestow-curse": {
    id: "bestow-curse",
    name: "Bestow Curse",
    level: 3,
    school: "necromancy",
    castingTime: "action",
    effect: {
      kind: "curse",
      ability: "wisdom",
      damage: { dice: 1, sides: 8, type: "necrotic" },
      duration: { minutes: 1 },
      concentration: true,
    },
  },
  "protection-from-energy": {
    id: "protection-from-energy",
    name: "Protection from Energy",
    level: 3,
    school: "abjuration",
    castingTime: "action",
    effect: {
      kind: "buff",
      buff: { kind: "energy-ward" },
      duration: { minutes: 60 },
      concentration: true,
    },
    damageTypes: ENERGY_DAMAGE_TYPES,
  },
  // A reaction to being hit by an attack roll (#337): +5 AC until the start
  // of the caster's next turn, against that attack too.
  shield: {
    id: "shield",
    name: "Shield",
    level: 1,
    school: "abjuration",
    castingTime: "reaction",
    effect: {
      kind: "buff",
      buff: { kind: "armor-class", bonus: 5 },
      duration: { until: "next-turn" },
    },
  },
} as const satisfies Record<string, SpellDefinition>;

export type SpellId = keyof typeof SPELLS;

export function isSpellId(value: unknown): value is SpellId {
  return typeof value === "string" && Object.hasOwn(SPELLS, value);
}

/**
 * `definition` as a caster of `level` casts it: a cantrip's damage dice grow
 * at level 5; a levelled spell is unchanged until it is cast with a slot.
 */
export function spellAtLevel(
  definition: SpellDefinition,
  level: number,
): SpellDefinition {
  if (
    definition.cantripDice === undefined ||
    level < CANTRIP_UPGRADE_LEVEL ||
    !("damage" in definition.effect)
  ) {
    return definition;
  }
  return {
    ...definition,
    effect: {
      ...definition.effect,
      damage: { ...definition.effect.damage, dice: definition.cantripDice },
    },
  } as SpellDefinition;
}

/**
 * `definition`'s effect cast with a slot of `slotLevel` (#336): each level
 * above the spell's own adds its upcast dice or missiles. A cantrip, cast
 * with no slot, is unchanged.
 */
export function effectAtSlot(
  definition: SpellDefinition,
  slotLevel: number | undefined,
): SpellEffect {
  const { effect, upcast } = definition;
  const above = slotLevel === undefined ? 0 : slotLevel - definition.level;
  if (upcast === undefined || above <= 0) {
    return effect;
  }
  if ("missiles" in upcast) {
    return effect.kind === "auto-hit"
      ? { ...effect, missiles: effect.missiles + upcast.missiles * above }
      : effect;
  }
  // Scorching Ray (#343): more rays.
  if ("rays" in upcast) {
    return effect.kind === "attack" && effect.rays !== undefined
      ? { ...effect, rays: effect.rays + upcast.rays * above }
      : effect;
  }
  // Ice Knife (#343): more dice of its burst, not of its attack.
  if ("burstDice" in upcast) {
    return effect.kind === "attack" && effect.burst !== undefined
      ? {
          ...effect,
          burst: {
            ...effect.burst,
            damage: {
              ...effect.burst.damage,
              dice: effect.burst.damage.dice + upcast.burstDice * above,
            },
          },
        }
      : effect;
  }
  // Aid (#341): more hit points from each slot level above its own.
  if ("maxHp" in upcast) {
    return effect.kind === "buff" && effect.buff.kind === "max-hp"
      ? {
          ...effect,
          buff: {
            ...effect.buff,
            bonus: effect.buff.bonus + upcast.maxHp * above,
          },
        }
      : effect;
  }
  const more = upcast.dice * above;
  switch (effect.kind) {
    case "healing":
      return {
        ...effect,
        healing: { ...effect.healing, dice: effect.healing.dice + more },
      };
    case "auto-hit":
    case "buff":
    case "flavour":
    case "control":
    case "restoration":
    case "curse":
      return effect;
    // Acid Arrow (#343): its later damage grows with its first.
    case "attack":
      return {
        ...effect,
        damage: { ...effect.damage, dice: effect.damage.dice + more },
        ...(effect.later === undefined
          ? {}
          : { later: { ...effect.later, dice: effect.later.dice + more } }),
      };
    default:
      return {
        ...effect,
        damage: { ...effect.damage, dice: effect.damage.dice + more },
      };
  }
}

/** "1st", "2nd", "3rd": a spell slot's level as the sheet says it. */
export function ordinal(level: number): string {
  return `${level}${level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th"}`;
}

/** The feature-uses id a spell slot level is tracked under (#336): `spell-slots-1`. */
export function slotUsesId(level: number): string {
  return `spell-slots-${level}`;
}

/** The spell slot level a feature-uses id tracks, or undefined for a feature's. */
export function slotLevelOf(featureId: string): number | undefined {
  const slot = /^spell-slots-(\d+)$/u.exec(featureId);
  return slot === null ? undefined : Number(slot[1]);
}
