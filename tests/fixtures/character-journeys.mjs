export const beaconPeaceful = [
  "move watch-loft",
  "move signal-records",
  "search setting-plate",
  "move watch-loft",
  "move watch-yard",
  "move valley-road",
  "search wagon-ruts",
  "move ridge-shelter",
  "move drainage-walk",
  "move beacon-tower",
  "search tower-work-order",
  "talk vey plate-proof ask",
  "search final-warning-board",
  "resolve human-warning",
];
/** Hollow Beacon v13: examine performs each available search (#110). */
export const beaconExamine = beaconPeaceful.map((command) =>
  command.replace(/^search /, "examine "),
);
export const stonebridgePeaceful = [
  "move archives",
  "search archive-chest",
  "take bridge-seal",
  "move toll-yard",
  "move bridge-span",
  "place bridge-seal at bridge-socket",
  "resolve open-crossing",
];

export function commandCall(command) {
  const [verb, ...words] = command.split(" ");
  if (verb === "move") {
    return { name: "move", arguments: { destinationId: words[0] } };
  }
  if (verb === "search" || verb === "examine") {
    return { name: verb, arguments: { target: words[0] } };
  }
  if (verb === "take") {
    return { name: "take", arguments: { item_id: words[0] } };
  }
  if (verb === "attack") {
    return { name: "attack", arguments: { opponent_id: words[0] } };
  }
  if (verb === "check") {
    return { name: "check_ability", arguments: { checkId: words[0] } };
  }
  if (verb === "recover") {
    return { name: "recover", arguments: { target: words[0] } };
  }
  if (verb === "resolve") {
    return { name: "resolve_quest", arguments: { resolutionId: words[0] } };
  }
  if (verb === "talk") {
    return {
      name: "talk",
      arguments: { speakerId: words[0], topicId: words[1], approach: words[2] },
    };
  }
  if (verb === "place") {
    return {
      name: "place_item",
      arguments: { item_id: words[0], target: words[2] },
    };
  }
  throw new Error("Unknown journey command: " + command);
}
