// #343: a level-3 Evoker in the runtime. Scorching Ray offered with its foes and its
// rays, and described to the AI DM; a
// missed Fire Bolt's half damage with Potent Cantrip; Mirror Image's d6s
// and Acid Arrow's later acid in the card and its dice.
import assert from "node:assert/strict";
import test from "node:test";

import {
  addToSpellbook,
  buildCharacter,
  defaultPlacement,
  prepareSpells,
  settleCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import { currentCombatant } from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

// Kept totals 15, 14, 13, 12, 10, 8: Intelligence 17, Dexterity 14.
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
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });

/**
 * Vela, a level-3 Evoker (spell attack +5, DC 13, 20 HP, AC 12) who wrote
 * `written` into her spellbook at level 3 and prepared them.
 */
const vela = (written) => {
  let sheet = buildCharacter(
    "e".repeat(32),
    "Vela",
    DICE,
    { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
    "wizard",
  );
  sheet = withOwedChoices(earn(sheet, 300, "cellar"));
  sheet = addToSpellbook(earn(sheet, 600, "barrow"), written);
  return prepareSpells(sheet, [
    "mage-armor",
    "magic-missile",
    "shield",
    "sleep",
    ...written,
  ]);
};

/** The rat tunnels with the cellar's rat swapped for `opponents`. */
const tunnels = (opponents) => {
  const module = moduleFile("rat-tunnels");
  module.id = "evokers-den";
  module.recommendedLevels = { min: 1, max: 5 };
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = opponents;
  return validateModule(module);
};
const den = tunnels([
  { id: "bandit", monster: "bandit", description: "A bandit." },
]);
const pair = tunnels([
  { id: "b1", monster: "bandit", name: "Red Bandit", description: "A bandit." },
  {
    id: "b2",
    monster: "bandit",
    name: "Grey Bandit",
    description: "Another bandit.",
  },
]);

/** The fight in the cellar, Vela first: initiative 20, then the foes 1, 2 and so on. */
function cellarFight(runtime, foes) {
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "move", destinationId: "rat-cellar" },
    uncheckedDice(20, ...Array.from({ length: foes }, (_, index) => index + 1)),
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
    lines: describeFifthResult(result, random.drawn, "Vela"),
  };
}

const casts = (runtime, state, spellId) =>
  runtime
    .projectActions(state)
    .filter(
      ({ action, available, spell }) =>
        action === "cast" && available && spell.id === spellId,
    );

test("Scorching Ray is offered with its foes and its rays", () => {
  const runtime = createFifthRuntime(
    pair,
    vela(["scorching-ray", "mirror-image"]),
  );
  const state = cellarFight(runtime, 2);
  const rays = casts(runtime, state, "scorching-ray");
  assert.deepEqual(
    rays.map(({ spell, targets }) => [
      spell.slotLevel,
      spell.maxTargets,
      targets.map(({ id }) => id),
    ]),
    [[2, 3, ["b2", "b1"]]],
  );
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "cast");
  assert.match(
    tool.description,
    /scorching-ray \(Scorching Ray: .*up to 3 different targets \(one more for each slot level above 2nd\).*its rays, one for each of those, are split as evenly as they go among the targets named, the first named taking any more/u,
  );
  // Three rays, two at the first bandit offered (the Grey, first in the
  // initiative order), one at the second; then each
  // bandit misses (1).
  const hurled = accepted(
    runtime,
    state,
    runtime.actionOf(rays[0]),
    15,
    1,
    1,
    15,
    2,
    2,
    2,
    1,
    1,
  );
  assert.equal(
    renderFifthResult(hurled).match(/with Scorching Ray/gu).length,
    3,
  );
  const attacks = hurled.events.filter(({ type }) => type === "attack");
  assert.deepEqual(
    attacks
      .filter(({ actorId }) => actorId === "pc")
      .map(({ targetId, damage }) => [targetId, damage]),
    [
      ["b2", 2],
      ["b2", 4],
      ["b1", 0],
    ],
  );
});

test("Potent Cantrip: a missed Fire Bolt still burns for half, and the card says so", () => {
  const runtime = createFifthRuntime(
    den,
    vela(["scorching-ray", "mirror-image"]),
  );
  const state = cellarFight(runtime, 1);
  const [bolt] = casts(runtime, state, "fire-bolt");
  // A 2 misses; the 1d10 shows 7, halved to 3. Then the bandit misses (1).
  const missed = accepted(runtime, state, runtime.actionOf(bolt), 2, 7, 1);
  assert.match(
    renderFifthResult(missed),
    /Miss\. Half damage all the same: 7, halved to 3 fire; Bandit has 8\/11 HP\./u,
  );
  const [damage] = missed.lines.flatMap(({ rolls }) =>
    rolls.filter(({ purpose }) => purpose === "damage"),
  );
  assert.deepEqual(
    [damage.total, damage.halved, damage.dice.map(({ value }) => value)],
    [3, true, [7]],
  );
});

test("Mirror Image: a duplicate takes the bandit's hit, and the card shows its d6s", () => {
  const runtime = createFifthRuntime(
    den,
    vela(["scorching-ray", "mirror-image"]),
  );
  const state = cellarFight(runtime, 1);
  const [images] = casts(runtime, state, "mirror-image");
  // Vela's turn ends; the bandit hits (18), and she takes the hit rather
  // than cast Shield: the d6s show 1, 1, 3.
  const offered = accepted(runtime, state, runtime.actionOf(images), 18);
  const round = accepted(
    runtime,
    offered.state,
    { type: "take-hit", actorId: "pc" },
    1,
    1,
    3,
  );
  assert.match(
    renderFifthResult(round),
    /Bandit's Scimitar hits\. Mirror Image rolls 1, 1, 3: a duplicate takes the hit and vanishes; 2 duplicates are left\./u,
  );
  const [duplicates] = round.lines.flatMap(({ rolls }) =>
    rolls.filter(({ purpose }) => purpose === "duplicates"),
  );
  assert.deepEqual(
    [duplicates.outcome, duplicates.dice.map(({ value }) => value)],
    ["success", [1, 1, 3]],
  );
  assert.equal(
    round.state.encounter.combatants.find(({ id }) => id === "pc").hp,
    20,
  );
});

test("Acid Arrow: the acid burns at the end of the bandit's turn", () => {
  const runtime = createFifthRuntime(den, vela(["acid-arrow", "blur"]));
  const state = cellarFight(runtime, 1);
  const [arrow] = casts(runtime, state, "acid-arrow");
  // A hit (15) for 4d4 = 4; the bandit misses (1), then 2d4 = 4 burns.
  const round = accepted(
    runtime,
    state,
    runtime.actionOf(arrow),
    15,
    1,
    1,
    1,
    1,
    1,
    2,
    2,
  );
  const text = renderFifthResult(round);
  assert.match(
    text,
    /Acid Arrow takes hold on Bandit: 2d4 acid more at the end of its next turn, until the fight ends\./u,
  );
  assert.match(
    text,
    /Acid Arrow: the acid burns Bandit as its turn ends\. Damage 2 \+ 2 .*= 4 acid; Bandit has 3\/11 HP\./u,
  );
});

test("the AI DM's prompt says what the new spells and Potent Cantrip do", () => {
  for (const words of [
    /Scorching Ray hurls rays, an attack roll each, split as evenly as they go among the targets named/u,
    /Acid Arrow deals half its damage on a miss/u,
    /Mirror Image's duplicates may take a hit instead of the character/u,
    /deal half their damage on a miss or a successful save \(Potent Cantrip\)/u,
    /writes a new level's spells into it and chooses Scholar's Expertise there too/u,
  ]) {
    assert.match(FIFTH_DM_SYSTEM_PROMPT, words);
  }
});
