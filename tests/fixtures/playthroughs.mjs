// Seeded playthroughs of every fixture module (#156): a fighter picks a random
// enabled action from the bar at each step. The bar-projection tests (#156,
// #182, #183) check each state these reach, and the engine action each
// projected action stands for is mapped here once, so a new kind of action
// can't leave one test's copy behind.
import assert from "node:assert/strict";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../../dist/fighter-5e.js";
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";
import { FIXTURE_MODULES } from "./modules.mjs";

export const PLAYER = "pc";

// The #156 fighter: Con 14 (+2), 12 HP at level 1.
export const ada = buildFighter(
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

/** Ada at level 2, at full health, so she has Action Surge. */
export function veteran() {
  const xp = 300;
  const leveled = { ...ada, xp, level: levelForXp(xp) };
  return validateFighter({ ...leveled, hp: fighterProfile(leveled).maxHp });
}

/**
 * The engine action a projected action stands for, as the browser server
 * makes it from a click: every `ActionKind` in `src/runtime-5e.ts`.
 */
export function engineAction({ action, target }) {
  switch (action) {
    case "attack":
    case "light-attack":
      return { type: action, actorId: PLAYER, targetId: target.id };
    case "second-wind":
    case "action-surge":
    case "end-turn":
      return { type: action, actorId: PLAYER };
    case "use":
      return { type: "use-item", itemId: target.id };
    case "move":
      return { type: "move", destinationId: target.id };
    case "examine":
      return { type: "examine", targetId: target.id };
    case "take":
      return { type: "take", itemId: target.id };
    case "equip":
    case "unequip":
    case "swap":
    case "drop":
    case "buy":
    case "sell":
    case "sell-treasure":
      return { type: action, itemId: target.id };
    case "sell-equipped":
      return { type: "sell", itemId: target.id, equipped: true };
    case "force":
    case "pick":
    case "break":
    case "unlock":
      return { type: action, doorId: target.id };
    case "search":
      return { type: "search", roomId: target.id };
    case "disarm":
      return { type: "disarm", trapId: target.id };
    case "talk":
      return { type: "talk", topicId: target.id };
    case "leave":
      return { type: "leave", roomId: target.id };
    default:
      // A new kind must be mapped above, not guessed at.
      throw new Error(`no engine action for ${action}`);
  }
}

/**
 * Every state of the #156 seeded playthroughs: each fixture module, 25 seeds,
 * alternating Ada at level 1 and the veteran, up to 60 steps each, ending
 * state included. Each step plays a random enabled action, which the engine
 * must accept.
 */
export function* playthroughStates() {
  for (const adventure of FIXTURE_MODULES) {
    for (let seed = 0; seed < 25; seed++) {
      const runtime = createFifthRuntime(
        adventure,
        seed % 2 === 0 ? ada : veteran(),
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
        assert.ok(enabled.length > 0, "a playing session can always act");
        const chosen = enabled[random.roll(enabled.length) - 1];
        const result = runtime.handleAction(
          state,
          engineAction(chosen),
          random,
        );
        assert.equal(result.rejection, undefined, result.rejection?.reason);
        state = result.state;
      }
      yield { runtime, state, seed };
    }
  }
}
