// #339: the Cleric's new spells in the engine and the runtime. Guidance
// adds a d4 to the next graded check, then ends; Guiding Bolt's hit gives
// the next attack roll on its target advantage until the end of the
// caster's next turn; Resistance takes a d4 off damage of the type chosen
// at casting, once a turn; Thaumaturgy is flavour only and never cast.
import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacter, defaultPlacement } from "../dist/character-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import {
  act,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { gradedCellar, loneGoblin } from "./fixtures/modules.mjs";

// Kept totals 15, 14, 13, 12, 10, 8: Wisdom 17, Constitution 15.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const MIRA = buildCharacter(
  "d".repeat(32),
  "Mira",
  DICE,
  { ...CLERIC.defaults, placement: defaultPlacement(DICE, CLERIC) },
  "cleric",
);

/** Mira as a combatant built by hand: AC 12, Wisdom-cast spells. */
const mira = (spells = ["guiding-bolt", "resistance", "thaumaturgy"]) => ({
  id: "pc",
  name: "Mira",
  side: "party",
  armorClass: 12,
  hp: 10,
  maxHp: 10,
  dexterity: 12,
  initiativeBonus: 1,
  saves: {
    strength: 1,
    dexterity: 1,
    constitution: 2,
    intelligence: -1,
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
    attackBonus: 5,
    saveDc: 13,
    modifier: 3,
    spells: spells.map((id) => spellAtLevel(SPELLS[id], 1)),
    slots: [{ uses: 2, max: 2 }],
  },
});

const goblin = () => ({
  id: "goblin",
  name: "Goblin Warrior",
  side: "opponents",
  armorClass: 13,
  hp: 30,
  maxHp: 30,
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
});

/** A fight Mira opens: her initiative 15, the goblin's 3. */
function opening() {
  const { state } = startEncounter([mira(), goblin()], dice([20, 15], [20, 3]));
  assert.equal(currentCombatant(state).id, "pc");
  return state;
}

function accepted(state, action, random = dice()) {
  const result = act(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const cast = (spellId, targetId, extra = {}) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetId],
  ...extra,
});

test("Guiding Bolt: a hit gives the next attack roll on its target advantage", () => {
  // Hit: 12 + 5 against AC 13, 4d6 radiant; the goblin misses on its turn.
  const { state, events } = accepted(
    opening(),
    cast("guiding-bolt", "goblin", { slotLevel: 1 }),
    dice([20, 12], [6, 1], [6, 2], [6, 3], [6, 4], [20, 2]),
  );
  const bolt = events.find(({ type }) => type === "attack");
  assert.equal(bolt.hit, true);
  assert.equal(bolt.damage, 10);
  assert.equal(bolt.damageType, "radiant");
  assert.equal(bolt.guided, true);
  assert.deepEqual(state.guided, [
    { targetId: "goblin", sourceId: "pc", round: 1 },
  ]);
  // Mira's next turn: her mace has advantage, which the attack spends.
  const { state: after, events: struck } = accepted(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice([20, 4], [20, 15], [6, 3], [20, 1]),
  );
  const swing = struck.find(({ type }) => type === "attack");
  assert.deepEqual(swing.mode, {
    d20s: [4, 15],
    advantage: ["Guiding Bolt"],
    disadvantage: [],
  });
  assert.deepEqual(after.guided, []);
});

test("Guiding Bolt's advantage ends with the caster's next turn, and a miss gives none", () => {
  const { state } = accepted(
    opening(),
    cast("guiding-bolt", "goblin", { slotLevel: 1 }),
    dice([20, 12], [6, 1], [6, 1], [6, 1], [6, 1], [20, 2]),
  );
  // Mira ends her next turn without attacking; the goblin's turn passes.
  const { state: later } = accepted(
    state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 2]),
  );
  assert.deepEqual(later.guided, []);
  // A miss: 3 + 5 against AC 13.
  const { state: missed, events } = accepted(
    opening(),
    cast("guiding-bolt", "goblin", { slotLevel: 1 }),
    dice([20, 3], [20, 2]),
  );
  assert.equal(events.find(({ type }) => type === "attack").guided, undefined);
  assert.equal(missed.guided, undefined);
});

test("Resistance takes a d4 off damage of its type, once a turn", () => {
  const { state, events } = accepted(
    opening(),
    cast("resistance", "pc", { damageType: "slashing" }),
    // The goblin's turn: a hit, 5 + 2 slashing, less Resistance's 3; Mira
    // keeps concentrating (15 + 2 against DC 10).
    dice([20, 15], [6, 5], [4, 3], [20, 15]),
  );
  const effect = events.find(({ type }) => type === "effect");
  assert.equal(effect.damageType, "slashing");
  const scimitar = events.find(({ type }) => type === "attack");
  assert.deepEqual(scimitar.reduced, {
    spell: "Resistance",
    roll: 3,
    part: "weapon",
    from: 7,
  });
  assert.equal(scimitar.damage, 4);
  assert.equal(combatant(state, "pc").hp, 6);
  assert.match(
    renderFifthResult({ state: { encounter: state }, events: [scimitar] }),
    /= 7 slashing, less 3 \(Resistance\) = 4; Mira has 6\/10 HP\./u,
  );
});

test("Resistance reduces only the first hit of its type in a turn", () => {
  const { state: opened } = startEncounter(
    [
      { ...mira(), hp: 20, maxHp: 20 },
      { ...goblin(), multiattack: { attacks: 2, weapons: [goblin().attack] } },
    ],
    dice([20, 15], [20, 3]),
  );
  // Two hits on the goblin's turn: 7 less 3, then 7 in full, each with
  // Mira's Constitution save to keep concentrating.
  const { state, events } = accepted(
    opened,
    cast("resistance", "pc", { damageType: "slashing" }),
    dice([20, 15], [6, 5], [4, 3], [20, 15], [20, 15], [6, 5], [20, 15]),
  );
  const hits = events.filter(({ type }) => type === "attack");
  assert.deepEqual(
    hits.map(({ damage, reduced }) => [damage, reduced?.roll]),
    [
      [4, 3],
      [7, undefined],
    ],
  );
  assert.equal(combatant(state, "pc").hp, 20 - 4 - 7);
});

test("Resistance needs a damage type it may resist, and no other spell takes one", () => {
  const state = opening();
  for (const damageType of [undefined, "force", "psychic", "sparkles"]) {
    const result = act(
      state,
      cast("resistance", "pc", damageType === undefined ? {} : { damageType }),
      dice(),
    );
    assert.equal(result.rejection?.code, "damage-type");
  }
  const result = act(
    state,
    cast("guiding-bolt", "goblin", { slotLevel: 1, damageType: "fire" }),
    dice(),
  );
  assert.equal(result.rejection?.code, "damage-type");
  assert.equal(result.rejection.reason, "Guiding Bolt takes no damage type.");
});

test("Thaumaturgy is flavour only: never cast", () => {
  const result = act(opening(), cast("thaumaturgy", "goblin"), dice());
  assert.equal(result.rejection?.code, "no-effect");
  assert.equal(
    result.rejection.reason,
    "Thaumaturgy is flavour only: it has no effect in play.",
  );
});

test("Guidance adds a d4 to the next graded check, then ends", () => {
  const runtime = createFifthRuntime(gradedCellar, MIRA);
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(),
  ).state;
  // Outside a fight the bar offers Guidance, never Thaumaturgy.
  const casts = runtime
    .projectActions(state)
    .filter(({ action }) => action === "cast")
    .map(({ spell }) => spell.id);
  assert.ok(casts.includes("guidance"));
  assert.ok(!casts.includes("thaumaturgy"));
  assert.ok(!casts.includes("resistance"));
  const guided = runtime.handleAction(state, cast("guidance", "pc"), dice());
  assert.equal(guided.rejection, undefined, guided.rejection?.reason);
  state = guided.state;
  assert.deepEqual(
    state.character.effects.map(({ spellId, ends }) => [spellId, ends]),
    [["guidance", "fight"]],
  );
  // Perception: d20 9 + Wisdom 3, + Guidance's 3 = 15 against DC 12.
  const random = dice([20, 9], [4, 3]);
  const examined = runtime.handleAction(
    state,
    { type: "examine", targetId: "rubble-heap" },
    random,
  );
  assert.equal(examined.rejection, undefined, examined.rejection?.reason);
  const check = examined.events.find(({ type }) => type === "check");
  assert.deepEqual(check.roll.effectDice, [
    { spell: "Guidance", sides: 4, roll: 3 },
  ]);
  assert.equal(check.roll.total, 15);
  assert.equal(check.band, "success");
  const ended = examined.events.find(({ type }) => type === "effect-ended");
  assert.equal(ended.reason, "used");
  assert.equal(examined.state.character.effects, undefined);
  const text = renderFifthResult(examined);
  assert.match(
    text,
    /Perception check: d20 9 \+ 3 \+ 3 \(Guidance\) = 15 against DC 12\. Success\./u,
  );
  assert.match(text, /Guidance ends on you: its die is spent\./u);
  // The card's dice: the d20, then Guidance's d4.
  const lines = describeFifthResult(examined, random.drawn, "Mira");
  assert.deepEqual(
    lines
      .flatMap(({ rolls }) => rolls)
      .find(({ purpose }) => purpose === "check").dice,
    [
      { sides: 20, value: 9 },
      { sides: 4, value: 3, effect: "Guidance" },
    ],
  );
  // The next check has no die.
  const next = runtime.handleAction(
    examined.state,
    { type: "examine", targetId: "cracked-cask" },
    dice([20, 10]),
  );
  assert.equal(next.rejection, undefined, next.rejection?.reason);
});

test("in a fight Resistance is offered against the foes' damage types", () => {
  const runtime = createFifthRuntime(loneGoblin, MIRA);
  const { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice([20, 18], [20, 2]),
  );
  const resistance = runtime
    .projectActions(state)
    .filter(
      ({ action, spell }) => action === "cast" && spell.id === "resistance",
    );
  assert.deepEqual(
    resistance.map(({ spell }) => spell.damageType),
    ["slashing"],
  );
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v27");
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /Thaumaturgy is flavour only/u);
});
