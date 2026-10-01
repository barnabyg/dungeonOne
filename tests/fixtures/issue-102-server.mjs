// Offline, controllable local fixture for the real-browser journey in issue-102.md.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { startBrowserServer } from "../../dist/browser-server.js";

const jobs = [];
let providerCalls = 0;
const options = {
  savePath: process.argv[2],
  seed: 0,
  apiKey: "offline-fixture",
  hintPreparer: (candidates) =>
    new Promise((resolve, reject) => {
      jobs.push({ candidates, resolve, reject });
    }),
  dmModel: {
    async respond(request) {
      providerCalls++;
      if (request.toolResults.length) {
        return { text: "Travel saved." };
      }
      const destinationId = request.playerInput.includes("Yard")
        ? "watch-yard"
        : "watch-loft";
      return {
        toolCalls: [
          {
            id: "move",
            name: "move",
            argumentsJson: JSON.stringify({ destinationId }),
          },
        ],
      };
    },
  },
};
let game = await startBrowserServer(options);
let restarting = false;
function restart() {
  if (restarting) {
    throw new Error("Restart already pending");
  }
  restarting = true;
  return game
    .close()
    .then(() => startBrowserServer(options))
    .then((next) => {
      game = next;
    })
    .finally(() => {
      restarting = false;
    });
}
const controls = createServer((request, response) => {
  void (async () => {
    const [, command, number] = request.url.split("/");
    if (command === "release") {
      jobs[Number(number)].resolve(jobs[Number(number)].candidates);
    }
    if (command === "fail") {
      jobs[Number(number)].reject(new Error("fixture preparation failure"));
    }
    if (command === "restart") {
      await restart();
    }
    const save = await readFile(options.savePath, "utf8")
      .then(JSON.parse)
      .catch(() => undefined);
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        url: game.url,
        providerCalls,
        jobs: jobs.map(({ candidates }) => candidates),
        checkpoint: save?.checkpoint,
        hints: save?.browserHints,
        transitions: save?.transitions.length,
      }),
    );
  })().catch(() => {
    response.statusCode = 500;
    response.end("Fixture control failed");
  });
});
await new Promise((resolve) => {
  controls.listen(0, "127.0.0.1", resolve);
});
console.log(
  JSON.stringify({
    url: game.url,
    controls: `http://127.0.0.1:${controls.address().port}`,
  }),
);
process.on("SIGINT", () => {
  void game.close().then(() => controls.close());
});
