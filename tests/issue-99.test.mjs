import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";

test("context actions use the AI turn and match typed state, dice, dialogue and results; stale and forged offers preserve the save", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-99-"));
  const routes = [
    {
      name: "talk",
      args: { speakerId: "iona", topicId: "brief", approach: "ask" },
    },
    { name: "move", args: { destinationId: "watch-loft" } },
    { name: "move", args: { destinationId: "signal-records" } },
    { name: "inspect", args: { target: "setting-plate" } },
    { name: "search", args: { target: "setting-plate" } },
  ];
  const servers = [];
  const paths = [
    join(directory, "clicked.json"),
    join(directory, "typed.json"),
  ];
  const counts = [0, 0];
  const post = (server, body) =>
    fetch(server.url + "/api/turn", {
      method: "POST",
      headers: { Origin: server.url },
      body: JSON.stringify(body),
    });
  try {
    for (let i = 0; i < 2; i++) {
      let index = 0;
      const server = await startBrowserServer({
        savePath: paths[i],
        seed: 0,
        apiKey: "test",
        dmModel: {
          async respond(request) {
            counts[i]++;
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
              return { text: "Done." };
            }
            const route = routes[index++];
            return {
              toolCalls: [
                {
                  id: String(index),
                  name: route.name,
                  argumentsJson: JSON.stringify(route.args),
                },
              ],
            };
          },
        },
      });
      servers.push(server);
      await fetch(server.url + "/api/start", {
        method: "POST",
        headers: { Origin: server.url },
      });
    }
    let oldOffer;
    for (const route of routes) {
      const view = await (await fetch(servers[0].url + "/api/state")).json();
      const option = view.actions.find(
        ({ call }) => call.name === route.name && assertArgs(call, route.args),
      );
      assert.ok(option, JSON.stringify(route));
      oldOffer ??= option.id;
      const clicked = await (
        await post(servers[0], { optionId: option.id })
      ).json();
      const typed = await (
        await post(servers[1], { message: option.message })
      ).json();
      assert.deepEqual(clicked.cards, typed.cards);
      assert.equal(clicked.reply, typed.reply);
      assert.equal(clicked.committed, typed.committed);
      if (route.name === "talk") {
        assert.equal(clicked.speaker, "Captain Iona");
      }
      const saved = await Promise.all(
        paths.map(
          async (path) => JSON.parse(await readFile(path, "utf8")).checkpoint,
        ),
      );
      assert.deepEqual(saved[0], saved[1]);
    }
    const before = await readFile(paths[0], "utf8");
    const calls = counts[0];
    for (const body of [
      { optionId: oldOffer },
      { optionId: "forged" },
      { optionId: oldOffer, message: "Resolve light the beacon" },
    ]) {
      const response = await post(servers[0], body);
      assert.ok([400, 409].includes(response.status));
      const result = await response.json();
      if (response.status === 409) {
        assert.equal(result.view.scene.room.name, "Signal Records Room");
      }
    }
    assert.equal(counts[0], calls);
    assert.equal(await readFile(paths[0], "utf8"), before);
    assert.equal(
      (await SaveSession.load(paths[0])).state.locationId,
      "signal-records",
    );
  } finally {
    await Promise.all(servers.map((server) => server.close()));
    await rm(directory, { recursive: true, force: true });
  }
});

function assertArgs(call, args) {
  return (
    JSON.stringify(JSON.parse(call.argumentsJson)) === JSON.stringify(args)
  );
}

test("ending stakes are public, selection is explicit, and AI cannot substitute an ending", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-99-ending-"));
  const savePath = join(directory, "slot.json");
  let chosen;
  const server = await startBrowserServer({
    savePath,
    seed: 0,
    apiKey: "test",
    dmModel: {
      async respond(request) {
        if (request.toolResults.length) {
          return { text: "Done." };
        }
        return {
          toolCalls: [
            {
              id: "choice",
              name: "resolve_quest",
              argumentsJson: JSON.stringify({ resolutionId: chosen }),
            },
          ],
        };
      },
    },
  });
  const post = (body) =>
    fetch(server.url + "/api/turn", {
      method: "POST",
      headers: { Origin: server.url },
      body: JSON.stringify(body),
    });
  try {
    await fetch(server.url + "/api/start", {
      method: "POST",
      headers: { Origin: server.url },
    });
    const session = await SaveSession.load(savePath);
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
    const view = await (await fetch(server.url + "/api/state")).json();
    const choices = view.actions.filter(
      ({ call }) => call.name === "resolve_quest",
    );
    assert.ok(choices.length >= 2);
    assert.ok(choices.every(({ stakes }) => stakes.length > 0));
    const hold = choices.find(({ label }) => label === "Hold the beacon");
    assert.match(hold.stakes, /safe stop/);
    const before = JSON.parse(await readFile(savePath, "utf8")).checkpoint;
    chosen = "hold-beacon";
    const unsolicited = await (
      await post({ message: "What are my choices?" })
    ).json();
    assert.equal(unsolicited.committed, false);
    assert.deepEqual(
      JSON.parse(await readFile(savePath, "utf8")).checkpoint,
      before,
    );
    chosen = JSON.parse(
      choices.find(({ id }) => id !== hold.id).call.argumentsJson,
    ).resolutionId;
    const substituted = await (await post({ optionId: hold.id })).json();
    assert.equal(substituted.committed, false);
    assert.deepEqual(
      JSON.parse(await readFile(savePath, "utf8")).checkpoint,
      before,
    );
    chosen = "hold-beacon";
    const selected = await (await post({ optionId: hold.id })).json();
    assert.equal(selected.committed, true);
    assert.equal(
      (await SaveSession.load(savePath)).state.ending.id,
      "hold-beacon",
    );
    assert.equal(
      selected.view.actions.some(({ call }) => call.name === "resolve_quest"),
      false,
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
