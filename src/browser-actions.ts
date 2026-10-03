import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { GameToolCall } from "./game-tools.js";
import type { SaveSession } from "./save.js";
import {
  offeredTalkApproaches,
  type ChapelCluesDefinition,
} from "./adventure-loader.js";

export type BrowserAction = Readonly<{
  id: string;
  contextId: string;
  label: string;
  message: string;
  stakes?: string;
  call: GameToolCall;
}>;

export function matchesBrowserAction(
  action: BrowserAction,
  call: GameToolCall,
): boolean {
  if (action.call.name !== call.name) {
    return false;
  }
  try {
    const args: unknown = JSON.parse(call.argumentsJson);
    const expected: unknown = JSON.parse(action.call.argumentsJson);
    return isDeepStrictEqual(args, expected);
  } catch {
    return false;
  }
}

// Project only public targets, intersected with the engine's current tools.
export function browserActions(
  session: SaveSession,
  revision: string,
): readonly BrowserAction[] {
  const scene = session.runtime.projectDmScene(session.state);
  if (scene.outcome !== "playing") {
    return [];
  }
  const tools = session.runtime.getGameToolDefinitions(session.state);
  const definition = session.runtime.content?.snapshot as
    ChapelCluesDefinition | undefined;
  const permits = (name: string, property: string, value: string) => {
    const properties = tools.find((tool) => tool.name === name)?.parameters
      .properties as Record<string, { enum?: readonly string[] }> | undefined;
    return properties?.[property]?.enum?.includes(value) === true;
  };
  const actions: BrowserAction[] = [];
  const milestones: readonly string[] = scene.journal?.quest.milestones ?? [];
  const add = (
    contextId: string,
    label: string,
    message: string,
    call: GameToolCall,
    stakes?: string,
  ) => {
    actions.push({
      id: createHash("sha256")
        .update(revision + contextId + JSON.stringify(call))
        .digest("hex"),
      contextId,
      label,
      message,
      call,
      ...(stakes === undefined ? {} : { stakes }),
    });
  };
  const offer = (
    contextId: string,
    name: GameToolCall["name"],
    property: string,
    target: string,
    label: string,
    message: string,
    stakes?: string,
  ) => {
    if (permits(name, property, target)) {
      add(
        contextId,
        label,
        message,
        { name, argumentsJson: JSON.stringify({ [property]: target }) },
        stakes,
      );
    }
  };
  for (const check of definition?.characterAdventure?.checks ?? []) {
    offer(
      "target:" + check.featureId,
      "check_ability",
      "checkId",
      check.id,
      "Try " + check.ability + " check",
      "Try the " +
        check.ability +
        " check at " +
        definition!.features.find(({ id }) => id === check.featureId)!.name,
      `${check.ability} check, DC ${check.dc}; once per adventure, no time cost. Success earns ${definition!.characterAdventure!.rewards.filter((reward) => reward.trigger === "check-success" && reward.targetId === check.id).reduce((xp, reward) => xp + reward.xp, 0)} pending XP if this character has not earned that reward before. Failure preserves ordinary observation and investigation.`,
    );
  }
  for (const exit of scene.room.exits) {
    const combatRoute =
      session.runtime.id === "hollow-beacon" &&
      (((definition?.schemaVersion ?? 0) >= 12 &&
        exit.destinationId === "ridge-trail" &&
        !milestones.includes("ridge-cleared")) ||
        ((definition?.schemaVersion ?? 0) >= 13 &&
          exit.destinationId === "tower-approach" &&
          !milestones.includes("approach-cleared")));
    offer(
      "exit:" + exit.destinationId,
      "move",
      "destinationId",
      exit.destinationId,
      "Travel to " + exit.name,
      "Travel to " + exit.name,
      combatRoute
        ? "Combat on arrival. No retreat or surrender once fighting."
        : undefined,
    );
    offer(
      "exit:" + exit.destinationId,
      "inspect",
      "target",
      exit.destinationId,
      "Inspect exit",
      "Inspect " + exit.name,
    );
    offer(
      "exit:" + exit.destinationId,
      "examine",
      "target",
      exit.destinationId,
      "Examine exit",
      "Examine " + exit.name,
    );
  }
  for (const target of [
    ...scene.room.features,
    ...scene.room.items,
    ...scene.room.opponents,
  ]) {
    offer(
      "target:" + target.id,
      "inspect",
      "target",
      target.id,
      "Inspect",
      "Inspect " + target.name,
    );
    offer(
      "target:" + target.id,
      "search",
      "target",
      target.id,
      "Search",
      "Search " + target.name,
    );
    offer(
      "target:" + target.id,
      "examine",
      "target",
      target.id,
      "Examine",
      "Examine " + target.name,
    );
    offer(
      "target:" + target.id,
      "take",
      "item_id",
      target.id,
      "Take",
      "Take " + target.name,
    );
  }
  for (const choice of scene.itemUseChoices ?? []) {
    const item = session.runtime
      .projectCharacterStatus(session.state)
      .collectedItems.find(({ id }) => id === choice.itemId)!;
    const target = scene.room.features.find(
      ({ id }) => id === choice.featureId,
    )!;
    const message = "Fit " + item.name + " in " + target.name;
    const call: GameToolCall = {
      name: "place_item",
      argumentsJson: JSON.stringify({
        item_id: choice.itemId,
        target: choice.featureId,
      }),
    };
    for (const contextId of [
      "inventory:" + choice.itemId,
      "target:" + choice.featureId,
    ]) {
      add(contextId, choice.label, message, call, choice.stakes);
    }
  }
  for (const choice of scene.recoveryChoices ?? []) {
    offer(
      "target:" + choice.featureId,
      "recover",
      "target",
      choice.featureId,
      choice.label,
      "Recover at " +
        scene.room.features.find(({ id }) => id === choice.featureId)!.name,
      choice.stakes,
    );
  }
  for (const choice of scene.combatChoices ?? []) {
    offer(
      "target:" + choice.featureId,
      "brace",
      "target",
      choice.featureId,
      choice.label,
      "Brace " +
        scene.room.features.find(({ id }) => id === choice.featureId)!.name,
      choice.stakes,
    );
  }
  for (const opponent of scene.room.opponents) {
    offer(
      "target:" + opponent.id,
      "attack",
      "opponent_id",
      opponent.id,
      "Attack (1 action)",
      "Attack " + opponent.name,
      scene.combatStatus,
    );
  }
  for (const item of session.runtime.projectCharacterStatus(session.state)
    .collectedItems) {
    offer(
      "inventory:" + item.id,
      "inspect",
      "target",
      item.id,
      "Inspect",
      "Inspect " + item.name,
    );
    offer(
      "inventory:" + item.id,
      "examine",
      "target",
      item.id,
      "Examine",
      "Examine " + item.name,
    );
    offer(
      "inventory:" + item.id,
      "use_item",
      "item_id",
      item.id,
      "Use " + item.name,
      "Use " + item.name,
      scene.combatStatus,
    );
  }
  for (const npc of scene.room.npcs ?? []) {
    if (npc.condition === "dead") {
      offer(
        "npc:" + npc.id,
        "inspect",
        "target",
        npc.id,
        "Inspect remains",
        "Inspect " + npc.name,
      );
      offer(
        "npc:" + npc.id,
        "search",
        "target",
        npc.id,
        "Search remains",
        "Search " + npc.name,
      );
      offer(
        "npc:" + npc.id,
        "examine",
        "target",
        npc.id,
        "Examine remains",
        "Examine " + npc.name,
      );
    }
    for (const subject of npc.subjects) {
      if (
        permits("talk", "speakerId", npc.id) &&
        permits("talk", "topicId", subject.id)
      ) {
        const topic = definition?.npcs
          ?.find(({ id }) => id === npc.id)
          ?.topics.find(({ id }) => id === subject.id);
        for (const approach of topic === undefined
          ? ([subject.intent === "claim" ? "persuade" : "ask"] as const)
          : offeredTalkApproaches(topic)) {
          if (!permits("talk", "approach", approach)) {
            continue;
          }
          add(
            "npc:" + npc.id,
            (approach === "ask" ? "" : "Persuade: ") + subject.name,
            approach === "ask"
              ? "Ask " + npc.name + ' about "' + subject.name + '".'
              : "Persuade " + npc.name + ' to discuss "' + subject.name + '".',
            {
              name: "talk",
              argumentsJson: JSON.stringify({
                speakerId: npc.id,
                topicId: subject.id,
                approach,
              }),
            },
            subject.stakes,
          );
        }
      }
    }
    if ((definition?.schemaVersion ?? 0) >= 15) {
      offer(
        "npc:" + npc.id,
        "attack",
        "opponent_id",
        npc.id,
        "Attack (1 action)",
        "Attack " + npc.name,
        scene.combat === undefined
          ? "Start combat. Attack costs 1 action, 0 days. At 0 HP the session ends in defeat; no retreat or surrender after attacking."
          : scene.combatStatus,
      );
    }
  }
  for (const choice of scene.endingChoices ?? []) {
    offer(
      "ending",
      "resolve_quest",
      "resolutionId",
      choice.id,
      choice.label,
      "Resolve " + choice.label,
      choice.stakes,
    );
  }
  return actions;
}
