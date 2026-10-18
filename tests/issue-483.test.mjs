// #483: adventure endings sound. An ending plays its sound when an answer
// brings it, in place of the fight's victory: the objective's fanfare when
// it meets the module's objective (#487), or else the escape's or the
// defeat's. An ending with a level-up card plays the fanfare after it.
import assert from "node:assert/strict";
import test from "node:test";
import { SOUNDS, resultSounds } from "../dist/sounds-5e.js";

const ADA = "Ada";

const card = (...lines) => ({ kind: "result", text: "", lines });

/** Ada's blow that drops the goblin: its attack and its damage. */
const finalBlow = {
  text: "You hit Goblin. Goblin falls.",
  rolls: [
    {
      purpose: "attack",
      roller: ADA,
      target: "Goblin",
      dice: [{ sides: 20, value: 14 }],
      modifier: 4,
      total: 18,
      armorClass: 13,
      outcome: "hit",
    },
    {
      purpose: "damage",
      roller: ADA,
      target: "Goblin",
      dice: [{ sides: 8, value: 6 }],
      modifier: 3,
      total: 9,
      damageType: "slashing",
      hpAfter: 0,
      maxHp: 7,
    },
  ],
};

/** A fight's view: whose turn it is (null once over) and its combatants. */
const fight = (currentTurn, { ada = 9, goblin = 7 } = {}) => ({
  round: 2,
  playerId: "pc",
  currentTurn,
  combatants: [
    { id: "pc", name: ADA, side: "party", hp: ada, defeated: ada === 0 },
    {
      id: "goblin",
      name: "Goblin",
      side: "opponents",
      hp: goblin,
      defeated: goblin === 0,
    },
  ],
});

const sounds = (answer) =>
  resultSounds({ character: ADA, cards: [], ...answer });

test("each ending sound and the fanfare is a named, bundled sound", () => {
  for (const id of [
    "objective",
    "ending-escape",
    "ending-defeat",
    "level-up",
  ]) {
    assert.ok(Object.hasOwn(SOUNDS, id), id);
  }
});

test("each ending kind plays its sound, and a victory the objective's", () => {
  const cases = [
    ["victory", "objective"],
    ["escape-with-loot", "ending-escape"],
    ["escape-without-loot", "ending-escape"],
    ["defeat", "ending-defeat"],
  ];
  for (const [kind, sound] of cases) {
    assert.deepEqual(
      sounds({
        ending: { kind, objective: kind === "victory", levelUp: false },
      }),
      [sound],
      kind,
    );
  }
});

test("an ending with a level-up plays the fanfare after the ending's sound", () => {
  assert.deepEqual(
    sounds({
      ending: { kind: "escape-with-loot", objective: false, levelUp: true },
    }),
    ["ending-escape", "level-up"],
  );
  assert.deepEqual(
    sounds({ ending: { kind: "victory", objective: true, levelUp: true } }),
    ["objective", "level-up"],
  );
});

test("a fight won that ends the adventure plays the ending in place of the fight's victory", () => {
  const won = {
    cards: [card(finalBlow)],
    before: fight("pc"),
    after: fight(null, { goblin: 0 }),
  };
  assert.deepEqual(sounds(won), ["hit-slashing", "fall", "victory"]);
  assert.deepEqual(
    sounds({
      ...won,
      ending: { kind: "victory", objective: true, levelUp: true },
    }),
    ["hit-slashing", "fall", "objective", "level-up"],
  );
});

test("the character's fall that ends the adventure plays its fall, then the defeat", () => {
  const felled = {
    text: "Goblin hits you. You fall.",
    rolls: [
      {
        purpose: "attack",
        roller: "Goblin",
        target: ADA,
        dice: [{ sides: 20, value: 15 }],
        modifier: 4,
        total: 19,
        armorClass: 16,
        outcome: "hit",
      },
      {
        purpose: "damage",
        roller: "Goblin",
        target: ADA,
        dice: [{ sides: 6, value: 5 }],
        modifier: 2,
        total: 7,
        damageType: "slashing",
        hpAfter: 0,
        maxHp: 12,
      },
    ],
  };
  assert.deepEqual(
    sounds({
      cards: [card(felled)],
      before: fight("goblin"),
      after: fight(null, { ada: 0 }),
      ending: { kind: "defeat", objective: false, levelUp: false },
    }),
    ["hurt", "fall-you", "ending-defeat"],
  );
});

test("an answer that brings no ending plays no ending sound", () => {
  assert.deepEqual(sounds({}), []);
  assert.deepEqual(sounds({ ending: undefined }), []);
});
