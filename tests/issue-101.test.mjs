import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";
import { BROWSER_HTML, BROWSER_SCRIPT } from "../dist/browser-page.js";

const state = async (server) => (await fetch(server.url + "/api/state")).json();
async function post(server, body, endpoint = "/api/turn") {
  return fetch(server.url + endpoint, {
    method: "POST",
    headers: { Origin: server.url },
    body: JSON.stringify(body),
  });
}
async function game(model, run) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-101-"));
  const path = join(directory, "slot", "save.json");
  await mkdir(dirname(path));
  const server = await startBrowserServer({
    savePath: path,
    seed: 0,
    apiKey: "test",
    dmModel: model,
  });
  try {
    await post(server, {}, "/api/start");
    await run(server, path);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const action = (name, args) => ({
  toolCalls: [{ id: "action", name, argumentsJson: JSON.stringify(args) }],
});
const move = () => action("move", { destinationId: "watch-loft" });
const talk = () =>
  action("talk", { speakerId: "pell", topicId: "shift", approach: "persuade" });
const reply = (request) =>
  "reply" in request
    ? {
        text: JSON.stringify({
          delivery: "steady",
          opening: "none",
          closing: "none",
          factIds: request.reply.approvedFacts.map(({ id }) => id),
        }),
      }
    : { text: "Done." };

// The real page script drives HTTP and the real verified save; only DOM rendering
// and response delivery are replaced so response loss can be deterministic.
async function page(server, loseResponse = false) {
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
    remove() {},
  });
  for (const match of BROWSER_HTML.matchAll(/id="([^"]+)"/g)) {
    nodes.set(match[1], node(match[1]));
  }
  runInNewContext(BROWSER_SCRIPT, {
    document: {
      getElementById: (id) => nodes.get(id),
      createElement: () => node(),
    },
    fetch: async (url, options = {}) => {
      const response = await fetch(server.url + url, {
        ...options,
        headers: { ...options.headers, Origin: server.url },
      });
      if (url === "/api/turn" && loseResponse) {
        loseResponse = false;
        await response.text();
        throw new Error(
          "Connection lost. Read current state before repeating an action.",
        );
      }
      return response;
    },
  });
  await ready;
  return {
    nodes,
    async send(message) {
      nodes.get("message").value = message;
      await nodes.get("turn").listeners.submit({ preventDefault() {} });
    },
    texts() {
      return nodes
        .get("conversation")
        .children.map((entry) => entry.children[1].textContent);
    },
  };
}

test("lost browser response and second-tab stale typed intent preserve one commit and RNG; fresh AI gameplay continues", async () => {
  let calls = 0;
  await game(
    {
      async respond(request) {
        calls++;
        return request.toolResults.length || "reply" in request
          ? reply(request)
          : request.playerInput.includes("Pell")
            ? talk()
            : move();
      },
    },
    async (server, path) => {
      const stale = await state(server);
      const browser = await page(server, true);
      await browser.send("Move to Watch Loft");
      assert.equal(browser.nodes.get("location").textContent, "Watch Loft");
      assert.ok(browser.texts().includes("Travelled to Watch Loft."));
      const saved = await readFile(path, "utf8");
      const beforeCalls = calls;
      const duplicate = await post(server, {
        revision: stale.revision,
        message: "Move to Watch Loft",
      });
      assert.equal(duplicate.status, 409);
      assert.equal((await duplicate.json()).view.position, 1);
      assert.equal(await readFile(path, "utf8"), saved);
      assert.equal(calls, beforeCalls);
      const reloaded = await page(server);
      assert.ok(reloaded.texts().includes("Travelled to Watch Loft."));
      await reloaded.send("Persuade Pell about his shift");
      const after = JSON.parse(await readFile(path, "utf8"));
      assert.equal(after.transitions.length, 2);
      assert.ok(after.checkpoint.randomPosition > 0);
      const verified = await SaveSession.load(path);
      assert.equal(
        verified.progress.randomPosition,
        after.checkpoint.randomPosition,
      );
      // Independent uninterrupted engine route proves exact RNG/state equality.
      const control = await SaveSession.start(
        join(path + "-control"),
        verified.runtime,
        0,
      );
      await control.executeTool(
        control.state,
        {
          id: "move",
          name: "move",
          argumentsJson: JSON.stringify({ destinationId: "watch-loft" }),
        },
        "Move to Watch Loft",
      );
      await control.executeTool(
        control.state,
        {
          id: "talk",
          name: "talk",
          argumentsJson: JSON.stringify({
            speakerId: "pell",
            topicId: "shift",
            approach: "persuade",
          }),
        },
        "Persuade Pell about his shift",
      );
      assert.deepEqual(verified.progress, control.progress);
      assert.deepEqual(verified.state, control.state);
    },
  );
});

test("reload during a turn and concurrent tabs cannot commit twice, including a response lost after a random action", async () => {
  let entered, release;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let pause = false;
  await game(
    {
      async respond(request) {
        if (pause && "reply" in request) {
          entered();
          await gate;
        }
        return request.toolResults.length || "reply" in request
          ? reply(request)
          : request.playerInput.includes("Pell")
            ? talk()
            : move();
      },
    },
    async (server, path) => {
      await post(server, {
        revision: (await state(server)).revision,
        message: "Move to Watch Loft",
      });
      pause = true;
      const old = await state(server);
      const first = post(server, {
        revision: old.revision,
        message: "Persuade Pell about his shift",
      });
      await waiting;
      try {
        const reload = await page(server);
        assert.match(
          reload.nodes.get("feedback").textContent,
          /pending.*do not repeat/,
        );
        const saved = await readFile(path, "utf8");
        assert.equal(
          (
            await post(server, {
              revision: old.revision,
              message: "Persuade Pell about his shift",
            })
          ).status,
          409,
        );
        assert.equal(await readFile(path, "utf8"), saved);
      } finally {
        release();
      }
      assert.equal((await first).status, 200);
      const bytes = await readFile(path, "utf8");
      assert.equal(
        (
          await post(server, {
            revision: old.revision,
            message: "Persuade Pell about his shift",
          })
        ).status,
        409,
      );
      assert.equal(await readFile(path, "utf8"), bytes);
      assert.equal(JSON.parse(bytes).transitions.length, 2);
    },
  );
});

test("provider failure before commit permits retry; failure after commit preserves authored dialogue and dice", async () => {
  let beforeFailure = true,
    afterFailure = false;
  await game(
    {
      async respond(request) {
        if (beforeFailure || (afterFailure && "reply" in request)) {
          throw new Error("provider unavailable");
        }
        return request.toolResults.length || "reply" in request
          ? reply(request)
          : request.playerInput.includes("Pell")
            ? talk()
            : move();
      },
    },
    async (server, path) => {
      const initial = (await SaveSession.load(path)).progress;
      const failed = await (
        await post(server, {
          revision: (await state(server)).revision,
          message: "Move to Watch Loft",
        })
      ).json();
      assert.equal(failed.committed, false);
      assert.deepEqual((await SaveSession.load(path)).progress, initial);
      beforeFailure = false;
      await post(server, {
        revision: failed.view.revision,
        message: "Move to Watch Loft",
      });
      afterFailure = true;
      const revision = (await state(server)).revision;
      const failedReply = await (
        await post(server, {
          revision,
          message: "Persuade Pell about his shift",
        })
      ).json();
      assert.equal(failedReply.committed, true);
      assert.ok(failedReply.reply.length > 0);
      assert.equal(failedReply.speaker, "Pell");
      assert.match(failedReply.notice, /saved; do not repeat.*Position 2/);
      const bytes = await readFile(path, "utf8");
      assert.equal(
        (
          await post(server, {
            revision,
            message: "Persuade Pell about his shift",
          })
        ).status,
        409,
      );
      assert.equal(await readFile(path, "utf8"), bytes);
      afterFailure = false;
      const continued = await (
        await post(server, {
          revision: failedReply.view.revision,
          message: "Ask Pell again",
        })
      ).json();
      assert.equal(continued.view.position, 3);
    },
  );
});

test("save publication failure retains a verified journal and recovers the exact result without executing again", async () => {
  let path,
    bytes,
    sabotage = false,
    calls = 0;
  await game(
    {
      async respond(request) {
        calls++;
        if (sabotage && !request.toolResults.length) {
          sabotage = false;
          bytes = await readFile(path, "utf8");
          await rm(path);
          await mkdir(path);
        }
        return request.toolResults.length ? reply(request) : move();
      },
    },
    async (server, slot) => {
      path = slot;
      sabotage = true;
      const revision = (await state(server)).revision;
      const failed = await post(server, {
        revision,
        message: "Move to Watch Loft",
      });
      assert.equal(failed.status, 500);
      const result = await failed.json();
      assert.match(result.error, /Durable position: 1.*retained/);
      assert.equal(result.view.recovery, "unsaved");
      assert.equal(result.view.scene.room.name, "Watch Loft");
      const journal = JSON.parse(await readFile(path + ".recovery", "utf8"));
      assert.equal(journal.transitions.length, 1);
      assert.equal((await SaveSession.load(path)).progress.sequence, 1);
      assert.equal(
        (await post(server, { revision, message: "Move to Watch Loft" }))
          .status,
        409,
      );
      await rm(path, { recursive: true });
      // Restore the older primary to model a restart before publication succeeds.
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, bytes);
      const restarted = await startBrowserServer({
        savePath: path,
        seed: 88,
        apiKey: "test",
        dmModel: {
          async respond() {
            assert.fail("Recovery must not call AI");
          },
        },
      });
      try {
        const restored = await state(restarted);
        assert.equal(restored.position, 1);
        assert.equal(
          restored.history[0].cards[0].text,
          "Travelled to Watch Loft.",
        );
        assert.deepEqual(
          JSON.parse(await readFile(path, "utf8")).checkpoint,
          journal.checkpoint,
        );
      } finally {
        await restarted.close();
      }
      const count = calls;
      const recovery = await post(server, {}, "/api/recover");
      assert.equal(recovery.status, 200);
      assert.equal((await recovery.json()).view.recovery, "saved");
      assert.equal(calls, count);
      assert.deepEqual(
        JSON.parse(await readFile(path, "utf8")).checkpoint,
        journal.checkpoint,
      );
    },
  );
});

test("killed local processes recover both sides of commit and preserve a random result across restart", async () => {
  const { fork } = await import("node:child_process");
  const { once } = await import("node:events");
  const directory = await mkdtemp(join(tmpdir(), "dungeon-101-kill-"));
  const path = join(directory, "slot.json");
  let child;
  async function launch(mode) {
    child = fork(
      new URL("./fixtures/issue-100-server.mjs", import.meta.url),
      [path, "0", mode],
      { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true },
    );
    const ready = await new Promise((resolve, reject) => {
      child.on("message", (message) => {
        if (message.type === "ready") {
          resolve(message);
        }
      });
      child.once("exit", () => reject(new Error("Server exited before ready")));
    });
    return { url: ready.url };
  }
  async function kill() {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  try {
    for (const mode of ["before", "interrupt"]) {
      const server = await launch(mode);
      await post(server, {}, "/api/start");
      if (mode === "interrupt") {
        const session = await SaveSession.load(path);
        await session.commit(
          "move watch-loft",
          session.runtime.parseCommand("move watch-loft"),
        );
      }
      const old = await state(server);
      const reached = new Promise((resolve) => {
        child.on("message", (message) => {
          if (message.type === (mode === "before" ? "entered" : "committed")) {
            resolve();
          }
        });
      });
      const interrupted = post(server, {
        revision: old.revision,
        message:
          mode === "before"
            ? "Move to Watch Loft"
            : "Persuade Pell about his shift",
      }).catch(() => undefined);
      await reached;
      const saved = JSON.parse(await readFile(path, "utf8"));
      assert.equal(saved.transitions.length, mode === "before" ? 0 : 2);
      if (mode === "interrupt") {
        assert.ok(saved.checkpoint.randomPosition > 0);
      }
      await kill();
      await interrupted;
      const restarted = await launch("normal");
      const view = await state(restarted);
      assert.equal(view.recovery, "saved");
      assert.match(
        view.history.at(-1).notice,
        mode === "before"
          ? /No action was committed/
          : /action was saved; do not repeat/,
      );
      if (mode === "interrupt") {
        assert.equal(
          view.history.at(-1).reply,
          saved.browserHistory.pending.reply,
        );
        assert.equal(view.history.at(-1).speaker, "Pell");
      }
      assert.deepEqual(
        JSON.parse(await readFile(path, "utf8")).checkpoint,
        saved.checkpoint,
      );
      assert.equal(
        (
          await post(restarted, {
            revision: old.revision,
            message: "Persuade Pell about his shift",
          })
        ).status,
        409,
      );
      await kill();
    }
  } finally {
    if (child?.exitCode === null && child.signalCode === null) {
      await kill();
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("failure before a journal exists retains rolled result in memory, blocks replay, and saves exactly after storage repair", async () => {
  let path,
    offline,
    sabotage = false,
    calls = 0;
  await game(
    {
      async respond(request) {
        calls++;
        if (sabotage && !request.toolResults.length && !("reply" in request)) {
          sabotage = false;
          offline = join(dirname(dirname(path)), "offline");
          await rename(dirname(path), offline);
        }
        return request.toolResults.length || "reply" in request
          ? reply(request)
          : request.playerInput.includes("Pell")
            ? talk()
            : move();
      },
    },
    async (server, slot) => {
      path = slot;
      await post(server, {
        revision: (await state(server)).revision,
        message: "Move to Watch Loft",
      });
      const before = JSON.parse(await readFile(path, "utf8"));
      const revision = (await state(server)).revision;
      sabotage = true;
      const failed = await post(server, {
        revision,
        message: "Persuade Pell about his shift",
      });
      assert.equal(failed.status, 500);
      const retained = await failed.json();
      assert.equal(retained.view.recovery, "unsaved");
      assert.match(retained.error, /Durable position: unavailable.*retained/);
      assert.equal(retained.view.position, 2);
      assert.equal(retained.view.history.at(-1).speaker, "Pell");
      assert.equal(
        JSON.parse(await readFile(join(offline, "save.json"), "utf8"))
          .checkpoint.sequence,
        1,
      );
      const count = calls;
      assert.equal(
        (
          await post(server, {
            revision,
            message: "Persuade Pell about his shift",
          })
        ).status,
        409,
      );
      assert.equal(calls, count);
      // An attempted recovery while storage is unavailable stays visibly unsaved.
      assert.equal((await post(server, {}, "/api/recover")).status, 503);
      assert.equal((await state(server)).recovery, "unsaved");
      await rename(offline, dirname(path));
      const recoveredPage = await page(server);
      assert.match(
        recoveredPage.nodes.get("feedback").textContent,
        /Saved progress.*Position 2/,
      );
      assert.equal(calls, count);
      const saved = JSON.parse(await readFile(path, "utf8"));
      assert.equal(saved.transitions.length, 2);
      assert.deepEqual(saved.transitions[0], before.transitions[0]);
      assert.deepEqual(
        saved.browserHistory.turns.at(-1).cards,
        retained.view.history.at(-1).cards,
      );
      assert.equal(
        saved.browserHistory.turns.at(-1).reply,
        retained.view.history.at(-1).reply,
      );
      const verified = await SaveSession.load(path);
      const control = await SaveSession.start(
        path + "-control",
        verified.runtime,
        0,
      );
      await control.executeTool(
        control.state,
        {
          id: "move",
          name: "move",
          argumentsJson: JSON.stringify({ destinationId: "watch-loft" }),
        },
        "Move to Watch Loft",
      );
      await control.executeTool(
        control.state,
        {
          id: "talk",
          name: "talk",
          argumentsJson: JSON.stringify({
            speakerId: "pell",
            topicId: "shift",
            approach: "persuade",
          }),
        },
        "Persuade Pell about his shift",
      );
      assert.deepEqual(verified.progress, control.progress);
      assert.deepEqual(verified.state, control.state);
    },
  );
});

test("NPC dialogue appears once after reload while distinct resolved mechanics remain visible and saved", async () => {
  await game(
    {
      async respond(request) {
        return request.toolResults.length || "reply" in request
          ? reply(request)
          : request.playerInput.includes("Pell")
            ? talk()
            : move();
      },
    },
    async (server, path) => {
      await post(server, {
        revision: (await state(server)).revision,
        message: "Move to Watch Loft",
      });
      const turn = await (
        await post(server, {
          revision: (await state(server)).revision,
          message: "Persuade Pell about his shift",
        })
      ).json();
      const duplicate = turn.cards[0].text;
      assert.equal(duplicate, turn.reply);
      const saved = await readFile(path, "utf8");
      const browser = await page(server);
      assert.equal(
        browser.texts().filter((text) => text === turn.reply).length,
        1,
      );
      assert.ok(browser.texts().includes("Travelled to Watch Loft."));
      assert.equal(await readFile(path, "utf8"), saved);
      // A card containing both repeated speech and distinct mechanics displays
      // just the mechanics, without rewriting the persisted historical card.
      const session = await SaveSession.load(path);
      const history = session.browserHistory;
      const turns = [...history.turns];
      turns[turns.length - 1] = {
        ...turns.at(-1),
        cards: [
          { title: "Resolved action", text: duplicate + "\nDay 0 → Day 1." },
        ],
      };
      await session.saveBrowserHistory({ ...history, turns });
      const updated = await page(server);
      assert.equal(
        updated.texts().filter((text) => text === turn.reply).length,
        1,
      );
      assert.ok(updated.texts().includes("Day 0 → Day 1."));
      assert.equal(
        (await state(server)).history.at(-1).cards[0].text,
        duplicate + "\nDay 0 → Day 1.",
      );
    },
  );
});
