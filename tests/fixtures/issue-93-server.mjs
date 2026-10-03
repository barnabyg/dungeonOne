// The shipped browser server in its own process, so tests can kill and restart
// the process. Only the provider is scripted: a player message naming an
// offered action requests exactly that action; "Hold this turn" never gets a
// reply. Each provider call prints
// "provider-call" so tests can count calls across restarts.
// Usage: node issue-93-server.mjs <savePath> <seed> [libraryPath]
const { startBrowserServer } = await import("../../dist/browser-server.js");
const { BROWSER_START_VERSION } =
  await import("../../dist/browser-releases.js");
const { CharacterCareer } = await import("../../dist/character-career.js");
const { SaveSession } = await import("../../dist/save.js");
const { browserActions } = await import("../../dist/browser-actions.js");

const [savePath, seed, libraryPath] = process.argv.slice(2);
const career =
  libraryPath === undefined ? undefined : new CharacterCareer(libraryPath);
const server = await startBrowserServer({
  contentVersion: BROWSER_START_VERSION,
  savePath,
  seed: Number(seed),
  apiKey: "offline-fixture",
  ...(libraryPath === undefined ? {} : { libraryPath }),
  dmModel: {
    async respond(request) {
      process.stdout.write("provider-call\n");
      if ("reply" in request) {
        return {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            closing: "none",
            factIds: request.reply.approvedFacts.map(({ id }) => id),
          }),
        };
      }
      if (request.toolResults.length) {
        return { text: "The engine result stands." };
      }
      if (request.playerInput === "Hold this turn") {
        // A reply that never arrives, so tests can kill a process mid-turn.
        await new Promise(() => {});
      }
      const selected = (await career?.library.read())?.selectedSessionId;
      const session = await SaveSession.load(
        selected === undefined ? savePath : career.sessionPath(selected),
      );
      const action = browserActions(session, "fixture").find(
        ({ message }) => message === request.playerInput,
      );
      return action
        ? { toolCalls: [{ id: "intent", ...action.call }] }
        : { text: "Which offered action do you mean?" };
    },
  },
});
process.send?.({ type: "ready", url: server.url });
