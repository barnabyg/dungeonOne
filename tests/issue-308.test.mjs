// #308: the Rogue at levels 4 and 5. Level 4 owes an Ability Score
// Improvement (no new weapon mastery) before the next adventure; level 5
// brings Sneak Attack 3d6, proficiency +3, Cunning Strike (Poison and Trip,
// each forgoing one Sneak Attack die) and Uncanny Dodge (the reaction: halve
// a hit's damage). The AI DM chooses Cunning Strike through the attack
// tools' cunning_strike argument and answers Uncanny Dodge with the
// uncanny_dodge and take_hit tools; the balance harness plays both.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  characterAtLevel,
  gateLevelChoice,
  playAdventure,
} from "../dist/balance-5e.js";
import { renderCareerResult, simulateCareer } from "../dist/career-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import {
  applyLevelChoice,
  buildCharacter,
  characterProfile,
  defaultPlacement,
  LEVEL_XP,
  levelUpChanges,
  pendingLevelChoice,
  pendingLevelUp,
  projectLevelChoice,
  validateCharacter,
} from "../dist/character-5e.js";
import {
  act,
  availableActions,
  combatant,
  currentCombatant,
  startEncounter,
} from "../dist/encounter-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
  playerCombatant,
} from "../dist/runtime-5e.js";
import {
  FIFTH_SESSION_FORMAT,
  FifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { goblinTrio, lintelBarrow, ratTunnels } from "./fixtures/modules.mjs";

const ID = "b".repeat(32);
// Kept totals 15, 14, 13, 12, 10, 8 in roll order: Dex 17, Con 15, Wis 13,
// Cha 12, Int 10, Str 8 once placed.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const VEX = buildCharacter(
  ID,
  "Vex",
  DICE,
  { ...ROGUE.defaults, placement: defaultPlacement(DICE, ROGUE) },
  "rogue",
);

/** Vex at `level` with that level's least XP, at full health; no choice made. */
function owing(level) {
  const sheet = { ...VEX, level, xp: LEVEL_XP[level] };
  return validateCharacter({ ...sheet, hp: characterProfile(sheet).maxHp });
}
/** Vex at `level`, with +2 Dexterity chosen at level 4. */
const atLevel = (level) =>
  level < 4
    ? owing(level)
    : applyLevelChoice(owing(level), { increase: { dexterity: 2 } });

const names = (features) => features.map(({ name }) => name);

test("table: a level-4 Rogue owes an Ability Score Improvement, and no new weapon mastery", () => {
  const sheet = owing(4);
  assert.equal(sheet.level, 4);
  assert.equal(pendingLevelChoice(sheet), 4);
  const profile = characterProfile(sheet);
  // 8 + 2, then 5 + 2 for each level after.
  assert.equal(profile.maxHp, 31);
  assert.equal(profile.proficiencyBonus, 2);
  assert.deepEqual(profile.sneakAttack, { dice: 2, sides: 6 });
  const asi = profile.features.find(
    ({ id }) => id === "ability-score-improvement",
  );
  assert.equal(asi.name, "Ability Score Improvement");
  assert.match(asi.text, /^Not chosen yet: \+2 to one ability score/u);
  assert.match(asi.text, /Choose it before the next adventure\./u);
  assert.doesNotMatch(asi.text, /mastery/u);
  // The level-up card asks only for the improvement.
  const up = levelUpChanges(owing(3), sheet);
  assert.deepEqual(names(up.features), ["Ability Score Improvement"]);
  assert.deepEqual(up.choices, ["ability-score-improvement"]);
  assert.deepEqual(up.weaponMasteries, { before: 2, after: 2 });
  assert.equal(up.sneakAttack, undefined);
  assert.deepEqual(pendingLevelUp(sheet).choices, [
    "ability-score-improvement",
  ]);
  // The Fighter's level 4 still asks for both.
  assert.deepEqual(
    pendingLevelUp(
      validateCharacter({
        ...testFighterAt(3),
        level: 4,
        xp: LEVEL_XP[4],
      }),
    ).choices,
    ["ability-score-improvement", "weapon-mastery"],
  );
});

test("the Rogue's level choice is the improvement alone: a mastery is refused", () => {
  const sheet = owing(4);
  const chosen = applyLevelChoice(sheet, { increase: { dexterity: 2 } });
  assert.equal(pendingLevelChoice(chosen), undefined);
  assert.deepEqual(chosen.abilityScoreImprovements, [{ dexterity: 2 }]);
  assert.equal(chosen.abilities.dexterity, 19);
  assert.deepEqual(chosen.weaponMasteries, VEX.weaponMasteries);
  const after = characterProfile(chosen);
  assert.match(
    after.features.find(({ id }) => id === "ability-score-improvement").text,
    /^\+2 Dexterity, to a maximum of 20\./u,
  );
  assert.throws(
    () =>
      applyLevelChoice(sheet, {
        increase: { dexterity: 2 },
        mastery: "mace",
      }),
    /Invalid level choice\./u,
  );
  assert.throws(() => applyLevelChoice(sheet, {}), /Invalid level choice\./u);
  // The projection never asks for a mastery.
  const draft = projectLevelChoice(sheet, { increase: {}, mastery: null });
  assert.deepEqual(draft.masteries, []);
  assert.deepEqual(draft.unfinished, {
    increase: "Choose the ability score to improve.",
  });
  const done = projectLevelChoice(sheet, {
    increase: { dexterity: 1, constitution: 1 },
    mastery: null,
  });
  assert.deepEqual(done.unfinished, {});
  assert.ok(done.changes.includes("Dexterity 17 → 18 (modifier +3 → +4)."));
  assert.ok(
    done.changes.includes(
      "Hit points 31 → 35: the Constitution modifier counts at every level.",
    ),
  );
  assert.throws(
    () =>
      projectLevelChoice(sheet, {
        increase: { dexterity: 2 },
        mastery: "mace",
      }),
    /Invalid level choice\./u,
  );
});

test("table: a level-5 Rogue has 3d6 Sneak Attack, proficiency +3, Cunning Strike and Uncanny Dodge", () => {
  const sheet = atLevel(5);
  assert.equal(sheet.level, 5);
  const profile = characterProfile(sheet);
  assert.equal(profile.maxHp, 38);
  assert.equal(profile.proficiencyBonus, 3);
  assert.deepEqual(profile.sneakAttack, { dice: 3, sides: 6 });
  // 8 + Dexterity 19's +4 + proficiency 3.
  assert.deepEqual(profile.cunningStrike, { dc: 15 });
  assert.equal(profile.uncannyDodge, true);
  assert.deepEqual(names(profile.features), [
    "Expertise: Perception and Stealth",
    "Sneak Attack",
    "Thieves' Cant",
    "Weapon Mastery: Shortsword, Dagger",
    "Cunning Action",
    "Steady Aim",
    "Thief: Fast Hands",
    "Thief: Second-Story Work",
    "Ability Score Improvement",
    "Cunning Strike",
    "Uncanny Dodge",
  ]);
  const text = (id) => profile.features.find((entry) => entry.id === id).text;
  assert.match(text("sneak-attack"), /an extra 3d6 damage/u);
  assert.match(text("cunning-strike"), /Poison \(1d6\)/u);
  assert.match(text("cunning-strike"), /Trip \(1d6\)/u);
  assert.match(text("cunning-strike"), /DC 15/u);
  assert.match(text("cunning-strike"), /Withdraw needs positions/u);
  assert.match(text("uncanny-dodge"), /^Reaction/u);
  assert.match(text("uncanny-dodge"), /halve/u);
  const up = levelUpChanges(atLevel(4), sheet);
  assert.deepEqual(names(up.features), ["Cunning Strike", "Uncanny Dodge"]);
  assert.deepEqual(up.sneakAttack, { before: 2, after: 3 });
  assert.deepEqual(up.proficiencyBonus, { before: 2, after: 3 });
  assert.deepEqual(up.choices, []);
  // As a combatant.
  const self = playerCombatant(sheet);
  assert.deepEqual(self.sneakAttack, { dice: 3, sides: 6 });
  assert.deepEqual(self.cunningStrike, { dc: 15 });
  assert.equal(self.uncannyDodge, true);
  // A level-4 Rogue and a level-5 Fighter have neither.
  for (const other of [atLevel(4), testFighterAt(5)]) {
    const { cunningStrike, uncannyDodge } = playerCombatant(other);
    assert.deepEqual([cunningStrike, uncannyDodge], [undefined, undefined]);
  }
});

const libraryOf = (sheet) => ({
  kind: "dungeon-one-characters",
  formatVersion: FIFTH_LIBRARY_FORMAT,
  revision: "0".repeat(32),
  creationsStarted: 1,
  sessionsStarted: 0,
  characters: [{ sheet, revision: 1 }],
});

test("the library refuses an adventure until the Rogue's improvement is chosen, then saves it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-308-"));
  try {
    const path = join(directory, "characters.json");
    await writeFile(path, JSON.stringify(libraryOf(owing(4))));
    const library = new FifthCharacterLibrary(path, 7);
    let data = await library.read();
    await assert.rejects(
      startFifthAdventure(library, 0, ID, lintelBarrow, data.revision),
      /Vex must choose the level 4 Ability Score Improvement on the character sheet before starting another adventure\./u,
    );
    await assert.rejects(
      library.chooseLevel(
        ID,
        { increase: { dexterity: 2 }, mastery: "mace" },
        data.revision,
      ),
      /Invalid level choice\./u,
    );
    data = await library.chooseLevel(
      ID,
      { increase: { dexterity: 2 } },
      data.revision,
    );
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(stored.characters[0].sheet.abilityScoreImprovements, [
      { dexterity: 2 },
    ]);
    const session = await startFifthAdventure(
      library,
      0,
      ID,
      lintelBarrow,
      data.revision,
    );
    assert.equal(session.state.status, "playing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the gate builds Rogues to level 5, spending the improvement on Dexterity", () => {
  assert.deepEqual(gateLevelChoice(owing(4)), { increase: { dexterity: 2 } });
  for (const level of [4, 5]) {
    const sheet = characterAtLevel(
      DICE,
      level,
      undefined,
      false,
      undefined,
      "rogue",
    );
    assert.equal(sheet.level, level);
    assert.equal(pendingLevelChoice(sheet), undefined);
    assert.equal(sheet.abilities.dexterity, 19);
    assert.deepEqual(sheet.weaponMasteries, VEX.weaponMasteries);
  }
  // The Fighter's choice is unchanged: Strength first, and a fourth mastery.
  const fighter = gateLevelChoice(
    validateCharacter({ ...testFighterAt(3), level: 4, xp: LEVEL_XP[4] }),
  );
  assert.deepEqual(Object.keys(fighter).sort(), ["increase", "mastery"]);
});

// The encounter engine's Cunning Strike and Uncanny Dodge, with scripted dice.
const SHORTSWORD = {
  name: "Shortsword",
  bonus: 7,
  damage: { dice: 1, sides: 6, modifier: 4, type: "piercing" },
  criticalRange: 20,
  finesse: true,
};
const DAGGER = {
  name: "Dagger",
  bonus: 7,
  damage: { dice: 1, sides: 4, modifier: 0, type: "piercing" },
  criticalRange: 20,
  mastery: "Nick",
  finesse: true,
};
const SAVES = {
  strength: 0,
  dexterity: 0,
  constitution: 0,
  intelligence: 0,
  wisdom: 0,
  charisma: 0,
};
const rogue = {
  id: "pc",
  name: "Vex",
  side: "party",
  armorClass: 14,
  hp: 38,
  maxHp: 38,
  dexterity: 19,
  initiativeBonus: 4,
  saves: SAVES,
  attack: SHORTSWORD,
  lightAttack: DAGGER,
  sneakAttack: { dice: 3, sides: 6 },
  steadyAim: true,
  cunningStrike: { dc: 15 },
  uncannyDodge: true,
};
const foe = (id, name, extra = {}) => ({
  id,
  name,
  side: "opponents",
  armorClass: 11,
  hp: 59,
  maxHp: 59,
  dexterity: 8,
  initiativeBonus: -1,
  saves: SAVES,
  size: "Large",
  attack: {
    name: "Greatclub",
    bonus: 6,
    damage: { dice: 2, sides: 8, modifier: 4, type: "bludgeoning" },
    criticalRange: 20,
  },
  ...extra,
});
const ogre = foe("ogre", "Ogre");
const lookout = foe("lookout", "Lookout", { size: "Medium" });

/** A fight with `self` to act first, then the lookout, then the ogre. */
function fightWith(self = rogue, foes = [ogre, lookout]) {
  return startEncounter([self, ...foes], dice([20, 15], [20, 2], [20, 3]))
    .state;
}
const PC = { actorId: "pc" };
const hiddenFight = (self, foes) => ({
  ...fightWith(self, foes),
  hidden: ["pc"],
});
const strike = (cunningStrike, targetId = "ogre", type = "attack") => ({
  type,
  ...PC,
  targetId,
  cunningStrike,
});
const attackEvent = (result) =>
  result.events.find(({ type }) => type === "attack");
const END = { type: "end-turn", ...PC };
const DODGE = { type: "uncanny-dodge", ...PC };
const TAKE = { type: "take-hit", ...PC };

test("Cunning Strike (Trip) forgoes a Sneak Attack die, and the target saves or falls prone", () => {
  // Hidden: advantage. d20s 3 and 12, kept 12 + 7 hits; 1d6 4 + 4, and
  // Sneak Attack 2d6 of 3d6 (5, 6); then the ogre's DC 15 Dexterity save, 7.
  const tripped = act(
    hiddenFight(),
    strike("trip"),
    dice([20, 3], [20, 12], [6, 4], [6, 5], [6, 6], [20, 7]),
  );
  assert.equal(tripped.rejection, undefined);
  const event = attackEvent(tripped);
  assert.deepEqual(event.sneakAttack, { damageRolls: [5, 6] });
  assert.deepEqual(event.cunningStrike, { effect: "trip", dice: 1 });
  assert.equal(event.damage, 4 + 4 + 5 + 6);
  const [save, condition] = tripped.events.slice(1);
  assert.deepEqual(
    [save.type, save.ability, save.dc, save.total, save.success],
    ["save", "dexterity", 15, 7, false],
  );
  assert.deepEqual(condition, {
    type: "condition",
    combatantId: "ogre",
    kind: "prone",
    sourceId: "pc",
    source: "Cunning Strike (Trip)",
    turns: 1,
  });
  assert.ok(
    tripped.state.conditions.some(
      ({ kind, targetId }) => kind === "prone" && targetId === "ogre",
    ),
  );
  // Only once per Sneak Attack: the Nick attack after it, at advantage
  // against the prone ogre, can't strike again, and draws no dice.
  const again = act(
    tripped.state,
    strike("poison", "ogre", "light-attack"),
    dice(),
  );
  assert.equal(again.rejection.code, "no-sneak-attack");
  assert.match(again.rejection.reason, /already dealt Sneak Attack this turn/u);
  assert.equal(again.state, tripped.state);
});

test("Cunning Strike (Poison): a Constitution save, a 10-turn poisoning with repeat saves, and doubled forgone dice on a critical", () => {
  // A natural 20: 2d6 weapon dice, and (3 - 1) x 2 = 4 Sneak Attack dice;
  // the lookout's Constitution save, 4, fails.
  const poisoned = act(
    hiddenFight(),
    strike("poison", "lookout"),
    dice(
      [20, 20],
      [20, 1],
      [6, 1],
      [6, 1],
      [6, 2],
      [6, 2],
      [6, 2],
      [6, 2],
      [20, 4],
    ),
  );
  const event = attackEvent(poisoned);
  assert.equal(event.critical, true);
  assert.deepEqual(event.cunningStrike, { effect: "poison", dice: 2 });
  assert.equal(event.sneakAttack.damageRolls.length, 4);
  const condition = poisoned.events.find(({ type }) => type === "condition");
  assert.deepEqual(condition, {
    type: "condition",
    combatantId: "lookout",
    kind: "poisoned",
    sourceId: "pc",
    source: "Cunning Strike (Poison)",
    turns: 10,
    save: { ability: "constitution", dc: 15 },
  });
  // A successful save leaves the target unpoisoned, the die still forgone.
  const shrugged = act(
    hiddenFight(),
    strike("poison", "lookout"),
    dice([20, 15], [20, 4], [6, 1], [6, 2], [6, 3], [20, 18]),
  );
  assert.deepEqual(attackEvent(shrugged).sneakAttack, { damageRolls: [2, 3] });
  assert.equal(
    shrugged.events.find(({ type }) => type === "save").success,
    true,
  );
  assert.equal(
    shrugged.events.some(({ type }) => type === "condition"),
    false,
  );
});

test("Cunning Strike on a miss spends nothing: Sneak Attack is still to come", () => {
  const missed = act(hiddenFight(), strike("trip"), dice([20, 1], [20, 2]));
  const event = attackEvent(missed);
  assert.equal(event.hit, false);
  assert.equal(event.cunningStrike, undefined);
  assert.equal(event.sneakAttack, undefined);
  assert.equal(missed.state.economy.sneakAttack, true);
  assert.equal(
    missed.events.some(({ type }) => type === "save"),
    false,
  );
});

test("the engine refuses Cunning Strike it doesn't offer: no Sneak Attack, no feature, a target it can't affect", () => {
  // No advantage, so no Sneak Attack to spend.
  const plain = act(fightWith(), strike("trip"), dice());
  assert.equal(plain.rejection.code, "no-sneak-attack");
  assert.match(plain.rejection.reason, /this attack has no advantage/u);
  // Without the feature (a level-4 Rogue).
  const { cunningStrike: _c, ...four } = rogue;
  void _c;
  const without = act(hiddenFight(four), strike("trip"), dice());
  assert.equal(without.rejection.code, "no-cunning-strike");
  // Immune to the condition, or too large to trip.
  const skeleton = foe("ogre", "Skeleton", {
    conditionImmunities: ["poisoned"],
  });
  const giant = foe("ogre", "Giant", { size: "Huge" });
  const immune = act(
    hiddenFight(rogue, [skeleton, lookout]),
    strike("poison"),
    dice(),
  );
  assert.equal(immune.rejection.code, "cunning-strike-target");
  assert.match(immune.rejection.reason, /Skeleton can't be poisoned/u);
  const huge = act(
    hiddenFight(rogue, [giant, lookout]),
    strike("trip"),
    dice(),
  );
  assert.equal(huge.rejection.code, "cunning-strike-target");
  assert.match(huge.rejection.reason, /too large to trip/u);
  // The giant can still be poisoned.
  assert.equal(
    act(
      hiddenFight(rogue, [giant, lookout]),
      strike("poison"),
      dice([20, 1], [20, 1]),
    ).rejection,
    undefined,
  );
});

test("Uncanny Dodge: a hit waits for the answer, halves the damage, and only once a round", () => {
  // The lookout hits (15 + 6 against AC 14): the fight waits before damage.
  const hit = act(fightWith(), END, dice([20, 15]));
  assert.equal(hit.state.pendingReaction.attackerId, "lookout");
  assert.deepEqual(hit.events.at(-1), {
    type: "reaction-offered",
    reaction: "uncanny-dodge",
    combatantId: "pc",
    attackerId: "lookout",
    weapon: "Greatclub",
    d20: 15,
    bonus: 6,
    total: 21,
    armorClass: 14,
    critical: false,
  });
  assert.deepEqual(availableActions(hit.state, "pc"), [
    "uncanny-dodge",
    "take-hit",
  ]);
  // Nothing else until it is answered.
  for (const action of [
    { type: "attack", ...PC, targetId: "ogre" },
    END,
    { type: "steady-aim", ...PC },
  ]) {
    const refused = act(hit.state, action, dice());
    assert.equal(refused.rejection.code, "reaction-pending", action.type);
    assert.match(
      refused.rejection.reason,
      /Lookout's greatclub has hit Vex: first use Uncanny Dodge/u,
    );
  }
  // Dodged: 5 + 6 + 4 = 15, halved to 7. Then the ogre hits too, and its
  // 3 + 3 + 4 lands in full: the reaction is spent this round.
  const dodged = act(
    hit.state,
    DODGE,
    dice([8, 5], [8, 6], [20, 16], [8, 3], [8, 3]),
  );
  const [halved, full] = dodged.events.filter(({ type }) => type === "attack");
  assert.deepEqual(
    [halved.resumed, halved.damage, halved.uncannyDodge, halved.hpAfter],
    [true, 7, { damage: 15 }, 31],
  );
  assert.deepEqual(
    [full.resumed, full.damage, full.uncannyDodge, full.hpAfter],
    [undefined, 10, undefined, 21],
  );
  assert.equal(dodged.state.pendingReaction, undefined);
  // Round 2, the Rogue's turn: its reaction is back.
  assert.equal(dodged.state.round, 2);
  assert.deepEqual(dodged.state.reacted, []);
  assert.equal(combatant(dodged.state, "pc").hp, 21);
});

test("Uncanny Dodge halves the attack's total damage once, not each damage type", () => {
  // 1d8 + 4 slashing with 1d6 poison: 7 slashing + 3 poison = 10, halved
  // to 5. Each type halved alone would give 3 + 1 = 4; the point lost to
  // rounding goes to the larger part, the slashing.
  const poisoner = foe("lookout", "Lookout", {
    size: "Medium",
    attack: {
      name: "Shortsword",
      bonus: 6,
      damage: { dice: 1, sides: 8, modifier: 4, type: "slashing" },
      criticalRange: 20,
      rider: { damage: { dice: 1, sides: 6, modifier: 0, type: "poison" } },
    },
  });
  const hit = act(fightWith(rogue, [ogre, poisoner]), END, dice([20, 15]));
  assert.equal(hit.state.pendingReaction.attackerId, "lookout");
  const dodged = act(hit.state, DODGE, dice([8, 3], [6, 3], [20, 2]));
  const event = attackEvent(dodged);
  assert.deepEqual(
    [event.damage, event.rider.damage, event.uncannyDodge, event.hpAfter],
    [4, 1, { damage: 7, riderDamage: 3 }, 33],
  );
  assert.equal(combatant(dodged.state, "pc").hp, 33);
});

test("Uncanny Dodge: taking the hit keeps the reaction for the next hit; a miss asks nothing", () => {
  const hit = act(fightWith(), END, dice([20, 15])).state;
  // Taken in full (1 + 1 + 4); the ogre's hit then asks again.
  const taken = act(hit, TAKE, dice([8, 1], [8, 1], [20, 15]));
  assert.equal(attackEvent(taken).damage, 6);
  assert.equal(attackEvent(taken).uncannyDodge, undefined);
  assert.equal(taken.state.pendingReaction.attackerId, "ogre");
  const dodged = act(taken.state, DODGE, dice([8, 2], [8, 3]));
  assert.equal(attackEvent(dodged).damage, Math.floor((2 + 3 + 4) / 2));
  assert.equal(combatant(dodged.state, "pc").hp, 38 - 6 - 4);
  // Both miss: nothing to answer.
  const missed = act(fightWith(), END, dice([20, 2], [20, 3]));
  assert.equal(missed.state.pendingReaction, undefined);
  assert.equal(missed.state.round, 2);
  assert.equal(
    missed.events.some(({ type }) => type === "reaction-offered"),
    false,
  );
});

test("Uncanny Dodge outside its trigger is refused; a paralysed Rogue can't react", () => {
  const start = fightWith();
  assert.equal(act(start, DODGE, dice()).rejection.code, "no-reaction-trigger");
  assert.equal(act(start, TAKE, dice()).rejection.code, "no-reaction-trigger");
  const { uncannyDodge: _u, ...plain } = rogue;
  void _u;
  assert.equal(
    act(fightWith(plain), DODGE, dice()).rejection.code,
    "no-uncanny-dodge",
  );
  // Paralysed: the lookout's hit is critical (4d8 + 4) and lands at once.
  const paralysed = {
    ...start,
    conditions: [
      {
        kind: "paralysed",
        targetId: "pc",
        sourceId: "ogre",
        source: "Claw",
        turnsLeft: 2,
      },
    ],
  };
  const struck = act(
    paralysed,
    END,
    dice([20, 15], [20, 10], [8, 1], [8, 1], [8, 1], [8, 1], [20, 2], [20, 3]),
  );
  assert.equal(struck.rejection, undefined);
  assert.equal(struck.state.pendingReaction, undefined);
  assert.equal(attackEvent(struck).damage, 8);
});

test("Uncanny Dodge mid-Multiattack: the opponent's other attacks follow the answer", () => {
  const brute = foe("brute", "Brute", {
    multiattack: { attacks: 2, weapons: [ogre.attack] },
  });
  const start = startEncounter([rogue, brute], dice([20, 15], [20, 2])).state;
  const hit = act(start, END, dice([20, 15]));
  assert.equal(hit.state.pendingReaction.progress.made, 0);
  // 2 + 2 + 4 = 8, halved to 4; the second attack hits for 1 + 1 + 4.
  const after = act(
    hit.state,
    DODGE,
    dice([8, 2], [8, 2], [20, 15], [8, 1], [8, 1]),
  );
  const attacks = after.events.filter(({ type }) => type === "attack");
  assert.deepEqual(
    attacks.map(({ damage }) => damage),
    [4, 6],
  );
  assert.equal(combatant(after.state, "pc").hp, 38 - 10);
  assert.equal(currentCombatant(after.state).id, "pc");
});

test("Uncanny Dodge on a Rampage hit: the Multiattack goes on after the answer", () => {
  // The brute's first attack drops Bo; Rampage's bonus attack hits Vex and
  // waits. Answered, the turn resumes with the Multiattack's second attack,
  // and no second Rampage.
  const { uncannyDodge: _u, ...plain } = rogue;
  void _u;
  const bo = { ...plain, id: "bo", name: "Bo", hp: 4, initiativeBonus: 0 };
  const brute = foe("brute", "Brute", {
    initiativeBonus: -1,
    multiattack: { attacks: 2, weapons: [ogre.attack] },
    rampage: true,
  });
  const start = startEncounter(
    [rogue, bo, brute],
    dice([20, 15], [20, 2], [20, 10]),
  ).state;
  // Bo: target die 2, 15 + 6 hits, 1 + 1 + 4 = 6. Then Rampage on Vex.
  const hit = act(start, END, dice([2, 2], [20, 15], [8, 1], [8, 1], [20, 15]));
  assert.equal(combatant(hit.state, "bo").hp, 0);
  assert.deepEqual(hit.state.pendingReaction.progress, {
    made: 0,
    bonusAction: false,
    rampage: true,
  });
  // Halved: 2 + 2 + 4 = 8 to 4; then the second attack, 1 + 1 + 4 in full.
  const after = act(
    hit.state,
    DODGE,
    dice([8, 2], [8, 2], [20, 15], [8, 1], [8, 1]),
  );
  const attacks = after.events.filter(({ type }) => type === "attack");
  assert.deepEqual(
    attacks.map(({ damage, rampage }) => [damage, rampage]),
    [
      [4, true],
      [6, undefined],
    ],
  );
  assert.equal(combatant(after.state, "pc").hp, 38 - 10);
  assert.equal(currentCombatant(after.state).id, "pc");
  assert.equal(after.state.round, 2);
});

// The runtime, the AI DM's tools and the balance harness.

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson, text = "Done.") => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});
const said = (turn) => JSON.stringify(turn);
const attempt = (turn) => turn.toolAttempts[0];
const LEVEL_5 = atLevel(5);

/**
 * The first seed's session with the level-5 Rogue in the rat cellar's
 * fight, on its own turn in round 1, for which `ready` holds.
 */
function cellarFight(ready = () => true) {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, ratTunnels, LEVEL_5);
    session.act({ type: "move", destinationId: "rat-cellar" }, "click");
    const fight = session.state.encounter;
    if (
      fight?.outcome === "ongoing" &&
      fight.round === 1 &&
      fight.pendingReaction === undefined &&
      currentCombatant(fight).id === "pc" &&
      ready(session)
    ) {
      return session;
    }
  }
  assert.fail("no seed below 200 sets up the fight");
}

test("scripted DM: the attack tool offers Cunning Strike only with Sneak Attack, and the engine refuses one it didn't offer", async () => {
  const session = cellarFight();
  const runtime = createFifthRuntime(ratTunnels, LEVEL_5);
  const attackTool = () =>
    runtime
      .getGameToolDefinitions(session.state)
      .find(({ name }) => name === "attack");
  // No advantage yet: no cunning_strike argument.
  assert.deepEqual(Object.keys(attackTool().parameters.properties), ["target"]);
  // Asking anyway is the engine's refusal, and nothing changes.
  const before = session.state;
  const refused = await session.converse(
    "Trip the rat!",
    scriptedDm(
      "attack",
      JSON.stringify({ target: "giant-rat", cunning_strike: "trip" }),
    ),
  );
  assert.equal(
    attempt(refused.turn).result.engineResult.rejection.code,
    "no-sneak-attack",
  );
  assert.equal(session.state, before);
  // An effect the game doesn't have is malformed.
  const withdraw = await session.converse(
    "Withdraw!",
    scriptedDm(
      "attack",
      JSON.stringify({ target: "giant-rat", cunning_strike: "withdraw" }),
    ),
  );
  assert.equal(
    attempt(withdraw.turn).result.modelOutput.error.code,
    "invalid-arguments",
  );
  // Steady Aim gives the attack advantage: now Poison and Trip are offered.
  await session.converse("I steady my aim.", scriptedDm("steady_aim", "{}"));
  const tool = attackTool();
  assert.deepEqual(tool.parameters.required, ["target", "cunning_strike"]);
  assert.deepEqual(tool.parameters.properties.cunning_strike.enum, [
    "poison",
    "trip",
    null,
  ]);
  assert.match(
    tool.description,
    /Cunning Strike, only when the player asks for its effect: [^.]*giant-rat: poison \(Poison\) or trip \(Trip\)/u,
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /attack and light_attack take cunning_strike/u,
  );
  const tripped = await session.converse(
    "I sweep the rat's legs.",
    scriptedDm(
      "attack",
      JSON.stringify({ target: "giant-rat", cunning_strike: "trip" }),
    ),
  );
  assert.equal(attempt(tripped.turn).disposition.executed, true);
  const event = attempt(tripped.turn).result.engineResult.events.find(
    ({ type }) => type === "attack",
  );
  if (event.hit) {
    assert.deepEqual(event.cunningStrike, {
      effect: "trip",
      dice: event.critical ? 2 : 1,
    });
    assert.match(
      said(tripped.turn),
      /Cunning Strike: Trip, \d Sneak Attack di(e|ce) forgone/u,
    );
  } else {
    assert.equal(event.cunningStrike, undefined);
  }
});

/**
 * The level-5 Rogue's session with a hit waiting for Uncanny Dodge, and the
 * click (its result and dice) that left it waiting.
 */
function waitingHit() {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, ratTunnels, LEVEL_5);
    let waiting = session.act(
      { type: "move", destinationId: "rat-cellar" },
      "click",
    );
    for (
      let step = 0;
      step < 10 && session.state.encounter?.outcome === "ongoing";
      step++
    ) {
      if (session.state.encounter.pendingReaction !== undefined) {
        return { session, waiting };
      }
      waiting = session.act({ type: "end-turn", actorId: "pc" }, "click");
    }
  }
  assert.fail("no seed below 200 lands a hit on the Rogue");
}

test("scripted DM: a waiting hit offers only uncanny_dodge and take_hit, and nothing else is accepted", async () => {
  const runtime = createFifthRuntime(ratTunnels, LEVEL_5);
  // Outside its trigger the tool is not offered, and the engine refuses it.
  const calm = cellarFight();
  const calmTools = runtime
    .getGameToolDefinitions(calm.state)
    .map(({ name }) => name);
  assert.ok(!calmTools.includes("uncanny_dodge"));
  assert.ok(!calmTools.includes("take_hit"));
  const early = await calm.converse(
    "I dodge!",
    scriptedDm("uncanny_dodge", "{}"),
  );
  assert.equal(
    attempt(early.turn).result.engineResult.rejection.code,
    "no-reaction-trigger",
  );

  const { session } = waitingHit();
  const tools = runtime
    .getGameToolDefinitions(session.state)
    .map(({ name }) => name);
  assert.deepEqual(tools.sort(), [
    "get_character_status",
    "look",
    "take_hit",
    "uncanny_dodge",
  ]);
  assert.match(
    runtime.projectDmScene(session.state).combatStatus,
    /has hit the character, and waits for the player's answer before its damage: uncanny_dodge to halve it, or take_hit\./u,
  );
  const views = runtime.projectActions(session.state);
  assert.deepEqual(
    views.map(({ action, available }) => [action, available]),
    [
      ["uncanny-dodge", true],
      ["take-hit", true],
    ],
  );
  // The DM can't attack, or end the turn, first.
  const before = session.state;
  for (const [name, argumentsJson] of [
    ["attack", JSON.stringify({ target: "giant-rat" })],
    ["end_turn", "{}"],
  ]) {
    const { turn } = await session.converse(
      `Do ${name}.`,
      scriptedDm(name, argumentsJson),
    );
    assert.equal(
      attempt(turn).result.engineResult.rejection.code,
      "reaction-pending",
      name,
    );
    assert.equal(session.state, before);
  }
  const hp = session.state.character.hp;
  const { turn } = await session.converse(
    "I roll with the blow.",
    scriptedDm("uncanny_dodge", "{}"),
  );
  assert.equal(attempt(turn).disposition.executed, true);
  const landed = attempt(turn).result.engineResult.events.find(
    (event) => event.type === "attack" && event.resumed === true,
  );
  assert.equal(landed.damage, Math.floor(landed.uncannyDodge.damage / 2));
  assert.match(
    said(turn),
    /Vex uses Uncanny Dodge from Giant Rat's Bite\. Damage [^;]+, halved to \d+ by Uncanny Dodge; Vex has \d+\/38 HP\./u,
  );
  assert.equal(
    session.state.character.hp,
    hp - landed.damage - (landed.rider?.damage ?? 0),
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /only uncanny_dodge and take_hit are offered/u,
  );
});

test("the result card shows a waiting hit's roll, and its damage once answered", () => {
  const { session, waiting } = waitingHit();
  const lines = describeFifthResult(waiting.result, waiting.rolls, "Vex");
  const offered = lines.find(({ text }) => /Uncanny Dodge/u.test(text));
  assert.match(
    offered.text,
    /^Giant Rat attacks Vex with Bite: \d+ [+-] \d+ = \d+ against AC \d+\. (Hit\.|Critical hit!) Before its damage is rolled, Vex can use Uncanny Dodge to halve it, or take the hit\.$/u,
  );
  assert.deepEqual(
    offered.rolls.map(({ purpose }) => purpose),
    ["attack"],
  );
  // Taken in full: the answer draws and shows only the damage.
  const taken = session.act({ type: "take-hit", actorId: "pc" }, "click");
  const [first] = describeFifthResult(taken.result, taken.rolls, "Vex");
  assert.match(
    first.text,
    /^Vex takes the hit from Giant Rat's Bite\. Damage/u,
  );
  assert.deepEqual(
    first.rolls.map(({ purpose }) => purpose),
    ["damage"],
  );
  assert.equal(first.rolls[0].halved, undefined);
  // Halved: the damage group says so.
  const again = waitingHit();
  const dodged = again.session.act(
    { type: "uncanny-dodge", actorId: "pc" },
    "click",
  );
  const [halved] = describeFifthResult(dodged.result, dodged.rolls, "Vex");
  assert.equal(halved.rolls[0].halved, true);
  assert.match(halved.text, /halved to \d+ by Uncanny Dodge/u);
});

test("the balance harness plays a level-5 Rogue with Cunning Strike and Uncanny Dodge", () => {
  const sheet = characterAtLevel(DICE, 5, undefined, false, undefined, "rogue");
  const runtime = createFifthRuntime(goblinTrio, sheet);
  const seen = { strike: 0, dodge: 0 };
  const watched = {
    ...runtime,
    handleAction(state, action, random) {
      const result = runtime.handleAction(state, action, random);
      for (const event of result.events ?? []) {
        if (event.type === "attack" && event.cunningStrike !== undefined) {
          seen.strike += 1;
        }
        if (event.type === "attack" && event.uncannyDodge !== undefined) {
          seen.dodge += 1;
        }
      }
      return result;
    },
  };
  const runs = Array.from({ length: 10 }, (_, seed) =>
    playAdventure(watched, "direct", seed),
  );
  assert.ok(runs.some(({ outcome }) => outcome === "victory"));
  assert.ok(seen.strike > 0, "the harness uses Cunning Strike");
  assert.ok(seen.dodge > 0, "the harness uses Uncanny Dodge");
});

test("the save and trace formats bump", () => {
  assert.ok(FIFTH_SESSION_FORMAT >= 34);
  assert.ok(FIFTH_TRACE_FORMAT >= 28);
  assert.match(FIFTH_PROMPT_VERSION, /^5e-dm-v(2\d)$/u);
});

test("the career simulation can play a Rogue career", () => {
  const report = simulateCareer([ratTunnels, goblinTrio], {
    seeds: [0, 1, 2],
    requiredLevel: 2,
    classId: "rogue",
    sampleSize: 200,
  });
  assert.equal(report.classId, "rogue");
  assert.equal(report.kit, ROGUE.defaults.kit);
  assert.ok(report.runs.every(({ sheet }) => sheet.class === "rogue"));
  assert.match(renderCareerResult(report), /percentile Rogue with/u);
});
