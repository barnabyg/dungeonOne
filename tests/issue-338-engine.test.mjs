// #338: area spells without positions, in the encounter engine. Each area
// spell declares its shape and size, and so the most opponents it catches
// (D4): a cone's length ÷ 10, a line's ÷ 30, a sphere's or emanation's
// radius ÷ 5, rounded up, at least 1. The caster chooses them, each once.
// The damage is rolled once; each target saves for itself and takes it, or
// half on a success, through its own resistances.
import assert from "node:assert/strict";
import test from "node:test";

import {
  act,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { maxTargets, SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

/**
 * Sage at level 5: DC 14, with 1st- to 3rd-level slots; hurt and carrying a
 * potion, so its turn stays open after casting with its action.
 */
const sage = () => ({
  id: "pc",
  name: "Sage",
  side: "party",
  armorClass: 12,
  hp: 9,
  maxHp: 10,
  dexterity: 13,
  initiativeBonus: 1,
  potions: [
    {
      id: "potion",
      name: "Potion of Healing",
      healing: { dice: 2, sides: 4, modifier: 2 },
    },
  ],
  saves: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 0,
    wisdom: 5,
    charisma: 2,
  },
  attack: {
    name: "Mace",
    bonus: 3,
    damage: { dice: 1, sides: 6, modifier: 1, type: "bludgeoning" },
    criticalRange: 20,
  },
  spellcasting: {
    attackBonus: 6,
    saveDc: 14,
    modifier: 3,
    spells: ["fire-bolt", "burning-hands", "shatter", "fireball"].map((id) =>
      spellAtLevel(SPELLS[id], 5),
    ),
    slots: [
      { uses: 4, max: 4 },
      { uses: 3, max: 3 },
      { uses: 2, max: 2 },
    ],
  },
});

/** A goblin with 20 HP, Dexterity save +2 and Constitution save +0. */
const goblin = (id, extra = {}) => ({
  id,
  name: id,
  side: "opponents",
  armorClass: 15,
  hp: 20,
  maxHp: 20,
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

/** A fight Sage opens against `foes`: Sage's initiative 20, theirs 3, 4… */
function opening(...foes) {
  const random = dice([20, 20], ...foes.map((_, index) => [20, 3 + index]));
  const { state } = startEncounter([sage(), ...foes], random);
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

const cast = (spellId, targetIds, slotLevel) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds,
  slotLevel,
});

function accepted(state, action, random) {
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

test("each area spell's most targets follows the D4 heuristic", () => {
  assert.deepEqual(
    ["burning-hands", "shatter", "fireball", "fire-bolt", "magic-missile"].map(
      (id) => maxTargets(SPELLS[id]),
    ),
    [2, 2, 4, 1, 1],
  );
  const sized = (shape, feet) => maxTargets({ area: { shape, feet } });
  // Cone length ÷ 10, line length ÷ 30, radius ÷ 5; rounded up; at least 1.
  assert.equal(sized("cone", 15), 2);
  assert.equal(sized("cone", 60), 6);
  assert.equal(sized("line", 60), 2);
  assert.equal(sized("line", 10), 1);
  assert.equal(sized("sphere", 5), 1);
  assert.equal(sized("emanation", 15), 3);
});

test("one damage roll; each target saves for itself, half on a success", () => {
  const state = opening(goblin("g1"), goblin("g2"));
  // 3d6 = 15 fire; g1's 5 + 2 = 7 fails DC 14, g2's 15 + 2 = 17 succeeds.
  const { state: after, events } = accepted(
    state,
    cast("burning-hands", ["g1", "g2"], 1),
    dice([6, 4], [6, 5], [6, 6], [20, 5], [20, 15]),
  );
  assert.deepEqual(
    events.slice(0, 4).map(({ type }) => type),
    ["cast", "spell-area", "spell-save", "spell-save"],
  );
  assert.deepEqual(events[0].targetIds, ["g1", "g2"]);
  assert.deepEqual(events[1], {
    type: "spell-area",
    actorId: "pc",
    spell: "Burning Hands",
    targetIds: ["g1", "g2"],
    damageRolls: [4, 5, 6],
    damageType: "fire",
  });
  const [first, second] = [events[2], events[3]];
  assert.equal(first.area, true);
  assert.equal(first.save.success, false);
  assert.equal(first.damage, 15);
  assert.equal(second.save.success, true);
  assert.equal(second.damage, 7);
  assert.equal(combatant(after, "g1").hp, 5);
  assert.equal(combatant(after, "g2").hp, 13);
  // One slot and the action spent.
  assert.deepEqual(combatant(after, "pc").spellcasting.slots[0], {
    uses: 3,
    max: 4,
  });
});

test("each target meets the damage with its own resistances", () => {
  const state = opening(
    goblin("resistant", { resistances: ["fire"] }),
    goblin("vulnerable", { vulnerabilities: ["fire"] }),
    goblin("immune", { immunities: ["fire"] }),
  );
  // Fireball at 3rd level: 8d6 = 16. All fail: 8, 32 (it falls), 0.
  const { state: after, events } = accepted(
    state,
    cast("fireball", ["resistant", "vulnerable", "immune"], 3),
    dice(...Array.from({ length: 8 }, () => [6, 2]), [20, 2], [20, 2], [20, 2]),
  );
  const saves = events.filter(({ type }) => type === "spell-save");
  assert.deepEqual(
    saves.map(({ targetId, damage, damageAdjustment }) => [
      targetId,
      damage,
      damageAdjustment?.by,
    ]),
    [
      ["resistant", 8, "resistance"],
      ["vulnerable", 32, "vulnerability"],
      ["immune", 0, "immunity"],
    ],
  );
  assert.equal(combatant(after, "vulnerable").hp, 0);
  assert.ok(
    events.some(
      ({ type, combatantId }) =>
        type === "defeated" && combatantId === "vulnerable",
    ),
  );
});

test("an area spell is refused more targets than its most, or one twice", () => {
  const state = opening(goblin("g1"), goblin("g2"), goblin("g3"));
  assert.equal(
    refused(
      state,
      cast("burning-hands", ["g1", "g2", "g3"], 1),
      "too-many-targets",
    ),
    "Burning Hands catches at most 2 opponents.",
  );
  assert.equal(
    refused(state, cast("burning-hands", ["g1", "g1"], 1), "duplicate-target"),
    "Burning Hands can't catch the same creature twice.",
  );
  assert.equal(
    refused(state, cast("fire-bolt", ["g1", "g2"]), "too-many-targets"),
    "Fire Bolt has one target.",
  );
  assert.equal(
    refused(state, cast("burning-hands", [], 1), "no-target"),
    "Name Burning Hands's target.",
  );
  // Every target must be a foe still fighting.
  refused(state, cast("burning-hands", ["g1", "pc"], 1), "same-side");
  // Fewer than its most is fine: Shatter at one goblin, upcast to 3rd: 4d8.
  const { events } = accepted(
    state,
    cast("shatter", ["g3"], 3),
    dice([8, 1], [8, 1], [8, 1], [8, 1], [20, 20]),
  );
  const [save] = events.filter(({ type }) => type === "spell-save");
  assert.deepEqual(save.damageRolls, [1, 1, 1, 1]);
  assert.equal(save.damage, 2);
});
