// Scripted dice for engine tests: each roll takes the next queued value, so a
// test states exactly what the dice show.
import assert from "node:assert/strict";

/**
 * Returns the queued `[sides, value]` pairs in order, checking each die's
 * sides. `drawn` records every roll as `{ sides, value }`; `remaining()` is
 * how many are left.
 */
export function dice(...queue) {
  const drawn = [];
  return {
    drawn,
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      drawn.push({ sides, value });
      return value;
    },
  };
}

/**
 * Returns the queued values in order, whatever the die. `drawn` records every
 * roll as `{ sides, value }`; `remaining()` is how many are left.
 */
export function uncheckedDice(...queue) {
  const drawn = [];
  return {
    drawn,
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const value = queue.shift();
      drawn.push({ sides, value });
      return value;
    },
  };
}
