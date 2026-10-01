// Bounded offline provider for the full HTTP/page/storage qualification journey.
// Public player messages are mapped explicitly; engine results remain authoritative.
export function qualificationModel() {
  const controls = { calls: 0, failure: undefined, wait: undefined };
  const routes = new Map([
    ["Travel to Watch Loft", ["move", { destinationId: "watch-loft" }]],
    [
      "Travel to Signal Records Room",
      ["move", { destinationId: "signal-records" }],
    ],
    ["Travel to Watch Yard", ["move", { destinationId: "watch-yard" }]],
    ["Travel to Keeper Path", ["move", { destinationId: "keeper-path" }]],
    ["Travel to Ridge Trail", ["move", { destinationId: "ridge-trail" }]],
    ["Travel to Beacon Tower", ["move", { destinationId: "beacon-tower" }]],
    [
      'Ask Captain Iona about "Ask about the beacon and watch leads".',
      ["talk", { speakerId: "iona", topicId: "brief", approach: "ask" }],
    ],
    ["Search beacon setting plate", ["search", { target: "setting-plate" }]],
    ["Search damaged shutter latch", ["search", { target: "shutter-latch" }]],
    ["Search broken marker post", ["search", { target: "broken-marker" }]],
    ["Search broken ridge marker", ["search", { target: "broken-marker" }]],
    [
      "Resolve Hold the beacon",
      ["resolve_quest", { resolutionId: "hold-beacon" }],
    ],
    [
      "Resolve Light the beacon",
      ["resolve_quest", { resolutionId: "light-beacon" }],
    ],
    [
      "Resolve Refuse the watch",
      ["resolve_quest", { resolutionId: "refuse-watch" }],
    ],
    [
      "Resolve Walk away from the watch",
      ["resolve_quest", { resolutionId: "walk-away" }],
    ],
  ]);
  return {
    controls,
    model: {
      async respond(request) {
        controls.calls++;
        if (controls.wait) {
          await controls.wait;
        }
        if (
          controls.failure === "before" ||
          (controls.failure === "after" &&
            (request.toolResults.length || "reply" in request))
        ) {
          throw new Error("Injected provider failure");
        }
        if ("reply" in request) {
          return {
            text: JSON.stringify({
              delivery: "steady",
              opening: "none",
              closing: "none",
              factIds: request.reply.approvedFacts.map(({ id }) => id),
            }),
          };
        }
        if (request.toolResults.length) {
          return {
            text: "The authoritative result below records your action.",
          };
        }
        const message = request.playerInput
          .replace(/ \(\d+ days\)$/, "")
          .replace("Keeper's Path", "Keeper Path");
        const route = routes.get(message);
        return route
          ? {
              toolCalls: [
                {
                  id: "qualified-intent",
                  name: route[0],
                  argumentsJson: JSON.stringify(route[1]),
                },
              ],
            }
          : {
              text: "Which visible subject or ending do you mean? Please choose one explicitly.",
            };
      },
    },
  };
}
