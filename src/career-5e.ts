/**
 * The career simulation (#290): can a new level-1 character reach the top
 * level by playing the shipped modules?
 *
 * Over each seed, one new character (the gate's weakest, with the default
 * kit) plays the modules in the browser's order (`orderFifthAdventures`), each
 * once, as soon as its level reaches the module's minimum recommended level,
 * in the gate's style. Between modules it is settled as the character
 * library settles it (`settleFighter`): it keeps what it holds at the end and
 * is credited its XP, and it makes any pending level-4 choice by the gate's
 * policy (`gateLevelChoice`). A defeat ends the career there, as it does in
 * the library. The check passes when some career reaches the required level.
 *
 * The modules are taken as given: the browser offers only those that pass
 * the gate, and `tests/shipped-modules.test.mjs` asserts every shipped one
 * does.
 */
import {
  orderFifthAdventures,
  type EndingKind,
  type FifthAdventure,
} from "./adventure-5e.js";
import {
  DEFAULT_SEED_COUNT,
  fighterAtLevel,
  GATE_STYLE,
  gateLevelChoice,
  percentileCharacters,
  playAdventure,
  WEAKEST_PERCENTILE,
  type GateOptions,
  type PlayStyle,
} from "./balance-5e.js";
import {
  applyLevelChoice,
  FIGHTER_DEFAULT_CHOICES,
  MAX_LEVEL,
  pendingLevelChoice,
  settleFighter,
  type FighterSheet,
  type Level,
} from "./fighter-5e.js";
import { createFifthRuntime } from "./runtime-5e.js";
import type { KitId } from "./equipment-5e.js";

/** The level some career must reach: the top level, 5, since #291. */
export const CAREER_REQUIRED_LEVEL: Level = 5;

export type CareerOptions = GateOptions &
  Readonly<{
    /** The level some career must reach: `CAREER_REQUIRED_LEVEL` by default. */
    requiredLevel?: Level;
  }>;

/** One module a career played. */
export type CareerStep = Readonly<{
  adventureId: string;
  /** The character's level when it started the module. */
  level: Level;
  outcome: EndingKind;
  /** The XP the module credited: none after a defeat. */
  xp: number;
}>;

/** One career, to its last module or its fall. */
export type CareerRun = Readonly<{
  seed: number;
  steps: readonly CareerStep[];
  /** The sheet at the end: as last settled, or as it fell. */
  sheet: FighterSheet;
  /** The module it was defeated in, if it fell. */
  fellIn?: string;
}>;

/** One module across every career, in the order careers play them. */
export type CareerModule = Readonly<{
  adventureId: string;
  title: string;
  recommendedLevels: FifthAdventure["recommendedLevels"];
  /** How many careers played it, survived it and fell in it. */
  played: number;
  survived: number;
  fell: number;
  /** The lowest and highest level a career started it at. */
  levels?: Readonly<{ min: Level; max: Level }>;
  /** The mean XP it credited the careers that survived it. */
  meanXp: number;
}>;

export type CareerReport = Readonly<{
  /** Whether some career reached the required level. */
  ok: boolean;
  requiredLevel: Level;
  percentile: number;
  kit: KitId;
  style: PlayStyle;
  /** How many careers reached the required level, and what share. */
  reaching: number;
  reached: number;
  modules: readonly CareerModule[];
  runs: readonly CareerRun[];
}>;

/**
 * Plays a career through `adventures` on each seed and checks it against
 * the required level. Throws a `BalanceError` when a module can't be played
 * (see `playAdventure`).
 */
export function simulateCareer(
  adventures: readonly FifthAdventure[],
  {
    seeds = Array.from({ length: DEFAULT_SEED_COUNT }, (_, seed) => seed),
    requiredLevel = CAREER_REQUIRED_LEVEL,
    sampleSize,
    sampleSeed,
    stepLimit,
  }: CareerOptions = {},
): CareerReport {
  const ordered = orderFifthAdventures(adventures, () => true);
  const [weakest] = percentileCharacters({
    percentiles: [WEAKEST_PERCENTILE],
    ...(sampleSize === undefined ? {} : { sampleSize }),
    ...(sampleSeed === undefined ? {} : { sampleSeed }),
  });
  const kit = FIGHTER_DEFAULT_CHOICES.kit;
  const limit = stepLimit === undefined ? {} : { stepLimit };

  const runs = seeds.map((seed): CareerRun => {
    let sheet = fighterAtLevel(weakest!.dice, 1, kit);
    const steps: CareerStep[] = [];
    for (const adventure of ordered) {
      if (adventure.recommendedLevels.min > sheet.level) {
        continue;
      }
      if (pendingLevelChoice(sheet) !== undefined) {
        sheet = applyLevelChoice(sheet, gateLevelChoice(sheet));
      }
      const level = sheet.level;
      const run = playAdventure(
        createFifthRuntime(adventure, sheet),
        GATE_STYLE,
        seed,
        limit,
      );
      steps.push({
        adventureId: adventure.id,
        level,
        outcome: run.outcome,
        xp: run.xp,
      });
      if (run.settlement === undefined) {
        return { seed, steps, sheet, fellIn: adventure.id };
      }
      sheet = settleFighter(sheet, run.settlement);
    }
    return { seed, steps, sheet };
  });

  const modules = ordered.map((adventure): CareerModule => {
    const plays = runs.flatMap(({ steps }) =>
      steps.filter(({ adventureId }) => adventureId === adventure.id),
    );
    const survived = plays.filter(({ outcome }) => outcome !== "defeat");
    const levels = plays.map(({ level }) => level);
    return {
      adventureId: adventure.id,
      title: adventure.title,
      recommendedLevels: adventure.recommendedLevels,
      played: plays.length,
      survived: survived.length,
      fell: plays.length - survived.length,
      ...(levels.length === 0
        ? {}
        : {
            levels: {
              min: Math.min(...levels) as Level,
              max: Math.max(...levels) as Level,
            },
          }),
      meanXp:
        survived.length === 0
          ? 0
          : survived.reduce((sum, { xp }) => sum + xp, 0) / survived.length,
    };
  });
  const reaching = runs.filter(
    ({ sheet }) => sheet.level >= requiredLevel,
  ).length;
  return {
    ok: reaching > 0,
    requiredLevel,
    percentile: WEAKEST_PERCENTILE,
    kit,
    style: GATE_STYLE,
    reaching,
    reached: runs.length === 0 ? 0 : reaching / runs.length,
    modules,
    runs,
  };
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;
const range = ({ min, max }: Readonly<{ min: number; max: number }>) =>
  min === max ? `${min}` : `${min}–${max}`;
const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? "" : "s"}`;

/**
 * The career as plain text: whether it reaches the required level, then each
 * module in the order played with its survival and XP, how far careers got,
 * and where they fell.
 */
export function renderCareerResult(report: CareerReport): string {
  const { runs, reaching } = report;
  let step = 0;
  const lines = report.modules.map((module) => {
    const recommended = module.recommendedLevels;
    const name = `${module.title} (${module.adventureId}, level${recommended.min === recommended.max ? "" : "s"} ${range(recommended)})`;
    if (module.levels === undefined) {
      return `  ${name}: not played; no career reached level ${module.recommendedLevels.min} before it.`;
    }
    step += 1;
    return `  Step ${step}, ${name}: played by ${plural(module.played, "career")} at level ${range(module.levels)}, survived ${percent(module.survived / module.played)}, gained ${Math.round(module.meanXp)} XP on average${module.fell === 0 ? "" : `, fell ${module.fell}`}.`;
  });
  const levels = Array.from({ length: MAX_LEVEL }, (_, index) => index + 1)
    .map((level) => ({
      level,
      count: runs.filter(({ sheet }) => sheet.level === level).length,
    }))
    .filter(({ count }) => count > 0)
    .map(({ level, count }) => `level ${level} ${count}`);
  const fallen = runs.filter(({ fellIn }) => fellIn !== undefined).length;
  return [
    `Career of a level-1, ${report.percentile}th percentile Fighter with the ${report.kit} kit playing ${report.style} over ${plural(runs.length, "seed")}: ${reaching} of ${plural(runs.length, "career")} (${percent(report.reached)}) reach level ${report.requiredLevel}, the required level; ${report.ok ? "pass" : "FAIL"}.`,
    ...lines,
    `  Levels reached: ${levels.join(", ")}; ${fallen} of ${runs.length} fell.`,
  ].join("\n");
}
