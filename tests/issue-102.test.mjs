import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SaveSession } from "../dist/save.js";
import { startBrowserServer } from "../dist/browser-server.js";

const view = async (server) => (await fetch(server.url + "/api/state")).json();
async function post(server, path, message) {
  const before = await view(server);
  const response = await fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify({ message, revision: before.revision }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function settled(server) {
  for (let i = 0; i < 100; i++) {
    const current = await view(server);
    if (current.hints?.status !== "preparing") {
      return current;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  assert.fail("Hints did not settle");
}

test("hidden preparation is cached, state-bound, failure-isolated and restored without more calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-102-"));
  const savePath = join(directory, "slot.json");
  const jobs = [];
  let providerCalls = 0;
  const options = {
    savePath,
    seed: 0,
    apiKey: "test",
    hintPreparer: (candidates) =>
      new Promise((resolve, reject) => {
        jobs.push({ candidates, resolve, reject });
      }),
    dmModel: {
      async respond(request) {
        providerCalls++;
        return request.toolResults.length
          ? { text: "Travel saved." }
          : {
              toolCalls: [
                {
                  id: "move",
                  name: "move",
                  argumentsJson: JSON.stringify({
                    destinationId: "watch-loft",
                  }),
                },
              ],
            };
      },
    },
  };
  let server = await startBrowserServer(options);
  try {
    const opening = await post(server, "/api/start");
    assert.equal(opening.hints.status, "preparing");
    assert.equal(jobs.length, 1);
    assert.equal(providerCalls, 0);
    assert.ok(jobs[0].candidates.some((entry) => entry.includes("Iona")));
    assert.ok(!jobs[0].candidates.join(" ").includes("Altered beacon setting"));
    const travelled = await post(server, "/api/turn", "Go to Watch Loft");
    assert.equal(travelled.view.scene.room.name, "Watch Loft");
    assert.equal(jobs.length, 2);
    assert.notEqual(opening.hints.revision, travelled.view.hints.revision);
    const committed = (await SaveSession.load(savePath)).progress;
    jobs[1].resolve(jobs[1].candidates);
    const ready = await settled(server);
    assert.equal(ready.hints.status, "ready");
    const bytes = await readFile(savePath, "utf8");
    const count = providerCalls;
    jobs[0].resolve(jobs[0].candidates);
    for (let i = 0; i < 5; i++) {
      assert.deepEqual((await view(server)).hints, ready.hints);
      assert.deepEqual(
        await (await fetch(server.url + "/api/hints")).json(),
        ready.hints,
      );
    }
    assert.equal(await readFile(savePath, "utf8"), bytes);
    assert.deepEqual((await SaveSession.load(savePath)).progress, committed);
    assert.equal(providerCalls, count);
    await server.close();
    server = await startBrowserServer(options);
    assert.deepEqual((await view(server)).hints, ready.hints);
    assert.equal(jobs.length, 2);
    assert.equal(providerCalls, count);

    // Optional malformed/stale caches are discarded without rejecting old saves.
    await server.close();
    const save = JSON.parse(bytes);
    save.browserHints.entries = [
      "Fabricated secret result: the keeper is safe.",
    ];
    await writeFile(savePath, JSON.stringify(save));
    server = await startBrowserServer(options);
    assert.equal(jobs.length, 3);
    jobs[2].reject(new Error("private provider failure"));
    const failed = await settled(server);
    assert.equal(failed.hints.status, "unavailable");
    assert.deepEqual(failed.hints.entries, []);
    assert.deepEqual((await SaveSession.load(savePath)).progress, committed);
    assert.equal(failed.history.at(-1).notice, "Action saved.");
    assert.equal(failed.scene.room.name, "Watch Loft");
    await server.close();
    server = await startBrowserServer(options);
    assert.equal((await view(server)).hints.status, "unavailable");
    assert.equal(jobs.length, 3);
    assert.equal(providerCalls, count);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("baseline guidance uses public leads and legal options and refreshes only with game progress", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-hint-baseline-"));
  const savePath = join(directory, "slot.json");
  const routes = [
    ["move", { destinationId: "watch-loft" }],
    ["move", { destinationId: "signal-records" }],
    ["search", { target: "setting-plate" }],
    ["move", { destinationId: "watch-loft" }],
    ["wait", { amount: "3" }],
  ];
  let index = 0;
  let calls = 0;
  const server = await startBrowserServer({
    savePath,
    seed: 0,
    apiKey: "test",
    dmModel: {
      async respond(request) {
        calls++;
        if (request.toolResults.length) {
          return { text: "Done." };
        }
        const [name, args] = routes[index++];
        return {
          toolCalls: [{ id: name, name, argumentsJson: JSON.stringify(args) }],
        };
      },
    },
  });
  try {
    await post(server, "/api/start");
    for (let i = 0; i < routes.length; i++) {
      const turn = await post(
        server,
        "/api/turn",
        i === 4 ? "Wait three days" : "Follow the route",
      );
      const current = turn.view;
      assert.equal(current.hints.status, "ready");
      const entries = current.hints.entries;
      for (const action of current.actions) {
        assert.ok(entries.some((entry) => entry.includes(action.message)));
      }
      for (const lead of current.scene.journal.actionableLeads) {
        assert.ok(entries.includes("Known lead: " + lead));
      }
      const bytes = await readFile(savePath, "utf8");
      const count = calls;
      for (let j = 0; j < 3; j++) {
        assert.deepEqual((await view(server)).hints, current.hints);
      }
      assert.equal(calls, count);
      assert.equal(await readFile(savePath, "utf8"), bytes);
      if (i === 4) {
        assert.ok(
          !entries.some(
            (entry) =>
              entry.startsWith("You can Ask Pell") ||
              entry.startsWith("You can Persuade Pell"),
          ),
        );
      }
    }
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
