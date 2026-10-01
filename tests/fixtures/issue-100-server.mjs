import { startBrowserServer } from "../../dist/browser-server.js";

const server = await startBrowserServer({
  savePath: process.argv[2],
  seed: Number(process.argv[3]),
  apiKey: "private-test-key",
  dmModel: {
    async respond(request) {
      process.send({
        type: "provider-call",
        entries: request.transcript.length,
        characters: request.transcript.reduce(
          (sum, entry) => sum + entry.text.length,
          0,
        ),
        speaker: "reply" in request ? request.reply.speakerId : undefined,
      });
      if (request.toolResults.length && process.argv[4] === "interrupt") {
        process.send({ type: "committed" });
        await new Promise(() => {});
      }
      if ("reply" in request) {
        return {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            factIds: request.reply.approvedFacts.map(({ id }) => id),
            closing: "none",
          }),
        };
      }
      if (
        request.toolResults.length ||
        request.playerInput.includes("Question")
      ) {
        return {
          text: "Which lead would you like to follow?",
          provider: {
            responseId: "private-provider-payload",
            model: "test",
            status: "completed",
          },
        };
      }
      const talk = request.playerInput.includes("Pell");
      if (request.playerInput.includes("Hold")) {
        return {
          toolCalls: [
            {
              id: "ending",
              name: "resolve_quest",
              argumentsJson: JSON.stringify({ resolutionId: "hold-beacon" }),
            },
          ],
        };
      }
      return {
        toolCalls: [
          {
            id: "action",
            name: talk ? "talk" : "move",
            argumentsJson: JSON.stringify(
              talk
                ? { speakerId: "pell", topicId: "shift", approach: "persuade" }
                : { destinationId: "watch-loft" },
            ),
          },
        ],
      };
    },
  },
});
process.send({ type: "ready", url: server.url });
process.on("message", (message) => {
  if (message === "stop") {
    void server.close().then(() => process.exit(0));
  }
});
