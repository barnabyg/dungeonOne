import type { ChapelCluesDefinition } from "./adventure-loader.js";
import type { SaveSession } from "./save.js";

export type BrowserInformation = Readonly<{
  defense?: number;
  attack?: string;
  spentItems: readonly string[];
  relationships: readonly string[];
  currentLeads: readonly string[];
  usesFinalePresentation: boolean;
  sceneDescription?: string;
  combat?: Readonly<{
    opponentName: string;
    hp: number;
    maxHp: number;
    turn: string;
  }>;
}>;

// Browser presentation only: do not change released runtime projections, AI
// contracts, content digests or the facts replayed from historical saves.
export function browserInformation(session: SaveSession): BrowserInformation {
  const definition = session.runtime.content?.snapshot as
    ChapelCluesDefinition | undefined;
  const scene = session.runtime.projectDmScene(session.state);
  const state = session.state;
  const profile =
    session.runtime.projectCharacterStatus(state).profile ??
    definition?.combatProfile;
  const usesFinalePresentation =
    session.runtime.id === "hollow-beacon" &&
    (definition?.schemaVersion ?? 0) >= 16;
  const milestones: readonly string[] = scene.journal?.quest.milestones ?? [];
  const ending =
    scene.journal && "ending" in scene.journal
      ? scene.journal.ending
      : undefined;
  const opponentId =
    scene.combat && "opponentId" in scene.combat
      ? scene.combat.opponentId
      : undefined;
  const opponent =
    opponentId && "runtimeKind" in state && state.runtimeKind === "chapel-clues"
      ? (state.monsters?.[opponentId] ?? state.npcHealth?.[opponentId])
      : undefined;
  // The clock cap is a storage bound, not the public caravan deadline.
  const sceneDescription = scene.room.description.replace(
    / Clocks: .*?(?= Ending choices:| Resolution:|$)/u,
    "",
  );
  let currentLeads = scene.journal?.actionableLeads ?? [];
  if (usesFinalePresentation) {
    const discoveries = scene.journal?.discoveries ?? [];
    const proof = discoveries.some(({ id }) =>
      ["altered-setting", "refugee-alignment"].includes(id),
    );
    currentLeads =
      scene.outcome !== "playing"
        ? []
        : scene.combat !== undefined
          ? [scene.combatStatus!]
          : milestones.includes("confrontation-resolved")
            ? [
                scene.room.id === "beacon-tower"
                  ? "Review the final warning board and the available final choices. A choice alone confirms no rescue."
                  : "Return to Beacon Tower to review the final warning decision. A choice alone confirms no rescue.",
              ]
            : scene.room.id === "beacon-tower"
              ? [
                  "Inspect the fixed tower work order and the controls in view. Physical evidence remains available after a refused conversation.",
                ]
              : proof
                ? [
                    "Compare your observed evidence with the tower work order. Read the public route costs before committing to travel.",
                  ]
                : [
                    "Compare the setting plate at the watch or the camp survey and sighting frame. Testimony and beliefs remain attributed accounts.",
                  ];
    const ionaAlive =
      "runtimeKind" in state &&
      state.runtimeKind === "chapel-clues" &&
      state.npcHealth?.iona?.hp !== 0;
    if (
      scene.outcome === "playing" &&
      scene.combat === undefined &&
      ionaAlive &&
      milestones.includes("iona-claim-attempted") &&
      !milestones.includes("iona-claim-corrected")
    ) {
      const correction = discoveries.find(({ id }) =>
        ["iona-signal-belief", "iona-claim-refusal"].includes(id),
      );
      if (correction?.actionableLead) {
        currentLeads = [correction.actionableLead, ...currentLeads];
      }
    }
  }
  return {
    sceneDescription,
    ...(opponent === undefined
      ? {}
      : {
          combat: {
            opponentName:
              [...scene.room.opponents, ...(scene.room.npcs ?? [])].find(
                ({ id }) => id === opponentId,
              )?.name ?? "Opponent",
            hp: opponent.hp,
            maxHp: opponent.maxHp,
            turn: scene.combat!.currentTurn,
          },
        }),
    ...(profile === undefined
      ? {}
      : {
          defense: profile.armorClass,
          attack: `d20 ${profile.attackBonus >= 0 ? "+" : ""}${profile.attackBonus}; damage ${profile.damage.dice}d${profile.damage.sides} ${profile.damage.modifier >= 0 ? "+" : ""}${profile.damage.modifier}`,
        }),
    // Only spent player resources and currently visible relationships are
    // projected. Unseen room items and off-scene actor state stay private.
    spentItems:
      "runtimeKind" in state && state.runtimeKind === "chapel-clues"
        ? (definition?.items ?? [])
            .filter(({ id }) => state.items?.[id] === "consumed")
            .map(({ name }) => name + " — spent; no longer carried.")
        : [],
    relationships: (scene.room.npcs ?? [])
      .filter(
        ({ condition, description }) => condition === "living" && description,
      )
      .map(({ name, description }) => name + " — " + description),
    currentLeads: [...new Set(currentLeads.filter((lead) => lead.trim()))],
    usesFinalePresentation,
    ...(usesFinalePresentation && ending !== undefined
      ? { sceneDescription: ending.narration }
      : usesFinalePresentation &&
          scene.room.id === "beacon-tower" &&
          milestones.includes("confrontation-resolved")
        ? {
            sceneDescription:
              "The signal controls are secured. Review the final warning board before making a final commitment. The keeper and caravan remain unconfirmed.",
          }
        : {}),
  };
}
