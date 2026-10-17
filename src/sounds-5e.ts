/**
 * The sounds the browser plays (#480), by name, each with its file in
 * sounds/ and where that file came from. The server serves only these files,
 * and only while sound is on; the page maps a named sound to its URL.
 *
 * To add a sound, put a short, small file in sounds/ and name it here with
 * its source and licence. Prefer CC0 (such as Kenney's packs); a CC BY sound
 * also names its author, and the footer credits it.
 */
import { readFile } from "node:fs/promises";

export type SoundLicence = "CC0 1.0" | "CC BY 3.0" | "CC BY 4.0";

export type Sound = Readonly<{
  /** Its file in sounds/. */
  file: string;
  /** Where the file came from: a URL, or the script that makes it. */
  source: string;
  licence: SoundLicence;
  /** Who made it; required for CC BY, which the footer credits. */
  author?: string;
}>;

export const SOUNDS = {
  // When the Dungeon Master's reply is shown and it is the player's turn again.
  "reply-ready": {
    file: "reply-ready.wav",
    source: "scripts/make-sounds.mjs (made for Dungeon One)",
    licence: "CC0 1.0",
  },
} as const satisfies Readonly<Record<string, Sound>>;

export type SoundId = keyof typeof SOUNDS;

const TYPES: Readonly<Record<string, string>> = {
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
};

/** A sound file's media type, by its extension. */
export const soundType = (sound: Sound): string =>
  TYPES[sound.file.slice(sound.file.lastIndexOf(".") + 1)] ??
  "application/octet-stream";

/** The URL the page fetches a sound from. */
export const soundUrl = (sound: Sound): string => `/sounds/${sound.file}`;

/** Each named sound's URL, for the page's player. */
export function soundUrls(): Readonly<Record<SoundId, string>> {
  return Object.fromEntries(
    Object.entries(SOUNDS).map(([id, sound]) => [id, soundUrl(sound)]),
  ) as Record<SoundId, string>;
}

/** The sound served at `path`, if it is one of ours. */
export function soundAt(path: string): Sound | undefined {
  return Object.values(SOUNDS).find((sound) => soundUrl(sound) === path);
}

/** A sound's bytes, from the sounds/ directory beside dist. */
export async function readSound(sound: Sound): Promise<Buffer> {
  return readFile(new URL(`../sounds/${sound.file}`, import.meta.url));
}

/** The credit CC BY asks for, one per author and licence; "" with none. */
export function soundCredits(
  sounds: Readonly<Record<string, Sound>> = SOUNDS,
): string {
  const credits = new Map<string, Set<string>>();
  for (const { author, licence } of Object.values(sounds)) {
    if (licence === "CC0 1.0") {
      continue;
    }
    const authors = credits.get(licence) ?? new Set<string>();
    authors.add(author ?? "");
    credits.set(licence, authors);
  }
  return [...credits]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([licence, authors]) =>
        `Sounds by ${[...authors].sort().join(", ")} under ${licence}.`,
    )
    .join(" ");
}
