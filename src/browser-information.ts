import type { ChapelCluesDefinition } from "./adventure-loader.js";
import type { SaveSession } from "./save.js";

export type BrowserInformation = Readonly<{
  defense?: number;
  attack?: string;
  spentItems: readonly string[];
  relationships: readonly string[];
  currentLeads: readonly string[];
  refreshedLeads: boolean;
  sceneDescription?: string;
}>;

// Browser presentation only: do not change released runtime projections, AI
// contracts, content digests or the facts replayed from historical saves.
export function browserInformation(session: SaveSession): BrowserInformation {
  const definition = session.runtime.content?.snapshot as
    ChapelCluesDefinition | undefined;
  const scene = session.runtime.projectDmScene(session.state);
  const state = session.state;
  const profile = definition?.combatProfile;
  const refreshedLeads = (definition?.schemaVersion ?? 0) >= 16;
  const milestones: readonly string[] = scene.journal?.quest.milestones ?? [];
  const ending =
    scene.journal && "ending" in scene.journal
      ? scene.journal.ending
      : undefined;
  let currentLeads = scene.journal?.actionableLeads ?? [];
  if (refreshedLeads) {
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
  }
  return {
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
    refreshedLeads,
    ...(refreshedLeads && ending !== undefined
      ? { sceneDescription: ending.narration }
      : refreshedLeads &&
          scene.room.id === "beacon-tower" &&
          milestones.includes("confrontation-resolved")
        ? {
            sceneDescription:
              "The signal controls are secured. Review the final warning board before making a final commitment. The keeper and caravan remain unconfirmed.",
          }
        : {}),
  };
}
