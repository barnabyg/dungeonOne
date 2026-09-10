export type RoomId = "entrance" | "guardroom" | "reliquary";
export type FeatureId = "ruined-archway" | "cold-hearth" | "stone-pedestal";
export type EquipmentId = "longsword";

export type FeatureDefinition = Readonly<{
  id: FeatureId;
  name: string;
  description: string;
}>;

export type RoomDefinition = Readonly<{
  id: RoomId;
  name: string;
  description: string;
  features: readonly FeatureDefinition[];
  exitRoomIds: readonly RoomId[];
}>;

export type EquipmentDefinition = Readonly<{
  id: EquipmentId;
  name: string;
  description: string;
}>;

export type AdventureDefinition = Readonly<{
  id: "stolen-signet";
  title: string;
  startingRoomId: RoomId;
  rooms: Readonly<Record<RoomId, RoomDefinition>>;
  equipment: Readonly<Record<EquipmentId, EquipmentDefinition>>;
}>;

export const ADVENTURE: AdventureDefinition = {
  id: "stolen-signet",
  title: "The Stolen Signet",
  startingRoomId: "entrance",
  rooms: {
    entrance: {
      id: "entrance",
      name: "Entrance",
      description:
        "You stand at the entrance to a ruined watchtower. Rain beads on the old stone.",
      features: [
        {
          id: "ruined-archway",
          name: "ruined archway",
          description:
            "The cracked archway still bears the worn crest of the old watch.",
        },
      ],
      exitRoomIds: ["guardroom"],
    },
    guardroom: {
      id: "guardroom",
      name: "Guardroom",
      description:
        "Dust blankets an abandoned guardroom where open passages lead onward and back.",
      features: [
        {
          id: "cold-hearth",
          name: "cold hearth",
          description:
            "Only grey ash remains in the hearth; no fire has burned here for years.",
        },
      ],
      exitRoomIds: ["entrance", "reliquary"],
    },
    reliquary: {
      id: "reliquary",
      name: "Reliquary",
      description:
        "A vaulted reliquary waits in silence beyond the guardroom passage.",
      features: [
        {
          id: "stone-pedestal",
          name: "stone pedestal",
          description:
            "The bare stone pedestal is carved with curling ivy and heraldic shields.",
        },
      ],
      exitRoomIds: ["guardroom"],
    },
  },
  equipment: {
    longsword: {
      id: "longsword",
      name: "longsword",
      description: "A dependable steel longsword, kept ready at your side.",
    },
  },
};
