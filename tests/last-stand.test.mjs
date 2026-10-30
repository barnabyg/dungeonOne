// Last Stand (#499), a house rule. When an opponent's attack brings the
// character to 0 HP while it carries a healing potion and its reaction is free,
// it makes a death saving throw (a d20, 11 or higher). On a success its fall
// waits: it drinks a potion with its reaction and rises to the potion's roll, or
// falls; on a failure it falls.
//
// The engine's tests build combatants by hand with scripted dice. The runtime's
// tests check the bar offers only Drink and Fall, the AI DM only use_item, and
// the fight view doesn't count the character defeated yet.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  act,
  availableActions,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { SPELLS, spellAtLevel } from "../dist/spells-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { waitsAtLastStand } from "./fixtures/last-stand.mjs";
import { potionCellar } from "./fixtures/modules.mjs";

const HEALING = {
  id: "healing",
  name: "Potion of Healing",
  healing: { dice: 2, sides: 4, modifier: 2 },
};
const GREATER = {
  id: "greater",
  name: "Potion of Greater Healing",
  healing: { dice: 4, sides: 4, modifier: 4 },
};

/** Ada at 3 of 7 HP, unarmoured (AC 12), with one Potion of Healing. */
const ada = (extra = {}) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 12,
  hp: 3,
  maxHp: 7,
  dexterity: 14,
  initiativeBonus: 2,
  saves: {
    strength: -1,
    dexterity: 2,
    constitution: 1,
    intelligence: 5,
    wisdom: 3,
    charisma: 0,
  },
  potions: [HEALING],
  attack: {
    name: "Quarterstaff",
    bonus: 1,
    damage: { dice: 1, sides: 6, modifier: -1, type: "bludgeoning" },
    criticalRange: 20,
  },
  ...extra,
});

const SCIMITAR = {
  name: "Scimitar",
  bonus: 4,
  damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
  criticalRange: 20,
};

const goblin = (extra = {}) => ({
  id: "goblin",
  name: "Goblin Warrior",
  side: "opponents",
  armorClass: 15,
  hp: 10,
  maxHp: 10,
  dexterity: 15,
  initiativeBonus: 2,
  saves: {
    strength: -1,
    dexterity: 2,
    constitution: 0,
    intelligence: 0,
    wisdom: -1,
    charisma: -1,
  },
  attack: SCIMITAR,
  ...extra,
});

/**
 * A fight the goblin opens (its initiative 15, Ada's 3); `turn` is the
 * goblin's dice up to its pause or Ada's turn.
 */
function goblinFirst(character, foe, ...turn) {
  const random = dice([20, 3], [20, 15], ...turn);
  const result = startEncounter([character, foe], random);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function acted(state, action, random = dice()) {
  const result = act(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(state, action, code) {
  const result = act(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection.reason;
}

const pc = (state) => combatant(state, "pc");
const types = (events) => events.map(({ type }) => type);
const drink = (itemId = "healing") => ({
  type: "drink-potion",
  actorId: "pc",
  itemId,
});
const fall = { type: "fall", actorId: "pc" };

test("a hit to 0 HP waits for Last Stand, and the potion drunk with the reaction raises the character", () => {
  // 15 + 4 hits AC 12; 4 + 2 = 6 damage brings Ada from 3 to 0 HP, and her
  // death saving throw, 12, meets DC 11.
  const { state, events } = goblinFirst(
    ada(),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 12],
  );
  assert.deepEqual(types(events).slice(-2), ["attack", "last-stand"]);
  assert.equal(events.at(-2).hpAfter, 0);
  assert.deepEqual(events.at(-1), {
    type: "last-stand",
    combatantId: "pc",
    attackerId: "goblin",
    d20: 12,
    dc: 11,
    success: true,
    potions: ["Potion of Healing"],
  });
  assert.equal(state.outcome, "ongoing");
  assert.equal(pc(state).hp, 0);
  assert.deepEqual(state.pendingReaction, {
    kind: "last-stand",
    reactorId: "pc",
    attackerId: "goblin",
    progress: { made: 0, bonusAction: true, rampage: false },
  });
  assert.deepEqual(availableActions(state, "pc"), ["drink-potion", "fall"]);
  // Nothing else is accepted until it is answered.
  assert.equal(
    refused(state, { type: "end-turn", actorId: "pc" }, "reaction-pending"),
    "Goblin Warrior's attack has brought Ada to 0 HP: first drink a potion as a Last Stand, or fall.",
  );
  refused(state, { type: "take-hit", actorId: "pc" }, "reaction-pending");
  refused(state, drink("greater"), "no-potion");
  // 3 + 2 + 2 = 7: Ada rises to the potion's roll.
  const { state: risen, events: answered } = acted(
    state,
    drink(),
    dice([4, 3], [4, 2]),
  );
  assert.deepEqual(answered[0], {
    type: "potion",
    combatantId: "pc",
    itemId: "healing",
    name: "Potion of Healing",
    rolls: [3, 2],
    modifier: 2,
    lastStand: true,
    healing: 7,
    hpAfter: 7,
    maxHp: 7,
  });
  assert.equal(risen.pendingReaction, undefined);
  assert.equal(pc(risen).hp, 7);
  assert.deepEqual(pc(risen).potions, []);
  // The goblin's turn ends and Ada's begins, with its reaction back and its
  // bonus action unspent.
  assert.equal(currentCombatant(risen).id, "pc");
  assert.ok(!risen.reacted.includes("pc"));
  assert.equal(risen.economy.bonusAction, true);
  assert.ok(!types(answered).includes("defeated"));
});

test("falling rather than drinking defeats the character", () => {
  const { state } = goblinFirst(ada(), goblin(), [20, 15], [6, 4], [20, 12]);
  const { state: fallen, events } = acted(state, fall);
  assert.deepEqual(types(events), ["defeated", "ended"]);
  assert.equal(fallen.outcome, "defeat");
  assert.deepEqual(pc(fallen).potions, [HEALING]);
});

test("a failed death saving throw falls at once; 11 is enough", () => {
  const { state, events } = goblinFirst(
    ada(),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 10],
  );
  assert.deepEqual(types(events).slice(-4), [
    "attack",
    "last-stand",
    "defeated",
    "ended",
  ]);
  assert.deepEqual(
    [events.at(-3).d20, events.at(-3).dc, events.at(-3).success],
    [10, 11, false],
  );
  assert.equal(state.outcome, "defeat");
  assert.equal(state.pendingReaction, undefined);
  const eleven = goblinFirst(ada(), goblin(), [20, 15], [6, 4], [20, 11]);
  assert.equal(eleven.state.pendingReaction.kind, "last-stand");
});

test("without a potion, the character falls at once", () => {
  const { state, events } = goblinFirst(
    ada({ potions: [] }),
    goblin(),
    [20, 15],
    [6, 4],
  );
  assert.ok(!types(events).includes("last-stand"));
  assert.deepEqual(types(events).slice(-2), ["defeated", "ended"]);
  assert.equal(state.outcome, "defeat");
});

test("with both kinds of potion, the player picks which to drink", () => {
  const { state, events } = goblinFirst(
    ada({ maxHp: 20, potions: [HEALING, GREATER] }),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 12],
  );
  assert.deepEqual(events.at(-1).potions, [
    "Potion of Healing",
    "Potion of Greater Healing",
  ]);
  const { state: risen } = acted(
    state,
    drink("greater"),
    dice([4, 4], [4, 3], [4, 2], [4, 1]),
  );
  assert.equal(pc(risen).hp, 14);
  assert.deepEqual(pc(risen).potions, [HEALING]);
});

test("a reaction spent on Shield leaves no Last Stand that round", () => {
  const shieldBearer = ada({
    spellcasting: {
      attackBonus: 5,
      saveDc: 13,
      modifier: 3,
      spells: [spellAtLevel(SPELLS.shield, 1)],
      slots: [{ uses: 2, max: 2 }],
    },
  });
  // 19 + 4 = 23 still meets AC 17 with Shield: the hit lands, and Ada falls.
  const { state } = goblinFirst(shieldBearer, goblin(), [20, 19]);
  const { state: fallen, events } = acted(
    state,
    {
      type: "cast",
      actorId: "pc",
      spellId: "shield",
      targetIds: ["pc"],
      slotLevel: 1,
    },
    dice([6, 4]),
  );
  assert.ok(!types(events).includes("last-stand"));
  assert.equal(fallen.outcome, "defeat");
  // Taking the hit keeps the reaction, so Last Stand is offered after it.
  const again = goblinFirst(shieldBearer, goblin(), [20, 19]);
  const { state: offered, events: taken } = acted(
    again.state,
    { type: "take-hit", actorId: "pc" },
    dice([6, 4], [20, 12]),
  );
  assert.equal(taken.at(-1).type, "last-stand");
  assert.equal(offered.pendingReaction.kind, "last-stand");
});

test("after Last Stand the attacker's other attacks follow, and a second fall can't be stood", () => {
  const twice = goblin({ multiattack: { attacks: 2, weapons: [SCIMITAR] } });
  const { state } = goblinFirst(ada(), twice, [20, 15], [6, 4], [20, 12]);
  // Ada rises to 4 HP (1 + 1 + 2); the second attack, 14 + 4, deals 6.
  const { state: fallen, events } = acted(
    state,
    drink(),
    dice([4, 1], [4, 1], [20, 14], [6, 4]),
  );
  assert.deepEqual(types(events), ["potion", "attack", "defeated", "ended"]);
  assert.equal(events[0].hpAfter, 4);
  assert.equal(fallen.outcome, "defeat");
});

test("falling to 0 HP ends the character's concentration, even when it stands", () => {
  const bless = {
    spellId: "bless",
    spell: "Bless",
    casterId: "pc",
    buff: SPELLS.bless.effect.buff,
    ends: "fight",
    concentration: true,
  };
  const { state, events } = goblinFirst(
    ada({ effects: [bless] }),
    goblin(),
    [20, 15],
    [6, 4],
    [20, 12],
  );
  assert.deepEqual(
    events
      .filter(({ type }) => type === "effect-ended")
      .map(({ spell, reason }) => [spell, reason]),
    [["Bless", "fell"]],
  );
  assert.equal(pc(state).effects, undefined);
});

test("falling is refused outside Last Stand", () => {
  const { state } = startEncounter([ada(), goblin()], dice([20, 15], [20, 3]));
  assert.equal(currentCombatant(state).id, "pc");
  assert.equal(
    refused(state, fall, "no-reaction-trigger"),
    "Falling answers Last Stand, and nothing has brought you to 0 HP.",
  );
  assert.ok(!availableActions(state, "pc").includes("fall"));
});

const sheet = testFighterAt(1);

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const lines = (result) => renderFifthResult(result).split("\n");
const bar = (using, state) =>
  using
    .projectActions(state)
    .map(({ action, target, available }) => [
      action,
      target?.id ?? null,
      available,
    ]);

/**
 * The character at 2 HP with the potion, in the cellar's fight: the goblin
 * first (18 against 2), its 15 + 4 hitting and its 6 damage bringing the
 * character to 0 HP, and its death saving throw `save`.
 */
function standing(save = 12) {
  const using = createFifthRuntime(potionCellar, sheet);
  const begun = accepted(using, using.createSession(), { type: "begin" });
  const held = accepted(using, begun.state, {
    type: "take",
    itemId: "healing-potion",
  }).state;
  const hurt = { ...held, character: { ...held.character, hp: 2 } };
  const result = accepted(
    using,
    hurt,
    { type: "move", destinationId: "cellar" },
    dice([20, 2], [20, 18], [20, 15], [6, 4], [20, save]),
  );
  return { using, result };
}

test("a fall to 0 HP waits for Last Stand: the bar offers Drink and Fall, and the fight view keeps the character up", () => {
  const { using, result } = standing();
  const { state } = result;
  assert.equal(state.status, "playing");
  assert.equal(state.character.hp, 0);
  assert.equal(
    lines(result).at(-1),
    `Last Stand: ${sheet.name} drops to 0 HP and makes a death saving throw: 12 against DC 11. Success: ${sheet.name} clings on, and can drink the Potion of Healing with the reaction to rise again, or fall.`,
  );
  assert.deepEqual(bar(using, state), [
    ["use", "healing-potion", true],
    ["fall", null, true],
  ]);
  const { encounter } = using.projectFight(state);
  assert.deepEqual(encounter.pendingReaction, {
    attacker: "Goblin Warrior",
    lastStand: true,
  });
  assert.equal(
    encounter.combatants.find(({ id }) => id === "pc").defeated,
    false,
  );
  // The AI DM is offered use_item with the potion, and no tool to fall.
  assert.ok(offeredToolsMatchActions({ runtime: using, state }));
  assert.deepEqual(
    using
      .getGameToolDefinitions(state)
      .map(({ name }) => name)
      .filter((name) => !["look", "get_character_status"].includes(name)),
    ["use_item"],
  );
  // Nothing else is accepted until it is answered.
  const ended = using.handleAction(
    state,
    { type: "end-turn", actorId: "pc" },
    dice(),
  );
  assert.equal(ended.rejection?.code, "reaction-pending");
});

test("a failed death saving throw ends the adventure at once", () => {
  const { result } = standing(9);
  assert.equal(result.state.status, "defeat");
  assert.ok(
    lines(result).includes(
      `Last Stand: ${sheet.name} drops to 0 HP and makes a death saving throw: 9 against DC 11. Failure: ${sheet.name} falls.`,
    ),
  );
});

test("drinking the potion as Last Stand raises the character to its roll and uses it up", () => {
  const { using, result } = standing();
  const drunk = accepted(
    using,
    result.state,
    { type: "use-item", itemId: "healing-potion" },
    dice([4, 3], [4, 2]),
  );
  assert.equal(
    lines(drunk)[0],
    // The test Fighter's sheet is at full HP.
    `Last Stand: you drink the Potion of Healing with your reaction: 3 + 2 + 2 = 7; you rise again with 7/${sheet.hp} HP.`,
  );
  assert.equal(drunk.state.character.hp, 7);
  assert.ok(!drunk.state.inventory.includes("healing-potion"));
  assert.equal(drunk.state.encounter.pendingReaction, undefined);
  // The character's turn comes, with the reaction spent until it starts.
  assert.equal(using.projectFight(drunk.state).turn !== undefined, true);
});

test("falling instead ends the adventure in its defeat ending", () => {
  const { using, result } = standing();
  const fallen = accepted(using, result.state, {
    type: "fall",
    actorId: "pc",
  });
  assert.equal(fallen.state.status, "defeat");
  assert.equal(fallen.state.endingId, "fallen-in-the-cellar");
});

test("the DM prompt tells the AI DM how Last Stand is answered", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /death saving throw \(Last Stand\); on a success its fall waits for the player's answer: only use_item is offered/u,
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /Falling instead is the player's choice alone, in the action bar: no tool takes it/u,
  );
});

test("a saved session waiting for Last Stand reloads it, a trace replays it, and older formats are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "last-stand-"));
  try {
    const path = join(directory, "session.json");
    // The first seed whose death saving throw succeeds.
    let seed = 0;
    while (!waitsAtLastStand(FifthSession.begin(seed, potionCellar, sheet))) {
      seed++;
    }
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      seed,
      potionCellar,
      sheet,
    );
    const run = new FifthTraceRun(created);
    const click = (action) => {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    };
    click({ type: "take", itemId: "healing-potion" });
    click({ type: "move", destinationId: "cellar" });
    // The character only waits, until the goblin brings it to 0 HP.
    while (run.session.state.encounter.pendingReaction?.kind !== "last-stand") {
      assert.equal(run.session.state.status, "playing");
      click({ type: "end-turn", actorId: "pc" });
    }
    await run.session.persist();
    const loaded = await FifthSession.load(path, [potionCellar]);
    assert.deepEqual(loaded.state, run.session.state);
    click({ type: "use-item", itemId: "healing-potion" });
    assert.ok(run.session.state.character.hp > 0);
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [potionCellar]);
    assert.deepEqual(replayed.state, run.session.state);
    // Older formats are refused, naming the file.
    const saved = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...saved, formatVersion: 64 }));
    await assert.rejects(
      FifthSession.load(path, [potionCellar]),
      new RegExp(
        String.raw`session\.json is an adventure session in format version 64, not ${FIFTH_SESSION_FORMAT}\. This build cannot continue it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    const trace = JSON.parse(await readFile(tracePath, "utf8"));
    await writeFile(tracePath, JSON.stringify({ ...trace, formatVersion: 58 }));
    await assert.rejects(
      verifyFifthTraceFile(tracePath, [potionCellar]),
      new RegExp(
        String.raw`trace\.json is a trace in format version 58, not ${FIFTH_TRACE_FORMAT}\. This build cannot replay it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
