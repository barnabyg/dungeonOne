import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { startBrowserServer } from "../dist/browser-server.js";
import { BROWSER_HTML, BROWSER_SCRIPT } from "../dist/browser-page.js";
import { SaveSession } from "../dist/save.js";
import { strongerHintCandidates } from "../dist/browser-hints.js";

const state = async (server) => (await fetch(server.url + "/api/state")).json();
const post = (server, path, body) =>
  fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
async function settled(server) {
  for (let i = 0; i < 100; i++) {
    const view = await state(server);
    if (view.strongerHints && view.strongerHints.status !== "preparing") {
      return view;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  assert.fail("Stronger hint did not settle");
}
// A cache can be readable just before its write releases the exclusive lock.
// Retry only the explicit pending-work rejection, never stale game intents.
async function postAfterHintWrite(server, path, body) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await post(server, path, body);
    if (
      response.status !== 409 ||
      !/already pending/.test((await response.clone().json()).error)
    ) {
      assert.equal(response.status, 200);
      return response;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  assert.fail("Hint persistence did not release the turn lock");
}
async function page(server) {
  let ready;
  const loaded = new Promise((resolve) => {
    ready = resolve;
  });
  const node = (id) => ({
    children: [],
    listeners: {},
    attributes: {},
    textContent: "",
    value: "",
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 200,
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener(event, callback) {
      this.listeners[event] = callback;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    focus() {},
    set disabled(value) {
      this.isDisabled = value;
      if (id === "message" && !value) {
        ready();
      }
    },
    get disabled() {
      return this.isDisabled;
    },
  });
  const nodes = new Map(
    [...BROWSER_HTML.matchAll(/id="([^"]+)"/g)].map((match) => [
      match[1],
      node(match[1]),
    ]),
  );
  for (const match of BROWSER_HTML.matchAll(/<[^>]+id="([^"]+)"[^>]*>/g)) {
    nodes.get(match[1]).hidden = /\bhidden\b/.test(match[0]);
  }
  runInNewContext(BROWSER_SCRIPT, {
    document: {
      getElementById: (id) => nodes.get(id),
      createElement: () => node(),
    },
    fetch: (url, options = {}) =>
      fetch(server.url + url, {
        ...options,
        headers: { ...options.headers, Origin: server.url },
      }),
  });
  await loaded;
  return { nodes, click: (id) => nodes.get(id).listeners.click() };
}

test("explicit page escalation preserves gameplay and conversation, is public, cached and restored", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-103-"));
  const savePath = join(directory, "slot.json");
  let calls = 0;
  let release;
  const options = {
    savePath,
    seed: 0,
    apiKey: "offline",
    dmModel: {
      async respond() {
        assert.fail("Hints must not call the gameplay model");
      },
    },
    strongerHintPreparer: (candidates) => {
      calls++;
      assert.ok(candidates[0].includes("Watch Loft"));
      assert.ok(!candidates[0].includes("Travel to"));
      assert.ok(!candidates.join(" ").includes("Altered beacon setting"));
      return new Promise((resolve) => {
        release = () => resolve(candidates);
      });
    },
  };
  let server = await startBrowserServer(options);
  try {
    await post(server, "/api/start", {});
    const before = await state(server);
    const original = JSON.parse(await readFile(savePath, "utf8"));
    const browser = await page(server);
    browser.click("open-hints");
    assert.equal(calls, 0);
    assert.equal(browser.nodes.get("stronger-hint").hidden, false);
    assert.equal(browser.nodes.get("request-stronger-hint").disabled, false);
    const click = browser.click("request-stronger-hint");
    assert.match(
      browser.nodes.get("stronger-hint-result").textContent,
      /Preparing/,
    );
    assert.equal(browser.nodes.get("request-stronger-hint").disabled, true);
    await click;
    assert.equal(calls, 1);
    const duplicate = await post(server, "/api/hints/stronger", {
      revision: before.hints.revision,
    });
    assert.equal(duplicate.status, 200);
    assert.equal(calls, 1);
    release();
    const after = await settled(server);
    assert.equal(after.strongerHints.status, "ready");
    assert.match(
      after.strongerHints.entries[0],
      /Your current lead (?:mentions|points toward) Watch Loft/,
    );
    assert.deepEqual(after.scene, before.scene);
    assert.deepEqual(after.history, before.history);
    assert.equal(after.revision, before.revision);
    const saved = JSON.parse(await readFile(savePath, "utf8"));
    delete saved.browserStrongerHints;
    assert.deepEqual(saved, original); // Includes time, state, RNG, ownership and transitions.
    await server.close();
    server = await startBrowserServer(options);
    assert.deepEqual((await state(server)).strongerHints, after.strongerHints);
    const restored = await page(server);
    assert.equal(restored.nodes.get("information").hidden, true);
    for (let i = 0; i < 3; i++) {
      restored.click("open-hints");
      assert.match(
        restored.nodes.get("stronger-hint-result").textContent,
        /Your current lead/,
      );
      restored.click("close-information");
    }
    assert.match(
      BROWSER_HTML,
      /id="stronger-hint-result" role="status" aria-live="polite" aria-atomic="true"/,
    );
    assert.match(
      BROWSER_HTML,
      /<button id="request-stronger-hint" type="button"/,
    );
    assert.equal(calls, 1);
    assert.equal(
      (
        await post(server, "/api/hints/stronger", {
          revision: after.hints.revision,
        })
      ).status,
      200,
    );
    assert.equal(calls, 1);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("stale, out-of-order, failed and fabricated guidance never attaches to a new scene", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-103-stale-"));
  const savePath = join(directory, "slot.json");
  const jobs = [];
  const options = {
    savePath,
    seed: 0,
    apiKey: "offline",
    strongerHintPreparer: (candidates) =>
      new Promise((resolve, reject) => {
        jobs.push({ candidates, resolve, reject });
      }),
    dmModel: {
      async respond(request) {
        return request.toolResults.length
          ? { text: "Travel saved." }
          : {
              toolCalls: [
                {
                  id: "move",
                  name: "move",
                  argumentsJson: JSON.stringify({
                    destinationId: request.playerInput.includes("Yard")
                      ? "watch-yard"
                      : "watch-loft",
                  }),
                },
              ],
            };
      },
    },
  };
  let server = await startBrowserServer(options);
  try {
    await post(server, "/api/start", {});
    const yard = await state(server);
    await post(server, "/api/hints/stronger", {
      revision: yard.hints.revision,
    });
    await post(server, "/api/turn", {
      revision: yard.revision,
      message: "Go to Watch Loft",
    });
    const loft = await state(server);
    assert.equal(loft.strongerHints, undefined);
    const bytes = await readFile(savePath, "utf8");
    assert.equal(
      (
        await post(server, "/api/hints/stronger", {
          revision: yard.hints.revision,
        })
      ).status,
      409,
    );
    assert.equal(await readFile(savePath, "utf8"), bytes);
    await post(server, "/api/hints/stronger", {
      revision: loft.hints.revision,
    });
    assert.match(jobs[1].candidates[0], /Pell alongside Signal Records Room/);
    assert.doesNotMatch(
      jobs[1].candidates[0],
      /Ask Pell|last signal shift|Try this next|Travel to/,
    );
    jobs[1].resolve(jobs[1].candidates);
    const ready = await settled(server);
    jobs[0].resolve(jobs[0].candidates);
    assert.deepEqual(
      (await settled(server)).strongerHints,
      ready.strongerHints,
    );
    await postAfterHintWrite(server, "/api/turn", {
      revision: loft.revision,
      message: "Go to Watch Yard",
    });
    const back = await state(server);
    await postAfterHintWrite(server, "/api/hints/stronger", {
      revision: back.hints.revision,
    });
    const before = (await SaveSession.load(savePath)).progress;
    jobs[2].reject(new Error("secret provider failure"));
    const failed = await settled(server);
    assert.equal(failed.strongerHints.status, "unavailable");
    assert.deepEqual(failed.strongerHints.entries, []);
    assert.deepEqual((await SaveSession.load(savePath)).progress, before);
    await server.close();
    server = await startBrowserServer(options);
    assert.deepEqual((await state(server)).strongerHints, failed.strongerHints);
    assert.equal(jobs.length, 3);
    await server.close();
    const bad = JSON.parse(await readFile(savePath, "utf8"));
    bad.browserStrongerHints = {
      ...failed.strongerHints,
      status: "ready",
      entries: ["The undiscovered solution is…"],
    };
    await writeFile(savePath, JSON.stringify(bad));
    server = await startBrowserServer(options);
    assert.equal((await state(server)).strongerHints, undefined);
    assert.equal(jobs.length, 3); // Invalid optional caches do not auto-escalate.
    await post(server, "/api/hints/stronger", {
      revision: failed.hints.revision,
    });
    jobs[3].resolve(["Invented solution"]);
    assert.equal((await settled(server)).strongerHints.status, "unavailable");
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("guidance explains when no justified next action exists without revealing a solution", async () => {
  const session = {
    generation: "test",
    progress: {},
    state: {},
    runtime: {
      projectDmScene: () => ({
        outcome: "victory",
        objective: "Finished",
        room: {
          description: "",
          exits: [],
          features: [],
          items: [],
          opponents: [],
        },
      }),
      getGameToolDefinitions: () => [],
    },
  };
  assert.match(
    strongerHintCandidates(session)[0],
    /No stronger next step is justified/,
  );
});
