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
import type { EndingKind } from "./adventure-5e.js";
import type { FightView, RollGroup } from "./runtime-5e.js";

export type SoundLicence = "CC0 1.0" | "CC BY 3.0" | "CC BY 4.0";

export type Sound = Readonly<
  {
    /** Its file in sounds/. */
    file: string;
    /** Where the file came from: a URL, or the script that makes it. */
    source: string;
  } & (
    | { licence: "CC0 1.0"; author?: string }
    | {
        licence: Exclude<SoundLicence, "CC0 1.0">;
        /** Who made it, which the footer credits. */
        author: string;
      }
  )
>;

// The source of each sound synthesised by our own script.
const MADE = "scripts/make-sounds.mjs (made for Dungeon One)";

export const SOUNDS = {
  // The character's attack hits (#481).
  hit: {
    file: "hit.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character's attack is a critical hit.
  critical: {
    file: "critical.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // An attack misses: the character's, or one against it.
  miss: {
    file: "miss.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // An attack hits the character.
  hurt: {
    file: "hurt.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A creature drops to 0 HP.
  fall: {
    file: "fall.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character drops to 0 HP.
  "fall-you": {
    file: "fall-you.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // Initiative is rolled and a fight starts (#482).
  "fight-start": {
    file: "fight-start.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A fight ends with the character standing and every foe beaten.
  victory: {
    file: "victory.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character rolls a check or saving throw, before its sting.
  dice: {
    file: "dice.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character's check or saving throw succeeds.
  success: {
    file: "success.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character's check or saving throw fails.
  failure: {
    file: "failure.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A natural 20 on the character's d20, in place of its sting or attack sound.
  "natural-20": {
    file: "natural-20.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A natural 1 on the character's d20, in place of its sting or attack sound.
  "natural-1": {
    file: "natural-1.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The adventure ends in victory (#483), in place of the fight's victory.
  "ending-victory": {
    file: "ending-victory.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character escapes the adventure, with loot or without.
  "ending-escape": {
    file: "ending-escape.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The adventure ends in the character's defeat.
  "ending-defeat": {
    file: "ending-defeat.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The ending's level-up card, after the ending's sound.
  "level-up": {
    file: "level-up.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // Coin found or taken, or paid or received at a merchant (#484).
  coins: {
    file: "coins.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A magic item found or taken.
  "magic-item": {
    file: "magic-item.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // An ordinary item taken.
  pickup: {
    file: "pickup.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
} as const satisfies Readonly<Record<string, Sound>>;

export type SoundId = keyof typeof SOUNDS;

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === "string" && Object.hasOwn(SOUNDS, value);
}

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
  for (const sound of Object.values(sounds)) {
    if (sound.licence === "CC0 1.0") {
      continue;
    }
    const authors = credits.get(sound.licence) ?? new Set<string>();
    authors.add(sound.author);
    credits.set(sound.licence, authors);
  }
  return [...credits]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([licence, authors]) =>
        `Sounds by ${[...authors].sort().join(", ")} under ${licence}.`,
    )
    .join(" ");
}

/** A fight as the session view gives it, for working out a victory. */
type SoundFight = Pick<
  NonNullable<FightView["encounter"]>,
  "playerId" | "currentTurn"
> &
  Readonly<{
    combatants: readonly Pick<
      NonNullable<FightView["encounter"]>["combatants"][number],
      "id" | "side" | "hp" | "defeated" | "morale"
    >[];
  }>;

/** What an answer to the player's action or message changed, for its sounds. */
export type SoundAnswer = Readonly<{
  /** The character's name: the roller or target its own rolls give. */
  character: string;
  /** The cards of the history entries the answer added, in order. */
  cards: readonly Readonly<{
    lines: readonly Readonly<{
      rolls: readonly RollGroup[];
      sound?: SoundId | undefined;
    }>[];
  }>[];
  /** The fight before the answer and after it, when there was one. */
  before?: SoundFight | undefined;
  after?: SoundFight | undefined;
  /**
   * The adventure's ending, only when this answer brought it (#483): its
   * kind, and whether its rewards carry a level-up card.
   */
  ending?: Readonly<{ kind: EndingKind; levelUp: boolean }> | undefined;
}>;

/**
 * The sounds an answer asks for, in the order its cards give them (#481,
 * #482), worked out from roll data and the fight, never from narration:
 *
 * - a line's own sound (#484), the engine's tag for what its rolls cannot
 *   show, before any its rolls call for;
 * - initiative rolled: the fight-start drum;
 * - an attack, one sound however many dice: the character's hit, critical
 *   or miss, or for an attack on the character, hurt or the miss's whoosh;
 *   a hit waiting for the character's reaction sounds with its answer, and
 *   damage landing on the character without an attack or save is hurt;
 * - the character's check or saving throw: the dice, then success or
 *   failure; a creature's is silent;
 * - a natural 20 or 1 on the character's kept d20 replaces the sound of
 *   its attack or check outcome;
 * - damage leaving a creature at 0 HP: fall, or fall-you for the character,
 *   unless Undead Fortitude keeps it standing;
 * - the fight ending with the character standing and every foe beaten (or
 *   fled, or surrendered): victory;
 * - the adventure ending (#483): its kind's sound, in place of the fight's
 *   victory, then the fanfare when the ending carries a level-up;
 *
 * Nothing marks the reply itself or the player's turn: the owner found a
 * reply-ready tone irritating in play (#480).
 *
 * The page embeds this function's source, so it uses nothing outside it.
 */
export function resultSounds(answer: SoundAnswer): SoundId[] {
  const { character, before, after, ending } = answer;
  const sounds: SoundId[] = [];
  const natural = (group: RollGroup): SoundId | undefined => {
    const d20 = group.dice.find((die) => die.sides === 20 && !die.dropped);
    return d20?.value === 20
      ? "natural-20"
      : d20?.value === 1
        ? "natural-1"
        : undefined;
  };
  const lines = answer.cards.flatMap((card) => card.lines);
  let started = false;
  lines.forEach(({ rolls, sound }, index) => {
    if (sound !== undefined) {
      sounds.push(sound);
    }
    const attack = rolls.find(({ purpose }) => purpose === "attack");
    const first = rolls[0];
    if (rolls.some(({ purpose }) => purpose === "initiative")) {
      started = true;
      sounds.push("fight-start");
    } else if (attack !== undefined) {
      // Mirror Image (#343): a duplicate took the hit instead.
      const missed =
        attack.outcome === "miss" ||
        rolls.some(
          ({ purpose, outcome }) =>
            purpose === "duplicates" && outcome === "success",
        );
      if (attack.roller === character) {
        sounds.push(
          natural(attack) ??
            (missed
              ? "miss"
              : attack.outcome === "critical"
                ? "critical"
                : "hit"),
        );
      } else if (missed) {
        sounds.push("miss");
      } else if (rolls.some(({ purpose }) => purpose === "damage")) {
        sounds.push(attack.target === character ? "hurt" : "hit");
      }
      // A hit with no damage yet waits for the character's reaction
      // (#308): its answer sounds, once the damage lands or Shield turns it.
    } else if (
      first !== undefined &&
      (first.purpose === "check" || first.purpose === "save") &&
      first.roller === character
    ) {
      sounds.push(
        "dice",
        natural(first) ?? (first.outcome === "success" ? "success" : "failure"),
      );
    } else if (
      first !== undefined &&
      first.purpose === "damage" &&
      first.target === character
    ) {
      // Damage landing on the character with no roll of its own on the
      // line: a hit it answered with Uncanny Dodge or took, or a trap.
      sounds.push("hurt");
    }
    for (const { purpose, target, hpAfter } of rolls) {
      // Undead Fortitude: a save on the next line may leave it standing.
      const stands = lines[index + 1]?.rolls.some(
        (group) =>
          group.purpose === "save" &&
          group.roller === target &&
          (group.hpAfter ?? 0) > 0,
      );
      if (purpose === "damage" && hpAfter === 0 && !stands) {
        sounds.push(target === character ? "fall-you" : "fall");
      }
    }
  });
  const self = after?.combatants.find(({ id }) => id === after.playerId);
  const fought =
    started || (before !== undefined && before.currentTurn !== null);
  if (ending !== undefined) {
    sounds.push(
      ending.kind === "victory"
        ? "ending-victory"
        : ending.kind === "defeat"
          ? "ending-defeat"
          : "ending-escape",
    );
    if (ending.levelUp) {
      sounds.push("level-up");
    }
  } else if (
    after !== undefined &&
    after.currentTurn === null &&
    fought &&
    self !== undefined &&
    self.hp > 0 &&
    after.combatants.every(
      (combatant) =>
        combatant.side === self.side ||
        combatant.defeated ||
        combatant.morale === "fled" ||
        combatant.morale === "surrendered",
    )
  ) {
    sounds.push("victory");
  }
  return sounds;
}
