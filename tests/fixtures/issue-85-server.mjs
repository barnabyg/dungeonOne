import { startBrowserServer } from "../../dist/browser-server.js";
const server = await startBrowserServer({
  contentVersion: "5",
  savePath: process.argv[2],
  seed: 0,
  apiKey: "offline",
  dmModel: {
    async respond() {
      throw new Error("Review and resume must not call the provider.");
    },
  },
});
console.log(server.url);
process.on("SIGTERM", () => void server.close());
process.on("SIGINT", () => void server.close());
