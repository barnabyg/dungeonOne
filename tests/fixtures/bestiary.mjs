// The adventure validator bound to the built-in bestiary, for tests that
// validate a shipped module's JSON, or a changed copy of it, directly.
import { validateFifthAdventure } from "../../dist/adventure-5e.js";
import { loadBuiltInFifthBestiary } from "../../dist/bestiary-5e.js";

export const bestiary = await loadBuiltInFifthBestiary();

export const validateModule = (module) =>
  validateFifthAdventure(module, bestiary);
