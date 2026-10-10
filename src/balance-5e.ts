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
  LOOT_KINDS,
  statBlockDefenses,
  statBlockSaves,
  unsimulatedTraits,
  type AuthoredCheck,
  type Difficulty,
  type EndingKind,
  type FifthAdventure,
  type FifthPassage,
  type StatBlock,
} from "./adventure-5e.js";
import {
  abilityModifier,
  applyLevelChoice,
  CLASSES,
  classMaxLevel,
  classOf,
  DEFAULT_CLASS,
  buildCharacter,
  defaultPlacement,
  characterProfile,
  LEVEL_XP,
  levelChoicesOwed,
  masteryOptions,
  pendingLevelChoice,
  withOwedSpells,
  alwaysPrepared,
  rollAbilitySet,
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
import { createSeededRandom } from "./random.js";
import { PEACEFUL_OPTIONS, type ReactionOption } from "./reaction-5e.js";
import {
  isWeaponId,
  STARTING_KITS,
  WEAPONS,
  type KitId,
  type WeaponData,
  type WeaponId,
} from "./equipment-5e.js";
import { isSpellId, SPELLS, type SpellId } from "./spells-5e.js";
import {
  armorClassOf,
  combatant,
  countedDamageDie,
  damageTaken,
  type ConditionKind,
} from "./encounter-5e.js";
import {
  CHECK_POLICIES,
  createFifthRuntime,
  PLAYER_ID,
  playerCombatant,
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
  return {
    increase: increase as AbilityScoreImprovement,
    mastery:
      preferred !== undefined && options.includes(preferred)
        ? preferred
        : options[0]!,
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
  const sheet = withOwedSpells(
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
  return Object.values(
    characterAtLevel(dice, 1, undefined, false, undefined, classId).abilities,
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
      : Math.min(20, Math.max(0, 5 + damage - fortitude - 1)) / 20;
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
  // Graze: a miss deals the damage modifier, if above 0.
  const grazeKills =
    attack.mastery === "Graze" && attack.damage.modifier > 0
      ? killedBy(attack.damage.modifier, false)
      : 0;
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
}>;

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
  return new Set(
    adventure.passages.flatMap(({ id, hidden }) =>
      hidden === true &&
      !openers.some(({ kind, passage }) => passage === id && kind !== "talk")
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
 * unless the key is lost (#331).
 * A hidden passage only talking opens is never passable (#297), unless
 * `talking` is true.
 */
function routePlanner(adventure: FifthAdventure, talking = false) {
  const talkOnly = talking ? new Set<string>() : talkOnlyPassages(adventure);
  const roomById = new Map(adventure.rooms.map((room) => [room.id, room]));
  const keyRoom = new Map(
    adventure.rooms.flatMap(({ id, items }) =>
      items.flatMap((item) =>
        item.kind === "key" ? [[item.id, id] as const] : [],
      ),
    ),
  );
  const fightIn = (position: Position, roomId: string) => {
    const encounterId = roomById.get(roomId)!.encounterId;
    return (
      encounterId !== undefined &&
      !position.clearedEncounterIds.includes(encounterId)
    );
  };

  /**
   * The cheapest route from the character's room to the nearest target, as
   * the rooms along it, starting with the character's; undefined if none.
   * With `keys` "any", key-only doors count as open, unless their keys are
   * lost.
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
      for (const passage of adventure.passages) {
        const [a, b] = passage.between;
        const next = a === here ? b : b === here ? a : undefined;
        const keyId = passage.door?.keyItemId;
        const locked =
          keyOnly(passage) &&
          (keyId === undefined || !position.inventory.includes(keyId));
        if (
          next === undefined ||
          done.has(next) ||
          !enterable(next) ||
          talkOnly.has(passage.id) ||
          position.blockedPassageIds.includes(passage.id) ||
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

  /**
   * The route toward the nearest target. When only a key-only door stands
   * in the way, the route leads to the room holding its key instead.
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
  return { plan, roomById, fightIn };
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

/**
 * The adventure's objective and the rooms a character must go through to
 * reach it, in the order first entered: to the victory fight; or to the
 * loot behind the fewest fights and then out by the nearest exit; or
 * just out. Keys that open the way are fetched on the way. No route goes
 * through a hidden passage that only a topic's check opens (#297): the
 * path is the one a player who never talks must take. Every other room is optional, and
 * so is every fight in one.
 */
export function requiredPath(adventure: FifthAdventure): Readonly<{
  objective: Objective;
  roomIds: readonly string[];
}> {
  const { plan, roomById } = routePlanner(adventure);
  const objective = objectiveOf(adventure);
  const legs =
    objective === "victory"
      ? [victoryRooms(adventure)]
      : objective === "escape-with-loot"
        ? [lootRooms(adventure), exitRooms(adventure)]
        : [exitRooms(adventure)];
  let position: Position = {
    roomId: adventure.startRoomId,
    inventory: [],
    clearedEncounterIds: [],
    blockedPassageIds: [],
    lostKeyIds: [],
  };
  const roomIds = [adventure.startRoomId];
  for (const targets of legs) {
    while (!targets.has(position.roomId)) {
      const path = plan(position, targets, () => true);
      if (path === undefined) {
        // Name talking only when talking would have reached it.
        const byTalking = routePlanner(adventure, true).plan(
          position,
          targets,
          () => true,
        );
        throw new BalanceError(
          "unreachable-objective",
          `${adventure.id}: no route reaches its ${objective} objective` +
            (byTalking === undefined
              ? "."
              : `: no style talks, and only talking opens the way through ${byTalking.join(" > ")}.`),
        );
      }
      const arrived = roomById.get(path.at(-1)!)!;
      // The character fights its way through and takes any key it reaches.
      position = {
        ...position,
        roomId: arrived.id,
        inventory: [
          ...position.inventory,
          ...arrived.items.flatMap(({ id, kind }) =>
            kind === "key" ? [id] : [],
          ),
        ],
        clearedEncounterIds: [
          ...position.clearedEncounterIds,
          ...path.flatMap((roomId) => roomById.get(roomId)!.encounterId ?? []),
        ],
      };
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
 *   quarter.
 * - `stealth-first` (#302) plays as `cautious`, but sneaks into every fight
 *   it can. Unseen, it slips past the fight unless its goal is in that room
 *   (the victory fight, loot, a key) or the way on is shut: then it springs
 *   an ambush. A fight it slipped past is met again if it comes back.
 */
export const PLAY_STYLES = [
  "direct",
  "cautious",
  "avoid-optional",
  "stealth-first",
] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

const HEAL_BELOW: Readonly<Record<PlayStyle, number>> = {
  direct: 1 / 4,
  cautious: 1 / 2,
  "avoid-optional": 1 / 4,
  "stealth-first": 1 / 2,
};

/** The styles that skip optional fights but look into rooms without one. */
const CAREFUL: readonly PlayStyle[] = ["cautious", "stealth-first"];

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
  // Channel Divinity, by the Cleric policy (#341): Turn Undead against
  // undead, Preserve Life when Bloodied, Divine Spark's radiant damage.
  "divine-spark": true,
  "turn-undead": true,
  "preserve-life": true,
  // Spiritual Weapon waits for the caster policies (#348).
  "spectral-attack": false,
  "end-turn": true,
  // Uncanny Dodge, by the Rogue policy: every hit it can halve (#308).
  "uncanny-dodge": true,
  // Every hit Uncanny Dodge can halve is halved; a hit Shield can't turn
  // into a miss is taken (#340).
  "take-hit": true,
  move: true,
  examine: true,
  take: true,
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
  // Wizard (#340) casts Mage Armor before its first fight, attacks with a
  // cantrip and answers a hit with Shield. The other spells wait for the
  // caster policies (#348).
  cast: true,
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

/** The kinds of action the harness asks the runtime to project. */
const CHOSEN_ACTIONS: ReadonlySet<ActionKind> = new Set(
  (Object.keys(PLAYED_ACTIONS) as ActionKind[]).filter(
    (kind) => PLAYED_ACTIONS[kind],
  ),
);

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
  outcome: "victory" | "defeat";
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
 * (#304) by `reactions`, `attack` by default. Throws a `BalanceError`
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
  }: Readonly<{ stepLimit?: number; reactions?: ReactionPolicy }> = {},
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
  const { plan, roomById, fightIn } = routePlanner(adventure);
  const required = new Set(requiredPath(adventure).roomIds);
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
    spells: 0,
    shortRests: 0,
    hitDice: 0,
    longRests: 0,
    interruptedRests: 0,
    hp: 0,
  };
  let trapDamage = 0;
  let spellsCast = 0;
  /** Whether a base-AC spell (Mage Armor, #340) was cast before a fight. */
  let warded = false;
  /** The character's hit points, so a blow costs only what was left. */
  let hp = state.character.hp;
  const blocked: string[] = [];
  let actions = 0;

  const apply = (action: FifthAction) => {
    actions += 1;
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
    for (const event of result.events) {
      switch (event.type) {
        case "initiative":
          fight = {
            // A wandering encounter (#335) fights in a room not its own.
            id:
              state.wandering === true
                ? adventure.wanderingEncounter!.encounterId
                : roomById.get(state.roomId)!.encounterId!,
            hpLost: 0,
            fled: 0,
            surrendered: 0,
            conditions: {},
          };
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
        case "short-rest":
          healing.shortRests += 1;
          break;
        case "long-rest":
          healing.longRests += 1;
          healing.hp += event.healing;
          hp = event.hpAfter;
          break;
        case "wandering-roll":
          healing.interruptedRests += event.interrupted ? 1 : 0;
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
          SPELLS[spell.id].effect.kind === "healing" &&
          target?.id === PLAYER_ID,
      )
      .sort(
        (a, b) =>
          (a.spell!.slotLevel ?? 0) - (b.spell!.slotLevel ?? 0) ||
          rank(a) - rank(b),
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
          const { castingTime, effect } = SPELLS[spell.id];
          return (
            castingTime === "reaction" &&
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
    const heal = [
      ...healingSpells(views, true),
      ...offered(views, "second-wind"),
      ...offered(views, "use"),
    ][0];
    if (heal !== undefined && low(hpOf(PLAYER_ID))) {
      return heal;
    }
    // Plain attacks; Cunning Strike's (#308) are chosen below.
    const plain = (kind: ActionKind) =>
      offered(views, kind).filter(
        ({ cunningStrike }) => cunningStrike === undefined,
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
    const cantrips = offered(views, "cast").filter(
      ({ spell, target }) =>
        isSpellId(spell?.id) &&
        SPELLS[spell.id].level === 0 &&
        SPELLS[spell.id].effect.kind === "attack" &&
        target !== undefined,
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
    return (
      aim ??
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

  /** The exploring action to take now, or undefined when there is none. */
  const exploreChoice = (
    views: readonly ActionView[],
  ): ActionView | undefined => {
    // Facing a reaction (#304), the policy's kind of option if offered. A
    // toll is offered (enabled) only when the purse holds it.
    const answers = offered(views, "react");
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
      return reactions === "peaceful"
        ? (peaceful[0] ?? attack[0])
        : (attack[0] ?? peaceful[0]);
    }
    const room = roomById.get(state.roomId)!;
    const searchable = new Set([
      ...room.features.map(({ id }) => id),
      ...(adventure.encounters
        .find(({ id }) => id === room.encounterId)
        ?.opponents.map(({ id }) => id) ?? []),
    ]);
    // A Wizard's Mage Armor (#340), once, outside a fight before its first:
    // a base-AC spell on itself that outlasts a fight.
    if (!warded && fights.length === 0) {
      const ward = offered(views, "cast").find(
        ({ spell, target }) =>
          isSpellId(spell?.id) &&
          target?.id === PLAYER_ID &&
          SPELLS[spell.id].effect.kind === "buff" &&
          (
            SPELLS[spell.id].effect as Readonly<{
              buff: Readonly<{ kind: string }>;
            }>
          ).buff.kind === "base-armor-class",
      );
      if (ward !== undefined) {
        warded = true;
        return ward;
      }
    }
    const find =
      offered(views, "examine").find(
        ({ target }) =>
          searchable.has(target!.id) &&
          !state.examinedFeatureIds.includes(target!.id),
      ) ?? offered(views, "take")[0];
    if (find !== undefined) {
      return find;
    }
    // Low, a long rest at a rest site (#335), then a short rest (#334),
    // then a healing spell (#339), before a potion, which also heals in a
    // fight.
    const heal = [
      ...offered(views, "long-rest"),
      ...offered(views, "rest"),
      ...healingSpells(views, false),
      ...offered(views, "use"),
    ][0];
    if (heal !== undefined && low(state.character.hp)) {
      return heal;
    }
    if (CAREFUL.includes(style)) {
      const careful = [
        ...offered(views, "search"),
        ...offered(views, "disarm"),
      ][0];
      if (careful !== undefined) {
        return careful;
      }
    }
    const goal = objectiveRooms();
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
      };
      const enterable = (targets: ReadonlySet<string>) => (id: string) =>
        (!winning.has(id) || targets.has(id)) &&
        (style === "direct" ||
          required.has(id) ||
          (CAREFUL.includes(style) && !fightIn(position, id)));
      const aside = detours(position);
      const path =
        plan(position, aside, enterable(aside)) ??
        plan(position, goal, enterable(goal)) ??
        plan(position, exits, enterable(exits));
      const ambush = offered(views, "ambush")[0];
      // Detours first; then, once the goal is a way out and it is reached,
      // leave (if this room is no exit, nothing is left to do). Unseen where
      // the goal is anything but a way out, spring an ambush (#302).
      if (path === undefined || path.length < 2) {
        return ambush === undefined || goal === exits
          ? (offered(views, "leave")[0] ?? ambush)
          : ambush;
      }
      const next = path[1]!;
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
      const opening = (["unlock", "force", "pick", "break"] as const)
        .flatMap((kind) => offered(views, kind))
        .find(({ target }) => target!.id === passage.door?.id);
      if (opening !== undefined) {
        return opening;
      }
      // Every way through the door has failed: plan around it.
      blocked.push(passage.id);
    }
  };

  apply({ type: "begin" });
  while (state.status === "playing") {
    const projected = runtime.projectActions(state, CHOSEN_ACTIONS);
    const unknown = projected.find(
      ({ action }) => !Object.hasOwn(PLAYED_ACTIONS, action),
    );
    if (unknown !== undefined) {
      throw new BalanceError(
        "unsupported-action",
        `${adventure.id}: the harness can't play the ${unknown.action} action.`,
      );
    }
    const views = projected.filter(({ available }) => available);
    const fighting = state.encounter?.outcome === "ongoing";
    const choice = fighting ? fightChoice(views) : exploreChoice(views);
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

/** The gate's parameter table, recorded in docs/character-rules.md. */
export const DIFFICULTY_THRESHOLDS: Readonly<
  Record<Difficulty, DifficultyThresholds>
> = {
  easy: { survival: 0.95, oneHitKillCap: 0.5 },
  medium: { survival: 0.85, oneHitKillCap: 0.4 },
  hard: { survival: 0.75, oneHitKillCap: 0.3 },
};

/** The weakest and strongest sampled characters, as percentiles. */
export const WEAKEST_PERCENTILE = 5;
export const STRONGEST_PERCENTILE = 95;
/** The style the weakest character plays the survival check in. */
export const GATE_STYLE: PlayStyle = "cautious";
/** The style the strongest character plays the always-succeed branch in. */
export const XP_STYLE: PlayStyle = "direct";
/** The style the gate reports beside the judged checks (#302). */
export const STEALTH_STYLE: PlayStyle = "stealth-first";

/**
 * The SRD 5.2 XP needed for levels 1–7. Characters stop at level 5; levels 6
 * and 7 are here only so the XP check can tell how far XP would carry one
 * (a level-5 module's limit is level 6, passed at 23,000 XP).
 */
const SRD_LEVEL_XP = [0, 300, 900, 2700, 6500, 14000, 23000] as const;

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
  kits: readonly Readonly<{ kit: KitId; level: number; rate: number }>[];
  required: number;
}>;

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

/** How often one attack kills each ordinary enemy, against the cap. */
export type OneHitKillCheck = Readonly<{
  ok: boolean;
  level: number;
  percentile: number;
  cap: number;
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
  }>[];
  /** The ordinary enemies over the cap; more than half of them fails. */
  overCap: OneHitKillCheck["enemies"];
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
  oneHitKill: OneHitKillCheck;
  xp: XpCheck;
  /** Reported, not judged (#335). */
  rests: RestReport;
  /** Reported, not judged (#302); absent when not asked for. */
  stealthFirst?: StealthFirstReport;
  /**
   * Reported, not judged (#304): each reaction policy, for a module with a
   * reaction-eligible encounter; absent otherwise, or when not asked for.
   */
  reactions?: readonly ReactionPolicyReport[];
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
  oneHitKill: Omit<OneHitKillCheck, "ok" | "cap" | "overCap" | "bonusAction"> &
    Readonly<{
      bonusAction?: Readonly<{ enemies: OneHitKillCheck["enemies"] }>;
    }>;
  xp: XpCheck;
  rests: RestReport;
  stealthFirst?: StealthFirstReport;
  reactions?: readonly ReactionPolicyReport[];
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
     * Whether to play and report both reaction policies (#304) for a module
     * with a reaction-eligible encounter; true by default. Never judged.
     */
    reportReactions?: boolean;
  }>;

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
 * every weapon in `placed` wielded with the default kit's armour, each with
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
      const ranged = (WEAPONS[gear] as WeaponData).ammunition !== undefined;
      const sheet = characterAtLevel(dice, level, kit, ranged, gear, classId);
      return {
        kit,
        gear,
        sheet: validateCharacter({
          ...sheet,
          equipment: [
            ...STARTING_KITS[kit].equipment.filter((item) => !isWeaponId(item)),
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
    reportReactions = true,
    classId = DEFAULT_CLASS,
  }: GateOptions = {},
): GateResult {
  const { min, max } = adventure.recommendedLevels;
  const classKits = CLASSES[classId].kits;
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
    // Both reaction policies are reported where a reaction can be rolled.
    const reacting =
      reportReactions &&
      adventure.encounters.some(({ reaction }) => reaction !== undefined);
    /**
     * The weakest character's cautious runs with each kit at each level, on
     * seeded checks and with every check failing. A seeded run that made no
     * check is the always-fail run on its seed too, so only runs that made
     * one are played again. Beside them, its stealth-first runs on seeded
     * checks (#302), and its cautious runs taking the peaceful option of a
     * reaction roll (#304).
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
        const runs = seeds.map((seed) => {
          const run = playAdventure(seeded, GATE_STYLE, seed, limit);
          return {
            seeded: run,
            failing:
              run.checks === 0
                ? run
                : playAdventure(failing, GATE_STYLE, seed, limit),
            stealth: reportStealth
              ? playAdventure(seeded, STEALTH_STYLE, seed, limit)
              : undefined,
            peaceful: reacting
              ? playAdventure(seeded, GATE_STYLE, seed, {
                  ...limit,
                  reactions: "peaceful",
                })
              : undefined,
          };
        });
        return { kit, level, runs };
      }),
    );
    /** A branch's runs: none for a stealth or peaceful branch not played. */
    const branchRuns = (
      runs: (typeof played)[number]["runs"],
      branch: "seeded" | "failing" | "stealth" | "peaceful",
    ) => runs.flatMap((run) => run[branch] ?? []);
    const survivalOf = (
      checks: CheckPolicy,
      branch: "seeded" | "failing" | "stealth" | "peaceful",
      style: PlayStyle = GATE_STYLE,
    ): GateMeasures["survival"] => {
      const kits = played.map(({ kit, level, runs }) => {
        const each = branchRuns(runs, branch);
        return {
          kit,
          level,
          rate:
            each.filter(({ outcome }) => outcome !== "defeat").length /
            each.length,
        };
      });
      const weakestKit = kits.reduce((worst, entry) =>
        entry.rate < worst.rate ? entry : worst,
      );
      return {
        checks,
        level: weakestKit.level,
        percentile: WEAKEST_PERCENTILE,
        style,
        runs: seeds.length,
        rate: weakestKit.rate,
        kit: weakestKit.kit,
        kits,
      };
    };
    const survival = survivalOf("seeded", "seeded");
    const alwaysFail = survivalOf("always-fail", "failing");
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
          ...survivalOf("seeded", "stealth", STEALTH_STYLE),
          completionRate:
            stealthy.filter(({ outcome }) => outcome === objective).length /
            stealthy.length,
          meanBypassed: mean(stealthy.map(({ bypassed }) => bypassed)),
          meanXp: mean(stealthy.map(({ xp }) => xp)),
        }
      : undefined;
    const policyReport = (
      policy: ReactionPolicy,
      branch: "seeded" | "peaceful",
    ): ReactionPolicyReport => {
      const runs = played.flatMap(({ runs: each }) => branchRuns(each, branch));
      return {
        ...survivalOf("seeded", branch),
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
    const strong = strongestAttackers(
      strongest!.dice,
      max as Level,
      placed,
      classId,
    );
    const enemies = adventure.encounters.flatMap(
      ({ id: encounterId, opponents }) =>
        opponents.flatMap(({ id, name, statBlock, boss }) =>
          boss === true
            ? []
            : [
                {
                  encounterId,
                  opponentId: id,
                  name,
                  ...bestOneHitKill(strong, statBlock),
                },
              ],
        ),
    );
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
      enemies,
      ...(prepared ? { bonusAction: { enemies: withBonusAction } } : {}),
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
    const xp: XpCheck = {
      ok: endLevel <= max + 1,
      available,
      alwaysSucceed,
      startXp,
      endLevel,
      levelLimit: max + 1,
    };

    return {
      ok: true,
      verdict: gateVerdictAt(
        {
          adventureId: adventure.id,
          classId,
          survival,
          alwaysFail,
          oneHitKill,
          xp,
          rests,
          ...(stealthFirst === undefined ? {} : { stealthFirst }),
          ...(reactions === undefined ? {} : { reactions }),
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
  const judged = (measured: GateMeasures["survival"]): SurvivalCheck => {
    const { checks, level, percentile, style, runs, rate, kit, kits } =
      measured;
    return {
      ok: rate >= thresholds.survival,
      checks,
      level,
      percentile,
      style,
      runs,
      rate,
      kit,
      kits,
      required: thresholds.survival,
    };
  };
  const survival = judged(measures.survival);
  const alwaysFail = judged(measures.alwaysFail);
  const { enemies } = measures.oneHitKill;
  const overCap = enemies.filter(
    ({ chance }) => chance > thresholds.oneHitKillCap,
  );
  const prepared = measures.oneHitKill.bonusAction;
  const oneHitKill: OneHitKillCheck = {
    ok: overCap.length * 2 <= enemies.length,
    level: measures.oneHitKill.level,
    percentile: measures.oneHitKill.percentile,
    cap: thresholds.oneHitKillCap,
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
  };
  return {
    adventureId: measures.adventureId,
    classId: measures.classId,
    difficulty,
    qualified: survival.ok && alwaysFail.ok && oneHitKill.ok && measures.xp.ok,
    survival,
    alwaysFail,
    oneHitKill,
    xp: measures.xp,
    rests: measures.rests,
    ...(measures.stealthFirst === undefined
      ? {}
      : { stealthFirst: measures.stealthFirst }),
    ...(measures.reactions === undefined
      ? {}
      : { reactions: measures.reactions }),
  };
}

/**
 * The classes the gate qualifies every module for (#310), in the order
 * creation offers them: a module qualifies only if it qualifies for each.
 */
export const GATE_CLASSES: readonly ClassId[] = ["fighter", "rogue"];

/**
 * The classes the gate plays and reports but doesn't judge yet (#339): the
 * Cleric and the Wizard (#340), until the caster policies come (#348). A module's verdict never
 * depends on them.
 */
export const REPORTED_CLASSES: readonly ClassId[] = ["cleric", "wizard"];

/**
 * A reported class's runs on a module (#339), never judged: at the module's
 * levels the class reaches yet (none when it reaches none of them), the
 * weakest character's cautious runs on seeded checks with each kit, and
 * the healing spells it cast a run; or why the harness couldn't play it.
 */
export type ReportedClass = Readonly<{ classId: ClassId }> &
  (
    | Readonly<{ ok: true; levels: readonly Level[] }>
    | Readonly<{
        ok: true;
        levels: readonly Level[];
        survival: GateMeasures["survival"];
        meanHealingSpells: number;
        /** Spells cast a run, of any kind (#340). */
        meanSpellsCast: number;
      }>
    | Readonly<{
        ok: false;
        failure: Readonly<{ code: BalanceFailureCode; message: string }>;
      }>
  );

/**
 * Plays `classId` on `adventure` for the gate's report (#339): the weakest
 * character's cautious runs at each module level the class reaches, with
 * each kit, on seeded checks.
 */
export function reportClass(
  adventure: FifthAdventure,
  classId: ClassId,
  {
    seeds = Array.from({ length: DEFAULT_SEED_COUNT }, (_, seed) => seed),
    sampleSize,
    sampleSeed,
    stepLimit,
  }: Omit<GateOptions, "classId" | "reportStealth" | "reportReactions"> = {},
): ReportedClass {
  const definition = CLASSES[classId];
  const { min, max } = adventure.recommendedLevels;
  const levels = Array.from(
    { length: max - min + 1 },
    (_, index) => (min + index) as Level,
  ).filter((level) => level <= classMaxLevel(definition));
  if (levels.length === 0) {
    return { classId, ok: true, levels };
  }
  try {
    const [weakest] = percentileCharacters({
      percentiles: [WEAKEST_PERCENTILE],
      classId,
      ...(sampleSize === undefined ? {} : { sampleSize }),
      ...(sampleSeed === undefined ? {} : { sampleSeed }),
    });
    const limit = stepLimit === undefined ? {} : { stepLimit };
    const played = levels.flatMap((level) =>
      definition.kits.map((kit) => {
        const runtime = createFifthRuntime(
          adventure,
          characterAtLevel(
            weakest!.dice,
            level,
            kit,
            false,
            undefined,
            classId,
          ),
        );
        return {
          kit,
          level,
          runs: seeds.map((seed) =>
            playAdventure(runtime, GATE_STYLE, seed, limit),
          ),
        };
      }),
    );
    const kits = played.map(({ kit, level, runs }) => ({
      kit,
      level,
      rate:
        runs.filter(({ outcome }) => outcome !== "defeat").length / runs.length,
    }));
    const weakestKit = kits.reduce((worst, entry) =>
      entry.rate < worst.rate ? entry : worst,
    );
    return {
      classId,
      ok: true,
      levels,
      survival: {
        checks: "seeded",
        level: weakestKit.level,
        percentile: WEAKEST_PERCENTILE,
        style: GATE_STYLE,
        runs: seeds.length,
        rate: weakestKit.rate,
        kit: weakestKit.kit,
        kits,
      },
      meanHealingSpells: mean(
        played.flatMap(({ runs }) => runs.map(({ healing }) => healing.spells)),
      ),
      meanSpellsCast: mean(
        played.flatMap(({ runs }) => runs.map(({ spellsCast }) => spellsCast)),
      ),
    };
  } catch (error) {
    if (error instanceof BalanceError) {
      return {
        classId,
        ok: false,
        failure: { code: error.code, message: error.message },
      };
    }
    throw error;
  }
}

/** The gate's verdict on a module for every class in `GATE_CLASSES`. */
export type ModuleGateResult = Readonly<{
  adventureId: string;
  /** Whether the module qualifies for every class. */
  qualified: boolean;
  /** Each class's result, in `GATE_CLASSES` order. */
  classes: readonly Readonly<{ classId: ClassId; result: GateResult }>[];
  /**
   * Each class in `REPORTED_CLASSES`, reported and never judged (#339);
   * absent when the gate leaves them out (`reportClasses`).
   */
  reported?: readonly ReportedClass[];
}>;

/**
 * Gates `adventure` for every class in `GATE_CLASSES` (`gateAdventure` for
 * each, with `options`): it qualifies only if every class qualifies. Each
 * class in `REPORTED_CLASSES` is played and reported beside them (#339),
 * unless `reportClasses` is false, as `passesGate` leaves it.
 */
export function gateModule(
  adventure: FifthAdventure,
  {
    reportClasses = true,
    ...options
  }: Omit<GateOptions, "classId"> & Readonly<{ reportClasses?: boolean }> = {},
): ModuleGateResult {
  const classes = GATE_CLASSES.map((classId) => ({
    classId,
    result: gateAdventure(adventure, { ...options, classId }),
  }));
  const { seeds, sampleSize, sampleSeed, stepLimit } = options;
  return {
    adventureId: adventure.id,
    qualified: classes.every(
      ({ result }) => result.ok && result.verdict.qualified,
    ),
    classes,
    ...(reportClasses
      ? {
          reported: REPORTED_CLASSES.map((classId) =>
            reportClass(adventure, classId, {
              ...(seeds === undefined ? {} : { seeds }),
              ...(sampleSize === undefined ? {} : { sampleSize }),
              ...(sampleSeed === undefined ? {} : { sampleSeed }),
              ...(stepLimit === undefined ? {} : { stepLimit }),
            }),
          ),
        }
      : {}),
  };
}

/** Each module gated so far, by its content: the verdict never changes. */
const gated = new Map<string, boolean>();

/**
 * Whether `adventure` passes the gate at its declared difficulty for every
 * class with the default options (`gateModule`), as the browser offers
 * modules.
 */
export function passesGate(adventure: FifthAdventure): boolean {
  const key = JSON.stringify(adventure);
  let passed = gated.get(key);
  if (passed === undefined) {
    passed = gateModule(adventure, {
      reportStealth: false,
      reportReactions: false,
      reportClasses: false,
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
  const { survival, alwaysFail, oneHitKill, xp } = verdict;
  const mark = (ok: boolean) => (ok ? "pass" : "FAIL");
  const over = oneHitKill.overCap;
  const deadly = (check: SurvivalCheck, title: string) =>
    `  ${title}, ${mark(check.ok)}: the level ${check.level}, ${check.percentile}th percentile ${who} playing ${check.style} survived ${percent(check.rate)} of ${check.runs} runs with its weakest kit, ${check.kit} (${kits(check)}); ${verdict.difficulty} needs ${percent(check.required)}.`;
  const succeeded = xp.alwaysSucceed;
  const stealth = verdict.stealthFirst;
  const kits = (check: Pick<SurvivalCheck, "kits">) =>
    check.kits
      .map(({ kit, level, rate }) => `${kit} level ${level} ${percent(rate)}`)
      .join(", ");
  return [
    `${name} ${verdict.qualified ? "qualifies" : "does not qualify"} as ${verdict.difficulty} for the ${who}.`,
    deadly(survival, "Too deadly"),
    deadly(alwaysFail, "Too deadly when every check fails"),
    `  Too easy, ${mark(oneHitKill.ok)}: the level ${oneHitKill.level}, ${oneHitKill.percentile}th percentile ${who} kills ` +
      (over.length === 0
        ? `no ordinary enemy with one attack more than ${percent(oneHitKill.cap)} of the time.`
        : `${over.length} of ${oneHitKill.enemies.length} ordinary enemies with one attack more than ${percent(oneHitKill.cap)} of the time: ${over
            .map(
              ({ name: enemy, chance, kit, gear }) =>
                `${enemy} ${percent(chance)} (${gear === undefined ? kit : `found ${gear}`})`,
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
    `  XP, ${mark(xp.ok)}: its ${Math.max(xp.available, succeeded.mostXp)} XP takes a character from ${xp.startXp} XP to level ${xp.endLevel}; the limit is level ${xp.levelLimit}.`,
    `  Rests, reported (not judged): on seeded checks the level ${verdict.rests.level}, ${verdict.rests.percentile}th percentile ${who} playing ${verdict.rests.style} took ${decimal(verdict.rests.meanShort)} short and ${decimal(verdict.rests.meanLong)} long rests a run; ${decimal(verdict.rests.meanInterrupted)} rests a run were interrupted.`,
    `  When every check succeeds, the level ${succeeded.level}, ${succeeded.percentile}th percentile ${who} playing ${succeeded.style} earned at most ${succeeded.mostXp} of the ${xp.available} XP offered in ${succeeded.runs} ${succeeded.runs === 1 ? "run" : "runs"}.`,
    ...(stealth === undefined
      ? []
      : [
          `  Stealth-first, reported (not judged): the level ${stealth.level}, ${stealth.percentile}th percentile ${who} playing ${stealth.style} survived ${percent(stealth.rate)} of ${stealth.runs} runs with its weakest kit, ${stealth.kit} (${kits(stealth)}); over every kit and level it completed ${percent(stealth.completionRate)}, slipped past ${decimal(stealth.meanBypassed)} fights and earned ${decimal(stealth.meanXp)} XP a run.`,
        ]),
    ...(verdict.reactions ?? []).map(
      (report) =>
        `  Reactions, ${report.policy === "attack" ? "always attacking" : "taking the peaceful option"}, reported (not judged): the level ${report.level}, ${report.percentile}th percentile ${who} playing ${report.style} survived ${percent(report.rate)} of ${report.runs} runs with its weakest kit, ${report.kit} (${kits(report)}); over every kit and level it completed ${percent(report.completionRate)}, ended ${decimal(report.meanPeaceful)} encounters peacefully and earned ${decimal(report.meanXp)} XP a run.`,
    ),
  ].join("\n");
}

/**
 * The gate's verdict on a module for every class as plain text: each
 * class's `renderGateResult`, in `GATE_CLASSES` order.
 */
export function renderModuleGateResult(
  adventure: Pick<FifthAdventure, "id" | "title" | "recommendedLevels">,
  result: ModuleGateResult,
): string {
  return [
    ...result.classes.map(({ classId, result: gate }) =>
      renderGateResult(adventure, gate, classId),
    ),
    ...(result.reported ?? []).map((report) =>
      renderReportedClass(adventure, report),
    ),
  ].join("\n");
}

/** A reported class's runs (#339) as plain text: never judged. */
export function renderReportedClass(
  adventure: Pick<FifthAdventure, "id" | "title" | "recommendedLevels">,
  report: ReportedClass,
): string {
  const who = CLASSES[report.classId].name;
  const name = `${adventure.title} (${adventure.id})`;
  if (!report.ok) {
    return `${name} could not be played for the ${who}, reported (not judged): ${report.failure.code}. ${report.failure.message}`;
  }
  if (!("survival" in report)) {
    const { min, max } = adventure.recommendedLevels;
    return `${name} for the ${who}, not reported: the ${who} reaches only level ${classMaxLevel(CLASSES[report.classId])} yet, and the module is for level ${min === max ? min : `${min}–${max}`}.`;
  }
  const { survival } = report;
  const kits = survival.kits
    .map(({ kit, level, rate }) => `${kit} level ${level} ${percent(rate)}`)
    .join(", ");
  return `${name} for the ${who}, reported (not judged): the level ${survival.level}, ${survival.percentile}th percentile ${who} playing ${survival.style} survived ${percent(survival.rate)} of ${survival.runs} runs with its weakest kit, ${survival.kit} (${kits}), casting ${decimal(report.meanSpellsCast)} spells a run, ${decimal(report.meanHealingSpells)} of them healing.`;
}
