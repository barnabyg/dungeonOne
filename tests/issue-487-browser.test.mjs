// #487, browser → API → storage: leaving with loot from a module whose
// objective is getting out with loot plays the objective's fanfare once,
// and opening the ended adventure again by reloading plays nothing.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/**
 * The lintel barrow, whose objective is getting out with loot, with a purse
 * dropped under its lintel: taking it and leaving meets the objective.
 */
const droppedPurse = (() => {
  const module = moduleFile("lintel-barrow");
  module.id = "dropped-purse";
  room(module, "barrow-mouth").items = [
    {
      id: "dropped-purse",
      name: "Dropped Purse",
      description: "A purse some earlier robber tucked under the lintel.",
      kind: "coin",
      coins: { sp: 5 },
      hiddenIn: "scratched-lintel",
    },
  ];
  return validateModule(module);
})();

/** The sounds the page has asked for since it loaded. */
const requested = (page) => page.evaluate(() => window.requestedSounds);

test(
  "leaving with loot plays the objective's fanfare once, and reloading the ending plays nothing",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-487-browser-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      adventures: [droppedPurse],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, droppedPurse.id);
      await clickAction(page, "examine", "scratched-lintel");
      await clickAction(page, "take", "dropped-purse");
      await page.waitForFunction(() => window.requestedSounds.length > 1);
      assert.deepEqual(await requested(page), ["coins", "coins"]);

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending").getAttribute("data-kind"),
        "escape-with-loot",
      );
      await page.waitForFunction(() => window.requestedSounds.length > 2);
      assert.deepEqual(await requested(page), ["coins", "coins", "objective"]);

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
