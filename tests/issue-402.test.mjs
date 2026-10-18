// #402: using the room in a fight. A feature may offer a fight action: on
// the character's turn, with its action, a check (one to four approaches)
// against one opponent, whose bands deal damage, give a condition (prone,
// poisoned or paralysed, for a number of turns) or remove the opponent from
// the fight: it counts as defeated for XP, and what it carried is lost. Each
// is used once per fight or once per adventure, as authored, and removal
// never applies to a boss (D4). The judged styles never use fight actions;
// the reported use-room style does. Adventure 37, session 58, trace 52,
// prompt v38.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  gateAdventure,
  playAdventure,
  renderGateResult,
} from "../dist/balance-5e.js";
import {
  FIFTH_FIGHT_ACTION_DM_CASES,
  loadFifthFightActionEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { combatant, currentCombatant } from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  FIFTH_PROMPT_VERSION,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT, FifthTraceRun } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  restingTunnelsFile,
  room,
  statueCellar,
  statueCellarFile,
} from "./fixtures/modules.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const USE = (targetId, approach = "athletics") => ({
  type: "use-feature",
  featureId: "leaning-statue",
  targetId,
  ...(approach === undefined ? {} : { approach }),
});

function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** The statue cellar with its fight action changed by `change`. */
function withAction(change) {
  const module = structuredClone(statueCellarFile);
  const statue = room(module, "rat-cellar").features.at(-1);
  change(statue.fightAction, module, statue);
  return module;
}

/**
 * The cellar's fight with the character acting first: initiative 20 for
 * it, then 2 for the Scarred Rat and 1 for the Giant Rat (+3 each).
 */
function cellarFight(runtime) {
  const { state } = accepted(
    runtime,
    runtime.createSession(),
    MOVE("rat-cellar"),
    20,
    1,
    2,
  );
  assert.equal(currentCombatant(state.encounter).id, "pc");
  return state;
}

const fightActions = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action }) => action === "use-feature")
    .map(({ feature, target, approach, available, reason }) => ({
      feature: feature.id,
      target: target.id,
      approach: approach.id,
      available,
      ...(available ? {} : { reason }),
    }));

test("the formats bump, and the prompt", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 43);
  assert.equal(FIFTH_SESSION_FORMAT, 66);
  assert.equal(FIFTH_TRACE_FORMAT, 60);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v47");
});

// The validator.

test("a feature's fight action is read", () => {
  const { fightAction } = room(statueCellar, "rat-cellar").features.at(-1);
  assert.equal(fightAction.once, "adventure");
  assert.deepEqual(fightAction.check, {
    approaches: [
      { skill: "athletics", dc: 12 },
      { ability: "dexterity", dc: 14 },
    ],
  });
  assert.deepEqual(fightAction.bands["success-by-5"], {
    text: "The statue crashes down and buries the rat.",
    effects: [{ type: "remove" }],
  });
});

test("the validator refuses removal against a boss, and a fight action where no fight is fought", () => {
  const cases = [
    [
      (action, module) => {
        module.encounters[0].opponents[1].boss = true;
      },
      /feature leaning-statue's fight action can remove an opponent, but boss scarred-rat of encounter cellar-rat may be fought in room rat-cellar: a boss is never removed\./u,
    ],
    [
      (action, module) => {
        const statue = room(module, "rat-cellar").features.pop();
        room(module, "alcove").features.push(statue);
      },
      /feature leaning-statue's fight action needs a fight, but no fight is ever fought in room alcove\./u,
    ],
    [
      (action) => (action.once = "fight"),
      /feature leaning-statue's fight action can remove an opponent, so it must be usable once per adventure\./u,
    ],
    [(action) => (action.once = "turn"), /once must be fight or adventure\./u],
    [
      (action) => (action.bands.success.effects[1].turns = 2),
      /gives prone for 2 turns, but a prone creature gets up on its next turn: give 1\./u,
    ],
    [
      (action) =>
        action.bands.success.effects.push({
          type: "condition",
          condition: "frightened",
          turns: 1,
        }),
      /success band effects must list 1–2 entries\./u,
    ],
    [
      (action) => {
        action.bands.success.effects[1] = {
          type: "condition",
          condition: "frightened",
          turns: 1,
        };
      },
      /condition must be prone, poisoned, paralysed\./u,
    ],
    [
      (action) => {
        action.bands.success.effects[1] = {
          ...action.bands.success.effects[0],
        };
      },
      /success band has two damage effects\./u,
    ],
    [
      (action) => action.bands["success-by-5"].effects.push({ type: "remove" }),
      /success-by-5 band has two remove effects\./u,
    ],
    [
      (action) => {
        action.bands.success.effects = [
          { type: "remove" },
          action.bands.success.effects[0],
        ];
      },
      /success band removes its opponent, so it can have no other effect\./u,
    ],
    [
      (action) => {
        delete action.bands.success;
        delete action.bands["success-by-5"];
      },
      /fightAction needs a band with effects\./u,
    ],
    [
      (action) => {
        action.check.approaches[0].advantage = [
          { type: "flag", flag: "lit", name: "Lit" },
        ];
      },
      /fightAction check's approaches take a skill or an ability and a DC only\./u,
    ],
  ];
  for (const [change, message] of cases) {
    assert.throws(() => validateModule(withAction(change)), message);
  }
});

test("the validator refuses removal of an opponent carrying an item needed to go on", () => {
  // Ordinary loot (the Scarred Rat's Silver Chain) is lost with it (D4);
  // a key to a way, or an item a use needs, would strand the character.
  const keyed = structuredClone(statueCellarFile);
  room(keyed, "rat-cellar").items.push({
    id: "den-key",
    name: "Den Key",
    description: "A small iron key on a greasy thong.",
    kind: "key",
    hiddenIn: "scarred-rat",
  });
  keyed.passages.find(({ id }) => id === "cellar-to-den").door = {
    id: "den-door",
    name: "Den Door",
    description: "A sagging wooden door, locked.",
    state: "locked",
    keyItemId: "den-key",
  };
  assert.throws(
    () => validateModule(keyed),
    /feature leaning-statue's fight action can remove an opponent, but scarred-rat of encounter cellar-rat, which may be fought in room rat-cellar, carries den-key, which opens door den-door: removed, it would be lost with it\./u,
  );
  const used = structuredClone(statueCellarFile);
  room(used, "rat-cellar").features[0].uses = [
    {
      item: "silver-chain",
      text: "You hang the chain on the sacks.",
      effects: [{ type: "discovery", feature: "rusted-lantern" }],
    },
  ];
  assert.throws(
    () => validateModule(used),
    /feature leaning-statue's fight action can remove an opponent, but scarred-rat of encounter cellar-rat, which may be fought in room rat-cellar, carries silver-chain, which feature gnawed-sacks's use needs: removed, it would be lost with it\./u,
  );
  // Without the removal, the key and the use are fine.
  for (const module of [keyed, used]) {
    const { fightAction } = room(module, "rat-cellar").features.at(-1);
    delete fightAction.bands["success-by-5"];
    assert.doesNotThrow(() => validateModule(module));
  }
});

test("a fight action where only the wandering encounter is fought is accepted", () => {
  const module = restingTunnelsFile(25);
  room(module, "alcove").features.push({
    id: "rickety-shelf",
    name: "Rickety Shelf",
    description: "A shelf of loose stones over the sleeping place.",
    fightAction: {
      once: "fight",
      check: { skill: "athletics", dc: 10 },
      bands: {
        success: {
          effects: [
            {
              type: "damage",
              dice: 1,
              sides: 6,
              modifier: 0,
              damageType: "bludgeoning",
            },
          ],
        },
      },
    },
  });
  assert.doesNotThrow(() => validateModule(module));
  delete room(module, "alcove").restSite;
  assert.throws(
    () => validateModule(module),
    /needs a fight, but no fight is ever fought in room alcove\./u,
  );
});

// The runtime.

test("a fight action is offered in a fight, at each opponent by each approach", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.deepEqual(fightActions(runtime, start), []);
  assert.equal(
    runtime.handleAction(start, USE("giant-rat")).rejection.code,
    "no-fight",
  );
  const state = cellarFight(runtime);
  assert.deepEqual(fightActions(runtime, state), [
    {
      feature: "leaning-statue",
      target: "scarred-rat",
      approach: "athletics",
      available: true,
    },
    {
      feature: "leaning-statue",
      target: "scarred-rat",
      approach: "dexterity",
      available: true,
    },
    {
      feature: "leaning-statue",
      target: "giant-rat",
      approach: "athletics",
      available: true,
    },
    {
      feature: "leaning-statue",
      target: "giant-rat",
      approach: "dexterity",
      available: true,
    },
  ]);
});

test("a fight action is refused without a roll: no approach, a target not in the fight, no such feature", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const cases = [
    [
      {
        type: "use-feature",
        featureId: "leaning-statue",
        targetId: "giant-rat",
      },
      "choose-approach",
    ],
    [USE("goblin"), "no-target"],
    [USE("pc"), "same-side"],
    [{ ...USE("giant-rat"), featureId: "gnawed-sacks" }, "no-feature"],
    [{ ...USE("giant-rat"), featureId: "ledger" }, "no-feature"],
  ];
  for (const [action, code] of cases) {
    // Refused before the first die: no dice are given.
    const result = runtime.handleAction(state, action, uncheckedDice());
    assert.equal(result.rejection?.code, code, JSON.stringify(action));
    assert.equal(result.state, state);
  }
});

test("a failed check takes the action and does nothing to the opponent", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  // d20 5 + 5 = 10 against DC 12; then the rats' turns, with misses.
  const used = accepted(runtime, state, USE("scarred-rat"), 5, 2, 2);
  assert.deepEqual(
    used.events.slice(0, 3).map(({ type }) => type),
    ["used-feature", "check", "outcome"],
  );
  assert.match(
    renderFifthResult(used),
    /^You use the Leaning Statue against Scarred Rat\.\nAthletics check: d20 5 \+ 3 \+ 2 proficiency = 10 against DC 12\. Failure\.\nThe statue rocks, but stays up\./u,
  );
  assert.equal(combatant(used.state.encounter, "scarred-rat").hp, 7);
  assert.deepEqual(used.state.fightActions, [
    {
      featureId: "leaning-statue",
      encounterId: "cellar-rat",
      targetId: "scarred-rat",
      band: "failure",
    },
  ]);
});

test("a success deals its damage and knocks the opponent prone", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  // d20 8 + 5 = 13 against DC 12; 2d6 shows 1 and 2.
  const used = accepted(runtime, state, USE("scarred-rat"), 8, 1, 2, 2, 2, 2);
  const damage = used.events.find(({ type }) => type === "feature-damage");
  assert.deepEqual(
    {
      targetId: damage.targetId,
      damage: damage.damage,
      hpAfter: damage.hpAfter,
    },
    { targetId: "scarred-rat", damage: 3, hpAfter: 4 },
  );
  const prone = used.events.find(({ type }) => type === "condition");
  assert.deepEqual(
    { combatantId: prone.combatantId, kind: prone.kind, turns: prone.turns },
    { combatantId: "scarred-rat", kind: "prone", turns: 1 },
  );
  assert.match(
    renderFifthResult(used),
    /The statue topples onto the rat\.\nThe Leaning Statue hits Scarred Rat\. Damage 1 \+ 2 \+ 0 = 3 bludgeoning; Scarred Rat has 4\/7 HP\.\nScarred Rat is knocked prone/u,
  );
  // Its next attack, prone, has disadvantage.
  const bite = used.events.find(
    ({ type, actorId }) => type === "attack" && actorId === "scarred-rat",
  );
  assert.deepEqual(bite.mode.disadvantage, ["Prone"]);
});

test("a fight action may poison or paralyse its opponent for its turns", () => {
  for (const condition of ["poisoned", "paralysed"]) {
    const runtime = createFifthRuntime(
      validateModule(
        withAction((action) => {
          action.bands.success.effects = [
            { type: "condition", condition, turns: 2 },
          ];
        }),
      ),
      TEST_FIGHTER,
    );
    const state = cellarFight(runtime);
    const used = accepted(runtime, state, USE("scarred-rat"), 8, 2, 2, 2, 2);
    const given = used.events.find(({ type }) => type === "condition");
    assert.equal(given.kind, condition);
    assert.equal(given.turns, 2);
    const held = used.state.encounter.conditions.find(
      ({ targetId }) => targetId === "scarred-rat",
    );
    assert.equal(held.kind, condition);
    // Its first turn has passed, so one is left.
    assert.equal(held.turnsLeft, 1);
    // Paralysed, it makes no attack on its turn.
    assert.equal(
      used.events.some(
        ({ type, actorId }) => type === "attack" && actorId === "scarred-rat",
      ),
      condition === "poisoned",
    );
  }
});

test("a removed opponent is out of the fight: its XP is credited and what it carried is lost", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  // d20 15 + 5 = 20: success by 5. The Giant Rat's morale fails (6), and it
  // flees on its turn: the fight is won.
  const used = accepted(runtime, state, USE("scarred-rat"), 15, 6);
  assert.deepEqual(
    used.events
      .map(({ type }) => type)
      .filter((type) => ["removed", "defeated"].includes(type)),
    ["removed"],
  );
  assert.match(
    renderFifthResult(used),
    /Scarred Rat is out of the fight, defeated, and whatever it carried is lost with it\./u,
  );
  assert.deepEqual(used.state.removedOpponents, [
    { encounterId: "cellar-rat", opponentId: "scarred-rat" },
  ]);
  assert.ok(used.state.clearedEncounterIds.includes("cellar-rat"));
  // No body to search, so the Silver Chain is never found.
  const view = runtime.projectRoom(used.state);
  assert.equal(
    view.features.some(({ id }) => id === "scarred-rat"),
    false,
  );
  assert.equal(
    runtime
      .projectActions(used.state)
      .some(({ target }) => target?.id === "silver-chain"),
    false,
  );
  // Its XP is credited as a defeat.
  const settlement = runtime.projectSettlement({
    ...used.state,
    status: "victory",
    endingId: "cellar-cleared",
  });
  const award = settlement.xp.find(({ id }) => id.endsWith("/cellar-rat"));
  assert.equal(award.name, "Defeated Scarred Rat");
  assert.equal(award.xp, 25);
});

test("used once per adventure, a fight action is refused after, whatever the fight", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const used = accepted(runtime, state, USE("scarred-rat"), 5, 2, 2).state;
  assert.ok(
    fightActions(runtime, used).every(
      ({ available, reason }) => !available && reason === "Already used",
    ),
  );
  assert.deepEqual(runtime.handleAction(used, USE("giant-rat")).rejection, {
    code: "already-used",
    reason: "You already used the Leaning Statue in this adventure.",
  });
  // Used in another fight, it is spent all the same.
  const elsewhere = {
    ...state,
    fightActions: [{ ...used.fightActions[0], encounterId: "den-goblin" }],
  };
  assert.equal(
    runtime.handleAction(elsewhere, USE("giant-rat")).rejection.code,
    "already-used",
  );
});

test("used once per fight, a fight action is refused in that fight, and offered in another", () => {
  const runtime = createFifthRuntime(
    validateModule(
      withAction((action) => {
        action.once = "fight";
        delete action.bands["success-by-5"];
      }),
    ),
    TEST_FIGHTER,
  );
  const state = cellarFight(runtime);
  const used = accepted(runtime, state, USE("scarred-rat"), 5, 2, 2).state;
  assert.deepEqual(runtime.handleAction(used, USE("giant-rat")).rejection, {
    code: "already-used",
    reason: "You already used the Leaning Statue in this fight.",
  });
  // Used in another fight, it is offered again in this one.
  const elsewhere = {
    ...state,
    fightActions: [{ ...used.fightActions[0], encounterId: "den-goblin" }],
  };
  assert.ok(
    fightActions(runtime, elsewhere).every(({ available }) => available),
  );
});

test("a fight action needs the character's action, on its turn", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const spent = {
    ...state,
    encounter: {
      ...state.encounter,
      economy: { ...state.encounter.economy, actions: 0 },
    },
  };
  assert.equal(
    runtime.handleAction(spent, USE("giant-rat")).rejection.code,
    "action-used",
  );
  const theirs = {
    ...state,
    encounter: { ...state.encounter, turn: 1 },
  };
  assert.equal(
    runtime.handleAction(theirs, USE("giant-rat")).rejection.code,
    "not-your-turn",
  );
});

test("the character's poison gives the check disadvantage", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const state = cellarFight(runtime);
  const poisoned = {
    ...state,
    encounter: {
      ...state.encounter,
      conditions: [
        {
          kind: "poisoned",
          targetId: "pc",
          sourceId: "giant-rat",
          source: "Bite",
          turnsLeft: 1,
        },
      ],
    },
  };
  const used = accepted(runtime, poisoned, USE("scarred-rat"), 18, 4, 2, 2, 2);
  const { roll, band } = used.events.find(({ type }) => type === "check");
  assert.deepEqual(roll.mode.disadvantage, ["Poisoned"]);
  assert.equal(roll.d20, 4);
  assert.equal(band, "failure");
});

test("a reload replays the fight action, and a trace records it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-402-"));
  try {
    const path = join(directory, "session.json");
    const run = new FifthTraceRun(
      await FifthSession.create(
        path,
        "a".repeat(32),
        0,
        statueCellar,
        TEST_FIGHTER,
      ),
    );
    for (const action of [MOVE("rat-cellar"), USE("scarred-rat")]) {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    await run.session.persist();
    const loaded = await FifthSession.load(path, [statueCellar]);
    assert.deepEqual(loaded.state, run.session.state);
    assert.equal(loaded.state.fightActions.length, 1);
    assert.deepEqual(
      run.trace.turns.at(-1).stateAfter.fightActions,
      loaded.state.fightActions,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the AI DM's use_feature tool lists only offered pairs and their approaches", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  const tool = (state) =>
    runtime
      .getGameToolDefinitions(state)
      .find(({ name }) => name === "use_feature");
  assert.equal(tool(runtime.createSession()), undefined);
  const state = cellarFight(runtime);
  const offered = tool(state);
  assert.deepEqual(offered.parameters.properties.use.enum, [
    "leaning-statue:scarred-rat",
    "leaning-statue:giant-rat",
  ]);
  assert.deepEqual(offered.parameters.properties.approach.enum, [
    "athletics",
    "dexterity",
    null,
  ]);
  assert.match(offered.description, /the Leaning Statue against Giant Rat/u);
  const used = accepted(runtime, state, USE("scarred-rat"), 5, 2, 2).state;
  assert.equal(tool(used), undefined);
  // A call naming an opponent not in the fight is refused without effect.
  const result = runtime.dispatchGameTool(state, {
    id: "call-1",
    name: "use_feature",
    argumentsJson: JSON.stringify({
      use: "leaning-statue:goblin",
      approach: "athletics",
    }),
  });
  assert.equal(result.modelOutput.ok, false);
  assert.equal(result.state, state);
});

// The balance harness.

test("the judged styles never use the room; the use-room style does", () => {
  const runtime = createFifthRuntime(statueCellar, TEST_FIGHTER);
  for (const style of ["direct", "cautious", "avoid-optional"]) {
    for (const seed of [0, 1, 2, 3]) {
      assert.equal(playAdventure(runtime, style, seed).fightActions, 0);
    }
  }
  const used = [0, 1, 2, 3].map(
    (seed) => playAdventure(runtime, "use-room", seed).fightActions,
  );
  assert.ok(
    used.every((count) => count === 1),
    used.join(", "),
  );
});

test("the gate reports the use-room style beside its checks, never judging it, and its one-hit-kill measure ignores fight actions", () => {
  const seeds = Array.from({ length: 6 }, (_, seed) => seed);
  const result = gateAdventure(statueCellar, { seeds });
  const { useRoom } = result.verdict;
  assert.equal(useRoom.style, "use-room");
  assert.equal(useRoom.runs, 6);
  assert.ok(useRoom.meanFightActions > 0);
  assert.match(
    renderGateResult(statueCellar, result),
    /^ {2}Use the room, reported \(not judged\): the level 1, 5th percentile Fighter playing use-room survived \d+\.\d% of 6 runs with its weakest kit, [a-z-]+ \(.*\); over every kit and level it completed \d+\.\d%, used the room \d\.\d times and earned \d+\.\d XP a run\.$/mu,
  );
  // Without the statue, the one-hit-kill measure and the judged survival
  // are the same: neither plays the fight action.
  const plain = validateModule(
    withAction((action, module) => {
      room(module, "rat-cellar").features.pop();
    }),
  );
  const without = gateAdventure(plain, { seeds });
  assert.deepEqual(result.verdict.oneHitKill, without.verdict.oneHitKill);
  assert.deepEqual(result.verdict.survival, without.verdict.survival);
  // In a module without fight actions it plays as the judged style.
  assert.equal(without.verdict.useRoom.meanFightActions, 0);
  assert.equal(without.verdict.useRoom.rate, without.verdict.survival.rate);
  // Left out when not asked for, as passesGate leaves it out.
  const quiet = gateAdventure(statueCellar, {
    seeds: [0, 1],
    reportUseRoom: false,
  });
  assert.equal(quiet.verdict.useRoom, undefined);
});

// The AI DM evaluation.

test("the fight action evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthFightActionEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  assert.deepEqual(adventure, statueCellar);
  assert.deepEqual(
    FIFTH_FIGHT_ACTION_DM_CASES.map(({ id }) => id),
    ["room-topple", "room-not-in-fight", "room-second-use"],
  );
  for (const sample of FIFTH_FIGHT_ACTION_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
  // The second use's setup leaves the statue used, in the fight.
  const second = setUpCase(FIFTH_FIGHT_ACTION_DM_CASES[2], adventure);
  assert.equal(second.state.encounter.outcome, "ongoing");
  assert.equal(
    second.runtime
      .getGameToolDefinitions(second.state)
      .some(({ name }) => name === "use_feature"),
    false,
  );
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_FIGHT_ACTION_DM_CASES,
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
      FIFTH_FIGHT_ACTION_DM_CASES.map((sample) => [
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
