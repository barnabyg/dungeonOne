import { randomBytes } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";

/**
 * Replaces `path` with `bytes` through a synced temporary file and a rename,
 * so readers see either the old file or the new one, never a partial write.
 * Callers hold the path's file lock.
 */
export async function writeFileAtomically(
  path: string,
  bytes: string,
): Promise<void> {
  const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  const file = await open(temporary, "wx");
  try {
    await file.writeFile(bytes);
    await file.sync();
    await file.close();
    await rename(temporary, path);
  } finally {
    await file.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}
