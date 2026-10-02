export const journey = [
  [
    "talk iona brief ask",
    "Ask Captain Iona about the beacon",
    "talk",
    { speakerId: "iona", topicId: "brief", approach: "ask" },
  ],
  [
    "move watch-loft",
    "Travel to Watch Loft",
    "move",
    { destinationId: "watch-loft" },
  ],
  [
    "talk pell shift ask",
    "Ask Pell about the last shift",
    "talk",
    { speakerId: "pell", topicId: "shift", approach: "ask" },
  ],
  [
    "move signal-records",
    "Travel to Signal Records Room",
    "move",
    { destinationId: "signal-records" },
  ],
  [
    "search setting-plate",
    "Search beacon setting plate",
    "search",
    { target: "setting-plate" },
  ],
  [
    "take component",
    "Take spare signal component",
    "take",
    { item_id: "signal-component" },
  ],
  [
    "move watch-loft",
    "Travel to Watch Loft",
    "move",
    { destinationId: "watch-loft" },
  ],
  [
    "talk pell shift ask",
    "Ask Pell about the last shift",
    "talk",
    { speakerId: "pell", topicId: "shift", approach: "ask" },
  ],
  [
    "move watch-yard",
    "Travel to Watch Yard",
    "move",
    { destinationId: "watch-yard" },
  ],
  [
    "move ridge-trail",
    "Travel to Ridge Trail",
    "move",
    { destinationId: "ridge-trail" },
  ],
  ["brace cart", "Brace fallen cart", "brace", { target: "fallen-cart" }],
  ...Array.from({ length: 4 }, () => [
    "attack raider",
    "Attack ridge raider",
    "attack",
    { opponent_id: "ridge-raider" },
  ]),
  [
    "move ridge-shelter",
    "Travel to Ridge Shelter",
    "move",
    { destinationId: "ridge-shelter" },
  ],
  [
    "recover station",
    "Recover at dressing station",
    "recover",
    { target: "dressing-station" },
  ],
  [
    "move tower-approach",
    "Travel to Tower Approach",
    "move",
    { destinationId: "tower-approach" },
  ],
  ...Array.from({ length: 3 }, () => [
    "attack sentry",
    "Attack tower sentry",
    "attack",
    { opponent_id: "tower-sentry" },
  ]),
  [
    "move beacon-tower",
    "Travel to Beacon Tower",
    "move",
    { destinationId: "beacon-tower" },
  ],
  ...Array.from({ length: 3 }, () => [
    "attack vey",
    "Attack Vey",
    "attack",
    { opponent_id: "vey" },
  ]),
  [
    "search control-access",
    "Search unattended signal controls",
    "search",
    { target: "control-access" },
  ],
  [
    "move ridge-shelter",
    "Travel to Ridge Shelter",
    "move",
    { destinationId: "ridge-shelter" },
  ],
  [
    "move tower-approach",
    "Travel to Tower Approach",
    "move",
    { destinationId: "tower-approach" },
  ],
  [
    "move beacon-tower",
    "Travel to Beacon Tower",
    "move",
    { destinationId: "beacon-tower" },
  ],
  [
    "use component at socket",
    "Fit spare signal component in beacon socket",
    "place_item",
    { item_id: "signal-component", target: "beacon-socket" },
  ],
  [
    "search final-warning-board",
    "Search final warning board",
    "search",
    { target: "final-warning-board" },
  ],
  [
    "resolve verified safe signal",
    "Resolve Verified safe signal",
    "resolve_quest",
    { resolutionId: "verified-safe-signal" },
  ],
];

export function journeyModel() {
  const controls = {
    calls: 0,
    fail: false,
    wait: undefined,
    entered: undefined,
  };
  const intents = new Map(
    journey.map(([, message, name, args]) => [
      message,
      { name, argumentsJson: JSON.stringify(args) },
    ]),
  );
  return {
    controls,
    model: {
      async respond(request) {
        controls.calls++;
        if (request.reply || request.toolResults.length) {
          controls.entered?.();
          if (controls.wait) {
            await controls.wait;
          }
          if (controls.fail) {
            controls.fail = false;
            throw new Error("Offline narration failure");
          }
          return {
            text: request.reply
              ? JSON.stringify({
                  opening: "none",
                  closing: "none",
                  factIds: request.reply.approvedFacts.map(({ id }) => id),
                })
              : "Read the separate engine result for the outcome.",
          };
        }
        let intent = intents.get(request.playerInput);
        // Contextual labels come from the public page, with explicit targets.
        if (!intent) {
          const input = request.playerInput;
          for (const npc of request.scene.room.npcs ?? []) {
            for (const subject of npc.subjects) {
              if (input === `Ask ${npc.name} about "${subject.name}".`) {
                intent = {
                  name: "talk",
                  argumentsJson: JSON.stringify({
                    speakerId: npc.id,
                    topicId: subject.id,
                    approach: "ask",
                  }),
                };
              }
            }
          }
          const exit = request.scene.room.exits.find(
            ({ name }) => input === "Travel to " + name,
          );
          if (exit) {
            intent = {
              name: "move",
              argumentsJson: JSON.stringify({
                destinationId: exit.destinationId,
              }),
            };
          }
          for (const target of [
            ...request.scene.room.features,
            ...request.scene.room.items,
            ...request.scene.room.opponents,
            ...(request.scene.room.npcs ?? []),
          ]) {
            for (const [verb, name, property] of [
              ["Search", "search", "target"],
              ["Take", "take", "item_id"],
              ["Attack", "attack", "opponent_id"],
              ["Brace", "brace", "target"],
              ["Recover at", "recover", "target"],
            ]) {
              if (input === verb + " " + target.name) {
                intent = {
                  name,
                  argumentsJson: JSON.stringify({ [property]: target.id }),
                };
              }
            }
          }
          const ending = request.scene.endingChoices?.find(
            ({ label }) => input === "Resolve " + label,
          );
          if (ending) {
            intent = {
              name: "resolve_quest",
              argumentsJson: JSON.stringify({ resolutionId: ending.id }),
            };
          }
        }
        if (request.playerInput === "Search secret ledger") {
          intent = {
            name: "search",
            argumentsJson: '{"target":"secret-ledger"}',
          };
        }
        return intent
          ? { toolCalls: [{ id: "intent", ...intent }] }
          : {
              text: "Which visible person or item do you mean? Choose its name or open its options; no action has been taken.",
            };
      },
    },
  };
}
