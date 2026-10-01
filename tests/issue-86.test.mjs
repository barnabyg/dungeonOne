import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { CLAIM_SCHEMA } from "../dist/claim-schema.js";

const adventure = resolve("adventures/hollow-beacon-trust.json");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const claimArgs = {
  speakerId: "iona",
  topicId: "safe-signal",
  approach: "persuade",
};
const correctionArgs = {
  speakerId: "iona",
  topicId: "correct-signal",
  approach: "ask",
};
const call = (args) => ({ name: "talk", argumentsJson: JSON.stringify(args) });
const route = [
  "move watch-loft",
  "move signal-records",
  "search setting-plate",
  "move watch-loft",
  "move watch-yard",
];
function runtime() {
  const loaded = loadAdventure(readFileSync(adventure));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}
test("one remembered claim changes only Iona; evidence restores trust after acceptance or refusal", () => {
  assert.deepEqual(read("schema/adventure-v11.schema.json"), CLAIM_SCHEMA);
  for (const die of [1, 20]) {
    const game = runtime();
    const initial = game.createSession();
    let draws = 0;
    const random = {
      roll: () => {
        draws++;
        return die;
      },
    };
    const act = (state, command) =>
      game.handleAction(state, game.parseCommand(command), random);
    const result = act(initial, "talk iona safe-signal persuade");
    let state = result.state;
    assert.equal(draws, 1);
    assert.match(
      game.renderResult(result),
      new RegExp(`d20 ${die}.*DC 12.*${die === 20 ? "success" : "failure"}`),
    );
    assert.equal(
      state.relationships.iona.tier,
      die === 20 ? "trusted" : "hostile",
    );
    for (const key of [
      "clocks",
      "npcLocations",
      "npcHealth",
      "items",
      "monsters",
    ]) {
      assert.deepEqual(state[key], initial[key]);
    }
    assert.deepEqual(state.relationships.sera, initial.relationships.sera);
    assert.deepEqual(state.relationships.pell, initial.relationships.pell);
    assert.equal(
      state.socialChallenges["iona-safe-signal"].result,
      die === 20 ? "success" : "failure",
    );
    assert.equal(
      game
        .projectDmScene(state)
        .room.npcs[0].subjects.some((x) => x.id === "safe-signal"),
      false,
    );
    assert.deepEqual(act(state, "talk iona safe-signal deceive").state, state);
    assert.deepEqual(act(state, "talk iona correct-signal ask").state, state);
    assert.equal(draws, 1);
    assert.match(
      game.renderResult(act(state, "talk iona response ask")),
      die === 20 ? /believe your assurance/ : /refused your assurance/,
    );
    for (const command of route) {
      state = act(state, command).state;
    }
    state = act(state, "talk iona correct-signal ask").state;
    assert.equal(draws, 1);
    assert.equal(state.relationships.iona.tier, "trusted");
    assert.match(state.relationships.iona.reason, /correcting/);
    assert.match(
      game.renderResult(act(state, "talk iona response ask")),
      /no longer believe/,
    );
    const journal = game.projectDmScene(state).journal.discoveries;
    if (die === 20) {
      assert.equal(
        journal.find((x) => x.id === "iona-signal-belief").classification,
        "belief",
      );
    }
    assert.equal(
      journal.find((x) => x.id === "altered-setting").classification,
      "observation",
    );
    assert.equal(
      journal.find((x) => x.id === "iona-evidence-correction").classification,
      "testimony",
    );
    assert.match(
      journal.find(
        (x) =>
          x.id === (die === 20 ? "iona-signal-belief" : "iona-claim-refusal"),
      ).actionableLead,
      /historical/,
    );
    state = act(state, "move refugee-camp").state;
    const sera = game.renderResult(act(state, "talk sera response ask"));
    assert.doesNotMatch(sera, /safe-signal|Iona accepted|your correction/);
  }
});
test("ambiguous, compound, hidden, dead, stale and wrong-approach AI social intents preserve state and dice", () => {
  const game = runtime(),
    state = game.createSession();
  const random = {
    roll: () => {
      throw new Error("Rejected intent drew dice");
    },
  };
  for (const input of [
    "Convince the watch.",
    "Maybe persuade Iona the familiar signal is safe.",
    "Tell Iona the familiar signal is safe and travel to the loft.",
    "Tell Iona the familiar signal is safe. Move watch-loft.",
    "Tell Iona and Sera the familiar signal is safe.",
    "Should I tell Iona the familiar signal is safe?",
    "Do not tell Iona the familiar signal is safe.",
  ]) {
    const result = game.dispatchGameTool(state, call(claimArgs), random, input);
    assert.equal(result.modelOutput.ok, false, input);
    assert.deepEqual(result.state, state);
  }
  for (const [s, args, input] of [
    [
      state,
      { ...claimArgs, approach: "ask" },
      "Tell Iona the familiar signal is safe.",
    ],
    [state, correctionArgs, "Correct Iona with the setting plate correction."],
    [
      { ...state, locationId: "refugee-camp" },
      claimArgs,
      "Tell Iona the familiar signal is safe.",
    ],
    [
      {
        ...state,
        npcHealth: { ...state.npcHealth, iona: { hp: 0, maxHp: 12 } },
        npcDeathLocations: { iona: "watch-yard" },
      },
      claimArgs,
      "Tell Iona the familiar signal is safe.",
    ],
  ]) {
    const result = game.dispatchGameTool(s, call(args), random, input);
    assert.equal(result.modelOutput.ok, false);
    assert.deepEqual(result.state, s);
  }
  const accepted = game.dispatchGameTool(
    state,
    call(claimArgs),
    { roll: () => 20 },
    "Tell Captain Iona the familiar signal is safe.",
  );
  assert.equal(accepted.modelOutput.ok, true);
  assert.equal(
    game.dispatchGameTool(
      accepted.state,
      call(claimArgs),
      random,
      "Convince Iona the familiar signal is safe.",
    ).modelOutput.ok,
    false,
  );
});
function cli(input, args) {
  const result = spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
test("split-session acceptance and refusal corrections equal uninterrupted state/RNG and replay", () => {
  const dir = mkdtempSync(join(tmpdir(), "dungeon-86-trace-"));
  try {
    for (const seed of [0, 1]) {
      const save = join(dir, `${seed}.json`),
        whole = join(dir, `${seed}-whole.json`),
        first = join(dir, `${seed}-first.json`),
        second = join(dir, `${seed}-second.json`);
      const prefix = "talk iona safe-signal persuade\n",
        suffix = route.join("\n") + "\ntalk iona correct-signal ask\njournal\n";
      const args = ["--adventure-file", adventure, "--seed", String(seed)];
      cli(prefix, [...args, "--save", save, "--trace", first]);
      assert.equal(
        read(save).checkpoint.state.socialChallenges["iona-safe-signal"].result,
        seed === 0 ? "failure" : "success",
      );
      const out = cli(suffix, [
        "--resume",
        save,
        "--trace",
        second,
        "--previous-trace",
        first,
      ]);
      assert.match(out, /Iona corrected the safe-signal belief \[testimony/);
      cli(prefix + suffix, [...args, "--save", whole]);
      assert.deepEqual(read(save).checkpoint, read(whole).checkpoint);
      assert.match(
        cli("", ["--replay", first, second]),
        /Trace verified successfully/,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const view = async (server) => (await fetch(server.url + "/api/state")).json();
const post = (server, body, path = "/api/turn") =>
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
function modelFor(expected) {
  return {
    async respond(request) {
      expected.calls++;
      if ("reply" in request) {
        if (expected.fail) {
          expected.fail = false;
          throw new Error("Narration unavailable after saved check");
        }
        if (expected.hold) {
          expected.entered();
          await expected.hold;
        }
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
        return { text: "Read the engine result." };
      }
      assert.equal(request.playerInput, expected.message);
      return { toolCalls: [{ ...expected.call, id: "intent" }] };
    },
  };
}
async function start(page, server) {
  await page.goto(server.url);
  await idle(page);
  if (await page.locator("#start").isVisible()) {
    await page.locator("#start").click();
    await idle(page);
  }
}
async function act(page, server, expected, name, args, clicked) {
  const before = await view(server);
  const action = before.actions.find(
    (x) =>
      x.call.name === name &&
      JSON.stringify(JSON.parse(x.call.argumentsJson)) === JSON.stringify(args),
  );
  assert.ok(action, JSON.stringify(args));
  Object.assign(expected, action);
  if (clicked && name === "talk") {
    await page
      .getByRole("button", { name: "Captain Iona", exact: true })
      .click();
    if (args.topicId === "safe-signal") {
      assert.match(
        await page.locator("#context-actions").textContent(),
        /d20.*DC 12.*without rerolls/,
      );
    }
    if (args.topicId === "correct-signal") {
      assert.match(
        await page.locator("#context-actions").textContent(),
        /No dice/,
      );
    }
  }
  const response = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  if (clicked) {
    const label =
      name === "move"
        ? before.scene.room.exits.find(
            (x) => x.destinationId === args.destinationId,
          ).name
        : action.label;
    await page
      .locator(name === "move" ? "#exits" : "#context-actions")
      .getByRole("button", { name: label, exact: true })
      .click();
  } else {
    await page.locator("#message").fill(action.message);
    await page.locator("#message").press("Enter");
  }
  const result = await (await response).json();
  assert.equal(result.committed, true, JSON.stringify(result));
  await idle(page);
  return view(server);
}
test(
  "real browser typed/clicked checks, stale claims, saved narration failure, automatic continuation and correction agree",
  { timeout: 120000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dungeon-86-browser-"));
    const browser = await chromium.launch(
      process.platform === "win32" ? { channel: "msedge" } : {},
    );
    let server;
    try {
      const checkpoints = [];
      for (const clicked of [false, true]) {
        const expected = { calls: 0, fail: true };
        const savePath = join(dir, `${clicked}.json`);
        const options = {
          contentVersion: "6",
          seed: 1,
          apiKey: "offline",
          savePath,
          dmModel: modelFor(expected),
        };
        server = await startBrowserServer(options);
        const page = await browser.newPage();
        await start(page, server);
        const original = await view(server),
          oldClaim = original.actions.find(
            (x) => JSON.parse(x.call.argumentsJson).topicId === "safe-signal",
          );
        const claimed = await act(
          page,
          server,
          expected,
          "talk",
          claimArgs,
          clicked,
        );
        assert.match(
          claimed.history[0].cards.map((x) => x.text).join("\n"),
          /d20 13.*DC 12.*success/,
        );
        assert.equal(
          read(savePath).checkpoint.state.relationships.iona.tier,
          "trusted",
        );
        assert.match(
          claimed.history[0].reply,
          /Iona|action resolved|interrupted/i,
        );
        assert.match(claimed.history[0].notice, /saved/);
        const checkpoint = read(savePath).checkpoint,
          calls = expected.calls;
        const stale = await post(server, {
          optionId: oldClaim.id,
          revision: original.revision,
        });
        assert.equal(stale.status, 409);
        assert.equal(expected.calls, calls);
        assert.deepEqual(read(savePath).checkpoint, checkpoint);
        // A retry with a current revision still cannot repeat an obsolete tool.
        Object.assign(expected, {
          message: oldClaim.message,
          call: oldClaim.call,
        });
        await post(server, {
          message: oldClaim.message,
          revision: (await view(server)).revision,
        });
        assert.deepEqual(read(savePath).checkpoint, checkpoint);
        const saved = await view(server);
        const closed = server;
        server = undefined;
        await closed.close();
        const resumeCalls = expected.calls;
        server = await startBrowserServer(options);
        await start(page, server);
        assert.deepEqual((await view(server)).history, saved.history);
        assert.deepEqual(read(savePath).checkpoint, checkpoint);
        assert.equal(expected.calls, resumeCalls);
        const resumed = await view(server);
        assert.ok(
          !resumed.actions.some(
            (x) => JSON.parse(x.call.argumentsJson).topicId === "safe-signal",
          ),
        );
        assert.doesNotMatch(
          resumed.hints.entries.join("\n"),
          /You can Persuade Captain Iona to discuss "Claim/,
        );
        for (const destinationId of ["watch-loft", "signal-records"]) {
          await act(page, server, expected, "move", { destinationId }, clicked);
        }
        await act(
          page,
          server,
          expected,
          "search",
          { target: "setting-plate" },
          false,
        );
        for (const destinationId of ["watch-loft", "watch-yard"]) {
          await act(page, server, expected, "move", { destinationId }, clicked);
        }
        let release;
        const entered = new Promise((resolve) => {
          expected.entered = resolve;
        });
        const heldReply = new Promise((resolve) => {
          release = resolve;
        });
        // This test owns the provider and serializes intent setup before dispatch.
        Object.assign(expected, { hold: heldReply });
        const correcting = act(
          page,
          server,
          expected,
          "talk",
          correctionArgs,
          clicked,
        );
        await entered;
        try {
          const pending = await view(server);
          assert.equal(await page.locator("#message").isDisabled(), true);
          assert.ok(
            read(savePath).checkpoint.state.milestones.includes(
              "iona-claim-corrected",
            ),
          );
          assert.equal(
            (
              await post(
                server,
                {
                  confirmed: true,
                  seed: pending.newGameSeed,
                  revision: pending.revision,
                },
                "/api/new-game",
              )
            ).status,
            409,
          );
          assert.equal((await view(server)).generation, pending.generation);
        } finally {
          release();
        }
        const corrected = await correcting;
        const last = corrected.history.at(-1);
        assert.equal(last.speaker, "Captain Iona");
        assert.match(last.reply, /withdraw any acceptance/);
        assert.doesNotMatch(last.cards.map((x) => x.text).join("\n"), /d20/);
        await page.locator("#open-journal").click();
        assert.match(
          await page.locator("#information-body").textContent(),
          /TestimonyIona corrected.*BeliefsIona accepted/s,
        );
        assert.equal(
          corrected.scene.journal.discoveries.find(
            (x) => x.id === "iona-signal-belief",
          ).classification,
          "belief",
        );
        assert.equal(
          corrected.scene.journal.discoveries.find(
            (x) => x.id === "iona-evidence-correction",
          ).classification,
          "testimony",
        );
        checkpoints.push(read(savePath).checkpoint);
        // Confirmed replacement changes generation; an old claim cannot attach to it.
        const replacement = await post(
          server,
          {
            confirmed: true,
            seed: corrected.newGameSeed,
            revision: corrected.revision,
          },
          "/api/new-game",
        );
        assert.equal(replacement.status, 200);
        const fresh = await view(server),
          afterReset = read(savePath).checkpoint,
          resetCalls = expected.calls;
        assert.notEqual(fresh.generation, corrected.generation);
        assert.equal(
          (
            await post(server, {
              optionId: oldClaim.id,
              revision: original.revision,
            })
          ).status,
          409,
        );
        assert.equal(expected.calls, resetCalls);
        assert.deepEqual(read(savePath).checkpoint, afterReset);
        assert.deepEqual((await view(server)).history, []);
        await page.close();
        const endingServer = server;
        server = undefined;
        await endingServer.close();
      }
      assert.deepEqual(checkpoints[0], checkpoints[1]);
    } finally {
      if (server) {
        await server.close();
      }
      await browser.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
