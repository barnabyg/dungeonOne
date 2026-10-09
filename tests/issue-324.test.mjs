// #324: loot an opponent carries can no longer be found once the opponent
// leaves without a body: it fled (#237), surrendered (#238; no harness style
// talks, so it never hands the loot over), or its encounter ended peacefully
// (#304). The harness counts that loot as lost and heads for the next loot
// or out, instead of being stranded beside where the loot was.
import assert from "node:assert/strict";
import test from "node:test";
import { PLAY_STYLES, playAdventure } from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { fleeingGoblins } from "./fixtures/fleeing-goblins.mjs";
import { banditTollFile, room } from "./fixtures/modules.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";
import { surrenderingGoblinsJson } from "./fixtures/surrendering-goblins.mjs";

/**
 * `module` with only the burial hall item `goblinId` carries; the other
 * goblins' surrender topics give nothing.
 */
function soleCarrier(module, goblinId) {
  const file = structuredClone(module);
  const hall = room(file, "burial-hall");
  hall.items = hall.items.filter(({ hiddenIn }) => hiddenIn === goblinId);
  for (const opponent of file.encounters[0].opponents) {
    for (const topic of opponent.surrender?.topics ?? []) {
      if (opponent.id !== goblinId) {
        delete topic.gives;
      }
    }
  }
  return validateModule(file);
}

/** The runs of `module` in every style on `seeds`; a stranded run throws. */
function playAll(module, seeds, options) {
  const runtime = createFifthRuntime(module, firstFighter(0));
  return PLAY_STYLES.flatMap((style) =>
    seeds.map((seed) => playAdventure(runtime, style, seed, options)),
  );
}

const SEEDS = Array.from({ length: 30 }, (_, seed) => seed);

test("a run heads out when the only loot fled with its carrier", () => {
  const module = soleCarrier(fleeingGoblins, "goblin-3");
  // Seed 5: goblin 3 flees with the hall's only pouch, which stranded these
  // styles in the burial hall before #324. (Stealth-first ambushes, so its
  // fight goes differently.)
  const runtime = createFifthRuntime(module, firstFighter(0));
  for (const style of ["direct", "cautious", "avoid-optional"]) {
    const run = playAdventure(runtime, style, 5);
    assert.equal(run.outcome, "escape-without-loot", style);
    assert.equal(run.encounters[0].fled, 1, style);
  }
  const runs = playAll(module, SEEDS);
  assert.ok(runs.some(({ outcome }) => outcome === "escape-with-loot"));
});

test("a run heads out when the only loot's carrier surrendered", () => {
  const module = soleCarrier(surrenderingGoblinsJson, "goblin-3");
  const runs = playAll(module, SEEDS);
  assert.ok(
    runs.some(
      ({ outcome, encounters }) =>
        outcome === "escape-without-loot" && encounters[0].surrendered > 0,
    ),
    "goblin 3 surrenders with the hall's only ring in some run",
  );
});

test("a run heads out when the only loot's carrier let it pass peacefully", () => {
  const file = structuredClone(banditTollFile);
  room(file, "rat-cellar").items = [
    {
      id: "bandit-purse",
      name: "Bandit's Purse",
      description: "A purse of toll silver on the bandit's belt.",
      kind: "coin",
      coins: { sp: 4 },
      hiddenIn: "bandit",
    },
  ];
  file.endings.unshift({
    id: "out-with-the-purse",
    kind: "escape-with-loot",
    title: "Out with the purse",
    text: "You climb the den's back stair with the bandit's silver.",
  });
  const runs = playAll(validateModule(file), SEEDS, { reactions: "peaceful" });
  assert.ok(
    runs.some(
      ({ outcome, peaceful }) =>
        outcome === "escape-without-loot" && peaceful > 0,
    ),
    "the bandit lets the character pass with her purse in some run",
  );
});
