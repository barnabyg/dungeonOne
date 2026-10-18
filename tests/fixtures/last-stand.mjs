// Last Stand (#499): while the character's fall waits for its answer, only
// a potion or the fall is accepted. A fight loop that only attacks or ends
// its turn falls then, as the character fell before the rule, so its seeds
// and outcomes stay as they were.

/** End turn, or Fall while the character's fall waits for Last Stand. */
export const endTurnOrFall = (state) => ({
  type:
    state.encounter?.pendingReaction?.kind === "last-stand"
      ? "fall"
      : "end-turn",
  actorId: "pc",
});

/**
 * Plays `session` in the potion cellar (`potionCellar` in modules.mjs): it
 * takes the potion, goes down to the goblin and only waits. Whether its
 * fall then waits for Last Stand: its death saving throw succeeded.
 */
export function waitsAtLastStand(session) {
  const click = (action) => session.act(action, "click").result.rejection;
  if (
    click({ type: "take", itemId: "healing-potion" }) !== undefined ||
    click({ type: "move", destinationId: "cellar" }) !== undefined
  ) {
    return false;
  }
  while (
    session.state.status === "playing" &&
    session.state.encounter?.pendingReaction?.kind !== "last-stand"
  ) {
    if (click({ type: "end-turn", actorId: "pc" }) !== undefined) {
      return false;
    }
  }
  return session.state.status === "playing";
}
