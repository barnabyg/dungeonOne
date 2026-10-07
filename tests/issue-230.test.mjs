// #230: ranged weapons for the party. The shortbow, light crossbow and
// longbow shoot with Dexterity, spending one arrow or bolt a shot, and are
// refused with none. Without positions, a fight's first round is an opening
// volley; from the second, foes have closed and a ranged attack has
// disadvantage. Half the ammunition spent in a won fight is recovered.
// Ammunition is counted, weighed, and bought, sold and found by the 20.
import assert from "node:assert/strict";
import test from "node:test";
import { itemValue } from "../dist/adventure-5e.js";
import {
  oneHitKillChance,
  percentileCharacters,
  strongestAttackers,
} from "../dist/balance-5e.js";
import { act, availableActions, startEncounter } from "../dist/encounter-5e.js";
import {
  AMMUNITION,
  buyItem,
  equipItem,
  equipmentProfile,
  itemName,
  itemPrice,
  itemTier,
  itemWeight,
  loadWeight,
  readLoadout,
  salePrice,
  sellItem,
  swapWeapon,
  WEAPONS,
} from "../dist/equipment-5e.js";
import {
  fighterCarrying,
  fighterProfile,
  validateFighter,
} from "../dist/fighter-5e.js";
import { settleFifthSession, startFifthAdventure } from "../dist/session-5e.js";
import {
  createFifthRuntime,
  playerCombatant,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import {
  archer,
  archeryBarrow,
  archeryFile,
  QUIVER,
} from "./fixtures/archery-barrow.mjs";
import { room } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { withLibrary } from "./fixtures/library.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import { dice } from "./fixtures/engine-dice.mjs";

/** Applies `action`, which the engine must accept. */
function accept(runtime, state, action, random) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  return result;
}

const ATTACK = { type: "attack", actorId: "pc", targetId: "goblin" };
const ROOMY = { capacity: 240, other: 0 };
/** Str 16 (+3), Dex 12 (+1), Dex score 12. */
const CONTEXT = {
  modifiers: { strength: 3, dexterity: 1 },
  strengthScore: 16,
  dexterityScore: 12,
  proficiency: 2,
  masteries: [],
  criticalRange: 20,
};

test("the catalogue holds the three ranged weapons and arrows and bolts by the 20", () => {
  const rows = [
    // id, price, weight, damage, ammunition, tier
    ["shortbow", 2500, 2, "1d6", "arrows", "common"],
    ["light-crossbow", 2500, 5, "1d8", "bolts", "common"],
    ["longbow", 5000, 2, "1d8", "arrows", "uncommon"],
  ];
  for (const [id, price, weight, damage, ammunition, tier] of rows) {
    const weapon = WEAPONS[id];
    assert.deepEqual(
      [
        weapon.price,
        weapon.weight,
        `${weapon.damage.dice}d${weapon.damage.sides}`,
        weapon.damageType,
        weapon.ammunition,
        weapon.tier,
      ],
      [price, weight, damage, "piercing", ammunition, tier],
      id,
    );
    assert.ok(weapon.properties.includes("two-handed"), id);
    // None is light, so the light-weapon extra attack stays melee only.
    assert.ok(!weapon.properties.includes("light"), id);
  }
  assert.deepEqual(Object.keys(AMMUNITION), ["arrows", "bolts"]);
  assert.deepEqual(
    ["arrows", "bolts"].map((id) => [
      itemName(id),
      itemPrice(id),
      itemWeight(id),
      itemTier(id),
      salePrice(id),
    ]),
    [
      ["Arrows (20)", 100, 1, "common", 50],
      ["Bolts (20)", 100, 1.5, "common", 50],
    ],
  );
  // Slow needs positions: the crossbow and longbow take no mastery.
  assert.equal(
    equipmentProfile(["longbow"], {
      ...CONTEXT,
      dexterityScore: 14,
      masteries: ["shortbow"],
    }).attack.mastery,
    undefined,
  );
  assert.equal(
    equipmentProfile(["shortbow"], { ...CONTEXT, masteries: ["shortbow"] })
      .attack.mastery,
    "Vex",
  );
});

test("a ranged attack uses Dexterity; a longbow below Dexterity 13 has disadvantage", () => {
  const bow = equipmentProfile(["leather", "shortbow"], CONTEXT).attack;
  assert.deepEqual(
    [bow.ability, bow.bonus, bow.damage, bow.ammunition, bow.grip],
    [
      "dexterity",
      3,
      { dice: 1, sides: 6, modifier: 1, type: "piercing" },
      "arrows",
      "two-handed",
    ],
  );
  assert.deepEqual(bow.disadvantage, []);
  // SRD 5.2 Heavy: Dexterity 13 for a ranged weapon, whatever the Strength.
  assert.deepEqual(equipmentProfile(["longbow"], CONTEXT).attack.disadvantage, [
    "Heavy",
  ]);
  assert.deepEqual(
    equipmentProfile(["longbow"], {
      ...CONTEXT,
      strengthScore: 8,
      modifiers: { strength: -1, dexterity: 1 },
      dexterityScore: 13,
    }).attack.disadvantage,
    [],
  );
  // The greatsword still follows Strength.
  assert.deepEqual(
    equipmentProfile(["greatsword"], { ...CONTEXT, strengthScore: 12 }).attack
      .disadvantage,
    ["Heavy"],
  );
  const sheet = fighterProfile(archer());
  assert.equal(sheet.attack.weapon, "Shortbow");
  assert.equal(sheet.attack.ammunition, "arrows");
  assert.equal(sheet.attack.bonus, 4);
});

test("ranged weapons need both hands: no shield, no second weapon", () => {
  assert.throws(
    () => readLoadout(["leather", "shield", "shortbow"]),
    /The shortbow needs both hands: no shield or second weapon\./,
  );
  assert.throws(
    () => readLoadout(["light-crossbow", "dagger"]),
    /needs both hands/,
  );
  assert.equal(
    swapWeapon(
      { equipment: ["leather", "shield", "mace"], stowed: ["shortbow"] },
      "shortbow",
    ).refusal.code,
    "two-handed",
  );
  assert.equal(
    equipItem(
      { equipment: ["leather", "dagger"], stowed: ["shortbow"] },
      "shortbow",
    ).refusal.code,
    "not-light",
  );
  assert.equal(
    equipItem(
      { equipment: ["leather", "shortbow"], stowed: ["shield"] },
      "shield",
    ).refusal.code,
    "two-handed",
  );
});

const archerCombatant = (arrows) => ({
  id: "pc",
  name: "Wren",
  side: "party",
  armorClass: 14,
  hp: 12,
  maxHp: 12,
  dexterity: 14,
  initiativeBonus: 2,
  attack: {
    name: "Shortbow",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "piercing" },
    criticalRange: 20,
    ammunition: "arrows",
  },
  ammunition: { arrows, bolts: 0 },
});
const goblin = {
  id: "goblin",
  name: "Goblin Warrior",
  side: "opponents",
  armorClass: 15,
  hp: 10,
  maxHp: 10,
  dexterity: 15,
  initiativeBonus: 2,
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
};

test("each shot spends an arrow; round 1 is an opening volley, then close combat gives disadvantage", () => {
  // Wren 15 + 2 beats the goblin's 1 + 2; each time she misses, the goblin
  // rolls a 1.
  const random = dice(
    [20, 15],
    [20, 1],
    [20, 10],
    [20, 1],
    [20, 18],
    [20, 3],
    [20, 1],
  );
  const started = startEncounter([archerCombatant(2), goblin], random);
  const first = act(started.state, ATTACK, random);
  const volley = first.events.find(({ type }) => type === "attack");
  assert.equal(volley.mode, undefined);
  assert.deepEqual(volley.ammunition, { kind: "arrows", left: 1 });
  assert.equal(first.state.round, 2);
  const second = act(first.state, ATTACK, random);
  const close = second.events.find(({ type }) => type === "attack");
  assert.deepEqual(close.mode, {
    d20s: [18, 3],
    advantage: [],
    disadvantage: ["Close combat"],
  });
  assert.equal(close.d20, 3);
  assert.deepEqual(close.ammunition, { kind: "arrows", left: 0 });
  assert.equal(random.remaining(), 0);
});

test("a shot with no ammunition is refused, draws no dice, and Attack is not offered", () => {
  const random = dice([20, 15], [20, 1]);
  const { state } = startEncounter([archerCombatant(0), goblin], random);
  assert.deepEqual(availableActions(state, "pc"), ["end-turn"]);
  assert.deepEqual(act(state, ATTACK, random).rejection, {
    code: "no-arrows",
    reason: "You have no arrows left for the shortbow.",
  });
  const bolts = {
    ...archerCombatant(0),
    attack: {
      ...archerCombatant(0).attack,
      name: "Light crossbow",
      ammunition: "bolts",
    },
    ammunition: { arrows: 20, bolts: 0 },
  };
  const crossbow = startEncounter([bolts, goblin], dice([20, 15], [20, 1]));
  assert.equal(act(crossbow.state, ATTACK, random).rejection.code, "no-bolts");
});

test("winning a fight recovers half the ammunition spent, rounded down, and the settlement keeps it", () => {
  const runtime = createFifthRuntime(loneGoblin, archer(3));
  const random = dice(
    // Initiative: Wren first.
    [20, 15],
    [20, 1],
    // A miss in the opening volley, then the goblin rolls a 1.
    [20, 10],
    [20, 1],
    // Round 2: two 20s at disadvantage, a critical for 6 + 6 + 2.
    [20, 20],
    [20, 20],
    [6, 6],
    [6, 6],
  );
  const begun = accept(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    random,
  );
  const missed = accept(runtime, begun.state, ATTACK, random);
  assert.match(
    renderFifthResult(missed),
    /^Wren attacks Goblin Warrior with Shortbow: 10 \+ 4 = 14 against AC 15\. Miss\. 2 arrows left\./,
  );
  // In the fight, the views count what is left.
  assert.deepEqual(runtime.projectRoom(missed.state).gear.ammunition, [
    { id: "arrows", name: "Arrows", count: 2 },
  ]);
  const won = accept(runtime, missed.state, ATTACK, random);
  assert.equal(random.remaining(), 0);
  assert.match(
    renderFifthResult(won),
    /disadvantage \(Close combat\): 20 and 20, keeping 20;.*Critical hit!.* 1 arrow left\.[\s\S]*\nYou recover 1 arrow from the fight\. You have 2 arrows\./,
  );
  assert.equal(won.state.status, "victory");
  assert.deepEqual(won.state.possessions.ammunition, { arrows: 2, bolts: 0 });
  assert.deepEqual(
    runtime.projectSettlement(won.state).possessions.ammunition,
    {
      arrows: 2,
      bolts: 0,
    },
  );
});

test("out of arrows, the bar shows Attack disabled as No arrows until a weapon is drawn", () => {
  const runtime = createFifthRuntime(loneGoblin, archer(0));
  const begun = accept(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    dice([20, 15], [20, 1]),
  ).state;
  const attack = runtime
    .projectActions(begun)
    .find(({ action }) => action === "attack");
  assert.deepEqual(attack, {
    action: "attack",
    target: { id: "goblin", name: "Goblin Warrior" },
    available: false,
    reason: "No arrows",
  });
  assert.deepEqual(runtime.handleAction(begun, ATTACK).rejection, {
    code: "no-arrows",
    reason: "You have no arrows left for the shortbow.",
  });
  // The AI DM is offered no attack, as the bar shows none enabled.
  assert.ok(
    !runtime
      .getGameToolDefinitions(begun)
      .some(({ name }) => name === "attack"),
  );
  // Wielding the mace, with the object interaction, makes Attack available.
  const drawn = accept(runtime, begun, { type: "swap", itemId: "mace" }).state;
  assert.equal(
    runtime.projectActions(drawn).find(({ action }) => action === "attack")
      .available,
    true,
  );
});

test("a defeat leaves the ammunition spent: nothing is settled", () => {
  const runtime = createFifthRuntime(loneGoblin, archer(1));
  const random = dice(
    [20, 1],
    [20, 15],
    // The goblin hits three times for 6 + 2 while Wren misses.
    [20, 19],
    [6, 6],
    [20, 2],
    [20, 19],
    [6, 6],
  );
  let state = accept(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  state = accept(runtime, state, ATTACK, random).state;
  // Hurt, Wren's turn waits for her to end it.
  state = accept(
    runtime,
    state,
    { type: "end-turn", actorId: "pc" },
    random,
  ).state;
  assert.equal(state.status, "defeat");
  assert.equal(runtime.projectSettlement(state), undefined);
});

test("ammunition weighs 1 lb a bundle of arrows and 1.5 lb of bolts, summed exactly", () => {
  const load = (arrows, bolts, purse = 0) =>
    loadWeight({
      equipment: [],
      stowed: [],
      purse,
      other: 0,
      ammunition: { arrows, bolts },
    });
  assert.equal(load(20, 0), 1);
  assert.equal(load(0, 20), 1.5);
  assert.equal(load(7, 3), 0.575);
  // 3 copper coins and an arrow.
  assert.equal(load(1, 0, 3), 0.11);
  // Leather 10 lb, a shortbow 2 lb and a mace 4 lb, and two arrows.
  assert.equal(fighterCarrying(archer(2)).weight, 16.1);
});

test("arrows and bolts are bought by the 20, refused over capacity, and sold by the 20", () => {
  const holding = (purse, arrows = 0) => ({
    equipment: ["leather", "shortbow"],
    stowed: [],
    purse,
    ammunition: { arrows, bolts: 0 },
  });
  assert.deepEqual(buyItem(holding(150, 3), "arrows", ROOMY), {
    holding: holding(50, 23),
    price: 100,
  });
  assert.deepEqual(buyItem(holding(50), "bolts", ROOMY).refusal, {
    code: "too-little-coin",
    reason:
      "The bundle of 20 bolts costs 1 gp, and your purse holds only 5 sp.",
  });
  // 12 lb carried of 12.5: 20 arrows would take it to 13.
  assert.deepEqual(
    buyItem(holding(100), "arrows", { capacity: 12.5, other: 0 }).refusal,
    {
      code: "too-heavy",
      reason:
        "The bundle of 20 arrows weighs 1 lb, and you carry 12.02 lb of the 12.5 lb your Strength allows: sell or drop something first.",
    },
  );
  assert.deepEqual(sellItem(holding(0, 27), "arrows"), {
    holding: holding(50, 7),
    price: 50,
    replaced: [],
  });
  assert.deepEqual(sellItem(holding(0, 7), "arrows").refusal, {
    code: "short-bundle",
    reason: "You carry only 7 arrows, and a merchant buys them by the 20.",
  });
  assert.equal(sellItem(holding(0), "bolts").refusal.code, "not-carried");
});

test("a quiver behind the lintel adds 20 arrows; the bowyer buys them back by the 20", () => {
  const runtime = createFifthRuntime(archeryBarrow, archer(2));
  let state = accept(runtime, runtime.createSession(), {
    type: "examine",
    targetId: "scratched-lintel",
  }).state;
  const taken = accept(runtime, state, { type: "take", itemId: QUIVER.id });
  assert.equal(
    renderFifthResult(taken),
    "You take the Quiver of Arrows: 20 arrows. You have 22 arrows.",
  );
  state = taken.state;
  assert.deepEqual(runtime.projectRoom(state).gear.ammunition, [
    { id: "arrows", name: "Arrows", count: 22 },
  ]);
  assert.equal(runtime.projectRoom(state).carrying.weight, 17.1);
  const status = runtime.projectCharacterStatus(state);
  assert.equal(status.ammunition, "22 arrows");
  assert.deepEqual(status.attacks, [
    "Shortbow +4 to hit, 1d6 + 2 piercing (two-handed) (ranged: spends arrows; disadvantage from round 2)",
  ]);
  const bowyer = runtime
    .projectRoom(state)
    .creatures.find(({ id }) => id === "bowyer");
  assert.deepEqual(bowyer.wares, [
    { id: "shortbow", name: "Shortbow", price: "25 gp" },
    { id: "light-crossbow", name: "Light crossbow", price: "25 gp" },
    { id: "arrows", name: "Arrows (20)", price: "1 gp" },
    { id: "bolts", name: "Bolts (20)", price: "1 gp" },
  ]);
  assert.ok(
    bowyer.salePrices.some(
      ({ id, price }) => id === "arrows" && price === "5 sp",
    ),
  );
  const trade = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "trade");
  assert.match(
    trade.description,
    /sell:arrows \(sell the bundle of 20 arrows for 5 sp\)/,
  );
  const sold = accept(runtime, state, { type: "sell", itemId: "arrows" });
  assert.equal(
    renderFifthResult(sold),
    "You sell the bundle of 20 arrows to Bowyer for 5 sp. The trade takes 10 minutes. Purse: 5 sp. You have 2 arrows.",
  );
  const sell = runtime
    .projectActions(sold.state)
    .find(({ action, target }) => action === "sell" && target.id === "arrows");
  assert.deepEqual(sell, {
    action: "sell",
    target: { id: "arrows", name: "Arrows (20)" },
    available: false,
    reason: "Fewer than 20",
  });
  const richer = {
    ...sold.state,
    possessions: { ...sold.state.possessions, purse: 150 },
  };
  const bought = accept(runtime, richer, { type: "buy", itemId: "arrows" });
  assert.equal(
    renderFifthResult(bought),
    "You buy the bundle of 20 arrows from Bowyer for 1 gp. The trade takes 10 minutes. Purse: 5 sp. You have 22 arrows.",
  );
  assert.match(
    runtime.handleAction(state, { type: "take", itemId: QUIVER.id }).rejection
      .reason,
    /no such item/,
  );
});

test("taking found arrows over capacity is refused like other gear", () => {
  // Str 17 carries 255 lb: 243 lb stowed and 12 lb worn and held fill it.
  const laden = validateFighter({
    ...archer(0),
    stowed: [
      "plate",
      "plate",
      "plate",
      "chain-shirt",
      "chain-shirt",
      "mace",
      "shortsword",
      "shortbow",
    ],
  });
  assert.equal(fighterCarrying(laden).weight, 255);
  const runtime = createFifthRuntime(archeryBarrow, laden);
  const state = accept(runtime, runtime.createSession(), {
    type: "examine",
    targetId: "scratched-lintel",
  }).state;
  assert.deepEqual(
    runtime.handleAction(state, { type: "take", itemId: QUIVER.id }).rejection,
    {
      code: "too-heavy",
      reason:
        "The Quiver of Arrows weighs 1 lb, and you carry 255 lb of the 255 lb your Strength allows: drop something first.",
    },
  );
});

test("modules place and stock ranged weapons and ammunition within their tiers", () => {
  assert.equal(itemValue(QUIVER), 100);
  const stocking = (stock, levels) => {
    const module = structuredClone(archeryFile);
    room(module, "barrow-mouth").creatures[0].merchant.stock = stock;
    module.recommendedLevels = levels;
    return module;
  };
  assert.throws(
    () => validateModule(stocking(["longbow"], { min: 1, max: 3 })),
    /stocks the uncommon longbow, but uncommon gear is sold only in modules for level 3 and up/,
  );
  validateModule(stocking(["longbow", "arrows"], { min: 3, max: 3 }));
  const finding = (gear, levels) => {
    const module = stocking(["arrows"], levels);
    room(module, "barrow-mouth").items.find(({ id }) => id === QUIVER.id).gear =
      gear;
    return module;
  };
  assert.throws(
    () => validateModule(finding("longbow", { min: 1, max: 1 })),
    /is the uncommon longbow, but uncommon treasure is found only in modules for level 3 and up/,
  );
  validateModule(finding("longbow", { min: 1, max: 3 }));
  validateModule(finding("bolts", { min: 1, max: 1 }));
  // A module may not name one of its own things after ammunition.
  const clash = structuredClone(archeryFile);
  room(clash, "barrow-mouth").features.push({
    id: "bolts",
    name: "Bolts",
    description: "Old crossbow bolts, rusted into the turf.",
  });
  assert.throws(
    () => validateModule(clash),
    /id bolts names catalogue gear; choose another/,
  );
});

test("the gate's one-hit-kill measure tries a ranged weapon a module sells, Dexterity first, as its opening volley", () => {
  const [strongest] = percentileCharacters({ percentiles: [95] });
  const attackers = strongestAttackers(strongest.dice, 1, [
    "shortbow",
    "light-crossbow",
    "mace",
  ]);
  const bows = attackers.filter(({ gear }) => gear === "light-crossbow");
  const mace = attackers.find(({ gear }) => gear === "mace").sheet;
  assert.equal(bows.length, 4);
  for (const { sheet, fightingStyle } of bows) {
    // The archer swaps the mace build's Strength and Dexterity, +2 included.
    assert.equal(sheet.abilities.dexterity, mace.abilities.strength);
    assert.equal(
      sheet.abilities.strength,
      mace.abilities.dexterity - (mace.backgroundIncrease.dexterity ?? 0),
    );
    assert.deepEqual(sheet.backgroundIncrease, {
      dexterity: 2,
      constitution: 1,
    });
    const attack = playerCombatant(sheet).attack;
    assert.equal(attack.ammunition, "bolts");
    // Archery (#225) adds 2 to hit with the bow only.
    assert.equal(
      attack.bonus,
      playerCombatant(mace).attack.bonus +
        (fightingStyle === "archery" ? 2 : 0),
      "the bow hits as often as the mace build's main weapon",
    );
    // One attack from full HP is measured in round 1: no close combat.
    assert.equal(attack.disadvantage, undefined);
  }
  const goblinBlock = { armorClass: 15, hitPoints: { average: 10 } };
  assert.ok(oneHitKillChance(bows[0].sheet, goblinBlock) > 0);
});

/** A library holding one fresh Ada (the mace kit), at the archers' barrow. */
const record = async (library) => (await library.read()).characters[0];

/** Starts the archers' barrow and trades at its mouth; no dice. */
async function trade(library, characterId, actions) {
  const session = await startFifthAdventure(
    library,
    0,
    characterId,
    archeryBarrow,
    (await library.read()).revision,
  );
  for (const action of actions) {
    const { result } = session.act(action, "click");
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
  }
  return session;
}

test("arrows and bolts bought are kept on escape", async () => {
  await withLibrary(async (library, { id: characterId }) => {
    const kept = await trade(library, characterId, [
      { type: "sell", itemId: "leather", equipped: true },
      { type: "buy", itemId: "arrows" },
      { type: "buy", itemId: "bolts" },
      { type: "leave", roomId: "barrow-mouth" },
    ]);
    await kept.persist();
    await settleFifthSession(library, kept);
    const { sheet } = await record(library);
    assert.deepEqual(sheet.ammunition, { arrows: 20, bolts: 20 });
    assert.equal(sheet.purse, 300);
  });
});

test("a sheet holds a count of each kind of ammunition, and nothing else", () => {
  for (const ammunition of [
    { arrows: 1 },
    { arrows: 1, bolts: -1 },
    { arrows: 1.5, bolts: 0 },
    { arrows: 0, bolts: 0, darts: 1 },
    undefined,
  ]) {
    assert.throws(
      () => validateFighter({ ...archer(), ammunition }),
      /Invalid (ammunition|character sheet)/,
    );
  }
});
