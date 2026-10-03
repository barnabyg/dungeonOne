// The shipped v11 browser server in its own process, so tests can kill and
// restart the process. Only the provider is scripted: one typed travel request.
const { startBrowserServer } = await import("../../dist/browser-server.js");
const { BROWSER_START_VERSION } =
  await import("../../dist/browser-releases.js");
const server = await startBrowserServer({
  contentVersion: BROWSER_START_VERSION,
  savePath: process.argv[2],
  seed: 0,
  apiKey: "offline-fixture",
  dmModel: {
    async respond(request) {
      if (request.toolResults.length) {
        return { text: "Travel saved." };
      }
      if (request.playerInput !== "Travel to Watch Loft") {
        throw new Error("Unexpected provider call.");
      }
      return {
        toolCalls: [
          {
            id: "move",
            name: "move",
            argumentsJson: '{"destinationId":"watch-loft"}',
          },
        ],
      };
    },
  },
});
process.send?.({ type: "ready", url: server.url });
