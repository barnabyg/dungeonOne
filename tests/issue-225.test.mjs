// #225: Archery, the fourth SRD 5.2 Fighting Style: +2 to attack rolls with
// ranged weapons only, never to damage or to a melee attack. Creation offers
// it, creation and the sheet say whether it applies with the gear held, and
// the balance gate's one-hit-kill measure counts it for a ranged weapon.
import assert from "node:assert/strict";
import test from "node:test";
import { gateAdventure, oneHitKillChance } from "../dist/balance-5e.js";
import { act, startEncounter } from "../dist/encounter-5e.js";
import { equipmentProfile } from "../dist/equipment-5e.js";
import {
  characterProfile,
  projectCreation,
  validateCharacter,
} from "../dist/character-5e.js";
import { FIGHTING_STYLES } from "../dist/class-5e.js";
import { FIGHTER_DEFAULT_CHOICES } from "../dist/fighter-5e.js";
import { playerCombatant } from "../dist/runtime-5e.js";
import { archer, archeryBarrow } from "./fixtures/archery-barrow.mjs";

/** Str 16 (+3), Dex 14 (+2), no masteries. */
const CONTEXT = {
  modifiers: { strength: 3, dexterity: 2 },
  strengthScore: 16,
  dexterityScore: 14,
  proficiency: 2,
  weaponProficiencies: ["simple", "martial"],
  masteries: [],
  criticalRange: 20,
};
const attack = (equipment, fightingStyle) =>
  equipmentProfile(equipment, { ...CONTEXT, fightingStyle }).attack;

test("Archery is offered as an SRD 5.2 Fighting Style", () => {
  assert.deepEqual(FIGHTING_STYLES.archery, {
    name: "Archery",
    text: "+2 to attack rolls with ranged weapons.",
  });
  assert.equal(
    validateCharacter({ ...archer(), fightingStyle: "archery" }).fightingStyle,
    "archery",
  );
});

test("Archery adds 2 to hit with a ranged weapon, and nothing to its damage", () => {
  for (const bow of ["shortbow", "light-crossbow", "longbow"]) {
    const plain = attack(["leather", bow], "defense");
    const styled = attack(["leather", bow], "archery");
    assert.equal(styled.bonus, plain.bonus + 2, bow);
    assert.deepEqual(styled.damage, plain.damage, bow);
  }
  // Dexterity +2, proficiency +2, Archery +2.
  assert.equal(attack(["leather", "shortbow"], "archery").bonus, 6);
});

test("Archery adds nothing to a melee attack, a dagger's included", () => {
  // The SRD dagger is a thrown weapon, but without positions it only stabs.
  for (const equipment of [
    ["leather", "mace"],
    ["leather", "greatsword"],
    ["leather", "longsword"],
    ["leather", "dagger"],
  ]) {
    assert.deepEqual(
      attack(equipment, "archery"),
      attack(equipment, "defense"),
      equipment.join(", "),
    );
  }
  const twin = equipmentProfile(["leather", "dagger", "dagger"], {
    ...CONTEXT,
    fightingStyle: "archery",
  });
  // Finesse: Strength +3, proficiency +2.
  assert.equal(twin.attack.bonus, 5);
  assert.equal(twin.lightAttack.bonus, 5);
});

test("an Archery shot hits on a roll 2 lower than without it", () => {
  const wren = (fightingStyle) =>
    playerCombatant(validateCharacter({ ...archer(2), fightingStyle }));
  const goblin = {
    id: "goblin",
    name: "Goblin Warrior",
    side: "opponents",
    armorClass: 15,
    hp: 10,
    maxHp: 10,
    dexterity: 15,
    initiativeBonus: 2,
    attack: {
      name: "Scimitar",
      bonus: 4,
      damage: { dice: 1, sides: 6, modifier: 2, type: "slashing" },
      criticalRange: 20,
    },
  };
  /** Wren's initiative 15 beats the goblin's 1; her shot rolls a 9. */
  const shoot = (fightingStyle) => {
    const queue = [15, 1, 9, 4];
    const random = { roll: () => queue.shift() };
    const { state } = startEncounter([wren(fightingStyle), goblin], random);
    return act(
      state,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      random,
    ).events.find(({ type }) => type === "attack");
  };
  // Wren: Dexterity 14 (+2), proficiency +2. 9 + 4 = 13 misses AC 15;
  // 9 + 6 = 15 hits, and the damage is the d6's 4 + 2, Archery adding none.
  assert.equal(shoot("defense").hit, false);
  const styled = shoot("archery");
  assert.equal(styled.hit, true);
  assert.equal(styled.total, 15);
  assert.equal(styled.damage, 6);
});

test("creation and the sheet say whether Archery applies with the gear held", () => {
  const uses = (sheet) => characterProfile(sheet).fightingStyle;
  assert.deepEqual(
    uses(validateCharacter({ ...archer(), fightingStyle: "archery" })),
    {
      id: "archery",
      name: "Archery",
      applies: true,
      note: "Applies: the shortbow is a ranged weapon.",
    },
  );
  assert.deepEqual(
    uses(
      validateCharacter({
        ...archer(),
        fightingStyle: "archery",
        equipment: ["leather", "mace"],
        stowed: ["shortbow"],
      }),
    ),
    {
      id: "archery",
      name: "Archery",
      applies: false,
      note: "No effect with the mace: it needs a ranged weapon.",
    },
  );
  // Every starting kit is melee: creation lists Archery first, never applying.
  const DICE = [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
  ];
  const projected = projectCreation(DICE, {
    ...FIGHTER_DEFAULT_CHOICES,
    placement: {
      strength: 0,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: 5,
    },
    fightingStyle: "archery",
  });
  assert.deepEqual(projected.fightingStyles[0], {
    id: "archery",
    name: "Archery",
    applies: false,
    note: "No effect with the mace: it needs a ranged weapon.",
  });
});

test("the one-hit-kill measure counts Archery", () => {
  const enemy = { armorClass: 15, hitPoints: { average: 5 } };
  const wren = (fightingStyle) =>
    validateCharacter({ ...archer(), fightingStyle });
  // +4 to hit AC 15 needs an 11 (10/20); +6 needs a 9 (12/20). 1d6 + 2 ≥ 5
  // needs a 3 (4/6); a 20 crits, 2d6 + 2 ≥ 5 always but for 1+1 (35/36).
  const chance = (hits) => ((hits - 1) / 20) * (4 / 6) + (1 / 20) * (35 / 36);
  assert.ok(
    Math.abs(oneHitKillChance(wren("defense"), enemy) - chance(10)) < 1e-9,
  );
  assert.ok(
    Math.abs(oneHitKillChance(wren("archery"), enemy) - chance(12)) < 1e-9,
  );
});

test("the gate's one-hit-kill measure takes Archery where a ranged weapon is the strongest choice", () => {
  const result = gateAdventure(archeryBarrow, { seeds: [0] });
  assert.equal(result.ok, true, JSON.stringify(result.failure));
  const [enemy] = result.verdict.oneHitKill.enemies;
  assert.equal(enemy.gear, "light-crossbow");
  assert.equal(enemy.fightingStyle, "archery");
});
