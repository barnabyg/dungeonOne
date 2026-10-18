// #482: fight and check sounds, worked out from roll data and the fight
// starting or ending: a drum when initiative is rolled, a victory when the
// fight ends with the character standing, a dice rattle and a success or
// failure sting for the character's checks and saves, and a natural 20 or 1
// on the character's d20 in place of the sting or attack sound.
import assert from "node:assert/strict";
import test from "node:test";
import { SOUNDS, resultSounds } from "../dist/sounds-5e.js";

const ADA = "Ada";

const card = (...lines) => ({ kind: "result", text: "", lines });

/** A check or saving throw line: its kept d20 (11 unless given) and outcome. */
function check(roller, outcome, { purpose = "check", d20 = 11, dice } = {}) {
  return {
    text: `${roller} tries.`,
    rolls: [
      {
        purpose,
        roller,
        label: purpose === "check" ? "Athletics check" : "Dexterity save",
        dice: dice ?? [{ sides: 20, value: d20 }],
        modifier: 2,
        total: d20 + 2,
        dc: 12,
        outcome,
      },
    ],
  };
}

/** An attack line with its kept d20 and outcome. */
function attack(roller, target, outcome, d20) {
  return {
    text: `${roller} attacks ${target}.`,
    rolls: [
      {
        purpose: "attack",
        roller,
        target,
        dice: [{ sides: 20, value: d20 }],
        modifier: 4,
        total: d20 + 4,
        armorClass: 13,
        outcome,
      },
      // A hit's damage, which leaves its target standing.
      ...(outcome === "miss"
        ? []
        : [
            {
              purpose: "damage",
              roller,
              target,
              dice: [{ sides: 6, value: 3 }],
              modifier: 2,
              total: 5,
              damageType: "slashing",
              hpAfter: 4,
              maxHp: 9,
            },
          ]),
    ],
  };
}

const initiative = {
  text: "Initiative: Ada 15, Goblin 9.",
  rolls: [
    {
      purpose: "initiative",
      roller: ADA,
      dice: [{ sides: 20, value: 20 }],
      modifier: 2,
      total: 22,
    },
    {
      purpose: "initiative",
      roller: "Goblin",
      dice: [{ sides: 20, value: 1 }],
      modifier: 2,
      total: 3,
    },
  ],
};

/** A fight's view: whose turn it is (null once over) and its combatants. */
const fight = (currentTurn, { ada = 9, goblin = 7, morale } = {}) => ({
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
      ...(morale === undefined ? {} : { morale }),
    },
  ],
});

const sounds = (answer) =>
  resultSounds({ character: ADA, cards: [], ...answer });

test("each fight and check sound is a named, bundled sound", () => {
  for (const id of [
    "fight-start",
    "victory",
    "dice",
    "success",
    "failure",
    "natural-20",
    "natural-1",
  ]) {
    assert.ok(Object.hasOwn(SOUNDS, id), id);
  }
});

test("rolling initiative starts a fight with a drum, before the turns it holds", () => {
  assert.deepEqual(
    sounds({
      cards: [card(initiative, attack("Goblin", ADA, "miss", 8))],
      after: fight("pc"),
    }),
    ["fight-start", "miss"],
  );
});

test("a fight ending with the character standing plays the victory last", () => {
  assert.deepEqual(
    sounds({
      cards: [card(attack(ADA, "Goblin", "hit", 14))],
      before: fight("pc"),
      after: fight(null, { goblin: 0 }),
    }),
    ["hit-slashing", "victory"],
  );
  // A foe that fled or surrendered is beaten too.
  for (const morale of ["fled", "surrendered"]) {
    assert.deepEqual(
      sounds({ before: fight("goblin"), after: fight(null, { morale }) }),
      ["victory"],
      morale,
    );
  }
});

test("no victory while the fight goes on, after it, or when the character falls or flees", () => {
  // Still fighting.
  assert.deepEqual(sounds({ before: fight("pc"), after: fight("goblin") }), []);
  // Exploring after a fight that already ended.
  assert.deepEqual(
    sounds({
      before: fight(null, { goblin: 0 }),
      after: fight(null, { goblin: 0 }),
    }),
    [],
  );
  // The character dropped: the adventure is lost, not won.
  assert.deepEqual(
    sounds({ before: fight("goblin"), after: fight(null, { ada: 0 }) }),
    [],
  );
  // The character fled, leaving the goblin standing.
  assert.deepEqual(sounds({ before: fight("pc"), after: fight(null) }), []);
});

test("a check or save rattles the dice, then stings for success or failure", () => {
  assert.deepEqual(sounds({ cards: [card(check(ADA, "success"))] }), [
    "dice",
    "success",
  ]);
  assert.deepEqual(sounds({ cards: [card(check(ADA, "failure"))] }), [
    "dice",
    "failure",
  ]);
  assert.deepEqual(
    sounds({ cards: [card(check(ADA, "failure", { purpose: "save" }))] }),
    ["dice", "failure"],
  );
});

test("a natural 20 or 1 replaces the sting rather than stacking on it", () => {
  assert.deepEqual(
    sounds({ cards: [card(check(ADA, "success", { d20: 20 }))] }),
    ["dice", "natural-20"],
  );
  assert.deepEqual(
    sounds({
      cards: [card(check(ADA, "failure", { purpose: "save", d20: 1 }))],
    }),
    ["dice", "natural-1"],
  );
  // With advantage, the kept d20 counts, not the dropped one.
  assert.deepEqual(
    sounds({
      cards: [
        card(
          check(ADA, "success", {
            d20: 20,
            dice: [
              { sides: 20, value: 1, dropped: true },
              { sides: 20, value: 20 },
            ],
          }),
        ),
      ],
    }),
    ["dice", "natural-20"],
  );
  // A d4 from Guidance is not a d20.
  assert.deepEqual(
    sounds({
      cards: [
        card(
          check(ADA, "success", {
            dice: [
              { sides: 20, value: 15 },
              { sides: 4, value: 1, effect: "Guidance" },
            ],
          }),
        ),
      ],
    }),
    ["dice", "success"],
  );
});

test("an attack never rattles the dice; your natural 20 or 1 replaces its sound", () => {
  assert.deepEqual(
    sounds({ cards: [card(attack(ADA, "Goblin", "hit", 15))] }),
    ["hit-slashing"],
  );
  assert.deepEqual(
    sounds({ cards: [card(attack(ADA, "Goblin", "critical", 20))] }),
    ["natural-20"],
  );
  assert.deepEqual(
    sounds({ cards: [card(attack(ADA, "Goblin", "miss", 1))] }),
    ["natural-1"],
  );
  // A creature's natural 20 or 1 against you keeps the sound of what it did.
  assert.deepEqual(
    sounds({ cards: [card(attack("Goblin", ADA, "critical", 20))] }),
    ["hurt"],
  );
  assert.deepEqual(
    sounds({ cards: [card(attack("Goblin", ADA, "miss", 1))] }),
    ["miss"],
  );
});

test("creatures' checks and saves, such as morale or a save against your spell, are silent", () => {
  assert.deepEqual(
    sounds({
      cards: [
        card(
          check("Goblin", "failure", { purpose: "save", d20: 1 }),
          check("Goblin", "success", { d20: 20 }),
        ),
      ],
    }),
    [],
  );
});
