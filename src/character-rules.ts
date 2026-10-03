import { randomBytes } from "node:crypto";

export const CHARACTER_RULES = "fighter-rules-v1";
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
  rulesVersion: typeof CHARACTER_RULES;
  abilities: Abilities;
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

export function characterProfile(sheet: CharacterSheet) {
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
  if (sheet.rulesVersion !== CHARACTER_RULES) {
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
  const base: CharacterSheet = {
    id,
    name: name.trim(),
    class: "Fighter",
    rulesVersion: CHARACTER_RULES,
    abilities,
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
