// Writes the sounds Dungeon One makes itself (#480) into sounds/, as 16-bit
// mono WAV. Each is synthesised here, so it is ours to release under CC0;
// src/sounds-5e.ts records it with this script as its source. Run it again
// after changing a sound: `node scripts/make-sounds.mjs`.
import { writeFileSync } from "node:fs";

const RATE = 22050;

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

// The reply-ready tone: two soft rising notes, E5 then A5.
writeFileSync(
  new URL("../sounds/reply-ready.wav", import.meta.url),
  wav(0.7, 0.5, [bell(659.25, 0), bell(880, 0.12)]),
);
