// #231: the shipped monsters live in one shared bestiary that modules name
// by id, with the module's own name and description where it gives them; a
// one-off stat block may still be authored inline.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FIFTH_BESTIARY_FORMAT,
  loadFifthBestiary,
  validateFifthBestiary,
} from "../dist/bestiary-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { bestiary, validateModule } from "./fixtures/bestiary.mjs";
import { fightRoom, moduleFile, ratTunnels } from "./fixtures/modules.mjs";
import { RENAMED_SKELETONS } from "./fixtures/renamed-skeletons.mjs";

const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);
const opponents = (module) =>
  module.encounters.flatMap((encounter) => encounter.opponents);

test("the bestiary holds the shipped monsters, the Giant Rat (#232) and the #235 additions", () => {
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
      ["kobold", "Kobold"],
      ["hobgoblin-warrior", "Hobgoblin Warrior"],
      ["bugbear-warrior", "Bugbear Warrior"],
      ["gnoll", "Gnoll Ravager"],
      ["ogre", "Ogre"],
    ],
  );
});

test("an opponent takes its monster's stat block, and its name and description unless the module gives its own", () => {
  const barracks = fightRoom("skeleton-barracks", "The Skeleton Barracks", [
    ...RENAMED_SKELETONS,
    {
      id: "ghoul",
      monster: "ghoul",
      description: "A ghoul looks up from the bunks and springs.",
      boss: true,
    },
  ]);
  const [tall, bent, ghoul] = opponents(barracks);
  assert.equal(tall.name, "Tall Skeleton");
  assert.equal(bent.name, "Bent Skeleton");
  assert.deepEqual(tall.statBlock, monster("skeleton").statBlock);
  assert.equal(ghoul.name, "Ghoul");
  assert.equal(ghoul.boss, true);
  assert.equal("boss" in monster("ghoul"), false);

  const plain = moduleFile("lone-goblin");
  delete plain.encounters[0].opponents[0].description;
  const [goblin] = validateModule(plain).encounters[0].opponents;
  assert.equal(goblin.name, "Goblin Warrior");
  assert.equal(goblin.description, monster("goblin-warrior").description);
});

test("the validator rejects an unknown monster, and an opponent with both a monster and a stat block", () => {
  const unknown = moduleFile("goblin-burrow");
  unknown.encounters[1].opponents[0].monster = "owlbear";
  assert.throws(
    () => validateModule(unknown),
    /module goblin-burrow encounter 2 opponent 1 \(goblin-boss\) names bestiary monster owlbear, which is not in the bestiary\./,
  );
  const both = moduleFile("lone-goblin");
  opponents(both)[0].statBlock = structuredClone(
    monster("goblin-warrior").statBlock,
  );
  assert.throws(
    () => validateModule(both),
    /module lone-goblin encounter 1 opponent 1 \(goblin\) names bestiary monster goblin-warrior and has an inline statBlock; give only one\./,
  );
  const neither = moduleFile("lone-goblin");
  delete opponents(neither)[0].monster;
  assert.throws(
    () => validateModule(neither),
    /opponent 1 must have id, name, description, statBlock/,
  );
});

test("a one-off inline stat block still validates and plays", () => {
  const rat = ratTunnels;
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
        new RegExp(
          String.raw`old-bestiary\.json is a 5e bestiary in format version 0, not ${FIFTH_BESTIARY_FORMAT}\. Move it aside; the file has not been changed\.`,
        ),
      );
      return true;
    });
    assert.equal(await readFile(path, "utf8"), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
