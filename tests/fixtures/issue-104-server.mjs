// Fault injection at the filesystem boundary; gameplay and save authority are real.
import files from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
const originalRename = files.rename;
files.rename = async (source, destination) => {
  const replacement = String(source).endsWith(".new-game");
  if (replacement && process.argv[3] === "fail") {
    throw new Error("Injected replacement publication failure");
  }
  if (replacement && process.argv[3] === "before") {
    process.send?.({ type: "boundary" });
    await new Promise(() => {});
  }
  await originalRename(source, destination);
  if (replacement && process.argv[3] === "after") {
    process.send?.({ type: "boundary" });
    await new Promise(() => {});
  }
};
syncBuiltinESMExports();
const { startBrowserServer } = await import("../../dist/browser-server.js");
const server = await startBrowserServer({
  savePath: process.argv[2],
  seed: 42,
  apiKey: "offline-fixture",
  dmModel: {
    async respond(request) {
      if (process.argv[3] === "turn") {
        process.send?.({ type: "turn-pending" });
        await new Promise(() => {});
      }
      if (request.toolResults.length) {
        return { text: "Travel saved." };
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
console.log(JSON.stringify({ url: server.url }));
process.send?.({ type: "ready", url: server.url });
process.on("SIGINT", () => {
  void server.close();
});
process.on("message", (message) => {
  if (message === "stop") {
    void server.close().then(() => process.exit(0));
  }
});
