import assert from "node:assert/strict";
import test from "node:test";

import {
  RANDOM_ALGORITHM,
  createSeededRandom,
  resolveStartupSeed,
} from "../dist/random.js";

test("mulberry32-v1 matches fixed unsigned 32-bit output vectors", () => {
  assert.equal(RANDOM_ALGORITHM, "mulberry32-v1");

  const zero = createSeededRandom(0);
  assert.deepEqual(
    Array.from({ length: 5 }, () => zero.nextUint32()),
    [1144304738, 1416247, 958946056, 627933444, 2007157716],
  );

  const maximum = createSeededRandom(4_294_967_295);
  assert.deepEqual(
    Array.from({ length: 5 }, () => maximum.nextUint32()),
    [3850105811, 813802916, 3073704848, 4054706436, 3630262831],
  );
});

test("seeded die rolls are deterministic and bounded", () => {
  const first = createSeededRandom(305_419_896);
  const second = createSeededRandom(305_419_896);

  const firstRolls = [first.roll(20), first.roll(8), first.roll(6)];
  const secondRolls = [second.roll(20), second.roll(8), second.roll(6)];

  assert.deepEqual(firstRolls, secondRolls);
  assert.deepEqual(firstRolls, [3, 8, 6]);
});

test("startup seeds accept only decimal unsigned 32-bit values", () => {
  assert.equal(
    resolveStartupSeed(["--seed", "0"], () => 99),
    0,
  );
  assert.equal(
    resolveStartupSeed(["--seed=4294967295"], () => 99),
    4_294_967_295,
  );
  assert.equal(
    resolveStartupSeed([], () => 3_000_000_000),
    3_000_000_000,
  );

  for (const args of [
    ["--seed"],
    ["--seed", "-1"],
    ["--seed", "1.5"],
    ["--seed", "0x10"],
    ["--seed", "4294967296"],
    ["--seed", "1", "extra"],
    ["--unknown", "1"],
  ]) {
    assert.throws(() => resolveStartupSeed(args, () => 99), /seed|usage/i);
  }
});
