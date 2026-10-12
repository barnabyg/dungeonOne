// #395, browser → API → storage: Ada explores the Two-Level Tunnels. The
// room panel names each room's region above its name, the saved session
// counts her moves between rooms, and a reload shows the same region.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { ratTunnels, regionTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("the room panel names the current room's region", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-395-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [regionTunnels, ratTunnels],
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
  const region = page.locator("#room-region");
  try {
    await createAndStart(page, server.url, "region-tunnels");
    assert.equal(await region.isVisible(), true);
    assert.equal(await region.textContent(), "Upper Tunnels");
    await clickAction(page, "move", "alcove");
    assert.equal(await region.textContent(), "Upper Tunnels");
    await clickAction(page, "move", "stair-foot");
    // The rat's cellar is in the lower tunnels; its fight begins.
    await clickAction(page, "move", "rat-cellar");
    assert.equal(await region.textContent(), "Lower Tunnels");
    assert.equal((await sessionFile(directory)).state.moves, 3);

    // A reload shows the same region.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.equal(await region.textContent(), "Lower Tunnels");
    assert.equal(await region.isVisible(), true);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
