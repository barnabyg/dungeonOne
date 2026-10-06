// #211: The Tinker's Toll, the increment 12 release module, with the
// content the owner approved: a tinker who trades, a shield and coin found
// in the reeds after the wolf, and the bandits' purse and seal at the tower.
// It qualifies at its declared difficulty and the browser offers it.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { gateAdventure, renderGateResult } from "../dist/balance-5e.js";

const toll = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "tinkers-toll",
);
const room = (id) => toll.rooms.find((entry) => entry.id === id);

test("The Tinker's Toll is a level-1 Hard module from the shrine to the tower", () => {
  assert.equal(toll.title, "The Tinker's Toll");
  assert.deepEqual(toll.recommendedLevels, { min: 1, max: 1 });
  assert.equal(toll.difficulty, "hard");
  assert.equal(toll.startRoomId, "wayside-shrine");
  assert.deepEqual(
    toll.passages.map(({ between, door, trap }) => [between, door, trap]),
    [
      [["wayside-shrine", "tinkers-cart"], undefined, undefined],
      [["tinkers-cart", "ford"], undefined, undefined],
      [["ford", "toll-tower"], undefined, undefined],
    ],
  );
  assert.equal(room("wayside-shrine").exit, true);
  assert.deepEqual(
    toll.encounters.map(({ id, opponents }) => [
      id,
      opponents.map(({ statBlock }) => statBlock.name),
    ]),
    [
      ["ford-wolf", ["Wolf"]],
      ["tower-bandits", ["Bandit", "Bandit"]],
    ],
  );
});

test("Merrow the tinker sells common gear only, ten minutes a trade", () => {
  const [merrow] = room("tinkers-cart").creatures;
  assert.equal(merrow.name, "Merrow the Tinker");
  assert.deepEqual(merrow.merchant, {
    stock: ["dagger", "shortsword", "shield", "chain-shirt"],
    minutes: 10,
  });
});

test("the shield and the first coin lie in the reeds after the wolf; the purse and the seal are at the tower", () => {
  const found = (roomId) =>
    room(roomId).items.map(({ id, kind, gear, coins, hiddenIn }) => ({
      id,
      kind,
      ...(gear === undefined ? {} : { gear }),
      ...(coins === undefined ? {} : { coins }),
      hiddenIn,
    }));
  // Nothing at the shrine: the gate's cautious run must fight for its loot.
  assert.deepEqual(found("wayside-shrine"), []);
  assert.deepEqual(found("ford"), [
    { id: "reed-shield", kind: "gear", gear: "shield", hiddenIn: "reeds" },
    {
      id: "traveller-purse",
      kind: "coin",
      coins: { gp: 3, sp: 5 },
      hiddenIn: "reeds",
    },
  ]);
  assert.deepEqual(found("toll-tower"), [
    { id: "toll-seal", kind: "treasure", hiddenIn: "strongbox" },
    {
      id: "bandit-purse",
      kind: "coin",
      coins: { gp: 12 },
      hiddenIn: "scarred-bandit",
    },
  ]);
});

test("The Tinker's Toll qualifies at its declared difficulty", () => {
  const result = gateAdventure(toll);
  assert.ok(
    result.ok && result.verdict.qualified,
    renderGateResult(toll, result),
  );
});
