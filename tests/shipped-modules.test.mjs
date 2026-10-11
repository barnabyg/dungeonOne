// The shipped adventure modules in adventures/5e/ (#251): each loads and
// validates, names its monsters from the bestiary, fits its treasure budget,
// qualifies at its declared difficulty for every class (#310), and takes its
// place in the browser's adventure list; and a new character's career
// through them reaches the required level in every class (#290, #310), and
// the gate judges Turn Undead in every undead module (#349) and Sleep and
// Hold Person in every module (#369).
// Besides each released module's own content and release tests, these are
// the only tests that read a shipped module; engine tests play the fixtures
// in tests/fixtures/.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  DIFFICULTIES,
  FIFTH_ADVENTURE_FILES,
  findableValue,
  loadBuiltInFifthAdventures,
  orderFifthAdventures,
  validateFifthAdventure,
} from "../dist/adventure-5e.js";
import {
  DIFFICULTY_THRESHOLDS,
  GATE_CLASSES,
  gateModule,
  gateVerdictAt,
  renderGateResult,
  renderModuleGateResult,
} from "../dist/balance-5e.js";
import {
  CAREER_REQUIRED_LEVEL,
  renderCareerResult,
  simulateCareer,
} from "../dist/career-5e.js";
import { CLASSES } from "../dist/character-5e.js";
import {
  GATE_VERDICTS_PATH,
  recordGateVerdicts,
} from "../dist/gate-verdicts-5e.js";
import { TURN_UNDEAD_ID } from "../dist/encounter-5e.js";
import { creatureTypeOf } from "../dist/runtime-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { referenceCpuSeconds } from "./fixtures/cpu-reference.mjs";

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
/**
 * The modules this run gates: those `npm test -- --modules <id,id>` names
 * (scripts/run-tests.mjs passes them in DUNGEON_ONE_TEST_MODULES), or every
 * shipped module. The other gate checks read the recorded verdicts.
 */
const named = (process.env.DUNGEON_ONE_TEST_MODULES ?? "")
  .split(",")
  .filter(Boolean);
const gated =
  named.length === 0
    ? shipped
    : named.map(
        (id) =>
          shipped.find((adventure) => adventure.id === id) ??
          assert.fail(`${id} is not a shipped module`),
      );
const recorded = JSON.parse(await readFile(GATE_VERDICTS_PATH, "utf8"));
/** The least survival margin over its difficulty's threshold a module keeps (#252). */
const SURVIVAL_SLACK = 0.03;
/**
 * The reference CPU seconds the gate may take over every shipped module:
 * 150 from #348, judging four classes; 110 from #343, 100 from #342
 * (owner's choices under D12), 90 before.
 */
const GATE_BUDGET_SECONDS = 150;
const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);
const opponents = (module) =>
  module.encounters.flatMap((encounter) => encounter.opponents);

test("the built-in modules are the shipped ones (#252, #275, #289, #291, #311, #350)", () => {
  assert.deepEqual(
    shipped.map(({ id }) => id),
    [
      "abandoned-delve",
      "drowned-chapel",
      "goblin-warren",
      "gravediggers-lodge",
      "hollow-chantry",
      "mallow-counting-house",
      "ravagers-tower",
      "robbers-barrow",
      "shepherds-bothy",
      "silvervein-mine",
      "smugglers-cellar",
      "thornwood-lodge",
      "tinkers-toll",
      "warden-crypt",
      "wolfstone-hillfort",
    ],
  );
});

/** Each shipped module's full gate result for every class, reports included. */
const gates = new Map();
const gateOf = (adventure) => {
  if (!gates.has(adventure.id)) {
    gates.set(adventure.id, gateModule(adventure));
  }
  return gates.get(adventure.id);
};

test("every shipped module qualifies at its declared difficulty for every class within the gate's time budget (#310, #321, #348)", () => {
  assert.deepEqual(GATE_CLASSES, ["fighter", "rogue", "cleric", "wizard"]);
  // CPU time scaled to the reference machine (cpu-reference.mjs): runners
  // differ in speed by nearly 2×, so plain CPU seconds judge the runner.
  // The other gate tests below read the results this fills.
  const seconds = referenceCpuSeconds(() => {
    for (const adventure of gated) {
      gateOf(adventure);
    }
  });
  for (const adventure of gated) {
    const gate = gateOf(adventure);
    if (!gate.qualified) {
      assert.fail(renderModuleGateResult(adventure, gate));
    }
  }
  // docs/character-rules.md records the budget, for gating every module.
  assert.ok(
    gated !== shipped || seconds < GATE_BUDGET_SECONDS,
    `the gate took ${seconds.toFixed(1)} s of reference CPU`,
  );
});

test("the recorded gate verdicts the browser offers modules by are the gate's (#310)", async () => {
  assert.deepEqual(
    {
      ...recorded,
      verdicts: Object.fromEntries(
        Object.entries(recorded.verdicts).filter(([id]) =>
          gated.some((adventure) => adventure.id === id),
        ),
      ),
    },
    recordGateVerdicts(gated, (adventure) => gateOf(adventure).qualified),
    "adventures/5e/gate-verdicts.json is out of date: run npm run gate:verdicts",
  );
});

test("a new character's career through the shipped modules reaches the required level in every class (#290, #310, #348)", () => {
  for (const classId of GATE_CLASSES) {
    const report = simulateCareer(shipped, { classId });
    assert.equal(report.classId, classId);
    assert.equal(report.requiredLevel, CAREER_REQUIRED_LEVEL);
    assert.equal(report.ok, true, renderCareerResult(report));
    // Every shipped module is played by some career.
    assert.ok(
      report.modules.every(({ played }) => played > 0),
      renderCareerResult(report),
    );
  }
});

test("every shipped module declares the strictest difficulty every class passes with 3 points of slack (#252, #310, #348)", () => {
  // Survival must clear the threshold by at least 3 points for every class,
  // and no stricter difficulty may also pass with that slack: the label is
  // what the weakest class measures.
  for (const adventure of gated) {
    const verdicts = gateOf(adventure).classes.map(({ classId, result }) => {
      assert.equal(result.ok, true, `${adventure.id} ${classId}`);
      return result.verdict;
    });
    // A caster's survival below level 3 is reported, not judged (#348), so
    // it sets no label.
    const passes = (difficulty) =>
      verdicts.every((measures) => {
        const verdict = gateVerdictAt(measures, difficulty);
        return (
          verdict.qualified &&
          (verdict.survival.reported === true ||
            verdict.survival.rate -
              DIFFICULTY_THRESHOLDS[difficulty].survival >=
              SURVIVAL_SLACK)
        );
      });
    assert.equal(
      DIFFICULTIES.find(passes),
      adventure.difficulty,
      `${adventure.id} survives ${verdicts
        .map(({ classId, survival }) => `${survival.rate} (${classId})`)
        .join(", ")}`,
    );
  }
});

/**
 * The gate figures each module's proposal or handoff quotes, for each class
 * named: the weakest character's survival as [level, kit, rate], its
 * [level, rate] when every check fails, the ids of the ordinary enemies over
 * the one-hit-kill cap, each enemy's one-hit-kill chance in percent, and the
 * XP available. They are checked here, beside the gate run they read, rather
 * than in each module's own tests, so the gate plays each module once.
 */
const QUOTED_FIGURES = {
  // 1 point over the 98% the #252 slack rule asks of an Easy module (1.5
  // until the Champion's initiative advantage, #315, moved the dice).
  "drowned-chapel": {
    fighter: {
      survival: [3, "two-daggers", 0.99],
      overCap: [],
      enemies: [["drowned-sexton", 0.8]],
      xp: 350,
    },
  },
  // 8.5 points over Hard's 75%, and 4.5 under the 88% that would make it Medium.
  "gravediggers-lodge": {
    fighter: {
      survival: [2, "two-daggers", 0.835],
      overCap: [],
      enemies: [
        ["false-gravedigger", 2.9],
        ["risen-corpse", 0.4],
      ],
      xp: 375,
    },
  },
  // The Wizard is 2 points over Medium's 88% with its slack (92.0% when
  // every check fails). Every fight's XP, the restless dead's
  // included (#335), and the ending's 400. The Fighter's
  // found +1 Mace kills the Prior's Guard, a Skeleton, in one blow 60% of
  // the time: one of five ordinary foes over the cap.
  "hollow-chantry": {
    fighter: {
      survival: [3, "two-daggers", 0.98],
      alwaysFail: [3, 0.98],
      overCap: ["priors-guard"],
      xp: 50 + 50 + 200 + 50 + 50 + 50 + 400,
    },
    rogue: {
      survival: [3, "shortsword-and-dagger", 0.99],
      alwaysFail: [3, 0.99],
      overCap: [],
      xp: 850,
    },
    cleric: {
      survival: [3, "mace-and-daggers", 0.965],
      alwaysFail: [3, 0.965],
      overCap: [],
      xp: 850,
    },
    wizard: {
      survival: [3, "quarterstaff-and-dagger", 0.9],
      alwaysFail: [3, 0.92],
      overCap: [],
      xp: 850,
    },
  },
  // The Fighter is 5.5 points over Medium's 85% with its slack (83.0% and
  // 81.5% when every check fails until short rests, #334; 81.5% until the
  // Champion's initiative advantage, #315). Every fight's XP and the
  // ending's 400.
  "mallow-counting-house": {
    fighter: {
      survival: [3, "mace", 0.905],
      alwaysFail: [3, 0.905],
      overCap: [],
      xp: 200 + 50 + 200 + 400,
    },
    rogue: {
      survival: [3, "shortsword", 0.975],
      alwaysFail: [3, 0.975],
      overCap: [],
      xp: 200 + 50 + 200 + 400,
    },
  },
  // The Fighter is 6 points over Hard's 75%, and 7 under the 88% that would
  // make it Medium (82.0% until the Champion's initiative advantage, #315;
  // 81.5% until the third potion, #348). The Cleric, 1.5 points over Hard's
  // 78% with its slack (76.5% with two potions), spends its slots early.
  "ravagers-tower": {
    fighter: {
      survival: [3, "mace", 0.81],
      overCap: [],
      enemies: [["tower-gnoll", 0]],
      xp: 600,
    },
    cleric: {
      survival: [3, "mace-and-daggers", 0.795],
      overCap: [],
      xp: 600,
    },
  },
  "shepherds-bothy": {
    fighter: {
      survival: [2, "mace", 1],
      overCap: [],
      enemies: [["bothy-bandit", 2.9]],
      xp: 225,
    },
  },
  // Both kobolds and the Skeleton: three of six, no more than half.
  "silvervein-mine": {
    fighter: {
      survival: [2, "mace", 0.925],
      overCap: ["kobold-lookout", "kobold-tunneller", "miners-bones"],
      enemyCount: 6,
      xp: 862,
    },
  },
  // The Fighter is 8.5 points over the 88% that would make it Medium (4
  // until the Champion's initiative advantage, #315); the Rogue, 10.5 over
  // Hard's 75% and 2.5 under 88%, keeps it Hard. One of four ordinary
  // enemies is over the cap, under the more-than-half that fails it. Every
  // fight's XP and the spoils' 2,350.
  "thornwood-lodge": {
    fighter: {
      survival: [4, "mace", 0.965],
      alwaysFail: [4, 0.965],
      overCap: ["kennel-mastiff"],
      xp: 200 + 25 + 200 + 700 + 700 + 2350,
    },
    rogue: {
      survival: [4, "shortsword", 0.855],
      alwaysFail: [4, 0.855],
      overCap: ["kennel-mastiff"],
      xp: 200 + 25 + 200 + 700 + 700 + 2350,
    },
  },
  // Level 4 and Medium since #348: at level 3 the weakest Cleric survived
  // the dire wolf 74.0%, under Hard. At level 4 the Wizard, 93.5%, sets it:
  // 5.5 points over Medium's 88% with its slack, 4.5 under Easy's. (At
  // level 3 the Fighter survived 81.0%: 80.5% until short rests, #334; 83.0%
  // and 84.0% until the Champion's initiative advantage, #315.) Every
  // fight's XP and the plunder's 500.
  "wolfstone-hillfort": {
    fighter: {
      survival: [4, "mace", 0.97],
      alwaysFail: [4, 0.97],
      overCap: [],
      xp: 200 + 200 + 450 + 500,
    },
    cleric: {
      survival: [4, "mace-and-daggers", 0.95],
      alwaysFail: [4, 0.95],
      overCap: [],
      xp: 200 + 200 + 450 + 500,
    },
    wizard: {
      survival: [4, "quarterstaff-and-dagger", 0.935],
      alwaysFail: [4, 0.935],
      overCap: [],
      xp: 200 + 200 + 450 + 500,
    },
  },
};

test("the gate gives each released module the figures its proposal quotes (#241, #275, #289, #291, #311)", () => {
  for (const [id, classes] of Object.entries(QUOTED_FIGURES)) {
    const adventure = gated.find((entry) => entry.id === id);
    if (adventure === undefined) {
      continue;
    }
    const gate = gateOf(adventure);
    for (const [classId, quoted] of Object.entries(classes)) {
      const { verdict } = gate.classes.find(
        (entry) => entry.classId === classId,
      ).result;
      const label = `${id} ${classId}`;
      const { survival, alwaysFail, oneHitKill, xp } = verdict;
      assert.deepEqual(
        [survival.level, survival.kit, survival.rate],
        quoted.survival,
        label,
      );
      if (quoted.alwaysFail !== undefined) {
        assert.deepEqual(
          [alwaysFail.level, alwaysFail.rate],
          quoted.alwaysFail,
          label,
        );
      }
      assert.deepEqual(
        oneHitKill.overCap.map(({ opponentId }) => opponentId),
        quoted.overCap,
        label,
      );
      if (quoted.enemies !== undefined) {
        assert.deepEqual(
          oneHitKill.enemies.map(({ opponentId, chance }) => [
            opponentId,
            Math.round(chance * 1000) / 10,
          ]),
          quoted.enemies,
          label,
        );
      }
      if (quoted.enemyCount !== undefined) {
        assert.equal(oneHitKill.enemies.length, quoted.enemyCount, label);
      }
      assert.equal(xp.available, quoted.xp, label);
    }
  }
});

/**
 * Turn Undead in each shipped module with undead opponents (#349): the cap
 * the module's difficulty sets and, for each ordinary undead enemy, the
 * Cleric's chance in percent that one use at the fight's opening keeps it
 * out of the fight (the figures docs/character-rules.md quotes).
 */
const TURN_UNDEAD_FIGURES = {
  "abandoned-delve": {
    cap: 0.4,
    enemies: [
      ["zombie", 27.5],
      ["skeleton-sergeant", 34.3],
      ["skeleton-guard", 34.3],
    ],
  },
  "drowned-chapel": { cap: 0.5, enemies: [["drowned-sexton", 27.5]] },
  "gravediggers-lodge": { cap: 0.3, enemies: [["risen-corpse", 27.5]] },
  "hollow-chantry": {
    cap: 0.4,
    enemies: [
      ["dead-sexton", 27.5],
      ["charnel-corpse", 27.5],
      ["ossuary-ghoul", 27.5],
      ["priors-guard", 34.3],
      ["wandering-corpse", 27.5],
    ],
  },
  "silvervein-mine": {
    cap: 0.4,
    enemies: [
      ["drowned-miner", 27.5],
      ["miners-bones", 34.3],
    ],
  },
  "warden-crypt": { cap: 0.4, enemies: [["risen-warden", 27.5]] },
};

test("in every undead module the gate judges the Cleric's Turn Undead against the control cap (#348, #349)", () => {
  const undeadIn = (adventure) =>
    opponents(adventure)
      .filter(
        ({ boss, statBlock }) =>
          boss !== true && creatureTypeOf(statBlock.type) === "undead",
      )
      .map(({ id }) => id);
  assert.deepEqual(
    shipped
      .filter((adventure) => undeadIn(adventure).length > 0)
      .map(({ id }) => id),
    Object.keys(TURN_UNDEAD_FIGURES),
  );
  for (const adventure of gated) {
    const quoted = TURN_UNDEAD_FIGURES[adventure.id];
    if (quoted === undefined) {
      continue;
    }
    const { control } = gateOf(adventure).classes.find(
      ({ classId }) => classId === "cleric",
    ).result.verdict;
    assert.ok(control, `${adventure.id} judges no control`);
    assert.equal(control.ok, true, adventure.id);
    assert.equal(control.cap, quoted.cap, adventure.id);
    const undead = undeadIn(adventure);
    assert.deepEqual(
      control.enemies
        .filter(({ opponentId }) => undead.includes(opponentId))
        .map(({ opponentId, control: used, chance }) => [
          opponentId,
          used,
          Math.round(chance * 1000) / 10,
        ]),
      quoted.enemies.map(([id, chance]) => [id, TURN_UNDEAD_ID, chance]),
      adventure.id,
    );
  }
});

test("in every shipped module the gate judges the casters' Sleep and Hold Person, and no ordinary foe is over the cap (#369)", () => {
  for (const adventure of gated) {
    for (const classId of ["wizard", "cleric"]) {
      const { control } = gateOf(adventure).classes.find(
        (entry) => entry.classId === classId,
      ).result.verdict;
      const label = `${adventure.id} ${classId}`;
      if (classId === "wizard") {
        // Sleep is a 1st-level spell: every Wizard has it.
        assert.ok(control, `${label} judges no control`);
      }
      if (control === undefined) {
        continue;
      }
      assert.equal(control.ok, true, label);
      // Sleep's saves with advantage keep every foe under; no shipped module
      // at level 3 or more has an ordinary humanoid for Hold Person.
      assert.deepEqual(control.overCap, [], label);
      assert.ok(
        control.enemies.every(
          ({ control: used, chance }) => used !== "hold-person" || chance === 0,
        ),
        label,
      );
    }
  }
});

/** `text` as a regular expression that matches it literally. */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

test("the gate names every class and reports the stealth-first style for every shipped module (#302, #310, #348)", () => {
  for (const adventure of gated) {
    const gate = gateOf(adventure);
    assert.deepEqual(
      gate.classes.map(({ classId }) => classId),
      GATE_CLASSES,
    );
    const text = renderModuleGateResult(adventure, gate);
    for (const { classId, result } of gate.classes) {
      const { name } = CLASSES[classId];
      assert.match(
        text,
        new RegExp(
          `^${literal(`${adventure.title} (${adventure.id}) qualifies as ${adventure.difficulty} for the ${name}.`)}$`,
          "mu",
        ),
      );
      const { stealthFirst } = result.verdict;
      assert.equal(stealthFirst.style, "stealth-first", adventure.id);
      assert.equal(stealthFirst.runs, 200, adventure.id);
      assert.match(
        renderGateResult(adventure, result),
        new RegExp(
          `^ {2}Stealth-first, reported \\(not judged\\): the level \\d, 5th percentile ${name} playing stealth-first survived \\d+\\.\\d% of 200 runs .*; over every kit and level it completed \\d+\\.\\d%, slipped past \\d+\\.\\d fights and earned \\d+\\.\\d XP a run\\.$`,
          "mu",
        ),
        adventure.id,
      );
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

test("each module designed against the budget holds 75–100% of it as a mixed hoard (#252)", () => {
  // The Delve and the Mine keep their shipped treasure; the others were
  // designed against the budget with more than one class of gem or art object.
  for (const id of [
    "drowned-chapel",
    "goblin-warren",
    "gravediggers-lodge",
    "hollow-chantry",
    "mallow-counting-house",
    "ravagers-tower",
    "robbers-barrow",
    "shepherds-bothy",
    "smugglers-cellar",
    "thornwood-lodge",
    "tinkers-toll",
    "warden-crypt",
    "wolfstone-hillfort",
  ]) {
    const module = shipped.find((adventure) => adventure.id === id);
    const budget = treasureBudget(module.recommendedLevels.max);
    const value = findableValue(module);
    assert.ok(
      value >= budget * 0.75 && value <= budget,
      `${id} is worth ${value} cp of ${budget}`,
    );
    const classes = new Set(
      module.rooms.flatMap(({ items }) =>
        items.flatMap(({ treasure }) =>
          treasure === undefined ? [] : [treasure],
        ),
      ),
    );
    assert.ok(classes.size >= 2, `${id} holds ${[...classes].join(", ")}`);
  }
});

test("only bestiary monsters with a treasure type carry loot in the shipped modules (#240)", () => {
  // Undead and beasts carry none: the Delve's purse and goblet and the
  // Warren's potion lie in the room, and the Toll's tolls are in the strongbox.
  const carriers = shipped.flatMap((adventure) =>
    adventure.rooms.flatMap(({ items }) =>
      items.flatMap(({ id, hiddenIn }) =>
        adventure.encounters.some(({ opponents }) =>
          opponents.some((opponent) => opponent.id === hiddenIn),
        )
          ? [`${adventure.id}/${id}@${hiddenIn}`]
          : [],
      ),
    ),
  );
  assert.deepEqual(carriers.sort(), [
    "goblin-warren/boss-chain@goblin-boss",
    "gravediggers-lodge/false-gravedigger-coins@false-gravedigger",
    "mallow-counting-house/clerk-eater-coins@clerk-eater",
    "mallow-counting-house/clerk-eater-trinket@clerk-eater",
    "mallow-counting-house/soot-goblin-coins@soot-goblin",
    "mallow-counting-house/strongroom-key@clerk-eater",
    "ravagers-tower/tower-gnoll-coins@tower-gnoll",
    "robbers-barrow/barrow-robber-coins@barrow-robber",
    "shepherds-bothy/bothy-bandit-coins@bothy-bandit",
    "silvervein-mine/bugbear-overseer-coins@bugbear-overseer",
    "silvervein-mine/bugbear-overseer-trinket@bugbear-overseer",
    "silvervein-mine/iron-key@kobold-tunneller",
    "silvervein-mine/kobold-lookout-coins@kobold-lookout",
    "silvervein-mine/kobold-tunneller-coins@kobold-tunneller",
    "thornwood-lodge/captain-hesk-coins@captain-hesk",
    "wolfstone-hillfort/wolfstone-reaver-coins@wolfstone-reaver",
  ]);
});

test("the browser offers the shipped modules by level, then difficulty (#165)", () => {
  assert.deepEqual(
    orderFifthAdventures(shipped, (adventure) =>
      gated.includes(adventure)
        ? gateOf(adventure).qualified
        : recorded.verdicts[adventure.id].qualified,
    ).map(({ id, recommendedLevels: { min, max }, difficulty }) => [
      id,
      `${min}–${max}`,
      difficulty,
    ]),
    [
      ["robbers-barrow", "1–1", "medium"],
      ["smugglers-cellar", "1–1", "hard"],
      ["tinkers-toll", "1–1", "hard"],
      ["shepherds-bothy", "2–2", "easy"],
      ["abandoned-delve", "2–2", "medium"],
      ["warden-crypt", "2–2", "medium"],
      ["gravediggers-lodge", "2–2", "hard"],
      ["silvervein-mine", "2–3", "medium"],
      ["drowned-chapel", "3–3", "easy"],
      ["goblin-warren", "3–3", "medium"],
      ["hollow-chantry", "3–3", "medium"],
      ["ravagers-tower", "3–3", "hard"],
      ["mallow-counting-house", "3–4", "medium"],
      // Level 4 and Medium since #348 (levels 3–4 and Hard before).
      ["wolfstone-hillfort", "4–4", "medium"],
      ["thornwood-lodge", "4–5", "hard"],
    ],
  );
});
