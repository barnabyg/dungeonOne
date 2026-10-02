import { createChapelCluesRuntime } from "./chapel-clues-runtime.js";
import type {
  ChapelCluesDefinition,
  ValidatedAdventure,
} from "./adventure-loader.js";
import type { AdventureRuntime } from "./runtime-contract.js";
import {
  ABILITIES,
  abilityModifier,
  characterProfile,
  validateCharacter,
  type CharacterSheet,
} from "./character-rules.js";

export function createCharacterRuntime(
  content: ValidatedAdventure,
  input: CharacterSheet | undefined,
): AdventureRuntime {
  const sheet = validateCharacter(input);
  const definition = content.snapshot as ChapelCluesDefinition;
  const support = definition.characterAdventure!;
  if (
    support.rulesVersion !== sheet.rulesVersion ||
    !support.classes.includes(sheet.class) ||
    sheet.level < 1 ||
    sheet.level > 3 ||
    sheet.hp === 0
  ) {
    throw new Error("This character cannot play the adventure.");
  }
  const profile = characterProfile(sheet);
  const legacy = createChapelCluesRuntime({
    ...content,
    snapshot: {
      ...definition,
      schemaVersion: 16,
      rulesVersion: "chapel-clues-rules-v17",
      player: { ...definition.player, hp: sheet.hp, maxHp: profile.maxHp },
      combatProfile: profile,
    },
  });
  return Object.freeze({
    ...legacy,
    content,
    startingCharacter: sheet,
    engineVersion: "character-adventure-engine-v1",
    rulesVersion: "character-adventure-rules-v1",
    promptVersion: "character-adventure-dm-v1",
    toolSchemaVersion: "character-adventure-tools-v1",
    commandTraceFormatVersion: 6,
    dmTraceFormatVersion: 6,
    createSession: () => ({ ...legacy.createSession(), character: sheet }),
    projectCharacterStatus: (state) => ({
      ...legacy.projectCharacterStatus(state),
      sheet,
      profile,
      modifiers: Object.fromEntries(
        ABILITIES.map((ability) => [
          ability,
          abilityModifier(sheet.abilities[ability]),
        ]),
      ) as Record<(typeof ABILITIES)[number], number>,
      equipment: [
        { id: "chain-mail", name: "Chain mail" },
        { id: "shield", name: "Shield" },
        { id: "longsword", name: "Longsword" },
      ],
    }),
  });
}
