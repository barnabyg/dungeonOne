import { resolve } from "node:path";
import { startBrowserServer } from "../../dist/browser-server.js";
import { journeyModel } from "./journey-92.mjs";

// Disposable offline desktop review; production browser mode uses the live AI.
const { model } = journeyModel();
const server = await startBrowserServer({
  contentVersion: "11",
  savePath: resolve(process.argv[2]),
  seed: 0,
  apiKey: "offline",
  dmModel: model,
});
process.stdout.write(server.url + "\n");
process.once("SIGINT", () => {
  void server.close();
});
