import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { BROWSER_HTML, BROWSER_SCRIPT } from "../dist/browser-page.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";

const call = (name, args, id = name) => ({
  id,
  name,
  argumentsJson: JSON.stringify(args),
});
function scripted(routes) {
  let index = 0;
  return {
    async respond(request) {
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
      if (request.toolResults.length) {
        return { text: "The requested result is shown below." };
      }
      const route = routes[index++];
      if (route instanceof Error) {
        throw route;
      }
      return typeof route === "string"
        ? { text: route }
        : { toolCalls: Array.isArray(route) ? route : [route] };
    },
  };
}
async function post(server, message) {
  return fetch(server.url + "/api/turn", {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
}
async function withGame(model, body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-97-"));
  const savePath = join(directory, "browser.json");
  const server = await startBrowserServer({
    savePath,
    seed: 0,
    apiKey: "private-test-key",
    dmModel: model,
  });
  try {
    await fetch(server.url + "/api/start", {
      method: "POST",
      headers: { Origin: server.url },
    });
    await body(server, savePath, directory);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const checkpoint = async (path) =>
  JSON.parse(await readFile(path, "utf8")).checkpoint;

test("browser conversation, evidence search and travel save the corresponding engine state and RNG", async () => {
  const routes = [
    call("talk", { speakerId: "iona", topicId: "brief", approach: "ask" }),
    call("move", { destinationId: "watch-loft" }),
    call("talk", { speakerId: "pell", topicId: "shift", approach: "persuade" }),
    call("move", { destinationId: "signal-records" }),
    call("search", { target: "setting-plate" }),
    call("move", { destinationId: "watch-loft" }),
  ];
  const messages = [
    "Ask Iona about the beacon",
    "Go to the Watch Loft",
    "Persuade Pell to tell me about his shift",
    "Enter the Signal Records Room",
    "Compare the setting plate",
    "Return to the Watch Loft",
  ];
  const commands = [
    "talk iona beacon ask",
    "move watch-loft",
    "talk pell shift persuade",
    "move signal-records",
    "search setting-plate",
    "move watch-loft",
  ];
  await withGame(scripted(routes), async (server, path, directory) => {
    const initial = await SaveSession.load(path);
    const engine = await SaveSession.start(
      join(directory, "engine.json"),
      initial.runtime,
      0,
    );
    for (let i = 0; i < messages.length; i++) {
      const response = await post(server, messages[i]);
      assert.equal(response.status, 200);
      const turn = await response.json();
      await engine.commit(
        commands[i],
        engine.runtime.parseCommand(commands[i]),
      );
      assert.deepEqual(await checkpoint(path), await checkpoint(engine.path));
      assert.deepEqual(
        turn.view.scene,
        engine.runtime.projectDmScene(engine.state),
      );
      assert.ok(turn.cards.length > 0);
      if (i === 0) {
        assert.match(turn.reply, /Iona/);
        assert.equal(turn.speaker, "Captain Iona");
      }
      if (i === 2) {
        assert.match(turn.reply, /Pell/);
        assert.match(turn.reply, /cannot give you my shift account/);
      }
      if (i === 4) {
        assert.match(turn.cards[0].text, /alteration is real/i);
      }
      assert.equal(JSON.stringify(turn).includes("private-test-key"), false);
      assert.equal(JSON.stringify(turn).includes("stateDigest"), false);
      assert.equal(turn.view.hp.current, 20);
      assert.equal(turn.view.clocks[0].value, 0);
    }
  });
});

test("questions, clarification and rejected or compound attempts preserve authority and dice", async () => {
  const routes = [
    call("get_scene", {}),
    "Which person do you mean?",
    call("search", { target: "secret-setting" }),
    call("move", { destinationId: "signal-records" }),
    call("move", { destinationId: "missing" }),
    [
      call("move", { destinationId: "watch-loft" }),
      call("search", { target: "setting-plate" }),
    ],
  ];
  await withGame(scripted(routes), async (server, path, directory) => {
    const before = await checkpoint(path);
    const initial = await SaveSession.load(path);
    const engine = await SaveSession.start(
      join(directory, "engine.json"),
      initial.runtime,
      0,
    );
    for (const [message, command] of [
      ["What can I see?", "look"],
      ["Talk to them", undefined],
      ["Search the secret setting", "search secret-setting"],
      ["Go straight to the records room", "move signal-records"],
      ["Go to missing", "move missing"],
      ["Go to the loft and search the plate", undefined],
    ]) {
      const response = await post(server, message);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.committed, false);
      if (command) {
        await engine.commit(command, engine.runtime.parseCommand(command));
      }
      assert.deepEqual(await checkpoint(path), await checkpoint(engine.path));
      assert.deepEqual(await checkpoint(path), before);
    }
  });
});

test("travel cards explain authoritative time advances and deadline consequences", async () => {
  for (const [destination, days] of [
    ["ridge-trail", 2],
    ["valley-road", 4],
  ]) {
    await withGame(
      scripted([call("move", { destinationId: destination })]),
      async (server, path, directory) => {
        const initial = await SaveSession.load(path);
        const engine = await SaveSession.start(
          join(directory, "engine.json"),
          initial.runtime,
          0,
        );
        const turn = await (
          await post(server, "Travel along the " + destination)
        ).json();
        await engine.commit(
          "move " + destination,
          engine.runtime.parseCommand("move " + destination),
        );
        assert.deepEqual(await checkpoint(path), await checkpoint(engine.path));
        assert.equal(turn.committed, true);
        assert.equal(turn.view.clocks[0].value, days);
        assert.match(turn.cards[0].text, new RegExp("Day 0.*Day " + days));
        if (days === 4) {
          assert.match(turn.cards[0].text, /Day 3/);
        }
        assert.equal(turn.cards[0].text.includes("Features:"), false);
      },
    );
  }
});

test("provider failures report whether an action was saved and never execute it again", async () => {
  let stage = 0;
  await withGame(
    {
      async respond(request) {
        if (stage++ === 0 || request.toolResults.length) {
          throw new Error("private provider error");
        }
        return { toolCalls: [call("move", { destinationId: "watch-loft" })] };
      },
    },
    async (server, path) => {
      const before = await checkpoint(path);
      const first = await (await post(server, "Go to the loft")).json();
      assert.equal(first.committed, false);
      assert.match(first.notice, /AI service failed.*No action was committed/);
      assert.deepEqual(await checkpoint(path), before);
      const second = await (await post(server, "Go to the loft")).json();
      assert.equal(second.committed, true);
      assert.match(second.notice, /saved; do not repeat/);
      assert.equal(second.view.scene.room.name, "Watch Loft");
      assert.equal(
        JSON.parse(await readFile(path, "utf8")).transitions.length,
        1,
      );
      assert.equal(stage, 3);
      assert.equal(
        JSON.stringify(second).includes("private provider error"),
        false,
      );
    },
  );
});

test("a second mutation in one attempt cannot commit or draw dice", async () => {
  await withGame(
    {
      async respond(request) {
        return {
          toolCalls: [
            request.toolResults.length
              ? call("search", { target: "setting-plate" })
              : call("move", { destinationId: "watch-loft" }),
          ],
        };
      },
    },
    async (server, path) => {
      const turn = await (
        await post(server, "Go to the loft then search the setting plate")
      ).json();
      assert.equal(turn.committed, true);
      assert.equal(turn.cards.length, 1);
      const save = JSON.parse(await readFile(path, "utf8"));
      assert.equal(save.transitions.length, 1);
      assert.equal(save.checkpoint.state.locationId, "watch-loft");
      assert.equal(save.checkpoint.randomPosition, 0);
    },
  );
});

test("pending server turns reject concurrent turns and starts before another provider call", async () => {
  let release;
  let entered;
  let calls = 0;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await withGame(
    {
      async respond() {
        calls++;
        entered();
        await gate;
        return { text: "Which lead would you like to follow?" };
      },
    },
    async (server, path) => {
      const before = await checkpoint(path);
      const first = post(server, "What should I do?");
      try {
        await waiting;
        assert.equal((await post(server, "Go to the loft")).status, 409);
        assert.equal(
          (
            await fetch(server.url + "/api/start", {
              method: "POST",
              headers: { Origin: server.url },
            })
          ).status,
          409,
        );
        assert.equal(calls, 1);
        assert.deepEqual(await checkpoint(path), before);
      } finally {
        release();
      }
      assert.equal((await first).status, 200);
    },
  );
});

test("invalid input and unrelated origins never reach the AI or alter storage", async () => {
  await withGame(
    {
      async respond() {
        assert.fail("must not call provider");
      },
    },
    async (server, path) => {
      const before = await readFile(path, "utf8");
      for (const message of [
        "",
        " ",
        "\ud800",
        "x".repeat(1001),
        "x".repeat(9000),
      ]) {
        assert.equal((await post(server, message)).status, 400);
      }
      assert.equal(
        (
          await fetch(server.url + "/api/turn", {
            method: "POST",
            headers: { Origin: "https://unrelated.example" },
            body: JSON.stringify({ message: "Go to the loft" }),
          })
        ).status,
        403,
      );
      assert.equal(await readFile(path, "utf8"), before);
    },
  );
});

test("browser script submits through API/storage, locks pending input and renders complete safe replies and cards", async () => {
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await withGame(
    {
      async respond(request) {
        calls++;
        if (request.toolResults.length) {
          return { text: "<script>untrusted reply</script>" };
        }
        entered();
        await gate;
        return { toolCalls: [call("move", { destinationId: "watch-loft" })] };
      },
    },
    async (server, path) => {
      // Minimal DOM boundary: execute the shipped script unchanged against the
      // actual service/save. A separate real-browser journey checks layout/AX.
      const nodes = new Map();
      let ready;
      const loaded = new Promise((resolve) => {
        ready = resolve;
      });
      function node(id = "") {
        return {
          id,
          children: [],
          scrollTop: 0,
          clientHeight: 100,
          get scrollHeight() {
            return this.children.length * 100;
          },
          listeners: {},
          textContent: "",
          value: "",
          hidden: false,
          set disabled(value) {
            this.isDisabled = value;
            if (id === "message" && !value) {
              ready();
            }
          },
          get disabled() {
            return this.isDisabled;
          },
          set innerHTML(_value) {
            assert.fail("untrusted content must be plain text");
          },
          append(...children) {
            children.forEach((child) => {
              child.parent = this;
            });
            this.children.push(...children);
          },
          replaceChildren(...children) {
            this.children = [];
            this.append(...children);
          },
          remove() {
            this.parent.children = this.parent.children.filter(
              (child) => child !== this,
            );
          },
          addEventListener(event, listener) {
            this.listeners[event] = listener;
          },
          requestSubmit() {
            this.submission = this.listeners.submit({ preventDefault() {} });
          },
          setAttribute(name, value) {
            this[name] = value;
          },
          focus() {
            this.focused = true;
          },
        };
      }
      for (const match of BROWSER_HTML.matchAll(/id="([^"]+)"/g)) {
        nodes.set(match[1], node(match[1]));
      }
      const document = {
        getElementById: (id) => nodes.get(id),
        createElement: () => node(),
      };
      runInNewContext(BROWSER_SCRIPT, {
        document,
        fetch: (url, options = {}) =>
          fetch(server.url + url, {
            ...options,
            headers: { ...options.headers, Origin: server.url },
          }),
      });
      await loaded;
      assert.equal(nodes.get("location").textContent, "Watch Yard");
      const before = await checkpoint(path);
      nodes.get("message").value = "Go to the Watch Loft";
      let prevented = false;
      const keydown = nodes.get("message").listeners.keydown;
      const enter = {
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        repeat: false,
        preventDefault() {
          prevented = true;
        },
      };
      keydown({ ...enter, shiftKey: true });
      keydown({ ...enter, isComposing: true });
      keydown({ ...enter, repeat: true });
      assert.equal(nodes.get("turn").submission, undefined);
      keydown(enter);
      assert.equal(prevented, true);
      const pending = nodes.get("turn").submission;
      try {
        await waiting;
        for (const id of ["message", "send", "refresh"]) {
          assert.equal(nodes.get(id).disabled, true);
        }
        assert.equal(nodes.get("conversation")["aria-busy"], "true");
        assert.equal(
          nodes.get("conversation").children[0].children[1].textContent,
          "Go to the Watch Loft",
        );
        assert.match(
          nodes.get("conversation").children[1].children[1].textContent,
          /Waiting for a complete reply/,
        );
        await nodes.get("turn").listeners.submit({ preventDefault() {} });
        keydown(enter);
        assert.equal(calls, 1);
        assert.deepEqual(await checkpoint(path), before);
      } finally {
        release();
      }
      await pending;
      assert.equal(nodes.get("location").textContent, "Watch Loft");
      assert.equal(nodes.get("hp").textContent, "20 / 20");
      assert.equal(nodes.get("send").disabled, false);
      assert.equal(nodes.get("message").focused, true);
      const articles = nodes.get("conversation").children;
      assert.equal(
        nodes.get("conversation").scrollTop,
        nodes.get("conversation").scrollHeight,
      );
      assert.equal(
        articles[1].children[1].textContent,
        "<script>untrusted reply</script>",
      );
      assert.equal(
        articles[2].children[1].textContent,
        "Travelled to Watch Loft.",
      );
      assert.equal(articles[3].children[1].textContent, "Action saved.");
      assert.equal(
        (await SaveSession.load(path)).state.locationId,
        "watch-loft",
      );
      assert.equal(
        JSON.parse(await readFile(path, "utf8")).transitions.length,
        1,
      );
    },
  );
});
