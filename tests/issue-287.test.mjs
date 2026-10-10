// #287: the 2024 Fighter (SRD 5.2) at level 5. Level 5 comes at 6,500 XP with
// its hit points, proficiency bonus +3 and Extra Attack: the Attack action
// makes two attacks, which may target different opponents, alongside the
// Light weapon's extra attack and Action Surge. Tactical Shift is omitted
// (no positions). The engine refuses a third attack.
import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  availableActions,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { readFile } from "node:fs/promises";
import { characterAtLevel, gateAdventure } from "../dist/balance-5e.js";
import { runDmTurn } from "../dist/dm-turn.js";
import {
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  LEVEL_XP,
  levelForXp,
  levelUpChanges,
  pendingLevelChoice,
  settleCharacter,
  validateCharacter,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, playerCombatant } from "../dist/runtime-5e.js";
import { libraryAt, testFighterAt } from "../dist/test-fighter-5e.js";
import { tierAllowed, treasureBudget } from "../dist/treasure-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice, uncheckedDice } from "./fixtures/engine-dice.mjs";
import { fightRoom, moduleFile } from "./fixtures/modules.mjs";

const mace = {
  name: "Mace",
  bonus: 6,
  damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
  criticalRange: 19,
};
/** A level-5 Fighter, hurt so that Second Wind keeps its turn open. */
const veteran = (overrides = {}) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 30,
  maxHp: 44,
  dexterity: 12,
  initiativeBonus: 1,
  attack: mace,
  attacksPerAction: 2,
  secondWind: {
    uses: 3,
    max: 3,
    healing: { dice: 1, sides: 10, modifier: 5 },
  },
  actionSurge: { uses: 1, max: 1 },
  ...overrides,
});
const goblin = (id, hp = 10) => ({
  id,
  name: id === "a" ? "Goblin A" : "Goblin B",
  side: "opponents",
  armorClass: 15,
  hp,
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
/** The veteran wins initiative against two goblins. */
const veteranFirst = (overrides = {}, hpA = 10) =>
  startEncounter(
    [veteran(overrides), goblin("a", hpA), goblin("b")],
    dice([20, 15], [20, 3], [20, 2]),
  ).state;
const attack = (state, targetId, random) =>
  act(state, { type: "attack", actorId: "pc", targetId }, random);
const swings = (events) =>
  events
    .filter(({ type }) => type === "attack")
    .map(({ actorId, targetId, hit }) => [actorId, targetId, hit]);

test("Extra Attack: the Attack action makes two attacks, at different targets", () => {
  const state = veteranFirst();
  assert.equal(state.economy.attacks, 0);
  // 12 + 6 hits Goblin A for 4 + 3; then 2 + 6 misses Goblin B.
  const first = attack(state, "a", dice([20, 12], [6, 4]));
  assert.deepEqual(swings(first.events), [["pc", "a", true]]);
  assert.equal(first.state.economy.actions, 0);
  assert.equal(first.state.economy.attacks, 1);
  assert.equal(currentCombatant(first.state).id, "pc");
  assert.ok(availableActions(first.state, "pc").includes("attack"));
  const second = attack(first.state, "b", dice([20, 2]));
  assert.deepEqual(swings(second.events), [["pc", "b", false]]);
  assert.equal(second.state.economy.attacks, 0);
  assert.deepEqual(
    second.state.combatants.map(({ id, hp }) => [id, hp]),
    [
      ["pc", 30],
      ["a", 3],
      ["b", 10],
    ],
  );
});

test("a third attack is refused, drawing no dice", () => {
  const state = veteranFirst({ actionSurge: undefined });
  const twice = attack(
    attack(state, "a", dice([20, 2])).state,
    "a",
    dice([20, 2]),
  ).state;
  assert.equal(currentCombatant(twice).id, "pc");
  assert.ok(!availableActions(twice, "pc").includes("attack"));
  const none = dice();
  assert.deepEqual(attack(twice, "b", none), {
    state: twice,
    rejection: {
      code: "action-used",
      reason:
        "You have already made every attack your Attack actions allow this turn.",
    },
  });
  assert.deepEqual(none.drawn, []);
});

test("a Fighter without Extra Attack still attacks once an action", () => {
  const state = veteranFirst({ attacksPerAction: undefined });
  const once = attack(state, "a", dice([20, 2])).state;
  assert.equal(once.economy.attacks, 0);
  assert.ok(!availableActions(once, "pc").includes("attack"));
  assert.equal(
    attack(once, "a", dice()).rejection.reason,
    "You have already used your action this turn.",
  );
});

test("Extra Attack with Action Surge: two Attack actions, four attacks", () => {
  let state = veteranFirst();
  state = attack(state, "a", dice([20, 2])).state;
  // Surging mid-action keeps the action's second attack and adds an action.
  state = act(state, { type: "action-surge", actorId: "pc" }, dice()).state;
  assert.equal(state.economy.attacks, 1);
  assert.equal(state.economy.actions, 1);
  state = attack(state, "b", dice([20, 2])).state;
  state = attack(state, "a", dice([20, 2])).state;
  assert.equal(state.economy.actions, 0);
  assert.equal(state.economy.attacks, 1);
  state = attack(state, "b", dice([20, 2])).state;
  assert.equal(state.economy.attacks, 0);
  assert.equal(
    attack(state, "a", dice()).rejection.reason,
    "You have already made every attack your Attack actions allow this turn.",
  );
});

test("Extra Attack with a light weapon's extra attack: three attacks in a turn", () => {
  const dagger = {
    name: "Dagger",
    bonus: 6,
    damage: { dice: 1, sides: 4, modifier: 0, type: "piercing" },
    criticalRange: 19,
  };
  let state = veteranFirst({
    attack: { ...dagger, damage: { ...dagger.damage, modifier: 3 } },
    lightAttack: dagger,
    actionSurge: undefined,
    secondWind: undefined,
  });
  state = attack(state, "a", dice([20, 2])).state;
  assert.deepEqual(availableActions(state, "pc"), [
    "attack",
    "light-attack",
    "end-turn",
  ]);
  // The light attack takes the bonus action; the second attack still follows.
  state = act(
    state,
    { type: "light-attack", actorId: "pc", targetId: "b" },
    dice([20, 2]),
  ).state;
  assert.deepEqual(availableActions(state, "pc"), ["attack", "end-turn"]);
  // The last attack ends the turn: both goblins then swing and miss.
  const last = attack(state, "b", dice([20, 2], [20, 1], [20, 1]));
  assert.deepEqual(swings(last.events), [
    ["pc", "b", false],
    ["a", "pc", false],
    ["b", "pc", false],
  ]);
  assert.equal(currentCombatant(last.state).id, "pc");
  assert.equal(last.state.round, 2);
  assert.equal(last.state.economy.attacks, 0);
});

test("Extra Attack after the first target falls: the second goes to another", () => {
  // 15 + 6 hits Goblin A (4 HP) for 2 + 3 and drops it.
  const state = veteranFirst({}, 4);
  const first = attack(state, "a", dice([20, 15], [6, 2]));
  assert.equal(first.state.combatants[1].hp, 0);
  assert.equal(first.state.outcome, "ongoing");
  assert.equal(first.state.economy.attacks, 1);
  const none = dice();
  assert.equal(
    attack(first.state, "a", none).rejection.code,
    "already-defeated",
  );
  assert.deepEqual(none.drawn, []);
  const second = attack(first.state, "b", dice([20, 15], [6, 2]));
  assert.deepEqual(swings(second.events), [["pc", "b", true]]);
  assert.equal(second.state.combatants[2].hp, 5);
});

test("the turn's unused second attack ends with the turn", () => {
  const state = veteranFirst();
  const first = attack(state, "a", dice([20, 2])).state;
  const ended = act(
    first,
    { type: "end-turn", actorId: "pc" },
    dice([20, 1], [20, 1]),
  ).state;
  assert.equal(currentCombatant(ended).id, "pc");
  assert.equal(ended.economy.attacks, 0);
  assert.equal(ended.economy.actions, 1);
});

// Kept totals 15, 14, 13, 12, 10, 8 in roll order: Str 17, Dex 14, Con 14.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};
const LEVEL_CHOICE = { increase: { wisdom: 2 }, mastery: "longsword" };
/** Ada at `level` with that level's least XP, her level-4 choice made. */
const adaAt = (level) => {
  const created = buildCharacter("a".repeat(32), "Ada", DICE, CHOICES);
  const raised = { ...created, level, xp: LEVEL_XP[level] };
  const sheet = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  return pendingLevelChoice(sheet) === undefined
    ? sheet
    : applyLevelChoice(sheet, LEVEL_CHOICE);
};
const credited = (sheet, xp) =>
  settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: [],
      ammunition: { arrows: 0, bolts: 0 },
      treasure: [],
      purse: 0,
    },
    xp: [{ id: "keep/encounter/ogre", name: "Ogre", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });

test("the Fighter table at level 5: 6,500 XP, HP, proficiency +3 and Extra Attack", () => {
  assert.equal(LEVEL_XP[5], 6500);
  assert.equal(levelForXp(6499), 4);
  assert.equal(levelForXp(6500), 5);
  assert.equal(levelForXp(1_000_000), 5);
  const fourth = characterProfile(adaAt(4));
  const fifth = characterProfile(adaAt(5));
  // Con 14 (+2): 10 + 2, then 6 + 2 a level.
  assert.equal(fifth.maxHp, 44);
  assert.equal(fourth.proficiencyBonus, 2);
  assert.equal(fifth.proficiencyBonus, 3);
  // Str 17 (+3) with the mace: +5 to hit at level 4, +6 at level 5.
  assert.equal(fourth.attack.bonus, 5);
  assert.equal(fifth.attack.bonus, 6);
  assert.equal(fourth.attacksPerAction, 1);
  assert.equal(fifth.attacksPerAction, 2);
  assert.equal(fifth.featureUses["second-wind"].max, 3);
  assert.equal(fifth.secondWind.healing.modifier, 5);
  assert.equal(fifth.featureUses["action-surge"].max, 1);
  assert.equal(adaAt(5).weaponMasteries.length, 4);
  assert.deepEqual(
    fifth.features.slice(-2).map(({ id }) => id),
    ["ability-score-improvement", "extra-attack"],
  );
  assert.match(fifth.features.at(-1).text, /different opponent/u);
  // Tactical Shift moves the character: there are no positions.
  assert.ok(!fifth.features.some(({ name }) => /Tactical Shift/u.test(name)));
  assert.equal(fourth.nextLevelXp, 6500);
  assert.equal(fifth.nextLevelXp, undefined);
  assert.equal(
    fifth.savingThrows.strength.bonus - fourth.savingThrows.strength.bonus,
    1,
  );
});

test("settling past 6,500 XP credits level 5 with Extra Attack and nothing to choose", () => {
  const fourth = adaAt(4);
  const fifth = credited(fourth, 3800);
  assert.equal(fifth.level, 5);
  assert.equal(pendingLevelChoice(fifth), undefined);
  const changes = levelUpChanges(fourth, fifth);
  assert.equal(changes.from, 4);
  assert.equal(changes.to, 5);
  assert.deepEqual(changes.maxHp, { before: 36, after: 44 });
  assert.deepEqual(changes.proficiencyBonus, { before: 2, after: 3 });
  assert.deepEqual(
    changes.features.map(({ id }) => id),
    ["extra-attack"],
  );
  assert.deepEqual(changes.choices, []);
  // From level 3 straight to 5, the level-4 choice is still owed.
  const third = adaAt(3);
  const skipped = credited(third, 5600);
  assert.equal(skipped.level, 5);
  assert.equal(pendingLevelChoice(skipped), 4);
  assert.deepEqual(levelUpChanges(third, skipped).choices, [
    "ability-score-improvement",
    "weapon-mastery",
  ]);
});

test("a level-5 character fights with Extra Attack; a level-4 one without", () => {
  assert.equal(playerCombatant(testFighterAt(5)).attacksPerAction, 2);
  assert.equal("attacksPerAction" in playerCombatant(adaAt(4)), false);
});

/** The scripted AI DM's responses, in order. */
function scripted(...responses) {
  return {
    async respond() {
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}
const call = (name, args) => ({
  toolCalls: [{ id: "call-1", name, argumentsJson: JSON.stringify(args) }],
});
const goblinPair = fightRoom("goblin-pair", "The Goblin Pair", [
  { id: "left", monster: "goblin-warrior", name: "Left Goblin" },
  { id: "right", monster: "goblin-warrior", name: "Right Goblin" },
]);

test("scripted DM: two attacks at two targets, then a third attack is refused", async () => {
  const runtime = createFifthRuntime(goblinPair, testFighterAt(5));
  // A seed on which Ada wins initiative.
  let begun;
  for (let seed = 0; begun === undefined; seed++) {
    const state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      createSeededRandom(seed),
    ).state;
    if (state.encounter.order[0].combatantId === "pc") {
      begun = state;
    }
  }
  const turn = (state, playerInput, model, random) =>
    runDmTurn({ state, playerInput, transcript: [], random, model, runtime });
  const offersAttack = (state) =>
    runtime.getGameToolDefinitions(state).some(({ name }) => name === "attack");
  // A 2 misses each goblin: one die an attack.
  const first = (
    await turn(
      begun,
      "I swing at the left goblin.",
      scripted(call("attack", { target: "left" }), { text: "You miss." }),
      uncheckedDice(2),
    )
  ).state;
  assert.equal(first.encounter.economy.attacks, 1);
  assert.equal(first.encounter.economy.actions, 0);
  assert.ok(offersAttack(first), "the second attack is offered");
  const second = (
    await turn(
      first,
      "And then at the right one.",
      scripted(call("attack", { target: "right" }), {
        text: "You miss again.",
      }),
      uncheckedDice(2),
    )
  ).state;
  // Each goblin has been attacked once: the two attacks split.
  assert.deepEqual([...second.encounter.engaged].sort(), [
    "left",
    "pc",
    "right",
  ]);
  assert.equal(second.encounter.economy.attacks, 0);
  // Action Surge keeps the turn open, but the Attack action is spent.
  assert.equal(second.encounter.order[second.encounter.turn].combatantId, "pc");
  assert.ok(!offersAttack(second), "no third attack is offered");
  const random = uncheckedDice();
  const third = await turn(
    second,
    "I hit the left goblin a third time.",
    scripted(call("attack", { target: "left" }), {
      text: "You have no attack left.",
    }),
    random,
  );
  assert.deepEqual(third.state, second);
  assert.deepEqual(random.drawn, []);
});

test("modules may recommend level 5, with a 750 gp budget", () => {
  assert.equal(treasureBudget(5), 75000);
  assert.equal(treasureBudget(5), 5 * treasureBudget(1));
  assert.equal(tierAllowed("uncommon", 5), true);
  assert.equal(tierAllowed("rare", 5), false);
  const module = moduleFile("lintel-barrow");
  module.recommendedLevels = { min: 4, max: 5 };
  assert.deepEqual(validateModule(module).recommendedLevels, {
    min: 4,
    max: 5,
  });
  module.recommendedLevels = { min: 5, max: 6 };
  assert.throws(() => validateModule(module), /recommendedLevels max/u);
});

test("the gate builds level-5 Fighters with Extra Attack and plays it", () => {
  const built = characterAtLevel(DICE, 5);
  assert.equal(built.level, 5);
  assert.equal(pendingLevelChoice(built), undefined);
  assert.equal(characterProfile(built).attacksPerAction, 2);
  const module = moduleFile("lintel-barrow");
  module.recommendedLevels = { min: 5, max: 5 };
  module.difficulty = "hard";
  const result = gateAdventure(validateModule(module), {
    seeds: [0, 1],
    sampleSize: 200,
  });
  assert.equal(result.ok, true);
  // From 13,999 XP, one short of level 6, the limit is level 6.
  assert.equal(result.verdict.xp.startXp, 13999);
  assert.equal(result.verdict.xp.levelLimit, 6);
  assert.equal(result.verdict.xp.endLevel, 6);
});

test("the handoff's input library is Ada at level 5", async () => {
  // Regenerate it from libraryAt(5) when the library format changes.
  const input = new URL(
    "../docs/acceptance/inputs/issue-287/level-5-ada.json",
    import.meta.url,
  );
  assert.deepEqual(
    JSON.parse(await readFile(input, "utf8")),
    JSON.parse(JSON.stringify(libraryAt(5))),
  );
});
