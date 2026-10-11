// #369: Sleep and Hold Person return to the class lists. Owner's house rule
// (11 October 2026): Sleep's target rolls both its saves with advantage, an
// alert foe in a fight resisting it, so one Sleep at a fight's opening
// keeps a foe out for three turns only if four d20s fail (`controlChance`,
// tests/issue-348-harness.test.mjs). Hold Person is as
// written. Sleep is back on the Wizard's list, Hold Person on the Wizard's
// and the Cleric's.
import assert from "node:assert/strict";
import test from "node:test";

import { CLASSES } from "../dist/character-5e.js";
import { act, currentCombatant, startEncounter } from "../dist/encounter-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const caster = {
  id: "pc",
  name: "Vela",
  side: "party",
  armorClass: 12,
  // A scratch and a potion keep her turn open after she casts.
  hp: 9,
  maxHp: 10,
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
    strength: -2,
    dexterity: 2,
    constitution: 1,
    intelligence: 5,
    wisdom: 1,
    charisma: -2,
  },
  attack: {
    name: "Dagger",
    bonus: 4,
    damage: { dice: 1, sides: 4, modifier: 2, type: "piercing" },
    criticalRange: 20,
  },
  spellcasting: {
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: ["sleep", "hold-person"].map((id) =>
      spellAtLevel(SPELLS[id], SPELLS[id].level),
    ),
    slots: [
      { uses: 2, max: 2 },
      { uses: 1, max: 1 },
    ],
  },
};

const bandit = {
  id: "bandit",
  name: "Bandit",
  side: "opponents",
  creatureType: "humanoid",
  armorClass: 12,
  hp: 30,
  maxHp: 30,
  dexterity: 12,
  initiativeBonus: 1,
  saves: {
    strength: 0,
    dexterity: 1,
    constitution: 1,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  },
  attack: {
    name: "Scimitar",
    bonus: 3,
    damage: { dice: 1, sides: 6, modifier: 1, type: "slashing" },
    criticalRange: 20,
  },
};

/** A fight Vela opens: her initiative 15, the bandit's 3. */
function opening() {
  const { state } = startEncounter([caster, bandit], dice([20, 13], [20, 2]));
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

function accepted(state, action, random) {
  const result = act(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const cast = (spellId, slotLevel) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: ["bandit"],
  slotLevel,
});
const endTurn = { type: "end-turn", actorId: "pc" };

test("Sleep's target rolls its first save and its repeat with advantage (#369)", () => {
  // 4 and 12, keeping 12: 12 + 0 against DC 13, still a failure.
  const slept = accepted(opening(), cast("sleep", 1), dice([20, 4], [20, 12]));
  const { save } = slept.events.find(({ type }) => type === "spell-condition");
  assert.equal(save.success, false);
  assert.equal(save.d20, 12);
  assert.deepEqual(save.mode, {
    d20s: [4, 12],
    advantage: ["Sleep"],
    disadvantage: [],
  });
  // At the end of its turn it saves again, with advantage: 3 and 9, a
  // failure, and it falls unconscious.
  const asleep = accepted(slept.state, endTurn, dice([20, 3], [20, 9]));
  const repeat = asleep.events.find(({ type }) => type === "save");
  assert.deepEqual(repeat.mode.advantage, ["Sleep"]);
  assert.equal(repeat.success, false);
  assert.ok(
    asleep.state.conditions.some(
      ({ targetId, kind }) => targetId === "bandit" && kind === "unconscious",
    ),
  );
});

test("Sleep: the higher d20 saves the target (#369)", () => {
  const shaken = accepted(opening(), cast("sleep", 1), dice([20, 2], [20, 13]));
  const { success } = shaken.events.find(
    ({ type }) => type === "spell-condition",
  );
  assert.equal(success, true);
  assert.deepEqual(shaken.state.conditions, []);
});

test("Hold Person's saves are rolled plainly (#369)", () => {
  const held = accepted(opening(), cast("hold-person", 2), dice([20, 5]));
  const { save } = held.events.find(({ type }) => type === "spell-condition");
  assert.equal(save.success, false);
  assert.equal(save.mode, undefined);
});

test("Sleep is back on the Wizard's list, Hold Person on the Wizard's and the Cleric's (#369)", () => {
  const { wizard, cleric } = CLASSES;
  assert.ok(wizard.spellcasting.list.includes("sleep"));
  assert.ok(wizard.spellcasting.list.includes("hold-person"));
  assert.ok(cleric.spellcasting.list.includes("hold-person"));
  assert.ok(!cleric.spellcasting.list.includes("sleep"));
});
