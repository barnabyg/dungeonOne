// Readers for what the 5e browser server saves: the character library and
// the one adventure session saved beside it.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** The first character in the library at `libraryPath`. */
export const readAda = async (libraryPath) =>
  JSON.parse(await readFile(libraryPath, "utf8")).characters[0];

/**
 * The saved session in `directory`, whose library is `characters.json`: the
 * one JSON file in `characters-adventures`.
 */
export const sessionFile = async (directory) => {
  const folder = join(directory, "characters-adventures");
  const [name] = (await readdir(folder)).filter((file) =>
    file.endsWith(".json"),
  );
  return JSON.parse(await readFile(join(folder, name), "utf8"));
};
