// Seeded playthroughs of every fixture module (#156), of merchants and a
// fighter holding two daggers (#269), of a level-3 Thief's and a level-5
// Rogue's fights (#307, #308), and of the test caster's (#336): a character
// picks a random enabled action
// from the bar at each step. The bar-projection tests (#156, #182, #183)
// check each state these reach, and the engine action each projected action
// stands for is mapped here once, so a new kind of action can't leave one
// test's copy behind.
import assert from "node:assert/strict";
import {
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  defaultPlacement,
  levelForXp,
  validateCharacter,
} from "../../dist/character-5e.js";
import { CLERIC } from "../../dist/cleric-5e.js";
import { ROGUE } from "../../dist/rogue-5e.js";
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";
import { testCasterAt } from "../../dist/test-caster-5e.js";
import { archer, archeryBarrow } from "./archery-barrow.mjs";
import { gemMarket } from "./gem-market.mjs";
import { FIXTURE_MODULES, goblinTrio, sealedCrypt } from "./modules.mjs";

export const PLAYER = "pc";

const ADA_DICE = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];

const ADA_CHOICES = {
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
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

// The #156 fighter: Con 14 (+2), 12 HP at level 1.
export const ada = buildCharacter("a".repeat(32), "Ada", ADA_DICE, ADA_CHOICES);

/** Ada with two daggers and leather, for the light weapons' extra attack (#269). */
export const twin = buildCharacter("a".repeat(32), "Ada", ADA_DICE, {
  ...ADA_CHOICES,
  kit: "two-daggers",
});

/** Ada at level 2, at full health, so she has Action Surge. */
export function veteran() {
  const xp = 300;
  const leveled = { ...ada, xp, level: levelForXp(xp) };
  return validateCharacter({ ...leveled, hp: characterProfile(leveled).maxHp });
}

/** A level-3 Thief at full health, so it can Hide and use Steady Aim (#307). */
export function thief() {
  const xp = 900;
  const rogue = buildCharacter(
    "c".repeat(32),
    "Vex",
    ADA_DICE,
    { ...ROGUE.defaults, placement: defaultPlacement(ADA_DICE, ROGUE) },
    "rogue",
  );
  const leveled = { ...rogue, xp, level: levelForXp(xp) };
  return validateCharacter({ ...leveled, hp: characterProfile(leveled).maxHp });
}

/**
 * The level-3 Thief raised to level 5 at full health, with +2 Dexterity at
 * level 4, so it has Cunning Strike and Uncanny Dodge (#308).
 */
export function rogueAt5() {
  const xp = 6500;
  const leveled = { ...thief(), xp, level: levelForXp(xp) };
  return applyLevelChoice(
    validateCharacter({ ...leveled, hp: characterProfile(leveled).maxHp }),
    { increase: { dexterity: 2 } },
  );
}

/**
 * A level-3 Life Cleric at full health (#341), with Spiritual Weapon and
 * Hold Person prepared: Channel Divinity, Preserve Life and Spiritual
 * Weapon's attacks reach the bar.
 */
export function lifeCleric() {
  const xp = 900;
  const cleric = buildCharacter(
    "e".repeat(32),
    "Mira",
    ADA_DICE,
    { ...CLERIC.defaults, placement: defaultPlacement(ADA_DICE, CLERIC) },
    "cleric",
  );
  const leveled = {
    ...cleric,
    xp,
    level: levelForXp(xp, 3),
    spells: {
      cantrips: cleric.spells.cantrips,
      prepared: [
        "guiding-bolt",
        "healing-word",
        "shield-of-faith",
        "spiritual-weapon",
        "hold-person",
        "protection-from-poison",
      ],
    },
  };
  return validateCharacter({ ...leveled, hp: characterProfile(leveled).maxHp });
}

/**
 * The engine action a projected action stands for, as the browser server
 * makes it from a click: every `ActionKind` in `src/runtime-5e.ts`.
 */
export function engineAction(view) {
  const made = madeAction(view);
  // A check's chosen approach (#283) and a retry (#284) go with the click, as
  // the browser sends them.
  return {
    ...made,
    ...(view.approach === undefined ? {} : { approach: view.approach.id }),
    ...(view.retry === undefined ? {} : { retry: true }),
    // Cunning Strike's effect (#308) goes with its attack.
    ...(view.cunningStrike === undefined
      ? {}
      : { cunningStrike: view.cunningStrike.id }),
  };
}

function madeAction({ action, target, targets, rest, spell, mode }) {
  switch (action) {
    case "attack":
    case "light-attack":
    case "spectral-attack":
      return { type: action, actorId: PLAYER, targetId: target.id };
    // Divine Spark (#341), with what it does.
    case "divine-spark":
      return { type: action, actorId: PLAYER, targetId: target.id, mode };
    case "second-wind":
    case "action-surge":
    case "hide":
    case "steady-aim":
    case "turn-undead":
    case "preserve-life":
    case "end-turn":
    case "uncanny-dodge":
    case "take-hit":
      return { type: action, actorId: PLAYER };
    case "use":
      return { type: "use-item", itemId: target.id };
    case "move":
    case "sneak":
      return { type: action, destinationId: target.id };
    case "examine":
      return { type: "examine", targetId: target.id };
    case "take":
      return { type: "take", itemId: target.id };
    case "equip":
    case "unequip":
    case "swap":
    case "drop":
    case "buy":
    case "sell":
    case "sell-treasure":
      return { type: action, itemId: target.id };
    case "sell-equipped":
      return { type: "sell", itemId: target.id, equipped: true };
    case "force":
    case "pick":
    case "break":
    case "unlock":
      return { type: action, doorId: target.id };
    case "search":
    case "ambush":
      return { type: action, roomId: target.id };
    case "disarm":
      return { type: "disarm", trapId: target.id };
    case "talk":
      return { type: "talk", topicId: target.id };
    case "leave":
      return { type: "leave", roomId: target.id };
    case "react":
      return { type: "react", option: target.id };
    // Tactical Mind on the check just failed (#315).
    case "tactical-mind":
      return { type: "tactical-mind" };
    // A short rest (#334) spends the most hit dice, as the browser's choice
    // does unless the player picks fewer.
    case "rest":
      return { type: "rest", hitDice: rest.hitDice.at(-1) };
    // A long rest at a rest site (#335).
    case "long-rest":
      return { type: "long-rest" };
    // A spell (#336), with the slot level the bar offers it at; an area
    // spell (#338) at the first of its targets, up to its most.
    case "cast":
      return {
        type: "cast",
        actorId: PLAYER,
        spellId: spell.id,
        targetIds:
          targets === undefined
            ? [target.id]
            : targets.slice(0, spell.maxTargets).map(({ id }) => id),
        ...(spell.slotLevel === undefined
          ? {}
          : { slotLevel: spell.slotLevel }),
        // Resistance's damage type (#339).
        ...(spell.damageType === undefined
          ? {}
          : { damageType: spell.damageType }),
      };
    default:
      // A new kind must be mapped above, not guessed at.
      throw new Error(`no engine action for ${action}`);
  }
}

/** The test caster with buffs and Shield prepared (#337). */
const BUFFED = {
  cantrips: ["fire-bolt", "sacred-flame"],
  prepared: ["bless", "shield-of-faith", "shield"],
};

/** The test caster with area spells prepared (#338). */
const AREAS = {
  cantrips: ["fire-bolt", "sacred-flame"],
  prepared: ["burning-hands", "shatter", "cure-wounds"],
};

/**
 * The playthroughs' modules, each with the fighters that play it in turn:
 * every fixture module with Ada at level 1 and the veteran (#156), then
 * trade, two light weapons and traps (#269): a merchant who buys treasure,
 * one who sells ammunition with an archer who has a stowed weapon and too
 * few arrows to sell, and more tries at the sealed crypt's trap; then a
 * level-3 Thief's fights with Hide and Steady Aim (#307); then a level-5
 * Rogue's, with Cunning Strike and Uncanny Dodge (#308); then the level-3
 * test caster's, with 1st- and 2nd-level slots (#336), with buffs and
 * Shield prepared (#337), and with area spells (#338); then a level-3
 * Life Cleric's (#341).
 */
const PLAYTHROUGHS = [
  ...FIXTURE_MODULES.map((adventure) => ({
    adventure,
    fighters: [ada, veteran()],
  })),
  { adventure: gemMarket, fighters: [ada, twin] },
  { adventure: archeryBarrow, fighters: [twin, archer()] },
  // The Thief carries thieves' tools, so it picks the iron door (#309).
  { adventure: sealedCrypt, fighters: [twin, thief()] },
  { adventure: goblinTrio, fighters: [thief()] },
  { adventure: goblinTrio, fighters: [rogueAt5()] },
  { adventure: goblinTrio, fighters: [testCasterAt(3)] },
  { adventure: goblinTrio, fighters: [testCasterAt(3, BUFFED)] },
  { adventure: goblinTrio, fighters: [testCasterAt(3, AREAS)] },
  // A level-3 Life Cleric against a zombie and goblins (#341).
  { adventure: sealedCrypt, fighters: [lifeCleric()] },
  { adventure: goblinTrio, fighters: [lifeCleric()] },
];

/**
 * Every state of the seeded playthroughs: each of `PLAYTHROUGHS`'s modules,
 * 25 seeds, its fighters in turn, up to 60 steps each, ending state included.
 * Each step plays a random enabled action, which the engine must accept.
 */
export function* playthroughStates() {
  for (const { adventure, fighters } of PLAYTHROUGHS) {
    for (let seed = 0; seed < 25; seed++) {
      const runtime = createFifthRuntime(
        adventure,
        fighters[seed % fighters.length],
      );
      const random = createSeededRandom(seed);
      let state = runtime.handleAction(
        runtime.createSession(),
        { type: "begin" },
        random,
      ).state;
      for (let step = 0; step < 60 && state.status === "playing"; step++) {
        yield { runtime, state, seed };
        const enabled = runtime
          .projectActions(state)
          .filter(({ available }) => available);
        assert.ok(enabled.length > 0, "a playing session can always act");
        const chosen = enabled[random.roll(enabled.length) - 1];
        const result = runtime.handleAction(
          state,
          engineAction(chosen),
          random,
        );
        assert.equal(result.rejection, undefined, result.rejection?.reason);
        state = result.state;
      }
      yield { runtime, state, seed };
    }
  }
}
