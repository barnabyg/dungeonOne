// #291: the light crossbow's Loading (SRD 5.2), deferred from #287. A
// Loading weapon fires once per action, whatever the number of attacks the
// action allows, so Extra Attack gives a level-5 crossbowman no second shot;
// Action Surge's action fires once more.
import assert from "node:assert/strict";
import test from "node:test";
import { act, availableActions, startEncounter } from "../dist/encounter-5e.js";
import { validateFighter } from "../dist/fighter-5e.js";
import { playerCombatant } from "../dist/runtime-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";

const crossbow = {
  name: "Light crossbow",
  bonus: 6,
  damage: { dice: 1, sides: 8, modifier: 2, type: "piercing" },
  criticalRange: 19,
  ammunition: "bolts",
  loading: true,
};
/** A level-5 Fighter with a light crossbow, hurt so that Second Wind keeps its turn open. */
const crossbowman = (overrides = {}) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 30,
  maxHp: 44,
  dexterity: 14,
  initiativeBonus: 2,
  attack: crossbow,
  attacksPerAction: 2,
  ammunition: { arrows: 0, bolts: 20 },
  secondWind: {
    uses: 3,
    max: 3,
    healing: { dice: 1, sides: 10, modifier: 5 },
  },
  actionSurge: { uses: 1, max: 1 },
  ...overrides,
});
const goblin = (id) => ({
  id,
  name: id === "a" ? "Goblin A" : "Goblin B",
  side: "opponents",
  armorClass: 15,
  hp: 10,
  maxHp: 10,
  dexterity: 15,
  initiativeBonus: 2,
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
});
const crossbowFirst = (overrides = {}) =>
  startEncounter(
    [crossbowman(overrides), goblin("a"), goblin("b")],
    dice([20, 15], [20, 3], [20, 2]),
  ).state;
const shoot = (state, targetId, random) =>
  act(state, { type: "attack", actorId: "pc", targetId }, random);

test("Loading: Extra Attack gives a crossbow no second shot; the attempt draws no dice", () => {
  const state = crossbowFirst();
  const shot = shoot(state, "a", dice([20, 2]));
  assert.equal(shot.state.economy.actions, 0);
  assert.equal(shot.state.economy.attacks, 0);
  assert.equal(shot.state.combatants[0].ammunition.bolts, 19);
  assert.ok(!availableActions(shot.state, "pc").includes("attack"));
  const none = dice();
  assert.deepEqual(shoot(shot.state, "b", none), {
    state: shot.state,
    rejection: {
      code: "action-used",
      reason:
        "The Light crossbow fires once an action (Loading): you have already shot with this action.",
    },
  });
  assert.deepEqual(none.drawn, []);
});

test("Loading with Action Surge: one more shot, then none", () => {
  let state = crossbowFirst();
  state = shoot(state, "a", dice([20, 2])).state;
  state = act(state, { type: "action-surge", actorId: "pc" }, dice()).state;
  assert.equal(state.economy.actions, 1);
  state = shoot(state, "b", dice([20, 2])).state;
  assert.equal(state.economy.actions, 0);
  assert.equal(state.economy.attacks, 0);
  assert.equal(state.combatants[0].ammunition.bolts, 18);
  assert.ok(!availableActions(state, "pc").includes("attack"));
});

test("a weapon without Loading keeps Extra Attack's second attack", () => {
  const noLoading = { ...crossbow };
  delete noLoading.loading;
  const shot = shoot(crossbowFirst({ attack: noLoading }), "a", dice([20, 2]));
  assert.equal(shot.state.economy.attacks, 1);
});

test("a level-5 character wielding a light crossbow fights with a Loading weapon", () => {
  const level5 = testFighterAt(5);
  const sheet = validateFighter({
    ...level5,
    equipment: ["light-crossbow", "leather"],
    ammunition: { arrows: 0, bolts: 20 },
  });
  const combatant = playerCombatant(sheet);
  assert.equal(combatant.attacksPerAction, 2);
  assert.equal(combatant.attack.loading, true);
  assert.equal("loading" in playerCombatant(level5).attack, false);
});
