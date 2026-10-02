import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fork, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import test from "node:test";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { QUEST_ITEM_SCHEMA } from "../dist/quest-item-schema.js";

const adventure = "adventures/hollow-beacon-component.json";
const noDice = {
  roll() {
    throw new Error("Component action rolled dice");
  },
};
const runtime = () => {
  const loaded = loadAdventure(readFileSync(adventure));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
};
const act = (game, state, command) =>
  game.handleAction(state, game.parseCommand(command), noDice);
function carry(game) {
  let state = game.createSession();
  for (const command of [
    "move watch-loft",
    "move signal-records",
    "take component",
    "move watch-loft",
    "move watch-yard",
    "move valley-road",
    "move ridge-shelter",
    "move drainage-walk",
    "move beacon-tower",
  ]) {
    const result = act(game, state, command);
    assert.ok(!result.rejection, command);
    state = result.state;
  }
  return state;
}

test("carry a signal component once, inspect ownership, and fit it only at the tower socket without healing", () => {
  const game = runtime();
  let state = game.createSession();
  for (const command of [
    "move watch-loft",
    "move signal-records",
    "take component",
  ]) {
    const result = act(game, state, command);
    assert.ok(!result.rejection, game.renderResult(result));
    state = result.state;
  }
  assert.ok(act(game, state, "take component").rejection);
  assert.match(
    game.renderResult(act(game, state, "inspect component")),
    /socket.*0 days.*no healing/s,
  );
  const rejected = act(game, state, "use component at socket");
  assert.ok(rejected.rejection);
  assert.deepEqual(rejected.state, state);
  for (const command of [
    "move watch-loft",
    "move watch-yard",
    "move valley-road",
    "move ridge-shelter",
    "move drainage-walk",
    "move beacon-tower",
  ]) {
    const result = act(game, state, command);
    assert.ok(!result.rejection, command + game.renderResult(result));
    state = result.state;
  }
  const result = act(game, state, "use component at socket");
  assert.ok(!result.rejection, game.renderResult(result));
  assert.equal(result.state.items["signal-component"], "consumed");
  assert.deepEqual(result.state.fighter, state.fighter);
  assert.deepEqual(result.state.clocks, state.clocks);
  assert.match(game.renderResult(result), /fitted.*socket.*0 days/s);
  assert.ok(result.state.milestones.includes("component-fitted"));
  assert.ok(act(game, result.state, "use component at socket").rejection);
});

test("command and bounded AI component use agree, reject invalid intents and refresh journal and light eligibility", () => {
  const game = runtime();
  const state = carry(game);
  const call = {
    name: "place_item",
    argumentsJson: '{"item_id":"signal-component","target":"beacon-socket"}',
  };
  const expected = act(game, state, "use component at socket");
  const light = (s) =>
    game
      .projectDmScene(s)
      .room.npcs.flatMap((n) => n.subjects)
      .some((t) => t.id === "light-beacon");
  assert.equal(light(state), false);
  assert.equal(light(expected.state), true);
  for (const input of [
    "Fit spare signal component in beacon socket",
    "Use component at socket",
    "Install signal component in beacon socket",
  ]) {
    const result = game.dispatchGameTool(state, call, noDice, input);
    assert.equal(result.modelOutput.ok, true, input);
    assert.deepEqual(result.state, expected.state);
  }
  for (const input of [
    undefined,
    "Maybe fit component in socket?",
    "Do not fit component in socket",
    "Fit component in socket and travel to camp",
    "Fit component in socket, fit component in socket",
    "Fit component in socket. Attack sentry",
    "Fit secret item in socket",
    "Use component at setting plate",
    "What happens if I fit component in socket?",
  ]) {
    const result = game.dispatchGameTool(state, call, noDice, input);
    assert.equal(result.modelOutput.ok, false, input);
    assert.deepEqual(result.state, state);
  }
  for (const unavailable of [
    { ...state, status: "victory" },
    { ...state, status: "defeat" },
    { ...state, status: "quit" },
    { ...state, items: { "signal-component": "room" } },
    expected.state,
    { ...state, locationId: "watch-yard" },
    {
      ...state,
      combat: { opponentId: "ridge-raider", currentTurn: "fighter" },
    },
  ]) {
    const result = act(game, unavailable, "use component at socket");
    assert.ok(result.rejection);
    assert.deepEqual(result.state, unavailable);
    assert.equal(
      game.dispatchGameTool(
        unavailable,
        call,
        noDice,
        "Use component at socket",
      ).modelOutput.ok,
      false,
    );
  }
  const plain = act(
    game,
    { ...state, fighter: { ...state.fighter, hp: 1 } },
    "use component",
  );
  assert.ok(plain.rejection);
  assert.match(game.renderResult(plain), /does not heal/);
  assert.ok(
    !game.getGameToolDefinitions(state).some((t) => t.name === "use_item"),
  );
  assert.match(
    game.renderResult(act(game, expected.state, "journal")),
    /Signal component fitted.*socket/s,
  );
  assert.equal(
    game.projectCharacterStatus(expected.state).collectedItems.length,
    0,
  );
  assert.match(
    game
      .projectDmScene(expected.state)
      .room.features.find((f) => f.id === "beacon-socket").description,
    /fitted permanently/,
  );
});

test("component ownership and placement survive command and scripted AI save/resume and chained trace replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-89-traces-"));
  const commands = [
    "move watch-loft",
    "move signal-records",
    "take component",
    "move watch-loft",
    "move watch-yard",
    "move valley-road",
    "move ridge-shelter",
    "move drainage-walk",
    "move beacon-tower",
  ];
  const messages = [
    "Travel to Watch Loft",
    "Travel to Signal Records Room",
    "Take spare signal component",
    "Travel to Watch Loft",
    "Travel to Watch Yard",
    "Travel to Valley Road",
    "Travel to Ridge Shelter",
    "Travel to Drainage Walk",
    "Travel to Beacon Tower",
  ];
  const cli = (input, args, script) => {
    const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
      input,
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        ...(script ? { DUNGEON_ONE_TEST_DM_SCRIPT: script } : {}),
      },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  try {
    const finals = [];
    for (const ai of [false, true]) {
      const save = join(dir, `${ai}.json`),
        trace = join(dir, `${ai}-before.json`),
        last = join(dir, `${ai}-after.json`),
        script = join(dir, `${ai}-script.json`);
      const responses = commands.flatMap((command) => {
        const [verb, target] = command.split(" ");
        const name = verb === "move" ? "move" : "take";
        const args =
          verb === "move"
            ? { destinationId: target }
            : { item_id: "signal-component" };
        return [
          {
            toolCalls: [
              { id: "intent", name, argumentsJson: JSON.stringify(args) },
            ],
          },
          { text: "Read the result." },
        ];
      });
      writeFileSync(script, JSON.stringify(responses));
      const mode = ai ? ["--ai"] : [];
      cli(
        (ai ? messages : commands).join("\n") + "\n",
        [
          "--adventure-file",
          resolve(adventure),
          "--seed",
          "0",
          "--save",
          save,
          "--trace",
          trace,
          ...mode,
        ],
        ai ? script : undefined,
      );
      assert.equal(
        JSON.parse(readFileSync(save)).checkpoint.state.items[
          "signal-component"
        ],
        "inventory",
      );
      writeFileSync(
        script,
        JSON.stringify([
          {
            toolCalls: [
              {
                id: "intent",
                name: "place_item",
                argumentsJson:
                  '{"item_id":"signal-component","target":"beacon-socket"}',
              },
            ],
          },
          { text: "Read the fitted socket result." },
        ]),
      );
      cli(
        ai
          ? "Fit spare signal component in beacon socket\n"
          : "use component at socket\n",
        ["--resume", save, "--trace", last, "--previous-trace", trace, ...mode],
        ai ? script : undefined,
      );
      assert.match(
        cli("", ["--replay", trace, last]),
        /Trace verified successfully/,
      );
      assert.match(
        cli("journal\n", ["--resume", save, ...mode], ai ? script : undefined),
        /Signal component fitted/,
      );
      const checkpoint = JSON.parse(readFileSync(save)).checkpoint;
      assert.equal(checkpoint.state.items["signal-component"], "consumed");
      finals.push(checkpoint.state);
    }
    assert.deepEqual(finals[0], finals[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the new item is bounded to its tuple, respects hidden targets, and keeps healing behavior distinct", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v14.schema.json")),
    QUEST_ITEM_SCHEMA,
  );
  const original = JSON.parse(readFileSync(adventure));
  for (const change of [
    (a) => {
      a.questItem.itemId = "unknown";
    },
    (a) => {
      a.questItem.featureId = "unknown";
    },
    (a) => {
      a.questItem.milestoneId = "unknown";
    },
    (a) => {
      a.questItem.discoveryId = "unknown";
    },
    (a) => {
      a.questItem.timeCost = 1;
    },
    (a) => {
      a.items[0].healing = {
        dice: 1,
        sides: 4,
        modifier: 1,
        target: "fighter",
      };
    },
    (a) => {
      a.rulesVersion = "chapel-clues-rules-v14";
    },
    (a) => {
      a.schemaVersion = 13;
    },
    (a) => {
      delete a.questItem;
    },
  ]) {
    const modified = structuredClone(original);
    change(modified);
    assert.equal(loadAdventure(JSON.stringify(modified)).ok, false);
  }
  const hidden = structuredClone(original);
  hidden.features.find((f) => f.id === "beacon-socket").when = [
    { type: "milestone-recorded", id: "component-fitted" },
  ];
  const loaded = loadAdventure(JSON.stringify(hidden));
  assert.equal(loaded.ok, true);
  const game = createDataRuntime(loaded.adventure),
    state = carry(game);
  assert.ok(act(game, state, "use component at socket").rejection);
  assert.ok(
    !game.getGameToolDefinitions(state).some((t) => t.name === "place_item"),
  );
  original.items.push({
    id: "healing-potion",
    name: "healing potion",
    aliases: ["potion"],
    description: "A healing potion.",
    locationId: "signal-records",
    featureId: "setting-plate",
    healing: { dice: 2, sides: 4, modifier: 2, target: "fighter" },
  });
  const withHealing = loadAdventure(JSON.stringify(original));
  assert.equal(withHealing.ok, true);
  const healer = createDataRuntime(withHealing.adventure);
  let at = healer.createSession();
  for (const command of [
    "move watch-loft",
    "move signal-records",
    "take potion",
    "take component",
  ])
    at = act(healer, at, command).state;
  assert.ok(act(healer, at, "use potion").rejection);
  const injured = { ...at, fighter: { ...at.fighter, hp: 1 } };
  const healed = healer.handleAction(
    injured,
    healer.parseCommand("use potion"),
    { roll: () => 3 },
  );
  assert.equal(healed.state.fighter.hp, 9);
  assert.equal(healed.state.items["healing-potion"], "consumed");
  assert.equal(healed.state.items["signal-component"], "inventory");
  assert.deepEqual(
    healer.getGameToolDefinitions(at).find((t) => t.name === "use_item")
      .parameters.properties.item_id.enum,
    ["healing-potion"],
  );
});

function waitMessage(child, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Child server timed out"));
    }, 10000);
    const receive = (message) => {
      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", receive);
    };
    child.on("message", receive);
  });
}
async function serverProcess(path, seed = 0) {
  const child = fork(
    fileURLToPath(new URL("./fixtures/issue-89-server.mjs", import.meta.url)),
    [path, String(seed)],
    { windowsHide: true, stdio: ["ignore", "ignore", "inherit", "ipc"] },
  );
  const { url } = await waitMessage(child, (x) => x.url);
  return { child, url };
}
const view = async (server) => (await fetch(server.url + "/api/state")).json();
const post = (server, body, endpoint = "/api/turn") =>
  fetch(server.url + endpoint, {
    method: "POST",
    headers: { Origin: server.url },
    body: JSON.stringify(body),
  });
const idle = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById("conversation").getAttribute("aria-busy") ===
      "false",
  );
async function control(server, value) {
  const receipt = waitMessage(server.child, (x) => x.control === value);
  server.child.send(value);
  await receipt;
}
async function stop(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => {
    server.child.once("exit", resolve);
  });
  server.child.kill();
  await exited;
}
async function typed(page, message) {
  await page.locator("#message").fill(message);
  const response = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await page.locator("#message").press("Enter");
  const result = await (await response).json();
  await idle(page);
  return result;
}

test(
  "real browser typed and clicked component use refresh all projections and survive failures, retries and launcher restart",
  { timeout: 90000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-89-browser-"));
    let server, browser;
    try {
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      const finalStates = [];
      for (const clicked of [true, false]) {
        const path = join(dir, `${clicked}.json`);
        server = await serverProcess(path);
        const page = await browser.newPage();
        await page.goto(server.url);
        await idle(page);
        await page.locator("#start").click();
        await idle(page);
        for (const message of [
          "Travel to Watch Loft",
          "Travel to Signal Records Room",
          "Take spare signal component",
        ]) {
          assert.equal((await typed(page, message)).committed, true, message);
        }
        await page.locator("#open-inventory").click();
        assert.match(
          await page.locator("#information").textContent(),
          /spare signal component.*beacon socket.*0 days.*no healing/s,
        );
        const wrong = await typed(page, "Use component at setting plate");
        assert.equal(wrong.committed, false);
        assert.equal((await view(server)).character.collectedItems.length, 1);
        for (const message of [
          "Travel to Watch Loft",
          "Travel to Watch Yard",
          "Travel to Valley Road",
          "Travel to Ridge Shelter",
          "Travel to Drainage Walk",
          "Travel to Beacon Tower",
        ]) {
          assert.equal((await typed(page, message)).committed, true, message);
        }
        const original = await view(server);
        const option = original.actions.find(
          (a) => a.call.name === "place_item",
        );
        assert.ok(option);
        assert.ok(
          !original.actions.some((a) => a.message.includes("Light the beacon")),
        );
        await page.locator("#open-hints").click();
        assert.match(
          await page.locator("#information").textContent(),
          /Fit spare signal component.*one component.*0 days/s,
        );
        const stale = await browser.newPage();
        await stale.goto(server.url);
        await idle(stale);
        if (clicked) {
          await page
            .getByRole("button", {
              name: "spare signal component",
              exact: true,
            })
            .click();
          assert.match(
            await page.locator("#context-actions").textContent(),
            /one component.*0 days.*no healing/s,
          );
          await control(server, "fail");
          const response = page.waitForResponse((r) =>
            r.url().endsWith("/api/turn"),
          );
          await page
            .getByRole("button", { name: "Fit signal component", exact: true })
            .click();
          const result = await (await response).json();
          await idle(page);
          assert.equal(result.committed, true);
          assert.match(result.cards[0].text, /fitted.*socket/s);
        } else {
          await page.route("**/api/turn", async (route) => {
            await route.fetch();
            await route.abort("failed");
          });
          await page
            .locator("#message")
            .fill("Fit spare signal component in beacon socket");
          await page.locator("#message").press("Enter");
          await page.waitForFunction(
            () => !document.getElementById("message").disabled,
          );
          await page.unroute("**/api/turn");
          await page.reload();
          await idle(page);
        }
        const fitted = await view(server);
        assert.equal(fitted.character.collectedItems.length, 0);
        assert.equal(fitted.character.hp, original.character.hp);
        assert.deepEqual(fitted.clocks, original.clocks);
        assert.ok(!fitted.actions.some((a) => a.call.name === "place_item"));
        assert.ok(
          fitted.actions.some((a) => a.message.includes("Light the beacon")),
        );
        assert.match(JSON.stringify(fitted.scene), /fitted permanently/);
        await page.locator("#open-journal").click();
        assert.match(
          await page.locator("#information").textContent(),
          /Signal component fitted.*socket/s,
        );
        await page.locator("#open-inventory").click();
        assert.match(
          await page.locator("#information").textContent(),
          /No carried items/,
        );
        await page.locator("#open-hints").click();
        assert.ok(
          !(await page.locator("#information").textContent()).includes(
            "You can Fit spare signal component",
          ),
        );
        const checkpoint = JSON.parse(readFileSync(path)).checkpoint;
        assert.equal(
          (
            await post(server, {
              revision: original.revision,
              optionId: option.id,
            })
          ).status,
          409,
        );
        await stale
          .getByRole("button", { name: "spare signal component", exact: true })
          .click();
        const staleResponse = stale.waitForResponse((r) =>
          r.url().endsWith("/api/turn"),
        );
        await stale
          .getByRole("button", { name: "Fit signal component", exact: true })
          .click();
        assert.equal((await staleResponse).status(), 409);
        await idle(stale);
        assert.equal(
          (await typed(page, "Fit spare signal component in beacon socket"))
            .committed,
          false,
        );
        assert.deepEqual(JSON.parse(readFileSync(path)).checkpoint, checkpoint);
        const before = await view(server);
        await stop(server);
        server = await serverProcess(path, 42);
        await page.goto(server.url);
        await idle(page);
        const resumed = await view(server);
        assert.deepEqual(resumed.history, before.history);
        assert.deepEqual(resumed.scene, before.scene);
        assert.deepEqual(JSON.parse(readFileSync(path)).checkpoint, checkpoint);
        finalStates.push(checkpoint.state);
        await page.close();
        await stale.close();
        await stop(server);
      }
      assert.deepEqual(finalStates[0], finalStates[1]);
    } finally {
      if (server) await stop(server);
      await browser?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
