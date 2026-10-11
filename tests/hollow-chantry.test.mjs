// #350: The Hollow Chantry, the increment 16 release module, as the owner
// approved it: level 3, Medium; undead for Turn Undead; a rest site and a
// wandering encounter; two spell scrolls and a +1 Mace; and two ways down to
// the undercroft, the sexton's grille (key, pick or break) and the priests'
// warded stair (Arcana or Religion). Journeys reach its endings by both
// ways; shipped-modules.test.mjs checks it qualifies at its declared
// difficulty, with the gate figures its proposal quotes.
import assert from "node:assert/strict";
import test from "node:test";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { requiredPath } from "../dist/balance-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { testRogueAt } from "../dist/test-rogue-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { miraAt3, velaAt3 } from "./fixtures/level-3-casters.mjs";
import { firstJourney, journey, xpOf } from "./fixtures/module-journey.mjs";

const chantry = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "hollow-chantry",
);
const room = (id) => chantry.rooms.find((entry) => entry.id === id);
/** The band a check made in the session `state` came to, by its id. */
const bandOf = (state, id) =>
  state.checks.find((check) => check.id === id)?.band;
/** The items in a room, with what each is and what it is hidden in. */
const itemsIn = (roomId) =>
  room(roomId).items.map(({ id, kind, gear, spell, hiddenIn }) => [
    id,
    gear ?? spell ?? kind,
    hiddenIn,
  ]);

test("the chantry is an eight-room level-3 Medium module, entered and left by the porch", () => {
  assert.equal(chantry.title, "The Hollow Chantry");
  assert.deepEqual(chantry.recommendedLevels, { min: 3, max: 3 });
  assert.equal(chantry.difficulty, "medium");
  assert.equal(chantry.startRoomId, "porch");
  assert.deepEqual(
    chantry.rooms.map(({ id, exit, restSite, encounterId }) => [
      id,
      exit === true,
      restSite === true,
      encounterId,
    ]),
    [
      ["porch", true, false, undefined],
      ["nave", false, false, "nave-fight"],
      ["vestry", false, true, undefined],
      ["sexton-stair", false, false, "pit-fight"],
      ["ossuary", false, false, "ossuary-fight"],
      ["priests-stair", false, false, undefined],
      ["priors-cell", false, false, "cell-fight"],
      ["undercroft", false, false, "undercroft-fight"],
    ],
  );
  assert.deepEqual(
    chantry.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["chantry-at-rest", "victory", 400],
      ["out-with-the-chantry-goods", "escape-with-loot", undefined],
      ["out-of-the-chantry", "escape-without-loot", undefined],
      ["fallen-in-the-chantry", "defeat", undefined],
    ],
  );
});

test("its fights are all undead, one foe each, and the Risen Prior's ends it", () => {
  assert.deepEqual(
    chantry.encounters.map(({ id, opponents, victoryEndingId }) => [
      id,
      opponents.map(({ id: opponentId, name, statBlock, boss }) => [
        opponentId,
        name,
        statBlock.name,
        statBlock.type,
        boss === true,
      ]),
      victoryEndingId,
    ]),
    [
      [
        "nave-fight",
        [["dead-sexton", "Dead Sexton", "Zombie", "Undead", false]],
        undefined,
      ],
      [
        "pit-fight",
        [["charnel-corpse", "Charnel Corpse", "Zombie", "Undead", false]],
        undefined,
      ],
      [
        "ossuary-fight",
        [["ossuary-ghoul", "Ghoul", "Ghoul", "Undead", false]],
        undefined,
      ],
      [
        "cell-fight",
        [["priors-guard", "Prior's Guard", "Skeleton", "Undead", false]],
        undefined,
      ],
      [
        "undercroft-fight",
        [["risen-prior", "Risen Prior", "Zombie", "Undead", true]],
        "chantry-at-rest",
      ],
      [
        "restless-dead",
        [["wandering-corpse", "Wandering Corpse", "Zombie", "Undead", false]],
        undefined,
      ],
    ],
  );
  // The restless dead come to the character only as it rests (#335).
  assert.deepEqual(chantry.wanderingEncounter, {
    encounterId: "restless-dead",
    chance: 25,
  });
});

test("two ways lead down: the sexton's grille and the priests' warded stair", () => {
  const passage = (id) => chantry.passages.find((entry) => entry.id === id);
  const grille = passage("nave-to-sexton-stair").door;
  assert.deepEqual(
    [grille.state, grille.keyItemId, grille.pick, grille.break, grille.force],
    [
      "locked",
      "sexton-key",
      { ability: "dexterity", tool: "thieves-tools", dc: 13 },
      { skill: "athletics", dc: 14 },
      undefined,
    ],
  );
  assert.equal(passage("nave-to-priests-stair").hidden, true);
  const sigils = room("nave").features.find(
    ({ id }) => id === "warding-sigils",
  ).check;
  assert.deepEqual(sigils.approaches, [
    { skill: "arcana", dc: 13 },
    { skill: "religion", dc: 13 },
  ]);
  assert.deepEqual(sigils.bands.success.effects, [
    { type: "open", passage: "nave-to-priests-stair" },
  ]);
  // The gate's planner takes the grille, which needs no check: its key
  // lies in the nave.
  assert.deepEqual(requiredPath(chantry), {
    objective: "victory",
    roomIds: ["porch", "nave", "sexton-stair", "undercroft"],
  });
});

test("its treasure is 99% of the level-3 budget, with two scrolls inside it and the +1 Mace outside", () => {
  // Nothing to carry out at the porch: the first loot is behind a fight.
  assert.deepEqual(itemsIn("porch"), []);
  assert.deepEqual(itemsIn("nave"), [
    ["altar-potion", "potion-of-healing", "altar"],
    ["altar-second-potion", "potion-of-healing", "altar"],
    ["sexton-key", "key", "sexton-pew"],
  ]);
  assert.deepEqual(itemsIn("vestry"), [
    ["vestry-scroll", "cure-wounds", "vestment-press"],
    ["vestry-potion", "potion-of-healing", "vestment-press"],
  ]);
  assert.deepEqual(itemsIn("sexton-stair"), [
    ["burial-fees", "coin", "sexton-box"],
    ["sexton-potion", "potion-of-healing", "sexton-box"],
  ]);
  assert.deepEqual(itemsIn("ossuary"), [
    ["founders-mace", "mace-plus-1", "founders-tomb"],
    ["jet-brooch", "treasure", "founders-tomb"],
    ["founders-garnet", "treasure", "founders-tomb"],
  ]);
  assert.deepEqual(itemsIn("priests-stair"), [
    ["niche-scroll", "magic-missile", "lamp-niche"],
    ["niche-azurite", "treasure", "lamp-niche"],
  ]);
  // In copper: four potions (200 gp), two 1st-level scrolls (100 gp), 10 gp,
  // a 25 gp brooch and 100 gp and 10 gp gems; the mace is outside (D10).
  assert.equal(findableValue(chantry), 44500);
  assert.equal(treasureBudget(3), 45000);
});

const NAVE = [
  ["move", "nave"],
  ["examine", "altar"],
  ["take", "altar-potion"],
  ["take", "altar-second-potion"],
  ["examine", "sexton-pew"],
  ["take", "sexton-key"],
];

const VESTRY = [
  ["move", "vestry"],
  ["examine", "vestment-press"],
  ["take", "vestry-scroll"],
  ["take", "vestry-potion"],
  ["move", "nave"],
];

const GRILLE_ROUTE = [
  ...NAVE,
  ...VESTRY,
  ["unlock", "iron-grille"],
  ["move", "sexton-stair"],
  ["examine", "sexton-box"],
  ["take", "burial-fees"],
  ["take", "sexton-potion"],
  ["move", "ossuary"],
  ["examine", "founders-tomb"],
  ["take", "founders-mace"],
  ["take", "jet-brooch"],
  ["take", "founders-garnet"],
  ["swap", "mace-plus-1"],
  ["move", "sexton-stair"],
  ["move", "undercroft"],
];

const level3 = testFighterAt(3);

test("a level-3 Fighter unlocks the grille with the sexton's key, wields the founder's +1 Mace and lays the prior to rest", () => {
  const { state, runtime } = firstJourney(
    chantry,
    level3,
    GRILLE_ROUTE,
    ({ status }) => status === "victory",
  );
  assert.equal(state.endingId, "chantry-at-rest");
  assert.ok(state.openedDoorIds.includes("iron-grille"));
  assert.ok(state.possessions.equipment.includes("mace-plus-1"));
  for (const id of ["jet-brooch", "founders-garnet"]) {
    assert.ok(state.inventory.includes(id), id);
  }
  // 10 gp of burial fees: the test fighter brings an empty purse.
  assert.equal(state.possessions.purse, 1000);
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Dead Sexton", 50],
    ["Defeated Charnel Corpse", 50],
    ["Defeated Ghoul", 200],
    ["Defeated Risen Prior", 50],
    ["The chantry at rest", 400],
  ]);
});

const WARD_ROUTE = [
  ["move", "nave"],
  ["examine", "warding-sigils", "arcana"],
  ["move", "priests-stair"],
  ["examine", "lamp-niche"],
  ["take", "niche-scroll"],
  ["take", "niche-azurite"],
  ["move", "priors-cell"],
  ["move", "undercroft"],
];

test("a level-3 Wizard reads the ward with Arcana and goes down the priests' stair, past the pit, with its scroll", () => {
  const { state, runtime } = firstJourney(
    chantry,
    velaAt3(),
    WARD_ROUTE,
    ({ status }) => status === "victory",
    { cast: true },
  );
  assert.equal(state.endingId, "chantry-at-rest");
  assert.equal(bandOf(state, "examine:warding-sigils"), "success");
  assert.ok(!state.clearedEncounterIds.includes("pit-fight"));
  assert.ok(
    state.possessions.magicItems.some(
      ({ scroll }) => scroll === "magic-missile",
    ),
  );
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Dead Sexton", 50],
    ["Defeated Prior's Guard", 50],
    ["Defeated Risen Prior", 50],
    ["The chantry at rest", 400],
  ]);
});

/** A session that has won the nave fight on `seed`, and its runtime. */
const afterNave = (sheet, seed, cast = false) =>
  journey(chantry, sheet, seed, [["move", "nave"]], { cast });

test("failing the ward leaves the wall a wall: the priests' stair stays hidden, and the ward isn't read again", () => {
  // The Fighter's Arcana (Intelligence 10, untrained) fails it on some seed.
  for (let seed = 0; seed < 50; seed += 1) {
    const { state, runtime } = afterNave(level3, seed);
    if (state.status !== "playing") {
      continue;
    }
    const random = createSeededRandom(seed);
    const read = runtime.handleAction(
      state,
      { type: "examine", targetId: "warding-sigils", approach: "arcana" },
      random,
    );
    if (!bandOf(read.state, "examine:warding-sigils").startsWith("failure")) {
      continue;
    }
    assert.ok(
      runtime.handleAction(
        read.state,
        { type: "move", destinationId: "priests-stair" },
        random,
      ).rejection !== undefined,
    );
    // Neither approach is offered again: the check is remembered, and
    // examining the sigils again rolls nothing.
    assert.deepEqual(
      runtime
        .projectActions(read.state)
        .filter(
          ({ action, target, approach }) =>
            action === "examine" &&
            target?.id === "warding-sigils" &&
            approach !== undefined,
        ),
      [],
    );
    return;
  }
  assert.fail("no seed below 50 fails the ward");
});

test("a Rogue picks the grille with thieves' tools, and a Cleric can read the vestry's Cure Wounds scroll", () => {
  const rogue = firstJourney(
    chantry,
    testRogueAt(3),
    [
      ["move", "nave"],
      ["pick", "iron-grille"],
    ],
    ({ openedDoorIds }) => openedDoorIds.includes("iron-grille"),
  );
  assert.ok(bandOf(rogue.state, "pick:iron-grille").startsWith("success"));
  const sheet = miraAt3();
  const cleric = firstJourney(
    chantry,
    sheet,
    [["move", "nave"], ...VESTRY.slice(0, -1)],
    ({ status, character }) => status === "playing" && character.hp < sheet.hp,
    { cast: true },
  );
  // Out of a fight the scroll is read on the character itself.
  const scroll = cleric.runtime
    .projectActions(cleric.state)
    .find(
      ({ action, spell }) =>
        action === "cast" && spell.id === "cure-wounds" && spell.item,
    );
  assert.ok(scroll, "Mira, who hasn't prepared Cure Wounds, reads the scroll");
  const read = cleric.runtime.handleAction(
    cleric.state,
    {
      type: "cast",
      actorId: "pc",
      spellId: "cure-wounds",
      targetIds: ["pc"],
      itemId: scroll.spell.item.id,
    },
    createSeededRandom(cleric.seed),
  );
  assert.equal(read.rejection, undefined);
  assert.ok(read.state.character.hp > cleric.state.character.hp);
  assert.deepEqual(read.state.possessions.magicItems, []);
});

test("a long rest in the vestry restores every hit point, unless the restless dead come", () => {
  const rested = firstJourney(
    chantry,
    level3,
    [["move", "nave"], ["move", "vestry"], ["long-rest"]],
    ({ longRests }) => longRests === 1,
  );
  assert.equal(rested.state.character.hp, level3.hp);
  assert.ok(!rested.state.clearedEncounterIds.includes("restless-dead"));
  // An interrupted rest restores nothing and uses no allowance (#335); the
  // journey fights the Wandering Corpse where the character rests.
  const interrupted = firstJourney(
    chantry,
    level3,
    [["move", "nave"], ["move", "vestry"], ["long-rest"]],
    ({ clearedEncounterIds }) => clearedEncounterIds.includes("restless-dead"),
  );
  assert.equal(interrupted.state.longRests, 0);
  assert.equal(interrupted.state.roomId, "vestry");
  assert.ok(interrupted.state.character.hp < level3.hp);
});
