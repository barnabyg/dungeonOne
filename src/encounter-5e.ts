/**
 * The 5e encounter engine (SRD 5.2): sides of combatants fighting until one
 * side is defeated.
 *
 * Pure rules over JSON state. Dice come only from the `RandomSource` passed
 * in, and every die rolled appears in an event. A rejected action draws no
 * dice and returns the state unchanged.
 *
 * - Each combatant rolls its own initiative: d20 + its initiative bonus.
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
 *   Nothing uses a reaction yet. Drawing, stowing or swapping a weapon uses
 *   the turn's one object interaction; it takes no action.
 * - Light property: after an attack with a light weapon, a combatant holding
 *   a second light weapon may make one extra attack with it that turn, as a
 *   bonus action, or as part of the Attack action with the Nick mastery.
 * - Weapon masteries: a hit with a Sap weapon gives the target disadvantage
 *   on its next attack roll before the start of the attacker's next turn; a
 *   hit that deals damage with a Vex weapon gives the attacker advantage on
 *   its next attack roll against that target before the end of its next
 *   turn; a miss with a Graze weapon still deals damage equal to the damage
 *   modifier, if above 0. A heavy weapon wielded below Strength 13 attacks
 *   with disadvantage. Advantage and disadvantage come only from such engine
 *   rules, never from an action.
 * - Great Weapon Fighting: a weapon marked with it counts each 1 or 2 on a
 *   damage die as 3. The event keeps the dice as rolled.
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
 *   fleeing, makes a Wisdom save against that DC, in initiative order. One
 *   that fails flees: on its next turn it leaves the fight instead of
 *   acting, unless it is incapacitated. Until then it can be attacked, and
 *   one cut down first is defeated. A side is beaten when each of its
 *   combatants is defeated or has fled. Undead and mindless monsters have no
 *   morale DC and never check.
 *
 * The state allows any number of combatants per side.
 */
import type { Ability } from "./fighter-5e.js";
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
  /** What a hit does besides its damage. */
  rider?: AttackRider;
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
    /** Its saving throw bonus for each ability. */
    saves: Readonly<Record<Ability, number>>;
    attack: Weapon;
    /** A second light weapon, for the Light property's extra attack. */
    lightAttack?: Weapon;
    /** Fighter features, with the uses left of their maximum. */
    secondWind?: FeatureUses & Readonly<{ healing: Healing }>;
    actionSurge?: FeatureUses;
    /** Healing potions the combatant carries, which it can drink. */
    potions?: readonly Potion[];
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
     * Its morale DC (#237): the Wisdom save it makes when its side checks
     * morale. Without one it never checks.
     */
    morale?: number;
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
  d20: number;
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
  /** Combatants that failed a morale save and leave on their next turn. */
  fleeing: readonly string[];
  /** Combatants that left the fight, in the order they left. */
  fled: readonly string[];
  /** The morale checks each side has made; each is made once. */
  moraleChecks: readonly Readonly<{ side: Side; trigger: MoraleTrigger }>[];
}>;

export type TurnEconomy = Readonly<{
  /** Actions left this turn. */
  actions: number;
  /** Actions this turn in all: 1, and 1 more for each Action Surge. */
  maxActions: number;
  bonusAction: boolean;
  /** Reset each turn; nothing uses a reaction yet. */
  reaction: boolean;
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
}>;

const FRESH_TURN: TurnEconomy = {
  actions: 1,
  maxActions: 1,
  bonusAction: true,
  reaction: true,
  interaction: true,
  lightAttack: "unready",
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
  | "drink-potion"
  | "end-turn";

export type EncounterAction =
  | Readonly<{
      type: "attack" | "light-attack";
      actorId: string;
      targetId: string;
    }>
  | Readonly<{
      type: "second-wind" | "action-surge" | "end-turn";
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
  /** A miss that still dealt `damage` through the Graze mastery. */
  graze?: true;
  /** Great Weapon Fighting counted each 1 or 2 in `damageRolls` as 3. */
  greatWeaponFighting?: true;
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
    | { d20: number; total: number; autoFail?: never }
    | { autoFail: ConditionKind; d20?: never; total?: never }
  )
>;

/** A combatant's Wisdom save against its morale DC (#237). */
export type MoraleEvent = Readonly<{
  type: "morale";
  combatantId: string;
  trigger: MoraleTrigger;
  d20: number;
  bonus: number;
  total: number;
  dc: number;
  /** A failure means it flees on its next turn. */
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
  | "no-potion"
  | "no-uses-left"
  | "full-hp"
  | "interaction-used"
  | "paralysed"
  | "fled";

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

/** Defeated or fled: out of the fight. */
function isOut(state: EncounterState, entrant: Combatant): boolean {
  return isDefeated(entrant) || hasFled(state, entrant.id);
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

function actionSurgeRefusal(actor: Combatant): EncounterRejection | undefined {
  if (actor.actionSurge === undefined) {
    return refused("no-action-surge", "You don't have Action Surge.");
  }
  return actor.actionSurge.uses === 0
    ? refused("no-uses-left", "You have no uses of Action Surge left.")
    : undefined;
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
  const actor = currentCombatant(state);
  if (actor?.id !== actorId) {
    return [];
  }
  if (incapacitatedBy(state, actorId) !== undefined) {
    return ["end-turn"];
  }
  return [
    ...(state.economy.actions > 0 ? (["attack"] as const) : []),
    ...(lightAttackRefusal(state, actor) === undefined
      ? (["light-attack"] as const)
      : []),
    ...(secondWindRefusal(state, actor) === undefined
      ? (["second-wind"] as const)
      : []),
    ...(actionSurgeRefusal(actor) === undefined
      ? (["action-surge"] as const)
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

function rollInitiative(
  combatants: readonly Combatant[],
  random: Roller,
): InitiativeRoll[] {
  const rolls = combatants.map((entrant) => {
    const d20 = random.roll(20);
    return {
      combatantId: entrant.id,
      d20,
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
 * fight, with a morale DC and not already fleeing, makes a Wisdom save in
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
 * A fleeing combatant leaves the fight on its turn. Its conditions end
 * silently, as a defeated one's do, and its going may bring its side to
 * half strength.
 */
function flee(
  state: EncounterState,
  entrant: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  events.push({ type: "fled", combatantId: entrant.id });
  const gone: EncounterState = {
    ...state,
    fleeing: state.fleeing.filter((id) => id !== entrant.id),
    fled: [...state.fled, entrant.id],
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
  effect: "attacks" | "attacked",
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
  const { d20 } = rollD20(random, [], []);
  const total = d20 + bonus;
  return { ...common, d20, total, success: total >= save.dc };
}

/**
 * A hit's rider condition: the target saves if the rider names a save, and
 * on a failure (or with no save) has the condition, replacing any of the
 * same kind.
 */
function applyRiderCondition(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  weapon: Weapon,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  const condition = weapon.rider?.condition;
  if (
    condition === undefined ||
    target.conditionImmunities?.includes(condition.kind) === true
  ) {
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
    source: weapon.name,
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
        source: weapon.name,
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
 * the weapon its dice chose and those dice.
 */
type AttackOrigin =
  | Readonly<{ kind: "attack" | "light" }>
  | Readonly<{
      kind: "opponent" | "rampage";
      weapon: Weapon;
      targetRoll: number | undefined;
      weaponRoll: number | undefined;
    }>;

function resolveAttack(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  random: Roller,
  origin: AttackOrigin = { kind: "attack" },
): { state: EncounterState; events: EncounterEvent[] } {
  const light = origin.kind === "light";
  const chosen = "weapon" in origin ? origin : undefined;
  const weapon = chosen?.weapon ?? (light ? actor.lightAttack! : actor.attack);
  const sapped = state.sapped.some(({ targetId }) => targetId === actor.id);
  const vexing = state.vexed.some(
    ({ sourceId, targetId }) => sourceId === actor.id && targetId === target.id,
  );
  const packTactics =
    actor.packTactics === true &&
    state.combatants.some(
      (ally) =>
        ally.side === actor.side &&
        ally.id !== actor.id &&
        ableToAct(state, ally),
    );
  const { d20, mode } = rollD20(
    random,
    [
      ...(vexing ? ["Vex"] : []),
      ...(packTactics ? ["Pack Tactics"] : []),
      ...conditionSources(state, target.id, "attacked").map(
        (name) => `target ${name.toLowerCase()}`,
      ),
    ],
    [
      ...(sapped ? ["Sap"] : []),
      ...(weapon.disadvantage ?? []),
      ...conditionSources(state, actor.id, "attacks"),
    ],
  );
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
  const critical = natural || paralysedCritical;
  const damageRolls: number[] = [];
  if (hit) {
    const dice = weapon.damage.dice * (critical ? 2 : 1);
    for (let die = 0; die < dice; die++) {
      damageRolls.push(random.roll(weapon.damage.sides));
    }
  }
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
      )
    : graze
      ? weapon.damage.modifier
      : 0;
  const { damage, damageAdjustment } = damageTaken(
    target,
    weapon.damage.type,
    rolled,
  );
  // A hit's rider deals its extra damage, its dice doubled by a critical.
  const extra = hit ? weapon.rider?.damage : undefined;
  const rider =
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
  const taken = damage + (rider?.damage ?? 0);
  const hpAfter = Math.max(0, target.hp - taken);
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
      ...(graze ? { graze: true as const } : {}),
      ...(hit && weapon.greatWeaponFighting === true
        ? { greatWeaponFighting: true as const }
        : {}),
      ...(paralysedCritical ? { paralysedCritical: true as const } : {}),
      ...(rider === undefined ? {} : { rider }),
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
  // The attack spends any disadvantage Sap gave the attacker, and any
  // advantage Vex gave it against this target.
  let next: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === target.id ? { ...candidate, hp: hpLeft } : candidate,
    ),
    sapped: state.sapped.filter(({ targetId }) => targetId !== actor.id),
    vexed: state.vexed.filter(
      ({ sourceId, targetId }) =>
        sourceId !== actor.id || targetId !== target.id,
    ),
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
  if (hit && !defeated) {
    next = applyRiderCondition(next, actor, target, weapon, random, events);
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
  while (next.outcome === "ongoing") {
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
    // A turn starts afresh, and ends any Sap this combatant gave and any
    // Vex it gave before its last turn.
    const round = next.round;
    next = {
      ...next,
      economy: FRESH_TURN,
      sapped: next.sapped.filter(({ sourceId }) => sourceId !== actor.id),
      vexed: next.vexed.filter(
        (vex) => vex.sourceId !== actor.id || round < vex.round + 2,
      ),
    };
    events.push({ type: "turn", combatantId: actor.id, round: next.round });
    // A fleeing combatant leaves on its turn, unless it can't act.
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
  rampage: boolean,
): { state: EncounterState; events: EncounterEvent[] } {
  const targets = legalTargets(state, actor.id);
  const targetRoll =
    targets.length > 1 ? random.roll(targets.length) : undefined;
  const weapons = actor.multiattack?.weapons ?? [actor.attack];
  const weaponRoll =
    weapons.length > 1 ? random.roll(weapons.length) : undefined;
  return resolveAttack(state, actor, targets[(targetRoll ?? 1) - 1]!, random, {
    kind: rampage ? "rampage" : "opponent",
    weapon: weapons[(weaponRoll ?? 1) - 1]!,
    targetRoll,
    weaponRoll,
  });
}

/**
 * An opponent's turn: its attacks (several with Multiattack), and Rampage's
 * bonus attack when one of them drops a combatant. It stops when the fight
 * ends.
 */
function opponentTurn(
  state: EncounterState,
  actor: Combatant,
  random: Roller,
  events: EncounterEvent[],
): EncounterState {
  let next = state;
  let bonusAction = true;
  const attack = (rampage: boolean) => {
    const resolved = opponentAttack(next, actor, random, rampage);
    events.push(...resolved.events);
    next = resolved.state;
    return resolved.events.some(({ type }) => type === "defeated");
  };
  for (
    let made = 0;
    made < (actor.multiattack?.attacks ?? 1) && next.outcome === "ongoing";
    made++
  ) {
    if (
      attack(false) &&
      actor.rampage === true &&
      bonusAction &&
      next.outcome === "ongoing"
    ) {
      bonusAction = false;
      attack(true);
    }
  }
  return next;
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
      fleeing: [],
      fled: [],
      moraleChecks: [],
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
      if (state.economy.actions === 0) {
        return reject(
          "action-used",
          "You have already used your action this turn.",
        );
      }
      const resolved = resolveAttack(state, actor, target, random);
      events.push(...resolved.events);
      next = {
        ...resolved.state,
        economy: {
          ...state.economy,
          actions: state.economy.actions - 1,
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
      const refusal = lightAttackRefusal(state, actor);
      if (refusal !== undefined) {
        return { state, rejection: refusal };
      }
      const resolved = resolveAttack(state, actor, target, random, {
        kind: "light",
      });
      events.push(...resolved.events);
      next = {
        ...resolved.state,
        economy: {
          ...state.economy,
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
      if (!state.economy.interaction) {
        return reject(
          "interaction-used",
          "You have already drawn or stowed a weapon this turn.",
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
        economy: { ...state.economy, interaction: false },
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
