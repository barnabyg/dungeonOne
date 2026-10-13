// #403, browser → API → storage: Ada goes into the alcove of the Wandering
// Tunnels. The upper region's table rolls on every move there (chance
// 100), and its one entry is an omen: the card shows the d100 and the
// chain clinking far above, and the saved session counts the move in the
// region and holds the omen. After a reload both are still there.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels, wanderingTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const CHAIN = "Far above, a chain clinks against stone, then is still.";

test("Ada hears an omen as she goes into the alcove, and it is saved", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-403-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [wanderingTunnels, ratTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 4,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  try {
    await createAndStart(page, server.url, "wandering-tunnels");
    await settled(page, () => clickAction(page, "move", "alcove"));
    const card = await page.locator("#log li.newest").textContent();
    assert.match(
      card,
      /You listen as you go: d100 \d+, 100 or less: Far above, a chain clinks against stone, then is still\./u,
    );
    // The d100 shows on the card.
    assert.match(
      await page
        .locator("#log li.newest .roll.wandering")
        .first()
        .textContent(),
      /^d100 \d+ vs 100 or less$/u,
    );
    const saved = (await sessionFile(directory)).state;
    assert.deepEqual(saved.regionMoves, { upper: 1 });
    assert.equal(saved.omen, CHAIN);

    // A reload keeps the count and the omen.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    const reloaded = (await sessionFile(directory)).state;
    assert.deepEqual(reloaded.regionMoves, saved.regionMoves);
    assert.equal(reloaded.omen, CHAIN);
    assert.match(await page.locator("#log").textContent(), /a chain clinks/u);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
