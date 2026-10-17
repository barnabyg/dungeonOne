// #483, browser → API → storage: leaving plays the escape's sound when the
// ending appears, and opening the ended adventure again by reloading plays
// nothing.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { lintelBarrow as barrow } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** The sounds the page has asked for since it loaded. */
const requested = (page) => page.evaluate(() => window.requestedSounds);

test(
  "leaving plays the escape's sound once, and reloading the ending plays nothing",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-483-browser-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, barrow.id);
      assert.deepEqual(await requested(page), []);

      // Asking to leave is not an answer: only confirming it is.
      await page.locator("#leave-controls button").click();
      assert.deepEqual(await requested(page), []);
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending").getAttribute("data-kind"),
        "escape-without-loot",
      );
      await page.waitForFunction(() => window.requestedSounds.length > 0);
      assert.deepEqual(await requested(page), ["ending-escape"]);

      await page.reload();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.deepEqual(await requested(page), []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
