import assert from "node:assert/strict";
import test from "node:test";
import { runDmTurn } from "../dist/dm-turn.js";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../dist/fighter-5e.js";
import {
  createFifthRuntime,
  playerCombatant,
  renderFifthEvent,
} from "../dist/runtime-5e.js";
import {
  goblinTrio as trio,
  loneGoblin as adventure,
} from "./fixtures/modules.mjs";

// The engine's targeting tests use the goblin trio: two numbered minions.
// Str 16 (+3), Dex 12 (+1), Con 14 (+2): AC 13 in leather with Defense, 12 HP, mace +5.
const sheet = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
  ],
  {
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
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  },
);

/** Returns queued values in order and records every draw. */
function dice(...queue) {
  const drawn = [];
  return {
    drawn,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const value = queue.shift();
      drawn.push({ sides, value });
      return value;
    },
  };
}

function scripted(...responses) {
  const requests = [];
  return {
    requests,
    async respond(request) {
      requests.push(request);
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}

const call = (name, args, id = "call-1") => ({
  toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }],
});

/** A session whose fight began with Ada first (d20 15 against the goblin's 3). */
function begun() {
  const runtime = createFifthRuntime(adventure, sheet);
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(15, 3),
  );
  assert.equal(result.state.encounter.order[0].combatantId, "pc");
  return { runtime, state: result.state };
}

const goblinHp = (state) =>
  state.encounter.combatants.find(({ id }) => id === "goblin").hp;

test("begin rolls initiative for every combatant and records the dice", () => {
  const runtime = createFifthRuntime(adventure, sheet);
  const fresh = runtime.createSession();
  assert.equal(fresh.encounter, undefined);
  const random = dice(4, 17, 12, 2);
  const result = runtime.handleAction(fresh, { type: "begin" }, random);
  assert.deepEqual(
    result.state.encounter.order.map(({ combatantId, d20, total }) => [
      combatantId,
      d20,
      total,
    ]),
    [
      ["goblin", 17, 19],
      ["pc", 4, 5],
    ],
  );
  // The goblin acted first: 12 + 4 = 16 hits AC 13 for 2 + 2.
  assert.deepEqual(
    random.drawn.map(({ value }) => value),
    [4, 17, 12, 2],
  );
  assert.match(
    runtime.renderResult(result),
    /Initiative: Goblin Warrior 17 \+ 2 = 19; Ada 4 \+ 1 = 5\./,
  );
  assert.match(
    runtime.renderResult(result),
    /12 \+ 4 = 16 against AC 13\. Hit\. Damage 2 \+ 2 = 4 slashing; Ada has 8\/12 HP\.\nIt is your turn\.$/,
  );
});

test("the attack tool is offered only on the player's turn, with only living targets", () => {
  const { runtime, state } = begun();
  const attack = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "attack");
  assert.deepEqual(attack.parameters.properties.target.enum, ["goblin"]);
  assert.equal(attack.parameters.additionalProperties, false);
  const over = runtime.handleAction(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice(20, 6, 6),
  ).state;
  assert.equal(over.status, "victory");
  assert.deepEqual(
    runtime.getGameToolDefinitions(over).map(({ name }) => name),
    ["look", "get_character_status"],
  );
});

test("victory and defeat end the session with the module's endings", () => {
  const { runtime, state } = begun();
  const won = runtime.handleAction(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice(20, 6, 6),
  );
  assert.equal(won.state.endingId, "goblin-defeated");
  assert.equal(won.events.at(-1).type, "ending");
  assert.match(runtime.renderResult(won), /The cellar is clear\./);

  let lost = state;
  // Ada misses and ends her turn (once hurt, Second Wind keeps it open);
  // the goblin crits for 2d6 + 2 each round until Ada drops.
  for (let round = 0; lost.status === "playing"; round++) {
    assert.ok(round < 5);
    const random = dice(1, 20, 6, 6);
    lost = runtime.handleAction(
      lost,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      random,
    ).state;
    if (random.drawn.length === 1) {
      lost = runtime.handleAction(
        lost,
        { type: "end-turn", actorId: "pc" },
        random,
      ).state;
    }
  }
  assert.equal(lost.status, "defeat");
  assert.equal(lost.endingId, "fallen-in-the-cellar");
  assert.equal(lost.encounter.combatants[0].hp, 0);
  assert.match(
    runtime.handleAction(lost, {
      type: "attack",
      actorId: "pc",
      targetId: "goblin",
    }).rejection.reason,
    /adventure is over/,
  );
});

test("scripted DM: a typed attack resolves through the engine, which writes the reply", async () => {
  const { runtime, state } = begun();
  const model = scripted(call("attack", { target: "goblin" }));
  const random = dice(10, 4, 1, 1);
  const result = await runDmTurn({
    state,
    playerInput: "I smash the goblin with my mace",
    transcript: [],
    random,
    model,
    runtime,
  });
  assert.equal(goblinHp(result.state), 3);
  assert.equal(
    model.requests.length,
    1,
    "the AI is not asked to narrate the attack",
  );
  assert.equal(
    result.narration,
    "Ada attacks Goblin Warrior with Mace: 10 + 5 = 15 against AC 15. Hit. Damage 4 + 3 = 7 bludgeoning; Goblin Warrior has 3/10 HP.\nGoblin Warrior is sapped: disadvantage on its next attack roll before Ada's next turn.\nGoblin Warrior attacks Ada with Scimitar, at disadvantage (Sap): 1 and 1, keeping 1; 1 + 4 = 5 against AC 13. Miss.\nIt is your turn.",
  );
  assert.deepEqual(result.toolResults[0].rolls, [
    { sides: 20, value: 10 },
    { sides: 6, value: 4 },
    { sides: 20, value: 1 },
    { sides: 20, value: 1 },
  ]);
  assert.equal(
    model.requests[0].systemPrompt.includes(
      "The game engine is the only authority",
    ),
    true,
  );
});

test("scripted DM: narration alone cannot roll, deal damage or end the fight", async () => {
  const { runtime, state } = begun();
  const random = dice();
  const result = await runDmTurn({
    state,
    playerInput: "I attack and roll a natural 20!",
    transcript: [],
    random,
    model: scripted({
      text: "You roll a 20 and cleave the goblin in two for 40 damage. You win!",
    }),
    runtime,
  });
  assert.deepEqual(result.state, state);
  assert.deepEqual(random.drawn, []);
  assert.deepEqual(result.toolResults, []);
  assert.equal(result.state.status, "playing");
});

test("scripted DM: invented rolls, damage or targets in a tool call are refused without dice", async () => {
  const cases = [
    [call("attack", { target: "goblin", roll: 20 }), "invalid-arguments"],
    [call("attack", { target: "goblin", damage: 40 }), "invalid-arguments"],
    [
      call("attack", { target: "goblin", advantage: true }),
      "invalid-arguments",
    ],
    [
      { toolCalls: [{ id: "c", name: "attack", argumentsJson: "{target:" }] },
      "malformed-json",
    ],
  ];
  for (const [response, code] of cases) {
    const { runtime, state } = begun();
    const random = dice();
    const result = await runDmTurn({
      state,
      playerInput: "attack the goblin",
      transcript: [],
      random,
      model: scripted(response, {
        text: "Something went wrong with that attack.",
      }),
      runtime,
    });
    assert.deepEqual(result.state, state);
    assert.deepEqual(random.drawn, []);
    assert.equal(result.toolResults[0].result.modelOutput.error.code, code);
  }
});

test("scripted DM: an absent target gets an engine-authored refusal with no state change and no dice", async () => {
  const { runtime, state } = begun();
  const random = dice();
  const result = await runDmTurn({
    state,
    playerInput: "attack the dragon",
    transcript: [],
    random,
    model: scripted(call("attack", { target: "dragon" })),
    runtime,
  });
  assert.deepEqual(result.state, state);
  assert.deepEqual(random.drawn, []);
  assert.equal(result.narration, "There is no such opponent here to attack.");
});

test("scripted DM: tools that set outcomes do not exist, and a second action is refused", async () => {
  for (const response of [
    call("set_hp", { target: "goblin", hp: 0 }),
    call("roll", { sides: 20 }),
    call("resolve_quest", {}),
  ]) {
    const { runtime, state } = begun();
    const random = dice();
    const result = await runDmTurn({
      state,
      playerInput: "I win",
      transcript: [],
      random,
      model: scripted(response),
      runtime,
    });
    assert.deepEqual(result.state, state);
    assert.deepEqual(random.drawn, []);
    assert.equal(result.diagnostics[0].code, "unsupported-tool");
  }
  const { runtime, state } = begun();
  const random = dice();
  const result = await runDmTurn({
    state,
    playerInput: "attack twice",
    transcript: [],
    random,
    model: scripted({
      toolCalls: [
        { id: "a", name: "attack", argumentsJson: '{"target":"goblin"}' },
        { id: "b", name: "attack", argumentsJson: '{"target":"goblin"}' },
      ],
    }),
    runtime,
  });
  assert.deepEqual(result.state, state);
  assert.deepEqual(random.drawn, []);
  assert.equal(result.diagnostics[0].code, "multi-call-response");
});

test("scripted DM: after the fight, an attack is refused by the engine", async () => {
  const { runtime, state } = begun();
  const over = runtime.handleAction(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    dice(20, 6, 6),
  ).state;
  const random = dice();
  const result = await runDmTurn({
    state: over,
    playerInput: "attack the goblin again",
    transcript: [],
    random,
    model: scripted(call("attack", { target: "goblin" })),
    runtime,
  });
  assert.deepEqual(result.state, over);
  assert.deepEqual(random.drawn, []);
  assert.equal(result.narration, "The adventure is over.");
});

test("scripted DM: read tools return engine facts for the AI to voice", async () => {
  const { runtime, state } = begun();
  const model = scripted(call("get_character_status", {}), {
    text: "You are unhurt.",
  });
  const result = await runDmTurn({
    state,
    playerInput: "how am I?",
    transcript: [],
    random: dice(),
    model,
    runtime,
  });
  assert.equal(result.narration, "You are unhurt.");
  const output = model.requests[1].toolResults[0].output;
  assert.equal(output.status.hp, 12);
  assert.equal(output.status.maxHp, 12);
  assert.match(
    model.requests[0].scene.combatStatus,
    /Round 1\. It is the player's turn\. Ada 12\/12 HP, Goblin Warrior 10\/10 HP\. The player has 1 action and a bonus action left this turn\.$/,
  );
});

/** The goblin trio fight with Ada first, then Minion 1, Minion 2 and the Warrior. */
function groupBegun() {
  const runtime = createFifthRuntime(trio, sheet);
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(20, 15, 10, 5),
  );
  assert.deepEqual(
    result.state.encounter.order.map(({ combatantId }) => combatantId),
    ["pc", "minion-1", "minion-2", "warrior"],
  );
  return { runtime, state: result.state };
}

const attackTool = (request) =>
  request.tools.find(({ name }) => name === "attack");

test("group fight: the attack tool offers every living opponent by id and name", () => {
  const { runtime, state } = groupBegun();
  const tool = attackTool({ tools: runtime.getGameToolDefinitions(state) });
  assert.deepEqual(tool.parameters.properties.target.enum, [
    "minion-1",
    "minion-2",
    "warrior",
  ]);
  assert.match(
    tool.description,
    /Targets: minion-1 \(Goblin Minion 1\), minion-2 \(Goblin Minion 2\), warrior \(Goblin Warrior\)\./,
  );
  assert.deepEqual(
    runtime.projectFight(state).targets.map(({ name }) => name),
    ["Goblin Minion 1", "Goblin Minion 2", "Goblin Warrior"],
  );
});

test("scripted DM: an ambiguous target gets a clarifying question, not a guess", async () => {
  const { runtime, state } = groupBegun();
  const model = scripted({
    text: "Which goblin: Goblin Minion 1, Goblin Minion 2 or Goblin Warrior?",
  });
  const random = dice();
  const result = await runDmTurn({
    state,
    playerInput: "attack the goblin",
    transcript: [],
    random,
    model,
    runtime,
  });
  // The prompt tells the AI to ask, and all three goblins were offered.
  assert.match(
    model.requests[0].systemPrompt,
    /fit more than one listed target .* ask which one/,
  );
  assert.equal(
    attackTool(model.requests[0]).parameters.properties.target.enum.length,
    3,
  );
  assert.equal(
    result.narration,
    "Which goblin: Goblin Minion 1, Goblin Minion 2 or Goblin Warrior?",
  );
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.toolResults, []);
  assert.deepEqual(random.drawn, []);
});

test("scripted DM: an ordinal resolves to the opponent with that number in its name", async () => {
  const { runtime, state } = groupBegun();
  const model = scripted(call("attack", { target: "minion-2" }));
  const result = await runDmTurn({
    state,
    playerInput: "attack the second goblin",
    transcript: [],
    // Ada hits AC 12 for 4 + 3, felling it; the other two hold their nerve
    // (morale 20s) and miss on natural 1s.
    random: dice(10, 4, 20, 20, 1, 1),
    model,
    runtime,
  });
  // The prompt defines an ordinal by the number in a name, not list position.
  assert.match(
    model.requests[0].systemPrompt,
    /an ordinal matching the number in its name .* Never count positions in a list\./,
  );
  const hp = (id) =>
    result.state.encounter.combatants.find((c) => c.id === id).hp;
  assert.equal(hp("minion-2"), 0);
  assert.equal(hp("minion-1"), 7);
  assert.match(
    result.narration,
    /^Ada attacks Goblin Minion 2 with Mace: 10 \+ 5 = 15 against AC 12\. Hit\..*\nGoblin Minion 2 is defeated\.\n/,
  );
  // Only the two goblins still standing swing back.
  assert.equal((result.narration.match(/attacks Ada/g) ?? []).length, 2);
  assert.equal(result.state.status, "playing");
});

test("scripted DM: targeting a defeated opponent is refused by the engine without dice", async () => {
  const { runtime, state: begun } = groupBegun();
  const state = runtime.handleAction(
    begun,
    { type: "attack", actorId: "pc", targetId: "minion-1" },
    dice(10, 4, 20, 20, 1, 1),
  ).state;
  assert.equal(state.encounter.combatants[1].hp, 0);
  const model = scripted(call("attack", { target: "minion-1" }));
  assert.deepEqual(
    runtime.getGameToolDefinitions(state).find(({ name }) => name === "attack")
      .parameters.properties.target.enum,
    ["minion-2", "warrior"],
  );
  const random = dice();
  const result = await runDmTurn({
    state,
    playerInput: "finish off the first minion",
    transcript: [],
    random,
    model,
    runtime,
  });
  assert.equal(result.narration, "Goblin Minion 1 is already defeated.");
  assert.deepEqual(result.state, state);
  assert.deepEqual(random.drawn, []);
});

// Fighter features in combat (#130).

const ATTACK = { type: "attack", actorId: "pc", targetId: "goblin" };

/** Ada at `xp`, at full health for her level. */
function atXp(xp) {
  const leveled = { ...sheet, xp, level: levelForXp(xp) };
  return validateFighter({ ...leveled, hp: fighterProfile(leveled).maxHp });
}

/** The goblin goes first and hits Ada for 3 + 2, leaving her 7/12 HP. */
function hurt(character = sheet) {
  const runtime = createFifthRuntime(adventure, character);
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(4, 17, 15, 3),
  );
  assert.equal(result.state.encounter.combatants[0].hp, character.hp - 5);
  return { runtime, state: result.state };
}

const toolNames = (runtime, state) =>
  runtime.getGameToolDefinitions(state).map(({ name }) => name);

test("the player's combatant brings Sap, Second Wind and, from level 2, Action Surge", () => {
  const one = playerCombatant(sheet);
  assert.equal(one.attack.mastery, "Sap");
  assert.deepEqual(one.secondWind, {
    uses: 2,
    max: 2,
    healing: { dice: 1, sides: 10, modifier: 1 },
  });
  assert.equal(one.actionSurge, undefined);
  const two = playerCombatant(atXp(300));
  assert.deepEqual(two.actionSurge, { uses: 1, max: 1 });
});

test("Improved Critical: a level 3 Champion's 19 is a critical hit", () => {
  const runtime = createFifthRuntime(adventure, atXp(900));
  const { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(15, 3),
  );
  // 19 crits for 2d6 1 + 1 + 3; Action Surge keeps the turn open.
  const result = runtime.handleAction(state, ATTACK, dice(19, 1, 1));
  assert.equal(result.events[0].critical, true);
  assert.equal(result.events[0].damage, 5);
  assert.match(
    runtime.renderResult(result),
    /19 \+ 5 = 24 against AC 15\. Critical hit!/,
  );
  // A level 1 Fighter's 19 is an ordinary hit.
  const { runtime: low, state: lowState } = begun();
  assert.equal(
    low.handleAction(lowState, ATTACK, dice(19, 1, 1, 1)).events[0].critical,
    false,
  );
});

test("Second Wind, Action Surge and End turn are offered only when legal", () => {
  // Full health at level 1: no Second Wind and no Action Surge.
  const { runtime, state } = begun();
  assert.deepEqual(toolNames(runtime, state), [
    "look",
    "get_character_status",
    "attack",
    "end_turn",
  ]);
  const wounded = hurt();
  assert.deepEqual(toolNames(wounded.runtime, wounded.state), [
    "look",
    "get_character_status",
    "attack",
    "second_wind",
    "end_turn",
  ]);
  assert.deepEqual(wounded.runtime.projectFight(wounded.state).turn, {
    actions: 1,
    maxActions: 1,
    bonusAction: true,
    reaction: true,
    interaction: true,
    lightAttack: "unready",
    options: ["attack", "second-wind", "end-turn"],
  });
  assert.deepEqual(wounded.runtime.projectFight(wounded.state).features, {
    secondWind: { uses: 2, max: 2 },
  });
  // Ada misses (2 + 5): Second Wind and End turn remain.
  const missed = wounded.runtime.handleAction(wounded.state, ATTACK, dice(2));
  assert.deepEqual(toolNames(wounded.runtime, missed.state), [
    "look",
    "get_character_status",
    "second_wind",
    "end_turn",
  ]);
  assert.match(
    wounded.runtime.renderResult(missed),
    /Miss\.\nIt is still your turn: you can use Second Wind or end your turn\.$/,
  );
  // Level 2 adds Action Surge.
  const veteran = hurt(atXp(300));
  assert.ok(toolNames(veteran.runtime, veteran.state).includes("action_surge"));
  assert.deepEqual(veteran.runtime.projectFight(veteran.state).features, {
    secondWind: { uses: 2, max: 2 },
    actionSurge: { uses: 1, max: 1 },
  });
  assert.deepEqual(
    veteran.runtime.projectCharacterStatus(veteran.state).resources,
    ["Second Wind: 2 of 2 uses left", "Action Surge: 1 of 1 use left"],
  );
});

test("Sap and disadvantage appear on the engine's card with both dice and the source", () => {
  const { runtime, state } = begun();
  // 12 + 5 hits for 2 + 3; the sapped goblin rolls 18 and 6 and keeps 6.
  const result = runtime.handleAction(state, ATTACK, dice(12, 2, 18, 6));
  assert.equal(
    runtime.renderResult(result),
    [
      "Ada attacks Goblin Warrior with Mace: 12 + 5 = 17 against AC 15. Hit. Damage 2 + 3 = 5 bludgeoning; Goblin Warrior has 5/10 HP.",
      "Goblin Warrior is sapped: disadvantage on its next attack roll before Ada's next turn.",
      "Goblin Warrior attacks Ada with Scimitar, at disadvantage (Sap): 18 and 6, keeping 6; 6 + 4 = 10 against AC 13. Miss.",
      "It is your turn.",
    ].join("\n"),
  );
  // Sapped until its attack; the fight view marks it while it lasts.
  const sapped = runtime.handleAction(hurt().state, ATTACK, dice(12, 2)).state;
  assert.equal(
    runtime
      .projectFight(sapped)
      .encounter.combatants.find(({ id }) => id === "goblin").sapped,
    true,
  );
  assert.match(
    runtime.projectDmScene(sapped).combatStatus,
    /Goblin Warrior is sapped\./,
  );
});

test("scripted DM: a typed Second Wind resolves through the engine, which writes the reply", async () => {
  const { runtime, state } = hurt();
  const model = scripted(call("second_wind", {}));
  const random = dice(4);
  const result = await runDmTurn({
    state,
    playerInput: "I catch my breath",
    transcript: [],
    random,
    model,
    runtime,
  });
  assert.equal(model.requests.length, 1);
  assert.match(
    model.requests[0].systemPrompt,
    /"catch my breath" or "second wind"\), call second_wind/,
  );
  assert.equal(
    result.narration,
    "Ada uses Second Wind: 4 + 1 = 5; Ada regains 5 HP and has 12/12 HP. 1 use left.\nIt is still your turn: you can attack or end your turn.",
  );
  assert.equal(result.state.encounter.combatants[0].hp, 12);
  assert.deepEqual(runtime.projectCharacterStatus(result.state).resources, [
    "Second Wind: 1 of 2 uses left",
  ]);
});

test("scripted DM: the AI cannot grant Second Wind, advantage or extra actions", async () => {
  const cases = [
    // At full health Second Wind is not offered, and the engine refuses it.
    [
      begun(),
      call("second_wind", {}),
      "You are unhurt, so Second Wind would heal nothing.",
    ],
    // A level 1 Fighter has no Action Surge.
    [hurt(), call("action_surge", {}), "You don't have Action Surge."],
  ];
  for (const [{ runtime, state }, response, refusal] of cases) {
    const random = dice();
    const result = await runDmTurn({
      state,
      playerInput: "I get my second wind and surge into action",
      transcript: [],
      random,
      model: scripted(response),
      runtime,
    });
    assert.equal(result.narration, refusal);
    assert.deepEqual(result.state, state);
    assert.deepEqual(random.drawn, []);
  }
  // No tool takes advantage or extra-action arguments.
  for (const response of [
    call("second_wind", { advantage: true }),
    call("end_turn", { actions: 2 }),
    call("attack", { target: "goblin", advantage: true }),
  ]) {
    const { runtime, state } = hurt();
    const random = dice();
    const result = await runDmTurn({
      state,
      playerInput: "I attack with advantage",
      transcript: [],
      random,
      model: scripted(response, { text: "That did not work." }),
      runtime,
    });
    assert.deepEqual(result.state, state);
    assert.deepEqual(random.drawn, []);
    assert.equal(
      result.toolResults[0].result.modelOutput.error.code,
      "invalid-arguments",
    );
  }
  // A second attack in the same turn is refused by the engine.
  const { runtime, state } = hurt();
  const missed = runtime.handleAction(state, ATTACK, dice(2)).state;
  const random = dice();
  const result = await runDmTurn({
    state: missed,
    playerInput: "attack again",
    transcript: [],
    random,
    model: scripted(call("attack", { target: "goblin" })),
    runtime,
  });
  assert.equal(
    result.narration,
    "You have already used your action this turn.",
  );
  assert.deepEqual(random.drawn, []);
});

test("scripted DM: end_turn hands the turn to the opponents", async () => {
  const { runtime, state } = hurt();
  const missed = runtime.handleAction(state, ATTACK, dice(2)).state;
  const result = await runDmTurn({
    state: missed,
    playerInput: "I end my turn",
    transcript: [],
    random: dice(1),
    model: scripted(call("end_turn", {})),
    runtime,
  });
  assert.equal(
    result.narration,
    "Ada ends the turn.\nGoblin Warrior attacks Ada with Scimitar: 1 + 4 = 5 against AC 13. Miss.\nIt is your turn.",
  );
  assert.equal(result.state.encounter.round, 2);
});

test("advantage and disadvantage that cancel are named on the card, with the one die", () => {
  const { state } = begun();
  const line = renderFifthEvent(state, {
    type: "attack",
    actorId: "goblin",
    targetId: "pc",
    weapon: "Scimitar",
    d20: 9,
    bonus: 4,
    total: 13,
    armorClass: 17,
    hit: false,
    critical: false,
    mode: { d20s: [9], advantage: ["A"], disadvantage: ["B"] },
    damageRolls: [],
    damageModifier: 2,
    damage: 0,
    damageType: "slashing",
    hpAfter: 12,
  });
  assert.equal(
    line,
    "Goblin Warrior attacks Ada with Scimitar, advantage (A) and disadvantage (B) cancel: 9 + 4 = 13 against AC 17. Miss.",
  );
});
