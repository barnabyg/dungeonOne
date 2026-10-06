// Exclusive storage ownership (src/file-lock.ts), which the character library
// and adventure sessions take before every write.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { acquireFileLock } from "../dist/file-lock.js";

async function withDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "file-lock-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "a crashed owner's lock is released; concurrent recovery grants exactly one owner",
  { timeout: 10000 },
  () =>
    withDirectory(async (directory) => {
      const path = join(directory, "characters.json");
      const child = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { acquireFileLock } from ${JSON.stringify(new URL("../dist/file-lock.js", import.meta.url).href)}; await acquireFileLock(process.argv[1]); process.stdout.write("owned");`,
          path,
        ],
        { windowsHide: true },
      );
      try {
        const [ready] = await once(child.stdout, "data");
        assert.equal(ready.toString(), "owned");
        await assert.rejects(acquireFileLock(path), /busy/);
        const closed = once(child, "close");
        child.kill();
        await closed;
        const contenders = await Promise.allSettled(
          Array.from({ length: 8 }, () => acquireFileLock(path)),
        );
        const owners = contenders.filter(
          (result) => result.status === "fulfilled",
        );
        assert.equal(owners.length, 1);
        for (const result of contenders.filter(
          (result) => result.status === "rejected",
        )) {
          assert.match(result.reason.message, /busy/);
        }
        await owners[0].value();
        const next = await acquireFileLock(path);
        await next();
      } finally {
        child.kill();
      }
    }),
);

test("releasing twice is harmless, and the path can be owned again", () =>
  withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const release = await acquireFileLock(path);
    await release();
    await release();
    const again = await acquireFileLock(path);
    await again();
  }));

test("leftover lock files on disk neither block an owner nor are touched", () =>
  withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    await writeFile(`${path}.lock`, "");
    await writeFile(`${path}.turn-lock`, '{"pid":');
    const release = await acquireFileLock(path);
    await release();
    assert.equal(await readFile(`${path}.lock`, "utf8"), "");
    assert.equal(await readFile(`${path}.turn-lock`, "utf8"), '{"pid":');
  }));
