import OpenAI from "openai";
import { normalizeDmText } from "./dm-turn.js";
import { openAiDmTimeoutMs } from "./openai-dm-model.js";
import type { FifthSession } from "./session-5e.js";
import type { GameSettings } from "./settings-5e.js";

/** Only these player-visible strings are sent for a room description. */
export function arrivalFacts(session: FifthSession) {
  const room = session.runtime.projectRoom(session.state);
  // Choose from things the player can follow up on, without drawing a game die.
  const details = [...room.features, ...room.creatures, ...room.items];
  const visit = session.state.visitedRoomIds.length - 1;
  const focus = details[(session.seed + visit) % details.length];
  return {
    room: room.name,
    description: room.description,
    ...(focus
      ? { focus: { name: focus.name, description: focus.description } }
      : {}),
  };
}

export type RoomNarrator = (
  facts: ReturnType<typeof arrivalFacts>,
  model: string,
  effort: GameSettings["dmReasoning"],
) => Promise<string | undefined>;

export function openRoomNarrator(apiKey: string): RoomNarrator {
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  return async (facts, model, effort) => {
    const reasoningEffort = effort === "default" ? undefined : effort;
    const response = await client.responses.create(
      {
        model,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        store: false,
        instructions:
          "Write a first impression for a player entering this location. Use only the visible facts in the supplied JSON. In two or three sentences, draw the eye from the setting to the focus if supplied. Keep clues open to interpretation. The engine introduces opponents and resolves actions separately. Do not invent objects, sounds, dialogue, or outcomes. Write a single paragraph of at most 65 words without a heading or question.",
        input: JSON.stringify(facts),
      },
      { timeout: openAiDmTimeoutMs(reasoningEffort) },
    );
    return response.status === "completed" ? response.output_text : undefined;
  };
}

export function arrivalProse(text: string | undefined) {
  const prose = normalizeDmText(text ?? "").replace(/\s+/gu, " ");
  return prose.length > 0 && prose.length <= 600 ? prose : undefined;
}
