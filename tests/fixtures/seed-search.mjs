// Helpers for the tests that search for a browser seed by simulating Ada's
// clicks on the runtime: the same dice, and the fight played as the browser
// tests click it.

/**
 * Wraps `source`, recording each roll as `{ sides, value }` in the newest
 * list in `drawn`; push an empty list before each action to group its dice.
 */
export const recordingRandom = (source, drawn) => ({
  roll(sides) {
    const value = source.roll(sides);
    drawn.at(-1).push({ sides, value });
    return value;
  },
});

/**
 * One fight click as the browser tests make it: Ada attacks the first target
 * offered, or ends her turn once her action is spent. The runtime's result;
 * throws if the runtime refuses the action.
 */
export function attackOrEndTurn(runtime, state, random) {
  const [target] = runtime.attackTargets(state);
  const result = runtime.handleAction(
    state,
    target === undefined
      ? { type: "end-turn", actorId: "pc" }
      : { type: "attack", actorId: "pc", targetId: target.id },
    random,
  );
  if (result.rejection !== undefined) {
    throw new Error(result.rejection.reason);
  }
  return result;
}

/**
 * Plays the current fight by `attackOrEndTurn` until it ends or the session
 * does: the state then, and the events on the way.
 */
export function fightThrough(runtime, state, random) {
  const events = [];
  let next = state;
  while (next.status === "playing" && next.encounter?.outcome === "ongoing") {
    const result = attackOrEndTurn(runtime, next, random);
    events.push(...result.events);
    next = result.state;
  }
  return { state: next, events };
}
