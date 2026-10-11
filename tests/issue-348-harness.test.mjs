// #348: the balance harness's caster policies (conserve, the gate's, and
// spend-early), the too-easy measures for casters (the best repeatable
// attack with a cantrip, levelled damage spells reported, control judged),
// and the gate over every class creation offers.
import assert from "node:assert/strict";
import test from "node:test";

import {
  CASTER_JUDGED_LEVEL,
  CASTING_POLICIES,
  castValue,
  characterAtLevel,
  CONTROL_TURNS,
  controlChance,
  GATE_CLASSES,
  gateAdventure,
  gateModule,
  gateVerdictAt,
  percentileCharacters,
  playAdventure,
  renderGateResult,
  spellKillChance,
} from "../dist/balance-5e.js";
import {
  characterProfile,
  CLASSES,
  OFFERED_CLASS_IDS,
} from "../dist/character-5e.js";
import { statBlockSaves } from "../dist/adventure-5e.js";
import { combatant } from "../dist/encounter-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { SPELLS } from "../dist/spells-5e.js";
import { testCasterAt } from "../dist/test-caster-5e.js";
import { bestiary } from "./fixtures/bestiary.mjs";
import { goblinBand, ratTunnels } from "./fixtures/modules.mjs";

const statBlock = (id) =>
  bestiary.monsters.find((monster) => monster.id === id).statBlock;
const sheetOf = (classId, level, percentile = 5) => {
  const [character] = percentileCharacters({
    percentiles: [percentile],
    classId,
  });
  return characterAtLevel(
    character.dice,
    level,
    undefined,
    false,
    undefined,
    classId,
  );
};

/**
 * Plays `adventure` with `sheet` by `casting` on `seed`, and returns the
 * character's casts: the spell, and its hit points out of its maximum as it
 * cast, in a fight.
 */
function castsOf(adventure, sheet, casting, seed) {
  const runtime = createFifthRuntime(adventure, sheet);
  const casts = [];
  const watched = {
    ...runtime,
    handleAction(state, action, random) {
      const hp =
        state.encounter === undefined
          ? undefined
          : combatant(state.encounter, "pc").hp;
      const result = runtime.handleAction(state, action, random);
      for (const event of result.events) {
        if (event.type === "cast" && event.combatantId === "pc") {
          casts.push({ spellId: event.spellId, hp });
        }
      }
      return result;
    },
  };
  playAdventure(watched, "cautious", seed, { casting });
  return casts;
}

const levelledDamage = (spellId) =>
  SPELLS[spellId].level > 0 &&
  [
    "attack",
    "save",
    "auto-hit",
    "guardians",
    "spectral-weapon",
    "drain",
    "control",
  ].includes(SPELLS[spellId].effect.kind);

test("the casting policies are conserve and spend-early", () => {
  assert.deepEqual(CASTING_POLICIES, ["conserve", "spend-early"]);
});

test("conserving, a caster casts no levelled damage or control spell above the heal threshold", () => {
  const wizard = sheetOf("wizard", 1);
  const maxHp = characterProfile(wizard).maxHp;
  let cantrips = 0;
  for (let seed = 0; seed < 20; seed++) {
    for (const { spellId, hp } of castsOf(
      goblinBand,
      wizard,
      "conserve",
      seed,
    )) {
      if (levelledDamage(spellId)) {
        assert.ok(hp < maxHp / 2, `seed ${seed}: ${spellId} at ${hp} HP`);
      }
      cantrips += SPELLS[spellId].level === 0 ? 1 : 0;
    }
  }
  assert.ok(cantrips > 0);
  // The default is conserve.
  const runtime = createFifthRuntime(goblinBand, wizard);
  assert.deepEqual(
    playAdventure(runtime, "cautious", 3),
    playAdventure(runtime, "cautious", 3, { casting: "conserve" }),
  );
});

test("spending early, a caster casts levelled spells at full health", () => {
  const wizard = sheetOf("wizard", 1);
  const maxHp = characterProfile(wizard).maxHp;
  const casts = Array.from({ length: 20 }, (_, seed) =>
    castsOf(goblinBand, wizard, "spend-early", seed),
  ).flat();
  assert.ok(
    casts.some(({ spellId, hp }) => levelledDamage(spellId) && hp === maxHp),
  );
});

test("with two foes standing, a control spell comes before damage", () => {
  // Sleep is off the Wizard's list (#348); the test caster still has it.
  const sleeper = testCasterAt(1, {
    cantrips: ["fire-bolt", "sacred-flame"],
    prepared: ["sleep", "magic-missile", "shield"],
  });
  const casts = Array.from({ length: 10 }, (_, seed) =>
    castsOf(goblinBand, sleeper, "spend-early", seed),
  ).flat();
  const first = casts.find(({ spellId }) => levelledDamage(spellId));
  assert.equal(first?.spellId, "sleep");
});

test("a Cleric attacks with Sacred Flame, and spends its slots early on Guiding Bolt", () => {
  const cleric = sheetOf("cleric", 1);
  const conserving = castsOf(ratTunnels, cleric, "conserve", 0);
  assert.ok(conserving.some(({ spellId }) => spellId === "sacred-flame"));
  const spending = Array.from({ length: 10 }, (_, seed) =>
    castsOf(ratTunnels, cleric, "spend-early", seed),
  ).flat();
  assert.ok(spending.some(({ spellId }) => spellId === "guiding-bolt"));
});

test("a levelled cast is worth its mean damage, no more than each target's hit points", () => {
  // Magic Missile: three darts of 1d4 + 1 at one target.
  assert.equal(castValue(SPELLS["magic-missile"], 1, [100]), 10.5);
  assert.equal(castValue(SPELLS["magic-missile"], 1, [2]), 2);
  // A 2nd-level slot adds a dart.
  assert.equal(castValue(SPELLS["magic-missile"], 2, [100]), 14);
  // Burning Hands, 3d6 on each of two.
  assert.equal(castValue(SPELLS["burning-hands"], 1, [5, 20]), 5 + 10.5);
  // Control and buffs are chosen otherwise.
  assert.equal(castValue(SPELLS.sleep, 1, [20]), 0);
  assert.equal(castValue(SPELLS.bless, 1, [20]), 0);
});

test("the control chance is the chance it stays out of the fight for three turns, 0 when immune or the wrong creature", () => {
  assert.equal(CONTROL_TURNS, 3);
  const wizard = sheetOf("wizard", 3, 95);
  const { saveDc } = characterProfile(wizard).spellcasting;
  // A bandit's Wisdom save is +0: it fails below the DC. Hold Person's
  // save repeats every turn; Sleep's second failure is for the spell.
  const fails = (saveDc - 1) / 20;
  assert.equal(controlChance(wizard, "sleep", statBlock("bandit")), fails ** 2);
  assert.equal(
    controlChance(wizard, "hold-person", statBlock("bandit")),
    fails ** 3,
  );
  // A zombie is immune to exhaustion; a wolf is no humanoid.
  assert.equal(controlChance(wizard, "sleep", statBlock("zombie")), 0);
  assert.equal(controlChance(wizard, "hold-person", statBlock("wolf")), 0);
  // Turn Undead: an undead's Wisdom save (a zombie's +0, proficient),
  // repeated at the end of each of its turns, from level 2.
  const cleric = sheetOf("cleric", 2, 95);
  const { channelDivinity } = characterProfile(cleric);
  assert.equal(statBlockSaves(statBlock("zombie")).wisdom, 0);
  assert.equal(
    controlChance(cleric, "turn-undead", statBlock("zombie")),
    ((channelDivinity.saveDc - 1) / 20) ** 3,
  );
  assert.equal(controlChance(cleric, "turn-undead", statBlock("bandit")), 0);
  assert.equal(
    controlChance(sheetOf("cleric", 1, 95), "turn-undead", statBlock("zombie")),
    0,
  );
});

test("a spell's one-hit-kill chance counts its attack roll or save and its damage", () => {
  const wizard = sheetOf("wizard", 1, 95);
  const { attackBonus } = characterProfile(wizard).spellcasting;
  const mastiff = statBlock("mastiff");
  // Magic Missile's three darts deal at least 6: a 5-HP mastiff falls.
  assert.equal(spellKillChance(wizard, SPELLS["magic-missile"], 1, mastiff), 1);
  // Fire Bolt's 1d10 needs 5 on a hit; a critical's 2d10 fails on 4 or less.
  const hits = 20 - Math.max(2, mastiff.armorClass - attackBonus);
  assert.ok(
    Math.abs(
      spellKillChance(wizard, SPELLS["fire-bolt"], undefined, mastiff) -
        ((hits / 20) * 0.6 + (1 / 20) * 0.94),
    ) < 1e-9,
  );
  // Sacred Flame's 1d8 on a failed Dexterity save (the mastiff's +2).
  const cleric = sheetOf("cleric", 1, 95);
  const { saveDc } = characterProfile(cleric).spellcasting;
  assert.ok(
    Math.abs(
      spellKillChance(cleric, SPELLS["sacred-flame"], undefined, mastiff) -
        ((saveDc - 3) / 20) * 0.5,
    ) < 1e-9,
  );
  // A spell with no damage kills nothing.
  assert.equal(spellKillChance(wizard, SPELLS.sleep, 1, mastiff), 0);
});

test("rays, bursts and guardians count every roll at the enemy", () => {
  // A 1-HP mastiff falls to any damage.
  const frail = { ...statBlock("mastiff"), hitPoints: { average: 1 } };
  const wizard = sheetOf("wizard", 3, 95);
  const { attackBonus, saveDc } = characterProfile(wizard).spellcasting;
  // P(one attack roll misses), a natural 20 always hitting.
  const misses =
    1 - (20 - Math.max(2, frail.armorClass - attackBonus) + 1) / 20;
  // Scorching Ray: three rays, any one that lands kills it.
  assert.ok(
    Math.abs(
      spellKillChance(wizard, SPELLS["scorching-ray"], 2, frail) -
        (1 - misses ** 3),
    ) < 1e-9,
  );
  // Ice Knife: the dagger of ice, or else the burst's failed Dexterity save
  // (the mastiff's +2).
  const saves = (saveDc - 2 - 1) / 20;
  assert.ok(
    Math.abs(
      spellKillChance(wizard, SPELLS["ice-knife"], 1, frail) -
        (1 - misses * (1 - saves)),
    ) < 1e-9,
  );
  // Spirit Guardians' first strike: 3d8 radiant, half on a success, never 0.
  const cleric = sheetOf("cleric", 5, 95);
  assert.ok(
    Math.abs(
      spellKillChance(cleric, SPELLS["spirit-guardians"], 3, frail) - 1,
    ) < 1e-9,
  );
});

test("the gate judges every class creation offers (#348)", () => {
  assert.deepEqual(GATE_CLASSES, OFFERED_CLASS_IDS);
  assert.deepEqual(GATE_CLASSES, ["fighter", "rogue", "cleric", "wizard"]);
  const gate = gateModule(goblinBand, {
    seeds: [0, 1],
    reportStealth: false,
    reportReactions: false,
  });
  assert.deepEqual(
    gate.classes.map(({ classId }) => classId),
    GATE_CLASSES,
  );
  assert.equal(
    gate.qualified,
    gate.classes.every(({ result }) => result.ok && result.verdict.qualified),
  );
});

test("a caster's verdict judges control and its best repeatable attack, and reports levelled spells and spending early", () => {
  // A level-2 Cleric has Turn Undead, which can't turn a goblin.
  const cleric = gateAdventure(goblinBand, {
    classId: "cleric",
    seeds: [0, 1],
  }).verdict;
  assert.ok(cleric.control.enemies.length > 0);
  assert.ok(
    cleric.control.enemies.every(
      ({ control, chance }) => control === "turn-undead" && chance === 0,
    ),
  );
  assert.equal(cleric.control.ok, true);
  assert.match(
    renderGateResult(goblinBand, { ok: true, verdict: cleric }),
    /^ {2}Too easy by control, pass: at the opening, the level 2, 95th percentile Cleric takes no ordinary enemy out of the fight with one control more than \d+\.\d% of the time\.$/mu,
  );
  // The Wizard has no control left on its list (#348).
  const { verdict } = gateAdventure(goblinBand, {
    classId: "wizard",
    seeds: [0, 1],
  });
  assert.equal(verdict.control, undefined);
  // A cantrip is the Wizard's best repeatable attack on some goblin.
  assert.ok(
    verdict.oneHitKill.enemies.some(({ spell }) => spell !== undefined),
  );
  assert.ok(verdict.oneHitKill.spells.enemies.length > 0);
  assert.equal(verdict.spendEarly.casting, "spend-early");
  assert.equal(verdict.spendEarly.runs, 2);
  const text = renderGateResult(goblinBand, { ok: true, verdict });
  assert.match(
    text,
    /^ {2}Too easy with levelled spells, reported \(not judged\): with one levelled damage spell at its highest slot, the level 2, 95th percentile Wizard kills /mu,
  );
  assert.match(
    text,
    /^ {2}Spending slots early, reported \(not judged\): the level 2, 5th percentile Wizard playing cautious survived \d+\.\d% of 2 runs with its weakest kit, [a-z-]+ \(.*\); over every kit and level it cast \d+\.\d spells and earned \d+\.\d XP a run\.$/mu,
  );
  // The Fighter has none of them.
  const fighter = gateAdventure(goblinBand, { seeds: [0, 1] }).verdict;
  assert.equal(fighter.control, undefined);
  assert.equal(fighter.oneHitKill.spells, undefined);
  assert.equal(fighter.spendEarly, undefined);
});

test("control over the cap for more than half the ordinary enemies fails the module", () => {
  const { verdict } = gateAdventure(goblinBand, {
    classId: "cleric",
    seeds: [0, 1],
  });
  const at = (chance) =>
    gateVerdictAt(
      {
        ...verdict,
        control: {
          ...verdict.control,
          enemies: verdict.control.enemies.map((enemy) => ({
            ...enemy,
            chance,
          })),
        },
      },
      verdict.difficulty,
    );
  assert.equal(at(1).control.ok, false);
  assert.equal(at(1).qualified, false);
  assert.equal(at(0).control.ok, true);
  const passing = at(0);
  assert.equal(
    passing.qualified,
    passing.survival.ok &&
      passing.alwaysFail.ok &&
      passing.oneHitKill.ok &&
      passing.xp.ok,
  );
});

test("a caster's survival is judged from level 3 on the casting policy that survives more", () => {
  assert.equal(CASTER_JUDGED_LEVEL, 3);
  // The goblin band is a level-2 module: the casters' survival is
  // reported, never failing it; the Fighter's is judged.
  const level2 = gateAdventure(goblinBand, {
    classId: "wizard",
    seeds: [0, 1, 2, 3],
  }).verdict;
  assert.equal(level2.survival.reported, true);
  assert.equal(level2.survival.ok, true);
  assert.ok(
    level2.survival.kits.every(
      ({ reported, casting }) =>
        reported === true && CASTING_POLICIES.includes(casting),
    ),
  );
  assert.match(
    renderGateResult(goblinBand, { ok: true, verdict: level2 }),
    /^ {2}Too deadly, reported \(not judged below level 3\): the level 2, 5th percentile Wizard playing cautious survived /mu,
  );
  // Judged at level 3, each kit names the policy it played, the better
  // of the two on seeded checks; the spend-early report is that policy's.
  const den = { ...goblinBand, recommendedLevels: { min: 3, max: 3 } };
  const judged = gateAdventure(den, {
    classId: "cleric",
    seeds: [0, 1, 2, 3],
  }).verdict;
  assert.equal(judged.survival.reported, undefined);
  for (const { kit, rate, casting } of judged.survival.kits) {
    const spent = judged.spendEarly.kits.find((entry) => entry.kit === kit);
    assert.equal(
      casting,
      spent.rate > rate || (casting === "spend-early" && spent.rate === rate)
        ? "spend-early"
        : "conserve",
    );
    // Conserving, its own rate beat or tied spending early's.
    if (casting === "spend-early") {
      assert.equal(rate, spent.rate);
    } else {
      assert.ok(rate >= spent.rate);
    }
  }
  const fighter = gateAdventure(goblinBand, { seeds: [0, 1] }).verdict;
  assert.equal(fighter.survival.reported, undefined);
  assert.ok(
    fighter.survival.kits.every(({ casting }) => casting === undefined),
  );
});

test("Sleep and Hold Person are off the Wizard's and Cleric's lists, still in the engine (#348)", () => {
  for (const id of ["sleep", "hold-person"]) {
    assert.ok(!CLASSES.wizard.spellcasting.list.includes(id), id);
    assert.ok(!CLASSES.cleric.spellcasting.list.includes(id), id);
    assert.ok(CLASSES["test-caster"].spellcasting.list.includes(id), id);
    assert.ok(SPELLS[id] !== undefined, id);
  }
  assert.deepEqual(CLASSES.wizard.defaults.spells.prepared, [
    "mage-armor",
    "magic-missile",
    "shield",
    "burning-hands",
  ]);
});
