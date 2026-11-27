// #400: using an item on a feature. A feature may accept items the
// character carries (`uses`), each with its words, whether the item is used
// up, and effects drawn from the band effects. The engine offers a use only
// for an item the character carries that the feature accepts, makes each
// once and remembers it; a wrong item, one not carried or a use already
// made is refused without effect. The validator refuses unknown items and
// features, items never carried, and counts a way a use opens only when its
// item is surely reached. The harness uses an item as soon as it can, and
// the AI DM has a use_on tool. Adventure 36, session 57, trace 51, prompt
// v37. A use may cost coin (#600), at the end of this file.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { playAdventure, requiredPath } from "../dist/balance-5e.js";
import {
  FIFTH_ITEM_DM_CASES,
  loadFifthItemEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FifthTraceRun } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { room, snakeDoor, snakeDoorFile } from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });
const TAKE = (itemId) => ({ type: "take", itemId });
const USE_ON = (featureId, itemId) => ({ type: "use-on", featureId, itemId });

function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** The snake door with its use's effects (and `consumes`) replaced. */
function withUse(change) {
  const module = structuredClone(snakeDoorFile);
  const door = room(module, "stair-foot").features.at(-1);
  change(door.uses[0], module, door);
  return module;
}

/** The state back at the foot of the stair, carrying the stone snake. */
function carrying(runtime) {
  let state = runtime.createSession();
  for (const action of [
    MOVE("alcove"),
    TAKE("stone-snake"),
    MOVE("stair-foot"),
  ]) {
    state = accepted(runtime, state, action).state;
  }
  return state;
}

const uses = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "use-on")
    .map(({ target, item, available, reason }) => ({
      feature: target.id,
      item: item.id,
      available,
      ...(available ? {} : { reason }),
    }));

// The validator.

test("a feature's uses are read", () => {
  assert.deepEqual(room(snakeDoor, "stair-foot").features.at(-1).uses, [
    {
      item: "stone-snake",
      text: "The carving fits the hollow. With a grinding of stone, the door swings inward.",
      consumes: true,
      effects: [{ type: "open", passage: "stair-to-vault" }],
    },
  ]);
});

test("the validator refuses an unknown item or feature, and an item never carried", () => {
  const cases = [
    [
      (use) => (use.item = "silver-key"),
      /feature stone-door's use of silver-key names unknown item silver-key\./u,
    ],
    [
      (use) =>
        (use.effects = [{ type: "discovery", feature: "no-such-thing" }]),
      /feature stone-door's use of stone-snake names unknown discovery no-such-thing\./u,
    ],
    [
      (use, module) => {
        Object.assign(room(module, "alcove").items.at(-1), {
          kind: "gear",
          gear: "dagger",
          hiddenIn: "iron-chest",
        });
      },
      /feature stone-door's use of stone-snake names stone-snake, which is gear: it goes into the stowed gear, so it is never carried to use\./u,
    ],
    [
      (use, module) => {
        Object.assign(room(module, "alcove").items.at(-1), {
          kind: "coin",
          coins: { gp: 1 },
          hiddenIn: "iron-chest",
        });
      },
      /which is coin: it goes into the purse/u,
    ],
    [
      (use) => (use.effects = []),
      /feature stone-door's use of stone-snake needs effects|use 1 effects/u,
    ],
    [
      (use, module, door) => door.uses.push(structuredClone(use)),
      /accepts item stone-snake twice\./u,
    ],
    [(use) => (use.consumes = false), /consumes must be true, or left out\./u],
  ];
  for (const [change, message] of cases) {
    assert.throws(() => validateModule(withUse(change)), message);
  }
});

test("a hidden way only a use opens is a way; without it, it is refused", () => {
  assert.doesNotThrow(() => validateModule(structuredClone(snakeDoorFile)));
  const unopened = withUse((use) => {
    use.effects = [{ type: "discovery", feature: "rusted-lantern" }];
  });
  assert.throws(
    () => validateModule(unopened),
    /passage stair-to-vault is hidden, but no check's band or use of an item opens it\./u,
  );
});

/**
 * The snake door with the den reached only through the vault: its way from
 * the cellar now runs from the vault, so the only route to the den is
 * through the Stone Door.
 */
function vaultDenFile(change = () => {}) {
  const module = structuredClone(snakeDoorFile);
  module.passages = module.passages.filter(({ id }) => id !== "cellar-to-den");
  room(module, "den").at = [2, 1];
  module.passages.push({
    id: "vault-to-den",
    between: ["vault", "den"],
    description: "A low arch.",
  });
  change(module);
  return module;
}

test("a way a use opens counts toward an essential room only if its item is surely reached", () => {
  assert.doesNotThrow(() => validateModule(vaultDenFile()));
  // Carried by the rat, the snake may never be had: its body may never be
  // searched.
  const carried = vaultDenFile((module) => {
    const snake = room(module, "alcove").items.pop();
    room(module, "rat-cellar").items.push({ ...snake, hiddenIn: "giant-rat" });
  });
  assert.throws(
    () => validateModule(carried),
    /room den is essential, but every route to it needs a check or passes a trap \(stair-to-vault\)\./u,
  );
  // Hidden in a chest only some bands of its check reveal.
  const checked = vaultDenFile((module) => {
    const snake = room(module, "alcove").items.pop();
    room(module, "alcove").items.push({ ...snake, hiddenIn: "iron-chest" });
    const chest = room(module, "alcove").features[0];
    chest.check = {
      skill: "investigation",
      dc: 12,
      bands: {
        success: {
          effects: [
            { type: "item", item: "stone-snake" },
            { type: "item", item: "healing-potion" },
          ],
        },
      },
    };
  });
  assert.throws(
    () => validateModule(checked),
    /room den is essential, but every route to it needs a check or passes a trap/u,
  );
  // Used up by another use first, it may never reach the door.
  const usedUp = vaultDenFile((module) => {
    room(module, "alcove").features[0].uses = [
      {
        item: "stone-snake",
        text: "You drop the snake into the chest.",
        consumes: true,
        effects: [{ type: "discovery", feature: "rusted-lantern" }],
      },
    ];
  });
  assert.throws(
    () => validateModule(usedUp),
    /room den is essential, but every route to it needs a check or passes a trap/u,
  );
});

test("a use that closes a way is a closer the validator weighs", () => {
  const module = vaultDenFile((file) => {
    room(file, "stair-foot").features.push({
      id: "iron-lever",
      name: "Iron Lever",
      description: "An iron lever in the wall.",
      uses: [
        {
          item: "stone-snake",
          text: "You jam the snake into the lever's slot; somewhere a door drops.",
          effects: [{ type: "close", passage: "vault-to-den" }],
        },
      ],
    });
  });
  assert.throws(
    () => validateModule(module),
    /feature iron-lever's use of stone-snake closes passage vault-to-den, which can cut off essential room den\./u,
  );
});

// The runtime.

test("a use is offered only for an item carried that the feature accepts", () => {
  const runtime = createFifthRuntime(snakeDoor, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.deepEqual(uses(runtime, start), []);
  const refused = runtime.handleAction(
    start,
    USE_ON("stone-door", "stone-snake"),
  );
  assert.equal(refused.rejection.code, "not-carried");
  const state = carrying(runtime);
  assert.deepEqual(uses(runtime, state), [
    { feature: "stone-door", item: "stone-snake", available: true },
  ]);
  // Elsewhere, the door isn't there to use the snake on.
  const alcove = accepted(runtime, state, MOVE("alcove")).state;
  assert.deepEqual(uses(runtime, alcove), []);
  assert.equal(
    runtime.handleAction(alcove, USE_ON("stone-door", "stone-snake")).rejection
      .code,
    "no-feature",
  );
});

test("the wrong item is refused without effect", () => {
  const runtime = createFifthRuntime(snakeDoor, TEST_FIGHTER);
  let state = runtime.createSession();
  for (const action of [
    MOVE("alcove"),
    EXAMINE("iron-chest"),
    TAKE("healing-potion"),
    MOVE("stair-foot"),
  ]) {
    state = accepted(runtime, state, action).state;
  }
  const wrong = runtime.handleAction(
    state,
    USE_ON("stone-door", "healing-potion"),
  );
  assert.deepEqual(wrong.rejection, {
    code: "wrong-item",
    reason: "The Potion of Healing is no use on the Stone Door.",
  });
  assert.equal(wrong.state, state);
});

test("fitting the snake into the door uses it up and opens the hidden way", () => {
  const runtime = createFifthRuntime(snakeDoor, TEST_FIGHTER);
  const state = carrying(runtime);
  assert.equal(
    runtime.projectRoom(state).exits.some(({ id }) => id === "vault"),
    false,
  );
  const used = accepted(runtime, state, USE_ON("stone-door", "stone-snake"));
  assert.deepEqual(
    used.events.map(({ type }) => type),
    ["used-on", "used-up", "route"],
  );
  assert.equal(
    renderFifthResult(used),
    [
      "You use the Stone Snake on the Stone Door. The carving fits the hollow. With a grinding of stone, the door swings inward.",
      "The Stone Snake is used up.",
      "The way to the Snake Vault is open.",
    ].join("\n"),
  );
  assert.deepEqual(used.state.featureUses, [
    { featureId: "stone-door", itemId: "stone-snake" },
  ]);
  assert.equal(used.state.inventory.includes("stone-snake"), false);
  assert.ok(used.state.usedItemIds.includes("stone-snake"));
  assert.equal(
    runtime.projectRoom(used.state).exits.find(({ id }) => id === "vault")
      .route,
    "opened",
  );
  assert.equal(
    accepted(runtime, used.state, MOVE("vault")).state.roomId,
    "vault",
  );
  // Used up, it is offered no more.
  assert.deepEqual(uses(runtime, used.state), []);
});

test("a kept item's use is made once and remembered", () => {
  const runtime = createFifthRuntime(
    validateModule(withUse((use) => delete use.consumes)),
    TEST_FIGHTER,
  );
  const used = accepted(
    runtime,
    carrying(runtime),
    USE_ON("stone-door", "stone-snake"),
  ).state;
  assert.ok(used.inventory.includes("stone-snake"));
  assert.deepEqual(uses(runtime, used), [
    {
      feature: "stone-door",
      item: "stone-snake",
      available: false,
      reason: "Already used",
    },
  ]);
  assert.deepEqual(
    runtime.handleAction(used, USE_ON("stone-door", "stone-snake")).rejection,
    {
      code: "already-used",
      reason: "You already used the Stone Snake on the Stone Door.",
    },
  );
});

test("a use's discovery, revealed item, damage, closed way and flag", () => {
  const effects = [
    { type: "open", passage: "stair-to-vault" },
    { type: "discovery", feature: "rusted-lantern" },
    { type: "item", item: "healing-potion" },
    { type: "close", passage: "stair-to-alcove" },
    { type: "set", flag: "door-tried" },
    {
      type: "damage",
      dice: 1,
      sides: 4,
      modifier: 0,
      damageType: "poison",
      defeatEndingId: "fallen-in-the-cellar",
    },
  ];
  const module = validateModule(
    withUse((use, file, door) => {
      use.effects = effects;
      file.flags = ["door-tried"];
      door.changed = {
        when: "door-tried",
        description: "The Stone Door, its hollow filled.",
      };
    }),
  );
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  const state = carrying(runtime);
  const used = accepted(runtime, state, USE_ON("stone-door", "stone-snake"), 3);
  assert.deepEqual(
    used.events.map(({ type }) => type),
    [
      "used-on",
      "used-up",
      "route",
      "discovered",
      "revealed",
      "route",
      "check-damage",
    ],
  );
  assert.equal(used.state.character.hp, state.character.hp - 3);
  assert.deepEqual(used.state.flags, ["door-tried"]);
  const features = runtime.projectRoom(used.state).features;
  assert.match(
    features.find(({ id }) => id === "rusted-lantern").discovery,
    /Rats in the cellar/u,
  );
  assert.equal(
    features.find(({ id }) => id === "stone-door").description,
    "The Stone Door, its hollow filled.",
  );
  assert.equal(
    runtime.projectRoom(used.state).exits.find(({ id }) => id === "alcove")
      .route,
    "closed",
  );
  // The way to the alcove is closed.
  assert.equal(
    runtime.handleAction(used.state, MOVE("alcove")).rejection.code,
    "route-closed",
  );
});

test("a use's damage can end the adventure in its defeat", () => {
  const runtime = createFifthRuntime(
    validateModule(
      withUse((use) => {
        use.effects = [
          { type: "open", passage: "stair-to-vault" },
          {
            type: "damage",
            dice: 10,
            sides: 10,
            modifier: 0,
            damageType: "poison",
            defeatEndingId: "fallen-in-the-cellar",
          },
        ];
      }),
    ),
    TEST_FIGHTER,
  );
  const used = accepted(
    runtime,
    carrying(runtime),
    USE_ON("stone-door", "stone-snake"),
    ...Array(10).fill(10),
  );
  assert.equal(used.state.status, "defeat");
  assert.equal(used.state.endingId, "fallen-in-the-cellar");
});

test("a reload replays the use, and a trace records it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "item-uses-"));
  try {
    const path = join(directory, "session.json");
    const run = new FifthTraceRun(
      await FifthSession.create(
        path,
        "a".repeat(32),
        3,
        snakeDoor,
        TEST_FIGHTER,
      ),
    );
    for (const action of [
      MOVE("alcove"),
      TAKE("stone-snake"),
      MOVE("stair-foot"),
      USE_ON("stone-door", "stone-snake"),
    ]) {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    await run.session.persist();
    const loaded = await FifthSession.load(path, [snakeDoor]);
    assert.deepEqual(loaded.state, run.session.state);
    assert.deepEqual(loaded.state.featureUses, [
      { featureId: "stone-door", itemId: "stone-snake" },
    ]);
    assert.deepEqual(run.trace.turns.at(-1).stateAfter.featureUses, [
      { featureId: "stone-door", itemId: "stone-snake" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the AI DM's use_on tool lists only offered pairs", () => {
  const runtime = createFifthRuntime(snakeDoor, TEST_FIGHTER);
  const tool = (state) =>
    runtime.getGameToolDefinitions(state).find(({ name }) => name === "use_on");
  assert.equal(tool(runtime.createSession()), undefined);
  const offered = tool(carrying(runtime));
  assert.deepEqual(offered.parameters.properties.use.enum, [
    "stone-door:stone-snake",
  ]);
  assert.match(offered.description, /the Stone Snake on the Stone Door/u);
});

// The balance harness.

test("the required path fetches the item a use needs, and the harness uses it", () => {
  const module = validateModule(vaultDenFile());
  // The way to the vault opens only with the snake: the path fetches it
  // from the alcove before going through the door.
  assert.deepEqual(requiredPath(module).roomIds, [
    "stair-foot",
    "alcove",
    "vault",
    "den",
  ]);
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  for (const style of ["direct", "cautious", "avoid-optional"]) {
    for (const seed of [0, 1, 2]) {
      const run = playAdventure(runtime, style, seed);
      assert.ok(
        run.roomIds.indexOf("vault") > run.roomIds.indexOf("alcove"),
        `${style} ${seed}: ${run.roomIds.join(" > ")}`,
      );
    }
  }
});

test("a fight by the item a use needs is on the required path", () => {
  // A rat guards the snake in the alcove: the cautious run, which skips
  // optional fights, must fight it to get through the door.
  const file = vaultDenFile((module) => {
    module.encounters.push({
      ...structuredClone(module.encounters[0]),
      id: "alcove-rat",
    });
    module.encounters.at(-1).opponents[0].id = "alcove-giant-rat";
    room(module, "alcove").encounterId = "alcove-rat";
  });
  const module = validateModule(file);
  assert.ok(requiredPath(module).roomIds.includes("alcove"));
  const runtime = createFifthRuntime(module, TEST_FIGHTER);
  const run = playAdventure(runtime, "cautious", 0);
  assert.ok(
    run.encounters.some(({ id }) => id === "alcove-rat"),
    run.roomIds.join(" > "),
  );
});

// The AI DM evaluation.

test("the item evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthItemEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  assert.deepEqual(adventure, snakeDoor);
  assert.deepEqual(
    FIFTH_ITEM_DM_CASES.map(({ id }) => id),
    ["item-right", "item-wrong", "item-not-carried"],
  );
  for (const sample of FIFTH_ITEM_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_ITEM_DM_CASES,
    adventure,
    createModel: (sample) => {
      let next = 0;
      return {
        async respond() {
          return sample.scripted[next++];
        },
      };
    },
    manualJudgments: Object.fromEntries(
      FIFTH_ITEM_DM_CASES.map((sample) => [
        sample.id,
        {
          1: Object.fromEntries(sample.manualJudgments.map((id) => [id, true])),
        },
      ]),
    ),
  });
  for (const run of report.runs) {
    assert.ok(Object.values(run.checks).every(Boolean), run.caseId);
  }
  assert.equal(report.passed, true);
});

test("an AI DM call with the wrong item, or one not carried, is refused without effect", () => {
  const runtime = createFifthRuntime(snakeDoor, TEST_FIGHTER);
  for (const [state, use] of [
    [carrying(runtime), "stone-door:healing-potion"],
    [runtime.createSession(), "stone-door:stone-snake"],
  ]) {
    const result = runtime.dispatchGameTool(state, {
      id: "call-1",
      name: "use_on",
      argumentsJson: JSON.stringify({ use }),
    });
    assert.equal(result.modelOutput.ok, false, use);
    assert.equal(result.state, state, use);
  }
});

// A use's coin cost (#600): a use may cost coin, spent from the purse as a
// toll is. Too little coin refuses it without effect; the price is shown
// with the item's name wherever the use is offered; a way only a costed use
// opens is never counted on; and the harness pays what it can afford.
// Adventure 48, prompt v50.

/** The snake door, fitting the snake costing 2 gp. */
const costedDoorFile = () =>
  withUse((use) => {
    use.coins = { gp: 2 };
  });

const RICH = { ...TEST_FIGHTER, purse: 500 };
const POOR = { ...TEST_FIGHTER, purse: 150 };

test("a use's coin cost is read, and an empty or unknown one refused", () => {
  const door = room(validateModule(costedDoorFile()), "stair-foot").features.at(
    -1,
  );
  assert.deepEqual(door.uses[0].coins, { gp: 2 });
  assert.throws(
    () => validateModule(withUse((use) => (use.coins = {}))),
    /use 1 coins must hold at least one coin\./u,
  );
  assert.throws(
    () => validateModule(withUse((use) => (use.coins = { gp: 0 }))),
    /use 1 coins must hold at least one coin\./u,
  );
  assert.throws(
    () => validateModule(withUse((use) => (use.coins = { pp: 1 }))),
    /use 1 coins may have only /u,
  );
});

test("a way only a costed use opens is never counted on", () => {
  // The den is reached only through the Stone Door: free, that is a way;
  // at a price the character may not have, it is not.
  assert.doesNotThrow(() => validateModule(vaultDenFile()));
  const costed = vaultDenFile((module) => {
    room(module, "stair-foot").features.at(-1).uses[0].coins = { cp: 1 };
  });
  assert.throws(
    () => validateModule(costed),
    /room den is essential, but every route to it needs a check or passes a trap \(stair-to-vault\)\./u,
  );
});

test("a costed use shows its price, spends the coin and applies its effects", () => {
  const runtime = createFifthRuntime(validateModule(costedDoorFile()), RICH);
  const state = carrying(runtime);
  assert.equal(state.possessions.purse, 500);
  const offered = runtime
    .projectActions(state)
    .find(({ action }) => action === "use-on");
  assert.deepEqual(
    [offered.item, offered.target.name, offered.available],
    [{ id: "stone-snake", name: "Stone Snake (2 gp)" }, "Stone Door", true],
  );
  const used = accepted(runtime, state, USE_ON("stone-door", "stone-snake"));
  assert.deepEqual(
    used.events.map(({ type }) => type),
    ["used-on", "used-up", "route"],
  );
  assert.deepEqual(used.events[0].cost, { price: 200, purse: 300 });
  assert.equal(used.state.possessions.purse, 300);
  assert.equal(
    renderFifthResult(used),
    [
      "You use the Stone Snake on the Stone Door, paying 2 gp. The carving fits the hollow. With a grinding of stone, the door swings inward. Purse: 3 gp.",
      "The Stone Snake is used up.",
      "The way to the Snake Vault is open.",
    ].join("\n"),
  );
  assert.equal(
    accepted(runtime, used.state, MOVE("vault")).state.roomId,
    "vault",
  );
});

test("a free use says nothing of coin", () => {
  const runtime = createFifthRuntime(snakeDoor, RICH);
  const used = accepted(
    runtime,
    carrying(runtime),
    USE_ON("stone-door", "stone-snake"),
  );
  assert.equal(used.events[0].cost, undefined);
  assert.equal(used.state.possessions.purse, 500);
});

test("with too little coin a costed use is refused without effect", () => {
  const runtime = createFifthRuntime(validateModule(costedDoorFile()), POOR);
  const state = carrying(runtime);
  assert.deepEqual(uses(runtime, state), [
    {
      feature: "stone-door",
      item: "stone-snake",
      available: false,
      reason: "Too little coin",
    },
  ]);
  const refused = runtime.handleAction(
    state,
    USE_ON("stone-door", "stone-snake"),
  );
  assert.deepEqual(refused.rejection, {
    code: "too-little-coin",
    reason:
      "Using the Stone Snake on the Stone Door costs 2 gp, and you have 1 gp 5 sp.",
  });
  assert.equal(refused.state, state);
  assert.equal(state.inventory.includes("stone-snake"), true);
  // The AI DM is offered only a use the purse can pay for.
  const tool = (playing, at) =>
    playing.getGameToolDefinitions(at).find(({ name }) => name === "use_on");
  assert.equal(tool(runtime, state), undefined);
  const rich = createFifthRuntime(validateModule(costedDoorFile()), RICH);
  const offered = tool(rich, carrying(rich));
  assert.match(
    offered.description,
    /the Stone Snake \(2 gp\) on the Stone Door/u,
  );
  assert.match(offered.description, /never lower or waive/u);
});

test("the same actions spend the same coin again", () => {
  const runtime = createFifthRuntime(validateModule(costedDoorFile()), RICH);
  const play = () =>
    accepted(runtime, carrying(runtime), USE_ON("stone-door", "stone-snake"))
      .state;
  assert.deepEqual(play(), play());
  assert.equal(play().possessions.purse, 300);
});

/**
 * The snake door with an offering bowl in the alcove, where the snake is
 * found: laying the snake in it costs 2 gp and reveals the lantern's secret.
 */
function offeringBowlFile() {
  const module = structuredClone(snakeDoorFile);
  room(module, "alcove").features.push({
    id: "offering-bowl",
    name: "Offering Bowl",
    description: "A stone bowl, its rim worn by coins.",
    uses: [
      {
        item: "stone-snake",
        text: "You lay the snake in the bowl with your coin. Something clicks.",
        coins: { gp: 2 },
        effects: [{ type: "discovery", feature: "rusted-lantern" }],
      },
    ],
  });
  return module;
}

test("the harness pays for a use it can afford, and passes one it can't", () => {
  const module = validateModule(offeringBowlFile());
  const paying = (sheet) => {
    const runtime = createFifthRuntime(module, sheet);
    const paid = [];
    const watching = {
      ...runtime,
      handleAction(state, action, random) {
        const result = runtime.handleAction(state, action, random);
        if (action.type === "use-on" && action.featureId === "offering-bowl") {
          paid.push(result.rejection?.code ?? "paid");
        }
        return result;
      },
    };
    for (const style of ["direct", "cautious", "avoid-optional"]) {
      for (const seed of [0, 1, 2]) {
        // A run that stalled would never return.
        playAdventure(watching, style, seed);
      }
    }
    return paid;
  };
  const rich = paying(RICH);
  assert.ok(rich.length > 0);
  assert.ok(rich.every((outcome) => outcome === "paid"));
  // Too poor, the harness never tries it.
  assert.deepEqual(paying(POOR), []);
});
