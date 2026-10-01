import assert from "node:assert/strict";
import { fork, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createSeededRandom } from "../dist/random.js";
import { BRACE_SCHEMA } from "../dist/brace-schema.js";

const adventure = resolve("adventures/hollow-beacon-threat.json");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const runtime = (path = adventure) => {
  const loaded = loadAdventure(readFileSync(path));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
};
const act = (game, state, command, random) =>
  game.handleAction(state, game.parseCommand(command), random);
const braceCall = { name: "brace", argumentsJson: '{"target":"fallen-cart"}' };

test("cover spends one action, changes a hit to a miss, expires, and cannot be repeated", () => {
  assert.deepEqual(read("schema/adventure-v12.schema.json"), BRACE_SCHEMA);
  const game = runtime();
  assert.equal(game.engineVersion, "chapel-clues-engine-v17");
  const state = act(
    game,
    game.createSession(),
    "move ridge-trail",
    createSeededRandom(0),
  ).state;
  assert.equal(state.combat.currentTurn, "fighter");
  let draws = 0;
  const rng = {
    roll: () => {
      draws++;
      return 12;
    },
  };
  const cover = act(game, state, "brace cart", rng);
  const enemy = cover.events.find((x) => x.type === "attack-resolved");
  assert.equal(enemy.attackTotal, 17);
  assert.equal(enemy.targetArmorClass, 20);
  assert.equal(enemy.outcome, "miss");
  assert.equal(draws, 1); // No player attack, brace check or damage die.
  assert.equal(cover.state.fighter.hp, state.fighter.hp);
  assert.deepEqual(cover.state.monsters, state.monsters);
  assert.deepEqual(cover.state.clocks, state.clocks);
  assert.equal(cover.state.combat.currentTurn, "fighter");
  assert.match(game.renderResult(cover), /1 action, 0 days.*\n.*d20 12/s);
  assert.match(game.renderResult(cover), /Condition ends/);
  assert.deepEqual(game.projectDmScene(cover.state).combatChoices, []);
  assert.ok(
    !game.getGameToolDefinitions(cover.state).some((x) => x.name === "brace"),
  );
  for (const command of [
    "brace cart",
    "brace secret",
    "move beacon-tower",
    "search supply-sack",
  ]) {
    const result = act(game, cover.state, command, rng);
    assert.ok(result.rejection, command);
    assert.deepEqual(result.state, cover.state);
  }
  assert.equal(draws, 1);
  const dice = [12, 1, 12, 1];
  const attack = act(game, state, "attack raider", {
    roll: () => dice.shift(),
  });
  assert.equal(
    attack.events.find(
      (x) => x.type === "attack-resolved" && x.targetId === "fighter",
    ).outcome,
    "hit",
  );
  assert.equal(attack.state.fighter.hp, state.fighter.hp - 4);
  const natural20 = act(game, state, "brace cart", {
    roll: (sides) => (sides === 20 ? 20 : 1),
  });
  assert.equal(
    natural20.events.find((x) => x.type === "attack-resolved").outcome,
    "critical-hit",
  );
  assert.equal(natural20.state.fighter.hp, state.fighter.hp - 5);
});

test("command and bounded AI choices match; hidden, invalid, compound and out-of-turn requests preserve dice/state", () => {
  const game = runtime();
  const state = act(
    game,
    game.createSession(),
    "move ridge-trail",
    createSeededRandom(0),
  ).state;
  const command = act(game, state, "brace cart", createSeededRandom(1));
  const ai = game.dispatchGameTool(
    state,
    braceCall,
    createSeededRandom(1),
    "Brace the fallen cart.",
  );
  assert.deepEqual(ai.state, command.state);
  assert.deepEqual(ai.engineResult.events, command.events);
  const noDice = {
    roll: () => {
      throw new Error("Rejected action drew a die");
    },
  };
  for (const input of [
    "Maybe brace cover?",
    "Do not brace the cart",
    "Brace cart and attack raider",
    "Brace cart. Travel to tower.",
    "Brace secret wall",
  ]) {
    const result = game.dispatchGameTool(state, braceCall, noDice, input);
    assert.equal(result.modelOutput.ok, false, input);
    assert.deepEqual(result.state, state);
  }
  for (const args of [
    {},
    { target: "secret" },
    { target: "fallen-cart", extra: true },
  ]) {
    const result = game.dispatchGameTool(
      state,
      { name: "brace", argumentsJson: JSON.stringify(args) },
      noDice,
      "Brace cart",
    );
    assert.equal(result.modelOutput.ok, false);
    assert.deepEqual(result.state, state);
  }
  const enemyTurn = {
    ...state,
    combat: { ...state.combat, currentTurn: "ridge-raider" },
  };
  for (const command of ["attack raider", "brace cart", "use tonic"]) {
    assert.deepEqual(act(game, enemyTurn, command, noDice).state, enemyTurn);
    assert.ok(act(game, enemyTurn, command, noDice).rejection);
  }
  assert.ok(
    !game
      .getGameToolDefinitions(enemyTurn)
      .some((x) => ["attack", "brace", "use_item"].includes(x.name)),
  );
  assert.deepEqual(
    act(game, game.createSession(), "brace cart", noDice).state,
    game.createSession(),
  );
  const old = runtime("adventures/hollow-beacon-trust.json");
  assert.equal(old.parseCommand("brace cart").type, "unknown");
  assert.ok(!old.mutationToolNames.includes("brace"));
  const broken = read(adventure);
  broken.combatBrace.featureId = "shutter-latch";
  assert.equal(loadAdventure(JSON.stringify(broken)).ok, false);
  broken.combatBrace.featureId = "fallen-cart";
  broken.combatBrace.armorClassBonus = 100;
  assert.equal(loadAdventure(JSON.stringify(broken)).ok, false);
});

function cli(input, args, script) {
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
}
test("seeded victory/defeat, combat restart, aftermath and scripted AI trace replay match uninterrupted play", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-87-traces-"));
  try {
    for (const seed of [0, 3]) {
      const save = join(dir, seed + "-split.json"),
        whole = join(dir, seed + "-whole.json");
      const first = join(dir, seed + "-first.json"),
        second = join(dir, seed + "-second.json");
      const prefix = "move ridge-trail\nbrace cart\n";
      const suffix =
        Array(15).fill("attack raider").join("\n") +
        "\nsearch supply-sack\nlook\n";
      const args = ["--adventure-file", adventure, "--seed", String(seed)];
      cli(prefix, [...args, "--save", save, "--trace", first]);
      assert.equal(read(save).checkpoint.state.combat.braceUsed, true);
      cli(suffix, [
        "--resume",
        save,
        "--trace",
        second,
        "--previous-trace",
        first,
      ]);
      cli(prefix + suffix, [...args, "--save", whole]);
      assert.deepEqual(read(save).checkpoint, read(whole).checkpoint);
      assert.match(
        cli("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
      assert.equal(
        read(save).checkpoint.state.status,
        seed === 0 ? "playing" : "defeat",
      );
      if (seed === 0) {
        assert.ok(
          read(save).checkpoint.state.discoveries.includes("raider-motive"),
        );
      }
    }
    const script = join(dir, "script.json"),
      aiSave = join(dir, "ai.json"),
      trace = join(dir, "ai-trace.json");
    writeFileSync(
      script,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "move",
              name: "move",
              argumentsJson: '{"destinationId":"ridge-trail"}',
            },
          ],
        },
        { text: "Read the engine result." },
        { toolCalls: [{ id: "brace", ...braceCall }] },
        { text: "Read the engine result." },
      ]),
    );
    cli(
      "Travel to Ridge Trail\nBrace fallen cart\n",
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
    const commandSave = join(dir, "command.json");
    cli("move ridge-trail\nbrace cart\n", [
      "--adventure-file",
      adventure,
      "--seed",
      "0",
      "--save",
      commandSave,
    ]);
    assert.deepEqual(read(aiSave).checkpoint, read(commandSave).checkpoint);
    const endTrace = join(dir, "ai-end.json");
    cli(
      "status\n",
      [
        "--resume",
        aiSave,
        "--ai",
        "--trace",
        endTrace,
        "--previous-trace",
        trace,
      ],
      script,
    );
    assert.match(
      cli("", ["--replay", trace, endTrace]),
      /Trace verified successfully/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    fileURLToPath(new URL("./fixtures/issue-87-server.mjs", import.meta.url)),
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
  "real browser combat survives duplicate/stale requests, failed narration, lost reply and killed server without extra turns",
  { timeout: 60000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-87-browser-"));
    const path = join(dir, "slot.json");
    let server, browser;
    try {
      server = await serverProcess(path);
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      const page = await browser.newPage();
      await page.goto(server.url);
      await idle(page);
      await page.locator("#start").click();
      await idle(page);
      const stale = await view(server);
      const enter = await typed(page, "Travel to Ridge Trail");
      assert.equal(enter.committed, true);
      assert.match(enter.cards[0].text, /Initiative.*d20/s);
      assert.match(
        await page.locator("#combat").textContent(),
        /Turn: Fighter.*18\/18/,
      );
      const before = read(path).checkpoint;
      const current = await view(server);
      const brace = current.actions.find((x) => x.call.name === "brace");
      assert.ok(brace);
      assert.equal(
        current.actions.some((x) => x.call.name === "move"),
        false,
      );
      await page
        .getByRole("button", { name: "fallen cart", exact: true })
        .click();
      assert.match(
        await page.locator("#context-actions").textContent(),
        /1 action.*\+4 AC/s,
      );
      assert.equal(
        (await post(server, { revision: stale.revision, optionId: brace.id }))
          .status,
        409,
      );
      assert.deepEqual(read(path).checkpoint, before);
      // Fail provider narration after the engine has committed cover and one enemy turn.
      await control(server, "fail");
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/turn"),
      );
      await page
        .getByRole("button", { name: "Brace cover (1 action)", exact: true })
        .click();
      const covered = await (await response).json();
      await idle(page);
      assert.equal(covered.committed, true);
      assert.match(covered.cards[0].text, /Condition ends/);
      assert.equal(read(path).checkpoint.state.combat.braceUsed, true);
      const checkpoint = read(path).checkpoint;
      assert.equal(
        (await post(server, { revision: current.revision, optionId: brace.id }))
          .status,
        409,
      );
      assert.deepEqual(read(path).checkpoint, checkpoint);
      await page.locator("#open-character").click();
      assert.match(
        await page.locator("#information").textContent(),
        /Cover spent.*no active AC bonus/s,
      );
      assert.match(
        await page.locator("#hp").textContent(),
        new RegExp(`${checkpoint.state.fighter.hp} / 20`),
      );
      await stop(server);
      server = await serverProcess(path);
      await page.goto(server.url);
      await idle(page);
      assert.deepEqual(read(path).checkpoint, checkpoint);
      assert.ok(
        !(await view(server)).actions.some((x) => x.call.name === "brace"),
      );
      // A real page loses its next HTTP reply after the authoritative save.
      let lost = false;
      await page.route("**/api/turn", async (route) => {
        await route.fetch();
        lost = true;
        await route.abort("failed");
      });
      await page.locator("#message").fill("Attack ridge raider");
      await page.locator("#message").press("Enter");
      await page.waitForFunction(
        () => !document.getElementById("message").disabled,
      );
      assert.equal(lost, true);
      await page.unroute("**/api/turn");
      const afterLost = read(path).checkpoint;
      assert.equal(afterLost.sequence, checkpoint.sequence + 1);
      await page.reload();
      await idle(page);
      assert.deepEqual(read(path).checkpoint, afterLost);
      // Kill a separate process while its post-commit reply is pending.
      await control(server, "hold");
      const committed = waitMessage(server.child, (x) => x.committed);
      const preKill = await view(server);
      const attack = preKill.actions.find((x) => x.call.name === "attack");
      const pending = post(server, {
        revision: preKill.revision,
        optionId: attack.id,
      }).catch(() => undefined);
      await committed;
      const saved = read(path).checkpoint;
      assert.equal(saved.sequence, afterLost.sequence + 1);
      const duplicate = await post(server, {
        revision: preKill.revision,
        optionId: attack.id,
      });
      assert.ok([409, 503].includes(duplicate.status));
      assert.deepEqual(read(path).checkpoint, saved);
      await stop(server);
      await pending;
      server = await serverProcess(path);
      await page.goto(server.url);
      await idle(page);
      assert.deepEqual(read(path).checkpoint, saved);
      assert.match(
        await page.locator("#hp").textContent(),
        new RegExp(`${saved.state.fighter.hp} / 20`),
      );
      const history = await view(server);
      assert.ok(history.history.at(-1).committed);
      const commands = [
        "move ridge-trail",
        "brace cart",
        "attack raider",
        "attack raider",
      ];
      const expected = join(dir, "expected.json");
      cli(commands.join("\n") + "\n", [
        "--adventure-file",
        adventure,
        "--seed",
        "0",
        "--save",
        expected,
      ]);
      assert.deepEqual(saved, read(expected).checkpoint);
      while ((await view(server)).character.combatTurn) {
        assert.equal(
          (await typed(page, "Attack ridge raider")).committed,
          true,
        );
      }
      assert.equal(
        (await typed(page, "Search discarded supply sack")).committed,
        true,
      );
      assert.match(
        await page.locator("#description").textContent(),
        /defeated raider/,
      );
      await page.locator("#open-journal").click();
      assert.match(
        await page.locator("#information").textContent(),
        /Supplies taken from the road/,
      );
      const final = read(path).checkpoint;
      await stop(server);
      server = await serverProcess(path);
      await page.goto(server.url);
      await idle(page);
      assert.deepEqual(read(path).checkpoint, final);
    } finally {
      await browser?.close();
      if (server) {
        await stop(server);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "real browser typed and clicked cover have identical combat checkpoints; seeded defeat enters saved Review mode",
  { timeout: 60000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-87-parity-"));
    let server, browser;
    try {
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      for (const seed of [0, 3]) {
        const checkpoints = [];
        for (const clicked of [false, true]) {
          const path = join(dir, `${seed}-${clicked}.json`);
          server = await serverProcess(path, seed);
          const page = await browser.newPage();
          await page.goto(server.url);
          await idle(page);
          await page.locator("#start").click();
          await idle(page);
          assert.equal(
            (await typed(page, "Travel to Ridge Trail")).committed,
            true,
          );
          if (clicked) {
            await page
              .getByRole("button", { name: "fallen cart", exact: true })
              .click();
            const reply = page.waitForResponse((r) =>
              r.url().endsWith("/api/turn"),
            );
            await page
              .getByRole("button", {
                name: "Brace cover (1 action)",
                exact: true,
              })
              .click();
            assert.equal((await (await reply).json()).committed, true);
            await idle(page);
          } else {
            assert.equal(
              (await typed(page, "Brace fallen cart")).committed,
              true,
            );
          }
          const covered = read(path).checkpoint;
          while (
            (await view(server)).scene.outcome === "playing" &&
            (await view(server)).character.combatTurn
          ) {
            assert.equal(
              (await typed(page, "Attack ridge raider")).committed,
              true,
            );
          }
          const finished = read(path).checkpoint;
          assert.equal(
            finished.state.status,
            seed === 0 ? "playing" : "defeat",
          );
          if (seed === 3) {
            assert.match(
              await page.locator("#session").textContent(),
              /Review mode/,
            );
            assert.equal(await page.locator("#message").isDisabled(), true);
            const finalView = await view(server);
            assert.deepEqual(finalView.actions, []);
            assert.match(await page.locator("#hp").textContent(), /0 \/ 20/);
            await stop(server);
            server = await serverProcess(path, seed);
            await page.goto(server.url);
            await idle(page);
            assert.deepEqual((await view(server)).history, finalView.history);
            assert.deepEqual(read(path).checkpoint, finished);
          }
          checkpoints.push({ covered, finished });
          await page.close();
          await stop(server);
        }
        assert.deepEqual(checkpoints[0], checkpoints[1]);
      }
    } finally {
      await browser?.close();
      if (server) {
        await stop(server);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
