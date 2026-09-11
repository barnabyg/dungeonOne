export type RoomId = "entrance" | "guardroom" | "reliquary";
export type DoorId = "entrance-door";
export type FeatureId = "ruined-archway" | "cold-hearth" | "stone-pedestal";
export type EquipmentId = "longsword";
export type ItemId = "signet";
export type OpponentId = "goblin";

export type DamageDefinition = Readonly<{
  dice: number;
  sides: number;
  modifier: number;
}>;

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
  damage: DamageDefinition;
}>;

export type OpponentDefinition = Readonly<{
  id: OpponentId;
  name: string;
  description: string;
  maxHp: number;
  armorClass: number;
  attackBonus: number;
  initiativeBonus: number;
  attackName: string;
  damage: DamageDefinition;
  roomId: RoomId;
}>;

export type ItemDefinition = Readonly<{
  id: ItemId;
  name: string;
  description: string;
}>;

export type DoorDefinition = Readonly<{
  id: DoorId;
  name: string;
  description: string;
  roomIds: readonly [RoomId, RoomId];
}>;

export type AdventureDefinition = Readonly<{
  id: "stolen-signet";
  title: string;
  startingRoomId: RoomId;
  rooms: Readonly<Record<RoomId, RoomDefinition>>;
  doors: Readonly<Record<DoorId, DoorDefinition>>;
  equipment: Readonly<Record<EquipmentId, EquipmentDefinition>>;
  items: Readonly<Record<ItemId, ItemDefinition>>;
  fighter: Readonly<{
    maxHp: number;
    armorClass: number;
    attackBonus: number;
    initiativeBonus: number;
    weaponId: EquipmentId;
  }>;
  opponents: Readonly<Record<OpponentId, OpponentDefinition>>;
  objective: Readonly<{
    requiredItemId: ItemId;
    escapeRoomId: RoomId;
    exitName: string;
    description: string;
  }>;
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
            "The stone pedestal is carved with curling ivy and heraldic shields.",
        },
      ],
      exitRoomIds: ["guardroom"],
    },
  },
  doors: {
    "entrance-door": {
      id: "entrance-door",
      name: "wooden door",
      description: "A sturdy wooden door bound with weathered iron straps.",
      roomIds: ["entrance", "guardroom"],
    },
  },
  equipment: {
    longsword: {
      id: "longsword",
      name: "longsword",
      description: "A dependable steel longsword, kept ready at your side.",
      damage: { dice: 1, sides: 8, modifier: 3 },
    },
  },
  items: {
    signet: {
      id: "signet",
      name: "signet",
      description:
        "A silver signet engraved with the fighter's family crest, stolen but unharmed.",
    },
  },
  fighter: {
    maxHp: 20,
    armorClass: 16,
    attackBonus: 5,
    initiativeBonus: 1,
    weaponId: "longsword",
  },
  opponents: {
    goblin: {
      id: "goblin",
      name: "goblin",
      description: "A wiry goblin in battered leather grips a nicked scimitar.",
      maxHp: 7,
      armorClass: 13,
      attackBonus: 4,
      initiativeBonus: 2,
      attackName: "scimitar",
      damage: { dice: 1, sides: 6, modifier: 2 },
      roomId: "guardroom",
    },
  },
  objective: {
    requiredItemId: "signet",
    escapeRoomId: "reliquary",
    exitName: "far exit",
    description:
      "Retrieve the stolen signet and leave through the reliquary's far exit.",
  },
};
