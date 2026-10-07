// The adventure validator bound to the built-in bestiary, for tests that
// validate a shipped module's JSON, or a changed copy of it, directly.
import { validateFifthAdventure } from "../../dist/adventure-5e.js";
import { loadBuiltInFifthBestiary } from "../../dist/bestiary-5e.js";

export const bestiary = await loadBuiltInFifthBestiary();

export const validateModule = (module) =>
  validateFifthAdventure(module, bestiary);

/**
 * An inline opponent with bestiary monster `monsterId`'s stat block: it
 * fights the same, but has no treasure type (#240), so a test may give it
 * whatever loot its mechanic needs.
 */
export const inlineMonster = (monsterId, opponent) => {
  const monster = bestiary.monsters.find(({ id }) => id === monsterId);
  return {
    name: monster.statBlock.name,
    description: monster.description,
    ...opponent,
    statBlock: structuredClone(monster.statBlock),
  };
};
