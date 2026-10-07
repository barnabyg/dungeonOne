// #234: a ghoul's claws paralyse. A paralysed combatant can't act, fails
// Strength and Dexterity saves, is attacked with advantage and critically hit
// by every hit, and repeats its Constitution save at the end of each of its
// turns. The AI DM can't act for a paralysed character, and the balance gate
// plays the paralysis.
import assert from "node:assert/strict";
import test from "node:test";
import { gateAdventure } from "../dist/balance-5e.js";
import { validateFifthBestiary } from "../dist/bestiary-5e.js";
import {
  act,
  availableActions,
  CONDITION_RULES,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { fightRoom } from "./fixtures/modules.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";

/** Returns the queued values in order, checking each die's sides. */
function dice(...queue) {
  return {
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      return value;
    },
  };
}

/** Draws no dice: an action that rolls fails the test. */
const NO_DICE = dice();

const fighter = {
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 30,
  maxHp: 30,
  dexterity: 12,
  initiativeBonus: 1,
  saves: {
    strength: 4,
    dexterity: 1,
    constitution: 4,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  },
  attack: {
    name: "Mace",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    criticalRange: 20,
  },
  secondWind: {
    uses: 2,
    max: 2,
    healing: { dice: 1, sides: 10, modifier: 1 },
  },
  actionSurge: { uses: 1, max: 1 },
  potions: [
    {
      id: "potion",
      name: "Potion of Healing",
      healing: { dice: 2, sides: 4, modifier: 2 },
    },
  ],
};

const undeadSaves = {
  strength: 1,
  dexterity: 2,
  constitution: 0,
  intelligence: -2,
  wisdom: 0,
  charisma: -2,
};

// A ghoul whose paralysis lasts up to 10 turns with a repeat save, as a rider
// may; the bestiary's Ghoul paralyses only until the end of the next turn.
const ghoul = {
  id: "ghoul",
  name: "Ghoul",
  side: "opponents",
  armorClass: 12,
  hp: 22,
  maxHp: 22,
  dexterity: 15,
  initiativeBonus: 2,
  saves: undeadSaves,
  attack: {
    name: "Claw",
    bonus: 4,
    damage: { dice: 1, sides: 4, modifier: 2, type: "slashing" },
    criticalRange: 20,
    rider: {
      condition: {
        kind: "paralysed",
        save: { ability: "constitution", dc: 10 },
        turns: 10,
        repeatSave: true,
      },
    },
  },
};

/** A beast whose bite knocks its target prone after a save of `ability`. */
const tripper = (ability) => ({
  id: "tripper",
  name: "Tripper",
  side: "opponents",
  armorClass: 12,
  hp: 11,
  maxHp: 11,
  dexterity: 14,
  initiativeBonus: 2,
  saves: undeadSaves,
  attack: {
    name: "Bite",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "piercing" },
    criticalRange: 20,
    rider: { condition: { kind: "prone", save: { ability, dc: 11 } } },
  },
});

/** The ghoul wins initiative, claws Ada and paralyses her. */
function paralysed() {
  // Initiative: Ada 5 + 1, ghoul 18 + 2. The claw: 15 + 4 hits AC 16 for
  // 2 + 2 slashing; Ada's Constitution save is 3 + 4 = 7 against DC 10.
  return startEncounter(
    [fighter, ghoul],
    dice([20, 5], [20, 18], [20, 15], [4, 2], [20, 3]),
  );
}

test("paralysed: can't act, fails Strength and Dexterity saves, attacked with advantage, every hit critical", () => {
  assert.deepEqual(CONDITION_RULES.paralysed, {
    name: "Paralysed",
    attacked: "advantage",
    incapacitated: true,
    failsSaves: ["strength", "dexterity"],
    criticalHits: true,
  });
});

test("a ghoul's claw paralyses on a failed Constitution save", () => {
  const { state, events } = paralysed();
  assert.deepEqual(
    events.filter(({ type }) => type === "save" || type === "condition"),
    [
      {
        type: "save",
        combatantId: "pc",
        ability: "constitution",
        d20: 3,
        bonus: 4,
        total: 7,
        dc: 10,
        success: false,
        condition: "paralysed",
        repeat: false,
      },
      {
        type: "condition",
        combatantId: "pc",
        kind: "paralysed",
        sourceId: "ghoul",
        source: "Claw",
        turns: 10,
        save: { ability: "constitution", dc: 10 },
      },
    ],
  );
  assert.equal(currentCombatant(state).id, "pc");
});

test("a paralysed combatant is offered only waiting, and every other action is refused before any die", () => {
  const { state } = paralysed();
  assert.deepEqual(availableActions(state, "pc"), ["end-turn"]);
  const hurt = {
    ...state,
    combatants: state.combatants.map((entrant) =>
      entrant.id === "pc" ? { ...entrant, hp: 10 } : entrant,
    ),
  };
  for (const action of [
    { type: "attack", actorId: "pc", targetId: "ghoul" },
    { type: "light-attack", actorId: "pc", targetId: "ghoul" },
    { type: "second-wind", actorId: "pc" },
    { type: "action-surge", actorId: "pc" },
    { type: "drink-potion", actorId: "pc", itemId: "potion" },
    { type: "interact", actorId: "pc", attack: fighter.attack },
  ]) {
    const result = act(hurt, action, NO_DICE);
    assert.deepEqual(
      result.rejection,
      {
        code: "paralysed",
        reason:
          "You are paralysed and can't act until it ends; you can only wait.",
      },
      action.type,
    );
    assert.equal(result.state, hurt);
  }
});

test("attacks against a paralysed combatant have advantage, and a hit is a critical hit", () => {
  // End of Ada's turn: her repeat save, 2 + 4, fails. The ghoul rolls 12 and
  // 3 with advantage and keeps 12: 16 hits AC 16, and is critical, so the
  // claw rolls 2d4. Ada's save against the new paralysis, 15 + 4, succeeds.
  const result = act(
    paralysed().state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 2], [20, 12], [20, 3], [4, 1], [4, 2], [20, 15]),
  );
  const claw = result.events.find(({ type }) => type === "attack");
  assert.deepEqual(claw.mode, {
    d20s: [12, 3],
    advantage: ["target paralysed"],
    disadvantage: [],
  });
  assert.equal(claw.hit, true);
  assert.equal(claw.critical, true);
  assert.equal(claw.paralysedCritical, true);
  assert.deepEqual(claw.damageRolls, [1, 2]);
  assert.equal(claw.damage, 5);
  // The first paralysis goes on, a turn shorter.
  assert.equal(result.state.conditions.length, 1);
  assert.equal(result.state.conditions[0].turnsLeft, 9);
  assert.deepEqual(availableActions(result.state, "pc"), ["end-turn"]);
});

test("a natural 20 against a paralysed combatant is a critical hit of its own", () => {
  const result = act(
    paralysed().state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 2], [20, 20], [20, 3], [4, 1], [4, 2], [20, 15]),
  );
  const claw = result.events.find(({ type }) => type === "attack");
  assert.equal(claw.critical, true);
  assert.equal(claw.paralysedCritical, undefined);
});

test("a miss against a paralysed combatant is still a miss", () => {
  const result = act(
    paralysed().state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 2], [20, 1], [20, 1]),
  );
  const claw = result.events.find(({ type }) => type === "attack");
  assert.equal(claw.hit, false);
  assert.equal(claw.critical, false);
});

test("a successful repeat save at the end of its turn ends the paralysis", () => {
  // End of Ada's turn: 12 + 4 = 16 against DC 10. The ghoul then attacks
  // without advantage and misses on a 1.
  const result = act(
    paralysed().state,
    { type: "end-turn", actorId: "pc" },
    dice([20, 12], [20, 1]),
  );
  assert.deepEqual(
    result.events.filter(
      ({ type }) => type === "save" || type === "condition-ended",
    ),
    [
      {
        type: "save",
        combatantId: "pc",
        ability: "constitution",
        d20: 12,
        bonus: 4,
        total: 16,
        dc: 10,
        success: true,
        condition: "paralysed",
        repeat: true,
      },
      {
        type: "condition-ended",
        combatantId: "pc",
        kind: "paralysed",
        reason: "saved",
      },
    ],
  );
  assert.equal(
    result.events.find(({ type }) => type === "attack").mode,
    undefined,
  );
  assert.deepEqual(result.state.conditions, []);
  assert.deepEqual(availableActions(result.state, "pc"), [
    "attack",
    "second-wind",
    "action-surge",
    "drink-potion",
    "end-turn",
  ]);
});

test("the bestiary's one-turn paralysis ends at the end of the target's next turn, with no save", () => {
  const brief = {
    ...ghoul,
    attack: {
      ...ghoul.attack,
      rider: {
        condition: {
          kind: "paralysed",
          save: { ability: "constitution", dc: 10 },
          turns: 1,
        },
      },
    },
  };
  // As in `paralysed()`: the claw hits and Ada's save, 3 + 4, fails.
  const { state } = startEncounter(
    [fighter, brief],
    dice([20, 5], [20, 18], [20, 15], [4, 2], [20, 3]),
  );
  assert.deepEqual(availableActions(state, "pc"), ["end-turn"]);
  // Ending her turn draws no save: the paralysis runs out, and the ghoul,
  // attacking without advantage, misses on a 1.
  const result = act(state, { type: "end-turn", actorId: "pc" }, dice([20, 1]));
  assert.deepEqual(
    result.events.find(({ type }) => type === "condition-ended"),
    {
      type: "condition-ended",
      combatantId: "pc",
      kind: "paralysed",
      reason: "expired",
    },
  );
  assert.deepEqual(result.state.conditions, []);
});

for (const ability of ["strength", "dexterity"]) {
  test(`a paralysed combatant fails a ${ability} save without a roll`, () => {
    // Initiative: Ada 5 + 1, ghoul 18 + 2, tripper 16 + 2. The ghoul
    // paralyses Ada as before; the tripper rolls 13 and 5 with advantage,
    // keeps 13: 17 hits and is critical, 2d6 + 2. Ada's save fails with no
    // die, and she is knocked prone.
    const { state, events } = startEncounter(
      [fighter, ghoul, tripper(ability)],
      dice(
        [20, 5],
        [20, 18],
        [20, 16],
        [20, 15],
        [4, 2],
        [20, 3],
        [20, 13],
        [20, 5],
        [6, 1],
        [6, 1],
      ),
    );
    const saves = events.filter(({ type }) => type === "save");
    assert.deepEqual(saves[1], {
      type: "save",
      combatantId: "pc",
      ability,
      bonus: fighter.saves[ability],
      dc: 11,
      success: false,
      condition: "prone",
      repeat: false,
      autoFail: "paralysed",
    });
    assert.deepEqual(
      state.conditions.map(({ kind }) => kind),
      ["paralysed", "prone"],
    );
  });
}

test("a paralysed opponent does nothing on its turn but repeat its save", () => {
  // Initiative: Ada 18 + 1, ghoul 5 + 2. The ghoul is paralysed by a
  // made-up condition; its turn is only the repeat save, 4 + 0, which fails.
  const { state } = startEncounter([fighter, ghoul], dice([20, 18], [20, 5]));
  const held = {
    ...state,
    conditions: [
      {
        kind: "paralysed",
        targetId: "ghoul",
        sourceId: "pc",
        source: "Test",
        turnsLeft: 5,
        save: { ability: "constitution", dc: 10 },
      },
    ],
  };
  const result = act(held, { type: "end-turn", actorId: "pc" }, dice([20, 4]));
  assert.ok(!result.events.some(({ type }) => type === "attack"));
  assert.equal(result.state.conditions[0].turnsLeft, 4);
  assert.equal(currentCombatant(result.state).id, "pc");
});

test("the bestiary's Ghoul claws first, with its paralysing rider", () => {
  const block = bestiary.monsters.find(({ id }) => id === "ghoul").statBlock;
  assert.deepEqual(block.attacks[0], {
    name: "Claw",
    bonus: 4,
    damage: { dice: 1, sides: 4, modifier: 2, type: "slashing" },
    rider: {
      condition: {
        kind: "paralysed",
        save: { ability: "constitution", dc: 10 },
        turns: 1,
      },
    },
  });
});

test("the bestiary validator needs a paralysis to say how long it lasts", () => {
  const entry = structuredClone(
    bestiary.monsters.find(({ id }) => id === "ghoul"),
  );
  entry.statBlock.attacks[0].rider = { condition: { kind: "paralysed" } };
  assert.throws(
    () => validateFifthBestiary({ ...bestiary, monsters: [entry] }),
    /must say how many of the target's turns it lasts\./,
  );
});

/** The lone goblin's room with a Ghoul in place of the goblin. */
const ghoulCellar = fightRoom("ghoul-cellar", "The Ghoul Cellar", [
  { id: "ghoul", monster: "ghoul" },
]);

const paralysedNow = (state) =>
  (state.encounter?.conditions ?? []).some(
    ({ targetId, kind }) => targetId === "pc" && kind === "paralysed",
  );

/** A runtime and state in the ghoul cellar with the character paralysed. */
function paralysedInCellar() {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(ghoulCellar, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    while (state.status === "playing" && !paralysedNow(state)) {
      const [target] = runtime.attackTargets(state);
      state = runtime.handleAction(
        state,
        target === undefined
          ? { type: "end-turn", actorId: "pc" }
          : { type: "attack", actorId: "pc", targetId: target.id },
        random,
      ).state;
    }
    if (paralysedNow(state)) {
      return { runtime, state };
    }
  }
  assert.fail("a seed paralyses the character");
}

test("while paralysed the action bar and the AI DM's tools offer only waiting", () => {
  const { runtime, state } = paralysedInCellar();
  assert.deepEqual(
    runtime.projectActions(state).map(({ action, available }) => ({
      action,
      available,
    })),
    [{ action: "end-turn", available: true }],
  );
  assert.deepEqual(
    runtime
      .getGameToolDefinitions(state)
      .map(({ name }) => name)
      .sort(),
    ["end_turn", "get_character_status", "look"],
  );
  assert.deepEqual(runtime.attackTargets(state), []);
  assert.match(
    runtime.projectCharacterStatus(state).conditions[0],
    /^Paralysed \(Ghoul's Claw; ends at the end of this turn\)$/u,
  );
});

test("the AI DM's attempts to act for a paralysed character get the engine's refusal", () => {
  const { runtime, state } = paralysedInCellar();
  for (const [name, args] of [
    ["attack", { target: "ghoul" }],
    ["second_wind", {}],
    ["action_surge", {}],
  ]) {
    const result = runtime.dispatchGameTool(state, {
      name,
      argumentsJson: JSON.stringify(args),
    });
    assert.equal(result.state, state, name);
    assert.equal(result.modelOutput.ok, false, name);
    assert.equal(result.modelOutput.error.code, "action-rejected", name);
    assert.equal(
      result.modelOutput.error.rejection.reason,
      "You are paralysed and can't act until it ends; you can only wait.",
      name,
    );
  }
});

test("the balance gate plays the Ghoul's paralysis", () => {
  const withoutRiders = structuredClone(ghoulCellar);
  for (const opponent of withoutRiders.encounters[0].opponents) {
    opponent.statBlock = {
      ...opponent.statBlock,
      attacks: opponent.statBlock.attacks.map(({ name, bonus, damage }) => ({
        name,
        bonus,
        damage,
      })),
    };
  }
  const survival = (adventure) => {
    const result = gateAdventure(adventure);
    assert.ok(result.ok);
    return result.verdict.survival.rate;
  };
  assert.ok(survival(ghoulCellar) < survival(withoutRiders));
});
