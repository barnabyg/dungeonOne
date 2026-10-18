// #488: a hit sounds by its damage type. Slashing, piercing and bludgeoning
// each have their own sound, and every other type its family's; a hit with
// several types sounds its weapon's, the first damage on its line. Every
// damage type the game uses maps to a sound.
import assert from "node:assert/strict";
import test from "node:test";
import { DAMAGE_TYPES } from "../dist/encounter-5e.js";
import { resultSounds, SOUNDS } from "../dist/sounds-5e.js";

const ADA = "Ada";

/** A hit's line: its attack, then damage of each of `types` in turn. */
function hit(roller, target, outcome, ...types) {
  return {
    text: `${roller} hits ${target}.`,
    rolls: [
      {
        purpose: "attack",
        roller,
        target,
        dice: [{ sides: 20, value: 13 }],
        modifier: 5,
        total: 18,
        armorClass: 15,
        outcome,
      },
      ...types.map((damageType) => ({
        purpose: "damage",
        roller,
        target,
        dice: [{ sides: 6, value: 4 }],
        modifier: 0,
        total: 4,
        damageType,
        hpAfter: 6,
        maxHp: 12,
      })),
    ],
  };
}

const sounds = (...lines) =>
  resultSounds({ character: ADA, cards: [{ lines }] });

/** The hit sound of each damage type: its own, or its family's. */
const EXPECTED = {
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
};

test("every damage type the game uses maps to a bundled hit sound", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), [...DAMAGE_TYPES].sort());
  for (const type of DAMAGE_TYPES) {
    const [sound] = sounds(hit(ADA, "Goblin", "hit", type));
    assert.equal(sound, EXPECTED[type], type);
    assert.ok(Object.hasOwn(SOUNDS, sound), sound);
  }
});

test("slashing, piercing and bludgeoning each sound different", () => {
  const physical = ["slashing", "piercing", "bludgeoning"].map(
    (type) => SOUNDS[sounds(hit(ADA, "Goblin", "hit", type))[0]].file,
  );
  assert.equal(new Set(physical).size, 3);
});

test("a hit with several damage types sounds its weapon's", () => {
  assert.deepEqual(sounds(hit(ADA, "Goblin", "hit", "piercing", "poison")), [
    "hit-piercing",
  ]);
  assert.deepEqual(sounds(hit(ADA, "Goblin", "hit", "radiant", "slashing")), [
    "hit-radiant",
  ]);
});

test("a creature's hit on another sounds by type; a hit on the character, a critical and a miss are unchanged", () => {
  assert.deepEqual(sounds(hit("Spiritual Weapon", "Goblin", "hit", "force")), [
    "hit-arcane",
  ]);
  assert.deepEqual(sounds(hit("Goblin", ADA, "hit", "slashing")), ["hurt"]);
  assert.deepEqual(sounds(hit(ADA, "Goblin", "critical", "slashing")), [
    "critical",
  ]);
  assert.deepEqual(sounds(hit(ADA, "Goblin", "miss")), ["miss"]);
});

test("resultSounds still runs on its own, as the page embeds its source", () => {
  const embedded = new Function(`return ${resultSounds};`)();
  const answer = {
    character: ADA,
    cards: [{ lines: [hit(ADA, "Goblin", "hit", "fire")] }],
  };
  assert.deepEqual(embedded(answer), ["hit-fire"]);
});
