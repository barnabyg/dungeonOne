import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createServer } from "node:net";

/** Exclusive ownership of a storage path. OS-owned IPC releases automatically
 * on process exit; no persisted owner file can be partly written or reclaimed
 * over another owner's replacement. Other platforms use a deterministic local
 * port; an unrelated port collision fails closed as busy. */
export async function acquireFileLock(
  path: string,
): Promise<() => Promise<void>> {
  const absolute = resolve(path);
  let canonical: string;
  try {
    canonical = await realpath(absolute);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
    canonical = join(await realpath(dirname(absolute)), basename(absolute));
  }
  const identity = createHash("sha256")
    .update(process.platform === "win32" ? canonical.toLowerCase() : canonical)
    .digest("hex");
  const endpoint =
    process.platform === "win32"
      ? {
          path: "\\\\.\\pipe\\dungeon-one-storage-" + identity,
          exclusive: true,
        }
      : process.platform === "linux"
        ? { path: "\0dungeon-one-storage-" + identity, exclusive: true }
        : {
            host: "127.0.0.1",
            port: 20000 + (Number.parseInt(identity.slice(0, 8), 16) % 40000),
            exclusive: true,
            reusePort: false,
          };
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolveOwnership, reject) => {
    server.once("error", (cause) => {
      reject(
        new Error(
          "Character storage is busy or unavailable; refresh before retrying.",
          { cause },
        ),
      );
    });
    server.listen(endpoint, resolveOwnership);
  });
  let released = false;
  return async () => {
    if (released) {
      return;
    }
    released = true;
    await new Promise<void>((resolveRelease, reject) => {
      server.close((error) => (error ? reject(error) : resolveRelease()));
    });
  };
}
