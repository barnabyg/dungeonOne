// #530: the room view names the encounter waiting in the room before its
// fight begins, for the page's opponent card: unseen by it after a sneak,
// or its opponents reacting, by the band as a parley left it, with each
// standing opponent's icon and description. It goes once the fight begins,
// and a lurking encounter's opponents never show before they spring.
import assert from "node:assert/strict";
import test from "node:test";

import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { banditToll, lurkingTunnels, ratTunnels } from "./fixtures/modules.mjs";

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result.state;
}

const start = (using) =>
  accepted(using, using.createSession(), { type: "begin" });

/** The encounter's opponents as the card shows them. */
const shown = (module, encounterId) =>
  module.encounters
    .find(({ id }) => id === encounterId)
    .opponents.map(({ id, name, description, icon }) => ({
      id,
      name,
      description,
      icon,
    }));

test("unseen after a sneak, the encounter waits until the ambush begins the fight", () => {
  const runtime = createFifthRuntime(ratTunnels, TEST_FIGHTER);
  const begun = start(runtime);
  assert.equal(runtime.projectRoom(begun).waiting, undefined);
  // Stealth d20 12 + 2 = 14 against the rat's passive Perception 10.
  const unseen = accepted(
    runtime,
    begun,
    { type: "sneak", destinationId: "rat-cellar" },
    dice([20, 12]),
  );
  const [fight] = ratTunnels.encounters;
  assert.deepEqual(runtime.projectRoom(unseen).waiting, {
    id: fight.id,
    state: "unseen",
    opponents: shown(ratTunnels, fight.id),
  });
  assert.ok(shown(ratTunnels, fight.id)[0].icon);
  const ambushed = accepted(
    runtime,
    unseen,
    { type: "ambush", roomId: "rat-cellar" },
    dice([20, 15], [20, 18], [20, 4]),
  );
  assert.notEqual(ambushed.encounter, undefined);
  assert.equal(runtime.projectRoom(ambushed).waiting, undefined);
});

test("reacting opponents wait by their band, which a parley moves", () => {
  const runtime = createFifthRuntime(banditToll, { ...BEA, purse: 200 });
  // Bea's reaction roll 2d6 (1 + 1) + 3 = 5: unfriendly.
  const reacting = accepted(
    runtime,
    start(runtime),
    { type: "move", destinationId: "rat-cellar" },
    dice([6, 1], [6, 1]),
  );
  const expected = (state) => ({
    id: "cellar-bandit",
    state,
    opponents: shown(banditToll, "cellar-bandit"),
  });
  assert.deepEqual(
    runtime.projectRoom(reacting).waiting,
    expected("unfriendly"),
  );
  // Persuasion d20 10 + 5 against DC 12: a success moves her a band up.
  const parleyed = accepted(
    runtime,
    reacting,
    { type: "react", option: "parley", approach: "persuasion" },
    dice([20, 10]),
  );
  assert.deepEqual(
    runtime.projectRoom(parleyed).waiting,
    expected("uncertain"),
  );
  // Paying the toll ends the encounter peacefully: nothing waits.
  const paid = accepted(runtime, parleyed, { type: "react", option: "toll" });
  assert.equal(runtime.projectRoom(paid).waiting, undefined);
});

test("a lurking encounter never waits in the open", () => {
  const runtime = createFifthRuntime(lurkingTunnels, TEST_FIGHTER);
  for (const seed of [0, 1, 2, 3]) {
    const random = createSeededRandom(seed);
    const begun = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    const entered = runtime.handleAction(
      begun,
      { type: "move", destinationId: "rat-cellar" },
      random,
    ).state;
    assert.equal(
      runtime.projectRoom(entered).waiting,
      undefined,
      `seed ${seed}`,
    );
  }
});
