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
  classOf,
  DEFAULT_CLASS,
  buildCharacter,
  defaultPlacement,
  characterProfile,
  LEVEL_XP,
  masteryOptions,
  pendingLevelChoice,
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
  type FightingStyle,
  type Level,
} from "./class-5e.js";
import { createSeededRandom } from "./random.js";
import {
  isWeaponId,
  STARTING_KITS,
  WEAPONS,
  type KitId,
  type WeaponData,
  type WeaponId,
} from "./equipment-5e.js";
import {
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
} from "./runtime-5e.js";

export { CHECK_POLICIES, type CheckPolicy };

/** The class the harness, the gate and the career simulation play (#300). */
const HARNESS_CLASS = CLASSES[DEFAULT_CLASS];

/** Every starting kit of that class, as creation offers them. */
export const KITS = HARNESS_CLASS.kits;

/**
 * The gate's level-4 choice (#286). The Ability Score Improvement's two
 * points go one at a time to the first ability below 20 in the order: the
 * attack ability (Strength, or Dexterity for the Dexterity-first build), then
 * the class's ability priority; so +2 to the attack ability unless that passes
 * 20. The fourth mastery is `preferred` (a placed weapon the gate tries)
 * when it can be mastered, or else the first of `MASTERY_WEAPONS` not
 * mastered yet: the longsword, after the default dagger, mace and shortsword.
 */
export function gateLevelChoice(
  sheet: CharacterSheet,
  archer = false,
  preferred?: WeaponId,
): LevelChoice {
  const order: readonly Ability[] = [
    archer ? "dexterity" : "strength",
    ...classOf(sheet).abilityPriority,
  ];
  const scores = { ...sheet.abilities };
  const increase: Partial<Record<Ability, 1 | 2>> = {};
  for (let point = 0; point < 2; point++) {
    const ability = order.find((entry) => scores[entry] < ABILITY_SCORE_CAP)!;
    scores[ability] += 1;
    increase[ability] = increase[ability] === undefined ? 1 : 2;
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
 * A level-`level` character of the harness's class from one creation's dice, placed and chosen as a
 * fresh creation starts but with `kit`, at full health. An `archer` is
 * Dexterity-first instead (#230): the rolls placed on Strength and
 * Dexterity change places, and the +2 goes on Dexterity. From level 4 it
 * makes the gate's level choice (`gateLevelChoice`), preferring to master
 * `mastery`.
 */
export function characterAtLevel(
  dice: RolledDice,
  level: Level,
  kit: KitId = HARNESS_CLASS.defaults.kit,
  archer = false,
  mastery?: WeaponId,
): CharacterSheet {
  const placement = defaultPlacement(dice);
  const created = buildCharacter("0".repeat(32), "Balance", dice, {
    ...HARNESS_CLASS.defaults,
    ...(archer
      ? {
          placement: {
            ...placement,
            strength: placement.dexterity,
            dexterity: placement.strength,
          },
          increase: { dexterity: 2, constitution: 1 },
        }
      : { placement }),
    kit,
  });
  const raised = { ...created, level, xp: LEVEL_XP[level] };
  const sheet = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  return pendingLevelChoice(sheet) === undefined
    ? sheet
    : applyLevelChoice(sheet, gateLevelChoice(sheet, archer, mastery));
}

/** The sum of a default creation's six ability modifiers. */
function totalModifier(dice: RolledDice): number {
  return Object.values(characterAtLevel(dice, 1).abilities).reduce(
    (sum, score) => sum + abilityModifier(score),
    0,
  );
}

export type CharacterSample = Readonly<{
  percentiles: readonly number[];
  /** How many creations to roll; 10,000 by default. */
  sampleSize?: number;
  /** The seed the creations are rolled from. */
  sampleSeed?: number;
}>;

export type PercentileCharacter = Readonly<{
  percentile: number;
  dice: RolledDice;
  totalModifier: number;
}>;

/** Each sample rolled so far, ranked, by size and seed: the same every time. */
const rankedSamples = new Map<
  string,
  readonly Omit<PercentileCharacter, "percentile">[]
>();

/**
 * Rolls `sampleSize` creations from `sampleSeed` and returns the creation at
 * each percentile, ranked by total ability modifier. Creations with the same
 * total keep the order they were rolled in, so the result is deterministic.
 */
export function percentileCharacters({
  percentiles,
  sampleSize = 10_000,
  sampleSeed = 134,
}: CharacterSample): readonly PercentileCharacter[] {
  const key = `${sampleSize}:${sampleSeed}`;
  let ranked = rankedSamples.get(key);
  if (ranked === undefined) {
    const random = createSeededRandom(sampleSeed);
    ranked = Array.from({ length: sampleSize }, () => {
      const dice = rollAbilitySet(random);
      return { dice, totalModifier: totalModifier(dice) };
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
): number {
  const attack = playerCombatant(sheet).attack;
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
  /** P(a kill) with `dice` dice of the weapon plus its modifier. */
  const kills = (dice: number, critical: boolean) => {
    let totals = new Map([[attack.damage.modifier, 1]]);
    for (let die = 0; die < dice; die++) {
      const next = new Map<number, number>();
      for (const [total, chance] of totals) {
        for (let face = 1; face <= attack.damage.sides; face++) {
          const counted = countedDamageDie(face, attack.greatWeaponFighting);
          next.set(
            total + counted,
            (next.get(total + counted) ?? 0) + chance / attack.damage.sides,
          );
        }
      }
      totals = next;
    }
    return [...totals].reduce(
      (sum, [total, chance]) =>
        sum + chance * killedBy(Math.max(0, total), critical),
      0,
    );
  };
  /** P(the kept d20 is `d20`), with disadvantage keeping the lower of two. */
  const rolled = (d20: number) =>
    (attack.disadvantage ?? []).length === 0
      ? 1 / 20
      : ((21 - d20) ** 2 - (20 - d20) ** 2) / 400;
  // Graze: a miss deals the damage modifier, if above 0.
  const grazeKills =
    attack.mastery === "Graze" && attack.damage.modifier > 0
      ? killedBy(attack.damage.modifier, false)
      : 0;
  let chance = 0;
  for (let d20 = 1; d20 <= 20; d20++) {
    if (d20 !== 1 && d20 >= attack.criticalRange) {
      chance += kills(attack.damage.dice * 2, true) * rolled(d20);
    } else if (d20 !== 1 && d20 + attack.bonus >= enemy.armorClass) {
      chance += kills(attack.damage.dice, false) * rolled(d20);
    } else {
      chance += grazeKills * rolled(d20);
    }
  }
  return chance;
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
 * passable only with its key carried, and otherwise the plan fetches the key.
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
   * With `keys` "any", key-only doors count as open.
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
        if (
          next === undefined ||
          done.has(next) ||
          !enterable(next) ||
          talkOnly.has(passage.id) ||
          position.blockedPassageIds.includes(passage.id) ||
          (keys === "carried" &&
            keyOnly(passage) &&
            !position.inventory.includes(passage.door!.keyItemId!))
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
 */
export const PLAY_STYLES = ["direct", "cautious", "avoid-optional"] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

const HEAL_BELOW: Readonly<Record<PlayStyle, number>> = {
  direct: 1 / 4,
  cautious: 1 / 2,
  "avoid-optional": 1 / 4,
};

/**
 * Every kind of action the harness knows: the styles play them, or pass
 * them over. A kind missing here fails to compile; one the runtime offers
 * that the harness has never heard of fails the run as `unsupported-action`.
 */
const PLAYED_ACTIONS: Readonly<Record<ActionKind, true>> = {
  attack: true,
  // Passed over: no style sneaks yet, each enters a fight by moving (#301).
  sneak: true,
  "light-attack": true,
  use: true,
  "second-wind": true,
  "action-surge": true,
  "end-turn": true,
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
  talk: true,
  // Gear changes are never needed to get through, so no style makes one.
  equip: true,
  unequip: true,
  swap: true,
  drop: true,
  // Trading only spends what the character found, so no style trades.
  buy: true,
  sell: true,
  "sell-equipped": true,
  "sell-treasure": true,
  leave: true,
};

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
  healing: Readonly<{ secondWinds: number; potions: number; hp: number }>;
  /** Hit points lost to traps sprung, outside the fights. */
  trapDamage: number;
  /** What a surviving ending credited: XP and how many finds of treasure or coin. */
  xp: number;
  treasure: number;
  actions: number;
  /** How many checks the run made (#285). */
  checks: number;
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
 * starting as a browser session does, with `begin`. Throws a `BalanceError`
 * when an opponent has a trait the engine does not apply (the run would not
 * be the fight a player meets), the runtime offers an action no style can
 * play, the run takes more than `stepLimit` actions, or it is stranded:
 * alive, with no action left that leads on or out.
 */
export function playAdventure(
  runtime: FifthRuntime,
  style: PlayStyle,
  seed: number,
  { stepLimit = 2000 }: Readonly<{ stepLimit?: number }> = {},
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
  const items = new Map(
    adventure.rooms.flatMap((room) =>
      room.items.map((item) => [item.id, { item, roomId: room.id }] as const),
    ),
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
  const healing = { secondWinds: 0, potions: 0, hp: 0 };
  let trapDamage = 0;
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
            id: roomById.get(state.roomId)!.encounterId!,
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

  /** The fight action to take now. */
  const fightChoice = (views: readonly ActionView[]): ActionView => {
    const encounter = state.encounter!;
    const hpOf = (id: string) => combatant(encounter, id).hp;
    const heal = [
      ...offered(views, "second-wind"),
      ...offered(views, "use"),
    ][0];
    if (heal !== undefined && low(hpOf(PLAYER_ID))) {
      return heal;
    }
    // The weakest opponent first; ties go to the first listed.
    const attack = offered(views, "attack").reduce<ActionView | undefined>(
      (best, view) =>
        best === undefined || hpOf(view.target!.id) < hpOf(best.target!.id)
          ? view
          : best,
      undefined,
    );
    // The Light extra attack follows an attack, on the weakest opponent too.
    const light = offered(views, "light-attack").reduce<ActionView | undefined>(
      (best, view) =>
        best === undefined || hpOf(view.target!.id) < hpOf(best.target!.id)
          ? view
          : best,
      undefined,
    );
    return (
      attack ??
      light ??
      offered(views, "action-surge")[0] ??
      offered(views, "end-turn")[0]!
    );
  };

  /** Whether the character carries loot: treasure, or coin found here. */
  const carriesLoot = () =>
    state.inventory.some((id) => items.get(id)!.item.kind === "treasure") ||
    state.usedItemIds.some((id) => items.get(id)!.item.kind === "coin");
  /**
   * Whether an item hidden in a feature with a check can no longer be found:
   * the check is made, and the band of its last try (#284) did not reveal
   * the item (#285).
   */
  const lost = (itemId: string, hiddenIn: string | undefined) => {
    const made = state.checks.findLast(
      ({ id }) => id === `examine:${hiddenIn}`,
    );
    return (
      made !== undefined &&
      !effectsOf(siteChecks.get(made.id)?.bands?.[made.band]).some(
        (effect) => effect.type === "item" && effect.item === itemId,
      )
    );
  };
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
        !lost(item.id, item.hiddenIn)
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
    const room = roomById.get(state.roomId)!;
    const searchable = new Set([
      ...room.features.map(({ id }) => id),
      ...(adventure.encounters
        .find(({ id }) => id === room.encounterId)
        ?.opponents.map(({ id }) => id) ?? []),
    ]);
    const find =
      offered(views, "examine").find(
        ({ target }) =>
          searchable.has(target!.id) &&
          !state.examinedFeatureIds.includes(target!.id),
      ) ?? offered(views, "take")[0];
    if (find !== undefined) {
      return find;
    }
    const potion = offered(views, "use")[0];
    if (potion !== undefined && low(state.character.hp)) {
      return potion;
    }
    if (style === "cautious") {
      const careful = [
        ...offered(views, "search"),
        ...offered(views, "disarm"),
      ][0];
      if (careful !== undefined) {
        return careful;
      }
    }
    const goal = objectiveRooms();
    for (;;) {
      const position: Position = {
        roomId: state.roomId,
        inventory: state.inventory,
        clearedEncounterIds: state.clearedEncounterIds,
        blockedPassageIds: blocked,
      };
      const enterable = (targets: ReadonlySet<string>) => (id: string) =>
        (!winning.has(id) || targets.has(id)) &&
        (style === "direct" ||
          required.has(id) ||
          (style === "cautious" && !fightIn(position, id)));
      const aside = detours(position);
      const path =
        plan(position, aside, enterable(aside)) ??
        plan(position, goal, enterable(goal)) ??
        plan(position, exits, enterable(exits));
      // Detours first; then, once the goal is a way out and it is reached,
      // leave (if this room is no exit, nothing is left to do).
      if (path === undefined || path.length < 2) {
        return offered(views, "leave")[0];
      }
      const next = path[1]!;
      const move = offered(views, "move").find(
        ({ target }) => target!.id === next,
      );
      if (move !== undefined) {
        return move;
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
    const projected = runtime.projectActions(state);
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
      throw new BalanceError(
        "stranded",
        `${adventure.id}: a ${style} run${runtime.checks === "seeded" ? "" : ` with ${runtime.checks} checks`} was stranded in ${state.roomId}${made.length === 0 ? "" : `, after ${made.join(", ")}`}.`,
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
    trapDamage,
    xp: settlement?.xp.reduce((sum, { xp }) => sum + xp, 0) ?? 0,
    treasure:
      settlement === undefined
        ? 0
        : settlement.finds.length + settlement.coin.length,
    actions,
    checks: state.checks.length,
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
    meanHp: number;
  }>;
  meanTrapDamage: number;
  meanXp: number;
  meanTreasure: number;
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
      meanHp: mean(runs.map(({ healing }) => healing.hp)),
    },
    meanTrapDamage: mean(runs.map(({ trapDamage }) => trapDamage)),
    meanXp: mean(runs.map(({ xp }) => xp)),
    meanTreasure: mean(runs.map(({ treasure }) => treasure)),
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
  }: BalanceOptions = {},
): BalanceResult {
  try {
    const { objective, roomIds } = requiredPath(adventure);
    const characters = percentileCharacters({
      percentiles,
      ...(sampleSize === undefined ? {} : { sampleSize }),
      ...(sampleSeed === undefined ? {} : { sampleSeed }),
    });
    const { min, max } = adventure.recommendedLevels;
    const cells: BalanceCell[] = [];
    for (let level = min as Level; level <= max; level++) {
      for (const { percentile, dice } of characters) {
        const sheet = characterAtLevel(dice, level);
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
  const lines = [
    `${adventure.title} (${report.adventureId})${report.checks === "seeded" ? "" : `, with ${report.checks} checks`}`,
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
        `Level ${cell.level}, ${cell.percentile}th percentile character. One-hit kill: ${cell.oneHitKill
          .map(({ name, chance }) => `${name} ${percent(chance)}`)
          .join(", ")}`,
      );
    }
    lines.push(
      `  ${cell.style}: survived ${percent(cell.survivalRate)}, completed ${percent(cell.completionRate)} of ${cell.runs}; ` +
        `XP ${decimal(cell.meanXp)}, treasure ${decimal(cell.meanTreasure)}; ` +
        `healed ${decimal(cell.healing.meanHp)} HP (Second Wind ${decimal(cell.healing.meanSecondWinds)}, potions ${decimal(cell.healing.meanPotions)}); ` +
        `trap damage ${decimal(cell.meanTrapDamage)}`,
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
    fightingStyle: FightingStyle;
  }>[];
  /** The ordinary enemies over the cap; more than half of them fails. */
  overCap: OneHitKillCheck["enemies"];
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
  difficulty: Difficulty;
  qualified: boolean;
  /** The survival check on seeded checks. */
  survival: SurvivalCheck;
  /** The same check with every check in its worst band (#285). */
  alwaysFail: SurvivalCheck;
  oneHitKill: OneHitKillCheck;
  xp: XpCheck;
}>;

/**
 * What the gate measures of a module, before it is judged at a difficulty:
 * none of it depends on the difficulty declared.
 */
export type GateMeasures = Readonly<{
  adventureId: string;
  survival: Omit<SurvivalCheck, "ok" | "required">;
  alwaysFail: Omit<SurvivalCheck, "ok" | "required">;
  oneHitKill: Omit<OneHitKillCheck, "ok" | "cap" | "overCap">;
  xp: XpCheck;
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
>;

/** One way the strongest character may be armed, as the gate tries it. */
export type Attacker = Readonly<{
  kit: KitId;
  /** A weapon the module places or a merchant sells, wielded instead. */
  gear?: WeaponId;
  fightingStyle: FightingStyle;
  sheet: CharacterSheet;
}>;

/**
 * The ways the gate arms the character rolled with `dice` at `level`: every
 * starting kit, and every weapon in `placed` wielded with the default kit's
 * armour, each with every Fighting Style, the default first. A placed ranged
 * weapon is wielded by the Dexterity-first build of the same dice (#230).
 */
export function strongestAttackers(
  dice: RolledDice,
  level: Level,
  placed: readonly WeaponId[] = [],
): readonly Attacker[] {
  const armed = [
    ...KITS.map((kit) => ({
      kit,
      sheet: characterAtLevel(dice, level, kit),
    })),
    ...placed.map((gear) => {
      const kit = HARNESS_CLASS.defaults.kit;
      const ranged = (WEAPONS[gear] as WeaponData).ammunition !== undefined;
      const sheet = characterAtLevel(dice, level, kit, ranged, gear);
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
  const styles = [
    HARNESS_CLASS.defaults.fightingStyle,
    ...(Object.keys(FIGHTING_STYLES) as FightingStyle[]).filter(
      (style) => style !== HARNESS_CLASS.defaults.fightingStyle,
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
): Readonly<{
  chance: number;
  kit: KitId;
  gear?: WeaponId;
  fightingStyle: FightingStyle;
}> {
  return attackers
    .map(({ sheet, ...found }) => ({
      chance: oneHitKillChance(sheet, enemy),
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
  }: GateOptions = {},
): GateResult {
  const { min, max } = adventure.recommendedLevels;
  try {
    const [weakest, strongest] = percentileCharacters({
      percentiles: [WEAKEST_PERCENTILE, STRONGEST_PERCENTILE],
      ...(sampleSize === undefined ? {} : { sampleSize }),
      ...(sampleSeed === undefined ? {} : { sampleSeed }),
    });
    const levels = Array.from(
      { length: max - min + 1 },
      (_, index) => (min + index) as Level,
    );
    const limit = stepLimit === undefined ? {} : { stepLimit };
    /**
     * The weakest character's cautious runs with each kit at each level, on
     * seeded checks and with every check failing. A seeded run that made no
     * check is the always-fail run on its seed too, so only runs that made
     * one are played again.
     */
    const played = levels.flatMap((level) =>
      KITS.map((kit) => {
        const sheet = characterAtLevel(weakest!.dice, level, kit);
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
          };
        });
        return { kit, level, runs };
      }),
    );
    const survivalOf = (
      checks: CheckPolicy,
      branch: "seeded" | "failing",
    ): GateMeasures["survival"] => {
      const kits = played.map(({ kit, level, runs }) => ({
        kit,
        level,
        rate:
          runs.filter((run) => run[branch].outcome !== "defeat").length /
          runs.length,
      }));
      const weakestKit = kits.reduce((worst, entry) =>
        entry.rate < worst.rate ? entry : worst,
      );
      return {
        checks,
        level: weakestKit.level,
        percentile: WEAKEST_PERCENTILE,
        style: GATE_STYLE,
        runs: seeds.length,
        rate: weakestKit.rate,
        kit: weakestKit.kit,
        kits,
      };
    };
    const survival = survivalOf("seeded", "seeded");
    const alwaysFail = survivalOf("always-fail", "failing");

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
    const strong = strongestAttackers(strongest!.dice, max as Level, placed);
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
    const oneHitKill: GateMeasures["oneHitKill"] = {
      level: max,
      percentile: STRONGEST_PERCENTILE,
      enemies,
    };

    const available =
      adventure.encounters.reduce(
        (sum, { opponents }) =>
          sum +
          opponents.reduce(
            (total, { statBlock, surrender }) =>
              total +
              Math.max(
                statBlock.xp,
                Math.floor(statBlock.xp / 2) + (surrender?.xp ?? 0),
              ),
            0,
          ),
        0,
      ) + Math.max(0, ...adventure.endings.map(({ xp }) => xp ?? 0));
    // The always-succeed branch: every way a check can open is open, and the
    // character fights every fight it finds.
    const succeeding = createFifthRuntime(
      adventure,
      characterAtLevel(strongest!.dice, max as Level),
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
        { adventureId: adventure.id, survival, alwaysFail, oneHitKill, xp },
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
  const oneHitKill: OneHitKillCheck = {
    ok: overCap.length * 2 <= enemies.length,
    level: measures.oneHitKill.level,
    percentile: measures.oneHitKill.percentile,
    cap: thresholds.oneHitKillCap,
    enemies,
    overCap,
  };
  return {
    adventureId: measures.adventureId,
    difficulty,
    qualified: survival.ok && alwaysFail.ok && oneHitKill.ok && measures.xp.ok,
    survival,
    alwaysFail,
    oneHitKill,
    xp: measures.xp,
  };
}

/** Each module gated so far, by its content: the verdict never changes. */
const gated = new Map<string, boolean>();

/**
 * Whether `adventure` passes the gate at its declared difficulty with the
 * default options, as the browser offers modules.
 */
export function passesGate(adventure: FifthAdventure): boolean {
  const key = JSON.stringify(adventure);
  let passed = gated.get(key);
  if (passed === undefined) {
    const result = gateAdventure(adventure);
    passed = result.ok && result.verdict.qualified;
    gated.set(key, passed);
  }
  return passed;
}

/**
 * The gate's verdict as plain text: whether the module qualifies at its
 * declared difficulty, then each check, naming the ordinary enemies over
 * the one-hit-kill cap.
 */
export function renderGateResult(
  adventure: Pick<FifthAdventure, "id" | "title">,
  result: GateResult,
): string {
  const name = `${adventure.title} (${adventure.id})`;
  if (!result.ok) {
    return `${name} does not qualify: ${result.failure.code}. ${result.failure.message}`;
  }
  const { verdict } = result;
  const { survival, alwaysFail, oneHitKill, xp } = verdict;
  const mark = (ok: boolean) => (ok ? "pass" : "FAIL");
  const over = oneHitKill.overCap;
  const deadly = (check: SurvivalCheck, title: string) =>
    `  ${title}, ${mark(check.ok)}: the level ${check.level}, ${check.percentile}th percentile character playing ${check.style} survived ${percent(check.rate)} of ${check.runs} runs with its weakest kit, ${check.kit} (${check.kits
      .map(({ kit, level, rate }) => `${kit} level ${level} ${percent(rate)}`)
      .join(", ")}); ${verdict.difficulty} needs ${percent(check.required)}.`;
  const succeeded = xp.alwaysSucceed;
  return [
    `${name} ${verdict.qualified ? "qualifies" : "does not qualify"} as ${verdict.difficulty}.`,
    deadly(survival, "Too deadly"),
    deadly(alwaysFail, "Too deadly when every check fails"),
    `  Too easy, ${mark(oneHitKill.ok)}: the level ${oneHitKill.level}, ${oneHitKill.percentile}th percentile character kills ` +
      (over.length === 0
        ? `no ordinary enemy with one attack more than ${percent(oneHitKill.cap)} of the time.`
        : `${over.length} of ${oneHitKill.enemies.length} ordinary enemies with one attack more than ${percent(oneHitKill.cap)} of the time: ${over
            .map(
              ({ name: enemy, chance, kit, gear }) =>
                `${enemy} ${percent(chance)} (${gear === undefined ? kit : `found ${gear}`})`,
            )
            .join(", ")}.${oneHitKill.ok ? "" : " No more than half may be."}`),
    `  XP, ${mark(xp.ok)}: its ${Math.max(xp.available, succeeded.mostXp)} XP takes a character from ${xp.startXp} XP to level ${xp.endLevel}; the limit is level ${xp.levelLimit}.`,
    `  When every check succeeds, the level ${succeeded.level}, ${succeeded.percentile}th percentile character playing ${succeeded.style} earned at most ${succeeded.mostXp} of the ${xp.available} XP offered in ${succeeded.runs} ${succeeded.runs === 1 ? "run" : "runs"}.`,
  ].join("\n");
}
