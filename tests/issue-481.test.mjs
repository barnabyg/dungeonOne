// #481: combat sounds, worked out from the roll data result lines carry.
// One sound per attack (your hit, critical or miss; being hit, or a whoosh
// for a miss against you), then a fall for a creature or the character
// dropping to 0 HP, in the order the card gives them.
import assert from "node:assert/strict";
import test from "node:test";
import { SOUNDS, resultSounds } from "../dist/sounds-5e.js";

const ADA = "Ada";

/** An attack line: its d20 (13 unless given), outcome and damage's HP after. */
function attack(roller, target, outcome, { d20 = 13, hpAfter } = {}) {
  const rolls = [
    {
      purpose: "attack",
      roller,
      target,
      dice: [{ sides: 20, value: d20 }],
      modifier: 5,
      total: d20 + 5,
      armorClass: 15,
      outcome,
    },
  ];
  if (outcome !== "miss") {
    rolls.push({
      purpose: "damage",
      roller,
      target,
      dice: [{ sides: 8, value: 5 }],
      modifier: 3,
      total: 8,
      damageType: "slashing",
      ...(hpAfter === undefined ? {} : { hpAfter, maxHp: 12 }),
    });
  }
  return { text: `${roller} attacks ${target}.`, rolls };
}

/** The sounds an answer playing on asks for, before its reply-ready tone. */
const sounds = (...lines) =>
  resultSounds({
    character: ADA,
    cards: [{ kind: "result", text: "", lines }],
    playing: false,
  });

test("resultSounds runs on its own, as the page embeds its source", () => {
  // Built in the global scope, it sees nothing of the module around it.
  const embedded = new Function(`return ${resultSounds};`)();
  const answer = {
    character: ADA,
    cards: [
      {
        kind: "result",
        text: "",
        lines: [attack(ADA, "Goblin", "critical", { d20: 20, hpAfter: 0 })],
      },
    ],
    playing: true,
  };
  assert.deepEqual(embedded(answer), resultSounds(answer));
  assert.deepEqual(embedded(answer), ["natural-20", "fall", "reply-ready"]);
});

test("each combat sound is a named, bundled sound", () => {
  for (const id of ["hit", "critical", "miss", "hurt", "fall", "fall-you"]) {
    assert.ok(Object.hasOwn(SOUNDS, id), id);
  }
});

test("your hit, critical and miss each play their own sound", () => {
  assert.deepEqual(sounds(attack(ADA, "Goblin", "hit", { hpAfter: 4 })), [
    "hit",
  ]);
  assert.deepEqual(
    sounds(attack(ADA, "Goblin", "critical", { d20: 19, hpAfter: 2 })),
    ["critical"],
  );
  assert.deepEqual(sounds(attack(ADA, "Goblin", "miss")), ["miss"]);
});

test("being hit plays its own sound, and a miss against you a whoosh", () => {
  assert.deepEqual(sounds(attack("Goblin", ADA, "hit", { hpAfter: 6 })), [
    "hurt",
  ]);
  assert.deepEqual(sounds(attack("Goblin", ADA, "critical", { hpAfter: 1 })), [
    "hurt",
  ]);
  assert.deepEqual(sounds(attack("Goblin", ADA, "miss")), ["miss"]);
});

test("a creature or the character dropping to 0 HP falls after the blow", () => {
  assert.deepEqual(sounds(attack(ADA, "Goblin", "hit", { hpAfter: 0 })), [
    "hit",
    "fall",
  ]);
  assert.deepEqual(sounds(attack("Goblin", ADA, "hit", { hpAfter: 0 })), [
    "hurt",
    "fall-you",
  ]);
  // Damage with no attack, such as a spell a creature failed to save
  // against, plays only the fall.
  assert.deepEqual(
    sounds({
      text: "The flames burn Goblin.",
      rolls: [
        {
          purpose: "damage",
          roller: ADA,
          target: "Goblin",
          dice: [{ sides: 6, value: 6 }],
          modifier: 0,
          total: 6,
          damageType: "fire",
          hpAfter: 0,
          maxHp: 7,
        },
      ],
    }),
    ["fall"],
  );
});

/** Undead Fortitude's save line, with the HP it leaves. */
const fortitude = (roller, hpAfter) => ({
  text: `Undead Fortitude: ${roller} saves.`,
  rolls: [
    {
      purpose: "save",
      roller,
      label: "Constitution saving throw (Undead Fortitude)",
      dice: [{ sides: 20, value: 14 }],
      modifier: 3,
      proficiency: 0,
      total: 17,
      dc: 13,
      outcome: hpAfter > 0 ? "success" : "failure",
      hpAfter,
      maxHp: 15,
    },
  ],
});

test("a creature Undead Fortitude keeps standing does not fall", () => {
  assert.deepEqual(
    sounds(
      attack(ADA, "Zombie", "hit", { hpAfter: 0 }),
      fortitude("Zombie", 1),
    ),
    ["hit"],
  );
  assert.deepEqual(
    sounds(
      attack(ADA, "Zombie", "hit", { hpAfter: 0 }),
      fortitude("Zombie", 0),
    ),
    ["hit", "fall"],
  );
});

test("a hit waiting for the character's reaction sounds with the damage that answers it", () => {
  // Offered for Uncanny Dodge or Shield: the attack, no damage yet.
  const offered = attack("Goblin", ADA, "hit");
  offered.rolls = offered.rolls.slice(0, 1);
  assert.deepEqual(sounds(offered), []);
  // Taken or dodged: its damage lands on its own line.
  const landed = attack("Goblin", ADA, "hit", { hpAfter: 4 });
  landed.rolls = landed.rolls.slice(1);
  assert.deepEqual(sounds(landed), ["hurt"]);
  landed.rolls = [{ ...landed.rolls[0], hpAfter: 0 }];
  assert.deepEqual(sounds(landed), ["hurt", "fall-you"]);
});

test("a rider's damage leaves the HP to the last damage, one sound per attack", () => {
  const line = attack(ADA, "Goblin", "hit");
  line.rolls.push({
    purpose: "damage",
    roller: ADA,
    target: "Goblin",
    dice: [{ sides: 6, value: 3 }],
    modifier: 0,
    total: 3,
    damageType: "radiant",
    hpAfter: 0,
    maxHp: 12,
  });
  assert.deepEqual(sounds(line), ["hit", "fall"]);
});

test("several attacks on one card play in order", () => {
  // An Extra Attack, then a monster's turn.
  assert.deepEqual(
    sounds(
      attack(ADA, "Goblin 1", "hit", { hpAfter: 0 }),
      attack(ADA, "Goblin 2", "miss"),
      attack("Goblin 2", ADA, "hit", { hpAfter: 5 }),
      attack("Goblin 2", ADA, "miss"),
    ),
    ["hit", "fall", "miss", "hurt", "miss"],
  );
  // Across cards and entries too.
  assert.deepEqual(
    resultSounds({
      character: ADA,
      cards: [
        { kind: "result", text: "", lines: [attack(ADA, "Goblin", "miss")] },
        {
          kind: "result",
          text: "",
          lines: [attack("Goblin", ADA, "hit", { hpAfter: 3 })],
        },
      ],
      playing: false,
    }),
    ["miss", "hurt"],
  );
});

test("a spell attack and Spiritual Weapon's attack use the hit and miss sounds", () => {
  // Both are the character's attacks: the caster rolls them.
  const spell = attack(ADA, "Skeleton", "hit", { hpAfter: 3 });
  spell.text = "Ada casts Guiding Bolt at Skeleton.";
  const weapon = attack(ADA, "Skeleton", "miss");
  weapon.text = "Ada's spiritual weapon swings at Skeleton.";
  assert.deepEqual(sounds(spell, weapon), ["hit", "miss"]);
});

test("lines without attacks or falls, and narration, ask for nothing", () => {
  assert.deepEqual(
    sounds(
      { text: "Ada opens the door.", rolls: [] },
      {
        text: "Ada drinks a potion.",
        rolls: [
          {
            purpose: "healing",
            roller: ADA,
            dice: [{ sides: 4, value: 3 }],
            modifier: 2,
            total: 5,
            hpAfter: 9,
            maxHp: 12,
          },
        ],
      },
    ),
    [],
  );
});

test("the reply-ready tone follows the result's sounds while the adventure plays on", () => {
  assert.deepEqual(
    resultSounds({
      character: ADA,
      cards: [
        { kind: "result", text: "", lines: [attack(ADA, "Goblin", "miss")] },
      ],
      playing: true,
    }),
    ["miss", "reply-ready"],
  );
  assert.deepEqual(resultSounds({ character: ADA, cards: [], playing: true }), [
    "reply-ready",
  ]);
});
