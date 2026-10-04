import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { buildFighter } from "../dist/fighter-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";

const [adventure, storeroom] = await loadBuiltInFifthAdventures();
// Str 16 (+3), Dex 12 (+1), Con 14 (+2): AC 17 with Defense, 12 HP, mace +5.
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
  // The goblin acted first: 12 + 4 = 16 misses AC 17.
  assert.deepEqual(
    random.drawn.map(({ value }) => value),
    [4, 17, 12],
  );
  assert.match(
    runtime.renderResult(result),
    /Initiative: Goblin Warrior 17 \+ 2 = 19; Ada 4 \+ 1 = 5\./,
  );
  assert.match(
    runtime.renderResult(result),
    /12 \+ 4 = 16 against AC 17\. Miss\.\nIt is your turn\.$/,
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
  // Ada misses; the goblin crits for 2d6 + 2 each round until Ada drops.
  for (let round = 0; lost.status === "playing"; round++) {
    assert.ok(round < 5);
    lost = runtime.handleAction(
      lost,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      dice(1, 20, 6, 6),
    ).state;
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
  const random = dice(10, 4, 1);
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
    "Ada attacks Goblin Warrior with Mace: 10 + 5 = 15 against AC 15. Hit. Damage 4 + 3 = 7 bludgeoning; Goblin Warrior has 3/10 HP.\nGoblin Warrior attacks Ada with Scimitar: 1 + 4 = 5 against AC 17. Miss.\nIt is your turn.",
  );
  assert.deepEqual(result.toolResults[0].rolls, [
    { sides: 20, value: 10 },
    { sides: 6, value: 4 },
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
    /Round 1\. It is the player's turn\. Ada 12\/12 HP, Goblin Warrior 10\/10 HP\./,
  );
});

/** The storeroom fight with Ada first, then Minion 1, Minion 2 and the Warrior. */
function groupBegun() {
  const runtime = createFifthRuntime(storeroom, sheet);
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
    /fit more than one offered target .* ask which one/,
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

test("scripted DM: a target named by order resolves to that opponent", async () => {
  const { runtime, state } = groupBegun();
  const result = await runDmTurn({
    state,
    playerInput: "attack the second minion",
    transcript: [],
    // Ada hits AC 12 for 4 + 3, felling it; the other two miss on natural 1s.
    random: dice(10, 4, 1, 1),
    model: scripted(call("attack", { target: "minion-2" })),
    runtime,
  });
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
    dice(10, 4, 1, 1),
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
