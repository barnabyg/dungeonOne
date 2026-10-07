// #136: The Abandoned Delve, the first real 5e adventure module. It holds
// what the ticket asks for, passes the balance gate at its declared
// difficulty, and scripted-DM journeys reach each of its endings.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { passesGate, requiredPath } from "../dist/balance-5e.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { buildFighter } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";

const delve = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "abandoned-delve",
);

const CHOICES = {
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
};

// Str 17 (+3), Dex 14 (+2), Con 15 (+2): a sturdy level-1 Fighter.
const STRONG = buildFighter(
  "a".repeat(32),
  "Ada",
  [
    [5, 5, 5, 1],
    [5, 5, 4, 1],
    [5, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 4, 1],
    [3, 3, 3, 1],
  ],
  CHOICES,
);

// Every score 10: a feeble level-1 Fighter.
const WEAK = buildFighter(
  "b".repeat(32),
  "Bo",
  Array.from({ length: 6 }, () => [3, 3, 4, 1]),
  { ...CHOICES, increase: { strength: 1, constitution: 1, dexterity: 1 } },
);

const room = (id) => delve.rooms.find((entry) => entry.id === id);
const encounter = (id) => delve.encounters.find((entry) => entry.id === id);
const passage = (from, to) =>
  delve.passages.find(
    ({ between }) => between.includes(from) && between.includes(to),
  );
/** The loot in a room: treasure and coin. */
const treasureIn = (roomId) =>
  room(roomId).items.filter(
    ({ kind }) => kind === "treasure" || kind === "coin",
  );

// #233: Undead Fortitude made its Zombie too deadly at level 1.
test("the delve is a 10-room crawl for level 2, declared hard", () => {
  assert.equal(delve.title, "The Abandoned Delve");
  assert.deepEqual(delve.recommendedLevels, { min: 2, max: 2 });
  assert.equal(delve.difficulty, "hard");
  assert.equal(delve.rooms.length, 10);
  assert.deepEqual(
    delve.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["broken-gate", "shaft-bottom"],
  );
});

test("it holds a group fight, an avoidable fight, a trap, a stuck and a locked door, and a talkable creature", () => {
  assert.equal(encounter("barracks-skeletons").opponents.length, 2);
  const required = requiredPath(delve).roomIds;
  assert.deepEqual(required, ["broken-gate", "gate-hall", "guard-post"]);
  // Every fight but the guard post's lies off the required path.
  const fought = delve.rooms.filter(({ encounterId }) => encounterId);
  assert.deepEqual(
    fought
      .filter(({ id }) => !required.includes(id))
      .map(({ encounterId }) => encounterId),
    ["barracks-skeletons", "crypt-spider", "vault-ghoul"],
  );
  assert.equal(passage("dry-well", "shrine").trap.id, "loose-step");
  assert.equal(passage("gate-hall", "storeroom").door.state, "stuck");
  const vault = passage("shaft-bottom", "vault").door;
  assert.equal(vault.state, "locked");
  assert.equal(vault.keyItemId, "bronze-key");
  const goblin = room("dry-well").creatures[0];
  assert.ok(goblin.topics.some(({ check }) => check !== undefined));
  assert.ok(goblin.topics.some(({ check }) => check === undefined));
  // Only the vault's boss is exempt from the too-easy measure.
  assert.deepEqual(
    delve.encounters.flatMap(({ opponents }) =>
      opponents.filter(({ boss }) => boss).map(({ id }) => id),
    ),
    ["ghoul"],
  );
});

test("every treasure and coin is found by examining, and the richest lies past the late choice", () => {
  const treasures = delve.rooms.flatMap(({ id }) => treasureIn(id));
  assert.equal(treasures.length, 6);
  // The guard's purse and the vault's chest are coin (#208).
  assert.deepEqual(
    treasures.filter(({ kind }) => kind === "coin").map(({ coins }) => coins),
    [{ sp: 18 }, { gp: 40 }],
  );
  assert.ok(treasures.every(({ hiddenIn }) => hiddenIn !== undefined));
  // The shaft bottom is an exit beside the vault: leave, or push on.
  assert.equal(room("shaft-bottom").exit, true);
  assert.equal(treasureIn("vault").length, 2);
  for (const safer of ["guard-post", "barracks", "shrine", "web-crypt"]) {
    assert.equal(treasureIn(safer).length, 1, safer);
  }
});

test("it passes the balance gate at its declared difficulty", () => {
  assert.equal(passesGate(delve), true);
});

function scripted(responses) {
  return {
    async respond() {
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}

const call = (name, args = {}) => ({
  toolCalls: [{ id: "call-1", name, argumentsJson: JSON.stringify(args) }],
});

/**
 * Plays `steps` as scripted-DM turns, each one tool call the engine must
 * accept, and fights each fight to its end by attacking the first opponent
 * offered. Leaving is the browser's action, never the DM's, so it goes to
 * the engine directly. Stops early once the adventure ends.
 */
async function journey(sheet, seed, steps) {
  const runtime = createFifthRuntime(delve, sheet);
  const random = createSeededRandom(seed);
  const dm = async (state, name, args) => {
    const result = await runDmTurn({
      state,
      playerInput: `${name} ${JSON.stringify(args)}`,
      transcript: [],
      random,
      model: scripted([call(name, args)]),
      runtime,
    });
    const refused = result.toolResults.find(
      ({ engineResult }) => engineResult?.rejection !== undefined,
    );
    assert.equal(refused, undefined, `${name} ${JSON.stringify(args)}`);
    return result.state;
  };
  const fight = async (start) => {
    let state = start;
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const attack = runtime
        .getGameToolDefinitions(state)
        .find(({ name }) => name === "attack");
      state =
        attack === undefined
          ? await dm(state, "end_turn")
          : await dm(state, "attack", {
              target: attack.parameters.properties.target.enum[0],
            });
    }
    return state;
  };
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  for (const [name, args] of steps) {
    if (state.status !== "playing") {
      break;
    }
    state =
      name === "leave"
        ? runtime.handleAction(state, { type: "leave", roomId: args }).state
        : await fight(await dm(state, name, args));
  }
  return { state, runtime };
}

const PUSH_DEEPER = [
  ["examine", { target: "chalk-marks" }],
  ["move", { destination: "gate-hall" }],
  ["move", { destination: "guard-post" }],
  ["examine", { target: "zombie" }],
  ["take", { item: "guard-purse" }],
  ["examine", { target: "weapon-rack" }],
  ["take", { item: "rack-potion" }],
  ["move", { destination: "dry-well" }],
  ["talk", { topic: "the-vault" }],
  ["search", { room: "dry-well" }],
  ["move", { destination: "shrine" }],
  ["examine", { target: "altar" }],
  ["take", { item: "bronze-key" }],
  ["take", { item: "candlesticks" }],
  ["move", { destination: "shaft-bottom" }],
  ["unlock", { door: "vault-door" }],
  ["move", { destination: "vault" }],
  ["examine", { target: "ghoul" }],
  ["take", { item: "jewelled-goblet" }],
  ["examine", { target: "iron-chest" }],
  ["take", { item: "coin-chest" }],
  ["move", { destination: "shaft-bottom" }],
  ["leave", "shaft-bottom"],
];

/** The first seed from 0 on whose journey ends with `endingId`. */
async function seedFor(sheet, steps, endingId) {
  for (let seed = 0; seed < 200; seed++) {
    const { state } = await journey(sheet, seed, steps);
    if (state.endingId === endingId) {
      return seed;
    }
  }
  throw new Error(`no seed reaches ${endingId}`);
}

test("scripted DM: pushing on to the vault and climbing the shaft escapes with all the loot", async () => {
  const seed = await seedFor(STRONG, PUSH_DEEPER, "out-with-the-loot");
  const { state, runtime } = await journey(STRONG, seed, PUSH_DEEPER);
  assert.equal(state.status, "escaped");
  assert.deepEqual(
    state.inventory.filter(
      (id) =>
        delve.rooms.flatMap(({ items }) => items).find((item) => item.id === id)
          .kind === "treasure",
    ),
    ["candlesticks", "jewelled-goblet"],
  );
  // The guard's purse and the chest's gold went into the purse.
  assert.equal(state.possessions.purse, 180 + 4000);
  assert.deepEqual(state.clearedEncounterIds, ["guard-zombie", "vault-ghoul"]);
  // The fights' XP and the ending's.
  assert.equal(
    runtime.projectSettlement(state).xp.reduce((sum, { xp }) => sum + xp, 0),
    50 + 200 + 200,
  );
});

test("scripted DM: turning back at the gate before any fight escapes empty-handed", async () => {
  const { state } = await journey(STRONG, 0, [
    ["examine", { target: "chalk-marks" }],
    ["move", { destination: "gate-hall" }],
    ["move", { destination: "broken-gate" }],
    ["leave", "broken-gate"],
  ]);
  assert.equal(state.status, "escaped");
  assert.equal(state.endingId, "out-empty-handed");
});

test("scripted DM: a feeble Fighter who walks into the barracks and the crypt falls", async () => {
  const steps = [
    ["move", { destination: "gate-hall" }],
    ["move", { destination: "barracks" }],
    ["move", { destination: "gate-hall" }],
    ["move", { destination: "guard-post" }],
    ["move", { destination: "dry-well" }],
    ["move", { destination: "web-crypt" }],
  ];
  const seed = await seedFor(WEAK, steps, "lost-in-the-delve");
  const { state } = await journey(WEAK, seed, steps);
  assert.equal(state.status, "defeat");
  assert.equal(state.character.hp, 0);
});
