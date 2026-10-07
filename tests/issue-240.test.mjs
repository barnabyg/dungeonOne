// #240: defeated monsters carry loot that fits what they are. Each bestiary
// monster has a treasure type; an authoring-time roll turns a module's
// opponents' treasure types into ordinary items they carry, and the
// validator rejects carried loot a treasure type couldn't produce.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FIFTH_BESTIARY_FORMAT,
  validateFifthBestiary,
} from "../dist/bestiary-5e.js";
import { formatCoins } from "../dist/equipment-5e.js";
import { rollModuleLoot } from "../dist/loot-5e.js";
import { createSeededRandom } from "../dist/random.js";
import {
  rollTreasure,
  TRADE_GOODS,
  TREASURE_TYPES,
  treasureBudget,
} from "../dist/treasure-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";

const LOOT_SCRIPT = fileURLToPath(
  new URL("../scripts/loot-5e.mjs", import.meta.url),
);

test("the treasure types are the owner's five", () => {
  assert.deepEqual(TREASURE_TYPES, {
    none: {},
    copper: { coins: { coin: "cp", dice: 3, sides: 6 } },
    silver: { coins: { coin: "sp", dice: 3, sides: 6 } },
    "silver-and-trinket": {
      coins: { coin: "sp", dice: 3, sides: 6 },
      trinkets: ["gem-10gp", "art-25gp"],
    },
    gold: { coins: { coin: "gp", dice: 2, sides: 6 } },
  });
});

test("a roll is deterministic for a seed and never exceeds its type's range", () => {
  for (const [type, { coins, trinkets }] of Object.entries(TREASURE_TYPES)) {
    const seen = new Set();
    for (let seed = 0; seed < 3000; seed += 1) {
      const loot = rollTreasure(type, createSeededRandom(seed));
      assert.deepEqual(rollTreasure(type, createSeededRandom(seed)), loot);
      if (coins === undefined) {
        assert.equal(loot.coins, undefined);
      } else {
        assert.deepEqual(Object.keys(loot.coins), [coins.coin]);
        const amount = loot.coins[coins.coin];
        assert.ok(amount >= coins.dice && amount <= coins.dice * coins.sides);
        seen.add(amount);
      }
      if (trinkets === undefined) {
        assert.equal(loot.trinket, undefined);
      } else {
        assert.ok(trinkets.includes(loot.trinket));
        seen.add(loot.trinket);
      }
    }
    if (coins !== undefined) {
      // Over 3000 seeds the dice reach both ends of their range.
      assert.ok(seen.has(coins.dice) && seen.has(coins.dice * coins.sides));
    }
    for (const trinket of trinkets ?? []) {
      assert.ok(seen.has(trinket));
    }
  }
});

test("each bestiary monster has the owner's treasure type; undead and beasts carry none", () => {
  assert.equal(FIFTH_BESTIARY_FORMAT, 7);
  assert.deepEqual(
    Object.fromEntries(
      bestiary.monsters.map(({ id, treasureType }) => [id, treasureType]),
    ),
    {
      zombie: "none",
      skeleton: "none",
      "giant-spider": "none",
      ghoul: "none",
      "goblin-minion": "copper",
      "goblin-warrior": "copper",
      "goblin-boss": "silver-and-trinket",
      wolf: "none",
      bandit: "silver",
      "giant-rat": "none",
      kobold: "copper",
      "hobgoblin-warrior": "silver",
      "bugbear-warrior": "silver-and-trinket",
      gnoll: "silver",
      ogre: "gold",
    },
  );
});

test("the bestiary validator rejects a missing or unknown treasure type", () => {
  const file = (monster) => ({ ...bestiary, monsters: [monster] });
  const goblin = bestiary.monsters.find(({ id }) => id === "goblin-warrior");
  const untyped = structuredClone(goblin);
  delete untyped.treasureType;
  assert.throws(
    () => validateFifthBestiary(file(untyped)),
    /Invalid bestiary: monster 1 must have exactly id, description, levelBand, treasureType, statBlock\./,
  );
  assert.throws(
    () => validateFifthBestiary(file({ ...goblin, treasureType: "hoard" })),
    /Invalid bestiary: monster 1 treasureType must be one of none, copper, silver, silver-and-trinket, gold\./,
  );
});

/**
 * The lintel barrow with its goblin as the bestiary's Goblin Warrior
 * (treasure type copper), or `monster`, carrying `items` and nothing else.
 */
function barrowCarrying(items, monster = "goblin-warrior") {
  const module = moduleFile("lintel-barrow");
  module.encounters[0].opponents = [
    { id: "barrow-goblin", monster, description: "It leaps down." },
  ];
  const hall = room(module, "burial-hall");
  hall.items = [
    ...hall.items.filter(({ hiddenIn }) => hiddenIn !== "barrow-goblin"),
    ...items.map((item, index) => ({
      id: `carried-${index + 1}`,
      name: `Carried ${index + 1}`,
      description: "Something it carries.",
      hiddenIn: "barrow-goblin",
      ...item,
    })),
  ];
  return module;
}

const coin = (coins) => ({ kind: "coin", coins });
const trinket = (treasure) => ({ kind: "treasure", treasure });

test("the validator accepts carried loot its treasure type could produce, and a key", () => {
  for (const items of [
    [],
    [coin({ cp: 3 })],
    [coin({ cp: 18 })],
    [coin({ cp: 10 }), coin({ cp: 8 })],
    [{ kind: "key" }],
  ]) {
    validateModule(barrowCarrying(items));
  }
  validateModule(
    barrowCarrying([coin({ sp: 18 }), trinket("art-25gp")], "goblin-boss"),
  );
  validateModule(barrowCarrying([trinket("gem-10gp")], "bugbear-warrior"));
});

test("the validator rejects carried loot outside the opponent's treasure type", () => {
  // Each problem names the module, the room and the opponent, then what it
  // carries and what its treasure type gives.
  const rejects = (items, problem, monster) =>
    assert.throws(
      () => validateModule(barrowCarrying(items, monster)),
      (error) => {
        assert.equal(
          error.message,
          `Invalid adventure module: module lintel-barrow room 2: barrow-goblin carries ${problem}.`,
        );
        return true;
      },
    );
  const copper = "but its treasure type copper gives only up to 18 cp";
  rejects([coin({ cp: 19 })], `19 cp, ${copper}`);
  rejects([coin({ cp: 10 }), coin({ cp: 9 })], `19 cp, ${copper}`);
  rejects([coin({ sp: 1 })], `Carried 1 (1 sp), ${copper}`);
  rejects([trinket("gem-10gp")], `Carried 1 (gem-10gp), ${copper}`);
  rejects([{ kind: "potion-of-healing" }], `Carried 1, ${copper}`);
  rejects([{ kind: "gear", gear: "dagger" }], `Carried 1, ${copper}`);
  rejects(
    [coin({ cp: 1 })],
    "Carried 1 (1 cp), but its treasure type none gives nothing",
    "zombie",
  );
  const boss =
    "but its treasure type silver-and-trinket gives only up to 18 sp and one of gem-10gp, art-25gp";
  rejects(
    [trinket("gem-10gp"), trinket("art-25gp")],
    `2 trinkets, ${boss}`,
    "goblin-boss",
  );
  rejects(
    [trinket("gem-50gp")],
    `Carried 1 (gem-50gp), ${boss}`,
    "goblin-boss",
  );
});

test("an inline opponent has no treasure type, so what it carries is the author's", () => {
  const module = barrowCarrying([coin({ gp: 2, sp: 5 })]);
  const goblin = bestiary.monsters.find(({ id }) => id === "goblin-warrior");
  module.encounters[0].opponents = [
    {
      id: "barrow-goblin",
      name: "Goblin Warrior",
      description: "It leaps down.",
      statBlock: goblin.statBlock,
    },
  ];
  validateModule(module);
});

test("carried loot counts toward the treasure budget", () => {
  // The torc (25 gp) and coin under the bier fill the level-1 budget to
  // within 10 cp; the goblin's 18 cp pushes it 8 cp over.
  const module = barrowCarrying([coin({ cp: 18 })]);
  room(module, "burial-hall").items.push({
    id: "bier-coin",
    name: "Bier Coin",
    description: "Coin under the bier.",
    kind: "coin",
    coins: { cp: treasureBudget(1) - TRADE_GOODS["art-25gp"].value - 10 },
    hiddenIn: "stone-bier",
  });
  assert.throws(() => validateModule(module), {
    message:
      /module lintel-barrow: its findable treasure is worth 150 gp 8 cp, 8 cp over the 150 gp budget for level 1\./,
  });
  room(module, "burial-hall").items.at(-2).coins = { cp: 10 };
  validateModule(module);
});

/** The items a rolled module's opponent `id` carries. */
const carriedBy = (module, id) =>
  module.rooms.flatMap(({ items }) =>
    items.filter(({ hiddenIn }) => hiddenIn === id),
  );

test("rolling a module writes each bestiary opponent's loot into its room, the same for a seed", () => {
  const file = barrowCarrying([]);
  const { module, rolled } = rollModuleLoot(file, bestiary, 7);
  assert.deepEqual(rollModuleLoot(file, bestiary, 7).module, module);
  assert.notDeepEqual(file, module, "the file it was given is left alone");
  const [pouch] = carriedBy(module, "barrow-goblin");
  assert.equal(carriedBy(module, "barrow-goblin").length, 1);
  assert.deepEqual(pouch, {
    id: "barrow-goblin-coins",
    name: "Goblin Warrior's Coins",
    description: "A greasy pouch of copper pieces.",
    kind: "coin",
    coins: { cp: pouch.coins.cp },
    hiddenIn: "barrow-goblin",
  });
  assert.ok(pouch.coins.cp >= 3 && pouch.coins.cp <= 18);
  assert.deepEqual(rolled, [
    {
      opponentId: "barrow-goblin",
      treasureType: "copper",
      items: ["Goblin Warrior's Coins"],
    },
  ]);
  validateModule(module);
  // Other seeds roll other amounts, always within the type.
  const amounts = new Set();
  for (let seed = 0; seed < 50; seed += 1) {
    const [rolledPouch] = carriedBy(
      rollModuleLoot(file, bestiary, seed).module,
      "barrow-goblin",
    );
    amounts.add(rolledPouch.coins.cp);
  }
  assert.ok(amounts.size > 5);
});

test("a goblin boss's roll gives silver and one trinket", () => {
  const { module } = rollModuleLoot(
    barrowCarrying([], "goblin-boss"),
    bestiary,
    3,
  );
  const [coins, trinket] = carriedBy(module, "barrow-goblin");
  assert.equal(coins.kind, "coin");
  assert.deepEqual(Object.keys(coins.coins), ["sp"]);
  assert.equal(trinket.kind, "treasure");
  assert.ok(["gem-10gp", "art-25gp"].includes(trinket.treasure));
  assert.equal(trinket.id, "barrow-goblin-trinket");
  assert.match(trinket.name, /^Goblin Boss's (Rough Gem|Silver Trinket)$/);
  validateModule(module);
});

test("the roll leaves alone an opponent that already carries loot, one with type none and an inline one", () => {
  const carrying = barrowCarrying([coin({ cp: 4 })]);
  assert.deepEqual(rollModuleLoot(carrying, bestiary, 1), {
    module: carrying,
    rolled: [],
  });
  const zombie = barrowCarrying([], "zombie");
  assert.deepEqual(rollModuleLoot(zombie, bestiary, 1).rolled, []);
  const inline = barrowCarrying([]);
  inline.encounters[0].opponents[0] = {
    id: "barrow-goblin",
    name: "Goblin Warrior",
    description: "It leaps down.",
    statBlock: bestiary.monsters.find(({ id }) => id === "goblin-warrior")
      .statBlock,
  };
  assert.deepEqual(rollModuleLoot(inline, bestiary, 1).rolled, []);
  // A key is not loot: the goblin with only a key still gets its coins.
  const keyed = barrowCarrying([{ kind: "key" }]);
  assert.equal(
    carriedBy(rollModuleLoot(keyed, bestiary, 1).module, "barrow-goblin")
      .length,
    2,
  );
});

test("the roll skips an opponent whose fight ends the adventure, since its body is never searched", () => {
  const { module, rolled } = rollModuleLoot(
    moduleFile("lone-goblin"),
    bestiary,
    1,
  );
  assert.deepEqual(rolled, []);
  assert.deepEqual(module, moduleFile("lone-goblin"));
});

test("the roll refuses a module it would push over budget, or whose item ids clash", () => {
  const rich = barrowCarrying([]);
  room(rich, "burial-hall").items.push({
    id: "bier-coin",
    name: "Bier Coin",
    description: "Coin under the bier.",
    kind: "coin",
    coins: { cp: treasureBudget(1) - TRADE_GOODS["art-25gp"].value },
    hiddenIn: "stone-bier",
  });
  assert.throws(
    () => rollModuleLoot(rich, bestiary, 1),
    /Invalid adventure module: module lintel-barrow: its findable treasure is worth 150 gp \d+ cp, \d+ cp over the 150 gp budget for level 1\./,
  );
  const clash = barrowCarrying([]);
  room(clash, "burial-hall").items[0].id = "barrow-goblin-coins";
  assert.throws(
    () => rollModuleLoot(clash, bestiary, 1),
    /The roll would add item barrow-goblin-coins, but the module already has one\./,
  );
});

test("npm run loot rolls a module file in place with a seed, and says what it rolled", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-240-"));
  try {
    const path = join(directory, "barrow.json");
    const file = barrowCarrying([]);
    await writeFile(path, JSON.stringify(file));
    const run = (...args) =>
      spawnSync(process.execPath, [LOOT_SCRIPT, ...args], {
        encoding: "utf8",
      });
    const rolled = run(path, "--seed", "7");
    assert.equal(rolled.status, 0, rolled.stderr);
    const written = await readFile(path, "utf8");
    assert.deepEqual(
      JSON.parse(written),
      rollModuleLoot(file, bestiary, 7).module,
    );
    assert.match(written, /^\{\n {2}"kind": "dungeon-one-5e-adventure",\n/);
    const pouch = carriedBy(JSON.parse(written), "barrow-goblin")[0];
    assert.equal(
      rolled.stdout,
      [
        "Rolled loot for lintel-barrow with seed 7:",
        "  barrow-goblin (copper): Goblin Warrior's Coins",
        `Findable treasure: ${formatCoins(TRADE_GOODS["art-25gp"].value + pouch.coins.cp)} of the 150 gp budget for level 1.`,
        "",
      ].join("\n"),
    );
    // Rolling again leaves the goblin's loot alone and the file unchanged.
    const again = run("--seed", "8", path);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /^No opponent in lintel-barrow needs loot;/);
    assert.equal(await readFile(path, "utf8"), written);
    for (const args of [[path], [path, "--seed"], ["--seed", "1"]]) {
      const usage = run(...args);
      assert.equal(usage.status, 2);
      assert.match(
        usage.stderr,
        /Usage: npm run loot -- <module\.json> --seed/,
      );
    }
    // --seed=N works as the browser's does.
    assert.equal(run(`--seed=9`, path).status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
