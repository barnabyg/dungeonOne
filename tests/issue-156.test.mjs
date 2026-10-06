// #156: the action bar's projection. Every action the bar shows says whether
// the engine would accept it now and, when not, why; the AI DM is offered
// exactly the actions the bar shows enabled.
import assert from "node:assert/strict";
import test from "node:test";
import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";

const adventures = await loadBuiltInFifthAdventures();
const cellarGoblin = adventures.find(({ id }) => id === "cellar-goblin");
// The Smugglers' Cellar as it was before #207, with its Giant Rat fight.
const smugglers = await loadFifthAdventure(
  "tests/fixtures/smugglers-with-rat.json",
);

// Con 14 (+2): 12 HP at level 1.
const sheet = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
  ],
  {
    placement: {
      strength: 0,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: 5,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  },
);

/** Ada at level 2, at full health, so she has Action Surge. */
function veteran() {
  const xp = 300;
  const leveled = { ...sheet, xp, level: levelForXp(xp) };
  return validateFighter({ ...leveled, hp: fighterProfile(leveled).maxHp });
}

function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

const PLAYER = "pc";

/** The engine action a projected action stands for. */
function engineAction({ action, target }) {
  switch (action) {
    case "attack":
      return { type: "attack", actorId: PLAYER, targetId: target.id };
    case "use":
      return { type: "use-item", itemId: target.id };
    case "move":
      return { type: "move", destinationId: target.id };
    case "examine":
      return { type: "examine", targetId: target.id };
    case "take":
      return { type: "take", itemId: target.id };
    case "equip":
    case "unequip":
    case "swap":
    case "drop":
      return { type: action, itemId: target.id };
    case "force":
    case "pick":
    case "break":
    case "unlock":
      return { type: action, doorId: target.id };
    case "search":
      return { type: "search", roomId: target.id };
    case "disarm":
      return { type: "disarm", trapId: target.id };
    case "talk":
      return { type: "talk", topicId: target.id };
    case "leave":
      return { type: "leave", roomId: target.id };
    default:
      return { type: action, actorId: PLAYER };
  }
}

/** A die that never runs out, for trying accepted actions. */
const anyDice = () => createSeededRandom(1);

/**
 * Each projected action is available exactly when the engine accepts it, and
 * an unavailable one gives a reason; the AI DM's tools list exactly the
 * available ones.
 */
function assertAgrees(runtime, state) {
  const actions = runtime.projectActions(state);
  for (const shown of actions) {
    const result = runtime.handleAction(state, engineAction(shown), anyDice());
    assert.equal(
      shown.available,
      result.rejection === undefined,
      `${JSON.stringify(shown)}: ${result.rejection?.reason ?? "accepted"}`,
    );
    assert.equal(
      typeof shown.reason === "string" && shown.reason.length > 0,
      !shown.available,
      JSON.stringify(shown),
    );
  }
  const tools = new Map(
    runtime.getGameToolDefinitions(state).map((tool) => [tool.name, tool]),
  );
  const enabled = (kind) =>
    actions
      .filter(({ action, available }) => action === kind && available)
      .map(({ target }) => target.id);
  for (const [tool, kind] of [
    ["attack", "attack"],
    ["use_item", "use"],
    ["move", "move"],
    ["examine", "examine"],
    ["take", "take"],
    ["equip", "equip"],
    ["unequip", "unequip"],
    ["swap_weapon", "swap"],
    ["drop", "drop"],
  ]) {
    const offered = tools.get(tool);
    const ids = enabled(kind);
    assert.deepEqual(
      offered === undefined
        ? []
        : Object.values(offered.parameters.properties)[0].enum,
      ids,
      `${tool} offers exactly the enabled ${kind} actions`,
    );
  }
  for (const [tool, kind] of [
    ["second_wind", "second-wind"],
    ["action_surge", "action-surge"],
    ["end_turn", "end-turn"],
  ]) {
    assert.equal(
      tools.has(tool),
      actions.some(({ action, available }) => action === kind && available),
      `${tool} is offered exactly while ${kind} is enabled`,
    );
  }
  return actions;
}

const find = (actions, action, targetId) =>
  actions.find(
    (shown) => shown.action === action && shown.target?.id === targetId,
  );

test("a fight shows the whole toolkit; at full HP Second Wind is disabled with the reason (#156)", () => {
  const runtime = createFifthRuntime(cellarGoblin, sheet);
  // Ada first (15 against 3), unhurt.
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(15, 3),
  ).state;
  const actions = assertAgrees(runtime, begun);
  assert.deepEqual(actions, [
    {
      action: "attack",
      target: { id: "goblin", name: "Goblin Warrior" },
      available: true,
    },
    { action: "second-wind", available: false, reason: "Full HP" },
    { action: "end-turn", available: true },
  ]);
  // The engine refuses Second Wind at full HP, and Action Surge below level
  // 2, which the bar does not show at all.
  assert.equal(
    runtime.handleAction(begun, { type: "second-wind", actorId: PLAYER })
      .rejection.reason,
    "You are unhurt, so Second Wind would heal nothing.",
  );
  assert.equal(
    runtime.handleAction(begun, { type: "action-surge", actorId: PLAYER })
      .rejection.reason,
    "You don't have Action Surge.",
  );
  assert.equal(find(actions, "action-surge"), undefined);
});

test("after the attack the action is used: Attack is disabled while the turn goes on (#156)", () => {
  const runtime = createFifthRuntime(cellarGoblin, sheet);
  // The goblin goes first and hits for 3 + 2: Ada is hurt, so Second Wind
  // keeps her turn going after she attacks.
  const hurt = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(4, 17, 15, 3),
  ).state;
  const missed = runtime.handleAction(
    hurt,
    { type: "attack", actorId: PLAYER, targetId: "goblin" },
    dice(2),
  ).state;
  const actions = assertAgrees(runtime, missed);
  assert.deepEqual(find(actions, "attack", "goblin"), {
    action: "attack",
    target: { id: "goblin", name: "Goblin Warrior" },
    available: false,
    reason: "Action used",
  });
  assert.equal(
    runtime.handleAction(missed, {
      type: "attack",
      actorId: PLAYER,
      targetId: "goblin",
    }).rejection.reason,
    "You have already used your action this turn.",
  );
  assert.equal(find(actions, "second-wind").available, true);
  // The AI DM is offered Second Wind and End turn, but no attack.
  const tools = runtime.getGameToolDefinitions(missed).map(({ name }) => name);
  assert.ok(!tools.includes("attack"));
  assert.ok(tools.includes("second_wind") && tools.includes("end_turn"));
});

/** A seed where Ada enters the rat cellar carrying the potion, hurt. */
function ratFight() {
  const walk = [
    { type: "move", destinationId: "alcove" },
    { type: "examine", targetId: "iron-chest" },
    { type: "take", itemId: "healing-potion" },
    { type: "move", destinationId: "stair-foot" },
    { type: "move", destinationId: "rat-cellar" },
  ];
  const runtime = createFifthRuntime(smugglers, sheet);
  for (let seed = 0; seed < 5000; seed++) {
    const random = createSeededRandom(seed);
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    for (const action of walk) {
      state = runtime.handleAction(state, action, random).state;
    }
    if (
      state.status === "playing" &&
      state.encounter.outcome === "ongoing" &&
      state.character.hp < 11
    ) {
      return { runtime, state, random };
    }
  }
  throw new Error("no seed where Ada starts the rat fight hurt");
}

test("a carried potion is in the fight's bar; with the bonus action spent it is disabled (#156)", () => {
  const { runtime, state, random } = ratFight();
  const before = assertAgrees(runtime, state);
  assert.deepEqual(
    before.map(({ action, target, available }) => [
      action,
      target?.name,
      available,
    ]),
    [
      ["attack", "Giant Rat", true],
      ["use", "Potion of Healing", true],
      ["second-wind", undefined, true],
      ["end-turn", undefined, true],
    ],
  );
  // Second Wind takes the bonus action: the potion and a second Second Wind
  // are refused, while the attack is still there.
  const winded = runtime.handleAction(
    state,
    { type: "second-wind", actorId: PLAYER },
    random,
  ).state;
  const after = assertAgrees(runtime, winded);
  assert.deepEqual(find(after, "use", "healing-potion"), {
    action: "use",
    target: { id: "healing-potion", name: "Potion of Healing" },
    available: false,
    reason: "Bonus action used",
  });
  assert.equal(
    runtime.handleAction(winded, {
      type: "use-item",
      itemId: "healing-potion",
    }).rejection.reason,
    "You have already used your bonus action this turn.",
  );
  assert.equal(find(after, "second-wind").reason, "Bonus action used");
  assert.equal(find(after, "attack", "giant-rat").available, true);
  assert.ok(
    !runtime
      .getGameToolDefinitions(winded)
      .some(({ name }) => name === "use_item" || name === "second_wind"),
  );
});

test("Action Surge is in the bar from level 2, and disabled once used (#156)", () => {
  const runtime = createFifthRuntime(cellarGoblin, veteran());
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(15, 3),
  ).state;
  assert.equal(
    find(assertAgrees(runtime, begun), "action-surge").available,
    true,
  );
  const surged = runtime.handleAction(begun, {
    type: "action-surge",
    actorId: PLAYER,
  }).state;
  const actions = assertAgrees(runtime, surged);
  assert.deepEqual(find(actions, "action-surge"), {
    action: "action-surge",
    available: false,
    reason: "No uses left",
  });
  assert.equal(
    runtime.handleAction(surged, { type: "action-surge", actorId: PLAYER })
      .rejection.reason,
    "You have no uses of Action Surge left.",
  );
});

test("exploring, the bar holds each move, examination, take and drink; a potion at full HP says why (#156)", () => {
  const runtime = createFifthRuntime(smugglers, sheet);
  let state = runtime.handleAction(runtime.createSession(), {
    type: "begin",
  }).state;
  assert.deepEqual(
    assertAgrees(runtime, state).map(({ action, target, available }) => [
      action,
      target.id,
      available,
    ]),
    [
      ["move", "alcove", true],
      ["move", "rat-cellar", true],
      ["examine", "rusted-lantern", true],
    ],
  );
  for (const action of [
    { type: "move", destinationId: "alcove" },
    { type: "examine", targetId: "iron-chest" },
  ]) {
    state = runtime.handleAction(state, action).state;
  }
  assert.deepEqual(
    assertAgrees(runtime, state).map(({ action, target }) => [
      action,
      target.id,
    ]),
    [
      ["move", "stair-foot"],
      ["examine", "iron-chest"],
      ["take", "healing-potion"],
      ["examine", "healing-potion"],
    ],
  );
  state = runtime.handleAction(state, {
    type: "take",
    itemId: "healing-potion",
  }).state;
  const actions = assertAgrees(runtime, state);
  assert.deepEqual(find(actions, "use", "healing-potion"), {
    action: "use",
    target: { id: "healing-potion", name: "Potion of Healing" },
    available: false,
    reason: "Full HP",
  });
  assert.ok(
    !runtime
      .getGameToolDefinitions(state)
      .some(({ name }) => name === "use_item"),
  );
});

test("each entry in the bar gives back the action it stands for (#134)", () => {
  const runtime = createFifthRuntime(smugglers, sheet);
  const state = runtime.handleAction(runtime.createSession(), {
    type: "begin",
  }).state;
  assert.deepEqual(runtime.projectActions(state).map(runtime.actionOf), [
    { type: "move", destinationId: "alcove" },
    { type: "move", destinationId: "rat-cellar" },
    { type: "examine", targetId: "rusted-lantern" },
  ]);
  // An entry this runtime didn't project stands for nothing.
  assert.equal(
    runtime.actionOf({
      action: "move",
      target: { id: "alcove", name: "Alcove" },
      available: true,
    }),
    undefined,
  );
});

test("an ended adventure projects no actions (#156)", () => {
  const runtime = createFifthRuntime(cellarGoblin, sheet);
  const state = { ...runtime.createSession(), status: "victory" };
  assert.deepEqual(runtime.projectActions(state), []);
});

test("in every state of seeded playthroughs, the bar agrees with the engine and the AI DM's tools (#156)", () => {
  for (const adventure of adventures) {
    for (let seed = 0; seed < 25; seed++) {
      const runtime = createFifthRuntime(
        adventure,
        seed % 2 === 0 ? sheet : veteran(),
      );
      const random = createSeededRandom(seed);
      let state = runtime.handleAction(
        runtime.createSession(),
        { type: "begin" },
        random,
      ).state;
      for (let step = 0; step < 60 && state.status === "playing"; step++) {
        const enabled = assertAgrees(runtime, state).filter(
          ({ available }) => available,
        );
        assert.ok(enabled.length > 0, "a playing session can always act");
        const chosen = enabled[random.roll(enabled.length) - 1];
        const result = runtime.handleAction(
          state,
          engineAction(chosen),
          random,
        );
        assert.equal(result.rejection, undefined);
        state = result.state;
      }
      assertAgrees(runtime, state);
    }
  }
});
