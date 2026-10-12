// #397, browser → API → storage: Ada heaves the winch in the Winch Tunnels'
// alcove, which raises the portcullis on the way from the stair foot down
// to the rat's cellar. The room panel shows the way closed until then and
// open after; the saved session holds the flag, and a reload keeps the way
// open.
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
import { ratTunnels, winchTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("Ada pulls a winch in one room, which opens a way in another, and it stays open after a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-397-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [winchTunnels, ratTunnels],
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
  const way = page.locator('#exits li[data-id="rat-cellar"] .route');
  try {
    await createAndStart(page, server.url, "winch-tunnels");
    // The portcullis is down: the way shows closed, and Go is refused.
    assert.equal(await way.textContent(), "The way is closed.");
    assert.equal(
      await actionButton(page, "move", "rat-cellar").isDisabled(),
      true,
    );

    await clickAction(page, "move", "alcove");
    await clickAction(page, "examine", "rusted-winch");
    assert.match(
      await page.locator("#log").textContent(),
      /The way between the Foot of the Stair and the Rat-Gnawed Cellar is open\./u,
    );
    assert.deepEqual((await sessionFile(directory)).state.flags, [
      "portcullis-raised",
    ]);
    await clickAction(page, "move", "stair-foot");
    assert.equal(await way.textContent(), "The way is open now.");

    // A reload keeps the way open, and Ada goes through.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.equal(await way.textContent(), "The way is open now.");
    await clickAction(page, "move", "rat-cellar");
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Rat-Gnawed Cellar",
    );
    assert.equal((await sessionFile(directory)).state.roomId, "rat-cellar");
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
