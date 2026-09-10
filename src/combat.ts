import type { DamageDefinition, OpponentId } from "./adventure.js";
import type { RandomSource } from "./random.js";

export type CombatantId = "fighter" | OpponentId;

export type InitiativeDefinition = Readonly<{
  combatantId: CombatantId;
  bonus: number;
}>;

export type InitiativeRoll = InitiativeDefinition &
  Readonly<{
    roll: number;
    total: number;
  }>;

export type InitiativeResolution = Readonly<{
  rolls: readonly [InitiativeRoll, InitiativeRoll];
  turnOrder: readonly [CombatantId, CombatantId];
}>;

export type AttackDefinition = Readonly<{
  attackerId: CombatantId;
  targetId: CombatantId;
  attackBonus: number;
  targetArmorClass: number;
  targetMaxHp: number;
  damage: DamageDefinition;
}>;

export type AttackResolvedEvent = Readonly<{
  type: "attack-resolved";
  attackerId: CombatantId;
  targetId: CombatantId;
  attackRoll: number;
  attackBonus: number;
  attackTotal: number;
  targetArmorClass: number;
  outcome: "miss" | "hit" | "critical-hit";
  damage?: number;
  targetHp: number;
  targetMaxHp: number;
}>;

export type AttackResolution = Readonly<{
  targetHp: number;
  event: AttackResolvedEvent;
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

export function resolveInitiative(
  first: InitiativeDefinition,
  second: InitiativeDefinition,
  random: Pick<RandomSource, "roll">,
): InitiativeResolution {
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

export function resolveAttack(
  definition: AttackDefinition,
  targetHp: number,
  random: Pick<RandomSource, "roll">,
): AttackResolution {
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
