import { fileURLToPath } from "node:url";
import { loadAdventureFile } from "./adventure-file.js";
import type { ValidatedAdventure } from "./adventure-loader.js";

export async function characterAdventures(): Promise<
  readonly ValidatedAdventure[]
> {
  const adventures: ValidatedAdventure[] = [];
  for (const name of ["hollow-beacon-characters"]) {
    const loaded = await loadAdventureFile(
      fileURLToPath(new URL(`../adventures/${name}.json`, import.meta.url)),
    );
    if (!loaded.ok) {
      throw new Error(`Invalid bundled character adventure: ${name}.`);
    }
    adventures.push(loaded.adventure);
  }
  return adventures;
}
