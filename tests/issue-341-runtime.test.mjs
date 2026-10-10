// #341: a level-3 Life Cleric in the runtime. Turn Undead, Divine Spark
// and Preserve Life as bar actions and AI DM tools; leaving a room while
// every foe left is turned (D13: the fight stays unresolved, the fallen stay
// fallen); Prayer of Healing's short-rest benefit outside a fight; Aid's
// hit points in the character status.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCharacter,
  defaultPlacement,
  prepareSpells,
  settleCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { currentCombatant } from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

// Kept totals 15, 14, 13, 12, 10, 8: Strength 13, Wisdom 17, Con 15.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const earn = (sheet, xp, id) =>
  settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: sheet.stowed,
      ammunition: sheet.ammunition,
      treasure: [],
      purse: 0,
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });
/** Mira, a level-3 Life Cleric with 24 HP and a mace (+3, 1d6 + 1). */
const MIRA = withOwedChoices(
  earn(
    withOwedChoices(
      earn(
        buildCharacter(
          "d".repeat(32),
          "Mira",
          DICE,
          { ...CLERIC.defaults, placement: defaultPlacement(DICE, CLERIC) },
          "cleric",
        ),
        300,
        "cellar",
      ),
    ),
    600,
    "barrow",
  ),
);

/**
 * The rat tunnels with the cellar's rat swapped for a Skeleton and a
 * Zombie, for levels 1–3.
 */
const crypt = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "turning-crypt";
  module.recommendedLevels = { min: 1, max: 3 };
  const fight = module.encounters.find(({ id }) => id === "cellar-rat");
  fight.opponents = [
    {
      id: "skeleton",
      monster: "skeleton",
      description: "A skeleton with a rusty shortsword.",
    },
    {
      id: "zombie",
      monster: "zombie",
      description: "A shambling zombie.",
    },
  ];
  return validateModule(module);
})();

/** The fight in the cellar, Mira first: initiative 20, then 1 and 1. */
function cellarFight(runtime) {
  const result = runtime.handleAction(
    runtime.createSession(),
    { type: "move", destinationId: "rat-cellar" },
    uncheckedDice(20, 1, 1),
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(currentCombatant(result.state.encounter).id, "pc");
  return result.state;
}

function accepted(runtime, state, action, ...rolls) {
  const random = uncheckedDice(...rolls);
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const offered = (runtime, state, kind) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === kind && available);

test("the bar and the AI DM offer Turn Undead and Divine Spark against undead", () => {
  const runtime = createFifthRuntime(crypt, MIRA);
  const state = cellarFight(runtime);
  assert.equal(offered(runtime, state, "turn-undead").length, 1);
  assert.deepEqual(
    offered(runtime, state, "divine-spark").map(({ target, mode }) => [
      target.id,
      mode,
    ]),
    [
      ["skeleton", "radiant"],
      ["skeleton", "necrotic"],
      ["zombie", "radiant"],
      ["zombie", "necrotic"],
    ],
  );
  // Preserve Life waits until Mira is Bloodied.
  assert.equal(offered(runtime, state, "preserve-life").length, 0);
  const tools = runtime.getGameToolDefinitions(state).map(({ name }) => name);
  assert.ok(tools.includes("turn_undead"));
  assert.ok(tools.includes("divine_spark"));
  assert.ok(!tools.includes("preserve_life"));
  const spark = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "divine_spark");
  assert.match(
    spark.description,
    /Targets and modes: skeleton \(Skeleton: radiant or necrotic\); zombie \(Zombie: radiant or necrotic\)\./u,
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /call turn_undead when the player turns undead/u,
  );
  // The AI DM's divine_spark: the Zombie fails 1 + 3 against DC 13 and
  // takes 1d8 8 + 3 radiant.
  const called = runtime.dispatchGameTool(
    state,
    {
      id: "call-1",
      name: "divine_spark",
      argumentsJson: JSON.stringify({ target: "zombie", mode: "radiant" }),
    },
    uncheckedDice(1, 8),
  );
  assert.equal(called.modelOutput.ok, true);
  assert.match(
    renderFifthResult({
      state: called.state,
      events: called.engineResult.events,
    }),
    /Divine Spark: Zombie makes a Constitution saving throw: 1 \+ 3 = 4 against DC 13\. Failure\. Damage 8 \+ 3 = 11 radiant; Zombie has 4\/15 HP\. 1 use of Channel Divinity left\./u,
  );
  const bad = runtime.dispatchGameTool(state, {
    id: "call-2",
    name: "divine_spark",
    argumentsJson: JSON.stringify({ target: "zombie", mode: "fire" }),
  });
  assert.equal(bad.modelOutput.error.code, "invalid-arguments");
});

test("D13: with every foe left turned Mira may leave; the fallen stay fallen", () => {
  const runtime = createFifthRuntime(crypt, MIRA);
  let state = cellarFight(runtime);
  // Both fail their Wisdom saves, so neither acts on its turn.
  const turned = accepted(
    runtime,
    state,
    { type: "turn-undead", actorId: "pc" },
    1,
    1,
  );
  assert.match(
    renderFifthResult(turned),
    /Turn Undead reaches Skeleton and Zombie\. 1 use of Channel Divinity left\./u,
  );
  state = accepted(runtime, turned.state, {
    type: "end-turn",
    actorId: "pc",
  }).state;
  assert.equal(state.encounter.round, 2);
  // While both are turned the ways out are open.
  assert.deepEqual(
    offered(runtime, state, "move").map(({ target }) => target.id),
    ["stair-foot", "den"],
  );
  // The mace ends the Skeleton's turning and fells it (19 + 3; 6 + 1,
  // doubled by its vulnerability to bludgeoning).
  state = accepted(
    runtime,
    state,
    { type: "attack", actorId: "pc", targetId: "skeleton" },
    19,
    6,
  ).state;
  assert.equal(
    state.encounter.combatants.find(({ id }) => id === "skeleton").hp,
    0,
  );
  const left = accepted(runtime, state, {
    type: "move",
    destinationId: "stair-foot",
  });
  assert.equal(left.state.encounter, undefined);
  assert.equal(left.state.roomId, "stair-foot");
  assert.deepEqual(left.state.fallenOpponents, [
    { encounterId: "cellar-rat", opponentId: "skeleton" },
  ]);
  assert.match(
    renderFifthResult(left),
    /You leave the Rat-Gnawed Cellar with the Zombie still turned\. The fight is unresolved: it waits there if you come back, and the fallen stay fallen\./u,
  );
  // Coming back meets the Zombie alone (initiative 20, 1).
  const back = accepted(
    runtime,
    left.state,
    { type: "move", destinationId: "rat-cellar" },
    20,
    1,
  );
  assert.deepEqual(
    back.state.encounter.combatants.map(({ id }) => id),
    ["pc", "zombie"],
  );
  // Leaving mid-fight is refused while a foe still stands untouched.
  const fresh = cellarFight(runtime);
  assert.equal(
    runtime.handleAction(fresh, { type: "move", destinationId: "stair-foot" })
      .rejection.code,
    "fighting",
  );
});

test("Prayer of Healing outside a fight heals and gives back a Channel Divinity use, once", () => {
  const sheet = prepareSpells(MIRA, [
    "guiding-bolt",
    "healing-word",
    "inflict-wounds",
    "spiritual-weapon",
    "protection-from-poison",
    "prayer-of-healing",
  ]);
  const runtime = createFifthRuntime(crypt, sheet);
  const fresh = runtime.createSession();
  const state = {
    ...fresh,
    character: {
      ...fresh.character,
      hp: 10,
      featureUses: { ...fresh.character.featureUses, "channel-divinity": 0 },
    },
  };
  const prayer = offered(runtime, state, "cast").find(
    ({ spell }) => spell.id === "prayer-of-healing",
  );
  assert.ok(prayer !== undefined);
  // 2d8 5 + 6, no modifier, + 4 for Disciple of Life.
  const prayed = accepted(runtime, state, runtime.actionOf(prayer), 5, 6);
  assert.equal(prayed.state.character.hp, 24);
  assert.equal(prayed.state.character.featureUses["channel-divinity"], 1);
  assert.equal(prayed.state.shortRests, 0);
  assert.match(
    renderFifthResult(prayed),
    /Prayer of Healing: 5 \+ 6 \+ 0 \+ 4 \(Disciple of Life\) = 15; you regain 14 HP and have 24\/24 HP\./u,
  );
  const hurt = {
    ...prayed.state,
    character: { ...prayed.state.character, hp: 10 },
  };
  assert.equal(
    runtime.handleAction(hurt, runtime.actionOf(prayer), uncheckedDice())
      .rejection.reason,
    "You can't benefit from Prayer of Healing again until a long rest.",
  );
});

test("Aid raises the status's maximum hit points until a long rest", () => {
  const runtime = createFifthRuntime(crypt, MIRA);
  const state = runtime.createSession();
  const aid = offered(runtime, state, "cast").find(
    ({ spell }) => spell.id === "aid",
  );
  const aided = accepted(runtime, state, runtime.actionOf(aid));
  const status = runtime.projectCharacterStatus(aided.state);
  assert.equal(status.hp, 29);
  assert.equal(status.maxHp, 29);
  assert.match(
    renderFifthResult(aided),
    /Aid: your maximum and current hit points rise by 5, to 29\/29 HP\./u,
  );
});
