import assert from "node:assert/strict";
import { fork, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";
import { loadAdventure } from "../dist/adventure-loader.js";
import { loadAdventureFile } from "../dist/adventure-file.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { startBrowserServer } from "../dist/browser-server.js";
import {
  BROWSER_RELEASES,
  BROWSER_START_VERSION,
} from "../dist/browser-releases.js";
import { SaveSession } from "../dist/save.js";

const adventure = (name) =>
  fileURLToPath(new URL(`../adventures/${name}`, import.meta.url));

async function runtimeFor(name, edit) {
  if (edit === undefined) {
    const loaded = await loadAdventureFile(adventure(name));
    assert.equal(loaded.ok, true);
    return createDataRuntime(loaded.adventure);
  }
  const loaded = loadAdventure(
    JSON.stringify(edit(JSON.parse(await readFile(adventure(name), "utf8")))),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

async function withDirectory(body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-93-"));
  try {
    await body(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const post = async (server, path, body) => {
  const response = await fetch(server.url + path, {
    method: "POST",
    headers: { Origin: server.url, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};
// Startup must refuse the slot; a server that starts anyway is closed so a
// failure cannot leave the test process waiting on a listening socket.
async function rejectsStart(options, pattern, label) {
  let server;
  await assert.rejects(
    (async () => {
      server = await startBrowserServer(options);
    })(),
    pattern,
    label,
  );
  await server?.close();
}
const canon = async (path) => {
  const { checkpoint, transitions, content } = JSON.parse(
    await readFile(path, "utf8"),
  );
  return { checkpoint, transitions, content };
};
const state = async (server) => (await fetch(`${server.url}/api/state`)).json();

// Scripted provider: each offered option is sent as its own message, and the
// model requests exactly that option's tool call. Calls are counted.
function optionModel() {
  const intents = new Map();
  const model = {
    calls: 0,
    intents,
    async respond(request) {
      model.calls++;
      if (request.toolResults.length) {
        return { text: "The engine result stands." };
      }
      const call = intents.get(request.playerInput);
      return call
        ? { toolCalls: [{ id: "intent", ...call }] }
        : { text: "Which visible action do you mean?" };
    },
  };
  return model;
}

async function choose(server, model, name, argument) {
  const view = await state(server);
  const offer = view.actions.find(
    (option) =>
      option.call.name === name &&
      Object.values(JSON.parse(option.call.argumentsJson)).includes(argument),
  );
  assert.ok(offer, `${name} ${argument}`);
  model.intents.set(offer.message, offer.call);
  const result = await post(server, "/api/turn", {
    revision: view.revision,
    optionId: offer.id,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.committed, true, `${name} ${argument}`);
  return { before: view, offer, result: result.body };
}

test("the supported-release policy names each bundled release tuple and starts the newest", async () => {
  const versions = BROWSER_RELEASES.map(({ version }) => version);
  assert.deepEqual(versions, ["4", "5", "6", "7", "8", "9", "10", "11"]);
  assert.equal(BROWSER_START_VERSION, "11");
  assert.equal(versions.at(-1), BROWSER_START_VERSION);
  const digests = new Set();
  for (const release of BROWSER_RELEASES) {
    const loaded = await loadAdventureFile(adventure(release.file));
    assert.equal(loaded.ok, true, release.file);
    const { snapshot, digest } = loaded.adventure;
    assert.equal(snapshot.id, "hollow-beacon");
    assert.equal(snapshot.contentVersion, release.version);
    assert.equal(snapshot.rulesVersion, release.rulesVersion);
    assert.equal(snapshot.schemaVersion, release.schemaVersion);
    digests.add(digest);
  }
  assert.equal(digests.size, BROWSER_RELEASES.length);
});

test("the shipped launcher starts the expanded release, then the same command continues the saved seed and state", async () =>
  withDirectory(async (directory) => {
    const savePath = join(directory, "increment-8-continuity", "slot.json");
    const launch = async (seed) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("./fixtures/issue-93-launcher.mjs", import.meta.url),
          ),
          "--legacy",
          "--seed",
          seed,
          "--save",
          savePath,
        ],
        {
          env: { ...process.env, OPENAI_API_KEY: "test-credential" },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      let output = "";
      const url = await new Promise((resolve, reject) => {
        child.stdout.on("data", (chunk) => {
          output += chunk;
          const match = /Hollow Beacon: (http:\/\/127\.0\.0\.1:\d+)\n/.exec(
            output,
          );
          if (match) {
            resolve(match[1]);
          }
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        child.once("exit", () => reject(new Error(output)));
      });
      assert.match(output, /Press Ctrl\+C to stop; your save slot remains/);
      return {
        url,
        async stop() {
          const exited = new Promise((resolve) => {
            child.once("exit", resolve);
          });
          child.kill("SIGINT");
          await exited;
        },
      };
    };
    let launcher = await launch("0");
    try {
      assert.equal((await state(launcher)).slot, "empty");
      const started = await post(launcher, "/api/start");
      assert.equal(started.status, 200);
      const view = started.body;
      assert.equal(view.title, "Hollow Beacon: Final Warning");
      assert.equal(view.seed, 0);
      assert.equal(view.scene.outcome, "playing");
      const saved = await SaveSession.load(savePath);
      assert.equal(saved.runtime.version, BROWSER_START_VERSION);
      const bytes = await readFile(savePath, "utf8");
      await launcher.stop();

      launcher = await launch("0");
      assert.deepEqual(await state(launcher), view);
      await launcher.stop();
      assert.equal(await readFile(savePath, "utf8"), bytes);

      // A different requested seed only labels a future New game.
      launcher = await launch("7");
      assert.deepEqual(await state(launcher), { ...view, newGameSeed: 7 });
      assert.equal((await post(launcher, "/api/start")).body.seed, 0);
      assert.equal(await readFile(savePath, "utf8"), bytes);
    } finally {
      await launcher.stop();
    }
  }));

test("a v11 combat and clock checkpoint survives restart without repeating an action or RNG draw", async () =>
  withDirectory(async (directory) => {
    const savePath = join(directory, "slot.json");
    const options = (seed, model) => ({
      contentVersion: BROWSER_START_VERSION,
      seed,
      savePath,
      apiKey: "offline",
      dmModel: model,
    });
    let model = optionModel();
    let server = await startBrowserServer(options(0, model));
    try {
      await post(server, "/api/start");
      const travel = await choose(server, model, "move", "ridge-trail");
      assert.match(
        travel.result.cards[0].text,
        /Combat begins.*Day 0 → Day 2/s,
      );
      const attack = await choose(server, model, "attack", "ridge-raider");
      const view = await state(server);
      assert.equal(view.clocks[0].value, 2);
      assert.equal(view.history.length, 2);
      const bytes = await readFile(savePath, "utf8");
      await server.close();

      model = optionModel();
      server = await startBrowserServer(options(5, model));
      assert.deepEqual(await state(server), { ...view, newGameSeed: 5 });

      // A lost reply retried from the old tab cannot repeat the attack.
      model.intents.set(attack.offer.message, attack.offer.call);
      const retry = await post(server, "/api/turn", {
        revision: attack.before.revision,
        optionId: attack.offer.id,
      });
      assert.equal(retry.status, 409);
      assert.equal(model.calls, 0);
      assert.equal(await readFile(savePath, "utf8"), bytes);

      await choose(server, model, "attack", "ridge-raider");
      const runtime = await runtimeFor("hollow-beacon-finale.json");
      const reference = await SaveSession.start(
        join(directory, "reference.json"),
        runtime,
        0,
      );
      for (const command of [
        "move ridge-trail",
        "attack raider",
        "attack raider",
      ]) {
        await reference.commit(command, runtime.parseCommand(command));
      }
      const continued = JSON.parse(await readFile(savePath, "utf8"));
      assert.deepEqual(continued.checkpoint.state, reference.state);
      assert.equal(
        continued.checkpoint.randomPosition,
        reference.randomPosition,
      );
      assert.equal((await state(server)).history.length, 3);
    } finally {
      await server.close();
    }
  }));

test("released v4 active and completed slots continue under the v11 launcher until confirmed replacement", async () =>
  withDirectory(async (directory) => {
    const watch = await runtimeFor("hollow-beacon-watch.json");
    for (const completed of [false, true]) {
      const savePath = join(directory, `v4-${completed}.json`);
      const slot = await SaveSession.start(savePath, watch, 3);
      const commands = completed
        ? [
            "move watch-loft",
            "move signal-records",
            "search setting-plate",
            "move watch-loft",
            "move watch-yard",
            "move ridge-trail",
            "move beacon-tower",
            "resolve hold-beacon",
          ]
        : ["move watch-loft"];
      for (const command of commands) {
        await slot.commit(command, watch.parseCommand(command));
      }
      const saved = await canon(savePath);
      const model = optionModel();
      const server = await startBrowserServer({
        contentVersion: BROWSER_START_VERSION,
        seed: 9,
        savePath,
        apiKey: "offline",
        dmModel: model,
      });
      try {
        const view = await state(server);
        assert.equal(view.title, "The Hollow Beacon: Watch Route");
        assert.equal(view.seed, 3);
        assert.equal(view.newGameSeed, 9);
        assert.equal(view.scene.outcome, completed ? "victory" : "playing");
        if (completed) {
          // Review: no options, hints or provider interaction.
          assert.deepEqual(view.actions, []);
          assert.equal(view.hints.status, "unavailable");
          const turn = await post(server, "/api/turn", {
            revision: view.revision,
            message: "Light the beacon anyway",
          });
          assert.notEqual(turn.status, 200);
          assert.equal(model.calls, 0);
        } else {
          assert.equal(view.scene.room.name, "Watch Loft");
        }
        // Startup may add the derived hint cache, never game progress.
        assert.deepEqual(await canon(savePath), saved);
        const bytes = await readFile(savePath, "utf8");

        // An unconfirmed or stale replacement leaves the historical slot.
        for (const body of [
          { confirmed: false, seed: 9, revision: view.revision },
          { confirmed: true, seed: 3, revision: view.revision },
          { confirmed: true, seed: 9, revision: "0".repeat(64) },
        ]) {
          assert.notEqual(
            (await post(server, "/api/new-game", body)).status,
            200,
          );
        }
        assert.equal(await readFile(savePath, "utf8"), bytes);

        const replaced = await post(server, "/api/new-game", {
          confirmed: true,
          seed: 9,
          revision: view.revision,
        });
        assert.equal(replaced.status, 200);
        assert.equal(replaced.body.view.title, "Hollow Beacon: Final Warning");
        assert.equal(replaced.body.view.seed, 9);
        assert.deepEqual(replaced.body.view.history, []);
        assert.notEqual(replaced.body.view.generation, view.generation);
        assert.equal(
          (await SaveSession.load(savePath)).runtime.version,
          BROWSER_START_VERSION,
        );
        const fresh = await readFile(savePath, "utf8");
        // The old tab's revision cannot act in the replacement game.
        const stale = await post(server, "/api/turn", {
          revision: view.revision,
          message: "Travel to Watch Yard",
        });
        assert.equal(stale.status, 409);
        assert.equal(model.calls, 0);
        assert.equal(await readFile(savePath, "utf8"), fresh);
      } finally {
        await server.close();
      }
    }
  }));

test("unsupported, tampered, closed and corrupt slots fail clearly before serving and stay unchanged", async () =>
  withDirectory(async (directory) => {
    const finale = await runtimeFor("hollow-beacon-finale.json");
    const cases = [
      // A released CLI version the browser never supported.
      ["v3", await runtimeFor("hollow-beacon-conversations.json")],
      // A representative future content release absent from the policy.
      [
        "v99",
        await runtimeFor("hollow-beacon-finale.json", (data) => ({
          ...data,
          contentVersion: "99",
        })),
      ],
    ];
    for (const [name, runtime] of cases) {
      const savePath = join(directory, `${name}.json`);
      await SaveSession.start(savePath, runtime, 0);
      const bytes = await readFile(savePath, "utf8");
      await rejectsStart(
        {
          contentVersion: BROWSER_START_VERSION,
          seed: 0,
          savePath,
          apiKey: "offline",
        },
        /occupied slot was left unchanged/,
        name,
      );
      assert.equal(await readFile(savePath, "utf8"), bytes, name);
    }
    const closed = join(directory, "closed.json");
    const session = await SaveSession.start(closed, finale, 0);
    await session.commit("quit", finale.parseCommand("quit"));
    const corrupt = join(directory, "corrupt.json");
    await writeFile(corrupt, "{not a save");
    // Saved canon edited without its recorded digest.
    const tampered = join(directory, "tampered.json");
    await SaveSession.start(tampered, finale, 0);
    const envelope = JSON.parse(await readFile(tampered, "utf8"));
    envelope.content.snapshot.title = "Hollow Beacon: Edited Warning";
    await writeFile(tampered, JSON.stringify(envelope));
    for (const savePath of [closed, corrupt, tampered]) {
      const bytes = await readFile(savePath, "utf8");
      await rejectsStart({
        contentVersion: BROWSER_START_VERSION,
        seed: 0,
        savePath,
        apiKey: "offline",
      });
      assert.equal(await readFile(savePath, "utf8"), bytes);
    }
  }));

test(
  "a real browser starts v11, commits one typed action, and reads exact history after process restart",
  { timeout: 60000 },
  async () =>
    withDirectory(async (directory) => {
      const savePath = join(directory, "slot.json");
      const idle = (page) =>
        page.waitForFunction(
          () =>
            document
              .getElementById("conversation")
              .getAttribute("aria-busy") === "false",
        );
      // Each launch is a separate process; kill() ends it without cleanup.
      const launch = async () => {
        const child = fork(
          fileURLToPath(
            new URL("./fixtures/issue-93-server.mjs", import.meta.url),
          ),
          [savePath],
          { stdio: ["ignore", "ignore", "pipe", "ipc"] },
        );
        const url = await new Promise((resolve, reject) => {
          child.once("message", (message) => resolve(message.url));
          child.once("exit", () => reject(new Error("Server exited.")));
        });
        return {
          url,
          async kill() {
            const exited = new Promise((resolve) => {
              child.once("exit", resolve);
            });
            child.kill();
            await exited;
          },
        };
      };
      let server = await launch();
      const browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      try {
        const page = await browser.newPage();
        await page.goto(server.url);
        await idle(page);
        await page.locator("#start").click();
        await idle(page);
        assert.match(
          await page.locator("#adventure-title").textContent(),
          /Final Warning/,
        );
        await page.locator("#message").fill("Travel to Watch Loft");
        const reply = page.waitForResponse((r) =>
          r.url().endsWith("/api/turn"),
        );
        await page.locator("#message").press("Enter");
        assert.equal((await (await reply).json()).committed, true);
        await idle(page);
        assert.equal(await page.locator("#message").isDisabled(), false);
        const history = await page.locator("#conversation").innerText();
        assert.match(history, /Travel to Watch Loft/);
        const before = await state(server);
        assert.equal(before.scene.room.id, "watch-loft");
        const bytes = await readFile(savePath, "utf8");
        await server.kill();

        server = await launch();
        await page.goto(server.url);
        await idle(page);
        assert.equal(await page.locator("#conversation").innerText(), history);
        assert.match(
          await page.locator("#location").textContent(),
          /Watch Loft/,
        );
        assert.deepEqual(await state(server), before);
        assert.equal(await readFile(savePath, "utf8"), bytes);
      } finally {
        await browser.close();
        await server.kill();
      }
    }),
);
