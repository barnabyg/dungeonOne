// #538: SRD 5.2's Pearl of Power, the second caster item (owner-approved
// 2026-10-23). A spellcaster attuned to it uses it outside a fight to regain
// its highest spent spell slot of 3rd level or lower, once per long rest.
// It is offered as an action, refused when spent, and the harness uses it
// as soon as a slot is spent outside a fight.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import {
  buildCharacter,
  defaultPlacement,
  validateCharacter,
} from "../dist/character-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { FIGHTER } from "../dist/fighter-5e.js";
import { CASTER_ITEMS, heldItemText } from "../dist/magic-items-5e.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { lintelBarrow, loneGoblin } from "./fixtures/modules.mjs";
import { pearlBarrow } from "./fixtures/war-mage-barrow.mjs";

const PEARL = { id: "a/pearl", casterItem: "pearl-of-power" };
const level3 = (definition, classId) => {
  const [weak] = percentileCharacters({ percentiles: [5], classId });
  return characterAtLevel(weak.dice, 3, undefined, false, undefined, classId);
};
const holding = (sheet, magicItems) =>
  validateCharacter({ ...sheet, magicItems });
const vela = holding(level3(WIZARD, "wizard"), [PEARL]);
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const ada = holding(
  buildCharacter(
    "a".repeat(32),
    "Ada",
    DICE,
    { ...FIGHTER.defaults, placement: defaultPlacement(DICE, FIGHTER) },
    "fighter",
  ),
  [PEARL],
);

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** In the barrow's mouth with `spent` slots spent at each level, 1st first. */
function spending(sheet, spent) {
  const runtime = createFifthRuntime(pearlBarrow, sheet);
  const { state } = accepted(runtime, runtime.createSession(), {
    type: "begin",
  });
  const uses = { ...state.character.featureUses };
  spent.forEach((count, index) => {
    uses[`spell-slots-${index + 1}`] -= count;
  });
  return {
    runtime,
    state: { ...state, character: { ...state.character, featureUses: uses } },
  };
}

const regainViews = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "regain-slot")
    .map(({ target, available, reason }) => [
      target.id,
      target.name,
      available ? null : reason,
    ]);

test("the catalogue: Pearl of Power is an uncommon wondrous item a spellcaster attunes, regaining a slot up to 3rd", () => {
  assert.deepEqual(CASTER_ITEMS["pearl-of-power"], {
    name: "Pearl of Power",
    category: "wondrous item",
    rarity: "uncommon",
    attunement: { by: "spellcaster" },
    regainsSlot: 3,
  });
  assert.equal(
    heldItemText(PEARL, { attuned: true }),
    "An uncommon wondrous item that requires attunement by a spellcaster: while attuned, use it outside a fight to regain one spent spell slot of 3rd level or lower, the highest spent; once per long rest. Attuned.",
  );
});

test("outside a fight a Wizard uses the pearl to regain its highest spent slot, once until a long rest", () => {
  const { runtime, state } = spending(vela, [1, 1]);
  assert.deepEqual(regainViews(runtime, state), [
    ["a/pearl", "Pearl of Power", null],
  ]);
  const used = accepted(runtime, state, {
    type: "use-item",
    itemId: "a/pearl",
  });
  assert.equal(used.state.character.featureUses["spell-slots-2"], 2);
  assert.equal(
    used.state.character.featureUses["spell-slots-1"],
    state.character.featureUses["spell-slots-1"],
  );
  assert.equal(
    renderFifthResult(used),
    "You use the Pearl of Power and regain a 2nd-level spell slot (2 of 2 left). It works again after a long rest.",
  );
  assert.deepEqual(used.state.pearlsUsed, ["a/pearl"]);
  // Spent: refused, and the bar says why.
  const again = runtime.handleAction(used.state, {
    type: "use-item",
    itemId: "a/pearl",
  });
  assert.equal(again.rejection.code, "pearl-used");
  assert.equal(
    again.rejection.reason,
    "The Pearl of Power's power is spent until your next long rest.",
  );
  assert.deepEqual(regainViews(runtime, used.state), [
    ["a/pearl", "Pearl of Power", "Used until long rest"],
  ]);
  // The AI DM's status says so too.
  assert.ok(
    runtime
      .projectCharacterStatus(used.state)
      .resources.includes(
        "Pearl of Power: used; it works again after a long rest",
      ),
  );
  // A long rest at the rest site makes it work again.
  const rested = accepted(
    runtime,
    used.state,
    { type: "long-rest" },
    { roll: () => 50 },
  );
  assert.deepEqual(rested.state.pearlsUsed, []);
});

test("the pearl is refused with nothing spent, in a fight, and for a Fighter who can't attune it", () => {
  const full = spending(vela, [0, 0]);
  const unspent = full.runtime.handleAction(full.state, {
    type: "use-item",
    itemId: "a/pearl",
  });
  assert.equal(unspent.rejection.code, "no-spent-slot");
  assert.equal(
    unspent.rejection.reason,
    "You have no spent spell slot of 3rd level or lower to regain.",
  );
  // In a fight.
  const runtime = createFifthRuntime(loneGoblin, vela);
  const fight = accepted(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    dice([20, 18], [20, 2]),
  ).state;
  const fighting = runtime.handleAction(fight, {
    type: "use-item",
    itemId: "a/pearl",
  });
  assert.equal(fighting.rejection.code, "fighting");
  // A Fighter holds it, but it does nothing.
  const fighter = createFifthRuntime(pearlBarrow, ada);
  const begun = accepted(fighter, fighter.createSession(), {
    type: "begin",
  }).state;
  const refused = fighter.handleAction(begun, {
    type: "use-item",
    itemId: "a/pearl",
  });
  assert.equal(refused.rejection.code, "not-attuned");
  assert.equal(
    refused.rejection.reason,
    "The Pearl of Power does nothing for you: a Fighter can't attune to it, as it requires attunement by a spellcaster.",
  );
  assert.deepEqual(regainViews(fighter, begun), [
    ["a/pearl", "Pearl of Power", "Not attuned"],
  ]);
});

test("the AI DM's use_item tool lists the pearl while it would work", () => {
  const { runtime, state } = spending(vela, [1, 0]);
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "use_item");
  assert.ok(tool.parameters.properties.item.enum.includes("a/pearl"));
  assert.match(tool.description, /use a Pearl of Power to regain/u);
});

test("the harness uses the pearl when a slot is spent outside a fight", () => {
  const cleric = holding(level3(CLERIC, "cleric"), [PEARL]);
  // The plain barrow, with no pearl of its own to find.
  const runtime = createFifthRuntime(lintelBarrow, cleric);
  const runs = Array.from({ length: 40 }, (_, seed) =>
    playAdventure(runtime, "cautious", seed),
  );
  const healed = runs.filter(({ healing }) => healing.spells > 0);
  assert.ok(healed.length > 0, "some run heals with a spell");
  assert.ok(
    runs.some(({ slotsRegained }) => slotsRegained === 1),
    "some run regains a slot with the pearl",
  );
  assert.ok(runs.every(({ slotsRegained }) => slotsRegained <= 1));
  // Without the pearl, none does.
  const plain = createFifthRuntime(lintelBarrow, level3(CLERIC, "cleric"));
  assert.ok(
    Array.from({ length: 10 }, (_, seed) =>
      playAdventure(plain, "cautious", seed),
    ).every(({ slotsRegained }) => slotsRegained === 0),
  );
});
