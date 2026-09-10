import assert from "node:assert/strict";
import test from "node:test";

import { ADVENTURE } from "../dist/adventure.js";
import { createSession, handleAction } from "../dist/session.js";

function enterCombat(
  state = createSession(),
  initiativeRolls = [
    { sides: 20, value: 10 },
    { sides: 20, value: 5 },
  ],
) {
  const opened = handleAction(state, {
    type: "open",
    target: "wooden door",
  });
  const initiative = scriptedRoller(initiativeRolls);
  return handleAction(
    opened.state,
    {
      type: "move",
      destination: "guardroom",
    },
    initiative.random,
  );
}

function scriptedRoller(expectedRolls) {
  let drawCount = 0;
  return {
    random: {
      roll(sides) {
        const expected = expectedRolls[drawCount];
        assert.ok(expected, `unexpected d${sides} draw ${drawCount + 1}`);
        assert.equal(sides, expected.sides);
        drawCount += 1;
        return expected.value;
      },
    },
    get drawCount() {
      return drawCount;
    },
  };
}

function attackEvents(result) {
  return result.events.filter((event) => event.type === "attack-resolved");
}

test("combat statistics live in the adventure definitions", () => {
  assert.deepEqual(ADVENTURE.fighter, {
    maxHp: 20,
    armorClass: 16,
    attackBonus: 5,
    initiativeBonus: 1,
    weaponId: "longsword",
  });
  assert.deepEqual(ADVENTURE.equipment.longsword.damage, {
    dice: 1,
    sides: 8,
    modifier: 3,
  });
  assert.deepEqual(ADVENTURE.opponents.goblin, {
    id: "goblin",
    name: "goblin",
    maxHp: 7,
    armorClass: 13,
    attackBonus: 4,
    initiativeBonus: 2,
    attackName: "scimitar",
    damage: { dice: 1, sides: 6, modifier: 2 },
    roomId: "guardroom",
  });
});

test("entering the guardroom rolls visible fighter-first initiative once", () => {
  const result = enterCombat();

  assert.equal(result.state.locationId, "guardroom");
  assert.deepEqual(result.state.combat, {
    opponentId: "goblin",
    initiative: {
      fighter: { combatantId: "fighter", roll: 10, bonus: 1, total: 11 },
      goblin: { combatantId: "goblin", roll: 5, bonus: 2, total: 7 },
    },
    turnOrder: ["fighter", "goblin"],
    currentTurn: "fighter",
  });
  assert.deepEqual(result.events.slice(-4), [
    { type: "combat-started", opponentId: "goblin" },
    {
      type: "initiative-rolled",
      combatantId: "fighter",
      roll: 10,
      bonus: 1,
      total: 11,
    },
    {
      type: "initiative-rolled",
      combatantId: "goblin",
      roll: 5,
      bonus: 2,
      total: 7,
    },
    { type: "turn-started", combatantId: "fighter" },
  ]);
});

test("a goblin initiative win resolves one opening attack before the fighter turn", () => {
  const result = enterCombat(createSession(), [
    { sides: 20, value: 1 },
    { sides: 20, value: 20 },
    { sides: 20, value: 1 },
  ]);

  assert.deepEqual(result.state.combat.turnOrder, ["goblin", "fighter"]);
  assert.equal(result.state.combat.currentTurn, "fighter");
  assert.deepEqual(attackEvents(result), [
    {
      type: "attack-resolved",
      attackerId: "goblin",
      targetId: "fighter",
      attackRoll: 1,
      attackBonus: 4,
      attackTotal: 5,
      targetArmorClass: 16,
      outcome: "miss",
      targetHp: 20,
      targetMaxHp: 20,
    },
  ]);
  assert.deepEqual(result.events.at(-1), {
    type: "turn-started",
    combatantId: "fighter",
  });
});

test("initiative ties favour the fighter", () => {
  const result = enterCombat(createSession(), [
    { sides: 20, value: 10 },
    { sides: 20, value: 9 },
  ]);

  assert.equal(result.state.combat.initiative.fighter.total, 11);
  assert.equal(result.state.combat.initiative.goblin.total, 11);
  assert.deepEqual(result.state.combat.turnOrder, ["fighter", "goblin"]);
  assert.equal(attackEvents(result).length, 0);
  assert.deepEqual(result.events.at(-1), {
    type: "turn-started",
    combatantId: "fighter",
  });
});

test("a lethal goblin opening attack ends combat without a pending fighter turn", () => {
  const initial = createSession();
  const wounded = {
    ...initial,
    fighter: { ...initial.fighter, hp: 3 },
  };
  const result = enterCombat(wounded, [
    { sides: 20, value: 1 },
    { sides: 20, value: 20 },
    { sides: 20, value: 12 },
    { sides: 6, value: 1 },
  ]);

  assert.equal(result.state.status, "defeat");
  assert.equal(result.state.fighter.hp, 0);
  assert.deepEqual(result.events.at(-1), {
    type: "combat-ended",
    outcome: "fighter-defeated",
  });
  assert.equal(
    result.events
      .slice(
        result.events.findIndex((event) => event.type === "attack-resolved"),
      )
      .some(
        (event) =>
          event.type === "turn-started" && event.combatantId === "fighter",
      ),
    false,
  );
});

test("initiative order is retained across rounds and never rerolled", () => {
  const initial = createSession();
  const opened = handleAction(initial, {
    type: "open",
    target: "wooden door",
  });
  const rolls = scriptedRoller([
    { sides: 20, value: 10 },
    { sides: 20, value: 5 },
    { sides: 20, value: 1 },
    { sides: 20, value: 1 },
    { sides: 20, value: 20 },
    { sides: 8, value: 4 },
    { sides: 8, value: 4 },
  ]);
  const entered = handleAction(
    opened.state,
    { type: "move", destination: "guardroom" },
    rolls.random,
  );
  const firstRound = handleAction(
    entered.state,
    { type: "attack", target: "goblin" },
    rolls.random,
  );
  const secondRound = handleAction(
    firstRound.state,
    { type: "attack", target: "goblin" },
    rolls.random,
  );

  assert.deepEqual(firstRound.state.combat.turnOrder, ["fighter", "goblin"]);
  assert.equal(
    firstRound.events.some((event) => event.type === "initiative-rolled"),
    false,
  );
  assert.equal(
    secondRound.events.some((event) => event.type === "initiative-rolled"),
    false,
  );
  assert.equal(rolls.drawCount, 7);
});

test("natural 1 misses without damage and an ordinary total equal to AC hits", () => {
  const combat = enterCombat().state;
  const missRolls = scriptedRoller([
    { sides: 20, value: 1 },
    { sides: 20, value: 1 },
  ]);
  const miss = handleAction(
    combat,
    { type: "attack", target: "goblin" },
    missRolls.random,
  );

  assert.equal(miss.state.opponents.goblin.hp, 7);
  assert.equal(miss.state.fighter.hp, 20);
  assert.equal(missRolls.drawCount, 2);
  assert.deepEqual(attackEvents(miss), [
    {
      type: "attack-resolved",
      attackerId: "fighter",
      targetId: "goblin",
      attackRoll: 1,
      attackBonus: 5,
      attackTotal: 6,
      targetArmorClass: 13,
      outcome: "miss",
      targetHp: 7,
      targetMaxHp: 7,
    },
    {
      type: "attack-resolved",
      attackerId: "goblin",
      targetId: "fighter",
      attackRoll: 1,
      attackBonus: 4,
      attackTotal: 5,
      targetArmorClass: 16,
      outcome: "miss",
      targetHp: 20,
      targetMaxHp: 20,
    },
  ]);

  const hitRolls = scriptedRoller([
    { sides: 20, value: 8 },
    { sides: 8, value: 1 },
    { sides: 20, value: 1 },
  ]);
  const hit = handleAction(
    combat,
    { type: "attack", target: "goblin" },
    hitRolls.random,
  );
  assert.equal(hit.state.opponents.goblin.hp, 3);
  assert.equal(attackEvents(hit)[0].attackTotal, 13);
  assert.equal(attackEvents(hit)[0].damage, 4);
});

test("an ordinary total below AC misses without rolling damage", () => {
  const rolls = scriptedRoller([
    { sides: 20, value: 7 },
    { sides: 20, value: 1 },
  ]);
  const result = handleAction(
    enterCombat().state,
    { type: "attack", target: "goblin" },
    rolls.random,
  );

  assert.equal(result.state.opponents.goblin.hp, 7);
  assert.equal(attackEvents(result)[0].attackTotal, 12);
  assert.equal(attackEvents(result)[0].outcome, "miss");
  assert.equal(rolls.drawCount, 2);
});

test("natural 20 doubles weapon dice, adds the modifier once, and prevents retaliation when lethal", () => {
  const rolls = scriptedRoller([
    { sides: 20, value: 20 },
    { sides: 8, value: 8 },
    { sides: 8, value: 7 },
  ]);
  const result = handleAction(
    enterCombat().state,
    { type: "attack", target: "goblin" },
    rolls.random,
  );

  assert.equal(result.state.opponents.goblin.hp, 0);
  assert.equal(result.state.fighter.hp, 20);
  assert.equal(rolls.drawCount, 3);
  assert.deepEqual(attackEvents(result), [
    {
      type: "attack-resolved",
      attackerId: "fighter",
      targetId: "goblin",
      attackRoll: 20,
      attackBonus: 5,
      attackTotal: 25,
      targetArmorClass: 13,
      outcome: "critical-hit",
      damage: 18,
      targetHp: 0,
      targetMaxHp: 7,
    },
  ]);
  assert.deepEqual(result.events.at(-1), {
    type: "combat-ended",
    outcome: "goblin-defeated",
  });
});

test("a surviving goblin retaliates once and lethal retaliation immediately defeats the fighter", () => {
  const combat = enterCombat().state;
  const wounded = {
    ...combat,
    fighter: { ...combat.fighter, hp: 3 },
  };
  const rolls = scriptedRoller([
    { sides: 20, value: 1 },
    { sides: 20, value: 12 },
    { sides: 6, value: 1 },
  ]);
  const result = handleAction(
    wounded,
    { type: "attack", target: "goblin" },
    rolls.random,
  );

  assert.equal(result.state.fighter.hp, 0);
  assert.equal(result.state.status, "defeat");
  assert.equal(attackEvents(result).length, 2);
  assert.deepEqual(result.events.at(-1), {
    type: "combat-ended",
    outcome: "fighter-defeated",
  });
});

test("combat and defeat guards reject gameplay mutations without consuming draws", () => {
  const combat = enterCombat().state;
  const rolls = scriptedRoller([]);

  for (const action of [
    { type: "move", destination: "reliquary" },
    { type: "open", target: "wooden door" },
    { type: "take", target: "signet" },
    { type: "leave" },
  ]) {
    const result = handleAction(combat, action, rolls.random);
    assert.deepEqual(result.state, combat);
    assert.deepEqual(result.rejection, { reason: "combat-restriction" });
  }

  for (const action of [
    { type: "attack" },
    { type: "attack", target: "fighter" },
    { type: "empty" },
    { type: "unknown", input: "sing" },
  ]) {
    const result = handleAction(combat, action, rolls.random);
    assert.deepEqual(result.state, combat);
    assert.ok(result.rejection);
  }

  for (const action of [
    { type: "help" },
    { type: "look" },
    { type: "inspect", target: "cold hearth" },
    { type: "status" },
    { type: "inventory" },
  ]) {
    const result = handleAction(combat, action, rolls.random);
    assert.deepEqual(result.state, combat);
    assert.equal(result.rejection, undefined);
  }
  assert.equal(rolls.drawCount, 0);

  const defeated = {
    ...combat,
    status: "defeat",
    fighter: { ...combat.fighter, hp: 0 },
  };
  const mutation = handleAction(
    defeated,
    { type: "attack", target: "goblin" },
    rolls.random,
  );
  assert.deepEqual(mutation.rejection, {
    reason: "terminal-state",
    status: "defeat",
  });
  assert.equal(handleAction(defeated, { type: "status" }).rejection, undefined);
  assert.equal(handleAction(defeated, { type: "help" }).rejection, undefined);
  assert.deepEqual(handleAction(defeated, { type: "quit" }).state, defeated);
  assert.equal(rolls.drawCount, 0);
});

test("a defeated goblin stays dead when the guardroom is revisited", () => {
  const lethal = scriptedRoller([
    { sides: 20, value: 20 },
    { sides: 8, value: 8 },
    { sides: 8, value: 8 },
  ]);
  const won = handleAction(
    enterCombat().state,
    { type: "attack", target: "goblin" },
    lethal.random,
  );
  const onward = handleAction(won.state, {
    type: "move",
    destination: "reliquary",
  });
  const returned = handleAction(onward.state, {
    type: "move",
    destination: "guardroom",
  });
  const noDraws = scriptedRoller([]);
  const deadTarget = handleAction(
    returned.state,
    { type: "attack", target: "goblin" },
    noDraws.random,
  );

  assert.equal(returned.state.opponents.goblin.hp, 0);
  assert.equal(
    returned.events.some((event) => event.type === "combat-started"),
    false,
  );
  assert.deepEqual(deadTarget.rejection, {
    reason: "dead-target",
    targetId: "goblin",
  });
  assert.equal(noDraws.drawCount, 0);
});
