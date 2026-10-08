// #207: starting kits and weapon masteries. The Light property's extra
// attack, the Nick, Vex and Graze masteries and the Heavy property in the
// engine; the extra attack in the action bar and the AI DM's tools; and each
// kit's numbers on the creation screen.
import assert from "node:assert/strict";
import test from "node:test";
import { act, availableActions, startEncounter } from "../dist/encounter-5e.js";
import {
  buildCharacter,
  projectCreation,
  validateCharacter,
} from "../dist/character-5e.js";
import {
  characterAtLevel,
  gateAdventure,
  KITS,
  oneHitKillChance,
  percentileCharacters,
} from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { goblinBurrow, loneGoblin } from "./fixtures/modules.mjs";
import { dice } from "./fixtures/engine-dice.mjs";

const none = dice();

const weapon = (name, sides, modifier, extra = {}) => ({
  name,
  bonus: 5,
  damage: { dice: 1, sides, modifier, type: "piercing" },
  criticalRange: 20,
  ...extra,
});
const fighter = (extra = {}) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 13,
  hp: 12,
  maxHp: 12,
  dexterity: 12,
  initiativeBonus: 1,
  attack: weapon("Shortsword", 6, 3),
  secondWind: {
    uses: 2,
    max: 2,
    healing: { dice: 1, sides: 10, modifier: 1 },
  },
  ...extra,
});
const goblin = {
  id: "goblin",
  name: "Goblin Warrior",
  side: "opponents",
  armorClass: 15,
  hp: 10,
  maxHp: 10,
  dexterity: 15,
  initiativeBonus: 2,
  attack: weapon("Scimitar", 6, 2),
};
/** Ada acts first (15 against 3). */
const begin = (pc) =>
  startEncounter([pc, goblin], dice([20, 15], [20, 3])).state;
const attack = (type = "attack") => ({
  type,
  actorId: "pc",
  targetId: "goblin",
});
const goblinHp = (state) =>
  state.combatants.find(({ id }) => id === "goblin").hp;

test("the extra attack follows an attack with a light weapon, once a turn, as a bonus action", () => {
  const twin = fighter({
    lightAttack: weapon("Dagger", 4, 0),
    actionSurge: { uses: 1, max: 1 },
  });
  const start = begin(twin);
  assert.deepEqual(availableActions(start, "pc"), [
    "attack",
    "action-surge",
    "end-turn",
  ]);
  const early = act(start, attack("light-attack"), none);
  assert.equal(early.rejection.code, "no-light-attack");
  assert.equal(early.state, start);

  // 12 + 5 hits AC 15 for 4 + 3; the turn stays open for the extra attack.
  const struck = act(start, attack(), dice([20, 12], [6, 4]));
  assert.equal(goblinHp(struck.state), 3);
  assert.equal(struck.state.economy.lightAttack, "ready");
  assert.ok(availableActions(struck.state, "pc").includes("light-attack"));

  // 10 + 5 hits for 2, with no ability modifier; it takes the bonus action.
  const extra = act(
    struck.state,
    attack("light-attack"),
    dice([20, 10], [4, 2]),
  );
  const event = extra.events.find(({ type }) => type === "attack");
  assert.equal(event.weapon, "Dagger");
  assert.equal(event.light, true);
  assert.equal(event.damageModifier, 0);
  assert.equal(event.damage, 2);
  assert.equal(goblinHp(extra.state), 1);
  assert.equal(extra.state.economy.bonusAction, false);
  assert.equal(extra.state.economy.lightAttack, "used");

  // Action Surge keeps the turn open, but the extra attack is spent.
  assert.equal(
    act(extra.state, attack("light-attack"), none).rejection.code,
    "light-attack-used",
  );
  assert.ok(!availableActions(extra.state, "pc").includes("light-attack"));
});

test("without a second light weapon there is no extra attack", () => {
  const start = begin(fighter());
  const result = act(start, attack("light-attack"), none);
  assert.equal(result.rejection.code, "no-light-weapon");
  assert.equal(result.rejection.reason, "You don't hold two light weapons.");
});

test("the extra attack needs the bonus action unless the weapon has Nick", () => {
  const hurt = { hp: 5, actionSurge: { uses: 1, max: 1 } };
  // Second Wind spends the bonus action first.
  const plain = begin(
    fighter({ ...hurt, lightAttack: weapon("Dagger", 4, 0) }),
  );
  const winded = act(
    plain,
    { type: "second-wind", actorId: "pc" },
    dice([10, 4]),
  );
  const struck = act(winded.state, attack(), dice([20, 1]));
  assert.equal(
    act(struck.state, attack("light-attack"), none).rejection.code,
    "bonus-action-used",
  );
  assert.ok(!availableActions(struck.state, "pc").includes("light-attack"));

  // With Nick it is part of the Attack action: Second Wind is still there.
  const nick = begin(
    fighter({
      ...hurt,
      lightAttack: weapon("Dagger", 4, 0, { mastery: "Nick" }),
    }),
  );
  const first = act(nick, attack(), dice([20, 1]));
  const extra = act(first.state, attack("light-attack"), dice([20, 1]));
  assert.equal(extra.state.economy.bonusAction, true);
  assert.ok(availableActions(extra.state, "pc").includes("second-wind"));
});

test("Vex: a damaging hit gives advantage on the next attack against that target, to the end of the next turn", () => {
  const vexer = fighter({
    attack: weapon("Shortsword", 6, 3, { mastery: "Vex" }),
  });
  // Hit for 1 + 3; the goblin then misses with a 1.
  const first = act(begin(vexer), attack(), dice([20, 12], [6, 1], [20, 1]));
  assert.ok(first.events.some(({ type }) => type === "vexed"));
  assert.deepEqual(first.state.vexed, [
    { targetId: "goblin", sourceId: "pc", round: 1 },
  ]);
  // Round 2: advantage keeps the 15 of 3 and 15.
  const second = act(
    first.state,
    attack(),
    dice([20, 3], [20, 15], [6, 1], [20, 1]),
  );
  const event = second.events.find(({ type }) => type === "attack");
  assert.deepEqual(event.mode, {
    d20s: [3, 15],
    advantage: ["Vex"],
    disadvantage: [],
  });
  assert.equal(event.hit, true);

  // Unused, it lapses when Ada's turn after next begins.
  const ended = act(
    first.state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 1]),
  );
  assert.equal(ended.state.round, 3);
  assert.deepEqual(ended.state.vexed, []);
});

test("Graze: a miss still deals the damage modifier; Heavy below Strength 13 attacks at disadvantage", () => {
  const grazer = fighter({
    attack: {
      ...weapon("Greatsword", 6, 3, { mastery: "Graze" }),
      damage: { dice: 2, sides: 6, modifier: 3, type: "slashing" },
    },
  });
  // 2 + 5 misses AC 15, but grazes for 3. The goblin then misses.
  const grazed = act(begin(grazer), attack(), dice([20, 2], [20, 1]));
  const event = grazed.events.find(({ type }) => type === "attack");
  assert.equal(event.hit, false);
  assert.equal(event.graze, true);
  assert.equal(event.damage, 3);
  assert.deepEqual(event.damageRolls, []);
  assert.equal(goblinHp(grazed.state), 7);

  const heavy = fighter({
    attack: weapon("Greatsword", 6, 3, { disadvantage: ["Heavy"] }),
  });
  const swung = act(begin(heavy), attack(), dice([20, 18], [20, 4], [20, 1]));
  assert.deepEqual(swung.events.find(({ type }) => type === "attack").mode, {
    d20s: [18, 4],
    advantage: [],
    disadvantage: ["Heavy"],
  });
});

const DICE = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
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
  increase: { constitution: 2, intelligence: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "two-daggers",
  masteries: ["dagger", "mace", "shortsword"],
};
/** Plain values, in order. */
const rolls = (...queue) => ({
  roll() {
    assert.ok(queue.length > 0, "unexpected die");
    return queue.shift();
  },
});
const lightEntry = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "light-attack");
const toolNames = (runtime, state) =>
  runtime.getGameToolDefinitions(state).map(({ name }) => name);

test("the action bar and the AI DM offer the extra attack only with two light weapons, with its reason", () => {
  const sheet = buildCharacter("a".repeat(32), "Ada", DICE, CHOICES);
  const runtime = createFifthRuntime(loneGoblin, sheet);
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    rolls(15, 3),
  ).state;
  assert.deepEqual(lightEntry(runtime, begun), [
    {
      action: "light-attack",
      target: { id: "goblin", name: "Goblin Warrior" },
      available: false,
      reason: "Attack first",
    },
  ]);
  assert.ok(!toolNames(runtime, begun).includes("light_attack"));
  const refused = runtime.dispatchGameTool(begun, {
    name: "light_attack",
    argumentsJson: JSON.stringify({ target: "goblin" }),
  });
  assert.equal(refused.state, begun);
  assert.match(
    JSON.stringify(refused.modelOutput),
    /follows an attack with a light weapon/,
  );

  // A dagger hit (12 + 5) for 3 + 3 readies the extra attack.
  const struck = runtime.handleAction(
    begun,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    rolls(12, 3),
  );
  assert.equal(lightEntry(runtime, struck.state)[0].available, true);
  assert.ok(toolNames(runtime, struck.state).includes("light_attack"));
  const extra = runtime.handleAction(
    struck.state,
    { type: "light-attack", actorId: "pc", targetId: "goblin" },
    rolls(10, 2, 1),
  );
  assert.match(
    runtime.renderResult(extra),
    /^Ada attacks Goblin Warrior with Dagger \(extra attack\): 10 \+ 5 = 15 against AC 15\. Hit\. Damage 2 \+ 0 = 2 piercing; Goblin Warrior has 2\/10 HP\./,
  );
  assert.deepEqual(runtime.projectCharacterStatus(extra.state).equipment, [
    { id: "leather", name: "Leather armour" },
    { id: "dagger", name: "Dagger" },
    { id: "dagger", name: "Dagger" },
  ]);

  // The mace kit holds one weapon: no extra attack in the bar.
  const mace = createFifthRuntime(
    loneGoblin,
    buildCharacter("a".repeat(32), "Ada", DICE, { ...CHOICES, kit: "mace" }),
  );
  const maceBegun = mace.handleAction(
    mace.createSession(),
    { type: "begin" },
    rolls(15, 3),
  ).state;
  assert.deepEqual(lightEntry(mace, maceBegun), []);
});

test("creation projects every kit's AC, attack and damage for the current scores and masteries", () => {
  const projection = projectCreation(DICE, { ...CHOICES, masteries: ["mace"] });
  assert.deepEqual(projection.masteries, { chosen: 1, limit: 3, full: false });
  assert.equal(
    projection.unfinished.masteries,
    "Choose 3 weapon masteries; 1 chosen.",
  );
  assert.equal(projection.sheet, undefined);
  const kits = Object.fromEntries(projection.kits.map((kit) => [kit.id, kit]));
  assert.deepEqual(Object.keys(kits), [
    "mace",
    "two-daggers",
    "club-and-dagger",
  ]);
  // Str 16 (+3), Dex 12 (+1): leather 12 + Defense 1.
  assert.deepEqual(
    Object.values(kits).map(({ armorClass }) => armorClass),
    [13, 13, 13],
  );
  assert.deepEqual(kits.mace.items, ["Leather armour", "Mace"]);
  assert.equal(kits.mace.price, 1500);
  assert.equal(kits.mace.attack.mastery, "Sap");
  assert.equal(kits["two-daggers"].attack.mastery, undefined);
  assert.deepEqual(kits["two-daggers"].lightAttack.damage, {
    dice: 1,
    sides: 4,
    modifier: 0,
    type: "piercing",
  });
  const complete = projectCreation(DICE, CHOICES);
  assert.deepEqual(complete.unfinished, {});
  assert.equal(complete.sheet.profile.lightAttack.mastery, "Nick");
  assert.throws(
    () => projectCreation(DICE, { ...CHOICES, kit: "plate" }),
    /starting kits/,
  );
});

test("the gate checks every kit at every recommended level, and one-hit kills with the strongest kit", () => {
  const result = gateAdventure(goblinBurrow, {
    seeds: Array.from({ length: 20 }, (_, seed) => seed),
  });
  const { survival, oneHitKill } = result.verdict;
  assert.deepEqual(
    survival.kits.map(({ kit, level }) => `${kit} ${level}`),
    [
      "mace 2",
      "two-daggers 2",
      "club-and-dagger 2",
      "mace 3",
      "two-daggers 3",
      "club-and-dagger 3",
    ],
  );
  const worst = Math.min(...survival.kits.map(({ rate }) => rate));
  assert.equal(survival.rate, worst);
  assert.deepEqual(
    survival.kits.find(({ rate }) => rate === worst),
    { kit: survival.kit, level: survival.level, rate: worst },
  );

  const [, strongest] = percentileCharacters({ percentiles: [5, 95] });
  for (const enemy of oneHitKill.enemies) {
    const statBlock = goblinBurrow.encounters
      .flatMap(({ opponents }) => opponents)
      .find(({ id }) => id === enemy.opponentId).statBlock;
    const chances = KITS.map((kit) =>
      oneHitKillChance(characterAtLevel(strongest.dice, 3, kit), statBlock),
    );
    assert.equal(enemy.chance, Math.max(...chances));
    assert.equal(enemy.chance, chances[KITS.indexOf(enemy.kit)]);
  }
});

test("the one-hit-kill chance counts Graze on a miss and a heavy weapon's disadvantage", () => {
  const wielding = (placement) =>
    validateCharacter({
      ...buildCharacter("a".repeat(32), "Ada", DICE, {
        ...CHOICES,
        placement: { ...CHOICES.placement, ...placement },
      }),
      equipment: ["greatsword"],
      weaponMasteries: ["greatsword", "dagger", "mace"],
    });
  // Str 16: the greatsword's +3 grazes a 3 HP enemy even on a miss.
  const strong = wielding({});
  const frail = { armorClass: 30, hitPoints: { average: 3 } };
  assert.ok(Math.abs(oneHitKillChance(strong, frail) - 1) < 1e-9);
  const unmastered = validateCharacter({
    ...strong,
    weaponMasteries: ["dagger", "mace", "shortsword"],
  });
  assert.ok(Math.abs(oneHitKillChance(unmastered, frail) - 1 / 20) < 1e-9);
  // Str 9: a natural 20 needs both d20s at disadvantage.
  const weak = wielding({ strength: 3, intelligence: 0 });
  assert.equal(weak.abilities.strength, 9);
  assert.ok(
    Math.abs(
      oneHitKillChance(weak, { armorClass: 30, hitPoints: { average: 1 } }) -
        1 / 400,
    ) < 1e-9,
  );
});
