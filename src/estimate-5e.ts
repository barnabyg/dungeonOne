/**
 * Estimates an ad-hoc encounter's danger before it is written into a module.
 *
 * An author names bestiary monsters with counts and a level range. The
 * encounter becomes a one-room module whose start room holds the fight and
 * whose victory ends it (`encounterModule`), and the balance harness plays it
 * through the real runtime: every level, sampled character percentile,
 * starting kit and play style, once per seed. Its balance-gate verdict is
 * the gate's own, judged at every difficulty, so the numbers are those the
 * gate measures for a one-room module with the same fight.
 */
import {
  DIFFICULTIES,
  FIFTH_ADVENTURE_FORMAT,
  unsimulatedTraits,
  validateFifthAdventure,
  type Difficulty,
  type FifthAdventure,
} from "./adventure-5e.js";
import {
  BalanceError,
  bestOneHitKill,
  DEFAULT_PERCENTILES,
  DEFAULT_SEED_COUNT,
  DIFFICULTY_THRESHOLDS,
  fighterAtLevel,
  gateAdventure,
  gateVerdictAt,
  KITS,
  percentileCharacters,
  PLAY_STYLES,
  playAdventure,
  renderGateResult,
  strongestAttackers,
  type BalanceFailureCode,
  type BalanceOptions,
  type GateVerdict,
  type PlayStyle,
} from "./balance-5e.js";
import type { FifthBestiary, FifthMonster } from "./bestiary-5e.js";
import type { FightingStyle, Level } from "./fighter-5e.js";
import type { KitId } from "./equipment-5e.js";
import { createFifthRuntime } from "./runtime-5e.js";

/** The most opponents one encounter may have, as in a module. */
const MAX_OPPONENTS = 8;

/** The fight to estimate: bestiary monsters, each counted, and the levels. */
export type EncounterSpec = Readonly<{
  monsters: readonly Readonly<{ id: string; count: number }>[];
  levels: Readonly<{ min: number; max: number }>;
}>;

/** Why an encounter can't be estimated: a named reason, never a number. */
export type EstimateFailureCode = BalanceFailureCode | "unknown-monster";

/** One level, character percentile, kit and style, over every seed. */
export type EstimateCell = Readonly<{
  level: Level;
  percentile: number;
  kit: KitId;
  style: PlayStyle;
  runs: number;
  survivalRate: number;
  /** Hit points the character lost in the fight, before any healing. */
  meanHpLost: number;
  meanRounds: number;
}>;

/**
 * Each monster's chance of dying to one attack from full HP by the character
 * at one level and percentile, with the kit and Fighting Style that kill it
 * most often, and the difficulties whose cap it is over.
 */
export type EstimateOneHitKill = Readonly<{
  level: Level;
  percentile: number;
  monsters: readonly Readonly<{
    monsterId: string;
    name: string;
    chance: number;
    kit: KitId;
    fightingStyle: FightingStyle;
    overCaps: readonly Difficulty[];
  }>[];
}>;

export type EncounterEstimate = Readonly<{
  monsters: readonly Readonly<{
    id: string;
    name: string;
    count: number;
    xp: number;
  }>[];
  levels: Readonly<{ min: Level; max: Level }>;
  seeds: number;
  cells: readonly EstimateCell[];
  oneHitKill: readonly EstimateOneHitKill[];
  /** The gate's verdict on the fight's one-room module at each difficulty. */
  gate: Readonly<Record<Difficulty, GateVerdict>>;
}>;

export type EstimateResult =
  | Readonly<{ ok: true; estimate: EncounterEstimate }>
  | Readonly<{
      ok: false;
      failure: Readonly<{ code: EstimateFailureCode; message: string }>;
    }>;

class EstimateError extends Error {
  constructor(
    readonly code: EstimateFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "EstimateError";
  }
}

/**
 * The spec's monsters from `bestiary`, in order. A malformed spec throws an
 * `Error`; an unknown id or a trait the engine does not apply throws an
 * `EstimateError`.
 */
function specMonsters(
  bestiary: FifthBestiary,
  { monsters, levels }: EncounterSpec,
): readonly Readonly<{ monster: FifthMonster; count: number }>[] {
  if (monsters.length === 0) {
    throw new Error("An encounter needs at least one monster.");
  }
  if (
    !Number.isInteger(levels.min) ||
    !Number.isInteger(levels.max) ||
    levels.min < 1 ||
    levels.max > 3 ||
    levels.min > levels.max
  ) {
    throw new Error(
      "An encounter's levels must run from 1 to 3, lowest first.",
    );
  }
  const seen = new Set<string>();
  let total = 0;
  for (const { id, count } of monsters) {
    if (seen.has(id)) {
      throw new Error(`${id} is listed twice; give it one count.`);
    }
    seen.add(id);
    if (!Number.isInteger(count) || count < 1 || count > MAX_OPPONENTS) {
      throw new Error(
        `The count of ${id} must be a whole number from 1 to ${MAX_OPPONENTS}.`,
      );
    }
    total += count;
  }
  if (total > MAX_OPPONENTS) {
    throw new Error(
      `An encounter may have at most ${MAX_OPPONENTS} monsters, as in a module.`,
    );
  }
  return monsters.map(({ id, count }) => {
    const monster = bestiary.monsters.find((entry) => entry.id === id);
    if (monster === undefined) {
      throw new EstimateError(
        "unknown-monster",
        `${id} is not a monster in the bestiary.`,
      );
    }
    const [trait] = unsimulatedTraits(monster.statBlock);
    if (trait !== undefined) {
      throw new EstimateError(
        "unsimulated-trait",
        `${id} (${monster.statBlock.name}) has ${trait}, which the encounter engine does not simulate.`,
      );
    }
    return { monster, count };
  });
}

/** "Wolf ×2, Bandit": each monster's name, counted. */
function encounterTitle(
  monsters: readonly Readonly<{ monster: FifthMonster; count: number }>[],
): string {
  return monsters
    .map(({ monster, count }) =>
      count === 1
        ? monster.statBlock.name
        : `${monster.statBlock.name} ×${count}`,
    )
    .join(", ");
}

/**
 * The one-room module that holds just `spec`'s fight: the start room has it,
 * winning it ends the adventure in victory and losing it in defeat. Monsters
 * that share a name are numbered ("Goblin Minion 1"), so each is targetable.
 * It is declared hard; the gate's verdict at every difficulty is in the
 * estimate. A malformed spec or unknown id throws.
 */
export function encounterModule(
  bestiary: FifthBestiary,
  spec: EncounterSpec,
): FifthAdventure {
  return buildModule(bestiary, spec, specMonsters(bestiary, spec));
}

function buildModule(
  bestiary: FifthBestiary,
  spec: EncounterSpec,
  monsters: readonly Readonly<{ monster: FifthMonster; count: number }>[],
): FifthAdventure {
  const opponents = monsters.flatMap(({ monster, count }) =>
    Array.from({ length: count }, () => monster),
  );
  const named = new Map<string, number>();
  const opponentJson = opponents.map((monster, index) => {
    const name = monster.statBlock.name;
    const shared = opponents.filter(
      (other) => other.statBlock.name === name,
    ).length;
    const number = (named.get(name) ?? 0) + 1;
    named.set(name, number);
    return {
      id: `foe-${index + 1}`,
      monster: monster.id,
      ...(shared === 1 ? {} : { name: `${name} ${number}` }),
    };
  });
  const title = encounterTitle(monsters);
  return validateFifthAdventure(
    {
      kind: "dungeon-one-5e-adventure",
      formatVersion: FIFTH_ADVENTURE_FORMAT,
      id: "encounter-estimate",
      title: title.slice(0, 80),
      objective: "Win the fight.",
      recommendedLevels: { min: spec.levels.min, max: spec.levels.max },
      difficulty: "hard",
      startRoomId: "arena",
      rooms: [
        {
          id: "arena",
          name: "Arena",
          description: `The fight being estimated: ${title}.`,
          encounterId: "fight",
          features: [],
          items: [],
        },
      ],
      passages: [],
      encounters: [
        {
          id: "fight",
          opponents: opponentJson,
          victoryEndingId: "won",
          defeatEndingId: "lost",
        },
      ],
      endings: [
        {
          id: "won",
          kind: "victory",
          title: "The fight is won",
          text: "The last opponent falls.",
        },
        {
          id: "lost",
          kind: "defeat",
          title: "The fight is lost",
          text: "You fall.",
        },
      ],
    },
    bestiary,
  );
}

const mean = (values: readonly number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Plays `spec`'s fight as its one-room module (`encounterModule`) at each
 * level with each percentile character, starting kit and style, once per
 * seed, and gates that module at every difficulty with the same seeds and
 * sample. The options are the harness's (`BalanceOptions`), with its
 * defaults. Unknown bestiary ids, a monster with a trait the engine does not
 * apply, and anything else the harness can't play fail with a named reason;
 * a malformed spec throws. The same options always give the same estimate.
 */
export function estimateEncounter(
  bestiary: FifthBestiary,
  spec: EncounterSpec,
  {
    seeds = Array.from({ length: DEFAULT_SEED_COUNT }, (_, seed) => seed),
    percentiles = DEFAULT_PERCENTILES,
    styles = PLAY_STYLES,
    sampleSize,
    sampleSeed,
    stepLimit,
  }: BalanceOptions = {},
): EstimateResult {
  try {
    const monsters = specMonsters(bestiary, spec);
    const adventure = buildModule(bestiary, spec, monsters);
    const sample = {
      ...(sampleSize === undefined ? {} : { sampleSize }),
      ...(sampleSeed === undefined ? {} : { sampleSeed }),
    };
    const limit = stepLimit === undefined ? {} : { stepLimit };
    const characters = percentileCharacters({ percentiles, ...sample });
    const levels = {
      min: spec.levels.min as Level,
      max: spec.levels.max as Level,
    };
    const cells: EstimateCell[] = [];
    const oneHitKill: EstimateOneHitKill[] = [];
    for (let level = levels.min; level <= levels.max; level++) {
      for (const { percentile, dice } of characters) {
        const attackers = strongestAttackers(dice, level);
        oneHitKill.push({
          level,
          percentile,
          monsters: monsters.map(({ monster }) => {
            const best = bestOneHitKill(attackers, monster.statBlock);
            return {
              monsterId: monster.id,
              name: monster.statBlock.name,
              chance: best.chance,
              kit: best.kit,
              fightingStyle: best.fightingStyle,
              overCaps: DIFFICULTIES.filter(
                (difficulty) =>
                  best.chance > DIFFICULTY_THRESHOLDS[difficulty].oneHitKillCap,
              ),
            };
          }),
        });
        for (const kit of KITS) {
          const runtime = createFifthRuntime(
            adventure,
            fighterAtLevel(dice, level, kit),
          );
          for (const style of styles) {
            const runs = seeds.map((seed) =>
              playAdventure(runtime, style, seed, limit),
            );
            // The fight starts in the start room, so every run has it.
            const fights = runs.map(({ encounters }) => encounters[0]!);
            cells.push({
              level,
              percentile,
              kit,
              style,
              runs: runs.length,
              survivalRate:
                runs.filter(({ outcome }) => outcome !== "defeat").length /
                runs.length,
              meanHpLost: mean(fights.map(({ hpLost }) => hpLost)),
              meanRounds: mean(fights.map(({ rounds }) => rounds)),
            });
          }
        }
      }
    }
    const gated = gateAdventure(adventure, { seeds, ...sample, ...limit });
    if (!gated.ok) {
      return gated;
    }
    return {
      ok: true,
      estimate: {
        monsters: monsters.map(({ monster, count }) => ({
          id: monster.id,
          name: monster.statBlock.name,
          count,
          xp: monster.statBlock.xp,
        })),
        levels,
        seeds: seeds.length,
        cells,
        oneHitKill,
        gate: Object.fromEntries(
          DIFFICULTIES.map((difficulty) => [
            difficulty,
            gateVerdictAt(gated.verdict, difficulty),
          ]),
        ) as Record<Difficulty, GateVerdict>,
      },
    };
  } catch (error) {
    if (error instanceof EstimateError || error instanceof BalanceError) {
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

/** "easy", "easy and medium", "easy, medium and hard". */
function listed(words: readonly string[]): string {
  return words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)!}`;
}

/**
 * A plain-text estimate: the encounter, then for each level and character
 * percentile each monster's one-hit-kill chance against the caps and a line
 * per kit and style, then the gate's verdict at each difficulty.
 */
export function renderEstimate(result: EstimateResult): string {
  if (!result.ok) {
    return `The encounter can't be estimated: ${result.failure.code}. ${result.failure.message}`;
  }
  const { estimate } = result;
  const title = estimate.monsters
    .map(({ name, count }) => (count === 1 ? name : `${name} ×${count}`))
    .join(", ");
  const { min, max } = estimate.levels;
  const lines = [
    `${title} at ${min === max ? `level ${min}` : `levels ${min}–${max}`}, ${estimate.seeds} ${estimate.seeds === 1 ? "run" : "runs"} a cell.`,
  ];
  for (const { level, percentile, monsters } of estimate.oneHitKill) {
    lines.push(
      "",
      `Level ${level}, ${percentile}th percentile character. One-hit kill (best kit and Fighting Style): ${monsters
        .map(
          ({ name, chance, overCaps }) =>
            `${name} ${percent(chance)} (${
              overCaps.length === 0
                ? "under every cap"
                : `over the ${listed(overCaps)} ${overCaps.length === 1 ? "cap" : "caps"}`
            })`,
        )
        .join(", ")}`,
      ...estimate.cells
        .filter(
          (cell) => cell.level === level && cell.percentile === percentile,
        )
        .map(
          (cell) =>
            `  ${cell.kit}, ${cell.style}: survived ${percent(cell.survivalRate)}, ${decimal(cell.meanHpLost)} HP lost, ${decimal(cell.meanRounds)} rounds`,
        ),
    );
  }
  const module = { id: "encounter-estimate", title };
  for (const difficulty of DIFFICULTIES) {
    lines.push(
      "",
      renderGateResult(module, {
        ok: true,
        verdict: estimate.gate[difficulty],
      }),
    );
  }
  return lines.join("\n");
}
