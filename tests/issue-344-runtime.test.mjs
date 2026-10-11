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

// Memorize Spell (#344): on a short rest, one prepared spell swapped for
// another in the spellbook, for the rest of the adventure only (D8).

/** Begun in the stair foot, where no foe is and a rest may be taken. */
const begun = (runtime) => {
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    uncheckedDice(),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
};
const restView = (runtime, state) =>
  runtime.projectActions(state).find(({ action }) => action === "rest");
const swap = (forget, learn, hitDice = 0) => ({
  type: "rest",
  hitDice,
  memorize: { forget, learn },
});
function refusedRest(runtime, state, action, code) {
  const result = runtime.handleAction(state, action, uncheckedDice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection;
}
const ids = (spells) => spells.map(({ id }) => id);

test("a level-5 Wizard's short rest offers Memorize Spell even at full health", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const state = begun(runtime);
  const view = restView(runtime, state);
  assert.equal(view.available, true);
  // Nothing else to restore: a rest that spends no hit dice.
  assert.deepEqual(view.rest.hitDice, [0]);
  assert.equal(view.rest.memorize.only, true);
  assert.deepEqual(
    runtime.actionOf(view),
    swap("mage-armor", "ray-of-sickness"),
  );
  assert.deepEqual(ids(view.rest.memorize.forget), [
    ...KEPT,
    "vampiric-touch",
    "haste",
  ]);
  assert.deepEqual(ids(view.rest.memorize.learn), [
    "ray-of-sickness",
    "scorching-ray",
    "shatter",
    "hold-person",
    "acid-arrow",
  ]);
  assert.deepEqual(view.rest.memorize.learn[1], {
    id: "scorching-ray",
    name: "Scorching Ray",
    level: 2,
  });
  // A rest with nothing to restore and no swap is still refused.
  refusedRest(
    runtime,
    state,
    { type: "rest", hitDice: 0 },
    "nothing-to-recover",
  );
});

test("Memorize Spell swaps a prepared spell until the adventure ends", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const state = begun(runtime);
  const rested = runtime.handleAction(
    state,
    swap("sleep", "shatter"),
    uncheckedDice(),
  );
  assert.equal(rested.rejection, undefined, rested.rejection?.reason);
  const memorized = rested.events.find(({ type }) => type === "memorized");
  assert.deepEqual(memorized, {
    type: "memorized",
    forgot: "sleep",
    learned: "shatter",
  });
  assert.match(
    renderFifthResult(rested),
    /Memorize Spell: you study your spellbook and prepare Shatter in place of Sleep until the adventure ends\./u,
  );
  assert.deepEqual(rested.state.character.prepared, [
    "mage-armor",
    "magic-missile",
    "shield",
    "shatter",
    "burning-hands",
    "chromatic-orb",
    "thunderwave",
    "vampiric-touch",
    "haste",
  ]);
  assert.equal(rested.state.shortRests, 1);
  assert.match(
    runtime.projectCharacterStatus(rested.state).resources.join("\n"),
    /^Prepared for this adventure \(Memorize Spell\): .*Shatter.*$/mu,
  );
  // In the cellar's fight Shatter is offered and Sleep isn't.
  const fight = runtime.handleAction(
    rested.state,
    { type: "move", destinationId: "rat-cellar" },
    uncheckedDice(20, 1),
  ).state;
  assert.ok(casts(runtime, fight, "shatter").length > 0);
  assert.equal(casts(runtime, fight, "sleep").length, 0);
  // The second rest can swap again, from the new list.
  const view = restView(runtime, rested.state);
  assert.ok(ids(view.rest.memorize.forget).includes("shatter"));
  assert.ok(ids(view.rest.memorize.learn).includes("sleep"));
});

test("Memorize Spell refuses a spell not prepared, one not in the book or already prepared, and a Wizard below level 5", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const state = begun(runtime);
  assert.match(
    refusedRest(runtime, state, swap("shatter", "sleep"), "memorize-forget")
      .reason,
    /^You haven't prepared Shatter, so there is nothing to swap out\.$/u,
  );
  assert.match(
    refusedRest(runtime, state, swap("sleep", "fireball"), "memorize-learn")
      .reason,
    /^Fireball isn't in your spellbook\.$/u,
  );
  assert.match(
    refusedRest(runtime, state, swap("sleep", "shield"), "memorize-learn")
      .reason,
    /^Shield is prepared already\.$/u,
  );
  assert.match(
    refusedRest(runtime, state, swap("sleep", "fire-bolt"), "memorize-learn")
      .reason,
    /^Fire Bolt is a cantrip: Memorize Spell swaps only 1st-level or higher spells\.$/u,
  );
  // A level-4 Wizard has no Memorize Spell.
  let level4 = buildCharacter(
    "e".repeat(32),
    "Vela",
    DICE,
    { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
    "wizard",
  );
  for (const [xp, id] of [
    [300, "cellar"],
    [600, "barrow"],
  ]) {
    level4 = withOwedChoices(earn(level4, xp, id));
  }
  level4 = withOwedChoices(
    applyLevelChoice(earn(level4, 1800, "crypt"), {
      increase: { intelligence: 2 },
    }),
  );
  const younger = createFifthRuntime(den, level4);
  const fresh = begun(younger);
  assert.equal(restView(younger, fresh), undefined);
  assert.match(
    refusedRest(younger, fresh, swap("sleep", "shatter"), "no-memorize-spell")
      .reason,
    /^Memorize Spell comes with a Wizard's 5th level\.$/u,
  );
});

test("the rest tool takes the spells Memorize Spell swaps, or null for none", () => {
  const runtime = createFifthRuntime(den, vela(["vampiric-touch", "haste"]));
  const state = begun(runtime);
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "rest");
  const { forget_spell: forget, learn_spell: learn } =
    tool.parameters.properties;
  assert.deepEqual(forget.type, ["string", "null"]);
  assert.ok(forget.enum.includes("sleep") && forget.enum.includes(null));
  assert.ok(learn.enum.includes("shatter") && learn.enum.includes(null));
  assert.deepEqual(tool.parameters.required, [
    "hit_dice",
    "forget_spell",
    "learn_spell",
  ]);
  assert.match(tool.description, /Memorize Spell/u);
  const result = runtime.dispatchGameTool(
    state,
    {
      id: "rest-1",
      name: "rest",
      argumentsJson: JSON.stringify({
        hit_dice: 0,
        forget_spell: "sleep",
        learn_spell: "shatter",
      }),
    },
    uncheckedDice(),
  );
  assert.deepEqual(result.action, swap("sleep", "shatter"));
  assert.ok(result.state.character.prepared.includes("shatter"));
  // Null for both rests without a swap.
  const hurt = {
    ...state,
    character: { ...state.character, hp: state.character.hp - 5 },
  };
  const plain = runtime.dispatchGameTool(
    hurt,
    {
      id: "rest-2",
      name: "rest",
      argumentsJson: JSON.stringify({
        hit_dice: 1,
        forget_spell: null,
        learn_spell: null,
      }),
    },
    uncheckedDice(3),
  );
  assert.deepEqual(plain.action, { type: "rest", hitDice: 1 });
  assert.equal(plain.state.character.prepared, undefined);
});

test("the AI DM's prompt says Memorize Spell is the one change to prepared spells in an adventure", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /except a level-5 Wizard's Memorize Spell: with a short rest, rest takes forget_spell and learn_spell/u,
  );
});
