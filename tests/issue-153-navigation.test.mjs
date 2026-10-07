import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import { createFighter, openCreation } from "./fixtures/browser-journey.mjs";

/** What the page shows: the visible view, its title, breadcrumb and focus. */
const state = (page) =>
  page.evaluate(() => ({
    view: ["library", "creation", "sheet", "adventure"].find(
      (id) => !document.getElementById(id).hidden,
    ),
    title: document.title,
    hash: location.hash,
    crumbs: [...document.querySelectorAll("#breadcrumb li")].map(
      (item) => item.textContent,
    ),
    current: document.querySelector("#breadcrumb [aria-current=page]")
      ?.textContent,
    focused: document.activeElement.id,
  }));

/** Waits until the page shows `view`, then returns its state. */
const shown = async (page, view) => {
  await page.waitForFunction(
    (id) =>
      !document.getElementById(id).hidden &&
      document.querySelector("#breadcrumb li") !== null,
    view,
  );
  return state(page);
};

const libraryFile = async (path) => JSON.parse(await readFile(path, "utf8"));

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `Back and Forward move between the views, and reloads return to them (${viewport.width}px)`,
    { timeout: 60000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-153-history-"));
      const libraryPath = join(directory, "characters.json");
      const server = await startFifthBrowserServer({
        adventures: [loneGoblin],
        libraryPath,
        seed: 5,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#no-characters").waitFor();
        assert.equal(
          await page.locator(".masthead h1").textContent(),
          "Dungeon One",
        );
        assert.deepEqual(await shown(page, "library"), {
          view: "library",
          title: "Characters · Dungeon One",
          hash: "",
          crumbs: ["Characters"],
          current: "Characters",
          focused: "",
        });

        // Creation is its own entry, titled, with a Cancel and a breadcrumb.
        await openCreation(page);
        const creation = await shown(page, "creation");
        assert.equal(creation.title, "Create a Fighter · Dungeon One");
        assert.equal(creation.hash, "#create");
        assert.deepEqual(creation.crumbs, ["Characters", "Create a Fighter"]);
        assert.equal(creation.focused, "creation-title");
        assert.equal(
          await page.locator("#close-creation").textContent(),
          "Cancel",
        );
        await page.locator("#character-name").fill("Brannoc Ironside");
        await page.locator("#save-character").click();
        await page
          .locator("#sheet-name")
          .filter({ hasText: "Brannoc Ironside" })
          .waitFor();
        const [{ sheet }] = (await libraryFile(libraryPath)).characters;
        const sheetState = await shown(page, "sheet");
        assert.deepEqual(sheetState, {
          view: "sheet",
          title: "Brannoc Ironside · Dungeon One",
          hash: `#character-${sheet.id}`,
          crumbs: ["Characters", "Brannoc Ironside"],
          current: "Brannoc Ironside",
          focused: "sheet-name",
        });
        assert.equal(await page.locator("#close-sheet").count(), 0);

        // Start an adventure; the session is saved and the view is its own entry.
        await page.locator(".start-adventure").first().click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        const { session } = (await libraryFile(libraryPath)).characters[0];
        assert.ok(session, "the library records the adventure in progress");
        const adventure = await shown(page, "adventure");
        const adventureTitle = await page
          .locator("#adventure-title")
          .textContent();
        assert.deepEqual(adventure, {
          view: "adventure",
          title: `${adventureTitle} · Dungeon One`,
          hash: `#adventure-${session.id}`,
          crumbs: ["Characters", "Brannoc Ironside", adventureTitle],
          current: adventureTitle,
          focused: "adventure-title",
        });
        assert.equal(await page.locator("#close-adventure").count(), 0);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          "no horizontal scroll",
        );

        // Back to the sheet (the saved creation is skipped), Back to the
        // library, Forward to the sheet, Forward to the adventure.
        await page.goBack();
        assert.deepEqual(await shown(page, "sheet"), sheetState);
        await page.locator("#continue-adventure").waitFor();
        await page.goBack();
        const library = await shown(page, "library");
        assert.equal(library.title, "Characters · Dungeon One");
        assert.equal(library.focused, "library-title");
        await page.goForward();
        assert.deepEqual(await shown(page, "sheet"), sheetState);
        await page.goForward();
        await page
          .locator("#adventure-title")
          .filter({ hasText: adventureTitle })
          .waitFor();
        assert.deepEqual(await shown(page, "adventure"), adventure);

        // Reloads resume the adventure and reopen the sheet.
        await page.reload();
        await page.locator("#adventure").waitFor({ state: "visible" });
        assert.deepEqual(await shown(page, "adventure"), adventure);
        await page.locator('#breadcrumb a[data-view="sheet"]').click();
        assert.deepEqual(await shown(page, "sheet"), sheetState);
        await page.reload();
        await page.locator("#sheet").waitFor({ state: "visible" });
        assert.deepEqual(await shown(page, "sheet"), sheetState);

        // The breadcrumb is reachable from the keyboard, just before the heading.
        await page.keyboard.press("Shift+Tab");
        assert.equal(
          await page.evaluate(() => document.activeElement.textContent),
          "Characters",
        );
        await page.keyboard.press("Enter");
        assert.equal((await shown(page, "library")).hash, "");
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "a URL for a deleted character or an ended adventure falls back to the library with a message",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-153-missing-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath,
      seed: 8,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await createFighter(page, "Ada");
      const adaUrl = page.url();
      await page.locator("#delete-character").click();
      await page.locator("#delete-confirm-name").fill("Ada");
      await page.locator("#confirm-delete").click();
      await page.locator("#no-characters").waitFor();
      assert.deepEqual((await libraryFile(libraryPath)).characters, []);
      // Deleting replaced the sheet's entry: Back does not reach it.
      assert.equal((await shown(page, "library")).hash, "");

      await page.goto(adaUrl);
      await page
        .locator("#feedback")
        .filter({ hasText: "That character no longer exists." })
        .waitFor();
      const fallback = await shown(page, "library");
      assert.equal(fallback.hash, "");
      assert.equal(fallback.title, "Characters · Dungeon One");

      await page.goto(`${server.url}/#adventure-${"0".repeat(32)}`);
      await page
        .locator("#feedback")
        .filter({ hasText: "That adventure is no longer in progress." })
        .waitFor();
      assert.equal((await shown(page, "library")).hash, "");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
