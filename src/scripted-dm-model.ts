import { readFile } from "node:fs/promises";

import type { DmModel, DmModelResponse } from "./dm-turn.js";

export async function loadScriptedDmModel(path: string): Promise<DmModel> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load scripted DM responses: ${message}`);
  }
  if (!Array.isArray(decoded)) {
    throw new Error("Scripted DM responses must be a JSON array.");
  }

  let responseIndex = 0;
  return {
    identity: { provider: "scripted", model: "scripted-dm-v1" },
    async respond(): Promise<DmModelResponse> {
      if (responseIndex >= decoded.length) {
        throw new Error("The scripted DM has no response remaining.");
      }
      const response = decoded[responseIndex];
      responseIndex += 1;
      await Promise.resolve();
      return response as DmModelResponse;
    },
  };
}
