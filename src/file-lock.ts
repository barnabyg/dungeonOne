import { randomBytes } from "node:crypto";
import { openSync, writeFileSync, closeSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";

/** Exclusive process ownership, including recovery after a dead owner. */
export async function acquireFileLock(
  path: string,
): Promise<() => Promise<void>> {
  const bytes = JSON.stringify({
    pid: process.pid,
    token: randomBytes(16).toString("hex"),
  });
  for (let attempt = 0; ; attempt++) {
    try {
      const descriptor = openSync(path, "wx");
      try {
        writeFileSync(descriptor, bytes);
      } finally {
        closeSync(descriptor);
      }
      break;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        ) ||
        attempt > 1
      ) {
        throw new Error("Character storage is busy; refresh before retrying.", {
          cause: error,
        });
      }
      const prior = await readFile(path, "utf8");
      const owner: unknown = JSON.parse(prior);
      if (
        owner === null ||
        typeof owner !== "object" ||
        !("pid" in owner) ||
        typeof owner.pid !== "number" ||
        !Number.isInteger(owner.pid) ||
        owner.pid <= 0
      ) {
        throw new Error("Character storage lock needs local recovery.");
      }
      try {
        process.kill(owner.pid, 0);
        throw new Error("Character storage is busy; refresh before retrying.");
      } catch (alive) {
        if (!(
          alive instanceof Error &&
          "code" in alive &&
          alive.code === "ESRCH"
        )) {
          throw alive;
        }
        if ((await readFile(path, "utf8")) !== prior) {
          throw new Error("Character storage ownership changed; refresh.");
        }
        await unlink(path);
      }
    }
  }
  return async () => {
    if ((await readFile(path, "utf8")) === bytes) {
      await unlink(path);
    }
  };
}
