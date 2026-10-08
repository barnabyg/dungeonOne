// A fixed, engine-free CPU workload for timing budgets. CI runners differ in
// speed by nearly 2× between runs of the same commit, and other processes
// sharing the cores slow a process down, so a budget in plain CPU seconds
// fails on the machine, not the code. A budget scaled by this workload's time,
// measured in the same process, tracks the machine instead.

/** The reference workload's CPU seconds on the machine the budgets were set on. */
export const REFERENCE_SECONDS = 0.41;

/**
 * Work like the engine's, without the engine: small objects, maps, filtered
 * and sorted arrays, strings and seeded integer arithmetic.
 */
function referenceWork() {
  let seed = 1;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  let total = 0;
  for (let round = 0; round < 40; round++) {
    const counts = new Map();
    let list = [];
    for (let i = 0; i < 20000; i++) {
      const roll = (next() % 20) + 1;
      const entry = {
        id: `c${i % 500}`,
        roll,
        hp: next() % 30,
        tags: [roll > 10 ? "hit" : "miss"],
      };
      list.push(entry);
      counts.set(entry.id, {
        ...counts.get(entry.id),
        ...entry,
        count: (counts.get(entry.id)?.count ?? 0) + 1,
      });
    }
    list = list
      .filter(({ hp }) => hp > 3)
      .map((entry) => ({ ...entry, hp: entry.hp - 1 }));
    list.sort((a, b) => a.roll - b.roll || a.hp - b.hp);
    total +=
      JSON.stringify([...counts.values()].slice(0, 200)).length + list.length;
  }
  return total;
}

/** The CPU seconds `work` takes in this process. */
export function cpuSeconds(work) {
  const started = process.cpuUsage();
  work();
  const { user, system } = process.cpuUsage(started);
  return (user + system) / 1_000_000;
}

/** The reference workload's CPU seconds now: the fastest of three, warmed up. */
export function referenceSeconds() {
  cpuSeconds(referenceWork);
  return Math.min(
    cpuSeconds(referenceWork),
    cpuSeconds(referenceWork),
    cpuSeconds(referenceWork),
  );
}

/**
 * The CPU seconds `work` would take on the machine the budgets were set on:
 * its CPU seconds here, scaled by how much slower the reference workload runs
 * here, timed before and after it to follow a machine that slows midway.
 */
export function referenceCpuSeconds(work) {
  const before = referenceSeconds();
  const seconds = cpuSeconds(work);
  const after = referenceSeconds();
  return (seconds * REFERENCE_SECONDS) / ((before + after) / 2);
}
