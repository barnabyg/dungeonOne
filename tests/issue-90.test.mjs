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
import { CONFRONTATION_SCHEMA } from "../dist/confrontation-schema.js";

const adventure = "adventures/hollow-beacon-confrontation.json";
const noDice = {
  roll() {
    throw new Error("Unexpected die roll");
  },
};
const game = () => {
  const loaded = loadAdventure(readFileSync(adventure));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
};
function action(runtime, state, command, random = noDice) {
  const result = runtime.handleAction(
    state,
    runtime.parseCommand(command),
    random,
  );
  assert.ok(!result.rejection, command + ": " + runtime.renderResult(result));
  return result;
}
function walk(runtime, state, commands, random = noDice) {
  for (const command of commands) {
    state = action(runtime, state, command, random).state;
  }
  return state;
}
const proofStart = [
  "move watch-loft",
  "move signal-records",
  "search setting-plate",
  "take component",
  "move watch-loft",
  "move watch-yard",
];
const valley = [
  "move valley-road",
  "move ridge-shelter",
  "move drainage-walk",
  "move beacon-tower",
];
const proofFinish = [
  "search tower-work-order",
  "talk vey plate-proof ask",
  "use component at socket",
  "search final-warning-board",
];

test("physical proof or living watch authority opens control without dice, HP cost, invented rescue, or closure", () => {
  const runtime = game();
  let state = walk(runtime, runtime.createSession(), [
    ...proofStart,
    ...valley,
  ]);
  assert.ok(
    !runtime
      .projectDmScene(state)
      .room.features.some((f) => f.id === "final-warning-board"),
  );
  assert.ok(
    !runtime
      .projectDmScene(state)
      .room.npcs.find((n) => n.id === "vey")
      .subjects.some((t) => t.id === "plate-proof"),
  );
  const failed = action(runtime, state, "talk vey stand-down persuade", {
    roll: () => 1,
  });
  assert.match(runtime.renderResult(failed), /refuse.*unsupported/s);
  assert.equal(
    failed.state.socialChallenges["vey-stand-down"].result,
    "failure",
  );
  const repeated = action(
    runtime,
    failed.state,
    "talk vey stand-down persuade",
  );
  assert.deepEqual(
    repeated.state.socialChallenges,
    failed.state.socialChallenges,
  );
  state = action(runtime, repeated.state, "search tower-work-order").state;
  const before = state;
  const proof = action(runtime, state, "talk vey plate-proof ask");
  assert.match(
    runtime.renderResult(proof),
    /diverted.*stand aside.*cannot tell/s,
  );
  assert.deepEqual(proof.state.fighter, before.fighter);
  assert.deepEqual(proof.state.clocks, before.clocks);
  assert.deepEqual(proof.state.items, before.items);
  assert.equal(proof.state.npcHealth.vey.hp, 12);
  state = walk(runtime, proof.state, [
    "use component at socket",
    "search final-warning-board",
    "talk runner hold-beacon ask",
  ]);
  assert.equal(state.status, "playing");
  assert.equal(state.ending, undefined);
  assert.equal(state.items["signal-component"], "consumed");
  assert.ok(state.milestones.includes("decision-reviewed"));
  assert.ok(
    runtime.handleAction(
      state,
      runtime.parseCommand("use component at socket"),
      noDice,
    ).rejection,
  );
});

test("warrant, refugee proof, dead allies and unavailable items use only the evidence and actors actually present", () => {
  const runtime = game();
  let state = walk(runtime, runtime.createSession(), [
    "move keeper-path",
    "search shutter-latch",
    "move watch-yard",
    "talk iona relay-warning ask",
    "talk iona tower-warrant ask",
  ]);
  assert.ok(state.discoveries.includes("watch-warrant"));
  const source = state;
  state = walk(runtime, state, valley);
  const allied = action(runtime, state, "talk vey watch-alliance ask");
  assert.match(runtime.renderResult(allied), /compliance, not a confession/);
  assert.ok(!allied.state.discoveries.includes("tower-order-known"));
  assert.equal(allied.state.status, "playing");
  assert.ok(
    runtime.handleAction(
      allied.state,
      runtime.parseCommand("use component at socket"),
      noDice,
    ).rejection,
  );
  assert.ok(
    runtime
      .projectDmScene(allied.state)
      .room.features.some((f) => f.id === "final-warning-board"),
  );
  const rng = createSeededRandom(0);
  let deadAlly = action(runtime, source, "attack iona", rng).state;
  while (deadAlly.combat && deadAlly.status === "playing") {
    deadAlly = action(runtime, deadAlly, "attack iona", rng).state;
  }
  assert.equal(deadAlly.npcHealth.iona.hp, 0);
  deadAlly = walk(runtime, deadAlly, [
    "move watch-loft",
    "move signal-records",
    "search setting-plate",
    "move watch-loft",
    "move watch-yard",
    ...valley,
  ]);
  assert.ok(
    runtime.handleAction(
      deadAlly,
      runtime.parseCommand("talk vey watch-alliance ask"),
      noDice,
    ).rejection,
  );
  assert.ok(
    !runtime
      .projectDmScene(deadAlly)
      .room.npcs.find((n) => n.id === "vey")
      .subjects.some((s) => s.id === "watch-alliance"),
  );
  deadAlly = walk(runtime, deadAlly, [
    "search tower-work-order",
    "talk vey plate-proof ask",
    "search final-warning-board",
  ]);
  assert.equal(deadAlly.status, "playing");
  let refugee = walk(runtime, runtime.createSession(), [
    "move refugee-camp",
    "move refugee-overlook",
    "search sighting-frame",
    "move refugee-camp",
    "move watch-yard",
    ...valley,
    "search tower-work-order",
    "talk vey frame-proof ask",
  ]);
  assert.ok(refugee.milestones.includes("peaceful-control"));
  assert.ok(!refugee.discoveries.includes("altered-setting"));
  assert.equal(refugee.monsters["tower-sentry"].hp, 10);
  assert.equal(refugee.clocks["caravan-deadline"], 5);
  refugee = action(runtime, refugee, "search final-warning-board").state;
  assert.equal(refugee.status, "playing");
});

test("documented seeds survive all three encounters and reach a distinct casualty-bearing decision boundary", () => {
  const runtime = game();
  const witnesses = JSON.parse(
    readFileSync("docs/acceptance/issue-90-seeds.json"),
  );
  for (const witness of witnesses) {
    const state = walk(
      runtime,
      runtime.createSession(),
      witness.commands,
      createSeededRandom(witness.seed),
    );
    assert.equal(state.fighter.hp, witness.hp);
    assert.equal(state.status, "playing");
    assert.equal(state.npcHealth.vey.hp, 0);
    assert.ok(state.milestones.includes("force-control"));
    assert.ok(!state.milestones.includes("peaceful-control"));
    assert.ok(state.milestones.includes("decision-reviewed"));
    assert.ok(
      !runtime.projectDmScene(state).room.npcs.find((n) => n.id === "vey")
        .subjects.length,
    );
    assert.ok(
      runtime.handleAction(
        state,
        runtime.parseCommand("talk vey plate-proof ask"),
        noDice,
      ).rejection,
    );
    assert.ok(
      runtime.handleAction(state, runtime.parseCommand("attack vey"), noDice)
        .rejection,
    );
  }
});

test("Vey defeat freezes actions, and a nonessential runner death leaves the physical decision open", () => {
  const runtime = game();
  let state = walk(runtime, runtime.createSession(), valley);
  const dice = [1, 20, 20, 4, 4, 1, 20, 4, 4, 1, 20, 4, 4];
  const hostile = { roll: () => dice.shift() ?? 1 };
  state = action(runtime, state, "attack vey", hostile).state;
  while (state.combat && state.status === "playing") {
    state = action(runtime, state, "attack vey", hostile).state;
  }
  assert.equal(state.status, "defeat");
  assert.equal(state.fighter.hp, 0);
  for (const command of [
    "attack vey",
    "search tower-work-order",
    "move drainage-walk",
  ]) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      noDice,
    );
    assert.ok(result.rejection);
    assert.deepEqual(result.state, state);
  }
  const random = createSeededRandom(0);
  state = walk(
    runtime,
    runtime.createSession(),
    [...proofStart, ...valley, ...proofFinish],
    random,
  );
  state = action(runtime, state, "attack runner", random).state;
  while (state.combat && state.status === "playing") {
    state = action(runtime, state, "attack runner", random).state;
  }
  assert.equal(state.npcHealth["tower-runner"].hp, 0);
  assert.equal(state.status, "playing");
  assert.ok(
    runtime.handleAction(
      state,
      runtime.parseCommand("talk runner hold-beacon ask"),
      noDice,
    ).rejection,
  );
  assert.ok(
    runtime
      .projectDmScene(state)
      .room.features.some((feature) => feature.id === "final-warning-board"),
  );
  assert.equal(
    action(runtime, state, "search final-warning-board").state.status,
    "playing",
  );
});

function callFor(command) {
  const [verb, target, topic, approach] = command.split(" ");
  const name = {
    move: "move",
    search: "search",
    talk: "talk",
    take: "take",
    use: "place_item",
    attack: "attack",
  }[verb];
  const args =
    verb === "move"
      ? { destinationId: target }
      : verb === "talk"
        ? { speakerId: target, topicId: topic, approach }
        : verb === "take"
          ? { item_id: "signal-component" }
          : verb === "use"
            ? { item_id: "signal-component", target: "beacon-socket" }
            : verb === "attack"
              ? { opponent_id: target }
              : { target };
  return { id: "intent", name, argumentsJson: JSON.stringify(args) };
}
const messageFor = (command) =>
  command === "use component at socket"
    ? "Fit spare signal component in beacon socket"
    : command;

test("command and scripted AI journeys restart at confrontation and replay linked state, clock, HP, items and knowledge identically", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-90-replay-"));
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
    for (const force of [false, true]) {
      const finals = [];
      for (const ai of [false, true]) {
        const stem = join(dir, `${force}-${ai}`),
          save = stem + ".json",
          script = stem + "-script.json",
          first = stem + "-before.json",
          last = stem + "-after.json";
        const runtime = game(),
          rng = createSeededRandom(0);
        let state = walk(
          runtime,
          runtime.createSession(),
          [...proofStart, ...valley],
          rng,
        );
        const after = force ? ["attack vey"] : proofFinish;
        if (force) {
          state = action(runtime, state, "attack vey", rng).state;
          while (state.combat && state.status === "playing") {
            after.push("attack vey");
            state = action(runtime, state, "attack vey", rng).state;
          }
          after.push(
            "search control-access",
            "use component at socket",
            "search final-warning-board",
          );
        }
        const run = (commands, args) => {
          writeFileSync(
            script,
            JSON.stringify(
              commands.flatMap((command) => [
                { toolCalls: [callFor(command)] },
                { text: "Read the engine result." },
              ]),
            ),
          );
          return cli(
            commands.map(ai ? messageFor : (command) => command).join("\n") +
              "\n",
            [...args, ...(ai ? ["--ai"] : [])],
            ai ? script : undefined,
          );
        };
        run(
          [...proofStart, ...valley],
          [
            "--adventure-file",
            resolve(adventure),
            "--seed",
            "0",
            "--save",
            save,
            "--trace",
            first,
          ],
        );
        const checkpoint = JSON.parse(readFileSync(save)).checkpoint.state;
        assert.equal(checkpoint.npcHealth.vey.hp, 12);
        assert.equal(checkpoint.items["signal-component"], "inventory");
        run(after, [
          "--resume",
          save,
          "--trace",
          last,
          "--previous-trace",
          first,
        ]);
        assert.match(
          cli("", ["--replay", first, last]),
          /Trace verified successfully/,
        );
        const final = JSON.parse(readFileSync(save)).checkpoint;
        assert.equal(final.state.status, "playing");
        assert.ok(final.state.milestones.includes("decision-reviewed"));
        assert.equal(final.state.items["signal-component"], "consumed");
        finals.push(final);
      }
      assert.deepEqual(finals[0], finals[1]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("confrontation public stakes use a new validated tuple while released v9 semantics stay unchanged", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v15.schema.json")),
    CONFRONTATION_SCHEMA,
  );
  const original = JSON.parse(readFileSync(adventure));
  for (const mutate of [
    (a) => {
      a.rulesVersion = "chapel-clues-rules-v15";
    },
    (a) => {
      a.schemaVersion = 14;
    },
    (a) => {
      a.npcs.find((n) => n.id === "vey").topics[1].when[0].id =
        "invented-proof";
    },
  ]) {
    const invalid = structuredClone(original);
    mutate(invalid);
    assert.equal(loadAdventure(JSON.stringify(invalid)).ok, false);
  }
  const released = JSON.parse(
    readFileSync("adventures/hollow-beacon-component.json"),
  );
  assert.equal(loadAdventure(JSON.stringify(released)).ok, true);
  released.npcs[0].topics[0].stakes = "Unversioned public stakes";
  assert.equal(loadAdventure(JSON.stringify(released)).ok, false);
});

function waitMessage(child, predicate) {
  return new Promise((resolveMessage, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Confrontation fixture timed out"));
    }, 10000);
    const receive = (message) => {
      if (predicate(message)) {
        cleanup();
        resolveMessage(message);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("message", receive);
    };
    child.on("message", receive);
  });
}
async function startServer(path, seed = 0) {
  const child = fork(
    fileURLToPath(new URL("./fixtures/issue-90-server.mjs", import.meta.url)),
    [path, String(seed)],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    },
  );
  const { url } = await waitMessage(child, (message) => message.url);
  return { child, url };
}
async function stop(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolveExit) => {
    server.child.once("exit", resolveExit);
  });
  server.child.kill();
  await exited;
}
async function control(server, message) {
  const received = waitMessage(
    server.child,
    (result) => result.control === message,
  );
  server.child.send(message);
  await received;
}
const view = async (server) => (await fetch(server.url + "/api/state")).json();
const idle = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById("conversation").getAttribute("aria-busy") ===
      "false",
  );
const post = (server, body) =>
  fetch(server.url + "/api/turn", {
    method: "POST",
    headers: { Origin: server.url },
    body: JSON.stringify(body),
  });
async function typed(page, message) {
  const response = page.waitForResponse((result) =>
    result.url().endsWith("/api/turn"),
  );
  await page.locator("#message").fill(message);
  await page.locator("#message").press("Enter");
  const result = await (await response).json();
  await idle(page);
  return result;
}
async function offered(page, server, name, args, clicked = false) {
  const current = await view(server);
  const offer = current.actions.find(
    (option) =>
      option.call.name === name &&
      JSON.stringify(JSON.parse(option.call.argumentsJson)) ===
        JSON.stringify(args),
  );
  assert.ok(offer, JSON.stringify(args));
  if (!clicked) {
    const result = await typed(page, offer.message);
    assert.equal(result.committed, true, JSON.stringify(result));
    return result;
  }
  const npc = current.scene.room.npcs.find(
    (actor) => offer.contextId === "npc:" + actor.id,
  );
  const target = current.scene.room.features.find(
    (feature) => offer.contextId === "target:" + feature.id,
  );
  if (npc || target) {
    await page
      .getByRole("button", { name: (npc ?? target).name, exact: true })
      .click();
  }
  if (offer.stakes) {
    assert.ok(
      (await page.locator("#context-actions").textContent()).includes(
        offer.stakes,
      ),
    );
  }
  const response = page.waitForResponse((result) =>
    result.url().endsWith("/api/turn"),
  );
  await page
    .locator("#context-actions")
    .getByRole("button", { name: offer.label, exact: true })
    .click();
  const result = await (await response).json();
  await idle(page);
  assert.equal(result.committed, true, JSON.stringify(result));
  return result;
}

test(
  "real browser proof and force offers, saved cards, stale requests and mid-confrontation automatic continuation agree with storage",
  { timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-90-browser-"));
    let browser, server;
    try {
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      for (const force of [false, true]) {
        const finals = [];
        for (const clicked of [false, true]) {
          const path = join(dir, `${force}-${clicked}.json`);
          server = await startServer(path);
          const page = await browser.newPage();
          await page.goto(server.url);
          await idle(page);
          await page.locator("#start").click();
          await idle(page);
          const opening = await view(server);
          assert.ok(!JSON.stringify(opening.scene).includes("Vey"));
          if (!force) {
            for (const message of [
              "Travel to Watch Loft",
              "Travel to Signal Records Room",
              "Search beacon setting plate",
              "Take spare signal component",
              "Travel to Watch Loft",
              "Travel to Watch Yard",
            ]) {
              assert.equal(
                (await typed(page, message)).committed,
                true,
                message,
              );
            }
          }
          for (const message of [
            "Travel to Valley Road",
            "Travel to Ridge Shelter",
            "Travel to Drainage Walk",
            "Travel to Beacon Tower",
          ]) {
            assert.equal((await typed(page, message)).committed, true, message);
          }
          const arriving = await view(server);
          assert.equal(arriving.scene.outcome, "playing");
          assert.ok(
            !arriving.actions.some((offer) =>
              offer.message.includes("Hold the beacon"),
            ),
          );
          await page.locator("#open-hints").click();
          assert.match(
            await page.locator("#information").textContent(),
            /tower work order/i,
          );
          const unavailable = await typed(
            page,
            "Fit spare signal component in beacon socket",
          );
          assert.equal(unavailable.committed, false);
          assert.deepEqual(
            JSON.parse(readFileSync(path)).checkpoint.state.items,
            force
              ? { "signal-component": "room" }
              : { "signal-component": "inventory" },
          );
          if (force) {
            const attackOffer = arriving.actions.find(
              (offer) =>
                offer.call.name === "attack" &&
                JSON.parse(offer.call.argumentsJson).opponent_id === "vey",
            );
            assert.match(attackOffer.stakes, /0 HP.*defeat.*no retreat/s);
            if (clicked) {
              await page
                .getByRole("button", { name: "Vey", exact: true })
                .click();
              await control(server, "hold");
              const committed = waitMessage(
                server.child,
                (message) => message.committed,
              );
              await page
                .locator("#context-actions")
                .getByRole("button", { name: "Attack (1 action)", exact: true })
                .click();
              await committed;
              const saved = JSON.parse(readFileSync(path)).checkpoint;
              assert.ok(saved.state.combat);
              await stop(server);
              server = await startServer(path);
              await page.goto(server.url);
              await idle(page);
              assert.deepEqual(
                JSON.parse(readFileSync(path)).checkpoint,
                saved,
              );
              const resumed = await view(server);
              assert.equal(resumed.scene.combat.opponentId, "vey");
              assert.equal(resumed.character.hp, saved.state.fighter.hp);
            } else {
              await offered(page, server, "attack", { opponent_id: "vey" });
            }
            const inCombat = await view(server);
            assert.ok(inCombat.scene.combat);
            assert.ok(
              !inCombat.actions.some((offer) =>
                ["talk", "move", "search", "place_item"].includes(
                  offer.call.name,
                ),
              ),
            );
            while ((await view(server)).scene.combat) {
              const result = await offered(
                page,
                server,
                "attack",
                { opponent_id: "vey" },
                clicked,
              );
              assert.match(JSON.stringify(result.cards), /attack|damage|HP/i);
            }
            const dead = await view(server);
            assert.equal(
              dead.scene.room.npcs.find((actor) => actor.id === "vey")
                .condition,
              "dead",
            );
            assert.ok(
              !dead.actions.some(
                (offer) =>
                  offer.call.name === "talk" &&
                  JSON.parse(offer.call.argumentsJson).speakerId === "vey",
              ),
            );
            await offered(
              page,
              server,
              "search",
              { target: "control-access" },
              clicked,
            );
          } else {
            await offered(
              page,
              server,
              "talk",
              { speakerId: "vey", topicId: "stand-down", approach: "persuade" },
              clicked,
            );
            const check = JSON.parse(readFileSync(path)).checkpoint.state
              .socialChallenges["vey-stand-down"];
            assert.equal(check.result, "failure");
            assert.ok(
              !(await view(server)).scene.room.features.some(
                (feature) => feature.id === "final-warning-board",
              ),
            );
            await offered(
              page,
              server,
              "search",
              { target: "tower-work-order" },
              clicked,
            );
            const before = await view(server);
            const proof = before.actions.find(
              (offer) =>
                offer.call.name === "talk" &&
                JSON.parse(offer.call.argumentsJson).topicId ===
                  "plate-proof" &&
                JSON.parse(offer.call.argumentsJson).approach === "ask",
            );
            if (clicked) {
              await control(server, "fail");
            }
            const result = await offered(
              page,
              server,
              "talk",
              { speakerId: "vey", topicId: "plate-proof", approach: "ask" },
              clicked,
            );
            assert.match(
              JSON.stringify(result.cards),
              /stand aside without a fight/,
            );
            assert.equal((await view(server)).history.at(-1).speaker, "Vey");
            const checkpoint = JSON.parse(readFileSync(path)).checkpoint;
            assert.equal(
              (
                await post(server, {
                  revision: before.revision,
                  optionId: proof.id,
                })
              ).status,
              409,
            );
            assert.deepEqual(
              JSON.parse(readFileSync(path)).checkpoint,
              checkpoint,
            );
            await stop(server);
            server = await startServer(path);
            await page.goto(server.url);
            await idle(page);
            assert.deepEqual(
              JSON.parse(readFileSync(path)).checkpoint,
              checkpoint,
            );
            await offered(page, server, "place_item", {
              item_id: "signal-component",
              target: "beacon-socket",
            });
            assert.equal(
              (await typed(page, "Fit spare signal component in beacon socket"))
                .committed,
              false,
            );
          }
          await offered(
            page,
            server,
            "search",
            { target: "final-warning-board" },
            clicked,
          );
          const ready = await view(server);
          assert.equal(ready.scene.outcome, "playing");
          assert.equal(await page.locator("#message").isEnabled(), true);
          assert.ok(
            ready.actions.some((offer) =>
              offer.message.includes("Hold the beacon"),
            ),
          );
          assert.ok(ready.actions.some((offer) => offer.call.name === "move"));
          await page.locator("#open-journal").click();
          assert.match(
            await page.locator("#information").textContent(),
            /Final warning decision/,
          );
          await page.reload();
          await idle(page);
          assert.deepEqual((await view(server)).history, ready.history);
          finals.push(JSON.parse(readFileSync(path)).checkpoint);
          await page.close();
          await stop(server);
        }
        assert.deepEqual(finals[0], finals[1]);
      }
    } finally {
      if (server) {
        await stop(server);
      }
      await browser?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "real browser watch alliance uses a living warrant source and physical proof survives that actor's death",
  { timeout: 90000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-90-alliance-"));
    let server, browser;
    try {
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      for (const killAlly of [false, true]) {
        const path = join(dir, `${killAlly}.json`);
        server = await startServer(path);
        const page = await browser.newPage();
        await page.goto(server.url);
        await idle(page);
        await page.locator("#start").click();
        await idle(page);
        for (const message of [
          "Travel to Keeper's Path",
          "Search damaged shutter latch",
          "Travel to Watch Yard",
        ]) {
          assert.equal((await typed(page, message)).committed, true);
        }
        await offered(
          page,
          server,
          "talk",
          { speakerId: "iona", topicId: "relay-warning", approach: "ask" },
          true,
        );
        await offered(
          page,
          server,
          "talk",
          { speakerId: "iona", topicId: "tower-warrant", approach: "ask" },
          true,
        );
        if (killAlly) {
          await offered(page, server, "attack", { opponent_id: "iona" }, true);
          while ((await view(server)).scene.combat) {
            await offered(
              page,
              server,
              "attack",
              { opponent_id: "iona" },
              true,
            );
          }
          assert.equal(
            (await view(server)).scene.room.npcs.find(
              (actor) => actor.id === "iona",
            ).condition,
            "dead",
          );
          for (const message of [
            "Travel to Watch Loft",
            "Travel to Signal Records Room",
            "Search beacon setting plate",
            "Travel to Watch Loft",
            "Travel to Watch Yard",
          ]) {
            assert.equal((await typed(page, message)).committed, true);
          }
        }
        for (const message of [
          "Travel to Valley Road",
          "Travel to Ridge Shelter",
          "Travel to Drainage Walk",
          "Travel to Beacon Tower",
        ]) {
          assert.equal((await typed(page, message)).committed, true);
        }
        const arrival = await view(server);
        const alliances = arrival.actions.filter(
          (offer) =>
            offer.call.name === "talk" &&
            JSON.parse(offer.call.argumentsJson).topicId === "watch-alliance",
        );
        assert.equal(alliances.length > 0, !killAlly);
        if (killAlly) {
          const rejected = await typed(
            page,
            'Ask Vey about "Present Iona\'s intervention warrant".',
          );
          assert.equal(rejected.committed, false);
          await offered(
            page,
            server,
            "search",
            { target: "tower-work-order" },
            true,
          );
          await offered(
            page,
            server,
            "talk",
            { speakerId: "vey", topicId: "plate-proof", approach: "ask" },
            true,
          );
        } else {
          const result = await offered(
            page,
            server,
            "talk",
            { speakerId: "vey", topicId: "watch-alliance", approach: "ask" },
            true,
          );
          assert.match(
            JSON.stringify(result.cards),
            /compliance, not a confession/,
          );
        }
        await offered(
          page,
          server,
          "search",
          { target: "final-warning-board" },
          true,
        );
        const beforeRestart = await view(server);
        assert.equal(beforeRestart.scene.outcome, "playing");
        assert.equal(beforeRestart.character.collectedItems.length, 0);
        assert.equal(beforeRestart.history.at(-2).speaker, "Vey");
        assert.ok(
          !beforeRestart.actions.some(
            (offer) => offer.call.name === "place_item",
          ),
        );
        assert.ok(
          !beforeRestart.actions.some((offer) =>
            offer.message.includes("Light the beacon"),
          ),
        );
        const saved = JSON.parse(readFileSync(path)).checkpoint;
        await stop(server);
        server = await startServer(path);
        await page.goto(server.url);
        await idle(page);
        assert.deepEqual(JSON.parse(readFileSync(path)).checkpoint, saved);
        assert.deepEqual((await view(server)).history, beforeRestart.history);
        assert.equal(await page.locator("#message").isEnabled(), true);
        await page.close();
        await stop(server);
      }
    } finally {
      if (server) {
        await stop(server);
      }
      await browser?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
