// #347: the balance gate's cost with four classes. The harness projects
// only the spells it may cast, and heals only below its heal threshold, so
// it never dry-runs an action it would pass over, and it plays every run
// exactly as it would with the full projection.
import assert from "node:assert/strict";
import test from "node:test";

import {
  characterAtLevel,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import {
  CLASSES,
  creationAbilities,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { banditToll, goblinBand, ratTunnels } from "./fixtures/modules.mjs";
import { engineAction, lifeCleric } from "./fixtures/playthroughs.mjs";

const weakest = (classId, level, kit) => {
  const [character] = percentileCharacters({ percentiles: [5], classId });
  return characterAtLevel(
    character.dice,
    level,
    kit,
    false,
    undefined,
    classId,
  );
};

/**
 * A runtime that projects every action whatever the harness asks for, as
 * a runtime without the projection filters would.
 */
const unfiltered = (runtime) => ({
  ...runtime,
  projectActions: (state) => runtime.projectActions(state),
});

test("every class's runs are the same with the full projection (#347)", () => {
  const cases = [
    [goblinBand, weakest("fighter", 3)],
    [banditToll, weakest("rogue", 1)],
    [ratTunnels, weakest("cleric", 1)],
    [ratTunnels, weakest("wizard", 1)],
    [goblinBand, weakest("wizard", 1, "daggers")],
    [goblinBand, weakest("cleric", 5)],
    [banditToll, weakest("cleric", 3)],
  ];
  const healed = { spells: 0, secondWinds: 0, potions: 0 };
  for (const [adventure, sheet] of cases) {
    const runtime = createFifthRuntime(adventure, sheet);
    for (const style of ["cautious", "direct", "stealth-first"]) {
      for (let seed = 0; seed < 3; seed++) {
        const run = playAdventure(runtime, style, seed);
        assert.deepEqual(
          run,
          playAdventure(unfiltered(runtime), style, seed),
          `${adventure.id} ${sheet.class} ${style} seed ${seed}`,
        );
        for (const kind of Object.keys(healed)) {
          healed[kind] += run.healing[kind];
        }
      }
    }
  }
  // The runs heal, so the heals projected only when hurt are compared too.
  assert.ok(
    Object.values(healed).every((count) => count > 0),
    healed,
  );
});

test("a projection of chosen spells is the full projection without other spells' casts, and dry-runs no other spell (#347)", () => {
  const kinds = new Set(["attack", "cast", "move", "examine", "end-turn"]);
  const spells = new Set(["cure-wounds", "sacred-flame"]);
  let casts = 0;
  for (const [adventure, sheet] of [
    [ratTunnels, lifeCleric()],
    [goblinBand, weakest("cleric", 1)],
  ]) {
    const dryRun = [];
    const runtime = createFifthRuntime(adventure, sheet, {
      dryRun: (action) => dryRun.push(action),
    });
    for (let seed = 0; seed < 5; seed++) {
      const random = createSeededRandom(seed);
      let state = runtime.handleAction(
        runtime.createSession(),
        { type: "begin" },
        random,
      ).state;
      for (let step = 0; step < 60 && state.status === "playing"; step++) {
        const full = runtime
          .projectActions({ ...state })
          .filter(
            ({ action, spell }) =>
              kinds.has(action) && (action !== "cast" || spells.has(spell.id)),
          );
        dryRun.length = 0;
        const chosen = runtime.projectActions({ ...state }, kinds, spells);
        assert.deepEqual(chosen, full);
        assert.equal(dryRun.length, chosen.length);
        assert.ok(
          dryRun.every(
            ({ type, spellId }) => type !== "cast" || spells.has(spellId),
          ),
        );
        for (const [i, entry] of chosen.entries()) {
          assert.deepEqual(runtime.actionOf(entry), runtime.actionOf(full[i]));
        }
        casts += chosen.filter(({ action }) => action === "cast").length;
        const enabled = runtime
          .projectActions(state)
          .filter(({ available }) => available);
        const next = enabled[random.roll(enabled.length) - 1];
        state = runtime.handleAction(state, engineAction(next), random).state;
      }
    }
  }
  assert.ok(casts > 0, "some casts were projected");
});

test("a run whose reaction policy decided nothing is the run on the other policy (#347)", () => {
  const runtime = createFifthRuntime(banditToll, weakest("fighter", 1));
  let decided = 0;
  let undecided = 0;
  for (let seed = 0; seed < 40; seed++) {
    const attack = playAdventure(runtime, "cautious", seed);
    const peaceful = playAdventure(runtime, "cautious", seed, {
      reactions: "peaceful",
    });
    if (attack.reactionChoices === 0) {
      undecided += 1;
      assert.deepEqual(peaceful, attack, `seed ${seed}`);
    } else {
      decided += 1;
    }
  }
  assert.ok(decided > 0 && undecided > 0, `${decided} decided`);
});

test("a creation's ability scores are those of the character built from them, for every class (#347)", () => {
  const random = createSeededRandom(347);
  for (const classId of Object.keys(CLASSES)) {
    const definition = CLASSES[classId];
    for (let sample = 0; sample < 200; sample++) {
      const dice = rollAbilitySet(random);
      assert.deepEqual(
        creationAbilities(
          dice,
          defaultPlacement(dice, definition),
          definition.defaults.increase,
        ),
        characterAtLevel(dice, 1, undefined, false, undefined, classId)
          .abilities,
      );
    }
  }
});
