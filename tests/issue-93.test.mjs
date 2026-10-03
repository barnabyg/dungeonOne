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
import { beaconPeaceful, commandCall } from "./fixtures/character-journeys.mjs";

const adventure = (name) =>
  fileURLToPath(new URL(`../adventures/${name}`, import.meta.url));
const fixture = (name) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

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
const state = async (server) => (await fetch(`${server.url}/api/state`)).json();
// Hint preparation finishes asynchronously after a start or turn.
async function settled(server) {
  for (const deadline = Date.now() + 3000; Date.now() < deadline;) {
    const view = await state(server);
    if (view.slot !== "occupied" || view.hints.status !== "preparing") {
      return view;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error("Hints stayed in preparation.");
}
const library = async (server) =>
  (await fetch(`${server.url}/api/characters`)).json();

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

// Scripted in-process provider for the --legacy compatibility checks.
function optionModel() {
  const model = {
    calls: 0,
    async respond(request) {
      model.calls++;
      return request.toolResults.length
        ? { text: "The engine result stands." }
        : { text: "Which visible action do you mean?" };
    },
  };
  return model;
}

/**
 * Starts the shipped server in its own process (see the fixture). kill() ends
 * the process without cleanup; calls() counts provider calls in this process.
 */
async function launchServer(savePath, seed, libraryPath) {
  const child = fork(
    fixture("issue-93-server.mjs"),
    [savePath, String(seed), ...(libraryPath ? [libraryPath] : [])],
    { stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const url = await new Promise((resolve, reject) => {
    child.once("message", (message) => resolve(message.url));
    child.once("exit", () => reject(new Error(output)));
  });
  return {
    url,
    calls: () => output.split("provider-call\n").length - 1,
    async kill() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = new Promise((resolve) => {
        child.once("exit", resolve);
      });
      child.kill();
      await exited;
    },
  };
}

/** Creates a Fighter and starts the named adventure for it. */
async function startCharacterAdventure(server, adventureId = "hollow-beacon") {
  let data = await library(server);
  const created = await post(server, "/api/characters/create", {
    name: "Ada",
    preset: "balanced",
    revision: data.revision,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  data = created.body.library;
  const played = await post(server, "/api/characters/play", {
    characterId: data.characters[0].sheet.id,
    adventureId,
    revision: data.revision,
    confirmed: true,
  });
  assert.equal(played.status, 200, JSON.stringify(played.body));
  return played.body.view;
}

/** Plays the offered option matching a journey command; asserts it commits. */
async function play(server, command) {
  const [verb, target] = command.split(" ");
  const expected =
    verb === "attack"
      ? { name: "attack", arguments: { opponent_id: target } }
      : commandCall(command);
  const before = await state(server);
  const offer = before.actions.find(
    ({ call }) =>
      call.name === expected.name &&
      Object.entries(expected.arguments).every(
        ([key, value]) => JSON.parse(call.argumentsJson)[key] === value,
      ),
  );
  assert.ok(offer, `${command} must be offered`);
  const result = await post(server, "/api/turn", {
    revision: before.revision,
    optionId: offer.id,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.committed, true, command);
  return { before, offer, result: result.body };
}

async function sessionFiles(directory) {
  const data = JSON.parse(
    await readFile(join(directory, "characters.json"), "utf8"),
  );
  return {
    data,
    path: (id) => join(directory, "character-adventures", `${id}.json`),
  };
}

test("the release policy lists each bundled tuple, its browser mode and what new adventures start", async () => {
  const tuples = new Set();
  for (const release of BROWSER_RELEASES) {
    const loaded = await loadAdventureFile(adventure(release.file));
    assert.equal(loaded.ok, true, release.file);
    const { snapshot } = loaded.adventure;
    assert.equal(snapshot.id, release.id);
    assert.equal(snapshot.contentVersion, release.version);
    assert.equal(snapshot.rulesVersion, release.rulesVersion);
    assert.equal(snapshot.schemaVersion, release.schemaVersion);
    assert.equal(
      release.mode === "character",
      snapshot.schemaVersion === 17,
      release.file,
    );
    tuples.add(`${release.id}@${release.version}`);
  }
  assert.equal(tuples.size, BROWSER_RELEASES.length);
  const starts = BROWSER_RELEASES.filter((release) => release.starts).map(
    ({ id, version, mode }) => `${mode}:${id}@${version}`,
  );
  assert.deepEqual(starts, [
    "character:hollow-beacon@12",
    "character:stonebridge@1",
    "single-slot:hollow-beacon@11",
  ]);
  assert.equal(BROWSER_START_VERSION, "11");
});

test("the default launcher continues a character adventure when the same command is rerun", async () =>
  withDirectory(async (directory) => {
    const careerDirectory = join(directory, "increment-8-continuity");
    const libraryPath = join(careerDirectory, "characters.json");
    const launch = async (seed) => {
      const child = spawn(
        process.execPath,
        [
          fixture("issue-93-launcher.mjs"),
          "--seed",
          seed,
          "--characters",
          libraryPath,
        ],
        {
          // The default --save path is relative; keep it inside the test.
          cwd: directory,
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
      const empty = await state(launcher);
      assert.equal(empty.slot, "empty");
      assert.equal(empty.careerMode, true);
      // Single-slot start and replacement belong to --legacy.
      assert.equal((await post(launcher, "/api/start")).status, 409);
      const view = await startCharacterAdventure(launcher);
      // Local baseline hints are ready as soon as the adventure starts.
      assert.equal(view.hints.status, "ready");
      assert.equal(view.title, "Hollow Beacon: A Fighter’s Warning");
      assert.equal(view.seed, 0);
      assert.match(view.characterLabel, /^Ada · Fighter level 1$/);
      const { data, path } = await sessionFiles(careerDirectory);
      const session = await SaveSession.load(path(data.selectedSessionId));
      assert.equal(session.runtime.version, "12");
      const bytes = [
        await readFile(libraryPath, "utf8"),
        await readFile(path(data.selectedSessionId), "utf8"),
      ];
      await launcher.stop();

      launcher = await launch("0");
      assert.deepEqual(await state(launcher), view);
      await launcher.stop();
      // A different requested seed only applies to a future adventure start.
      launcher = await launch("7");
      assert.deepEqual(await state(launcher), { ...view, newGameSeed: 7 });
      assert.deepEqual(
        [
          await readFile(libraryPath, "utf8"),
          await readFile(path(data.selectedSessionId), "utf8"),
        ],
        bytes,
      );
    } finally {
      await launcher.stop();
    }
  }));

test("a character combat and clock checkpoint survives a process kill without repeating an action or RNG draw", async () =>
  withDirectory(async (directory) => {
    const libraryPath = join(directory, "characters.json");
    const savePath = join(directory, "unused-slot.json");
    let server = await launchServer(savePath, 0, libraryPath);
    try {
      await startCharacterAdventure(server);
      const travel = await play(server, "move ridge-trail");
      assert.match(
        travel.result.cards[0].text,
        /Combat begins.*Day 0 → Day 2/s,
      );
      const attack = await play(server, "attack ridge-raider");
      const view = await settled(server);
      assert.equal(view.clocks[0].value, 2);
      assert.equal(view.history.length, 2);
      const { data, path } = await sessionFiles(directory);
      const sessionPath = path(data.selectedSessionId);
      const bytes = await readFile(sessionPath, "utf8");
      await server.kill();

      server = await launchServer(savePath, 5, libraryPath);
      assert.deepEqual(await state(server), { ...view, newGameSeed: 5 });
      // A lost reply retried from the old tab cannot repeat the attack.
      const retry = await post(server, "/api/turn", {
        revision: attack.before.revision,
        optionId: attack.offer.id,
      });
      assert.equal(retry.status, 409);
      assert.equal(server.calls(), 0);
      assert.equal(await readFile(sessionPath, "utf8"), bytes);

      await play(server, "attack ridge-raider");
      const entry = data.sessions[0];
      const loaded = loadAdventure(JSON.stringify(entry.content));
      const runtime = createDataRuntime(
        loaded.adventure,
        entry.startingCharacter,
      );
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
      const continued = JSON.parse(await readFile(sessionPath, "utf8"));
      assert.deepEqual(continued.checkpoint.state, reference.state);
      assert.equal(
        continued.checkpoint.randomPosition,
        reference.randomPosition,
      );
      assert.equal((await state(server)).history.length, 3);
    } finally {
      await server.kill();
    }
  }));

test("a completed character adventure restarts into Review without provider calls or a second XP award", async () =>
  withDirectory(async (directory) => {
    const libraryPath = join(directory, "characters.json");
    const savePath = join(directory, "unused-slot.json");
    let server = await launchServer(savePath, 0, libraryPath);
    try {
      await startCharacterAdventure(server);
      let completion;
      for (const command of beaconPeaceful) {
        completion = (await play(server, command)).result;
      }
      assert.match(
        completion.cards.map(({ text }) => text).join(" "),
        /Level 1 → 2/,
      );
      const view = await state(server);
      const { data, path } = await sessionFiles(directory);
      assert.equal(data.characters[0].sheet.xp, 1000);
      const bytes = [
        await readFile(libraryPath, "utf8"),
        await readFile(path(data.selectedSessionId), "utf8"),
      ];
      await server.kill();

      server = await launchServer(savePath, 0, libraryPath);
      const review = await state(server);
      assert.deepEqual(review, view);
      assert.equal(review.scene.outcome, "victory");
      assert.deepEqual(review.actions, []);
      assert.equal(review.hints.status, "unavailable");
      const turn = await post(server, "/api/turn", {
        revision: review.revision,
        message: "Light the beacon again",
      });
      assert.notEqual(turn.status, 200);
      assert.equal(server.calls(), 0);
      assert.equal((await library(server)).characters[0].sheet.xp, 1000);
      assert.deepEqual(
        [
          await readFile(libraryPath, "utf8"),
          await readFile(path(data.selectedSessionId), "utf8"),
        ],
        bytes,
      );
    } finally {
      await server.kill();
    }
  }));

test("replacing an active character adventure requires confirmed abandonment and keeps the old journey", async () =>
  withDirectory(async (directory) => {
    const libraryPath = join(directory, "characters.json");
    const savePath = join(directory, "unused-slot.json");
    let server = await launchServer(savePath, 0, libraryPath);
    try {
      await startCharacterAdventure(server);
      await play(server, "move watch-loft");
      const before = await state(server);
      const callsBefore = server.calls();
      // A pending turn blocks abandonment; the reply never arrives.
      const pending = fetch(`${server.url}/api/turn`, {
        method: "POST",
        headers: { Origin: server.url, "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: before.revision,
          message: "Hold this turn",
        }),
      }).catch(() => undefined);
      let data = await library(server);
      while (server.calls() <= callsBefore) {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      }
      const busy = await post(server, "/api/characters/abandon", {
        characterId: data.characters[0].sheet.id,
        revision: data.revision,
        confirmed: true,
      });
      assert.equal(busy.status, 409);
      assert.match(busy.body.error, /Wait for the pending adventure reply/);
      await server.kill();
      await pending;

      server = await launchServer(savePath, 3, libraryPath);
      const recovered = await state(server);
      assert.equal(recovered.scene.room.id, "watch-loft");
      assert.equal(recovered.history.at(-1).committed, false);
      assert.match(recovered.history.at(-1).notice, /No action was committed/);
      data = await library(server);
      const characterId = data.characters[0].sheet.id;
      const { path, data: stored } = await sessionFiles(directory);
      const firstSession = stored.selectedSessionId;
      const bytes = await readFile(path(firstSession), "utf8");
      for (const body of [
        { characterId, revision: data.revision, confirmed: false },
        { characterId, revision: "0".repeat(32), confirmed: true },
      ]) {
        assert.equal(
          (await post(server, "/api/characters/abandon", body)).status,
          409,
        );
      }
      assert.equal(
        (
          await post(server, "/api/new-game", {
            confirmed: true,
            seed: 3,
            revision: recovered.revision,
          })
        ).status,
        409,
      );
      assert.equal(await readFile(path(firstSession), "utf8"), bytes);

      const abandoned = await post(server, "/api/characters/abandon", {
        characterId,
        revision: data.revision,
        confirmed: true,
      });
      assert.equal(abandoned.status, 200, JSON.stringify(abandoned.body));
      data = abandoned.body.library;
      assert.equal(data.characters[0].availability, "rest-needed");
      assert.equal(data.sessions[0].status, "abandoned");
      // The old tab cannot act in the abandoned journey.
      const stale = await post(server, "/api/turn", {
        revision: recovered.revision,
        message: "Travel to Watch Yard",
      });
      assert.equal(stale.status, 409);
      const calls = server.calls();

      const rested = await post(server, "/api/characters/rest", {
        characterId,
        revision: data.revision,
      });
      assert.equal(rested.status, 200, JSON.stringify(rested.body));
      const replay = await post(server, "/api/characters/play", {
        characterId,
        adventureId: "hollow-beacon",
        revision: rested.body.library.revision,
        confirmed: true,
      });
      assert.equal(replay.status, 200, JSON.stringify(replay.body));
      const fresh = replay.body.view;
      assert.equal(fresh.seed, 3);
      assert.equal(fresh.position, 0);
      assert.deepEqual(fresh.history, []);
      assert.equal(fresh.scene.room.id, "watch-yard");
      assert.equal(server.calls(), calls);
      data = replay.body.library;
      assert.equal(data.sessions.length, 2);
      assert.notEqual(
        (await sessionFiles(directory)).data.selectedSessionId,
        firstSession,
      );
      // The abandoned journey stays retained for review.
      const old = await SaveSession.load(path(firstSession));
      assert.equal(old.state.status, "quit");
      assert.equal(old.browserHistory.turns.length, 2);
    } finally {
      await server.kill();
    }
  }));

test(
  "a real browser creates a character, plays a typed turn, and reads exact history after a process kill",
  { timeout: 60000 },
  async () =>
    withDirectory(async (directory) => {
      const libraryPath = join(directory, "characters.json");
      const savePath = join(directory, "unused-slot.json");
      const idle = (page) =>
        page.waitForFunction(
          () =>
            document
              .getElementById("conversation")
              .getAttribute("aria-busy") === "false",
        );
      let server = await launchServer(savePath, 0, libraryPath);
      const browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      try {
        const page = await browser.newPage();
        await page.goto(server.url);
        await page.locator("#open-characters").click();
        await page.locator("#show-create-character").click();
        await page.locator("#character-name").fill("Ada");
        await page.locator("#create-character button[type=submit]").click();
        await page
          .locator("#library-feedback")
          .filter({ hasText: "Character saved" })
          .waitFor();
        await page
          .locator("#library-adventures button")
          .filter({ hasText: "Start Hollow" })
          .click();
        await page.locator("#character-library").waitFor({ state: "hidden" });
        await idle(page);
        const message = (await state(server)).actions.find(
          ({ call }) =>
            call.name === "move" &&
            JSON.parse(call.argumentsJson).destinationId === "watch-loft",
        ).message;
        await page.locator("#message").fill(message);
        const reply = page.waitForResponse((r) =>
          r.url().endsWith("/api/turn"),
        );
        await page.locator("#message").press("Enter");
        assert.equal((await (await reply).json()).committed, true);
        await idle(page);
        assert.equal(await page.locator("#message").isDisabled(), false);
        const history = await page.locator("#conversation").innerText();
        assert.match(history, /Watch Loft/);
        const before = await settled(server);
        assert.equal(before.scene.room.id, "watch-loft");
        await server.kill();

        server = await launchServer(savePath, 0, libraryPath);
        await page.goto(server.url);
        await idle(page);
        assert.equal(await page.locator("#conversation").innerText(), history);
        assert.match(
          await page.locator("#location").textContent(),
          /Watch Loft/,
        );
        assert.match(
          await page.locator("#active-character-name").textContent(),
          /Ada/,
        );
        assert.deepEqual(await state(server), before);
        assert.equal(server.calls(), 0);
      } finally {
        await browser.close();
        await server.kill();
      }
    }),
);

// --legacy single-slot compatibility: released Hollow Beacon v4-v11 saves.

test("--legacy: released v4 active and completed slots continue until confirmed replacement with v11", async () =>
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

test("--legacy: unsupported, tampered, closed and corrupt slots fail clearly before serving and stay unchanged", async () =>
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
