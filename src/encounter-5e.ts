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
}>;

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
  | Readonly<{ type: "defeated"; combatantId: string }>
  | Readonly<{ type: "ended"; outcome: "victory" | "defeat" }>;

export type EncounterRejection = Readonly<{ reason: string }>;

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
  const d20 = random.roll(20);
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
      ...(targetRoll === undefined ? {} : { targetRoll }),
      damageRolls,
      damageModifier: weapon.damage.modifier,
      damage,
      damageType: weapon.damage.type,
      hpAfter,
    },
  ];
  let next: EncounterState = {
    ...state,
    combatants: state.combatants.map((candidate) =>
      candidate.id === target.id ? { ...candidate, hp: hpAfter } : candidate,
    ),
  };
  if (hpAfter === 0 && target.hp > 0) {
    events.push({ type: "defeated", combatantId: target.id });
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
    { combatants, order, round: 1, turn: 0, outcome: "ongoing" },
    random,
    events,
    true,
  );
  return { state, events };
}

/**
 * The combatant `actorId` attacks `targetId` on its own turn. Opponents then
 * act until a party combatant's turn comes round again or the encounter ends.
 */
export function attack(
  state: EncounterState,
  action: Readonly<{ actorId: string; targetId: string }>,
  random: Roller,
): EncounterResult {
  const reject = (reason: string): EncounterResult => ({
    state,
    rejection: { reason },
  });
  if (state.outcome !== "ongoing") {
    return reject("The fight is over.");
  }
  const actor = state.combatants.find(({ id }) => id === action.actorId);
  const current = currentCombatant(state)!;
  if (actor === undefined) {
    return reject("There is no such combatant in this fight.");
  }
  if (actor.id !== current.id) {
    return reject(`It is ${current.name}'s turn, not ${actor.name}'s.`);
  }
  const target = state.combatants.find(({ id }) => id === action.targetId);
  if (target === undefined) {
    return reject("There is no such opponent here to attack.");
  }
  if (target.side === actor.side) {
    return reject(`${target.name} is on your side.`);
  }
  if (isDefeated(target)) {
    return reject(`${target.name} is already defeated.`);
  }
  const resolved = resolveAttack(state, actor, target, random, undefined);
  const events = resolved.events;
  return { state: advance(resolved.state, random, events, false), events };
}
