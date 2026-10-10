// #333: feature uses become a map keyed by feature id, read from class data,
// with what a short rest and a long rest each restore; the adventure session
// tracks a hit-dice pool. No rest is offered yet, so play doesn't change.
import assert from "node:assert/strict";
import test from "node:test";

import { characterProfile, nextLevelXp } from "../dist/character-5e.js";
import { FIGHTER } from "../dist/fighter-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import {
  createFifthRuntime,
  playerCombatant,
  startingResources,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { TEST_ROGUE } from "../dist/test-rogue-5e.js";
import { goblinBand } from "./fixtures/modules.mjs";

const LEVELS = [1, 2, 3, 4, 5];

/** A sheet raised to `level` with the least XP it needs, at full health. */
function raised(sheet, level) {
  const xp = level === 1 ? 0 : nextLevelXp(level - 1);
  const at = { ...sheet, level, xp };
  return { ...at, hp: characterProfile(at).maxHp };
}

// What the two hard-coded counters gave before #333, level by level.
const GOLDEN = {
  fighter: {
    maxHp: [12, 20, 28, 36, 44],
    secondWind: [2, 2, 2, 3, 3],
    actionSurge: [0, 1, 1, 1, 1],
  },
  rogue: {
    maxHp: [9, 15, 21, 27, 33],
    secondWind: [0, 0, 0, 0, 0],
    actionSurge: [0, 0, 0, 0, 0],
  },
};

for (const sheet of [TEST_FIGHTER, TEST_ROGUE]) {
  test(`golden: the ${sheet.class} derives the same feature uses and HP at every level`, () => {
    const golden = GOLDEN[sheet.class];
    for (const [index, level] of LEVELS.entries()) {
      const at = raised(sheet, level);
      const profile = characterProfile(at);
      const max = (id) => profile.featureUses[id]?.max ?? 0;
      assert.equal(profile.maxHp, golden.maxHp[index], `level ${level} HP`);
      assert.equal(max("second-wind"), golden.secondWind[index]);
      assert.equal(max("action-surge"), golden.actionSurge[index]);
      // Only features with uses at this level are in the map.
      assert.deepEqual(Object.keys(profile.featureUses).sort(), [
        ...(golden.actionSurge[index] > 0 ? ["action-surge"] : []),
        ...(golden.secondWind[index] > 0 ? ["second-wind"] : []),
      ]);
      // The adventure's resources start full, and the combatant reads them.
      const resources = startingResources(at);
      assert.deepEqual(
        resources.featureUses,
        Object.fromEntries(
          Object.entries(profile.featureUses).map(([id, { max }]) => [id, max]),
        ),
      );
      const pc = playerCombatant(at, resources);
      assert.equal(pc.hp, golden.maxHp[index]);
      assert.equal(pc.secondWind?.uses ?? 0, golden.secondWind[index]);
      assert.equal(pc.secondWind?.max ?? 0, golden.secondWind[index]);
      assert.equal(pc.actionSurge?.uses ?? 0, golden.actionSurge[index]);
      assert.equal(pc.actionSurge?.max ?? 0, golden.actionSurge[index]);
    }
  });
}

test("class data records SRD 5.2 recovery for each feature with uses", () => {
  const recovery = (definition, id) =>
    definition.features.find((feature) => feature.id === id).recovery;
  assert.deepEqual(recovery(FIGHTER, "second-wind"), {
    shortRest: 1,
    longRest: "all",
  });
  assert.deepEqual(recovery(FIGHTER, "action-surge"), {
    shortRest: "all",
    longRest: "all",
  });
  // Every feature with uses says how they come back.
  for (const definition of [FIGHTER, ROGUE]) {
    for (const feature of [
      ...definition.features,
      ...definition.subclasses.flatMap(({ features }) => features),
    ]) {
      assert.equal(
        feature.uses === undefined,
        feature.recovery === undefined,
        feature.id,
      );
    }
  }
  const profile = characterProfile(raised(TEST_FIGHTER, 2));
  assert.deepEqual(profile.featureUses["second-wind"], {
    max: 2,
    recovery: { shortRest: 1, longRest: "all" },
  });
});

test("the hit-dice pool is the class hit die × level, all available at the start", () => {
  for (const [sheet, sides] of [
    [TEST_FIGHTER, 10],
    [TEST_ROGUE, 8],
  ]) {
    for (const level of LEVELS) {
      const at = raised(sheet, level);
      assert.deepEqual(characterProfile(at).hitDice, { count: level, sides });
      assert.equal(startingResources(at).hitDice, level);
    }
  }
});

test("the session shows hit dice available, in its state and the AI DM's status", () => {
  const sheet = raised(TEST_FIGHTER, 3);
  const session = FifthSession.begin(0, goblinBand, sheet);
  assert.equal(session.state.character.hitDice, 3);
  const runtime = createFifthRuntime(goblinBand, sheet);
  assert.deepEqual(runtime.projectHitDice(session.state), {
    available: 3,
    total: 3,
    sides: 10,
  });
  assert.ok(
    runtime
      .projectCharacterStatus(session.state)
      .resources.includes("Hit dice: 3 of 3 d10 left"),
  );
});

test("spending Second Wind is tracked in the feature-uses map", () => {
  const runtime = createFifthRuntime(goblinBand, TEST_FIGHTER);
  for (let seed = 0; seed < 200; seed += 1) {
    const session = FifthSession.begin(seed, goblinBand, TEST_FIGHTER);
    const options = runtime.projectFight(session.state).turn?.options ?? [];
    if (!options.includes("second-wind")) {
      continue;
    }
    const { state } = runtime.handleAction(
      session.state,
      { type: "second-wind", actorId: "pc" },
      { roll: (sides) => sides },
    );
    assert.deepEqual(state.character.featureUses, { "second-wind": 1 });
    assert.equal(state.character.hitDice, 1);
    return;
  }
  assert.fail("no seed where Ada may use Second Wind on her first turn");
});
