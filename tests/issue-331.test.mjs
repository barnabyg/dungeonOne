// #331: a key can no longer be found once its carrier leaves without a body
// (#324: it fled, surrendered, or its encounter ended peacefully) or a check
// fails to reveal it (#285). The harness counts that key as absent: it
// plans around the key's door, and a run with no other way on or out is
// stranded naming the lost key, which fails the gate.
import assert from "node:assert/strict";
import test from "node:test";
import { playAdventure } from "../dist/balance-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { fleeingGoblins } from "./fixtures/fleeing-goblins.mjs";
import { room } from "./fixtures/modules.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";

/**
 * The fleeing goblins with goblin 3 carrying the burial hall's only item, the
 * key to a bone vault beyond the hall; `change` edits the module file.
 */
function lockedVault(change = () => {}) {
  const file = structuredClone(fleeingGoblins);
  room(file, "burial-hall").items = [
    {
      id: "vault-key",
      name: "Vault Key",
      description: "A bone-handled key.",
      kind: "key",
      hiddenIn: "goblin-3",
    },
  ];
  file.rooms.push({
    id: "bone-vault",
    name: "Bone Vault",
    description: "A low vault stacked with bones.",
    features: [
      {
        id: "bone-heap",
        name: "Bone Heap",
        description: "A heap of old bones.",
        discovery: "A silver torc glints among the bones.",
      },
    ],
    items: [
      {
        id: "vault-torc",
        name: "Vault Torc",
        description: "A tarnished silver torc.",
        kind: "treasure",
        treasure: "art-25gp",
        hiddenIn: "bone-heap",
      },
    ],
  });
  file.passages.push({
    id: "hall-to-vault",
    between: ["burial-hall", "bone-vault"],
    description: "An iron-bound door at the back of the hall.",
    door: {
      id: "vault-door",
      name: "Vault Door",
      description: "Locked.",
      state: "locked",
      keyItemId: "vault-key",
    },
  });
  change(file);
  return validateModule(file);
}

// Seed 5: goblin 3 flees from these styles (see issue-324.test.mjs).
// Stealth-first ambushes, so its fight goes differently.
const FLEEING_STYLES = ["direct", "cautious", "avoid-optional"];

test("a run heads out when the key to the only loot fled with its carrier", () => {
  const runtime = createFifthRuntime(lockedVault(), firstFighter(0));
  for (const style of FLEEING_STYLES) {
    const run = playAdventure(runtime, style, 5);
    assert.equal(run.encounters[0].fled, 1, style);
    assert.equal(run.outcome, "escape-without-loot", style);
    assert.ok(!run.roomIds.includes("bone-vault"), style);
  }
});

test("a run with no way on past a lost key is stranded naming the key", () => {
  // The vault is the only way out: the barrow mouth is no exit.
  const module = lockedVault((file) => {
    delete room(file, "barrow-mouth").exit;
    room(file, "bone-vault").exit = true;
  });
  const runtime = createFifthRuntime(module, firstFighter(0));
  for (const style of FLEEING_STYLES) {
    assert.throws(
      () => playAdventure(runtime, style, 5),
      {
        code: "stranded",
        message: new RegExp(
          `^fleeing-goblins: a ${style} run was stranded in burial-hall, ` +
            "with key vault-key lost \\(its carrier goblin-3 fled\\)\\.$",
          "u",
        ),
      },
      style,
    );
  }
});

test("a run heads out when a failed check leaves the vault key unfound", () => {
  // The key lies in the burial hall's rubble, found only on a success.
  const module = lockedVault((file) => {
    const hall = room(file, "burial-hall");
    hall.features.push({
      id: "rubble",
      name: "Rubble",
      description: "A heap of fallen stones.",
      check: {
        skill: "investigation",
        dc: 10,
        bands: { success: { effects: [{ type: "item", item: "vault-key" }] } },
      },
    });
    hall.items[0].hiddenIn = "rubble";
  });
  const runtime = createFifthRuntime(module, firstFighter(0), {
    checks: "always-fail",
  });
  const run = playAdventure(runtime, "cautious", 0);
  assert.equal(run.outcome, "escape-without-loot");
  assert.ok(!run.roomIds.includes("bone-vault"));
});
