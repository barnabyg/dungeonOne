// #344: a level-5 Evoker in the runtime. Vampiric Touch's later touches
// offered as their own action and tool; Slow offered at up to four foes and
// its saves in the card; Haste's extra attack offered once the action is
// spent; and the AI DM told what the new spells do.
import assert from "node:assert/strict";
import test from "node:test";

import {
  addToSpellbook,
  applyLevelChoice,
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

/** The seven spells Vela prepares at level 5 besides `written`. */
const KEPT = [
  "mage-armor",
  "magic-missile",
  "shield",
  "sleep",
  "burning-hands",
  "chromatic-orb",
  "thunderwave",
];

/**
 * Vela, a level-5 Evoker (Intelligence 18: spell attack +7, DC 15; 32 HP)
 * who wrote the 3rd-level spells `written` into her spellbook at level 5
 * and prepared them.
 */
export const vela = (written) => {
  let sheet = buildCharacter(
    "e".repeat(32),
    "Vela",
    DICE,
    { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
    "wizard",
  );
  sheet = withOwedChoices(earn(sheet, 300, "cellar"));
  sheet = withOwedChoices(earn(sheet, 600, "barrow"));
  sheet = withOwedChoices(
    applyLevelChoice(earn(sheet, 1800, "crypt"), {
      increase: { intelligence: 1, constitution: 1 },
    }),
  );
  sheet = addToSpellbook(earn(sheet, 3800, "tomb"), written);
  return prepareSpells(sheet, [...KEPT, ...written]);
};

/** The rat tunnels with the cellar's rat swapped for `opponents`. */
export const tunnels = (opponents) => {
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
const offered = (runtime, state, kind) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === kind && available);
const hp = (state, id) =>
  state.encounter.combatants.find((combatant) => combatant.id === id).hp;

test("Vampiric Touch drains the bandit, then is offered again as its own action and tool", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const state = cellarFight(runtime, 1);
  assert.equal(offered(runtime, state, "drain-attack").length, 0);
  const [touch] = casts(runtime, state, "vampiric-touch");
  assert.equal(touch.spell.slotLevel, 3);
  // A hit (15) for 3d6 = 2 + 2 + 1 = 5; at full HP Vela regains nothing.
  // Then the bandit misses (1).
  const touched = accepted(
    runtime,
    state,
    runtime.actionOf(touch),
    15,
    2,
    2,
    1,
    1,
  );
  assert.equal(hp(touched.state, "bandit"), 6);
  assert.match(
    renderFifthResult(touched),
    /Vampiric Touch takes hold on you: a draining touch: your action makes a melee spell attack for 3d6 necrotic, and you regain half the damage dealt/u,
  );
  // Her turn again: the touch is offered at the bandit, with no slot.
  const again = offered(runtime, touched.state, "drain-attack");
  assert.deepEqual(
    again.map(({ target }) => target.id),
    ["bandit"],
  );
  const tool = runtime
    .getGameToolDefinitions(touched.state)
    .find(({ name }) => name === "vampiric_touch");
  assert.match(
    tool.description,
    /^Only when the player asks to touch a foe again with Vampiric Touch/u,
  );
  assert.deepEqual(tool.parameters.properties.target.enum, ["bandit"]);
});

test("Vampiric Touch's healing shows in the card", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const opened = cellarFight(runtime, 1);
  // Vela at 20 of 32 HP.
  const state = {
    ...opened,
    encounter: {
      ...opened.encounter,
      combatants: opened.encounter.combatants.map((combatant) =>
        combatant.id === "pc" ? { ...combatant, hp: 20 } : combatant,
      ),
    },
  };
  const [touch] = casts(runtime, state, "vampiric-touch");
  // 3d6 = 6 + 6 + 6: 18 drops the bandit (11 HP), dealing 18; Vela regains 9.
  const touched = accepted(
    runtime,
    state,
    runtime.actionOf(touch),
    15,
    6,
    6,
    6,
  );
  assert.match(
    renderFifthResult(touched),
    /Vampiric Touch: you regain 9 HP and have 29\/32 HP\./u,
  );
});

test("Slow is offered at up to four foes, and its saves show in the card", () => {
  const runtime = createFifthRuntime(pair, vela(["slow", "lightning-bolt"]));
  const state = cellarFight(runtime, 2);
  const [slow] = casts(runtime, state, "slow");
  assert.equal(slow.spell.maxTargets, 4);
  const action = { ...runtime.actionOf(slow), targetIds: ["b1", "b2"] };
  // The Red Bandit fails (3), the Grey succeeds (19); each bandit then
  // misses (1), and the Red fails its repeat save (2).
  const slowed = accepted(runtime, state, action, 3, 19, 1, 1, 2);
  const text = renderFifthResult(slowed);
  assert.match(
    text,
    /Red Bandit makes a Wisdom saving throw against Slow: 3 \+ 0 = 3 against DC 15\. Failure: slowed\./u,
  );
  assert.match(
    text,
    /Grey Bandit makes a Wisdom saving throw against Slow: 19 \+ 0 = 19 against DC 15\. Success: the spell has no effect on it\./u,
  );
  assert.match(
    text,
    /Red Bandit makes a Wisdom saving throw against Slow: 2 \+ 0 = 2 against DC 15\. Failure: still slowed\./u,
  );
  const saves = slowed.lines.flatMap(({ rolls }) =>
    rolls.filter(({ label }) => /Slow/u.test(label ?? "")),
  );
  assert.equal(saves.length, 3);
});

test("Haste leaves its extra attack once the action is spent", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const state = cellarFight(runtime, 1);
  const [haste] = casts(runtime, state, "haste");
  const hasted = accepted(runtime, state, runtime.actionOf(haste));
  assert.equal(currentCombatant(hasted.state.encounter).id, "pc");
  assert.equal(offered(runtime, hasted.state, "attack").length, 1);
  assert.match(
    renderFifthResult(hasted),
    /Haste takes hold on you: hasted: \+2 AC/u,
  );
});

test("the AI DM's prompt says what the 3rd-level spells do", () => {
  for (const words of [
    /call vampiric_touch with the target/u,
    /Haste gives the character \+2 AC, advantage on Dexterity saves and one more weapon attack each turn/u,
    /Slow makes each foe it catches that fails its Wisdom save easier to hit and limits it to one attack a turn/u,
    /Fireball and Lightning Bolt each catch up to four foes/u,
  ]) {
    assert.match(FIFTH_DM_SYSTEM_PROMPT, words);
  }
});
