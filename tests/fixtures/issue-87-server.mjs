import { startBrowserServer } from "../../dist/browser-server.js";

let held;
let release;
let fail = false;
process.on("message", (message) => {
  if (message === "hold") {
    held = new Promise((resolve) => {
      release = resolve;
    });
  }
  if (message === "release") {
    release?.();
    held = undefined;
  }
  if (message === "fail") {
    fail = true;
  }
  process.send({ control: message });
});
const model = {
  async respond(request) {
    if (request.toolResults.length) {
      process.send({ committed: true });
      if (held) {
        await held;
      }
      if (fail) {
        fail = false;
        throw new Error("Offline post-commit narration failure");
      }
      return { text: "The engine result records what happened." };
    }
    const input = request.playerInput.toLowerCase();
    const [name, args] = input.startsWith("travel")
      ? [
          "move",
          {
            destinationId: input.includes("tower")
              ? "beacon-tower"
              : "ridge-trail",
          },
        ]
      : input.startsWith("brace")
        ? ["brace", { target: "fallen-cart" }]
        : input.startsWith("attack")
          ? ["attack", { opponent_id: "ridge-raider" }]
          : ["search", { target: "supply-sack" }];
    return {
      toolCalls: [{ id: "intent", name, argumentsJson: JSON.stringify(args) }],
    };
  },
};
const server = await startBrowserServer({
  contentVersion: "7",
  savePath: process.argv[2],
  seed: Number(process.argv[3]),
  apiKey: "offline",
  dmModel: model,
});
process.send({ url: server.url });
process.on("message", (message) => {
  if (message === "stop") {
    void server.close().then(() => process.exit());
  }
});
