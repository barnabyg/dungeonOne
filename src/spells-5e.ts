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
 *   creature immune to exhaustion succeeds without a roll.
 * - An area spell (#338) declares its shape and size, and so the most
 *   opponents it can catch (`maxTargets`, D4); the caster chooses them.
 * - A spell may take a damage type chosen at casting (`damageTypes`, #339,
 *   #340): the one Resistance resists, or the one Chromatic Orb deals.
 *
 * Without positions or a clock, ranges are left out and areas and
 * durations are abstracted; the rules document lists what that omits.
 */
import type { Ability } from "./class-5e.js";
import type { ConditionKind, DamageType } from "./encounter-5e.js";

/** How long a spell takes to cast: the Magic action, a bonus action or a reaction. */
export type CastingTime = "action" | "bonus-action" | "reaction";

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
   * A control spell's hold on an opponent (#340): Sleep's, while its
   * conditions last. It ends when the target takes damage.
   */
  | { kind: "control" }
>;

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
  /** The dice plus the caster's spellcasting ability modifier. */
  | { kind: "healing"; healing: SpellDice }
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
      then: ConditionKind;
      duration: SpellDuration;
      concentration: true;
    }
>;

/**
 * What each slot level above a levelled spell's own adds: more dice of its
 * damage or healing, or more missiles.
 */
export type Upcast = Readonly<{ dice: number } | { missiles: number }>;

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
 * shape's feet per target (D4), rounded up and at least 1; any other spell
 * has one target.
 */
export function maxTargets(spell: SpellDefinition): number {
  const { area } = spell;
  return area === undefined
    ? 1
    : Math.max(1, Math.ceil(area.feet / FEET_PER_TARGET[area.shape]));
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
    },
    area: { shape: "sphere", feet: 5 },
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
      return effect;
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
