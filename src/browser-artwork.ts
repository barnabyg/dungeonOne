import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export type BrowserArtwork = Readonly<{ src: string; alt: string }>;
export type BrowserArtworkPack = Readonly<{
  adventureId: string;
  version: string;
  locations: ReadonlyMap<string, BrowserArtwork>;
}>;

// Optional presentation assets live outside released adventure/save schemas.
// Load local raster files once, with no remote requests or model calls.
export async function loadBrowserArtwork(
  manifestPath: string,
): Promise<BrowserArtworkPack> {
  const invalid = () =>
    new Error(
      "Invalid artwork manifest. See the browser artwork instructions in README.md.",
    );
  if ((await stat(manifestPath)).size > 65536) {
    throw invalid();
  }
  const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    !("adventureId" in manifest) ||
    typeof manifest.adventureId !== "string" ||
    !manifest.adventureId.trim() ||
    !("version" in manifest) ||
    typeof manifest.version !== "string" ||
    !manifest.version.trim() ||
    !("locations" in manifest) ||
    !Array.isArray(manifest.locations) ||
    manifest.locations.length > 50
  ) {
    throw invalid();
  }
  const root = await realpath(dirname(resolve(manifestPath)));
  const locations = new Map<string, BrowserArtwork>();
  let total = 0;
  for (const entry of manifest.locations) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !("id" in entry) ||
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      locations.has(entry.id) ||
      !("file" in entry) ||
      typeof entry.file !== "string" ||
      !entry.file.trim() ||
      isAbsolute(entry.file) ||
      !("alt" in entry) ||
      typeof entry.alt !== "string" ||
      !entry.alt.trim() ||
      entry.alt.length > 300
    ) {
      throw invalid();
    }
    const file = await realpath(resolve(root, entry.file));
    const within = relative(root, file);
    if (
      !within ||
      isAbsolute(within) ||
      within === ".." ||
      within.startsWith("..\\") ||
      within.startsWith("../")
    ) {
      throw invalid();
    }
    const size = (await stat(file)).size;
    total += size;
    if (size > 2 * 1024 * 1024 || total > 20 * 1024 * 1024) {
      throw invalid();
    }
    const bytes = await readFile(file);
    const type = bytes
      .subarray(0, 8)
      .equals(Buffer.from("89504e470d0a1a0a", "hex"))
      ? "png"
      : bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
        ? "jpeg"
        : bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
            bytes.subarray(8, 12).toString("ascii") === "WEBP"
          ? "webp"
          : undefined;
    if (!type) {
      throw invalid();
    }
    locations.set(entry.id, {
      src: `data:image/${type};base64,${bytes.toString("base64")}`,
      alt: entry.alt,
    });
  }
  return {
    adventureId: manifest.adventureId,
    version: manifest.version,
    locations,
  };
}

export function artworkForLocation(
  pack: BrowserArtworkPack | undefined,
  adventure: Readonly<{ id: string; version: string }>,
  locationId: string,
): BrowserArtwork | undefined {
  return pack?.adventureId === adventure.id &&
    pack.version === adventure.version
    ? pack.locations.get(locationId)
    : undefined;
}
