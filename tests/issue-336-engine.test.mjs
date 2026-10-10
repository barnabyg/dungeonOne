// #336: the encounter engine's casting, on combatants built by hand. A spell
// is cast with the Magic action or a bonus action; a levelled spell spends a
// slot of its level or higher, and only one slot a turn (SRD 5.2). Effect
// kinds: a spell attack, a save for half or none, missiles that always hit,
// and healing. Damage types meet resistances, vulnerabilities and
// immunities, and radiant damage bypasses Undead Fortitude.
import assert from "node:assert/strict";
import test from "node:test";

import {
  act,
  availableActions,
  castOutsideFight,
  CLOSE_COMBAT,
  combatant,
  currentCombatant,
  savingThrow,
  startEncounter,
} from "../dist/encounter-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
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
 * Sage as a combatant: +5 spell attacks, DC 13, +3 to healing. Hurt and
 * carrying a potion, so its turn stays open after casting with its action.
 */
const sage = ({
  spells = ["fire-bolt", "sacred-flame", "magic-missile", "healing-word"],
  slots = [{ uses: 2, max: 2 }],
  level = 1,
  ...rest
} = {}) => ({
  id: "pc",
  name: "Sage",
  side: "party",
  armorClass: 12,
  hp: 6,
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
    spells: spells.map((id) =>
      typeof id === "string" ? spellAtLevel(SPELLS[id], level) : id,
    ),
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

/** A fight Sage opens: Sage's initiative 15, the others' 3. */
function opening(caster = sage(), ...foes) {
  const opponents = foes.length === 0 ? [goblin()] : foes;
  const random = dice([20, 15], ...opponents.map(() => [20, 3]));
  const { state } = startEncounter([caster, ...opponents], random);
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

const cast = (spellId, targetId = "goblin", slotLevel) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetId,
  ...(slotLevel === undefined ? {} : { slotLevel }),
});

const pc = (state) => combatant(state, "pc");

test("a spell attack rolls d20 + the spell attack bonus against AC", () => {
  const random = dice([20, 12], [10, 7]);
  const result = act(opening(), cast("fire-bolt"), random);
  assert.equal(result.rejection, undefined);
  const [casting, attack] = result.events;
  assert.deepEqual(casting, {
    type: "cast",
    combatantId: "pc",
    spellId: "fire-bolt",
    spell: "Fire Bolt",
    level: 0,
    castingTime: "action",
    targetId: "goblin",
  });
  assert.equal(attack.type, "attack");
  assert.equal(attack.spell, true);
  assert.equal(attack.weapon, "Fire Bolt");
  assert.deepEqual([attack.d20, attack.bonus, attack.total], [12, 5, 17]);
  assert.deepEqual(
    [attack.damageRolls, attack.damage, attack.damageType, attack.hpAfter],
    [[7], 7, "fire", 3],
  );
  // The cantrip took the action and no slot.
  assert.equal(result.state.economy.actions, 0);
  assert.equal(result.state.economy.slotSpent, false);
  assert.deepEqual(pc(result.state).spellcasting.slots, [{ uses: 2, max: 2 }]);
  assert.equal(random.remaining(), 0);
});

test("a critical spell attack doubles its dice; a natural 1 misses", () => {
  let result = act(
    opening(),
    cast("fire-bolt"),
    dice([20, 20], [10, 2], [10, 3]),
  );
  assert.equal(result.events[1].critical, true);
  assert.deepEqual(result.events[1].damageRolls, [2, 3]);
  result = act(opening(), cast("fire-bolt"), dice([20, 1]));
  assert.equal(result.events[1].hit, false);
  assert.equal(combatant(result.state, "goblin").hp, 10);
});

test("a ranged spell attack has disadvantage from round 2; a melee one doesn't (D6)", () => {
  const caster = sage({
    spells: ["fire-bolt", "shocking-grasp", "healing-word"],
  });
  const roundTwo = { ...opening(caster), round: 2 };
  let result = act(roundTwo, cast("fire-bolt"), dice([20, 18], [20, 4]));
  assert.deepEqual(result.events[1].mode.disadvantage, [CLOSE_COMBAT]);
  assert.equal(result.events[1].hit, false);
  result = act(roundTwo, cast("shocking-grasp"), dice([20, 18], [8, 5]));
  assert.equal(result.events[1].mode, undefined);
  assert.deepEqual(
    [result.events[1].damage, result.events[1].damageType],
    [5, "lightning"],
  );
  // Round 1 is the opening volley.
  result = act(opening(caster), cast("fire-bolt"), dice([20, 18], [10, 1]));
  assert.equal(result.events[1].mode, undefined);
});

test("a save spell: a failure takes the damage, a success half or none", () => {
  const caster = sage({ spells: ["sacred-flame", "inflict-wounds"] });
  // Sacred Flame: Dexterity save against DC 13; none on a success, and no
  // damage dice are rolled for it.
  let result = act(opening(caster), cast("sacred-flame"), dice([20, 11]));
  let [, saved] = result.events;
  assert.equal(saved.type, "spell-save");
  assert.deepEqual(saved.save, {
    ability: "dexterity",
    bonus: 2,
    dc: 13,
    d20: 11,
    total: 13,
    success: true,
  });
  assert.deepEqual([saved.damageRolls, saved.damage], [[], 0]);
  result = act(opening(caster), cast("sacred-flame"), dice([20, 10], [8, 6]));
  [, saved] = result.events;
  assert.deepEqual(
    [saved.save.success, saved.damage, saved.damageType, saved.hpAfter],
    [false, 6, "radiant", 4],
  );
  // Inflict Wounds: a Constitution save; half (rounded down) on a success.
  result = act(
    opening(caster),
    cast("inflict-wounds", "goblin", 1),
    dice([20, 15], [10, 4], [10, 3]),
  );
  [, saved] = result.events;
  assert.deepEqual(
    [saved.save.ability, saved.save.success, saved.damageRolls, saved.damage],
    ["constitution", true, [4, 3], 3],
  );
  assert.equal(combatant(result.state, "goblin").hp, 7);
});

test("a paralysed target fails a Dexterity save without a roll", () => {
  const caster = sage({ spells: ["sacred-flame"] });
  const state = opening(caster);
  const held = {
    ...state,
    conditions: [
      {
        kind: "paralysed",
        targetId: "goblin",
        sourceId: "pc",
        source: "test",
        turnsLeft: 1,
      },
    ],
  };
  const save = savingThrow(
    held,
    combatant(held, "goblin"),
    { ability: "dexterity", dc: 13 },
    dice(),
  );
  assert.deepEqual(save, {
    ability: "dexterity",
    bonus: 2,
    dc: 13,
    success: false,
    autoFail: "paralysed",
  });
  const result = act(held, cast("sacred-flame"), dice([8, 3]));
  assert.equal(result.events[1].save.autoFail, "paralysed");
  assert.equal(result.events[1].damage, 3);
});

test("Magic Missile always hits; each slot level above 1st adds a dart", () => {
  const caster = sage({
    slots: [
      { uses: 2, max: 2 },
      { uses: 1, max: 1 },
    ],
  });
  let result = act(
    opening(caster),
    cast("magic-missile", "goblin", 1),
    dice([4, 1], [4, 2], [4, 3]),
  );
  let [casting, missiles] = result.events;
  assert.deepEqual(casting.slot, { level: 1, left: 1, max: 2 });
  assert.deepEqual(
    [missiles.type, missiles.missiles, missiles.damageRolls],
    ["spell-damage", 3, [1, 2, 3]],
  );
  assert.deepEqual(
    [missiles.damageModifier, missiles.damage, missiles.damageType],
    [3, 9, "force"],
  );
  assert.deepEqual(pc(result.state).spellcasting.slots[0], {
    uses: 1,
    max: 2,
  });
  // Upcast with the 2nd-level slot: four darts, and that slot is spent.
  result = act(
    opening(caster),
    cast("magic-missile", "goblin", 2),
    dice([4, 1], [4, 1], [4, 1], [4, 1], [20, 10]),
  );
  [casting, missiles] = result.events;
  assert.deepEqual(casting.slot, { level: 2, left: 0, max: 1 });
  assert.equal(missiles.missiles, 4);
  // Eight damage leaves the goblin at 2; it then attacks Sage (the d20 10).
  assert.equal(combatant(result.state, "goblin").hp, 2);
  assert.deepEqual(pc(result.state).spellcasting.slots, [
    { uses: 2, max: 2 },
    { uses: 0, max: 1 },
  ]);
});

test("a healing spell heals its dice + the spellcasting modifier", () => {
  // Healing Word, a bonus action: 2d4 + 3, up to the maximum.
  let result = act(
    opening(),
    cast("healing-word", "pc", 1),
    dice([4, 1], [4, 2]),
  );
  const healed = result.events[1];
  assert.deepEqual(healed, {
    type: "spell-healing",
    combatantId: "pc",
    targetId: "pc",
    spell: "Healing Word",
    rolls: [1, 2],
    modifier: 3,
    healing: 4,
    hpAfter: 10,
    maxHp: 10,
  });
  assert.equal(pc(result.state).hp, 10);
  assert.equal(result.state.economy.bonusAction, false);
  assert.equal(result.state.economy.actions, 1);
  // Upcast with a 2nd-level slot: 4d4.
  const caster = sage({
    hp: 1,
    maxHp: 30,
    slots: [
      { uses: 1, max: 1 },
      { uses: 1, max: 1 },
    ],
  });
  result = act(
    opening(caster),
    cast("healing-word", "pc", 2),
    dice([4, 1], [4, 1], [4, 1], [4, 1]),
  );
  assert.deepEqual(
    [result.events[1].rolls.length, result.events[1].hpAfter],
    [4, 8],
  );
});

test("a levelled spell spends a slot, and only one slot a turn", () => {
  // Healing Word (bonus action) then Magic Missile (action): the second
  // slot is refused; a cantrip with the action is not.
  let state = act(
    opening(),
    cast("healing-word", "pc", 1),
    dice([4, 1], [4, 1]),
  ).state;
  assert.equal(state.economy.slotSpent, true);
  const refused = act(state, cast("magic-missile", "goblin", 1), dice());
  assert.equal(refused.rejection.code, "slot-spent");
  assert.equal(
    refused.rejection.reason,
    "You have already spent a spell slot this turn: only one a turn, so only a cantrip now.",
  );
  assert.equal(refused.state, state);
  // Fire Bolt misses, and with nothing left the goblin's turn comes (a 1).
  assert.equal(
    act(state, cast("fire-bolt"), dice([20, 2], [20, 1])).rejection,
    undefined,
  );
  // Magic Missile first, then Healing Word: also one slot a turn.
  state = act(
    opening(),
    cast("magic-missile", "goblin", 1),
    dice([4, 1], [4, 1], [4, 1]),
  ).state;
  assert.equal(
    act(state, cast("healing-word", "pc", 1), dice()).rejection.code,
    "slot-spent",
  );
  // A new turn may spend a slot again.
  assert.equal(
    act(
      { ...state, economy: { ...state.economy, slotSpent: false } },
      cast("healing-word", "pc", 1),
      // Then the turn ends: the goblin misses with a 1.
      dice([4, 1], [4, 1], [20, 1]),
    ).rejection,
    undefined,
  );
});

test("casting refuses what the caster can't do, drawing no dice", () => {
  const caster = sage({
    spells: [
      "fire-bolt",
      "magic-missile",
      "cure-wounds",
      // A reaction spell: none ships yet (#337), so this one is made up.
      {
        ...SPELLS["magic-missile"],
        id: "test-reaction",
        name: "Test Reaction",
        castingTime: "reaction",
      },
    ],
    slots: [{ uses: 0, max: 2 }],
  });
  const state = opening(caster);
  const cases = [
    [
      cast("wish"),
      "unknown-spell",
      "You don't know that spell, or haven't prepared it.",
    ],
    [
      cast("test-reaction", "goblin", 1),
      "reaction-spell",
      "Test Reaction is cast as a reaction, when its trigger comes; nothing triggers it now.",
    ],
    [
      cast("fire-bolt", "goblin", 1),
      "slot-level",
      "Fire Bolt is a cantrip: it spends no spell slot.",
    ],
    [
      cast("magic-missile"),
      "slot-level",
      "Magic Missile needs a spell slot of 1st level or higher.",
    ],
    [
      cast("magic-missile", "goblin", 0),
      "slot-level",
      "Magic Missile needs a spell slot of 1st level or higher.",
    ],
    [
      cast("magic-missile", "goblin", 1.5),
      "slot-level",
      "Magic Missile needs a spell slot of 1st level or higher.",
    ],
    [
      cast("magic-missile", "goblin", 1),
      "no-slot",
      "You have no 1st-level spell slots left.",
    ],
    [
      cast("magic-missile", "goblin", 2),
      "no-slot",
      "You have no 2nd-level spell slots.",
    ],
    [cast("fire-bolt", "pc"), "same-side", "Sage is on your side."],
    [
      cast("fire-bolt", "nobody"),
      "no-target",
      "There is no such opponent here to attack.",
    ],
  ];
  for (const [action, code, reason] of cases) {
    const result = act(state, action, dice());
    assert.deepEqual(result.rejection, { code, reason }, action.spellId);
    assert.equal(result.state, state);
  }
  // A healing spell heals the caster or an ally, never a foe, and not at
  // full health.
  const healer = sage({ spells: ["cure-wounds"], hp: 10 });
  const full = opening(healer);
  assert.deepEqual(
    act(full, cast("cure-wounds", "goblin", 1), dice()).rejection,
    {
      code: "healing-target",
      reason: "Cure Wounds heals you or an ally, not Goblin Warrior.",
    },
  );
  assert.deepEqual(act(full, cast("cure-wounds", "pc", 1), dice()).rejection, {
    code: "full-hp",
    reason: "You are unhurt, so Cure Wounds would heal nothing.",
  });
  // No spellcasting at all.
  const fighter = { ...sage(), spellcasting: undefined };
  assert.equal(
    act(opening(fighter), cast("fire-bolt"), dice()).rejection.code,
    "no-spellcasting",
  );
  // The action already spent: an action spell is refused; a bonus-action
  // spell already cast leaves Healing Word refused too.
  const acted = act(opening(), cast("fire-bolt"), dice([20, 2])).state;
  assert.deepEqual(
    act(acted, cast("magic-missile", "goblin", 1), dice()).rejection,
    {
      code: "action-used",
      reason: "You have already used your action this turn.",
    },
  );
});

test("cast is offered only while some spell can be cast; then the turn ends", () => {
  assert.ok(availableActions(opening(), "pc").includes("cast"));
  // Unhurt, with no slots, no cantrips: nothing to cast.
  const spent = sage({
    spells: ["magic-missile", "cure-wounds"],
    slots: [{ uses: 0, max: 2 }],
  });
  assert.ok(!availableActions(opening(spent), "pc").includes("cast"));
  // Magic Missile spends the action and the turn's slot; unhurt, Healing
  // Word has nothing to heal: the turn ends by itself and the goblin
  // attacks (d20 2: a miss).
  const caster = sage({ spells: ["magic-missile", "healing-word"], hp: 10 });
  const result = act(
    opening(caster),
    cast("magic-missile", "goblin", 1),
    dice([4, 1], [4, 1], [4, 1], [20, 2]),
  );
  assert.deepEqual(
    result.events.slice(-2).map(({ type }) => type),
    ["attack", "turn"],
  );
  assert.equal(currentCombatant(result.state).id, "pc");
  assert.equal(result.state.round, 2);
});

test("spell damage meets resistance, vulnerability and immunity", () => {
  const caster = sage({ spells: ["fire-bolt", "magic-missile"] });
  const hit = (foe, random, action = cast("fire-bolt")) =>
    act(opening(caster, foe), action, random).events[1];
  let attack = hit(
    goblin("goblin", { resistances: ["fire"] }),
    dice([20, 15], [10, 9]),
  );
  assert.deepEqual(
    [attack.damage, attack.damageAdjustment],
    [4, { by: "resistance", rolled: 9 }],
  );
  attack = hit(
    goblin("goblin", { vulnerabilities: ["fire"] }),
    dice([20, 15], [10, 4]),
  );
  assert.deepEqual([attack.damage, attack.hpAfter], [8, 2]);
  const missiles = hit(
    goblin("goblin", { immunities: ["force"] }),
    dice([4, 4], [4, 4], [4, 4]),
    cast("magic-missile", "goblin", 1),
  );
  assert.deepEqual(
    [missiles.damage, missiles.damageAdjustment, missiles.hpAfter],
    [0, { by: "immunity", rolled: 15 }, 10],
  );
});

test("radiant damage bypasses Undead Fortitude; necrotic damage doesn't", () => {
  const zombie = goblin("zombie", {
    name: "Zombie",
    hp: 4,
    maxHp: 22,
    undeadFortitude: true,
    saves: { ...goblin().saves, constitution: 3 },
  });
  const caster = sage({ spells: ["sacred-flame", "inflict-wounds"] });
  // Sacred Flame: radiant, so the zombie stays down.
  let result = act(
    opening(caster, zombie),
    cast("sacred-flame", "zombie"),
    dice([20, 2], [8, 6]),
  );
  assert.deepEqual(
    result.events.slice(1).map(({ type }) => type),
    ["spell-save", "defeated", "ended"],
  );
  assert.equal(result.state.outcome, "victory");
  // Inflict Wounds: necrotic, so a Constitution save against DC 5 + 9
  // leaves it at 1 HP.
  result = act(
    opening(caster, zombie),
    cast("inflict-wounds", "zombie", 1),
    dice([20, 2], [10, 5], [10, 4], [20, 11]),
  );
  const [, , fortitude] = result.events;
  assert.deepEqual(
    [fortitude.type, fortitude.dc, fortitude.success, fortitude.hpAfter],
    ["undead-fortitude", 14, true, 1],
  );
  assert.equal(combatant(result.state, "zombie").hp, 1);
  // A critical spell attack bypasses it too, as a weapon's does.
  const bolt = sage({ spells: ["fire-bolt"] });
  result = act(
    opening(bolt, zombie),
    cast("fire-bolt", "zombie"),
    dice([20, 20], [10, 1], [10, 3]),
  );
  assert.equal(result.state.outcome, "victory");
});

test("a dropped foe from a spell checks its side's morale", () => {
  const caster = sage({ spells: ["magic-missile", "fire-bolt"] });
  const first = goblin("first", { hp: 3, morale: 10 });
  const second = goblin("second", { morale: 10, initiativeBonus: 1 });
  const random = dice([20, 15], [20, 3], [20, 3]);
  const { state } = startEncounter([caster, first, second], random);
  const result = act(
    state,
    cast("magic-missile", "first", 1),
    dice([4, 1], [4, 1], [4, 1], [20, 1]),
  );
  assert.deepEqual(
    result.events.slice(2, 4).map(({ type }) => type),
    ["defeated", "morale"],
  );
  assert.ok(result.state.engaged.includes("first"));
});

test("outside a fight, only a healing spell, on the caster", () => {
  const caster = sage({ spells: ["fire-bolt", "cure-wounds"] });
  const healed = castOutsideFight(
    caster,
    cast("cure-wounds", "pc", 1),
    dice([8, 2], [8, 3]),
  );
  assert.equal(healed.rejection, undefined);
  assert.deepEqual(healed.caster.hp, 10);
  assert.deepEqual(healed.caster.spellcasting.slots, [{ uses: 1, max: 2 }]);
  assert.deepEqual(
    healed.events.map(({ type }) => type),
    ["cast", "spell-healing"],
  );
  assert.deepEqual(
    castOutsideFight(caster, cast("fire-bolt"), dice()).rejection,
    {
      code: "fight-only",
      reason: "Fire Bolt is cast in a fight: outside one, only healing spells.",
    },
  );
  assert.equal(
    castOutsideFight(
      { ...caster, hp: 10 },
      cast("cure-wounds", "pc", 1),
      dice(),
    ).rejection.code,
    "full-hp",
  );
});
