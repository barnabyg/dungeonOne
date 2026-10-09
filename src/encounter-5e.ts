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
 *   Only Uncanny Dodge uses a reaction (below). Drawing, stowing or swapping
 *   a weapon uses the turn's one object interaction; it takes no action.
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

/** The conditions the engine applies. */
export type ConditionKind = "poisoned" | "prone" | "paralysed";

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
  /** Ends of the target's turns left before it ends by itself. */
  turnsLeft: number;
  /** The save the target repeats at the end of each of its turns. */
  save?: SaveSpec;
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
     * Its passive Perception, which a hiding foe's Stealth must meet (#307);
     * 10 when not given.
     */
    passivePerception?: number;
    /** Class features with limited uses, with the uses left of their maximum. */
    secondWind?: FeatureUses & Readonly<{ healing: Healing }>;
    actionSurge?: FeatureUses;
    /** Healing potions the combatant carries, which it can drink. */
    potions?: readonly Potion[];
    /** The arrows and bolts it carries, for a ranged weapon (#230). */
    ammunition?: Ammunition;
    /** Advantage on its attacks while an ally is alive and able to act. */
    packTactics?: true;
    /** Conditions it cannot be given. */
    conditionImmunities?: readonly ConditionKind[];
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
  /** A hit that is critical only because the target is paralysed. */
  paralysedCritical: boolean;
}>;

/**
 * An opponent's hit on a combatant that may answer it with Uncanny Dodge
 * (#308): the attack as rolled and chosen, and how far the opponent's turn
 * had got.
 */
export type PendingReaction = Readonly<{
  reaction: "uncanny-dodge";
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
  | "end-turn"
  | ReactionAnswer;

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
        | "end-turn"
        | ReactionAnswer;
      actorId: string;
    }>
  | Readonly<{ type: "drink-potion"; actorId: string; itemId: string }>
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
  /** Great Weapon Fighting counted each 1 or 2 in `damageRolls` as 3. */
  greatWeaponFighting?: true;
  /**
   * Sneak Attack's dice (#306), rolled after `damageRolls`; `damage` counts
   * them.
   */
  sneakAttack?: Readonly<{ damageRolls: readonly number[] }>;
  /** A hit that is critical only because the target is paralysed. */
  paralysedCritical?: true;
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
}>;

/**
 * An opponent's hit that its target may halve with Uncanny Dodge (#308):
 * the attack roll, rolled before the damage, which waits for the answer.
 */
export type ReactionOfferedEvent = Readonly<{
  type: "reaction-offered";
  reaction: "uncanny-dodge";
  combatantId: string;
  attackerId: string;
  weapon: string;
  d20: number;
  mode?: RollMode;
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
    }>
  | Readonly<{
      type: "condition-ended";
      combatantId: string;
      kind: ConditionKind;
      /** A repeat save, its turns running out, standing up, or the fight ending. */
      reason: "saved" | "expired" | "stood" | "fight-over";
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
  // Hiding and Steady Aim (#307) give the combatant's own next attack
  // advantage, never a Rampage or opponent attack.
  const own = origin.kind === "attack" || origin.kind === "light";
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
      // Round 1 is the opening volley; then every foe is close (#230).
      ...(weapon.ammunition !== undefined && state.round >= 2
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

/** What `actorId` may do now; empty unless it is its turn. */
export function availableActions(
  state: EncounterState,
  actorId: string,
): readonly EncounterActionType[] {
  // A hit waiting for Uncanny Dodge (#308): its target answers it, and no
  // one does anything else.
  if (state.pendingReaction !== undefined) {
    return state.outcome === "ongoing" &&
      state.pendingReaction.reactorId === actorId
      ? ["uncanny-dodge", "take-hit"]
      : [];
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

/** Ends the fight once a side is beaten; every condition ends with it. */
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
  events.push({ type: "ended", outcome });
  return { ...state, outcome, conditions: [], fleeing: [] };
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
 * Rolls `entrant`'s saving throw against a condition, or fails it without a
 * roll when one of its conditions (paralysed) fails saves of that ability.
 */
function rollSave(
  state: EncounterState,
  entrant: Combatant,
  save: SaveSpec,
  condition: ConditionKind,
  repeat: boolean,
  random: Roller,
): SaveEvent {
  const bonus = entrant.saves[save.ability];
  const fails = conditionWhere(
    state,
    entrant.id,
    ({ failsSaves }) => failsSaves?.includes(save.ability) === true,
  );
  const common = {
    type: "save",
    combatantId: entrant.id,
    ability: save.ability,
    bonus,
    dc: save.dc,
    condition,
    repeat,
  } as const;
  if (fails !== undefined) {
    return { ...common, success: false, autoFail: fails };
  }
  const { d20, mode } = rollD20(
    random,
    [],
    entrant.abilityDisadvantages?.[save.ability] ?? [],
  );
  const total = d20 + bonus;
  return {
    ...common,
    d20,
    ...(mode === undefined ? {} : { mode }),
    total,
    success: total >= save.dc,
  };
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
  return {
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
}

/**
 * The end of `entrant`'s turn: it repeats the save against each condition
 * that allows one, and a condition whose turns have run out ends (a prone
 * combatant stands up).
 */
function endTurn(
  state: EncounterState,
  entrant: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const conditions: Condition[] = [];
  for (const condition of state.conditions) {
    if (condition.targetId !== entrant.id) {
      conditions.push(condition);
      continue;
    }
    const ended = (reason: "saved" | "expired" | "stood") =>
      events.push({
        type: "condition-ended",
        combatantId: entrant.id,
        kind: condition.kind,
        reason,
      });
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
    }
    if (condition.turnsLeft <= 1) {
      ended(condition.kind === "prone" ? "stood" : "expired");
      continue;
    }
    conditions.push({ ...condition, turnsLeft: condition.turnsLeft - 1 });
  }
  return { ...state, conditions };
}

/**
 * What kind of attack it is: a combatant's own attack, the Light property's
 * extra attack, or an opponent's (Rampage's bonus attack among them), with
 * the weapon its dice chose, those dice and how far its turn had got.
 */
type AttackOrigin =
  | Readonly<{ kind: "attack" | "light" }>
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
  const natural = d20 >= weapon.criticalRange;
  const total = d20 + weapon.bonus;
  const hit = d20 !== 1 && (natural || total >= target.armorClass);
  // Paralysed: every hit on it is a critical hit.
  const paralysedCritical =
    hit &&
    !natural &&
    conditionWhere(
      state,
      target.id,
      ({ criticalHits }) => criticalHits === true,
    ) !== undefined;
  return {
    d20,
    ...(mode === undefined ? {} : { mode }),
    total,
    hit,
    critical: natural || paralysedCritical,
    paralysedCritical,
  };
}

/**
 * Rolls an attack. An opponent's hit on a combatant that can answer it with
 * Uncanny Dodge (#308) stops before its damage: the fight waits on the
 * answer (`pendingReaction`), and `landAttack` finishes it.
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
  if (roll.hit && "progress" in origin && canDodge(state, target)) {
    const { weapon, targetRoll, weaponRoll, progress } = origin;
    return {
      state: {
        ...state,
        pendingReaction: {
          reaction: "uncanny-dodge",
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
          reaction: "uncanny-dodge",
          combatantId: target.id,
          attackerId: actor.id,
          weapon: weapon.name,
          d20: roll.d20,
          ...(roll.mode === undefined ? {} : { mode: roll.mode }),
          bonus: weapon.bonus,
          total: roll.total,
          armorClass: target.armorClass,
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
  { d20, mode, total, hit, critical, paralysedCritical }: AttackRoll,
  landing: Landing,
): { state: EncounterState; events: EncounterEvent[] } {
  const light = origin.kind === "light";
  const chosen = "weapon" in origin ? origin : undefined;
  const weapon = originWeapon(actor, origin);
  const own = origin.kind === "attack" || origin.kind === "light";
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
  const defended = damageTaken(target, weapon.damage.type, rolled);
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
            target,
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
  // Uncanny Dodge (#308) halves the attack's damage once, rounding down.
  const [damage, riderDamage] = dodged
    ? halvedOnce(defended.damage, riderRolled?.damage ?? 0)
    : [defended.damage, riderRolled?.damage ?? 0];
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
      armorClass: target.armorClass,
      hit,
      critical: hit && critical,
      ...(mode === undefined ? {} : { mode }),
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
      ...(hit && weapon.greatWeaponFighting === true
        ? { greatWeaponFighting: true as const }
        : {}),
      ...(sneak === undefined ? {} : { sneakAttack: sneak }),
      ...(paralysedCritical ? { paralysedCritical: true as const } : {}),
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
              damage: defended.damage,
              ...(riderRolled === undefined
                ? {}
                : { riderDamage: riderRolled.damage }),
            },
          }
        : {}),
    },
  ];
  // Undead Fortitude: reduced to 0 HP by damage that isn't radiant or from
  // a critical hit, a Constitution save against DC 5 + the damage taken
  // leaves it at 1 HP.
  const radiant =
    (weapon.damage.type === "radiant" && damage > 0) ||
    (rider?.damageType === "radiant" && rider.damage > 0);
  let hpLeft = hpAfter;
  if (
    hpAfter === 0 &&
    target.hp > 0 &&
    target.undeadFortitude === true &&
    !(hit && critical) &&
    !radiant
  ) {
    const d20 = random.roll(20);
    const bonus = target.saves.constitution;
    const dc = 5 + taken;
    const success = d20 + bonus >= dc;
    hpLeft = success ? 1 : 0;
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
  }
  // The attack spends any disadvantage Sap gave the attacker, any
  // advantage Vex gave it against this target, and its hiding and Steady
  // Aim (#307).
  let next: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === target.id
        ? { ...candidate, hp: hpLeft }
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
    hidden: state.hidden.filter((id) => !hidden || id !== actor.id),
    engaged: [
      ...state.engaged,
      ...[actor.id, target.id].filter((id) => !state.engaged.includes(id)),
    ],
    economy: {
      ...state.economy,
      // Sneak Attack is dealt once a turn.
      sneakAttack: sneak === undefined && state.economy.sneakAttack,
      steadyAim: !aimed && state.economy.steadyAim,
    },
  };
  const defeated = hpLeft === 0 && target.hp > 0;
  if (defeated) {
    events.push({ type: "defeated", combatantId: target.id });
    next = checkMorale(
      {
        ...next,
        conditions: next.conditions.filter(
          ({ targetId }) => targetId !== target.id,
        ),
        fleeing: next.fleeing.filter((id) => id !== target.id),
      },
      target.side,
      random,
      events,
    );
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
  // A hit waiting for Uncanny Dodge (#308) stops the fight until answered.
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
    };
    events.push({ type: "turn", combatantId: actor.id, round: next.round });
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
 * Answers the hit waiting for Uncanny Dodge (#308): halved with the
 * reactor's reaction, or taken in full. The hit lands, then the opponent's
 * turn and the fight go on until a party combatant is to act, another hit
 * waits, or the fight ends.
 */
function answerReaction(
  state: EncounterState,
  pending: PendingReaction,
  dodged: boolean,
  random: Roller,
): EncounterResult {
  const { pendingReaction: _answered, ...rest } = state;
  void _answered;
  const attacker = combatant(state, pending.attackerId);
  const target = combatant(state, pending.reactorId);
  const events: EncounterEvent[] = [];
  const landed = landAttack(
    dodged ? { ...rest, reacted: [...rest.reacted, target.id] } : rest,
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
    pending.roll,
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
  // Uncanny Dodge (#308): a hit waiting for its target's answer takes only
  // that answer; outside its trigger, there is nothing to answer.
  const pending = state.pendingReaction;
  const answer = action.type === "uncanny-dodge" || action.type === "take-hit";
  if (pending !== undefined) {
    const attacker = combatant(state, pending.attackerId);
    if (!answer || actor.id !== pending.reactorId) {
      return reject(
        "reaction-pending",
        `${attacker.name}'s ${pending.weapon.name.toLowerCase()} has hit ${combatant(state, pending.reactorId).name}: first use Uncanny Dodge to halve its damage, or take the hit.`,
      );
    }
    return answerReaction(
      state,
      pending,
      action.type === "uncanny-dodge",
      random,
    );
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
  /** The opponent an attack is aimed at, or why it can't be. */
  const targetOf = (targetId: string): Combatant | EncounterRejection => {
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
  };
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
      const resolved = resolveAttack(
        state,
        actor,
        target,
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
      const resolved = resolveAttack(
        state,
        actor,
        target,
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
