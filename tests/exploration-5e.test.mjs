import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { buildFighter } from "../dist/fighter-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";

const adventures = await loadBuiltInFifthAdventures();
const adventure = adventures.find(({ id }) => id === "smugglers-cellar");
// Str 16 (+3), Dex 12 (+1), Con 14 (+2): AC 17 with Defense, 12 HP, mace +5.
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
const runtime = createFifthRuntime(adventure, sheet);

/** Returns the queued [sides, value] pairs in order, checking each die. */
function dice(...queue) {
  const drawn = [];
  return {
    drawn,
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      drawn.push({ sides, value });
      return value;
    },
  };
}

/** Resolves an action that must be accepted, drawing exactly `random`. */
function accepted(state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** Asserts a refusal that changes nothing and draws nothing. */
function refused(state, action, reason) {
  const random = dice();
  const result = runtime.handleAction(state, action, random);
  assert.match(result.rejection?.reason ?? "", reason);
  assert.equal(result.state, state);
  assert.equal(random.drawn.length, 0);
}

const tools = (state) =>
  Object.fromEntries(
    runtime.getGameToolDefinitions(state).map((tool) => {
      const [parameter] = Object.values(tool.parameters.properties);
      return [tool.name, parameter?.enum ?? []];
    }),
  );

function begun() {
  return accepted(runtime.createSession(), { type: "begin" }).state;
}

/** At the stair foot, carrying the potion from the alcove chest. */
function withPotion() {
  let state = accepted(begun(), {
    type: "move",
    destinationId: "alcove",
  }).state;
  state = accepted(state, { type: "examine", targetId: "iron-chest" }).state;
  state = accepted(state, { type: "take", itemId: "healing-potion" }).state;
  return accepted(state, { type: "move", destinationId: "stair-foot" }).state;
}

/**
 * Enters the rat cellar: the rat wins initiative (18 + 3 against Ada's
 * 2 + 1) and bites for 4 + 3, leaving Ada at 5/12 on her turn.
 */
function bitten(state) {
  return accepted(
    state,
    { type: "move", destinationId: "rat-cellar" },
    dice([20, 2], [20, 18], [20, 15], [4, 4]),
  );
}

/** Ada crits the rat (6 + 6 + 3) and wins. */
const killRat = () => dice([20, 20], [6, 6], [6, 6]);
const ATTACK_RAT = { type: "attack", actorId: "pc", targetId: "giant-rat" };

test("a quiet start room begins without dice and offers only what is visible", () => {
  const result = accepted(runtime.createSession(), { type: "begin" });
  assert.deepEqual(result.events, []);
  assert.equal(result.state.encounter, undefined);
  assert.deepEqual(tools(result.state), {
    look: [],
    get_character_status: [],
    move: ["alcove", "rat-cellar"],
    examine: ["rusted-lantern"],
  });
  const room = runtime.projectRoom(result.state);
  assert.deepEqual(
    room.exits.map(({ id, name }) => [id, name]),
    [
      ["alcove", "Alcove"],
      ["rat-cellar", "Rat-Gnawed Cellar"],
    ],
  );
  assert.deepEqual(room.character, { hp: 12, maxHp: 12 });
  assert.deepEqual(room.options.take, []);
});

test("moving follows passages only; the move is the engine's card", () => {
  const start = begun();
  refused(
    start,
    { type: "move", destinationId: "den" },
    /no way from here to there/,
  );
  refused(start, { type: "move", destinationId: "stair-foot" }, /no way/);
  const moved = accepted(start, { type: "move", destinationId: "alcove" });
  assert.equal(moved.state.roomId, "alcove");
  assert.equal(
    runtime.renderResult(moved),
    "You enter the Alcove. A cramped alcove cut into the rock, out of the draught. Someone slept here once.",
  );
});

test("examining makes a discovery and reveals the hidden potion, which can then be taken", () => {
  let state = accepted(begun(), {
    type: "move",
    destinationId: "alcove",
  }).state;
  // The potion is hidden until the chest is examined.
  assert.deepEqual(tools(state).take, undefined);
  assert.deepEqual(tools(state).examine, ["iron-chest"]);
  refused(
    state,
    { type: "take", itemId: "healing-potion" },
    /no such item here/,
  );
  refused(
    state,
    { type: "examine", targetId: "healing-potion" },
    /nothing like that here/,
  );

  const examined = accepted(state, { type: "examine", targetId: "iron-chest" });
  assert.equal(
    runtime.renderResult(examined),
    "Iron-Bound Chest: A squat iron-bound chest sits in the corner, its lock long since broken. Under a mouldy blanket in the chest lies a stoppered vial of red liquid. You find the Potion of Healing.",
  );
  state = examined.state;
  assert.deepEqual(state.examinedFeatureIds, ["iron-chest"]);
  assert.match(
    runtime.projectRoom(state).features[0].discovery,
    /stoppered vial/,
  );
  assert.deepEqual(tools(state).take, ["healing-potion"]);

  // Examining again repeats the discovery but finds nothing new.
  const again = accepted(state, { type: "examine", targetId: "iron-chest" });
  assert.deepEqual(again.events[0].found, []);
  assert.deepEqual(again.state, state);

  const taken = accepted(state, { type: "take", itemId: "healing-potion" });
  assert.equal(runtime.renderResult(taken), "You take the Potion of Healing.");
  state = taken.state;
  assert.deepEqual(state.inventory, ["healing-potion"]);
  assert.deepEqual(runtime.projectRoom(state).items, []);
  assert.deepEqual(
    runtime.projectCharacterStatus(state).collectedItems.map(({ id }) => id),
    ["healing-potion"],
  );
  refused(state, { type: "take", itemId: "healing-potion" }, /already have/);
  // A carried item can be examined, but not drunk at full health.
  assert.deepEqual(tools(state).examine, ["iron-chest", "healing-potion"]);
  assert.equal(tools(state).use_item, undefined);
  refused(state, { type: "use-item", itemId: "healing-potion" }, /unhurt/);
});

test("entering a room with a fight begins it, and nothing but fighting is offered until it is won", () => {
  const entered = bitten(withPotion());
  assert.match(
    runtime.renderResult(entered),
    /^You enter the Rat-Gnawed Cellar\. .* A rat the size of a dog rears up from the sacks, teeth bared\.\nInitiative: Giant Rat 18 \+ 3 = 21; Ada 2 \+ 1 = 3\.\nGiant Rat attacks Ada with Bite: 15 \+ 5 = 20 against AC 17\. Hit\. Damage 4 \+ 3 = 7 piercing; Ada has 5\/12 HP\.\nIt is your turn\.$/s,
  );
  const state = entered.state;
  assert.equal(state.character.hp, 5);
  assert.deepEqual(Object.keys(tools(state)), [
    "look",
    "get_character_status",
    "use_item",
    "attack",
    "second_wind",
    "end_turn",
  ]);
  refused(
    state,
    { type: "move", destinationId: "stair-foot" },
    /can't leave in the middle of a fight/,
  );
  refused(
    state,
    { type: "examine", targetId: "gnawed-sacks" },
    /Not while you are fighting/,
  );
  assert.deepEqual(runtime.projectRoom(state).options, {
    move: [],
    examine: [],
    take: [],
    use: ["healing-potion"],
  });
});

test("a fight without a victory ending is won and play goes on; the room stays clear", () => {
  const won = accepted(bitten(begun()).state, ATTACK_RAT, killRat());
  assert.equal(won.state.status, "playing");
  assert.deepEqual(won.state.clearedEncounterIds, ["cellar-rat"]);
  assert.equal(won.events.at(-1).type, "cleared");
  assert.match(
    runtime.renderResult(won),
    /Giant Rat is defeated\.\nThe fight is over\.$/,
  );
  assert.deepEqual(tools(won.state).move, ["stair-foot", "den"]);
  assert.deepEqual(tools(won.state).examine, ["gnawed-sacks"]);
  assert.equal(tools(won.state).attack, undefined);

  // Coming back starts no fight and draws no dice.
  const away = accepted(won.state, {
    type: "move",
    destinationId: "stair-foot",
  }).state;
  assert.equal(away.encounter, undefined);
  const back = accepted(away, { type: "move", destinationId: "rat-cellar" });
  assert.deepEqual(back.events[0].opponents, []);
  assert.equal(back.state.encounter, undefined);
  const scene = runtime.projectDmScene(back.state);
  assert.deepEqual(scene.room.opponents, [
    { id: "giant-rat", name: "Giant Rat", condition: "defeated" },
  ]);
  assert.equal(scene.combatStatus, "The fight here is over: victory.");
});

test("hit points and feature uses last from one fight to the next", () => {
  // Ada catches her breath (1d10 + 1: 3 + 1) and then kills the rat.
  let state = accepted(
    bitten(begun()).state,
    { type: "second-wind", actorId: "pc" },
    dice([10, 3]),
  ).state;
  state = accepted(state, ATTACK_RAT, killRat()).state;
  assert.deepEqual(state.character, {
    hp: 9,
    secondWindUses: 1,
    actionSurgeUses: 0,
  });
  // The goblin's fight starts with Ada as she is: 9 HP, one Second Wind.
  state = accepted(
    state,
    { type: "move", destinationId: "den" },
    dice([20, 15], [20, 3]),
  ).state;
  const ada = state.encounter.combatants.find(({ id }) => id === "pc");
  assert.equal(ada.hp, 9);
  assert.equal(ada.secondWind.uses, 1);
  assert.deepEqual(runtime.projectFight(state).features.secondWind, {
    uses: 1,
    max: 2,
  });
});

test("a potion drunk after a fight heals 2d4 + 2, never above the maximum, and is used up", () => {
  let state = accepted(bitten(withPotion()).state, ATTACK_RAT, killRat()).state;
  assert.equal(state.character.hp, 5);
  assert.deepEqual(tools(state).use_item, ["healing-potion"]);
  const drunk = accepted(
    state,
    { type: "use-item", itemId: "healing-potion" },
    dice([4, 3], [4, 4]),
  );
  assert.equal(
    runtime.renderResult(drunk),
    "You drink the Potion of Healing: 3 + 4 + 2 = 9; you regain 7 HP and have 12/12 HP.",
  );
  state = drunk.state;
  assert.equal(state.character.hp, 12);
  assert.deepEqual(state.inventory, []);
  assert.deepEqual(state.usedItemIds, ["healing-potion"]);
  // The finished fight's table shows the character's HP as it is now.
  assert.equal(
    runtime
      .projectFight(state)
      .encounter.combatants.find(({ id }) => id === "pc").hp,
    12,
  );
  refused(state, { type: "use-item", itemId: "healing-potion" }, /don't have/);
  refused(
    state,
    { type: "examine", targetId: "healing-potion" },
    /nothing like that/,
  );
});

test("drinking a potion in a fight takes the bonus action", () => {
  const state = bitten(withPotion()).state;
  const drunk = accepted(
    state,
    { type: "use-item", itemId: "healing-potion" },
    dice([4, 1], [4, 2]),
  );
  assert.match(
    runtime.renderResult(drunk),
    /^You drink the Potion of Healing: 1 \+ 2 \+ 2 = 5; you regain 5 HP and have 10\/12 HP\.\nIt is still your turn: you can attack or end your turn\.$/,
  );
  assert.equal(drunk.state.character.hp, 10);
  assert.deepEqual(drunk.state.inventory, []);
  assert.equal(drunk.state.encounter.economy.bonusAction, false);
  // Second Wind needs the bonus action too, so neither is offered now.
  assert.deepEqual(Object.keys(tools(drunk.state)), [
    "look",
    "get_character_status",
    "attack",
    "end_turn",
  ]);
  refused(
    accepted(state, { type: "second-wind", actorId: "pc" }, dice([10, 1]))
      .state,
    { type: "use-item", itemId: "healing-potion" },
    /already used your bonus action/,
  );
});

function scripted(...responses) {
  const requests = [];
  return {
    requests,
    async respond(request) {
      requests.push(request);
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}

const call = (name, args, id = "call-1") => ({
  toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }],
});

async function turn(state, playerInput, ...responses) {
  const model = scripted(...responses);
  const random = dice();
  const result = await runDmTurn({
    state,
    playerInput,
    transcript: [],
    random,
    model,
    runtime,
  });
  return { result, model, random };
}

const inAlcove = () =>
  accepted(begun(), { type: "move", destinationId: "alcove" }).state;

test("scripted DM: typed synonyms map to examine, and the engine writes the reply", async () => {
  for (const words of [
    "search the chest",
    "look inside the chest",
    "inspect the iron-bound chest",
  ]) {
    const { result, model } = await turn(
      inAlcove(),
      words,
      call("examine", { target: "iron-chest" }),
    );
    assert.deepEqual(result.state.examinedFeatureIds, ["iron-chest"]);
    assert.match(
      result.narration,
      /^Iron-Bound Chest: .* You find the Potion of Healing\.$/,
    );
    assert.equal(model.requests.length, 1, "the AI does not narrate it");
    const examine = model.requests[0].tools.find(
      ({ name }) => name === "examine",
    );
    assert.deepEqual(examine.parameters.properties.target.enum, ["iron-chest"]);
  }
  const read = await turn(
    begun(),
    "read what's scratched on the lantern",
    call("examine", { target: "rusted-lantern" }),
  );
  assert.match(read.result.narration, /Rats in the cellar\. Boss in the den\./);
});

test("scripted DM: the DM cannot invent discoveries or items", async () => {
  const state = inAlcove();
  // An item that does not exist, and the potion before the chest is searched.
  for (const item of ["gold-crown", "healing-potion"]) {
    const { result, random } = await turn(
      state,
      `take the ${item}`,
      call("take", { item }),
    );
    assert.equal(result.state, state);
    assert.equal(result.narration, "There is no such item here to take.");
    assert.equal(random.drawn.length, 0);
  }
  // A discovery argument is refused before the engine is reached.
  const invented = await turn(
    state,
    "search the chest",
    call("examine", { target: "iron-chest", discovery: "a magic sword" }),
    { text: "You find nothing you can be sure of." },
  );
  assert.equal(invented.result.state, state);
  assert.equal(
    invented.model.requests[1].toolResults[0].output.error.code,
    "invalid-arguments",
  );
  // Narration alone changes nothing.
  const told = await turn(state, "search the chest", {
    text: "You find a magic sword and a bag of gold!",
  });
  assert.equal(told.result.state, state);
  assert.deepEqual(told.result.state.inventory, []);
  // A feature from another room is not here to examine.
  const elsewhere = await turn(
    state,
    "read the ledger",
    call("examine", { target: "ledger" }),
  );
  assert.equal(elsewhere.result.state, state);
  assert.equal(
    elsewhere.result.narration,
    "There is nothing like that here to examine.",
  );
});

test("scripted DM: a typed drink uses the potion through the engine", async () => {
  const state = accepted(
    bitten(withPotion()).state,
    ATTACK_RAT,
    killRat(),
  ).state;
  const model = scripted(call("use_item", { item: "healing-potion" }));
  const random = dice([4, 2], [4, 2]);
  const result = await runDmTurn({
    state,
    playerInput: "I drink my healing potion",
    transcript: [],
    random,
    model,
    runtime,
  });
  assert.equal(result.state.character.hp, 11);
  assert.match(
    result.narration,
    /^You drink the Potion of Healing: 2 \+ 2 \+ 2 = 6/,
  );
});

test("a session with exploration saves and reloads exactly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "exploration-5e-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "b".repeat(32),
      11,
      adventure,
      sheet,
    );
    assert.equal(
      session.history[0].reply.startsWith("Foot of the Stair."),
      true,
    );
    assert.deepEqual(session.history[0].cards, []);
    for (const action of [
      { type: "examine", targetId: "rusted-lantern" },
      { type: "move", destinationId: "alcove" },
      { type: "examine", targetId: "iron-chest" },
      { type: "take", itemId: "healing-potion" },
      { type: "move", destinationId: "stair-foot" },
      { type: "move", destinationId: "rat-cellar" },
    ]) {
      assert.equal(session.act(action, "click").result.rejection, undefined);
    }
    await session.persist();
    const loaded = await FifthSession.load(path, adventures);
    assert.deepEqual(loaded.state, session.state);
    assert.equal(loaded.randomPosition, session.randomPosition);
    assert.ok(loaded.randomPosition >= 2, "entering the cellar rolled dice");
    assert.deepEqual(loaded.state.inventory, ["healing-potion"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
