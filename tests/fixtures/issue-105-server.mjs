// Offline real-browser and process-interruption fixture with an engine-built
// signal-ready save. No game facts or ending results are fabricated.
import { startBrowserServer } from "../../dist/browser-server.js";
import { SaveSession } from "../../dist/save.js";

const options = {
  savePath: process.argv[2],
  seed: 0,
  apiKey: "offline-fixture",
  dmModel: {
    async respond(request) {
      if (request.toolResults.length) {
        if (process.argv[3] === "interrupt") {
          process.send?.({ type: "committed" });
          await new Promise(() => {});
        }
        if (process.argv[3] === "fail") {
          throw new Error("Injected post-commit failure");
        }
        return {
          text: "Your decision is recorded. Read the authoritative result below.",
        };
      }
      const resolutionId = request.playerInput.toLowerCase().includes("refuse")
        ? "refuse-watch"
        : request.playerInput.toLowerCase().includes("walk away")
          ? "walk-away"
          : request.playerInput.toLowerCase().includes("light")
            ? "light-beacon"
            : "hold-beacon";
      return {
        toolCalls: [
          {
            id: "ending",
            name: "resolve_quest",
            argumentsJson: JSON.stringify({ resolutionId }),
          },
        ],
      };
    },
  },
};
let server = await startBrowserServer(options);
const response = await fetch(server.url + "/api/state");
if ((await response.json()).slot === "empty") {
  await fetch(server.url + "/api/start", {
    method: "POST",
    headers: { Origin: server.url },
  });
  await server.close();
  const session = await SaveSession.load(options.savePath);
  for (const command of [
    "move keeper-path",
    "search latch",
    "move watch-yard",
    "move ridge-trail",
    "search broken-marker",
    "move beacon-tower",
  ]) {
    await session.commit(command, session.runtime.parseCommand(command));
  }
  server = await startBrowserServer(options);
}
console.log(JSON.stringify({ url: server.url }));
process.send?.({ type: "ready", url: server.url });
process.on("SIGINT", () => {
  void server.close();
});
