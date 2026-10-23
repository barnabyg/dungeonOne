/**
 * The 5e balance harness: plays an adventure module through the real runtime
 * and reports how dangerous it is, and gates a module on its declared
 * difficulty (`gateAdventure`).
 *
 * Characters are sampled from the 4d6-drop-lowest distribution and placed
 * with the creation defaults of the default class (`defaultPlacement` and
 * its definition's `defaults`, #300), so the harness plays the characters a
 * player gets by default, with each of its starting kits. "Weak" and "strong" are percentiles of that sample by total
 * ability modifier.
 */
import {
  authoredChecks,
  effectsOf,
  sureFlagSetters,
  encounterInRoom,
  encounterPlacements,
  encounterSureFlags,
  isConditional,
  placementsByRoom,
  LOOT_KINDS,
  orderFifthAdventures,
  statBlockDefenses,
  statBlockSaves,
  unsimulatedTraits,
  type AuthoredCheck,
  DIFFICULTIES,
  type Difficulty,
  type EndingKind,
  type FifthAdventure,
  type FifthRoute,
  type FifthPassage,
  type MetEncounter,
  type StatBlock,
  type SureFlagSetter,
} from "./adventure-5e.js";
import {
  abilityModifier,
  applyLevelChoice,
  CLASSES,
  classMaxLevel,
  classOf,
  DEFAULT_CLASS,
  OFFERED_CLASS_IDS,
  buildCharacter,
  creationAbilities,
  defaultPlacement,
  characterProfile,
  LEVEL_XP,
  levelChoicesOwed,
  masteryOptions,
  pendingLevelChoice,
  withOwedChoices,
  alwaysPrepared,
  rollAbilitySet,
  mayAttune,
  validateCharacter,
  type CharacterSheet,
  type LevelChoice,
  type RolledDice,
  type Settlement,
} from "./character-5e.js";
import {
  ABILITY_SCORE_CAP,
  FIGHTING_STYLES,
  type Ability,
  type AbilityScoreImprovement,
  type ClassId,
  type FightingStyle,
  type Level,
} from "./class-5e.js";
import {
  ATTUNEMENT_LIMIT,
  CASTER_ITEMS,
  slotRegain,
  type HeldMagicItem,
} from "./magic-items-5e.js";
import { createSeededRandom } from "./random.js";
import { PEACEFUL_OPTIONS, type ReactionOption } from "./reaction-5e.js";
import {
  isShieldId,
  isWeaponId,
  STARTING_KITS,
  WEAPONS,
  weaponKind,
  type KitId,
  type WeaponData,
  type WeaponId,
} from "./equipment-5e.js";
import {
  effectAtSlot,
  isSpellId,
  maxTargets,
  ordinal,
  spellAtLevel,
  SPELLS,
  type SpellDefinition,
  type SpellId,
} from "./spells-5e.js";
import {
  armorClassOf,
  combatant,
  concentrationOf,
  countedDamageDie,
  grazeDamage,
  damageTaken,
  legalTargets,
  type ConditionKind,
  type EncounterState,
  type DamageType,
} from "./encounter-5e.js";
import {
  CHECK_POLICIES,
  createFifthRuntime,
  creatureTypeOf,
  PLAYER_ID,
  playerCombatant,
  scarceCandidateIds,
  type ActionKind,
  type ActionView,
  type CheckPolicy,
  type FifthAction,
  type FifthRuntime,
  type FifthState,
  type LeftFight,
} from "./runtime-5e.js";

export { CHECK_POLICIES, type CheckPolicy };

/** The class the harness, the gate and the career simulation play (#300). */
const HARNESS_CLASS = CLASSES[DEFAULT_CLASS];

/** Every starting kit of that class, as creation offers them. */
export const KITS = HARNESS_CLASS.kits;

/**
 * The gate's level-4 choice (#286). The Ability Score Improvement's two
 * points go one at a time to the first ability below 20 in the order: the
 * attack ability (the class's first primary ability, Strength for the
 * Fighter and Dexterity for the Rogue, or Dexterity for the Dexterity-first
 * build), then the class's ability priority; so +2 to the attack ability
 * unless that passes 20. For a level that brings a new mastery (the
 * Fighter's fourth; the Rogue's level 4 brings none, #308), it is
 * `preferred` (a placed weapon the gate tries) when it can be mastered, or
 * else the first of `MASTERY_WEAPONS` not mastered yet: the longsword, after
 * the default dagger, mace and shortsword.
 */
export function gateLevelChoice(
  sheet: CharacterSheet,
  archer = false,
  preferred?: WeaponId,
): LevelChoice {
  const definition = classOf(sheet);
  const order: readonly Ability[] = [
    archer ? "dexterity" : definition.primaryAbilities[0]!,
    ...definition.abilityPriority,
  ];
  const scores = { ...sheet.abilities };
  const increase: Partial<Record<Ability, 1 | 2>> = {};
  for (let point = 0; point < 2; point++) {
    const ability = order.find((entry) => scores[entry] < ABILITY_SCORE_CAP)!;
    scores[ability] += 1;
    increase[ability] = increase[ability] === undefined ? 1 : 2;
  }
  if (!levelChoicesOwed(sheet).includes("weapon-mastery")) {
    return { increase: increase as AbilityScoreImprovement };
  }
  const options = masteryOptions(sheet);
  // A placed +1 weapon is mastered as its kind (#345).
  const kind = preferred === undefined ? undefined : weaponKind(preferred);
  return {
    increase: increase as AbilityScoreImprovement,
    mastery: kind !== undefined && options.includes(kind) ? kind : options[0]!,
  };
}

/**
 * A level-`level` character of `classId` (the harness's class unless named)
 * from one creation's dice, placed and chosen as a fresh creation of that
 * class starts but with `kit` (its default kit unless named), at full
 * health: its skills, Expertise and masteries are its class's defaults, the
 * harness's policy for a Rogue's (#306). An `archer` is Dexterity-first
 * instead (#230): the rolls placed on Strength and Dexterity change places,
 * and the +2 goes on Dexterity; a class that places Dexterity first already
 * is (the Rogue), so its archer is its usual build. From level 4 it makes the gate's level
 * choice (`gateLevelChoice`), preferring to master `mastery`.
 */
export function characterAtLevel(
  dice: RolledDice,
  level: Level,
  kit?: KitId,
  archer = false,
  mastery?: WeaponId,
  classId: ClassId = DEFAULT_CLASS,
): CharacterSheet {
  const definition = CLASSES[classId];
  if (level > classMaxLevel(definition)) {
    throw new Error(
      `A ${definition.name} reaches only level ${classMaxLevel(definition)} yet.`,
    );
  }
  const placement = defaultPlacement(dice, definition);
  const created = buildCharacter(
    "0".repeat(32),
    "Balance",
    dice,
    {
      ...definition.defaults,
      ...(archer && definition.primaryAbilities[0] !== "dexterity"
        ? {
            placement: {
              ...placement,
              strength: placement.dexterity,
              dexterity: placement.strength,
            },
            increase: { dexterity: 2, constitution: 1 },
          }
        : { placement }),
      kit: kit ?? definition.defaults.kit,
    },
    classId,
  );
  // Spells its level always prepares (#341) leave its choices.
  const always = alwaysPrepared(definition, level);
  const raised = {
    ...created,
    level,
    xp: LEVEL_XP[level],
    ...(created.spells === undefined
      ? {}
      : {
          spells: {
            ...created.spells,
            prepared: created.spells.prepared.filter(
              (id) => !always.includes(id),
            ),
          },
        }),
  };
  // A caster prepares the spells its level adds (#341) in its list's order.
  const sheet = withOwedChoices(
    validateCharacter({
      ...raised,
      hp: characterProfile(raised).maxHp,
    }),
  );
  return pendingLevelChoice(sheet) === undefined
    ? sheet
    : applyLevelChoice(sheet, gateLevelChoice(sheet, archer, mastery));
}

/** The sum of a default creation's six ability modifiers, in `classId`. */
function totalModifier(dice: RolledDice, classId: ClassId): number {
  const definition = CLASSES[classId];
  return Object.values(
    creationAbilities(
      dice,
      defaultPlacement(dice, definition),
      definition.defaults.increase,
    ),
  ).reduce((sum, score) => sum + abilityModifier(score), 0);
}

export type CharacterSample = Readonly<{
  percentiles: readonly number[];
  /** How many creations to roll; 10,000 by default. */
  sampleSize?: number;
  /** The seed the creations are rolled from. */
  sampleSeed?: number;
  /**
   * The class whose default creation ranks them (#310), placing the rolls
   * by its own priority: the harness's class unless named.
   */
  classId?: ClassId;
}>;

export type PercentileCharacter = Readonly<{
  percentile: number;
  dice: RolledDice;
  totalModifier: number;
}>;

/**
 * Each sample rolled so far, ranked, by size, seed and class: the same every
 * time.
 */
const rankedSamples = new Map<
  string,
  readonly Omit<PercentileCharacter, "percentile">[]
>();

/**
 * Rolls `sampleSize` creations from `sampleSeed` and returns the creation at
 * each percentile, ranked by total ability modifier as `classId` creates
 * them (a class's background increase may land on an odd or an even score,
 * so the classes rank one sample differently). Creations with the same
 * total keep the order they were rolled in, so the result is deterministic.
 */
export function percentileCharacters({
  percentiles,
  sampleSize = 10_000,
  sampleSeed = 134,
  classId = DEFAULT_CLASS,
}: CharacterSample): readonly PercentileCharacter[] {
  const key = `${sampleSize}:${sampleSeed}:${classId}`;
  let ranked = rankedSamples.get(key);
  if (ranked === undefined) {
    const random = createSeededRandom(sampleSeed);
    ranked = Array.from({ length: sampleSize }, () => {
      const dice = rollAbilitySet(random);
      return { dice, totalModifier: totalModifier(dice, classId) };
    }).sort((a, b) => a.totalModifier - b.totalModifier);
    rankedSamples.set(key, ranked);
  }
  return percentiles.map((percentile) => {
    if (!(percentile >= 0 && percentile <= 100)) {
      throw new Error("A percentile must be from 0 to 100.");
    }
    const chosen =
      ranked[Math.round((percentile / 100) * (ranked.length - 1))]!;
    return { percentile, ...chosen };
  });
}

/**
 * P(Undead Fortitude fails) after `damage` takes the enemy to 0: its
 * Constitution save, at `bonus`, against DC 5 + the damage taken.
 */
function fortitudeFails(damage: number, bonus: number): number {
  return Math.min(20, Math.max(0, 5 + damage - bonus - 1)) / 20;
}

/**
 * The chance that one attack by `sheet`'s character takes `enemy` from full
 * hit points to 0: a natural 1 misses, a roll in the critical range hits and
 * doubles the damage dice, and any other roll hits when it meets the enemy's
 * AC. The attack is the one the runtime gives the character, so Fighting
 * Style, level and masteries are counted: Archery's +2 to hit with a ranged
 * weapon, Great Weapon Fighting's 1s and 2s counted as 3, a weapon's own disadvantage (Heavy) and Graze's damage on a
 * miss. The enemy's resistance, vulnerability or immunity to the weapon's
 * damage type changes the damage, and an enemy with Undead Fortitude must
 * also fail its Constitution save unless the hit is critical or radiant.
 * Advantage from a previous hit (Vex) is not counted, nor is the Light extra
 * attack (the only attack Two-Weapon Fighting changes): it is a second one.
 * With `bonusAction`, a Rogue's bonus action before the attack is counted
 * too (#310), as the harness plays it: Steady Aim gives advantage, or else
 * Hide gives it as often as its Stealth check meets `hideDc`, the best
 * passive Perception in the enemy's fight. Advantage brings Sneak Attack's
 * dice, doubled on a critical hit, with a Finesse or ranged weapon; the
 * weapon's own disadvantage cancels both. The gate judges the plain attack
 * and only reports this one (owner decision, 9 October 2026).
 */
export function oneHitKillChance(
  sheet: CharacterSheet,
  enemy: Pick<StatBlock, "armorClass"> &
    Readonly<{ hitPoints: Pick<StatBlock["hitPoints"], "average"> }> &
    Partial<
      Pick<
        StatBlock,
        | "damageResistances"
        | "damageVulnerabilities"
        | "damageImmunities"
        | "traits"
        | "abilities"
        | "saveProficiencies"
        | "challengeRating"
      >
    >,
  bonusAction?: Readonly<{ hideDc: number }>,
): number {
  const combatant = playerCombatant(sheet);
  const { attack } = combatant;
  const hp = enemy.hitPoints.average;
  const defenses = statBlockDefenses(enemy);
  /** Its Constitution save, if Undead Fortitude can keep it standing. */
  const fortitude =
    enemy.traits?.includes("Undead Fortitude") === true &&
    enemy.abilities !== undefined &&
    enemy.challengeRating !== undefined &&
    attack.damage.type !== "radiant"
      ? statBlockSaves({
          abilities: enemy.abilities,
          challengeRating: enemy.challengeRating,
          ...(enemy.saveProficiencies === undefined
            ? {}
            : { saveProficiencies: enemy.saveProficiencies }),
        }).constitution
      : undefined;
  /**
   * P(`rolled` damage takes the enemy to 0 and keeps it there): Undead
   * Fortitude saves against DC 5 + the damage taken, except on a critical.
   */
  const killedBy = (rolled: number, critical: boolean) => {
    const { damage } = damageTaken(defenses, attack.damage.type, rolled);
    if (damage < hp) {
      return 0;
    }
    return fortitude === undefined || critical
      ? 1
      : fortitudeFails(damage, fortitude);
  };
  /**
   * P(a kill) with `dice` dice of the weapon and `sneak` Sneak Attack dice
   * plus the weapon's modifier. Great Weapon Fighting counts only the
   * weapon's dice.
   */
  const kills = (dice: number, sneak: number, critical: boolean) => {
    let totals = new Map([[attack.damage.modifier, 1]]);
    const add = (sides: number, counted: (face: number) => number) => {
      const next = new Map<number, number>();
      for (const [total, chance] of totals) {
        for (let face = 1; face <= sides; face++) {
          const value = total + counted(face);
          next.set(value, (next.get(value) ?? 0) + chance / sides);
        }
      }
      totals = next;
    };
    for (let die = 0; die < dice; die++) {
      add(attack.damage.sides, (face) =>
        countedDamageDie(face, attack.greatWeaponFighting),
      );
    }
    for (let die = 0; die < sneak; die++) {
      add(combatant.sneakAttack!.sides, (face) => face);
    }
    return [...totals].reduce(
      (sum, [total, chance]) =>
        sum + chance * killedBy(Math.max(0, total), critical),
      0,
    );
  };
  // Graze: a miss deals the ability modifier, if above 0.
  const graze = grazeDamage(attack);
  const grazeKills =
    attack.mastery === "Graze" && graze > 0 ? killedBy(graze, false) : 0;
  /**
   * P(a kill) with the d20 rolled `mode`: two kept higher or lower, or one;
   * with `sneak` Sneak Attack dice on a hit.
   */
  const chanceWith = (
    mode: "advantage" | "disadvantage" | "straight",
    sneak: number,
  ) => {
    /** P(the kept d20 is `d20`). */
    const rolled = (d20: number) =>
      mode === "straight"
        ? 1 / 20
        : mode === "advantage"
          ? (d20 ** 2 - (d20 - 1) ** 2) / 400
          : ((21 - d20) ** 2 - (20 - d20) ** 2) / 400;
    let chance = 0;
    for (let d20 = 1; d20 <= 20; d20++) {
      if (d20 !== 1 && d20 >= attack.criticalRange) {
        chance += kills(attack.damage.dice * 2, sneak * 2, true) * rolled(d20);
      } else if (d20 !== 1 && d20 + attack.bonus >= enemy.armorClass) {
        chance += kills(attack.damage.dice, sneak, false) * rolled(d20);
      } else {
        chance += grazeKills * rolled(d20);
      }
    }
    return chance;
  };
  const hindered = (attack.disadvantage ?? []).length > 0;
  /** P(the bonus action before the attack gives it advantage). */
  const aided =
    bonusAction === undefined
      ? 0
      : combatant.steadyAim === true
        ? 1
        : combatant.hide === undefined
          ? 0
          : (() => {
              const { modifier, proficiency } = combatant.hide;
              const once =
                Math.min(
                  20,
                  Math.max(
                    0,
                    21 - (bonusAction.hideDc - modifier - proficiency),
                  ),
                ) / 20;
              // Untrained armour gives the Stealth check disadvantage.
              return (combatant.abilityDisadvantages?.dexterity ?? []).length >
                0
                ? once ** 2
                : once;
            })();
  const plain = chanceWith(hindered ? "disadvantage" : "straight", 0);
  if (aided === 0) {
    return plain;
  }
  // The weapon's own disadvantage cancels the advantage, and Sneak Attack.
  const sneak =
    !hindered &&
    combatant.sneakAttack !== undefined &&
    (attack.finesse === true || attack.ammunition !== undefined)
      ? combatant.sneakAttack.dice
      : 0;
  return (
    (1 - aided) * plain +
    aided * chanceWith(hindered ? "straight" : "advantage", sneak)
  );
}

/** An enemy as the spell measures (#348) read it. */
export type MeasuredEnemy = Pick<
  StatBlock,
  "armorClass" | "abilities" | "challengeRating" | "type"
> &
  Readonly<{ hitPoints: Pick<StatBlock["hitPoints"], "average"> }> &
  Partial<
    Pick<
      StatBlock,
      | "damageResistances"
      | "damageVulnerabilities"
      | "damageImmunities"
      | "traits"
      | "saveProficiencies"
      | "conditionImmunities"
    >
  >;

/** A distribution of damage: each total with its chance. */
type Damage = ReadonlyMap<number, number>;

/** Two independent damages added together. */
function addDamage(a: Damage, b: Damage): Damage {
  const sum = new Map<number, number>();
  for (const [x, p] of a) {
    for (const [y, q] of b) {
      sum.set(x + y, (sum.get(x + y) ?? 0) + p * q);
    }
  }
  return sum;
}

/** `dice` dice of `sides` sides plus `modifier`, through `taken`. */
function rolledDamage(
  dice: number,
  sides: number,
  modifier: number,
  taken: (rolled: number) => number,
  half = false,
): Damage {
  let totals: Damage = new Map([[modifier, 1]]);
  const die = new Map(
    Array.from({ length: sides }, (_, face) => [face + 1, 1 / sides]),
  );
  for (let index = 0; index < dice; index++) {
    totals = addDamage(totals, die);
  }
  const out = new Map<number, number>();
  for (const [total, p] of totals) {
    const dealt = taken(half ? Math.floor(total / 2) : Math.max(0, total));
    out.set(dealt, (out.get(dealt) ?? 0) + p);
  }
  return out;
}

/** `a` with chance `p`, else `b`. */
function mixDamage(p: number, a: Damage, b: Damage): Damage {
  const out = new Map<number, number>();
  for (const [x, q] of a) {
    out.set(x, (out.get(x) ?? 0) + p * q);
  }
  for (const [x, q] of b) {
    out.set(x, (out.get(x) ?? 0) + (1 - p) * q);
  }
  return out;
}

const NO_DAMAGE: Damage = new Map([[0, 1]]);

/** P(a d20 + `bonus` meets `dc`): a saving throw's success, no natural rules. */
function succeeds(bonus: number, dc: number): number {
  return Math.min(20, Math.max(0, 21 - (dc - bonus))) / 20;
}

/**
 * The chance that one cast of `spell` by `sheet`'s character, with a slot of
 * `slotLevel` for a levelled spell, takes `enemy` from full hit points to 0
 * (#348), as the engine casts it: a spell attack (each of Scorching Ray's
 * rays at it, a critical hit on a 20 doubling the dice, Acid Arrow's and
 * Potent Cantrip's half on a miss, Ice Knife's burst), a saving throw
 * (half or none on a success, half for a cantrip with Potent Cantrip),
 * Magic Missile's darts, or the first strike of guardians, a spectral
 * weapon or a draining touch. Damage at the end of a later turn is not
 * counted, nor the round-2 disadvantage. The enemy's defenses change the
 * damage, and Undead Fortitude saves as for a weapon (`oneHitKillChance`),
 * ignoring a critical hit among several rays. Any other spell: 0.
 */
export function spellKillChance(
  sheet: CharacterSheet,
  spell: SpellDefinition,
  slotLevel: number | undefined,
  enemy: MeasuredEnemy,
): number {
  const { spellcasting } = playerCombatant(sheet);
  if (spellcasting === undefined) {
    return 0;
  }
  const cast = spell.level === 0 ? spellAtLevel(spell, sheet.level) : spell;
  const effect = effectAtSlot(cast, slotLevel);
  const potent = cast.level === 0 && spellcasting.potentCantrip === true;
  const hp = enemy.hitPoints.average;
  const defenses = statBlockDefenses(enemy);
  const saves = statBlockSaves(enemy);
  const taken = (type: DamageType) => (rolled: number) =>
    damageTaken(defenses, type, rolled).damage;
  /** P(`damage` keeps it at 0): Undead Fortitude, unless radiant or critical. */
  const kills = (damage: Damage, type: DamageType, critical: boolean) => {
    const fortitude =
      enemy.traits?.includes("Undead Fortitude") === true &&
      type !== "radiant" &&
      !critical
        ? saves.constitution
        : undefined;
    let chance = 0;
    for (const [dealt, p] of damage) {
      if (dealt >= hp) {
        chance +=
          p * (fortitude === undefined ? 1 : fortitudeFails(dealt, fortitude));
      }
    }
    return chance;
  };
  /**
   * An attack roll's damage: each d20, a 20 critical, a hit when it meets
   * AC, else a miss dealing half or nothing; split as hit/critical/miss.
   */
  const attackRoll = (
    damage: Readonly<{ dice: number; sides: number; type: DamageType }>,
    modifier: number,
    missHalf: boolean,
  ) => {
    const type = damage.type;
    const hit = rolledDamage(damage.dice, damage.sides, modifier, taken(type));
    const critical = rolledDamage(
      damage.dice * 2,
      damage.sides,
      modifier,
      taken(type),
    );
    const miss = missHalf
      ? rolledDamage(damage.dice, damage.sides, modifier, taken(type), true)
      : NO_DAMAGE;
    const pCritical = 1 / 20;
    const pHit =
      Math.min(
        18,
        Math.max(
          0,
          20 - Math.max(2, enemy.armorClass - spellcasting.attackBonus),
        ),
      ) / 20;
    return { type, hit, critical, miss, pCritical, pHit };
  };
  switch (effect.kind) {
    case "attack": {
      const roll = attackRoll(
        effect.damage,
        0,
        effect.missHalf === true || potent,
      );
      const burst =
        effect.burst === undefined
          ? NO_DAMAGE
          : mixDamage(
              1 - succeeds(saves[effect.burst.ability], spellcasting.saveDc),
              rolledDamage(
                effect.burst.damage.dice,
                effect.burst.damage.sides,
                0,
                taken(effect.burst.damage.type),
              ),
              NO_DAMAGE,
            );
      const rays = effect.rays ?? 1;
      if (rays === 1) {
        const pMiss = 1 - roll.pCritical - roll.pHit;
        return (
          roll.pCritical *
            kills(addDamage(roll.critical, burst), roll.type, true) +
          roll.pHit * kills(addDamage(roll.hit, burst), roll.type, false) +
          pMiss * kills(addDamage(roll.miss, burst), roll.type, false)
        );
      }
      const one = mixDamage(
        roll.pCritical,
        roll.critical,
        mixDamage(roll.pHit / (1 - roll.pCritical), roll.hit, roll.miss),
      );
      let total: Damage = burst;
      for (let ray = 0; ray < rays; ray++) {
        total = addDamage(total, one);
      }
      return kills(total, roll.type, false);
    }
    case "spectral-weapon":
    case "drain": {
      const roll = attackRoll(
        effect.damage,
        effect.kind === "spectral-weapon" ? spellcasting.modifier : 0,
        false,
      );
      return (
        roll.pCritical * kills(roll.critical, roll.type, true) +
        roll.pHit * kills(roll.hit, roll.type, false)
      );
    }
    case "save":
    case "guardians": {
      const { damage } = effect;
      const success = succeeds(saves[effect.ability], spellcasting.saveDc);
      const half = effect.onSuccess === "half" || potent;
      return kills(
        mixDamage(
          1 - success,
          rolledDamage(damage.dice, damage.sides, 0, taken(damage.type)),
          half
            ? rolledDamage(
                damage.dice,
                damage.sides,
                0,
                taken(damage.type),
                true,
              )
            : NO_DAMAGE,
        ),
        damage.type,
        false,
      );
    }
    case "auto-hit": {
      const { damage, missiles } = effect;
      return kills(
        rolledDamage(
          missiles * damage.dice,
          damage.sides,
          missiles * damage.modifier,
          taken(damage.type),
        ),
        damage.type,
        false,
      );
    }
    default:
      return 0;
  }
}

/**
 * The control a character may use at a fight's opening (#348, D5): a
 * control spell (Sleep, Hold Person), or the Cleric's Turn Undead.
 */
export type ControlId = SpellId | "turn-undead";

/**
 * How many of its turns a control must keep an enemy from acting to take it
 * out of the fight (#348, owner's choice): about a fight's length.
 */
export const CONTROL_TURNS = 3;

/**
 * The chance that `control`, used once by `sheet`'s character at a
 * fight's opening, takes `enemy` out of the fight (#348, D5): that it
 * can't act on its next `CONTROL_TURNS` turns. It fails its first saving
 * throw and then each save it repeats at the end of its turns until then:
 * Hold Person's and Turn Undead's every turn, Sleep's once (its second
 * failure leaves it Unconscious for the spell). Sleep's target rolls both
 * with advantage (#369), so both d20s of each must fail. 0 when it is
 * immune, or not the creature type the control works on (Hold Person's humanoid, Turn
 * Undead's undead).
 */
export function controlChance(
  sheet: CharacterSheet,
  control: ControlId,
  enemy: MeasuredEnemy,
): number {
  const self = playerCombatant(sheet);
  const saves = statBlockSaves(enemy);
  const type = creatureTypeOf(enemy.type);
  if (control === "turn-undead") {
    const channel = self.channelDivinity;
    return channel === undefined || type !== "undead"
      ? 0
      : (1 - succeeds(saves.wisdom, channel.saveDc)) ** CONTROL_TURNS;
  }
  const { effect } = SPELLS[control] as SpellDefinition;
  if (
    self.spellcasting === undefined ||
    effect.kind !== "control" ||
    (effect.creatureType !== undefined && effect.creatureType !== type) ||
    enemy.conditionImmunities?.includes(effect.immunity) === true
  ) {
    return 0;
  }
  const fails =
    (1 - succeeds(saves[effect.ability], self.spellcasting.saveDc)) **
    (effect.saveAdvantage === true ? 2 : 1);
  return fails ** (effect.then === undefined ? CONTROL_TURNS : 2);
}

/**
 * The best passive Perception among a fight's opponents: what a Rogue's
 * Hide must meet (#307, #310).
 */
function watching(
  opponents: FifthAdventure["encounters"][number]["opponents"],
): number {
  return Math.max(
    ...opponents.map(({ statBlock }) => statBlock.passivePerception),
  );
}

/** Why the harness can't qualify a module: a named reason, never a pass. */
export type BalanceFailureCode =
  | "unreachable-objective"
  /** A declared route (#407) no style can follow. */
  | "unfollowable-route"
  /** A region sweep (#408) that can't reach one of its rooms. */
  | "unsweepable-region"
  /** A route (#408) whose required path passes an avoidable room. */
  | "avoidable-on-route"
  | "unsupported-action"
  | "step-limit"
  | "stranded"
  | "unsimulated-trait";

export class BalanceError extends Error {
  constructor(
    readonly code: BalanceFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "BalanceError";
  }
}

/** What a run aims for: a victory, or else getting out with treasure. */
export type Objective = Exclude<EndingKind, "defeat">;

/** What the route planner knows about where the character is. */
type Position = Readonly<{
  roomId: string;
  /** Carried keys open their doors. */
  inventory: readonly string[];
  /** Encounters won: entering their rooms starts no fight. */
  clearedEncounterIds: readonly string[];
  /** Passages that can't be gone through: a door that held every try. */
  blockedPassageIds: readonly string[];
  /** Keys that can no longer be found (#331): their doors stay shut. */
  lostKeyIds: readonly string[];
  /** The module's flags set (#397): they open and close passages. */
  flags: readonly string[];
  /** Rooms already entered: going back sets no flag not yet set (#397). */
  visitedRoomIds: readonly string[];
  /** Features examined: examining one again sets no flag (#397). */
  examinedFeatureIds: readonly string[];
  /** Items taken (or used up): they set no flag again (#397). */
  takenItemIds: readonly string[];
  /** Where each encounter flags place was met (#398): it stays there. */
  met: readonly MetEncounter[];
  /** Hidden passages an item used on a feature has opened (#400). */
  usedOpen: readonly string[];
}>;

/** Each use of an item on a feature (#400) that opens a passage. */
type UseOpening = Readonly<{
  featureId: string;
  /** The feature's room, where the use is made. */
  roomId: string;
  itemId: string;
  passageId: string;
}>;

const USE_OPENINGS = new WeakMap<FifthAdventure, readonly UseOpening[]>();

function useOpenings(adventure: FifthAdventure): readonly UseOpening[] {
  let found = USE_OPENINGS.get(adventure);
  if (found === undefined) {
    found = findUseOpenings(adventure);
    USE_OPENINGS.set(adventure, found);
  }
  return found;
}

function findUseOpenings(adventure: FifthAdventure): readonly UseOpening[] {
  return adventure.rooms.flatMap(({ id: roomId, features }) =>
    features.flatMap(({ id: featureId, uses }) =>
      (uses ?? []).flatMap(({ item, effects }) =>
        effects.flatMap((effect) =>
          effect.type === "open"
            ? [{ featureId, roomId, itemId: item, passageId: effect.passage }]
            : [],
        ),
      ),
    ),
  );
}

/** The passages the uses made so far opened (#400). */
function openedByUses(
  adventure: FifthAdventure,
  made: readonly Readonly<{ featureId: string; itemId: string }>[],
): readonly string[] {
  return made.length === 0
    ? []
    : useOpenings(adventure).flatMap(({ featureId, itemId, passageId }) =>
        made.some((use) => use.featureId === featureId && use.itemId === itemId)
          ? [passageId]
          : [],
      );
}

/** Rooms a route may pass through or end in; the start is always allowed. */
type Enterable = (roomId: string) => boolean;

function passageBetween(
  adventure: FifthAdventure,
  from: string,
  to: string,
): FifthPassage {
  return adventure.passages.find(
    ({ between: [a, b] }) =>
      (a === from && b === to) || (a === to && b === from),
  )!;
}

/** A door that only its key opens: it has no check to try. */
function keyOnly(passage: FifthPassage): boolean {
  const door = passage.door;
  return (
    door !== undefined &&
    door.force === undefined &&
    door.pick === undefined &&
    door.break === undefined
  );
}

/**
 * The hidden passages only a topic's check opens (#297). No style talks, so
 * no style opens one.
 */
function talkOnlyPassages(adventure: FifthAdventure): ReadonlySet<string> {
  const openers = authoredChecks(adventure).flatMap(({ kind, check }) =>
    Object.values(check.bands ?? {}).flatMap((band) =>
      effectsOf(band).flatMap((effect) =>
        effect.type === "open" ? [{ kind, passage: effect.passage }] : [],
      ),
    ),
  );
  // Using an item on a feature (#400) opens one too.
  const usedOpen = new Set(
    useOpenings(adventure).map(({ passageId }) => passageId),
  );
  return new Set(
    adventure.passages.flatMap(({ id, hidden }) =>
      hidden === true &&
      !openers.some(({ kind, passage }) => passage === id && kind !== "talk") &&
      !usedOpen.has(id)
        ? [id]
        : [],
    ),
  );
}

/**
 * Plans routes on the adventure's map. A route costs one fight for each room
 * with a fight not yet won, and a little per move, so the planner prefers the
 * fewest fights, then the fewest moves. A door with a check counts as
 * passable until it blocks the passage; a door only a key opens counts as
 * passable only with its key carried, and otherwise the plan fetches the key,
 * unless the key is lost (#331). A passage a flag opens (#397) is passable
 * only once it is set, and otherwise the plan goes to a room where something
 * not yet done sets it for sure (`sureFlagSetters`, as the validator counts
 * it), even one the character has been through; one a flag has closed never
 * is.
 * A hidden passage only talking opens is never passable (#297), unless
 * `talking` is true. One only an item used on a feature opens (#400) is
 * passable once a use has opened it, and otherwise the plan fetches the
 * item and then goes to the feature, where the character uses it.
 */
function newRoutePlanner(adventure: FifthAdventure, talking: boolean) {
  const talkOnly = talking ? new Set<string>() : talkOnlyPassages(adventure);
  // The hidden passages only a use opens (#400): no band of a check does.
  const bandOpened = new Set(
    authoredChecks(adventure).flatMap(({ check }) =>
      Object.values(check.bands ?? {}).flatMap((band) =>
        effectsOf(band).flatMap((effect) =>
          effect.type === "open" ? [effect.passage] : [],
        ),
      ),
    ),
  );
  const openings = useOpenings(adventure).filter(
    ({ passageId }) => !bandOpened.has(passageId),
  );
  const useOnly = new Set(openings.map(({ passageId }) => passageId));
  const itemRoom = new Map(
    adventure.rooms.flatMap(({ id, items }) =>
      items.map((item) => [item.id, id] as const),
    ),
  );
  /** Whether a use not yet made keeps `passage` shut (#400). */
  const unused = (position: Position, passage: FifthPassage) =>
    useOnly.has(passage.id) && !position.usedOpen.includes(passage.id);
  const roomById = new Map(adventure.rooms.map((room) => [room.id, room]));
  /** Each room's passages, in the module's order, with where each leads. */
  const passagesFrom = new Map<
    string,
    Readonly<{ passage: FifthPassage; next: string }>[]
  >();
  for (const passage of adventure.passages) {
    const [a, b] = passage.between;
    const add = (here: string, next: string) =>
      passagesFrom.set(here, [
        ...(passagesFrom.get(here) ?? []),
        { passage, next },
      ]);
    add(a, b);
    if (b !== a) {
      add(b, a);
    }
  }
  const flagSetters = new Map(
    adventure.rooms.map((room) => [
      room.id,
      sureFlagSetters(room, adventure.encounters),
    ]),
  );
  /** Whether `setter` is still to be done from `position` (#397). */
  const undone = (position: Position, { by, id }: SureFlagSetter) => {
    switch (by) {
      case "room":
        return !position.visitedRoomIds.includes(id);
      case "feature":
        return !position.examinedFeatureIds.includes(id);
      case "item":
        return !position.takenItemIds.includes(id);
      case "encounter":
        return !position.clearedEncounterIds.includes(id);
    }
  };
  const keyRoom = new Map(
    adventure.rooms.flatMap(({ id, items }) =>
      items.flatMap((item) =>
        item.kind === "key" ? [[item.id, id] as const] : [],
      ),
    ),
  );
  const placements = encounterPlacements(adventure);
  const roomPlacements = placementsByRoom(placements);
  const conditional = adventure.encounters.some(isConditional);
  /** The encounter in room `roomId` from `position` (#398). */
  const encounterAt = (position: Position, roomId: string) =>
    conditional
      ? encounterInRoom(
          roomPlacements.get(roomId) ?? [],
          roomId,
          position.flags,
          position.met,
        )
      : roomById.get(roomId)!.encounterId;
  const fightIn = (position: Position, roomId: string) => {
    const encounterId = encounterAt(position, roomId);
    return (
      encounterId !== undefined &&
      !position.clearedEncounterIds.includes(encounterId)
    );
  };
  /**
   * The flags each fight flags place (#398) sets for sure, by the room it is
   * in from `position`: the planner counts on it where it is now.
   */
  const placedSetters = (position: Position) =>
    adventure.encounters.flatMap((fight) => {
      if (!isConditional(fight)) {
        return [];
      }
      const roomId = placements.find(
        (placement) =>
          placement.encounterId === fight.id &&
          encounterAt(position, placement.roomId) === fight.id,
      )?.roomId;
      return roomId === undefined
        ? []
        : encounterSureFlags(fight).map(
            (flag) =>
              [
                roomId,
                { flag, by: "encounter" as const, id: fight.id },
              ] as const,
          );
    });
  /** What goes into each room sets for sure from `position` (#397, #398). */
  const settersFrom = (position: Position) => {
    if (!conditional) {
      return flagSetters;
    }
    const placed = placedSetters(position);
    return new Map(
      [...flagSetters].map(([roomId, inRoom]) => [
        roomId,
        [
          ...inRoom,
          ...placed.flatMap(([at, setter]) => (at === roomId ? [setter] : [])),
        ],
      ]),
    );
  };

  /**
   * The cheapest route from the character's room to the nearest target, as
   * the rooms along it, starting with the character's; undefined if none.
   * With `keys` "any", key-only doors count as open, unless their keys are
   * lost, and so do passages a flag not yet set opens (#397).
   */
  const route = (
    position: Position,
    targets: ReadonlySet<string>,
    enterable: Enterable,
    keys: "carried" | "any",
  ): readonly string[] | undefined => {
    const cost = new Map([[position.roomId, 0]]);
    const previous = new Map<string, string>();
    const done = new Set<string>();
    for (;;) {
      let here: string | undefined;
      for (const [roomId, spent] of cost) {
        if (
          !done.has(roomId) &&
          (here === undefined || spent < cost.get(here)!)
        ) {
          here = roomId;
        }
      }
      if (here === undefined) {
        return undefined;
      }
      if (targets.has(here)) {
        const path = [here];
        while (path[0] !== position.roomId) {
          path.unshift(previous.get(path[0]!)!);
        }
        return path;
      }
      done.add(here);
      for (const { passage, next } of passagesFrom.get(here) ?? []) {
        const keyId = passage.door?.keyItemId;
        const locked =
          keyOnly(passage) &&
          (keyId === undefined || !position.inventory.includes(keyId));
        if (
          done.has(next) ||
          !enterable(next) ||
          talkOnly.has(passage.id) ||
          position.blockedPassageIds.includes(passage.id) ||
          (passage.closeWhen !== undefined &&
            position.flags.includes(passage.closeWhen)) ||
          (keys === "carried" && unflagged(position, passage)) ||
          (keys === "carried" && unused(position, passage)) ||
          (locked &&
            (keys === "carried" ||
              (keyId !== undefined && position.lostKeyIds.includes(keyId))))
        ) {
          continue;
        }
        const spent =
          cost.get(here)! + (fightIn(position, next) ? 1000 : 0) + 1;
        if (spent < (cost.get(next) ?? Infinity)) {
          cost.set(next, spent);
          previous.set(next, here);
        }
      }
    }
  };

  /** Whether a flag not yet set keeps `passage` shut (#397). */
  const unflagged = (position: Position, passage: FifthPassage) =>
    passage.openWhen !== undefined &&
    !position.flags.includes(passage.openWhen);

  /**
   * The route toward the nearest target. When only a key-only door stands
   * in the way, the route leads to the room holding its key instead; when a
   * passage a flag opens does (#397), to the nearest other room where
   * something not yet done sets it for sure.
   */
  const plan = (
    position: Position,
    targets: ReadonlySet<string>,
    enterable: Enterable,
  ): readonly string[] | undefined => {
    const open = route(position, targets, enterable, "carried");
    if (open !== undefined) {
      return open;
    }
    const keyed = route(position, targets, enterable, "any") ?? [];
    for (let step = 1; step < keyed.length; step++) {
      const passage = passageBetween(adventure, keyed[step - 1]!, keyed[step]!);
      if (unflagged(position, passage)) {
        const setters = new Set(
          [...settersFrom(position)].flatMap(([roomId, inRoom]) =>
            roomId !== position.roomId &&
            inRoom.some(
              (setter) =>
                setter.flag === passage.openWhen && undone(position, setter),
            )
              ? [roomId]
              : [],
          ),
        );
        return setters.size === 0
          ? undefined
          : route(position, setters, enterable, "carried");
      }
      if (unused(position, passage)) {
        // To the feature with the item carried; else to fetch an item.
        const ways = openings.filter(
          ({ passageId }) => passageId === passage.id,
        );
        const carried = ways.filter(({ itemId }) =>
          position.inventory.includes(itemId),
        );
        const toward = new Set(
          (carried.length > 0
            ? carried.map(({ roomId }) => roomId)
            : ways.flatMap(({ itemId }) => itemRoom.get(itemId) ?? [])
          ).filter((roomId) => roomId !== position.roomId),
        );
        return toward.size === 0
          ? undefined
          : route(position, toward, enterable, "carried");
      }
      const keyId = passage.door?.keyItemId;
      if (keyOnly(passage) && !position.inventory.includes(keyId!)) {
        return route(
          position,
          new Set([keyRoom.get(keyId!)!]),
          enterable,
          "carried",
        );
      }
    }
    return undefined;
  };
  /** The flags going into each room sets for sure from `position` (#397). */
  const roomFlags = (position: Position, roomId: string) =>
    settersFrom(position)
      .get(roomId)!
      .map(({ flag }) => flag);
  /**
   * The passage a flag keeps shut on the way to `targets` from `position`,
   * when no plan gets there (#407): the first on the way that would be
   * open with every flag set.
   */
  const flagShut = (
    position: Position,
    targets: ReadonlySet<string>,
  ): FifthPassage | undefined => {
    const keyed = route(position, targets, () => true, "any") ?? [];
    for (let step = 1; step < keyed.length; step++) {
      const passage = passageBetween(adventure, keyed[step - 1]!, keyed[step]!);
      if (unflagged(position, passage)) {
        return passage;
      }
    }
    return undefined;
  };
  return { plan, roomById, fightIn, encounterAt, roomFlags, flagShut };
}

/** Each adventure's route planners, not talking and talking (#410). */
const ROUTE_PLANNERS = new WeakMap<
  FifthAdventure,
  Map<boolean, ReturnType<typeof newRoutePlanner>>
>();

/**
 * The adventure's route planner (`newRoutePlanner`): worked out once, as
 * every run plays from the same one (#410).
 */
function routePlanner(
  adventure: FifthAdventure,
  talking = false,
): ReturnType<typeof newRoutePlanner> {
  const planners =
    ROUTE_PLANNERS.get(adventure) ??
    new Map<boolean, ReturnType<typeof newRoutePlanner>>();
  ROUTE_PLANNERS.set(adventure, planners);
  let planner = planners.get(talking);
  if (planner === undefined) {
    planner = newRoutePlanner(adventure, talking);
    planners.set(talking, planner);
  }
  return planner;
}

/**
 * A region's sweep (#408): every room of one region of a long module but
 * those marked `avoidable` and the victory room, which the objective
 * reaches last, for the cautious style to visit, nearest first, and fight
 * what waits in each.
 */
export type RegionSweep = Readonly<{
  region: string;
  name: string;
  rooms: readonly string[];
}>;

/**
 * A long module's region sweeps (#408), one per region in the module's
 * order, each with its rooms in the module's order; none for any other
 * module.
 */
export function regionSweeps(
  adventure: FifthAdventure,
): readonly RegionSweep[] {
  if (adventure.long !== true) {
    return [];
  }
  const winning = victoryRooms(adventure);
  return (adventure.regions ?? []).map(({ id, name }) => ({
    region: id,
    name,
    rooms: adventure.rooms.flatMap((room) =>
      room.region === id && room.avoidable !== true && !winning.has(room.id)
        ? [room.id]
        : [],
    ),
  }));
}

/** The rooms where winning the fight ends the adventure in victory. */
function victoryRooms(adventure: FifthAdventure): ReadonlySet<string> {
  const winning = new Set(
    adventure.encounters.flatMap(({ id, victoryEndingId }) =>
      victoryEndingId === undefined ? [] : [id],
    ),
  );
  return new Set(
    adventure.rooms.flatMap(({ id, encounterId }) =>
      encounterId !== undefined && winning.has(encounterId) ? [id] : [],
    ),
  );
}

/** The rooms with loot to find: treasure or coin. */
function lootRooms(adventure: FifthAdventure): ReadonlySet<string> {
  return new Set(
    adventure.rooms.flatMap(({ id, items }) =>
      items.some(({ kind }) => LOOT_KINDS.includes(kind)) ? [id] : [],
    ),
  );
}

function exitRooms(adventure: FifthAdventure): ReadonlySet<string> {
  return new Set(
    adventure.rooms.flatMap(({ id, exit }) => (exit === true ? [id] : [])),
  );
}

/** The adventure's objective: a victory if it has one, or else loot carried out. */
function objectiveOf(adventure: FifthAdventure): Objective {
  return victoryRooms(adventure).size > 0
    ? "victory"
    : lootRooms(adventure).size > 0
      ? "escape-with-loot"
      : "escape-without-loot";
}

/** Each adventure's required rooms, by the route or sweep followed (#410). */
const REQUIRED_ROOMS = new WeakMap<
  FifthAdventure,
  Map<FifthRoute | RegionSweep | undefined, ReadonlySet<string>>
>();

/**
 * The rooms of `requiredPath` along `along`: worked out once for every
 * run that follows it (#410).
 */
function requiredRooms(
  adventure: FifthAdventure,
  along: FifthRoute | RegionSweep | undefined,
): ReadonlySet<string> {
  const paths =
    REQUIRED_ROOMS.get(adventure) ??
    new Map<FifthRoute | RegionSweep | undefined, ReadonlySet<string>>();
  REQUIRED_ROOMS.set(adventure, paths);
  let rooms = paths.get(along);
  if (rooms === undefined) {
    rooms = new Set(requiredPath(adventure, along).roomIds);
    paths.set(along, rooms);
  }
  return rooms;
}

/**
 * The adventure's objective and the rooms a character must go through to
 * reach it, in the order first entered: to the victory fight; or to the
 * loot behind the fewest fights and then out by the nearest exit; or
 * just out. Keys that open the way are fetched on the way. No route goes
 * through a hidden passage that only a topic's check opens (#297): the
 * path is the one a player who never talks must take. Every other room is optional, and
 * so is every fight in one.
 *
 * Given a declared `route` (#407), the path first passes the route's rooms
 * in order, each by the fewest fights from the last, then goes on to the
 * objective. A route no style can follow throws an `unfollowable-route`
 * failure naming it and the room no way reaches. Given a region `sweep`
 * (#408), the path first visits each of its rooms, the nearest not yet
 * visited next, by the fewest fights; one it can't reach throws an
 * `unsweepable-region` failure.
 */
export function requiredPath(
  adventure: FifthAdventure,
  along?: FifthRoute | RegionSweep,
): Readonly<{
  objective: Objective;
  roomIds: readonly string[];
}> {
  const { plan, roomById, encounterAt, roomFlags, flagShut } =
    routePlanner(adventure);
  const objective = objectiveOf(adventure);
  const sweep = along !== undefined && "region" in along ? along : undefined;
  const route = along !== undefined && !("region" in along) ? along : undefined;
  const roomIds = [adventure.startRoomId];
  /**
   * The rooms to reach next, leg by leg: a route's in turn, or a sweep's
   * not yet visited, then the objective's.
   */
  function* legs(): Generator<ReadonlySet<string>> {
    for (;;) {
      const left = sweep?.rooms.filter((roomId) => !roomIds.includes(roomId));
      if (left === undefined || left.length === 0) {
        break;
      }
      yield new Set(left);
    }
    yield* (route?.rooms ?? []).map((roomId) => new Set([roomId]));
    yield* objective === "victory"
      ? [victoryRooms(adventure)]
      : objective === "escape-with-loot"
        ? [lootRooms(adventure), exitRooms(adventure)]
        : [exitRooms(adventure)];
  }
  const start: Position = {
    roomId: adventure.startRoomId,
    inventory: [],
    clearedEncounterIds: [],
    blockedPassageIds: [],
    lostKeyIds: [],
    flags: [],
    visitedRoomIds: [],
    examinedFeatureIds: [],
    takenItemIds: [],
    met: [],
    usedOpen: [],
  };
  let position: Position = {
    ...start,
    flags: roomFlags(start, adventure.startRoomId),
    visitedRoomIds: [adventure.startRoomId],
    examinedFeatureIds: roomById
      .get(adventure.startRoomId)!
      .features.map(({ id }) => id),
    takenItemIds: roomById
      .get(adventure.startRoomId)!
      .items.map(({ id }) => id),
  };
  // The items a use needs are carried, as keys are (#400).
  const openings = useOpenings(adventure);
  const useItems = new Set(openings.map(({ itemId }) => itemId));
  /** `position` with the uses its room's features accept made (#400). */
  const usingItems = (at: Position): Position => ({
    ...at,
    usedOpen: [
      ...at.usedOpen,
      ...openings.flatMap(({ roomId, itemId, passageId }) =>
        roomId === at.roomId &&
        at.inventory.includes(itemId) &&
        !at.usedOpen.includes(passageId)
          ? [passageId]
          : [],
      ),
    ],
  });
  position = usingItems({
    ...position,
    inventory: roomById
      .get(adventure.startRoomId)!
      .items.flatMap(({ id }) => (useItems.has(id) ? [id] : [])),
  });
  for (const targets of legs()) {
    while (!targets.has(position.roomId)) {
      const path = plan(position, targets, () => true);
      if (path === undefined) {
        // Name talking only when talking would have reached it; on a
        // declared route, else the flag that keeps the way shut (#407).
        const byTalking = routePlanner(adventure, true).plan(
          position,
          targets,
          () => true,
        );
        const talked =
          byTalking === undefined
            ? undefined
            : `: no style talks, and only talking opens the way through ${byTalking.join(" > ")}`;
        const waypoint = targets.size === 1 ? [...targets][0]! : undefined;
        // The flag that keeps the way shut, only where it is shown.
        const shut =
          talked === undefined && along !== undefined
            ? flagShut(position, targets)
            : undefined;
        const why =
          talked ??
          (shut === undefined
            ? ""
            : `: passage ${shut.id} opens only once flag ${shut.openWhen!} is set, and nothing the character does sets it for sure`);
        if (sweep !== undefined && sweep.rooms.some((id) => targets.has(id))) {
          throw new BalanceError(
            "unsweepable-region",
            `${adventure.id}: the sweep of region ${sweep.region} (${sweep.name}) can't reach ${targets.size === 1 ? "room" : "rooms"} ${[...targets].join(", ")}${why}. Mark the room avoidable if the character need never go there.`,
          );
        }
        if (route === undefined) {
          throw new BalanceError(
            "unreachable-objective",
            `${adventure.id}: no route reaches its ${objective} objective${talked ?? ""}.`,
          );
        }
        throw new BalanceError(
          "unfollowable-route",
          `${adventure.id}: route ${route.id} (${route.name}) can't be followed: ` +
            (waypoint !== undefined && route.rooms.includes(waypoint)
              ? `no way reaches room ${waypoint}`
              : `no way on reaches its ${objective} objective`) +
            `${why}.`,
        );
      }
      const arrived = roomById.get(path.at(-1)!)!;
      // The character fights its way through, room by room, each fight
      // where the flags set so far place it (#398); it examines and takes
      // everything on the way, and so sets the flags those rooms set for
      // sure (#397).
      let passing = position;
      for (const roomId of path) {
        const fight = encounterAt(passing, roomId);
        passing = {
          ...passing,
          clearedEncounterIds: [
            ...passing.clearedEncounterIds,
            ...(fight === undefined ? [] : [fight]),
          ],
        };
        passing = {
          ...passing,
          flags: [...passing.flags, ...roomFlags(passing, roomId)],
        };
      }
      // It takes any key it reaches, and any item a use needs (#400),
      // which it uses on a feature there that accepts it.
      position = usingItems({
        ...position,
        roomId: arrived.id,
        inventory: [
          ...position.inventory,
          ...arrived.items.flatMap(({ id, kind }) =>
            kind === "key" || useItems.has(id) ? [id] : [],
          ),
        ],
        clearedEncounterIds: passing.clearedEncounterIds,
        flags: passing.flags,
        visitedRoomIds: [...position.visitedRoomIds, ...path],
        examinedFeatureIds: [
          ...position.examinedFeatureIds,
          ...path.flatMap((roomId) =>
            roomById.get(roomId)!.features.map(({ id }) => id),
          ),
        ],
        takenItemIds: [
          ...position.takenItemIds,
          ...path.flatMap((roomId) =>
            roomById.get(roomId)!.items.map(({ id }) => id),
          ),
        ],
      });
      roomIds.push(...path.filter((roomId) => !roomIds.includes(roomId)));
    }
  }
  return { objective, roomIds };
}

/**
 * How the harness plays. Each picks only actions the runtime's projection
 * offers as available, the same list as the browser's action bar.
 * - `direct` goes into every room and fights every fight, optional ones
 *   included, and heals only below a quarter of its hit points.
 * - `cautious` skips optional fights but looks into optional rooms with no
 *   fight, searches each room for traps and disarms those it finds, and
 *   heals below half its hit points.
 * - `avoid-optional` enters only the required rooms, and heals below a
 *   quarter. Where a flag has closed the way through them (#401), it goes
 *   round by any room.
 * - `stealth-first` (#302) plays as `cautious`, but sneaks into every fight
 *   it can. Unseen, it slips past the fight unless its goal is in that room
 *   (the victory fight, loot, a key) or the way on is shut: then it springs
 *   an ambush. A fight it slipped past is met again if it comes back.
 * - `retreat` (#396) plays as `cautious`, but in a fight, below its heal
 *   threshold with no heal left to take, it flees toward the nearest exit
 *   room: through a way out whose room has no fight and from which a way
 *   to an exit room passes no fight, with Disengage first when it has it.
 *   Once it has fled it heads out by the nearest such way and leaves. It
 *   flees each fight once: met again, it fights on.
 * - `use-room` (#402) plays as `cautious`, but in a fight, with no heal to
 *   take, it uses the room's fight action whenever one is offered, against
 *   the opponent with the most hit points left (the first listed on a tie),
 *   by its first approach. In a module without fight actions it plays
 *   exactly as `cautious`.
 */
export const PLAY_STYLES = [
  "direct",
  "cautious",
  "avoid-optional",
  "stealth-first",
  "retreat",
  "use-room",
] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

const HEAL_BELOW: Readonly<Record<PlayStyle, number>> = {
  direct: 1 / 4,
  cautious: 1 / 2,
  "avoid-optional": 1 / 4,
  "stealth-first": 1 / 2,
  retreat: 1 / 2,
  "use-room": 1 / 2,
};

/** The styles that skip optional fights but look into rooms without one. */
const CAREFUL: readonly PlayStyle[] = [
  "cautious",
  "stealth-first",
  "retreat",
  "use-room",
];

/**
 * How a run answers a reaction roll's band (#304): `attack`, the default,
 * attacks whenever the band offers it; `peaceful` takes a peaceful option
 * whenever the band offers one: letting the character pass, then paying a
 * toll it can afford, then a parley (#305) with the character's best
 * offered skill (its bonus furthest above, or least below, its DC). Each
 * takes the other kind of option when its own is not offered.
 */
export const REACTION_POLICIES = ["attack", "peaceful"] as const;
export type ReactionPolicy = (typeof REACTION_POLICIES)[number];

/**
 * How a caster spends its spell slots in a fight (#348). Both heal with
 * slots below the heal threshold first, keep a Spiritual Weapon or Vampiric
 * Touch going once cast, and otherwise attack with a cantrip (or a weapon):
 * - `conserve`, the default and the gate's: casts a levelled damage or
 *   control spell only below the heal threshold, with no heal left to take.
 * - `spend-early`: casts the best levelled damage or control spell it can,
 *   at its highest slot, on every turn it has one (`castValue`).
 * A class without spells plays the same either way.
 */
export const CASTING_POLICIES = ["conserve", "spend-early"] as const;
export type CastingPolicy = (typeof CASTING_POLICIES)[number];

/**
 * Every kind of action the harness knows: true for those a style may play,
 * false for those every style passes over, which the harness doesn't ask the
 * runtime to project (#321: dry-running gear changes and trade at every step
 * was a fifth of the gate's time). A kind missing here fails to compile; one
 * a runtime offers anyway that the harness has never heard of (a wrapped
 * runtime that ignores the kinds asked for) fails the run as
 * `unsupported-action`.
 */
const PLAYED_ACTIONS: Readonly<Record<ActionKind, boolean>> = {
  attack: true,
  // Only stealth-first sneaks, and springs an ambush from unseen (#302).
  sneak: true,
  ambush: true,
  // A reaction's options, chosen by the run's reaction policy (#304).
  react: true,
  "light-attack": true,
  use: true,
  "second-wind": true,
  "action-surge": true,
  // Hide and Steady Aim, by the Rogue policy (#307).
  hide: true,
  "steady-aim": true,
  // Only retreat flees (#396), and disengages first when it can; the
  // judged styles never do, so the gate stays a lower bound.
  disengage: true,
  flee: true,
  // Channel Divinity, by the Cleric policy (#341): Turn Undead against
  // undead, Preserve Life when Bloodied, Divine Spark's radiant damage.
  "divine-spark": true,
  "turn-undead": true,
  "preserve-life": true,
  // Spiritual Weapon's and Vampiric Touch's (#344) attacks on later turns,
  // by both caster policies (#348).
  "spectral-attack": true,
  "drain-attack": true,
  "end-turn": true,
  // Uncanny Dodge, by the Rogue policy: every hit it can halve (#308).
  "uncanny-dodge": true,
  // Every hit Uncanny Dodge can halve is halved; a hit Shield can't turn
  // into a miss is taken (#340).
  "take-hit": true,
  // Last Stand (#499) is always taken, so the harness never falls.
  fall: false,
  move: true,
  examine: true,
  take: true,
  // Every style uses an item on a feature as soon as it carries one the
  // feature accepts (#400), before it leaves the room.
  "use-on": true,
  // Only the use-room style uses the room in a fight (#402); the judged
  // styles never do, so the gate stays a lower bound.
  "use-feature": true,
  force: true,
  pick: true,
  break: true,
  unlock: true,
  search: true,
  disarm: true,
  // Talking changes nothing the harness measures, so no style talks.
  talk: false,
  // Tactical Mind (#315) trades a Second Wind's healing for a check: the
  // harness keeps every use for healing, so the gate stays a lower bound.
  "tactical-mind": false,
  // A short rest (#334), taken below the style's heal threshold.
  rest: true,
  // A long rest at a rest site (#335), taken below the heal threshold
  // before a short rest.
  "long-rest": true,
  // A caster heals with its healing spells before potions (#339); a
  // Wizard (#340) casts Mage Armor before its first fight and answers a hit
  // with Shield; a caster attacks with a cantrip, and casts levelled damage
  // and control spells by its casting policy (#348).
  cast: true,
  // A Pearl of Power, outside a fight, as soon as a slot is spent (#538).
  "regain-slot": true,
  // Gear changes are never needed to get through, so no style makes one.
  equip: false,
  unequip: false,
  swap: false,
  drop: false,
  // Trading only spends what the character found, so no style trades.
  buy: false,
  sell: false,
  "sell-equipped": false,
  "sell-treasure": false,
  leave: true,
};

/** The kinds of action only the retreat style plays (#396), when low. */
const RETREAT_ACTIONS: readonly ActionKind[] = ["disengage", "flee"];

/** The kinds of action only the use-room style plays (#402). */
const ROOM_ACTIONS: readonly ActionKind[] = ["use-feature"];

/** The kinds of action the harness asks the runtime to project. */
const CHOSEN_ACTIONS: ReadonlySet<ActionKind> = new Set(
  (Object.keys(PLAYED_ACTIONS) as ActionKind[]).filter(
    (kind) =>
      PLAYED_ACTIONS[kind] &&
      !RETREAT_ACTIONS.includes(kind) &&
      !ROOM_ACTIONS.includes(kind),
  ),
);

/** What the retreat style projects in a fight below its heal threshold. */
const RETREATING_ACTIONS: ReadonlySet<ActionKind> = new Set([
  ...CHOSEN_ACTIONS,
  ...RETREAT_ACTIONS,
]);

/**
 * The effects of the levelled spells the casting policies (#348) cast in a
 * fight: damage, and control (Sleep, Hold Person). Buffs other than Mage
 * Armor and Shield, curses, Slow and restoration are never cast.
 */
const POLICY_EFFECTS: ReadonlySet<SpellDefinition["effect"]["kind"]> = new Set([
  "attack",
  "save",
  "auto-hit",
  "guardians",
  "spectral-weapon",
  "drain",
  "control",
]);

/**
 * The kinds of spell a style may cast, each chosen by the policy that names
 * it below: a healing spell (#339), Shield answering a hit and Mage Armor
 * before the first fight, a damaging cantrip (#340; Sacred Flame's save,
 * #348), and a levelled damage or control spell (#348).
 */
const CAST_SPELLS = {
  healing: (spell: SpellDefinition) => spell.effect.kind === "healing",
  shield: (spell: SpellDefinition) =>
    spell.castingTime === "reaction" &&
    spell.effect.kind === "buff" &&
    spell.effect.buff.kind === "armor-class",
  ward: (spell: SpellDefinition) =>
    spell.effect.kind === "buff" &&
    spell.effect.buff.kind === "base-armor-class",
  cantrip: (spell: SpellDefinition) =>
    spell.level === 0 &&
    (spell.effect.kind === "attack" || spell.effect.kind === "save"),
  levelled: (spell: SpellDefinition) =>
    spell.level > 0 && POLICY_EFFECTS.has(spell.effect.kind),
} as const;

/**
 * The spells the harness asks the runtime to project (#347): those
 * `CAST_SPELLS` may choose. Dry-running every other cast at every step was
 * most of a caster's gate time.
 */
const CHOSEN_SPELLS: ReadonlySet<SpellId> = new Set(
  (Object.keys(SPELLS) as SpellId[]).filter((id) =>
    Object.values(CAST_SPELLS).some((chosen) => chosen(SPELLS[id])),
  ),
);

/**
 * The kinds of action only a heal takes, which every style takes only below
 * its heal threshold: no other choice reads them, so above it the harness
 * doesn't ask the runtime to project them, nor its healing spells (#347).
 */
const HEALING_ACTIONS: readonly ActionKind[] = [
  "use",
  "second-wind",
  "preserve-life",
  "rest",
  "long-rest",
];

/** The kinds of action the harness projects above its heal threshold. */
const UNHURT_ACTIONS: ReadonlySet<ActionKind> = new Set(
  [...CHOSEN_ACTIONS].filter((kind) => !HEALING_ACTIONS.includes(kind)),
);

/** What the use-room style (#402) projects in a fight, hurt or not. */
const ROOM_FIGHT_ACTIONS: Readonly<
  Record<"hurt" | "unhurt", ReadonlySet<ActionKind>>
> = {
  hurt: new Set([...CHOSEN_ACTIONS, ...ROOM_ACTIONS]),
  unhurt: new Set([...UNHURT_ACTIONS, ...ROOM_ACTIONS]),
};

/** Whether a module offers a fight action anywhere (#402). */
export const hasFightActions = (adventure: FifthAdventure): boolean =>
  adventure.rooms.some(({ features }) =>
    features.some(({ fightAction }) => fightAction !== undefined),
  );

/**
 * The spells the harness projects above its heal threshold, by casting
 * policy: conserving, no levelled damage or control spell (#348).
 */
const UNHURT_SPELLS: Readonly<Record<CastingPolicy, ReadonlySet<SpellId>>> = {
  conserve: new Set(
    [...CHOSEN_SPELLS].filter(
      (id) =>
        !CAST_SPELLS.healing(SPELLS[id]) && !CAST_SPELLS.levelled(SPELLS[id]),
    ),
  ),
  "spend-early": new Set(
    [...CHOSEN_SPELLS].filter((id) => !CAST_SPELLS.healing(SPELLS[id])),
  ),
};

/**
 * The kinds of action exploring looks at first (#347): answering a
 * reaction, Mage Armor, and finding something: examining what is here and
 * not yet examined (`EXAMINING`, #410), taking, using an item on a
 * feature. Only when it takes none of them does the harness project the
 * rest.
 */
const FIRST_ACTIONS: ReadonlySet<ActionKind> = new Set([
  "react",
  "cast",
  "take",
  "use-on",
]);
const EXAMINING: ReadonlySet<ActionKind> = new Set(["examine"]);

/** The spells exploring looks at first: Mage Armor, before the first fight. */
const WARD_SPELLS: ReadonlySet<SpellId> = new Set(
  [...CHOSEN_SPELLS].filter((id) => CAST_SPELLS.ward(SPELLS[id])),
);

/**
 * What exploring looks at once it takes none of the first (#410), each set
 * only when its choice comes: below the heal threshold, the heals; for a
 * careful style, searching and disarming; then the way to the next room
 * on the path (sneaking in only for stealth-first), or leaving where the
 * way ends; and the door's ways through only when no move to the next
 * room is offered. A new kind a style takes while exploring must
 * be added to one of them, or the harness never sees it offered.
 */
const EXPLORE_HEALS: ReadonlySet<ActionKind> = new Set([
  "long-rest",
  "rest",
  "cast",
  "use",
]);
const EXPLORE_SEARCHES: ReadonlySet<ActionKind> = new Set(["search", "disarm"]);
const EXPLORE_REGAINS: ReadonlySet<ActionKind> = new Set(["regain-slot"]);
const EXPLORE_WAYS: ReadonlySet<ActionKind> = new Set(["move", "ambush"]);
const EXPLORE_WAYS_SNEAKING: ReadonlySet<ActionKind> = new Set([
  ...EXPLORE_WAYS,
  "sneak",
]);
/** Where the way on ends here: leaving, or an ambush. */
const EXPLORE_ENDS: ReadonlySet<ActionKind> = new Set(["ambush", "leave"]);
/** A door's ways through, in the order exploring tries them. */
const EXPLORE_DOORS_ORDER = ["unlock", "force", "pick", "break"] as const;
const EXPLORE_DOORS: ReadonlySet<ActionKind> = new Set(EXPLORE_DOORS_ORDER);
const NO_SPELLS: ReadonlySet<SpellId> = new Set();

/** The spells exploring looks at then: healing spells, below the threshold. */
const HEALING_SPELLS: ReadonlySet<SpellId> = new Set(
  [...CHOSEN_SPELLS].filter((id) => CAST_SPELLS.healing(SPELLS[id])),
);

/** The mean of `dice` dice of `sides` sides. */
const meanDice = ({ dice, sides }: Readonly<{ dice: number; sides: number }>) =>
  (dice * (sides + 1)) / 2;

/**
 * What a levelled damage cast is worth to the casting policies (#348): its
 * mean damage on each opponent it catches (`hp`, their hit points), no
 * more than the hit points each has, ignoring the attack roll or save.
 * Guardians, a spectral weapon and a draining touch count a second round's
 * damage too. A control spell, or a spell no policy casts, is worth 0:
 * control is chosen before damage (`castChoice`).
 */
export function castValue(
  spell: SpellDefinition,
  slotLevel: number | undefined,
  hp: readonly number[],
): number {
  const effect = effectAtSlot(spell, slotLevel);
  const each = (mean: number) =>
    hp.reduce((sum, left) => sum + Math.min(mean, left), 0);
  switch (effect.kind) {
    case "attack": {
      // Scorching Ray's rays (#343) split among the targets.
      const rays = effect.rays ?? 1;
      const perTarget =
        (meanDice(effect.damage) * rays) / hp.length +
        (effect.burst === undefined ? 0 : meanDice(effect.burst.damage)) +
        (effect.later === undefined ? 0 : meanDice(effect.later));
      return each(perTarget);
    }
    case "save":
      return each(meanDice(effect.damage));
    case "auto-hit":
      // Magic Missile's darts all go to one target (#336).
      return each(
        effect.missiles * (meanDice(effect.damage) + effect.damage.modifier),
      );
    case "guardians":
    case "spectral-weapon":
    case "drain":
      return each(2 * meanDice(effect.damage));
    default:
      return 0;
  }
}

/** One fight in a run. */
export type FightRecord = Readonly<{
  id: string;
  /** Hit points the character lost in the fight, before any healing. */
  hpLost: number;
  /** Opponents that fled (#237), giving half their XP or none. */
  fled: number;
  /** Opponents that surrendered (#238), giving half their XP or none. */
  surrendered: number;
  /** Conditions opponents' riders put on the character (#232), by kind. */
  conditions: Readonly<Partial<Record<ConditionKind, number>>>;
  rounds: number;
  /** A fight the retreat style fled (#396) is left unresolved. */
  outcome: "victory" | "defeat" | "fled";
}>;

/** A fight's record while it is under way, before its rounds and outcome. */
type FightTally = {
  -readonly [
    K in Exclude<keyof FightRecord, "rounds" | "outcome">
  ]: FightRecord[K];
};

/** One playthrough, to its ending. */
export type RunRecord = Readonly<{
  outcome: EndingKind;
  /** Rooms in the order first entered. */
  roomIds: readonly string[];
  encounters: readonly FightRecord[];
  /**
   * Healing: Second Winds, potions, short rests and hit dice (#334), long
   * rests and rests a wandering encounter interrupted (#335), and HP.
   */
  healing: Readonly<{
    secondWinds: number;
    potions: number;
    /** The potions among them drunk as Last Stand (#499). */
    lastStands: number;
    /** Healing spells cast (#339). */
    spells: number;
    shortRests: number;
    hitDice: number;
    longRests: number;
    interruptedRests: number;
    hp: number;
  }>;
  /** Spells the character cast, of any kind (#340). */
  spellsCast: number;
  /** Spell slots a Pearl of Power regained (#538). */
  slotsRegained: number;
  /**
   * Channel Divinity uses spent (#341): Turn Undead, Divine Spark and
   * Preserve Life.
   */
  channelDivinity: number;
  /** Hit points lost to traps sprung, outside the fights. */
  trapDamage: number;
  /** What a surviving ending credited: XP and how many finds of treasure or coin. */
  xp: number;
  treasure: number;
  actions: number;
  /** How many checks the run made (#285). */
  checks: number;
  /** How many fights the run slipped past and left unfought (#302). */
  bypassed: number;
  /** How many fights lurking opponents surprised the character in (#303). */
  surprised: number;
  /** How many encounters ended peacefully after a reaction roll (#304). */
  peaceful: number;
  /**
   * How many times the run's reaction policy decided its choice (#347):
   * none, and a run on the other policy is this run.
   */
  reactionChoices: number;
  /**
   * How many fight turns the run began below its heal threshold with no
   * heal to take (#396): where the retreat style might flee. None, and the
   * retreat run on its seed is this run.
   */
  retreatChances: number;
  /** How many fights the run fled (#396): only the retreat style flees. */
  fled: number;
  /**
   * How many fight actions the run used (#402): only the use-room style
   * uses one.
   */
  fightActions: number;
  /**
   * What raised the module's alarm (#401), as its card names it; absent
   * where the run never raised it.
   */
  alarm?: string;
  /**
   * How a surviving ending settles the character (what a career carries to
   * its next module, #290); absent after a defeat.
   */
  settlement?: Settlement;
}>;

/**
 * The checks a run has made, in order, each named as the validator names it
 * with the band it landed in and any passage that band closed: what a
 * stranded run names (#285).
 */
function checksMade(
  state: FifthState,
  siteChecks: ReadonlyMap<string, AuthoredCheck>,
): readonly string[] {
  return state.checks.map(({ id, band }) => {
    const split = id.indexOf(":");
    const kind = id.slice(0, split);
    const siteId = id.slice(split + 1);
    const site =
      kind === "examine"
        ? `feature ${siteId} check`
        : kind === "talk"
          ? `topic ${siteId} check`
          : kind === "disarm"
            ? `trap ${siteId} disarm`
            : kind === "search"
              ? `search of ${siteId}`
              : `door ${siteId} ${kind}`;
    const closed = effectsOf(siteChecks.get(id)?.bands?.[band]).flatMap(
      (effect) => (effect.type === "close" ? [effect.passage] : []),
    );
    return `${site} ${band}${closed.length === 0 ? "" : ` (closes passage ${closed.join(", ")})`}`;
  });
}

/**
 * Plays one run of `runtime`'s adventure in `style` with dice from `seed`,
 * starting as a browser session does, with `begin`, answering reaction rolls
 * (#304) by `reactions`, `attack` by default, and on a declared `route`
 * (#407), passing its rooms in order before the objective, or on a region
 * `sweep` (#408), visiting each of its rooms, the nearest not yet visited
 * next, before the objective, or else on the fewest-fights route. Throws a
 * `BalanceError`
 * when an opponent has a trait the engine does not apply (the run would not
 * be the fight a player meets), the runtime offers an action no style can
 * play, the run takes more than `stepLimit` actions, or it is stranded:
 * alive, with no action left that leads on or out.
 */
export function playAdventure(
  runtime: FifthRuntime,
  style: PlayStyle,
  seed: number,
  {
    stepLimit = 2000,
    reactions = "attack",
    casting = "conserve",
    route,
    sweep,
  }: Readonly<{
    stepLimit?: number;
    reactions?: ReactionPolicy;
    /** How a caster spends its slots (#348): `conserve` by default. */
    casting?: CastingPolicy;
    /** The declared route to follow (#407): the fewest-fights one if none. */
    route?: FifthRoute;
    /** The region sweep to make (#408), in place of a route. */
    sweep?: RegionSweep;
  }> = {},
): RunRecord {
  const { adventure } = runtime;
  for (const { opponents } of adventure.encounters) {
    for (const { name, statBlock } of opponents) {
      const [trait] = unsimulatedTraits(statBlock);
      if (trait !== undefined) {
        throw new BalanceError(
          "unsimulated-trait",
          `${adventure.id}: ${name}'s ${trait} is not simulated by the encounter engine.`,
        );
      }
    }
  }
  const { plan, roomById, fightIn, encounterAt } = routePlanner(adventure);
  const required = requiredRooms(adventure, sweep ?? route);
  /** The route's rooms (#407), each passed in turn before the objective. */
  const waypoints = route?.rooms ?? [];
  let passed = 0;
  /** The rooms a route or a sweep (#408) goes to next, if any. */
  const nextWaypoints = (): ReadonlySet<string> | undefined => {
    if (sweep !== undefined) {
      const left = sweep.rooms.filter((roomId) => !roomIds.includes(roomId));
      return left.length === 0 ? undefined : new Set(left);
    }
    return passed < waypoints.length
      ? new Set([waypoints[passed]!])
      : undefined;
  };
  const objective = objectiveOf(adventure);
  const winning = victoryRooms(adventure);
  const exits = exitRooms(adventure);
  const maxHp = characterProfile(runtime.sheet).maxHp;
  /** Each skill's check bonus, for choosing a parley's approach (#305). */
  const skillBonus = new Map<string, number>(
    characterProfile(runtime.sheet).skills.map(({ id, bonus }) => [id, bonus]),
  );
  const items = new Map(
    adventure.rooms.flatMap((room) =>
      room.items.map((item) => [item.id, { item, roomId: room.id }] as const),
    ),
  );
  /** The encounter and opponent carrying each item an opponent carries. */
  const carriers = new Map(
    [...items.values()].flatMap(({ item, roomId }) => {
      const encounter = adventure.encounters.find(
        ({ id }) => id === roomById.get(roomId)!.encounterId,
      );
      const carrier = encounter?.opponents.find(
        ({ id }) => id === item.hiddenIn,
      );
      return encounter === undefined || carrier === undefined
        ? []
        : [
            [
              item.id,
              { encounterId: encounter.id, opponentId: carrier.id },
            ] as const,
          ];
    }),
  );
  const random = createSeededRandom(seed);
  const siteChecks = new Map(
    authoredChecks(adventure).map((site) => [
      `${site.kind}:${site.id}`,
      site.check,
    ]),
  );

  let state = runtime.createSession();
  const roomIds = [state.roomId];
  const fights: FightRecord[] = [];
  let fight: FightTally | undefined;
  const healing = {
    secondWinds: 0,
    potions: 0,
    lastStands: 0,
    spells: 0,
    shortRests: 0,
    hitDice: 0,
    longRests: 0,
    interruptedRests: 0,
    hp: 0,
  };
  let trapDamage = 0;
  let spellsCast = 0;
  let reactionChoices = 0;
  let retreatChances = 0;
  let fightActions = 0;
  let slotsRegained = 0;
  /** The fights the run fled (#396), each fled once, and whether it is heading out. */
  const fledFrom: string[] = [];
  let retreating = false;
  let channelDivinity = 0;
  /** Whether a base-AC spell (Mage Armor, #340) was cast before a fight. */
  let warded = false;
  /** The character's hit points, so a blow costs only what was left. */
  let hp = state.character.hp;
  const blocked: string[] = [];
  let actions = 0;

  /** The round of the fight the character is fleeing (#396). */
  let fledRound = 0;
  /** What raised the module's alarm (#401), once something has. */
  let alarm: string | undefined;
  const apply = (action: FifthAction) => {
    actions += 1;
    fledRound = state.encounter?.round ?? 0;
    if (actions > stepLimit) {
      throw new BalanceError(
        "step-limit",
        `${adventure.id}: a ${style} run took more than ${stepLimit} actions.`,
      );
    }
    const result = runtime.handleAction(state, action, random);
    if (result.rejection !== undefined) {
      throw new Error(
        `The engine refused an action it offered: ${result.rejection.reason}`,
      );
    }
    state = result.state;
    if (!roomIds.includes(state.roomId)) {
      roomIds.push(state.roomId);
    }
    if (state.roomId === waypoints[passed]) {
      passed += 1;
    }
    for (const event of result.events) {
      switch (event.type) {
        case "initiative":
          fight = {
            // A wandering encounter (#335, #403) fights in a room not its
            // own.
            id: state.wandering ?? encounterAt(positionNow(), state.roomId)!,
            hpLost: 0,
            fled: 0,
            surrendered: 0,
            conditions: {},
          };
          break;
        case "alarm":
          alarm = event.cause;
          break;
        case "attack":
          if (event.targetId === PLAYER_ID) {
            fight!.hpLost += hp - event.hpAfter;
            hp = event.hpAfter;
          }
          break;
        case "fled":
          fight!.fled += 1;
          break;
        case "surrendered":
          fight!.surrendered += 1;
          break;
        case "condition":
          if (event.combatantId === PLAYER_ID) {
            fight!.conditions = {
              ...fight!.conditions,
              [event.kind]: (fight!.conditions[event.kind] ?? 0) + 1,
            };
          }
          break;
        case "second-wind":
          healing.secondWinds += 1;
          healing.hp += event.healing;
          hp = event.hpAfter;
          break;
        case "trap-damage":
          trapDamage += hp - event.hpAfter;
          hp = event.hpAfter;
          break;
        case "potion":
          healing.potions += 1;
          healing.lastStands += event.lastStand === true ? 1 : 0;
          healing.hp += event.healing;
          hp = event.hpAfter;
          break;
        case "spell-healing":
          // A caster's healing spell (#339), on itself.
          if (event.targetId === PLAYER_ID) {
            healing.spells += 1;
            healing.hp += event.healing;
            hp = event.hpAfter;
          }
          break;
        case "cast":
          if (event.combatantId === PLAYER_ID) {
            spellsCast += 1;
          }
          break;
        // Channel Divinity (#341); Preserve Life heals the character.
        case "turn-undead":
        case "divine-spark":
          channelDivinity += 1;
          break;
        case "preserve-life":
          channelDivinity += 1;
          healing.hp += event.healing;
          hp = event.hpAfter;
          break;
        case "short-rest":
          healing.shortRests += 1;
          break;
        case "long-rest":
          healing.longRests += 1;
          healing.hp += event.healing;
          hp = event.hpAfter;
          break;
        case "wandering-roll":
          // Only a rest is interrupted; moves and the alarm (#403) bring a
          // fight, counted like any other.
          healing.interruptedRests +=
            event.interrupted && event.rest !== undefined ? 1 : 0;
          break;
        case "hit-die":
          healing.hitDice += 1;
          healing.hp += event.healing;
          hp = event.hpAfter;
          break;
        case "ended":
          fights.push({
            ...fight!,
            rounds: state.encounter!.round,
            outcome: event.outcome,
          });
          fight = undefined;
          break;
        case "fled-fight":
          // The retreat style got away (#396): the fight stays unresolved.
          fights.push({ ...fight!, rounds: fledRound, outcome: "fled" });
          fledFrom.push(event.encounterId);
          fight = undefined;
          retreating = true;
          break;
        default:
          break;
      }
    }
  };

  const low = (hp: number) => hp < maxHp * HEAL_BELOW[style];
  /**
   * Whether the style takes a view: any but a retry (#284) whose damage
   * could leave the character low, so no run pays damage for try after
   * failed try until it falls.
   */
  const affordable = ({ action, target, retry }: ActionView) => {
    const cost = siteChecks.get(`${action}:${target?.id}`)?.retry?.cost;
    return (
      retry === undefined ||
      cost?.type !== "damage" ||
      !low(state.character.hp - (cost.dice * cost.sides + cost.modifier))
    );
  };
  const offered = (views: readonly ActionView[], kind: ActionKind) =>
    views.filter((view) => view.action === kind && affordable(view));
  /**
   * A caster's healing spells on itself (#339), what it heals with before
   * a potion: the lowest slot first; then, in a fight, a bonus-action spell
   * (Healing Word) first, which leaves the action to attack, and outside
   * one the most healing dice (Cure Wounds).
   */
  const healingSpells = (views: readonly ActionView[], fighting: boolean) => {
    const rank = (view: ActionView) => {
      const spell = SPELLS[view.spell!.id as SpellId];
      return fighting
        ? spell.castingTime === "bonus-action"
          ? 0
          : 1
        : spell.effect.kind === "healing"
          ? -spell.effect.healing.dice * spell.effect.healing.sides
          : 0;
    };
    return offered(views, "cast")
      .filter(
        ({ spell, target }) =>
          spell !== undefined &&
          isSpellId(spell.id) &&
          CAST_SPELLS.healing(SPELLS[spell.id]) &&
          target?.id === PLAYER_ID,
      )
      .sort(
        (a, b) =>
          (a.spell!.slotLevel ?? 0) - (b.spell!.slotLevel ?? 0) ||
          rank(a) - rank(b),
      );
  };

  /** Where the run stands now, for the route planner. */
  const positionNow = (roomId = state.roomId): Position => ({
    roomId,
    inventory: state.inventory,
    // An encounter ended peacefully (#304) has no fight left, like one won.
    clearedEncounterIds: [
      ...state.clearedEncounterIds,
      ...state.peacefulEncounterIds,
    ],
    blockedPassageIds: blocked,
    lostKeyIds: lostKeys().map(({ id }) => id),
    flags: state.flags,
    visitedRoomIds: roomIds,
    examinedFeatureIds: state.examinedFeatureIds,
    takenItemIds: [...state.inventory, ...state.usedItemIds],
    met: state.metEncounters ?? [],
    usedOpen: openedByUses(adventure, state.featureUses ?? []),
  });
  /** The way to an exit room from `position` through no fight (#396). */
  const safeWayOut = (position: Position) =>
    fightIn(position, position.roomId)
      ? undefined
      : plan(position, exits, (id) => !fightIn(position, id));
  /**
   * The retreat style's flight (#396): Disengage when offered, else the
   * flight to the way out with the shortest safe way on to an exit room.
   * None from a fight it fled before, or with no safe way out.
   */
  const retreatChoice = (
    views: readonly ActionView[],
    encounter: EncounterState,
  ): ActionView | undefined => {
    const fightId =
      state.wandering ?? encounterAt(positionNow(), state.roomId)!;
    if (encounter.pendingReaction !== undefined || fledFrom.includes(fightId)) {
      return undefined;
    }
    const ways = offered(views, "flee").flatMap((view) => {
      const path = safeWayOut(positionNow(view.target!.id));
      return path === undefined ? [] : [{ view, length: path.length }];
    });
    if (ways.length === 0) {
      return undefined;
    }
    const disengage = offered(views, "disengage")[0];
    return (
      disengage ??
      ways.reduce((best, way) => (way.length < best.length ? way : best)).view
    );
  };

  /** The fight action to take now. */
  const fightChoice = (views: readonly ActionView[]): ActionView => {
    const encounter = state.encounter!;
    // Uncanny Dodge (#308): the harness halves every hit it can; else a
    // reaction spell (Shield, #340) answers it, at the lowest slot, but
    // only when its AC bonus turns the hit into a miss.
    const dodge = offered(views, "uncanny-dodge")[0];
    if (dodge !== undefined) {
      return dodge;
    }
    const pending = encounter.pendingReaction;
    // Last Stand (#499): the harness always drinks, the first potion offered.
    if (pending?.kind === "last-stand") {
      return offered(views, "use")[0]!;
    }
    if (pending !== undefined) {
      const turnsHit = (bonus: number) =>
        pending.roll.d20 < pending.weapon.criticalRange &&
        pending.roll.total <
          armorClassOf(combatant(encounter, PLAYER_ID)) + bonus;
      const shield = offered(views, "cast")
        .filter(({ spell }) => {
          if (!isSpellId(spell?.id)) {
            return false;
          }
          const { effect } = SPELLS[spell.id];
          return (
            CAST_SPELLS.shield(SPELLS[spell.id]) &&
            effect.kind === "buff" &&
            effect.buff.kind === "armor-class" &&
            turnsHit(effect.buff.bonus)
          );
        })
        .sort(
          (a, b) => (a.spell!.slotLevel ?? 0) - (b.spell!.slotLevel ?? 0),
        )[0];
      return shield ?? offered(views, "take-hit")[0]!;
    }
    const hpOf = (id: string) => combatant(encounter, id).hp;
    // Preserve Life (#341) heals after the spells, before a potion.
    const heal = [
      ...healingSpells(views, true),
      ...offered(views, "second-wind"),
      ...offered(views, "preserve-life"),
      ...offered(views, "use"),
    ][0];
    if (heal !== undefined && low(hpOf(PLAYER_ID))) {
      return heal;
    }
    // Low with no heal to take, the retreat style flees (#396): Disengage
    // first when it has it, then the way out toward the nearest exit room.
    if (low(hpOf(PLAYER_ID))) {
      retreatChances += 1;
      const flight =
        style === "retreat" ? retreatChoice(views, encounter) : undefined;
      if (flight !== undefined) {
        return flight;
      }
    }
    // The use-room style (#402) uses the room whenever it can, against the
    // opponent with the most hit points left.
    const room = offered(views, "use-feature").reduce<ActionView | undefined>(
      (best, view) =>
        best === undefined || hpOf(view.target!.id) > hpOf(best.target!.id)
          ? view
          : best,
      undefined,
    );
    if (room !== undefined) {
      fightActions += 1;
      return room;
    }
    // The Cleric policy (#341): Turn Undead whenever an undead foe is left
    // to turn; turned foes are attacked only once every foe is turned, so
    // the rest stay out of the fight.
    const turn = offered(views, "turn-undead")[0];
    if (turn !== undefined) {
      return turn;
    }
    // Kept out of the fight by the character's control (#348): turned, or
    // asleep (damage wakes it); a held foe is still attacked.
    const turned = (id: string) =>
      (combatant(encounter, id).effects ?? []).some(
        ({ buff }) => buff.kind === "control" && buff.by !== "hold",
      );
    const untouched = (list: readonly ActionView[]) => {
      const active = list.filter(({ target }) => !turned(target!.id));
      return active.length > 0 ? active : list;
    };
    // Plain attacks; Cunning Strike's (#308) are chosen below.
    const plain = (kind: ActionKind) =>
      untouched(
        offered(views, kind).filter(
          ({ cunningStrike }) => cunningStrike === undefined,
        ),
      );
    // The weakest opponent first; ties go to the first listed.
    const attack = plain("attack").reduce<ActionView | undefined>(
      (best, view) =>
        best === undefined || hpOf(view.target!.id) < hpOf(best.target!.id)
          ? view
          : best,
      undefined,
    );
    // The Light extra attack follows an attack, on the weakest opponent too.
    const light = plain("light-attack").reduce<ActionView | undefined>(
      (best, view) =>
        best === undefined || hpOf(view.target!.id) < hpOf(best.target!.id)
          ? view
          : best,
      undefined,
    );
    // A Rogue's bonus action (#307): Steady Aim before an attack, unless
    // already hidden, or else Hide before the action's attack (never before
    // a Light extra attack, which may need the bonus action), for the
    // advantage and so Sneak Attack; Hide after the attacks too, for the
    // next turn's first.
    const hidden = encounter.hidden.includes(PLAYER_ID);
    const aim =
      attack === undefined && light === undefined
        ? undefined
        : ((hidden ? undefined : offered(views, "steady-aim")[0]) ??
          (attack === undefined ? undefined : offered(views, "hide")[0]));
    // Cunning Strike (#308): Poison a target not yet poisoned, or else
    // Trip one not prone, whenever the engine offers it with the attack.
    const struck = (view: ActionView | undefined) => {
      if (view === undefined) {
        return undefined;
      }
      const has = (kind: ConditionKind) =>
        encounter.conditions.some(
          (condition) =>
            condition.targetId === view.target!.id && condition.kind === kind,
        );
      const strike = (id: string) =>
        offered(views, view.action).find(
          ({ target, cunningStrike }) =>
            target!.id === view.target!.id && cunningStrike?.id === id,
        );
      return (
        (has("poisoned") ? undefined : strike("poison")) ??
        (has("prone") ? undefined : strike("trip")) ??
        view
      );
    };
    // A caster's attack cantrip (#340) on the weakest opponent, ahead of a
    // weapon: a ranged one in the opening volley, then a melee one, which
    // has no close-combat disadvantage.
    const ranged = (view: ActionView) =>
      (SPELLS[view.spell!.id as SpellId].effect as { range?: string }).range ===
      "ranged";
    const cantrips = untouched(
      offered(views, "cast").filter(
        ({ spell, target }) =>
          isSpellId(spell?.id) &&
          CAST_SPELLS.cantrip(SPELLS[spell.id]) &&
          target !== undefined,
      ),
    );
    const opening = encounter.round === 1;
    const preferred = cantrips.filter((view) => ranged(view) === opening);
    const cantrip = (preferred.length > 0 ? preferred : cantrips).reduce<
      ActionView | undefined
    >(
      (best, view) =>
        best === undefined || hpOf(view.target!.id) < hpOf(best.target!.id)
          ? view
          : best,
      undefined,
    );
    // Divine Spark's radiant damage (#341) on the weakest foe left
    // untouched, while it leaves a use of Channel Divinity for Turn Undead
    // or Preserve Life.
    const uses = combatant(encounter, PLAYER_ID).channelDivinity?.uses ?? 0;
    const spark =
      uses > 1
        ? untouched(
            offered(views, "divine-spark").filter(
              ({ mode }) => mode === "radiant",
            ),
          ).reduce<ActionView | undefined>(
            (best, view) =>
              best === undefined ||
              hpOf(view.target!.id) < hpOf(best.target!.id)
                ? view
                : best,
            undefined,
          )
        : undefined;
    /**
     * The casting policies' levelled spell (#348) of `casts`: with two or
     * more foes left untouched, a control spell on the one with the most
     * hit points; else the damage cast worth most (`castValue`), the higher
     * slot on a tie. While concentrating, no concentration spell.
     */
    const castChoice = (
      casts: readonly ActionView[],
    ): ActionView | undefined => {
      const concentrating =
        concentrationOf(encounter.combatants, PLAYER_ID) !== undefined;
      const usable = casts.filter(({ spell }) => {
        const { effect } = SPELLS[spell!.id as SpellId];
        return !(
          concentrating &&
          "concentration" in effect &&
          effect.concentration === true
        );
      });
      const standing = legalTargets(encounter, PLAYER_ID).filter(
        ({ id }) => !turned(id),
      );
      if (standing.length >= 2) {
        const control = usable
          .filter(({ spell, target }) => {
            const { effect } = SPELLS[spell!.id as SpellId];
            // Never at a foe immune to it (Sleep at an undead).
            return (
              effect.kind === "control" &&
              target !== undefined &&
              !turned(target.id) &&
              combatant(encounter, target.id).conditionImmunities?.includes(
                effect.immunity,
              ) !== true
            );
          })
          .reduce<ActionView | undefined>(
            (best, view) =>
              best === undefined ||
              hpOf(view.target!.id) > hpOf(best.target!.id)
                ? view
                : best,
            undefined,
          );
        if (control !== undefined) {
          return control;
        }
      }
      let best: Readonly<{ view: ActionView; value: number }> | undefined;
      for (const view of usable) {
        const spell = SPELLS[view.spell!.id as SpellId];
        const { slotLevel } = view.spell!;
        const caught =
          view.targets === undefined
            ? [view.target!.id]
            : view.targets
                .slice(0, maxTargets(spell, slotLevel))
                .map(({ id }) => id);
        const value = castValue(spell, slotLevel, caught.map(hpOf));
        if (
          value > 0 &&
          (best === undefined ||
            value > best.value ||
            (value === best.value &&
              (slotLevel ?? 0) > (best.view.spell!.slotLevel ?? 0)))
        ) {
          best = { view, value };
        }
      }
      return best?.view;
    };
    // A spiritual weapon's bonus-action attack and a draining touch's
    // action (#348), kept going on the weakest foe left untouched.
    const weakest = (list: readonly ActionView[]) =>
      untouched(list).reduce<ActionView | undefined>(
        (best, view) =>
          best === undefined || hpOf(view.target!.id) < hpOf(best.target!.id)
            ? view
            : best,
        undefined,
      );
    const spectral = weakest(offered(views, "spectral-attack"));
    const drain = weakest(offered(views, "drain-attack"));
    // A levelled damage or control spell (#348): always when spending
    // early; conserving, only low with no heal left.
    const levelled =
      casting === "spend-early" || (heal === undefined && low(hpOf(PLAYER_ID)))
        ? castChoice(
            offered(views, "cast").filter(
              ({ spell, target }) =>
                isSpellId(spell?.id) &&
                CAST_SPELLS.levelled(SPELLS[spell.id]) &&
                (target === undefined || !turned(target.id)),
            ),
          )
        : undefined;
    return (
      spectral ??
      levelled ??
      drain ??
      aim ??
      spark ??
      cantrip ??
      struck(attack) ??
      struck(light) ??
      offered(views, "action-surge")[0] ??
      offered(views, "hide")[0] ??
      offered(views, "end-turn")[0]!
    );
  };

  /** Whether the character carries loot: treasure, or coin found here. */
  const carriesLoot = () =>
    state.inventory.some((id) => items.get(id)!.item.kind === "treasure") ||
    state.usedItemIds.some((id) => items.get(id)!.item.kind === "coin");
  /**
   * How an item an opponent carries left with it (#324), if it did: the
   * opponent fled (#237) or surrendered (#238; no style talks, so it never
   * hands the item over), or its encounter ended peacefully (#304), so no
   * body is left to search.
   */
  const carrierGone = (itemId: string): string | undefined => {
    const carrier = carriers.get(itemId);
    if (carrier === undefined) {
      return undefined;
    }
    const left = ({ encounterId, opponentId }: LeftFight) =>
      encounterId === carrier.encounterId && opponentId === carrier.opponentId;
    const how = state.peacefulEncounterIds.includes(carrier.encounterId)
      ? "let the character pass"
      : state.fledOpponents.some(left)
        ? "fled"
        : state.surrenderedOpponents.some(left)
          ? "surrendered"
          : undefined;
    return how === undefined
      ? undefined
      : `its carrier ${carrier.opponentId} ${how}`;
  };
  /**
   * Why an item can no longer be found, if it can't: its carrier left
   * without a body (#324), or it is hidden in a feature with a check that is
   * made, and the band of its last try (#284) did not reveal the item (#285).
   */
  const whyLost = (itemId: string, hiddenIn: string | undefined) => {
    const gone = carrierGone(itemId);
    if (gone !== undefined) {
      return gone;
    }
    const made = state.checks.findLast(
      ({ id }) => id === `examine:${hiddenIn}`,
    );
    return made === undefined ||
      effectsOf(siteChecks.get(made.id)?.bands?.[made.band]).some(
        (effect) => effect.type === "item" && effect.item === itemId,
      )
      ? undefined
      : `feature ${hiddenIn} check ${made.band} did not reveal it`;
  };
  /** The keys to doors only a key opens. */
  const doorKeyIds = new Set(
    adventure.passages.flatMap((passage) =>
      keyOnly(passage) && passage.door?.keyItemId !== undefined
        ? [passage.door.keyItemId]
        : [],
    ),
  );
  /**
   * The keys to doors only a key opens that are not carried and can no
   * longer be found (#331), and why.
   */
  const lostKeys = () =>
    [...items.values()].flatMap(({ item }) => {
      const why =
        doorKeyIds.has(item.id) && !state.inventory.includes(item.id)
          ? whyLost(item.id, item.hiddenIn)
          : undefined;
      return why === undefined ? [] : [{ id: item.id, why }];
    });
  /** Where the objective lies from here. */
  const objectiveRooms = (): ReadonlySet<string> => {
    if (objective === "victory") {
      return winning;
    }
    const unfound = new Set(
      [...items.values()].flatMap(({ item, roomId }) =>
        LOOT_KINDS.includes(item.kind) &&
        !state.inventory.includes(item.id) &&
        !state.usedItemIds.includes(item.id) &&
        whyLost(item.id, item.hiddenIn) === undefined
          ? [roomId]
          : [],
      ),
    );
    return objective === "escape-with-loot" &&
      !carriesLoot() &&
      unfound.size > 0
      ? unfound
      : exits;
  };
  /** Rooms the style looks into before heading for the objective. */
  const detours = (position: Position): ReadonlySet<string> =>
    new Set(
      style === "avoid-optional"
        ? []
        : adventure.rooms.flatMap(({ id }) =>
            !roomIds.includes(id) &&
            !winning.has(id) &&
            (style === "direct" || !fightIn(position, id))
              ? [id]
              : [],
          ),
    );

  /**
   * The exploring action to take now, or undefined when there is none,
   * from the actions `project` offers of the kinds and spells asked for.
   */
  const exploreChoice = (
    project: (
      kinds: ReadonlySet<ActionKind>,
      spells: ReadonlySet<SpellId>,
      targets?: ReadonlySet<string>,
    ) => readonly ActionView[],
  ): ActionView | undefined => {
    const room = roomById.get(state.roomId)!;
    const here = encounterAt(positionNow(), state.roomId);
    const searchable = new Set([
      ...room.features.map(({ id }) => id),
      ...(adventure.encounters
        .find(({ id }) => id === here)
        ?.opponents.map(({ id }) => id) ?? []),
    ]);
    const first = project(
      FIRST_ACTIONS,
      !warded && fights.length === 0 ? WARD_SPELLS : NO_SPELLS,
    );
    // Facing a reaction (#304), the policy's kind of option if offered. A
    // toll is offered (enabled) only when the purse holds it.
    const answers = offered(first, "react");
    if (answers.length > 0) {
      const of = (option: ReactionOption) =>
        answers.filter(({ target }) => target!.id === option);
      // The parley approach with the best margin over its DC (#305).
      const margin = ({ approach }: ActionView) =>
        skillBonus.get(approach!.id)! - approach!.dc!;
      const parley = of("parley").reduce<ActionView | undefined>(
        (best, view) =>
          best === undefined || margin(view) > margin(best) ? view : best,
        undefined,
      );
      const peaceful = [
        ...PEACEFUL_OPTIONS.flatMap(of),
        ...(parley === undefined ? [] : [parley]),
      ];
      const attack = of("attack");
      const [taken, otherwise] =
        reactions === "peaceful"
          ? [peaceful[0] ?? attack[0], attack[0] ?? peaceful[0]]
          : [attack[0] ?? peaceful[0], peaceful[0] ?? attack[0]];
      if (taken !== otherwise) {
        reactionChoices += 1;
      }
      return taken;
    }
    // A Wizard's Mage Armor (#340), once, outside a fight before its first:
    // a base-AC spell on itself that outlasts a fight.
    if (!warded && fights.length === 0) {
      const ward = offered(first, "cast").find(
        ({ spell, target }) =>
          isSpellId(spell?.id) &&
          target?.id === PLAYER_ID &&
          CAST_SPELLS.ward(SPELLS[spell.id]),
      );
      if (ward !== undefined) {
        warded = true;
        return ward;
      }
    }
    // A Pearl of Power (#538), as soon as a slot is spent outside a fight.
    if (
      state.possessions.magicItems.some(
        (item) => slotRegain(item) !== undefined,
      )
    ) {
      const regain = offered(
        project(EXPLORE_REGAINS, NO_SPELLS),
        "regain-slot",
      )[0];
      if (regain !== undefined) {
        slotsRegained += 1;
        return regain;
      }
    }
    // Only what is here and not yet examined is projected (#410): once
    // everything is, nothing.
    const unexamined = new Set(
      [...searchable].filter((id) => !state.examinedFeatureIds.includes(id)),
    );
    const find =
      (unexamined.size === 0
        ? undefined
        : offered(project(EXAMINING, NO_SPELLS, unexamined), "examine").find(
            ({ target }) => unexamined.has(target!.id),
          )) ??
      offered(first, "take")[0] ??
      // An item a feature here accepts is used on it before leaving (#400).
      offered(first, "use-on")[0];
    if (find !== undefined) {
      return find;
    }
    // Then each kind only when the choice comes to it (#410): a heal when
    // low, a careful style's search, then the way on, and a door's ways
    // through only when no move is offered.
    if (low(state.character.hp)) {
      const heals = project(EXPLORE_HEALS, HEALING_SPELLS);
      // Low, a long rest at a rest site (#335), then a short rest (#334),
      // then a healing spell (#339), before a potion, which also heals in
      // a fight.
      const heal = [
        ...offered(heals, "long-rest"),
        ...offered(heals, "rest"),
        ...healingSpells(heals, false),
        ...offered(heals, "use"),
      ][0];
      if (heal !== undefined) {
        return heal;
      }
    }
    if (CAREFUL.includes(style)) {
      const searches = project(EXPLORE_SEARCHES, NO_SPELLS);
      const careful = [
        ...offered(searches, "search"),
        ...offered(searches, "disarm"),
      ][0];
      if (careful !== undefined) {
        return careful;
      }
    }
    // A route's next room (#407), or a sweep's (#408), comes before the
    // objective.
    const goal = retreating ? exits : (nextWaypoints() ?? objectiveRooms());
    const lostKeyIds = lostKeys().map(({ id }) => id);
    for (;;) {
      const position: Position = {
        roomId: state.roomId,
        inventory: state.inventory,
        // An encounter ended peacefully (#304) has no fight left, like one won.
        clearedEncounterIds: [
          ...state.clearedEncounterIds,
          ...state.peacefulEncounterIds,
        ],
        blockedPassageIds: blocked,
        lostKeyIds,
        flags: state.flags,
        visitedRoomIds: roomIds,
        examinedFeatureIds: state.examinedFeatureIds,
        takenItemIds: [...state.inventory, ...state.usedItemIds],
        met: state.metEncounters ?? [],
        usedOpen: openedByUses(adventure, state.featureUses ?? []),
      };
      const enterable = (targets: ReadonlySet<string>) => (id: string) =>
        (!winning.has(id) || targets.has(id)) &&
        (style === "direct" ||
          required.has(id) ||
          (CAREFUL.includes(style) && !fightIn(position, id)));
      // Having fled (#396), the retreat style heads out the safe way, or
      // else as it would have.
      const safe = retreating ? safeWayOut(position) : undefined;
      const aside = retreating ? new Set<string>() : detours(position);
      // Avoiding optional rooms, once a flag has closed the required way
      // (#401: the alarm's grate), the style goes round by any room.
      const roundabout =
        style === "avoid-optional"
          ? (id: string) => !winning.has(id) || goal.has(id)
          : undefined;
      const path =
        safe ??
        plan(position, aside, enterable(aside)) ??
        plan(position, goal, enterable(goal)) ??
        (roundabout === undefined
          ? undefined
          : plan(position, goal, roundabout)) ??
        plan(position, exits, enterable(exits));
      // Detours first; then, once the goal is a way out and it is reached,
      // leave (if this room is no exit, nothing is left to do). Unseen where
      // the goal is anything but a way out, spring an ambush (#302).
      if (path === undefined || path.length < 2) {
        const ends = project(EXPLORE_ENDS, NO_SPELLS);
        const ambush = offered(ends, "ambush")[0];
        return ambush === undefined || goal === exits
          ? (offered(ends, "leave")[0] ?? ambush)
          : ambush;
      }
      const next = path[1]!;
      // Only the way to the next room is tried (#410), and an ambush here.
      const views = project(
        style === "stealth-first" ? EXPLORE_WAYS_SNEAKING : EXPLORE_WAYS,
        NO_SPELLS,
        new Set([next, state.roomId]),
      );
      const ambush = offered(views, "ambush")[0];
      // Stealth-first sneaks into each fight it can (#302).
      const sneak =
        style === "stealth-first"
          ? offered(views, "sneak").find(({ target }) => target!.id === next)
          : undefined;
      const move =
        sneak ??
        offered(views, "move").find(({ target }) => target!.id === next);
      if (move !== undefined) {
        return move;
      }
      // Unseen, nothing opens a door without giving the character away.
      if (ambush !== undefined) {
        return ambush;
      }
      const passage = passageBetween(adventure, state.roomId, next);
      const doors =
        passage.door === undefined
          ? []
          : project(EXPLORE_DOORS, NO_SPELLS, new Set([passage.door.id]));
      const opening = EXPLORE_DOORS_ORDER.flatMap((kind) =>
        offered(doors, kind),
      ).find(({ target }) => target!.id === passage.door?.id);
      if (opening !== undefined) {
        return opening;
      }
      // Every way through the door has failed: plan around it.
      blocked.push(passage.id);
    }
  };

  /**
   * The actions the runtime offers now of `kinds` and casting `spells`
   * (#321, #347): the harness never asks it to dry-run one it would pass
   * over.
   */
  const project = (
    kinds: ReadonlySet<ActionKind>,
    spells: ReadonlySet<SpellId>,
    targets?: ReadonlySet<string>,
  ): readonly ActionView[] => {
    const projected = runtime.projectActions(state, kinds, spells, targets);
    const unknown = projected.find(
      ({ action }) => !Object.hasOwn(PLAYED_ACTIONS, action),
    );
    if (unknown !== undefined) {
      throw new BalanceError(
        "unsupported-action",
        `${adventure.id}: the harness can't play the ${unknown.action} action.`,
      );
    }
    return projected.filter(({ available }) => available);
  };

  apply({ type: "begin" });
  while (state.status === "playing") {
    const fighting = state.encounter?.outcome === "ongoing";
    // Above the heal threshold, no heal is projected: none would be taken.
    const hurt = fighting && low(combatant(state.encounter!, PLAYER_ID).hp);
    const choice = fighting
      ? fightChoice(
          project(
            style === "use-room"
              ? ROOM_FIGHT_ACTIONS[hurt ? "hurt" : "unhurt"]
              : hurt
                ? style === "retreat"
                  ? RETREATING_ACTIONS
                  : CHOSEN_ACTIONS
                : UNHURT_ACTIONS,
            hurt ? CHOSEN_SPELLS : UNHURT_SPELLS[casting],
          ),
        )
      : exploreChoice(project);
    if (choice === undefined) {
      const made = checksMade(state, siteChecks);
      const keys = lostKeys().map(({ id, why }) => `key ${id} lost (${why})`);
      throw new BalanceError(
        "stranded",
        `${adventure.id}: a ${style} run${runtime.checks === "seeded" ? "" : ` with ${runtime.checks} checks`} was stranded in ${state.roomId}${made.length === 0 ? "" : `, after ${made.join(", ")}`}${keys.length === 0 ? "" : `, with ${keys.join(", ")}`}.`,
      );
    }
    apply(runtime.actionOf(choice)!);
  }
  const ending = adventure.endings.find(({ id }) => id === state.endingId)!;
  const settlement = runtime.projectSettlement(state);
  return {
    outcome: ending.kind,
    roomIds,
    encounters: fights,
    healing,
    spellsCast,
    slotsRegained,
    channelDivinity,
    trapDamage,
    xp: settlement?.xp.reduce((sum, { xp }) => sum + xp, 0) ?? 0,
    treasure:
      settlement === undefined
        ? 0
        : settlement.finds.length + settlement.coin.length,
    actions,
    checks: state.checks.length,
    bypassed: state.bypassedEncounterIds.length,
    surprised: state.lurks.filter(({ roll }) => roll.success).length,
    peaceful: state.peacefulEncounterIds.length,
    reactionChoices,
    retreatChances,
    fled: fledFrom.length,
    fightActions,
    ...(alarm === undefined ? {} : { alarm }),
    ...(settlement === undefined ? {} : { settlement }),
  };
}

/**
 * What a qualification plays. The defaults are the run `verify` makes:
 * seeds 0–199, the 5th and 95th percentile characters and every style.
 */
export type BalanceOptions = Readonly<{
  seeds?: readonly number[];
  percentiles?: readonly number[];
  styles?: readonly PlayStyle[];
  /** How many creations the percentile characters are drawn from. */
  sampleSize?: number;
  sampleSeed?: number;
  /** The most actions one run may take before it fails as `step-limit`. */
  stepLimit?: number;
  /** How checks are graded (#285): `seeded` by default. */
  checks?: CheckPolicy;
  /** The class played (#310): the harness's class, the Fighter, unless named. */
  classId?: ClassId;
}>;

export const DEFAULT_SEED_COUNT = 200;
export const DEFAULT_PERCENTILES = [5, 95] as const;

/** One fight, over the runs that reached it. */
export type FightMetrics = Readonly<{
  id: string;
  runs: number;
  meanHpLost: number;
  meanRounds: number;
  /** The share of those runs the character lost the fight. */
  defeatRate: number;
}>;

/** Metrics for one level, character percentile and style. */
export type BalanceCell = Readonly<{
  level: Level;
  percentile: number;
  style: PlayStyle;
  runs: number;
  /** Runs the character came through alive. */
  survivalRate: number;
  /** Runs that reached the objective. */
  completionRate: number;
  outcomes: Readonly<Partial<Record<RunRecord["outcome"], number>>>;
  encounters: readonly FightMetrics[];
  healing: Readonly<{
    meanSecondWinds: number;
    meanPotions: number;
    /** Healing spells cast (#339). */
    meanSpells: number;
    /** Short rests taken (#334). */
    meanShortRests: number;
    /** Long rests taken, and rests interrupted (#335). */
    meanLongRests: number;
    meanInterruptedRests: number;
    meanHp: number;
  }>;
  meanTrapDamage: number;
  meanXp: number;
  meanTreasure: number;
  /** Fights slipped past and left unfought, a run (#302). */
  meanBypassed: number;
  /** Fights fled, a run (#396): only the retreat style flees. */
  meanFled: number;
  /** Fight actions used, a run (#402): only the use-room style uses them. */
  meanFightActions: number;
  /** Each opponent, and the chance one attack kills it from full HP. */
  oneHitKill: readonly Readonly<{
    encounterId: string;
    opponentId: string;
    name: string;
    chance: number;
  }>[];
}>;

export type BalanceReport = Readonly<{
  adventureId: string;
  /** The class the report plays (#310). */
  classId: ClassId;
  /** The check policy the runs played (#285). */
  checks: CheckPolicy;
  objective: Objective;
  requiredRoomIds: readonly string[];
  cells: readonly BalanceCell[];
}>;

export type BalanceResult =
  | Readonly<{ ok: true; report: BalanceReport }>
  | Readonly<{
      ok: false;
      failure: Readonly<{ code: BalanceFailureCode; message: string }>;
    }>;

const mean = (values: readonly number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

function summarise(
  adventure: FifthAdventure,
  sheet: CharacterSheet,
  objective: Objective,
  runs: readonly RunRecord[],
): Omit<BalanceCell, "level" | "percentile" | "style"> {
  const outcomes: Partial<Record<RunRecord["outcome"], number>> = {};
  for (const { outcome } of runs) {
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  const share = (count: number) => count / runs.length;
  return {
    runs: runs.length,
    survivalRate: share(runs.filter((run) => run.outcome !== "defeat").length),
    completionRate: share(
      runs.filter((run) => run.outcome === objective).length,
    ),
    outcomes,
    encounters: adventure.encounters.flatMap(({ id }) => {
      const fought = runs.flatMap(({ encounters }) =>
        encounters.filter((fight) => fight.id === id),
      );
      return fought.length === 0
        ? []
        : [
            {
              id,
              runs: fought.length,
              meanHpLost: mean(fought.map(({ hpLost }) => hpLost)),
              meanRounds: mean(fought.map(({ rounds }) => rounds)),
              defeatRate:
                fought.filter(({ outcome }) => outcome === "defeat").length /
                fought.length,
            },
          ];
    }),
    healing: {
      meanSecondWinds: mean(runs.map(({ healing }) => healing.secondWinds)),
      meanPotions: mean(runs.map(({ healing }) => healing.potions)),
      meanSpells: mean(runs.map(({ healing }) => healing.spells)),
      meanShortRests: mean(runs.map(({ healing }) => healing.shortRests)),
      meanLongRests: mean(runs.map(({ healing }) => healing.longRests)),
      meanInterruptedRests: mean(
        runs.map(({ healing }) => healing.interruptedRests),
      ),
      meanHp: mean(runs.map(({ healing }) => healing.hp)),
    },
    meanTrapDamage: mean(runs.map(({ trapDamage }) => trapDamage)),
    meanXp: mean(runs.map(({ xp }) => xp)),
    meanTreasure: mean(runs.map(({ treasure }) => treasure)),
    meanBypassed: mean(runs.map(({ bypassed }) => bypassed)),
    meanFled: mean(runs.map(({ fled }) => fled)),
    meanFightActions: mean(runs.map(({ fightActions: used }) => used)),
    oneHitKill: adventure.encounters.flatMap(({ id: encounterId, opponents }) =>
      opponents.map(({ id, name, statBlock }) => ({
        encounterId,
        opponentId: id,
        name,
        chance: oneHitKillChance(sheet, statBlock),
      })),
    ),
  };
}

/**
 * Plays `adventure` at each recommended level with each percentile character
 * in each style, once per seed, and reports the metrics for each. The same
 * options always give the same report. A module the harness can't play
 * fails with a named reason rather than passing.
 */
export function qualifyAdventure(
  adventure: FifthAdventure,
  {
    seeds = Array.from({ length: DEFAULT_SEED_COUNT }, (_, seed) => seed),
    percentiles = DEFAULT_PERCENTILES,
    styles = PLAY_STYLES,
    sampleSize,
    sampleSeed,
    stepLimit,
    checks = "seeded",
    classId = DEFAULT_CLASS,
  }: BalanceOptions = {},
): BalanceResult {
  try {
    const { objective, roomIds } = requiredPath(adventure);
    const characters = percentileCharacters({
      percentiles,
      classId,
      ...(sampleSize === undefined ? {} : { sampleSize }),
      ...(sampleSeed === undefined ? {} : { sampleSeed }),
    });
    const { min, max } = adventure.recommendedLevels;
    const cells: BalanceCell[] = [];
    for (let level = min as Level; level <= max; level++) {
      for (const { percentile, dice } of characters) {
        const sheet = characterAtLevel(
          dice,
          level,
          undefined,
          false,
          undefined,
          classId,
        );
        const runtime = createFifthRuntime(adventure, sheet, { checks });
        for (const style of styles) {
          const runs = seeds.map((seed) =>
            playAdventure(runtime, style, seed, {
              ...(stepLimit === undefined ? {} : { stepLimit }),
            }),
          );
          cells.push({
            level,
            percentile,
            style,
            ...summarise(adventure, sheet, objective, runs),
          });
        }
      }
    }
    return {
      ok: true,
      report: {
        adventureId: adventure.id,
        classId,
        checks,
        objective,
        requiredRoomIds: roomIds,
        cells,
      },
    };
  } catch (error) {
    if (error instanceof BalanceError) {
      return {
        ok: false,
        failure: { code: error.code, message: error.message },
      };
    }
    throw error;
  }
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
const decimal = (value: number) => value.toFixed(1);

/**
 * A plain-text report: the objective and required rooms, then for each
 * level and character percentile the one-hit-kill chances and a line per
 * style, each followed by its fights.
 */
export function renderBalanceResult(
  adventure: Pick<FifthAdventure, "id" | "title">,
  result: BalanceResult,
): string {
  if (!result.ok) {
    return `${adventure.title} (${adventure.id}) fails: ${result.failure.code}. ${result.failure.message}`;
  }
  const { report } = result;
  const className = CLASSES[report.classId].name;
  const lines = [
    `${adventure.title} (${report.adventureId}) for the ${className}${report.checks === "seeded" ? "" : `, with ${report.checks} checks`}`,
    `Objective: ${report.objective}, through ${report.requiredRoomIds.join(" > ")}`,
  ];
  for (const cell of report.cells) {
    const first = report.cells.find(
      ({ level, percentile }) =>
        level === cell.level && percentile === cell.percentile,
    );
    if (first === cell) {
      lines.push(
        "",
        `Level ${cell.level}, ${cell.percentile}th percentile ${className}. One-hit kill: ${cell.oneHitKill
          .map(({ name, chance }) => `${name} ${percent(chance)}`)
          .join(", ")}`,
      );
    }
    lines.push(
      `  ${cell.style}: survived ${percent(cell.survivalRate)}, completed ${percent(cell.completionRate)} of ${cell.runs}; ` +
        `XP ${decimal(cell.meanXp)}, treasure ${decimal(cell.meanTreasure)}; ` +
        `healed ${decimal(cell.healing.meanHp)} HP (Second Wind ${decimal(cell.healing.meanSecondWinds)}, potions ${decimal(cell.healing.meanPotions)}, healing spells ${decimal(cell.healing.meanSpells)}, short rests ${decimal(cell.healing.meanShortRests)}, long rests ${decimal(cell.healing.meanLongRests)}, interrupted ${decimal(cell.healing.meanInterruptedRests)}); ` +
        `trap damage ${decimal(cell.meanTrapDamage)}` +
        (cell.style === "stealth-first"
          ? `; slipped past ${decimal(cell.meanBypassed)} fights`
          : cell.style === "retreat"
            ? `; fled ${decimal(cell.meanFled)} fights`
            : cell.style === "use-room"
              ? `; used the room ${decimal(cell.meanFightActions)} times`
              : ""),
      ...cell.encounters.map(
        (fight) =>
          `    ${fight.id}: fought in ${fight.runs}, lost ${percent(fight.defeatRate)}, ` +
          `${decimal(fight.meanHpLost)} HP lost, ${decimal(fight.meanRounds)} rounds`,
      ),
    );
  }
  return lines.join("\n");
}

/** What a declared difficulty demands of a module. */
export type DifficultyThresholds = Readonly<{
  /** The least share of cautious runs the weakest character must survive. */
  survival: number;
  /** The most chance one attack may have of killing an ordinary enemy. */
  oneHitKillCap: number;
}>;

/** The gate's parameter table, recorded in docs/rules/balance.md. */
export const DIFFICULTY_THRESHOLDS: Readonly<
  Record<Difficulty, DifficultyThresholds>
> = {
  easy: { survival: 0.95, oneHitKillCap: 0.5 },
  medium: { survival: 0.85, oneHitKillCap: 0.4 },
  hard: { survival: 0.75, oneHitKillCap: 0.3 },
};

/**
 * The lowest level at which a caster's survival is judged (#348, owner's
 * choice): early magic is weak and unreliable, so a Cleric or Wizard may
 * struggle at levels 1 and 2. Below it its survival is reported; its career
 * must still reach the top level, and the too-easy checks judge it at every
 * level.
 */
export const CASTER_JUDGED_LEVEL = 3;

/**
 * The lowest level class parity is judged at (#536, #541, owner's D4): from
 * it a weak caster's cautious survival must be within `PARITY_POINTS` of a
 * weak Fighter's. Fighters keep their edge below it.
 */
export const PARITY_LEVEL = 4;
/** How many points of survival a caster may trail the Fighter by (#536). */
export const PARITY_POINTS = 5;

/**
 * The seeds a caster plays both casting policies on (#348, owner's choice
 * for D12): each kit and level then plays the rest by the one that
 * survived more of them, and the spend-early report covers these alone.
 */
export const POLICY_SEED_COUNT = 50;

/** The weakest and strongest sampled characters, as percentiles. */
export const WEAKEST_PERCENTILE = 5;
export const STRONGEST_PERCENTILE = 95;
/** The style the weakest character plays the survival check in. */
export const GATE_STYLE: PlayStyle = "cautious";
/** The style the strongest character plays the always-succeed branch in. */
export const XP_STYLE: PlayStyle = "direct";
/** The style the gate reports beside the judged checks (#302). */
export const STEALTH_STYLE: PlayStyle = "stealth-first";
/** The style that flees, which the gate reports too (#396). */
export const RETREAT_STYLE: PlayStyle = "retreat";
/** The style that uses the room in a fight, which the gate reports (#402). */
export const ROOM_STYLE: PlayStyle = "use-room";

/**
 * The SRD 5.2 XP needed for levels 1–8. Characters stop at level 5; levels
 * 6 to 8 are here only so the XP check can tell how far XP would carry one
 * (a level-5 module's limit is level 6, passed at 23,000 XP, and a long
 * one's level 7, passed at 34,000).
 */
const SRD_LEVEL_XP = [0, 300, 900, 2700, 6500, 14000, 23000, 34000] as const;

function srdLevelForXp(xp: number): number {
  return SRD_LEVEL_XP.filter((needed) => xp >= needed).length;
}

/**
 * The share of runs the weakest character survives with each kit at each
 * recommended level, against the threshold, with its checks graded by
 * `checks` (#285). `rate`, `kit` and `level` are the kit and level it
 * survives least with.
 */
export type SurvivalCheck = Readonly<{
  ok: boolean;
  checks: CheckPolicy;
  level: number;
  percentile: number;
  style: PlayStyle;
  runs: number;
  rate: number;
  kit: KitId;
  /**
   * Each kit at each level. Judging a caster (#348), the casting policy
   * that survived more, and `reported` for a level below
   * `CASTER_JUDGED_LEVEL`: shown, never judged.
   */
  kits: readonly Readonly<{
    kit: KitId;
    level: number;
    rate: number;
    casting?: CastingPolicy;
    reported?: true;
  }>[];
  /**
   * Every kit and level is reported (#348): a caster's module below
   * `CASTER_JUDGED_LEVEL`. The check passes, showing the weakest.
   */
  reported?: true;
  required: number;
}>;

/** One branch's weakest kit at a level (#536), with a caster's policy. */
export type ParityFigure = Readonly<{
  kit: KitId;
  rate: number;
  casting?: CastingPolicy;
}>;

/**
 * The weakest character's cautious survival at one level from
 * `PARITY_LEVEL` (#536): its weakest kit on seeded checks and with every
 * check failing.
 */
export type ParityLevel = Readonly<{
  level: number;
  seeded: ParityFigure;
  alwaysFail: ParityFigure;
  /** The sure-held items it played with (#539), by name, if any. */
  carried?: readonly string[];
}>;

/**
 * Each level's parity figures from `PARITY_LEVEL` (#536), in level order:
 * the kit `survival` and `alwaysFail` survive least with at that level.
 * Empty for a module whose levels are all below.
 */
export function parityLevels(
  survival: Pick<SurvivalCheck, "kits">,
  alwaysFail: Pick<SurvivalCheck, "kits">,
): readonly ParityLevel[] {
  const weakestAt = (
    { kits }: Pick<SurvivalCheck, "kits">,
    level: number,
  ): ParityFigure => {
    const { kit, rate, casting } = kits
      .filter((entry) => entry.level === level)
      .reduce((worst, entry) => (entry.rate < worst.rate ? entry : worst));
    return { kit, rate, ...(casting === undefined ? {} : { casting }) };
  };
  const levels = [
    ...new Set(
      survival.kits
        .map(({ level }) => level)
        .filter((level) => level >= PARITY_LEVEL),
    ),
  ].sort((a, b) => a - b);
  return levels.map((level) => ({
    level,
    seeded: weakestAt(survival, level),
    alwaysFail: weakestAt(alwaysFail, level),
  }));
}

/**
 * The weakest character's stealth-first runs (#302) with each kit at each
 * recommended level, on seeded checks: reported beside the judged checks,
 * never judged itself. A module stealth could trivialise is judged by the
 * other checks, whose XP limit counts the XP authored for slipping past.
 * `rate`, `kit` and `level` are the kit and level it survives least with;
 * the completion rate, fights slipped past and XP are over every run.
 */
export type StealthFirstReport = Omit<SurvivalCheck, "ok" | "required"> &
  Readonly<{
    completionRate: number;
    meanBypassed: number;
    meanXp: number;
  }>;

/**
 * The weakest character's retreat runs (#396) with each kit at each
 * recommended level, on seeded checks: reported beside the judged checks,
 * never judged itself, as the judged styles never flee. `rate`, `kit` and
 * `level` are the kit and level it survives least with; the completion
 * rate, fights fled and XP are over every run.
 */
export type RetreatReport = Omit<SurvivalCheck, "ok" | "required"> &
  Readonly<{
    completionRate: number;
    meanFled: number;
    meanXp: number;
  }>;

/**
 * The weakest character's use-room runs (#402) with each kit at each
 * recommended level, on seeded checks: reported beside the judged checks,
 * never judged itself, as the judged styles never use the room in a fight.
 * `rate`, `kit` and `level` are the kit and level it survives least with;
 * the completion rate, fight actions used and XP are over every run.
 */
export type UseRoomReport = Omit<SurvivalCheck, "ok" | "required"> &
  Readonly<{
    completionRate: number;
    meanFightActions: number;
    meanXp: number;
  }>;

/**
 * The weakest character's cautious runs answering reaction rolls (#304) by
 * one policy, with each kit at each recommended level, on seeded checks:
 * reported, never judged. The `attack` runs are the judged survival runs.
 * `rate`, `kit` and `level` are the kit and level it survives least with;
 * the completion rate, encounters ended peacefully and XP are over every
 * run.
 */
export type ReactionPolicyReport = Omit<SurvivalCheck, "ok" | "required"> &
  Readonly<{
    policy: ReactionPolicy;
    completionRate: number;
    meanPeaceful: number;
    meanXp: number;
  }>;

/**
 * The weakest character's cautious runs spending its slots early (#348),
 * with each kit at each recommended level, on seeded checks: reported
 * beside the judged conserving runs, never judged. `rate`, `kit` and
 * `level` are the kit and level it survives least with; the spells cast
 * and XP are over every run.
 */
export type SpendEarlyReport = Omit<SurvivalCheck, "ok" | "required"> &
  Readonly<{
    casting: CastingPolicy;
    meanSpellsCast: number;
    meanXp: number;
  }>;

/** How often one attack kills each ordinary enemy, against the cap. */
export type OneHitKillCheck = Readonly<{
  ok: boolean;
  level: number;
  percentile: number;
  cap: number;
  /** The sure-held items it played with (#539), by name, if any. */
  carried?: readonly string[];
  /**
   * Each ordinary opponent, with its one-hit-kill chance from the kit, or
   * the weapon the module places or a merchant sells (`gear`, wielded with
   * that kit's armour),
   * and the Fighting Style that kill it most often. On a tie the earlier
   * kit, then the default style, is kept.
   */
  enemies: readonly Readonly<{
    encounterId: string;
    opponentId: string;
    name: string;
    chance: number;
    kit: KitId;
    gear?: WeaponId;
    /** For a class with a Fighting Style. */
    fightingStyle?: FightingStyle;
    /**
     * The cantrip that kills it most often (#348), when it beats every
     * weapon: a caster's best repeatable attack.
     */
    spell?: SpellId;
  }>[];
  /** The ordinary enemies over the cap; more than half of them fails. */
  overCap: OneHitKillCheck["enemies"];
  /**
   * Reported, not judged (#348, D5): for a caster, each ordinary enemy's
   * chance of being killed by one levelled damage spell from full HP, the
   * spell on its class list at its highest slot that kills it most often,
   * and the enemies over the cap with them.
   */
  spells?: Readonly<{
    enemies: readonly SpellKill[];
    overCap: readonly SpellKill[];
  }>;
  /**
   * Reported, not judged (#310): for a class with a bonus action that gives
   * its first attack advantage (the Rogue's Hide or Steady Aim), the same
   * chances with that bonus action and its Sneak Attack, and the enemies
   * over the cap with them. Absent for a class without one.
   */
  bonusAction?: Readonly<{
    enemies: OneHitKillCheck["enemies"];
    overCap: OneHitKillCheck["enemies"];
  }>;
}>;

/** One ordinary enemy and the levelled spell that kills it most often. */
export type SpellKill = Readonly<{
  encounterId: string;
  opponentId: string;
  name: string;
  chance: number;
  spell: SpellId;
  slotLevel: number;
}>;

/**
 * Too easy by control (#348, D5): for the strongest character at the
 * maximum recommended level, each ordinary enemy's chance of being taken
 * out of the fight by one control used at the opening (`controlChance`),
 * the control on its class list (or Turn Undead) that does so most often.
 * As for one attack, no more than half the ordinary enemies may be over the
 * cap.
 */
export type ControlCheck = Readonly<{
  ok: boolean;
  level: number;
  percentile: number;
  cap: number;
  /** The sure-held items it played with (#539), by name, if any. */
  carried?: readonly string[];
  enemies: readonly Readonly<{
    encounterId: string;
    opponentId: string;
    name: string;
    chance: number;
    control: ControlId;
  }>[];
  overCap: ControlCheck["enemies"];
}>;

/**
 * Whether every XP award the module offers keeps a character within the
 * maximum recommended level + 1, starting one XP short of the level above
 * the maximum.
 */
export type XpCheck = Readonly<{
  ok: boolean;
  /**
   * Every encounter's XP, with what sparing each opponent that may surrender
   * would give if more (#238), and the most any ending awards.
   */
  available: number;
  /**
   * The always-succeed branch (#285): the most XP the strongest character
   * earned at the maximum recommended level, playing direct with every check
   * in its best band, over the seeds in order until a run earns all the XP
   * offered (`runs` is how many it played). It counts toward the limit when
   * it is more than `available`.
   */
  alwaysSucceed: Readonly<{
    level: number;
    percentile: number;
    style: PlayStyle;
    runs: number;
    mostXp: number;
  }>;
  startXp: number;
  endLevel: number;
  levelLimit: number;
}>;

/**
 * A declared route's survival checks (#407): the weakest character's
 * cautious runs on the route, judged as the fewest-fights route's are.
 */
export type RouteCheck = Readonly<{
  id: string;
  name: string;
  survival: SurvivalCheck;
  alwaysFail: SurvivalCheck;
}>;

/**
 * A region sweep's survival checks (#408): the weakest character's cautious
 * runs visiting every room of the region but the avoidable ones, judged at
 * `difficulty`, one lower than the module's.
 */
export type SweepCheck = Readonly<{
  region: string;
  name: string;
  difficulty: Difficulty;
  survival: SurvivalCheck;
  alwaysFail: SurvivalCheck;
}>;

/**
 * The difficulty a region sweep (#408) is judged at: one lower than the
 * module's, a Medium module's sweep at Hard. Hard has none lower, so a Hard
 * module's sweeps are judged at Hard.
 */
export function sweepDifficulty(difficulty: Difficulty): Difficulty {
  return DIFFICULTIES[
    Math.min(DIFFICULTIES.indexOf(difficulty) + 1, DIFFICULTIES.length - 1)
  ]!;
}

export type GateVerdict = Readonly<{
  adventureId: string;
  /** The class the verdict judges (#310). */
  classId: ClassId;
  difficulty: Difficulty;
  qualified: boolean;
  /** The survival check on seeded checks. */
  survival: SurvivalCheck;
  /** The same check with every check in its worst band (#285). */
  alwaysFail: SurvivalCheck;
  /**
   * For a module that declares routes (#407): each route's checks, in the
   * module's order. A module qualifies only if every route survives.
   */
  routes?: readonly RouteCheck[];
  /**
   * For a long module (#408): each region's sweep checks, in the module's
   * order. A module qualifies only if every sweep survives.
   */
  sweeps?: readonly SweepCheck[];
  oneHitKill: OneHitKillCheck;
  /** For a class with control at the module's maximum level (#348). */
  control?: ControlCheck;
  xp: XpCheck;
  /** Reported, not judged (#335). */
  rests: RestReport;
  /**
   * Reported, not judged (#348): a caster's cautious runs spending its
   * slots early, on seeded checks; absent for a class without spells, or
   * when not asked for.
   */
  spendEarly?: SpendEarlyReport;
  /** Reported, not judged (#302); absent when not asked for. */
  stealthFirst?: StealthFirstReport;
  /** Reported, not judged (#396); absent when not asked for. */
  retreat?: RetreatReport;
  /** Reported, not judged (#402); absent when not asked for. */
  useRoom?: UseRoomReport;
  /** Reported, not judged (#401): for a module with an alarm. */
  alarm?: AlarmReport;
  /** Reported, not judged (#403): for a module with region tables. */
  wandering?: WanderingReport;
  /**
   * Reported, not judged (#304): each reaction policy, for a module with a
   * reaction-eligible encounter; absent otherwise, or when not asked for.
   */
  reactions?: readonly ReactionPolicyReport[];
  /**
   * Each level's figures from `PARITY_LEVEL` (#536), which
   * `moduleGateResult` sets beside the Fighter's and judges (#541); absent
   * for a module whose levels are all below.
   */
  parity?: readonly ParityLevel[];
}>;

/**
 * What the gate measures of a module, before it is judged at a difficulty:
 * none of it depends on the difficulty declared.
 */
export type GateMeasures = Readonly<{
  adventureId: string;
  classId: ClassId;
  survival: Omit<SurvivalCheck, "ok" | "required">;
  alwaysFail: Omit<SurvivalCheck, "ok" | "required">;
  routes?: readonly Readonly<{
    id: string;
    name: string;
    survival: Omit<SurvivalCheck, "ok" | "required">;
    alwaysFail: Omit<SurvivalCheck, "ok" | "required">;
  }>[];
  sweeps?: readonly Readonly<{
    region: string;
    name: string;
    survival: Omit<SurvivalCheck, "ok" | "required">;
    alwaysFail: Omit<SurvivalCheck, "ok" | "required">;
  }>[];
  oneHitKill: Omit<
    OneHitKillCheck,
    "ok" | "cap" | "overCap" | "bonusAction" | "spells"
  > &
    Readonly<{
      bonusAction?: Readonly<{ enemies: OneHitKillCheck["enemies"] }>;
      spells?: Readonly<{ enemies: readonly SpellKill[] }>;
    }>;
  control?: Omit<ControlCheck, "ok" | "cap" | "overCap">;
  xp: XpCheck;
  rests: RestReport;
  spendEarly?: SpendEarlyReport;
  stealthFirst?: StealthFirstReport;
  retreat?: RetreatReport;
  useRoom?: UseRoomReport;
  alarm?: AlarmReport;
  wandering?: WanderingReport;
  reactions?: readonly ReactionPolicyReport[];
  parity?: readonly ParityLevel[];
}>;

/**
 * The wandering fights the judged runs met (#403), for a module whose
 * regions have wandering encounter tables: the weakest character's
 * cautious runs with each kit at each level, on seeded checks and with
 * every check failing. Those fights already count in survival like any
 * other, and their XP in the XP limit; this only says how many runs met
 * one and fell in one, and the XP they offer. Reported, never judged.
 */
export type WanderingReport = Readonly<{
  level: number;
  percentile: number;
  style: PlayStyle;
  /** How many judged runs each branch played. */
  runs: Readonly<Record<"seeded" | "always-fail", number>>;
  /** How many runs of each branch met a wandering fight. */
  met: Readonly<Record<"seeded" | "always-fail", number>>;
  /** How many runs of each branch ended in defeat in a wandering fight. */
  fell: Readonly<Record<"seeded" | "always-fail", number>>;
  /** The XP the wandering encounters offer, of the XP check's total. */
  xp: number;
}>;

/**
 * The judged runs that raised the module's alarm (#401), for a module with
 * one: the weakest character's cautious runs with each kit at each level,
 * on seeded checks and with every check failing, each named by its checks,
 * kit, level and seed, with what raised it. Reported, never judged.
 */
export type AlarmReport = Readonly<{
  level: number;
  percentile: number;
  style: PlayStyle;
  /** How many judged runs each branch played. */
  runs: Readonly<Record<"seeded" | "always-fail", number>>;
  raised: readonly Readonly<{
    checks: "seeded" | "always-fail";
    kit: KitId;
    level: number;
    seed: number;
    by: string;
  }>[];
}>;

/**
 * The rests the weakest character took in its judged runs (#335), over
 * every kit and level on seeded checks: short and long rests a run, and
 * rests a wandering encounter interrupted. Reported, never judged.
 */
export type RestReport = Readonly<{
  level: number;
  percentile: number;
  style: PlayStyle;
  meanShort: number;
  meanLong: number;
  meanInterrupted: number;
}>;

export type GateResult =
  | Readonly<{ ok: true; verdict: GateVerdict }>
  | Readonly<{
      ok: false;
      failure: Readonly<{ code: BalanceFailureCode; message: string }>;
    }>;

export type GateOptions = Pick<
  BalanceOptions,
  "seeds" | "sampleSize" | "sampleSeed" | "stepLimit"
> &
  Readonly<{
    /**
     * The class `gateAdventure` judges (#310): the harness's class, the
     * Fighter, unless named. `gateModule` judges every class in
     * `GATE_CLASSES`, so it takes no class.
     */
    classId?: ClassId;
    /**
     * Whether to play and report the stealth-first runs (#302); true by
     * default. They are never judged, so `passesGate` leaves them out.
     */
    reportStealth?: boolean;
    /**
     * Whether to play and report the retreat runs (#396); true by default.
     * They are never judged, so `passesGate` leaves them out.
     */
    reportRetreat?: boolean;
    /**
     * Whether to play and report the use-room runs (#402); true by
     * default. They are never judged, so `passesGate` leaves them out.
     */
    reportUseRoom?: boolean;
    /**
     * Whether to play and report both reaction policies (#304) for a module
     * with a reaction-eligible encounter; true by default. Never judged.
     */
    reportReactions?: boolean;
    /**
     * The modules a career plays before this one (#539), in order
     * (`earlierModules`): the caster items it is sure to hold from them
     * (`sureHeldItems`) play in the too-easy checks and the parity line.
     * None unless given.
     */
    earlier?: readonly FifthAdventure[];
  }>;

/**
 * A caster item a career is sure to hold (#539): the module it lies in, the
 * item as the character holds it, and its name.
 */
export type SureHeldItem = Readonly<{
  adventureId: string;
  item: HeldMagicItem;
  name: string;
}>;

/**
 * The modules of `all` a career plays before `adventure` (#539): those
 * ahead of it in the browser's order (`orderFifthAdventures`).
 */
export function earlierModules(
  adventure: FifthAdventure,
  all: readonly FifthAdventure[],
): readonly FifthAdventure[] {
  const ordered = orderFifthAdventures(
    [...all.filter(({ id }) => id !== adventure.id), adventure],
    () => true,
  );
  return ordered.slice(0, ordered.indexOf(adventure));
}

/**
 * The caster items a `classId` character is sure to hold when it plays a
 * module at `level` (#539, D5), in the order found, at most
 * `ATTUNEMENT_LIMIT`: each that its class may attune lying in a room on the
 * required path of a module in `earlier` whose lowest recommended level is
 * `level` or less (so every career that reaches `level` has played it),
 * hidden in a feature of that room with no check (a failed check may leave
 * it hidden), and never missing on Scarce. One an opponent carries is never
 * sure: it may flee or surrender with it.
 */
export function sureHeldItems(
  earlier: readonly FifthAdventure[],
  classId: ClassId,
  level: number,
): readonly SureHeldItem[] {
  return earlier
    .filter(({ recommendedLevels }) => recommendedLevels.min <= level)
    .flatMap((module) => {
      const path = new Set(requiredPath(module).roomIds);
      const scarce = new Set(scarceCandidateIds(module));
      return module.rooms
        .filter(({ id }) => path.has(id))
        .flatMap(({ items, features }) =>
          items.flatMap(({ id, casterItem, hiddenIn }) => {
            const feature = features.find(
              (candidate) => candidate.id === hiddenIn,
            );
            return casterItem === undefined ||
              feature === undefined ||
              feature.check !== undefined ||
              scarce.has(id) ||
              !mayAttune(classId, CASTER_ITEMS[casterItem].attunement)
              ? []
              : [
                  {
                    adventureId: module.id,
                    item: { id: `${module.id}/${id}`, casterItem },
                    name: CASTER_ITEMS[casterItem].name,
                  },
                ];
          }),
        );
    })
    .slice(0, ATTUNEMENT_LIMIT);
}

/** One way the strongest character may be armed, as the gate tries it. */
export type Attacker = Readonly<{
  kit: KitId;
  /** A weapon the module places or a merchant sells, wielded instead. */
  gear?: WeaponId;
  /** For a class with a Fighting Style. */
  fightingStyle?: FightingStyle;
  sheet: CharacterSheet;
}>;

/**
 * The ways the gate arms the `classId` character (the harness's class unless
 * named) rolled with `dice` at `level`: every starting kit of its class, and
 * every weapon in `placed` wielded with the default kit's armour (and its
 * shield, unless the weapon is two-handed: the Cleric's, #541), each with
 * every Fighting Style, the default first, for a class with one. A placed
 * ranged weapon is wielded by the Dexterity-first build of the same dice
 * (#230).
 */
export function strongestAttackers(
  dice: RolledDice,
  level: Level,
  placed: readonly WeaponId[] = [],
  classId: ClassId = DEFAULT_CLASS,
): readonly Attacker[] {
  const definition = CLASSES[classId];
  const armed = [
    ...definition.kits.map((kit) => ({
      kit,
      sheet: characterAtLevel(dice, level, kit, false, undefined, classId),
    })),
    ...placed.map((gear) => {
      const kit = definition.defaults.kit;
      const weapon = WEAPONS[gear] as WeaponData;
      const ranged = weapon.ammunition !== undefined;
      const twoHanded = weapon.properties.includes("two-handed");
      const sheet = characterAtLevel(dice, level, kit, ranged, gear, classId);
      return {
        kit,
        gear,
        sheet: validateCharacter({
          ...sheet,
          equipment: [
            ...STARTING_KITS[kit].equipment.filter(
              (item) => !isWeaponId(item) && !(twoHanded && isShieldId(item)),
            ),
            gear,
          ],
        }),
      };
    }),
  ];
  const preferred = definition.defaults.fightingStyle;
  // A class without a Fighting Style is tried as it is (#306).
  if (preferred === undefined) {
    return armed;
  }
  const styles = [
    preferred,
    ...(Object.keys(FIGHTING_STYLES) as FightingStyle[]).filter(
      (style) => style !== preferred,
    ),
  ];
  return armed.flatMap((entry) =>
    styles.map((fightingStyle) => ({
      ...entry,
      fightingStyle,
      sheet: validateCharacter({ ...entry.sheet, fightingStyle }),
    })),
  );
}

/**
 * The best one-hit-kill chance against `enemy` among `attackers`, and the
 * kit, gear and Fighting Style that give it. On a tie the earlier is kept.
 */
export function bestOneHitKill(
  attackers: readonly Attacker[],
  enemy: StatBlock,
  bonusAction?: Readonly<{ hideDc: number }>,
): Readonly<{
  chance: number;
  kit: KitId;
  gear?: WeaponId;
  fightingStyle?: FightingStyle;
}> {
  return attackers
    .map(({ sheet, ...found }) => ({
      chance: oneHitKillChance(sheet, enemy, bonusAction),
      ...found,
    }))
    .reduce((best, entry) => (entry.chance > best.chance ? entry : best));
}

/**
 * Checks `adventure` against its declared difficulty
 * (`DIFFICULTY_THRESHOLDS`):
 * - too deadly: the weakest character, playing cautious, must survive at
 *   least the difficulty's share of runs with every starting kit at every
 *   recommended level, on seeded checks and again with every check in its
 *   worst band (#285), where a run stranded by a check fails the module
 *   naming the checks it made;
 * - too easy: for the strongest character at the maximum recommended level,
 *   with the kit or placed weapon, and the Fighting Style, strongest against
 *   each enemy, no more than half the
 *   ordinary (non-boss) enemies may be killed by one attack from full HP more
 *   often than the difficulty's cap;
 * - XP: all the XP the module offers, or more if the strongest character
 *   earns more playing direct with every check in its best band (#285),
 *   must not take a character one XP short of the level above the maximum
 *   past the maximum + 1.
 * A module the harness can't play fails with a named reason, as in
 * `qualifyAdventure`. The same options always give the same verdict.
 */
export function gateAdventure(
  adventure: FifthAdventure,
  {
    seeds = Array.from({ length: DEFAULT_SEED_COUNT }, (_, seed) => seed),
    sampleSize,
    sampleSeed,
    stepLimit,
    reportStealth = true,
    reportRetreat = true,
    reportUseRoom = true,
    reportReactions = true,
    classId = DEFAULT_CLASS,
    earlier = [],
  }: GateOptions = {},
): GateResult {
  const { min, max } = adventure.recommendedLevels;
  /** The caster items it is sure to hold at `level` (#539). */
  const sureHeld = (level: number) => sureHeldItems(earlier, classId, level);
  /** `sheet` holding the items it is sure to hold at its level (#539). */
  const carrying = (sheet: CharacterSheet): CharacterSheet => {
    const held = sureHeld(sheet.level);
    return held.length === 0
      ? sheet
      : validateCharacter({
          ...sheet,
          magicItems: [...sheet.magicItems, ...held.map(({ item }) => item)],
        });
  };
  /** The names of the items it is sure to hold at `level`, if any (#539). */
  const carriedAt = (level: number) => {
    const names = sureHeld(level).map(({ name }) => name);
    return names.length === 0 ? {} : { carried: names };
  };
  const definition = CLASSES[classId];
  const classKits = definition.kits;
  // A caster plays both casting policies (#348).
  const spending = definition.spellcasting !== undefined;
  try {
    const [weakest, strongest] = percentileCharacters({
      percentiles: [WEAKEST_PERCENTILE, STRONGEST_PERCENTILE],
      classId,
      ...(sampleSize === undefined ? {} : { sampleSize }),
      ...(sampleSeed === undefined ? {} : { sampleSeed }),
    });
    const levels = Array.from(
      { length: max - min + 1 },
      (_, index) => (min + index) as Level,
    );
    const limit = stepLimit === undefined ? {} : { stepLimit };
    // Each declared route (#407), and whether it is off the
    // fewest-fights route, whose runs it shares if not. A route no style
    // can follow fails the module here.
    // Each region sweep of a long module (#408) is played as a route is; one
    // that can't reach a room fails the module here.
    const fewest = JSON.stringify(requiredPath(adventure).roomIds);
    const offFewest = (along: FifthRoute | RegionSweep) =>
      JSON.stringify(requiredPath(adventure, along).roomIds) !== fewest;
    const routes = adventure.routes ?? [];
    // D8 (#408): an avoidable room lies off every route's required path,
    // the rooms between those it names too, or off the fewest-fights
    // route's when it declares none.
    const avoidable = new Set(
      adventure.rooms.flatMap(({ id, avoidable: off }) =>
        off === true ? [id] : [],
      ),
    );
    if (avoidable.size > 0) {
      for (const route of routes.length === 0 ? [undefined] : routes) {
        const passed = requiredPath(adventure, route).roomIds.find((roomId) =>
          avoidable.has(roomId),
        );
        if (passed !== undefined) {
          throw new BalanceError(
            "avoidable-on-route",
            `${adventure.id}: room ${passed} is avoidable, but ${route === undefined ? "the fewest-fights route" : `route ${route.id} (${route.name})`} passes it: an avoidable room must lie off every declared route.`,
          );
        }
      }
    }
    const sweeps = regionSweeps(adventure);
    const ways = [
      ...routes.map((route) => ({ along: { route }, off: offFewest(route) })),
      ...sweeps.map((sweep) => ({ along: { sweep }, off: offFewest(sweep) })),
    ];
    // In a module without fight actions the use-room style plays as the
    // judged one (#402), so its runs are the judged runs.
    const roomy = hasFightActions(adventure);
    // Both reaction policies are reported where a reaction can be rolled.
    const reacting =
      reportReactions &&
      adventure.encounters.some(({ reaction }) => reaction !== undefined);
    const rateOf = (runs: readonly RunRecord[]) =>
      runs.filter(({ outcome }) => outcome !== "defeat").length / runs.length;
    /**
     * The weakest character's cautious runs with each kit at each level, on
     * seeded checks and with every check failing. A seeded run that made no
     * check is the always-fail run on its seed too, so only runs that made
     * one are played again. Beside them, its stealth-first runs on seeded
     * checks (#302), and its cautious runs taking the peaceful option of a
     * reaction roll (#304). A caster (#348) plays its first
     * `POLICY_SEED_COUNT` seeded runs with both casting policies, and every
     * other run with the one that survives more of them (`casting`), as a
     * player keeps to one way of playing.
     */
    const played = levels.flatMap((level) =>
      classKits.map((kit) => {
        const sheet = characterAtLevel(
          weakest!.dice,
          level,
          kit,
          false,
          undefined,
          classId,
        );
        const seeded = createFifthRuntime(adventure, sheet);
        const failing = createFifthRuntime(adventure, sheet, {
          checks: "always-fail",
        });
        const play = (seed: number, casting: CastingPolicy) =>
          playAdventure(seeded, GATE_STYLE, seed, { ...limit, casting });
        // A caster tries both policies on the first seeds (#348).
        const trial = spending ? seeds.slice(0, POLICY_SEED_COUNT) : [];
        const tried = {
          conserve: trial.map((seed) => play(seed, "conserve")),
          "spend-early": trial.map((seed) => play(seed, "spend-early")),
        };
        const casting: CastingPolicy =
          spending && rateOf(tried["spend-early"]) > rateOf(tried.conserve)
            ? "spend-early"
            : "conserve";
        const policy = { ...limit, casting };
        const runs = seeds.map((seed, index) => {
          const run = tried[casting][index] ?? play(seed, casting);
          return {
            seeded: run,
            failing:
              run.checks === 0
                ? run
                : playAdventure(failing, GATE_STYLE, seed, policy),
            stealth: reportStealth
              ? playAdventure(seeded, STEALTH_STYLE, seed, policy)
              : undefined,
            // A run never low with no heal left is the retreat run too
            // (#396): the retreat style would never have fled.
            retreat: !reportRetreat
              ? undefined
              : run.retreatChances === 0
                ? run
                : playAdventure(seeded, RETREAT_STYLE, seed, policy),
            useRoom: !reportUseRoom
              ? undefined
              : roomy
                ? playAdventure(seeded, ROOM_STYLE, seed, policy)
                : run,
            // A run its reaction policy never decided is the peaceful
            // run too (#347).
            peaceful: !reacting
              ? undefined
              : run.reactionChoices === 0
                ? run
                : playAdventure(seeded, GATE_STYLE, seed, {
                    ...policy,
                    reactions: "peaceful",
                  }),
            spending: tried["spend-early"][index],
          };
        });
        // Each declared route of its own (#407), then each region sweep
        // (#408), on seeded checks and with every check failing.
        const routeRuns = ways.map(({ along, off }) =>
          !off
            ? runs
            : seeds.map((seed) => {
                const run = playAdventure(seeded, GATE_STYLE, seed, {
                  ...policy,
                  ...along,
                });
                return {
                  seeded: run,
                  failing:
                    run.checks === 0
                      ? run
                      : playAdventure(failing, GATE_STYLE, seed, {
                          ...policy,
                          ...along,
                        }),
                };
              }),
        );
        return {
          kit,
          level,
          runs,
          routeRuns,
          ...(spending ? { casting } : {}),
        };
      }),
    );
    /** A branch's runs: none for a branch not played. */
    type Branch =
      | "seeded"
      | "failing"
      | "stealth"
      | "retreat"
      | "useRoom"
      | "peaceful"
      | "spending";
    const branchRuns = (
      runs: readonly Readonly<Partial<Record<Branch, RunRecord | undefined>>>[],
      branch: Branch,
    ) => runs.flatMap((run) => run[branch] ?? []);
    /**
     * The survival of `branch`'s runs with each kit at each level. A
     * caster's (#348) names the casting policy it played, and a level below
     * `CASTER_JUDGED_LEVEL` is reported, not judged; `rate`, `kit` and
     * `level` are the weakest judged, or the weakest of all when none is
     * (the check is reported). The spend-early report (`judging` false)
     * marks none.
     */
    const survivalOf = (
      checks: CheckPolicy,
      branch: Branch,
      style: PlayStyle = GATE_STYLE,
      judging = true,
      routeIndex?: number,
    ): GateMeasures["survival"] => {
      // A declared route's runs (#407), or the fewest-fights route's.
      const runsOf = (entry: (typeof played)[number]) =>
        routeIndex === undefined ? entry.runs : entry.routeRuns[routeIndex]!;
      const kits = played.map((entry) => ({
        kit: entry.kit,
        level: entry.level,
        rate: rateOf(branchRuns(runsOf(entry), branch)),
        ...(entry.casting === undefined || !judging
          ? {}
          : { casting: entry.casting }),
        ...(entry.casting !== undefined &&
        judging &&
        entry.level < CASTER_JUDGED_LEVEL
          ? { reported: true as const }
          : {}),
      }));
      const judgedKits = kits.filter((entry) => !("reported" in entry));
      const weakestKit = (judgedKits.length > 0 ? judgedKits : kits).reduce(
        (worst, entry) => (entry.rate < worst.rate ? entry : worst),
      );
      return {
        checks,
        level: weakestKit.level,
        percentile: WEAKEST_PERCENTILE,
        style,
        runs: branchRuns(runsOf(played[0]!), branch).length,
        rate: weakestKit.rate,
        kit: weakestKit.kit,
        kits,
        ...(judgedKits.length === 0 ? { reported: true as const } : {}),
      };
    };
    const survival = survivalOf("seeded", "seeded");
    const alwaysFail = survivalOf("always-fail", "failing");
    // Each declared route's checks (#407).
    /** A route's or a sweep's two checks, by its index in `ways`. */
    const wayChecks = (wayIndex: number) => ({
      survival: survivalOf("seeded", "seeded", GATE_STYLE, true, wayIndex),
      alwaysFail: survivalOf(
        "always-fail",
        "failing",
        GATE_STYLE,
        true,
        wayIndex,
      ),
    });
    const routeChecks = routes.map(({ id, name }, routeIndex) => ({
      id,
      name,
      ...wayChecks(routeIndex),
    }));
    // Each region sweep's (#408).
    const sweepChecks = sweeps.map(({ region, name }, sweepIndex) => ({
      region,
      name,
      ...wayChecks(routes.length + sweepIndex),
    }));
    const judgedRuns = played.flatMap(({ runs }) => branchRuns(runs, "seeded"));
    const rests: RestReport = {
      level: survival.level,
      percentile: WEAKEST_PERCENTILE,
      style: GATE_STYLE,
      meanShort: mean(judgedRuns.map(({ healing }) => healing.shortRests)),
      meanLong: mean(judgedRuns.map(({ healing }) => healing.longRests)),
      meanInterrupted: mean(
        judgedRuns.map(({ healing }) => healing.interruptedRests),
      ),
    };
    const objective = requiredPath(adventure).objective;
    const stealthy = played.flatMap(({ runs }) => branchRuns(runs, "stealth"));
    const stealthFirst: StealthFirstReport | undefined = reportStealth
      ? {
          ...survivalOf("seeded", "stealth", STEALTH_STYLE, false),
          completionRate:
            stealthy.filter(({ outcome }) => outcome === objective).length /
            stealthy.length,
          meanBypassed: mean(stealthy.map(({ bypassed }) => bypassed)),
          meanXp: mean(stealthy.map(({ xp }) => xp)),
        }
      : undefined;
    const retreating = played.flatMap(({ runs }) =>
      branchRuns(runs, "retreat"),
    );
    const retreat: RetreatReport | undefined = reportRetreat
      ? {
          ...survivalOf("seeded", "retreat", RETREAT_STYLE, false),
          completionRate:
            retreating.filter(({ outcome }) => outcome === objective).length /
            retreating.length,
          meanFled: mean(retreating.map(({ fled }) => fled)),
          meanXp: mean(retreating.map(({ xp }) => xp)),
        }
      : undefined;
    const roomRuns = played.flatMap(({ runs }) => branchRuns(runs, "useRoom"));
    const useRoom: UseRoomReport | undefined = reportUseRoom
      ? {
          ...survivalOf("seeded", "useRoom", ROOM_STYLE, false),
          completionRate:
            roomRuns.filter(({ outcome }) => outcome === objective).length /
            roomRuns.length,
          meanFightActions: mean(
            roomRuns.map(({ fightActions: used }) => used),
          ),
          meanXp: mean(roomRuns.map(({ xp }) => xp)),
        }
      : undefined;
    const policyReport = (
      policy: ReactionPolicy,
      branch: "seeded" | "peaceful",
    ): ReactionPolicyReport => {
      const runs = played.flatMap(({ runs: each }) => branchRuns(each, branch));
      return {
        ...survivalOf("seeded", branch, GATE_STYLE, false),
        policy,
        completionRate:
          runs.filter(({ outcome }) => outcome === objective).length /
          runs.length,
        meanPeaceful: mean(runs.map(({ peaceful }) => peaceful)),
        meanXp: mean(runs.map(({ xp }) => xp)),
      };
    };
    const reactions: readonly ReactionPolicyReport[] | undefined = reacting
      ? [policyReport("attack", "seeded"), policyReport("peaceful", "peaceful")]
      : undefined;
    // The judged runs that raised the alarm (#401), in play order.
    const alarm: AlarmReport | undefined =
      adventure.alarm === undefined
        ? undefined
        : {
            level: survival.level,
            percentile: WEAKEST_PERCENTILE,
            style: GATE_STYLE,
            runs: {
              seeded: played.length * seeds.length,
              "always-fail": played.length * seeds.length,
            },
            raised: (["seeded", "always-fail"] as const).flatMap((checks) =>
              played.flatMap(({ kit, level, runs }) =>
                runs.flatMap((run, index) => {
                  const by =
                    run[checks === "seeded" ? "seeded" : "failing"].alarm;
                  return by === undefined
                    ? []
                    : [{ checks, kit, level, seed: seeds[index]!, by }];
                }),
              ),
            ),
          };
    // The wandering fights the judged runs met (#403).
    const wanderers = new Set(
      (adventure.regions ?? []).flatMap(({ wandering: table }) =>
        (table?.entries ?? []).flatMap((entry) =>
          "encounterId" in entry ? [entry.encounterId] : [],
        ),
      ),
    );
    const wanderingRuns = (checks: "seeded" | "always-fail") =>
      played.flatMap(({ runs }) =>
        runs.map((run) => run[checks === "seeded" ? "seeded" : "failing"]),
      );
    const wandering: WanderingReport | undefined =
      wanderers.size === 0
        ? undefined
        : {
            level: survival.level,
            percentile: WEAKEST_PERCENTILE,
            style: GATE_STYLE,
            runs: {
              seeded: played.length * seeds.length,
              "always-fail": played.length * seeds.length,
            },
            met: {
              seeded: wanderingRuns("seeded").filter(({ encounters }) =>
                encounters.some(({ id }) => wanderers.has(id)),
              ).length,
              "always-fail": wanderingRuns("always-fail").filter(
                ({ encounters }) =>
                  encounters.some(({ id }) => wanderers.has(id)),
              ).length,
            },
            fell: {
              seeded: wanderingRuns("seeded").filter(({ encounters }) =>
                fellToWanderer(encounters, wanderers),
              ).length,
              "always-fail": wanderingRuns("always-fail").filter(
                ({ encounters }) => fellToWanderer(encounters, wanderers),
              ).length,
            },
            xp: adventure.encounters
              .filter(({ id }) => wanderers.has(id))
              .reduce(
                (sum, { opponents }) =>
                  sum +
                  opponents.reduce(
                    (total, { statBlock }) => total + statBlock.xp,
                    0,
                  ),
                0,
              ),
          };
    const spent = played.flatMap(({ runs }) => branchRuns(runs, "spending"));
    const spendEarly: SpendEarlyReport | undefined = spending
      ? {
          ...survivalOf("seeded", "spending", GATE_STYLE, false),
          casting: "spend-early",
          meanSpellsCast: mean(spent.map(({ spellsCast }) => spellsCast)),
          meanXp: mean(spent.map(({ xp }) => xp)),
        }
      : undefined;

    // Every weapon the module places or a merchant sells.
    const placed = [
      ...new Set(
        adventure.rooms.flatMap(({ items, creatures }) =>
          [
            ...items.flatMap(({ gear }) => (gear === undefined ? [] : [gear])),
            ...creatures.flatMap(({ merchant }) => merchant?.stock ?? []),
          ].filter(isWeaponId),
        ),
      ),
    ];
    // The too-easy checks play with sure-held items (#539, D5).
    const strong = strongestAttackers(
      strongest!.dice,
      max as Level,
      placed,
      classId,
    ).map((attacker) => ({ ...attacker, sheet: carrying(attacker.sheet) }));
    // A caster's spells (#348): every one on its class list it could cast
    // at the maximum level, at its highest slot.
    const caster = carrying(
      characterAtLevel(
        strongest!.dice,
        max as Level,
        undefined,
        false,
        undefined,
        classId,
      ),
    );
    const self = playerCombatant(caster);
    const highest = self.spellcasting?.slots.length ?? 0;
    const list = (definition.spellcasting?.list ?? []).filter(
      (id) => SPELLS[id].level <= highest,
    );
    const cantrips = list.filter((id) => CAST_SPELLS.cantrip(SPELLS[id]));
    const damaging = list.filter(
      (id) =>
        CAST_SPELLS.levelled(SPELLS[id]) &&
        SPELLS[id].effect.kind !== "control",
    );
    const controls: readonly ControlId[] = [
      ...list.filter(
        (id) => SPELLS[id].level > 0 && SPELLS[id].effect.kind === "control",
      ),
      ...(self.channelDivinity === undefined ? [] : ["turn-undead" as const]),
    ];
    const ordinary = adventure.encounters.flatMap(
      ({ id: encounterId, opponents }) =>
        opponents.flatMap(({ id, name, statBlock, boss }) =>
          boss === true
            ? []
            : [{ encounterId, opponentId: id, name, statBlock }],
        ),
    );
    /** The one of `ids` with the best `chance`, if any beats 0. */
    const bestOf = <T>(
      ids: readonly T[],
      chance: (id: T) => number,
    ): Readonly<{ id: T; chance: number }> | undefined =>
      ids
        .map((id) => ({ id, chance: chance(id) }))
        .reduce<Readonly<{ id: T; chance: number }> | undefined>(
          (best, entry) => (entry.chance > (best?.chance ?? 0) ? entry : best),
          undefined,
        );
    const enemies = ordinary.map(({ statBlock, ...enemy }) => {
      const weapon = bestOneHitKill(strong, statBlock);
      // The best repeatable attack (#348, D5): a cantrip that beats it.
      const cantrip = bestOf(cantrips, (id) =>
        spellKillChance(caster, SPELLS[id], undefined, statBlock),
      );
      return cantrip !== undefined && cantrip.chance > weapon.chance
        ? {
            ...enemy,
            chance: cantrip.chance,
            kit: definition.defaults.kit,
            spell: cantrip.id,
          }
        : { ...enemy, ...weapon };
    });
    const spellKills: readonly SpellKill[] = ordinary.flatMap(
      ({ statBlock, ...enemy }) => {
        const best = bestOf(damaging, (id) =>
          spellKillChance(caster, SPELLS[id], highest, statBlock),
        );
        return best === undefined
          ? []
          : [
              {
                ...enemy,
                chance: best.chance,
                spell: best.id,
                slotLevel: highest,
              },
            ];
      },
    );
    const control: GateMeasures["control"] =
      controls.length === 0
        ? undefined
        : {
            level: max,
            percentile: STRONGEST_PERCENTILE,
            ...carriedAt(max),
            enemies: ordinary.map(({ statBlock, ...enemy }) => {
              const best = bestOf(controls, (id) =>
                controlChance(caster, id, statBlock),
              );
              return {
                ...enemy,
                chance: best?.chance ?? 0,
                control: best?.id ?? controls[0]!,
              };
            }),
          };
    // With a bonus action before the attack (#310): reported, not judged.
    const prepared = strong.some(({ sheet }) => {
      const { hide, steadyAim } = playerCombatant(sheet);
      return hide !== undefined || steadyAim === true;
    });
    const withBonusAction = adventure.encounters.flatMap(
      ({ id: encounterId, opponents }) =>
        opponents.flatMap(({ id, name, statBlock, boss }) =>
          boss === true
            ? []
            : [
                {
                  encounterId,
                  opponentId: id,
                  name,
                  ...bestOneHitKill(strong, statBlock, {
                    hideDc: watching(opponents),
                  }),
                },
              ],
        ),
    );
    const oneHitKill: GateMeasures["oneHitKill"] = {
      level: max,
      percentile: STRONGEST_PERCENTILE,
      ...carriedAt(max),
      enemies,
      ...(prepared ? { bonusAction: { enemies: withBonusAction } } : {}),
      ...(damaging.length === 0 ? {} : { spells: { enemies: spellKills } }),
    };

    const available =
      adventure.encounters.reduce(
        (sum, { opponents, bypassXp, reaction }) =>
          sum +
          // An encounter is credited once: won, slipped past (#302) or
          // ended peacefully (#304).
          Math.max(
            bypassXp ?? 0,
            reaction?.peacefulXp ?? 0,
            opponents.reduce(
              (total, { statBlock, surrender }) =>
                total +
                Math.max(
                  statBlock.xp,
                  Math.floor(statBlock.xp / 2) + (surrender?.xp ?? 0),
                ),
              0,
            ),
          ),
        0,
      ) + Math.max(0, ...adventure.endings.map(({ xp }) => xp ?? 0));
    // The always-succeed branch: every way a check can open is open, and the
    // character fights every fight it finds.
    const succeeding = createFifthRuntime(
      adventure,
      characterAtLevel(
        strongest!.dice,
        max as Level,
        undefined,
        false,
        undefined,
        classId,
      ),
      { checks: "always-succeed" },
    );
    // Once a run earns everything offered, no other run can earn more.
    let mostXp = 0;
    let xpRuns = 0;
    for (const seed of seeds) {
      xpRuns += 1;
      mostXp = Math.max(
        mostXp,
        playAdventure(succeeding, XP_STYLE, seed, limit).xp,
      );
      if (mostXp >= available) {
        break;
      }
    }
    const alwaysSucceed: XpCheck["alwaysSucceed"] = {
      level: max,
      percentile: STRONGEST_PERCENTILE,
      style: XP_STYLE,
      runs: xpRuns,
      mostXp,
    };
    const startXp = SRD_LEVEL_XP[max]! - 1;
    const endLevel = srdLevelForXp(
      startXp + Math.max(available, alwaysSucceed.mostXp),
    );
    // A long module's XP may carry a character one level further (#404, D6).
    const levelLimit = max + (adventure.long === true ? 2 : 1);
    const xp: XpCheck = {
      ok: endLevel <= levelLimit,
      available,
      alwaysSucceed,
      startXp,
      endLevel,
      levelLimit,
    };
    // Class parity (#536), from the judged runs' figures; at a level where
    // the character is sure to hold items (#539, D5), from runs carrying
    // them, its policy chosen as the judged runs choose theirs.
    const parity = parityLevels(survival, alwaysFail).map((figures) => {
      if (sureHeld(figures.level).length === 0) {
        return figures;
      }
      const kits = classKits.map((kit) => {
        const sheet = carrying(
          characterAtLevel(
            weakest!.dice,
            figures.level as Level,
            kit,
            false,
            undefined,
            classId,
          ),
        );
        const seeded = createFifthRuntime(adventure, sheet);
        const failing = createFifthRuntime(adventure, sheet, {
          checks: "always-fail",
        });
        const play = (seed: number, casting: CastingPolicy) =>
          playAdventure(seeded, GATE_STYLE, seed, { ...limit, casting });
        const trial = spending ? seeds.slice(0, POLICY_SEED_COUNT) : [];
        const tried = {
          conserve: trial.map((seed) => play(seed, "conserve")),
          "spend-early": trial.map((seed) => play(seed, "spend-early")),
        };
        const casting: CastingPolicy =
          spending && rateOf(tried["spend-early"]) > rateOf(tried.conserve)
            ? "spend-early"
            : "conserve";
        const runs = seeds.map(
          (seed, index) => tried[casting][index] ?? play(seed, casting),
        );
        const failed = runs.map((run, index) =>
          run.checks === 0
            ? run
            : playAdventure(failing, GATE_STYLE, seeds[index]!, {
                ...limit,
                casting,
              }),
        );
        const shown = spending ? { casting } : {};
        return {
          seeded: { kit, level: figures.level, rate: rateOf(runs), ...shown },
          failing: {
            kit,
            level: figures.level,
            rate: rateOf(failed),
            ...shown,
          },
        };
      });
      const [carried] = parityLevels(
        { kits: kits.map(({ seeded }) => seeded) },
        { kits: kits.map(({ failing }) => failing) },
      );
      return { ...carried!, ...carriedAt(figures.level) };
    });

    return {
      ok: true,
      verdict: gateVerdictAt(
        {
          adventureId: adventure.id,
          classId,
          survival,
          alwaysFail,
          ...(routeChecks.length === 0 ? {} : { routes: routeChecks }),
          ...(sweepChecks.length === 0 ? {} : { sweeps: sweepChecks }),
          oneHitKill,
          ...(control === undefined ? {} : { control }),
          xp,
          rests,
          ...(stealthFirst === undefined ? {} : { stealthFirst }),
          ...(retreat === undefined ? {} : { retreat }),
          ...(useRoom === undefined ? {} : { useRoom }),
          ...(alarm === undefined ? {} : { alarm }),
          ...(wandering === undefined ? {} : { wandering }),
          ...(reactions === undefined ? {} : { reactions }),
          ...(spendEarly === undefined ? {} : { spendEarly }),
          ...(parity.length === 0 ? {} : { parity }),
        },
        adventure.difficulty,
      ),
    };
  } catch (error) {
    if (error instanceof BalanceError) {
      return {
        ok: false,
        failure: { code: error.code, message: error.message },
      };
    }
    throw error;
  }
}

/**
 * The gate's measurements judged at `difficulty`'s thresholds: the verdict
 * the gate gives the module declared at `difficulty`. A `GateVerdict` is
 * also its own measurements, so this re-judges one at another difficulty.
 */
export function gateVerdictAt(
  measures: GateMeasures,
  difficulty: Difficulty,
): GateVerdict {
  const thresholds = DIFFICULTY_THRESHOLDS[difficulty];
  const judged = (
    measured: GateMeasures["survival"],
    { survival: share } = thresholds,
  ): SurvivalCheck => {
    const { checks, level, percentile, style, runs, rate, kit, kits } =
      measured;
    return {
      ok: measured.reported === true || rate >= share,
      checks,
      level,
      percentile,
      style,
      runs,
      rate,
      kit,
      kits,
      ...(measured.reported === true ? { reported: true as const } : {}),
      required: share,
    };
  };
  const survival = judged(measures.survival);
  const alwaysFail = judged(measures.alwaysFail);
  const routes = measures.routes?.map(
    ({ id, name, survival: alive, alwaysFail: failing }) => ({
      id,
      name,
      survival: judged(alive),
      alwaysFail: judged(failing),
    }),
  );
  // Each region sweep (#408), one difficulty lower.
  const swept = sweepDifficulty(difficulty);
  const sweeps = measures.sweeps?.map(
    ({ region, name, survival: alive, alwaysFail: failing }) => ({
      region,
      name,
      difficulty: swept,
      survival: judged(alive, DIFFICULTY_THRESHOLDS[swept]),
      alwaysFail: judged(failing, DIFFICULTY_THRESHOLDS[swept]),
    }),
  );
  const { enemies } = measures.oneHitKill;
  const overCap = enemies.filter(
    ({ chance }) => chance > thresholds.oneHitKillCap,
  );
  const prepared = measures.oneHitKill.bonusAction;
  const overThe = <T extends Readonly<{ chance: number }>>(
    list: readonly T[],
  ) => list.filter(({ chance }) => chance > thresholds.oneHitKillCap);
  const spells = measures.oneHitKill.spells;
  const control: ControlCheck | undefined =
    measures.control === undefined
      ? undefined
      : {
          ...measures.control,
          ok:
            overThe(measures.control.enemies).length * 2 <=
            measures.control.enemies.length,
          cap: thresholds.oneHitKillCap,
          overCap: overThe(measures.control.enemies),
        };
  const oneHitKill: OneHitKillCheck = {
    ok: overCap.length * 2 <= enemies.length,
    level: measures.oneHitKill.level,
    percentile: measures.oneHitKill.percentile,
    cap: thresholds.oneHitKillCap,
    ...(measures.oneHitKill.carried === undefined
      ? {}
      : { carried: measures.oneHitKill.carried }),
    enemies,
    overCap,
    ...(prepared === undefined
      ? {}
      : {
          bonusAction: {
            enemies: prepared.enemies,
            overCap: prepared.enemies.filter(
              ({ chance }) => chance > thresholds.oneHitKillCap,
            ),
          },
        }),
    ...(spells === undefined
      ? {}
      : {
          spells: { enemies: spells.enemies, overCap: overThe(spells.enemies) },
        }),
  };
  return {
    adventureId: measures.adventureId,
    classId: measures.classId,
    difficulty,
    qualified:
      survival.ok &&
      alwaysFail.ok &&
      [...(routes ?? []), ...(sweeps ?? [])].every(
        (way) => way.survival.ok && way.alwaysFail.ok,
      ) &&
      oneHitKill.ok &&
      (control?.ok ?? true) &&
      measures.xp.ok,
    survival,
    alwaysFail,
    ...(routes === undefined ? {} : { routes }),
    ...(sweeps === undefined ? {} : { sweeps }),
    oneHitKill,
    ...(control === undefined ? {} : { control }),
    xp: measures.xp,
    rests: measures.rests,
    ...(measures.stealthFirst === undefined
      ? {}
      : { stealthFirst: measures.stealthFirst }),
    ...(measures.retreat === undefined ? {} : { retreat: measures.retreat }),
    ...(measures.useRoom === undefined ? {} : { useRoom: measures.useRoom }),
    ...(measures.alarm === undefined ? {} : { alarm: measures.alarm }),
    ...(measures.wandering === undefined
      ? {}
      : { wandering: measures.wandering }),
    ...(measures.reactions === undefined
      ? {}
      : { reactions: measures.reactions }),
    ...(measures.spendEarly === undefined
      ? {}
      : { spendEarly: measures.spendEarly }),
    ...(measures.parity === undefined ? {} : { parity: measures.parity }),
  };
}

/**
 * The classes the gate qualifies every module for (#310, #348): every
 * class creation offers (`OFFERED_CLASS_IDS`), in its order. A module
 * qualifies only if it qualifies for each.
 */
export const GATE_CLASSES: readonly ClassId[] = OFFERED_CLASS_IDS;

/** The gate's verdict on a module for every class in `GATE_CLASSES`. */
export type ModuleGateResult = Readonly<{
  adventureId: string;
  /** Whether the module qualifies for every class. */
  qualified: boolean;
  /** Each class's result, in `GATE_CLASSES` order. */
  classes: readonly Readonly<{ classId: ClassId; result: GateResult }>[];
  /**
   * Each caster against the Fighter at each level from `PARITY_LEVEL`
   * (#536); absent when there is none. Judged (#541): the module qualifies
   * only if every line is within `PARITY_POINTS` on both branches.
   */
  parity?: readonly ParityLine[];
}>;

/** A caster's figure on one branch beside the Fighter's (#536). */
export type ParityComparison = Readonly<{
  caster: ParityFigure;
  fighter: ParityFigure;
  /** The Fighter's survival less the caster's, in points to one decimal. */
  gap: number;
  /** Whether the gap is at most `PARITY_POINTS`. */
  within: boolean;
}>;

/** One caster at one level against the Fighter (#536). */
export type ParityLine = Readonly<{
  classId: ClassId;
  level: number;
  seeded: ParityComparison;
  alwaysFail: ParityComparison;
  /** The sure-held items the caster played with (#539), if any. */
  carried?: readonly string[];
}>;

/** " carrying the Wand of the War Mage +1", for sure-held items (#539). */
const carryingText = (carried: readonly string[] | undefined) =>
  carried === undefined ? "" : ` carrying the ${carried.join(" and the ")}`;

/**
 * Each caster class's parity figures (#536) set beside the Fighter's at
 * each level both report, in `classes` order: none when the Fighter
 * failed, and none for a caster that failed.
 */
function parityLines(classes: ModuleGateResult["classes"]): ParityLine[] {
  const parityOf = (classId: ClassId) => {
    const found = classes.find((entry) => entry.classId === classId)?.result;
    return found?.ok === true ? (found.verdict.parity ?? []) : [];
  };
  const fighter = parityOf("fighter");
  const compare = (
    caster: ParityFigure,
    against: ParityFigure,
  ): ParityComparison => {
    const gap = Math.round((against.rate - caster.rate) * 1000) / 10;
    return {
      caster,
      fighter: against,
      gap,
      within: gap <= PARITY_POINTS,
    };
  };
  return classes
    .filter(({ classId }) => CLASSES[classId].spellcasting !== undefined)
    .flatMap(({ classId }) =>
      parityOf(classId).flatMap(({ level, seeded, alwaysFail, carried }) => {
        const matched = fighter.find((entry) => entry.level === level);
        return matched === undefined
          ? []
          : [
              {
                classId,
                level,
                seeded: compare(seeded, matched.seeded),
                alwaysFail: compare(alwaysFail, matched.alwaysFail),
                ...(carried === undefined ? {} : { carried }),
              },
            ];
      }),
    );
}

/**
 * Gates `adventure` for every class in `GATE_CLASSES` (`gateAdventure` for
 * each, with `options`): it qualifies only if every class qualifies.
 */
export function gateModule(
  adventure: FifthAdventure,
  options: Omit<GateOptions, "classId"> = {},
): ModuleGateResult {
  return moduleGateResult(
    adventure.id,
    GATE_CLASSES.map((classId) => ({
      classId,
      result: gateAdventure(adventure, { ...options, classId }),
    })),
  );
}

/**
 * The module verdict for `adventureId` from each class's result, in
 * `GATE_CLASSES` order: as `gateModule` gives it, for results gated apart
 * (on worker threads, say). It qualifies only if every class qualifies and
 * every caster keeps class parity (#541, D4) on both branches.
 */
export function moduleGateResult(
  adventureId: string,
  classes: ModuleGateResult["classes"],
): ModuleGateResult {
  const parity = parityLines(classes);
  return {
    adventureId,
    qualified:
      classes.every(({ result }) => result.ok && result.verdict.qualified) &&
      parity.every(
        ({ seeded, alwaysFail }) => seeded.within && alwaysFail.within,
      ),
    classes,
    ...(parity.length === 0 ? {} : { parity }),
  };
}

/** Each module gated so far, by its content: the verdict never changes. */
const gated = new Map<string, boolean>();

/**
 * Whether `adventure` passes the gate at its declared difficulty for every
 * class with the default options (`gateModule`), as the browser offers
 * modules.
 */
export function passesGate(
  adventure: FifthAdventure,
  earlier: readonly FifthAdventure[] = [],
): boolean {
  const key = JSON.stringify([adventure, earlier]);
  let passed = gated.get(key);
  if (passed === undefined) {
    passed = gateModule(adventure, {
      reportStealth: false,
      reportRetreat: false,
      reportUseRoom: false,
      reportReactions: false,
      earlier,
    }).qualified;
    gated.set(key, passed);
  }
  return passed;
}

/**
 * One class's gate verdict as plain text: whether the module qualifies at
 * its declared difficulty for the class, then each check, naming the
 * ordinary enemies over the one-hit-kill cap. A failure names `classId`,
 * the class it was gated for, when given.
 */
export function renderGateResult(
  adventure: Pick<FifthAdventure, "id" | "title">,
  result: GateResult,
  classId?: ClassId,
): string {
  const name = `${adventure.title} (${adventure.id})`;
  if (!result.ok) {
    return `${name} does not qualify${classId === undefined ? "" : ` for the ${CLASSES[classId].name}`}: ${result.failure.code}. ${result.failure.message}`;
  }
  const { verdict } = result;
  const who = CLASSES[verdict.classId].name;
  const { survival, alwaysFail, oneHitKill, control, xp } = verdict;
  const mark = (ok: boolean) => (ok ? "pass" : "FAIL");
  const over = oneHitKill.overCap;
  const deadly = (
    check: SurvivalCheck,
    title: string,
    difficulty: Difficulty = verdict.difficulty,
  ) =>
    `  ${title}, ${check.reported === true ? `reported (not judged below level ${CASTER_JUDGED_LEVEL})` : mark(check.ok)}: the level ${check.level}, ${check.percentile}th percentile ${who} playing ${check.style} survived ${percent(check.rate)} of ${check.runs} runs with its weakest kit, ${check.kit} (${kits(check)}); ${difficulty} needs ${percent(check.required)}.`;
  const succeeded = xp.alwaysSucceed;
  const stealth = verdict.stealthFirst;
  // A caster's (#348): the policy that survived more, and a level reported.
  const kits = (check: Pick<SurvivalCheck, "kits">) =>
    check.kits
      .map(
        ({ kit, level, rate, casting, reported }) =>
          `${kit} level ${level} ${percent(rate)}${casting === undefined ? "" : ` ${casting}`}${reported === true ? " (reported)" : ""}`,
      )
      .join(", ");
  return [
    `${name} ${verdict.qualified ? "qualifies" : "does not qualify"} as ${verdict.difficulty} for the ${who}.`,
    deadly(survival, "Too deadly"),
    deadly(alwaysFail, "Too deadly when every check fails"),
    // Each declared route's (#407).
    ...(verdict.routes ?? []).flatMap((route) => [
      deadly(route.survival, `Route ${route.id} (${route.name}), too deadly`),
      deadly(
        route.alwaysFail,
        `Route ${route.id} (${route.name}), too deadly when every check fails`,
      ),
    ]),
    // Each region sweep's (#408), at its own difficulty.
    ...(verdict.sweeps ?? []).flatMap((sweep) => [
      deadly(
        sweep.survival,
        `Sweep of region ${sweep.region} (${sweep.name}), too deadly`,
        sweep.difficulty,
      ),
      deadly(
        sweep.alwaysFail,
        `Sweep of region ${sweep.region} (${sweep.name}), too deadly when every check fails`,
        sweep.difficulty,
      ),
    ]),
    `  Too easy, ${mark(oneHitKill.ok)}: the level ${oneHitKill.level}, ${oneHitKill.percentile}th percentile ${who}${carryingText(oneHitKill.carried)} kills ` +
      (over.length === 0
        ? `no ordinary enemy with one attack more than ${percent(oneHitKill.cap)} of the time.`
        : `${over.length} of ${oneHitKill.enemies.length} ordinary enemies with one attack more than ${percent(oneHitKill.cap)} of the time: ${over
            .map(
              ({ name: enemy, chance, kit, gear, spell }) =>
                `${enemy} ${percent(chance)} (${spell !== undefined ? SPELLS[spell].name : gear === undefined ? kit : `found ${gear}`})`,
            )
            .join(", ")}.${oneHitKill.ok ? "" : " No more than half may be."}`),
    ...(oneHitKill.bonusAction === undefined
      ? []
      : [
          `  Too easy with Sneak Attack, reported (not judged): with Hide or Steady Aim before the attack, the level ${oneHitKill.level}, ${oneHitKill.percentile}th percentile ${who} kills ` +
            (oneHitKill.bonusAction.overCap.length === 0
              ? `no ordinary enemy with one attack more than ${percent(oneHitKill.cap)} of the time.`
              : `${oneHitKill.bonusAction.overCap.length} of ${oneHitKill.bonusAction.enemies.length} ordinary enemies with one attack more than ${percent(oneHitKill.cap)} of the time: ${oneHitKill.bonusAction.overCap
                  .map(
                    ({ name: enemy, chance, kit, gear }) =>
                      `${enemy} ${percent(chance)} (${gear === undefined ? kit : `found ${gear}`})`,
                  )
                  .join(", ")}.`),
        ]),
    ...(control === undefined
      ? []
      : [
          `  Too easy by control, ${mark(control.ok)}: at the opening, the level ${control.level}, ${control.percentile}th percentile ${who}${carryingText(control.carried)} takes ` +
            (control.overCap.length === 0
              ? `no ordinary enemy out of the fight with one control more than ${percent(control.cap)} of the time.`
              : `${control.overCap.length} of ${control.enemies.length} ordinary enemies out of the fight with one control more than ${percent(control.cap)} of the time: ${control.overCap
                  .map(
                    ({ name: enemy, chance, control: used }) =>
                      `${enemy} ${percent(chance)} (${used === "turn-undead" ? "Turn Undead" : SPELLS[used].name})`,
                  )
                  .join(
                    ", ",
                  )}.${control.ok ? "" : " No more than half may be."}`),
        ]),
    ...(oneHitKill.spells === undefined
      ? []
      : [
          `  Too easy with levelled spells, reported (not judged): with one levelled damage spell at its highest slot, the level ${oneHitKill.level}, ${oneHitKill.percentile}th percentile ${who} kills ` +
            (oneHitKill.spells.overCap.length === 0
              ? `no ordinary enemy more than ${percent(oneHitKill.cap)} of the time.`
              : `${oneHitKill.spells.overCap.length} of ${oneHitKill.spells.enemies.length} ordinary enemies more than ${percent(oneHitKill.cap)} of the time: ${oneHitKill.spells.overCap
                  .map(
                    ({ name: enemy, chance, spell, slotLevel }) =>
                      `${enemy} ${percent(chance)} (${SPELLS[spell].name}, ${ordinal(slotLevel)} level)`,
                  )
                  .join(", ")}.`),
        ]),
    `  XP, ${mark(xp.ok)}: its ${Math.max(xp.available, succeeded.mostXp)} XP takes a character from ${xp.startXp} XP to level ${xp.endLevel}; the limit is level ${xp.levelLimit}.`,
    `  Rests, reported (not judged): on seeded checks the level ${verdict.rests.level}, ${verdict.rests.percentile}th percentile ${who} playing ${verdict.rests.style} took ${decimal(verdict.rests.meanShort)} short and ${decimal(verdict.rests.meanLong)} long rests a run; ${decimal(verdict.rests.meanInterrupted)} rests a run were interrupted.`,
    `  When every check succeeds, the level ${succeeded.level}, ${succeeded.percentile}th percentile ${who} playing ${succeeded.style} earned at most ${succeeded.mostXp} of the ${xp.available} XP offered in ${succeeded.runs} ${succeeded.runs === 1 ? "run" : "runs"}.`,
    ...(stealth === undefined
      ? []
      : [
          `  Stealth-first, reported (not judged): the level ${stealth.level}, ${stealth.percentile}th percentile ${who} playing ${stealth.style} survived ${percent(stealth.rate)} of ${stealth.runs} runs with its weakest kit, ${stealth.kit} (${kits(stealth)}); over every kit and level it completed ${percent(stealth.completionRate)}, slipped past ${decimal(stealth.meanBypassed)} fights and earned ${decimal(stealth.meanXp)} XP a run.`,
        ]),
    ...(verdict.retreat === undefined
      ? []
      : [
          `  Retreat, reported (not judged): the level ${verdict.retreat.level}, ${verdict.retreat.percentile}th percentile ${who} playing ${verdict.retreat.style} survived ${percent(verdict.retreat.rate)} of ${verdict.retreat.runs} runs with its weakest kit, ${verdict.retreat.kit} (${kits(verdict.retreat)}); over every kit and level it completed ${percent(verdict.retreat.completionRate)}, fled ${decimal(verdict.retreat.meanFled)} fights and earned ${decimal(verdict.retreat.meanXp)} XP a run.`,
        ]),
    ...(verdict.useRoom === undefined
      ? []
      : [
          `  Use the room, reported (not judged): the level ${verdict.useRoom.level}, ${verdict.useRoom.percentile}th percentile ${who} playing ${verdict.useRoom.style} survived ${percent(verdict.useRoom.rate)} of ${verdict.useRoom.runs} runs with its weakest kit, ${verdict.useRoom.kit} (${kits(verdict.useRoom)}); over every kit and level it completed ${percent(verdict.useRoom.completionRate)}, used the room ${decimal(verdict.useRoom.meanFightActions)} times and earned ${decimal(verdict.useRoom.meanXp)} XP a run.`,
        ]),
    ...(verdict.alarm === undefined ? [] : [alarmLine(verdict.alarm, who)]),
    ...(verdict.wandering === undefined
      ? []
      : [
          `  Wandering encounters, reported (not judged): the level ${verdict.wandering.level}, ${verdict.wandering.percentile}th percentile ${who} playing ${verdict.wandering.style} met one in ${verdict.wandering.met.seeded} of ${verdict.wandering.runs.seeded} seeded runs and ${verdict.wandering.met["always-fail"]} of ${verdict.wandering.runs["always-fail"]} always-fail runs, and fell in one in ${verdict.wandering.fell.seeded} and ${verdict.wandering.fell["always-fail"]}; they count in survival, and their ${verdict.wandering.xp} XP in the XP limit.`,
        ]),
    ...(verdict.spendEarly === undefined
      ? []
      : [
          `  Spending slots early, reported (not judged): the level ${verdict.spendEarly.level}, ${verdict.spendEarly.percentile}th percentile ${who} playing ${verdict.spendEarly.style} survived ${percent(verdict.spendEarly.rate)} of ${verdict.spendEarly.runs} runs with its weakest kit, ${verdict.spendEarly.kit} (${kits(verdict.spendEarly)}); over every kit and level it cast ${decimal(verdict.spendEarly.meanSpellsCast)} spells and earned ${decimal(verdict.spendEarly.meanXp)} XP a run.`,
        ]),
    ...(verdict.reactions ?? []).map(
      (report) =>
        `  Reactions, ${report.policy === "attack" ? "always attacking" : "taking the peaceful option"}, reported (not judged): the level ${report.level}, ${report.percentile}th percentile ${who} playing ${report.style} survived ${percent(report.rate)} of ${report.runs} runs with its weakest kit, ${report.kit} (${kits(report)}); over every kit and level it completed ${percent(report.completionRate)}, ended ${decimal(report.meanPeaceful)} encounters peacefully and earned ${decimal(report.meanXp)} XP a run.`,
    ),
  ].join("\n");
}

/** Whether a run fell in a wandering fight (#403): its last, lost. */
function fellToWanderer(
  encounters: readonly FightRecord[],
  wanderers: ReadonlySet<string>,
): boolean {
  const last = encounters.at(-1);
  return (
    last !== undefined && last.outcome === "defeat" && wanderers.has(last.id)
  );
}

/**
 * The alarm's report (#401) as a line: in how many judged runs of each
 * branch it was raised, then those runs, by their checks, kit, level and
 * what raised it, with their seeds ("seeds 0, 3–5").
 */
function alarmLine(report: AlarmReport, who: string): string {
  const count = (checks: "seeded" | "always-fail") =>
    `${report.raised.filter((run) => run.checks === checks).length} of ${report.runs[checks]} ${checks} runs`;
  const groups = new Map<string, number[]>();
  for (const { checks, kit, level, seed, by } of report.raised) {
    const key = `${checks} ${kit} level ${level}, by ${by}`;
    groups.set(key, [...(groups.get(key) ?? []), seed]);
  }
  /** Seeds in order, each run of consecutive ones as a range. */
  const seedList = (seeds: readonly number[]) => {
    const spans: [number, number][] = [];
    for (const seed of seeds) {
      const last = spans.at(-1);
      if (last !== undefined && last[1] + 1 === seed) {
        last[1] = seed;
      } else {
        spans.push([seed, seed]);
      }
    }
    return spans
      .map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`))
      .join(", ");
  };
  return (
    `  Alarm, reported (not judged): the level ${report.level}, ${report.percentile}th percentile ${who} playing ${report.style} raised it in ${count("seeded")} and ${count("always-fail")}` +
    (groups.size === 0
      ? "."
      : `: ${[...groups]
          .map(
            ([key, seeds]) =>
              `${key}, ${seeds.length === 1 ? "seed" : "seeds"} ${seedList(seeds)}`,
          )
          .join("; ")}.`)
  );
}

/**
 * The gate's verdict on a module for every class as plain text: each
 * class's `renderGateResult`, in `GATE_CLASSES` order, then a class-parity
 * line (#536) for each caster at each level from `PARITY_LEVEL`.
 */
export function renderModuleGateResult(
  adventure: Pick<FifthAdventure, "id" | "title">,
  result: ModuleGateResult,
): string {
  return [
    ...result.classes.map(({ classId, result: gate }) =>
      renderGateResult(adventure, gate, classId),
    ),
    ...(result.parity ?? []).map(parityLine),
  ].join("\n");
}

/**
 * A caster's class parity at one level (#536) as a line: whether it passes
 * (#541), and on each branch its weakest kit's survival against the
 * Fighter's, and how far behind it is.
 */
function parityLine({
  classId,
  level,
  seeded,
  alwaysFail,
  carried,
}: ParityLine): string {
  const figure = ({ kit, rate, casting }: ParityFigure) =>
    `${percent(rate)} (${kit}${casting === undefined ? "" : `, ${casting}`})`;
  const gap = ({ gap: points, within }: ParityComparison) =>
    points > 0
      ? `${decimal(points)} points behind (${within ? "within" : "more than"} ${PARITY_POINTS})`
      : points < 0
        ? `${decimal(-points)} points ahead`
        : "level with it";
  const ok = seeded.within && alwaysFail.within;
  return (
    `Class parity, ${ok ? "pass" : "FAIL"}: the ${CLASSES[classId].name} at level ${level}, playing ${GATE_STYLE} as the ${WEAKEST_PERCENTILE}th percentile${carryingText(carried)}, ` +
    `survived ${figure(seeded.caster)} on seeded checks against the Fighter's ${figure(seeded.fighter)}, ${gap(seeded)}; ` +
    `when every check fails ${figure(alwaysFail.caster)} against ${figure(alwaysFail.fighter)}, ${gap(alwaysFail)}.` +
    (ok
      ? ""
      : ` A caster may trail the Fighter by no more than ${PARITY_POINTS} points.`)
  );
}
