// #209: find, equip, swap and drop gear during an adventure. Modules place
// catalogue gear as ordinary items, found by examining a feature or a body.
// Outside a fight the character equips and unequips armour, a shield or a
// second light weapon, swaps the weapon it holds and drops what it carries;
// in a fight, drawing or swapping a weapon uses the turn's object
// interaction. Gear follows the adventure rollback contract.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateAdventure } from "../dist/balance-5e.js";
import {
  dropItem,
  equipItem,
  swapWeapon,
  unequipItem,
} from "../dist/equipment-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import {
  buildFighter,
  settleFighter,
  validateFighter,
} from "../dist/fighter-5e.js";
import {
  FifthSession,
  settleFifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";
import { createFifthRuntime, renderFifthResult } from "../dist/runtime-5e.js";

import {
  armoury,
  armouryBarrow as barrow,
  barrowFile,
  room,
} from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

const ROLLS = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];
const fighter = (strength) =>
  buildFighter("a".repeat(32), "Ada", ROLLS, {
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
// Str 16 (+3), Dex 12 (+1), Con 14 (+2): the rewards tests' Ada.
const ada = fighter(0);
// Str 9: below chain mail's Strength 13.
const weak = fighter(5);

function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

/** Plays `actions` from a fresh session, each accepted; returns the last result. */
function play(runtime, actions, random = dice()) {
  let result = { state: runtime.createSession(), events: [] };
  for (const action of actions) {
    result = runtime.handleAction(result.state, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return result;
}

const FIND = [
  { type: "begin" },
  { type: "examine", targetId: "scratched-lintel" },
];
const take = (itemId) => ({ type: "take", itemId });

const gear = (equipment, stowed = []) => ({ equipment, stowed });

test("swapping wields a carried weapon and stows the one held", () => {
  assert.deepEqual(
    swapWeapon(gear(["leather", "mace"], ["longsword"]), "longsword"),
    { gear: gear(["leather", "longsword"], ["mace"]), replaced: ["mace"] },
  );
  // Both light weapons go back when a third is drawn in their place.
  assert.deepEqual(
    swapWeapon(
      gear(["leather", "dagger", "dagger"], ["shortsword"]),
      "shortsword",
    ),
    {
      gear: gear(["leather", "shortsword"], ["dagger", "dagger"]),
      replaced: ["dagger", "dagger"],
    },
  );
});

test("swapping refuses a two-handed weapon with a shield, and what isn't carried", () => {
  assert.deepEqual(
    swapWeapon(
      gear(["leather", "shield", "mace"], ["greatsword"]),
      "greatsword",
    ).refusal,
    {
      code: "two-handed",
      reason:
        "The greatsword needs both hands, and your shield is on your arm.",
    },
  );
  assert.equal(
    swapWeapon(gear(["leather", "mace"]), "longsword").refusal.code,
    "not-carried",
  );
  assert.equal(
    swapWeapon(gear(["leather", "mace"], ["shield"]), "shield").refusal.code,
    "not-a-weapon",
  );
});

test("equipping puts on armour or a shield, or takes a second light weapon", () => {
  // New body armour replaces the old, which is stowed.
  assert.deepEqual(
    equipItem(gear(["leather", "mace"], ["chain-mail"]), "chain-mail"),
    { gear: gear(["chain-mail", "mace"], ["leather"]), replaced: ["leather"] },
  );
  assert.deepEqual(equipItem(gear(["leather", "mace"], ["shield"]), "shield"), {
    gear: gear(["leather", "shield", "mace"], []),
    replaced: [],
  });
  assert.deepEqual(
    equipItem(gear(["leather", "dagger"], ["shortsword"]), "shortsword"),
    { gear: gear(["leather", "dagger", "shortsword"], []), replaced: [] },
  );
});

test("equipping refuses a shield with a two-handed weapon, full hands and heavy second weapons", () => {
  assert.deepEqual(
    equipItem(gear(["leather", "greatsword"], ["shield"]), "shield").refusal,
    {
      code: "two-handed",
      reason: "The greatsword needs both hands: there is no hand for a shield.",
    },
  );
  assert.equal(
    equipItem(gear(["leather", "dagger", "dagger"], ["shield"]), "shield")
      .refusal.code,
    "hands-full",
  );
  assert.equal(
    equipItem(gear(["leather", "shield", "dagger"], ["dagger"]), "dagger")
      .refusal.code,
    "hands-full",
  );
  assert.deepEqual(
    equipItem(gear(["leather", "mace"], ["dagger"]), "dagger").refusal,
    {
      code: "not-light",
      reason:
        "A second weapon must be light, and so must the mace: swap to wield the dagger instead.",
    },
  );
  assert.equal(
    equipItem(gear(["leather", "mace"]), "shield").refusal.code,
    "not-carried",
  );
  // A two-handed weapon is refused for the shield, not for full hands, so the
  // refusal never points to a swap that would be refused too.
  assert.deepEqual(
    equipItem(gear(["leather", "shield", "mace"], ["greatsword"]), "greatsword")
      .refusal,
    {
      code: "two-handed",
      reason:
        "The greatsword needs both hands, and your shield is on your arm.",
    },
  );
});

test("unequipping stows armour, a shield or a second weapon, but never the last weapon", () => {
  assert.deepEqual(unequipItem(gear(["leather", "mace"]), "leather"), {
    gear: gear(["mace"], ["leather"]),
    replaced: [],
  });
  // Stowing the weapon attacked with leaves the second one in hand.
  assert.deepEqual(unequipItem(gear(["leather", "club", "dagger"]), "club"), {
    gear: gear(["leather", "dagger"], ["club"]),
    replaced: [],
  });
  assert.deepEqual(
    unequipItem(gear(["leather", "mace"], ["dagger"]), "mace").refusal,
    {
      code: "last-weapon",
      reason:
        "You would have no weapon in hand: swap to the weapon you want instead.",
    },
  );
  assert.equal(
    unequipItem(gear(["leather", "mace"], ["shield"]), "shield").refusal.code,
    "not-equipped",
  );
});

test("dropping leaves stowed gear behind; equipped gear must be unequipped first", () => {
  assert.deepEqual(dropItem(gear(["leather", "longsword"], ["mace"]), "mace"), {
    gear: gear(["leather", "longsword"], []),
    replaced: [],
  });
  assert.deepEqual(
    dropItem(gear(["leather", "longsword"]), "leather").refusal,
    {
      code: "still-equipped",
      reason: "Unequip the leather armour before you drop it.",
    },
  );
  assert.equal(
    dropItem(gear(["leather", "mace"]), "longsword").refusal.code,
    "not-carried",
  );
});

test("gear found behind the lintel is taken, wielded and carried out; the mace dropped stays behind", () => {
  const runtime = createFifthRuntime(barrow, ada);
  const found = play(runtime, FIND);
  assert.match(
    renderFifthResult(found),
    /You find the Longsword, Shield, Greatsword and Chain Mail\./,
  );
  const taken = play(runtime, [...FIND, take("lintel-longsword")]);
  assert.equal(renderFifthResult(taken), "You take the Longsword and stow it.");
  assert.deepEqual(taken.state.possessions.stowed, ["longsword"]);

  // Wielding it updates AC, attack and damage at once.
  const wielded = play(runtime, [
    ...FIND,
    take("lintel-longsword"),
    { type: "swap", itemId: "longsword" },
  ]);
  assert.equal(
    renderFifthResult(wielded),
    "You stow the mace and wield the longsword. AC 13; Longsword +5 to hit, 1d10 + 3 slashing (two-handed).",
  );
  const gear = runtime.projectRoom(wielded.state).gear;
  assert.equal(gear.armorClass, 13);
  assert.equal(gear.attack.weapon, "Longsword");
  assert.deepEqual(gear.attack.damage, {
    dice: 1,
    sides: 10,
    modifier: 3,
    type: "slashing",
  });
  assert.deepEqual(
    gear.worn.map(({ name }) => name),
    ["Leather armour"],
  );
  assert.deepEqual(
    gear.stowed.map(({ name }) => name),
    ["Mace"],
  );

  // The mace dropped lies in the room, and can be picked up again.
  const dropped = runtime.handleAction(wielded.state, {
    type: "drop",
    itemId: "mace",
  });
  assert.equal(renderFifthResult(dropped), "You drop the mace. It stays here.");
  assert.deepEqual(
    runtime.projectRoom(dropped.state).items.map(({ id, name }) => [id, name]),
    [
      ["lintel-shield", "Shield"],
      ["lintel-greatsword", "Greatsword"],
      ["lintel-mail", "Chain Mail"],
      ["dropped:mace", "Mace"],
    ],
  );
  const again = runtime.handleAction(dropped.state, take("dropped:mace"));
  assert.deepEqual(again.state.possessions.stowed, ["mace"]);
  assert.deepEqual(again.state.dropped, []);

  // Leaving keeps what is held at the end: the longsword, not the mace.
  const left = runtime.handleAction(dropped.state, {
    type: "leave",
    roomId: "barrow-mouth",
  });
  assert.equal(left.state.endingId, "out-empty-handed");
  const settlement = runtime.projectSettlement(left.state);
  assert.deepEqual(settlement.possessions.equipment, ["leather", "longsword"]);
  assert.deepEqual(settlement.possessions.stowed, []);
  assert.deepEqual(settlement.gear, ["robbers-barrow/lintel-longsword"]);
  const after = settleFighter(ada, settlement);
  assert.deepEqual(after.equipment, ["leather", "longsword"]);
  assert.deepEqual(after.stowed, []);
  assert.ok(after.finds.includes("robbers-barrow/lintel-longsword"));

  // Gear is found once: the longsword is not behind the lintel again.
  const replay = play(createFifthRuntime(barrow, after), FIND);
  assert.match(
    renderFifthResult(replay),
    /You find the Shield, Greatsword and Chain Mail\./,
  );
});

test("armour takes minutes to don, and heavy armour without the Strength slows its wearer", () => {
  const runtime = createFifthRuntime(barrow, weak);
  const donned = play(runtime, [
    ...FIND,
    take("lintel-mail"),
    { type: "equip", itemId: "chain-mail" },
  ]);
  assert.equal(
    renderFifthResult(donned),
    "You spend 1 minute doffing the leather armour and 10 minutes donning the chain mail. Your Strength is below the chain mail's 13: your speed drops by 10 feet, which has no effect without positions. AC 17; Mace +1 to hit, 1d6 − 1 bludgeoning.",
  );
  assert.deepEqual(donned.state.possessions.stowed, ["leather"]);
  assert.deepEqual(runtime.projectRoom(donned.state).gear.strengthShortfall, {
    armour: "Chain mail",
    strength: 13,
  });
});

test("in a fight, swapping a weapon uses the turn's object interaction; armour waits", () => {
  const runtime = createFifthRuntime(barrow, ada);
  // Ada wins initiative (20 to 1).
  const fight = play(
    runtime,
    [
      ...FIND,
      take("lintel-longsword"),
      take("lintel-shield"),
      { type: "move", destinationId: "burial-hall" },
    ],
    dice(20, 1),
  );
  const wield = runtime
    .projectActions(fight.state)
    .find(
      ({ action, target }) => action === "swap" && target.id === "longsword",
    );
  assert.deepEqual(wield, {
    action: "swap",
    target: { id: "longsword", name: "Longsword" },
    available: true,
  });
  const swapped = runtime.handleAction(fight.state, {
    type: "swap",
    itemId: "longsword",
  });
  assert.equal(
    renderFifthResult(swapped).split("\n")[0],
    "You stow the mace and wield the longsword, using your object interaction. AC 13; Longsword +5 to hit, 1d10 + 3 slashing (two-handed).",
  );
  assert.equal(swapped.state.encounter.economy.interaction, false);
  assert.deepEqual(
    runtime.handleAction(swapped.state, { type: "swap", itemId: "mace" })
      .rejection,
    {
      code: "interaction-used",
      reason: "You have already drawn or stowed a weapon this turn.",
    },
  );
  assert.equal(
    runtime.handleAction(swapped.state, { type: "equip", itemId: "shield" })
      .rejection.code,
    "fighting",
  );
  // The attack is made with the longsword in two hands: 2d10 + 3 on a crit.
  const attack = runtime.handleAction(
    swapped.state,
    { type: "attack", actorId: "pc", targetId: "barrow-goblin" },
    dice(20, 10, 10),
  );
  assert.match(
    renderFifthResult(attack),
    /Ada attacks Goblin Warrior with Longsword: 20 \+ 5 = 25 against AC 15\. Critical hit! Damage 10 \+ 10 \+ 3 = 23 slashing/,
  );
});

test("the AI DM's gear tools are bounded and every refusal is the engine's", () => {
  const runtime = createFifthRuntime(barrow, ada);
  const ready = play(runtime, [
    ...FIND,
    take("lintel-greatsword"),
    take("lintel-shield"),
  ]);
  const tools = runtime.getGameToolDefinitions(ready.state);
  const tool = (name) => tools.find((entry) => entry.name === name);
  assert.deepEqual(tool("swap_weapon").parameters.properties.weapon.enum, [
    "greatsword",
  ]);
  assert.deepEqual(tool("equip").parameters.properties.item.enum, ["shield"]);
  assert.deepEqual(tool("drop").parameters.properties.item.enum, [
    "greatsword",
    "shield",
  ]);
  const call = (state, name, args) =>
    runtime.dispatchGameTool(
      state,
      { name, argumentsJson: JSON.stringify(args) },
      dice(),
    );
  // Equipping what isn't carried is refused, whatever the AI asks.
  const missing = call(ready.state, "equip", { item: "plate" });
  assert.equal(missing.modelOutput.ok, false);
  assert.deepEqual(missing.engineResult.rejection, {
    code: "not-carried",
    reason: "You don't carry a plate armour to equip.",
  });
  const wielding = call(ready.state, "swap_weapon", { weapon: "greatsword" });
  assert.equal(wielding.modelOutput.ok, true);
  const shield = call(wielding.state, "equip", { item: "shield" });
  assert.deepEqual(shield.engineResult.rejection, {
    code: "two-handed",
    reason: "The greatsword needs both hands: there is no hand for a shield.",
  });
  assert.equal(
    runtime.renderDmNarration(
      { name: "equip", argumentsJson: '{"item":"shield"}' },
      shield,
    ),
    "The greatsword needs both hands: there is no hand for a shield.",
  );
});

/** A library holding one fresh Ada (Str 16, the mace kit). */
async function withLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-209-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const data = await library.create(
      "Ada",
      {
        placement: {
          strength: 0,
          dexterity: 1,
          constitution: 2,
          intelligence: 3,
          wisdom: 4,
          charisma: 5,
        },
        increase: { strength: 2, constitution: 1 },
        skills: ["athletics", "perception"],
        fightingStyle: "defense",
        kit: "mace",
        masteries: ["dagger", "mace", "shortsword"],
      },
      started.revision,
    );
    await run(library, data.characters[0].sheet.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const record = async (library) => (await library.read()).characters[0];

/** Starts the armoury barrow and plays `actions` at its mouth; no dice. */
async function arm(library, characterId, actions) {
  const session = await startFifthAdventure(
    library,
    0,
    characterId,
    barrow,
    (await library.read()).revision,
  );
  for (const action of [FIND[1], ...actions]) {
    const { result } = session.act(action, "click");
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return session;
}

const LEAVE = { type: "leave", roomId: "barrow-mouth" };

test("an interruption between the session and library writes never duplicates or loses gear", async () => {
  await withLibrary(async (library, characterId) => {
    const session = await arm(library, characterId, [
      take("lintel-longsword"),
      { type: "swap", itemId: "longsword" },
      { type: "drop", itemId: "mace" },
      LEAVE,
    ]);
    await session.persist();
    // A crash here: the session has ended, the library still names it.
    assert.deepEqual((await record(library)).sheet.equipment, [
      "leather",
      "mace",
    ]);
    const reloaded = await FifthSession.load(session.path, [barrow]);
    assert.deepEqual(reloaded.state.dropped, [
      { roomId: "barrow-mouth", item: "mace" },
    ]);
    await settleFifthSession(library, reloaded);
    await settleFifthSession(library, reloaded);
    await settleFifthSession(library, session);
    const { sheet, session: active } = await record(library);
    assert.equal(active, undefined);
    assert.deepEqual(sheet.equipment, ["leather", "longsword"]);
    assert.deepEqual(sheet.stowed, []);
    assert.deepEqual(sheet.finds, ["robbers-barrow/lintel-longsword"]);
  });
});

test("abandonment and defeat restore the starting gear exactly", async () => {
  await withLibrary(async (library, characterId) => {
    const first = await arm(library, characterId, [
      take("lintel-longsword"),
      take("lintel-shield"),
      LEAVE,
    ]);
    await first.persist();
    await settleFifthSession(library, first);
    const before = (await record(library)).sheet;
    assert.deepEqual(before.stowed, ["longsword", "shield"]);

    // Gear changed mid-adventure is forgotten on abandonment.
    const abandoned = await arm(library, characterId, [
      take("lintel-greatsword"),
      { type: "swap", itemId: "greatsword" },
      { type: "drop", itemId: "shield" },
      { type: "drop", itemId: "mace" },
    ]);
    await abandoned.persist();
    const data = await library.abandonSession(
      characterId,
      (await library.read()).revision,
    );
    assert.deepEqual(data.characters[0].sheet, before);

    const fallen = await arm(library, characterId, [
      { type: "equip", itemId: "shield" },
      { type: "drop", itemId: "longsword" },
    ]);
    fallen.state = {
      ...fallen.state,
      status: "defeat",
      endingId: "fallen-in-the-barrow",
    };
    await settleFifthSession(library, fallen);
    const { sheet, defeated } = await record(library);
    assert.equal(defeated, true);
    assert.deepEqual(sheet, { ...before, hp: 0 });
  });
});

test("the balance gate's one-hit-kill measure uses the strongest gear the module places", () => {
  const plain = validateModule(barrowFile);
  const enemy = (adventure) => {
    const result = gateAdventure(adventure, { seeds: [0] });
    assert.equal(result.ok, true);
    return result.verdict.oneHitKill.enemies[0];
  };
  const without = enemy(plain);
  assert.equal(without.gear, undefined);
  const withGear = enemy(barrow);
  // The greatsword (2d6) found behind the lintel beats every kit's weapon.
  assert.equal(withGear.gear, "greatsword");
  assert.ok(withGear.chance > without.chance);
});

test("the validator places gear only as a catalogue item, and keeps catalogue ids for the character's gear", () => {
  const broken = (change) => {
    const copy = structuredClone(armoury);
    change(room(copy, "barrow-mouth").items[0]);
    return () => validateModule(copy);
  };
  assert.throws(
    broken((item) => (item.gear = "halberd")),
    /room 1 item 1 is gear, so it needs gear: a catalogue weapon or armour\./,
  );
  assert.throws(
    broken((item) => (item.kind = "treasure")),
    /room 1 item 1 has gear, but only gear has gear\./,
  );
  assert.throws(
    broken((item) => delete item.hiddenIn),
    /room 1 item 1 is gear, so it must be hidden in a feature or carried by an opponent\./,
  );
  assert.throws(
    broken((item) => (item.id = "longsword")),
    /id longsword names catalogue gear; choose another\./,
  );
});

test("stowed gear must be catalogue gear; weight, not a count, limits it (#224)", () => {
  assert.throws(
    () => validateFighter({ ...ada, stowed: ["halberd"] }),
    /Invalid stowed gear\./,
  );
});
