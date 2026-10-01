import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";
import { browserPage } from "./fixtures/browser-page.mjs";

const state = async (server) => (await fetch(server.url + "/api/state")).json();
const post = (server, path, body) =>
  fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url },
    body: JSON.stringify(body),
  });

test("process killed after ending commit recovers one ending and closes interaction without AI", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-105-kill-"));
  const savePath = join(directory, "slot.json");
  const child = fork(
    new URL("./fixtures/issue-105-server.mjs", import.meta.url),
    [savePath, "interrupt"],
    { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true },
  );
  let server;
  try {
    const ready = await new Promise((resolve, reject) => {
      child.on("message", (message) => {
        if (message.type === "ready") {
          resolve(message);
        }
      });
      child.once("exit", () =>
        reject(new Error("Fixture exited before ready")),
      );
    });
    const before = await state(ready);
    const committed = new Promise((resolve) => {
      child.on("message", (message) => {
        if (message.type === "committed") {
          resolve();
        }
      });
    });
    const pending = post(ready, "/api/turn", {
      revision: before.revision,
      message: "Resolve Hold the beacon",
    }).catch(() => undefined);
    await committed;
    const saved = JSON.parse(await readFile(savePath, "utf8"));
    assert.equal(saved.transitions.length, before.position + 1);
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await pending;
    server = await startBrowserServer({
      savePath,
      seed: 0,
      apiKey: "offline",
      dmModel: {
        async respond() {
          assert.fail("Completed recovery must not call AI");
        },
      },
      hintPreparer: async () => {
        assert.fail("Completed recovery must not prepare hints");
      },
    });
    const recovered = await state(server);
    assert.notEqual(recovered.scene.outcome, "playing");
    assert.equal(recovered.history.length, 1);
    assert.equal(recovered.history[0].committed, true);
    assert.match(recovered.history[0].notice, /saved; do not repeat/);
    assert.match(
      recovered.history[0].cards[0].text,
      /safe stop|stranded caravan/,
    );
    const durable = await readFile(savePath, "utf8");
    assert.equal(
      (
        await post(server, "/api/turn", {
          revision: recovered.revision,
          message: "Resolve Hold the beacon",
        })
      ).status,
      409,
    );
    await server.close();
    server = await startBrowserServer({ savePath, seed: 0, apiKey: "offline" });
    assert.deepEqual(await state(server), recovered);
    const restored = JSON.parse(await readFile(savePath, "utf8"));
    assert.deepEqual(restored.checkpoint, saved.checkpoint);
    assert.deepEqual(restored.transitions, saved.transitions);
    assert.equal(await readFile(savePath, "utf8"), durable);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [ending, clicked, lost, fail] of [
  ["hold-beacon", true, false, false],
  ["light-beacon", false, true, true],
  ["refuse-watch", false, false, false],
  ["walk-away", true, true, false],
]) {
  test(`${ending} closes gameplay and restores exact review history (click=${clicked}, lost=${lost}, AI error=${fail})`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-105-"));
    const savePath = join(directory, "slot.json");
    let calls = 0;
    const options = {
      savePath,
      seed: 0,
      apiKey: "offline",
      dmModel: {
        async respond(request) {
          calls++;
          if (request.toolResults.length) {
            if (fail) {
              throw new Error("Post-commit provider failure");
            }
            return { text: "Decision recorded." };
          }
          return {
            toolCalls: [
              {
                id: "ending",
                name: "resolve_quest",
                argumentsJson: JSON.stringify({ resolutionId: ending }),
              },
            ],
          };
        },
      },
    };
    let server = await startBrowserServer(options);
    try {
      await post(server, "/api/start", {});
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
      const before = await state(server);
      const stalePage = await browserPage(server);
      const choice = before.actions.find(
        ({ call }) =>
          call.name === "resolve_quest" &&
          JSON.parse(call.argumentsJson).resolutionId === ending,
      );
      assert.ok(choice);
      assert.ok(choice.stakes.length > 0);
      for (const message of [
        "What are my choices?",
        `Do not ${choice.message}`,
        `Maybe ${choice.message}`,
        "Resolve Refuse the watch or Hold the beacon",
        "Explain Refuse the watch",
        "I wonder what happens if I refuse the watch",
      ]) {
        const response = await post(server, "/api/turn", {
          revision: (await state(server)).revision,
          message,
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).committed, false);
      }
      const browser = await browserPage(server, async (url, init) => {
        const response = await fetch(url, init);
        if (lost && url.endsWith("/api/turn")) {
          await response.text();
          throw new Error("Ending response lost");
        }
        return response;
      });
      if (clicked) {
        const details = browser.nodes.get("details").children;
        const endingButton = details
          .flatMap((item) => item.children)
          .find((item) => item.textContent === "Ending choices");
        endingButton.listeners.click();
        const button = browser.nodes
          .get("context-actions")
          .children.find((item) => item.textContent === choice.label);
        await button.listeners.click();
      } else {
        await browser.submit(choice.message);
      }
      const completed = await state(server);
      assert.notEqual(completed.scene.outcome, "playing");
      assert.equal(completed.position, before.position + 1);
      assert.deepEqual(completed.actions, []);
      assert.equal(completed.hints.status, "unavailable");
      assert.equal(completed.strongerHints, undefined);
      assert.equal(completed.history.length, 7);
      assert.equal(completed.history.at(-1).committed, true);
      const mechanics = completed.history
        .at(-1)
        .cards.map(({ text }) => text)
        .join(" ");
      assert.match(mechanics, /keeper remains missing/i);
      assert.match(
        mechanics,
        ending === "hold-beacon"
          ? /safe stop|stranded caravan/
          : ending === "light-beacon"
            ? /unknown/
            : /no signal|no rescue|remains unknown/i,
      );
      const durable = await readFile(savePath, "utf8");
      const callCount = calls;
      for (const page of [browser, await browserPage(server)]) {
        assert.equal(page.nodes.get("message").disabled, true);
        assert.equal(page.nodes.get("send").disabled, true);
        await page.submit("What could I have done differently?");
        for (const panel of [
          "inventory",
          "character",
          "journal",
          "leads",
          "hints",
        ]) {
          page.click("open-" + panel);
          assert.equal(page.nodes.get("information").hidden, false);
          page.click("close-information");
        }
        page.click("open-hints");
        assert.equal(page.nodes.get("request-stronger-hint").disabled, true);
        await page.click("request-stronger-hint");
        assert.match(page.nodes.get("session").textContent, /review/i);
        assert.ok(page.nodes.get("location").textContent);
        assert.ok(page.nodes.get("time").textContent);
        assert.ok(page.nodes.get("hp").textContent);
      }
      await stalePage.submit("What happens next?");
      for (const revision of [before.revision, completed.revision]) {
        for (const body of [
          { message: "What did I miss?", revision },
          { optionId: choice.id, revision },
        ]) {
          assert.equal((await post(server, "/api/turn", body)).status, 409);
        }
      }
      for (const revision of [
        before.hints.revision,
        completed.hints.revision,
      ]) {
        assert.equal(
          (await post(server, "/api/hints/stronger", { revision })).status,
          409,
        );
      }
      assert.equal(calls, callCount);
      assert.equal(await readFile(savePath, "utf8"), durable);
      await server.close();
      server = await startBrowserServer(options);
      const restored = await state(server);
      assert.deepEqual(restored, completed);
      assert.equal(await readFile(savePath, "utf8"), durable);
      assert.equal(calls, callCount);
      assert.equal((await SaveSession.load(savePath)).state.ending.id, ending);
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

for (const stronger of [false, true]) {
  test(`outstanding ${stronger ? "stronger" : "baseline"} hint cannot publish after completion or restart`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-105-hints-"));
    const savePath = join(directory, "slot.json");
    let jobs = 0,
      release;
    const delayed = (candidates) => {
      jobs++;
      return new Promise((resolve) => {
        release = () => resolve(candidates);
      });
    };
    const options = {
      savePath,
      seed: 0,
      apiKey: "offline",
      dmModel: {
        async respond(request) {
          return request.toolResults.length
            ? { text: "Saved." }
            : {
                toolCalls: [
                  {
                    id: "end",
                    name: "resolve_quest",
                    argumentsJson: '{"resolutionId":"walk-away"}',
                  },
                ],
              };
        },
      },
    };
    let server = await startBrowserServer(options);
    try {
      await post(server, "/api/start", {});
      const session = await SaveSession.load(savePath);
      for (const command of ["move ridge-trail", "move beacon-tower"]) {
        await session.commit(command, session.runtime.parseCommand(command));
      }
      await server.close();
      const delayedOptions = {
        ...options,
        ...(stronger
          ? { strongerHintPreparer: delayed }
          : { hintPreparer: delayed }),
      };
      server = await startBrowserServer(delayedOptions);
      const browser = await browserPage(server);
      if (stronger) {
        browser.click("open-hints");
        await browser.click("request-stronger-hint");
      }
      assert.equal(jobs, 1);
      await browser.submit("Resolve Walk away from the watch");
      const completed = await state(server);
      const durable = await readFile(savePath, "utf8");
      release();
      // Let the preparer settle and attempt its normal background publication.
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      assert.deepEqual(await state(server), completed);
      browser.click("open-hints");
      assert.equal(browser.nodes.get("stronger-hint").hidden, true);
      assert.equal(browser.nodes.get("request-stronger-hint").disabled, true);
      assert.equal(await readFile(savePath, "utf8"), durable);
      await server.close();
      server = await startBrowserServer(delayedOptions);
      assert.deepEqual(await state(server), completed);
      assert.equal(jobs, 1);
      assert.equal(await readFile(savePath, "utf8"), durable);
    } finally {
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("an idle tab receiving a delayed stronger-hint response observes completion and closes its composer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-105-delayed-"));
  const savePath = join(directory, "slot.json");
  let releaseResponse, responseReady;
  const held = new Promise((resolve) => {
    responseReady = resolve;
  });
  let server = await startBrowserServer({
    savePath,
    seed: 0,
    apiKey: "offline",
    dmModel: {
      async respond(request) {
        return request.toolResults.length
          ? { text: "Saved." }
          : {
              toolCalls: [
                {
                  id: "end",
                  name: "resolve_quest",
                  argumentsJson: '{"resolutionId":"walk-away"}',
                },
              ],
            };
      },
    },
  });
  try {
    await post(server, "/api/start", {});
    const session = await SaveSession.load(savePath);
    for (const command of ["move ridge-trail", "move beacon-tower"]) {
      await session.commit(command, session.runtime.parseCommand(command));
    }
    // Populate the baseline for the current tower scene through restart.
    await server.close();
    server = await startBrowserServer({
      savePath,
      seed: 0,
      apiKey: "offline",
      dmModel: {
        async respond(request) {
          return request.toolResults.length
            ? { text: "Saved." }
            : {
                toolCalls: [
                  {
                    id: "end",
                    name: "resolve_quest",
                    argumentsJson: '{"resolutionId":"walk-away"}',
                  },
                ],
              };
        },
      },
    });
    try {
      const old = await browserPage(server, async (url, init) => {
        const response = await fetch(url, init);
        if (url.endsWith("/api/hints/stronger")) {
          await new Promise((resolve) => {
            releaseResponse = resolve;
            responseReady();
          });
        }
        return response;
      });
      old.click("open-hints");
      const hintRequest = old.click("request-stronger-hint");
      await held;
      const other = await browserPage(server);
      // Wait for the asynchronous derived-cache write to release the turn lock.
      for (let attempt = 0; attempt < 100; attempt++) {
        const view = await state(server);
        const response = await post(server, "/api/turn", {
          revision: view.revision,
          message: "Resolve Walk away from the watch",
        });
        if (response.status === 200) {
          break;
        }
        assert.match((await response.json()).error, /already pending/);
      }
      assert.notEqual((await state(server)).scene.outcome, "playing");
      releaseResponse();
      await hintRequest;
      assert.equal(old.nodes.get("message").disabled, true);
      assert.equal(old.nodes.get("send").disabled, true);
      assert.equal(old.nodes.get("stronger-hint").hidden, true);
      assert.match(old.nodes.get("session").textContent, /Review mode/);
      const saved = await readFile(savePath, "utf8");
      await old.submit("Reflect on my decision");
      await other.submit("Reflect on my decision");
      assert.equal(await readFile(savePath, "utf8"), saved);
    } finally {
      releaseResponse?.();
    }
  } finally {
    releaseResponse?.();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
