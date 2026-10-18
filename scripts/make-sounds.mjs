// Writes the sounds Dungeon One makes itself (#481–#488) into sounds/, as 16-bit
// mono WAV. Each is synthesised here, so it is ours to release under CC0;
// src/sounds-5e.ts records it with this script as its source. Run it again
// after changing a sound: `node scripts/make-sounds.mjs`.
import { writeFileSync } from "node:fs";

const RATE = 22050;

/**
 * Seeded white noise in [-1, 1] (mulberry32), so running the script again
 * writes the same files.
 */
function noise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * A soft bell note: a sine with two quiet overtones, a short attack and an
 * exponential decay, starting `at` seconds in.
 */
const bell = (frequency, at) => (time) => {
  const t = time - at;
  if (t < 0) {
    return 0;
  }
  const attack = Math.min(1, t / 0.008);
  const decay = Math.exp(-t / 0.18);
  const tone =
    Math.sin(2 * Math.PI * frequency * t) +
    0.25 * Math.sin(2 * Math.PI * 2 * frequency * t) +
    0.08 * Math.sin(2 * Math.PI * 3 * frequency * t);
  return attack * decay * tone;
};

/** `seconds` of the sum of `voices`, peaking at `peak` of full scale. */
function wav(seconds, peak, voices) {
  const count = Math.round(seconds * RATE);
  const samples = Array.from({ length: count }, (_, index) => {
    const time = index / RATE;
    // The last 50 ms fade to silence, so the file never ends on a click.
    const fade = Math.min(1, (seconds - time) / 0.05);
    return fade * voices.reduce((sum, voice) => sum + voice(time), 0);
  });
  const loudest = Math.max(...samples.map(Math.abs));
  const data = Buffer.alloc(count * 2);
  samples.forEach((sample, index) =>
    data.writeInt16LE(Math.round((sample / loudest) * peak * 32767), index * 2),
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/**
 * A struck body: a sine falling from `high` to `low` Hz, with a burst of
 * dull noise on its attack, decaying over `decay` seconds from `at`.
 */
const thud = (high, low, decay, at, seed) => {
  const random = noise(seed);
  let smoothed = 0;
  return (time) => {
    const t = time - at;
    const grit = random();
    if (t < 0) {
      return 0;
    }
    smoothed += 0.25 * (grit - smoothed);
    // The phase of a frequency falling exponentially from high to low.
    const phase =
      2 * Math.PI * (low * t + (high - low) * 0.04 * (1 - Math.exp(-t / 0.04)));
    const body = Math.sin(phase) * Math.exp(-t / decay);
    const burst = smoothed * 2.5 * Math.exp(-t / 0.015);
    return Math.min(1, t / 0.002) * (body + burst);
  };
};

/**
 * Air rushing past: noise through a low-pass filter whose cutoff swells
 * and falls with its loudness over `seconds` from `at`.
 */
const whoosh = (seconds, at, seed) => {
  const random = noise(seed);
  let low = 0;
  let lower = 0;
  return (time) => {
    const grit = random();
    const t = time - at;
    if (t < 0 || t > seconds) {
      return 0;
    }
    const swell = Math.sin((Math.PI * t) / seconds) ** 2;
    const cutoff = 0.02 + 0.2 * swell;
    low += cutoff * (grit - low);
    lower += cutoff * (low - lower);
    return 3 * swell * lower;
  };
};

/**
 * A die striking the table at `at`, `gain` loud: a tick of bright noise and
 * the short high rings of its body, three resonances drawn from `seed`.
 */
const clack = (at, gain, seed) => {
  const random = noise(seed);
  const rings = [0, 1, 2].map(() => ({
    frequency: 2400 + 2000 * (random() + 1),
    decay: 0.006 + 0.004 * (random() + 1),
  }));
  let previous = 0;
  return (time) => {
    const grit = random();
    const t = time - at;
    // The difference of successive samples keeps only the bright part.
    const bright = grit - previous;
    previous = grit;
    if (t < 0) {
      return 0;
    }
    const ring = rings.reduce(
      (sum, { frequency, decay }) =>
        sum + Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / decay),
      0,
    );
    return gain * (0.5 * ring + 0.6 * bright * Math.exp(-t / 0.0015));
  };
};

/**
 * One die thrown at `at`: it bounces, each bounce sooner and softer than
 * the last, then tumbles to rest in a run of quick, quiet ticks.
 */
const die = (at, first, seed) => {
  const impacts = [];
  let time = at;
  let gap = first;
  let gain = 1;
  while (gap > 0.012) {
    impacts.push(clack(time, gain, seed + impacts.length));
    time += gap;
    gap *= 0.72;
    gain *= 0.78;
  }
  return impacts;
};

/** The table under rolling dice: a soft, low rumble fading over `seconds`. */
const table = (seconds, seed) => {
  const random = noise(seed);
  let low = 0;
  return (time) => {
    low += 0.08 * (random() - low);
    return 0.5 * low * Math.max(0, 1 - time / seconds);
  };
};

/**
 * A soft brass note: a sine with odd overtones that slides from `from` to
 * `to` Hz with a little vibrato, held for `seconds` from `at`.
 */
const horn = (from, to, seconds, at) => {
  let phase = 0;
  return (time) => {
    const t = time - at;
    if (t < 0 || t > seconds) {
      return 0;
    }
    const frequency =
      (from + (to - from) * (t / seconds)) *
      (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t));
    phase += (2 * Math.PI * frequency) / RATE;
    const envelope = Math.min(1, t / 0.03) * Math.min(1, (seconds - t) / 0.06);
    return (
      envelope *
      (Math.sin(phase) + 0.3 * Math.sin(3 * phase) + 0.12 * Math.sin(5 * phase))
    );
  };
};

/**
 * `voice` at `gain` of its loudness. The voice is made once, as most keep
 * state from one sample to the next.
 */
const louder = (gain, voice) => (time) => gain * voice(time);

const write = (name, sound) =>
  writeFileSync(new URL(`../sounds/${name}.wav`, import.meta.url), sound);

// Combat (#481). Your hit: a dull blow.
write("hit", wav(0.3, 0.6, [thud(180, 70, 0.07, 0, 1)]));
// Your critical: a harder blow with a bright ring over it.
write(
  "critical",
  wav(0.55, 0.6, [
    thud(220, 70, 0.09, 0, 2),
    louder(0.35, bell(1318.5, 0.01)),
    louder(0.25, bell(1975.5, 0.01)),
  ]),
);
// A miss, yours or one against you: a whoosh.
write("miss", wav(0.35, 0.5, [whoosh(0.32, 0, 3)]));
// You are hit: a low thump and a short falling groan.
write(
  "hurt",
  wav(0.4, 0.6, [
    thud(140, 50, 0.08, 0, 4),
    louder(0.4, horn(196, 147, 0.25, 0.02)),
  ]),
);
// A creature falls: a body hitting the ground, then settling.
write(
  "fall",
  wav(0.55, 0.6, [
    thud(120, 45, 0.12, 0, 5),
    louder(0.5, thud(90, 40, 0.08, 0.16, 6)),
  ]),
);
// You fall: a slow, sad falling phrase over a heavy thud.
write(
  "fall-you",
  wav(1.1, 0.55, [
    thud(110, 40, 0.14, 0, 7),
    louder(0.45, horn(330, 311, 0.3, 0.05)),
    louder(0.45, horn(262, 220, 0.6, 0.38)),
  ]),
);

// Fights and checks (#482). Initiative: a deep drum hit.
write("fight-start", wav(0.7, 0.65, [thud(110, 55, 0.22, 0, 8)]));
// Victory: a short rising fanfare, C5 E5 G5 C6.
write(
  "victory",
  wav(1.0, 0.2, [
    horn(523.25, 523.25, 0.12, 0),
    horn(659.25, 659.25, 0.12, 0.12),
    horn(783.99, 783.99, 0.12, 0.24),
    horn(1046.5, 1046.5, 0.5, 0.36),
  ]),
);
// A check or save: two dice thrown onto a table.
write(
  "dice",
  wav(0.45, 0.65, [
    ...die(0, 0.11, 20),
    ...die(0.03, 0.09, 40),
    table(0.4, 60),
  ]),
);
// Success: two rising notes, G5 then C6.
write("success", wav(0.5, 0.45, [bell(783.99, 0), bell(1046.5, 0.1)]));
// Failure: two dull falling notes, E4 then C4.
write(
  "failure",
  wav(0.5, 0.18, [
    horn(329.63, 329.63, 0.16, 0),
    horn(261.63, 246.94, 0.28, 0.17),
  ]),
);
// A natural 20: a quick sparkling run up to C7.
write(
  "natural-20",
  wav(
    0.9,
    0.45,
    [1046.5, 1318.5, 1568, 2093].map((frequency, index) =>
      bell(frequency, index * 0.07),
    ),
  ),
);
// A natural 1: a sagging "wah-wah" down to a low note.
write(
  "natural-1",
  wav(0.95, 0.18, [
    horn(311.13, 293.66, 0.22, 0),
    horn(293.66, 277.18, 0.22, 0.24),
    horn(277.18, 233.08, 0.45, 0.48),
  ]),
);

// Adventure endings (#483). The objective met (#487): a longer fanfare,
// G4 C5 E5, then a held C major chord.
write(
  "objective",
  wav(1.5, 0.2, [
    horn(392, 392, 0.14, 0),
    horn(523.25, 523.25, 0.14, 0.14),
    horn(659.25, 659.25, 0.14, 0.28),
    ...[523.25, 659.25, 783.99, 1046.5].map((frequency) =>
      horn(frequency, frequency, 0.95, 0.42),
    ),
  ]),
);
// An escape: a rush of air, then two light rising notes, D5 then A5.
write(
  "ending-escape",
  wav(1.0, 0.45, [
    louder(0.6, whoosh(0.4, 0, 9)),
    bell(587.33, 0.25),
    bell(880, 0.42),
  ]),
);
// A defeat: a low drum, then a slow falling minor phrase, G4 E♭4 C4.
write(
  "ending-defeat",
  wav(1.6, 0.18, [
    louder(2.5, thud(90, 40, 0.2, 0, 10)),
    horn(392, 392, 0.3, 0.1),
    horn(311.13, 311.13, 0.3, 0.42),
    horn(261.63, 246.94, 0.75, 0.74),
  ]),
);
// A level-up: a sparkling run over two octaves, C6 to C8, ringing on.
write(
  "level-up",
  wav(
    1.2,
    0.4,
    [1046.5, 1318.5, 1568, 2093, 2637, 3136, 4186].map((frequency, index) =>
      bell(frequency, index * 0.06),
    ),
  ),
);

/**
 * A coin striking coin at `at`, `gain` loud: a metal ring of inharmonic
 * partials over `frequency` that dies away quickly.
 */
const clink = (frequency, at, gain) => (time) => {
  const t = time - at;
  if (t < 0) {
    return 0;
  }
  const ring = [1, 2.76, 5.4].reduce(
    (sum, ratio, index) =>
      sum +
      Math.sin(2 * Math.PI * frequency * ratio * t) *
        Math.exp(-t / (0.09 / (index + 1))),
    0,
  );
  return gain * Math.min(1, t / 0.001) * ring;
};

// Loot (#484). Coins: a handful clinking together.
write(
  "coins",
  wav(0.5, 0.4, [
    clink(2100, 0, 1),
    clink(2480, 0.05, 0.8),
    clink(1870, 0.11, 0.7),
    clink(2300, 0.16, 0.5),
    clink(2650, 0.22, 0.35),
  ]),
);
// A magic item: a shimmering chime, E6 G#6 B6 E7, ringing on.
write(
  "magic-item",
  wav(
    1.0,
    0.35,
    [1318.5, 1661.2, 1975.5, 2637].map((frequency, index) =>
      louder(1 - index * 0.15, bell(frequency, index * 0.09)),
    ),
  ),
);
// An ordinary item taken: a soft grab and a light knock as it is stowed.
write(
  "pickup",
  wav(0.3, 0.5, [
    louder(0.5, whoosh(0.12, 0, 11)),
    louder(0.8, thud(320, 160, 0.03, 0.1, 12)),
  ]),
);

/** Fire's crackle: sparse sharp pops of noise over `seconds` from `at`. */
const crackle = (seconds, at, seed) => {
  const random = noise(seed);
  let pop = 0;
  return (time) => {
    const grit = random();
    const t = time - at;
    if (t < 0 || t > seconds) {
      return 0;
    }
    // A pop starts on about one sample in 400 and dies in a few ms.
    if (Math.abs(grit) > 0.995) {
      pop = 1;
    }
    pop *= 0.985;
    return pop * random() * (1 - t / seconds);
  };
};

/**
 * A buzzing sweep: a square-ish tone gliding from `from` to `to` Hz over
 * `seconds` from `at`, fading as it goes.
 */
const zap = (from, to, seconds, at) => {
  let phase = 0;
  return (time) => {
    const t = time - at;
    if (t < 0 || t > seconds) {
      return 0;
    }
    const frequency = from * (to / from) ** (t / seconds);
    phase += (2 * Math.PI * frequency) / RATE;
    const square = Math.tanh(4 * Math.sin(phase));
    return square * Math.min(1, t / 0.003) * (1 - t / seconds);
  };
};

/** A bubble popping at `at`: a short sine rising from `frequency`. */
const bubble = (frequency, at) => (time) => {
  const t = time - at;
  if (t < 0 || t > 0.06) {
    return 0;
  }
  const phase = 2 * Math.PI * frequency * (t + 8 * t * t);
  return Math.sin(phase) * Math.sin((Math.PI * t) / 0.06);
};

/** A slow wobble: `voice` swelling and fading `rate` times a second. */
const tremolo = (rate, voice) => (time) =>
  (0.6 + 0.4 * Math.sin(2 * Math.PI * rate * time)) * voice(time);

// Spells by family (#485). Fire: a rush of flame with a crackle.
write(
  "spell-fire",
  wav(0.6, 0.55, [whoosh(0.5, 0, 13), louder(0.8, crackle(0.55, 0.05, 14))]),
);
// Cold: a crystalline shimmer of high, glassy notes.
write(
  "spell-cold",
  wav(
    0.7,
    0.35,
    [2793.8, 3520, 3135.9, 4186].map((frequency, index) =>
      clink(frequency, index * 0.05, 1 - index * 0.15),
    ),
  ),
);
// Lightning: a crackling zap falling from high to low.
write(
  "spell-lightning",
  wav(0.45, 0.35, [zap(1600, 180, 0.4, 0), louder(0.6, crackle(0.3, 0, 15))]),
);
// Thunder: a deep boom and its rumble.
write(
  "spell-thunder",
  wav(0.9, 0.65, [thud(90, 30, 0.3, 0, 16), louder(0.5, table(0.85, 17))]),
);
// Acid and poison: a sizzle with bubbles rising through it.
write(
  "spell-acid",
  wav(0.6, 0.4, [
    louder(0.4, whoosh(0.55, 0, 18)),
    ...[420, 560, 380, 640, 500].map((frequency, index) =>
      bubble(frequency, 0.05 + index * 0.09),
    ),
  ]),
);
// Necrotic: a low, falling, hollow drone.
write(
  "spell-necrotic",
  wav(0.8, 0.2, [
    horn(146.83, 110, 0.7, 0),
    louder(0.6, horn(155.56, 116.54, 0.7, 0)),
  ]),
);
// Radiant: a bright, swelling chord, C6 E6 G6.
write(
  "spell-radiant",
  wav(
    0.8,
    0.35,
    [1046.5, 1318.5, 1568].map((frequency) => bell(frequency, 0)),
  ),
);
// Arcane (force and psychic): a quick rising "pew" with a ring.
write(
  "spell-arcane",
  wav(0.45, 0.22, [horn(520, 1040, 0.18, 0), louder(0.5, bell(1568, 0.15))]),
);
// Healing: a warm rising phrase, C5 E5 G5.
write(
  "spell-healing",
  wav(
    0.8,
    0.4,
    [523.25, 659.25, 783.99].map((frequency, index) =>
      bell(frequency, index * 0.11),
    ),
  ),
);
// Buffs and wards: a quick upward shimmer, E5 A5 E6.
write(
  "spell-buff",
  wav(
    0.6,
    0.4,
    [659.25, 880, 1318.5].map((frequency, index) =>
      bell(frequency, index * 0.05),
    ),
  ),
);
// Control: a slow, wobbling, sinking tone.
write("spell-control", wav(0.8, 0.2, [tremolo(6, horn(440, 330, 0.75, 0))]));

/**
 * A bird's chirp at `at`: a pure note sweeping from `from` to `to` Hz over
 * `seconds`, swelling and fading.
 */
const chirp = (from, to, seconds, at) => {
  let phase = 0;
  return (time) => {
    const t = time - at;
    if (t < 0 || t > seconds) {
      return 0;
    }
    phase += (2 * Math.PI * (from + (to - from) * (t / seconds))) / RATE;
    return Math.sin(phase) * Math.sin((Math.PI * t) / seconds);
  };
};

// World actions (#486). A lock: a pin's tick, then the bolt's click.
write(
  "unlock",
  wav(0.35, 0.55, [
    clack(0, 0.6, 70),
    clack(0.08, 1, 71),
    louder(0.6, thud(900, 500, 0.012, 0.08, 72)),
  ]),
);
// A door forced or broken: wood splitting, then the door slamming open.
write(
  "door-forced",
  wav(0.7, 0.6, [
    thud(160, 60, 0.1, 0, 73),
    louder(1.5, crackle(0.18, 0, 74)),
    louder(0.8, thud(110, 45, 0.12, 0.22, 75)),
  ]),
);
// A trap set off: a wire snapping, then darts or blades hissing past.
write(
  "trap-sprung",
  wav(0.6, 0.55, [
    clack(0, 1, 76),
    louder(0.8, whoosh(0.18, 0.05, 77)),
    louder(0.6, whoosh(0.18, 0.12, 78)),
    louder(0.5, whoosh(0.2, 0.2, 79)),
  ]),
);
// A trap disarmed: a careful click, then two soft notes, E5 and A5.
write(
  "trap-disarmed",
  wav(0.7, 0.45, [
    clack(0, 0.8, 80),
    louder(0.5, bell(659.25, 0.1)),
    louder(0.5, bell(880, 0.22)),
  ]),
);
// A potion drunk: three gulps, then a faint restoring shimmer.
write(
  "potion",
  wav(0.8, 0.5, [
    ...[180, 210, 170].map((frequency, index) =>
      bubble(frequency, index * 0.13),
    ),
    louder(0.25, bell(1318.5, 0.42)),
    louder(0.2, bell(1661.2, 0.48)),
  ]),
);
// A short rest: a campfire crackling.
write(
  "rest-short",
  wav(1.6, 0.4, [crackle(1.55, 0, 81), louder(0.6, table(1.6, 82))]),
);
// A long rest: the campfire, then birds greeting the dawn.
write(
  "rest-long",
  wav(2.0, 0.4, [
    crackle(1.1, 0, 83),
    louder(0.6, table(1.2, 84)),
    ...[
      [2800, 3600, 1.15],
      [3000, 3900, 1.3],
      [3400, 2600, 1.55],
      [2900, 3800, 1.7],
    ].map(([from, to, at]) => louder(0.5, chirp(from, to, 0.09, at))),
  ]),
);

// Warnings and outcomes (#487). The alarm: a bell struck three times, fast.
write(
  "alarm",
  wav(
    1.0,
    0.45,
    [0, 0.2, 0.4].flatMap((at) => [
      clink(880, at, 1),
      louder(0.6, bell(880, at)),
    ]),
  ),
);
// A wandering monster comes: a low horn rising, with a drum under it.
write(
  "wandering",
  wav(1.0, 0.3, [
    horn(146.83, 164.81, 0.35, 0),
    horn(164.81, 220, 0.5, 0.38),
    louder(2, thud(80, 40, 0.18, 0, 85)),
  ]),
);
// A foe flees: hurried footsteps fading away.
write(
  "foe-flees",
  wav(
    0.8,
    0.55,
    [0, 0.13, 0.26, 0.39, 0.52].map((at, index) =>
      louder(1 - index * 0.17, thud(300, 140, 0.025, at, 86 + index)),
    ),
  ),
);
// A foe surrenders: a weapon dropped clattering, then a soft falling note.
write(
  "foe-surrenders",
  wav(0.9, 0.45, [
    clink(620, 0, 1),
    clink(540, 0.09, 0.7),
    clink(660, 0.15, 0.4),
    louder(0.25, horn(392, 329.63, 0.4, 0.3)),
  ]),
);
