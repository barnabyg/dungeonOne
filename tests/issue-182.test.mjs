// #182: the action projection is computed once per state and feeds the action
// bar, the room options, the attack targets and the AI DM's tools; and it
// rests on the engine refusing every action before it draws a die.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";

const adventures = await loadBuiltInFifthAdventures();

// The #156 fighter: Con 14 (+2), 12 HP at level 1.
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

/** Ada at level 2, at full health, so she has Action Surge. */
function veteran() {
  const xp = 300;
  const leveled = { ...sheet, xp, level: levelForXp(xp) };
  return validateFighter({ ...leveled, hp: fighterProfile(leveled).maxHp });
}

const PLAYER = "pc";

/** The engine action a projected action stands for. */
function engineAction({ action, target }) {
  switch (action) {
    case "attack":
      return { type: "attack", actorId: PLAYER, targetId: target.id };
    case "use":
      return { type: "use-item", itemId: target.id };
    case "move":
      return { type: "move", destinationId: target.id };
    case "examine":
      return { type: "examine", targetId: target.id };
    case "take":
      return { type: "take", itemId: target.id };
    default:
      return { type: action, actorId: PLAYER };
  }
}

/** Dice that count how many they have drawn. */
function countingDice(seed) {
  const random = createSeededRandom(seed);
  const dice = {
    drawn: 0,
    roll(sides) {
      dice.drawn += 1;
      return random.roll(sides);
    },
  };
  return dice;
}

/**
 * Every state of the #156 seeded playthroughs: both adventures, 25 seeds,
 * alternating a level-1 and a level-2 fighter.
 */
function* playthroughStates() {
  for (const adventure of adventures) {
    for (let seed = 0; seed < 25; seed++) {
      const runtime = createFifthRuntime(
        adventure,
        seed % 2 === 0 ? sheet : veteran(),
      );
      const random = createSeededRandom(seed);
      let state = runtime.handleAction(
        runtime.createSession(),
        { type: "begin" },
        random,
      ).state;
      for (let step = 0; step < 60 && state.status === "playing"; step++) {
        yield { runtime, state, seed };
        const enabled = runtime
          .projectActions(state)
          .filter(({ available }) => available);
        const chosen = enabled[random.roll(enabled.length) - 1];
        state = runtime.handleAction(state, engineAction(chosen), random).state;
      }
      yield { runtime, state, seed };
    }
  }
}

test("one tool listing dry-runs each projected action once, and the bar, room and targets reuse it (#182)", () => {
  let checked = 0;
  for (const adventure of adventures) {
    let dryRuns = 0;
    const runtime = createFifthRuntime(adventure, sheet, {
      dryRun: () => {
        dryRuns += 1;
      },
    });
    const random = createSeededRandom(3);
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    for (let step = 0; step < 30 && state.status === "playing"; step++) {
      // A fresh copy, in case an action handed back a state already seen.
      state = { ...state };
      dryRuns = 0;
      runtime.getGameToolDefinitions(state);
      const listing = dryRuns;
      const actions = runtime.projectActions(state);
      assert.equal(
        listing,
        actions.length,
        "one tool listing dry-runs each projected action exactly once",
      );
      runtime.projectRoom(state);
      runtime.attackTargets(state);
      runtime.projectFight(state);
      runtime.getGameToolDefinitions(state);
      assert.equal(dryRuns, listing, "the same state is projected only once");
      checked += 1;
      const enabled = actions.filter(({ available }) => available);
      const chosen = enabled[random.roll(enabled.length) - 1];
      state = runtime.handleAction(state, engineAction(chosen), random).state;
    }
  }
  assert.ok(checked > 10, `checked ${checked} states`);
});

test("no action is refused after it draws a die, in any state of the #156 playthroughs (#182)", () => {
  let refusals = 0;
  for (const { runtime, state, seed } of playthroughStates()) {
    for (const shown of runtime.projectActions(state)) {
      const dice = countingDice(seed);
      const result = runtime.handleAction(state, engineAction(shown), dice);
      if (result.rejection !== undefined) {
        refusals += 1;
        assert.equal(
          dice.drawn,
          0,
          `${JSON.stringify(shown)} was refused after drawing ${dice.drawn} dice: ${result.rejection.reason}`,
        );
      }
    }
  }
  assert.ok(refusals > 0, "the playthroughs include refused actions");
});
