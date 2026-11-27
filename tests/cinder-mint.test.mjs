// Last Shift at Cinder Mint's content, played through the runtime. Its
// endings through the browser are in cinder-mint-browser.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { firstJourney } from "./fixtures/module-journey.mjs";

const mint = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "last-shift-at-cinder-mint",
);
const level5 = testFighterAt(5);
const moves = (...rooms) => rooms.map((id) => ["move", id]);
const TO_THE_INVOICE = [
  ...moves("pay-window", "weigh-house", "engravers-bench", "paymasters-office"),
  ["examine", "stove-fender"],
  ["take", "grain-invoice"],
  ...moves("payroll-archive"),
];
const topics = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "talk")
    .map(({ target }) => target.id);
const bale = () =>
  mint.rooms
    .find(({ id }) => id === "payroll-archive")
    .creatures.find(({ id }) => id === "bale")
    .topics.find(({ id }) => id === "bales-testimony");

test("Bale's refusal holds while the grain invoice is carried (#628)", () => {
  const { state, runtime } = firstJourney(
    mint,
    level5,
    TO_THE_INVOICE,
    ({ status, roomId }) =>
      status === "playing" && roomId === "payroll-archive",
  );
  assert.ok(state.inventory.includes("grain-invoice"));
  assert.ok(topics(runtime, state).includes("bales-testimony"));
  // It doesn't ask for a paper the character already holds.
  assert.doesNotMatch(bale().failure, /invoice|stove fender/u);
});

test("Bale's topic is withdrawn once the certified order is taken (#628)", () => {
  for (const certify of [
    [
      ["use", "counterfoil-register", "grain-invoice"],
      ["take", "certified-order"],
    ],
    [
      ["examine", "counterfoil-register", "investigation"],
      ["take", "certified-order"],
    ],
  ]) {
    const { state, runtime } = firstJourney(
      mint,
      level5,
      [...TO_THE_INVOICE, ...certify],
      ({ status, inventory }) =>
        status === "playing" && inventory.includes("certified-order"),
    );
    assert.ok(state.flags.includes("order-certified"));
    assert.ok(!topics(runtime, state).includes("bales-testimony"));
  }
  assert.equal(bale().offeredUntil, "order-certified");
});

test("the Wharf release says what its slot and plate are for, not what was used (#628)", () => {
  const release = mint.rooms
    .flatMap(({ features }) => features)
    .find(({ id }) => id === "wharf-release");
  assert.doesNotMatch(release.discovery, /empty-return|shift diagram/u);
});
