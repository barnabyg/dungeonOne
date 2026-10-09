// #307: the Rogue at levels 2 and 3. Cunning Action's Hide (a bonus-action
// Stealth check against the opponents' best passive Perception, advantage on
// the next attack), Steady Aim (a bonus action for advantage on the next
// attack this turn), Sneak Attack 2d6, and the Thief: Fast Hands (a second
// object interaction with the bonus action) and Second-Story Work (Dexterity
// for a climb or jump a module marks). The AI DM calls hide and steady_aim;
// the balance harness plays both.
import assert from "node:assert/strict";
import test from "node:test";

import { characterAtLevel, playAdventure } from "../dist/balance-5e.js";
import {
  buildCharacter,
  characterProfile,
  defaultPlacement,
  levelForXp,
  levelUpChanges,
  validateCharacter,
} from "../dist/character-5e.js";
import { abilityCheck } from "../dist/checks-5e.js";
import { act, availableActions, startEncounter } from "../dist/encounter-5e.js";
import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  playerCombatant,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  goblinTrio,
  moduleFile,
  ratTunnels,
  room,
} from "./fixtures/modules.mjs";

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
const VEX = buildCharacter(
  ID,
  "Vex",
  DICE,
  { ...ROGUE.defaults, placement: defaultPlacement(DICE, ROGUE) },
  "rogue",
);

/** Vex raised to `xp`'s level, at full health. */
function raised(xp) {
  const sheet = { ...VEX, xp, level: levelForXp(xp) };
  return validateCharacter({ ...sheet, hp: characterProfile(sheet).maxHp });
}
const LEVEL_2 = raised(300);
const LEVEL_3 = raised(900);

const names = (features) => features.map(({ name }) => name);

test("table: a level-2 Rogue gains Cunning Action (Hide), and keeps 1d6 Sneak Attack", () => {
  assert.equal(LEVEL_2.level, 2);
  const profile = characterProfile(LEVEL_2);
  // 8 + 2, then 5 + 2.
  assert.equal(profile.maxHp, 17);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.sneakAttack, { dice: 1, sides: 6 });
  assert.equal(profile.cunningAction, true);
  assert.equal(profile.steadyAim, undefined);
  assert.equal(profile.fastHands, undefined);
  assert.equal(profile.secondStoryWork, undefined);
  assert.deepEqual(names(profile.features), [
    "Expertise: Perception and Stealth",
    "Sneak Attack",
    "Thieves' Cant",
    "Weapon Mastery: Shortsword, Dagger",
    "Cunning Action",
  ]);
  const cunning = profile.features.find(({ id }) => id === "cunning-action");
  assert.match(cunning.text, /^Bonus action: Hide\./u);
  assert.match(cunning.text, /best passive Perception/u);
  assert.match(cunning.text, /Dash and Disengage need positions/u);
  // The level-up card names the new feature; Sneak Attack holds at 1d6.
  const up = levelUpChanges(VEX, LEVEL_2);
  assert.deepEqual(names(up.features), ["Cunning Action"]);
  assert.equal(up.sneakAttack, undefined);
  assert.equal(up.secondWind, undefined);
  assert.deepEqual(up.choices, []);
  // As a combatant: Hide with its Stealth (Dexterity 3, Expertise 2 × 2).
  const self = playerCombatant(LEVEL_2);
  assert.deepEqual(self.hide, { modifier: 3, proficiency: 4, expertise: true });
  assert.equal(self.steadyAim, undefined);
  assert.equal(self.fastHands, undefined);
});

test("table: a level-3 Rogue gains Steady Aim, 2d6 Sneak Attack and the Thief's Fast Hands and Second-Story Work", () => {
  assert.equal(LEVEL_3.level, 3);
  const profile = characterProfile(LEVEL_3);
  assert.equal(profile.maxHp, 24);
  assert.deepEqual(profile.sneakAttack, { dice: 2, sides: 6 });
  assert.deepEqual(
    [
      profile.cunningAction,
      profile.steadyAim,
      profile.fastHands,
      profile.secondStoryWork,
    ],
    [true, true, true, true],
  );
  assert.deepEqual(names(profile.features), [
    "Expertise: Perception and Stealth",
    "Sneak Attack",
    "Thieves' Cant",
    "Weapon Mastery: Shortsword, Dagger",
    "Cunning Action",
    "Steady Aim",
    "Thief: Fast Hands",
    "Thief: Second-Story Work",
  ]);
  const text = (id) => profile.features.find((entry) => entry.id === id).text;
  assert.match(
    text("sneak-attack"),
    /you deal an extra 2d6 damage of the weapon's type/u,
  );
  assert.match(text("steady-aim"), /^Bonus action/u);
  assert.match(text("steady-aim"), /always not moved/u);
  assert.match(text("fast-hands"), /bonus action can use an object/u);
  assert.match(text("second-story-work"), /Dexterity in place of Strength/u);
  // Each level-up card names that level's features, and the Sneak Attack
  // dice when they grow.
  const up = levelUpChanges(LEVEL_2, LEVEL_3);
  assert.deepEqual(names(up.features), [
    "Steady Aim",
    "Thief: Fast Hands",
    "Thief: Second-Story Work",
  ]);
  assert.deepEqual(up.sneakAttack, { before: 1, after: 2 });
  const self = playerCombatant(LEVEL_3);
  assert.equal(self.steadyAim, true);
  assert.equal(self.fastHands, true);
  assert.deepEqual(self.sneakAttack, { dice: 2, sides: 6 });
  // A level-1 Rogue and a Fighter have none of them.
  for (const sheet of [VEX, testFighterAt(3)]) {
    const { hide, steadyAim, fastHands } = playerCombatant(sheet);
    assert.deepEqual(
      [hide, steadyAim, fastHands],
      [undefined, undefined, undefined],
    );
  }
});

// The encounter engine's Hide and Steady Aim, with scripted dice.
const SHORTSWORD = {
  name: "Shortsword",
  bonus: 5,
  damage: { dice: 1, sides: 6, modifier: 3, type: "piercing" },
  criticalRange: 20,
  finesse: true,
};
const DAGGER = {
  name: "Dagger",
  bonus: 5,
  damage: { dice: 1, sides: 4, modifier: 0, type: "piercing" },
  criticalRange: 20,
  mastery: "Nick",
  finesse: true,
};
const SAVES = {
  strength: 0,
  dexterity: 0,
  constitution: 0,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};
const thief = {
  id: "pc",
  name: "Vex",
  side: "party",
  armorClass: 14,
  hp: 24,
  maxHp: 24,
  dexterity: 17,
  initiativeBonus: 3,
  saves: SAVES,
  attack: SHORTSWORD,
  lightAttack: DAGGER,
  sneakAttack: { dice: 2, sides: 6 },
  hide: { modifier: 3, proficiency: 4, expertise: true },
  steadyAim: true,
  fastHands: true,
};
const foe = (id, name, passivePerception) => ({
  id,
  name,
  side: "opponents",
  armorClass: 11,
  hp: 59,
  maxHp: 59,
  dexterity: 8,
  initiativeBonus: -1,
  saves: SAVES,
  passivePerception,
  attack: {
    name: "Greatclub",
    bonus: 6,
    damage: { dice: 2, sides: 8, modifier: 4, type: "bludgeoning" },
    criticalRange: 20,
  },
});
const ogre = foe("ogre", "Ogre", 8);
const lookout = foe("lookout", "Lookout", 14);

/** A fight with `self` to act first, against the ogre and the lookout. */
function fightWith(self = thief) {
  return startEncounter([self, ogre, lookout], dice([20, 15], [20, 2], [20, 3]))
    .state;
}
const PC = { actorId: "pc" };
const HIDE = { type: "hide", ...PC };
const AIM = { type: "steady-aim", ...PC };
const ATTACK = { type: "attack", ...PC, targetId: "ogre" };
const LIGHT = { type: "light-attack", ...PC, targetId: "ogre" };
const attackEvent = (result) =>
  result.events.find(({ type }) => type === "attack");

test("Hide succeeds against the best passive Perception, and its advantage lasts one attack", () => {
  const start = fightWith();
  assert.deepEqual(availableActions(start, "pc"), [
    "attack",
    "hide",
    "steady-aim",
    "end-turn",
  ]);
  // d20 7 + 3 + 4 = 14 meets the lookout's 14, the better of 8 and 14.
  const hid = act(start, HIDE, dice([20, 7]));
  assert.deepEqual(hid.events, [
    {
      type: "hide",
      combatantId: "pc",
      d20: 7,
      modifier: 3,
      proficiency: 4,
      expertise: true,
      total: 14,
      dc: 14,
      watcherId: "lookout",
      success: true,
    },
  ]);
  assert.deepEqual(hid.state.hidden, ["pc"]);
  assert.equal(hid.state.economy.bonusAction, false);
  // Hidden, it can't hide again, and the bonus action is spent anyway.
  assert.deepEqual(availableActions(hid.state, "pc"), ["attack", "end-turn"]);
  assert.equal(act(hid.state, HIDE, dice()).rejection.code, "already-hidden");
  // The attack has advantage from hiding, so Sneak Attack's 2d6.
  const hit = act(
    hid.state,
    ATTACK,
    dice([20, 3], [20, 12], [6, 4], [6, 5], [6, 6]),
  );
  const event = attackEvent(hit);
  assert.deepEqual(event.mode.advantage, ["Hidden"]);
  assert.equal(event.d20, 12);
  assert.deepEqual(event.sneakAttack, { damageRolls: [5, 6] });
  assert.equal(event.damage, 4 + 3 + 5 + 6);
  assert.deepEqual(hit.state.hidden, []);
  // The Nick attack after it has no advantage: one d20. Then the turn ends,
  // both foes miss, and the next turn has no advantage left either.
  const nick = act(hit.state, LIGHT, dice([20, 14], [4, 3], [20, 2], [20, 2]));
  assert.equal(attackEvent(nick).mode, undefined);
  assert.equal(attackEvent(nick).sneakAttack, undefined);
  assert.equal(nick.state.round, 2);
  const next = act(nick.state, ATTACK, dice([20, 15], [6, 2]));
  assert.equal(attackEvent(next).mode, undefined);
  assert.equal(attackEvent(next).sneakAttack, undefined);
});

test("Hide fails below the best passive Perception: no advantage, and the bonus action is spent", () => {
  const failed = act(fightWith(), HIDE, dice([20, 6]));
  const [event] = failed.events;
  assert.deepEqual([event.total, event.dc, event.success], [13, 14, false]);
  assert.deepEqual(failed.state.hidden, []);
  assert.equal(failed.state.economy.bonusAction, false);
  assert.equal(
    act(failed.state, AIM, dice()).rejection.code,
    "bonus-action-used",
  );
  const swing = act(failed.state, ATTACK, dice([20, 15], [6, 2]));
  assert.equal(attackEvent(swing).mode, undefined);
  assert.equal(attackEvent(swing).sneakAttack, undefined);
});

test("Hide: untrained armour and poison give its Stealth check disadvantage; without opponents' Perception it is 10", () => {
  const burdened = {
    ...thief,
    abilityDisadvantages: { dexterity: ["Chain mail (untrained)"] },
  };
  const poisoned = {
    // Its initiative has the armour's disadvantage too.
    ...startEncounter(
      [burdened, ogre, lookout],
      dice([20, 15], [20, 16], [20, 2], [20, 3]),
    ).state,
    conditions: [
      {
        kind: "poisoned",
        targetId: "pc",
        sourceId: "ogre",
        source: "Bite",
        turnsLeft: 3,
      },
    ],
  };
  const [event] = act(poisoned, HIDE, dice([20, 18], [20, 4])).events;
  assert.deepEqual(event.mode, {
    d20s: [18, 4],
    advantage: [],
    disadvantage: ["Chain mail (untrained)", "Poisoned"],
  });
  assert.equal(event.d20, 4);
  const blind = startEncounter(
    [thief, { ...ogre, passivePerception: undefined }],
    dice([20, 15], [20, 2]),
  ).state;
  assert.equal(act(blind, HIDE, dice([20, 3])).events[0].dc, 10);
});

test("Steady Aim gives the next attack this turn advantage, and Sneak Attack still lands once per turn", () => {
  const aimed = act(fightWith(), AIM, dice());
  assert.deepEqual(aimed.events, [{ type: "steady-aim", combatantId: "pc" }]);
  assert.equal(aimed.state.economy.steadyAim, true);
  assert.equal(aimed.state.economy.bonusAction, false);
  // Steady Aim and Hide don't stack: each takes the one bonus action.
  assert.deepEqual(availableActions(aimed.state, "pc"), ["attack", "end-turn"]);
  assert.equal(
    act(aimed.state, HIDE, dice()).rejection.code,
    "bonus-action-used",
  );
  const hit = act(
    aimed.state,
    ATTACK,
    dice([20, 9], [20, 16], [6, 1], [6, 2], [6, 3]),
  );
  const event = attackEvent(hit);
  assert.deepEqual(event.mode.advantage, ["Steady Aim"]);
  assert.deepEqual(event.sneakAttack, { damageRolls: [2, 3] });
  assert.equal(hit.state.economy.steadyAim, false);
  assert.equal(hit.state.economy.sneakAttack, false);
  // The dagger's Nick attack: no advantage left, and no second Sneak Attack
  // even at advantage against a prone ogre.
  const prone = {
    ...hit.state,
    conditions: [
      {
        kind: "prone",
        targetId: "ogre",
        sourceId: "pc",
        source: "Trip",
        turnsLeft: 1,
      },
    ],
  };
  const nick = act(
    prone,
    LIGHT,
    // The prone ogre attacks at disadvantage (two d20s) and stands.
    dice([20, 14], [20, 2], [4, 3], [20, 2], [20, 3], [20, 2]),
  );
  const second = attackEvent(nick);
  assert.deepEqual(second.mode.advantage, ["target prone"]);
  assert.equal(second.hit, true);
  assert.equal(second.sneakAttack, undefined);
  // The next turn starts without Steady Aim, which it may take again.
  assert.equal(nick.state.round, 2);
  assert.equal(nick.state.economy.steadyAim, false);
  assert.ok(availableActions(nick.state, "pc").includes("steady-aim"));
});

test("Steady Aim and hiding together: both name the one attack's advantage, and both are spent", () => {
  const start = fightWith();
  const hidden = { ...start, hidden: ["pc"] };
  const aimed = act(hidden, AIM, dice()).state;
  const hit = act(
    aimed,
    ATTACK,
    dice([20, 2], [20, 18], [6, 1], [6, 1], [6, 1]),
  );
  assert.deepEqual(attackEvent(hit).mode.advantage, ["Hidden", "Steady Aim"]);
  assert.deepEqual(hit.state.hidden, []);
  assert.equal(hit.state.economy.steadyAim, false);
});

test("Steady Aim needs an attack left this turn; Hide after attacking is still offered", () => {
  const { lightAttack: _, ...single } = thief;
  void _;
  const swung = act(fightWith(single), ATTACK, dice([20, 15], [6, 2]));
  assert.equal(act(swung.state, AIM, dice()).rejection.code, "no-attack-left");
  // The turn stays open for Hide, which sets up the next turn's attack.
  assert.deepEqual(availableActions(swung.state, "pc"), ["hide", "end-turn"]);
  const hid = act(swung.state, HIDE, dice([20, 10], [20, 2], [20, 2]));
  assert.equal(hid.events[0].success, true);
  // With nothing left, the turn ended by itself; the foes missed.
  assert.equal(hid.state.round, 2);
  assert.deepEqual(hid.state.hidden, ["pc"]);
  const next = act(
    hid.state,
    ATTACK,
    dice([20, 1], [20, 13], [6, 2], [6, 1], [6, 1]),
  );
  assert.deepEqual(attackEvent(next).mode.advantage, ["Hidden"]);
  assert.ok(attackEvent(next).sneakAttack !== undefined);
});

test("a combatant without Hide or Steady Aim is refused both", () => {
  const { hide: _h, steadyAim: _s, ...plain } = thief;
  void _h;
  void _s;
  const state = fightWith(plain);
  assert.deepEqual(availableActions(state, "pc"), ["attack", "end-turn"]);
  assert.equal(act(state, HIDE, dice()).rejection.code, "no-hide");
  assert.equal(act(state, AIM, dice()).rejection.code, "no-steady-aim");
});

test("Fast Hands: a second weapon interaction in a turn takes the bonus action", () => {
  const interact = (attack) => ({ type: "interact", ...PC, attack });
  const once = act(fightWith(), interact(SHORTSWORD), dice());
  assert.equal(once.state.economy.interaction, false);
  assert.equal(once.state.economy.bonusAction, true);
  const twice = act(once.state, interact(DAGGER), dice());
  assert.equal(twice.rejection, undefined);
  assert.equal(twice.state.economy.bonusAction, false);
  const thrice = act(twice.state, interact(SHORTSWORD), dice());
  assert.equal(thrice.rejection.code, "interaction-used");
  assert.match(thrice.rejection.reason, /used your bonus action/u);
  // Without Fast Hands, the second is refused.
  const { fastHands: _, ...plain } = thief;
  void _;
  const handed = act(fightWith(plain), interact(SHORTSWORD), dice());
  assert.equal(
    act(handed.state, interact(DAGGER), dice()).rejection.code,
    "interaction-used",
  );
});

test("Second-Story Work: a Thief climbs or jumps a marked Strength check with Dexterity", () => {
  const climb = { skill: "athletics", dc: 15, movement: "climb" };
  const thiefClimb = abilityCheck(LEVEL_3, climb, dice([20, 10]));
  assert.deepEqual(
    [
      thiefClimb.ability,
      thiefClimb.modifier,
      thiefClimb.proficiency,
      thiefClimb.total,
      thiefClimb.label,
      thiefClimb.substitute,
    ],
    [
      "dexterity",
      3,
      2,
      15,
      "Athletics check (Dexterity, Second-Story Work)",
      "Second-Story Work",
    ],
  );
  // An unmarked Athletics check stays Strength (8: −1).
  const forced = abilityCheck(
    LEVEL_3,
    { skill: "athletics", dc: 15 },
    dice([20, 10]),
  );
  assert.deepEqual(
    [forced.ability, forced.modifier, forced.substitute],
    ["strength", -1, undefined],
  );
  // A plain Strength jump too.
  const jump = abilityCheck(
    LEVEL_3,
    { ability: "strength", dc: 12, movement: "jump" },
    dice([20, 10]),
  );
  assert.deepEqual(
    [jump.ability, jump.modifier, jump.label],
    ["dexterity", 3, "Strength check (Dexterity, Second-Story Work)"],
  );
  // A level-2 Rogue and a Fighter (with Remarkable Athlete's advantage)
  // climb with Strength.
  for (const [sheet, random] of [
    [LEVEL_2, dice([20, 10])],
    [testFighterAt(3), dice([20, 10], [20, 4])],
  ]) {
    const roll = abilityCheck(sheet, climb, random);
    assert.equal(roll.ability, "strength");
    assert.equal(roll.substitute, undefined);
  }
});

test("a module marks climbing and jumping only on Strength checks", () => {
  const yard = moduleFile("obstacle-yard");
  const wall = room(yard, "yard-gate").features.find(
    ({ id }) => id === "crumbling-wall",
  );
  assert.deepEqual(wall.check.approaches[0], {
    skill: "athletics",
    dc: 12,
    movement: "climb",
  });
  validateModule(yard);
  wall.check.approaches[1].movement = "climb";
  assert.throws(
    () => validateModule(yard),
    /approach 2 movement marks a climb or jump, which needs a Strength check/u,
  );
  delete wall.check.approaches[1].movement;
  wall.check.approaches[0].movement = "swim";
  assert.throws(() => validateModule(yard), /movement must be climb or jump/u);
});

test("the module, save and trace formats bump; an older module is refused", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 26);
  assert.ok(FIFTH_SESSION_FORMAT >= 33);
  assert.ok(FIFTH_TRACE_FORMAT >= 27);
  const older = { ...moduleFile("obstacle-yard"), formatVersion: 25 };
  assert.throws(() => validateModule(older), /format version 25 is not 26/u);
});

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, text) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});

/** A session with the level-3 Thief in the cellar's fight, on its turn. */
function inTheCellar() {
  const session = FifthSession.begin(1, ratTunnels, LEVEL_3);
  session.act({ type: "move", destinationId: "rat-cellar" }, "click");
  assert.equal(session.state.encounter.outcome, "ongoing");
  assert.equal(session.state.encounter.economy.bonusAction, true);
  return session;
}

const said = (turn) => JSON.stringify(turn);

test('scripted DM: "I hide behind the crates" calls hide, and the engine rolls it', async () => {
  const session = inTheCellar();
  const runtime = createFifthRuntime(ratTunnels, LEVEL_3);
  const tools = runtime.getGameToolDefinitions(session.state);
  const hide = tools.find(({ name }) => name === "hide");
  assert.match(hide.description, /bonus action \(Cunning Action\)/u);
  assert.deepEqual(Object.keys(hide.parameters.properties), []);
  assert.ok(tools.some(({ name }) => name === "steady_aim"));
  const { turn } = await session.converse(
    "I hide behind the crates.",
    scriptedDm("hide", "{}", "You slip behind the crates."),
  );
  assert.equal(turn.toolAttempts[0].disposition.executed, true);
  assert.match(
    said(turn),
    /You try to hide\. Stealth check: d20 \d+ \+ 3 \+ 4 proficiency \(Expertise\) = \d+ against Giant Rat's passive Perception \d+\./u,
  );
  // The bonus action is spent: Steady Aim and Hide are no longer offered.
  const after = runtime
    .getGameToolDefinitions(session.state)
    .map(({ name }) => name);
  assert.ok(!after.includes("hide") && !after.includes("steady_aim"));
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /to hide \("I hide behind the crates"/u);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /a turn has at most one of them/u);
});

test("scripted DM: a fourth action in a turn is rejected", async () => {
  // Three goblins, so one falling doesn't end the fight; the first seed on
  // which the Thief acts first and the fight outlasts its attack.
  for (let seed = 0; seed < 50; seed++) {
    const session = FifthSession.begin(seed, goblinTrio, LEVEL_3);
    const go = (name, argumentsJson) =>
      session.converse(`Do ${name}.`, scriptedDm(name, argumentsJson, "Done."));
    // The first goblin standing, offered or not.
    const at = () =>
      JSON.stringify({
        target: session.state.encounter.combatants.find(
          ({ side, hp }) => side === "opponents" && hp > 0,
        ).id,
      });
    if (session.state.encounter?.round !== 1) {
      continue;
    }
    // Steady Aim (the bonus action) and the attack (the action) are taken.
    const aimed = await go("steady_aim", "{}");
    assert.equal(aimed.turn.toolAttempts[0].disposition.executed, true);
    const struck = await go("attack", at());
    assert.equal(struck.turn.toolAttempts[0].disposition.executed, true);
    assert.match(said(struck.turn), /at advantage \(Steady Aim/u);
    if (session.state.encounter.economy.lightAttack !== "ready") {
      continue;
    }
    // The dagger's Nick attack is the turn's third action, still to come.
    // Hide would be a fourth, and a second bonus action: refused, as are a
    // second Steady Aim and a second attack with the action spent.
    const before = session.state;
    for (const [name, argumentsJson, code] of [
      ["hide", "{}", "bonus-action-used"],
      ["steady_aim", "{}", "bonus-action-used"],
      ["attack", at(), "action-used"],
    ]) {
      const { turn } = await go(name, argumentsJson);
      assert.equal(
        turn.toolAttempts[0].result.engineResult.rejection.code,
        code,
        name,
      );
      assert.equal(session.state, before, name);
    }
    // The Nick attack is taken, and with nothing left the turn ends.
    const nick = await go("light_attack", at());
    assert.equal(nick.turn.toolAttempts[0].disposition.executed, true);
    const fight = session.state.encounter;
    assert.ok(fight.outcome !== "ongoing" || fight.round === 2);
    return;
  }
  assert.fail("no seed below 50 sets up the turn");
});

test("the balance harness plays a level-3 Thief with Steady Aim and Hide", () => {
  const sheet = characterAtLevel(DICE, 3, undefined, false, undefined, "rogue");
  assert.equal(sheet.class, "rogue");
  assert.equal(characterProfile(sheet).steadyAim, true);
  const runtime = createFifthRuntime(ratTunnels, sheet);
  const seen = { "steady-aim": 0, hide: 0, sneak: 0 };
  const watched = {
    ...runtime,
    handleAction(state, action, random) {
      const result = runtime.handleAction(state, action, random);
      for (const event of result.events ?? []) {
        if (event.type === "steady-aim" || event.type === "hide") {
          seen[event.type] += 1;
        }
        if (event.type === "attack" && event.sneakAttack !== undefined) {
          seen.sneak += 1;
        }
      }
      return result;
    },
  };
  const runs = Array.from({ length: 10 }, (_, seed) =>
    playAdventure(watched, "cautious", seed),
  );
  assert.ok(runs.some(({ outcome }) => outcome === "victory"));
  assert.ok(seen["steady-aim"] > 0, "the harness takes Steady Aim");
  assert.ok(seen.sneak > 0, "a run lands a Sneak Attack");
  // At level 2 it hides instead.
  const two = createFifthRuntime(
    ratTunnels,
    characterAtLevel(DICE, 2, undefined, false, undefined, "rogue"),
  );
  let hides = 0;
  const watchedTwo = {
    ...two,
    handleAction(state, action, random) {
      const result = two.handleAction(state, action, random);
      hides += (result.events ?? []).filter(
        ({ type }) => type === "hide",
      ).length;
      return result;
    },
  };
  for (let seed = 0; seed < 5; seed++) {
    playAdventure(watchedTwo, "cautious", seed);
  }
  assert.ok(hides > 0, "the harness hides at level 2");
});
