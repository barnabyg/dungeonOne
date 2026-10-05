// #183: every engine refusal carries a stable code beside its sentence. The
// action bar's short reason is chosen by code, so rewording a sentence can't
// silently turn a disabled button's reason into the whole sentence; the
// rejection card and the AI DM still get the sentence.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { act, currentCombatant, startEncounter } from "../dist/encounter-5e.js";
import {
  buildFighter,
  fighterProfile,
  levelForXp,
  validateFighter,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, SHORT_REASONS } from "../dist/runtime-5e.js";

const adventures = await loadBuiltInFifthAdventures();

// The #156 fighter: Con 14 (+2), 12 HP at level 1.
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
  },
);

/** Ada at level 2, at full health, so she has Action Surge. */
function veteran() {
  const xp = 300;
  const leveled = { ...sheet, xp, level: levelForXp(xp) };
  return validateFighter({ ...leveled, hp: fighterProfile(leveled).maxHp });
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
    default:
      return { type: action, actorId: PLAYER };
  }
}

/** Every state of seeded playthroughs of both adventures at levels 1 and 2. */
function* playthroughStates() {
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
        yield { runtime, state };
        const enabled = runtime
          .projectActions(state)
          .filter(({ available }) => available);
        const chosen = enabled[random.roll(enabled.length) - 1];
        state = runtime.handleAction(state, engineAction(chosen), random).state;
      }
    }
  }
}

test("every refusal the action bar shows has a code and the short reason for that code (#183)", () => {
  const seen = new Set();
  for (const { runtime, state } of playthroughStates()) {
    for (const shown of runtime.projectActions(state)) {
      if (shown.available) {
        continue;
      }
      const { rejection } = runtime.handleAction(
        state,
        engineAction(shown),
        createSeededRandom(1),
      );
      const label = `${JSON.stringify(shown)}: ${rejection.reason}`;
      assert.equal(typeof rejection.code, "string", label);
      const short = SHORT_REASONS[rejection.code];
      assert.equal(typeof short, "string", `no short reason: ${label}`);
      assert.equal(shown.reason, short, label);
      assert.notEqual(shown.reason, rejection.reason, label);
      seen.add(rejection.code);
    }
  }
  for (const code of [
    "action-used",
    "bonus-action-used",
    "full-hp",
    "no-uses-left",
  ]) {
    assert.ok(seen.has(code), `the playthroughs show ${code}`);
  }
});

test("every code is kebab-case and its short reason fits a button (#183)", () => {
  for (const [code, short] of Object.entries(SHORT_REASONS)) {
    assert.match(code, /^[a-z]+(-[a-z]+)*$/);
    assert.ok(short.length > 0 && short.length <= 20, `${code}: ${short}`);
  }
});

test("the encounter engine codes its refusals beside the sentence (#183)", () => {
  const pc = {
    id: "pc",
    name: "Ada",
    side: "party",
    armorClass: 16,
    hp: 12,
    maxHp: 12,
    dexterity: 20,
    initiativeBonus: 5,
    attack: {
      name: "Mace",
      bonus: 5,
      damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
      criticalRange: 20,
    },
    secondWind: {
      uses: 0,
      max: 2,
      healing: { dice: 1, sides: 10, modifier: 1 },
    },
  };
  const goblin = {
    ...pc,
    id: "goblin",
    name: "Goblin",
    side: "opponents",
    dexterity: 8,
    initiativeBonus: -1,
    secondWind: undefined,
  };
  const { state } = startEncounter([pc, goblin], { roll: () => 10 });
  assert.equal(currentCombatant(state).id, "pc");
  const none = {
    roll() {
      throw new Error("a refusal draws no dice");
    },
  };
  for (const [action, code] of [
    [{ type: "second-wind", actorId: "pc" }, "no-uses-left"],
    [{ type: "action-surge", actorId: "pc" }, "no-action-surge"],
    [{ type: "drink-potion", actorId: "pc", itemId: "x" }, "no-potion"],
    [{ type: "attack", actorId: "pc", targetId: "pc" }, "same-side"],
    [{ type: "attack", actorId: "pc", targetId: "dragon" }, "no-target"],
    [{ type: "end-turn", actorId: "goblin" }, "not-your-turn"],
  ]) {
    const { rejection } = act(state, action, none);
    assert.equal(rejection?.code, code, JSON.stringify(action));
    assert.equal(typeof rejection.reason, "string");
  }
});

test("a refused AI DM tool call still hands the AI DM the sentence, not the code (#183)", () => {
  const adventure = adventures[0];
  const runtime = createFifthRuntime(adventure, sheet);
  const random = createSeededRandom(2);
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  const result = runtime.dispatchGameTool(begun, {
    name: "examine",
    argumentsJson: JSON.stringify({ target: "no-such-thing" }),
  });
  assert.equal(result.modelOutput.ok, false);
  assert.deepEqual(Object.keys(result.modelOutput.error.rejection), ["reason"]);
  assert.equal(
    result.modelOutput.error.rejection.reason,
    result.engineResult.rejection.reason,
  );
  assert.equal(typeof result.engineResult.rejection.code, "string");
});
