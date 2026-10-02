import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";
import { qualificationModel } from "./fixtures/qualification-model.mjs";

const launch = () =>
  chromium.launch(process.platform === "win32" ? { channel: "msedge" } : {});

test(
  "real browser clicked and typed actions have identical checkpoints, cards and RNG",
  { timeout: 60000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../docs/acceptance/issue-99-browser.mjs", import.meta.url),
        ),
        fileURLToPath(
          new URL("../node_modules/playwright/index.mjs", import.meta.url),
        ),
      ],
      { encoding: "utf8", windowsHide: true, timeout: 55000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  },
);
const state = async (server) => (await fetch(server.url + "/api/state")).json();
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
async function typed(page, message, committed = true) {
  await page.locator("#message").fill(message);
  const response = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await page.locator("#message").press("Enter");
  const result = await (await response).json();
  await idle(page);
  if (!result.error) {
    assert.equal(result.committed, committed, message);
  }
  return result;
}
async function clicked(page, server, name, args) {
  const view = await state(server);
  const action = view.actions.find(
    ({ call }) =>
      call.name === name &&
      JSON.stringify(JSON.parse(call.argumentsJson)) === JSON.stringify(args),
  );
  assert.ok(action, `${name}: ${JSON.stringify(args)}`);
  if (name !== "move") {
    const target =
      action.contextId === "ending"
        ? "Ending choices"
        : action.contextId.startsWith("npc:")
          ? view.scene.room.npcs.find(
              ({ id }) => "npc:" + id === action.contextId,
            ).name
          : view.scene.room.features.find(
              ({ id }) => "target:" + id === action.contextId,
            ).name;
    await page.getByRole("button", { name: target, exact: true }).click();
  }
  const button =
    name === "move"
      ? page.locator("#exits").getByRole("button", {
          name: view.scene.room.exits.find(
            ({ destinationId }) => destinationId === args.destinationId,
          ).name,
          exact: true,
        })
      : page
          .locator("#context-actions")
          .getByRole("button", { name: action.label, exact: true });
  const response = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await button.focus();
  await button.press("Enter");
  const result = await (await response).json();
  await idle(page);
  assert.equal(result.committed, true, action.message);
  return result;
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
  "real desktop browser qualifies saved investigation, hints, clarification, endings and replacement",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-106-browser-"));
    let browser;
    const errors = [];
    let server;
    try {
      browser = await launch();
      for (const ending of [
        "hold-beacon",
        "light-beacon",
        "refuse-watch",
        "walk-away",
      ]) {
        const savePath = join(directory, ending + ".json");
        const { model, controls } = qualificationModel();
        const options = {
          savePath,
          seed: 0,
          apiKey: "offline",
          dmModel: model,
        };
        server = await startBrowserServer(options);
        const page = await browser.newPage({
          viewport: { width: 1280, height: 720 },
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await start(page, server);
        assert.equal(
          await page.locator("#location").textContent(),
          "Watch Yard",
        );
        assert.match(await page.locator("#hp").textContent(), /20 \/ 20/);
        assert.match(await page.locator("#deadline").textContent(), /Day 3/);
        const before = await state(server);
        for (const panel of [
          "inventory",
          "character",
          "journal",
          "leads",
          "hints",
        ]) {
          if (panel === "leads") {
            await page.locator("#open-journal").click();
          }
          await page.locator("#open-" + panel).focus();
          await page.keyboard.press("Enter");
          assert.equal(
            await page
              .locator("#information-title")
              .evaluate((e) => e === document.activeElement),
            true,
          );
          assert.ok(await page.locator("#information-body").textContent());
          await page.keyboard.press("Escape");
          assert.equal(
            await page
              .locator("#open-" + (panel === "leads" ? "journal" : panel))
              .evaluate((e) => e === document.activeElement),
            true,
          );
        }
        assert.equal(controls.calls, 0);
        assert.deepEqual(await state(server), before);
        await page.locator("#open-hints").click();
        await page.locator("#request-stronger-hint").click();
        await page.waitForFunction(() =>
          document
            .getElementById("stronger-hint-result")
            .textContent.includes("Consider"),
        );
        const hints = await state(server);
        assert.equal(hints.position, 0);
        assert.equal(hints.history.length, 0);
        assert.equal(controls.calls, 0);
        await page.locator("#close-information").click();
        const question = await typed(page, "What should I do about it?", false);
        assert.equal(question.committed, false);
        assert.match(question.reply, /choose one explicitly/);
        await clicked(page, server, "talk", {
          speakerId: "iona",
          topicId: "brief",
          approach: "ask",
        });
        assert.match(
          await page.locator("#conversation").textContent(),
          /NPC dialogue · Captain Iona/,
        );
        await typed(page, "Travel to Watch Loft");
        await clicked(page, server, "move", {
          destinationId: "signal-records",
        });
        await clicked(page, server, "search", { target: "setting-plate" });
        await page.locator("#open-journal").click();
        assert.match(
          await page.locator("#information-body").textContent(),
          /Observed evidence/,
        );
        await page.locator("#close-information").click();
        await typed(page, "Travel to Watch Loft");
        await typed(page, "Travel to Watch Yard");
        await clicked(page, server, "move", { destinationId: "keeper-path" });
        await typed(page, "Search damaged shutter latch");
        await typed(page, "Travel to Watch Yard");
        await clicked(page, server, "move", { destinationId: "ridge-trail" });
        if (ending === "walk-away") {
          await clicked(page, server, "search", { target: "broken-marker" });
        } else {
          await typed(page, "Search broken marker post");
        }
        await clicked(page, server, "move", { destinationId: "beacon-tower" });
        const ready = await state(server);
        assert.match(await page.locator("#time").textContent(), /Day 2/);
        const stale = await browser.newPage();
        await start(stale, server);
        const choice = ready.actions.find(
          ({ call }) =>
            call.name === "resolve_quest" &&
            JSON.parse(call.argumentsJson).resolutionId === ending,
        );
        assert.ok(choice?.stakes);
        const result =
          ending === "light-beacon" || ending === "refuse-watch"
            ? await typed(page, choice.message)
            : await clicked(page, server, "resolve_quest", {
                resolutionId: ending,
              });
        assert.equal(result.committed, true);
        const completed = await state(server);
        assert.equal(
          (await SaveSession.load(savePath)).state.ending.id,
          ending,
        );
        assert.notEqual(completed.scene.outcome, "playing");
        assert.equal(await page.locator("#message").isDisabled(), true);
        assert.match(
          await page.locator("#session").textContent(),
          /Review mode/,
        );
        assert.match(
          result.cards.map(({ text }) => text).join(" "),
          /keeper remains missing/i,
        );
        const exactHistory = await page.locator("#conversation").innerText();
        const calls = controls.calls;
        const durable = await readFile(savePath, "utf8");
        const rejected = await typed(stale, "What happens next?");
        assert.match(rejected.error, /ended|stale/);
        const duplicate = await post(server, "/api/turn", {
          revision: ready.revision,
          optionId: choice.id,
        });
        assert.equal(duplicate.status, 409);
        assert.equal(await readFile(savePath, "utf8"), durable);
        assert.equal(controls.calls, calls);
        await page.reload();
        await idle(page);
        assert.equal(
          await page.locator("#conversation").innerText(),
          exactHistory,
        );
        await server.close();
        server = await startBrowserServer(options);
        await start(page, server);
        assert.deepEqual(await state(server), completed);
        assert.equal(
          await page.locator("#conversation").innerText(),
          exactHistory,
        );
        assert.equal(controls.calls, calls);
        await page.locator("#open-hints").click();
        assert.match(
          await page.locator("#information-body").textContent(),
          /Further AI interaction and hints are closed/,
        );
        await page.locator("#game-menu > summary").click();
        await page.locator("#new-game").click();
        assert.equal(
          await page
            .locator("#cancel-new-game")
            .evaluate((e) => e === document.activeElement),
          true,
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page
            .locator("#confirm-new-game")
            .evaluate((e) => e === document.activeElement),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(
          await page
            .locator("#new-game")
            .evaluate((e) => e === document.activeElement),
          true,
        );
        assert.equal(
          await page.locator("#conversation").innerText(),
          exactHistory,
        );
        await page.locator("#new-game").click();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await idle(page);
        assert.equal(
          await page
            .locator("#scene")
            .evaluate((e) => e === document.activeElement),
          true,
        );
        assert.equal(await page.locator("#conversation").innerText(), "");
        assert.equal(
          await page.locator("#location").textContent(),
          "Watch Yard",
        );
        assert.equal(await page.locator("#message").isDisabled(), false);
        assert.equal(await page.locator("#information").isVisible(), false);
        assert.equal((await state(server)).strongerHints, undefined);
        await page.reload();
        await idle(page);
        assert.equal(await page.locator("#conversation").innerText(), "");
        await page.close();
        await stale.close();
        await server.close();
        server = undefined;
      }
      assert.deepEqual(errors, []);
    } finally {
      await server?.close();
      await browser?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "real page preserves waiting feedback, scrolled history, duplicate protection and both provider failure boundaries",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-106-failure-"));
    const savePath = join(directory, "slot.json");
    const { model, controls } = qualificationModel();
    const server = await startBrowserServer({
      savePath,
      seed: 0,
      apiKey: "offline",
      dmModel: model,
    });
    let browser;
    let release;
    try {
      browser = await launch();
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await start(page, server);
      for (let i = 0; i < 5; i++) {
        await typed(page, "What should I do about it?", false);
      }
      controls.wait = new Promise((resolve) => {
        release = resolve;
      });
      const before = await state(server);
      const waiting = typed(page, "Travel to Watch Loft");
      await page.locator(".waiting").waitFor();
      assert.equal(await page.locator("#message").isDisabled(), true);
      assert.equal(await page.locator("#new-game").isDisabled(), true);
      const duplicate = await post(server, "/api/turn", {
        revision: before.revision,
        message: "Travel to Watch Loft",
      });
      assert.equal(duplicate.status, 409);
      await page.locator("#conversation").evaluate((e) => {
        e.scrollTop = 0;
      });
      release();
      controls.wait = undefined;
      await waiting;
      assert.equal((await state(server)).position, before.position + 1);
      assert.equal(
        await page.locator("#conversation").evaluate((e) => e.scrollTop),
        0,
      );
      controls.failure = "before";
      const pre = await typed(page, "Travel to Signal Records Room", false);
      assert.equal(pre.committed, false);
      assert.match(
        await page.locator("#feedback").textContent(),
        /No action was committed/,
      );
      assert.equal(await page.locator("#location").textContent(), "Watch Loft");
      controls.failure = "after";
      const postCommit = await typed(page, "Travel to Signal Records Room");
      assert.equal(postCommit.committed, true);
      assert.match(
        await page.locator("#feedback").textContent(),
        /saved; do not repeat/,
      );
      assert.equal(
        await page.locator("#location").textContent(),
        "Signal Records Room",
      );
      const exact = await page.locator("#conversation").innerText();
      const calls = controls.calls;
      await page.reload();
      await idle(page);
      assert.equal(await page.locator("#conversation").innerText(), exact);
      assert.equal(controls.calls, calls);
      for (const [width, height] of [
        [1280, 720],
        [1920, 1080],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        const composer = await page.locator("#turn").boundingBox();
        assert.ok(
          composer.x >= 0 &&
            composer.x + composer.width <= width &&
            composer.y + composer.height <= height,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
    } finally {
      release?.();
      await browser?.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
