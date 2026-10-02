// Resolve only explicit currently offered messages. The real engine, HTTP
// boundary and save authority own all consequences and random draws.
import { SaveSession } from "../../dist/save.js";
import { browserActions } from "../../dist/browser-actions.js";

export function browserActionModel(savePath) {
  const controls = { calls: 0 };
  return {
    controls,
    model: {
      async respond(request) {
        controls.calls++;
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
          return { text: "Your action is recorded below." };
        }
        const session = await SaveSession.load(savePath);
        const action = browserActions(session, "offline-ui").find(
          ({ message }) => message === request.playerInput,
        );
        return action
          ? { toolCalls: [{ id: "offered-action", ...action.call }] }
          : { text: "Which person, object or route do you mean?" };
      },
    },
  };
}
