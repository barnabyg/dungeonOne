// The shipped adventure modules in adventures/5e/ (#251): each loads and
// validates, names its monsters from the bestiary, fits its treasure budget,
// qualifies at its declared difficulty for every class (#310), and takes its
// place in the browser's adventure list; and a new character's career
// through them reaches the required level in every class (#290, #310), and
// the gate judges Turn Undead in every undead module (#349) and Sleep and
// Hold Person in every module (#369); and the mapping tool draws each with
// no layout error (#456).
// Besides each released module's own content and release tests, these are
// the only tests that read a shipped module; engine tests play the fixtures
// in tests/fixtures/.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { MONSTER_ICONS, OPPONENT_ICON } from "../dist/icons-5e.js";
import { createFifthRuntime, creatureTypeOf } from "../dist/runtime-5e.js";
import { TRADE_GOOD_LIMITS, treasureBudget } from "../dist/treasure-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { ada } from "./fixtures/playthroughs.mjs";
import { gateInWorkers, JOB_TIMEOUT_MS } from "./fixtures/gate-workers.mjs";
import { main as drawMap } from "../scripts/map-5e.mjs";

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
const monster = (id) => bestiary.monsters.find((entry) => entry.id === id);
const opponents = (module) =>
  module.encounters.flatMap((encounter) => encounter.opponents);

test("the built-in modules are the four shipped ones (#437, #446)", () => {
  assert.deepEqual(
    shipped.map(({ id }) => id),
    [
      "abandoned-delve",
      "bramblecote-cider-house",
      "coldwater-weirgate",
      "thornwood-lodge",
    ],
  );
});

test("leaving any shipped module at its start warns of the objective's award lost (#475)", () => {
  const objectives = {
    "abandoned-delve": [
      "You have found no treasure or coin here to carry out.",
      "Out with the loot",
      600,
    ],
    "bramblecote-cider-house": [
      "You have found no treasure or coin here to carry out.",
      "Out with the Pells' goods",
      300,
    ],
    "coldwater-weirgate": [
      "Objective not met: Break Grisk's hold on the weirgate's gear hall, so the sluices can open and Fennick's fields drain.",
      "The sluices open",
      1800,
    ],
    "thornwood-lodge": [
      "You have found no treasure or coin here to carry out.",
      "Out with the spoils",
      3800,
    ],
  };
  for (const module of shipped) {
    const runtime = createFifthRuntime(module, ada);
    const begun = runtime.handleAction(runtime.createSession(), {
      type: "begin",
    }).state;
    const { leaving } = runtime
      .projectActions(begun)
      .find(({ action }) => action === "leave");
    const [unmet, title, xp] = objectives[module.id];
    assert.equal(
      leaving.warning,
      `${unmet} Leaving now gives up the ${xp} XP for “${title}”. You keep the XP for any fights you have won.`,
      module.id,
    );
  }
});

test("every shipped region names a backdrop (#517)", () => {
  for (const module of shipped) {
    assert.ok(module.regions.length > 0, module.id);
    for (const region of module.regions) {
      assert.ok(region.backdrop, `${module.id} region ${region.id}`);
    }
  }
});

test("the mapping tool draws every shipped module by id with no layout error (#456)", async (t) => {
  const outDir = await mkdtemp(join(tmpdir(), "dungeon-456-shipped-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  for (const id of Object.keys(FIFTH_ADVENTURE_FILES)) {
    let text = "";
    const output = { write: (chunk) => (text += chunk) };
    assert.equal(await drawMap([id], { output, outDir }), 0, text);
    assert.match(text, /\nNo layout errors\.\n/u, id);
    assert.ok((await stat(join(outDir, `${id}.svg`))).isFile(), id);
  }
});

/** Each shipped module's full gate result for every class, reports included. */
const gates = new Map();
const gateOf = (adventure) => {
  if (!gates.has(adventure.id)) {
    gates.set(adventure.id, gateModule(adventure));
  }
  return gates.get(adventure.id);
};

test("every shipped opponent shows its own monster's icon (#377)", () => {
  for (const adventure of shipped) {
    for (const { opponents } of adventure.encounters) {
      for (const { id, icon } of opponents) {
        assert.notEqual(icon, OPPONENT_ICON, `${adventure.id} ${id}`);
      }
    }
  }
});

// Gated on worker threads (gate-workers.mjs), each module for each class
// stopped and failed past its timeout: a hang guard, not a performance
// budget (#469). This test's own timeout is a job's twice over, so a frozen
// job fails first, naming its module and class. The other gate tests
// below read the results this fills.
test(
  "every shipped module qualifies at its declared difficulty for every class (#310, #321, #348, #410, #412, #440, #443, #445, #447, #469)",
  { timeout: 2 * JOB_TIMEOUT_MS + 60_000 },
  async (t) => {
    assert.deepEqual(GATE_CLASSES, ["fighter", "rogue", "cleric", "wizard"]);
    const started = performance.now();
    for (const [id, gate] of await gateInWorkers(gated)) {
      gates.set(id, gate);
    }
    // For information only: the log shows how long each run's gate took.
    t.diagnostic(
      `the gate took ${((performance.now() - started) / 1000).toFixed(1)} s`,
    );
    for (const adventure of gated) {
      const gate = gateOf(adventure);
      if (!gate.qualified) {
        assert.fail(renderModuleGateResult(adventure, gate));
      }
    }
  },
);

test("a gate job still running at its timeout is stopped and fails, naming its module and class (#469)", async () => {
  // No module gates in a tenth of a second; the first job is the Fighter's.
  const bramblecote = shipped.find(
    ({ id }) => id === "bramblecote-cider-house",
  );
  const gating = gateInWorkers([bramblecote], { workers: 1, timeoutMs: 100 });
  await assert.rejects(gating, {
    message:
      "Gating bramblecote-cider-house for the fighter ran past its 0.1-second timeout and was stopped.",
  });
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

test("a new character's career through the shipped modules reaches the required level in every class (#290, #310, #348, #404, #412)", () => {
  // The Coldwater Weirgate, a long module, takes its place in the order like
  // any other (#404).
  for (const classId of GATE_CLASSES) {
    const report = simulateCareer(shipped, { classId });
    assert.equal(report.classId, classId);
    assert.equal(report.requiredLevel, CAREER_REQUIRED_LEVEL);
    assert.equal(report.ok, true, renderCareerResult(report));
    // Every module is played by some career.
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
 * the one-hit-kill cap, each enemy's one-hit-kill chance in percent, the XP
 * available, and each declared route's and region sweep's survival as
 * [id, level, kit, rate]. They are checked here, beside the gate run they read, rather
 * than in each module's own tests, so the gate plays each module once. A
 * speed-up of the gate must leave every one as it is (#410).
 */
const QUOTED_FIGURES = {
  // Long and level 2 (#442): Medium since Last Stand (#499), as the Rogue's
  // weakest is 94.5% overall and 93.5% on each route, over the 88% Medium
  // needs with its slack and under Easy's 98% (88.0% and 86.5% before
  // Undead Fortitude's DC rose with each rise). The Vault became avoidable
  // when its ghoul held the Crypts sweep to 68.5%.
  // The two skeletons of seven ordinary foes are over the cap. Every
  // fight's XP, the wandering zombie's included, and the ending's 600.
  "abandoned-delve": {
    fighter: {
      survival: [2, "mace", 0.965],
      alwaysFail: [2, 0.965],
      overCap: ["skeleton-sergeant", "skeleton-guard"],
      enemyCount: 7,
      xp: 50 + 100 + 50 + 200 + 200 + 25 + 50 + 600,
    },
    rogue: {
      survival: [2, "shortsword", 0.945],
      alwaysFail: [2, 0.915],
      overCap: [],
      xp: 1275,
    },
  },
  // Long and level 1 (#440): Medium, as the Rogue's 94.5% is 6.5 points
  // over the 88% Medium needs with its slack and under Easy's 98%. Brack,
  // Nib and Wick of seven ordinary foes are over the cap, no more than half.
  // Every fight's XP, Wick's 25 for sparing him counted as the greater
  // (#238), and the ending's 300.
  "bramblecote-cider-house": {
    fighter: {
      survival: [1, "two-daggers", 0.985],
      alwaysFail: [1, 0.985],
      overCap: ["brack", "nib", "wick"],
      enemyCount: 7,
      xp: 25 + 25 + 50 + (12 + 25) + 25 + 25 + 50 + 300,
    },
    rogue: {
      survival: [1, "shortsword", 0.945],
      alwaysFail: [1, 0.945],
      overCap: ["brack", "nib", "wick"],
      xp: 537,
    },
  },
  // Long (#412), levels 3–4 since #443: Medium, as the Wizard's 95.0% at
  // level 3 when every check fails is 10.0 points over the 85% Medium needs
  // (the Cleric's 91.5% was, before its chain shirt and shield, #541), and
  // it and the Fighter's 96.5% are under the 98% Easy needs with its slack.
  // Three kobolds of 15 ordinary foes are over the cap at level 4, the level
  // too easy judges; the survival figures are level 3's. Every fight's XP,
  // the wandering ones' included, and the ending's 1,800 (500 before).
  "coldwater-weirgate": {
    fighter: {
      survival: [3, "mace", 0.965],
      alwaysFail: [3, 0.965],
      overCap: ["kobold-1", "kobold-2", "kobold-3"],
      enemyCount: 15,
      xp: 25 + 50 + 50 + 25 + 75 + 200 + 450 + 100 + 200 + 50 + 50 + 1800,
      routes: [
        ["keepers-stair", 3, "mace", 0.965],
        ["drained-culvert", 3, "mace", 0.96],
      ],
      sweeps: [
        ["keep", 3, "mace", 0.99],
        ["culverts", 3, "mace", 0.965],
      ],
    },
    rogue: {
      survival: [3, "shortsword-and-dagger", 0.995],
      alwaysFail: [3, 0.99],
      overCap: ["kobold-1", "kobold-2", "kobold-3"],
      xp: 3075,
      routes: [
        ["keepers-stair", 3, "shortsword-and-dagger", 0.995],
        ["drained-culvert", 3, "shortsword-and-dagger", 0.99],
      ],
      sweeps: [
        ["keep", 3, "shortsword-and-dagger", 0.985],
        ["culverts", 3, "shortsword-and-dagger", 0.995],
      ],
    },
    cleric: {
      survival: [3, "mace-and-shield", 0.975],
      alwaysFail: [3, 0.975],
      overCap: ["kobold-1", "kobold-2", "kobold-3"],
      xp: 3075,
      routes: [
        ["keepers-stair", 3, "mace-and-shield", 0.975],
        ["drained-culvert", 3, "mace-and-shield", 0.98],
      ],
      sweeps: [
        ["keep", 3, "mace-and-shield", 0.955],
        ["culverts", 3, "mace-and-shield", 0.975],
      ],
    },
    // The Wizard finds the keeper's wand on its way (#540).
    wizard: {
      survival: [3, "quarterstaff-and-dagger", 0.96],
      alwaysFail: [3, 0.95],
      overCap: ["kobold-1", "kobold-2", "kobold-3"],
      xp: 3075,
      routes: [
        ["keepers-stair", 3, "quarterstaff-and-dagger", 0.96],
        ["drained-culvert", 3, "quarterstaff-and-dagger", 0.985],
      ],
      sweeps: [
        ["keep", 3, "quarterstaff-and-dagger", 0.945],
        ["culverts", 3, "quarterstaff-and-dagger", 0.96],
      ],
    },
  },
  // Long and levels 4–5 since its expansion (#445): Hard, as the Rogue's
  // 87.0% on the lodge-hall route is 12.0 points over Hard's 75% and under
  // the 88% Medium needs with its slack (the Cleric's 86.5% was too, before
  // its chain shirt and shield, #541). Each
  // route and sweep holds one fight; the hall's bear is fed. At level 5 the
  // two mastiffs and the crag wolf of nine ordinary foes are over the cap
  // (the mastiffs alone for the Cleric), no more than half. Every fight's
  // XP, the wandering ones' included, and the spoils' 3,800 (2,350
  // before).
  "thornwood-lodge": {
    fighter: {
      survival: [4, "two-daggers", 0.97],
      alwaysFail: [4, 0.97],
      overCap: ["kennel-mastiff", "loose-mastiff", "crag-wolf"],
      enemyCount: 9,
      xp: 200 + 25 + 200 + 700 + 700 + 200 + 200 + 200 + 450 + 25 + 50 + 3800,
      routes: [
        ["lodge-hall", 4, "two-daggers", 0.97],
        ["wolfstone-gate", 4, "mace", 0.98],
      ],
      sweeps: [
        ["lodge", 4, "two-daggers", 0.97],
        ["wolfstone", 4, "mace", 0.98],
      ],
    },
    rogue: {
      survival: [4, "shortsword", 0.87],
      alwaysFail: [4, 0.87],
      overCap: ["kennel-mastiff", "loose-mastiff", "crag-wolf"],
      xp: 6750,
      routes: [
        ["lodge-hall", 4, "shortsword", 0.87],
        ["wolfstone-gate", 4, "shortsword-and-dagger", 0.975],
      ],
      sweeps: [
        ["lodge", 4, "shortsword", 0.87],
        ["wolfstone", 4, "shortsword-and-dagger", 0.975],
      ],
    },
    cleric: {
      survival: [4, "mace-and-shield", 0.93],
      alwaysFail: [4, 0.93],
      overCap: ["kennel-mastiff", "loose-mastiff"],
      xp: 6750,
      routes: [
        ["lodge-hall", 4, "mace-and-shield", 0.93],
        ["wolfstone-gate", 4, "mace-and-shield", 0.975],
      ],
      sweeps: [
        ["lodge", 4, "mace-and-shield", 0.93],
        ["wolfstone", 4, "mace-and-shield", 0.975],
      ],
    },
    wizard: {
      survival: [4, "quarterstaff-and-dagger", 0.94],
      alwaysFail: [4, 0.94],
      overCap: ["kennel-mastiff", "loose-mastiff", "crag-wolf"],
      xp: 6750,
      routes: [
        ["lodge-hall", 4, "quarterstaff-and-dagger", 0.94],
        ["wolfstone-gate", 4, "quarterstaff-and-dagger", 0.955],
      ],
      sweeps: [
        ["lodge", 4, "quarterstaff-and-dagger", 0.94],
        ["wolfstone", 4, "quarterstaff-and-dagger", 0.955],
      ],
    },
  },
};

test("the gate gives each released module the figures its proposal quotes (#291, #410, #412, #440, #442, #443, #445)", () => {
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
      // Each declared route's and region sweep's figures (#445), where quoted.
      const figures = ({ level, kit, rate }) => [level, kit, rate];
      if (quoted.routes !== undefined) {
        assert.deepEqual(
          verdict.routes.map(({ id: route, survival: way }) => [
            route,
            ...figures(way),
          ]),
          quoted.routes,
          label,
        );
      }
      if (quoted.sweeps !== undefined) {
        assert.deepEqual(
          verdict.sweeps.map(({ region, survival: way }) => [
            region,
            ...figures(way),
          ]),
          quoted.sweeps,
          label,
        );
      }
    }
  }
});

/**
 * Turn Undead in each shipped module with undead opponents (#349): the cap
 * the module's difficulty sets and, for each ordinary undead enemy, the
 * Cleric's chance in percent that one use at the fight's opening keeps it
 * out of the fight, pinned here so a change that moves them is noticed.
 */
const TURN_UNDEAD_FIGURES = {
  // Medium's cap since #499 (Hard's 0.3 before).
  "abandoned-delve": {
    cap: 0.4,
    enemies: [
      ["zombie", 27.5],
      ["skeleton-sergeant", 34.3],
      ["skeleton-guard", 34.3],
      ["dead-delver", 27.5],
    ],
  },
  // At level 4 since #443 (27.5% each at level 3).
  "coldwater-weirgate": {
    cap: 0.4,
    enemies: [
      ["drowned-wheelwright", 34.3],
      ["guildsman-1", 34.3],
      ["guildsman-2", 34.3],
      ["wandering-guildsman", 34.3],
    ],
  },
};

test("in every undead module the gate judges the Cleric's Turn Undead against the control cap (#348, #349)", () => {
  // A Cleric gains Channel Divinity at level 2 (SRD 5.2), so a level-1
  // module's undead (the Bramblecote Cider House's zombie, #440) are never
  // turned and the gate judges no control there.
  const CHANNEL_DIVINITY_LEVEL = 2;
  const undeadIn = (adventure) =>
    adventure.recommendedLevels.max < CHANNEL_DIVINITY_LEVEL
      ? []
      : opponents(adventure)
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

/**
 * Hold Person's chance in percent of keeping each ordinary humanoid foe out
 * of the fight, for the Cleric and the Wizard (#369), in the one shipped
 * module of level 3 or more with such foes (#412): the Lockjaw bandits.
 */
const HOLD_PERSON_FIGURES = {
  // At level 4 since #443 (27.5% each at level 3).
  "coldwater-weirgate": [
    ["sergeant-larrow", 34.3],
    ["bunk-bandit-1", 34.3],
    ["bunk-bandit-2", 34.3],
    ["lookout", 34.3],
    ["patrol-bandit-1", 34.3],
    ["patrol-bandit-2", 34.3],
  ],
};

/** The ordinary foes one control takes out over the cap, by module and class. */
const CONTROL_OVER_CAP = {
  // At level 4 since #443, Sleep takes the kobolds and Old Sullage out
  // 41.0% of the time: four of fifteen foes, no more than half.
  "coldwater-weirgate wizard": [
    ["kobold-1", "sleep"],
    ["kobold-2", "sleep"],
    ["kobold-3", "sleep"],
    ["old-sullage", "sleep"],
  ],
  // Since #445, Sleep takes the Reaver's Gaoler out 31.6% of the time: one
  // of nine foes.
  "thornwood-lodge wizard": [["reavers-gaoler", "sleep"]],
};

test("in every shipped module the gate judges the casters' Sleep and Hold Person, and only the pinned ordinary foes are over the cap (#369, #412, #442, #443, #445)", () => {
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
      // Hold Person's saves each turn keep the one module's bandits under
      // the cap. The foes over it are pinned: Sleep at level 4 in the
      // Weirgate (#443), and Sleep on the Lodge's Gaoler (#445). Turn Undead
      // on the Delve's skeletons, 34.3%, was over Hard's cap (#442) and is
      // under Medium's since #499.
      assert.deepEqual(
        control.overCap.map(({ opponentId, control: used }) => [
          opponentId,
          used,
        ]),
        CONTROL_OVER_CAP[`${adventure.id} ${classId}`] ?? [],
        label,
      );
      assert.deepEqual(
        control.enemies
          .filter(
            ({ control: used, chance }) => used === "hold-person" && chance > 0,
          )
          .map(({ opponentId, chance }) => [
            opponentId,
            Math.round(chance * 1000) / 10,
          ]),
        HOLD_PERSON_FIGURES[adventure.id] ?? [],
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
      // Its monster's icon goes with it (#377).
      opponent.icon ??= MONSTER_ICONS[opponent.monster];
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
    const budget = treasureBudget(module.recommendedLevels.max, module.long);
    assert.ok(
      findableValue(module) <= budget,
      `${module.id} is worth ${findableValue(module)} cp, over ${budget}`,
    );
  }
});

test("every shipped module holds 75–100% of its budget, a mixed hoard from level 3 (#252, #446)", () => {
  // Each was designed against the budget; from level 3, where gems and art
  // objects aren't counted, with more than one class of them.
  for (const module of shipped) {
    const { id } = module;
    const budget = treasureBudget(module.recommendedLevels.max, module.long);
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
    if (TRADE_GOOD_LIMITS[module.recommendedLevels.max] === undefined) {
      assert.ok(classes.size >= 2, `${id} holds ${[...classes].join(", ")}`);
    }
  }
});

test("only bestiary monsters with a treasure type carry loot in the shipped modules (#240)", () => {
  // Undead and beasts carry none: the Delve's purse and goblet lie in the
  // room.
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
    "abandoned-delve/mags-corrow-coins@mags-corrow",
    "bramblecote-cider-house/corran-vey-coins@corran-vey",
    "bramblecote-cider-house/nib-coins@nib",
    "bramblecote-cider-house/snagtooth-coins@snagtooth",
    "bramblecote-cider-house/strongroom-key@wick",
    "bramblecote-cider-house/wick-coins@wick",
    "coldwater-weirgate/bunk-bandit-1-coins@bunk-bandit-1",
    "coldwater-weirgate/bunk-bandit-2-coins@bunk-bandit-2",
    "coldwater-weirgate/grate-key@sergeant-larrow",
    "coldwater-weirgate/kobold-1-coins@kobold-1",
    "coldwater-weirgate/kobold-2-coins@kobold-2",
    "coldwater-weirgate/kobold-3-coins@kobold-3",
    "coldwater-weirgate/lookout-coins@lookout",
    "coldwater-weirgate/old-sullage-coins@old-sullage",
    "coldwater-weirgate/sergeant-larrow-coins@sergeant-larrow",
    "thornwood-lodge/captain-hesk-coins@captain-hesk",
    "thornwood-lodge/reavers-gaoler-coins@reavers-gaoler",
    "thornwood-lodge/reavers-gaoler-trinket@reavers-gaoler",
    "thornwood-lodge/wolfstone-reaver-coins@wolfstone-reaver",
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
      ["bramblecote-cider-house", "1–1", "medium"],
      // Medium since #499's Last Stand; Hard from #442 (its expansion).
      ["abandoned-delve", "2–2", "medium"],
      // Levels 3–4 since #443 (level 3 before).
      ["coldwater-weirgate", "3–4", "medium"],
      ["thornwood-lodge", "4–5", "hard"],
    ],
  );
});
