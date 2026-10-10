// #336: casting in the 5e runtime, with the test-only caster (Sage). The
// action bar offers each spell at each slot level and target the engine
// would take; outside a fight only a healing spell, on the character. The
// runtime refuses unknown and unprepared spells by name; the engine refuses
// the rest. Slots are copied out of a fight and come back on a long rest.
// The AI DM casts through the cast tool, and a trace replays casts.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { characterProfile } from "../dist/character-5e.js";
import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_CASTER, testCasterAt } from "../dist/test-caster-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import {
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { loneGoblin, restingTunnels } from "./fixtures/modules.mjs";

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(using, state, action, code) {
  const result = using.handleAction(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection.reason;
}

const castAt = (spellId, targetId, slotLevel) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetId],
  ...(slotLevel === undefined ? {} : { slotLevel }),
});

/** Each cast the bar shows: spell, slot level, target, and why not. */
const castViews = (using, state) =>
  using
    .projectActions(state)
    .filter(({ action }) => action === "cast")
    .map(({ spell, target, available, reason }) => [
      spell.id,
      spell.slotLevel ?? null,
      target.id,
      available ? "ok" : reason,
    ]);

/** Sage at `hp` in the lone goblin's fight, Sage's turn first. */
function inFight(sheet = TEST_CASTER, hp = sheet.hp) {
  const using = createFifthRuntime(loneGoblin, sheet);
  const session = using.createSession();
  const { state } = accepted(
    using,
    { ...session, character: { ...session.character, hp } },
    { type: "begin" },
    dice([20, 18], [20, 2]),
  );
  return { using, state };
}

test("in a fight the bar offers each spell at each slot level and target", () => {
  const { using, state } = inFight();
  assert.deepEqual(castViews(using, state), [
    ["fire-bolt", null, "goblin", "ok"],
    ["sacred-flame", null, "goblin", "ok"],
    ["magic-missile", 1, "goblin", "ok"],
    ["cure-wounds", 1, "pc", "Full HP"],
    ["healing-word", 1, "pc", "Full HP"],
  ]);
  // Magic Missile: the slot is spent and copied out of the fight. With
  // nothing left to do, Sage's turn ends and the goblin misses (a 1).
  const { state: after, events } = accepted(
    using,
    state,
    castAt("magic-missile", "goblin", 1),
    dice([4, 1], [4, 2], [4, 3], [20, 1]),
  );
  assert.deepEqual(
    events.slice(0, 2).map(({ type }) => type),
    ["cast", "spell-damage"],
  );
  assert.equal(after.character.featureUses["spell-slots-1"], 1);
  assert.equal(
    renderFifthResult({ state: after, events })
      .split("\n")
      .slice(0, 2)
      .join("\n"),
    "You cast Magic Missile at Goblin Warrior with a 1st-level spell slot (1 of 2 left).\nMagic Missile: 3 missiles hit Goblin Warrior. Damage 1 + 2 + 3 + 3 = 9 force; Goblin Warrior has 1/10 HP.",
  );
  assert.ok(
    using
      .projectCharacterStatus(after)
      .resources.includes("Spell slots: 1st 1 of 2 left"),
  );
});

test("one spell slot a turn: Healing Word then Magic Missile is refused", () => {
  const { using, state } = inFight(TEST_CASTER, 4);
  assert.deepEqual(
    castViews(using, state).map((entry) => entry[3]),
    ["ok", "ok", "ok", "ok", "ok"],
  );
  const { state: healed } = accepted(
    using,
    state,
    castAt("healing-word", "pc", 1),
    dice([4, 1], [4, 1]),
  );
  assert.equal(healed.character.hp, 9);
  assert.equal(
    refused(using, healed, castAt("magic-missile", "goblin", 1), "slot-spent"),
    "You have already spent a spell slot this turn: only one a turn, so only a cantrip now.",
  );
  assert.deepEqual(castViews(using, healed), [
    ["fire-bolt", null, "goblin", "ok"],
    ["sacred-flame", null, "goblin", "ok"],
    ["magic-missile", 1, "goblin", "Slot used this turn"],
    ["cure-wounds", 1, "pc", "Slot used this turn"],
    ["healing-word", 1, "pc", "Slot used this turn"],
  ]);
});

test("the runtime refuses an unknown spell or cantrip, or an unprepared one, by name", () => {
  const { using, state } = inFight();
  assert.equal(
    refused(using, state, castAt("wish", "goblin", 9), "unknown-spell"),
    "There is no such spell for you to cast.",
  );
  assert.equal(
    refused(using, state, castAt("shocking-grasp", "goblin"), "unknown-spell"),
    "You don't know the Shocking Grasp cantrip.",
  );
  assert.equal(
    refused(
      using,
      state,
      castAt("inflict-wounds", "goblin", 1),
      "unprepared-spell",
    ),
    "You haven't prepared Inflict Wounds.",
  );
  // A slot level Sage has none of, and an illegal target.
  assert.equal(
    refused(using, state, castAt("magic-missile", "goblin", 2), "no-slot"),
    "You have no 2nd-level spell slots.",
  );
  refused(using, state, castAt("fire-bolt", "pc"), "same-side");
  // A Fighter casts nothing, and is offered nothing to cast.
  const fighter = createFifthRuntime(loneGoblin, TEST_FIGHTER);
  const begun = accepted(
    fighter,
    fighter.createSession(),
    { type: "begin" },
    dice([20, 18], [20, 2]),
  ).state;
  refused(fighter, begun, castAt("fire-bolt", "goblin"), "no-spellcasting");
  assert.ok(
    !fighter.projectActions(begun).some(({ action }) => action === "cast"),
  );
});

test("Fire Bolt grows to 2d10 at level 5", () => {
  const { using, state } = inFight(testCasterAt(5));
  const { events } = accepted(
    using,
    state,
    castAt("fire-bolt", "goblin"),
    // Then the goblin's turn: it misses with a 1.
    dice([20, 15], [10, 3], [10, 4], [20, 1]),
  );
  assert.deepEqual(events[1].damageRolls, [3, 4]);
});

/** Sage outside a fight, at `hp`, with `slots` 1st-level slots left. */
function resting(hp, slots = 2, roomId = "stair-foot") {
  const using = createFifthRuntime(restingTunnels, TEST_CASTER);
  const begun = accepted(using, using.createSession(), {
    type: "begin",
  }).state;
  return {
    using,
    state: {
      ...begun,
      roomId,
      character: {
        ...begun.character,
        hp,
        featureUses: { ...begun.character.featureUses, "spell-slots-1": slots },
      },
    },
  };
}

test("outside a fight only a healing spell, on the character", () => {
  const { using, state } = resting(4);
  assert.deepEqual(castViews(using, state), [
    ["cure-wounds", 1, "pc", "ok"],
    ["healing-word", 1, "pc", "ok"],
  ]);
  const result = accepted(
    using,
    state,
    castAt("cure-wounds", "pc", 1),
    dice([8, 2], [8, 1]),
  );
  const healed = result.state;
  assert.equal(healed.character.hp, 10);
  assert.equal(healed.character.featureUses["spell-slots-1"], 1);
  assert.equal(
    renderFifthResult(result),
    "You cast Cure Wounds on yourself with a 1st-level spell slot (1 of 2 left).\nCure Wounds: 2 + 1 + 3 = 6; you regain 6 HP and have 10/10 HP.",
  );
  assert.deepEqual(
    describeFifthResult(
      result,
      [
        { sides: 8, value: 2 },
        { sides: 8, value: 1 },
      ],
      "Sage",
    )[1].rolls,
    [
      {
        purpose: "healing",
        roller: "Sage",
        target: "Sage",
        dice: [
          { sides: 8, value: 2 },
          { sides: 8, value: 1 },
        ],
        modifier: 3,
        total: 6,
        hpAfter: 10,
        maxHp: 10,
      },
    ],
  );
  assert.equal(
    refused(using, state, castAt("fire-bolt", "pc"), "fight-only"),
    "Fire Bolt is cast in a fight: outside one, only healing spells and spells that outlast a fight.",
  );
  assert.equal(characterProfile(TEST_CASTER).maxHp, 10);
  refused(
    using,
    { ...state, character: { ...state.character, hp: 10 } },
    castAt("cure-wounds", "pc", 1),
    "full-hp",
  );
  refused(
    using,
    resting(4, 0).state,
    castAt("cure-wounds", "pc", 1),
    "no-slot",
  );
});

test("a long rest restores spent spell slots; a short rest doesn't", () => {
  const sleeping = resting(10, 0, "alcove");
  const { state: rested, events } = accepted(
    sleeping.using,
    sleeping.state,
    { type: "long-rest" },
    dice([100, 99]),
  );
  assert.equal(rested.character.featureUses["spell-slots-1"], 2);
  assert.deepEqual(
    events.find(({ type }) => type === "uses-regained").features,
    [
      {
        featureId: "spell-slots-1",
        name: "1st-level spell slots",
        regained: 2,
        uses: 2,
        max: 2,
      },
    ],
  );
  // Unhurt with every hit die, a short rest would restore nothing: slots
  // don't come back on one.
  const { using, state } = resting(10, 0);
  refused(using, state, { type: "rest", hitDice: 0 }, "nothing-to-recover");
});

// The AI DM's cast tool.

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, args, text = "Done.") => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? {
          toolCalls: [
            { id: `${name}-1`, name, argumentsJson: JSON.stringify(args) },
          ],
        }
      : { text };
  },
});
const attempt = (turn) => turn.toolAttempts[0];
const castTool = (session) =>
  session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "cast");

/** A session of Sage in the lone goblin's fight, at Sage's turn. */
function castingSession() {
  for (let seed = 0; ; seed++) {
    const session = FifthSession.begin(seed, loneGoblin, TEST_CASTER);
    const fight = session.runtime.projectFight(session.state);
    if (fight.turn !== undefined) {
      return session;
    }
  }
}

test("scripted DM: the cast tool lists what the engine would take", () => {
  const session = castingSession();
  const tool = castTool(session);
  assert.deepEqual(tool.parameters.required, [
    "spell",
    "slot_level",
    "targets",
  ]);
  assert.deepEqual(tool.parameters.properties.spell.enum, [
    "fire-bolt",
    "sacred-flame",
    "magic-missile",
  ]);
  assert.deepEqual(tool.parameters.properties.slot_level.enum, [1, null]);
  assert.deepEqual(tool.parameters.properties.targets.items.enum, ["goblin"]);
  assert.match(
    tool.description,
    /magic-missile \(Magic Missile, 1st level: slot_level 1; one target: goblin \(Goblin Warrior\)\)/u,
  );
  assert.ok(offeredToolsMatchActions(session));
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /Call cast only when the player asks to cast a spell/u,
  );
  // No tool for a Fighter.
  const fighter = FifthSession.begin(0, loneGoblin, TEST_FIGHTER);
  assert.equal(castTool(fighter), undefined);
});

test("scripted DM: the DM can't invent a spell or cast without a slot", async () => {
  const session = castingSession();
  const cases = [
    [
      { spell: "wish", slot_level: 3, targets: ["goblin"] },
      "unknown-spell",
      "There is no such spell for you to cast.",
    ],
    [
      { spell: "inflict-wounds", slot_level: 1, targets: ["goblin"] },
      "unprepared-spell",
      "You haven't prepared Inflict Wounds.",
    ],
    [
      { spell: "magic-missile", slot_level: 2, targets: ["goblin"] },
      "no-slot",
      "You have no 2nd-level spell slots.",
    ],
    [
      { spell: "magic-missile", slot_level: null, targets: ["goblin"] },
      "slot-level",
      "Magic Missile needs a spell slot of 1st level or higher.",
    ],
  ];
  for (const [args, code, reason] of cases) {
    const before = session.state;
    const { turn } = await session.converse(
      "I cast a spell.",
      scriptedDm("cast", args),
    );
    const { result } = attempt(turn);
    assert.equal(result.engineResult.rejection.code, code, args.spell);
    assert.deepEqual(result.modelOutput.error.rejection, { reason });
    assert.equal(session.state, before);
  }
  // Malformed arguments never reach the engine.
  for (const args of [
    { spell: "magic-missile", targets: ["goblin"] },
    { spell: "magic-missile", slot_level: 1.5, targets: ["goblin"] },
    { spell: "magic-missile", slot_level: 1, targets: ["goblin"], extra: 1 },
  ]) {
    const { turn } = await session.converse(
      "I cast a spell.",
      scriptedDm("cast", args),
    );
    assert.equal(
      attempt(turn).result.modelOutput.error.code,
      "invalid-arguments",
    );
  }
  // With every slot spent, Magic Missile is refused for want of one.
  session.state = {
    ...session.state,
    encounter: {
      ...session.state.encounter,
      combatants: session.state.encounter.combatants.map((entry) =>
        entry.id === "pc"
          ? {
              ...entry,
              spellcasting: {
                ...entry.spellcasting,
                slots: [{ uses: 0, max: 2 }],
              },
            }
          : entry,
      ),
    },
  };
  const { turn } = await session.converse(
    "I cast Magic Missile.",
    scriptedDm("cast", {
      spell: "magic-missile",
      slot_level: 1,
      targets: ["goblin"],
    }),
  );
  assert.deepEqual(attempt(turn).result.engineResult.rejection, {
    code: "no-slot",
    reason: "You have no 1st-level spell slots left.",
  });
  assert.ok(
    !castTool(session).parameters.properties.spell.enum.includes(
      "magic-missile",
    ),
  );
});

test("a trace replays casts, and a saved session reloads them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-336-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      castingSession().seed,
      loneGoblin,
      TEST_CASTER,
    );
    const run = new FifthTraceRun(created);
    const { result } = run.click(castAt("fire-bolt", "goblin"));
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    if (run.session.state.status === "playing") {
      await run.message(
        "I cast Magic Missile at the goblin.",
        scriptedDm("cast", {
          spell: "magic-missile",
          slot_level: 1,
          targets: ["goblin"],
        }),
      );
    }
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [loneGoblin]);
    assert.deepEqual(replayed.state, run.session.state);
    assert.ok(
      JSON.parse(await readFile(tracePath, "utf8")).turns.some(
        ({ kind, action }) => kind === "click" && action.type === "cast",
      ),
    );
    await run.session.persist();
    const loaded = await FifthSession.load(path, [loneGoblin]);
    assert.deepEqual(loaded.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
