// #144: Great Weapon Fighting and Two-Weapon Fighting work. Great Weapon
// Fighting counts a 1 or 2 on a damage die as 3 for a two-handed weapon or
// a versatile one held in two hands; Two-Weapon Fighting adds the ability
// modifier to the Light extra attack's damage. Creation and the sheet say
// whether the chosen style applies with the current gear, and the balance
// gate's one-hit-kill measure counts it.
import assert from "node:assert/strict";
import test from "node:test";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { gateAdventure, oneHitKillChance } from "../dist/balance-5e.js";
import { act, startEncounter } from "../dist/encounter-5e.js";
import { equipmentProfile } from "../dist/equipment-5e.js";
import {
  buildFighter,
  fighterProfile,
  projectCreation,
  validateFighter,
} from "../dist/fighter-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  playerCombatant,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT } from "../dist/session-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import {
  armouryBarrow as barrow,
  barrowFile,
} from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

/** Returns the queued [sides, value] pairs in order, checking each die's sides. */
function dice(...queue) {
  const drawn = [];
  return {
    drawn,
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      const [expected, value] = queue.shift();
      assert.equal(sides, expected, `expected a d${expected}, got a d${sides}`);
      drawn.push({ sides, value });
      return value;
    },
  };
}

/** Strength +3 (16), Dexterity +2, no masteries. */
const CONTEXT = {
  modifiers: { strength: 3, dexterity: 2 },
  strengthScore: 16,
  proficiency: 2,
  masteries: [],
  criticalRange: 20,
};
const profile = (equipment, fightingStyle) =>
  equipmentProfile(equipment, { ...CONTEXT, fightingStyle });

test("Great Weapon Fighting marks a two-handed weapon, or a versatile one held in two hands, and nothing else", () => {
  const gwf = "great-weapon-fighting";
  // A longsword with a shield is held in one hand: 1d8, no style.
  const oneHand = profile(["leather", "shield", "longsword"], gwf).attack;
  assert.equal(oneHand.grip, "one-handed");
  assert.equal(oneHand.damage.sides, 8);
  assert.equal(oneHand.greatWeaponFighting, undefined);
  // Alone it is held in two hands: 1d10, with the style.
  const twoHands = profile(["leather", "longsword"], gwf).attack;
  assert.equal(twoHands.grip, "two-handed");
  assert.equal(twoHands.damage.sides, 10);
  assert.equal(twoHands.greatWeaponFighting, true);
  assert.equal(
    profile(["leather", "greatsword"], gwf).attack.greatWeaponFighting,
    true,
  );
  // A one-handed weapon held alone, or two light ones, never.
  assert.equal(
    profile(["leather", "mace"], gwf).attack.greatWeaponFighting,
    undefined,
  );
  const twin = profile(["leather", "dagger", "dagger"], gwf);
  assert.equal(twin.attack.greatWeaponFighting, undefined);
  assert.equal(twin.lightAttack.greatWeaponFighting, undefined);
  // Another style never marks the greatsword.
  for (const style of [undefined, "defense", "two-weapon-fighting"]) {
    assert.equal(
      profile(["leather", "greatsword"], style).attack.greatWeaponFighting,
      undefined,
    );
  }
});

test("Two-Weapon Fighting adds the ability modifier to the extra attack only", () => {
  const plain = profile(["leather", "dagger", "dagger"], "defense");
  assert.equal(plain.lightAttack.damage.modifier, 0);
  const styled = profile(
    ["leather", "dagger", "dagger"],
    "two-weapon-fighting",
  );
  // Finesse takes the higher of Strength (+3) and Dexterity (+2).
  assert.equal(styled.lightAttack.damage.modifier, 3);
  assert.equal(styled.attack.damage.modifier, 3);
  assert.deepEqual(styled.attack, plain.attack);
  // A negative modifier is added with or without the style.
  const weak = (fightingStyle) =>
    equipmentProfile(["leather", "club", "dagger"], {
      ...CONTEXT,
      modifiers: { strength: -1, dexterity: -1 },
      strengthScore: 8,
      fightingStyle,
    }).lightAttack.damage.modifier;
  assert.equal(weak("defense"), -1);
  assert.equal(weak("two-weapon-fighting"), -1);
});

const weapon = (name, sides, modifier, extra = {}) => ({
  name,
  bonus: 5,
  damage: { dice: 1, sides, modifier, type: "slashing" },
  criticalRange: 20,
  ...extra,
});
const fighter = (attack) => ({
  id: "pc",
  name: "Ada",
  side: "party",
  armorClass: 13,
  hp: 12,
  maxHp: 12,
  dexterity: 12,
  initiativeBonus: 1,
  attack,
});
const ogre = {
  id: "ogre",
  name: "Ogre",
  side: "opponents",
  armorClass: 11,
  hp: 60,
  maxHp: 60,
  dexterity: 8,
  initiativeBonus: -1,
  attack: weapon("Greatclub", 8, 4),
};
/** Ada acts first (15 against 3). */
const begin = (pc) => startEncounter([pc, ogre], dice([20, 15], [20, 3])).state;
const swing = { type: "attack", actorId: "pc", targetId: "ogre" };

test("the engine counts a 1 or 2 on each damage die as 3 with Great Weapon Fighting, keeping the dice as rolled", () => {
  const greatsword = {
    ...weapon("Greatsword", 6, 3),
    damage: { dice: 2, sides: 6, modifier: 3, type: "slashing" },
  };
  // 12 + 5 hits AC 11; the ogre then misses with a 1.
  const styled = act(
    begin(fighter({ ...greatsword, greatWeaponFighting: true })),
    swing,
    dice([20, 12], [6, 1], [6, 2], [20, 1]),
  );
  const event = styled.events.find(({ type }) => type === "attack");
  assert.deepEqual(event.damageRolls, [1, 2]);
  assert.equal(event.greatWeaponFighting, true);
  assert.equal(event.damage, 3 + 3 + 3);

  // A critical hit doubles the dice, each counted the same way.
  const critical = act(
    begin(fighter({ ...greatsword, greatWeaponFighting: true })),
    swing,
    dice([20, 20], [6, 1], [6, 6], [6, 2], [6, 4], [20, 1]),
  );
  assert.equal(
    critical.events.find(({ type }) => type === "attack").damage,
    3 + 6 + 3 + 4 + 3,
  );

  // Without the style the dice count as rolled.
  const plain = act(
    begin(fighter(greatsword)),
    swing,
    dice([20, 12], [6, 1], [6, 2], [20, 1]),
  );
  const unstyled = plain.events.find(({ type }) => type === "attack");
  assert.equal(unstyled.damage, 1 + 2 + 3);
  assert.equal(unstyled.greatWeaponFighting, undefined);
});

const adventures = await loadBuiltInFifthAdventures();
const cellarGoblin = adventures.find(({ id }) => id === "cellar-goblin");
const DICE = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];
const CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { constitution: 2, intelligence: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "great-weapon-fighting",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};
/** Ada with `choices`, then holding `equipment` as if found and equipped. */
const ada = (choices = {}, equipment) => {
  const sheet = buildFighter("a".repeat(32), "Ada", DICE, {
    ...CHOICES,
    ...choices,
  });
  return equipment === undefined
    ? sheet
    : validateFighter({ ...sheet, equipment });
};
/** Plain values, in order, recording each die. */
const rolls = (...queue) => {
  const drawn = [];
  return {
    drawn,
    roll(sides) {
      assert.ok(queue.length > 0, "unexpected die");
      const value = queue.shift();
      drawn.push({ sides, value });
      return value;
    },
  };
};

test("a Fighter with Great Weapon Fighting and a found longsword in both hands applies it in the fight", () => {
  const sheet = ada({}, ["leather", "longsword"]);
  assert.equal(playerCombatant(sheet).attack.greatWeaponFighting, true);
  assert.equal(
    playerCombatant(ada({}, ["leather", "shield", "longsword"])).attack
      .greatWeaponFighting,
    undefined,
  );

  const runtime = createFifthRuntime(cellarGoblin, sheet);
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    rolls(15, 3),
  ).state;
  // 14 + 5 hits AC 15 for a 2 that counts as 3, + 3; the goblin misses.
  const random = rolls(14, 2, 1);
  const result = runtime.handleAction(
    begun,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    random,
  );
  assert.match(
    runtime.renderResult(result),
    /^Ada attacks Goblin Warrior with Longsword: 14 \+ 5 = 19 against AC 15\. Hit\. Damage 2 \(counts as 3, Great Weapon Fighting\) \+ 3 = 6 slashing; Goblin Warrior has 4\/10 HP\./,
  );
  const damage = describeFifthResult(result, random.drawn, "Ada")
    .flatMap((line) => line.rolls)
    .find(({ purpose }) => purpose === "damage");
  assert.deepEqual(damage.dice, [{ sides: 10, value: 2, countsAs: 3 }]);
  assert.equal(damage.total, 6);
});

test("Two-Weapon Fighting's extra attack adds the modifier in the fight, and the bar says when the bonus action is spent", () => {
  const twin = (fightingStyle) => {
    const runtime = createFifthRuntime(
      cellarGoblin,
      ada({ fightingStyle, kit: "two-daggers" }),
    );
    const begun = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      rolls(15, 3),
    ).state;
    // A dagger hit (12 + 5) for 1 + 3 readies the extra attack; Nick
    // spares the bonus action, and the goblin then misses with a 1.
    const struck = runtime.handleAction(
      begun,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      rolls(12, 1),
    ).state;
    return { runtime, struck };
  };
  const styled = twin("two-weapon-fighting");
  const extra = styled.runtime.handleAction(
    styled.struck,
    { type: "light-attack", actorId: "pc", targetId: "goblin" },
    rolls(10, 2, 1),
  );
  assert.match(
    styled.runtime.renderResult(extra),
    /Dagger \(extra attack\): 10 \+ 5 = 15 against AC 15\. Hit\. Damage 2 \+ 3 = 5 piercing; Goblin Warrior has 1\/10 HP\./,
  );
  const plain = twin("defense");
  assert.match(
    plain.runtime.renderResult(
      plain.runtime.handleAction(
        plain.struck,
        { type: "light-attack", actorId: "pc", targetId: "goblin" },
        rolls(10, 2, 1),
      ),
    ),
    /Damage 2 \+ 0 = 2 piercing; Goblin Warrior has 4\/10 HP\./,
  );

  // Without Nick the extra attack is a bonus action: Second Wind spends it,
  // and the bar keeps the entry with its reason. At level 2 Action Surge
  // keeps the turn open after the attack.
  const unnicked = ada({
    fightingStyle: "two-weapon-fighting",
    kit: "two-daggers",
    masteries: ["mace", "shortsword", "longsword"],
  });
  const runtime = createFifthRuntime(
    cellarGoblin,
    validateFighter({ ...unnicked, xp: 300, level: 2 }),
  );
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    // The goblin acts first and hits Ada for 1 + 2.
    rolls(3, 15, 18, 1),
  ).state;
  state = runtime.handleAction(
    state,
    { type: "second-wind", actorId: "pc" },
    rolls(1),
  ).state;
  state = runtime.handleAction(
    state,
    { type: "attack", actorId: "pc", targetId: "goblin" },
    rolls(2),
  ).state;
  assert.deepEqual(
    runtime
      .projectActions(state)
      .filter(({ action }) => action === "light-attack"),
    [
      {
        action: "light-attack",
        target: { id: "goblin", name: "Goblin Warrior" },
        available: false,
        reason: "Bonus action used",
      },
    ],
  );
});

test("the sheet and creation say whether the Fighting Style applies with the current gear", () => {
  const uses = (sheet) => fighterProfile(sheet).fightingStyle;
  assert.deepEqual(uses(ada()), {
    id: "great-weapon-fighting",
    name: "Great Weapon Fighting",
    applies: false,
    note: "No effect with the mace: it needs a two-handed weapon, or a versatile one held in two hands.",
  });
  assert.deepEqual(uses(ada({}, ["leather", "longsword"])), {
    id: "great-weapon-fighting",
    name: "Great Weapon Fighting",
    applies: true,
    note: "Applies: the longsword is held in two hands.",
  });
  assert.equal(
    uses(ada({}, ["leather", "shield", "longsword"])).note,
    "No effect with the longsword in one hand: it needs a two-handed weapon, or a versatile one held in two hands.",
  );
  assert.equal(uses(ada({}, ["leather", "greatsword"])).applies, true);
  assert.deepEqual(
    uses(ada({ fightingStyle: "two-weapon-fighting", kit: "two-daggers" })),
    {
      id: "two-weapon-fighting",
      name: "Two-Weapon Fighting",
      applies: true,
      note: "Applies: the extra attack with the second dagger adds your ability modifier.",
    },
  );
  assert.equal(
    uses(ada({ fightingStyle: "two-weapon-fighting" })).note,
    "No effect with the mace: it needs two light weapons.",
  );
  assert.equal(
    uses(ada({ fightingStyle: "defense" })).note,
    "Applies: you wear armour.",
  );
  assert.equal(
    uses(ada({ fightingStyle: "defense" }, ["mace"])).note,
    "No effect without armour.",
  );
  // The feature text no longer calls the styles unused.
  const feature = fighterProfile(ada()).features.find(
    ({ id }) => id === "fighting-style",
  );
  assert.doesNotMatch(feature.text, /Not used yet/);

  // Creation shows every style against the kit chosen.
  const projected = projectCreation(DICE, { ...CHOICES, kit: "two-daggers" });
  assert.deepEqual(
    projected.fightingStyles.map(({ id, applies }) => [id, applies]),
    [
      ["defense", true],
      ["great-weapon-fighting", false],
      ["two-weapon-fighting", true],
    ],
  );
  assert.equal(
    projectCreation(DICE, CHOICES).fightingStyles.find(
      ({ id }) => id === "two-weapon-fighting",
    ).applies,
    false,
  );
});

test("the one-hit-kill measure counts Great Weapon Fighting", () => {
  const enemy = { armorClass: 10, hitPoints: { average: 13 } };
  const styled = oneHitKillChance(ada({}, ["leather", "longsword"]), enemy);
  const plain = oneHitKillChance(
    ada({ fightingStyle: "defense" }, ["leather", "longsword"]),
    enemy,
  );
  // Strength 16 (+3), +5 to hit AC 10: a 5–19 hits (15/20), a 20 crits.
  // 1d10 + 3 ≥ 13 needs a 10 either way; 2d10 + 3 ≥ 13 differs: as rolled
  // 64/100 of pairs reach 10, and counting 1s and 2s as 3 makes it 70/100.
  assert.ok(Math.abs(plain - ((15 / 20) * (1 / 10) + (1 / 20) * 0.64)) < 1e-9);
  assert.ok(Math.abs(styled - ((15 / 20) * (1 / 10) + (1 / 20) * 0.7)) < 1e-9);
});

test("the gate's one-hit-kill measure takes the Fighting Style that kills most often", () => {
  const enemy = (adventure) => {
    const result = gateAdventure(adventure, { seeds: [0] });
    return result.verdict.oneHitKill.enemies[0];
  };
  // Every kit is one-handed: no style beats Defense, the default.
  const plain = enemy(validateModule(barrowFile));
  assert.equal(plain.fightingStyle, "defense");
  // The barrow's greatsword is two-handed: Great Weapon Fighting counts.
  const armed = enemy(barrow);
  assert.equal(armed.gear, "greatsword");
  assert.equal(armed.fightingStyle, "great-weapon-fighting");
});

test("saves and traces move to new format versions: their attacks and dice carry Great Weapon Fighting", () => {
  assert.ok(FIFTH_SESSION_FORMAT >= 12);
  assert.ok(FIFTH_TRACE_FORMAT >= 6);
});
