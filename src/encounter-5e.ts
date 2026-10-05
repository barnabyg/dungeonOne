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
 *   Nothing uses a reaction yet.
 * - A hit with a Sap weapon gives the target disadvantage on its next attack
 *   roll before the start of the attacker's next turn. Advantage and
 *   disadvantage come only from such engine rules, never from an action.
 *
 * The state allows any number of combatants per side.
 */
import type { RandomSource } from "./random.js";

export type Side = "party" | "opponents";

export type Damage = Readonly<{
  dice: number;
  sides: number;
  modifier: number;
  type: string;
}>;

export type Weapon = Readonly<{
  name: string;
  bonus: number;
  damage: Damage;
  criticalRange: 19 | 20;
  /** The weapon mastery its wielder uses; only Sap so far. */
  mastery?: "Sap";
}>;

export type Combatant = Readonly<{
  id: string;
  name: string;
  side: Side;
  armorClass: number;
  hp: number;
  maxHp: number;
  /** The Dexterity score, which breaks initiative ties. */
  dexterity: number;
  initiativeBonus: number;
  attack: Weapon;
  /** Fighter features, with the uses left of their maximum. */
  secondWind?: FeatureUses & Readonly<{ healing: Healing }>;
  actionSurge?: FeatureUses;
  /** Healing potions the combatant carries, which it can drink. */
  potions?: readonly Potion[];
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
}>;

export type TurnEconomy = Readonly<{
  /** Actions left this turn. */
  actions: number;
  /** Actions this turn in all: 1, and 1 more for each Action Surge. */
  maxActions: number;
  bonusAction: boolean;
  /** Reset each turn; nothing uses a reaction yet. */
  reaction: boolean;
}>;

const FRESH_TURN: TurnEconomy = {
  actions: 1,
  maxActions: 1,
  bonusAction: true,
  reaction: true,
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
  "attack" | "second-wind" | "action-surge" | "drink-potion" | "end-turn";

export type EncounterAction =
  | Readonly<{ type: "attack"; actorId: string; targetId: string }>
  | Readonly<{
      type: "second-wind" | "action-surge" | "end-turn";
      actorId: string;
    }>
  | Readonly<{ type: "drink-potion"; actorId: string; itemId: string }>;

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
  damageRolls: readonly number[];
  damageModifier: number;
  damage: number;
  damageType: string;
  hpAfter: number;
}>;

export type EncounterEvent =
  | Readonly<{ type: "initiative"; order: readonly InitiativeRoll[] }>
  | Readonly<{ type: "turn"; combatantId: string; round: number }>
  | AttackEvent
  | Readonly<{ type: "sapped"; targetId: string; sourceId: string }>
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
  | "no-second-wind"
  | "no-action-surge"
  | "no-potion"
  | "no-uses-left"
  | "full-hp";

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

/** The combatant whose turn it is, or undefined once the encounter is over. */
export function currentCombatant(state: EncounterState): Combatant | undefined {
  return state.outcome === "ongoing"
    ? combatant(state, state.order[state.turn]!.combatantId)
    : undefined;
}

/** The living combatants on the other side from `actorId`. */
export function legalTargets(
  state: EncounterState,
  actorId: string,
): readonly Combatant[] {
  const actor = combatant(state, actorId);
  return state.order
    .map(({ combatantId }) => combatant(state, combatantId))
    .filter((target) => target.side !== actor.side && !isDefeated(target));
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

function actionSurgeRefusal(actor: Combatant): EncounterRejection | undefined {
  if (actor.actionSurge === undefined) {
    return refused("no-action-surge", "You don't have Action Surge.");
  }
  return actor.actionSurge.uses === 0
    ? refused("no-uses-left", "You have no uses of Action Surge left.")
    : undefined;
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
  return [
    ...(state.economy.actions > 0 ? (["attack"] as const) : []),
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

function sideDefeated(state: EncounterState, side: Side): boolean {
  return state.combatants
    .filter((candidate) => candidate.side === side)
    .every(isDefeated);
}

function resolveAttack(
  state: EncounterState,
  actor: Combatant,
  target: Combatant,
  random: Roller,
  targetRoll: number | undefined,
): { state: EncounterState; events: EncounterEvent[] } {
  const weapon = actor.attack;
  const sapped = state.sapped.some(({ targetId }) => targetId === actor.id);
  const { d20, mode } = rollD20(random, [], sapped ? ["Sap"] : []);
  const critical = d20 >= weapon.criticalRange;
  const total = d20 + weapon.bonus;
  const hit = d20 !== 1 && (critical || total >= target.armorClass);
  const damageRolls: number[] = [];
  if (hit) {
    const dice = weapon.damage.dice * (critical ? 2 : 1);
    for (let die = 0; die < dice; die++) {
      damageRolls.push(random.roll(weapon.damage.sides));
    }
  }
  const damage = hit
    ? Math.max(
        0,
        damageRolls.reduce((sum, value) => sum + value, 0) +
          weapon.damage.modifier,
      )
    : 0;
  const hpAfter = Math.max(0, target.hp - damage);
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
      ...(targetRoll === undefined ? {} : { targetRoll }),
      damageRolls,
      damageModifier: weapon.damage.modifier,
      damage,
      damageType: weapon.damage.type,
      hpAfter,
    },
  ];
  // The attack spends any disadvantage Sap gave the attacker.
  let next: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === target.id ? { ...candidate, hp: hpAfter } : candidate,
    ),
    sapped: state.sapped.filter(({ targetId }) => targetId !== actor.id),
  };
  if (hpAfter === 0 && target.hp > 0) {
    events.push({ type: "defeated", combatantId: target.id });
  } else if (hit && weapon.mastery === "Sap") {
    next = {
      ...next,
      sapped: [
        ...next.sapped.filter(({ targetId }) => targetId !== target.id),
        { targetId: target.id, sourceId: actor.id },
      ],
    };
    events.push({ type: "sapped", targetId: target.id, sourceId: actor.id });
  }
  const outcome = sideDefeated(next, "opponents")
    ? "victory"
    : sideDefeated(next, "party")
      ? "defeat"
      : "ongoing";
  if (outcome !== "ongoing") {
    next = { ...next, outcome };
    events.push({ type: "ended", outcome });
  }
  return { state: next, events };
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
      const turn = (next.turn + 1) % next.order.length;
      next = { ...next, turn, round: next.round + (turn === 0 ? 1 : 0) };
    }
    first = false;
    const actor = combatant(next, next.order[next.turn]!.combatantId);
    if (isDefeated(actor)) {
      continue;
    }
    // A turn starts afresh, and ends any Sap this combatant gave.
    next = {
      ...next,
      economy: FRESH_TURN,
      sapped: next.sapped.filter(({ sourceId }) => sourceId !== actor.id),
    };
    events.push({ type: "turn", combatantId: actor.id, round: next.round });
    if (actor.side === "party") {
      return next;
    }
    const targets = legalTargets(next, actor.id);
    const targetRoll =
      targets.length > 1 ? random.roll(targets.length) : undefined;
    const target = targets[(targetRoll ?? 1) - 1]!;
    const resolved = resolveAttack(next, actor, target, random, targetRoll);
    events.push(...resolved.events);
    next = resolved.state;
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
  const events: EncounterEvent[] = [];
  let next: EncounterState;
  switch (action.type) {
    case "attack": {
      const target = state.combatants.find(({ id }) => id === action.targetId);
      if (target === undefined) {
        return reject("no-target", "There is no such opponent here to attack.");
      }
      if (target.side === actor.side) {
        return reject("same-side", `${target.name} is on your side.`);
      }
      if (isDefeated(target)) {
        return reject(
          "already-defeated",
          `${target.name} is already defeated.`,
        );
      }
      if (state.economy.actions === 0) {
        return reject(
          "action-used",
          "You have already used your action this turn.",
        );
      }
      const resolved = resolveAttack(state, actor, target, random, undefined);
      events.push(...resolved.events);
      next = {
        ...resolved.state,
        economy: { ...state.economy, actions: state.economy.actions - 1 },
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
