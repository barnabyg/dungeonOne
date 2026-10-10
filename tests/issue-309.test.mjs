// #309: thieves' tools for locks and traps. Thieves' tools are an SRD 5.2
// item (25 gp, 1 lb, common), carried and never equipped; the Rogue's kits
// pack them. Picking a lock needs them: a Dexterity check that adds the
// proficiency bonus only with proficiency. A trap's disarm needs them where
// the module says so. Without them a character forces or breaks the door,
// or finds its key. Investigation joins Perception as a way to search for
// traps. The validator refuses an essential route only thieves' tools open.
import assert from "node:assert/strict";
import test from "node:test";

import { playAdventure } from "../dist/balance-5e.js";
import {
  buildCharacter,
  characterProfile,
  projectCreation,
  defaultPlacement,
  validateCharacter,
} from "../dist/character-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  equipItem,
  itemName,
  itemPrice,
  itemTier,
  itemWeight,
  kitItems,
  kitPrice,
  KIT_VALUE_TOLERANCE,
} from "../dist/equipment-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { moduleFile, room, sealedCrypt } from "./fixtures/modules.mjs";

const TOOLS = "thieves-tools";
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
/** A level-1 Rogue from the default choices: its kit packs thieves' tools. */
const ROGUE_SHEET = buildCharacter(
  "b".repeat(32),
  "Vex",
  DICE,
  { ...ROGUE.defaults, placement: defaultPlacement(DICE, ROGUE) },
  "rogue",
);
/** The same Rogue, its tools left at home. */
const UNEQUIPPED_ROGUE = validateCharacter({ ...ROGUE_SHEET, stowed: [] });
/** The test Fighter, carrying thieves' tools it isn't proficient with. */
const TOOLED_FIGHTER = validateCharacter({ ...TEST_FIGHTER, stowed: [TOOLS] });

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** The sealed crypt with a dart trap only thieves' tools disarm. */
const TOOLS_ONLY_CRYPT = (() => {
  const file = moduleFile("sealed-crypt");
  const trap = file.passages.find(({ trap: here }) => here).trap;
  trap.disarm = trap.disarm.approaches.find(({ tool }) => tool === TOOLS);
  return validateModule(file);
})();

/** A runtime for `sheet` in a crypt, and its state in the hall. */
function inHall(sheet, crypt = sealedCrypt) {
  const runtime = createFifthRuntime(crypt, sheet);
  const begun = accepted(runtime, runtime.createSession(), {
    type: "begin",
  }).state;
  const state = accepted(runtime, begun, {
    type: "move",
    destinationId: "hall",
  }).state;
  return { runtime, state };
}

/** The projected actions at the iron door, as "action" or "action: reason". */
const atDoor = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ target }) => target?.id === "iron-door")
    .map(({ action, available, reason }) =>
      available ? action : `${action}: ${reason}`,
    );

test("thieves' tools are an SRD 5.2 item: 25 gp, 1 lb, common, carried and never equipped", () => {
  assert.equal(itemName(TOOLS), "Thieves' tools");
  assert.equal(itemPrice(TOOLS), 2500);
  assert.equal(itemWeight(TOOLS), 1);
  assert.equal(itemTier(TOOLS), "common");
  const change = equipItem(
    { equipment: ["leather", "shortsword"], stowed: [TOOLS] },
    TOOLS,
  );
  assert.equal(change.refusal?.code, "not-equippable");
  assert.match(change.refusal.reason, /carried, not equipped/u);
});

test("the Rogue's kits pack thieves' tools, 45 and 47 gp, within the class's tolerance; the Fighter's don't", () => {
  for (const kit of ROGUE.kits) {
    assert.ok(kitItems(kit).includes(TOOLS), kit);
  }
  assert.equal(kitPrice("shortsword"), 4500);
  assert.equal(kitPrice("shortsword-and-dagger"), 4700);
  assert.ok(
    Math.abs(kitPrice("shortsword") - kitPrice("shortsword-and-dagger")) <=
      KIT_VALUE_TOLERANCE,
  );
  for (const kit of ["mace", "two-daggers", "club-and-dagger"]) {
    assert.ok(!kitItems(kit).includes(TOOLS), kit);
  }
  // A new Rogue carries them stowed; the creation page lists them.
  assert.deepEqual(ROGUE_SHEET.stowed, [TOOLS]);
  assert.deepEqual(ROGUE_SHEET.equipment, ["leather", "shortsword", "dagger"]);
  const kits = projectCreation(
    DICE,
    { ...ROGUE.defaults, placement: defaultPlacement(DICE, ROGUE) },
    "rogue",
  ).kits;
  assert.deepEqual(
    kits.find(({ id }) => id === "shortsword-and-dagger").items,
    ["Leather armour", "Shortsword", "Dagger", "Thieves' tools"],
  );
  assert.deepEqual(characterProfile(ROGUE_SHEET).tools, ["Thieves' tools"]);
});

test("pick is offered only with thieves' tools; without them the door is broken or unlocked", () => {
  const fighter = inHall(TEST_FIGHTER);
  assert.deepEqual(atDoor(fighter.runtime, fighter.state), ["break"]);
  const rogue = inHall(ROGUE_SHEET);
  assert.deepEqual(atDoor(rogue.runtime, rogue.state), ["pick", "break"]);
  const unequipped = inHall(UNEQUIPPED_ROGUE);
  assert.deepEqual(atDoor(unequipped.runtime, unequipped.state), ["break"]);
  const tooled = inHall(TOOLED_FIGHTER);
  assert.deepEqual(atDoor(tooled.runtime, tooled.state), ["pick", "break"]);
});

test("picking without thieves' tools is refused without a die, naming the ways left", () => {
  const { runtime, state } = inHall(TEST_FIGHTER);
  const pick = { type: "pick", doorId: "iron-door" };
  const random = dice();
  const refused = runtime.handleAction(state, pick, random);
  assert.equal(refused.rejection.code, "no-tools");
  assert.equal(
    refused.rejection.reason,
    "You carry no thieves' tools, so you can't pick the Iron Door's lock. You could break it open or find its key.",
  );
  assert.equal(refused.state, state);
  assert.equal(random.drawn.length, 0);
  // With the break tried and the key in hand, the key is the way left.
  const broken = accepted(
    runtime,
    state,
    { type: "break", doorId: "iron-door" },
    dice([20, 1]),
  ).state;
  const keyed = { ...broken, inventory: [...broken.inventory, "iron-key"] };
  assert.equal(
    runtime.handleAction(keyed, pick, dice()).rejection.reason,
    "You carry no thieves' tools, so you can't pick the Iron Door's lock. You could unlock it with the Iron Key.",
  );
});

test("a pick is a Dexterity check with thieves' tools, adding proficiency only when proficient, and is remembered", () => {
  for (const [sheet, proficiency] of [
    [ROGUE_SHEET, 2],
    [TOOLED_FIGHTER, 0],
  ]) {
    const { runtime, state } = inHall(sheet);
    const pick = { type: "pick", doorId: "iron-door" };
    const result = accepted(runtime, state, pick, dice([20, 20]));
    const [check, door] = result.events;
    assert.equal(check.type, "check");
    assert.equal(check.roll.ability, "dexterity");
    assert.equal(check.roll.tool, TOOLS);
    assert.equal(check.roll.proficiency, proficiency);
    assert.equal(check.roll.label, "Dexterity check with thieves' tools");
    assert.equal(
      check.roll.total,
      20 + characterProfile(sheet).modifiers.dexterity + proficiency,
    );
    assert.equal(door.opened, true);
    assert.ok(result.state.openedDoorIds.includes("iron-door"));
  }
  // A failed pick is never rolled again.
  const { runtime, state } = inHall(ROGUE_SHEET);
  const failed = accepted(
    runtime,
    state,
    { type: "pick", doorId: "iron-door" },
    dice([20, 1]),
  ).state;
  const again = runtime.handleAction(
    failed,
    { type: "pick", doorId: "iron-door" },
    dice(),
  );
  assert.equal(again.rejection.code, "already-tried");
});

/** The hall once a search has found the dart trap on the offering arch. */
function trapFound(sheet, crypt = TOOLS_ONLY_CRYPT) {
  const { runtime, state } = inHall(sheet, crypt);
  const found = accepted(
    runtime,
    state,
    { type: "search", roomId: "hall" },
    dice([20, 20]),
  ).state;
  assert.ok(found.foundTrapIds.includes("dart-trap"));
  return { runtime, state: found };
}

test("a disarm authored with thieves' tools is offered only with them, and adds proficiency only when proficient", () => {
  const fighter = trapFound(TEST_FIGHTER);
  const offered = (runtime, state) =>
    runtime
      .projectActions(state)
      .filter(({ action }) => action === "disarm")
      .map(({ target }) => target.id);
  assert.deepEqual(offered(fighter.runtime, fighter.state), []);
  const refused = fighter.runtime.handleAction(
    fighter.state,
    { type: "disarm", trapId: "dart-trap" },
    dice(),
  );
  assert.equal(refused.rejection.code, "no-tools");
  assert.match(
    refused.rejection.reason,
    /^You carry no thieves' tools, so you can't disarm the Dart Trap\./u,
  );
  for (const [sheet, proficiency] of [
    [ROGUE_SHEET, 2],
    [TOOLED_FIGHTER, 0],
  ]) {
    const { runtime, state } = trapFound(sheet);
    assert.deepEqual(offered(runtime, state), ["dart-trap"]);
    const result = accepted(
      runtime,
      state,
      { type: "disarm", trapId: "dart-trap" },
      dice([20, 15]),
    );
    assert.equal(result.events[0].roll.tool, TOOLS);
    assert.equal(result.events[0].roll.proficiency, proficiency);
  }
});

test("a disarm with thieves' tools or bare hands offers only bare hands without tools", () => {
  // The crypt's dart trap, as the shipped traps (#309): thieves' tools or
  // a bare-handed Dexterity check, each at DC 12.
  const disarms = (sheet) => {
    const { runtime, state } = trapFound(sheet, sealedCrypt);
    return {
      runtime,
      state,
      views: runtime
        .projectActions(state)
        .filter(({ action }) => action === "disarm")
        .map(({ approach }) => approach?.id ?? "none"),
    };
  };
  assert.deepEqual(disarms(ROGUE_SHEET).views, [TOOLS, "dexterity"]);
  const fighter = disarms(TEST_FIGHTER);
  // One approach left, so the button names none and takes it.
  assert.deepEqual(fighter.views, ["none"]);
  const asked = fighter.runtime.handleAction(
    fighter.state,
    { type: "disarm", trapId: "dart-trap", approach: TOOLS },
    dice(),
  );
  assert.equal(asked.rejection.code, "no-tools");
  const made = accepted(
    fighter.runtime,
    fighter.state,
    { type: "disarm", trapId: "dart-trap" },
    dice([20, 20]),
  );
  assert.equal(made.events[0].roll.ability, "dexterity");
  assert.equal(made.events[0].roll.tool, undefined);
  assert.equal(made.events[0].roll.label, "Dexterity check");
});

test("a search for traps rolls the better of Perception and Investigation, once per room", () => {
  // Vex has Expertise in Perception; a scholar has it in Investigation.
  const scholar = buildCharacter(
    "d".repeat(32),
    "Quill",
    DICE,
    {
      ...ROGUE.defaults,
      placement: defaultPlacement(DICE, ROGUE),
      skills: ["athletics", "investigation", "persuasion", "stealth"],
      expertise: ["investigation", "stealth"],
    },
    "rogue",
  );
  for (const [sheet, skill] of [
    [ROGUE_SHEET, "perception"],
    [scholar, "investigation"],
    [TEST_FIGHTER, "perception"],
  ]) {
    const { runtime, state } = inHall(sheet);
    const searches = runtime
      .projectActions(state)
      .filter(({ action }) => action === "search");
    assert.deepEqual(
      searches.map(({ target, approach }) => [target.id, approach]),
      [["hall", undefined]],
      "one Search button",
    );
    const result = accepted(
      runtime,
      state,
      { type: "search", roomId: "hall" },
      dice([20, 18]),
    );
    const { roll } = result.events[0];
    assert.equal(roll.skill, skill);
    const bonus = characterProfile(sheet).skills.find(
      ({ id }) => id === skill,
    ).bonus;
    assert.equal(roll.total, 18 + bonus);
    assert.ok(result.state.foundTrapIds.includes("dart-trap"));
    const again = runtime.handleAction(
      result.state,
      { type: "search", roomId: "hall" },
      dice(),
    );
    assert.equal(again.rejection.code, "already-searched");
  }
});

test("the validator: a pick needs thieves' tools, which make a Dexterity check and do nothing else", () => {
  const door = (file) =>
    file.passages.find(({ door: here }) => here?.id === "iron-door").door;
  const untooled = moduleFile("sealed-crypt");
  delete door(untooled).pick.tool;
  assert.throws(
    () => validateModule(untooled),
    /door iron-door: picking a lock needs thieves' tools/u,
  );
  const strong = moduleFile("sealed-crypt");
  door(strong).pick.ability = "strength";
  assert.throws(
    () => validateModule(strong),
    /uses thieves' tools, which make a Dexterity check/u,
  );
  const skilled = moduleFile("sealed-crypt");
  door(skilled).break = { skill: "athletics", tool: TOOLS, dc: 18 };
  assert.throws(() => validateModule(skilled), /must have skill, dc/u);
  const forced = moduleFile("sealed-crypt");
  door(forced).break = { ability: "strength", tool: TOOLS, dc: 18 };
  assert.throws(() => validateModule(forced), /Dexterity check/u);
  const broken = moduleFile("sealed-crypt");
  door(broken).break = { ability: "dexterity", tool: TOOLS, dc: 18 };
  assert.throws(
    () => validateModule(broken),
    /door iron-door break uses thieves' tools, which only pick a lock or disarm a trap/u,
  );
  const other = moduleFile("sealed-crypt");
  door(other).pick.tool = "lute";
  assert.throws(() => validateModule(other), /tool must be thieves-tools/u);
  // A trap's find is only a DC: the search chooses Perception or Investigation.
  const found = moduleFile("sealed-crypt");
  found.passages.find(({ trap }) => trap).trap.find.skill = "perception";
  assert.throws(() => validateModule(found), /find/u);
});

test("a module whose only route to its goal is a lock only thieves' tools open is refused", () => {
  assert.throws(
    () => validateModule(moduleFile("picklock-cellar")),
    /room cellar is essential, but every route to it needs a check or passes a trap \(oak-door, which only thieves' tools open\)/u,
  );
  // A pick whose failure finds a hidden coal chute instead always gets the
  // character through, but only with tools in hand.
  const chute = moduleFile("picklock-cellar");
  chute.rooms.push({
    id: "coal-store",
    name: "Coal Store",
    description: "A black, dusty store beside the cellar.",
    features: [],
    items: [],
  });
  chute.passages.push(
    {
      id: "coal-chute",
      between: ["cellar-stair", "coal-store"],
      description: "A coal chute, found while fiddling at the lock.",
      hidden: true,
    },
    {
      id: "store-to-cellar",
      between: ["coal-store", "cellar"],
      description: "A low gap in the wall.",
    },
  );
  const opens = { effects: [{ type: "open", passage: "coal-chute" }] };
  chute.passages[0].door.pick.bands = {
    "failure-by-5": opens,
    failure: opens,
  };
  assert.throws(
    () => validateModule(chute),
    /room cellar is essential, but its only route needs thieves' tools \(oak-door, which only thieves' tools open, coal-chute\)/u,
  );
  // A key on the near side gives a way without tools.
  const keyed = moduleFile("picklock-cellar");
  keyed.passages[0].door.keyItemId = "oak-key";
  room(keyed, "cellar-stair").items.push({
    id: "oak-key",
    name: "Oak Key",
    description: "A heavy key on a nail by the stair.",
    kind: "key",
  });
  assert.equal(validateModule(keyed).id, "picklock-cellar");
});

test("the module, save, trace and library formats bump; an older module is refused", () => {
  assert.equal(FIFTH_LIBRARY_FORMAT, 15);
  assert.match(FIFTH_PROMPT_VERSION, /^5e-dm-v2\d$/u);
  const older = { ...moduleFile("sealed-crypt"), formatVersion: 26 };
  assert.throws(
    () => validateModule(older),
    new RegExp(`format version 26 is not ${FIFTH_ADVENTURE_FORMAT}`, "u"),
  );
});

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, text) => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});

/** A session in the crypt's hall. */
function sessionInHall(sheet) {
  const session = FifthSession.begin(1, sealedCrypt, sheet);
  session.act({ type: "move", destinationId: "hall" }, "click");
  assert.equal(session.state.roomId, "hall");
  return session;
}

test('scripted DM: "I pick the lock" without thieves\' tools is refused, naming the ways left', async () => {
  const session = sessionInHall(TEST_FIGHTER);
  const runtime = createFifthRuntime(sealedCrypt, TEST_FIGHTER);
  const names = runtime
    .getGameToolDefinitions(session.state)
    .map(({ name }) => name);
  assert.ok(!names.includes("pick_lock"));
  assert.ok(names.includes("break_door"));
  const before = session.state;
  const { turn } = await session.converse(
    "I pick the lock on the iron door.",
    scriptedDm("pick_lock", '{"door":"iron-door"}', "The lock holds."),
  );
  const { rejection } = turn.toolAttempts[0].result.engineResult;
  assert.equal(rejection.code, "no-tools");
  assert.match(
    rejection.reason,
    /no thieves' tools.*You could break it open or find its key\./u,
  );
  assert.equal(session.state, before);
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /Picking a lock needs thieves' tools/u);
});

test("scripted DM: a Rogue picks the lock with pick_lock, and searches with one tool", async () => {
  const session = sessionInHall(ROGUE_SHEET);
  const runtime = createFifthRuntime(sealedCrypt, ROGUE_SHEET);
  const tools = runtime.getGameToolDefinitions(session.state);
  const pick = tools.find(({ name }) => name === "pick_lock");
  assert.match(pick.description, /thieves' tools/u);
  const search = tools.find(({ name }) => name === "search");
  assert.match(search.description, /better of .*Perception.*Investigation/u);
  assert.deepEqual(Object.keys(search.parameters.properties), ["room"]);
  const picked = await session.converse(
    "I pick the lock.",
    scriptedDm("pick_lock", '{"door":"iron-door"}', "Click."),
  );
  assert.equal(picked.turn.toolAttempts[0].disposition.executed, true);
  assert.match(
    JSON.stringify(picked.turn),
    /Dexterity check with thieves' tools: d20 \d+ [+-] \d+ \+ 2 proficiency/u,
  );
  const searched = await session.converse(
    "I study the flagstones for pressure plates.",
    scriptedDm("search", '{"room":"hall"}', "You study the hall."),
  );
  assert.equal(searched.turn.toolAttempts[0].disposition.executed, true);
  assert.match(JSON.stringify(searched.turn), /Perception check/u);
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /better of Perception and Investigation/u,
  );
});

test("the balance harness: a Fighter without tools never picks or disarms with them; a Rogue does", () => {
  const counted = (sheet) => {
    const runtime = createFifthRuntime(TOOLS_ONLY_CRYPT, sheet);
    const seen = { pick: 0, break: 0, unlock: 0, disarm: 0 };
    const watched = {
      ...runtime,
      handleAction(state, action, random) {
        if (Object.hasOwn(seen, action.type)) {
          seen[action.type] += 1;
        }
        return runtime.handleAction(state, action, random);
      },
    };
    for (let seed = 0; seed < 10; seed++) {
      playAdventure(watched, "cautious", seed);
    }
    return seen;
  };
  const fighter = counted(TEST_FIGHTER);
  assert.equal(fighter.pick, 0);
  assert.equal(fighter.disarm, 0);
  const rogue = counted(ROGUE_SHEET);
  assert.ok(rogue.pick > 0 || rogue.unlock > 0);
  assert.ok(rogue.disarm > 0);
});
