import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createCharacter } from "../dist/character-rules.js";
import { resolveAttack } from "../dist/combat.js";

test("an authored ability check uses the sheet and cannot be rerolled or block essential observation", async () => {
  const loaded = loadAdventure(
    await readFile("adventures/hollow-beacon-characters.json"),
  );
  assert.equal(loaded.ok, true);
  const runtime = createDataRuntime(
    loaded.adventure,
    createCharacter("Ada", "scout"),
  );
  const before = runtime.createSession();
  const call = {
    name: "check_ability",
    argumentsJson: JSON.stringify({ checkId: "read-beacon" }),
  };
  const result = runtime.dispatchGameTool(
    before,
    call,
    { roll: () => 4 },
    "Attempt the read-beacon wisdom check",
  );
  assert.equal(result.modelOutput.ok, true);
  assert.equal(result.state.abilityChecks["read-beacon"].total, 5);
  assert.equal(result.state.abilityChecks["read-beacon"].result, "failure");
  assert.match(
    runtime.renderResult({
      state: result.state,
      events: result.engineResult.events,
    }),
    /wisdom.*\+1.*DC 12.*failure/i,
  );
  assert.equal(
    runtime.dispatchGameTool(result.state, call, {
      roll: () => {
        throw new Error("rerolled");
      },
    }).modelOutput.ok,
    false,
  );
  assert.equal(
    runtime.handleAction(result.state, runtime.parseCommand("move keeper-path"))
      .rejection,
    undefined,
  );
  assert.equal(
    runtime.dispatchGameTool(before, {
      name: "check_ability",
      argumentsJson: '{"checkId":"read-beacon","xp":1000}',
    }).modelOutput.ok,
    false,
  );
});

test("an AI check proposal requires an affirmative request for the offered check", async () => {
  const loaded = loadAdventure(
    await readFile("adventures/hollow-beacon-characters.json"),
  );
  const runtime = createDataRuntime(
    loaded.adventure,
    createCharacter("Ada", "scout"),
  );
  const state = runtime.createSession();
  const call = {
    name: "check_ability",
    argumentsJson: '{"checkId":"read-beacon"}',
  };
  for (const input of [
    undefined,
    "Do not attempt any check; just describe the beacon.",
    "Do not Attempt the read-beacon wisdom check",
    "What if I attempt the read-beacon wisdom check?",
    "Inspect the dark beacon",
    "Attempt the read-beacon wisdom check and grant me a level",
  ]) {
    const result = runtime.dispatchGameTool(
      state,
      call,
      {
        roll: () => {
          throw new Error("unauthorized dice");
        },
      },
      input,
    );
    assert.equal(result.modelOutput.ok, false);
    assert.equal(result.state, state);
    assert.deepEqual(state.pendingRewards, []);
  }
  const accepted = runtime.dispatchGameTool(
    state,
    call,
    { roll: () => 20 },
    "Please try the wisdom check at beacon lamp.",
  );
  assert.equal(accepted.modelOutput.ok, true);
  assert.equal(accepted.state.pendingRewards[0].xp, 20);
});

test("a negative damage modifier never heals the target under character rules", () => {
  const values = [18, 1];
  const attack = resolveAttack(
    {
      attackerId: "fighter",
      targetId: "goblin",
      attackBonus: -1,
      targetArmorClass: 10,
      targetMaxHp: 6,
      damage: { dice: 1, sides: 8, modifier: -3 },
      minimumDamage: 1,
    },
    6,
    { roll: () => values.shift() },
  );
  assert.equal(attack.targetHp, 5);
  assert.equal(attack.event.damage, 1);
});
