import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { RandomSource } from "./random.js";

export const CHARACTER_RULES = "fighter-rules-v1";
/** Version 2 adds 3d6-in-order abilities; play rules are unchanged (#118). */
export const ROLLED_CHARACTER_RULES = "fighter-rules-v2";
export type FighterRules =
  typeof CHARACTER_RULES | typeof ROLLED_CHARACTER_RULES;
export const ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;
export type Ability = (typeof ABILITIES)[number];
export type Abilities = Readonly<Record<Ability, number>>;
export type AbilityRolls = Readonly<
  Record<Ability, readonly [number, number, number]>
>;
/** A rolled set below these scores cannot make a Fighter (#118). */
export const FIGHTER_MINIMUMS: Readonly<Partial<Record<Ability, number>>> = {
  strength: 9,
  dexterity: 9,
  constitution: 7,
};
export const PRESETS: Readonly<Record<string, Abilities>> = {
  balanced: {
    strength: 14,
    dexterity: 12,
    constitution: 13,
    intelligence: 10,
    wisdom: 11,
    charisma: 9,
  },
  stout: {
    strength: 16,
    dexterity: 8,
    constitution: 16,
    intelligence: 9,
    wisdom: 10,
    charisma: 10,
  },
  scout: {
    strength: 10,
    dexterity: 16,
    constitution: 10,
    intelligence: 11,
    wisdom: 13,
    charisma: 9,
  },
};
export type CharacterSheet = Readonly<{
  id: string;
  name: string;
  class: "Fighter";
  rulesVersion: FighterRules;
  abilities: Abilities;
  /** The recorded 3d6 for each ability; present only under version 2. */
  abilityRolls?: AbilityRolls;
  level: 1 | 2 | 3;
  xp: number;
  hp: number;
  equipment: readonly ["chain-mail", "shield", "longsword"];
  earnedRewards: readonly string[];
}>;

export function abilityModifier(score: number): number {
  if (!Number.isInteger(score) || score < 3 || score > 18) {
    throw new Error("Invalid ability score (3–18).");
  }
  return score === 3
    ? -3
    : score <= 5
      ? -2
      : score <= 8
        ? -1
        : score <= 12
          ? 0
          : score <= 15
            ? 1
            : score <= 17
              ? 2
              : 3;
}

export function levelForXp(xp: number): 1 | 2 | 3 {
  if (!Number.isSafeInteger(xp) || xp < 0) {
    throw new Error("Invalid experience points.");
  }
  return xp >= 2500 ? 3 : xp >= 1000 ? 2 : 1;
}

/** XP needed for the next level, or undefined at the highest level. */
export function nextLevelXp(level: 1 | 2 | 3): number | undefined {
  return level === 1 ? 1000 : level === 2 ? 2500 : undefined;
}

/** Modules declaring version 1 accept version 2, whose play rules match. */
export function playsFighterRules(
  moduleRules: string,
  sheetRules: FighterRules,
): boolean {
  return (
    moduleRules === CHARACTER_RULES &&
    (sheetRules === CHARACTER_RULES || sheetRules === ROLLED_CHARACTER_RULES)
  );
}

/** Rolls 3d6 for each ability in order: Strength first, Charisma last. */
export function rollAbilities(random: RandomSource): AbilityRolls {
  const rolls: Partial<Record<Ability, readonly [number, number, number]>> = {};
  for (const ability of ABILITIES) {
    rolls[ability] = [random.roll(6), random.roll(6), random.roll(6)];
  }
  return rolls as AbilityRolls;
}

/** Each ability score is the sum of its three recorded dice. */
export function rolledAbilities(rolls: AbilityRolls): Abilities {
  return Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      rolls[ability][0] + rolls[ability][1] + rolls[ability][2],
    ]),
  ) as Abilities;
}

/** Whether a set of scores can make a Fighter under version 2. */
export function meetsFighterMinimums(abilities: Abilities): boolean {
  return ABILITIES.every(
    (ability) => abilities[ability] >= (FIGHTER_MINIMUMS[ability] ?? 0),
  );
}

function validateAbilityRolls(sheet: CharacterSheet): void {
  if (sheet.rulesVersion === CHARACTER_RULES) {
    if ("abilityRolls" in sheet) {
      throw new Error("Version 1 sheets have no ability rolls.");
    }
    return;
  }
  const rolls = sheet.abilityRolls;
  if (
    rolls === null ||
    typeof rolls !== "object" ||
    Object.keys(rolls).length !== 6 ||
    ABILITIES.some(
      (ability) =>
        !Array.isArray(rolls[ability]) ||
        rolls[ability].length !== 3 ||
        rolls[ability].some(
          (die) => !Number.isInteger(die) || die < 1 || die > 6,
        ),
    ) ||
    !isDeepStrictEqual(rolledAbilities(rolls), { ...sheet.abilities })
  ) {
    throw new Error("Invalid ability rolls.");
  }
  if (!meetsFighterMinimums(sheet.abilities)) {
    throw new Error("Ability scores are below the Fighter minimums.");
  }
}

export function characterProfile(
  sheet: Pick<CharacterSheet, "abilities" | "level">,
) {
  const strength = abilityModifier(sheet.abilities.strength);
  const dexterity = abilityModifier(sheet.abilities.dexterity);
  const constitution = abilityModifier(sheet.abilities.constitution);
  return {
    maxHp: 18 + constitution + (sheet.level - 1) * (8 + constitution),
    armorClass: 16 + Math.min(1, dexterity),
    attackBonus: sheet.level + 1 + strength,
    initiativeBonus: dexterity,
    damage: { dice: 1, sides: 8, modifier: strength },
    nextLevelXp: sheet.level === 1 ? 1000 : sheet.level === 2 ? 2500 : null,
  };
}

export function validateCharacter(value: unknown): CharacterSheet {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid character sheet.");
  }
  const sheet = value as CharacterSheet;
  if (typeof sheet.id !== "string" || !/^[a-f0-9]{32}$/.test(sheet.id)) {
    throw new Error("Invalid character identity.");
  }
  if (
    typeof sheet.name !== "string" ||
    sheet.name.trim() !== sheet.name ||
    sheet.name.length < 1 ||
    sheet.name.length > 40 ||
    /[\p{Cc}\p{Cs}]/u.test(sheet.name)
  ) {
    throw new Error("Invalid character name.");
  }
  if (sheet.class !== "Fighter") {
    throw new Error("Unsupported character class.");
  }
  if (
    sheet.rulesVersion !== CHARACTER_RULES &&
    sheet.rulesVersion !== ROLLED_CHARACTER_RULES
  ) {
    throw new Error("Unsupported character rules.");
  }
  if (
    sheet.abilities === null ||
    typeof sheet.abilities !== "object" ||
    Object.keys(sheet.abilities).length !== 6
  ) {
    throw new Error("Invalid ability scores.");
  }
  for (const ability of ABILITIES) {
    abilityModifier(sheet.abilities[ability]);
  }
  validateAbilityRolls(sheet);
  if (sheet.level !== levelForXp(sheet.xp)) {
    throw new Error("Character level differs from experience points.");
  }
  if (
    JSON.stringify(sheet.equipment) !==
    JSON.stringify(["chain-mail", "shield", "longsword"])
  ) {
    throw new Error("Unsupported character equipment.");
  }
  if (
    !Array.isArray(sheet.earnedRewards) ||
    sheet.earnedRewards.length > 10000 ||
    sheet.earnedRewards.some(
      (id) => typeof id !== "string" || !/^[a-z][a-z0-9-]{0,127}$/.test(id),
    ) ||
    new Set(sheet.earnedRewards).size !== sheet.earnedRewards.length
  ) {
    throw new Error("Invalid earned reward identities.");
  }
  if (
    !Number.isInteger(sheet.hp) ||
    sheet.hp < 0 ||
    sheet.hp > characterProfile(sheet).maxHp
  ) {
    throw new Error("Invalid character health.");
  }
  return structuredClone(sheet);
}

export function createCharacter(
  name: string,
  preset: string,
  id = randomBytes(16).toString("hex"),
): CharacterSheet {
  const abilities = PRESETS[preset];
  if (abilities === undefined) {
    throw new Error("Choose a supported ability preset.");
  }
  return newFighter(id, name, { rulesVersion: CHARACTER_RULES, abilities });
}

/** A level 1 Fighter from engine-rolled 3d6 in order (fighter-rules-v2). */
export function createRolledCharacter(
  name: string,
  rolls: AbilityRolls,
  id = randomBytes(16).toString("hex"),
): CharacterSheet {
  const abilities = rolledAbilities(rolls);
  if (!meetsFighterMinimums(abilities)) {
    throw new Error(
      "This roll is below the Fighter minimums (Strength 9, Dexterity 9, Constitution 7); reroll before saving a character.",
    );
  }
  return newFighter(id, name, {
    rulesVersion: ROLLED_CHARACTER_RULES,
    abilities,
    abilityRolls: rolls,
  });
}

/** A level 1 Fighter at full health; key order matches released sheets. */
function newFighter(
  id: string,
  name: string,
  scores: Pick<CharacterSheet, "rulesVersion" | "abilities" | "abilityRolls">,
): CharacterSheet {
  const base: CharacterSheet = {
    id,
    name: name.trim(),
    class: "Fighter",
    ...scores,
    level: 1,
    xp: 0,
    hp: 1,
    equipment: ["chain-mail", "shield", "longsword"],
    earnedRewards: [],
  };
  return validateCharacter({ ...base, hp: characterProfile(base).maxHp });
}

export function advanceCharacter(
  sheet: CharacterSheet,
  earnedXp: number,
  hp: number,
): CharacterSheet {
  if (!Number.isSafeInteger(earnedXp) || earnedXp < 0) {
    throw new Error("Invalid reward XP.");
  }
  const xp = sheet.xp + earnedXp;
  return validateCharacter({ ...sheet, xp, level: levelForXp(xp), hp });
}
