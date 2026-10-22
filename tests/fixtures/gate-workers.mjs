// Gates shipped modules on worker threads (#469): one job per module and
// class (`gateAdventure`), at most GATE_WORKERS at once. A job still running
// after JOB_TIMEOUT_MS has its worker stopped and fails, naming its module
// and class, so a frozen gate fails instead of running on. The gate is
// synchronous, so node:test's own timeout can't stop it on the test's thread.
import { availableParallelism } from "node:os";
import { parentPort, Worker, workerData } from "node:worker_threads";

import { loadBuiltInFifthAdventures } from "../../dist/adventure-5e.js";
import {
  GATE_CLASSES,
  gateAdventure,
  moduleGateResult,
} from "../../dist/balance-5e.js";

/** The most gate jobs run at once, never more than the hardware threads. */
export const GATE_WORKERS = 8;

/** How long one module's gate for one class may run: a hang guard only. */
export const JOB_TIMEOUT_MS = 10 * 60_000;

// A worker gates one shipped module, by id, for one class, and posts back
// the result or the error.
if (workerData?.gateJob) {
  const { adventureId, classId } = workerData.gateJob;
  try {
    const adventure = (await loadBuiltInFifthAdventures()).find(
      ({ id }) => id === adventureId,
    );
    parentPort.postMessage({ result: gateAdventure(adventure, { classId }) });
  } catch (error) {
    parentPort.postMessage({ error: error.stack ?? String(error) });
  }
}

/** Runs one job on its own worker, stopped after `timeoutMs`. */
function runJob({ adventureId, classId }, timeoutMs, active) {
  const name = `${adventureId} for the ${classId}`;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { gateJob: { adventureId, classId } },
    });
    active.add(worker);
    let settled = false;
    const settle = (callback) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      active.delete(worker);
      void worker.terminate();
      callback();
    };
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new Error(
              `Gating ${name} ran past its ${timeoutMs / 1000}-second timeout and was stopped.`,
            ),
          ),
        ),
      timeoutMs,
    );
    worker.once("message", ({ result, error }) =>
      settle(() =>
        error === undefined
          ? resolve(result)
          : reject(new Error(`Gating ${name} failed: ${error}`)),
      ),
    );
    worker.once("error", (error) =>
      settle(() => reject(new Error(`Gating ${name} failed: ${error.stack}`))),
    );
    worker.once("exit", (code) =>
      settle(() =>
        reject(new Error(`Gating ${name} stopped with exit code ${code}.`)),
      ),
    );
  });
}

/** How much gating a module takes: its fights at each of its levels. */
const weight = ({ encounters, recommendedLevels: { min, max } }) =>
  encounters.length * (max - min + 1);

/**
 * The ids of `adventures` (shipped modules) dealt into `count` shares of
 * about equal gating, heaviest first onto the lightest share, for CI to gate
 * each share on its own runner (scripts/run-tests.mjs --ci-part).
 */
export function gateShares(adventures, count) {
  const shares = Array.from({ length: count }, () => ({ ids: [], load: 0 }));
  for (const adventure of [...adventures].sort(
    (a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id),
  )) {
    const lightest = shares.reduce((least, share) =>
      share.load < least.load ? share : least,
    );
    lightest.ids.push(adventure.id);
    lightest.load += weight(adventure);
  }
  return shares.map(({ ids }) => ids.sort());
}

/**
 * Each of `adventures`' (shipped modules) gate results, by id, as
 * `gateModule` gives them with the default options. The modules with the
 * most fights to gate start first, as the slowest jobs set the wall time.
 * The first job to fail stops the rest and rejects with its error.
 */
export async function gateInWorkers(
  adventures,
  { workers = GATE_WORKERS, timeoutMs = JOB_TIMEOUT_MS } = {},
) {
  const jobs = [...adventures]
    .sort((a, b) => weight(b) - weight(a))
    .flatMap(({ id }) =>
      GATE_CLASSES.map((classId) => ({ adventureId: id, classId })),
    );
  const results = new Map();
  const active = new Set();
  let next = 0;
  let failed = false;
  const runner = async () => {
    while (next < jobs.length && !failed) {
      const job = jobs[next];
      next += 1;
      results.set(
        `${job.adventureId} ${job.classId}`,
        await runJob(job, timeoutMs, active),
      );
    }
  };
  const width = Math.max(
    1,
    Math.min(workers, availableParallelism(), jobs.length),
  );
  try {
    await Promise.all(Array.from({ length: width }, runner));
  } catch (error) {
    failed = true;
    await Promise.all([...active].map((worker) => worker.terminate()));
    throw error;
  }
  return new Map(
    adventures.map(({ id }) => [
      id,
      moduleGateResult(
        id,
        GATE_CLASSES.map((classId) => ({
          classId,
          result: results.get(`${id} ${classId}`),
        })),
      ),
    ]),
  );
}
