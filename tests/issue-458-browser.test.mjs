// #458, browser → API: the room panel gives each exit its direction from the
// map. Exits read "West: Alcove", the Go buttons' rows and names carry the
// direction ("Go west to Alcove"), a stair's is up or down, and in a fight
// each Flee button names the way it runs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  clickAction,
  createAndStart,
} from "./fixtures/browser-journey.mjs";
import { mapTunnels } from "./fixtures/modules.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("the room panel's exits and their buttons give each way's direction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-458-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [mapTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 1,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  try {
    await createAndStart(page, server.url, "map-tunnels");
    assert.deepEqual(await page.locator("#exits li strong").allTextContents(), [
      "West: Alcove",
      "South: Rat-Gnawed Cellar",
      "East: Long Gallery",
      "Up: Belfry",
    ]);
    // Each exit's card, with its verbs (#520), is headed by its way, and Go
    // says it.
    const card = (id) => page.locator(`#exits li[data-id="${id}"]`);
    assert.equal(
      await card("belfry").locator("strong").textContent(),
      "Up: Belfry",
    );
    assert.equal(
      await card("belfry").locator('button.act[data-action="move"]').count(),
      1,
    );
    const go = actionButton(page, "move", "alcove");
    assert.equal(await go.getAttribute("aria-label"), "Go west to Alcove");
    assert.equal(
      await actionButton(page, "move", "belfry").getAttribute("aria-label"),
      "Go up to Belfry",
    );
    // From the gallery, the ladder leads down.
    await clickAction(page, "move", "gallery");
    assert.deepEqual(await page.locator("#exits li strong").allTextContents(), [
      "West: Foot of the Stair",
      "Down: Sump",
    ]);
    await clickAction(page, "move", "stair-foot");

    // In the cellar's fight, Flee names the way back.
    await clickAction(page, "move", "rat-cellar");
    const flee = actionButton(page, "flee", "stair-foot");
    await flee.waitFor();
    assert.equal(await flee.textContent(), "North: Foot of the Stair");
    assert.equal(
      await flee.getAttribute("aria-label"),
      "Flee north to Foot of the Stair",
    );
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
