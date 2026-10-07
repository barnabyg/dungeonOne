// The lintel barrow with three Goblin Minions in the burial hall, each
// carrying its own pouch of coin, for the morale tests (#237): a goblin that
// flees takes its pouch with it.
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";
import { sessionSeed } from "../../dist/session-5e.js";
import { validateModule } from "./bestiary.mjs";
import { moduleFile } from "./modules.mjs";
import { firstFighter } from "./session-layout.mjs";

const barrow = moduleFile("lintel-barrow");

export const GOBLINS = ["goblin-1", "goblin-2", "goblin-3"];

/** The pouch each goblin carries, by goblin id. */
export const pouchOf = (goblinId) => `${goblinId}-pouch`;

export const fleeingGoblins = validateModule({
  ...barrow,
  id: "fleeing-goblins",
  title: "The Fleeing Goblins",
  rooms: barrow.rooms.map((room) =>
    room.id === "burial-hall"
      ? {
          ...room,
          features: [],
          items: GOBLINS.map((goblinId, index) => ({
            id: pouchOf(goblinId),
            name: `Goblin Pouch ${index + 1}`,
            description: "A greasy pouch of stolen coins.",
            kind: "coin",
            coins: { sp: index + 1 },
            hiddenIn: goblinId,
          })),
        }
      : room,
  ),
  encounters: [
    {
      id: "barrow-goblin",
      opponents: GOBLINS.map((goblinId, index) => ({
        id: goblinId,
        monster: "goblin-minion",
        name: `Goblin ${index + 1}`,
      })),
      defeatEndingId: "fallen-in-the-barrow",
    },
  ],
});

/**
 * Plays the burial hall's fight as the browser test does: Ada attacks the
 * first goblin offered, or ends her turn once her action is spent.
 */
export function fightThrough(runtime, state, random) {
  const events = [];
  let next = state;
  while (next.status === "playing" && next.encounter?.outcome === "ongoing") {
    const [target] = runtime.attackTargets(next);
    const result = runtime.handleAction(
      next,
      target === undefined
        ? { type: "end-turn", actorId: "pc" }
        : { type: "attack", actorId: "pc", targetId: target.id },
      random,
    );
    if (result.rejection !== undefined) {
      throw new Error(result.rejection.reason);
    }
    events.push(...result.events);
    next = result.state;
  }
  return { state: next, events };
}

/**
 * The first browser seed from `from` on which the burial hall's fight, played
 * by `fightThrough` with the character a fresh browser creates, is won with
 * at least one goblin fled and one defeated; with the runtime and the state
 * and events up to the win.
 */
export function fleeingSeed(from = 0) {
  for (let seed = from; seed < from + 500; seed++) {
    const runtime = createFifthRuntime(fleeingGoblins, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.createSession();
    const events = [];
    for (const action of [
      { type: "begin" },
      { type: "move", destinationId: "burial-hall" },
    ]) {
      const result = runtime.handleAction(state, action, random);
      events.push(...result.events);
      state = result.state;
    }
    const fought = fightThrough(runtime, state, random);
    events.push(...fought.events);
    if (
      fought.state.status === "playing" &&
      fought.state.fledOpponents.length > 0 &&
      fought.state.fledOpponents.length < GOBLINS.length
    ) {
      return { seed, runtime, random, state: fought.state, events };
    }
  }
  throw new Error("No seed in 500 has a goblin flee from a won fight.");
}
