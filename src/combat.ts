import type { DamageDefinition, OpponentId } from "./adventure.js";
import type { RandomSource } from "./random.js";

export type CombatantId = "fighter" | OpponentId;

export type InitiativeDefinition<Id extends string = CombatantId> = Readonly<{
  combatantId: Id;
  bonus: number;
}>;

export type InitiativeRoll<Id extends string = CombatantId> =
  InitiativeDefinition<Id> &
    Readonly<{
      roll: number;
      total: number;
    }>;

export type InitiativeResolution<Id extends string = CombatantId> = Readonly<{
  rolls: readonly [InitiativeRoll<Id>, InitiativeRoll<Id>];
  turnOrder: readonly [Id, Id];
}>;

export type AttackDefinition<Id extends string = CombatantId> = Readonly<{
  attackerId: Id;
  targetId: Id;
  attackBonus: number;
  targetArmorClass: number;
  targetMaxHp: number;
  damage: DamageDefinition;
}>;

export type AttackResolvedEvent<Id extends string = CombatantId> = Readonly<{
  type: "attack-resolved";
  attackerId: Id;
  targetId: Id;
  attackRoll: number;
  attackBonus: number;
  attackTotal: number;
  targetArmorClass: number;
  outcome: "miss" | "hit" | "critical-hit";
  damage?: number;
  targetHp: number;
  targetMaxHp: number;
}>;

export type AttackResolution<Id extends string = CombatantId> = Readonly<{
  targetHp: number;
  event: AttackResolvedEvent<Id>;
}>;

function rollChecked(
  random: Pick<RandomSource, "roll">,
  sides: number,
): number {
  const value = random.roll(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    throw new Error(`Random source returned ${value} for d${sides}.`);
  }
  return value;
}

function rollDamage(
  definition: DamageDefinition,
  diceMultiplier: number,
  random: Pick<RandomSource, "roll">,
): number {
  let total = definition.modifier;
  for (let index = 0; index < definition.dice * diceMultiplier; index += 1) {
    total += rollChecked(random, definition.sides);
  }
  return total;
}

export function resolveInitiative<Id extends string>(
  first: InitiativeDefinition<Id>,
  second: InitiativeDefinition<Id>,
  random: Pick<RandomSource, "roll">,
): InitiativeResolution<Id> {
  const firstRoll = rollChecked(random, 20);
  const secondRoll = rollChecked(random, 20);
  const rolls = [
    { ...first, roll: firstRoll, total: firstRoll + first.bonus },
    { ...second, roll: secondRoll, total: secondRoll + second.bonus },
  ] as const;
  const firstActsFirst = rolls[0].total >= rolls[1].total;

  return {
    rolls,
    turnOrder: firstActsFirst
      ? [first.combatantId, second.combatantId]
      : [second.combatantId, first.combatantId],
  };
}

export function resolveAttack<Id extends string>(
  definition: AttackDefinition<Id>,
  targetHp: number,
  random: Pick<RandomSource, "roll">,
): AttackResolution<Id> {
  const attackRoll = rollChecked(random, 20);
  const attackTotal = attackRoll + definition.attackBonus;
  const critical = attackRoll === 20;
  const hit =
    critical ||
    (attackRoll !== 1 && attackTotal >= definition.targetArmorClass);

  if (!hit) {
    return {
      targetHp,
      event: {
        type: "attack-resolved",
        attackerId: definition.attackerId,
        targetId: definition.targetId,
        attackRoll,
        attackBonus: definition.attackBonus,
        attackTotal,
        targetArmorClass: definition.targetArmorClass,
        outcome: "miss",
        targetHp,
        targetMaxHp: definition.targetMaxHp,
      },
    };
  }

  const damage = rollDamage(definition.damage, critical ? 2 : 1, random);
  const remainingHp = Math.max(0, targetHp - damage);
  return {
    targetHp: remainingHp,
    event: {
      type: "attack-resolved",
      attackerId: definition.attackerId,
      targetId: definition.targetId,
      attackRoll,
      attackBonus: definition.attackBonus,
      attackTotal,
      targetArmorClass: definition.targetArmorClass,
      outcome: critical ? "critical-hit" : "hit",
      damage,
      targetHp: remainingHp,
      targetMaxHp: definition.targetMaxHp,
    },
  };
}
