import { open } from "node:fs/promises";
import { ADVENTURE_BYTE_LIMIT, loadAdventure } from "./adventure-loader.js";

export async function readBoundedFile(
  path: string,
  limit: number,
): Promise<Uint8Array> {
  const file = await open(path, "r");
  try {
    const stat = await file.stat();
    if (!stat.isFile()) {
      throw new Error("Expected a regular file.");
    }
    if (stat.size > limit) {
      throw new Error(`byte-limit: File exceeds ${limit} bytes.`);
    }
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length <= limit) {
      const { bytesRead } = await file.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (bytesRead === 0) {
        break;
      }
      length += bytesRead;
    }
    if (length > limit) {
      throw new Error(`byte-limit: File exceeds ${limit} bytes.`);
    }
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}

export async function loadAdventureFile(path: string) {
  try {
    return loadAdventure(await readBoundedFile(path, ADVENTURE_BYTE_LIMIT));
  } catch (error) {
    throw new Error(
      `Unable to read adventure file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
