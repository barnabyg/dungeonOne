import { startBrowserServer } from "../../dist/browser-server.js";
import { qualificationModel } from "./qualification-model.mjs";

const { model, controls } = qualificationModel();
controls.failure = process.argv[3];
const server = await startBrowserServer({
  savePath: process.argv[2],
  seed: 0,
  apiKey: "offline",
  dmModel: model,
});
console.log(server.url);
process.on("SIGINT", () => {
  void server.close();
});
process.on("SIGTERM", () => {
  void server.close();
});
