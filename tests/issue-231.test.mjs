// #231: the shipped monsters live in one shared bestiary that modules name
// by id, with the module's own name and description where it gives them; a
// one-off stat block may still be authored inline.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIFTH_ADVENTURE_FILES,
  loadBuiltInFifthAdventures,
  loadFifthAdventure,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  FIFTH_BESTIARY_FORMAT,
  loadFifthBestiary,
  validateFifthBestiary,
} from "../dist/bestiary-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";

const read = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)));
const moduleFiles = Object.fromEntries(
  await Promise.all(
    Object.entries(FIFTH_ADVENTURE_FILES).map(async ([id, file]) => [
      id,
      await read(`../adventures/5e/${file}`),
    ]),
  ),
);
const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);
const opponents = (module) =>
  module.encounters.flatMap((encounter) => encounter.opponents);

test("the bestiary holds the nine shipped monsters and the Giant Rat (#232)", () => {
  assert.equal(bestiary.formatVersion, FIFTH_BESTIARY_FORMAT);
  assert.deepEqual(
    bestiary.monsters.map(({ id, statBlock }) => [id, statBlock.name]),
    [
      ["zombie", "Zombie"],
      ["skeleton", "Skeleton"],
      ["giant-spider", "Giant Spider"],
      ["ghoul", "Ghoul"],
      ["goblin-minion", "Goblin Minion"],
      ["goblin-warrior", "Goblin Warrior"],
      ["goblin-boss", "Goblin Boss"],
      ["wolf", "Wolf"],
      ["bandit", "Bandit"],
      ["giant-rat", "Giant Rat"],
    ],
  );
});

test("every shipped opponent names its bestiary monster instead of an inline stat block", async () => {
  for (const [id, module] of Object.entries(moduleFiles)) {
    for (const opponent of opponents(module)) {
      assert.equal("statBlock" in opponent, false, `${id} ${opponent.id}`);
      assert.ok(monster(opponent.monster), `${id} ${opponent.id}`);
    }
  }
  // Moving to the bestiary changed nothing: each module plays exactly as it
  // did with every stat block inline.
  const shipped = await loadBuiltInFifthAdventures();
  for (const adventure of shipped) {
    const inline = structuredClone(moduleFiles[adventure.id]);
    for (const opponent of opponents(inline)) {
      const { statBlock, description } = monster(opponent.monster);
      opponent.name ??= statBlock.name;
      opponent.description ??= description;
      opponent.statBlock = structuredClone(statBlock);
      delete opponent.monster;
    }
    assert.deepEqual(
      validateFifthAdventure(inline, { ...bestiary, monsters: [] }),
      adventure,
      adventure.id,
    );
  }
});

test("an opponent takes its monster's stat block, and its name and description unless the module gives its own", () => {
  const delve = validateModule(moduleFiles["abandoned-delve"]);
  const [tall, bent] = delve.encounters.find(
    ({ id }) => id === "barracks-skeletons",
  ).opponents;
  assert.equal(tall.name, "Tall Skeleton");
  assert.equal(bent.name, "Bent Skeleton");
  assert.deepEqual(tall.statBlock, monster("skeleton").statBlock);
  const ghoul = opponents(delve).find(({ id }) => id === "ghoul");
  assert.equal(ghoul.name, "Ghoul");
  assert.equal(ghoul.boss, true);
  assert.equal("boss" in monster("ghoul"), false);

  const plain = structuredClone(moduleFiles["cellar-goblin"]);
  delete plain.encounters[0].opponents[0].description;
  const [goblin] = validateModule(plain).encounters[0].opponents;
  assert.equal(goblin.name, "Goblin Warrior");
  assert.equal(goblin.description, monster("goblin-warrior").description);
});

test("the validator rejects an unknown monster, and an opponent with both a monster and a stat block", () => {
  const unknown = structuredClone(moduleFiles["tinkers-toll"]);
  opponents(unknown)[1].monster = "owlbear";
  assert.throws(
    () => validateModule(unknown),
    /module tinkers-toll encounter 2 opponent 1 \(scarred-bandit\) names bestiary monster owlbear, which is not in the bestiary\./,
  );
  const both = structuredClone(moduleFiles["cellar-goblin"]);
  opponents(both)[0].statBlock = structuredClone(
    monster("goblin-warrior").statBlock,
  );
  assert.throws(
    () => validateModule(both),
    /module cellar-goblin encounter 1 opponent 1 \(goblin\) names bestiary monster goblin-warrior and has an inline statBlock; give only one\./,
  );
  const neither = structuredClone(moduleFiles["cellar-goblin"]);
  delete opponents(neither)[0].monster;
  assert.throws(
    () => validateModule(neither),
    /opponent 1 must have id, name, description, statBlock/,
  );
});

test("a one-off inline stat block still validates and plays", async () => {
  const rat = await loadFifthAdventure(
    "tests/fixtures/smugglers-with-rat.json",
  );
  const giantRat = opponents(rat).find(
    ({ statBlock }) => statBlock.name === "Giant Rat",
  );
  assert.ok(giantRat);
  // The fixture's own rat, not the bestiary's, which has Pack Tactics.
  assert.equal(giantRat.statBlock.traits, undefined);
  const runtime = createFifthRuntime(rat, TEST_FIGHTER);
  const random = createSeededRandom(0);
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  );
  let result = runtime.handleAction(
    begun.state,
    { type: "move", destinationId: "rat-cellar" },
    random,
  );
  let fight = runtime.renderResult(result);
  for (let turn = 0; !fight.includes("The fight is over."); turn++) {
    assert.ok(turn < 20, "the fight ends");
    result = runtime.handleAction(
      result.state,
      runtime.attackTargets(result.state).length > 0
        ? { type: "attack", actorId: "pc", targetId: "giant-rat" }
        : { type: "end-turn", actorId: "pc" },
      random,
    );
    fight += `\n${runtime.renderResult(result)}`;
  }
  assert.match(fight, /Initiative: [^\n]*Giant Rat/);
  assert.match(fight, /Giant Rat (is defeated|attacks Ada)/);
});

test("the bestiary validator names its first problem", () => {
  const file = {
    kind: "dungeon-one-5e-bestiary",
    formatVersion: FIFTH_BESTIARY_FORMAT,
  };
  const goblin = monster("goblin-warrior");
  assert.throws(
    () =>
      validateFifthBestiary({
        ...file,
        monsters: [goblin, structuredClone(goblin)],
      }),
    /Invalid bestiary: duplicate monster id goblin-warrior\./,
  );
  assert.throws(
    () =>
      validateFifthBestiary({
        ...file,
        monsters: [{ ...goblin, statBlock: { ...goblin.statBlock, xp: -1 } }],
      }),
    /Invalid bestiary: monster 1 statBlock xp must be an integer/,
  );
  assert.throws(
    () => validateFifthBestiary({ kind: "dungeon-one-5e-adventure" }),
    /Invalid bestiary: not a 5e bestiary\./,
  );
});

test("a bestiary in another format version is refused by name and left unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-231-"));
  try {
    const path = join(directory, "old-bestiary.json");
    const bytes = JSON.stringify({ ...bestiary, formatVersion: 0 });
    await writeFile(path, bytes);
    await assert.rejects(loadFifthBestiary(path), (error) => {
      assert.match(
        error.message,
        /old-bestiary\.json is a 5e bestiary in format version 0, not 4\. Move it aside; the file has not been changed\./,
      );
      return true;
    });
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
