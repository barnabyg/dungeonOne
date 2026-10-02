import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { chromium } from "playwright";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createSeededRandom } from "../dist/random.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";
import { FINALE_SCHEMA } from "../dist/finale-schema.js";

const file = "adventures/hollow-beacon-finale.json";
const routes = JSON.parse(readFileSync("docs/acceptance/issue-91-seeds.json"));
function runtime() {
  const loaded = loadAdventure(readFileSync(file));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}
function walk(game, commands, random, state = game.createSession()) {
  for (const command of commands) {
    const result = game.handleAction(state, game.parseCommand(command), random);
    assert.ok(!result.rejection, command + ": " + game.renderResult(result));
    state = result.state;
  }
  return state;
}
const noDice = {
  roll() {
    throw new Error("Unexpected roll after completion");
  },
};
test("named seeded finale witnesses freeze truthful late, failed social, missing item, casualty, avoided fight and on-time outcomes", () => {
  for (const route of routes) {
    const game = runtime();
    const state = walk(game, route.commands, createSeededRandom(route.seed));
    assert.equal(state.status, "victory", route.name);
    assert.equal(state.ending.fate, "keeper-unconfirmed");
    assert.match(state.ending.narration, /no confirmed rescue or death/);
    if (route.name.startsWith("on-time")) {
      assert.ok(state.ending.consequences.includes("on-time"));
      assert.ok(!state.ending.consequences.includes("late-arrival"));
    } else {
      assert.ok(state.ending.consequences.includes("late-arrival"));
    }
    if (route.name.includes("casualty")) {
      assert.ok(state.ending.casualties.includes("vey"));
      assert.ok(state.ending.consequences.includes("vey-casualty"));
    }
    if (route.name.includes("avoided")) {
      assert.equal(state.monsters["ridge-raider"].hp, 18);
      assert.ok(!state.ending.consequences.includes("raider-defeated"));
    }
    if (route.name.includes("failed-social")) {
      assert.equal(state.socialChallenges["vey-stand-down"].result, "failure");
    }
    for (const command of [
      "resolve human warning",
      "attack vey",
      "move drainage-walk",
      "wait days 1",
      "use component at socket",
    ]) {
      const result = game.handleAction(
        state,
        game.parseCommand(command),
        noDice,
      );
      assert.ok(result.rejection, command);
      assert.deepEqual(result.state, state);
    }
    for (const command of ["look", "journal", "status", "inventory"]) {
      const result = game.handleAction(
        state,
        game.parseCommand(command),
        noDice,
      );
      assert.ok(!result.rejection);
      assert.deepEqual(result.state, state);
    }
  }
});
function callFor(game, command) {
  const action = game.parseCommand(command);
  switch (action.type) {
    case "move":
      return [
        "move",
        { destinationId: action.destination.replaceAll(" ", "-") },
      ];
    case "search":
      return ["search", { target: action.target.replaceAll(" ", "-") }];
    case "talk":
      return [
        "talk",
        {
          speakerId: action.target,
          topicId: action.topic.replaceAll(" ", "-"),
          approach: action.approach,
        },
      ];
    case "take":
      return ["take", { item_id: "signal-component" }];
    case "place":
    case "use":
      return [
        "place_item",
        { item_id: "signal-component", target: "beacon-socket" },
      ];
    case "resolve":
      return [
        "resolve_quest",
        {
          resolutionId: game.content.snapshot.endings.choices.find((c) =>
            [c.label, ...c.aliases].some(
              (a) => a.toLowerCase() === action.target,
            ),
          ).id,
        },
      ];
    default:
      throw new Error("Unsupported scripted command: " + command);
  }
}
test("finales persist across command/scripted-AI restart with exact state/RNG and linked replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-91-replay-"));
  const cli = (args, input, script) => {
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
    for (const route of routes.slice(0, 3)) {
      const checkpoints = [];
      for (const ai of [false, true]) {
        const stem = join(dir, route.name + ai),
          save = stem + ".json",
          first = stem + "-first.json",
          last = stem + "-last.json",
          script = stem + "-script.json";
        const game = runtime();
        const run = (commands, args) => {
          if (ai) {
            writeFileSync(
              script,
              JSON.stringify(
                commands.flatMap((command) => {
                  const [name, argumentsObject] = callFor(game, command);
                  return [
                    {
                      toolCalls: [
                        {
                          id: "intent",
                          name,
                          argumentsJson: JSON.stringify(argumentsObject),
                        },
                      ],
                    },
                    { text: "Read the engine result." },
                  ];
                }),
              ),
            );
          }
          return cli(
            [...args, ...(ai ? ["--ai"] : [])],
            commands
              .map((c) =>
                c === "use component at socket" && ai
                  ? "Fit spare signal component in beacon socket"
                  : c,
              )
              .join("\n") + "\n",
            ai ? script : undefined,
          );
        };
        run(route.commands.slice(0, -1), [
          "--adventure-file",
          resolve(file),
          "--seed",
          String(route.seed),
          "--save",
          save,
          "--trace",
          first,
        ]);
        assert.equal(
          JSON.parse(readFileSync(save)).checkpoint.state.status,
          "playing",
        );
        run(route.commands.slice(-1), [
          "--resume",
          save,
          "--trace",
          last,
          "--previous-trace",
          first,
        ]);
        assert.match(
          cli(["--replay", first, last], ""),
          /Trace verified successfully/,
        );
        const checkpoint = JSON.parse(readFileSync(save)).checkpoint;
        assert.equal(checkpoint.state.status, "victory");
        checkpoints.push(checkpoint);
      }
      assert.deepEqual(checkpoints[0], checkpoints[1]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("finale tuple validates independently and every released Hollow Beacon tuple stays readable", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v16.schema.json")),
    FINALE_SCHEMA,
  );
  for (const name of [
    "watch",
    "refugees",
    "trust",
    "threat",
    "recovery",
    "component",
    "confrontation",
  ]) {
    const loaded = loadAdventure(
      readFileSync(`adventures/hollow-beacon-${name}.json`),
    );
    assert.equal(loaded.ok, true);
    assert.notEqual(loaded.adventure.snapshot.contentVersion, "11");
  }
  const changed = JSON.parse(readFileSync(file));
  changed.rulesVersion = "chapel-clues-rules-v16";
  assert.equal(loadAdventure(JSON.stringify(changed)).ok, false);
});

const view = async (server) => (await fetch(server.url + "/api/state")).json();
const post = (server, path, body) =>
  fetch(server.url + path, {
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
test(
  "real browser finale commits once, loses reply safely, restarts Review, and atomically replaces history/hints while stale tabs reject",
  { timeout: 90000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-91-browser-"));
    let browser, server;
    try {
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      const pairs = new Map();
      for (const ending of [
        "verified-safe-signal",
        "human-warning",
        "urgent-risky-signal",
      ]) {
        for (const typed of [false, true]) {
          const savePath = join(dir, ending + typed + ".json");
          const intents = new Map();
          let calls = 0,
            fail = false;
          const model = {
            async respond(request) {
              calls++;
              if (request.toolResults.length || request.reply) {
                if (fail) {
                  throw new Error("Lost post-commit reply");
                }
                return {
                  text: request.reply
                    ? JSON.stringify({
                        opening: "none",
                        closing: "none",
                        factIds: request.reply.approvedFacts.map((f) => f.id),
                      })
                    : "Read the engine result.",
                };
              }
              const intent = intents.get(request.playerInput);
              if (intent) {
                return { toolCalls: [{ id: "intent", ...intent }] };
              }
              const choice = request.scene.endingChoices?.find(
                (c) => request.playerInput === "Resolve " + c.label,
              );
              return choice
                ? {
                    toolCalls: [
                      {
                        id: "finale",
                        name: "resolve_quest",
                        argumentsJson: JSON.stringify({
                          resolutionId: choice.id,
                        }),
                      },
                    ],
                  }
                : { text: "Which final warning do you choose?" };
            },
          };
          const options = {
            contentVersion: "11",
            seed: 0,
            savePath,
            apiKey: "offline",
            dmModel: model,
          };
          server = await startBrowserServer(options);
          const page = await browser.newPage();
          await page.goto(server.url);
          await idle(page);
          await page.locator("#start").click();
          await idle(page);
          const commands = routes[0].commands.slice(0, -1);
          for (const command of commands) {
            const ready = await view(server),
              [name, args] = callFor(runtime(), command);
            const offer = ready.actions.find(
              (o) =>
                o.call.name === name &&
                Object.entries(args).every(
                  ([key, value]) =>
                    JSON.parse(o.call.argumentsJson)[key] === value,
                ),
            );
            assert.ok(offer, command);
            intents.set(offer.message, offer.call);
            assert.equal(
              (
                await (
                  await post(server, "/api/turn", {
                    revision: ready.revision,
                    optionId: offer.id,
                  })
                ).json()
              ).committed,
              true,
            );
          }
          await page.reload();
          await idle(page);
          const ready = await view(server);
          assert.equal(ready.scene.endingChoices.length, 3);
          assert.ok(
            ready.actions
              .filter((a) => a.call.name === "resolve_quest")
              .every((a) => a.stakes),
          );
          // Ambiguous typed wording returns clarification without touching canon.
          await page.locator("#message").fill("Warn them");
          let response = page.waitForResponse((r) =>
            r.url().endsWith("/api/turn"),
          );
          await page.locator("#message").press("Enter");
          assert.equal((await (await response).json()).committed, false);
          await idle(page);
          const current = await view(server),
            before = JSON.parse(readFileSync(savePath)).checkpoint;
          assert.deepEqual(
            before.state,
            (await SaveSession.load(savePath)).state,
          );
          const stale = await browser.newPage();
          await stale.goto(server.url);
          await idle(stale);
          const choice = current.actions.find(
            (o) =>
              o.call.name === "resolve_quest" &&
              JSON.parse(o.call.argumentsJson).resolutionId === ending,
          );
          intents.set(choice.message, choice.call);
          fail = true;
          response = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
          if (typed) {
            await page.locator("#message").fill(choice.message);
            await page.locator("#message").press("Enter");
          } else {
            await page
              .getByRole("button", { name: "Ending choices", exact: true })
              .click();
            await page
              .locator("#context-actions")
              .getByRole("button", { name: choice.label, exact: true })
              .click();
          }
          assert.equal((await (await response).json()).committed, true);
          await idle(page);
          const finalCheckpoint = JSON.parse(readFileSync(savePath)).checkpoint;
          assert.equal(finalCheckpoint.state.ending.id, ending);
          if (typed) {
            assert.deepEqual(finalCheckpoint, pairs.get(ending));
          } else {
            pairs.set(ending, finalCheckpoint);
          }
          const completed = await view(server),
            durable = readFileSync(savePath, "utf8"),
            count = calls;
          assert.equal(completed.scene.outcome, "victory");
          assert.equal(await page.locator("#message").isDisabled(), true);
          assert.match(
            await page.locator("#session").textContent(),
            /Review mode/,
          );
          assert.equal(
            (
              await post(server, "/api/turn", {
                revision: current.revision,
                optionId: choice.id,
              })
            ).status,
            409,
          );
          assert.equal(readFileSync(savePath, "utf8"), durable);
          assert.equal(calls, count);
          await server.close();
          server = await startBrowserServer(options);
          await page.goto(server.url);
          await idle(page);
          assert.deepEqual((await view(server)).history, completed.history);
          assert.deepEqual((await view(server)).scene, completed.scene);
          for (const panel of ["journal", "character", "inventory", "hints"]) {
            await page.locator("#open-" + panel).click();
            if (panel === "hints") {
              assert.match(
                await page.locator("#information-body").textContent(),
                /Further AI interaction and hints are closed/,
              );
            }
          }
          await page.locator("#new-game").click();
          await page.locator("#cancel-new-game").click();
          assert.equal(readFileSync(savePath, "utf8"), durable);
          await page.locator("#new-game").click();
          await page.locator("#confirm-new-game").click();
          await idle(page);
          const fresh = await view(server);
          assert.deepEqual(fresh.history, []);
          assert.equal(fresh.scene.outcome, "playing");
          assert.equal(fresh.strongerHints, undefined);
          assert.notEqual(fresh.revision, completed.revision);
          assert.equal(
            (
              await post(server, "/api/turn", {
                revision: current.revision,
                optionId: choice.id,
              })
            ).status,
            409,
          );
          assert.deepEqual((await view(server)).history, []);
          await stale.close();
          await page.close();
          await server.close();
          server = undefined;
        }
      }
    } finally {
      await server?.close();
      await browser?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
