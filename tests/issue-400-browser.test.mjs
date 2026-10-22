// #400, browser → API → storage: Ada carries the Stone Snake from the
// alcove to the Stone Door at the foot of the stair. The door's row offers
// "Use Stone Snake" once she carries it; using it fits the carving, uses it
// up and opens the hidden way to the Snake Vault. The saved session holds
// the use, and a reload keeps the way open.
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
  settled,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels, snakeDoor } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("Ada carries the stone snake to the door, fits it, and the way stays open after a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-400-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [snakeDoor, ratTunnels],
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
  const use = actionButton(page, "use-on", "stone-door");
  const vault = page.locator('#exits li[data-id="vault"]');
  try {
    await createAndStart(page, server.url, "snake-door");
    // Without the snake, the door offers only Examine, and no way leads on.
    assert.equal(await use.count(), 0);
    assert.equal(await vault.count(), 0);

    await clickAction(page, "move", "alcove");
    await clickAction(page, "take", "stone-snake");
    await clickAction(page, "move", "stair-foot");
    // The door's card offers the snake, by name, beside Examine (#520).
    const row = page.locator('#features li[data-id="stone-door"]');
    assert.deepEqual(
      (await row.locator("button.act").allTextContents()).sort(),
      ["Examine", "Use Stone Snake"],
    );
    assert.equal(
      await use.getAttribute("aria-label"),
      "Use Stone Snake on Stone Door",
    );
    await settled(page, () => use.click());
    const log = await page.locator("#log").textContent();
    assert.match(
      log,
      /You use the Stone Snake on the Stone Door\. The carving fits the hollow\./u,
    );
    assert.match(log, /The Stone Snake is used up\./u);
    assert.equal(await use.count(), 0);
    assert.equal(
      await vault.locator(".route").textContent(),
      "A way you found.",
    );
    const saved = (await sessionFile(directory)).state;
    assert.deepEqual(saved.featureUses, [
      { featureId: "stone-door", itemId: "stone-snake" },
    ]);
    assert.equal(saved.inventory.includes("stone-snake"), false);

    // A reload keeps the way open, and Ada goes through.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.equal(
      await vault.locator(".route").textContent(),
      "A way you found.",
    );
    await clickAction(page, "move", "vault");
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Snake Vault",
    );
    assert.equal((await sessionFile(directory)).state.roomId, "vault");
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
