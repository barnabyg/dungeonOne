import { startBrowserServer } from "../../dist/browser-server.js";

let hold, release;
let fail = false;
process.on("message", (message) => {
  if (message === "hold") {
    hold = new Promise((resolve) => {
      release = resolve;
    });
  } else if (message === "release") {
    release?.();
    hold = undefined;
  } else if (message === "fail") {
    fail = true;
  }
  process.send({ control: message });
});

const model = {
  async respond(request) {
    if (request.reply || request.toolResults.length) {
      process.send({ committed: true });
      if (hold) {
        await hold;
      }
      if (fail) {
        fail = false;
        throw new Error("Offline post-commit failure");
      }
      return {
        text: request.reply
          ? JSON.stringify({
              opening: "none",
              closing: "none",
              factIds: request.reply.approvedFacts.map((fact) => fact.id),
            })
          : "Read the authoritative engine result.",
      };
    }
    const input = request.playerInput.toLowerCase();
    const scene = request.scene.room;
    let name, args;
    if (input.startsWith("travel")) {
      name = "move";
      args = {
        destinationId:
          scene.exits.find((exit) =>
            input.includes(
              exit.name.toLowerCase().replace(/ \(\d+ days?\)$/, ""),
            ),
          )?.destinationId ?? "unknown",
      };
    } else if (input.startsWith("ask") || input.startsWith("persuade")) {
      name = "talk";
      const npc = scene.npcs.find((actor) =>
        input.startsWith(
          (input.startsWith("ask") ? "ask " : "persuade ") +
            actor.name.toLowerCase(),
        ),
      );
      args = {
        speakerId: npc?.id ?? "unknown",
        topicId:
          npc?.subjects.find((subject) =>
            input.includes(subject.name.toLowerCase()),
          )?.id ?? "unknown",
        approach: input.startsWith("persuade") ? "persuade" : "ask",
      };
    } else if (input.startsWith("attack")) {
      name = "attack";
      args = {
        opponent_id:
          [...scene.npcs, ...scene.opponents].find((actor) =>
            input.includes(actor.name.toLowerCase()),
          )?.id ?? "unknown",
      };
    } else if (input.startsWith("take")) {
      name = "take";
      args = { item_id: "signal-component" };
    } else if (input.startsWith("fit")) {
      name = "place_item";
      args = { item_id: "signal-component", target: "beacon-socket" };
    } else {
      name = "search";
      args = {
        target:
          scene.features.find((feature) =>
            input.includes(feature.name.toLowerCase()),
          )?.id ?? "unknown",
      };
    }
    return {
      toolCalls: [{ id: "intent", name, argumentsJson: JSON.stringify(args) }],
    };
  },
};
const server = await startBrowserServer({
  contentVersion: "10",
  seed: Number(process.argv[3]),
  savePath: process.argv[2],
  apiKey: "offline",
  dmModel: model,
});
process.send({ url: server.url });
