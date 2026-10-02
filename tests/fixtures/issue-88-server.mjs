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
    const destination = request.scene.room.exits.find((exit) =>
      input.includes(exit.name.toLowerCase().replace(/ \(\d+ days?\)$/, "")),
    );
    const [name, args] = input.startsWith("travel")
      ? [
          "move",
          {
            destinationId: destination?.destinationId ?? "unknown",
          },
        ]
      : input.startsWith("brace")
        ? ["brace", { target: "fallen-cart" }]
        : input.startsWith("recover") || input.startsWith("rest")
          ? ["recover", { target: "dressing-station" }]
          : input.startsWith("attack")
            ? [
                "attack",
                {
                  opponent_id:
                    request.scene.room.opponents.find(
                      (x) => x.condition === "living",
                    )?.id ?? "unknown",
                },
              ]
            : [
                "search",
                {
                  target: input.includes("board")
                    ? "tower-route-board"
                    : "supply-sack",
                },
              ];
    return {
      toolCalls: [{ id: "intent", name, argumentsJson: JSON.stringify(args) }],
    };
  },
};
const server = await startBrowserServer({
  contentVersion: "8",
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
