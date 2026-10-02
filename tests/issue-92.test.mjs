import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";
import { journey, journeyModel } from "./fixtures/journey-92.mjs";

const read = (path) => JSON.parse(readFileSync(path));
const view = async (server) => (await fetch(server.url + "/api/state")).json();
const idle = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById("conversation").getAttribute("aria-busy") ===
      "false",
  );
async function typed(page, message) {
  await page.locator("#message").fill(message);
  const reply = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await page.locator("#message").press("Enter");
  const result = await (await reply).json();
  await idle(page);
  return result;
}
async function clickAction(page, server, name, args) {
  const current = await view(server);
  const offer = current.actions.find(
    ({ call }) =>
      call.name === name &&
      JSON.stringify(JSON.parse(call.argumentsJson)) === JSON.stringify(args),
  );
  assert.ok(offer, name + JSON.stringify(args));
  if (name !== "move") {
    const context = offer.contextId;
    const target =
      context === "ending"
        ? "Ending choices"
        : [
            ...current.scene.room.features,
            ...current.scene.room.items,
            ...current.scene.room.opponents,
            ...current.scene.room.npcs,
            ...current.character.collectedItems,
          ].find(({ id }) => context.endsWith(":" + id)).name;
    await page.getByRole("button", { name: target, exact: true }).click();
  }
  const button =
    name === "move"
      ? page.locator("#exits").getByRole("button", {
          name: current.scene.room.exits.find(
            ({ destinationId }) => destinationId === args.destinationId,
          ).name,
          exact: true,
        })
      : page
          .locator("#context-actions")
          .getByRole("button", { name: offer.label, exact: true });
  const reply = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await button.click();
  const result = await (await reply).json();
  await idle(page);
  return result;
}

test(
  "relationship followups stay public and current through a failed claim, return and correction",
  { timeout: 30000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "dungeon-92-relationship-"));
    let server, browser;
    try {
      const savePath = join(directory, "slot.json");
      const { model } = journeyModel();
      server = await startBrowserServer({
        contentVersion: "11",
        seed: 0,
        savePath,
        apiKey: "offline",
        dmModel: model,
      });
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      const page = await browser.newPage();
      await page.goto(server.url);
      await idle(page);
      await page.locator("#start").click();
      await idle(page);
      await typed(
        page,
        "Claim to Captain Iona that the familiar signal is safe",
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
      assert.match(
        await page.locator("#current-leads").textContent(),
        /correct Captain Iona/,
      );
      await page.locator("#open-leads").click();
      assert.match(
        await page.locator("#information-body").textContent(),
        /correct Captain Iona/,
      );
      await page.locator("#open-hints").click();
      assert.match(
        await page.locator("#information-body").textContent(),
        /correct Captain Iona/,
      );
      await page.locator("#open-character").click();
      assert.match(
        await page.locator("#information-body").textContent(),
        /Relationships in view.*Captain Iona/s,
      );
      await page.keyboard.press("Escape");
      const before = read(savePath).checkpoint;
      const corrected = await typed(
        page,
        "Correct Captain Iona with the setting plate correction",
      );
      assert.equal(corrected.committed, true);
      assert.equal(
        read(savePath).checkpoint.randomPosition,
        before.randomPosition,
      );
      assert.doesNotMatch(
        await page.locator("#current-leads").textContent(),
        /correct Captain Iona/,
      );
      await page.locator("#open-character").click();
      assert.match(
        await page.locator("#information-body").textContent(),
        /Captain Iona.*trusted/s,
      );
      await page.locator("#open-journal").click();
      assert.match(
        await page.locator("#information-body").textContent(),
        /Iona corrected the safe-signal belief/,
      );
      assert.match(
        corrected.reply,
        /Nobody else|other actors|no culprit|no.*rescue/i,
      );
    } finally {
      await server?.close();
      await browser?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "full browser journey reads current resources, returns, resumes combat and reviews without stale guidance or repeated commits",
  { timeout: 90000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "dungeon-92-"));
    let server, browser;
    try {
      const checkpoints = [];
      browser = await chromium.launch(
        process.platform === "win32" ? { channel: "msedge" } : {},
      );
      for (const clicks of [false, true]) {
        const savePath = join(directory, "browser-" + clicks + ".json");
        const { model, controls } = journeyModel();
        const options = {
          contentVersion: "11",
          savePath,
          seed: 0,
          apiKey: "offline",
          dmModel: model,
        };
        server = await startBrowserServer(options);
        const page = await browser.newPage({
          viewport: { width: 1280, height: 720 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(server.url);
        await idle(page);
        await page.locator("#start").click();
        await idle(page);
        assert.match(
          await page.locator("#objective").textContent(),
          /Reach the tower/,
        );
        assert.equal(await page.locator("#defense").textContent(), "AC 16");
        assert.match(
          await page.locator("#attack").textContent(),
          /d20 \+5; damage 1d8 \+3/,
        );
        assert.match(
          await page.locator("#deadline").textContent(),
          /3 day\(s\) until/,
        );
        await page
          .getByRole("button", { name: "Captain Iona", exact: true })
          .click();
        await page.keyboard.press("Escape");
        assert.equal(
          await page.evaluate(() => document.activeElement.textContent),
          "Captain Iona",
        );
        const initial = read(savePath).checkpoint,
          calls = controls.calls;
        for (const panel of [
          "inventory",
          "character",
          "journal",
          "leads",
          "hints",
        ]) {
          await page.locator("#open-" + panel).click();
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            "information-title",
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            "open-" + panel,
          );
        }
        await page.locator("#open-hints").click();
        await page.locator("#request-stronger-hint").click();
        await page.waitForFunction(
          () =>
            !document
              .getElementById("stronger-hint-result")
              .textContent.includes("Preparing"),
        );
        await page.keyboard.press("Escape");
        assert.deepEqual(read(savePath).checkpoint, initial);
        assert.deepEqual((await view(server)).history, []);
        assert.equal(controls.calls, calls);
        for (const message of ["Use it", "Search secret ledger"]) {
          const before = read(savePath).checkpoint;
          const result = await typed(page, message);
          assert.equal(result.committed, false);
          assert.deepEqual(read(savePath).checkpoint, before);
          assert.match(
            message === "Use it" ? result.reply : result.cards[0].text,
            message === "Use it"
              ? /Which visible/
              : /not available.*No time, dice or items/s,
          );
        }
        for (const [index, [, message, name, args]] of journey.entries()) {
          const before = await view(server);
          let release, entered, received;
          if (name === "search" && args.target === "setting-plate") {
            controls.wait = new Promise((resolve) => {
              release = resolve;
            });
            entered = new Promise((resolve) => {
              controls.entered = resolve;
            });
          }
          if (name === "brace") {
            controls.fail = true;
          }
          const pending =
            clicks && name !== "place_item"
              ? clickAction(page, server, name, args)
              : typed(page, message);
          if (entered) {
            await entered;
            const oldHistory = before.history;
            await page.locator("#conversation").evaluate((e) => {
              e.scrollTop = 0;
            });
            received = await page
              .locator("#conversation")
              .evaluate((e) => e.scrollTop);
            const during = read(savePath).checkpoint;
            await page.locator("#open-character").click();
            await page.keyboard.press("Escape");
            assert.deepEqual(read(savePath).checkpoint, during);
            assert.equal(oldHistory.length, before.history.length);
            release();
            controls.wait = undefined;
            controls.entered = undefined;
          }
          const result = await pending;
          if (entered) {
            assert.equal(
              await page.locator("#conversation").evaluate((e) => e.scrollTop),
              received,
            );
          }
          assert.equal(
            result.committed,
            true,
            message + ": " + JSON.stringify(result.cards),
          );
          assert.equal(read(savePath).checkpoint.sequence, before.position + 1);
          assert.match(
            await page.locator("#last-consequence").textContent(),
            /\S/,
          );
          if (name === "talk") {
            assert.match(
              await page.locator(".dialogue").last().textContent(),
              /NPC dialogue/,
            );
          }
          if (name === "take") {
            await page.locator("#open-inventory").click();
            assert.match(
              await page.locator("#information-body").textContent(),
              /Carried items.*spare signal component.*Items in this scene.*No portable/s,
            );
            await page.keyboard.press("Escape");
          }
          if (name === "brace") {
            assert.match(result.notice, /saved; do not repeat/);
            assert.match(result.cards[0].text, /1 action, 0 days.*AC.*d20/s);
            assert.match(
              await page.locator("#conditions").textContent(),
              /Cover spent/,
            );
            const committed = read(savePath).checkpoint;
            const retry = await typed(page, message);
            assert.equal(retry.committed, false);
            assert.deepEqual(read(savePath).checkpoint, committed);
            await server.close();
            server = await startBrowserServer(options);
            await page.goto(server.url);
            await idle(page);
            assert.deepEqual(read(savePath).checkpoint, committed);
            assert.match(
              await page.locator("#combat").textContent(),
              /Turn: Fighter/,
            );
          }
          if (index === 25) {
            assert.match(
              await page.locator("#description").textContent(),
              /controls are secured/,
            );
            const current = await view(server);
            assert.equal(
              current.scene.room.npcs.find(({ id }) => id === "vey").condition,
              "dead",
            );
            assert.ok(
              !current.actions.some(
                ({ call }) =>
                  call.name === "talk" &&
                  JSON.parse(call.argumentsJson).speakerId === "vey",
              ),
            );
            assert.doesNotMatch(
              await page.locator("#current-leads").textContent(),
              /Vey|Pell|Tower Runner|Holding|refusing|leaving/,
            );
          }
          if (name === "place_item") {
            await page.locator("#open-inventory").click();
            assert.match(
              await page.locator("#information-body").textContent(),
              /No carried items.*Spent items.*spare signal component — spent/s,
            );
            await page.keyboard.press("Escape");
          }
        }
        const complete = await view(server);
        assert.equal(complete.scene.outcome, "victory");
        assert.match(
          await page.locator("#current-leads").textContent(),
          /No open leads/,
        );
        assert.match(
          await page.locator("#last-consequence").textContent(),
          /no confirmed rescue or death/,
        );
        assert.match(
          await page.locator("#session").textContent(),
          /Review mode/,
        );
        const saved = read(savePath).checkpoint,
          count = controls.calls;
        await page.locator("#open-journal").click();
        assert.match(
          await page.locator("#information-body").textContent(),
          /Observed evidence.*Testimony.*Beliefs.*Final record/s,
        );
        await page.locator("#close-information").click();
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "open-journal",
        );
        await page.reload();
        await idle(page);
        assert.deepEqual((await view(server)).history, complete.history);
        assert.equal(controls.calls, count);
        assert.deepEqual(read(savePath).checkpoint, saved);
        assert.deepEqual(errors, []);
        checkpoints.push(saved);
        await page.close();
        await server.close();
        server = undefined;
      }
      assert.deepEqual(checkpoints[0], checkpoints[1]);
    } finally {
      await server?.close();
      await browser?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

test(
  "the same full journey resumes and replays through command and scripted AI adapters",
  { timeout: 30000 },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "dungeon-92-cli-"));
    try {
      const checkpoints = [];
      for (const ai of [false, true]) {
        const save = join(directory, String(ai) + ".json"),
          script = join(directory, "script.json");
        const traces = [
          join(directory, String(ai) + "-first.json"),
          join(directory, String(ai) + "-last.json"),
        ];
        for (const [part, steps] of [
          journey.slice(0, 11),
          journey.slice(11),
        ].entries()) {
          writeFileSync(
            script,
            JSON.stringify(
              steps.flatMap(([, , name, args]) => [
                {
                  toolCalls: [
                    { id: "intent", name, argumentsJson: JSON.stringify(args) },
                  ],
                },
                { text: name === "talk" ? "{}" : "Read the engine result." },
              ]),
            ),
          );
          const args =
            part === 0
              ? [
                  "--adventure-file",
                  resolve("adventures/hollow-beacon-finale.json"),
                  "--seed",
                  "0",
                  "--save",
                  save,
                ]
              : ["--resume", save, "--previous-trace", traces[0]];
          const result = spawnSync(
            process.execPath,
            [
              "dist/cli.js",
              ...args,
              "--trace",
              traces[part],
              ...(ai ? ["--ai"] : []),
            ],
            {
              input:
                steps
                  .map(([command, message]) => (ai ? message : command))
                  .join("\n") + "\n",
              encoding: "utf8",
              windowsHide: true,
              env: {
                ...process.env,
                ...(ai ? { DUNGEON_ONE_TEST_DM_SCRIPT: script } : {}),
              },
            },
          );
          assert.equal(result.status, 0, result.stdout + result.stderr);
          assert.doesNotMatch(
            result.stdout,
            /Action unavailable|Tool rejected/,
          );
          assert.equal(
            read(save).checkpoint.state.status,
            part === 0 ? "playing" : "victory",
            result.stdout,
          );
        }
        const replay = spawnSync(
          process.execPath,
          ["dist/cli.js", "--replay", ...traces],
          { encoding: "utf8", windowsHide: true },
        );
        assert.equal(replay.status, 0, replay.stdout + replay.stderr);
        assert.match(replay.stdout, /Trace verified successfully/);
        checkpoints.push(read(save).checkpoint);
      }
      assert.deepEqual(checkpoints[0], checkpoints[1]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
