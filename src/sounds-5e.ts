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
import type { DamageType } from "./encounter-5e.js";
import type { FightView, RollGroup } from "./runtime-5e.js";
import { SPELLS, type SpellId } from "./spells-5e.js";

export type SoundLicence = "CC0 1.0" | "CC BY 3.0" | "CC BY 4.0";

export type Sound = Readonly<
  {
    /** Its file in sounds/. */
    file: string;
    /** Where the file came from: a URL, or the script that makes it. */
    source: string;
    /** How loud it plays, of the player's volume; all of it unless given. */
    gain?: number;
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

/**
 * The families of spells that sound alike when cast (#485): by damage type
 * for a spell that harms (acid with poison, and arcane for force and
 * psychic), and otherwise by what it does.
 */
export const SPELL_FAMILIES = [
  "fire",
  "cold",
  "lightning",
  "thunder",
  "acid",
  "necrotic",
  "radiant",
  "arcane",
  "healing",
  "buff",
  "control",
] as const;
export type SpellFamily = (typeof SPELL_FAMILIES)[number];

/**
 * Each spell family's cast sound, synthesised by our script, and a
 * cantrip's: the same file at half the gain, as cantrips are cast all the
 * time.
 */
const SPELL_SOUNDS = Object.fromEntries(
  SPELL_FAMILIES.flatMap((family) => {
    const sound: Sound = {
      file: `spell-${family}.wav`,
      source: MADE,
      licence: "CC0 1.0",
    };
    return [
      [`spell-${family}`, sound],
      [`spell-${family}-cantrip`, { ...sound, gain: 0.5 }],
    ];
  }),
) as Readonly<
  Record<`spell-${SpellFamily}` | `spell-${SpellFamily}-cantrip`, Sound>
>;

/**
 * The families of damage a hit sounds by (#488): each physical type its own,
 * and the others grouped as the spell families that deal them are.
 */
export const HIT_FAMILIES = [
  "slashing",
  "piercing",
  "bludgeoning",
  "fire",
  "cold",
  "lightning",
  "thunder",
  "acid",
  "necrotic",
  "radiant",
  "arcane",
] as const;
export type HitFamily = (typeof HIT_FAMILIES)[number];

/** Each family's hit sound, synthesised by our script. */
const HIT_SOUNDS = Object.fromEntries(
  HIT_FAMILIES.map((family) => [
    `hit-${family}`,
    { file: `hit-${family}.wav`, source: MADE, licence: "CC0 1.0" },
  ]),
) as Readonly<Record<`hit-${HitFamily}`, Sound>>;

export const SOUNDS = {
  // An attack hits, by its damage's family (#481, #488): the character's,
  // or a creature's on another.
  ...HIT_SOUNDS,
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
  // The character rolls a check or saving throw, before its sting: dice
  // rattled in a cup and thrown.
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
  // The adventure ends meeting its objective (#487): its victory, or in a
  // module without one, an escape with loot. It plays in place of the
  // fight's victory (#483).
  objective: {
    file: "objective.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The character escapes the adventure short of its objective.
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
  // Coin or a magic item found (#484): a harp's rising notes, apart from
  // the sound of taking it.
  find: {
    file: "find.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // Coin taken, or paid or received at a merchant (#484).
  coins: {
    file: "coins.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A magic item taken.
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
  // A spell cast, by its family (#485); a cantrip's is quieter.
  ...SPELL_SOUNDS,
  // A lock picked, or unlocked with its key (#486).
  unlock: {
    file: "unlock.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A door forced or broken open.
  "door-forced": {
    file: "door-forced.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A trap set off.
  "trap-sprung": {
    file: "trap-sprung.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A trap disarmed.
  "trap-disarmed": {
    file: "trap-disarmed.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A potion drunk.
  potion: {
    file: "potion.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A short rest: a calm phrase on a lute.
  "rest-short": {
    file: "rest-short.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A long rest: the lute falling for the night, then rising for the morning.
  "rest-long": {
    file: "rest-long.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // The alarm is raised (#487).
  alarm: {
    file: "alarm.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A wandering encounter comes upon the character.
  wandering: {
    file: "wandering.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A foe flees the fight.
  "foe-flees": {
    file: "foe-flees.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
  // A foe throws down its arms and surrenders.
  "foe-surrenders": {
    file: "foe-surrenders.wav",
    source: MADE,
    licence: "CC0 1.0",
  },
} as const satisfies Readonly<Record<string, Sound>>;

export type SoundId = keyof typeof SOUNDS;

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === "string" && Object.hasOwn(SOUNDS, value);
}

/** Each spell's family (#485): every spell has one. */
export const SPELL_FAMILY = {
  "fire-bolt": "fire",
  "burning-hands": "fire",
  "scorching-ray": "fire",
  fireball: "fire",
  "ray-of-frost": "cold",
  // Its shard bursts in a blast of cold.
  "ice-knife": "cold",
  "shocking-grasp": "lightning",
  "lightning-bolt": "lightning",
  thunderwave: "thunder",
  shatter: "thunder",
  "acid-arrow": "acid",
  "ray-of-sickness": "acid",
  "chill-touch": "necrotic",
  "inflict-wounds": "necrotic",
  "bestow-curse": "necrotic",
  "vampiric-touch": "necrotic",
  "sacred-flame": "radiant",
  "guiding-bolt": "radiant",
  "spirit-guardians": "radiant",
  light: "radiant",
  "magic-missile": "arcane",
  // Its damage type is chosen as it is cast; its sound is not.
  "chromatic-orb": "arcane",
  "spiritual-weapon": "arcane",
  "mind-spike": "arcane",
  "cure-wounds": "healing",
  "healing-word": "healing",
  "prayer-of-healing": "healing",
  "mass-healing-word": "healing",
  "lesser-restoration": "healing",
  guidance: "buff",
  resistance: "buff",
  thaumaturgy: "buff",
  bless: "buff",
  "shield-of-faith": "buff",
  "mage-armor": "buff",
  shield: "buff",
  aid: "buff",
  "protection-from-poison": "buff",
  blur: "buff",
  "mirror-image": "buff",
  "beacon-of-hope": "buff",
  "protection-from-energy": "buff",
  haste: "buff",
  sleep: "control",
  "hold-person": "control",
  slow: "control",
} as const satisfies Readonly<Record<SpellId, SpellFamily>>;

/**
 * The sound of casting `spell` (#485): its family's, or for a cantrip the
 * family's quieter one. A spell cast from a scroll or wand sounds the same.
 */
export function castSound(spell: SpellId): SoundId {
  const family = SPELL_FAMILY[spell];
  return SPELLS[spell].level === 0
    ? `spell-${family}-cantrip`
    : `spell-${family}`;
}

/** Each named sound's gain where it is not all of the player's volume. */
export function soundGains(): Readonly<Partial<Record<SoundId, number>>> {
  return Object.fromEntries(
    Object.entries(SOUNDS).flatMap(([id, sound]: [string, Sound]) =>
      sound.gain === undefined ? [] : [[id, sound.gain]],
    ),
  );
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
   * kind, whether it meets the module's objective (#487), and whether its
   * rewards carry a level-up card.
   */
  ending?:
    | Readonly<{ kind: EndingKind; objective: boolean; levelUp: boolean }>
    | undefined;
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
 *   a hit sounds by its first damage's type (#488), its weapon's when it
 *   deals several, each physical type its own and the others their
 *   family's;
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
 * - the adventure ending (#483), in place of the fight's victory: the
 *   objective's fanfare when it meets the module's objective (#487), or
 *   else the escape's or the defeat's sound, then the level-up fanfare
 *   when the ending carries one;
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
  /** Each damage type's hit sound (#488); every type has one. */
  const HITS = {
    slashing: "hit-slashing",
    piercing: "hit-piercing",
    bludgeoning: "hit-bludgeoning",
    fire: "hit-fire",
    cold: "hit-cold",
    lightning: "hit-lightning",
    thunder: "hit-thunder",
    acid: "hit-acid",
    poison: "hit-acid",
    necrotic: "hit-necrotic",
    radiant: "hit-radiant",
    force: "hit-arcane",
    psychic: "hit-arcane",
  } as const satisfies Readonly<Record<DamageType, SoundId>>;
  const hit = (rolls: readonly RollGroup[]): SoundId => {
    const type = rolls.find(({ purpose }) => purpose === "damage")?.damageType;
    // A type the game does not use, which no hit has, is a plain blow.
    return type !== undefined && Object.hasOwn(HITS, type)
      ? HITS[type as DamageType]
      : "hit-bludgeoning";
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
                : hit(rolls)),
        );
      } else if (missed) {
        sounds.push("miss");
      } else if (rolls.some(({ purpose }) => purpose === "damage")) {
        sounds.push(attack.target === character ? "hurt" : hit(rolls));
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
      ending.objective
        ? "objective"
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
