import { normalizeDmText, type DmModel } from "./dm-turn.js";
import type { FifthSession, HistoryEntry } from "./session-5e.js";

export const isLaneGate = (adventureId: string, roomId: string) =>
  adventureId === "bramblecote-cider-house" && roomId === "lane-gate";

/** A first impression from the same visible descriptions the player can inspect. */
export async function narrateLaneGate(
  session: FifthSession,
  model: DmModel,
): Promise<HistoryEntry | undefined> {
  const scene = session.runtime.projectDmScene(session.state);
  const room = scene.room;
  // Choose from things the player can follow up on, without drawing a game die.
  const details = [...room.features, ...(room.npcs ?? [])];
  const focus = details[session.seed % details.length]?.name ?? room.name;
  const response = await model.respond({
    promptVersion: "lane-gate-opening-v1",
    systemPrompt:
      "Write a first impression for a player arriving on foot. In two or three sentences, draw the eye from a sensory impression to the requested focus. Use fresh phrasing grounded in the supplied room descriptions. Leave the meaning of clues and the next action to the player. No invented objects, sounds, tracks, dialogue, or outcomes. Write a single paragraph of at most 65 words, without a heading or a question.",
    playerInput: `What is my first impression as I arrive? Bring this visible detail into focus: ${focus}.`,
    transcript: [],
    scene: {
      ...scene,
      room: {
        ...room,
        npcs: (room.npcs ?? []).map((npc) => ({ ...npc, subjects: [] })),
      },
    },
    characterStatus: session.runtime.projectCharacterStatus(session.state),
    tools: [],
    toolResults: [],
  });
  if (!("text" in response)) {
    return undefined;
  }
  const prose = normalizeDmText(response.text).replace(/\s+/gu, " ");
  if (!prose || prose.length > 600) {
    return undefined;
  }
  const text = `${room.name} — ${prose}`;
  return {
    reply: "",
    cards: [{ kind: "narration", text, lines: [{ text, rolls: [] }] }],
  };
}
