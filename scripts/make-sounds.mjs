// Writes the sounds Dungeon One makes itself (#480, #481) into sounds/, as 16-bit
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

// The reply-ready tone: two soft rising notes, E5 then A5.
write("reply-ready", wav(0.7, 0.5, [bell(659.25, 0), bell(880, 0.12)]));

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
