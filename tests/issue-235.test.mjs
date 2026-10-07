// #235: the bestiary fills out with a kobold, a Hobgoblin Warrior, a Bugbear
// Warrior, a gnoll and an Ogre. Monsters with Multiattack make several
// attacks a turn, choosing each attack and target with a seeded die; goblins
// and kobolds have Nimble Escape, a Disengage that changes nothing without
// positions; a gnoll's Rampage makes a bonus attack when it drops a
// combatant. Every bestiary monster has XP and a level band.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFifthAdventure, unsimulatedTraits } from "../dist/adventure-5e.js";
import { fighterAtLevel, gateAdventure } from "../dist/balance-5e.js";
import { MONSTER_TRAITS, validateFifthBestiary } from "../dist/bestiary-5e.js";
import { act, startEncounter } from "../dist/encounter-5e.js";
import { rollAbilitySet } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { FifthSession } from "../dist/session-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";

/** Returns the queued values in order, checking each die's sides. */
function dice(...queue) {
  return {
    remaining: () => queue.length,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      return value;
    },
  };
}

const saves = {
  strength: 4,
  dexterity: 1,
  constitution: 4,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};

const fighter = {
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 16,
  hp: 30,
  maxHp: 30,
  dexterity: 12,
  initiativeBonus: 1,
  saves,
  attack: {
    name: "Mace",
    bonus: 5,
    damage: { dice: 1, sides: 6, modifier: 3, type: "bludgeoning" },
    criticalRange: 20,
  },
  actionSurge: { uses: 1, max: 1 },
};

/** A second party combatant, so an opponent has a choice of targets. */
const ally = (hp = 12) => ({
  ...fighter,
  id: "bo",
  name: "Bo",
  hp,
  maxHp: 12,
  dexterity: 10,
  initiativeBonus: 0,
});

const monsterSaves = {
  strength: 2,
  dexterity: 1,
  constitution: 0,
  intelligence: -2,
  wisdom: 0,
  charisma: -2,
};

const spear = {
  name: "Spear",
  bonus: 4,
  damage: { dice: 1, sides: 6, modifier: 2, type: "piercing" },
  criticalRange: 20,
};
const bite = {
  name: "Bite",
  bonus: 4,
  damage: { dice: 1, sides: 4, modifier: 2, type: "piercing" },
  criticalRange: 20,
};

/** A gnoll that makes two attacks, Spear or Bite, each chosen by a die. */
const gnoll = (extra = {}) => ({
  id: "gnoll",
  name: "Gnoll",
  side: "opponents",
  armorClass: 14,
  hp: 27,
  maxHp: 27,
  dexterity: 12,
  initiativeBonus: 1,
  saves: monsterSaves,
  attack: spear,
  multiattack: { attacks: 2, weapons: [spear, bite] },
  ...extra,
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
  saves: monsterSaves,
  attack: {
    name: "Scimitar",
    bonus: 4,
    damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
    criticalRange: 20,
  },
  nimbleEscape: true,
};

const attacks = (events) => events.filter(({ type }) => type === "attack");

test("Multiattack makes each attack with a seeded choice of target and attack", () => {
  const random = dice(
    // Initiative: Ada 5 + 1, Bo 3 + 0, the gnoll 20 + 1.
    [20, 5],
    [20, 3],
    [20, 20],
    // First attack: target die 1 (Ada), attack die 2 (Bite), hits for 3 + 2.
    [2, 1],
    [2, 2],
    [20, 15],
    [4, 3],
    // Second attack: target die 2 (Bo), attack die 1 (Spear), misses.
    [2, 2],
    [2, 1],
    [20, 2],
  );
  const { state, events } = startEncounter([fighter, ally(), gnoll()], random);
  assert.equal(random.remaining(), 0);
  assert.deepEqual(
    attacks(events).map(
      ({ targetId, weapon, targetRoll, weaponRoll, hit }) => ({
        targetId,
        weapon,
        targetRoll,
        weaponRoll,
        hit,
      }),
    ),
    [
      {
        targetId: "pc",
        weapon: "Bite",
        targetRoll: 1,
        weaponRoll: 2,
        hit: true,
      },
      {
        targetId: "bo",
        weapon: "Spear",
        targetRoll: 2,
        weaponRoll: 1,
        hit: false,
      },
    ],
  );
  assert.equal(state.combatants[0].hp, 25);
  assert.equal(state.order[state.turn].combatantId, "pc");
});

test("Multiattack chooses its next target among those still standing", () => {
  const random = dice(
    [20, 5],
    [20, 3],
    [20, 20],
    // First attack drops Bo (4 HP): target die 2, Spear, 6 damage.
    [2, 2],
    [2, 1],
    [20, 15],
    [6, 4],
    // Only Ada stands: no target die, just the attack die and the attack.
    [2, 1],
    [20, 15],
    [6, 1],
  );
  const { state, events } = startEncounter([fighter, ally(4), gnoll()], random);
  assert.equal(random.remaining(), 0);
  const [first, second] = attacks(events);
  assert.equal(first.targetId, "bo");
  assert.equal(first.hpAfter, 0);
  assert.ok(
    events.some(
      ({ type, combatantId }) => type === "defeated" && combatantId === "bo",
    ),
  );
  assert.equal(second.targetId, "pc");
  assert.equal(second.targetRoll, undefined);
  assert.equal(second.weaponRoll, 1);
  assert.equal(state.combatants[0].hp, 27);
});

test("Multiattack stops when its first attack ends the fight", () => {
  const random = dice(
    [20, 5],
    [20, 20],
    // Ada has 4 HP: the Spear's 6 damage ends the fight, so no second attack.
    [2, 1],
    [20, 15],
    [6, 4],
  );
  const { state, events } = startEncounter(
    [{ ...fighter, hp: 4 }, gnoll()],
    random,
  );
  assert.equal(random.remaining(), 0);
  assert.equal(attacks(events).length, 1);
  assert.equal(state.outcome, "defeat");
});

test("Rampage makes a bonus attack when the gnoll drops a combatant", () => {
  const random = dice(
    [20, 5],
    [20, 3],
    [20, 20],
    // First attack drops Bo.
    [2, 2],
    [2, 1],
    [20, 15],
    [6, 4],
    // Rampage: a bonus attack on Ada, its attack chosen by a die (Bite).
    [2, 2],
    [20, 15],
    [4, 2],
    // The second attack of its Multiattack.
    [2, 1],
    [20, 3],
  );
  const { state, events } = startEncounter(
    [fighter, ally(4), gnoll({ rampage: true })],
    random,
  );
  assert.equal(random.remaining(), 0);
  const made = attacks(events);
  assert.deepEqual(
    made.map(({ targetId, weapon, rampage }) => ({
      targetId,
      weapon,
      rampage,
    })),
    [
      { targetId: "bo", weapon: "Spear", rampage: undefined },
      { targetId: "pc", weapon: "Bite", rampage: true },
      { targetId: "pc", weapon: "Spear", rampage: undefined },
    ],
  );
  assert.equal(state.combatants[0].hp, 26);
});

test("there is no Rampage without a fall", () => {
  const random = dice(
    [20, 5],
    [20, 3],
    [20, 20],
    // Both attacks miss: nothing falls, so there is no Rampage.
    [2, 1],
    [2, 1],
    [20, 2],
    [2, 2],
    [2, 2],
    [20, 2],
  );
  const { events } = startEncounter(
    [fighter, ally(), gnoll({ rampage: true })],
    random,
  );
  assert.equal(random.remaining(), 0);
  assert.equal(attacks(events).length, 2);
});

test("Nimble Escape is a Disengage: with no opportunity attacks it changes nothing in a fight", () => {
  const plain = { ...goblin };
  delete plain.nimbleEscape;
  // The goblin goes first and misses; Ada's attack is rolled normally.
  const play = (opponent) => {
    const started = startEncounter(
      [fighter, opponent],
      dice([20, 5], [20, 20], [20, 2]),
    );
    const attacked = act(
      started.state,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      dice([20, 12], [6, 4], [20, 2]),
    );
    return { started, attacked };
  };
  const nimble = play(goblin);
  const without = play(plain);
  assert.deepEqual(nimble.started.events, without.started.events);
  assert.deepEqual(nimble.attacked.events, without.attacked.events);
  assert.equal(attacks(nimble.attacked.events)[0].mode, undefined);
  assert.equal(nimble.attacked.state.combatants[1].hp, 3);
});

test("Rampage takes the bonus action only once a turn", () => {
  const random = dice(
    [20, 5],
    [20, 3],
    [20, 2],
    [20, 20],
    // Three party combatants; the first attack drops Bo.
    [3, 2],
    [2, 1],
    [20, 15],
    [6, 4],
    // Rampage drops Cy; no second Rampage follows.
    [2, 2],
    [2, 1],
    [20, 15],
    [6, 4],
    // The second attack of its Multiattack, on Ada.
    [2, 1],
    [20, 2],
  );
  const cy = { ...ally(4), id: "cy", name: "Cy", initiativeBonus: 0 };
  const { events } = startEncounter(
    [fighter, ally(4), cy, gnoll({ rampage: true })],
    random,
  );
  assert.equal(random.remaining(), 0);
  assert.deepEqual(
    attacks(events).map(({ targetId, rampage }) => ({ targetId, rampage })),
    [
      { targetId: "bo", rampage: undefined },
      { targetId: "cy", rampage: true },
      { targetId: "pc", rampage: undefined },
    ],
  );
});

const lairs = await loadFifthAdventure("tests/fixtures/bestiary-lairs.json");

/** Each new monster's id, and the fixture's lair it fights in. */
const NEW_MONSTERS = {
  kobold: "kobold-warren",
  "hobgoblin-warrior": "hobgoblin-post",
  "bugbear-warrior": "bugbear-den",
  gnoll: "gnoll-pit",
  ogre: "ogre-cave",
};

const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);

test("the new monsters carry their stat blocks, traits and Multiattack", () => {
  const block = (id) => monster(id).statBlock;
  assert.deepEqual(block("kobold").traits, ["Nimble Escape", "Pack Tactics"]);
  assert.deepEqual(block("hobgoblin-warrior").traits, ["Pack Tactics"]);
  assert.deepEqual(block("hobgoblin-warrior").attacks[0].damage, {
    dice: 2,
    sides: 10,
    modifier: 1,
    type: "slashing",
  });
  assert.equal(block("bugbear-warrior").traits, undefined);
  assert.equal(block("gnoll").multiattack, 2);
  assert.deepEqual(block("gnoll").traits, ["Rampage"]);
  assert.deepEqual(
    block("gnoll").attacks.map(({ name }) => name),
    ["Spear", "Bite"],
  );
  assert.equal(block("ogre").hitPoints.average, 68);
  for (const id of ["goblin-minion", "goblin-warrior", "goblin-boss"]) {
    assert.deepEqual(block(id).traits, ["Nimble Escape"], id);
  }
  // The owner kept the Goblin Boss to one attack for now (#235).
  assert.equal(block("goblin-boss").multiattack, undefined);
});

test("every bestiary monster has an XP value and a level band", () => {
  assert.equal(bestiary.monsters.length, 15);
  for (const { id, levelBand, statBlock } of bestiary.monsters) {
    assert.ok(Number.isInteger(statBlock.xp) && statBlock.xp > 0, id);
    assert.ok(levelBand.min >= 1 && levelBand.min <= levelBand.max, id);
  }
  assert.deepEqual(monster("ogre").levelBand, { min: 4, max: 5 });
});

test("the bestiary validator checks Multiattack and level bands", () => {
  const withMonster = (change) => {
    const copy = structuredClone(bestiary);
    change(copy.monsters[0]);
    return () => validateFifthBestiary(copy);
  };
  assert.throws(
    withMonster((entry) => {
      entry.statBlock.multiattack = 1;
    }),
    /monster 1 statBlock multiattack must be an integer from 2 to 4\./,
  );
  assert.throws(
    withMonster((entry) => {
      entry.levelBand = { min: 3, max: 2 };
    }),
    /monster 1 levelBand max must be an integer from 3 to 20\./,
  );
  assert.throws(
    withMonster((entry) => {
      delete entry.levelBand;
    }),
    /monster 1 must have exactly id, description, levelBand, statBlock\./,
  );
});

/** A level-3 Fighter, the strongest a player can have yet. */
const sheet = fighterAtLevel(rollAbilitySet(createSeededRandom(7)), 3);

/** Begins, goes into `room` and attacks the first target until it ends. */
function playLair(session, room) {
  const played = [
    session.act({ type: "begin" }, "click"),
    session.act({ type: "move", destinationId: room }, "click"),
  ];
  while (session.state.status === "playing") {
    const [target] = session.runtime.attackTargets(session.state);
    played.push(
      session.act(
        target === undefined
          ? { type: "end-turn", actorId: "pc" }
          : { type: "attack", actorId: "pc", targetId: target.id },
        "click",
      ),
    );
    assert.ok(played.length < 200, "the fight ends");
  }
  return played;
}

const directory = await mkdtemp(join(tmpdir(), "issue-235-"));
test.after(() => rm(directory, { recursive: true, force: true }));
let sessions = 0;

/** A new saved session in the lairs on seed 235. */
const start = () =>
  FifthSession.create(
    join(directory, `session-${++sessions}.json`),
    "5".repeat(32),
    235,
    lairs,
    sheet,
  );

test("a fixture adventure with each new monster plays to its ending through the runtime, and replays exactly", async () => {
  for (const [id, room] of Object.entries(NEW_MONSTERS)) {
    const session = await start();
    const played = playLair(session, room);
    assert.ok(
      ["victory", "defeat"].includes(session.state.status),
      `${room} ends`,
    );
    const opponents = new Set(
      played.flatMap(({ result }) =>
        result.events.flatMap(({ type, actorId }) =>
          type === "attack" && actorId !== "pc" ? [actorId] : [],
        ),
      ),
    );
    assert.ok(opponents.size > 0, `${id} attacks`);
    const cards = played.map(({ result, rolls }) =>
      session.card(result, rolls),
    );
    const name = monster(id).statBlock.name;
    assert.ok(
      cards.some(({ text }) => text.includes(name)),
      `${name} is named on the cards`,
    );

    // The saved session replays to the same state, and the same seed and
    // actions draw the same dice and give the same events.
    await session.persist();
    const resumed = await FifthSession.load(session.path, [lairs]);
    assert.deepEqual(resumed.state, session.state);
    const again = playLair(await start(), room);
    assert.deepEqual(
      again.map(({ result, rolls }) => [result.events, rolls]),
      played.map(({ result, rolls }) => [result.events, rolls]),
    );
  }
});

test("the gnoll's Multiattack shows each attack's die on the card", async () => {
  const session = await start();
  const played = playLair(session, "gnoll-pit");
  const turns = played.flatMap(({ result }) => {
    const gnoll = result.events.filter(
      ({ type, actorId }) => type === "attack" && actorId === "gnoll",
    );
    return gnoll.length === 0 ? [] : [gnoll];
  });
  assert.ok(turns.length > 0);
  for (const attacks of turns.slice(0, -1)) {
    assert.equal(attacks.length, 2, "two attacks a turn");
  }
  for (const attack of turns.flat()) {
    assert.equal(attack.weapon, ["Spear", "Bite"][attack.weaponRoll - 1]);
  }
  const { result, rolls } = played.find(({ result }) =>
    result.events.some(({ actorId }) => actorId === "gnoll"),
  );
  const card = session.card(result, rolls);
  assert.match(
    card.text,
    /Gnoll Ravager attacks Balance with (Spear|Bite) \(attack chosen by a die: [12]\)/,
  );
  const die = card.lines
    .flatMap(({ rolls: groups }) => groups)
    .find(({ purpose }) => purpose === "weapon");
  assert.equal(die.roller, "Gnoll Ravager");
  assert.equal(die.dice[0].sides, 2);
});

/** The fixture cut down to its gnoll pit, for level 3. */
function gnollPit() {
  const pit = structuredClone(lairs);
  pit.startRoomId = "gnoll-pit";
  pit.rooms = pit.rooms.filter(({ id }) => id === "gnoll-pit");
  pit.passages = [];
  pit.encounters = pit.encounters.filter(({ id }) => id === "gnoll-pit-fight");
  pit.recommendedLevels = { min: 3, max: 3 };
  return pit;
}

test("the balance harness plays Multiattack and every trait, and refuses an unsimulated trait by name", () => {
  assert.deepEqual(unsimulatedTraits({ traits: MONSTER_TRAITS }), []);
  const survival = (adventure) => {
    const result = gateAdventure(adventure, {
      seeds: Array.from({ length: 40 }, (_, seed) => seed),
    });
    assert.ok(result.ok, result.failure?.message);
    return result.verdict.survival.rate;
  };
  // One attack a turn is safer than the gnoll's two.
  const single = gnollPit();
  delete single.encounters[0].opponents[0].statBlock.multiattack;
  assert.ok(survival(gnollPit()) < survival(single));

  const unknown = gnollPit();
  unknown.encounters[0].opponents[0].statBlock.traits = [
    "Sunlight Sensitivity",
  ];
  const refused = gateAdventure(unknown);
  assert.equal(refused.ok, false);
  assert.equal(refused.failure.code, "unsimulated-trait");
  assert.equal(
    refused.failure.message,
    "bestiary-lairs: Gnoll Ravager's Sunlight Sensitivity is not simulated by the encounter engine.",
  );
});
