import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { backdropTunnels } from "./fixtures/modules.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

/** The drawing selected for the current room, even when space is tight. */
const shown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#scene-backdrop svg")]
      .filter((svg) => !svg.hasAttribute("hidden"))
      .map((svg) => svg.dataset.backdrop),
  );

/** Measure the drawing against the actual rendered room and encounter. */
const measure = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector("#scene-backdrop svg:not([hidden])");
    const drawing = svg.getBoundingClientRect();
    const content = [...document.querySelectorAll("#session-scene > section")]
      .filter((panel) => panel.getClientRects().length)
      .map((panel) => panel.getBoundingClientRect().bottom);
    return {
      clearOfCards: drawing.top >= Math.max(...content) - 1,
      height: drawing.height,
      visible: getComputedStyle(svg).visibility === "visible",
    };
  });

test("the scene column shows the current room's backdrop, below its cards when space permits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "room-backdrop-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [backdropTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 1,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1880, height: 1000 },
  });
  page.setDefaultTimeout(5000);
  try {
    await createAndStart(page, server.url, "backdrop-tunnels");
    assert.deepEqual(await shown(page), ["cellar"]);
    const backdrop = page.locator("#scene-backdrop");
    assert.equal(await backdrop.getAttribute("aria-hidden"), "true");
    assert.equal(
      await backdrop.evaluate((node) => getComputedStyle(node).pointerEvents),
      "none",
    );
    const strength = await backdrop.evaluate((node) =>
      Number(getComputedStyle(node).opacity),
    );
    assert.ok(strength > 0 && strength <= 0.3);
    const shortRoom = await measure(page);
    assert.ok(
      shortRoom.clearOfCards && shortRoom.height >= 160 && shortRoom.visible,
    );

    // The alcove names its own; back in the upper tunnels, the cellar again.
    await clickAction(page, "move", "alcove");
    assert.deepEqual(await shown(page), ["forest"]);
    await clickAction(page, "move", "stair-foot");
    assert.deepEqual(await shown(page), ["cellar"]);
    // The rat's cellar is in the lower tunnels; its fight keeps the crypt.
    await clickAction(page, "move", "rat-cellar");
    assert.equal(await page.locator("#encounter").isVisible(), true);
    assert.deepEqual(await shown(page), ["crypt"]);
    assert.ok((await measure(page)).clearOfCards, "in a fight too");

    // A reload shows the same backdrop.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.deepEqual(await shown(page), ["crypt"]);

    // The layout holds at every width.
    for (const viewport of [
      { width: 1280, height: 850 },
      { width: 900, height: 560 },
    ]) {
      await page.setViewportSize(viewport);
      assert.deepEqual(await shown(page), ["crypt"]);
      const drawing = await measure(page);
      assert.ok(drawing.clearOfCards);
      assert.equal(drawing.visible, drawing.height >= 160);
      if (viewport.width === 900) {
        assert.equal(drawing.visible, false);
      }
      await assertNoSideScroll(
        page,
        `no horizontal scroll at ${viewport.width}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
