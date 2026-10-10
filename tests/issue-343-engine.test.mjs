// #343: the Wizard's levels 2–3 in the encounter engine. Potent Cantrip
// (the Evoker's level 3): a damaging cantrip that misses, or whose save
// succeeds, deals half its damage. The new spells: Scorching Ray (rays
// split among the targets), Acid Arrow (half on a miss, more acid at the
// end of the target's next turn), Mind Spike, Blur (disadvantage on attacks
// against the caster), Mirror Image (duplicates that take hits), Ray of
// Sickness (poisoned on a hit) and Ice Knife (a burst, hit or miss).
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import {
  act,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { statBlockCombatant } from "../dist/runtime-5e.js";
import { maxTargets, SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const bestiary = await loadBuiltInFifthBestiary();
/**
 * A bandit (AC 12, Scimitar +3, 1d6 + 1) that never checks morale, so no
 * morale dice are drawn; 40 HP unless said otherwise.
 */
const bandit = (extra = {}) => {
  const { statBlock } = bestiary.monsters.find(({ id }) => id === "bandit");
  const { morale: _morale, ...rest } = statBlockCombatant(
    "bandit",
    statBlock.name,
    statBlock,
  );
  void _morale;
  return { ...rest, hp: 40, maxHp: 40, ...extra };
};

/**
 * Quill, a level-3 Evoker built by hand: AC 12, 20 of 25 HP, spell attack +5
 * and save DC 13, with Potent Cantrip unless `potent` is false. A potion
 * keeps her turn open after she acts, so each test ends it itself. Sacred
 * Flame isn't a Wizard's, but it is the save cantrip Potent Cantrip halves.
 */
const quill = ({ potent = true, ...extra } = {}) => ({
  id: "pc",
  name: "Quill",
  side: "party",
  creatureType: "humanoid",
  armorClass: 12,
  hp: 20,
  maxHp: 25,
  potions: [
    {
      id: "potion",
      name: "Potion of Healing",
      healing: { dice: 2, sides: 4, modifier: 2 },
    },
  ],
  dexterity: 14,
  initiativeBonus: 2,
  saves: {
    strength: -1,
    dexterity: 2,
    constitution: 1,
    intelligence: 5,
    wisdom: 3,
    charisma: 0,
  },
  attack: {
    name: "Quarterstaff",
    bonus: 1,
    damage: { dice: 1, sides: 6, modifier: -1, type: "bludgeoning" },
    criticalRange: 20,
  },
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: [
      "fire-bolt",
      "sacred-flame",
      "ray-of-sickness",
      "ice-knife",
      "scorching-ray",
      "acid-arrow",
      "mind-spike",
      "blur",
      "mirror-image",
    ].map((id) => spellAtLevel(SPELLS[id], 3)),
    slots: [
      { uses: 4, max: 4 },
      { uses: 2, max: 2 },
      { uses: 1, max: 1 },
    ],
    ...(potent ? { potentCantrip: true } : {}),
  },
  ...extra,
});

/** A fight Quill opens: her initiative 20, then each foe's d20 in turn. */
function opening(foes, rolls, pc = quill()) {
  const { state } = startEncounter(
    [pc, ...foes],
    dice([20, 20], ...rolls.map((roll) => [20, roll])),
  );
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

function accepted(state, action, random = dice()) {
  const result = act(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(state, action, code) {
  const result = act(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  return result.rejection;
}

const endTurn = { type: "end-turn", actorId: "pc" };
const cast = (spellId, targetIds, slotLevel) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetIds].flat(),
  ...(slotLevel === undefined ? {} : { slotLevel }),
});
const ofType = (events, type) => events.filter((event) => event.type === type);
const effectOn = (state, id, spellId) =>
  combatant(state, id).effects?.find((effect) => effect.spellId === spellId);
const conditionsOn = (state, id) =>
  state.conditions
    .filter(({ targetId }) => targetId === id)
    .map(({ kind }) => kind);

test("Potent Cantrip: a missed Fire Bolt still deals half its damage", () => {
  const state = opening([bandit()], [10]);
  // A 2 misses AC 12; the 1d10 shows 7, so 3 fire.
  const bolt = accepted(
    state,
    cast("fire-bolt", "bandit"),
    dice([20, 2], [10, 7]),
  );
  const [attack] = ofType(bolt.events, "attack");
  assert.equal(attack.hit, false);
  assert.deepEqual(attack.damageRolls, [7]);
  assert.equal(attack.damage, 3);
  assert.equal(attack.missHalf, true);
  assert.equal(combatant(bolt.state, "bandit").hp, 37);
});

test("Without Potent Cantrip a missed cantrip deals nothing", () => {
  const state = opening([bandit()], [10], quill({ potent: false }));
  const bolt = accepted(state, cast("fire-bolt", "bandit"), dice([20, 2]));
  const [attack] = ofType(bolt.events, "attack");
  assert.equal(attack.damage, 0);
  assert.equal(attack.missHalf, undefined);
  assert.equal(combatant(bolt.state, "bandit").hp, 40);
});

test("Potent Cantrip: a cantrip's successful save takes half, not none", () => {
  const state = opening([bandit()], [10]);
  // A natural 20 saves; the 1d8 (level 3) shows 7, so 3 radiant.
  const flame = accepted(
    state,
    cast("sacred-flame", "bandit"),
    dice([20, 20], [8, 7]),
  );
  const [save] = ofType(flame.events, "spell-save");
  assert.equal(save.save.success, true);
  assert.equal(save.onSuccess, "half");
  assert.equal(save.damage, 3);
  // Without it, the success takes nothing and rolls no damage.
  const plain = opening([bandit()], [10], quill({ potent: false }));
  const none = accepted(plain, cast("sacred-flame", "bandit"), dice([20, 20]));
  assert.equal(ofType(none.events, "spell-save")[0].damage, 0);
});

test("Potent Cantrip halves only cantrips: a missed Ray of Sickness deals nothing", () => {
  const state = opening([bandit()], [10]);
  const ray = accepted(
    state,
    cast("ray-of-sickness", "bandit", 1),
    dice([20, 2]),
  );
  assert.equal(ofType(ray.events, "attack")[0].damage, 0);
  assert.deepEqual(conditionsOn(ray.state, "bandit"), []);
});

test("Scorching Ray: three rays at one target, each its own attack", () => {
  assert.equal(maxTargets(SPELLS["scorching-ray"], 2), 3);
  assert.equal(maxTargets(SPELLS["scorching-ray"], 3), 4);
  const state = opening([bandit()], [10]);
  const rays = accepted(
    state,
    cast("scorching-ray", "bandit", 2),
    dice([20, 15], [6, 3], [6, 3], [20, 15], [6, 3], [6, 3], [20, 2]),
  );
  const attacks = ofType(rays.events, "attack");
  assert.deepEqual(
    attacks.map(({ targetId, hit, damage, weapon }) => [
      weapon,
      targetId,
      hit,
      damage,
    ]),
    [
      ["Scorching Ray", "bandit", true, 6],
      ["Scorching Ray", "bandit", true, 6],
      ["Scorching Ray", "bandit", false, 0],
    ],
  );
  assert.equal(combatant(rays.state, "bandit").hp, 28);
  // One slot and one action for all three.
  assert.equal(
    combatant(rays.state, "pc").spellcasting.slots[1].uses,
    1,
    "one 2nd-level slot spent",
  );
  assert.equal(ofType(rays.events, "cast").length, 1);
});

test("Scorching Ray splits its rays among the targets, the first taking any more", () => {
  const state = opening(
    [bandit({ id: "b1", name: "First" }), bandit({ id: "b2", name: "Second" })],
    [10, 5],
  );
  const rays = accepted(
    state,
    cast("scorching-ray", ["b1", "b2"], 2),
    dice(
      [20, 15],
      [6, 1],
      [6, 1],
      [20, 15],
      [6, 2],
      [6, 2],
      [20, 15],
      [6, 3],
      [6, 3],
    ),
  );
  assert.deepEqual(
    ofType(rays.events, "attack").map(({ targetId, damage }) => [
      targetId,
      damage,
    ]),
    [
      ["b1", 2],
      ["b1", 4],
      ["b2", 6],
    ],
  );
  // A 3rd-level slot hurls four, two at each.
  const four = accepted(
    state,
    cast("scorching-ray", ["b1", "b2"], 3),
    dice(...[1, 2, 3, 4].flatMap(() => [[20, 2]])),
  );
  assert.deepEqual(
    ofType(four.events, "attack").map(({ targetId }) => targetId),
    ["b1", "b1", "b2", "b2"],
  );
});

test("Scorching Ray can't aim at more targets than it has rays, nor one twice", () => {
  const state = opening(
    [
      bandit({ id: "b1", name: "First" }),
      bandit({ id: "b2", name: "Second" }),
      bandit({ id: "b3", name: "Third" }),
      bandit({ id: "b4", name: "Fourth" }),
    ],
    [10, 9, 8, 7],
  );
  refused(
    state,
    cast("scorching-ray", ["b1", "b2", "b3", "b4"], 2),
    "too-many-targets",
  );
  refused(state, cast("scorching-ray", ["b1", "b1"], 2), "duplicate-target");
});

test("A ray whose target has fallen goes at the next target standing", () => {
  const state = opening(
    [
      bandit({ id: "b1", name: "First", hp: 5 }),
      bandit({ id: "b2", name: "Second" }),
    ],
    [10, 5],
  );
  // The first ray drops the First Bandit; the second, meant for it too,
  // goes at the Second, as does the third.
  const rays = accepted(
    state,
    cast("scorching-ray", ["b1", "b2"], 2),
    dice([20, 15], [6, 3], [6, 3], [20, 15], [6, 1], [6, 1], [20, 2]),
  );
  assert.deepEqual(
    ofType(rays.events, "attack").map(({ targetId, damage }) => [
      targetId,
      damage,
    ]),
    [
      ["b1", 6],
      ["b2", 2],
      ["b2", 0],
    ],
  );
  assert.equal(combatant(rays.state, "b1").hp, 0);
});

test("Scorching Ray stops when no target it chose is left", () => {
  const state = opening([bandit({ hp: 5 })], [10]);
  const rays = accepted(
    state,
    cast("scorching-ray", "bandit", 2),
    dice([20, 15], [6, 3], [6, 3]),
  );
  assert.equal(ofType(rays.events, "attack").length, 1);
  assert.equal(rays.state.outcome, "victory");
});

test("Acid Arrow: a hit deals 4d4 now and 2d4 at the end of the target's next turn", () => {
  const state = opening([bandit()], [10]);
  const arrow = accepted(
    state,
    cast("acid-arrow", "bandit", 2),
    dice([20, 15], [4, 1], [4, 1], [4, 1], [4, 1]),
  );
  assert.equal(combatant(arrow.state, "bandit").hp, 36);
  const acid = effectOn(arrow.state, "bandit", "acid-arrow");
  assert.deepEqual(acid.buff, {
    kind: "later-damage",
    damage: { dice: 2, sides: 4, type: "acid" },
  });
  // The bandit misses, then its turn ends: 2 + 2 acid.
  const round = accepted(arrow.state, endTurn, dice([20, 1], [4, 2], [4, 2]));
  const [later] = ofType(round.events, "spell-damage");
  assert.deepEqual(
    [later.spell, later.targetId, later.damage, later.damageType],
    ["Acid Arrow", "bandit", 4, "acid"],
  );
  assert.equal(combatant(round.state, "bandit").hp, 32);
  assert.equal(effectOn(round.state, "bandit", "acid-arrow"), undefined);
  // Only once.
  const next = accepted(round.state, endTurn, dice([20, 1]));
  assert.equal(ofType(next.events, "spell-damage").length, 0);
});

test("Acid Arrow: a miss splashes half the first damage and nothing later", () => {
  const state = opening([bandit()], [10]);
  const arrow = accepted(
    state,
    cast("acid-arrow", "bandit", 2),
    dice([20, 2], [4, 4], [4, 4], [4, 3], [4, 4]),
  );
  const [attack] = ofType(arrow.events, "attack");
  assert.equal(attack.hit, false);
  assert.equal(attack.damage, 7);
  assert.equal(effectOn(arrow.state, "bandit", "acid-arrow"), undefined);
  assert.equal(combatant(arrow.state, "bandit").hp, 33);
});

test("Acid Arrow with a 3rd-level slot: 5d4 now and 3d4 later", () => {
  const state = opening([bandit()], [10]);
  const arrow = accepted(
    state,
    cast("acid-arrow", "bandit", 3),
    dice([20, 15], [4, 1], [4, 1], [4, 1], [4, 1], [4, 1]),
  );
  assert.equal(combatant(arrow.state, "bandit").hp, 35);
  assert.equal(
    effectOn(arrow.state, "bandit", "acid-arrow").buff.damage.dice,
    3,
  );
});

test("Acid Arrow's later acid can win the fight", () => {
  const state = opening([bandit({ hp: 6 })], [10]);
  const arrow = accepted(
    state,
    cast("acid-arrow", "bandit", 2),
    dice([20, 15], [4, 1], [4, 1], [4, 1], [4, 1]),
  );
  const round = accepted(arrow.state, endTurn, dice([20, 1], [4, 1], [4, 1]));
  assert.equal(combatant(round.state, "bandit").hp, 0);
  assert.equal(round.state.outcome, "victory");
});

test("Ray of Sickness: a hit deals 2d8 poison and poisons the target for its next turn", () => {
  const state = opening([bandit()], [10]);
  const ray = accepted(
    state,
    cast("ray-of-sickness", "bandit", 1),
    dice([20, 15], [8, 3], [8, 3]),
  );
  assert.equal(combatant(ray.state, "bandit").hp, 34);
  assert.deepEqual(conditionsOn(ray.state, "bandit"), ["poisoned"]);
  // Poisoned, the bandit attacks with disadvantage; its turn's end ends it.
  const round = accepted(ray.state, endTurn, dice([20, 18], [20, 2]));
  const [attack] = ofType(round.events, "attack");
  assert.deepEqual(attack.mode.disadvantage, ["Poisoned"]);
  assert.deepEqual(conditionsOn(round.state, "bandit"), []);
});

test("Ice Knife: a miss still bursts, and a failed Dexterity save takes 2d6 cold", () => {
  const state = opening([bandit()], [10]);
  const knife = accepted(
    state,
    cast("ice-knife", "bandit", 1),
    dice([20, 2], [20, 5], [6, 3], [6, 3]),
  );
  assert.equal(ofType(knife.events, "attack")[0].hit, false);
  const [burst] = ofType(knife.events, "spell-save");
  assert.deepEqual(
    [burst.spell, burst.save.success, burst.damage, burst.damageType],
    ["Ice Knife", false, 6, "cold"],
  );
  assert.equal(combatant(knife.state, "bandit").hp, 34);
});

test("Ice Knife: a hit's piercing, then a saved burst deals nothing", () => {
  const state = opening([bandit()], [10]);
  const knife = accepted(
    state,
    cast("ice-knife", "bandit", 1),
    dice([20, 15], [10, 5], [20, 20]),
  );
  assert.equal(combatant(knife.state, "bandit").hp, 35);
  assert.equal(ofType(knife.events, "spell-save")[0].damage, 0);
});

test("Ice Knife with a 2nd-level slot bursts for 3d6; its knife stays 1d10", () => {
  const state = opening([bandit()], [10]);
  const knife = accepted(
    state,
    cast("ice-knife", "bandit", 2),
    dice([20, 15], [10, 1], [20, 1], [6, 1], [6, 1], [6, 1]),
  );
  assert.equal(combatant(knife.state, "bandit").hp, 36);
});

test("Ice Knife's knife can drop its target: no burst then", () => {
  const state = opening([bandit({ hp: 3 })], [10]);
  const knife = accepted(
    state,
    cast("ice-knife", "bandit", 1),
    dice([20, 15], [10, 5]),
  );
  assert.equal(ofType(knife.events, "spell-save").length, 0);
  assert.equal(knife.state.outcome, "victory");
});

test("Mind Spike: a Wisdom save, 3d8 psychic, half on a success", () => {
  const state = opening([bandit()], [10]);
  const spike = accepted(
    state,
    cast("mind-spike", "bandit", 2),
    dice([20, 5], [8, 4], [8, 4], [8, 4]),
  );
  assert.equal(combatant(spike.state, "bandit").hp, 28);
  // No concentration is kept.
  assert.equal(effectOn(spike.state, "pc", "mind-spike"), undefined);
  const saved = accepted(
    state,
    cast("mind-spike", "bandit", 2),
    dice([20, 20], [8, 4], [8, 4], [8, 3]),
  );
  assert.equal(combatant(saved.state, "bandit").hp, 35);
});

test("Blur: attacks on Quill have disadvantage while she concentrates", () => {
  const state = opening([bandit()], [10]);
  const blurred = accepted(state, cast("blur", "pc", 2));
  const effect = effectOn(blurred.state, "pc", "blur");
  assert.equal(effect.concentration, true);
  assert.equal(effect.ends, "fight");
  // The bandit's 18 would hit AC 12, but its other d20 is a 3.
  const round = accepted(blurred.state, endTurn, dice([20, 18], [20, 3]));
  const [attack] = ofType(round.events, "attack");
  assert.deepEqual(attack.mode.disadvantage, ["Blur"]);
  assert.equal(attack.hit, false);
  // Casting it again is refused while it lasts.
  refused(round.state, cast("blur", "pc", 2), "effect-active");
});

test("Mirror Image: a duplicate takes a hit when any of its d6s shows 3 or more", () => {
  const state = opening([bandit()], [10]);
  const imaged = accepted(state, cast("mirror-image", "pc", 2));
  const effect = effectOn(imaged.state, "pc", "mirror-image");
  assert.deepEqual(effect.buff, { kind: "mirror-image", duplicates: 3 });
  assert.equal(effect.concentration, undefined);
  assert.equal(effect.ends, "fight");
  // The bandit hits (18); three d6s, one a 3: a duplicate takes it.
  const round = accepted(
    imaged.state,
    endTurn,
    dice([20, 18], [6, 1], [6, 1], [6, 3]),
  );
  const [attack] = ofType(round.events, "attack");
  assert.equal(attack.hit, true);
  assert.deepEqual(attack.mirrorImage, {
    rolls: [1, 1, 3],
    struck: true,
    left: 2,
  });
  assert.equal(attack.damage, 0);
  assert.equal(combatant(round.state, "pc").hp, 20);
  assert.equal(effectOn(round.state, "pc", "mirror-image").buff.duplicates, 2);
  // Next hit, two d6s under 3: Quill takes it (4 + 1).
  const next = accepted(
    round.state,
    endTurn,
    dice([20, 18], [6, 2], [6, 1], [6, 4]),
  );
  const [hit] = ofType(next.events, "attack");
  assert.deepEqual(hit.mirrorImage, { rolls: [2, 1], struck: false, left: 2 });
  assert.equal(hit.damage, 5);
  assert.equal(combatant(next.state, "pc").hp, 15);
});

test("Mirror Image ends when its last duplicate is destroyed; a miss rolls no d6", () => {
  const state = opening([bandit()], [10]);
  const imaged = accepted(state, cast("mirror-image", "pc", 2));
  const missed = accepted(imaged.state, endTurn, dice([20, 2]));
  assert.equal(effectOn(missed.state, "pc", "mirror-image").buff.duplicates, 3);
  let current = missed.state;
  for (const left of [2, 1]) {
    current = accepted(
      current,
      endTurn,
      dice([20, 18], ...Array.from({ length: left + 1 }, () => [6, 6])),
    ).state;
    assert.equal(effectOn(current, "pc", "mirror-image").buff.duplicates, left);
  }
  const last = accepted(current, endTurn, dice([20, 18], [6, 6]));
  assert.equal(effectOn(last.state, "pc", "mirror-image"), undefined);
  const [ended] = ofType(last.events, "effect-ended");
  assert.deepEqual([ended.spell, ended.reason], ["Mirror Image", "destroyed"]);
});
