// The shipped adventure modules in adventures/5e/ (#251): each loads and
// validates, names its monsters from the bestiary, fits its treasure budget,
// qualifies at its declared difficulty, and takes its place in the browser's
// adventure list. Besides each released module's own content and release
// tests, these are the only tests that read a shipped module; engine tests
// play the fixtures in tests/fixtures/.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  FIFTH_ADVENTURE_FILES,
  findableValue,
  loadBuiltInFifthAdventures,
  orderFifthAdventures,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  gateAdventure,
  passesGate,
  qualifyAdventure,
  renderGateResult,
} from "../dist/balance-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";

const shipped = await loadBuiltInFifthAdventures();
const moduleFiles = Object.fromEntries(
  await Promise.all(
    Object.entries(FIFTH_ADVENTURE_FILES).map(async ([id, file]) => [
      id,
      JSON.parse(
        await readFile(new URL(`../adventures/5e/${file}`, import.meta.url)),
      ),
    ]),
  ),
);
const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);
const opponents = (module) =>
  module.encounters.flatMap((encounter) => encounter.opponents);

test("the built-in modules are the eight shipped ones", () => {
  assert.deepEqual(
    shipped.map(({ id }) => id),
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
});

test("the default run qualifies every shipped module within its time budget", () => {
  // CPU time, not elapsed time: this file runs in its own process, so other
  // test files running alongside it cannot push it over the budget.
  const started = process.cpuUsage();
  for (const adventure of shipped) {
    const result = qualifyAdventure(adventure);
    assert.equal(result.ok, true, adventure.id);
    assert.ok(result.report.cells.every(({ runs }) => runs === 200));
  }
  const { user, system } = process.cpuUsage(started);
  const seconds = (user + system) / 1_000_000;
  // docs/character-rules.md records the budget: well inside verify.
  assert.ok(
    seconds < 30,
    `the default run took ${seconds.toFixed(1)} s of CPU`,
  );
});

test("every shipped module qualifies at its declared difficulty", () => {
  // passesGate keeps its verdicts, so the adventure list below reuses them.
  for (const adventure of shipped) {
    if (!passesGate(adventure)) {
      assert.fail(renderGateResult(adventure, gateAdventure(adventure)));
    }
  }
});

test("every shipped opponent names its bestiary monster instead of an inline stat block (#231)", () => {
  for (const [id, module] of Object.entries(moduleFiles)) {
    for (const opponent of opponents(module)) {
      assert.equal("statBlock" in opponent, false, `${id} ${opponent.id}`);
      assert.ok(monster(opponent.monster), `${id} ${opponent.id}`);
    }
  }
  // Moving to the bestiary changed nothing: each module plays exactly as it
  // did with every stat block inline.
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

test("every shipped module's treasure fits its budget (#239)", () => {
  for (const module of shipped) {
    const budget = treasureBudget(module.recommendedLevels.max);
    assert.ok(
      findableValue(module) <= budget,
      `${module.id} is worth ${findableValue(module)} cp, over ${budget}`,
    );
  }
});

test("the barrow's goblin carries coin, authored in gold and silver (#208)", () => {
  const barrow = shipped.find(({ id }) => id === "robbers-barrow");
  const pouch = barrow.rooms
    .find(({ id }) => id === "burial-hall")
    .items.find(({ id }) => id === "coin-pouch");
  assert.deepEqual(pouch, {
    id: "coin-pouch",
    name: "Pouch of Old Coins",
    description:
      "A greasy leather pouch of tarnished coins, robbed from the barrow's dead.",
    kind: "coin",
    coins: { gp: 2, sp: 5 },
    hiddenIn: "barrow-goblin",
  });
});

test("the browser offers the shipped modules by level, then difficulty (#165)", () => {
  assert.deepEqual(
    orderFifthAdventures(shipped, passesGate).map(
      ({ id, recommendedLevels: { min, max }, difficulty }) => [
        id,
        `${min}–${max}`,
        difficulty,
      ],
    ),
    [
      ["cellar-goblin", "1–1", "hard"],
      ["robbers-barrow", "1–1", "hard"],
      ["smugglers-cellar", "1–1", "hard"],
      ["tinkers-toll", "1–1", "hard"],
      ["goblin-storeroom", "2–2", "medium"],
      ["abandoned-delve", "2–2", "hard"],
      ["warden-crypt", "2–2", "hard"],
      ["goblin-warren", "2–3", "hard"],
    ],
  );
});
