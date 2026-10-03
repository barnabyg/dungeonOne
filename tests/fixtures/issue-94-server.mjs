// The shipped browser server in its own process for the issue #94 journey.
// Only the provider is scripted: it interprets the journey's ordinary phrasing
// (see issue-94-journey.mjs) and the exact clicked option messages. The parent
// may send {fail: "before" | "after"} to make the next turn's provider fail
// before the action or after it commits. Each provider call prints one
// "provider-call {...}" line describing the bounded request it received.
// Usage: node issue-94-server.mjs <libraryPath> <seed>
const { startBrowserServer } = await import("../../dist/browser-server.js");
const { BROWSER_START_VERSION } =
  await import("../../dist/browser-releases.js");
const { CharacterCareer } = await import("../../dist/character-career.js");
const { SaveSession } = await import("../../dist/save.js");
const { browserActions } = await import("../../dist/browser-actions.js");
const { interpretJourneyMessage } = await import("./issue-94-journey.mjs");

const [libraryPath, seed] = process.argv.slice(2);
const career = new CharacterCareer(libraryPath);
let failure;
process.on("message", (message) => {
  failure = message.fail;
});
const server = await startBrowserServer({
  contentVersion: BROWSER_START_VERSION,
  savePath: libraryPath + ".unused-slot.json",
  seed: Number(seed),
  apiKey: "offline-fixture",
  libraryPath,
  dmModel: {
    async respond(request) {
      const phase =
        "reply" in request
          ? "npc-reply"
          : request.toolResults.length
            ? "narration"
            : "interpretation";
      process.stdout.write(
        "provider-call " +
          JSON.stringify({
            phase,
            input: request.playerInput,
            transcriptEntries: request.transcript.length,
            transcriptCharacters: request.transcript.reduce(
              (sum, { text }) => sum + text.length,
              0,
            ),
            historyFacts: request.history?.facts.length ?? null,
            historySpeaker: request.history?.speakerId ?? null,
            replySpeaker: request.reply?.speakerId ?? null,
          }) +
          "\n",
      );
      if (
        failure === "before" ||
        (failure === "after" && phase !== "interpretation")
      ) {
        failure = undefined;
        throw new Error("Injected provider failure");
      }
      if (phase === "npc-reply") {
        return {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            closing: "none",
            factIds: request.reply.approvedFacts.map(({ id }) => id),
          }),
        };
      }
      if (phase === "narration") {
        return { text: "The result card below is what happened." };
      }
      const data = await career.library.read();
      const session = await SaveSession.load(
        career.sessionPath(data.selectedSessionId),
      );
      const selected = interpretJourneyMessage(
        request.playerInput,
        browserActions(session, "issue-94"),
      );
      return selected === undefined
        ? { text: "Which offered action or ending do you mean?" }
        : {
            toolCalls: [
              {
                id: "intent",
                name: selected.name,
                argumentsJson: JSON.stringify(selected.arguments),
              },
            ],
          };
    },
  },
});
process.send?.({ type: "ready", url: server.url });
