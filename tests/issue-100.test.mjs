import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { BROWSER_HTML, BROWSER_SCRIPT } from "../dist/browser-page.js";
import { historyDigest } from "../dist/browser-history.js";
import { SaveSession } from "../dist/save.js";
import { startBrowserServer } from "../dist/browser-server.js";

async function launch(path, seed = 0, mode = "normal") {
  const child = fork(
    new URL("./fixtures/issue-100-server.mjs", import.meta.url),
    [path, String(seed), mode],
    { stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true },
  );
  const messages = [];
  child.on("message", (message) => messages.push(message));
  let errors = "";
  child.stderr.on("data", (data) => {
    errors += data;
  });
  const ready = await new Promise((resolve, reject) => {
    child.on("message", (message) => {
      if (message.type === "ready") {
        resolve(message);
      }
    });
    child.once("exit", () => reject(new Error(errors)));
  });
  return {
    child,
    messages,
    url: ready.url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = once(child, "exit");
      child.send("stop");
      await exited;
    },
  };
}
async function post(server, endpoint, body) {
  return fetch(server.url + endpoint, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const view = async (server) => (await fetch(server.url + "/api/state")).json();

// Execute the real page script with a new document and real HTTP/storage.
async function reloadPage(server) {
  let loaded;
  const ready = new Promise((resolve) => {
    loaded = resolve;
  });
  const nodes = new Map();
  const node = (id) => ({
    children: [],
    listeners: {},
    value: "",
    textContent: "",
    scrollTop: 0,
    clientHeight: 400,
    get scrollHeight() {
      return this.children.length * 100;
    },
    set disabled(value) {
      this.isDisabled = value;
      if (id === "message" && !value) {
        loaded();
      }
    },
    get disabled() {
      return this.isDisabled;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener(event, listener) {
      this.listeners[event] = listener;
    },
    setAttribute() {},
    focus() {},
  });
  for (const match of BROWSER_HTML.matchAll(/id="([^"]+)"/g)) {
    nodes.set(match[1], node(match[1]));
  }
  runInNewContext(BROWSER_SCRIPT, {
    document: {
      getElementById: (id) => nodes.get(id),
      createElement: () => node(),
    },
    fetch: (url, options) => fetch(server.url + url, options),
  });
  await ready;
  return {
    nodes,
    entries: nodes.get("conversation").children.map((article) => ({
      label: article.children[0].textContent,
      text: article.children[1].textContent,
      className: article.className,
    })),
  };
}

test("page reload and a second process retain exact messages, NPC labels, cards, state and RNG without provider calls", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-100-restart-"));
  const path = join(directory, "slot.json");
  let server;
  try {
    server = await launch(path);
    await post(server, "/api/start", {});
    const first = await (
      await post(server, "/api/turn", { message: "  Move to the Watch Loft\n" })
    ).json();
    const second = await (
      await post(server, "/api/turn", {
        message: "Persuade Pell about his shift",
      })
    ).json();
    assert.equal(first.message, "  Move to the Watch Loft\n");
    assert.equal(second.speaker, "Pell");
    const before = JSON.parse(await readFile(path, "utf8"));
    assert.ok(before.checkpoint.randomPosition > 0);
    assert.deepEqual(
      before.browserHistory.turns,
      [first, second].map((result) => {
        const turn = { ...result };
        delete turn.view;
        return turn;
      }),
    );
    const page = await reloadPage(server);
    assert.equal(page.entries[0].text, first.message);
    assert.ok(
      page.entries.some(
        ({ label, text }) =>
          label === "NPC dialogue · Pell" && text === second.reply,
      ),
    );
    assert.ok(
      page.entries.some(
        ({ label, text }) =>
          label === first.cards[0].title && text === first.cards[0].text,
      ),
    );
    await server.stop();
    server = await launch(path, 999);
    assert.deepEqual(await view(server), second.view);
    assert.deepEqual((await reloadPage(server)).entries, page.entries);
    assert.equal(
      server.messages.filter(({ type }) => type === "provider-call").length,
      0,
    );
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), before);
    assert.equal((await SaveSession.load(path)).seed, 0);
    // Long display history survives while route context stays independently bounded.
    for (let index = 0; index < 10; index++) {
      await post(server, "/api/turn", { message: "Question " + index });
    }
    assert.equal((await view(server)).history.length, 12);
    assert.ok(
      server.messages
        .filter(({ type }) => type === "provider-call")
        .every(({ entries, characters }) => entries <= 8 && characters <= 4000),
    );
    assert.equal(
      JSON.stringify((await view(server)).history).includes(
        "private-provider-payload",
      ),
      false,
    );
    assert.equal(
      JSON.stringify((await view(server)).history).includes("private-test-key"),
      false,
    );
    // CLI resume remains readable even when it advances beyond the last browser turn.
    const session = await SaveSession.load(path);
    await session.commit(
      "move watch-yard",
      session.runtime.parseCommand("move watch-yard"),
    );
    assert.equal((await SaveSession.load(path)).state.locationId, "watch-yard");
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("completed sessions continue as readable history with the saved adventure and seed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-100-completed-"));
  const path = join(directory, "slot.json");
  let server;
  try {
    server = await launch(path);
    await post(server, "/api/start", {});
    const session = await SaveSession.load(path);
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
    const result = await (
      await post(server, "/api/turn", { message: "Hold the beacon" })
    ).json();
    assert.equal(result.committed, true);
    assert.notEqual(result.view.scene.outcome, "active");
    await server.stop();
    server = await launch(path, 55);
    assert.deepEqual(await view(server), result.view);
    const page = await reloadPage(server);
    assert.match(page.nodes.get("seed").textContent, /Hollow Beacon.*Seed 0/);
    assert.equal(
      page.nodes.get("session").textContent,
      result.view.scene.outcome,
    );
    assert.equal(page.entries[0].text, "Hold the beacon");
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("killing a process after the engine commit recovers its truthful result without replaying the action", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-100-interrupt-"));
  const path = join(directory, "slot.json");
  let server;
  try {
    server = await launch(path, 0, "interrupt");
    await post(server, "/api/start", {});
    const interruptedChild = server.child;
    const committed = new Promise((resolve) => {
      interruptedChild.on("message", (message) => {
        if (message.type === "committed") {
          resolve();
        }
      });
    });
    const pending = post(server, "/api/turn", {
      message: "Move to the Watch Loft",
    }).catch(() => undefined);
    await committed;
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.equal(saved.transitions.length, 1);
    const exited = once(server.child, "exit");
    server.child.kill();
    await exited;
    await pending;
    server = await launch(path);
    const restored = await view(server);
    assert.match(
      restored.history[0].reply,
      /interrupted.*action was saved; do not repeat/,
    );
    assert.equal(restored.history[0].cards[0].text, "Travelled to Watch Loft.");
    assert.equal(restored.scene.room.name, "Watch Loft");
    const after = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(after.checkpoint, saved.checkpoint);
    assert.deepEqual(after.transitions, saved.transitions);
    assert.equal(after.browserHistory.pending, undefined);
    assert.equal(
      server.messages.filter(({ type }) => type === "provider-call").length,
      0,
    );
    assert.equal(
      (await reloadPage(server)).entries[0].text,
      "Move to the Watch Loft",
    );
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid or mismatched browser records fail without replacing the valid slot; engine-only saves remain readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-100-invalid-"));
  const path = join(directory, "slot.json");
  let server;
  try {
    server = await launch(path);
    await post(server, "/api/start", {});
    await post(server, "/api/turn", { message: "Move to the Watch Loft" });
    await server.stop();
    const valid = JSON.parse(await readFile(path, "utf8"));
    for (const change of [
      (save) => {
        save.browserHistory.version = 2;
      },
      (save) => {
        save.browserHistory.progress.randomPosition++;
      },
      (save) => {
        save.browserHistory.turns[0].sequence++;
      },
      (save) => {
        save.browserHistory.turns[0].sequence = 0;
      },
      (save) => {
        save.browserHistory.turns[0].cards = [];
      },
      (save) => {
        save.browserHistory.turns = [];
        save.browserHistory.pending = {
          sequence: 0,
          message: "Move to the Watch Loft",
          cards: [],
        };
      },
      (save) => {
        save.browserHistory.pending = {
          sequence: 1,
          message: "Question",
          cards: [
            { title: "Resolved action", text: "Impossible unsaved result" },
          ],
        };
      },
      (save) => {
        save.browserHistory.turns[0].providerPayload = "private";
      },
    ]) {
      const invalid = structuredClone(valid);
      change(invalid);
      invalid.browserHistoryDigest = historyDigest(invalid.browserHistory);
      const bytes = JSON.stringify(invalid);
      await writeFile(path, bytes);
      await assert.rejects(
        startBrowserServer({ savePath: path, seed: 0, apiKey: "test" }),
        /browser conversation history/,
      );
      assert.equal(await readFile(path, "utf8"), bytes);
    }
    delete valid.browserHistory;
    delete valid.browserHistoryDigest;
    await writeFile(path, JSON.stringify(valid));
    const legacy = await SaveSession.load(path);
    assert.equal(legacy.state.locationId, "watch-loft");
    server = await launch(path);
    assert.deepEqual((await view(server)).history, []);
    await post(server, "/api/turn", { message: "Question about the loft" });
    assert.equal((await view(server)).history.length, 1);
  } finally {
    await server?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
