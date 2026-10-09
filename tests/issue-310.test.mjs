// #310: the balance harness, gate and career simulation play both classes.
import assert from "node:assert/strict";
import test from "node:test";
import {
  characterAtLevel,
  gateAdventure,
  gateModule,
  oneHitKillChance,
  percentileCharacters,
  qualifyAdventure,
  renderGateResult,
  renderModuleGateResult,
  strongestAttackers,
} from "../dist/balance-5e.js";
import { CLASSES, characterProfile } from "../dist/character-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";

const ROLLS = [
  [6, 6, 6, 1],
  [5, 5, 5, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [2, 2, 2, 1],
  [1, 1, 1, 1],
];

test("each class ranks its own creations: the Rogue's percentile characters place Dexterity first", () => {
  const fighter = percentileCharacters({ percentiles: [5, 95] });
  assert.deepEqual(
    percentileCharacters({ percentiles: [5, 95], classId: "fighter" }),
    fighter,
  );
  const rogue = percentileCharacters({
    percentiles: [5, 95],
    classId: "rogue",
  });
  assert.deepEqual(
    percentileCharacters({ percentiles: [5, 95], classId: "rogue" }),
    rogue,
  );
  for (const { dice, totalModifier } of rogue) {
    const sheet = characterAtLevel(
      dice,
      1,
      undefined,
      false,
      undefined,
      "rogue",
    );
    const { abilities } = sheet;
    assert.equal(sheet.class, "rogue");
    assert.ok(
      Object.values(abilities).every((score) => score <= abilities.dexterity),
    );
    assert.equal(
      Object.values(abilities).reduce(
        (sum, score) => sum + Math.floor((score - 10) / 2),
        0,
      ),
      totalModifier,
    );
  }
});

test("a Rogue archer is its usual Dexterity-first build", () => {
  assert.deepEqual(
    characterAtLevel(ROLLS, 2, undefined, true, undefined, "rogue"),
    characterAtLevel(ROLLS, 2, undefined, false, undefined, "rogue"),
  );
});

test("the strongest Rogue is armed with each Rogue kit and placed weapon, with no Fighting Style", () => {
  const attackers = strongestAttackers(ROLLS, 3, ["shortbow"], "rogue");
  assert.deepEqual(
    attackers.map(({ kit, gear }) => [kit, gear]),
    [
      ...CLASSES.rogue.kits.map((kit) => [kit, undefined]),
      [CLASSES.rogue.defaults.kit, "shortbow"],
    ],
  );
  for (const { sheet, fightingStyle } of attackers) {
    assert.equal(sheet.class, "rogue");
    assert.equal(fightingStyle, undefined);
  }
});

test("the harness report and the gate play the class asked for, the Fighter by default", () => {
  const options = { seeds: [0, 1], percentiles: [5], styles: ["cautious"] };
  const fighter = qualifyAdventure(loneGoblin, options);
  assert.equal(fighter.report.classId, "fighter");
  assert.deepEqual(
    qualifyAdventure(loneGoblin, { ...options, classId: "fighter" }),
    fighter,
  );
  assert.equal(
    qualifyAdventure(loneGoblin, { ...options, classId: "rogue" }).report
      .classId,
    "rogue",
  );

  const seeds = { seeds: [0, 1] };
  assert.equal(gateAdventure(loneGoblin, seeds).verdict.classId, "fighter");
  const { verdict } = gateAdventure(loneGoblin, { ...seeds, classId: "rogue" });
  assert.equal(verdict.classId, "rogue");
  assert.deepEqual(
    verdict.survival.kits.map(({ kit }) => kit),
    CLASSES.rogue.kits,
  );
  assert.ok(
    verdict.oneHitKill.enemies.every(
      ({ kit, fightingStyle }) =>
        CLASSES.rogue.kits.includes(kit) && fightingStyle === undefined,
    ),
  );
});

test("a module qualifies only if every class qualifies, and the verdict names each class", () => {
  // On these four seeds the lone goblin kills the weakest Rogue too often,
  // and not the weakest Fighter.
  const gate = gateModule(loneGoblin, { seeds: [0, 1, 2, 3] });
  assert.deepEqual(
    gate.classes.map(({ classId, result }) => [
      classId,
      result.ok && result.verdict.qualified,
    ]),
    [
      ["fighter", true],
      ["rogue", false],
    ],
  );
  assert.equal(gate.qualified, false);
  const text = renderModuleGateResult(loneGoblin, gate);
  assert.match(
    text,
    /^The Lone Goblin \(lone-goblin\) qualifies as hard for the Fighter\.$/mu,
  );
  assert.match(
    text,
    /^The Lone Goblin \(lone-goblin\) does not qualify as hard for the Rogue\.$/mu,
  );
  assert.match(text, /5th percentile Rogue playing cautious/u);
});

test("a class the harness can't play is named in the failure", () => {
  const gate = gateModule(loneGoblin, { seeds: [0], stepLimit: 1 });
  assert.equal(gate.qualified, false);
  const text = renderModuleGateResult(loneGoblin, gate);
  for (const name of ["Fighter", "Rogue"]) {
    assert.match(
      text,
      new RegExp(
        `^The Lone Goblin \\(lone-goblin\\) does not qualify for the ${name}: step-limit\\. `,
        "mu",
      ),
    );
  }
});

/**
 * P(one attack by `sheet`'s character kills an enemy with `armorClass` and
 * `hp` from full HP), worked out by enumerating every die: with advantage
 * (and so Sneak Attack, as the weapon is Finesse) `advantage` of the time.
 */
function referenceKill(sheet, { armorClass, hp }, advantage) {
  const { attack, sneakAttack } = characterProfile(sheet);
  /** P(`count` dice of `sides`, plus `total`, reach `hp`). */
  const reach = (count, sides, total) => {
    if (count === 0) {
      return total >= hp ? 1 : 0;
    }
    let chance = 0;
    for (let face = 1; face <= sides; face++) {
      chance += reach(count - 1, sides, total + face) / sides;
    }
    return chance;
  };
  /** P(a kill) with the kept d20, with or without Sneak Attack. */
  const roll = (d20, sneak) => {
    const critical = d20 >= attack.criticalRange;
    if (d20 === 1 || (!critical && d20 + attack.bonus < armorClass)) {
      return 0;
    }
    const times = critical ? 2 : 1;
    // Weapon dice, then Sneak Attack's: enumerate them as one pool when
    // their sides match (the shortsword's d6 and Sneak Attack's d6).
    assert.equal(attack.damage.sides, sneakAttack?.sides ?? 6);
    return reach(
      times * (attack.damage.dice + (sneak ? sneakAttack.dice : 0)),
      attack.damage.sides,
      attack.damage.modifier,
    );
  };
  let plain = 0;
  let aided = 0;
  for (let d20 = 1; d20 <= 20; d20++) {
    plain += roll(d20, false) / 20;
    aided += (roll(d20, true) * (d20 ** 2 - (d20 - 1) ** 2)) / 400;
  }
  return (1 - advantage) * plain + advantage * aided;
}

/** Only Sneak Attack reaches 14 HP without a critical hit: 1d6 + 5 can't. */
const SNEAKED = { armorClass: 12, hitPoints: { average: 14 } };
const SNEAKED_HP = { armorClass: 12, hp: 14 };
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
const rogueAt = (level) =>
  characterAtLevel(ROLLS, level, undefined, false, undefined, "rogue");

test("the judged one-attack kill chance counts no bonus action, so no Sneak Attack", () => {
  for (const level of [1, 2, 3]) {
    close(
      oneHitKillChance(rogueAt(level), SNEAKED),
      referenceKill(rogueAt(level), SNEAKED_HP, 0),
    );
  }
});

test("with its bonus action, a level-3 Rogue's chance counts Steady Aim's advantage and Sneak Attack", () => {
  const rogue = rogueAt(3);
  assert.deepEqual(characterProfile(rogue).sneakAttack, { dice: 2, sides: 6 });
  const prepared = oneHitKillChance(rogue, SNEAKED, { hideDc: 15 });
  close(prepared, referenceKill(rogue, SNEAKED_HP, 1));
  assert.ok(prepared > oneHitKillChance(rogue, SNEAKED));
});

test("with its bonus action, a level-2 Rogue hides as often as its Stealth meets the fight's best passive Perception", () => {
  const rogue = rogueAt(2);
  const stealth = characterProfile(rogue).skills.find(
    ({ id }) => id === "stealth",
  ).bonus;
  /** P(d20 + Stealth meets `dc`). */
  const hides = (dc) => Math.min(20, Math.max(0, 21 - (dc - stealth))) / 20;
  for (const hideDc of [15, 20]) {
    close(
      oneHitKillChance(rogue, SNEAKED, { hideDc }),
      referenceKill(rogue, SNEAKED_HP, hides(hideDc)),
    );
  }
});

test("a level-1 Rogue's bonus action gives its attack nothing", () => {
  close(
    oneHitKillChance(rogueAt(1), SNEAKED, { hideDc: 15 }),
    referenceKill(rogueAt(1), SNEAKED_HP, 0),
  );
});

test("the gate reports the Rogue's one-attack kill chances with Sneak Attack, but doesn't judge them", () => {
  const seeds = { seeds: [0] };
  // A level-1 Fighter has no bonus action before its attack.
  const fighter = gateAdventure(loneGoblin, seeds).verdict;
  assert.equal(fighter.oneHitKill.bonusAction, undefined);
  assert.doesNotMatch(
    renderGateResult(loneGoblin, gateAdventure(loneGoblin, seeds)),
    /Sneak Attack/u,
  );
  // The lone goblin is for level 1, so its Rogue can't hide: at level 3 it
  // has Steady Aim.
  const atThree = { ...loneGoblin, recommendedLevels: { min: 3, max: 3 } };
  const result = gateAdventure(atThree, { ...seeds, classId: "rogue" });
  const { oneHitKill } = result.verdict;
  const [plain] = oneHitKill.enemies;
  const [prepared] = oneHitKill.bonusAction.enemies;
  assert.equal(prepared.name, "Goblin Warrior");
  assert.ok(prepared.chance > plain.chance);
  // Over the cap with Sneak Attack, yet judged on the plain attack.
  assert.deepEqual(
    oneHitKill.bonusAction.overCap.map(({ name }) => name),
    ["Goblin Warrior"],
  );
  assert.equal(oneHitKill.ok, plain.chance <= oneHitKill.cap);
  assert.match(
    renderModuleGateResult(atThree, gateModule(atThree, seeds)),
    /^ {2}Too easy with Sneak Attack, reported \(not judged\): with Hide or Steady Aim before the attack, the level 3, 95th percentile Rogue kills 1 of 1 ordinary enemies with one attack more than 30\.0% of the time: Goblin Warrior \d+\.\d% \([a-z-]+\)\.$/mu,
  );
});
