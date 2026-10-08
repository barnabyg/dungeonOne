// #306: a level-1 Rogue. Creation makes a Rogue from its class data; its
// Expertise doubles a skill's proficiency bonus on a check; the encounter
// engine adds Sneak Attack once per turn to a hit with a Finesse or ranged
// weapon made with advantage; the AI DM can't add either; and the balance
// harness can build and play a Rogue.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { playAdventure, characterAtLevel } from "../dist/balance-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  characterProfile,
  classMasteryWeapons,
  CLASSES,
  defaultPlacement,
  levelUpChanges,
  masteryOptions,
  projectCreation,
  settleCharacter,
  validateCharacter,
} from "../dist/character-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import {
  abilityCheck,
  passivePerception,
  savingThrow,
} from "../dist/checks-5e.js";
import { act, startEncounter } from "../dist/encounter-5e.js";
import { kitPrice, KIT_VALUE_TOLERANCE } from "../dist/equipment-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  playerCombatant,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { libraryAt, TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";

const ID = "b".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const ROGUE_CHOICES = {
  ...ROGUE.defaults,
  placement: defaultPlacement(DICE, ROGUE),
};
const rogue = (choices = {}) =>
  buildCharacter(ID, "Vex", DICE, { ...ROGUE_CHOICES, ...choices }, "rogue");
const VEX = rogue();
/** `record` without `key`. */
const without = (record, key) =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));

test("a level-1 Rogue: d8 hit points, Dexterity and Intelligence saves, four skills, two with Expertise", () => {
  // The Rogue fills Dexterity, Constitution, Wisdom, Charisma, Intelligence,
  // then Strength from the highest roll; +2 Dexterity, +1 Constitution.
  assert.deepEqual(VEX.abilities, {
    strength: 8,
    dexterity: 17,
    constitution: 15,
    intelligence: 10,
    wisdom: 13,
    charisma: 12,
  });
  assert.equal(VEX.class, "rogue");
  assert.equal(VEX.fightingStyle, undefined);
  assert.deepEqual(VEX.expertise, ["perception", "stealth"]);
  const profile = characterProfile(VEX);
  assert.equal(profile.maxHp, 8 + 2);
  assert.equal(VEX.hp, 10);
  assert.equal(profile.proficiencyBonus, 2);
  assert.equal(profile.initiative, 3);
  // Leather: 11 + Dexterity 3.
  assert.equal(profile.armorClass, 14);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(profile.savingThrows).map(([ability, save]) => [
        ability,
        [save.bonus, save.proficient],
      ]),
    ),
    {
      strength: [-1, false],
      dexterity: [5, true],
      constitution: [2, false],
      intelligence: [2, true],
      wisdom: [1, false],
      charisma: [1, false],
    },
  );
  const skill = (id) => profile.skills.find((entry) => entry.id === id);
  // Expertise doubles the proficiency bonus: Stealth 3 + 4, Perception 1 + 4.
  assert.deepEqual(skill("stealth"), {
    id: "stealth",
    name: "Stealth",
    ability: "dexterity",
    bonus: 7,
    proficient: true,
    expertise: true,
  });
  assert.equal(skill("perception").bonus, 5);
  assert.equal(skill("perception").expertise, true);
  assert.equal(skill("athletics").bonus, 1);
  assert.equal(skill("athletics").expertise, undefined);
  assert.equal(skill("persuasion").bonus, 3);
  // The new skills, unproficient.
  assert.deepEqual(
    ["investigation", "sleight-of-hand", "deception"].map((id) => [
      skill(id).ability,
      skill(id).bonus,
      skill(id).proficient,
    ]),
    [
      ["intelligence", 0, false],
      ["dexterity", 3, false],
      ["charisma", 1, false],
    ],
  );
  assert.deepEqual(profile.tools, ["Thieves' Tools"]);
  assert.equal(profile.fightingStyle, undefined);
  assert.deepEqual(profile.sneakAttack, { dice: 1, sides: 6 });
  assert.deepEqual(
    profile.features.map(({ name }) => name),
    [
      "Expertise: Perception and Stealth",
      "Sneak Attack",
      "Thieves' Cant",
      "Weapon Mastery: Shortsword, Dagger",
    ],
  );
  assert.match(
    profile.features.find(({ id }) => id === "thieves-cant").text,
    /flavour only/u,
  );
  // The Fighter has neither tools nor Sneak Attack.
  assert.equal(characterProfile(TEST_FIGHTER).tools, undefined);
  assert.equal(characterProfile(TEST_FIGHTER).sneakAttack, undefined);
});

test("a Rogue attacks with a Finesse weapon by Dexterity, proficient with simple weapons and martial ones with Finesse or Light", () => {
  const profile = characterProfile(VEX);
  // Shortsword (martial, Finesse): Dexterity 3 + proficiency 2, Vex mastered.
  assert.deepEqual(
    [
      profile.attack.weapon,
      profile.attack.ability,
      profile.attack.bonus,
      profile.attack.damage,
      profile.attack.mastery,
    ],
    [
      "Shortsword",
      "dexterity",
      5,
      { dice: 1, sides: 6, modifier: 3, type: "piercing" },
      "Vex",
    ],
  );
  // The dagger's Light extra attack adds no modifier; Nick is mastered.
  assert.equal(profile.lightAttack.bonus, 5);
  assert.equal(profile.lightAttack.damage.modifier, 0);
  assert.equal(profile.lightAttack.mastery, "Nick");
  const wielding = (equipment) =>
    characterProfile(validateCharacter({ ...VEX, equipment })).attack;
  // A longsword is martial without Finesse or Light: no proficiency.
  assert.equal(wielding(["leather", "longsword"]).bonus, -1);
  // A shortbow is simple: Dexterity and proficiency.
  assert.equal(wielding(["leather", "shortbow"]).bonus, 5);
  // Only weapons it is proficient with can be mastered.
  assert.deepEqual(classMasteryWeapons(ROGUE), [
    "dagger",
    "mace",
    "shortsword",
    "shortbow",
  ]);
  assert.deepEqual(masteryOptions(VEX), ["mace", "shortbow"]);
  assert.throws(
    () => rogue({ masteries: ["shortsword", "longsword"] }),
    /Choose 2 different kinds of weapon to master/u,
  );
  // The playerCombatant marks the Finesse weapons and carries Sneak Attack.
  const self = playerCombatant(VEX);
  assert.equal(self.attack.finesse, true);
  assert.equal(self.lightAttack.finesse, true);
  assert.deepEqual(self.sneakAttack, { dice: 1, sides: 6 });
  assert.equal(playerCombatant(TEST_FIGHTER).sneakAttack, undefined);
});

test("Rogue creation is refused outside its class's choices", () => {
  assert.throws(
    () => rogue({ fightingStyle: "defense" }),
    /A Rogue has no Fighting Style/u,
  );
  assert.throws(
    () => rogue({ expertise: ["perception"] }),
    /Choose 2 of your skill proficiencies for Expertise/u,
  );
  // Expertise only in a skill it is proficient in.
  assert.throws(
    () => rogue({ expertise: ["perception", "investigation"] }),
    /for Expertise/u,
  );
  assert.throws(
    () => rogue({ skills: ["perception", "stealth", "athletics"] }),
    /Choose 4 different Rogue skill proficiencies/u,
  );
  // History is a Fighter's skill, not a Rogue's.
  assert.throws(
    () => rogue({ skills: ["perception", "stealth", "athletics", "history"] }),
    /Rogue skill proficiencies/u,
  );
  assert.throws(() => rogue({ kit: "mace" }), /starting kits/u);
  // A Fighter has no Expertise, and a sheet is checked the same way.
  assert.throws(
    () =>
      validateCharacter({
        ...TEST_FIGHTER,
        expertise: ["athletics", "perception"],
      }),
    /A Fighter has no Expertise/u,
  );
  assert.throws(
    () => validateCharacter({ ...VEX, expertise: ["stealth", "stealth"] }),
    /for Expertise/u,
  );
  const withoutExpertise = without(VEX, "expertise");
  assert.throws(() => validateCharacter(withoutExpertise), /for Expertise/u);
  assert.throws(
    () => validateCharacter({ ...VEX, fightingStyle: "defense" }),
    /A Rogue has no Fighting Style/u,
  );
});

test("the Rogue's starting kits are of equal value with each other, and richer than the Fighter's by design", () => {
  assert.deepEqual(ROGUE.kits, ["shortsword-and-dagger", "shortsword"]);
  assert.equal(kitPrice("shortsword"), 2000);
  assert.equal(kitPrice("shortsword-and-dagger"), 2200);
  assert.ok(
    Math.abs(kitPrice("shortsword") - kitPrice("shortsword-and-dagger")) <=
      KIT_VALUE_TOLERANCE,
  );
  assert.ok(kitPrice("shortsword") > kitPrice("mace") + KIT_VALUE_TOLERANCE);
});

test("the creation projection offers the Rogue's kits and Expertise, and no Fighting Style", () => {
  const unchosen = without(ROGUE_CHOICES, "expertise");
  const partial = projectCreation(
    DICE,
    { ...unchosen, expertise: ["stealth"] },
    "rogue",
  );
  assert.deepEqual(partial.expertise, { chosen: 1, limit: 2, full: false });
  assert.equal(
    partial.unfinished.expertise,
    "Choose 2 skills for Expertise; 1 chosen.",
  );
  assert.equal(partial.sheet, undefined);
  assert.deepEqual(partial.fightingStyles, []);
  assert.deepEqual(
    partial.kits.map(({ id, value }) => [id, value]),
    [
      ["shortsword-and-dagger", "22 gp"],
      ["shortsword", "20 gp"],
    ],
  );
  const done = projectCreation(DICE, ROGUE_CHOICES, "rogue");
  assert.deepEqual(done.unfinished, {});
  assert.deepEqual(done.sheet.profile, characterProfile(VEX));
  // The Fighter's projection is as before: no Expertise.
  assert.equal(
    projectCreation(
      DICE,
      { ...CLASSES.fighter.defaults, placement: defaultPlacement(DICE) },
      "fighter",
    ).expertise,
    undefined,
  );
});

test("a Rogue that levels up gains its hit points and Sneak Attack dice; its later features come later", () => {
  const raised = settleCharacter(VEX, {
    possessions: {
      equipment: VEX.equipment,
      stowed: [],
      ammunition: VEX.ammunition,
      treasure: [],
      purse: 0,
    },
    xp: [{ id: "test/ending/won", name: "Won", xp: 900 }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });
  assert.equal(raised.level, 3);
  const profile = characterProfile(raised);
  // 8 + 2, then 5 + 2 for each of two levels.
  assert.equal(profile.maxHp, 24);
  assert.deepEqual(profile.sneakAttack, { dice: 2, sides: 6 });
  const changes = levelUpChanges(VEX, raised);
  assert.deepEqual(changes.features, []);
  assert.equal(changes.secondWind, undefined);
  assert.deepEqual(changes.choices, []);
});

test("Expertise doubles the proficiency bonus on a check, and on passive Perception", () => {
  const stealth = abilityCheck(
    VEX,
    { skill: "stealth", dc: 15 },
    dice([20, 9]),
  );
  assert.deepEqual(
    [stealth.modifier, stealth.proficiency, stealth.expertise, stealth.total],
    [3, 4, true, 16],
  );
  // A proficient skill without Expertise adds the bonus once.
  const athletics = abilityCheck(
    VEX,
    { skill: "athletics", dc: 15 },
    dice([20, 9]),
  );
  assert.deepEqual(
    [athletics.proficiency, athletics.expertise, athletics.total],
    [2, undefined, 10],
  );
  // 10 + Wisdom 1 + twice the proficiency bonus.
  const perception = passivePerception(VEX);
  assert.deepEqual(
    [perception.total, perception.proficiency, perception.expertise],
    [15, 4, true],
  );
  assert.equal(passivePerception(TEST_FIGHTER).expertise, undefined);
});

// The encounter engine's Sneak Attack, with scripted dice.
const SHORTSWORD = {
  name: "Shortsword",
  bonus: 5,
  damage: { dice: 1, sides: 6, modifier: 3, type: "piercing" },
  criticalRange: 20,
  mastery: "Vex",
  finesse: true,
};
const thief = {
  id: "pc",
  name: "Vex",
  side: "party",
  armorClass: 14,
  hp: 10,
  maxHp: 10,
  dexterity: 17,
  initiativeBonus: 3,
  saves: {
    strength: -1,
    dexterity: 5,
    constitution: 2,
    intelligence: 2,
    wisdom: 1,
    charisma: 1,
  },
  attack: SHORTSWORD,
  lightAttack: {
    name: "Dagger",
    bonus: 5,
    damage: { dice: 1, sides: 4, modifier: 0, type: "piercing" },
    criticalRange: 20,
    mastery: "Nick",
    finesse: true,
  },
  sneakAttack: { dice: 1, sides: 6 },
};
const ogre = {
  id: "ogre",
  name: "Ogre",
  side: "opponents",
  armorClass: 11,
  hp: 59,
  maxHp: 59,
  dexterity: 8,
  initiativeBonus: -1,
  saves: {
    strength: 4,
    dexterity: -1,
    constitution: 3,
    intelligence: -3,
    wisdom: -2,
    charisma: -2,
  },
  attack: {
    name: "Greatclub",
    bonus: 6,
    damage: { dice: 2, sides: 8, modifier: 4, type: "bludgeoning" },
    criticalRange: 20,
  },
};
/** A fight with the thief to act first, the ogre prone (advantage on it). */
function fightWith(self = thief, prone = true) {
  const { state } = startEncounter([self, ogre], dice([20, 15], [20, 2]));
  return prone
    ? {
        ...state,
        conditions: [
          {
            kind: "prone",
            targetId: "ogre",
            sourceId: "pc",
            source: "Trip",
            turnsLeft: 1,
          },
        ],
      }
    : state;
}
const ATTACK = { type: "attack", actorId: "pc", targetId: "ogre" };
const LIGHT = { type: "light-attack", actorId: "pc", targetId: "ogre" };
const attackEvent = (result) =>
  result.events.find(({ type }) => type === "attack");

test("Sneak Attack: a hit with a Finesse weapon at advantage deals its dice of the weapon's type", () => {
  const random = dice([20, 12], [20, 4], [6, 4], [6, 5]);
  const result = act(fightWith(), ATTACK, random);
  const hit = attackEvent(result);
  assert.deepEqual(hit.mode.advantage, ["target prone"]);
  assert.equal(hit.d20, 12);
  assert.deepEqual(hit.damageRolls, [4]);
  assert.deepEqual(hit.sneakAttack, { damageRolls: [5] });
  assert.equal(hit.damage, 4 + 3 + 5);
  assert.equal(hit.damageType, "piercing");
  assert.equal(hit.hpAfter, 59 - 12);
  assert.equal(result.state.economy.sneakAttack, false);
  assert.equal(random.remaining(), 0);
});

test("Sneak Attack: only once per turn, and again on the next turn", () => {
  const random = dice([20, 12], [20, 4], [6, 4], [6, 5]);
  const first = act(fightWith(), ATTACK, random);
  // The dagger's Nick attack hits at advantage too, but deals no more. With
  // nothing left to do the turn ends; the prone ogre misses at disadvantage
  // and stands, and on the thief's next turn Sneak Attack is back.
  const nick = act(
    first.state,
    LIGHT,
    dice([20, 14], [20, 2], [4, 3], [20, 2], [20, 3]),
  );
  const second = attackEvent(nick);
  assert.equal(second.hit, true);
  assert.equal(second.sneakAttack, undefined);
  assert.equal(second.damage, 3);
  assert.equal(nick.state.round, 2);
  assert.equal(nick.state.order[nick.state.turn].combatantId, "pc");
  assert.equal(nick.state.economy.sneakAttack, true);
});

test("Sneak Attack: not with a weapon that is neither Finesse nor ranged; a ranged one qualifies", () => {
  const plain = without(SHORTSWORD, "finesse");
  const mace = { ...thief, attack: { ...plain, name: "Mace" } };
  const result = act(fightWith(mace), ATTACK, dice([20, 12], [20, 4], [6, 4]));
  assert.equal(attackEvent(result).hit, true);
  assert.equal(attackEvent(result).sneakAttack, undefined);
  assert.equal(result.state.economy.sneakAttack, true);
  // SRD 5.2: a ranged weapon qualifies as well as a Finesse one.
  const archer = {
    ...thief,
    attack: { ...plain, name: "Shortbow", ammunition: "arrows" },
    ammunition: { arrows: 20, bolts: 0 },
  };
  const shot = act(
    fightWith(archer),
    ATTACK,
    dice([20, 12], [20, 4], [6, 4], [6, 6]),
  );
  assert.deepEqual(attackEvent(shot).sneakAttack, { damageRolls: [6] });
});

test("Sneak Attack: only with advantage; advantage and disadvantage together cancel it", () => {
  const level = act(fightWith(thief, false), ATTACK, dice([20, 12], [6, 4]));
  assert.equal(attackEvent(level).hit, true);
  assert.equal(attackEvent(level).sneakAttack, undefined);
  const poisoned = {
    ...fightWith(),
    conditions: [
      ...fightWith().conditions,
      {
        kind: "poisoned",
        targetId: "pc",
        sourceId: "ogre",
        source: "Spoiled meat",
        turnsLeft: 2,
      },
    ],
  };
  const cancelled = act(poisoned, ATTACK, dice([20, 12], [6, 4]));
  assert.deepEqual(attackEvent(cancelled).mode.disadvantage, ["Poisoned"]);
  assert.equal(attackEvent(cancelled).hit, true);
  assert.equal(attackEvent(cancelled).sneakAttack, undefined);
});

test("Sneak Attack: none on a miss, and still to come that turn", () => {
  const random = dice([20, 3], [20, 1]);
  const result = act(fightWith(), ATTACK, random);
  assert.equal(attackEvent(result).hit, false);
  assert.equal(attackEvent(result).sneakAttack, undefined);
  assert.equal(random.remaining(), 0);
  // The Nick attack that follows can still deal it.
  const nick = act(
    result.state,
    LIGHT,
    dice([20, 14], [20, 2], [4, 3], [6, 2], [20, 2], [20, 3]),
  );
  assert.deepEqual(attackEvent(nick).sneakAttack, { damageRolls: [2] });
});

test("Sneak Attack: a critical hit doubles its dice", () => {
  const random = dice([20, 20], [20, 4], [6, 1], [6, 2], [6, 3], [6, 4]);
  const hit = attackEvent(act(fightWith(), ATTACK, random));
  assert.equal(hit.critical, true);
  assert.deepEqual(hit.damageRolls, [1, 2]);
  assert.deepEqual(hit.sneakAttack, { damageRolls: [3, 4] });
  assert.equal(hit.damage, 1 + 2 + 3 + 3 + 4);
});

test("a combatant without Sneak Attack never deals it", () => {
  const fighter = without(thief, "sneakAttack");
  const hit = attackEvent(
    act(fightWith(fighter), ATTACK, dice([20, 12], [20, 4], [6, 4])),
  );
  assert.equal(hit.hit, true);
  assert.equal(hit.sneakAttack, undefined);
});

test("the result card names the Sneak Attack dice", () => {
  const runtime = createFifthRuntime(ratTunnels, VEX);
  // Seeds until a hit with Sneak Attack lands in the cellar's fight.
  for (let seed = 0; seed < 400; seed++) {
    const session = FifthSession.begin(seed, ratTunnels, VEX);
    session.act({ type: "move", destinationId: "rat-cellar" }, "click");
    while (
      session.state.status === "playing" &&
      session.state.encounter?.outcome === "ongoing"
    ) {
      const [target] = runtime.attackTargets(session.state);
      const { result, rolls } = session.act(
        target === undefined
          ? { type: "end-turn", actorId: "pc" }
          : { type: "attack", actorId: "pc", targetId: target.id },
        "click",
      );
      const line = session
        .card(result, rolls)
        .lines.find(({ text }) => text.includes("Sneak Attack"));
      if (line !== undefined) {
        assert.match(
          line.text,
          /^Vex attacks Giant Rat with Shortsword, at advantage \(Vex\): \d+ and \d+, keeping \d+; \d+ \+ 5 = \d+ against AC 13\. (Hit|Critical hit!)\.? Damage [\d +]+ \+ 3 \+ Sneak Attack [\d +]+ = \d+ piercing; Giant Rat has \d+\/\d+ HP\./u,
        );
        const damage = line.rolls.find(({ purpose }) => purpose === "damage");
        assert.ok(damage.dice.some(({ sneakAttack }) => sneakAttack === true));
        return;
      }
    }
  }
  assert.fail("no seed below 400 lands a Sneak Attack");
});

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, text) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});

/** A session with Vex in the cellar's fight, on her turn. */
function inTheCellar() {
  const session = FifthSession.begin(1, ratTunnels, VEX);
  session.act({ type: "move", destinationId: "rat-cellar" }, "click");
  assert.equal(session.state.encounter.outcome, "ongoing");
  return session;
}

test("scripted DM: the DM can't add Sneak Attack or Expertise itself", async () => {
  for (const [name, argumentsJson] of [
    ["attack", '{"target":"giant-rat","sneakAttack":true}'],
    ["attack", '{"target":"giant-rat","advantage":true}'],
    ["sneak_attack", '{"target":"giant-rat"}'],
    ["expertise", '{"skill":"stealth"}'],
  ]) {
    const session = inTheCellar();
    const before = session.state;
    const { turn } = await session.converse(
      "I stab it in the back for sneak attack damage, with expertise!",
      scriptedDm(name, argumentsJson, "Sneak Attack!"),
    );
    assert.equal(session.state, before, `${name} ${argumentsJson}`);
    assert.equal(turn.toolAttempts[0].disposition.executed, false, name);
  }
  // No tool takes either; the prompt and the attack tool say the engine
  // applies them.
  const session = inTheCellar();
  const runtime = createFifthRuntime(ratTunnels, VEX);
  const tools = runtime.getGameToolDefinitions(session.state);
  assert.ok(
    tools.every(
      ({ name, parameters }) =>
        !/sneak_attack|expertise/u.test(name) &&
        !Object.keys(parameters.properties).some((key) =>
          /sneak|expertise|advantage/iu.test(key),
        ),
    ),
  );
  const attack = tools.find(({ name }) => name === "attack");
  assert.match(attack.description, /adds Sneak Attack's 1d6/u);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /applied by the engine alone/u);
  // A Fighter's attack tool says nothing of it.
  const fighting = FifthSession.begin(1, ratTunnels, TEST_FIGHTER);
  fighting.act({ type: "move", destinationId: "rat-cellar" }, "click");
  const fighterAttack = createFifthRuntime(ratTunnels, TEST_FIGHTER)
    .getGameToolDefinitions(fighting.state)
    .find(({ name }) => name === "attack");
  assert.doesNotMatch(fighterAttack.description, /Sneak Attack/u);
});

test('scripted DM: "I sneak attack it" calls attack, and the status describes the class features', async () => {
  const session = inTheCellar();
  const { turn } = await session.converse(
    "I sneak attack the rat.",
    scriptedDm("attack", '{"target":"giant-rat"}', "Unreachable."),
  );
  assert.equal(turn.toolAttempts[0].disposition.executed, true);
  const status = await session.converse(
    "What can I do?",
    scriptedDm("get_character_status", "{}", "You are a Rogue."),
  );
  const text = JSON.stringify(status.turn);
  assert.match(text, /Level 1 Rogue\./u);
  assert.match(text, /Sneak Attack: Once per turn/u);
  assert.match(text, /Expertise: Perception and Stealth/u);
});

test("the balance harness builds a level-1 Rogue and plays it, Sneak Attack and all", () => {
  const sheet = characterAtLevel(DICE, 1, undefined, false, undefined, "rogue");
  assert.equal(sheet.class, "rogue");
  // Its mastery choice is the class's: the shortsword and the dagger.
  assert.deepEqual(sheet.weaponMasteries, ["shortsword", "dagger"]);
  assert.deepEqual(sheet.expertise, ["perception", "stealth"]);
  assert.deepEqual(
    characterAtLevel(DICE, 1, "shortsword", false, undefined, "rogue")
      .equipment,
    ["leather", "shortsword"],
  );
  // Every event the harness's runs see, through the real runtime.
  const runtime = createFifthRuntime(ratTunnels, sheet);
  let sneakAttacks = 0;
  const watched = {
    ...runtime,
    handleAction(state, action, random) {
      const result = runtime.handleAction(state, action, random);
      sneakAttacks += (result.events ?? []).filter(
        (event) => event.type === "attack" && event.sneakAttack !== undefined,
      ).length;
      return result;
    },
  };
  const runs = Array.from({ length: 20 }, (_, seed) =>
    playAdventure(watched, "cautious", seed),
  );
  assert.ok(runs.some(({ outcome }) => outcome === "victory"));
  assert.ok(sneakAttacks > 0, "a run lands a Sneak Attack");
});

test("the library, save and trace formats bump; a format-13 library is refused by name", async () => {
  assert.equal(FIFTH_LIBRARY_FORMAT, 14);
  assert.equal(FIFTH_SESSION_FORMAT, 32);
  assert.equal(FIFTH_TRACE_FORMAT, 26);
  const directory = await mkdtemp(join(tmpdir(), "issue-306-"));
  try {
    const path = join(directory, "characters.json");
    const older = JSON.stringify({ ...libraryAt(1), formatVersion: 13 });
    await writeFile(path, older);
    await assert.rejects(
      new FifthCharacterLibrary(path).read(),
      (error) =>
        error.message.includes(path) &&
        /earlier build \(format version 13\)/u.test(error.message) &&
        /[Mm]ove it aside/u.test(error.message),
    );
    assert.equal(await readFile(path, "utf8"), older);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the library creates a Rogue from the pending dice and stores its Expertise", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-306-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const choices = {
      ...ROGUE.defaults,
      placement: defaultPlacement(started.pendingCreation.dice, ROGUE),
    };
    const data = await library.create(
      "Vex",
      choices,
      started.revision,
      "rogue",
    );
    const [{ sheet }] = data.characters;
    assert.equal(sheet.class, "rogue");
    assert.deepEqual(sheet.expertise, ["perception", "stealth"]);
    assert.equal(Object.hasOwn(sheet, "fightingStyle"), false);
    const stored = JSON.parse(
      await readFile(join(directory, "characters.json"), "utf8"),
    );
    assert.deepEqual(stored.characters[0].sheet, sheet);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/** POSTs `body` as JSON to the browser server at `url`. */
async function post(url, path, body) {
  const response = await fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("the API offers both classes and creates a Rogue; another class's choices are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-306-api-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 3,
    adventures: [ratTunnels],
    qualifies: () => true,
  });
  try {
    const started = await post(server.url, "/api/5e/creation", {});
    assert.equal(started.status, 200);
    const { classes, pendingCreation, revision } = started.body;
    assert.deepEqual(
      classes.map(({ id, name, skillCount, expertiseCount, fightingStyle }) => [
        id,
        name,
        skillCount,
        expertiseCount,
        fightingStyle,
      ]),
      [
        ["fighter", "Fighter", 2, 0, true],
        ["rogue", "Rogue", 4, 2, false],
      ],
    );
    const rogueEntry = classes.find(({ id }) => id === "rogue");
    assert.deepEqual(
      rogueEntry.masteryWeapons.map(({ id }) => id),
      ["dagger", "mace", "shortsword", "shortbow"],
    );
    const choices = {
      class: "rogue",
      placement: pendingCreation.defaultPlacements.rogue,
      ...rogueEntry.defaults,
    };
    const refused = [
      { ...choices, class: "wizard" },
      { ...choices, fightingStyle: "defense" },
      { ...choices, class: "fighter" },
      { ...choices, cunning: true },
    ];
    for (const body of refused) {
      const result = await post(server.url, "/api/5e/characters", {
        revision,
        name: "Vex",
        ...body,
      });
      assert.equal(result.status, 409, JSON.stringify(body));
    }
    const preview = await post(server.url, "/api/5e/creation/preview", choices);
    assert.deepEqual(preview.body.unfinished, {});
    assert.deepEqual(preview.body.sheet.profile.sneakAttack, {
      dice: 1,
      sides: 6,
    });
    const created = await post(server.url, "/api/5e/characters", {
      revision,
      name: "Vex",
      ...choices,
    });
    assert.equal(created.status, 200);
    const [entry] = created.body.characters;
    assert.equal(entry.className, "Rogue");
    assert.equal(entry.sheet.class, "rogue");
    const stored = JSON.parse(await readFile(libraryPath, "utf8"));
    assert.deepEqual(stored.characters[0].sheet, entry.sheet);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

// SRD 5.2 armour training (owner decision, 8 October 2026): body armour
// without training gives disadvantage on every D20 Test with Strength or
// Dexterity, and a shield without training gives no AC.
const UNTRAINED = ["Chain mail (untrained)"];
const inChainMail = validateCharacter({
  ...VEX,
  equipment: ["chain-mail", "shortsword"],
});
const fighterInChainMail = validateCharacter({
  ...TEST_FIGHTER,
  equipment: ["chain-mail", "longsword"],
});

test("untrained armour: a Rogue in chain mail attacks with disadvantage, and the profile names it", () => {
  const profile = characterProfile(inChainMail);
  assert.equal(profile.untrainedArmour, "Chain mail");
  assert.deepEqual(profile.attack.disadvantage, UNTRAINED);
  // Chain mail's AC is untouched: 16, no Dexterity.
  assert.equal(profile.armorClass, 16);
  const self = playerCombatant(inChainMail);
  assert.deepEqual(self.attack.disadvantage, UNTRAINED);
  // Vex rolls initiative first: two d20s for the armour, keeping 19.
  const { state } = startEncounter(
    [self, ogre],
    dice([20, 20], [20, 19], [20, 2]),
  );
  // The miss ends Vex's turn; the ogre then misses on a 1.
  const attack = attackEvent(
    act(state, ATTACK, dice([20, 15], [20, 4], [20, 1])),
  );
  assert.deepEqual(attack.mode, {
    d20s: [15, 4],
    advantage: [],
    disadvantage: UNTRAINED,
  });
  assert.equal(attack.d20, 4);
  assert.equal(attack.hit, false);
});

test("untrained armour: Strength and Dexterity checks and saves have disadvantage, others don't", () => {
  const check = (skill) =>
    abilityCheck(inChainMail, { skill, dc: 10 }, dice([20, 15], [20, 4]));
  for (const skill of [
    "stealth",
    "athletics",
    "acrobatics",
    "sleight-of-hand",
  ]) {
    const roll = check(skill);
    assert.deepEqual(roll.mode?.disadvantage, UNTRAINED, skill);
    assert.equal(roll.d20, 4, skill);
  }
  // A plain Strength check too; a Charisma skill rolls one d20.
  assert.deepEqual(
    abilityCheck(
      inChainMail,
      { ability: "strength", dc: 10 },
      dice([20, 15], [20, 4]),
    ).mode?.disadvantage,
    UNTRAINED,
  );
  const persuasion = abilityCheck(
    inChainMail,
    { skill: "persuasion", dc: 10 },
    dice([20, 15]),
  );
  assert.equal(persuasion.mode, undefined);
  assert.equal(persuasion.d20, 15);
  const dexterity = savingThrow(
    inChainMail,
    "dexterity",
    12,
    dice([20, 15], [20, 4]),
  );
  assert.deepEqual(dexterity.mode?.disadvantage, UNTRAINED);
  assert.equal(dexterity.d20, 4);
  const wisdom = savingThrow(inChainMail, "wisdom", 12, dice([20, 15]));
  assert.equal(wisdom.mode, undefined);
  // Leather is light armour, which the Rogue is trained with.
  assert.equal(
    abilityCheck(VEX, { skill: "stealth", dc: 10 }, dice([20, 15])).mode,
    undefined,
  );
});

test("untrained armour: initiative and a Strength save in a fight have disadvantage", () => {
  const self = playerCombatant(inChainMail);
  assert.deepEqual(self.abilityDisadvantages, {
    strength: UNTRAINED,
    dexterity: UNTRAINED,
  });
  const wolf = {
    ...ogre,
    id: "wolf",
    name: "Wolf",
    dexterity: 15,
    initiativeBonus: 2,
    attack: {
      name: "Bite",
      bonus: 4,
      damage: { dice: 1, sides: 6, modifier: 2, type: "piercing" },
      criticalRange: 20,
      rider: {
        condition: { kind: "prone", save: { ability: "strength", dc: 11 } },
      },
    },
  };
  // Vex keeps the lower of 15 and 5; the wolf goes first, bites (19 hits
  // AC 16) and Vex saves with two d20s, keeping 3.
  const { events } = startEncounter(
    [self, wolf],
    dice([20, 15], [20, 5], [20, 18], [20, 15], [6, 2], [20, 12], [20, 3]),
  );
  const initiative = events.find(({ type }) => type === "initiative");
  const vex = initiative.order.find(({ combatantId }) => combatantId === "pc");
  assert.deepEqual(vex.mode, {
    d20s: [15, 5],
    advantage: [],
    disadvantage: UNTRAINED,
  });
  assert.equal(vex.d20, 5);
  const save = events.find(({ type }) => type === "save");
  assert.deepEqual(
    [save.ability, save.d20, save.mode, save.success],
    [
      "strength",
      3,
      { d20s: [12, 3], advantage: [], disadvantage: UNTRAINED },
      false,
    ],
  );
});

test("untrained shield: a Rogue's shield adds no AC", () => {
  const shielded = characterProfile(
    validateCharacter({
      ...VEX,
      equipment: ["leather", "shortsword", "shield"],
    }),
  );
  assert.equal(shielded.armorClass, characterProfile(VEX).armorClass);
  assert.equal(shielded.untrainedShield, true);
  assert.equal(shielded.untrainedArmour, undefined);
  // Leather is trained: no disadvantage from it.
  assert.deepEqual(shielded.attack.disadvantage, []);
  // A Fighter's shield adds 2.
  const fighter = (equipment) =>
    characterProfile(validateCharacter({ ...TEST_FIGHTER, equipment }));
  const withShield = fighter(["leather", "mace", "shield"]);
  assert.equal(
    withShield.armorClass,
    fighter(["leather", "mace"]).armorClass + 2,
  );
  assert.equal(withShield.untrainedShield, undefined);
});

test("trained armour: a Fighter in chain mail rolls one d20 everywhere", () => {
  const profile = characterProfile(fighterInChainMail);
  assert.equal(profile.untrainedArmour, undefined);
  assert.deepEqual(profile.attack.disadvantage, []);
  const self = playerCombatant(fighterInChainMail);
  assert.equal(self.abilityDisadvantages, undefined);
  for (const skill of ["athletics", "acrobatics"]) {
    assert.equal(
      abilityCheck(fighterInChainMail, { skill, dc: 10 }, dice([20, 15])).mode,
      undefined,
    );
  }
  assert.equal(
    savingThrow(fighterInChainMail, "strength", 12, dice([20, 15])).mode,
    undefined,
  );
  const { events } = startEncounter([self, ogre], dice([20, 15], [20, 2]));
  assert.equal(
    events.find(({ type }) => type === "initiative").order[0].mode,
    undefined,
  );
});

test("donning untrained armour or a shield says what it costs, in the result and the status", () => {
  const sheet = validateCharacter({
    ...VEX,
    equipment: ["leather", "shortsword"],
    stowed: ["chain-mail", "shield"],
  });
  const runtime = createFifthRuntime(ratTunnels, sheet);
  let state = runtime.handleAction(runtime.createSession(), {
    type: "begin",
  }).state;
  const shield = runtime.handleAction(state, {
    type: "equip",
    itemId: "shield",
  });
  assert.match(
    renderFifthResult(shield),
    /You are not trained with shields: it adds no AC\. AC 14;/u,
  );
  state = shield.state;
  const mail = runtime.handleAction(state, {
    type: "equip",
    itemId: "chain-mail",
  });
  assert.match(
    renderFifthResult(mail),
    /You are not trained with chain mail: disadvantage on Strength and Dexterity rolls\./u,
  );
  const gear = runtime.projectRoom(mail.state).gear;
  assert.equal(gear.untrainedArmour, "Chain mail");
  assert.equal(gear.untrainedShield, true);
});
