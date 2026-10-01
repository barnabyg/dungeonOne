import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("publication failure preserves the old slot and killed replacement processes recover one whole generation", async () => {
  for (const mode of ["fail", "before", "after"]) {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-104-fault-"));
    const savePath = join(directory, "slot.json");
    let child;
    async function launch(fault) {
      child = fork(
        new URL("./fixtures/issue-104-server.mjs", import.meta.url),
        [savePath, fault],
        { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true },
      );
      return new Promise((resolve, reject) => {
        child.on("message", (message) => {
          if (message.type === "ready") {
            resolve({ url: message.url });
          }
        });
        child.once("exit", () =>
          reject(new Error("Fixture exited before ready")),
        );
      });
    }
    async function kill() {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    try {
      const server = await launch(mode);
      await post(server, "/api/start", {});
      await post(server, "/api/turn", {
        revision: (await state(server)).revision,
        message: "Go to Watch Loft",
      });
      const old = await state(server);
      const boundary =
        mode === "fail"
          ? undefined
          : new Promise((resolve) => {
              child.on("message", (message) => {
                if (message.type === "boundary") {
                  resolve();
                }
              });
            });
      const resetting = post(server, "/api/new-game", {
        revision: old.revision,
        seed: 42,
        confirmed: true,
      }).catch(() => undefined);
      if (mode === "fail") {
        const response = await resetting;
        assert.equal(response.status, 500);
        const failed = await response.json();
        assert.match(failed.error, /replacement failed/);
        assert.deepEqual(failed.view.history, old.history);
        assert.equal(failed.view.revision, old.revision);
      } else {
        await boundary;
      }
      await kill();
      await resetting;
      const restarted = await launch("normal");
      const restored = await state(restarted);
      assert.equal(restored.position, mode === "after" ? 0 : 1);
      assert.equal(
        restored.scene.room.name,
        mode === "after" ? "Watch Yard" : "Watch Loft",
      );
      assert.deepEqual(restored.history, mode === "after" ? [] : old.history);
      assert.equal(restored.seed, 42);
      assert.equal(restored.revision === old.revision, mode !== "after");
      await kill();
    } finally {
      if (child?.exitCode === null && child.signalCode === null) {
        await kill();
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("reset is rejected while a turn or either hint preparer is pending", async () => {
  for (const kind of ["turn", "baseline", "stronger"]) {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-104-pending-"));
    let release, entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    const pause = async (value) => {
      entered();
      await gate;
      return value;
    };
    const server = await startBrowserServer({
      savePath: join(directory, "slot.json"),
      seed: 0,
      apiKey: "offline",
      dmModel:
        kind === "turn"
          ? { respond: async () => pause({ text: "Old response" }) }
          : model,
      ...(kind === "baseline" ? { hintPreparer: pause } : {}),
      ...(kind === "stronger" ? { strongerHintPreparer: pause } : {}),
    });
    let turn;
    try {
      await post(server, "/api/start", {});
      const before = await state(server);
      if (kind === "turn") {
        turn = post(server, "/api/turn", {
          revision: before.revision,
          message: "Question",
        });
      }
      if (kind === "stronger") {
        await post(server, "/api/hints/stronger", {
          revision: before.hints.revision,
        });
      }
      await waiting;
      assert.equal(
        (
          await post(server, "/api/new-game", {
            revision: before.revision,
            seed: 0,
            confirmed: true,
          })
        ).status,
        409,
      );
      release();
      await turn;
      let current;
      for (let attempt = 0; attempt < 100; attempt++) {
        current = await state(server);
        if (
          current.hints.status !== "preparing" &&
          current.strongerHints?.status !== "preparing"
        ) {
          break;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      }
      const reset = await post(server, "/api/new-game", {
        revision: current.revision,
        seed: 0,
        confirmed: true,
      });
      assert.equal(reset.status, 200);
      const fresh = (await reset.json()).view;
      assert.deepEqual(fresh.history, []);
      assert.equal(fresh.strongerHints, undefined);
      assert.notEqual(fresh.hints.revision, before.hints.revision);
    } finally {
      release();
      await turn;
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
const model = {
  async respond(request) {
    return request.toolResults.length
      ? { text: "Travel saved." }
      : {
          toolCalls: [
            {
              id: "move",
              name: "move",
              argumentsJson: '{"destinationId":"watch-loft"}',
            },
          ],
        };
  },
};

test("page cancellation preserves open hints and draft; confirmation clears them and restores focus", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-104-page-"));
  const savePath = join(directory, "slot.json");
  const server = await startBrowserServer({
    savePath,
    seed: 42,
    apiKey: "offline",
    dmModel: model,
  });
  try {
    await post(server, "/api/start", {});
    const page = await browserPage(server);
    await page.submit("Go to Watch Loft");
    page.click("open-hints");
    await page.click("request-stronger-hint");
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await state(server)).strongerHints?.status !== "preparing") {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    const bytes = await readFile(savePath, "utf8");
    page.nodes.get("message").value = "Unsent draft";
    page.click("new-game");
    assert.match(
      page.nodes.get("new-game-description").textContent,
      /progress, conversation history.*both hint levels.*seed 42/,
    );
    assert.equal(page.focused(), "cancel-new-game");
    page.click("cancel-new-game");
    assert.equal(page.focused(), "new-game");
    assert.equal(page.nodes.get("information").hidden, false);
    assert.equal(page.nodes.get("message").value, "Unsent draft");
    assert.equal(await readFile(savePath, "utf8"), bytes);
    page.click("new-game");
    await page.click("confirm-new-game");
    assert.equal(
      page.focused(),
      "scene",
      page.nodes.get("feedback").textContent,
    );
    assert.equal(page.nodes.get("information").hidden, true);
    assert.equal(page.nodes.get("message").value, "");
    assert.equal(page.nodes.get("conversation").children.length, 0);
    assert.equal(page.nodes.get("scene-title").textContent, "Watch Yard");
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a delayed old-tab reply is discarded after another tab replaces the slot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-104-delay-"));
  const server = await startBrowserServer({
    savePath: join(directory, "slot.json"),
    seed: 42,
    apiKey: "offline",
    dmModel: model,
  });
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    await post(server, "/api/start", {});
    const oldTab = await browserPage(server, async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith("/api/turn")) {
        const bytes = await response.text();
        entered();
        await gate;
        return new Response(bytes, { status: response.status });
      }
      return response;
    });
    const turn = oldTab.submit("Go to Watch Loft");
    await waiting;
    const secondTab = await browserPage(server);
    secondTab.click("new-game");
    await secondTab.click("confirm-new-game");
    release();
    await turn;
    assert.equal(oldTab.nodes.get("scene-title").textContent, "Watch Yard");
    assert.equal(oldTab.nodes.get("conversation").children.length, 0);
    assert.match(
      oldTab.nodes.get("feedback").textContent,
      /old reply was discarded/,
    );
    assert.equal(oldTab.texts().includes("Travel saved."), false);
  } finally {
    release();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("confirmed replacement clears the single slot and rejects old-tab actions and hints across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-104-"));
  const savePath = join(directory, "slot.json");
  const options = { savePath, seed: 42, apiKey: "offline", dmModel: model };
  let server = await startBrowserServer(options);
  try {
    await post(server, "/api/start", {});
    const opening = await state(server);
    await post(server, "/api/turn", {
      revision: opening.revision,
      message: "Go to Watch Loft",
    });
    const old = await state(server);
    const bytes = await readFile(savePath, "utf8");
    // A verified old recovery journal must not resurrect its generation later.
    await writeFile(savePath + ".recovery", bytes);
    assert.equal(
      (
        await post(server, "/api/new-game", {
          revision: old.revision,
          seed: old.newGameSeed,
          confirmed: false,
        })
      ).status,
      400,
    );
    assert.equal(await readFile(savePath, "utf8"), bytes);
    const response = await post(server, "/api/new-game", {
      revision: old.revision,
      seed: old.newGameSeed,
      confirmed: true,
    });
    assert.equal(response.status, 200);
    const fresh = (await response.json()).view;
    assert.equal(fresh.seed, 42);
    assert.equal(fresh.position, 0);
    assert.equal(fresh.scene.room.name, "Watch Yard");
    assert.deepEqual(fresh.history, []);
    assert.equal(fresh.strongerHints, undefined);
    assert.notEqual(fresh.hints.revision, opening.hints.revision);
    assert.equal(
      (
        await post(server, "/api/turn", {
          revision: old.revision,
          message: "Go to Watch Loft",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post(server, "/api/hints/stronger", {
          revision: old.hints.revision,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await post(server, "/api/new-game", {
          revision: old.revision,
          seed: 42,
          confirmed: true,
        })
      ).status,
      409,
    );
    const saved = await SaveSession.load(savePath);
    assert.equal(saved.progress.randomPosition, 0);
    await server.close();
    server = await startBrowserServer({ ...options, seed: 99 });
    const restored = await state(server);
    assert.equal(restored.seed, 42);
    assert.equal(restored.newGameSeed, 99);
    assert.deepEqual(restored.history, []);
    assert.equal(restored.scene.room.name, "Watch Yard");
    assert.equal(restored.hints.revision, fresh.hints.revision);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("completed Hollow Beacon slots can be replaced by a clean active opening", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-104-completed-"));
  const savePath = join(directory, "slot.json");
  const server = await startBrowserServer({
    savePath,
    seed: 0,
    apiKey: "offline",
    dmModel: model,
  });
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
      "resolve hold-beacon",
    ]) {
      await session.commit(command, session.runtime.parseCommand(command));
    }
    assert.equal((await state(server)).scene.outcome, "victory");
    const page = await browserPage(server);
    assert.equal(page.nodes.get("new-game").hidden, false);
    page.click("new-game");
    await page.click("confirm-new-game");
    const fresh = await state(server);
    assert.equal(fresh.scene.outcome, "playing");
    assert.equal(fresh.position, 0);
    assert.deepEqual(fresh.history, []);
    assert.equal(fresh.scene.room.name, "Watch Yard");
    assert.deepEqual(
      (await SaveSession.load(savePath)).state,
      session.runtime.createSession(),
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a delayed replacement response refreshes the latest generation after another reset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-104-reset-delay-"));
  const server = await startBrowserServer({
    savePath: join(directory, "slot.json"),
    seed: 42,
    apiKey: "offline",
    dmModel: model,
  });
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    await post(server, "/api/start", {});
    const oldTab = await browserPage(server, async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith("/api/new-game")) {
        const bytes = await response.text();
        entered();
        await gate;
        return new Response(bytes, { status: response.status });
      }
      return response;
    });
    oldTab.click("new-game");
    const resetting = oldTab.click("confirm-new-game");
    await waiting;
    const secondTab = await browserPage(server);
    secondTab.click("new-game");
    await secondTab.click("confirm-new-game");
    release();
    await resetting;
    assert.match(oldTab.nodes.get("feedback").textContent, /replaced again/);
    oldTab.click("new-game");
    await oldTab.click("confirm-new-game");
    assert.match(oldTab.nodes.get("feedback").textContent, /New game saved/);
  } finally {
    release();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a delayed hint response cannot populate the replacement session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-104-hint-delay-"));
  const server = await startBrowserServer({
    savePath: join(directory, "slot.json"),
    seed: 42,
    apiKey: "offline",
    dmModel: model,
  });
  let release, entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  try {
    await post(server, "/api/start", {});
    const oldTab = await browserPage(server, async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith("/api/hints/stronger")) {
        const bytes = await response.text();
        entered();
        await gate;
        return new Response(bytes, { status: response.status });
      }
      return response;
    });
    oldTab.click("open-hints");
    const hint = oldTab.click("request-stronger-hint");
    await waiting;
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await state(server)).strongerHints?.status !== "preparing") {
        break;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    const secondTab = await browserPage(server);
    secondTab.click("new-game");
    await secondTab.click("confirm-new-game");
    release();
    await hint;
    assert.match(
      oldTab.nodes.get("feedback").textContent,
      /old hints were discarded/,
    );
    oldTab.click("open-hints");
    assert.equal(oldTab.nodes.get("request-stronger-hint").disabled, false);
    assert.equal((await state(server)).strongerHints, undefined);
  } finally {
    release();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
