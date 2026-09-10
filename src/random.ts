export const RANDOM_ALGORITHM = "mulberry32-v1";

const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MAX = UINT32_RANGE - 1;

export type RandomSource = Readonly<{
  nextUint32(): number;
  roll(sides: number): number;
}>;

function requireUint32(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} must be an unsigned 32-bit integer.`);
  }
  return value;
}

export function createSeededRandom(seed: number): RandomSource {
  let state = requireUint32(seed, "Seed");

  function nextUint32(): number {
    state = (state + 0x6d2b_79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (mixed ^ (mixed >>> 14)) >>> 0;
  }

  return {
    nextUint32,
    roll(sides: number): number {
      if (!Number.isSafeInteger(sides) || sides <= 0) {
        throw new Error("Die sides must be a positive safe integer.");
      }
      return Math.floor((nextUint32() / UINT32_RANGE) * sides) + 1;
    },
  };
}

function parseSeed(value: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new Error("Seed must be a decimal unsigned 32-bit integer.");
  }
  return requireUint32(Number(value), "Seed");
}

export function resolveStartupSeed(
  args: readonly string[],
  chooseSeed: () => number,
): number {
  if (args.length === 0) {
    return requireUint32(chooseSeed(), "Generated seed");
  }

  if (args.length === 2 && args[0] === "--seed" && args[1] !== undefined) {
    return parseSeed(args[1]);
  }

  if (args.length === 1 && args[0]?.startsWith("--seed=") === true) {
    return parseSeed(args[0].slice("--seed=".length));
  }

  throw new Error("Usage: dungeon-one [--seed <0-4294967295>]");
}
