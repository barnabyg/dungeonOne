// #337: ongoing spell effects, concentration and reaction spells in the
// encounter engine, on combatants built by hand. A buff puts an effect on
// the caster or an ally: Bless adds a d4 to attack rolls and saving throws,
// Shield of Faith +2 AC, Mage Armor a base AC of 13 + Dexterity while
// unarmoured. Without a clock each ends by its duration's band (D9). One
// concentration spell at a time; damage calls for a Constitution save.
// Shield answers a hit through the reaction path Uncanny Dodge uses.
import assert from "node:assert/strict";
import test from "node:test";

import {
  act,
  armorClassOf,
  availableActions,
  castOutsideFight,
  combatant,
  concentrationDc,
  currentCombatant,
  savingThrow,
  startEncounter,
} from "../dist/encounter-5e.js";
import { effectEnds, SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const SAVES = {
  strength: 0,
  dexterity: 1,
  constitution: 2,
  intelligence: 0,
  wisdom: 5,
  charisma: 2,
};

/**
 * Sage as a combatant, unarmoured (AC 11): hurt and carrying a potion, so
 * its turn stays open after casting with its action.
 */
const sage = ({
  spells = [
    "fire-bolt",
    "magic-missile",
    "bless",
    "shield-of-faith",
    "mage-armor",
  ],
  slots = [{ uses: 2, max: 2 }],
  ...rest
} = {}) => ({
  id: "pc",
  name: "Sage",
  side: "party",
  armorClass: 11,
  hp: 9,
  maxHp: 10,
  dexterity: 13,
  initiativeBonus: 1,
  saves: SAVES,
  potions: [
    {
      id: "potion",
      name: "Potion of Healing",
      healing: { dice: 2, sides: 4, modifier: 2 },
    },
  ],
  attack: {
    name: "Mace",
    bonus: 3,
    damage: { dice: 1, sides: 6, modifier: 1, type: "bludgeoning" },
    criticalRange: 20,
  },
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: spells.map((id) => spellAtLevel(SPELLS[id], 1)),
    slots,
  },
  ...rest,
});

const goblin = (id = "goblin", extra = {}) => ({
  id,
  name: id === "goblin" ? "Goblin Warrior" : id,
  side: "opponents",
  armorClass: 15,
  hp: 10,
  maxHp: 10,
  dexterity: 15,
  initiativeBonus: 2,
  saves: {
    strength: -1,
    dexterity: 2,
    constitution: 0,
    intelligence: 0,
    wisdom: -1,
    charisma: -1,
  },
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
  ...extra,
});

/** An effect as the engine puts it on Sage. */
const effect = (spellId) => {
  const { name, effect: buff } = SPELLS[spellId];
  return {
    spellId,
    spell: name,
    casterId: "pc",
    buff: buff.buff,
    ends: effectEnds(buff.duration),
    ...(buff.concentration ? { concentration: true } : {}),
  };
};

/** A fight Sage opens: Sage's initiative 15, the goblin's 3. */
function opening(caster = sage(), foe = goblin()) {
  const { state } = startEncounter([caster, foe], dice([20, 15], [20, 3]));
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

/**
 * A fight the goblin opens (its initiative 15, Sage's 3); `turn` is the
 * goblin's turn's dice, up to its pause or Sage's turn.
 */
function goblinFirst(caster, foe, ...turn) {
  const random = dice([20, 3], [20, 15], ...turn);
  const result = startEncounter([caster, foe], random);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const cast = (spellId, targetId = "pc", slotLevel = 1) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetId,
  slotLevel,
});

const cantrip = (spellId, targetId = "goblin") => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetId,
});

function accepted(state, action, random = dice()) {
  const result = act(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(state, action, code) {
  const result = act(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection.reason;
}

const pc = (state) => combatant(state, "pc");
const types = (events) => events.map(({ type }) => type);

test("each duration falls in its band (D9)", () => {
  assert.equal(effectEnds({ until: "next-turn" }), "next-turn");
  assert.equal(effectEnds({ minutes: 1 }), "fight");
  assert.equal(effectEnds({ minutes: 10 }), "rest");
  assert.equal(effectEnds({ minutes: 60 }), "rest");
  assert.equal(effectEnds({ minutes: 480 }), "long-rest");
  assert.deepEqual(
    ["bless", "shield-of-faith", "mage-armor", "shield"].map((id) =>
      effectEnds(SPELLS[id].effect.duration),
    ),
    ["fight", "rest", "long-rest", "next-turn"],
  );
});

test("Bless: concentration, and a d4 on attack rolls and saving throws", () => {
  const state = opening();
  const { state: blessed, events } = accepted(state, cast("bless"));
  assert.deepEqual(types(events), ["cast", "effect"]);
  assert.deepEqual(events[1], {
    type: "effect",
    targetId: "pc",
    ...effect("bless"),
  });
  assert.deepEqual(pc(blessed).effects, [effect("bless")]);
  assert.deepEqual(pc(blessed).spellcasting.slots, [{ uses: 1, max: 2 }]);
  // A d4 on a saving throw: 9 + 2 + 3 = 14 against DC 14.
  const save = savingThrow(
    blessed,
    pc(blessed),
    { ability: "constitution", dc: 14 },
    dice([20, 9], [4, 3]),
  );
  assert.deepEqual(save.effectDice, [{ spell: "Bless", sides: 4, roll: 3 }]);
  assert.equal(save.total, 14);
  assert.equal(save.success, true);
  // And on an attack roll: 8 + 5 + 2 = 15 meets AC 15.
  const next = opening(sage({ effects: [effect("bless")] }));
  const { events: bolted } = accepted(
    next,
    cantrip("fire-bolt"),
    dice([20, 8], [4, 2], [10, 4]),
  );
  assert.equal(bolted[1].total, 15);
  assert.equal(bolted[1].hit, true);
  assert.deepEqual(bolted[1].effectDice, [
    { spell: "Bless", sides: 4, roll: 2 },
  ]);
  // A spell already on its target can't be cast on it again: no renewing it.
  assert.equal(
    refused(next, cast("bless"), "effect-active"),
    "Bless is already on you: it can't be cast again until it ends.",
  );
});

test("a second concentration spell ends the first", () => {
  const state = opening(sage({ effects: [effect("bless")] }));
  const { state: after, events } = accepted(state, cast("shield-of-faith"));
  assert.deepEqual(types(events), ["cast", "effect-ended", "effect"]);
  assert.deepEqual(events[1], {
    type: "effect-ended",
    targetId: "pc",
    casterId: "pc",
    spellId: "bless",
    spell: "Bless",
    reason: "new-concentration",
  });
  assert.deepEqual(pc(after).effects, [effect("shield-of-faith")]);
  assert.equal(armorClassOf(pc(after)), 13);
  // Mage Armor needs no concentration: Shield of Faith stays beside it.
  const { state: armoured, events: more } = accepted(
    opening(sage({ effects: [effect("shield-of-faith")] })),
    cast("mage-armor"),
  );
  assert.deepEqual(types(more), ["cast", "effect"]);
  assert.deepEqual(pc(armoured).effects, [
    effect("shield-of-faith"),
    effect("mage-armor"),
  ]);
  // Base 13 + Dexterity 1, then +2.
  assert.equal(armorClassOf(pc(armoured)), 16);
});

test("Mage Armor works only on a target wearing no armour", () => {
  const state = opening(sage({ armour: true, armorClass: 13 }));
  assert.equal(
    refused(state, cast("mage-armor"), "wearing-armour"),
    "Mage Armor works only on someone wearing no armour, and you are wearing armour.",
  );
  // Nor is a buff cast on a foe.
  assert.equal(
    refused(state, cast("bless", "goblin"), "ally-target"),
    "Bless is cast on you or an ally, not Goblin Warrior.",
  );
});

test("concentration: damage calls for a Constitution save; a failure ends it", () => {
  assert.equal(concentrationDc(7), 10);
  assert.equal(concentrationDc(25), 12);
  assert.equal(concentrationDc(80), 30);
  // The goblin hits for 6; Sage's save, 5 + 2 + 1 (Bless) = 8, fails DC 10.
  const caster = sage({ effects: [effect("bless")] });
  const { state, events } = goblinFirst(
    caster,
    goblin(),
    [20, 12],
    [6, 4],
    [20, 5],
    [4, 1],
  );
  const save = events.find(({ type }) => type === "concentration");
  assert.deepEqual(save, {
    type: "concentration",
    combatantId: "pc",
    spell: "Bless",
    damage: 6,
    save: {
      ability: "constitution",
      bonus: 2,
      dc: 10,
      success: false,
      d20: 5,
      effectDice: [{ spell: "Bless", sides: 4, roll: 1 }],
      total: 8,
    },
  });
  assert.equal(events[events.indexOf(save) + 1].reason, "concentration-broken");
  assert.equal(pc(state).effects, undefined);
  // A success keeps it: 12 + 2 + 1 = 15.
  const kept = goblinFirst(
    caster,
    goblin(),
    [20, 12],
    [6, 4],
    [20, 12],
    [4, 1],
  );
  assert.deepEqual(pc(kept.state).effects, [effect("bless")]);
  // An effect without concentration needs no save.
  const armoured = goblinFirst(
    sage({ effects: [effect("mage-armor")] }),
    goblin(),
    [20, 13],
    [6, 4],
  );
  assert.ok(!types(armoured.events).includes("concentration"));
});

test("an incapacitating condition ends concentration", () => {
  const paralysing = goblin("ghoul", {
    attack: {
      name: "Claws",
      bonus: 4,
      damage: { dice: 1, sides: 4, modifier: 0, type: "slashing" },
      criticalRange: 20,
      rider: { condition: { kind: "paralysed", turns: 1 } },
    },
  });
  // A 1 of damage: the save, 15 + 2 + 2, keeps Bless; then paralysis ends it.
  const { state, events } = goblinFirst(
    sage({ effects: [effect("bless")] }),
    paralysing,
    [20, 12],
    [4, 1],
    [20, 15],
    [4, 2],
  );
  const ended = events.find(({ type }) => type === "effect-ended");
  assert.equal(ended.reason, "incapacitated");
  assert.equal(pc(state).effects, undefined);
});

test("effects lasting a fight end with it; longer ones outlast it", () => {
  const state = opening(
    sage({
      effects: [effect("bless"), effect("mage-armor")],
      slots: [{ uses: 2, max: 2 }],
    }),
    goblin("goblin", { hp: 3 }),
  );
  const { state: won, events } = accepted(
    state,
    cast("magic-missile", "goblin"),
    dice([4, 1], [4, 1], [4, 1]),
  );
  assert.equal(won.outcome, "victory");
  const ended = events.filter(({ type }) => type === "effect-ended");
  assert.deepEqual(
    ended.map(({ spell, reason }) => [spell, reason]),
    [["Bless", "fight-over"]],
  );
  assert.deepEqual(pc(won).effects, [effect("mage-armor")]);
  assert.equal(events.at(-1).type, "ended");
});

test("Shield is offered on a hit, with a reaction and a slot, and can turn it into a miss", () => {
  const caster = sage({ spells: ["fire-bolt", "shield"] });
  // The goblin's 11 + 4 = 15 hits AC 11: the hit waits for Sage's answer.
  const { state, events } = goblinFirst(caster, goblin(), [20, 11]);
  assert.deepEqual(events.at(-1), {
    type: "reaction-offered",
    reactions: ["Shield"],
    combatantId: "pc",
    attackerId: "goblin",
    weapon: "Scimitar",
    d20: 11,
    bonus: 4,
    total: 15,
    armorClass: 11,
    critical: false,
  });
  assert.deepEqual(availableActions(state, "pc"), ["cast", "take-hit"]);
  // Only a reaction spell, on Sage, answers it.
  assert.equal(
    refused(state, cantrip("fire-bolt"), "reaction-pending"),
    "Fire Bolt isn't cast as a reaction: answer the hit with a reaction, or take it.",
  );
  assert.equal(
    refused(state, { type: "end-turn", actorId: "pc" }, "reaction-pending"),
    "Goblin Warrior's scimitar has hit Sage: first cast Shield, or take the hit.",
  );
  refused(state, { type: "uncanny-dodge", actorId: "pc" }, "no-uncanny-dodge");
  // Shield: 15 no longer meets AC 16.
  const { state: shielded, events: answered } = accepted(state, cast("shield"));
  assert.deepEqual(types(answered).slice(0, 4), [
    "cast",
    "effect",
    "attack",
    "turn",
  ]);
  const miss = answered[2];
  assert.equal(miss.hit, false);
  assert.equal(miss.armorClass, 16);
  assert.equal(miss.resumed, true);
  assert.equal(pc(shielded).hp, 9);
  assert.deepEqual(pc(shielded).spellcasting.slots, [{ uses: 1, max: 2 }]);
  // Its slot isn't the turn's one; Shield ends as Sage's turn starts.
  assert.equal(shielded.economy.slotSpent, false);
  assert.deepEqual(
    answered
      .filter(({ type }) => type === "effect-ended")
      .map(({ spell, reason }) => [spell, reason]),
    [["Shield", "next-turn"]],
  );
  assert.equal(pc(shielded).effects, undefined);
  // Out of the trigger, Shield can't be cast.
  refused(shielded, cast("shield"), "reaction-spell");
});

test("a hit Shield can't turn still lands, and a natural 20 always does", () => {
  const caster = sage({ spells: ["shield"] });
  // 19 + 4 = 23 still meets AC 16.
  const high = goblinFirst(caster, goblin(), [20, 19]);
  const { state, events } = accepted(high.state, cast("shield"), dice([6, 3]));
  const hit = events.find(({ type }) => type === "attack");
  assert.equal(hit.hit, true);
  assert.equal(hit.damage, 5);
  assert.equal(pc(state).hp, 4);
  // A natural 20 is a critical hit whatever the AC.
  const natural = goblinFirst(caster, goblin(), [20, 20]);
  const crit = accepted(natural.state, cast("shield"), dice([6, 1], [6, 1]));
  assert.equal(
    crit.events.find(({ type }) => type === "attack").critical,
    true,
  );
});

test("Shield isn't offered without a slot or a reaction", () => {
  // No slot left: the hit lands at once.
  const spent = goblinFirst(
    sage({ spells: ["shield"], slots: [{ uses: 0, max: 2 }] }),
    goblin(),
    [20, 12],
    [6, 4],
  );
  assert.ok(!types(spent.events).includes("reaction-offered"));
  assert.equal(pc(spent.state).hp, 3);
  // Two attacks: Shield answers the first; the reaction is spent, so the
  // second, 14 + 4 = 18 against AC 16, lands without an offer.
  const twice = goblin("goblin", {
    multiattack: {
      attacks: 2,
      weapons: [goblin().attack],
    },
  });
  const { state } = goblinFirst(sage({ spells: ["shield"] }), twice, [20, 11]);
  const { events } = accepted(state, cast("shield"), dice([20, 14], [6, 4]));
  assert.deepEqual(
    types(events).filter((type) => type !== "turn"),
    ["cast", "effect", "attack", "attack", "effect-ended"],
  );
  assert.equal(events[3].hit, true);
  assert.equal(events[3].armorClass, 16);
});

test("outside a fight: a buff that outlasts one, but not one that doesn't", () => {
  const caster = sage({ effects: [effect("bless")] });
  const armour = castOutsideFight(caster, cast("mage-armor"), dice());
  assert.deepEqual(armour.caster.effects, [
    effect("bless"),
    effect("mage-armor"),
  ]);
  assert.deepEqual(castOutsideFight(sage(), cast("bless"), dice()).rejection, {
    code: "fight-only",
    reason: "Bless lasts no longer than a fight: cast it in one.",
  });
  assert.equal(
    castOutsideFight(sage({ spells: ["shield"] }), cast("shield"), dice())
      .rejection.code,
    "reaction-spell",
  );
});
