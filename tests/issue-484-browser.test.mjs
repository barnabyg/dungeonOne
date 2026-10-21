// #484, browser → API → storage: the sound tags of items found, taken and
// traded reach the page, which plays each for the answer that brings it,
// and not for the history shown on reload.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  clickAction,
  createAndStart,
  trade,
} from "./fixtures/browser-journey.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** The sounds the page has asked for since it loaded. */
const requested = (page) => page.evaluate(() => window.requestedSounds);

/** The sounds one answer asks for: those asked for while `run` runs. */
async function answerSounds(page, run) {
  const before = (await requested(page)).length;
  await run();
  return (await requested(page)).slice(before);
}

test(
  "finding, taking and trading items play their sounds, answer by answer, and not on reload",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-484-browser-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      adventures: [findsYard],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, findsYard.id);
      assert.deepEqual(await requested(page), []);

      const act = (action, target) =>
        answerSounds(page, () => clickAction(page, action, target));
      assert.deepEqual(await act("examine", "water-butt"), ["find"]);
      assert.deepEqual(await act("take", "lost-purse"), ["coins"]);
      assert.deepEqual(await act("examine", "woodpile"), ["find"]);
      assert.deepEqual(await act("take", "yard-dagger"), ["pickup"]);
      assert.deepEqual(await act("take", "yard-potion"), ["magic-item"]);
      assert.deepEqual(await act("examine", "handcart"), []);
      assert.deepEqual(await act("take", "yard-ring"), ["pickup"]);
      // Trades are made in the shop (#515).
      const shop = (action, target) =>
        answerSounds(page, () => trade(page, action, target));
      assert.deepEqual(await shop("sell-treasure", "yard-ring"), ["coins"]);
      assert.deepEqual(await shop("buy", "dagger"), ["coins"]);

      await page.reload();
      await page.locator("#log li").nth(8).waitFor();
      assert.deepEqual(await requested(page), []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
