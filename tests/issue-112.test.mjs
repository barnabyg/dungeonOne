import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_REJECTED_ACTION_FALLBACK,
  BROWSER_RESOLVED_ACTION_FALLBACK,
  runDmTurn,
} from "../dist/dm-turn.js";
import { STOLEN_SIGNET_RUNTIME } from "../dist/historical-runtime.js";
import { createSeededRandom } from "../dist/random.js";
import { createSession } from "../dist/session.js";

/** Provider that selects one action, then fails before narrating it. */
function failsAfter(name, args) {
  const responses = [
    { toolCalls: [{ id: "a", name, argumentsJson: JSON.stringify(args) }] },
  ];
  return {
    async respond() {
      const response = responses.shift();
      if (response === undefined) {
        throw new Error("provider failed after the action");
      }
      return response;
    },
  };
}

const turn = (resultSurface, name, args) =>
  runDmTurn({
    runtime: STOLEN_SIGNET_RUNTIME,
    state: createSession(),
    playerInput: "Do it.",
    transcript: [],
    random: createSeededRandom(0),
    model: failsAfter(name, args),
    ...(resultSurface === undefined ? {} : { resultSurface }),
  });

test("a post-action AI failure in the CLI still points to Mechanics", async () => {
  const result = await turn(undefined, "open", { door_id: "entrance-door" });
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.equal(
    result.narration,
    "The attempted action's authoritative result is shown in Mechanics. No further action was executed.",
  );
});

test("a post-action AI failure in the browser names the Resolved action card", async () => {
  const result = await turn("browser-cards", "open", {
    door_id: "entrance-door",
  });
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.ok("events" in result.toolResults[0].result.engineResult);
  assert.equal(result.narration, BROWSER_RESOLVED_ACTION_FALLBACK);
  assert.match(result.narration, /Resolved action card below/);
  assert.match(result.narration, /Do not repeat it/);
  assert.doesNotMatch(result.narration, /Mechanics/);
});

test("a refused action followed by an AI failure names the Action rejected card", async () => {
  const result = await turn("browser-cards", "move", {
    destination_id: "guardroom",
  });
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.deepEqual(result.state, createSession());
  assert.equal(result.narration, BROWSER_REJECTED_ACTION_FALLBACK);
  assert.doesNotMatch(result.narration, /Mechanics|Do not repeat/);
});
