// #224: carrying capacity by weight. Every catalogue item has its SRD 5.2
// weight, coin weighs 50 to the pound, module items weigh a default per kind,
// and a character carries up to Strength × 15 lb. Taking or buying what would
// go over is refused by the engine, which also shows the weight carried.
import assert from "node:assert/strict";
import test from "node:test";
import {
  ARMOUR,
  buyItem,
  carryingCapacity,
  coinCount,
  formatWeight,
  isItemId,
  itemWeight,
  KIT_IDS,
  loadWeight,
  salePrice,
  STARTING_KITS,
  WEAPONS,
} from "../dist/equipment-5e.js";
import { ITEM_KINDS } from "../dist/adventure-5e.js";
import {
  buildFighter,
  fighterCarrying,
  validateFighter,
} from "../dist/fighter-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { armoury, room } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

const ROLLS = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [1, 1, 1, 1],
];
/** A Fighter with the mace kit and the given die set on Strength: 0 is 16, 5 is 3. */
const fighter = (strength, rolls = ROLLS) =>
  buildFighter("a".repeat(32), "Ada", rolls, {
    placement: {
      strength,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: strength === 0 ? 5 : 0,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  });

const holding = (equipment, stowed = [], purse = 0) => ({
  equipment,
  stowed,
  purse,
});

test("every catalogue item weighs what SRD 5.2 says", () => {
  const weights = Object.fromEntries(
    [...Object.keys(WEAPONS), ...Object.keys(ARMOUR)].map((id) => [
      id,
      itemWeight(id),
    ]),
  );
  assert.deepEqual(weights, {
    club: 2,
    dagger: 1,
    mace: 4,
    shortsword: 2,
    longsword: 3,
    greatsword: 6,
    shortbow: 2,
    "light-crossbow": 5,
    longbow: 2,
    leather: 10,
    "chain-shirt": 20,
    "chain-mail": 55,
    plate: 65,
    shield: 6,
  });
});

test("module items weigh a default per kind: a potion half a pound, a key nothing, treasure a pound", () => {
  assert.equal(ITEM_KINDS["potion-of-healing"].weight, 0.5);
  assert.equal(ITEM_KINDS.key.weight, 0);
  assert.equal(ITEM_KINDS.treasure.weight, 1);
});

test("a purse holds the fewest coins its value allows, and fifty coins weigh a pound", () => {
  assert.equal(coinCount(0), 0);
  // 12 gp 3 sp 4 cp.
  assert.equal(coinCount(1234), 19);
  // 9 sp and a 10th become 1 gp: fewer coins, not more.
  assert.equal(coinCount(90), 9);
  assert.equal(coinCount(100), 1);
  assert.equal(loadWeight({ ...holding([], [], 5000), other: 0 }), 1);
  assert.equal(loadWeight({ ...holding([], [], 2500), other: 0 }), 0.5);
});

test("the weight carried is the gear, the coin and everything else, exactly", () => {
  assert.equal(
    loadWeight({
      ...holding(["leather", "mace"], ["dagger", "dagger"], 1234),
      other: 1.5,
    }),
    // 10 + 4 + 1 + 1 + 1.5, and 19 coins.
    17.5 + 19 / 50,
  );
  assert.equal(formatWeight(17.88), "17.88 lb");
  assert.equal(formatWeight(14), "14 lb");
  assert.equal(formatWeight(0.5), "0.5 lb");
});

test("a Medium character carries its Strength score × 15 lb", () => {
  assert.equal(carryingCapacity(3), 45);
  assert.equal(carryingCapacity(9), 135);
  assert.equal(carryingCapacity(20), 300);
});

test("every starting kit fits the weakest character's capacity", () => {
  for (const kit of KIT_IDS) {
    const weight = loadWeight({
      ...holding(STARTING_KITS[kit].equipment),
      other: 0,
    });
    assert.ok(weight <= carryingCapacity(3), `${kit}: ${weight} lb`);
  }
});

test("selling any catalogue item lightens the load: its price weighs less than it does", () => {
  for (const id of [...Object.keys(WEAPONS), ...Object.keys(ARMOUR)]) {
    assert.ok(isItemId(id));
    assert.ok(coinCount(salePrice(id)) / 50 < itemWeight(id), id);
  }
});

test("buying what would take the character over capacity is refused, saying why", () => {
  // Str 3: 45 lb. Leather and mace weigh 14 lb.
  assert.deepEqual(
    buyItem(holding(["leather", "mace"], [], 10000), "chain-shirt", {
      capacity: 45,
      other: 12,
    }).refusal,
    {
      code: "too-heavy",
      reason:
        "The chain shirt weighs 20 lb, and you carry 28 lb of the 45 lb your Strength allows: sell or drop something first.",
    },
  );
  // Exactly at capacity is allowed; the coin paid lightens the purse.
  const bought = buyItem(
    holding(["leather", "mace"], [], 5000),
    "chain-shirt",
    {
      capacity: 45,
      other: 11,
    },
  );
  assert.equal(bought.refusal, undefined);
  assert.equal(loadWeight({ ...bought.holding, other: 11 }), 45);
});

test("no count limits a sheet's gear, and a sheet over capacity still loads", () => {
  const strong = fighter(0);
  assert.equal(strong.abilities.strength, 16);
  // 21 daggers were over #209's 20-item stopgap; they weigh 21 lb.
  validateFighter({ ...strong, stowed: Array(21).fill("dagger") });
  // Under #209 a Strength 3 character could carry chain mail it can't now:
  // the sheet stays valid, so its library still loads, and only taking more
  // is refused.
  const weak = { ...fighter(5), stowed: ["chain-mail"] };
  assert.equal(weak.abilities.strength, 3);
  validateFighter(weak);
  assert.deepEqual(fighterCarrying(weak), { weight: 69, capacity: 45 });
  const runtime = createFifthRuntime(barrow, weak);
  assert.equal(
    runtime.handleAction(play(runtime, FIND).state, take("lintel-pouch"))
      .rejection.code,
    "too-heavy",
  );
});

test("a sheet's weight carried counts its gear, treasure and purse", () => {
  const weak = fighter(5);
  assert.deepEqual(fighterCarrying(weak), { weight: 14, capacity: 45 });
  assert.deepEqual(
    fighterCarrying({
      ...weak,
      stowed: ["dagger"],
      treasure: [{ id: "a/b", name: "Seal", description: "A silver seal." }],
      purse: 5000,
    }),
    { weight: 17, capacity: 45 },
  );
});

// The Lintel Barrow with a longsword, a shield, a greatsword and chain mail
// behind the lintel (#209), and here a pouch of 10 gp and a silver cup too.
const laden = structuredClone(armoury);
room(laden, "barrow-mouth").items.push(
  {
    id: "lintel-pouch",
    name: "Pouch",
    description: "A pouch of coin.",
    kind: "coin",
    coins: { gp: 10 },
    hiddenIn: "scratched-lintel",
  },
  {
    id: "lintel-cup",
    name: "Silver Cup",
    description: "A dented silver cup.",
    kind: "treasure",
    treasure: "art-25gp",
    hiddenIn: "scratched-lintel",
  },
);
const barrow = validateModule(laden);
const FIND = [
  { type: "begin" },
  { type: "examine", targetId: "scratched-lintel" },
];
const take = (itemId) => ({ type: "take", itemId });

/** Plays `actions` from a fresh session, each accepted; returns the last result. */
function play(runtime, actions) {
  let result = { state: runtime.createSession(), events: [] };
  for (const action of actions) {
    result = runtime.handleAction(result.state, action);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return result;
}

// Str 5: 75 lb. The mace kit weighs 14 lb.
const STR_5 = [...ROLLS.slice(0, 5), [2, 2, 1, 1]];
const five = fighter(5, STR_5);

test("taking gear that would go over capacity is refused, and dropping something makes room", () => {
  assert.equal(five.abilities.strength, 5);
  const runtime = createFifthRuntime(barrow, five);
  const armed = play(runtime, [
    ...FIND,
    take("lintel-longsword"),
    take("lintel-shield"),
  ]);
  assert.deepEqual(runtime.projectRoom(armed.state).carrying, {
    weight: 23,
    capacity: 75,
  });
  const refusal = {
    code: "too-heavy",
    reason:
      "The Chain Mail weighs 55 lb, and you carry 23 lb of the 75 lb your Strength allows: drop something first.",
  };
  assert.deepEqual(
    runtime.handleAction(armed.state, take("lintel-mail")).rejection,
    refusal,
  );
  // The action bar shows why, and the AI DM is offered no take of it.
  assert.deepEqual(
    runtime
      .projectActions(armed.state)
      .find(
        ({ action, target }) =>
          action === "take" && target.id === "lintel-mail",
      ),
    {
      action: "take",
      target: { id: "lintel-mail", name: "Chain Mail" },
      available: false,
      reason: "Too heavy",
    },
  );
  assert.ok(
    !runtime.projectRoom(armed.state).options.take.includes("lintel-mail"),
  );
  const tools = runtime.getGameToolDefinitions(armed.state);
  assert.ok(
    !tools
      .find(({ name }) => name === "take")
      .parameters.properties.item.enum.includes("lintel-mail"),
  );
  // Asked anyway, the engine's sentence is what the AI DM reads.
  const asked = runtime.dispatchGameTool(armed.state, {
    name: "take",
    argumentsJson: JSON.stringify({ item: "lintel-mail" }),
  });
  assert.deepEqual(asked.engineResult.rejection, refusal);
  assert.equal(asked.modelOutput.error.rejection.reason, refusal.reason);
  assert.match(
    runtime.projectCharacterStatus(armed.state).carrying,
    /^23 lb of the 75 lb its Strength allows$/,
  );

  // Dropping the shield makes room: 17 + 55 = 72 lb.
  const dressed = play(runtime, [
    ...FIND,
    take("lintel-longsword"),
    take("lintel-shield"),
    { type: "drop", itemId: "shield" },
    take("lintel-mail"),
  ]);
  assert.deepEqual(dressed.state.possessions.stowed, [
    "longsword",
    "chain-mail",
  ]);
  assert.deepEqual(runtime.projectRoom(dressed.state).carrying, {
    weight: 72,
    capacity: 75,
  });
  // Taking the dropped shield back is refused in turn.
  assert.deepEqual(
    runtime.handleAction(dressed.state, take("dropped:shield")).rejection,
    {
      code: "too-heavy",
      reason:
        "The shield weighs 6 lb, and you carry 72 lb of the 75 lb your Strength allows: drop something first.",
    },
  );
});

test("coin and treasure count too, and are refused over capacity", () => {
  // Str 3: 45 lb, all of it carried with 31 daggers stowed.
  const weak = { ...fighter(5), stowed: Array(31).fill("dagger") };
  const runtime = createFifthRuntime(barrow, weak);
  const full = play(runtime, FIND);
  assert.deepEqual(runtime.projectRoom(full.state).carrying, {
    weight: 45,
    capacity: 45,
  });
  const over = (what, weight, carried) => ({
    code: "too-heavy",
    reason: `The ${what} weighs ${weight} lb, and you carry ${carried} lb of the 45 lb your Strength allows: drop something first.`,
  });
  // Ten gold pieces weigh a fifth of a pound.
  assert.deepEqual(
    runtime.handleAction(full.state, take("lintel-pouch")).rejection,
    over("Pouch", 0.2, 45),
  );
  const purse = play(runtime, [
    ...FIND,
    { type: "drop", itemId: "dagger" },
    take("lintel-pouch"),
  ]);
  assert.equal(runtime.projectRoom(purse.state).carrying.weight, 44.2);
  assert.deepEqual(
    runtime.handleAction(purse.state, take("lintel-cup")).rejection,
    over("Silver Cup", 1, 44.2),
  );
});
