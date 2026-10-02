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
import { RECOVERY_SCHEMA } from "../dist/recovery-schema.js";

const adventure = resolve("adventures/hollow-beacon-recovery.json");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const runtime = () => {
  const loaded = loadAdventure(readFileSync(adventure));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
};
const act = (game, state, command, random) =>
  game.handleAction(state, game.parseCommand(command), random);
const recover = {
  name: "recover",
  argumentsJson: '{"target":"dressing-station"}',
};
const noDice = {
  roll() {
    throw new Error("Recovery or rejection rolled dice");
  },
};

function firstFight(game, seed) {
  const random = createSeededRandom(seed);
  let state = game.createSession();
  const commands = [];
  const step = (command) => {
    const result = act(game, state, command, random);
    assert.ok(!result.rejection, command);
    state = result.state;
    commands.push(command);
  };
  step("move ridge-trail");
  step("brace cart");
  for (
    let round = 0;
    state.combat && state.status === "playing" && round < 30;
    round++
  ) {
    step("attack raider");
  }
  return {
    get state() {
      return state;
    },
    commands,
    random,
    step,
  };
}

test("recovery is a public fixed resource: location, injury, cap, once-only state and strict AI intent", () => {
  assert.deepEqual(read("schema/adventure-v13.schema.json"), RECOVERY_SCHEMA);
  const game = runtime();
  assert.equal(game.engineVersion, "chapel-clues-engine-v18");
  const run = firstFight(game, 9);
  assert.equal(run.state.fighter.hp, 3);
  assert.ok(act(game, run.state, "recover station", noDice).rejection);
  run.step("move ridge-shelter");
  const state = run.state;
  const scene = game.projectDmScene(state);
  assert.match(scene.room.description, /0 days.*1 day.*no clue/s);
  assert.match(scene.recoveryChoices[0].stakes, /once|one dressing/);
  assert.match(
    scene.recoveryChoices[0].stakes,
    /min\(8, missing HP\).*0 days/s,
  );
  const result = act(game, state, "recover station", noDice);
  assert.equal(result.state.fighter.hp, 11);
  assert.deepEqual(result.state.clocks, state.clocks);
  assert.deepEqual(result.state.items, state.items);
  assert.ok(result.state.milestones.includes("camp-dressing-used"));
  assert.match(
    game.renderResult(result),
    /Actual recovery: 8 HP.*11\/20.*0 days/s,
  );
  assert.match(
    game.projectCharacterStatus(result.state).resources.join(" "),
    /dressing consumed/,
  );
  assert.deepEqual(game.projectDmScene(result.state).recoveryChoices, []);
  for (const hp of [18, 20]) {
    const at = { ...state, fighter: { ...state.fighter, hp } };
    const capped = act(game, at, "recover station", noDice);
    if (hp === 18) {
      assert.equal(capped.state.fighter.hp, 20);
    } else {
      assert.equal(capped.rejection.reason, "full-hp");
      assert.deepEqual(capped.state, at);
    }
  }
  for (const input of [
    "Recover at camp dressing station",
    "Rest at camp dressing station",
    "Bandage at camp dressing station",
  ]) {
    assert.deepEqual(
      game.dispatchGameTool(state, recover, noDice, input).state,
      result.state,
    );
    const retry = game.dispatchGameTool(result.state, recover, noDice, input);
    assert.equal(retry.modelOutput.ok, false);
    assert.deepEqual(retry.state, result.state);
  }
  for (const input of [
    "Maybe recover at station?",
    "Do not recover at station",
    "Recover at station and attack sentry",
    "Recover at station. Recover at station.",
    "Recover at station, recover at station",
    "Rest somewhere secret",
    "Recover at station then travel to tower",
  ]) {
    const invalid = game.dispatchGameTool(state, recover, noDice, input);
    assert.equal(invalid.modelOutput.ok, false, input);
    assert.deepEqual(invalid.state, state);
  }
  for (const args of [
    {},
    { target: "secret" },
    { target: "dressing-station", extra: true },
  ]) {
    assert.equal(
      game.dispatchGameTool(
        state,
        { name: "recover", argumentsJson: JSON.stringify(args) },
        noDice,
        "Recover at station",
      ).modelOutput.ok,
      false,
    );
  }
  run.step("move tower-approach");
  assert.ok(act(game, run.state, "recover station", noDice).rejection);
  for (const command of ["move ridge-shelter", "surrender", "retreat"]) {
    assert.ok(act(game, run.state, command, noDice).rejection);
  }
  assert.match(
    game.projectDmScene(run.state).room.description,
    /no retreat or surrender/i,
  );
  const fragile = { ...run.state, fighter: { ...run.state.fighter, hp: 1 } };
  const rolls = [1, 20, 1, 1];
  const defeat = act(game, fragile, "attack sentry", {
    roll: () => rolls.shift(),
  });
  assert.equal(defeat.state.status, "defeat");
  assert.equal(defeat.state.fighter.hp, 0);
  assert.ok(act(game, defeat.state, "recover station", noDice).rejection);
  assert.ok(
    !game
      .getGameToolDefinitions(defeat.state)
      .some((x) => x.name === "recover"),
  );
  const broken = read(adventure);
  broken.recovery.featureId = "secret";
  assert.equal(loadAdventure(JSON.stringify(broken)).ok, false);
  broken.recovery.featureId = "dressing-station";
  broken.recovery.milestoneId = "secret";
  assert.equal(loadAdventure(JSON.stringify(broken)).ok, false);
  broken.recovery.milestoneId = "camp-dressing-used";
  broken.recovery.timeCost = 1;
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

test("recorded seeds reach the tower by fighting or avoiding; all three checkpoints resume and replay command and scripted AI", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-88-traces-"));
  try {
    for (const seed of [0, 5, 8, 9, 10]) {
      for (const fight of [true, false]) {
        const game = runtime(),
          run = firstFight(game, seed);
        assert.equal(run.state.status, "playing");
        const first = run.commands.length;
        run.step("move ridge-shelter");
        run.step("recover station");
        const healed = run.commands.length;
        run.step(fight ? "move tower-approach" : "move drainage-walk");
        const optional = run.commands.length;
        for (
          let round = 0;
          run.state.combat && run.state.status === "playing" && round < 30;
          round++
        ) {
          run.step("attack sentry");
        }
        assert.equal(
          run.state.status,
          "playing",
          `seed ${seed}, fight ${fight}`,
        );
        run.step("move beacon-tower");
        assert.ok(run.state.fighter.hp > 0);
        assert.equal(run.state.clocks["caravan-deadline"], fight ? 2 : 3);
        assert.ok(!run.state.discoveries.includes("tower-onward-lead")); // No hidden required clue.
        assert.ok(
          game
            .projectDmScene(run.state)
            .room.npcs.some((x) => x.id === "tower-runner"),
        );
        const prefix = `${seed}-${fight}`,
          whole = join(dir, prefix + "-whole.json");
        const args = ["--adventure-file", adventure, "--seed", String(seed)];
        cli(run.commands.join("\n") + "\n", [...args, "--save", whole]);
        for (const boundary of [first, healed, optional]) {
          const save = join(dir, prefix + boundary + ".json"),
            trace1 = join(dir, prefix + boundary + "-1.json"),
            trace2 = join(dir, prefix + boundary + "-2.json");
          cli(run.commands.slice(0, boundary).join("\n") + "\n", [
            ...args,
            "--save",
            save,
            "--trace",
            trace1,
          ]);
          cli(run.commands.slice(boundary).join("\n") + "\n", [
            "--resume",
            save,
            "--trace",
            trace2,
            "--previous-trace",
            trace1,
          ]);
          assert.deepEqual(read(save).checkpoint, read(whole).checkpoint);
          assert.match(
            cli("", ["--replay", trace1, trace2]),
            /Trace verified successfully/,
          );
        }
        if (seed === 9) {
          const script = join(dir, prefix + "-script.json"),
            ai = join(dir, prefix + "-ai.json"),
            trace = join(dir, prefix + "-ai-trace.json");
          const inputs = run.commands.map((command) => {
            const [verb, target] = command.split(" ");
            return verb === "move"
              ? ["move", { destinationId: target }, "Travel to " + target]
              : verb === "recover"
                ? [
                    "recover",
                    { target: "dressing-station" },
                    "Recover at camp dressing station",
                  ]
                : verb === "brace"
                  ? ["brace", { target: "fallen-cart" }, "Brace fallen cart"]
                  : [
                      "attack",
                      {
                        opponent_id:
                          target === "raider" ? "ridge-raider" : "tower-sentry",
                      },
                      "Attack " + target,
                    ];
          });
          writeFileSync(
            script,
            JSON.stringify(
              inputs.flatMap(([name, args]) => [
                {
                  toolCalls: [
                    { id: "intent", name, argumentsJson: JSON.stringify(args) },
                  ],
                },
                { text: "Read the engine result." },
              ]),
            ),
          );
          cli(
            inputs.map((x) => x[2]).join("\n") + "\n",
            [...args, "--ai", "--save", ai, "--trace", trace],
            script,
          );
          assert.deepEqual(read(ai).checkpoint, read(whole).checkpoint);
          const last = join(dir, prefix + "-ai-end.json");
          cli(
            "status\n",
            [
              "--resume",
              ai,
              "--ai",
              "--trace",
              last,
              "--previous-trace",
              trace,
            ],
            script,
          );
          assert.match(
            cli("", ["--replay", trace, last]),
            /Trace verified successfully/,
          );
        }
      }
    }
    const defeated = firstFight(runtime(), 3);
    assert.equal(defeated.state.status, "defeat");
    assert.ok(
      act(runtime(), defeated.state, "recover station", noDice).rejection,
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
    fileURLToPath(new URL("./fixtures/issue-88-server.mjs", import.meta.url)),
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
  "real browser fight/avoidance and one-use recovery survive narration failure, lost reply, stale clicks and automatic continuation",
  { timeout: 90000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-88-browser-"));
    const running = {
      current: undefined,
      replace(server) {
        this.current = server;
      },
    };
    let browser;
    try {
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      for (const fight of [true, false]) {
        const path = join(dir, `${fight}.json`);
        running.current = await serverProcess(path, 9);
        const page = await browser.newPage(),
          staleTab = await browser.newPage();
        await page.goto(running.current.url);
        await idle(page);
        await page.locator("#start").click();
        await idle(page);
        const commands = [];
        const step = async (message, command) => {
          const result = await typed(page, message);
          assert.equal(result.committed, true, message);
          commands.push(command);
          return result;
        };
        const restart = async () => {
          const before = read(path).checkpoint,
            history = (await view(running.current)).history;
          await stop(running.current);
          const nextServer = await serverProcess(path, 0);
          running.replace(nextServer); // Saved seed 9 remains authoritative.
          await page.goto(running.current.url);
          await idle(page);
          assert.deepEqual(read(path).checkpoint, before);
          assert.deepEqual((await view(running.current)).history, history);
        };
        await step("Travel to Ridge Trail", "move ridge-trail");
        await step("Brace fallen cart", "brace cart");
        while ((await view(running.current)).character.combatTurn) {
          await step("Attack ridge raider", "attack raider");
        }
        assert.equal(read(path).checkpoint.state.fighter.hp, 3);
        await restart(); // After the first fight.
        await step("Travel to Ridge Shelter", "move ridge-shelter");
        await step("Search tower route board", "search board");
        await page.locator("#open-journal").click();
        assert.match(
          await page.locator("#information").textContent(),
          /Tower routes and instructions.*Drainage Walk/s,
        );
        await page
          .getByRole("button", { name: "camp dressing station", exact: true })
          .click();
        assert.match(
          await page.locator("#context-actions").textContent(),
          /min\(8, missing HP\).*0 days/s,
        );
        const original = await view(running.current),
          recovery = original.actions.find((x) => x.call.name === "recover");
        assert.ok(recovery);
        await staleTab.goto(running.current.url);
        await idle(staleTab);
        const before = read(path).checkpoint;
        if (fight) {
          await control(running.current, "fail");
          const response = page.waitForResponse((r) =>
            r.url().endsWith("/api/turn"),
          );
          await page
            .getByRole("button", {
              name: "Recover (one dressing)",
              exact: true,
            })
            .click();
          const result = await (await response).json();
          await idle(page);
          assert.equal(result.committed, true);
          assert.match(result.cards[0].text, /Actual recovery: 8 HP/);
        } else {
          // Lose the typed recovery HTTP reply after save; reloading must show its result.
          await page.route("**/api/turn", async (route) => {
            await route.fetch();
            await route.abort("failed");
          });
          await page.locator("#message").fill("Rest at camp dressing station");
          await page.locator("#message").press("Enter");
          await page.waitForFunction(
            () => !document.getElementById("message").disabled,
          );
          await page.unroute("**/api/turn");
          await page.reload();
          await idle(page);
        }
        commands.push("recover station");
        const healed = read(path).checkpoint;
        assert.equal(healed.sequence, before.sequence + 1);
        assert.equal(healed.state.fighter.hp, 11);
        assert.deepEqual(healed.state.clocks, before.state.clocks);
        assert.deepEqual(healed.state.items, before.state.items);
        assert.ok(healed.state.milestones.includes("camp-dressing-used"));
        assert.equal(
          (
            await post(running.current, {
              revision: original.revision,
              optionId: recovery.id,
            })
          ).status,
          409,
        );
        // The other page still has its old clicked recovery offer.
        await staleTab
          .getByRole("button", { name: "camp dressing station", exact: true })
          .click();
        const staleResponse = staleTab.waitForResponse((r) =>
          r.url().endsWith("/api/turn"),
        );
        await staleTab
          .getByRole("button", { name: "Recover (one dressing)", exact: true })
          .click();
        assert.equal((await staleResponse).status(), 409);
        await idle(staleTab);
        assert.deepEqual(read(path).checkpoint, healed);
        const retry = await typed(page, "Recover at camp dressing station");
        assert.equal(retry.committed, false);
        assert.deepEqual(read(path).checkpoint, healed);
        assert.ok(
          !(await view(running.current)).actions.some(
            (x) => x.call.name === "recover",
          ),
        );
        for (const panel of ["character", "inventory", "journal"]) {
          await page.locator("#open-" + panel).click();
          assert.match(
            await page.locator("#information").textContent(),
            /dressing consumed/,
          );
        }
        await restart(); // After recovery; exact history retained.
        assert.match(await page.locator("#hp").textContent(), /11 \/ 20/);
        const route = fight ? "Tower Approach" : "Drainage Walk";
        await step(
          "Travel to " + route,
          "move " + (fight ? "tower-approach" : "drainage-walk"),
        );
        if (fight) {
          const encounter = await view(running.current),
            attack = encounter.actions.find((x) => x.call.name === "attack");
          await restart(); // During the optional encounter, before the first player turn.
          await page
            .getByRole("button", { name: "tower sentry", exact: true })
            .click();
          await control(running.current, "hold");
          const committed = waitMessage(
            running.current.child,
            (x) => x.committed,
          );
          const response = page
            .waitForResponse((r) => r.url().endsWith("/api/turn"), {
              timeout: 3000,
            })
            .catch(() => undefined);
          await page
            .getByRole("button", { name: "Attack (1 action)", exact: true })
            .click();
          await committed;
          const saved = read(path).checkpoint;
          assert.equal(
            (
              await post(running.current, {
                revision: encounter.revision,
                optionId: attack.id,
              })
            ).status,
            409,
          );
          assert.deepEqual(read(path).checkpoint, saved);
          await stop(running.current);
          await response;
          commands.push("attack sentry");
          const nextServer = await serverProcess(path, 0);
          running.replace(nextServer);
          await page.goto(running.current.url);
          await idle(page);
          assert.deepEqual(read(path).checkpoint, saved);
          while ((await view(running.current)).character.combatTurn) {
            await step("Attack tower sentry", "attack sentry");
          }
          assert.ok(
            read(path).checkpoint.state.milestones.includes("approach-cleared"),
          );
        }
        await step("Travel to Beacon Tower", "move beacon-tower");
        assert.equal(
          (await view(running.current)).scene.room.id,
          "beacon-tower",
        );
        assert.equal(
          read(path).checkpoint.state.clocks["caravan-deadline"],
          fight ? 2 : 3,
        );
        assert.ok(read(path).checkpoint.state.fighter.hp > 0);
        const expected = join(dir, `${fight}-expected.json`);
        cli(commands.join("\n") + "\n", [
          "--adventure-file",
          adventure,
          "--seed",
          "9",
          "--save",
          expected,
        ]);
        assert.deepEqual(read(path).checkpoint, read(expected).checkpoint);
        await page.close();
        await staleTab.close();
        await stop(running.current);
      }
    } finally {
      if (browser) {
        await browser.close();
      }
      if (running.current) {
        await stop(running.current);
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
