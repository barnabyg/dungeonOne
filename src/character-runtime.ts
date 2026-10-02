import { createChapelCluesRuntime } from "./chapel-clues-runtime.js";
import type {
  ChapelCluesDefinition,
  ValidatedAdventure,
} from "./adventure-loader.js";
import type {
  AdventureRuntime,
  RuntimeState,
  RuntimeResult,
  RuntimeToolResult,
} from "./runtime-contract.js";
import type { ClueState } from "./chapel-clues-runtime.js";
import type { GameToolDefinition } from "./game-tools.js";
import type { RandomSource } from "./random.js";
import type { Action } from "./session.js";
import { parseBoundedJson } from "./bounded-json.js";
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
  const legacy = createChapelCluesRuntime(
    {
      ...content,
      snapshot: {
        ...definition,
        schemaVersion: 16,
        rulesVersion: "chapel-clues-rules-v17",
        player: { ...definition.player, hp: sheet.hp, maxHp: profile.maxHp },
        combatProfile: profile,
        socialChallenges: (definition.socialChallenges ?? []).map(
          (challenge) => ({
            ...challenge,
            modifier: abilityModifier(
              sheet.abilities[
                support.socialAbilities.find(
                  ({ challengeId }) => challengeId === challenge.id,
                )!.ability
              ],
            ),
          }),
        ),
        distractionProfiles: (definition.distractionProfiles ?? []).map(
          (challenge) => ({
            ...challenge,
            modifier: abilityModifier(sheet.abilities.dexterity),
          }),
        ),
        deceptionProfiles: (definition.deceptionProfiles ?? []).map(
          (challenge) => ({
            ...challenge,
            playerModifier: abilityModifier(sheet.abilities.charisma),
          }),
        ),
      },
    },
    { minimumDamage: 1 },
  );
  const stateOf = (state: RuntimeState): ClueState => {
    if (!("runtimeKind" in state) || state.runtimeKind !== "chapel-clues") {
      throw new Error("Invalid character adventure state.");
    }
    return state;
  };
  const availableChecks = (state: RuntimeState) => {
    const current = stateOf(state);
    const features = legacy.projectDmScene(current).room.features;
    return current.status !== "playing" || current.combat !== undefined
      ? []
      : support.checks.filter(
          (check) =>
            current.abilityChecks?.[check.id] === undefined &&
            features.some(({ id }) => id === check.featureId),
        );
  };
  const handleAction = (
    state: RuntimeState,
    action: Action,
    random?: Pick<RandomSource, "roll">,
  ): RuntimeResult => {
    if (action.type !== "ability-check") {
      return legacy.handleAction(state, action, random);
    }
    const check = availableChecks(state).find(
      ({ id }) => id === action.checkId,
    );
    if (check === undefined) {
      return {
        state,
        rejection: { reason: "invisible-target", target: action.checkId },
      };
    }
    if (random === undefined) {
      throw new Error("Ability checks require recorded dice.");
    }
    const die = random.roll(20);
    if (!Number.isInteger(die) || die < 1 || die > 20) {
      throw new Error("Invalid ability-check die.");
    }
    const modifier = abilityModifier(sheet.abilities[check.ability]);
    const total = die + modifier;
    const result = total >= check.dc ? "success" : "failure";
    const current = stateOf(state);
    return {
      state: {
        ...current,
        abilityChecks: {
          ...current.abilityChecks,
          [check.id]: { die, modifier, total, dc: check.dc, result },
        },
      },
      events: [
        {
          type: "clue",
          operation: "ability-check",
          text: `${check.ability} ${sheet.abilities[check.ability]}: d20 ${die} ${modifier >= 0 ? "+" : ""}${modifier} = ${total} vs DC ${check.dc} — ${result}. ${result === "success" ? check.successText : check.failureText}`,
        },
      ],
    };
  };
  const runtime: AdventureRuntime = Object.freeze({
    ...legacy,
    content,
    startingCharacter: sheet,
    engineVersion: "character-adventure-engine-v1",
    rulesVersion: "character-adventure-rules-v1",
    promptVersion: "character-adventure-dm-v1",
    toolSchemaVersion: "character-adventure-tools-v1",
    commandTraceFormatVersion: 6,
    dmTraceFormatVersion: 6,
    createSession: () => ({
      ...legacy.createSession(),
      character: sheet,
      abilityChecks: {},
    }),
    mutationToolNames: [...legacy.mutationToolNames, "check_ability"],
    systemPrompt: `${legacy.systemPrompt} Character scores, equipment, levels and XP are engine-owned. Never invent or change them. Optional ability checks have remembered outcomes and cost no time; use check_ability only for an explicit request naming an offered check. Essential observation remains available through ordinary inspect/search and dialogue.`,
    parseCommand: (input) =>
      input.trim().startsWith("check ")
        ? { type: "ability-check", checkId: input.trim().slice(6) }
        : legacy.parseCommand(input),
    handleAction,
    getGameToolDefinitions: (state) => {
      const checks = availableChecks(state);
      const tools: GameToolDefinition[] = [
        ...legacy.getGameToolDefinitions(state),
      ];
      if (checks.length > 0) {
        tools.push({
          type: "function",
          name: "check_ability",
          strict: true,
          description:
            "Attempt one visible optional ability check once. " +
            checks
              .map(
                (check) =>
                  `${check.id}: ${check.ability}, DC ${check.dc}, no time cost; failure preserves routine observation.`,
              )
              .join(" "),
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["checkId"],
            properties: {
              checkId: { type: "string", enum: checks.map(({ id }) => id) },
            },
          },
        });
      }
      return tools;
    },
    dispatchGameTool: (state, call, random, playerInput): RuntimeToolResult => {
      if (call.name === "get_character_status") {
        return {
          state,
          modelOutput: {
            ok: true,
            status: runtime.projectCharacterStatus(state),
          },
        };
      }
      if (call.name !== "check_ability") {
        return legacy.dispatchGameTool(state, call, random, playerInput);
      }
      let args: unknown;
      try {
        args = parseBoundedJson(call.argumentsJson, 8192, 4);
      } catch {
        return {
          state,
          modelOutput: { ok: false, error: { code: "malformed-json" } },
        };
      }
      if (
        args === null ||
        typeof args !== "object" ||
        Array.isArray(args) ||
        Object.keys(args).length !== 1 ||
        !("checkId" in args) ||
        typeof args.checkId !== "string"
      ) {
        return {
          state,
          modelOutput: { ok: false, error: { code: "invalid-arguments" } },
        };
      }
      const action: Action = { type: "ability-check", checkId: args.checkId };
      const result = handleAction(state, action, random);
      return result.rejection === undefined
        ? {
            state: result.state,
            action,
            engineResult: { events: result.events },
            modelOutput: { ok: true, events: result.events },
          }
        : {
            state,
            modelOutput: {
              ok: false,
              error: { code: "unavailable-reference" },
            },
          };
    },
    renderResult: (result) => {
      const rendered = legacy.renderResult(result);
      const checks =
        result.events?.flatMap((event) =>
          event.type === "clue" && event.check !== undefined
            ? [event.check]
            : [],
        ) ?? [];
      return [
        rendered,
        ...checks.map((check) => {
          const ability = support.socialAbilities.find(
            ({ challengeId }) => challengeId === check.challengeId,
          )!.ability;
          return `Character bonus: ${ability} ${sheet.abilities[ability]} (${abilityModifier(sheet.abilities[ability]) >= 0 ? "+" : ""}${abilityModifier(sheet.abilities[ability])}).`;
        }),
      ]
        .filter(Boolean)
        .join("\n");
    },
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
  return runtime;
}
