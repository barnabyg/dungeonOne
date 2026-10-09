import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  widenFont,
} from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

// #333: the adventure's status strip shows the hit-dice pool outside a
// fight, from the saved session.

/** Each resource pip group's spoken words and its filled and empty pips. */
const resources = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("#resources li")].map((item) => [
        item.dataset.resource,
        {
          words: item.querySelector(".visually-hidden").textContent,
          pips:
            "●".repeat(item.querySelectorAll(".pip.full").length) +
            "○".repeat(item.querySelectorAll(".pip:not(.full)").length),
        },
      ]),
    ),
  );

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `the status strip shows hit dice while exploring, through a reload, at ${viewport.width} px`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-333-"));
      const server = await startFifthBrowserServer({
        adventures: [ratTunnels],
        // Fixtures are engine material, not gated content: the gate is
        // tested in balance-5e.test.mjs (#310).
        qualifies: () => true,
        libraryPath: join(directory, "characters.json"),
        seed: 0,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await createAndStart(page, server.url, "rat-tunnels");
        const expected = {
          "second-wind": {
            words: "Second Wind: 2 of 2 uses left",
            pips: "●●",
          },
          "hit-dice": { words: "Hit dice: 1 of 1 d10 left", pips: "●" },
        };
        assert.deepEqual(await resources(page), expected);
        const file = await sessionFile(directory);
        assert.equal(file.state.character.hitDice, 1);
        await page.reload();
        await page.locator("#adventure").waitFor({ state: "visible" });
        assert.deepEqual(await resources(page), expected);
        if (viewport.width === 375) {
          // CI's Linux fallback font is wider than Windows'.
          await widenFont(page);
          await assertNoSideScroll(page);
        }
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
