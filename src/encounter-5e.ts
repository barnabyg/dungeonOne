/**
 * The 5e encounter engine (SRD 5.2): sides of combatants fighting until one
 * side is defeated.
 *
 * Pure rules over JSON state. Dice come only from the `RandomSource` passed
 * in, and every die rolled appears in an event. A rejected action draws no
 * dice and returns the state unchanged.
 *
 * - Each combatant rolls its own initiative: d20 + its initiative bonus. A
 *   surprised combatant (#301, SRD 5.2) rolls it with disadvantage, as does
 *   one whose Dexterity has disadvantage (`abilityDisadvantages`). A feature
 *   may give it advantage (`initiativeAdvantages`, the Champion's Remarkable
 *   Athlete, #315); any advantage and any disadvantage cancel.
 *   Ties go to the higher Dexterity score, then to a seeded d20 roll-off
 *   among the combatants still tied, repeated until no two match.
 * - An attack hits when d20 + bonus meets the target's AC. A natural 20 (or
 *   19 with a 19–20 critical range) is a critical hit and always hits, with
 *   the damage dice rolled twice; a natural 1 always misses.
 * - A combatant at 0 HP is defeated. For the player character that is instant
 *   defeat: there are no death saving throws (ADR 0005).
 * - Opponents act on their own turns. Each attacks a living party combatant;
 *   with more than one, a seeded die picks which, in initiative order.
 * - Each turn has an action, a bonus action and a reaction. A party
 *   combatant's turn lasts until it ends it or nothing it could do is left:
 *   an attack takes the action, Second Wind the bonus action, and Action
 *   Surge adds an action. Drinking a potion takes the bonus action (SRD 5.2).
 *   Only Uncanny Dodge and reaction spells (Shield) use a reaction
 *   (below). Drawing, stowing or swapping a weapon uses the turn's one
 *   object interaction; it takes no action.
 * - Extra Attack (#287): a combatant with it makes two attacks, not one,
 *   whenever it takes the Attack action. Each attack is its own action call,
 *   at any living opponent; the first spends the action and the second
 *   follows it in the same turn or is lost when the turn ends. Action Surge
 *   gives another Attack action with its own two attacks.
 * - Light property: after an attack with a light weapon, a combatant holding
 *   a second light weapon may make one extra attack with it that turn, as a
 *   bonus action, or as part of the Attack action with the Nick mastery.
 * - Weapon masteries: a hit with a Sap weapon gives the target disadvantage
 *   on its next attack roll before the start of the attacker's next turn; a
 *   hit that deals damage with a Vex weapon gives the attacker advantage on
 *   its next attack roll against that target before the end of its next
 *   turn; a miss with a Graze weapon still deals damage equal to the damage
 *   modifier, if above 0. A heavy weapon wielded below its ability score of
 *   13 attacks with disadvantage. Advantage and disadvantage come only from
 *   such engine rules, never from an action.
 * - Ranged weapons (#230): each attack spends one of the arrows or bolts the
 *   attacker carries, and is refused with none. Without positions every foe
 *   closes in, so a ranged attack has disadvantage from the fight's second
 *   round on (close combat); round 1 is the opening volley.
 * - Great Weapon Fighting: a weapon marked with it counts each 1 or 2 on a
 *   damage die as 3. The event keeps the dice as rolled.
 * - Sneak Attack (#306): once per turn, a combatant with it deals its extra
 *   dice of the weapon's damage type when it hits with a Finesse or ranged
 *   weapon and has advantage on the roll (advantage and disadvantage
 *   together cancel it). The dice follow the weapon's and are doubled by a
 *   critical hit; a miss deals none. The engine applies it whenever its rules
 *   are met. Without positions or companions, the ally-adjacent clause is
 *   omitted.
 * - Hide (#307, Cunning Action): a bonus action. A Stealth check against the
 *   best passive Perception among the opponents still in the fight; on a
 *   success the combatant is hidden, and its next attack roll has advantage.
 *   Hiding ends with that attack or the fight; it doesn't change how foes
 *   attack it. A hidden combatant can't hide again.
 * - Steady Aim (#307): a bonus action, while the combatant still has an
 *   attack to make this turn, giving advantage on its next attack roll this
 *   turn. Without positions it has never moved, so it is always allowed.
 * - Fast Hands (#307): once the turn's object interaction is spent, a
 *   combatant with it can draw, stow or swap a weapon again with its bonus
 *   action.
 * - Cunning Strike (#308): an attack by a combatant with it may name one
 *   effect (`CUNNING_STRIKES`), accepted only when the attack would deal
 *   Sneak Attack on a hit (its weapon, its advantage, and Sneak Attack not
 *   yet dealt this turn) and the effect can work on the target. On a hit
 *   the effect's Sneak Attack dice are forgone before the damage is rolled,
 *   and once the damage is dealt the target, unless it fell, saves against
 *   the combatant's DC or has the effect's condition. A miss spends nothing.
 *   One effect per attack, so once per Sneak Attack.
 * - Uncanny Dodge (#308): when an opponent's attack roll hits a combatant
 *   with it that can still react this round (and isn't incapacitated), the
 *   fight pauses before the damage is rolled (`pendingReaction`): that
 *   combatant either halves the attack's damage with its reaction, rounding
 *   each damage type down, or takes the hit; nothing else can be done until
 *   it answers. Then the opponent's turn, and the fight, go on. A combatant
 *   that took the hit still has its reaction; one used comes back at the
 *   start of its next turn. Without positions or unseen attackers, every
 *   attacker can be seen.
 * - Spells (#336): a combatant with `spellcasting` casts the spells it
 *   carries (`spells-5e.ts` data). An action spell takes the action (the
 *   Magic action), a bonus-action spell the bonus action; a levelled spell
 *   spends a slot of its level or higher, only one slot a turn (SRD 5.2). A
 *   spell attack rolls like a weapon attack with the spell attack bonus (a
 *   ranged one at disadvantage from round 2); a save spell's target saves
 *   against the caster's DC (`savingThrow`) for half or no damage; Magic
 *   Missile's darts always hit; a healing spell heals its dice + the
 *   spellcasting modifier. Damage meets defences and Undead Fortitude as an
 *   attack's does. `castOutsideFight` casts a healing spell out of a fight,
 *   or a buff that outlasts one.
 * - Ongoing effects (#337): a buff spell puts an effect on the caster or an
 *   ally (`effects`): a die added to its attack rolls and saving throws
 *   (Bless), a bonus to its AC, or a base AC while it wears no armour
 *   (`armorClassOf`). Without a clock each ends by its duration's band
 *   (D9, `effectEnds`): at the start of the caster's next turn, when the
 *   fight ends, or, outside the engine, at the next rest or a long rest.
 *   A spell already on its target can't be cast on it again.
 * - Concentration (#337): a combatant concentrates on one spell at a time;
 *   casting another concentration spell ends the first. Damage that leaves
 *   it standing calls for a Constitution saving throw against the higher of
 *   10 and half the damage (at most 30); a failure ends the spell, as do
 *   being incapacitated and falling.
 * - Area spells (#338): an area spell catches up to its `maxTargets`
 *   opponents (D4), chosen by the caster, each once. Its damage is rolled
 *   once; then each target, in the order chosen, saves for itself and takes
 *   the damage, or half on a success, through its own defences.
 * - Reaction spells (#337): an opponent's hit on a combatant that can cast
 *   one (Shield, its reaction free and a slot left) pauses as Uncanny Dodge
 *   does, and the combatant answers with Uncanny Dodge, the spell or the
 *   hit. Shield's +5 AC counts against that attack: a hit that no longer
 *   meets the AC misses (a natural 20 still hits). A reaction spell spends
 *   a slot without counting as the turn's one.
 * - Conditions (`CONDITION_RULES`): a monster attack's rider may deal extra
 *   damage of its own type on a hit (its dice doubled by a critical hit) and
 *   give the target a condition, after a saving throw if it names one. A
 *   condition lasts a number of the target's turns, rolling a repeat save at
 *   the end of each if it allows one; the same condition again replaces it.
 *   Poisoned gives disadvantage on attack rolls (and ability checks); prone
 *   gives disadvantage on its own attacks and advantage to attacks against
 *   it. Without positions every attacker is within 5 feet, and a prone
 *   combatant spends its next turn getting up: it stays prone until that
 *   turn ends. Paralysed (#234): it can't act (it can only end its turn) or
 *   react, automatically fails Strength and Dexterity saves, attacks against
 *   it have advantage, and every hit on it is a critical hit. Every condition
 *   ends when the fight does.
 * - Channel Divinity (#341): a Magic action spending one of its uses.
 *   Divine Spark rolls its dice + Wisdom modifier and heals another
 *   creature on the caster's side, or deals radiant or necrotic damage to
 *   an opponent, halved by a Constitution save. Turn Undead makes each
 *   undead opponent still in the fight (without positions, every one is
 *   within 30 feet) save on Wisdom or be Frightened and Incapacitated for
 *   the fight's minute; damage, an attack on it (D13) or the turner being
 *   incapacitated ends it. Preserve Life heals the Bloodied caster, never
 *   above half its hit points. When every opponent left is turned, the
 *   character may attack them or leave (`everyFoeTurned`).
 * - Spiritual Weapon (#341): a bonus action on each turn after its cast
 *   makes the weapon's melee spell attack (`spectral-attack`).
 * - Disciple of Life (#341): a spell cast with a slot that heals heals 2 +
 *   the slot's level more.
 * - Pack Tactics: a combatant with it has advantage on its attacks while an
 *   ally on its side is alive and able to act.
 * - Multiattack (#235): an opponent with it makes several attacks on its
 *   turn. For each, a seeded die picks the target when more than one party
 *   combatant stands, and another picks the attack when it has more than
 *   one. A target that falls is not picked again; the turn's attacks stop
 *   when the fight ends.
 * - Rampage (#235): when an opponent with it drops a combatant to 0 HP on
 *   its turn, it makes one bonus attack at once, chosen as above.
 * - Nimble Escape (#235): a bonus-action Disengage. Without positions there
 *   are no opportunity attacks to avoid, so it changes nothing in a fight,
 *   fleeing included (#237).
 * - Morale (#237, a house rule): a side checks morale when its first
 *   combatant falls, and again when defeat or flight leaves it at half its
 *   starting numbers or fewer; when both come at once it checks once. Each
 *   combatant on it still in the fight, with a morale DC and not already
 *   fleeing, makes a Wisdom saving throw against that DC, in initiative order. One
 *   that fails flees: on its next turn it leaves the fight instead of
 *   acting, unless it is incapacitated. Until then it can be attacked, and
 *   one cut down first is defeated. A side is beaten when each of its
 *   combatants is defeated or has fled. Undead and mindless monsters have no
 *   morale DC and never check.
 * - Surrender (#238): a combatant that may surrender yields on its turn
 *   instead of fleeing, in the same way; it is out of the fight, and a side
 *   is beaten when none of it is left fighting.
 *
 * The state allows any number of combatants per side.
 */
import type { Ammunition, AmmunitionId } from "./equipment-5e.js";
import type { Ability } from "./class-5e.js";
import type { RandomSource } from "./random.js";
import {
  effectAtSlot,
  effectEnds,
  maxTargets,
  ordinal,
  outlastsFight,
  type Buff,
  type CastingTime,
  type EffectEnds,
  type SpellDefinition,
  type SpellEffect,
} from "./spells-5e.js";

export type Side = "party" | "opponents";

/** The SRD 5.2 damage types. */
export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export type Damage = Readonly<{
  dice: number;
  sides: number;
  modifier: number;
  type: DamageType;
}>;

/**
 * The damage types a creature takes half, double or no damage from. A type
 * appears in at most one list.
 */
export type DamageDefenses = Readonly<{
  resistances?: readonly DamageType[];
  vulnerabilities?: readonly DamageType[];
  immunities?: readonly DamageType[];
}>;

/** Which defence changed a damage roll, and the damage rolled before it. */
export type DamageAdjustment = Readonly<{
  by: "resistance" | "vulnerability" | "immunity";
  rolled: number;
}>;

/**
 * The conditions the engine applies: Incapacitated and Unconscious come
 * from Sleep (#340), Frightened from Turn Undead (#341).
 */
export type ConditionKind =
  | "poisoned"
  | "prone"
  | "paralysed"
  | "incapacitated"
  | "unconscious"
  | "frightened";

/**
 * What a creature may be immune to (SRD 5.2): a condition the engine
 * applies, or exhaustion (#340), which the engine never applies but which
 * makes a creature succeed on Sleep's saves.
 */
export type ConditionImmunity = ConditionKind | "exhaustion";

/** What each condition does to its combatant's rolls and to attacks on it. */
export const CONDITION_RULES: Readonly<
  Record<
    ConditionKind,
    Readonly<{
      name: string;
      /** Its own attack rolls. */
      attacks?: "disadvantage";
      /** Attack rolls against it. */
      attacked?: "advantage";
      /** Its ability checks; no check is rolled in a fight yet. */
      checks?: "disadvantage";
      /** It can't take actions, bonus actions or reactions. */
      incapacitated?: true;
      /** The saving throws it fails without a roll. */
      failsSaves?: readonly Ability[];
      /** Every hit on it is a critical hit: every attacker is within 5 feet. */
      criticalHits?: true;
    }>
  >
> = {
  poisoned: {
    name: "Poisoned",
    attacks: "disadvantage",
    checks: "disadvantage",
  },
  prone: { name: "Prone", attacks: "disadvantage", attacked: "advantage" },
  paralysed: {
    name: "Paralysed",
    attacked: "advantage",
    incapacitated: true,
    failsSaves: ["strength", "dexterity"],
    criticalHits: true,
  },
  // Sleep's (#340): no actions, bonus actions or reactions; then, asleep,
  // as helpless as the paralysed (it drops prone too, which changes
  // nothing more here).
  incapacitated: { name: "Incapacitated", incapacitated: true },
  unconscious: {
    name: "Unconscious",
    attacked: "advantage",
    incapacitated: true,
    failsSaves: ["strength", "dexterity"],
    criticalHits: true,
  },
  // Turn Undead's (#341): without positions its source is always in
  // sight, and its bar on moving closer changes nothing.
  frightened: {
    name: "Frightened",
    attacks: "disadvantage",
    checks: "disadvantage",
  },
};

/** A saving throw: the ability and its DC. */
export type SaveSpec = Readonly<{ ability: Ability; dc: number }>;

/**
 * Cunning Strike's effects (#308, SRD 5.2): the Sneak Attack dice each
 * forgoes, and the saving throw the target makes against the attacker's DC
 * or has the condition. Poison lasts up to 10 of the target's turns (1
 * minute), with a repeat save at the end of each; a tripped target gets up
 * on its next turn. Withdraw needs positions and is omitted.
 */
export const CUNNING_STRIKES = {
  poison: {
    name: "Poison",
    dice: 1,
    save: "constitution",
    condition: "poisoned",
    turns: 10,
  },
  trip: {
    name: "Trip",
    dice: 1,
    save: "dexterity",
    condition: "prone",
    turns: 1,
  },
} as const satisfies Record<
  string,
  Readonly<{
    name: string;
    dice: number;
    save: Ability;
    condition: ConditionKind;
    turns: number;
  }>
>;
export type CunningStrikeId = keyof typeof CUNNING_STRIKES;

/** The largest size Trip can knock prone (#308). */
export const TRIP_LARGEST_SIZE = "Large";

/** The sizes too large for Trip: those above TRIP_LARGEST_SIZE. */
const UNTRIPPABLE_SIZES: readonly string[] = ["Huge", "Gargantuan"];

/**
 * What a hit with a monster's attack does besides its damage: extra damage
 * of its own type, and a condition, avoided by a successful save if it names
 * one. A prone target always gets up on its next turn; any other condition
 * lasts `turns` of the target's turns, and with `repeatSave` the target
 * repeats the save at the end of each.
 */
export type AttackRider = Readonly<{
  damage?: Damage;
  condition?: Readonly<{
    kind: ConditionKind;
    save?: SaveSpec;
    turns?: number;
    repeatSave?: true;
  }>;
}>;

/** A condition on a combatant, what gave it and how it ends. */
export type Condition = Readonly<{
  kind: ConditionKind;
  targetId: string;
  sourceId: string;
  /** The attack that gave it. */
  source: string;
  /**
   * Ends of the target's turns left before it ends by itself. A control
   * spell's condition with no save (#340: Sleep's Unconscious) never runs
   * out by turns: it ends with the spell.
   */
  turnsLeft: number;
  /** The save the target repeats at the end of each of its turns. */
  save?: SaveSpec;
  /**
   * The control spell that gave it (#340, Sleep), which `sourceId` cast:
   * it ends when the spell ends on the target, and the spell ends on the
   * target when it ends.
   */
  spellId?: string;
  /**
   * The worse condition a failed repeat save gives in its place, for as
   * long as the spell lasts (#340: Sleep's Unconscious).
   */
  then?: ConditionKind;
}>;

/** The weapon masteries the engine applies. */
export type Mastery = "Graze" | "Nick" | "Sap" | "Vex";

export type Weapon = Readonly<{
  name: string;
  bonus: number;
  damage: Damage;
  criticalRange: 19 | 20;
  /** The weapon mastery its wielder uses, if it has mastered the weapon. */
  mastery?: Mastery;
  /** Sources of disadvantage on every attack with it, such as "Heavy". */
  disadvantage?: readonly string[];
  /** Great Weapon Fighting: each 1 or 2 on a damage die counts as 3. */
  greatWeaponFighting?: true;
  /** The Finesse property, which Sneak Attack needs unless it is ranged (#306). */
  finesse?: true;
  /** What a hit does besides its damage. */
  rider?: AttackRider;
  /**
   * A ranged weapon's ammunition: each attack spends one of the attacker's,
   * and from the fight's second round it attacks at disadvantage.
   */
  ammunition?: AmmunitionId;
  /** Loading (SRD 5.2): it fires once per action, whatever Extra Attack allows (#291). */
  loading?: true;
  /**
   * A ranged spell attack (#336): it spends no ammunition, but like a
   * ranged weapon it attacks at disadvantage from the fight's second round.
   */
  ranged?: true;
}>;

export type Combatant = DamageDefenses &
  Readonly<{
    id: string;
    name: string;
    side: Side;
    armorClass: number;
    hp: number;
    maxHp: number;
    /** The Dexterity score, which breaks initiative ties. */
    dexterity: number;
    initiativeBonus: number;
    /** Surprised as the fight begins (#301): initiative with disadvantage. */
    surprised?: true;
    /** Named features giving its initiative roll advantage (#315). */
    initiativeAdvantages?: readonly string[];
    /** Its saving throw bonus for each ability. */
    saves: Readonly<Record<Ability, number>>;
    /**
     * Named sources of disadvantage on its D20 Tests with an ability: its
     * saving throws, and its initiative for Dexterity. A character's body
     * armour worn without training gives it on Strength and Dexterity
     * (SRD 5.2); its attacks carry it on their weapons.
     */
    abilityDisadvantages?: Readonly<
      Partial<Record<Ability, readonly string[]>>
    >;
    attack: Weapon;
    /** A second light weapon, for the Light property's extra attack. */
    lightAttack?: Weapon;
    /** Attacks per Attack action: 2 with Extra Attack (#287), else 1. */
    attacksPerAction?: number;
    /** Sneak Attack's extra damage dice (#306), dealt once per turn. */
    sneakAttack?: Readonly<{ dice: number; sides: number }>;
    /**
     * Cunning Action's Hide (#307): its Stealth check's Dexterity modifier
     * and proficiency bonus, doubled by Expertise.
     */
    hide?: Readonly<{
      modifier: number;
      proficiency: number;
      expertise?: true;
    }>;
    /** Steady Aim (#307): a bonus action for advantage on its next attack. */
    steadyAim?: true;
    /** Fast Hands (#307): a second object interaction takes the bonus action. */
    fastHands?: true;
    /**
     * Cunning Strike (#308): its Sneak Attack may forgo dice for an effect
     * whose saving throw is against `dc`.
     */
    cunningStrike?: Readonly<{ dc: number }>;
    /** Uncanny Dodge (#308): its reaction halves a hit's damage. */
    uncannyDodge?: true;
    /** Its size, such as "Medium"; Trip can't knock over a Huge one (#308). */
    size?: string;
    /**
     * Its creature type in lower case, such as "undead" or "humanoid"
     * (#341): Turn Undead turns only undead, Hold Person holds only
     * humanoids.
     */
    creatureType?: string;
    /**
     * Its passive Perception, which a hiding foe's Stealth must meet (#307);
     * 10 when not given.
     */
    passivePerception?: number;
    /** Class features with limited uses, with the uses left of their maximum. */
    secondWind?: FeatureUses & Readonly<{ healing: Healing }>;
    actionSurge?: FeatureUses;
    /**
     * Channel Divinity (#341): its uses, the spell save DC its effects use,
     * Divine Spark's dice + Wisdom modifier, and Preserve Life's pool of
     * hit points (five times the Cleric level) once it has it. Turn Undead
     * comes with it.
     */
    channelDivinity?: FeatureUses &
      Readonly<{ saveDc: number; divineSpark: Healing; preserveLife?: number }>;
    /** Healing potions the combatant carries, which it can drink. */
    potions?: readonly Potion[];
    /** Its spellcasting (#336), for a combatant that casts spells. */
    spellcasting?: CombatSpellcasting;
    /** The ongoing spell effects on it (#337). */
    effects?: readonly ActiveEffect[];
    /** It wears body armour (#337): a base-AC effect gives it nothing. */
    armour?: true;
    /** The arrows and bolts it carries, for a ranged weapon (#230). */
    ammunition?: Ammunition;
    /** Advantage on its attacks while an ally is alive and able to act. */
    packTactics?: true;
    /**
     * Conditions it cannot be given, and exhaustion (#340), which makes it
     * succeed on Sleep's saves.
     */
    conditionImmunities?: readonly ConditionImmunity[];
    /**
     * Undead Fortitude: reduced to 0 HP by damage that isn't radiant or from a
     * critical hit, a Constitution save against DC 5 + the damage taken leaves
     * it at 1 HP instead.
     */
    undeadFortitude?: true;
    /**
     * An opponent's Multiattack: the attacks it makes each turn, each with
     * one of `weapons` picked by a die when there is more than one.
     */
    multiattack?: Readonly<{ attacks: number; weapons: readonly Weapon[] }>;
    /** Rampage: a bonus attack when it drops a combatant on its turn. */
    rampage?: true;
    /**
     * Nimble Escape: it can Disengage as a bonus action. With no opportunity
     * attacks, that changes nothing in a fight yet.
     */
    nimbleEscape?: true;
    /**
     * Its morale DC (#237): the Wisdom saving throw it makes when its side checks
     * morale. Without one it never checks.
     */
    morale?: number;
    /**
     * It surrenders instead of fleeing when it fails morale (#238): its
     * module authors what it says once it has yielded.
     */
    surrenders?: true;
  }>;

export type Healing = Readonly<{
  dice: number;
  sides: number;
  modifier: number;
}>;

export type Potion = Readonly<{ id: string; name: string; healing: Healing }>;

export type FeatureUses = Readonly<{ uses: number; max: number }>;

/**
 * A combatant's spellcasting (#336): its spell attack bonus and save DC, the
 * modifier its healing adds, the spells it can cast (its cantrips already
 * grown for its level) and its spell slots left, 1st level first.
 */
export type CombatSpellcasting = Readonly<{
  attackBonus: number;
  saveDc: number;
  modifier: number;
  spells: readonly SpellDefinition[];
  slots: readonly FeatureUses[];
  /** Disciple of Life (#341): slot healing heals 2 + the slot level more. */
  discipleOfLife?: true;
}>;

/**
 * An ongoing spell effect on a combatant (#337): the spell, who cast it,
 * what it does, when it ends (D9) and whether its caster concentrates on
 * it.
 */
export type ActiveEffect = Readonly<{
  spellId: string;
  spell: string;
  casterId: string;
  buff: Buff;
  ends: EffectEnds;
  concentration?: true;
  /** The damage type chosen at casting (#339), for Resistance. */
  damageType?: DamageType;
  /**
   * The turn (`round:turn`) Resistance last reduced damage in (#339): once
   * a turn.
   */
  reducedIn?: string;
}>;

/** A die an ongoing effect added to a d20 roll (#337): Bless's d4. */
export type EffectDie = Readonly<{
  spell: string;
  sides: number;
  roll: number;
}>;

/**
 * Why an ongoing effect ended (#337): the start of its caster's next turn,
 * the fight's end, a rest or a long rest (outside the engine), or the end
 * of its caster's concentration: another concentration spell, a failed
 * Constitution save, being incapacitated, or falling.
 */
export type EffectEndReason =
  /** Its die was added to a check (#339): Guidance's. */
  | "used"
  /** A control spell's target took damage (#340): Sleep's woke. */
  | "woke"
  /** A control spell's target succeeded on its repeat save (#340). */
  | "saved"
  /** A control spell's condition ran its turns out (#340). */
  | "lapsed"
  /** A turned creature took damage (#341). */
  | "damaged"
  /** A turned creature was attacked (#341, D13). */
  | "attacked"
  /** A spell ended its condition (#341, Lesser Restoration). */
  | "cured"
  | "next-turn"
  | "fight-over"
  | "rest"
  | "long-rest"
  | "new-concentration"
  | "concentration-broken"
  | "incapacitated"
  | "fell";

export type InitiativeRoll = Readonly<{
  combatantId: string;
  /**
   * The d20 kept: the lower of two for a surprised combatant (#301), the
   * higher of two with advantage (#315), the only one when they cancel.
   */
  d20: number;
  /**
   * Present when it rolled with advantage or disadvantage: advantage from a
   * feature (#315); disadvantage for being surprised, or for its
   * Dexterity's disadvantage (untrained armour).
   */
  mode?: RollMode;
  bonus: number;
  total: number;
  /** d20 roll-offs against combatants with the same total and Dexterity. */
  tieBreaks: readonly number[];
}>;

export type EncounterOutcome = "ongoing" | "victory" | "defeat";

/** What makes a side check morale: its first fall, then half strength. */
export type MoraleTrigger = "first-fall" | "half-strength";

export type EncounterState = Readonly<{
  combatants: readonly Combatant[];
  /** Highest initiative first. */
  order: readonly InitiativeRoll[];
  round: number;
  /** Index into `order` of the combatant whose turn it is. */
  turn: number;
  /** From the party's side. */
  outcome: EncounterOutcome;
  /** What the combatant whose turn it is has left this turn. */
  economy: TurnEconomy;
  /** Combatants with disadvantage on their next attack, and who sapped them. */
  sapped: readonly Readonly<{ targetId: string; sourceId: string }>[];
  /**
   * Who has advantage on its next attack against whom, from Vex, and the
   * round it was given: it lasts to the end of the source's next turn.
   */
  vexed: readonly Readonly<{
    targetId: string;
    sourceId: string;
    round: number;
  }>[];
  /**
   * Targets of Guiding Bolt's hit (#339): the next attack roll against
   * each has advantage, whoever makes it, until the end of the caster's
   * (the source's) next turn.
   */
  guided?: readonly Readonly<{
    targetId: string;
    sourceId: string;
    round: number;
  }>[];
  /** The conditions on living combatants. */
  conditions: readonly Condition[];
  /**
   * Combatants hidden by Hide (#307): each has advantage on its next attack
   * roll, which ends it.
   */
  hidden: readonly string[];
  /**
   * Combatants that failed a morale saving throw; each leaves on its next
   * turn, fleeing or, when it may (#238), surrendering.
   */
  fleeing: readonly string[];
  /** Combatants that left the fight, in the order they left. */
  fled: readonly string[];
  /** Combatants that surrendered (#238), in the order they yielded. */
  surrendered: readonly string[];
  /**
   * Combatants that have exchanged blows: each made an attack or was the
   * target of one, hit or miss. A fled or surrendered monster among them
   * gives half its XP (#237, #238).
   */
  engaged: readonly string[];
  /** The morale checks each side has made; each is made once. */
  moraleChecks: readonly Readonly<{ side: Side; trigger: MoraleTrigger }>[];
  /**
   * Combatants that have used their reaction (#308); each gets it back at
   * the start of its turn.
   */
  reacted: readonly string[];
  /**
   * A hit waiting for its target's answer (#308): Uncanny Dodge or take the
   * hit. Nothing else happens until it is answered.
   */
  pendingReaction?: PendingReaction;
}>;

/**
 * How far an opponent's turn had got (#308): the attacks of its Multiattack
 * made before the one under way, whether its bonus action (Rampage) is
 * still free, and whether the attack under way is Rampage's.
 */
export type OpponentProgress = Readonly<{
  made: number;
  bonusAction: boolean;
  rampage: boolean;
}>;

/** An attack roll as rolled, before its damage. */
export type AttackRoll = Readonly<{
  d20: number;
  mode?: RollMode;
  total: number;
  hit: boolean;
  critical: boolean;
  /**
   * A hit that is critical only because the target is paralysed, or
   * unconscious (#340): `criticalCondition` names which.
   */
  conditionCritical: boolean;
  criticalCondition?: ConditionKind;
  /** Dice the attacker's effects added to `total` (#337): Bless's. */
  effectDice?: readonly EffectDie[];
}>;

/**
 * An opponent's hit on a combatant that may answer it with its reaction
 * (#308, #337): Uncanny Dodge or a reaction spell. The attack as rolled and
 * chosen, and how far the opponent's turn had got.
 */
export type PendingReaction = Readonly<{
  reactorId: string;
  attackerId: string;
  weapon: Weapon;
  targetRoll?: number;
  weaponRoll?: number;
  roll: AttackRoll;
  progress: OpponentProgress;
}>;

export type TurnEconomy = Readonly<{
  /** Actions left this turn. */
  actions: number;
  /** Actions this turn in all: 1, and 1 more for each Action Surge. */
  maxActions: number;
  /**
   * Attacks left in the Attack action under way (#287): Extra Attack's
   * second attack, once the first has spent the action.
   */
  attacks: number;
  bonusAction: boolean;
  /**
   * The turn's object interaction, which draws, stows or swaps a weapon. A
   * second weapon interaction in one turn is refused.
   */
  interaction: boolean;
  /**
   * The Light property's extra attack: `ready` once the combatant has
   * attacked with a light weapon this turn, `used` once made.
   */
  lightAttack: "unready" | "ready" | "used";
  /** Whether Sneak Attack can still be dealt this turn (#306). */
  sneakAttack: boolean;
  /** Steady Aim taken this turn (#307): advantage on the next attack. */
  steadyAim: boolean;
  /**
   * A spell slot spent this turn (#336): SRD 5.2 allows one a turn, so a
   * second levelled spell, by action or bonus action, is refused.
   */
  slotSpent: boolean;
}>;

const FRESH_TURN: TurnEconomy = {
  actions: 1,
  maxActions: 1,
  attacks: 0,
  bonusAction: true,
  interaction: true,
  lightAttack: "unready",
  sneakAttack: true,
  steadyAim: false,
  slotSpent: false,
};

/**
 * Both d20s of an attack rolled with advantage or disadvantage, and the
 * engine rules that gave them. With one of each, a single d20 is rolled.
 */
export type RollMode = Readonly<{
  d20s: readonly number[];
  advantage: readonly string[];
  disadvantage: readonly string[];
}>;

export type EncounterActionType =
  | "attack"
  | "light-attack"
  | "second-wind"
  | "action-surge"
  | "hide"
  | "steady-aim"
  | "drink-potion"
  | "cast"
  | "divine-spark"
  | "turn-undead"
  | "preserve-life"
  | "spectral-attack"
  | "end-turn"
  | ReactionAnswer;

/** What Divine Spark does (#341): heal, or deal radiant or necrotic damage. */
export const DIVINE_SPARK_MODES = ["heal", "radiant", "necrotic"] as const;
export type DivineSparkMode = (typeof DIVINE_SPARK_MODES)[number];

/** Turn Undead's name and the id its hold is kept under (#341). */
export const TURN_UNDEAD = "Turn Undead";
export const TURN_UNDEAD_ID = "turn-undead";

/** The answers to a hit that Uncanny Dodge could halve (#308). */
export type ReactionAnswer = "uncanny-dodge" | "take-hit";

export type EncounterAction =
  | Readonly<{
      type: "attack" | "light-attack";
      actorId: string;
      targetId: string;
      /** Cunning Strike's effect (#308), dealt with its Sneak Attack. */
      cunningStrike?: CunningStrikeId;
    }>
  | Readonly<{
      type:
        | "second-wind"
        | "action-surge"
        | "hide"
        | "steady-aim"
        | "turn-undead"
        | "preserve-life"
        | "end-turn"
        | ReactionAnswer;
      actorId: string;
    }>
  | Readonly<{ type: "drink-potion"; actorId: string; itemId: string }>
  /** Divine Spark (#341) at its target. */
  | Readonly<{
      type: "divine-spark";
      actorId: string;
      targetId: string;
      mode: DivineSparkMode;
    }>
  /** Spiritual Weapon's attack (#341) with the bonus action. */
  | Readonly<{ type: "spectral-attack"; actorId: string; targetId: string }>
  | CastAction
  /**
   * Draws, stows or swaps a weapon with the turn's object interaction: the
   * combatant attacks with `attack`, and `lightAttack` if any, from now on.
   */
  | Readonly<{
      type: "interact";
      actorId: string;
      attack: Weapon;
      lightAttack?: Weapon;
    }>;

/**
 * Casting a spell (#336) the combatant can cast, at its targets: a cantrip
 * with no slot, a levelled spell with a slot of its level or higher. Only an
 * area spell (#338) takes more than one target, up to its most.
 */
export type CastAction = Readonly<{
  type: "cast";
  actorId: string;
  spellId: string;
  slotLevel?: number;
  targetIds: readonly string[];
  /**
   * The damage type chosen at casting, for a spell that takes one: the one
   * Resistance resists (#339), or the one Chromatic Orb deals (#340).
   */
  damageType?: DamageType;
}>;

export type AttackEvent = Readonly<{
  type: "attack";
  actorId: string;
  targetId: string;
  weapon: string;
  d20: number;
  bonus: number;
  total: number;
  armorClass: number;
  hit: boolean;
  critical: boolean;
  /** Present when advantage or disadvantage applied; `d20` is the kept die. */
  mode?: RollMode;
  /** Dice the attacker's effects added to `total` (#337): Bless's. */
  effectDice?: readonly EffectDie[];
  /** The opponent die that chose this target, when there was a choice. */
  targetRoll?: number;
  /** The opponent die that chose this attack, when it had a choice. */
  weaponRoll?: number;
  /** Rampage's bonus attack, after the attacker dropped a combatant. */
  rampage?: true;
  /** The damage dice as rolled. */
  damageRolls: readonly number[];
  damageModifier: number;
  /** The damage dealt, after any resistance, vulnerability or immunity. */
  damage: number;
  damageType: DamageType;
  /** Present when the target's defences changed the damage rolled. */
  damageAdjustment?: DamageAdjustment;
  /**
   * The target's HP once the damage lands: 0 even when Undead Fortitude
   * then leaves it at 1 (its event follows).
   */
  hpAfter: number;
  /** The Light property's extra attack. */
  light?: true;
  /** A ranged attack's ammunition: the kind spent, and how many are left. */
  ammunition?: Readonly<{ kind: AmmunitionId; left: number }>;
  /** A miss that still dealt `damage` through the Graze mastery. */
  graze?: true;
  /** A spell attack (#336): `weapon` names the spell. */
  spell?: true;
  /** Great Weapon Fighting counted each 1 or 2 in `damageRolls` as 3. */
  greatWeaponFighting?: true;
  /**
   * Sneak Attack's dice (#306), rolled after `damageRolls`; `damage` counts
   * them.
   */
  sneakAttack?: Readonly<{ damageRolls: readonly number[] }>;
  /**
   * A hit that is critical only because the target is paralysed, or
   * unconscious (#340): `criticalCondition` names which.
   */
  conditionCritical?: true;
  criticalCondition?: ConditionKind;
  /** A hit's extra damage from the attack's rider, also taken by `hpAfter`. */
  rider?: Readonly<{
    damageRolls: readonly number[];
    damageModifier: number;
    damage: number;
    damageType: DamageType;
    damageAdjustment?: DamageAdjustment;
  }>;
  /**
   * Cunning Strike (#308): the effect, and the Sneak Attack dice forgone
   * for it (doubled by a critical hit, as the rest are).
   */
  cunningStrike?: Readonly<{ effect: CunningStrikeId; dice: number }>;
  /**
   * A hit offered for a reaction first (#308): its d20 and any target or
   * attack die were rolled then, in the `reaction-offered` event.
   */
  resumed?: true;
  /**
   * Uncanny Dodge (#308) halved the hit: `damage` and `rider.damage` are
   * what the target took, and these what it would have taken.
   */
  uncannyDodge?: Readonly<{ damage: number; riderDamage?: number }>;
  /**
   * Resistance (#339) took its die off the damage of its type, the
   * weapon's or the rider's (`part`), which was `from` before; `damage` or
   * `rider.damage` already counts it.
   */
  reduced?: Readonly<{
    spell: string;
    roll: number;
    part: "weapon" | "rider";
    from: number;
  }>;
  /** A spell attack's hit gave the next attack on its target advantage (#339). */
  guided?: true;
}>;

/**
 * An opponent's hit that its target may answer with its reaction (#308,
 * #337): the attack roll, rolled before the damage, which waits for the
 * answer, and the reactions it may answer with, by name.
 */
export type ReactionOfferedEvent = Readonly<{
  type: "reaction-offered";
  reactions: readonly string[];
  combatantId: string;
  attackerId: string;
  weapon: string;
  d20: number;
  mode?: RollMode;
  /** Dice the attacker's effects added to `total` (#337). */
  effectDice?: readonly EffectDie[];
  bonus: number;
  total: number;
  armorClass: number;
  critical: boolean;
  targetRoll?: number;
  weaponRoll?: number;
  rampage?: true;
}>;

/**
 * A combatant with Undead Fortitude reduced to 0 HP: its Constitution save
 * against DC 5 + the damage taken, and the HP it is left with.
 */
export type FortitudeEvent = Readonly<{
  type: "undead-fortitude";
  combatantId: string;
  /** The damage taken from the attack that reduced it to 0 HP. */
  damage: number;
  d20: number;
  bonus: number;
  total: number;
  dc: number;
  success: boolean;
  hpAfter: number;
}>;

/**
 * A saving throw against a condition, on a hit or at the end of a turn. A
 * condition such as paralysed fails some saves without a roll: `autoFail`
 * names it, and no die is drawn.
 */
export type SaveEvent = Readonly<
  {
    type: "save";
    combatantId: string;
    ability: Ability;
    bonus: number;
    dc: number;
    success: boolean;
    condition: ConditionKind;
    /** A repeat save at the end of the combatant's turn. */
    repeat: boolean;
  } & (
    | {
        d20: number;
        /** Present when it rolled with disadvantage (untrained armour). */
        mode?: RollMode;
        /** Dice its effects added to `total` (#337): Bless's. */
        effectDice?: readonly EffectDie[];
        total: number;
        autoFail?: never;
      }
    | { autoFail: ConditionKind; d20?: never; total?: never }
  )
>;

/**
 * A combatant's Hide (#307): its Stealth check against the best passive
 * Perception among its foes, `watcherId`'s.
 */
export type HideEvent = Readonly<{
  type: "hide";
  combatantId: string;
  d20: number;
  /** Present when it rolled with disadvantage (untrained armour, poisoned). */
  mode?: RollMode;
  modifier: number;
  proficiency: number;
  /** Expertise doubled `proficiency`. */
  expertise?: true;
  total: number;
  dc: number;
  watcherId: string;
  success: boolean;
}>;

/**
 * A saving throw (#336): rolled d20 + bonus against a DC, or failed without
 * a roll when a condition (paralysed) fails saves of its ability.
 */
export type SavingThrow = Readonly<
  { ability: Ability; bonus: number; dc: number; success: boolean } & (
    | {
        d20: number;
        /** Present when it rolled with disadvantage (untrained armour). */
        mode?: RollMode;
        /** Dice its effects added to `total` (#337): Bless's. */
        effectDice?: readonly EffectDie[];
        total: number;
        autoFail?: never;
      }
    | { autoFail: ConditionKind; d20?: never; total?: never }
  )
>;

/**
 * A spell cast (#336): the spell, its level and casting time, the slot it
 * spent (a levelled spell's) with the slots of that level left, and its
 * targets, several only for an area spell (#338). Its effect's events
 * follow.
 */
export type CastEvent = Readonly<{
  type: "cast";
  combatantId: string;
  spellId: string;
  spell: string;
  level: number;
  castingTime: CastingTime;
  slot?: Readonly<{ level: number; left: number; max: number }>;
  targetIds: readonly string[];
}>;

/**
 * An area spell's one damage roll (#338), before each target's save
 * (`SpellSaveEvent`, marked `area`).
 */
export type SpellAreaEvent = Readonly<{
  type: "spell-area";
  actorId: string;
  spell: string;
  targetIds: readonly string[];
  damageRolls: readonly number[];
  damageType: DamageType;
}>;

/** A spell's damage as dealt, after any resistance, vulnerability or immunity. */
type SpellDamageDealt = Readonly<{
  damageRolls: readonly number[];
  damageModifier: number;
  damage: number;
  damageType: DamageType;
  damageAdjustment?: DamageAdjustment;
  /** The target's HP once it lands: 0 even when Undead Fortitude then leaves it at 1. */
  hpAfter: number;
}>;

/**
 * A spell's saving throw and its damage (#336): a failure takes the damage,
 * a success half of it (rounded down) or none, as the spell says. No damage
 * dice are rolled when a success takes none.
 */
export type SpellSaveEvent = Readonly<{
  type: "spell-save";
  actorId: string;
  targetId: string;
  spell: string;
  save: SavingThrow;
  onSuccess: "half" | "none";
  /**
   * An area spell's target (#338): `damageRolls` were rolled once, in the
   * `spell-area` event before it.
   */
  area?: true;
}> &
  SpellDamageDealt;

/**
 * A control spell's saving throw (#340, Sleep): rolled, or a success
 * without a roll for a creature immune to exhaustion (`immune`). A failure
 * gives `condition`, in the `condition` event after it.
 */
export type SpellConditionEvent = Readonly<{
  type: "spell-condition";
  actorId: string;
  targetId: string;
  spell: string;
  condition: ConditionKind;
  success: boolean;
}> &
  (
    | Readonly<{ save: SavingThrow; immune?: never }>
    /**
     * Immune to what the spell needs (#340: Sleep's exhaustion, #341:
     * Hold Person's paralysis): no roll.
     */
    | Readonly<{ immune: ConditionImmunity; save?: never }>
  );

/** A spell that always hits (#336), such as Magic Missile: each missile's roll. */
export type SpellDamageEvent = Readonly<{
  type: "spell-damage";
  actorId: string;
  targetId: string;
  spell: string;
  missiles: number;
}> &
  SpellDamageDealt;

/**
 * A healing spell (#336): its dice + the caster's spellcasting modifier
 * (none for Prayer of Healing, #341), and Disciple of Life's 2 + the slot
 * level (#341).
 */
export type SpellHealingEvent = Readonly<{
  type: "spell-healing";
  combatantId: string;
  targetId: string;
  spell: string;
  rolls: readonly number[];
  modifier: number;
  /** Disciple of Life's extra healing (#341). */
  disciple?: number;
  healing: number;
  hpAfter: number;
  maxHp: number;
}>;

/**
 * Divine Spark (#341): its dice + the Wisdom modifier, healing an ally or,
 * after the opponent's Constitution save, dealing radiant or necrotic
 * damage (half on a success). The Channel Divinity uses left.
 */
export type DivineSparkEvent = Readonly<{
  type: "divine-spark";
  combatantId: string;
  targetId: string;
  rolls: readonly number[];
  modifier: number;
  total: number;
  hpAfter: number;
  usesLeft: number;
}> &
  (
    | Readonly<{ mode: "heal"; healing: number; maxHp: number }>
    | Readonly<{
        mode: "radiant" | "necrotic";
        save: SavingThrow;
        damage: number;
        damageAdjustment?: DamageAdjustment;
      }>
  );

/**
 * Turn Undead used (#341): the undead it reaches, each saving next in a
 * `spell-condition` event, and the Channel Divinity uses left.
 */
export type TurnUndeadEvent = Readonly<{
  type: "turn-undead";
  combatantId: string;
  targetIds: readonly string[];
  usesLeft: number;
}>;

/** Preserve Life (#341): the hit points it restores, up to half the maximum. */
export type PreserveLifeEvent = Readonly<{
  type: "preserve-life";
  combatantId: string;
  healing: number;
  hpAfter: number;
  maxHp: number;
  usesLeft: number;
}>;

/** A spell raising maximum and current hit points (#341, Aid). */
export type HitPointsRaisedEvent = Readonly<{
  type: "hit-points-raised";
  targetId: string;
  spell: string;
  bonus: number;
  hpAfter: number;
  maxHp: number;
}>;

/**
 * A buff spell's effect taking hold on its target (#337), and when it ends.
 */
export type EffectEvent = Readonly<{
  type: "effect";
  casterId: string;
  targetId: string;
  spellId: string;
  spell: string;
  buff: Buff;
  ends: EffectEnds;
  concentration?: true;
  /** The damage type chosen at casting (#339), for Resistance. */
  damageType?: DamageType;
}>;

/** An ongoing effect ending (#337), and why. */
export type EffectEndedEvent = Readonly<{
  type: "effect-ended";
  targetId: string;
  casterId: string;
  spellId: string;
  spell: string;
  reason: EffectEndReason;
}>;

/**
 * A Constitution saving throw to keep concentrating on `spell` after taking
 * `damage` (#337); a failure ends it.
 */
export type ConcentrationEvent = Readonly<{
  type: "concentration";
  combatantId: string;
  spell: string;
  damage: number;
  save: SavingThrow;
}>;

/** A combatant's Wisdom saving throw against its morale DC (#237). */
export type MoraleEvent = Readonly<{
  type: "morale";
  combatantId: string;
  trigger: MoraleTrigger;
  d20: number;
  bonus: number;
  total: number;
  dc: number;
  /** A failure means it flees, or surrenders, on its next turn. */
  success: boolean;
}>;

export type EncounterEvent =
  | Readonly<{ type: "initiative"; order: readonly InitiativeRoll[] }>
  | Readonly<{ type: "turn"; combatantId: string; round: number }>
  | AttackEvent
  | Readonly<{ type: "sapped"; targetId: string; sourceId: string }>
  | Readonly<{ type: "vexed"; targetId: string; sourceId: string }>
  | SaveEvent
  | FortitudeEvent
  | MoraleEvent
  | Readonly<{ type: "fled"; combatantId: string }>
  | Readonly<{ type: "surrendered"; combatantId: string }>
  | Readonly<{
      type: "condition";
      combatantId: string;
      kind: ConditionKind;
      sourceId: string;
      source: string;
      turns: number;
      /** The save it repeats at the end of each of its turns. */
      save?: SaveSpec;
      /**
       * It lasts while the spell or turning that gave it does (#341), not
       * for `turns`.
       */
      lasting?: true;
    }>
  | Readonly<{
      type: "condition-ended";
      combatantId: string;
      kind: ConditionKind;
      /**
       * A repeat save, its turns running out, standing up, the fight
       * ending, the control spell that gave it ending (#340), or a spell
       * curing it (#341).
       */
      reason:
        "saved" | "expired" | "stood" | "fight-over" | "spell-ended" | "cured";
    }>
  | Readonly<{
      type: "second-wind";
      combatantId: string;
      roll: number;
      modifier: number;
      healing: number;
      hpAfter: number;
      usesLeft: number;
    }>
  | Readonly<{ type: "action-surge"; combatantId: string; usesLeft: number }>
  | HideEvent
  | Readonly<{ type: "steady-aim"; combatantId: string }>
  | ReactionOfferedEvent
  | PotionEvent
  | CastEvent
  | SpellAreaEvent
  | SpellSaveEvent
  | SpellConditionEvent
  | SpellDamageEvent
  | SpellHealingEvent
  | DivineSparkEvent
  | TurnUndeadEvent
  | PreserveLifeEvent
  | HitPointsRaisedEvent
  | EffectEvent
  | EffectEndedEvent
  | ConcentrationEvent
  | Readonly<{ type: "turn-ended"; combatantId: string }>
  | Readonly<{ type: "defeated"; combatantId: string }>
  | Readonly<{ type: "ended"; outcome: "victory" | "defeat" }>;

/** A potion drunk, in or out of a fight. */
export type PotionEvent = Readonly<{
  type: "potion";
  combatantId: string;
  itemId: string;
  name: string;
  rolls: readonly number[];
  modifier: number;
  healing: number;
  hpAfter: number;
  maxHp: number;
}>;

/**
 * Why the encounter engine refuses an action. Callers branch on `code`, which
 * stays stable; `reason` is the sentence the player and the AI DM read.
 */
export type EncounterRefusalCode =
  | "fight-over"
  | "no-combatant"
  | "not-your-turn"
  | "no-target"
  | "too-many-targets"
  | "duplicate-target"
  | "same-side"
  | "already-defeated"
  | "action-used"
  | "bonus-action-used"
  | "no-light-weapon"
  | "no-light-attack"
  | "light-attack-used"
  | "no-second-wind"
  | "no-action-surge"
  | "no-hide"
  | "already-hidden"
  | "no-steady-aim"
  | "no-attack-left"
  | "no-cunning-strike"
  | "no-sneak-attack"
  | "cunning-strike-target"
  | "reaction-pending"
  | "no-uncanny-dodge"
  | "no-reaction-trigger"
  | "no-potion"
  | "no-uses-left"
  | "full-hp"
  | "interaction-used"
  | "no-arrows"
  | "no-bolts"
  | "no-spellcasting"
  | "unknown-spell"
  | "reaction-spell"
  | "slot-level"
  | "no-slot"
  | "slot-spent"
  | "healing-target"
  | "ally-target"
  | "self-target"
  | "effect-active"
  | "wearing-armour"
  | "fight-only"
  | "damage-type"
  | "no-effect"
  | "no-channel-divinity"
  | "no-undead"
  | "not-bloodied"
  | "no-spectral-weapon"
  | "creature-type"
  | "no-condition"
  | "not-in-fight"
  | "not-self"
  | "paralysed"
  | "fled"
  | "surrendered";

export type EncounterRejection = Readonly<{
  code: EncounterRefusalCode;
  reason: string;
}>;

export type EncounterResult =
  | Readonly<{
      state: EncounterState;
      events: readonly EncounterEvent[];
      rejection?: never;
    }>
  | Readonly<{
      state: EncounterState;
      rejection: EncounterRejection;
      events?: never;
    }>;

type Roller = Pick<RandomSource, "roll">;

export function combatant(state: EncounterState, id: string): Combatant {
  const found = state.combatants.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`Unknown combatant ${id}.`);
  }
  return found;
}

export function isDefeated(target: Combatant): boolean {
  return target.hp === 0;
}

/** Whether `entrantId` has fled the fight (#237). */
export function hasFled(state: EncounterState, entrantId: string): boolean {
  return state.fled.includes(entrantId);
}

/** Whether `entrantId` has surrendered (#238). */
export function hasSurrendered(
  state: EncounterState,
  entrantId: string,
): boolean {
  return state.surrendered.includes(entrantId);
}

/** What a failed morale saving throw makes of a combatant (#237, #238). */
export type MoraleStatus = "fleeing" | "fled" | "surrendering" | "surrendered";

/**
 * Whether `entrantId` is fleeing or has fled (#237), is surrendering or has
 * surrendered (#238), or none of these.
 */
export function moraleStatus(
  state: EncounterState,
  entrantId: string,
): MoraleStatus | undefined {
  if (hasFled(state, entrantId)) {
    return "fled";
  }
  if (hasSurrendered(state, entrantId)) {
    return "surrendered";
  }
  if (!state.fleeing.includes(entrantId)) {
    return undefined;
  }
  return combatant(state, entrantId).surrenders ? "surrendering" : "fleeing";
}

/** Defeated, fled or surrendered: out of the fight. */
function isOut(state: EncounterState, entrant: Combatant): boolean {
  return (
    isDefeated(entrant) ||
    hasFled(state, entrant.id) ||
    hasSurrendered(state, entrant.id)
  );
}

/** The combatant whose turn it is, or undefined once the encounter is over. */
export function currentCombatant(state: EncounterState): Combatant | undefined {
  return state.outcome === "ongoing"
    ? combatant(state, state.order[state.turn]!.combatantId)
    : undefined;
}

/** The combatants still in the fight on the other side from `actorId`. */
export function legalTargets(
  state: EncounterState,
  actorId: string,
): readonly Combatant[] {
  const actor = combatant(state, actorId);
  return state.order
    .map(({ combatantId }) => combatant(state, combatantId))
    .filter((target) => target.side !== actor.side && !isOut(state, target));
}

/**
 * Rolls a d20 with advantage (keep the higher of two), disadvantage (keep
 * the lower) or, with sources of both or neither, one die.
 */
export function rollD20(
  random: Roller,
  advantage: readonly string[],
  disadvantage: readonly string[],
): Readonly<{ d20: number; mode?: RollMode }> {
  if (advantage.length === 0 && disadvantage.length === 0) {
    return { d20: random.roll(20) };
  }
  const d20s =
    advantage.length > 0 && disadvantage.length > 0
      ? [random.roll(20)]
      : [random.roll(20), random.roll(20)];
  return {
    d20:
      advantage.length > 0 && disadvantage.length === 0
        ? Math.max(...d20s)
        : Math.min(...d20s),
    mode: { d20s, advantage: [...advantage], disadvantage: [...disadvantage] },
  };
}

const refused = (
  code: EncounterRefusalCode,
  reason: string,
): EncounterRejection => ({ code, reason });

const BONUS_ACTION_USED = refused(
  "bonus-action-used",
  "You have already used your bonus action this turn.",
);

function secondWindRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (actor.secondWind === undefined) {
    return refused("no-second-wind", "You don't have Second Wind.");
  }
  if (actor.secondWind.uses === 0) {
    return refused("no-uses-left", "You have no uses of Second Wind left.");
  }
  if (!state.economy.bonusAction) {
    return BONUS_ACTION_USED;
  }
  return actor.hp >= actor.maxHp
    ? refused("full-hp", "You are unhurt, so Second Wind would heal nothing.")
    : undefined;
}

/**
 * Rolls a potion's healing for a creature at `hp` of `maxHp`, never above
 * the maximum. Used in and out of a fight.
 */
export function drinkPotion(
  combatantId: string,
  potion: Potion,
  hp: number,
  maxHp: number,
  random: Roller,
): PotionEvent {
  const rolls = Array.from({ length: potion.healing.dice }, () =>
    random.roll(potion.healing.sides),
  );
  const hpAfter = Math.min(
    maxHp,
    hp + rolls.reduce((sum, value) => sum + value, 0) + potion.healing.modifier,
  );
  return {
    type: "potion",
    combatantId,
    itemId: potion.id,
    name: potion.name,
    rolls,
    modifier: potion.healing.modifier,
    healing: hpAfter - hp,
    hpAfter,
    maxHp,
  };
}

function potionRefusal(
  state: EncounterState,
  actor: Combatant,
  itemId?: string,
): EncounterRejection | undefined {
  if (
    !(actor.potions ?? []).some(
      ({ id }) => itemId === undefined || id === itemId,
    )
  ) {
    return refused("no-potion", "You don't have that potion.");
  }
  if (!state.economy.bonusAction) {
    return BONUS_ACTION_USED;
  }
  return actor.hp >= actor.maxHp
    ? refused("full-hp", "You are unhurt, so the potion would heal nothing.")
    : undefined;
}

/** Why the Light property's extra attack can't be made now, whatever the target. */
function lightAttackRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (actor.lightAttack === undefined) {
    return refused("no-light-weapon", "You don't hold two light weapons.");
  }
  if (state.economy.lightAttack === "used") {
    return refused(
      "light-attack-used",
      "You have already made the extra attack with your second light weapon this turn.",
    );
  }
  if (state.economy.lightAttack === "unready") {
    return refused(
      "no-light-attack",
      "The extra attack with your second light weapon follows an attack with a light weapon this turn.",
    );
  }
  return actor.lightAttack.mastery !== "Nick" && !state.economy.bonusAction
    ? BONUS_ACTION_USED
    : undefined;
}

/** The name of disadvantage on a ranged attack once foes have closed in. */
export const CLOSE_COMBAT = "Close combat";

/** The advantage a hidden combatant's next attack has (#307). */
export const HIDDEN = "Hidden";

/** The advantage Steady Aim gives (#307). */
export const STEADY_AIM = "Steady Aim";

/** Guiding Bolt's advantage on the next attack on its target (#339). */
export const GUIDING_BOLT = "Guiding Bolt";

/** Why the combatant's weapon can't shoot: it has no ammunition left. */
function ammunitionRefusal(actor: Combatant): EncounterRejection | undefined {
  const kind = actor.attack.ammunition;
  if (kind === undefined || (actor.ammunition?.[kind] ?? 0) > 0) {
    return undefined;
  }
  return refused(
    kind === "arrows" ? "no-arrows" : "no-bolts",
    `You have no ${kind} left for the ${actor.attack.name.toLowerCase()}.`,
  );
}

function actionSurgeRefusal(actor: Combatant): EncounterRejection | undefined {
  if (actor.actionSurge === undefined) {
    return refused("no-action-surge", "You don't have Action Surge.");
  }
  return actor.actionSurge.uses === 0
    ? refused("no-uses-left", "You have no uses of Action Surge left.")
    : undefined;
}

function hideRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (actor.hide === undefined) {
    return refused("no-hide", "You can't Hide as a bonus action.");
  }
  if (state.hidden.includes(actor.id)) {
    return refused(
      "already-hidden",
      "You are already hidden: your next attack has advantage.",
    );
  }
  return state.economy.bonusAction ? undefined : BONUS_ACTION_USED;
}

/** Whether `actor` still has an attack it can make this turn. */
function attackLeft(state: EncounterState, actor: Combatant): boolean {
  const { actions, attacks, lightAttack } = state.economy;
  return (
    ((actions > 0 || attacks > 0) && ammunitionRefusal(actor) === undefined) ||
    // Nick's extra attack spends no bonus action, so Steady Aim can precede it.
    (lightAttack === "ready" && actor.lightAttack?.mastery === "Nick")
  );
}

function steadyAimRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (actor.steadyAim === undefined) {
    return refused("no-steady-aim", "You don't have Steady Aim.");
  }
  if (!state.economy.bonusAction) {
    return BONUS_ACTION_USED;
  }
  return attackLeft(state, actor)
    ? undefined
    : refused(
        "no-attack-left",
        "You have no attack left this turn for Steady Aim to steady.",
      );
}

/** The combatant's own attack, with a weapon or a spell (#336). */
function ownAttack(origin: AttackOrigin): boolean {
  return (
    origin.kind === "attack" ||
    origin.kind === "light" ||
    origin.kind === "spell"
  );
}

/**
 * The engine rules that give an attack advantage and disadvantage, by name,
 * before it is rolled.
 */
function attackModes(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  weapon: Weapon,
  origin: AttackOrigin,
): Readonly<{ advantage: string[]; disadvantage: string[] }> {
  const sapped = state.sapped.some(({ targetId }) => targetId === actor.id);
  const vexing = state.vexed.some(
    ({ sourceId, targetId }) => sourceId === actor.id && targetId === target.id,
  );
  // Guiding Bolt (#339): the next attack on its target, whoever makes it.
  const guided = (state.guided ?? []).some(
    ({ targetId }) => targetId === target.id,
  );
  // Hiding and Steady Aim (#307) give the combatant's own next attack
  // advantage, a spell attack's too (#336), never a Rampage or opponent
  // attack.
  const own = ownAttack(origin);
  const hidden = own && state.hidden.includes(actor.id);
  const aimed = own && state.economy.steadyAim;
  const packTactics =
    actor.packTactics === true &&
    state.combatants.some(
      (ally) =>
        ally.side === actor.side &&
        ally.id !== actor.id &&
        ableToAct(state, ally),
    );
  return {
    advantage: [
      ...(vexing ? ["Vex"] : []),
      ...(guided ? [GUIDING_BOLT] : []),
      ...(hidden ? [HIDDEN] : []),
      ...(aimed ? [STEADY_AIM] : []),
      ...(packTactics ? ["Pack Tactics"] : []),
      ...conditionSources(state, target.id, "attacked").map(
        (name) => `target ${name.toLowerCase()}`,
      ),
    ],
    disadvantage: [
      ...(sapped ? ["Sap"] : []),
      ...(weapon.disadvantage ?? []),
      // Round 1 is the opening volley; then every foe is close (#230), for
      // a ranged spell attack too (#336, D6).
      ...((weapon.ammunition !== undefined || weapon.ranged === true) &&
      state.round >= 2
        ? [CLOSE_COMBAT]
        : []),
      ...conditionSources(state, actor.id, "attacks"),
    ],
  };
}

/**
 * What keeps an attack with `weapon`, rolled with `modes`, from dealing
 * Sneak Attack on a hit (#306), or undefined when nothing does: Sneak
 * Attack already dealt this turn, a weapon neither Finesse nor ranged, no
 * advantage, or advantage cancelled by disadvantage. Both the hit's damage
 * and Cunning Strike's refusal (#308) ask it.
 */
function sneakAttackBar(
  state: EncounterState,
  weapon: Weapon,
  modes:
    | Readonly<{
        advantage: readonly string[];
        disadvantage: readonly string[];
      }>
    | undefined,
): "spent" | "weapon" | "no-advantage" | "cancelled" | undefined {
  if (!state.economy.sneakAttack) {
    return "spent";
  }
  if (weapon.finesse !== true && weapon.ammunition === undefined) {
    return "weapon";
  }
  if (modes === undefined || modes.advantage.length === 0) {
    return "no-advantage";
  }
  return modes.disadvantage.length === 0 ? undefined : "cancelled";
}

/**
 * Why an attack with `weapon` wouldn't deal Sneak Attack on a hit, for
 * Cunning Strike (#308): its weapon, its advantage, or Sneak Attack already
 * dealt this turn.
 */
function sneakAttackRefusal(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  weapon: Weapon,
  origin: AttackOrigin,
): EncounterRejection | undefined {
  const modes = attackModes(state, actor, target, weapon, origin);
  const bar = sneakAttackBar(state, weapon, modes);
  if (bar === undefined) {
    return undefined;
  }
  return refused(
    "no-sneak-attack",
    {
      spent:
        "You have already dealt Sneak Attack this turn, and Cunning Strike needs it.",
      weapon: `Cunning Strike needs Sneak Attack, and the ${weapon.name.toLowerCase()} is neither a Finesse nor a ranged weapon.`,
      "no-advantage":
        "Cunning Strike needs Sneak Attack, and this attack has no advantage.",
      cancelled: `Cunning Strike needs Sneak Attack, and this attack's advantage is cancelled by disadvantage (${modes.disadvantage.join(", ")}).`,
    }[bar],
  );
}

/**
 * Why `actor` can't add Cunning Strike's `effect` (#308) to this attack on
 * `target`: it lacks the feature, the attack wouldn't deal Sneak Attack, or
 * the effect can't work on the target.
 */
function cunningStrikeRefusal(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  origin: AttackOrigin,
  effect: CunningStrikeId,
): EncounterRejection | undefined {
  if (actor.cunningStrike === undefined || actor.sneakAttack === undefined) {
    return refused("no-cunning-strike", "You don't have Cunning Strike.");
  }
  const weapon = originWeapon(actor, origin);
  const sneak = sneakAttackRefusal(state, actor, target, weapon, origin);
  if (sneak !== undefined) {
    return sneak;
  }
  const strike = CUNNING_STRIKES[effect];
  if (target.conditionImmunities?.includes(strike.condition) === true) {
    return refused(
      "cunning-strike-target",
      `${target.name} can't be ${strike.condition === "prone" ? "knocked prone" : strike.condition}.`,
    );
  }
  return effect === "trip" &&
    target.size !== undefined &&
    UNTRIPPABLE_SIZES.includes(target.size)
    ? refused(
        "cunning-strike-target",
        `${target.name} is too large to trip: Trip needs a ${TRIP_LARGEST_SIZE} or smaller target.`,
      )
    : undefined;
}

/** Whether `target` can answer a hit with Uncanny Dodge now (#308). */
function canDodge(state: EncounterState, target: Combatant): boolean {
  return (
    target.uncannyDodge === true &&
    !state.reacted.includes(target.id) &&
    incapacitatedBy(state, target.id) === undefined
  );
}

/**
 * The reaction spells `target` could cast now (#337): its reaction free,
 * not incapacitated, and a slot of the spell's level or higher left.
 */
function reactionSpells(
  state: EncounterState,
  target: Combatant,
): readonly SpellDefinition[] {
  if (
    state.reacted.includes(target.id) ||
    incapacitatedBy(state, target.id) !== undefined
  ) {
    return [];
  }
  return (target.spellcasting?.spells ?? []).filter(
    (spell) =>
      spell.castingTime === "reaction" &&
      slotLevels(target, spell).some(
        (level) =>
          level !== undefined &&
          (target.spellcasting!.slots[level - 1]?.uses ?? 0) > 0,
      ),
  );
}

/**
 * The reactions `target` could answer a hit with now, by name (#308, #337):
 * Uncanny Dodge and its reaction spells.
 */
function reactionsTo(state: EncounterState, target: Combatant): string[] {
  return [
    ...(canDodge(state, target) ? ["Uncanny Dodge"] : []),
    ...reactionSpells(state, target).map(({ name }) => name),
  ];
}

/** A combatant's AC without armour, which a base-AC effect replaces (#337). */
const UNARMOURED_BASE = 10;

/**
 * `entrant`'s AC with its ongoing effects (#337): a base AC (Mage Armor)
 * in place of the unarmoured 10, while it wears no armour and if that is
 * higher, then each AC bonus (Shield of Faith, Shield). An unarmoured AC is
 * 10 + Dexterity + its shield, so a base AC of 13 adds 3.
 */
export function armorClassOf(entrant: Combatant): number {
  const effects = entrant.effects ?? [];
  const based = effects.reduce(
    (best, { buff }) =>
      buff.kind === "base-armor-class" && entrant.armour !== true
        ? Math.max(best, entrant.armorClass - UNARMOURED_BASE + buff.base)
        : best,
    entrant.armorClass,
  );
  return effects.reduce(
    (total, { buff }) => total + (buff.kind === "armor-class" ? buff.bonus : 0),
    based,
  );
}

/** The sides of a die-giving effect (#339): Resistance's or Guidance's. */
function effectDieSides(buff: Buff): number {
  return "sides" in buff ? buff.sides : 0;
}

/** Rolls the dice `entrant`'s effects add to a d20 roll (#337): Bless's. */
function rollEffectDice(entrant: Combatant, random: Roller): EffectDie[] {
  return (entrant.effects ?? []).flatMap(({ spell, buff }) =>
    buff.kind === "die"
      ? [{ spell, sides: buff.sides, roll: random.roll(buff.sides) }]
      : [],
  );
}

const effectDiceTotal = (dice: readonly EffectDie[]) =>
  dice.reduce((total, { roll }) => total + roll, 0);

/**
 * The effect `casterId` concentrates on (#337), on whichever of
 * `combatants` holds it.
 */
export function concentrationOf(
  combatants: readonly Combatant[],
  casterId: string,
): ActiveEffect | undefined {
  for (const holder of combatants) {
    const held = holder.effects?.find(
      (effect) => effect.casterId === casterId && effect.concentration === true,
    );
    if (held !== undefined) {
      return held;
    }
  }
  return undefined;
}

/** `holder` with `effects` (#337): none drops the field. */
export function withEffects(
  holder: Combatant,
  effects: readonly ActiveEffect[],
): Combatant {
  const { effects: _old, ...rest } = holder;
  void _old;
  return effects.length === 0 ? rest : { ...rest, effects };
}

/** The event of `effect` on `targetId` ending for `reason` (#337). */
export function effectEnded(
  targetId: string,
  effect: ActiveEffect,
  reason: EffectEndReason,
): EffectEndedEvent {
  return {
    type: "effect-ended",
    targetId,
    casterId: effect.casterId,
    spellId: effect.spellId,
    spell: effect.spell,
    reason,
  };
}

/**
 * Ends each effect on any combatant that `ending` picks (#337), with an
 * event for each saying why.
 */
function endEffects(
  state: EncounterState,
  ending: (effect: ActiveEffect, holder: Combatant) => boolean,
  reason: EffectEndReason,
  events: EncounterEvent[],
): EncounterState {
  if (
    !state.combatants.some((holder) =>
      holder.effects?.some((effect) => ending(effect, holder)),
    )
  ) {
    return state;
  }
  // A control spell's conditions (#340) end with it.
  const linked: Readonly<{ holderId: string; effect: ActiveEffect }>[] = [];
  const combatants = state.combatants.map((holder) => {
    const effects = holder.effects ?? [];
    const ended = effects.filter((effect) => ending(effect, holder));
    for (const effect of ended) {
      events.push(effectEnded(holder.id, effect, reason));
      linked.push({ holderId: holder.id, effect });
    }
    return ended.length === 0
      ? holder
      : withEffects(
          holder,
          effects.filter((effect) => !ended.includes(effect)),
        );
  });
  const isLinked = (condition: Condition) =>
    linked.some(
      ({ holderId, effect }) =>
        condition.targetId === holderId &&
        condition.spellId === effect.spellId &&
        condition.sourceId === effect.casterId,
    );
  for (const condition of state.conditions.filter(isLinked)) {
    events.push({
      type: "condition-ended",
      combatantId: condition.targetId,
      kind: condition.kind,
      reason: "spell-ended",
    });
  }
  return {
    ...state,
    combatants,
    conditions: state.conditions.filter((condition) => !isLinked(condition)),
  };
}

/** Whether `effect` is a hold of kind `by` (#340, #341): Sleep's has none. */
const controls = (
  { buff }: ActiveEffect,
  by: "hold" | "turning" | undefined,
): boolean => buff.kind === "control" && buff.by === by;

/**
 * Damage on `targetId` (#340, #341) wakes it from Sleep and ends its
 * turning; a hold (Hold Person) stays.
 */
function wake(
  state: EncounterState,
  targetId: string,
  events: EncounterEvent[],
): EncounterState {
  const woken = endEffects(
    state,
    (effect, holder) => holder.id === targetId && controls(effect, undefined),
    "woke",
    events,
  );
  return endEffects(
    woken,
    (effect, holder) => holder.id === targetId && controls(effect, "turning"),
    "damaged",
    events,
  );
}

/** Whether `entrant` is turned (#341). */
function isTurned(entrant: Combatant): boolean {
  return (entrant.effects ?? []).some((effect) => controls(effect, "turning"));
}

/**
 * An attack or harmful spell aimed at `targetIds` (#341, D13) ends their
 * turning first.
 */
function stirTurned(
  state: EncounterState,
  targetIds: readonly string[],
  events: EncounterEvent[],
): EncounterState {
  return endEffects(
    state,
    (effect, holder) =>
      targetIds.includes(holder.id) && controls(effect, "turning"),
    "attacked",
    events,
  );
}

/**
 * Whether every opponent of `actorId` still in the fight is turned (#341,
 * D13): the character may then attack them or leave.
 */
export function everyFoeTurned(
  state: EncounterState,
  actorId: string,
): boolean {
  const foes = legalTargets(state, actorId);
  return foes.length > 0 && foes.every(isTurned);
}

/**
 * `entrantId` has just been incapacitated: its concentration ends (#337),
 * and the turning it gave (#341).
 */
function incapacitate(
  state: EncounterState,
  entrantId: string,
  events: EncounterEvent[],
): EncounterState {
  return endEffects(
    endConcentration(state, entrantId, "incapacitated", events),
    (effect) => effect.casterId === entrantId && controls(effect, "turning"),
    "incapacitated",
    events,
  );
}

/** Ends the spell `casterId` concentrates on (#337), saying why. */
function endConcentration(
  state: EncounterState,
  casterId: string,
  reason: EffectEndReason,
  events: EncounterEvent[],
): EncounterState {
  return endEffects(
    state,
    (effect) => effect.casterId === casterId && effect.concentration === true,
    reason,
    events,
  );
}

/**
 * The DC of the Constitution save to keep concentrating after `damage`
 * (SRD 5.2, #337): half the damage, rounded down, at least 10 and at most 30.
 */
export function concentrationDc(damage: number): number {
  return Math.min(30, Math.max(10, Math.floor(damage / 2)));
}

/**
 * After `damage` that left `entrantId` standing (#337): if it concentrates
 * on a spell, its Constitution saving throw to keep it; a failure ends it.
 */
function keepConcentration(
  state: EncounterState,
  entrantId: string,
  damage: number,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const entrant = combatant(state, entrantId);
  const held = concentrationOf(state.combatants, entrantId);
  if (damage <= 0 || entrant.hp === 0 || held === undefined) {
    return state;
  }
  const save = savingThrow(
    state,
    entrant,
    { ability: "constitution", dc: concentrationDc(damage) },
    random,
  );
  events.push({
    type: "concentration",
    combatantId: entrantId,
    spell: held.spell,
    damage,
    save,
  });
  return save.success
    ? state
    : endConcentration(state, entrantId, "concentration-broken", events);
}

type ConditionRule = (typeof CONDITION_RULES)[ConditionKind];

/** The kind of the first condition on `entrantId` whose rule passes `test`. */
function conditionWhere(
  state: EncounterState,
  entrantId: string,
  test: (rule: ConditionRule) => boolean,
): ConditionKind | undefined {
  return state.conditions.find(
    ({ targetId, kind }) =>
      targetId === entrantId && test(CONDITION_RULES[kind]),
  )?.kind;
}

/** The condition on `entrantId`, such as paralysed, that stops it acting. */
export function incapacitatedBy(
  state: EncounterState,
  entrantId: string,
): ConditionKind | undefined {
  return conditionWhere(
    state,
    entrantId,
    ({ incapacitated }) => incapacitated === true,
  );
}

/**
 * Why `actor` can't use Channel Divinity now (#341): it lacks it, has no
 * use left, or its action is spent.
 */
function channelRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (actor.channelDivinity === undefined) {
    return refused("no-channel-divinity", "You don't have Channel Divinity.");
  }
  if (actor.channelDivinity.uses === 0) {
    return refused(
      "no-uses-left",
      "You have no uses of Channel Divinity left.",
    );
  }
  return state.economy.actions === 0
    ? refused("action-used", "You have already used your action this turn.")
    : undefined;
}

/** The undead opponents of `actor` still in the fight and not turned (#341). */
function turnable(state: EncounterState, actor: Combatant): Combatant[] {
  return legalTargets(state, actor.id).filter(
    (foe) => foe.creatureType === "undead" && !isTurned(foe),
  );
}

function turnUndeadRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  return (
    channelRefusal(state, actor) ??
    (turnable(state, actor).length === 0
      ? refused(
          "no-undead",
          "Turn Undead turns undead, and no undead opponent here is left to turn.",
        )
      : undefined)
  );
}

/**
 * Preserve Life's healing for `actor` now (#341): up to its pool, never
 * above half its hit points.
 */
function preserved(actor: Combatant): number {
  return Math.min(
    actor.channelDivinity?.preserveLife ?? 0,
    Math.max(0, Math.floor(actor.maxHp / 2) - actor.hp),
  );
}

function preserveLifeRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (actor.channelDivinity?.preserveLife === undefined) {
    return refused("no-channel-divinity", "You don't have Preserve Life.");
  }
  const refusal = channelRefusal(state, actor);
  if (refusal !== undefined) {
    return refusal;
  }
  return actor.hp * 2 > actor.maxHp || preserved(actor) === 0
    ? refused(
        "not-bloodied",
        "Preserve Life heals only the Bloodied, and never above half their hit points: you are at half or more.",
      )
    : undefined;
}

/**
 * Whether Divine Spark (#341) has a target now: an opponent always, while
 * the fight goes on.
 */
function divineSparkRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  return channelRefusal(state, actor);
}

/** The Spiritual Weapon `actor` commands (#341), if any. */
function spectralWeaponOf(actor: Combatant): ActiveEffect | undefined {
  return actor.effects?.find(
    ({ buff, casterId }) =>
      buff.kind === "spectral-weapon" && casterId === actor.id,
  );
}

function spectralRefusal(
  state: EncounterState,
  actor: Combatant,
): EncounterRejection | undefined {
  if (spectralWeaponOf(actor) === undefined) {
    return refused(
      "no-spectral-weapon",
      "You have no spectral weapon to command: cast Spiritual Weapon first.",
    );
  }
  return state.economy.bonusAction ? undefined : BONUS_ACTION_USED;
}

/** The weapon Spiritual Weapon's later attacks are made with (#341). */
function spectralWeapon(actor: Combatant, effect: ActiveEffect): Weapon {
  const buff = effect.buff as Extract<Buff, { kind: "spectral-weapon" }>;
  return {
    name: effect.spell,
    bonus: actor.spellcasting?.attackBonus ?? 0,
    damage: {
      dice: buff.dice,
      sides: buff.sides,
      modifier: actor.spellcasting?.modifier ?? 0,
      type: buff.type,
    },
    criticalRange: 20,
  };
}

/** What `actorId` may do now; empty unless it is its turn. */
export function availableActions(
  state: EncounterState,
  actorId: string,
): readonly EncounterActionType[] {
  // A hit waiting for a reaction (#308, #337): its target answers it with
  // Uncanny Dodge, a reaction spell or by taking it, and no one does
  // anything else.
  if (state.pendingReaction !== undefined) {
    if (
      state.outcome !== "ongoing" ||
      state.pendingReaction.reactorId !== actorId
    ) {
      return [];
    }
    const reactor = combatant(state, actorId);
    return [
      ...(canDodge(state, reactor) ? (["uncanny-dodge"] as const) : []),
      ...(reactionSpells(state, reactor).length > 0 ? (["cast"] as const) : []),
      "take-hit",
    ];
  }
  const actor = currentCombatant(state);
  if (actor?.id !== actorId) {
    return [];
  }
  if (incapacitatedBy(state, actorId) !== undefined) {
    return ["end-turn"];
  }
  return [
    ...((state.economy.attacks > 0 || state.economy.actions > 0) &&
    ammunitionRefusal(actor) === undefined
      ? (["attack"] as const)
      : []),
    ...(lightAttackRefusal(state, actor) === undefined
      ? (["light-attack"] as const)
      : []),
    ...(secondWindRefusal(state, actor) === undefined
      ? (["second-wind"] as const)
      : []),
    ...(actionSurgeRefusal(actor) === undefined
      ? (["action-surge"] as const)
      : []),
    ...(hideRefusal(state, actor) === undefined ? (["hide"] as const) : []),
    ...(steadyAimRefusal(state, actor) === undefined
      ? (["steady-aim"] as const)
      : []),
    ...(potionRefusal(state, actor) === undefined
      ? (["drink-potion"] as const)
      : []),
    ...(canCast(state, actor) ? (["cast"] as const) : []),
    ...(divineSparkRefusal(state, actor) === undefined
      ? (["divine-spark"] as const)
      : []),
    ...(turnUndeadRefusal(state, actor) === undefined
      ? (["turn-undead"] as const)
      : []),
    ...(preserveLifeRefusal(state, actor) === undefined
      ? (["preserve-life"] as const)
      : []),
    ...(spectralRefusal(state, actor) === undefined
      ? (["spectral-attack"] as const)
      : []),
    "end-turn",
  ];
}

function validateCombatants(combatants: readonly Combatant[]): void {
  const ids = new Set(combatants.map(({ id }) => id));
  if (ids.size !== combatants.length) {
    throw new Error("Combatant ids must be unique.");
  }
  for (const side of ["party", "opponents"] as const) {
    if (
      !combatants.some(
        (candidate) => candidate.side === side && !isDefeated(candidate),
      )
    ) {
      throw new Error(`An encounter needs a living combatant on ${side}.`);
    }
  }
}

/** The source a surprised combatant's initiative disadvantage names. */
export const SURPRISED = "surprised";

function rollInitiative(
  combatants: readonly Combatant[],
  random: Roller,
): InitiativeRoll[] {
  const rolls = combatants.map((entrant) => {
    // Initiative is a Dexterity check.
    const { d20, mode } = rollD20(random, entrant.initiativeAdvantages ?? [], [
      ...(entrant.abilityDisadvantages?.dexterity ?? []),
      ...(entrant.surprised === true ? [SURPRISED] : []),
    ]);
    return {
      combatantId: entrant.id,
      d20,
      ...(mode === undefined ? {} : { mode }),
      bonus: entrant.initiativeBonus,
      total: d20 + entrant.initiativeBonus,
      tieBreaks: [] as number[],
    };
  });
  const dexterity = new Map(
    combatants.map(({ id, dexterity }) => [id, dexterity]),
  );
  const key = (roll: (typeof rolls)[number]) =>
    [roll.total, dexterity.get(roll.combatantId)!, ...roll.tieBreaks].join(",");
  // Roll off until every combatant's (total, Dexterity, roll-offs) differs.
  for (;;) {
    const groups = new Map<string, typeof rolls>();
    for (const roll of rolls) {
      groups.set(key(roll), [...(groups.get(key(roll)) ?? []), roll]);
    }
    const tied = [...groups.values()].filter((group) => group.length > 1);
    if (tied.length === 0) {
      break;
    }
    for (const group of tied) {
      for (const roll of group) {
        roll.tieBreaks.push(random.roll(20));
      }
    }
  }
  const compare = (
    a: (typeof rolls)[number],
    b: (typeof rolls)[number],
  ): number => {
    if (a.total !== b.total) {
      return b.total - a.total;
    }
    const byDexterity =
      dexterity.get(b.combatantId)! - dexterity.get(a.combatantId)!;
    if (byDexterity !== 0) {
      return byDexterity;
    }
    for (let index = 0; ; index++) {
      const difference = b.tieBreaks[index]! - a.tieBreaks[index]!;
      if (difference !== 0) {
        return difference;
      }
    }
  };
  return rolls.sort(compare);
}

/** Every combatant on `side` is defeated or has fled. */
function sideBeaten(state: EncounterState, side: Side): boolean {
  return state.combatants
    .filter((candidate) => candidate.side === side)
    .every((candidate) => isOut(state, candidate));
}

/**
 * Checks `side`'s morale if its first fall or half strength has come and its
 * check for it has not been made (#237). Each combatant on it still in the
 * fight, with a morale DC and not already fleeing, makes a Wisdom saving throw in
 * initiative order; one that fails is fleeing.
 */
function checkMorale(
  state: EncounterState,
  side: Side,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const members = state.combatants.filter(
    (candidate) => candidate.side === side,
  );
  const left = members.filter((member) => !isOut(state, member)).length;
  const reached: readonly (readonly [MoraleTrigger, boolean])[] = [
    ["first-fall", members.some(isDefeated)],
    ["half-strength", left * 2 <= members.length],
  ];
  const due = reached.flatMap(([trigger, now]) =>
    now &&
    !state.moraleChecks.some(
      (check) => check.side === side && check.trigger === trigger,
    )
      ? [trigger]
      : [],
  );
  // Both triggers can come at once (a pair's first fall): the side checks
  // once, the event names the first, and both are marked made.
  const [trigger] = due;
  if (trigger === undefined) {
    return state;
  }
  const fleeing = [...state.fleeing];
  for (const { combatantId } of state.order) {
    const member = combatant(state, combatantId);
    if (
      member.side !== side ||
      member.morale === undefined ||
      isOut(state, member) ||
      fleeing.includes(member.id)
    ) {
      continue;
    }
    const d20 = random.roll(20);
    const bonus = member.saves.wisdom;
    const success = d20 + bonus >= member.morale;
    events.push({
      type: "morale",
      combatantId: member.id,
      trigger,
      d20,
      bonus,
      total: d20 + bonus,
      dc: member.morale,
      success,
    });
    if (!success) {
      fleeing.push(member.id);
    }
  }
  return {
    ...state,
    fleeing,
    moraleChecks: [
      ...state.moraleChecks,
      ...due.map((made) => ({ side, trigger: made })),
    ],
  };
}

/**
 * Ends the fight once a side is beaten; every condition ends with it, and
 * every effect lasting a fight or until a turn (#337).
 */
function concludeIfOver(
  state: EncounterState,
  events: EncounterEvent[],
): EncounterState {
  const outcome = sideBeaten(state, "opponents")
    ? "victory"
    : sideBeaten(state, "party")
      ? "defeat"
      : "ongoing";
  if (outcome === "ongoing") {
    return state;
  }
  for (const { targetId, kind } of state.conditions) {
    events.push({
      type: "condition-ended",
      combatantId: targetId,
      kind,
      reason: "fight-over",
    });
  }
  // Every condition has ended already, a control spell's (#340) too.
  const ended = endEffects(
    { ...state, conditions: [] },
    ({ ends }) => !outlastsFight(ends),
    "fight-over",
    events,
  );
  events.push({ type: "ended", outcome });
  return { ...ended, outcome, conditions: [], fleeing: [] };
}

/**
 * A fleeing combatant leaves the fight on its turn, or surrenders if it may
 * (#238). Its conditions end silently, as a defeated one's do, and its going
 * may bring its side to half strength.
 */
function flee(
  state: EncounterState,
  entrant: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const yields = entrant.surrenders === true;
  events.push({
    type: yields ? "surrendered" : "fled",
    combatantId: entrant.id,
  });
  const gone: EncounterState = {
    ...state,
    fleeing: state.fleeing.filter((id) => id !== entrant.id),
    ...(yields
      ? { surrendered: [...state.surrendered, entrant.id] }
      : { fled: [...state.fled, entrant.id] }),
    conditions: state.conditions.filter(
      ({ targetId }) => targetId !== entrant.id,
    ),
  };
  return concludeIfOver(
    checkMorale(gone, entrant.side, random, events),
    events,
  );
}

/**
 * What a damage die counts as: with Great Weapon Fighting a 1 or 2 counts as
 * 3, otherwise the value rolled.
 */
export function countedDamageDie(
  value: number,
  greatWeaponFighting: boolean | undefined,
): number {
  return greatWeaponFighting === true ? Math.max(3, value) : value;
}

/**
 * The damage a creature with `defenses` takes from `rolled` damage of `type`
 * (SRD 5.2): none if immune, half (rounded down) if resistant, double if
 * vulnerable, and which applied.
 */
export function damageTaken(
  defenses: DamageDefenses,
  type: DamageType,
  rolled: number,
): Readonly<{ damage: number; damageAdjustment?: DamageAdjustment }> {
  const by = defenses.immunities?.includes(type)
    ? "immunity"
    : defenses.resistances?.includes(type)
      ? "resistance"
      : defenses.vulnerabilities?.includes(type)
        ? "vulnerability"
        : undefined;
  if (by === undefined || rolled === 0) {
    return { damage: rolled };
  }
  const damage = {
    immunity: 0,
    resistance: Math.floor(rolled / 2),
    vulnerability: rolled * 2,
  }[by];
  return { damage, damageAdjustment: { by, rolled } };
}

/** In the fight and able to act, for Pack Tactics. */
function ableToAct(state: EncounterState, entrant: Combatant): boolean {
  return (
    !isOut(state, entrant) && incapacitatedBy(state, entrant.id) === undefined
  );
}

/** The names of `entrantId`'s conditions with `effect` on attack rolls. */
function conditionSources(
  state: EncounterState,
  entrantId: string,
  effect: "attacks" | "attacked" | "checks",
): string[] {
  return [
    ...new Set(
      state.conditions
        .filter(
          ({ targetId, kind }) =>
            targetId === entrantId &&
            CONDITION_RULES[kind][effect] !== undefined,
        )
        .map(({ kind }) => CONDITION_RULES[kind].name),
    ),
  ];
}

/**
 * `entrant`'s saving throw against `save` (#336), in a fight: d20 + its
 * save bonus, with disadvantage from its ability's disadvantages, or failed
 * without a roll when one of its conditions (paralysed) fails saves of that
 * ability. Conditions and spells both make their saves through it.
 */
export function savingThrow(
  state: EncounterState,
  entrant: Combatant,
  save: SaveSpec,
  random: Roller,
  advantage: readonly string[] = [],
): SavingThrow {
  const bonus = entrant.saves[save.ability];
  const fails = conditionWhere(
    state,
    entrant.id,
    ({ failsSaves }) => failsSaves?.includes(save.ability) === true,
  );
  const common = { ability: save.ability, bonus, dc: save.dc };
  if (fails !== undefined) {
    return { ...common, success: false, autoFail: fails };
  }
  const { d20, mode } = rollD20(
    random,
    advantage,
    entrant.abilityDisadvantages?.[save.ability] ?? [],
  );
  // Bless (#337) adds its die to the save.
  const effectDice = rollEffectDice(entrant, random);
  const total = d20 + bonus + effectDiceTotal(effectDice);
  return {
    ...common,
    d20,
    ...(mode === undefined ? {} : { mode }),
    ...(effectDice.length === 0 ? {} : { effectDice }),
    total,
    success: total >= save.dc,
  };
}

/** Rolls `entrant`'s saving throw against a condition (`savingThrow`). */
function rollSave(
  state: EncounterState,
  entrant: Combatant,
  save: SaveSpec,
  condition: ConditionKind,
  repeat: boolean,
  random: Roller,
): SaveEvent {
  // Protection from Poison (#341): advantage against being poisoned.
  const ward =
    condition === "poisoned"
      ? (entrant.effects ?? []).find(({ buff }) => buff.kind === "poison-ward")
      : undefined;
  return {
    type: "save",
    combatantId: entrant.id,
    condition,
    repeat,
    ...savingThrow(
      state,
      entrant,
      save,
      random,
      ward === undefined ? [] : [ward.spell],
    ),
  };
}

/**
 * `entrant`'s damage defences with its effects' (#341): Protection from
 * Poison resists poison damage, and cancels a vulnerability to it.
 */
function defencesOf(entrant: Combatant): DamageDefenses {
  const warded = (entrant.effects ?? []).some(
    ({ buff }) => buff.kind === "poison-ward",
  );
  if (
    !warded ||
    entrant.immunities?.includes("poison") === true ||
    entrant.resistances?.includes("poison") === true
  ) {
    return entrant;
  }
  return entrant.vulnerabilities?.includes("poison") === true
    ? {
        ...entrant,
        vulnerabilities: entrant.vulnerabilities.filter(
          (type) => type !== "poison",
        ),
      }
    : { ...entrant, resistances: [...(entrant.resistances ?? []), "poison"] };
}

/**
 * A condition a hit gives, from a rider or Cunning Strike (#308), named by
 * `source`: the target saves if it names a save, and on a failure (or with
 * no save) has the condition, replacing any of the same kind.
 */
function applyCondition(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  condition: NonNullable<AttackRider["condition"]>,
  source: string,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  if (target.conditionImmunities?.includes(condition.kind) === true) {
    return state;
  }
  if (condition.save !== undefined) {
    const save = rollSave(
      state,
      target,
      condition.save,
      condition.kind,
      false,
      random,
    );
    events.push(save);
    if (save.success) {
      return state;
    }
  }
  const turns = condition.kind === "prone" ? 1 : (condition.turns ?? 1);
  const repeat =
    condition.repeatSave === true && condition.save !== undefined
      ? { save: condition.save }
      : {};
  events.push({
    type: "condition",
    combatantId: target.id,
    kind: condition.kind,
    sourceId: actor.id,
    source,
    turns,
    ...repeat,
  });
  const given: EncounterState = {
    ...state,
    conditions: [
      ...state.conditions.filter(
        ({ targetId, kind }) =>
          targetId !== target.id || kind !== condition.kind,
      ),
      {
        kind: condition.kind,
        targetId: target.id,
        sourceId: actor.id,
        source,
        turnsLeft: turns,
        ...repeat,
      },
    ],
  };
  // An incapacitated combatant loses its concentration (#337) and the
  // turning it gave (#341).
  return incapacitatedBy(given, target.id) === undefined
    ? given
    : incapacitate(given, target.id, events);
}

/**
 * The end of `entrant`'s turn: it repeats the save against each condition
 * that allows one, and a condition whose turns have run out ends (a prone
 * combatant stands up). A control spell's condition (#340) that fails its
 * repeat save gives way to the worse one (`then`); one that ends otherwise
 * ends the spell on it.
 */
function endTurn(
  state: EncounterState,
  entrant: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const conditions: Condition[] = [];
  const released: {
    spellId: string;
    sourceId: string;
    reason: EffectEndReason;
  }[] = [];
  for (const condition of state.conditions) {
    if (condition.targetId !== entrant.id) {
      conditions.push(condition);
      continue;
    }
    const ended = (reason: "saved" | "expired" | "stood") => {
      events.push({
        type: "condition-ended",
        combatantId: entrant.id,
        kind: condition.kind,
        reason,
      });
      if (condition.spellId !== undefined) {
        released.push({
          spellId: condition.spellId,
          sourceId: condition.sourceId,
          reason: reason === "saved" ? "saved" : "lapsed",
        });
      }
    };
    if (condition.save !== undefined) {
      const save = rollSave(
        state,
        entrant,
        condition.save,
        condition.kind,
        true,
        random,
      );
      events.push(save);
      if (save.success) {
        ended("saved");
        continue;
      }
      // Sleep's second failed save (#340): Unconscious for the duration.
      if (condition.then !== undefined) {
        const worse: Condition = {
          kind: condition.then,
          targetId: entrant.id,
          sourceId: condition.sourceId,
          source: condition.source,
          turnsLeft: condition.turnsLeft,
          ...(condition.spellId === undefined
            ? {}
            : { spellId: condition.spellId }),
        };
        events.push(
          {
            type: "condition-ended",
            combatantId: entrant.id,
            kind: condition.kind,
            reason: "expired",
          },
          conditionEvent(worse),
        );
        conditions.push(worse);
        continue;
      }
    }
    // A spell's condition lasts until the spell ends on it, whose minute is
    // the fight (D9): Sleep's Unconscious (#340), Hold Person's paralysis
    // after a failed save and Turn Undead's conditions (#341) never run
    // out by turns.
    if (condition.spellId !== undefined) {
      conditions.push(condition);
      continue;
    }
    if (condition.turnsLeft <= 1) {
      ended(condition.kind === "prone" ? "stood" : "expired");
      continue;
    }
    conditions.push({ ...condition, turnsLeft: condition.turnsLeft - 1 });
  }
  return released.reduce(
    (next, { spellId, sourceId, reason }) =>
      endEffects(
        next,
        (effect, holder) =>
          holder.id === entrant.id &&
          effect.buff.kind === "control" &&
          effect.spellId === spellId &&
          effect.casterId === sourceId,
        reason,
        events,
      ),
    { ...state, conditions } as EncounterState,
  );
}

/** The `condition` event of a condition given (#340). */
function conditionEvent(condition: Condition): EncounterEvent {
  return {
    type: "condition",
    combatantId: condition.targetId,
    kind: condition.kind,
    sourceId: condition.sourceId,
    source: condition.source,
    turns: condition.turnsLeft,
    ...(condition.save === undefined ? {} : { save: condition.save }),
    ...(condition.spellId === undefined ? {} : { lasting: true as const }),
  };
}

/**
 * What kind of attack it is: a combatant's own attack, the Light property's
 * extra attack, or an opponent's (Rampage's bonus attack among them), with
 * the weapon its dice chose, those dice and how far its turn had got.
 */
type AttackOrigin =
  | Readonly<{ kind: "attack" | "light" }>
  /**
   * A spell attack (#336), with the spell made a weapon (`spellWeapon`);
   * `guides` (#339) gives the next attack on its target advantage on a hit.
   */
  | Readonly<{ kind: "spell"; weapon: Weapon; guides?: true }>
  | Readonly<{
      kind: "opponent" | "rampage";
      weapon: Weapon;
      targetRoll: number | undefined;
      weaponRoll: number | undefined;
      progress: OpponentProgress;
    }>;

/** The weapon an attack of `origin` is made with. */
function originWeapon(actor: Combatant, origin: AttackOrigin): Weapon {
  return "weapon" in origin
    ? origin.weapon
    : origin.kind === "light"
      ? actor.lightAttack!
      : actor.attack;
}

/** Rolls an attack's d20 against `target`: whether it hits, and how well. */
function rollAttack(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  random: Roller,
  origin: AttackOrigin,
): AttackRoll {
  const weapon = originWeapon(actor, origin);
  const { advantage, disadvantage } = attackModes(
    state,
    actor,
    target,
    weapon,
    origin,
  );
  const { d20, mode } = rollD20(random, advantage, disadvantage);
  // Bless (#337) adds its die to the attack roll.
  const effectDice = rollEffectDice(actor, random);
  const natural = d20 >= weapon.criticalRange;
  const total = d20 + weapon.bonus + effectDiceTotal(effectDice);
  const hit = d20 !== 1 && (natural || total >= armorClassOf(target));
  // Paralysed, or unconscious (#340): every hit on it is a critical hit.
  const criticalCondition = hit
    ? conditionWhere(
        state,
        target.id,
        ({ criticalHits }) => criticalHits === true,
      )
    : undefined;
  const conditionCritical = !natural && criticalCondition !== undefined;
  return {
    d20,
    ...(mode === undefined ? {} : { mode }),
    total,
    hit,
    critical: natural || conditionCritical,
    conditionCritical,
    ...(conditionCritical ? { criticalCondition } : {}),
    ...(effectDice.length === 0 ? {} : { effectDice }),
  };
}

/**
 * Rolls an attack. An opponent's hit on a combatant that can answer it with
 * its reaction (Uncanny Dodge, #308, or a reaction spell, #337) stops
 * before its damage: the fight waits on the answer (`pendingReaction`), and
 * `landAttack` finishes it.
 */
function resolveAttack(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  random: Roller,
  origin: AttackOrigin = { kind: "attack" },
  cunningStrike?: CunningStrikeId,
): { state: EncounterState; events: EncounterEvent[] } {
  const roll = rollAttack(state, actor, target, random, origin);
  const reactions =
    roll.hit && "progress" in origin ? reactionsTo(state, target) : [];
  if (reactions.length > 0 && "progress" in origin) {
    const { weapon, targetRoll, weaponRoll, progress } = origin;
    return {
      state: {
        ...state,
        pendingReaction: {
          reactorId: target.id,
          attackerId: actor.id,
          weapon,
          ...(targetRoll === undefined ? {} : { targetRoll }),
          ...(weaponRoll === undefined ? {} : { weaponRoll }),
          roll,
          progress,
        },
      },
      events: [
        {
          type: "reaction-offered",
          reactions,
          combatantId: target.id,
          attackerId: actor.id,
          weapon: weapon.name,
          d20: roll.d20,
          ...(roll.mode === undefined ? {} : { mode: roll.mode }),
          ...(roll.effectDice === undefined
            ? {}
            : { effectDice: roll.effectDice }),
          bonus: weapon.bonus,
          total: roll.total,
          armorClass: armorClassOf(target),
          critical: roll.critical,
          ...(targetRoll === undefined ? {} : { targetRoll }),
          ...(weaponRoll === undefined ? {} : { weaponRoll }),
          ...(origin.kind === "rampage" ? { rampage: true as const } : {}),
        },
      ],
    };
  }
  return landAttack(state, actor, target, random, origin, roll, {
    ...(cunningStrike === undefined ? {} : { cunningStrike }),
  });
}

/**
 * Uncanny Dodge's halving (#308): the attack's damage, its weapon's part and
 * its rider's, halved once as a whole, rounding down. Each part is halved
 * rounding down, and the point that rounding the parts separately loses, if
 * any, goes back to the larger part (the weapon's on a tie), so the parts
 * sum to the halved total and each keeps its damage type. It comes after
 * resistances, which no player character has.
 */
function halvedOnce(weapon: number, rider: number): readonly [number, number] {
  const halfWeapon = Math.floor(weapon / 2);
  const halfRider = Math.floor(rider / 2);
  const lost = Math.floor((weapon + rider) / 2) - halfWeapon - halfRider;
  return weapon >= rider
    ? [halfWeapon + lost, halfRider]
    : [halfWeapon, halfRider + lost];
}

/**
 * How an attack lands once rolled: the Cunning Strike chosen with it (#308),
 * and for a hit offered for Uncanny Dodge first, whether the target halved
 * it (`dodged`).
 */
type Landing = Readonly<{
  cunningStrike?: CunningStrikeId;
  resumed?: Readonly<{ dodged: boolean }>;
}>;

/**
 * An attack's damage and everything after it: Sneak Attack (less any dice
 * Cunning Strike forgoes), Graze, resistances, Uncanny Dodge's halving,
 * the rider's damage, Undead Fortitude, falling and morale, Sap and Vex,
 * then Cunning Strike's and the rider's conditions.
 */
function landAttack(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  random: Roller,
  origin: AttackOrigin,
  {
    d20,
    mode,
    total,
    hit,
    critical,
    conditionCritical,
    criticalCondition,
    effectDice,
  }: AttackRoll,
  landing: Landing,
): { state: EncounterState; events: EncounterEvent[] } {
  const light = origin.kind === "light";
  const chosen =
    origin.kind === "opponent" || origin.kind === "rampage"
      ? origin
      : undefined;
  const weapon = originWeapon(actor, origin);
  const own = ownAttack(origin);
  const hidden = own && state.hidden.includes(actor.id);
  const aimed = own && state.economy.steadyAim;
  const damageRolls: number[] = [];
  if (hit) {
    const dice = weapon.damage.dice * (critical ? 2 : 1);
    for (let die = 0; die < dice; die++) {
      damageRolls.push(random.roll(weapon.damage.sides));
    }
  }
  // Sneak Attack: once per turn, on a hit with a Finesse or ranged weapon
  // rolled with advantage; its dice follow the weapon's, doubled by a
  // critical hit. Cunning Strike (#308) forgoes some before they are rolled.
  const strike =
    landing.cunningStrike === undefined
      ? undefined
      : CUNNING_STRIKES[landing.cunningStrike];
  const sneaking =
    hit &&
    actor.sneakAttack !== undefined &&
    sneakAttackBar(state, weapon, mode) === undefined;
  const forgone = sneaking && strike !== undefined ? strike.dice : 0;
  const sneak = sneaking
    ? {
        damageRolls: Array.from(
          {
            length: (actor.sneakAttack!.dice - forgone) * (critical ? 2 : 1),
          },
          () => random.roll(actor.sneakAttack!.sides),
        ),
      }
    : undefined;
  // Graze: a miss still deals the damage modifier, if above 0.
  const graze =
    !hit && weapon.mastery === "Graze" && weapon.damage.modifier > 0;
  const rolled = hit
    ? Math.max(
        0,
        damageRolls.reduce(
          (sum, value) =>
            sum + countedDamageDie(value, weapon.greatWeaponFighting),
          0,
        ) + weapon.damage.modifier,
      ) + (sneak?.damageRolls.reduce((sum, value) => sum + value, 0) ?? 0)
    : graze
      ? weapon.damage.modifier
      : 0;
  const defended = damageTaken(defencesOf(target), weapon.damage.type, rolled);
  const dodged = landing.resumed?.dodged === true;
  const damageAdjustment = defended.damageAdjustment;
  // A hit's rider deals its extra damage, its dice doubled by a critical.
  const extra = hit ? weapon.rider?.damage : undefined;
  const riderRolled =
    extra === undefined
      ? undefined
      : (() => {
          const rolls = Array.from(
            { length: extra.dice * (critical ? 2 : 1) },
            () => random.roll(extra.sides),
          );
          const taken = damageTaken(
            defencesOf(target),
            extra.type,
            Math.max(
              0,
              rolls.reduce((sum, value) => sum + value, 0) + extra.modifier,
            ),
          );
          return {
            damageRolls: rolls,
            damageModifier: extra.modifier,
            damage: taken.damage,
            damageType: extra.type,
            ...(taken.damageAdjustment === undefined
              ? {}
              : { damageAdjustment: taken.damageAdjustment }),
          };
        })();
  // Resistance (#339): once a turn, its die comes off the target's damage
  // of its type, the weapon's first, then the rider's.
  const turnKey = `${state.round}:${state.turn}`;
  const takes = (part: "weapon" | "rider", type: DamageType | undefined) =>
    part === "weapon"
      ? type === weapon.damage.type && defended.damage > 0
      : riderRolled !== undefined &&
        type === riderRolled.damageType &&
        riderRolled.damage > 0;
  const ward = (target.effects ?? []).find(
    ({ buff, damageType, reducedIn }) =>
      buff.kind === "damage-reduction" &&
      reducedIn !== turnKey &&
      (takes("weapon", damageType) || takes("rider", damageType)),
  );
  const reduced =
    ward === undefined
      ? undefined
      : {
          spell: ward.spell,
          roll: random.roll(effectDieSides(ward.buff)),
          part: takes("weapon", ward.damageType)
            ? ("weapon" as const)
            : ("rider" as const),
          from: takes("weapon", ward.damageType)
            ? defended.damage
            : (riderRolled?.damage ?? 0),
        };
  const weaponTaken =
    reduced?.part === "weapon"
      ? Math.max(0, defended.damage - reduced.roll)
      : defended.damage;
  const riderTaken =
    riderRolled === undefined
      ? 0
      : reduced?.part === "rider"
        ? Math.max(0, riderRolled.damage - reduced.roll)
        : riderRolled.damage;
  // Uncanny Dodge (#308) halves the attack's damage once, rounding down.
  const [damage, riderDamage] = dodged
    ? halvedOnce(weaponTaken, riderTaken)
    : [weaponTaken, riderTaken];
  const rider =
    riderRolled === undefined
      ? undefined
      : { ...riderRolled, damage: riderDamage };
  const taken = damage + (rider?.damage ?? 0);
  const hpAfter = Math.max(0, target.hp - taken);
  // A ranged attack spends one of the attacker's arrows or bolts.
  const spent =
    weapon.ammunition === undefined
      ? undefined
      : {
          kind: weapon.ammunition,
          left: (actor.ammunition?.[weapon.ammunition] ?? 0) - 1,
        };
  const events: EncounterEvent[] = [
    {
      type: "attack",
      actorId: actor.id,
      targetId: target.id,
      weapon: weapon.name,
      d20,
      bonus: weapon.bonus,
      total,
      armorClass: armorClassOf(target),
      hit,
      critical: hit && critical,
      ...(mode === undefined ? {} : { mode }),
      ...(effectDice === undefined ? {} : { effectDice }),
      ...(chosen?.targetRoll === undefined
        ? {}
        : { targetRoll: chosen.targetRoll }),
      ...(chosen?.weaponRoll === undefined
        ? {}
        : { weaponRoll: chosen.weaponRoll }),
      ...(origin.kind === "rampage" ? { rampage: true as const } : {}),
      damageRolls,
      damageModifier: weapon.damage.modifier,
      damage,
      damageType: weapon.damage.type,
      ...(damageAdjustment === undefined ? {} : { damageAdjustment }),
      hpAfter,
      ...(light ? { light: true as const } : {}),
      ...(spent === undefined ? {} : { ammunition: spent }),
      ...(graze ? { graze: true as const } : {}),
      ...(origin.kind === "spell" ? { spell: true as const } : {}),
      ...(hit && weapon.greatWeaponFighting === true
        ? { greatWeaponFighting: true as const }
        : {}),
      ...(sneak === undefined ? {} : { sneakAttack: sneak }),
      ...(conditionCritical
        ? {
            conditionCritical: true as const,
            ...(criticalCondition === undefined ? {} : { criticalCondition }),
          }
        : {}),
      ...(rider === undefined ? {} : { rider }),
      ...(forgone === 0 || landing.cunningStrike === undefined
        ? {}
        : {
            cunningStrike: {
              effect: landing.cunningStrike,
              dice: forgone * (critical ? 2 : 1),
            },
          }),
      ...(landing.resumed === undefined ? {} : { resumed: true as const }),
      ...(dodged
        ? {
            uncannyDodge: {
              damage: weaponTaken,
              ...(riderRolled === undefined ? {} : { riderDamage: riderTaken }),
            },
          }
        : {}),
      ...(reduced === undefined ? {} : { reduced }),
    },
  ];
  // Undead Fortitude: reduced to 0 HP by damage that isn't radiant or from
  // a critical hit, a Constitution save against DC 5 + the damage taken
  // leaves it at 1 HP.
  const radiant =
    (weapon.damage.type === "radiant" && damage > 0) ||
    (rider?.damageType === "radiant" && rider.damage > 0);
  const hpLeft = fortitude(
    target,
    hpAfter,
    taken,
    (hit && critical) || radiant,
    random,
    events,
  );
  // Guiding Bolt's hit (#339) on a target left standing gives the next
  // attack on it advantage.
  const guides =
    origin.kind === "spell" && origin.guides === true && hit && hpLeft > 0;
  if (guides) {
    events[0] = { ...(events[0] as AttackEvent), guided: true };
  }
  // The attack spends any disadvantage Sap gave the attacker, any
  // advantage Vex gave it against this target, any advantage Guiding Bolt
  // gave against it (#339), and its hiding and Steady Aim (#307).
  // Resistance notes the turn it reduced damage in.
  let next: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === target.id
        ? withEffects(
            { ...candidate, hp: hpLeft },
            (candidate.effects ?? []).map((effect) =>
              effect === ward ? { ...effect, reducedIn: turnKey } : effect,
            ),
          )
        : candidate.id === actor.id && spent !== undefined
          ? {
              ...candidate,
              ammunition: {
                ...candidate.ammunition!,
                [spent.kind]: spent.left,
              },
            }
          : candidate,
    ),
    sapped: state.sapped.filter(({ targetId }) => targetId !== actor.id),
    vexed: state.vexed.filter(
      ({ sourceId, targetId }) =>
        sourceId !== actor.id || targetId !== target.id,
    ),
    ...(state.guided === undefined && !guides
      ? {}
      : {
          guided: [
            ...(state.guided ?? []).filter(
              ({ targetId }) => targetId !== target.id,
            ),
            ...(guides
              ? [
                  {
                    targetId: target.id,
                    sourceId: actor.id,
                    round: state.round,
                  },
                ]
              : []),
          ],
        }),
    hidden: state.hidden.filter((id) => !hidden || id !== actor.id),
    engaged: engage(state, actor, target),
    economy: {
      ...state.economy,
      // Sneak Attack is dealt once a turn.
      sneakAttack: sneak === undefined && state.economy.sneakAttack,
      steadyAim: !aimed && state.economy.steadyAim,
    },
  };
  // Damage wakes a target from Sleep (#340) and ends its turning (#341).
  if (taken > 0) {
    next = wake(next, target.id, events);
  }
  const defeated = hpLeft === 0 && target.hp > 0;
  if (defeated) {
    next = fall(next, target, random, events);
  } else if (hit && weapon.mastery === "Sap") {
    next = {
      ...next,
      sapped: [
        ...next.sapped.filter(({ targetId }) => targetId !== target.id),
        { targetId: target.id, sourceId: actor.id },
      ],
    };
    events.push({ type: "sapped", targetId: target.id, sourceId: actor.id });
  } else if (hit && damage > 0 && weapon.mastery === "Vex") {
    next = {
      ...next,
      vexed: [
        ...next.vexed,
        { targetId: target.id, sourceId: actor.id, round: state.round },
      ],
    };
    events.push({ type: "vexed", targetId: target.id, sourceId: actor.id });
  }
  // Damage that leaves the target standing tests its concentration (#337).
  if (!defeated) {
    next = keepConcentration(next, target.id, taken, random, events);
  }
  // Cunning Strike's effect (#308) follows the damage, on a target still up.
  if (sneak !== undefined && strike !== undefined && !defeated) {
    next = applyCondition(
      next,
      actor,
      target,
      {
        kind: strike.condition,
        save: { ability: strike.save, dc: actor.cunningStrike!.dc },
        turns: strike.turns,
        ...(strike.condition === "poisoned"
          ? { repeatSave: true as const }
          : {}),
      },
      `Cunning Strike (${strike.name})`,
      random,
      events,
    );
  }
  if (hit && !defeated && weapon.rider?.condition !== undefined) {
    next = applyCondition(
      next,
      actor,
      target,
      weapon.rider.condition,
      weapon.name,
      random,
      events,
    );
  }
  return { state: concludeIfOver(next, events), events };
}

/**
 * Undead Fortitude (SRD 5.2): `target`, with it, reduced from above 0 to 0
 * HP by `taken` damage that isn't radiant or from a critical hit
 * (`bypassed`), makes a Constitution save against DC 5 + the damage taken,
 * and is left at 1 HP on a success. The HP it is left with.
 */
function fortitude(
  target: Combatant,
  hpAfter: number,
  taken: number,
  bypassed: boolean,
  random: Roller,
  events: EncounterEvent[],
): number {
  if (
    hpAfter > 0 ||
    target.hp === 0 ||
    target.undeadFortitude !== true ||
    bypassed
  ) {
    return hpAfter;
  }
  const d20 = random.roll(20);
  const bonus = target.saves.constitution;
  const dc = 5 + taken;
  const success = d20 + bonus >= dc;
  const hpLeft = success ? 1 : 0;
  events.push({
    type: "undead-fortitude",
    combatantId: target.id,
    damage: taken,
    d20,
    bonus,
    total: d20 + bonus,
    dc,
    success,
    hpAfter: hpLeft,
  });
  return hpLeft;
}

/**
 * `target` has just fallen to 0 HP: it is defeated, its conditions and its
 * flight end, and its side checks morale.
 */
function fall(
  state: EncounterState,
  target: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  events.push({ type: "defeated", combatantId: target.id });
  // A fallen caster's concentration ends (#337).
  const fallen = endConcentration(state, target.id, "fell", events);
  return checkMorale(
    {
      ...fallen,
      conditions: fallen.conditions.filter(
        ({ targetId }) => targetId !== target.id,
      ),
      fleeing: fallen.fleeing.filter((id) => id !== target.id),
    },
    target.side,
    random,
    events,
  );
}

/**
 * Moves to the next living combatant's turn and plays opponents' turns until
 * a party combatant is to act or the encounter ends.
 */
function advance(
  state: EncounterState,
  random: Roller,
  events: EncounterEvent[],
  startWithCurrent: boolean,
): EncounterState {
  let next = state;
  let first = startWithCurrent;
  // A hit waiting for a reaction (#308, #337) stops the fight until answered.
  while (next.outcome === "ongoing" && next.pendingReaction === undefined) {
    if (!first) {
      const ending = combatant(next, next.order[next.turn]!.combatantId);
      if (!isOut(next, ending)) {
        next = endTurn(next, ending, random, events);
      }
      const turn = (next.turn + 1) % next.order.length;
      next = { ...next, turn, round: next.round + (turn === 0 ? 1 : 0) };
    }
    first = false;
    const actor = combatant(next, next.order[next.turn]!.combatantId);
    if (isOut(next, actor)) {
      continue;
    }
    // A turn starts afresh, gives back the combatant's reaction (#308), and
    // ends any Sap it gave and any Vex it gave before its last turn.
    const round = next.round;
    next = {
      ...next,
      economy: FRESH_TURN,
      reacted: next.reacted.filter((id) => id !== actor.id),
      sapped: next.sapped.filter(({ sourceId }) => sourceId !== actor.id),
      vexed: next.vexed.filter(
        (vex) => vex.sourceId !== actor.id || round < vex.round + 2,
      ),
      // Guiding Bolt's advantage (#339) lasts as Vex's does.
      ...(next.guided === undefined
        ? {}
        : {
            guided: next.guided.filter(
              (mark) => mark.sourceId !== actor.id || round < mark.round + 2,
            ),
          }),
    };
    events.push({ type: "turn", combatantId: actor.id, round: next.round });
    // Its effects lasting until its next turn (Shield, #337) end.
    next = endEffects(
      next,
      (effect) => effect.casterId === actor.id && effect.ends === "next-turn",
      "next-turn",
      events,
    );
    // A fleeing combatant leaves, or surrenders, on its turn, unless it
    // can't act.
    if (
      next.fleeing.includes(actor.id) &&
      incapacitatedBy(next, actor.id) === undefined
    ) {
      next = flee(next, actor, random, events);
      continue;
    }
    if (actor.side === "party") {
      return next;
    }
    // An incapacitated opponent can only wait for its turn to end.
    if (incapacitatedBy(next, actor.id) !== undefined) {
      continue;
    }
    next = opponentTurn(next, actor, random, events);
  }
  return next;
}

/**
 * One attack by an opponent: a die picks its target when more than one
 * stands, and another its attack when its Multiattack offers more than one.
 */
function opponentAttack(
  state: EncounterState,
  actor: Combatant,
  random: Roller,
  progress: OpponentProgress,
): { state: EncounterState; events: EncounterEvent[] } {
  const targets = legalTargets(state, actor.id);
  const targetRoll =
    targets.length > 1 ? random.roll(targets.length) : undefined;
  const weapons = actor.multiattack?.weapons ?? [actor.attack];
  const weaponRoll =
    weapons.length > 1 ? random.roll(weapons.length) : undefined;
  return resolveAttack(state, actor, targets[(targetRoll ?? 1) - 1]!, random, {
    kind: progress.rampage ? "rampage" : "opponent",
    weapon: weapons[(weaponRoll ?? 1) - 1]!,
    targetRoll,
    weaponRoll,
    progress,
  });
}

/**
 * An opponent's turn: its attacks (several with Multiattack), and Rampage's
 * bonus attack when one of them drops a combatant. It stops when the fight
 * ends, or while a hit waits for Uncanny Dodge (#308). `resumed` goes on
 * from such a hit once it has landed: how far the turn had got, and whether
 * that hit dropped its target.
 */
function opponentTurn(
  state: EncounterState,
  actor: Combatant,
  random: Roller,
  events: EncounterEvent[],
  resumed?: Readonly<{ progress: OpponentProgress; dropped: boolean }>,
): EncounterState {
  let next = state;
  let { made, bonusAction } = resumed?.progress ?? {
    made: 0,
    bonusAction: true,
  };
  const going = () =>
    next.outcome === "ongoing" && next.pendingReaction === undefined;
  const attack = (rampage: boolean) => {
    const resolved = opponentAttack(next, actor, random, {
      made,
      bonusAction,
      rampage,
    });
    events.push(...resolved.events);
    next = resolved.state;
    return resolved.events.some(({ type }) => type === "defeated");
  };
  const rampageAfter = (dropped: boolean) => {
    if (dropped && actor.rampage === true && bonusAction && going()) {
      bonusAction = false;
      attack(true);
    }
  };
  if (resumed !== undefined) {
    // The paused hit was attack `made` of the Multiattack, or Rampage's
    // bonus attack after it: Rampage reuses its parent attack's `made` and
    // has spent the bonus action, so either way the turn goes on with the
    // next attack, and only a Multiattack hit can still bring Rampage.
    if (!resumed.progress.rampage) {
      rampageAfter(resumed.dropped);
    }
    made += 1;
  }
  for (; made < (actor.multiattack?.attacks ?? 1) && going(); made++) {
    rampageAfter(attack(false));
  }
  return next;
}

/**
 * How the hit waiting for a reaction is answered (#308, #337): halved with
 * Uncanny Dodge, a reaction spell cast first, or taken.
 */
type ReactionReply =
  | Readonly<{ kind: "uncanny-dodge" | "take-hit" }>
  | Readonly<{ kind: "cast"; cast: CastAction }>;

/**
 * Answers the hit waiting for a reaction (#308, #337): halved with Uncanny
 * Dodge, taken in full, or met with a reaction spell cast first (Shield),
 * after which a hit that no longer meets the target's AC misses; a natural
 * critical hit still hits. The hit lands, then the opponent's turn and the
 * fight go on until a party combatant is to act, another hit waits, or the
 * fight ends.
 */
function answerReaction(
  state: EncounterState,
  pending: PendingReaction,
  reply: ReactionReply,
  random: Roller,
): EncounterResult {
  const { pendingReaction: _answered, ...rest } = state;
  void _answered;
  const attacker = combatant(state, pending.attackerId);
  const events: EncounterEvent[] = [];
  const dodged = reply.kind === "uncanny-dodge";
  const reacting: EncounterState =
    reply.kind === "take-hit"
      ? rest
      : { ...rest, reacted: [...rest.reacted, pending.reactorId] };
  const answered =
    reply.kind === "cast"
      ? castSpell(
          reacting,
          combatant(reacting, pending.reactorId),
          reply.cast,
          random,
          events,
        )
      : reacting;
  const target = combatant(answered, pending.reactorId);
  const natural = pending.roll.d20 >= pending.weapon.criticalRange;
  const still = natural || pending.roll.total >= armorClassOf(target);
  const roll: AttackRoll = still
    ? pending.roll
    : { ...pending.roll, hit: false, critical: false };
  const landed = landAttack(
    answered,
    attacker,
    target,
    random,
    {
      kind: pending.progress.rampage ? "rampage" : "opponent",
      weapon: pending.weapon,
      targetRoll: pending.targetRoll,
      weaponRoll: pending.weaponRoll,
      progress: pending.progress,
    },
    roll,
    { resumed: { dodged } },
  );
  events.push(...landed.events);
  let next = opponentTurn(landed.state, attacker, random, events, {
    progress: pending.progress,
    dropped: landed.events.some(({ type }) => type === "defeated"),
  });
  if (next.outcome === "ongoing" && next.pendingReaction === undefined) {
    next = advance(next, random, events, false);
  }
  return { state: next, events };
}

/** `engaged` with `actor` and `target` added: they have exchanged blows. */
function engage(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
): readonly string[] {
  return [
    ...state.engaged,
    ...[actor.id, target.id].filter((id) => !state.engaged.includes(id)),
  ];
}

/** The opponent `actor` aims an attack or spell at, or why it can't be. */
function opponentOf(
  state: EncounterState,
  actor: Combatant,
  targetId: string,
): Combatant | EncounterRejection {
  const target = state.combatants.find(({ id }) => id === targetId);
  if (target === undefined) {
    return refused("no-target", "There is no such opponent here to attack.");
  }
  if (target.side === actor.side) {
    return refused("same-side", `${target.name} is on your side.`);
  }
  if (hasFled(state, target.id)) {
    return refused("fled", `${target.name} has fled.`);
  }
  if (hasSurrendered(state, target.id)) {
    return refused("surrendered", `${target.name} has surrendered.`);
  }
  return isDefeated(target)
    ? refused("already-defeated", `${target.name} is already defeated.`)
    : target;
}

/** The spell `actor` casts by `spellId`, if it can cast it (#336). */
function spellOf(
  actor: Combatant,
  spellId: string,
): SpellDefinition | undefined {
  return actor.spellcasting?.spells.find(({ id }) => id === spellId);
}

/**
 * The slot levels `actor` could cast `spell` with (#336): none for a
 * cantrip; for a levelled spell, its own level up to the highest slot level
 * `actor` has.
 */
export function slotLevels(
  actor: Combatant,
  spell: SpellDefinition,
): readonly (number | undefined)[] {
  if (spell.level === 0) {
    return [undefined];
  }
  const highest = actor.spellcasting?.slots.length ?? 0;
  return Array.from(
    { length: Math.max(0, highest - spell.level + 1) },
    (_, index) => spell.level + index,
  );
}

/**
 * Why `actor` can't cast `action`'s spell with its slot now, whatever the
 * target (#336): no spellcasting, a spell it doesn't know or hasn't
 * prepared, a reaction spell with nothing to react to, a slot level the
 * spell can't use or the caster has none of, a second slot this turn, or
 * its action or bonus action spent. `reacting` (#337) casts a reaction
 * spell in answer to a hit: its slot isn't the turn's one.
 */
function spellRefusal(
  state: EncounterState,
  actor: Combatant,
  action: Pick<CastAction, "spellId" | "slotLevel" | "damageType">,
  reacting = false,
  outside = false,
): EncounterRejection | undefined {
  const casting = actor.spellcasting;
  if (casting === undefined) {
    return refused("no-spellcasting", "You can't cast spells.");
  }
  const spell = spellOf(actor, action.spellId);
  if (spell === undefined) {
    return refused(
      "unknown-spell",
      "You don't know that spell, or haven't prepared it.",
    );
  }
  // Thaumaturgy (#339) is flavour only: nothing to cast in play.
  if (spell.effect.kind === "flavour") {
    return refused(
      "no-effect",
      `${spell.name} is flavour only: it has no effect in play.`,
    );
  }
  // Resistance (#339) names a damage type it may resist, and Chromatic Orb
  // (#340) one it deals; no other spell names one.
  const choices = spell.damageTypes;
  if (
    choices === undefined
      ? action.damageType !== undefined
      : !(choices as readonly unknown[]).includes(action.damageType)
  ) {
    return refused(
      "damage-type",
      choices === undefined
        ? `${spell.name} takes no damage type.`
        : `Choose the damage type ${spell.name} ${reducesDamage(spell) ? "resists" : "deals"}: ${choices.join(", ")}.`,
    );
  }
  // Resistance resists only damage an opponent still in the fight deals;
  // Chromatic Orb may deal any of its types.
  if (reducesDamage(spell)) {
    const dealt = dealtDamageTypes(legalTargets(state, actor.id));
    if (!dealt.has(action.damageType!)) {
      const resistible = (choices ?? []).filter((type) => dealt.has(type));
      return refused(
        "damage-type",
        `${spell.name} resists only damage your opponents' attacks deal: ${resistible.length === 0 ? "none" : resistible.join(", ")}.`,
      );
    }
  }
  // A spell cast in minutes (#341, Prayer of Healing) needs time outside a
  // fight.
  if (spell.castingTime === "minutes" && !outside) {
    return refused(
      "not-in-fight",
      `${spell.name} takes ten minutes to cast: only outside a fight.`,
    );
  }
  if ((spell.castingTime === "reaction") !== reacting) {
    return reacting
      ? refused(
          "reaction-pending",
          `${spell.name} isn't cast as a reaction: answer the hit with a reaction, or take it.`,
        )
      : refused(
          "reaction-spell",
          `${spell.name} is cast as a reaction, when its trigger comes; nothing triggers it now.`,
        );
  }
  const { slotLevel } = action;
  if (spell.level === 0) {
    if (slotLevel !== undefined) {
      return refused(
        "slot-level",
        `${spell.name} is a cantrip: it spends no spell slot.`,
      );
    }
  } else if (
    slotLevel === undefined ||
    !Number.isInteger(slotLevel) ||
    slotLevel < spell.level
  ) {
    return refused(
      "slot-level",
      `${spell.name} needs a spell slot of ${ordinal(spell.level)} level or higher.`,
    );
  } else {
    const slots = casting.slots[slotLevel - 1];
    if (slots === undefined || slots.max === 0) {
      return refused(
        "no-slot",
        `You have no ${ordinal(slotLevel)}-level spell slots.`,
      );
    }
    if (slots.uses === 0) {
      return refused(
        "no-slot",
        `You have no ${ordinal(slotLevel)}-level spell slots left.`,
      );
    }
    if (state.economy.slotSpent && !reacting) {
      return refused(
        "slot-spent",
        "You have already spent a spell slot this turn: only one a turn, so only a cantrip now.",
      );
    }
  }
  if (spell.castingTime === "action" && state.economy.actions === 0) {
    return refused(
      "action-used",
      "You have already used your action this turn.",
    );
  }
  return spell.castingTime === "bonus-action" && !state.economy.bonusAction
    ? BONUS_ACTION_USED
    : undefined;
}

/**
 * The target `actor` casts `spell` at, or why it can't be (#336): an
 * opponent still in the fight for a harmful spell; for a healing spell, the
 * caster or an ally still standing, and hurt.
 */
function spellTarget(
  state: EncounterState,
  actor: Combatant,
  spell: SpellDefinition,
  targetId: string,
): Combatant | EncounterRejection {
  const { effect } = spell;
  if (
    effect.kind !== "healing" &&
    effect.kind !== "buff" &&
    effect.kind !== "restoration"
  ) {
    const foe = opponentOf(state, actor, targetId);
    // Hold Person (#341) holds only a humanoid.
    if (
      "code" in foe ||
      effect.kind !== "control" ||
      effect.creatureType === undefined ||
      foe.creatureType === effect.creatureType
    ) {
      return foe;
    }
    return refused(
      "creature-type",
      `${spell.name} works only on a ${effect.creatureType}, and ${foe.name} is ${foe.creatureType === undefined ? "not one" : `${/^[aeiou]/u.test(foe.creatureType) ? "an" : "a"} ${foe.creatureType}`}.`,
    );
  }
  const target = state.combatants.find(({ id }) => id === targetId);
  if (target === undefined) {
    return refused("no-target", "There is no one here by that name.");
  }
  const you = target.id === actor.id;
  if (target.side !== actor.side) {
    return effect.kind === "healing"
      ? refused(
          "healing-target",
          `${spell.name} heals you or an ally, not ${target.name}.`,
        )
      : refused(
          "ally-target",
          `${spell.name} is cast on you or an ally, not ${target.name}.`,
        );
  }
  if (isOut(state, target)) {
    return refused("already-defeated", `${target.name} is already defeated.`);
  }
  if (effect.kind === "healing") {
    if (target.hp >= target.maxHp) {
      return refused(
        "full-hp",
        `${you ? "You are" : `${target.name} is`} unhurt, so ${spell.name} would heal nothing.`,
      );
    }
    // Prayer of Healing (#341) helps a creature once per long rest.
    return effect.restBenefit === true &&
      target.effects?.some(({ spellId }) => spellId === spell.id) === true
      ? refused(
          "effect-active",
          `${you ? "You" : target.name} can't benefit from ${spell.name} again until a long rest.`,
        )
      : target;
  }
  // Lesser Restoration (#341) needs a condition it ends.
  if (effect.kind === "restoration") {
    return state.conditions.some(
      ({ targetId: held, kind }) =>
        held === target.id && effect.conditions.includes(kind),
    )
      ? target
      : refused(
          "no-condition",
          `${you ? "You have" : `${target.name} has`} none of the conditions ${spell.name} ends: ${effect.conditions.join(", ")}.`,
        );
  }
  // A spell already on its target can't be cast on it again (#337): its
  // duration can't be renewed or extended.
  if (target.effects?.some(({ spellId }) => spellId === spell.id) === true) {
    return refused(
      "effect-active",
      `${spell.name} is already on ${you ? "you" : target.name}: it can't be cast again until it ends.`,
    );
  }
  return effect.buff.kind === "base-armor-class" && target.armour === true
    ? refused(
        "wearing-armour",
        `${spell.name} works only on someone wearing no armour, and ${you ? "you are" : `${target.name} is`} wearing armour.`,
      )
    : target;
}

/**
 * Why `actor` can't cast `action` now, or undefined when it can (#336). A
 * reaction spell (#337), `reacting`, is cast on the reactor itself.
 */
function castRefusal(
  state: EncounterState,
  actor: Combatant,
  action: Pick<
    CastAction,
    "spellId" | "slotLevel" | "targetIds" | "damageType"
  >,
  reacting = false,
  outside = false,
): EncounterRejection | undefined {
  const refusal = spellRefusal(state, actor, action, reacting, outside);
  if (refusal !== undefined) {
    return refusal;
  }
  const spell = spellOf(actor, action.spellId)!;
  const { targetIds } = action;
  // One target, or an area spell's chosen few (#338), each once.
  if (targetIds.length === 0) {
    return refused("no-target", `Name ${spell.name}'s target.`);
  }
  if (new Set(targetIds).size !== targetIds.length) {
    return refused(
      "duplicate-target",
      `${spell.name} can't catch the same creature twice.`,
    );
  }
  const most = maxTargets(spell);
  if (targetIds.length > most) {
    return refused(
      "too-many-targets",
      most === 1
        ? `${spell.name} has one target.`
        : `${spell.name} catches at most ${most} opponents.`,
    );
  }
  if (reacting && targetIds[0] !== actor.id) {
    return refused("self-target", `${spell.name} is cast on yourself.`);
  }
  for (const targetId of targetIds) {
    const target = spellTarget(state, actor, spell, targetId);
    if ("code" in target) {
      return target;
    }
  }
  return undefined;
}

/**
 * Whether `spell` is a damage-reduction buff (#339), Resistance: the damage
 * type named when it is cast is one it resists, not one it deals.
 */
export function reducesDamage(spell: SpellDefinition): boolean {
  return (
    spell.effect.kind === "buff" &&
    spell.effect.buff.kind === "damage-reduction"
  );
}

/**
 * The damage types `foes`' attacks and their riders deal (#339): their
 * weapon, light weapon and Multiattack weapons.
 */
export function dealtDamageTypes(
  foes: readonly Combatant[],
): ReadonlySet<DamageType> {
  return new Set(
    foes.flatMap(({ attack, lightAttack, multiattack }) =>
      [
        attack,
        ...(lightAttack === undefined ? [] : [lightAttack]),
        ...(multiattack?.weapons ?? []),
      ].flatMap(({ damage, rider }) => [
        damage.type,
        ...(rider?.damage === undefined ? [] : [rider.damage.type]),
      ]),
    ),
  );
}

/** Whether `actor` can cast any of its spells at anyone now (#336). */
function canCast(state: EncounterState, actor: Combatant): boolean {
  return (actor.spellcasting?.spells ?? []).some((spell) =>
    slotLevels(actor, spell).some((slotLevel) =>
      state.combatants.some(
        (target) =>
          castRefusal(state, actor, {
            spellId: spell.id,
            ...(slotLevel === undefined ? {} : { slotLevel }),
            targetIds: [target.id],
            ...(spell.damageTypes === undefined
              ? {}
              : { damageType: spell.damageTypes[0]! }),
          }) === undefined,
      ),
    ),
  );
}

/**
 * A spell attack (#336) as the engine attacks with a weapon: its damage of
 * the type chosen at casting, for Chromatic Orb (#340).
 */
function spellWeapon(
  casting: CombatSpellcasting,
  spell: SpellDefinition,
  effect: Extract<SpellEffect, { kind: "attack" }>,
  damageType: DamageType | undefined,
): Weapon {
  return {
    name: spell.name,
    bonus: casting.attackBonus,
    damage: {
      ...effect.damage,
      modifier: 0,
      ...(damageType === undefined ? {} : { type: damageType }),
    },
    criticalRange: 20,
    ...(effect.range === "ranged" ? { ranged: true as const } : {}),
  };
}

/** Rolls `count` dice of `sides`, in order. */
function rollDice(random: Roller, count: number, sides: number): number[] {
  return Array.from({ length: count }, () => random.roll(sides));
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

/**
 * A spell's `rolled` damage of `type` landing on `target` (#336): its
 * defences, then Undead Fortitude (which radiant damage bypasses) and its
 * fall. The spell's event, made by `event` from what was dealt, comes
 * before Undead Fortitude's.
 */
function spellDamage(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  rolled: number,
  type: DamageType,
  random: Roller,
  events: EncounterEvent[],
  event: (
    dealt: Pick<SpellDamageDealt, "damage" | "damageAdjustment" | "hpAfter">,
  ) => EncounterEvent,
): EncounterState {
  const { damage, damageAdjustment } = damageTaken(
    defencesOf(target),
    type,
    rolled,
  );
  const hpAfter = Math.max(0, target.hp - damage);
  events.push(
    event({
      damage,
      ...(damageAdjustment === undefined ? {} : { damageAdjustment }),
      hpAfter,
    }),
  );
  const hpLeft = fortitude(
    target,
    hpAfter,
    damage,
    type === "radiant" && damage > 0,
    random,
    events,
  );
  const hit: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === target.id ? { ...candidate, hp: hpLeft } : candidate,
    ),
    engaged: engage(state, actor, target),
  };
  // Damage wakes a target from Sleep (#340) and ends its turning (#341).
  const next = damage > 0 ? wake(hit, target.id, events) : hit;
  // A fall ends concentration; damage that leaves it standing tests it (#337).
  return hpLeft === 0 && target.hp > 0
    ? fall(next, target, random, events)
    : keepConcentration(next, target.id, damage, random, events);
}

/**
 * Casts `action`, which `castRefusal` has accepted (#336): the slot (a
 * levelled spell's) and the action or bonus action are spent (a reaction
 * spell's reaction is its answer's, #337), then the effect lands. The
 * fight is not concluded here.
 */
function castSpell(
  state: EncounterState,
  actor: Combatant,
  action: CastAction,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const casting = actor.spellcasting!;
  const spell = spellOf(actor, action.spellId)!;
  const effect = effectAtSlot(spell, action.slotLevel);
  const slotIndex = spell.level === 0 ? undefined : action.slotLevel! - 1;
  const slots = casting.slots.map((slot, index) =>
    index === slotIndex ? { ...slot, uses: slot.uses - 1 } : slot,
  );
  const caster: Combatant = { ...actor, spellcasting: { ...casting, slots } };
  let spent: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === actor.id ? caster : candidate,
    ),
    // A reaction spell (#337) is cast on another's turn: it spends none of
    // the turn's actions, nor its one slot; nor does one cast in minutes
    // outside a fight (#341).
    economy:
      spell.castingTime === "reaction" || spell.castingTime === "minutes"
        ? state.economy
        : {
            ...state.economy,
            ...(spell.castingTime === "bonus-action"
              ? { bonusAction: false }
              : { actions: state.economy.actions - 1 }),
            slotSpent: state.economy.slotSpent || slotIndex !== undefined,
          },
  };
  events.push({
    type: "cast",
    combatantId: actor.id,
    spellId: spell.id,
    spell: spell.name,
    level: spell.level,
    castingTime: spell.castingTime,
    ...(slotIndex === undefined
      ? {}
      : {
          slot: {
            level: slotIndex + 1,
            left: slots[slotIndex]!.uses,
            max: slots[slotIndex]!.max,
          },
        }),
    targetIds: action.targetIds,
  });
  // A spell aimed at a turned opponent ends its turning first (#341, D13).
  if (
    effect.kind !== "healing" &&
    effect.kind !== "buff" &&
    effect.kind !== "restoration"
  ) {
    spent = stirTurned(spent, action.targetIds, events);
  }
  // Every spell but an area spell (#338) has one target.
  const target = combatant(spent, action.targetIds[0]!);
  switch (effect.kind) {
    case "attack": {
      const resolved = resolveAttack(spent, caster, target, random, {
        kind: "spell",
        weapon: spellWeapon(casting, spell, effect, action.damageType),
        ...(effect.nextAttackAdvantage === true
          ? { guides: true as const }
          : {}),
      });
      events.push(...resolved.events);
      return resolved.state;
    }
    case "save": {
      if (spell.area !== undefined) {
        return areaDamage(spent, caster, spell, effect, action.targetIds, {
          random,
          events,
        });
      }
      const save = savingThrow(
        spent,
        target,
        { ability: effect.ability, dc: casting.saveDc },
        random,
      );
      // A success that takes no damage rolls no damage dice.
      const damageRolls =
        save.success && effect.onSuccess === "none"
          ? []
          : rollDice(random, effect.damage.dice, effect.damage.sides);
      const full = sum(damageRolls);
      return spellDamage(
        spent,
        caster,
        target,
        save.success ? Math.floor(full / 2) : full,
        effect.damage.type,
        random,
        events,
        (dealt) => ({
          type: "spell-save",
          actorId: actor.id,
          targetId: target.id,
          spell: spell.name,
          save,
          onSuccess: effect.onSuccess,
          damageRolls,
          damageModifier: 0,
          damageType: effect.damage.type,
          ...dealt,
        }),
      );
    }
    case "flavour":
      // Refused before any cast (`spellRefusal`).
      return spent;
    case "control":
      return controlSpell(spent, caster, spell, effect, target, {
        random,
        events,
      });
    case "auto-hit": {
      const { damage, missiles } = effect;
      const damageRolls = rollDice(
        random,
        missiles * damage.dice,
        damage.sides,
      );
      const damageModifier = missiles * damage.modifier;
      return spellDamage(
        spent,
        caster,
        target,
        Math.max(0, sum(damageRolls) + damageModifier),
        damage.type,
        random,
        events,
        (dealt) => ({
          type: "spell-damage",
          actorId: actor.id,
          targetId: target.id,
          spell: spell.name,
          missiles,
          damageRolls,
          damageModifier,
          damageType: damage.type,
          ...dealt,
        }),
      );
    }
    case "healing": {
      // Its dice + the caster's spellcasting modifier (none for Prayer of
      // Healing, #341), and with a slot Disciple of Life's 2 + its level
      // (#341), up to the maximum.
      const rolls = rollDice(random, effect.healing.dice, effect.healing.sides);
      const modifier = effect.noModifier === true ? 0 : casting.modifier;
      const disciple =
        casting.discipleOfLife === true && slotIndex !== undefined
          ? 2 + slotIndex + 1
          : 0;
      const hpAfter = Math.min(
        target.maxHp,
        target.hp + Math.max(0, sum(rolls) + modifier) + disciple,
      );
      events.push({
        type: "spell-healing",
        combatantId: actor.id,
        targetId: target.id,
        spell: spell.name,
        rolls,
        modifier,
        ...(disciple === 0 ? {} : { disciple }),
        healing: hpAfter - target.hp,
        hpAfter,
        maxHp: target.maxHp,
      });
      // Prayer of Healing (#341) helps its target once per long rest.
      const lockout: ActiveEffect | undefined =
        effect.restBenefit === true
          ? {
              spellId: spell.id,
              spell: spell.name,
              casterId: actor.id,
              buff: { kind: "lockout" },
              ends: "long-rest",
            }
          : undefined;
      if (lockout !== undefined) {
        events.push({ type: "effect", targetId: target.id, ...lockout });
      }
      return {
        ...spent,
        combatants: spent.combatants.map((candidate) =>
          candidate.id === target.id
            ? withEffects({ ...candidate, hp: hpAfter }, [
                ...(candidate.effects ?? []),
                ...(lockout === undefined ? [] : [lockout]),
              ])
            : candidate,
        ),
      };
    }
    case "restoration": {
      // Lesser Restoration (#341): the first condition it ends that the
      // target has, in the spell's order.
      const kind = effect.conditions.find((ending) =>
        spent.conditions.some(
          ({ targetId, kind: held }) =>
            targetId === target.id && held === ending,
        ),
      )!;
      return cure(spent, target.id, kind, events);
    }
    case "spectral-weapon": {
      // Spiritual Weapon (#341): the weapon stays with its caster, who
      // concentrates on it, and attacks at once.
      const free = endConcentration(
        spent,
        actor.id,
        "new-concentration",
        events,
      );
      const added: ActiveEffect = {
        spellId: spell.id,
        spell: spell.name,
        casterId: actor.id,
        buff: {
          kind: "spectral-weapon",
          dice: effect.damage.dice,
          sides: effect.damage.sides,
          type: effect.damage.type,
        },
        ends: effectEnds(effect.duration),
        concentration: true,
      };
      events.push({ type: "effect", targetId: actor.id, ...added });
      const armed: EncounterState = {
        ...free,
        combatants: free.combatants.map((candidate) =>
          candidate.id === actor.id
            ? withEffects(candidate, [...(candidate.effects ?? []), added])
            : candidate,
        ),
      };
      const wielder = combatant(armed, actor.id);
      const resolved = resolveAttack(
        armed,
        wielder,
        combatant(armed, target.id),
        random,
        { kind: "spell", weapon: spectralWeapon(wielder, added) },
      );
      events.push(...resolved.events);
      return resolved.state;
    }
    case "buff": {
      // A new concentration spell ends the one before it (#337).
      const free =
        effect.concentration === true
          ? endConcentration(spent, actor.id, "new-concentration", events)
          : spent;
      const added: ActiveEffect = {
        spellId: spell.id,
        spell: spell.name,
        casterId: actor.id,
        buff: effect.buff,
        ends: effectEnds(effect.duration),
        ...(effect.concentration === true
          ? { concentration: true as const }
          : {}),
        // Resistance's chosen damage type (#339).
        ...(action.damageType === undefined
          ? {}
          : { damageType: action.damageType }),
      };
      events.push({
        type: "effect",
        targetId: target.id,
        ...added,
      });
      // Aid (#341) raises maximum and current hit points alike.
      const raise = effect.buff.kind === "max-hp" ? effect.buff.bonus : 0;
      if (raise > 0) {
        events.push({
          type: "hit-points-raised",
          targetId: target.id,
          spell: spell.name,
          bonus: raise,
          hpAfter: target.hp + raise,
          maxHp: target.maxHp + raise,
        });
      }
      const buffed: EncounterState = {
        ...free,
        combatants: free.combatants.map((candidate) =>
          candidate.id === target.id
            ? withEffects(
                {
                  ...candidate,
                  hp: candidate.hp + raise,
                  maxHp: candidate.maxHp + raise,
                },
                [...(candidate.effects ?? []), added],
              )
            : candidate,
        ),
      };
      // Protection from Poison (#341) ends being poisoned.
      return effect.buff.kind === "poison-ward"
        ? cure(buffed, target.id, "poisoned", events)
        : buffed;
    }
  }
}

/**
 * Ends `kind` on `targetId` (#341, a spell's cure); a control spell's
 * condition ends the spell on it too.
 */
function cure(
  state: EncounterState,
  targetId: string,
  kind: ConditionKind,
  events: EncounterEvent[],
): EncounterState {
  const cured = state.conditions.filter(
    (condition) => condition.targetId === targetId && condition.kind === kind,
  );
  if (cured.length === 0) {
    return state;
  }
  events.push({
    type: "condition-ended",
    combatantId: targetId,
    kind,
    reason: "cured",
  });
  const next: EncounterState = {
    ...state,
    conditions: state.conditions.filter(
      (condition) => !cured.includes(condition),
    ),
  };
  return endEffects(
    next,
    (effect, holder) =>
      holder.id === targetId &&
      effect.buff.kind === "control" &&
      cured.some(
        ({ spellId, sourceId }) =>
          spellId === effect.spellId && sourceId === effect.casterId,
      ),
    "cured",
    events,
  );
}

/**
 * A control spell (#340, Sleep) on `target`: casting it ends the caster's
 * other concentration; then the target saves, succeeding without a roll if
 * it is immune to exhaustion. A failure puts the spell on it, which the
 * caster concentrates on, and its first condition until the end of its
 * next turn, with the repeat save that may make it worse (`endTurn`).
 */
function controlSpell(
  state: EncounterState,
  caster: Combatant,
  spell: SpellDefinition,
  effect: Extract<SpellEffect, { kind: "control" }>,
  target: Combatant,
  { random, events }: Readonly<{ random: Roller; events: EncounterEvent[] }>,
): EncounterState {
  const free = endConcentration(state, caster.id, "new-concentration", events);
  const save: SaveSpec = {
    ability: effect.ability,
    dc: caster.spellcasting!.saveDc,
  };
  const common = {
    type: "spell-condition" as const,
    actorId: caster.id,
    targetId: target.id,
    spell: spell.name,
    condition: effect.condition,
  };
  // Sleep's exhaustion, Hold Person's paralysis (#341).
  if (target.conditionImmunities?.includes(effect.immunity) === true) {
    events.push({ ...common, success: true, immune: effect.immunity });
    return free;
  }
  const thrown = savingThrow(free, target, save, random);
  events.push({ ...common, success: thrown.success, save: thrown });
  if (thrown.success) {
    return free;
  }
  const held: ActiveEffect = {
    spellId: spell.id,
    spell: spell.name,
    casterId: caster.id,
    buff:
      effect.hold === true
        ? { kind: "control", by: "hold" }
        : { kind: "control" },
    ends: effectEnds(effect.duration),
    concentration: true,
  };
  events.push({ type: "effect", targetId: target.id, ...held });
  const condition: Condition = {
    kind: effect.condition,
    targetId: target.id,
    sourceId: caster.id,
    source: spell.name,
    turnsLeft: 1,
    save,
    spellId: spell.id,
    ...(effect.then === undefined ? {} : { then: effect.then }),
  };
  events.push(conditionEvent(condition));
  const given: EncounterState = {
    ...free,
    combatants: free.combatants.map((candidate) =>
      candidate.id === target.id
        ? withEffects(candidate, [...(candidate.effects ?? []), held])
        : candidate,
    ),
    conditions: [
      ...free.conditions.filter(
        ({ targetId, kind }) =>
          targetId !== target.id || kind !== effect.condition,
      ),
      condition,
    ],
    engaged: engage(free, caster, target),
  };
  // An incapacitated combatant loses its concentration (#337) and the
  // turning it gave (#341).
  return incapacitate(given, target.id, events);
}

/**
 * Turn Undead (#341): each undead opponent still in the fight and not yet
 * turned saves on Wisdom against the Channel Divinity DC, or is Frightened
 * and Incapacitated, held by a turning that lasts the fight unless damage,
 * an attack on it or the turner's incapacitation ends it.
 */
function turnUndead(
  state: EncounterState,
  actor: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const channel = actor.channelDivinity!;
  const targets = turnable(state, actor);
  const usesLeft = channel.uses - 1;
  events.push({
    type: "turn-undead",
    combatantId: actor.id,
    targetIds: targets.map(({ id }) => id),
    usesLeft,
  });
  let next: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === actor.id
        ? { ...candidate, channelDivinity: { ...channel, uses: usesLeft } }
        : candidate,
    ),
    economy: { ...state.economy, actions: state.economy.actions - 1 },
  };
  for (const target of targets) {
    const thrown = savingThrow(
      next,
      combatant(next, target.id),
      { ability: "wisdom", dc: channel.saveDc },
      random,
    );
    events.push({
      type: "spell-condition",
      actorId: actor.id,
      targetId: target.id,
      spell: TURN_UNDEAD,
      condition: "frightened",
      success: thrown.success,
      save: thrown,
    });
    if (thrown.success) {
      continue;
    }
    const held: ActiveEffect = {
      spellId: TURN_UNDEAD_ID,
      spell: TURN_UNDEAD,
      casterId: actor.id,
      buff: { kind: "control", by: "turning" },
      ends: "fight",
    };
    events.push({ type: "effect", targetId: target.id, ...held });
    const given = (["frightened", "incapacitated"] as const)
      .filter((kind) => target.conditionImmunities?.includes(kind) !== true)
      .map((kind): Condition => ({
        kind,
        targetId: target.id,
        sourceId: actor.id,
        source: TURN_UNDEAD,
        turnsLeft: 1,
        spellId: TURN_UNDEAD_ID,
      }));
    for (const condition of given) {
      events.push(conditionEvent(condition));
    }
    next = incapacitate(
      {
        ...next,
        combatants: next.combatants.map((candidate) =>
          candidate.id === target.id
            ? withEffects(candidate, [...(candidate.effects ?? []), held])
            : candidate,
        ),
        conditions: [
          ...next.conditions.filter(
            ({ targetId, kind }) =>
              targetId !== target.id ||
              !given.some((condition) => condition.kind === kind),
          ),
          ...given,
        ],
      },
      target.id,
      events,
    );
  }
  return next;
}

/**
 * Divine Spark (#341) at `target`: its dice + the Wisdom modifier, healing
 * an ally, or dealing radiant or necrotic damage to an opponent after its
 * Constitution save (half on a success).
 */
function divineSpark(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  mode: DivineSparkMode,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const channel = actor.channelDivinity!;
  const usesLeft = channel.uses - 1;
  const spent: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === actor.id
        ? { ...candidate, channelDivinity: { ...channel, uses: usesLeft } }
        : candidate,
    ),
    economy: { ...state.economy, actions: state.economy.actions - 1 },
  };
  const { dice, sides, modifier } = channel.divineSpark;
  const common = {
    type: "divine-spark" as const,
    combatantId: actor.id,
    targetId: target.id,
    usesLeft,
  };
  if (mode === "heal") {
    const rolls = rollDice(random, dice, sides);
    const total = Math.max(0, sum(rolls) + modifier);
    const hpAfter = Math.min(target.maxHp, target.hp + total);
    events.push({
      ...common,
      mode,
      rolls,
      modifier,
      total,
      healing: hpAfter - target.hp,
      hpAfter,
      maxHp: target.maxHp,
    });
    return {
      ...spent,
      combatants: spent.combatants.map((candidate) =>
        candidate.id === target.id ? { ...candidate, hp: hpAfter } : candidate,
      ),
    };
  }
  const stirred = stirTurned(spent, [target.id], events);
  const aimed = combatant(stirred, target.id);
  const save = savingThrow(
    stirred,
    aimed,
    { ability: "constitution", dc: channel.saveDc },
    random,
  );
  const rolls = rollDice(random, dice, sides);
  const total = Math.max(0, sum(rolls) + modifier);
  return spellDamage(
    stirred,
    combatant(stirred, actor.id),
    aimed,
    save.success ? Math.floor(total / 2) : total,
    mode,
    random,
    events,
    (dealt) => ({
      ...common,
      mode,
      rolls,
      modifier,
      total,
      save,
      ...dealt,
    }),
  );
}

/**
 * An area spell's damage (#338): rolled once, then each target, in the
 * order chosen, saves against the caster's DC and takes the damage, or on
 * a success half of it (rounded down) or none, through its own defences.
 */
function areaDamage(
  state: EncounterState,
  caster: Combatant,
  spell: SpellDefinition,
  effect: Extract<SpellEffect, { kind: "save" }>,
  targetIds: readonly string[],
  { random, events }: Readonly<{ random: Roller; events: EncounterEvent[] }>,
): EncounterState {
  const { damage } = effect;
  const damageRolls = rollDice(random, damage.dice, damage.sides);
  const full = sum(damageRolls);
  events.push({
    type: "spell-area",
    actorId: caster.id,
    spell: spell.name,
    targetIds,
    damageRolls,
    damageType: damage.type,
  });
  let next = state;
  for (const targetId of targetIds) {
    const target = combatant(next, targetId);
    const save = savingThrow(
      next,
      target,
      { ability: effect.ability, dc: caster.spellcasting!.saveDc },
      random,
    );
    const taken = !save.success
      ? full
      : effect.onSuccess === "half"
        ? Math.floor(full / 2)
        : 0;
    next = spellDamage(
      next,
      caster,
      target,
      taken,
      damage.type,
      random,
      events,
      (dealt) => ({
        type: "spell-save",
        actorId: caster.id,
        targetId,
        spell: spell.name,
        save,
        onSuccess: effect.onSuccess,
        area: true,
        damageRolls,
        damageModifier: 0,
        damageType: damage.type,
        ...dealt,
      }),
    );
  }
  return next;
}

/**
 * Casts a spell outside a fight (#336): a healing spell, or a buff whose
 * effect outlasts a fight (#337), with no turn to spend, on the caster
 * itself. The caster afterwards, its slot spent and its effects, and the
 * events; or why it can't.
 */
export function castOutsideFight(
  caster: Combatant,
  action: CastAction,
  random: Roller,
):
  | Readonly<{ caster: Combatant; events: readonly EncounterEvent[] }>
  | Readonly<{ rejection: EncounterRejection }> {
  const spell = spellOf(caster, action.spellId);
  if (spell !== undefined && spell.castingTime !== "reaction") {
    const { effect } = spell;
    if (effect.kind === "buff") {
      // Guidance (#339) waits for the next check, which is made outside
      // fights; any other buff must outlast a fight.
      if (
        effect.buff.kind !== "check-die" &&
        !outlastsFight(effectEnds(effect.duration))
      ) {
        return {
          rejection: refused(
            "fight-only",
            `${spell.name} lasts no longer than a fight: cast it in one.`,
          ),
        };
      }
    } else if (effect.kind !== "healing") {
      return {
        rejection: refused(
          "fight-only",
          `${spell.name} is cast in a fight: outside one, only healing spells and spells that outlast a fight.`,
        ),
      };
    }
  }
  const alone = aloneState(caster);
  const refusal = castRefusal(alone, caster, action, false, true);
  if (refusal !== undefined) {
    return { rejection: refusal };
  }
  const events: EncounterEvent[] = [];
  const after = castSpell(alone, caster, action, random, events);
  return { caster: combatant(after, caster.id), events };
}

/**
 * What waits on the hit `pending` (#308, #337): its target's answers.
 */
function pendingText(state: EncounterState, pending: PendingReaction): string {
  const reactor = combatant(state, pending.reactorId);
  const answers = [
    ...(canDodge(state, reactor)
      ? ["use Uncanny Dodge to halve its damage"]
      : []),
    ...reactionSpells(state, reactor).map(({ name }) => `cast ${name}`),
    "take the hit",
  ];
  return `${combatant(state, pending.attackerId).name}'s ${pending.weapon.name.toLowerCase()} has hit ${reactor.name}: first ${answers.slice(0, -1).join(", ")}, or ${answers.at(-1)!}.`;
}

/** `entrant` alone, outside a fight, at the start of a turn of its own. */
function aloneState(entrant: Combatant): EncounterState {
  return {
    combatants: [entrant],
    order: [
      { combatantId: entrant.id, d20: 1, bonus: 0, total: 1, tieBreaks: [] },
    ],
    round: 1,
    turn: 0,
    outcome: "ongoing",
    economy: FRESH_TURN,
    sapped: [],
    vexed: [],
    conditions: [],
    hidden: [],
    fleeing: [],
    fled: [],
    surrendered: [],
    engaged: [],
    moraleChecks: [],
    reacted: [],
  };
}

/**
 * Damage outside a fight (a trap's, #337) that left `entrant` standing: if
 * it concentrates on a spell, its Constitution save to keep it. The
 * combatant afterwards and the events.
 */
export function keepConcentrationOutsideFight(
  entrant: Combatant,
  damage: number,
  random: Roller,
): Readonly<{ entrant: Combatant; events: readonly EncounterEvent[] }> {
  const events: EncounterEvent[] = [];
  const after = keepConcentration(
    aloneState(entrant),
    entrant.id,
    damage,
    random,
    events,
  );
  return { entrant: combatant(after, entrant.id), events };
}

/**
 * Rolls initiative and plays opponents' turns until the first party
 * combatant's turn.
 */
export function startEncounter(
  combatants: readonly Combatant[],
  random: Roller,
): Readonly<{ state: EncounterState; events: readonly EncounterEvent[] }> {
  validateCombatants(combatants);
  const order = rollInitiative(combatants, random);
  const events: EncounterEvent[] = [{ type: "initiative", order }];
  const state = advance(
    {
      combatants,
      order,
      round: 1,
      turn: 0,
      outcome: "ongoing",
      economy: FRESH_TURN,
      sapped: [],
      vexed: [],
      conditions: [],
      hidden: [],
      fleeing: [],
      fled: [],
      surrendered: [],
      engaged: [],
      moraleChecks: [],
      reacted: [],
    },
    random,
    events,
    true,
  );
  return { state, events };
}

/**
 * The combatant `actorId` acts on its own turn. Its turn ends when it ends
 * it or has nothing left to do; opponents then act until a party
 * combatant's turn comes round again or the encounter ends.
 */
export function act(
  state: EncounterState,
  action: EncounterAction,
  random: Roller,
): EncounterResult {
  const reject = (
    code: EncounterRefusalCode,
    reason: string,
  ): EncounterResult => ({ state, rejection: refused(code, reason) });
  if (state.outcome !== "ongoing") {
    return reject("fight-over", "The fight is over.");
  }
  const actor = state.combatants.find(({ id }) => id === action.actorId);
  const current = currentCombatant(state)!;
  if (actor === undefined) {
    return reject("no-combatant", "There is no such combatant in this fight.");
  }
  // A hit waiting for its target's answer (#308, #337) takes only that
  // answer: Uncanny Dodge, a reaction spell, or taking it. Outside its
  // trigger, there is nothing to answer.
  const pending = state.pendingReaction;
  const answer = action.type === "uncanny-dodge" || action.type === "take-hit";
  if (pending !== undefined) {
    const reacting = actor.id === pending.reactorId;
    if (reacting && action.type === "cast") {
      const refusal = castRefusal(state, actor, action, true);
      return refusal === undefined
        ? answerReaction(state, pending, { kind: "cast", cast: action }, random)
        : { state, rejection: refusal };
    }
    if (!answer || !reacting) {
      return reject("reaction-pending", pendingText(state, pending));
    }
    if (action.type === "uncanny-dodge" && !canDodge(state, actor)) {
      return reject("no-uncanny-dodge", "You don't have Uncanny Dodge.");
    }
    return answerReaction(state, pending, { kind: action.type }, random);
  }
  if (answer) {
    return actor.uncannyDodge === true
      ? reject(
          "no-reaction-trigger",
          "Uncanny Dodge answers an attacker's hit, and nothing has hit you just now.",
        )
      : reject("no-uncanny-dodge", "You don't have Uncanny Dodge.");
  }
  if (actor.id !== current.id) {
    return reject(
      "not-your-turn",
      `It is ${current.name}'s turn, not ${actor.name}'s.`,
    );
  }
  const holding = incapacitatedBy(state, actor.id);
  if (holding !== undefined && action.type !== "end-turn") {
    return reject(
      "paralysed",
      `You are ${holding} and can't act until it ends; you can only wait.`,
    );
  }
  const events: EncounterEvent[] = [];
  let next: EncounterState;
  const targetOf = (targetId: string) => opponentOf(state, actor, targetId);
  switch (action.type) {
    case "attack": {
      const target = targetOf(action.targetId);
      if ("code" in target) {
        return { state, rejection: target };
      }
      const attacking = state.economy.attacks > 0;
      if (!attacking && state.economy.actions === 0) {
        return reject(
          "action-used",
          (actor.attacksPerAction ?? 1) === 1
            ? "You have already used your action this turn."
            : actor.attack.loading === true
              ? `The ${actor.attack.name.toLowerCase()} fires once an action (Loading): you have already shot with this action.`
              : "You have already made every attack your Attack actions allow this turn.",
        );
      }
      const empty = ammunitionRefusal(actor);
      if (empty !== undefined) {
        return { state, rejection: empty };
      }
      const strike =
        action.cunningStrike === undefined
          ? undefined
          : cunningStrikeRefusal(
              state,
              actor,
              target,
              { kind: "attack" },
              action.cunningStrike,
            );
      if (strike !== undefined) {
        return { state, rejection: strike };
      }
      // An attack on a turned opponent ends its turning (#341, D13).
      const stirred = stirTurned(state, [target.id], events);
      const resolved = resolveAttack(
        stirred,
        actor,
        combatant(stirred, target.id),
        random,
        { kind: "attack" },
        action.cunningStrike,
      );
      events.push(...resolved.events);
      next = {
        ...resolved.state,
        economy: {
          ...resolved.state.economy,
          // The first attack spends the action; Extra Attack's follow it,
          // unless a Loading weapon fired, which ends the action's attacks.
          ...(attacking
            ? { attacks: actor.attack.loading ? 0 : state.economy.attacks - 1 }
            : {
                actions: state.economy.actions - 1,
                attacks: actor.attack.loading
                  ? 0
                  : (actor.attacksPerAction ?? 1) - 1,
              }),
          // Holding two light weapons, every attack is with a light one.
          lightAttack:
            actor.lightAttack !== undefined &&
            state.economy.lightAttack === "unready"
              ? "ready"
              : state.economy.lightAttack,
        },
      };
      break;
    }
    case "light-attack": {
      const target = targetOf(action.targetId);
      if ("code" in target) {
        return { state, rejection: target };
      }
      const refusal =
        lightAttackRefusal(state, actor) ??
        (action.cunningStrike === undefined
          ? undefined
          : cunningStrikeRefusal(
              state,
              actor,
              target,
              { kind: "light" },
              action.cunningStrike,
            ));
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const stirred = stirTurned(state, [target.id], events);
      const resolved = resolveAttack(
        stirred,
        actor,
        combatant(stirred, target.id),
        random,
        { kind: "light" },
        action.cunningStrike,
      );
      events.push(...resolved.events);
      next = {
        ...resolved.state,
        economy: {
          ...resolved.state.economy,
          lightAttack: "used",
          // Nick makes it part of the Attack action, sparing the bonus action.
          bonusAction:
            actor.lightAttack!.mastery === "Nick" && state.economy.bonusAction,
        },
      };
      break;
    }
    case "second-wind": {
      const refusal = secondWindRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const wind = actor.secondWind!;
      const { uses, healing } = wind;
      const rolls = Array.from({ length: healing.dice }, () =>
        random.roll(healing.sides),
      );
      const roll = rolls.reduce((sum, value) => sum + value, 0);
      const hpAfter = Math.min(actor.maxHp, actor.hp + roll + healing.modifier);
      events.push({
        type: "second-wind",
        combatantId: actor.id,
        roll,
        modifier: healing.modifier,
        healing: hpAfter - actor.hp,
        hpAfter,
        usesLeft: uses - 1,
      });
      next = {
        ...state,
        combatants: state.combatants.map((candidate) =>
          candidate.id === actor.id
            ? {
                ...candidate,
                hp: hpAfter,
                secondWind: { ...wind, uses: uses - 1 },
              }
            : candidate,
        ),
        economy: { ...state.economy, bonusAction: false },
      };
      break;
    }
    case "action-surge": {
      const refusal = actionSurgeRefusal(actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const surge = actor.actionSurge!;
      const uses = surge.uses - 1;
      events.push({
        type: "action-surge",
        combatantId: actor.id,
        usesLeft: uses,
      });
      next = {
        ...state,
        combatants: state.combatants.map((candidate) =>
          candidate.id === actor.id
            ? { ...candidate, actionSurge: { ...surge, uses } }
            : candidate,
        ),
        economy: {
          ...state.economy,
          actions: state.economy.actions + 1,
          maxActions: state.economy.maxActions + 1,
        },
      };
      break;
    }
    case "hide": {
      const refusal = hideRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      // The best passive Perception among the foes still in the fight; the
      // first of them in initiative order on a tie.
      // An ongoing fight always has a foe still in it.
      const [first, ...rest] = legalTargets(state, actor.id);
      const watcher = rest.reduce(
        (best, foe) =>
          (foe.passivePerception ?? 10) > (best.passivePerception ?? 10)
            ? foe
            : best,
        first!,
      );
      const dc = watcher.passivePerception ?? 10;
      // Hide is a Dexterity (Stealth) check: untrained armour and poison
      // give it disadvantage.
      const { d20, mode } = rollD20(
        random,
        [],
        [
          ...(actor.abilityDisadvantages?.dexterity ?? []),
          ...conditionSources(state, actor.id, "checks"),
        ],
      );
      const { modifier, proficiency, expertise } = actor.hide!;
      const total = d20 + modifier + proficiency;
      const success = total >= dc;
      events.push({
        type: "hide",
        combatantId: actor.id,
        d20,
        ...(mode === undefined ? {} : { mode }),
        modifier,
        proficiency,
        ...(expertise === true ? { expertise } : {}),
        total,
        dc,
        watcherId: watcher.id,
        success,
      });
      next = {
        ...state,
        hidden: success ? [...state.hidden, actor.id] : state.hidden,
        economy: { ...state.economy, bonusAction: false },
      };
      break;
    }
    case "steady-aim": {
      const refusal = steadyAimRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      events.push({ type: "steady-aim", combatantId: actor.id });
      next = {
        ...state,
        economy: { ...state.economy, bonusAction: false, steadyAim: true },
      };
      break;
    }
    case "drink-potion": {
      const refusal = potionRefusal(state, actor, action.itemId);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const potion = actor.potions!.find(({ id }) => id === action.itemId)!;
      const drunk = drinkPotion(
        actor.id,
        potion,
        actor.hp,
        actor.maxHp,
        random,
      );
      events.push(drunk);
      next = {
        ...state,
        combatants: state.combatants.map((candidate) =>
          candidate.id === actor.id
            ? {
                ...candidate,
                hp: drunk.hpAfter,
                potions: actor.potions!.filter(({ id }) => id !== potion.id),
              }
            : candidate,
        ),
        economy: { ...state.economy, bonusAction: false },
      };
      break;
    }
    case "cast": {
      const refusal = castRefusal(state, actor, action);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      next = concludeIfOver(
        castSpell(state, actor, action, random, events),
        events,
      );
      break;
    }
    case "divine-spark": {
      const refusal = divineSparkRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      if (!(DIVINE_SPARK_MODES as readonly unknown[]).includes(action.mode)) {
        return reject(
          "damage-type",
          "Divine Spark heals, or deals radiant or necrotic damage.",
        );
      }
      let target: Combatant | EncounterRejection;
      if (action.mode === "heal") {
        const ally = state.combatants.find(({ id }) => id === action.targetId);
        target =
          ally === undefined
            ? refused("no-target", "There is no one here by that name.")
            : ally.id === actor.id
              ? refused(
                  "not-self",
                  "Divine Spark points at another creature, never at you.",
                )
              : ally.side !== actor.side
                ? refused(
                    "healing-target",
                    `Divine Spark heals an ally, not ${ally.name}.`,
                  )
                : isOut(state, ally)
                  ? refused(
                      "already-defeated",
                      `${ally.name} is already defeated.`,
                    )
                  : ally.hp >= ally.maxHp
                    ? refused(
                        "full-hp",
                        `${ally.name} is unhurt, so Divine Spark would heal nothing.`,
                      )
                    : ally;
      } else {
        target = targetOf(action.targetId);
      }
      if ("code" in target) {
        return { state, rejection: target };
      }
      next = concludeIfOver(
        divineSpark(state, actor, target, action.mode, random, events),
        events,
      );
      break;
    }
    case "turn-undead": {
      const refusal = turnUndeadRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      next = turnUndead(state, actor, random, events);
      break;
    }
    case "preserve-life": {
      const refusal = preserveLifeRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const channel = actor.channelDivinity!;
      const healing = preserved(actor);
      const usesLeft = channel.uses - 1;
      events.push({
        type: "preserve-life",
        combatantId: actor.id,
        healing,
        hpAfter: actor.hp + healing,
        maxHp: actor.maxHp,
        usesLeft,
      });
      next = {
        ...state,
        combatants: state.combatants.map((candidate) =>
          candidate.id === actor.id
            ? {
                ...candidate,
                hp: actor.hp + healing,
                channelDivinity: { ...channel, uses: usesLeft },
              }
            : candidate,
        ),
        economy: { ...state.economy, actions: state.economy.actions - 1 },
      };
      break;
    }
    case "spectral-attack": {
      const target = targetOf(action.targetId);
      if ("code" in target) {
        return { state, rejection: target };
      }
      const refusal = spectralRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const stirred = stirTurned(state, [target.id], events);
      const resolved = resolveAttack(
        stirred,
        actor,
        combatant(stirred, target.id),
        random,
        {
          kind: "spell",
          weapon: spectralWeapon(actor, spectralWeaponOf(actor)!),
        },
      );
      events.push(...resolved.events);
      next = {
        ...resolved.state,
        economy: { ...resolved.state.economy, bonusAction: false },
      };
      break;
    }
    case "interact": {
      // Fast Hands (#307): a second interaction takes the bonus action.
      const fastHands =
        !state.economy.interaction &&
        actor.fastHands === true &&
        state.economy.bonusAction;
      if (!state.economy.interaction && !fastHands) {
        return reject(
          "interaction-used",
          actor.fastHands === true
            ? "You have already drawn or stowed a weapon this turn, and used your bonus action."
            : "You have already drawn or stowed a weapon this turn.",
        );
      }
      const { lightAttack: _old, ...rest } = actor;
      void _old;
      next = {
        ...state,
        combatants: state.combatants.map((candidate) =>
          candidate.id === actor.id
            ? {
                ...rest,
                attack: action.attack,
                ...(action.lightAttack === undefined
                  ? {}
                  : { lightAttack: action.lightAttack }),
              }
            : candidate,
        ),
        economy: {
          ...state.economy,
          interaction: false,
          bonusAction: !fastHands && state.economy.bonusAction,
        },
      };
      break;
    }
    case "end-turn":
      events.push({ type: "turn-ended", combatantId: actor.id });
      return { state: advance(state, random, events, false), events };
  }
  // With only "end-turn" left, the turn ends by itself.
  const left = availableActions(next, actor.id);
  return {
    state:
      next.outcome === "ongoing" && left.length === 1
        ? advance(next, random, events, false)
        : next,
    events,
  };
}
