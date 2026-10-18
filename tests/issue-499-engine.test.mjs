// #499: Last Stand, a house rule. When an opponent's attack brings a party
// combatant to 0 HP while it carries a healing potion and its reaction is
// free, it makes a death saving throw (a d20, 11 or higher: an even chance). On a success
// the fight waits: it drinks a potion with its reaction and rises to the
// potion's roll, or falls; on a failure it falls. Combatants built by hand,
// scripted dice.
import assert from "node:assert/strict";
import test from "node:test";

import {
  act,
  availableActions,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const HEALING = {
  id: "healing",
  name: "Potion of Healing",
  healing: { dice: 2, sides: 4, modifier: 2 },
};
const GREATER = {
  id: "greater",
  name: "Potion of Greater Healing",
  healing: { dice: 4, sides: 4, modifier: 4 },
};

/** Ada at 3 of 7 HP, unarmoured (AC 12), with one Potion of Healing. */
const ada = (extra = {}) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 12,
  hp: 3,
  maxHp: 7,
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
  potions: [HEALING],
  attack: {
    name: "Quarterstaff",
    bonus: 1,
    damage: { dice: 1, sides: 6, modifier: -1, type: "bludgeoning" },
    criticalRange: 20,
  },
  ...extra,
});

const SCIMITAR = {
  name: "Scimitar",
  bonus: 4,
  damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
  criticalRange: 20,
};

const goblin = (extra = {}) => ({
  id: "goblin",
  name: "Goblin Warrior",
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
  attack: SCIMITAR,
  ...extra,
});

/**
 * A fight the goblin opens (its initiative 15, Ada's 3); `turn` is the
 * goblin's dice up to its pause or Ada's turn.
 */
function goblinFirst(character, foe, ...turn) {
  const random = dice([20, 3], [20, 15], ...turn);
  const result = startEncounter([character, foe], random);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
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
  assert.equal(result.state, state);
  return result.rejection.reason;
}

const pc = (state) => combatant(state, "pc");
const types = (events) => events.map(({ type }) => type);
const drink = (itemId = "healing") => ({
  type: "drink-potion",
  actorId: "pc",
  itemId,
});
const fall = { type: "fall", actorId: "pc" };

test("a hit to 0 HP waits for Last Stand, and the potion drunk with the reaction raises the character", () => {
  // 15 + 4 hits AC 12; 4 + 2 = 6 damage brings Ada from 3 to 0 HP, and her
  // death saving throw, 12, meets DC 11.
  const { state, events } = goblinFirst(
    ada(),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 12],
  );
  assert.deepEqual(types(events).slice(-2), ["attack", "last-stand"]);
  assert.equal(events.at(-2).hpAfter, 0);
  assert.deepEqual(events.at(-1), {
    type: "last-stand",
    combatantId: "pc",
    attackerId: "goblin",
    d20: 12,
    dc: 11,
    success: true,
    potions: ["Potion of Healing"],
  });
  assert.equal(state.outcome, "ongoing");
  assert.equal(pc(state).hp, 0);
  assert.deepEqual(state.pendingReaction, {
    kind: "last-stand",
    reactorId: "pc",
    attackerId: "goblin",
    progress: { made: 0, bonusAction: true, rampage: false },
  });
  assert.deepEqual(availableActions(state, "pc"), ["drink-potion", "fall"]);
  // Nothing else is accepted until it is answered.
  assert.equal(
    refused(state, { type: "end-turn", actorId: "pc" }, "reaction-pending"),
    "Goblin Warrior's attack has brought Ada to 0 HP: first drink a potion as a Last Stand, or fall.",
  );
  refused(state, { type: "take-hit", actorId: "pc" }, "reaction-pending");
  refused(state, drink("greater"), "no-potion");
  // 3 + 2 + 2 = 7: Ada rises to the potion's roll.
  const { state: risen, events: answered } = accepted(
    state,
    drink(),
    dice([4, 3], [4, 2]),
  );
  assert.deepEqual(answered[0], {
    type: "potion",
    combatantId: "pc",
    itemId: "healing",
    name: "Potion of Healing",
    rolls: [3, 2],
    modifier: 2,
    lastStand: true,
    healing: 7,
    hpAfter: 7,
    maxHp: 7,
  });
  assert.equal(risen.pendingReaction, undefined);
  assert.equal(pc(risen).hp, 7);
  assert.deepEqual(pc(risen).potions, []);
  // The goblin's turn ends and Ada's begins, with its reaction back and its
  // bonus action unspent.
  assert.equal(currentCombatant(risen).id, "pc");
  assert.ok(!risen.reacted.includes("pc"));
  assert.equal(risen.economy.bonusAction, true);
  assert.ok(!types(answered).includes("defeated"));
});

test("falling rather than drinking defeats the character", () => {
  const { state } = goblinFirst(ada(), goblin(), [20, 15], [6, 4], [20, 12]);
  const { state: fallen, events } = accepted(state, fall);
  assert.deepEqual(types(events), ["defeated", "ended"]);
  assert.equal(fallen.outcome, "defeat");
  assert.deepEqual(pc(fallen).potions, [HEALING]);
});

test("a failed death saving throw falls at once; 11 is enough", () => {
  const { state, events } = goblinFirst(
    ada(),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 10],
  );
  assert.deepEqual(types(events).slice(-4), [
    "attack",
    "last-stand",
    "defeated",
    "ended",
  ]);
  assert.deepEqual(
    [events.at(-3).d20, events.at(-3).dc, events.at(-3).success],
    [10, 11, false],
  );
  assert.equal(state.outcome, "defeat");
  assert.equal(state.pendingReaction, undefined);
  const eleven = goblinFirst(ada(), goblin(), [20, 15], [6, 4], [20, 11]);
  assert.equal(eleven.state.pendingReaction.kind, "last-stand");
});

test("without a potion, the character falls at once", () => {
  const { state, events } = goblinFirst(
    ada({ potions: [] }),
    goblin(),
    [20, 15],
    [6, 4],
  );
  assert.ok(!types(events).includes("last-stand"));
  assert.deepEqual(types(events).slice(-2), ["defeated", "ended"]);
  assert.equal(state.outcome, "defeat");
});

test("with both kinds of potion, the player picks which to drink", () => {
  const { state, events } = goblinFirst(
    ada({ maxHp: 20, potions: [HEALING, GREATER] }),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 12],
  );
  assert.deepEqual(events.at(-1).potions, [
    "Potion of Healing",
    "Potion of Greater Healing",
  ]);
  const { state: risen } = accepted(
    state,
    drink("greater"),
    dice([4, 4], [4, 3], [4, 2], [4, 1]),
  );
  assert.equal(pc(risen).hp, 14);
  assert.deepEqual(pc(risen).potions, [HEALING]);
});

test("a reaction spent on Shield leaves no Last Stand that round", () => {
  const shieldBearer = ada({
    spellcasting: {
      attackBonus: 5,
      saveDc: 13,
      modifier: 3,
      spells: [spellAtLevel(SPELLS.shield, 1)],
      slots: [{ uses: 2, max: 2 }],
    },
  });
  // 19 + 4 = 23 still meets AC 17 with Shield: the hit lands, and Ada falls.
  const { state } = goblinFirst(shieldBearer, goblin(), [20, 19]);
  const { state: fallen, events } = accepted(
    state,
    {
      type: "cast",
      actorId: "pc",
      spellId: "shield",
      targetIds: ["pc"],
      slotLevel: 1,
    },
    dice([6, 4]),
  );
  assert.ok(!types(events).includes("last-stand"));
  assert.equal(fallen.outcome, "defeat");
  // Taking the hit keeps the reaction, so Last Stand is offered after it.
  const again = goblinFirst(shieldBearer, goblin(), [20, 19]);
  const { state: offered, events: taken } = accepted(
    again.state,
    { type: "take-hit", actorId: "pc" },
    dice([6, 4], [20, 12]),
  );
  assert.equal(taken.at(-1).type, "last-stand");
  assert.equal(offered.pendingReaction.kind, "last-stand");
});

test("after Last Stand the attacker's other attacks follow, and a second fall can't be stood", () => {
  const twice = goblin({ multiattack: { attacks: 2, weapons: [SCIMITAR] } });
  const { state } = goblinFirst(ada(), twice, [20, 15], [6, 4], [20, 12]);
  // Ada rises to 4 HP (1 + 1 + 2); the second attack, 14 + 4, deals 6.
  const { state: fallen, events } = accepted(
    state,
    drink(),
    dice([4, 1], [4, 1], [20, 14], [6, 4]),
  );
  assert.deepEqual(types(events), ["potion", "attack", "defeated", "ended"]);
  assert.equal(events[0].hpAfter, 4);
  assert.equal(fallen.outcome, "defeat");
});

test("falling to 0 HP ends the character's concentration, even when it stands", () => {
  const bless = {
    spellId: "bless",
    spell: "Bless",
    casterId: "pc",
    buff: SPELLS.bless.effect.buff,
    ends: "fight",
    concentration: true,
  };
  const { state, events } = goblinFirst(
    ada({ effects: [bless] }),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 12],
  );
  assert.deepEqual(
    events
      .filter(({ type }) => type === "effect-ended")
      .map(({ spell, reason }) => [spell, reason]),
    [["Bless", "fell"]],
  );
  assert.equal(pc(state).effects, undefined);
});

test("falling is refused outside Last Stand", () => {
  const { state } = startEncounter([ada(), goblin()], dice([20, 15], [20, 3]));
  assert.equal(currentCombatant(state).id, "pc");
  assert.equal(
    refused(state, fall, "no-reaction-trigger"),
    "Falling answers Last Stand, and nothing has brought you to 0 HP.",
  );
  assert.ok(!availableActions(state, "pc").includes("fall"));
});
