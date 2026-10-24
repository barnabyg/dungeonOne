// #342: a level-5 Life Cleric in the runtime. Sear Undead's roll and burns
// in the card and its dice; Bestow Curse offered once for each curse, and
// the AI DM's cast tool taking the curse; Spirit Guardians striking at the
// end of the foes' turns; Protection from Evil and Good (#555) cast
// outside a fight and warding against the undead in it.
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLevelChoice,
  buildCharacter,
  defaultPlacement,
  prepareSpells,
  settleCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { currentCombatant } from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

// Kept totals 15, 14, 13, 12, 10, 8: Wisdom 17, Constitution 15.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const earn = (sheet, xp, id) =>
  settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: sheet.stowed,
      ammunition: sheet.ammunition,
      treasure: [],
      purse: 0,
      magicItems: [],
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });
/**
 * Mira, a level-5 Life Cleric: Wisdom 18 (+4, spell save DC 15, Sear
 * Undead 4d8), 43 HP, and the 3rd-level spells prepared.
 */
const MIRA = (() => {
  let sheet = buildCharacter(
    "d".repeat(32),
    "Mira",
    DICE,
    { ...CLERIC.defaults, placement: defaultPlacement(DICE, CLERIC) },
    "cleric",
  );
  sheet = withOwedChoices(earn(sheet, 300, "cellar"));
  sheet = withOwedChoices(earn(sheet, 600, "barrow"));
  sheet = applyLevelChoice(earn(sheet, 1800, "crypt"), {
    increase: { wisdom: 1, constitution: 1 },
  });
  sheet = withOwedChoices(earn(withOwedChoices(sheet), 3800, "tomb"));
  return prepareSpells(sheet, [
    "guiding-bolt",
    "healing-word",
    "shield-of-faith",
    "spiritual-weapon",
    "prayer-of-healing",
    "spirit-guardians",
    "protection-from-evil-and-good",
    "bestow-curse",
    "hold-person",
  ]);
})();

/** The rat tunnels with the cellar's rat swapped for `opponents`. */
const tunnels = (opponents) => {
  const module = moduleFile("rat-tunnels");
  module.id = "turning-crypt";
  module.recommendedLevels = { min: 1, max: 5 };
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = opponents;
  return validateModule(module);
};
const crypt = tunnels([
  { id: "skeleton", monster: "skeleton", description: "A skeleton." },
  { id: "zombie", monster: "zombie", description: "A shambling zombie." },
]);
const den = tunnels([
  { id: "bandit", monster: "bandit", description: "A bandit." },
]);

/** The fight in the cellar, Mira first: initiative 20, then the foes' 1s. */
function cellarFight(runtime, foes, state = runtime.createSession()) {
  const result = runtime.handleAction(
    state,
    { type: "move", destinationId: "rat-cellar" },
    uncheckedDice(20, ...Array.from({ length: foes }, () => 1)),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(currentCombatant(result.state.encounter).id, "pc");
  return result.state;
}

/** An accepted action, its card's lines checked against the dice drawn. */
function accepted(runtime, state, action, ...rolls) {
  const random = uncheckedDice(...rolls);
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return {
    ...result,
    lines: describeFifthResult(result, random.drawn, "Mira"),
  };
}

const offered = (runtime, state, kind) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === kind && available);

test("Sear Undead: the card shows its one roll and each undead it burns", () => {
  const runtime = createFifthRuntime(crypt, MIRA);
  const state = cellarFight(runtime, 2);
  // 4d8 = 8, then both fail their saves.
  const turned = accepted(
    runtime,
    state,
    { type: "turn-undead", actorId: "pc" },
    2,
    2,
    2,
    2,
    1,
    1,
  );
  const text = renderFifthResult(turned);
  assert.match(
    text,
    /Turn Undead reaches Skeleton and Zombie\. Sear Undead: 2 \+ 2 \+ 2 \+ 2 = 8 radiant to each that fails its save\./u,
  );
  assert.match(
    text,
    /Sear Undead burns Skeleton for 8 radiant; Skeleton has 5\/13 HP\./u,
  );
  assert.match(
    text,
    /Sear Undead burns Zombie for 8 radiant; Zombie has 7\/15 HP\./u,
  );
  const sear = turned.lines
    .flatMap(({ rolls }) => rolls)
    .find(({ label }) => label === "Sear Undead");
  assert.deepEqual(
    sear.dice.map(({ value }) => value),
    [2, 2, 2, 2],
  );
});

test("Bestow Curse is offered once for each curse, and the AI DM names the curse", () => {
  const runtime = createFifthRuntime(den, MIRA);
  const state = cellarFight(runtime, 1);
  const curses = offered(runtime, state, "cast").filter(
    ({ spell }) => spell.id === "bestow-curse",
  );
  assert.deepEqual(
    curses.map(({ spell }) => [spell.curse, spell.curseName]),
    [
      ["attacks", "disadvantage on its attacks against you"],
      ["necrotic", "extra necrotic damage from your attacks and spells"],
    ],
  );
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "cast");
  assert.deepEqual(tool.parameters.properties.curse.enum, [
    "attacks",
    "necrotic",
    null,
  ]);
  assert.ok(tool.parameters.required.includes("curse"));
  assert.match(
    tool.description,
    /bestow-curse \(Bestow Curse: .*; curse attacks \(disadvantage on its attacks against you\) or necrotic \(extra necrotic damage from your attacks and spells\)\)/u,
  );
  const call = (args, ...rolls) =>
    runtime.dispatchGameTool(
      state,
      { id: "call-1", name: "cast", argumentsJson: JSON.stringify(args) },
      uncheckedDice(...rolls),
    );
  const base = { spell: "bestow-curse", slot_level: 3, targets: ["bandit"] };
  // The bandit fails its Wisdom save (2 against DC 15); with nothing left
  // to do, Mira's turn ends and the bandit misses (1).
  const cursed = call({ ...base, damage_type: null, curse: "necrotic" }, 2, 1);
  assert.equal(cursed.modelOutput.ok, true);
  assert.match(
    renderFifthResult({
      state: cursed.state,
      events: cursed.engineResult.events,
    }),
    /Bandit makes a Wisdom saving throw against Bestow Curse: 2 \+ 0 = 2 against DC 15\. Failure: cursed, extra necrotic damage from your attacks and spells\./u,
  );
  // A curse the spell doesn't lay is refused by the engine.
  const wrong = call({ ...base, damage_type: null, curse: "blindness" });
  assert.equal(wrong.modelOutput.ok, false);
  assert.match(
    wrong.modelOutput.error.rejection.reason,
    /Choose the curse Bestow Curse lays: attacks or necrotic\./u,
  );
  const typed = call({ ...base, damage_type: null, curse: 3 });
  assert.equal(typed.modelOutput.error.code, "invalid-arguments");
});

test("Spirit Guardians strike at the end of the bandit's turn, and the card shows each roll", () => {
  const runtime = createFifthRuntime(den, MIRA);
  const state = cellarFight(runtime, 1);
  const guardians = offered(runtime, state, "cast").find(
    ({ spell }) => spell.id === "spirit-guardians",
  );
  assert.equal(guardians.spell.maxTargets, 3);
  // 3d8 = 6 on casting; the bandit saves (20) and takes 3. With nothing
  // left to do, Mira's turn ends: the bandit misses (1), then fails its
  // save (1) as its turn ends, taking 3d8 = 9.
  const round = accepted(
    runtime,
    state,
    runtime.actionOf(guardians),
    2,
    2,
    2,
    20,
    1,
    1,
    3,
    3,
    3,
  );
  const text = renderFifthResult(round);
  assert.match(
    text,
    /Spirit Guardians: damage 2 \+ 2 \+ 2 = 6 radiant, and its target saves against it\./u,
  );
  assert.match(
    text,
    /Bandit makes a Wisdom saving throw against Spirit Guardians: 1 \+ 0 = 1 against DC 15\. Failure\. Damage 3 \+ 3 \+ 3 = 9 radiant; Bandit has 0\/11 HP\./u,
  );
  assert.equal(round.state.encounter.outcome, "victory");
});

test("Protection from Evil and Good (#555) is cast outside a fight and carried into the next", () => {
  const runtime = createFifthRuntime(crypt, MIRA);
  const state = runtime.createSession();
  const ward = offered(runtime, state, "cast").find(
    ({ spell }) => spell.id === "protection-from-evil-and-good",
  );
  const warded = accepted(runtime, state, runtime.actionOf(ward));
  assert.match(
    renderFifthResult(warded),
    /Protection from Evil and Good takes hold on you: warded: attack rolls against it by aberrations, celestials, elementals, fey, fiends and undead have disadvantage, until the next rest\. You concentrate on it\./u,
  );
  const opened = cellarFight(runtime, 2, warded.state);
  const pc = opened.encounter.combatants.find(({ id }) => id === "pc");
  assert.deepEqual(
    pc.effects.map(({ spellId }) => spellId),
    ["protection-from-evil-and-good"],
  );
});
