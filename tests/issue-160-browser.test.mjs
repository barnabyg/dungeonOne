// #160: while a request is in flight the control that started it is busy
// (aria-busy, a label such as "Saving…") and cannot be used again; a typed
// message appears at once with a client-only "The Dungeon Master is
// thinking…" entry that the result replaces; confirmations show inside the
// current panel and clear on the next navigation. The server's responses are
// held with Playwright routes and the scripted DM is held behind a gate, so
// each busy state is observed deterministically.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { loadScriptedDmModel } from "../dist/scripted-dm-model.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

/** A promise and the function that settles it. */
function gate() {
  let open;
  const held = new Promise((resolve) => {
    open = resolve;
  });
  return { held, open };
}

/** Holds the page's POSTs to `path` until the returned gate opens. */
async function holdRequests(page, path) {
  const hold = gate();
  await page.route(`**${path}`, async (route) => {
    await hold.held;
    await route.continue();
  });
  return hold;
}

/** Counts the page's POSTs to each path. */
function countPosts(page) {
  const counts = new Map();
  page.on("request", (request) => {
    if (request.method() !== "POST") {
      return;
    }
    const path = new URL(request.url()).pathname;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  });
  return (path) => counts.get(path) ?? 0;
}

const busyState = (locator) =>
  locator.evaluate((button) => ({
    busy: button.getAttribute("aria-busy"),
    disabled: button.disabled,
    text: button.textContent,
  }));

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `busy controls, the pending DM entry and in-panel confirmations (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-160-"));
      const script = join(directory, "dm.json");
      await writeFile(
        script,
        JSON.stringify([
          { text: "Three goblins crouch among the crates, blades out." },
        ]),
      );
      const scripted = await loadScriptedDmModel(script);
      const dm = gate();
      const server = await startFifthBrowserServer({
        libraryPath: join(directory, "characters.json"),
        seed: 0,
        dmModel: {
          identity: scripted.identity,
          async respond(request) {
            await dm.held;
            return scripted.respond(request);
          },
        },
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      const posts = countPosts(page);
      try {
        await page.goto(server.url);
        await page.locator("#library-title").waitFor();

        // Opening creation: the button is busy until the dice arrive.
        const opening = await holdRequests(page, "/api/5e/creation");
        const opener = page.locator("#open-creation");
        await opener.click();
        await page
          .locator('#open-creation[aria-busy="true"]')
          .waitFor({ state: "attached" });
        assert.deepEqual(await busyState(opener), {
          busy: "true",
          disabled: true,
          text: "Opening…",
        });
        await opener.evaluate((button) => button.click());
        assert.equal(posts("/api/5e/creation"), 1);
        opening.open();
        await page.locator("#creation").waitFor({ state: "visible" });
        assert.equal(posts("/api/5e/creation"), 1);
        assert.deepEqual(await busyState(opener), {
          busy: null,
          disabled: false,
          text: "Create a Fighter",
        });
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();

        // Saving: busy, and a second submit sends nothing.
        await page.locator("#character-name").fill("Ada");
        const saving = await holdRequests(page, "/api/5e/characters");
        const save = page.locator("#save-character");
        await save.click();
        await page
          .locator('#save-character[aria-busy="true"]')
          .waitFor({ state: "attached" });
        assert.deepEqual(await busyState(save), {
          busy: "true",
          disabled: true,
          text: "Saving…",
        });
        await page.evaluate(() =>
          document.getElementById("creation-form").requestSubmit(),
        );
        await page.locator("#character-name").press("Enter");
        assert.equal(posts("/api/5e/characters"), 1);
        saving.open();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
        assert.equal(posts("/api/5e/characters"), 1);

        // The confirmation is inside the sheet and announced politely.
        const feedback = page.locator("#feedback");
        assert.equal(await feedback.textContent(), "Ada is saved.");
        assert.ok(await feedback.isVisible());
        assert.equal(
          await page.locator("#sheet #feedback[role=status]").count(),
          1,
        );
        const inside = await page.evaluate(() => {
          const panel = document
            .getElementById("sheet")
            .getBoundingClientRect();
          const notice = document
            .getElementById("feedback")
            .getBoundingClientRect();
          return (
            notice.left >= panel.left &&
            notice.right <= panel.right &&
            notice.top >= panel.top &&
            notice.bottom <= panel.bottom
          );
        });
        assert.ok(inside, "the confirmation sits inside the sheet panel");

        // It clears on the next navigation, and returns to the sheet cleared.
        await page.locator("#breadcrumb a").first().click();
        await page.locator("#library").waitFor({ state: "visible" });
        assert.equal(await feedback.textContent(), "");
        assert.equal(await feedback.isVisible(), false);
        await page.goBack();
        await page.locator("#sheet").waitFor({ state: "visible" });
        assert.equal(await feedback.textContent(), "");
        assert.equal(await feedback.isVisible(), false);

        // Starting an adventure: busy until the session arrives.
        const starting = await holdRequests(page, "/api/5e/adventures/start");
        const start = page.locator(
          '.start-adventure[data-adventure="goblin-storeroom"]',
        );
        await start.click();
        await page
          .locator('.start-adventure[aria-busy="true"]')
          .waitFor({ state: "attached" });
        assert.deepEqual(await busyState(start), {
          busy: "true",
          disabled: true,
          text: "Starting…",
        });
        starting.open();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log > li").first().waitFor();
        assert.equal(posts("/api/5e/adventures/start"), 1);

        // A typed message: the message and the pending entry appear at once,
        // the composer is disabled and nothing can be sent twice.
        const before = await page.locator("#log > li").count();
        await page.locator("#message").fill("I size up the goblins");
        await page.locator("#message").press("Enter");
        const pending = page.locator("#log > li[data-pending]");
        await pending.waitFor();
        assert.equal(await page.locator("#log > li").count(), before + 1);
        assert.equal(
          await pending.textContent(),
          "You: I size up the goblinsThe Dungeon Master is thinking…",
        );
        assert.equal(
          await pending.evaluate((item) => item.classList.contains("newest")),
          true,
        );
        assert.equal(await pending.getAttribute("data-kind"), "message");
        assert.equal(await page.locator("#message").isDisabled(), true);
        assert.deepEqual(await busyState(page.locator("#send-message")), {
          busy: "true",
          disabled: true,
          text: "Sending…",
        });
        for (const button of await page
          .locator("#session-actions button")
          .all()) {
          assert.equal(await button.isDisabled(), true);
        }
        await page.evaluate(() =>
          document.getElementById("message-form").requestSubmit(),
        );
        assert.equal(posts("/api/5e/session/message"), 1);

        // The pending entry is never saved.
        const sessions = join(directory, "characters-adventures");
        for (const name of await readdir(sessions)) {
          assert.doesNotMatch(
            await readFile(join(sessions, name), "utf8"),
            /thinking/,
          );
        }

        // The DM's reply replaces the pending entry.
        dm.open();
        await pending.waitFor({ state: "detached" });
        assert.equal(await page.locator("#log > li").count(), before + 1);
        const reply = page.locator("#log > li").last();
        assert.equal(
          await reply.textContent(),
          "You: I size up the goblinsThree goblins crouch among the crates, blades out.",
        );
        assert.equal(
          await reply.evaluate((item) => item.classList.contains("newest")),
          true,
        );
        assert.equal(await page.locator("#message").isDisabled(), false);
        assert.deepEqual(await busyState(page.locator("#send-message")), {
          busy: null,
          disabled: false,
          text: "Send",
        });
        assert.equal(posts("/api/5e/session/message"), 1);
        for (const name of await readdir(sessions)) {
          assert.doesNotMatch(
            await readFile(join(sessions, name), "utf8"),
            /thinking/,
          );
        }

        // A reload shows the same saved history and no pending entry.
        const shown = await page.locator("#log").innerHTML();
        await page.reload();
        await page.locator("#log > li").first().waitFor();
        assert.equal(await page.locator("#log").innerHTML(), shown);
        assert.equal(await pending.count(), 0);

        // A clicked action is busy, and every action is held until it ends.
        const acting = await holdRequests(page, "/api/5e/session/attack");
        const attack = page.locator("#attack-controls button.attack").first();
        const target = await attack.getAttribute("data-target");
        await attack.click();
        const busyAttack = page.locator(
          `#attack-controls button[data-target="${target}"][aria-busy="true"]`,
        );
        await busyAttack.waitFor({ state: "attached" });
        assert.equal(await busyAttack.isDisabled(), true);
        await busyAttack.evaluate((button) => button.click());
        assert.equal(posts("/api/5e/session/attack"), 1);
        acting.open();
        await page
          .locator("#log > li")
          .nth(before + 1)
          .waitFor();
        assert.equal(posts("/api/5e/session/attack"), 1);
        assert.equal(
          await page.locator("#session-actions [aria-busy]").count(),
          0,
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "a failed message removes the pending entry and keeps the typed text",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-160-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      dmModel: await loadScriptedDmModel(
        await (async () => {
          const script = join(directory, "dm.json");
          await writeFile(script, "[]");
          return script;
        })(),
      ),
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page
        .locator('.start-adventure[data-adventure="goblin-storeroom"]')
        .click();
      await page.locator("#log > li").first().waitFor();
      const before = await page.locator("#log").innerHTML();

      // The server is held, then answers with an error.
      const failing = gate();
      await page.route("**/api/5e/session/message", async (route) => {
        await failing.held;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "The Dungeon Master is unavailable." }),
        });
      });
      await page.locator("#message").fill("I wave");
      await page.locator("#message").press("Enter");
      await page.locator("#log > li[data-pending]").waitFor();
      failing.open();
      await page
        .locator("#adventure-error")
        .filter({ hasText: "The Dungeon Master is unavailable." })
        .waitFor();
      assert.equal(await page.locator("#log > li[data-pending]").count(), 0);
      assert.equal(await page.locator("#message").inputValue(), "I wave");
      assert.equal(await page.locator("#message").isDisabled(), false);
      assert.equal(await page.locator("#log").innerHTML(), before);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
