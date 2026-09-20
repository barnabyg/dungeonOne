import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import {
  resolveAdventure,
  resolveHistoricalAdventure,
} from "../dist/runtime.js";

function noRolls(message = "This action must not draw randomness") {
  return {
    roll() {
      assert.fail(message);
    },
  };
}

function reachChapelPath(runtime, state = runtime.createSession()) {
  return runtime.handleAction(state, {
    type: "move",
    destination: "chapel path",
  }).state;
}

function takePotion(runtime, state = reachChapelPath(runtime)) {
  return runtime.handleAction(
    state,
    runtime.parseCommand("take healing potion"),
    noRolls("Taking the potion must not roll"),
  );
}

test("the chapel path potion can be collected, shown, healed with, and consumed once", () => {
  const runtime = resolveAdventure("chapel");
  const pathState = reachChapelPath(runtime);
  assert.deepEqual(runtime.projectDmScene(pathState).room.items, [
    {
      id: "healing-potion",
      name: "healing potion",
      description: "A stoppered red potion that restores 2d4 + 2 HP.",
      placement: {
        featureId: "waymarker",
        description: "tucked into a dry niche beneath the waymarker",
      },
    },
  ]);

  const taken = takePotion(runtime, pathState);
  assert.equal(taken.rejection, undefined);
  assert.deepEqual(taken.events, [
    { type: "chapel-item-taken", itemId: "healing-potion" },
  ]);
  assert.deepEqual(taken.state.itemPlacements, {
    "healing-potion": { type: "inventory" },
  });
  assert.deepEqual(runtime.projectCharacterStatus(taken.state).collectedItems, [
    { id: "healing-potion", name: "healing potion" },
  ]);
  assert.match(
    runtime.renderResult(
      runtime.handleAction(taken.state, { type: "inventory" }),
    ),
    /healing potion.*available/i,
  );

  const full = runtime.handleAction(
    taken.state,
    runtime.parseCommand("use healing potion"),
    noRolls("Full-HP potion use must not roll"),
  );
  assert.deepEqual(full.rejection, { reason: "chapel-full-hp" });
  assert.equal(full.state, taken.state);

  const hurt = {
    ...taken.state,
    fighter: { ...taken.state.fighter, hp: 15 },
  };
  const rolls = [4, 3];
  const used = runtime.handleAction(hurt, runtime.parseCommand("use potion"), {
    roll(sides) {
      assert.equal(sides, 4);
      return rolls.shift();
    },
  });
  assert.equal(used.rejection, undefined);
  assert.equal(used.state.fighter.hp, 20);
  assert.deepEqual(used.state.itemPlacements, {
    "healing-potion": { type: "consumed" },
  });
  assert.deepEqual(used.events, [
    {
      type: "chapel-item-used",
      itemId: "healing-potion",
      healingRolls: [4, 3],
      modifier: 2,
      rolledHealing: 9,
      actualHealing: 5,
      hp: 20,
      maxHp: 20,
    },
  ]);
  assert.match(runtime.renderResult(used), /d4 rolls: 4, 3/i);
  assert.match(runtime.renderResult(used), /actual healing: 5/i);

  const repeated = runtime.handleAction(
    used.state,
    runtime.parseCommand("use potion"),
    noRolls("Consumed potion use must not roll"),
  );
  assert.deepEqual(repeated.rejection, {
    reason: "chapel-item-unavailable",
  });
  assert.equal(repeated.state, used.state);

  for (const invalidState of [
    { ...taken.state, fighter: { ...taken.state.fighter, hp: 0 } },
    { ...taken.state, status: "defeat" },
    { ...taken.state, status: "quit" },
  ]) {
    const invalid = runtime.handleAction(
      invalidState,
      runtime.parseCommand("use potion"),
      noRolls("Dead and terminal characters must not heal or roll"),
    );
    assert.equal(invalid.state, invalidState);
    assert.ok(invalid.rejection);
    assert.deepEqual(invalidState.itemPlacements["healing-potion"], {
      type: "inventory",
    });
  }
});

test("using the potion in combat commits healing, retaliation, and defeat atomically", () => {
  const runtime = resolveAdventure("chapel");
  let state = takePotion(runtime).state;
  state = { ...state, fighter: { ...state.fighter, hp: 3 } };
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ruined chapel",
  }).state;
  const initiative = [10, 5];
  state = runtime.handleAction(
    state,
    { type: "move", destination: "crypt" },
    { roll: () => initiative.shift() },
  ).state;

  const rolls = [1, 1, 15, 6];
  const used = runtime.handleAction(
    state,
    runtime.parseCommand("use healing potion"),
    { roll: () => rolls.shift() },
  );
  assert.equal(used.rejection, undefined);
  assert.equal(used.state.fighter.hp, 0);
  assert.equal(used.state.status, "defeat");
  assert.deepEqual(used.state.itemPlacements["healing-potion"], {
    type: "consumed",
  });
  assert.deepEqual(
    used.events.map(({ type }) => type),
    ["chapel-item-used", "turn-started", "attack-resolved", "combat-ended"],
  );
  assert.equal(used.events[0].actualHealing, 4);
  assert.equal(used.events[2].damage, 8);
});

test("strict potion tools expose only visible pickup and owned use references", () => {
  const runtime = resolveAdventure("chapel");
  const pathState = reachChapelPath(runtime);
  const takeTool = runtime
    .getGameToolDefinitions(pathState)
    .find(({ name }) => name === "take");
  assert.deepEqual(takeTool.parameters.properties.itemId.enum, [
    "healing-potion",
  ]);
  assert.equal(
    runtime
      .getGameToolDefinitions(pathState)
      .some(({ name }) => name === "use_item"),
    false,
  );

  const taken = runtime.dispatchGameTool(pathState, {
    name: "take",
    argumentsJson: '{"itemId":"healing-potion"}',
  });
  assert.equal(taken.modelOutput.ok, true);
  const useTool = runtime
    .getGameToolDefinitions(taken.state)
    .find(({ name }) => name === "use_item");
  assert.deepEqual(useTool.parameters, {
    type: "object",
    properties: {
      itemId: { type: "string", enum: ["healing-potion"] },
    },
    required: ["itemId"],
    additionalProperties: false,
  });

  for (const argumentsJson of [
    '{"itemId":"signet"}',
    '{"itemId":"healing-potion","healing":99}',
  ]) {
    const rejected = runtime.dispatchGameTool(taken.state, {
      name: "use_item",
      argumentsJson,
    });
    assert.equal(rejected.modelOutput.ok, false);
    assert.equal(rejected.state, taken.state);
  }
});

test("provider failure after potion use preserves exactly one committed result", async () => {
  const runtime = resolveAdventure("chapel");
  const taken = takePotion(runtime).state;
  const state = {
    ...taken,
    fighter: { ...taken.fighter, hp: 12 },
  };
  let response = 0;
  const healingRolls = [2, 4];
  const result = await runDmTurn({
    state,
    runtime,
    playerInput: "Drink the healing potion",
    transcript: [],
    random: { roll: () => healingRolls.shift() },
    model: {
      async respond() {
        response += 1;
        if (response === 1) {
          return {
            toolCalls: [
              {
                id: "drink-potion",
                name: "use_item",
                argumentsJson: '{"itemId":"healing-potion"}',
              },
            ],
          };
        }
        throw new Error("provider failed after healing");
      },
    },
  });

  assert.equal(result.state.fighter.hp, 20);
  assert.deepEqual(result.state.itemPlacements["healing-potion"], {
    type: "consumed",
  });
  assert.equal(result.toolResults.length, 1);
  assert.deepEqual(result.toolResults[0].rolls, [
    { sides: 4, value: 2 },
    { sides: 4, value: 4 },
  ]);
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.match(result.narration, /authoritative result.*Mechanics/i);
});

test("seed 7 command play records exact potion draws and rejects trace tampering", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-potion-trace-"));
  try {
    const tracePath = path.join(directory, "command.json");
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "7",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input:
          "move chapel path\ntake potion\nmove ruined chapel\nmove crypt\nuse potion\ninventory\nquit\n",
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Visible items: healing potion/i);
    assert.match(played.stdout, /d4 rolls: 2, 2/i);
    assert.match(played.stdout, /Actual healing: 6/i);
    assert.match(played.stdout, /Healing potion: consumed/i);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    const used = trace.actions.find(({ action }) => action.type === "use");
    assert.deepEqual(used.rolls, [
      { sides: 4, value: 2 },
      { sides: 4, value: 2 },
      { sides: 20, value: 5 },
    ]);
    assert.equal(used.stateAfter.fighter.hp, 15);
    assert.equal(
      used.stateAfter.itemPlacements["healing-potion"].type,
      "consumed",
    );
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      { encoding: "utf8" },
    );
    assert.equal(replayed.status, 0, replayed.stderr);

    const consumptionTampered = structuredClone(trace);
    consumptionTampered.actions.find(
      ({ action }) => action.type === "use",
    ).stateAfter.itemPlacements["healing-potion"] = {
      type: "inventory",
    };
    const consumptionTamperedPath = path.join(
      directory,
      "tampered-consumption.json",
    );
    writeFileSync(consumptionTamperedPath, JSON.stringify(consumptionTampered));
    const rejectedConsumption = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", consumptionTamperedPath],
      { encoding: "utf8" },
    );
    assert.notEqual(rejectedConsumption.status, 0);
    assert.match(rejectedConsumption.stderr, /replay divergence.*state/is);

    used.rolls[0].value = 4;
    const tamperedPath = path.join(directory, "tampered.json");
    writeFileSync(tamperedPath, JSON.stringify(trace));
    const tampered = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tamperedPath],
      { encoding: "utf8" },
    );
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /replay divergence.*rolls/is);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("seed 3 CLI rejects invalid uses and caps out-of-combat healing", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-potion-cap-"));
  try {
    const tracePath = path.join(directory, "command.json");
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "3",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input:
          "move chapel path\ntake potion\nuse potion\nmove ruined chapel\nmove crypt\nattack skeleton\nattack skeleton\nattack skeleton\nuse potion\nuse potion\nquit\n",
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /already at full HP.*remains available/i);
    assert.match(played.stdout, /d4 rolls: 1, 3.*Actual healing: 5/is);
    assert.match(played.stdout, /do not have that usable item available/i);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    const uses = trace.actions.filter(({ action }) => action.type === "use");
    assert.deepEqual(
      uses.map(({ rolls }) => rolls),
      [
        [],
        [
          { sides: 4, value: 1 },
          { sides: 4, value: 3 },
        ],
        [],
      ],
    );
    assert.deepEqual(uses[0].result, {
      type: "rejected",
      rejection: { reason: "chapel-full-hp" },
    });
    assert.equal(uses[1].stateAfter.fighter.hp, 20);
    assert.equal(uses[1].result.events[0].rolledHealing, 6);
    assert.equal(uses[1].result.events[0].actualHealing, 5);
    assert.deepEqual(uses[2].result, {
      type: "rejected",
      rejection: { reason: "chapel-item-unavailable" },
    });
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      { encoding: "utf8" },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("seed 15 CLI makes combat potion use atomic through lethal retaliation", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-potion-defeat-"));
  try {
    const tracePath = path.join(directory, "command.json");
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "15",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input:
          "move chapel path\ntake potion\nmove ruined chapel\nmove crypt\nattack skeleton\nattack skeleton\nattack skeleton\nattack skeleton\nuse potion\nquit\n",
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /d4 rolls: 2, 1/i);
    assert.match(played.stdout, /skeleton guardian defeats you/i);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    const used = trace.actions.find(({ action }) => action.type === "use");
    assert.deepEqual(
      used.result.events.map(({ type }) => type),
      ["chapel-item-used", "turn-started", "attack-resolved", "combat-ended"],
    );
    assert.equal(used.result.events[2].damage, 14);
    assert.equal(used.stateAfter.status, "defeat");
    assert.equal(used.stateAfter.fighter.hp, 0);
    assert.equal(
      used.stateAfter.itemPlacements["healing-potion"].type,
      "consumed",
    );
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      { encoding: "utf8" },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("scripted AI recovery keeps potion use committed and local status reads replay", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-potion-ai-"));
  try {
    const tracePath = path.join(directory, "dm.json");
    const scriptPath = path.join(directory, "script.json");
    const tool = (id, name, argumentsJson) => ({
      toolCalls: [{ id, name, argumentsJson }],
    });
    writeFileSync(
      scriptPath,
      JSON.stringify([
        tool("path", "move", '{"destinationId":"chapel-path"}'),
        { text: "You follow the chapel path." },
        tool("take", "take", '{"itemId":"healing-potion"}'),
        { text: "You secure the potion." },
        tool("chapel", "move", '{"destinationId":"ruined-chapel"}'),
        { text: "You enter the ruined chapel." },
        tool("crypt", "move", '{"destinationId":"crypt"}'),
        { text: "The skeleton strikes before you can act." },
        tool("drink", "use_item", '{"itemId":"healing-potion"}'),
      ]),
    );
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "7",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input:
          "Follow the chapel path.\nTake the potion.\nEnter the ruined chapel.\nEnter the crypt.\nDrink the potion.\nstatus\ninventory\nquit\n",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /authoritative result.*Mechanics/is);
    assert.match(played.stdout, /Fighter HP: 15\/20/i);
    assert.match(played.stdout, /Healing potion: consumed/i);

    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns[4].diagnostics[0].code, "model-failure");
    assert.equal(trace.turns[4].calls.length, 1);
    assert.deepEqual(trace.turns[4].calls[0].rolls, [
      { sides: 4, value: 2 },
      { sides: 4, value: 2 },
      { sides: 20, value: 5 },
    ]);
    assert.deepEqual(
      trace.turns.slice(5).map(({ kind }) => kind),
      ["local-status", "local-inventory", "local-quit"],
    );
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      {
        encoding: "utf8",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: "" },
      },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("guardian-v5 remains item-free through its historical runtime", () => {
  const runtime = resolveHistoricalAdventure(
    "chapel-guardian-rules-v5",
    "chapel-guardian-v5",
    "chapel",
  );
  const initialState = runtime.createSession();
  assert.equal("itemPlacements" in initialState, false);
  const moved = runtime.handleAction(initialState, {
    type: "move",
    destination: "chapel path",
  });
  const quit = runtime.handleAction(moved.state, { type: "quit" });
  assert.deepEqual(runtime.parseCommand("take potion"), {
    type: "unknown",
    input: "take potion",
  });
  assert.ok(
    !runtime
      .getGameToolDefinitions?.(moved.state)
      ?.some(({ name }) => name === "take" || name === "use_item"),
  );
  const historicalLook = runtime.dispatchGameTool(moved.state, {
    name: "look",
    argumentsJson: "{}",
  });
  assert.deepEqual(historicalLook.modelOutput.scene.room.items, []);

  const directory = mkdtempSync(path.join(tmpdir(), "chapel-guardian-v5-"));
  try {
    const tracePath = path.join(directory, "guardian.json");
    writeFileSync(
      tracePath,
      JSON.stringify({
        formatVersion: 3,
        rulesVersion: "chapel-guardian-rules-v5",
        adventure: { id: "chapel", version: "chapel-guardian-v5" },
        random: { algorithm: "mulberry32-v1", initialSeed: 7 },
        initialState,
        actions: [
          {
            sequence: 1,
            rawInput: "move chapel path",
            action: { type: "move", destination: "chapel path" },
            rolls: [],
            result: { type: "accepted", events: moved.events },
            stateAfter: moved.state,
          },
          {
            sequence: 2,
            rawInput: "quit",
            action: { type: "quit" },
            rolls: [],
            result: { type: "accepted", events: quit.events },
            stateAfter: quit.state,
          },
        ],
        completion: { reason: "quit", outcome: "incomplete" },
      }),
    );
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      { encoding: "utf8" },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
