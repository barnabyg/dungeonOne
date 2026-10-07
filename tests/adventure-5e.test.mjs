import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
} from "../dist/adventure-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";

const fixture = JSON.parse(
  await readFile(
    new URL("../adventures/5e/cellar-goblin.json", import.meta.url),
  ),
);
const changed = (change) => {
  const copy = structuredClone(fixture);
  change(copy);
  return copy;
};
/** Authors the cellar goblin's bestiary stat block inline, and returns it. */
const inline = (m) => {
  const [goblin] = m.encounters[0].opponents;
  m.encounters[0].opponents[0] = {
    id: goblin.id,
    name: "Goblin Warrior",
    description: goblin.description,
    statBlock: structuredClone(
      bestiary.monsters.find(({ id }) => id === "goblin-warrior").statBlock,
    ),
  };
  return m.encounters[0].opponents[0].statBlock;
};

test("the built-in fixture is a valid one-room module with a declared level range and difficulty", async () => {
  const adventure = (await loadBuiltInFifthAdventures()).find(
    ({ id }) => id === "cellar-goblin",
  );
  assert.deepEqual(adventure.recommendedLevels, { min: 1, max: 1 });
  assert.equal(adventure.difficulty, "hard");
  assert.equal(adventure.rooms.length, 1);
  const [opponent] = adventure.encounters[0].opponents;
  // SRD 5.2 Goblin Warrior.
  assert.equal(opponent.statBlock.armorClass, 15);
  assert.deepEqual(opponent.statBlock.hitPoints, {
    average: 10,
    formula: "3d6",
  });
  assert.deepEqual(validateModule(fixture), adventure);
});

test("the validator rejects unknown references", () => {
  for (const [change, message] of [
    [(m) => (m.startRoomId = "attic"), /startRoomId names unknown room attic/],
    [(m) => (m.rooms[0].encounterId = "rats"), /unknown encounter rats/],
    [
      (m) => (m.encounters[0].victoryEndingId = "parade"),
      /unknown ending parade/,
    ],
    [(m) => (m.encounters[0].defeatEndingId = "nap"), /unknown ending nap/],
    [
      (m) => (m.encounters[0].victoryEndingId = "fallen-in-the-cellar"),
      /not a victory ending/,
    ],
  ]) {
    assert.throws(() => validateModule(changed(change)), message);
  }
});

test("the validator rejects a missing ending", () => {
  assert.throws(
    () =>
      validateModule(
        changed((m) => {
          m.endings = m.endings.filter(({ kind }) => kind !== "victory");
        }),
      ),
    /missing a victory or escape ending/,
  );
  assert.throws(
    () => validateModule(changed((m) => (m.endings = []))),
    /endings must list/,
  );
});

test("the validator rejects malformed modules", () => {
  for (const [change, message] of [
    [(m) => (m.difficulty = "deadly"), /difficulty/],
    [
      (m) => (m.recommendedLevels = { min: 2, max: 1 }),
      /recommendedLevels max/,
    ],
    [(m) => (m.surprise = true), /exactly/],
    [
      (m) => m.rooms.push(structuredClone(m.rooms[0])),
      /duplicate room id cellar/,
    ],
    [(m) => (m.encounters[0].opponents[0].id = "pc"), /reserved/],
    [(m) => (inline(m).armorClass = "15"), /armorClass/],
    [(m) => (inline(m).attacks = []), /attacks must list/],
    [(m) => (inline(m).challengeRating = "1/3"), /challengeRating/],
  ]) {
    assert.throws(() => validateModule(changed(change)), message);
  }
});

test("an opponent may be marked as a boss, and is ordinary otherwise", async () => {
  const boss = validateModule(
    changed((m) => (m.encounters[0].opponents[0].boss = true)),
  );
  assert.equal(boss.encounters[0].opponents[0].boss, true);
  assert.equal(
    "boss" in validateModule(fixture).encounters[0].opponents[0],
    false,
  );
  assert.throws(
    () =>
      validateModule(
        changed((m) => (m.encounters[0].opponents[0].boss = false)),
      ),
    /opponent 1 boss must be true, or left out/,
  );
  const warren = (await loadBuiltInFifthAdventures()).find(
    ({ id }) => id === "goblin-warren",
  );
  assert.deepEqual(
    warren.encounters.flatMap(({ opponents }) =>
      opponents.flatMap(({ id, boss }) => (boss ? [id] : [])),
    ),
    ["goblin-boss"],
  );
});

test("a module in another format version is refused by name and left unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adventure-5e-"));
  try {
    const path = join(directory, "old.json");
    const bytes = JSON.stringify({ ...fixture, formatVersion: 4 });
    await writeFile(path, bytes);
    await assert.rejects(loadFifthAdventure(path), (error) => {
      assert.match(
        error.message,
        /old\.json is a 5e adventure module in format version 4, not 12. Move it aside/,
      );
      return true;
    });
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the group-fight module holds two goblins with distinct names", async () => {
  const adventures = await loadBuiltInFifthAdventures();
  assert.deepEqual(
    adventures.map(({ id }) => id),
    [
      "abandoned-delve",
      "cellar-goblin",
      "goblin-storeroom",
      "goblin-warren",
      "robbers-barrow",
      "smugglers-cellar",
      "tinkers-toll",
      "warden-crypt",
    ],
  );
  const group = adventures.find(({ id }) => id === "goblin-storeroom");
  assert.equal(group.difficulty, "medium");
  assert.deepEqual(group.recommendedLevels, { min: 2, max: 2 });
  assert.deepEqual(
    group.encounters[0].opponents.map(({ id, name, statBlock }) => [
      id,
      name,
      statBlock.name,
    ]),
    [
      ["minion", "Goblin Minion", "Goblin Minion"],
      ["warrior", "Goblin Warrior", "Goblin Warrior"],
    ],
  );
});

test("the validator rejects opponents in one encounter that share a name", () => {
  assert.throws(
    () =>
      validateModule(
        changed((m) =>
          m.encounters[0].opponents.push({
            ...m.encounters[0].opponents[0],
            id: "goblin-2",
          }),
        ),
      ),
    /encounter 1 has two opponents named Goblin Warrior; give each a name the player can target/,
  );
});

test("opponent names differing only in case count as the same name", () => {
  assert.throws(
    () =>
      validateModule(
        changed((m) =>
          m.encounters[0].opponents.push({
            ...m.encounters[0].opponents[0],
            id: "goblin-2",
            name: "goblin warrior",
          }),
        ),
      ),
    /encounter 1 has two opponents named goblin warrior;/,
  );
});

const smugglers = JSON.parse(
  await readFile(new URL("fixtures/smugglers-with-rat.json", import.meta.url)),
);
const explored = (change) => {
  const copy = structuredClone(smugglers);
  change(copy);
  return copy;
};
const room = (module, id) => module.rooms.find((entry) => entry.id === id);

test("the multi-room fixture has passages, features with discoveries and a hidden potion", () => {
  // The Smugglers' Cellar as it was before #207, with its Giant Rat fight.
  const adventure = validateModule(smugglers);
  assert.deepEqual(
    adventure.rooms.map(({ id }) => id),
    ["stair-foot", "alcove", "rat-cellar", "den"],
  );
  assert.equal(adventure.passages.length, 3);
  const [potion] = room(adventure, "alcove").items;
  assert.equal(potion.kind, "potion-of-healing");
  assert.equal(potion.hiddenIn, "iron-chest");
  // The rat fight leaves the adventure going; the goblin's ends it.
  assert.equal(adventure.encounters[0].victoryEndingId, undefined);
  assert.equal(adventure.encounters[1].victoryEndingId, "cellar-cleared");
});

test("the validator rejects unreachable rooms", () => {
  assert.throws(
    () =>
      validateModule(
        explored((m) => {
          m.passages = m.passages.filter(({ id }) => id !== "cellar-to-den");
        }),
      ),
    /room den cannot be reached from stair-foot/,
  );
  assert.throws(
    () =>
      validateModule(
        explored((m) => {
          m.rooms.push({
            id: "vault",
            name: "Vault",
            description: "Sealed.",
            features: [],
            items: [],
          });
        }),
      ),
    /room vault cannot be reached/,
  );
});

test("the validator rejects unknown references in rooms, passages and items", () => {
  for (const [change, message] of [
    [
      (m) => (m.passages[0].between = ["stair-foot", "attic"]),
      /passage 1 names unknown room attic/,
    ],
    [
      (m) => (room(m, "alcove").items[0].hiddenIn = "wardrobe"),
      /hidden in unknown feature wardrobe/,
    ],
    [
      (m) => (room(m, "alcove").items[0].hiddenIn = "rusted-lantern"),
      /hidden in unknown feature rusted-lantern/,
    ],
    [
      (m) => delete room(m, "alcove").features[0].discovery,
      /hidden in iron-chest, which has no discovery/,
    ],
    [
      (m) => (room(m, "alcove").items[0].kind = "potion-of-flying"),
      /kind must be one of potion-of-healing/,
    ],
    [
      (m) => (room(m, "den").encounterId = "dragon"),
      /unknown encounter dragon/,
    ],
    [
      (m) => (m.passages[0].between = ["alcove", "alcove"]),
      /leads from alcove to itself/,
    ],
    [
      (m) => m.passages.push({ ...m.passages[0], id: "again" }),
      /two passages join stair-foot and alcove/,
    ],
    [
      (m) => (room(m, "den").features[0].id = "iron-chest"),
      /duplicate id iron-chest/,
    ],
    [
      (m) =>
        room(m, "den").features.push({
          ...room(m, "den").features[0],
          id: "other",
          name: "damp ledger",
        }),
      /two features named damp ledger/,
    ],
    [
      (m) => delete room(m, "rat-cellar").encounterId,
      /encounter cellar-rat is in no room/,
    ],
    [
      (m) => (room(m, "alcove").encounterId = "den-goblin"),
      /encounter den-goblin is in more than one room/,
    ],
    [(m) => (room(m, "alcove").secret = true), /room 2 must have/],
  ]) {
    assert.throws(() => validateModule(explored(change)), message);
  }
});

test("the validator rejects an ending no encounter can reach", () => {
  assert.throws(
    () =>
      validateModule(explored((m) => delete m.encounters[1].victoryEndingId)),
    /ending cellar-cleared cannot be reached/,
  );
});

const crypt = JSON.parse(
  await readFile(
    new URL("../adventures/5e/warden-crypt.json", import.meta.url),
  ),
);
const crypted = (change) => {
  const copy = structuredClone(crypt);
  change(copy);
  return copy;
};
const passage = (m, id) => m.passages.find((entry) => entry.id === id);

test("the crypt fixture has a stuck door, a locked door with a key, a trap and a talkable creature", async () => {
  const adventure = (await loadBuiltInFifthAdventures()).find(
    ({ id }) => id === "warden-crypt",
  );
  assert.deepEqual(validateModule(crypt), adventure);
  assert.deepEqual(passage(adventure, "stair-to-cell").door, {
    id: "swollen-door",
    name: "Swollen Door",
    description: "The wood has swollen tight in its frame.",
    state: "stuck",
    force: { skill: "athletics", dc: 13 },
  });
  const iron = passage(adventure, "hall-to-strongroom").door;
  assert.equal(iron.state, "locked");
  assert.equal(iron.keyItemId, "iron-key");
  assert.deepEqual(iron.pick, { ability: "dexterity", dc: 15 });
  const trap = passage(adventure, "hall-to-offerings").trap;
  assert.deepEqual(trap.save, { ability: "dexterity", dc: 12 });
  assert.equal(trap.defeatEndingId, "fallen-in-the-crypt");
  const [smuggler] = room(adventure, "hall").creatures;
  assert.deepEqual(
    smuggler.topics.map(({ id, check }) => [id, check]),
    [
      ["warden", undefined],
      ["key-whereabouts", { skill: "persuasion", dc: 12 }],
    ],
  );
  // A room without creatures has none.
  assert.deepEqual(room(adventure, "tomb").creatures, []);
});

test("the validator rejects a check or trap that guards the only route to an essential room", () => {
  for (const [change, message] of [
    [
      (m) =>
        (passage(m, "hall-to-tomb").door = {
          id: "tomb-door",
          name: "Tomb Door",
          description: "Stuck fast.",
          state: "stuck",
          force: { skill: "athletics", dc: 10 },
        }),
      /room tomb is essential, but every route to it needs a check or passes a trap \(tomb-door\)/,
    ],
    [
      (m) =>
        (passage(m, "hall-to-tomb").trap = structuredClone(
          passage(m, "hall-to-offerings").trap,
        )) && (passage(m, "hall-to-tomb").trap.id = "tomb-trap"),
      /room tomb is essential.*\(tomb-trap\)/,
    ],
    [
      // The only key lies past the dart trap.
      (m) =>
        (passage(m, "hall-to-tomb").door = {
          id: "tomb-door",
          name: "Tomb Door",
          description: "Locked.",
          state: "locked",
          keyItemId: "iron-key",
        }),
      /room tomb is essential.*\(tomb-door\)/,
    ],
  ]) {
    assert.throws(() => validateModule(crypted(change)), message);
  }
  // A locked door is no obstacle when its key can be reached freely.
  const freeKey = crypted((m) => {
    passage(m, "hall-to-tomb").door = {
      id: "tomb-door",
      name: "Tomb Door",
      description: "Locked.",
      state: "locked",
      keyItemId: "stair-key",
    };
    room(m, "crypt-stair").items.push({
      id: "stair-key",
      name: "Stair Key",
      description: "A small key.",
      kind: "key",
      hiddenIn: "carved-warning",
    });
  });
  assert.equal(validateModule(freeKey).passages[2].door.keyItemId, "stair-key");
});

test("the validator rejects malformed doors, traps and creatures", () => {
  for (const [change, message] of [
    [
      (m) =>
        (passage(m, "stair-to-cell").door.pick = {
          ability: "dexterity",
          dc: 10,
        }),
      /a stuck door is opened only by force/,
    ],
    [
      (m) => delete passage(m, "stair-to-cell").door.force,
      /a stuck door needs force/,
    ],
    [
      (m) => {
        const door = passage(m, "hall-to-strongroom").door;
        delete door.pick;
        delete door.break;
        delete door.keyItemId;
      },
      /a locked door needs a key, pick or break/,
    ],
    [
      (m) =>
        (passage(m, "hall-to-strongroom").door.force = {
          skill: "athletics",
          dc: 10,
        }),
      /a locked door is not forced/,
    ],
    [
      (m) => (passage(m, "hall-to-strongroom").door.keyItemId = "cell-potion"),
      /key cell-potion is not a key/,
    ],
    [
      (m) => (passage(m, "hall-to-strongroom").door.keyItemId = "skeleton"),
      /unknown key skeleton/,
    ],
    [
      (m) =>
        (passage(m, "stair-to-cell").door.force = { skill: "stealth", dc: 10 }),
      /skill must be one of/,
    ],
    [
      (m) =>
        (passage(m, "stair-to-cell").door.force = {
          skill: "athletics",
          dc: 31,
        }),
      /dc must be an integer from 5 to 30/,
    ],
    [
      (m) =>
        (passage(m, "hall-to-offerings").trap.defeatEndingId = "crypt-cleared"),
      /not a defeat ending/,
    ],
    [
      (m) => (passage(m, "hall-to-offerings").trap.save.ability = "luck"),
      /save ability must be an ability/,
    ],
    [
      (m) => delete room(m, "hall").creatures[0].topics[1].failure,
      /topic key-whereabouts has a check but no failure/,
    ],
    [
      (m) => (room(m, "hall").creatures[0].topics[1].id = "warden"),
      /duplicate id warden/,
    ],
    [
      (m) => (passage(m, "hall-to-offerings").trap.id = "offering-bowl"),
      /duplicate id offering-bowl/,
    ],
    [
      (m) => (passage(m, "stair-to-cell").door.name = "iron door"),
      /two doors named iron door/i,
    ],
  ]) {
    assert.throws(() => validateModule(crypted(change)), message);
  }
});

test("an ending only a trap names can still be reached", () => {
  const trapOnly = crypted((m) => {
    m.endings.push({
      id: "pierced",
      kind: "defeat",
      title: "Pierced",
      text: "The darts find you.",
    });
    passage(m, "hall-to-offerings").trap.defeatEndingId = "pierced";
  });
  assert.equal(validateModule(trapOnly).endings.length, 3);
});

const barrow = JSON.parse(
  await readFile(
    new URL("../adventures/5e/robbers-barrow.json", import.meta.url),
  ),
);
const barrowed = (change) => {
  const copy = structuredClone(barrow);
  change(copy);
  return copy;
};
const endingOf = (m, kind) => m.endings.find((entry) => entry.kind === kind);

test("the barrow fixture has an exit, hidden treasure and both escape endings with XP", async () => {
  const adventure = (await loadBuiltInFifthAdventures()).find(
    ({ id }) => id === "robbers-barrow",
  );
  assert.equal(adventure.rooms[0].exit, true);
  const [torc] = adventure.rooms[1].items;
  assert.equal(torc.kind, "treasure");
  assert.equal(torc.hiddenIn, "stone-bier");
  assert.deepEqual(
    adventure.endings.map(({ kind, xp }) => [kind, xp]),
    [
      ["escape-with-loot", 250],
      ["escape-without-loot", undefined],
      ["defeat", undefined],
    ],
  );
});

test("an opponent may carry treasure, unless its fight ends the adventure", () => {
  const adventure = validateModule(barrow);
  assert.equal(adventure.rooms[1].items[1].hiddenIn, "barrow-goblin");
  assert.throws(
    () =>
      validateModule(
        barrowed((m) => {
          m.endings.push({
            id: "won",
            kind: "victory",
            title: "Won",
            text: "The barrow is quiet.",
          });
          m.encounters[0].victoryEndingId = "won";
        }),
      ),
    /carried by barrow-goblin, whose fight ends the adventure/,
  );
  // An opponent in another room's fight can't carry this room's item.
  assert.throws(
    () =>
      validateModule(
        barrowed((m) => m.rooms[0].items.push(m.rooms[1].items.pop())),
      ),
    /hidden in unknown feature barrow-goblin/,
  );
  // Opponents share the targets' namespace.
  assert.throws(
    () =>
      validateModule(
        barrowed((m) =>
          m.rooms[0].features.push({
            id: "barrow-goblin",
            name: "Old Grave",
            description: "A sunken grave.",
          }),
        ),
      ),
    /duplicate id barrow-goblin/,
  );
});

test("the validator rejects treasure lying in the open", () => {
  assert.throws(
    () => validateModule(barrowed((m) => delete m.rooms[1].items[0].hiddenIn)),
    /item 1 is treasure, so it must be hidden in a feature/,
  );
});

test("the validator matches exits to escape endings", () => {
  for (const [change, message] of [
    [(m) => delete m.rooms[0].exit, /escape ending .* no room is an exit/],
    [
      (m) => (m.endings = m.endings.filter(({ kind }) => kind === "defeat")),
      /missing a victory or escape ending/,
    ],
    [
      (m) =>
        (m.endings = m.endings.filter(
          ({ kind }) => kind !== "escape-without-loot",
        )),
      /an exit needs an escape-without-loot ending/,
    ],
    [
      (m) =>
        m.endings.push({ ...endingOf(m, "escape-with-loot"), id: "twice" }),
      /more than one escape-with-loot ending/,
    ],
    [(m) => (m.rooms[1].items = []), /escape-with-loot ending .* no treasure/],
    [(m) => (m.rooms[0].exit = false), /exit must be true/],
    [
      (m) => {
        delete m.rooms[0].exit;
        m.rooms[1].exit = true;
        m.passages[0].door = {
          id: "barrow-door",
          name: "Barrow Door",
          description: "A slab of stone.",
          state: "stuck",
          force: { skill: "athletics", dc: 12 },
        };
      },
      /every exit needs a check or passes a trap/,
    ],
    [(m) => (endingOf(m, "defeat").xp = 10), /a defeat ending awards no XP/],
    [(m) => (endingOf(m, "escape-with-loot").xp = -1), /xp must be an integer/],
    [(m) => (endingOf(m, "defeat").kind = "retreat"), /kind must be/],
  ]) {
    assert.throws(() => validateModule(barrowed(change)), message);
  }
});

test("an exit without treasure needs only the empty-handed escape", () => {
  const adventure = validateModule(
    barrowed((m) => {
      m.rooms[1].items = [];
      m.endings = m.endings.filter(({ kind }) => kind !== "escape-with-loot");
    }),
  );
  assert.deepEqual(
    adventure.endings.map(({ kind }) => kind),
    ["escape-without-loot", "defeat"],
  );
});
