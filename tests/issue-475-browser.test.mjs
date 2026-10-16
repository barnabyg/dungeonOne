// #475, browser → API → storage: Leave warns before the player confirms that
// leaving falls short of the objective, and confirming settles the ending it
// named.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { lintelBarrow as barrow } from "./fixtures/modules.mjs";
import { createFighter, startAdventure } from "./fixtures/browser-journey.mjs";
import { launch } from "./fixtures/session-layout.mjs";
import { readAda } from "./fixtures/save-files.mjs";

test(
  "leaving the barrow empty-handed warns of the award lost, then settles Out empty-handed",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-475-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await createFighter(page);
      await startAdventure(page, "lintel-barrow");

      await page.locator("#leave-controls button").click();
      assert.equal(
        await page.locator("#leave-question").textContent(),
        "Leave The Lintel Barrow? This ends the adventure here as Out " +
          "empty-handed. Any treasure or coin you carry out is yours to " +
          "keep; you cannot come back to this adventure.",
      );
      const warning = page.locator("#leave-warning");
      assert.equal(await warning.isVisible(), true);
      assert.equal(
        await warning.textContent(),
        "You have found no treasure or coin here to carry out. Leaving now gives up the 250 XP for “Out with the silver”. You keep " +
          "the XP for any fights you have won.",
      );
      // The question takes the danger colour while it warns.
      const [border, danger] = await page
        .locator("#leave-confirm")
        .evaluate((node) => {
          const probe = document.createElement("span");
          probe.style.color = "var(--color-danger)";
          node.append(probe);
          const colours = [
            getComputedStyle(node).borderLeftColor,
            getComputedStyle(probe).color,
          ];
          probe.remove();
          return colours;
        });
      assert.equal(border, danger);
      // Nothing is settled until the player confirms.
      assert.notEqual((await readAda(libraryPath)).session, undefined);

      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending-title").textContent(),
        "Out empty-handed",
      );
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, 0);
      assert.deepEqual(record.sheet.xpAwards, []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
