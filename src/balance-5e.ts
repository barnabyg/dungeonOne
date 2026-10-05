/**
 * The 5e balance harness: plays an adventure module through the real runtime
 * and reports how dangerous it is.
 *
 * Characters are sampled from the 4d6-drop-lowest distribution and placed
 * with the creation defaults (`defaultPlacement`, `FIGHTER_DEFAULT_CHOICES`),
 * so the harness plays the characters a player gets by default. "Weak" and
 * "strong" are percentiles of that sample by total ability modifier.
 */
import type {
  EndingKind,
  FifthAdventure,
  FifthPassage,
  StatBlock,
} from "./adventure-5e.js";
import {
  ABILITIES,
  abilityModifier,
  buildFighter,
  defaultPlacement,
  FIGHTER_DEFAULT_CHOICES,
  fighterProfile,
  keptTotal,
  rollAbilitySet,
  validateFighter,
  type FighterSheet,
  type Level,
  type RolledDice,
} from "./fighter-5e.js";
import { createSeededRandom } from "./random.js";
import { combatant } from "./encounter-5e.js";
import {
  actionOf,
  createFifthRuntime,
  PLAYER_ID,
  playerCombatant,
  type ActionKind,
  type ActionView,
  type FifthAction,
  type FifthRuntime,
} from "./runtime-5e.js";

/** The XP a character needs to reach each level. */
const LEVEL_XP: Readonly<Record<Level, number>> = { 1: 0, 2: 300, 3: 900 };

/**
 * A level-`level` Fighter from one creation's dice, placed and chosen as a
 * fresh creation starts, at full health.
 */
export function fighterAtLevel(dice: RolledDice, level: Level): FighterSheet {
  const created = buildFighter("0".repeat(32), "Balance", dice, {
    ...FIGHTER_DEFAULT_CHOICES,
    placement: defaultPlacement(dice),
  });
  const raised = { ...created, level, xp: LEVEL_XP[level] };
  return validateFighter({ ...raised, hp: fighterProfile(raised).maxHp });
}

/** The sum of a default creation's six ability modifiers. */
function totalModifier(dice: RolledDice): number {
  const placement = defaultPlacement(dice);
  const increase: Readonly<Partial<Record<string, number>>> =
    FIGHTER_DEFAULT_CHOICES.increase;
  return ABILITIES.reduce(
    (sum, ability) =>
      sum +
      abilityModifier(
        keptTotal(dice[placement[ability]]!) + (increase[ability] ?? 0),
      ),
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
  const random = createSeededRandom(sampleSeed);
  const ranked = Array.from({ length: sampleSize }, () => {
    const dice = rollAbilitySet(random);
    return { dice, totalModifier: totalModifier(dice) };
  }).sort((a, b) => a.totalModifier - b.totalModifier);
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
 * The chance that one attack by `sheet`'s character, without advantage or
 * disadvantage, takes `enemy` from full hit points to 0: a natural 1 misses,
 * a roll in the critical range hits and doubles the damage dice, and any
 * other roll hits when it meets the enemy's AC. The attack is the one the
 * runtime gives the character, so Fighting Style and level are counted.
 */
export function oneHitKillChance(
  sheet: FighterSheet,
  enemy: Pick<StatBlock, "armorClass"> &
    Readonly<{ hitPoints: Pick<StatBlock["hitPoints"], "average"> }>,
): number {
  const attack = playerCombatant(sheet).attack;
  const hp = enemy.hitPoints.average;
  /** P(damage ≥ hp) with `dice` dice of the weapon plus its modifier. */
  const kills = (dice: number) => {
    let totals = new Map([[attack.damage.modifier, 1]]);
    for (let die = 0; die < dice; die++) {
      const next = new Map<number, number>();
      for (const [total, chance] of totals) {
        for (let face = 1; face <= attack.damage.sides; face++) {
          next.set(
            total + face,
            (next.get(total + face) ?? 0) + chance / attack.damage.sides,
          );
        }
      }
      totals = next;
    }
    return [...totals].reduce(
      (sum, [total, chance]) => sum + (total >= hp ? chance : 0),
      0,
    );
  };
  let chance = 0;
  for (let d20 = 2; d20 <= 20; d20++) {
    if (d20 >= attack.criticalRange) {
      chance += kills(attack.damage.dice * 2) / 20;
    } else if (d20 + attack.bonus >= enemy.armorClass) {
      chance += kills(attack.damage.dice) / 20;
    }
  }
  return chance;
}

/** Why the harness can't qualify a module: a named reason, never a pass. */
export type BalanceFailureCode =
  "unreachable-objective" | "unsupported-action" | "step-limit";

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
 * Plans routes on the adventure's map. A route costs one fight for each room
 * with a fight not yet won, and a little per move, so the planner prefers the
 * fewest fights, then the fewest moves. A door with a check counts as
 * passable until it blocks the passage; a door only a key opens counts as
 * passable only with its key carried, and otherwise the plan fetches the key.
 */
function routePlanner(adventure: FifthAdventure) {
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

function treasureRooms(adventure: FifthAdventure): ReadonlySet<string> {
  return new Set(
    adventure.rooms.flatMap(({ id, items }) =>
      items.some(({ kind }) => kind === "treasure") ? [id] : [],
    ),
  );
}

function exitRooms(adventure: FifthAdventure): ReadonlySet<string> {
  return new Set(
    adventure.rooms.flatMap(({ id, exit }) => (exit === true ? [id] : [])),
  );
}

/** The adventure's objective: a victory if it has one, or else loot. */
function objectiveOf(adventure: FifthAdventure): Objective {
  return victoryRooms(adventure).size > 0
    ? "victory"
    : treasureRooms(adventure).size > 0
      ? "escape-with-loot"
      : "escape-without-loot";
}

/**
 * The adventure's objective and the rooms a character must go through to
 * reach it, in the order first entered: to the victory fight; or to the
 * treasure behind the fewest fights and then out by the nearest exit; or
 * just out. Keys that open the way are fetched on the way. Every other room
 * is optional, and so is every fight in one.
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
        ? [treasureRooms(adventure), exitRooms(adventure)]
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
        throw new BalanceError(
          "unreachable-objective",
          `${adventure.id}: no route reaches its ${objective} objective.`,
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
 * Every kind of action the styles know how to play. A kind missing here
 * fails to compile; one the runtime offers that the harness has never heard
 * of fails the run as `unsupported-action`.
 */
const PLAYED_ACTIONS: Readonly<Record<ActionKind, true>> = {
  attack: true,
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
  leave: true,
};

/** One fight in a run. */
export type FightRecord = Readonly<{
  id: string;
  /** Damage the character took in the fight, before any healing. */
  hpLost: number;
  rounds: number;
  outcome: "victory" | "defeat";
}>;

/** One playthrough. `stranded` means alive with no way on and no way out. */
export type RunRecord = Readonly<{
  outcome: EndingKind | "stranded";
  /** Rooms in the order first entered. */
  roomIds: readonly string[];
  encounters: readonly FightRecord[];
  healing: Readonly<{ secondWinds: number; potions: number; hp: number }>;
  /** Damage taken from traps sprung, outside the fights. */
  trapDamage: number;
  /** What a surviving ending credited: XP and how many treasures. */
  xp: number;
  treasure: number;
  actions: number;
}>;

/**
 * Plays one run of `runtime`'s adventure in `style` with dice from `seed`,
 * starting as a browser session does, with `begin`. Throws a `BalanceError`
 * when the runtime offers an action no style can play or the run takes more
 * than `stepLimit` actions.
 */
export function playAdventure(
  runtime: FifthRuntime,
  style: PlayStyle,
  seed: number,
  { stepLimit = 2000 }: Readonly<{ stepLimit?: number }> = {},
): RunRecord {
  const { adventure } = runtime;
  const { plan, roomById, fightIn } = routePlanner(adventure);
  const required = new Set(requiredPath(adventure).roomIds);
  const objective = objectiveOf(adventure);
  const winning = victoryRooms(adventure);
  const exits = exitRooms(adventure);
  const maxHp = fighterProfile(runtime.sheet).maxHp;
  const items = new Map(
    adventure.rooms.flatMap((room) =>
      room.items.map((item) => [item.id, { item, roomId: room.id }] as const),
    ),
  );
  const random = createSeededRandom(seed);

  let state = runtime.createSession();
  const roomIds = [state.roomId];
  const fights: FightRecord[] = [];
  let fight: { id: string; hpLost: number } | undefined;
  const healing = { secondWinds: 0, potions: 0, hp: 0 };
  let trapDamage = 0;
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
          fight = { id: roomById.get(state.roomId)!.encounterId!, hpLost: 0 };
          break;
        case "attack":
          if (event.targetId === PLAYER_ID && fight !== undefined) {
            fight.hpLost += event.damage;
          }
          break;
        case "second-wind":
          healing.secondWinds += 1;
          healing.hp += event.healing;
          break;
        case "trap-damage":
          trapDamage += event.damage;
          break;
        case "potion":
          healing.potions += 1;
          healing.hp += event.healing;
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

  const low = (hp: number) => hp <= maxHp * HEAL_BELOW[style];
  const offered = (views: readonly ActionView[], kind: ActionKind) =>
    views.filter(({ action }) => action === kind);

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
    return (
      attack ??
      offered(views, "action-surge")[0] ??
      offered(views, "end-turn")[0]!
    );
  };

  const carriesTreasure = () =>
    state.inventory.some((id) => items.get(id)!.item.kind === "treasure");
  /** Where the objective lies from here. */
  const objectiveRooms = (): ReadonlySet<string> => {
    if (objective === "victory") {
      return winning;
    }
    const unfound = new Set(
      [...items.values()].flatMap(({ item, roomId }) =>
        item.kind === "treasure" && !state.inventory.includes(item.id)
          ? [roomId]
          : [],
      ),
    );
    return objective === "escape-with-loot" &&
      !carriesTreasure() &&
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
    const loot =
      offered(views, "examine").find(
        ({ target }) =>
          searchable.has(target!.id) &&
          !state.examinedFeatureIds.includes(target!.id),
      ) ?? offered(views, "take")[0];
    if (loot !== undefined) {
      return loot;
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
    const leave = offered(views, "leave")[0];
    if (leave !== undefined && goal === exits) {
      return leave;
    }
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
      if (path === undefined || path.length < 2) {
        return leave;
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
      break;
    }
    apply(actionOf(choice));
  }
  const ending = adventure.endings.find(({ id }) => id === state.endingId);
  const rewards = runtime.projectRewards(state);
  return {
    outcome: ending?.kind ?? "stranded",
    roomIds,
    encounters: fights,
    healing,
    trapDamage,
    xp: rewards?.xp.reduce((sum, { xp }) => sum + xp, 0) ?? 0,
    treasure: rewards?.treasure.length ?? 0,
    actions,
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
  sheet: FighterSheet,
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
        const sheet = fighterAtLevel(dice, level);
        const runtime = createFifthRuntime(adventure, sheet);
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
    `${adventure.title} (${report.adventureId})`,
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
