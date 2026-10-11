// #344: the Wizard's 3rd-level spells in the encounter engine (owner's list,
// 11 October 2026): Fireball and Lightning Bolt (areas of four), Bestow
// Curse and Protection from Energy (the Cleric's, now a Wizard's too),
// Vampiric Touch (a draining touch, repeated with the action while the
// caster concentrates), Haste (+2 AC, advantage on Dexterity saves and one
// more attack a turn; lethargy when it ends early) and Slow (an area of
// four: −2 AC and Dexterity saves, one attack a turn, a Wisdom save at the
// end of each of its turns).
import assert from "node:assert/strict";
import test from "node:test";

import { loadBuiltInFifthBestiary } from "../dist/bestiary-5e.js";
import {
  act,
  armorClassOf,
  availableActions,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { statBlockCombatant } from "../dist/runtime-5e.js";
import { maxTargets, SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const bestiary = await loadBuiltInFifthBestiary();
/**
 * A bandit (AC 12, Scimitar +3, 1d6 + 1, Dexterity save +1, Wisdom save
 * +0) that never checks morale, so no morale dice are drawn; 40 HP unless
 * said otherwise.
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
 * Quill, a level-5 Evoker built by hand: AC 12, 20 of 32 HP, spell attack
 * +6 and save DC 14, Potent Cantrip, slots 4/3/2. A potion keeps her turn
 * open after she acts, so each test ends it itself.
 */
const quill = (extra = {}) => ({
  id: "pc",
  name: "Quill",
  side: "party",
  creatureType: "humanoid",
  armorClass: 12,
  hp: 20,
  maxHp: 32,
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
    constitution: 2,
    intelligence: 7,
    wisdom: 4,
    charisma: 0,
  },
  attack: {
    name: "Dagger",
    bonus: 5,
    damage: { dice: 1, sides: 4, modifier: 2, type: "piercing" },
    criticalRange: 20,
    finesse: true,
  },
  spellcasting: {
    attackBonus: 6,
    saveDc: 14,
    modifier: 4,
    spells: [
      "fire-bolt",
      "fireball",
      "lightning-bolt",
      "bestow-curse",
      "protection-from-energy",
      "vampiric-touch",
      "haste",
      "slow",
    ].map((id) => spellAtLevel(SPELLS[id], 5)),
    slots: [
      { uses: 4, max: 4 },
      { uses: 3, max: 3 },
      { uses: 2, max: 2 },
    ],
    potentCantrip: true,
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
const cast = (spellId, targetIds, slotLevel, extra = {}) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetIds].flat(),
  ...(slotLevel === undefined ? {} : { slotLevel }),
  ...extra,
});
const attack = (targetId) => ({ type: "attack", actorId: "pc", targetId });
const drain = (targetId) => ({ type: "drain-attack", actorId: "pc", targetId });
const ofType = (events, type) => events.filter((event) => event.type === type);
const effectOn = (state, id, spellId) =>
  combatant(state, id).effects?.find((effect) => effect.spellId === spellId);
const conditionsOn = (state, id) =>
  state.conditions
    .filter(({ targetId }) => targetId === id)
    .map(({ kind }) => kind);
const two = () => [
  bandit({ id: "b1", name: "First" }),
  bandit({ id: "b2", name: "Second" }),
];
/** Eight d6s showing `values`. */
const eightD6 = (values) => values.map((value) => [6, value]);

test("Fireball and Lightning Bolt each catch up to four (D4)", () => {
  assert.equal(maxTargets(SPELLS.fireball), 4);
  assert.equal(maxTargets(SPELLS["lightning-bolt"]), 4);
  assert.deepEqual(SPELLS["lightning-bolt"].area, {
    shape: "line",
    feet: 100,
  });
});

test("Lightning Bolt: one 8d6 roll, each target's Dexterity save for half", () => {
  const state = opening(two(), [10, 5]);
  // 8d6 = 28; the first fails (5 + 1), the second saves (19 + 1).
  const bolt = accepted(
    state,
    cast("lightning-bolt", ["b1", "b2"], 3),
    dice(...eightD6([6, 5, 4, 3, 3, 3, 2, 2]), [20, 5], [20, 19]),
  );
  const [area] = ofType(bolt.events, "spell-area");
  assert.equal(area.damageType, "lightning");
  const saves = ofType(bolt.events, "spell-save");
  assert.deepEqual(
    saves.map(({ targetId, save, damage }) => [targetId, save.success, damage]),
    [
      ["b1", false, 28],
      ["b2", true, 14],
    ],
  );
  assert.equal(combatant(bolt.state, "b1").hp, 12);
  assert.equal(combatant(bolt.state, "b2").hp, 26);
});

test("Lightning Bolt with a 4th-level slot would roll 9d6: one more die a level", () => {
  const ninth = (slot) => SPELLS["lightning-bolt"].upcast.dice * (slot - 3) + 8;
  assert.equal(ninth(4), 9);
});

test("Fireball can't catch a fifth opponent", () => {
  const foes = ["a", "b", "c", "d", "e"].map((id) =>
    bandit({ id, name: id.toUpperCase() }),
  );
  const state = opening(foes, [10, 9, 8, 7, 6]);
  const refusal = refused(
    state,
    cast("fireball", ["a", "b", "c", "d", "e"], 3),
    "too-many-targets",
  );
  assert.match(refusal.reason, /at most 4 opponents/u);
});

test("a Wizard's Bestow Curse uses its Intelligence save DC", () => {
  const state = opening([bandit()], [10]);
  // The bandit's Wisdom save: 13 + 0 misses DC 14.
  const cursed = accepted(
    state,
    cast("bestow-curse", "bandit", 3, { curse: "attacks" }),
    dice([20, 13]),
  );
  const [curse] = ofType(cursed.events, "spell-curse");
  assert.equal(curse.save.dc, 14);
  assert.equal(curse.success, false);
  assert.equal(
    effectOn(cursed.state, "bandit", "bestow-curse").buff.curse,
    "attacks",
  );
});

test("a Wizard's Protection from Energy resists the type chosen", () => {
  const state = opening([bandit()], [10]);
  const warded = accepted(
    state,
    cast("protection-from-energy", "pc", 3, { damageType: "fire" }),
  );
  const effect = effectOn(warded.state, "pc", "protection-from-energy");
  assert.equal(effect.damageType, "fire");
  assert.equal(effect.concentration, true);
});

test("Vampiric Touch: a melee spell attack, 3d6 necrotic, and Quill regains half", () => {
  const state = opening([bandit()], [10]);
  // 15 + 6 hits AC 12; 3d6 = 5 + 4 + 2 = 11: Quill regains 5.
  const touched = accepted(
    state,
    cast("vampiric-touch", "bandit", 3),
    dice([20, 15], [6, 5], [6, 4], [6, 2]),
  );
  const [hit] = ofType(touched.events, "attack");
  assert.equal(hit.weapon, "Vampiric Touch");
  assert.equal(hit.damage, 11);
  assert.equal(hit.damageType, "necrotic");
  assert.equal(combatant(touched.state, "bandit").hp, 29);
  const [drained] = ofType(touched.events, "drained");
  assert.deepEqual(drained, {
    type: "drained",
    combatantId: "pc",
    spell: "Vampiric Touch",
    healing: 5,
    hpAfter: 25,
    maxHp: 32,
  });
  assert.equal(combatant(touched.state, "pc").hp, 25);
  const effect = effectOn(touched.state, "pc", "vampiric-touch");
  assert.equal(effect.concentration, true);
  assert.equal(effect.ends, "fight");
  // The cast took the action: no touch again this turn.
  refused(touched.state, drain("bandit"), "action-used");
});

test("Vampiric Touch repeats with the action on a later turn, without a slot", () => {
  const state = opening([bandit()], [10]);
  const touched = accepted(
    state,
    cast("vampiric-touch", "bandit", 3),
    dice([20, 2]),
  );
  // A miss deals nothing and heals nothing.
  assert.equal(ofType(touched.events, "drained").length, 0);
  const next = accepted(touched.state, endTurn, dice([20, 2])).state;
  assert.ok(availableActions(next, "pc").includes("drain-attack"));
  const again = accepted(
    next,
    drain("bandit"),
    dice([20, 15], [6, 6], [6, 6], [6, 6]),
  );
  assert.equal(ofType(again.events, "attack")[0].damage, 18);
  assert.equal(ofType(again.events, "drained")[0].healing, 9);
  assert.equal(combatant(again.state, "pc").hp, 29);
  assert.equal(combatant(again.state, "pc").spellcasting.slots[2].uses, 1);
  refused(again.state, drain("bandit"), "action-used");
});

test("Vampiric Touch's healing stops at full hit points; upcast it adds a d6", () => {
  const state = opening([bandit()], [10], quill({ hp: 30 }));
  // At full hit points no potion is left to drink, so the turn ends by
  // itself and the bandit misses.
  const touched = accepted(
    state,
    cast("vampiric-touch", "bandit", 3),
    dice([20, 15], [6, 6], [6, 6], [6, 6], [20, 2]),
  );
  const [drained] = ofType(touched.events, "drained");
  assert.equal(drained.healing, 2);
  assert.equal(combatant(touched.state, "pc").hp, 32);
  const bigger = SPELLS["vampiric-touch"].upcast;
  assert.deepEqual(bigger, { dice: 1 });
});

test("no Vampiric Touch to repeat until it is cast, nor once concentration moves on", () => {
  const state = opening([bandit()], [10]);
  refused(state, drain("bandit"), "no-drain");
  assert.ok(!availableActions(state, "pc").includes("drain-attack"));
  const touched = accepted(
    state,
    cast("vampiric-touch", "bandit", 3),
    dice([20, 2]),
  );
  const next = accepted(touched.state, endTurn, dice([20, 2])).state;
  // Slow takes Quill's concentration: the touch is gone.
  const slowed = accepted(next, cast("slow", "bandit", 3), dice([20, 19]));
  assert.equal(effectOn(slowed.state, "pc", "vampiric-touch"), undefined);
});

test("Haste: +2 AC, advantage on Dexterity saves and one more attack a turn", () => {
  const state = opening([bandit()], [10]);
  const hasted = accepted(state, cast("haste", "pc", 3));
  const effect = effectOn(hasted.state, "pc", "haste");
  assert.deepEqual(effect.buff, { kind: "haste" });
  assert.equal(effect.concentration, true);
  assert.equal(effect.ends, "fight");
  assert.equal(armorClassOf(combatant(hasted.state, "pc")), 14);
  // The cast took the action; Haste's own attack is left this turn.
  assert.ok(availableActions(hasted.state, "pc").includes("attack"));
  const stab = accepted(hasted.state, attack("bandit"), dice([20, 15], [4, 3]));
  const [hit] = ofType(stab.events, "attack");
  assert.equal(hit.hasted, true);
  assert.equal(hit.damage, 5);
  refused(stab.state, attack("bandit"), "action-used");
  // Next turn: the action's attack and Haste's.
  const next = accepted(stab.state, endTurn, dice([20, 2])).state;
  const first = accepted(next, attack("bandit"), dice([20, 15], [4, 3]));
  assert.equal(ofType(first.events, "attack")[0].hasted, true);
  const second = accepted(
    first.state,
    attack("bandit"),
    dice([20, 15], [4, 3]),
  );
  assert.equal(ofType(second.events, "attack")[0].hasted, undefined);
  refused(second.state, attack("bandit"), "action-used");
});

test("Haste's attack is only an attack: the action can still cast after it", () => {
  const state = opening([bandit()], [10]);
  const hasted = accepted(state, cast("haste", "pc", 3));
  const next = accepted(hasted.state, endTurn, dice([20, 2])).state;
  const stab = accepted(next, attack("bandit"), dice([20, 15], [4, 3]));
  // Round 2: Fire Bolt has disadvantage (D6).
  accepted(
    stab.state,
    cast("fire-bolt", "bandit"),
    dice([20, 15], [20, 15], [10, 4], [10, 4]),
  );
});

test("Haste gives advantage on Dexterity saves", () => {
  const state = opening([bandit()], [10]);
  const hasted = combatant(accepted(state, cast("haste", "pc", 3)).state, "pc");
  // A mage on the other side casts Lightning Bolt at a hasted Quill: her
  // Dexterity save keeps the better of 3 and 15.
  const fight = startEncounter(
    [
      {
        ...bandit({ id: "mage", name: "Mage", side: "party", hp: 20 }),
        spellcasting: quill().spellcasting,
        potions: quill().potions,
      },
      { ...hasted, side: "opponents" },
    ],
    dice([20, 20], [20, 1]),
  ).state;
  const bolt = accepted(
    fight,
    { ...cast("lightning-bolt", "pc", 3), actorId: "mage" },
    // Her save, then her concentration's (4 damage, DC 10).
    dice(...eightD6([1, 1, 1, 1, 1, 1, 1, 1]), [20, 3], [20, 15], [20, 15]),
  );
  const [save] = ofType(bolt.events, "spell-save");
  assert.deepEqual(save.save.mode.advantage, ["Haste"]);
  assert.equal(save.save.success, true);
});

test("Haste ends with the fight, with no lethargy", () => {
  const state = opening([bandit({ hp: 4, maxHp: 4 })], [10]);
  const hasted = accepted(state, cast("haste", "pc", 3)).state;
  const won = accepted(hasted, attack("bandit"), dice([20, 15], [4, 3]));
  assert.equal(won.state.outcome, "victory");
  assert.equal(effectOn(won.state, "pc", "haste"), undefined);
  assert.deepEqual(conditionsOn(won.state, "pc"), []);
});

test("Haste ended early leaves Quill lethargic: she can't act on her next turn", () => {
  const state = opening([bandit()], [10]);
  const hasted = accepted(state, cast("haste", "pc", 3)).state;
  // The bandit hits for 6 (5 + 1); Quill's Constitution save fails (3 + 2).
  const broken = accepted(hasted, endTurn, dice([20, 15], [6, 5], [20, 3]));
  const [ended] = ofType(broken.events, "effect-ended");
  assert.deepEqual(
    [ended.spell, ended.reason],
    ["Haste", "concentration-broken"],
  );
  const [lethargy] = ofType(broken.events, "condition");
  assert.equal(lethargy.kind, "incapacitated");
  assert.equal(lethargy.source, "Haste");
  assert.equal(armorClassOf(combatant(broken.state, "pc")), 12);
  // Quill's turn: incapacitated, she can only wait.
  assert.equal(currentCombatant(broken.state).id, "pc");
  assert.deepEqual(availableActions(broken.state, "pc"), ["end-turn"]);
  const waited = accepted(broken.state, endTurn, dice([20, 2]));
  // The lethargy ends with that turn.
  assert.deepEqual(conditionsOn(waited.state, "pc"), []);
  assert.ok(availableActions(waited.state, "pc").includes("cast"));
});

test("Haste ended on Quill's own turn by a new concentration spell lasts to the end of her next turn", () => {
  const state = opening([bandit()], [10]);
  const hasted = accepted(state, cast("haste", "pc", 3)).state;
  const next = accepted(hasted, endTurn, dice([20, 2])).state;
  // Slow ends Haste: lethargic at once, so her turn ends by itself and the
  // bandit attacks; her next turn she can only wait.
  const slowed = accepted(
    next,
    cast("slow", "bandit", 3),
    dice([20, 19], [20, 2]),
  );
  assert.equal(currentCombatant(slowed.state).id, "pc");
  assert.deepEqual(conditionsOn(slowed.state, "pc"), ["incapacitated"]);
  assert.deepEqual(availableActions(slowed.state, "pc"), ["end-turn"]);
  const free = accepted(slowed.state, endTurn, dice([20, 2]));
  assert.deepEqual(conditionsOn(free.state, "pc"), []);
});

test("Slow catches up to four: a failed Wisdom save slows each", () => {
  assert.equal(maxTargets(SPELLS.slow), 4);
  const state = opening(two(), [10, 5]);
  // First fails (13 + 0 < 14), second saves (14).
  const slowed = accepted(
    state,
    cast("slow", ["b1", "b2"], 3),
    dice([20, 13], [20, 14]),
  );
  const saves = ofType(slowed.events, "spell-slow");
  assert.deepEqual(
    saves.map(({ targetId, success, save }) => [targetId, success, save.dc]),
    [
      ["b1", false, 14],
      ["b2", true, 14],
    ],
  );
  const effect = effectOn(slowed.state, "b1", "slow");
  assert.deepEqual(effect.buff, { kind: "slowed" });
  assert.equal(effect.concentration, true);
  assert.equal(effectOn(slowed.state, "b2", "slow"), undefined);
  // −2 AC.
  assert.equal(armorClassOf(combatant(slowed.state, "b1")), 10);
  assert.equal(armorClassOf(combatant(slowed.state, "b2")), 12);
});

test("Slow: −2 on Dexterity saves, and a Wisdom save at the end of each turn ends it", () => {
  const state = opening([bandit()], [10]);
  const slowed = accepted(state, cast("slow", "bandit", 3), dice([20, 13]));
  // Its turn: it attacks (a miss), then fails its repeat save (13).
  const round = accepted(slowed.state, endTurn, dice([20, 2], [20, 13]));
  const [repeat] = ofType(round.events, "spell-slow");
  assert.equal(repeat.repeat, true);
  assert.equal(repeat.success, false);
  assert.ok(effectOn(round.state, "bandit", "slow"));
  // Lightning Bolt: its Dexterity save is +1 − 2.
  const bolt = accepted(
    round.state,
    cast("lightning-bolt", "bandit", 3),
    dice(...eightD6([1, 1, 1, 1, 1, 1, 1, 1]), [20, 14]),
  );
  const [save] = ofType(bolt.events, "spell-save");
  assert.equal(save.save.bonus, -1);
  assert.equal(save.save.total, 13);
  assert.equal(save.save.success, false);
  // Next turn it saves (14): Slow ends on it.
  const freed = accepted(bolt.state, endTurn, dice([20, 2], [20, 14]));
  const [ended] = ofType(freed.events, "effect-ended");
  assert.deepEqual([ended.spell, ended.reason], ["Slow", "saved"]);
  assert.equal(effectOn(freed.state, "bandit", "slow"), undefined);
});

test("Slow cuts a Multiattack to one attack", () => {
  const brute = bandit({
    multiattack: { attacks: 2, weapons: [bandit().attack] },
  });
  const state = opening([brute], [10]);
  const slowed = accepted(state, cast("slow", "bandit", 3), dice([20, 13]));
  const round = accepted(slowed.state, endTurn, dice([20, 2], [20, 13]));
  assert.equal(ofType(round.events, "attack").length, 1);
});

test("Slow ends on every target when Quill's concentration does", () => {
  const state = opening(two(), [10, 5]);
  const slowed = accepted(
    state,
    cast("slow", ["b1", "b2"], 3),
    dice([20, 1], [20, 1]),
  );
  const next = accepted(
    slowed.state,
    endTurn,
    dice([20, 2], [20, 1], [20, 2], [20, 1]),
  ).state;
  const hasted = accepted(next, cast("haste", "pc", 3));
  assert.equal(effectOn(hasted.state, "b1", "slow"), undefined);
  assert.equal(effectOn(hasted.state, "b2", "slow"), undefined);
});
