import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
const adventure = resolve("adventures/hollow-beacon-refugees.json");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
function cli(input, args, script) {
  const r = spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 15000,
    windowsHide: true,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ...(script ? { DUNGEON_ONE_TEST_DM_SCRIPT: script } : {}),
    },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
const watch =
  "move watch-loft\nmove signal-records\nsearch setting-plate\nmove watch-loft\nmove watch-yard\n";
const refugees =
  "move refugee-camp\nsearch camp-survey\nmove refugee-overlook\nsearch sighting-frame\nmove refugee-camp\nmove watch-yard\n";
test("refugee physical evidence works independently; opposite clue orders survive process restart and trace replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-85-cli-"));
  try {
    const loaded = loadAdventure(readFileSync(adventure));
    assert.equal(loaded.ok, true);
    assert.equal(loaded.adventure.snapshot.contentVersion, "5");
    const checkpoints = [];
    for (const [name, prefix, suffix] of [
      ["refugee-first", refugees, watch],
      ["watch-first", watch, refugees],
    ]) {
      const save = join(dir, name + ".json"),
        first = join(dir, name + "-first.json"),
        second = join(dir, name + "-second.json");
      const out = cli(prefix, [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        first,
      ]);
      if (name === "refugee-first") {
        assert.match(out, /trusting it without verification may be dangerous/i);
        assert.ok(
          !read(save).checkpoint.state.discoveries.includes("altered-setting"),
        );
      }
      cli(suffix, [
        "--resume",
        save,
        "--trace",
        second,
        "--previous-trace",
        first,
      ]);
      assert.match(
        cli("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
      const cp = read(save).checkpoint;
      assert.equal(cp.state.status, "playing");
      assert.equal(cp.state.clocks["caravan-deadline"], 0);
      checkpoints.push(cp);
    }
    assert.deepEqual(
      [...checkpoints[0].state.discoveries].sort(),
      [...checkpoints[1].state.discoveries].sort(),
    );
    assert.deepEqual(checkpoints[0].randomState, checkpoints[1].randomState);
    const script = join(dir, "script.json");
    const actions = [
      ["move", { destinationId: "refugee-camp" }],
      ["search", { target: "camp-survey" }],
      ["move", { destinationId: "refugee-overlook" }],
      ["search", { target: "sighting-frame" }],
    ];
    writeFileSync(
      script,
      JSON.stringify(
        actions.flatMap(([name, args], i) => [
          {
            toolCalls: [
              { id: String(i), name, argumentsJson: JSON.stringify(args) },
            ],
          },
          { text: "The engine records the evidence." },
        ]),
      ),
    );
    const aiSave = join(dir, "ai.json"),
      commandSave = join(dir, "command.json"),
      trace = join(dir, "ai-trace.json");
    cli(
      "Visit camp\nCompare survey\nGo to overlook\nCompare frame\n",
      [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--ai",
        "--save",
        aiSave,
        "--trace",
        trace,
      ],
      script,
    );
    cli(
      "move refugee-camp\nsearch camp-survey\nmove refugee-overlook\nsearch sighting-frame\n",
      ["--adventure-file", adventure, "--seed", "0", "--save", commandSave],
    );
    assert.deepEqual(read(aiSave).checkpoint, read(commandSave).checkpoint);
    cli(
      "Visit camp\nCompare survey\nGo to overlook\nCompare frame\n",
      ["--adventure-file", adventure, "--seed", "0", "--ai", "--trace", trace],
      script,
    );
    assert.match(cli("", ["--replay", trace]), /Trace verified successfully/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("failed interaction and dead contact leave public physical leads; journal keeps testimony and contested claims separate", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-85-fallback-"));
  try {
    const save = join(dir, "failed.json");
    const out = cli(
      "move refugee-camp\ntalk sera account persuade\nsearch camp-survey\nmove refugee-overlook\nsearch sighting-frame\njournal\n",
      ["--adventure-file", adventure, "--seed", "0", "--save", save],
    );
    assert.match(out, /I will not give that account/);
    assert.equal(
      read(save).checkpoint.state.socialChallenges["sera-account"].result,
      "failure",
    );
    assert.ok(
      read(save).checkpoint.state.discoveries.includes("refugee-alignment"),
    );
    const dead = cli(
      "move refugee-camp\nattack sera\nattack sera\nlook\nsearch camp-survey\nmove refugee-overlook\nsearch sighting-frame\n",
      ["--adventure-file", adventure, "--seed", "0"],
    );
    assert.match(dead, /Sera dies/);
    assert.match(dead, /fixed camp signal survey/);
    assert.match(dead, /trusting it without verification may be dangerous/i);
    const journal = cli(
      "move refugee-camp\ntalk sera keeper-warning ask\nsearch camp-survey\nmove refugee-overlook\nsearch sighting-frame\njournal\n",
      ["--adventure-file", adventure, "--seed", "0"],
    );
    assert.match(journal, /Keeper's warning \[testimony; Sera/);
    assert.match(journal, /Contested pursuer claim \[belief; Sera/);
    assert.match(
      journal,
      /Refugee signal alignment \[observation; sighting frame/,
    );
    const loaded = loadAdventure(readFileSync(adventure));
    const game = createDataRuntime(loaded.adventure);
    let state = game.createSession();
    for (const command of [
      "move refugee-camp",
      "talk sera help ask",
      "talk sera keeper-warning ask",
    ]) {
      state = game.handleAction(state, game.parseCommand(command), {
        roll: () => 20,
      }).state;
    }
    assert.ok(state.milestones.includes("camp-helped"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const view = async (server) => (await fetch(server.url + "/api/state")).json();
const idle = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById("conversation").getAttribute("aria-busy") ===
      "false",
  );
function modelFor(expected) {
  return {
    async respond(request) {
      if ("reply" in request) {
        return {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            closing: "none",
            factIds: request.reply.approvedFacts.map((x) => x.id),
          }),
        };
      }
      if (request.toolResults.length) {
        return { text: "Read the saved authoritative result below." };
      }
      assert.equal(request.playerInput, expected.message);
      return { toolCalls: [{ ...expected.call, id: "intent" }] };
    },
  };
}
async function act(page, server, expected, name, args, click) {
  const v = await view(server);
  const action =
    name === "wait"
      ? {
          message: "Wait 3 days",
          call: { name: "wait", argumentsJson: JSON.stringify(args) },
        }
      : v.actions.find(
          (x) =>
            x.call.name === name &&
            JSON.stringify(JSON.parse(x.call.argumentsJson)) ===
              JSON.stringify(args),
        );
  assert.ok(action, JSON.stringify({ name, args, actions: v.actions }));
  Object.assign(expected, { message: action.message, call: action.call });
  click = click && name !== "wait";
  if (click && name !== "move") {
    const target = action.contextId.startsWith("npc:")
      ? v.scene.room.npcs.find((x) => "npc:" + x.id === action.contextId)
      : v.scene.room.features.find(
          (x) => "target:" + x.id === action.contextId,
        );
    await page.getByRole("button", { name: target.name, exact: true }).click();
  }
  const pending = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  if (click) {
    const container = page.locator(
      name === "move" ? "#exits" : "#context-actions",
    );
    const label =
      name === "move"
        ? v.scene.room.exits.find((x) => x.destinationId === args.destinationId)
            .name
        : action.label;
    await container.getByRole("button", { name: label, exact: true }).click();
  } else {
    await page.locator("#message").fill(action.message);
    await page.locator("#message").press("Enter");
  }
  const result = await (await pending).json();
  assert.equal(result.committed, name !== "inspect", result.error);
  await idle(page);
  return view(server);
}
async function start(page, server) {
  await page.goto(server.url);
  await idle(page);
  if (await page.locator("#start").isVisible()) {
    await page.locator("#start").click();
    await idle(page);
  }
}
test(
  "real browser both clue orders, refusal, threshold, hints and launcher restart preserve the v5 investigation",
  { timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-85-browser-"));
    const browser = await chromium.launch(
      process.platform === "win32" ? { channel: "msedge" } : {},
    );
    let server;
    const setServer = (started) => {
      server = started;
    };
    const errors = [];
    try {
      const final = [];
      for (const order of ["refugee-first", "watch-first"]) {
        const expected = {};
        const savePath = join(dir, order + ".json");
        const options = {
          contentVersion: "5",
          seed: 0,
          apiKey: "offline",
          savePath,
          dmModel: modelFor(expected),
        };
        // This test owns the server and serializes all requests and restarts.

        setServer(await startBrowserServer(options));
        const page = await browser.newPage();
        page.on("pageerror", (e) => errors.push(e.message));
        await start(page, server);
        let click = order === "refugee-first";
        const doAction = (name, args) =>
          act(page, server, expected, name, args, click);
        const route = async (which) => {
          if (which === "watch") {
            for (const [name, args] of [
              ["move", { destinationId: "watch-loft" }],
              ["move", { destinationId: "signal-records" }],
              ["search", { target: "setting-plate" }],
              ["move", { destinationId: "watch-loft" }],
              ["move", { destinationId: "watch-yard" }],
            ]) {
              await doAction(name, args);
            }
          } else {
            await doAction("move", { destinationId: "refugee-camp" });
            await doAction("talk", {
              speakerId: "sera",
              topicId: "keeper-warning",
              approach: "ask",
            });
            await doAction("talk", {
              speakerId: "sera",
              topicId: "refuse",
              approach: "ask",
            });
            await doAction("search", { target: "camp-survey" });
            await doAction("move", { destinationId: "refugee-overlook" });
            await doAction("search", { target: "sighting-frame" });
            await doAction("move", { destinationId: "refugee-camp" });
            await doAction("move", { destinationId: "watch-yard" });
          }
        };
        await route(order === "refugee-first" ? "refugee" : "watch");
        const before = await view(server);
        {
          const closingServer = server;
          server = undefined;
          await closingServer.close();
        }
        // This test owns the server and serializes all requests and restarts.
        setServer(await startBrowserServer(options));
        await start(page, server);
        const resumed = await view(server);
        assert.deepEqual(resumed.scene, before.scene);
        assert.deepEqual(resumed.history, before.history);
        await route(order === "refugee-first" ? "watch" : "refugee");
        await doAction("move", { destinationId: "refugee-camp" });
        const atCamp = await view(server);
        assert.ok(atCamp.actions.some((x) => x.message.includes("Sera")));
        await doAction("wait", { amount: "3" });
        const late = await view(server);
        assert.ok(!late.scene.room.npcs.some((x) => x.id === "sera"));
        assert.match(late.scene.room.description, /survey remain/);
        const publicHints = late.hints.entries.join("\n");
        assert.doesNotMatch(publicHints, /keeper is safe|caravan is safe/i);
        await page.locator("#open-journal").click();
        assert.match(
          await page.locator("#information-body").textContent(),
          /Refugee signal alignment/,
        );
        assert.match(
          await page.locator("#information-body").textContent(),
          /Keeper's warning/,
        );
        assert.match(
          await page.locator("#information-body").textContent(),
          /Contested pursuer claim/,
        );
        await page.keyboard.press("Escape");
        await page.locator("#open-journal").click();
        await page.locator("#open-leads").click();
        assert.match(
          await page.locator("#information-body").textContent(),
          /Observed evidence leads.*Testimony leads.*Contested claim leads/s,
        );
        assert.match(
          await page.locator("#information-body").textContent(),
          /survey|frame|plate/i,
        );
        await page.keyboard.press("Escape");
        await page.locator("#open-hints").click();
        const hintCheckpoint = read(savePath).checkpoint;
        await page.locator("#request-stronger-hint").click();
        await page.waitForFunction(() =>
          document
            .getElementById("stronger-hint-result")
            .textContent.includes("current"),
        );
        assert.deepEqual(read(savePath).checkpoint, hintCheckpoint);
        assert.doesNotMatch(
          await page.locator("#stronger-hint-result").textContent(),
          /keeper is safe|caravan is safe/i,
        );
        await page.keyboard.press("Escape");
        await doAction("inspect", { target: "camp-survey" });
        await doAction("move", { destinationId: "valley-road" });
        await doAction("move", { destinationId: "beacon-tower" });
        for (const topicId of [
          "hold-beacon",
          "light-beacon",
          "refuse-watch",
          "walk-away",
        ]) {
          const continuing = await doAction("talk", {
            speakerId: "tower-runner",
            topicId,
            approach: "ask",
          });
          assert.equal(continuing.scene.outcome, "playing");
          assert.ok(continuing.actions.some((x) => x.call.name === "move"));
        }
        final.push(read(savePath).checkpoint);
        {
          const closingServer = server;
          server = undefined;
          await closingServer.close();
        }
        await page.close();
      }
      assert.deepEqual(
        [...final[0].state.discoveries].sort(),
        [...final[1].state.discoveries].sort(),
      );
      assert.deepEqual(final[0].randomState, final[1].randomState);
      assert.equal(final[0].state.clocks["caravan-deadline"], 7);
      assert.deepEqual(errors, []);
    } finally {
      if (server) {
        {
          const closingServer = server;
          server = undefined;
          await closingServer.close();
        }
      }
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "a fresh launcher process resumes v5 and retains completed v4 Review without rewriting either tuple",
  { timeout: 30000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-85-launcher-"));
    const browser = await chromium.launch(
      process.platform === "win32" ? { channel: "msedge" } : {},
    );
    let child;
    try {
      for (const version of ["4", "5"]) {
        const save = join(dir, version + ".json");
        const input =
          version === "4"
            ? watch +
              "move ridge-trail\nmove beacon-tower\nresolve hold-beacon\n"
            : refugees + "move refugee-camp\nwait days 3\n";
        cli(input, [
          "--adventure-file",
          version === "4"
            ? resolve("adventures/hollow-beacon-watch.json")
            : adventure,
          "--seed",
          "0",
          "--save",
          save,
        ]);
        const original = read(save);
        child = spawn(
          process.execPath,
          ["tests/fixtures/issue-85-server.mjs", save],
          { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
        );
        const url = await new Promise((resolveUrl, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Launcher timed out")),
            10000,
          );
          child.once("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
          child.stdout.once("data", (data) => {
            clearTimeout(timer);
            resolveUrl(data.toString().trim());
          });
        });
        const page = await browser.newPage();
        await page.goto(url);
        await idle(page);
        assert.equal(
          (await (await fetch(url + "/api/state")).json()).scene.outcome,
          version === "4" ? "victory" : "playing",
        );
        assert.equal(read(save).content.digest, original.content.digest);
        assert.deepEqual(read(save).checkpoint, original.checkpoint);
        if (version === "4") {
          assert.match(
            await page.locator("#session").textContent(),
            /Review mode/,
          );
          assert.equal(await page.locator("#message").isDisabled(), true);
          assert.equal(read(save).checkpoint.state.ending.id, "hold-beacon");
        } else {
          assert.match(
            await page.locator("#description").textContent(),
            /Day 3|survey/,
          );
        }
        await page.close();
        const exited = new Promise((r) => {
          child.once("exit", r);
        });
        child.kill();
        child = undefined;
        await exited;
      }
    } finally {
      if (child) {
        child.kill();
      }
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "browser failed interaction, refusal and unavailable contact expose fresh physical evidence on return",
  { timeout: 45000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-85-unavailable-"));
    const browser = await chromium.launch(
      process.platform === "win32" ? { channel: "msedge" } : {},
    );
    let server;
    const setServer = (started) => {
      server = started;
    };
    try {
      const expected = {};
      const options = {
        contentVersion: "5",
        seed: 0,
        apiKey: "offline",
        savePath: join(dir, "slot.json"),
        dmModel: modelFor(expected),
      };
      // This test owns the server and serializes all requests and restarts.

      setServer(await startBrowserServer(options));
      const page = await browser.newPage();
      await start(page, server);
      const action = (name, args, click = true) =>
        act(page, server, expected, name, args, click);
      await action("move", { destinationId: "refugee-camp" });
      const failed = await action("talk", {
        speakerId: "sera",
        topicId: "account",
        approach: "persuade",
      });
      assert.match(failed.history.at(-1).reply, /will not give that account/);
      await action("talk", {
        speakerId: "sera",
        topicId: "refuse",
        approach: "ask",
      });
      await action("move", { destinationId: "watch-yard" });
      const returned = await action("move", { destinationId: "refugee-camp" });
      assert.match(returned.scene.room.description, /refused help/);
      const refused = await action("talk", {
        speakerId: "sera",
        topicId: "keeper-warning",
        approach: "ask",
      });
      assert.match(refused.history.at(-1).reply, /refused our request/);
      await action("wait", { amount: "3" }, false);
      await action("move", { destinationId: "watch-yard" });
      const late = await action("move", { destinationId: "refugee-camp" });
      assert.ok(!late.scene.room.npcs.some((x) => x.id === "sera"));
      assert.match(late.scene.room.description, /Sera has gone/);
      assert.ok(
        late.actions.some(
          (x) =>
            x.call.name === "search" &&
            JSON.parse(x.call.argumentsJson).target === "camp-survey",
        ),
      );
      await action("search", { target: "camp-survey" }, false);
      await action("move", { destinationId: "refugee-overlook" });
      {
        const closingServer = server;
        server = undefined;
        await closingServer.close();
      }
      // This test owns the server and serializes all requests and restarts.
      setServer(await startBrowserServer(options));
      await start(page, server);
      const evidence = await action("search", { target: "sighting-frame" });
      assert.match(
        evidence.history
          .at(-1)
          .cards.map((x) => x.text)
          .join("\n"),
        /trusting it without verification may be dangerous/i,
      );
      assert.equal(evidence.scene.outcome, "playing");
      assert.equal(
        read(options.savePath).checkpoint.state.socialChallenges["sera-account"]
          .result,
        "failure",
      );
      assert.notEqual(evidence.hints.revision, late.hints.revision);
    } finally {
      if (server) {
        {
          const closingServer = server;
          server = undefined;
          await closingServer.close();
        }
      }
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
